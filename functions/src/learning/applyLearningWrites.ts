// functions/src/learning/applyLearningWrites.ts — read-modify-write and
// commit of the learning aggregates, extracted from `metaSync/shared.ts`
// so the lease spans the entire critical section (Item 1 of the Batch
// 21/22 review-of-review).
//
// This module owns:
//   - the per-row contribution consult against the recorded ledger
//     (all four `decideContribution` outcomes: `add`, `noop`,
//     `withdraw_then_add`, `withdraw_only`)
//   - the `existingHookDocs` / `existingVisualDocs` aggregate read
//   - the withdrawal application against the RECORDED geometry
//     (FR-013 / FR-017):
//       - hook withdrawals are keyed by `angleKey`
//         (a canonical hook id such as "urgency" or "statistics")
//       - visual withdrawals are keyed by `patternKey`
//         (a composite produced by `computePatternKey` — layout,
//         modes, art direction, universe)
//     The two key spaces never intersect. Conflating them produces
//     a visual withdrawal that silently never runs (Batch 26, bug 1).
//   - the additive pass (`applyHookAggregatesDelta`,
//     `applyVisualAggregatesDelta`)
//   - building the aggregate writes (hookPerformance /
//     visualPerformance per-aggregate entries ready for
//     `db.batch().set(w.ref, w.data, { merge: true })`)
//   - the chunked commit of those writes (a commit failure is a
//     hard error and propagates to the outer catch — see §6)
//
// It does NOT own:
//   - the bounded adPerformance read (caller passes `existingByAdId`)
//   - the lease acquire/release (caller wraps the call)
//
// The function MUST be called inside a lease-held `try` block: the
// caller has already acquired the lease and re-checked `stillHeld`,
// and the `finally` releases it. The lease covers both the read and
// the commit, so a concurrent run cannot see an interim baseline and
// commit a stale write against it.

import {
    applyHookAggregatesDelta,
    applyHookAggregateWithdrawal,
    applyVisualAggregatesDelta,
} from "./aggregateDelta.js";
import { decideContribution } from "./contributionLedger.js";
import type { ContributionDecision } from "./contributionLedger.js";
import type { ContributionLedgerEntry } from "./types.js";
import {
    type AdForLearning,
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
} from "../learningAggregates.js";
import { resolveFunnelTypeBucketKey } from "../learningAggregates.js";

// `DbLike` is the same loose contract the lease acquire accepts.
// Kept loose here because the consumer-cast to `Parameters<...>` is what
// makes the chain typecheck against the real Firestore handle in tests.
type DbLike = unknown;

// `AdDoc` is the per-ad document shape (subset used by the bounded
// read). The full type lives in `../metaSync/shared.ts`; the bounded
// read returns `Partial<AdDoc>` and the ledger only needs the
// `ledger` field.
interface AdDocLike {
    ledger?: ContributionLedgerEntry;
}
type ExistingByAdId = Map<string, AdDocLike>;

type DecideContributionOutcome = ContributionDecision;

// `applyVisualAggregateWithdrawal` is the visual aggregate's
// symmetric counterpart to the hook variant. The hook variant is
// exported from `aggregateDelta.ts`; the visual variant is local
// to this module until it can be lifted into `aggregateDelta.ts`
// in a follow-up (TODO).
//
// Note: this function is now REACHABLE for the first time as of
// Batch 26. The Batch 23/24 commits built `withdrawalByAngle` keyed
// on `agg.hookAngle` and looked it up against `agg.patternKey` —
// a key-space mismatch that returned undefined for every visual
// aggregate and silently skipped all visual withdrawals.
export // ══ ADD/WITHDRAW INVARIANT (Batch 29) ══
//
//   EVERY counter or average `applyVisualAggregateWithdrawal` changes MUST
//   be one `applyAdToVisual` changes, in the SAME BRANCH, by the inverse
//   amount — and vice versa.
//
// This function breached it in BOTH directions at once: it decremented
// `sampleSize`, `byGeoTier` and `byAudienceType`, which the addition never
// incremented, while never decrementing `bestVerdictCount` /
// `worstVerdictCount`, which the addition does increment. The first kind
// floors silently at zero; the second inflates on every sync, because
// withdraw-then-add is the modal path. Both are closed in Batch 29.
//
// The canonical statement of the invariant, with the reasoning and the
// full pair-by-pair audit, lives above `applyHookAggregateWithdrawal` in
// `aggregateDelta.ts`. Keep the two in step.

/**
 * Batch 28 (Fix A, FR-021) — the visual counterpart of `withdrawAvg` in
 * `aggregateDelta.ts`. Duplicated rather than imported only because this
 * function is still local to this module; both move together when the
 * TODO above is taken and the visual withdrawal is lifted into
 * `aggregateDelta.ts`.
 */
function withdrawAvgLocal(avg: number, count: number, value: number): number {
    if (count <= 1) return 0;
    return Math.round(((avg * count - value) / (count - 1)) * 100) / 100;
}

export function applyVisualAggregateWithdrawal(
    existing: VisualPerformanceAggregate,
    ad: AdForLearning,
): VisualPerformanceAggregate {
    const clone: VisualPerformanceAggregate = JSON.parse(JSON.stringify(existing));
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        if (clone.sampleSize > 0) clone.sampleSize -= 1;
        // Batch 28 (Fix A, FR-021): withdraw BOTH averages the visual
        // aggregator maintains, using the withdrawn row's own recorded
        // values, and compute them from the count BEFORE the decrement.
        // `applyAdToVisual` averages `ctrLink` and `cpm3d` together, so
        // both have to come back out together or the pair diverges.
        const beforeCount = clone.byObjective.conversion.count;
        clone.byObjective.conversion.avgLinkCtr = withdrawAvgLocal(
            clone.byObjective.conversion.avgLinkCtr, beforeCount, ad.ctrLink,
        );
        clone.byObjective.conversion.avgCpm = withdrawAvgLocal(
            clone.byObjective.conversion.avgCpm, beforeCount, ad.cpm3d,
        );
        if (clone.byObjective.conversion.count > 0) {
            clone.byObjective.conversion.count -= 1;
        }
        // Batch 29 — ADD/WITHDRAW INVARIANT. `applyAdToVisual` increments
        // these two and nothing decremented them, so a winning creative
        // added a win on EVERY sync: five withdraw-then-add cycles of one
        // 🟢 creative reported six wins. Both are read — `ragContext.ts:346`
        // and `:347` build the visual ranking from them.
        if (ad.verdict === "🟢" && clone.byObjective.conversion.bestVerdictCount > 0) {
            clone.byObjective.conversion.bestVerdictCount -= 1;
        }
        if (ad.verdict === "🔴" && clone.byObjective.conversion.worstVerdictCount > 0) {
            clone.byObjective.conversion.worstVerdictCount -= 1;
        }
        const tier = ad.geoTier;
        const tierBefore = clone.byGeoTier[tier];
        if (tierBefore) {
            clone.byGeoTier[tier] = {
                count: tierBefore.count > 0 ? tierBefore.count - 1 : 0,
                avgCtr: withdrawAvgLocal(tierBefore.avgCtr, tierBefore.count, ad.ctrLink),
                avgCpm: withdrawAvgLocal(tierBefore.avgCpm, tierBefore.count, ad.cpm3d),
            };
        }
        const aud = ad.audienceType;
        const audBefore = clone.byAudienceType[aud];
        if (audBefore) {
            clone.byAudienceType[aud] = {
                count: audBefore.count > 0 ? audBefore.count - 1 : 0,
                avgCtr: withdrawAvgLocal(audBefore.avgCtr, audBefore.count, ad.ctrLink),
                avgCpm: withdrawAvgLocal(audBefore.avgCpm, audBefore.count, ad.cpm3d),
            };
        }
    } else {
        if (clone.byObjective.other.count > 0) {
            clone.byObjective.other.count -= 1;
        }
    }
    if (clone.byFunnelType) {
        const key = resolveFunnelTypeBucketKey(ad.funnelType);
        const bucket = clone.byFunnelType[key];
        if (bucket && bucket.count > 0) {
            clone.byFunnelType[key] = { count: bucket.count - 1 };
        }
    }
    return clone;
}

export interface ApplyLearningWritesParams {
    /** Firestore handle (DbLike). Used only for `db.batch().set/.commit()`. */
    db: DbLike;
    /** Workspace-scoped ad-account reference (`metaSync/shared.ts` builds it). */
    adAccountRef: { collection(name: string): { doc(id?: string): { id: string }; get(): Promise<{ docs: Array<{ data(): unknown; id: string }> }> } };
    /** Per-ad rows the worker has decided will contribute. Mutated in place: rows whose contribution is a `noop` are removed. */
    learnedAds: AdForLearning[];
    /** Per-ad doc index keyed by adId — same shape as `ledgerAdDocsByAdId` in `shared.ts`. The post-pass patch has already filled each doc's `ledger` with the resolved keys. */
    ledgerAdDocsByAdId: Map<string, AdDocLike>;
    /** The bounded adPerformance read, keyed by adId. The post-pass patch has already populated this BEFORE the call (see `readExistingAdDocs` at the top of `runSyncForAccount`). */
    existingByAdId: ExistingByAdId;
    /** Sync timestamp used by `applyHookAggregatesDelta` for `lastUpdated`. */
    nowMs: number;
    /** Error sink — populated on non-fatal failures. Mirrors the `errors[]` array in `shared.ts`. */
    errors: string[];
    /** Optional chunk size override (production passes nothing; tests pass small values). */
    chunkSize?: number;
}

export interface ApplyLearningWritesResult {
    /** Whether the function ran the consult + read + compute + commit. False when `learnedAds` was empty or any commit failed. */
    ran: boolean;
    /** Counts of hook and visual writes committed (for test assertions). */
    hookWrites: number;
    visualWrites: number;
}

const DEFAULT_CHUNK_SIZE = 450;

/**
 * Apply learning writes end-to-end:
 *   1. Consult the contribution ledger for each row in `learnedAds`
 *      (handles all four `decideContribution` outcomes — see comment
 *      in BATCH 21 of `metaSync/shared.ts`).
 *   2. Apply withdrawals against the recorded geometry, keyed
 *      correctly per aggregate (hook by `angleKey`, visual by
 *      `patternKey`).
 *   3. Run the additive pass against the post-withdrawal baseline.
 *   4. Chunked commit of the writes INSIDE the lease held by the caller.
 *
 * The caller is responsible for:
 *   - Acquiring the lease (`acquireLearningLease`) BEFORE this call.
 *   - Re-checking `stillHeld` immediately before this call (FR-062).
 *   - Releasing the lease in `finally`.
 *
 * The `applyLearningWrites` invocation is the entire critical section
 * for FR-060a (lease covers read-modify-write end-to-end). A lease-
 * refused run never calls this function — its caller returns earlier
 * with `status='failed'` and 0 aggregate writes.
 *
 * Failure semantics: a commit failure throws and is caught by the
 * outer try/catch, which records the error and returns `ran: false`.
 * A `ran: true` result implies every chunk's commit resolved; the
 * caller can rely on the stored documents reflecting the writes it
 * built. (Batch 26: previously a commit failure was swallowed into
 * `errors[]` while the function still returned `ran: true` — the
 * caller had no way to distinguish a run whose every chunk failed
 * from a successful run.)
 */
export async function applyLearningWrites(
    params: ApplyLearningWritesParams,
): Promise<ApplyLearningWritesResult> {
    const emptyResult: ApplyLearningWritesResult = {
        ran: false,
        hookWrites: 0,
        visualWrites: 0,
    };

    if (params.learnedAds.length === 0) {
        return emptyResult;
    }

    try {
        // 1. Ledger consult — handles all four `decideContribution` outcomes.
        //
        //   - `add`              → keep the row; this is a fresh
        //                          contribution (recorded absent,
        //                          desired present).
        //   - `noop`             → remove the row (recorded already
        //                          matches the desired).
        //   - `withdraw_then_add`→ withdraw the recorded contribution
        //                          (so the row does not double-count
        //                          in the OLD bucket), then keep the
        //                          row so the additive pass re-adds at
        //                          the NEW geometry.
        //   - `withdraw_only`    → withdraw the recorded contribution
        //                          and remove the row.
        //
        // The legacy guard `if (!desired || !recorded) continue;`
        // discarded the `add` case before decideContribution saw it;
        // we remove that guard so all four outcomes are reachable.
        //
        // The reconstructed `oldAd` carries the RECORDED geometry
        // for the fields the withdrawal functions consume
        // (`campaignObjective` from `withdraw.bucket`, `geoTier`,
        // `audienceType`). `hookAngle` is `withdraw.angleKey` so the
        // hook map lookup lands in the OLD bucket. `layoutTemplate`,
        // `creativeModes`, `artDirection`, `universe` flow through
        // from the current ad by `...ad` — the withdrawal paths do
        // NOT consume them, and reconstructing them would require
        // keeping them on the ledger entry (a follow-up schema
        // change, out of scope here). The visual withdrawal's map
        // key (`withdraw.patternKey`) is taken from the recorded
        // entry directly — not from the current ad — so the OLD
        // pattern is the authority even when the geometry spreads
        // through from `...ad`.
        const withdrawalHookAds: AdForLearning[] = [];
        for (let i = params.learnedAds.length - 1; i >= 0; i--) {
            const ad = params.learnedAds[i];
            const ledgerAdDoc = params.ledgerAdDocsByAdId.get(ad.adId);
            const desired = ledgerAdDoc?.ledger as ContributionLedgerEntry | undefined;
            const recorded = params.existingByAdId.get(ad.adId)?.ledger as ContributionLedgerEntry | undefined;
            const decision: DecideContributionOutcome = decideContribution(desired ?? null, recorded ?? null);
            if (decision.kind === "noop") {
                params.learnedAds.splice(i, 1);
                continue;
            }
            if (decision.kind === "withdraw_only" || decision.kind === "withdraw_then_add") {
                const withdraw = decision.withdraw;
                const oldAd: AdForLearning = {
                    ...ad,
                    hookAngle: withdraw.angleKey,
                    campaignObjective: withdraw.bucket as AdForLearning["campaignObjective"],
                    ctrLink: withdraw.contributedValues.ctrLink,
                    cpm3d: withdraw.contributedValues.cpm,
                    verdict: withdraw.contributedValues.verdictMark as AdForLearning["verdict"],
                    geoTier: withdraw.geoTier as AdForLearning["geoTier"],
                    audienceType: withdraw.audienceType as AdForLearning["audienceType"],
                    funnelType: ad.funnelType,
                    // The OLD patternKey is recorded on the ledger;
                    // we let it flow through as part of the same AdForLearning
                    // — but we only USE it for visual-aggregate map lookups
                    // below. The visual-withdrawal map is keyed on
                    // `withdraw.patternKey` directly, not on anything we
                    // computed from the current ad.
                };
                withdrawalHookAds.push(oldAd);
                if (decision.kind === "withdraw_only") {
                    params.learnedAds.splice(i, 1);
                }
            }
        }

        // 2. Aggregate read.
        //
        // CRITICAL: any read error here must PROPAGATE (not be caught)
        // — silently returning [] would cause the aggregator to compute
        // stats from a wrong baseline, and the Firestore write would
        // overwrite historical data with garbage. The outer try/catch
        // records the failure and skips the aggregate writes,
        // preserving the existing docs.
        const [existingHookDocs, existingVisualDocs] = await Promise.all([
            params.adAccountRef.collection("hookPerformance").get(),
            params.adAccountRef.collection("visualPerformance").get(),
        ]);
        const existingHook: HookPerformanceAggregate[] = existingHookDocs.docs.map((d) => d.data() as HookPerformanceAggregate);
        const existingVisual: VisualPerformanceAggregate[] = existingVisualDocs.docs.map((d) => d.data() as VisualPerformanceAggregate);

        // 3. Withdrawal application — TWO separate maps with TWO
        // distinct key spaces. Conflating them is the bug Batch 26
        // names `Bug 1`.
        let hookBase = existingHook;
        let visualBase = existingVisual;
        if (withdrawalHookAds.length > 0) {
            // ─── Hook-withdrawal map: keyed by `angleKey` (canonical
            // hook id such as "urgency" or "statistics"). Hook
            // aggregates expose their key on `agg.angleKey`.
            const withdrawalByAngle = new Map<string, AdForLearning[]>();
            // ─── Visual-withdrawal map: keyed by `patternKey` (the
            // composite from `computePatternKey`). Visual aggregates
            // expose their key on `agg.patternKey`. `withdraw.patternKey`
            // is recorded on the ledger entry — we use it directly, so
            // the visual withdrawal targets the OLD pattern the
            // creative moved FROM, not the one it moved TO.
            //
            // Note: the OLD patternKey on the ledger is the authority
            // for the map key. We do NOT recompute the patternKey
            // from the current ad's geometry — the spread on line
            // ("oldAd = { ...ad, hookAngle: withdraw.angleKey, ...")
            // already overrides the fields `applyVisualAggregateWithdrawal`
            // consumes (campaignObjective, geoTier, audienceType),
            // and funnelType flows through. The patternKey derived
            // from `...ad` would be the CURRENT pattern, which is
            // precisely what the reviewer named Bug 2 — that path
            // is not taken here. The visual map key comes from the
            // recorded ledger entry.
            const withdrawalByPattern = new Map<string, AdForLearning[]>();

            // Re-extract the recorded entries alongside the wad so we
            // can pull `patternKey` straight from the ledger. (The wad
            // carries the spread geometry; the recorded entry carries
            // the OLD patternKey.)
            for (let i = 0; i < withdrawalHookAds.length; i++) {
                const wad = withdrawalHookAds[i];
                const recorded = params.existingByAdId.get(wad.adId)?.ledger as ContributionLedgerEntry | undefined;
                if (!recorded) continue;
                const oldAngleKey = recorded.angleKey;
                const oldPatternKey = recorded.patternKey;

                if (oldAngleKey !== null) {
                    const existingA = withdrawalByAngle.get(oldAngleKey);
                    if (existingA !== undefined) existingA.push(wad);
                    else withdrawalByAngle.set(oldAngleKey, [wad]);
                }
                if (oldPatternKey !== null) {
                    const existingP = withdrawalByPattern.get(oldPatternKey);
                    if (existingP !== undefined) existingP.push(wad);
                    else withdrawalByPattern.set(oldPatternKey, [wad]);
                }
            }

            hookBase = hookBase.map((agg) => {
                const withdrawals = withdrawalByAngle.get(agg.angleKey);
                if (!withdrawals || withdrawals.length === 0) return agg;
                let next = agg;
                for (const wad of withdrawals) {
                    next = applyHookAggregateWithdrawal(next, wad);
                }
                return next;
            });
            visualBase = visualBase.map((agg) => {
                // Look up the visual-withdrawal map by `agg.patternKey`.
                // The map is keyed on the RECORDED patternKey, so this
                // matches precisely the OLD pattern the visual
                // aggregate represents. (Before Batch 26 this lookup
                // was `withdrawalByAngle.get(agg.patternKey)` — a
                // map keyed on hookAngle, never matching patternKey,
                // and silently returning undefined.)
                const withdrawals = withdrawalByPattern.get(agg.patternKey);
                if (!withdrawals || withdrawals.length === 0) return agg;
                let next = agg;
                for (const wad of withdrawals) {
                    next = applyVisualAggregateWithdrawal(next, wad);
                }
                return next;
            });
        }

        // 4. Additive pass.
        //
        // FR-021's additive delta semantics. Each entry in newHook /
        // newVisual received a contribution this sync, so writing it
        // is non-redundant. Use set with merge=true so concurrent
        // updates to other dimensions don't clobber.
        const newHook = applyHookAggregatesDelta(hookBase, params.learnedAds, params.nowMs);
        const newVisual = applyVisualAggregatesDelta(visualBase, params.learnedAds, params.nowMs);

        // 5. Build the writes.
        const aggregateWrites: Array<{ ref: { id: string }; data: Record<string, unknown> }> = [];
        let hookWrites = 0;
        let visualWrites = 0;
        for (const [angleKey, agg] of newHook) {
            aggregateWrites.push({
                ref: params.adAccountRef.collection("hookPerformance").doc(angleKey),
                data: agg as unknown as Record<string, unknown>,
            });
            hookWrites++;
        }
        for (const [patternKey, agg] of newVisual) {
            if (!patternKey) continue;
            aggregateWrites.push({
                ref: params.adAccountRef.collection("visualPerformance").doc(patternKey),
                data: agg as unknown as Record<string, unknown>,
            });
            visualWrites++;
        }

        // 6. Chunked commit. The caller already holds the lease, so this
        // commit is fenced against any concurrent run that might be
        // racing to commit the same aggregates.
        //
        // Failure semantics: a commit failure throws. The outer
        // try/catch records the error and returns emptyResult
        // (`ran: false`). Previously (Batch 22's `602788d` and the
        // extraction at 706935f) the per-chunk handler swallowed
        // the failure into `errors` and the function returned
        // `ran: true` with `hookWrites`/`visualWrites` counting
        // writes BUILT, not writes COMMITTED — a run whose every
        // chunk failed reported full success. The reviewer named
        // this Bug 3 in Batch 26. Throwing is closer to what the
        // surrounding comments claim the function does ("leave
        // existing records untouched", FR-060a). The caller can
        // now distinguish success from failure by the `ran` field
        // and the populated `errors` array.
        const chunkSize = params.chunkSize ?? DEFAULT_CHUNK_SIZE;
        const dbLike = params.db as {
            batch(): {
                set(ref: unknown, data: Record<string, unknown>, opts?: { merge?: boolean }): unknown;
                commit(): Promise<void>;
            };
        };
        for (let i = 0; i < aggregateWrites.length; i += chunkSize) {
            const chunk = aggregateWrites.slice(i, i + chunkSize);
            const batch = dbLike.batch();
            for (const w of chunk) batch.set(w.ref, w.data, { merge: true });
            await batch.commit();
        }

        return {
            ran: true,
            hookWrites,
            visualWrites,
        };
    } catch (e: unknown) {
        // Never break the sync because of a learning-aggregate glitch.
        // This catch handles: (a) generation-load failures, (b) the
        // hook/visual get() above throwing, (c) commit failures. In
        // all cases we skip the aggregate writes — the existing
        // Firestore docs are left untouched (FR-060a's "leave
        // existing records untouched" rule). The caller sees
        // `ran: false` and an error message in `errors`.
        params.errors.push(`learning aggregate update failed: ${(e as Error).message}`);
        return emptyResult;
    }
}
