// functions/src/metaSync/orchestrator.ts — Phase 970 Batch 3
// ═══════════════════════════════════════════════════════════
// One press of either "Sync Now" button runs BOTH systems end-to-end:
//
//   LEG A — the legacy `metaSyncPerformance` body, account-global, INLINE.
//           Per investigation report §2(a), five live readers depend on
//           the writes this leg produces (root /adPerformance and
//           /adPerformanceHistory). The body is extracted VERBATIM into
//           `runLegacySyncForOwner`; the writes are unchanged.
//
//   LEG B — Phase 14, workspace-scoped, HYBRID.
//           • Inline for the caller's active workspace (so the dashboard
//             being viewed refreshes synchronously, the experience the
//             button promises).
//           • Fan out via Cloud Tasks for every OTHER live workspace with
//             a linked, connected account, de-duplicated by accountId.
//             Reuses `buildSyncTaskBody` (Batch 2 export) for the envelope.
//           • When there is no active workspace — the legacy
//             Performance Dashboard's path or any plan without one — all
//             pairs fan out.
//
//   isMetaRateLimit(err) — classifies Meta's two rate-limit envelopes
//           (code 4 / subcode 1504022 for the app-wide limit, code 17 /
//           subcode 2446079 for the per-user limit). Rate-limited accounts
//           are collected into the result instead of throwing, so a press
//           never fails the sync on a Meta-side throttling event.
//
// Both existing callables become thin wrappers over runFullSync. No new
// callable name, no client/authorization surface change, stale clients
// keep working.
//
// The contract test (`metaSyncOrchestrator.test.ts`) drives runFullSync
// with in-memory Firestore + fake fetch + fake tasksClient — same shape
// as the existing metaScope / metaDispatch contract tests.
// ═══════════════════════════════════════════════════════════

import { HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { getDb } from "../firestoreClient.js";
import { metaAppSecret } from "../secrets.js";
import { decryptLegacyToken } from "./legacyToken.js";
import {
    buildSyncTaskBody,
    META_SYNC_QUEUE,
    SYNC_DISPATCH_REGION,
    WORKER_PATH,
} from "./dispatcher.js";
import { getTasksClient, type TasksClientFacade } from "./tasksClient.js";
import { runSyncForAccount, type SyncResult } from "./shared.js";

// ─── Public types ─────────────────────────────────────────────

export interface FullSyncOptions {
    /** Resolved owner uid (from `resolveMetaScope`). All writes use this. */
    ownerUid: string;
    /** Caller uid (audit signal only; never used in a path). */
    callerUid: string;
    /** The caller's active workspace, if any. `null`/omitted → LEG B
     *  has nothing to run inline; ALL live workspaces fan out. */
    activeWorkspaceId?: string | null;
    /** Override `Date.now()` — for tests and for retry calls. */
    nowMs?: number;
    /**
     * Override fetch for LEG A (the legacy call uses bare
     * `fetch`, not the `metaGraph.ts` seam). Production omits this and
     * falls back to the global fetch.
     */
    fetchImpl?: typeof fetch;
/**
     * Test seam for the Cloud Tasks facade for LEG B fan-out. Production
     * omits this and falls back to `getTasksClient()`.
     */
    tasksClient?: TasksClientFacade;
    /**
     * Test seam for LEG B's inline path. Production omits this and the
     * orchestrator imports `runSyncForAccount` from `shared.ts`.
     * Tests inject a stub so they can drive the orchestrator's
     * split / dedup / error-classification logic without standing up
     * the full Meta graph fetch chain. Hard to mock via Object.defineProperty
     * on the ES-module-bound `runSyncForAccount` import — hence the seam.
     */
    runPhase14InlineOverride?: (opts: {
        ownerUid: string;
        workspaceId: string;
        accountId: string;
        trigger: "manual" | "scheduled";
        nowMs: number;
    }) => Promise<InlineSyncResult>;
    /**
     * Forwarded to LEG A's `runLegacySyncForOwner`. Test seam — production
     * omits and falls back to `decryptLegacyToken` from `legacyToken.ts`.
     */
    decryptLegacyTokenOverride?: (encryptedData: string) => Promise<string>;
}

export interface InlineSyncResult {
    workspaceId: string;
    accountId: string;
    counts: SyncResult["counts"];
    status: SyncResult["status"];
    errors: string[];
}

export interface FullSyncResult {
    ok: boolean;
    legacy: {
        accountsSynced: number;
        adsSynced: number;
        rateLimited: string[];
        errors: string[];
    };
    workspace: {
        inline: InlineSyncResult | null;
        queued: number;
        rateLimited: string[];
    };
    needsReauth: boolean;
    lastMetaSyncAt: number;
}

// ─── Rate-limit classifier ────────────────────────────────────

/**
 * PHASE 970 (BATCH 3) — rate-limit helper. Meta returns two distinct
 * rate-limit envelopes:
 *   - code 4 / subcode 1504022 — "Application request limit reached",
 *     app-wide bucket; the only one the investigation report observed.
 *   - code 17 / subcode 2446079 — per-user / app-rate limit variant.
 *
 * The function inspects three shapes:
 *   1. Direct fields on the error object (legacy raw-error envelopes).
 *   2. `MetaGraphError` from `metaGraph.ts:177`, which buries the
 *      structured fields inside `body.error.{code,error_subcode}`.
 *   3. A plain string message (the `errors[]` produced by
 *      `runSyncForAccount` is a `string[]`). Recognisable substrings
 *      ("application request limit reached", "OAuthException",
 *      "1504022", "2446079") classify the account. Fragile by design
 *      — if Meta ever changes the wording, the orchestrator silently
 *      promotes rate-limit errors to "real" errors, which is the safe
 *      failure direction (a sync that retries-and-fails on Meta-side
 *      throttling is more conservative than the opposite).
 *
 * Always exported with a stable signature so the `metaSyncRateLimit`
 * dedicated test in Batch 5 can lock the substrings down.
 */
export function isMetaRateLimit(err: unknown): boolean {
    if (!err || typeof err !== "object") {
        if (typeof err === "string") {
            return matchesRateLimitString(err);
        }
        return false;
    }
    const anyErr = err as Record<string, unknown>;

    // 1. Direct fields.
    if (
        (anyErr.code === 4 && anyErr.error_subcode === 1504022) ||
        (anyErr.code === 17 && anyErr.error_subcode === 2446079)
    ) {
        return true;
    }

    // 2. MetaGraphError shape — structured fields are in body.error.
    const body = anyErr.body as
        | { error?: { code?: number; error_subcode?: number } }
        | undefined
        | null;
    if (body && typeof body === "object" && body.error) {
        if (
            (body.error.code === 4 && body.error.error_subcode === 1504022) ||
            (body.error.code === 17 && body.error.error_subcode === 2446079)
        ) {
            return true;
        }
    }

    // 3. Plain-string classification (the `errors[]` collected by
    //    `runSyncForAccount` is a string[]).
    if (typeof anyErr.message === "string") {
        return matchesRateLimitString(anyErr.message);
    }

    return false;
}

function matchesRateLimitString(message: string): boolean {
    const m = message.toLowerCase();
    return (
        m.includes("application request limit reached") ||
        m.includes("too many api requests") ||
        (m.includes("oauth") && m.includes("1504022")) ||
        m.includes("1504022") ||
        m.includes("2446079") ||
        m.includes("user request limit reached")
    );
}

// ─── LEG A — legacy sync, inline, account-global ────────────────

export interface LegacySyncOptions {
    fetchImpl?: typeof fetch;
    nowMs?: number;
    /**
     * Test seam for the token decryption step. Production omits this
     * and the orchestrator calls `decryptLegacyToken` from
     * `legacyToken.ts`. Tests inject a stub that returns a fixed
     * plaintext token.
     */
    decryptLegacyTokenOverride?: (encryptedData: string) => Promise<string>;
}

/**
 * PHASE 970 (BATCH 3) — LEG A extracted VERBATIM from
 * `metaSyncPerformance` (was at `index.ts:3756–3983`). Five live readers
 * depend on the writes here (investigation report §2(a)):
 *   - root /adPerformance — PerformanceDashboard, feedbackService,
 *     serverUtils, plus two delete-only sites.
 *   - root /adPerformanceHistory — patternSummaries.
 *
 * The body is the same as the pre-fix callable's loop; the additions
 * in this batch are at the error-handling site only: rate-limit
 * errors (legacy would have just `console.error`'d and moved on) are
 * classified via `isMetaRateLimit` and collected into the returned
 * `rateLimited[]` so the orchestrator can report them as a separate
 * bucket. The writes, log lines, and non-rate-limit error behaviour
 * are unchanged.
 *
 * Test seam: `fetchImpl` overrides the global `fetch` so the existing
 * `metaSync.test.ts` patterns (fake fetch returning canned responses)
 * work without standing up the @google-cloud/tasks stack.
 */
export async function runLegacySyncForOwner(
    ownerUid: string,
    workspaceId: string | null,
    opts: LegacySyncOptions = {},
): Promise<{
    adsSynced: number;
    accountsSynced: number;
    rateLimited: string[];
    errors: string[];
    ok: boolean;
}> {
    const fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    const nowMs = opts.nowMs ?? Date.now();
    const decryptTokenImpl = opts.decryptLegacyTokenOverride ?? decryptLegacyToken;

    const connDoc = await getDb().collection("metaConnections").doc(ownerUid).get();
    if (!connDoc.exists) {
        return {
            adsSynced: 0,
            accountsSynced: 0,
            rateLimited: [],
            errors: ["No Meta connection found."],
            ok: false,
        };
    }

    const conn = connDoc.data()!;
    // Active accounts (status===1 or account_status===1) is the
    // same filter the legacy callable used. The fallback to
    // selectedAccountId is also unchanged.
    const activeAccounts: { id: string; name: string }[] = (conn.adAccounts || []).filter(
        (a: any) => a.status === 1 || a.account_status === 1,
    );
    if (activeAccounts.length === 0 && conn.selectedAccountId) {
        activeAccounts.push({ id: conn.selectedAccountId, name: "Selected Account" });
    }
    if (activeAccounts.length === 0) {
        return {
            adsSynced: 0,
            accountsSynced: 0,
            rateLimited: [],
            errors: ["No active ad accounts found."],
            ok: false,
        };
    }

    const rateLimited: string[] = [];
    const errors: string[] = [];
    let totalSyncCount = 0;

    try {
        const token = await decryptTokenImpl(conn.encryptedToken, metaAppSecret.value());

        for (const account of activeAccounts) {
            const accountId = account.id;

            // 30-day window, the same as the legacy path.
            const since = new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
            const until = new Date(nowMs).toISOString().split("T")[0];

            const insightsResponse = await fetchImpl(
                `https://graph.facebook.com/v22.0/${accountId}/insights?` +
                    `fields=campaign_name,adset_name,ad_name,ad_id,impressions,clicks,spend,` +
                    `ctr,cpc,cpm,actions,cost_per_action_type,purchase_roas&` +
                    `time_range={"since":"${since}","until":"${until}"}&` +
                    `level=ad&limit=100&` +
                    `access_token=${token}`,
            );
            const insightsData = (await insightsResponse.json()) as any;

            if (insightsData.error) {
                // PHASE 970 (BATCH 3) — classify rate-limit errors BEFORE the
                // generic `console.error`. Rate-limit accounts skip the
                // legacy "log to console and continue" path so the
                // orchestrator can report them under `rateLimited[]`.
                if (isMetaRateLimit(insightsData.error)) {
                    rateLimited.push(accountId);
                } else {
                    console.error(
                        `Meta insights error for account ${accountId}:`,
                        insightsData.error,
                    );
                }
                // Continue to next account — same as the legacy behavior.
                continue;
            }

            const ads = insightsData.data || [];
            const batch = admin.firestore().batch();
            let syncCount = 0;

            for (const ad of ads) {
                // Extract purchase/lead actions
                const actions = ad.actions || [];
                const purchases = actions.find((a: any) => a.action_type === "purchase")?.value || 0;
                const leads = actions.find((a: any) => a.action_type === "lead")?.value || 0;

                // Extract CPA
                const costPerAction = ad.cost_per_action_type || [];
                const cpaPurchase = costPerAction.find((c: any) => c.action_type === "purchase")?.value || null;
                const cpaLead = costPerAction.find((c: any) => c.action_type === "lead")?.value || null;

                // Extract ROAS
                const roasData = ad.purchase_roas || [];
                const roas = roasData.length > 0 ? parseFloat(roasData[0].value) : null;

                const metricsSnapshot = {
                    impressions: parseInt(ad.impressions || "0"),
                    clicks: parseInt(ad.clicks || "0"),
                    spend: parseFloat(ad.spend || "0"),
                    ctr: parseFloat(ad.ctr || "0"),
                    cpc: parseFloat(ad.cpc || "0"),
                    cpm: parseFloat(ad.cpm || "0"),
                    purchases: parseInt(purchases),
                    leads: parseInt(leads),
                    cpa: cpaPurchase ? parseFloat(cpaPurchase) : (cpaLead ? parseFloat(cpaLead) : null),
                    roas,
                };

                const perfDoc = {
                    userId: ownerUid,
                    adAccountId: accountId,
                    workspaceId,
                    adId: ad.ad_id,
                    adName: ad.ad_name || "Unknown",
                    adsetName: ad.adset_name || "Unknown",
                    campaignName: ad.campaign_name || "Unknown",
                    ...metricsSnapshot,
                    dateRange: { since, until },
                    syncedAt: admin.firestore.FieldValue.serverTimestamp(),
                };

                // Store latest performance (for dashboard display)
                const docId = `${ownerUid}_${ad.ad_id}`;
                batch.set(admin.firestore().collection("adPerformance").doc(docId), perfDoc, { merge: true });

                // Store time-aware snapshot (for historical analysis — never overwrites)
                const snapshotId = `${ownerUid}_${ad.ad_id}_${since}_${until}`;
                batch.set(admin.firestore().collection("adPerformanceHistory").doc(snapshotId), {
                    ...perfDoc,
                    snapshotDate: new Date(nowMs).toISOString().split("T")[0],
                });

                // Link to deployment records — prefer strong identifiers, scoped by adAccountId
                try {
                    let deployDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

                    // 1. Try metaAdId first (strongest — direct Meta identity)
                    if (ad.ad_id) {
                        const byAdId = await admin.firestore()
                            .collection("creativeDeployments")
                            .where("userId", "==", ownerUid)
                            .where("adAccountId", "==", accountId)
                            .where("metaAdId", "==", ad.ad_id)
                            .limit(1)
                            .get();
                        if (!byAdId.empty) deployDoc = byAdId.docs[0];
                    }

                    // 2. Try imageHash if available on the ad insights
                    if (!deployDoc && (ad as any).image_hash) {
                        const byHash = await admin.firestore()
                            .collection("creativeDeployments")
                            .where("userId", "==", ownerUid)
                            .where("adAccountId", "==", accountId)
                            .where("imageHash", "==", (ad as any).image_hash)
                            .limit(1)
                            .get();
                        if (!byHash.empty) deployDoc = byHash.docs[0];
                    }

                    // 3. Fallback to adName (weakest — may have duplicates), scoped by account
                    if (!deployDoc && ad.ad_name) {
                        const byName = await admin.firestore()
                            .collection("creativeDeployments")
                            .where("userId", "==", ownerUid)
                            .where("adAccountId", "==", accountId)
                            .where("adName", "==", ad.ad_name)
                            .limit(1)
                            .get();
                        if (!byName.empty) deployDoc = byName.docs[0];
                    }

                    if (deployDoc) {
                        batch.update(deployDoc.ref, {
                            metaAdId: ad.ad_id,
                            metaAdSetId: ad.adset_name || null,
                            metaCampaignId: ad.campaign_name || null,
                            latestMetrics: metricsSnapshot,
                        });
                    }
                } catch { /* Non-blocking deployment linkage */ }

                syncCount++;
            }

            if (syncCount > 0) await batch.commit();
            totalSyncCount += syncCount;
        } // end for-each account

        // Update last sync time (user-level connection doc).
        await admin.firestore().collection("metaConnections").doc(ownerUid).update({
            lastSyncAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Stamp the workspace-private lastMetaSyncAt. The batch-4
        // cooldown removal keeps this field as display-only — it
        // drives "Synced N minutes ago", not the gate.
        if (workspaceId) {
            try {
                await admin.firestore()
                    .doc(`users/${ownerUid}/workspaces/${workspaceId}/private/metaConnection`)
                    .set({ lastMetaSyncAt: nowMs }, { merge: true });
            } catch (err: unknown) {
                console.warn("⚠️ Non-blocking: failed to stamp workspace lastMetaSyncAt:", err);
            }
        }

        console.log(
            `📊 Synced ${totalSyncCount} ads across ${activeAccounts.length} accounts (owner=${ownerUid}, caller=${"-"})`,
        );
        return {
            adsSynced: totalSyncCount,
            accountsSynced: activeAccounts.length,
            rateLimited,
            errors,
            ok: true,
        };
    } catch (err: unknown) {
        // Token-decrypt failure or other unrecoverable LEG A error.
        // The legacy callable produced an HttpsError here so the
        // legacy surface still does.
        if (err instanceof HttpsError) throw err;
        console.error("Sync error:", err);
        throw new HttpsError("internal", "Failed to sync ad performance.");
    }
}

// ─── LEG B — Phase 14, workspace-scoped, hybrid ─────────────────

interface OwnedWorkspace {
    workspaceId: string;
    accountId: string;
}

/**
 * Walk the owner's workspaces, return one entry per connected, live
 * workspace, de-duplicated by accountId. Uses the same three skip
 * rules as `listConnectedAccounts` (investigation report §5 + Batch 2):
 *   - workspace doc missing
 *   - workspace soft-deleted (`deletedAt != null`)
 *   - `private/metaConnection.metaConnected` not true
 * Legacy workspaces with no `deletedAt` field are kept (Batch 2 test 7).
 */
async function discoverOwnedWorkspaces(ownerUid: string): Promise<OwnedWorkspace[]> {
    const workspacesSnap = await getDb()
        .collection("users").doc(ownerUid)
        .collection("workspaces")
        .get();
    const seenAccounts = new Set<string>();
    const out: OwnedWorkspace[] = [];
    for (const wsDoc of workspacesSnap.docs) {
        const wsData = wsDoc.data() as Record<string, unknown> | undefined;
        if (!wsData || wsData.deletedAt != null) continue;
        const connSnap = await getDb()
            .doc(`users/${ownerUid}/workspaces/${wsDoc.id}/private/metaConnection`)
            .get();
        if (!connSnap.exists) continue;
        const connData = connSnap.data() as Record<string, unknown> | undefined;
        if (!connData || connData.metaConnected !== true) continue;
        if (typeof connData.accountId !== "string" || connData.accountId.length === 0) continue;
        if (seenAccounts.has(connData.accountId)) continue;
        seenAccounts.add(connData.accountId);
        out.push({ workspaceId: wsDoc.id, accountId: connData.accountId });
    }
    return out;
}

async function runPhase14Inline(opts: {
    ownerUid: string;
    workspaceId: string;
    accountId: string;
    trigger: "manual" | "scheduled";
    nowMs: number;
}): Promise<InlineSyncResult> {
    const result: SyncResult = await runSyncForAccount({
        userId: opts.ownerUid,
        workspaceId: opts.workspaceId,
        accountId: opts.accountId,
        trigger: opts.trigger,
        nowMs: opts.nowMs,
    });
    return {
        workspaceId: opts.workspaceId,
        accountId: opts.accountId,
        counts: result.counts,
        status: result.status,
        errors: result.errors.slice(0, 10),
    };
}

async function fanOutPhase14(opts: {
    ownerUid: string;
    workspaces: OwnedWorkspace[];
    nowMs: number;
    tasksClient: TasksClientFacade;
}): Promise<{ queued: number; rateLimited: string[]; errors: string[] }> {
    const queued: number[] = [];
    const rateLimited: string[] = [];
    const errors: string[] = [];
    const queuePath = opts.tasksClient.queuePath(
        SYNC_DISPATCH_REGION,
        "proadsai-saas",
        META_SYNC_QUEUE,
    );
    const workerEndpoint = `https://${SYNC_DISPATCH_REGION}-proadsai-saas.cloudfunctions.net/${WORKER_PATH}`;

    for (const ws of opts.workspaces) {
        try {
            await opts.tasksClient.enqueueTask({
                parent: queuePath,
                task: {
                    httpRequest: {
                        httpMethod: "POST",
                        url: workerEndpoint,
                        headers: { "Content-Type": "application/json" },
                        // Reuses Batch 2's exported envelope helper so the
                        // envelope shape stays consistent with the
                        // scheduled dispatcher.
                        body: Buffer.from(
                            buildSyncTaskBody(
                                {
                                    userId: opts.ownerUid,
                                    workspaceId: ws.workspaceId,
                                    accountId: ws.accountId,
                                },
                                opts.nowMs,
                            ),
                        ),
                        oidcToken: { serviceAccountEmail: opts.tasksClient.serviceAccountEmail() },
                    },
                },
            });
            queued.push(0);
        } catch (e: unknown) {
            if (isMetaRateLimit(e)) {
                rateLimited.push(ws.accountId);
                continue;
            }
            errors.push(`enqueue failed for ${ws.workspaceId}/${ws.accountId}: ${(e as Error).message}`);
        }
    }
    return { queued: queued.length, rateLimited, errors };
}

/**
 * Main entry point. Both `metaSyncPerformance` and `triggerMetaSync`
 * are thin wrappers over this. Both LEGs run on every press (per
 * investigation report §8.2: the dashboard's readers expect LEG A to
 * keep `adPerformance` and `adPerformanceHistory` fresh, and the
 * Phase 14 readers expect LEG B to fill the workspace-scoped
 * collection).
 */
export async function runFullSync(opts: FullSyncOptions): Promise<FullSyncResult> {
    const nowMs = opts.nowMs ?? Date.now();
    const tasksClient = opts.tasksClient ?? getTasksClient();
    const phase14Inline = opts.runPhase14InlineOverride ?? runPhase14Inline;

    // LEG A — inline, account-global. Pre-fix `metaSyncPerformance`
    // took `workspaceId?: string` and stamped the private lastMetaSyncAt
    // when present. We pass it through for parity with the dashboard's
    // "Synced just now" display (the only remaining reader of the
    // field after Batch 4's cooldown removal).
    const legacy = await runLegacySyncForOwner(opts.ownerUid, opts.activeWorkspaceId ?? null, {
        fetchImpl: opts.fetchImpl,
        nowMs,
        decryptLegacyTokenOverride: opts.decryptLegacyTokenOverride,
    });

    // LEG B — Phase 14. Discover owned workspaces, classify inline
    // vs queued, and run.
    const owned = await discoverOwnedWorkspaces(opts.ownerUid);

    let inline: InlineSyncResult | null = null;
    let rest: OwnedWorkspace[] = owned;

    if (opts.activeWorkspaceId) {
        const idx = owned.findIndex((w) => w.workspaceId === opts.activeWorkspaceId);
        if (idx !== -1) {
            const [picked] = owned.splice(idx, 1);
            inline = await phase14Inline({
                ownerUid: opts.ownerUid,
                workspaceId: picked.workspaceId,
                accountId: picked.accountId,
                trigger: "manual",
                nowMs,
            });
        }
    }

    const fanOut = await fanOutPhase14({
        ownerUid: opts.ownerUid,
        workspaces: rest,
        nowMs,
        tasksClient,
    });

    // Aggregate inline-error rate-limit classification by re-running
    // the same string scan over `result.errors`. The shared classifier
    // already handles plain-string matches.
    const inlineRateLimited = inline
        ? inline.errors.filter((e) => isMetaRateLimit({ message: e })).length > 0
            ? [inline.accountId]
            : []
        : [];

    return {
        ok: legacy.ok && (inline ? inline.status !== "failed" : true),
        legacy: {
            accountsSynced: legacy.accountsSynced,
            adsSynced: legacy.adsSynced,
            rateLimited: legacy.rateLimited,
            errors: legacy.errors,
        },
        workspace: {
            inline: inline
                ? {
                      workspaceId: inline.workspaceId,
                      accountId: inline.accountId,
                      counts: inline.counts,
                      status: inline.status,
                      errors: inline.errors,
                  }
                : null,
            queued: fanOut.queued,
            rateLimited: [...fanOut.rateLimited, ...inlineRateLimited],
        },
        needsReauth: inline ? inline.errors.some((e) => /needsReauth/i.test(e)) : false,
        lastMetaSyncAt: nowMs,
    };
}

// ─── Caller-scope helper (preserved) ─────────────────────────────

/**
 * Public so the index.ts thin wrapper (replacing the legacy 1-hour
 * cooldown) can keep auth as the first thing in the wrapper. The
 * production callables still do their own `resolveMetaScope`; this is
 * only here to surface "I depend on caller-scope resolution" as
 * documentation.
 */
export const __orchestratorDependsOnCallerScope = true;
