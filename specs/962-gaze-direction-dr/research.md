# Phase 0 Research: Direct-Response Design Upgrades (Phase 19)

All Technical Context unknowns are resolved below. No outstanding NEEDS CLARIFICATION.

## R1. Injection pattern — mirror Phase 28 exactly

- **Decision**: Add gaze + DR guidance through a single block emitted inside `buildFinalImagePrompt()` (`functions/src/generators.ts:5260`), immediately adjacent to the Phase 28 expression block (which is injected at ~`generators.ts:5401-5428`, AFTER `BLUEPRINT:` and before `MANDATORY TEXT ELEMENTS`). The gaze block is placed right after the expression block so the renderer receives full scene + emotion context first, then gaze.
- **Rationale**: `buildFinalImagePrompt` is documented as the SOLE prompt-assembly entry point (`generators.ts:5195-5199`, FR-006 of the render-prompt-pipeline spec). Every render path — single, carousel (per-slide), batch (per-item), retargeting, before/after, resize, edit — routes through it. One injection point therefore satisfies Phase 19 FR-007 with zero per-path wiring. Phase 17 multi-size variants also route through it, so all sizes inherit guidance automatically.
- **Alternatives considered**: (a) Inject into the `[VISUAL ARCHITECT V5.0]` concept prompt (~line 3100) like the EXPRESSION DIRECTION concept variant — rejected because Phase 28's *image-prompt* path proved more reliable for face-adjacent direction and covers reflow/edit paths that skip concept generation. (b) Per-path injection — rejected (duplication, drift risk, violates single-assembly contract).

## R2. Mapper shape — new `gazeMap.ts` mirroring `expressionMap.ts`

- **Decision**: New pure module `functions/src/gazeMap.ts` exporting:
  - `GazeDirective` interface: `{ source: "hook" | "objection" | "fallback"; sourceId: string; treatment: GazeTreatment; description: string }`.
  - `GazeTreatment` union: `"direct_to_viewer" | "toward_content" | "reflective_downward" | "forward_horizon" | "three_quarter"`.
  - `HOOK_GAZE_MAP` over the 10 canonical hook ids; `HOOK_ALIAS_MAP` (shocking_stat→statistics, fear_of_missing_out→urgency, future_pacing→future_based); `GAZE_FALLBACK_DIRECTIVE`.
  - Resolvers `getHookGazeDirection()`, `getObjectionGazeDirection()`, `resolveGazeDirective({coldHookAngle, retargetingObjection})` (hook > objection priority), and `getKnownHookAngleIds()`.
  - Block builders `buildImagePromptGazeBlock(directive, { beforeAfterSplit, aspectRatio })`, plus standalone `ONE_HIGHLIGHT_BLOCK`, `buildHookVisualMoodBlock(directive)`, and `buildPriceHierarchyBlock()`.
- **Rationale**: Reuses the proven Phase 28 contract (non-null input → non-null directive; null only for null/empty input; unknown id → fallback, never throws — satisfies FR-010). Keeping it a separate file (not extending `expressionMap.ts`) keeps expression and gaze independently reversible and testable, and avoids coupling two audit traces.
- **Alternatives considered**: Extending `expressionMap.ts` — rejected for blast-radius/reversibility; the spec explicitly allows either but separation is cleaner.

## R3. Hook→gaze mapping table (the 10 canonical angles)

- **Decision**: Map each canonical hook to a natural gaze treatment + concrete physical description, paralleling the emotion the Phase 28 `HOOK_EXPRESSION_MAP` already assigns (so gaze and expression never contradict — FR-019):

  | Hook id | Gaze treatment | Description (concise) |
  |---|---|---|
  | `pain` | reflective_downward | gaze cast slightly down and inward, contemplative — sitting with the problem, not at camera |
  | `emotional` | toward_content / soft direct | soft eyes that connect, gentle slightly-off direct gaze — warm and understanding |
  | `curiosity` | three_quarter | eyes angled three-quarter off-axis, intrigued, drawing the viewer to look where they look |
  | `logic` | direct_to_viewer | steady level direct gaze, clear-eyed and evaluating |
  | `social_proof` | direct_to_viewer | confident direct gaze to viewer, the calm of someone who belongs |
  | `urgency` | direct_to_viewer | focused direct gaze, alert and ready-to-act |
  | `statistics` | direct_to_viewer | measured level gaze to viewer, sober authority |
  | `scarcity` | toward_content | alert gaze angled toward the offer/CTA zone — aware the door is closing |
  | `logical_authority` | direct_to_viewer | settled commanding gaze straight to viewer, earned authority |
  | `future_based` | forward_horizon | uplifted gaze toward the horizon/forward, already seeing tomorrow |

- **Rationale**: Each treatment is the natural complement of the hook's Phase 28 emotion (e.g., pain emotion = quiet suffering → reflective-downward gaze; logical_authority = commanding → direct-to-viewer). All guidance is advisory (FR-002): the block instructs the model to treat these as the natural default, never a rigid command.
- **Alternatives considered**: A purely composition-driven gaze (toward headline regardless of hook) — rejected as robotic (explicitly forbidden by FR-003).

## R4. Before/after split

- **Decision**: Reuse `isBeforeAfterSelection(inputs, coldHookAngle)` (`generators.ts:560`). When true, `buildImagePromptGazeBlock` emits a BEFORE half (hook-derived gaze, biased reflective/downward for pain-family) and an AFTER half using a `GAZE_ASPIRATIONAL_DIRECTIVE` (forward_horizon / direct-forward), mirroring Phase 28's `ASPIRATIONAL_DIRECTIVE` AFTER split, on the same face.
- **Rationale**: Satisfies FR-008 and edge case "Before/after mode" with the exact mechanism already validated for expression, keeping BEFORE/AFTER gaze and expression consistent.

## R5. Aspect-ratio awareness (9:16)

- **Decision**: Pass `aspectRatio` (destructured in `buildFinalImagePrompt`, `generators.ts:5266`; type `AspectRatio` = `'1:1'|'4:5'|'16:9'|'9:16'`) into `buildImagePromptGazeBlock`. For `9:16` (and `4:5` tall), the block adds a vertical-composition note ("respect the vertical stack — keep gaze within the frame, never off the side edge into empty margin"); for `16:9` wide it notes horizontal headroom.
- **Rationale**: Satisfies FR-009 and the 9:16 edge case without per-path code — the canvas size is already in scope at the single injection point.
- **Alternatives considered**: Ignoring aspect ratio — rejected; vertical stories are a primary launch format and gaze-off-edge is a named failure mode.

## R6. No-hook gating (clarification-driven)

- **Decision**: At the injection point, resolve the gaze directive via `resolveGazeDirective(...)`. If `null` (no hook/objection): emit NO gaze block and NO mood block, but ALWAYS emit the hook-independent `ONE_HIGHLIGHT_BLOCK`, and emit the price-hierarchy block when pricing content is detected (R7). If non-null: emit gaze + mood + one-highlight (+ price when applicable).
- **Rationale**: Directly encodes the Session 2026-06-24 clarification (FR-005, FR-011, FR-015). One-highlight is universally beneficial and hook-independent; gaze/mood require a hook.

## R7. Price-content detection (conditional price hierarchy)

- **Decision**: Emit the price-hierarchy block only when the assembled copy contains a price/discount signal. Detection = scan the already-resolved copy strings available at the injection point (`hookText`, `subheadText`, `benefitText`, `badges`) for currency/number/percent tokens (Arabic + Latin digits, `٪`/`%`, common GCC currency words/symbols: ر.س, د.إ, SAR, AED, $, etc., and discount keywords خصم/offer). If no signal: emit nothing (FR-017).
- **Rationale**: Most coach ads carry no price, so the block must be strictly conditional (FR-016/FR-017). The detector is a pure helper in `gazeMap.ts`, unit-testable, and adds no model calls. The feature never introduces a price the user did not provide.
- **Alternatives considered**: A new structured "price" input field — rejected (out of scope; no frontend change; the spec says price hierarchy is a soft addition gated on existing content).

## R8. CTA outcome framing (copy prompt, both languages)

- **Decision**: Add an advisory outcome-framing instruction in the existing CTA/benefit block of the Gemini copy prompt (`generators.ts:~2478-2516`), after the benefit-formula section and before output formatting. The instruction text lives as an exported constant `CTA_OUTCOME_FRAMING_BLOCK` in the side-effect-free `gazeMap.ts` and is imported into `generators.ts` (keeps it unit-testable from the standalone runner without importing the heavy `generators.ts` module — analysis finding F2). It instructs that the CTA/benefit should hint at an OUTCOME or benefit (not just the bare action) when natural, stay short (≈3–5 words, length adapting per language), remain action-oriented, and may still be a direct action when that reads better. Applies to BOTH Arabic and English (clarification). It explicitly preserves the existing Arabic grammar/flow rules (no leading و, self-contained phrase) and the copy-fidelity contract.
- **Rationale**: Satisfies FR-013/FR-014 with a minimal additive instruction in the proven copy path; reuses the existing benefit mechanism rather than adding a field.
- **Alternatives considered**: A separate CTA-rewrite pass — rejected (extra model call, violates cost discipline).

## R9. Audit trace

- **Decision**: Add optional `ResolutionTrace.gazeDirection?` = `{ source: "hook"|"objection"|"fallback"|null; sourceId: string|null; treatment: string|null; applied: boolean; reason?: string }` to `types.ts`, written in `generateFinalAd()` next to the existing `expressionAdaptation` trace write (`generators.ts:~5500-5524`). When no directive: `{ source:null, sourceId:null, treatment:null, applied:false, reason:"no-hook-or-objection-active" }`.
- **Rationale**: Satisfies FR-022 and Constitution VI/VII; additive-only, `null` sentinel, no migration.

## R10. Provider-switch & identity safety

- **Decision**: The block is plain prompt text appended in `buildFinalImagePrompt`, which already feeds both the Gemini and OpenAI (gpt-image-2) paths; no provider branch needed. The gaze block contains an explicit identity-priority clause ("face identity stays pixel-faithful; gaze direction is eye/head orientation only and must never alter facial features") echoing Phase 28's identity clause, and adds NO instruction that reorders or weakens the existing #1 identity rule.
- **Rationale**: Satisfies FR-018/FR-021. Verified `buildFinalImagePrompt` is provider-agnostic at the injection site (no `MODEL_PROVIDER` branch around the expression block).

## R11. Reversibility

- **Decision**: All injected calls are guarded so that (a) commenting out the single `buildImagePromptGazeBlock(...)`/DR injection line and (b) making the mapper resolvers return `null` restores exact pre-Phase-19 behavior. Superseded lines are commented out, not deleted.
- **Rationale**: Constitution + spec FR-023.
