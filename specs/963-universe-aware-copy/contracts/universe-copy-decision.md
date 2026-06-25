# Behavior Contract: Universe-Aware Copy Decision

**Type**: Internal pure-function + prompt-emission contract (no external API surface).
**Owner module**: `functions/src/universeCopyMap.ts` (decision + block builders) consumed by `functions/src/generators.ts`.
**Constitution**: satisfies Principle IV (explicit pass/fail), VI/VII (auditable, traced).

This is the authoritative pass/fail table. The test file `functions/src/__tests__/universeCopyMap.test.ts` MUST encode every row.

---

## Contract A — Decision function (`resolveUniverseCopyDecision`)

**Required inputs**: `{ styleFamily, referenceAdPresent, isTextOnly, isCarouselNonHookSlide }`.
**Required output**: `{ applied, styleFamily, reason }` with `styleFamily` echoed back unchanged (never null) and `reason` from the canonical union.

| # | styleFamily | refAd | textOnly | nonHookSlide | → applied | → reason |
|---|-------------|-------|----------|--------------|-----------|----------|
| A1 | fantasy | false | false | false | **true** | `fantasy-universe-metaphor-active` |
| A2 | realistic | false | false | false | false | `realistic-no-metaphor` |
| A3 | minimal | false | false | false | false | `minimal-no-metaphor` |
| A4 | fantasy | **true** | false | false | false | `reference-ad-override` |
| A5 | realistic | **true** | false | false | false | `reference-ad-override` |
| A6 | fantasy | false | **true** | false | false | `text-only-mode` |
| A7 | fantasy | false | false | **true** | false | `carousel-non-hook-slide` |
| A8 | fantasy | **true** | false | **true** | false | `reference-ad-override` (precedence: refAd beats slide) |
| A9 | fantasy | false | **true** | **true** | false | `text-only-mode` (precedence: textOnly beats slide) |
| A10 | unknown/garbage → resolves to realistic | false | false | false | false | `realistic-no-metaphor` |

**Blocked behaviors**: never returns a `reason` outside the canonical union; never returns `applied:true` for a non-fantasy family; never returns `applied:true` when any suppression flag is set; never returns null/empty `styleFamily`.

**Acceptable variation**: none — the table is total and deterministic.

**Fail conditions**: any output disagreeing with the table; any thrown error for any input combination (function must be total).

---

## Contract B — Copy-block emission at the two `generateTOV` sites

**Rule**: For each site (mode `initial` ~L1899, mode `refresh` ~L2020), the assembled prompt MUST contain:
- the **RELAXED** fantasy block **iff** the decision is `applied:true`;
- the **STRICT** block **iff** the decision is `applied:false`.

| # | Decision `applied` | initial site | refresh site |
|---|--------------------|--------------|--------------|
| B1 | true (fantasy active) | relaxed block present, strict absent | relaxed line present, strict line absent |
| B2 | false (any literal/suppressed) | strict block present, relaxed absent | strict line present, relaxed line absent |

**Pass/fail**: assert on the assembled prompt string (or on the block-builder outputs). The strict text MUST be byte-identical to today's text (lifted verbatim into the shared constant) — Contract E reversibility depends on this.

---

## Contract C — Blueprint visual-coherence instruction

**Rule**: When (and only when) `applied:true`, the visual-coherence instruction ("if the copy uses a universe metaphor, describe one matching visual element so the image renders it coherently") MUST reach the **rendered-image prompt (TECHNICAL_PROMPT)** — i.e. it must be injected at the actual scene-authoring site (confirm which of `generateConcepts` ~L3100 / `generateBuildPlan` ~L4370 authors the rendered scene; Phase 28 used `generateConcepts`). Injecting only into a build plan that does not flow into the TECHNICAL_PROMPT FAILS this contract. When `applied:false`, the instruction MUST be absent.

| # | Decision `applied` | blueprint instruction |
|---|--------------------|-----------------------|
| C1 | true | present |
| C2 | false | absent |

**Fail condition**: instruction present on a realistic/minimal/suppressed run (would risk metaphor leakage into a literal image), or absent on a fantasy-active run (FR-005 violation — incoherent image).

---

## Contract D — Resolution-trace write

**Rule**: Every generation writes `ResolutionTrace.universeAwareCopy = decision` (the exact object from Contract A), assembled in `generateFinalAd()` next to `expressionAdaptation`/`gazeDirection`.

| # | Scenario | Trace written |
|---|----------|---------------|
| D1 | fantasy single, no ref ad | `{ applied:true, styleFamily:'fantasy', reason:'fantasy-universe-metaphor-active' }` |
| D2 | realistic single | `{ applied:false, styleFamily:'realistic', reason:'realistic-no-metaphor' }` |
| D3 | minimal single | `{ applied:false, styleFamily:'minimal', reason:'minimal-no-metaphor' }` |
| D4 | fantasy + reference ad | `{ applied:false, styleFamily:'fantasy', reason:'reference-ad-override' }` |
| D5 | fantasy text-only | `{ applied:false, styleFamily:'fantasy', reason:'text-only-mode' }` |
| D6 | fantasy carousel hook slide (idx 0) | `{ applied:true, styleFamily:'fantasy', reason:'fantasy-universe-metaphor-active' }` |
| D7 | fantasy carousel slide 2+ (idx>0) | `{ applied:false, styleFamily:'fantasy', reason:'carousel-non-hook-slide' }` |

**Type contract**: `types.ts` defines optional `universeAwareCopy?` with `applied:boolean`, `styleFamily:'fantasy'|'realistic'|'minimal'`, `reason:string-union`. Legacy docs without the field are valid (no migration).

---

## Contract E — Reversibility

**Rule**: With the feature neutralized (mapper returns strict-for-all + `applied:false`, blueprint instruction suppressed), the emitted copy prompts and blueprint prompts are **byte-identical** to pre-Phase-27 output for fantasy, realistic, and minimal alike; the strict text retained as a commented original at each site matches the shared constant.

| # | Check |
|---|-------|
| E1 | Shared `STRICT_METAPHOR_BLOCK` constant === the original L1899–1915 text (byte-for-byte). |
| E2 | Shared strict refresh line === the original L2020 text (byte-for-byte). |
| E3 | Neutralized mapper → fantasy run emits the strict block (proving the swap is the only behavior change). |

---

## Out-of-contract (explicitly NOT tested here)

- Whether Gemini actually produces a subtle metaphor (advisory; QA/manual only — clarification).
- Image rendering quality (manual QA on localhost + production).
- `validateCopyFidelity` behavior (unchanged — FR-015).
- Gaze (Phase 19) / expression (Phase 28) blocks (untouched — FR-014).
