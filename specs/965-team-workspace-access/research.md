# Phase 0 Research — 965-team-workspace-access

**Date**: 2026-07-27 | **Spec**: [spec.md](./spec.md) | **Code findings**: [investigation-notes.md](./investigation-notes.md)

All Technical Context unknowns resolved. No NEEDS CLARIFICATION remains.

---

## D1 — The server still enforces `workspaceAccess`; the fix is NOT frontend-only

**This is the finding that reshapes the plan.** The spec's Assumptions previously stated that only the
refusal guards touch the server. That is wrong, and the assumption has been corrected in `spec.md`.

Two server-side gates read the per-member `workspaceAccess` array and deny when a workspace is absent
from it. A newly invited member's array is `[]`, so **both gates deny everything by default**:

| Gate | Location | Behaviour today |
|---|---|---|
| `resolveCallerScope` | `functions/src/workspaces/workspacePolicy.ts:116-156` | Returns `allowedWorkspaceIds = memberData.workspaceAccess ?? []` for a team member; `[]` when the member doc is missing (line 138). Consumed by `getUserProjects` (`savedProjects/getUserProjects.ts:39,42,57`) and the save path. |
| `getWorkspaceGenerations` | `functions/src/index.ts:6739` | `if (!(memberData.workspaceAccess ?? []).includes(workspaceId)) throw permission-denied` |

Consequence had we shipped the frontend alone: a team member would see the owner's workspaces in the
picker, switch between them, and find **every one of them empty** — no saved projects, no generations.
The blocker would appear fixed and would not be.

**Decision**: Both gates change to grant `"ALL"` to any caller verified as a team member of the owner.
Membership verification itself (does a member doc exist under `users/{ownerUid}/team` with
`uid == callerUid`?) is retained unchanged — it is the actual security boundary. Only the
per-workspace narrowing is removed.

**Rationale**: FR-004 makes access all-or-nothing per account. Once membership is established, the
per-workspace list carries no authority. Keeping the narrowing would leave the frontend and backend
disagreeing about who may see what — precisely the failure Constitution XI forbids.

**Alternatives considered**:
- *Backfill every member's `workspaceAccess` with all current workspace ids.* Rejected: it is a data
  migration that silently breaks again the moment the owner creates a new workspace, and it writes
  authority into data that FR-021 says must be left unread.
- *Leave the backend and have the frontend request only permitted workspaces.* Rejected: the member
  cannot read their own member doc (`firestore.rules:127-130` is owner-read only), so the frontend
  cannot know the list. This is the original broken link.

**Existing test must be inverted**: `functions/src/__tests__/savedProjects.getUserProjects.test.ts:26`
asserts *"Team member with empty workspaceAccess → denied"*. That is now the wrong contract. The case
becomes *allowed*, and the partial-access cases (lines 36, 44) collapse into the all-access rule. This
is a deliberate, documented behaviour-contract change under Constitution IV, not a test that "started
failing".

**Trace obligation (Constitution VII)**: when a member is granted `"ALL"` despite a non-empty stored
`workspaceAccess`, the stored data is being deliberately ignored. That override must be logged.

---

## D2 — Root cause of the empty picker: a ref in an effect dependency array

`src/App.tsx:2405` — the workspace effect declares `[user, effectiveUidRef.current, canUseWorkspaces]`.
`effectiveUidRef` is a `useRef` (`:1537`), assigned during render (`:2219`). Mutating a ref does not
schedule a render, so listing `.current` in a dependency array does nothing: the effect never re-runs
when the value changes.

`teamOwnerUid` is resolved asynchronously — `setTeamOwnerUid` at `:1738` inside the `onAuthStateChanged`
handler, after an `await getDoc`. The workspace effect therefore commonly fires while
`effectiveUidRef.current` is still the member's own uid, reads `users/{memberUid}/workspaces`, finds
nothing, and never corrects itself.

**Decision**: introduce an explicit `teamResolution` state — `'pending' | 'resolved'` — set to
`'resolved'` once the auth handler has determined membership either way. The workspace, avatar, and
project effects depend on `[user, effectiveUid, teamResolution, canUseWorkspaces]` using the **state**
value `effectiveUid` (`:2218`), never the ref, and return early while `teamResolution === 'pending'`.

**Rationale**: makes the async resolution a first-class, observable state rather than an implicit race.
It is also exactly what FR-007a needs — a single flag the write-gate can test.

**Alternatives considered**:
- *Add `teamOwnerUid` to the deps and keep the ref for reads.* Works for this effect but leaves the
  same latent bug in every other `effectiveUidRef.current` dependency array. Rejected as a partial fix.
- *Fire a one-off refetch when `teamOwnerUid` changes.* Duplicates the fetch and races with itself.

**Same bug, same file, must be fixed together**: the avatars effect at `:1977` has the identical
dependency defect. FR-006 requires audience profiles to re-scope on switch, so it is in scope.

---

## D3 — Live workspace list, and closing it on removal

**Decision**: replace `getDocs` (`:2374`) with `onSnapshot` on `users/{ownerUid}/workspaces`, ordered
by `createdAt desc`, filtering `deletedAt == null` client-side. The unsubscribe runs on effect cleanup,
which fires when `effectiveUid` changes — including when membership ends and `teamOwnerUid` returns to
`null`.

Removal is already detected: `wasTeamMemberRef` + `setRemovedFromTeam(true)` at `App.tsx:1945-1947`,
driven by the live `onSnapshot` on the member's own user doc (`:1925`). The overlay renders at `:11261`.
So FR-016's detection exists; what is missing is that the workspace listener is not torn down and the
overlay's copy is hardcoded English.

**Rationale**: the existing removal signal is real-time already, so closing the listener on the same
signal costs one dependency change. The stored access rules (`firestore.rules:41-48`) also stop
permitting the read at that moment, so an un-torn-down listener would surface a permission error — A
deliberate teardown replaces an error with intended behaviour.

**Constitution V defect found**: the removed-from-team overlay at `App.tsx:11269-11271` contains
hardcoded English — *"You have been removed from the team. You are now operating under your own
account."* and *"Continue"* — with no `t()` call. Arabic users see English. Must be keyed. (FR-018,
FR-016a.)

---

## D4 — Honest refusals for create / update / delete

All three callables resolve the workspace under `users/{callerUid}/workspaces`:
`createWorkspace` (`index.ts:6314`), `updateWorkspace` (`:6370`, via `assertOwner`,
`workspacePolicy.ts:6-21`), `deleteWorkspace` (`:6431`).

A team member's call therefore fails with `not-found` — safe, but it misreports a permission problem
as a missing workspace, and `createWorkspace` is worse: it *succeeds*, creating a workspace under the
member's own account.

**Decision**: add a shared `assertNotTeamMember(callerUid, action)` helper in `workspacePolicy.ts` that
reads the caller's user doc and throws `permission-denied` with a stable reason code when
`isTeamMember === true`. Call it at the top of all three callables, before any other work. Log the
refusal (D6).

**Rationale**: one helper, three call sites, checked before side effects. Satisfies FR-011, FR-012, and
closes the FR-013 hole from the server side as well as the client side.

**Note**: `restoreWorkspace` (`:6474`) has the same shape. It is owner-only by nature and not reachable
by a team member's UI, but it takes the same guard for consistency at negligible cost.

---

## D5 — Holding workspace writes until the account link resolves (FR-007a)

**Decision**: derive `workspaceReady = teamResolution === 'resolved' && (!canUseWorkspaces || activeWorkspaceId != null)`.
Gate the launch surface on it — the Generate action in `InputForm` is disabled with a plain-language
loading message, and `saveCurrentProject` / avatar saves return early — until it is true.

**Rationale**: writing a generation, project, or avatar into the wrong workspace is silent and
effectively unrecoverable at the user's level. `App.tsx:3861` and `:4721` already compute
`resolvedWorkspaceId` from `activeWorkspaceId`, so a null-or-wrong value propagates straight into
persisted records. SC-012 measures this at zero.

**Related bug found, in scope because it writes to the wrong account**: `App.tsx:5519` builds
`users/${user.uid}/workspaces/${activeWorkspaceId}/imageFingerprints` from **`user.uid`**, not
`effectiveUid`. For a team member that path is the member's own account combined with the owner's
workspace id — a document that cannot satisfy `isWorkspaceMember` (`firestore.rules:139+`) and will be
rejected. Change to `effectiveUid`.

---

## D6 — Refusal logging (FR-023, FR-024)

**Decision**: `console.warn` with a stable structured prefix, matching the established convention in
this codebase (`phase13 ▸ getUserProjects …` at `getUserProjects.ts:61`, `resolveCallerScope: degraded
…` at `workspacePolicy.ts:150`). Format:

```
issue-d ▸ workspace action refused — action=<create|update|delete|restore> caller=<uid> owner=<uid|unknown> workspace=<id|n/a> reason=team_member
```

Plus the Constitution VII override trace:

```
issue-d ▸ workspaceAccess ignored (all-access policy) — caller=<uid> owner=<uid> stored=<n> granted=ALL
```

**Rationale**: Cloud Functions ships `console` output to Cloud Logging where it is queryable by prefix.
No new dependency, no new collection, no owner-visible surface (FR-024). Records the action, the actor,
and the account — exactly what SC-011 asks for.

**Alternatives considered**: writing to the existing `workspace_access_audit` collection. Rejected in
clarification — that surface is owner-readable (`firestore.rules:51-54`) and would need a response
story this feature does not have.

---

## D7 — Removing the access matrix (FR-020, FR-021)

**Decision**: delete the matrix table from `src/pages/Team.tsx:~450-500`, the
`handleWorkspaceAccessToggle` handler (`:244-250`), the `wsAccessLoading` state, and the
`fnSetTeamMemberWorkspaceAccess` binding (`:15`). Leave the `setTeamMemberWorkspaceAccess` callable
deployed and untouched, and leave every stored `workspaceAccess` array in place.

**Rationale**: FR-021 requires the data survive. Removing the callable would orphan
`workspacePurge.ts:162-234`, which maintains those arrays on workspace delete/restore and would then
be writing to a field nothing produces. Leaving the callable deployed but unreferenced is the smaller,
reversible change.

---

## D8 — Failed-load retry (the one Outstanding item from clarification)

**Decision**: no automatic retry loop. `onSnapshot` already re-establishes itself across transient
connection loss. For a hard error the listener's error callback sets a `workspaceLoadError` state that
renders a plain-language message with a manual retry, distinct from the "no workspace yet" message
(FR-019).

**Rationale**: an automatic retry against a permission error — the expected error after removal —
would spin. Distinguishing the two states is what FR-019 actually requires; the retry mechanism itself
carries no requirement.

---

## D9 — Test approach

**Decision**: follow the existing pure-function simulation style
(`functions/src/__tests__/savedProjects.getUserProjects.test.ts`) — extract the decision logic into
exported pure functions and assert the decision table, rather than mocking Firestore. Register the new
suite in `functions/package.json`'s `test` script, as every prior phase has done.

**Rationale**: matches the house pattern, runs without emulators, and gives Constitution IV its
explicit pass/fail rules. Frontend changes are verified through `quickstart.md`'s manual matrix — the
project has no frontend test runner.
