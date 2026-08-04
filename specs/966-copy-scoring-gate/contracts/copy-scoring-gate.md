# Contract: Copy Scoring & Rewrite Gate

**Feature**: `966-copy-scoring-gate` | **Date**: 2026-08-01

Internal module contract for `functions/src/copyScoringGate.ts`, plus the callable response additions. Every clause maps to an FR and is asserted in `functions/src/__tests__/copyScoringGate.test.ts`.

---

## A. Module surface

```
gateCopySet(
  input: {
    step: "hook" | "carouselSlides" | "testimonial",
    rawBlock: string,
    language: "ar" | "en",
    untouchable: string[],
  },
  deps: {
    score:  (payload) => Promise<ScoreResponse>,
    rewrite:(payload) => Promise<RewriteResponse>,
    now:    () => number,
  }
): Promise<{ block: string; trace: CopyScoringStepTrace }>
```

**Contract A1 — Total function.** `gateCopySet` NEVER throws and NEVER rejects. Every path resolves to `{ block, trace }`. On any failure, `block` is the input `rawBlock` byte-for-byte and `trace.ran === false` with a `skipReason`. *(FR-015, FR-017)*

**Contract A2 — Dependency injection.** `score`, `rewrite`, and `now` are injected so every branch is testable without network or wall-clock. *(R8)*

**Contract A3 — Purity of the disabled path.** When the kill switch is off, `gateCopySet` is not called at all; the caller records `{ ran: false, skipReason: "disabled" }` and performs no model interaction. *(FR-019c, FR-019f)*

---

## B. Scoring

| # | Clause | FR |
|---|---|---|
| B1 | Scores exactly 9 dimensions per present field. A response naming any deferred dimension is rejected as malformed. | FR-002, FR-002a |
| B2 | Scores only fields present in the block. Absent optional fields are never scored and never treated as failures. | FR-001, Edge Cases |
| B3 | Never scores `untouchable[]` entries. | FR-011, FR-000f |
| B4 | Every score is an integer 1–10. Out-of-range, non-integer, or missing → malformed → fail open. | FR-015 |
| B5 | One scoring interaction covers **every** present field of **every** variation of the item. | FR-018b |
| B6 | Scoring is language-agnostic in structure; reading level is judged against the standard for the field's language. | FR-005 |

---

## C. Threshold evaluation

| # | Clause | FR |
|---|---|---|
| C1 | Evaluated **per field**, never per copy set. | FR-006 |
| C2 | Fails when: average < 8, OR `readingLevel` < 7, OR (`livedSymptomDepth` < 7 **on headline / subheadline / slide caption only**), OR any of the other 7 < 6. | FR-006, FR-003a |
| C3 | On CTA and benefit, `livedSymptomDepth` is recorded but never gates, and is **excluded from the average** — those fields average over 8 dimensions, all others over 9. | FR-003b |
| C4 | A CTA scoring 2 on `livedSymptomDepth` and ≥ threshold elsewhere **passes**. | FR-003b, SC-014 |

---

## D. Rewriting

| # | Clause | FR |
|---|---|---|
| D1 | One rewrite interaction per pass, handling every failing field across every variation — not one per field, not one per variation. | FR-018a |
| D2 | Each rewritten field carries its own diagnosis drawn from `COPY_REWRITE_DIAGNOSES`. | FR-007 |
| D3 | Fields that passed are absent from the rewrite payload and returned unchanged. | FR-008 |
| D4 | Maximum 2 rewrite passes; then the best candidate proceeds with `gaveUp: true`. | FR-009 |
| D5 | Best-of selection across original + both rewrites; a lower-scoring rewrite is discarded with `rejectReason: "scored_lower"`. | FR-010 |
| D6 | The rewrite call re-emits claim flags for the fields it rewrote; flags on untouched fields carry through unchanged. | FR-011a |
| D7 | No stale claim flag survives on a rewritten field; a specific newly invented by a rewrite is flagged. | FR-011b |
| D8 | Claim-flag re-evaluation consumes **no** additional interaction. | FR-011c |
| D9 | The gate applies the existing cultural substitution rules to its own rewrites before acceptance. | FR-012a |
| D10 | A rewrite failing any constraint (length cap, cultural, anti-fabrication) is rejected in favour of the original. | FR-012 |

---

## E. Raw-block integrity

| # | Clause | FR |
|---|---|---|
| E1 | Rewrites are applied by **value substitution in place**. The block's scaffolding is never model-regenerated. | FR-000b, R4 |
| E2 | Every variation marker, structural label, and claim-flag line survives. | FR-000b |
| E3 | After rewriting, the block is re-parsed with the existing extractor. Fewer variations, a missing label, or a parse failure → reject, keep original. | FR-000c, SC-006b |
| E4 | Untouchable text is byte-identical before and after. Any mutation → reject with `rejectReason: "untouchable_mutated"`. | FR-011, FR-000f, SC-010 |

---

## F. Budgets and ceilings

| # | Clause | FR |
|---|---|---|
| F1 | ≤ 3 scoring + ≤ 2 rewrite = **≤ 5 interactions per copy set**, independent of field count, variation count, and failure count. | FR-018 |
| F2 | ≤ **10 interactions per run** — 5 × copy-producing steps; no run invokes more than two. | FR-019b |
| F3 | Gate interactions do **not** scale with batch size or slide count. A 36-item batch costs what a single ad costs. | FR-019b, SC-005b |
| F4 | 8s per interaction / 20s per copy set / 60s per run. First to elapse abandons that scope and fails open. | FR-016 |
| F5 | Run-budget elapse mid-run: already-gated steps keep improved copy, remaining steps ship originals, run succeeds. | FR-016a |
| F6 | The gate never consumes the callable's own timeout headroom. | FR-016b |

---

## G. Placement

| # | Clause | FR |
|---|---|---|
| G1 | Runs at every copy-producing step, before that step's output is reviewed. | FR-000 |
| G2 | Never re-runs on already-approved copy. The approved hook block passes through the slide step untouched. | FR-000a, SC-006c |
| G3 | Attach points: `generateTOV` (`:1904`), `generateCarouselSlideCopies` (`:8723`), `generateTestimonialCarousel` (`:9787`). | FR-000d, FR-000e |
| G4 | Never runs on refresh, precision, or per-field edit paths — those produce byte-identical output gate-on vs gate-off. | FR-019a, SC-005a |
| G5 | Transcribed testimonial content is never scored or rewritten. | FR-000f |

---

## H. Silence

| # | Clause | FR |
|---|---|---|
| H1 | No score, rewrite indication, badge, control, or message reaches the advertiser. | FR-013 |
| H2 | Response field shape is unchanged apart from the additive opaque `copyScoringTrace`, which is never rendered. | FR-014 |

---

## I. Trace transport

**Contract I1 — HTTP boundary, not process memory.** Each copy-producing callable returns `copyScoringTrace` in its response; the frontend passes it back to `serverGenerateFinalAd`, which merges it into `resolutionTrace.copyScoring`.

**Contract I2 — Module-global survivors are FORBIDDEN for this trace.** `serverGenerateTOV` and `serverGenerateFinalAd` run in separate Cloud Run containers. Per `generators.ts:1389-1398`, that pattern "worked in the emulator (shared process) but NEVER in production." A survivor-based implementation passes every local test and writes `undefined` in production.

**Contract I3 — Both type definitions.** `copyScoring` is declared in `types.ts:353` **and** `generators.ts:5475`. Declaring it in one only is a silent-write hazard. *(R9)*

**Contract I4 — Additive.** No existing trace field is removed, renamed, or repurposed; records without `copyScoring` remain readable. *(FR-021)*

---

## J. Observability

| # | Clause | FR |
|---|---|---|
| J1 | One structured log line per gate outcome: ran / skipped / failed-open, cause, pass count. | FR-020a |
| J2 | Queryable by existing log-based monitoring so a sustained failure-open rate is alertable. | FR-020a, SC-013 |
| J3 | No new collection, no scheduled job, no interface surface. | FR-020b |

---

## K. Callable response additions

| Callable | Line | Addition |
|---|---|---|
| `serverGenerateTOV` | `index.ts:4204` | `+ openaiApiKey` secret; response gains `copyScoringTrace` |
| `serverGenerateCarouselSlideCopies` | `index.ts:5162` | `+ openaiApiKey` secret; response gains `copyScoringTrace` |
| `serverGenerateTestimonialCarousel` | `index.ts:5196` | `+ openaiApiKey` secret; response gains `copyScoringTrace` |
| `serverGenerateFinalAd` | `index.ts:4767` | already has the secret; accepts `request.data.copyScoringTrace` |

All remain `region: "europe-west1"`.

---

## L. Test matrix — `copyScoringGate.test.ts`

Every row uses a stubbed `score`/`rewrite`. No live model calls.

| Group | Cases |
|---|---|
| Scoring | 9 dimensions exactly; deferred dimension rejected; absent fields skipped; untouchable skipped; out-of-range rejected |
| Threshold | Each failure condition in isolation; CTA passing at `livedSymptomDepth: 2`; average over 8 vs 9 dimensions |
| Rewriting | One call for many failing fields; per-field diagnoses; 2-pass cap; best-of selection; lower-scoring rewrite discarded |
| Claim flags | Stale flag cleared; new fabrication flagged; untouched flags preserved; no extra interaction |
| Block integrity | Markers preserved; dropped variation rejected; unparseable rewrite rejected; untouchable mutation rejected |
| Fail-open | All 10 R6 failure modes → original block, `ran:false`, correct `skipReason` |
| Budgets | 5-per-set ceiling; 10-per-run ceiling; batch parity; each of the 3 timeouts |
| Placement | Edit/refresh/precision paths untouched; approved block unchanged through slide step |
| Trace | Shape valid; additive; disabled writes only `{ran:false, skipReason:"disabled"}` |
