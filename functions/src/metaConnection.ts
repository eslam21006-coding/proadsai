// functions/src/metaConnection.ts — Phase 14 Layer 2 Meta connection callables
// ═══════════════════════════════════════════════════════════
// Server-only entry points that bind a Meta ad account to a workspace and
// store the long-lived access token encrypted at rest.
//
// DATA LAYOUT (data-model §8):
//   users/{uid}/workspaces/{workspaceId}/private/metaConnection
//     - metaConnected: true|false
//     - accountId: string
//     - accountName?: string
//     - encryptedToken: EncryptedEnvelope (KMS envelope encryption)
//     - tokenExpiresAt: epoch ms (for proactive refresh, FR-009)
//     - needsReauth: boolean (set on refresh failure)
//     - lastMetaSyncAt: epoch ms
//     - lastSyncStatus: 'ok'|'partial'|'failed'
//
// The CALLABLE bridges from the existing user-level `metaConnections/{uid}`
// (which the OAuth callback populates) to the workspace-scoped private doc
// required by Phase 14. We re-encrypt the token via `tokenCrypto.ts` (KMS
// envelope encryption per research §C) instead of the older AES-256-GCM
// helper. The existing `metaPushCreative` / `metaPushCreativePack` continue
// to use the user-level doc — that's a separate auth surface and is out of
// scope here.
//
// 1:1 ENFORCEMENT (FR-026):
//   - A workspace can only have ONE connected account at a time.
//   - An ad account can only be connected to ONE workspace per user.
//   - Conflicts return `failed-precondition` with a plain-Arabic reason.
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getDb } from "./firestoreClient.js";
import {
    parseEnvelope,
} from "./tokenCrypto.js";

// ─── Internal helpers ─────────────────────────────────────────

function privateConnectionRef(uid: string, workspaceId: string) {
    return getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("private").doc("metaConnection");
}

interface WorkspaceMetaAccountId {
    accountId: string | null;
    accountName: string | null;
}

async function loadWorkspaceLink(uid: string, workspaceId: string): Promise<WorkspaceMetaAccountId> {
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .get();
    if (!snap.exists) return { accountId: null, accountName: null };
    const data = snap.data() || {};
    return {
        accountId: typeof data.metaAdAccountId === "string" && data.metaAdAccountId.length > 0
            ? data.metaAdAccountId
            : null,
        accountName: typeof data.metaAdAccountName === "string"
            ? data.metaAdAccountName
            : null,
    };
}

interface UserLevelConnection {
    encryptedToken?: string;
    adAccounts?: Array<{ id?: string; name?: string; account_id?: string }>;
}

async function loadUserLevelConnection(uid: string): Promise<UserLevelConnection | null> {
    const snap = await getDb().collection("metaConnections").doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as UserLevelConnection;
}

/**
 * Scan every workspace of the user to see if the same `accountId` is already
 * linked somewhere else. Returns the offending workspace id, or null.
 *
 * We scan one read per workspace — bounded since a user has at most a small
 * number of workspaces (single-digit). For very large workspace counts we'd
 * add an index, but the data-model scope says one ad account per workspace.
 */
async function findWorkspaceLinkedToAccount(uid: string, accountId: string): Promise<string | null> {
    const workspacesSnap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces")
        .get();
    for (const ws of workspacesSnap.docs) {
        const data = ws.data() || {};
        const linked = typeof data.metaAdAccountId === "string" ? data.metaAdAccountId : null;
        if (linked === accountId) return ws.id;
    }
    return null;
}

// ─── connectMetaAccount ───────────────────────────────────────

interface ConnectMetaAccountRequest {
    workspaceId: string;
    accountId: string;
    accountName?: string;
}

export const connectMetaAccount = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as ConnectMetaAccountRequest;
        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (req.workspaceId.length === 0 || req.accountId.length === 0) {
            throw new HttpsError("invalid-argument", "workspaceId and accountId must be non-empty.");
        }

        // Verify the workspace exists.
        const wsSnap = await getDb()
            .collection("users").doc(uid)
            .collection("workspaces").doc(req.workspaceId)
            .get();
        if (!wsSnap.exists) {
            throw new HttpsError("not-found", "Workspace not found.");
        }

        // Verify the workspace is currently linked to the same account
        // (this is the path `linkMetaAccountToWorkspace` takes). If not,
        // we still proceed — the connect call also acts as a bind.
        const wsLink = await loadWorkspaceLink(uid, req.workspaceId);

        // FIX 6 (Claude audit, FR-026 direction (a)): prevent the user
        // from silently replacing workspace W's account A with account B.
        // Without this check, the existing `linkMetaAccountToWorkspace`
        // would overwrite the link and the 1:1 enforcement would be
        // bypassed. The user MUST disconnect first.
        if (wsLink.accountId && wsLink.accountId !== req.accountId) {
            throw new HttpsError(
                "failed-precondition",
                "هذه المساحة مرتبطة بحساب إعلاني آخر. افصله أولاً قبل ربط حساب جديد.",
            );
        }

        // 1:1 enforcement — the same ad account cannot be linked to two
        // workspaces owned by the same user.
        if (!wsLink.accountId || wsLink.accountId !== req.accountId) {
            // We're about to (re)bind. Check no OTHER workspace holds it.
            const otherWs = await findWorkspaceLinkedToAccount(uid, req.accountId);
            if (otherWs && otherWs !== req.workspaceId) {
                throw new HttpsError(
                    "failed-precondition",
                    "هذا الحساب الإعلاني مربوط بـ workspace آخر بالفعل. افصله أولاً.",
                );
            }
        }

        // Read the long-lived token from the user-level OAuth doc.
        const userConn = await loadUserLevelConnection(uid);
        if (!userConn || !userConn.encryptedToken) {
            throw new HttpsError(
                "failed-precondition",
                "Connect your Meta account via OAuth before linking it to a workspace.",
            );
        }
        // The user-level doc stores the token encrypted with the legacy
        // AES-256-GCM helper. For Phase 14 we re-encrypt via KMS so the
        // workspace-scoped private doc carries a self-contained ciphertext.
        // The actual re-encryption of the plaintext requires the legacy
        // helper to decrypt first — but that helper lives in index.ts.
        // To keep metaConnection.ts self-contained, we accept the legacy
        // ciphertext and store it wrapped in a v=1 envelope whose
        // `ciphertext` field carries the legacy payload (base64). The
        // worker uses `loadEncryptedTokenForSync()` which understands the
        // legacy format directly.
        //
        // The user-passed token string would be a re-encryption path that
        // requires the legacy decrypt + KMS encrypt round-trip. For now,
        // the worker reads the user-level doc (also) and prefers the most
        // recent of (workspace-private, user-level) — see metaSync/shared.ts.
        // This avoids coupling the connection flow to the legacy AES path.

        // Write the workspace-scoped private doc. `encryptedToken` here
        // carries the legacy ciphertext (which the worker can still
        // decrypt via the legacy helper). When KMS migration completes,
        // switch `encryptedToken` to a true KMS envelope.
        const accountName = req.accountName ?? wsLink.accountName ?? "";
        const now = Date.now();
        const privateRef = privateConnectionRef(uid, req.workspaceId);
        const privatePayload = {
            metaConnected: true,
            accountId: req.accountId,
            accountName,
            // Legacy ciphertext retained as a base64 string; the worker
            // knows how to decrypt it. Storing under `legacyToken` until
            // KMS migration finishes.
            legacyToken: userConn.encryptedToken,
            tokenSource: "legacy_aes_gcm",
            needsReauth: false,
            lastMetaSyncAt: null,
            lastSyncStatus: null,
            createdAt: now,
            updatedAt: now,
        };
        const workspacePayload = {
            metaAdAccountId: req.accountId,
            metaAdAccountName: accountName,
        };

        // Atomic commit: a single WriteBatch ensures the private connection
        // doc and the workspace link land together — a half-applied state
        // would leave the 1:1 scan in `findWorkspaceLinkedToAccount`
        // reporting inconsistent results.
        const batch = getDb().batch();
        batch.set(privateRef, privatePayload, { merge: true });
        batch.update(wsSnap.ref, workspacePayload);
        await batch.commit();

        return {
            ok: true as const,
            metaConnected: true,
            accountId: req.accountId,
        };
    },
);

// ─── disconnectMetaAccount ────────────────────────────────────

interface DisconnectMetaAccountRequest {
    workspaceId: string;
}

export const disconnectMetaAccount = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as DisconnectMetaAccountRequest;
        if (!req || typeof req.workspaceId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }
        const now = Date.now();
        const privateRef = privateConnectionRef(uid, req.workspaceId);

        // Delete the token and mark disconnected, but RETAIN performance
        // data and aggregates (Edge Case 15). The adPerformance /
        // syncSnapshots / aggregates subcollections stay untouched.
        // Clear BOTH legacy (AES) and KMS envelope token fields so a stale
        // loadStoredConnection call cannot hydrate a token post-disconnect.
        await privateRef.set({
            metaConnected: false,
            legacyToken: null,
            encryptedToken: null,
            needsReauth: false,
            updatedAt: now,
        }, { merge: true });

        // Clear the workspace-doc link too (mirrors `unlinkMetaAccountFromWorkspace`).
        const wsRef = getDb()
            .collection("users").doc(uid)
            .collection("workspaces").doc(req.workspaceId);
        await wsRef.update({
            metaAdAccountId: null,
            metaAdAccountName: null,
            metaRoleAtLinkTime: null,
        }).catch(() => {
            // Workspace may not exist — non-fatal here.
        });

        return { ok: true as const };
    },
);

// ─── Encrypted token reader (used by the worker) ──────────────

/**
 * Read the encrypted token stored for a workspace. Returns the legacy AES
 * ciphertext (base64 string) OR a parsed KMS envelope — the worker unwraps
 * whichever it is.
 *
 * Returns `null` when no token is stored (workspace not connected) — the
 * worker then marks the account as `needsReauth`.
 */
export interface StoredConnection {
    accountId: string;
    accountName: string | null;
    legacyToken: string | null;       // AES-256-GCM from user-level metaConnections
    encryptedToken: EncryptedEnvelopeShape | null;  // KMS envelope (future)
    tokenExpiresAt: number | null;
    needsReauth: boolean;
}

export interface EncryptedEnvelopeShape {
    v: 1;
    ciphertext: string;
    keyResource: string;
    wrappedKey?: string;
}

export async function loadStoredConnection(uid: string, workspaceId: string): Promise<StoredConnection | null> {
    const snap = await privateConnectionRef(uid, workspaceId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    if (data.metaConnected !== true) return null;
    const legacyToken = typeof data.legacyToken === "string" ? data.legacyToken : null;
    let encryptedToken: EncryptedEnvelopeShape | null = null;
    if (typeof data.encryptedToken === "string" && data.encryptedToken.length > 0) {
        // Parse defensively — the worker may receive older shapes.
        try {
            encryptedToken = parseEnvelope(data.encryptedToken);
        } catch {
            encryptedToken = null;
        }
    }
    return {
        accountId: typeof data.accountId === "string" ? data.accountId : "",
        accountName: typeof data.accountName === "string" ? data.accountName : null,
        legacyToken,
        encryptedToken,
        tokenExpiresAt: typeof data.tokenExpiresAt === "number" ? data.tokenExpiresAt : null,
        needsReauth: data.needsReauth === true,
    };
}

/**
 * Update the workspace-scoped connection doc (e.g. after a refresh, or to
 * set `needsReauth=true` on failure). Pass the fields you want to overwrite.
 */
export async function patchStoredConnection(
    uid: string,
    workspaceId: string,
    patch: Partial<{
        legacyToken: string | null;
        encryptedToken: string | null;
        tokenExpiresAt: number | null;
        needsReauth: boolean;
        lastMetaSyncAt: number;
        lastSyncStatus: "ok" | "partial" | "failed";
    }>,
): Promise<void> {
    const ref = privateConnectionRef(uid, workspaceId);
    const update: Record<string, unknown> = { updatedAt: Date.now() };
    if (Object.prototype.hasOwnProperty.call(patch, "legacyToken")) {
        update.legacyToken = patch.legacyToken;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "encryptedToken")) {
        update.encryptedToken = patch.encryptedToken;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "tokenExpiresAt")) {
        update.tokenExpiresAt = patch.tokenExpiresAt;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "needsReauth")) {
        update.needsReauth = patch.needsReauth;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "lastMetaSyncAt")) {
        update.lastMetaSyncAt = patch.lastMetaSyncAt;
    }
    if (Object.prototype.hasOwnProperty.call(patch, "lastSyncStatus")) {
        update.lastSyncStatus = patch.lastSyncStatus;
    }
    await ref.set(update, { merge: true });
}

// ─── Token refresh wiring (DEFERRED) ───────────────────────────
//
// TODO Phase 14 follow-up: wire KMS envelope encryption via tokenCrypto.ts
// to replace legacy AES-GCM. The tokenCrypto module is built and tested
// (see functions/src/__tests__/tokenCrypto.test.ts) but NOT yet wired into
// the connect/sync flow. For now the connection flow copies the existing
// AES-encrypted token (under `legacyToken`); the worker decrypts it via
// `metaSync/legacyToken.ts`. The KMS path becomes active once this
// function replaces the copy. See report §"Deferred Items".

export async function reencryptAndStoreToken(
    uid: string,
    workspaceId: string,
    plaintextToken: string,
    expiresAt: number | null,
): Promise<void> {
    // TODO Phase 14 follow-up: KMS envelope encryption via tokenCrypto.ts.
    // For now the function is a no-op — the legacy AES path is the
    // source of truth (see report §"Deferred Items" — KMS adoption).
    void uid;
    void workspaceId;
    void plaintextToken;
    void expiresAt;
    throw new Error(
        "reencryptAndStoreToken: KMS adoption is deferred. " +
        "The legacy AES path is currently in use; see report §Deferred Items.",
    );
}
