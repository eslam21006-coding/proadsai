# Phase 1 — Data Model: Saved Projects (Phase 13)

**Date**: 2026-04-22
**Plan**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md) · **Research**: [research.md](./research.md)

This document captures the data shapes, validation rules, and state transitions for Phase 13. Source-of-truth for type declarations is `src/types.ts` (frontend) and a hand-mirror in `functions/src/savedProjects/types.ts` (backend); the contracts in `contracts/` carry the canonical definitions.

---

## Entities

### 1. SavedProject (extended)

The existing `SavedProject` interface in `src/types.ts:406` is extended with two new optional fields. All other existing fields are preserved unchanged.

| Field | Type | Required | New in Phase 13? | Notes |
|---|---|---|---|---|
| `id` | `string` | yes | no | UUID-ish project identifier; key in IndexedDB and Firestore subdoc id. Stable across save→load. |
| `userId` | `string \| undefined` | usually | no | Owning user uid. `undefined` only for projects created before Phase 6 — treated as "owned by current signed-in user" on load. |
| `name` | `string` | yes | no | User-visible project name; auto-generated as `📝 {productName}` for drafts (existing behaviour). |
| `workspaceId` | `string \| undefined` | usually | no | Owning workspace. `undefined` only for legacy projects from before Phase 10. Phase 12 reassign cascade fills these on workspace delete. |
| `timestamp` | `number` | yes | no | Unix ms; `Date.now()` at save time. Used for list ordering and pagination. |
| `inputs` | `AdInputs \| null` | yes | no | Step 1 inputs object; `null` when not yet entered. |
| `phase` | `AppPhase` | yes | no | Last active step (`step1` … `step5` etc.). Used for the "open via card body resumes here" path (FR-010). |
| `tovText` | `string` | yes | no | Step 2 output. Empty string = not present. |
| `conceptsText` | `string` | yes | no | Step 2 concept candidates. |
| `selectedTov` | `string` | yes | no | User-picked tone-of-voice. |
| `selectedConcept` | `string` | yes | no | User-picked concept. |
| `buildPlan` | `string` | yes | no | Step 3 build plan. Empty = not present. |
| `mockupHistory` | `Array<{ url: string; ratio: AspectRatio }>` | yes | no | Step 4 single-format render history. `length > 0` ⇒ Step 4 has data. |
| `historyIndex` | `number` | yes | no | Pointer into `mockupHistory` for the active mockup. |
| `resolvedUniverse` | `string` | yes | no | Resolved universe family. |
| `captionText` | `string` | yes | no | Step 5 caption. Empty = not present. |
| `batchCaptions` | `Array<{ hookKey, hookText, captionText }> \| undefined` | no | no | Per-batch-item captions. |
| `batchResults` | `BatchResult[] \| undefined` | no | no | Step 4 batch render results (item 1 = `[0]`). |
| `batchHookGroups` | `Array<…> \| undefined` | no | no | Per-hook batch grouping. |
| `carouselSlides` | `CarouselSlide[] \| undefined` | no | no | Step 4 carousel render slides (slide 1 = `[0]`). |
| `reassignedFromWorkspaceId` | `string \| undefined` | no | no | Set by Phase 12 cascade when source workspace is deleted. Read-only consumer in this phase. |
| `resolvedCreativeSpec` | `any` | no | no | Resolver output snapshot. |
| `creatorName`, `creatorEmail` | `string \| undefined` | no | no | Team-member attribution. Used by team-listing rendering. |
| **`status`** | **`'draft' \| 'rendered' \| 'published' \| undefined`** | **no** | **YES** | Persisted status. `undefined` ⇒ legacy project (treated as `draft` per FR-022). Always set after first save through Phase 13 code path. |
| **`thumbnailUrl`** | **`string \| undefined`** | **no** | **YES** | URL of the durable thumbnail asset. `undefined` ⇒ project has no cover image yet (placeholder rendered). Stable Firebase Storage download URL once persisted. |
| **`metaAdId`** | **`string \| undefined`** | **no** | **already on existing record** | Source of truth for "this project has been published to Meta". The status latch at save time reads this. (Already populated by the Meta-push code path; Phase 13 only consumes it.) |

**Note on `metaAdId`**: This field already exists on records that have been pushed (set by the existing Meta-push handler). Phase 13 does not introduce it; the `data-model.md` lists it explicitly so the status-derivation rule below references a real field name.

### 2. ProjectThumbnailAsset

A Firebase Storage object backing `SavedProject.thumbnailUrl`. Not a separate Firestore document — just a Storage path.

| Property | Value |
|---|---|
| Storage path | `users/{uid}/projects/{projectId}/thumbnail.jpg` |
| Content-Type | `image/jpeg` (also accepts `image/png` if the cover render is PNG; client picks based on source MIME) |
| Lifecycle | Created when `resolveCoverImage()` returns a non-Storage URL; replaced when the cover image changes; deleted when `SavedProject` is deleted (cascade in delete callable / client delete path). |
| Access | Read/write by owner uid only (storage.rules — see `contracts/storage-rules.md`). |
| Size cap | 256 KB after client-side downscale to 512×512 max. (Implementation-side optimisation; the user-visible thumbnail is rendered at 64×64.) |

### 3. ProjectListPage

Response shape of `getUserProjects`. Lives in `contracts/getUserProjects.md`.

| Field | Type | Notes |
|---|---|---|
| `projects` | `SavedProjectListItem[]` | Trimmed projection — see below — to keep payload small. |
| `nextCursor` | `string \| null` | Opaque base64 of `{ timestamp, id }`. `null` ⇒ no more pages. |

`SavedProjectListItem` is a narrowed view of `SavedProject` for list rendering only (skips heavy fields like `mockupHistory`, `batchResults`, `carouselSlides`):

```ts
{
  id: string;
  workspaceId?: string;
  name: string;
  timestamp: number;
  status: 'draft' | 'rendered' | 'published';   // server always returns a concrete value (legacy → 'draft')
  thumbnailUrl?: string;
  stepsWithData: { step1: boolean; step2: boolean; step3: boolean; step4: boolean; step5: boolean };  // computed server-side from existing fields, lets the client render the dot navigator without shipping the whole project
  creatorName?: string;
  creatorEmail?: string;
  phase: AppPhase;                              // for "open via card body" resume target
}
```

### 4. AutoSaveState (in-memory only — not persisted)

Held by `useProjectAutoSave` hook; mirrored as a flag in the Zustand store so the header indicator can subscribe.

```ts
type AutoSaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }                                                                // "Saving…" indicator
  | { phase: 'saved'; clearAt: number }                                                 // "Saved ✓", auto-clears 2 s after success
  | { phase: 'transient-error'; consecutiveFailures: 1 | 2 }                            // small inline error icon
  | { phase: 'persistent-failure'; consecutiveFailures: number; lastError: string };    // banner + manual retry button
```

Transitions:

```text
idle ──change──► saving ──cloud-OK──► saved ──2s──► idle
                       └─cloud-FAIL──► transient-error (1) ──change──► saving
                                                          └─cloud-FAIL again──► transient-error (2) ──change──► saving
                                                                                        └─cloud-FAIL again──► persistent-failure (3+)
                                                                                                    │
                                                                                                    └──cloud-OK on retry──► saved ──2s──► idle
```

Local IndexedDB save is independent — it runs synchronously before each cloud save and never enters this state machine. Local-save failures fall back to a console error (extremely rare; we don't have a UX for them yet).

### 5. Plan-cap reference

| Plan | `savedProjectLimit` | Source |
|---|---|---|
| `none` | 0 (unauthenticated / unpaid → no projects savable) | `src/planconfig.ts` |
| `starter` | 10 | `src/planconfig.ts` |
| `pro` | 30 | `src/planconfig.ts` |
| `scale` | `Infinity` (unlimited) | `src/planconfig.ts` |

---

## Validation rules

### V1 — Status derivation (FR-001 / FR-002)

```text
deriveStatus(prev, project):
  derived =
    project.metaAdId      ? 'published'  :
    project.mockupHistory.length > 0
      || (project.carouselSlides?.length ?? 0) > 0
      || (project.batchResults?.length ?? 0) > 0
                          ? 'rendered'
                          : 'draft'
  return max(rank(prev ?? 'draft'), rank(derived))
  where rank: draft=0, rendered=1, published=2
```

- Pure function, no side effects.
- `prev` reads the project's currently persisted `status` field.
- `published` once set never demotes (FR-002).
- Implemented in `src/lib/projectStatus.ts` and `functions/src/savedProjects/projectStatus.ts` (R1) — fixture-tested for parity.

### V2 — Cover image resolution (FR-004)

```text
resolveCoverImage(project):
  if project.carouselSlides?.length > 0:
    return { url: project.carouselSlides[0].imageUrl }
  if project.batchResults?.length > 0:
    return { url: project.batchResults[0].url }
  if project.mockupHistory.length > 0:
    return { url: project.mockupHistory[0].url }
  return null
```

Branch order is deliberate: a project that switched from single → carousel mid-flight will have both `mockupHistory` and `carouselSlides`. Carousel wins because `carouselSlides[0]` is the user's most recent intentional cover render (R3 / Clarification Q3).

### V3 — Quota enforcement (FR-006 / FR-007 / FR-008)

```text
enforceProjectQuota(uid, plan, isNewProject):
  if !isNewProject: return OK                                                       # updates always allowed
  if plan.savedProjectLimit === Infinity: return OK
  current = count(users/{uid}/projects)                                              # txn-read
  if current >= plan.savedProjectLimit:
    throw QUOTA_EXCEEDED({ plan, limit: plan.savedProjectLimit, current })
  return OK
```

- Server-side (`functions/src/savedProjects/projectQuota.ts`) inside the same Firestore transaction as the project write. Prevents the race where two devices both pass a pre-check and both write.
- Client-side mirror in `App.tsx` save path uses `getAllProjectsFromDB` length for instant feedback (no round-trip), then trusts the server result for authority. Client mismatch shows the server's error verbatim.
- "Update existing project" is detected by `id` already existing in Firestore (`getDoc().exists`) — not by client-side intent.

### V4 — Step-data presence (FR-009)

```text
stepsWithData(project) = {
  step1: project.inputs !== null && Object.keys(project.inputs).length > 0,
  step2: project.tovText !== '' || project.selectedTov !== '',
  step3: project.buildPlan !== '',
  step4: project.mockupHistory.length > 0
         || (project.carouselSlides?.length ?? 0) > 0
         || (project.batchResults?.length ?? 0) > 0,
  step5: project.captionText !== ''
         || (project.batchCaptions?.length ?? 0) > 0,
}
```

Computed server-side at list time and shipped on `SavedProjectListItem.stepsWithData` so the dot navigator doesn't need to ship the whole project.

### V5 — Step-target validation (FR-010 / FR-011)

```text
loadProject(project, targetPhase?):
  steps = stepsWithData(project)
  if !targetPhase || !steps[targetPhase]:
    setCurrentPhase(project.phase)                                                  # default: project's own last active phase
  else:
    setCurrentPhase(targetPhase)                                                    # honour the target
```

- An invalid `targetPhase` (e.g., `step5` when no caption exists) silently falls back to `project.phase` (FR-011).
- A `targetPhase` of `undefined` means "open via card body" — uses project's own `phase` (existing behaviour).

### V6 — Workspace visibility (FR-020)

```text
listProjectsForCaller(callerUid, workspaceId?, ...):
  ownerUid, allowedWorkspaces = resolveCallerScope(callerUid)
  # ownerUid = callerUid for owners, or the team owner uid for members
  # allowedWorkspaces = all workspaces (owner) OR the granted subset (member)
  if workspaceId:
    if !allowedWorkspaces.includes(workspaceId): throw PERMISSION_DENIED
    return query(users/{ownerUid}/projects).where(workspaceId == workspaceId)
  else:
    return query(users/{ownerUid}/projects).where(workspaceId in allowedWorkspaces)
```

- `resolveCallerScope` is the existing Phase 12 helper (read `users/{ownerUid}/team/members/{callerUid}` to find the owner-of-record and the workspace allowlist).
- Owner case is the trivial branch: `ownerUid = callerUid`, `allowedWorkspaces = all`.

---

## State transitions

### Status (project-level)

```text
       ╔══════╗
       ║ NULL ║  (legacy project loaded for the first time on Phase 13 code)
       ╚══╤═══╝
          │  next save →
          ▼
       ┌───────┐                       ┌──────────┐                       ┌────────────┐
       │ draft │ ── render produces ──►│ rendered │ ── meta push records ►│ published  │
       │       │    cover image         │          │    metaAdId           │ (LATCHED)  │
       └───────┘                       └──────────┘                       └────────────┘
                                              ▲                                  │
                                              │      meta link/ad disappears     │
                                              │  (NEVER demotes — FR-002 latch)  │
                                              └──────────────────────────────────┘
```

- Forward-only along `draft → rendered → published`.
- No reverse transition allowed.
- Initial NULL state happens only for legacy projects; opportunistic upgrade at next save (FR-022).

### Thumbnail

```text
none ─ first cover image rendered ─► transient (data: or FAL URL)
                                           │
                                           │ upload to Firebase Storage (R4)
                                           ▼
                                       durable (Storage download URL)
                                           │
                                           │ project deleted → cascade delete
                                           ▼
                                          gone
```

- Format-switch (single → carousel) re-runs the upload with the new cover image (slide 1).
- Re-renders of the *same* cover position replace the durable Storage object (same path → overwrite).
- Re-renders of *non-cover* positions (slide 2+, item 2+) MUST NOT touch the thumbnail.

### Auto-save

See **AutoSaveState** above.

---

## Indexes & query patterns

### Firestore — `users/{uid}/projects`

| Index | Fields | Purpose | Status |
|---|---|---|---|
| (existing) single-field on `timestamp` | `timestamp DESC` | Phase 12-era list ordering | preserved |
| **NEW** composite | `workspaceId ASC, timestamp DESC, id DESC` | `getUserProjects` workspace filter + paginated list | **add to `firestore.indexes.json`** |
| **NEW** composite | `status ASC, timestamp DESC, id DESC` | `getUserProjects` status filter without workspace | **add to `firestore.indexes.json`** |
| **NEW** composite | `workspaceId ASC, status ASC, timestamp DESC, id DESC` | `getUserProjects` combined workspace + status filter | **add to `firestore.indexes.json`** |

The `id DESC` tiebreaker enables stable cursor pagination (R7).

### IndexedDB — `ProAdsDB_V2.projects`

| Index | Field | Purpose | Status |
|---|---|---|---|
| (existing) `userId` | `userId` | per-user project query | preserved; covers all client-side filtering for current user |

No new IndexedDB indexes needed — the client filters in memory after `getAllProjectsFromDB(uid)` (the dataset is bounded by the per-plan cap to ≤ 30 items in the worst case for paid plans, well within in-memory filter performance).

---

## Migration / backfill

- **No batch migration runs.** Existing records remain on disk untouched.
- On every load: legacy projects with no `status` field render as `draft` (FR-022) and no `thumbnailUrl` ⇒ placeholder (FR-023).
- On next save: `deriveStatus(undefined, project)` runs and persists a concrete status; if a cover image exists, `uploadAndPersistThumbnail` runs and persists `thumbnailUrl`.
- Server-side: same logic in the new save path. The old `saveProjectToFirestore` callsite gains a wrapping function that calls `deriveStatus` + `enforceProjectQuota` before forwarding to the existing write.

This satisfies SC-010 (zero-error legacy load).
