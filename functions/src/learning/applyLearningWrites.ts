// functions/src/learning/applyLearningWrites.ts — read-modify-write of the
// learning aggregates, extracted from `metaSync/shared.ts` so the lease
// can span the entire critical section (Item 1 of the Batch 21/22
// review-of-review).
//
// This module owns:
//   - the per-row contribution consult against the recorded ledger
//     (all four `decideContribution` outcomes: `add`, `noop`,
//     `withdraw_then_add`, `withdraw_only`)
//   - the `existingHookDocs` / `existingVisualDocs` aggregate read
//   - the withdrawal application (`applyHookAggregateWithdrawal`,
//     `applyVisualAggregateWithdrawal`)
//   - the additive pass (`applyHookAggregatesDelta`,
//     `applyVisualAggregatesDelta`)
//   - the chunked commit of `aggregateWrites`
//
// It does NOT own:
//   - the bounded adPerformance read (caller passes `existingByAdId`)
//   - the lease acquire/release (caller wraps the call)
//
// Step 1 of the Batch 22 work — extract without behavioural change.
// Step 2 will acquire the lease around the call site.

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
// Kept as `unknown` here to avoid the chain pulling in firestore types.
type DbLike = unknown;

// `AdDoc` is the per-ad document shape (subset used by the bounded
// read). The full type lives in `../metaSync/shared.ts`; the bounded
// read returns `Partial<AdDoc>` and the ledger only needs the
// `ledger` field.
interface AdDocLike {
    ledger?: ContributionLedgerEntry;
}
type ExistingByAdId = Map<string, AdDocLike>;

// `DecideContributionOutcome` mirrors the discriminated union in
// `contributionLedger.ts` (kept as a local copy here to avoid
// importing a type that is itself an internal detail of the
// consult path).
type DecideContributionOutcome = ContributionDecision;

// `applyVisualAggregateWithdrawal` is the visual aggregate's
// symmetric counterpart to the hook variant. The hook variant is
// exported from `aggregateDelta.ts`; the visual variant is local
// to this module until it can be lifted into `aggregateDelta.ts`
// in a follow-up (TODO).
function applyVisualAggregateWithdrawal(
    existing: VisualPerformanceAggregate,
    ad: AdForLearning,
): VisualPerformanceAggregate {
    const clone: VisualPerformanceAggregate = JSON.parse(JSON.stringify(existing));
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        if (clone.sampleSize > 0) clone.sampleSize -= 1;
        if (clone.byObjective.conversion.count > 0) {
            clone.byObjective.conversion.count -= 1;
        }
        const tier = ad.geoTier;
        if (clone.byGeoTier[tier] && clone.byGeoTier[tier].count > 0) {
            clone.byGeoTier[tier] = { ...clone.byGeoTier[tier], count: clone.byGeoTier[tier].count - 1 };
        }
        const aud = ad.audienceType;
        if (clone.byAudienceType[aud] && clone.byAudienceType[aud].count > 0) {
            clone.byAudienceType[aud] = { ...clone.byAudienceType[aud], count: clone.byAudienceType[aud].count - 1 };
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
    /** Firestore handle (DbLike — passed through to `.batch()` / `.collection().get()`). */
    db: DbLike;
    /** The workspace-scoped ad-account reference (`metaSync/shared.ts` builds it). */
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
    /** Whether the function ran the consult + read + compute + commit. False when `learnedAds` was empty. */
    ran: boolean;
    /** Map of `angleKey` → post-additive `HookPerformanceAggregate` (empty map if `ran === false`). */
    hookByKey: Map<string, HookPerformanceAggregate>;
    /** Map of `patternKey` → post-additive `VisualPerformanceAggregate` (empty map if `ran === false`). */
    visualByKey: Map<string, VisualPerformanceAggregate>;
    /** Counts of aggregate writes pushed to the chunked commit (for test assertions). */
    hookWritesPushed: number;
    visualWritesPushed: number;
}

const DEFAULT_CHUNK_SIZE = 450;

/**
 * Apply learning writes end-to-end:
 *   1. Consult the contribution ledger for each row in `learnedAds`
 *      (handles all four `decideContribution` outcomes — see comment
 *      in BATCH 21 of `metaSync/shared.ts`).
 *   2. Apply withdrawals against the recorded geometry (the
 *      `existingHook` / `existingVisual` baseline that the caller
 *      would have read INSIDE the lease).
 *   3. Run the additive pass against the post-withdrawal baseline.
 *   4. Chunked commit of `aggregateWrites`.
 *
 * Designed to be called INSIDE a lease-held `try` block. The caller
 * is responsible for acquiring and releasing the lease; this
 * function does NOT touch the lease.
 *
 * Behaviour-preserving extraction: this function does exactly what
 * the inline code in `metaSync/shared.ts` did, just lifted into a
 * function. Step 2 of the Batch 22 work acquires the lease around
 * the call.
 */
export async function applyLearningWrites(
    params: ApplyLearningWritesParams,
): Promise<ApplyLearningWritesResult> {
    const emptyResult: ApplyLearningWritesResult = {
        ran: false,
        hookByKey: new Map(),
        visualByKey: new Map(),
        hookWritesPushed: 0,
        visualWritesPushed: 0,
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

        // 3. Withdrawal application.
        //
        // Group withdrawals by angle/pattern, apply each one against
        // the existing aggregate, THEN run the additive pass against
        // the post-withdrawal baseline.
        let hookBase = existingHook;
        let visualBase = existingVisual;
        if (withdrawalHookAds.length > 0) {
            const withdrawalByAngle = new Map<string, AdForLearning[]>();
            for (const wad of withdrawalHookAds) {
                const hookAngle = wad.hookAngle;
                if (hookAngle === null) continue;
                const key: string = hookAngle as string;
                const existing = withdrawalByAngle.get(key);
                if (existing !== undefined) existing.push(wad);
                else withdrawalByAngle.set(key, [wad]);
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
                const withdrawals = withdrawalByAngle.get(agg.patternKey);
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

        // 5. Build aggregateWrites.
        const aggregateWrites: Array<{ ref: { id: string }; data: Record<string, unknown> }> = [];
        let hookWritesPushed = 0;
        let visualWritesPushed = 0;
        for (const [angleKey, agg] of newHook) {
            aggregateWrites.push({
                ref: params.adAccountRef.collection("hookPerformance").doc(angleKey),
                data: agg as unknown as Record<string, unknown>,
            });
            hookWritesPushed++;
        }
        for (const [patternKey, agg] of newVisual) {
            if (!patternKey) continue;
            aggregateWrites.push({
                ref: params.adAccountRef.collection("visualPerformance").doc(patternKey),
                data: agg as unknown as Record<string, unknown>,
            });
            visualWritesPushed++;
        }

        // 6. Chunked commit.
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
            await batch.commit().catch((e: unknown) => {
                params.errors.push(`aggregate batch commit failed: ${(e as Error).message}`);
            });
        }

        return {
            ran: true,
            hookByKey: newHook,
            visualByKey: newVisual,
            hookWritesPushed,
            visualWritesPushed,
        };
    } catch (e: unknown) {
        // Never break the sync because of a learning-aggregate glitch.
        // This catch handles: (a) generation-load failures, (b) the
        // hook/visual get() above throwing. In both cases we skip the
        // aggregate writes — the existing Firestore docs are left
        // untouched.
        params.errors.push(`learning aggregate update failed: ${(e as Error).message}`);
        return emptyResult;
    }
}
