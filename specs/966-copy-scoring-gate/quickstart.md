# Quickstart: Silent Copy Scoring & Rewrite Gate

**Feature**: `966-copy-scoring-gate` | **Branch**: `966-copy-scoring-gate`

Backend-only. No frontend work beyond one opaque passthrough field. All commands are PowerShell.

---

## What you are building

A silent gate between copy generation and the copy-fidelity contract. It scores every generated on-creative string on 9 dimensions, rewrites what falls below threshold, and hands improved strings to the existing contract — which carries them verbatim to the rendered image. Advertisers never see it. If it breaks, the original copy ships and the generation succeeds.

**Track 1 is already merged** — the reading-level and lived-symptom rule blocks are live in all four prompt surfaces. This feature *enforces* them.

---

## Read before writing code

1. `spec.md` — 53 FRs, 20 SCs, 17 clarifications
2. `research.md` — **R1 first.** It rules out the obvious implementation.
3. `contracts/copy-scoring-gate.md` — the clause list your tests assert
4. `data-model.md` — trace shape and state machine

---

## The one thing that will bite you

**Do not use a module-global survivor to carry the trace.**

`serverGenerateTOV` and `serverGenerateFinalAd` run in **separate Cloud Run containers**. A `let _lastCopyScoring` in `generators.ts` set during copy generation is `null` when the render callable reads it. This is documented in the codebase at `generators.ts:1389-1398`, where the Phase 20 concept-director trace was migrated off exactly this pattern:

> "worked in the emulator (shared process) but **NEVER in production**"

It will pass every test you write locally and write `undefined` in production. Use the HTTP boundary (Contract I1).

> `_lastCopyDiversity` (`generators.ts:1387`) still uses the broken pattern. It is a **pre-existing defect, out of scope** — do not build on it, do not fix it here.

---

## Files

**New**

```text
functions/src/copyScoringGate.ts              # gateCopySet + scorer/rewriter clients
functions/src/__tests__/copyScoringGate.test.ts
```

**Modified**

```text
functions/src/modelConfig.ts        # + COPY_SCORING_ENABLED, beside MODEL_PROVIDER
functions/src/copywriting_knowledge.ts  # annotate 9 active / 6 deferred (do NOT rewrite rule text)
functions/src/types.ts              # + ResolutionTrace.copyScoring        (:353)
functions/src/generators.ts         # + ResolutionTrace.copyScoring        (:5475)
                                    # attach at :1904, :8723, :9787
functions/src/index.ts              # + openaiApiKey to 3 callables; accept trace on finalAd
functions/package.json              # register the new test in the `test` chain
src/types.ts                        # opaque passthrough field (never rendered)
src/App.tsx                         # thread trace through state (never rendered)
```

---

## Build order

**1 — Kill switch first.** `COPY_SCORING_ENABLED` in `modelConfig.ts`. Everything else sits behind it, so an incomplete gate is inert.

**2 — Pure gate module.** `gateCopySet` with injected `score` / `rewrite` / `now`. No Firebase, no network, no `admin.firestore()` at module top level. Testable in isolation.

**3 — Tests alongside.** Write the fail-open cases before the happy path — Contract A1 (never throws) is the requirement that makes this safe to ship.

**4 — Scoring client.** `openai` SDK, JSON mode, 9 dimensions. Reject responses naming a deferred dimension.

**5 — Rewrite client.** Separate call. One per pass, all failing fields, per-field diagnoses, re-emitted claim flags.

**6 — Attach point 1: `generateTOV` (`:1904`).** Highest value — covers single, batch, and retargeting in one place, because batch authors no copy of its own.

**7 — Trace over HTTP.** Callable response → frontend state → `serverGenerateFinalAd` → `resolutionTrace.copyScoring`. Both `ResolutionTrace` definitions.

**8 — Attach points 2 and 3.** `generateCarouselSlideCopies` (`:8723`), `generateTestimonialCarousel` (`:9787`). For the testimonial step, gate **only** the authored hook (`:9823`) and close (`:9845`) — transcribed screenshots are the customer's own words and are untouchable.

**9 — Observability.** One structured log line per outcome.

---

## Verify

```powershell
cd .\functions
npm run build
npm test
npm run lint
```

Then the frontend:

```powershell
cd ..
npm install
npm run build
```

**Manual smoke — gate on vs off**, flipping `COPY_SCORING_ENABLED`:

| Check | Expect |
|---|---|
| Arabic single ad | Copy simpler, names a concrete moment; simple spoken فصحى |
| Same inputs, gate off | Original copy; identical credit cost |
| Per-field edit | Byte-identical gate-on vs gate-off (SC-005a) |
| 36-item batch | Same interaction count as a single ad (SC-005b) |
| Carousel | Approved hook block unchanged through the slide step (SC-006c) |
| Testimonial carousel | Authored hook improved; transcribed quotes byte-identical (SC-010) |
| Credential removed | Generation succeeds, original copy, no advertiser-visible error (SC-003) |

---

## Definition of done

- [ ] `npm test` green including the new file
- [ ] Both builds clean; lint clean
- [ ] Every Contract A–L clause has a test
- [ ] All 10 fail-open modes verified → original ships, generation succeeds
- [ ] Ceilings hold: ≤5 per copy set, ≤10 per run, batch parity
- [ ] Zero advertiser-visible change (SC-007)
- [ ] Trace readable end-to-end from the audit record alone (SC-009)
- [ ] Untouchable text byte-identical, transcribed testimonials never altered (SC-010)
- [ ] Flipping the switch off restores pre-feature behaviour with no code revert

---

## Reversal

Set `COPY_SCORING_ENABLED = false` in `functions/src/modelConfig.ts`, then rebuild and deploy the Cloud Functions (the constant is compiled into `lib/`, not read at runtime from the environment). One line, one redeploy, no git revert. The switch is permanent by design (FR-019e) — it is also how the gate-off baseline for SC-002 / SC-004 / SC-005a / SC-006 is produced after launch.
