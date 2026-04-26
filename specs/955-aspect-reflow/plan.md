# Implementation Plan: HOTFIX-F — Deterministic Aspect Ratio Reflow

**Branch**: `955-aspect-reflow` | **Date**: 2026-04-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/955-aspect-reflow/spec.md`

## Summary

Replace the generative-edit reflow path (which stretches the hero on >30 % canvas-shape changes — see `functions/src/generators.ts:5181-5230`) with a **deterministic two-route reflow router**. The router computes a symmetric fold-change between the source and target aspect ratios; `<30 %` routes to **outpaint** (Sharp-based pure margin extension with byte-identical center-70 % preservation), `≥30 %` routes to **rerender-from-plan** (full pipeline re-run on the saved build plan with `aspectRatio` swapped). A user override (Auto / Quick / Fresh) supersedes the router. Both routes emit per-item entries on the source generation's `resolutionTrace.reflowHistory[]`, append `{ url, ratio }` to `mockupHistory`, and respect the existing offer-overlay, Arabic text, and HOTFIX-E logo pipelines without regression. A dedicated `reflowImage` callable (the action is already reserved in `COSTS` and `ACTION_FEATURE_MAP` in `functions/src/index.ts:98,110` but no `onCall` handler exists yet) hosts the router; the old generative-REFLOW prompt path inside `generateFinalAd` is gated off from user-facing reflows.

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**:
- Backend — Firebase Cloud Functions v2 (`firebase-functions ^7.2.2`), Firebase Admin (`firebase-admin ^13.6.1`), Sharp `^0.33.5` (already installed; same engine as `offerOverlay.ts`, `textCompositing.ts`, `logoComposite.ts`), Gemini 3.1 image model (only on rerender; no Gemini calls on outpaint).
- Frontend — React 19, Zustand, Tailwind CSS 3, Vite 7.
**Storage**: Firestore additive only — extends existing `generations/{genId}` document with:
- `mockupHistory: { url, ratio }[]` — append per successful reflow item (already exists; this hotfix appends).
- `resolutionTrace.reflowHistory: ReflowHistoryEntry[]` — new optional array.
No schema migration; legacy records without these fields are reflowable per the FR-015 fallback chain.
**Testing**: Jest (existing `functions/src/contractFixtures.test.ts`, `failureClassification.test.ts`, `__tests__/`). New fixtures land in `contractFixtures.test.ts` per the launch-matrix HFF.6 task description.
**Target Platform**: Firebase Cloud Functions on `europe-west1` (matches `generateCreative`); browser for frontend.
**Project Type**: Web application — `functions/` (backend) + `src/` (frontend) monorepo at repo root.
**Performance Goals** (operational, not user-promise):
- Outpaint: < 3 s wall-clock on a 1024×1024 source (Sharp pure margin extension, no model call).
- Rerender: ≤ 30 s wall-clock per item (matches a fresh single-image generation; see `generateFinalAd` typical latency).
- Carousel/batch reflow: per-item parallelism via `Promise.allSettled`, capped at 5 concurrent to respect Gemini rate limits.
**Constraints**:
- Outpaint MUST operate losslessly on the locked region (FR-008 byte-identical contract; PNG-in / PNG-out for Sharp pipeline).
- The 30 % threshold and 70 % locked-center inset are spec-fixed constants (FR-002, FR-006).
- Reflow output is a variant of the source generation, not a new `generations` doc (FR-029).
- The pre-existing generative-edit REFLOW prompt path in `generators.ts:5181-5230` must be gated off from user-facing reflow (FR-026); it remains in code only as long as no user-facing caller can reach it.
**Scale/Scope**: Single feature, 4 backend files modified or created, 1 frontend file modified, 1 test file extended, no schema migration, no new infrastructure.

## Constitution Check

Re-evaluated against the 12 principles in `.specify/memory/constitution.md` v1.1.0:

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | **PASS** | Replaces an unshippable generative-edit reflow with a deterministic router — fewer surprise outputs, no new options. |
| II. Selected Mode MUST Be Obeyed | **PASS** | When the user picks Quick or Fresh, FR-024 mandates the callable honor it without re-routing. |
| III. Launch Surface Is Frozen | **PASS** | Only six already-supported aspect ratios. No new ratios. No expansion. |
| IV. Behavior Contracts Beat Subjective Judgment | **PASS** | 31 FRs with pass/fail rules; 10 SCs with measurable outcomes. |
| V. Arabic Quality Is First-Class | **PASS** | FR-027 mandates no regression on Arabic compositing on either route. |
| VI. Hidden Machine Layers MUST Be Auditable | **PASS** | FR-025 + new `reflowHistory[]` capture method, route, fallback, override. |
| VII. No Silent Override Without Rule, Signal, and Trace | **PASS** | Auto-router formula is explicit (FR-002), every fallback is logged (FR-014), the user-visible selector signals override (FR-023). |
| VIII. Cost Discipline | **PASS** | FR-017: outpaint costs less, no double-charge on fallback. FR-018/FR-019: zero-charge on no-op or rejected calls. |
| IX. Proof Is Required for Every Claimed Fix | **PASS** | Spec includes 10 SCs and the existing failing case (4:5 → 9:16 face stretch) is the headline anchor in SC-001. |
| X. Spec Before Code | **PASS** | This plan is being written after spec + clarify, before any code change. |
| XI. Frontend and Backend MUST Agree on Truth | **PASS** | `method` parameter validated by both the frontend selector (FR-023/024) and the callable (FR-003). |
| XII. Deferred Scope MUST Remain Deferred | **PASS** | Out-of-scope list excludes Magic Edit, threshold tuning, new ratios, pre-action cost preview. |

**Gate result**: All 12 principles pass. No violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/955-aspect-reflow/
├── plan.md              # This file
├── research.md          # Phase 0 output (engine choice, fold-change derivation, fallback contract)
├── data-model.md        # Phase 1 output (Firestore schema delta, types extension)
├── quickstart.md        # Phase 1 output (manual verification recipe)
├── contracts/
│   ├── reflowImage-callable.md     # Phase 1 output (callable contract)
│   └── reflow-history-trace.md     # Phase 1 output (trace schema delta)
├── checklists/
│   └── requirements.md  # Already populated by /speckit.specify
├── spec.md              # Already populated by /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
functions/                                # Backend — Cloud Functions v2
└── src/
    ├── reflowOutpaint.ts                 # NEW — Sharp-based pure margin extension + byte-identity verification
    ├── reflowRerender.ts                 # NEW — full-pipeline rerender wrapper (loads saved build plan, swaps aspectRatio, re-invokes generateFinalAd)
    ├── reflowRouter.ts                   # NEW — auto-router: symmetric fold-change formula + magnitude threshold + fallback chain
    ├── reflowImage.ts                    # NEW — onCall handler (extracted module, registered from index.ts for testability)
    ├── generators.ts                     # MODIFY — gate off the user-facing generative-edit REFLOW path at lines 5181-5230 (FR-026)
    ├── resolutionTrace.ts                # MODIFY — TraceBuilder: add addReflowHistoryEntry(entry), wire build()
    ├── types.ts                          # MODIFY — add ReflowHistoryEntry, ReflowMethod, ReflowDecision, ReflowOutcome; extend ResolutionTrace
    ├── index.ts                          # MODIFY — register reflowImage onCall (region europe-west1, 2GiB memory, 300s timeout, geminiApiKey + openaiApiKey secrets)
    └── contractFixtures.test.ts          # MODIFY — add HFF fixture suite

src/                                      # Frontend — React 19 + Vite
├── App.tsx                               # MODIFY — Step 4 Resize control: three-radio method selector (Auto / Quick / Fresh); pass method to reflowImage callable; render per-item progress on multi-item reflows; surface per-item error rows on partial failure
└── types.ts                              # MODIFY — mirror backend ReflowMethod / ReflowHistoryEntry types for client-side traceability rendering
```

**Structure Decision**: Existing repository structure (single root with `functions/` + `src/`). No new top-level directories. All backend additions live in `functions/src/` and follow the existing per-feature single-file pattern (cf. `logoComposite.ts`, `offerOverlay.ts`, `textCompositing.ts`).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally empty.
