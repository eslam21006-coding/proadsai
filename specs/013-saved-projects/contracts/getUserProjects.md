# Contract: `getUserProjects` Callable

**Type**: Firebase Cloud Functions v2 callable (`onCall`)
**Path**: `functions/src/savedProjects/getUserProjects.ts`, exported via `functions/src/index.ts`
**Authentication**: required — caller MUST be signed in (`request.auth?.uid` non-null) or the call returns `UNAUTHENTICATED`.
**Implements**: FR-019, FR-020 from `spec.md`. Mirrors `getAllProjectsFromFirestore` (existing client-side helper) on the server side, plus filtering, pagination, and team-member access control.

---

## Request

```ts
interface GetUserProjectsRequest {
  workspaceId?: string;                            // optional; omit = projects across all workspaces the caller can see
  status?: 'draft' | 'rendered' | 'published';     // optional; omit = all statuses
  pageSize?: number;                               // 1..100, default 50
  cursor?: string;                                 // opaque base64; omit on first page
}
```

### Field rules

| Field | Validation |
|---|---|
| `workspaceId` | If present, must be a non-empty string. The server resolves whether the caller is allowed to see this workspace via `resolveCallerScope`. Disallowed workspace ⇒ `PERMISSION_DENIED`. Workspace that exists but has `deletedAt != null` (Phase 12 soft-delete) ⇒ same `PERMISSION_DENIED` (the workspace is no longer visible). |
| `status` | If present, must be one of the three literals. Anything else ⇒ `INVALID_ARGUMENT`. |
| `pageSize` | If present, must be an integer 1..100. Out of range ⇒ clamped to range (no error). Omitted ⇒ 50. |
| `cursor` | If present, must be a base64 string decoding to JSON `{ timestamp: number, id: string }`. Malformed ⇒ `INVALID_ARGUMENT`. The cursor must come from a previous response of this same callable; cross-callable cursors not supported. |

---

## Response

```ts
interface GetUserProjectsResponse {
  projects: SavedProjectListItem[];                // see Shape below
  nextCursor: string | null;                       // null when no more pages
}

interface SavedProjectListItem {
  id: string;
  workspaceId?: string;
  name: string;
  timestamp: number;                               // Unix ms; descending order in the page
  status: 'draft' | 'rendered' | 'published';     // server always returns a concrete value (legacy projects → 'draft')
  thumbnailUrl?: string;                           // Firebase Storage download URL when present
  stepsWithData: {
    step1: boolean;
    step2: boolean;
    step3: boolean;
    step4: boolean;
    step5: boolean;
  };
  phase: 'step1' | 'step2' | 'step3' | 'step4' | 'step5';   // for "open via card body" resume target
  creatorName?: string;
  creatorEmail?: string;
}
```

**Notes**:
- `SavedProjectListItem` is intentionally *trimmed* — heavy fields (`mockupHistory`, `batchResults`, `carouselSlides`, `inputs`, `tovText`, `conceptsText`, `buildPlan`, `captionText`, `resolvedCreativeSpec`) are NOT in the list payload. The full project is fetched on demand by the existing client-side load path when the user clicks a card.
- `stepsWithData` is computed server-side via the rule in `data-model.md` V4.
- `nextCursor` is opaque base64. Clients pass it back unmodified to fetch the next page.

---

## Errors

| Error code | When |
|---|---|
| `UNAUTHENTICATED` | Caller is not signed in. |
| `PERMISSION_DENIED` | `workspaceId` is set and the caller is a team member without access to that workspace, or the workspace belongs to another user entirely. The response payload MUST NOT leak any project metadata in this case (FR-020 / SC-009). |
| `INVALID_ARGUMENT` | Malformed `status` value, malformed `cursor`, or non-numeric `pageSize`. |
| `RESOURCE_EXHAUSTED` | Reserved for future rate-limit guard (deferred per `research.md` R11). Not implemented in V1. |

---

## Behaviour

### Resolution order

1. Resolve caller scope via `resolveCallerScope(callerUid)` (Phase 12 helper):
   - If caller is a team member: returns `{ ownerUid, allowedWorkspaceIds }`.
   - If caller is an account owner: returns `{ ownerUid: callerUid, allowedWorkspaceIds: 'ALL' }`.
2. If `workspaceId` is in the request and not in `allowedWorkspaceIds` (and `allowedWorkspaceIds !== 'ALL'`) → throw `PERMISSION_DENIED`.
3. Build the Firestore query against `users/{ownerUid}/projects`:
   - If `workspaceId` set → `where('workspaceId', '==', workspaceId)`
   - Else if owner → no workspace constraint
   - Else (team member) → `where('workspaceId', 'in', allowedWorkspaceIds.slice(0, 30))` (Firestore `in` cap is 30 items; if a member somehow has > 30 workspaces, fan out into multiple queries and merge — extremely unlikely in practice)
   - If `status` set → `where('status', '==', status)`
   - Order by `timestamp DESC, id DESC` (matches `firestore.indexes.json` composites in `data-model.md`)
   - `limit(pageSize)`
   - If `cursor` present → `startAfter(cursor.timestamp, cursor.id)`
4. For each returned doc, project to `SavedProjectListItem` (compute `stepsWithData`).
5. Build `nextCursor`:
   - If returned `length === pageSize` → encode `{ timestamp, id }` of the last doc as base64.
   - Else → `null`.

### Pagination stability

- The composite-key tiebreaker `(timestamp DESC, id DESC)` makes cursor pagination stable across concurrent writes (a new project can only appear at the head of the list, never in the middle of a page the caller is paginating).
- If the doc the cursor points at is deleted between calls, Firestore's `startAfter` still works correctly (it's a document-snapshot-free cursor; we pass `[timestamp, id]` directly).

### Status filter semantics

- `status: 'draft'` returns projects whose persisted `status === 'draft'` AND projects with no `status` field at all (legacy projects → treated as draft per FR-022). The query handles this with a small post-filter on the server when `status === 'draft'` is requested: it issues both `where('status', '==', 'draft')` AND `where('status', '==', null)` and concatenates (or, simpler, the migration sets `status` on every read path so this becomes a non-issue after the first save).
- `status: 'rendered'` and `status: 'published'` return only projects with a persisted matching value.

### Audit / instrumentation

- Each call logs (info-level): `{ callerUid, ownerUid, workspaceId, status, pageSize, returnedCount, durationMs }`.
- Permission denials log (warn-level): `{ callerUid, requestedWorkspaceId, reason }` — supports debugging team-access bugs.

---

## Test fixtures

Live in `functions/src/__tests__/__fixtures__/savedProjects.fixtures.ts`.

| Fixture | Asserts |
|---|---|
| `owner_unfiltered_returns_all` | Owner with 5 projects across 2 workspaces, no filter → returns all 5, ordered by timestamp desc. |
| `owner_workspace_filter` | Owner, `workspaceId: 'ws-A'` → returns only projects in ws-A. |
| `owner_status_filter` | Owner, `status: 'rendered'` → returns only rendered projects. |
| `owner_combined_filter` | Owner, `workspaceId: 'ws-A'` + `status: 'published'` → intersection. |
| `member_workspace_allowed` | Member with access to ws-A only, `workspaceId: 'ws-A'` → returns ws-A projects (created by anyone — owner or another member). |
| `member_workspace_denied` | Member with access to ws-A only, `workspaceId: 'ws-B'` → throws `PERMISSION_DENIED`, payload contains no project metadata. |
| `member_no_workspace_param` | Member with access to ws-A only, no `workspaceId` → returns only ws-A projects. |
| `pagination_two_pages` | 6 projects, `pageSize: 4` → page 1 returns 4 projects + non-null cursor; page 2 returns 2 projects + null cursor. |
| `pagination_cursor_stable` | After page 1, owner adds a new project; page 2 returned via cursor still contains the original next 2 (new project doesn't shift the cursor). |
| `legacy_status_filter_draft` | A project with no `status` field is included in the `status: 'draft'` page. |
| `permission_denied_no_metadata_leak` | Permission-denied response payload is JSON-strict-equal to `{ error: { code: 'PERMISSION_DENIED', ... } }` with no `projects`, `nextCursor`, or any project shape leaked. |
