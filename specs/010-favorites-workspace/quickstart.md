# Quickstart: Favorites & Workspace

**Feature**: 010-favorites-workspace  
**Branch**: `010-favorites-workspace`

## Prerequisites

- Phase 8 complete (`billingState` available with team fields)
- Node.js, Firebase CLI installed
- `npm install` run in both root and `functions/`

## Dev Setup

```bash
# Start frontend dev server
npm run dev

# In separate terminal, start Firebase emulators (if testing Firestore locally)
firebase emulators:start --only firestore
```

## Key Files to Modify

| File | Change |
|------|--------|
| `src/services/feedbackService.ts` | Add `getFavoriteIds()`, `updateFavoriteRecord()` |
| `src/hooks/useFavorites.ts` | **Create** — real-time subscription hook |
| `src/components/FavoritesPanel.tsx` | **Create** — reusable panel component |
| `src/components/FeedbackButtons.tsx` | Fix initial `isFavorite` state from Firestore |
| `src/store.ts` | Add `loadedFavoriteId` state |
| `src/App.tsx` | Integrate panels into Steps 2–5, add count badges, sort toggle, auto-save-before-load |
| `firestore.indexes.json` | Add composite indexes |

## Implementation Order

1. **Service layer** — `getFavoriteIds`, `updateFavoriteRecord` in feedbackService
2. **Hook** — `useFavorites` with `onSnapshot` subscription
3. **Bookmark fix** — `FeedbackButtons` reads real state from hook/store
4. **Panel component** — `FavoritesPanel` with sort toggle, load/remove actions
5. **Step integration** — Wire panels into Steps 2–5 in App.tsx
6. **Auto-save** — Implement auto-bookmark-before-load logic
7. **Edit & save back** — `loadedFavoriteId` tracking + update/keep-both prompt
8. **Team scoping** — Workspace-conditional queries in useFavorites
9. **Count badges** — Add badge to each step's toggle button
10. **Indexes** — Deploy composite Firestore indexes

## Testing

```bash
# Frontend lint
npm run lint

# Unit + component tests
npm test -- FavoritesPanel useFavorites

# Accessibility audit (axe-core via Vitest)
npm test -- favorites.a11y

# Backend tests
cd functions && npm test
```

**Manual acceptance passes** (mirror the spec's User Stories and SC-007):

1. **Bookmark persistence (US1, SC-001)** — bookmark a generation → refresh → filled icon appears immediately, no flicker.
2. **Panel open + Load (US2, SC-002)** — open Saved Hooks in Step 2 → items listed in <3 s → click Load → hookText + subhead populate the editable fields.
3. **Edit & save back (US3)** — load a favorite → regenerate → verify "Update or Keep both" prompt, both paths work.
4. **Team scope (US4, SC-004)** — two team members in same workspace, each saves a favorite → both appear in both members' panels within 2 s (SC-003).
5. **Revocation** — remove a user from the workspace → verify every favorite with that `workspaceId` disappears from their panel, including their own saves; their personal-scope favorites remain.
6. **Pagination (FR-014)** — seed >100 favorites for one phase → open panel → 100 newest rendered → "Show older" loads the next 100 → focus jumps to the first new item.
7. **Offline banner (FR-015)** — disable network (DevTools) while panel is open → inline "Offline — showing last saved list" banner appears, list stays visible → re-enable → banner disappears, live updates resume without manual retry.
8. **Keyboard-only a11y (SC-007)** — using only Tab / Shift+Tab / Enter / Escape / arrow keys: open panel, focus each item, trigger Load, trigger Remove, change sort, paginate via "Show older", close panel. No pointer required. axe-core report shows zero critical/serious violations.

## Architecture Notes

- **No new Firestore collection** — all data lives in existing `generations` documents
- **Single reusable component** — `FavoritesPanel` is parameterized by `phase`, used in all 4 steps
- **Real-time via onSnapshot** — no polling; first page stays live, later pages are static for the session
- **Bounded reads** — `limit(100)` on every query page keeps Firestore reads predictable regardless of total favorites stored
- **Zustand store** — `loadedFavoriteId` tracks which favorite was loaded for post-edit prompt logic
- **Connection-state flag** — `useFavorites` exposes `connectionState: 'live' | 'stale'`; the panel renders the offline banner when stale, and the Firebase SDK auto-retries without manual intervention
- **Fallback queries** — if composite index not deployed, broader query + client-side filter (matches existing PerformanceDashboard pattern)
- **WCAG 2.1 AA** — every interactive control has an accessible name, focus is visible, count/banner changes announced via `aria-live`, Arabic previews preserve `dir="rtl"`
