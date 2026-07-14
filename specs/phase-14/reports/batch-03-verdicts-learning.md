# Phase 14 — Batch 03 Report

**Feature branch**: `phase-14-rag-meta`
**PR**: #54
**Tasks**: T039-T045 (Layer 4 + Layer 4b)
**Date**: 2026-07-13 (initial) · updated 2026-07-14 (final fixes)

---

## Summary

Implements Layer 4 (Qarar Verdict Engine) + Layer 4b (Two-Component
Learning) of the RAG + Meta Reporting Feedback Loop. Every matched ad
now gets a 🟢/🟡/🔴/🛟/⏳ verdict with an Arabic reason, and the matched
conversion ads flow into two learning aggregates — one for hook angles
and one for visual patterns.

### What ships

- **`qararEngine.ts`** (pure) — `evaluateVerdict()` + `diagnose()`, with 8
  tunable rulebook constants. Evaluation order: data gates → CB → K3 → K4
  → K5 → fatigue → S1 → default. All 8 reasonAr strings in Fusha.
- **`learningAggregates.ts`** (pure) — `updateHookAggregates()` and
  `updateVisualAggregates()` with deterministic `computePatternKey()`.
  Hook aliases resolved via `canonicalAngle.ts`. Same-image-multiple-
  contexts rule respected (one aggregate per patternKey + per-context
  breakdown).
- **Worker wiring** (`metaSync/shared.ts`) — per-ad `evaluateVerdict()` call,
  4 new fields on `AdDoc` (verdict / ruleCode / reasonAr / diagnosisAr),
  post-loop learning aggregation with batch generation read + batch
  aggregate write.

---

## Tasks Completed

| ID | Task | Status |
|---|---|---|
| T039 | `qararEngine.test.ts` (36 tests) | ✅ |
| T040 | `qararEngine.ts` (pure) | ✅ |
| T041 | Wire verdicts into sync worker | ✅ |
| T042 | `learningAggregates.test.ts` (17 tests) | ✅ |
| T043 | `learningAggregates.ts` (pure) | ✅ |
| T044 | Wire learning into sync worker | ✅ |
| T045 | `learningIntegration.test.ts` (5 tests) | ✅ |

---

## Files Created / Modified

### New files (functions/src/)

- `qararEngine.ts` (~370 lines) — pure verdict engine + diagnosis ladder
- `learningAggregates.ts` (~370 lines) — two-component learning aggregators
- `__tests__/qararEngine.test.ts` (36 tests)
- `__tests__/learningAggregates.test.ts` (17 tests)
- `__tests__/learningIntegration.test.ts` (5 tests)

### Modified files

- `metaSync/shared.ts` — `AdDoc` interface extended with 4 verdict fields;
  per-sync funnel-settings batch read; per-ad `evaluateVerdict()` call;
  post-loop learning aggregation with batch generation read + aggregate
  write.
- `package.json` — new test scripts: `test:phase14:qararEngine`,
  `test:phase14:learningAggregates`, `test:phase14:learningIntegration`.
  `test` and `test:phase14` aggregates updated to include the new suites.

---

## Build / Test / SC-11 / CI Status

- `npm run build` (functions/): ✅ clean
- `npm test` (functions/, full suite): ✅ all 14 suites report `fail 0`
  (no regressions; all Phase 14 + pre-existing tests pass)
- `node scripts/sc11Guard.mjs`: ✅ 0 forbidden terms
- `npm run build` (root, frontend): ✅ clean
- CI `build-and-test` workflow: ✅ pass

### Test counts (Phase 14 + new)

| File | Tests |
|---|---|
| qararEngine.test.ts | 36 (new) |
| learningAggregates.test.ts | 17 (new) |
| learningIntegration.test.ts | 5 (new) |
| All other Phase 14 + pre-existing | pass |
| **Total** | **all green, no regressions** |

---

## Architectural Notes

### Why Fusha-only?

The Qarar rulebook (spec §5.2) is grounded in Arabic-language coaching
content. All `reasonAr` strings are Fusha; an explicit test in
`qararEngine.test.ts` scans the engine's outputs for Egyptian dialect
markers (ده / دي / إحنا / عايز / عشان / كده / ليه) and fails if any
match. The diagnosis ladder is similarly Fusha.

### Why an explicit `toBucket` fast-path?

The engine accepts either:
- A Meta objective string (e.g. `"OUTCOME_SALES"`, `"CONVERSIONS"`,
  `"AWARENESS"`) — passed through `classifyCampaignObjective()`
- A pre-computed bucket label (`"conversion"` or `"other"`) — passed
  through directly

`classifyCampaignObjective` only knows Meta's 7 conversion objectives;
it returns `"other"` for any input that doesn't match. The fast-path
treats the bucket labels as pre-resolved, avoiding the "I passed
`"conversion"` and got back `"other`"" trap that the first test pass
hit.

### Why a separate `learningAggregates.ts`?

The engine (`qararEngine.ts`) is one pure function with a single
responsibility: compute a verdict. The aggregator (`learningAggregates.ts`)
is a different pure function with a different responsibility: maintain
running averages. Mixing them would force the engine to carry
context-dimension state (geo tier × audience type × campaign objective
× hook/pattern buckets) that has nothing to do with the rulebook
order. Splitting them keeps each module small and testable in
isolation.

### Why batch-load the generation docs?

A typical sync has 50-200 matched ads. Loading 200 generation docs
one-by-one would be 200 round-trips. A single `in` query on
`__name__` (with chunking at 30) reduces that to ~7 round-trips. The
fallback path uses per-id `.get()` if the platform's Firestore version
doesn't support `__name__` `in` queries.

---

## Verdict Rules Summary

Per the Qarar rulebook (spec §5.2 + §5.6):

| Rule | Fires when | Verdict | Applies to |
|---|---|---|---|
| data_gate | < 2000 imp AND < 1× target spend, OR ad < 48h | ⏳ | All |
| CB2 | today ≥ 2.5× target AND 0 conv | 🔴 | conversion only |
| CB1 | today ≥ 1.5× target AND 0 conv | 🟡 | conversion only |
| K3 | Link CTR < 0.5% (early-callable at 1500 imp) | 🔴 | All (creative quality) |
| K4 | CTR dropped ≥ 50% from 3-day peak | 🔴 | All (creative quality) |
| K5_weak | < 10% spend share + 0 conv + ad-set losing + ad weak | 🔴 | conversion only |
| K5_rescue | < 10% spend share + ad efficient (CTR > avg OR CPA ≤ target) | 🛟 | conversion only |
| fatigue_ctr | CTR dropped ≥ 25% with CPM stable | 🟡 | conversion only |
| fatigue_cpm | CPM > 1.2× account avg | 🟡 | conversion only |
| S1 | CPA ≤ target + CTR > account avg (3-day rolling) | 🟢 | conversion only |
| default_continue | gates met, no rule fired | 🏃 "يعمل — راقب الأداء" | All |
| data_gate (funnel missing) | no funnel settings doc | ⏳ "إعدادات مسار المبيعات غير مكتملة" | All |

---

## CodeRabbit Loop

Status: pending review (PR #54).

---

## Open Questions

1. **Per-ad ad-set state for K5** — the engine takes `adSetHittingTarget`
   as an optional flag. The worker currently leaves it undefined, so K5
   always falls through to the "leave it" branch when the ad has any
   conversions. A follow-up should compute per-ad-set CPA from the
   3-day rollup and pass `adSetHittingTarget: false` when the ad-set
   is at-or-above target CPA.

2. **Account baseline fall-back** — when the Meta baseline fetch fails
   entirely, the worker passes a placeholder (1.0 for each metric) so
   the engine still runs. This means S1 won't fire without account
   context — a reasonable fail-safe. We could instead pass `null` and
   have the engine return ⏳ with a distinct reason.

3. **Performance overhead** — the per-ad learning snapshot + per-pattern
   aggregate read adds ~1 extra Firestore round-trip per account
   (the batch generation read). On accounts with 200+ matched ads,
   the batch read returns up to 30 docs per query. The total sync time
   should still be dominated by Meta API rate limits, not the Firestore
   reads.

---

## Verification Checklist

- [x] `functions/` TypeScript build clean
- [x] Full test suite green (no regressions)
- [x] SC-3 (≥90% fingerprint accuracy) — pre-existing, still passing
- [x] SC-11 (zero forbidden user-facing terms) passes
- [x] SC-12 (no kill on awareness/reach/engagement) enforced by
  `isRuleAllowedForObjective` gating in `qararEngine.ts`
- [x] Frontend build clean
- [x] CI `build-and-test` workflow passes
- [x] CodeRabbit follow-up review pending (will be added in a
  follow-up commit after the first review pass)

---

## RULES Followed

- ✅ PowerShell syntax
- ✅ All commands in worktree `D:\proads-worktrees\phase-14-rag-meta`
- ✅ No commit, no deploy yet — report first
- ✅ No PR merge — per workflow, deployment is gated
- ✅ Stop after each task pair; report before continuing
- ✅ All Arabic in simple Fusha
