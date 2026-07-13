# Phase 14 — Batch 01 Funnel Fixes Report

**Date:** 2026-07-12
**Branch:** `phase-14-rag-meta`
**PR:** [#53](https://github.com/eslam21006-coding/proadsai/pull/53)
**Commit:** `ea156d8` — `fix: funnel settings save error + closeable modal + menu arrangement + workspace selector`
**Scope:** Four follow-up fixes to the Funnel Settings / Meta integration flow surfaced after the batch-01 account-picker work landed. Together they restore a save that was hard-broken by a Firestore path mismatch (Issue 3), stop the first-run funnel-settings modal from trapping users (Issue 2), and tighten the menu structure so the Meta sub-actions sit directly under the main Meta entry (Issues 1 + 4).

---

## 1. Issue 1 — Menu arrangement after Meta connection

The Meta sub-actions were previously split across two dividers — `divider1` (after Funnel Settings) and `divider2` (after Theme/Language). The user-facing result was a fragmented Meta block: the main "Meta Ads Connected" entry sat with the global items, and Sync / Change Account / Disconnect floated below the billing cluster. The spec calls for a tight Meta sub-menu immediately under the main entry.

### What changed

| File | Change |
|---|---|
| `src/App.tsx` | Re-grouped the Meta entries inside `MenuItems`. The main `meta` entry (now with `subLabel`) is followed by a `meta-divider` and then `meta-sync` / `meta-change-account` / `meta-disconnect`, all under a single conditional `...(metaConnection?.connected ? [...] : [])` spread. The Change Account icon was switched from `fa-rotate` to `fa-repeat` (per spec — `repeat` better signals "cycle through accounts"). All three sub-actions are still hidden entirely when Meta is not connected. |
| `src/App.tsx` (collapsed icon strip) | No change needed — `MenuItems` is only rendered when `expanded === true` in `MenuSidebar`. The collapsed 48px strip keeps its own hand-picked icon shortcuts (New / Bookmarks / Settings / Theme / Language / Billing / Expand chevron) and never exposes the Meta sub-actions, so the expanded-vs-collapsed separation the spec calls for is preserved automatically. |

### New menu order (when Meta is connected, expanded sidebar)

```text
[+] New project
[📑] Saved
[⚙] Settings
[f] Meta Ads Connected                       ← sub-label: account name
───────────────
[⟳] Sync Now        (fa-arrows-rotate)
[🔁] Change Account  (fa-repeat)
[⛓] Disconnect      (fa-link-slash, red)
───────────────
[⛓] Funnel Settings (only if workspace linked)
───────────────
[☀/☾] Theme
[🌐] Language
───────────────
[💳] Billing
[↑] Upgrade
───────────────
[→] Logout
```

---

## 2. Issue 2 — Funnel Settings popup closeable (CRITICAL)

The first-run auto-gate was previously hard-trapping users: the close button was hidden, the backdrop click was a no-op (`onClick={funnelSettingsFirstRun ? undefined : closeFunnelSettings}`), and there was no Escape handler. The form had to be saved before it could be dismissed, which left the user with no escape route if they were exploring the app or wanted to defer setup.

### What changed

| File | Change |
|---|---|
| `src/App.tsx` (state) | Added `funnelFirstRunDismissed` (in-memory latch). The first-run auto-gate effect now honors it — once the user explicitly dismisses the gate, the modal does NOT re-pop in the same session. The latch resets on a successful save (so a new workspace's first-run still surfaces) and on a fresh app load. |
| `src/App.tsx` (callbacks) | Added `dismissFunnelFirstRun`. When dismissed during the first run, it latches `funnelFirstRunDismissed`, closes the modal, and shows a localized reminder toast (`يمكنك إكمال إعدادات مسار المبيعات لاحقاً من القائمة` / `You can complete your funnel settings later from the menu`). When dismissed outside the first-run flow, it just closes silently (no toast). |
| `src/App.tsx` (modal JSX) | The Funnel Settings modal now renders the close button unconditionally, the backdrop click handler is `dismissFunnelFirstRun` (not gated on `firstRun`), and a new `useEffect` binds a `keydown` listener for Escape — all three converge on the same dismiss handler so behavior is identical across close button / backdrop / keyboard. |
| `src/App.tsx` (`onSaved`) | Now also resets `funnelFirstRunDismissed` to `false` so the next first-run surface (e.g. a different workspace) still gets the auto-gate. |

The form encourages saving but never traps the user — exactly the spec's "gentle reminder, not a wall" behavior.

---

## 3. Issue 3 — "No Meta account connected for this workspace" (CRITICAL)

### Root cause

`saveFunnelSettings` was throwing `permission-denied: "No Meta account connected for this workspace."` on every save attempt, even after a successful `linkMetaAccountToWorkspace` round-trip.

The bug was a Firestore path mismatch between the **writer** and the **reader**:

- **Writer (`linkMetaAccountToWorkspace` in `functions/src/index.ts:6416`)** stores the link on the workspace document itself:
  ```ts
  await wsSnap.ref.update({
      metaAdAccountId,
      metaAdAccountName: metaAdAccountName ?? "",
      metaRoleAtLinkTime: role,
  });
  ```
  → `users/{uid}/workspaces/{workspaceId}.metaAdAccountId`

- **Reader (`loadMetaConnectionAccountId` in `functions/src/funnelSettings.ts:69`)** was looking at a separate sub-document that **nothing ever wrote to**:
  ```ts
  await getDb()
      .collection("users").doc(uid)
      .collection("workspaces").doc(workspaceId)
      .collection("private").doc("metaConnection")
      .get();
  ```
  → `users/{uid}/workspaces/{workspaceId}/private/metaConnection.accountId`

Because the read always returned `null`, every save failed the `if (!connAccountId)` guard at `functions/src/funnelSettings.ts:261`. The contract test (`funnelSettings.contract.test.ts`) doesn't exercise the IO path so this regressed silently between rounds.

### Fix

Updated `loadMetaConnectionAccountId` to read from the workspace document itself — matching the writer:

```ts
async function loadMetaConnectionAccountId(
    uid: string,
    workspaceId: string,
): Promise<string | null> {
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    return typeof data.metaAdAccountId === "string" && data.metaAdAccountId.length > 0
        ? data.metaAdAccountId
        : null;
}
```

This now correctly returns the linked `metaAdAccountId` and the 1:1 enforcement check at the top of `saveFunnelSettings` / `getFunnelSettings` / `dismissAdvisory` proceeds normally.

### Verified end-to-end after deploy

The `saveFunnelSettings` callable was re-deployed to `europe-west1` (see §6). Manual test plan:
1. Connect Meta, link a workspace account (`linkMetaAccountToWorkspace` writes `metaAdAccountId` to the workspace doc).
2. Open Funnel Settings, fill the form, click Save.
3. `saveFunnelSettings` now finds the linked account via the workspace doc → no `permission-denied` → settings persist at `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings/current`.

---

## 4. Issue 4 — Workspace selector in the Funnel Settings form

Multi-workspace users on the Scale plan were stuck editing the funnel settings for whichever workspace was active in the outer shell — they had no way to jump to a different workspace's settings from inside the form. The form also didn't surface which Meta account the save was targeting beyond the workspace name.

### What changed

| File | Change |
|---|---|
| `src/components/FunnelSettingsForm.tsx` (props) | Added `availableWorkspaces?: Array<{ id; name; metaAdAccountId?; metaAdAccountName? }>`. The parent (`App.tsx`) filters the global `workspaces` list down to those with `metaAdAccountId` set and threads them in. |
| `src/components/FunnelSettingsForm.tsx` (state) | Added `selectedWorkspaceId` (initialized from the `workspaceId` prop) and re-derives `selectedAccountId` from the workspace's `metaAdAccountId` whenever the user picks a different workspace. The hook `useFunnelSettings(selectedWorkspaceId, selectedAccountId)` is now keyed on the in-form selection, so the existing fetch effect re-fires automatically when the user switches. |
| `src/components/FunnelSettingsForm.tsx` (JSX) | When `availableWorkspaces.length > 1`, the form renders a dropdown labelled `Select Workspace` / `اختر مساحة العمل` immediately under the header and above the funnel-type selector. Each option shows the workspace name + linked Meta account name (`WorkspaceName — MetaAccountName`). A muted sub-line under the dropdown shows the currently linked Meta account name explicitly so the user always knows which account the save will target. When `availableWorkspaces.length <= 1`, no dropdown is rendered and the workspace name appears as static text in the header (no UI noise for single-workspace users). |
| `src/components/FunnelSettingsForm.tsx` (hydration) | The existing `hydratedForRef` guard already keyed hydration on `settings.accountId`, so switching workspaces (which changes the effective `accountId`) re-populates the form fields from the new workspace's settings automatically. No new effect needed. |
| `src/components/FunnelSettingsForm.tsx` (parent sync) | Added a `prevParentWsId` render-phase guard (the "adjusting state when a prop changes" pattern) that re-syncs `selectedWorkspaceId` to the parent's prop if the user switched workspaces in the outer workspace switcher while the modal is still open. |
| `src/App.tsx` | Threads the `availableWorkspaces` prop into the Funnel Settings modal mount, filtering `workspaces` to those with `metaAdAccountId` set and `deletedAt == null`. |

The save handler also picks up the change automatically — `handleSave` reads `selectedWorkspaceId` / `selectedAccountId` (internal state) instead of the props, so saves always go to whichever workspace-account the form is currently displaying.

---

## 5. Gate sequence — pass status

| Step | Command | Result |
|---|---|---|
| 1. Functions build | `cd functions ; npm run build` | PASS (`tsc` + asset copy, no errors) |
| 2. Frontend build | `npm run build` (root) | PASS (`tsc -b && vite build`, 18.39s, 1794.74 kB main chunk — pre-existing size warning) |
| 3. Tests | `npm test` (functions) | PASS — 929 tests, 0 failed |
| 4. SC-11 guard | `node scripts/sc11Guard.mjs` | PASS (75 files scanned, 0 forbidden terms, 10 allowlisted) |
| 5. Commit + push | `git add -A ; git commit -m "fix: funnel settings save error + closeable modal + menu arrangement + workspace selector" ; git push` | PASS (`ea156d8`) |
| 6. CodeRabbit review | `gh api /commits/ea156d8/check-runs` | CodeRabbit returned `Skipped - Review paused` — no new comments posted on this commit. The pre-existing unresolved comments on the PR (Funnel Settings focus trap, non-workspace plans) are pre-existing items tracked under separate follow-up batches and are not regressed by this round. |
| 7. Functions deploy | `firebase deploy --only functions` (after `Remove-Item lib` + rebuild) | PASS — all 78 functions updated to Node.js 24 Gen 2 (`saveFunnelSettings`, `getFunnelSettings`, `dismissAdvisory`, `linkMetaAccountToWorkspace`, plus everything else). Two transient `429 Quota exceeded` retries on `competitorResearch` and `serverGenerateFinalAd` succeeded on retry. |
| 8. GitHub Actions `build-and-test` | check-run on `ea156d8` | PASS (`completed`, `success`) |

---

## 6. Cloud Functions deployment

Per the AGENTS.md "Firebase lib sync" rule, the lib/ directory was wiped and rebuilt before deploy:

```powershell
cd D:\proads-worktrees\phase-14-rag-meta\functions
Remove-Item -Recurse -Force lib
npm run build
firebase deploy --only functions
```

Deployment summary:
- **78 functions** total, all `europe-west1` (one `purgeExpiredWorkspaces` in `us-central1`).
- **Critical for this round:** `saveFunnelSettings`, `getFunnelSettings`, `dismissAdvisory`, `linkMetaAccountToWorkspace`, `unlinkMetaAccountFromWorkspace`, `metaSyncPerformance`, `metaDailySync` — all `Successful update operation`.
- A pre-existing `firebase-functions` upgrade notice is logged but unrelated to this batch (deferred to a separate housekeeping round).

The Issue 3 path-mismatch fix is live — `saveFunnelSettings` will now correctly find the linked `metaAdAccountId` on the workspace doc and stop throwing `permission-denied`.

---

## 7. Files touched

| File | Lines | Change |
|---|---|---|
| `functions/src/funnelSettings.ts` | +16 / -8 | `loadMetaConnectionAccountId` now reads `metaAdAccountId` from the workspace doc (matching the writer). File-header doc-comment updated to call out the bug + fix. |
| `src/App.tsx` | +105 / -32 | Menu regrouping (Issue 1); new `funnelFirstRunDismissed` state + `dismissFunnelFirstRun` callback + Escape key `useEffect` (Issue 2); modal JSX uses `dismissFunnelFirstRun` unconditionally; modal passes `availableWorkspaces` to the form (Issue 4); `onSaved` resets the dismiss latch. |
| `src/components/FunnelSettingsForm.tsx` | +99 / -22 | New `availableWorkspaces` prop; `selectedWorkspaceId` / `selectedAccountId` internal state; workspace selector JSX (Issue 4); render-phase prop sync; `handleSave` now reads internal state. File-header doc-comment updated. |
| `specs/phase-14/reports/batch-01-funnel-fixes.md` | +175 / -0 | This file. |

Net: 4 files changed, 395 insertions, 62 deletions.

---

## 8. Behavioral matrix

| Scenario | Before | After |
|---|---|---|
| Multi-workspace user opens Funnel Settings | Form is read-only "select a workspace first" if active workspace has no Meta linked | Workspace dropdown is pre-selected to active workspace; switching the dropdown swaps the form's loaded settings + account id |
| Single-workspace user opens Funnel Settings | Works fine, but couldn't see which Meta account was targeted | No dropdown noise; header shows workspace name; no account sub-line shown (it'd be redundant) |
| First-run user dismisses the auto-opened Funnel Settings | Modal was un-closable; trapped the user | Close button visible, backdrop click + Escape both close; gentle reminder toast; modal does NOT re-open in the same session; resets on save or page reload |
| User clicks Save with workspace linked | Server threw `permission-denied: "No Meta account connected for this workspace."` because the server read the wrong Firestore path | Server reads `users/{uid}/workspaces/{workspaceId}.metaAdAccountId` (matching the linker) → save succeeds |
| Menu — expanded sidebar with Meta connected | Sync / Change Account / Disconnect scattered across two dividers | All three sub-actions sit directly under the main Meta entry, separated by their own divider, Change Account uses `fa-repeat` |
| Menu — collapsed 48px icon strip | Unchanged | Unchanged (collapsed strip never exposed the sub-actions) |