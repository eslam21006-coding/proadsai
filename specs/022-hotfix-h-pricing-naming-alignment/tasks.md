---

description: "Task list for HOTFIX-H — Final Pricing & Naming Alignment"
---

# Tasks: HOTFIX-H — Final Pricing & Naming Alignment

**Input**: Design documents from `/specs/022-hotfix-h-pricing-naming-alignment/`
**Prerequisites**: plan.md (loaded), spec.md (loaded), research.md (loaded), data-model.md (loaded), contracts/ui-labels.md (loaded), quickstart.md (loaded)

**Tests**: Per spec + research.md Decision 3, **no new automated tests are added**. Verification is the existing build pipeline (lint + typecheck + build) at repo root and inside `functions/`, plus 5 grep checks defined in HFH.8.

**Organization**: Tasks are grouped by user story so each can be implemented and verified independently. There are 3 user stories — US1 (Starter Pricing Accuracy), US2 (Label & Layout Naming Consistency), US3 (Build & Verification). US3 hard-depends on US1 + US2 because it is the launch gate.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Web app** layout: frontend at repo root `src/`, Cloud Functions at `functions/src/`. This hotfix touches only frontend.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm working state before any edit. There is no project initialization for this hotfix — the codebase, dependencies, and build pipeline are all preexisting.

- [ ] T001 Confirm current branch is `022-hotfix-h-pricing-naming-alignment`, working tree has no unrelated unstaged changes, and `git status` is clean apart from the in-progress hotfix branch state. (Verification only — no file edit.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None for this hotfix. There is no shared infrastructure to build, no schema migration, no new module, no entitlement change. The 7 edits in HFH.1–HFH.7 are atomic, independent, and additive on top of existing code.

**Checkpoint**: No foundational work required. Proceed directly to user-story phases.

---

## Phase 3: User Story 1 — Starter Pricing Accuracy (Priority: P1) 🎯 MVP

**Goal**: After this phase, the in-app pricing table shows Starter at $29/mo (monthly toggle) and $23.20/mo (annual toggle), matching the GHL checkout. Pro and Scale prices stay unchanged. Maps to HFH.1 and HFH.3.

**Independent Test**: Render the pricing table with the monthly toggle — Starter column header shows `$29/mo`. Toggle to annual — Starter shows `$23.20/mo`. Pro shows `$79/mo` / `$63.20/mo`; Scale shows `$179/mo` / `$143.20/mo`. (US1 does not require US2 to be done.)

### Implementation for User Story 1

- [ ] T002 [P] [US1] **HFH.1** — In the Starter plan record (`id: 'starter'`) of the `PLANS` object in `src/planconfig.ts` (currently at line 171), change `priceMonthly: 19` to `priceMonthly: 29` and `priceAnnualPerMonth: 15.20` to `priceAnnualPerMonth: 23.20`. Do NOT touch any other field on the Starter record (credits, limits, features, feature flags). Do NOT touch the `id: 'pro'` (line 183) or `id: 'scale'` (line 196) records.

- [ ] T003 [P] [US1] **HFH.3** — In the `plans` array of `src/components/PricingTable.tsx` (currently at line 23), in the Starter entry (`key: 'starter'`), change `monthly: 19` to `monthly: 29` and `annual: 15.20` to `annual: 23.20`. Do NOT touch the Pro entry (line 24) or the Scale entry (line 25). Do NOT touch any other field on the Starter entry (`name`, `sub`, `badge`, `ctaLabel`, `micro`, `cls`, `ctaCls`).

**Checkpoint**: At this point, US1 is independently fully functional. The in-app Starter price equals the GHL checkout amount. The label rename (US2) has not yet happened — that does not block US1's acceptance test.

---

## Phase 4: User Story 2 — Label & Layout Naming Consistency (Priority: P1)

**Goal**: After this phase, the in-app pricing table shows the corrected user-visible labels and the corrected row layout: Scale Exclusives row reads "Predictive CTR Engine" (not "Creative Scoring Engine"); Batch Rendering appears inside Render Studio (immediately after Carousel Ads), not Scale Exclusives; Offer Creative Modes shows `6 / All 21 / All 21`; Multi-Brand Workspaces / Scale cell renders without the "Soon" badge. Internal identifier `creativeScoringEngine` is preserved everywhere. Maps to HFH.2, HFH.4, HFH.5, HFH.6, HFH.7.

**Independent Test**: Render the pricing table and inspect, in order: (a) the Scale Exclusives section for the renamed row, (b) the Render Studio section for Batch Rendering's new position, (c) the Offer Creative Modes row values, (d) the Multi-Brand Workspaces row's Scale cell for absence of the Soon badge. Run `grep "Creative Scoring Engine" src/planconfig.ts src/components/PricingTable.tsx` — expect 0 matches. Run `grep "creativeScoringEngine" src/planconfig.ts` — expect ≥1 match (identifier preserved). (US2 does not require US1 to be done.)

### Implementation for User Story 2

- [ ] T004 [P] [US2] **HFH.2** — In `src/planconfig.ts`, find the user-facing label string `'Creative Scoring Engine'` (currently the `label:` value in the entry `{ key: 'creativeScoringEngine', label: 'Creative Scoring Engine', value: f.creativeScoringEngine, category: 'scaling' }` inside `buildFeatureLabels()` at line 140). Rename ONLY the `label:` value to `'Predictive CTR Engine'`. Do NOT rename the `key:` value `'creativeScoringEngine'`. Do NOT rename the boolean field `creativeScoringEngine` declared at line 87 or referenced at lines 164, 176, 189, 202, 270. Do NOT modify any reference to the file `creativeScoringEngine.ts` anywhere.

- [ ] T005 [US2] **HFH.4** — In the `featureRows` array of `src/components/PricingTable.tsx`, locate the row labeled `'Offer Creative Modes'` (currently at line 46). Change its `values` field from `['All 18+', 'All 18+', 'All 18+']` to `['6', 'All 21', 'All 21']`. Do NOT change the row's `section` (`'engine'`), `label`, or `note` fields.

- [ ] T006 [US2] **HFH.5** — In the `featureRows` array of `src/components/PricingTable.tsx`, locate the row labeled `'Batch Rendering'` (currently at line 63 with `section: 'scale'`). Change its `section` value from `'scale'` to `'studio'`. Then physically move the entire row entry so it appears immediately after the row labeled `'Carousel Ads'` (currently at line 58, `section: 'studio'`) and immediately before the next existing row in the array. Do NOT change the row's `label`, `note`, or `values` fields — `values` stays `[false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }]`.

- [ ] T007 [US2] **HFH.6** — In the `featureRows` array of `src/components/PricingTable.tsx`, locate the row labeled `'Creative Scoring Engine'` (currently at line 64, `section: 'scale'`). Change its `label` value from `'Creative Scoring Engine'` to `'Predictive CTR Engine'`. Do NOT change the row's `note` (`'AI ranks your creatives by predicted CTR'`), `section` (`'scale'`), or `values` (`[false, false, { text: '✓ Scale only', emphasis: true }]`).

- [ ] T008 [US2] **HFH.7** — In the `featureRows` array of `src/components/PricingTable.tsx`, locate the row labeled `'Multi-Brand Workspaces'` (currently at line 67, `section: 'scale'`). In its `values` array, in the third (Scale) entry, remove the `soon: true` property from the value object. The third entry must change from `{ text: '✓ Scale only', emphasis: true, soon: true }` to `{ text: '✓ Scale only', emphasis: true }`. Do NOT modify the first (Starter) value `false` or the second (Pro) value `false`. Do NOT modify the row's `label`, `note`, or `section`.

**Checkpoint**: At this point, US1 (if also done) AND US2 are both independently functional. All user-facing labels, row layouts, and visible features in the pricing table match the launch contract.

---

## Phase 5: User Story 3 — Build & Verification (Priority: P1)

**Goal**: Confirm the hotfix is shipping-ready: lint + typecheck + build pass at the repo root and inside `functions/`, and the 5 HFH.8 grep targets all return 0 matches in shipped code paths. Maps to HFH.8.

**Independent Test**: Each of T009, T010, T011 can be run in isolation against the post-edit working tree and yield a binary pass/fail.

**Hard Dependency**: This phase REQUIRES US1 (T002, T003) AND US2 (T004, T005, T006, T007, T008) to be complete. Running US3 against an incomplete edit set will fail (e.g., `grep "15.20"` will find the stale value if T002 didn't land; `grep "Creative Scoring Engine"` will find the stale label if T004 or T007 didn't land). This dependency is intrinsic to a verification-gate story.

### Implementation for User Story 3

- [ ] T009 [P] [US3] **HFH.8 (root build)** — From the repository root `D:\proads-worktrees\proadsai-hotfix-h`, run `npm run lint && npm run typecheck && npm run build`. All three commands must exit 0. Any TypeScript or ESLint error indicates a typo in one of the 7 edits (most likely a stray comma, missing quote, or wrong type) — read the error, fix the offending line in the named file, re-run. Do NOT add new dependencies, do NOT modify scripts, do NOT touch CI config.

- [ ] T010 [P] [US3] **HFH.8 (functions build)** — From the `functions/` directory, run `npm run lint && npm run typecheck && npm run build`. All three commands must exit 0. (`functions/` is not edited by this hotfix; this is a no-regression check that no downstream backend file silently depends on a frontend type or constant that changed.)

- [ ] T011 [P] [US3] **HFH.8 (grep gate)** — From the repository root, run each of the 5 grep checks against `src/` and `functions/src/`, excluding `**/__tests__/**` and `**/*.test.ts`. Each check MUST return zero matches:
  1. `"$197"` (no occurrence in shipped code)
  2. `"15.20"` (Starter old annual value — must be gone after T002 + T003)
  3. `"$19/mo"` (Starter old monthly text — must be absent in shipped paths)
  4. `"Creative Scoring Engine"` (user-facing label — must be gone after T004 + T007)
  5. `"2 months free"` (discontinued annual-savings phrasing)

  Equivalently, run from repo root:
  ```
  git grep --untracked '\$197' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
  git grep --untracked '15\.20' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
  git grep --untracked '\$19/mo' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
  git grep --untracked 'Creative Scoring Engine' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
  git grep --untracked '2 months free' -- 'src/' 'functions/src/' ':!src/**/__tests__/**' ':!functions/src/**/__tests__/**' ':!**/*.test.ts'
  ```
  Each command must produce no output. Any match → identify the missed file, apply the matching task (T002–T008), re-run.

  **Operational note (false-positive handling)**: if a grep produces a match in a non-test file outside the spec'd `**/__tests__/**` and `**/*.test.ts` exclusions — for example, a `tests/` directory at repo root or a `*.spec.ts` file (some toolchains use `.spec.ts` rather than `.test.ts`) — that is clearly a fixture/historical reference, broaden the exclusion at the command line (additional `':!path'` filters for `git grep`) and re-run T011. Do NOT change the spec FR-008 / SC-008 exclusion globs — those mirror HFH.8 verbatim. The recipe (this task) may add filters; the contract (the spec) stays fixed.

**Checkpoint**: All 8 HFH.N rows are now closed. The hotfix is launch-ready.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: None for this hotfix. Per Constitution Principle XII (Deferred Scope MUST Remain Deferred) and the user's explicit "no scope creep" directive, no documentation updates, refactors, or extra tests are added beyond what HFH.1–HFH.8 require. The four HFH-Out-of-Scope items (`creativeScoringEngine` field rename, `creativeScoringEngine.ts` file rename, GHL marketing site, Stripe price IDs) explicitly stay deferred.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No external dependencies. Single trivial verification task.
- **Phase 2 (Foundational)**: Empty by design.
- **Phase 3 (US1)**: Depends only on Phase 1.
- **Phase 4 (US2)**: Depends only on Phase 1. Independently testable; does not require Phase 3.
- **Phase 5 (US3)**: Depends on **both** Phase 3 AND Phase 4. This is the launch gate.
- **Phase 6 (Polish)**: Empty.

### User Story Dependencies

- **US1 (P1)**: Independent. Tests pass even if US2 is incomplete (Pro/Scale columns and labels are unchanged from pre-hotfix state in either case).
- **US2 (P1)**: Independent. Tests pass even if US1 is incomplete (the Starter column would still show `$19/mo`, but US2's acceptance is about labels/layout, not Starter price).
- **US3 (P1)**: Hard-depends on US1 AND US2. Cannot pass its grep gate or its rendered-pricing checks until both are done.

### Within Each User Story

- **US1**: T002 and T003 touch different files → can run in parallel.
- **US2**: T004 touches `src/planconfig.ts`; T005, T006, T007, T008 touch `src/components/PricingTable.tsx`. T004 [P] runs in parallel with T005..T008. T005, T006, T007, T008 share the same file and must run sequentially (in the listed order is fine; conflict-safe order is fine — they edit non-overlapping rows).
- **US3**: T009, T010, T011 are read-only verification commands. All [P] — can run in parallel.

### Cross-Story File Conflicts

- **`src/planconfig.ts`** is touched by T002 (US1) and T004 (US2). Same file, non-overlapping line ranges (line 171 vs line 140), but a single dev should sequence them to avoid edit-tool conflicts. Two devs working in parallel must coordinate (`git rebase` or merge with manual review).
- **`src/components/PricingTable.tsx`** is touched by T003 (US1) and T005, T006, T007, T008 (US2). Same file, non-overlapping line ranges (line 23 vs lines 46/63/64/67). Same coordination guidance as above.

### Parallel Opportunities

- T002 + T003 (US1, different files) → fully parallel.
- T004 + (T005..T008) (US2, T004 is in a different file) → T004 runs in parallel with T005..T008.
- T009 + T010 + T011 (US3, all read-only verification) → fully parallel.
- US1 and US2 can be developed in parallel by two devs if file-level edit coordination is handled (see Cross-Story File Conflicts above).

---

## Parallel Example: User Story 1

```bash
# Launch both edits for User Story 1 together (different files, no conflict):
Task: "Edit src/planconfig.ts: PLANS.starter.priceMonthly 19→29, priceAnnualPerMonth 15.20→23.20 (T002)"
Task: "Edit src/components/PricingTable.tsx: plans[0].monthly 19→29, plans[0].annual 15.20→23.20 (T003)"
```

## Parallel Example: User Story 2

```bash
# T004 in different file from T005..T008 → can launch alongside the PricingTable.tsx batch:
Task: "Edit src/planconfig.ts:140 label 'Creative Scoring Engine'→'Predictive CTR Engine' (T004)"

# T005..T008 share src/components/PricingTable.tsx → run sequentially:
# 1. Task: "Edit featureRows Offer Creative Modes values to ['6','All 21','All 21'] (T005)"
# 2. Task: "Edit featureRows: move Batch Rendering to section 'studio', position after Carousel Ads (T006)"
# 3. Task: "Edit featureRows: rename Creative Scoring Engine row → Predictive CTR Engine (T007)"
# 4. Task: "Edit featureRows: remove soon:true from Multi-Brand Workspaces / Scale cell (T008)"
```

## Parallel Example: User Story 3

```bash
# All read-only — fully parallel:
Task: "Run npm run lint && npm run typecheck && npm run build at repo root (T009)"
Task: "Run npm run lint && npm run typecheck && npm run build inside functions/ (T010)"
Task: "Run 5 grep checks for HFH.8 sentinel strings (T011)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (T001).
2. Skip Phase 2 (empty).
3. Complete Phase 3 / US1 (T002, T003) — Starter price now matches GHL checkout in code.
4. Run a partial verification: build at root succeeds, `git grep "15.20" src/` returns 0.
5. **STOP and VALIDATE**: This alone closes the highest-risk symptom (refund risk from price mismatch).
6. Demo / sanity-check before continuing.

> **Why US1 alone is a viable MVP**: The launch-blocking risk identified in spec.md is "user pays $29 on GHL but sees `$19/mo` on the in-app pricing table → refund + trust break." US1 alone resolves that. US2 closes naming/layout drift, which is lower-risk; US3 is the verification gate. If a launch deadline forced shipping just one phase, US1 is the one.

### Incremental Delivery (recommended)

1. Phase 1 → US1 → US2 → US3, each as a separate commit.
2. After US1 + US2: the visual pricing table is fully aligned.
3. After US3: launch-ready — the grep gate has passed and both builds are green.
4. Each commit individually verifiable.

### Parallel Team Strategy (2 devs)

1. Dev A: T002 (US1, planconfig.ts), then T004 (US2, planconfig.ts).
2. Dev B: T003 (US1, PricingTable.tsx), then T005–T008 (US2, PricingTable.tsx) sequentially.
3. Both devs converge: run T009, T010, T011 in parallel.
4. Single commit or two coordinated commits.

---

## Notes

- Total tasks: **11** (T001..T011).
- T001: 1 setup task, no story label.
- T002, T003: 2 tasks for US1 (Starter Pricing Accuracy).
- T004, T005, T006, T007, T008: 5 tasks for US2 (Label & Layout Naming).
- T009, T010, T011: 3 tasks for US3 (Build & Verification).
- Polish phase: 0 tasks (intentional — see Phase 6 rationale).
- Estimated total diff: < 30 lines across 2 files.
- Edit-tool guidance: every edit is a single-line or short-block string replacement. Use `Edit` with `old_string`/`new_string` exact matches; `replace_all` is NOT needed (and would be unsafe — risk of touching test fixtures).
- **Do NOT** rename the boolean entitlement key `creativeScoringEngine` anywhere. **Do NOT** rename the file `functions/src/creativeScoringEngine.ts`. **Do NOT** touch Pro or Scale prices. **Do NOT** touch GHL or Stripe assets.
- After all 11 tasks: branch is ready to be merged to `main` and the live app, the in-app pricing table, and the docs all agree.
