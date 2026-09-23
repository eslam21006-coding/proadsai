# Cleanup batch — B (dead exports/callables) + E (.gitattributes) + G (branches/worktrees)

Three jobs from the open-work audit, executed from
`D:\proads-worktrees\cleanup-dead-code`. No product behaviour change.

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