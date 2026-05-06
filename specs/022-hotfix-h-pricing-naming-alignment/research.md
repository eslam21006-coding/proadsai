# Phase 0 Research: HOTFIX-H — Final Pricing & Naming Alignment

**Date**: 2026-05-06
**Branch**: `022-hotfix-h-pricing-naming-alignment`
**Source spec**: [spec.md](./spec.md)

## Premise

HOTFIX-H is a doc-vs-code alignment hotfix, not a feature build. The 8 task rows (HFH.1–HFH.8) in `docs/LAUNCH_MATRIX.md` are fully concrete: each names the file, the current value, the target value, and the Done-when condition. There were no `[NEEDS CLARIFICATION]` markers in spec.md. Phase 0 therefore had no unknowns to research; instead it served two purposes:

1. **Verify the current code state matches what HFH.N expects to find.** If the live values had drifted (e.g., the Starter price was already $29 in code), the hotfix would be partially or entirely a no-op — that needs to be discovered before tasks are emitted, not during execution.
2. **Confirm there are no other shipped-code occurrences of the strings HFH.8 grep-checks for.** If a Starter price `19` or `15.20` (or `Creative Scoring Engine`, `$197`, `$19/mo`, `2 months free`) appears in any file outside the two HFH targets, an additional task row is needed.

## Decision Log

### Decision 1 — Edit only the two named files; no third file is in scope

- **Decision**: This hotfix touches exactly `src/planconfig.ts` and `src/components/PricingTable.tsx`. No other source file is modified.
- **Rationale**: A grep for the HFH.8 sentinel strings across `src/` and `functions/src/` returned zero shipped-code matches outside the two HFH targets:
  - `Creative Scoring Engine` (user-facing label, with spaces): only at `src/planconfig.ts:140` (label literal, addressed by HFH.2) and `src/components/PricingTable.tsx:64` (label literal, addressed by HFH.6). Zero matches in `functions/src/`.
  - `$197`: zero matches in `src/`.
  - `$19/mo`: zero matches in `src/`.
  - `2 months free`: zero matches in `src/`.
  - `15.20` and `priceMonthly: 19` / `priceAnnualPerMonth: 15`: zero shipped-code matches in `functions/src/` (the backend has no hardcoded Starter price; it consumes the same `PLANS` shape via the API).
- **Alternatives considered**:
  - **Audit `entitlements.ts` and `useBillingState.ts` and rename `creativeScoringEngine`** — explicitly Out of Scope per HFH closing block. Rejected.
  - **Audit `functions/src/creativeScoringEngine.ts`** — explicitly Out of Scope (internal name). Rejected.
  - **Add additional task rows for newly-discovered drift** — none discovered. Not needed.

### Decision 2 — Current code values match HFH.N expectations

- **Decision**: Proceed with HFH.1–HFH.7 as literal in-place edits; no merge conflict or stale-target risk anticipated.
- **Rationale**: Direct grep on the targeted files confirms the pre-edit state HFH.N expects:
  - `src/planconfig.ts:171` — `id: 'starter', ..., priceMonthly: 19, priceAnnualPerMonth: 15.20,` ✔ matches HFH.1 starting state.
  - `src/planconfig.ts:140` — `{ key: 'creativeScoringEngine', label: 'Creative Scoring Engine', ... }` ✔ matches HFH.2 starting state.
  - `src/planconfig.ts:183` — Pro: `priceMonthly: 79, priceAnnualPerMonth: 63.20` ✔ already correct (must NOT change).
  - `src/planconfig.ts:196` — Scale: `priceMonthly: 179, priceAnnualPerMonth: 143.20` ✔ already correct (must NOT change).
  - `src/components/PricingTable.tsx:23` — Starter: `monthly: 19, annual: 15.20` ✔ matches HFH.3 starting state.
  - `src/components/PricingTable.tsx:24,25` — Pro/Scale: `monthly: 79/179, annual: 63.20/143.20` ✔ already correct.
  - `src/components/PricingTable.tsx:46` — `'Offer Creative Modes', ..., values: ['All 18+', 'All 18+', 'All 18+']` ✔ matches HFH.4 starting state.
  - `src/components/PricingTable.tsx:58` — `Carousel Ads` row in section `studio` ✔ confirms the destination position for HFH.5 (the line immediately after which Batch Rendering will move).
  - `src/components/PricingTable.tsx:63` — `{ section: 'scale', label: 'Batch Rendering', ..., values: [false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }] }` ✔ matches HFH.5 starting state.
  - `src/components/PricingTable.tsx:64` — `{ section: 'scale', label: 'Creative Scoring Engine', ... }` ✔ matches HFH.6 starting state.
  - `src/components/PricingTable.tsx:67` — `{ section: 'scale', label: 'Multi-Brand Workspaces', ..., values: [false, false, { text: '✓ Scale only', emphasis: true, soon: true }] }` ✔ matches HFH.7 starting state.
- **Alternatives considered**: none — the question is binary and the answer was verifiable in one pass.

### Decision 3 — Verification gate is exactly the four commands + five greps in HFH.8

- **Decision**: No new automated tests are added. Verification is `npm run lint && npm run typecheck && npm run build` at root, the same triplet inside `functions/`, plus the five grep checks documented in HFH.8.
- **Rationale**: HFH.8 is the canonical Done-when for the whole hotfix. Adding extra unit/integration tests would constitute scope creep — explicitly forbidden by the user's request and by Constitution Principle XII (Deferred Scope MUST Remain Deferred). The existing build pipeline already exercises the touched files via TypeScript compilation, ESLint, and Vite bundling, which catches typos, missing commas, and type drift on the literal values.
- **Alternatives considered**:
  - **Add a Vitest snapshot test of `featureRows`** — rejected: scope creep, plus the JSX-rendered output is already a stable snapshot of these literal values that any UI smoke test would catch.
  - **Add a unit test that asserts `PLANS.starter.priceMonthly === 29`** — rejected: redundant with the grep gate and the build gate, and adds maintenance burden for a one-shot alignment.

### Decision 4 — `creativeScoringEngine` identifier preservation is a hard invariant

- **Decision**: Edits MUST use exact string-literal replacement on the user-visible text only. The lowercase identifier `creativeScoringEngine` (no spaces) and any reference to the file `functions/src/creativeScoringEngine.ts` MUST stay.
- **Rationale**: HFH closing block lists this as Out of Scope. Renaming the entitlement key would cascade through `entitlements.ts`, `useBillingState.ts`, every Firestore record on `users/{uid}.billingState.features.creativeScoringEngine`, and every Firestore document containing the key — that is a separate, larger refactor with migration risk. By keeping the field name and renaming only the display label, the hotfix is purely cosmetic and ships without migration.
- **Alternatives considered**: rename the field — rejected: out of scope, migration risk, and the cosmetic problem is already solved by relabeling.

## NEEDS CLARIFICATION Resolution

**None.** spec.md contained no `[NEEDS CLARIFICATION]` markers, and Phase 0 verification surfaced no new ambiguities. The hotfix is fully specified.

## Open Questions Carried Forward

**None.** All ambiguities are resolved by the explicit Done-when conditions in HFH.1–HFH.8 and by the Out of Scope block.
