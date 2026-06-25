# Contract: DR Guidance Injection (`buildFinalImagePrompt` + trace)

Wiring contract for the single shared assembly point and the audit trace.

## Contract D — Injection gating at `buildFinalImagePrompt()`

**Required inputs**: `inputs.coldHookAngle` / `inputs.retargetingObjection(s)`, `aspectRatio`, resolved copy (`hookText`, `subheadText`, `benefitText`, `badges`).

**Required output**: the assembled `textPrompt` contains the correct blocks per gating, injected AFTER the BLUEPRINT and AFTER the Phase 28 expression block.

| # | Given | Then |
|---|---|---|
| D1 | hook angle present | prompt contains GAZE DIRECTION block + mood block + ONE_HIGHLIGHT block |
| D2 | NO hook/objection | prompt contains ONE_HIGHLIGHT block; contains NO gaze block and NO mood block |
| D3 | pricing content present in copy | prompt contains the price-hierarchy block (regardless of hook) |
| D4 | NO pricing content | prompt contains NO price-hierarchy block |
| D5 | before/after selected | gaze block carries BEFORE/AFTER split |
| D6 | carousel / batch / retargeting / reflow / edit path | same single injection point applies; blocks appear once per rendered item |
| D7 | `9:16` aspect ratio | gaze block carries the vertical-composition note |
| D8 | both providers (`MODEL_PROVIDER` gemini / openai) | injection is unchanged (no provider branch around the block) |

**Blocked behaviors**: injecting gaze/mood when no hook (D2); duplicating blocks; placing the block before the identity rule; altering the copy-fidelity contract, cultural-compliance scan, or Arabic RTL handling.

**Acceptable variation**: block ordering among gaze/mood/one-highlight/price may vary as long as all required blocks are present and all sit after BLUEPRINT + identity.

**Fail conditions**: no-hook generation that contains a gaze or mood block; hook generation missing the gaze block; any size variant (Phase 17) missing guidance the single-size run has.

## Contract E — Audit trace (`ResolutionTrace.gazeDirection`)

Recorded in `generateFinalAd()` beside `expressionAdaptation`.

| # | Given | Then |
|---|---|---|
| E1 | gaze directive resolved | `gazeDirection = { source, sourceId, treatment, applied:true }` |
| E2 | no hook/objection | `gazeDirection = { source:null, sourceId:null, treatment:null, applied:false, reason:"no-hook-or-objection-active" }` |
| E3 | fallback id | `source:"fallback"`, `applied:true` |
| E4 | legacy generation doc without the field | reads as absent → treated as not applied (no migration) |

**Blocked behaviors**: writing a non-additive/breaking schema change; using anything other than `null` as the absent sentinel.

**Fail conditions**: `applied:true` with null treatment; trace omitted for a hero-bearing generation.

## Contract F — Guardrails (regression)

| # | Invariant |
|---|---|
| F1 | Face-identity rule remains priority #1; no Phase 19 block reorders or weakens it. |
| F2 | Phase 28 expression block still present and correct alongside gaze (both injected, non-contradictory). |
| F3 | Existing test suites (`expressionMap`, mode/format validator, etc.) pass unchanged. |
| F4 | Commenting out the injection line + mapper returning null restores exact pre-Phase-19 output. |
| F5 | Cultural compliance, Arabic RTL, Phase 23 anti-sameness, Phase 24B optional copy fields unchanged. |
