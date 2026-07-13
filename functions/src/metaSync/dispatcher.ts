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
// ═══════════════════════════════════════════════════════════

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getTasksClient } from "./tasksClient.js";
import { getDb } from "../firestoreClient.js";

export const META_SYNC_QUEUE = "metaSyncQueue";
export const WORKER_PATH = "metaSyncAccountWorker";
export const SYNC_DISPATCH_REGION = "europe-west1";
export const MAX_DISPATCH_PER_RUN = 500;

interface DispatchedAccount {
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
 * Pagination: if the result hits `MAX_DISPATCH_PER_RUN`, we log a warning.
 * At the scale we expect for v1 this is well under the cap; the cap is a
 * safety net rather than a hard limit. A future iteration can persist a
 * cursor between invocations if the cap is ever approached.
 */
async function listConnectedAccounts(): Promise<DispatchedAccount[]> {
    const out: DispatchedAccount[] = [];
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

export const metaDailySync = onSchedule(
    {
        schedule: "0 3 * * *",
        timeZone: "UTC",
        region: SYNC_DISPATCH_REGION,
        timeoutSeconds: 540, // 9 minutes — well within the 1h daily window
        memory: "1GiB",
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
        for (const acct of accounts) {
            try {
                await tasks.enqueueTask({
                    parent: queuePath,
                    task: {
                        httpRequest: {
                            httpMethod: "POST",
                            url: workerUrl(),
                            headers: { "Content-Type": "application/json" },
                            body: Buffer.from(JSON.stringify({
                                userId: acct.userId,
                                workspaceId: acct.workspaceId,
                                accountId: acct.accountId,
                                trigger: "scheduled",
                                nowMs: Date.now(),
                            })),
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
