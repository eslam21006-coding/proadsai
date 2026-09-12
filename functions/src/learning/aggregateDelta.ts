// functions/src/learning/aggregateDelta.ts — T018 additive aggregation
// ══════════════════════════════════════════════════════════════════════
// PURE module. Implements FR-021's additive delta semantics for the
// learning aggregators. Replaces the OVERWRITE contract that
// `learningAggregates.ts` previously implemented.
//
// FR-021: "Records MUST store the raw sums and counts from which
// averages are derived, so that a contribution can be added or
// withdrawn exactly, without recomputing from history and without
// accumulating rounding drift across repeated operations."
//
// FR-015: "Angle and visual-pattern records MUST accumulate across
// the entire history of the account. A stored record MUST represent
// all-time evidence, not the most recent sync's evidence."
//
// FR-018: "Processing the same sync payload any number of times MUST
// leave the stored learning records in exactly the state produced by
// processing it once. No ad may ever be counted twice." —
// implementation lives in `contributionLedger.ts` (T017); this module
// applies the decided deltas atomically.
//
// ─── Why a separate module ─────────────────────────────────────
//
// This module provides the ADDITIVE aggregators
// (`applyHookAggregatesDelta`, `applyVisualAggregatesDelta`) consumed
// by the worker in `metaSync/shared.ts`. They are the only aggregation
// path in this codebase.
//
// History: `learningAggregates.ts` previously exported OVERWRITE-
// semantics aggregators (`updateHookAggregates`, `updateVisualAggregates`).
// They were retired as of Batch 11; the previous report (Batch 06)
// claimed a deletion that did not actually happen, leaving the legacy
// functions alongside their tests for several batches. The legacy tests
// are gone from tracked source (deleted in Batch 06) and from the
// chain (Batch 11 #1); this batch completes the removal by deleting
// the functions themselves.

import type {
    HookPerformanceAggregate,
    VisualPerformanceAggregate,
} from "../learningAggregates.js";
import type { AdForLearning } from "../learningAggregates.js";
import { EMPTY_BY_FUNNEL_TYPE, resolveFunnelTypeBucketKey } from "../learningAggregates.js";

// ─── Hook aggregator — additive deltas ─────────────────────────

/**
 * Compute the hook aggregates produced by APPLYING the new
 * contributions in `ads` to the existing aggregate. Returns a NEW
 * aggregate per angle; the existing aggregates are not mutated.
 *
 * If `existing` is empty, the result equals what an OVERWRITE
 * computation would produce for the same `ads` (the additive and
 * overwrite contracts coincide on the empty baseline). For partial
 * syncs — the common case once contributions accumulate — the
 * additive shape is the difference: historical evidence in
 * `existing` is preserved and this sync's contributions are added.
 */
export function applyHookAggregatesDelta(
    existing: ReadonlyArray<HookPerformanceAggregate>,
    ads: ReadonlyArray<AdForLearning>,
    syncAt: number,
): Map<string, HookPerformanceAggregate> {
    // Internal Map carries HookWorkingAggregate (with the contributedCreatives
    // Set). Stripped to HookPerformanceAggregate on return.
    const byAngleKey = new Map<string, HookWorkingAggregate>();
    for (const agg of existing) byAngleKey.set(agg.angleKey, cloneHook(agg));

    // T021/T022: group rows by creativeKey so that the unit of evidence
    // is the creative. When `creativeKey` is absent (older fixtures),
    // we fall back to `adId` — per-row identity — so the existing test
    // surface stays compatible.
    //
    // For each creative group:
    //   - any-row eligibility (FR-074g): if ANY row in the group is
    //     eligible, the creative contributes.
    //   - all-rows aggregation: every eligible row's values aggregate.
    //   - contribution count: the creative contributes ONE count to
    //     the angle (the unit of evidence is the creative).
    const groups = groupAdsByCreative(ads);

    for (const [creativeKey, rows] of groups) {
        // any-row eligibility: drop the creative if no row qualifies.
        const eligibleRows = rows.filter(isAdEligible);
        if (eligibleRows.length === 0) continue;

        // Group all eligible rows by the angle they contribute to.
        // Within each angle, the creative contributes ONE count
        // (per FR-073 — creative is the unit of evidence) but
        // ALL-ROWS aggregation applies the row values.
        const adsByAngleKey = new Map<string, AdForLearning[]>();
        for (const ad of eligibleRows) {
            if (ad.hookAngle === null) continue;
            const canonical = resolveCanonicalAngleLocal(ad.hookAngle);
            if (!canonical) continue;
            const list = adsByAngleKey.get(canonical);
            if (list) list.push(ad);
            else adsByAngleKey.set(canonical, [ad]);
        }

        for (const [angleKey, angleRows] of adsByAngleKey) {
            const existing_agg = byAngleKey.get(angleKey);
            const agg = existing_agg ?? emptyHook(angleKey);
            // FIRST creative contribution to this angle from this
            // creative → increment creativeCount. Subsequent rows of
            // the same creative to the same angle don't re-increment.
            if (!agg.contributedCreatives.has(creativeKey)) {
                agg.contributedCreatives.add(creativeKey);
                agg.creativeCount = (agg.creativeCount ?? 0) + 1;
            }
            // FR-020: counts never decrease. All eligible rows of the
            // creative contribute their values to the angle's sums.
            for (const ad of angleRows) {
                applyAdToHook(agg, ad);
            }
            agg.lastUpdated = syncAt;
            byAngleKey.set(angleKey, agg);
        }
    }

    // Batch 28 (Fix B, FR-036): the Set is working state and cannot be
    // stored (Firestore holds JSON — a Set serialises to `{}`), so it is
    // written out as `contributedCreativeKeys` and read back by
    // `cloneHook`. `creativeCount` is DERIVED from the set's size rather
    // than incremented independently, so the two can never disagree.
    const out = new Map<string, HookPerformanceAggregate>();
    for (const [angleKey, agg] of byAngleKey) {
        const { contributedCreatives, ...rest } = agg;
        out.set(angleKey, {
            ...rest,
            contributedCreativeKeys: [...contributedCreatives],
            creativeCount: contributedCreatives.size,
        });
    }
    return out;
}

/**
 * T022: group rows by creativeKey (or adId fallback) so the unit of
 * evidence is the creative. Pure function.
 */
function groupAdsByCreative(ads: ReadonlyArray<AdForLearning>): Map<string, AdForLearning[]> {
    const groups = new Map<string, AdForLearning[]>();
    for (const ad of ads) {
        const key = ad.creativeKey ?? ad.adId;
        const list = groups.get(key);
        if (list) list.push(ad);
        else groups.set(key, [ad]);
    }
    return groups;
}

function applyAdToHook(agg: HookWorkingAggregate, ad: AdForLearning): void {
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        agg.sampleSize += 1; // FR-020: counts are non-decreasing for conversion
        agg.byObjective.conversion.count += 1;
        agg.byObjective.conversion.avgLinkCtr = round2(
            weightedAvg(
                agg.byObjective.conversion.avgLinkCtr,
                agg.byObjective.conversion.count - 1, // count BEFORE this ad
                agg.byObjective.conversion.avgLinkCtr * (agg.byObjective.conversion.count - 1)
                    + ad.ctrLink,
                agg.byObjective.conversion.count,
            ),
        );
        if (ad.verdict === "🟢") agg.byObjective.conversion.bestVerdictCount += 1;
        if (ad.verdict === "🔴") agg.byObjective.conversion.worstVerdictCount += 1;
        // FR-027 / T047: per-funnel-type breakdown. Mirrors the all-rows
        // semantics of `byObjective.conversion.count` — every contributing
        // row counts once against its attributed funnel bucket. The
        // aggregator attributes rows to the workspace's funnel type read
        // at sync time; missing attribution falls back to "unknown"
        // (FR-032 — receives no same-funnel weighting but still counts
        // toward headline totals).
        incrementByFunnelType(agg, ad);
        const tier = ad.geoTier;
        const tierBefore = agg.byGeoTier[tier];
        agg.byGeoTier[tier] = {
            count: tierBefore.count + 1,
            avgCtr: round2((tierBefore.avgCtr * tierBefore.count + ad.ctrLink) / (tierBefore.count + 1)),
        };
        const aud = ad.audienceType;
        const audBefore = agg.byAudienceType[aud];
        agg.byAudienceType[aud] = {
            count: audBefore.count + 1,
            avgCtr: round2((audBefore.avgCtr * audBefore.count + ad.ctrLink) / (audBefore.count + 1)),
        };
    } else {
        agg.byObjective.other.count += 1;
        agg.byObjective.other.avgLinkCtr = round2(
            weightedAvg(
                agg.byObjective.other.avgLinkCtr,
                agg.byObjective.other.count - 1,
                agg.byObjective.other.avgLinkCtr * (agg.byObjective.other.count - 1) + ad.ctrLink,
                agg.byObjective.other.count,
            ),
        );
    }
}

// ─── Visual aggregator — additive deltas ────────────────────────

export function applyVisualAggregatesDelta(
    existing: ReadonlyArray<VisualPerformanceAggregate>,
    ads: ReadonlyArray<AdForLearning>,
    syncAt: number,
): Map<string, VisualPerformanceAggregate> {
    const byPatternKey = new Map<string, VisualWorkingAggregate>();
    for (const agg of existing) byPatternKey.set(agg.patternKey, cloneVisual(agg));

    // T021/T022: same any-row / all-rows logic as the hook aggregator.
    //
    // Batch 30 (FR-036, FR-073): the creative key is no longer discarded by
    // this loop. One creative is ONE count per PATTERN, however many rows
    // carry it and however many syncs observe it — the same rule the hook
    // aggregator has applied since Batch 28. A creative contributing to two
    // patterns counts once in EACH, because the patterns are separate
    // records and the question each answers is "how many creatives back
    // this pattern".
    const groups = groupAdsByCreative(ads);
    for (const [creativeKey, rows] of groups) {
        const eligibleRows = rows.filter(isAdEligible);
        if (eligibleRows.length === 0) continue;
        for (const ad of eligibleRows) {
            const patternKey = computePatternKeyLocal(
                ad.layoutTemplate,
                ad.creativeModes,
                ad.artDirection,
                ad.universe,
            );
            if (patternKey === "") continue;
            const existing_agg = byPatternKey.get(patternKey);
            const agg = existing_agg ?? emptyVisual(patternKey);
            agg.contributedCreatives.add(creativeKey);
            applyAdToVisual(agg, ad);
            agg.lastUpdated = syncAt;
            byPatternKey.set(patternKey, agg);
        }
    }

    // Batch 30: the Set is working state and cannot be stored (Firestore
    // holds JSON — a Set serialises to `{}`, which is exactly how the hook
    // equivalent was lost before Batch 28). Written out as
    // `contributedCreativeKeys`, read back by `cloneVisual`, with
    // `creativeCount` DERIVED from the set's size.
    const out = new Map<string, VisualPerformanceAggregate>();
    for (const [patternKey, agg] of byPatternKey) {
        const { contributedCreatives, ...rest } = agg;
        out.set(patternKey, {
            ...rest,
            contributedCreativeKeys: [...contributedCreatives],
            creativeCount: contributedCreatives.size,
        });
    }
    return out;
}

function applyAdToVisual(agg: VisualPerformanceAggregate, ad: AdForLearning): void {
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        agg.byObjective.conversion.count += 1;
        // FR-020: never decrease. Re-derive the running average from
        // the previous count + this contribution.
        const prevCount = agg.byObjective.conversion.count - 1;
        const prevAvgLink = agg.byObjective.conversion.avgLinkCtr;
        agg.byObjective.conversion.avgLinkCtr = round2(
            (prevAvgLink * prevCount + ad.ctrLink) / (prevCount + 1),
        );
        const prevAvgCpm = agg.byObjective.conversion.avgCpm;
        agg.byObjective.conversion.avgCpm = round2(
            (prevAvgCpm * prevCount + ad.cpm3d) / (prevCount + 1),
        );
        if (ad.verdict === "🟢") agg.byObjective.conversion.bestVerdictCount += 1;
        if (ad.verdict === "🔴") agg.byObjective.conversion.worstVerdictCount += 1;
        // Batch 29 — ADD/WITHDRAW INVARIANT. `sampleSize`, `byGeoTier` and
        // `byAudienceType` were decremented by the withdrawal and incremented
        // by nothing, so all three could only travel downward and floored at
        // zero. They are part of the persisted shape and FR-025 preserves the
        // geo-tier and audience-type partitions by name and meaning, so the
        // partition is filled in rather than the withdrawal gutted. Mirrors
        // `applyAdToHook` exactly, plus `avgCpm`, which the visual buckets
        // carry and the hook ones do not.
        agg.sampleSize += 1;
        const tier = ad.geoTier;
        const tierBefore = agg.byGeoTier[tier];
        if (tierBefore) {
            agg.byGeoTier[tier] = {
                count: tierBefore.count + 1,
                avgCtr: round2((tierBefore.avgCtr * tierBefore.count + ad.ctrLink) / (tierBefore.count + 1)),
                avgCpm: round2((tierBefore.avgCpm * tierBefore.count + ad.cpm3d) / (tierBefore.count + 1)),
            };
        }
        const aud = ad.audienceType;
        const audBefore = agg.byAudienceType[aud];
        if (audBefore) {
            agg.byAudienceType[aud] = {
                count: audBefore.count + 1,
                avgCtr: round2((audBefore.avgCtr * audBefore.count + ad.ctrLink) / (audBefore.count + 1)),
                avgCpm: round2((audBefore.avgCpm * audBefore.count + ad.cpm3d) / (audBefore.count + 1)),
            };
        }
    } else {
        agg.byObjective.other.count += 1;
    }
    // FR-027 / T047 — applies regardless of objective bucket. The visual
    // withdrawal decrements it unconditionally too, so the pair agrees.
    incrementByFunnelType(agg, ad);
}

// ─── Withdrawal helper (FR-018 idempotency) ──────────────────────
//
// A withdrawal decrements the same counters by the same amounts. The
// `decideContribution` decision says WHEN to withdraw; this function
// says HOW to apply the withdrawal symmetrically with how the
// addition was applied.
//
// ══ ADD/WITHDRAW INVARIANT (Batch 29) ══
//
//   EVERY counter or average the withdrawal changes MUST be one the
//   addition changes, in the SAME BRANCH, by the inverse amount.
//
// Both directions of breach are defects, and both are silent:
//
//   - Withdrawal subtracts where the addition never adds → the counter
//     only travels downward and floors at zero. A field that is always
//     zero reads as "no data", not as "broken".
//   - Addition adds where the withdrawal never subtracts → the counter
//     only travels upward. Since `contributedValues` carries `ctrLink`
//     and `cpm`, withdraw-then-add is the MODAL path, so this inflates
//     on EVERY sync.
//
// Three add/withdraw pairs disagreed across Batches 28 and 29 (FR-021's
// averages, FR-036's creative count, and four counters here). Before
// adding a field to either side, add it to both, and add a cycle test:
// run withdraw-then-add five times at a stable value and assert nothing
// moved. All three defects were invisible in one call and obvious in five.
// The full pair-by-pair audit is in
// `specs/969-cumulative-learning/reports/batch-29-969-report.md`.

export function applyHookAggregateWithdrawal(
    existing: HookPerformanceAggregate,
    ad: AdForLearning,
): HookPerformanceAggregate {
    const clone = cloneHook(existing);
    const isConversion = ad.campaignObjective === "conversion";
    if (isConversion) {
        if (clone.sampleSize > 0) clone.sampleSize -= 1;
        // Batch 28 (Fix A, FR-021): withdraw the AVERAGE, not only the
        // count. `ad.ctrLink` here is the withdrawn row's OWN recorded
        // value — `applyLearningWrites` builds the synthetic row from the
        // ledger entry (`ctrLink: withdraw.contributedValues.ctrLink`), so
        // the exact value that was folded in is the value folded back out.
        // Order matters: the new mean is computed from the count BEFORE
        // the decrement.
        clone.byObjective.conversion.avgLinkCtr = withdrawAvg(
            clone.byObjective.conversion.avgLinkCtr,
            clone.byObjective.conversion.count,
            ad.ctrLink,
        );
        if (clone.byObjective.conversion.count > 0) {
            clone.byObjective.conversion.count -= 1;
        }
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
                avgCtr: withdrawAvg(tierBefore.avgCtr, tierBefore.count, ad.ctrLink),
            };
        }
        const aud = ad.audienceType;
        const audBefore = clone.byAudienceType[aud];
        if (audBefore) {
            clone.byAudienceType[aud] = {
                count: audBefore.count > 0 ? audBefore.count - 1 : 0,
                avgCtr: withdrawAvg(audBefore.avgCtr, audBefore.count, ad.ctrLink),
            };
        }
    } else {
        clone.byObjective.other.avgLinkCtr = withdrawAvg(
            clone.byObjective.other.avgLinkCtr,
            clone.byObjective.other.count,
            ad.ctrLink,
        );
        if (clone.byObjective.other.count > 0) {
            clone.byObjective.other.count -= 1;
        }
    }
    // FR-027 / T047 — withdrawal symmetric with addition.
    //
    // Batch 29 — ADD/WITHDRAW INVARIANT. This was called unconditionally
    // while `applyAdToHook` increments the bucket INSIDE the conversion
    // branch only, so a non-conversion row subtracted a bucket count it had
    // never contributed — driving the bucket to zero and silently switching
    // off FR-041's multi-funnel indication, which reads `byFunnelType` via
    // `isMultiFunnel` (`whatsWorkingDashboard.ts:624`, `:823`). The ADDITION
    // is the correct side here, unlike the visual counters above: FR-025
    // fixes the partition's meaning, and widening it to non-conversion rows
    // would change what "evidence spans more than one funnel" means. So the
    // withdrawal is aligned to the addition, not the other way round. (The
    // VISUAL pair differs and is correct as it stands: `applyAdToVisual`
    // increments unconditionally, and its withdrawal decrements
    // unconditionally.)
    if (isConversion) {
        decrementByFunnelType(clone, ad);
    }

    // Batch 28 (Fix B, FR-036): a withdrawn creative stops being counted.
    // The key is dropped and `creativeCount` re-derived from the set, so
    // the two cannot disagree. When only SOME of a creative's rows are
    // withdrawn, the additive pass that always follows the withdrawals in
    // `applyLearningWrites` re-adds the key from the surviving rows — so
    // the removal is self-correcting within the sync, and a creative is
    // only left uncounted when nothing of it contributes any more.
    const withdrawnKey = ad.creativeKey ?? ad.adId;
    clone.contributedCreatives.delete(withdrawnKey);

    const { contributedCreatives, ...rest } = clone;
    return {
        ...rest,
        contributedCreativeKeys: [...contributedCreatives],
        creativeCount: contributedCreatives.size,
    };
}

/**
 * Batch 28 (Fix A, FR-021) — remove one observation from a running mean,
 * exactly.
 *
 * `avg` and `count` describe the aggregate BEFORE the withdrawal;
 * `value` is the withdrawn row's own recorded contribution. FR-021 requires
 * a contribution to be withdrawable "exactly, without accumulating rounding
 * drift", and this is the inverse of the incremental mean `applyAdToHook`
 * applies on the way in.
 *
 * The `count <= 1` guard covers the last contribution leaving: there is no
 * mean of zero observations, so the average RESETS to 0 rather than dividing
 * by zero. Returning 0 (not the prior mean) is what makes a full
 * withdraw-then-re-add round-trip land back on the original value.
 */
function withdrawAvg(avg: number, count: number, value: number): number {
    if (count <= 1) return 0;
    return round2((avg * count - value) / (count - 1));
}

// ─── Helpers ─────────────────────────────────────────────────────

function isAdEligible(ad: AdForLearning): boolean {
    if (ad.matchType !== "auto_hash" && ad.matchType !== "manual") return false;
    if (!ad.metadataAvailable) return false;
    if (!ad.generationId) return false;
    return true;
}

function resolveCanonicalAngleLocal(name: string): string | null {
    // Spec aliases (data-model §4.4 + learningAggregates.ts header):
    //   shocking_stat → statistics, fear_of_missing_out → urgency,
    //   future_pacing → future_based.
    // We don't import the canonicalAngle module here to keep the
    // aggregateDelta pure; the worker has already resolved the angle.
    // If the worker didn't, the name falls through as-is.
    const norm = name.toLowerCase().trim();
    if (norm === "shocking_stat") return "statistics";
    if (norm === "fear_of_missing_out") return "urgency";
    if (norm === "future_pacing") return "future_based";
    return norm;
}

function computePatternKeyLocal(
    layoutTemplate: string | null,
    modes: ReadonlyArray<string>,
    artDirection: string | null,
    universe: string | null,
): string {
    if (!layoutTemplate || !artDirection || !universe) return "";
    const sortedModes = [...modes].sort();
    const parts = [layoutTemplate, ...sortedModes, artDirection, universe];
    return djb2HashLocal(parts.join("|"));
}

function djb2HashLocal(s: string): string {
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36).padStart(7, "0");
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

function weightedAvg(_prior: number, _priorCount: number, _sum: number, _newCount: number): number {
    // Caller passes `prior`, `priorCount`, `sum` (prior*priorCount + new), `newCount`.
    // Body kept as a function to mirror the call-site shape and so the
    // type system enforces the four-arg contract.
    return _newCount === 0 ? 0 : _sum / _newCount;
}

function cloneHook(a: HookPerformanceAggregate): HookWorkingAggregate {
    const result: HookWorkingAggregate = {
        angleKey: a.angleKey,
        schemaVersion: a.schemaVersion ?? 1,
        creativeCount: a.creativeCount ?? 0,
        sampleSize: a.sampleSize,
        lastUpdated: a.lastUpdated,
        byObjective: {
            conversion: { ...a.byObjective.conversion },
            other: { ...a.byObjective.other },
        },
        byFunnelType: a.byFunnelType ? cloneByFunnelType(a.byFunnelType) : undefined,
        byGeoTier: {
            tier1_gulf: { ...a.byGeoTier.tier1_gulf },
            tier2_diaspora: { ...a.byGeoTier.tier2_diaspora },
            tier3_egypt_na: { ...a.byGeoTier.tier3_egypt_na },
        },
        byAudienceType: {
            broad: { ...a.byAudienceType.broad },
            interest: { ...a.byAudienceType.interest },
            lookalike: { ...a.byAudienceType.lookalike },
            retargeting: { ...a.byAudienceType.retargeting },
            advantage_plus: { ...a.byAudienceType.advantage_plus },
        },
        // Batch 28 (Fix B, FR-036): hydrate the dedup set from the
        // PERSISTED key list. Before this, the set was re-initialised
        // empty on every read, so a creative that had already contributed
        // re-incremented `creativeCount` on the next sync — the count
        // became a count of creative-sync-observations, which FR-036
        // forbids in the same sentence that forbids row multiplicity.
        // The array is the state; `creativeCount` is derived from it on
        // the way out (see the strip step in applyHookAggregatesDelta).
        contributedCreatives: new Set(a.contributedCreativeKeys ?? []),
    };
    return result;
}

/** Internal working shape for the aggregator. Carries a Set of
 * creative keys that have already contributed, so that the second
 * row of one creative to the same angle does not double-count it.
 * Stripped before return (the Set is not part of the public type).
 */
interface HookWorkingAggregate extends HookPerformanceAggregate {
    contributedCreatives: Set<string>;
}

/** Batch 30 — the visual counterpart. Same contract, same lifecycle:
 * hydrated from the persisted key array on read, stripped to that array
 * on write, and `creativeCount` derived from its size so the two cannot
 * disagree. Kept structurally identical to `HookWorkingAggregate` so the
 * two aggregators stay readable side by side.
 */
interface VisualWorkingAggregate extends VisualPerformanceAggregate {
    contributedCreatives: Set<string>;
}

function cloneVisual(a: VisualPerformanceAggregate): VisualWorkingAggregate {
    return {
        patternKey: a.patternKey,
        schemaVersion: a.schemaVersion ?? 1,
        // Batch 30: hydrate the dedup set from the PERSISTED key list, so a
        // creative that already contributed is not counted again on the next
        // sync. An absent array means "no creative recorded yet", which is
        // correct for every record written before this field existed —
        // `creativeCount` is new in Phase 969 on both aggregates and no
        // production record carries either field.
        contributedCreatives: new Set(a.contributedCreativeKeys ?? []),
        creativeCount: a.creativeCount ?? 0,
        sampleSize: a.sampleSize,
        lastUpdated: a.lastUpdated,
        byObjective: {
            conversion: { ...a.byObjective.conversion },
            other: { count: a.byObjective.other.count },
        },
        byFunnelType: a.byFunnelType ? cloneByFunnelType(a.byFunnelType) : undefined,
        byGeoTier: {
            tier1_gulf: { ...a.byGeoTier.tier1_gulf },
            tier2_diaspora: { ...a.byGeoTier.tier2_diaspora },
            tier3_egypt_na: { ...a.byGeoTier.tier3_egypt_na },
        },
        byAudienceType: {
            broad: { ...a.byAudienceType.broad },
            interest: { ...a.byAudienceType.interest },
            lookalike: { ...a.byAudienceType.lookalike },
            retargeting: { ...a.byAudienceType.retargeting },
            advantage_plus: { ...a.byAudienceType.advantage_plus },
        },
    };
}

function emptyHook(angleKey: string): HookWorkingAggregate {
    return {
        angleKey,
        schemaVersion: 1,
        creativeCount: 0,
        contributedCreativeKeys: [],
        sampleSize: 0,
        lastUpdated: 0,
        contributedCreatives: new Set(),
        byObjective: {
            conversion: { avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { avgLinkCtr: 0, count: 0 },
        },
        byFunnelType: cloneByFunnelType(EMPTY_BY_FUNNEL_TYPE),
        byGeoTier: {
            tier1_gulf: { avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCtr: 0, count: 0 },
            interest: { avgCtr: 0, count: 0 },
            lookalike: { avgCtr: 0, count: 0 },
            retargeting: { avgCtr: 0, count: 0 },
            advantage_plus: { avgCtr: 0, count: 0 },
        },
    };
}

function emptyVisual(patternKey: string): VisualWorkingAggregate {
    return {
        patternKey,
        schemaVersion: 1,
        contributedCreatives: new Set(),
        creativeCount: 0,
        contributedCreativeKeys: [],
        sampleSize: 0,
        lastUpdated: 0,
        byObjective: {
            conversion: { avgCpm: 0, avgLinkCtr: 0, count: 0, bestVerdictCount: 0, worstVerdictCount: 0 },
            other: { count: 0 },
        },
        byFunnelType: cloneByFunnelType(EMPTY_BY_FUNNEL_TYPE),
        byGeoTier: {
            tier1_gulf: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier2_diaspora: { avgCpm: 0, avgCtr: 0, count: 0 },
            tier3_egypt_na: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCpm: 0, avgCtr: 0, count: 0 },
            interest: { avgCpm: 0, avgCtr: 0, count: 0 },
            lookalike: { avgCpm: 0, avgCtr: 0, count: 0 },
            retargeting: { avgCpm: 0, avgCtr: 0, count: 0 },
            advantage_plus: { avgCpm: 0, avgCtr: 0, count: 0 },
        },
    };
}

// ─── FR-027 / T047 helpers — per-funnel-type breakdown ───────────────
//
// Mirrors the all-rows semantics of `byObjective.conversion.count`:
// each contributing row attributes once to its `funnelType`. The
// aggregator reads `ad.funnelType ?? "unknown"` and resolves unknown
// inputs to the explicit "unknown" bucket (FR-032 — still counts
// toward headline totals, never matches a requested funnel type).
// Reads always go through `cloneByFunnelType` so the breakdown is
// owned by the aggregate, not aliased into the function caller.

type ByFunnelTypeAgg = HookPerformanceAggregate | VisualPerformanceAggregate;
type ByFunnelTypeBreakdown = import("../learningAggregates.js").ByFunnelTypeBreakdown;
type FunnelTypeBucketKey = import("../learningAggregates.js").FunnelTypeBucketKey;

function cloneByFunnelType(
    src: Partial<Record<FunnelTypeBucketKey, Readonly<{ count: number }>>>,
): ByFunnelTypeBreakdown {
    return {
        paid_event: src.paid_event ? { count: src.paid_event.count } : { count: 0 },
        paid_product: src.paid_product ? { count: src.paid_product.count } : { count: 0 },
        free_webinar: src.free_webinar ? { count: src.free_webinar.count } : { count: 0 },
        lead_magnet_call: src.lead_magnet_call ? { count: src.lead_magnet_call.count } : { count: 0 },
        unknown: src.unknown ? { count: src.unknown.count } : { count: 0 },
    };
}

function incrementByFunnelType(agg: ByFunnelTypeAgg, ad: AdForLearning): void {
    const key = resolveFunnelTypeBucketKey(ad.funnelType);
    const existing: ByFunnelTypeBreakdown = agg.byFunnelType
        ? cloneByFunnelType(agg.byFunnelType)
        : cloneByFunnelType(EMPTY_BY_FUNNEL_TYPE);
    const bucket = existing[key];
    existing[key] = { count: bucket.count + 1 };
    agg.byFunnelType = existing;
}

function decrementByFunnelType(agg: ByFunnelTypeAgg, ad: AdForLearning): void {
    const key = resolveFunnelTypeBucketKey(ad.funnelType);
    const existing = agg.byFunnelType;
    if (!existing) return;
    const bucket = existing[key];
    if (bucket.count <= 0) return;
    existing[key] = { count: bucket.count - 1 };
}
