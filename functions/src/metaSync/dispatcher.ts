// functions/src/metaSync/dispatcher.ts — Phase 14 Layer 2 scheduled dispatcher
// ═══════════════════════════════════════════════════════════
// 3am UTC daily dispatcher. Finds every workspace with a connected Meta ad
// account and enqueues ONE Cloud Task per account. The worker
// (`functions/src/metaSync/worker.ts`) processes each task independently —
// fan-out isolates failures, retries are bounded by Cloud Tasks config
// (maxAttempts: 3, maxConcurrentDispatches: 5 — see INFRASTRUCTURE_SETUP.md
// §T002).
//
// The dispatcher's ONLY job is to discover connected accounts and enqueue.
// It does NOT fetch data itself (research §B).
//
// PHASE 970 (BATCH 2) — D3 / D4 / discovery fix:
//   - D3: depends on the COLLECTION_GROUP_ASC field-override for
//     `private.metaConnected` in firestore.indexes.json. Without that
//     override, this query throws FAILED_PRECONDITION nightly (the
//     3 documented nightly failures in investigation §1.1).
//   - D4: the task body is wrapped in `{ data: { … } }` so the worker's
//     `req.data` reads it. Pre-fix the body was sent bare and the
//     worker threw "missing required fields in payload" on every task.
//   - Discovery filter: `listConnectedAccounts` now skips soft-deleted
//     workspaces (`deletedAt != null` on the parent workspace doc) and
//     de-duplicates by `accountId` so the same Meta ad account linked
//     to two workspaces (today's `act_781389063661831` is linked to
//     "Eslam Salah" and "Manar") does not produce two duplicate syncs.
// ═══════════════════════════════════════════════════════════

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getTasksClient } from "./tasksClient.js";
import { getDb } from "../firestoreClient.js";
import { metaAppSecret } from "../secrets.js";

export const META_SYNC_QUEUE = "metaSyncQueue";
export const WORKER_PATH = "metaSyncAccountWorker";
export const SYNC_DISPATCH_REGION = "europe-west1";
export const MAX_DISPATCH_PER_RUN = 500;

export interface DispatchedAccount {
    userId: string;
    workspaceId: string;
    accountId: string;
}

/**
 * List every workspace whose `private/metaConnection.metaConnected === true`.
 * Implementation note: `private` is the shared collection ID across the
 * `users/{uid}/workspaces/{wid}/private/` subcollection. The doc ID inside
 * it is `metaConnection`. We use a `collectionGroup('private')` query.
 *
 * PHASE 970 (BATCH 2):
 *   - Skips soft-deleted workspaces (parent workspace doc has
 *     `deletedAt != null`). Today's `dueXIiFdEJKuAjSuYlUX` is
 *     soft-deleted (investigation report §1.4) and was being picked up
 *     despite having no live UI access.
 *   - De-duplicates by `accountId` — one account linked to two
 *     workspaces (today's `act_781389063661831` is on both "Eslam
 *     Salah" and "Manar", investigation report §3) was producing two
 *     duplicate syncs per night. The first workspace encountered wins;
 *     the second is silently dropped.
 *
 * Pagination: if the result hits `MAX_DISPATCH_PER_RUN`, we log a warning.
 * At the scale we expect for v1 this is well under the cap; the cap is a
 * safety net rather than a hard limit. A future iteration can persist a
 * cursor between invocations if the cap is ever approached.
 *
 * Exported so the contract test (`metaSyncDispatch.test.ts`) can drive
 * discovery directly with an in-memory Firestore stub, mirroring the
 * pattern used by `metaSyncOrchestrator.test.ts` (Batch 3).
 */
export async function listConnectedAccounts(): Promise<DispatchedAccount[]> {
    const out: DispatchedAccount[] = [];
    const seenAccounts = new Set<string>();
    const snap = await getDb()
        .collectionGroup("private")
        .where("metaConnected", "==", true)
        .orderBy("__name__")
        .limit(MAX_DISPATCH_PER_RUN)
        .get();
    for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        if (typeof data.accountId !== "string" || data.accountId.length === 0) continue;
        // Doc path: users/{uid}/workspaces/{wid}/private/metaConnection
        const segments = doc.ref.path.split("/");
        if (segments.length < 5) continue;
        const uid = segments[1];
        const workspaceId = segments[3];
        // PHASE 970 (BATCH 2): join the parent workspace doc, skip
        // soft-deleted workspaces. Firestore doesn't filter across the
        // collectionGroup boundary for free, so this join is the price
        // of the deletedAt filter. Reads are O(1) cache-friendly and
        // the typical dispatch count is bounded by MAX_DISPATCH_PER_RUN
        // which today is well under 500.
        const workspaceSnap = await getDb()
            .collection("users").doc(uid)
            .collection("workspaces").doc(workspaceId)
            .get();
        const wsData = workspaceSnap.data() as Record<string, unknown> | undefined;
        if (!wsData || wsData.deletedAt != null) continue;
        // PHASE 970 (BATCH 2): de-dup by accountId. The first workspace
        // found (sorted by `__name__` ascending) wins; subsequent
        // workspaces linking the same account are silently dropped.
        if (seenAccounts.has(data.accountId)) continue;
        seenAccounts.add(data.accountId);
        out.push({ userId: uid, workspaceId, accountId: data.accountId });
    }
    if (out.length >= MAX_DISPATCH_PER_RUN) {
        console.warn(
            `[metaDailySync] dispatch capped at ${MAX_DISPATCH_PER_RUN} accounts ` +
            `— overflow will be picked up on the next run.`,
        );
    }
    return out;
}

/**
 * Build the JSON body the worker expects. PHASE 970 (BATCH 2) D4 fix:
 * the worker reads `req.data` (the documented `onTaskDispatched` envelope
 * shape — `firebase-functions/lib/common/providers/tasks.js:42`), so the
 * body MUST be `{ data: { userId, workspaceId, … } }`, not the bare
 * payload the pre-fix code was sending. Without this envelope the worker
 * throws "missing required fields in payload" on every task.
 */
export function buildSyncTaskBody(acct: DispatchedAccount, nowMs: number): string {
    return JSON.stringify({
        data: {
            userId: acct.userId,
            workspaceId: acct.workspaceId,
            accountId: acct.accountId,
            trigger: "scheduled",
            nowMs,
        },
    });
}

export const metaDailySync = onSchedule(
    {
        schedule: "0 3 * * *",
        timeZone: "UTC",
        region: SYNC_DISPATCH_REGION,
        timeoutSeconds: 540, // 9 minutes — well within the 1h daily window
        memory: "1GiB",
        // Defensive (Claude audit): the dispatcher only enqueues tasks
        // (no token decryption), but binding the secret here is a safety
        // net — if a future enhancement does a proactive token refresh
        // from the dispatcher, the secret is already wired.
        secrets: [metaAppSecret],
    },
    async () => {
        const accounts = await listConnectedAccounts();
        if (accounts.length === 0) {
            console.log("[metaDailySync] no connected Meta accounts found — nothing to dispatch");
            return;
        }

        const tasks = getTasksClient();
        const queuePath = tasks.queuePath(SYNC_DISPATCH_REGION, "proadsai-saas", META_SYNC_QUEUE);

        let dispatched = 0;
        const nowMs = Date.now();
        for (const acct of accounts) {
            try {
                await tasks.enqueueTask({
                    parent: queuePath,
                    task: {
                        httpRequest: {
                            httpMethod: "POST",
                            url: workerUrl(),
                            headers: { "Content-Type": "application/json" },
                            // PHASE 970 (BATCH 2) D4 — wrap in
                            // `{ data: … }` so the worker's
                            // `req.data` reads it. See buildSyncTaskBody
                            // and worker.ts:53.
                            body: Buffer.from(buildSyncTaskBody(acct, nowMs)),
                            oidcToken: {
                                serviceAccountEmail: tasks.serviceAccountEmail(),
                            },
                        },
                    },
                });
                dispatched++;
            } catch (e: unknown) {
                console.warn(`[metaDailySync] enqueue failed for ${acct.userId}/${acct.workspaceId}/${acct.accountId}: ${(e as Error).message}`);
            }
        }

        console.log(`[metaDailySync] dispatched ${dispatched}/${accounts.length} tasks to ${META_SYNC_QUEUE}`);
    },
);

function workerUrl(): string {
    const region = SYNC_DISPATCH_REGION;
    return `https://${region}-proadsai-saas.cloudfunctions.net/${WORKER_PATH}`;
}
