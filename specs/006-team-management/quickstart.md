# Quickstart: Team Management

**Updated**: 2026-04-10

## What This Feature Does

Team management enables owners to invite members (editor/viewer roles), manage team composition, enforce plan-based seat limits, share credits from the owner's pool, gate viewer actions, and (for Scaling plans) switch between brand workspaces.

## Implementation Status

The feature is ~92% complete. All 8 Cloud Functions, both frontend pages, Firestore security rules, i18n (EN+AR), and fixture tests are implemented.

## Key Files

| File | Purpose | Status |
|------|---------|--------|
| `src/pages/JoinTeam.tsx` | Invite acceptance page — login/signup + claim | Complete |
| `src/pages/Team.tsx` | Team management modal — members, invites, invite form, role management | Complete |
| `src/services/teamService.ts` | Cloud Function wrappers (8 functions, typed) | Complete |
| `src/components/WorkspaceSwitcher.tsx` | Workspace dropdown (Scaling plan only) | UI complete, history isolation pending |
| `src/App.tsx` | `/join` route, team state, credit deduction, viewer gating | Complete |
| `src/i18n.tsx` | 70+ team/join/invite keys (EN + AR) | Complete |
| `src/planconfig.ts` | Plan limits (maxTeamMembers, multiBrandWorkspaces) | Complete |
| `functions/src/index.ts` | 8 team Cloud Functions + credit resolution | Complete |
| `functions/src/entitlements.ts` | `resolveCreditOwner()` — credit owner resolution | Complete |
| `functions/src/teamFixtureTests.ts` | 6 fixture test cases (T031–T036) | Complete |
| `firestore.rules` | Team-aware security rules | Complete |

## Remaining Work

1. **Workspace history isolation** (US6/FR-012): Generation queries need `workspaceId` scoping for Scaling plan teams. The WorkspaceSwitcher component and feature flag exist, but queries are not filtered by workspace.

2. **Viewer button visual state** (optional UX enhancement): Generation buttons are not visually disabled for viewers. The current implementation blocks via toast on click + server rejection. Adding visual disable (opacity + pointer-events) would improve discoverability.

## Important Notes

- The backend role is `'editor'` (not `'member'`). The UI shows "Member" as the label for the editor role via i18n key `team.role_member`.
- No router library is used. The `/join` route is detected via `window.location.pathname` before the auth gate in App.tsx.
- Team state fields (`isTeamMember`, `teamOwnerUid`, `teamRole`) are read from the Firestore user document via real-time listener.
- `teamMemberships/{email}` is the reverse-lookup collection — keyed by normalized email, not UID.
- Invite statuses that count as "open" (toward seat limit): `pending`, `sent`, `failed`.
- Rate limiting on `getInviteDetails`: 10 req/min/IP via `rateLimits/{ip}_{minuteKey}` Firestore collection.
- One-team-per-user model: claiming an invite auto-revokes pending invites from other owners.

## Build & Test

```bash
# Backend compile check
cd functions && rm -rf lib && npm run build

# Run team fixture tests
cd functions && node lib/teamFixtureTests.js

# Frontend compile check
npm run build

# Dev server
npm run dev
```
