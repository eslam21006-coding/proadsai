# Contract — Frontend workspace surface

**Applies to**: `src/App.tsx`, `src/components/WorkspaceSwitcher.tsx`,
`src/components/WorkspaceSettingsModal.tsx`, `src/pages/Team.tsx`, `src/i18n.tsx`
**Satisfies**: FR-001–FR-003, FR-005–FR-010, FR-016–FR-022 · SC-001, SC-006, SC-010, SC-012

## Required inputs

`user`, `teamResolution`, `effectiveUid`, `teamOwnerUid`, `canUseWorkspaces`, `workspaces`,
`activeWorkspaceId`, `removedFromTeam`.

## Decision table — what the picker shows

| # | State | Shown |
|---|---|---|
| U1 | Owner, workspaces plan | all own active workspaces; create button; edit control |
| U2 | Team member, owner has ≥1 active workspace | all owner's active workspaces; **no** create button; **no** edit control |
| U3 | Team member, owner has 0 workspaces | plain message "this account has no workspace yet"; **no** workspace is created (FR-013) |
| U4 | Any user, `teamResolution === 'pending'` | loading state; no workspace-writing action reachable (FR-007a) |
| U5 | Load failed | plain retry message, distinct from U3 (FR-019) |
| U6 | Plan without multiple workspaces | no picker; single-workspace behaviour as today |
| U7 | Team member, membership just ended | workspaces cleared within seconds, listener closed, removal overlay shown (FR-016) |

## Prop contract — `WorkspaceSwitcher`

```tsx
<WorkspaceSwitcher
  isTeamMember={teamResolution === 'resolved' && teamOwnerUid != null}
  /* workspaceAccess deliberately NOT passed */
  ... />
```

**Verified** (`WorkspaceSwitcher.tsx:43-45`): the filter is
`isTeamMember && workspaceAccess ? filter(...) : activeWorkspaces`. With `workspaceAccess` left
`undefined`, a team member sees **all** workspaces — the required behaviour under FR-004. Passing an
array would re-introduce the filtering the product decision removed.

Consequently the `noAccess` branch (`:91`, guarded by `Array.isArray(workspaceAccess)`) goes dormant.
The genuine empty-list branch at `:127` still fires and needs the U3/U5 wording split.

## Decision table — write gate (FR-007a)

| # | `workspaceReady` | Generate / save project / save avatar |
|---|---|---|
| W1 | `false` (resolution pending) | withheld, plain-language loading state |
| W2 | `false` (workspaces plan, no active workspace) | withheld |
| W3 | `true` | available; writes carry `effectiveUid` + `activeWorkspaceId` |

`workspaceReady = teamResolution === 'resolved' && (!canUseWorkspaces || activeWorkspaceId != null)`

## Blocked behaviours

- MUST NOT pass `workspaceAccess` to the switcher.
- MUST NOT render create, edit, or delete controls to a team member (FR-009, FR-010).
- MUST NOT reach `createWorkspace` from the empty-list path for a team member (FR-013).
- MUST NOT allow any workspace write while `teamResolution === 'pending'` (FR-007a, SC-012).
- MUST NOT leave the workspace listener open after membership ends (FR-016).
- MUST NOT ship a user-visible string in one language only (FR-018).

## Copy repairs required

| Key / location | Problem | Action |
|---|---|---|
| `workspace.error.no_access` (`i18n.tsx:823` en, `:1692` ar) | "ask your team owner to grant you access" — access is now automatic and the owner has no control to grant with | Retire; replace with the U3 and U5 messages (FR-019a) |
| `App.tsx:11269-11271` | Removal overlay body and "Continue" button are **hardcoded English**, no `t()` — Arabic users see English (Constitution V) | Key both strings; add `ar` + `en` (FR-016a, FR-018) |

## Acceptable variation

Loading-state visual treatment; message wording within the plain-language rule; whether the empty and
error states share a component.

## Fail conditions

- A team member sees an empty picker while their owner has active workspaces.
- A team member sees a create, edit, or delete control.
- A workspace appears under a team member's own account.
- Any generation, project, or avatar is written before resolution completes (SC-012).
- A removed member continues receiving workspace updates (SC-010).
- Any new or changed string exists in only one locale (SC-008).

## Verification

Manual, per `quickstart.md` — this project has no frontend test runner. Server-side decisions are
covered by the pure-function suites in `functions/src/__tests__/`.
