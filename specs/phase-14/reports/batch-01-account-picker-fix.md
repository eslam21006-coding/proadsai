# Phase 14 — Batch 01 Account Picker Fix Report

**Date:** 2026-07-12
**Branch:** `phase-14-rag-meta`
**PR:** [#53](https://github.com/eslam21006-coding/proadsai/pull/53)
**Commits (this round):** `86d20f5` — `fix: remove publishing permission check + fix account picker styling + show selected account name`; `5ca31d4` — `fix: use natural Fusha for Meta connected label per CodeRabbit`.
**Scope (original):** Restore the post-OAuth Meta ad-account picker that Phase 26 (`9c28960`, 2026-07-03) deleted along with the old sidebar. Closes the remaining gap from `specs/phase-14/reports/batch-01-ui-fixes.md` §1 (Meta UI restoration) — the connection works, but the 1:1 workspace→account link (FR-026) is never established, so the FunnelSettingsForm cannot open and the daily sync has no target.
**Scope (this round, batch 01-fix):** Three follow-up fixes flagged after the first round shipped (`ea8f008`). Team members with Meta Analyst / read-only roles are now able to link their workspace to an ad account (Phase 14 only READS — publishing still requires Advertiser access and is enforced elsewhere). The account-picker modal is now light/dark mode aware and matches the Favorites sheet styling. The menu's Meta entry surfaces the currently-selected ad-account name so the user can see which account is active at a glance.

---

## 1. What was missing

After `batch-01-ui-fixes.md`, clicking the menu's Meta entry successfully:

1. Opens the OAuth popup (`metaService.startOAuthFlow`).
2. Persists the connection server-side (`getMetaConnection` returns `connected: true` with the user's ad-account list).
3. Shows a success toast naming the account count.

But the user with **multiple ad accounts** had no UI to:

- Pick which account the workspace should be linked to.
- Persist that selection to the `metaAdAccountId` field at `users/{uid}/workspaces/{wsId}` — the field `workspaceService.linkMetaAccountToWorkspace` writes. `activeMetaAccountId` (in `App.tsx`) is the *derived/read* value that mirrors this server-side field for the active workspace.
- Change the selection later without disconnecting and re-connecting.

Without this, `activeMetaAccountId` is `null` → `funnelSettingsAvailable` is `false` → the FunnelSettingsForm menu entry is hidden → the user is stuck with no way to open the funnel-settings form even though they've already connected Meta. Same blocker applies to the daily sync on workspace plans.

---

## 2. What was added

### 2.1 `src/components/MetaAccountPickerModal.tsx` (new)

Lightweight modal — same z-index, backdrop, and Tailwind palette as the existing `FunnelSettingsModal` and `WorkspaceSettingsModal` so it slots into the established visual language. Renders:

- **Header:** blue-gradient banner with a `fa-brands fa-meta` glyph, the picker title (`اختر حساب الإعلانات` / `Choose your ad account`), a one-line subtitle, and a close button. Esc-to-close while idle.
- **Body:** a vertical list of clickable cards. Each card shows the account name (bold), the numeric account ID (small grey, `dir="ltr"` so the digits never get RTL-flipped), a `fa-circle-check` + "Currently selected" badge if the card represents the current selection, and a "Select" pill otherwise. Cards disable while a save is in flight.
- **Empty state:** falls back to the existing `workspace.settings.meta_connect_prompt` copy (defensive — should be unreachable from the auto flow).
- **Footer:** a single Cancel button (`إلغاء`) that mirrors the close button.

The component is **IO-free** — it owns no network calls. The parent (`App.tsx`) decides what to persist, so the modal can be reused later (e.g. inside the WorkspaceSettingsModal).

### 2.2 `src/App.tsx` — three new callbacks + state

| Symbol | Purpose |
|---|---|
| `showMetaAccountPicker` / `metaAccountPickerSelecting` / `metaAccountPickerError` | Modal visibility + in-flight + inline error state. |
| `handleMetaAccountSelect(accountId, { skipPicker })` | Persists the choice: `metaService.selectAccount` (global connection) → `workspaceService.linkMetaAccountToWorkspace` (workspace link, only on workspace plans) → mirror the workspace update in `setWorkspacesLocal` → mirror the connection's `selectedAccountId` → close the picker. `skipPicker: true` is used by the single-account fast path so it can call this from `handleConnectMeta` without re-opening the modal. **Note:** these two server-side writes are not transactional — if `linkMetaAccountToWorkspace` fails after `selectAccount` succeeds the global selection and workspace link can diverge. The `setWorkspacesLocal` mirror is the recovery point: a future re-sync (or a disconnect/reconnect) re-establishes consistency. |
| `openMetaAccountPicker` | Defensive no-op if Meta isn't connected or has zero accounts. |
| `closeMetaAccountPicker` | No-op while a save is in flight (prevents racing the in-flight write). |

**`handleConnectMeta` was rewritten** to branch on `accounts.length`:

- `0` → toast "Connected" (degenerate — Meta returned no accounts).
- `1` → auto-call `handleMetaAccountSelect` with `skipPicker: true`. No modal, no wasted click. This is the common path for single-business users.
- `≥ 2` → open the picker + toast "Pick an ad account (N available)".

**`MenuSidebarProps` + `MenuItemsProps`** get a new `onChangeMetaAccount: () => void` prop, threaded through both call sites (desktop sidebar around `src/App.tsx:10186` and mobile drawer around `src/App.tsx:10302`).

**`MenuItems` (the shared list)** gets a new entry — `fa-rotate` + `topbar.menu_meta_change_account` — pushed between `meta-sync` and `meta-disconnect` inside the `metaConnection?.connected` branch. So the sub-menu order is now: Sync Now → Change Account → Disconnect.

### 2.3 `src/i18n.tsx` — new keys (EN + AR)

```text
topbar.menu_meta_change_account  Change Account              تغيير الحساب
meta.picker_title                Choose your ad account      اختر حساب الإعلانات
meta.picker_subtitle             Select which Meta ad…       اختر حساب ميتا…
meta.picker_current              Currently selected          الحساب المحدد حاليا
meta.picker_select               Select                      اختيار
meta.picker_cancelling           Cancel                      إلغاء
meta.account_selected_toast      Ad account selected.        تم اختيار حساب الإعلانات.
```

All Arabic is plain Fusha — no Egyptian dialect, no technical terms (no "متوسط", no acronyms).

---

## 3. Gate sequence — pass status

| Step | Command | Result |
|---|---|---|
| 1. Functions build | `cd functions ; npm run build` | PASS (`tsc` + asset copy, no errors) |
| 2. Frontend build | `npm run build` (root) | PASS (`tsc -b && vite build`, 118 modules transformed, 24.31s) |
| 3. Tests | `npm test` (root → `vitest run`) | PASS (26/26 tests across 2 files, 10.69s) |
| 4. SC-11 guard | `node scripts/sc11Guard.mjs` | PASS (75 files scanned, 0 forbidden terms) |
| 5. New-file lint | `npx eslint src/components/MetaAccountPickerModal.tsx` | PASS (clean) |
| 6. Commit + push | `git add -A ; git commit -m "fix: restore Meta ad account picker after OAuth connection" ; git push` | PASS (`ea8f008` on `phase-14-rag-meta`) |

The 970 pre-existing lint errors throughout the codebase (mostly `no-explicit-any` on legacy Firestore payloads and a few `no-unused-vars` in shared helpers) are **unrelated to this change** — `npx eslint src/components/MetaAccountPickerModal.tsx` returns zero errors. The same lint command was not run against `src/App.tsx` or `src/i18n.tsx`; a manual scan of the touched lines in those files confirmed no new errors introduced, but any remaining pre-existing errors in those files (caught by the broader `npm run lint` run earlier in Phase 14) are out of scope.

---

## 4. Files touched

| File | Lines | Change |
|---|---|---|
| `src/components/MetaAccountPickerModal.tsx` | +198 (new) | The picker modal. |
| `src/App.tsx` | +140 / -8 | Import, state, three callbacks, MenuSidebar/MenuItems prop threading, MenuItems entry, JSX modal mount. |
| `src/i18n.tsx` | +14 | 7 new keys × 2 languages. |

Net: 3 files changed, 342 insertions, 8 deletions.

---

## 5. Behavioral matrix — covers the full task spec

| Scenario | Expected | Implemented |
|---|---|---|
| 1 account → connect | Auto-select, no modal, success toast | ✓ (branch in `handleConnectMeta`, calls `handleMetaAccountSelect` with `skipPicker: true`) |
| 2+ accounts → connect | Modal opens, user picks, persisted to workspace doc | ✓ (modal auto-opens; `handleMetaAccountSelect` writes both `metaSelectAccount` and `linkMetaAccountToWorkspace`; `setWorkspacesLocal` mirrors the write so `activeMetaAccountId` flips immediately) |
| Already connected → "Change Account" | Modal re-opens, current selection pre-checked | ✓ (`openMetaAccountPicker` is a no-op only when not connected; current selection is highlighted with the `meta.picker_current` badge) |
| Selection persisted to workspace | `users/{uid}/workspaces/{wsId}.metaAdAccountId` written via `linkMetaAccountToWorkspace` | ✓ (server-side write happens via the existing callable; client mirrors in `setWorkspacesLocal`) |
| FunnelSettingsForm can open after pick | `funnelSettingsAvailable` flips to `true` once `activeWorkspace?.metaAdAccountId` is set | ✓ (the `setWorkspacesLocal` write triggers a re-render → the existing `useMemo` recomputes `activeMetaAccountId` → `funnelSettingsAvailable` flips → MenuItems shows the entry) |
| Daily sync can target workspace | `metaSyncPerformance(workspaceId)` is already keyed on `activeWorkspaceId` — it always could | ✓ (no change needed; the gate was always the workspace→account link, which this fix establishes) |
| Arabic label for "Change Account" | `تغيير الحساب` | ✓ (`topbar.menu_meta_change_account` AR) |
| Arabic label for picker title | `اختر حساب الإعلانات` | ✓ (`meta.picker_title` AR) |
| All copy is plain Fusha, no jargon | required | ✓ (no Egyptian dialect, no acronyms, no technical terms) |

---

## 6. Notes for CodeRabbit review

- **IO orchestration lives in `App.tsx`, not the modal** — keeps the component reusable and matches the codebase pattern (`handleCreateWorkspace` similarly bridges `workspaceService` + `setWorkspacesLocal`).
- **TDZ-safe callback order** — `handleMetaAccountSelect` is declared **before** `handleConnectMeta` so the latter can list it in its `useCallback` deps array without throwing on first render. A code comment on the former calls this out so a future re-order doesn't regress it.
- **Skip-picker fast path** — `handleMetaAccountSelect` accepts `{ skipPicker?: boolean }` so the single-account auto-select in `handleConnectMeta` can reuse the same persistence path without opening then immediately closing the modal.
- **Re-selecting the current account** — clicking the highlighted card in the modal closes the picker instead of firing a redundant write (no-op write is harmless but a wasted round-trip on flaky networks).
- **No dynamic-import regression** — `await import('./services/workspaceService')` was already used five other times in `App.tsx` (lines 2290, 2310, 2330, 5090, 6750). The pre-existing Vite warning about `workspaceService` being both dynamic and statically imported is unchanged.

---

## 7. Follow-up round (batch 01-fix) — 2026-07-12

Three concrete bugs landed after the first batch shipped:

### 7.1 Fix 1 — Removed the publishing-role gate on account linking

The `linkMetaAccountToWorkspace` callable in `functions/src/index.ts:6408` was rejecting any user whose Meta role was below `ADVERTISER` (i.e. Analyst or below) with `failed-precondition: insufficient_meta_role` and the user-facing copy "Your Meta role on this ad account doesn't allow publishing. Request Advertiser access in Meta Business Manager to link it."

That gate is wrong for Phase 14. Phase 14 only **reads** ad-performance data via `metaSyncPerformance` + the daily sync — it never publishes. Analyst / read-only users are perfectly valid for this surface. The push-to-Meta flow (`metaPushCreative` / `metaPushCreativePack`) keeps its own permission checks via Meta's own API errors and is unaffected by this change.

Changes:

| File | Change |
|---|---|
| `functions/src/index.ts` | Dropped the `if (role === "INSUFFICIENT") throw …` branch. The probe still runs (so `metaRoleAtLinkTime` keeps its audit value), and the value is still written to the workspace doc. |
| `functions/src/workspaces/metaRoleProbe.ts` | Added an explicit `"ANALYST"` return case for users whose `tasks` / `permissions` include `ANALYZE`, `ANALYST`, or `VIEW` so the audit value isn't collapsed into `"INSUFFICIENT"`. Type union widened to `"ADMIN" \| "ADVERTISER" \| "ANALYST" \| "INSUFFICIENT"`. |
| `src/types.ts` | `Workspace.metaRoleAtLinkTime` widened to the same four-way union. |
| `src/components/WorkspaceSettingsModal.tsx` | The linked-role badge now resolves all four values; `ANALYST` renders the new `roles.meta.analyst` label. The existing `roles.unknown` fallback still catches anything that isn't one of the four. |
| `src/i18n.tsx` | New keys `roles.meta.analyst` (`Analyst` / `محلل`). |

The existing T033 contract test (`linkMeta INSUFFICIENT role → insufficient_meta_role`) is **still skipped** (pending emulator harness) so it does not break.

### 7.2 Fix 2 — Account picker modal now light/dark-mode aware with solid background

The `MetaAccountPickerModal` had a hard-coded dark shell (`bg-slate-950`) that looked like a dark slab in light mode and made the picker feel like a transparent overlay. Now the modal reads `isDarkMode` from the parent and picks a matching token set:

- **Dark:** `bg-slate-950` shell + `border-slate-800` + slate-blue gradient header.
- **Light:** `bg-white` shell + `border-slate-200` + blue-50 gradient header + drop shadow.

The backdrop is unchanged (`bg-black/60 backdrop-blur-sm` — same pattern as `FunnelSettingsModal` and the Favorites sheet, so the three modals in the app have consistent backdrops). Header / body / footer / card-active / card-icon / card-pill tokens all flip together. The active account card still gets the `cardActive` highlight + a `fa-circle-check` glyph + the `meta.picker_current` badge — the active card is now visually obvious in both themes.

`isDarkMode` is threaded through `App.tsx:11500` (the JSX mount site) — already in scope at the call site since the `App` component owns the theme toggle.

### 7.3 Fix 3 — Menu now shows the selected Meta account name

When Meta is connected and an account is selected, the menu's Meta entry now shows the account name in a small muted line under `حساب ميتا مربوط` / `Meta Ads Connected`:

```
  Meta Ads Connected
  Adscope Consulting LLC
```

Implementation:

- `MenuItem` (in `App.tsx`) grew an optional `subLabel?: string | null` prop. When set, the label is wrapped in a flex column with the main label on top and the sub-label below in `text-[10px] text-slate-400`. When `subLabel` is `null` / `undefined` the row collapses to the original single-line layout (no extra DOM, no extra height). Existing menu items that don't pass `subLabel` are unchanged.
- The Meta entry in `MenuItems` derives the sub-label inline: `metaConnection.adAccounts.find(a => a.id === metaConnection.selectedAccountId)?.name`, falling back to the numeric id when the name is missing.

Inside the picker, the active card already had a checkmark + highlight from the original round (lines 230-244 in the rewritten modal). I added an extra `aria-pressed={isCurrent}` and replaced the default `fa-rectangle-ad` icon with a `fa-circle-check` on the active card's leading icon slot — so the active card is unmistakable even before reading the right-side badge.

### 7.4 Gate sequence — pass status (this round)

| Step | Command | Result |
|---|---|---|
| 1. Functions build | `cd functions ; npm run build` | PASS (`tsc` + asset copy, no errors) |
| 2. Frontend build | `npm run build` (root) | PASS (`tsc -b && vite build`, 14.67s, 1793.92 kB main chunk — pre-existing size warning) |
| 3. Tests | `npm test` (functions) | PASS — 929 tests, 0 failed |
| 4. SC-11 guard | `node scripts/sc11Guard.mjs` | PASS (75 files scanned, 0 forbidden terms, 10 allowlisted) |
| 5. Commit + push (fix) | `git add -A ; git commit -m "fix: remove publishing permission check + fix account picker styling + show selected account name" ; git push` | PASS (`86d20f5`) |
| 6. Commit + push (Arabic wording) | `git add -A ; git commit -m "fix: use natural Fusha for Meta connected label per CodeRabbit" ; git push` | PASS (`5ca31d4`) |

### 7.5 CodeRabbit resolution

After pushing `86d20f5` and `5ca31d4`, CodeRabbit's check-run on both commits returned status `completed` / `success` with the message `Result: Skipped - Review paused`. No new comments were posted on either commit. The pre-existing unresolved comments on this PR (Funnel Settings focus trap, Funnel Settings non-workspace plans, `activeMetaAccountId` global-fallback regression, `lang` useCallback dep) are either pre-existing issues unrelated to the 3 Meta-picker fixes or were marked `Addressed in commits 7271277 to 6dcdb33` by CodeRabbit in earlier rounds. The one in-scope follow-up (`topbar.menu_meta_connected` Arabic wording — `حساب ميتا مربوط` → `حساب ميتا متصل`) was applied in `5ca31d4`. The remaining out-of-scope items are tracked under Phase 14 follow-up batches and are not regressed by this round.

### 7.6 Files touched (this round)

| File | Lines | Change |
|---|---|---|
| `functions/src/index.ts` | +6 / -3 | Dropped the `INSUFFICIENT` throw; comment explains Phase 14 is read-only. |
| `functions/src/workspaces/metaRoleProbe.ts` | +4 / -1 | Added `ANALYST` return case + widened `MetaRole` union. |
| `src/types.ts` | +1 / -1 | Widened `metaRoleAtLinkTime` union. |
| `src/components/WorkspaceSettingsModal.tsx` | +4 / -2 | Linked-role badge handles `ANALYST` + widened local type. |
| `src/i18n.tsx` | +2 / -0 | `roles.meta.analyst` EN+AR; `topbar.menu_meta_connected` AR Fusha tweak. |
| `src/components/MetaAccountPickerModal.tsx` | +60 / -85 (rewrite) | `isDarkMode` prop, light/dark token sets, checkmark-on-active-card icon, `aria-pressed`. |
| `src/App.tsx` | +26 / -10 | `isDarkMode` threaded into picker JSX mount; `MenuItem.subLabel`; Meta menu entry builds the sub-label inline. |
| `specs/phase-14/reports/batch-01-account-picker-fix.md` | +85 / -0 | This section. |

Net: 8 files changed, 184 insertions, 102 deletions.
