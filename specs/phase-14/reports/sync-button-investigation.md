# Sync Now Button Investigation

**Status:** Investigation only — no fix proposed in this document.
**Symptom:** The "SYNC NOW" button on the "What's Working" dashboard does nothing when clicked. No network request fires, no toast appears, no console error. The `triggerMetaSync` Cloud Function was never called (confirmed via server logs).
**Scope:** Map the click chain from the button element down to the Cloud Function call, identify the disable / disabled / silent-return conditions, and document what each layer actually does.

---

## 1. Button element — exact code

**File:** `src/components/WhatsWorkingDashboard.tsx`

The button lives inside the `SyncStatusBar` subcomponent. It is the **only** button rendered in the `connected` branch. The `needs_reauth` and `disconnected` branches render different buttons (reconnect / connect) that don't say "SYNC NOW".

**Lines 155–181:**

```tsx
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
            disabled={!status.canSyncNow}
            className={`text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition-colors ${
                status.canSyncNow
                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
        >
            {status.canSyncNow
                ? t("whats_working.sync.cta")
                : t("whats_working.sync.cooldown")}
        </button>
    </div>
);
```

- **Line 168:** `onClick={props.onSync}` — direct function reference, no wrapping, no `preventDefault`.
- **Line 169:** `disabled={!status.canSyncNow}` — the only thing that can prevent the click handler from firing. The `disabled` styling is subtle (`bg-slate-800 text-slate-500 cursor-not-allowed`); the cursor does change on hover but the button remains in the layout and still receives click events when not actually disabled.
- **Lines 170–174:** label is `t("whats_working.sync.cta")` = **"Sync Now"** when `canSyncNow === true`; otherwise `t("whats_working.sync.cooldown")` = **"Synced just now — try again later"** (`src/i18n.tsx:440-441`).

---

## 2. `props.onSync` — where it's bound

**File:** `src/components/WhatsWorkingDashboard.tsx`

**Lines 433–440:**

```tsx
return (
    <div className="space-y-6">
        <SyncStatusBar
            status={data.syncStatus}
            onSync={() => { void props.onSyncNow(); }}
            onReconnect={props.onReconnect}
            onConnect={props.onConnect}
        />
```

- The arrow is recreated on every render of `WhatsWorkingDashboard` (no `useCallback`).
- It calls `props.onSyncNow()` and discards the returned `Promise<void>` with `void`.
- `void` does **not** swallow a synchronous throw. A `TypeError: props.onSyncNow is not a function` would surface in the console. The user reports no console error, so `props.onSyncNow` is defined.

---

## 3. `props.onSyncNow` — the prop passed in from `App.tsx`

**File:** `src/App.tsx`

**Lines 11845–11858** (the dashboard mount site):

```tsx
<WhatsWorkingDashboard
  workspaceId={activeWorkspaceId}
  accountId={activeMetaAccountId}
  onSyncNow={async () => { await handleSyncMeta(); }}
  onReconnect={() => { void handleConnectMeta(); }}
  onConnect={() => { void handleConnectMeta(); }}
  onLinkAd={(ad) => {
    setLinkPickerAd({ adId: ad.adId, adName: ad.adName });
  }}
  onClose={() => setShowWhatsWorking(false)}
/>
```

- **Line 11848:** `onSyncNow={async () => { await handleSyncMeta(); }}` — `async` arrow that `await`s `handleSyncMeta()`.
- This is the ONLY call site for `handleSyncMeta` from the dashboard. There is no other wiring to `triggerMetaSync` from the dashboard.
- The arrow captures `handleSyncMeta` (a `useCallback` at `App.tsx:3414`) and is recreated on every render.

---

## 4. `handleSyncMeta` — the actual handler

**File:** `src/App.tsx`

**Lines 3412–3434:**

```tsx
// Phase 14 batch 01 — UI wiring. Triggers a Meta performance sync for the
// currently active workspace.
const handleSyncMeta = useCallback(async () => {
    setMetaSyncing(true);
    showToast(lang === 'ar' ? 'جاري مزامنة الإعلانات…' : 'Syncing ad performance…', 'info');
    try {
      const result = await metaService.syncPerformance(canUseWorkspaces ? activeWorkspaceId : null);
      if (result.success) {
        showToast(lang === 'ar' ? `تمت مزامنة ${result.adsSynced} إعلان` : `Synced ${result.adsSynced} ads`, 'success');
        await refreshMetaConnection();
        await refreshMetaConnection();
        // Phase 14 batch 04 — invalidate the hook-angle cache so
        // the next dashboard mount re-fetches fresh icons + bestAngles.
        invalidateHookAngleIconsCache();
      } else {
        showToast(lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed', 'error');
      }
    } catch {
      showToast(lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed', 'error');
    } finally {
      setMetaSyncing(false);
    }
  }, [canUseWorkspaces, activeWorkspaceId, lang, showToast, refreshMetaConnection]);
```

**What it actually calls:** `metaService.syncPerformance(...)` — the **legacy Batch 01 user-level** callable `metaSyncPerformance` (NOT `triggerMetaSync`).

- The dashboard does **not** call `triggerMetaSync` (the Batch 02 workspace-scoped, cooldown-enforcing callable at `functions/src/metaSync/trigger.ts:25-88`).
- `workspaceId` is passed (when `canUseWorkspaces` is true); `accountId` is **not** passed to the callable at all.
- The `try` block catches everything and shows a localized toast — so a thrown error should not be silent.

---

## 5. `metaService.syncPerformance` — the client wrapper

**File:** `src/services/metaService.ts`

**Lines 124–133:**

```ts
async syncPerformance(workspaceId?: string | null): Promise<{ success: boolean; adsSynced: number }> {
    try {
        const fn = httpsCallable(functions, 'metaSyncPerformance');
        const result = await fn({ workspaceId: workspaceId || null });
        return result.data as { success: boolean; adsSynced: number };
    } catch (err) {
        console.error('Failed to sync performance:', err);
        return { success: false, adsSynced: 0 };
    }
}
```

- Callable name: **`'metaSyncPerformance'`** (legacy Batch 01 user-level function).
- On error: returns `{ success: false, adsSynced: 0 }` — the caller `handleSyncMeta` interprets that as a soft failure and shows the localized **"Sync failed"** toast. An exception here would never propagate to the console.

---

## 6. The two Cloud Functions that exist for sync

### 6.1 `metaSyncPerformance` (Batch 01 — what the dashboard actually calls)

**File:** `functions/src/index.ts`

**Line 3352:** `export const metaSyncPerformance = onCall({...})` (registered as a callable in europe-west1, requires `metaAppSecret`).

**Lines 3357–3402 (start of handler):**

```ts
export const metaSyncPerformance = onCall({
    region: "europe-west1",
    secrets: [metaAppSecret],
    timeoutSeconds: 120,
    cors: true,
}, async (request: CallableRequest) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
    const uid = request.auth.uid;
    const workspaceId = request.data?.workspaceId || null;

    // ... INSUFFICIENT-role check on the workspace doc ...

    const connDoc = await admin.firestore().collection("metaConnections").doc(uid).get();
    if (!connDoc.exists) throw new HttpsError("not-found", "No Meta connection found.");

    const conn = connDoc.data()!;
    // Determine which accounts to sync — all active accounts, not just selected
    const activeAccounts: { id: string; name: string }[] = (conn.adAccounts || [])
        .filter((a: any) => a.status === 1 || a.account_status === 1);
    if (activeAccounts.length === 0 && conn.selectedAccountId) {
      activeAccounts.push({ id: conn.selectedAccountId, name: "Selected Account" });
    }
    if (activeAccounts.length === 0) throw new HttpsError("failed-precondition", "No active ad accounts found.");
    // ... then runs a 30-day insights pull against the Meta Graph API ...
```

- Reads from the **user-level** `metaConnections/{uid}` doc (line 3390), NOT the workspace-private `private/metaConnection` doc the dashboard just learned to populate.
- Syncs every **active** ad account on the user's connection (line 3395–3400), not the one bound to the active workspace.
- Has **no cooldown**. (The dashboard greys the button based on `canSyncNow` from the workspace-private doc, but the function itself will accept a back-to-back call.)
- Uses the legacy AES-GCM decrypted `conn.encryptedToken` (line 3404), independent of the workspace-private doc.
- Was added in Phase 14 Batch 01 and predates the workspace-scoped model.

### 6.2 `triggerMetaSync` (Batch 02 — what server logs show was NEVER called)

**File:** `functions/src/metaSync/trigger.ts`

**Line 25:** `export const triggerMetaSync = onCall({...})` (registered in `SYNC_DISPATCH_REGION`, requires `metaAppSecret`).

**Lines 21–88 (handler):**

```ts
interface TriggerMetaSyncRequest {
    workspaceId: string;
}

export const triggerMetaSync = onCall(
    {
        region: SYNC_DISPATCH_REGION,
        cors: true,
        timeoutSeconds: 540,
        memory: "2GiB",
        secrets: [metaAppSecret],
    },
    async (request) => {
        if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
        const uid = request.auth.uid;
        const req = request.data as TriggerMetaSyncRequest;
        if (!req || typeof req.workspaceId !== "string") {
            throw new HttpsError("invalid-argument", "workspaceId is required.");
        }

        const conn = await loadStoredConnection(uid, req.workspaceId);
        if (!conn || !conn.accountId) {
            throw new HttpsError("failed-precondition", "No Meta account connected for this workspace.");
        }

        // 1-hour cooldown — measured against lastMetaSyncAt on the connection
        // doc (loadStoredConnection doesn't surface it, so re-fetch below).
        const lastSyncAt = await readLastSyncAt(uid, req.workspaceId);
        if (typeof lastSyncAt === "number") {
            const elapsed = Date.now() - lastSyncAt;
            if (elapsed < COOLDOWN_MS) {
                const remainingMs = COOLDOWN_MS - elapsed;
                throw new HttpsError(
                    "resource-exhausted",
                    `Sync cooldown active — try again in ${Math.ceil(remainingMs / 60_000)} minutes.`,
                );
            }
        }

        const result: SyncResult = await runSyncForAccount({
            userId: uid,
            workspaceId: req.workspaceId,
            accountId: conn.accountId,
            trigger: "manual",
            nowMs: Date.now(),
        });
        // ... returns ok/status/counts/needsReauth
    },
);
```

- Reads from the **workspace-private** `private/metaConnection` doc (via `loadStoredConnection` at `functions/src/metaConnection.ts:302-325`).
- Enforces the 1-hour server-side cooldown against `lastMetaSyncAt` on that doc.
- Returns the same shape the dashboard would consume (`ok`, `status`, `lastMetaSyncAt`, `counts`, `errors`, `needsReauth`).
- **Never called from the dashboard.** No call site to `triggerMetaSync` exists in any frontend code (`grep -r "triggerMetaSync" src` returns 0 matches).
- It IS called from the metaSync dispatcher (`functions/src/metaSync/dispatcher.ts`) for the scheduled daily sync path, but the user's server-log observation is consistent: nothing invokes it for the manual "Sync Now" click from the dashboard.

---

## 7. Disable / silent-return conditions (the "no toast, no network, no error" suspects)

Walking the chain from button to network, in order:

| # | Layer | File:line | Condition that could silently swallow the click | Symptom |
|---|---|---|---|---|
| 1 | `disabled` on the button | `WhatsWorkingDashboard.tsx:169` | `status.canSyncNow === false` (1-hour cooldown since last sync) | Button greys; no `onClick` fires; `cursor-not-allowed` on hover. Label changes to "Synced just now — try again later". |
| 2 | `props.onSync` is undefined | `WhatsWorkingDashboard.tsx:168` | `onSync` prop is not passed by parent | Would throw on click; console would show `TypeError: props.onSync is not a function`. Not this — user reports no console error. |
| 3 | `props.onSyncNow` is undefined | `WhatsWorkingDashboard.tsx:437` (inside the arrow body) | `onSyncNow` prop is not passed by `App.tsx` | Would throw `TypeError: props.onSyncNow is not a function`. Not this — user reports no console error. |
| 4 | `handleSyncMeta` throws before first `showToast` | `App.tsx:3415-3416` | `setMetaSyncing` or `showToast` reference is undefined | `setMetaSyncing` is a useState setter (cannot throw); `showToast` is a `useCallback` defined at `App.tsx:2202-2205` that calls `setToast`. Neither can throw on a healthy render. |
| 5 | `metaService.syncPerformance` is missing | `metaService.ts:126` | The class is not instantiated, or `functions` is undefined | Would throw on import. Build is green. Not this. |
| 6 | The `httpsCallable(functions, 'metaSyncPerformance')` call is rejected at SDK layer | `metaService.ts:126-128` | The function name is not registered (e.g., the deploy removed it) | Caught by the `try/catch` at line 125-132; returns `{ success: false }`. `handleSyncMeta` then takes the `else` branch and shows **"Sync failed"** toast. A network attempt is still made and visible in DevTools. |
| 7 | `metaSyncPerformance` itself returns `success: false` | `functions/src/index.ts:3352` | The Meta Graph API returns no insights, or the token decrypt fails | Returns `{ success: false, adsSynced: 0 }`. `handleSyncMeta` shows **"Sync failed"** toast. |

**None of (2)–(7) produces the "no toast, no network, no error" symptom the user describes.** Only #1 (button disabled by `!canSyncNow`) is consistent with the exact "no network, no toast, no error" signature. But the user explicitly identifies the button as "SYNC NOW" — the cooldown state would show a different label ("Synced just now — try again later"), making the disabled state visible.

The user-stated server-log observation ("`triggerMetaSync` was never called") is **true but is a separate, independent finding**: even if the click does reach the network, the dashboard wires to the wrong callable. The dashboard wires to the legacy `metaSyncPerformance`; the user's check is for the newer `triggerMetaSync`. So the missing `triggerMetaSync` call is a wiring problem, not the source of the "no network" symptom.

---

## 8. Prop / import wiring

The `onSyncNow` prop is passed **as a prop** from `App.tsx:11848` to `WhatsWorkingDashboard`, not imported. The dashboard component does **not** import `metaService` (only `httpsCallable` for `getWhatsWorkingDashboard` at `WhatsWorkingDashboard.tsx:395`). All Meta callables used by the sync flow are reached via the prop chain, not by direct import.

---

## 9. Silent error swallowing

| Site | Swallows errors? | Notes |
|---|---|---|
| `WhatsWorkingDashboard.tsx:168` (`onClick={props.onSync}`) | No | Pure dispatch. |
| `WhatsWorkingDashboard.tsx:437` (`onSync={() => { void props.onSyncNow(); }}`) | **Yes (partial)** — `void` discards the returned Promise. A rejected Promise from `onSyncNow` becomes an unhandled promise rejection, but in dev mode React would still log it. A **synchronous** throw would still surface to the browser console. |
| `App.tsx:3414-3434` (`handleSyncMeta`) | **Yes** — full `try/catch` around the body, with a localized error toast. Errors are never silent. |
| `metaService.ts:124-133` (`syncPerformance`) | **Yes** — full `try/catch` returns `{ success: false }`. The caller turns that into a toast. Errors are never silent at the UI layer. |

---

## 10. Summary of the click chain

```
[User click]
   │
   ▼
SyncStatusBar (WhatsWorkingDashboard.tsx:167-179)
   onClick={props.onSync}   ← if status.canSyncNow === false, button is disabled; click never fires
   │
   ▼
WhatsWorkingDashboard.tsx:437
   onSync={() => { void props.onSyncNow(); }}
   │
   ▼
App.tsx:11848
   onSyncNow={async () => { await handleSyncMeta(); }}
   │
   ▼
App.tsx:3414
   handleSyncMeta() → setMetaSyncing(true); showToast("Syncing ad performance…", "info");
   │
   ▼
metaService.ts:124
   metaService.syncPerformance(workspaceId)
   │
   ▼
httpsCallable(functions, 'metaSyncPerformance')({ workspaceId })
   │
   ▼
functions/src/index.ts:3352  (metaSyncPerformance — Batch 01 user-level, no cooldown,
                               reads metaConnections/{uid}, syncs ALL active accounts)
```

`triggerMetaSync` (Batch 02 workspace-scoped, cooldown-enforcing, reads `private/metaConnection`) exists at `functions/src/metaSync/trigger.ts:25` but is **not on this chain**. The dashboard's "Sync Now" → `metaSyncPerformance` wiring predates `triggerMetaSync` and was never updated.

---

## 11. Two distinct findings

1. **Click chain correctness.** The click chain is correctly wired in code; nothing throws silently. The only way to get the exact "no network, no toast, no error" signature is for the button to be `disabled={true}` (cooldown active). The user reports the button label is "SYNC NOW" — under the current i18n (`src/i18n.tsx:440-441`) that label maps to `canSyncNow === true`, in which case the button should be enabled. The disconnect between the user's reported label and the symptom is the part of this that the fix needs to address (e.g., a state where `canSyncNow` is `true` server-side but the server's `lastMetaSyncAt` is stale, or the click is being intercepted by an overlay above the modal).

2. **Wrong callable.** Independently of #1, the dashboard calls `metaSyncPerformance` (Batch 01 user-level), not `triggerMetaSync` (Batch 02 workspace-scoped, cooldown-enforcing, reads the workspace-private doc the dashboard's connect-fix just learned to write). The user's server-log check for `triggerMetaSync` is correct, but the click (if it ever fires) would never have invoked `triggerMetaSync` — it would have invoked `metaSyncPerformance`. Even after fixing #1, the sync would not flow through the function that enforces the same 1-hour cooldown the dashboard already greys the button for.

No code changes in this report. Next step (separate task) is to decide whether the fix targets the click-suppression (likely a cooldown / state / overlay issue) or the callable wiring, or both.
