// src/__tests__/isEmptySnapshot.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 Batch 3 (auto-restore removal) — pure-helper regression tests
// for src/utils/isEmptySnapshot.ts.
//
// Why this file exists
// ────────────────────
// The empty-snapshot guard was originally inline at src/App.tsx:4757-4768
// (commit d8d94c5), buried in a useEffect inside the 13,600-line App
// monolith, with no test coverage. The harness is component-scoped, so
// testing the App-level effect would require mocking the entire App with
// its Firebase context. Extracting the predicate to a pure function
// makes it directly testable here. A future refactor of either side
// (the helper, the call site, or the field shape) fails loudly.
//
// Test matrix
// ───────────
// The owner's §12.7 follow-up asks for five distinctions:
//
//   1. Fully blank snapshot is empty           (the case the guard exists for)
//   2. Each field alone makes it non-empty     (one test per field × 10 fields)
//   3. Empty string '' is not content           (text fields)
//   4. Empty array [] is not content            (array fields)
//   5. Undefined and null are handled safely    (no crash on missing field)
//
// The matrix is structured so that a future edit that drops one field
// from the predicate fails EXACTLY one of the "each-field-alone" tests
// below — and the failing test names the dropped field, so the regression
// is obvious.
//
// The "undefined-safe" property is the white-screen mechanism from §12.4:
// loadProject at src/App.tsx:5467 calls `setMockupHistory(p.mockupHistory)`,
// and a malformed SavedProject without mockupHistory leaves the state at
// `undefined`. The inline guard this helper replaces would have crashed
// on `mockupHistory.length`. The helper survives the same input — these
// tests pin that.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from "vitest";
import { isEmptySnapshot, type SnapshotShape } from "../utils/isEmptySnapshot";

// Minimal placeholder AdInputs. The helper reads only the top-level
// reference (`inputs != null`), so the field contents don't matter for
// these tests — a real AdInputs shape with any field values is enough.
const fakeInputs = {
  productName: "",
  productCategory: "",
} as unknown as SnapshotShape["inputs"];

/**
 * Construct a SnapshotShape with every field at its empty default. The
 * single source of truth for "blank" in the tests below — if the helper
 * grows a new field, the test still passes (the new field defaults to
 * undefined / empty) and the next review notices the drift.
 */
function blank(overrides: Partial<SnapshotShape> = {}): SnapshotShape {
  return {
    inputs: null,
    mockupHistory: [],
    carouselSlides: [],
    batchResults: [],
    batchCaptions: [],
    batchHookGroups: [],
    tovText: "",
    conceptsText: "",
    buildPlan: "",
    captionText: "",
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────
// 1. The fresh-mount case — the predicate exists for this
// ─────────────────────────────────────────────────────────────────────

describe("isEmptySnapshot — blank snapshot is empty (the case the guard exists for)", () => {
  it("a fully blank snapshot returns true (everything at its empty default)", () => {
    expect(isEmptySnapshot(blank())).toBe(true);
  });

  it("every field null + every array empty + every text '' is empty", () => {
    // Sanity: this is what fresh-mount state looks like.
    expect(isEmptySnapshot({
      inputs: null,
      mockupHistory: [],
      carouselSlides: [],
      batchResults: [],
      batchCaptions: [],
      batchHookGroups: [],
      tovText: "",
      conceptsText: "",
      buildPlan: "",
      captionText: "",
    })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Each field alone makes the snapshot non-empty (10 tests, one per field)
// ─────────────────────────────────────────────────────────────────────

describe("isEmptySnapshot — each field alone makes the snapshot non-empty", () => {
  it("inputs alone (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ inputs: fakeInputs }))).toBe(false);
  });

  it("mockupHistory with one entry (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ mockupHistory: [{ url: "x", ratio: "1:1" }] }))).toBe(false);
  });

  it("carouselSlides with one entry (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ carouselSlides: [{ id: "x" }] }))).toBe(false);
  });

  it("batchResults with one entry (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ batchResults: [{ id: "x" }] }))).toBe(false);
  });

  it("batchCaptions with one entry (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ batchCaptions: [{ hookKey: "x" }] }))).toBe(false);
  });

  it("batchHookGroups with one entry (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ batchHookGroups: [{ hookKey: "x" }] }))).toBe(false);
  });

  it("tovText alone (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ tovText: "any non-empty string" }))).toBe(false);
  });

  it("conceptsText alone (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ conceptsText: "any non-empty string" }))).toBe(false);
  });

  it("buildPlan alone (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ buildPlan: "any non-empty string" }))).toBe(false);
  });

  it("captionText alone (everything else blank) → non-empty", () => {
    expect(isEmptySnapshot(blank({ captionText: "any non-empty string" }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. Empty string is NOT content (text fields)
// ─────────────────────────────────────────────────────────────────────

describe("isEmptySnapshot — empty string is NOT content (text fields)", () => {
  // A naive truthiness change (e.g., `if (s.tovText != null) return false;`)
  // would let '' through as "content" and the guard would silently start
  // writing empty snapshots on every refresh. These tests pin that '' is
  // treated as empty.

  it("tovText: '' is empty", () => {
    expect(isEmptySnapshot(blank({ tovText: "" }))).toBe(true);
  });

  it("conceptsText: '' is empty", () => {
    expect(isEmptySnapshot(blank({ conceptsText: "" }))).toBe(true);
  });

  it("buildPlan: '' is empty", () => {
    expect(isEmptySnapshot(blank({ buildPlan: "" }))).toBe(true);
  });

  it("captionText: '' is empty", () => {
    expect(isEmptySnapshot(blank({ captionText: "" }))).toBe(true);
  });

  it("tovText: ' ' (whitespace) is NOT empty — content includes non-empty trimmed strings", () => {
    // Defensive: the helper reads truthiness, not trimmed length. A
    // whitespace-only string is still content from this predicate's
    // perspective — the auto-save path will write it as-is, and any
    // downstream rendering is a separate concern.
    expect(isEmptySnapshot(blank({ tovText: " " }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Empty array is NOT content (array fields)
// ─────────────────────────────────────────────────────────────────────

describe("isEmptySnapshot — empty array is NOT content (array fields)", () => {
  // The five array fields all use the same `(arr?.length ?? 0) > 0`
  // shape, but each one is a separate code path in the helper. Pin
  // them individually so a future "optimization" that re-uses one
  // check for all five (and breaks one in the process) fails here.

  it("mockupHistory: [] is empty", () => {
    expect(isEmptySnapshot(blank({ mockupHistory: [] }))).toBe(true);
  });

  it("carouselSlides: [] is empty", () => {
    expect(isEmptySnapshot(blank({ carouselSlides: [] }))).toBe(true);
  });

  it("batchResults: [] is empty", () => {
    expect(isEmptySnapshot(blank({ batchResults: [] }))).toBe(true);
  });

  it("batchCaptions: [] is empty", () => {
    expect(isEmptySnapshot(blank({ batchCaptions: [] }))).toBe(true);
  });

  it("batchHookGroups: [] is empty", () => {
    expect(isEmptySnapshot(blank({ batchHookGroups: [] }))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Undefined and null are handled safely (no crash, no false negatives)
// ─────────────────────────────────────────────────────────────────────

describe("isEmptySnapshot — undefined and null are handled safely", () => {
  // This is the white-screen mechanism from §12.4 of IMPLEMENTATION-LOG.md.
  // loadProject at src/App.tsx:5467 calls `setMockupHistory(p.mockupHistory)`,
  // and a malformed SavedProject without mockupHistory leaves the state at
  // `undefined`. The inline guard this helper replaces would have crashed
  // on `mockupHistory.length`. The helper survives the same input — these
  // tests pin that.

  it("every array undefined (no .length access) → still returns a value (does not throw)", () => {
    // The crucial assertion is that this CALL does not throw. If the
    // helper regressed to direct `.length` access on undefined, this
    // test would throw at runtime and Vitest would surface it as a
    // failure. Pin the return value as well so the semantics is locked.
    expect(() => isEmptySnapshot({
      inputs: null,
      mockupHistory: undefined,
      carouselSlides: undefined,
      batchResults: undefined,
      batchCaptions: undefined,
      batchHookGroups: undefined,
      tovText: undefined,
      conceptsText: undefined,
      buildPlan: undefined,
      captionText: undefined,
    })).not.toThrow();
    expect(isEmptySnapshot({
      inputs: null,
      mockupHistory: undefined,
      carouselSlides: undefined,
      batchResults: undefined,
      batchCaptions: undefined,
      batchHookGroups: undefined,
      tovText: undefined,
      conceptsText: undefined,
      buildPlan: undefined,
      captionText: undefined,
    })).toBe(true);
  });

  it("mockupHistory: undefined alone (the §12.4 crash path) → no throw, treated as empty", () => {
    // The specific case the §12.4 walk flagged: a malformed saved
    // project whose mockupHistory is missing, after loadProject sets
    // state to undefined. The inline guard would have thrown on
    // `.length`. The helper returns true (snapshot is empty → save
    // skipped, not crash, not silent-write).
    expect(() => isEmptySnapshot(blank({ mockupHistory: undefined }))).not.toThrow();
    expect(isEmptySnapshot(blank({ mockupHistory: undefined }))).toBe(true);
  });

  it("carouselSlides: undefined alone → no throw, treated as empty", () => {
    expect(() => isEmptySnapshot(blank({ carouselSlides: undefined }))).not.toThrow();
    expect(isEmptySnapshot(blank({ carouselSlides: undefined }))).toBe(true);
  });

  it("batchResults: undefined alone → no throw, treated as empty", () => {
    expect(() => isEmptySnapshot(blank({ batchResults: undefined }))).not.toThrow();
    expect(isEmptySnapshot(blank({ batchResults: undefined }))).toBe(true);
  });

  it("batchCaptions: undefined alone → no throw, treated as empty", () => {
    expect(() => isEmptySnapshot(blank({ batchCaptions: undefined }))).not.toThrow();
    expect(isEmptySnapshot(blank({ batchCaptions: undefined }))).toBe(true);
  });

  it("batchHookGroups: undefined alone → no throw, treated as empty", () => {
    expect(() => isEmptySnapshot(blank({ batchHookGroups: undefined }))).not.toThrow();
    expect(isEmptySnapshot(blank({ batchHookGroups: undefined }))).toBe(true);
  });

  it("inputs: undefined (not just null) is treated as empty", () => {
    // The type allows `undefined`; a future caller that threads an
    // uninitialised state slot through here must not see the helper
    // treat it as "has inputs".
    expect(isEmptySnapshot(blank({ inputs: undefined }))).toBe(true);
  });

  it("a single array present alongside every other array undefined → non-empty (the field-still-matters check)", () => {
    // The reverse case: a malformed saved project where MOST arrays are
    // missing but ONE survived. The helper must still detect that one
    // array's content and return false. This is the case loadProject
    // does NOT produce today (it writes the entire SavedProject, so
    // all arrays are present-but-possibly-empty or all absent), but
    // a future partial-restore path could.
    expect(isEmptySnapshot({
      inputs: null,
      mockupHistory: [{ url: "x", ratio: "1:1" }],
      carouselSlides: undefined,
      batchResults: undefined,
      batchCaptions: undefined,
      batchHookGroups: undefined,
      tovText: "",
      conceptsText: "",
      buildPlan: "",
      captionText: "",
    })).toBe(false);
  });
});
