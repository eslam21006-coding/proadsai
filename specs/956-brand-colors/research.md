# Phase 0 Research: Brand Colors — End-to-End Consistency

**Branch**: `956-brand-colors` | **Date**: 2026-04-26
**Companion**: [plan.md](./plan.md), [spec.md](./spec.md)

This document resolves all open implementation-tunable values flagged in `spec.md` Assumptions and `plan.md` Technical Context, and locks in the algorithmic decisions that the implementation will follow.

---

## Decision 1 — Color-extraction algorithm and tolerance

**Decision**:
- Resize the rendered PNG/JPEG to **32×32** with `sharp(buffer).resize(32, 32, { fit: 'fill' }).removeAlpha()` and read raw RGB via `.raw().toBuffer()` (alpha removed so the buffer is exactly 1024 × 3 bytes).
- Run **5-color k-means** quantization on the 1024 pixels with **deterministic pixel-index seeding**: initial cluster centers are taken from pixel indices `floor(i × 1024 / 5)` for `i ∈ {0,1,2,3,4}` (no random seed — same input always produces the same centers). Up to 10 iterations; squared-Euclidean assignment in raw RGB.
- For each of the 5 cluster centers, compute **CIEDE2000 (ΔE-2000)** distance against the brand primary in CIELAB color space (D65 white point).
- **Per-pixel fallback**: if no cluster center is within `DELTA_E_THRESHOLD = 15`, iterate raw pixels (deduplicated to 5-bit-per-channel buckets) and check each unique color's ΔE against the brand primary. This catches small brand accents (CTA pills, logo glyphs, single headlines) that get absorbed into a larger centroid.
- The brand primary is **present** when the minimum ΔE across centers OR any unique pixel is **strictly < 15** (the constant `DELTA_E_THRESHOLD = 15` lives at the top of `brandColorCompliance.ts`).

**Rationale**:
- 32×32 resize makes k-means O(1) regardless of source resolution and stays under 800 ms p95 on a Cloud Function with the 2 GiB / 1 vCPU profile already used by image jobs.
- 5 clusters captures the dominant background, secondary background, primary subject, accent, and text-zone color of a typical ad without overfitting to noise.
- CIEDE2000 is the industry-standard perceptual-distance metric; ΔE < 15 is the launch-matrix Phase 15.6 suggestion and matches "obviously same color family to a human observer" without being so loose that a generic warm tone reads as "your brand red is present."
- All math is local CPU — no external dependency, no network call, no model call (constitution principle VIII).

**Alternatives considered**:
- **Sharp `.stats().channels`** (mean per-channel): too coarse — averages a brand-color accent away into the background's mean. Rejected.
- **Median-cut quantization**: comparable accuracy to k-means at this resolution but harder to make deterministic; not worth the dependency surface.
- **k=3** clusters: misses brand-color accents that are <20% of the image area (which is the *typical* placement for a CTA button). Rejected.
- **ΔE-76** (simple Euclidean in CIELAB): cheaper but well-known to be perceptually inconsistent in the blue-purple range — rejects too many valid blue brand primaries. Rejected.
- **Hue-only HSL distance**: ignores lightness, which fails on brand grays. Rejected.

---

## Decision 2 — Score deduction magnitude

**Decision**: Fixed **10-point deduction** from `CreativeScoreResult.overallScore` per asset that fails the brand-color compliance check. No category-level deduction; the deduction is recorded under a new violation string `"Brand primary missing from rendered image"` returned in `violations[]`.

**Rationale**:
- `creativeScoringEngine.ts:26` defines `PASS_THRESHOLD = 60` and `creativeScoringEngine.ts:27` defines `CATEGORY_FAIL_THRESHOLD = 30`. A 10-point deduction means a single brand-color miss does not by itself fail an asset that was otherwise solid (it might drop a 75 to a 65 — still passing) but it does cleanly tip a borderline asset from 65 to 55 (failing). That is the correct operational behavior: brand-color presence is a quality factor, not a hard gate.
- Matches the launch-matrix Phase 15.6 suggestion exactly.
- Single fixed value avoids the complexity of a sliding scale (e.g., proportional to ΔE distance), which would make the score harder to interpret and harder to test.

**Alternatives considered**:
- **5-point deduction**: too small to move borderline assets across the pass threshold; fails to give the user actionable signal.
- **20-point deduction**: punishes borderline cases too aggressively and can hide other quality issues by dominating the score.
- **Move it to `categories.modeCompliance`**: pollutes the existing category semantics (mode compliance is about creative mode, not about brand color). A separate violation string is cleaner.
- **Hard fail (set `passed = false`)**: violates principle I (reliability over feature count) — would block delivery of an otherwise-shippable asset. Rejected.

---

## Decision 3 — CTA text-color contrast formula

**Decision**: WCAG 2.x **relative luminance** of the brand primary determines the CTA text color:
- Compute `L = 0.2126·R_lin + 0.7152·G_lin + 0.0722·B_lin` (linearized sRGB channels per WCAG 2.x).
- If `L < 0.5` → text is `#FFFFFF` (white).
- If `L ≥ 0.5` → text is `#1A1A1A` (near-black; not pure black to soften the contrast against unintentionally bright brand primaries while still meeting AA contrast).
- The boundary is deterministic at exactly `L = 0.5`: the `≥` clause picks near-black.

**Rationale**:
- Single canonical formula in the W3C spec; there is no ambiguity to drift on.
- Picking only between two values (white and near-black) makes the resolver's output discrete and testable, and matches the visual language already used by the existing ad pipeline.
- `#1A1A1A` instead of `#000000` mirrors the prevailing UI convention for ad CTAs (slightly off-black avoids the harsh "ink-on-paper" look on light brand primaries that are still saturated).
- Deterministic at `L = 0.5` so the test fixture (clarification Q5 edge case) does not depend on float comparison.

**Alternatives considered**:
- **APCA contrast (the WCAG 3 draft)**: technically more accurate for typography but the spec is still draft and most ad-platform conventions are still calibrated against WCAG 2.x. Rejected for now; can be swapped without changing the resolver's interface.
- **Always white text**: breaks on light brand primaries (e.g., `#F59E0B`, `#FFD700`, pastels). Rejected during clarification Q5.
- **User-pinned third color**: clarification Q5 explicitly rejected option D. Re-confirmed deferred.

---

## Decision 4 — Magic edit and remix scope

**Decision**: Both flows reuse `brandColorResolver.ts` and `brandColorCompliance.ts` without per-flow code paths.
- **Magic edit**: at the point in `generators.ts` where the magic-edit prompt is constructed for an existing generation, call `resolveBrandColors({ formPrimary, formSecondary, avatar, sourceColdAd: null, workspace })` — magic edit does not have a cold-ad source — and string-interp the result. The compositor and compliance check then run as for any other render.
- **Remix**: at the remix entry point, the source-ad pointer plays the same role as `retargetingSourceId` does for retargeting. Resolver call is `resolveBrandColors({ formPrimary, formSecondary, avatar, sourceColdAd: remixSource, workspace })`. The "inherited" precedence slot covers both retargeting and remix; the resolver does not distinguish.

**Rationale**:
- Spec clarification Q4 pinned this as in-scope. The single-resolver design is the cleanest way to honor that without two parallel code paths.
- Lets the same fixtures (Phase 15.7) cover both flows by parameterizing the test inputs.

**Alternatives considered**:
- **Separate resolvers per flow**: rejected — three flows × four sources = exponential test surface.
- **Defer magic edit/remix to a follow-up phase**: rejected during clarification (option C).

---

## Decision 5 — Anti-placeholder enforcement point

**Decision**: The resolver returns hex strings only. Prompt-build sites in `generators.ts` MUST string-interpolate the hex via template literal (`${primary}`) and never reference a variable name in the rendered prompt. A new lint-level test in `contractFixtures.test.ts` scans the resolved prompt for the regex `/\[(brand[_ ]?color|primary[_ ]?color|brand[_ ]?name)/i` and fails the build if any match appears.

**Rationale**:
- The existing `generators.ts:2151` and `generators.ts:3528` already include "NEVER write placeholder text" instructions to the model. The new test treats this as a contract, not a hope: if the model ever drifts and emits `[brand color]` as a literal in `TECHNICAL_PROMPT`, CI catches it.
- Aligns with constitution principle IV (behavior contracts beat subjective judgment) and IX (proof required for every claimed fix).

**Alternatives considered**:
- **Trust the model**: contradicts principle IV. Rejected.
- **Strip the placeholder post-hoc with a regex replacer**: would mask the underlying drift instead of surfacing it. Rejected.

---

## Decision 6 — Concurrency cap for compliance check

**Decision**: When checking carousels (up to 10 slides) or batches (up to 36 items, per `09.50-hotfix-plan-alignment` plan limits), run the per-asset checks via `Promise.allSettled` with a max **5 concurrent workers**. Each worker is one Sharp pipeline + one k-means pass.

**Rationale**:
- Matches the existing concurrency cap in `955-aspect-reflow` (carousel/batch reflow uses the same cap), so we reuse the operational profile that production has already absorbed.
- 5 concurrent workers × ~800 ms per worker = ~6 s wall-clock for a worst-case 36-item batch, well inside the post-render window before the user sees the asset.
- `allSettled` not `all`: a failure on one slide's compliance check (corrupt image, decode error) MUST NOT block the rest from being scored or delivered (spec Edge Cases bullet 6).

**Alternatives considered**:
- **Sequential**: too slow on a 36-item batch (~30 s), would visibly delay the score.
- **Unbounded concurrency**: risks overloading the function's CPU and starving sibling work.

---

## Decision 7 — Frontend "Using workspace colors" label trigger

**Decision**: The label renders when **both** form values exactly equal the active workspace's `brandColorPrimary` and `brandColorSecondary` (case-insensitive hex compare, normalized to `#xxxxxx`). It hides the moment the user edits either value, and reappears if they reset to the workspace defaults. Empty workspace defaults → no label, no auto-fill.

**Rationale**:
- Simplest, most truthful trigger: the label says "you are using the workspace defaults" iff that statement is true.
- No timer, no debounce, no animation — pure derived state of the form input.

**Alternatives considered**:
- **Always show the label whenever the workspace has defaults**: misleading once the user overrides one color.
- **Show "Workspace defaults loaded" once on form open then never again**: makes the UI less truthful over the form's lifetime.

---

## Open items deferred to planning's downstream phases

None. All NEEDS-CLARIFICATION items from the spec are resolved either here or in the spec's Clarifications section.

## Open items deliberately deferred beyond this feature

- **Brand-color analytics dashboard**: per-asset compliance results land on `resolutionTrace.brandColorCompliance[]` and are queryable today via Firestore but no admin/owner UI surfaces them in aggregate. Tracked as a future phase.
- **In-form contrast warning when the brand primary is hard to read against typical ad backgrounds**: out of scope; the auto-contrast formula handles the CTA case, and broader visual-quality warnings are a separate UX track.
- **APCA (WCAG 3) migration of the auto-contrast formula**: deferred until WCAG 3 leaves draft.
