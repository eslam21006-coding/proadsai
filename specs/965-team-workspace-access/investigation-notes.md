# Investigation Notes — ISSUE-D (965-team-workspace-access)

**Purpose**: Code-level findings gathered while writing `spec.md`. Kept out of the spec so the spec
stays technology-agnostic. Input for `/speckit.plan`. Verified 2026-07-27 against the
`fix/issue-d-team-workspace-access` worktree.

> **Updated after `/speckit.clarify` (2026-07-27).** Role-based workspace editing was split out to a
> follow-up spec. §5 below describes work that is now **out of scope here** — it is retained because
> it is the reason for the split and the starting point for the follow-up. Requirement numbers were
> renumbered when that story was removed; references below are to the current `spec.md`.

## Corrections to the assumptions in the issue brief

### 1. Workspace loading already targets the owner's path — but unreliably

`src/App.tsx:2367-2405` already reads from `users/{effectiveUid}/workspaces`, and
`effectiveUid = teamOwnerUid || user?.uid` (`App.tsx:2218`). So the path resolution described as
"Fix 1" is largely present. The real defects are different:

- **The effect never re-runs when `teamOwnerUid` resolves.** The dependency array is
  `[user, effectiveUidRef.current, canUseWorkspaces]` (`App.tsx:2405`). `effectiveUidRef` is a
  `useRef` (`App.tsx:1537`, assigned at `2219`) — reading `.current` in a dependency array does not
  make the effect re-run when the ref changes, because a ref mutation does not trigger a render.
  `teamOwnerUid` is set asynchronously (`App.tsx:1737-1739`, `1928-1931`), so on first load the
  effect frequently fires with the member's *own* uid. This is the primary cause of ISSUE-D.
  The same pattern is used by the avatars effect (`App.tsx:1961-1977`) and several others — worth
  checking whether they share the bug.
- **One-shot `getDocs`, not `onSnapshot`** (`App.tsx:2374`) — no live updates (US3/FR-008). The
  listener must also be torn down when membership ends (FR-016), not merely on unmount.
- **Dangerous empty-list fallback.** When the fetch returns zero workspaces, the effect calls the
  `createWorkspace` callable (`App.tsx:2377-2391`). For a team member this creates a workspace under
  the **member's own** account (the callable uses `request.auth.uid`). Directly violates FR-013.

### 2. WorkspaceSwitcher filtering — confirmed as described

`src/components/WorkspaceSwitcher.tsx:43-45`:
```ts
const visibleWorkspaces = isTeamMember && workspaceAccess
  ? activeWorkspaces.filter(ws => workspaceAccess.includes(ws.id))
  : activeWorkspaces;
```
Passing `isTeamMember={true}` with `workspaceAccess` left `undefined` shows all workspaces.
**Confirmed correct** for the all-access decision. The `noAccess` empty-state at line 91 is also
guarded by `Array.isArray(workspaceAccess)`, so it stays dormant — good.

The "Create New Workspace" button is already gated by `!isTeamMember` (line 161) — **confirmed**,
no change needed for FR-009.

Neither prop is passed at the call site (`App.tsx:7303-7305`) — this part of the brief is accurate.

### 3. Firestore rules — read access already exists

`firestore.rules:41-48` grants team members read on `users/{ownerUid}/workspaces/{id}` when
`isTeamMember == true`, `teamOwnerUid == userId`, and `resource.data.deletedAt == null`.
No rules change needed for FR-001/FR-002. Note the `deletedAt == null` condition is enforced at the
rules layer, so a listener must not query in a way that trips on soft-deleted docs.

`firestore.rules:127-130` restricts the `team/{memberId}` subcollection to owner-read only. Under
the all-access decision the member never needs to read their own `workspaceAccess`, so **no rules
change and no new callable is required** — the brief's "broken link 2" dissolves.

### 4. Deletion is already blocked — but for the wrong reason

`deleteWorkspace` (`functions/src/index.ts:6431+`) reads
`users/${request.auth.uid}/workspaces/{id}`. A team member's call therefore fails with
`not-found: "Workspace not found or already deleted."` — safe outcome, misleading message.
FR-011 asks for an explicit permission refusal instead. Same shape applies to `restoreWorkspace`.

### 5. Editor editing is genuinely blocked at the backend — NOW OUT OF SCOPE (split to follow-up)

`updateWorkspace` (`functions/src/index.ts:6370+`) calls
`assertOwner(request.auth, workspaceId)` → `functions/src/workspaces/workspacePolicy.ts:6-21`,
which looks up `users/${auth.uid}/workspaces/{id}` and throws `not-found` when absent.

An editor team member therefore **cannot** edit the owner's workspace today, and unhiding the pencil
icon alone would produce a confusing failure. This is why the story was split out. The follow-up will
need:
- resolving the target workspace to the owner's account (an `onBehalfOf`-style resolution, as
  already used for credits at `App.tsx:2712` / `2748`), and
- a server-side role check (`editor` allowed, `viewer` denied).

Helpfully, `updateWorkspace` already rejects the owner-only fields via its `forbidden` array
(`isDefault`, `createdAt`, `deletedAt`, `metaAdAccountId`, `metaAdAccountName`,
`metaRoleAtLinkTime`, `pendingReassign`, `pendingRestore`), so the follow-up inherits that guard.

**What this feature does instead**: the edit control (pencil icon,
`WorkspaceSwitcher.tsx:151-156`) is hidden from all team members regardless of role (FR-010), and
the existing `not-found` outcome is converted to an explicit permission refusal (FR-011).

## Where the pieces live

| Concern | Location |
|---|---|
| Workspace loading effect | `src/App.tsx:2367-2405` |
| `effectiveUid` / ref | `src/App.tsx:1537`, `2213-2219` |
| `teamRole` state (`'editor'` / `'viewer'`) | `src/App.tsx:2214`, set at `1739`; `isTeamViewer` at `2216` |
| WorkspaceSwitcher call site | `src/App.tsx:7303-7305` |
| Switcher filtering / create-button gate | `src/components/WorkspaceSwitcher.tsx:43-45`, `161` |
| Edit pencil (currently ungated) | `src/components/WorkspaceSwitcher.tsx:151-156` |
| Delete control | `src/components/WorkspaceSettingsModal.tsx:359-381` (gated on `isEdit && !isDefault && onDelete`) |
| Create / update / delete / restore callables | `functions/src/index.ts:6314`, `6370`, `6431`, `6474+` |
| `assertOwner` | `functions/src/workspaces/workspacePolicy.ts:6-21` |
| Workspace read rule for team members | `firestore.rules:41-48` |
| Team subcollection rule (owner-read only) | `firestore.rules:127-130` |
| Workspace access matrix UI | `src/pages/Team.tsx:460-500`; toggle handler at `:244-250` |
| `setTeamMemberWorkspaceAccess` client binding | `src/pages/Team.tsx:15` |
| Billing / team-member inheritance | `src/hooks/useBillingState.ts:63-112` |

Note: `billingState` carries `isTeamMember` and `teamOwnerUid` but **not** `teamRole`. The role is
read separately from the user document into `App.tsx` state (`teamRole`, line 2214). Role-gated UI
should source it from there, or `teamRole` should be added to the billing state — a plan decision.

## Obsolete user-facing copy (found 2026-07-27, second clarify pass)

`src/i18n.tsx` is a two-locale keyed dictionary (`en:` at line 8, `ar:` at line 877). Every new key
needs an entry in both — FR-018.

`workspace.error.no_access` is now **factually wrong** under the all-access decision:

- `i18n.tsx:823` (en) — "No workspace access — ask your team owner to grant you access."
- `i18n.tsx:1692` (ar) — "لا توجد صلاحية وصول إلى مساحات عمل — اطلب من مالك الفريق منحك الصلاحية."

Access is automatic (FR-004), and once the grant matrix is removed (FR-020) the owner has no control
to grant with — so this message sends the member to the owner for something the owner cannot do.
It is rendered in three places in `WorkspaceSwitcher.tsx` (lines 94, 123, 127), two of which are the
`noAccess` branch that goes dormant once `workspaceAccess` is left undefined. The third (line 127)
is the genuine empty-list branch and will still fire — that one needs the FR-019 wording split:
"this account has no workspace yet" vs. "the list could not be loaded right now". Covered by FR-019a.

## Deployment surface

The server-side access truth (US1, T006–T008) and the mutation refusals (US2, T018–T019) both touch
Cloud Functions. US1 changes `resolveCallerScope` (`functions/src/workspaces/workspacePolicy.ts`) to
grant `"ALL"` workspace scope to verified members, removes the per-workspace narrowing from
`getWorkspaceGenerations` (`functions/src/index.ts:6739`), and adds the FR-004b override trace.
US2 adds `assertNotTeamMember` in the same policy file and installs it as the first statement of
`createWorkspace`, `updateWorkspace`, `deleteWorkspace`, and `restoreWorkspace` in
`functions/src/index.ts`. FR-023 refusal logging is also server-side.

US3 (live list + revocation + active-workspace deletion) and the UI half of US2 (withheld controls,
U3/U5 empty/error states, switch-guard dialog, removed-from-team overlay) are frontend-only.

Together this means **one `europe-west1` functions deploy** (with `lib/` rebuilt first per the
AGENTS.md critical rule) plus a `firebase deploy --only hosting` for the Vite build. No Firestore
rules change and no schema migration is required by any story.

**Deployment must never use stale compiled output.** Before entering the `functions/`
directory the operator must wipe the existing `lib/` directory with
`Remove-Item -Recurse -Force functions/lib` (PowerShell) or `rm -rf functions/lib`
(Bash). Only then run `cd functions; npm run build` followed by
`firebase deploy --only functions`. A stale `lib/` ships compiled output that
does not match the current branch source; a selective `--only functions:<list>`
can silently omit another changed callable. Both are explicitly forbidden by
AGENTS.md rule #1.

The team-screen matrix removal (FR-020) is frontend-only: `src/pages/Team.tsx:460-500` plus the
toggle handler at `:244-250` and the callable binding at `:15`. The
`setTeamMemberWorkspaceAccess` callable itself stays deployed and untouched — FR-021 requires the
stored data survive for the follow-up.
