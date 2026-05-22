# Phase 0 Research: Post-Phase-21 Drift Audit Remediation

All decisions below resolve the open items in plan.md's Technical Context. The stack itself carries no unknowns (it is the existing audited codebase); the research is about *how* to remediate and verify, not *what* to build.

## R1 — Done-condition verification tooling

**Decision**: Tiered verification matching each fix's nature, governed by the 2026-05-21 proof protocol:
- **Backend logic** (resolver inputs, batch cap, brand deduction, classifyError) → Node `assert/strict` fixtures in `functions/src/contractFixtures.test.ts` (or the relevant `__tests__/*.test.ts`), run via `npm test`.
- **Callable boundary + Firestore writes** (failure records, costEstimate, copyFidelityWarning, getInviteDetails, getUserProjects, trace persistence) → **grep proof that the value appears in the `index.ts` response shape AND the Firestore write**, plus Firebase Local Emulator Suite integration runs where a live callable round-trip is needed.
- **Frontend wiring/render** (join route, testimonial dispatch, toast/banner/notice, access matrix, reflow dispatch) → **manual smoke against the emulator with real data** confirming the element renders and the live path executes (not synthetic test inputs).
- **Wiring/dead-code** (validateLogoPlacements, buildFinalImagePrompt, getUserProjects client call) → grep proof that **zero dead-code references remain** (called from the live path, not only tests).

**Rationale**: The audit's central failure mode was passing unit tests over unwired code. Unit-only verification would reproduce it. The protocol forces evidence at the exact boundary where values were being dropped.

**Alternatives considered**: (a) Automated fixtures only — rejected: cannot prove UI dispatch/render wiring, the most common gap. (b) Live dev-project smoke for everything — rejected: slow, credit-costly, hard to gate. (c) Manual-only — rejected: not repeatable, regressions recur.

## R2 — CI runner (FR-216)

**Decision**: Add a single GitHub Actions workflow `.github/workflows/ci.yml` that, on push/PR, runs `npm ci && npm run build` in both root (`src/`) and `functions/`, then `cd functions && npm test`, and blocks merge on failure. Node version pinned to the repo's engines field.

**Rationale**: No `.github/workflows` exists today, so the Tier-2 test-wiring fixes (FR-203/204/205/214) and the parity test (FR-215) enforce nothing without a runner. GitHub Actions is the lowest-friction choice for a repo already on GitHub, requires no extra infra, and the test command (`npm test`) is already the aggregate gate.

**Alternatives considered**: (a) No CI, local-only — rejected at clarification (SC-201/302 require enforcement). (b) Firebase CI / Cloud Build — rejected: heavier setup, no advantage for a Node test suite. (c) Pre-commit hooks only — rejected: bypassable, not a merge gate.

## R3 — The `index.ts` response-shaping / client-dispatch remediation pattern

**Decision**: For every Tier-1/Tier-2 boundary fix, follow one canonical pattern: (1) `generators.ts` computes the value (already does in most cases); (2) the relevant `serverGenerate*` callable in `index.ts` **includes the value in its returned object** (the missing step); (3) the client (`App.tsx` / a service in `src/services/`) **reads it and acts** (renders the signal / writes it via `saveGeneration`). Each fix is proven by the R1 cross-boundary grep.

**Rationale**: The audit's #1 systemic finding is that values die at this boundary (P1/P4/P5/P6/P7/P12/P15). A single repeated pattern keeps the fixes uniform and the proof mechanical (grep both sides).

**Alternatives considered**: Re-architecting the callable layer into a shared envelope type — rejected for this remediation: larger blast radius than warranted; the surgical per-callable shape change is lower-risk and matches the spec's "wiring, not new features" constraint.

## R4 — Resolution-trace persistence pattern (Tier-3 keystone, FR-301)

**Decision**: Replicate the `reflowImage` transaction (`functions/src/reflowImage.ts:492-519`) — a Firestore transaction that read-modify-writes the resolution trace onto the source `generations/{genId}` document — into the main generation-completion path. Persist `resolutionTrace` as an **additive optional field**; do not break legacy reads.

**Rationale**: `reflowImage` is the only place in the codebase where the trace is genuinely persisted and is proven to work; copying its pattern is the lowest-risk way to close the observability half of Phases 1/5/6/7/15/16 in one fix. Additive shape avoids a migration.

**Alternatives considered**: (a) A separate `traces/{genId}` collection — rejected: extra collection + join, and the spec/contract scopes trace to the generation doc. (b) Client-side trace write — rejected: the trace is computed server-side; the client never sees it.

## R5 — Correct team-access data model (FR-211)

**Decision**: `resolveCallerScope` (`functions/src/workspaces/workspacePolicy.ts:116-132`) must read the **canonical** model used elsewhere in the codebase: team members live at `users/{ownerUid}/team/{autoId}` (auto-ID docs) with the member's uid in a `uid` field and their granted workspaces in a `workspaceAccess` array — queried via `.where('uid','==',callerUid)` (the pattern already correct in `getWorkspaceGenerations`, `index.ts:5768-5777`). The stale `users/{callerUid}/team/meta` + `members/{uid}.workspaceIds` path must be removed.

**Rationale**: The stale path is never written, so members fall through to their own projects (Phase 13 finding). Aligning to the proven `getWorkspaceGenerations` pattern fixes both Phase 13 listing and removes the duplicate model.

**Dependency**: FR-119 (Phase 12 US4 access matrix) must actually write `workspaceAccess` before FR-211/FR-213 can return non-empty results — this is the **linked-fix sequencing** captured in the spec.

**Alternatives considered**: Keeping both models with a read-time merge — rejected: perpetuates the stale path and the drift risk.

## R6 — Deploy scope and sequencing

**Decision**: This branch is **code-ready + emulator-verified only**. Production `firebase deploy --only firestore:rules,firestore:indexes,functions` is performed by the owner as a separate gated step (the audit already documented Phase 12 rules as "committed-not-deployed"). Production-dependent success criteria (e.g., SC-104 live Meta publish) are validated post-deploy; until then they are emulator-verified.

**Rationale**: Decouples the fix branch from production infra changes ahead of the hosting cutover, and matches the clarification answer. Avoids coupling a large code change to an irreversible prod deploy.

**Alternatives considered**: Deploying as part of Done — rejected at clarification (couples to prod before cutover).

## R7 — Phase 21 / Stripe-migration sequencing (RESOLVED 2026-05-21)

**Decision**: Phase 21 / Stripe migration is **confirmed merged, deployed, and smoke-tested** (owner-confirmed 2026-05-21; spec on disk at `021-stripe-migration`). The billing-touching fixes — **FR-107/FR-108** (failure classification + refund via `refundCreditsServer`) and the plan-gating in **FR-134/FR-136** — implement against current code as specified. No post-migration re-verification or re-sequencing is required; all FRs proceed.

**Rationale**: The one open sequencing risk was that refund + plan-gating sit on the exact surfaces a Stripe migration would touch. With the migration confirmed live and smoke-tested, that risk is closed and the fixes target current code directly.

**Alternatives considered**: Implementing blind before confirmation — avoided; the gate was held until the owner confirmed the migration is live (honoring the audit's "marked Done ≠ live" warning for billing), which has now happened.
