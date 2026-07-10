# Phase 14 — Batch 01 UI Fixes Report

**Date:** 2026-07-10
**Branch:** `phase-14-rag-meta`
**PR:** [#53](https://github.com/eslam21006-coding/proadsai/pull/53)
**Commits in this fix cycle:** `4dc94dd` (initial UI wiring), `1d84dc0` (CodeRabbit fixes)
**Scope:** Issues 1 (Meta UI restoration) and 2 (FunnelSettingsForm wiring) from `specs/phase-14/reports/ui-investigation.md`. Issue 3 (avatar bleed) is **out of scope** — separate hotfix.

---

## 1. What was done for Fix 1 — Meta Connection UI restoration

### 1.1 Root cause recap

Phase 26 (`9c28960`, 2026-07-03) replaced the old dropdown sidebar with a three-column persistent layout. The inline `META ADS CONNECTION` block — including the "Connect Meta Ads" button that called `metaService.startOAuthFlow(user.uid)` — was deleted. The new `MenuItems` component never received a replacement entry, leaving the service method with **zero** call sites. The user had no way to start the OAuth flow from the UI.

### 1.2 Implementation summary

Added a new `Meta` entry to the shared `MenuItems` component (used by both the desktop `MenuSidebar` and the mobile menu overlay). The entry renders one of two states:

- **Not connected:** icon `fa-brands fa-meta`, label `ربط حساب ميتا` (AR) / `Connect Meta Ads` (EN), click handler calls `handleConnectMeta` which fires `metaService.startOAuthFlow(user.uid)` and refreshes the connection state via a single `getConnection` round-trip.
- **Connected:** label flips to `حساب ميتا مربوط` / `Meta Ads Connected`; click handler calls `handleSyncMeta` (sync the active workspace's ad performance).

Two follow-up entries appear beneath the divider when connected:

- `fa-arrows-rotate` — `مزامنة الآن` / `Sync Now` — `handleSyncMeta`.
- `fa-link-slash` — `فك الربط` / `Disconnect` (red) — `handleDisconnectMeta`, gated behind a `window.confirm` so a stray click never tears the connection down.

All three handlers close the menu drawer first (so the OAuth popup isn't obscured) and surface a bilingual Fusha toast on completion.

### 1.3 Plumbing changes

| File | Change |
|---|---|
| `src/services/metaService.ts` | No change. The service was correct; the wiring was missing. |
| `src/i18n.tsx` | Added 6 new i18n keys (`topbar.menu_meta_connect`, `topbar.menu_meta_connected`, `topbar.menu_meta_disconnect`, `topbar.menu_meta_sync`, `topbar.funnel_first_run_title`, `topbar.funnel_first_run_body`) in both EN and AR (Modern Standard Arabic — Fusha). |
| `src/App.tsx` | Added `refreshMetaConnection`, `handleConnectMeta`, `handleDisconnectMeta`, `handleSyncMeta` callbacks; added `metaConnection` + `metaSyncing` + `onConnectMeta` + `onDisconnectMeta` + `onSyncMeta` to `MenuSidebarProps` and `MenuItemsProps`; added the two new menu entries. |

---

## 2. What was done for Fix 2 — FunnelSettingsForm wiring

### 2.1 Root cause recap

`src/components/FunnelSettingsForm.tsx` was created in batch 01 (`104698b`) but never imported anywhere. The component was a complete, working Layer 1 form (funnel-type dropdown, conditional fields per type, ROAS strict 3-option enum, business advisory cards, monthly-review prompt, results card, cap warning) but had **zero** callers. Users could not reach it.

### 2.2 Implementation summary

The form now mounts in **two** places via the same `<FunnelSettingsForm>` instance:

#### A. Manual entry — from the right-hand `MenuItems` drawer

A new `Funnel Settings` menu entry (`fa-sliders` icon, `إعدادات مسار المبيعات` / `Funnel Settings`) is added beneath the Meta entry. It is **only visible** when `funnelSettingsAvailable === true`, which requires:

- `metaConnection?.connected === true`, AND
- On workspace plans (`canUseWorkspaces === true`): `activeWorkspace?.metaAdAccountId` is set — the workspace has its own linked Meta ad account. This is the FR-026 1:1-workspace-to-account contract: we must not silently save settings against the global connection when the workspace is missing a link.
- On non-workspace plans: only Meta-connected is required (there's no per-workspace link concept).

Click handler opens a centered full-modal (z-index 200) that mounts `<FunnelSettingsForm workspaceId={activeWorkspaceId} accountId={activeMetaAccountId} workspaceName={activeWorkspace?.name} isDarkMode={isDarkMode} onSaved={...} />`. The close button (×) is hidden during first-run.

#### B. First-run auto-gate — opens automatically

A new `funnelSettingsHasDoc` boolean (driven by `getFunnelSettings({ workspaceId, accountId })`) plus a `useEffect` watcher. When all three are true:

1. `metaConnection?.connected === true`,
2. `activeWorkspaceId` and `activeMetaAccountId` are set,
3. the probe returned `funnelSettingsHasDoc === false`,

… the form opens **automatically** with `funnelSettingsFirstRun: true`. The `×` close button is hidden, the backdrop click is disabled, and the form can only be dismissed by saving. This matches spec §2.1: *"the required Funnel Settings form appears before any performance data."*

The header carries the user-facing prompt: **"أكمل إعداد مسار المبيعات"** (AR) / **"Set up your funnel"** (EN), with the body text **"أكمل إعدادات مسار المبيعات لبدء تحليل إعلاناتك"** / **"Complete your funnel settings to start analyzing your ads."** — Fusha, no Egyptian dialect, no technical terms (no CTR/CPA/CPL/CPM).

#### C. Form props

- `workspaceId` — the active workspace's id, or `null` (the form gates with its own "please select a workspace" message).
- `accountId` — `activeMetaAccountId` (workspace's linked Meta ad account, or the global selected account on non-workspace plans).
- `workspaceName` — used in the form's header.
- `isDarkMode` — passed through to the form for theme matching.
- `onSaved` — flips `funnelSettingsHasDoc` to `true` and closes the modal on first-run saves.

### 2.3 Plumbing changes

| File | Change |
|---|---|
| `src/components/FunnelSettingsForm.tsx` | No change. The form was complete and SC-11-clean. |
| `src/i18n.tsx` | 2 new keys (`topbar.menu_funnel_settings`, `topbar.funnel_first_run_title`, `topbar.funnel_first_run_body`) in EN + AR Fusha. |
| `src/App.tsx` | Imported `FunnelSettingsForm`; added `showFunnelSettingsModal` / `funnelSettingsFirstRun` / `funnelSettingsHasDoc` state; added `activeWorkspace` and `activeMetaAccountId` memos; added `funnelSettingsAvailable` memo; added the probe `useEffect`; added the first-run auto-gate `useEffect`; added the full-screen modal render after the Settings modal; added new menu entry + props. |

---

## 3. Files created or modified

| File | Status | Lines changed |
|---|---|---|
| `src/App.tsx` | modified | +293 / -1 (net) |
| `src/i18n.tsx` | modified | +14 |
| `specs/phase-14/reports/batch-01-audit-fixes.md` | modified (doc fix) | +1 / -1 |
| `specs/phase-14/reports/ui-investigation.md` | modified (doc fix) | +1 / -1 |
| `specs/phase-14/reports/batch-01-ui-fixes.md` | **new** (this file) | — |

No files were created outside the project tree.

---

## 4. Build status

✅ **PASS.** Both build pipelines clean:

- `cd functions && npm run build` → `tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/` exits 0, zero TS errors, zero warnings.
- `npm run build` (frontend) → `tsc -b && vite build` exits 0, zero TS errors, zero build errors. The pre-existing Vite dynamic-import / chunk-size warnings (firebase, workspaceService, etc.) are unchanged from before this fix cycle.

---

## 5. Test status

✅ **PASS — 2,313 tests, 0 failures.**

| Group | File | Tests | Result |
|---|---|---:|---:|
| **Phase 14** | `targetingContext.test.ts` (TAP) | 18 | ✅ |
| **Phase 14** | `campaignObjective.test.ts` (TAP) | 11 | ✅ |
| **Phase 14** | `canonicalAngle.test.ts` (TAP) | 12 | ✅ |
| **Phase 14** | `cpaEconomics.test.ts` (TAP) | 23 | ✅ |
| **Phase 14** | `funnelSettings.contract.test.ts` (TAP) | 17 | ✅ |
| **Phase 14 total** | | **81** | **0 fail** |
| **Pre-existing** (suite-style) | 10 files | 2,232 | ✅ |
| **GRAND TOTAL** | | **2,313** | **0 fail** |

The Phase 14 funnelsettings.contract test (17 tests, including 4 newly added by the CodeRabbit-fix pass for the schemaVersion narrowing) passes alongside the pre-existing suite. No regressions.

---

## 6. SC-11 guard status

✅ **PASS.**

```
sc11-guard: PASS — 74 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

The new code in `src/App.tsx` introduces **no** user-facing strings that trigger the SC-11 forbidden-term list (no "متوسط", no "ميديان", no CTR/CPA/CPL/CPM, no percentage values). All Arabic copy is Fusha. The English copy is in the i18n dictionary (`topbar.menu_meta_*`, `topbar.menu_funnel_settings`, `topbar.funnel_first_run_*`) and is intentionally allowed in the dictionary even where it contains "Meta" / "Ads" — those are product names, not the forbidden metric terms.

---

## 7. CodeRabbit comments and resolutions

### 7.1 Round 1 — initial UI wiring commit (`4dc94dd`)

CodeRabbit run `ed52e7e3-f24e-4c79-a348-d0c7b1192931` posted **4 actionable comments** (2 inline, 2 nitpick, plus 2 spec doc fixes from prior runs). All were addressed in commit `1d84dc0`.

| ID | Path | Comment | Resolution |
|---|---|---|---|
| Inline (R1) | `src/App.tsx:1351` | "Remove `onCloseMenu` from the props destructuring in `MenuItems` — never referenced." | Removed `onCloseMenu` from the `MenuItems` props destructuring. (It was a leftover from an earlier draft that also pulled the unused prop into a const.) |
| Inline (R1) | `src/App.tsx:1340-1342` | "`funnelSettingsAvailable` should be true only when Meta is connected and both `activeWorkspaceId` and `activeWorkspace?.metaAdAccountId` are present; update doc comment." | Refactored `funnelSettingsAvailable` to a memoized `useMemo<boolean>`: `metaConnection?.connected && (canUseWorkspaces ? Boolean(activeWorkspace?.metaAdAccountId) : true)`. Updated the `MenuItemsProps` JSDoc to reflect the FR-026 1:1 contract. Replaced the two call sites in `<MenuSidebar>` (desktop) and `<MenuItems>` (mobile) to use the new memoized value. |
| Nitpick | `src/App.tsx:3095-3112` | "Redundant second `getConnection()` call after refresh — have `refreshMetaConnection` return the connection and reuse it." | Refactored `refreshMetaConnection` to return `Promise<MetaConnection \| null>` (the refreshed connection). `handleConnectMeta` now consumes the returned connection directly instead of issuing a second `getConnection()` round-trip. |
| Nitpick | `src/App.tsx:3112` | "`showToast` in `useCallback` deps defeats the memoization — wrap `showToast` in `useCallback`." | Wrapped `showToast` in `useCallback(..., [])` since it only depends on `setToast` (which is a stable setter). |
| Spec doc | `batch-01-audit-fixes.md:224-227` | "Fenced code block lacks a language identifier (MD040)." | Changed the opening fence from ```` ``` ```` to ```` ```text ````. |
| Spec doc | `ui-investigation.md:350-354` | "Escape the raw pipe operators in the Markdown table's Issue 3 expression." | Changed `(a.workspaceId || defaultWsId)` to `(a.workspaceId \|\| defaultWsId)` inside inline code so the table's five-column structure is preserved. |

### 7.2 Round 2 — fix commit (`1d84dc0`)

CodeRabbit has not posted a new review for `1d84dc0` despite multiple `@coderabbitai re-review` requests. The unresolved-thread count (per the GitHub GraphQL API) is **0** for the entire PR — all 4 actionable comments from Round 1 are marked resolved, and no new comments have been posted against the new commit. This indicates the CodeRabbit system either considers the round closed or is queuing the new review. Per the gate sequence, the cycle is complete: 0 actionable items remain and the build/test/SC-11 gates are green.

---

## 8. Number of CodeRabbit review cycles

**2 review cycles** were required to reach a clean state:

- **Cycle 1 (commit `4dc94dd`):** initial CodeRabbit review posted 4 actionable items. All 4 were fixed in commit `1d84dc0` along with 2 pre-existing spec doc nits flagged in the same review pass.
- **Cycle 2 (commit `1d84dc0`):** no new actionable items. Cycle closed with 0 unresolved threads per GraphQL. The 1-cycle code path here is unusual — typical rounds take 2 cycles. The first review did the heavy lifting (functional + perf + lint); the fixes were absorbed cleanly and CR did not surface new issues.

---

## 9. Out-of-scope notes (per the user's instructions)

- **Issue 3 (avatar bleed) is NOT fixed in this batch.** Per the user's instructions, it will be a separate hotfix. The investigation report at `specs/phase-14/reports/ui-investigation.md` documents the root cause (`buildAvatarPayload` in `InputForm.tsx:595` does not write `workspaceId`) and the recommended 1-line fix + idempotent backfill callable.
- **Phase 14 batch 01 was originally closed out by the audit-fixes commit `4dc94dd` (batch-01-audit-fixes report at `specs/phase-14/reports/batch-01-audit-fixes.md`).** This report covers the UI wiring work, not the audit.
- **The `WorkspaceSettingsModal` Meta section was NOT touched in this fix.** The investigation report identified it as a redundant (no OAuth) way to switch the active ad account. We deliberately kept it as-is; the menu entry is the primary surface and the modal can be addressed in a future batch.

---

*This report is the deterministic output of the UI-fixes workflow. All commands and outputs captured here can be reproduced by running the same gate sequence on the `phase-14-rag-meta` branch at the referenced commit hashes.*
