# Phase 0 Research: Silent Copy Scoring & Rewrite Gate

**Feature**: `966-copy-scoring-gate` | **Date**: 2026-08-01

All Technical Context unknowns are resolved below. No `NEEDS CLARIFICATION` remains.

---

## R1 — How the gate trace crosses the callable boundary

**Decision**: The gate's audit trace rides the **HTTP boundary**, not a module-global. Each copy-producing callable returns its trace in the response; the frontend holds it in state and passes it back to `serverGenerateFinalAd`, which merges it into the persisted `ResolutionTrace`. This mirrors the Phase 20 concept-director trace exactly.

**Rationale**: The codebase carries an explicit, documented failure on this precise question (`generators.ts:1389-1398`, Phase 20 audit fix #30/#32/#33):

> "REMOVED the module-global survivor (`_lastConceptDirectorTrace`) … The previous module-global bridge worked in the emulator (shared process) but **NEVER in production** because `serverGenerateConcepts` and `serverGenerateFinalAd` run in separate Cloud Run containers and do not share process memory."

The gate runs inside `serverGenerateTOV` (`index.ts:4204`); the `generations` document is written by `serverGenerateFinalAd` (`index.ts:4767`). These are separate Cloud Run services. A module-global survivor set in one is simply absent in the other in production — the write silently succeeds with `undefined`, and FR-020 fails in a way that passes every emulator test.

**Alternatives considered**:

- *Module-global survivor* (`let _lastCopyScoring` + getter, merged in `generateFinalAd`) — **rejected**. This is the exact pattern Phase 20 removed for cause. It is also, notably, what a prior implementation attempt at this feature reached for. It tests green locally and is dead in production.
- *Firestore hand-off keyed by a correlation id* — rejected. Adds a collection, a write on the copy path, and a read on the render path, to move data the client already holds. FR-020b forbids a new collection.
- *Re-running the gate at final-ad time purely to regenerate the trace* — rejected. Violates FR-000a (no gating after approval) and burns interactions.

**Carried risk**: `_lastCopyDiversity` (`generators.ts:1387`) is still a module-global survivor set in `generateTOV` and merged in `generateFinalAd` — by the Phase 20 reasoning it is broken in production today. That is a **pre-existing defect, out of scope here**, but the gate must not be built on top of it or alongside it as if the pattern worked. Flag it; do not fix it in this feature.

---

## R2 — Evaluation model client and credential wiring

**Decision**: Use the `openai` SDK (already a direct dependency, `functions/package.json` → `"openai": "^6.42.0"`) with a small purpose-built text client. Add the existing `OPENAI_API_KEY` secret to the three copy-producing callables that lack it.

**Rationale**: The dependency, the secret (`index.ts:98` — `defineSecret("OPENAI_API_KEY")`), and the deployment region are all already in place. `serverGenerateFinalAd` already declares the secret (`index.ts:4769`). Only the copy-producing callables need it added:

| Callable | Line | Current secrets | Needs |
|---|---|---|---|
| `serverGenerateTOV` | 4204 | `[geminiApiKey]` | `+ openaiApiKey` |
| `serverGenerateCarouselSlideCopies` | 5162 | `[geminiApiKey]` | `+ openaiApiKey` |
| `serverGenerateTestimonialCarousel` | 5196 | `[geminiApiKey]` | `+ openaiApiKey` |

**Alternatives considered**:

- *Reuse `createOpenAIImageCaller`* (`openAIImageCaller.ts`) — rejected. It is shaped as a drop-in `GeminiCaller` for **image** generation: it destructures `contents.parts`, resolves aspect-ratio → pixel size, and returns image data. Nothing in it fits a text/JSON scoring call.
- *Route scoring through the existing Gemini caller* — rejected. FR-004 requires the scorer be a different model from the generator, so the judgment is independent rather than the generator grading itself.

---

## R3 — Where the gate attaches in the generation flow

**Decision**: Three attach points, one per copy-producing step (FR-000, FR-000d, FR-000e), each operating on the raw text block before it returns to the client.

| Step | Function | Line | Copy set |
|---|---|---|---|
| Hook / variations | `generateTOV` | `generators.ts:1904` | All variations `HOOK_START_A`–`D` |
| Carousel slide captions | `generateCarouselSlideCopies` | `generators.ts:8723` | That carousel's slide captions |
| Testimonial hook + close | `generateTestimonialCarousel` | `generators.ts:9787` | Authored hook (`:9823`) + close (`:9845`) only |

**Rationale**: Attaching inside the generator (rather than in the callable wrapper) keeps the raw-block rewrite (FR-000b) adjacent to the code that produced the block's structure, and keeps the three steps independently testable.

**Batch adds no attach point.** There is exactly one `generateTOV` call site (`index.ts:4231`). Batch is N `generateFinalAd` calls with `batchIndex`/`batchN` runtime-injected (`generators.ts:6132, 7520`) over one approved TOV — confirming FR-019b's step-based ceiling of 10 rather than any item-scaled bound.

**Alternatives considered**:

- *Gate in the callable wrappers in `index.ts`* — rejected. The wrapper sees an opaque string; block-structure validation (FR-000c) belongs next to the block's producer.
- *Gate in `generateFinalAd`* — rejected. Violates FR-000a and would render copy the advertiser never approved.

---

## R4 — Preserving raw-block structure through a rewrite

**Decision**: The gate parses the block into fields, rewrites values only, and re-emits the block by **substituting field values in place** — never regenerating the block's scaffolding. Post-rewrite, the block is re-parsed with the existing extractor and rejected if the parse degrades (FR-000c).

**Rationale**: Two independent parsers consume this block: the frontend (`src/utils/hookVariationParser.ts`, which also strips `CLAIM_FLAG` lines) and the backend (`extractCopyFieldsFromResponse`, `generators.ts:6201`). FR-000b requires they can never disagree. Value-substitution plus a re-parse assertion is the only approach that guarantees the markers, labels, and claim-flag lines survive byte-identical.

**Validation gate before accepting a rewritten block**: variation count unchanged; every structural label still present; block re-parses; untouchable text byte-identical (FR-011, FR-000f). Any failure → keep the original block.

**Alternatives considered**:

- *Ask the model to re-emit the whole block* — rejected. Puts the block's structure in the model's hands; a dropped `HOOK_START_C` silently loses a variation.
- *Rewrite the parsed field objects and skip the block* — rejected. The frontend parses the block, not the objects; the two would diverge immediately.

---

## R5 — Scoring and rewrite call shape

**Decision**: Two separate JSON-mode calls. **Score**: one call receives every present field of every variation and returns per-field, per-dimension integer scores. **Rewrite**: one call receives only the failing fields plus their diagnoses and returns replacement values and re-emitted claim flags (FR-011a).

**Rationale**: FR-018a mandates separation so each is independently testable and a malformed response in one does not destroy the other. Ceiling: 3 scoring + 2 rewrite = 5 per copy set (FR-018), ≤10 per run (FR-019b).

**Rubric source**: the seeded `COPY_SCORING_DIMENSIONS` and `COPY_REWRITE_DIAGNOSES` constants (`copywriting_knowledge.ts:782, 808`) are the wording source. Per FR-002a they are **annotated** to mark the 9 active and 6 deferred dimensions — their rule text is not rewritten, preserving the Track-1 drift-control discipline (`edit the reference first, then sync`).

**Alternatives considered**:

- *Fused score-and-rewrite in one call* — rejected at clarification. Cheaper (3 interactions) but couples the concerns and loses both outputs on one malformed response.
- *One call per field* — rejected. Up to 8 rewrite calls per copy set.

---

## R6 — Fail-open enforcement and the time budgets

**Decision**: The gate is wrapped in a total-isolation boundary: every path returns either an improved block or **the original block**, and never throws. Three budgets enforced by `Promise.race` against timers — 8s per interaction, 20s per copy set, 60s per run (FR-016).

**Rationale**: The gate sits on a credit-consuming path. Constitution Principle VIII (cost discipline) and the project's credit-safety rule make a gate-caused generation failure strictly worse than no gate. The callables run at `timeoutSeconds: 120` (`index.ts:4207`, `5165`); a 60s run ceiling leaves the generation its existing headroom (FR-016b).

**Failure modes all resolving to "original block ships"**: unreachable, non-2xx, timeout at any of the three levels, unparseable JSON, out-of-range scores, missing credential, empty rewrite, dropped field, unparseable rewritten block, untouchable-text mutation.

---

## R7 — Kill switch

**Decision**: A single module-level constant in `modelConfig.ts` alongside `MODEL_PROVIDER`, e.g. `COPY_SCORING_ENABLED: boolean = true`. Global, permanent, no per-user granularity (FR-019c–FR-019f).

**Rationale**: `MODEL_PROVIDER` (`modelConfig.ts:3`) is the established reversibility pattern in this codebase — a documented one-line flip that reverts an entire phase (Phase 25 shipped it exactly this way). Putting the gate's switch beside it keeps the reversal story uniform and discoverable.

**Alternatives considered**: Firestore-backed remote config — rejected; adds a read to the copy path and per-cohort drift, which FR-019d forbids.

---

## R8 — Test strategy

**Decision**: One new test file `functions/src/__tests__/copyScoringGate.test.ts`, string/parser assertions with a **stubbed** scoring client. No live model calls. Registered in the `test` script chain in `functions/package.json`.

**Rationale**: Every existing contract test in this repo follows the pattern (`culturalCompliance.test.ts`, `gazeMap.test.ts`, `expressionMap.test.ts`): pure functions, deterministic fixtures, no network. Constitution Principle IX requires reproducible proof; Principle IV requires explicit pass/fail rules. A stubbed client lets every fail-open branch (R6's ten failure modes) be exercised deterministically.

**Note**: `copyQuality.test.ts` already exists and covers Track 1 (the rule blocks). The gate gets its own file rather than extending it, keeping Track 1 and Track 2 independently runnable.

---

## R9 — The two `ResolutionTrace` definitions

**Decision**: Add the `copyScoring` field to **both** `functions/src/types.ts:353` and `functions/src/generators.ts:5475`, and note the duplication in the plan's risk list.

**Rationale**: Two independent `ResolutionTrace` interfaces exist. Adding the field to only one produces either a compile error or — worse — a silently untyped write. This is a known repo hazard, not a defect this feature introduces or fixes.

---

## R10 — How sign-off evidence is produced

**Decision**: A pair of standalone scripts under `scripts/` — `copyQualitySample.mjs` (paired gate-on/gate-off capture over a committed input set) and `copyQualityJudge.mjs` (an independent judge running on **Gemini**, with a prompt that shares nothing with the gate's scorer). Results recorded in `specs/966-copy-scoring-gate/validation/`.

**Rationale**: SC-001 and SC-002 are the only criteria that measure whether copy actually improved, and SC-002a forbids the gate's own scorer from assessing them — the gate rewrites until that scorer is satisfied, so re-scoring its output proves nothing. Running the judge on Gemini while the gate scores on OpenAI removes both sources of circularity at once: different prompt *and* different model.

`scripts/` is the established home for standalone operational scripts in this repo (`sc11Guard.mjs`, `backfill-workspace-deletedAt.ts`) — this is measurement tooling, not application code and not a unit test.

**These scripts make live model calls**, which is a deliberate departure from R8's no-live-calls rule. R8 governs the *contract tests*, which must be deterministic and run in CI. Sign-off evidence cannot be produced against stubs: a stubbed judge scoring stubbed copy measures nothing. The two rules cover different artifacts and do not conflict.

**Alternatives considered**:

- *Score the sample with the gate's own scorer* — rejected. Directly forbidden by SC-002a and circular by construction.
- *Human-only review of all 50 generations* — rejected. No circularity, but slow and not repeatable when thresholds are later tuned. The chosen design keeps the human in the loop where judgment matters most (a fixed 10-item spot-check, both languages) with the human verdict winning ties and the judge corrected before re-scoring.
- *Fold sign-off into the contract test suite* — rejected. It would put live model calls, cost, and non-determinism into a suite that runs on every build.

**Why this was missed in the first pass**: Phase 0 researched how to *build* the gate and how to keep it from breaking anything, but never asked how its value would be *demonstrated*. The consequence was 74 tasks with zero coverage for the phase's two proof-of-value criteria — caught by `/speckit.analyze` as finding C1, and now allocated as tasks T075–T080. Recorded here so the omission is visible rather than silently repaired.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---|---|
| Trace across callable boundary | HTTP boundary, Phase 20 pattern (R1) |
| Evaluation client | `openai` SDK, new text client, secret added to 3 callables (R2) |
| Attach points | 3 generators, batch adds none (R3) |
| Block-structure safety | Value substitution + re-parse assertion (R4) |
| Call shape | 2 separate JSON calls, 5-interaction ceiling (R5) |
| Fail-open | Total-isolation wrapper, 3 `Promise.race` budgets (R6) |
| Kill switch | Constant in `modelConfig.ts` beside `MODEL_PROVIDER` (R7) |
| Tests | Stubbed-client contract file, registered in `test` chain (R8) |
| Trace typing | Both `ResolutionTrace` definitions (R9) |
| Sign-off evidence | Capture + independent-judge scripts under `scripts/`; judge on Gemini, live calls (R10) |
