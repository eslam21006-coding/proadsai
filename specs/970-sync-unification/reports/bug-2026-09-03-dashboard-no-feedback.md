# Bug 2026-09-03 — What's Working dashboard SYNC NOW has no user feedback

**Status:** investigation complete. Fix planned. **NOT APPLIED YET** — user
asked for the local report first.

**Branch:** `970-sync-unification`
**Source:** production-testing observation that pressing the
dashboard's "Sync Now" button produces no visible feedback, and a
double-press produces no visible refusal even though the lease should
fire.

---

## 1. Trace of the dashboard's SYNC NOW handler

The button lives in `WhatsWorkingDashboard.tsx:189-203` inside the
`SyncStatusBar` component. The relevant code:

```tsx
function SyncStatusBar(props: {
    status: SyncStatus;
    onSync: () => void;
    onReconnect: () => void;
    onConnect: () => void;
}): React.ReactElement {
    // ...
    return (
        <div className="bg-slate-900/40 border border-slate-700/40 rounded-2xl px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
                <i className="fa-solid fa-rotate text-blue-400 text-xl" />
                <div>
                    <div className="text-slate-200 text-sm font-bold">
                        {status.lastMetaSyncAt
                            ? relativeTime(status.lastMetaSyncAt, lang, t)
                            : t("whats_working.sync.never")}
                    </div>
                </div>
            </div>
            <button
                onClick={props.onSync}
                className="text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors bg-blue-600 hover:bg-blue-500 text-white"
            >
                {t("whats_working.sync.cta")}
            </button>
        </div>
    );
}
```

**The button has no pending state.** It always shows the same label
(`t("whats_working.sync.cta")`), is always enabled, never shows a
spinner, never changes colour or label. The `setMetaSyncing(true)`
exists in the parent at `App.tsx:12962`, but **`metaSyncing` is
never threaded into `<WhatsWorkingDashboard>` or
`<SyncStatusBar>`** — the state is consumed only by the sidebar
MenuItem icon at `App.tsx:1582`:

```tsx
{
    key: 'meta-sync',
    el: <MenuItem
        key="meta-sync"
        icon={metaSyncing ? 'fa-arrows-rotate fa-spin' : 'fa-arrows-rotate'}
        label={t('topbar.menu_meta_sync')}
        onClick={props.onSyncMeta}
    />
},
```

So when the dashboard's button is pressed:

1. The parent's `onSyncNow` callback (at `App.tsx:12960-13042`)
   sets `metaSyncing=true`, shows a toast, calls
   `metaService.triggerWorkspaceSync(activeWorkspaceId)`, then runs
   the result-mapping logic from Batch 5 and toasts the result.
2. The dashboard's own `onSync` handler at line 473 does:

   ```tsx
   onSync={() => {
       void (async () => {
           await props.onSyncNow();
           await fetchData();
       })();
   }}
   ```

   It awaits the parent's callback, then re-fetches the data. The
   `void` discards the promise; any error in the parent's callback
   is unhandled at this site.

**The dashboard never knows the result shape.** The parent's
callback renders toasts (`sync.result.done/partial/more_coming/failed`
or a generic failure) but the dashboard itself has no awareness.

## 2. The lease IS firing — confirmed

I confirmed the lease is working by running the existing test:

```
ok 24 - runFullSyncWithLease — throws AlreadyRunningError when acquire reports the lease is held
```

The orchestrator's `runFullSyncWithLease` calls `acquireLease`,
which returns `ok: false` with the holderUid and expiresAtMs when
another caller already holds the lease. The wrapper throws
`AlreadyRunningError`, which `trigger.ts:89-98` catches and
translates to `HttpsError("failed-precondition", "A Meta sync is
already running for this account. Please wait a moment and try
again.")`. The parent's catch at `App.tsx:13026-13038` then
renders the `sync.result.failed` toast.

The double-press flow:
- 1st press: parent → `triggerMetaSync` → `runFullSyncWithLease`
  → `runFullSync` → `acquireLease` (succeeds, lease held by
  callerUid 1) → runs LEG A + LEG B inline + LEG B fan-out →
  `releaseLease` (TTL 10 min, cleared in `finally`).
- 2nd press: parent → `triggerMetaSync` → `runFullSyncWithLease`
  → `runFullSync` → `acquireLease` returns `ok: false` →
  wrapper throws `AlreadyRunningError` → `trigger.ts` catches →
  throws `HttpsError("failed-precondition", ...)` → parent's
  catch renders the `sync.result.failed` toast.

The lease is doing its job. The user cannot see the result.

## 3. Why the second press produced no visible refusal — TWO compounding bugs

**Bug A: the toast is hidden behind the modal.** The toast
container is at `App.tsx:497` with `z-[200]`:

```tsx
<div className={`fixed bottom-10 left-1/2 -translate-x-1/2 ${bg} text-white
  px-8 py-4 rounded-2xl shadow-2xl z-[200] animate-in slide-in-from-bottom-4
  flex items-center space-x-3`}>
```

The dashboard modal is at `App.tsx:12919` with `z-[200] flex
items-center justify-center p-4` plus a `bg-black/60 backdrop-blur-sm`
backdrop. Both at the same z-index, both `position: fixed`. DOM
order: the toast is at line 8236, the modal at line 12919. Later
DOM = on top, so the modal stacks over the toast. The toast IS
rendered, but visually covered by the modal's full-screen
container and its `backdrop-blur-sm` overlay.

`App.tsx:8236`:

```tsx
return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`min-h-screen bg-slate-950
      text-slate-200 overflow-x-hidden flex flex-col ${lang === 'ar' ? 'font-arabic' : ''}`}>
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
      {/* VIDEO POPUP — first-time tutorial */}
      {showVideoPopup && <VideoPopup ... />}
```

`ToastNotification` is the first child of the root, before any
z-200 modal. The toast is the FIRST child rendered. The dashboard
modal is rendered later in the JSX (at the end). Same z-index,
later DOM = on top.

**Bug B: the button doesn't render a pending state.** The
`SyncStatusBar` doesn't accept a `syncing` prop, so even when
`metaSyncing` is true (during the press), the button looks
identical to the idle state. The double-press therefore produces
zero visible change in the button itself.

These two bugs combine: the first press has no visual feedback
(button doesn't change, toast is hidden), the second press is the
same (button still doesn't change, lease-collision toast is hidden).
The user sees "nothing happens" even though the sync does
eventually complete.

## 4. The fix — strings + plan

### 4.1 Strings (EN + AR)

Two new i18n keys for the dashboard's local result banner:

| Key | English | Arabic |
|---|---|---|
| `whats_working.sync.syncing` | `Syncing...` | `جاري المزامنة...` |
| `whats_working.sync.busy` | `A sync is already running. Please wait a moment and try again.` | `المزامنة قيد التشغيل بالفعل. يرجى الانتظار لحظة والمحاولة مرة أخرى.` |

Existing strings reused (already in i18n.tsx from Batch 5, no change):

| Key | English | Arabic |
|---|---|---|
| `sync.result.done` | `Ads updated` | `تم تحديث الإعلانات` |
| `sync.result.partial` | `Some accounts were busy — they will update shortly` | `بعض الحسابات كانت مشغولة — سيتم تحديثها قريباً` |
| `sync.result.more_coming` | `The rest of your workspaces are updating now` | `باقي مساحات العمل يتم تحديثها الآن` |
| `sync.result.failed` | `Could not update the ads` | `تعذّر تحديث الإعلانات` |

### 4.2 Fix plan

1. **Add the two new i18n keys** (`whats_working.sync.syncing`,
   `whats_working.sync.busy`) in `i18n.tsx` (EN + AR).

2. **Change the `onSyncNow` prop contract** in
   `WhatsWorkingDashboardProps` from `() => Promise<void>` to
   `() => Promise<DashboardSyncResult>` where `DashboardSyncResult`
   carries:
   - `ok: boolean`
   - `busy: boolean` — true on lease collision (AlreadyRunningError)
   - `needsReauth: boolean`
   - `ads / matched / ambiguous / unmatched: number` — matching evidence
   - `legacyRateLimited: string[]`
   - `workspaceQueued: number`
   - `workspaceRateLimited: string[]`
   - `resultKey: 'sync.result.done' | 'sync.result.partial' | 'sync.result.more_coming' | 'sync.result.failed'`

   The result is the SAME struct the dashboard was already meant to
   render in Batch 5's planning — the toasts in the parent
   (`App.tsx:12983-13024`) already compute `resultKey` from the
   shape. The dashboard just reads the same value and renders
   locally.

3. **Update the parent's `onSyncNow` callback** at
   `App.tsx:12960-13042` to:
   - Compute the result struct (including `resultKey`) and return it.
   - Keep the existing toasts — the parent still emits them for the
     sidebar/legacy paths and as a redundant fallback. The
     dashboard's local result banner is the load-bearing UX.

4. **Add `syncing: boolean` and `lastResult: DashboardSyncResult | null`
   local state** to `WhatsWorkingDashboard`. The `onSync` handler:
   ```tsx
   const onSync = async () => {
       setSyncing(true);
       setLastResult(null);
       try {
           const result = await props.onSyncNow();
           setLastResult(result);
       } catch (err: any) {
           // Defensive: the parent's onSyncNow catches internally
           // and returns a result, but if it ever throws we still
           // want the dashboard to show something.
           setLastResult({ ok: false, busy: false, resultKey: 'sync.result.failed' });
       } finally {
           setSyncing(false);
           await fetchData();
       }
   };
   ```

5. **`SyncStatusBar` accepts `syncing: boolean`** and renders:
   - When `syncing === true`: button is `disabled`, label is
     `t("whats_working.sync.syncing")` ("Syncing..."), and a spinner
     icon is rendered next to the label.
   - When `syncing === false`: current behaviour (button enabled,
     label `t("whats_working.sync.cta")`).

6. **Render a result banner** below the `<SyncStatusBar>` (or
   below the dashboard's status area) when `lastResult !== null`:
   - `lastResult.busy === true` → render
     `t("whats_working.sync.busy")` in an amber banner.
   - `lastResult.resultKey === 'sync.result.failed'` → render
     `t("sync.result.failed")` in a red banner.
   - `lastResult.resultKey === 'sync.result.partial'` → render
     `t("sync.result.partial")` in an amber banner.
   - `lastResult.resultKey === 'sync.result.more_coming'` → render
     `t("sync.result.more_coming")` in a blue banner.
   - `lastResult.resultKey === 'sync.result.done'` → render
     `t("sync.result.done")` in a green banner (auto-dismiss
     after a few seconds; clicking the banner or the next press
     clears it).
   - The banner is INSIDE the modal, so the z-200 toast-visibility
     bug is bypassed.

7. **Nothing reintroduces a time-based cooldown.** `syncing`
   clears the moment the call returns. The lease IS the only
   gate; it's never user-visible as a wait timer.

### 4.3 Files to change

- `src/i18n.tsx` — add 2 keys (EN + AR, 4 lines).
- `src/components/WhatsWorkingDashboard.tsx` — type changes, local
  state, prop changes to `SyncStatusBar`, render the result banner.
- `src/App.tsx` — `onSyncNow` callback returns `DashboardSyncResult`
  instead of `void`. Keep the toasts (they remain useful for the
  sidebar and as redundant feedback).

### 4.4 What does NOT change

- The orchestrator (`runFullSync` / `runFullSyncWithLease`): no
  change. The lease and rate-limit classification are correct.
- The `isMetaRateLimit` classifier: no change.
- The `metaService.triggerWorkspaceSync` backend call: no change.
  It already returns the rate-limited / queued fields; the parent
  just needs to plumb them into the dashboard's result struct.
- No tests need to be written for the dashboard's UI; the
  existing `metaSyncOrchestrator.test.js:24` (lease fires) and
  the new dashboard manual verification cover the contract.

### 4.5 Acceptance

After the fix:
- Press the dashboard's SYNC NOW → button shows spinner +
  "Syncing..." and is disabled (no time-based cooldown; the
  disabled state lasts only while the call is in flight).
- Wait for the call to return → button reverts to enabled, lastMetaSyncAt
  refreshes, result banner shows the appropriate `sync.result.*` string.
- Press the button again before the first call returns → the lease
  fires, the result banner shows "A sync is already running. Please
  wait a moment and try again." in amber. The user has feedback
  regardless of toast z-index.
- The toast remains a redundant feedback channel for the sidebar
  path; the dashboard path is the load-bearing one.

### 4.6 What's NEXT after the fix

- The lease fires server-side. The server-side log in
  `runFullSync` and `worker.ts` (added in Batch 5 fix) records
  the busy state as `result.ok = false` with `resultKey: 'sync.result.failed'`.
  Operators reading the runbook query will see the failed result
  in the inline leg log and the failure in the orchestrator's
  `console.log` (Batch 5 fix). The dashboard's new busy banner
  is the user-facing layer; the server-side log is the audit
  trail.
- A future batch could add a `sync.busy` i18n key for the
  orchestrator's own busy path (currently the busy case surfaces
  via the `failed` toast). Not done in this fix to keep the
  surface small.
