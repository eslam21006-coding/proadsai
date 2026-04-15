# Pro Ads AI - SaaS - FAL Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15


## Project Structure

```text
src/              # React frontend (Vite + Tailwind)
functions/        # Firebase Cloud Functions v2 (backend)
specs/            # Feature specs (speckit workflow)
.specify/         # Speckit templates & constitution
```

## Commands

`npm run dev` — start Vite dev server
`npm run build` — TypeScript compile + Vite build
`npm run lint` — ESLint
`cd functions && npm test` — run backend tests



- Frontend: React 19 + Zustand + Tailwind CSS 3, bundled with Vite 7
- Backend: Firebase Cloud Functions v2, Firestore, Storage
- TypeScript 5.9 (frontend), 5.7 (functions)
- Firebase project config: firebase.json, firestore.rules, storage.rules

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Active Technologies
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19, Zustand, Tailwind CSS 3 (005-render-prompt-pipeline)
- Firestore (`generations/{genId}`, `creativeMemory/{creativeId}`) (005-render-prompt-pipeline)
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Firebase Auth, React 19 (006-team-management)
- Firestore (`team_invites` collection, `users/{uid}` docs, `users/{uid}/team` subcollection) (006-team-management)
- TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend) + React 19, Firebase Cloud Functions v2, Firebase Auth, Firestore, Vite 7, Tailwind CSS 3 (006-team-management)
- Firestore (`team_invites`, `teamMemberships`, `users/{uid}`, `users/{uid}/team`, `rateLimits`) (006-team-management)
- TypeScript 5.9 (frontend), TypeScript 5.7 (functions) + React 19, Zustand, Tailwind CSS 3, Firebase SDK (Firestore `onSnapshot`, `query`, `where`, `orderBy`) (010-favorites-workspace)
- Firestore — `generations` collection (existing), `feedback.savedToFavorites` boolean field (010-favorites-workspace)
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Stripe SDK, React 19, Zustand 5 (009-billing-plan-access)
- Firestore (`users/{uid}` billingState field, `cancellations` collection, `pending_plans` collection) (009-billing-plan-access)
- TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend) + React 19, Firebase Cloud Functions v2, Firebase Auth, Firestore, Vite 7, Tailwind CSS 3, Paddle billing integration (via Phase 8 `billingState` / 009) (006-team-management)
- Firestore (`team_invites`, `teamMemberships`, `users/{uid}`, `users/{uid}/team`, `rateLimits`, `pending_plans` consumed by Phase 8 + consumed-at-claim by Phase 9). New indexes: `team_invites.inviteeEmailNormalized` (for device-independent discovery + modal suppression), `users.dormantPlan.paddleSubscriptionId` (for Paddle webhook write-through) (006-team-management)

## Recent Changes
- 005-render-prompt-pipeline: Added TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19
