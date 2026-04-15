# Pro Ads AI - SaaS - FAL Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-15

## Active Features
- 002-frontend-filter-qa: Frontend filtering & QA (React, Zustand, Tailwind, fixtures via Cloud Functions v2)
- 001-resolver-completeness-trace: Resolver completeness tracing (Cloud Functions v2, Firestore)

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

## Platform

- Frontend: React 19 + Zustand + Tailwind CSS 3, bundled with Vite 7
- Backend: Firebase Cloud Functions v2, Firestore, Storage
- TypeScript 5.9 (frontend), 5.7 (functions)
- Firebase project config: firebase.json, firestore.rules, storage.rules

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

## Active Technologies
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19 (005-render-prompt-pipeline)
- Firestore (`generations/{genId}` documents, `creativeMemory` collection) (005-render-prompt-pipeline)
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Paddle Node.js SDK, Paddle.js, Firebase Cloud Functions v2 (009-billing-plan-access)
- Firestore (`users/{uid}.billingState`, `paddle_events/{eventId}`) (009-billing-plan-access)
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Firebase Auth (email/password + email verification), React 19, Zustand, Tailwind CSS 3, `@paddle/paddle-node-sdk` (backend), Paddle.js v2 (client-side overlay checkout) (009-billing-plan-access)
- Firestore — `users/{uid}` (with embedded `billingState` sub-object), `pending_plans/{email.toLowerCase()}` (pre-signup plans), `paddle_events/{eventId}` (webhook idempotency), `cancellation_logs/{uid}_{ts}` (analytics) (009-billing-plan-access)

## Recent Changes
- 005-render-prompt-pipeline: Added TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19
