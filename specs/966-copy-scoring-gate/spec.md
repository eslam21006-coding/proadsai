# Feature Specification: Phase 22 — Copy Quality Upgrade (Silent Scoring & Rewrite Gate)

**Feature Branch**: `966-copy-scoring-gate`
**Created**: 2026-08-01
**Status**: Draft
**Input**: User description: "Phase 22 — Copy Quality Upgrade (CRITICAL). Three changes: (1) reading-level control ≤6th grade for all on-creative text, Arabic and English; (2) lived-symptom depth — concrete lived moment, never an abstract problem label; (3) a silent GPT-4o-mini scoring + rewrite gate that runs after copy generation, scores each string, rewrites below-threshold strings, and fails open. Backend only. Rides the existing copy-fidelity contract. Captions out of scope."

> **Authority:** This feature implements **Track 2 (Copy SCORING/REWRITE)** of `specs/_shared/COPY_SYSTEM_REFERENCE.md` and completes `docs/LAUNCH_MATRIX.md` Section 14 (Phase 22), specifically the two tasks left open by the earlier Track 1 delivery: **22.9 (silent scoring pass)** and **22.10 (rewrite loop)**. Where this spec and the reference disagree, the reference wins and this spec must be corrected.

## Baseline — What Already Exists (verified in code, 2026-08-01)

The requested changes 1 and 2 are **already implemented and merged**, delivered by `specs/958-copy-quality/` (Track 1). Verification against the current `main`:

| Requested change | Current state | Evidence |
|---|---|---|
| 1. Reading level ≤6th grade | **DONE** — `READING_LEVEL_BLOCK` exists and is injected into all four on-creative copy prompt surfaces (three inside the main copy generator covering headline / subheadline / CTA / benefit for single and retargeting copy, one inside the carousel slide-copy generator). Covers Arabic (simple spoken-style فصحى) and English, with per-field word caps. | `copywriting_knowledge.ts:702`; injected at `generators.ts:2059, 2830, 2881, 8949` |
| 2. Lived-symptom depth | **DONE** — `LIVED_SYMPTOM_BLOCK` exists with weak→strong example pairs and a raw-material sourcing rule (pull the moment from the pain-points and audience inputs). Injected into the same four surfaces. | `copywriting_knowledge.ts:719` |
| Soft fabrication flag | **DONE** — `FABRICATION_POLICY_BLOCK` + banned-CTA guidance injected; claim flags parsed out of the model response and carried on the generation result. Hard compliance guards (honest degradation, NUMERIC FACT VIOLATION repair) retained above the soft flag. | `copywriting_knowledge.ts:739, 772`; `generators.ts:814, 855, 6202` |
| 3. Silent scoring + rewrite gate | **NOT DONE** — `COPY_SCORING_DIMENSIONS` and `COPY_REWRITE_DIAGNOSES` exist as *seeded, deliberately unconsumed* constants. No executing code path scores or rewrites copy. | `copywriting_knowledge.ts:782, 808` (both self-describe as "SEEDED … NOT consumed by any executing code path in this phase") |

Therefore this feature's **build work is change 3**. Changes 1 and 2 are in scope only as **enforcement**: the gate is what turns those two written rules from prompt guidance the model may drift from into an outcome that is measured and corrected on every generation. Both rules are today unenforced — nothing detects when the model ignores them.

## Overview

Every on-creative text string is decided at the copy-generation step and then carried, unchanged, all the way to the rendered image by the existing copy-fidelity contract (the generator writes the strings → prompt assembly injects them verbatim → an exact-match gate enforces them with up to 3 retries → the compositor renders them). Because that contract guarantees the exact strings survive to the image, **improving the words at the generation step propagates to the final design automatically** — no design-phase, compositor, or interface work is required.

Today, copy quality at that step is governed only by instructions in a prompt. When the model produces a headline that reads at a university level, or states the problem as an abstract category instead of a lived moment, nothing notices and the weak string ships to the image verbatim — the fidelity contract faithfully protects bad copy exactly as well as good copy.

This feature adds a **silent quality gate** between copy generation and the fidelity contract. Every generated on-creative string is scored; strings that fall below threshold are diagnosed and rewritten; the improved strings enter the fidelity contract in place of the originals. The gate is invisible — advertisers never see a score, a rewrite notice, or a new control. It simply makes the copy better. If the gate errors, times out, or returns anything unusable, the originally generated copy ships unchanged.

## Clarifications

### Session 2026-08-01

- Q: The seeded scoring rubric lists 15 dimensions; launch-matrix task 22.9 lists 9, and four of the 15 (hook-angle fit, format fit, visual compatibility, objection handling) are documented as Phase 23 concerns. Which set does this phase score? → A: **The 9 from launch-matrix 22.9.** Audience specificity, pain/desire relevance, clarity, scroll-stopping tension, wording specificity, offer relevance, non-generic language, reading level, lived-symptom depth. This matches the matrix exactly and matches Phase 23 task 23.9's instruction to *add* format-fit / hook-angle-fit / visual-compatibility / objection-handling to the Phase 22 gate later. The seeded 15-dimension constant is annotated to mark which 6 are deferred; its text is not rewritten.
- Q: Which generation surfaces does the gate cover? → A: **Initial generation only, across all formats** — single, carousel slide copy, batch items, and retargeting. The refresh, precision, and per-field edit paths are explicitly excluded: an advertiser who asks for specific wording must not be silently overruled by the gate. Every ad therefore gets gated copy at birth, and every subsequent advertiser-initiated change is theirs.
- Q: Where does the gate run relative to the advertiser's Step-2 approval, given that copy generation emits several hook variations as one raw text block that the interface parses, and only the approved variation is later extracted into the four render fields? → A: **At copy generation, before the advertiser sees Step 2.** Every variation is gated, so the advertiser reviews and approves already-improved copy and what they approve is exactly what renders. The raw text block MUST be rewritten in place — variation markers, structural labels, and claim-flag lines preserved — so the interface's parse of the block and the server-side extraction of the approved variation can never disagree. The gate does NOT run again after approval.
- Q: Now that every variation is gated, what is a "copy set" for the purposes of the interaction ceiling and the time budgets? → A: **A copy set is all variations of one item, scored together.** One scoring interaction covers every present field of every variation; one rewrite interaction fixes all failing fields across all variations. The ceiling therefore stays at 5 model interactions and 20 seconds per item, exactly as ratified — a single-ad generation remains one copy set, not four. Gating only a subset of variations was rejected: any variation can be the one the advertiser approves, so leaving one ungated defeats the gate.
- Q: Who re-evaluates claim flags when a rewrite changes the text they describe? → A: **The rewrite interaction itself re-emits claim flags for the fields it rewrote**, using the existing claim-flag output contract. Flags on untouched fields carry through unchanged; stale flags on rewritten fields are dropped and replaced by whatever the new text warrants. This costs no extra interaction, so the 5-interaction ceiling is unaffected, and the rewriter is the only actor that knows what it changed. A separate detection pass was rejected because it would add a sixth interaction.
- Q: The existing Arabic-market cultural scan-and-replace runs on the copy fields *after* approval, inside final-ad generation, while the gate now runs *before* review — how do the two interact? → A: **The gate applies the existing substitution rules to its own rewrites, at rewrite time**, so gated copy is already culturally compliant when the advertiser sees it. The post-approval scan is left exactly as it is and simply becomes a no-op for gated copy, preserving it as the safety net. This also stops the gate from spending a rewrite pass polishing text the scan would substitute anyway. Moving the existing scan earlier was rejected as out of scope for this feature. Consequence: the "approved copy equals rendered copy" criterion is scoped to divergence **attributable to the gate** — the pre-existing possibility that the post-approval scan alters approved copy is not introduced by this feature and is not claimed to be fixed by it.
- Q: The gate is silent and fails open, so a total outage (expired credential, provider down) is invisible — how is that detected? → A: **One structured log line per gate outcome** — ran / skipped / failed-open, with cause and pass count — emitted at a level the existing log-based monitoring can query and alert on. No new storage, no new collection, no scheduled job, no interface. This makes "the gate has been failing open for days" alertable instead of discoverable only by manually querying generations.
- Q: Carousel slide captions are authored by a separate step that runs *after* the advertiser approves a hook variation, which contradicts "the gate must not run after approval" while the gate is also required to cover slide copy. How is that resolved? → A: **The rule is scoped per copy-producing step, not per generation.** The gate runs at every step that authors new copy, before that copy is reviewed, and never re-runs on copy already approved. Carousel slide generation is therefore its own copy set with its own 5-interaction ceiling and its own 20-second budget, and the approved hook block is never re-gated. The guarantee being protected was always "the advertiser reviews what renders" — not "one gate pass per generation."
- Q: Lived-symptom depth is a hard floor on every field, but a CTA and a benefit line carry no lived moment by design — would they not be rewritten on every generation? → A: **Yes, and that is corrected here.** Reading level remains a hard floor on all fields, since it applies to any string on the creative. **Lived-symptom depth gates only the headline, the subheadline, and carousel slide captions.** On CTA and benefit it is still scored and recorded — so the data survives for later tuning — but it cannot trigger a rewrite and is excluded from those fields' averages. This supersedes the earlier blanket reading of FR-003/FR-006, which would have manufactured pain language into buttons and burned a rewrite pass on nearly every generation.
- Q: The run ceiling was set at "5 model interactions × item count", but batch generation authors no copy per item — batch items all consume one approved hook block. What is the correct bound? → A: **The ceiling is per copy-producing step, not per item.** Exactly two copy-producing steps exist — hook/variation generation and carousel slide-caption generation — so a run's hard ceiling is **5 × 2 = 10 model interactions**. A batch run adds no copy-producing step: its items share the single hook copy set, so a 36-item batch costs the same gate work as a single ad. The 60-second run budget is therefore comfortable rather than binding, and no bounded-parallelism machinery is required for the gate.
- Q: The testimonial-carousel mode authors its own opening hook and closing line from its own prompts, and separately transcribes advertiser-supplied testimonial screenshots. Is it in scope? → A: **Its authored hook and close are gated; its transcribed testimonial content is not.** The hook and close are generated on-creative text and belong in scope as a third copy-producing step. The transcribed testimonial content is a real customer's own words and MUST never be scored or rewritten — improving a quote's "scroll-stopping tension" would manufacture a testimonial that was never given, which is precisely what the anti-fabrication guards exist to prevent. The run ceiling stays at 10, since a testimonial run does not also invoke the standard slide-caption step.
- Q: Is the 9-dimension rubric applied per field or per copy set, and what does "any other *applicable* dimension" mean now that the conditional dimensions are deferred? → A: **All 9 dimensions are scored on every present field; the average is computed per field.** "Applicable" is vestigial — it came from the 15-dimension rubric where CTA strength / proof strength / objection handling were conditional. With those deferred to Phase 23, the qualifier is dropped: the ≥6 floor applies to all 7 non-hard dimensions on every field. (Later refined — see the lived-symptom-floor answer below: scoring stays universal, but lived-symptom depth gates only headline, subheadline, and slide captions.)
- Q: FR-018 bounds scoring interactions but nothing bounded rewrite interactions — what is the rewrite ceiling? → A: **One rewrite interaction per pass**, covering every failing field in that pass together, each with its own diagnosis. That caps a copy set at **5 model interactions total** — 3 scoring + 2 rewrite. Scoring and rewriting stay separate calls (not fused) so each is independently testable and a malformed response in one does not destroy the other, mirroring the split between the two seeded constants.
- Q: FR-016 required "a bounded time budget" but named no number, leaving the fail-open timeout path untestable. What are the budgets? → A: **Three levels — 8s per interaction, 20s per copy set, 60s per run.** Whichever elapses first abandons the gate for that scope and fails open; remaining items in a multi-item run are left ungated rather than the run being held open. The run-level ceiling exists specifically so a large batch cannot consume the generation callable's own timeout. Budgets are tunable operational values, not product promises.
- Q: What kind of switch provides the gate-disabled baseline that four success criteria compare against, and does it survive to production? → A: **A permanent, global, environment-level flag, default on.** Rollback is flipping the flag — no code revert and no logic redeploy. It has no per-user or per-plan granularity, so every generation gets the same behaviour and the audit data is not split into cohorts. This matches the reversibility pattern the codebase already uses for the visual model provider.
- Q: Who performs the "independent assessment" that SC-001 and SC-002 are measured by? → A: **An independent automated judge over all 50 sampled generations, plus a product-owner spot-check of 10** (a fixed subsample covering both languages). The judge MUST use a different prompt from the gate's scorer, and ideally a different model, because letting the gate's own scorer certify the output is circular — the gate rewrites until that scorer is satisfied, so re-scoring the result with it would prove nothing. The human spot-check covers the case where both automated judges share a blind spot, which matters most for the Arabic half of the sample.
- Q: What bounds gate work on multi-item runs (carousel, batch)? → A: **Gate work is bounded per copy-producing step, never per item.** (This bullet originally set a per-item ceiling of first 3 and then 5 interactions × item count; both figures are superseded by the copy-producing-step answer above, which establishes the hard run ceiling of 10.) Independence still holds: one step's gate failure must not affect the other, and a partially-gated run is a valid outcome.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Below-threshold copy is silently improved before it reaches the ad (Priority: P1)

An advertiser generates an ad. The copy generator returns a headline that is too abstract ("Struggling with lead generation") and a subheadline written above a 6th-grade level. Before the advertiser sees anything, the gate scores those strings, finds them below threshold, diagnoses the weakness (abstract category; reading level too high), and rewrites them into a concrete lived moment in plain words. The advertiser sees only the improved copy, presented exactly as copy has always been presented, with no indication a gate ran.

**Why this priority**: This is the entire value of the feature. Without it, the reading-level and lived-symptom rules remain unenforced suggestions. This story alone is a shippable improvement to every generated ad.

**Independent Test**: Generate ads across several offers and both languages with the gate enabled and disabled. Compare the copy that reaches the ad. With the gate on, sampled copy reads at or below a 6th-grade level and names a concrete lived moment at a materially higher rate. No gate-related text, score, badge, or control appears anywhere in the product.

**Acceptance Scenarios**:

1. **Given** generated copy where the headline states an abstract problem category, **When** the gate runs, **Then** the string that enters the fidelity contract names a concrete recognizable moment instead, and the advertiser is shown only that improved string.
2. **Given** generated copy where every field already meets threshold, **When** the gate runs, **Then** no field is changed and the original strings enter the fidelity contract byte-for-byte.
3. **Given** an Arabic generation, **When** the gate rewrites a field, **Then** the replacement is simple spoken-style فصحى at or below a 6th-grade level and remains grammatically self-contained.
4. **Given** any generation, **When** the advertiser reviews the result, **Then** nothing in the product surfaces a score, a rewrite count, a "quality checked" indicator, or any new setting.

---

### User Story 2 - A failing gate never costs the advertiser a generation (Priority: P1)

The scoring service is slow, unreachable, rate-limited, or returns a malformed response. The advertiser's generation completes normally with the originally generated copy. No error is shown, no credit is lost, no retry is triggered, and the ad ships.

**Why this priority**: Equal to P1 with Story 1. The gate sits on the critical path of a credit-consuming action. A quality improvement that can fail a paid generation is a net loss, and the project's credit-safety principle makes fail-open non-negotiable. This story is what makes Story 1 safe to ship.

**Independent Test**: Force the scoring service to time out, error, return malformed output, and return out-of-range scores. In every case the generation completes with the original copy, one credit is charged exactly as before, and no advertiser-visible error appears.

**Acceptance Scenarios**:

1. **Given** the scoring service is unreachable, **When** a generation runs, **Then** the original copy proceeds into the fidelity contract and the generation succeeds.
2. **Given** the scoring service exceeds a time budget (8s per interaction, 20s per copy set, or 60s per run), **When** that budget elapses, **Then** the gate is abandoned for that scope and the original copy proceeds — the generation is not held open waiting.
2a. **Given** a large batch where the run budget elapses after some items are gated, **When** the run completes, **Then** the gated items keep their improved copy, the remaining items ship their original copy, and the run succeeds.
3. **Given** the scoring service returns unparseable or out-of-range output, **When** the gate evaluates it, **Then** the output is discarded and the original copy proceeds.
4. **Given** a rewrite is produced but is empty, or drops a field that was present, **When** the gate validates it, **Then** the rewrite is rejected and that field keeps its original value.
5. **Given** any gate failure, **When** billing is settled for the generation, **Then** the credit cost is identical to a generation with no gate.

---

### User Story 3 - Rewriting is bounded and never loops (Priority: P2)

Copy that stays below threshold after rewriting does not trigger endless rewriting. The gate makes at most two rewrite passes, then proceeds with the best candidate it has and records that it gave up.

**Why this priority**: Protects latency and per-generation cost. Without the cap, a hard-to-satisfy input could stall a generation indefinitely and burn scoring calls. Depends on Story 1 existing, so it is P2 — but it must ship with it.

**Independent Test**: Feed inputs engineered so rewrites never reach threshold. Confirm exactly two rewrite passes occur, the best-scoring candidate proceeds, and the generation completes within its normal time envelope.

**Acceptance Scenarios**:

1. **Given** copy still below threshold after the first rewrite, **When** the gate re-scores, **Then** at most one further rewrite pass runs.
2. **Given** copy still below threshold after the second rewrite, **When** the gate finishes, **Then** the highest-scoring candidate across the original and both rewrites proceeds, and the shortfall is recorded for audit.
3. **Given** a single copy set (all variations of one item), **When** the gate completes, **Then** it has made at most 5 model interactions — 3 scoring and 2 rewrite — regardless of input, regardless of how many variations it contains, and regardless of how many fields failed.
4. **Given** a copy set where fields fail across several variations, **When** a rewrite pass runs, **Then** exactly one rewrite interaction handles all of them, each field carrying its own diagnosis — not one interaction per field and not one per variation.
5. **Given** a carousel run (two copy-producing steps), **When** the gate completes, **Then** total model interactions do not exceed 10, and a failure in one step leaves the other step's gating unaffected.
6. **Given** a 36-item batch run, **When** the gate completes, **Then** it has made no more model interactions than a single-ad run — because batch authors no copy of its own.

---

### User Story 4 - Every gate decision is auditable after the fact (Priority: P3)

The product owner needs to answer "did the gate actually improve anything, and where is it failing?" without adding anything advertiser-visible. Each generation records, in its existing audit trail, which fields were scored, the per-dimension scores, which fields were rewritten and why, how many passes ran, and whether the gate was skipped or failed open.

**Why this priority**: Not required for an advertiser to benefit, but required to tune thresholds, prove the phase worked, and detect silent regressions. Deferrable only briefly — without it the gate's effect is unmeasurable.

**Independent Test**: Run a batch of generations, then read the audit trail alone and reconstruct, for each one, whether the gate ran, what it scored, what it changed, and why.

**Acceptance Scenarios**:

1. **Given** a generation where the gate ran, **When** its audit record is read, **Then** per-field per-dimension scores, rewrite decisions with diagnoses, and pass count are all present.
2. **Given** a generation where the gate failed open, **When** its audit record is read, **Then** the skip is recorded with its cause, distinguishable from "ran and changed nothing".
3. **Given** any generation, **When** its audit record is read, **Then** the audit data is additive — no previously recorded field is removed, renamed, or repurposed.

---

### Edge Cases

- **Optional fields absent.** Subheadline, CTA, and benefit are legitimately nullable. The gate must score only fields that are present and must never invent a value for an absent field, nor treat absence as a scoring failure.
- **Advertiser-supplied literal text.** The advertiser's own CTA text is preserved verbatim by existing rules. A rewrite must never overwrite advertiser-supplied literal strings, brand names, offer names, or product names.
- **Claim flags on a rewritten field.** Claim flags reach the interface per variation, so a flag left pointing at an invented statistic the rewrite already removed is a visible wrong warning. The rewrite interaction re-emits flags for the fields it changed (FR-011a–FR-011c); flags on untouched fields carry through. A specific newly invented by a rewrite must be flagged exactly as one produced at generation would be.
- **Cultural compliance on rewritten Arabic.** Rewritten text must pass the same Arabic-market cultural guardrails as originally generated text — a rewrite must not reintroduce a substituted motif or trigger word. Because the gate runs before review and the existing scan runs after approval, the gate applies the substitution rules to its own output (FR-012a) rather than leaving a trigger word for the later scan to swap out under the advertiser's feet.
- **Pre-existing review/render divergence.** The post-approval cultural scan can already alter approved copy today, independently of this feature. That divergence is out of scope: the gate must not widen it (SC-006a), and must not attempt to fix it by relocating the existing scan (FR-012b).
- **Transcribed testimonials are not generated copy.** The testimonial-carousel mode mixes text the system authored (its hook and close) with text a real customer wrote (the transcribed screenshots). The gate must separate the two: the first is in scope, the second is untouchable. A rewrite that "improves" a customer's quote fabricates a testimonial.
- **Slide captions are authored after hook approval.** Carousel slide copy is produced by a separate step that consumes the approved hook block. Gating it is not a re-gate of the approved copy (FR-000a) — it is the gate running on newly authored text before that text is reviewed. The approved hook block itself must pass through that step unmodified.
- **Raw block integrity.** The copy the advertiser reviews is parsed from a single raw text block containing several variations, while the copy that renders is extracted server-side from the approved variation of that same block. A rewrite that damages the block's structure — a dropped variation marker, a lost label, a mangled claim-flag line — would silently desynchronise those two views. The block must be rejected in favour of the original rather than shipped damaged.
- **Rewrite breaks a downstream rule.** A rewrite that exceeds a per-field length cap, or that would predictably overflow its rendered zone, must be rejected in favour of the original rather than shipped.
- **Rewrite degrades the copy.** If a rewrite scores lower than the string it replaced, the higher-scoring original must win.
- **Refresh / precision / per-field edit paths.** Copy is also produced by refresh, precision, and single-field edit flows, which share the same generator as initial generation. The gate must be able to tell those calls apart and skip them — an advertiser who asked for a specific wording must not be silently overruled. A missed distinction here is a silent correctness failure, not a cosmetic one.
- **Multi-item generations.** Item count does not multiply gate work: a batch run authors no copy of its own, and a carousel's slide captions are authored in a single step regardless of slide count. Gate cost scales with the number of copy-producing steps (at most two), never with items. One step's gate failure must not cascade — a run where one step was gated and the other failed open is a valid success.
- **Non-blocking by construction.** No gate failure mode may extend a generation beyond its existing timeout or convert a successful generation into a failed one.

## Requirements *(mandatory)*

### Functional Requirements

**Gate placement**

- **FR-000**: The gate MUST run at **every step that authors new on-creative copy**, before that copy is reviewed. The advertiser MUST review and approve copy that has already passed the gate, so that what they approve is exactly what renders.
- **FR-000a**: The gate MUST NOT re-run on copy the advertiser has already approved. Once a variation is approved, the gate MUST NOT alter it on the way to the image. The rule is scoped per copy-producing step: a later step authoring *new* copy is gated on its own, which is not a re-gate of the earlier approval.
- **FR-000b**: Copy generation emits several hook variations in a single raw text block that the interface parses for review. The gate MUST rewrite that block **in place**, preserving every variation marker, structural label, and claim-flag line, so the block remains parseable by the existing parser and the interface's view and the server-side extraction of the approved variation can never diverge.
- **FR-000c**: A rewrite that would render the raw block unparseable, drop a variation, or drop a structural label MUST be rejected in favour of the original block.
- **FR-000d**: Carousel slide-caption generation is a distinct copy-producing step that runs after hook approval. It MUST be gated as its **own copy set**, with its own 5-interaction ceiling (FR-018) and its own 20-second budget (FR-016). The approved hook block MUST pass through it untouched.
- **FR-000e**: The testimonial-carousel mode authors its own opening hook and closing line. Those two fields MUST be gated as their own copy set, with the same ceiling and budget as any other copy-producing step.
- **FR-000f**: Transcribed testimonial content MUST NEVER be scored or rewritten. It is the advertiser's customer's own words, not generated copy; altering it to raise a score would fabricate a testimonial that was never given. The gate MUST treat it as untouchable in the same way it treats advertiser-supplied literal text (FR-011).

**Scoring**

- **FR-001**: The system MUST score every on-creative text field that is present in every generated variation, before the advertiser reviews the copy and therefore before any string enters the copy-fidelity contract.
- **FR-002**: The system MUST score each present field 1–10 on exactly these **9 dimensions**: audience specificity, pain/desire relevance, clarity, scroll-stopping tension, wording specificity, offer relevance, non-generic language, reading level (≤6th grade), and lived-symptom depth.
- **FR-002a**: The system MUST NOT score or gate on the 6 deferred dimensions — hook-angle fit, format fit, visual compatibility, CTA strength, proof strength, and objection handling. These belong to Phase 23, which extends this gate rather than replacing it. The seeded rubric constant MUST be annotated to mark which dimensions are active in this phase and which are deferred, without rewriting its rule text.
- **FR-003**: The system MUST treat reading level and lived-symptom depth as hard dimensions with a higher pass bar (≥7) than the other dimensions (≥6).
- **FR-003a**: Reading level MUST gate every field. **Lived-symptom depth MUST gate only the headline, the subheadline, and carousel slide captions.**
- **FR-003b**: On CTA and benefit fields, lived-symptom depth MUST still be scored and recorded for tuning, but MUST NOT trigger a rewrite and MUST be excluded from that field's average. A CTA or benefit line carries no lived moment by design; gating it there would manufacture pain language into a button.
- **FR-004**: Scoring MUST use a separate, cheap, fast evaluation model distinct from the model that generates the copy, so that scoring is an independent judgment rather than the generator grading itself.
- **FR-005**: Scoring MUST apply identically to Arabic and English copy, with reading level judged against the appropriate standard for each language.

**Rewriting**

- **FR-006**: The system MUST evaluate the threshold **per field**, using that field's own scores. A field fails when: its average across its gating dimensions is below 8, OR reading level is below 7, OR — on headline, subheadline, and slide captions only — lived-symptom depth is below 7, OR any of the other 7 dimensions is below 6. There is no per-copy-set average. All 9 dimensions are scored on every present field; only lived-symptom depth on CTA and benefit is recorded without gating (FR-003b), so those two fields average over 8 dimensions and every other field averages over 9.
- **FR-007**: A rewrite MUST be diagnosed — the specific weakness is identified and the matched fix applied — rather than being an undirected regeneration. When one interaction rewrites several failing fields, each field MUST carry its own diagnosis.
- **FR-008**: The system MUST rewrite only the failing fields; fields that meet threshold MUST pass through unchanged.
- **FR-009**: The system MUST cap rewriting at 2 passes per generation, after which the best-scoring available candidate proceeds.
- **FR-010**: The system MUST select the highest-scoring candidate among the original and all rewrites; a rewrite that scores lower than the original MUST be discarded.
- **FR-011**: A rewrite MUST preserve advertiser-supplied literal text (CTA text, brand, offer, and product names) exactly.
- **FR-011a**: The rewrite interaction MUST re-emit claim flags for every field it rewrote, using the existing claim-flag output contract. Flags belonging to fields it did not touch MUST carry through unchanged.
- **FR-011b**: A stale claim flag — one describing text a rewrite has replaced — MUST NOT survive into the block. A fabricated verifiable specific introduced by a rewrite MUST be flagged exactly as one produced at generation would be.
- **FR-011c**: Claim-flag re-evaluation MUST NOT consume an additional model interaction; it rides the rewrite interaction that is already bounded by FR-018.
- **FR-012**: A rewritten field MUST satisfy every constraint the original was required to satisfy — per-field length caps, cultural compliance, and the anti-fabrication guards — or be rejected in favour of the original.
- **FR-012a**: The gate MUST apply the existing cultural substitution rules to its own rewrites, at rewrite time, so that gated copy is already compliant when the advertiser reviews it.
- **FR-012b**: The existing post-approval cultural scan MUST be left unchanged and MUST continue to run as the safety net. For gated copy it is expected to be a no-op; it MUST NOT be removed, bypassed, or relocated by this feature.

**Silence**

- **FR-013**: The gate MUST NOT surface anything to advertisers — no score, no rewrite indication, no quality badge, no new control, no new message, and no new interface element anywhere in the product.
- **FR-014**: The gate MUST NOT change the shape of what advertisers receive: the same fields, in the same structure, as before this feature.

**Fail-open and cost safety**

- **FR-015**: Any gate error, timeout, malformed response, out-of-range score, unavailable credential, or unusable rewrite MUST result in the originally generated copy proceeding unchanged, with the generation completing successfully.
- **FR-016**: The gate MUST operate under three time budgets — **8 seconds per model interaction, 20 seconds per copy set, and 60 seconds per run**. Whichever budget elapses first MUST abandon the gate for that scope and fail open.
- **FR-016a**: When the run-level budget elapses mid-run, the items already gated MUST keep their improved copy and the remaining items MUST ship their original copy. The run MUST NOT be held open waiting, and MUST NOT fail.
- **FR-016b**: The gate MUST NOT consume the generation callable's own timeout headroom. The run-level budget exists to guarantee this for the largest permitted batch and carousel sizes.
- **FR-017**: The gate MUST NOT alter the credit cost of any generation, and MUST NOT trigger a credit refund, a retry, or a generation failure under any of its own failure modes.
- **FR-018**: Model interactions per copy set MUST be bounded at **5** — at most 3 scoring interactions (one initial score plus one re-score after each of the 2 permitted rewrite passes) and at most 2 rewrite interactions (one per pass) — independent of input content and of how many fields fail.
- **FR-018a**: Scoring and rewriting MUST be separate interactions. A single rewrite interaction MUST handle all fields failing in that pass — **across all variations of the item** — carrying a per-field diagnosis, rather than one interaction per failing field or per variation.
- **FR-018b**: A single scoring interaction MUST cover every present field of every variation of the item. The interaction ceiling and the per-copy-set time budget are measured per item, not per variation.
- **FR-019**: The gate MUST run on **initial generation across all formats** — single ads, carousels, batch runs, and retargeting — by gating the two copy-producing steps those formats share: hook/variation generation, and carousel slide-caption generation. A batch run authors no copy of its own; its items all consume the single gated hook copy set, so gating that step covers every batch item.
- **FR-019a**: The gate MUST NOT run on the refresh, precision, or per-field edit paths. Copy an advertiser has explicitly asked to change is theirs and MUST pass through untouched.
- **FR-019b**: The per-run ceiling MUST be **5 model interactions × the number of copy-producing steps in that run**, giving a hard maximum of **10** (hook step, plus carousel slide step where applicable). It MUST NOT scale with batch size, carousel slide count, or any other item count. One step's gate failure MUST NOT affect the other, and a run in which one step was gated and the other failed open MUST be a valid, successful outcome.

**Operational control**

- **FR-019c**: The gate MUST be governed by a single global operational switch, enabled by default, that disables it everywhere when turned off. Turning it off MUST restore exactly the pre-feature copy behaviour, without a code revert or a logic redeploy.
- **FR-019d**: The switch MUST have no per-user, per-workspace, or per-plan granularity — every generation is gated or none is, so audit data is never split into cohorts.
- **FR-019e**: The switch MUST be permanent, surviving to production as the rollback mechanism and as the means of producing the gate-disabled baseline that SC-002, SC-004, SC-005a, and SC-006 are measured against. It MUST NOT be advertiser-visible or advertiser-controllable.
- **FR-019f**: When the switch is off, the gate MUST record nothing beyond the fact that it was disabled — no scores, no rewrite decisions.

**Auditability**

- **FR-020**: Every generation MUST record, in its existing audit trail, whether the gate ran; the per-field per-dimension scores; which fields were rewritten with the diagnosis for each; the number of passes; and, where the gate did not run, the reason.
- **FR-020a**: The gate MUST emit one structured log line per outcome, recording whether it ran, was skipped, or failed open; the cause when it did not run; and the number of rewrite passes. The line MUST be queryable by the existing log-based monitoring so that a sustained failure-open rate is alertable without manually inspecting generations.
- **FR-020b**: Gate observability MUST NOT introduce a new datastore collection, a new scheduled job, or any interface surface.
- **FR-021**: All audit additions MUST be additive — no existing recorded field may be removed, renamed, or repurposed, and existing records without gate data MUST remain readable.

**Preservation**

- **FR-022**: The existing copy-fidelity contract MUST remain unchanged and MUST continue to enforce exact-match with up to 3 retries on whatever strings the gate hands it.
- **FR-023**: The existing anti-fabrication behaviour MUST remain unchanged — honest degradation of invented hard facts, numeric-fact-violation repair, and the soft claim flag all continue to operate as they do today, above the gate.
- **FR-024**: The rendering pipeline MUST remain unchanged; improved copy reaches the image solely through the existing fidelity contract.
- **FR-025**: Captions are OUT OF SCOPE and MUST NOT be scored or rewritten by this gate.
- **FR-026**: Improved copy MUST NOT introduce new fidelity failures; the shorter, simpler strings the gate produces must pass the exact-match gate at no worse a rate than today's copy.

### Key Entities

- **On-creative copy set**: The unit the interaction ceiling (FR-018) and the 20-second budget (FR-016) are measured against — **all copy authored by one copy-producing step for one item**. For the hook step that means all variations of the item taken together (every variation's headline, subheadline, CTA, and benefit), so a single-ad generation is one copy set even though it contains several variations. For the carousel slide step it means that item's slide captions, which form a **separate** copy set with its own ceiling and budget. Subheadline, CTA, and benefit may legitimately be absent from any variation.
- **Copy-producing step**: A stage that authors new on-creative text — hook/variation generation, carousel slide-caption generation, and the testimonial-carousel mode's authored hook and close. Each is gated independently, before its own output is reviewed. Steps that merely consume already-approved copy are not copy-producing and are never gated. No single run invokes more than two of them, so the run ceiling is 10 model interactions.
- **Untouchable text**: Strings the gate must never score or rewrite — advertiser-supplied literal text (CTA, brand, offer, product names) and transcribed testimonial content. Present in the copy set for context, excluded from scoring and from any rewrite.
- **Variation**: One of the several alternative copy treatments emitted per item, from which the advertiser approves exactly one. Every variation is gated, because any of them can be the approved one.
- **Raw copy block**: The single text payload carrying all variations, parsed by the interface for review and, after approval, extracted server-side into the render fields. Rewrites are applied in place within this block (FR-000b).
- **Field score**: A per-field set of per-dimension numeric ratings plus the derived pass/fail verdict against the threshold rule.
- **Rewrite decision**: For a failing field — the diagnosis, the pass number, the candidate produced, its score, and whether the candidate was accepted or rejected.
- **Gate outcome record**: The per-generation audit summary — ran / skipped / failed-open, the cause when not run, the field scores, the rewrite decisions, and the pass count.
- **Claim flag**: The existing non-blocking advisory attached to a field containing a fabricated verifiable specific; re-evaluated when its field is rewritten.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across a sample of at least 50 generations spanning both languages and multiple offer types, at least 90% of the on-creative strings that reach the ad read at or below a 6th-grade level.
- **SC-002**: Across the same sample, the share of problem-stating strings that name a concrete lived moment rather than an abstract category improves by at least 30 percentage points versus the same inputs generated with the gate disabled.
- **SC-002a**: SC-001 and SC-002 MUST be measured by an independent automated judge applied to all 50 sampled generations, using a different prompt from the gate's own scorer, plus a product-owner spot-check of a fixed 10-generation subsample covering both languages. The gate's own scorer MUST NOT be the assessor for these two criteria — it optimized the output, so it cannot certify it. Where the human spot-check disagrees with the automated judge, the human verdict wins and the judge is corrected before the sample is re-scored.
- **SC-003**: In 100% of induced gate-failure runs (unreachable, timed out, malformed, out-of-range, unusable rewrite), the generation completes successfully with the original copy and the advertiser sees no error.
- **SC-004**: The credit cost of a generation is identical with the gate enabled and disabled, in 100% of sampled runs.
- **SC-005**: No rewrite loop exceeds 2 passes in any run; no copy set exceeds 5 model interactions (3 scoring + 2 rewrite); no run of any format exceeds 10 — verified across the full test sample including inputs engineered to fail repeatedly, inputs where every field fails, and the largest permitted batch and carousel sizes.
- **SC-005b**: Gate model interactions for a maximum-size batch run are equal to those for a single-ad run, in 100% of sampled runs — confirming gate cost does not scale with batch size.
- **SC-005a**: Copy produced by the refresh, precision, and per-field edit paths is byte-identical with the gate enabled and disabled, in 100% of sampled runs.
- **SC-006**: End-to-end generation time increases by no more than 20% at the median versus the gate-disabled baseline, and no generation exceeds its existing timeout because of the gate — verified at the largest permitted batch and carousel sizes, where the 60-second run budget is the binding constraint.
- **SC-006a**: In 100% of sampled generations, the gate introduces zero divergence between the copy the advertiser approves and the copy that reaches the rendered image. (Scoped to the gate: the pre-existing post-approval cultural scan can already alter approved copy, which this feature neither introduces nor claims to fix. For gated copy that scan is expected to be a no-op, per FR-012a.)
- **SC-006b**: In 100% of runs where the gate rewrote a block, the rewritten block parses successfully with the existing parser and yields the same number of variations as the original.
- **SC-006c**: In 100% of carousel runs, the approved hook block is byte-identical before and after the slide-caption step, confirming the gate never re-touches approved copy while still gating the newly authored captions.
- **SC-007**: Zero advertiser-visible changes — a reviewer comparing the product before and after, without access to the audit trail, cannot tell the gate exists.
- **SC-008**: Exact-match fidelity failures attributable to gate-improved copy are zero across the sample; the fidelity retry rate does not increase.
- **SC-009**: For 100% of sampled generations, the audit trail alone is sufficient to determine whether the gate ran, what it scored, what it changed, and why.
- **SC-010**: Untouchable text — advertiser-supplied literal text (CTA, brand, offer, product names) and transcribed testimonial content — is preserved byte-for-byte in 100% of runs where a rewrite occurred. Zero transcribed testimonial strings are altered across the entire sample.
- **SC-011**: Zero regressions in the existing anti-fabrication and cultural-compliance behaviours across the sample.
- **SC-012**: In 100% of runs where a flagged field was rewritten, no stale claim flag survives, and any fabricated verifiable specific introduced by the rewrite carries a flag — verified against a fixture set containing both a flag-clearing rewrite and a flag-introducing rewrite.
- **SC-013**: A sustained gate outage is detectable from monitoring alone within one hour of onset, without inspecting individual generations — verified by disabling the evaluation credential and confirming the failure-open signal is queryable and alertable.
- **SC-014**: Across the sample, no CTA or benefit field is rewritten on lived-symptom grounds, and the rewrite rate for those two fields is no higher than for headline and subheadline — confirming the gate is not manufacturing pain language into buttons.

## Assumptions

- **Changes 1 and 2 are already delivered.** The reading-level and lived-symptom rule blocks are live in all four on-creative copy prompt surfaces (verified against `main` on 2026-08-01, delivered by `specs/958-copy-quality/`). This feature does not re-author them; it enforces them. If the verification pass finds a surface that is missing a block, closing that gap is in scope.
- **The copy-fidelity contract is stable and stays untouched.** Improvements propagate to the rendered image solely by riding it. No design-phase, prompt-assembly, or compositor work is part of this feature.
- **The evaluation model is reachable from the backend.** An OpenAI credential is already provisioned and used by the generation backend for image work; this feature assumes the same credential can be extended to the copy-scoring call. Copy generation itself stays on its current model.
- **The implementation is backend-only for the advertiser surface; the frontend holds one opaque passthrough field.** The trace rides the HTTP boundary from each copy-producing callable through frontend state and into `serverGenerateFinalAd`, which merges it into the persisted `ResolutionTrace.copyScoring` sub-object (Contract I1). The frontend NEVER renders, displays, surfaces, or controls the trace. The frontend MUST hold the trace in opaque state and pass it back unchanged on the next `serverGenerateFinalAd` request. No UI, no settings, no message, no badge changes.
- **Thresholds are those already recorded in the launch matrix** (per-field average ≥ 8, the hard dimensions ≥ 7, the other 7 dimensions ≥ 6, maximum 2 rewrite passes), narrowed only by FR-003a/FR-003b so the lived-symptom floor does not fire on CTA and benefit fields and are treated as locked product decisions, tunable later from the audit data.
- **The rubric and diagnosis→fix tables already exist as seeded constants** and are the source of the gate's wording; this feature consumes them rather than inventing new rule text.
- **Reading level for Arabic** is assessed against the "simple spoken-style فصحى a 12-year-old would say out loud" standard already written into the reading-level rule, not against an English readability formula. This applies both to the gate's own scorer and to the independent judge used for sign-off (SC-002a).
- **Sign-off measurement is a build-time activity, not a runtime one.** The independent judge and the product-owner spot-check run offline over a captured sample; neither is part of the generation path and neither affects latency or credit cost.
- **Captions are excluded by product decision** — advertisers edit captions heavily, so caption learning and caption quality are out of v1 scope.
- **The gate-disabled baseline comes from the permanent global switch** (FR-019c–FR-019f), not from a temporary test harness. Because the switch survives to production, the comparative success criteria (SC-002, SC-004, SC-005a, SC-006) remain re-measurable after launch, and rollback is a flag flip rather than a revert.
- **Advertiser edits are sacred.** The refresh, precision, and per-field edit paths are excluded (FR-019a) on the principle that copy an advertiser explicitly asked to change must not be silently overwritten. Since those paths share a generator with initial generation, distinguishing them reliably is a correctness requirement of this feature, not an implementation detail.
- **Phase 23 extends this gate rather than replacing it.** This feature does not change how many copy fields exist, the structure decision tree, per-hook variation behaviour, or any Step-2 interface. The 6 deferred dimensions (hook-angle fit, format fit, visual compatibility, CTA strength, proof strength, objection handling) are added by Phase 23 task 23.9, so the gate is built to accept additional dimensions without restructuring.
