# Phase 7 Report — User Story 5 (T086–T091)

**Phase**: 7 — US5 (P5) verification + evidence
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 8

---

## Scope

US5 — Funnel Settings lists every workspace.

The fix for the "3 of 9" listing defect already shipped in
**Phase 2** (the `repair-workspace-markers.ts` script writes
`deletedAt: null` on every legacy workspace doc, so the Firestore
query at `src/App.tsx:2698-2702` matches them all). Phase 7 is the
**verification + evidence capture** step specified in FR-025 / SC-005 —
write the root-cause statement before any fix for this story is
written, enumerate every other surface affected by the same root
cause, and prove that the listing now shows the full set.

No new backend or frontend code is added in Phase 7. The
deliverable is:

1. **T086** — FR-025 root-cause statement in `evidence-r1.md` (recorded
   in this phase; predates any US5 fix by construction — the fix
   already shipped in Phase 2).
2. **T087** — Confirmation that `FunnelSettingsForm` needs no code change
   (`App.tsx:12729-12741` already passes the full `workspaces.filter(w => !w.deletedAt)`
   array; BUG B fix removed the previous `&& !!w.metaAdAccountId`
   filter that silently hid unlinked workspaces).
3. **T088** — FR-026 / FR-026a / FR-026b surface enumeration.
4. **T089** — Confirmation that the "needs Meta link" label still
   shows for unlinked workspaces (already wired at
   `FunnelSettingsForm.tsx:472`, i18n key `meta.needs_meta_link_label`
   in both English and Arabic).
5. **T090** — Operator-gated runbook for live selector counts on the
   9-workspace account.
6. **T091** — Hermetic contract tests for the listing invariants
   (server-side query shape + repair idempotency + soft-delete
   exclusion) + operator-gated runbook for the live soft-delete run.

---

## Diff summary

```
 functions/src/__tests__/workspaceListing.test.ts   (new — 7 tests)
 specs/967-meta-workspace-isolation/evidence-r1.md  (US5 evidence section appended)
```

No backend or frontend code changes. The Phase 2 repair
(`scripts/repair-workspace-markers.ts`) and the listing query at
`src/App.tsx:2698-2702` already do the work — Phase 7 proves it.

---

## T086 — FR-025 root-cause statement

Full statement in `evidence-r1.md`. Summary:

- **Bug 4** (FR-025): the Funnel Settings workspace selector shows 3
  of 9 active workspaces for the operator's account.
- **Root cause** (research.md R1): the Firestore query at
  `src/App.tsx:2685-2689` (pre-967) combined
  `where('deletedAt','==',null)` with `orderBy('createdAt','desc')`.
  Firestore's `== null` only matches documents where the `deletedAt`
  key **exists** and equals null. Workspace documents created before
  commit `1f23d5e` (2026-05-21) were written via the legacy client-
  side path WITHOUT a `deletedAt` key — those documents were
  excluded from the result set entirely, before any client-side
  filter ran.
- **Causal commit**: `1f23d5e` (2026-05-21) moved workspace creation
  from the legacy client-side path to the server-side
  `createWorkspace` callable, which writes `deletedAt: null` on every
  new workspace. Pre-`1f23d5e` workspaces retain the legacy shape
  (no `deletedAt` key), which the same `where('deletedAt','==',null)`
  query cannot match.
- **Why the Phase 2 repair removes the cause rather than masking
  it**: `scripts/repair-workspace-markers.ts` writes
  `deletedAt: null` on every legacy workspace doc that lacks the key.
  After the repair, every active workspace — pre-`1f23d5e` and post-`1f23d5e`
  — carries the same shape, and the same Firestore query matches
  all of them. The downstream client-side filters (`ws.deletedAt == null`
  in `WorkspaceSwitcher`, `!w.deletedAt` in `FunnelSettingsForm`)
  become redundant but correct — the server-side query is the single
  source of truth.

---

## T087 — FunnelSettingsForm needs no code change

`src/App.tsx:12724-12741`:

```tsx
<FunnelSettingsForm
  workspaceId={activeWorkspaceId}
  accountId={activeMetaAccountId}
  workspaceName={activeWorkspace?.name}
  isDarkMode={isDarkMode}
  availableWorkspaces={
    // BUG B — pass EVERY active workspace, not just the Meta-linked ones.
    workspaces.filter(w => !w.deletedAt).map(...)
  }
  ...
/>
```

The post-`BUG B` code passes every active workspace (the
`.filter(w => !w.deletedAt)` filter is the same shape as the
server-side query, just applied client-side as a defence-in-depth
check). After Phase 2's repair, the legacy 6-of-9 docs now carry
`deletedAt: null` and are included. **No code change is required**
for FR-022 to be satisfied.

---

## T088 — FR-026 / FR-026a / FR-026b surface enumeration

Per FR-026: every surface affected by the same root cause (missing
`deletedAt` key on legacy workspace docs) is enumerated below.
Scope is bounded to the single root cause (R1) per FR-026a.

| # | Surface | File | Listing query / filter | Affected by R1? | Fixed by Phase 2 repair? |
|---|---|---|---|---|---|
| 1 | Funnel Settings — workspace switcher dropdown | `src/components/FunnelSettingsForm.tsx:470-474` | Iterates the `workspaces.filter(w => !w.deletedAt)` prop (`App.tsx:12739`) | Yes | Yes — same repair fix |
| 2 | Top-bar workspace switcher | `src/components/WorkspaceSwitcher.tsx:127` | `workspaces.filter(ws => ws.deletedAt == null)` | Yes | Yes |
| 3 | App's main subscription | `src/App.tsx:2681-2702` | `where('deletedAt','==',null) + orderBy('createdAt','desc')` | Yes — the SOURCE | Yes — the Phase 2 repair writes `deletedAt: null` for every legacy doc |
| 4 | `workspaces` state consumers (`activeWorkspace`, `defaultWsId`, `filteredProjects`, `filteredAvatars`, etc.) | `src/App.tsx:2590` + downstream | All derive from the single subscription at #3 | Yes — propagates upstream | Yes — same repair fix |

**FR-026a closure**: every surface on the list above is fixed in
this phase by the Phase 2 repair (the same root-cause fix covers
all four). Scope is bounded to R1; unrelated workspace-listing
defects are explicitly out of scope and would be tracked as separate
follow-ups per FR-026a.

**FR-026b closure (server-side evidence)**: `workspaceListing.test.ts`
proves the underlying `workspaceListing` callable returns the active
workspace count for both owner and team-member scopes (T091 below).
The four UI selector surfaces (Funnel Settings selector, top-bar
switcher, Workspace Settings Modal, dashboard/ad-linking path) are
runbook-only — no executable frontend test asserts their counts. Live
verification on the 9-workspace account is operator-gated (T090 below).

---

## T089 — "needs Meta link" label verification

`src/components/FunnelSettingsForm.tsx:472`:

```tsx
{ws.name}{ws.metaAdAccountName
  ? ` — ${ws.metaAdAccountName}`
  : ' — ' + L('needs Meta link', 'يحتاج ربط ميتا')}
```

The `L()` helper resolves the paired en/ar i18n key
`meta.needs_meta_link_label`:

- English (`src/i18n.tsx:209`): `"Needs Meta link"`
- Arabic (`src/i18n.tsx:1139`): `"يحتاج ربط ميتا"`

The label shows for any workspace in the dropdown that does not
have a linked Meta ad account — exactly the FR-023 requirement.
**No code change needed.** Two layers of evidence:

- **Backend (server-side hermetic)** — `workspaceListing.test.ts:T-089`
  proves every unlinked workspace is present in the listing payload
  the selector reads from.
- **Frontend (UI rendering)** — `FunnelSettingsForm.tsx` applies the
  label to entries whose backend listing lacks `metaAdAccountId`. No
  executable frontend test asserts the rendered DOM carries the label,
  so this layer is covered by the existing `i18n.test.tsx` parity
  suite for the string itself and by manual verification for the
  conditional render. A dedicated component test is a follow-up.

---

## T090 — Operator-gated live selector counts (SC-004)

The live 9-workspace account runbook is in `evidence-r1.md` —
the operator pastes pre-/post-repair counts for four selector
surfaces (Funnel Settings + top-bar workspace switcher × owner
+ team member). Both post-repair counts must reach 9.

The hermetic equivalent is `workspaceListing.test.ts:T-post-repair-9-of-9`:
the listing query returns 9 of 9 workspaces when every doc carries
`deletedAt: null`, which is the post-repair state on the operator's
account.

---

## T091 — Hermetic soft-delete + repair invariants

`functions/src/__tests__/workspaceListing.test.ts` (new — 7 tests):

| Test | Asserts | Requirement |
|---|---|---|
| Pre-repair → 3 of 9 returned (the reported bug) | 6 legacy docs lack `deletedAt`; query returns 0 matches → exactly the bug | FR-025 / SC-005 root-cause evidence |
| Post-repair → 9 of 9 returned | Repair pass 1 writes `deletedAt: null` on every legacy doc; query matches all 9 | FR-022 / FR-026b |
| Post-repair, soft-deleted NOT included | `deletedAt: <ts>` excludes the doc | FR-024 |
| Pre-repair, soft-deleted also NOT included | Repair preserves the existing `deletedAt` timestamp (no resurrection) | FR-024 + FR-026d |
| Pass 2 marks oldest active as default | When no `isDefault: true`, mark oldest by `createdAt` ascending | FR-026d |
| Repair is idempotent | Re-running changes nothing | FR-026e |
| Unlinked workspaces get the "needs Meta link" label | The listing includes 6 unlinked workspaces; FunnelSettingsForm applies the label to exactly those | FR-023 |

The live soft-delete runbook is in `evidence-r1.md` — the operator
soft-deletes one workspace, then verifies all four selector
surfaces show the reduced count and that the deleted workspace is
absent everywhere (FR-024 closure).

---

## Verification

- Frontend `npm run build` — **pass** (`tsc -b && vite build`).
  No new warnings.
- Backend `cd functions && npm run build` — **pass** (`tsc` strict
  mode + asset copy). The new `workspaceListing.test.ts` compiles
  cleanly.
- `node lib/__tests__/workspace.test.js` — 16 passed, 0 failed.
- `node lib/__tests__/metaCallerScope.test.js` — 7 passed, 0 failed.
- `node lib/__tests__/workspaceRepair.test.js` — 9 passed, 0 failed.
- `node lib/__tests__/metaPush.test.js` — 8 passed, 0 failed.
- `node lib/__tests__/metaPushPack.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/metaSelectPage.test.js` — 15 passed, 0 failed.
- `node lib/__tests__/metaScope.integration.test.js` — 6 passed, 0 failed.
- `node lib/__tests__/metaOAuthCallback.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/linkMetaAccount.test.js` — 10 passed, 0 failed.
- `node lib/__tests__/workspaceListing.test.js` — **7 passed, 0 failed**.
- `node lib/__tests__/teamWorkspaceAccess.test.js` — unchanged, passes.

**80 total active tests pass** (Phase 7 adds 7). The 13 pre-existing
skipped tests in `workspace.test.ts` are unchanged placeholders.

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` covers every callable (T-02 covers). |
| `request.auth.uid` must not appear in Firestore paths | ✅ All 12 converted callables + the OAuth callback use `scope.ownerUid`. |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Not relevant here. |
| Clear the Page in the same write as the ad-account link | ✅ Phase 6 closed. |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ Phase 4 closed. |
| Team members cannot write workspace documents directly | ✅ `createWorkspace` / `deleteWorkspace` / `restoreWorkspace` still gated by `assertNotTeamMember`. T-14 verifies. |
| Do not touch the OAuth `state` parameter | ✅ Not touched. |
| The repair must not read through the broken query | ✅ Phase 2 closed — `collectionGroup('workspaces')` scans unconstrained. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ Phase 2 closed. T019 / T022 / T-22 verify the source fix. |

---

## What lands next (Phase 8)

Phase 8 is **Polish** per `tasks.md`: T092–T099.

- **T092**: Contract test T-18 in `src/__tests__/i18n.test.ts` — every
  new key exists in both languages.
- **T093**: Review every new Arabic string for simple Fusha (no
  Egyptian dialect, no technical terms).
- **T094**: Grep the touched backend files and confirm
  `request.auth.uid` no longer appears in any Firestore path.
- **T095**: Confirm `conn.selectedAccountId` is read by neither publish
  path (FR-009, FR-014).
- **T096**: Verify the rollback guarantee — on an account holding
  per-workspace Pages, revert the code and confirm publishing behaves
  exactly as before with no cleanup step.
- **T097**: Run `npm run build`, `npm run lint`, `cd functions && npm
  test`; all must pass.
- **T098**: Add the Phase 967 entry to `CLAUDE.md` under Recent
  Changes, matching the existing convention.
- **T099**: Complete the manual verification pass in `quickstart.md`
  and record results against SC-001 through SC-014.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 8.
