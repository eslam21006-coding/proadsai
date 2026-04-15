# Implementation Plan: Favorites & Workspace

**Branch**: `010-favorites-workspace` | **Date**: 2026-04-05 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-favorites-workspace/spec.md`

## Summary

Fix bookmark state persistence so saved favorites display correctly on page load, add per-step favorites panels (Steps 2–5) with load/edit/save-back capabilities, implement user-sortable ordering, auto-save-before-load protection, and enable team-scoped favorites within shared workspaces. All favorite state is derived from the existing `feedback.savedToFavorites` field on `generations` documents — no new Firestore collection is needed.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions)  
**Primary Dependencies**: React 19, Zustand, Tailwind CSS 3, Firebase SDK (Firestore `onSnapshot`, `query`, `where`, `orderBy`)  
**Storage**: Firestore — `generations` collection (existing), `feedback.savedToFavorites` boolean field  
**Testing**: Vitest (frontend), Jest via `cd functions && npm test` (backend)  
**Target Platform**: Web (Vite 7 dev server + Firebase Hosting)  
**Project Type**: Web application (SPA frontend + Firebase Cloud Functions v2 backend)  
**Performance Goals**: Bookmark state loads in <1s, favorites panel opens in <3s, real-time sync within 2s  
**Constraints**: No new Firestore collections; reuse existing `generations` schema; composite index required for efficient queries  
**Scale/Scope**: Per-user favorites (up to hundreds), team workspace scoping (small teams <20 members)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Feature completes an existing incomplete system (favorites). No new modes or launch-risk surface. |
| II. Selected Mode Must Be Obeyed | PASS | Loading a favorite restores exact saved state — no silent drift. |
| III. Launch Surface Is Frozen | PASS | Favorites & Workspace is an enhancement to existing launch-approved flows, not a new surface. |
| IV. Behavior Contracts | PASS | FR-001–FR-013 define explicit pass/fail rules for every behavior. |
| V. Arabic Quality Is First-Class | PASS | Favorites display existing content — Arabic RTL rendering is already handled by step UIs. Panel must preserve `dir="rtl"` on previews. |
| VI. Hidden Layers Must Be Auditable | PASS | Auto-save-before-load creates a visible bookmark — no hidden state mutation. |
| VII. No Silent Override | PASS | Auto-save explicitly bookmarks current work before load; update-vs-keep-both prompt makes overwrite explicit. |
| VIII. Cost Discipline | PASS | No additional generation calls. Only Firestore reads (snapshot subscriptions). |
| IX. Proof Required for Fixes | PASS | Bookmark state fix (FR-001) loads real Firestore state — before/after testable. |
| X. Spec Before Code | PASS | Full spec with clarifications complete. |
| XI. Frontend/Backend Must Agree | PASS | Favorite state is read directly from Firestore — single source of truth. No backend validation gap. |
| XII. Deferred Scope Stays Deferred | PASS | No deferred features introduced. |

**Gate result: ALL PASS — proceed to Phase 0.**

## Project Structure

### Documentation (this feature)

```text
specs/010-favorites-workspace/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── hooks/
│   └── useFavorites.ts          # NEW — real-time favorites subscription hook
├── components/
│   └── FavoritesPanel.tsx       # NEW — reusable per-step favorites panel
├── services/
│   └── feedbackService.ts       # MODIFY — add getFavoriteIds, updateFavoriteRecord
├── store.ts                     # MODIFY — add loadedFavoriteId tracking
└── App.tsx                      # MODIFY — integrate FavoritesPanel into Steps 2–5,
                                 #           fix FeedbackButtons initial state,
                                 #           add count badges, sort toggle, auto-save
```

**Structure Decision**: No new directories beyond `src/hooks/` (which is referenced by existing imports like `useBillingState`). The `FavoritesPanel` is a single reusable component parameterized by phase — no per-step component files needed. All step integration happens in `App.tsx` where the step UIs are already inline.

## Complexity Tracking

> No constitution violations — table not needed.
