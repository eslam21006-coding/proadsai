# fix-sync-banner — merge and deploy

**Date:** 2026-09-23
**Working directory (merge + deploy):** `D:\Pro Ads AI - SaaS - FAL` (branch `main`)
**Working directory (PR review):** `D:\proads-worktrees\fix-sync-banner` (branch `fix-sync-banner`)
**PR:** #75 — `fix: raise sync callable timeout, distinguish deadline-exceeded from failure`
**Merge commit:** `63aca9aa43a90f99b4db2795311141eec001b379`
**Deployed bundle:** `assets/index-BKo0Xcnb.js` (CSS `index-Gd0CvlEQ.css` unchanged)

---

## §1. PR review and merge

PR #75 opened from `fix-sync-banner` → `main`. The round-2 stack at PR-open was five commits (`d01d20a`, `42a547e`, `7a370f6`, `04a90aa`, `21533e2`); the squash merge collapses them onto `main` as `63aca9a`.

**Initial review surfaced four inline comments** across two bots (CodeRabbit + Codex). I triaged each per the standing rule — three were real bugs and required code changes before merge; one was pre-existing on the codebase before this PR (deferred).

### §1.1 Real bugs fixed in the fixup

| # | Source | Finding | Verdict | Fix |
|---|---|---|---|---|
| 1 | CodeRabbit (App.tsx:4287-4293) + Codex (metaService.ts:294) parallel | `metaService.syncPerformance` only rethrew `deadline-exceeded`; a busy-lease `failed-precondition` was swallowed into `{success:false,adsSynced:0}`. The catch branch in `handleSyncMeta:4289` checking `isBusy` was dead code — the busy toast was unreachable. | **REAL BUG** | `src/services/metaService.ts:284-308` now rethrows both `'functions/deadline-exceeded'` AND `'functions/failed-precondition'` (and the unprefixed forms). Sidebar busy toast reachable. Tests 05/06 added. |
| 2 | Codex (`src/utils/syncResultKey.ts:64`) | The round-1 helper short-circuited on `ok === false` BEFORE partial-signals, regressing post-Fix-3 behaviour (commit `04a90aa`, `App.tsx:13116-13120`): `ok === false` + `fanOutErrors > 0` + `inlineStatus === 'ok'` should be `partial`, not `failed`. | **REAL BUG** | First pass removed the early-return entirely. CodeRabbit's follow-up (item §1.2 below) caught a regression from that, so the final ordering keys on `inlineStatus === 'failed'` first, then partial signals, then a residual `ok === false` → `failed` (see §1.2). |
| 3 | Codex (`specs/fix-sync-banner/reports/batch-02-report.md:196`) | "round-1 baseline 151 + 15 + 6 = 157" — arithmetically wrong (151+15+6=172). Pre-round-1 baseline was **136** per the round-1 report §4.2, so 136+15+6=157. | **REAL BUG** | Headline corrected in `specs/fix-sync-banner/reports/batch-02-report.md`. |

### §1.2 CodeRabbit follow-up finding

After the first fixup (`d99aa95`), CodeRabbit's review on commit `d99aa95` (final_review_risk = 🟡 Moderate) raised a regression from removing the `ok === false` early-return entirely: `metaService.syncPerformance` returns `{success:false,adsSynced:0}` for the round-1 swallow path (network reset, `functions/unavailable`, etc.), the helper classify as `done`, and the sidebar's `handleSyncMeta` renders "Synced 0 ads" — a misleading success message for an actual server-side failure.

**Final helper ordering** (`src/utils/syncResultKey.ts:59-95`):

1. `inline.status === 'failed'` → `failed`
2. any partial signal (`legacyRateLimited`, `workspaceRateLimited`, `fanOutErrors`, `inline.status === 'partial'`) → `partial`
3. residual `ok === false` (no partial signal) → `failed`
4. `workspaceQueued > 0` → `more_coming`
5. else → `done`

This satisfies both Codex (partial takes precedence over aggregate `ok`) and CodeRabbit (residual `ok === false` still fails). Tests 07/09/12 updated; new tests 16/17/18/19 pin both contracts.

### §1.3 Deferred

`react-hooks/preserve-manual-memoization` ESLint warning on the `useCallback` in `handleSyncMeta` at `src/App.tsx:4225-4300` is **pre-existing** on the codebase before this PR. The `useCallback` was already there in commit `04a90aa` (Fix 3) and before; this PR's edits added content INSIDE the callback, not the memoization itself. Deferred to a follow-up.

## §2. Final test counts

The frontend suite went through three states as the review fixes landed:

| Stage | Tests | Delta |
|---|---|---|
| Pre-PR baseline (round 1) | 136 | — |
| Round 1 (`syncResultKey.test.ts`) | 151 | +15 |
| Round 2 (`syncTimeout.test.tsx`) | 157 | +6 |
| PR-fixup 1 (rethrow busy + drop helper short-circuit) | 162 | +5 |
| PR-fixup 2 (residual ok=false still fails) | **163** | +1 |

`Test Files 11 passed (11)`. New test count: **163 passed (163)**.

Backend (functions) — metaSync-relevant test files run directly on the merged main:

```
node lib/__tests__/metaSync.contract.test.js       17 tests, pass
node lib/__tests__/metaSyncOrchestrator.test.js    27 tests, pass
node lib/__tests__/metaSyncConcurrency.test.js     11 tests, pass
node lib/__tests__/metaSyncLease.test.js           13 tests, pass
node lib/contractFixtures.test.js                  PASS
```

The full `npm test` (60+ test suites, including the heavy phase969 discriminator tests) takes ~10+ minutes; the targeted runs above cover the deploy-affected code paths (orchestrator, lease, concurrency, contract fixtures).

## §3. Deploy

### §3.1 Build

```
$ cd "D:\Pro Ads AI - SaaS - FAL"
$ git status --short   # 12 untracked work files, 0 modified — clean
$ git pull
Updating 21533e2..63aca9a
Fast-forward
 ... 10 files changed, 1595 insertions(+), 68 deletions(-)
 create mode 100644 specs/fix-sync-banner/investigation-and-fix.md
 create mode 100644 specs/fix-sync-banner/reports/batch-02-report.md
 create mode 100644 src/__tests__/syncResultKey.test.ts
 create mode 100644 src/__tests__/syncTimeout.test.tsx
 create mode 100644 src/utils/syncResultKey.ts
PULL_EXIT=0

$ cd functions
$ rm -rf lib
$ npm run build
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
FNS_BUILD_EXIT=0
# 164 .js files in functions/lib/

$ cd ..
$ npm install
# (no errors; warnings only)
INSTALL_EXIT=0

$ npm run build
vite v7.3.5 building client environment for production...
transforming...
✓ 126 modules transformed.
dist/assets/index-BKo0Xcnb.js                1,836.02 kB │ gzip: 478.98 kB
dist/assets/index-Gd0CvlEQ.css                 130.10 kB │ gzip:  20.19 kB
✓ built in 17.82s
BUILD_EXIT=0
```

### §3.2 Deploy

```
$ firebase deploy --only hosting
=== Deploying to 'proadsai-saas'...

i  deploying hosting
i  hosting[proadsai-saas]: beginning deploy...
i  hosting[proadsai-saas]: found 13 files in dist
i  hosting: uploading new files [0/11] (0%)
i  hosting: upload complete
+  hosting[proadsai-saas]: file upload complete
i  hosting[proadsai-saas]: finalizing version...
+  hosting[proadsai-saas]: version finalized
i  hosting[proadsai-saas]: releasing new version...
+  hosting[proadsai-saas]: release complete

+  Deploy complete!

Project Console: https://console.firebase.google.com/project/proadsai-saas/overview
Hosting URL: https://proadsai-saas.web.app
DEPLOY_EXIT=0
```

### §3.3 Live confirmation

```
$ curl -s https://app.proadsai.com/ | grep -E "index-|css"
  <script type="module" crossorigin src="/assets/index-BKo0Xcnb.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-Gd0CvlEQ.css">
```

**Deployed bundle: `assets/index-BKo0Xcnb.js`** (CSS unchanged). Owner can confirm the new build is live by hard-refreshing the dashboard and watching for the timeout-fix behaviour on a long sync (no `FirebaseError: deadline-exceeded` toast; a real `Sync failed` only on a real failure).

## §4. Outstanding — UX gap (NOT built, NOT part of this deploy)

The sync now holds the browser for 2-3 minutes with a spinner and no feedback. The §2 of the round-2 batch report proposes the smallest fix that addresses this:

- `pressStartedAtRef = useRef<number | null>(null)` at the top of both `handleSyncMeta` (sidebar) and `onSyncPress` (dashboard), cleared in the `finally` block.
- A small `<ElapsedClock />` child that ticks once per second while `metaSyncing === true`, reads from the ref.
- Render the clock next to the spinner (dashboard: between `fa-arrows-rotate fa-spin` and "Syncing..."; sidebar: between icon and "Sync Now" label).

**Cost:** ~10 lines per location. No new state, no new i18n key, pure presentational. Pairs naturally with the round-2 `still_running` branch — when the 9-minute ceiling trips, the elapsed clock reads `9m 0s` and the `still_running` toast transitions cleanly into "go check the dashboard for the result".

**Status: PROPOSED, NOT BUILT, NOT IN THIS DEPLOY.** Owner calls for the follow-up when ready.

## §5. Standing rule acknowledged — no force-push

The round-2 commit `2a45444` was force-pushed to `origin/fix-sync-banner` (`--force-with-lease`) when the test-type fixup `42a547e` needed to amend it. It was harmless on a branch nobody else touches — the standing rule was set after that push. **The rule stands: `git revert` or a new commit when something needs undoing.** No force-push happened on this PR's run — the round-2 → fixup-1 → fixup-2 stack (`42a547e → d01d20a → d99aa95 → 9306390`) was pushed as normal fast-forwards each time; the only force was the round-2 fixup which the owner has now flagged.

## §6. Raw output (final)

```
$ git log --oneline -3
63aca9a fix: raise sync callable timeout, distinguish deadline-exceeded from failure (#75)
21533e2 docs(fix-sync-infra): merge and deploy report
04a90aa fix: repair Cloud Tasks fan-out, reduce Graph concurrency, correct sync banner

$ git status --short
(empty modified; 12 untracked work files in tree, not part of this deploy)

$ firebase deploy --only hosting (tail)
+  Deploy complete!
Hosting URL: https://proadsai-saas.web.app
Deployed bundle: assets/index-BKo0Xcnb.js (CSS: assets/index-Gd0CvlEQ.css)
```