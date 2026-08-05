# Investigation Report — Meta Connection Flow Bugs (3-8)

**Branch:** `fix/meta-pages-use-oauth-list`
**PR:** #63
**Date:** 2026-08-05

This report covers bugs 3-8. Bugs 1-2 (CodeRabbit findings) have known fixes
and are not investigated here.

---

## Bug 3 — Stale connection after Facebook app removal

### Status: Confirmed real bug. Two distinct gaps.

### Findings

**Gap 1 — Wrong callback type wired up.**

`functions/src/index.ts:6073` exposes `metaDataDeletion`. This is a **Data
Deletion Request** callback. Meta fires this ONLY when a user submits a
formal Data Deletion Request through Facebook's privacy flow (Settings →
Privacy → "Download or delete your information" → "Delete all data
provided to this app"). It is a deliberate, separate flow that requires
the user to type a confirmation code.

The user flow described in the bug report — "removes Pro Ads AI from
Facebook Business Integrations" — is a **different** Meta event. When a
user removes an app from Business Integrations (Settings → Business
Integrations → Remove), Meta POSTs to the app's **Deauthorize Callback
URL** (`signed_request` with `user_id` and `algorithm`). This callback
**does not exist** in the codebase:

```bash
$ grep -r "deauthorize\|deauth" functions/src/
(no matches)
```

Result: removing the app from Business Integrations fires no Meta
callback, leaves `metaConnections/{uid}` intact, and the app believes it
is still connected on the user's next visit.

**Gap 2 — No defensive token validation.**

Even without a callback, `getMetaConnection` (`index.ts:3336`) treats the
doc's existence as proof of connection. It never calls `GET /me` with the
stored token to verify the token is still accepted. A removed-app token
will be rejected by `GET /me`, but we never ask. The token has a 60-day
TTL so a long-stale connection can sit for up to two months before
`tokenExpiring: true` flags it; the user can still hit any sync endpoint
in the meantime and only see the failure inside the toast.

### Cloud Functions logs

I cannot query Cloud Functions logs from this environment. The user
should confirm with `firebase functions:log --only metaDataDeletion`
whether any invocations are present.

### Proposed fix

1. **Add `metaDeauthorize` onRequest** in `functions/src/index.ts` and
   register it as the Deauthorize Callback URL in the Meta App Dashboard
   (Facebook Login → Settings → Deauthorize Callback). Parse the same
   `signed_request`, look up the Firebase UID by Meta user id
   (currently we key by Firebase UID, so we must either store
   `metaUserId` on the connection doc OR iterate all `metaConnections`
   the way `metaDataDeletion` already does — iteration is acceptable
   given the collection size).
2. **Token health check on `getMetaConnection`:** call
   `GET https://graph.facebook.com/v22.0/me?access_token=<token>` and if
   it returns an error code `190` (invalid token) or `102` (session
   expired), delete the doc and return `{ connected: false }`. Cache
   the health result for 5 minutes to avoid hitting `/me` on every
   sidebar render. Token is encrypted so decryption happens inside the
   function — no client-side exposure.
3. **Update AGENTS.md** with a note that two Meta callbacks exist:
   Data Deletion (`metaDataDeletion`) and Deauthorize
   (`metaDeauthorize`).

### Files to change
- `functions/src/index.ts` — new `metaDeauthorize` export; optional
  health-check inside `getMetaConnection`.
- (Out of code) Meta App Dashboard config — set the Deauthorize URL.

---

## Bug 4 — Not all workspaces shown in Funnel Settings

### Status: Confirmed real bug. Intentional filter, wrong UX.

### Findings

The dropdown is built at `src/App.tsx:12562-12564`:

```tsx
availableWorkspaces={workspaces
  .filter(w => !w.deletedAt && !!w.metaAdAccountId)
  .map(w => ({ id: w.id, name: w.name, ... }))}
```

The filter `!!w.metaAdAccountId` **excludes** every workspace that does
not have a linked Meta ad account. The 3-of-5 workspace display matches
this exactly: 5 workspaces total, only 3 linked to Meta.

`FunnelSettingsForm` (`src/components/FunnelSettingsForm.tsx:323`)
suppresses the dropdown entirely when `availableWorkspaces.length <= 1`,
and the form's save path requires a non-null `selectedAccountId` —
so unlinked workspaces genuinely cannot save. The filter is correct for
correctness, but the user has no path to discover that or to link a new
workspace from this dropdown.

The Firestore query itself has no limit — `src/App.tsx:2634-2638` uses
`orderBy('createdAt', 'desc')` with no `limit()`. So the bug is purely a
filter, not a query limit.

### Proposed fix

**Recommended: show all workspaces in the dropdown with disabled state
for unlinked ones.** Keep the filter out of the parent; pass the full
list. Inside the form, render an unlinked workspace as a disabled
`<option>` with a " — link Meta first" suffix. This gives the user a
clear signal that those workspaces exist but require linking, while
still preventing accidental saves against unlinked accounts.

Alternative B (more invasive): drop the filter and add a "Link Meta
account" button next to unlinked entries in the dropdown. Out of scope
for this PR — would require wiring the existing `MetaAccountPickerModal`
into the form, which is a separate feature.

### Files to change
- `src/App.tsx:12562` — drop the `!!w.metaAdAccountId` filter.
- `src/components/FunnelSettingsForm.tsx:453-479` — disable unlinked
  options in the dropdown render.

---

## Bug 5 — Ad account still auto-selected after reconnect

### Status: Source is correct. Most likely cause is stale `functions/lib/`.

### Findings

`metaOAuthCallback` at `functions/src/index.ts:3308` uses
`.collection("metaConnections").doc(state).set({ ... })` with no
`{ merge: true }`. The `set()` writes the entire doc, including
`selectedAccountId: null` at line 3317. After a fresh reconnect the doc
must contain `selectedAccountId: null`.

The single-account fast path in `handleConnectMeta`
(`src/App.tsx:3908-3914`) **does** auto-select after a reconnect when
the user has exactly one ad account — that is intentional (no picker
needed if there is nothing to pick). But it writes the id via
`metaService.selectAccount` → `metaSelectAccount`, so the doc ends with
`selectedAccountId` set again. For multi-account users, the picker is
opened and `selectedAccountId` stays null until they choose.

So if a multi-account user is seeing "Currently selected" after a
reconnect, the most likely cause is one of:

1. **Stale `lib/`.** Per `AGENTS.md` rule #1, the compiled
   `functions/lib/` directory is what Firebase actually deploys. If a
   prior deploy was made before the `selectedAccountId: null` change
   landed (commit `0562561` "feat: stop auto-picking ad account + enrich
   Page picker fields" on this branch), the production callable still
   has the old code that auto-picks `adAccounts[0].id` and writes it
   on reconnect. **Rebuild + redeploy functions** is the fix.
2. **Firestore cache.** A subsequent reconnect would overwrite with the
   new (null) value, so a one-time cache issue is unlikely to persist
   past a page reload. But if the user has multiple tabs/devices open,
   the stale tab can re-write `selectedAccountId` from the local state.

I cannot verify option (1) from this environment. Recommended action:
   1. Rebuild: `Remove-Item -Recurse -Force functions/lib; cd functions && npm run build`
   2. Deploy: `firebase deploy --only functions`
   3. Confirm the deployed source matches by reading the source-map
      output of the deployed function OR by checking the
      Cloud Functions console for the latest source revision.
   4. Reproduce in staging: reconnect a multi-account user, observe
      `metaConnections/{uid}` in the Firestore emulator.

### No code change required for Bug 5

The source is correct. The fix is the deploy step. (AGENTS.md rule #1
already covers this.)

### Files to change
- None in source. Deploy script only.

---

## Bug 6 — Changing ad account is slow / requires refresh

### Status: Partial bug. Real delay via WorkspaceSettingsModal path; picker path is fast.

### Findings

Two entry points exist for changing the active Meta ad account:

**Path A — `MetaAccountPickerModal` (sidebar "Change Account"):**

`handleMetaAccountSelect` (`src/App.tsx:3772-3851`) executes:
1. `await metaService.selectAccount(accountId)` — server write of
   `selectedAccountId`.
2. If workspace plan, `await workspaceService.linkMetaAccountToWorkspace(...)`
   and `await metaService.connectAccountToWorkspace(...)`.
3. `setWorkspacesLocal(...)` — immediate local update of
   `workspaces[i].metaAdAccountId`.
4. `await refreshMetaConnection()` — server read, `setMetaConnection`.
5. `showToast(...)` + `setShowMetaAccountPicker(false)`.

This path is correct and synchronous — `refreshMetaConnection` happens
**before** the picker closes, so by the time the user sees the post-
pick state, `metaConnection.selectedAccountId` is the new value and the
sidebar sub-label updates immediately. No fix needed.

**Path B — `WorkspaceSettingsModal` (per-workspace linking):**

`WorkspaceSettingsModal.handleLinkMeta`
(`src/components/WorkspaceSettingsModal.tsx:149-192`) writes via
`workspaceService.linkMetaAccountToWorkspace`, then calls
`metaService.connectAccountToWorkspace` for the workspace-private doc,
then updates **only its local component state** (`setLinkedMeta(...)`).

The parent (`App.tsx`) has no callback from the modal about the new
`metaAdAccountId`. The App state only updates when the Firestore
snapshot listener (line 2588-2776) fires, which is async and can take
several hundred ms. During that window:
- `activeWorkspace?.metaAdAccountId` is stale.
- `funnelSettingsAvailable` is false.
- The "Funnel Settings" menu entry may be hidden.
- The "Sync" entry under Meta may target the wrong account.

This matches the user's report.

### Proposed fix

Add an optional callback to `WorkspaceSettingsModal` so the parent can
patch the local workspace list immediately. The `handleUpdateWorkspace`
already exists at `src/App.tsx:2842` and does `setWorkspacesLocal(prev =>
prev.map(w => w.id === editingWorkspace.id ? { ...w, ...data } : w))`.
Extending that or adding a sibling `onMetaLinkChanged` would close the
gap without re-introducing the old direct-write path that AGENTS.md
rule #6 forbids.

Cleanest shape: add `onMetaLinkChanged?: (workspaceId: string,
accountId: string, accountName: string) => void` to
`WorkspaceSettingsModalProps`. Call it inside `handleLinkMeta` after the
server write succeeds. App.tsx wires it to a small callback that does
the same `setWorkspacesLocal` patch as `handleMetaAccountSelect` does.

### Files to change
- `src/components/WorkspaceSettingsModal.tsx` — new prop + invocation.
- `src/App.tsx` — wire the new prop at the modal call site
  (~line 12682).

---

## Bug 7 — Not all pages shown in Page picker

### Status: Confirmed real bug. Missing `&limit=` on the Graph API call.

### Findings

`metaOAuthCallback` at `functions/src/index.ts:3282-3287`:

```ts
const pagesResponse = await fetch(
  `https://graph.facebook.com/v22.0/me/accounts?` +
  `fields=id,name,picture{url},fan_count,category&` +
  `access_token=${longLivedToken}`
);
```

No `&limit=` parameter. Meta's default page size for `/me/accounts` is
**25**, and there is no auto-pagination — `pagesData.paging.next` is
present but is never followed. A user with 40 pages sees only the first
25.

There is no client-side pagination in `MetaPagePickerModal` either — it
renders `pages.map(...)` against whatever the connection doc has. The
doc stores only the first 25 pages forever; reconnecting rewrites them
with the same 25.

### Proposed fix

Add `&limit=100` to the Graph API call. Meta's max for `/me/accounts`
is effectively unbounded via `limit`, but 100 is a safe single-call cap
for normal users (most advertisers have < 50 pages; the rare larger
account is an acceptable edge case for now). Document the trade-off in a
comment.

If a user hits > 100 pages later, the next iteration can add a follow-up
fetch on `pagesData.paging.next` with the same field set — but that
needs a write strategy because the OAuth callback is single-response.

### Files to change
- `functions/src/index.ts:3283-3287` — add `&limit=100`.

---

## Bug 8 — No way to change Page or Ad Account after selection

### Status: Confirmed real bug. Page picker is unreachable post-selection.

### Findings

The sidebar Meta block (`src/App.tsx:1444-1504`) renders:

```text
[M] Meta Ads Connected       <- sub-label: selected account name
    Sync Now
    Change Account
    Disconnect
```

`metaConnection?.selectedPageName` is available but is **never read** by
the sidebar. The "Change Page" menu entry does not exist. The
`MetaPagePickerModal` (`src/components/MetaPagePickerModal.tsx`) is
mounted and wired (`src/App.tsx:12717-12728`) but is only opened
automatically as step 2 of the OAuth flow — there is no user-facing
trigger to reopen it.

The page picker is wired correctly: it accepts the same `metaConnection`
state, `onSelect` calls `handleMetaPageSelect` which already supports
`{ skipPicker: true }` for the silent path. The missing piece is the
trigger.

### Proposed fix

1. **Add `openMetaPagePicker` callback** in App.tsx that does:
   ```ts
   if (!metaConnection?.connected) return;
   if ((metaConnection.pages ?? []).length === 0) return;
   setMetaPagePickerError(null);
   setShowMetaPagePicker(true);
   ```
2. **Render page info in the sidebar.** Two options:
   - (a) Add a second `MenuItem` under the Meta block with the page
     name as the label and `t('topbar.menu_meta_change_page')` as a
     small "Change" link on the right.
   - (b) Extend the existing "Meta Ads Connected" `MenuItem` to show
     both ad-account and page as two sub-lines.
3. **Wire the new entry** into both the desktop `MenuSidebar` and the
   mobile overlay `MenuItems` list.
4. **Add i18n keys** `topbar.menu_meta_change_page` (en/ar) and
   `topbar.menu_meta_page_label` for "Page:" prefix.

### Files to change
- `src/App.tsx` — new `openMetaPagePicker` callback (~line 3863);
  new menu items (~line 1501-1503); pass through to MenuItems props.
- `src/i18n.tsx` — two new keys in en + ar blocks.

---

## Summary — Code change footprint

| Bug  | Source-of-truth file                          | Severity |
|------|-----------------------------------------------|----------|
| 3    | `functions/src/index.ts` (new endpoint + opt. health check) | High |
| 4    | `src/App.tsx:12562` + `FunnelSettingsForm.tsx:453` | Medium |
| 5    | Deploy only (rebuild + push `functions/lib/`) | High |
| 6    | `WorkspaceSettingsModal.tsx` + `src/App.tsx` | Medium |
| 7    | `functions/src/index.ts:3283` (one parameter) | Low |
| 8    | `src/App.tsx` (new cb + menu items) + `i18n.tsx` | Medium |

Total estimated edits: ~6 files, ~120 LOC, 2 new i18n strings (×2 langs).

---

## Status — historical investigation (read-only)

This report documents the investigation performed for bugs 3–8 on
2026-08-05 prior to the PR #63 implementation pass.

**Implemented in PR #63:** Bugs 1, 2, 5 (verified-only), 7, 8.

**Deferred to a follow-up PR:** Bugs 3, 4, 6 — see the "Summary — Code
change footprint" table above for the per-bug file list. Bug 5's deploy
step is the only post-merge action; everything else ships with this PR.
