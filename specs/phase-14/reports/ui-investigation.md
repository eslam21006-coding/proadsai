# UI / Avatar Investigation Report

**Date:** 2026-07-06
**Branch:** `phase-14-rag-meta`
**Worktree:** `D:\proads-worktrees\phase-14-rag-meta`
**Mode:** Investigation only — **no code changes** have been made. All findings are based on git history, current source code, and the Phase 26 / Phase 14 spec / contract documents.

---

## 1. ISSUE 1 — Meta connection UI disappearance

### 1.1 What the user observed

The "Connect Meta Ads" button, the account picker, the "Disconnect" toggle, and the "Sync Now" control that used to live in the app sidebar are gone. There is currently no user-facing way to start the Meta OAuth flow in the app.

### 1.2 Where the Meta UI used to live

Before Phase 26 (`feat: Phase 26 — Generation History with filters and pagination`, commit `9c28960`, 2026-07-03), the entire Meta connection UI was rendered inline inside the **left dropdown sidebar** (`showSidebar` state — opened by the hamburger button marked `[data-tour="sidebar-menu"]`):

```text
src/App.tsx (pre-Phase 26, lines 6310–6392)
├── "─── META ADS CONNECTION ───" comment header
├── metaConnection?.connected
│   ├── <Meta Ads Connected> header + selected-account label
│   ├── <select> account picker (when adAccounts.length > 1)
│   ├── <Sync Now> button → metaService.syncPerformance(workspaceId)
│   └── <Link-slash> disconnect → metaService.disconnect() + clear local state
└── else
    └── <Connect Meta Ads> button → metaService.startOAuthFlow(user.uid)
        + post-OAuth refresh of metaConnection + success toast
```

The full block was sequenced inside the sidebar between the **Team** row and the **Performance Dashboard** row, exactly where the old tour step text described it: *"Open this menu to access Performance Dashboard, Favorites, Team management, Meta Ads connection, and billing."*

### 1.3 What removed it

Phase 26 (`commit 9c28960`) deleted the entire `META ADS CONNECTION` block from `src/App.tsx` and replaced the dropdown sidebar with a three-column persistent layout:

| Old (dropdown sidebar) | New (three-column) |
|---|---|
| Left hamburger → dropdown drawer | Permanent **left `HistorySidebar`** (generation history + filters) + permanent **right `MenuSidebar`** (compact action strip + collapsible panel) |
| Meta button inside the dropdown | **Nothing in either new sidebar** |
| Performance Dashboard button inside the dropdown | **Removed entirely** — Dashboard is now reached only through the menu's Manage Dashboard / Performance Dashboard icon (see `MenuItems` later in this report) |

Confirmed via `git show 9c28960 -- src/App.tsx`:

```diff
-            {/* ─── META ADS CONNECTION ───── */}
-            {metaConnection?.connected ? ( ... )
-            : (
-              <button onClick={async () => {
-                  if (!user) return;
-                  showToast('Connecting to Meta Ads...', 'info');
-                  const connected = await metaService.startOAuthFlow(user.uid);
-                  if (connected) { ... }
-                }}
-                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl ..."
-              >
-                <span className="w-8 h-8 rounded-lg bg-blue-500/10 ..."><i className="fa-brands fa-meta text-blue-400 text-xs"></i></span>
-                <div>
-                  <p className="text-[11px] font-bold text-white group-hover:text-blue-400 ...">Connect Meta Ads</p>
-                  <p className="text-[8px] text-slate-500">Track real ad performance</p>
-                </div>
-              </button>
-            )}
```

The Phase 26 PR did **not** re-add the Meta block to the new `MenuSidebar` or the mobile menu overlay. The only Meta UI left in the app is:

- **`src/components/WorkspaceSettingsModal.tsx` lines 264–313** — Meta section inside the Workspace edit modal. This renders a `<select>` of `metaAdAccounts` + a "Link" button **but never triggers the OAuth flow**. The select only chooses among ad accounts that `metaService.getConnection()` already returned (i.e., the user must have already connected externally). The `startOAuthFlow` call was always tied to the deleted sidebar button.
- **`src/App.tsx` lines 8416, 8576, 8694, 8711, 8765, 11051, 11102, 11104** — `metaConnection?.connected && canUse(userPlan, 'pushToMeta')` gates the per-slide "Push to Meta" buttons inside the carousel/batch output. These rely on `metaConnection` having been set by the deleted OAuth flow.

### 1.4 Where `metaService` is referenced vs. where it is **not**

```text
DEFINED:   src/services/metaService.ts
    ├─ MetaService.startOAuthFlow(userId)   ← ONLY DEFINED, NEVER CALLED FROM UI
    ├─ MetaService.getConnection()
    ├─ MetaService.selectAccount(accountId)
    ├─ MetaService.syncPerformance(workspaceId)
    ├─ MetaService.disconnect()
    ├─ MetaService.pushCreative(...)
    └─ MetaService.pushCreativePack(...)
```

`grep "startOAuthFlow" src/` returns exactly **1** match — the definition itself in `metaService.ts`. Zero call sites. Compare against `metaService.getConnection()` (3 call sites), `metaService.pushCreative` (5 call sites), `metaService.syncPerformance` (2 call sites), `metaService.disconnect` (0 call sites) — they have callers, only `startOAuthFlow` is orphaned.

This means **there is currently no UI button that opens the Meta OAuth popup**. A user can never connect their Meta account through the app.

### 1.5 Where the Meta UI should live now (recommended fix)

Three viable options. All three are reversible because no schema migration is needed — only UI plumbing.

**Option A — Restore the entry to the right-hand `MenuSidebar`'s `MenuItems` component (recommended).**
The `MenuItems` component (defined at `src/App.tsx:1317+`, rendered at `src/App.tsx:1161`) is the single source of truth for menu entries. It currently lists:

```text
new          → fa-plus        → New Project
bookmarks    → fa-bookmark    → Saved Renders (favorites sheet)
settings     → fa-gear        → Settings (user-level modal)
theme        → fa-sun/-moon   → Toggle Theme
lang         → fa-language    → Toggle Language
tutorial     → fa-play        → Tutorial
tour         → fa-circle-…    → Spotlight Tour
billing      → fa-credit-card → Manage Billing
upgrade      → fa-arrow-up    → Upgrade
logout       → fa-right-from-… → Logout
```

Two new items would slot in here cleanly, between `Team` (formerly) and `Billing`:

- **`fa-brands fa-meta` — "Connect Meta Ads"** or **"Meta Ads"** depending on connection state. The handler calls `metaService.startOAuthFlow(user.uid)` plus a `refreshMetaConnection()` that re-invokes `metaService.getConnection()` and updates `setMetaConnection`. Bilingual labels via `useT()`.
- Optionally a second entry **"Sync Now"** that becomes active when connected, calling `metaService.syncPerformance(activeWorkspaceId)`.

This requires one new prop on `MenuItems` (`onConnectMeta` + `onSyncMeta`) wired down from `MenuSidebar` to `MenuItems` (a 6-line change in `src/App.tsx`).

Pros: matches the pre-Phase 26 mental model exactly, one icon, the menu drawer (mobile) already shares the same `MenuItems` so the entry would appear on phone too.
Cons: side-menu can grow longer — current `MenuItems` is already ~10 items, but the right-side collapsed strip can compact into icons.

**Option B — Add a "Connect Meta" entry inside `WorkspaceSettingsModal.tsx`** alongside the existing ad-account picker (lines 264–313). Above the `<select>`, add a single "Connect Meta Ads" button that opens the OAuth popup if not connected, or shows the picker/sync/disconnect buttons if connected.
Pros: keeps Meta + Workspace + Ad-account concerns in one dialog (Phase 14 spec implied this).
Cons: the modal is gated `showMetaSection = isEdit && isMetaEligible(plan)` — first-time scale users may never realize they need to edit a workspace to find this.

**Option C — Top-nav context bar, next to the `WorkspaceSwitcher`**. The top bar already has `(canUseWorkspaces && workspaces.length > 0) && <WorkspaceSwitcher ...>` at `src/App.tsx:6638-6647`. Add a Meta connection chip right next to it.
Pros: visible always, not behind any menu.
Cons: top bar is already crowded (5 step tabs + workspace switcher + brand save indicator).

**Recommendation:** **Option A** — keep the convention. It matches the pre-Phase-26 design, requires the smallest change, and is naturally present in both the desktop right-sidebar and the mobile menu drawer (because both use `MenuItems`).

### 1.6 Affected files

If Option A is chosen:

- `src/App.tsx` — add Meta state hooks (`useState<MetaConnection>`); wire `MenuItems` with two new props; pass connection state down to `MenuSidebar`; refresh `metaConnection` after a successful OAuth callback.
- `src/services/metaService.ts` — no changes expected.
- `src/hooks/useBillingState.ts` — possibly a `reauthRequired` boolean for the "token expired" variant.
- `firestore.rules` — no change; rules still gate `/avatars/**` and `/workspaces/**` per user/team.
- `firestore.indexes.json` — no change.

---

## 2. ISSUE 2 — `FunnelSettingsForm` placement

### 2.1 Current state of the component

`src/components/FunnelSettingsForm.tsx` exists (592 lines) and contains a complete, fully-functional Phase 14 Layer 1 form — funnel-type dropdown (4 closed values), conditional fields per type (paid: AOV, has-HTO, hto-price, hto-rate, ROAS strict 3-option enum; free-webinar: offer price / attendance / buy rate; lead-magnet-call: offer price / lead-to-close rate), business advisory cards (`noHto`, `lowValue`) with the "احجز مكالمة" CTA, monthly-review prompt, full results card with cap warning. SC-11 lint clean.

It is **completely orphaned**:

```bash
grep "FunnelSettingsForm" src/
src/components/FunnelSettingsForm.tsx:1       // self-import (file header)
src/components/FunnelSettingsForm.tsx:79      // export interface Props
src/components/FunnelSettingsForm.tsx:242     // export default function
src/components/FunnelSettingsForm.tsx:248     // ): FunnelSettingsFormProps
```

There are **zero import sites**. `App.tsx` does not mount the component anywhere; `InputForm.tsx` does not embed it; the WorkspaceSwitcher / WorkspaceSettingsModal do not render it. The Phase 14 batch 01 commit (`104698b`) created the file but never wired it in. Even the Phase 14 spec & batch report didn't catch this — neither `specs/phase-14/spec.md` nor `specs/phase-14/plan.md` §"Phase A" enumerated a specific UI placement for the form.

### 2.2 What `FunnelSettingsForm` requires

```ts
interface FunnelSettingsFormProps {
  workspaceId: string | null;     // REQUIRED
  accountId: string | null;      // REQUIRED
  workspaceName?: string;
  isDarkMode?: boolean;
  onSaved?: (settings: FunnelSettingsDoc) => void;
}
```

Per the contract (`specs/phase-14/contracts/funnelSettings.md`) and `functions/src/funnelSettings.ts`:

- `settings` are scoped per `(workspaceId, accountId)` pair at the Firestore path `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings/current`. Therefore `accountId` here == the workspace's **linked Meta ad account id** (`Workspace.metaAdAccountId`, per `src/types.ts:413`).
- The form gates on `workspaceId && accountId` — if either is null, it shows *"يرجى اختيار مساحة عمل وحساب ميتا أولاً."* (`src/components/FunnelSettingsForm.tsx:319-322`).
- It also calls `metaService.getConnection()`-like callables (`getFunnelSettings` / `saveFunnelSettings` / `dismissAdvisory`) which themselves check the user's plan and the linked-account match.

So the form is **only meaningful** when:

1. A workspace exists and is selected.
2. That workspace is linked to a Meta ad account (`workspace.metaAdAccountId` is non-empty).
3. The user is on a plan that supports per-account settings (Pro for funnel settings; the contract is gated `permission-denied` for non-Scale on cross-account reads, but `saveFunnelSettings` itself is open to the account owner).

That means the natural place to live is **inside the workspace context**, after the Meta connection is established.

### 2.3 Where it should be placed (recommended)

The Phase 14 spec (`specs/phase-14/spec.md:56–67`) implicitly couples the form with the "Meta account connected → ad-account selected → funnel settings flow": *"After connecting a Meta ad account and selecting which account to monitor, the user fills a required 'Funnel Settings' form."*

The current layout does not have a dedicated "settings" page; all settings live inside modals or tabs of an open workspace. The cleanest placements are, in order of preference:

**Option 1 — Render at the top of the `InputForm` (Step 1), but only when funnel settings are missing for the active workspace** (recommended).
- The form becomes the FIRST thing the user sees after switching to a brand workspace that has no `settings/current` doc yet.
- After save, the form collapses into a read-only summary (the existing "Results card" inside the same component).
- Once `getFunnelSettings(...).settings !== null`, the form stays in the normal `InputForm` view; only the first entry to a workspace exposes the funnel-type dropdown.
- Wiring: pass `funnelSettings={...}` prop or use the existing `useFunnelSettings(workspaceId, accountId)` hook into the InputForm's top section; the "fill me first" gating matches spec §2.1 *"the required Funnel Settings form appears before any performance data"*.

**Option 2 — Embed in `WorkspaceSettingsModal.tsx` as a new section**.
- Inside the existing `WorkspaceSettingsModal` (which already houses the ad-account picker), add a new "Funnel economics" section that mounts `FunnelSettingsForm`.
- Pros: reuses an existing modal that already binds to `(workspaceId, accountId)`.
- Cons: the modal is shown only on demand (pen-icon click). It is not part of the natural first-time flow, so users may never see it.

**Option 3 — Standalone full-screen page added between "Workspace selection" and "Step 1"**.
- New route/modal: "Workspace Settings → Funnel Settings" reachable from a pen-icon adjacent to the workspace switcher.
- Pros: a dedicated focus mode for editing, matches the spec's notion of a "required form".
- Cons: extra navigation step, more code.

**Recommendation:** **Option 1**, because:

1. The spec already says the form is required before any performance data — placing it at the top of Step 1 makes that contract implicit in the workflow.
2. `InputForm` already receives `activeWorkspace` as a prop (line 53 of `InputForm.tsx`), so the wiring touches one prop already in flight.
3. No new modal/route/side-menu entry needed.
4. The existing component gracefully handles "no settings yet" (`settings === null` → empty form) AND "settings exist" (results card) — it covers both first-time and review cases without a separate component.

A hybrid is acceptable too: mount it inside `InputForm` for first-time onboarding AND expose it as a collapsible "Funnel Economics" section inside `WorkspaceSettingsModal` for review edits. Both surfaces call the same component and the same `getFunnelSettings` / `saveFunnelSettings` callables.

### 2.4 Affected files (Option 1)

If Option 1 is chosen:

- `src/components/InputForm.tsx` — add a new optional prop `funnelSettingsBanner` (or render a top-level `FunnelSettingsForm` when `settings === null && activeWorkspace?.metaAdAccountId`).
- `src/components/FunnelSettingsForm.tsx` — minor prop-sharing refactor (already supports dark mode + workspace id).
- `src/App.tsx:6834` — pass new props down to `<InputForm>`.
- `src/types.ts` — no schema change (`settings/current` doc already exists per Phase 14 data model).
- `functions/src/index.ts` — no change (callables already exported).

If Option 2 is chosen:

- `src/components/WorkspaceSettingsModal.tsx` — render `<FunnelSettingsForm workspaceId={workspace.id} accountId={workspace.metaAdAccountId} />` in a new section below the existing Meta section.
- `src/App.tsx:11051` — no change (modal already gets `metaAdAccounts`, has access to active workspace).

---

## 3. ISSUE 3 — Avatar bleed across workspaces

### 3.1 What the user observed

Creating a fresh brand workspace and switching to it surfaces avatars that were saved in (or are associated with) other workspaces, instead of starting empty.

### 3.2 Storage layout

```text
Firestore: users/{uid}/avatars/{avatarId}
    fields:
      name, productName, ..., createdAt
      workspaceId?: string        ← OPTIONAL (declared in src/types.ts:475)
                                   ← NEVER WRITTEN (this is the bug)
```

The avatar is stored on the user document, **not** on the workspace document. Avatars use a single flat collection scoped only by the user's UID; the workspace scoping is intended to be enforced by a `workspaceId` field on each avatar doc.

### 3.3 What the code expects vs. what the code writes

```ts
// src/types.ts (correct shape)
export interface AudienceAvatar {
  id: string;
  workspaceId?: string;   // ← optional; if missing, treated as "default workspace" by the filter
  ...
}

// src/App.tsx:1810 — handleSaveAvatar strips undefined but does NOT inject workspaceId
const cleanAvatar = Object.fromEntries(Object.entries(avatar).filter(([, v]) => v !== undefined));
const docRef = await addDoc(avatarsRef, { ...cleanAvatar, createdAt: Date.now() });

// src/App.tsx:2281 — client-side filter
const filteredAvatars = canUseWorkspaces && activeWorkspaceId
    ? avatars.filter(a => (a.workspaceId || defaultWsId) === activeWorkspaceId)
    : avatars;
```

The interpreter treats `undefined` as if it were `defaultWsId`. So an avatar with no `workspaceId` is "filed" under the default workspace's id.

```ts
// src/components/InputForm.tsx:595-696 — buildAvatarPayload
const buildAvatarPayload = (name: string) => ({
  name,
  productName: inputs.productName,
  ...
  // NO workspaceId FIELD
  aspectRatio: inputs.aspectRatio,
  ...
});
```

`buildAvatarPayload` does not include `workspaceId`. It is the **only** writer of avatars; `App.tsx:1811` and `App.tsx:1837` are merely the Firestore `addDoc` / `setDoc` wrappers around the payload that `InputForm` builds.

So:

- Every avatar saved by the standard "Save as New" or "Overwrite" path lands in Firestore **without** a `workspaceId`.
- The client-side filter then maps those avatars to the **default workspace**, regardless of which workspace the user was viewing when they saved the avatar.

### 3.4 Symptom trace

The bleeding depends on which workspace was active when the avatar was saved:

| Avatar saved in workspace | `workspaceId` on doc | Default-workspace view (`activeWorkspaceId = defaultWsId`) | Brand-workspace view (`activeWorkspaceId = brandWsId`) |
|---|---|---|---|
| Default workspace (created before any brand ws) | undefined | **Shows (correct)** | Hides (correct) |
| Brand workspace "Coffee Roastery" (active at save time) | undefined | **Shows (WRONG — bleeds into default)** | Hides (correct — but user can't see what they saved) |
| Brand workspace "Coffee Roastery" after fix | `"Coffee Roastery"` | Hides (correct) | Shows (correct) |

So the user's "fresh workspace shows avatars from other workspaces" is the inverse of the missing-write bug:

1. The user is on the **default** workspace, saves 3 avatars (all `workspaceId = undefined`).
2. The user clicks "+ New Workspace", creates "Coffee Roastery".
3. They switch to "Coffee Roastery".
4. The frontend filter says `(undefined || defaultWsId) === Coffee Roastery` → false → 0 avatars. ✅ (Which is what they expected — fresh workspace, empty.)
5. **But** if they switch back to Default, they see their 3 avatars. If they had been expecting any of those 3 to live in Coffee Roastery, they were silently misfiled.

The reverse-direction leak the user observed most plausibly happens through one of three scenarios:

1. **The user is on a non-Scale plan** (`canUseWorkspaces === false`) — the filter short-circuits to `avatars` (line 2283), so every avatar ever saved is visible everywhere regardless of workspace.
2. **Workspace soft-delete + restore** changes `isDefault` ordering between workspaces, so `defaultWsId` flips and previously saved (workspace-less) avatars move their visible "owner" from one workspace to another without the user touching a single avatar.
3. **Quota / billing re-fetch** caused `workspaces` to be fetched before the `avatars` snapshot finished, briefly showing all avatars in any new active workspace — but this requires a race that's currently unguarded.

Across all three, the **root cause is the same**: `buildAvatarPayload` does not write `workspaceId`, so the filter's "fallback to default workspace" path is wrong about every avatar.

### 3.5 Where the workspace id should come from

`InputForm` already accepts `activeWorkspace?: Workspace | null` (line 53). So the fix is local to the form:

```ts
const buildAvatarPayload = (name: string) => ({
  ...all existing fields,
  workspaceId: activeWorkspace?.id ?? null,   // ← add this line
});
```

`activeWorkspace?.id` will be `null` on plans without workspaces (Pro), in which case the avatar is correctly "workspace-less" and the filter's `canUseWorkspaces && activeWorkspaceId` gate short-circuits to "show all" — exactly the desired behavior for non-workspace users. For Scale users with a brand workspace active, the avatar will be tagged with that workspace id and the client-side filter will hide it correctly when switching to the default workspace.

**Backfill strategy (existing avatars without `workspaceId`)**: a one-time migration is required for the small handful of existing avatars written before this fix. Two options:

- **Server-side `backfillAvatars` callable** that walks `users/{uid}/avatars`, checks each for `workspaceId`, and backfills `workspaceId = defaultWsId` (or, better, asks the user via a one-time prompt). This is reversible and idempotent.
- **Lazy backfill on read.** When the client filter encounters an avatar without `workspaceId`, it transparently tags it with `defaultWsId` and writes it back. Risky — silent mutation in user-visible code paths.

Recommendation: a dedicated `backfillAvatarWorkspaceId` callable with idempotency is safer and reversible.

### 3.6 Affected files

- `src/components/InputForm.tsx:595` — add `workspaceId: activeWorkspace?.id ?? null` to `buildAvatarPayload`. ~1 line.
- `src/App.tsx:1810`, `src/App.tsx:1837` — no schema change required; they already use spread.
- `functions/src/` — optional `backfillAvatarWorkspaceId` callable, only for the migration of pre-existing records.
- `firestore.rules` — `match /avatars/{avatarId}` already enforces `request.auth.uid == userId` plus team-member read access, so adding `workspaceId` doesn't need new rule changes.

---

## 4. Summary

| Issue | Root cause | Recommended fix | Files affected | Reversible? |
|---|---|---|---|---|
| 1. Meta UI gone | Phase 26 deleted the sidebar block; nothing replaced it in the new `MenuItems`. `metaService.startOAuthFlow` has **zero** call sites. | Restore a Meta entry in `MenuItems` (Option A) — calls `metaService.startOAuthFlow(user.uid)`, refreshes connection. | `src/App.tsx` only. ~20 lines. | Yes — purely UI. |
| 2. `FunnelSettingsForm` orphaned | Created in batch 01 (`104698b`) but never imported. Spec doesn't pin a placement. | Mount at top of `InputForm` when active workspace has no `settings/current` doc + workspace has a linked Meta ad account (Option 1). | `src/components/InputForm.tsx` + `src/App.tsx:6834`. | Yes — purely frontend wiring. |
| 3. Avatar bleed | `buildAvatarPayload` in `InputForm.tsx:595` never writes `workspaceId`. All avatars land at `users/{uid}/avatars/*` without the field. Filter `(a.workspaceId \|\| defaultWsId) === activeWorkspaceId` then mis-files them under the default workspace. | Add `workspaceId: activeWorkspace?.id ?? null` to `buildAvatarPayload` + a one-time server-side backfill for legacy rows. | `src/components/InputForm.tsx` (1 line); optional `functions/src/backfillAvatarWorkspaceId.ts`. | Backfill is reversible (idempotent); new writes are correct from the start. |

---

## 5. Open questions for the maintainer

1. **Meta OAuth callback URL** — `src/services/metaService.ts:11` hard-codes `https://europe-west1-proadsai-saas.cloudfunctions.net/metaOAuthCallback`. Confirm whether that Cloud Function still exists at this URL, or whether `metaOAuthCallback` was renamed/removed during a backend cleanup. If it doesn't exist, Option A still proceeds (the button would error gracefully), but the popup will never finish.
2. **Avatar backfill policy** — for pre-existing legacy avatars (no `workspaceId`), should they all be assumed to belong to the **default workspace**, or should the user be prompted to assign them?
3. **FunnelSettings + non-Meta users** — should Pro users (no Meta account yet) ever see the form? The form's gate `!workspaceId || !accountId` returns the bilingual "please select a workspace and Meta account first" message. Does that count as "form is gated before any performance data" per spec §2.1, or should there be a banner-style placeholder when Meta isn't connected?
4. **Settings modal size** — `WorkspaceSettingsModal.tsx` is already 360 lines; embedding `FunnelSettingsForm` would inflate it to ~900 lines and add a second scrolling region. Confirm Option 2's UX (settings in modal) is preferred over Option 1 (settings inline at top of Step 1).

---

*End of investigation.*
