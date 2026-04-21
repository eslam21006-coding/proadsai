# Scheduled Contract: `purgeExpiredWorkspaces`

**Kind**: Cloud Functions v2 `onSchedule`.
**Schedule**: Daily at 04:00 UTC.
**Related FRs**: FR-006a (30-day purge).

## Input

None. Invoked on schedule only.

## Output

Writes an internal invocation log (via existing logger wiring) summarizing:

```ts
interface PurgeRunSummary {
  startedAt: number;
  finishedAt: number;
  workspacesChecked: number;
  workspacesPurged: number;
  errors: { workspaceId: string; reason: string }[];
}
```

## Query & action

```text
q = collectionGroup('workspaces')
    .where('deletedAt', '<=', now - 30*24*3600*1000)
    .limit(500)

for each doc in q:
   // guard: should never see default workspace here, but refuse if somehow hit
   if doc.isDefault: log error, skip
   delete doc
   // do NOT touch workspace_access_audit entries for this workspace — per Principle VI
   // do NOT touch generations/saved projects — already reassigned to default at delete time
```

Paginate until the query returns < `limit` results or a wall-clock budget (5 minutes) is exhausted; the next run picks up remaining.

## Failure handling

- Per-doc delete failures are logged and the job continues. Remaining docs are re-tried on the next daily run.
- The job MUST NOT crash mid-batch in a way that leaves workspaces in a half-purged state — deletes are independent.

## Notes

- Uses `collectionGroup` query; requires Firestore security rules to permit admin-context reads on every tenant's `workspaces` subcollection (they already do because rules are irrelevant to the admin SDK, but the collectionGroup query requires the composite index on `deletedAt`).
- Runs after `metaDailySync` (03:00 UTC, Phase 14) to avoid scheduling collisions.
