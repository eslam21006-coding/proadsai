# Data Model: Favorites & Workspace

**Feature**: 010-favorites-workspace  
**Date**: 2026-04-05

## Entities

### GenerationRecord (existing — `generations/{genId}`)

No new fields required. The feature reads and writes existing fields:

| Field | Type | Purpose in this feature |
|-------|------|------------------------|
| `userId` | `string` | Owner of the generation; used for personal-scope favorites query |
| `workspaceId` | `string \| null` | Workspace association; used for team-scope favorites query |
| `timestamp` | `Timestamp` | Sort key (default: newest first) |
| `output.phase` | `'hooks' \| 'concepts' \| 'render' \| 'caption'` | Filter key for per-step favorites panel |
| `output.hookText` | `string?` | Preview text for hooks panel; loaded into Step 2 fields |
| `output.subhead` | `string?` | Loaded into Step 2 subhead field alongside `hookText` (matches `GenerationRecord.output.subhead` in `src/services/feedbackService.ts:86` and consumers in `src/App.tsx`) |
| `output.conceptText` | `string?` | Preview/load for concepts panel (Step 3) |
| `output.buildPlan` | `string?` | Loaded alongside conceptText in Step 3 |
| `output.imageUrl` | `string?` | Preview/load for designs panel (Step 4) |
| `output.captionText` | `string?` | Preview/load for captions panel (Step 5) |
| `output.fullResponse` | `string` | Fallback content if specific fields missing |
| `input.*` | `object` | All input fields; restored by "Edit & Re-generate" in Step 4 |
| `feedback.savedToFavorites` | `boolean` | Source of truth for favorite status |
| `feedback.rating` | `FeedbackRating` | Display "Used" badge in panel if `=== 'used'` |

### Workspace (existing — from `useAppStore`)

| Field | Type | Purpose in this feature |
|-------|------|------------------------|
| `id` | `string` | `activeWorkspaceId` — determines query scope for team favorites |
| `name` | `string` | Displayed in panel header when team-scoped |

### BillingState (existing — from `useBillingState`)

| Field | Type | Purpose in this feature |
|-------|------|------------------------|
| `isTeamMember` | `boolean` | Determines if workspace-scoped queries should be used |
| `isTeamOwner` | `boolean` | Same as above — either flag activates workspace scope |

## Relationships

```text
GenerationRecord ──belongs to──► User (userId)
GenerationRecord ──optionally belongs to──► Workspace (workspaceId)
User ──member of──► Workspace (via billingState.isTeamMember/isTeamOwner)
```

## Query Patterns

### Personal favorites (no workspace active) — first page

```text
generations
  WHERE userId == {currentUid}
  AND workspaceId == null          -- excludes workspace-owned records (FR-009)
  AND feedback.savedToFavorites == true
  AND output.phase == {phase}
  ORDER BY timestamp DESC
  LIMIT 100
```

The `workspaceId == null` constraint MAY be enforced client-side (filter on the loaded page) to avoid adding a new composite index; the effect on SC-002 latency is negligible because the page is already bounded to 100.

### Team favorites (workspace active) — first page

```text
generations
  WHERE workspaceId == {activeWorkspaceId}
  AND feedback.savedToFavorites == true
  AND output.phase == {phase}
  ORDER BY timestamp DESC
  LIMIT 100
```

### Next page ("Show older")

Identical predicate, with `startAfter(lastDocSnapshot)` appended and `limit(100)` retained. Executed via `getDocs` (not `onSnapshot`) — only the first page keeps a live subscription.

### Favorite IDs set (for bookmark state initialization)

The `FeedbackButtons` instances rendered in Steps 2–5 need a membership set so the star icon reflects real saved state on first paint (FR-001). The set is **derived at the App level from the four per-phase `useFavorites` subscriptions** — no separate bulk query is issued:

```text
favoriteIds = union over phase ∈ {hooks, concepts, render, caption} of
  useFavorites({ phase, workspaceId }).favorites.map(r => r.id)
```

This approach:

- Uses only data already subscribed to by the per-phase panels (no extra Firestore reads).
- Stays correct for every favorite currently visible in any panel, including items loaded via "Show older" pagination (which the hook merges into its returned `favorites` array).
- Does not need a bulk cap — each per-phase subscription is independently bounded to 100 (plus paginated tail), matching FR-014.
- Automatically reflects removals/additions in real time via the live head subscription.

The service function `feedbackService.getFavoriteIds(userId, workspaceId?)` still exists for analytics-style callers, but it MUST NOT be used to bootstrap panel bookmark state — its implicit limit would drop older favorites for users with large histories.

## Firestore Indexes Required

### New composite indexes (add to `firestore.indexes.json`)

1. `generations`: `(userId, feedback.savedToFavorites, output.phase, timestamp DESC)`
2. `generations`: `(workspaceId, feedback.savedToFavorites, output.phase, timestamp DESC)`

### Fallback strategy

If composite index is not yet deployed, fall back to:
- Query with fewer constraints (drop `output.phase`)
- Client-side filter by phase
- Matches existing fallback pattern in `PerformanceDashboard.tsx`

## State Transitions

### Favorite lifecycle

```text
Not Favorited ──[toggle on]──► Favorited ──[toggle off]──► Not Favorited
                                    │
                                    ├──[edit & update]──► Favorited (output fields overwritten)
                                    │
                                    └──[auto-save on load]──► Favorited (bookmark preserved)
```

### Load-from-favorites flow

```text
Step has current output ──[user clicks Load]──► Auto-save current output as favorite
                                                    ──► Load selected favorite into step fields
                                                    ──► Track loadedFavoriteId in store
```

### Post-edit regeneration flow

```text
Loaded favorite tracked ──[user regenerates]──► Show update prompt
    ├── "Yes, update" ──► updateFavoriteRecord(loadedFavoriteId, newOutput)
    └── "Keep both"   ──► toggleFavorite(newGenerationId, true)
                           ──► Clear loadedFavoriteId
```

## Validation Rules

- `feedback.savedToFavorites` must be `boolean` (never `null` or `undefined` for favorited items)
- `output.phase` must be one of the four allowed values for panel filtering to work
- `workspaceId` must match exactly for team scoping — partial matches or null comparisons excluded
- When auto-saving before load, the current generation must have a valid `generationId` (skip auto-save if no generation exists yet)
- Pagination cursor must be a Firestore `DocumentSnapshot` (not a plain document ID) — `startAfter` requires the snapshot to preserve compound-order positioning
- Revocation semantics: records with a `workspaceId` MUST NOT have that field cleared or migrated to personal scope when a member leaves the workspace — the record stays attached to the workspace (FR-009, Session 2026-04-21 Q3)

## Client-Side State (derived, not persisted)

`useFavorites` hook local state — not stored in Firestore:

| Field | Type | Purpose |
|-------|------|---------|
| `favorites` | `GenerationRecord[]` | Currently loaded items (first page + any loaded "Show older" pages), client-side sorted per user selection |
| `loading` | `boolean` | True during initial subscription setup or while `loadMore()` is in flight |
| `hasMore` | `boolean` | True if the most recent page returned exactly 100 items (potential next page exists) |
| `connectionState` | `'live' \| 'stale'` | `'live'` when the first-page `onSnapshot` is active; `'stale'` if `onSnapshot` error callback has fired and no recovery has occurred yet |
| `lastCursor` | `DocumentSnapshot \| null` | Last document of the currently-loaded tail; used by `loadMore()` |

These derived fields support FR-014 (pagination), FR-015 (offline banner), and SC-002 (<3 s panel open).
