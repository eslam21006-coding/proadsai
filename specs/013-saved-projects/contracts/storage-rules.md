# Contract: Firebase Storage Rules — Project Thumbnails

**Source file**: `storage.rules` (root)
**Implements**: FR-014 (cascade-safe delete) and the spec assumption "Thumbnail images live in user-scoped storage with an access boundary that mirrors the saved-project access rules".

---

## Storage path

```text
users/{uid}/projects/{projectId}/thumbnail.{ext}
```

- `uid` — owning user's Firebase Auth uid.
- `projectId` — `SavedProject.id`.
- `ext` — `jpg` or `png` (client picks based on the cover render's source MIME).

---

## Rule (V1 — owner-only access)

```text
service firebase.storage {
  match /b/{bucket}/o {

    match /users/{uid}/projects/{projectId}/thumbnail.{ext} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null
                   && request.auth.uid == uid
                   && (ext == 'jpg' || ext == 'png')
                   && request.resource.size < 256 * 1024;
    }

    // ... existing rules preserved
  }
}
```

> Note: writes always validate `request.resource.size` (the incoming payload),
> never `resource.size` (the previously stored object). On a first-time
> upload `resource` is `null`, so any size predicate that ORs in
> `resource == null` would silently bypass the cap.

### What the rule does

- **Authentication required**: anonymous reads are denied.
- **Owner-only**: only the user whose uid matches the path may read or write.
- **Extension whitelist**: only jpg/png — prevents storing arbitrary blobs at the project path.
- **Size cap**: 256 KB — matches the data-model thumbnail size cap, prevents the path from being abused as general-purpose storage.

---

## Open consideration: team-member reads

V1 above denies cross-uid reads. The product flow returns thumbnail URLs through the `getUserProjects` callable, and team members render those URLs from their browsers. Two execution paths to verify during implementation:

1. **Path A — Storage download URL bypasses Storage rules**: Firebase Storage `getDownloadURL()` issues a long-lived signed URL that includes a token. The token-based URL bypasses the per-request rules check (Firebase Storage rules apply to *programmatic* SDK reads; URL token reads are governed by the token, not the rule). Under this model, V1 is correct as-is — team members fetch the URL directly via `<img src=...>` and Storage serves it.

2. **Path B — Token URLs are blocked or rotated**: If Firebase Storage rules apply to token URLs in the deployed configuration (this varies by Firebase Storage settings), V1 will deny team-member reads. In that case, switch to V2 below before launch.

### Rule (V2 — team-member-aware fallback, only if V1 fails team-member rendering)

```text
match /users/{uid}/projects/{projectId}/thumbnail.{ext} {
  allow read: if request.auth != null
              && (request.auth.uid == uid
                  || isTeamMemberOf(uid, request.auth.uid));
  allow write: if request.auth != null
               && request.auth.uid == uid
               && (ext == 'jpg' || ext == 'png')
               && (request.resource.size < 256 * 1024);
}

function isTeamMemberOf(ownerUid, callerUid) {
  return exists(/databases/(default)/documents/users/$(ownerUid)/team/members/$(callerUid));
}
```

- Adds a Firestore lookup to confirm `caller` is a team member of `owner`. Reuses the same Phase-12 `users/{ownerUid}/team/members/{callerUid}` document already consumed by `resolveCallerScope`.
- Writes remain owner-only — team members never upload thumbnails.

---

## Cascade delete

When a project is deleted (FR-014):

1. Client / callable deletes the IndexedDB record.
2. Client / callable deletes the Firestore doc at `users/{uid}/projects/{projectId}`.
3. Client / callable deletes the Storage object at `users/{uid}/projects/{projectId}/thumbnail.{ext}` via `deleteObject(ref)`. Both `.jpg` and `.png` extensions are attempted; the unused one returns `object-not-found` which is swallowed (FR-015 idempotency).

A Cloud Function `onDocumentDeleted` trigger is **not** added — the existing client-driven delete path is the source of truth. If the client delete partially fails (e.g., Firestore deleted but Storage delete failed), a follow-up cleanup is acceptable scope-out for V1; the orphan Storage object is unreachable to anyone but the owner and consumes negligible storage.

---

## Test fixtures

Live alongside the rest in `functions/src/__tests__/__fixtures__/savedProjects.fixtures.ts`. Storage-rule tests are exercised via Firebase Emulator Suite (`firebase emulators:exec --only storage`) — separate from the Node `assert/strict` callable tests.

| Fixture | Asserts |
|---|---|
| `owner_can_read_own_thumbnail` | uid X reads `users/X/projects/P1/thumbnail.jpg` → allowed. |
| `owner_can_write_own_thumbnail_under_size_cap` | uid X writes 100 KB jpg → allowed. |
| `owner_write_over_size_cap_denied` | uid X writes 300 KB jpg → denied. |
| `cross_uid_write_denied` | uid X writes to `users/Y/projects/P1/thumbnail.jpg` → denied. |
| `unauthenticated_read_denied` | No auth → denied. |
| `non_image_extension_denied` | uid X writes `users/X/projects/P1/thumbnail.gif` → denied. |
| `cross_uid_read_v1_denied` | uid Y reads `users/X/projects/P1/thumbnail.jpg` via SDK → denied (V1 only). |
| `team_member_read_v2_allowed` | uid Y is a team member of X; reads `users/X/projects/P1/thumbnail.jpg` → allowed (only after V2 ships). |

---

## Decision gate at implementation time

After deploying the V1 rule to a test project, verify team-member rendering:

1. Owner uploads a thumbnail.
2. Team member opens the project list, the `<img>` tag with the owner's thumbnail URL renders.
3. If the image renders → V1 stands.
4. If the image fails with 403 → switch to V2 before merge.

This decision is captured in `tasks.md` (to be created by `/speckit.tasks`) as a single mandatory verification step.
