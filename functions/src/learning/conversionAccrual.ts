// functions/src/learning/conversionAccrual.ts — Phase 4, T034/T035/T036/T036a/T038
// ══════════════════════════════════════════════════════════════════════
// PURE module. Per-(ad row id, date) conversion counting for the
// eligibility rule FR-077 (Phase 4), the only Phase 4 surface that
// does not depend on the sealed state machine.
//
// What this module does:
//   - reads one day's conversion count from a Meta insights row
//     (uses the same `actions` filter as the existing
//     `countConversionActions` at `metaSync/shared.ts:355-370`)
//   - merges per-day counts into a `DayAccrual` map (FR-081, FR-083,
//     FR-084)
//   - **upward-only** while a day is inside the observed window: a
//     higher value replaces, a lower value is a no-op (FR-083)
//   - **bounded retention**: a day leaving the window is finalised —
//     folded into `finalisedTotal`, `finalisedDayCount` incremented,
//     the map entry deleted (FR-084a). Window membership is pure date
//     arithmetic; no stored flag.
//   - **absent rows are not zero** (FR-085a): an entry is written
//     only for dates that arrived in the input.
//   - `isStopped` is derived from the ad's **own** configured status
//     (FR-085, FR-077(b)) — under-detects parent-level pauses by
//     design (FR-085's accepted cost).
//   - the days-lost-to-gaps count (FR-086, FR-086a): dates that NO
//     sync's window covered, computed at the sync's level — **never**
//     from "no row in the daily response" (FR-085a disambiguates).
//
// Naming discipline (FR-082): the accumulated figure is **always**
// called "conversions across days observed" in identifiers, comments
// and logs. **Never** an ever-growing-from-account-creation total —
// that is a three-undercount-one-overcount directionally-named
// statistic, not a monotonically-growing count from a fixed start.
// `T036a` enforces the naming with a grep guard in the test file.
//
// Three different rates of failure this module prevents:
//
//   1. **Plain-overwrite on day re-observation** lowers a stored
//      total whenever Meta revises a day downward (deduplication,
//      fraud filtering, late correction). FR-020 forbids any sync
//      from decreasing a stored count. FR-083's upward-only rule
//      closes the only path in this feature where the total could
//      move in either direction.
//
//   2. **Coarser key (creative, date)** drops rows: a creative's
//      conversions divide between its many placements, so one row's
//      per-day figure never sees the light of day. **Finer key
//      (ad id alone)** double-counts: the same ad row re-observed on
//      the same date would fold into itself. Only **(ad row id, date)**
//      is both complete and idempotent (FR-084).
//
//   3. **Storing every day's entry forever** breaches SC-023/FR-071:
//      unbounded per-row retention means the bounded read grows with
//      account age. FR-084a closes this by collapsing finalised days
//      into a running total and a count, retaining nothing else.

import type { DayAccrual, ObservedWindow } from "./types.js";

// ─── Action-type filter ────────────────────────────────────────
//
// Mirrors `RESULT_ACTION_TYPES` at `metaSync/shared.ts:376-383`. The
// spec scope (FR-081) is byte-identical: a "conversion" here is the
// same count the 3-day-window's `conversions3d` would aggregate.
// Action-type strings are case-insensitive on Meta — Meta emits
// `purchase`, `omni_purchase`, `lead`, `complete_registration`,
// `omni_complete_registration`, `offsite_conversion.fb_pixel_purchase`
// (and any future `omni_*` or `offsite_*` variants). The set is held
// here so the test can drive it without going through `shared.ts`.
const RESULT_ACTION_TYPES: ReadonlySet<string> = new Set<string>([
    "purchase",
    "omni_purchase",
    "offsite_conversion.fb_pixel_purchase",
    "lead",
    "omni_complete_registration",
    "complete_registration",
]);

// ─── Insight-row contract ─────────────────────────────────────
//
// The narrow projection of `metaGraph.ts`'s `InsightsRow` that this
// module reads: `date_start`, `actions` (for conversions) and `spend`
// (for cost). All three are the only fields the per-day accrual
// needs, and keeping the projection narrow keeps `accrueDays`
// testable with a plain object literal.
//
// `spend` was added in Batch 3 alongside the conversion count so
// the cost figure and the result count read from the same window
// (the per-day entries keyed by `(ad row id, date)`). Using a
// rolling sum like `metrics.spend7d` would produce a figure
// where the cost window is shorter than the result window and the
// ratio drifts toward the wrong answer as the creative ages. The
// per-day side carries both numbers under the same key, the same
// FR-083 upward-only rule, and the same FR-084a finalisation.
export interface InsightsDailyRow {
    date_start?: string;
    actions?: ReadonlyArray<{ action_type?: string; value?: string | number }>;
    spend?: string | number;
}

// ─── Per-day counter (FR-081) ──────────────────────────────────
//
// The same arithmetic `countConversionActions` at
// `metaSync/shared.ts:355-370` performs across an array of rows,
// scoped to ONE row. The function was already array-shaped; using
// the array shape directly is what lets us reuse it without changing
// its signature (Batch 28's pattern).
export function countDayConversions(row: InsightsDailyRow): number {
    if (!row.actions) return 0;
    let total = 0;
    for (const a of row.actions) {
        if (!a || typeof a !== "object") continue;
        const actionType = (a as { action_type?: string }).action_type;
        if (typeof actionType !== "string") continue;
        if (RESULT_ACTION_TYPES.has(actionType.toLowerCase())) {
            const v = (a as { value?: string | number }).value;
            total += parseNumber(v);
        }
    }
    return total;
}

// ─── Per-day spend (FR-002a cost input) ────────────────────────
//
// Sum of realised cost for the day's row. Meta emits `spend` as a
// decimal string on every insights row (`insights.field` includes
// "spend" — `metaGraph.ts:62`). The function is per-row and
// returns 0 when `spend` is absent — same convention as
// `countDayConversions` (FR-085a: absence is not zero).
export function countDaySpend(row: InsightsDailyRow): number {
    if (row.spend === undefined || row.spend === null) return 0;
    return parseNumber(row.spend);
}

function parseNumber(v: unknown): number {
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    if (typeof v === "string") {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }
    return 0;
}

// ─── The accrual function (FR-081/FR-083/FR-084 + Batch 3) ───
//
// Pure. Given:
//   - `existing`: the row's persisted `DayAccrual` (or `null` on
//     first sight),
//   - `dailyRows`: the row's per-day counts from THIS sync's
//     `last7DaysDaily` Graph call (one row per day per Meta — note
//     `time_increment=1` at `metaGraph.ts:389-396`),
//   - `window`: the inclusive window bounds of THIS sync's daily
//     call, ISO-8601 date strings.
//
// Return a NEW `DayAccrual`. The function never mutates `existing`.
//
// Behaviour:
//   - For each row in `dailyRows` whose `date_start` parses to a
//     date inside `window`, write/replace `days[date]` with
//     `Math.max(existingDays[date] ?? 0, countDayConversions(row))`
//     for the conversion count AND `Math.max(...)` for the spend.
//     Both numbers live in the same per-day entry, keyed on the
//     same `(date)`, finalised at the same moment. The result is
//     that `creativeConversionTotal(rows)` and `creativeCostTotal
//     (rows)` read from windows that match by construction — the
//     FR-002a efficiency figure has the same denominator and
//     numerator window, regardless of how the creative has aged
//     or what `Meta.last_7d` happened to return on this sync.
//   - For each entry in `existing.days` whose date is OUTSIDE the
//     window (BEFORE `since` or AFTER `until`): fold into
//     `finalisedConversions` and `finalisedSpend`, increment
//     `finalisedDayCount`, delete the map entry. (Window
//     membership is inclusive on both sides.)
//   - **An absent row is NOT written** — the key simply does not
//     exist (FR-085a). An entry for the date in `existing.days`
//     that this sync did not re-observe is preserved at its recorded
//     value while the date remains in the window; it is finalised
//     like every other window-exit when the date leaves.
//   - `lastObservedWindow` is set to the new window.
export function accrueDays(
    existing: DayAccrual | null,
    dailyRows: ReadonlyArray<InsightsDailyRow>,
    window: ObservedWindow,
): DayAccrual {
    // 1. Seed with the existing days — we work on a shallow copy so
    //    the input is never mutated. (FR-018 idempotency: calling
    //    accrueDays with the same existing + rows returns the same
    //    value, including on the no-prior-contribution shape.)
    //
    // The new shape carries both the conversion count and the spend
    // for the day. Pre-Batch-3 records on disk carry the legacy
    // shape (`days[date] = number`). They are migrated lazily on
    // the next sync — a numeric legacy value becomes a `{ conversions:
    // legacy, spend: 0 }` entry. This is a one-way migration that
    // happens at read time; the cost stays at 0 until the day's
    // spend is re-observed. Acceptable because the cost figure is
    // computed once (FR-079) and the affected creatives are
    // immediately re-eligible on the next sync.
    const days: { [isoDate: string]: { conversions: number; spend: number } } = {};
    let finalisedConversions = 0;
    let finalisedSpend = 0;
    let finalisedDayCount = 0;
    if (existing !== null) {
        finalisedConversions = existing.finalisedConversions;
        finalisedSpend = existing.finalisedSpend;
        finalisedDayCount = existing.finalisedDayCount;
        for (const [isoDate, value] of Object.entries(existing.days)) {
            // Migration from pre-Batch-3 shape: numeric values are
            // the legacy conversion count with no spend recorded.
            // Object values are the new shape with both numbers.
            days[isoDate] = typeof value === "number"
                ? { conversions: value, spend: 0 }
                : { conversions: value.conversions, spend: value.spend };
        }
    }

    // 2. Finalise entries that have left the window (FR-084a). Pure
    //    date arithmetic: an entry whose date is before `since` or
    //    after `until` is no longer inside the observed window and
    //    its per-day figure is immutable from this point on. The
    //    map entry is deleted (FR-084a's "retention MUST NOT grow
    //    with account age"). Both finalisedConversions and
    //    finalisedSpend move with the day; finalisedDayCount moves
    //    by exactly one regardless of how many numbers live in the
    //    entry — the day itself is one observation, not two.
    for (const isoDate of Object.keys(days)) {
        if (isoDate < window.since || isoDate > window.until) {
            finalisedConversions += days[isoDate].conversions;
            finalisedSpend += days[isoDate].spend;
            finalisedDayCount += 1;
            delete days[isoDate];
        }
    }

    // 3. Apply the per-day observations from THIS sync, upward-only.
    //    The dedup key is (ad row id implicit in existing, date) per
    //    FR-084 — the row document IS the lock on ad row id, the
    //    map key is the date. A higher value replaces (FR-083
    //    upward-only revision); a lower value is a no-op (FR-083);
    //    a re-observation of an already-finalised day is a no-op in
    //    BOTH directions (the entry is no longer in `days`).
    //
    // Batch 3: each day's entry now tracks BOTH the conversion
    // count and the spend, so the cost figure and the result count
    // read from the same per-day window. Spending this number is
    // cheap — it's the same Meta row the conversion count already
    // came from — and the alternative (`metrics.spend7d`, the rolling
    // 7-day sum) is the wrong window by construction.
    for (const row of dailyRows) {
        const isoDate = typeof row.date_start === "string" ? row.date_start.slice(0, 10) : null;
        if (!isoDate) continue;
        // Window filter: drop rows for dates the observed window
        // did not cover. Meta returns what its preset says it does
        // for `last_7d`, but the spec is explicit that this module
        // MUST NOT trust that ("the unverified assertion is still
        // recorded", FR-082/FR-083). The window check here is the
        // guard that keeps the design from depending on it.
        if (isoDate < window.since || isoDate > window.until) continue;
        const observedConversions = countDayConversions(row);
        const observedSpend = countDaySpend(row);
        const prior = days[isoDate];
        if (prior === undefined) {
            days[isoDate] = { conversions: observedConversions, spend: observedSpend };
        } else {
            // FR-083 — upward-only, applied to BOTH numbers in the
            // entry. A higher value replaces; a lower value is a
            // no-op. This is independent for conversions and spend:
            // a spend revision does not lower the conversion count
            // and vice versa.
            const nextConversions = observedConversions > prior.conversions
                ? observedConversions : prior.conversions;
            const nextSpend = observedSpend > prior.spend
                ? observedSpend : prior.spend;
            days[isoDate] = { conversions: nextConversions, spend: nextSpend };
        }
    }

    return {
        days,
        finalisedConversions,
        finalisedSpend,
        finalisedDayCount,
        lastObservedWindow: { since: window.since, until: window.until },
    };
}

// ─── Stopped-running signal (FR-077(b), FR-085) ───────────────
//
// `isStopped` reads the ad's **own** configured `status`, not
// `effective_status` (deferred per FR-085). Under-detection (not
// mis-detection) is the design: a parent-paused ad reads as its
// own configured status — most often ACTIVE — and `isStopped`
// returns false. That is accepted: an undetected stop means the
// creative simply never seals via condition (b). The failure mode
// is a missing contribution, never a wrong one (FR-085).
//
// Stopped states we recognise (Meta Ad statuses, uppercased before
// the comparison):
//   - PAUSED, DELETED, ARCHIVED, DISAPPROVED, PENDING_REVIEW (rare),
//     IN_PROCESS is NOT stopped (the ad is being created/edited;
//     it's not delivering but treating it as "stopped" would
//     over-detect).
//
// Unknown statuses return false. Better to under-detect a stop
// than to falsely seal against it.
const STOPPED_STATUSES: ReadonlySet<string> = new Set<string>([
    "PAUSED",
    "DELETED",
    "ARCHIVED",
    "DISAPPROVED",
    "PENDING_REVIEW",
    "CAMPAIGN_PAUSED", // observed on parent-paused ads in legacy data
]);

const NOT_STOPPED_STATUSES: ReadonlySet<string> = new Set<string>([
    "ACTIVE",
    "IN_PROCESS",
    "PENDING_BILLING_INFO",
]);

export function isStopped(adStatus: string | null | undefined): boolean {
    if (typeof adStatus !== "string") return false;
    const upper = adStatus.toUpperCase();
    if (NOT_STOPPED_STATUSES.has(upper)) return false;
    if (STOPPED_STATUSES.has(upper)) return true;
    // Unknown status: under-detect, not mis-detect (FR-085).
    return false;
}

// ─── Creative total (FR-077(a)) ───────────────────────────────
//
// Sum the per-row conversion totals across a creative's rows.
// Each `DayAccrual` carries the row's own running total:
// `finalisedConversions + Σ days[isoDate].conversions`. The sum is
// the creative's combined conversions across all placements — the
// FR-077(a) eligibility count.
//
// Pre-Batch-3 records carry `days[iso] = number`; the migration
// path at `accrueDays` re-hydrates those into the new shape with
// `spend: 0`. Production data is post-Batch-3.
export function creativeConversionTotal(rows: ReadonlyArray<DayAccrual | null | undefined>): number {
    let total = 0;
    for (const row of rows) {
        if (!row) continue;
        total += row.finalisedConversions;
        for (const v of Object.values(row.days)) {
            const c = typeof v === "number" ? v : v.conversions;
            if (typeof c === "number" && Number.isFinite(c)) total += c;
        }
    }
    return total;
}

// New total — spend. See header comment above.
export function creativeCostTotal(rows: ReadonlyArray<DayAccrual | null | undefined>): number {
    let total = 0;
    for (const row of rows) {
        if (!row) continue;
        total += row.finalisedSpend;
        for (const v of Object.values(row.days)) {
            const s = typeof v === "number" ? 0 : v.spend;
            if (typeof s === "number" && Number.isFinite(s) && s > 0) total += s;
        }
    }
    return total;
}

// ─── Days-lost-to-gaps (FR-086, FR-086a) ─────────────────────
//
// `daysLostToGaps` returns the count of dates that **NO sync's
// window covered** — i.e. dates strictly between the previous
// observed window and the current window. **Dates with no
// `actions` row within a covered window are NOT gaps** — they
// mean the ad did not run that day (FR-085a) and are not counted
// here. This is the FR-086a distinction: conflating the two
// produces a non-zero count for any paused ad, destroying its
// value as an alarm.
//
// Computed from window bounds alone — no stored flag, no
// inference from Meta's response. Pure date arithmetic: a gap
// exists iff `thisWindow.since > lastWindow.until + 1`.
//
// Returns `0` when `lastObservedWindow` is `null` (first sync of
// the row), when the windows overlap, or when the windows are
// adjacent (`thisWindow.since === dayAfter(lastWindow.until)`).
export function daysLostToGaps(
    lastObservedWindow: ObservedWindow | null,
    thisWindow: ObservedWindow,
): number {
    if (lastObservedWindow === null) return 0;
    const lastEnd = lastObservedWindow.until;
    const thisStart = thisWindow.since;
    // Lexicographic comparison on YYYY-MM-DD strings is correct
    // (ISO-8601 with zero-padding has the same lexical and
    // chronological order — both are monotonic).
    if (thisStart <= lastEnd) return 0;
    // thisStart > lastEnd ⇒ there is at least one day between.
    // The number of days strictly between two dates = dayDiff - 1.
    // We compute the day-difference via UTC milliseconds at noon to
    // avoid DST edge effects (pure date arithmetic per FR-084a).
    const lastEndMs = isoDateUtcMs(lastEnd);
    const thisStartMs = isoDateUtcMs(thisStart);
    if (!Number.isFinite(lastEndMs) || !Number.isFinite(thisStartMs)) return 0;
    const days = Math.floor((thisStartMs - lastEndMs) / (24 * 60 * 60 * 1000));
    return Math.max(0, days - 1);
}

// UTC midnight+noon for ISO date strings; noon avoids DST edges.
function isoDateUtcMs(iso: string): number {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return NaN;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return NaN;
    return Date.UTC(y, mo - 1, d, 12, 0, 0, 0);
}

// ─── The naming constant (FR-082) ────────────────────────────
//
// String identifier used in summaries, comments and log lines to
// refer to the accumulated conversion figure. **NOT** an
// all-time total, **NOT** a fixed-reference-point total,
// **NOT** an ever-growing total since the account was created.
// Three-undercount-one-overcount direction, with the fourth
// inaccuracy (FR-083's upward-only over-count) accepted as the
// trade for unconditional FR-020 compliance.
export const CONVERSIONS_ACROSS_DAYS_OBSERVED_LABEL = "conversions across days observed";
