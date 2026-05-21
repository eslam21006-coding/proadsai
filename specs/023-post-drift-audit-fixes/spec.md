# Feature Specification: Post-Phase-21 Drift Audit Remediation

**Feature Branch**: `023-post-drift-audit-fixes`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "Create a tiered remediation spec covering every finding from the post-Phase-21 drift audit recorded in MANUAL_QA_LOG.md. Three tiers: launch blockers (user-facing), system integrity (not user-visible), post-launch (observability). Atomic fixes with file:line evidence and explicit done conditions, tier checkpoints, and cross-references."

> **Authoritative source of evidence**: `MANUAL_QA_LOG.md` (executive summary + cross-phase synthesis + all per-phase drift entries, including HOTFIX-F / 955-aspect-reflow). Every requirement below cites the file:line evidence captured there. Where this spec and the log disagree, the log wins and this spec must be corrected.
>
> **Branch-number note**: Branch/dir is `023-post-drift-audit-fixes`. The originally requested `022` was taken by `022-hotfix-h-pricing-naming-alignment`, and an earlier auto-numbering assigned `957`, which collided with the Stripe-migration spec (on disk at `021-stripe-migration`, "Phase 21"). It was therefore renamed to the free number `023`.

## Clarifications

### Session 2026-05-21

- Q: How is each FR's behavioral Done condition proven before completion? → A: Tiered by fix type — backend-logic fixes via automated fixtures in `npm test`; callable-boundary / Firestore fixes via Firebase emulator integration tests; user-facing UI wiring via manual smoke per acceptance scenario.
- Q: What is the minimum proof protocol for "Done" (the audit found passing tests over unwired code)? → A: **End-to-end evidence is required, not isolated unit tests.** (1) Backend fix — grep proving the value crosses the callable boundary (present in the `index.ts` response shape **AND** the Firestore write). (2) Frontend fix — manual smoke proving the UI renders with **real data**, not synthetic inputs. (3) Wiring fix — grep proving **zero dead-code references remain** (the function is called from the live path, not only from tests). Each fixed item is **re-audited with the original audit methodology** before being marked done.
- Q: Is introducing a CI runner in scope? → A: Yes — add a CI workflow (build + `npm test`) that gates merges, so the Tier-2 test-wiring fixes and the parity test actually enforce. (Added as **FR-216**.)
- Q: Are production deploys in scope, or is this code-ready only? → A: **Code-ready only** — this work delivers deploy-ready code/config; the owner performs the actual `firebase deploy` (rules, indexes, callables) as a separate gated step (given the pending hosting cutover). Deploy-related Done conditions become "deployable + verified in emulator."
- Q: Phase 21 / Stripe migration status (sequencing for billing-touching fixes)? → A: **RESOLVED (2026-05-21)** — Phase 21 / Stripe migration is merged, deployed, and fully smoke-tested. The billing-touching fixes (Phase 7 refund via `refundCreditsServer`, plan-gating FR-134/136) proceed against current code as specified; no post-migration re-verification or re-sequencing is required.

## User Scenarios & Testing *(mandatory)*

The three "user stories" are the three remediation tiers. Each tier is an independently shippable slice: Tier 1 alone makes the product safe to host for paying users; Tier 2 hardens correctness and CI before launch; Tier 3 restores observability after launch. They are ordered P1 → P3 by launch impact.

### User Story 1 — Tier 1: Launch blockers are fixed so paying users get working features (Priority: P1)

As a paying (Pro/Scale) user, every feature I am billed for actually works end-to-end and never silently charges me for a failure or shows me a promise it cannot keep. Today, team invites are completely broken for invitees, failed generations silently consume credits, the testimonial-carousel pipeline is never invoked, per-workspace Meta routing is dead, and several UI surfaces display states that never execute.

**Why this priority**: These are the findings the audit classified **FEATURE DEAD** or **HEADLINE VALUE DEAD** — user-facing, billing-relevant, and visible on day one of hosting. The two highest-severity items are **Phase 9 (team invites — a paid feature completely non-functional for the invitee)** and **Phase 4 (testimonial carousel — the dedicated backend is never called by the client)**. Hosting before these are fixed means charging for broken features.

**Independent Test**: For each Tier-1 phase, reproduce the user-facing failure from the audit and confirm it is resolved (e.g., click a team invite link → join page loads and a claim completes; trigger a generation failure → credit refunded; select testimonial_carousel + carousel → dedicated pipeline runs). The tier passes when every Tier-1 acceptance scenario holds and the Tier-1 checkpoint (SC-101) is green.

**Acceptance Scenarios**:

1. **Given** an invitee clicks a team invite link, **When** the page loads, **Then** the join page renders (no 404 / no normal-app fallback), invite details load, and login/signup completes the claim. *(Phase 9 — highest severity, paired with Phase 4.)*
2. **Given** a generation hard-fails after credit deduction, **When** the failure is caught, **Then** the credit is refunded, a classified failure record is written, and the user is not charged. *(Phase 7.)*
3. **Given** a user selects `testimonial_carousel` + carousel and generates, **When** the request dispatches, **Then** the dedicated `serverGenerateTestimonialCarousel` pipeline runs (platform detection, mockup frames, testimonial hook/close) — not the generic carousel path. *(Phase 4 — highest severity, paired with Phase 9.)*
4. **Given** copy fidelity cannot be satisfied after retries, **When** the build plan returns, **Then** the user sees a Continue/Retry/Cancel banner before image generation proceeds — not a silent best-effort. *(Phase 5.)*
5. **Given** a Scale user links a Meta ad account to a workspace and publishes from that workspace, **When** the push runs, **Then** it targets that workspace's linked ad account, not the user-level default. *(Phase 12.)*
6. **Given** a user reflows a portrait ad to 9:16 (including auto-generated ratio variants), **When** the reflow runs, **Then** the deterministic router is used and the hero is not vertically stretched. *(HOTFIX-F.)*
7. **Given** any Tier-1 UI surface that previously showed a non-executing state (false inheritance label, missing toast/banner, deleted-tier name), **When** the user reaches it, **Then** the displayed state matches what the system actually does. *(Phase 15, Phase 4, HOTFIX-F, Hotfix-09.50.)*

---

### User Story 2 — Tier 2: System integrity and CI guardrails are restored (Priority: P2)

As an engineer preparing for launch, the resolver receives the inputs it was designed for, the access-control model is read correctly, and the test suites that guard these behaviors actually run in CI. Today several resolver inputs are discarded, the team-access model is read from a stale path, and multiple test suites either never run or test logic clones instead of the real callables.

**Why this priority**: Not directly user-visible on day one, but these are correctness/observability foundations that, left unfixed, let Tier-1 regressions recur undetected. **Fixing Phase 12 US4 (team workspace-access matrix) unblocks Phase 13 US7 (team project listing)** — they are linked and must be sequenced together.

**Independent Test**: Run the full backend test command and confirm the previously-missing suites execute and pass; confirm the resolver receives extended inputs at every call site; confirm a team member can list only their granted workspaces' projects. The tier passes when every Tier-2 acceptance scenario holds and the Tier-2 checkpoint (SC-201) is green.

**Acceptance Scenarios**:

1. **Given** any generation call site, **When** `resolveCreativeSpec` runs, **Then** it receives `visualStyleFamily`/`campaignType`/`referenceAdUsed`/`selectedSubStyle` and the precedence/minimal logic actually fires. *(Phase 1.)*
2. **Given** a CI run, **When** the test command executes, **Then** the language-quality and team-fixture suites run (not skipped), and they exercise real callables. *(Phase 6, Phase 9.)*
3. **Given** a team owner grants a member access to a workspace via the Team page, **When** the member lists projects, **Then** they see that workspace's projects and only that workspace's. *(Phase 12 US4 → unblocks Phase 13 US7.)*
4. **Given** the favorites panel, **When** a bookmark loads on page render, **Then** the correct saved/unsaved state shows without flicker, and missing/deleted favorites surface the documented notices. *(Phase 10.)*
5. **Given** a future one-sided edit to either resolver copy, **When** CI runs, **Then** a parity test fails if the client and server validators diverge. *(Phase 16.)*

---

### User Story 3 — Tier 3: Post-launch observability is restored (Priority: P3)

As an operator or debugging engineer after launch, I can inspect the resolution trace, the resolved prompt, and per-asset diagnostics for any generation, and the QA fixtures genuinely exercise the resolver. Today the resolution trace is computed and discarded almost everywhere, the prompt-assembly architecture is bypassed, and several lane fixtures only check mode validation rather than their acceptance scenarios.

**Why this priority**: Does not block any user; safe to land after hosting. The keystone is **resolution-trace persistence**, which closes the observability half of ~six findings (Phases 1, 5, 6, 7, 15, 16) with a single fix. **The HOTFIX-F `reflowImage` callable already persists the trace correctly and is the reference implementation to copy** (`reflowImage.ts:492-519`).

**Independent Test**: Generate an ad, then query `generations/{genId}` and confirm the resolution trace (and resolved prompt / blueprint) are present; run the strengthened lane fixtures and confirm they assert their acceptance scenarios. The tier passes when every Tier-3 acceptance scenario holds and the Tier-3 checkpoint (SC-301) is green.

**Acceptance Scenarios**:

1. **Given** any completed generation, **When** its `generations/{genId}` doc is read, **Then** the resolution trace is present and queryable. *(resolutionTrace persistence — closes Phases 1/5/6/7/15/16 observability.)*
2. **Given** the lane fixtures run, **When** each lane executes, **Then** it asserts its acceptance-scenario behavior (CTA placement, slide angles, style family, `validateLaunchSurface`), not just mode validation. *(Phase 3.)*
3. **Given** a render completes, **When** the generation doc is read, **Then** `blueprintText` and `resolvedImagePrompt` are present on the main doc, and prompt assembly went through the single dedicated function. *(Phase 5.)*

---

### Edge Cases

- **A Tier-1 fix regresses a Tier-2/3 guarantee**: each tier checkpoint re-runs the prior tiers' acceptance scenarios; a regression blocks tier sign-off.
- **A "fix" turns out to be partially present** (e.g., a callable exists but is unexported, or a component exists but is unimported): the done condition is the *observable behavior*, not the code edit — verify behavior, not presence.
- **The resolution-trace persistence fix changes the generation-doc shape**: must be additive (optional fields), must not break legacy reads, and must mirror the HOTFIX-F approach exactly.
- **Deploying security rules/indexes (Phase 12)**: the committed `firestore.rules` is the desired end state but production runs the older permissive ruleset; the deploy must be verified active before the tier closes.
- **Removing the `_internalReflow` bypass (HOTFIX-F)**: must not break the internal multi-size auto-reflow behavior — those callers must route through the deterministic `reflowImage` path, not lose their function.
- **Inverting `culturalViolation` (Hotfix-0951)**: must persist internally AND strip from the client payload in the same change, so no window exists where it is neither.
- **`workspaceAccess` not yet written when fixing Phase 13**: FR-211/FR-213 depend on FR-119 first writing the access array; if sequenced wrong, team listing returns empty rather than failing loudly.

## Requirements *(mandatory)*

> Each requirement is one atomic fix: one file / one action / one done condition, with the MANUAL_QA_LOG.md evidence anchor. `/speckit.tasks` will expand each into ordered tasks; the file:line anchors must be re-verified against current code at implementation time (the log is a 2026-05-21 snapshot).
>
> **Done-condition proof protocol (2026-05-21 clarification — applies to EVERY FR below)**: An FR is Done only when proven by **end-to-end evidence, not an isolated unit test**. (1) **Backend fix** → grep proving the computed value crosses the callable boundary (present in the `index.ts` response shape **AND** the Firestore write). (2) **Frontend fix** → manual smoke proving the UI element renders with **real data** (not synthetic test inputs). (3) **Wiring fix** → grep proving **zero dead-code references remain** (the function is called from the live path, not only from tests). Each fixed item is **re-audited with the original audit methodology** before sign-off. This protocol exists precisely because the audit repeatedly found passing tests over unwired code.

### Functional Requirements — TIER 1 (Launch blockers, user-facing)

**Phase 9 — Team invites (HIGHEST SEVERITY; paired with Phase 4)**

- **FR-101**: Add a `/join` route in `src/main.tsx` that renders `JoinTeam.tsx`. **Evidence**: Phase 9 entry — no `/join` route in App.tsx/main.tsx; `JoinTeam.tsx` never imported. **Done**: visiting `/join?inviteId=…` renders the join page, not the normal app.
- **FR-102**: Fix `JoinTeam.tsx` query-param read from `?id` to `?inviteId`. **Evidence**: Phase 9 entry — `JoinTeam.tsx:20` reads `searchParams.get('id')`. **Done**: the page reads `inviteId` and loads details for a real invite link.
- **FR-103**: Re-implement and export `getInviteDetails` as a real `onCall` in `functions/src/index.ts`. **Evidence**: Phase 9 entry — deleted in git `4627284`; only a pure helper `getInviteDetailsLogic` in the test file; `teamService.ts:7` still calls it. **Done**: against the Firebase emulator, `httpsCallable('getInviteDetails')` returns invite details (not `functions/not-found`); production deploy is the owner's separate step (per clarification).
- **FR-104**: Re-implement and export `updateTeamMemberRole` as an `onCall` in `index.ts`. **Evidence**: Phase 9 entry — removed in git `4627284`; `teamService.ts:14` still calls it. **Done**: against the emulator, a role change from the Team page succeeds; production deploy is the owner's separate step.
- **FR-105**: Gate the Team nav button to `isTeamOwner` only. **Evidence**: Phase 9 entry — `App.tsx:4867` shown to all users, hardcoded label. **Done**: non-owners do not see the Team nav button.
- **FR-106**: Add "removed from team" overlay detection on `isTeamMember` true→false transition. **Evidence**: Phase 9 entry / T007 — absent. **Done**: a removed member sees the blocking overlay on next action.

**Phase 7 — Credit refund on failed generations (CRITICAL)**

- **FR-107**: In `functions/src/index.ts`, add catch-block integration to every generation callable: call `classifyError`, build a failure record, write it to the `generations` collection. **Evidence**: Phase 7 entry — `index.ts` has ZERO references to `classifyError`/`failureClass`/`costEstimate`; catch blocks only `throw HttpsError`. **Done**: a forced failure writes a `generations` doc with a `failureClass`.
- **FR-108**: Wire credit refund for hard failures (`model_error`/`validation_reject`/`slot_repair_failed`) keyed on `failureClass`; skip for pre-deduction + soft-fail. **Evidence**: Phase 7 entry T008 — no refund logic; users lose credits. **Done**: a hard failure after deduction restores credits; `credit_insufficient`/`combination_invalid` does not.
- **FR-109**: Return `costEstimate` in every generation callable's success response. **Evidence**: Phase 7 entry T013 — never returned (dropped at boundary). **Done**: the success response includes `costEstimate {modelTier, retryCount, estimatedTokens}`.
- **FR-110**: Wire the client to pass `costEstimate`/`failureClass` to `saveGeneration`. **Evidence**: Phase 7 entry T014 — `App.tsx` never passes them; always null. **Done**: a persisted generation record carries a non-null `costEstimate`.

**Phase 4 — Testimonial carousel (HIGHEST SEVERITY; paired with Phase 9)**

- **FR-111**: Register `serverGenerateTestimonialCarousel` in the frontend callable registry (`src/services/geminiService.ts`). **Evidence**: Phase 4 entry — frontend has ZERO references to the (correct, deployed) callable. **Done**: the registry exposes the callable.
- **FR-112**: In `src/App.tsx` generation dispatch, call `serverGenerateTestimonialCarousel` when `offerCreativeMode` includes `testimonial_carousel` and format is carousel — instead of the generic path. **Evidence**: Phase 4 entry — `App.tsx:3329-3338` runs OCR + generic carousel; the dedicated pipeline never runs. **Done**: a testimonial-carousel generation invokes the dedicated callable (platform detection + mockup frames execute).
- **FR-113**: Fire `showToast(t('override.testimonial_requires_carousel'))` on the auto-switch to carousel. **Evidence**: Phase 4 / Phase 2 signal #4 — key exists only in a JSX comment at `InputForm.tsx:1134`; `showToast` never called. **Done**: switching a testimonial ad from single to carousel shows the toast.
- **FR-114**: Render the `override.carousel_adjusted_testimonials` inline notification when testimonial slide count auto-adjusts. **Evidence**: Phase 4 / Phase 2 signal #7 — i18n key exists (`i18n.tsx:192/909`), no JSX renders it. **Done**: the inline "Carousel adjusted to N slides — one testimonial per slide" message appears.
- **FR-115**: Unify the testimonial slide-count formula to `+2` everywhere; remove the `+1` submit-path variant. **Evidence**: Phase 4 entry — `InputForm.tsx:536` uses `+2`, `:1131` uses `+1`. **Done**: both paths compute `testimonialCount + 2`.

**Phase 5 — Copy-fidelity warning banner**

- **FR-116**: Pass `copyFidelityWarning` across the `serverGenerateBuildPlan` callable boundary (add to the response shape in `index.ts`). **Evidence**: Phase 5 entry T035 — computed in `generators.ts:3942-3947`, dropped at the boundary; `index.ts` has zero references. **Done**: the build-plan response carries `warningCode: 'copy_fidelity_degraded'` + `failedFields` when fidelity is degraded.
- **FR-117**: In `src/App.tsx`, read `warningCode` and render a Continue/Retry/Cancel banner before image generation proceeds. **Evidence**: Phase 5 entry T036 — `fidelity.*` i18n keys exist (`i18n.tsx:650-662`) but no JSX renders them; only a non-blocking error toast keyed off an errorCode the backend never emits. **Done**: on degraded fidelity the user sees a blocking 3-button banner before render.

**Phase 12 — Workspace / Scale headline value**

- **FR-118**: Fix `metaPushCreativePack` (`functions/src/index.ts:4612`) to read `workspace.metaAdAccountId` instead of the user-level `conn.selectedAccountId`. **Evidence**: Phase 12 entry — push always targets the user default; per-workspace routing dead (FR-011). **Done**: a publish from a workspace with a linked ad account targets that account.
- **FR-119**: Build the US4 team workspace-access matrix UI and wire `setTeamMemberWorkspaceAccess` from the frontend. **Evidence**: Phase 12 entry — matrix UI does not exist; callable never called from client. **Done**: an owner can grant/revoke per-member workspace access from the Team page (writes `workspaceAccess`). *(LINKED: unblocks Phase 13 US7 / FR-211 + FR-213.)*
- **FR-120**: Wire `WorkspaceAccessAuditPanel.tsx` into the Team page (currently imported by nothing). **Evidence**: Phase 12 entry — built but unreachable. **Done**: the owner can view the access audit log.
- **FR-121**: Make `hasInProgressWork` a real selector in `src/store.ts` (over the 8 generation fields) and pass it to `WorkspaceSwitcher`. **Evidence**: Phase 12 entry — static `false` in store; switcher render (`App.tsx:5026`) never passes it; switch guard never fires. **Done**: switching workspace mid-generation opens the Save/Discard/Cancel guard.
- **FR-122**: Ready the committed `firestore.rules` and `firestore.indexes.json` for deployment and verify them in the emulator / rules-playground. **Evidence**: Phase 12 entry + 2026-05-10 note (commit `5f4c52b` committed-not-deployed). **Done**: the tightened workspace/audit rules + 3 composite indexes pass emulator/rules-playground verification; the production `firebase deploy --only firestore:rules,firestore:indexes` is performed by the owner as a separate gated step (per clarification).
- **FR-123**: Fix the crashing workspace test suite. **Evidence**: Phase 12 entry — `npm run test:workspace` exits 1, `TypeError` at `workspace.test.js:114`. **Done**: `test:workspace` runs assertions and exits 0.
- **FR-124**: Remove the direct `addDoc`/`setDoc` workspace writes in `src/App.tsx` (`:1729,1746`) and route through the `createWorkspace`/`updateWorkspace` callables. **Evidence**: Phase 12 entry — double-write bypasses plan + 10-cap gating. **Done**: workspace create/update goes only through the gated callable; a non-Scale/over-cap user cannot create one client-side.
- **FR-125**: Pass `plan` and `metaAdAccounts` props to `WorkspaceSettingsModal` at its render site (`App.tsx:8681`). **Evidence**: Phase 12 entry — rendered without them; Scale gate treats everyone as non-Scale, Meta section never shows. **Done**: the Scale gate and Meta section render correctly per the user's plan + connection.

**Phase 15 — Brand colors (false promise to users)**

- **FR-126**: Gate the "Inheriting brand colors from the linked cold ad" label (`InputForm.tsx`, T019a) so it shows only when `retargetingSourceId` resolves to a real cold ad with non-empty brand colors. **Evidence**: Phase 15 entry — fires whenever `campaignType==='retargeting' && pickers empty`; `retargetingSourceId` never populated. **Done**: the label appears only when inheritance will actually occur.
- **FR-127**: Wire the retargeting cold-ad load — populate `_sourceColdAdBrandColors` from a `retargetingSourceId` doc lookup so `resolveBrandColors` can inherit (US2). **Evidence**: Phase 15 entry — `_sourceColdAdBrandColors` never populated; resolver always sees `sourceColdAd:null`. **Done**: a retargeting ad with no explicit colors inherits the linked cold ad's primary/secondary.
- **FR-128**: Wire `applyBrandColorDeduction` — call it from `_runBrandCompliance` and feed the result into scoring (US5). **Evidence**: Phase 15 entry — never called outside tests; compliance result `console.log`'d and discarded; −10 deduction never applies. **Done**: a brand-primary-missing render reduces `overallScore` by 10 and records the violation.

**HOTFIX-F — Aspect reflow (face stretching still occurs)**

- **FR-129**: Remove the `_internalReflow:true` bypass at `src/App.tsx:2274, 4023, 4075, 4616`; route auto-generated ratio variants through the deterministic `reflowImage` callable. **Evidence**: HOTFIX-F entry — bypass keeps the generative-edit path live for auto-variants + legacy carousel; SC-004 fails. **Done**: zero invocations of the deprecated generative-edit REFLOW path from any user-triggered flow; auto-variants use the router.
- **FR-130**: Fix the legacy single-reflow branch (`App.tsx:4676`) to call `reflowImage` with `scope:'single'` instead of building a `REFLOW ONLY` instruction. **Evidence**: HOTFIX-F entry — hard-errors on `REFLOW_DEPRECATED` instead of the deterministic outpaint fallback. **Done**: a legacy single reflow runs the backend fallback chain (outpaint→rerender), not an error.
- **FR-131**: Add the FR-032 fallback notice — bilingual i18n keys (EN+AR) for `fallbackToRerender` and `fallbackToOutpaint`, and render the notice in `App.tsx` when `reflowResult.fallbackFrom` is set. **Evidence**: HOTFIX-F entry — `fallbackFrom` only in type defs; no JSX, no i18n keys. **Done**: an auto-fallback reflow shows the dismissable post-fact notice.
- **FR-132**: Replace the carousel per-item retry (`handleCarouselSlideRetry` → legacy `gemini.generateFinalAd`, `App.tsx:4200-4259`) with a `reflowImage` call using `scope:'carousel_slide'`. **Evidence**: HOTFIX-F entry — retry routes through the legacy generation path, not the deterministic router. **Done**: retrying a failed reflow slide invokes `reflowImage` `scope:'carousel_slide'`.
- **FR-133**: Reset `reflowMethod` to `'auto'` on Step-4 navigation. **Evidence**: HOTFIX-F entry — selector retains the last choice. **Done**: leaving and returning to Step 4 shows Auto selected.

**Hotfix-09.50 — Plan-naming leaks**

- **FR-134**: Replace `'Creator'` in the upgrade prompt at `InputForm.tsx:1849` with the correct current plan name. **Evidence**: Hotfix-09.50 — references the deleted `creator` tier (plans are starter/pro/scale). **Done**: the mode-lock upgrade text names a real plan.
- **FR-135**: Add bilingual over-limit toasts for saved projects and audience avatars (`billing.savedProjectOverLimit` / `billing.audienceAvatarOverLimit`, EN+AR). **Evidence**: Hotfix-09.50 — hardcoded English strings; i18n keys don't exist (Principle V miss). **Done**: hitting either cap shows a translated toast in the active language.
- **FR-136**: Enforce the backend batch cap — wire `validateBatchRunEntitlement` into the batch generation path so Pro 4 / Scale 36 are server-enforced. **Evidence**: Hotfix-09.50 — the cap branch (`index.ts:3515-3519`) only fires when `batchQuantity` is passed and no caller passes it; `validateBatchRunEntitlement` (`generators.ts:7730`) is never called. **Done**: a server-side batch run beyond the plan cap is rejected.

**Hotfix-0951 — Cultural violation inverted**

- **FR-137**: Invert `culturalViolation` handling — persist it internally to Firestore and strip it from the client response (currently the opposite). **Evidence**: Hotfix-0951 entry — emitted in the client response (`index.ts:3891`), never persisted; `setCulturalViolation`/`persistTrace` have zero call sites. **Done**: `culturalViolation` is on the generation record (not the client payload) for an Arabic ad that triggered a substitution.

**Hotfix-E — Logo validator bypassed**

- **FR-138**: Wire `validateLogoPlacements` into the live path before `compositeUILogos`, OR move its clamps (widthPct, opacity, 2-UI/3-environmental caps) into `normalizeLogoPlacements`. **Evidence**: Hotfix-E entry — validator is test-only; live path uses `normalizeLogoPlacements` which doesn't clamp; out-of-range/5th UI logo can render. **Done**: an out-of-range or over-cap logo placement is clamped/dropped in the live render.

### Functional Requirements — TIER 2 (System integrity, not user-visible)

**Phase 1 — Resolver inputs never passed**

- **FR-201**: Pass `visualStyleFamily`/`campaignType`/`referenceAdUsed`/`selectedSubStyle`/`selectedUniverse` to `resolveCreativeSpec` at all call sites (`generators.ts:399,2431,5716`; `index.ts:3944`; `layoutContract.ts:444`; `variantEngine.ts:133`). **Evidence**: Phase 1 entry T007 — callers pass only `{selectedModes, hookAngle}`; minimal/precedence logic never fires. **Done**: minimal-family suppression and the visual-precedence chain execute in production for a real generation.
- **FR-202**: Make `generators.ts` read `referenceAdOverrideActive`/`artDirectionCleared` from the resolver result when building prompts. **Evidence**: Phase 1 entry T041 — zero references; flags only in the discarded trace. **Done**: a reference-ad upload suppresses art direction/universe in the actual prompt.

**Phase 6 — Language tests not in CI**

- **FR-203**: Add a `test:lang` script to `functions/package.json` (`npm run build && node lib/languageQuality.test.js`). **Evidence**: Phase 6 entry T003 — no `test:lang` script. **Done**: `npm run test:lang` runs the 25 language fixtures.
- **FR-204**: Chain `test:lang` into the aggregate `npm test` script. **Evidence**: Phase 6 entry — lang suite not in the aggregate. **Done**: `npm test` executes the language regression guards.

**Phase 9 — Team tests never run**

- **FR-205**: Add `teamFixtureTests.ts` to an npm test script and the aggregate. **Evidence**: Phase 9 entry — no script references it; T031–T036 never execute. **Done**: `npm test` runs the team fixtures.
- **FR-206**: Rewrite the team fixture assertions to exercise the real deployed callables, not local logic clones. **Evidence**: Phase 9 entry — fixtures assert against `canCreateInvite`/`isClaimable`/`getInviteDetailsLogic`; some hard-code the asserted values. **Done**: the fixtures call the exported callables and would catch a prod regression.

**Phase 10 — Favorites quality gaps**

- **FR-207**: Pass `initialFavorite` (from the `favoriteIds` Set) to every `<FeedbackButtons>` instance in `src/App.tsx`. **Evidence**: Phase 10 entry T008 — set built (`App.tsx:2322`) but never passed; `getFavoriteIds` is dead code; US1 relies on a post-mount async read (flicker, SC-001). **Done**: bookmark state is correct on first paint without flicker.
- **FR-208**: Implement T025 — show "This saved item is no longer available" + remove offer when a loaded favorite no longer exists in Firestore. **Evidence**: Phase 10 entry T025 — unimplemented; no Firestore re-read, no i18n key. **Done**: loading a deleted favorite shows the message and offers removal.
- **FR-209**: Implement T026 — show a schema-mismatch notice when a loaded favorite has missing fields. **Evidence**: Phase 10 entry T026 — fields left empty but no notice shown. **Done**: loading a partial favorite shows the notice.
- **FR-210**: Cover the concepts phase — add auto-save-before-load and wire the save-back modal to fire for concepts (not just hooks/render/caption). **Evidence**: Phase 10 entry — concepts `onLoad` (`App.tsx:7640-7657`) skips auto-save; save-back modal never fires for concepts. **Done**: loading/regenerating a concept auto-saves and surfaces the update/keep-both prompt.

**Phase 13 — Team project listing broken (LINKED to Phase 12 US4)**

- **FR-211**: Fix `resolveCallerScope` (`functions/src/workspaces/workspacePolicy.ts:116-132`) to read the correct team model — `users/{ownerUid}/team/{autoId}` with a `workspaceAccess` array — not the stale `users/{callerUid}/team/meta` + `members/{uid}.workspaceIds` path. **Evidence**: Phase 13 entry — stale helper makes a member fall through to their own projects; FR-020 non-functional. **Done**: a team member's `getUserProjects` returns the owner's workspace-scoped projects, and the permission-denied path is reachable. *(LINKED: depends on FR-119 writing `workspaceAccess`.)*
- **FR-212**: Fix the shadowed storage size cap — restructure `storage.rules` so the 256KB/ext thumbnail cap is not overridden by the broader `users/{userId}/{allPaths=**}` owner rule. **Evidence**: Phase 13 entry — cap shadowed; size/ext restriction never applies. **Done**: an oversized/non-image upload to the thumbnail path is rejected.
- **FR-213**: Wire the `getUserProjects` callable into the frontend (currently zero references in `src/`). **Evidence**: Phase 13 entry — callable exported but never called; members see owner projects only via the `effectiveUid` read. **Done**: team-member project listing goes through `getUserProjects` with pagination. *(LINKED: unblocked by FR-119 + FR-211.)*
- **FR-214**: Create `functions/src/__tests__/savedProjects.getUserProjects.test.ts` including a `permission_denied_no_metadata_leak` assertion, and add it to the test script. **Evidence**: Phase 13 entry T057 — file does not exist; SC-009 untested. **Done**: the test runs in `npm test` and asserts the denial payload leaks no project metadata.

**Phase 16 — SSOT manual-mirror risk**

- **FR-215**: Add a parity test asserting `functions/src/creativeResolver.ts` and `src/creativeResolver.ts` keep `ALLOWED_PAIRS` and the `validateModeFormatCombination` reason strings byte-identical. **Evidence**: Phase 16 entry — hand-maintained mirror, no parity test, Contract Invariant 2 unmet. **Done**: a one-sided edit to either copy fails the parity test in CI.

**CI infrastructure (added per 2026-05-21 clarification — now in scope)**

- **FR-216**: Add a CI workflow (e.g., `.github/workflows/ci.yml`) that runs the build and `npm test` (backend) on every push/PR and blocks merge on failure. **Evidence**: cross-phase CI-gap note — no `.github/workflows` exists; FR-203/204/205/214/215 wire suites into `npm test` but nothing runs it automatically, so the regression guards don't enforce. **Done**: a PR containing a deliberately-broken fixture (e.g., a failing parity test from FR-215) is blocked by CI; a clean PR passes. *(Gates FR-203/204/205/214/215 — without this they are decorative.)*

### Functional Requirements — TIER 3 (Post-launch observability)

**Resolution-trace persistence (keystone — closes Phases 1/5/6/7/15/16 observability)**

- **FR-301**: Persist the resolution trace on the main `generations/{genId}` document. **Evidence**: Cross-phase synthesis systemic finding #2 — trace built then discarded everywhere except HOTFIX-F. **Reference implementation**: `functions/src/reflowImage.ts:492-519` (the only place trace persistence already works — a transaction appending `resolutionTrace.reflowHistory` to the source generation doc). **Done**: a completed generation's `generations/{genId}.resolutionTrace` is present and queryable; this single fix makes the trace-dependent diagnostics from Phases 1, 5, 6, 7, 15, 16 observable.

**Phase 3 — Lane fixture quality**

- **FR-302**: Strengthen `testLane1/3/4/5/6/7/8/9` in `functions/src/contractFixtures.test.ts` to call the actual resolver functions per their acceptance scenarios (CTA placement, slide angles, style family, `validateLaunchSurface`) rather than only `validateCombination` + `resolveCreativeSpec`. **Evidence**: Phase 3 entry — lanes 1/3/4/5/6/7/8/9 only do mode validation; "Lane N passed" ≠ "Lane N's acceptance scenario verified." **Done**: each lane fixture asserts its US1 acceptance-scenario behavior and fails if that behavior regresses.

**Phase 5 — Assembly function + storage**

- **FR-303**: Wire `buildFinalImagePrompt` as the sole prompt-assembly entry point, replacing the inline assembly in `generateFinalAd`. **Evidence**: Phase 5 entry T047 — `buildFinalImagePrompt` is test-only; real assembly is inline (`generators.ts:~5680-5699`); FR-005/FR-006 violated. **Done**: production prompt assembly goes through `buildFinalImagePrompt`; no inline assembly remains.
- **FR-304**: Persist `blueprintText` and `resolvedImagePrompt` on the main `generations/{genId}` doc (not only in `creativeMemory`). **Evidence**: Phase 5 entry T039 — written only to `creativeMemory`; the main doc (client-written) never carries them. **Done**: the generation doc carries both fields for debugging.

### Key Entities

- **Remediation Tier**: One of three independently shippable slices — Tier 1 (launch blockers / user-facing), Tier 2 (system integrity / CI), Tier 3 (post-launch / observability). Each has a checkpoint gate and re-runs prior tiers' checks before sign-off.
- **Fix Requirement**: One atomic remediation — a single file + single action + single done condition + a MANUAL_QA_LOG.md evidence anchor. The unit `/speckit.tasks` expands into ordered tasks.
- **Evidence Anchor**: A file:line (or git-commit) reference into the codebase as captured in MANUAL_QA_LOG.md; the authoritative justification for each fix. Re-verified against current code at implementation time.
- **Callable Boundary**: The `functions/src/index.ts` response-shaping + client-dispatch layer — the systemic blind spot where values computed in `generators.ts` are dropped. Most Tier-1/Tier-2 fixes cross this boundary.
- **Resolution Trace**: The per-generation diagnostic record; the keystone Tier-3 entity. Today persisted only by `reflowImage` (the reference implementation).
- **Linked-fix Pair**: Phase 12 US4 (FR-119, writes `workspaceAccess`) → unblocks Phase 13 US7 (FR-211/FR-213, reads it). Must be sequenced together.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-101 (Tier-1 checkpoint)**: 100% of Tier-1 acceptance scenarios pass, with the two highest-severity items verified first — a team invitee completes a join end-to-end (Phase 9) and a testimonial-carousel generation invokes the dedicated pipeline (Phase 4). No user-facing surface displays a state the system does not execute.
- **SC-102**: Zero credits are charged for hard generation failures across a 20-failure sample; 100% of post-deduction hard failures are refunded (Phase 7).
- **SC-103**: 100% of reflows (including auto-generated ratio variants) use the deterministic router; zero invocations of the deprecated generative-edit REFLOW path from any user-triggered flow over a 7-day window (HOTFIX-F SC-004).
- **SC-104**: A publish from a workspace with a linked Meta ad account reaches that account in 100% of attempts (Phase 12 FR-011).
- **SC-201 (Tier-2 checkpoint)**: 100% of Tier-2 acceptance scenarios pass AND all Tier-1 scenarios still pass (no regression). The previously-missing/crashing test suites (language, team, workspace) run green via `npm test`, and the new CI workflow (FR-216) executes them on every PR and blocks merge on failure.
- **SC-202**: A team member granted access to one workspace sees that workspace's projects and only that workspace's, in 100% of list requests; the permission-denied path leaks zero project metadata (Phase 12 US4 → Phase 13 US7).
- **SC-203**: The favorites panel shows correct bookmark state on first paint with zero flicker (Phase 10 SC-001).
- **SC-301 (Tier-3 checkpoint)**: 100% of Tier-3 acceptance scenarios pass AND all Tier-1/Tier-2 scenarios still pass. Every completed generation's `generations/{genId}` doc carries a queryable resolution trace, closing the observability gap for Phases 1/5/6/7/15/16 with the single FR-301 fix.
- **SC-302**: Strengthened lane fixtures fail when their acceptance-scenario behavior regresses (verified by deliberately breaking one behavior and confirming the corresponding lane fails) (Phase 3).

## Assumptions

- **MANUAL_QA_LOG.md is the single source of truth** for every finding and evidence anchor; the per-phase entries (a 2026-05-21 snapshot) drive scope. File:line anchors are re-verified against current code at implementation time.
- **Tiers are sequential gates, not parallel**: Tier 2 starts only after the Tier-1 checkpoint (SC-101) passes; Tier 3 after Tier-2 (SC-201). Within a tier, fixes may proceed in parallel where they touch different files.
- **Phase 12 US4 (FR-119) precedes Phase 13 US7 (FR-211/FR-213)**: the project-listing fix depends on the team workspace-access matrix actually writing the `workspaceAccess` array.
- **Phase 9 and Phase 4 are the two highest-severity Tier-1 items** and are scheduled first within Tier 1.
- **The HOTFIX-F `reflowImage` callable (`reflowImage.ts:492-519`) is the reference implementation** for the Tier-3 resolution-trace persistence fix (FR-301) — copy its transaction pattern.
- **Done conditions are behavioral and end-to-end-proven, not code-presence**: per the 2026-05-21 proof protocol, each FR is satisfied only when proven via cross-boundary grep (backend) + real-data UI smoke (frontend) + dead-code-reference grep (wiring), and re-audited with the original methodology — because several findings were "code exists but unwired."
- **No new product features are introduced** — this spec is purely remediation of audited drift; it does not change the launch surface, plan model, or pricing. (FR-216 adds CI infrastructure, not a product feature.)
- **A CI workflow IS in scope** (FR-216): no `.github/workflows` exists today; the workflow runs build + `npm test` and gates merges so the Tier-2 test fixes (FR-203/204/205/214) and the parity test (FR-215) actually enforce.
- **Production deploys are owner-performed, not part of this work**: this branch delivers deploy-ready code/config verified in the emulator; the owner runs `firebase deploy` (rules, indexes, callables) as a separate gated step, sensible given the pending hosting cutover. Production-dependent success criteria (e.g., SC-104 live Meta publish) are validated after that owner deploy; until then they are emulator-verified.
- **Phase 21 / Stripe-migration status is CONFIRMED LIVE** (merged, deployed, and smoke-tested as of 2026-05-21): the billing-touching fixes (Phase 7 refund via `refundCreditsServer`, plan-gating FR-134/136) proceed against current code as specified. No outstanding clarifications remain.
- **Branch is `023-post-drift-audit-fixes`** (renamed from the auto-assigned `957` to avoid colliding with `021-stripe-migration`; the originally requested `022` was taken); update any external references accordingly.
