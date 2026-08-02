# Specification Quality Checklist: Phase 22 — Copy Quality Upgrade (Silent Scoring & Rewrite Gate)

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-01
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 1 (2026-08-01) — findings and resolutions:**

1. *No implementation details* — PASS with one deliberate exception. The **Baseline** table cites concrete file paths and line numbers. This is intentional and load-bearing: the user's request asked for three changes, two of which are already merged. The evidence column is what makes that claim auditable rather than an assertion. The Baseline table is a verification record, not a requirement; every FR and SC stays technology-agnostic. The Assumptions section names "an OpenAI credential is already provisioned" — retained because it is a genuine external dependency, which the template's own guidance directs to be recorded there.

2. *Success criteria technology-agnostic* — PASS. Reworded during drafting: no model names, function names, or field names appear in any SC. SC-006 expresses latency as a percentage of the existing baseline rather than an absolute millisecond figure.

3. *Requirements testable* — PASS. FR-006 and FR-009 carry the exact numeric thresholds from the launch matrix, so "below threshold" is decidable. FR-013/FR-014 (silence) are verified by SC-007 as an observational test.

4. *Scope bounded* — PASS. Out-of-scope is stated three ways: FR-025 (captions), the final Assumption (Phase 23), and FR-022/FR-024 (fidelity contract and renderer untouched).

**Iteration 2 (2026-08-01) — clarifications resolved. Checklist complete, 16/16.**

Both open markers were answered by the product owner and folded into the spec:

- **FR-002 (rubric)** → the **9** launch-matrix dimensions. New FR-002a explicitly excludes the 6 Phase-23 dimensions and requires the seeded constant to be annotated rather than rewritten, preserving the Track-1 drift-control discipline (edit the reference first, then sync).
- **FR-019 (surfaces)** → **initial generation across all formats** (single, carousel, batch, retargeting). New FR-019a excludes refresh / precision / per-field edit; new FR-019b sets the multi-item ceiling at 3 scoring interactions × item count with per-item failure isolation.

Follow-on additions from those answers: a Clarifications section recording all three Q&As; Story 3 acceptance scenario 4 (multi-item ceiling + failure isolation); SC-005 restated in concrete numbers; new SC-005a proving excluded paths are byte-identical gate-on vs gate-off; two Edge Cases sharpened; two Assumptions added.

**Carried risk for `/speckit.plan` to resolve (not a spec defect):**

The refresh, precision, and per-field edit paths share a single generator entry point with initial generation, distinguished only by a mode parameter. FR-019a's exclusion is therefore enforced at a call-site distinction that is easy to get silently wrong — a miss produces no error, just overwritten advertiser copy. The plan should treat this as a first-class contract with its own test coverage (SC-005a), not as an incidental branch.

**Iteration 3 (2026-08-01) — `/speckit.clarify` pass. 5 further questions asked and answered; checklist remains 16/16.**

The clarify scan found 5 Partial categories that the specify pass had left underdetermined. All 5 are now resolved and integrated:

| # | Gap | Resolution | Spec impact |
|---|---|---|---|
| 1 | Scoring unit & the vestigial word "applicable" in FR-006 | All 9 dimensions scored on every present field; average is per-field; "applicable" dropped | FR-006 rewritten; Assumptions |
| 2 | Rewrite interactions were unbounded | One rewrite call per pass covering all failing fields; ceiling 5 model interactions per copy set | FR-007, FR-018, new FR-018a, FR-019b, Story 3 §3–5, SC-005 |
| 3 | "Bounded time budget" had no number | 8s / interaction, 20s / copy set, 60s / run | FR-016 rewritten, new FR-016a/FR-016b, Story 2 §2 and §2a, SC-006 |
| 4 | Kill-switch scope and lifetime undefined | Permanent, global, env-level, default on, no cohort granularity | New **Operational control** block FR-019c–FR-019f; Assumptions |
| 5 | SC-001/SC-002 "independent assessment" had no assessor | Independent judge (different prompt/model) over all 50 + product-owner spot-check of 10 | New SC-002a; SC-001/SC-002 trimmed; 2 Assumptions |

**The circularity catch (item 5)** is the most consequential of the five. SC-001 and SC-002 were the phase's proof-of-value criteria, and as originally written they could have been satisfied by re-scoring the output with the gate's own scorer — the very judge the gate rewrites until it satisfies. That would have made both criteria unfalsifiable. SC-002a now forbids it explicitly and gives the human spot-check the tie-breaking vote.

**Supersession note:** the multi-item bounding bullet in Clarifications originally recorded a 3 × item-count run ceiling. Item 2 raised the per-copy-set ceiling to 5, so that bullet was rewritten in place rather than left to contradict FR-018. No obsolete figure remains anywhere in the spec.

**Iteration 4 (2026-08-01) — second `/speckit.clarify` pass. 5 further questions; checklist remains 16/16.**

This pass traced the actual generation flow in code rather than reading the spec on its own terms, and found gaps the first two passes could not have seen from the spec text alone.

| # | Gap | Resolution | Spec impact |
|---|---|---|---|
| 6 | Gate placement relative to Step-2 approval was never stated | Runs at copy generation, before review; never after approval; raw block rewritten in place | New **Gate placement** block FR-000–FR-000c; FR-001; Edge Cases; SC-006a/SC-006b |
| 7 | "Copy set" assumed one set per item, but generation emits 4 variations | Copy set = all variations of one item, scored together; ceilings unchanged | Key Entities (3 entries); FR-018a; new FR-018b; Story 3 §3–4 |
| 8 | Claim-flag re-evaluation was an Edge Case with no requirement | Rewrite interaction re-emits flags for fields it changed; no extra interaction | New FR-011a–FR-011c; Edge Cases; SC-012 |
| 9 | Gate now runs before the cultural scan that runs after approval | Gate applies substitution rules to its own rewrites; existing scan untouched as safety net | New FR-012a/FR-012b; SC-006a rescoped; 2 Edge Cases |
| 10 | Silent gate + fail-open = invisible total outage | One structured log line per outcome, alertable via existing monitoring | New FR-020a/FR-020b; SC-013 |

**Item 6 was the load-bearing one.** `generateTOV` emits variations `HOOK_START_A`–`D` as one raw text block; the interface parses it for review, and only after approval does `generateFinalAd` extract the four render fields from the approved variation (`generators.ts:6201`). The spec never said which side of that boundary the gate sits on. Had it landed after approval, the advertiser would approve one headline and a different one would render — a WYSIWYG break that no audit trail can explain to a customer.

**Item 7 followed directly and would have broken the budgets.** Gating every variation means a "copy set" of one variation would have made a single ad generation 4 sets — 20 interactions and ~80s, overrunning the 60s run budget ratified one pass earlier. Redefining the copy set as all variations of an item preserves every number already agreed.

**Item 9 corrected a contradiction introduced during this same pass.** SC-006a was written as "approved copy is byte-identical to rendered copy," but `scanAndReplace(…, "adCopy")` at `generators.ts:5185–5209` already alters approved copy after the fact, independently of this feature. SC-006a is now scoped to divergence *attributable to the gate*, and FR-012b explicitly forbids this feature from relocating the existing scan to chase a pre-existing issue.

**Iteration 5 (2026-08-01) — third `/speckit.clarify` pass. 2 questions asked (quota not exhausted — see below); checklist remains 16/16.**

| # | Gap | Resolution | Spec impact |
|---|---|---|---|
| 11 | **Internal contradiction**: FR-000a forbade gating after approval, FR-019 required gating carousel slide copy — which is authored after approval | Rule scoped per copy-producing step; slide generation is its own copy set with its own ceiling and budget | FR-000/FR-000a rewritten; new FR-000d; Key Entities (copy set redefined, "copy-producing step" added); Edge Cases; SC-006c |
| 12 | Lived-symptom hard floor applied to CTA and benefit, which carry no lived moment by design | Reading level gates all fields; lived-symptom gates only headline, subheadline, slide captions; scored-but-not-gated elsewhere | FR-003 split into FR-003/FR-003a/FR-003b; FR-006 rewritten; first clarification bullet annotated as superseded; Assumptions; SC-014 |

**Item 11 was a genuine contradiction, not an ambiguity.** `serverGenerateCarouselSlideCopies` (`index.ts:5162`) is a separate callable consuming `approvedTov`, so slide captions are authored *after* hook approval. FR-000a as written forbade exactly that, while FR-019 required it. The fix reframes the guarantee being protected — "the advertiser reviews what renders," not "one gate pass per generation."

**Item 12 corrects an over-broad decision made in Iteration 3.** The "all 9 dimensions on every field" answer (Q1 of the first clarify pass) combined with FR-003's hard ≥7 floor would have failed every CTA and benefit line on lived-symptom depth, rewriting them on essentially every generation and manufacturing pain language into buttons. Scoring stays universal so the tuning data survives; only the gating narrowed.

**Why only 2 questions this pass.** The remaining candidates were examined and rejected as non-material: the semantic-lock parameter applies only to the refresh/precision paths the gate already excludes (FR-019a); a wrong-language or malformed rewrite is already covered by FR-015's fail-open on "unusable rewrite"; and the missing evaluation credential on the carousel callable is an implementation detail for `/speckit.plan`, not a spec decision. Asking further would have been manufacturing questions to fill a quota.

**Iteration 6 (2026-08-01) — fourth `/speckit.clarify` pass. 2 questions asked; checklist remains 16/16.**

Both findings came from tracing callable boundaries in `index.ts`, not from re-reading the spec. Both invalidate previously ratified content.

| # | Gap | Resolution | Spec impact |
|---|---|---|---|
| 13 | **Ratified ceiling was wrong**: FR-019b scaled gate cost by item count, but batch authors no copy per item | Ceiling is per copy-producing step; hard maximum 10 interactions per run, independent of batch size and slide count | FR-019 and FR-019b rewritten; Story 3 §5–6; Edge Cases; SC-005; new SC-005b; superseded clarification bullet rewritten |
| 14 | **Uncovered copy-producing step**: testimonial carousel authors its own hook and close | Gated as its own copy set; transcribed testimonial content declared untouchable | New FR-000e/FR-000f; Key Entities ("untouchable text" added, copy-producing step extended); Edge Cases; SC-010 |

**Item 13 corrects a number ratified two passes earlier.** There is exactly one `generateTOV` call site (`index.ts:4231`). Batch is N calls to `generateFinalAd` with `batchIndex`/`batchN` runtime-injected (`generators.ts:6132, 7520`), all consuming the same approved TOV — so a 36-item Scale batch adds zero copy-producing steps. The old bound implied up to 180 interactions per run and justified bounded-parallelism machinery that is not needed; the real hard maximum is 10.

**Item 14 found on-creative text that would have shipped ungated.** `generateTestimonialCarousel` authors `hookText` (`generators.ts:9823`) and a closing line (`9845`) from its own prompts (`HOOK_TEXT:` at `9974–9986`) and takes no `approvedTov`, so neither of the two steps named in FR-019 covered it. The same investigation surfaced a safety boundary the spec had no concept for: that mode also transcribes advertiser-supplied testimonial screenshots. Rewriting a real customer's quote to raise its score would fabricate a testimonial that was never given. FR-000f and the new "untouchable text" entity make that explicit, and SC-010 now asserts zero transcribed strings are ever altered.

**Housekeeping:** the superseded per-item ceiling bullet in Clarifications was rewritten rather than left contradicting FR-019b, and the FR-000 series was reordered to a–f.

Final state: 17 clarification Q&As, 53 FRs, 20 SCs, 0 open markers, 0 internal contradictions.

Spec is ready for `/speckit.plan`.
