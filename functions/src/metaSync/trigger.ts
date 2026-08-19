// functions/src/metaSync/trigger.ts — Phase 14 Layer 2 manual "Sync Now"
// ═══════════════════════════════════════════════════════════
// Callable that runs the same sync body for the calling user's workspace.
// Enforces a 1-hour cooldown after the last sync (contract:
// metaSyncAndConnection.md) — the frontend greys the button accordingly
// but the server is the authoritative gate.
//
// We deliberately call `runSyncForAccount` directly (instead of enqueuing
// a Cloud Task) for manual sync — the user is waiting for the response and
// the volume is one account.
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { runSyncForAccount, type SyncResult } from "./shared.js";
import { loadStoredConnection } from "../metaConnection.js";
import { SYNC_DISPATCH_REGION } from "./dispatcher.js";
import { metaAppSecret } from "../secrets.js";
import {
  resolveMetaScope,
  assertWorkspaceAllowed,
} from "../workspaces/metaCallerScope.js";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

interface TriggerMetaSyncRequest {
    workspaceId: string;
}

export const triggerMetaSync = onCall(
    {
        region: SYNC_DISPATCH_REGION,
        cors: true,
        timeoutSeconds: 540,
        memory: "2GiB",
        // CRITICAL (Claude audit): the manual trigger decrypts the legacy
        // AES-GCM token via `decryptLegacyToken`. The secret MUST be
        // declared here or runtime decryption throws and the user sees a
        // false "reconnect Meta" prompt.
        secrets: [metaAppSecret],
    },
    async (request) => {
        // Universal preamble (FR-001, FR-003). All paths use
        // `scope.ownerUid`; a team member's manual sync writes under
        // the owner's account.
        const scope = await resolveMetaScope(request);
        const req = request.data as TriggerMetaSyncRequest;
        if (!req || typeof req.workspaceId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        const conn = await loadStoredConnection(scope.ownerUid, req.workspaceId);
        if (!conn || !conn.accountId) {
            throw new HttpsError("failed-precondition", "No Meta account connected for this workspace.");
        }

        // 1-hour cooldown — measured against lastMetaSyncAt on the connection
        // doc (loadStoredConnection doesn't surface it, so re-fetch below).
        const lastSyncAt = await readLastSyncAt(scope.ownerUid, req.workspaceId);
        if (typeof lastSyncAt === "number") {
            const elapsed = Date.now() - lastSyncAt;
            if (elapsed < COOLDOWN_MS) {
                const remainingMs = COOLDOWN_MS - elapsed;
                throw new HttpsError(
                    "resource-exhausted",
                    `Sync cooldown active — try again in ${Math.ceil(remainingMs / 60_000)} minutes.`,
                );
            }
        }

        const result: SyncResult = await runSyncForAccount({
            userId: scope.ownerUid,
            workspaceId: req.workspaceId,
            accountId: conn.accountId,
            trigger: "manual",
            nowMs: Date.now(),
        });

        if (!result.ok && result.status === "failed" && result.needsReauth) {
            throw new HttpsError(
                "failed-precondition",
                "اتصالك بميتا انتهى — وصّل تاني",
            );
        }

        console.log(`🔄 Manual sync (owner=${scope.ownerUid}, caller=${scope.callerUid}, workspace=${req.workspaceId})`);
        return {
            ok: result.ok,
            status: result.status,
            lastMetaSyncAt: result.lastMetaSyncAt,
            counts: result.counts,
            errors: result.errors.slice(0, 10),
            needsReauth: result.needsReauth,
        };
    },
);

async function readLastSyncAt(uid: string, workspaceId: string): Promise<number | null> {
    const { getDb } = await import("../firestoreClient.js");
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("private").doc("metaConnection")
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return typeof data.lastMetaSyncAt === "number" ? data.lastMetaSyncAt : null;
}
