# Phase 0 Research — Resize & Reflow (Regenerated 2026-05-29)

Aligned with the finalized spec.md (rounds 1+2 fixes applied). Six planning decisions resolve all NEEDS CLARIFICATION items.

## R-001 — Cost Model: Unified Per-Generation Flat Cost

**Spec basis**: FR-006 — "Resize costs the same credits as a single image generation. One resize = one generation credit cost."

**Existing constants**:

- `src/planconfig.ts:24` — `CREDIT_COSTS.generateImage = 5`
- `src/planconfig.ts:26` — `CREDIT_COSTS.reflowImage = 5` (already matches)
- `functions/src/reflowImage.ts:67` — `RERENDER_CREDIT_COST = 5` (already matches)
- `functions/src/reflowOutpaint.ts:32` — `OUTPAINT_CREDIT_COST = 2` (**MISMATCH** — needs bump to 5)

**Decision**: Bump `OUTPAINT_CREDIT_COST` from 2 → 5. All successful reflow outcomes now charge a flat 5 credits per item, regardless of which internal route the router chose. Failed items still charge 0.

**Rationale**:

1. The spec moved to a single cost — visible cost equals the underlying image-generation rate (5 credits). The frontend never sees the route.
2. `CREDIT_COSTS.reflowImage` is already 5 — it was authored against the flat-cost intent. The only stale constant is `OUTPAINT_CREDIT_COST = 2`, which was a HOTFIX-F-era cost reflecting outpaint's lower API cost.
3. With the method-selector UI removed (R-007 below), users can't exploit the cheaper route — there's no UX benefit to keeping outpaint cheaper. Backend continues to route by magnitude for *quality* reasons (preserve subject when ratio change is small), not for *cost* reasons.
4. Fixture tests T011, T019 already assert `creditsCharged === 5` (rerender) — they need no change. T022's outpaint-route assertion (currently `creditsCharged === 2`) bumps to 5.

**Alternatives considered**:

- **Keep outpaint at 2 (per-method cost surfaced in trace only)**: Simpler implementation, but contradicts FR-006's "one resize = one generation credit cost." Rejected.
- **Drop outpaint route entirely**: Loses quality wins on small-magnitude changes (4:5 → 1:1 preserves subject far better via outpaint than re-render). Rejected — the route is internal and silent (FR-011), not a user concern.

**Acceptance impact**: FR-006 ✅, FR-008a ✅, SC-007 ✅. T022 fixture cost assertion updated.

---

## R-002 — Safe-Zone Format: Percentage Insets

**Spec basis**: FR-013 — "A safe-zone definition MUST exist for every supported aspect ratio. Taller ratios receive larger top/bottom insets; wider ratios receive larger left/right insets; 1:1 uses a uniform inset. Unknown ratios MUST be rejected explicitly."

**Existing**: `layoutContract.ts:151-224` `ASPECT_RATIO_RULES[ratio].safeZoneInset` is a single pixel scalar (e.g., 90 px for 1:1, 70 px for 9:16) on a known canvas. Symmetric — does not capture per-edge asymmetry.

**Decision**: Export new `getSafeZoneForRatio(ratio): { top, right, bottom, left }` from `layoutContract.ts` returning the spec-published table verbatim. Do not modify the existing `safeZoneInset` field — it is consumed by the render-prompt block in 9 existing generation callables and is part of the launch contract.

Authoritative table (matches the original spec brief):

| Ratio | top | right | bottom | left |
|---|---|---|---|---|
| 1:1 | 8 | 8 | 8 | 8 |
| 4:5 | 10 | 8 | 10 | 8 |
| 3:4 | 12 | 8 | 12 | 8 |
| 4:3 | 8 | 12 | 8 | 12 |
| 9:16 | 14 | 8 | 14 | 8 |
| 16:9 | 8 | 14 | 8 | 14 |

**Rationale**:

1. The published table embeds an editorial decision about asymmetric padding (taller → bigger top/bottom; wider → bigger left/right) — the symmetric pixel scalar cannot represent it.
2. `safeZoneInset` remains the single source of truth for the render-prompt block; changing its shape would break 9 generation callables.
3. The two forms are consumed by different callers — render-prompt vs. post-render text composition. Isolation is correct.

**Alternatives considered**:

- **Derive percentages from existing pixel insets**: Would emit 8.33% for 1:1 (90/1080) and 3.65% for 9:16 (70/1920) — does not match the published table at all. Rejected.
- **Replace `safeZoneInset` field shape**: Breaks 9 callables for no gain. Rejected.

**Acceptance impact**: FR-013 ✅, T010 fixture covers the table + throws-on-unknown.

---

## R-003 — Text Re-composition: Re-render Path Only

**Spec basis**: FR-011 — "the re-render path re-composites text into the new safe zone after a full image re-render; the outpaint path preserves text via the locked-region guarantee."

**Decision**: `compositeArabicText()` (and its non-Arabic peer) runs on re-render outputs only. Outpaint outputs preserve the source's pre-composited text via the central 70% locked region — no second pass.

**Rationale**:

1. The spec explicitly distinguishes the two routes' text-handling. Re-running text composition on an outpaint output would *replace* the surviving text with a fresh render, defeating the lock-region guarantee.
2. The router (`reflowRouter.ts`) sends ≥30% magnitude changes to re-render — those are the cases that need text recomp because the fresh render has no pre-composited text yet.
3. FR-012's font-size-reduction loop applies on re-render outputs only — outpaint never touches text, so reduction is structurally impossible there.

**Acceptance impact**: FR-011 ✅, FR-012 ✅, T005 implementation scoped to re-render path with `// outpaint outputs skip this — text preserved via locked region` comment.

---

## R-004 — Brand Color Reinforcement Source

**Spec basis**: FR-010 — "A resized output MUST preserve the original creative's brand color palette when the original generation specified primary and/or secondary brand colors."

**Decision**: `reflowRerender.ts` reads `inputs.brandColorPrimary` / `inputs.brandColorSecondary` from the source generation document (persisted by Phase 15 / `956-brand-colors`). When either is a non-empty hex string, append `BRAND COLOR LOCK: Maintain exact brand palette — Primary: {hex}, Secondary: {hex}.` to the re-render prompt before dispatch. When both absent, skip silently. Return `brandColorReinforced: boolean` so the caller can record the trace flag.

**Rationale**:

1. Brand colors persist on the original `AdInputs` record per Phase 15. They are the original generation's contract with the user — reflow must preserve them.
2. Reusing persisted inputs (not user-supplied at reflow time) keeps the callable signature unchanged.
3. Skipping silently when absent matches FR-010's "When the original did not set brand colors, this requirement is satisfied trivially."

**Acceptance impact**: FR-010 ✅, T012 fixture asserts `BRAND COLOR LOCK` block contains the user's hex.

---

## R-005 — CSS Preview Implementation

**Spec basis**: FR-003 — "The preview MUST appear within 1 second of the click and MUST NOT deduct credits." FR-004 — "labeled as a preview." SC-006 — "≤1 s in 95% of clicks, 0 credits in 100% of clicks."

**Decision**: Client-only CSS preview. New `src/components/ReflowPreview.tsx` renders the current image inside a wrapper sized to the target ratio (via Tailwind `aspect-[N/M]` utility) with `object-fit: cover`. No backend call. Label below: i18n string `studio.reflow.preview_label`.

**Rationale**:

1. SC-006 demands ≤1 s — a Firebase Functions round-trip with cold start would not meet that bar reliably.
2. Cost is structurally 0 — no API call.
3. FR-004 frames the preview as a non-promise, so users won't expect pixel-accuracy parity with the committed render.

**Acceptance impact**: FR-003 ✅, FR-004 ✅, FR-005 ✅, SC-006 ✅. Verified manually in quickstart.

---

## R-006 — Variant Chip Storage: Ratio-Only Key

**Spec basis**: FR-017 + FR-017a — "Each resized variant is stored as a chip keyed by its aspect ratio only. Maximum 6 chips — one per supported ratio. No method label is shown to the user."

**Existing**: `mockupHistory` stored as `Array<{ url: string; ratio: AspectRatio }>` and appended via `arrayUnion()` in `reflowImage.ts:504-507`. `arrayUnion` cannot do upsert-by-key.

**Decision**: Add new field `variantChips: VariantChip[]` to the generation document with shape `{ ratio, url, cleanReflowedImageUrl?, generatedAt }` (no `method` field — chip is keyed by ratio only). Transactional upsert reads existing array, filters out any prior entry with the same `ratio`, and appends the new one. Keep `mockupHistory.arrayUnion` alongside for back-compat with pre-Phase-17 generations.

**Rationale**:

1. Spec FR-017a explicitly removes the method dimension from chip identity — chip is identified by its target ratio.
2. The cap of ≤6 chips is implicit in the 6-ratio key space; transactional upsert by ratio guarantees no duplicate ratios at rest.
3. `cleanReflowedImageUrl` is set only when the backend route produced a separable pre-text image (re-render route). Outpaint variants have no separate clean image — the locked-region output already contains the original text.
4. Keeping `mockupHistory` for back-compat avoids a migration on existing generations.

**Alternatives considered**:

- **Mutate `mockupHistory` in place**: Breaks existing reads that rely on chronological append-only semantics for diagnostic display. Rejected.
- **Store chips in a Firestore subcollection**: Sub-collections add a read cost on every history fetch with no offsetting benefit at the ≤6 chip cap. Rejected.

**Acceptance impact**: FR-017 ✅, FR-017a ✅, FR-018 ✅, ≤6-chip cap enforced via key-space.

---

## R-007 — Method Selector Removal

**Spec basis**: FR-011 — "Method selection is never exposed to the user." Assumptions — "the user sees a single Resize action with no method selector."

**Existing**: `src/App.tsx:7343-7363` renders a `showMethodSelector` dropdown with Auto / Quick / Fresh options. The dropdown is the shipped HOTFIX-F UI.

**Decision**:

1. Delete the `showMethodSelector` UI block (lines 7343-7363) including the toggle button and the three method buttons.
2. Delete the `showMethodSelector` state variable and any related setters.
3. Hard-pin `reflowMethod` state to `'auto'` (still passed to the callable for future-proofing; user cannot change it).
4. Mark the callable's `method` field as internal-only in contracts/reflowImage.callable.md. Frontend always sends `'auto'`. Backend continues to honor `'outpaint'` / `'rerender'` overrides if sent (for unit tests, internal tooling) — but the public surface accepts only `'auto'`.

**Rationale**:

1. FR-011 and Assumptions both explicitly state the method is never user-facing. Existing UI violates this.
2. Removing the UI is reversible (one git commit) if a future phase wants to re-expose it; leaving the callable parameter accepting all three values means the runtime contract is forward-compatible.
3. With cost unified (R-001), there's no UX incentive to expose the route choice — users picked Quick to save credits; now both routes cost the same. The choice is purely an internal quality optimization.

**Alternatives considered**:

- **Hide the dropdown but keep the state variable user-configurable elsewhere**: Half-measure; violates the FR-011 letter. Rejected.
- **Remove the `method` field from the callable entirely**: Breaks existing fixture tests and internal tooling that fix the route for repeatability. Rejected.

**Acceptance impact**: FR-011 ✅, Assumptions ✅. New task T013a removes the UI block. Quickstart Scenario 5 (which previously tested the user override) is replaced with a backend-routing scenario.
