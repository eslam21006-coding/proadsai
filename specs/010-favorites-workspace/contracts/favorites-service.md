# Contract: Favorites Service Interface

**Feature**: 010-favorites-workspace  
**Date**: 2026-04-05

## feedbackService extensions

### getFavoriteIds

Returns the set of generation IDs that are currently favorited for the given scope.

**Signature**:

```ts
getFavoriteIds(userId: string, workspaceId?: string) → Promise<Set<string>>
```

**Inputs**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| userId | string | yes | Current user's UID |
| workspaceId | string | no | If provided, returns workspace-scoped favorites instead of user-scoped |

**Output**: `Set<string>` — generation document IDs where `feedback.savedToFavorites === true`

**Behavior**:
- When `workspaceId` is absent: query `WHERE userId == userId AND feedback.savedToFavorites == true ORDER BY timestamp DESC LIMIT 200`
- When `workspaceId` is present: query `WHERE workspaceId == workspaceId AND feedback.savedToFavorites == true ORDER BY timestamp DESC LIMIT 200`
- **MAX_FAVORITES = 200** — hard cap to prevent unbounded reads; both branches use the same ordering and limit
- Returns empty set on error (logs to console)

---

### updateFavoriteRecord

Updates output fields on an existing favorited generation record.

**Signature**:

```ts
updateFavoriteRecord(generationId: string, updatedFields: Partial<GenerationRecord['output']>) → Promise<void>
```

**Inputs**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| generationId | string | yes | Document ID of the generation to update |
| updatedFields | Partial output object | yes | Fields to overwrite (e.g., `{ hookText, subheadText }`) |

**Output**: `void` — throws on failure

**Behavior**:
- Validates that `updatedFields` contains at least one own property whose value is not `undefined`; throws `"No output fields provided for update"` if empty or all-undefined
- Writes `updatedFields` nested under `output.*` on the Firestore document
- Does not modify `feedback`, `input`, `metadata`, or `creativeIdentity` fields
- Caller is responsible for ensuring the record is currently favorited

---

## useFavorites hook

### Subscription interface

**Signature**:

```ts
useFavorites(phase: 'hooks' | 'concepts' | 'render' | 'caption') → {
  favorites: GenerationRecord[]
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  connectionState: 'live' | 'stale'
}
```

**Inputs**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| phase | string enum | yes | Filter favorites by content phase |

**Output**:

| Field | Type | Description |
|-------|------|-------------|
| favorites | GenerationRecord[] | Currently loaded items; first page sorted by timestamp descending, subsequent pages appended in the same order |
| loading | boolean | True during initial subscription setup or while `loadMore()` is in flight |
| hasMore | boolean | True if the most recent page returned a full 100 items (another page may exist); false once the tail has been reached |
| loadMore | `() => Promise<void>` | Fetches the next 100 items via `getDocs` with `startAfter(lastCursor)`; appends to `favorites`. No-op if `hasMore === false` or a load is already in flight |
| connectionState | `'live' \| 'stale'` | `'live'` while the first-page `onSnapshot` is active; `'stale'` after an `onSnapshot` error callback until the next successful snapshot |

**Behavior**:
- First page uses `onSnapshot` (real-time) with `limit(100)`; subsequent pages loaded by `loadMore()` use `getDocs` (static for the session)
- Automatically scopes to workspace if `activeWorkspaceId` is set and user is team member/owner
- Falls back to user-scoped query if no workspace active
- Unsubscribes the first-page listener on component unmount
- Falls back to broader query + client-side phase filter if composite index is unavailable
- On `onSnapshot` error: retains the last successful `favorites`, flips `connectionState` to `'stale'`, and relies on the Firebase SDK to auto-retry; flips back to `'live'` on next successful snapshot. Does NOT surface a user-facing error — the consuming panel renders the stale banner (FR-015)

---

## FavoritesPanel component

### Props interface

```ts
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
- Pagination: when `useFavorites().hasMore === true`, renders a "Show older" button at the tail. Clicking it calls `loadMore()`. After items append, focus moves to the first newly-loaded item for keyboard continuity
- Offline state: when `useFavorites().connectionState === 'stale'`, renders a non-blocking inline banner ("Offline — showing last saved list") above the list. The banner disappears automatically when `connectionState` returns to `'live'`. The banner region is marked `aria-live="polite"` so its appearance is announced

### Accessibility contract (WCAG 2.1 AA — FR-016, SC-007)

- Toggle button rendered as `<button aria-expanded aria-controls={panelId}>`
- Panel container: `role="region" aria-label={phaseLabel}`
- Items wrapped in `role="list"` / `role="listitem"`; Load and Remove are `<button>` with accessible names including the item preview
- Sort: either `<select aria-label="Sort favorites">` or `<button role="radio">` set inside `role="radiogroup" aria-label="Sort order"`
- "Show older" button has accessible name and `aria-busy` while loading
- Count badge (rendered by step header, not panel) lives in an `aria-live="polite"` region so increments/decrements are announced
- Focus management: opening the panel moves focus to the first interactive control (usually the sort toggle); `Escape` closes and returns focus to the toggle
- RTL: Arabic content previews retain `dir="rtl"`; focus order follows DOM order regardless of visual direction
- Tested via axe-core (automated) and keyboard-only manual pass (SC-007)

---

## Store extensions

### loadedFavoriteId tracking

| Field | Type | Description |
|-------|------|-------------|
| `loadedFavoriteId` | `string \| null` | ID of the favorite currently loaded into a step; `null` when no favorite is loaded |
| `setLoadedFavoriteId` | `(id: string \| null) => void` | Setter |

**Used by**: Post-regeneration prompt logic (FR-007). When regeneration completes and `loadedFavoriteId` is not null, show the "Update or Keep both" prompt.
