---
description: "Task list for Plan Structure Alignment Hotfix (Phases 1–9)"
---

# Tasks: Plan Structure Alignment Hotfix (Phases 1–9)

**Input**: Design documents from `/specs/09.50-hotfix-plan-alignment/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅ (2 files)

**Tests**: Test tasks are INCLUDED because the spec defines test coverage as FR-028, FR-029, and SC-002 — fixture migration is part of the acceptance contract (see User Story 5).

**Organization**: Tasks are grouped by user story so each story can be independently implemented and validated.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- Include exact file paths in descriptions

## Path Conventions (from plan.md)

- **Frontend**: `src/` at repo root
- **Backend**: `functions/src/`
- **Tests**: `functions/src/contractFixtures.test.ts`, `functions/src/billing/__tests__/billingState.test.ts`

---

## Phase 1: Setup

**Purpose**: Confirm preconditions before any code change.

- [x] T001 Confirm branch `hotfix/plan-alignment` is checked out and working tree is clean via `git status`. Confirm baseline tests pass by running `cd functions && npm test` once and recording pass/fail count as a pre-hotfix baseline in the PR description.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Update the shared type surface and per-plan configuration records that every user story depends on. After this phase, the 3-plan `UserPlan` union is active and all stories can proceed in parallel.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. US1, US2, US3, US4, and US5 all require the new type union and `PLANS` record to exist.

- [x] T002 [P] Rewrite the `PLANS` record and `UserPlan` union in `src/planconfig.ts` per `contracts/planconfig-schema.md` §1–§2: (a) narrow `UserPlan` to `'none' | 'starter' | 'pro' | 'scale'`, (b) delete the `creator` entry, (c) rename `scaling` → `scale`, (d) add `savedProjectLimit` (Starter 10, Pro 30, Scale Infinity), `audienceAvatarLimit` (5 / 15 / Infinity), `batchConfig` (null / `{1,2,2,4}` / `{3,4,3,36}`), `carouselMaxSlides` (null / 7 / 10) per plan, (e) set `features.hookAngles/hookTypes/copywritingStrategies/adTones` to the literal `'full'` on every paid plan, (f) remove any `getAvailableHookAngles(plan)` / equivalent per-plan slicing helpers. **Field-rename cleanup**: DELETE the legacy fields `maxSavedProjects` (replaced by `savedProjectLimit`), `maxAvatars` (replaced by `audienceAvatarLimit`), and `maxCarouselSlides` (renamed to `carouselMaxSlides` — note the word-order flip). Audit `isPaidPlan()`, `canUse()`, `getMaxSlides()`, and `requiredPlanFor()` helpers in the same file for references to the legacy names and update their field accesses. After the change, run `grep -nE "\b(maxSavedProjects|maxAvatars|maxCarouselSlides)\b" src/planconfig.ts` and confirm zero non-comment hits.
- [x] T003 [P] Rewrite `functions/src/entitlements.ts`: narrow `BasePlan` type to `'starter' | 'pro' | 'scale'`, delete the `creator` block (lines ~104–130), delete the `scaling` block (lines ~160–190), remove `creator` and `scaling` from `PLAN_CREDITS` (lines ~221, ~223), add a `scale` block with the values from `contracts/planconfig-schema.md` §2.
- [x] T004 Implement (or extend) `resolveEntitlement()` in `functions/src/entitlements.ts` to match the behaviour matrix in `contracts/entitlement-resolver.md` §2 — cover all 6 boolean gates, 4 always-allowed features, and 5 quantity-bounded features (`carouselSlides`, `batchRun`, `teamInvite`, `savedProjectSave`, `audienceAvatarCreate`). Return `EntitlementDecision` exactly as specified in §1. Must remain pure (no I/O, see R-01). Re-export for frontend consumption via a shared barrel if not already re-exported. Depends on T002, T003.
- [x] T005 [P] In `functions/src/billing/billingState.ts`: (a) remove `creator` (L55, L65) and `scaling` (L57, L67, L111) from `PLAN_CREDITS` and `PLAN_HIERARCHY`, (b) add a `scale` key to both, (c) inside `buildBillingState()`, add a read-time legacy map at the top: if raw `users/{uid}.plan === 'creator'` emit `pro`, if `=== 'scaling'` emit `scale`, and log a structured event `plan.legacy_mapped` with `{ uid, legacy, canonical }` exactly once per call. Use the existing structured-logger. See research.md Decision 1.
- [x] T006 [P] In `functions/src/paddle/paddleClient.ts`: (a) remove `creator` (L11) and `scaling` (L13) from `PLAN_CREDITS`, add `scale`, (b) in `PADDLE_PRICE_TO_PLAN`, remap each Creator price ID (L60–61, 4 entries) from `{ plan: 'creator', credits: 1000 }` to `{ plan: 'pro', credits: 2500 }`; remap each Scaling price ID (L64–65, 4 entries) to `{ plan: 'scale', credits: 6500 }`. See research.md Decision 2.
- [x] T007 In `functions/src/creativeResolver.ts::validateLaunchSurface()`, remove any `creator` tier from the plan hierarchy check (research.md File Audit); route batch/retargeting/fantasy gating through the new `resolveEntitlement()` call added in T004. Depends on T004.
- [x] T008 In `src/types.ts` and `src/store.ts`, verify `UserPlan` is re-exported / consumed from `src/planconfig.ts` only (no inline redefinition). Remove any stale plan literal if present. No structural change expected — read + verify. Depends on T002.

**Checkpoint**: After T008, the entire `UserPlan` type surface is 3-plan. The type system will surface any consumer in `src/App.tsx` or `src/components/*` that still references `'creator'` or `'scaling'` as a compile error — these are addressed in Phase 5 (US4).

---

## Phase 3: User Story 1 — Starter user gets full creative engine (Priority: P1) 🎯 MVP

**Goal**: A Starter user opens Step 1 and every hook angle, hook type, copywriting strategy, and ad tone is selectable. Paid features (retargeting / fantasy / art direction / batch / carousel / reference ads) show a visible "Upgrade to Pro" locked-state affordance instead of being hidden or silently disabled.

**Independent Test**: Log in as a Starter account on the dev server. Open Step 1. Confirm all 11 hook angles, 12 hook types, 8 copywriting strategies, and 11 ad tones are enabled. Confirm all six paid-feature controls show the locked-state affordance. Matches quickstart.md §4.

### Implementation for User Story 1

- [x] T009 [US1] In `src/components/InputForm.tsx`, delete the per-plan slicing for the hook angle selector. Render all 11 angles from the single exported `HOOK_ANGLES` array regardless of `plan`. Remove any call site that filtered by plan.
- [x] T010 [US1] In `src/components/InputForm.tsx`, delete the per-plan slicing for the hook type selector. Render all 12 types for every paid plan.
- [x] T011 [US1] In `src/components/InputForm.tsx`, delete the per-plan slicing for the copywriting strategy selector. Render all 8 strategies for every paid plan.
- [x] T012 [US1] In `src/components/InputForm.tsx`, delete the per-plan slicing for the ad tone selector. Render all 11 tones for every paid plan.
- [x] T013 [US1] In `src/components/InputForm.tsx`, add a locked-state affordance (visible pill or overlay with copy "Upgrade to Pro") to each of the six paid-feature controls (retargeting toggle, fantasy universe selector, art direction section, batch toggle, carousel toggle, reference ad upload). Use `resolveEntitlement({ plan, feature })` to decide visibility on mount and on every plan change. When `allowed === false && reason === 'pro_plan_required'`, the control is disabled with the affordance; it MUST NOT be silently hidden (FR-020). Depends on T004. **Arabic-quality check (Principle V)**: the locked-state copy MUST reuse an existing i18n key present in both the `en` and `ar` locale files. Search for existing keys like `billing.upgradeToPro`, `plan.upgradeCta`, or similar before inventing a new one. If no suitable existing key exists, add a new key to both `en` and `ar` locale files with the Arabic translation before the locked-state component can render.

**Checkpoint**: After T013, User Story 1 is independently testable via quickstart.md §4. Deployable as an MVP if Phase 2 foundational work is complete.

---

## Phase 4: User Story 2 — Pro user unlocks batch / retargeting / fantasy / carousel within Pro limits (Priority: P1)

**Goal**: A Pro user can enable retargeting, fantasy, art direction, batch (up to 4 ads per run = 1 size × 2 hooks × 2 concepts), carousel (up to 7 slides), and reference ads. Exceeding a Pro cap surfaces an explicit inline + backend error rather than silent truncation.

**Independent Test**: Log in as a Pro account. Follow quickstart.md §5 — nine checks covering carousel slide bounds, batch combination bounds, and paid-feature accessibility.

### Implementation for User Story 2

- [x] T014 [P] [US2] In `src/components/InputForm.tsx`, configure the carousel slide-count selector to read `PLANS[plan].carouselMaxSlides` and render options `2..carouselMaxSlides` inclusive. For Pro this yields 2–7.
- [x] T015 [P] [US2] In `src/components/InputForm.tsx`, configure the batch UI: read `PLANS[plan].batchConfig`. When null, show locked affordance (already done in T013). When set, display the label "Up to {batchConfig.maxAdsPerRun} ads per run" and enforce individual picker caps (`maxSizes`, `maxHooks`, `maxConcepts`) as hard UI limits on the size / hook / concept pickers.
- [x] T016 [P] [US2] In `functions/src/generators.ts`, before starting a batch run, compute `requested = sizes × hooks × concepts` and call `resolveEntitlement({ plan, feature: 'batchRun', quantity: requested })`. If `allowed === false`, throw `HttpsError('permission-denied', reason)`. For Pro this rejects any request where the product exceeds 4. Depends on T004.
- [x] T017 [P] [US2] In `functions/src/generators.ts`, before starting a carousel run, call `resolveEntitlement({ plan, feature: 'carouselSlides', quantity: slideCount })`. If `allowed === false`, throw `HttpsError('permission-denied', 'carousel_limit_exceeded')`. For Pro this rejects slide counts above 7. Depends on T004.
- [x] T017a [US2] In `src/pages/Team.tsx`, replace the existing `currentCount = teamMemberCount + teamOpenInvites; currentCount >= maxTeamMembers` check with an owner-inclusive resolver call: compute `proposedSize = teamMemberCount + teamOpenInvites + 2` (owner + the invite being sent), then `resolveEntitlement({ plan, feature: 'teamInvite', quantity: proposedSize })`. When denied, render the `reason` inline and show `{proposedSize - 1}/{limit}` in the member-count header. Also update the existing over-limit warning logic (Phase 6 T021 equivalent) to use `teamMemberCount + 1 > maxTeamMembers` (owner-inclusive comparison). Depends on T004. Closes FR-005.
- [x] T017b [US2] In `functions/src/index.ts::createTeamInvite`, apply the identical owner-inclusive gate: compute `proposedSize = teamMemberCount + teamOpenInvites + 2`, call `resolveEntitlement({ plan, feature: 'teamInvite', quantity: proposedSize })`, and throw `HttpsError('permission-denied', reason)` on deny. Preserves frontend/backend truth parity (Principle XI). Depends on T004. Closes FR-005 backend side.
- [x] T017c [US2] In `src/App.tsx` (audit for exact component — likely the save-project button handler around the project-list code path), wrap the save-new-project action in `resolveEntitlement({ plan, feature: 'savedProjectSave', quantity: currentCount + 1 })`. When `allowed === false && reason === 'saved_project_limit_exceeded'`, render an inline error via `t('billing.savedProjectOverLimit', { current: currentCount, limit })` (add key to `en` + `ar` if missing) with text equivalent to "You're already at {currentCount}/{limit} saved projects — delete some or upgrade to save more." Do NOT block read, edit, or delete of existing records (soft-grandfather, FR-006). Depends on T004.
- [x] T017d [US2] In the audience-avatar create handler (audit for exact file — likely `src/pages/Audiences.tsx` or equivalent under `src/components/`), apply the same pattern with `feature: 'audienceAvatarCreate'`. Inline message key: `billing.audienceAvatarOverLimit` with `{ current, limit }` interpolation; text equivalent to "You're already at {currentCount}/{limit} audience avatars — delete some or upgrade to save more." Soft-grandfather rule (FR-007). Add the i18n key to both `en` and `ar` if missing. Depends on T004.

**Checkpoint**: After T017d, User Story 2 is independently testable via quickstart.md §5 (plus new steps for team-invite owner-inclusive gate and soft-grandfather over-cap UI message).

---

## Phase 5: User Story 4 — Zero `creator` or `scaling` identifier remains anywhere (Priority: P1)

**Goal**: A repo-wide text search for `creator` or `scaling` in a plan context returns zero results. This closes the Principle XI loop — every companion file that leaked the legacy literals is cleaned up.

**Independent Test**: Run `grep -rnE "\b(creator|scaling)\b" src/ functions/src/ --include="*.ts" --include="*.tsx"`. Expect zero plan-related hits (quickstart.md §1). TypeScript build (`npm run build` + `cd functions && npx tsc --noEmit`) produces zero errors (quickstart.md §2).

**Note on ordering**: This phase is listed after US2 because it picks up the compile-error trail that the narrowed `UserPlan` union (T002) surfaces in companion files. It is still P1 per spec priority.

### Implementation for User Story 4

- [x] T018 [P] [US4] In `src/App.tsx`, replace all `creator`-related and `scaling`-related references (~14 hits per research.md audit, lines 456, 501, 1650–1655, 1661–1665, 2379–2380, 2564, 7642, 7661, 7784–7786): (a) delete `creator_monthly` / `creator_annual` checkout-URL cases entirely, (b) rename `scaling_monthly` / `scaling_annual` checkout URLs to `scale_monthly` / `scale_annual`, (c) replace plan arrays `['starter','creator','pro','scaling']` with `['starter','pro','scale']`, (d) update plan-hierarchy order arrays accordingly, (e) remove the `'scaling'` onboarding business-type id at L456/L501 (or rename to `'scale'` if still needed for that unrelated field — audit the usage first).
- [x] T019 [P] [US4] In `src/components/PricingTable.tsx`: (a) delete the `creator` section entirely from the `SECTIONS` array (L15) and the creator plan card key (L24), (b) rename the `scaling` section id and plan card key to `scale` (L15, L26), (c) update the feature-row block for the scale section (L71–75), (d) update the `highlight === 'scaling-col'` conditional to `'scale-col'` (L93), (e) update any hardcoded UI tier label from "Scaling" to "Scale".
- [x] T020 [P] [US4] In `functions/src/index.ts`: (a) delete the `creator*` entries from `PLAN_NAMES` (L56–75), (b) rename the `scaling*` entries to `scale*`, (c) in the Paddle price map around L85–90, remove Creator price-ID mappings and rename Scaling mappings to `scale`, (d) update `PLAN_LIMITS` (L338) and `PLAN_TEAM_LIMITS` (L2116) to drop `creator` and rename `scaling` → `scale`, (e) update `.where('plan', 'in', ['starter', 'creator', 'pro', 'scaling'])` (L343–344) to `['starter','pro','scale']`, (f) delete the legacy Stripe-to-plan mapping block at L1147–1156 (plan is now Paddle-only per Phase 8).

**Checkpoint**: After T020, SC-001 evidence is in place. `grep` + `tsc` both clean.

---

## Phase 6: User Story 3 — Scale user gets the ceiling advertised on the pricing page (Priority: P2)

**Goal**: A Scale user can run batch up to 36 ads per run (3×4×3), carousel up to 10 slides, save unlimited projects and audience avatars, and invite up to 10 team members (owner-inclusive). Numeric ceilings match the pricing page exactly.

**Independent Test**: Log in as a Scale account. Follow quickstart.md §6 — six checks covering carousel bounds, batch bounds, saved-project unlimited, team-invite cap.

**Note**: Most of the code paths for Scale are already active after Phases 2, 4 — the plan-driven reads from `PLANS['scale']` automatically produce Scale behaviour. This phase adds the verification layer and two Scale-specific guards.

### Implementation for User Story 3

- [x] T021 [P] [US3] Verify that `src/components/InputForm.tsx` (from T014) correctly renders 2–10 options for the carousel slide-count selector when `plan === 'scale'`. No code change expected if T014 reads `PLANS[plan].carouselMaxSlides`; otherwise fix the read path.
- [x] T022 [P] [US3] Verify that `src/components/InputForm.tsx` (from T015) displays "Up to 36 ads per run" for Scale and enforces `maxSizes: 3`, `maxHooks: 4`, `maxConcepts: 3` as picker caps. No code change expected; if any hardcoded Pro value (e.g., `maxHooks: 2`) leaked, fix.
- [x] T023 [US3] In `functions/src/generators.ts`, confirm the `batchRun` and `carouselSlides` gates from T016 and T017 drive the Scale limits off `PLANS.scale.batchConfig.maxAdsPerRun` (= 36) and `PLANS.scale.carouselMaxSlides` (= 10) rather than hardcoded values. Add a regression comment tying back to this task ID and the contract §2 if the gate has any residual constant. Depends on T016, T017.

**Checkpoint**: After T023, User Story 3 is independently testable via quickstart.md §6.

---

## Phase 7: User Story 5 — Contract fixtures reflect the 3-plan world (Priority: P2)

**Goal**: Every contract fixture passes against the 3-plan structure. Legacy Creator-tier scenarios are retargeted to Pro. New fixtures cover the legacy read-time mapping and the full entitlement resolver matrix.

**Independent Test**: Run `cd functions && npm test`. Every plan-related fixture passes. Fixture count matches the target in `contracts/entitlement-resolver.md` §5 (82 entitlement fixtures + 2 legacy-mapping fixtures). No fixture references `'creator'` or `'scaling'`.

### Implementation for User Story 5

- [x] T024 [P] [US5] In `functions/src/contractFixtures.test.ts`: (a) find every fixture with `plan: 'creator'` and replace with `plan: 'pro'` (HF.10 mandate — Creator-tier features are now bundled into Pro), (b) find every fixture with `plan: 'scaling'` and replace with `plan: 'scale'`, (c) update any batch fixture that previously expected Pro to fail — Pro should now pass at cap=4, fail at 5, (d) update any carousel fixture Pro-max from 5 → 7, Scale-max from 9 → 10.
- [x] T025 [P] [US5] In `functions/src/contractFixtures.test.ts`, add new fixtures per `contracts/entitlement-resolver.md` §5 checklist to reach 82 entitlement fixtures total: 24 boolean-gate (6 features × 4 plans), 16 always-allowed (4 features × 4 plans), 40 quantity-bounded (5 features × 4 plans × 2 boundary cases at-limit / over-limit). Use a parameterised Jest `describe.each` pattern to keep the file readable. Additionally, add 4 owner-inclusive team-invite boundary fixtures that exercise T017a/T017b: (a) Pro at seat count 3 (owner + 2) → new invite denied with `team_limit_exceeded, limit: 3`; (b) Pro at seat count 2 → new invite allowed; (c) Scale at seat count 10 → new invite denied; (d) Scale at seat count 9 → new invite allowed.
- [x] T026 [P] [US5] In `functions/src/billing/__tests__/billingState.test.ts`: (a) migrate 6 `creator` fixtures (L78–87, L168, L252–259) to `pro` — adjust expected credits / ranks accordingly, (b) migrate 4 `scaling` fixtures (L93–104, L325–330) to `scale`, (c) add 2 new fixtures for the legacy read-time mapping: (i) input `users/{uid}.plan = 'creator'`, assert `buildBillingState()` returns `{ plan: 'pro', ... }` and logs `plan.legacy_mapped`, (ii) input `plan = 'scaling'`, assert output `plan: 'scale'` and same log. Depends on T005.
- [x] T026a [P] [US5] Add a cross-module parity test in `functions/src/contractFixtures.test.ts` that imports both the frontend `PLANS` record (from `../../src/planconfig`) and the backend `PLAN_FEATURES` record (from `./entitlements`), then asserts per-plan equality of: (a) `features.retargeting / fantasyUniverse / artDirection / batch / carousel / referenceAds` booleans, (b) `maxTeamMembers`, (c) `carouselMaxSlides`, (d) `batchConfig.maxAdsPerRun`. Implements `contracts/planconfig-schema.md` invariant C-10 and `contracts/entitlement-resolver.md` invariant R-07. Principle XI evidence. Depends on T002, T003.

**Checkpoint**: After T026a, full test suite passes. `cd functions && npm test` is green. Cross-module drift is detectable at CI time.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Verify the hotfix holistically against the Success Criteria. No new behaviour is introduced in this phase — only evidence capture.

- [x] T027 [P] Run `grep -rnE "\b(creator|scaling)\b" src/ functions/src/ --include="*.ts" --include="*.tsx" | grep -v "// legacy" | grep -v "legacy_mapped"`. Confirm zero output. If anything appears, open an issue and fix before merge. Evidence for SC-001. **Indirect-plan-reader audit (FR-027)**: after the primary grep passes, also run `grep -rnE "plan\s*(===|==|!=|!==)\s*['\"](\w+)['\"]" functions/src/ src/` to find every plan-literal comparison. Confirm each matched literal is one of `'none'|'starter'|'pro'|'scale'`. Any `'creator'` or `'scaling'` hit here indicates an indirect plan-reader that the primary word-boundary grep missed — fix before merge.
- [x] T028 [P] Run `npm run build` at repo root and `cd functions && npx tsc --noEmit`. Confirm zero type errors on both. Commit the build output to the PR description for Principle IX evidence.
- [x] T029 [P] Run `cd functions && npm test` and capture the final pass count. Compare against the baseline from T001 — the new pass count MUST be ≥ baseline + (fixtures added in T025 + T026). Evidence for SC-002.
- [x] T030 Walk through `specs/09.50-hotfix-plan-alignment/quickstart.md` Sections 4–8 manually. Capture one screenshot per checkpoint (Starter flow, Pro flow, Scale flow, legacy-record mapping, soft-grandfather behaviour). Attach screenshots to the PR. Evidence for SC-003, SC-004, SC-005, SC-007, plus the soft-grandfather clarification. **Pricing-page parity (SC-006)**: open `/pricing` (the public pricing page) in one browser tab and the in-app Billing page in another. For each of Starter / Pro / Scale, record a six-row comparison in the PR description: credits, team seats, saved-project cap, audience-avatar cap, batch ads-per-run, carousel slides. Every value MUST match exactly. If any disagreement appears, do not merge — revert the UI value or update the pricing page, whichever matches the authoritative source (`docs/LAUNCH_MATRIX.md` Section 14 HF.1).
- [x] T031 Final commit and push to `hotfix/plan-alignment`. Open a PR with (a) the baseline-vs-post test delta from T029, (b) the grep result from T027, (c) the screenshots from T030, (d) a link to `specs/09.50-hotfix-plan-alignment/spec.md` and `plan.md` in the PR description.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup (T001)**: No dependencies — start immediately.
- **Phase 2 Foundational (T002–T008)**: Depends on Setup. BLOCKS all user stories. Internal dependencies: T004 depends on T002 + T003; T007 depends on T004; T008 depends on T002. T002 / T003 / T005 / T006 can all run in parallel.
- **Phase 3 US1 (T009–T013)**: Depends on Phase 2 complete. T013 specifically depends on T004 (calls `resolveEntitlement`). T009–T012 edit the same file (`InputForm.tsx`) so run sequentially.
- **Phase 4 US2 (T014–T017d)**: Depends on Phase 2 complete. T014 + T015 edit the same file (`InputForm.tsx`) — run sequentially. T016 + T017 edit the same file (`generators.ts`) — run sequentially. T017a edits `src/pages/Team.tsx` (parallel to `InputForm.tsx` and `generators.ts` work). T017b edits `functions/src/index.ts` (sequential with T020 if both land — but Phase 5 T020 runs in a different phase, so parallel safe). T017c and T017d edit `src/App.tsx` and the avatar component — sequential within each file, but parallel-safe across files. The four groupings — `{T014,T015}`, `{T016,T017}`, `{T017a}`, `{T017b}`, `{T017c,T017d}` — are parallel-safe against one another (each group touches a different file).
- **Phase 5 US4 (T018–T020)**: Depends on Phase 2 complete. All three tasks edit different files and can run fully in parallel. **Note**: T020 and T017b both edit `functions/src/index.ts` — schedule T017b BEFORE T020, or merge the edits in a single PR commit to avoid conflict.
- **Phase 6 US3 (T021–T023)**: Depends on Phase 4 complete (re-verifies T014, T015, T016, T017 outcomes). T021 + T022 edit `InputForm.tsx` — sequential. T023 edits `generators.ts` — parallel to T021/T022.
- **Phase 7 US5 (T024–T026a)**: Depends on Phase 2 + Phase 4 + Phase 5 + Phase 6 complete (fixtures assert the final behaviour). T024 + T025 + T026a all edit `functions/src/contractFixtures.test.ts` — run sequentially. T026 edits a different file (`billingState.test.ts`) — parallel to the trio.
- **Phase 8 Polish (T027–T031)**: Depends on all prior phases. T027, T028, T029 are all read-only verification — fully parallel. T030 depends on T028 + T029 (dev server up, tests green). T031 depends on T030.

### User Story Dependencies

- **US1 (P1)**: Independent of all other stories. Runs on Phase 2 completion.
- **US2 (P1)**: Independent of US1. Runs on Phase 2 completion.
- **US4 (P1)**: Independent in implementation; but the narrowed `UserPlan` type from Phase 2 (T002) will surface compile errors in the US4 files, so US4 is naturally enqueued right after Phase 2. Does not block US1 / US2.
- **US3 (P2)**: Builds on US2's verification surface (same files, upper-bound values). Runs after US2.
- **US5 (P2)**: Asserts all prior work. Runs last among user stories.

### Parallel Opportunities

- **Within Phase 2**: T002, T003, T005, T006 all `[P]` — fully parallel. T004, T007, T008 sequential.
- **Within Phase 3**: tasks all hit the same file (`InputForm.tsx`) — **no parallel opportunities**. Sequential batching.
- **Within Phase 4**: Five parallelisable groups — `{T014,T015}` (InputForm.tsx, seq within), `{T016,T017}` (generators.ts, seq within), `{T017a}` (Team.tsx), `{T017b}` (index.ts — sync with T020 in Phase 5), `{T017c,T017d}` (App.tsx / Audiences.tsx, seq within file). Groups parallel across files.
- **Within Phase 5**: T018 || T019 || T020 — **fully parallel** if T017b has landed first, else T020 waits on T017b.
- **Within Phase 7**: `{T024,T025,T026a}` sequential (same file: `contractFixtures.test.ts`), T026 parallel to them (edits `billingState.test.ts`).
- **Across user stories once Phase 2 is done**: US1, US2, US4 can all run in parallel with three developers. US3 follows US2. US5 follows all of them.

---

## Parallel Example: Phase 2 Foundational

```bash
# After T001 (setup) completes, dispatch these four in parallel — four different files, no dependencies:
Task: "T002 — Rewrite PLANS + UserPlan in src/planconfig.ts"
Task: "T003 — Rewrite BasePlan + PLAN_FEATURES in functions/src/entitlements.ts"
Task: "T005 — Add legacy read-time map in functions/src/billing/billingState.ts"
Task: "T006 — Remap Paddle price IDs in functions/src/paddle/paddleClient.ts"

# After T002 + T003 both complete, run T004 (depends on both):
Task: "T004 — Implement resolveEntitlement() in functions/src/entitlements.ts"

# After T004 completes, run T007 in parallel with T008 (different files):
Task: "T007 — Wire validateLaunchSurface through resolveEntitlement"
Task: "T008 — Verify src/types.ts + src/store.ts consumption"
```

## Parallel Example: Phase 5 User Story 4

```bash
# All three in parallel — three different files:
Task: "T018 — Clean legacy plan refs in src/App.tsx"
Task: "T019 — Clean legacy plan refs in src/components/PricingTable.tsx"
Task: "T020 — Clean legacy plan refs in functions/src/index.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 Setup (T001) — confirm baseline.
2. Complete Phase 2 Foundational (T002–T008) — new `UserPlan` union live, `PLANS` record correct, legacy mapping in place. **CRITICAL** — blocks all stories.
3. Complete Phase 3 User Story 1 (T009–T013) — Starter user gets full creative engine.
4. **STOP and VALIDATE**: quickstart.md §4 (Starter smoke) passes.
5. At this point Starter UX is fixed and the type system is clean. You can deploy a limited alpha to Starter test accounts if needed.

### Incremental Delivery

1. Phase 1 + Phase 2 → Foundation ready.
2. Phase 3 US1 → MVP: Starter full engine → Deploy/Demo.
3. Phase 4 US2 → Pro caps + capabilities → Deploy/Demo.
4. Phase 5 US4 → Cleanup → `grep` clean → Deploy/Demo.
5. Phase 6 US3 → Scale ceilings verified → Deploy/Demo.
6. Phase 7 US5 → Full fixture coverage → Deploy.
7. Phase 8 Polish → Evidence pack → Merge.

### Parallel Team Strategy

With three developers after Phase 2 completes:

- Developer A: Phase 3 (US1)
- Developer B: Phase 4 (US2)
- Developer C: Phase 5 (US4)

Then Developer A or B picks up Phase 6 (US3) once Phase 4 lands. Any developer picks up Phase 7 (US5) once Phases 3–6 land. Phase 8 is typically a single pair-review pass.

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks.
- `[Story]` label maps each task to a user story for traceability (acceptance-scenario cross-check).
- Each user story is independently completable and testable against the quickstart.md section noted in its phase.
- Commit after each completed task (or logical group within a file) with the task ID in the commit message (e.g., `T013: add locked-state affordance for Pro-gated controls`).
- Stop at any checkpoint to validate the story independently against quickstart.md.
- Avoid: vague tasks, cross-story dependencies that break independence, file conflicts between parallel tasks.
- Principle IX (Proof Is Required): every completed task MUST have either a passing fixture (T025, T026) OR a quickstart walkthrough entry (T030). T027 + T029 are the codebase-wide acceptance evidence.
