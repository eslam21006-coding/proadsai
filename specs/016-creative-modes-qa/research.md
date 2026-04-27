# Phase 0 Research: Creative Modes & Art Direction QA

**Date**: 2026-04-27
**Branch**: `016-creative-modes-qa`
**Scope**: Resolve all open implementation questions before Phase 1 design.

All research below was sourced by reading existing code paths in this repository. No external research was required — the spec builds entirely on existing infrastructure.

---

## R1 — `requiredElements` are symbolic identifiers, not prompt vocabulary

**Decision**: FR-009's substring-match detection runs against the **slot-map vocabulary**, not against the raw `requiredElements` strings.

**Why**: Inspection of `functions/src/creativeResolver.ts` lines 67–201 shows that each mode's `validity.requiredElements` array contains symbolic identifiers like `'hero_portrait'`, `'visible_item_rows_or_cards'`, `'price_or_value_display'`. These tokens **never appear verbatim** in the technical prompt that Gemini receives — the prompt is natural-language English (or Arabic) that Gemini interprets visually. A literal substring match for `'visible_item_rows_or_cards'` against the prompt would always return "missing" and trigger reinforcement on every generation, defeating the purpose.

The existing `buildPlanSlotMap()` (called from `contractFixtures.test.ts`) already solves this: it maps natural-language prompt patterns (e.g. `"3-5 offer item cards"`, `"price overlay panel"`, `"stack zone"`) to symbolic slots, then asserts each required slot is filled. The output `slotMap.contractCheck.passed` boolean and `slotMap.missingZones` / `slotMap.missingOverlaySlots` arrays are exactly what FR-009 needs.

**Implementation refinement** (does not contradict Q2 clarification):
- The clarification's "substring match" remains correct as the *underlying detection mechanism*.
- The substring match is performed by `buildPlanSlotMap()` against natural-language slot patterns, not against symbolic `requiredElements` IDs.
- The reinforcement directive (FR-009) appends the *human-readable* slot label that was missing (e.g. "stack zone" or "price reveal") to the prompt, not the symbolic ID.

**Alternatives considered**:
- Adding a parallel `promptKeywords: string[]` field to each mode (one keyword per `requiredElements` entry) — rejected: it would duplicate vocabulary already encoded in `buildPlanSlotMap` and create drift risk.
- LLM-based check ("does this prompt cover X?") — rejected at clarify time (Q2 option C) for cost and non-determinism.

**Source**: `functions/src/creativeResolver.ts` lines 67–201; `functions/src/contractFixtures.test.ts` lines 1–60 (existing fixture pattern using `slotMap.contractCheck.passed`).

---

## R2 — Cultural-compliance pass runs inside `generateBuildPlan`

**Decision**: FR-008 verification asserts on the return value of `generateBuildPlan()` — no re-ordering of pipeline stages required.

**Why**: `culturalCompliance.scanAndReplace()` is invoked **inside** `generators.ts::generateBuildPlan()` at lines 3884, 3902, 3910, 3918, 3926. The function returns a technical prompt that is already post-compliance. FR-008 fixtures (which receive the final prompt as a string and assert composition-override substrings are present) are therefore correctly comparing against the post-compliance prompt without any additional plumbing.

**Adapt-state audit utility**: A separate one-pass utility (`adaptStateAudit.ts`) reads each of the 8 strings in `getSubStyleModeFusion()` lines 1067–1167 and scans them for cultural-compliance trigger words (imported from `culturalCompliance.TRIGGER_WORDS`). The audit runs as part of the fixture suite (or as a standalone build-time script). Failures fail the launch gate and report the offending string + matched trigger word; rewriting the catalog string is **out of scope** for Phase 16 (per spec Out of Scope section — adapt-state catalog is owned by content/product, not by this QA phase).

**Alternatives considered**:
- Bypass cultural compliance for adapt-state strings (Q3 option C) — rejected: expands compliance surface mid-launch, contradicts Principle V (Arabic Quality Is First-Class).
- Verify pre-compliance only (Q3 option B) — rejected: would mask real Arabic-locale defects on art-direction adapt states.

**Source**: `functions/src/generators.ts` lines 3884–3926 (scanAndReplace call sites); `functions/src/creativeResolver.ts` lines 1067–1167 (getSubStyleModeFusion fusion strings); `functions/src/culturalCompliance.ts` (TRIGGER_WORDS export).

---

## R3 — Pair-render-execution audit needed for 3 of 10 approved pairs

**Decision**: Task T005 (audit `getPairRenderExecution`) explicitly verifies all 10 approved pairs return non-empty execution guidance, with fallbacks added where currently absent.

**Why**: `functions/src/generators.ts::getPairRenderExecution()` (lines 767–867) explicitly handles 7 single modes / pairs. Among the 10 approved pairs from launch matrix § 2.3, the pairs that currently fall through to per-mode appends without explicit pair-level composition guidance (likely candidates: `event_ticket+speaker_card`, `webinar_screen+speaker_card`, `standard_hero+device_mockup`) must be enumerated and given pair-level handling. The fixture suite (FR-002, exercised by T009) will fail on any pair that falls through unless `getPairRenderExecution` is extended.

**Implementation refinement**: Task T005 in `tasks.md` will explicitly enumerate which pairs need new guidance. Each new pair-level block follows the existing pattern from the `value_stack` block at lines 774+.

**Alternatives considered**:
- Trust the per-mode appends to provide sufficient coverage — rejected: per-mode appends do not specify how the two modes interact (zone proportions, ordering, framing). Phase 16 fixtures explicitly assert pair composition language, which requires pair-level handling.

**Source**: `functions/src/generators.ts` lines 767–867; `functions/src/creativeResolver.ts` ALLOWED_PAIRS constant at lines 212–225.

---

## R4 — Adapt states already encoded in `getSubStyleModeFusion`

**Decision**: FR-008 fixtures assert the existing `getSubStyleModeFusion(subStyle, mode)` output string appears in the final post-compliance prompt. No new catalog needed.

**Why**: `functions/src/creativeResolver.ts::getSubStyleModeFusion()` lines 1067–1167 encodes all 8 explicit adapt-state pairs from § 11 of `LAUNCH_MATRIX.md`, keyed `${subStyle}__${mode}`, returning composition-override prompt strings. The function is called from `generators.ts` line 3000 and the result is injected into the build plan prompt before render. The 8 fixtures simply construct the (subStyle, mode) inputs and assert the documented override string appears in the resulting build plan's technical prompt.

**Source**: `functions/src/creativeResolver.ts` lines 1067–1167; `functions/src/generators.ts` line 3000.

---

## R5 — Node's built-in test runner is the canonical framework

**Decision**: New fixtures use `node:assert/strict` and follow the existing pattern in `functions/src/contractFixtures.test.ts`.

**Why**: `functions/package.json` line 12 defines `"test": "npm run build && node lib/__tests__/savedProjects.projectStatus.test.js && node lib/__tests__/savedProjects.projectQuota.test.js && node lib/__tests__/culturalCompliance.test.js && node lib/contractFixtures.test.js"`. There is no vitest, no jest, no mocha. The existing 81 fixtures in `contractFixtures.test.ts` are simple `function testXxx() { … }` declarations that use `assert.equal`, `assert.deepEqual`, and `assert.ok` from `node:assert/strict`, called from a top-level driver that catches and reports failures via `console.log` and `process.exit(1)`.

**Implementation refinement**: Phase 16 adds 43 new test functions in the same file or in a sibling file (`contractFixtures.modes.test.ts`) imported by the existing driver. The new file is compiled to `lib/contractFixtures.modes.test.js` and added to the `test` script in `package.json`.

**Alternatives considered**:
- Migrate to vitest — rejected: out of scope, and the existing pattern works.
- Put new fixtures in `__tests__/` subdirectory — rejected: existing 81 fixtures live in `contractFixtures.test.ts` at the root of `functions/src/`; matching the established location.

**Source**: `functions/package.json` line 12; `functions/src/contractFixtures.test.ts` (full file pattern).

---

## R6 — Single-source-of-truth validator pattern is already established

**Decision**: New `validateModeFormatCombination()` is co-located with existing `validateLaunchSurface()` in `functions/src/creativeResolver.ts` and imported directly by `src/components/InputForm.tsx`.

**Why**: The project already imports backend validators from `functions/src/creativeResolver.ts` into the frontend `src/components/InputForm.tsx` — `validateLaunchSurface` is the existing precedent. The Vite build pipeline tolerates this cross-tree import (TypeScript path resolution in `tsconfig.json`). No `creativeResolverShared.ts` shim is needed; the same file serves both layers, which is exactly what Principle XI ("Frontend and Backend MUST Agree on Truth") wants.

**Server-side rejection** (Q1) lives at the entry point of any callable that produces a generation: `functions/src/index.ts::generateAd` (and equivalents for batch/carousel). The handler imports `validateModeFormatCombination` and rejects with the same `reason` string that the client surfaced inline. This mirrors the existing `validateLaunchSurface` rejection pattern.

**Source**: `src/components/InputForm.tsx` (imports from `../../functions/src/creativeResolver`); `functions/src/creativeResolver.ts` line 723 (existing `validateLaunchSurface` export).

---

## R7 — Resolution-trace extension is purely additive

**Decision**: Add two optional fields to `ResolutionTrace` in `functions/src/types.ts`: `modeComposition?: ModeCompositionTrace` and `adaptStateAudit?: AdaptStateAuditResult`. No Firestore migration; legacy reads ignore unknown fields.

**Why**: `functions/src/types.ts` lines 218–253 defines `ResolutionTrace`. The shape is persisted as a sub-field on `generations/{genId}` documents. Adding optional fields keeps backwards compatibility with all existing reads (frontend, saved-project loader, debug surfaces). The writer (`functions/src/resolutionTrace.ts`) gets two new methods: `recordModeCompositionMissing(mode, missingElements)` and `recordAdaptStateAudit(results)`.

**Source**: `functions/src/types.ts` lines 218–253; `functions/src/resolutionTrace.ts` (TraceBuilder pattern).

---

## Summary

All 7 research items resolved. No `NEEDS CLARIFICATION` markers remain. The plan can proceed to Phase 1 design and `/speckit.tasks`.
