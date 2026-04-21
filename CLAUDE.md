# Pro Ads AI - SaaS - FAL Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-21


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
- TypeScript 5.7 (Cloud Functions), TypeScript 5.9 (frontend) + React 19, Firebase Cloud Functions v2, Firebase Auth, Firestore, Vite 7, Tailwind CSS 3 (006-team-management)
- Firestore (`team_invites`, `teamMemberships`, `users/{uid}`, `users/{uid}/team`, `rateLimits`) (006-team-management)
- TypeScript 5.9 (frontend), TypeScript 5.7 (functions) + React 19, Zustand, Tailwind CSS 3, Firebase SDK (Firestore `onSnapshot`, `query`, `where`, `orderBy`) (010-favorites-workspace)
- Firestore — `generations` collection (existing), `feedback.savedToFavorites` boolean field (010-favorites-workspace)
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Firebase Auth (email/password + email verification), React 19, Zustand, Tailwind CSS 3, `@paddle/paddle-node-sdk` (backend), Paddle.js v2 (client-side overlay checkout) (009-billing-plan-access)
- Firestore — `users/{uid}` (with embedded `billingState` sub-object), `pending_plans/{email.toLowerCase()}` (pre-signup plans), `paddle_events/{eventId}` (webhook idempotency), `cancellation_logs/{uid}_{ts}` (analytics) (009-billing-plan-access)

## Recent Changes
- 09.50-hotfix-plan-alignment: `UserPlan` union narrowed to `'none' | 'starter' | 'pro' | 'scale'`. Legacy `creator` → `pro`, `scaling` → `scale` mapped at read time in `functions/src/billing/billingState.ts::buildBillingState()`. `PLANS` record in `src/planconfig.ts` adds `savedProjectLimit` / `audienceAvatarLimit` / `batchConfig` / `carouselMaxSlides`. Full hook/tone/strategy libraries ungated on Starter; retargeting/fantasy/art-direction/batch/carousel/reference-ads gated at Pro+. Pro batch cap 4 ads/run; Scale batch cap 36. Pro carousel 7 slides; Scale 10.
- 005-render-prompt-pipeline: Added TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19
