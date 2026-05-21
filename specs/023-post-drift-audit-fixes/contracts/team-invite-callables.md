# Contract: Team Invite Callables (FR-101..106, FR-103/104)

**Location**: `functions/src/index.ts` (callables), `src/main.tsx` + `src/pages/JoinTeam.tsx` + `src/App.tsx` (client)

## getInviteDetails (FR-103) — re-implement + export

```
onCall getInviteDetails(req: { inviteId: string }) → 
  { success: true, ownerName, inviteeEmail, inviteeName, teamPlan, role, status, expiresAt }
  | { success: false, status: 'expired'|'revoked'|'accepted'|'not_found', message }
```
- Unauthenticated; rate-limited by IP (10/min) per the original 006 contract.
- **Done proof**: emulator round-trip returns details (not `functions/not-found`); grep shows `export const getInviteDetails` in `index.ts` and a live caller in `teamService.ts`.

## updateTeamMemberRole (FR-104) — re-implement + export

```
onCall updateTeamMemberRole(req: { memberDocId: string, role: 'editor'|'viewer' }) → { success: true }
```
- Owner-only. **Done proof**: emulator role change succeeds; `export const updateTeamMemberRole` present; `teamService.ts:14` resolves.

## Client wiring

- **FR-101**: `src/main.tsx` renders `<JoinTeam>` when `location.pathname` starts with `/join`.
- **FR-102**: `JoinTeam.tsx` reads `searchParams.get('inviteId')` (not `'id'`).
- **FR-105**: Team nav button rendered only when `isTeamOwner === true`.
- **FR-106**: overlay shown when the user-doc listener observes `isTeamMember` true→false.

## Invariants
- The two callables are the single source of truth; the client never falls back to a generative/local path. A bad `inviteId` returns a status, not a crash.
