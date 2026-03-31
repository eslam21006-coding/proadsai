# Implementation Plan: Resolver Completeness, Resolution Trace & Slide Plans

**Branch**: `001-resolver-completeness-trace` | **Date**: 2026-03-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-resolver-completeness-trace/spec.md`

## Summary

Extend the creative resolver to accept campaign type, ad format, and visual style family as inputs; validate all creative combinations against the approved Launch Surface Registry; reclassify `before_after` from hook angle to creative mode; consolidate offer types from 5 to 3; enforce the visual precedence chain; generate deterministic carousel slide plans; auto-adjust value_stack carousel slide counts; suppress empty value_stack fields; produce and persist a structured resolution trace on every generation run; and remove deleted modes and dead code.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions/backend), TypeScript 5.9 (frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firestore, React 19, Zustand
**Storage**: Firestore — `generations/{genId}.resolutionTrace` field on existing document
**Testing**: Plain Node.js contract fixtures (`functions/src/contractFixtures.test.ts`)
**Target Platform**: Web — Firebase Hosting (frontend) + Cloud Functions (backend)
**Project Type**: SaaS web application (bilingual Arabic-first ad creative generator)
**Performance Goals**: Launch surface validation < 5ms per call (pure function, no I/O). Resolution trace write is fire-and-forget after generation completes.
**Constraints**: Backend imports MUST use `.js` extension (NodeNext). No silent overrides without trace. Server-side guard runs before credit deduction. Shared resolver logic must work in both frontend (bundler) and backend (NodeNext).
**Scale/Scope**: 3 offer types, 9 creative modes (11 original − 3 deleted + 1 before_after added), 3 style families, 7 launch languages, carousel 2–9 slides, 12 retargeting objections, 29 implementation tasks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Evidence |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Removing 3 modes + reclassifying before_after. Reducing launch surface to validated set. |
| II. Selected Mode MUST Be Obeyed | PASS | Resolver is single authority. Visual precedence chain formalized (FR-016). |
| III. Launch Surface Is Frozen | PASS | `validateLaunchSurface()` enforces frozen registry. Offer types consolidated to 3. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Infrastructure for 11 behavior contracts built (validated in Spec D). |
| V. Arabic Quality Is First-Class | PASS | Not directly in scope. Assumption: resolver changes must not regress Arabic output. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Resolution trace is core deliverable — every decision logged. |
| VII. No Silent Override Without Rule, Signal, Trace | PASS | All overrides traced. Visual precedence chain logged per level. |
| VIII. Cost Discipline Is Mandatory | PASS | Server-side guard blocks invalid combos BEFORE credit deduction. |
| IX. Proof Is Required | PASS | Resolution trace enables before/after evidence for every fix. |
| X. Spec Before Code | PASS | Spec complete with 18 FRs, 11 SCs, 9 user stories. |
| XI. Frontend and Backend MUST Agree | PASS | `validateLaunchSurface()` shared between both layers. Server guard as defense-in-depth. |
| XII. Deferred Scope Must Remain Deferred | PASS | Deleted modes are gone permanently. Frontend signals deferred to Spec C. |

## Project Structure

### Documentation (this feature)

```text
specs/001-resolver-completeness-trace/
├── plan.md              # This file
├── spec.md              # Feature specification (18 FRs, 9 user stories)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── validate-launch-surface.md
│   ├── carousel-slide-plan.md
│   ├── value-stack-functions.md
│   └── resolution-trace.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
functions/src/
├── creativeResolver.ts    # PRIMARY: extended with new inputs, launch surface validation,
│                          #   before_after as mode, offer type consolidation, slide plans,
│                          #   value stack functions, visual precedence, resolution trace builder
├── types.ts               # EXTENDED: ResolutionTrace, SlideRole, AutoSwitchEvent,
│                          #   PerSlideTrace, ValueStackAdjustment interfaces
├── index.ts               # EXTENDED: server-side launch surface guard (before credit deduction),
│                          #   resolution trace persistence (after generation)
├── generators.ts          # MODIFIED: remove scattered campaign-type inline checks,
│                          #   consume resolver output for retargeting hookAngle=null
├── step3point5.ts         # DELETED: dead code
├── contractFixtures.test.ts # EXTENDED: new fixtures for resolver functions

src/
├── creativeResolver.ts    # MODIFIED: frontend mirror of resolver changes (Spec B backend-side;
│                          #   Spec C handles UI integration)
├── constants.ts           # MODIFIED: OFFER_TYPES reduced to 3, before_after removed from
│                          #   COLD_HOOK_ANGLES, offer type mapping updated
```

## Complexity Tracking

No constitution violations to justify. All principles pass.

## Key Research Findings

### before_after Reclassification

**Current state:** `before_after` exists ONLY as a hook angle in `src/constants.ts` line 111 (`COLD_HOOK_ANGLES`) and as a conflict key in `HOOK_ANGLE_CREATIVE_CONFLICTS` (blocks 9 of 11 modes). It does NOT exist in `CREATIVE_MODE_CATALOG`.

**Required change:** Add `before_after` to `CREATIVE_MODE_CATALOG` with:
- `tabs: ['mini_course', 'live_events', 'free_guide']` (all 3 tabs)
- `role: 'anchor'`, `standaloneAllowed: true`
- `mustShow: ['before_state', 'after_state', 'transformation_divider']`
- `mustAvoid: ['single_state_only', 'text_labels_before_after']`
- Remove from `COLD_HOOK_ANGLES` array
- Remove from `HOOK_ANGLE_CREATIVE_CONFLICTS` (no longer a hook angle)
- Add to solo-only enforcement in `validateCombination()`

### Offer Type Consolidation

**Current state:** `OFFER_TYPES` has 5 entries. `getTabForOfferType()` maps all 5 → 3 tabs.

**Required change:** Reduce `OFFER_TYPES` to `["Live Event", "Free Guide", "Mini-Course"]`. Update `getTabForOfferType()` mapping. Frontend `OFFER_CATEGORY_MAP` updated to match.

### Resolver Input Extension

**Current state:** `ResolverInput` has `selectedModes`, `hookAngle?`, `offerCategory?`. No campaign type, ad format, or style family.

**Required change:** Add `campaignType?: 'cold' | 'retargeting'`, `adFormat?: 'single' | 'carousel' | 'batch'`, `visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal'` to `ResolverInput`. Default `visualStyleFamily` to `'realistic'` when undefined.

### Server-Side Guard Location

**Current state:** `index.ts` line 108-120 — credit deduction in `runTransaction()`. Auth check before it. No combination validation.

**Required change:** Insert `validateLaunchSurface()` call AFTER auth + credit owner resolution, BEFORE `runTransaction()` credit deduction. On failure: `throw new HttpsError("permission-denied", reason)`.

### Resolution Trace Storage

**Decision:** Field on `generations/{genId}` document, not a sub-collection. Written server-side by Cloud Functions after generation completes (success or failure). Write failure is logged but does not fail the generation.

### Scattered Campaign Type Logic

**Current state:** `generators.ts` has 5+ inline `campaignType` checks (lines 305, 831, 5442, 5692, 5941). These use `(inputs as any).campaignType` or context flags.

**Required change:** Centralize the retargeting `hookAngle = null` rule into `resolveCreativeSpec()`. Remove the inline cast. Other campaign-type references that feed into prompt construction can remain — they're not resolver logic.
