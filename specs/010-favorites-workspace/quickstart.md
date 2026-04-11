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

# Backend tests
cd functions && npm test

# Manual testing
# 1. Bookmark a generation → refresh → verify filled icon
# 2. Open Saved Hooks in Step 2 → verify items listed
# 3. Click Load → verify fields populated
# 4. Edit and regenerate → verify update/keep-both prompt
# 5. Test with two team members in same workspace
```

## Architecture Notes

- **No new Firestore collection** — all data lives in existing `generations` documents
- **Single reusable component** — `FavoritesPanel` is parameterized by `phase`, used in all 4 steps
- **Real-time via onSnapshot** — no polling; updates propagate within 2s
- **Zustand store** — `loadedFavoriteId` tracks which favorite was loaded for post-edit prompt logic
- **Fallback queries** — if composite index not deployed, broader query + client-side filter (matches existing PerformanceDashboard pattern)
