# Phase 0 Research: Universe-Aware Copy

All open questions from the spec were resolved in the `/clarify` session (2026-06-25). This file consolidates the technical findings (exact code anchors) and the resolved decisions so the implementer (Minimax — no memory) has full context.

## Resolved Clarifications (from spec § Clarifications)

| Question | Decision | Rationale |
|----------|----------|-----------|
| Meaning of `applied: true` | **Prompt-level** — the relaxed block was emitted, not output-verified | Deterministic + testable by prompt inspection; matches Phase 19/28 trace precedent. |
| `styleFamily` when suppressed | **Always the resolved family** (never null) | Audit clarity — see "it WAS fantasy but X overrode it". |
| Subtlety "one metaphor" limit | **Advisory** prompt guidance only (no new pass) | Consistent with all other copy-style rules; honors "no new parallel path" (FR-011). |

## Code Anchors (verified in this worktree)

### Decision 1 — Two existing `METAPHOR RULE` sites live in `generateTOV()`
- **Rationale**: Both anti-metaphor blocks are inside `generateTOV()` (`functions/src/generators.ts`, defined ~L1701). `resolvedUniverse` is a function parameter; `resolveStyleFamily(inputs)` and `inputs.customUniverseDetails` are in scope at both sites.
  - **Site A — `mode === 'initial'`**: the full block at **L1899–1915** ("⚠️ METAPHOR RULE (ABSOLUTELY CRITICAL)…"). `resolveStyleFamily` already called inline at L1872 (`isMinimal`).
  - **Site B — `mode === 'refresh'`**: the compressed single line at **L2020** ("- UNIVERSE/THEME USAGE: …"). `resolveStyleFamily` already called inline at L2019.
- **Alternatives considered**: A single shared injection further downstream — rejected because the two sites are distinct prompt contexts (fresh generation vs. refinement) and both must honor the same decision; lifting the strict text into a shared mapper constant and swapping at each site keeps one source of truth without inventing a new path.

### Decision 2 — Blueprint visual-coherence instruction goes into `generateConcepts()` and/or `generateBuildPlan()`
- **Rationale**: `generateConcepts()` (~L2928) builds the concept/TECHNICAL_PROMPT with a `UNIVERSE LOGIC & COSTUME RULES` block (L2973–3083). `generateBuildPlan()` (~L4370) carries the universe context (L4442–4467) into the build plan. Both already receive `resolvedUniverse` + `resolveStyleFamily(inputs)`. Injecting "if the copy uses a universe metaphor, describe a matching visual element" here makes the rendered image coherent (FR-005) WITHOUT touching `buildFinalImagePrompt` structure (FR-014).
- **Alternatives considered**: Injecting in `buildFinalImagePrompt` — rejected by FR-014 (image-prompt builder structure must not change; the blueprint already flows through it). Tasks decide whether one or both of concepts/build-plan need the instruction based on which actually authors the rendered scene text; default is to add to the build-plan path that feeds the technical prompt, and mirror into concepts if needed for coherence.

### Decision 3 — Trace write mirrors `expressionAdaptation` / `gazeDirection`
- **Rationale**: In `generateFinalAd()` the trace is assembled at **~L5605–5621** (`expressionAdaptation`) and **~L5658–5676** (`gazeDirection`) via `_lastResolutionTrace = { ...(_lastResolutionTrace||{}), <field>: {...} }`. A sibling `universeAwareCopy: { applied, styleFamily, reason }` write follows the identical pattern. The `ResolutionTrace` interface is in `functions/src/types.ts` (`expressionAdaptation?` L413–419, `gazeDirection?` L436–442); add `universeAwareCopy?` immediately after (~L443).
- **Alternatives considered**: Writing the trace inside the mapper — rejected; the mapper stays pure/side-effect-free. The decision object it returns is what gets spread into the trace.

### Decision 4 — Helper signals already exist
- `resolveStyleFamily(inputs): 'realistic'|'fantasy'|'minimal'` — `generators.ts:309`.
- `isTextOnlyMode(inputs): boolean` — `generators.ts:562` (`offerCreativeMode` includes `'text_only'`).
- Reference-ad presence — `!!(inputs as any).referenceAd` (pattern used at L323, L958); resolver also exposes `referenceAdOverrideActive` (~L5678) as a stronger signal. Tasks pick the canonical one (prefer the resolver flag if present, else the truthy input check).
- Carousel slide index — `carouselSlideIndex` on the build-final-prompt input (~L5686/L5691); hook slide = `0`, suppress when `> 0`. Per-slide trace array exists at `types.ts` `perSlide` (~L5160).

### Decision 5 — Custom universe is already first-class in the copy scope
- **Rationale**: `inputs.customUniverseDetails` is used at L1875–1877 and takes priority over `resolvedUniverse` ("CUSTOM UNIVERSE (TOP PRIORITY)"). A fantasy custom universe therefore feeds the relaxed block's vocabulary directly (US6 / FR-006). The mapper's `buildFantasyMetaphorCopyBlock` accepts both and prefers custom text when present.

### Decision 6 — Test harness pattern
- **Rationale**: `functions/src/__tests__/gazeMap.test.ts` and `expressionMap.test.ts` are pure (no Gemini), use a local `assert(condition, label)` shell with a pass/fail counter, organized into Contracts A–E, compiled by `tsc` and run via `node lib/__tests__/<name>.test.js` (and `npm test`). `universeCopyMap.test.ts` follows the same shell.
- **Alternatives considered**: Adding a heavyweight test framework — rejected; the repo's convention is the lightweight assert shell, and the mapper is pure so it needs nothing more.

## Universe vocabulary source (FR-006)
Each `src/universeDatabase.ts` entry carries `visualMotifs`, `aspirationSignals`, `tone`, and `styleFamily`. The relaxed block does NOT need to read the database directly — `resolvedUniverse` (the universe name/description string) already flows into the copy prompt, and Gemini draws subtle vocabulary from it plus any `customUniverseDetails`. Pulling raw motif arrays into the prompt is optional and deferred unless QA shows the metaphor is too generic.

## Open risks / watch-items for QA
- **Arabic guardrail interaction**: the relaxed block must not weaken the no-leading-و / self-contained-phrase rules (NFR-005). Mitigation: relaxed block restates the Arabic-quality reminder.
- **Over-aggressive metaphor**: advisory only; caught in localhost + production QA, not code. Acceptable per clarification.
- **Carousel slide-index availability**: confirm the index variable is in scope at the chosen blueprint injection site (tasks verify before wiring).

**Output**: All NEEDS CLARIFICATION resolved. Ready for Phase 1 design artifacts.
