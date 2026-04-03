# Research: Blueprint → Long-Form Render Prompt Pipeline

**Date**: 2026-04-02 | **Branch**: `005-render-prompt-pipeline`

## R1: Current Build Plan Input Injection Status

**Decision**: Audit existing `generateBuildPlan()` and fix gaps — do not replace the function.

**Findings**: `generateBuildPlan()` in `functions/src/generators.ts:3296` already injects most Step 1 inputs:
- Creative mode (`offerCreativeMode`) — via `compileFullContract()` + mode spec block
- Sub-style (`visualSubStyle`) — via `resolveVisualSubStyle()` constraint block
- Hook angle (`coldHookAngle`) — via `getHookAngleVisualDirection()`
- Ad tone (`adTone`) — via `getAdToneVisualMood()`
- Brand colors (`brandColorPrimary`, `brandColorSecondary`) — injected as hex values
- Campaign type + retargeting objection — via retargeting context block
- Universe — passed as `resolvedUniverse` parameter

Step 2 copy text (`hookText`, `subheadText`, `ctaName`, `benefitText`) is injected unconditionally via `TEXTS TO RENDER` and `buildContentOwnershipMap()`.

Mode-specific data (`valueStackItems`, `eventTitle`, `eventDate`, `valueStackPrice`, etc.) is injected conditionally via `buildContentOwnershipMap()`.

**Gap**: No systematic audit has verified ALL fields are present in ALL code paths. Some conditionals may skip fields silently. The audit (task 5.1/5.2) must walk every conditional and ensure no input is silently dropped.

**Rationale**: Extending the existing function is lower-risk than rewriting it.

**Alternatives rejected**: Full rewrite of `generateBuildPlan()` — too risky, too many dependent flows.

---

## R2: TECHNICAL_PROMPT Extraction

**Decision**: Add named extraction to `parseBuildPlanEnvelope()` in `buildPlanSlotMap.ts`.

**Findings**: The build plan currently uses `[[PROADS_MACHINE_PLAN_V1]]..[[/PROADS_MACHINE_PLAN_V1]]` markers for the machine-readable portion. `parseBuildPlanEnvelope()` returns `{ blueprint: string, machinePlan: StructuredBuildPlanPayload | null }`. The `machinePlan` is the structured JSON portion — the `TECHNICAL_PROMPT` (the long-form English render prompt) is a separate concept embedded in the blueprint text, not yet extracted as a named field.

**Rationale**: Named field extraction is safer and more maintainable than substring search. The existing marker pattern (`[[...]]`) can be extended with a new marker pair for `TECHNICAL_PROMPT`.

**Alternatives rejected**: Regex substring search — fragile, breaks on prompt format changes.

---

## R3: Final Image Prompt Assembly

**Decision**: Extract inline prompt assembly from `generateFinalAd()` into a dedicated `buildFinalImagePrompt()` function.

**Findings**: In `generateFinalAd()` (~line 4656+), the final prompt is assembled inline as a `parts[]` array combining:
1. `coreDesignRules` (large template literal with design system rules)
2. Sanitized blueprint (TECHNICAL_PROMPT markers stripped for user display)
3. Text directives (hookText, subheadText, ctaName)
4. Image parts (Box A photos, Box B logos, Box C assets)

This is ~200 lines of inline assembly with no single entry point. The new `buildFinalImagePrompt()` function will consolidate this into one callable function with a defined signature.

**Rationale**: Single assembly point makes the prompt auditable (Constitution VI), testable (FR-011), and prevents inline assembly elsewhere (FR-006).

**Alternatives rejected**: Keeping inline assembly + adding logging — still fragile, still untestable in isolation.

---

## R4: Resolution Trace Schema Extension

**Decision**: Add `resolvedImagePrompt` and `blueprintText` fields to the existing ResolutionTrace schema.

**Findings**: ResolutionTrace already exists in `specs/001-resolver-completeness-trace/` with fields for resolved modes, styles, angles, objections, slide counts, auto-switch events, and per-slide data. It is persisted to Firestore on `generations/{genId}` documents fire-and-forget. The `perSlide` array exists but does not currently include per-slide prompt data.

**Rationale**: Extending the existing schema is straightforward. The trace is already fire-and-forget, so adding string fields has minimal performance impact.

---

## R5: Step 3 Blueprint UI

**Decision**: Add expandable "View Blueprint" panel within existing Step 3 concept card UI.

**Findings**: Step 3 already uses expandable accordion cards for concept display (environment, mood, lighting, text layout panels). The existing UI pattern supports adding another expandable section. The blueprint text needs the TECHNICAL_PROMPT portion stripped before display.

**Rationale**: Reuses existing UI patterns — no new component library needed.

---

## R6: Carousel Per-Slide Handling

**Decision**: Ensure `buildFinalImagePrompt()` is called per-slide with correct per-slide copy.

**Findings**: The carousel flow generates per-slide build plans by appending `[CAROUSEL SLIDE N]: {slideInstruction}` to the base concept. Each slide gets its own `generateBuildPlan()` call. The final image render (`generateFinalAd()`) is called per-slide. The new `buildFinalImagePrompt()` must receive the correct per-slide `hookText`/`subheadText` — not slide 1's text reused.

**Rationale**: The per-slide architecture already exists. The change is ensuring the new assembly function is called at each slide's render point with the right copy text.

---

## R7: Copy Fidelity Validation

**Decision**: Add hookText presence check to `validateStructuredBuildPlan()` in `buildPlanSlotMap.ts`.

**Findings**: `validateStructuredBuildPlan()` currently checks zone assignments, mustShow elements, and overlay slots against the layout contract. It does NOT check for hookText presence in the machine plan. The check is a simple `includes()` on the extracted TECHNICAL_PROMPT string against the approved hookText.

**Rationale**: Simple substring check is sufficient — the spec defines "verbatim" as exact string match with whitespace normalization. Arabic text should match correctly since both strings come from the same pipeline (no re-encoding).

**Alternatives rejected**: Fuzzy matching / edit-distance — adds complexity, false positives, and undermines the "verbatim" guarantee.
