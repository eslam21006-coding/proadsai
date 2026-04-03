# Quickstart: Team Management

## What This Feature Does

Builds the user-facing team management UI. Fixes the critical 404 on invite acceptance links by adding a `/join` route. Adds the Team management page, plan limit enforcement, credit visibility, viewer role gating, and workspace separation for Scaling plans.

## Key Files to Create

| File | Purpose |
|------|---------|
| `src/pages/JoinTeam.tsx` | Invite acceptance page — account creation or login + claim |
| `src/pages/Team.tsx` | Team management page — members, invites, invite form |

## Key Files to Modify

| File | Change |
|------|--------|
| `functions/src/index.ts` | Add `getInviteDetails` Cloud Function |
| `src/App.tsx` | Add `/join` route detection, team credit label, viewer gating, workspace switcher |
| `src/i18n.tsx` | Add team-related translation strings |
| `functions/src/contractFixtures.test.ts` | Add team fixture tests |

## Important Notes

- The backend role is `'editor'` (not `'member'`). The UI shows "Member" as the label for the editor role.
- No router library is used. The `/join` route is detected via `window.location.pathname` at the top of the App component tree.
- Team state fields (`isTeamMember`, `teamOwnerUid`, `teamRole`) already exist on the user doc — surface them in the frontend state.
- `getInviteDetails` is the only new Cloud Function. All other team functions already exist.

## Build & Test

```bash
# Backend compile check
cd functions && rm -rf lib && npm run build

# Contract fixtures (includes new team tests)
cd functions && npm run test:contracts

# Frontend compile check
npm run build
```
