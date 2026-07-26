# Batch 04 — Dashboard Connection Fix

**Phase:** 14 — Layer 5 / Layer 6 ("What's Working" Dashboard)
**Fix commit:** `9e007dd` — *"fix: call connectMetaAccount after account selection so dashboard sees the connection"*
**Investigation report:** [`dashboard-connection-investigation.md`](./dashboard-connection-investigation.md)
**Deployment:** `firebase deploy --only functions --project=proadsai-saas` — successful

---

## 1. Summary

**Problem.** The "What's Working" dashboard permanently showed **"Meta account not connected yet"** even after a user connected Meta from the sidebar (where the same user saw **"Meta Ads Connected"**).

**Root cause (one-liner).** The dashboard reads connection state from the **workspace-private** doc at `users/{uid}/workspaces/{workspaceId}/private/metaConnection.metaConnected`, but the sidebar's connect flow only writes to the **user-level** doc at `metaConnections/{uid}` and to the **workspace doc** at `users/{uid}/workspaces/{workspaceId}.metaAdAccountId`. Nobody ever called the `connectMetaAccount` server callable during the sidebar flow, so the workspace-private doc was never created.

**Fix.** Added a non-blocking call to the `connectMetaAccount` Cloud Function immediately after every successful `linkMetaAccountToWorkspace` call on the frontend. The new call writes `metaConnected: true` to the workspace-private doc that the dashboard reads.

---

## 2. Root cause — which paths were mismatched

The investigation identified three "is Meta connected" signals in the system, each on a different doc:

| Layer | Doc path | "Connected" field | Read by | Written by sidebar's connect? |
|---|---|---|---|---|
| **A. User-level OAuth** | `metaConnections/{uid}` | doc existence → `getMetaConnection` returns `connected: true` | Sidebar (`App.tsx:1431`) via `getMetaConnection` (`functions/src/index.ts:3299`) | ✅ Yes — Meta OAuth callback (`functions/src/index.ts:3271`) |
| **B. Workspace-private** | `users/{uid}/workspaces/{workspaceId}/private/metaConnection` | `metaConnected: true` | **Dashboard** (`functions/src/whatsWorkingDashboard.ts:287, 291`) | ❌ **No — only `connectMetaAccount` writes here, and the sidebar never called it** |
| **C. Workspace doc** | `users/{uid}/workspaces/{workspaceId}` | `metaAdAccountId: string` | `funnelSettingsAvailable` gate (`src/App.tsx:3401`); `loadMetaConnectionAccountId` (`functions/src/funnelSettings.ts:78-97`) | ✅ Yes — `linkMetaAccountToWorkspace` (`functions/src/index.ts:6434`) |

**The dashboard was correctly reading layer B. The bug was that no UI flow wrote to layer B during the normal "connect from sidebar" experience.** The recent fix in commit `ee744ac` (removing the `metaConnection/metaConnection` duplicate path segment) was correct and necessary, but it only aligned the dashboard's read path with `connectMetaAccount`'s write path — it did not address the missing caller for `connectMetaAccount` from the sidebar.

After the fix in this commit, every call to `linkMetaAccountToWorkspace` is followed by a call to `connectMetaAccount`, so layer B is populated as a side-effect of the existing connect flow.

---

## 3. What was changed

### 3.1 `src/services/metaService.ts` — new `connectAccountToWorkspace` method

**Lines added:** 28 (after `selectAccount`).
**What it does:** Wraps the `connectMetaAccount` Cloud Function callable, mirroring the existing `selectAccount` / `disconnect` pattern in the same service. Returns `boolean` (success / failure) so callers can treat failure as non-blocking.

```ts
// src/services/metaService.ts — Phase 14 batch 04 (dashboard-connection-fix)
async connectAccountToWorkspace(req: {
    workspaceId: string;
    accountId: string;
    accountName?: string;
}): Promise<boolean> {
    try {
        const fn = httpsCallable(functions, 'connectMetaAccount');
        await fn({
            workspaceId: req.workspaceId,
            accountId: req.accountId,
            accountName: req.accountName ?? '',
        });
        return true;
    } catch (err) {
        console.warn('Failed to write workspace-private meta connection doc (non-blocking):', err);
        return false;
    }
}
```

### 3.2 `src/App.tsx` — `handleMetaAccountSelect` (sidebar / picker flow)

**Location:** `src/App.tsx:3258-3309`.
**Change:** After `workspaceService.linkMetaAccountToWorkspace(...)` succeeds (line 3274), added a non-blocking call to `metaService.connectAccountToWorkspace(...)`. The call lives inside the existing `if (canUseWorkspaces && activeWorkspaceId)` guard so it only fires on workspace plans (where the dashboard is even rendered).

```ts
// src/App.tsx — after linkMetaAccountToWorkspace succeeds (line ~3279)
await metaService.connectAccountToWorkspace({
    workspaceId: activeWorkspaceId,
    accountId,
    accountName: account?.name || accountId,
});
```

This covers both the **single-account auto-pick** path (`handleConnectMeta` → `handleMetaAccountSelect({ skipPicker: true })`) and the **multi-account picker** path (user explicitly picks an account from the modal).

### 3.3 `src/components/WorkspaceSettingsModal.tsx` — `handleLinkMeta` (workspace settings flow)

**Location:** `src/components/WorkspaceSettingsModal.tsx:128-154`.
**Change:** Imported `metaService` and added the same `connectAccountToWorkspace` call after the `linkMetaAccountToWorkspace` success. This covers the third entry point — the "Link Meta account" action inside the Workspace Settings modal.

```ts
// src/components/WorkspaceSettingsModal.tsx — after linkMetaAccountToWorkspace succeeds
await metaService.connectAccountToWorkspace({
    workspaceId: workspace.id,
    accountId: selectedMetaAccount,
    accountName: account?.name || selectedMetaAccount,
});
```

### 3.4 Diff summary

```
 src/App.tsx                               | 12 ++++++++++++
 src/components/WorkspaceSettingsModal.tsx | 12 ++++++++++++
 src/services/metaService.ts               | 28 ++++++++++++++++++++++++++++
 3 files changed, 52 insertions(+)
```

### 3.5 Design decisions

- **Non-blocking on failure.** The new `connectAccountToWorkspace` is intentionally not wrapped in a try/catch that surfaces to the user. The sidebar already shows "Meta Ads Connected" from layer A; the dashboard simply falls back to its existing "Meta account not connected yet" message until the next successful call. This matches the project rule *"Convert hard validation blocks into warnings"* (AGENTS.md §4) and the user's spec for this fix.
- **No new i18n strings.** Failure surfaces only as a `console.warn`. Users never see a regression on the sidebar.
- **No backend changes.** The existing `connectMetaAccount` Cloud Function is the right writer; the bug was the missing caller, not a missing server path.
- **No Firestore schema change.** The new writes use the same `private/metaConnection` doc that the function already authors.

---

## 4. Build status

| Check | Result |
|---|---|
| `cd functions && npm run build` | ✅ PASS — `tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/` completed with no diagnostics. (No functions source changed; the rebuild was performed to keep `lib/` consistent with `src/` per the AGENTS.md rule #1.) |
| `npm run build` (frontend) | ✅ PASS — `tsc -b && vite build` completed; only pre-existing dynamic-import warnings (unrelated to this change). |

---

## 5. Test status

`npm test` (full contract + phase-14 suite, 30+ test files): **✅ PASS**

Highlights from the last 100 lines of output:

```
═══ US5 — All scoring fixtures passed ═══
═══ HFF — All aspect ratio reflow fixtures passed ═══
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══
contractFixtures.test: PASS
```

The test command is `npm run build && node lib/__tests__/…test.js && …` — it builds the functions first, then runs every test file. All passed, including the `expressionMap` and `dashboard` contract fixtures.

---

## 6. SC-11 status

`node scripts/sc11Guard.mjs` (Arabic-script-character ratio check, the AGENTS.md rule #3 enforcement):

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
| `firebase deploy --only functions --project=proadsai-saas` | ✅ — `Deploy complete!` |

Deployed functions include `connectMetaAccount`, `linkMetaAccountToWorkspace`, `getWhatsWorkingDashboard`, and `getMetaConnection`. The deploy was a full `functions` deploy (no function-level filter), so the dashboard callable and all its dependencies were redeployed together with the rest of the suite. This is harmless for the new client-side change (the new client behaviour will only call the existing `connectMetaAccount` callable), and matches the AGENTS.md rule #1 "never deploy with stale `lib/` files."

No hosting or rules changes — those were not affected by this fix.

---

## 8. How to verify in the browser

1. **Sign in** as a user that has at least one connected Meta ad account (or run the OAuth flow from the sidebar to connect one).
2. **Open the sidebar menu** and click the **Meta** entry. Confirm it shows **"Meta Ads Connected"** (this was already working before the fix).
3. **Active workspace must be a workspace plan** (`canUseWorkspaces === true`) — the connectMetaAccount call only fires inside that branch.
4. Click **"Change Account"** (or **"Select ad account for this workspace"** if the workspace is unlinked) to open the account picker. Pick an ad account. Wait for the "Ad account selected" toast.
5. **Open the "What's Working" dashboard** from the sidebar.
   - **Before fix:** the Sync Status bar shows **"Meta account not connected yet"** with a "Connect Meta" button.
   - **After fix:** the Sync Status bar shows the normal connected state (the last sync time, a "Sync" button, etc.) — no "not connected" message.
6. **Negative test (regression check).** Sign in as a user who has never connected Meta. Open the dashboard. It should still show **"Meta account not connected yet"** (the dashboard still correctly reports the unconnected state when the workspace-private doc is absent).
7. **Firestore console check** (optional, for engineering):
   - Open `users/{uid}/workspaces/{workspaceId}/private/metaConnection` for the workspace you linked in step 4.
   - Confirm `metaConnected === true` and that `accountId`, `accountName`, `lastMetaSyncAt`, and `legacyToken` are populated.
8. **Disconnect → reconnect loop.** Click **"Disconnect"** in the sidebar. Confirm `metaConnected` flips to `false`. Reconnect and pick an account again. Confirm `metaConnected` flips back to `true` and the dashboard updates.

If any of those steps fail, the most likely cause is the `connectMetaAccount` callable rejecting the request — check the Cloud Function logs (`firebase functions:log --only functions`) for an `HttpsError` from the `connectMetaAccount` handler. The handler enforces FR-026 (1:1 link), so the most common cause of a runtime failure would be a workspace already linked to a *different* account (the handler returns `failed-precondition` with a plain-Arabic reason in that case).
