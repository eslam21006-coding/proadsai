# Contract: Favorites Service Interface

**Feature**: 010-favorites-workspace  
**Date**: 2026-04-05

## feedbackService extensions

### getFavoriteIds

Returns the set of generation IDs that are currently favorited for the given scope.

**Signature**:
```
getFavoriteIds(userId: string, workspaceId?: string) → Promise<Set<string>>
```

**Inputs**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | yes | Current user's UID |
| workspaceId | string | no | If provided, returns workspace-scoped favorites instead of user-scoped |

**Output**: `Set<string>` — generation document IDs where `feedback.savedToFavorites === true`

**Behavior**:
- When `workspaceId` is absent: query `WHERE userId == userId AND feedback.savedToFavorites == true`
- When `workspaceId` is present: query `WHERE workspaceId == workspaceId AND feedback.savedToFavorites == true`
- Returns empty set on error (logs to console)

---

### updateFavoriteRecord

Updates output fields on an existing favorited generation record.

**Signature**:
```
updateFavoriteRecord(generationId: string, updatedFields: Partial<GenerationRecord['output']>) → Promise<void>
```

**Inputs**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| generationId | string | yes | Document ID of the generation to update |
| updatedFields | Partial output object | yes | Fields to overwrite (e.g., `{ hookText, subhead }`) |

**Output**: `void` — throws on failure

**Behavior**:
- Writes `updatedFields` nested under `output.*` on the Firestore document
- Does not modify `feedback`, `input`, `metadata`, or `creativeIdentity` fields
- Caller is responsible for ensuring the record is currently favorited

---

## useFavorites hook

### Subscription interface

**Signature**:
```
useFavorites(phase: 'hooks' | 'concepts' | 'render' | 'caption') → { favorites: GenerationRecord[], loading: boolean }
```

**Inputs**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| phase | string enum | yes | Filter favorites by content phase |

**Output**:
| Field | Type | Description |
|-------|------|-------------|
| favorites | GenerationRecord[] | Sorted by timestamp descending (default) |
| loading | boolean | True during initial subscription setup |

**Behavior**:
- Uses `onSnapshot` for real-time updates
- Automatically scopes to workspace if `activeWorkspaceId` is set and user is team member/owner
- Falls back to user-scoped query if no workspace active
- Unsubscribes on component unmount
- Falls back to broader query + client-side phase filter if composite index is unavailable

---

## FavoritesPanel component

### Props interface

```
interface FavoritesPanelProps {
  phase: 'hooks' | 'concepts' | 'render' | 'caption'
  onLoad: (record: GenerationRecord) => void
  isOpen: boolean
  onClose: () => void
}
```

**Behavior**:
- Renders a slide-in sidebar panel
- Shows sort toggle (newest / oldest / alphabetical)
- Each item displays: phase badge, preview text, date saved, "Load" button, "Remove" button
- Empty state when no favorites for the phase
- "Remove" calls `toggleFavorite(id, false)` — item disappears via real-time subscription
- "Load" calls `onLoad(record)` — parent step handles field population and auto-save logic

---

## Store extensions

### loadedFavoriteId tracking

| Field | Type | Description |
|-------|------|-------------|
| `loadedFavoriteId` | `string \| null` | ID of the favorite currently loaded into a step; `null` when no favorite is loaded |
| `setLoadedFavoriteId` | `(id: string \| null) => void` | Setter |

**Used by**: Post-regeneration prompt logic (FR-007). When regeneration completes and `loadedFavoriteId` is not null, show the "Update or Keep both" prompt.
