# fix-workspace-bleed — Fix report

**Date:** 2026-09-18
**Branch:** `fix-workspace-bleed`
**Path:** `D:\proads-worktrees\fix-workspace-bleed\specs\fix-workspace-bleed\fix-report.md`
**Deep investigation:** [`specs/fix-workspace-bleed/investigation.md`](./investigation.md)

---

## §1. Scope

Front-end only. Three changes:

1. Sidebar's "Meta Ads Connected / _account name_" sub-label
   (`src/App.tsx` `MenuItems`) was reading
   `metaConnection.selectedAccountId` (user-level, last-picked). It now reads
   from `activeWorkspace.metaAdAccountName` when on a workspace plan, with
   the user-level fallback only on non-workspace plans — matching the gate
   `activeMetaAccountId` (App.tsx:4216) already uses.
2. The Meta account picker's `currentSelectedId` (App.tsx:13155) was reading
   the same user-level field. Same fix applied — now workspace-scoped on
   workspace plans, user-level on non-workspace plans.
3. The workspace dropdown (`src/components/WorkspaceSwitcher.tsx`) gained
   a text-filter input at the top. Hidden when the list has 0 or 1
   entries. Real-time substring match on `ws.name`, case-insensitive.
   No-results branch renders the new i18n string `workspace.switcher.no_results`.

Backend, LEG A, soft-deleted workspaces, and naming are out of scope per
the investigation §7.

---

## §2. Diff summary

```text
 src/App.tsx                          | 88 ++++++++++++++++++++++++++++++------
 src/components/WorkspaceSwitcher.tsx | 72 ++++++++++++++++++++++++++++-
 src/i18n.tsx                         | 11 +++++
```

(`functions/package-lock.json` also changed because `npm install` in
`functions/` was run as part of the verification; the change is the
pre-existing lockfile, not source.)

---

## §3. Audit of every frontend read of `selectedAccountId`

The investigation flagged `selectedAccountId` as the field that bleeds.
After the fix, every read of this field in the frontend falls into one of
four categories — and only one of them is for display:

### §3.1 Display (now fixed)

- **`src/App.tsx:1532`** — the sidebar sub-label, formerly
  `const selectedId = metaConnection?.selectedAccountId ?? null;`. Removed.
  Replaced with `const subLabel = metaAccountSubLabel;` where
  `metaAccountSubLabel` is precomputed by the parent at App.tsx:4281–4299
  with the workspace-aware gate.

- **`src/App.tsx:13155`** — the Meta account picker's
  `currentSelectedId`, formerly
  `currentSelectedId={metaConnection?.selectedAccountId ?? null}`. Replaced
  with `currentSelectedId={metaAccountPickerCurrentId}`. The new value is
  precomputed by the parent at App.tsx:4307–4310 with the same gate.

### §3.2 Display-only computed fallbacks (now used only on non-workspace plans)

- **`src/App.tsx:4229`** — inside `activeMetaAccountId` memo:
  `if (!canUseWorkspaces) { return metaConnection?.selectedAccountId ?? metaConnection?.adAccounts?.[0]?.id ?? null; }`
  This is the existing pre-fix code path for users on non-workspace plans.
  It is the correct fallback for those plans (no per-workspace link). NOT
  changed.

- **`src/App.tsx:4288`** — inside the new `metaAccountSubLabel` memo:
  `const id = metaConnection?.selectedAccountId ?? null;` on the
  `!canUseWorkspaces` branch only. Same correct fallback for non-workspace
  plans.

- **`src/App.tsx:4308`** — inside the new `metaAccountPickerCurrentId`
  memo: `if (!canUseWorkspaces) return metaConnection?.selectedAccountId ?? null;`
  Same correct fallback for non-workspace plans.

These three fallbacks preserve the existing pre-fix behaviour for users on
non-workspace plans. The `canUseWorkspaces === true` branch is the one
that used to bleed; it now reads from the workspace.

### §3.3 State-shape resets (not a bleed surface)

- **`src/App.tsx:3866`, `src/App.tsx:3891`, `src/App.tsx:4186`** —
  `setMetaConnection({ ..., selectedAccountId: null, ... })` on error /
  disconnect paths. These reset the entire connection state shape on
  `getConnection` failure / explicit disconnect. They are NOT reads; they
  are writes that null the field when the connection is cleared. NOT
  changed.

### §3.4 Type-shape declarations (not a bleed surface)

- **`src/services/metaService.ts:65`, `:139`** — the `MetaConnection`
  interface declares `selectedAccountId: string | null` as a field, and
  the error fallback returns an object with that field set to `null`.
  Both are interface-shape, not bleed surfaces. NOT changed.

### §3.5 Functional actions (no `selectedAccountId` reads; already workspace-scoped)

- **Sync Now** (`handleSyncMeta`, `src/App.tsx:4184–4204` →
  `metaService.syncPerformance(activeWorkspaceId)`) — passes the
  workspace id, server-side LEG B inline picks
  `users/{uid}/workspaces/{wid}/private/metaConnection.accountId`. Never
  reads `selectedAccountId`. NOT changed.

- **Change Account** (`handleMetaAccountSelect`,
  `src/App.tsx:3964–4064`) — calls
  `metaService.selectAccount(accountId)` (which writes the user-level
  mirror), then `workspaceService.linkMetaAccountToWorkspace` (which
  writes the workspace link), then
  `metaService.connectAccountToWorkspace` (which writes the workspace
  private doc). All three are writes — none reads `selectedAccountId` to
  decide what to do. NOT changed.

- **Push creative / pack** (`metaService.pushCreative*`) — already
  workspace-scoped on the backend (functions/src/index.ts:3919–3922 reads
  `wsData.metaAdAccountId` only). NOT changed.

- **OAuth callback / connect** (`handleConnectMeta`,
  `src/App.tsx:4124`) — opens the OAuth popup. No `selectedAccountId`
  involvement. NOT changed.

**Conclusion:** the two bleed surfaces (sidebar sub-label + picker
highlight) were the only reads that mattered for the workspace-isolation
fix. All three other categories are correct as-is or only used on
non-workspace plans.

---

## §4. The fix in code

### §4.1 Parent computes `metaAccountSubLabel`

`src/App.tsx:4281–4299` — single computation, parent-owned, consumed by
both the desktop MenuSidebar and the mobile-overlay MenuItems:

```ts
const metaAccountSubLabel = useMemo<string | null>(() => {
    if (!metaConnection?.connected) return null;
    if (activeWorkspaceNeedsMetaAccount) return null;
    if (canUseWorkspaces) {
        const name = activeWorkspace?.metaAdAccountName;
        return name && name.length > 0 ? name : null;
    }
    const id = metaConnection?.selectedAccountId ?? null;
    const account = id ? metaConnection?.adAccounts?.find((a) => a.id === id) : undefined;
    const name = account?.name;
    return name && name.length > 0 ? name : (id ?? null);
}, [
    metaConnection?.connected,
    metaConnection?.selectedAccountId,
    metaConnection?.adAccounts,
    activeWorkspaceNeedsMetaAccount,
    canUseWorkspaces,
    activeWorkspace?.metaAdAccountName,
]);
```

The sub-label is sourced from:

- **Workspace plans:** `activeWorkspace.metaAdAccountName` — a field on
  `users/{uid}/workspaces/{wid}` that Phase 14's
  `linkMetaAccountToWorkspaceImpl` (functions/src/index.ts:7297–7299) writes
  in the same transaction that sets `metaAdAccountId`. The name is
  stored at the workspace level, never on the user-level mirror.
- **Non-workspace plans:** the user-level
  `metaConnection.selectedAccountId` → match in
  `metaConnection.adAccounts` → `name`. Mirrors the pre-fix behaviour
  exactly for those users.

`activeWorkspace` is the existing memo at `src/App.tsx:4208–4211` (the
same memo `activeMetaAccountId` uses at line 4216). It is re-derived from
`workspaces.find(w => w.id === activeWorkspaceId && !w.deletedAt)` on every
state change, so the sub-label updates on workspace switch as soon as the
Firestore snapshot at App.tsx:2751–2767 delivers the new `workspaces` array
(the snapshot is keyed on user-id only, but the active-workspace id is the
switch trigger; the active-workspace memo re-derives synchronously).

### §4.2 Parent computes `metaAccountPickerCurrentId`

`src/App.tsx:4307–4310`:

```ts
const metaAccountPickerCurrentId = useMemo<string | null>(() => {
    if (!canUseWorkspaces) return metaConnection?.selectedAccountId ?? null;
    return activeWorkspace?.metaAdAccountId ?? null;
}, [canUseWorkspaces, activeWorkspace?.metaAdAccountId, metaConnection?.selectedAccountId]);
```

Same gate, but returns the ID (not the human-readable name). Used by
`<MetaAccountPickerModal currentSelectedId={...}>` at App.tsx:13155. The
picker highlights the active workspace's account as currently-selected on
workspace plans; user-level selection otherwise.

### §4.3 Sidebar renders the precomputed sub-label

`src/App.tsx:1522–1554` (inside `MenuItems`):

```tsx
{
  key: 'meta',
  el: (() => {
    const isConnected = !!metaConnection?.connected;
    // fix-workspace-bleed — sub-label is precomputed by the parent
    // using the same gate `activeMetaAccountId` uses (App.tsx:4216).
    // On workspace plans the value tracks the active workspace's
    // `metaAdAccountName`; on non-workspace plans it falls back to
    // the user-level selected account. The parent-owned computation
    // is the single source of truth — no second lookup here.
    const subLabel = metaAccountSubLabel;
    return (
      <MenuItem
        key="meta"
        icon="fa-brands fa-meta"
        label={isConnected ? t('topbar.menu_meta_connected') : t('topbar.menu_meta_connect')}
        subLabel={subLabel}
        onClick={
          isConnected
            ? (metaConnection?.tokenExpiring ? props.onConnectMeta : props.onSyncMeta)
            : props.onConnectMeta
        }
      />
    );
  })(),
},
```

The previous lookup (`selectedId` + `selectedAccount?.name`) is gone.
The destructure at App.tsx:1489 adds `metaAccountSubLabel` so it's a
named binding inside the component body.

### §4.4 MenuSidebar forwards `metaAccountSubLabel`

The new prop is added to `MenuSidebarProps` (line 1144) and forwarded
to the inner `<MenuItems>` (line 1258, desktop sidebar). Both MenuSidebar
call sites pass `metaAccountSubLabel={metaAccountSubLabel}` (App.tsx:11638
and App.tsx:11763, mobile overlay).

### §4.5 Picker highlight uses the precomputed id

`src/App.tsx:13214` — the picker highlight id is replaced:

```tsx
currentSelectedId={metaAccountPickerCurrentId}
```

The MetaAccountPickerModal uses this prop only as a `isCurrent` highlight
flag inside `MetaAccountPickerModal.tsx:162` (`const isCurrent = acc.id === currentSelectedId;`).
It is display-only — the picker's onClick callback passes the click's
account id to `handleMetaAccountSelect`, never the highlighted one. So
this is a UX consistency fix, not a functional bug.

---

## §5. WorkspaceSwitcher search bar

`src/components/WorkspaceSwitcher.tsx`:

### §5.1 State and memo

Added at line 142 (after the existing `visibleWorkspaces`):

```ts
const showSearch = visibleWorkspaces.length > 1;
const [filter, setFilter] = useState('');
const filteredWorkspaces = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return visibleWorkspaces;
    return visibleWorkspaces.filter(ws =>
        (ws.name ?? '').toLowerCase().includes(q),
    );
}, [visibleWorkspaces, filter]);
useEffect(() => {
    if (!open) setFilter('');
}, [open]);
```

- `showSearch` gates the input's rendering. Single-workspace plans never
  see it; the cost is zero for them.
- `filter` is local state, reset on close (effect keyed on `open`).
- `filteredWorkspaces` is a `useMemo` over the visible list and the
  query string. No debounce — the list is bounded by the per-user
  workspace cap (10), and recomputing on every keystroke is cheap.

### §5.2 Render

Added inside the dropdown panel just below the "Brand Workspaces" header,
above the list:

```tsx
{showSearch && (
  <div className="px-3 py-2 border-b border-white/[0.04]">
    <div className="relative">
      <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 pointer-events-none" aria-hidden="true" />
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={t('workspace.switcher.search_placeholder')}
        aria-label={t('workspace.switcher.search_placeholder')}
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md text-[10px] text-white placeholder:text-slate-500 pl-7 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/60 focus:border-blue-500/60"
      />
      {filter && (
        <button
          type="button"
          onClick={() => setFilter('')}
          onMouseDown={(e) => e.stopPropagation()}
          aria-label={t('workspace.switcher.clear_search')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded text-slate-500 hover:text-white hover:bg-white/[0.08] transition-colors"
        >
          <i className="fa-solid fa-xmark text-[9px]" aria-hidden="true" />
        </button>
      )}
    </div>
  </div>
)}
```

The `onMouseDown={(e) => e.stopPropagation()}` on the input and the clear
button prevents the `mousedown` listener bound to `ref` (line 142 in the
original, now line 173) from treating the input as "outside" the
dropdown — otherwise typing into the input would close the panel
mid-keystroke.

### §5.3 No-results branch

Distinct from U3 ("no workspaces at all") because the user has
workspaces, the current query just excludes all of them:

```tsx
) : filteredWorkspaces.length === 0 ? (
  <div className="px-3 py-4 text-center">
    <p className="text-[10px] text-slate-400">{t('workspace.switcher.no_results')}</p>
  </div>
) : (
  filteredWorkspaces.map(ws => (
    /* ... identical to the pre-fix render, just iterating over filteredWorkspaces */
  ))
)
```

### §5.4 Existing dropdown chrome unchanged

- "Brand Workspaces" header: unchanged.
- Edit pencil for non-team-members: unchanged.
- Default badge: unchanged.
- "New Workspace" footer button: unchanged.
- Switch-guard modal: unchanged.

---

## §6. i18n additions

`src/i18n.tsx`:

| key | EN | AR |
|---|---|---|
| `workspace.switcher.search_placeholder` | `Search workspaces…` | `ابحث عن مساحة عمل…` |
| `workspace.switcher.clear_search` | `Clear search` | `مسح البحث` |
| `workspace.switcher.no_results` | `No workspaces found` | `لا توجد مساحات عمل مطابقة` |

Arabic-first per the i18n contract (existing keys already follow this
order — see `workspace.switcher.new_workspace` at line 1935 and
`workspace.switcher.default_badge` at line 1937).

The `search_placeholder` key mirrors the global `'search': 'Search...'`
key (line 21) in spirit but is workspace-specific — the search is on a
dropdown, not a global input, so the copy lives under `workspace.*` to
keep namespace boundaries clean.

---

## §7. Verification

### §7.1 Build (`npm run build` at repo root)

```text
> ai-ads-pro@0.0.0 build
> tsc -b && vite build

vite v7.3.5 building client environment for production...
transforming...
✓ 124 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                                 1.00 kB │ gzip:   0.53 kB
dist/assets/index-Gd0CvlEQ.css                130.10 kB │ gzip:  20.19 kB
dist/assets/MetaAccountPickerModal-DqZwaBN7.js  5.46 kB │ gzip:   1.95 kB
dist/assets/MetaPagePickerModal-DD2sLwhl.js    6.50 kB │ gzip:   2.23 kB
dist/assets/JoinTeam-YyEcFM33.js                7.68 kB │ gzip:   2.00 kB
dist/assets/WhatsWorkingDashboard-D2yp-0ME.js  12.32 kB │ gzip:   2.94 kB
dist/assets/Billing-CRKDY777.js                15.43 kB │ gzip:   4.32 kB
dist/assets/PerformanceDashboard-Cb3tTqk7.js   20.13 kB │ gzip:   5.72 kB
dist/assets/FunnelSettingsForm-Cv41BR8C.js     30.73 kB │ gzip:   7.86 kB
dist/assets/jszip.min-BYLLotwG.js               96.43 kB │ gzip:  28.34 kB
dist/assets/InputForm-jwM_D0Xt.js              107.33 kB │ gzip:  26.39 kB
dist/assets/index-CLIhMUqK.js                1,834.88 kB │ gzip: 478.51 kB

(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking:
https://rollupjs.org/configuration-options/#output-manualchunks
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

✓ built in 11.58s
```

Exit code 0. The chunk-size warnings are pre-existing (the same bundle
sizes appear with the changes stashed). The 1.8 MB main chunk is
Firebase + jszip, both long-standing deps.

A note on the initial run: the first `npm run build` invocation failed
with two pre-existing TS errors pointing at
`functions/src/copyScoringGate.ts:1326` (`Cannot find module 'openai'`)
and `functions/src/generators.ts:11` (`Cannot find module
'firebase-functions/v2/https'`). Both errors are reachable from the
frontend because `tsconfig.app.json` includes
`functions/src/retargetingObjections.ts`, which imports
`functions/src/types.ts`, which imports
`functions/src/generators.ts`, which transitively imports
`functions/src/copyScoringGate.ts` and `firebase-functions/v2/https`.
None of these files are touched by the fix; verified by `git stash` +
`npm run build` reproduces the same two errors on the bare `3351ba1` tip.

Running `npm install` in `functions/` brings the missing
`firebase-functions` / `openai` / `@google-cloud/tasks` /
`@google-cloud/kms` packages into `functions/node_modules/`. After that,
TS's module resolution walks up from `functions/src/`, finds the
modules, and the frontend `tsc -b` step completes. Subsequent
`npm run build` runs at the repo root are clean (exit 0, this run).

### §7.2 Vitest (`npx vitest run` at repo root)

```text
 RUN  v4.1.4 D:/proads-worktrees/fix-workspace-bleed


 Test Files  8 passed (8)
      Tests  106 passed (106)
   Start at  10:27:57
   Duration  9.15s (transform 1.86s, setup 4.34s, import 5.53s, tests 4.64s, environment 33.03s)

exit=0
```

All 106 tests pass. No frontend tests exercise the new memos directly
(the existing test file `whatsWorkingDashboardRender.test.tsx` covers
the dashboard, not the sidebar sub-label).

### §7.3 Functions build (`cd functions && npm run build`)

```text
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

exit=0
```

Clean. The pre-fix step (`Remove-Item -Recurse -Force lib`) was needed
because `lib/` was missing.

### §7.4 Functions tests (`cd functions && npm test`)

Tail:

```text
  ✅ audit: 8/8 strings free of cultural-compliance trigger words ✓

═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══

contractFixtures.test: PASS

exit=0
```

Full suite summary line-by-line (counts include the full 60+ test
file chain; sample):

```text
metaCallerScope tests: 7 passed, 0 failed
workspaceRepair tests: 9 passed, 0 failed
metaPush tests: 8 passed, 0 failed
metaPushPack tests: 2 passed, 0 failed
metaSelectPage tests: 16 passed, 0 failed
metaScope.integration tests: 6 passed, 0 failed
metaOAuthCallback tests: 2 passed, 0 failed
linkMetaAccount tests: 13 passed, 0 failed
workspaceListing tests: 7 passed, 0 failed
metaConnection tests: 12 passed, 0 failed
…
929 passed, 0 failed
143 passed, 0 failed
206 passed, 0 failed
77 passed, 0 failed
223 passed, 0 failed
254 passed, 0 failed
244 passed, 0 failed
167 passed, 0 failed
═══ Results: 77 passed, 0 failed ═══
═══ Results: 57 passed, 0 failed ═══
═══ Results: 75 passed, 0 failed ═══
═══ HFF — All aspect ratio reflow fixtures passed ═══
…
contractFixtures.test: PASS
```

Every per-file "X passed, 0 failed" line is green; `contractFixtures.test:
PASS` confirms the full-suite entry point exits clean. Exit code 0.

The "FAIL-2" / "FAIL-3" lines that appear in the log are test names
("FAIL-2 — copyDiversity populated after single-hook TOV generation") —
each one is asserted to pass in the surrounding test body; the
`…passed, 0 failed` line for that file confirms it.

---

## §8. Manual repro path (post-fix expected behaviour)

The investigation's §8 repro path, with the fix applied:

1. Sign in as `islam210.06@gmail.com`.
2. Open the Boran workspace — sidebar sub-label reads "Boran english"
   (the workspace's own `metaAdAccountName` field on
   `users/{uid}/workspaces/ZVASEGdrF5qbizl4Bbug.metaAdAccountName`).
3. Open the Moataz Mashal workspace — sub-label reads "Moataz Mashal
   Official (Read-Only)" (workspace's own `metaAdAccountName`).
4. Open the Lina (a.k.a. "Test") workspace — sub-label reads "Lina
   Bayazid Boosting" (workspace's own `metaAdAccountName`).
5. Open the workspace dropdown — the search input is at the top (visible
   because there are 14 active workspaces). Type "Lina" — list filters to
   the Lina workspaces. Clear — list restores.
6. Type "xyznomatch" — list shows the "No workspaces found" message.
7. Switch to a workspace with no linked Meta account — sidebar shows the
   highlighted "Select ad account for this workspace" prompt (no
   sub-label). `metaAccountSubLabel` correctly returns `null` because
   `activeWorkspaceNeedsMetaAccount === true`.

I did NOT run `npm run dev` to drive a live browser because the fix is a
frontend-only data-binding change and the live data is on production. The
expected behaviour is locked down by the code path:

- `activeWorkspace.metaAdAccountName` is read from the in-memory
  `workspaces` array populated by the Firestore snapshot at App.tsx:2751.
- `metaConnection` is fetched in the effect at App.tsx:3837, keyed on
  `activeWorkspaceId`, so workspace switch triggers a re-fetch.
- `activeWorkspace` is the memo at App.tsx:4208, keyed on
  `[workspaces, activeWorkspaceId]`, so workspace switch updates it
  synchronously with the snapshot.
- `metaAccountSubLabel` is the memo at App.tsx:4281, keyed on
  `[metaConnection?.connected, metaConnection?.selectedAccountId,
  metaConnection?.adAccounts, activeWorkspaceNeedsMetaAccount,
  canUseWorkspaces, activeWorkspace?.metaAdAccountName]`, so the
  sub-label recomputes on every dependency change.

The data layer is workspace-isolated (investigation §2), the read is now
workspace-scoped (§3.1), and the parent owns the single computation
(§4.1). The chain is closed at the type level: every dep is either a
workspace doc field, a workspace plan gate, or an explicit memo.

---

## §9. Risk register (post-fix)

- **R1 — LEG A still iterates all accounts.** Unchanged. Five live readers
  depend on the writes LEG A produces; narrowing it is a separate
  investigation.
- **R2 — Orphan workspaces (`dueXIiFdEJKuAjSuYlUX`).** Unchanged.
  `discoverOwnedWorkspaces` correctly excludes soft-deleted workspaces
  from LEG B; LEG A still iterates their accounts. Cleanup is out of
  scope.
- **R3 — Two workspaces share `act_781389063661831`.** Unchanged. This
  is the documented "shared account" pattern; the 1:1 contract permits
  the second link after a disconnect. The fix does not touch this.
- **R4 — Pre-existing root `tsconfig.app.json` import chain pulls in
  functions files that depend on `openai` and `firebase-functions`.**
  Pre-fix condition. Resolved by `npm install` in `functions/`. Not
  touched by this fix. Documented here so the next batch doesn't
  re-discover it.
- **R5 — Search-bar input could lose focus when the workspace
  snapshot re-delivers.** The snapshot is keyed on the user id, so it
  does not re-fire on workspace switch (only the active-id changes). The
  filter input stays focused as long as the user keeps typing. Not
  observed; out-of-scope to add a focus-management test in this batch.

---

## §10. Files / line numbers cited

- `src/App.tsx:1142–1144` — new `metaAccountSubLabel` prop on `MenuSidebarProps`.
- `src/App.tsx:1188–1189` — destructure `metaAccountSubLabel` in `MenuSidebar`.
- `src/App.tsx:1255–1258` — forward `metaAccountSubLabel` to `<MenuItems>` in the desktop sidebar.
- `src/App.tsx:1462–1464` — new `metaAccountSubLabel` prop on `MenuItemsProps`.
- `src/App.tsx:1489` — add `metaAccountSubLabel` to the destructure inside `MenuItems`.
- `src/App.tsx:1522–1554` — sub-label rendering now uses the prop.
- `src/App.tsx:4281–4299` — `metaAccountSubLabel` memo (workspace-scoped on workspace plans).
- `src/App.tsx:4307–4310` — `metaAccountPickerCurrentId` memo (workspace-scoped on workspace plans).
- `src/App.tsx:11636–11639` — desktop MenuSidebar receives the new prop.
- `src/App.tsx:11761–11764` — mobile overlay receives the new prop.
- `src/App.tsx:13214` — picker `currentSelectedId` reads the precomputed value.
- `src/components/WorkspaceSwitcher.tsx:140–159` — filter state, memo, reset-on-close effect.
- `src/components/WorkspaceSwitcher.tsx:312–348` — search input block (rendered when `showSearch`).
- `src/components/WorkspaceSwitcher.tsx:411–415` — no-results branch.
- `src/components/WorkspaceSwitcher.tsx:416` — `filteredWorkspaces.map` (replaces `visibleWorkspaces.map`).
- `src/i18n.tsx:996–1000` — new EN strings.
- `src/i18n.tsx:1942–1946` — new AR strings.

---

## §11. Verification summary

| Step | Command | Exit | Result |
|---|---|---|---|
| Build | `npm run build` (repo root) | 0 | `✓ built in 11.58s`, all 124 modules transformed |
| Vitest | `npx vitest run` (repo root) | 0 | `Test Files 8 passed (8)`, `Tests 106 passed (106)` |
| Functions build | `cd functions && npm run build` | 0 | `tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/` |
| Functions test | `cd functions && npm test` | 0 | `contractFixtures.test: PASS`, per-file `X passed, 0 failed` for every file |

Status: ready to land. No production writes; no deployment; no PR opened.
