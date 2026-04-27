# Implementation Plan: Brand Colors — End-to-End Consistency

**Branch**: `956-brand-colors` | **Date**: 2026-04-26 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/956-brand-colors/spec.md`

## Summary

Brand colors are already captured per workspace and per audience avatar and already injected into the **single-image** generation prompt with an anti-placeholder guard (see `functions/src/generators.ts:1089, 2146, 3522, 5146`). They drop out of the pipeline in five places that the user can see: (1) carousel slides 2..N, (2) batch items 2..N, (3) retargeting follow-ups linked to a cold ad, (4) the post-render text compositor that paints CTAs and headlines (`functions/src/textCompositing.ts:142, 344` — does not currently read brand colors at all), and (5) post-render verification that the rendered pixels actually contain the brand color.

This plan closes those gaps without a schema migration. A new shared resolver (`brandColorResolver.ts`) computes the active `BrandColorPair` (primary + secondary + auto-contrasted CTA text color + source label) using independent precedence per slot (form > avatar > inherited cold-ad > workspace) and is called from every prompt-build site in `generators.ts` (single, carousel slide loop, batch loop, retargeting flow, magic edit flow, remix flow). Two carousel/batch instruction blocks are extracted into `brandPromptBlocks.ts` (`buildCarouselBrandConsistencyBlock`, `buildBatchBrandConsistencyBlock`) so generators.ts and the test suite share one source of truth. The text compositor (`textCompositing.ts`) takes a single optional final argument `brand?: BrandColorPair` on both `compositeArabicText()` and `compositeFullAdText()`; the override decisions are funnelled through three exported helpers (`pickHeadlineColor`, `pickCtaBgColor`, `pickCtaTextColor`) so the compositor and tests share one decision path; CTA text auto-contrasts via WCAG-luminance against the resolved CTA bg. A new `brandColorCompliance.ts` module performs per-asset color extraction (Sharp 32×32 resize → 5-cluster k-means with deterministic pixel-index seeding → CIEDE2000 < 15 against the brand primary, with a per-pixel fallback for small accents that get absorbed into a centroid) and returns a `BrandColorComplianceEntry`; `creativeScoringEngine.ts` exposes `applyBrandColorDeduction(result, entry)` which appends the violation string and subtracts a fixed 10 points when the entry shows the brand primary missing. Compliance entries land on `ResolutionTrace.brandColorCompliance[]` (TraceBuilder method `addBrandColorComplianceEntry`); `inputs.brandColorSource` mirrors `resolutionTrace.brandColorSource` for fast read access. The frontend gains `src/components/BrandColorSwatchPreview.tsx` rendered next to the existing pickers in `InputForm.tsx`, the workspace auto-fill effect with the "Using workspace colors" label, and a retargeting-mode "Inheriting brand colors from the linked cold ad" label per FR-011a; the `src/utils/wcagContrast.ts` helper mirrors the backend luminance formula client-side. New fixtures in `contractFixtures.test.ts` cover all five surfaces (BCR-01..11, US1 carousel/batch/anti-placeholder, US2 retargeting, COMP-01..06, BCC-01..08, US5 scoring).

## Technical Context

**Language/Version**: TypeScript 5.7 (functions), TypeScript 5.9 (frontend)
**Primary Dependencies**:
- Backend — Firebase Cloud Functions v2 (`firebase-functions ^7.2.2`), Firebase Admin (`firebase-admin ^13.6.1`), Sharp `^0.33.5` (already installed; same engine as `offerOverlay.ts`, `textCompositing.ts`, `logoComposite.ts`); reused for image color analysis via `sharp(...).stats()` and `sharp(...).resize().raw().toBuffer()` for k-means quantization. Gemini 3.1 image model (no new model calls).
- Frontend — React 19, Zustand, Tailwind CSS 3, Vite 7.
**Storage**: Firestore additive only — extends existing `generations/{genId}` document with:
- `resolutionTrace.brandColorCompliance: BrandColorComplianceEntry[]` — new optional array with one entry per rendered asset (slide / batch item / single image).
- `inputs.brandColorSource: 'form' | 'avatar' | 'inherited' | 'workspace' | 'none'` — new optional field recording which precedence source supplied the colors at submission time.
- `inputs.brandColorPrimary` / `inputs.brandColorSecondary` already exist on the generation record (carried through from form inputs); no schema change required for the values themselves.
No schema migration. Legacy records without `brandColorPrimary` continue to fall through the FR-019 fallback chain.
**Testing**: Jest (existing `functions/src/contractFixtures.test.ts`, `failureClassification.test.ts`, `__tests__/`). New fixtures land in `contractFixtures.test.ts` per the launch-matrix Phase 15.7 task.
**Target Platform**: Firebase Cloud Functions on `europe-west1` (matches `generateCreative`); browser for frontend.
**Project Type**: Web application — `functions/` (backend) + `src/` (frontend) monorepo at repo root.
**Performance Goals** (operational, not user-promise):
- Brand color resolver: O(1) per call, < 1 ms (pure function over four hex strings).
- Per-asset compliance check: < 800 ms p95 per 1024×1024 image (Sharp resize-to-32×32 + 5-color k-means quantization + ΔE-2000 against brand primary). Carousel/batch parallelism via `Promise.allSettled` on the per-asset workers, capped at 5 concurrent (matches existing reflow concurrency cap).
- Compliance check is fire-and-forget relative to user-visible asset delivery: SC-005 promises no perceptible added wait.
**Constraints**:
- Anti-placeholder rule (FR-009) MUST be enforced before any prompt is sent — the resolver returns hex strings only; the prompt-build sites MUST string-interpolate the hex, never the variable name.
- Compliance check tolerance is fixed at **ΔE-2000 < 15** (research.md decision; matches the launch-matrix tolerance suggestion).
- Fixed score deduction is **10 points** out of 100 (research.md decision; matches the launch-matrix suggestion and stays below the 30-point category-fail threshold in `creativeScoringEngine.ts:27` so a single brand-color miss does not by itself fail an asset).
- CTA auto-contrast formula: relative luminance per WCAG 2.x — text is white when `L_primary < 0.5` and `#1A1A1A` (near-black) otherwise. Deterministic at the boundary.
- All resolver/compliance/compositor work MUST run on every approved launch lane (Lanes 1–11 per constitution Operating Rules) — no lane-scoped enablement.
- Magic edit and remix flows reuse the same resolver and compliance check (FR-020, FR-021); they do not get their own code path.
**Scale/Scope**: Single feature, 6 backend files modified or created, 1 frontend file modified, 1 frontend component added, 1 test file extended, no schema migration, no new infrastructure, no new callable.

## Constitution Check

Re-evaluated against the 12 principles in `.specify/memory/constitution.md` v1.1.0:

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | **PASS** | Closes existing gaps; no new mode, no new toggle, no new option. Single hidden surface (compliance check) is observation-only and never blocks delivery. |
| II. Selected Mode MUST Be Obeyed | **PASS** | When the user picks brand colors in the form, FR-005 mandates form-input wins over every automatic source. |
| III. Launch Surface Is Frozen | **PASS** | Applies to every launch lane uniformly; no lane added, no lane removed. |
| IV. Behavior Contracts Beat Subjective Judgment | **PASS** | 21 FRs with pass/fail rules; 7 SCs with measurable outcomes; tolerance and deduction magnitudes pinned in research.md. |
| V. Arabic Quality Is First-Class | **PASS** | Compositor changes preserve `compositeArabicText` and `compositeFullAdText` Arabic-first behavior (FR-006/007 only set defaults; existing Arabic rendering rules at `generators.ts:5146-5151` continue to apply, including the "NEVER partially color Arabic text" rule). |
| VI. Hidden Machine Layers MUST Be Auditable | **PASS** | `brandColorSource` records which precedence source was active; `brandColorCompliance[]` records per-asset pass/fail with ΔE distance; both visible in `resolutionTrace`. |
| VII. No Silent Override Without Rule, Signal, and Trace | **PASS** | Inheritance from cold ad (FR-004) is logged as `brandColorSource: 'inherited'`; UI's "Using workspace colors" label (FR-011) is the user-facing signal for the workspace-default case. |
| VIII. Cost Discipline | **PASS** | No new model calls. Compliance check is local CPU only (Sharp). Resolver is pure. |
| IX. Proof Is Required for Every Claimed Fix | **PASS** | Each FR is anchored to a specific file:line in the existing code (Summary). New fixtures in `contractFixtures.test.ts` provide before/after evidence. |
| X. Spec Before Code | **PASS** | Spec + 5 clarifications signed off before this plan. |
| XI. Frontend and Backend MUST Agree on Truth | **PASS** | Resolver lives in `functions/src/brandColorResolver.ts` (backend authority). Frontend's "Using workspace colors" label reflects the same precedence rule but does not enforce it; backend always re-resolves on submit. |
| XII. Deferred Scope MUST Remain Deferred | **PASS** | Out-of-scope (deferred): brand-color analytics dashboard, in-form contrast warning when primary is illegible against typical backgrounds, an explicit user-pinned CTA-text-color (research.md Q4). |

**Gate result**: All 12 principles pass. No violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/956-brand-colors/
├── plan.md              # This file
├── research.md          # Phase 0 output (tolerance, deduction magnitude, color extraction approach, CTA contrast formula)
├── data-model.md        # Phase 1 output (Firestore schema delta, types extensions, resolver signature)
├── quickstart.md        # Phase 1 output (manual verification recipe per user story)
├── contracts/
│   ├── brandColorResolver.md      # Phase 1 output (resolver function contract)
│   ├── brandColorCompliance.md    # Phase 1 output (per-asset compliance check contract)
│   └── compositorDefaults.md      # Phase 1 output (textCompositing parameter contract)
├── checklists/
│   └── requirements.md  # Already populated by /speckit.specify
├── spec.md              # Already populated by /speckit.specify + /speckit.clarify
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
functions/                                # Backend — Cloud Functions v2
└── src/
    ├── brandColorResolver.ts            # NEW — pure function: resolveBrandColors({ formPrimary, formSecondary, avatar, sourceColdAd, workspace }) → { primary, secondary, source, ctaTextColor }
    ├── brandColorCompliance.ts          # NEW — per-asset compliance: extractDominantPalette(imageBuffer) + checkBrandColorPresence(palette, brandPrimary) → { present, deltaE, dominantSwatch }
    ├── generators.ts                    # MODIFY — refactor existing brand-color string-interp blocks (lines 1089, 2146, 3522, 5146, 6151) to call resolveBrandColors once per generation; thread the resolved pair through carousel slide loop, batch loop, retargeting flow (look up cold-ad brandColorPrimary/Secondary via retargetingSourceId), magic-edit flow, remix flow; carousel adds the "every slide must include brand primary" instruction; batch adds the "all variations share the same palette" instruction
    ├── textCompositing.ts               # MODIFY — extend compositeArabicText() and compositeFullAdText() signatures with optional { brandPrimary, brandSecondary, ctaTextColor }; when set, override TextStyle.color for headline (use secondary) and TextStyle.backgroundTreatmentColor for CTA pill (use primary), with ctaTextColor on the CTA text; fall back to existing TextStyle when unset
    ├── creativeScoringEngine.ts         # MODIFY — read resolutionTrace.brandColorCompliance[] for the asset being scored; if `present === false`, append violation "Brand primary missing from rendered image" and deduct 10 from overallScore
    ├── resolutionTrace.ts               # MODIFY — TraceBuilder: add setBrandColorSource(source), addBrandColorComplianceEntry(entry); wire build()
    ├── types.ts                         # MODIFY — add BrandColorPair, BrandColorSource, BrandColorComplianceEntry; extend ResolutionTrace; extend GenerationInputs with brandColorSource
    └── contractFixtures.test.ts         # MODIFY — add Phase 15.7 fixture suite: (a) carousel slide-3 prompt contains both hex values, (b) batch item-2 prompt contains the batch-consistency instruction with hex values, (c) retargeting inherits primary+secondary from cold ad source via retargetingSourceId, (d) compliance flag fires on a synthetic image with no brand-primary pixels, (e) compositor uses brand primary as CTA bg and auto-picks contrasting text color, (f) precedence resolver returns the correct source per the four-tier rule, (g) magic edit and remix paths invoke the resolver

src/                                      # Frontend — React 19 + Vite
├── components/
│   ├── InputForm.tsx                    # MODIFY — render <BrandColorSwatchPreview /> next to the brand-color pickers at lines 1654-1690; render "Using workspace colors" label when active workspace primary/secondary equal current form values
│   └── BrandColorSwatchPreview.tsx      # NEW — small presentational component: two stacked rectangles (primary as background, secondary as accent) with mini-CTA-pill render to preview compositor output; props: { primary, secondary }
└── types.ts                             # MODIFY — mirror backend BrandColorSource enum for any client-side trace rendering
```

**Structure Decision**: Existing repository structure (single root with `functions/` + `src/`). No new top-level directories. Backend additions follow the existing per-feature single-file pattern (cf. `logoComposite.ts`, `offerOverlay.ts`, `textCompositing.ts`, `culturalCompliance.ts`). Frontend addition is a single small presentational component beside the existing form.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. Section intentionally empty.
