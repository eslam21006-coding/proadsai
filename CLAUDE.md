# Pro Ads AI - SaaS - FAL Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-03

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
- TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Firebase Auth, React 19 (006-team-management)
- Firestore (`team_invites` collection, `users/{uid}` docs, `users/{uid}/team` subcollection) (006-team-management)

## Recent Changes
- 005-render-prompt-pipeline: Added TypeScript 5.7 (functions), TypeScript 5.9 (frontend) + Firebase Cloud Functions v2, Gemini 3.1 (text + image), React 19
