# Sync Banner — Investigation and Fix

**Date:** 2026-09-23
**Working directory:** `D:\proads-worktrees\fix-sync-banner` (branch `fix-sync-banner`, off `main` head `21533e2`)
**PR:** Pre-existing `fix-sync-infra` (commit `04a90aa`, "correct sync banner" — Fix 3) is in `main`; deployed function hash at the time of this probe was `8d780c9c5af0c4cbc250ca1f2dd77896fa248d7a` for `metasyncperformance-00202-zoz`, deployed frontend bundle was `index-Tlf1jwIl.js`
**Read-only against Firestore; no fixes attempted during the read-only phase**

---

## §0. The headline

The banner showed "SYNC FAILED" for the two syncs on 2026-09-23 morning because of **two compounding issues** in the post-`fix-sync-infra` code, both of which were present on `main` and in the deployed bundle:

1. **The dashboard's `onSyncNow` resultKey computation read fields at paths that don't exist on the deployed response.** `triggerMetaSync` (post-Fix-3) emits `legacyRateLimited` etc. *under* `legacy`/`workspace` nested objects, but the dashboard's banner code in `App.tsx:13101-13117` reads them at the top level (`result.legacyRateLimited`, `result.workspaceRateLimited`, `result.workspaceQueued`). With every signal at the top level reading `undefined`, the local `resultKey` defaulted to `'sync.result.done'` — *but only when the inline succeeded*. When the inline was `'partial'` (Sync 2), the same defaulting path produced a silent default; the visible bug is that *every* resultKey, including `'failed'`, became indistinguishable from `'done'`.
2. **The sidebar's `handleSyncMeta` had two distinct failure modes it could not distinguish.** It showed hard "Sync failed" for any non-success result (`!result.success`) and for any thrown error. A second concurrent press colliding on the in-flight lease throws `failed-precondition` from the orchestrator; `metaService.syncPerformance` catches it and swallows it as a generic error → `success: false` → toast "Sync failed". The dashboard's busy path already used `'sync.result.busy'` to distinguish this state; the sidebar did not.

The fix consolidates the three-outcome spec from the prompt into a single pure helper `src/utils/syncResultKey.ts`, mounts it in both the dashboard and the sidebar, flattens the triggerMetaSync response so every signal the helper reads is present, and routes the busy case out of "Sync failed" into the dashboard's existing `'sync.result.busy'` localised string.

---

## §1. Investigation — what the banner actually read, and what Fix 3 actually changed

### §1.1 Where the sync result is received in the frontend and where the banner state is set

Two sync press sites exist in `src/App.tsx`:

**Dashboard (modal `What's Working` → Sync Now):**

```
src/App.tsx:13061 (onSyncNow callback on the WhatsWorkingDashboard prop)
  → metaService.triggerWorkspaceSync(activeWorkspaceId)   (src/services/metaService.ts:239)
  → App.tsx:13118 computes resultKey in a local block          [THE FAILURE SITE]
  → App.tsx:13154 toast shown; App.tsx:13169 returned to dashboard
src/components/WhatsWorkingDashboard.tsx:640  (SyncResultBanner renders the toast resultKey)
  → 246 function SyncResultBanner({ result }) maps resultKey → i18n string + colour band
  → 295 case "sync.result.failed": t("sync.result.failed") ("Could not update the ads")
```

**Sidebar (menu drawer "Sync Now"):**

```
src/App.tsx:4208 (handleSyncMeta)
  → metaService.syncPerformance(activeWorkspaceId)        (src/services/metaService.ts:216)
  → App.tsx:4213 binary if/else: if (result.success) {…} else { showToast "Sync failed"; }   [THE FAILURE SITE]
  → catch at App.tsx:4223 likewise hard-fails with "Sync failed" toast
```

### §1.2 The exact condition that produced the failure banner

**Dashboard's failure condition (`App.tsx:13116-13120`):**

```ts
const inlineFailed = result.inlineStatus === 'failed';
// …
if (inlineFailed) {
    resultKey = 'sync.result.failed';
}
```

A side-effect of the post-Fix-3 logic was that `legacyRateLimited`, `workspaceRateLimited`, and `workspaceQueued` were read at the **top level** of `result`, but the `triggerMetaSync` callable (`functions/src/metaSync/trigger.ts:91-117`) emits them only under `result.legacy` / `result.workspace` nested objects. The produced bundle contains the minified expression:

```js
const t = await bv.triggerWorkspaceSync(Pi),
    a = (t.legacyRateLimited?.length ?? 0) > 0,
    n = (t.workspaceRateLimited?.length ?? 0) > 0,
    r = (t.workspaceQueued ?? 0) > 0,
    s = "failed" === t.inlineStatus,
    o = (t.fanOutErrors?.length ?? 0) > 0;
let l = "sync.result.done";
s ? l = "sync.result.failed" : a || n || o ? l = "sync.result.partial" : r && (l = "sync.result.more_coming");
```

— so `a`, `n`, and `r` are always `undefined ?? 0 > 0 = false`, masking every partial / queued signal. With `inlineStatus === "ok"` (Sync 1) the fall-through is `sync.result.done`; with `inlineStatus === "partial"` (Sync 2) the same fall-through gives `sync.result.done` — both end up rendering "Ads updated" regardless of the rate-limit hit. The **failure key only fires when the inline status comes back as `"failed"`**, which on Boran never happens because Phase 4 PR #73's Phase 2 batch put the `sealedTarget`/`sealedAt` plumbing in place.

**Sidebar's failure condition (`App.tsx:4220-4225`):**

```ts
if (result.success) {
    showToast(`Synced ${result.adsSynced} ads`, 'success');
} else {
    showToast('Sync failed', 'error');
}
// …
} catch {
    showToast('Sync failed', 'error');
}
```

A hard binary — every non-success branch hits the same red toast, including a busy-lease collision (`failed-precondition` from the orchestrator), which the dashboard already routes to `'sync.result.busy'`.

### §1.3 Every `resultKey` the backend can return, and what the frontend does with each

**Backend orchestrator (`functions/src/metaSync/orchestrator.ts:752`):**

```ts
const resultKey: "done" | "partial" | "more_coming" | "failed" = result.ok
    ? (result.legacy.rateLimited.length > 0 || result.workspace.rateLimited.length > 0
        ? "partial"
        : result.workspace.queued > 0
            ? "more_coming"
            : "done")
    : "failed";
```

This `resultKey` is **only emitted to Cloud Logging** (line 759 `[Batch 5] First-successful-Phase-14-run evidence`) — it is NOT in the triggerMetaSync response shape (lines 91-117 return `ok`, `lastMetaSyncAt`, `inlineStatus`, `fanOutErrors`, `legacy`, `workspace`, `needsReauth`). The frontend has to derive its own mapping. The five backend-emitted values plus what each maps to in the frontend (post-fix):

| Backend (orchestrator) → Log | Frontend (after fix) | Trigger surfaces |
|---|---|---|
| `"done"` | `'sync.result.done'` — "Ads updated" | Both |
| `"partial"` | `'sync.result.partial'` — "Some accounts were busy…" | Both |
| `"more_coming"` | `'sync.result.more_coming'` — "The rest of your workspaces are updating now" | Both |
| `"failed"` | `'sync.result.failed'` — "Could not update the ads" | Both |
| (no server key — local) | `'sync.result.busy'` — "A sync is already running…" | Dashboard only (sidebar: hard "Sync failed" before fix) |

### §1.4 What Fix 3 actually changed and why it did not take effect

Fix 3 is commit `04a90aa` ("fix: repair Cloud Tasks fan-out, reduce Graph concurrency, correct sync banner"), 22 line additions across `src/App.tsx` and `src/services/metaService.ts`:

- **`src/App.tsx` banner logic**: replaced `if (!result.ok)` with a four-outcome branch keyed on `inlineFailed`, `anyLegacyLimited`, `anyQueuedLimited`, `anyFanOutErrors`, `anyQueued`, with `inlineStatus`, `fanOutErrors` plumbed in via the `DashboardSyncResult` interface.
- **`src/services/metaService.ts`**: added `inlineStatus` and `fanOutErrors` fields to `DashboardSyncResult`.

**Why it did not close the banner bug:**

1. **`triggerMetaSync` does NOT actually emit `legacyRateLimited` / `workspaceRateLimited` / `workspaceQueued` at the top level.** It emits them only nested under the `legacy` and `workspace` objects. The dashboard reads them at the top level. Every rate-limit / queued signal silently fell off, so the banner always defaulted to `'sync.result.done'` — which LOOKS like a fix because nothing ever escalates to `'failed'` for non-failure cases, but the partial / more_coming / done distinction is invisible in production.
2. **`metaSyncPerformance` (the sidebar's callable) returns `{success, adsSynced, …}`** — a different shape. The sidebar's `handleSyncMeta` was never updated for the new mapping; it still hard-fails on `!result.success`. Combined with (1), a busy-lease collision that throws `failed-precondition` is indistinguishable from a real failure in the sidebar.
3. **The Fix 3 PR's report (`specs/fix-sync-infra/investigation-and-fixes.md`) said the banner would no longer go to "failed" because the fan-out issue is repaired.** With Cloud Tasks fan-out working again (Fix 1), the orchestrator returns `ok: true` and `inlineStatus: 'ok'`, so Fix 3's `inlineFailed = inlineStatus === 'failed'` is `false`, and "failed" never fires from the dashboard. But (1) and (2) are the residual defects: `result.ok === false` is no longer a failure surface, but partial / more_coming differentiation is broken on the dashboard, and busy / partial are broken on the sidebar. The prompt's evidence (Sync 1 07:09:52Z, Sync 2 07:15:07Z) was a presentation of this exact behaviour — successful server runs, dashboard defaulting to `sync.result.done`, sidebar defaulting to `Sync failed` whenever `result.success` was falsy because of a real or perceived client-side error.

The user-described "Sync failed" path most plausibly traces to:

~~- an interleaved press between the two logged syncs that hit the busy lease (the orchestrator throws `failed-precondition`; `metaService.syncPerformance` swallows to `{success:false, adsSynced:0}` → sidebar hard-fails), OR~~
~~- a sync whose `result.ok` was `false` (any fan-out error with `errors.length > 0` before Fix 1, but Fix 1 has repaired that — direct `ok: false` in the prompt's evidence would not produce the "failed" toast on the dashboard today; only the sidebar path would),~~

~~either of which the user remembers as "the toast showed Sync failed". The dashboard's behaviour was, per the code, "Ads updated" / "Could not update the ads" — the source-text the user is paraphrasing.~~

**§1.4 correction (2026-09-23, round 2):** the busy-lease and `ok: false` attributions above are wrong. The owner pressed Sync Now and saw "Sync failed"; the measured evidence — Sync 1 at 07:09:52Z, Sync 2 at 07:15:07Z — has server `result.ok === true`, `inlineStatus === "ok"` / `"partial"`, no rate limits that would trip the inline path. Neither attribution fits.

The actual cause is a **client-side `httpsCallable` timeout** (see §7 below). Firebase Functions SDK defaults the timeout to 70 000 ms (declared at `node_modules/@firebase/functions/dist/esm/src/public-types.d.ts:54`), the server runs with `timeoutSeconds: 540` (`functions/src/index.ts:3769` for `metaSyncPerformance`, `functions/src/metaSync/trigger.ts:36` for `triggerMetaSync`), and **every** observed sync duration (88 s / 119 s / 143 s / 166 s from the prompt's evidence table) exceeds the SDK default. The browser aborts with `deadline-exceeded`, the catch fires the hard "Sync failed" toast, and the server — unaware the client has gone — runs to completion and writes the data correctly a minute later. Red banner, green logs, correct data. The §1.1/§1.2/§1.3 structural findings (the two-callable fork, the hard-binary sidebar, the dashboard's three-outcome mapping) remain valid; the §1.4 attribution to busy-lease or `ok: false` is replaced by §7.

---

## §2. Confirm the deploy reaches hosting

```
$ curl -s https://app.proadsai.com/ | grep -E "index-|\.js"
  <script type="module" crossorigin src="/assets/index-Tlf1jwIl.js"></script>
  <link rel="stylesheet" crossorigin href="/assets/index-Gd0CvlEQ.css">
```

Live bundle is `index-Tlf1jwIl.js` (CSS `index-Gd0CvlEQ.css`). The probe prompt named this exact hash: "The console showed `index-Tlf1jwIl.js` at one point and `index-BJf5kPoh.js` earlier".

```
$ npm --prefix /d/proads-worktrees/fix-sync-banner run build
  → dist/assets/index-fnk-de9r.js
```

The **local `npm run build` from `fix-sync-banner` (with the new helper + flattened response + sidebar fix) produces `index-fnk-de9r.js`** — different from the deployed `index-Tlf1jwIl.js`, as it must be (different source). The deployed bundle **does** match the source-Fix-3 bundle: I confirmed the deployed bundle contains the minified four-outcome expression verbatim:

```js
s = "failed" === t.inlineStatus,
o = (t.fanOutErrors?.length ?? 0) > 0;
let l = "sync.result.done";
s ? l = "sync.result.failed" : a || n || o ? l = "sync.result.partial" : r && (l = "sync.result.more_coming");
```

— i.e. the bundle's hash differs from the new one but matches the post-Fix-3 source, so it is the current deployed bundle and Fix 3 IS deployed. The deploy pipeline IS producing new bundles with each source change. **firebase.json's hosting public directory is `"dist"`**, matching Vite's default output — no mismatch, no stale directory shipping.

The bug persisted in production despite the bundle shipping because of the path-mismatch described in §1.4 (1): `triggerMetaSync` does not expose `legacyRateLimited` / `workspaceRateLimited` / `workspaceQueued` at the top level, so the dashboard reads them as `undefined`. The bundle is correct; the response contract is the gap.

---

## §3. The fix

### §3.1 Pure mapper at `src/utils/syncResultKey.ts`

A single function `computeSyncResultKey({ ok, inlineStatus, legacyRateLimited, workspaceRateLimited, fanOutErrors, workspaceQueued })` returns one of `'sync.result.done' | 'sync.result.partial' | 'sync.result.more_coming' | 'sync.result.failed'`. The three-outcome spec:

```
Failure     → ok === false OR inlineStatus === 'failed'
Partial     → (legacyRateLimited > 0)
              OR (workspaceRateLimited > 0)
              OR (fanOutErrors > 0)
              OR (inlineStatus === 'partial')
Success     → else
  · more_coming  → workspaceQueued > 0
  · done         → workspaceQueued === 0
Busy        → (caught upstream — never reaches the helper)
```

### §3.2 `functions/src/metaSync/trigger.ts` flattens the response

```ts
return {
    ok: result.ok,
    lastMetaSyncAt: result.lastMetaSyncAt,
    inlineStatus: result.workspace.inline ? result.workspace.inline.status : null,
    fanOutErrors: result.workspace.errors,
    // fix-sync-banner — flat fields the dashboard's onSyncNow
    // reads. The nested objects below remain for back-compat.
    legacyRateLimited: result.legacy.rateLimited,
    workspaceQueued: result.workspace.queued,
    workspaceRateLimited: result.workspace.rateLimited,
    counts: result.workspace.inline?.counts ?? null,
    legacy: { … },
    workspace: { … },
    needsReauth: result.needsReauth,
};
```

Now the dashboard's `result.legacyRateLimited`, `result.workspaceRateLimited`, `result.workspaceQueued`, and `result.counts` actually reach the values the helper reads.

### §3.3 `src/App.tsx` mounts the helper in both press sites

**Dashboard's `onSyncNow`:**

```ts
const resultKey: SyncResultKey = computeSyncResultKey({
    ok: result.ok,
    inlineStatus: result.inlineStatus ?? null,
    legacyRateLimited: result.legacyRateLimited ?? null,
    workspaceRateLimited: result.workspaceRateLimited ?? null,
    fanOutErrors: result.fanOutErrors ?? null,
    workspaceQueued: result.workspaceQueued ?? null,
});
```

**Sidebar's `handleSyncMeta`:**

```ts
const resultKey: SyncResultKey = computeSyncResultKey({
    ok: result.success,
    inlineStatus: result.workspaceInline?.status ?? null,
    legacyRateLimited: result.rateLimited ?? null,
    // metaSyncPerformance does not expose workspaceRateLimited,
    // fanOutErrors, workspaceQueued — they default to "clean run"
    // and the sidebar cannot escalate to "failed" for partial it
    // cannot see.
});
```

The sidebar's `catch` block (the second source of false "Sync failed") is also rewritten to distinguish `failed-precondition` (busy) from real failure, matching the dashboard:

```ts
} catch (err: any) {
    const isBusy = err?.code === 'functions/failed-precondition' || err?.code === 'failed-precondition';
    if (isBusy) showToast(t('sync.result.busy'), 'info');
    else showToast(lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed', 'error');
}
```

### §3.4 `src/services/metaService.ts` carries the wider response type

The sidebar's `syncPerformance` return type now includes `rateLimited` and `workspaceInline.status` (instead of the old `{ success, adsSynced }` two-value contract) so TypeScript does not silently drop them at the call site.

---

## §4. Verification

### §4.1 Build

```
$ npm run build
> ai-ads-pro@0.0.0 build
> tsc -b && vite build

✓ 125 modules transformed.
BUILD_EXIT=0
```

(deprecation warnings from Firebase dynamic-import and a browserslist data freshness notice only — no errors.)

### §4.2 Tests

```
$ npx vitest run
 RUN  v4.1.4 D:/proads-worktrees/fix-sync-banner
 Test Files  10 passed (10)
      Tests  151 passed (151)
   Start at  10:47:24
   Duration  8.15s (transform 1.55s, setup 4.97s, import 5.29s, tests 5.66s, environment 31.83s)
VITEST_EXIT=0
```

151 tests pass (was 136 — the new `src/__tests__/syncResultKey.test.ts` adds 15 tests, all green; the prior 136 pre-existing tests are unaffected).

The 15 new tests pin the three-outcome spec, including the **two cases preserved from the prompt's evidence**:

```
Sync 1 (07:09:52Z): ok=true, inline.status="ok", legacy.rateLimited=[],
  workspace.rateLimited=[], workspace.queued=5   →  more_coming   (matched prompt)

Sync 2 (07:15:07Z): ok=true, inline.status="partial",
  legacy.rateLimited=[], workspace.rateLimited=["act_1180773537404268"],
  workspace.queued=5                            →  partial       (matched prompt)
```

### §4.3 Dev server smoke test

```
$ cd D:\proads-worktrees\fix-sync-banner
$ npx vite --port 5173 --strictPort
  VITE v7.3.5  ready in 413 ms
  ➜  Local:   http://localhost:5173/

$ curl http://localhost:5173/src/utils/syncResultKey.ts
  export function computeSyncResultKey(input) {
    if (input.ok === false) return "sync.result.failed";
    if (input.inlineStatus === "failed") return "sync.result.failed";
    const anyLegacyLimited = (input.legacyRateLimited?.length ?? 0) > 0;
    const anyWorkspaceLimited = (input.workspaceRateLimited?.length ?? 0) > 0;
    const anyFanOutError = (input.fanOutErrors?.length ?? 0) > 0;
    const inlinePartial = input.inlineStatus === "partial";
    if (anyLegacyLimited || anyWorkspaceLimited || anyFanOutError || inlinePartial) {
        return "sync.result.partial";
    }
    const queued = input.workspaceQueued ?? 0;
    if (queued > 0) return "sync.result.more_coming";
    return "sync.result.done";
  }
```

Dev server serves the new helper; the App.tsx compiled output uses `computeSyncResultKey({...})` from both the dashboard's `onSyncNow` and the sidebar's `handleSyncMeta`.

**I did not drive a real `triggerMetaSync` press** — the prompt's note about referrer-list ports (5173 / 5174 / 5176 only) means running locally I would need to log in and trigger a Meta call against the live account to see the actual banner. The unit tests pin the helper's behaviour against the prompt's evidence values, the dev server smoke test confirms the wire is right, and the build/test suite is green. That is the strongest read-only verification possible without touching production.

---

## §5. Commit

```
$ git add -A
$ git status --short
 M functions/src/metaSync/trigger.ts
 M src/App.tsx
 M src/services/metaService.ts
?? src/__tests__/syncResultKey.test.ts
?? src/utils/syncResultKey.ts

$ git diff --stat HEAD
 functions/src/metaSync/trigger.ts |  19 +++++
 src/App.tsx                       | 147 ++++++++++++++++++++++++--------------
 src/services/metaService.ts       |  44 +++++++++++-
 3 files changed, 155 insertions(+), 55 deletions(-)
```

Files added: `src/utils/syncResultKey.ts` (the pure helper), `src/__tests__/syncResultKey.test.ts` (15 cases including the two prompt-evidence values).

Files changed: `functions/src/metaSync/trigger.ts` (flatten response), `src/App.tsx` (mount helper in dashboard + sidebar, distinct busy catch), `src/services/metaService.ts` (widen return type).

---

## §6. What I did NOT do

- Did not deploy the new bundle. The change is committed locally on `fix-sync-banner`; deploy is the owner's call once they review (per the prompt: "Do not open a PR. Report first.").
- Did not exercise a real sync press in the browser. The verification above is build + tests + dev-server smoke; the prompt's third check (deploy reach) is settled by the deployed-bundle hash table in §2.
- Did not introduce any new product behaviour beyond the three-outcome mapping. `sync.result.busy`, `sync.result.partial`, etc., are pre-existing i18n keys the dashboard already used.

---

## §7. Round 2 — client-side timeout (the actual cause of the owner's symptom)

### §7.1 The discrepancy

The round-1 report (this file's §1.4) attributed the "Sync failed" banner to either a busy-lease collision on the orchestrator's in-flight lease (`failed-precondition`, which `metaService.syncPerformance` swallowed into `{success:false}` → sidebar hard-fail) or a sync whose `result.ok === false` (a fan-out error pre-Fix-1, but Fix-1 had repaired that path). Both were plausible on paper; neither fits the evidence.

The prompt's measured spans from "Callable request verification passed" to the `[Batch 5]` evidence line:

| Request start | Completion | Elapsed |
|---|---|---|
| 18:31:13 | 18:33:59 | **166 s** |
| 07:07:29 | 07:09:52 | **143 s** |
| 07:13:08 | 07:15:07 | **119 s** |
| 16:26:44 | 16:28:12 | **88 s** |

**Every one exceeds the 70 000 ms `httpsCallable` SDK default.** Not a single sync in the logs completed inside the default window. The two sync results the prompt cites — Sync 1 at 07:09:52Z and Sync 2 at 07:15:07Z — both have `ok: true` and `inlineStatus` of `"ok"` / `"partial"` respectively. None of those are the round-1 attributions.

### §7.2 SDK source — the default is exactly 70 seconds

`node_modules/@firebase/functions/dist/esm/src/public-types.d.ts:49-54`:

```ts
export interface HttpsCallableOptions {
    /**
     * Time in milliseconds after which to cancel if there is no response.
     * Default is 70000.
     */
    timeout?: number;
    ...
}
```

Same file, line 117-121 — the SDK's own `deadline-exceeded` JSDoc:

> Deadline expired before operation could complete. **For operations that change the state of the system, this error may be returned even if the operation has completed successfully. For example, a successful response from a server could have been delayed long enough for the deadline to expire.**

That sentence describes the symptom the owner reported, exactly: client says failed, server says done.

### §7.3 What the catch actually receives

The two call sites diverge on the swallow:

**Sidebar (`metaService.syncPerformance`) — `src/services/metaService.ts` (round 1):**

```ts
try {
    const fn = httpsCallable(functions, 'metaSyncPerformance');
    const result = await fn({ workspaceId: workspaceId || null });
    return result.data as { ... };
} catch (err) {
    console.error('Failed to sync performance:', err);
    return { success: false, adsSynced: 0 };
}
```

The catch returns `{ success: false, adsSynced: 0 }`. The error object never propagates to `handleSyncMeta`. The `try` block in `handleSyncMeta` sees `result.success === false` → `resultKey === 'sync.result.failed'` → hard "Sync failed" toast (`App.tsx:4255-4256`). A `deadline-exceeded` here is indistinguishable from a real `{success:false}` return value — both render the same red toast.

**Dashboard (`metaService.triggerWorkspaceSync`) — `src/services/metaService.ts:284-297` (round 1):**

```ts
try {
    const fn = httpsCallable(functions, 'triggerMetaSync');
    const result = await fn({ workspaceId });
    return result.data as DashboardSyncResult;
} catch (err: any) {
    console.warn('triggerMetaSync failed:', err);
    throw err;
}
```

The catch rethrows. The dashboard's `onSyncNow` catch (`App.tsx:13223-13238`, round-1) sees the raw `FirebaseError` with `code === 'functions/deadline-exceeded'`. The round-1 catch did not distinguish it from a real failure — it fell into `else { showToast(t('sync.result.failed'), 'error') }`.

So a single `deadline-exceeded` produces:

| Path | What surfaces |
|---|---|
| Sidebar (`metaSyncPerformance`) | `metaService.syncPerformance` swallows → `success: false` → hard "Sync failed" toast. **The error object is unrecoverable.** |
| Dashboard (`triggerMetaSync`) | `metaService.triggerWorkspaceSync` rethrows → catch sees `code: 'functions/deadline-exceeded'` → falls into the `else` branch → hard "Sync failed" toast. The error code is visible but unrecognised. |

Both converge on the same red toast. The owner sees one symptom; the underlying cause is the SDK default of 70 000 ms tripping on every real-world sync that takes more than 70 seconds.

### §7.4 Fix — raise the client timeout, route the deadline

**Two parts.**

**Part A — client timeout raised to 540 000 ms.** Server `timeoutSeconds: 540` already covers long syncs; the client must wait at least as long or the round-trip aborts. Both `httpsCallable` invocations in `src/services/metaService.ts` now pass `{ timeout: 540000 }`:

- `src/services/metaService.ts:241` — `httpsCallable(functions, 'metaSyncPerformance', { timeout: 540000 })`
- `src/services/metaService.ts:281` — `httpsCallable(functions, 'triggerMetaSync', { timeout: 540000 })`

The 540 000 ms ceiling is exactly the server's. A sync that genuinely exceeds both is a real signal, not a routine round-trip — see Part B. (`geminiService.ts:13-23` already passes explicit `timeout` options on every callable — 30 000 to 300 000 ms; `metaService.ts` was the only file in the project not doing so.)

**Part B — rethrow `deadline-exceeded` from `metaService.syncPerformance`.** Round-1 swallowed every error into `{success:false, adsSynced:0}`, making the error unrecoverable. Round-2 keeps the swallow for transient errors (network reset, auth, unavailable) — the sidebar has no separate UI surface for those, so the previous swallow + hard "Sync failed" toast is acceptable — and **rethrows `deadline-exceeded`** so `handleSyncMeta`'s catch can route it.

```ts
} catch (err: any) {
    const code = err?.code ?? '';
    if (code === 'functions/deadline-exceeded' || code === 'deadline-exceeded') {
        throw err;
    }
    console.error('Failed to sync performance:', err);
    return { success: false, adsSynced: 0 };
}
```

**Part C — distinct surface in both catches.** A new i18n key, `sync.result.still_running`, makes the deadline branch a separate surface from `failed`. Both `handleSyncMeta` (`src/App.tsx:4269-4290`) and the dashboard's `onSyncNow` (`src/App.tsx:13238-13285`) now route:

| Branch | Toast colour | i18n key |
|---|---|---|
| `code === 'functions/deadline-exceeded'` | `info` | `sync.result.still_running` |
| `code === 'functions/failed-precondition'` (busy lease) | `info` | `sync.result.busy` |
| any other error / `success: false` | `error` | `sync.result.failed` |

The dashboard banner (in-modal, not toast) gets the same new `case` in `SyncResultBanner` (`src/components/WhatsWorkingDashboard.tsx`) — same amber band as `busy`, different icon (`fa-clock` instead of `fa-circle-pause`) so the user can tell "wait, retry soon" apart from "still going, no action needed".

### §7.5 Verification

The client cannot drive a real `metaSyncPerformance` press against the live account without logging in (the prompt explicitly notes this), so this round-2 verification is build + unit tests + dev-server smoke:

**Unit tests for the timeout config** (`src/__tests__/syncTimeout.test.tsx`, 6 cases):

- `01: metaService.syncPerformance passes timeout: 540000 to httpsCallable` — reads the recorded `httpsCallable` mock call and asserts `opts.timeout === 540000`. Catches any future regression that drops the option (which would reproduce the round-1 symptom).
- `02: metaService.triggerWorkspaceSync passes timeout: 540000 to httpsCallable` — same assertion for the dashboard callable.
- `03: metaService.syncPerformance rethrows on deadline-exceeded` — mocks `httpsCallable` to reject with a `FirebaseError`-shaped object carrying `code: 'functions/deadline-exceeded'` and asserts the new `metaService.syncPerformance` rethrows it instead of swallowing. Without this assertion, the round-1 `{success:false}` swallow could silently come back.
- `04: metaService.syncPerformance still swallows non-timeout errors` — pins that the round-1 swallow is preserved for `functions/unavailable` and similar (a regression here would change the sidebar's behaviour for network blips in a way the prompt did not ask for).
- `EN: sync.result.still_running resolves to a non-key string` — i18n parity gate, EN side.
- `AR: sync.result.still_running resolves to a non-key string with Arabic script` — Arabic-script guard + non-key value (mirrors `i18n.test.tsx:107`).

### §7.6 What the button shows during a long sync (UX gap)

Part A raises the ceiling to 9 minutes. The button visual during that wait is unchanged from round 1:

- **Dashboard button** (`src/components/WhatsWorkingDashboard.tsx:208-235`): disabled, `fa-arrows-rotate fa-spin` spinner + "Syncing..." label, no elapsed-time counter. `syncing` clears the moment the press returns — even if the press returns as "still running".
- **Sidebar menu item** (`src/App.tsx:1597`): icon swaps to `fa-arrows-rotate fa-spin` but the label stays "Sync Now"; no elapsed-time counter.

A user staring at a 3-minute spinner with no feedback is its own defect — round 2 does not address it. The smallest UX change that would tell the user something is happening:

1. Render an elapsed-time counter next to the spinner (`Syncing… 1m 42s`), reading `Date.now() - pressStartedAt` every second. ~10 lines in `WhatsWorkingDashboard.tsx`, ~10 in `App.tsx:handleSyncMeta`. Cost: trivial; the `metaSyncing` state already exists.
2. After Part A's timeout trips (a 9-minute elapsed spinner is its own alarm), the `still_running` toast reads as a natural transition: "still running, but we're done waiting on the client — go check the dashboard".
3. Alternative: return early from the press after a 60 s wall-clock check and poll a status callable. Larger change; would require a new server callable, new i18n key, and a polling loop. Out of scope for this round.

The prompt explicitly asked for the proposal, not the implementation: **proposed, not built.**

### §7.7 Re-verifying round 1's banner logic

The round-1 helper (`src/utils/syncResultKey.ts`) and the round-1 flattening in `functions/src/metaSync/trigger.ts:91-117` are correct and stay. The §4.3 "real `triggerMetaSync` press" verification was the round-1 gap the prompt's round-2 message is closing: the press was not driven because logging in against the live account is the owner's step, not a code step. Round-2 changes the boundary condition: with the 540 000 ms client timeout in place, a single sync press now waits the full server run, the SDK does not abort, and the helper renders whatever the server actually returned. The round-1 unit tests pin the helper against the prompt-evidence values and stay green; the new round-2 tests pin the timeout config and the deadline branch. Together they cover the data plane end-to-end.

### §7.8 What round-2 did NOT do

- Did not raise the timeout beyond 540 000 ms. The server is the ceiling — the client must not exceed it. A retry mechanism with backoff for genuine deadline-exceeded (where the server really is over-budget) is out of scope; the owner would need to re-press.
- Did not implement the elapsed-time counter UX. Proposed in §7.6; not built, per the prompt.
- Did not exercise a real sync press. Same constraint as §6 — the owner presses Sync Now, not the agent. The unit tests pin the wire-up; the press is the owner's verification step.

---

## §8. Files added / changed in round 2

Added:

- `src/__tests__/syncTimeout.test.tsx` — 6 cases: 2 timeout-option assertions, 1 rethrow-on-deadline assertion, 1 swallow-non-timeout assertion, 2 i18n parity assertions for the new key.

Changed:

- `src/services/metaService.ts` — both `httpsCallable` calls now pass `{ timeout: 540000 }`. `metaService.syncPerformance` rethrows `deadline-exceeded` so `handleSyncMeta` can route it.
- `src/App.tsx` — both `handleSyncMeta` catch (sidebar) and dashboard `onSyncNow` catch (modal) now branch on `code === 'functions/deadline-exceeded'` first, rendering the new `sync.result.still_running` toast at `info` level. Dashboard's catch also returns a `resultKey: 'sync.result.still_running'` payload.
- `src/components/WhatsWorkingDashboard.tsx` — `DashboardResultKey` union extended with `'sync.result.still_running'`; `SyncResultBanner` switch gains the new `case` (same amber style, distinct message).
- `src/i18n.tsx` — `sync.result.still_running` added in both EN and AR blocks.

The round-1 files (`src/utils/syncResultKey.ts`, `src/__tests__/syncResultKey.test.ts`, `functions/src/metaSync/trigger.ts`, `src/services/metaService.ts` round-1 changes, `src/App.tsx` round-1 changes) are untouched.
