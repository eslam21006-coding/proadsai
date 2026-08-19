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
    resolveMetaScope,
    assertWorkspaceAllowed,
} from "./workspaces/metaCallerScope.js";
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

interface UserLevelConnection {
    encryptedToken?: string;
    adAccounts?: Array<{ id?: string; name?: string; account_id?: string }>;
}

async function loadUserLevelConnection(uid: string): Promise<UserLevelConnection | null> {
    const snap = await getDb().collection("metaConnections").doc(uid).get();
    if (!snap.exists) return null;
    return snap.data() as UserLevelConnection;
}

// ─── connectMetaAccount ───────────────────────────────────────
//
// Phase 967 (FR-020, contract C11) — owner-scoped connection. The
// account-level OAuth credential lives at `metaConnections/{ownerUid}`,
// even when a team member authorised (Phase 5 T070-T072 makes the
// OAuth callback resolve to the owner). A team member invoking
// `connectMetaAccount` therefore reads the OWNER's connection record,
// not their own — exactly the FR-001 path. No team-member block
// exists anywhere in this flow.

interface ConnectMetaAccountRequest {
    workspaceId: string;
    accountId: string;
    accountName?: string;
}

export const connectMetaAccount = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        // Universal preamble (FR-001, FR-003). All workspace + connection
        // paths use `scope.ownerUid`; the caller (a team member) is
        // recorded in the audit log only.
        const scope = await resolveMetaScope(request);
        const req = request.data as ConnectMetaAccountRequest;
        if (!req || typeof req.workspaceId !== "string" || typeof req.accountId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId and accountId are required.");
        }
        if (req.workspaceId.length === 0 || req.accountId.length === 0) {
            throw new HttpsError("invalid-argument", "workspaceId and accountId must be non-empty.");
        }

        // FR-004 / FR-021 — workspace authorisation first, before any side effect.
        assertWorkspaceAllowed(scope, req.workspaceId);

        // Read the long-lived token from the OWNER's user-level OAuth
        // doc. The OAuth callback writes to `metaConnections/{ownerUid}`
        // (Phase 5 T070-T072) — a team member's authorisation therefore
        // lands on the owner's record, and `connectMetaAccount` reads
        // from the same place. Reading `metaConnections/{callerUid}`
        // would be empty for a team member and reject every connection
        // attempt (the bug this phase fixes).
        const userConn = await loadUserLevelConnection(scope.ownerUid);
        if (!userConn || !userConn.encryptedToken) {
            throw new HttpsError(
                "failed-precondition",
                "Connect your Meta account via OAuth before linking it to a workspace.",
            );
        }

        // Build the write payloads outside the transaction so the
        // transaction body stays small and the failure paths are
        // explicit (CodeRabbit review feedback).
        const accountName = req.accountName ?? "";
        const now = Date.now();
        const wsRef = getDb()
            .collection("users").doc(scope.ownerUid)
            .collection("workspaces").doc(req.workspaceId);
        const privateRef = privateConnectionRef(scope.ownerUid, req.workspaceId);
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

        // CR-CRITICAL: read the workspace + every sibling workspace, then
        // write both docs (private connection + workspace link) inside a
        // single Firestore transaction. This closes the 1:1 enforcement
        // race where two concurrent `connectMetaAccount` calls could both
        // pass a non-transactional uniqueness check and both commit the
        // link (CodeRabbit review feedback).
        //
        // - The workspace existence check rejects a non-existent
        //   workspaceId with `not-found` BEFORE any writes.
        // - The 1:1 check re-runs inside the transaction against every
        //   sibling workspace, so any concurrent caller that committed
        //   first causes this transaction to fail with `failed-precondition`.
        // - Both writes commit atomically — a half-applied state would
        //   leave the 1:1 scan reporting inconsistent results on the
        //   next call.
        try {
            await getDb().runTransaction(async (tx) => {
                const wsSnap = await tx.get(wsRef);
                if (!wsSnap.exists) {
                    throw new HttpsError("not-found", "Workspace not found.");
                }
                const wsData = wsSnap.data() ?? {};

                // FIX 6 (Claude audit, FR-026 direction (a)): prevent
                // the user from silently replacing workspace W's
                // account A with account B. Without this check, the
                // existing `linkMetaAccountToWorkspace` would overwrite
                // the link and the 1:1 enforcement would be bypassed.
                // The user MUST disconnect first.
                const wsAccountId = typeof wsData.metaAdAccountId === "string" && wsData.metaAdAccountId.length > 0
                    ? wsData.metaAdAccountId
                    : null;
                if (wsAccountId && wsAccountId !== req.accountId) {
                    throw new HttpsError(
                        "failed-precondition",
                        "هذه المساحة مرتبطة بحساب إعلاني آخر. افصله أولاً قبل ربط حساب جديد.",
                    );
                }

                // 1:1 enforcement — the same ad account cannot be
                // linked to two workspaces owned by the same user.
                // Re-check INSIDE the transaction so a concurrent
                // caller that committed first is observed.
                const rebind = !wsAccountId || wsAccountId !== req.accountId;
                if (rebind) {
                    const siblingsSnap = await tx.get(
                        getDb().collection("users").doc(scope.ownerUid).collection("workspaces"),
                    );
                    for (const sib of siblingsSnap.docs) {
                        if (sib.id === req.workspaceId) continue;
                        const sibData = sib.data() ?? {};
                        const sibAccountId = typeof sibData.metaAdAccountId === "string" && sibData.metaAdAccountId.length > 0
                            ? sibData.metaAdAccountId
                            : null;
                        if (sibAccountId === req.accountId) {
                            throw new HttpsError(
                                "failed-precondition",
                                "هذا الحساب الإعلاني مربوط بـ workspace آخر بالفعل. افصله أولاً.",
                            );
                        }
                    }
                }

                // Atomic commit inside the same transaction.
                tx.set(privateRef, privatePayload, { merge: true });
                tx.update(wsRef, workspacePayload);
            });
        } catch (err: unknown) {
            if (err instanceof HttpsError) throw err;
            // Transaction-level failures (network, lock timeout, etc.)
            // surface as `internal` so the client can retry.
            throw new HttpsError(
                "internal",
                `Failed to link the Meta account: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        console.log(`🔗 Meta account linked to workspace (owner=${scope.ownerUid}, caller=${scope.callerUid}, workspace=${req.workspaceId}, account=${req.accountId})`);
        return {
            ok: true as const,
            metaConnected: true,
            accountId: req.accountId,
        };
    },
);

// ─── disconnectMetaAccount ────────────────────────────────────
//
// Phase 967 (FR-001) — owner-scoped workspace disconnect. The OAuth
// credential stays under `metaConnections/{ownerUid}` (the connect
// path lands it there); this callable clears the workspace-private
// mirror and the workspace-link. The actor is recorded in the
// console line below for audit.

interface DisconnectMetaAccountRequest {
    workspaceId: string;
}

export const disconnectMetaAccount = onCall(
    { region: "europe-west1", cors: true },
    async (request) => {
        // Universal preamble (FR-001, FR-003).
        const scope = await resolveMetaScope(request);
        const req = request.data as DisconnectMetaAccountRequest;
        if (!req || typeof req.workspaceId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        const now = Date.now();
        const wsRef = getDb()
            .collection("users").doc(scope.ownerUid)
            .collection("workspaces").doc(req.workspaceId);
        const privateRef = privateConnectionRef(scope.ownerUid, req.workspaceId);

        // CR-CRITICAL: validate the workspace exists, then clear both
        // the private connection doc and the workspace link inside a
        // single Firestore transaction. A non-existent workspaceId
        // returns `not-found` BEFORE any writes. A transaction failure
        // means neither write lands — the function cannot return
        // `ok: true` after a partial write (CodeRabbit review
        // feedback).
        //
        // Performance data and aggregates stay untouched — the
        // adPerformance / syncSnapshots / aggregates subcollections
        // are intentionally retained (Edge Case 15).
        try {
            await getDb().runTransaction(async (tx) => {
                const wsSnap = await tx.get(wsRef);
                if (!wsSnap.exists) {
                    throw new HttpsError("not-found", "Workspace not found.");
                }
                tx.set(privateRef, {
                    metaConnected: false,
                    legacyToken: null,
                    encryptedToken: null,
                    needsReauth: false,
                    updatedAt: now,
                }, { merge: true });
                tx.update(wsRef, {
                    metaAdAccountId: null,
                    metaAdAccountName: null,
                    metaRoleAtLinkTime: null,
                });
            });
        } catch (err: unknown) {
            if (err instanceof HttpsError) throw err;
            throw new HttpsError(
                "internal",
                `Failed to disconnect: ${err instanceof Error ? err.message : String(err)}`,
            );
        }

        console.log(`🔌 Workspace Meta link disconnected (owner=${scope.ownerUid}, caller=${scope.callerUid}, workspace=${req.workspaceId})`);
        return { ok: true as const, disconnectedByUid: scope.callerUid };
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
        currency: string | null;
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
    if (Object.prototype.hasOwnProperty.call(patch, "currency")) {
        update.currency = patch.currency;
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
