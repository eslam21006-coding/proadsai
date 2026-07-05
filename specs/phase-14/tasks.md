---
description: "Task list for Phase 14 — RAG + Meta Reporting Feedback Loop"
---

# Tasks: Phase 14 — RAG + Meta Reporting Feedback Loop

**Input**: Design documents from `specs/phase-14/`
**Prerequisites**: `plan.md`, `spec.md` (8 user stories), `research.md`, `data-model.md`, `contracts/` (6), `quickstart.md`, `qarar-rulebook.md`

**Tests**: INCLUDED. The constitution (Principle IX — proof + reproducible test inputs) and `quickstart.md` (`npm test`) require unit tests for the pure modules and contract tests for callables. Pure-module tests live in `functions/src/__tests__/`.

**Organization**: Tasks grouped by user story (US1–US8) in priority order. Each story is an independently testable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1…US8 (user-story phases only)
- Exact file paths included

## Path Conventions

Web app: backend `functions/src/`, frontend `src/`. Firestore config at repo root (`firestore.rules`, `firestore.indexes.json`).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Infrastructure and gates that precede all code.

- [x] T001 Provision a Cloud KMS key ring + key in `europe-west1` (project `proadsai-saas`) for Meta-token envelope encryption; document key resource id for `tokenCrypto.ts` — **DOCUMENTED**: `specs/phase-14/INFRASTRUCTURE_SETUP.md` §T001 (gcloud commands + IAM). External — must be run by maintainer with project-level access before production deploy.
- [x] T002 Create the Cloud Tasks queue (Firebase Functions v2 task queue) that backs `metaSyncAccountWorker`; set `rateLimits.maxConcurrentDispatches=5`, `retryConfig.maxAttempts=3` — **DOCUMENTED**: `specs/phase-14/INFRASTRUCTURE_SETUP.md` §T002 (firebase CLI / gcloud commands). External — same gate as T001.
- [x] T003 [P] Verify the Phase 10/12 prerequisite gate: confirm generations created inside a workspace persist `workspaceId` (spec §12); record evidence — blocks production, not development — **EVIDENCE**: App.tsx:3264, 4084, 6482 + types.ts:426 carry `workspaceId`; firestore.indexes.json already has `workspaceId` composite indexes (lines 270–302).
- [x] T004 [P] Add the SC-11 QA guard: a lint/test that fails on any user-facing occurrence of "متوسط", "ميديان", "Link CTR", "CTR", "CPA", "CPM", or a percentage in `src/**` copy (wire into `npm run lint`) — **DONE**: `scripts/sc11Guard.mjs` (Node, no deps) wired into `npm run lint`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting utilities and rules every story depends on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T005 Confirm/introduce the lazy `getDb()` Firestore getter in `functions/src/` (never `admin.firestore()` at module load); use it in all new modules — **DONE**: existing modules already use lazy `getDb()` (creativeMemory.ts:23, entitlements.ts:14, etc.); added canonical shared helper `functions/src/firestoreClient.ts` for new Phase 14 modules.
- [x] T006 [P] Extend `firestore.rules`: workspace-scoped `users/{uid}/workspaces/{workspaceId}/adAccounts/**` (owner `uid` + workspace membership) and **deny-all** on `users/{uid}/workspaces/{workspaceId}/private/**` (server-only Meta token) — **DONE**: `firestore.rules` now declares `adAccounts/{accountId}/{settings,syncSnapshots,adPerformance,baselines,hookPerformance,visualPerformance}`, `imageFingerprints/{hash}`, and `private/{document=**}` deny-all, with a shared `isWorkspaceMember()` helper.
- [x] T007 [P] Create `functions/src/targetingContext.ts` — pure geo-tier (`tier1_gulf`/`tier2_diaspora`/`tier3_egypt_na`) + audience-type (`broad`/`interest`/`lookalike`/`retargeting`/`advantage_plus`) classifiers (spec §3.1.6) — **DONE**: `functions/src/targetingContext.ts` + `.constants.ts` (geo table separated). Fail-safe defaults: tier3_egypt_na + broad.
- [x] T008 [P] Unit test `functions/src/__tests__/targetingContext.test.ts` — geo/audience mapping table incl. unknown fallbacks — **DONE**: 16 tests covering GCC / Western / MENA classification, unknown → tier3 fail-safe, `classifyAudienceType` priority (retargeting > lookalike > interest > advantage+ > broad), and combined `classifyTargeting`.
- [x] T009 [P] Create `functions/src/campaignObjective.ts` — pure Meta `objective` → `conversion|other` classifier, unknown → `other` (fail-safe, spec §5.6) — **DONE**: `functions/src/campaignObjective.ts` with closed conversion set + `isRuleAllowedForObjective()` for SC-12 (K3+K4 always allowed; everything else conversion-only).
- [x] T010 [P] Unit test `functions/src/__tests__/campaignObjective.test.ts` — all mapped objectives + unknown → `other` — **DONE**: 9 tests covering sales/leads/app-events/messages classification, awareness/reach/etc → other, fail-safe for unknown/null/non-string, raw echo, and rule gating (K3+K4 always allowed; CB/K1/K2/K5/S1 conversion-only).
- [x] T011 [P] Create `functions/src/canonicalAngle.ts` — shared alias resolver (`shocking_stat→statistics`, `fear_of_missing_out→urgency`, `future_pacing→future_based`) reusing the maps in `gazeMap.ts`/`expressionMap.ts`; unit test in `functions/src/__tests__/canonicalAngle.test.ts` — **DONE**: `functions/src/canonicalAngle.ts` consolidates the alias map with a runtime invariant check that gazeMap + expressionMap canonical-10 sets agree. Test: 11 cases covering aliases, already-canonical, unknown, fail-safe, and `isCanonicalAngle` predicate.

**Checkpoint**: Shared classifiers, rules, and alias resolution ready.

---

## Phase 3: User Story 1 — Funnel Settings & CPA Cap (Layer 1, P1) 🎯 MVP

**Goal**: User enters funnel economics; system derives target CPA/CPL with cap logic; settings persist per workspace-account.

**Independent Test**: AOV $43 / HTO $3,500 / HTO 3% / ROAS 0.5 → raw $86 capped to $74 with warning; reload persists.

### Tests for User Story 1

- [x] T012 [P] [US1] Unit test `functions/src/__tests__/cpaEconomics.test.ts` — all 4 funnel types (spec §2.3 + acceptance 6–9): paid ROAS 1.0 → $43/no-warn; ROAS 0.5 → $86→$74/warn; equality → no-warn (FR-003); **paid no-HTO** AOV $47 → fullBuyerValue $47 / maxCPA $23.50; **lead_magnet_call** $3,000 @ 5% → CPL $105; **free_webinar** $997/40%/8% → CPL $22.33; advisory triggers (noHto; value < $9) — **DONE**: 19 tests covering constants, all spec worked examples (43/148/74; 86→74 warn; 47→23.50; lead $3000@5%→$105; webinar $997/40/8→$22.33), ROAS enum strictness, input validation (negative/NaN throws), deriveAll dispatch, advisories (noHto + lowValue + both firing + non-blocking guarantee), and `getEffectiveTarget`/`getCostMetric`.
- [x] T013 [P] [US1] Contract test `functions/src/__tests__/funnelSettings.contract.test.ts` — `saveFunnelSettings`/`getFunnelSettings` request/response per funnel type + per-type required-input validation + `advisories` flags (contract: `contracts/funnelSettings.md`) — **DONE**: 12 tests covering request-shape → FunnelInputs coercion, all worked examples, per-type required-input validation throws, advisory flags, 30-day review cadence, and the `schemaVersion: 1` invariant.
- [x] T014 [P] [US1] Create `functions/src/cpaEconomics.ts` — pure `deriveTargetCpa()` / `deriveTargetCpl()` for the 4 funnel types (spec §2.3): paid branch (no-HTO ⇒ `fullBuyerValue = AOV`); free branch (`free_webinar` via attendance×buy, `lead_magnet_call` via leadToCloseRate); `capApplied`; plus a pure `computeAdvisories()` (`noHto`, `lowValue<$9`) — **DONE**: `functions/src/cpaEconomics.ts` with `deriveTargetCpa`, `deriveTargetCplFreeWebinar`, `deriveTargetCplLeadMagnetCall`, `deriveAll`, `computeAdvisories`, `getEffectiveTarget`, `getCostMetric`. Closed enum types. Strict input validation throws on negative/NaN/non-canonical ROAS.
- [x] T015 [US1] Implement `saveFunnelSettings` + `getFunnelSettings` callables in `functions/src/` (funnelType-branched validation, force htoPrice/htoConversionRate=0 when `hasHto=false`, recompute `derived`+`advisories` server-side, `reviewDueAt`); register in `functions/src/index.ts` (`europe-west1`) — **DONE**: `functions/src/funnelSettings.ts` exports `saveFunnelSettings`, `getFunnelSettings`, `dismissAdvisory`. Server enforces: 1:1 accountId match against workspace's `metaConnection.accountId`, HTO=0 forcing, derived recomputation, monthly review cadence (30d), per-card dismissal persistence.
- [x] T016 [US1] Persist `FunnelSettings` at `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings` (data-model §1 — 4-type shape); add the `reviewDueAt` collection-group index to `firestore.indexes.json` — **DONE**: persistence happens via `funnelSettings.ts` (settings/current doc); `firestore.indexes.json` extended with `settings/{reviewDueAt ASC}` collection-group + `metaConnection/{metaConnected ASC}` + `adPerformance/{evaluatedAt DESC}` + `{campaignObjective,verdict,evaluatedAt DESC}` + `{matchType}` for downstream US2-US7.
- [x] T017 [P] [US1] Create `src/components/FunnelSettingsForm.tsx` — workspace-name header; Field 1 funnel-type dropdown; **conditional fields per type** (paid: AOV/Has-HTO→price+rate/ROAS plain-Arabic labels; free_webinar: offerPrice/attendance/buyRate; lead_magnet_call: offerPrice/leadToClose); English/Fusha copy only (spec §2.2) — **DONE**: `src/components/FunnelSettingsForm.tsx` — 4 funnel-type branches, ROAS strict 3-option enum (1.0/0.65/0.5), conditional fields per type, plain-Arabic labels (`قيمة الطلب`, `هل لديك عرض ترويجي عالي القيمة`, `نسبة الحضور من المسجلين` etc.). SC-11 lint clean (0 forbidden terms in this file).
- [x] T018 [US1] Render derived card + cap warning (when `capApplied`) + dismissible monthly-review prompt (when `reviewDue`) in `FunnelSettingsForm.tsx`; plain-language results card (§2.3); gate the form to appear before any performance data (spec §2.1) — **DONE**: results card renders paid (rawTargetCpa/fullBuyerValue/maxCpa/effectiveTargetCpa) or free (leadValue/economicCeilingCpl/effectiveTargetCpl); cap warning card shown when `paid.capApplied`; monthly-review prompt renders when `reviewDue`. Form is gated by the parent (only renders when workspaceId+accountId are present).
- [x] T018a [US1] Render the two **Business Advisory Cards** (spec §2.6) above the results from the `advisories` flags — `noHto` + `lowValue<$9`, both non-blocking, each with the "احجز مكالمة" CTA opening `https://eslamsalah.com/team-discovery-call` in a new tab. **Dismissal persists** per card via `advisoriesDismissed.{noHto,lowValue}` on the settings doc (hidden until the trigger condition changes then re-triggers); ROAS selector is a strict 3-option enum (no custom) — **DONE**: two advisory cards render above the results; both have a per-card "إخفاء" dismiss button that calls `dismissAdvisory` and persists `advisoriesDismissed.{key}` server-side. Both cards include the "احجز مكالمة" CTA opening `https://eslamsalah.com/team-discovery-call` in a new tab. ROAS selector is the strict 3-option enum (no custom).

**Checkpoint**: US1 fully functional and independently testable (MVP — no Meta data needed).

---

## Phase 4: User Story 2 — Daily Sync from Meta (Layer 2, P1)

**Goal**: Scheduled 3am sync (dispatcher + Cloud Tasks worker) fetches hierarchy + performance + baselines and stores per-ad records + snapshots; on-demand "Sync Now".

**Independent Test**: "Sync Now" → `adPerformance` docs, `baselines`, a `syncSnapshots` entry, `lastMetaSyncAt` updated; button greys for 1h; snapshots capped at 7.

### Tests for User Story 2

- [ ] T019 [P] [US2] Unit test `functions/src/__tests__/tokenCrypto.test.ts` — KMS envelope encrypt→decrypt round-trip
- [ ] T020 [P] [US2] Contract test `functions/src/__tests__/metaSync.contract.test.ts` — dispatcher enqueues one task per `metaConnected` account; worker idempotency; partial-failure keeps last-good aggregates; snapshot pruning to 7; 1h cooldown on `triggerMetaSync` (contract: `contracts/metaSyncAndConnection.md`)

### Implementation for User Story 2

- [ ] T021 [P] [US2] Create `functions/src/tokenCrypto.ts` — KMS envelope encrypt/decrypt for the long-lived Meta token (key from T001)
- [ ] T022 [P] [US2] Create `functions/src/metaGraph.ts` — Graph API helpers: campaign→adset→ad hierarchy (+`objective`,`targeting`,`creative`), 3-window insights (fields per spec §3.1), baselines (90d CTR/14d CPM/30d CPA-CPL/CPC), async insights (`report_run_id` poll) + exponential backoff (FR-008)
- [ ] T023 [US2] Extend `src/services/metaService.ts` + add `connectMetaAccount`/`disconnectMetaAccount` callables: capture long-lived token → `tokenCrypto` → write server-only `…/private/metaConnection` (data-model §8); enforce 1:1 both-direction block (FR-026, plain-Arabic reason); disconnect deletes token, retains data (Edge Case 15)
- [ ] T024 [US2] Create `functions/src/metaSync/dispatcher.ts` — `metaDailySync` `onSchedule('0 3 * * *', {timeZone:'UTC', region:'europe-west1'})`; enqueue one Cloud Task per `metaConnected` account (collection-group query)
- [ ] T025 [US2] Create `functions/src/metaSync/worker.ts` — `metaSyncAccountWorker` `onTaskDispatched`: token check+refresh (FR-009 on fail), fetch hierarchy+performance, compute baselines, `spend_share_pct`, targeting context (T007), write `adPerformance/{adId}` + `baselines`, append `syncSnapshots` and **prune to last 7** (data-model §2–4); idempotent + partial-failure isolation (FR-010/011). Leave pluggable hooks for matching (US3)/verdict (US4)/learning (US5)
- [ ] T026 [US2] Implement `triggerMetaSync` callable (same worker body, current workspace, 1-hour cooldown → `resource-exhausted`); register all Layer-2 callables in `functions/src/index.ts`
- [ ] T027 [P] [US2] Add `firestore.indexes.json`: `metaConnection` collection-group (`metaConnected`) + `adPerformance` (`evaluatedAt DESC`)
- [ ] T028 [US2] Wire sync-status UI (last/next sync, connection status, "Sync Now" with cooldown, re-auth prompt) into the Meta connection surface in `src/`

**Checkpoint**: US2 stores real Meta performance; US1+US2 both work independently.

---

## Phase 5: User Story 3 — Image Matching (Layer 3, P1)

**Goal**: Attribute Meta ads to generations by perceptual hash; unmatched ads become manually linkable; matches locked and workspace-scoped.

**Independent Test**: generate → fingerprint written; re-upload unedited to Meta → auto-match exposes metadata; unrelated image → unmatched → manual link persists.

### Tests for User Story 3

- [ ] T029 [P] [US3] Unit test `functions/src/__tests__/perceptualHash.test.ts` — JPEG re-upload of same image matches (≤ threshold); distinct images don't; two near-equal candidates → ambiguous → unmatched (spec §4.2)
- [ ] T029a [P] [US3] Fingerprint accuracy validation `functions/src/__tests__/fingerprintAccuracy.test.ts` — build a test corpus of 20+ generated images, simulate re-upload compression (JPEG quality reduction, PNG→JPEG conversion), run fingerprint matching against the corpus, assert **≥ 90% correct auto-matches** (validates SC-3)
- [ ] T030 [P] [US3] Contract test `functions/src/__tests__/imageMatching.contract.test.ts` — auto vs manual precedence (manual locked, re-sync never overrides); cross-workspace forbidden; backfill idempotent; **C1: assert the saved/edited Step-2 hook angle (not the originally-selected angle) is what the match exposes and learning reads** (Edge Case 7); (contract: `contracts/imageMatching.md`)

### Implementation for User Story 3

- [ ] T031 [P] [US3] Create `functions/src/perceptualHash.ts` — `sharp` 64-bit dHash (hex) + Hamming distance + closest/ambiguity/exact-tie rules (research §A)
- [ ] T032 [US3] Extend `serverGenerateFinalAd` in `functions/src/` to compute the dHash after Storage upload and return it in the response payload (no server-side `genId` write)
- [ ] T033 [US3] Client: write `imageFingerprint`+`imageFingerprintAlgo` onto the generation after `addDoc`, plus the `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` index entry (FR-014/015) in `src/`
- [ ] T034 [US3] Implement sync-time matching in `functions/src/metaSync/worker.ts` — download creative image, dHash, compare against workspace-scoped index only; set `matchType`/`generationId`/`matchDistance`; precedence lock (FR §4.3)
- [ ] T035 [P] [US3] Implement `linkUnmatchedAd` callable (same-workspace generations only; manual link permanent + locked); register in `index.ts`
- [ ] T036 [P] [US3] Create `functions/src/backfillImageFingerprints.ts` — one-time migration (idempotent; workspace-assigned generations only; missing-source stays unmatched)
- [ ] T037 [US3] Deleted-generation handling (Edge Case 16) via a **Firestore `onDocumentDeleted` trigger** on the workspace-scoped generations collection in `functions/src/`: when a generation is deleted, the trigger finds all `adPerformance` records referencing that `generationId` and sets `metadataAvailable=false` on each (revert display to unmatched, keep the already-applied aggregate contribution). Exclude `metadataAvailable=false` records from `pastWinningAds` queries (see T058). Also add the `imageFingerprints` doc-id read path
- [ ] T038 [P] [US3] Add `firestore.indexes.json`: `adPerformance` (`matchType`) for the unmatched-ads list

**Checkpoint**: matched creatives expose metadata; US1–US3 (all P1) deliver the data foundation.

---

## Phase 6: User Story 4 — Qarar Verdicts (Layer 4, P2)

**Goal**: Each matched creative gets an ordered, first-match Qarar verdict with rule code + Arabic reason + diagnosis, objective-gated.

**Independent Test**: Link CTR 0.4% @ 2,000 imp → 🔴 K3 + diagnosis; S1-meeting creative → 🟢; awareness campaign 0 conv → no kill (SC-12).

### Tests for User Story 4

- [ ] T039 [P] [US4] Unit test `functions/src/__tests__/qararEngine.test.ts` — ordered first-match table (⏳ gates / CB2 / K3 / K4 / K5 matrix / fatigue / S1); diagnosis ladder; **objective gating**: only K3+K4 fire on `other`, CB/K1/K2/K5/S1 disabled (SC-12); **free-funnel CPL path (spec §5.2 unified target)**: a `lead_magnet_call`/`free_webinar` ad with CPL ≤ `effectiveTargetCPL` + Link CTR > account متوسط → 🟢 S1; CB2 fires on today's spend ≥ 2.5× `effectiveTargetCPL` with 0 leads; data gate uses `spend ≥ 1× effectiveTargetCPL` — assert paid vs free select the correct target/cost metric

### Implementation for User Story 4

- [ ] T040 [P] [US4] Create `functions/src/qararEngine.ts` — pure `evaluateVerdict(ad, settings, baselines)`: data gates → circuit breaker → kill (K3/K4/K5) → fatigue → continue/scale, first-match-wins; objective gating (T009); diagnosis-ladder one-liner (rulebook §5.2/§5.4/§5.6). **Unified target (spec §5.2): use a single `effectiveTarget` = `effectiveTargetCPA` (paid funnels) or `effectiveTargetCPL` (free funnels), selected from settings; free funnels evaluate cost-per-lead in the data gate / CB1 / CB2 / S1 — identical rules/thresholds, only the target + cost metric change.** **Implementation-time defaults (rulebook ranges): A1 — data-gate impressions default `2000`; A2 — fatigue drop default `25%`; both as named tunable constants**
- [ ] T041 [US4] Wire `evaluateVerdict` into `functions/src/metaSync/worker.ts`; write verdict fields (`verdict`,`ruleCode`,`reasonAr`,`diagnosisAr`,`campaignObjective`,`evaluatedAt`) onto `adPerformance/{adId}` (data-model §3)
- [ ] T042 [US4] Add `firestore.indexes.json`: `adPerformance` (`campaignObjective`,`verdict`,`evaluatedAt DESC`) for S1-winner + verdict-feed queries

**Checkpoint**: every matched ad carries an auditable verdict.

---

## Phase 7: User Story 5 — Two-Component Learning (Layer 4b, P2)

**Goal**: Learn hook-angle (Link CTR) and visual-pattern (CPM + Link CTR) aggregates, tagged by geo/audience/objective; conversion-only feeds learning.

**Independent Test**: one image in two ad sets (win Gulf/broad, lose diaspora/retargeting) → two records, creative judged by best, aggregates updated (conversion bucket only).

### Tests for User Story 5

- [ ] T043 [P] [US5] Unit test `functions/src/__tests__/learningAggregates.test.ts` — hook vs visual scoring; `byObjective.conversion` learned, `other` display-only; same-image-multi-context best-result; alias resolution; copy/caption not tracked

### Implementation for User Story 5

- [ ] T044 [P] [US5] Create `functions/src/learningAggregates.ts` — `updateAggregates(record)`: write `hookPerformance/{angleKey}` + `visualPerformance/{patternKey}` (byObjective/byGeoTier/byAudienceType) + `_accountOverall` summary (data-model §5–6), conversion-only into learning. **U3: derive `patternKey` deterministically — canonicalize `creativeModes` by sorting the array before hashing `template+sortedModes+artDirection+universe`**
- [ ] T045 [US5] Wire `updateAggregates` into `functions/src/metaSync/worker.ts` after verdicts; ensure same-fingerprint-multiple-ad-sets creates separate records judged by best context (spec §6.3)

**Checkpoint**: aggregates power icons, dashboard, RAG, and winners.

---

## Phase 8: User Story 6 — "What's Working" Dashboard (Layer 5, P3)

**Goal**: Plain-Arabic sidebar dashboard: sync status, summary strip, strongest angles/visuals, unmatched-ads linking, verdict feed.

**Independent Test**: with synced data, all six sections render with the user's own numbers; "Sync Now" honors the 1h cooldown; zero forbidden terms.

### Tests for User Story 6

- [ ] T046 [P] [US6] Contract test `functions/src/__tests__/dashboard.contract.test.ts` — `getWhatsWorkingDashboard` shape; ranked sections use conversion data only; `other` in separate list (contract: `contracts/dashboardAndIcons.md`)

### Implementation for User Story 6

- [ ] T047 [P] [US6] Implement `getWhatsWorkingDashboard` callable in `functions/src/` — assemble sync status, summary counts, ranked angle/visual lists (conversion-only, win-count desc), unmatched ads, `other` list, recent verdicts feed, attribution banner (Edge Case 11); register in `index.ts`
- [ ] T048 [US6] Create `src/components/WhatsWorkingDashboard.tsx` — six sections A–F with plain-Arabic copy only (no متوسط/CTR/CPM/CPA/%), "Link to generation" opens same-workspace picker → `linkUnmatchedAd`
- [ ] T049 [US6] Add the dashboard sidebar entry + empty/limited-data states (Edge Cases 1–3) in `src/`
- [ ] T050 [US6] Run the SC-11 guard (T004) over dashboard copy; fix any forbidden term

**Checkpoint**: the loop is visible and the manual-linking surface exists.

---

## Phase 9: User Story 7 — Hook-Angle Indicators (Layer 6, P3)

**Goal**: 🔥/✅/⚠️ icons next to hook angles in Step 1/2 with plain-Arabic tooltips, informational only.

**Independent Test**: seeded data where `logical_authority` underperforms and `urgency` is top → ⚠️ on authority, 🔥 on urgency; tapping ⚠️ shows a numberless Arabic tooltip; angle with <3 conversion ads → no icon.

### Tests for User Story 7

- [ ] T051 [P] [US7] Contract test `functions/src/__tests__/hookAngleIcons.contract.test.ts` — gate (<3 → null), 🔥/✅/⚠️ thresholds (≤75% avg → ⚠️), tooltip contains no numbers, alias resolution, no-connection → all null (contract: `contracts/dashboardAndIcons.md`, spec §8.2)

### Implementation for User Story 7

- [ ] T052 [P] [US7] Implement `getHookAnglePerformance` callable in `functions/src/` — per-angle icon state + tooltip from `hookPerformance` conversion bucket vs `_accountOverall`; ≥3-ad gate; canonical alias (T011); register in `index.ts`
- [ ] T053 [US7] Extend `src/components/InputForm.tsx` — render icons next to each angle in Step 1 (and Step 2 hook cards); tap/hover tooltip; informational only (no block/popup/confirmation, FR-020); suppress when no connection/data

**Checkpoint**: the product demonstrably "knows your account".

---

## Phase 10: User Story 8 — RAG Injection + Phase 20 Wiring (Layer 7, P3)

**Goal**: At ≥10 conversion-matched creatives, silently inject performance context at three points and wire the 5 most-recent S1 winners into the Concept Director; fail-open, no regression below threshold.

**Independent Test**: <10 → generation byte-identical to today; ≥10 → PERFORMANCE_CONTEXT appended at hook + visual points and up to 5 winners reach `pastWinningAds`; winners-fetch failure → `[]`.

### Tests for User Story 8

- [ ] T054 [P] [US8] Unit test `functions/src/__tests__/ragContext.test.ts` — gate (<10 → `insufficient`, no injection; ≥10 → inject); conversion-only counts; conservative language present
- [ ] T055 [P] [US8] Unit test `functions/src/__tests__/pastWinningAds.test.ts` — 5 most-recent S1 by `evaluatedAt` desc; deleted-gen excluded; fail-open → `[]`

### Implementation for User Story 8

- [ ] T056 [P] [US8] Create `functions/src/ragContext.ts` — `getRAGContext({userId,workspaceId,adAccountId,inputs})` → `{topPerformers,avoid,insights,sampleSize,insufficient}`; 10-conversion-match gate; PERFORMANCE_CONTEXT block builders (hook + visual) with conservative language
- [ ] T057 [US8] Append RAG blocks at the two prompt points in `functions/src/generators.ts` (`generateHooks`/`generateTOV` and `generateBuildPlan`), after existing `retrieveCreativePatterns()`/`buildPersonalizationContext()`, routing any prompt-string addition through `buildFinalImagePrompt()`
- [ ] T058 [US8] Implement `getPastWinningAds` (5 most-recent S1, conversion-only, exclude `metadataAvailable=false`) and wire results into the Phase 20 Concept Director `pastWinningAds` in `functions/src/conceptDirector.ts` / `index.ts`; fail-open → `[]`
- [ ] T059 [US8] Client-write `resolutionTrace.performanceContext` (injected/sampleSize/hook+visual injected/pastWinningAdCount) onto the generation after `addDoc` in `src/` (data-model §9)

**Checkpoint**: learning turns into better generations; all 8 stories functional.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T060 [P] Run `specs/phase-14/quickstart.md` end-to-end; record evidence per layer
- [ ] T061 Full regression: `npm run build` + `cd functions ; npm test`; confirm SC-10 (no-Meta unchanged), SC-11 (zero forbidden terms), SC-12 (no kills on non-conversion)
- [ ] T062 [P] Verify workspace-deletion cascade purges settings, snapshots, adPerformance, baselines, aggregates, fingerprint index, and the Meta connection (Edge Case 15)
- [ ] T063 [P] Confirm each phase's capability flag lets it ship independently and reverse cleanly (plan §Implementation Phasing)
- [ ] T064 Update `CLAUDE.md` Recent Changes with the Phase 14 summary once merged

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (P1)** → **Foundational (P2)** blocks all stories.
- Data-flow order across stories: **US1 → US2 → US3 → US4 → US5 → {US6, US7, US8}**. US6/US7/US8 depend on US5 aggregates but each is independently testable with seeded data.
- **Polish** after desired stories complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No story deps (MVP).
- **US2 (P1)**: needs US1's `effectiveTargetCPA` for downstream verdicts; sync/store testable standalone.
- **US3 (P1)**: matching plugs into the US2 worker; fingerprint write is standalone.
- **US4 (P2)**: needs US1–US3 (target CPA + matched ads).
- **US5 (P2)**: needs US4 verdicts.
- **US6/US7/US8 (P3)**: need US5 aggregates (US8 also needs US4 S1 winners).

### Within Each Story

Tests before implementation → pure module → callable/worker wiring → UI → indexes.

### Parallel Opportunities

- Setup: T003, T004 parallel.
- Foundational: T006–T011 largely parallel (distinct files).
- Per story, all `[P]` tests + pure modules run in parallel; worker-wiring tasks (same `worker.ts`) are serialized: **T025 → T034 → T041 → T045**.

---

## Parallel Example: User Story 1

```bash
Task: "Unit test functions/src/__tests__/cpaEconomics.test.ts"          # T012
Task: "Contract test functions/src/__tests__/funnelSettings.contract.test.ts"  # T013
Task: "Create functions/src/cpaEconomics.ts"                            # T014
Task: "Create src/components/FunnelSettingsForm.tsx"                    # T017
```

---

## Implementation Strategy

### MVP First

1. Phase 1 Setup → Phase 2 Foundational → **Phase 3 US1** (Funnel Settings). STOP, validate, demo — standalone value with no Meta data.

### Incremental Delivery

2. US2 + US3 (P1) → real Meta data + attribution. 3. US4 + US5 (P2) → verdicts + learning. 4. US6 → dashboard; US7 → icons; US8 → RAG/winners (P3). Each ships behind its capability flag and reverses cleanly.

### Shared-file serialization

`functions/src/metaSync/worker.ts` is touched by US2/US3/US4/US5 — implement those touches in story order (T025 → T034 → T041 → T045), never in parallel.

---

## Notes

- `[P]` = different files, no incomplete dependency.
- Every user-facing string is plain Arabic ("متوسط" internal-only); SC-11 guard (T004) runs in Polish.
- Never search/link fingerprints across workspaces (FR-023).
- Pure modules (`cpaEconomics`, `perceptualHash`, `qararEngine`, `learningAggregates`, `ragContext`, `targetingContext`, `campaignObjective`) carry the unit-test burden — they are side-effect-free by design.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
