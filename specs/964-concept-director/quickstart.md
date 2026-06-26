# Quickstart — Concept Director (Phase 20, Option A)

Manual + automated validation checklist. Backend-only; nothing changes in the UI except that, **with the flag on**, the three concept cards look more visually different.

## A. Build & unit tests (local)

```powershell
cd functions
npm run build          # zero TypeScript errors
npm test               # runs the appended conceptDirector.test.js among the suite
```

Expect (per FR-027 / FR-028):
- [ ] 3 balanced-mode briefs carry **distinct** `metaphorToken` values.
- [ ] Every brief has **≥3** `propsForbidden`.
- [ ] Each brief's `subStyleSpecialization.inheritedFrom` **equals** the user's subStyle exactly.
- [ ] A simulated model failure ⇒ `{ fallback: true }` for that concept.
- [ ] `heroGazeDirection` is always one of the 5 allowed values.
- [ ] One concept fallback ⇒ the other two still produce enriched briefs.
- [ ] Validator: balanced blocks when metaphor matches in 2 of 3.
- [ ] Validator: blocks when layout identical across all 3.
- [ ] Validator: non-duplicating set passes, no retry.
- [ ] Validator: a duplicate triggers exactly one retry; a still-failing retry ships as-is.

## B. Flag-off regression (default state)

- [ ] With `users/{uid}.conceptDirectorEnabled` absent/false, generate 3 concepts → output and latency match pre-Phase-20 (SC-007).
- [ ] `resolutionTrace.conceptDirector` records `ran:false`, `reason:"flag-disabled"` (or field absent on legacy) — no error.

## C. Flag-on happy path (test user)

Set `conceptDirectorEnabled: true` on a test user.
- [ ] Generate 3 concepts on the standard single-ad flow (`mode = initial`).
- [ ] The three concept cards show **different** visual metaphors, layouts, and headline treatments (not three poses of one idea).
- [ ] `resolutionTrace.conceptDirector.ran === true`, `conceptCount === 3`, `varianceAchieved === true` in the common case.
- [ ] User's selected sub-style / language / aspect ratio / brand are all respected (no override).
- [ ] Arabic project: brief free-text reads as Arabic; the three concepts stay culturally compliant.

## D. Fail-open paths (force each)

- [ ] Simulate model error for one concept → generation still succeeds; `fallbackCount ≥ 1`; that concept rendered by existing logic; no user-facing error; credits unchanged.
- [ ] Simulate model error/timeout for all three → result indistinguishable from flag-off; `fallbackCount === 3`.
- [ ] Force a hard-constraint violation (e.g. 2 forbidden props) → that concept falls back, not shipped malformed.
- [ ] Confirm a slow (>15s) Director call falls back rather than hanging the generation.

## E. Variance retry

- [ ] Force two concepts to share a metaphor token → exactly one retry of the offender; `retryCount ≥ 1`, `validatorTriggered === true`.
- [ ] Force the retry to also collide → ships as-is; `varianceAchieved === false`; **no** second retry (SC-005).

## F. Kill switch

- [ ] With flag on, set Remote Config `conceptDirectorKillSwitch = true`.
- [ ] Within ≤60s, new generations skip the stage for **all** users including flag-on ones; trace `ran:false`, `reason:"kill-switch-on"` (SC-006).
- [ ] Flip back to false → stage resumes within ≤60s. No deploy in either direction.

## G. Scope boundaries (must NOT run)

- [ ] Carousel generation with flag on → Director does **not** run; today's behavior; no count mismatch.
- [ ] Batch generation with flag on → Director does **not** run.
- [ ] `refresh` / `precision` / edit-one-concept → Director does **not** run.

## H. Constitution / audit

- [ ] Every flag-on generation writes `resolutionTrace.conceptDirector` (Principle VI).
- [ ] No existing trace field changed shape; legacy generations still load (SC-008).
- [ ] `grep` confirms `conceptDirector.ts` / `varianceValidator.ts` import nothing from `firebase-admin` / `firebase-functions` / Gemini SDK (purity).

## Rollback

1. Fastest: set `conceptDirectorKillSwitch = true` (≤60s, global).
2. Per-user: set `conceptDirectorEnabled = false`.
3. Code: remove the enrichment-injection line in `generateConcepts` + the Director loop in `serverGenerateConcepts`; pure modules become inert. No data migration (trace field is optional).
