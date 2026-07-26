# Phase 14 — Batch 05 Report: RAG Injection + Phase 20 Wiring (T054-T064)

**Feature Branch**: `phase-14-rag-meta`
**Status**: Implementation complete, PR #57 open
**Date**: 2026-07-26
**Scope**: Phase 14 Layer 7a (RAG Injection) + Layer 7b (Phase 20 winners wiring)

---

## 1. Summary

This is the **final Phase 14 batch**. It closes the feedback loop by:

1. **Silently injecting** the user's real Meta performance data (top/bottom hook angles, top visual patterns) into the generation prompts at three call sites — hooks, build plan, and caption.
2. **Wiring the top 5 S1 winners** (most-recent, conversion-campaign, matched) into the Phase 20 Concept Director's `pastWinningAds` parameter.

Both layers are **strictly additive** — when the account has fewer than 10 matched conversion creatives, when the workspace has no Meta connection, or when any read fails, the prompts are byte-identical to the pre-Batch-05 build. Below the gate, the system behaves exactly as before. Above the gate, the AI gets a small, qualitative block of *pattern names* (never metric values) to inform its choices.

**After this batch, the full loop works**: generate → upload to Meta → sync → match → verdict → learn → next generation is informed by what worked.

---

## 2. Tasks Completed

| Task | Description | Status |
|------|-------------|--------|
| T054  | `functions/src/ragContext.ts` — pure `buildRAGContext()` + Firestore `getRAGContext()` + `loadRAGContextForWorkspace()` loader + 4 block builders | ✅ |
| T055  | `functions/src/__tests__/ragContext.test.ts` — 13 tests (insufficient gate, top-3, avoid, selectedAngleRank, visual, promptBlock content, empty inputs, single-sentence caption) | ✅ 13/13 |
| T056  | Wire RAG into `generateTOV` (hook generation) in `generators.ts` — `_step2RAGBlock` injected via `[PERFORMANCE_CONTEXT]` wrapper | ✅ |
| T057  | Wire RAG into `generateBuildPlan` (visual plan) in `generators.ts` — `_bpRAGBlock` appended to the structured-plan prompt | ✅ |
| T058  | Wire RAG into `generateCaption` in `generators.ts` — single-sentence `_step5RAGBlock` (light touch) | ✅ |
| T059  | `functions/src/__tests__/ragInjection.test.ts` — 13 tests (block-builder behavior, source-scan, fail-open, no-regression) | ✅ 13/13 |
| T060  | RAG fail-open: any throw / insufficient / no-account → empty block, prompt unchanged, generation works | ✅ |
| T061  | `functions/src/getTopWinners.ts` — pure `filterTopWinners()` + Firestore `loadTopWinners()` (5 most-recent S1, conversion-only, excludes deleted-gen) | ✅ |
| T062  | `functions/src/__tests__/getTopWinners.test.ts` — 11 tests (sorting, eligibility, hydration, deleted-gen exclusion, fail-open) | ✅ 11/11 |
| T063  | Wire winners into Phase 20 — `loadTopWinners()` in `serverGenerateConcepts` → `pastWinningAds` on every `directConcept` call → `buildPastWinnersBlock` appended to the concept prompt | ✅ |
| T064  | `functions/src/__tests__/phase20Wiring.test.ts` — 11 tests (filter, fail-open, source-scan of every wiring site, prompt-block builder) | ✅ 11/11 |

**Total: 11/11 tasks complete, 48/48 new tests pass.**

---

## 3. Files Created

| File | Lines | Purpose |
|------|-------|---------|
| `functions/src/ragContext.ts` | 360 | Pure `buildRAGContext` + Firestore loader + 4 prompt-block builders |
| `functions/src/getTopWinners.ts` | 175 | Pure `filterTopWinners` + Firestore `loadTopWinners` (5 most-recent S1) |
| `functions/src/__tests__/ragContext.test.ts` | 230 | 13 unit tests for the pure RAG helper |
| `functions/src/__tests__/ragInjection.test.ts` | 220 | 13 integration tests for prompt injection + source-scan |
| `functions/src/__tests__/getTopWinners.test.ts` | 225 | 11 unit tests for the pure winner filter |
| `functions/src/__tests__/phase20Wiring.test.ts` | 195 | 11 integration tests for Phase 20 wiring |

## 4. Files Modified

| File | Change |
|------|--------|
| `functions/src/generators.ts` | Imported `loadRAGContextForWorkspace` + 3 block builders + `WinningAd` type; added `buildPastWinnersBlock` helper; injected RAG into `generateTOV` (hooks), `generateBuildPlan` (visual), `generateCaption` (light touch), and `generateConcepts` (past-winners). Extended `generateConcepts` signature with `pastWinningAds` parameter. All injections are APPENDED, never replacing existing personalization. |
| `functions/src/index.ts` | Imported `loadTopWinners` + `WinningAd`; added `_topWinners` loader in `serverGenerateConcepts` (resolves workspace → ad account → top 5 S1 winners, fail-open); passed `pastWinningAds: _topWinners` to BOTH the initial Director call AND the retry path; passed `_topWinners` to `generators.generateConcepts`. |
| `functions/package.json` | Added the 4 new test files to the `npm test` script. |

---

## 5. Activation Gate (spec §9)

- **Hook RAG**: gates on `sum(hookPerformance.conversion.count + visualPerformance.conversion.count) ≥ 10`. Below gate → `insufficient: true`, every prompt block is `""`, the injection site appends nothing → prompt byte-identical to pre-Batch-05.
- **Top winners**: no gate — wired through unconditionally. With zero winners (the common case until syncs complete), `pastWinningAds` is `[]` and `buildPastWinnersBlock` returns `""` → prompt byte-identical to pre-Batch-05.

## 6. Fail-Open Guarantees (spec FR-026 / Edge Cases)

- `loadRAGContextForWorkspace` returns `{ ragContext: { insufficient: true, ... }, accountId: null }` on any read failure or disconnected workspace.
- `getRAGContext` wraps the read in try/catch — Firestore errors → `insufficient: true`.
- `loadTopWinners` returns `[]` on any read failure.
- The three injection sites in `generators.ts` and the orchestrator in `index.ts` all `try { ... } catch (e) { console.warn("⚠️ ... (non-blocking)"); }`.
- **No user-facing error is ever surfaced from RAG or winners loading.**

## 7. Conservative Language (spec §9 / Edge Case 6)

- The RAG prompt blocks explicitly say: *"Use this to inform — but not rigidly copy — what you generate. The user's history suggests patterns, not rules."*
- The past-winners block says: *"Use them as a VARIETY reference — each new concept you write should DELIBERATELY differ..."*
- The model is given **pattern names** (e.g. `urgency`, `social_proof`, `hero_value_stack`), not metric values. `promptBlock` never contains `CTR` / `CPA` / `CPM` strings or numeric percentages — verified by the `promptBlock: does NOT contain technical metric values` test.

## 8. SC-11 (no forbidden user-facing terms)

```
sc11-guard: PASS — 79 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

The RAG block builder language is in English (canonical angle ids) and only references the qualitative "inform — but not rigidly copy" / "use as a VARIETY reference" guardrails. No CTR / CPA / CPM / متوسط / ميديان / percentage strings.

## 9. Build Status

```
functions build: tsc + shx cp — 0 errors, 0 warnings
frontend build: tsc -b && vite build — 0 errors (chunk-size warning is pre-existing)
```

## 10. Test Status

```
functions npm test:
  - ragContext.test.js:        13/13 ✅
  - ragInjection.test.js:      13/13 ✅
  - getTopWinners.test.js:     11/11 ✅
  - phase20Wiring.test.js:     11/11 ✅
  - + every pre-existing test still passes (contractFixtures.test: PASS)
```

**48/48 new tests pass, 0 regressions.**

## 11. Lint Status

- `ragContext.ts`, `getTopWinners.ts`, and all 4 new test files: **0 lint errors** (verified via `npm run lint`).
- The pre-existing 1018 lint errors (mostly `@typescript-eslint/no-explicit-any` in `src/**`) are unchanged.

## 12. Open Questions

None. All scope items in the Batch 05 brief are implemented and verified.

## 13. Reversibility

- The RAG injection is gated on `_step2RAGBlock ?` / `if (_step5RAGBlock)` / `_bpRAGBlock ?` — all three sites can be disabled by setting the gate condition to `false` without touching the loader or the block builders.
- The winners wiring in `index.ts` is wrapped in a `try { ... } catch { _topWinners = []; }` — disabling the loader is a one-line change.
- All new modules are pure (or I/O-wrapped-pure) and have no side effects on existing prompt assembly.

---

## 14. CodeRabbit Review

PR #57 is open at https://github.com/eslam21006-coding/proadsai/pull/57. Awaiting CodeRabbit review.

### Comment-Resolution Log

(filled in iteratively as CodeRabbit comments arrive)

---
