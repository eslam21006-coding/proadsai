# Phase 0 Research: Workspace Logic (Scale Mode)

**Feature**: 012-workspace-logic
**Date**: 2026-04-21

Ten decisions that resolve the unknowns in `plan.md#Technical Context`. Each entry: **Decision**, **Rationale**, **Alternatives considered**.

---

## R1. Meta Advertiser-or-higher role verification

**Decision**: At `linkMetaAccountToWorkspace` time, issue one call to `GET /{ad-account-id}?fields=user_role&access_token={userToken}` against Meta Marketing API v20. Accept `ADMIN` or `ADVERTISER`. Reject (with `failed-precondition: insufficient_meta_role`) on any of `ANALYST`, `FINANCE_ANALYST`, `FINANCE_EDITOR`, `EMPLOYEE`, or missing. Cache the returned role on the workspace doc as `metaRoleAtLinkTime` for audit; re-probe on every push attempt to catch silent downgrades (edge case in spec).

**Rationale**: `user_role` is a first-class Meta field returned in a single call — no extra permission scope beyond the existing `ads_management` the product already holds. Probing at link time prevents the "link succeeds, publish silently fails" class of support ticket (the exact reason Q4 was asked). Re-probing at push satisfies the post-downgrade edge case in `spec.md`.

**Alternatives considered**:
- **Accept any account** and let publish fail. Rejected: breaks user trust; creates undebuggable publish failures.
- **Admin-only**. Rejected: too strict; most agency staff operate at Advertiser, not Admin.
- **Probe once, cache forever**. Rejected: misses role-downgrades that spec edge cases explicitly cover.
- **Probe only at push time**. Rejected: user discovers the problem at the worst possible moment, after entering creative.

---

## R2. Soft-delete purge strategy

**Decision**: Scheduled Cloud Function `purgeExpiredWorkspaces` runs daily at 04:00 UTC. Query `collectionGroup('workspaces').where('deletedAt', '<=', now - 30d)`, page 500 at a time, delete each workspace doc via batched writes. Keep the `workspace_access_audit` entries forever (they are per-action records, not per-workspace). Do NOT re-sweep already-reassigned generations — they stay on the default workspace regardless of the original owner's restore.

**Rationale**: Firestore supports `collectionGroup` queries across subcollections of the same name, so one scheduled job covers every tenant without iteration. 04:00 UTC sits after Phase 14's 03:00 `metaDailySync` and avoids peak user hours (the product's heaviest users are in UTC+2 / UTC+3). 500-per-batch matches Firestore batch-write limits. Keeping audit entries matches Principle VI (hidden-machine-layers auditable) — the audit log must outlive the thing it describes.

**Alternatives considered**:
- **Hard delete on user action, no retention**. Rejected by user in Q1.
- **Run every hour**. Rejected: no business need for sub-day granularity; more quota cost.
- **Trigger purge on restore request instead of scheduled**. Rejected: leaves purge tied to a user action that might never come; accounts that never restore would never purge.
- **Purge audit entries too**. Rejected: breaks Principle VI and the "who had access to what when" use case that motivated Q3.

---

## R3. Atomic delete + cascade-reassign

**Decision**: Two-phase delete.
- **Phase A (synchronous, inside the callable)**: Firestore transaction marks `workspace.deletedAt = serverTimestamp()` and `pendingReassign = true`. Transaction returns; user sees "Workspace deleted" toast.
- **Phase B (asynchronous, via Firestore trigger on `deletedAt` write)**: background handler paginates `generations where workspaceId == target` (batches of 400 writes) and `users/{uid}/projects where workspaceId == target` (same); each record gets `workspaceId = defaultWorkspaceId` + `reassignedFromWorkspaceId = target` (sidecar for restore). On completion, clears `pendingReassign`.

**Rationale**: A synchronous single-transaction approach is bounded by Firestore's 500-write transaction limit — a workspace with 400 generations would hit it. Splitting lets the user see immediate UI feedback (workspace disappears from switcher on `deletedAt` write) while the cascade completes in the background. The sidecar `reassignedFromWorkspaceId` enables lossless restore.

**Alternatives considered**:
- **Single transaction, refuse delete above N records**. Rejected: arbitrary limit that users would hit.
- **Fire-and-forget reassign**. Rejected: leaves partial state if the handler crashes; no way to verify completeness.
- **Store reassigned records in a separate subcollection**. Rejected: duplicates data; breaks existing `generations` queries.

---

## R4. Soft-delete restore fidelity

**Decision**: `restoreWorkspace` callable (owner-only; can be wired into a support-admin tool initially — not a user-facing UI this phase per the Q1 choice). Steps:
1. Verify `workspace.deletedAt` is set AND `now - deletedAt < 30d`. Else `failed-precondition: workspace_purged`.
2. Clear `deletedAt`, set `pendingRestore = true`.
3. Background handler queries `generations where reassignedFromWorkspaceId == target` and `users/{uid}/projects where reassignedFromWorkspaceId == target`; reverts `workspaceId` to target; clears `reassignedFromWorkspaceId`.
4. Clear `pendingRestore`.

Because the workspace doc itself is never purged during the 30-day window, `workspaceAccess` entries on team-member docs that still reference the workspace ID remain intact automatically.

**Rationale**: Using a sidecar field rather than a separate "trash" collection means no data duplication and no join at restore time. Access entries staying intact is a free benefit of not deleting the workspace doc.

**Alternatives considered**:
- **Separate `deletedWorkspaces` collection**. Rejected: adds migration plumbing, restore complexity.
- **Snapshot the full workspace state at delete time**. Rejected: unnecessary when the live doc is preserved anyway.

---

## R5. Field-level last-write-wins semantics

**Decision**: `updateWorkspace` implementation calls Firestore `.update()` with only the fields the client supplied. No `updatedAt`-based conflict check. No revision token. Two concurrent writes to disjoint field sets both succeed; two concurrent writes to the same field resolve by server-receive order.

**Rationale**: Q2 explicitly chose LWW. Firestore's native partial-`update()` gives this for free. Server-receive ordering is already effectively instantaneous at this write volume.

**Alternatives considered**:
- **Optimistic concurrency with `updatedAt` check**. Rejected by user in Q2.
- **Full-document set (merge: false)**. Rejected: would clobber other fields.
- **Per-field conditional writes via transactions**. Rejected: gross overkill for workspace-edit volume.

---

## R6. Workspace-scoped generation queries & indexing

**Decision**: Add one Firestore composite index to `firestore.indexes.json`:

```json
{ "collectionGroup": "generations", "queryScope": "COLLECTION", "fields": [
    { "fieldPath": "workspaceId", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "DESCENDING" }
]}
```

`getWorkspaceGenerations` filters by `userId` (or owner-uid for team members) **and** `workspaceId` **and** orders by `timestamp desc`, paginated with `startAfter(cursor).limit(20)`. For legacy records with no `workspaceId` (pre-Phase-12 generations, per FR-015), the read path for the default workspace issues a second query `where workspaceId == null` and merges client-side. Non-default workspace queries skip this second query (those records always belonged to the default).

**Rationale**: One composite index covers the primary access pattern. The second-query-for-default is O(page size), run only when the active workspace IS the default, so the overhead is minimal.

**Alternatives considered**:
- **Backfill all pre-phase records with the default workspace ID**. Rejected: touches every historical record for every user; unnecessary write cost; spec explicitly allows read-path handling (FR-015).
- **In `generations`, index only on `workspaceId`**. Rejected: would need client-side sort, loses pagination.

---

## R7. Team access filter — client-side + server-side (both)

**Decision**:
- **Server side**: `getWorkspaceGenerations`, `getUserProjects`, and any other workspace-scoped read callable verifies `callerUid === workspaceOwnerUid` OR (`callerUid` appears in `users/{ownerUid}/team/{memberDocId}` AND `workspaceAccess[]` contains the queried `workspaceId`). Else throws `permission-denied: workspace_access_denied`. `WorkspaceSwitcher.tsx`'s list is also filtered server-side via a dedicated `getAccessibleWorkspaces()` callable.
- **Client side**: `WorkspaceSwitcher.tsx` filters the cached Zustand workspace array by the member's cached `workspaceAccess` array on every render. `WorkspaceSettingsModal.tsx`'s "Create Workspace" button is disabled below Scale.
- **Security rules**: `firestore.rules` grant `read` on `users/{uid}/workspaces/**` to (a) owner, (b) any team member doc in `users/{uid}/team` whose uid matches the caller AND whose `workspaceAccess` array contains the workspace ID. Rules cover direct SDK reads (e.g. the frontend's `onSnapshot`) as a backstop.

**Rationale**: Principle XI requires both. Server callables are the primary trust boundary; security rules protect direct SDK reads; client filter is UX sugar (no empty flicker for denied data).

**Alternatives considered**:
- **Server only, no client filter**. Rejected: user sees full workspace list for 200ms before filter hits; confusing.
- **Security rules only**. Rejected: callables still need explicit checks because they run in admin context and bypass rules.

---

## R8. Mid-generation switch trigger predicate

**Decision**: Re-use the existing auto-save "dirty" predicate:

```text
hasInProgressWork =
  (inputs != null && hasAnyField(inputs)) ||
  tovText.length > 0 ||
  conceptsText.length > 0 ||
  buildPlan.length > 0 ||
  mockupHistory.length > 0 ||
  captionText.length > 0 ||
  (batchResults && batchResults.length > 0) ||
  (carouselSlides && carouselSlides.length > 0)
```

`WorkspaceSwitcher.tsx` computes this from the Zustand store on switch-click. If true and the target workspace differs from current, open the 3-button dialog.

**Rationale**: Aligns with spec FR-021/FR-023 and avoids inventing a second "dirty" predicate that would drift from the existing auto-save logic.

**Alternatives considered**:
- **Always prompt on switch**. Rejected: annoying when user has entered nothing.
- **Prompt only after Step 3 (buildPlan)**. Rejected: loses Step 2 hook work that the user entered manually.

---

## R9. Arabic + English strings for all new user-facing surfaces

**Decision**: Four string groups added to `src/i18n.tsx` before merge, each with `ar` and `en` keys:

| Surface | English | Arabic |
|---|---|---|
| Switch guard dialog title | `Switch workspace?` | `تبديل مساحة العمل؟` |
| Switch guard dialog body | `Switching workspace will start a new project. Save current work?` | `تبديل مساحة العمل سيبدأ مشروعًا جديدًا. احفظ عملك الحالي؟` |
| Switch guard — Save & Switch | `Save & Switch` | `احفظ وبدّل` |
| Switch guard — Discard & Switch | `Discard & Switch` | `تجاهل وبدّل` |
| Switch guard — Cancel | `Cancel` | `إلغاء` |
| Scale-required create error | `Creating more than one workspace requires the Scale plan.` | `إنشاء أكثر من مساحة عمل يتطلّب خطة Scale.` |
| Workspace limit reached | `You've reached the 10-workspace limit on the Scale plan.` | `وصلت إلى الحد الأقصى 10 مساحات عمل على خطة Scale.` |
| Insufficient Meta role | `Your Meta role on this ad account doesn't allow publishing. Request Advertiser access in Meta Business Manager to link it.` | `دورك على حساب إعلانات Meta هذا لا يسمح بالنشر. اطلب صلاحية Advertiser من Meta Business Manager لربطه.` |
| No workspace access empty state | `No workspace access — ask your team owner to grant you access.` | `لا توجد صلاحية وصول إلى مساحات عمل — اطلب من مالك الفريق منحك الصلاحية.` |
| Default workspace undeletable | `The default workspace can't be deleted.` | `لا يمكن حذف مساحة العمل الافتراضية.` |

**Rationale**: Principle V treats Arabic as first-class. Every new surface ships with the translation pair at the same commit — no "English first, Arabic later" debt.

**Alternatives considered**:
- **Ship English-only initially**. Rejected — violates Principle V.
- **Auto-translate via model**. Rejected — marketing-tone Arabic requires human phrasing.

---

## R10. Audit entry shape & ordering

**Decision**: Doc path `users/{ownerUid}/workspace_access_audit/{entryId}` where `entryId = {timestampMs}_{6charRandom}`. Fields:

| Field | Type | Notes |
|---|---|---|
| `actorUid` | string | The user who performed the grant/revoke (always the owner in this phase). |
| `targetMemberUid` | string | The team member whose access changed. |
| `targetMemberEmail` | string | For readability in the log listing. |
| `workspaceId` | string | The workspace ID involved. |
| `workspaceNameAtEvent` | string | Snapshot of the name at event time (so renames/deletes don't make the log illegible). |
| `action` | `'grant' \| 'revoke'` | The action kind. |
| `timestamp` | serverTimestamp | Server-assigned, immutable. |
| `planSnapshot` | `'none' \| 'starter' \| 'pro' \| 'scale'` | Owner's plan at event time (useful if a downgrade happens later). |

Firestore rules: **create** allowed only via the callable (admin context); **update** + **delete** forbidden for every user; **read** allowed to the owner only.

**Rationale**: Deterministic-but-time-sorted IDs make `orderBy('timestamp', 'desc').limit(50)` queries efficient and stable under clock skew. Snapshotting workspace name + plan prevents retrospective "what was the context?" gaps when those change later.

**Alternatives considered**:
- **Auto-generated UUID doc ID with `orderBy(timestamp)`**. Rejected: works, but slightly heavier index cost and the timestamp-prefixed ID doubles as a sort key.
- **Log in a flat top-level `workspace_access_audit` collection**. Rejected: cross-tenant query would need owner-uid filter; per-owner subcollection is simpler and isolates reads automatically.
- **Log also store workspace-state diff**. Rejected: out of scope; spec explicitly says "minimal" (Q3 option B).

---

## NEEDS CLARIFICATION — Status

**All Phase 0 research questions resolved.** No `NEEDS CLARIFICATION` remain. Ready for Phase 1 (data-model + contracts + quickstart).
