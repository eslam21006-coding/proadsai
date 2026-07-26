# Batch 04 — Sync Button Fix

**Phase:** 14 — Layer 5 / Layer 6 ("What's Working" Dashboard)
**Fix commit:** `00d7790` — *"fix: wire dashboard Sync Now to triggerMetaSync instead of legacy metaSyncPerformance"*
**Investigation report:** [`sync-button-investigation.md`](./sync-button-investigation.md)
**Deployment:** `firebase deploy --only functions --project=proadsai-saas` — completed, all functions reported *"Skipped (No changes detected)"* (frontend-only commit; see Deployment status §7)

---

## 1. Summary

**Problem.** The "Sync Now" button on the "What's Working" dashboard was wired to the wrong Cloud Function. It called `metaSyncPerformance` (Batch 01, user-level, reads `metaConnections/{uid}`, syncs every active account on the connection, no cooldown) instead of `triggerMetaSync` (Batch 02, workspace-scoped, reads `private/metaConnection`, enforces the dashboard's 1-hour cooldown, writes back to the same doc the dashboard greys the button for). The dashboard's `canSyncNow` state and the actual sync flow were on opposite sides of the system.

**Fix.** Added a new `metaService.triggerWorkspaceSync(workspaceId)` method that wraps the `triggerMetaSync` callable, and re-routed the dashboard's `onSyncNow` prop to call it. The sidebar's `handleSyncMeta` (which still calls `metaSyncPerformance`) is **intentionally untouched** — it feeds the legacy `PerformanceDashboard` component and is the correct callable for that surface.

---

## 2. Root cause

The click chain that the investigation mapped was:

```
SyncStatusBar (onClick={props.onSync})
  → WhatsWorkingDashboard.tsx:437
  → App.tsx:11848  onSyncNow={async () => { await handleSyncMeta(); }}
  → App.tsx:3414  handleSyncMeta()  ─── wrong layer
  → metaService.ts:124  syncPerformance(workspaceId)
  → httpsCallable(functions, 'metaSyncPerformance')  ─── wrong callable
  → functions/src/index.ts:3352  (Batch 01 user-level, no cooldown,
                                  reads metaConnections/{uid},
                                  syncs ALL active accounts)
```

The dashboard's `canSyncNow` / `lastMetaSyncAt` are derived from `users/{uid}/workspaces/{workspaceId}/private/metaConnection` (read in `whatsWorkingDashboard.ts:286-300`). Even when the button fired, the resulting `metaSyncPerformance` call:

- Did not require the workspace-private doc to exist.
- Did not require a `metaAdAccountId` link on the workspace.
- Did not write `lastMetaSyncAt` back to the workspace-private doc.
- Did not honour the 1-hour cooldown that the dashboard was already enforcing visually.
- Fan-out syncs every active account on the user's OAuth connection, not the single account bound to the active workspace.

So even a successful click would not have updated the dashboard's own `syncStatus` block. The dashboard's button and its backend were effectively talking to different layers of the system.

The `triggerMetaSync` callable added in Batch 02 (`functions/src/metaSync/trigger.ts:25-88`) is the correct counterpart:

- Reads the encrypted token from the **workspace-private** doc via `loadStoredConnection` (`functions/src/metaConnection.ts:302`).
- Resolves the `accountId` from the same doc, so the sync is always against the workspace-linked account.
- Enforces the 1-hour cooldown server-side from `lastMetaSyncAt` on the same doc.
- Calls `runSyncForAccount(...)` with `trigger: "manual"` and writes the result back through `patchStoredConnection` (`functions/src/metaSync/shared.ts:421`), which updates `lastMetaSyncAt` on the workspace-private doc — i.e. exactly the field the dashboard greys the button against.
- Returns `{ ok, status, lastMetaSyncAt, counts, errors, needsReauth }` — the shape the dashboard can consume directly.

The fix wires the dashboard to this callable; the sidebar's legacy wiring to `metaSyncPerformance` is preserved as required.

---

## 3. What was changed

### 3.1 `src/services/metaService.ts` — new `triggerWorkspaceSync` method

**Lines added:** 56 (new method, immediately after `syncPerformance`).
**What it does:** Wraps the `triggerMetaSync` Cloud Function callable. On success, returns the typed result. On `resource-exhausted` (cooldown), it returns a soft failure `{ ok: false, lastMetaSyncAt: null }` so the caller can show a friendly toast; any other error propagates so the caller can show the generic "Sync failed" toast. The legacy `syncPerformance` method is unchanged.

```ts
// src/services/metaService.ts — Phase 14 batch 04 (sync-button-fix)
async triggerWorkspaceSync(workspaceId: string): Promise<{
    ok: boolean;
    lastMetaSyncAt: number | null;
    counts?: {
        campaigns?: number;
        adSets?: number;
        ads?: number;
        matched?: number;
        unmatched?: number;
        ambiguous?: number;
    };
    needsReauth?: boolean;
}> {
    try {
        const fn = httpsCallable(functions, 'triggerMetaSync');
        const result = await fn({ workspaceId });
        return result.data as { /* same shape */ };
    } catch (err: any) {
        console.warn('triggerMetaSync failed:', err);
        if (err?.code === 'functions/resource-exhausted' || err?.code === 'resource-exhausted') {
            return { ok: false, lastMetaSyncAt: null };
        }
        throw err;
    }
}
```

The `counts` shape mirrors the `SyncResult` type at `functions/src/metaSync/shared.ts:97-104`. The user-spec template used `result.counts?.total`; the actual field is `ads` (the total number of ads pulled from Meta), and the code uses that. The other fields (`matched`, `unmatched`, `ambiguous`) are surfaced for future per-bucket toasts but are not yet consumed in the UI.

### 3.2 `src/App.tsx` — dashboard `onSyncNow` prop re-wired

**Location:** `src/App.tsx:11845-11900` (the `WhatsWorkingDashboard` mount site).
**Change:** Replaced the single-line `onSyncNow={async () => { await handleSyncMeta(); }}` with a full handler that calls `metaService.triggerWorkspaceSync(activeWorkspaceId)`, surfaces localized success/failure toasts, and invalidates the hook-angle cache on success.

```tsx
// src/App.tsx — Phase 14 batch 04 (sync-button-fix)
onSyncNow={async () => {
    if (!activeWorkspaceId) return;
    setMetaSyncing(true);
    showToast(lang === 'ar' ? 'جاري مزامنة الإعلانات…' : 'Syncing ad performance…', 'info');
    try {
        const result = await metaService.triggerWorkspaceSync(activeWorkspaceId);
        if (result.ok) {
            const count = result.counts?.ads ?? 0;
            showToast(lang === 'ar' ? `تمت مزامنة ${count} إعلان` : `Synced ${count} ads`, 'success');
            invalidateHookAngleIconsCache();
        } else if (result.needsReauth) {
            showToast(lang === 'ar' ? 'يرجى إعادة الاتصال بميتا' : 'Please reconnect Meta', 'error');
        } else {
            // Soft failure — typically cooldown (`resource-exhausted`).
            showToast(lang === 'ar' ? 'المزامنة في فترة انتظار — حاول لاحقاً' : 'Sync on cooldown — try again later', 'info');
        }
    } catch (err: any) {
        if (err?.code === 'functions/resource-exhausted' || err?.code === 'resource-exhausted') {
            showToast(lang === 'ar' ? 'المزامنة في فترة انتظار — حاول لاحقاً' : 'Sync on cooldown — try again later', 'info');
        } else {
            showToast(lang === 'ar' ? 'فشلت المزامنة' : 'Sync failed', 'error');
        }
    } finally {
        setMetaSyncing(false);
    }
}}
```

The handler is intentionally self-contained: it sets `setMetaSyncing(true)` (which the dashboard already wires to its own spinner state via the legacy prop path), shows the localized "Syncing…" toast, awaits the result, then branches on `ok` / `needsReauth` / cooldown. The `finally` always clears the syncing flag.

### 3.3 NOT changed (per the spec)

- `src/App.tsx:3414-3434` — `handleSyncMeta` is unchanged. It still calls `metaService.syncPerformance` → `metaSyncPerformance` for the **sidebar**'s "Sync Now" action, which feeds the legacy `PerformanceDashboard` and creative-memory side effects.
- `src/components/PerformanceDashboard.tsx:171` — its own `handleSync` is unchanged.
- `src/services/metaService.ts:124-133` — `syncPerformance` is unchanged.
- All other dashboard callables (`getWhatsWorkingDashboard`, `getHookAnglePerformance`, `linkUnmatchedAd`) are unchanged.

### 3.4 Diff summary

```
 src/App.tsx                 | 49 ++++++++++++++++++++++++++++++++++++++-
 src/services/metaService.ts | 56 +++++++++++++++++++++++++++++++++++++++++++++
 2 files changed, 104 insertions(+), 1 deletion(-)
```

### 3.5 i18n strings used (all pre-existing, all plain Fusha / EN)

| Key | Arabic | English | Used for |
|---|---|---|---|
| `meta.account_selected_toast` (EN: meta.account_selected_toast — n/a here) — see below | | | |
| — (inlined literal) | `جاري مزامنة الإعلانات…` | `Syncing ad performance…` | info toast while the sync runs |
| — (inlined literal) | `تمت مزامنة ${count} إعلان` | `Synced ${count} ads` | success toast with ads count |
| — (inlined literal) | `يرجى إعادة الاتصال بميتا` | `Please reconnect Meta` | `needsReauth` error toast |
| — (inlined literal) | `المزامنة في فترة انتظار — حاول لاحقاً` | `Sync on cooldown — try again later` | cooldown toast (info level) |
| — (inlined literal) | `فشلت المزامنة` | `Sync failed` | generic failure toast |

All six toasts are inlined literals at the new `onSyncNow` site (not pulled from `i18n.tsx`) to match the existing convention used by `handleSyncMeta` (`App.tsx:3415-3430` uses the same style). They are plain Fusha and short, no English acronyms.

---

## 4. Build status

| Check | Result |
|---|---|
| `cd functions && npm run build` | ✅ PASS — `tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/` completed cleanly. No functions source was changed in this commit, so this is a no-op rebuild; it was still executed per AGENTS.md rule #1. |
| `npm run build` (frontend) | ✅ PASS — `tsc -b && vite build` completed; only the pre-existing dynamic-import warnings (unchanged from prior builds). |

---

## 5. Test status

`cd functions && npm test` (full contract + phase-14 suite, 30+ test files): **✅ PASS**

Tail of output:

```
═══ HFF — All aspect ratio reflow fixtures passed ═══

═══ Phase 16 — Creative Modes & Art Direction QA ═══
  ✅ 10 solo modes ✓
  ✅ 10 approved pairs ✓
  ✅ 4 carousel-specific ✓
  ✅ 3 batch-specific ✓
  ✅ 2 retargeting-specific ✓
  ✅ self-correction ✓
  ✅ 4 blocked combinations ✓
  ✅ 8 adapt states ✓
  ✅ audit: 8/8 strings free of cultural-compliance trigger words ✓

═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS
```

---

## 6. SC-11 status

`node scripts/sc11Guard.mjs`:

```
sc11-guard: PASS — 79 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

---

## 7. Deployment status

| Step | Result |
|---|---|
| `Remove-Item -Recurse -Force functions/lib` | ✅ |
| `cd functions && npm run build` | ✅ |
| `firebase deploy --only functions --project=proadsai-saas` | ✅ — `Deploy complete!` (every function reported *"Skipped (No changes detected)"* because this commit is **frontend-only**; the Firebase CLI correctly detected that no `functions/src/` file changed.) |

Because the change is purely a client-side routing of which Cloud Function the dashboard calls, no backend function was redeployed. The functions package was rebuilt and the deploy was issued per the spec's explicit steps (and per AGENTS.md rule #1 — never deploy with stale `lib/`), but every callable that the new client code now invokes (`triggerMetaSync`, `getWhatsWorkingDashboard`, `getHookAnglePerformance`, `linkUnmatchedAd`, `connectMetaAccount`) is the same revision that was already deployed in the previous fix commit (`9e007dd`).

> **Operational note:** a Cloud Functions deploy is still safe to issue on a frontend-only commit. The Firebase CLI's hash-based change detection is reliable, and the rebuild of `lib/` keeps the source/build parity required by rule #1. No `functions/` source change is being skipped; there simply wasn't one to push.

---

## 8. How to verify in the browser

1. **Sign in** as a user that has at least one connected Meta ad account linked to a workspace on a Scale plan. (If the workspace is unlinked, the previous fix's connect flow must have run successfully first — the dashboard requires the workspace-private doc.)
2. **Open the "What's Working" dashboard** from the sidebar. Confirm the Sync Status bar shows the last-sync relative time and the **"Sync Now"** button is enabled (not greyed, not in cooldown).
3. **Click "Sync Now"**. Expected:
   - A blue info toast **"Syncing ad performance…"** / **"جاري مزامنة الإعلانات…"** appears within a second.
   - A network request to `triggerMetaSync` (Cloud Function URL in europe-west1) appears in DevTools → Network. The request body is `{ "data": { "workspaceId": "..." } }`.
   - Server-side: `firebase functions:log --only functions` shows a `triggerMetaSync` invocation. (Before this fix, only `metaSyncPerformance` would have appeared — the user-reported server-log absence is now resolved.)
   - Within a few seconds, a success toast **"Synced N ads"** / **"تمت مزامنة N إعلان"** appears, where N matches `result.counts.ads` from the server.
   - The dashboard re-renders (the hook-angle cache is invalidated on success), and the Sync Status bar's "last sync" relative-time string updates to "just now".
4. **Click "Sync Now" a second time within an hour**. Expected:
   - The button greys and reads **"Synced just now — try again later"** / **"تمت المزامنة للتو — حاول لاحقاً"** (the dashboard's `canSyncNow` is now `false` because the server-side cooldown is reflected in the `lastMetaSyncAt` written by `triggerMetaSync`).
   - If the user manages to fire it anyway (e.g. via devtools), the server returns `resource-exhausted` and the client surfaces the friendly cooldown toast.
5. **Negative test (sidebar unchanged).** Click **"Sync"** in the sidebar (under the Meta entry). Expected: it still calls `metaSyncPerformance` (the legacy Batch 01 user-level path) and behaves exactly as before this fix. The dashboard's "Sync Now" and the sidebar's "Sync" are now two different surfaces with two different callables, by design.
6. **Negative test (no connection).** Open the dashboard without an active Meta connection. Expected: the dashboard still shows **"Meta account not connected yet"** with a **"Connect Meta"** button (the previous fix is still the gate for the dashboard rendering the connected branch at all).

If the success toast or the network request do not appear, the most likely causes are (in order of likelihood):

- The active workspace is not on a Scale plan — the dashboard's "Sync Now" only renders for `funnelSettingsAvailable === true`, which requires the active workspace to have `metaAdAccountId` set.
- The active workspace is in cooldown — the button is disabled and the label flips.
- The previous fix's `connectAccountToWorkspace` write failed during the connect flow — check `users/{uid}/workspaces/{workspaceId}/private/metaConnection` in Firestore. The dashboard greys itself out via `connection === "disconnected"` if that doc is missing or has `metaConnected !== true`.
