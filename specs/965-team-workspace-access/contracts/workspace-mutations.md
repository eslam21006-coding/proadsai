# Contract — Workspace mutation refusals

**Applies to**: `functions/src/index.ts` → `createWorkspace` (:6314), `updateWorkspace` (:6370),
`deleteWorkspace` (:6431), `restoreWorkspace` (:6474); new `assertNotTeamMember()` in
`functions/src/workspaces/workspacePolicy.ts`
**Satisfies**: FR-009, FR-010, FR-011, FR-012, FR-013, FR-014 · SC-004, SC-005, SC-007

## Required inputs

Authenticated caller uid. Mutation payload as today — unchanged.

## Decision table

| # | Caller | Action | Result | Reason code |
|---|---|---|---|---|
| M1 | Owner | create / update / delete / restore | **allow** — behaviour byte-for-byte as today | — |
| M2 | `isTeamMember=true` (any role) | `createWorkspace` | **deny** before any write | `permission-denied`, `reason: team_member` |
| M3 | `isTeamMember=true` (any role) | `updateWorkspace` | **deny** | `permission-denied`, `reason: team_member` |
| M4 | `isTeamMember=true` (any role) | `deleteWorkspace` | **deny** | `permission-denied`, `reason: team_member` |
| M5 | `isTeamMember=true` (any role) | `restoreWorkspace` | **deny** | `permission-denied`, `reason: team_member` |
| M6 | Owner | delete the default workspace | **deny** — existing rule, unchanged | `failed-precondition` |
| M7 | Unauthenticated | any | **deny** | `unauthenticated` |

The guard runs **first**, before payload validation, workspace lookup, or any write.

## Required visible output

A plain-language message in the caller's language (FR-018, both `ar` and `en`) stating that only the
account owner may add, change, or remove workspaces. Never a message that implies the workspace does
not exist.

## Blocked behaviours

- MUST NOT report a permission problem as `not-found`. Today all four callables resolve under
  `users/{callerUid}/workspaces`, so a member's call fails as "workspace not found" — the symptom that
  makes this bug hard to diagnose.
- **MUST NOT create a workspace under the team member's own account.** Today `createWorkspace` from a
  member *succeeds* and does exactly this. Highest-severity item in this contract (FR-012, FR-013).
- MUST NOT reduce anything an owner can do (M1, M6 unchanged — SC-007).
- MUST NOT depend on `teamRole`. All roles are refused identically in this feature.

## Acceptable variation

Message wording, provided it is plain, in both languages, and free of technical vocabulary.

## Fail conditions

- Any workspace document exists under a team member's own uid after they sign in and use the product.
- A refusal surfaces as `not-found`.
- An owner's create / update / delete / restore path changes in any observable way.
- A refusal produces no log line.

## Logging (FR-023, FR-024)

```
issue-d ▸ workspace action refused — action=<create|update|delete|restore> caller=<uid> owner=<uid|unknown> workspace=<id|n/a> reason=team_member
```

Diagnostic only. No owner-visible audit entry is written (FR-024).
