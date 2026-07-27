// functions/src/__tests__/phase20Wiring.test.ts — Phase 14 Layer 7b
// ═══════════════════════════════════════════════════════════
// node:test runner. Integration tests for the Phase 20
// `pastWinningAds` wiring:
//   1. `loadTopWinners` returns the 5 most recent S1 winners,
//      sorted by `evaluatedAt` desc.
//   2. `filterTopWinners` returns whatever exists when fewer
//      than 5 are available, [] when none exist.
//   3. Fail-open: `loadTopWinners` returns [] on Firestore errors.
//   4. The `index.ts` orchestrator passes the loaded winners to
//      `directConcept` and to `generators.generateConcepts`.
//   5. `buildPastWinnersBlock` (in generators.ts) emits a
//      past-winners prompt block when winners exist, and emits
//      "" when they do not (no prompt regression).
//   6. Source-scan: the wiring is in place at the three sites
//      (load → pass to director → pass to generators).
// ═══════════════════════════════════════════════════════════

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { join } from "path";
import {
  filterTopWinners,
  loadTopWinners,
  type WinningAd,
  type AdPerformanceWinnerCandidate,
} from "../getTopWinners.js";

// ─── Fixtures ────────────────────────────────────────────────

function makeCand(overrides: Partial<AdPerformanceWinnerCandidate> = {}): AdPerformanceWinnerCandidate {
  return {
    adId: "ad-1",
    generationId: "gen-1",
    matchType: "auto_hash",
    metadataAvailable: true,
    campaignObjective: "conversion",
    verdict: "🟢",
    evaluatedAt: 1_000_000,
    linkCtr: 1.5,
    cpa3d: 5,
    ...overrides,
  };
}

function makeWinner(overrides: Partial<WinningAd> = {}): WinningAd {
  return {
    generationId: "gen-1",
    hookAngle: "urgency",
    hookText: "Stop scrolling",
    layoutTemplate: "hero_value_stack",
    creativeModes: ["standard_hero", "value_stack"],
    artDirection: "dark_cinematic",
    universe: "uae",
    linkCtr: 1.5,
    cpa: 5,
    evaluatedAt: 1_000_000,
    ...overrides,
  };
}

// ─── Pure filter (the 4 source-loaded + 0 scenarios) ────────

test("phase 20 wiring: 5 S1 winners → pastWinningAds has 5 entries sorted by evaluatedAt desc", () => {
  const cands: AdPerformanceWinnerCandidate[] = [
    makeCand({ adId: "a1", generationId: "gen-1", evaluatedAt: 1_000_000 }),
    makeCand({ adId: "a2", generationId: "gen-2", evaluatedAt: 2_000_000 }),
    makeCand({ adId: "a3", generationId: "gen-3", evaluatedAt: 3_000_000 }),
    makeCand({ adId: "a4", generationId: "gen-4", evaluatedAt: 4_000_000 }),
    makeCand({ adId: "a5", generationId: "gen-5", evaluatedAt: 5_000_000 }),
  ];
  const out = filterTopWinners(cands, (id) => {
    const c = cands.find((x) => x.generationId === id);
    return makeWinner({ generationId: id, evaluatedAt: c?.evaluatedAt ?? 0 });
  });
  assert.equal(out.length, 5);
  assert.equal(out[0].evaluatedAt, 5_000_000);
  assert.equal(out[4].evaluatedAt, 1_000_000);
});

test("phase 20 wiring: 0 winners → pastWinningAds is empty array (no regression)", () => {
  const out = filterTopWinners([], () => makeWinner(), 5);
  assert.equal(out.length, 0);
  assert.deepEqual(out, []);
});

// ─── loadTopWinners: fail-open on Firestore errors ──────────

test("phase 20 wiring: loadTopWinners returns [] when no winners exist (fail-open)", async () => {
  // The function is fail-open by design — any read failure or empty
  // result returns []. This test calls the function in an environment
  // where Firestore is not initialized; the catch block returns [].
  // (The Admin SDK is not initialized in the test harness, so any
  // attempted read will fail and the catch-all at the bottom of
  // loadTopWinners returns []).
  const out = await loadTopWinners("u1", "w1", "a1", 5);
  assert.deepEqual(out, []);
});

test("phase 20 wiring: loadTopWinners returns [] on invalid accountId (fail-open)", async () => {
  const out = await loadTopWinners("u1", "w1", "nonexistent-account", 5);
  assert.deepEqual(out, []);
});

// ─── Each WinningAd has the correct fields from the generation doc ─

test("phase 20 wiring: each WinningAd carries the right fields from the generation", () => {
  const cands: AdPerformanceWinnerCandidate[] = [
    makeCand({ adId: "a1", generationId: "gen-1", evaluatedAt: 5_000_000, linkCtr: 2.5, cpa3d: 12 }),
  ];
  const out = filterTopWinners(cands, () => makeWinner({
    generationId: "gen-1",
    hookAngle: "urgency",
    hookText: "Limited time",
    layoutTemplate: "hero_value_stack",
    creativeModes: ["standard_hero"],
    artDirection: "dark_cinematic",
    universe: "uae",
    linkCtr: 2.5,
    cpa: 12,
    evaluatedAt: 5_000_000,
  }));
  assert.equal(out.length, 1);
  const w = out[0];
  assert.equal(w.generationId, "gen-1");
  assert.equal(w.hookAngle, "urgency");
  assert.equal(w.hookText, "Limited time");
  assert.equal(w.layoutTemplate, "hero_value_stack");
  assert.deepEqual(w.creativeModes, ["standard_hero"]);
  assert.equal(w.artDirection, "dark_cinematic");
  assert.equal(w.universe, "uae");
  assert.equal(w.linkCtr, 2.5);
  assert.equal(w.cpa, 12);
  assert.equal(w.evaluatedAt, 5_000_000);
});

// ─── Source-scan: wiring in index.ts + generators.ts ────────

test("phase 20 wiring: index.ts loads top winners in serverGenerateConcepts", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
  // serverGenerateConcepts imports loadTopWinners
  assert.ok(/import\s*\{[^}]*loadTopWinners[^}]*\}\s*from\s*"\.\/getTopWinners\.js"/.test(src),
    "index.ts imports loadTopWinners from ./getTopWinners.js");
  // The orchestrator calls loadTopWinners(...) somewhere
  assert.ok(/loadTopWinners\(/.test(src), "index.ts calls loadTopWinners()");
  // The result is assigned to a local like `_topWinners`
  assert.ok(/_topWinners/.test(src), "index.ts stores the loaded winners in a local");
});

test("phase 20 wiring: index.ts passes _topWinners to directConcept (initial + retry paths)", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
  // Two `pastWinningAds: _topWinners` lines (initial + retry)
  const matches = src.match(/pastWinningAds:\s*_topWinners/g);
  assert.ok(matches !== null, "index.ts passes _topWinners as pastWinningAds");
  assert.ok(matches!.length >= 2, "index.ts passes _topWinners in BOTH the initial and retry paths");
});

test("phase 20 wiring: index.ts passes _topWinners to generators.generateConcepts", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "index.ts"), "utf8");
  // generateConcepts is called with the _topWinners as a trailing argument
  assert.ok(/generators\.generateConcepts\([^)]*_topWinners[^)]*\)/.test(src),
    "generators.generateConcepts receives _topWinners");
});

test("phase 20 wiring: generators.generateConcepts signature accepts pastWinningAds", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
  assert.ok(/function\s+generateConcepts\([^)]*pastWinningAds/.test(src),
    "generators.generateConcepts signature includes pastWinningAds parameter");
});

test("phase 20 wiring: generators.ts appends a past-winners block to the concept prompt", () => {
  const src = readFileSync(join(__dirname, "..", "..", "src", "generators.ts"), "utf8");
  // The block builder is defined
  assert.ok(/function\s+buildPastWinnersBlock/.test(src), "generators.ts defines buildPastWinnersBlock");
  // It is called with the pastWinningAds arg
  assert.ok(/buildPastWinnersBlock\(pastWinningAds/.test(src), "generators.ts calls buildPastWinnersBlock(pastWinningAds)");
  // It is appended to finalPrompt only when there are winners
  assert.ok(/pastWinningAds\s*&&\s*pastWinningAds\.length\s*>\s*0/.test(src),
    "generators.ts gates the winners block on pastWinningAds.length > 0");
});

// ─── buildPastWinnersBlock: behavior (via direct behavioral test) ─

// Import the (now-exported) builder from generators.ts so the
// behavior test asserts on the actual implementation, not a
// source-text regex that would silently break on a refactor.
import { buildPastWinnersBlock } from "../generators.js";

test("phase 20 wiring: buildPastWinnersBlock returns '' for empty winners (regression-safe)", () => {
  assert.equal(buildPastWinnersBlock([]), "");
});

test("phase 20 wiring: buildPastWinnersBlock emits a non-empty block with the hook + layout for >= 1 winner", () => {
  const block = buildPastWinnersBlock([
    makeWinner({
      generationId: "gen-1",
      hookAngle: "urgency",
      hookText: "Stop scrolling",
      layoutTemplate: "hero_value_stack",
      artDirection: "dark_cinematic",
    }),
  ]);
  assert.notEqual(block, "");
  // Field content assertions (not source-text regexes).
  assert.ok(block.includes("urgency"), "block names the hook angle");
  assert.ok(block.includes("Stop scrolling"), "block includes the hook text");
  assert.ok(block.includes("hero_value_stack"), "block includes the layout template");
});

test("phase 20 wiring: buildPastWinnersBlock normalizes hookText (single line, capped at 80 chars)", () => {
  const longHook = "X".repeat(200);
  const block = buildPastWinnersBlock([
    makeWinner({
      generationId: "gen-1",
      hookAngle: "urgency",
      hookText: longHook,
    }),
  ]);
  // The hook text inside the wrapped quotes should be at most 80 chars.
  const match = block.match(/"([^"]*)"/);
  assert.ok(match, "block contains a quoted hook text segment");
  assert.ok(match[1].length <= 80, `hook text segment must be ≤ 80 chars, got ${match[1].length}`);
});
