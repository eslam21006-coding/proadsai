# Implementation Plan: Universe-Aware Copy

**Branch**: `963-universe-aware-copy` | **Date**: 2026-06-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/963-universe-aware-copy/spec.md`

## Summary

When the resolved style family is **fantasy**, the copy-generation prompt conditionally swaps its strict anti-metaphor `METAPHOR RULE` for a *relaxed* variant that permits one subtle, evocative universe-echoing word/phrase, and the build-plan/blueprint prompt gains a paired instruction to describe a matching visual element so the rendered image stays coherent. For **realistic** and **minimal** (and any unrecognized family), the existing strict rule is emitted unchanged. The metaphor is suppressed entirely when a reference ad is present, in text-only mode, and on carousel slides 2+. Every generation records an additive, prompt-level `universeAwareCopy` resolution-trace sub-object (`applied` / `styleFamily` / `reason`).

**Technical approach** (mirrors Phase 19 gaze & Phase 28 expression exactly): a new pure, side-effect-free mapper module `functions/src/universeCopyMap.ts` owns (a) the decision function that returns `{ applied, styleFamily, reason }` from existing inputs, (b) the relaxed-fantasy copy block text, and (c) the blueprint visual-coherence instruction. The two existing `METAPHOR RULE` sites in `generateTOV()` choose strict-vs-relaxed via this mapper; `generateConcepts()`/`generateBuildPlan()` inject the visual-coherence instruction; `generateFinalAd()` writes the trace next to the existing `expressionAdaptation`/`gazeDirection` writes. Fully reversible: the strict text is retained (commented), and forcing the mapper to "strict for all" restores byte-identical pre-Phase-27 output.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions) — no frontend change
**Primary Dependencies**: Firebase Cloud Functions v2; Gemini (copy/concept generation, unchanged); OpenAI gpt-image-2 (visuals, untouched). No new dependency.
**Storage**: Firestore `generations/{genId}.resolutionTrace` — additive optional `universeAwareCopy` sub-object only; NO migration.
**Testing**: Existing functions test harness — pure `assert()` shell compiled by `tsc` to `lib/` and run with `node lib/__tests__/<name>.test.js` (see `gazeMap.test.ts`, `expressionMap.test.ts`). New file `functions/src/__tests__/universeCopyMap.test.ts`.
**Target Platform**: Firebase Cloud Functions (Node) backend.
**Project Type**: Web SaaS (React frontend + Firebase Functions backend) — this feature is backend-only.
**Performance Goals**: No added model calls; zero added latency (prompt-text swap only). No new generation passes (advisory cap, per clarification).
**Constraints**: No new callable; no callable-signature change; no Firestore migration; no pricing/plan-gating change; no edit to gaze (Phase 19) / expression (Phase 28) blocks; no edit to `buildFinalImagePrompt` structure; no change to `validateCopyFidelity`. Arabic-first quality rules preserved.
**Scale/Scope**: ~500 fantasy + ~500 realistic catalog universes + minimal family + custom universes. One mapper module, two conditional copy-block sites, one blueprint instruction injection, one trace field + write, one test file.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| II. Selected Mode MUST Be Obeyed | ✅ PASS | Style family is the controller; fantasy→relaxed, realistic/minimal→strict. No silent drift; unrecognized family defaults to literal (safe). |
| III. Launch Surface Frozen / Authoritative | ✅ PASS | Founder's confirmed Phase 27 decisions are authoritative; the older launch-matrix "subheadline/benefit only" note is superseded and documented in spec Assumptions. |
| IV. Behavior Contracts Beat Judgment | ✅ PASS | `contracts/universe-copy-decision.md` defines the full strict/relaxed/suppression decision table with pass/fail rules. |
| V. Arabic Quality First-Class | ✅ PASS | NFR-005: relaxed block preserves no-leading-و, self-contained phrasing, cultural-compliance guardrails; relaxed block carries an explicit Arabic-quality reminder. |
| VI. Hidden Machine Layers Auditable | ✅ PASS | Additive `universeAwareCopy` trace on every generation records the decision + reason. |
| VII. No Silent Override Without Rule, Signal, Trace | ✅ PASS | Suppression (reference-ad / text-only / non-hook slide) is rule-defined and trace-recorded. No user-facing signal needed (no visible behavior removal — copy still generates). |
| VIII. Cost Discipline | ✅ PASS | Zero added model calls / retries / passes. |
| IX. Proof Required | ✅ PASS | Test file asserts strict-vs-relaxed emission + trace shape + decision table; reversibility test included. |
| X. Spec Before Code | ✅ PASS | Spec + clarifications complete and committed before this plan. |
| XI. Frontend/Backend Agree | ✅ PASS (n/a) | Backend-only; no launch-state surface change. |

**Result**: No violations. Complexity Tracking table not required.

## Project Structure

### Documentation (this feature)

```text
specs/963-universe-aware-copy/
├── plan.md              # This file
├── spec.md              # Feature spec (+ Clarifications)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (trace entity + mapper types)
├── quickstart.md        # Phase 1 output (how to verify locally)
├── contracts/
│   └── universe-copy-decision.md   # Decision-table behavior contract
├── checklists/
│   └── requirements.md  # Spec quality checklist (from /specify)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── universeCopyMap.ts                     # NEW — pure mapper: decision fn + relaxed copy block + blueprint visual block
├── generators.ts                          # EDIT — 2 copy-rule sites + 2 blueprint injections + 1 trace write
│   ├── generateTOV()        ~L1701        #   L1899-1915 strict block → strict|relaxed via mapper (mode 'initial')
│   │                                       #   L2020 inline strict line → strict|relaxed via mapper (mode 'refresh')
│   ├── generateConcepts()   ~L2928        #   inject blueprint visual-coherence instruction (fantasy + not suppressed)
│   ├── generateBuildPlan()  ~L4370        #   inject blueprint visual-coherence instruction (fantasy + not suppressed)
│   └── generateFinalAd()    ~L5600+       #   write universeAwareCopy trace next to expressionAdaptation/gazeDirection
├── types.ts                               # EDIT — add ResolutionTrace.universeAwareCopy? (after gazeDirection? ~L443)
└── __tests__/
    └── universeCopyMap.test.ts            # NEW — Contracts A–E, follows gazeMap/expressionMap shell
```

**Structure Decision**: Single new pure module + targeted edits to the existing `generators.ts` copy/blueprint/trace path. No new directories, no parallel generation path (FR-011). The mapper isolates all decision logic so the `generators.ts` edits stay minimal and the feature is reversible by neutralizing the mapper.

## Key Design Decisions

1. **Pure mapper module (`universeCopyMap.ts`)** — mirrors `gazeMap.ts`/`expressionMap.ts`: side-effect-free, no Gemini calls, unit-testable in isolation. Exports (names indicative, finalized in tasks):
   - `resolveUniverseCopyDecision(args): { applied: boolean; styleFamily: 'fantasy'|'realistic'|'minimal'; reason: string }` — the single decision function. Inputs: resolved style family, `referenceAdPresent`, `isTextOnly`, `isCarouselNonHookSlide`. Returns the canonical `reason` per the decision table.
   - `buildFantasyMetaphorCopyBlock(resolvedUniverse, customUniverseDetails?)` — the RELAXED rule text (permits one subtle metaphor; carries Arabic-quality + subtlety + "stands on its own" guardrails).
   - `STRICT_METAPHOR_BLOCK` / `buildStrictMetaphorBlock(...)` — the EXISTING strict text, lifted verbatim so both sites share one source of truth.
   - `buildBlueprintMetaphorVisualBlock(resolvedUniverse)` — the blueprint instruction: "if the copy uses a universe metaphor, describe one matching visual element so the image renders it coherently."

2. **`applied` is prompt-level, not output-verified** (clarification): the trace shape is exactly `{ applied, styleFamily, reason }` — NO `metaphorContent`/`visualElementSuggestion` fields (we do not inspect output). `applied: true` ⇔ the relaxed block was emitted.

3. **`styleFamily` always populated** (clarification / FR-013a): never null, even on suppression. A suppressed fantasy run is `{ applied: false, styleFamily: 'fantasy', reason: 'reference-ad-override' }`.

4. **Suppression precedence** (decision table order): reference-ad → text-only → carousel-non-hook-slide → style-family literal (realistic/minimal/unknown) → fantasy-active. First match wins. This makes reference-ad+fantasy+carousel resolve to `reference-ad-override` (spec edge case).

5. **Advisory cap, no new pass** (clarification / FR-004): subtlety is enforced only by prompt wording. No post-generation validator; `validateCopyFidelity` untouched (FR-015).

6. **Reversibility** (FR-016): strict text retained (commented at original sites pointing to the mapper constant); setting the mapper to return strict-for-all + `applied:false` restores byte-identical pre-Phase-27 prompts.

## Carousel nuance (flagged for tasks)

Copy (hook/subhead/CTA/benefit) is generated for the hook slide; the metaphor's visual coherence matters at **build-plan/blueprint time per slide**. The `isCarouselNonHookSlide` signal is derived from the existing carousel slide index (`carouselSlideIndex === 0` = hook slide; `> 0` = suppress). Tasks must confirm the exact slide-index variable available at each blueprint injection site and ensure slides 2+ both (a) skip the visual-coherence instruction and (b) record `reason: 'carousel-non-hook-slide'`. Non-carousel single/batch generations always pass `isCarouselNonHookSlide=false` (batch needs no special logic — FR-010).

## Complexity Tracking

No constitution violations — table intentionally omitted.
