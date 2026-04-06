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
| `output.subhead` | `string?` | Loaded into Step 2 subhead field alongside hookText |
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

### Personal favorites (no workspace active)

```
generations
  WHERE userId == {currentUid}
  AND feedback.savedToFavorites == true
  AND output.phase == {phase}
  ORDER BY timestamp DESC
```

### Team favorites (workspace active)

```
generations
  WHERE workspaceId == {activeWorkspaceId}
  AND feedback.savedToFavorites == true
  AND output.phase == {phase}
  ORDER BY timestamp DESC
```

### Favorite IDs set (for bookmark state initialization)

```
generations
  WHERE userId == {currentUid}
  AND feedback.savedToFavorites == true
  SELECT id
```

When workspace is active, replace `userId` constraint with `workspaceId` constraint.

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
