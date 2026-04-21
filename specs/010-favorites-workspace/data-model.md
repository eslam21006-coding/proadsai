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
| `output.subheadText` | `string?` | Loaded into Step 2 subhead field alongside `hookText` (matches `src/types.ts` `GenerationRecord` definition) |
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

```
generations
  WHERE userId == {currentUid}
  AND feedback.savedToFavorites == true
  AND output.phase == {phase}
  ORDER BY timestamp DESC
  LIMIT 100
```

### Team favorites (workspace active) — first page

```
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

```
generations
  WHERE userId == {currentUid}
  AND feedback.savedToFavorites == true
  ORDER BY timestamp DESC
  LIMIT 200
  SELECT id
```

When workspace is active, replace `userId` constraint with `workspaceId` constraint. The 200-item bound on this bulk lookup is independent of the 100-item per-phase page bound; it exists to cover any phase a user has currently open in any step.

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

```
Not Favorited ──[toggle on]──► Favorited ──[toggle off]──► Not Favorited
                                    │
                                    ├──[edit & update]──► Favorited (output fields overwritten)
                                    │
                                    └──[auto-save on load]──► Favorited (bookmark preserved)
```

### Load-from-favorites flow

```
Step has current output ──[user clicks Load]──► Auto-save current output as favorite
                                                    ──► Load selected favorite into step fields
                                                    ──► Track loadedFavoriteId in store
```

### Post-edit regeneration flow

```
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
