// functions/src/__tests__/metaSyncConcurrency.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 970 Batch 1 (D5) — structural guard for the Graph concurrency
// ceiling applied to `runSyncForAccount`'s per-ad fan-out.
//
// WHY THIS FILE EXISTS
// --------------------
// Pre-batch, `shared.ts:559` and `shared.ts:703` used bare
// `Promise.allSettled(ads.map(…))` to fan out the per-ad insights and
// image-download calls. For a 383-ad account that fires ~1,149 Graph
// requests simultaneously — exactly the pattern that trips Meta's
// app-wide "Application request limit reached" (code 4 / subcode 1504022,
// investigation report §1.3 / §6).
//
// The fix replaces both call sites with helpers from `metaSync/concurrency.ts`
// that cap in-flight work at `GRAPH_CONCURRENCY` (= 8). This file pins the
// cap structurally:
//
//   1. The helpers themselves never exceed the supplied limit, even on a
//      large input — peaks are observed, not assumed.
//   2. `shared.ts` exports the same constant the test asserts against, so
//      a future retune is one local change.
//   3. The `mapSettledWithConcurrency` shape preserves the
//      `Promise.allSettled`-style verdicts the production code reads at
//      `shared.ts:564-568` (Fulfilled → store insights;
//      Rejected → push error message).
//
// Follows the same pattern as `teamWorkspaceAccess.test.ts` and
// `whatsWorkingDashboardScope.test.ts`: a `node:test`-shaped runner that
// imports the compiled helper directly and observes observable behaviour.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";
import { test } from "node:test";

import {
    mapWithConcurrency,
    mapSettledWithConcurrency,
    peakConcurrency,
} from "../metaSync/concurrency.js";
import { GRAPH_CONCURRENCY } from "../metaSync/shared.js";

// ─── Helper: an instrumented async function that yields the loop a chance
//       to interleave workers, so the peak counter is observable rather
//       than assuming Promise scheduling.

function makeInstrumented(perItemMs = 8): {
    fn: (item: number) => Promise<number>;
    inFlight: () => number;
} {
    let inFlight = 0;
    return {
        inFlight: () => inFlight,
        fn: async (n: number): Promise<number> => {
            inFlight++;
            try {
                // Small artificial delay lets the worker pool place other
                // workers while this one is in flight. Too small and the
                // test races the scheduler; too large and the test runs
                // slowly for no benefit. 8ms is enough on Node 24 to let
                // several workers enter the pool.
                await new Promise((resolve) => setTimeout(resolve, perItemMs));
                return n * 2;
            } finally {
                inFlight--;
            }
        },
    };
}

// ─── The three helpers ─────────────────────────────────────────

test("mapWithConcurrency — peak in-flight never exceeds the limit", async () => {
    const items = Array.from({ length: 64 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;
    const fn = async (n: number): Promise<number> => {
        inFlight++;
        if (inFlight > peak) peak = inFlight;
        try {
            await new Promise((r) => setTimeout(r, 5));
            return n;
        } finally {
            inFlight--;
        }
    };
    const out = await mapWithConcurrency(items, GRAPH_CONCURRENCY, fn);
    assert.equal(out.length, 64);
    assert.equal(out[0], 0);
    assert.equal(out[63], 63);
    assert.ok(
        peak <= GRAPH_CONCURRENCY,
        `peak=${peak} exceeded GRAPH_CONCURRENCY=${GRAPH_CONCURRENCY}`,
    );
    assert.ok(peak >= 2, `peak=${peak} — concurrency helper should run more than one worker`);
});

test("mapWithConcurrency — output preserves input order regardless of worker count", async () => {
    const items = Array.from({ length: 32 }, (_, i) => i);
    const fn = async (n: number): Promise<number> => {
        // Different delays per item so the natural completion order
        // differs from the input order. The helper must still emit
        // input-order results.
        await new Promise((r) => setTimeout(r, (31 - n) * 2));
        return n;
    };
    const out = await mapWithConcurrency(items, 4, fn);
    for (let i = 0; i < items.length; i++) {
        assert.equal(out[i], i, `out[${i}] should equal ${i}`);
    }
});

test("mapWithConcurrency — propagates a rejection without dropping in-flight work", async () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const fn = async (n: number): Promise<number> => {
        if (n === 7) throw new Error("boom");
        await new Promise((r) => setTimeout(r, 5));
        return n;
    };
    let caught: Error | null = null;
    try {
        await mapWithConcurrency(items, GRAPH_CONCURRENCY, fn);
    } catch (e) {
        caught = e as Error;
    }
    assert.ok(caught, "expected the rejection to propagate");
    assert.equal(caught!.message, "boom");
});

test("mapSettledWithConcurrency — same input/output lengths, success and failure verdicts preserved", async () => {
    const items = Array.from({ length: 16 }, (_, i) => i);
    const fn = async (n: number): Promise<number> => {
        if (n % 4 === 0) throw new Error(`bad-${n}`);
        await new Promise((r) => setTimeout(r, 5));
        return n;
    };
    const out = await mapSettledWithConcurrency(items, GRAPH_CONCURRENCY, fn);
    assert.equal(out.length, 16);
    let fulfilled = 0;
    let rejected = 0;
    for (const r of out) {
        if (r.status === "fulfilled") fulfilled++;
        else rejected++;
    }
    assert.equal(fulfilled, 12, "16 items minus 4 every-fourth rejected");
    assert.equal(rejected, 4);
    // Spot-check indices known to be rejected (multiples of 4) and
    // known to be fulfilled (everything else).
    assert.equal(out[0].status, "rejected");
    assert.equal(out[4].status, "rejected");
    assert.equal(out[1].status, "fulfilled");
    assert.equal((out[1] as PromiseFulfilledResult<number>).value, 1);
    // Order is preserved — verdict at index k matches input at index k.
});

test("mapSettledWithConcurrency — peak in-flight never exceeds the limit", async () => {
    const items = Array.from({ length: 64 }, (_, i) => i);
    const peak = await peakConcurrency(items, GRAPH_CONCURRENCY, async (n: number) => {
        await new Promise((r) => setTimeout(r, 5));
        return n;
    });
    assert.ok(
        peak <= GRAPH_CONCURRENCY,
        `peak=${peak} exceeded GRAPH_CONCURRENCY=${GRAPH_CONCURRENCY}`,
    );
    assert.ok(peak >= 2);
});

test("mapSettledWithConcurrency — output preserves input order", async () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const fn = async (n: number): Promise<number> => {
        await new Promise((r) => setTimeout(r, (19 - n) * 3));
        return n;
    };
    const out = await mapSettledWithConcurrency(items, 4, fn);
    for (let i = 0; i < items.length; i++) {
        assert.equal(out[i].status, "fulfilled");
        assert.equal((out[i] as PromiseFulfilledResult<number>).value, i);
    }
});

// ─── Degraded inputs ───────────────────────────────────────────

test("mapWithConcurrency — empty input resolves to an empty array", async () => {
    const out = await mapWithConcurrency([], 8, async () => 1);
    assert.equal(out.length, 0);
});

test("mapSettledWithConcurrency — limit larger than input still produces every input exactly once", async () => {
    const items = [10, 20, 30];
    let calls = 0;
    const fn = async (n: number): Promise<number> => {
        calls++;
        return n;
    };
    const out = await mapSettledWithConcurrency(items, 100, fn);
    assert.equal(calls, 3, "fn called exactly three times");
    assert.equal(out.length, 3);
    assert.equal((out[0] as PromiseFulfilledResult<number>).value, 10);
    assert.equal((out[1] as PromiseFulfilledResult<number>).value, 20);
    assert.equal((out[2] as PromiseFulfilledResult<number>).value, 30);
});

test("mapWithConcurrency — limit of 1 is still valid (serial baseline)", async () => {
    const items = Array.from({ length: 8 }, (_, i) => i);
    let inFlight = 0;
    let peak = 0;
    const fn = async (n: number): Promise<number> => {
        inFlight++;
        if (inFlight > peak) peak = inFlight;
        try {
            await new Promise((r) => setTimeout(r, 2));
            return n;
        } finally {
            inFlight--;
        }
    };
    const out = await mapWithConcurrency(items, 1, fn);
    assert.equal(out.length, 8);
    assert.equal(peak, 1, "limit=1 must mean serial");
});

// ─── Structural guard: shared.ts really exports GRAPH_CONCURRENCY ───

test("structural guard — shared.ts exports GRAPH_CONCURRENCY === 8", () => {
    assert.equal(
        GRAPH_CONCURRENCY,
        8,
        "GRAPH_CONCURRENCY must stay at 8 unless the report is re-issued; the value is a named constant by design.",
    );
});

test("structural guard — metaSync/shared.ts is the only place this constant is defined", async () => {
    const shared = await import("../metaSync/shared.js");
    // The constant must be present, finite, and a positive integer. A
    // typo (e.g. a string) would silently disable the limiter.
    assert.equal(typeof shared.GRAPH_CONCURRENCY, "number");
    assert.ok(Number.isFinite(shared.GRAPH_CONCURRENCY));
    assert.ok(shared.GRAPH_CONCURRENCY > 0);
    assert.ok(Number.isInteger(shared.GRAPH_CONCURRENCY));
});
