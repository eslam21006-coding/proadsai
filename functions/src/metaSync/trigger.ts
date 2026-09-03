// functions/src/metaSync/trigger.ts — Phase 14 Layer 2 manual "Sync Now"
// ═══════════════════════════════════════════════════════════
// PHASE 970 (BATCH 3): this callable is a thin wrapper over the
// shared orchestrator (`metaSync/orchestrator.ts::runFullSync`),
// same pattern as `metaSyncPerformance`. LEG A + LEG B both run on
// every press — see investigation report §8.2.
//
// PHASE 970 (BATCH 4): the 1-hour cooldown that lived here
// pre-Batch-4 is GONE. The state-based in-flight guard
// (`lease.js`) now blocks a second concurrent press — see
// investigation §6 and Batch-4-report §2. The translation of
// `AlreadyRunningError` to a Cloud Functions HttpsError is below
// (manual press path; scheduled / task-dispatched paths let the
// error propagate so the existing task retry config can handle
// rescheduling).
// ═══════════════════════════════════════════════════════════

import { onCall, HttpsError } from "firebase-functions/v2/https";
import { SYNC_DISPATCH_REGION } from "./dispatcher.js";
import { metaAppSecret } from "../secrets.js";
import {
    resolveMetaScope,
    assertWorkspaceAllowed,
} from "../workspaces/metaCallerScope.js";
import { runFullSyncWithLease } from "./orchestrator.js";
import { AlreadyRunningError } from "./lease.js";

interface TriggerMetaSyncRequest {
    workspaceId: string;
}

export const triggerMetaSync = onCall(
    {
        region: SYNC_DISPATCH_REGION,
        cors: true,
        timeoutSeconds: 540,
        memory: "2GiB",
        secrets: [metaAppSecret],
    },
    async (request) => {
        // Universal preamble (FR-001, FR-003). All paths use
        // `scope.ownerUid`; a team member's manual sync writes
        // under the owner's account.
        const scope = await resolveMetaScope(request);
        const req = request.data as TriggerMetaSyncRequest;
        if (!req || typeof req.workspaceId !== "string" || req.workspaceId.length === 0) {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }

        // FR-004 / FR-021 — workspace authorisation first.
        assertWorkspaceAllowed(scope, req.workspaceId);

        // PHASE 970 (BATCH 4) — orchestrator + lease. The
        // 1-hour cooldown that used to gate this callable is gone;
        // the in-flight guard inside `runFullSyncWithLease` blocks
        // a second concurrent press for the same account.
        try {
            const result = await runFullSyncWithLease({
                ownerUid: scope.ownerUid,
                callerUid: scope.callerUid,
                activeWorkspaceId: req.workspaceId,
                nowMs: Date.now(),
            });

            // PHASE 970 (bug 2026-09-03) — if the requested
            // workspace has no Meta connection, the inline run is
            // null and runLegacySyncForOwner returned ok=false.
            // Returning ok=true with queued=0 would report a
            // successful no-op press to the dashboard, which the
            // user sees as "Sync Now pressed successfully" for a
            // press that did nothing. Throw failed-precondition so
            // the dashboard surfaces the real reason. (The legacy
            // LEG-A error is already in result.legacy.errors; the
            // message below is the dashboard's toast, not a
            // duplication of the ledger.)
            if (!result.workspace.inline && !result.ok) {
                const legacyErr =
                    result.legacy.errors.length > 0
                        ? result.legacy.errors[0]
                        : "No Meta account connected for this workspace.";
                throw new HttpsError("failed-precondition", legacyErr);
            }

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
        } catch (e: unknown) {
            if (e instanceof AlreadyRunningError) {
                // Manual press path — fail fast and tell the owner
                // with a plain message in their language. They are
                // present and can retry; a hanging call is worse
                // than a clear answer.
                throw new HttpsError(
                    "failed-precondition",
                    "A Meta sync is already running for this account. Please wait a moment and try again.",
                );
            }
            throw e;
        }
    },
);
