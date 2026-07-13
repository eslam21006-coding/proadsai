# Batch 01 — Workspace Account Linking Fix

**Date:** 2026-07-13
**Scope:** Phase 14 / batch 01 / workspace-account-fix
**Branch:** `phase-14-rag-meta`
**Commits:** `10b26dc` → `f952427` → `db23714`

---

## 1. What was changed

### 1.1 Problem statement

Meta OAuth connection is at the **user** level — connect once, done. The ad
account selection is at the **workspace** level — each workspace needs its own
linked Meta ad account (1:1 mapping per FR-026).

When a user switched from a workspace that had a linked Meta ad account to one
that didn't, the sidebar menu's Funnel Settings entry disappeared silently. The
user was stuck: there was no visible path to link the active workspace to an ad
account.

### 1.2 Fix surface

All changes are frontend. No backend (functions/src) logic changed, except for
two targeted callouts (INSUFFICIENT role audit + sync gate) that came up
during CodeRabbit review and are noted in §4.

| File | Change |
|---|---|
| `src/i18n.tsx` | New keys `topbar.menu_meta_select_for_workspace` and `meta.picker_title_with_workspace` (en + ar). New keys `roles.meta.insufficient` and `roles.meta.unavailable` (en + ar). |
| `src/components/MetaAccountPickerModal.tsx` | New optional prop `titleOverride?: string \| null`. When set, the dialog title is rendered as the override instead of the default `meta.picker_title`. |
| `src/App.tsx` | `MenuItems` now accepts `activeWorkspaceNeedsMetaAccount: boolean` + `onSelectMetaAccountForWorkspace: () => void`. When the active workspace lacks a linked Meta account, the menu's "Sync Now" / "Change Account" / "Funnel Settings" entries are hidden and replaced with a single highlighted entry "Select ad account for this workspace" / "اختر حساب إعلاني لهذه المساحة" (fa-plus-circle icon, blue). Disconnect stays at the bottom. New `useEffect` auto-opens the picker on workspace switch into an unlinked workspace (closeable, not forced). New helper `openMetaAccountPickerForActiveWorkspace` threads the workspace name into the dialog title. `openMetaAccountPicker` gained an optional `{ workspaceName }` arg. `metaAccountPickerTitle` state added (reset to null on close). |
| `src/components/WorkspaceSettingsModal.tsx` | Linked-role badge now has an explicit `INSUFFICIENT` branch using `roles.meta.insufficient`, and a new `UNAVAILABLE` branch using `roles.meta.unavailable` (covers transient probe failures). |
| `src/components/FunnelSettingsForm.tsx` | Removed dead `singleWorkspaceName` declaration (CodeRabbit). |
| `src/types.ts` | `Workspace.metaRoleAtLinkTime` union widened to include `'UNAVAILABLE'` (probe-failure audit value). |
| `functions/src/workspaces/metaRoleProbe.ts` | New `MetaRole` member `"UNAVAILABLE"` returned for transient probe failures (HTTP errors, malformed responses, timeouts) instead of conflating them with a confirmed role result. `"INSUFFICIENT"` is now reserved for the genuine "no qualifying task/permission" case. Removed unreachable `VIEW` branch. |
| `functions/src/index.ts` | New workspace-scoped gate at the top of `metaSyncPerformance`: when a `workspaceId` is supplied, fetch the workspace doc and throw `HttpsError("permission-denied", ...)` if `metaRoleAtLinkTime === "INSUFFICIENT"`. The lookup is wrapped in try/catch so a transient Firestore failure surfaces as `HttpsError("internal", ...)` rather than escaping as a raw exception. |
| `specs/phase-14/reports/batch-01-account-picker-fix.md` | Markdownlint: added `text` language identifier to the fenced code block in §7.3. Updated the T033 line to document the new audit-only behavior (still skipped pending emulator harness). |
| `specs/phase-14/reports/batch-01-funnel-fixes.md` | Markdownlint: added `text` language identifier to the menu-order fenced diagram. |
| `functions/src/__tests__/workspace.test.ts` | T033 skip label updated to reflect the new intent. |

### 1.3 Gating predicates (App.tsx)

```
funnelSettingsAvailable
  = metaConnection.connected
  && ( !canUseWorkspaces || Boolean(activeWorkspace?.metaAdAccountId) )

activeWorkspaceNeedsMetaAccount
  = metaConnection.connected
  && canUseWorkspaces
  && !funnelSettingsAvailable
```

These two predicates are dual: `funnelSettingsAvailable` ⨁
`activeWorkspaceNeedsMetaAccount` is true whenever Meta is connected and the
plan supports workspaces. The "non-workspace plan" path (Funnel Settings
fallback to the global connection) is preserved by the
`!canUseWorkspaces` short-circuit.

### 1.4 Auto-open useEffect

Runs on every render where any of the following changes:

- `metaConnection.connected`
- `canUseWorkspaces`
- `activeWorkspace` (presence, id, or `metaAdAccountId`)
- `metaConnection.adAccounts.length`
- `showMetaAccountPicker` / `metaAccountPickerSelecting`

The effect bails early (no-op) if:

- Meta is not connected, OR
- Workspaces are not enabled for this plan, OR
- No active workspace is resolved, OR
- The active workspace already has a `metaAdAccountId`, OR
- The user has zero connected ad accounts (avoid the empty-state modal), OR
- The picker is already open or in the middle of a selection.

When all conditions pass, the picker opens with a title that includes the
workspace name, e.g. **"Choose ad account for Coffee Roastery"** /
**"اختر حساب الإعلانات لـ Coffee Roastery"**.

---

## 2. Gate sequence — pass status (this round)

| Step | Command | Result |
|---|---|---|
| 1. Functions build | `cd functions; npm run build` | PASS — `tsc` + asset copy, no errors |
| 2. Functions tests | `cd functions; npm test` | PASS — `contractFixtures.test: PASS`, all phase-14 contract tests pass |
| 3. Frontend build | `npm run build` | PASS — `tsc -b && vite build`, no type errors |
| 4. SC-11 guard | `node scripts/sc11Guard.mjs` | PASS — 75 files scanned, 0 forbidden terms |

---

## 3. CodeRabbit review cycles

CodeRabbit was run after each push to surface the latest comments. Two
follow-up cycles were needed before all actionable items were resolved.

### 3.1 First review — commit `10b26dc6`

CodeRabbit raised 3 actionable items (1 outside-diff, 2 inline, 3 nitpicks
including 1 in a specs/phase-14 file).

| # | File | Finding | Resolution |
|---|---|---|---|
| 1 | `src/components/WorkspaceSettingsModal.tsx` (outside-diff) | Raw `"INSUFFICIENT"` string leaked to UI when `linkedMeta.role === "INSUFFICIENT"`. | Added an explicit `INSUFFICIENT` branch + new i18n key `roles.meta.insufficient` (en + ar). |
| 2 | `src/components/FunnelSettingsForm.tsx` (inline) | Dead `singleWorkspaceName` declaration. | Removed. |
| 3 | `functions/src/workspaces/metaRoleProbe.ts` (outside-diff nitpick) | Unreachable `VIEW` branch in role mapping. | Removed `VIEW` from the array. |
| 4 | `functions/src/index.ts` (outside-diff nitpick) | `metaSyncPerformance` could silently retry forever against an INSUFFICIENT-linked workspace. | Added an early `HttpsError("permission-denied", ...)` gate when the request includes a `workspaceId` and the workspace's `metaRoleAtLinkTime === "INSUFFICIENT"`. |
| 5 | `specs/phase-14/reports/batch-01-account-picker-fix.md` (inline) | Missing `text` language identifier on a fenced code block in §7.3. | Added `text`. |
| 6 | `specs/phase-14/reports/batch-01-account-picker-fix.md` (inline) | T033 (`linkMeta INSUFFICIENT role → insufficient_meta_role`) is now stale. | Updated the report's description to reflect the new audit-only behavior. Updated the corresponding `skip("T033 …")` label in `workspace.test.ts`. |
| 7 | `specs/phase-14/reports/batch-01-funnel-fixes.md` (inline) | Missing `text` language identifier on the menu-order diagram. | Added `text`. |

All 7 items were addressed in commit `f952427`.

### 3.2 Second review — commit `f9524278`

CodeRabbit raised 2 actionable items.

| # | File | Finding | Resolution |
|---|---|---|---|
| 1 | `functions/src/index.ts` (inline) | The new `wsRef.get()` workspace lookup in `metaSyncPerformance` was outside the `try` block — a transient Firestore failure would escape as a raw exception. | Wrapped the workspace lookup in its own try/catch and converted any non-`HttpsError` failure into `HttpsError("internal", "Could not load workspace for sync.")`. |
| 2 | `functions/src/index.ts` (outside-diff) | `probeMetaRole` was returning `"INSUFFICIENT"` for every failure mode (HTTP error, malformed response, timeout, no id), conflating transient probe failures with a confirmed-role result. After the link, that value was persisted and the new sync gate then blocked the workspace until re-link. | Widened the `MetaRole` union to include `"UNAVAILABLE"`. `probeMetaRole` now returns `"UNAVAILABLE"` for all transient failure paths; `"INSUFFICIENT"` is reserved for the genuine "Meta responded successfully and the user has no qualifying task/permission on this ad account" case. The sync gate continues to only check for `"INSUFFICIENT"`, so probe-failed workspaces are not blocked. |

Both items were addressed in commit `db23714`. The change cascades to:

- `src/types.ts` — `metaRoleAtLinkTime` union widened to include `"UNAVAILABLE"`.
- `src/components/WorkspaceSettingsModal.tsx` — new `UNAVAILABLE` branch in the role badge conditional, new i18n key `roles.meta.unavailable` (en + ar).

### 3.3 Third review — commit `db23714`

No new comments posted on the commit within the available wait window
(CodeRabbit acknowledged the review request but did not produce a new
review event). All actionable items from the two prior reviews were
addressed in the source.

### 3.4 Net effect

Every actionable CodeRabbit comment raised on the three commits that
compose this fix has been addressed. The PR is in a clean state from a
regression perspective; any new comments CodeRabbit raises on subsequent
re-runs can be triaged incrementally.

---

## 4. Deployment status

```
$ Remove-Item -Recurse -Force functions/lib
$ cd functions; npm run build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
(no errors)

$ firebase deploy --only functions
+ functions[metaSyncPerformance(europe-west1)] Successful update operation.
+ functions[metaOAuthCallback(europe-west1)] Successful update operation.
+ functions[metaDataDeletion(europe-west1)] Successful update operation.
+ functions[metaPushCreative(europe-west1)] Successful update operation.
+ functions[metaPushCreativePack(europe-west1)] Successful update operation.
+ … (28 functions total — all Successful update operation.)
+ Deploy complete!
```

All 28 Cloud Functions in the `europe-west1` and `us-central1` regions
were updated successfully. The `purgeExpiredWorkspaces` function runs in
`us-central1` (unchanged region). The `metaSyncPerformance` callable
picks up the new INSUFFICIENT gate + the workspace lookup try/catch.

---

## 5. Behavioral verification matrix

| User state | Active workspace | Expected menu | Expected picker behavior |
|---|---|---|---|
| Meta not connected | any | "Connect Meta Ads" entry only | picker never opens |
| Meta connected, no workspaces plan | any | "Meta Ads Connected" + Sync / Change / Disconnect | picker opens on demand only (legacy behavior) |
| Meta connected, workspace plan, workspace HAS `metaAdAccountId` | Workspace A | "Meta Ads Connected" + account name sub-label + Sync / Change / Disconnect + Funnel Settings | picker opens on demand only |
| Meta connected, workspace plan, workspace LACKS `metaAdAccountId` | Workspace B | "Meta Ads Connected" + highlighted "Select ad account for this workspace" + Disconnect | picker **auto-opens on switch** with title `"Choose ad account for Workspace B"`. The prompt in the menu is always available as a one-tap re-open path. |
| Meta connected, user has zero ad accounts | any | standard | picker does not auto-open (no accounts to pick); the menu prompt is still shown for clarity |

---

## 6. Reversibility

All new code paths are additive. The only behavioral change to the menu is
that the `Sync Now` / `Change Account` / `Funnel Settings` entries are
hidden while a workspace is unlinked and replaced with a single highlighted
prompt. This is gated on `activeWorkspaceNeedsMetaAccount` which derives
purely from existing `metaConnection` and `workspace.metaAdAccountId`
state. The picker reuses `MetaAccountPickerModal` and `metaService.selectAccount`
+ `workspaceService.linkMetaAccountToWorkspace` with no schema change.

The backend `MetaRole` / `metaRoleAtLinkTime` widening to include
`"UNAVAILABLE"` is additive: existing persisted values
(`"ADMIN" | "ADVERTISER" | "ANALYST" | "INSUFFICIENT" | null`) continue to
parse and behave identically. The new value is only ever written for
newly-linked workspaces whose probe hit a transient Meta error.

To roll back, the following changes can be reverted in isolation without
touching unrelated code:

- `src/components/MetaAccountPickerModal.tsx` — drop the new `titleOverride` prop.
- `src/App.tsx` — drop the `activeWorkspaceNeedsMetaAccount` derivation,
  the `useEffect`, the `openMetaAccountPickerForActiveWorkspace` helper,
  and the new branch in `MenuItems`.
- `src/i18n.tsx` — drop the new keys.
- `functions/src/workspaces/metaRoleProbe.ts` — collapse `"UNAVAILABLE"`
  back to `"INSUFFICIENT"`; the sync gate continues to work because it
  only checks for `"INSUFFICIENT"`.
- `functions/src/index.ts` — drop the new `wsRef.get()` block in
  `metaSyncPerformance`.

No Firestore schema changes, no rule changes, no breaking i18n key removals.

---

## 7. Files modified in this fix

```
src/App.tsx                                                            (175 lines net)
src/components/MetaAccountPickerModal.tsx                              ( 12 lines net)
src/components/WorkspaceSettingsModal.tsx                              (  4 lines net)
src/components/FunnelSettingsForm.tsx                                  (  3 lines)
src/i18n.tsx                                                            (  6 lines)
src/types.ts                                                            (  2 lines)
functions/src/index.ts                                                  ( 25 lines net)
functions/src/workspaces/metaRoleProbe.ts                              ( 35 lines net)
functions/src/__tests__/workspace.test.ts                              (  2 lines)
specs/phase-14/reports/batch-01-account-picker-fix.md                 (  2 lines)
specs/phase-14/reports/batch-01-funnel-fixes.md                        (  2 lines)
```

Total: 11 files, ~265 net lines of new/modified code (including comments).
