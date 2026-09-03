// functions/src/metaSync/worker.ts — Phase 14 Layer 2 task-dispatched worker
// ═══════════════════════════════════════════════════════════
// One task = one account. Triggered by the dispatcher (3am daily) OR by
// `triggerMetaSync` (manual). Runs the shared sync body (`shared.ts`) and
// returns success/error to Cloud Tasks for retry accounting.
//
// Retry config (set at queue creation, INFRASTRUCTURE_SETUP.md §T002):
//   - maxAttempts: 3
//   - maxConcurrentDispatches: 5 (concurrency cap)
//
// Failure handling:
//   - Throwing → Cloud Tasks retries with exponential backoff.
//   - Permanent failure (e.g. token expired → needsReauth): we throw so
//     the retry happens, but we ALSO mark needsReauth so the next sync
//     shows the re-auth prompt instead of looping forever.
// ═══════════════════════════════════════════════════════════

import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { runSyncForAccount, type SyncResult } from "./shared.js";
import { SYNC_DISPATCH_REGION } from "./dispatcher.js";
import { metaAppSecret } from "../secrets.js";

interface SyncTaskPayload {
    userId: string;
    workspaceId: string;
    accountId: string;
    trigger: "scheduled" | "manual";
    nowMs: number;
}

export const metaSyncAccountWorker = onTaskDispatched(
    {
        retryConfig: {
            maxAttempts: 3,
            minBackoffSeconds: 30,
            maxBackoffSeconds: 600,
        },
        rateLimits: {
            maxConcurrentDispatches: 5,
        },
        region: SYNC_DISPATCH_REGION,
        timeoutSeconds: 540,
        memory: "2GiB",
        // CRITICAL (Claude audit): the worker decrypts the legacy AES-GCM
        // Meta token via `decryptLegacyToken`, which reads META_APP_SECRET
        // from the runtime env. Cloud Functions only injects secrets that
        // are declared in the function options — without this, every sync
        // throws "META_APP_SECRET not configured" and the UI shows a false
        // "reconnect Meta" prompt.
        secrets: [metaAppSecret],
    },
    async (req) => {
        const payload = req.data as SyncTaskPayload;
        if (!payload
            || typeof payload.userId !== "string"
            || typeof payload.workspaceId !== "string"
            || typeof payload.accountId !== "string") {
            throw new Error("metaSyncAccountWorker: missing required fields in payload");
        }

        const result: SyncResult = await runSyncForAccount({
            userId: payload.userId,
            workspaceId: payload.workspaceId,
            accountId: payload.accountId,
            trigger: payload.trigger || "scheduled",
            nowMs: typeof payload.nowMs === "number" ? payload.nowMs : Date.now(),
        });

        // PHASE 970 (BATCH 5) — first-successful-Phase-14-run evidence
        // for the FANNED-OUT leg. Each Cloud Tasks task emits this
        // log line server-side, indexed under the deployed
        // `function_name="metaSyncAccountWorker"`. The on-call
        // engineer's runbook query (see POST_DEPLOY_RUNBOOK.md §4)
        // matches THIS line, not the one inside `runFullSync`.
        //
        // One log per fanned-out workspace — every workspace's
        // counts land in Cloud Logging, which is the load-bearing
        // property the user called out. The browser-side
        // `console.log` in `App.tsx` is for the inline workspace
        // only; the fan-out workspaces never touch the browser, so
        // this server-side log is the only evidence the on-call
        // engineer has for them.
        console.log(
            "📊 [Batch 5] First-successful-Phase-14-run evidence (fanned-out worker):",
            JSON.stringify({
                ownerUid: payload.userId,
                workspaceId: payload.workspaceId,
                accountId: payload.accountId,
                trigger: payload.trigger || "scheduled",
                ok: result.ok,
                status: result.status,
                counts: {
                    ads: result.counts.ads,
                    matched: result.counts.matched,
                    ambiguous: result.counts.ambiguous,
                    unmatched: result.counts.unmatched,
                },
                errorCount: result.errors.length,
            }),
        );

        if (!result.ok) {
            // Throw so Cloud Tasks retries (up to maxAttempts).
            // The sync body has already marked the connection as needsReauth
            // when appropriate — the retry will re-attempt token refresh.
            throw new Error(`metaSyncAccountWorker: sync failed (${result.errors.slice(0, 3).join("; ")})`);
        }
        // Success — no result payload needed (Tasks discards it).
    },
);
