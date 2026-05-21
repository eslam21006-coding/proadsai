---
description: "Task list for Post-Phase-21 Drift Audit Remediation"
---

# Tasks: Post-Phase-21 Drift Audit Remediation

**Input**: Design documents from `/specs/023-post-drift-audit-fixes/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Authoritative evidence**: `MANUAL_QA_LOG.md` (re-verify each file:line anchor against current code before editing — the log is a 2026-05-21 snapshot).

**Tests**: Tests/verification ARE in scope (the spec mandates the 2026-05-21 proof protocol + FR-214/215/216). Each fix task's **done** is end-to-end-proven: backend → cross-boundary grep (value in the `index.ts` response shape AND the Firestore write); frontend → real-data emulator smoke; wiring → zero-dead-reference grep; then re-audit with the original methodology.

## Format: `[ID] [P?] [Story] Description`
- **[P]** = different file, no dependency on an incomplete task → parallelizable.
- Same-file clusters (`App.tsx`, `index.ts`, `generators.ts`, `InputForm.tsx`) are **sequential** (no `[P]`).
- **[US1]** = Tier 1, **[US2]** = Tier 2, **[US3]** = Tier 3.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Capture baseline: run `cd functions && npm run build && npm test`; record pass count + note the crashing `test:workspace` (FR-123 target) and absent lang/team suites (FR-203/205 targets).
- [x] T002 [P] Start/verify Firebase Local Emulator Suite (functions + firestore + storage) so callable/Firestore/Storage fixes can be smoke-verified per the proof protocol.
- [x] T003 [P] Confirm root frontend build green: `npm run build`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Note**: The Stripe gate that previously sequenced the billing-touching tasks is CLEARED (see T004); those tasks proceed as specified.

- [x] T004 Stripe gate CLEARED — Phase 21 / Stripe-migration confirmed merged, deployed, and smoke-tested (2026-05-21). The billing-touching fixes T018/T019 (FR-107/108) and T041/T042 (FR-134/136) proceed against current code as specified; no re-sequencing or post-migration re-verification is needed.
- [x] T005 [P] Create emulator seed helpers (team invite, team member with `workspaceAccess`, workspace with `metaAdAccountId`, generation with build plan) used by the per-tier smoke verifications.

**Checkpoint**: Baseline captured, emulator ready, Stripe gate cleared → Tier 1 may begin.

---

## Phase 3: User Story 1 — Tier 1 Launch Blockers (Priority: P1) 🎯 MVP

**Goal**: Every billed feature works end-to-end; no surface shows a non-executing state. **Highest severity: Phase 9 (team invites) + Phase 4 (testimonial) — do these first.**
**Independent Test**: quickstart.md Tier-1 recipe; gate = SC-101.

### Phase 9 — Team invites (highest severity)

- [x] T006 [US1] Re-implement + export `getInviteDetails` onCall in `functions/src/index.ts` (FR-103). Done: emulator round-trip returns details (not `functions/not-found`); `export const getInviteDetails` present.
- [x] T007 [US1] Re-implement + export `updateTeamMemberRole` onCall in `functions/src/index.ts` (FR-104). Done: emulator role change succeeds; `teamService.ts:14` resolves.
- [x] T008 [P] [US1] Add `/join` route in `src/main.tsx` rendering `JoinTeam.tsx` (FR-101). Done: `/join?inviteId=…` renders the join page, not the app.
- [x] T009 [P] [US1] Fix `src/pages/JoinTeam.tsx` query param `?id` → `?inviteId` (FR-102). Done: page loads details for a real invite link.
- [x] T010 [US1] Gate the Team nav button to `isTeamOwner` in `src/App.tsx` (FR-105). Done: non-owners do not see it.
- [x] T011 [US1] Add "removed from team" overlay on `isTeamMember` true→false in `src/App.tsx` (FR-106). Done: removed member sees the overlay on next action.
- [x] T012 [US1] SMOKE: invite → `/join` → claim end-to-end in emulator (acceptance scenario 1). Done: a new invitee completes a join.

### Phase 4 — Testimonial carousel (highest severity)

- [x] T013 [P] [US1] Register `serverGenerateTestimonialCarousel` in `src/services/geminiService.ts` callable registry (FR-111). Done: registry exposes it.
- [x] T014 [US1] Dispatch to `serverGenerateTestimonialCarousel` in `src/App.tsx` when `offerCreativeMode` includes `testimonial_carousel` + carousel (FR-112). Done: smoke shows the dedicated pipeline runs (platform detection), not the generic path.
- [x] T015 [US1] Fire `showToast(t('override.testimonial_requires_carousel'))` on single→carousel auto-switch in `src/App.tsx`/`InputForm.tsx` (FR-113). Done: toast fires on auto-switch.
- [x] T016 [US1] Render the `override.carousel_adjusted_testimonials` inline notice on slide-count adjust in `src/App.tsx` (FR-114). Done: notice renders.
- [x] T017 [US1] Unify testimonial slide-count to `+2` in `src/components/InputForm.tsx` (remove `+1` at `:1131`) (FR-115). Done: both sites compute `testimonialCount+2`.

### Phase 7 — Credit refund on failed generations (CRITICAL; gated by T004)

- [x] T018 [US1] Add catch-block failure integration to every generation callable in `functions/src/index.ts`: call `classifyError`, build the failure record, write `generations/{auto-id}` (FR-107). Done: forced failure writes a doc with `failureClass`.
- [x] T019 [US1] Wire credit refund for hard failures (`model_error`/`validation_reject`/`slot_repair_failed`) in `functions/src/index.ts`, skip pre-deduction + soft-fail (FR-108). Done: hard failure refunds; `credit_insufficient` does not.
- [x] T020 [US1] Add `costEstimate` to every generation callable success response in `functions/src/index.ts` (FR-109). Done: response carries `costEstimate`.
- [ ] T021 [US1] Pass `costEstimate`/`failureClass:null` to `saveGeneration` in `src/App.tsx`/`src/services/feedbackService.ts` (FR-110). Done: persisted record carries non-null `costEstimate`.

### Phase 5 — Copy-fidelity warning banner

- [ ] T022 [US1] Surface `copyFidelityWarning` as `{ warningCode:'copy_fidelity_degraded', failedFields }` in the `serverGenerateBuildPlan` response in `functions/src/index.ts` (FR-116). Done: grep shows it in the response shape.
- [ ] T023 [US1] Render the blocking Continue/Retry/Cancel banner (existing `fidelity.*` keys) in `src/App.tsx` on `warningCode` (FR-117). Done: smoke — banner blocks before image render.

### Phase 12 — Workspace / Scale headline value

- [ ] T024 [US1] Fix `metaPushCreativePack` to read `workspace.metaAdAccountId` (fallback user default) in `functions/src/index.ts` (FR-118). Done: smoke — publish from a linked workspace targets that account.
- [ ] T025 [US1] Build the per-member workspace-access matrix on the Team page + call `setTeamMemberWorkspaceAccess` (FR-119). Done: owner grants/revokes access (writes `workspaceAccess`). **LINKED: unblocks T046/T048.**
- [ ] T026 [P] [US1] Wire `WorkspaceAccessAuditPanel.tsx` into the Team page (FR-120). Done: owner can view the audit log.
- [ ] T027 [US1] Make `hasInProgressWork` a real selector in `src/store.ts` over the 8 generation fields (FR-121). Done: selector reflects in-progress state.
- [ ] T028 [US1] Pass `hasInProgressWork` to `<WorkspaceSwitcher>` at its render site in `src/App.tsx` (FR-121 cont.). Done: switching mid-generation opens the guard.
- [ ] T029 [US1] Remove direct `addDoc`/`setDoc` workspace writes in `src/App.tsx` (`:1729,1746`); route through `createWorkspace`/`updateWorkspace` callables (FR-124). Done: non-Scale/over-cap user cannot create a workspace client-side.
- [ ] T030 [US1] Pass `plan` + `metaAdAccounts` props to `WorkspaceSettingsModal` at `src/App.tsx:8681` (FR-125). Done: Scale gate + Meta section render per plan.
- [x] T031 [P] [US1] Fix the crashing workspace test suite (`functions/src/__tests__/workspace.test.ts:114` TypeError) (FR-123). Done: `npm run test:workspace` exits 0 with assertions.
- [x] T032 [P] [US1] Verify committed `firestore.rules` + `firestore.indexes.json` in the emulator/rules-playground (FR-122). Done: rules/indexes pass emulator verification (production deploy is the owner's separate step).

### Phase 15 — Brand colors (false promise)

- [x] T033 [US1] Gate the "Inheriting brand colors…" label in `src/components/InputForm.tsx` (T019a) so it shows only when `retargetingSourceId` resolves to a cold ad with colors (FR-126). Done: label appears only when inheritance will occur.
- [x] T034 [US1] Populate `_sourceColdAdBrandColors` from a `retargetingSourceId` doc lookup so `resolveBrandColors` inherits, in `functions/src/generators.ts` (FR-127). Done: retargeting with empty pickers inherits the cold ad's colors.
- [x] T035 [P] [US1] Call `applyBrandColorDeduction` from `_runBrandCompliance` and feed it into scoring in `functions/src/creativeScoringEngine.ts` (FR-128). Done: brand-primary-missing render reduces `overallScore` by 10 + records violation.

### HOTFIX-F — Aspect reflow (face stretching)

- [x] T036 [US1] Remove the `_internalReflow:true` bypass at `src/App.tsx:2274,4023,4075,4616`; route auto-variants through the `reflowImage` callable (FR-129). Done: grep — zero generative-edit REFLOW invocations from user flows.
- [x] T037 [US1] Fix the legacy single-reflow branch `src/App.tsx:4676` to call `reflowImage` `scope:'single'` (FR-130). Done: legacy single reflow runs the backend fallback chain, not an error.
- [x] T038 [P] [US1] Add bilingual i18n keys `reflow.fallbackToRerender`/`reflow.fallbackToOutpaint` in `src/i18n.tsx` + render the notice in `src/App.tsx` on `reflowResult.fallbackFrom` (FR-131). Done: an auto-fallback shows the dismissable notice.
- [x] T039 [US1] Replace carousel per-item retry (`handleCarouselSlideRetry`, `src/App.tsx:4200-4259`) with `reflowImage` `scope:'carousel_slide'` (FR-132). Done: retry invokes the deterministic router.
- [x] T040 [US1] Reset `reflowMethod` to `'auto'` on Step-4 navigation in `src/App.tsx` (FR-133). Done: returning to Step 4 shows Auto.

### Hotfix-09.50 — Plan-naming leaks (T042 gated by T004)

- [ ] T041 [P] [US1] Replace `'Creator'` at `src/components/InputForm.tsx:1849` with the correct current plan name (FR-134). Done: upgrade text names a real plan.
- [ ] T042 [US1] Wire `validateBatchRunEntitlement` into the batch generation path in `functions/src/index.ts`/`generators.ts` so Pro 4 / Scale 36 are server-enforced (FR-136). Done: a server-side over-cap batch is rejected.
- [ ] T043 [P] [US1] Add bilingual `billing.savedProjectOverLimit`/`billing.audienceAvatarOverLimit` keys in `src/i18n.tsx` and use them for the over-limit toasts (FR-135). Done: hitting either cap shows a translated toast.

### Hotfix-0951 + Hotfix-E

- [ ] T044 [US1] Invert `culturalViolation`: persist to `generations/{genId}` and strip from the client response in `functions/src/index.ts`/`generators.ts` (FR-137). Done: value on the doc, not in the client payload (grep both).
- [ ] T045 [P] [US1] Wire `validateLogoPlacements` before `compositeUILogos` (or move its clamps into `normalizeLogoPlacements`) in `functions/src/generators.ts` (FR-138). Done: an over-range/over-cap logo is clamped/dropped in the live render.

**Checkpoint (SC-101)**: Run the quickstart Tier-1 recipe; all Tier-1 acceptance scenarios pass, Phase 9 + Phase 4 verified first. → Tier 2 may begin.

---

## Phase 4: User Story 2 — Tier 2 System Integrity (Priority: P2)

**Goal**: Resolver gets its inputs, CI enforces, team access reads the right model, favorites quality, resolver parity.
**Independent Test**: quickstart.md Tier-2 recipe; gate = SC-201 (+ Tier-1 still passes).

### Phase 1 — Resolver inputs

- [ ] T046 [US2] Pass `visualStyleFamily`/`campaignType`/`referenceAdUsed`/`selectedSubStyle`/`selectedUniverse` to `resolveCreativeSpec` at all call sites (`generators.ts:399,2431,5716`; `index.ts:3944`; `layoutContract.ts:444`; `variantEngine.ts:133`) (FR-201). Done: minimal/precedence logic fires in prod (inspect trace/prompt).
- [ ] T047 [US2] Make `functions/src/generators.ts` read `referenceAdOverrideActive`/`artDirectionCleared` from the resolver result when building prompts (FR-202). Done: reference-ad upload suppresses art direction/universe in the prompt.

### CI + test wiring

- [ ] T048 [P] [US2] Add `test:lang` script to `functions/package.json` (`npm run build && node lib/languageQuality.test.js`) (FR-203). Done: `npm run test:lang` runs the 25 fixtures.
- [ ] T049 [US2] Chain `test:lang` + the team fixtures into the aggregate `npm test` in `functions/package.json` (FR-204/205). Done: `npm test` runs lang + team suites.
- [ ] T050 [US2] Rewrite `functions/src/teamFixtureTests.ts` assertions to exercise the real exported callables (not logic clones) (FR-206). Done: fixtures call deployed callables; would catch a prod regression.
- [ ] T051 [P] [US2] Add `.github/workflows/ci.yml` running build + `npm test` on push/PR, blocking merge on failure (FR-216). Done: a PR with a broken parity test is blocked; clean PR passes. **Gates T048–T050, T052, T058.**

### Phase 13 — Team project listing (LINKED to T025)

- [ ] T052 [US2] Fix `resolveCallerScope` in `functions/src/workspaces/workspacePolicy.ts:116-132` to read `users/{ownerUid}/team/{autoId}` + `workspaceAccess[]` (remove the stale `team/meta` path) (FR-211). Done: a member's `getUserProjects` returns owner workspace-scoped projects; deny path reachable. **DEPENDS ON T025.**
- [ ] T053 [US2] Wire `getUserProjects` into the frontend for team members in `src/components/SavedProjectsPanel/*` / `src/services/*` (FR-213). Done: member listing goes through `getUserProjects` with pagination. **DEPENDS ON T052.**
- [ ] T054 [P] [US2] Restructure `storage.rules` so the 256KB/ext thumbnail cap is not shadowed by the broad owner rule (FR-212). Done: oversized/non-image thumbnail upload is rejected (emulator).
- [ ] T055 [P] [US2] Create `functions/src/__tests__/savedProjects.getUserProjects.test.ts` with a `permission_denied_no_metadata_leak` assertion + add to the test script (FR-214). Done: test runs in `npm test` and asserts the denial leaks no metadata.

### Phase 10 — Favorites quality (App.tsx cluster sequential)

- [ ] T056 [US2] Pass `initialFavorite={favoriteIds.has(genId)}` to every `<FeedbackButtons>` in `src/App.tsx` (FR-207). Done: correct bookmark state on first paint, no flicker.
- [ ] T057 [US2] Implement T025-favorites: deleted-favorite "no longer available" + remove offer in `src/components/SavedProjectsPanel/*` + i18n (FR-208). Done: loading a deleted favorite shows the message.
- [ ] T058 [US2] Implement T026-favorites: schema-mismatch notice on missing fields in `src/components/SavedProjectsPanel/*` + i18n (FR-209). Done: loading a partial favorite shows the notice.
- [ ] T059 [US2] Cover concepts phase: auto-save-before-load + save-back modal fires for concepts in `src/App.tsx` (FR-210). Done: loading/regenerating a concept auto-saves and prompts update/keep-both.

### Phase 16 — Resolver parity

- [ ] T060 [P] [US2] Add a parity test asserting `functions/src/creativeResolver.ts` and `src/creativeResolver.ts` keep `ALLOWED_PAIRS` + reason strings byte-identical; add to `npm test` (FR-215). Done: a one-sided edit fails CI.

**Checkpoint (SC-201)**: Tier-2 scenarios pass AND Tier-1 re-run passes; CI green and gating. → Tier 3 may begin.

---

## Phase 5: User Story 3 — Tier 3 Post-Launch Observability (Priority: P3)

**Goal**: Resolution trace persisted, lane fixtures real, prompt-assembly + storage restored.
**Independent Test**: quickstart.md Tier-3 recipe; gate = SC-301 (+ Tiers 1/2 still pass).

- [ ] T061 [US3] KEYSTONE: persist the resolution trace onto `generations/{genId}` in the main generation-completion path in `functions/src/generators.ts`/`index.ts`, replicating the `reflowImage.ts:492-519` transaction; additive field (FR-301). Done: a completed generation's `generations/{genId}.resolutionTrace` is present + queryable. **Closes Phases 1/5/6/7/15/16 observability.**
- [ ] T062 [US3] Mirror `blueprintText` + `resolvedImagePrompt` onto the main `generations/{genId}` doc (not only `creativeMemory`) in `functions/src/index.ts`/`generators.ts` (FR-304). Done: the generation doc carries both.
- [ ] T063 [US3] Route production prompt assembly through `buildFinalImagePrompt`, removing the inline assembly in `generateFinalAd` (`generators.ts:~5680-5699`) (FR-303). Done: grep — `buildFinalImagePrompt` called from the live path; no inline assembly remains.
- [ ] T064 [P] [US3] Strengthen `testLane1/3/4/5/6/7/8/9` in `functions/src/contractFixtures.test.ts` to assert their acceptance scenarios (CTA placement, slide angles, style family, `validateLaunchSurface`) (FR-302). Done: deliberately breaking one lane's behavior fails that lane.

**Checkpoint (SC-301)**: Tier-3 scenarios pass AND Tiers 1/2 re-run passes.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T065 [P] Run full `cd functions && npm test` + root `npm run build` + `npm run lint`; confirm zero regressions across all suites.
- [ ] T066 Run the quickstart.md end-to-end recipe (all three tiers) against the emulator; record pass/fail per acceptance scenario.
- [ ] T067 Re-audit each completed FR with the original audit methodology (cross-boundary grep / real-data smoke / dead-reference grep) and update `MANUAL_QA_LOG.md` per-phase entries from "fix required" to "fixed + verified".
- [ ] T068 Hand off the owner-deploy checklist (FR-122 rules/indexes + FR-103/104 callables + any `functions` deploy) — production `firebase deploy` is the owner's separate gated step (research R6); re-verify production-dependent SCs (e.g., SC-104 live Meta publish) post-deploy.

---

## Dependencies & Execution Order

### Phase / tier order (sequential gates)
- Setup (P1) → Foundational (P2) → **Tier 1 (US1) gate SC-101** → **Tier 2 (US2) gate SC-201** → **Tier 3 (US3) gate SC-301** → Polish.
- Tiers are sequential per the spec's "sequential gates" assumption; do NOT start Tier 2 before SC-101.

### Critical task dependencies
- **T004 (Stripe gate)** is CLEARED (Phase 21 confirmed live, 2026-05-21) — T018/T019 (FR-107/108) and T041/T042 (FR-134/136) proceed with no remaining gate.
- **T025 (FR-119, writes `workspaceAccess`)** blocks **T052 (FR-211)** which blocks **T053 (FR-213)** — the linked Phase-12-US4 → Phase-13-US7 chain.
- **T051 (CI, FR-216)** must exist for T048/T049/T050/T055/T060 to actually enforce (they can be written first, but CI is what gates them).
- **T061 (FR-301 trace persistence)** is the reference-pattern keystone; T062 (FR-304) builds on the same write path.

### Highest-severity ordering (within Tier 1)
- **T006–T012 (Phase 9)** and **T013–T017 (Phase 4)** are the two highest-severity blocks — complete them first.

### Same-file sequential clusters (NOT parallel)
- `src/App.tsx`: T010, T011, T014, T015, T016, T021, T023, T025, T028, T029, T030, T036, T037, T039, T040, T056, T059 — sequence these.
- `functions/src/index.ts`: T006, T007, T018, T019, T020, T022, T024, T042, T044, T062 — sequence these.
- `functions/src/generators.ts`: T034, T044, T046, T047, T061, T062, T063 — sequence these.
- `src/components/InputForm.tsx`: T017, T033, T041 — sequence these.
- `functions/package.json`: T048, T049 — sequence these.

### Parallel opportunities
- Setup: T002, T003 [P].
- Tier 1: T008/T009 (main.tsx/JoinTeam) [P] vs the App.tsx cluster; T013 (geminiService) [P]; T026/T031/T032/T035/T038/T041/T043/T045 are [P] where their file differs from the active App.tsx/index.ts edit.
- Tier 2: T048/T051/T054/T055/T060 [P] (distinct files).
- Tier 3: T064 [P] (test file) alongside T061/T062/T063 on generators/index.

---

## Implementation Strategy

### MVP = Tier 1 (User Story 1)
1. Setup + Foundational (T004 Stripe gate already cleared).
2. Phase 9 (T006–T012) + Phase 4 (T013–T017) FIRST (highest severity).
3. Remaining Tier-1 fixes (T018–T045).
4. **STOP at SC-101**: run the quickstart Tier-1 recipe; the product is now safe to host for paying users.

### Incremental delivery
- Tier 1 → host-safe (MVP). Tier 2 → integrity + CI enforcement. Tier 3 → observability restored.
- Each tier re-runs the prior tier's checks at its checkpoint (no regression).

### Notes
- Re-verify every MANUAL_QA_LOG.md file:line anchor against current code before editing (snapshot is 2026-05-21).
- Every fix's done condition is end-to-end-proven per the 2026-05-21 protocol; mark a task complete only after the grep/smoke/re-audit passes.
- Production deploys are owner-performed (T068); this branch is code-ready + emulator-verified.
- Commit after each task or logical group.
