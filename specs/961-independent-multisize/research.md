# Phase 0 Research: Independent Multi-Size Ad Generation

All spec-level NEEDS CLARIFICATION were resolved in the `/speckit.clarify` session (2026-06-21). This document records the implementation-level decisions reached by grounding the spec against the actual codebase.

---

## R1. How to generate a fresh native design at a new size using the original as a reference

**Decision**: Add `generateSizeVariant()` that re-runs the existing prompt-build/validate contract at the target aspect ratio while supplying the source image as a *visual reference*, not as pixels to transform.

- Reuse `buildFinalImagePrompt(params)` (`generators.ts:5234`) with `aspectRatio = target`, the full rebuilt prompt (all non-null copy fields, hero, environment, art direction, brand colors), `imageParts = [referenceImage]`, `styleReferencePresent = true`, and **`reflowInstruction` unset**. The layout contract MUST be derived for the **target** ratio (not inherited from the anchor's stored layout): if `buildFinalImagePrompt` does not itself re-derive ratio-appropriate layout from its `aspectRatio` param, re-run `compileFullContract(... aspectRatio: target ...)` against the saved build plan first, so each canvas gets native layout rules (FR-004). This re-derivation reuses the saved plan and does **not** re-run `generateBuildPlan()` (preserving FR-019a).
- Run the visual routing caller (`createVisualRoutingCaller`, `index.ts:3913`) so `MODEL_PROVIDER` routing (OpenAI gpt-image-2) is preserved.
- Run `validateCopyFidelity()` (`buildPlanSlotMap`, used at `generators.ts:4705/4943`) with its existing retry loop so exact strings reach the image (FR-018).

**Rationale**: The model receives the *complete* prompt (so it knows which text elements to render, respecting Phase 24B nulls) and uses the reference only for hero/environment/palette consistency. This is the core fix for the dropped-CTA defect: the model is not asked to "reflow" an existing composition (the failing path at `generators.ts:6665`), it composes natively for the new canvas.

**Alternatives considered**:
- *Keep reflow + better prompt* — rejected; 4 prior prompt-only attempts failed (pre-existing gpt-image-2 limitation, per spec).
- *`images.edit()` with the original as edit base* — rejected; that is a transform, reproduces the dropped-text behavior.
- *Reuse `reflowRerender.rerenderFromPlan()`* — partially reused conceptually (it already re-runs the pipeline from the saved plan), but it omits the visual-reference seed and lives in HOTFIX-F (being superseded). New module avoids entangling the new path with deprecated code.

---

## R2. Anchor-first sequencing and concurrency cap location

**Decision**: Orchestrate fan-out on the **client**. Generate the anchor via the existing `serverGenerateFinalAd` path (unchanged), then call `generateSizeVariant` for each remaining size, chunked into waves of ≤10 with `Promise.allSettled` per wave.

**Rationale**:
- Resolves the deferred "concurrency cap scope" question: each variant is its own Cloud Function invocation (300s timeout each), so the 540s ceiling is never approached by a single call; the ≤10 cap is purely a client-side throttle to protect the OpenAI rate limit (FR-010, edge case "function time limits").
- Matches the existing frontend pattern — `handleRescale` already uses `Promise.allSettled` across batch items (`App.tsx:5452`), and `selectedSizes: Set<AspectRatio>` already exists (`App.tsx:2599`).
- Anchor-first guarantees the variant calls have a completed reference image (FR-002a, SC-003).

**Alternatives considered**:
- *Single backend callable that fans out internally* — rejected; risks the 540s ceiling for large batch×size runs and concentrates rate-limit blast radius server-side.
- *All sizes parallel from brief, no cross-reference* — rejected per clarification (consistency drift; SC-003).

---

## R3. Visual-reference resolution order

**Decision**: Resolve the reference image in priority order **uploaded reference → source's own original → anchor → none**, and record the chosen source as `ReferenceSource` in the trace.

**Rationale**: FR-008 mandates a user-uploaded reference overrides everything; FR-003/FR-007 use the result's own original for resize; FR-002a uses the anchor for pre-select variants. `inputs.referenceImage` already exists and is analyzed via `analyzeReferenceImage()` (`generators.ts:1269`). On anchor failure the reference degrades to `none` and the variant generates from the brief (FR-005a).

**Alternatives considered**: Always-anchor — rejected (ignores uploaded reference and per-item originals for resize).

---

## R4. Credit charging model (upfront + refund)

**Decision**:
- **Frontend**: compute `total = numDesigns × 5` (excluding same-size no-ops), display before commit, and block if `userCredits < total` with a required-vs-available message (FR-012, FR-013).
- **Backend**: each `generateSizeVariant` invocation, inside a Firestore transaction, charges 5 upfront at the start (reserving before generation runs) and refunds 5 if its generation fails; net charged = 5 × successes (FR-012a, FR-015). The anchor continues to be charged by the existing `serverGenerateFinalAd` path (`generateImage: 5`).
- **Idempotency**: key `genId:scope:itemIndex:targetRatio`; a recorded successful variant short-circuits to no-op (`creditsCharged: 0, noOp: true`) (FR-011); a recorded in-flight/charged key prevents double-charge on retry (FR-014).

**Rationale**: Honors the clarified "charge upfront, refund failures" choice while staying within the existing per-callable transaction pattern (`index.ts:170`). Per-variant upfront charge reserves credits before each design renders; the frontend whole-request pre-check provides the user-facing "nothing starts if you can't afford it" guarantee. Net-charge invariant equals the user's mental model (pay only for delivered designs).

**Alternatives considered**:
- *Single server-side reservation of the full total in one transaction before any generation* — stronger literal reading of "full total upfront", but requires a new orchestration/escrow record and reconciliation across N independent callables; rejected for complexity/risk (Principle I, VIII) given per-variant charge+refund yields the same net result and same user-visible behavior. Documented here as the fallback if a stricter guarantee is later required.
- *Charge per success only* — rejected by clarification.

---

## R5. Persistence shape (additive, no migration)

**Decision**:
- **Single image**: keep using `mockupHistory: {url, ratio}[]` (`store.ts`, `App.tsx:2290`; backend `ReflowGenerationDoc.mockupHistory`). Each size is appended via the existing `pushMockup`.
- **Batch item / carousel slide**: add `sizeVariants: { [ratio: string]: SizeVariant }` keyed by `AspectRatio`.
- **Trace**: add optional `ResolutionTrace.sizeVariantTrace?: SizeVariantTraceEntry[]`.

**Rationale**: No `Generation` document migration; legacy records without `sizeVariants` behave exactly as today (Principle XII; spec assumptions). `mockupHistory` already exists and is array-shaped — reusing it for single avoids touching the single-image happy path (FR-005, edge case "single size selected").

**Alternatives considered**: A new top-level `variants` subcollection — rejected; over-engineered for ≤3 sizes per design and would require migration/read-path changes.

---

## R6. HOTFIX-F disposition

**Decision**: Comment out (do not delete) the bodies of `reflowImage.ts`, `reflowRouter.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`, the `reflowImage` callable registration in `index.ts`, and the "REFLOW: Ratio" block at `generators.ts:6665`, each prefixed with `// Superseded by Phase 17 independent multi-size generation. Kept for reversibility.` Frontend stops calling `reflowImage` and calls `generateSizeVariant` instead.

**Rationale**: Reversibility constraint; HOTFIX-F is superseded but must remain recoverable. Spec FR-021 + constraints.

**Alternatives considered**: Delete files — rejected (violates reversibility constraint).

---

## R7. Preserving Phase 22 / 23 / 24B and cultural compliance

**Decision**: The size-variant path reuses `generateBuildPlan()`/`buildFinalImagePrompt()`/`validateCopyFidelity()`, which already embed Phase 22 (copy quality), cultural compliance, and Phase 24B null-field handling (`CopyFieldStatus` tri-state, `generators.ts:244`). **Anti-sameness (Phase 23) fingerprints are NOT written for size variants** (FR-019a) — only the primary/distinct results write fingerprints.

**Rationale**: A variant is the same ad at a different size, not a new creative (FR-019a). Null copy fields carry forward unchanged (FR-006); the variant inherits the parent's stored brief.

**Alternatives considered**: Re-running anti-sameness per variant — rejected; would wrongly penalize same-ad variants and waste credits/calls (Principle VIII).

---

## Resolved Unknowns

| Unknown | Resolution |
|---|---|
| Where is the concurrency cap enforced? | Client-side fan-out waves (≤10); each variant is an independent callable. (R2) |
| Single upfront charge vs per-variant? | Per-variant upfront charge + refund; frontend whole-request affordability pre-check. (R4) |
| New callable vs reuse `serverGenerateFinalAd`? | New `generateSizeVariant` for variants/resizes; anchor keeps `serverGenerateFinalAd`. (R1, R2) |
| New collection vs additive fields? | Additive fields only — `mockupHistory` (single), `sizeVariants` map (batch/carousel), `sizeVariantTrace`. (R5) |
| Does anti-sameness apply to variants? | No (FR-019a). (R7) |

No outstanding NEEDS CLARIFICATION.
