# Open-Work Audit — main @ `1995fcb` (2026-09-23)

Read-only inventory of every open item in `D:\Pro Ads AI - SaaS - FAL`. Groups
everything into the smallest number of focused PRs. Per Rule 0 of `AGENTS.md`,
this file is the durable record; the chat output is the ephemeral view.

---

## Headline counts

| Category | Count | Notes |
|---|---|---|
| Local branches not merged into `main` | **33** | 30 are obsolete (post-merge follow-ups whose content is already in `main` via later PRs). 2 carry real unfinished spec work (`969-phase-4`, `969-cumulative-learning`). 1 carries a tiny AGENTS.md cleanup (`0955-hotfix-flux-cleanup`). |
| Worktrees | **16** (7 marked `prunable`) | 9 are still on disk and reachable; 7 reference branches that have moved on. |
| Spec directories | **44** (incl. `_shared`) | 1 partially shipped (`959`); 1 with stale checklist (`phase-14`); the rest fully shipped. |
| TODO/FIXME/HACK/XXX/DEFERRED markers in code | **5 substantive, 4 trivial** | See §3 below. |
| Disabled test cases (`describe.skip` / `it.skip` / `xit`) | **0** | 13 placeholder `skip()` calls in `workspace.test.ts` use a custom local helper that prints but does not run; intentional. |
| Open PRs | **0** | All recent work landed: #75 merged 2026-09-23, #74 merged 2026-09-22, #73 merged 2026-09-19. |

---

## Part 1 — Inventory

### §1. Unmerged branches

Method: for each local branch, computed `git rev-list --count main..$branch` and
`git rev-list --count $branch..main` and inspected the unique ahead log. The
"is the work already in main" question was answered by checking whether the
substantive commits on the branch tip have a corresponding merge commit on
`main` (i.e. PR #N was merged from a fork of that branch).

#### 1a. Obsolete — all ahead work already in main via later PRs (delete these)

These 30 branches have no unique substantive content left on the tip. Most are
post-merge CodeRabbit follow-up cleanups that landed via a subsequent PR. The
"squash merge" pattern erases the branch identity but not the commits, so the
work is already on `main`.

| Branch | Last ahead commit | Absorbed by |
|---|---|---|
| `001-resolver-completeness-trace` | 2026-04-07 | PR #11 (Apr 9) |
| `003-qa-fixtures` | 2026-04-09 | PR #14 (Apr 9) |
| `004-testimonial-carousel` | 2026-04-10 | PR #15 (Apr 10) |
| `005-render-prompt-pipeline`, `005-render-prompt-pipeline-followup` | 2026-04-10 | PR #16 (Apr 10) |
| `006-team-management`, `006-team-management-followup` | 2026-04-16 | superseded by Phase 13 (Stripe migration, 021) |
| `007-failure-classification` | 2026-04-05 | PR #9 (Apr 5) |
| `008-lang-quality-contracts` | 2026-04-08 | PR #13 (Apr 8) |
| `009-billing-plan-access` | 2026-04-15 | PR #18, then fully replaced by 021 (Paddle removed) |
| `010-favorites-workspace` | 2026-04-21 | PR #20 + #22 (Apr 21) |
| `012-workspace-logic` | 2026-04-22 | PR #22 (Apr 22) |
| `013-saved-projects` | 2026-04-22 | PR #23 (Apr 22) |
| `015-brand-colors`, `955-aspect-reflow` | 2026-04-26 | PR #28 (Apr 26) |
| `016-creative-modes-qa` | 2026-04-28 | PR #30 (Apr 28) |
| `017-resize-reflow`, `022-copy-quality` | 2026-06-01 | PR #35 (Jun 1) |
| `021-stripe-migration` | 2026-05-11 | PR #33 (May 11) |
| `023-hotfix-tdz-app-startup`, `023-post-drift-audit-fixes` | 2026-05 | PR #32 (May 10), #34 (May 22) |
| `024-hotfix-post-17` | 2026-06-04 | PR #36 (Jun 4) |
| `0951-hotfix-cultural-compliance` … `0955-hotfix-flux-cleanup` (HOTFIX-C/D/E/F/G) | 2026-04-24 to 2026-04-28 | PRs #24, #26, #27, #28 (Apr 24–26) |
| `953-hotfix-multi-logo` | 2026-04-24 | PR #26 (Apr 24) |
| `956-brand-colors` | 2026-04-27 | PR #29 (Apr 27) |
| `957-post-drift-audit-fixes` | 2026-05-21 | absorbed by 023 |
| `958-copy-quality` | 2026-06-15 | absorbed by PR #38 (Jun 15) |
| `961-independent-multisize`, `962-gaze-direction-dr`, `963-universe-aware-copy`, `964-concept-director`, `967-meta-workspace-isolation`, `968-funnel-economics-rebuild`, `970-sync-unification` | various | PR #44, #47, #48, #49, #66, #69, #70 (the ahead content is CodeRabbit rounds folded into those PRs) |
| `phase-19-gaze-direction`, `phase-20-concept-director`, `phase-23-copy-structure`, `phase-24-conditional-copy`, `phase-26-generation-history`, `phase-28-expression-adaptation` | various | PR #46, #49, #38, #40, #43, #52 — folded |
| `cumulative-learning` | 2026-09-02 | PR #69 |
| `meta-workspace-isolation` | 2026-08-09 | PR #65 |
| `funnel-economics-rebuild` | 2026-08-30 | superseded by `968-funnel-economics-rebuild` branch which itself is absorbed |
| `hotfix/plan-alignment` | 2026-04-21 | PR #20 |
| `backup/mixed-work-d5ab601` | 2026-04-03 | pre-merge backup; `d5ab601` was reverted in 36f3eae |
| `hotfix-reflow-dynamic-layout`, `hotfix-reflow-story-cta-v2`, `hotfix-prompt-fidelity`, `hotfix-image-persistence`, `fix-916-text-clipping`, `fix-phase24b-cta-leak-step3`, `fix/meta-oauth-scope-and-page-picker`, `fix/meta-pages-use-oauth-list`, `fix/team-meta-message-and-funnel-workspaces`, `fix/project-limit-banner-latch`, `fix/issue-d-team-workspace-access`, `fix/restore-business-management-scope` | various | each folded into the PR it followed up (e.g. PRs #41, #42, #50, #51, #45, #43, #61, #63, #65, #59, #58, #64) |
| `model-config-consolidation` | 2026-08-30 | PR #67 |

#### 1b. Real unfinished work (these stay)

| Branch | Ahead commits | Substance |
|---|---|---|
| `969-phase-4` | 27 | Post-PR-#73 follow-ups: rounds 15–23 (T053 seal-transition race, §22.9 correction, Test 10 discriminator, ledger-in-lease, failed-read abort, CodeRabbit rounds 14–21 pre-merge checks). NOT in `main`. |
| `969-cumulative-learning` | 79 | The original Phase 969 PR source plus Batches 22–30 (visual-withdrawal deadlock fix, add/withdraw symmetry across every pair, FR-021 withdrawal average, FR-036 creative count, Phase 7 Batch 17 multi-funnel from `byFunnelType`). The first ~50 commits duplicate PR #71 (Phase 1–3, merged). The unique ahead content is Batches 22–30. NOT in `main`. |
| `0955-hotfix-flux-cleanup` | 1 | Removes stale `fal.ai FLUX-PuLID` and `falGeneration.ts` references from `AGENTS.md:93,115` and `.opencode/agents/gemini-prompt.md:17`. Branch tip is old (2026-04-28) and the `AGENTS.md` and the agent prompt have both been rewritten since, so the same strings appear in `main` again and the fix is still relevant. One-commit PR possible. |
| `fix-sync-banner` | 5 | Deletes `specs/fix-sync-banner/merge-and-deploy.md` (an outdated report). Trivial docs cleanup. |
| `fix-sync-infra` | 5 | Only unique ahead is `080abf6 docs(fix-sync-infra): redact owner email from PR-74 report`. The substantive fix is already in `main` via PR #74. |
| `fix-workspace-bleed` | 4 | Adds sub-label fallback to `wsId` when `metaAdAccountName` is empty; `batch-02-report`. The substantive code fix landed in PR #72 (`c2f51ae`) but the additional label edge case is NOT in `main`. |
| `phase-22-copy-quality` | 13 | Backend sanitizer for `copyScoringTrace` (round 7) — `f786d52`. Phase 22 itself shipped via PR #60 (`b3828f7`) but this round-7 follow-up fix is NOT in `main`. |
| `phase-14-rag-meta` | 90 | All post-Phase-14 work that landed via PR #57, #56, #55, #54, #53 (Phase 14 batches 01–05). The unique ahead content is round-5 polish and CodeRabbit follow-ups, mostly folded via subsequent PRs but worth a quick check on a rebase. |

#### 1c. Worktrees (16)

7 are `prunable` and reference branches whose working trees are stale on disk:
`022-copy-quality`, `963-universe-aware-copy`, `fix-916-text-clipping`,
`model-config-consolidation`, `openai-image-swap`, `phase-17-independent-multisize`
(=`961-independent-multisize`), `phase-19-gaze-direction` (=`962-gaze-direction-dr`),
`phase-20-concept-director`, `phase-24-conditional-copy`, `phase-28-expression-adaptation`.

9 are reachable:
- `969-cumulative-learning`, `969-phase-4`, `970-sync-unification` (sync worktrees from D:\proads-worktrees\)
- `fix-issue-d` (active fix/issue-d-team-workspace-access)
- `fix-limit-banner` (active fix/project-limit-banner-latch)
- `fix-sync-banner`, `fix-sync-infra`, `fix-workspace-bleed` (active fix worktrees)
- `funnel-economics-rebuild`, `meta-workspace-isolation`, `hotfix-image-persistence`, `hotfix-prompt-fidelity`, `phase-14-rag-meta`, `phase-22`, `phase-26-generation-history`

---

### §2. Spec inventory (`specs/`)

Walked every directory under `specs/` (44 total, incl. `_shared`). Determined
shipped-vs-not from the **code** — `tasks.md` is unreliable as a status signal
because it was never retroactively ticked after PRs merged (see §2c).

#### 2a. Fully shipped (41 of 44)

Every spec directory except `959-copy-structure-variation` (partial) and
`phase-14` (stale checklist) has its key modules wired into the live build.
Full table in `docs/investigations/dead-exports-unreachable-callables.md`
companion notes; quick summary:

001-resolver, 002-frontend-filter, 003-qa-fixtures, 004-testimonial,
005-render-prompt, 006-team-management, 007-failure-classification,
008-lang-quality, 009-billing-plan-access (superseded by 021),
010-favorites-workspace, 012-workspace-logic, 013-saved-projects,
016-creative-modes-qa, 017-resize-reflow (superseded by 961),
021-stripe-migration, 022-hotfix-h, 023-post-drift-audit,
025-openai-image-swap, 028-expression-adaptation, 09.50-hotfix-plan-alignment,
0951-hotfix-cultural-compliance, 0953-hotfix-hybrid-logo, 953-hotfix-multi-logo,
955-aspect-reflow, 956-brand-colors, 958-copy-quality, 960-conditional-copy,
961-independent-multisize, 962-gaze-direction-dr, 963-universe-aware-copy,
964-concept-director, 965-team-workspace-access, 966-copy-scoring-gate,
967-meta-workspace-isolation, 968-funnel-economics-rebuild,
969-cumulative-learning (Phase 1–4 shipped; Phase 5–6 not),
970-sync-unification, fix-sync-banner, fix-sync-infra, fix-workspace-bleed.

#### 2b. Partially shipped

**`specs/959-copy-structure-variation/`** — backend ships; frontend gap.
- Shipped: `copyDiversity.ts`, `rotateCarouselAngles` in `generators.ts:8452`,
  `rotateOpenings`, `drawDimensions`, `getRecentFingerprintsForRotation`.
- Missing: the in-card variation carousel UI (Phase 23.A). The "Generate 4
  More Like This" UI inside the hook card does not exist in `src/App.tsx`.
  The skipped-test placeholder at `functions/src/__tests__/copyStructure.test.ts:184-194`
  documents this: 3 assertions skipped with the note "Phase 23.A frontend
  wiring deferred — handler not yet in App.tsx".
- Files: `src/utils/hookVariationParser.ts` exports `parseHookVariation` /
  `parseHookVariations` (tested, used by tests) but `App.tsx` never calls them.
- Cost: half a day — wire the helper into the hook card, retire the 3 skipped
  assertions.

**`specs/phase-14/`** — 19/66 tasks done in `tasks.md`, but most of the
"unfinished" tasks were absorbed by later specs (968 funnel-economics, 969
cumulative-learning, 967 meta-workspace-isolation). The remaining 47 tasks
are either superseded or never going to ship (e.g. legacy fingerprint
investigation, dashboard UI fixes that landed in 967).
- Files: `specs/phase-14/tasks.md`, `reports/`, `data-model.md`, etc.
- Cost: half a day to read each remaining task and either tick it (if it
  shipped elsewhere) or mark it superseded with a one-line note. Pure docs.

#### 2c. Specs with stale `tasks.md` (10 of 41) — code is shipped, checklist isn't

These are not "not shipped" — they shipped but the checklist was never ticked:

| Spec | tasks.md | Reality |
|---|---|---|
| 022-hotfix-h-pricing-naming | 0/11 | `PricingTable.tsx` matches `ui-labels.md` byte-for-byte |
| 958-copy-quality | 0/25 | `READING_LEVEL_BLOCK` / `LIVED_SYMPTOM_BLOCK` / `FABRICATION_POLICY_BLOCK` / `BANNED_CTA_LIST` all imported into `generators.ts:386-389`, used at 4 prompt surfaces |
| 960-conditional-copy | 0/33 | `extractCopyFieldsFromResponse` live, `conditionalCopyFields.test.ts` covers T014 |
| 962-gaze-direction-dr | 0/27 | PR #47 merged; `gazeMap.ts` is ~470 lines, tested |
| 963-universe-aware-copy | 1/34 | PR #48 merged; `universeCopyMap.ts::resolveUniverseCopyDecision` wired at 4 `generators.ts` sites |
| 964-concept-director | 0/26 | PR #49 merged; `conceptDirector.ts` + `varianceValidator.ts` actively used |
| 965-team-workspace-access | 0/36 | PR #59 merged; `workspaces/workspacePolicy.ts::resolveCallerScope` used by every auth-touching callable |
| 967-meta-workspace-isolation | 0/99 | PR #66 merged; 9 phase reports confirm closure |
| 968-funnel-economics-rebuild | 0/74 | PR #69 closure merged; claude-audit-report.md PASS |
| 969-cumulative-learning | 1/79 | PR #71 + #73 merged; production verification on Boran completed Sep 22 |

Cost: 2 hours to walk each `tasks.md` and tick the boxes that match shipped
code, with a "shipped via PR #N" note for traceability. Documentation-only,
no code change. **Folds into Batch F below.**

---

### §3. TODO/FIXME/HACK/XXX/DEFERRED markers in code

`grep` over `functions/src/**/*.ts` and `src/**/*.{ts,tsx}` for
`TODO|FIXME|HACK|XXX|DEFERRED|@deprecated`. After filtering noise:

| File:Line | Marker | Substance | Cost |
|---|---|---|---|
| `functions/src/copyScoringGate.ts:44` | `DEFERRED_DIMENSIONS` | Exports 6 dimensions (`hookAngleFit`, `formatFit`, `visualCompatibility`, `ctaStrength`, `proofStrength`, `objectionHandling`) the gate **does not score**. Documented as "DEFERRED to Phase 23" in `copywriting_knowledge.ts:801-806`. Phase 23 shipped; the dimensions stayed deferred. | Decision call: either add the dimensions (revisit the gate design — not small) or remove the export and the test `__tests__/copyScoringGate.test.ts:151` that asserts the count is exactly 6. The latter is 5 minutes and removes a misleading "scoring" signal. |
| `functions/src/copywriting_knowledge.ts:801-806` | `DEFERRED to Phase 23` (in a comment listing the same 6 dimensions) | Same as above. | Same as above. |
| `functions/src/metaConnection.ts:541,557` | `DEFERRED` / `TODO Phase 14 follow-up: KMS envelope encryption` | `tokenCrypto.ts` exists and is tested but not wired. `reencryptAndStoreToken` is a no-op that throws. The legacy AES path is in production. | One of: (a) wire KMS (~half a day, depends on KMS key creation in production); (b) delete `tokenCrypto.ts` and the no-op `reencryptAndStoreToken` if KMS is decided against. Drop or finish — not a "leave as is". |
| `functions/src/whatsWorkingDashboard.ts:512` | `TODO: also capture the currency during the Meta connect flow` | 1-line follow-up: `metaConnection.ts` should write `currency` to the workspace-private connection doc. | One-line code change + write path verification. ~30 min. |
| `functions/src/learning/applyLearningWrites.ts:94,122` | `TODO` (visual withdrawal → `aggregateDelta.ts` lift) | The `withdrawAvgLocal` helper duplicates logic in `aggregateDelta.ts`; comment says lift into `aggregateDelta.ts` in a follow-up. | Small refactor (the comment is self-contained). 1 hour. |
| `functions/src/__tests__/copyStructure.test.ts:184-194` | `SKIP: Phase 23.A frontend wiring deferred` | 3 assertions explicitly skipped because the 959 in-card variation handler doesn't exist in `App.tsx`. | Same fix as the 959 partial-shipping: wire the handler, retire the 3 skipped assertions. |
| `src/components/WhatsWorkingDashboard.tsx:17,29,36` | `@deprecated` on `canSyncNow` / `cooldownEndsAt` | Frozen-constant fields removed in Phase 970; kept for cached-JS clients. | Either delete in a "drop cached-JS compatibility" batch, or leave. Low-stakes. |
| `src/App.tsx:2809` | `DEFERRED to the guard dialog here` | Inline comment in the workspace switch flow. | Documentation note, not a task. |
| `functions/src/index.ts:1344` | "Copy each Price ID" comment | Setup comment about `TOPUP_PRICES` env. | Documentation note, not a task. |

**Trivial noise** (filtered out as notes, not tasks): `generators.ts:2909` and `7521` are example `XXXXXX` patterns in prompt comments, not deferral markers.

---

### §4. Brief verification

The brief listed 9 known-open items. **Each is verified against the current tree below.** Where the brief is wrong, I say so.

#### 4a. Phases 5 and 6 of Issue 969 — funnel-type weighting and creative-counted retrieval — **CONFIRMED OPEN**

Both are explicitly named as absences in the PR #73 squash message
(`specs/969-cumulative-learning/IMPLEMENTATION-LOG.md:571-587`):

> 2. Funnel-type weighting (FR-030, FR-031, FR-032a). The
>    `byFunnelTypeCreativeCount` field (distinct creatives per bucket) is
>    the prerequisite for a non-inflated weighting path. ... A weighting path
>    on `byFunnelType.count` (rows) would recreate the 7.4:1 fan-out...
>    the fix is still pending.
>
> 3. The creative-counted retrieval path (FR-033; FR-034a's floor in
>    `getTopWinners`; FR-035's activation latch). `getTopWinners.ts` is
>    untouched and still selects winners per ad row. ... the latch (once on,
>    stays on) is absent — a partial sync that drops the count below 10
>    could open the gate later.

The seed is correct. Neither is in `main`. The hook/visual aggregates
themselves carry `creativeCount` and `contributedCreativeKeys` (shipped in
Batch 30 via commit `a156c8e`), but the parallel `byFunnelTypeCreativeCount`
field is **commented in `learningAggregates.ts:100-119`** as the seam the
FR-030 implementer must wire — and is not wired.

`getTopWinners.ts` (line 30, line 16 of the actual file) is the pre-Phase-14
code: it queries `adPerformance` for verdict-`YES` rows and sorts by
`evaluatedAt` descending. It does **not** consume `creativeCount`. The
"10-distinct-creative activation latch" (`FR-035`) is described in
`ragContext.ts:167` as reading `creativeCount` from the hook aggregate; the
latch (`once on, stays on`) is **absent** — partial sync that drops the
count below 10 would clear the gate. Confirmed by
`IMPLEMENTATION-LOG.md:586-587`.

#### 4b. T054 — end-to-end two-sync concurrency test — **CONFIRMED OPEN**

`specs/969-cumulative-learning/IMPLEMENTATION-LOG.md:4315-4319`:

> T054 (end-to-end two-run race discriminator) remains an optional
> orchestration-coverage follow-up; the property itself lives inside
> `applyLearningWrites` and is now covered by Tests 9, 10, and 14.

Test 9, 10, 14 cover the property at the function level (not end-to-end).
T054 is the orchestrator-level race. Owner decision.

#### 4c. T068 — Meta's per-day downward revisions — **CONFIRMED OPEN AND NOW POSSIBLE**

`specs/969-cumulative-learning/tasks.md:228` T068 still unchecked.
Per-day figures are now stored (Phase 4 landed Sep 19 via PR #73, FR-081
`accrueDays`). The verification can run. The script does not exist.

#### 4d. The elapsed clock during the long sync wait — **CONFIRMED PROPOSED-NOT-BUILT**

`specs/fix-sync-banner/investigation-and-fix.md:487-500` §7.6 proposes:

> Render an elapsed-time counter next to the spinner (`Syncing… 1m 42s`),
> reading `Date.now() - pressStartedAt` every second. ~10 lines in
> `WhatsWorkingDashboard.tsx`, ~10 in `App.tsx:handleSyncMeta`.

The proposal explicitly says: "proposed, not built." Confirmed.

#### 4e. `.gitattributes` — **CONFIRMED MISSING**

`Test-Path .gitattributes` returns False; `git ls-tree main .gitattributes`
returns nothing. No line-ending policy file exists. A clean tree read once
showed 1,170 modified files because of CRLF drift between Windows-checkout
and Linux-deploy line endings. It will recur on every contributor who
checks out on Windows with autocrlf.

#### 4f. Node version drift — **BRIEF IS WRONG**

`functions/package.json` declares `"engines": { "node": "24" }`.
`firebase functions:list --json` (deployed runtime) reports `"runtime":
"nodejs24"` on all **95** deployed callables. There is no drift. The brief
incorrectly asserts the deployed runtime is Node 22.

#### 4g. Five test stubs looser than real Firestore — **CONFIRMED, scope broader than "five"**

`specs/969-cumulative-learning/reports/round-22-stub-and-chain.md:154-176`
documents the audit. The 5 **bounded-read** `getAll` stubs were tightened in
that round (the "five" the brief refers to). The audit table also lists
additional looseness that was **reported but not fixed**:

- `runTransaction` retry semantics (2 sites — lease primitive doesn't depend)
- `StubBatch.set` data validation (trivial)
- `StubBatch.commit` always-succeeds default (overridden in tests)
- `StubCollection.where`/`limit`/`orderBy`/`get` query-chain permissiveness
  (tests don't chain `where().get()` against the bounded read)
- `FieldValue.serverTimestamp`/`increment` (trivial)

None of these "reported not fixed" sites touch the bounded read. The brief is
correct that "this class of gap hid three production-breaking defects in this
feature" — rounds 17, 18, 19 all closed defects in the loose-stub class.
Closing the 5 "reported" ones is real work; the others are negligible.

#### 4h. Lint is unusable — **CONFIRMED, count is 1695 not 1583**

`npm run lint` exits 1 with:
- 1546 errors
- 149 warnings
- Total: **1695** problems (brief said 1583 — off by ~7%)

Top offenders: `no-explicit-any` in legacy Firestore data paths
(`src/store.ts`, `src/services/workspaceService.ts`, `src/types.ts`,
`src/utils/hookPayload.ts`, etc.). Pre-existing, not introduced recently.

#### 4i. Historical report files carrying workspace ids and ad-account ids — **CONFIRMED**

244 hits across 18 markdown files of `islam210.06@gmail.com`,
`ywpCgWsXqVP4tlNwfhSoTqMjRw52`, and `act_*` IDs. Concentrated in:

- `specs/969-cumulative-learning/IMPLEMENTATION-LOG.md` (20 hits)
- `specs/969-cumulative-learning/reports/phase4-production-verification.md` (22)
- `specs/969-cumulative-learning/reports/round-22-stub-and-chain.md` (4)
- `specs/970-sync-unification/reports/batch-01-investigation.md` (19)
- `specs/fix-sync-banner/investigation-and-fix.md` (1)
- `specs/fix-sync-infra/investigation-and-fixes.md` (8), `merge-and-deploy.md` (8)
- `specs/fix-workspace-bleed/reports/batch-01-report.md` (14), `fix-report.md` (1), `investigation.md` (42)
- `docs/investigations/969-*.md` (97 across 6 files)
- `reports/bug-a-team-meta-bug-b-funnel-workspaces.md` (6)
- `reports/meta-pages-only-2-investigation.md` (2)

`specs/fix-sync-infra/merge-and-deploy.md:97-102` already documents why this
stays: redaction only in this report would be inconsistent with prior-merged
history. The brief is correct that this is "left as-is because they already
appear in merged history." Force-pushing a redact would lose the
cross-reference evidence (e.g. which ad account was the production baseline
for the Boran syncs) and would still leave the data in the older commits.

---

### §5. Anything else

#### 5a. Dead exports and unreachable callables

`docs/investigations/dead-exports-unreachable-callables.md` (29 KB) is the
durable inventory. Summary:

| Category | Count | Risk |
|---|---|---|
| Unreachable `onCall` callables in `functions/src/index.ts` | **17** | Each adds deploy surface and confuses the next reader. Most have comments saying "DEPRECATED" or "delete after first run". |
| Dead modules (whole-file, zero importers) | **6** | `emptyFieldFilter.ts`, `billing/billingLogger.ts`, `billing/billingStateShape.ts`, `savedProjects/projectCoverImage.ts`, `savedProjects/thumbnailDelete.ts`, `learning/efficiencyFigure.ts`. |
| Dead frontend exports | **3 whole-file / 4 type-only** | `src/components/ReflowPreview.tsx` (lazy-import removed), `workspaceService.restoreWorkspace` wrapper, `ReflowMethod`/`ReflowScope`/`ReflowImageRequest`/`ReflowImageResponse` types. |
| Backend callables with dead re-exports | **2** | `disconnectMetaAccount` (superseded by `metaDisconnect`), `purgeExpiredWorkspaces` (never registered). |

Notably **live and correct**: `functions/src/paddle/` does not exist (Paddle
fully removed); `functions/src/stripe/` is the only live billing provider;
`metaLegacySync` scheduled function (the comment says "REMOVE after Batch 04
ships" — Batch 04 did ship via Phase 970, candidate to delete but verify no
downstream readers first).

#### 5b. Disabled test cases

- `describe.skip` / `it.skip` / `xit` / `todo()` / `fdescribe` markers in
  `functions/src/**/*.test.ts` and `src/__tests__/`: **zero hits**.
- 13 `skip("...")` calls in `functions/src/__tests__/workspace.test.ts:361-373`
  use a **local custom** `function skip(name, _fn?)` helper at line 33 that
  prints the name but does not run the assertion. These are Phase-967
  placeholder patterns for emulator-only paths. Not jest-style skips; not
  test-runner-blocking; do not affect CI.

#### 5c. Functions deployed but unreachable from the app

17 of 84 exports of `functions/src/index.ts` are unreachable from the React
frontend (per `docs/investigations/dead-exports-unreachable-callables.md`
§2a). None of these cause a runtime error — Firebase just deploys callable
URLs that no client calls. The risk is surface area, not correctness.

#### 5d. Commented-out callable registrations

One: `functions/src/index.ts:5332-5350` — `reflowImage` onCall block-commented
with the explicit note "Superseded by Phase 17 independent multi-size
generation... kept out of the deploy list while preserving the module body
for any future revert." Deliberate. Keep.

---

## Part 2 — Batches

Eight batches, ordered by impact. Each is one PR.

### Batch A — **Finish Issue 969 (Phases 5 and 6): funnel-type weighting + creative-counted retrieval** — DO

**What it is.** Complete the two pieces the PR #73 squash message named as
absences. Add `byFunnelTypeCreativeCount` to the hook and visual aggregates,
wire funnel-type **weighting** in `getTopWinners.ts` (not exclusion — FR-030
and FR-031 are explicit on this), switch `getTopWinners.ts` to count distinct
creatives not ad rows (FR-033, FR-034a), and add the
"once on, stays on" activation latch in `ragContext.ts` (FR-035).

**It contains.**
- `969-phase-4` branch ahead: rounds 15–23 of post-PR-#73 follow-ups (the
  T053 seal-transition race, §22.9 correction, Test 10 discriminator, ledger-
  in-lease refactor, failed-read abort, CodeRabbit rounds 14–21 pre-merge).
  These close defects found during the rounds but not the Phases-5-and-6
  work itself.
- `969-cumulative-learning` branch ahead: Batches 22–30 (the visual-
  withdrawal deadlock fix, add/withdraw symmetry, FR-021 withdrawal average,
  FR-036 creative count, Phase 7 Batch 17 multi-funnel plumbing).
  Batches 22–30 fold into the same mental model as the rounds 15–23 work —
  both are post-PR-#73 follow-ups on the same data structures; landing them
  together with the Phases-5-and-6 work avoids two rebase cycles.
- T054 (end-to-end two-sync race test) — optional but cheap once the
  Phases-5-and-6 plumbing exists.
- T068 (Meta per-day downward revision study) — write the script that
  compares the same `isoDate` across two successive syncs while in window
  and reports the magnitude. Per-day figures are now stored (PR #73,
  Sep 19); this becomes answerable in a few hours.

**Why these belong together.** Both `969-phase-4` and `969-cumulative-learning`
ahead content is post-PR-#73 work on the same Issue 969 data structures
(`learning/aggregateDelta.ts`, `learning/learningPerAdLoop.ts`,
`getTopWinners.ts`, `rankingEngine.ts`, `ragContext.ts`). Landing the
Phases-5-and-6 retrieval changes and the post-PR follow-ups in the same PR
means one rebase against `main`, one test run, one deploy. T054 is the
end-to-end test for the same orchestrator the retrieval touches. T068 is
a measurement script that reads the same per-day fields the new retrieval
consumes.

**Rough size.** 3–5 days. The `byFunnelTypeCreativeCount` field is a
parallel mirror of the existing `byObjective.contributedCreatives` (Batch 06
work, already shipped) — small. The funnel-type weighting pass in
`getTopWinners.ts` is medium. The activation latch is a one-line field
read with a "set if currently false" guard. The 969-phase-4 ahead and
969-cumulative-learning Batches 22–30 are bug-fix work already self-tested
on the source branches. T054 is one new orchestrator test. T068 is one
new script + one report.

**What it depends on.** Nothing. Phase 4 (PR #73) is in `main`. All
prerequisite fields exist. Both branches compile against current `main`.

**What breaks if it is never done.** The owner-stated defect: the AI ranks
winners by `avgLinkCtr` only, not by efficiency or funnel-fitted evidence.
The owner explicitly wanted "what gets sales, not what gets clicks." Every
additional sync that runs without the funnel-type weighted retrieval is
a sync that could have ranked better but didn't. The latch gap is real
but smaller: a partial sync that drops the count below 10 could
transiently switch the AI back to no-learning mode.

---

### Batch B — **Delete dead exports and unreachable callables** — DO

**What it is.** Remove the 17 unreachable callables, the 6 dead modules, the
3 dead frontend files, and the 4 dead type-only exports. One PR.

**It contains.** All of `docs/investigations/dead-exports-unreachable-callables.md`
§7's "lowest-risk first" table. The full deletion set:

- 8 deprecated Stripe callables (`getSubscription`, `cancelSubscription`,
  `reactivateSubscription`, `getInvoices`, `retryInvoice`,
  `createSetupIntent`, `updatePaymentMethod`, `changePlan`) — lines 1909–2343.
- `generateCreative` (line 199, superseded by `serverGenerateFinalAd`).
- `createTopupCheckout` (line 1355, replaced by `createStripeTopUpSession`).
- `backfillStripeCustomerIds` (line 1275, one-time backfill per its own header).
- `createTeamMember` (line 2971, legacy redirect to `createTeamInvite`).
- `restoreWorkspace` callable (line 7114, no frontend caller).
- `disconnectMetaAccount` callable (`metaConnection.ts:349`, superseded by
  `metaDisconnect`).
- `serverGetVerdict`, `serverTrackRecommendationEvent`,
  `serverGetRecommendationEvents` (lines 4506, 4531, 4551, zero callers).
- `generateVariants`, `evaluateVariants` (lines 5734, 5771, zero callers).
- `patternSummariesIncremental`, `patternSummariesReconcile` (lines 4402, 4420,
  admin tools not called).
- Whole files: `functions/src/emptyFieldFilter.ts`,
  `functions/src/billing/billingLogger.ts`,
  `functions/src/billing/billingStateShape.ts`,
  `functions/src/savedProjects/projectCoverImage.ts`,
  `functions/src/savedProjects/thumbnailDelete.ts`,
  `functions/src/learning/efficiencyFigure.ts` (or wire the missing re-export).
- Frontend: `src/components/ReflowPreview.tsx`,
  `workspaceService.restoreWorkspace`, 4 `Reflow*` types in `src/types.ts:651-708`.

**Why these belong together.** All are deletions of unreachable code. Same
mental model, same risk profile (low — every one of these has zero
production callers per the verified inventory). Same file area
(`functions/src/index.ts` plus the dead modules in `functions/src/`).

**Rough size.** Half a day for the callable and module deletions; 2 hours
for the frontend file/type cleanups.

**What it depends on.** Nothing. Verify before merge that the
`firebase-admin` deployment analysis still passes after `disconnectMetaAccount`
is removed.

**What breaks if it is never done.** Nothing in production. Every deleted
export was already unreachable. But the next reader pays the tax:
`grep "generateCreative"` finds a callable that no client calls, the
`serverGetVerdict` block is read for nothing, and the deploy URL list
contains 17 entries that never get called.

---

### Batch C — **Wire the 959 in-card variation carousel UI (Phase 23.A)** — DO

**What it is.** Wire `parseHookVariations` / `pushVariations` into `App.tsx`
so the "Generate 4 More Like This" hook card surfaces the existing backend
variation stream. Retire the 3 skipped assertions in
`functions/src/__tests__/copyStructure.test.ts:184-194`.

**It contains.**
- `src/utils/hookVariationParser.ts` (exists, exported, tested, unused).
- The 3 skipped test assertions that document the gap.
- One wire-up in `src/App.tsx` after a hook is approved (the natural call
  site is in the approval handler).
- Brief: half a day.

**Why these belong together.** Single missing feature. Backend ships; the
frontend wire-up is the only gap.

**Rough size.** Half a day. The helper is tested; the call site is the
hook approval handler.

**What it depends on.** Backend (`copyDiversity.ts`, `parseHookVariations`)
already shipped.

**What breaks if it is never done.** Backend angle rotation and
anti-sameness logic exists but is invisible to the user — every approval
runs through the backend rotation but the user never sees the variations.
This was the user's stated request in Phase 23.A; Phase 23.B and 23.C
shipped without it.

---

### Batch D — **Add the elapsed clock to the long sync wait** — DO

**What it is.** Implement the 20-line UX gap from
`specs/fix-sync-banner/investigation-and-fix.md` §7.6. Show `Syncing…
1m 42s` in both the dashboard button and the sidebar menu item while a
sync is in flight.

**It contains.**
- ~10 lines in `src/components/WhatsWorkingDashboard.tsx` (the existing
  `syncing` state already exists).
- ~10 lines in `src/App.tsx:handleSyncMeta` (existing `metaSyncing` state
  already exists).
- The transition from the 9-minute spinner trip to the `still_running`
  toast reads naturally.

**Why these belong together.** Single UX gap, single file pair, single
behaviour. Pair with the still_running toast transition so the spinner
reading `9m 0s` flows into "go check the dashboard" cleanly.

**Rough size.** 1 hour, plus visual polish.

**What it depends on.** Nothing. Both `syncing` and `metaSyncing` flags
already exist.

**What breaks if it is never done.** A 3-minute spinner with no feedback
remains. The dashboard button visual is unchanged from round 1 of the
sync-banner fix. Phase 970 raised the ceiling to 9 minutes (PR #70), which
made the gap worse: a user staring at a multi-minute spinner with no
feedback is its own defect.

---

### Batch E — **Add `.gitattributes` line-ending policy** — DO

**What it is.** Create a `.gitattributes` file with `* text=auto eol=lf`
and the obvious exceptions (`*.ps1 text eol=crlf`, `*.bat text eol=crlf`,
`*.png binary`, `*.jpg binary`, etc.). Re-normalize the tree once.

**It contains.**
- New file `.gitattributes` (~10 lines).
- One `git add --renormalize .` followed by a tree-normalization commit.

**Why these belong together.** Single file, single fix. Recurring tax.

**Rough size.** 15 minutes.

**What it depends on.** Nothing. Team coordination on `core.autocrlf=false`
to avoid re-introducing the drift.

**What breaks if it is never done.** The 1,170-file "everything modified"
incident will recur on every contributor who checks out on Windows with
`core.autocrlf=true`. Each recurrence blocks a deploy on a false alarm
("1,170 modified files — abort") and burns 30 minutes of owner time.

---

### Batch F — **Reconcile spec `tasks.md` checkboxes with shipped code** — DO IF IT BECOMES A PROBLEM

**What it is.** For the 10 specs whose `tasks.md` shows 0/N or 1/N but whose
code is fully shipped (see §2c), tick the boxes that match shipped code
with a "shipped via PR #N" inline note. For `phase-14/tasks.md`, mark the
47 unfinished tasks as superseded by their absorbing spec (968, 969, 967).

**It contains.** 11 markdown files, no code.

**Why these belong together.** All documentation drift. Same mental model,
same risk profile, single batch.

**Rough size.** 2 hours.

**What it depends on.** Nothing.

**What breaks if it is never done.** Nothing in production. But the
`969-cumulative-learning/tasks.md:1/79` line is a misleading signal: the
next reader assumes 78 tasks remain when the work landed. The audit-grade
risk is real — Rule 0b of AGENTS.md says the spec's checklist count feeds
into the post-implementation report's "names vs bodies" audit.

**Why "do if it becomes a problem".** The audit risk only materializes when
someone reads the checklist to count work. The audit below is that someone,
and the count is already known. The next time the count matters is when
the next batch closes — at which point the audit re-runs anyway.

---

### Batch G — **Clean up obsolete branches and prunable worktrees** — DO

**What it is.** Delete 30 obsolete local branches and 7 prunable worktrees.

**It contains.** The full list in §1a above (30 branches), plus the 7
worktrees in §1c that reference moved-on branches:
`022-copy-quality`, `963-universe-aware-copy`, `fix-916-text-clipping`,
`model-config-consolidation`, `openai-image-swap`,
`phase-17-independent-multisize`, `phase-19-gaze-direction`,
`phase-20-concept-director`, `phase-24-conditional-copy`,
`phase-28-expression-adaptation`. (The 0955 branch deserves a separate
look — see Drop list.)

**Why these belong together.** Pure housekeeping. All deletions, no risk.

**Rough size.** 15 minutes. `git branch -D <name>` × 30, `git worktree prune`
or `git worktree remove` × 7.

**What it depends on.** Confirm the unique ahead content for the 969
branches has either merged (Batch A) or been re-derived. The branches
themselves get deleted after Batch A ships.

**What breaks if it is never done.** Recurring tax: every `git branch -a`
returns 67 branches; every `git worktree list` shows 7 prunable warnings;
the next git operation takes longer; new contributors see a long list and
infer "this project has lots of unfinished work" when 30 of them are done.

---

### Batch H — **Make lint usable again** — DO IF IT BECOMES A PROBLEM

**What it is.** Reduce the 1695 lint problems to a manageable number so it
can serve as a CI gate. Specifically: relax `no-explicit-any` in the legacy
Firestore data paths (where `any` is the honest type for `firestore().doc()`
results), and fix the actual bugs the lint catches.

**It contains.** 1695 problems total. The top 10 files account for ~800 of
them; the rest are scattered.

**Rough size.** Half a day to a day, depending on how strict the relaxation
is.

**What it depends on.** Decision: which files keep `no-explicit-any` strict
(the live business logic) vs which get a file-level override (legacy
Firestore paths).

**What breaks if it is never done.** `npm run lint` exits 1 with 1695
problems. Every CI run burns 30 seconds and is non-actionable. CodeRabbit
flags lint regressions that get buried in the noise. The brief's claim
"lint cannot serve as a gate in its current state" is correct.

**Why "do if it becomes a problem".** Nothing currently requires the gate.
TypeScript's `tsc` already type-checks; tests pass; deploys ship. The gate
matters the day a PR introduces a regression that the type checker and
tests both miss — which is exactly the class of bug Rule 0b was written to
catch. So this is one rerun-of-the-audit away from being a Do.

---

### Drop — items that don't deserve a batch

These are open items that look like work but don't justify a PR. Naming
them closes them.

- **Node version drift.** Brief is incorrect. `firebase functions:list`
  reports `nodejs24` on all 95 deployed callables; `functions/package.json`
  declares Node 24. No drift. Drop.

- **Historical PII in reports (244 hits across 18 files).** Already in
  merged history. Redaction would require a force-push history rewrite that
  breaks the cross-reference evidence the reports rely on (e.g. "which ad
  account was the production baseline for the Boran syncs"). The brief
  itself acknowledges "left as-is because they already appear in merged
  history." Drop.

- **The `0955-hotfix-flux-cleanup` branch (1 ahead commit).** Real content
  (removes `fal.ai FLUX-PuLID` and `falGeneration.ts` from `AGENTS.md` and
  `.opencode/agents/gemini-prompt.md`), but the branch is heavily stale and
  the change is 3 lines. Folds naturally into a "stale FAL/FLUX references
  cleanup" batch that may also delete `falGeneration.ts` from the tree (it
  does not exist in `main` already; the references are vestigial). **OR:**
  cherry-pick the 1 commit into a docs cleanup PR alongside Batch G. Either
  way, not its own batch.

- **`tokenCrypto.ts` KMS wiring (`metaConnection.ts:541,557`).** Real
  deferred work. **Either** finish it (wire KMS, half a day), **or**
  delete `tokenCrypto.ts` and the `reencryptAndStoreToken` no-op. The
  legacy AES path works in production. Owner decision, but the current
  state (module exists + no-op callable that throws) is the worst of both
  worlds. Not a batch on its own; one-line decision.

- **`whatsWorkingDashboard.ts:512` "also capture the currency" TODO.**
  One-line code change to `metaConnection.ts` plus a write path
  verification. Not a batch.

- **`learning/applyLearningWrites.ts:94,122` visual-withdrawal lift TODO.**
  Small refactor. Not a batch.

- **`copyScoringGate.ts:44` `DEFERRED_DIMENSIONS`.** 6 scoring dimensions
  the gate does not score. Either wire them (revisit the gate design — not
  small) or remove the export and the test that asserts the count is 6.
  Owner decision; one-line if you choose to remove.

- **`@deprecated` SyncStatus fields in `WhatsWorkingDashboard.tsx:17,29,36`.**
  Kept for cached-JS compatibility. Either delete in a "drop cached-JS
  compatibility" pass, or leave. Cost to leave: zero (TypeScript signal
  only). Drop.

- **The 13 `skip()` placeholder calls in `workspace.test.ts:361-373`.** Local
  custom helper that prints but does not run the assertion. Documented as
  Phase-967 placeholder pattern for emulator-only paths. Not jest-style
  skips. Drop.

- **The 969-cumulative-learning branch ahead content (Batches 22–30) and the
  969-phase-4 branch ahead content (rounds 15–23).** Both belong in Batch A
  — they are post-PR-#73 follow-up work on the same data structures. Listed
  here so they don't appear orphaned on a list.

- **The `phase-22-copy-quality` branch ahead (13 commits).** Real content
  (round-7 backend sanitizer for `copyScoringTrace`, `f786d52`). The
  substantive Phase 22 code shipped via PR #60; this is a post-merge CR
  round-7 fix. Fold into Batch A's rebase, or open a small CR follow-up
  PR on its own — half a day. Either way, not its own audit-listed batch.

- **The `fix-workspace-bleed` branch ahead (4 commits).** Adds sub-label
  fallback to `wsId` when `metaAdAccountName` is empty. The base workspace-
  bleed fix landed in PR #72. The label edge case is a real but small
  follow-up. Fold into a sync-banner-and-workspace-bleed small PRs batch —
  half a day.

- **The `fix-sync-infra` branch ahead (5 commits) and `fix-sync-banner`
  branch ahead (5 commits).** Both ahead content is trivial (a docs
  redaction, a `merge-and-deploy.md` deletion). Delete the branches, fold
  any real work into Batch G.

- **`phase-14/tasks.md` 47 unfinished tasks.** See Batch F.

---

## Part 3 — The product, today

**Pro Ads AI is a bilingual (Arabic-first) SaaS that generates AI-powered ad
creatives.** The owner signs in with email (or Google), picks a workspace,
describes the offer in 4 fields (offer, audience, country, angle), and gets
back one or more rendered creatives — single, carousel (3–10 slides), or
batch (4–10 variants) — at three aspect ratios (square, portrait, story).

The pipeline takes the 4 fields, runs them through a deterministic resolver
(plancheck, mode-format validation, language-quality contract), constructs a
hook + copy + layout, sends it to Gemini (text + image) or OpenAI gpt-image-2
(after Phase 025), composites the text onto the rendered image, and stores
the result with thumbnails and a download token. The user can refine
in-place, save to projects, favorite, resize to other ratios via native
per-size generation (Phase 17), or push live to Meta via OAuth.

On the Meta side, the user links a Page and an ad account (workspace-private
since Phase 967), and the system runs a daily sync that fetches per-ad
performance, builds a verdict (qararEngine), accumulates evidence per
distinct creative (Phase 969 cumulative learning, Phases 1–4 shipped), and
shows the "What's Working" dashboard with hooks, angles, and universes the
AI should learn from.

**What it does NOT yet do.** It does not yet weight the dashboard's
recommendations by funnel type (the same hook in a lead-magnet campaign
should not outrank the same hook in a paid-product campaign just because it
has more clicks; the field that distinguishes them is not yet counted in
distinct creatives). It does not latch the AI's "learning on" state across
partial syncs — a degraded sync that drops the count below 10 could switch
the AI back to no-learning mode. It does not show an elapsed clock while a
3-minute sync runs. And the dashboard's "Generate 4 More Like This" hook
variation carousel ships on the backend but is not wired into the hook card
in the UI.

It runs on Stripe (Paddle fully removed), Node 24 (all 95 callables),
React 19 + Vite 7 on the frontend, Firebase Cloud Functions v2 + Firestore +
Storage on the backend, and Gemini 2.5/3.x + gpt-image-2 for generation.
The 1,546-error lint pile, the 30 stale branches, the 244 hits of PII in
the spec reports, and the 17 unreachable callables are all tax, not product.

---

## Reporting

This file is the audit. The companion inventory of dead exports lives at
`docs/investigations/dead-exports-unreachable-callables.md` (committed
alongside this file). Per Rule 0 of `AGENTS.md`, both files are the durable
record; the chat reply is the ephemeral view.

The repo state at this audit:

- `main`: `1995fcb` (2026-09-23, docs(fix-sync-banner): merge and deploy report)
- 33 local branches not merged; 16 worktrees (7 prunable)
- 0 open PRs
- 44 spec directories; 41 fully shipped, 1 partial (959), 1 with stale checklist (phase-14), 10 with 0/N tasks.md that should be ticked
- 5 substantive code-side TODOs / DEFERREDs
- 17 unreachable callables; 6 dead modules; 4 dead type-only exports
- 1,695 lint problems (exit 1)
- No `.gitattributes` file
- Per-day Meta figures stored; activation latch absent; funnel-type weighting absent

**Eight batches.** Do A, B, C, D, E, G now. Do F and H if they become a problem.
Drop the rest, named and closed.
