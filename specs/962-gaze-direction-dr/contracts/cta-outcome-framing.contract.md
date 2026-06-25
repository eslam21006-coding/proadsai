# Contract: CTA Outcome Framing (copy prompt)

Advisory guidance added to the existing Gemini CTA/benefit block (`generators.ts:~2478-2516`). Copy-only; no new field; both languages. The guidance text is an exported constant `CTA_OUTCOME_FRAMING_BLOCK` defined in the side-effect-free `gazeMap.ts` and imported by `generators.ts`, so Contract G is deterministically testable without importing the heavy `generators.ts` module.

## Contract G — Copy prompt guidance

**Required inputs**: existing copy-generation context (brief, CTA, challenges, target audience, ad language).

**Required output**: the copy prompt text contains an outcome-framing instruction for the CTA/benefit.

| # | Given | Then |
|---|---|---|
| G1 | copy prompt assembled | contains instruction to frame the CTA/benefit around an OUTCOME or benefit, not just the bare action |
| G2 | guidance text | states it is advisory — a direct-action CTA is still allowed when it reads better |
| G3 | guidance text | keeps CTA/benefit short (≈3–5 words) and action-oriented; length adapts per language |
| G4 | Arabic path | existing Arabic grammar/flow rules preserved (no leading و, self-contained phrase) — NOT weakened |
| G5 | English path | the same outcome-framing guidance applies (both languages) |

**Blocked behaviors**: turning outcome framing into a hard rule that overrides the model's context judgment; removing/altering the existing banned-benefit-pattern rules; changing the copy-fidelity contract or any Phase 24B optional field; introducing a separate CTA-rewrite model call.

**Acceptable variation**: exact wording of the instruction; whether a given generated CTA is outcome-framed or direct (model decides per context).

**Fail conditions**: outcome framing applied as a mandatory override; Arabic grammar rules dropped; English copy left entirely unguided; a new model call added.

## Verification note (qualitative)

Because copy is model-generated, G1–G5 are verified by (a) asserting the guidance string is present in the assembled prompt (deterministic, unit-testable) and (b) the quickstart before/after sampling showing outcome-hinted CTAs appear where natural while direct actions still appear where they fit (SC-005).
