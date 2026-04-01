# Implementation Plan: Frontend Launch Filter, Override Signals & Priority Lane QA

**Branch**: `002-frontend-filter-qa` | **Date**: 2026-04-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-frontend-filter-qa/spec.md`

## Summary

Enforce the launch surface on the frontend by consuming the shared `validateLaunchSurface()` from Spec B, removing deleted modes from UI, reclassifying before_after from hook angle to creative mode grid, consolidating offer types to 3, hiding non-launch languages, adding user-facing override signals for all auto-switch events, and creating 11 canonical QA fixtures for priority lane validation.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions/test fixtures)
**Primary Dependencies**: React 19, Zustand, Tailwind CSS, Firebase Cloud Functions v2 (for fixtures)
**Storage**: N/A (frontend state only; fixtures use existing contract test infrastructure)
**Testing**: Plain Node.js contract fixtures (`functions/src/contractFixtures.test.ts`)
**Target Platform**: Web — Firebase Hosting (frontend)
**Project Type**: SaaS web application (bilingual Arabic-first ad creative generator)
**Performance Goals**: Frontend validation is synchronous (< 1ms). Override signals render within the same React render cycle as the triggering state change.
**Constraints**: Must consume `validateLaunchSurface()` from Spec B (shared pure function). Frontend mirror `src/creativeResolver.ts` must stay in sync with backend. All user-visible text must be bilingual (Arabic/English via `useT()`).
**Scale/Scope**: 9 override signal events, 11 QA fixtures, 3 offer types, 7 launch languages, 10 hook angles, 9 creative modes (after deletions + before_after addition).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Reducing visible surface to launch-approved only |
| II. Selected Mode MUST Be Obeyed | PASS | Frontend mirrors backend resolver — no drift |
| III. Launch Surface Is Frozen | PASS | Frontend filter enforces same registry as backend |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | 11 QA fixtures provide deterministic pass/fail |
| V. Arabic Quality Is First-Class | PASS | Non-launch languages hidden. All signals bilingual. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Override signals make auto-switches visible to user |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | 9 override events each have a defined UI signal |
| VIII. Cost Discipline Is Mandatory | PASS | Frontend blocking prevents wasted server calls |
| IX. Proof Is Required | PASS | Evidence workflow defines 9-item proof pack |
| X. Spec Before Code | PASS | Full spec complete with 12 FRs, 9 user stories |
| XI. Frontend and Backend MUST Agree | PASS | Shared `validateLaunchSurface()` function ensures agreement |
| XII. Deferred Scope Must Remain Deferred | PASS | Deleted modes removed entirely, not hidden |

## Project Structure

### Documentation (this feature)

```text
specs/002-frontend-filter-qa/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── override-signals.md
│   └── qa-fixtures.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
src/
├── components/InputForm.tsx   # PRIMARY: launch filter, mode grid changes, override signals,
│                              #   offer type consolidation, language filtering
├── store.ts                   # EXTENDED: override notification helpers
├── creativeResolver.ts        # MODIFIED: mirror Spec B changes (before_after as mode,
│                              #   deleted modes removed, soloOnly enforcement)
├── constants.ts               # MODIFIED: OFFER_TYPES reduced, before_after removed from
│                              #   COLD_HOOK_ANGLES, AD_LANGUAGES filtered to 7
├── artDirectionConfig.ts      # UNCHANGED (card filtering already works by family)
├── planconfig.ts              # UNCHANGED (plan gating already exists)
├── i18n.tsx                   # EXTENDED: new translation keys for override signals

functions/src/
├── contractFixtures.test.ts   # EXTENDED: 11 priority lane QA fixtures
```

## Key Research Findings

### Override Signal Implementation

**Decision:** Use the existing `showToast()` system for transient signals. For persistent signals (reference ad banner), add a conditional banner component inline in InputForm.

**Current state:** `showToast(msg, type)` exists in store.ts (line 245) with types 'success'|'error'|'info'. InputForm receives `showToast` as a prop (line 19).

**Approach:** 9 override events from LAUNCH_MATRIX Section 7:
1. Reference ad uploaded → persistent banner (stays while reference ad is active)
2. Retargeting selected → section swap (already works — hook section replaced by objection)
3. text_only selected → section collapse (partially exists — line 311 `isTextOnlyActive`)
4. Testimonial + single → toast "Testimonials require carousel" (new)
5. before_after + carousel → inline message "Before/After is single-image only" (handled by `validateLaunchSurface()`)
6. value_stack slide count → inline message "Carousel adjusted to N slides" (new)
7. Testimonial slide count → inline message "Carousel adjusted to N slides" (new, Spec G dependent)
8. Realistic to Minimal → art direction grid hides (card filtering handles this)
9. Realistic to Fantasy → art direction cards reset (card filtering handles this)

**Net new UI work:** 3 new signals (#1 banner, #4 toast, #6 inline). The rest are already handled by existing show/hide logic or by `validateLaunchSurface()` blocking.

### Frontend CreativeResolver Sync

**Decision:** Mirror all Spec B changes in `src/creativeResolver.ts`:
- Add `before_after` to `CREATIVE_MODE_CATALOG` with `soloOnly: true`
- Delete `limited_access`, `module_preview`, `day_strip` from catalog
- Delete their `ALLOWED_PAIRS` entries
- Add `soloOnly` check to `validateCombination()`
- Remove `before_after` from `HOOK_ANGLE_CREATIVE_CONFLICTS`
- Add `'Live Event'` to `getTabForOfferType()` mapping

### QA Fixture Approach

**Decision:** Extend existing `functions/src/contractFixtures.test.ts` with 11 new test functions, one per priority lane. Each fixture calls the resolver with exact inputs and validates the resolution trace output against lane-specific pass/fail rules.

**Structure per fixture:**
```
{
  name: "Lane 1 — Retargeting + Carousel",
  input: { exact AdInputs },
  expectedTrace: { key ResolutionTrace fields },
  checks: [ list of pass/fail assertions ]
}
```

## Complexity Tracking

No constitution violations to justify. All principles pass.
