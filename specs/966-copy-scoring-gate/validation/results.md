# Phase 22 Sign-off Results

> **Status: pending**. This file is populated by T077–T080 after the
> gate is deployed behind `COPY_SCORING_ENABLED = true` and a non-
> production project is provisioned. The numbers below are the
> targets; once T075-T080 land, they are replaced with measured
> values + their confidence intervals.

## Methodology

| Component | Tool | Model | Notes |
|---|---|---|---|
| Sample capture (gate-on + gate-off paired) | `scripts/copyQualitySample.mjs` | live generation | 50+ samples, both languages, multiple offer types |
| Reading level + lived-symptom verdict | `scripts/copyQualityJudge.mjs` | Gemini (different model — SC-002a) | prompt shares NOTHING with the gate's scorer |
| Human spot-check | `validation/spot-check.md` (pending) | n/a | 10 fixed samples, both languages; human verdict wins ties |

The judge and the gate use **different models** (OpenAI vs Gemini) and
**different prompts** (per SC-002a), so neither source of circularity
survives. Where the human disagrees with the judge, the human verdict
wins; the judge prompt is corrected and the sample re-scored before
the final figures ship.

## Targets vs. measured (placeholders)

| SC | Description | Target | Measured | Pass |
|---|---|---|---|---|
| SC-001 | On-creative strings at ≤ 6th-grade reading level | ≥ 90% | _pending_ | _pending_ |
| SC-002 | Lived-moment share vs gate-off baseline | +30 pp | _pending_ | _pending_ |
| SC-003 | Induced gate-failure runs (5 modes) — generation succeeds, original copy, no error | 100% | _pending_ | _pending_ |
| SC-004 | Credit cost gate-on vs gate-off | identical | _pending_ | _pending_ |
| SC-005 | Ceilings: ≤ 5 per copy set, ≤ 10 per run, ≤ 2 passes | 100% | _pending_ | _pending_ |
| SC-005b | 36-item batch = single-ad interaction count | 100% | _pending_ | _pending_ |
| SC-005a | Refresh / precision / per-field edit byte-identical gate-on vs gate-off | 100% | _pending_ | _pending_ |
| SC-006 | Median end-to-end time + ≤ 20% vs baseline; no generation exceeds existing timeout at max sizes | ≤ 20% | _pending_ | _pending_ |
| SC-006a | Approved copy = rendered copy (gate-attributable divergence only) | 100% | _pending_ | _pending_ |
| SC-006b | Rewritten block parses; same variation count as original | 100% | _pending_ | _pending_ |
| SC-006c | Approved hook block byte-identical through slide step | 100% | _pending_ | _pending_ |
| SC-007 | Zero advertiser-visible change | 100% | _pending_ | _pending_ |
| SC-008 | Zero new copy-fidelity failures attributable to gate-improved copy | 0 | _pending_ | _pending_ |
| SC-009 | Audit trail alone sufficient to reconstruct gate outcome | 100% | _pending_ | _pending_ |
| SC-010 | Untouched text byte-identical; transcribed testimonials never altered | 100% | _pending_ | _pending_ |
| SC-011 | Zero regressions in anti-fabrication + cultural compliance | 0 | _pending_ | _pending_ |
| SC-012 | No stale claim flag survives a rewrite; new fabrications are flagged | 100% | _pending_ | _pending_ |
| SC-013 | Sustained outage detectable from monitoring within 1 hour | yes | _pending_ | _pending_ |
| SC-014 | Zero CTA / benefit rewrites on lived-symptom grounds | 0 | _pending_ | _pending_ |

## Sample distribution (T077)

_Pending capture._

## Spot-check results (T079)

_Pending — `validation/spot-check.md` is created at sign-off with the documented 10-sample bilingual spot-check details. Until then this section is empty and SC-001 / SC-002 measurements must be read as "automated-judge only; human spot-check pending"._

_Pending product-owner review._

## Notes / drift from spec

_None yet. Update as the sign-off measurement runs reveal drift that the
implementation must accommodate._