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
   - Else (team member) → `where('workspaceId', 'in', allowedWorkspaceIds.slice(0, 30))`. **Known limitation**: Firestore caps `in` queries at 30 items, so a member with more than 30 accessible workspaces sees only the first 30 in their listing. The implementation logs a `phase13 ▸ getUserProjects allowedWorkspaceIds truncated …` warning when this clipping happens. Fan-out across multiple `in` queries with merging is a possible future fix, but in practice members hold ≤ 5–10 workspaces, so the truncation is dormant at launch.
   - If `status` set → `where('status', '==', status)`
   - Order by `timestamp DESC, id DESC` (matches `firestore.indexes.json` composites in `data-model.md`)
   - `limit(pageSize + 1)` — fetch one extra row so a "next page" can be detected without an additional round-trip
   - If `cursor` present → `startAfter(cursor.timestamp, cursor.id)`
4. For each returned doc, project to `SavedProjectListItem` (compute `stepsWithData`).
5. Build `nextCursor`:
   - If returned `length > pageSize` → there IS a next page. Drop the extra row (it's the lookahead), then encode the last *kept* doc's `{ timestamp, id }` as base64.
   - Else → `null`. (An exactly-`pageSize`-or-fewer result means we've reached the tail.)
   - This avoids the `length === pageSize` ambiguity that would otherwise advertise a phantom next page on every exactly-full last page.

### Pagination stability

- The composite-key tiebreaker `(timestamp DESC, id DESC)` makes cursor pagination stable across concurrent writes (a new project can only appear at the head of the list, never in the middle of a page the caller is paginating).
- If the doc the cursor points at is deleted between calls, Firestore's `startAfter` still works correctly (it's a document-snapshot-free cursor; we pass `[timestamp, id]` directly).

### Status filter semantics

- `status: 'rendered'` and `status: 'published'` return only projects whose persisted `status` field equals the requested value.
- `status: 'draft'` is the awkward case for legacy projects (created before Phase 13) that have no `status` field at all. Firestore does **not** treat a missing field as `null`, so a `where('status', '==', null)` query would NOT match those documents. The implementation therefore relies on persisted-status migration: every Phase 13 save callsite (client and server) computes `deriveStatus(...)` and writes a concrete value, so any legacy project becomes status-tagged the first time the user touches it (FR-022). Until that first touch, a legacy project will simply be invisible to the `status: 'draft'` filter — surfaced via the `All` tab instead. Backfilling legacy docs is out of scope for this phase; if it later becomes necessary, run a one-shot migration that reads every `users/{uid}/projects/*` doc and writes back `status: deriveStatus(undefined, doc)`.

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
| `legacy_status_after_first_save_drafts` | A legacy project (no `status` field at write time) that has been touched once by Phase-13 save code now carries `status: 'draft'` and is returned by the `status: 'draft'` filter. The matching negative case — a *truly untouched* legacy project, with no `status` field on disk, is **NOT** matched by the `status: 'draft'` filter (Firestore does not equate missing fields with `null`); it appears only in the `All` tab until next save promotes it. See "Status filter semantics" above. |
| `permission_denied_no_metadata_leak` | Permission-denied response payload is JSON-strict-equal to `{ error: { code: 'PERMISSION_DENIED', ... } }` with no `projects`, `nextCursor`, or any project shape leaked. |
