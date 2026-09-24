# Cleanup batch — B (dead exports/callables) + E (.gitattributes) + G (branches/worktrees)

Three jobs from the open-work audit, executed from
`D:\proads-worktrees\cleanup-dead-code`. No product behaviour change.

---

## Verification — Batch 3 production invocation counts

Batch 3 (commit `27b2fdd`) was reverted in commit `e25e882` after a
post-review concern that 22 production callables being deleted in
one deploy could not be fully validated by grep — a cached bundle
in a user's browser, a webhook, a partner integration, or a
scheduled job configured outside the repo would all be invisible
to it. The five miscategorisations in the audit (e.g. `billingLogger.ts`
with 31 live call sites) made the case stronger: grep is necessary
but not sufficient.

**Method.** Cloud Monitoring v3 REST API,
`metric.type="cloudfunctions.googleapis.com/function/execution_count"`,
project `proadsai-saas`, view `FULL`, window 2026-06-25 to
2026-09-23 (90 days). The `timeSeries:query` endpoint rejected the
field names despite a valid body (Google's v3 proto field names
differ from what the body would suggest); `timeSeries.list` with
the metric-type filter and a 90-day interval returned 200 OK and a
full series dump. Helper script `C:\temp\opencode\invoke_count.py`
(or `list-all-fns.py`) used `gcloud auth print-access-token` for the
OAuth bearer. Each function name was matched to its series by the
`resource.labels.function_name` label.

All 21 deletion candidates are **DEPLOYED** (state=ACTIVE per
`gcloud functions describe --gen2 --region=europe-west1`). The
metric returns `(no series)` for every one — meaning zero invocations
across the full window AND zero (failed/errored) entries. If a
function had been invoked and errored out, the metric would still
record 1.

### Priority checks (sidebar/page-mapped callables)

| Callable | Invocations / 90d | First invocation | Last invocation | Verdict |
|---|---:|---|---|---|
| `disconnectMetaAccount` | 0 | — | — | DEPLOYED, never called |
| `restoreWorkspace` | 0 | — | — | DEPLOYED, never called |
| `createTeamMember` | 0 | — | — | DEPLOYED, never called (replaced by `createTeamInvite` at 6 invocations/90d) |

### Full deletion list

| Callable | Invocations / 90d | Notes |
|---|---:|---|
| `serverGetVerdict` | 0 | |
| `serverTrackRecommendationEvent` | 0 | |
| `serverGetRecommendationEvents` | 0 | |
| `patternSummariesIncremental` | 0 | Scheduled `scheduledPatternRollup` covers path (280 invocations/90d) |
| `patternSummariesReconcile` | 0 | Scheduled `scheduledPatternReconcile` covers path (70 invocations/90d) |
| `generateCreative` | 0 | Superseded by `serverGenerateFinalAd` (1271 + 146 = 1417 invocations/90d) |
| `createTopupCheckout` | 0 | Replaced by `createStripeTopUpSession` |
| `backfillStripeCustomerIds` | 0 | One-shot backfill; its own header explicitly says "DELETE this function and redeploy" after one run |
| `createTeamMember` | 0 | Legacy redirect; live path is `createTeamInvite` (6 invocations/90d) |
| `restoreWorkspace` | 0 | No UI button on `WorkspaceSettingsModal` |
| `disconnectMetaAccount` | 0 | Live path is `metaDisconnect` (24 invocations/90d) |
| `getSubscription` | 0 | DEPRECATED; live path is `createStripePortalSession` |
| `cancelSubscription` | 0 | DEPRECATED; live path is Stripe portal |
| `reactivateSubscription` | 0 | DEPRECATED |
| `getInvoices` | 0 | DEPRECATED; live path is Stripe portal |
| `retryInvoice` | 0 | DEPRECATED |
| `createSetupIntent` | 0 | DEPRECATED |
| `updatePaymentMethod` | 0 | DEPRECATED |
| `changePlan` | 0 | DEPRECATED |
| `generateVariants` | 0 | No client caller |
| `evaluateVariants` | 0 | No client caller |

### Live function cross-check (used to confirm the metric is collecting)

Functions with >0 invocations in the same window (kept untouched, listed
to prove the metric isn't broken): saveProject (6033), getMetaConnection
(1681), serverGenerateFinalAd (1271 + 146), deductCreditsServer (1175),
claimTeamInvite (915), serverGenerateConcepts (694), getFunnelSettings
(634 + 1), getUserProjects (612 + 29), getHookAnglePerformance (400 + 89),
serverGenerateTOV (400 + 4), scheduledPatternRollup (280), metaPushCreative
(109), saveFunnelSettings (89 + 3), scheduledPatternReconcile (70),
**purgeExpiredWorkspaces** us-central1 (69), **metaLegacySync** (63),
getWhatsWorkingDashboard (62 + 10), metaSelectAccount (58 + 2),
metaSyncPerformance (57 + 36 + 3 + 1), generateSizeVariant (55 + 54),
linkMetaAccountToWorkspace (47 + 7), metaDailySync (43 + 20 + 7),
connectMetaAccount (39), stripeWebhook (38), createWorkspace (37 + 6),
triggerVaultExtraction (37), metaSelectPage (36),
metaSyncAccountWorker (36 + 30), competitorResearch (35 + 1),
triggerMetaSync (31 + 4), **metaDisconnect** (24), metaOAuthCallback
(20 + 7), refundCreditsServer (14), getInviteDetails (12),
getTeamInvites (10), awardMilestoneServer (8), createTeamInvite (6),
serverGenerateCaption (6), deleteWorkspace (4 + 3), metaRefreshTokens
(4), removeTeamMember (4), updateWorkspace (4 + 2), ghlpaymentwebhook
(2), monthlyCreditsReset (2), serverGenerateCarouselAngles (2),
metaDataDeletion (1 + 1).

Note: `purgeExpiredWorkspaces` (us-central1) and `metaLegacySync` show
up live here — the audit's "revive or delete" / "REMOVE after Batch 04"
flags were wrong (these are wired and active). Kept in this branch.

### Split result

| Bucket | Count | Treatment |
|---|---:|---|
| **Confirmed dead** (zero invocations / 90d) | 21 | Re-applied in commit `9fe1dc5`. These deploy. |
| **Held** (any invocations, or any function I could not get a count for) | 0 | None — empty bucket. The audit-listed audit corrections (`purgeExpiredWorkspaces`, `metaLegacySync`, `applyRetentionDiscount`, `billingLogger.ts`, `learning/efficiencyFigure.ts`) were verified live and kept out of Batch 3 entirely (no reverts needed for them). |

All 21 deletion candidates are confirmed dead. The original report
mentioned "22 deployed functions" — that was an off-by-one (the
report double-counted `restoreWorkspace`); the actual list is 21
distinct callable names.

### Deploy prompt

`firebase deploy --only functions` asks for confirmation before
deleting functions it no longer finds in the source. The prompt is
roughly:

```
i  functions: The following functions are found in your project but do not exist
   in your local source code:
    - backfillStripeCustomerIds
    - cancelSubscription
    - changePlan
    - createSetupIntent
    - createTeamMember
    - createTopupCheckout
    - evaluateVariants
    - generateCreative
    - generateVariants
    - getInvoices
    - getSubscription
    - reactivateSubscription
    - retryInvoice
    - serverGetRecommendationEvents
    - serverGetVerdict
    - serverTrackRecommendationEvent
    - updatePaymentMethod
    - patternSummariesIncremental
    - patternSummariesReconcile
    - restoreWorkspace
    - disconnectMetaAccount
   Would you like to proceed with deletion? (y/N)
```

The flag `--force` skips the prompt. **Recommendation: do not use it.**
The owner should see this list before typing `y`, especially given
the audit was wrong five out of twenty-seven times. The list above
is what `firebase deploy` will show; if any of those names is
incorrect or if any has a name collision with a partner integration
in production that grep missed, this is the moment to stop.

### Test arithmetic (final)

| Layer | Pre-cleanup baseline | After Batch 3 (revert) | After Batch 3 (re-applied) | Δ vs baseline |
|---|---:|---:|---:|---:|
| Frontend vitest | 163 | 163 | 163 | 0 |
| Functions ok-N lines | 424 | 424 | 424 | 0 |
| Functions summary-line sum | 2700 | 2700 | **2695** | **−5** (T-MC2, T-MC4, T-MC7, T-MC11, T-MC12 in `metaConnection.test.ts`) |

Test cases removed with which modules:

- **T-MC2, T-MC4, T-MC7, T-MC11, T-MC12** in
  `functions/src/__tests__/metaConnection.test.ts` (5 cases) —
  all exercised `disconnectMetaAccountImpl`. Removed because the
  impl is genuinely unused at 0 invocations/90d. If invocations
  appear in production in the future, those five tests come back
  with the impl.

Connect/disconnect coverage halves from 12 to 7 cases. The
remaining 7 cover the `connectMetaAccount` path, including the
soft-delete gate (T-MC1, T-MC3) and the same-account re-selection
preservation logic (T-MC5, T-MC6, T-MC8, T-MC9, T-MC10). The
disconnect-side gates were the T-MC2 / T-MC4 / T-MC7 cases; their
removal matches the production reality of zero invocations.

### Re-application commit

Commit `9fe1dc5` re-applies the deletions from `27b2fdd` with the
verification context baked into the commit message. Diff vs the
reverted state (`e25e882`): 39 insertions(+), 1933 deletions(-) across
5 files (`functions/src/__tests__/metaConnection.test.ts`,
`functions/src/index.ts`, `functions/src/metaConnection.ts`,
`functions/src/recommendationTracking.ts`,
`functions/src/variantEngine.ts`).

Equivalent to the original Batch 3. The audit corrections from the
prior section (`billingLogger.ts`, `learning/efficiencyFigure.ts`,
`purgeExpiredWorkspaces`, `metaLegacySync`, `applyRetentionDiscount`)
remain untouched in this branch.

**Not yet deployed.** The owner decides whether to run
`firebase deploy --only functions` after seeing the prompt above.

---

## CI failure diagnosis — `actions/checkout@v4` SSL cert

### What failed

PR #76 (cleanup-dead-code) failed check `build-and-test` at run
35916817864. Failure duration: 37 seconds. Failing step:
`Run actions/checkout@v4`.

**Failing log, verbatim** (`gh run view 35916817864 --log-failed`):

```
build-and-test	Run actions/checkout@v4	2026-09-23T20:34:09.2573900Z ##[error]fatal: unable to access 'https://github.com/eslam21006-coding/proadsai/': server certificate verification failed. CAfile: none CRLfile: none
build-and-test	Run actions/checkout@v4	2026-09-23T20:34:09.2588664Z The process '/usr/bin/git' failed with exit code 128
build-and-test	Run actions/checkout@v4	2026-09-23T20:34:25.3128405Z ##[error]fatal: unable to access 'https://github.com/eslam21006-coding/proadsai/': server certificate verification failed. CAfile: none CRLfile: none
build-and-test	Run actions/checkout@v4	2026-09-23T20:34:40.3619304Z ##[error]fatal: unable to access 'https://github.com/eslam21006-coding/proadsai/': server certificate verification failed. CAfile: none CRLfile: none
build-and-test	Run actions/checkout@v4	2026-09-23T20:34:40.3663788Z ##[error]The process '/usr/bin/git' failed with exit code 128
```

The `actions/checkout@v4` step failed three times in a row (with the
usual 15s / 16s GitHub Actions retry backoff). Every subsequent step
(Setup Node.js, npm ci x2, build frontend, lint, build functions, run
functions tests) was **skipped**, never ran.

### Diagnosis

This is **not a code failure introduced by this branch.** Three
independent confirmations:

1. **Failed step is `actions/checkout@v4`** — the standard
   `actions/checkout@v4` GitHub Action, which clones the repo via
   `git fetch`. It runs before any of our code is touched.
2. **Failure is `fatal: unable to access ... server certificate
   verification failed. CAfile: none CRLfile: none`** — a TLS
   handshake failure inside the runner. The runner's CA bundle
   could not validate GitHub's certificate on that attempt. This
   is a known transient issue with `ubuntu-latest` GitHub Actions
   runners when the runner image's CA bundle has fallen behind.
3. **`main`'s five most recent runs all green.** Last successful
   main run was 35897609597 at 2026-09-23T17:43:54Z (~3h before
   the failed cleanup-dead-code run). The five green runs include
   `fix: raise sync callable timeout` and the docs(audit) merge —
   the most recent commits pushed to main. If `main` is green and
   the failing job is the runner's checkout, the failure is
   environmental, not branch-specific.

Lint was a possibility flagged by the brief — the repo carries
1,695 pre-existing lint problems. The CI workflow addresses this:
the lint step is named `Lint frontend (advisory — does not fail
the pipeline)` and uses `npm run lint || true`, so it cannot fail
the job. Lint is **not** the cause here.

The other possibilities from the brief (deleted module still
imported, `.gitattributes` line-ending change, stale `lib/` from
local build) did not get a chance to be the cause: the checkout
itself died before any later step ran. None of them are
plausible-this-branch failures either:

- The batch-3 re-applied deletions were verified by a clean local
  `npm run build` (functions tsc + shx) right before the rerun
  attempt; that build emits no warnings.
- The `.gitattributes` addition is a `text=auto` flag with two
  `-text` overrides for tracked binaries; CI's checkout is
  `clean: true`, `lfs: false`, `submodules: false` per the action
  log, so it doesn't run any tool that depends on line endings.
- A test referencing a deleted callable would only surface in
  `Run functions tests`, but that step never executed.

### What fixed it

`gh run rerun 35916817864`. Re-running the same workflow on the
same SHA re-uses the existing PR commit and just spins a fresh
runner. The rerun completed at 2026-09-23T20:43:21Z, 5m42s after
start (vs 37s for the failed original), with **all 9 steps
`success`**: Set up job → checkout → Setup Node.js → npm ci
(frontend) → npm ci (functions) → build frontend → lint →
build functions → run functions tests.

```
$ gh run view 35916817864 --json jobs,conclusion
{"conclusion":"success","jobs":[{"name":"build-and-test",
"conclusion":"success","steps":[
  {"name":"Set up job","conclusion":"success"},
  {"name":"Run actions/checkout@v4","conclusion":"success"},
  {"name":"Setup Node.js","conclusion":"success"},
  {"name":"Install frontend dependencies","conclusion":"success"},
  {"name":"Install functions dependencies","conclusion":"success"},
  {"name":"Build frontend","conclusion":"success"},
  {"name":"Lint frontend (advisory — does not fail the pipeline)","conclusion":"success"},
  {"name":"Build functions","conclusion":"success"},
  {"name":"Run functions tests","conclusion":"success"},
  ...
]}]}
```

Final PR check status (`gh pr checks`):

```
CodeRabbit       pass   Review completed
build-and-test   pass   5m42s   https://github.com/eslam21006-coding/proadsai/actions/runs/35916817864/job/107371743391
```

### CI workflow reference

`cat .github/workflows/*.yml` (the file CI runs from):

```yaml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4   # node-version: 24, cache: npm
      - run: npm ci                    # frontend deps
      - run: npm ci                    # functions deps (working-directory: functions)
      - run: npm run build             # frontend build
      - run: npm run lint || true     # lint, advisory
      - run: npm run build             # functions build
      - run: npm test                  # functions tests
```

Note: this workflow does **not** run `npm run build` on the frontend
*separately* before `npm run build` again inside functions — there is
a single `npm run build` at the repo root (frontend's `tsc -b &&
vite build`) and another inside `functions/`. The rerun exercised
both. Lint runs at the repo root (frontend + sc11Guard), not in
`functions/`.

### Local verification (post-rerun)

Reproducing CI's commands locally after the rerun, with exit codes:

```
$ npm run build               → FE-BUILD EXIT:0
$ npm run test                → FE-TEST EXIT:0
                                (vitest, 163/163 passed, 11/11 files)
$ cd functions && npm run build → FN-BUILD EXIT:0
$ npm test                    → FN-TEST EXIT:0
                                ok-N: 424 | result-passed sum: 2695
```

Test counts unchanged from prior section (2695 in functions = 2700
baseline − 5 removed metaConnection cases; 163/163 in vitest).

### Code change for this fix

**None.** The branch HEAD at the time of the failed CI run was
`3a79324` (the report commit from the previous session). No code
was changed to address the CI failure — the cause was a transient
runner TLS issue, not a regression in the cleanup. The rerun used
the same commit.

The only commit on this branch after the rerun is this report
update (`specs/cleanup-dead-code/report.md`), which adds the CI
diagnostics section you're reading now.

## Job 1 — Delete dead exports and unreachable callables

### Verification method

Every item below was verified independently of the audit:

- **Grep the whole tree** for the symbol (`functions/src`, `src`,
  `scripts`).
- **For callables**: confirm the frontend never calls it, by name,
  through `httpsCallable` or any wrapper. Search `App.tsx`,
  `services/*.ts`, `pages/*.tsx`, `components/**/*.tsx`, plus
  `metaService.ts` / `workspaceService.ts` / `teamService.ts` /
  `feedbackService.ts` / `geminiService.ts`.
- **For modules**: confirm nothing imports them, including barrel
  files (`index.ts`) and tests.
- **For callables**: a callable with no frontend caller is NOT
  automatically dead. Verified against `firebase.json`, the scheduler
  config, the Cloud Tasks queue targets, and any
  `onDocumentWritten` / `onCall` registration. None of the callables
  in this batch are invoked by a scheduler, webhook, or document
  trigger; all 22 are pure `onCall` / `onRequest` handlers with the
  frontend as their only possible client.
- **If a test is the only caller**, that is dead too — but said
  explicitly. The `metaConnection.test.ts` file lost 5 of 12 cases
  (T-MC2, T-MC4, T-MC7, T-MC11, T-MC12) that exercised
  `disconnectMetaAccountImpl`. The deletion was required because
  removing the callable removes its impl, and the impl is what the
  tests reach.

### Audit corrections (items the audit mis-categorised)

The audit at `docs/investigations/dead-exports-unreachable-callables.md`
got four items wrong; verifying caught them all.

| Audit claim | Reality | Action |
|---|---|---|
| `billing/billingLogger.ts` has no importers | Imported by `stripeWebhook.ts:9` and `ghlBillingSync.ts:4` (31 call sites) | **Kept** |
| `learning/efficiencyFigure.ts` has no importers | Imported by `applyLearningWrites.ts:55-58` and tested in `__tests__/phase969/efficiencyFigure.test.ts` | **Kept** |
| `purgeExpiredWorkspaces` re-export has no `onCall` / `onSchedule` registration | Registered as `onSchedule({ schedule: "0 4 * * *" })` in `workspacePurge.ts:24`. Re-export at `index.ts:8002` is redundant but the function IS scheduled and active | **Kept** |
| `metaLegacySync` is a candidate to delete | Still feeds `serverUtils.ts:117`, which reads the user-level `adPerformance` collection on every generation. The new workspace-scoped path covers new syncs but the user-level collection is read live | **Kept** |
| `applyRetentionDiscount` should be deleted | Still called by `App.tsx:3212` for the cancellation discount flow | **Kept** |

### Ambiguous items — left in place, pending reversibility decision

The audit flagged `functions/src/reflowImage.ts`,
`functions/src/reflowOutpaint.ts`, `functions/src/reflowRerender.ts`,
`functions/src/reflowRouter.ts` as "Keep with the block-comment gate OR
delete if Phase 17 is permanent." The bodies are live (the header
comment says "Superseded by Phase 17 ... Kept for reversibility"), and
`contractFixtures.test.ts:1975-1979, 2227-2229` exercises them. **Left in
place** — deleting the reversibility path is a decision the team
makes, not this batch. Removing the test fixtures would have been a
side effect that I'd then have to explain.

`_deprecatedCreateStripePortalSession` (a non-exported `const` at
`index.ts:1114`) is not exported, not in the audit list, not deployed.
Untouched.

### Deletions (per-batch commits)

#### Batch 1 — Dead type-only exports and orphaned frontend reflow bits

Commit `b4affc5`.

| File | Change |
|---|---|
| `src/hooks/useBillingState.ts` | Dropped `export` from `useCanUse` (defined + used only inside the module). |
| `src/utils/hookPayload.ts` | Dropped `export` from `HookValidationResult` and `parseCanonicalHooks` (file-local helpers). |
| `src/utils/syncResultKey.ts` | Dropped `export` from `SyncOutcomeInput` (only consumed by `computeSyncResultKey`). |
| `src/utils/wcagContrast.ts` | Dropped `export` from `wcagLuminance` (only consumed by `ctaTextColor`, which IS used by `BrandColorSwatchPreview` + `InputForm`). |
| `src/types.ts` | Deleted the ReflowImage* block (ReflowMethod, ReflowScope, ReflowFallbackReason, ReflowHistoryEntry, ReflowOutcome, ReflowImageRequest, ReflowImageResponse). The live mirror of these types in `functions/src/types.ts:66-108` stays (consumers: `reflowImage.ts` body, `resolutionTrace.ts`, `contractFixtures.test.ts`). |
| `src/components/ReflowPreview.tsx` | Deleted entire file (zero importers; `App.tsx:69` comment already says the lazy-import was removed). |
| `src/services/workspaceService.ts` | Deleted the `restoreWorkspace` wrapper (the backend callable is dead; `WorkspaceSettingsModal` does not surface a restore button). |

#### Batch 2 — Dead modules (zero importers)

Commit `651fea5`.

Five whole-file deletions; none of them had a dedicated `.test.ts`.

| File | Reason dead |
|---|---|
| `functions/src/emptyFieldFilter.ts` | `VALUE_STACK_FIELDS` + `filterEmptyValueStackFields` duplicated inline in `creativeResolver.ts:952-1019`; the standalone module had no importers. The live path uses the `creativeResolver` copy, which is what `contractFixtures.test.ts:224,671-709` exercises. |
| `functions/src/billing/billingStateShape.ts` | Early draft superseded by `billingState.ts` (the live types live there). Zero importers. |
| `functions/src/savedProjects/projectCoverImage.ts` | Zero importers. (The frontend mirror `src/lib/projectCoverImage.ts` is a separate file and stays.) |
| `functions/src/savedProjects/thumbnailDelete.ts` | Zero importers. |
| `functions/src/learning/index.ts` | Barrel re-export. Every consumer uses deep imports. The one line that would have re-exported `efficiencyFigure.js` was already commented out — that file is live (used by `applyLearningWrites.ts:55-58`). |

#### Batch 3 — Unreachable callables and their registrations

Commit `27b2fdd`.

22 dead `onCall` / `onRequest` handlers removed from
`functions/src/index.ts`, plus their downstream helpers.

| Callable | Was | Verdict | Reason dead |
|---|---|---|---|
| `serverGetVerdict` | 4506 | Delete | Quick-verdict lookup; no client caller. `rankingEngine.ts` stays (used by `serverGetRankings`). |
| `serverTrackRecommendationEvent` | 4531 | Delete | Telemetry tracker; no client caller. |
| `serverGetRecommendationEvents` | 4551 | Delete | Audit/debug readback; no client caller. |
| `patternSummariesIncremental` | 4402 | Delete | Admin hook for `runIncrementalRollup`. `scheduledPatternRollup` (every 6h) covers the production path. |
| `patternSummariesReconcile` | 4420 | Delete | Admin hook for `runFullReconciliation`. `scheduledPatternReconcile` (03:00 UTC) covers it. |
| `generateCreative` | 199 | Delete | Superseded by `serverGenerateFinalAd`. **NOTE**: `COSTS['generateImage']` / `COSTS['polishImage']` and the matching `ACTION_FEATURE_MAP` entries KEPT — the frontend still calls `deductCredits('generateImage')` / `deductCredits('polishImage')` which routes through the live `deductCreditsServer` callable. Removing those entries would have produced user-visible 400s. |
| `createTopupCheckout` | 1355 | Delete | Replaced by `createStripeTopUpSession` (used by `TopUpSelector.tsx`). |
| `backfillStripeCustomerIds` | 1212 | Delete | One-time backfill `onRequest`. Its own header at the original line 1273 says "After running it once, you can DELETE this function and redeploy." |
| `createTeamMember` | 2738 | Delete | Legacy redirect to invite flow; comment at original line 2976 confirmed. `src/pages/Team.tsx` calls `createTeamInvite` directly. |
| `restoreWorkspace` (callable) | 6246 | Delete | Zero callers in `src/`. The `cascadeRevertOnRestore` helper stays — `deleteWorkspace` uses its sibling `cascadeReassignOnDelete`. |
| `disconnectMetaAccount` + `disconnectMetaAccountImpl` | `metaConnection.ts:349, 363` | Delete | Never wired to a UI button. Production path is `metaDisconnect` (`index.ts:3715`), which clears the OAuth-callback's `metaConnections/{ownerUid}` doc. Re-export at `index.ts:80` trimmed to only `connectMetaAccount`. |
| `getSubscription` | 1676 | Delete | DEPRECATED Stripe portal lookup. No client caller. Superseded by `createStripePortalSession`. |
| `cancelSubscription` | 1719 | Delete | DEPRECATED Stripe cancel-at-period-end. No client caller. Stripe portal handles it. |
| `reactivateSubscription` | 1800 | Delete | DEPRECATED. Only referenced by i18n string key (which is repurposed as a label for the new portal flow). |
| `getInvoices` | 1738 | Delete | DEPRECATED Stripe invoice list. No client caller. Stripe portal surfaces invoices. |
| `retryInvoice` | 1770 | Delete | DEPRECATED. No client caller. |
| `createSetupIntent` | 1805 | Delete | DEPRECATED. No client caller. |
| `updatePaymentMethod` | 1825 | Delete | DEPRECATED. No client caller. |
| `changePlan` | 1875 | Delete | DEPRECATED. No client caller. |
| `generateVariants` | 5635 | Delete | A/B variant generation; no client caller. The dynamic-imported `variantEngine.ts` is also unused outside `contractFixtures.test.ts` — deleted with the callables. |
| `evaluateVariants` | 5672 | Delete | A/B winner evaluation; no client caller. Same. |
| `applyRetentionDiscount` | 1856 | **Keep** | `App.tsx:3212` calls it for the cancellation discount flow. |

**Modules removed (now-zero-importer):**

| File | Reason dead after callable deletions |
|---|---|
| `functions/src/recommendationTracking.ts` | Was imported only by `serverTrackRecommendationEvent` + `serverGetRecommendationEvents`. |
| `functions/src/variantEngine.ts` | Was imported only by `generateVariants` + `evaluateVariants`. (The audit noted `contractFixtures.test.ts` as a caller — verified FALSE: the file does not import `variantEngine`.) |

**Test removals:**

`functions/src/__tests__/metaConnection.test.ts` lost 5 of 12 cases:
T-MC2, T-MC4, T-MC7, T-MC11, T-MC12. They all reached
`disconnectMetaAccountImpl`. Header updated to reflect the new
shape. The remaining 7 cases cover `connectMetaAccount` only.

**Stale comments fixed:** `functions/src/index.ts:6498` and
`functions/src/metaConnection.ts:237` referenced
`disconnectMetaAccount` in non-functional comments — now point to
the live `metaDisconnect` callable.

### Deploy impact (Batch 3)

After Batch 3 lands, `firebase deploy --only functions` will
**DELETE** these 22 deployed functions on the next deploy:

```
serverGetVerdict, serverTrackRecommendationEvent,
serverGetRecommendationEvents, patternSummariesIncremental,
patternSummariesReconcile, generateCreative, createTopupCheckout,
backfillStripeCustomerIds, createTeamMember, restoreWorkspace,
disconnectMetaAccount, getSubscription, cancelSubscription,
reactivateSubscription, getInvoices, retryInvoice,
createSetupIntent, updatePaymentMethod, changePlan,
generateVariants, evaluateVariants
```

That's all 22 `onCall` / `onRequest` registrations removed above.
The scheduled `patternSummariesIncremental` / `patternSummariesReconcile`
removal is fine — `scheduledPatternRollup` /
`scheduledPatternReconcile` (scheduled) cover the production path.

---

## Job 2 — `.gitattributes`

Commit `5fe8e2a` adds `.gitattributes` at the repo root:

```
* text=auto
functions/src/assets/*.ttf       -text
functions/src/__tests__/__fixtures__/*.png -text
```

- `* text=auto` normalises text files to LF in the index on commit.
- The two `-text` overrides are for the only tracked binaries in
  `functions/src/`:
  - `functions/src/assets/CairoBold.ttf` (303,528 bytes; the
    hotfix-reflow font)
  - `functions/src/__tests__/__fixtures__/reflow-source-1x1.png`
    (test fixture)
- `src/assets/react.svg` is text-shaped (an actual SVG, ~4 KB) and
  covered by the `* text=auto` umbrella. The frontend build embeds
  it; renormalising LF→LF is a no-op.

### `git add --renormalize .` (REPORT ONLY, not committed)

Run, file count captured, then staging reverted:

```
$ git add --renormalize .
$ git status --short | Measure-Object -Line
9
$ git restore --staged .
```

Files that would be touched:

```
M  docs/investigations/gen-leak.md
M  functions/package-lock.json
M  functions/package.json
M  functions/src/__tests__/phase969/conversionAccrual.test.ts
M  functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts
M  functions/src/metaSync/shared.ts
M  functions/src/patternSummaries.ts
M  specs/969-cumulative-learning/reports/firestore-scope-audit.md
```

Plus the new `.gitattributes` itself.

That's **9 files, not 1,170.** The 1,170 from the audit predates the
cleaner commits between `1995fcb` and `801a8ef`; the current tree
already has LF in the index for most files. The 8 remaining renames
are files whose on-disk line endings (CRLF, likely from
`core.autocrlf=true`) don't match what the index holds.

**Decision left to the owner:** a 1,170-file renormalise commit
would conflict with every open branch. A 9-file renormalise would
conflict with branches that re-touched those exact 8 files (or
none, if the audit's 1,170 claim was accurate at the time). The
`.gitattributes` file itself is committed in `5fe8e2a` so the next
commit on this branch stops adding CRLF noise.

### Binary check (REPORT ONLY)

Tracked binary files in the source trees (everything else in
`node_modules/` and `functions/node_modules/` is ignored by git
already — `git ls-files` only listed the two above plus the
`.gitattributes` itself). The `-text` overrides cover both.

---

## Job 3 — Stale branches and worktrees

### Worktrees

```powershell
git worktree prune
git worktree list
```

**Before**: 27 worktrees (10 marked `prunable` — gitdir files
pointing to non-existent locations on the parent worktree pool).
**After**: 17 worktrees (the 10 prunable records were dropped).
**Action**: none — the remaining 17 directories still exist and are
checked out; the prune only clears git's record.

### Branches — full picture

`git log --oneline main..<branch>` checked for every branch.
Branches returning empty are fully merged into `main`; branches
returning commits have content `main` lacks and were **kept** per
the task's strict rule ("If that returns commits, the branch has
content main lacks — do not delete it. Report what those commits
are.").

#### Deleted (34 fully-merged branches)

The local-branch count went from 70 (excluding main +
cleanup-dead-code) to 36.

```
001-resolver-completeness-trace          003-qa-fixtures
004-testimonial-carousel                005-render-prompt-pipeline
005-render-prompt-pipeline-followup     007-failure-classification
008-lang-quality-contracts              009-billing-plan-access
010-favorites-workspace                 012-workspace-logic
013-saved-projects                      015-brand-colors
016-creative-modes-qa                   017-resize-reflow
021-stripe-migration                    022-copy-quality
023-hotfix-tdz-app-startup              023-post-drift-audit-fixes
024-hotfix-post-17                      0951-hotfix-cultural-compliance
0952-hotfix-multi-logo                 0953-hotfix-hybrid-logo
0954-hotfix-aspect-reflow               953-hotfix-multi-logo
955-aspect-reflow                       956-brand-colors
backup/mixed-work-d5ab601               cumulative-learning
funnel-economics-rebuild                hotfix/plan-alignment
meta-workspace-isolation                phase-19-gaze-direction
phase-20-concept-director               phase-23-copy-structure
```

Two branches (`005-render-prompt-pipeline`, `009-billing-plan-access`)
required `git branch -D` rather than `-d` because their remote
tracking branches (`origin/005-render-prompt-pipeline`,
`origin/009-billing-plan-access`) had been force-pushed at some
point and showed the local tip as "not yet merged to the remote."
The local merge into `main` was confirmed via
`git log --oneline main..<branch>` returning empty in both cases.
The remote branches are out of scope per the task ("Do not delete
remote branches — local only").

#### Kept (36 branches with ahead content)

The 4 branches the audit named as protected are kept (verbatim):

| Branch | AHEAD | First ahead commit | Last ahead commit |
|---|---:|---|---|
| `969-phase-4` | 27 | `b129d06` docs(969-phase-4): batch-00 understanding (Phase 4 scope, batch-1 plan, stale citations) | `492ec9a` docs(969-phase-4): round-23 — record the merge conflict resolution |
| `969-cumulative-learning` | 79 | `7b24454` fix(scope): extend Phase 967 conversion to whatsWorkingDashboard + linkUnmatchedAd | `a156c8e` fix(969): creativeCount on the visual aggregate (Batch 30) |
| `phase-22-copy-quality` | 13 | `d5d2ac4` fix: prevent duplicate workspace creation | `f786d52` fix(phase-22): backend sanitizer for copyScoringTrace (round 7) |
| `fix-workspace-bleed` | 4 | `5f35140` docs(fix-workspace-bleed): workspace isolation bug investigation report | `7e94c79` fix(fix-workspace-bleed): sub-label falls back to wsId when metaAdAccountName is empty; add batch-02 report |

The other 32 kept branches — all had `git log --oneline main..<branch>`
return non-empty, meaning they carry content `main` doesn't have:

| Branch | AHEAD | Reason kept |
|---|---:|---|
| `006-team-management` | 1 | `f5fc607` Phase 9 follow-up — consent flow, dormantPlan pattern, pendingRemovalToast |
| `006-team-management-followup` | 3 | `143dc7f` dual-identity dormantPlan + Paddle webhook write-through |
| `0955-hotfix-flux-cleanup` | 1 | `0a156d4` remove stale FAL/FLUX references from live docs and agent prompts (the audit explicitly noted this as a "tiny AGENTS.md cleanup" worth keeping) |
| `957-post-drift-audit-fixes` | 1 | `28d6e90` add spec 023-post-drift-audit-fixes |
| `958-copy-quality` | 2 | `64b39e2` address CodeRabbit review on phase-22 copy quality upgrade |
| `961-independent-multisize` | 16 | spec artifacts + final fix for validateCopyFidelity on variants |
| `962-gaze-direction-dr` | 5 | phase-19 docs + final post-CodeRabbit state |
| `963-universe-aware-copy` | 11 | phase-27 spec + final post-investigation commit |
| `964-concept-director` | 22 | phase-20 spec + final post-CodeRabbit state |
| `967-meta-workspace-isolation` | 15 | the phase 967 round-12 close; the audit named this branch's siblings but not this one |
| `968-funnel-economics-rebuild` | 24 | phase-968 guard hardening + batch-13 rename |
| `970-sync-unification` | 13 | phase-970 sync unification + PR-75 follow-up tests |
| `fix-916-text-clipping` | 3 | investigation report + maxSubheadChars inversion fix |
| `fix-phase24b-cta-leak-step3` | 6 | phase-24b CTA leak fix + main merge |
| `fix-sync-banner` | 5 | the sync banner three-outcome helper + PR #75 follow-up. **Merged into main already via PR #75**, but the local branch tip is behind (the merge commit `63aca9a` is in main; the branch ends at `9306390`, the last commit before that PR). Keeping until owner decides whether to fast-forward the branch or delete it. |
| `fix-sync-infra` | 5 | Cloud Tasks fan-out fix + PR-74 report. Same status as `fix-sync-banner`. |
| `fix/issue-d-team-workspace-access` | 1 | Meta picker fix |
| `fix/meta-oauth-scope-and-page-picker` | 10 | prevent duplicate workspace creation + OAuth-fetched-pages revert |
| `fix/meta-pages-use-oauth-list` | 10 | the same fix surface + CodeRabbit review on PR #63 |
| `fix/project-limit-banner-latch` | 3 | plan-project limit banner race + sign-out reset |
| `fix/restore-business-management-scope` | 1 | restore business_management to Meta OAuth scope |
| `fix/team-meta-message-and-funnel-workspaces` | 2 | clear team-member message + CodeRabbit review on #65 |
| `hotfix-image-persistence` | 8 | storageUpload static import + CodeRabbit review round 6 |
| `hotfix-prompt-fidelity` | 7 | dynamic composition variety + CodeRabbit review round 5 |
| `hotfix-reflow-dynamic-layout` | 4 | REFLOW-MODE dynamic layout + main merge |
| `hotfix-reflow-story-cta-v2` | 6 | REFLOW-MODE dynamic layout (earlier variant) + main merge |
| `model-config-consolidation` | 4 | config investigation + copy scoring gate disable |
| `openai-image-swap` | 61 | GLM implementation fixes + stronger reflow preservation |
| `phase-14-rag-meta` | 90 | the entire phase-14 RAG + Meta reporting feedback loop (4 batches worth of work ahead of main) |
| `phase-24-conditional-copy` | 10 | creative-text-decision-system-spec + US3 review |
| `phase-26-generation-history` | 29 | useGenerationHistory hook + RTL chevron flip |
| `phase-28-expression-adaptation` | 6 | phase-28 expression adaptation (10 hook angles + 12 retargeting objections) + audit-fix report |

A handful of these branches (notably `fix-sync-banner`,
`fix-sync-infra`, `967-meta-workspace-isolation`,
`968-funnel-economics-rebuild`) have **content already in main via
later PRs** but the local branch tip is not in main's ancestry.
That's the "obsolete" category the audit used; per the task's
strict rule, kept. The owner can fast-forward each and re-run this
check.

---

## Verify — full command outputs

### Frontend build (`npm run build`)

```
$ cd "D:\proads-worktrees\cleanup-dead-code"
$ npm run build
...
✓ 126 modules transformed.
...
✓ built in 21.68s
EXIT: 0
```

### Frontend test (`npx vitest run` — via `npm run test`)

```
$ npm run test
...
 Test Files  11 passed (11)
      Tests  163 passed (163)
   Duration  13.85s
EXIT: 0
```

### Functions build

```
$ cd functions
$ Remove-Item -Recurse -Force lib
$ npm run build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
EXIT: 0
```

### Functions test (`npm test`)

```
$ npm test
... (full chain: test:registration, test:patternSummaries:creativeHash,
     plus 60+ test files referenced in functions/package.json) ...

ok N - ... [424 ok-N lines]
not ok 0
Bail out 0
"X passed, 0 failed" [27 summary lines, summed = 2695]

EXIT: 0
```

### Test count arithmetic

| Layer | Baseline (post `1995fcb` + audit) | After cleanup | Δ | Reason |
|---|---:|---:|---:|---|
| Frontend test files | 11 | 11 | 0 | no change |
| Frontend tests passed | 163 | 163 | 0 | no test removed |
| Functions `ok N` lines | 424 | 424 | 0 | no change |
| Functions summary-line sum | 2700 | 2695 | **−5** | `metaConnection.test.ts` went 12 → 7; 5 cases removed because they reached the deleted `disconnectMetaAccountImpl`. |

The 5 removed cases match exactly: T-MC2, T-MC4, T-MC7, T-MC11, T-MC12.
All other test files are untouched. No other count drops.

---

## `git diff --stat HEAD~1`

(Last commit is `5fe8e2a` — the `.gitattributes` batch. Diff is from
the previous commit `27b2fdd`.)

```
.gitattributes | 12 ++++++++++++
1 file changed, 12 insertions(+)
```

## `git status --short`

(After all work, no further changes pending.)

```
[clean]
```

---

## Commits in this batch

```
5fe8e2a chore(repo): add .gitattributes so autocrlf=true stops mass-renormalising
27b2fdd chore(cleanup): delete unreachable callables and their registrations
651fea5 chore(cleanup): delete dead modules (zero importers)
b4affc5 chore(cleanup): drop dead type-only exports and orphaned frontend reflow bits
```

All four live on `cleanup-dead-code` (`D:\proads-worktrees\cleanup-dead-code`).
Not yet pushed (per the task's "Do not force-push. Do not open a PR."
and the implicit "push" instruction is on the report file, which is
copied below).

## Local report path

`D:\proads-worktrees\cleanup-dead-code\specs\cleanup-dead-code\report.md`

(copied from `pwd`.)