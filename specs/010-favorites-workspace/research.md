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

**Decision**: Client-side sort on the already-fetched favorites array. Default: newest first (`timestamp` descending). Toggle options: newest, oldest, alphabetical (by preview text). No server-side sort change needed.

**Rationale**: Favorites per phase per user are expected to be <100 items. Client-side sort on a small array is instant. The Firestore query always returns by `timestamp desc` — re-sorting in memory for oldest/alphabetical is trivial.

**Alternatives considered**:
- Multiple Firestore queries with different `orderBy` — rejected: unnecessary reads and index requirements for a small dataset.

## All NEEDS CLARIFICATION: Resolved

No unresolved technical unknowns remain. All decisions are backed by existing codebase patterns.
