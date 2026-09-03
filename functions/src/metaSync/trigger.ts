// functions/src/metaSync/trigger.ts — Phase 14 Layer 2 manual "Sync Now"
// ═══════════════════════════════════════════════════════════
// PHASE 970 (BATCH 3): this callable is now a thin wrapper over the
// shared orchestrator (`metaSync/orchestrator.ts::runFullSync`), same
// pattern as `metaSyncPerformance`. LEG A + LEG B both run on every
// press — see investigation report §8.2.
//
// Batch 3 keeps the 1-hour cooldown; Batch 4 removes it. Both the
// dashboard button (`triggerMetaSync`, here) and the sidebar button
// (`metaSyncPerformance` in `index.ts`) share the same `runFullSync`
// orchestrator, so Batch 4 can rip the cooldown out of either
// wrapper with identical effect at the orchestrator level.
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { SYNC_DISPATCH_REGION } from "./dispatcher.js";
import { metaAppSecret } from "../secrets.js";
import {
    resolveMetaScope,
    assertWorkspaceAllowed,
} from "../workspaces/metaCallerScope.js";
import { getDb } from "../firestoreClient.js";
import { runFullSync } from "./orchestrator.js";

const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour — REMOVED in Batch 4

interface TriggerMetaSyncRequest {
    workspaceId: string;
}

export const triggerMetaSync = onCall(
    {
        region: SYNC_DISPATCH_REGION,
        cors: true,
        timeoutSeconds: 540,
        memory: "2GiB",
        // CRITICAL (Claude audit): the manual trigger decrypts the
        // legacy AES-GCM token via `decryptLegacyToken` (called inside
        // `runLegacySyncForOwner`). The secret MUST be declared here or
        // runtime decryption throws and the user sees a false
        // "reconnect Meta" prompt.
        secrets: [metaAppSecret],
    },
    async (request) => {
        // Universal preamble (FR-001, FR-003). All paths use
        // `scope.ownerUid`; a team member's manual sync writes under
        // the owner's account.
        const scope = await resolveMetaScope(request);
        const req = request.data as TriggerMetaSyncRequest;
        if (!req || typeof req.workspaceId !== "string" || req.workspaceId.length === 0) {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        // 1-hour cooldown — same gate as the pre-fix code. REMOVED in
        // Batch 4 alongside the dashboard's gate freeze.
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

        // PHASE 970 (BATCH 3) — orchestrator. LEG A runs inline
        // (account-global, pre-existing legacy writes to root
        // /adPerformance + /adPerformanceHistory). LEG B runs the
        // active workspace inline and the other live workspaces via
        // Cloud Tasks fan-out, de-duplicated by accountId.
        const result = await runFullSync({
            ownerUid: scope.ownerUid,
            callerUid: scope.callerUid,
            activeWorkspaceId: req.workspaceId,
            nowMs: Date.now(),
        });

        console.log(
            `🔄 Manual sync (owner=${scope.ownerUid}, caller=${scope.callerUid}, ` +
            `workspace=${req.workspaceId}, legacyAds=${result.legacy.adsSynced}, ` +
            `queued=${result.workspace.queued}, rateLimitedLegacy=[${result.legacy.rateLimited.join(",")}], ` +
            `rateLimitedQueued=[${result.workspace.rateLimited.join(",")}])`,
        );

        return {
            ok: result.ok,
            lastMetaSyncAt: result.lastMetaSyncAt,
            legacy: {
                adsSynced: result.legacy.adsSynced,
                accountsSynced: result.legacy.accountsSynced,
                rateLimited: result.legacy.rateLimited,
                errors: result.legacy.errors,
            },
            workspace: {
                inline: result.workspace.inline,
                queued: result.workspace.queued,
                rateLimited: result.workspace.rateLimited,
            },
            needsReauth: result.needsReauth,
        };
    },
);

async function readLastSyncAt(uid: string, workspaceId: string): Promise<number | null> {
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("private").doc("metaConnection")
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return typeof data.lastMetaSyncAt === "number" ? data.lastMetaSyncAt : null;
}
