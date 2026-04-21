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
| updatedFields | Partial output object | yes | Fields to overwrite (e.g., `{ hookText, subhead }`) |

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
useFavorites(options: {
  phase: 'hooks' | 'concepts' | 'render' | 'caption'
  workspaceId?: string | null
}): {
  favorites: GenerationRecord[]
  loading: boolean
  hasMore: boolean
  loadMore: () => Promise<void>
  connectionState: 'live' | 'stale'
}
```

**Inputs** (single options object):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phase` | `'hooks' \| 'concepts' \| 'render' \| 'caption'` | yes | Filter favorites by content phase |
| `workspaceId` | `string \| null \| undefined` | no | When truthy, scopes the subscription by `where('workspaceId', '==', workspaceId)` instead of `where('userId', '==', currentUid)`. When null/undefined, falls back to user-scoped. Callers are responsible for resolving the active workspace from billing state and passing the right value. |

**Output**:

| Field | Type | Description |
|-------|------|-------------|
| favorites | `GenerationRecord[]` | Currently loaded items: a live "head" page (up to 100 newest via `onSnapshot`) merged with any static "tail" pages that `loadMore()` has already appended, de-duplicated by `id` (head items win on collision). Both head and tail are in timestamp-descending order from the server; the consuming component applies client-side sort if desired. |
| loading | `boolean` | True during initial subscription setup or while `loadMore()` is in flight |
| hasMore | `boolean` | True when the most recent page returned a full 100 items (another page may exist); false once the tail has been reached |
| loadMore | `() => Promise<void>` | Fetches the next 100 timestamp-descending items via `getDocs` with `startAfter(lastCursor)` and appends them to the tail. No-op if `hasMore === false` or a load is already in flight. Always returns a resolved promise — thrown errors from the Firestore SDK are caught internally (and logged via `console.warn`) so the caller need not handle rejection. |
| connectionState | `'live' \| 'stale'` | Driven by `snapshot.metadata.fromCache` (the subscription is opened with `{ includeMetadataChanges: true }`): `'live'` when the snapshot reflects the server, `'stale'` when Firestore is serving from offline cache or the error callback has fired. Returns to `'live'` on the next server-sourced snapshot without manual retry. |

**Behavior**:
- First page ("head") uses `onSnapshot` with `{ includeMetadataChanges: true }` + `limit(100)`; subsequent pages ("tail") loaded by `loadMore()` use `getDocs` with `startAfter(lastCursor)` (static for the session — older pages are not live-subscribed)
- Scopes to workspace when the caller passes a truthy `workspaceId`; otherwise scopes to `auth.currentUser.uid`
- Unsubscribes the head listener on unmount or when `phase`/`workspaceId` changes; resets `headItems`, `tailItems`, `lastCursor`, and `hasMore` on resubscribe
- Falls back to broader query + client-side phase filter if the composite index is unavailable; the fallback path follows the same head+tail merge and same `metadata.fromCache` detection
- `connectionState` flips to `'stale'` when `snapshot.metadata.fromCache === true` OR when the error callback fires; flips back to `'live'` on the next server-sourced snapshot
- Live head refreshes MUST NOT discard tail items already loaded via `loadMore()` — the returned `favorites` array is always the merged, de-duplicated view

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
