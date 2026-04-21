# Implementation Plan: Favorites & Workspace

**Branch**: `010-favorites-workspace` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-favorites-workspace/spec.md`

## Summary

Fix bookmark state persistence so saved favorites display correctly on page load; add per-step favorites panels (Steps 2–5) with load/edit/save-back capabilities; enable team-scoped favorites within shared workspaces with full team access; and encode the four clarifications from Session 2026-04-21 into concrete design: (1) no private-in-team mode — all workspace favorites auto-share; (2) soft cap of 100 items per phase with "Show older" pagination; (3) revoked workspace members lose access to every favorite bearing that `workspaceId`, including their own saves; (4) panel keeps the last successful snapshot on connection loss, surfaces a non-blocking "Offline — showing last saved list" banner, and auto-resumes; (5) panel meets WCAG 2.1 AA with keyboard operability, ARIA labels, and `aria-live` count announcements.

All favorite state is derived from the existing `feedback.savedToFavorites` field on `generations` documents — no new Firestore collection is introduced.

## Scope Boundaries

**In scope**: per-step favorites panels for Steps 2–5, bookmark state persistence fix, load/edit/save-back flow, team-scoped visibility via `workspaceId`, sort toggle, count badges, 100-item page with "Show older" pagination, offline banner, WCAG 2.1 AA baseline.

**Out of scope**:

- `PerformanceDashboard.tsx` Favorites tab — remains unchanged (read-only, non-team-scoped). Per-step panels become the primary favorites surface; the dashboard tab is neither modified nor removed.
- Backfill of `workspaceId` onto pre-existing `generations` documents — the field is assumed to be populated at creation time going forward; records created before Phase 6/Phase 8 may lack it and will surface only in personal-scope queries.
- Private-in-team mode / per-favorite visibility toggle — explicitly ruled out by Session 2026-04-21 Q1.
- Migration of a departing member's personal saves into personal scope — explicitly ruled out by Session 2026-04-21 Q3; records stay attached to the workspace.

**Deploy prerequisites**: the two composite indexes (see `data-model.md` § Firestore Indexes Required) must be present in `firestore.indexes.json` and deployed before team-scoped queries run at full efficiency; the fallback path (broader query + client-side filter) keeps the feature functional during rollout.

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions)
**Primary Dependencies**: React 19, Zustand, Tailwind CSS 3, Firebase SDK (Firestore `onSnapshot`, `query`, `where`, `orderBy`, `limit`, `startAfter`)
**Storage**: Firestore — `generations` collection (existing), `feedback.savedToFavorites` boolean field
**Testing**: Vitest (frontend), Jest via `cd functions && npm test` (backend), axe-core for WCAG 2.1 AA automated audit
**Target Platform**: Web (Vite 7 dev server + Firebase Hosting); evergreen Chromium/Firefox/Safari
**Project Type**: Web application (SPA frontend + Firebase Cloud Functions v2 backend)
**Performance Goals**: Bookmark state correct on first paint (<1 s); favorites panel opens and loads first page (≤100 items) in <3 s (SC-002); real-time sync ≤2 s (SC-003); "Show older" next-page load in <2 s
**Constraints**: No new Firestore collections; reuse existing `generations` schema; two composite indexes required; WCAG 2.1 AA on all interactive controls and `aria-live` for count + banner changes; RTL-safe focus order
**Scale/Scope**: Per-user or per-workspace favorites may exceed 100 per phase — panel paginates at 100; stored total is unbounded. Small teams (<20 members) expected; larger workspaces remain functional because the query is bounded by the 100-item page, not by member count.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Reliability Over Feature Count | PASS | Feature completes an existing incomplete system (favorites). No new generation modes. Pagination + offline banner reduce failure modes rather than adding feature surface. |
| II. Selected Mode Must Be Obeyed | PASS | Loading a favorite restores exact saved state (FR-005); update-vs-keep-both prompt prevents silent overwrite (FR-007); offline banner prevents silent staleness (FR-015). |
| III. Launch Surface Is Frozen | PASS | Favorites & Workspace enhances existing launch-approved step flows. No new launch surface. PerformanceDashboard favorites tab explicitly stays unchanged. |
| IV. Behavior Contracts | PASS | FR-001 … FR-016 define explicit pass/fail rules. SC-001 … SC-007 define measurable acceptance. |
| V. Arabic Quality Is First-Class | PASS | FR-016(d) requires RTL content previews to preserve `dir="rtl"` and correct focus order — elevated from prior informal reference in plan. |
| VI. Hidden Layers Must Be Auditable | PASS | Auto-save-before-load creates a visible bookmark record; offline state is surfaced via a visible banner, not swallowed. No hidden transformation path. |
| VII. No Silent Override | PASS | Auto-save is explicitly disclosed (bookmark appears in panel); update/keep-both prompt is explicit; offline banner signals stale state; count-badge changes are announced via `aria-live`. |
| VIII. Cost Discipline | PASS | No additional generation calls. Firestore reads are bounded per page (`limit(100)`) instead of unbounded. `onSnapshot` avoids polling. Auto-save reuses existing `toggleFavorite` path. |
| IX. Proof Required for Fixes | PASS | Bookmark state fix (FR-001 → SC-001) is before/after testable. Offline banner (FR-015) has observable visual state. |
| X. Spec Before Code | PASS | Full spec with two clarification sessions (2026-04-05, 2026-04-21) complete before this plan revision. |
| XI. Frontend/Backend Must Agree | PASS | Favorite state is read directly from Firestore (single source of truth). `workspaceId` scoping matches the same predicate used in `PerformanceDashboard.tsx`. No second write path. |
| XII. Deferred Scope Stays Deferred | PASS | Private-in-team mode, workspaceId backfill, and ex-member migration are all explicitly deferred in Scope Boundaries — no implicit leakage. |

**Gate result: ALL PASS — proceed to Phase 0.**

**Post-Design Re-check (after Phase 1 artifacts updated)**: Re-evaluated against the updated `research.md` (R7 pagination, R8 offline, R9 WCAG), `data-model.md` (pagination query patterns + client-side derived state), and `contracts/favorites-service.md` (expanded `useFavorites` interface + a11y contract). No new violations introduced; all 12 principles continue to PASS. Notable confirmations: R8 (offline banner) reinforces Principle VII (No Silent Override); R9 reinforces Principle V (Arabic Quality) via explicit RTL focus-order requirement; R7 (bounded 100-item pages) reinforces Principle VIII (Cost Discipline) by making per-query reads predictable.

## Project Structure

### Documentation (this feature)

```text
specs/010-favorites-workspace/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── favorites-service.md
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── hooks/
│   └── useFavorites.ts          # Real-time favorites subscription hook + pagination + connection-state
├── components/
│   ├── FavoritesPanel.tsx       # Reusable per-step panel (sort, Load/Remove, Show older, offline banner)
│   └── FeedbackButtons.tsx      # Reads real savedToFavorites state on mount
├── services/
│   └── feedbackService.ts       # getFavoriteIds, updateFavoriteRecord, pagination cursor helpers
├── store.ts                     # loadedFavoriteId tracking for update/keep-both prompt
└── App.tsx                      # Integrates FavoritesPanel into Steps 2–5; count badges; auto-save-before-load

firestore.indexes.json           # Two composite indexes (userId + workspaceId variants)
```

**Structure Decision**: Single reusable `FavoritesPanel` parameterized by `phase`, not four per-step components. Step integration remains inline in `App.tsx` where step UIs already live. Pagination state and connection-state flags live inside `useFavorites` so every consumer panel shares the same bounds and recovery behavior without per-step duplication.

## Complexity Tracking

> No constitution violations — no justifications required.
