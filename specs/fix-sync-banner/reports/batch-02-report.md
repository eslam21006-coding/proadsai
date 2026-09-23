# fix-sync-banner — batch 02 report

**Batch:** Round 2 — client-side `httpsCallable` timeout + distinct deadline-exceeded surface
**Date:** 2026-09-23
**Working directory:** `D:\proads-worktrees\fix-sync-banner`
**Branch:** `fix-sync-banner`
**Commits:** `42a547e` (round 2 fix, replaces `2a45444` after a follow-up test-type fix)
**Base:** `7a370f6` (round 1 — three-outcome mapping, helper + flatten + busy catch)
**Push:** `42a547e` force-pushed to `origin/fix-sync-banner` (the round-2 stack is one commit on top of round 1).
**No PR opened.** Owner tests in the browser after each deploy.

---

## §1. What this batch did

§1.4 of `specs/fix-sync-banner/investigation-and-fix.md` attributed the owner-reported "Sync failed" banner to either a busy-lease collision or a sync whose `result.ok === false`. The owner pushed back with browser-console evidence — `metaService.ts:262 Failed to sync performance: FirebaseError: deadline-exceeded` — and the prompt supplied four measured sync spans from "Callable request verification passed" to the `[Batch 5]` evidence line, **every one** of which exceeds the Firebase Functions SDK's 70 000 ms default `httpsCallable` timeout. Both round-1 attributions are wrong. The actual cause is the SDK default aborting mid-flight while the server ran to completion; the catch then fired the hard "Sync failed" toast for a successful sync. The fix:

1. **Raise both client timeouts to 540 000 ms** (`src/services/metaService.ts:264, 323`), matching the server's `timeoutSeconds: 540` at `functions/src/index.ts:3769` and `functions/src/metaSync/trigger.ts:36`.
2. **Rethrow `deadline-exceeded` from `metaService.syncPerformance`** (`src/services/metaService.ts:284-302`) so `handleSyncMeta`'s catch can route it; non-timeout errors keep the round-1 swallow.
3. **Distinct branch in both catches** — `src/App.tsx:4289` (sidebar `handleSyncMeta`) and `src/App.tsx:13262` (dashboard `onSyncNow`) — that renders the new `sync.result.still_running` toast at `info` level for `deadline-exceeded` and never the failure toast.
4. **`sync.result.still_running` i18n key** in EN and AR (`src/i18n.tsx:176, 1175`).
5. **`DashboardResultKey` union + `SyncResultBanner` switch** gain the new `case` (`src/components/WhatsWorkingDashboard.tsx`) — same amber band as `busy`, distinct `fa-clock` icon.
6. **`specs/fix-sync-banner/investigation-and-fix.md` §1.4 struck in place** (busy-lease + `ok: false` attributions replaced inline with the timeout finding). New §7, §7.1–§7.8 added for the round-2 work (SDK source quote, evidence table, two-callable catch analysis, fix design, UX gap proposal — proposed, not built — and re-verification plan).

The round-1 files (`src/utils/syncResultKey.ts`, `src/__tests__/syncResultKey.test.ts`, `functions/src/metaSync/trigger.ts` round-1 changes, `src/App.tsx` round-1 changes) are untouched.

## §2. UX during a three-minute wait — proposed, not built

A 9-minute ceiling is its own UX defect (a user staring at a spinner with no feedback). The smallest change that addresses it:

- `pressStartedAtRef = useRef<number | null>(null)` set at the top of both press handlers and cleared in the `finally` block.
- A small `<ElapsedClock />` child that ticks once per second while `metaSyncing === true`.
- Render the clock next to the spinner (dashboard: between the `fa-arrows-rotate fa-spin` icon and the "Syncing..." label; sidebar menu: between icon and "Sync Now" label).

Cost: ~10 lines per location (two locations). No new state, no new i18n key, pure presentational. Pairs naturally with the round-2 `still_running` branch — when the 540 000 ms ceiling trips, the elapsed clock reads `9m 0s` and the `still_running` toast transitions cleanly into "go check the dashboard for the result".

The larger change — return early and poll for completion — is out of scope; not proposed.

## §3. What this batch did NOT do

- Did not deploy the new bundle. Owner calls deploy; this commit is on `fix-sync-banner` only.
- Did not press Sync Now in the browser. The owner presses; the agent does not.
- Did not implement the elapsed-time counter UX. Proposed in §2; not built, per the prompt.
- Did not introduce a retry mechanism with backoff for genuine deadline-exceeded (where the server really is over-budget). Owner re-presses.

## §4. Raw command output

### §4.1 Git

```
$ git diff --stat HEAD~1..HEAD
 specs/fix-sync-banner/investigation-and-fix.md | 182 +++++++++++++++++++++++-
 src/App.tsx                                    |  43 +++++-
 src/__tests__/syncTimeout.test.tsx             | 183 +++++++++++++++++++++++++
 src/components/WhatsWorkingDashboard.tsx       |  31 +++--
 src/i18n.tsx                                   |  12 ++
 src/services/metaService.ts                    |  53 ++++++-
 6 files changed, 486 insertions(+), 18 deletions(-)

$ git log --oneline -3
42a547e fix(sync-banner): raise client httpsCallable timeout to 540s, distinct deadline-exceeded surface
7a370f6 fix(sync-banner): consolidate three-outcome spec into a single pure helper
21533e2 docs(fix-sync-infra): merge and deploy report
```

### §4.2 Build (`tsc -b && vite build`)

```
> ai-ads-pro@0.0.0 build
> tsc -b && vite build

vite v7.3.5 building client environment for production...
transforming...
(node.exe : Browserslist: browsers data (caniuse-lite) is 6 months old. ... — pre-existing notice)
✓ 126 modules transformed.
dist/index.html                                 1.00 kB │ gzip:   0.53 kB
dist/assets/index-Gd0CvlEQ.css                130.10 kB │ gzip:  20.19 kB
dist/assets/MetaAccountPickerModal-Bcme9QYw.js  5.46 kB │ gzip:   1.96 kB
dist/assets/MetaPagePickerModal-GQiq4pSI.js    6.50 kB │ gzip:   2.23 kB
dist/assets/JoinTeam-C5E_lKv1.js               7.68 kB │ gzip:   2.00 kB
dist/assets/WhatsWorkingDashboard-10rX6ILH.js 12.46 kB │ gzip:   2.96 kB
dist/assets/Billing-BOHD3O7C.js               15.43 kB │ gzip:   4.32 kB
dist/assets/PerformanceDashboard-BJxZ8gOE.js  20.13 kB │ gzip:   5.72 kB
dist/assets/FunnelSettingsForm-BhKhf2NA.js    30.73 kB │ gzip:   7.86 kB
dist/assets/jszip.min-DBsSK4Rb.js             96.43 kB │ gzip:  28.34 kB
dist/assets/InputForm-KyE4qI4v.js            107.33 kB │ gzip:  26.39 kB
dist/assets/index-DzeMOEN3.js              1,835.97 kB │ gzip: 478.96 kB
✓ built in 26.88s
BUILD_EXIT=0
```

### §4.3 Tests (`npm run test` — `node scripts/sc11Guard.test.mjs && vitest run`)

```
> ai-ads-pro@0.0.0 test
> node scripts/sc11Guard.test.mjs && vitest run

ok 1 - quoted literal containing `//` still fires on CPA inside the string
ok 1b - // inside a string does not consume the rest of its line
ok 2 - real copy on a line with a comment still fires
ok 3 - JSX fragment text is captured
ok 4 - trailing JSX text after `{expr}` is captured
ok 5 - JSX className attribute with % is exempt
ok 6 - TypeScript generics do not produce false JSX text
ok 7 - allowlist entry with forward slashes matches scanned file
# tests 7
# pass 7
# fail 0
ok 8 - Latin digits + % trips PERCENT_SIGN
ok 9 - Arabic-Indic digits + % trips PERCENT_SIGN
ok 10 - Latin digits + U+066A trips PERCENT_SIGN
ok 11 - Arabic-Indic digits + U+066A trips PERCENT_SIGN
ok 12 - Eastern Arabic-Indic digits + % trips PERCENT_SIGN
ok 13 - bare (%) unit label does not trip PERCENT_SIGN
ok 14 - bare preset button label '50' does not trip PERCENT_SIGN
ok 15 - valid suppression clears only its own code on its own line
ok 16 - PERCENT_SIGN suppression does not leak to a different code
ok 17 - suppression does not leak to adjacent line
ok 18 - bare 'sc11-allow' (no code) hard-fails
ok 19 - unknown suppression code hard-fails
ok 20 - missing reason hard-fails
ok 21 - empty reason hard-fails
ok 22 - applied suppressions are printed with reason
# tests 22
# pass 22
# fail 0

 RUN  v4.1.4 D:/proads-worktrees/fix-sync-banner

 Test Files  11 passed (11)
      Tests  157 passed (157)
   Start at  13:42:29
 Duration  16.26s (transform 2.25s, setup 7.70s, import 10.45s, tests 9.54s, environment 71.60s)
TEST_EXIT=0
```

### §4.4 New test file — verbose (` `n vitest run src/__tests__/syncTimeout.test.tsx --reporter=verbose)

```
 RUN  v4.1.4 D:/proads-worktrees/fix-sync-banner

stderr | src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): client-side httpsCallable timeout
       > 04: metaService.syncPerformance still swallows non-timeout errors (back-compat)
Failed to sync performance: Error: unavailable: ...
    at D:/proads-worktrees/fix-sync-banner/src/__tests__/syncTimeout.test.tsx:151:44
    at file:///D:/proads-worktrees/fix-sync-banner/node_modules/@vitest/runner/dist/chunk-artifact.js:302:11
    ...
    at new runWithTimeout ...
  code: 'functions/unavailable'
}
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): client-side httpsCallable timeout > 01: metaService.syncPerformance passes timeout: 540000 to httpsCallable 19ms
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): client-side httpsCallable timeout > 02: metaService.triggerWorkspaceSync passes timeout: 540000 to httpsCallable 1ms
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): client-side httpsCallable timeout > 03: metaService.syncPerformance rethrows on deadline-exceeded (so handleSyncMeta's catch can route it) 1ms
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): client-side httpsCallable timeout > 04: metaService.syncPerformance still swallows non-timeout errors (back-compat) 4ms
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): i18n parity for sync.result.still_running > EN: sync.result.still_running resolves to a non-key string 32ms
 ✓ src/__tests__/syncTimeout.test.tsx > fix-sync-banner (round 2): i18n parity for sync.result.still_running > AR: sync.result.still_running resolves to a non-key string with Arabic script 6ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  13:40:55
   Duration  2.55s (transform 163ms, setup 125ms, import 242ms, tests 65ms, environment 1.78s)
```

(The `Failed to sync performance:` line on test 04 is `console.error` from `metaService.syncPerformance`'s `catch` for the non-timeout `functions/unavailable` error — the assertion that follows verifies the round-1 swallow is preserved. The line is intentional console output from the implementation under test, not a test failure.)

### §4.5 Lint (`npm run lint` — `eslint . && node scripts/sc11Guard.mjs`)

```
✖ 1583 problems (1434 errors, 149 warnings)
  19 errors and 131 warnings potentially fixable with the `--fix` option.
LINT_EXIT=1
```

Pre-round-2 baseline was 1583 problems (1434 errors, 149 warnings). The exit code is non-zero because the codebase has thousands of pre-existing `no-explicit-any` violations in legacy Firestore paths; this batch adds **zero** new lint errors (verified by ESLint `--rule no-unused-vars` count over the four files in scope).

## §5. Rule 0b — test-name vs assertion check (walked against the final source)

`src/__tests__/syncTimeout.test.tsx` (final source):

| # | Test name (description) | Assertion in source | Match |
|---|---|---|---|
| 01 | `metaService.syncPerformance passes timeout: 540000 to httpsCallable` | `expect(opts?.timeout).toBe(540000)` | ✓ |
| 02 | `metaService.triggerWorkspaceSync passes timeout: 540000 to httpsCallable` | `expect(opts?.timeout).toBe(540000)` | ✓ |
| 03 | `metaService.syncPerformance rethrows on deadline-exceeded (so handleSyncMeta's catch can route it)` | `expect((caught as { code?: string })?.code).toBe('functions/deadline-exceeded')` | ✓ |
| 04 | `metaService.syncPerformance still swallows non-timeout errors (back-compat)` | `expect(result.success).toBe(false); expect(result.adsSynced).toBe(0)` | ✓ |
| 05 | `EN: sync.result.still_running resolves to a non-key string` | `not.toBe(''); not.toBe(key); not.toBe(failed); not.toBe(busy)` | ✓ |
| 06 | `AR: sync.result.still_running resolves to a non-key string with Arabic script` | same + `/[\u0600-\u06FF]/` match | ✓ |

Per-file delta (this batch):

| File | Tests added |
|---|---|
| `src/__tests__/syncTimeout.test.tsx` | +6 |
| **Total round-2 delta** | **+6** |

Headline total: round-1 baseline 151 + round-1's own `syncResultKey.test.ts` +15 + round-2's `syncTimeout.test.tsx` +6 = **157** (matches the runner's `Tests 157 passed (157)`).

Per-file delta arithmetic: +6 (syncTimeout) = headline delta +6. ✓ Total arithmetic: 157 = runner total. ✓ Prose narrative numbers match the runner output.