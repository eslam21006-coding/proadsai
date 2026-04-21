# Research: Favorites & Workspace

**Feature**: 010-favorites-workspace  
**Date**: 2026-04-05

## Research Tasks

### R1: Firestore Real-Time Subscription for Favorites

**Decision**: Use `onSnapshot` with composite query (`userId + feedback.savedToFavorites + output.phase + timestamp`) for the `useFavorites` hook.

**Rationale**: The codebase already uses `onSnapshot` patterns (e.g., workspace-filtered queries in PerformanceDashboard). `onSnapshot` gives real-time updates within ~1-2s, matching SC-003. The existing `PerformanceDashboard` already queries the same collection with `where('feedback.savedToFavorites', '==', true)` — the new hook adds a `phase` filter and uses `onSnapshot` instead of `getDocs`.

**Alternatives considered**:
- Polling with `getDocs` every N seconds — rejected: higher latency, unnecessary reads, doesn't meet 2s real-time requirement.
- Separate favorites collection — rejected: would require data duplication and sync logic. Existing `generations` schema already has all needed fields.

### R2: Composite Firestore Index Requirement

**Decision**: Require a composite index on `generations` for `(userId, feedback.savedToFavorites, output.phase, timestamp)` and a workspace variant `(workspaceId, feedback.savedToFavorites, output.phase, timestamp)`.

**Rationale**: The PerformanceDashboard already has a fallback for missing composite index (client-side filter of 200 docs). The favorites hook should follow the same pattern: attempt composite query first, fall back to broader query + client filter. Index should be added to `firestore.indexes.json`.

**Alternatives considered**:
- Client-side filtering only — rejected: inefficient at scale, fetches unnecessary documents.
- Single composite index without phase filter — viable but less efficient for per-step panels.

### R3: Auto-Save Before Load Strategy

**Decision**: Before loading a favorite into a step, check if the current step has unsaved output (non-empty `hookText`/`conceptText`/`captionText`/`imageUrl`). If so, call `toggleFavorite(currentGenerationId, true)` to bookmark the current output, then proceed with the load.

**Rationale**: The clarification session confirmed "auto-save then load" as the chosen approach (Q2). Using the existing `toggleFavorite` function keeps the implementation simple — no new save mechanism needed. The auto-saved item appears in the favorites panel immediately via the real-time subscription.

**Alternatives considered**:
- Confirmation dialog before overwrite — rejected by product owner in favor of auto-save.
- Local draft storage — rejected: adds complexity without benefit since Firestore persistence is already available.

### R4: Team-Scoped Favorites Query Pattern

**Decision**: When `activeWorkspaceId` is set, query `where('workspaceId', '==', activeWorkspaceId)` instead of `where('userId', '==', uid)`. This matches the existing workspace-query pattern in `PerformanceDashboard.tsx` (lines 91-92).

**Rationale**: The `GenerationRecord` type already includes `workspaceId?: string | null` (feedbackService.ts). The PerformanceDashboard already splices workspace constraints into queries conditionally. The same pattern gives team members full visibility into workspace favorites.

**Alternatives considered**:
- Query by team member UIDs — rejected: requires fetching team member list first, adds latency and complexity.
- Separate team-favorites collection — rejected: duplicates data unnecessarily.

### R5: Bookmark State Initialization Fix

**Decision**: In `FeedbackButtons.tsx`, accept a `favoriteIds: Set<string>` prop (or read from a shared Zustand slice) and initialize `isFavorite` from `favoriteIds.has(generationId)` instead of hardcoded `false`.

**Rationale**: The `useFavorites` hook will maintain a reactive set of favorited generation IDs. Passing this to `FeedbackButtons` (or reading from store) eliminates the stale-state bug. This avoids per-button Firestore reads — the single subscription serves all buttons on the page.

**Alternatives considered**:
- Per-button `getDoc` on mount — rejected: N+1 reads for N buttons, slow and expensive.
- Separate `getFavoriteIds` query per page — viable but the `useFavorites` hook already provides this data.

### R6: Sort Toggle Implementation

**Decision**: Client-side sort on the currently-loaded page of favorites (≤100 items per page, see R7). Default: newest first (`timestamp` descending). Toggle options: newest, oldest, alphabetical. Alphabetical keys on the item's primary text preview per phase (`hookText` for hooks, `conceptText` for concepts, `captionText` for captions). For the `render` phase the preview is an image with no meaningful text key, so alphabetical falls through to the Firestore-ordered (timestamp-desc) sequence — effectively the newest-first ordering. The Firestore query always returns `orderBy('timestamp', 'desc')` with `limit(100)`; re-sorting the loaded page in memory is trivial.

**Rationale**: Clarification 3 (Session 2026-04-05) confirmed user-sortable ordering. With the 100-item page size from Q2 (Session 2026-04-21), client-side sort stays cheap and does not require additional Firestore indexes.

**Alternatives considered**:
- Multiple Firestore queries with different `orderBy` — rejected: unnecessary reads and added index requirements for a bounded page.
- Sort applied only to the server result — rejected: would require a different `orderBy` for alphabetical that isn't available on a text field without a separate index.

### R7: Pagination Strategy — "Show older"

**Decision**: Use cursor-based pagination via `limit(100)` + `startAfter(lastDoc)`. `useFavorites` exposes `{ favorites, loading, hasMore, loadMore() }`. `loadMore()` fetches the next 100 documents and appends them to a separate `tailItems` state; the live head subscription and the static tail are merged (de-duplicated by `id`, head wins on collision) to produce the returned `favorites` array. This ensures a live snapshot refresh — which always returns the current head page — never discards previously-loaded tail pages. Pagination is append-only; earlier pages are never evicted during the session. A `hasMore` boolean is derived from whether the last page fetch returned a full 100 docs.

**Rationale**: Resolves Session 2026-04-21 Q2 (soft cap 100 per phase, "Show older" control). Cursor pagination is idiomatic Firestore, scales to unbounded total favorites without degrading SC-002 (<3 s to open), and is compatible with `onSnapshot` — the first page remains a live subscription, while subsequent pages are fetched with `getDocs` since `onSnapshot` does not cleanly compose across `startAfter` boundaries. Only the first page stays live; older pages are static for the session, which is acceptable because edits most often target recently-saved items.

**Alternatives considered**:
- Single unbounded query — rejected: violates Principle VIII (Cost Discipline) at high item counts and breaks SC-002 latency.
- Full virtualized list — rejected: adds library dependency and engineering cost before evidence of need.
- Hard cap of 200 total favorites — rejected: Session 2026-04-21 Q2 selected soft cap with pagination over hard cap with rejection.

### R8: Offline / Snapshot Loss Handling

**Decision**: `useFavorites` tracks a `connectionState: 'live' | 'stale'` flag. The head `onSnapshot` is opened with `{ includeMetadataChanges: true }` so every snapshot callback fires with `snap.metadata.fromCache` populated. The hook sets `connectionState = snap.metadata.fromCache ? 'stale' : 'live'` on each callback, and additionally sets `'stale'` from the error callback (defence in depth). The last successful `favorites` array is retained throughout; the subscription is not torn down — the Firebase SDK auto-retries. When the server becomes reachable again, the next callback flips state back to `'live'`. The `FavoritesPanel` renders a non-blocking inline banner ("Offline — showing last saved list") when `connectionState === 'stale'`.

**Rationale**: Resolves Session 2026-04-21 Q4. Driving stale detection off `metadata.fromCache` catches the common offline-but-reading-cache case that Firestore handles gracefully *without* firing the error callback — using the error callback alone would under-report stale state. Matches Principle VII (No Silent Override) — the stale state is explicitly signaled; matches Principle VI (Hidden Layers Auditable) — the banner makes the degraded state user-visible. Reuses the Firebase SDK's built-in retry rather than adding a manual retry loop.

**Alternatives considered**:
- Blank the panel on error — rejected: destroys context the user may still want to load from.
- Hard error screen with Retry button — rejected: too aggressive for transient network blips; silently-recovered failures would still require user action.
- Fall back to the missing-index path on every error — rejected: conflates two distinct failure modes.
- Error-callback-only detection (no `includeMetadataChanges`) — rejected: Firestore serves from cache silently for most transient offline states and never fires the error callback; users would see stale data without any banner. The metadata path closes that gap.

### R9: Accessibility Baseline — WCAG 2.1 AA

**Decision**: Achieve WCAG 2.1 AA compliance on the favorites panel and its controls. Implementation directives:

- "Saved [X]" toggle button: `<button>` with `aria-expanded`, `aria-controls` pointing to the panel region.
- Panel container: `role="region"` with `aria-label` describing the phase (e.g., "Saved hooks").
- Each favorite item: `role="listitem"` within a `role="list"` wrapper; Load and Remove rendered as `<button>` with accessible names.
- Sort control: `<select>` or grouped `<button role="radio">` set with `aria-label`.
- "Show older" control: `<button>` with accessible name; after load, move focus to the first newly-appended item.
- Count badge and offline banner: placed inside an `aria-live="polite"` region so screen readers announce changes.
- Focus management: opening the panel moves focus to the first interactive control; closing returns focus to the toggle. Trap is not required since the panel is non-modal, but `Escape` should close it.
- RTL: preserve `dir="rtl"` on Arabic previews; ensure tab order follows DOM order (keyboard navigation is visual-direction-independent).

Testing: axe-core automated scan in Vitest plus a manual keyboard-only pass — both required for SC-007 acceptance.

**Rationale**: Resolves Session 2026-04-21 Q5. WCAG 2.1 AA is the launch-quality constitution's implicit baseline for visible product surfaces; making it explicit here gives acceptance tests a concrete target. axe-core is already a common Vitest pairing and catches the majority of critical/serious violations without hand-rolled audits.

**Alternatives considered**:
- Best-effort / no standard — rejected: unenforceable; spec cannot have a testable SC.
- WCAG 2.1 AAA — rejected: disproportionate for this surface (e.g., 7:1 contrast) and would block on non-critical items.
- AA for interactive only, exempting static previews — rejected: preview text IS the primary content; excluding it would defeat the purpose.

## All NEEDS CLARIFICATION: Resolved

No unresolved technical unknowns remain. All decisions are backed either by existing codebase patterns or by the two clarification sessions recorded in `spec.md`.
