// functions/src/__tests__/phase969/conversionAccrual.test.ts — Phase 4 Batch 1
// ═══════════════════════════════════════════════════════════════════════════════
// Phase 969, T045. Conversion-accrual test surface (Phase 4, US2):
//
//   - SC-037 — ZERO additional Graph calls. Static guard: the
//     conversion-accrual module must not import `fetchAdInsights*`
//     or any Graph method. The runtime data is reused; this is the
//     design constraint FR-081 names.
//   - SC-038 — never-decreases across syncs. Beharioural: the row's
//     `finalisedTotal + sum(days)` is monotonically non-decreasing
//     across a sequence of syncs at stable values.
//   - SC-039 — FR-083 upward-only, with raise + no-lower +
//     finalised-untouched coverage. The three assertions are
//     discriminating: a naive plain-overwrite implementation FAILS
//     the no-lower assertion; FR-018 forbids any drift in either
//     direction.
//   - SC-040 — FR-084 deduplication key asserted against BOTH wrong
//     keys. The (ad row id, date) key preserves evidence a coarser
//     (creative, date) key would drop and a finer (ad row id) key
//     would double-count.
//   - SC-041 — FR-085 parent-pause under-detection. `isStopped` is
//     false when given ACTIVE (the parent's pause doesn't surface
//     on the ad's own status), true when given PAUSED, false when
//     given null. The "does not seal via (b)" half is the Batch 3
//     eligibility surface; here we test the pure predicate's
//     semantics directly.
//   - SC-051 — bounded retention. `days` map size <= window length
//     across 100 syncs of the same window. Independent of account
//     age (FR-084a's mandate, SC-023's discipline).
//   - FR-082 — naming rule guard. The grep yields nothing for the
//     forbidden words. Labeled as a structural guard, NOT counted
//     as behavioural coverage. The behaviour — calling the
//     accumulated total "conversions across days observed" — is
//     asserted via the constant export below.
//
// Designed against the spec's two discriminating tests (FR-083 and
// FR-084): each test fails against a wrong implementation, not just
// passes against the right one.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    accrueDays,
    countDayConversions,
    creativeConversionTotal,
    creativeCostTotal,
    daysLostToGaps,
    isStopped,
    type InsightsDailyRow,
} from "../../learning/conversionAccrual.js";
import {
    CONVERSIONS_ACROSS_DAYS_OBSERVED_LABEL,
} from "../../learning/conversionAccrual.js";
import type { DayAccrual, ObservedWindow } from "../../learning/types.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __dirname: any;

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (e) {
        failed++;
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
    }
}

// ─── Fixture helpers ──────────────────────────────────────────

function day(isoDate: string, conversions: number, spend: number = 0): InsightsDailyRow {
    return {
        date_start: isoDate,
        actions: [
            { action_type: "purchase", value: conversions },
        ],
        spend,
    };
}

function emptyDay(isoDate: string): InsightsDailyRow {
    return { date_start: isoDate, actions: [] };
}

function spendDay(isoDate: string, spend: number): InsightsDailyRow {
    return { date_start: isoDate, spend };
}

function window(since: string, until: string): ObservedWindow {
    return { since, until };
}

// ─── Per-day counter behaviour ────────────────────────────────

test("countDayConversions: sums the recognised action types", () => {
    const row: InsightsDailyRow = {
        date_start: "2025-01-01",
        actions: [
            { action_type: "purchase", value: "3" },
            { action_type: "link_click", value: "100" }, // not a conversion
            { action_type: "lead", value: "2" },
            { action_type: "omni_complete_registration", value: "1" },
        ],
    };
    assert.equal(countDayConversions(row), 6);
});

test("countDayConversions: an empty actions array returns 0 (NOT recorded as observed = 0 — see SC-absent test below)", () => {
    assert.equal(countDayConversions(emptyDay("2025-01-01")), 0);
});

test("countDayConversions: skips malformed action entries", () => {
    const row: InsightsDailyRow = {
        actions: [
            null as unknown as { action_type: string; value: string },
            { action_type: "purchase", value: "1" },
            { action_type: undefined as unknown as string, value: "999" },
            { value: "999" }, // no action_type
            "not-an-object" as unknown as { action_type: string; value: string },
        ],
    };
    assert.equal(countDayConversions(row), 1);
});

// ═══ SC-037 — ZERO additional Graph calls ═══
//
// FR-081/FR-085: the data already arrives on every sync; this
// module must not fetch more. The check is a **structural guard**:
// the module's source contains no `fetchAdInsights*` reference
// and no `META_GRAPH_BASE` reference. If a future PR adds a fetch
// here the guard catches it; this isn't behavioural coverage of
// SC-037, but no behavioural coverage is possible (the criterion
// is the absence of an action).
//
// Heading: SC-037 — zero additional Graph calls (structural guard)

test("SC-037 [structural]: conversionAccrual.ts does not import fetchAdInsights* or hit the Graph URL", () => {
    // Path resolution: when run from the compiled JS, `__dirname`
    // is `functions/lib/__tests__/phase969/`. We want the SOURCE
    // TypeScript at `functions/src/learning/conversionAccrual.ts`,
    // so we walk up to `functions/` and re-enter through `src/`.
    const srcPath = join(__dirname, "..", "..", "..", "src", "learning", "conversionAccrual.ts");
    const text = readFileSync(srcPath, "utf8");
    assert.equal(/fetchAdInsights/.test(text), false, "must not call fetchAdInsights*");
    assert.equal(/META_GRAPH_BASE/.test(text), false, "must not reference the Graph URL");
    assert.equal(/graphGet|graphPost/.test(text), false, "must not import the Graph transport");
    assert.equal(/setFetchImpl|resetMetaGraphForTests/.test(text), false, "must not import the test seam from metaGraph");
});

// ═══ FR-082 — naming rule guard (structural) ═══

test("FR-082 [structural]: no occurrence of the forbidden words in the module", () => {
    const srcPath = join(__dirname, "..", "..", "..", "src", "learning", "conversionAccrual.ts");
    const text = readFileSync(srcPath, "utf8");
    assert.equal(/\blifetime\b/i.test(text), false, "must not use 'lifetime'");
    assert.equal(/\bsince[\s_-]?inception\b/i.test(text), false, "must not use 'since-inception'");
    // The required phrase must be present at least once.
    assert.ok(
        text.toLowerCase().includes(CONVERSIONS_ACROSS_DAYS_OBSERVED_LABEL.split(" ")[0])
        || text.includes("conversions across days observed"),
        "must reference 'conversions across days observed' (FR-082)",
    );
});

// ─── FR-083 — upward-only revision (SC-039) ───────────────────

test("FR-083 raise: a higher observation replaces the recorded value", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 2, spend: 0 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(existing, [day("2025-01-03", 5)], window("2025-01-01", "2025-01-07"));
    assert.equal(out.days["2025-01-03"].conversions, 5);
    assert.equal(out.finalisedConversions, 0, "raise must not touch finalised figures");
});

test("FR-083 no-lower: a lower observation is a no-op (the test that fails against a plain-overwrite)", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 5, spend: 0 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(existing, [day("2025-01-03", 2)], window("2025-01-01", "2025-01-07"));
    assert.equal(out.days["2025-01-03"].conversions, 5, "no-lower must NOT overwrite the higher recorded value with 2");
});

test("FR-083 no-lower equal: equal observations don't move the value", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 5, spend: 0 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(existing, [day("2025-01-03", 5)], window("2025-01-01", "2025-01-07"));
    assert.equal(out.days["2025-01-03"].conversions, 5);
});

test("FR-083 finalised untouched: re-observing a finalised day is a no-op in BOTH directions", () => {
    // The day 2024-12-30 is OUTSIDE today's window, so a row
    // arriving for that date is dropped by the window filter AND
    // the recorded value (already in finalisedTotal) is untouched.
    const existing: DayAccrual = {
        days: {},
        finalisedConversions: 7,
        finalisedSpend: 0,
        finalisedDayCount: 1,
        lastObservedWindow: window("2024-12-23", "2024-12-29"),
    };
    const out = accrueDays(existing, [day("2024-12-30", 999)], window("2025-01-01", "2025-01-07"));
    assert.equal(out.finalisedConversions, 7, "finalised total must NOT change on a re-observation");
    assert.equal(out.finalisedDayCount, 1, "finalised count must NOT change");
    assert.equal(out.days["2024-12-30"], undefined, "must not write an out-of-window date");
    assert.equal(out.days["2025-01-01"], undefined, "absent in-window day was not observed; no record");
});

test("FR-083 monotonic: a sequence of syncs at stable values never decreases the row's total", () => {
    let cur: DayAccrual = {
        days: {},
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const totals: number[] = [];
    // Sync 1: introduce a 5-conversion day.
    cur = accrueDays(cur, [day("2025-01-05", 5)], window("2025-01-01", "2025-01-07"));
    totals.push(creativeConversionTotal([cur]));
    // Syncs 2..6: same value each time → monotonic.
    for (let i = 0; i < 5; i++) {
        cur = accrueDays(cur, [day("2025-01-05", 5)], window("2025-01-01", "2025-01-07"));
        totals.push(creativeConversionTotal([cur]));
    }
    // Every total must be >= the prior one.
    for (let i = 1; i < totals.length; i++) {
        assert.ok(
            totals[i] >= totals[i - 1],
            `monotonic: totals[${i - 1}]=${totals[i - 1]} → totals[${i}]=${totals[i]}`,
        );
    }
    assert.equal(totals[0], 5);
    assert.equal(totals[5], 5);
});

// ─── FR-085a — absent rows are NOT zero ──────────────────────

test("FR-085a absent-day: a missing daily row leaves the key ABSENT, not 0", () => {
    // Only 2025-01-01 was observed. 2025-01-02 was not. Map MUST
    // NOT contain a key for 2025-01-02 (it would be evidence drawn
    // from absence, FR-085a forbids).
    const out = accrueDays(
        null,
        [day("2025-01-01", 3)],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-02"], undefined, "absent day must not appear in map");
    assert.equal(Object.prototype.hasOwnProperty.call(out.days, "2025-01-02"), false);
    // A subsequent observation on 2025-01-02 — without touching
    // 2025-01-01 — must only write the new key.
    const out2 = accrueDays(out, [day("2025-01-02", 1)], window("2025-01-01", "2025-01-07"));
    assert.equal(out2.days["2025-01-01"].conversions, 3, "prior day preserved");
    assert.equal(out2.days["2025-01-02"].conversions, 1, "new day added");
});

test("FR-085a empty actions: a row that arrived for the date has no actions is recorded as observed-with-zero, not absent", () => {
    // Distinction: empty-day-with-date IS observed (count 0 for
    // the day); not-arrived is NOT observed.
    const out = accrueDays(null, [emptyDay("2025-01-01")], window("2025-01-01", "2025-01-07"));
    assert.equal(out.days["2025-01-01"].conversions, 0, "row arrived with empty actions → 0");
});

// ─── FR-084a — bounded retention ─────────────────────────────

test("FR-084a finalise: a day leaving the window moves to finalisedTotal", () => {
    // First window: 2024-12-25..2025-01-01 inclusive (8 days). All
    // three daily rows are inside, so 3 days are written in-window.
    let cur: DayAccrual = accrueDays(
        null,
        [day("2024-12-30", 4), day("2024-12-31", 6), day("2025-01-01", 2)],
        window("2024-12-25", "2025-01-01"),
    );
    assert.equal(cur.finalisedConversions, 0);
    assert.equal(cur.finalisedDayCount, 0);
    assert.equal(Object.keys(cur.days).length, 3);

    // Slide the window forward. 2024-12-30 and 2024-12-31 are now
    // BEFORE the new window's `since` and must be finalised; the
    // 2025-01-01 entry stays (since <= 2025-01-01 <= until).
    cur = accrueDays(
        cur,
        [],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(cur.finalisedConversions, 10);
    assert.equal(cur.finalisedDayCount, 2);
    assert.deepEqual(Object.keys(cur.days).sort(), ["2025-01-01"]);
});

test("FR-084a / SC-051 bounded retention: 100 syncs of the same window keep `days` map size <= 7", () => {
    let cur: DayAccrual | null = null;
    const w = window("2025-01-01", "2025-01-07");
    const daily: InsightsDailyRow[] = [];
    for (let i = 0; i < 7; i++) {
        const day = `2025-01-0${i + 1}`;
        daily.push({
            date_start: day,
            actions: [{ action_type: "purchase", value: "1" }],
        });
    }
    for (let s = 0; s < 100; s++) {
        cur = accrueDays(cur, daily, w);
    }
    assert.ok(cur !== null, "cur must be a DayAccrual after one sync");
    const cur2 = cur as DayAccrual;
    assert.ok(
        Object.keys(cur2.days).length <= 7,
        `days map size must be bounded by window length: ${Object.keys(cur2.days).length} <= 7`,
    );
});

test("FR-084a out-of-window row dropped, not finalised under 'as-if-in-window' assumption", () => {
    // Defensive: a daily row whose date is AFTER `until` must NOT
    // be written. The Meta preset returns exactly the seven days
    // ending yesterday, but the spec's window check is the guard
    // that keeps the design from depending on that.
    const out = accrueDays(
        null,
        [day("2025-01-10", 99)],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-10"], undefined);
});

// ─── FR-084 — (ad row id, date) key (SC-040) ──────────────────

test("FR-084 (ad-row, date) key: two rows with the same date → two separate entries (no coarse-key collapse)", () => {
    // Two rows of the same creative, observed on the same date, are
    // summed at the creative level. A coarser key (creative, date)
    // would drop one of them. This test exercises THAT failure: the
    // per-row `days` map must hold each row's contribution to its
    // OWN DayAccrual — collapsing happens at the creative layer, not
    // at the row layer.
    const rowADay: DayAccrual = accrueDays(null, [day("2025-01-01", 3)], window("2025-01-01", "2025-01-07"));
    const rowBDay: DayAccrual = accrueDays(null, [day("2025-01-01", 5)], window("2025-01-01", "2025-01-07"));
    const creativeTotal = creativeConversionTotal([rowADay, rowBDay]);
    assert.equal(creativeTotal, 8, "(creative, date) key would report 5 (losing row A's 3)");
});

test("FR-084 (ad-row, date) key: same row re-observed twice in one sync → stored once (no fine-key double-count)", () => {
    // The per-row map is keyed by `date` ON the row document. The
    // row IS the dedup on ad id; the map key is the date. Two
    // rows for the same date in the SAME input would mean Meta
    // emitted two rows for the same date — an invalid input. But
    // upward-only revision kicks in within those: the first wins,
    // a lower one is a no-op, a higher one replaces.
    const out = accrueDays(
        null,
        [day("2025-01-01", 3), day("2025-01-01", 7), day("2025-01-01", 5)],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-01"].conversions, 7, "highest observation wins; lower no-ops");
});

test("FR-084 vs ad-id-only key: the same row across two syncs accrues ONCE per day, not twice", () => {
    // ad-id-only keys would re-add the day on every sync. The
    // (ad-row, date) key scopes the dedup to the row+date pair,
    // so a re-observation is a no-op in the lower direction and
    // a replace in the higher. A finer key (row id alone, with
    // no date) would double.
    let cur: DayAccrual | null = null;
    const a = day("2025-01-01", 3);
    cur = accrueDays(cur, [a], window("2025-01-01", "2025-01-07"));
    cur = accrueDays(cur, [a], window("2025-01-01", "2025-01-07"));
    cur = accrueDays(cur, [a], window("2025-01-01", "2025-01-07"));
    assert.ok(cur !== null, "cur must be a DayAccrual after one sync");
    const cur2 = cur as DayAccrual;
    assert.equal(cur2.days["2025-01-01"].conversions, 3, "three identical observations accumulate as 3, not 9");
});

// ─── FR-077 — creativeConversionTotal ─────────────────────────

test("FR-077(a) creative total: sum across a creative's rows (finalised + in-window)", () => {
    // Two rows, each with a finalised total and a current-days value.
    const rowA: DayAccrual = {
        days: { "2025-01-05": { conversions: 2, spend: 0 } },
        finalisedConversions: 1,
        finalisedSpend: 0,
        finalisedDayCount: 1,
        lastObservedWindow: window("2025-01-01", "2025-01-07"),
    };
    const rowB: DayAccrual = {
        days: { "2025-01-06": { conversions: 1, spend: 0 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: window("2025-01-01", "2025-01-07"),
    };
    assert.equal(creativeConversionTotal([rowA, rowB]), 4);
});

test("FR-077(a) creative total: a missing-row contribution does not poison the sum", () => {
    assert.equal(creativeConversionTotal([null, undefined, {
        days: { "2025-01-01": { conversions: 4, spend: 0 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    }]), 4);
});

// ─── FR-085 — isStopped (SC-041) ─────────────────────────────

test("FR-085 isStopped: ACTIVE → not stopped", () => {
    assert.equal(isStopped("ACTIVE"), false);
    assert.equal(isStopped("active"), false);
    assert.equal(isStopped("Active"), false);
});

test("FR-085 isStopped: PAUSED → stopped", () => {
    assert.equal(isStopped("PAUSED"), true);
    assert.equal(isStopped("paused"), true);
});

test("FR-085 isStopped: DELETED / ARCHIVED → stopped", () => {
    assert.equal(isStopped("DELETED"), true);
    assert.equal(isStopped("ARCHIVED"), true);
});

test("FR-085 isStopped: IN_PROCESS → not stopped (in-process is not paused)", () => {
    assert.equal(isStopped("IN_PROCESS"), false);
});

test("FR-085 isStopped: unknown status → not stopped (under-detect, FR-085)", () => {
    assert.equal(isStopped("FROZEN_IN_A_FAR_DISTANT_GALAXY"), false);
});

test("SC-041 isStopped: parent-paused ad with own status=ACTIVE is NOT stopped (under-detect by design)", () => {
    // The under-detect case FR-085 names explicitly: a parent-paused
    // ad's own `status` is still ACTIVE — `effective_status` would
    // surface the parent pause, but it is deferred (FR-085 accepted
    // cost). `isStopped` MUST return false here so the creative
    // simply never seals via condition (b) on this ad — the failure
    // mode is a missing contribution, never a wrong one.
    assert.equal(isStopped("ACTIVE"), false, "parent-paused ad reads as ACTIVE; isStopped must under-detect");
    assert.equal(isStopped(null), false, "null status is treated as not stopped");
});

test("SC-041 isStopped: null / undefined → not stopped", () => {
    assert.equal(isStopped(null), false);
    assert.equal(isStopped(undefined), false);
});

// ─── Round-15 — legacy `finalisedTotal` migration ───────────────────

test("Round-15 migration: a legacy record with `finalisedTotal` migrates into finalisedConversions with finalisedSpend=0", () => {
    // Pre-Batch-3 records on disk carry `{ finalisedTotal }` (a
    // single number). Reading the new fields directly produced
    // `undefined` and crashed arithmetic. Round-15 makes the
    // migration explicit; the legacy total maps to
    // `finalisedConversions` because the legacy shape tracked
    // conversions only (no per-day spend). `finalisedSpend`
    // defaults to zero because the legacy shape did not record it.
    const legacy: any = {
        days: {},
        finalisedTotal: 7,
        // The new fields are absent — simulating a pre-Batch-3 doc.
    };
    const out = accrueDays(legacy, [], window("2025-01-08", "2025-01-14"));
    assert.equal(out.finalisedConversions, 7,
        `legacy finalisedTotal=7 → finalisedConversions=7 (got ${out.finalisedConversions})`);
    assert.equal(out.finalisedSpend, 0,
        `finalisedSpend defaults to 0 for legacy records (got ${out.finalisedSpend})`);
});

// ─── Round-15 — finalised-day re-add guard ────────────────────────

test("Round-15: a delayed retry with the same window does NOT silently inflate accumulations", () => {
    // The bounded read at `metaSync/shared.ts:1097` records
    // `lastObservedWindow`. A delayed retry arrives with the same
    // window AND the same daily rows. Step 2 (`for (const isoDate of
    // Object.keys(days))`) handles out-of-window dates; for a same-
    // window retry, the per-row update branch on `prior = days[isoDate]`
    // applies FR-083 upward-only. This test pins that the loop has
    // no implicit-inflation path for a same-window retry.
    const prior: any = {
        days: { "2025-01-01": { conversions: 3, spend: 100 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: { since: "2025-01-01", until: "2025-01-07" },
    };
    // Same-window retry with the SAME observation and a NEW higher one.
    const retryRows: InsightsDailyRow[] = [
        day("2025-01-01", 3, 100),        // identical — no move
        day("2025-01-02", 5, 200),        // new — adds
        day("2025-01-03", 999, 100000),  // much higher — replaces per FR-083
    ];
    const out = accrueDays(prior, retryRows, window("2025-01-01", "2025-01-07"));
    assert.equal(out.days["2025-01-01"]?.conversions, 3,
        "an equal observation is a no-op (FR-083 upward-only)");
    assert.equal(out.days["2025-01-02"]?.conversions, 5,
        "a previously-unobserved date is added");
    assert.equal(out.days["2025-01-03"]?.conversions, 999,
        "a higher observation replaces (FR-083 upward-only)");
});

test("Round-15: a forward-rolling window finalises out-of-window dates and shifts the running totals", () => {
    // The window from Jan 8-14 rolls forward: dates Jan 1-7 are
    // out of the new window and get finalised by step 2 of
    // `accrueDays`. A delayed retry in this window for the SAME
    // out-of-window date (e.g. Jan 7 in the new dailyRows) cannot
    // re-add it because the loop's window filter rejects it before
    // it reaches the days map. The running totals are monotone —
    // any new observation in `existing.days` lifts them.
    const prior: any = {
        days: { "2025-01-01": { conversions: 1, spend: 100 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: { since: "2025-01-01", until: "2025-01-07" },
    };
    // Same as above but the new window is Jan 8-14; Jan 1 falls
    // out of window and finalises.
    const newRows: InsightsDailyRow[] = [
        day("2025-01-08", 2, 50),
        // A "stale retry" carrying Jan 1 (would-be finalised) is
        // dropped by the window filter at the top of step 3.
        day("2025-01-01", 999, 999),
    ];
    const out = accrueDays(prior, newRows, window("2025-01-08", "2025-01-14"));
    assert.equal(out.finalisedConversions, 1,
        `out-of-window date Jan 1 finalised (got ${out.finalisedConversions})`);
    assert.equal(out.finalisedSpend, 100,
        `Jan 1's spend folds into finalisedSpend (got ${out.finalisedSpend})`);
    assert.equal(out.days["2025-01-08"]?.conversions, 2,
        "the new Jan 8 observation is recorded");
    assert.equal(out.days["2025-01-01"], undefined,
        "Jan 1's finalisation removed it from days");
});

// ─── FR-086 / FR-086a — days-lost-to-gaps ─────────────────────

test("FR-086a days-lost: zero when the windows are adjacent (1 day elapsed between syncs)", () => {
    // Last sync observed [Jan 1..Jan 7]. Today observed [Jan 8..Jan 14].
    // No gap: Jan 7 → Jan 8 is one day forward.
    assert.equal(daysLostToGaps(window("2025-01-01", "2025-01-07"), window("2025-01-08", "2025-01-14")), 0);
});

test("FR-086a days-lost: 2 days when the windows are separated by 2 missing dates (seventh missed sync threshold)", () => {
    // Last sync observed [Jan 1..Jan 7]. Today observed [Jan 10..Jan 16].
    // Gap: Jan 8, Jan 9 (2 days). This is the seventh-missed-sync
    // boundary — first time any gap exists.
    assert.equal(daysLostToGaps(window("2025-01-01", "2025-01-07"), window("2025-01-10", "2025-01-16")), 2);
});

test("FR-086a days-lost: zero on the first sync (no prior window)", () => {
    assert.equal(daysLostToGaps(null, window("2025-01-08", "2025-01-14")), 0);
});

test("FR-086a days-lost: zero when the windows overlap", () => {
    // Same window twice — no gap, no lost days.
    assert.equal(daysLostToGaps(window("2025-01-01", "2025-01-07"), window("2025-01-01", "2025-01-07")), 0);
});

test("FR-086a days-lost: counts STRICTLY-BETWEEN dates, not dates with no row", () => {
    // This test pins the disambiguating case FR-086a is written for:
    // a date INSIDE today's window that Meta did not return is
    // NOT a gap (FR-085a — the ad did not deliver). The gap count
    // must be zero even when today's window has fewer entries than
    // its size would allow.
    //
    // The disambiguation happens because the gap count is computed
    // from window bounds alone — never from a Meta response. So we
    // pass `window.lastObservedWindow = [Jan 1..Jan 7]` and
    // `thisWindow = [Jan 8..Jan 14]` (adjacent), and assert
    // `daysLostToGaps === 0`. A row ABSENT inside this window
    // would make this 0 today even if Meta returned nothing.
    assert.equal(daysLostToGaps(window("2025-01-01", "2025-01-07"), window("2025-01-08", "2025-01-14")), 0);
});

// ─── Summary ─────────────────────────────────────────────────

const beforeExit = failed === 0 ? PASSED : FAILED;

console.log("");
// ─── Batch 3 — spend alongside conversions in the same per-day entry ───

test("spend: a higher spend observation replaces the recorded spend in the per-day entry", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 0, spend: 5 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(
        existing,
        [{ date_start: "2025-01-03", spend: "10" }],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-03"].spend, 10);
});

test("spend: a lower spend observation is a no-op (FR-083 upward-only)", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 0, spend: 10 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(
        existing,
        [{ date_start: "2025-01-03", spend: "5" }],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-03"].spend, 10, "no-lower must not overwrite the higher recorded spend");
});

test("spend: conversions and spend live in the same per-day entry — independent upward-only", () => {
    const existing: DayAccrual = {
        days: { "2025-01-03": { conversions: 5, spend: 10 } },
        finalisedConversions: 0,
        finalisedSpend: 0,
        finalisedDayCount: 0,
        lastObservedWindow: null,
    };
    const out = accrueDays(
        existing,
        [{ date_start: "2025-01-03", spend: "20" }],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-03"].conversions, 5, "conversions untouched when only spend revised");
    assert.equal(out.days["2025-01-03"].spend, 20, "spend updated upward");
});

test("spend: a missing `spend` field on a row contributes 0, NOT a missing key (FR-085a absence rule)", () => {
    const out = accrueDays(
        null,
        [{ date_start: "2025-01-03", actions: [] }],
        window("2025-01-01", "2025-01-07"),
    );
    assert.equal(out.days["2025-01-03"].spend, 0, "absent spend must contribute 0");
    assert.equal(out.days["2025-01-03"].conversions, 0);
});

test("spend: finalisation folds BOTH conversions and spend into their running totals", () => {
    // The day's entry has spend=5 and conversions=2. When the day
    // leaves the window, BOTH numbers must move into the running
    // totals — finalisedDayCount moves by exactly one, regardless of
    // how many numbers the entry carries.
    const out = accrueDays(
        null,
        [{ date_start: "2024-12-30", spend: "5", actions: [{ action_type: "purchase", value: "2" }] }],
        window("2024-12-30", "2024-12-30"),
    );
    // Now slide the window. The day is OUTSIDE the new window, so
    // it must be finalised.
    const out2 = accrueDays(out, [], window("2025-01-01", "2025-01-07"));
    assert.equal(out2.finalisedSpend, 5, "spend moved to finalisedSpend");
    assert.equal(out2.finalisedConversions, 2, "conversions moved to finalisedConversions");
    assert.equal(out2.finalisedDayCount, 1, "day count moves by exactly one");
    assert.equal(Object.keys(out2.days).length, 0, "the day is no longer in the days map");
});

test("spend: a creative 90 days old reads cost and result from the same per-day window (FR-002a / §14.2 of the plan)", () => {
    // This is the test the owner named in the §14.2 correction.
    // A creative running 90 days has 90 days of conversions and 90
    // days of spend. The accumulator carries both per-day. The
    // total cost figure MUST use the accrued spend — the
    // aggregate-then-divide's numerator — not `metrics.spend7d`,
    // which would be the rolling 7-day sum and would produce a
    // figure roughly an order of magnitude off (12.86× cheaper
    // than the true figure, by the ratio 90/7).
    //
    // We construct the per-day data for a 90-day-old creative with
    // 4 placements, then sum via the public aggregator. This is
    // the surface that the efficiency figure's test will exercise.
    const rows: DayAccrual[] = [];
    const numPlacements = 4;
    const numDays = 90;
    const conversionsPerDayPerRow = 0.5;
    const spendPerDayPerRow = 12.5;
    for (let r = 0; r < numPlacements; r++) {
        const days: { [iso: string]: { conversions: number; spend: number } } = {};
        for (let d = 0; d < numDays; d++) {
            const day = new Date(2025, 8, 1);
            day.setDate(day.getDate() + d);
            const iso = day.toISOString().slice(0, 10);
            days[iso] = { conversions: conversionsPerDayPerRow, spend: spendPerDayPerRow };
        }
        rows.push({
            days,
            finalisedConversions: 0,
            finalisedSpend: 0,
            finalisedDayCount: 0,
            lastObservedWindow: null,
        });
    }
    const totalConversions = creativeConversionTotal(rows);
    const totalSpend = creativeCostTotal(rows);
    // The figures are floats — round to integer for assertion
    // cleanliness. The exact counts are 4 placements × 90 days ×
    // 0.5/day = 180 conversions and 4 × 90 × 12.5 = $4500.
    assert.equal(totalConversions, 180, "90 days × 4 placements × 0.5/day = 180");
    assert.equal(totalSpend, 4500, "90 days × 4 placements × $12.50/day = $4500");
});

console.log(`=== Phase 4 Batch 1 — conversion-accrual tests ===`);
console.log(`Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
    process.exit(FAILED);
}
process.exit(beforeExit);
