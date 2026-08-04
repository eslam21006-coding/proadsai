# Implementation Plan: Phase 22 — Copy Quality Upgrade (Silent Scoring & Rewrite Gate)

**Branch**: `966-copy-scoring-gate` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/966-copy-scoring-gate/spec.md`

## Summary

A silent quality gate sits between copy generation and the existing copy-fidelity contract. It scores every generated on-creative string on 9 dimensions, rewrites what falls below threshold (max 2 passes), and hands the improved strings to the contract — which already carries exact strings verbatim to the rendered image, so the improvement propagates with no design-phase work. Advertisers never see it. Every failure mode ships the original copy and completes the generation.

**Scope note.** Two of the three changes in the original request are already merged (Track 1, `specs/958-copy-quality/`): the reading-level and lived-symptom rule blocks are live in all four prompt surfaces. This feature builds the third — the gate — which is what *enforces* the other two. Today nothing detects when the model ignores them.

**Technical approach**: a pure, dependency-injected `gateCopySet` module attached at the three copy-producing generators, behind a permanent global kill switch, with its audit trace crossing the callable boundary over HTTP rather than process memory.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, `openai` ^6.42.0 (already a direct dependency), Gemini 3.5 (copy generation — unchanged)
**Storage**: Firestore — `generations/{genId}.resolutionTrace.copyScoring` (additive nested object). No new collection, no migration.
**Testing**: Node-executed compiled contract tests — `functions/src/__tests__/copyScoringGate.test.ts`, stubbed clients, no live model calls. Registered in the `test` chain in `functions/package.json`.
**Target Platform**: Firebase Cloud Functions v2, `europe-west1`, Node 24
**Project Type**: Web application — backend-only change (`functions/`) plus one opaque, never-rendered passthrough field in the frontend
**Performance Goals**: ≤5 model interactions per copy set; ≤10 per run; median end-to-end generation time +≤20% vs gate-off baseline
**Constraints**: 8s per interaction / 20s per copy set / 60s per run; fail-open on every path; zero credit-cost change; zero advertiser-visible change; gate must not consume the callables' existing 120s timeout headroom
**Scale/Scope**: 3 copy-producing steps; gate cost independent of batch size (36 max) and carousel slide count (10 max) — a 36-item batch costs what a single ad costs

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Assessment | Verdict |
|---|---|---|
| **I — Reliability over feature count** | Adds no user-facing surface, no new mode, no new combination. Behind a permanent kill switch that reverts the phase in one line. | ✅ PASS |
| **II — Selected mode MUST be obeyed** | The gate never changes the resolved mode, format, language, or angle — only the wording of fields the model already produced. FR-019a keeps advertiser-initiated edits untouched. | ✅ PASS |
| **III — Launch surface frozen** | No new launch combination. Gates the three copy-producing steps already in the approved surface, including the two testimonial-carousel lanes (priority lanes 10–11). | ✅ PASS |
| **IV — Behavior contracts beat judgment** | `contracts/copy-scoring-gate.md` defines 12 clause groups (A–L) with explicit pass/fail rules: required inputs, required output, blocked behaviours, and every fail condition. | ✅ PASS |
| **V — Arabic quality is first-class** | Reading level for Arabic is judged against the "simple spoken فصحى a 12-year-old would say" standard, not an English formula (FR-005). Rewrites pass the existing cultural substitution rules before acceptance (FR-012a). The human sign-off spot-check covers both languages (SC-002a). | ✅ PASS |
| **VI — Hidden machine layers MUST be auditable** | This is the principle the feature most directly engages: a silent rewriting layer. FR-020 records per-field scores, per-field rewrite diagnoses, pass count, and skip cause. FR-020a adds a structured log line per outcome so a silent outage is alertable (SC-013). | ✅ PASS |
| **VII — No silent override without rule, signal, and trace** | **Rule**: FR-006 thresholds. **Trace**: FR-020/FR-020a. **Signal**: partial — see Complexity Tracking below. | ⚠️ JUSTIFIED |
| **VIII — Cost discipline** | Hard ceilings: ≤5 interactions per copy set, ≤10 per run, ceiling independent of item count. Bounded 2-pass rewriting. Fail-open never triggers a retry or a refund. Gate cost does not scale with batch size. | ✅ PASS |
| **IX — Proof required for every claimed fix** | 20 measurable SCs. SC-002a forbids the gate's own scorer from certifying the gate — an independent judge plus a product-owner spot-check, with the human verdict winning ties. **Initially assessed on the spec's criteria alone; the first planning pass allocated no work to produce that evidence, so 74 tasks shipped with zero coverage for SC-001/SC-002.** Closed by R10 and tasks T075–T080. | ✅ PASS *(after R10)* |
| **X — Spec before code** | Spec at 53 FRs / 20 SCs / 17 clarifications across four clarify passes. Scope, expected behavior, acceptance criteria, and validation method all defined. | ✅ PASS |
| **XI — Frontend and backend agree on truth** | FR-000b is precisely this principle: the frontend parses the raw block while the backend extracts from the approved variation, so a rewrite must keep both views identical. Enforced by re-parse assertion (FR-000c) and asserted by SC-006a/SC-006b. | ✅ PASS |
| **XII — Deferred scope stays deferred** | The 6 Phase-23 dimensions are explicitly not scored and not gated (FR-002a); the seeded constant is annotated, not rewritten. Captions remain out of scope (FR-025). No change to field count or structure. | ✅ PASS |

**Gate result: PASS** with one justified deviation recorded below.

**Post-Phase-1 re-evaluation**: no new violations. The design work strengthened Principles VI and XI — R1's HTTP-boundary decision is what makes the audit trace actually exist in production, and R4's value-substitution approach is what keeps the two parsers in agreement.

## Project Structure

### Documentation (this feature)

```text
specs/966-copy-scoring-gate/
├── plan.md              # This file
├── spec.md              # 53 FRs, 20 SCs, 17 clarifications
├── research.md          # Phase 0 — R1..R9, all unknowns resolved
├── data-model.md        # Phase 1 — entities, trace shape, state machine
├── quickstart.md        # Phase 1 — build order and verification
├── checklists/
│   └── requirements.md  # Spec quality checklist, 16/16
├── contracts/
│   └── copy-scoring-gate.md   # Phase 1 — clause groups A..L
├── tasks.md             # Phase 2 — 82 tasks across 8 phases
└── validation/          # Phase 8 output — sign-off sample + recorded results
    ├── sample-<date>.json
    └── results.md
```

### Source Code (repository root)

```text
functions/src/
├── copyScoringGate.ts              # NEW — gateCopySet, scorer, rewriter
├── modelConfig.ts                  # + COPY_SCORING_ENABLED (beside MODEL_PROVIDER)
├── copywriting_knowledge.ts        # annotate 9 active / 6 deferred dimensions
├── types.ts                        # + ResolutionTrace.copyScoring        (:353)
├── generators.ts                   # + ResolutionTrace.copyScoring        (:5475)
│                                   # attach: generateTOV                  (:1904)
│                                   # attach: generateCarouselSlideCopies  (:8723)
│                                   # attach: generateTestimonialCarousel  (:9787)
├── index.ts                        # + openaiApiKey to 3 callables; accept trace on finalAd
└── __tests__/
    └── copyScoringGate.test.ts     # NEW — contract clauses A..L, stubbed clients

src/
├── types.ts                        # opaque passthrough field (never rendered)
└── App.tsx                         # thread trace through state (never rendered)

scripts/                            # sign-off tooling (Phase 8, live model calls)
├── copyQualitySample.mjs           # NEW — paired gate-on/gate-off capture harness
└── copyQualityJudge.mjs            # NEW — independent judge (Gemini, unshared prompt)
```

**Structure Decision**: Existing web-application layout (`functions/` backend, `src/` frontend). The gate is one new backend module plus attach points at three existing generators. The frontend change is a single opaque field threaded from the copy callables' response to `serverGenerateFinalAd` — required by R1 because the two callables run in separate Cloud Run containers. It is never rendered, satisfying FR-013. Sign-off tooling lives in `scripts/`, the established home for standalone operational scripts (`sc11Guard.mjs`, `backfill-workspace-deletedAt.ts`) — it is measurement tooling, not application code (R10).

## Key design decisions

Full reasoning in `research.md`. The three that shape everything else:

**R1 — The trace crosses the HTTP boundary, not process memory.** `serverGenerateTOV` and `serverGenerateFinalAd` are separate Cloud Run services. `generators.ts:1389-1398` documents the Phase 20 audit finding that a module-global bridge "worked in the emulator (shared process) but **NEVER in production**." A survivor-based implementation passes every local test and writes `undefined` in production, silently failing FR-020. The trace therefore rides the response → frontend state → `serverGenerateFinalAd`, exactly as the concept-director trace does.

**R4 — Rewrites substitute values in place; the block scaffolding is never model-regenerated.** Two independent parsers consume the raw block (`src/utils/hookVariationParser.ts` on the frontend, `extractCopyFieldsFromResponse` on the backend). Letting the model re-emit the block risks a dropped `HOOK_START_C` silently losing a variation. Value substitution plus a re-parse assertion is what makes FR-000b enforceable.

**R3 — Batch adds no attach point.** There is exactly one `generateTOV` call site (`index.ts:4231`); batch is N `generateFinalAd` calls over one approved TOV. This is why the run ceiling is 10 and not item-scaled.

**R10 — Sign-off evidence is produced by tooling the gate cannot grade.** Added after `/speckit.analyze` found that the first planning pass researched how to *build* the gate but never how to *demonstrate* it worked. A capture harness and an independent judge — different prompt, different model (Gemini vs the gate's OpenAI scorer) — live under `scripts/` and make live calls, deliberately outside R8's stubbed-test rule.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| **Principle VII — override is ruled and traced, but not signaled to the user** | The gate silently rewrites copy the advertiser never sees in its original form. Principle VII normally requires signaling "when relevant." The product decision is that this override is *not* relevant to signal: the advertiser reviews and approves the gated copy before anything renders (FR-000), so they are never shown one string and given another. There is no divergence for a signal to disclose. Silence is the feature (FR-013, SC-007) — surfacing a "we improved your copy" notice would add an interface surface with no decision attached to it. | Signaling was rejected because the advertiser has full editorial control *after* the gate: they can edit any field, and FR-019a guarantees the gate never touches an edited field. A signal would inform a decision the advertiser can already make unconditionally. The override remains fully **ruled** (FR-006 thresholds) and fully **traced** (FR-020 audit record + FR-020a log line), so the debugging obligation under the Operating Rules is met in full: for any faulty output, the trace answers what was selected, what was resolved, what was generated, and why it passed or failed contract. |

## Risks carried into implementation

| Risk | Mitigation |
|---|---|
| A module-global survivor is the intuitive implementation and is silently broken in production. A prior attempt at this feature reached for exactly that pattern. | R1, Contract I2, and a quickstart callout. Verify in a deployed environment, not only the emulator. |
| `_lastCopyDiversity` (`generators.ts:1387`) still uses the broken survivor pattern and is likely dead in production today. | **Pre-existing, out of scope.** Do not build on it, do not fix it here. Flag for a separate ticket. |
| Two `ResolutionTrace` definitions (`types.ts:353`, `generators.ts:5475`) — adding the field to one only is a silent-write hazard. | R9, Contract I3, explicit in the file list. |
| A rewrite could damage the raw block and desynchronise the frontend and backend views. | R4 value substitution + re-parse assertion (FR-000c), SC-006b. |
| Rewriting a transcribed testimonial would fabricate a customer quote. | FR-000f declares it untouchable; SC-010 asserts zero transcribed strings altered. |
| Latency added to a credit-consuming path. | Three enforced budgets; ceiling independent of item count; SC-006 measured at the largest batch and carousel sizes (T080). |
| Sign-off tooling makes live model calls and costs real credits, unlike every other test in this feature. | Runs once at sign-off against a non-production project, not in CI. R10 records why stubbing it would measure nothing. |

## Phase status

- **Phase 0 — Research**: complete. `research.md`, R1–R10, zero unresolved unknowns. R10 added 2026-08-02 after cross-artifact analysis.
- **Phase 1 — Design & Contracts**: complete. `data-model.md`, `contracts/copy-scoring-gate.md`, `quickstart.md`, agent context updated.
- **Phase 2 — Tasks**: complete. `tasks.md`, **82 tasks** across 8 phases — Setup, Foundational, US1–US4, Polish, Sign-off Evidence.
- **Cross-artifact analysis**: complete (2026-08-02). One CRITICAL finding (no coverage for SC-001/SC-002/SC-002a) resolved by R10 and Phase 8. Coverage 94%, zero critical issues remaining. Five LOW/MEDIUM findings carried, none blocking.
- **Next**: `/speckit.implement`.
