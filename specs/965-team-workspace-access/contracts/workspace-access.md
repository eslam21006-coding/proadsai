# Contract — Server-side workspace access resolution

**Applies to**: `functions/src/workspaces/workspacePolicy.ts::resolveCallerScope`,
`functions/src/savedProjects/getUserProjects.ts`, `functions/src/index.ts::getWorkspaceGenerations`
**Satisfies**: FR-001, FR-003, FR-004, FR-004a, FR-004b, FR-015 · SC-002, SC-003

## Required inputs

- Authenticated caller uid (`request.auth.uid`). Unauthenticated → `unauthenticated`, always.
- For per-workspace calls: a non-empty `workspaceId`.

## Decision table

| # | Caller state | Requested | Result | Reason code |
|---|---|---|---|---|
| A1 | Owner of the workspace | any | **allow** | — |
| A2 | `isTeamMember=true`, `teamOwnerUid=O`, member doc exists under `O` with `uid == caller` | any workspace under `O` | **allow** | — |
| A3 | Same as A2, `workspaceAccess` is `[]` | any workspace under `O` | **allow** | — (this is the inverted contract; see below) |
| A4 | Same as A2, `workspaceAccess` is `["ws-1"]` | `ws-9` under `O` | **allow** | stored list disregarded → log per A9 |
| A5 | `isTeamMember=true`, `teamOwnerUid=O`, **no** member doc under `O` | any | **deny** | `permission-denied` |
| A6 | `isTeamMember=true`, `teamOwnerUid=O` | workspace under a *different* owner `P` | **deny** | `permission-denied` |
| A7 | Workspace has `deletedAt != null` | that workspace | **deny** | `failed-precondition` / not-found, per existing `assertWorkspaceActive` |
| A8 | Firestore read failure during resolution | any | **self-scope** — `ownerUid = callerUid`, never another account | logged, unchanged behaviour |
| A9 | A2/A3/A4 resolved to `"ALL"` while stored `workspaceAccess` was non-empty | — | allow **and** emit override trace | see Logging |

## Required visible output

None. This contract is invisible to users; its effect is that a member's workspaces contain their data
rather than appearing empty.

## Blocked behaviours

- MUST NOT grant access on the strength of `isTeamMember` alone. The member doc under the owner is the
  proof (A5). A stale flag grants nothing.
- MUST NOT widen a caller's reach beyond the single `teamOwnerUid` on their own user document (A6).
- MUST NOT return soft-deleted workspaces to a team member (A7).
- MUST NOT degrade to another account on read failure — self-scope only (A8).

## Acceptable variation

- Order of returned workspaces.
- Whether `"ALL"` is represented as the sentinel string or an explicit id list, provided A3 holds for a
  member with an empty stored array.

## Fail conditions

- A team member with `workspaceAccess: []` receives zero projects or zero generations for a workspace
  that exists under their owner. **This is the ISSUE-D symptom and is the primary regression to guard.**
- Any caller receives data from an account that is neither their own nor their `teamOwnerUid`.
- A stored non-empty `workspaceAccess` is disregarded without a trace record (violates Constitution VII).

## Deliberate contract inversion

`functions/src/__tests__/savedProjects.getUserProjects.test.ts:26` currently asserts:

> "Team member with empty workspaceAccess → denied"

Under FR-004 this is **wrong** and becomes row A3 (**allow**). The partial-access assertions at lines
36 and 44 collapse into A4. This is a product decision recorded in `spec.md` Clarifications and
`research.md` D1 — not a test that broke. The suite must be edited, and the edit must state why.

## Logging (FR-004b, FR-023)

```
issue-d ▸ workspaceAccess ignored (all-access policy) — caller=<uid> owner=<uid> stored=<count> granted=ALL
```

Emitted only for row A9 — a non-empty stored list that was overridden. Not emitted for the ordinary
empty-list case, which would produce one line per request for every member.
