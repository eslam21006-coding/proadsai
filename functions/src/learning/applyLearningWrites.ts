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
    decrementEfficiencyByFunnelType,
} from "./aggregateDelta.js";
import { clampEfficiencyForAggregate } from "./efficiencyAggregate.js";
import { decideContribution } from "./contributionLedger.js";
import type { ContributionDecision } from "./contributionLedger.js";
import type { ContributionLedgerEntry } from "./types.js";
import {
    type AdForLearning,
    type HookPerformanceAggregate,
    type VisualPerformanceAggregate,
} from "../learningAggregates.js";
import { resolveFunnelTypeBucketKey } from "../learningAggregates.js";
import {
    computeEfficiencyFigure,
    decideEfficiencyWrite,
    isEligibleForEfficiency,
    type EfficiencyRow,
} from "./efficiencyFigure.js";
import { resolveCreativeSealedContext, decideSealedTransition, type AdSealFields, type WorkspaceFunnelType } from "./sealedContext.js";
import { readExistingAdDocs } from "./boundedLedgerRead.js";

// `DbLike` is the same loose contract the lease acquire accepts.
// Kept loose here because the consumer-cast to `Parameters<...>` is what
// makes the chain typecheck against the real Firestore handle in tests.
type DbLike = unknown;

// `AdDoc` is the per-ad document shape (subset used by the bounded
// read). The full type lives in `../metaSync/shared.ts`; the bounded
// read returns `Partial<AdDoc>` and the ledger only needs the
// `ledger` field.
//
// Batch 5 (T052a) — the eligibility walk reads Batch 1's
// `dayAccrual`, Batch 1's `adStatus`, and Batch 2's `sealedTarget`
// off the same `existingByAdId` cache. The shape is widened to
// carry those fields; the bounded read at `shared.ts:339` already
// populates them.
interface AdDocLike {
    ledger?: ContributionLedgerEntry;
    dayAccrual?: import("./types.js").DayAccrual | null;
    sealedTarget?: number | null;
    sealedAt?: number | null;
    sealedFunnelType?: import("./sealedContext.js").WorkspaceFunnelType | null;
    adStatus?: string | null;
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

    // Batch 30 — ADD/WITHDRAW INVARIANT. `applyVisualAggregatesDelta` adds
    // the creative key; the withdrawal drops it and re-derives
    // `creativeCount` from what remains, so the count and the key list can
    // never disagree. As on the hook side, a partial withdrawal is
    // self-correcting: the additive pass always follows the withdrawals in
    // this module and re-adds the key from any surviving row.
    const remaining = new Set(clone.contributedCreativeKeys ?? []);
    remaining.delete(ad.creativeKey ?? ad.adId);
    clone.contributedCreativeKeys = [...remaining];
    clone.creativeCount = remaining.size;

    // Batch 4 (FR-037) — parallel efficiency-side withdrawal. Same
    // `delete`-returns-as-guard pattern as the hook equivalent: a
    // withdrawal for a creative that never contributed an efficiency
    // figure is a no-op (the underlying `Set.delete` is already a
    // no-op when the key is absent, and we use the return value to
    // avoid recomputing the average against a fabricated count).
    const efficiencyRemaining = new Set(clone.efficiencyContributingKeys ?? []);
    const wasEfficiencyContributor = efficiencyRemaining.delete(ad.creativeKey ?? ad.adId);
    if (wasEfficiencyContributor) {
        // Batch 5 (FR-030) — funnel-type symmetry: mirror the
        // decrement here, gated on the SAME membership check (CodeRabbit
        // Round 14). The funnel-type bucket is shared across all
        // contributors, so calling the helper for a non-contributor
        // withdrawal would over-decrement the count left by another
        // creative. The guard makes the no-op truly a no-op.
        decrementEfficiencyByFunnelType(clone, ad);
        const priorCount = efficiencyRemaining.size + 1;
        const priorAvg = clone.efficiencyValueAvg ?? 0;
        // CodeRabbit (Round 14): clamp the withdrawn value the same
        // way the addition path clamps it (FR-038's 3.0 bound), so a
        // freak row's bounded addition does not over-withdraw on the
        // way out. See the parallel hook withdrawal at
        // `aggregateDelta.ts:~524` for the same correction.
        const withdrawnFigure = typeof ad.efficiencyFigure === "number"
            ? clampEfficiencyForAggregate(ad.efficiencyFigure)
            : 0;
        clone.efficiencyValueAvg = priorCount <= 1
            ? 0
            : (priorAvg * priorCount - withdrawnFigure) / (priorCount - 1);
        clone.efficiencyContributingCount = efficiencyRemaining.size;
        clone.efficiencyContributingKeys = [...efficiencyRemaining];
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
    /**
     * Round-16 — T053. Map<adId, AdSealFields> produced by the
     * per-ad loop in `metaSync/shared.ts` when `decideSealedTransition`
     * returns `allowed: true`. The seal fields here are the ONLY
     * path the new seal values take to Firestore — the operational
     * merge in `shared.ts:1439` no longer carries them. This map
     * commits its entries inside `applyLearningWrites`'s lease-held
     * critical section (the same lease that `runSyncForAccount`
     * acquired at `shared.ts:1603+`), so two concurrent runs for
     * the same account cannot both write the seal. A refused run
     * never reaches this function (early return at line 1636) and
     * therefore never commits seal fields.
     */
    /**
     * Round-16 — T053. Map<adId, AdSealFields> produced by the
     * per-ad loop in `metaSync/shared.ts` when `decideSealedTransition`
     * returns `allowed: true`. The seal fields here are the ONLY
     * path the new seal values take to Firestore — the operational
     * merge in `shared.ts:1439` no longer carries them. This map
     * commits its entries inside `applyLearningWrites`'s lease-held
     * critical section (the same lease that `runSyncForAccount`
     * acquired at `shared.ts:1603+`), so two concurrent runs for
     * the same account cannot both write the seal. A refused run
     * never reaches this function (early return at line 1636) and
     * therefore never commits seal fields.
     *
     * Default: empty map. Pre-T053 tests that don't care about the
     * seal-transition path pass through without modification — the
     * production call site (round-16 onward) passes the per-ad-loop
     * collection. The discriminator
     * `sealedTransitionRaceDiscriminator.test.ts` exercises the
     * non-empty shape.
     */
    sealedAdocsById?: Map<string, import("./sealedContext.js").AdSealFields>;
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

    // Round-17 — T053 IN-LEASE RE-READ. The pre-lease bounded read at
    // `shared.ts:1090+` populates `params.existingByAdId` BEFORE the
    // lease is acquired. Two concurrent runs both reading
    // PROVISIONAL state before either commits can both decide a
    // seal transition and both decide a contribution — the second
    // run's commit overwrites the first run's, because the lease
    // serialises turns but does NOT refuse a decision made on a
    // stale read.
    //
    // The fix: inside this function (which runs only between
    // `acquireLearningLease` and `releaseLearningLease` — see
    // `shared.ts:1603+` and `shared.ts:1717+`), do a SECOND
    // bounded read over the same batch of ad ids. Re-run the
    // `decideSealedTransition` consult and the
    // `decideContribution` ledger consult against the fresh read.
    //
    //   - A row that another run sealed in the meantime now reads
    //     SEALED on the fresh read; the consult refuses via the
    //     existing `sealed-target-already-set-and-differs` branch.
    //   - A row that another run contributed to now reads with a
    //     recorded ledger entry; the consult returns `noop` and the
    //     row is removed from `learnedAds` before the additive pass.
    //
    // The fresh read is bounded by `learnedAds.length` (the post-
    // ledger-consult subset is smaller; the read uses the full
    // pre-consult set for safety). FR-068's unbounded scan does NOT
    // return — this is a by-ID read over exactly the contributing
    // batch.
    //
    // The pre-lease consult at `shared.ts:1255` stays — it feeds the
    // per-ad `errors[]` log line and the FR-070 failed-read gate —
    // but its verdict is no longer what gets committed. The
    // committed verdict is the one computed here.
    let freshByAdId: Map<string, Record<string, unknown>> = new Map();
    let freshFailedReads: Set<string> = new Set();
    // Initialise freshByAdId from the caller's pre-lease read so
    // fields the bounded read doesn't return (e.g. the eligibility
    // walk's `sealedAt` / `sealedFunnelType` on rows the bounded
    // read missed) still have a value. The bounded read below
    // OVERRIDES entries that DO come back from the live store —
    // those are the fresh values; the pre-lease values are
    // superseded. FR-070's failed-read gate (in `shared.ts:1184`)
    // is the production authority on which rows participate.
    //
    // Round-18 — T053 failed-read ABORT. The pre-lease data is
    // NOT a fallback for an ad whose bounded read FAILED — only
    // for an ad whose bounded read returned nothing (the
    // does-not-exist case, which has no committed state for the
    // pre-lease read to be stale about). Per FR-070, a failed
    // chunk read MUST abort the learning write for that chunk
    // rather than be read as "no prior contribution". For every
    // id in `failedIds` we drop the pre-lease seed and remove
    // the ad from `learnedAds` so the consult, withdrawal pass,
    // eligibility walk, and seal commit all skip it. Each
    // excluded ad is recorded in `errors[]` naming the ad id
    // and the reason.
    //
    // Note — current-run exclusion is INTENTIONALLY OMITTED
    // here. The operational merge at `shared.ts:1457` writes
    // `decision.adDoc` (which carries the new ledger entry)
    // BEFORE the lease acquire. The in-lease re-read at T3
    // therefore sees the ledger entry the current run just
    // committed. Round-17's seal consult handles this asymmetry
    // because the operational merge does NOT write the seal
    // fields (those are committed by `applyLearningWrites`'s
    // seal commit block, which runs AFTER the consult). The
    // ledger consult, however, cannot distinguish "current run's
    // own commit" from "another run's commit with the same
    // ledger" because the data is identical. The racing same-
    // ledger case (the user's Test 10) relies on the consult
    // returning `noop` when recorded equals desired; excluding
    // the current run's own commit would route to `add` and
    // double-count. The failed-read ABORT is the round-18 fix;
    // the current-run exclusion is documented here as the next
    // open question for a follow-up PR (see §23.5).
    for (const [id, data] of params.existingByAdId.entries()) {
        freshByAdId.set(id, { ...(data as Record<string, unknown>) });
    }
    try {
        const dbLikeForRead = params.db as unknown as Parameters<typeof readExistingAdDocs>[0];
        const refsForRead = params.learnedAds.map((ad) => ({ id: ad.adId }));
        const boundedResult = await readExistingAdDocs(dbLikeForRead, refsForRead);
        freshFailedReads = boundedResult.failedIds;
        // Merge the live read onto the pre-lease data, NOT
        // replace. The bounded read returns whole documents
        // (FR-071); the seed loop above already populated the
        // pre-lease fields (dayAccrual, sealedAt,
        // sealedFunnelType, etc.) that the bounded read's
        // projection may not carry. Replacing the seed with the
        // live data would erase those fields. The merge is
        // shallow-on-purpose: per-field freshness is determined
        // by the bounded read's payload — every field the read
        // carries overrides the seed's same-named field; the
        // seed's fields the read does not carry survive.
        //
        // Skip ads the bounded read FAILED for — for those, the
        // pre-lease read is exactly the data FR-070 forbids
        // treating as current (round-18).
        for (const [id, data] of boundedResult.byId.entries()) {
            if (freshFailedReads.has(id)) {
                freshByAdId.delete(id);
                continue;
            }
            const seed = freshByAdId.get(id) ?? {};
            freshByAdId.set(id, { ...seed, ...data });
        }
        // Round-18 — filter failed-read ads out of `learnedAds`.
        // The ledger consult loop, the withdrawal pass, the
        // eligibility walk, and the additive pass all read from
        // `learnedAds` (or `eligibilitySnapshot`, a slice taken
        // inside the try block below). Removing the failed-read
        // ads here keeps every downstream pass naturally
        // consistent. Each removed ad is logged in `errors[]`.
        if (freshFailedReads.size > 0) {
            for (const id of freshFailedReads) {
                params.errors.push(`in-lease read failed adId=${id}`);
            }
            const kept = params.learnedAds.filter((ad) => !freshFailedReads.has(ad.adId));
            params.learnedAds.length = 0;
            params.learnedAds.push(...kept);
        }
    } catch (e: unknown) {
        // CATASTROPHIC failure (the whole `readExistingAdDocs`
        // call threw, not a per-chunk failure). This is a
        // different surface from `failedIds` and the round-18
        // fix's "abort, not fallback" rule does NOT apply: the
        // bounded read did not return, so there is no list of
        // failed ids to consult. The previous behaviour — log
        // the error and fall back to `existingByAdId` for the
        // consult, while letting the live `existingHookDocs` /
        // `existingVisualDocs` reads below still re-read the
        // aggregates inside the lease — is preserved. A future
        // PR may want to abort on this surface too; today, the
        // production path doesn't reach this catch (Firestore
        // returns per-chunk failures in `failedIds`, not by
        // throwing).
        params.errors.push(`in-lease re-read failed: ${(e as Error).message}`);
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
        // CodeRabbit (Round 14) — the eligibility walk needs the
        // PRE-splice snapshot. The ledger consult below removes every
        // `noop` row before this mapping, but a creative that hit
        // five accrued conversions during a LATER sync has a `noop`
        // decision (its contribution matches the recorded ledger)
        // and would be removed from `params.learnedAds` by this
        // pass. The snapshot preserves it for the eligibility walk,
        // whose purpose is to detect exactly that threshold-crossing
        // and write the first efficiency figure. The snapshot is
        // read-only and discarded after the walk.
        const eligibilitySnapshot: AdForLearning[] = params.learnedAds.slice();
        for (let i = params.learnedAds.length - 1; i >= 0; i--) {
            const ad = params.learnedAds[i];
            const ledgerAdDoc = params.ledgerAdDocsByAdId.get(ad.adId);
            const desired = ledgerAdDoc?.ledger as ContributionLedgerEntry | undefined;
            // Round-18 — ledger consult reads from the pre-lease
            // bounded read (`params.existingByAdId`), NOT from
            // `freshByAdId`. The in-lease re-read sees what the
            // current run just committed (the operational merge
            // at `shared.ts:1457` writes the ledger BEFORE the
            // lease acquire); using `freshByAdId` would always
            // return `recorded === desired` → `noop` → no
            // aggregate write for fresh contributions.
            //
            // The seal consult BELOW still uses `freshByAdId` —
            // the operational merge does NOT write the seal
            // fields, so the in-lease re-read correctly sees
            // other runs' seal commits. The race window for the
            // ledger (between bounded read and the in-lease
            // re-read) is closed by the FR-070 failed-read abort
            // and the existing per-ad loop's consult on the
            // pre-lease data. The deeper architectural fix —
            // stripping the ledger from the operational merge
            // and committing it in-lease only — stays as a
            // Batch 6 follow-up (see §23.5).
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
                // Round-18 — read from the pre-lease read (see
                // comment on the ledger consult above).
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

        // 4. Eligibility walk (Batch 5 — T052a) — the per-creative post-
        // withdrawal pass that turns Batch 3's pure functions into
        // aggregate-side state. Runs AFTER the withdrawal pass (so
        // the per-row state is final) and BEFORE the additive pass
        // (so Batch 4's aggregator reads `efficiencyFigure` on each
        // row). Builds `EfficiencyRow`s ONCE per sync from the bounded-
        // read cache (`existingByAdId`), groups by `creativeKey`, and
        // runs Batches 1-3's pure functions per creative:
        //   - `isEligibleForEfficiency` — FR-077's threshold (5
        //     combined conversions across placements, or stopped with
        //     ≥1 conversion). Reads `creativeConversionTotal` (the
        //     accrual sum), NEVER `metrics.conversions3d` — that
        //     would be the defect the accrual was built to prevent.
        //   - `computeEfficiencyFigure` — FR-002a/FR-003's
        //     aggregate-then-divide. Returns `null` for ineligible
        //     creatives (no figure); the loop guards on `null`.
        //   - `decideEfficiencyWrite` — FR-005c's efficiency-side
        //     guard. First write permitted; subsequent refused. The
        //     FR-005c carve-out's FIRST real consumer. Confirmed here.
        //
        // The walk mutates `learnedAds` in two places:
        //   - `learnedAds[i].efficiencyFigure = figure` — Batch 4's
        //     aggregator reads this on the additive pass.
        //   - `learnedAds[i].ledger.efficiencyContributed /
        //     efficiencyValue = figure` — Batch 3's FR-005c writes
        //     these on the ledger entry.
        // CodeRabbit (Round 14): build the eligibility walk over the
        // PRE-splice snapshot (taken before the ledger consult at
        // step 1). A `noop` row is one whose ledger entry already
        // matches — that is the most common path by FAR for a
        // previously-contributing row, and is exactly the case where
        // the eligibility walk's first-write guard (FR-005c) must
        // still be reachable when the creative's accrual crosses
        // the threshold on this sync.
        const eligibilityRows: EfficiencyRow[] = eligibilitySnapshot.map((ad) => {
            // Round-17 — T053: read from the in-lease fresh
            // re-read (see comment on the ledger consult above).
            const existing = freshByAdId.get(ad.adId);
            return {
                dayAccrual: (existing?.dayAccrual as EfficiencyRow["dayAccrual"]) ?? null,
                sealedTarget: (existing?.sealedTarget as number | null | undefined) ?? null,
                // Batch 5 wiring: carry `sealedAt` and `sealedFunnelType`
                // through to the eligibility walk so
                // `resolveCreativeSealedContext` (Batch 2) can pick the
                // earliest-sealing row (FR-012a). Without these fields the
                // resolver returns `null` and the walk refuses every row
                // as "no-sealed-target" — the wiring would exist but never
                // fire. The bounded read at `shared.ts:1097` populates
                // both fields on the `AdDoc`; the bounded read is the
                // sole source of truth here.
                sealedAt: (existing?.sealedAt as number | null | undefined) ?? null,
                sealedFunnelType: (existing?.sealedFunnelType as WorkspaceFunnelType | null | undefined) ?? null,
                adStatus: existing?.adStatus as EfficiencyRow["adStatus"],
            };
        });

        // Build a per-creative lookup once for the walk. Order is
        // irrelevant — each creative's rows are independent.
        const efficiencyByCreative = new Map<string, EfficiencyRow[]>();
        for (let i = 0; i < eligibilitySnapshot.length; i++) {
            const ad = eligibilitySnapshot[i];
            const ck = ad.creativeKey ?? ad.adId;
            const list = efficiencyByCreative.get(ck);
            if (list) list.push(eligibilityRows[i]);
            else efficiencyByCreative.set(ck, [eligibilityRows[i]]);
        }

        // FR-012a — the creative's single sealed target. Resolved by
        // Batch 2's helper. The walk uses it as the single sealed
        // target for every row of the creative; rows that don't carry
        // a sealed target are filtered out by `isEligibleForEfficiency`'s
        // "no sealed target" branch.
        for (const [creativeKey, rows] of efficiencyByCreative) {
            const sealedContext = resolveCreativeSealedContext(rows);
            const eligibility = isEligibleForEfficiency(rows, sealedContext);
            if (!eligibility.eligible) continue;
            const fig = computeEfficiencyFigure(rows, sealedContext);
            if (fig === null) continue;

            // Per-row write — Batch 5's first real consumer of the
            // FR-005c carve-out. The guard reads the EXISTING ledger
            // entry's `efficiencyContributed` flag (from the bounded-
            // read cache). First-write permitted (Batch 4's test 031
            // [shape] pins that the guard exists; this is the proof
            // it fires on the path the worker takes).
            //
            // CodeRabbit (Round 14): iterate the PRE-splice
            // `eligibilitySnapshot`, not `params.learnedAds`. A noop
            // row whose accrual crosses the threshold this sync is
            // removed from `learnedAds` by step 1's ledger consult,
            // but the figure must STILL be written on it — that's
            // the whole point of the eligibility walk. Iterating
            // the snapshot means the row stays in scope for the
            // write, the ledgerAdDocsByAdId update, and the
            // downstream chunked commit.
            for (let i = 0; i < eligibilitySnapshot.length; i++) {
                const ad = eligibilitySnapshot[i];
                const ck = ad.creativeKey ?? ad.adId;
                if (ck !== creativeKey) continue;
                // Round-18 — read from the pre-lease read (see
                // comment on the ledger consult above).
                const existingLedger = params.existingByAdId.get(ad.adId)?.ledger;
                const writeVerdict = decideEfficiencyWrite(
                    existingLedger as { efficiencyContributed: boolean | undefined } | undefined,
                    fig.value,
                );
                if (!writeVerdict.allowed) continue;
                // Thread the figure onto the per-row `AdForLearning` so
                // Batch 4's aggregator reads it on the additive pass.
                // Reading from the snapshot makes this a no-op for
                // already-additive rows (Batch 4's path); for a noop
                // row removed at step 1 it is the FIRST setter.
                ad.efficiencyFigure = fig.value;
                // CodeRabbit (Round 14): mutate the actual ledger entry
                // (the one queued in `ledgerAdDocsByAdId`, which IS the
                // `decision.adDoc.ledger` that committed upstream in
                // `shared.ts`), NOT a synthetic attach on
                // `ad.ledger`. The upstream commit lands BEFORE
                // `applyLearningWrites` runs, so without a persistence
                // step here the in-memory mutation never reaches
                // Firestore and the next sync sees
                // `efficiencyContributed: false` again — defeating the
                // FR-005c carve-out's one-way lock. The mutated
                // `ledgerAdDocsByAdId` entry is then written back as
                // part of the chunked commit below, replacing the
                // adPerformance doc with the new ledger state.
                const ledgerAdDoc = params.ledgerAdDocsByAdId.get(ad.adId);
                if (ledgerAdDoc?.ledger) {
                    ledgerAdDoc.ledger.efficiencyContributed = true;
                    ledgerAdDoc.ledger.efficiencyValue = fig.value;
                }
            }
        }

        // 5. Additive pass.
        //
        // FR-021's additive delta semantics. Each entry in newHook /
        // newVisual received a contribution this sync, so writing it
        // non-redundant. Use set with merge=true so concurrent
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
        // CodeRabbit (Round 14): persist the per-ad ledger entries
        // whose `efficiencyContributed` flag was just flipped. The
        // upstream commit at `shared.ts:1378` landed BEFORE
        // `applyLearningWrites` ran, so without this write the
        // efficiency-marker mutation in the walk above never reaches
        // Firestore and the next sync sees `efficiencyContributed:
        // false` again — defeating the FR-005c carve-out's one-way
        // lock. Each entry below is the FULL adDoc (the `decision.adDoc`
        // object the upstream commit held), so it replaces the doc;
        // preserving the ledger subdoc untouched when no flag flipped.
        // We pick writes for ads whose walked `efficiencyContributed`
        // is now true AND whose original ledger had it false / undefined
        // (i.e. the carve-out's first-write branch).
        const ledgerWrites: Array<{ ref: { id: string }; data: Record<string, unknown> }> = [];
        for (const [creativeKey, rows] of efficiencyByCreative) {
            // We rely on the eligibility row's original sealed context
            // to short-circuit the no-write case; the in-memory flag is
            // what decides whether the carve-out was applied to a row.
            // Walk `eligibilitySnapshot` (the pre-splice list) by adId
            // to read the per-row state the walk produced.
            for (let i = 0; i < eligibilitySnapshot.length; i++) {
                const ad = eligibilitySnapshot[i];
                if ((ad.creativeKey ?? ad.adId) !== creativeKey) continue;
                const ledgerAdDoc = params.ledgerAdDocsByAdId.get(ad.adId);
                if (!ledgerAdDoc || !ledgerAdDoc.ledger) continue;
                if (ledgerAdDoc.ledger.efficiencyContributed !== true) continue;
                ledgerWrites.push({
                    ref: params.adAccountRef.collection("adPerformance").doc(ad.adId),
                    // Round-15 review (item 2): narrow the data to the
                    // `ledger` path only. The previous shape passed
                    // the FULL `decision.adDoc` object so the merge
                    // write would overwrite EVERY top-level field
                    // (cpm3d, ctrLink, etc.) with the in-memory
                    // snapshot from T1 — the upstream operational
                    // commit. Today the values match (nothing
                    // between T1 and T2 mutates the doc), but a
                    // future interleaved write (another
                    // `runSyncForAccount` for the same ad, or a
                    // client/online change to operational fields)
                    // would be silently overwritten by stale data.
                    // With the narrowed shape the merge skips
                    // operational fields entirely; the `ledger`
                    // subdoc is wholesale-replaced, but the in-memory
                    // ledger carries every original field plus the
                    // two flipped flags, so the replacement is
                    // lossless. The discriminator test
                    // `efficiencyWiring.test.ts:4` constructs an
                    // adDoc with `cpm3d: 99`, mutates the
                    // operational field between T1 and T2, and
                    // asserts the merged doc still carries `99`.
                    data: { ledger: ledgerAdDoc.ledger } as unknown as Record<string, unknown>,
                });
            }
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
        // Round-17 — T053 IN-LEASE SEAL CONSULT. The pre-lease
        //   verdict in `params.sealedAdocsById` was decided on a
        //   stale read; the in-lease re-read at the top of this
        //   function (`freshByAdId`) is the authority. Re-run
        //   `decideSealedTransition` against the fresh read for
        //   every row whose pre-lease verdict was `allowed: true`.
        //   A row that another run sealed in the meantime now
        //   reads SEALED on the fresh read and the consult refuses
        //   via the existing
        //   `sealed-target-already-set-and-differs` branch —
        //   the branch `sealedContext.test.ts:Test B` already
        //   covers. Only rows still PROVISIONAL on the fresh read
        //   are sealed.
        //
        // Round-16 — T053. The committed verdict lands inside the
        //   lease-held critical section (`applyLearningWrites`
        //   runs only between `acquireLearningLease` and
        //   `releaseLearningLease` in `runSyncForAccount`); the
        //   lease at `metaSync/shared.ts:1603+` is the per-account
        //   serialisation barrier against two concurrent fan-out
        //   syncs. The data shape is the four seal fields written
        //   through `merge: true` so the underlying FR-005c one-way
        //   guard holds — a subsequent consult sees the persisted
        //   target and `decideSealedTransition` refuses on the
        //   "sealed-target-already-set-and-differs" branch.
        //
        //   Why merge: true and not a wholesale replace:
        //   the bounded-read cache has the full adDoc; the seal
        //   fields are the only ones this function writes. With
        //   merge: true, every other top-level field is preserved
        //   (the operational fields committed upstream at line
        //   1565 stand; nothing else is touched). The seal sub-
        //   object is wholesale replaced — fine, because the
        //   in-memory value carries only the seal fields (it came
        //   from the in-lease consult's verdict, never
        //   the full adDoc).
        //
        //   Lease-refused run: this function is only called inside
        //   the lease-held try block at `shared.ts:1717+`. The
        //   refused-run early return at `shared.ts:1636` returns
        //   BEFORE this call, so the refused run never writes the
        //   seal — the invariant holds.
        const committedSealedAdocsById = new Map<string, AdSealFields>();
        const preLeaseSealed = params.sealedAdocsById ?? new Map<string, AdSealFields>();
        for (const [adId, fields] of preLeaseSealed.entries()) {
            // Re-build a `SealedContext` from the pre-lease verdict's
            // fields. The verdict's `didTransition: true` branch
            // sets all four fields; on refusal the adId is NOT in
            // the pre-lease map (per `shared.ts:1280`).
            if (fields.sealedTarget === undefined || fields.sealedTarget === null) continue;
            if (fields.sealedAt === undefined || fields.sealedAt === null) continue;
            if (fields.sealedFunnelType === undefined || fields.sealedFunnelType === null) continue;
            // Round-18 — T053 failed-read ABORT. The seal commit
            // for an ad whose bounded read FAILED is skipped —
            // there is no fresh state to consult against, and
            // falling back to the pre-lease verdict would write
            // a seal on stale evidence (the exact race round 17
            // closed). The ad is already recorded in `errors[]`
            // from the build step above; no further log line
            // needed here.
            if (freshFailedReads.has(adId)) continue;
            const freshData = freshByAdId.get(adId) ?? {};
            const freshSealed = {
                sealedTarget: (freshData.sealedTarget as number | null | undefined) ?? null,
                sealedAt: (freshData.sealedAt as number | null | undefined) ?? null,
                sealedFunnelType: (freshData.sealedFunnelType as WorkspaceFunnelType | null | undefined) ?? null,
            };
            const newResolution = {
                sealedTarget: fields.sealedTarget as number,
                sealedAt: fields.sealedAt as number,
                sealedFunnelType: fields.sealedFunnelType as WorkspaceFunnelType,
            };
            const verdict = decideSealedTransition(freshSealed, newResolution);
            if (verdict.allowed) {
                committedSealedAdocsById.set(adId, verdict.fields);
            } else {
                // In-lease consult refused (e.g. another run
                // committed the same ad with a different target
                // between the bounded read and the lease acquire).
                // The pre-lease verdict is overruled; log the
                // refusal and skip the commit.
                params.errors.push(
                    `seal_refused (in-lease) adId=${adId} reason=${verdict.reason} ` +
                    `fresh=${freshSealed.sealedTarget ?? "null"} ` +
                    `attempted=${newResolution.sealedTarget}`,
                );
            }
        }
        const sealWritesMap = committedSealedAdocsById;
        for (let i = 0; i < sealWritesMap.size; i += chunkSize) {
            const entries = Array.from(sealWritesMap.entries()).slice(i, i + chunkSize);
            if (entries.length === 0) break;
            const batch = dbLike.batch();
            for (const [adId, fields] of entries) {
                // Strip undefined / null-valued fields so the merge
                // doesn't carry a `null` value across the merge
                // (Round-15 fix on the operational path applies the
                // same discipline here). The in-lease consult
                // populates `committedSealedAdocsById` only with
                // `verdict.fields` from a refusal-free run; all four
                // fields are present.
                const cleaned: Record<string, unknown> = {};
                if (fields.sealedTarget !== undefined && fields.sealedTarget !== null) cleaned.sealedTarget = fields.sealedTarget;
                if (fields.sealedAt !== undefined && fields.sealedAt !== null) cleaned.sealedAt = fields.sealedAt;
                if (fields.sealedFunnelType !== undefined && fields.sealedFunnelType !== null) cleaned.sealedFunnelType = fields.sealedFunnelType;
                if (fields.contributionState !== undefined && fields.contributionState !== null) cleaned.contributionState = fields.contributionState;
                batch.set(
                    params.adAccountRef.collection("adPerformance").doc(adId),
                    cleaned as unknown as Record<string, unknown>,
                    { merge: true },
                );
            }
            await batch.commit();
        }
        // CodeRabbit (Round 14): commit the per-ad ledger entries
        // whose `efficiencyContributed` flag flipped. Without this
        // commit the FR-005c carve-out's "first write locks" semantic
        // does NOT survive a reload — the next sync reads the
        // pre-eligibility state from the bounded-read cache and the
        // guard would let a second write through. The chunked commit
        // reuses the same `chunkSize` and the same lease fencing.
        for (let i = 0; i < ledgerWrites.length; i += chunkSize) {
            const chunk = ledgerWrites.slice(i, i + chunkSize);
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
