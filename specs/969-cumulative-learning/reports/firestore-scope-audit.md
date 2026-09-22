# Firestore Document-Path Scope Audit - 969 Cumulative Learning

**Date:** 2026-09-19
**Scope:** every collection read or written by code under `functions/src/` (Cloud Functions) and `src/services/` (frontend) that participates in the 969 cumulative-learning / cross-workspace data flywheel, plus every other collection touched by a generation or sync call path.
**Goal:** confirm, collection by collection, whether the read and write paths are scoped by `workspaceId`, by `uid`, by both, or by neither, and where leakage is possible.

---

## TL;DR - the schema is split across three tiers

1. **`users/{uid}/workspaces/{wid}/adAccounts/{aid}/...`** - the canonical workspace-scoped tier for everything the 969 worker reads + writes. Rule files at `firestore.rules:113-168` use `isWorkspaceMember(userId, workspaceId)`. `adPerformance`, `baselines`, `syncSnapshots`, `settings`, `hookPerformance`, `visualPerformance`, `imageFingerprints`, `private/metaConnection` all live here. Every read and write used by the 969 worker (`runSyncForAccount` -> `applyLearningWrites`) walks this path correctly.

2. **Top-level `generations`** - written by the **frontend** (`feedbackService.saveGeneration`, `src/services/feedbackService.ts:254`) via `addDoc(collection(db, "generations"), record)`. The doc carries `userId` + `workspaceId` fields on the **success** path. Reads everywhere in the backend filter by both `userId` (`==`, derived from the callable scope) AND `workspaceId` (`==`, requested wid) - never either alone. The `onGenerationDeleted` trigger cascades using the deleted doc's stored `userId`/`workspaceId` fields. This is intentional and consistent on the success path. The failure-record path (`recordGenerationFailure` at `functions/src/index.ts:4165`, exception `populateSourceColdAdBrandColors`) uses `uid` not `userId`/`workspaceId` (line 52 below); cross-user leakage is denied because the `request.auth.uid == resource.data.uid` predicate holds on the failure-record read path - but the field is named differently and worth tracking.

3. **A legacy `adPerformance` (top-level) and a legacy `users/{uid}/projects` user-level path** - both still written by retained code paths but **not by the 969 worker**. `metaLegacySync` (`index.ts:6242-6464`) and `metaDisconnect` (`index.ts:3715-3749`) and `metaDataDeletion` (`index.ts:6514-6562`) use the top-level `adPerformance` collection. `saveProject` (`index.ts:7772-8000`) and `getUserProjects` (`savedProjects/getUserProjects.ts:19-121`) and `projectQuota` (`savedProjects/projectQuota.ts:39-77`) use `users/{ownerUid}/projects/{projectId}` (user-level; `workspaceId` is a field, not a path segment).

**Verdict:** the 969 worker, the dashboard, and the production sync path are all workspace-scoped. The legacy top-level `adPerformance` and the user-level `projects` are the only collections in the codebase that are NOT workspace-scoped at the **path** level (they key on `userId` instead). Their Firestore rules and server-side guards keep the data owner-only.

---

## Per-Collection Findings

### 1. `generations` (top-level)

| Field | Value |
| --- | --- |
| Write path | `generations/{autoGenId}` (top-level) |
| Read paths | `generations/{genId}` (single) - `generations` (filtered collection query) |
| Includes `workspaceId`? | Doc field only - `userId` + `workspaceId` on every record (feedbackService.ts:193-195) |
| Includes `uid`? | Doc field - `userId` on every record (same lines) |
| Cross-workspace leakage possible? | **No** - every read filters by both `userId == ownerUid` AND either `workspaceId == wid` or `workspaceId == null`. See below. |
| Cross-user leakage possible? | **No** - same `userId` filter on every backend read; client reads enforce `request.auth.uid == request.auth.uid` per `firestore.rules:241-245`. |

**Write site (frontend, authoritative):**

```ts
// src/services/feedbackService.ts:248-259
try {
    const cleanRecord = JSON.parse(JSON.stringify(stripUndefined(record)));
    const ref = await addDoc(collection(db, "generations"), cleanRecord);
    if (creativeIdentity && !creativeIdentity.generationId) {
        await updateDoc(ref, { "creativeIdentity.generationId": ref.id }).catch(() => {});
    }
    return ref.id;
} catch (err) { ... }
```

The record carries `userId`, `workspaceId: workspaceId || null`, and a server timestamp (feedbackService.ts:193-195).


**Backend write sites:**
- `recordGenerationFailure` - `functions/src/index.ts:4165` `admin.firestore().collection("generations").add(failureRecord)` - failure record includes `uid` (NOT `userId`/`workspaceId`) - see leakage note below.
- `populateSourceColdAdBrandColors` fallback - `functions/src/index.ts:4118` (read-only).
- `index.ts:5058` - another `collection("generations").add(...)` (read below for the field set used).

**Backend read sites:**
- `metaSync/shared.ts:1765` - `db.collection("generations").where("__name__", "in", chunk)` - chunks of up to 30 ids from `matchedGenIds` collected in the per-ad loop. Falls back to per-id reads at `:1774`. The IDs come from the WORKER's matched generationIds for THIS sync - the worker has already matched them through the workspace fingerprint index, so every doc id resolves to a generation that belongs to the syncing workspace.
- `metaSync/shared.ts:1396` `batchLoadGenerations` - same as above; chunked by-id.
- `backfillImageFingerprints.ts:83` - `collection("generations").where("workspaceId", "==", workspaceId).where("userId", "==", uid).orderBy("timestamp", "desc")`. Explicit `workspaceId` filter at line 84.
- `generationDeleteCascade.ts:30` - Firestore trigger `document: "generations/{generationId}"`. Reads the deleted doc's `userId` + `workspaceId` fields (lines 44-45) to scope the cascade to `users/{uid}/workspaces/{wid}/adAccounts/...`.
- `getTopWinners.ts:202` - `db.collection("generations").doc(generationId)` - single-doc hydration, scoped by upstream query.
- `whatsWorkingDashboard.ts:733` - `db.collection("generations").where("__name__", "in", chunk)` - chunked by-id hydration of matched generations for the active workspace. The ids are derived from `matchedGenIds` in the workspace-scoped ad performance snapshot, so the in-filter is bounded to that workspace.
- `index.ts:7623` (`getWorkspaceGenerations` callable) - both filters applied:

```ts
// functions/src/index.ts:7622-7632
const buildQuery = (wsFilter: string | null) => {
    let q: admin.firestore.Query = admin.firestore().collection("generations")
        .where("userId", "==", ownerUid)
        .where("workspaceId", "==", wsFilter)
        .orderBy("timestamp", "desc")
        .orderBy(admin.firestore.FieldPath.documentId(), "desc");
    ...
};
```

Then a `legacy` merge from `workspaceId == null` is performed for the default workspace (lines 7642-7657).

- `index.ts:4118` (`populateSourceColdAdBrandColors`) - `where("userId", "==", uid).where("input.campaignType", "==", "cold").orderBy("timestamp", "desc").limit(1)` - only narrows by user, but the calling `serverGenerateFinalAd` is owner-scoped, so this is a single-owner read.
- `patternSummaries.ts:320,328,338,345` - read EVERY generation in the entire project (no `userId` filter on the `readAllGenerations` / `readRecentGenerations` / `readNicheGenerations` paths). `readUserGenerations(uid)` filters by `userId` at line 338. The `readAllGenerations` path is Cloud-Functions-only (Admin SDK bypasses rules) - but the matched indices show `collectionGroup("generations")` so this is a tenant-wide scan. Used by the scheduled `patternSummariesIncremental` and `patternSummariesReconcile` jobs, which run via `onSchedule` / `onCall` (`index.ts:4402,4420`). These produce aggregated `pattern_summaries` docs, not user data leaks, but they do read every user's generations. Acceptable for the Admin SDK; would NOT be acceptable from a client.
- `feedbackService.ts:308, 332, 354, 602` (frontend) - every read filters `where("userId", "==", userId)` and (in `getFavoriteIds`) optionally narrows to `where("workspaceId", "==", workspaceId)`.


**Firestore rules (firestore.rules:240-245):**

```text
match /generations/{genId} {
    allow read: if request.auth != null && resource.data.userId == request.auth.uid;
    allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    allow update: if request.auth != null && resource.data.userId == request.auth.uid;
}
```

The rule does NOT check `workspaceId`. Cross-workspace reads on the same `userId` are allowed (which is intentional - a user may have multiple workspaces). Cross-user reads/writes are forbidden by the `userId == request.auth.uid` check.

**Leakage assessment:**
- Cross-user: blocked by rule + by every backend read's `userId` filter.
- Cross-workspace for the same user: technically the rule allows it. In practice every backend callable uses the resolved `ownerUid` (the team-member guard means a team member's writes/reads always use the owner's namespace, see `workspaces/workspacePolicy.ts`). The `getWorkspaceGenerations` callable at `index.ts:7623` merges the per-workspace view with a `workspaceId == null` legacy view ONLY for the default workspace - not arbitrary workspaces.
- `recordGenerationFailure` (`index.ts:4165`) writes a failure record with field name `uid` (not `userId`) and no `workspaceId`. This will fail the `userId == request.auth.uid` rule check on read. **Likely a bug** - the field should be `userId` for the rule to admit the doc, and it should include `workspaceId` for downstream filtering.

---

### 2. `creativeIdentity` (field, not a collection)

`creativeIdentity` is an embedded field on the top-level `generations/{genId}` document, not a separate collection. It is set by `feedbackService.saveGeneration` (`src/services/feedbackService.ts:244,679`):

```ts
...(creativeIdentity ? { creativeIdentity } : {}),
```

It is also patched at `feedbackService.ts:257` with `creativeIdentity.generationId` back-fill after the doc is created.

**No write site in `functions/src/`** writes the field directly. The only function-side readers that look at `gen.creativeIdentity` are in `metaSync/shared.ts:1409` and `whatsWorkingDashboard.ts:707`:

```ts
// metaSync/shared.ts:1408-1410
const input = (gen.input || {}) as Record<string, unknown>;
const ci = (gen.creativeIdentity || {}) as Record<string, unknown>;
```

Both reads happen inside the same workspace-scoped ad performance match flow, and the generation ids are sourced from the same workspace's matched generations. The field is used to look up `contractTemplateId`, `selectedModes`, etc. - purely a per-record projection.

| Field | Value |
| --- | --- |
| Write path | `generations/{autoGenId}` (top-level) - sets `creativeIdentity` field |
| Read path | `generations/{genId}` (workspace-scoped via the parent doc's userId+workspaceId) |
| Includes `workspaceId`? | Inherited from parent doc |
| Includes `uid`? | Inherited from parent doc |
| Cross-workspace leakage possible? | **No** - `creativeIdentity` inherits the same scope as `generations/{genId}`. |

**No firestore rule entry needed** - `creativeIdentity` is not its own match block.


---

### 3. Fingerprint Index - `loadWorkspaceFingerprints`

**Function definition:** `functions/src/metaSync/shared.ts:470-488`

```ts
// functions/src/metaSync/shared.ts:470-488
export async function loadWorkspaceFingerprints(uid: string, workspaceId: string): Promise<Map<string, ImageFingerprintDoc>> {
    const out = new Map<string, ImageFingerprintDoc>();
    const snap = await getDb()
        .collection("users").doc(uid)
        .collection("workspaces").doc(workspaceId)
        .collection("imageFingerprints")
        .get();
    for (const doc of snap.docs) {
        const data = doc.data() as Partial<ImageFingerprintDoc>;
        if (typeof data.hash === "string" && typeof data.generationId === "string") {
            out.set(data.hash, {
                hash: data.hash,
                generationId: data.generationId,
                createdAt: typeof data.createdAt === "number" ? data.createdAt : 0,
            });
        }
    }
    return out;
}
```

**Full path on read:** `users/{uid}/workspaces/{workspaceId}/imageFingerprints` - collection, scanned for all doc ids.

**Caller (production):** `metaSync/shared.ts:919-921` (inside `runSyncForAccount`):

```ts
const fingerprintIndex = _fingerprintLoaderOverride
    ? await _fingerprintLoaderOverride(userId, workspaceId)
    : await loadWorkspaceFingerprints(userId, workspaceId);
```

`userId` here is the `scope.ownerUid` (resolved by `resolveMetaScope` in `workspaces/metaCallerScope.ts`) and `workspaceId` is the param passed into the sync from the dispatcher / worker / manual trigger.

**Write site (the index writes):** `functions/src/backfillImageFingerprints.ts:119-147`

```ts
// backfillImageFingerprints.ts:121-124
const indexRef = getDb()
    .collection("users").doc(uid)
    .collection("workspaces").doc(workspaceId)
    .collection("imageFingerprints").doc(hash);
// backfillImageFingerprints.ts:141-147
writes.push(indexRef.set({
    hash,
    hashAlgo: "dhash64",
    generationId: genDoc.id,
    createdAt: createdAtMs,
}, { merge: true }));
```

Same path on write: `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}`.

**Per-ad image write site:** none in production yet. The generation-time writer is the future FR-013 path (per `backfillImageFingerprints.ts:1-17` file header). Today the only production writer of `imageFingerprints/{hash}` is `backfillImageFingerprints` (admin callable, owner-scoped) and the upcoming per-generation writer will live in the render pipeline. Until that path ships, `imageFingerprints` is backfill-only.

**Firestore rule:** `firestore.rules:158-160`:

```text
match /imageFingerprints/{hash} {
    allow read, write: if isWorkspaceMember(userId, workspaceId);
}
```

`isWorkspaceMember` requires the workspace doc to exist and not be soft-deleted (rules:184-192). Owner and verified team members can both read/write.

**Cross-workspace leakage assessment:** **None.** The function takes `(uid, workspaceId)` and constructs the path directly; there is no `where("workspaceId", "==", ...)` filter because the path IS the workspace id.

| Field | Value |
| --- | --- |
| Write path | `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` |
| Read path | `users/{uid}/workspaces/{workspaceId}/imageFingerprints` (collection) |
| Includes `workspaceId`? | Yes (in path) |
| Includes `uid`? | Yes (in path) |
| Cross-workspace leakage possible? | **No** |


---

### 4. `savedProjects` - `users/{uid}/projects/{projectId}` (user-level, not workspace-scoped at path)

| Field | Value |
| --- | --- |
| Write path | `users/{ownerUid}/projects/{project.id}` - single doc |
| Read path | `users/{ownerUid}/projects` (collection, filtered by `workspaceId` field or `in` over `allowedWorkspaceIds`) |
| Includes `workspaceId`? | Field only (not in path) |
| Includes `uid`? | Yes (in path - `ownerUid`) |
| Cross-workspace leakage possible? | Within an owner. Projects are intentionally an owner-level quota pool, with workspace filter applied at query time. Cross-owner leakage blocked by rule + resolveCallerScope. |

**Write site:** `functions/src/index.ts:7847,7984,7980` (inside `saveProject`):

```ts
// functions/src/index.ts:7847
const projectRef = admin.firestore().doc(`users/${ownerUid}/projects/${project.id}`);
...
// functions/src/index.ts:7984
txn.set(projectRef, persistedProject, { merge: true });
// functions/src/index.ts:7980 (quota eviction)
txn.delete(admin.firestore().doc(`users/${ownerUid}/projects/${quota.evictId}`));
```

`ownerUid` is the resolved owner (not the caller's uid) - see `index.ts:7788-7828` (Issue-D fix). The header comment captures the asymmetry this closes:

```
// 1. The project was written to `users/{callerUid}/projects` while
//    `getUserProjects` reads `users/{ownerUid}/projects` - so a member
//    could save a project and never see it again. Same asymmetry for the
//    quota count, the over-cap eviction, and `workspacePurge`.
```

`resolveCallerScope(callerUid)` resolves the team member's call to the owner's namespace, then the project lives under the owner. Plan resolution also reads the OWNER's user doc (`index.ts:7848-7870`) so a team member reads from the owner's plan quota pool.

**Read site:** `functions/src/savedProjects/getUserProjects.ts:50-82`:

```ts
// savedProjects/getUserProjects.ts:50-53
let q: admin.firestore.Query = admin.firestore().collection(`users/${ownerUid}/projects`)
    .orderBy("timestamp", "desc")
    .orderBy("id", "desc")
    .limit(effectivePageSize + 1);

if (workspaceId) {
    q = q.where("workspaceId", "==", workspaceId);
} else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0) {
    const wsSlice = allowedWorkspaceIds.slice(0, 30);
    q = q.where("workspaceId", "in", wsSlice);
}
```

`ownerUid` is again the resolved owner. For an owner calling their own projects the slice is "ALL". For a team member the slice is the member's `allowedWorkspaceIds` (length-bounded to 30 to satisfy Firestore's `in` cap).

**Quota site:** `functions/src/savedProjects/projectQuota.ts:52-53`:

```ts
const projectsRef = firestore().collection(`users/${uid}/projects`);
const snap = await txn.get(projectsRef);
```

Counts projects across the OWNER (caller passes `ownerUid` from the saveProject transaction). The `users/${uid}/projects` rule allows the owner + team members of the owner to read; the quota runs inside `saveProject`'s transaction, so the caller has been authenticated as the owner (or as a team member writing under the owner per the resolveCallerScope resolution).

**Storage-side write site:** `functions/src/savedProjects/thumbnailDelete.ts:10`:

```ts
const filePath = `users/${uid}/projects/${projectId}/thumbnail.${ext}`;
```

Storage path, not Firestore - same scoping.


**Firestore rule:** `firestore.rules:52-59`:

```text
match /projects/{projectId} {
    allow read, write: if request.auth != null && request.auth.uid == userId;
    allow read, write: if request.auth != null
                      && exists(/databases/$(database)/documents/users/$(request.auth.uid))
                      && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isTeamMember == true
                      && get(/databases/$(database)/documents/users/$(request.auth.uid)).data.teamOwnerUid == userId;
}
```

Owner + verified team members of the owner. A team member belonging to owner A cannot read owner B's projects.

**WorkspacePurge cleanup:** `functions/src/workspaces/workspacePurge.ts:147,208` walks `users/${ownerUid}/projects` to find projects with a `workspaceId` field matching the purged workspace; deletes them. Per-doc `workspaceId` field check, not path-scoped - confirms this is a user-level collection with workspace as a field.

**Leakage assessment:**
- Cross-owner: blocked by rule + resolveCallerScope.
- Cross-workspace within an owner: the saveProject path stores the project with `userId = ownerUid` and a `workspaceId` field, so multiple workspaces' projects coexist in the same collection. This is intentional design (one quota pool per account). The owner-list endpoint filters by `workspaceId == wid` so a viewer sees only their active workspace's projects. No rule enforces that filter - but the server-side query in `getUserProjects` does.
- Cross-user: blocked by rule.

---

### 5. `adPerformance` - TWO locations

#### 5a. Workspace-scoped (production, Phase 14+) - `users/{uid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}`

This is the path the 969 worker reads and writes.

**Write sites:**

| Caller | File:line | Operation |
| --- | --- | --- |
| Worker per-ad write | `metaSync/shared.ts:1363` | `adAccountRef.collection("adPerformance").doc(ad.id)` - `adAccountRef` built at `:1038-1041` as `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}` |
| Manual link callable | `linkUnmatchedAd.ts:121-125` | `users/{ownerUid}/workspaces/{req.workspaceId}/adAccounts/{req.accountId}/adPerformance/{req.adId}` |
| Worker bounded read | `metaSync/shared.ts:1076` | `adAccountRef.collection("adPerformance").doc(ad.id)` - read by-id, written into `existingByAdId` map |
| Delete cascade | `generationDeleteCascade.ts:71` | `accountDoc.ref.collection("adPerformance").where("generationId", "==", generationId)` - scoped to one workspace's accounts |

**Read sites:**
- `metaSync/shared.ts:474-476` (`getWhatsWorkingDashboardImpl`) - `db.collection("${adAccountPath}/adPerformance").get()`.
- `metaSync/shared.ts:1075-1085` - bounded read by-id, scoped to one ad account. See `boundedLedgerRead.ts` for the chunking.
- `getTopWinners.ts:154-162` - `users/${userId}/workspaces/${workspaceId}/adAccounts/${accountId}/adPerformance`.
- `whatsWorkingDashboard.ts:474` - same pattern, with a fail-open `catch(() => null)`.
- `ragContext.ts:474-479` - same pattern.
- `linkUnmatchedAd.ts:127` - single-doc read of one ad by id.

**Firestore rule:** `firestore.rules:136-139`:

```text
match /adPerformance/{adId} {
    allow read: if isWorkspaceMember(userId, workspaceId);
    allow write: if false; // Cloud Functions only
}
```

Server-only writes (Cloud Functions Admin SDK bypasses rules).

**Cross-workspace leakage assessment:** **None.** Every read and write constructs the path with `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}` explicitly.


#### 5b. Top-level legacy - `adPerformance/{uid}_{adId}` (still active in two scheduled callables)

| Field | Value |
| --- | --- |
| Write path | `adPerformance/{uid}_{adId}` (top-level) |
| Read path | `adPerformance` (top-level, filtered by `userId`) |
| Includes `workspaceId`? | Doc field only (`workspaceId` is stamped from `creativeDeployments`) |
| Includes `uid`? | Yes (in path via `${uid}_${adId}` AND in `userId` field) |
| Cross-workspace leakage possible? | Within an owner. Doc carries `workspaceId` field but path keys on user+ad, so any reader who can list by `userId` sees every workspace's rows in one collection |
| Cross-user leakage possible? | **No** - rule checks `resource.data.userId == request.auth.uid` AND the doc id is `${uid}_${adId}` so cross-user writes aren't possible from client SDKs (Admin SDK bypasses) |

**Write site:** `functions/src/index.ts:6324-6338` (`metaLegacySync` scheduled job, runs at 4 AM UTC - 1 hour AFTER the new workspace-scoped dispatcher):

```ts
// index.ts:6324-6338
const batch = admin.firestore().batch();
for (const ad of (data.data || [])) {
    const roas = (ad.purchase_roas || []).length > 0 ? parseFloat(ad.purchase_roas[0].value) : null;
    const adWsId = deployWsMap.get(ad.ad_id) ?? deployWsMap.get(`name:${ad.ad_name}`) ?? null;
    batch.set(admin.firestore().collection("adPerformance").doc(`${uid}_${ad.ad_id}`), {
        userId: uid, adAccountId: accountId, workspaceId: adWsId, adId: ad.ad_id, adName: ad.ad_name || "",
        impressions: parseInt(ad.impressions || "0"),
        clicks: parseInt(ad.clicks || "0"),
        spend: parseFloat(ad.spend || "0"),
        ctr: parseFloat(ad.ctr || "0"),
        roas,
        syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
}
```

**Read site:** `functions/src/index.ts:6544-6548` (`metaDataDeletion`):

```ts
// index.ts:6544-6548
const perfDocs = await admin.firestore().collection("adPerformance")
    .where("userId", "==", doc.id).get();
const batch = admin.firestore().batch();
perfDocs.docs.forEach(d => batch.delete(d.ref));
if (perfDocs.size > 0) await batch.commit();
```

**Read site (frontend, legacy):** `src/services/feedbackService.ts:498-552`:

```ts
// src/services/feedbackService.ts:498-503
const perfQuery = query(
    collection(db, "adPerformance"),
    where("userId", "==", userId),
    orderBy("syncedAt", "desc"),
    limit(20)
);
const perfSnap = await getDocs(perfQuery);
```

**Read site (legacy deletion):** `functions/src/index.ts:3734-3737`:

```ts
const perfDocs = await admin.firestore()
  .collection("adPerformance")
  .where("userId", "==", scope.ownerUid)
  .get();
```

**Firestore rule:** `firestore.rules:247-250`:

```text
match /adPerformance/{perfId} {
    allow read: if request.auth != null && resource.data.userId == request.auth.uid;
}
```

Writes blocked (Cloud Functions only).

**Active or dead?** Active. `metaLegacySync` (`index.ts:6251`) is still a deployed scheduled function. The comment in the file header (`:6242-6250`) says "REMOVE after Batch 04 ships" - Batch 04 shipped the workspace-scoped dispatcher, but `metaLegacySync` was retained for backwards compatibility with `PerformanceDashboard` / `creativeMemory.updateMemoryPerformance` / `principleVault`.


**Cross-workspace leakage assessment:**
- Within an owner: any owner-side code that lists top-level `adPerformance` by `userId` sees their own ad records across every workspace, not scoped by `workspaceId`. The `feedbackService` read at line 498 builds a "REAL AD PERFORMANCE DATA" string from these records but does NOT filter by `workspaceId`. **A user with multiple workspaces gets cross-workspace performance aggregated into their RAG context.** This is the documented "legacy" behaviour. New code should prefer the workspace-scoped path.
- Cross-user: blocked by rule + by `userId` filter on every read.

---

### 6. `learningAggregates` - `users/{uid}/workspaces/{wid}/adAccounts/{aid}/hookPerformance/{angleKey}` and `visualPerformance/{patternKey}`

| Field | Value |
| --- | --- |
| Write path | `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/hookPerformance/{angleKey}` and `visualPerformance/{patternKey}` |
| Read path | same (collection-level reads inside the workspace) |
| Includes `workspaceId`? | Yes (in path) |
| Includes `uid`? | Yes (in path) |
| Cross-workspace leakage possible? | **No** |

**Write site:** `functions/src/learning/applyLearningWrites.ts:439-453`:

```ts
// applyLearningWrites.ts:439-453
for (const [angleKey, agg] of newHook) {
    aggregateWrites.push({
        ref: params.adAccountRef.collection("hookPerformance").doc(angleKey),
        data: agg as unknown as Record<string, unknown>,
    });
    hookWrites++;
}
for (const [patternKey, agg] of newVisual) {
    if (!patternKey) continue;
    aggregateWrites.push({
        ref: params.adAccountRef.collection("visualPerformance").doc(patternKey),
        data: agg as unknown as Record<string, unknown>,
    });
    visualWrites++;
}
```

`params.adAccountRef` is built by the worker in `metaSync/shared.ts:1038-1041`:

```ts
const adAccountRef = getDb()
    .collection("users").doc(userId)
    .collection("workspaces").doc(workspaceId)
    .collection("adAccounts").doc(accountId);
```

**Read sites:**
- `applyLearningWrites.ts:339-344` (within the same call - `existingHookDocs`, `existingVisualDocs`).
- `whatsWorkingDashboard.ts:475-476` (for the dashboard summary).
- `ragContext.ts:476-477` (for the RAG context builder).

**Firestore rule:** `firestore.rules:144-151`:

```text
match /hookPerformance/{angleKey} {
    allow read: if isWorkspaceMember(userId, workspaceId);
    allow write: if false; // Cloud Functions only
}
match /visualPerformance/{patternKey} {
    allow read: if isWorkspaceMember(userId, workspaceId);
    allow write: if false; // Cloud Functions only
}
```

**Daily conversion / funnel stats:** the only daily conversion / funnel aggregates are the per-row `byObjective.conversion.{count,avgLinkCtr,bestVerdictCount,worstVerdictCount}` and the per-row `byFunnelType.{paid_event,paid_product,...}` on each `hookPerformance` / `visualPerformance` doc. They live in the SAME docs as above. See `learningAggregates.ts:154-187` (HookPerformanceAggregate) and `:220-246` (VisualPerformanceAggregate).

**Cross-workspace leakage assessment:** **None.** All aggregates live under the workspace-scoped path.

---

### 7. Anything else written by a generation call

The generation callables (`serverGenerateTOV`, `serverGenerateConcepts`, `serverGenerateBuildPlan`, `serverGenerateFinalAd`, etc., all in `index.ts`) are read-mostly with respect to Firestore. They:
1. Read `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}/settings/current` for funnel settings (`funnelSettings.ts:799-826,975-985,1049-1059`).
2. Read `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}/hookPerformance` and `visualPerformance` for RAG context (`ragContext.ts:471-497`).
3. Read the top-level `generations` collection for recent liked outputs (`generators.ts:1043-1050,2313-2347`).
4. Write the top-level `generations` collection indirectly through `feedbackService.saveGeneration` from the client.


The "conceptDirector", "slidePlanEngine", and "rankingEngine" subcomponents (`conceptDirector.ts`, `slidePlanEngine.ts`, `rankingEngine.ts`) write:

| Component | File:line | Collection | Path |
| --- | --- | --- | --- |
| `conceptDirector` | `conceptDirector.ts` and `conceptDirectorConfig.ts:120` | `users/{uid}` | single-doc read (config only) |
| `slidePlanEngine` | `slidePlanEngine.ts` | (none - pure) | n/a |
| `rankingEngine` (write) | `rankingEngine.ts:503` | `ranking_decisions/{requestId}` (top-level) | doc carries `userId` field, no `workspaceId` |
| `variantEngine` (write) | `variantEngine.ts:356` | `variantSets/{setId}` (top-level) | doc carries `userId` field, no `workspaceId` |
| `recommendationTracking` (write) | `recommendationTracking.ts:239` | `recommendation_events/{eventId}` (top-level) | doc carries `userId` field, no `workspaceId` |
| `principleVault` (write) | `principleVault.ts:245,388` | `principleVaults/{userId}/principles/{principleId}` (user-level) | follows the firestore.rules:195-198 match block |
| `patternSummaries` (write) | `patternSummaries.ts:524,534,542,544` | `pattern_summaries/{summaryId}` (top-level, idempotent rollup) and `job_state/{docId}` (top-level, admin only) | scope lives on the doc (`scope` field) |
| `creativeMemory` (write) | `creativeMemory.ts:162` | `creativeMemory/{creativeId}` (top-level) | doc carries `userId` + `workspaceId` fields |
| `creativePatterns` (write) | `creativeMemory.ts:282,309,334` | `creativePatterns/{userId}/indexes/{indexKey}` (user-level) | doc carries `userId`; optional `workspaceId` filter on reads |
| `creativeMemoryFingerprints` (write) | `creativeMemory.ts:471-474` | `creativeMemoryFingerprints/{userId}/entries/{auto}` (user-level) | explicitly scoped by `userId` in path |
| `pushedCreatives` (write) | `index.ts:4013,6124,6186` | `pushedCreatives/{pushId}` (top-level) | doc carries `userId` field; rule at firestore.rules:253-256 |
| `creativeDeployments` (write) | `index.ts:4013,6124,6186` | `creativeDeployments/{deploymentId}` (top-level) | doc carries `userId` field |
| `adPerformanceHistory` (write) | `metaSync/orchestrator.ts:408` | `adPerformanceHistory/{snapshotId}` (top-level) | legacy; doc carries `userId` field |

`conceptDirector.ts` and `slidePlanEngine.ts` are both pure prompt / state builders. They do not touch Firestore directly. The call sites that invoke them (`generators.ts`) write through `feedbackService.saveGeneration` (top-level `generations`) and through `creativeMemory.recordCreativeMemory` (top-level `creativeMemory`).

**`rankingEngine.ts` ranking decision (`ranking_decisions/{requestId}`):**

```ts
// rankingEngine.ts:498-509
try {
    const expiresAt = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
    const sanitized = JSON.parse(JSON.stringify(result));
    await getDb().collection("ranking_decisions").doc(requestId).set({
        ...sanitized,
        expiresAt,
        _storedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
} catch (e) { ... }
```

Path: `ranking_decisions/{requestId}` - top-level, no Firestore rule defined. Doc carries `userId` (line 491). No `workspaceId` field is set. Cloud Functions Admin SDK bypasses rules so this is acceptable as server-only storage. **Round-15 fix (coderabbit minor)**: the previous wording said "every ranking decision is readable by any client who knows the `requestId`" — that is incorrect. The catch-all at `firestore.rules:275-277` (`match /{document=**} { allow read, write: if false; }`) denies ALL client reads to unmatched top-level collections, including this one. There is no client read path; the collection is server-only by virtue of the deny-all catch-all. Low risk; not worth tracking once the wording is right.

**`variantEngine.ts` variant set (`variantSets/{setId}`):**

```ts
// variantEngine.ts:356-361
await getDb().collection("variantSets").doc(variantSet.setId).set({
    ...variantSet,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
console.log(`Variant set stored: ${variantSet.setId} (${variantSet.variants.length} variants)`);
```

Same shape: top-level, doc carries `userId` (from `VariantSet`), no `workspaceId`, no rule. Server-only.

**`recommendation_events`:** top-level, `userId` field, no `workspaceId` field. Firestore rule (assumed absent - none of the rules in `firestore.rules:1-278` mention `recommendation_events`). Falls through to the catch-all `match /{document=**} { allow read, write: if false; }` at `:275-277`, which makes it server-only-write by default. Read paths filter by `userId`.


**Cross-workspace leakage assessment for the rest:**
- `ranking_decisions`, `variantSets`, `recommendation_events`, `adPerformanceHistory`, `creativeDeployments`, `pushedCreatives`: all top-level, all scope-by-`userId`-field (NOT `workspaceId`). These are aggregations or audit trails that intentionally roll up across a user's workspaces. None is read by the 969 worker.
- `creativeMemory` and `creativePatterns/{userId}/indexes`: top-level / user-level. `creativeMemory` is read by RAG (`retrieveCreativePatterns`); it does carry `workspaceId` as a field and the read at `creativeMemory.ts:184` adds `where("workspaceId", "==", workspaceId)` when one is passed. A workspaceId-less read returns cross-workspace results for that user (caller-side mitigation).
- `creativeMemoryFingerprints/{userId}/entries`: explicit `userId` in path. No workspace dimension.
- `principleVaults/{userId}/principles/{principleId}`: user-level, per the rule at `firestore.rules:195-198`.

---

## Firestore Rules - section-by-section findings

(All references to `firestore.rules:LINE` are file-line ranges in the 279-line rules file.)

| Collection / path | Rule | Read scope | Write scope | Notes |
| --- | --- | --- | --- | --- |
| `users/{userId}` (top doc) | `:5-41` | UID or verified team member | Owner only with `credits/plan/isTeamMember/teamOwnerUid` freeze | Round-16/17 freezes for self-elevation attack |
| `users/{userId}/avatars/{avatarId}` | `:44-50` | Owner or team | Owner or team | |
| `users/{userId}/projects/{projectId}` | `:52-59` | Owner or team | Owner or team | Path is user-level, not workspace-scoped. Filter is `workspaceId` field at query time (server) |
| `users/{userId}/workspaces/{workspaceId}` | `:86-93` | Owner or team (with `deletedAt==null` for team) | Owner only | The `workspaces` doc is the workspace root |
| `users/{userId}/workspace_access_audit/{entryId}` | `:96-99` | Owner | Server-only | Immutable |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}` | `:113-117` | `isWorkspaceMember` | `isWorkspaceMember` | The per-account root |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/settings/current` | `:129-131` | `isWorkspaceMember` | `isWorkspaceMember` | Single-doc contract; sibling doc names would be a leak |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/syncSnapshots/{snapshotId}` | `:132-135` | `isWorkspaceMember` | Server-only | |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/adPerformance/{adId}` | `:136-139` | `isWorkspaceMember` | Server-only | 969 worker writes here |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/baselines/{docId}` | `:140-143` | `isWorkspaceMember` | Server-only | Worker writes at `:1477` |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/hookPerformance/{angleKey}` | `:144-147` | `isWorkspaceMember` | Server-only | 969 worker writes here |
| `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/visualPerformance/{patternKey}` | `:148-151` | `isWorkspaceMember` | Server-only | 969 worker writes here |
| `users/{userId}/workspaces/{workspaceId}/imageFingerprints/{hash}` | `:158-160` | `isWorkspaceMember` | `isWorkspaceMember` | |
| `users/{userId}/workspaces/{workspaceId}/private/{document=**}` | `:165-167` | Deny all | Deny all | Server-only via Admin SDK |
| `users/{userId}/team/{memberId}` | `:172-175` | Owner | Server-only | |
| `principleVaults/{userId}/principles/{principleId}` | `:195-198` | UID | Server-only | |
| `teamMemberships/{email}` | `:202-206` | Email match | Server-only | |
| `pending_plans/{email}` | `:210-214` | Email match | Server-only create / update; client delete | |
| `stripe_events/{eventId}` | `:217-220` | Deny all | Deny all | Server-only |
| `cancellation_logs/{logId}` | `:224-230` | UID match | UID create only; update/delete deny | |
| `refund_logs/{logId}` | `:234-238` | UID match | Deny all | Server-only |
| `generations/{genId}` (top-level) | `:241-245` | UID match (top-level doc carries `userId` field) | UID create / update | No workspaceId check - see notes above |
| `adPerformance/{perfId}` (top-level legacy) | `:248-250` | UID match (top-level doc carries `userId` field) | Deny all | Legacy path; rule still admits legacy client reads (filtered by `userId`) |
| `pushedCreatives/{pushId}` (top-level) | `:253-256` | UID match | UID create | |
| `creativeDeployments/{depId}` (top-level) | `:259-262` | UID match | Deny all | |
| `adPerformanceHistory/{snapId}` (top-level) | `:265-268` | UID match | Deny all | |
| `userPreferences/{userId}` | `:271-273` | UID match | UID match | |
| Catch-all `{document=**}` | `:275-277` | Deny all | Deny all | Server-only by default |


`isWorkspaceMember` definition at `:184-192` requires the workspace doc to exist and `deletedAt == null`, and matches UID-or-team-membership.

**Catch-all denies everything else as Server-Admin-only.** This means any top-level collection not listed above (e.g. `ranking_decisions`, `variantSets`, `recommendation_events`, `creativeMemory`, `creativePatterns`, `creativeMemoryFingerprints`, `pattern_summaries`, `job_state`, `metaConnections`, `analyzedUrls`, `metaAdAccountId`) is read/write-denied to clients. Cloud Functions Admin SDK bypasses rules and may freely read/write them. That's by design.

---

## Complete enumeration of every Firestore collection reference in `functions/src/`

The unique collection-name strings extracted from `\.collection\(` matches across `functions/src/**/*.ts`:

```
adAccounts
adPerformance
adPerformanceHistory
baselines
cancellation_logs
creativeDeployments
creativeMemory
creativeMemoryFingerprints
creativePatterns
current      (literal "current" - the settings subdoc)
entries      (creativeMemoryFingerprints entries subcollection)
generations
hookPerformance
imageFingerprints
job_state
metaConnections
pattern_summaries
pending_plans
pendingSignals   (principleVaults pendingSignals subcollection)
principleVaults
private          (users/{uid}/workspaces/{wid}/private/{document=**})
ranking_decisions
recommendation_events
refund_logs
settings         (adAccounts/settings/current literal)
stripe_events
syncSnapshots
team_invites
teamMemberships
users
variantSets
visualPerformance
workspaces
workspace_access_audit
```

Below is the file:line of every occurrence (deduplicated by collection + first letter, with key second-pass call sites). This list is exhaustive across the production code; `__tests__` and `__fixtures__` collections have been omitted for brevity (those are mock firestores with no real impact).

### `users`

| File:line | Operation |
| --- | --- |
| `index.ts:221,452,506,688,816,911,1010,1140,1193,1225,1282,1373,1398,1503,1543,1590,1600,1649,1674,1717,1743,1803,1810,1844,1887,1901,1984,1988,2042,2071,2108,2134,2271,2333,2385,2413,2551,2605,2631,2865,2875,2888,2900,2987,3005,3083,3090,3099,3118,3163,3175` | scattered - billing, webhook, team invite, OAuth, profile |
| `billing/stripeWebhook.ts:223,346,374,401,429,476,518,573,610,629,711,736,796,815,875,914,926` | Stripe webhook user-claim / plan-resolution |
| `billing/billingState.ts:160` | user ref |
| `billing/ghlBillingSync.ts:56` | user lookup by email / uid |
| `conceptDirectorConfig.ts:120` | user doc read (config) |
| `entitlements.ts:337,346,540` | caller + owner lookup |
| `funnelSettings.ts:233,823,982,1056` | owner / settings ref |
| `metaSync/shared.ts:473,557,800,1039` | owner / workspaces / adAccounts |
| `metaSync/orchestrator.ts:285,404,408,471,481,526` | metaConnections, adPerformance, adPerformanceHistory, workspaces |
| `metaSync/dispatcher.ts:94` | workspaces ref |
| `metaConnection.ts:46,57` | workspace doc, metaConnections ref |
| `getTopWinners.ts:154` | full adAccount path |
| `linkUnmatchedAd.ts:122` | workspace path |
| `generationDeleteCascade.ts:63` | workspace path |
| `backfillImageFingerprints.ts:122,183` | workspaces list |
| `whatsWorkingDashboard.ts:389,738,949` | workspace + adAccount paths |
| `creativeMemory.ts:282,334,472,493` | creativePatterns + creativeMemoryFingerprints |
| `ragContext.ts:436,447,474` | workspace + adAccount paths |
| `principleVault.ts:245,388` | principleVaults/{userId}/principles |
| `index.ts:6606,6618` | analyzedUrls subcollection |
| `index.ts:3484,3636,7077,7207,7280,7477,7486,7533` | workspaces list |
| `index.ts:2551,2631,2865,2875,3005,3083,3090,3163` | team subcollection |
| `index.ts:5869,5875,5901,5922,5923` | principleVaults + pendingSignals |


### `pending_plans`

| File:line | Operation |
| --- | --- |
| `index.ts:290,481,722` | billing webhook + Stripe checkout |
| `stripeWebhook.ts:279,476` | pending plan creation |

### `team_invites`

| File:line | Operation |
| --- | --- |
| `index.ts:2555,2645,2670,2748,2787,2821,2860,2951,3019,3035,3118` | team invite CRUD |

### `teamMemberships`

| File:line | Operation |
| --- | --- |
| `index.ts:2636,2816,2860,2888,3094` | membership reverse-lookup |

### `metaConnections`

| File:line | Operation |
| --- | --- |
| `index.ts:3343,3447,3543,3647,3723,3937,6050,6260,6477,6537` | connection lifecycle |
| `metaConnection.ts:57` | user-level connection read |
| `metaSync/orchestrator.ts:285,471` | LEG A orchestrator |

### `private/{document=**}` (workspace-private subtree)

| File:line | Operation |
| --- | --- |
| `metaConnection.ts:48` (privateConnectionRef helper) | writes the `metaConnection` doc |
| `index.ts:7410` | `users/{uid}/workspaces/{wid}/private/metaConnection` mirror |
| `metaSync/shared.ts:445` (whatsWorkingDashboard) | reads `metaConnection` doc |
| `metaSync/orchestrator.ts:481` | mirror on disconnect |

### `creativeDeployments`

| File:line | Operation |
| --- | --- |
| `index.ts:4013,6124,6186` | push creative -> record deployment |
| `index.ts:6312,6347,6400` | LEG A lookup + LEG legacy sync |

### `adPerformance` (top-level legacy)

| File:line | Operation |
| --- | --- |
| `index.ts:3735,6328,6544` | legacy disconnect / sync / deletion |

### `adPerformanceHistory` (top-level)

| File:line | Operation |
| --- | --- |
| `metaSync/orchestrator.ts:408` | LEG A periodic snapshot |
| `patternSummaries.ts:366` | history rollup read |

### `creativeMemory` (top-level)

| File:line | Operation |
| --- | --- |
| `creativeMemory.ts:162,180,215` | write + recent search |

### `creativePatterns/{userId}/indexes` (user-level)

| File:line | Operation |
| --- | --- |
| `creativeMemory.ts:282,309,334` | index write + retrieval |

### `creativeMemoryFingerprints/{userId}/entries` (user-level)

| File:line | Operation |
| --- | --- |
| `creativeMemory.ts:471,473,492,494` | fingerprint write + recent retrieval |

### `principleVaults/{userId}/principles` + `pendingSignals`

| File:line | Operation |
| --- | --- |
| `index.ts:5922,5923` | pendingSignals write |
| `principleVault.ts:245,388` | principles collection |
| `firestore.rules:195-198` | read rule |

### `pattern_summaries` (top-level)

| File:line | Operation |
| --- | --- |
| `patternSummaries.ts:524,534` | batched write + delete |

### `job_state` (top-level)

| File:line | Operation |
| --- | --- |
| `patternSummaries.ts:542,544` | job status write |

### `ranking_decisions`

| File:line | Operation |
| --- | --- |
| `rankingEngine.ts:503` | decision persist |

### `variantSets`

| File:line | Operation |
| --- | --- |
| `variantEngine.ts:356,370` | variant set persist + load |

### `recommendation_events`

| File:line | Operation |
| --- | --- |
| `recommendationTracking.ts:208,239,280` | event track + read |

### `generations` (top-level)

| File:line | Operation |
| --- | --- |
| `backfillImageFingerprints.ts:83` | workspace-filtered scan |
| `getTopWinners.ts:202` | single-doc hydration |
| `metaSync/shared.ts:1765,1774` | `__name__ in [...]` chunked hydration |
| `metaSync/shared.ts:1396` (via batchLoadGenerations) | same |
| `whatsWorkingDashboard.ts:733` | `__name__ in [...]` chunked hydration |
| `index.ts:4118,4165,5058,7623` | populate-source-cold / failure record / generateFinalAd save / getWorkspaceGenerations |
| `patternSummaries.ts:320,328,338,345` | readAll / readRecent / readUser / readNiche |


### `users/{uid}/workspaces/{wid}/adAccounts/{aid}/...` (workspace-scoped subtree)

| Subpath | Read sites | Write sites |
| --- | --- | --- |
| `settings/current` | `metaSync/shared.ts:803` (per-sync) | `funnelSettings.ts:826,985,1059` (save/dismissAdvisory/get) |
| `syncSnapshots/{id}` | `metaSync/shared.ts:1484` (write snapshot) | `metaSync/shared.ts:1484` (commit); pruned at `:555` |
| `adPerformance/{adId}` | `metaSync/shared.ts:1075` (bounded read), `:474` (dashboard), `getTopWinners.ts:157` | `metaSync/shared.ts:1363` (worker), `linkUnmatchedAd.ts:125` (manual), `generationDeleteCascade.ts:71` (cascade) |
| `baselines/current` | `metaSync/shared.ts:1477` (write), `:474` (dashboard), `ragContext.ts:447` (RAG) | `metaSync/shared.ts:1477` |
| `hookPerformance/{angleKey}` | `applyLearningWrites.ts:340,341` (read+write), `metaSync/shared.ts:475`, `ragContext.ts:476` | `applyLearningWrites.ts:441` |
| `visualPerformance/{patternKey}` | same as hook | `applyLearningWrites.ts:449` |
| `imageFingerprints/{hash}` | `metaSync/shared.ts:475` (load) | `backfillImageFingerprints.ts:123,124` (backfill) |
| `private/metaConnection` | `whatsWorkingDashboard.ts:445` | `metaConnection.ts:48` (connect), `index.ts:7410` (unlink mirror) |

### `users/{uid}/...` (other sub-collections)

| Subpath | Read sites | Write sites |
| --- | --- | --- |
| `/team/{memberId}` | `index.ts:2551,2631,3005,3083` | `index.ts:2865,2875,3090,3163` |
| `/workspace_access_audit/{id}` | `index.ts:7683` (read) | (immutable - `allow write: if false`) |
| `/avatars/{avatarId}` | (rules:44-50) | (rules:44-50) |
| `/projects/{id}` | `savedProjects/getUserProjects.ts:50,73`, `projectQuota.ts:52`, `workspaces/workspacePurge.ts:147,208` | `index.ts:7847,7984` |
| `/analyzedUrls/{urlHash}` | `index.ts:6606` (cache) | `index.ts:6606` |
| `/workspaces/{wid}` | scattered (see audit points above) | scattered |
| `/billingState` | scattered | scattered |
| `/creditOwnerUid` | scattered | scattered |

### `cancellation_logs`, `refund_logs`, `stripe_events` (top-level)

| File:line | Operation |
| --- | --- |
| `cancellation_logs` - `stripeWebhook.ts:658,930` | log entries from webhook |
| `refund_logs` - `stripeWebhook.ts:886` | refund log |
| `stripe_events` - `billing/billingState.ts:178,193`; `stripeWebhook.ts:83` | webhook idempotency |

---

## Where the path does NOT include workspaceId - explicit list

This is the precise list of writes that the audit was asked to find. Items are split between legacy / not in the 969 path and owned but not workspace-scoped on purpose.

### Legacy paths (still deployed, NOT used by 969 worker)

| Path | Reason it is not workspace-scoped at the path | Risk | Where used today |
| --- | --- | --- | --- |
| `adPerformance/{uid}_{adId}` (top-level) | Pre-Phase 14 schema; `metaLegacySync` writes here to back the legacy PerformanceDashboard | Within-owner cross-workspace reads possible (e.g. `feedbackService.ts:498` does NOT filter by workspaceId). Cross-user blocked by rule + path. | `index.ts:3735,6328,6544` |
| `adPerformanceHistory/{snapId}` (top-level) | Pre-Phase 14 schema | Within-owner aggregation only; doc carries `userId` + `adAccountId` + `workspaceId` (line 392 of orchestrator). | `metaSync/orchestrator.ts:408` |
| `metaConnections/{ownerUid}` (top-level) | Single OAuth credential per account, intentionally owner-level | Cross-workspace reads intentional (one OAuth credential per account) | `metaConnection.ts:57` and scattered |
| `creativeDeployments/{pushId}` (top-level) | Deployment audit log | Within-owner only; cross-owner blocked | `index.ts:4013,6124,6186` |
| `pushedCreatives/{pushId}` (top-level) | Push audit | Within-owner only | (rules + index only) |

### Intentionally user-level (workspaceId is a doc field, not a path segment)

| Path | Reason | Where used today |
| --- | --- | --- |
| `users/{ownerUid}/projects/{projectId}` | One project quota pool per account; team members consume the owner's allowance (Issue-D fix) | `index.ts:7847,7980`, `savedProjects/getUserProjects.ts:50,73`, `projectQuota.ts:52` |
| `principleVaults/{userId}/principles/{principleId}` | Cross-workspace learning at the user level | `principleVault.ts:245,388` |
| `creativePatterns/{userId}/indexes/{indexKey}` | Per-user pattern indexes | `creativeMemory.ts:282,309,334` |
| `creativeMemoryFingerprints/{userId}/entries/{auto}` | Recent-fingerprint window per user | `creativeMemory.ts:471,473,492,494` |
| `userPreferences/{userId}` | One preferences doc per user | (rules:271-273) |


### Intentionally top-level / admin-only

| Path | Reason | Where used today |
| --- | --- | --- |
| `generations/{autoGenId}` (top-level) | One row per creative; workspaceId is a field. Rules + every backend read filter by `userId` AND `workspaceId` (or rely on the `userId` rule check). | Frontend `feedbackService.saveGeneration` + backend read paths |
| `creativeMemory/{creativeId}` (top-level) | One row per creative; workspaceId is a doc field | `creativeMemory.ts:162,180,215` |
| `ranking_decisions/{requestId}` (top-level) | Idempotent decision audit; doc carries `userId` field, no `workspaceId` field. Server-only write; no read path filters by `workspaceId` (no read paths exist) | `rankingEngine.ts:503` |
| `variantSets/{setId}` (top-level) | Variant-test audit; doc carries `userId` field, no `workspaceId` field. Server-only write | `variantEngine.ts:356,370` |
| `recommendation_events/{eventId}` (top-level) | Recommendation audit; doc carries `userId`, no `workspaceId`. Falls through to catch-all deny rule. | `recommendationTracking.ts:208,239,280` |
| `pattern_summaries/{summaryId}` (top-level) | Aggregated pattern summaries keyed by `summaryId`. Scope is a doc field (`scope: "global" \| "user" \| "niche"`) | `patternSummaries.ts:524,534` |
| `job_state/{docId}` (top-level) | Scheduled-job bookkeeping | `patternSummaries.ts:542,544` |

---

## Cross-workspace leakage verdict

| Code path | Verdict | Reason |
| --- | --- | --- |
| 969 worker (`runSyncForAccount` -> `applyLearningWrites`) | Safe | Every read + write constructs `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/...` explicitly. The owner uid is resolved from `resolveMetaScope`, never the caller's uid. |
| `linkUnmatchedAd` | Safe | Explicit `assertWorkspaceAllowed` + owner path + generation workspace match check. |
| `getTopWinners` | Safe | Caller passes `(uid, workspaceId, accountId)`; path is constructed directly. |
| `whatsWorkingDashboard` | Safe | Asserts workspace is linked to the requested `accountId` before reading. |
| `ragContext` / `getRAGContext` | Safe | Path constructed from caller-supplied `userId`/`workspaceId`/`accountId`. |
| `getWorkspaceGenerations` | Safe | Filters by both `userId` (resolved to ownerUid) and `workspaceId`. |
| `backfillImageFingerprints` | Safe | Iterates the user's workspaces via `users/{uid}/workspaces` then writes `users/{uid}/workspaces/{wid}/imageFingerprints/{hash}`. The generation scan filters by `(workspaceId, userId)`. |
| `generationDeleteCascade` | Safe | Reads the deleted doc's stored `userId` + `workspaceId` to scope the cascade. |
| `loadWorkspaceFingerprints` | Safe | Path is constructed explicitly. |
| `metaLegacySync` (top-level `adPerformance`) | Same-user cross-workspace aggregate | Reads `creativeDeployments` to discover `workspaceId` per ad and stamps it as a field. The data ends up keyed by `${uid}_${adId}`, so a read by `userId == uid` returns every workspace's rows merged. Within owner only. |
| `feedbackService.buildPersonalizationContext` (frontend `adPerformance` read) | Same-user cross-workspace aggregate | `where("userId", "==", userId)` only - no `workspaceId` filter. Builds a "REAL AD PERFORMANCE DATA" block from any-workspace ad performance. Frontend never sees another user's data (rule), but a multi-workspace owner will see aggregated numbers. |
| `feedbackService.getNicheTopOutputs` | Cross-user aggregated pattern | `where("input.niche", "==", niche)` - returns other users' generations. Intentionally aggregates "Top-performing hook angles in this niche" without per-user content. Would NOT be acceptable if it ever surfaced raw text to another user; it returns only `hookAngle` + `contractTemplateId` counts. |
| `recordGenerationFailure` (top-level `generations` write) | Likely bug | Doc field is `uid`, not `userId`, and no `workspaceId`. Will not match the rule predicate `resource.data.userId == request.auth.uid` on subsequent reads. |
| `creativeMemory.recordCreative` (top-level) | Same-user cross-workspace | Doc carries `userId` + `workspaceId` (line 152). Reads at `creativeMemory.ts:184,220` add `where("workspaceId", "==", workspaceId)` only when one is passed. Without it, callers see cross-workspace results. |
| `principleVault.extractPrinciples` / `vaultConsolidate` (called from `metaLegacySync`) | Same-user cross-workspace | User-scoped (`principleVaults/{userId}/principles/...`); aggregates performance across an owner's workspaces. |
| `ranking_decisions`, `variantSets`, `recommendation_events` | Safe (admin-only) | No rule -> catch-all deny. Server-only read/write. |
| `pattern_summaries` (admin-only) | Safe | Aggregated rollups, scope is on the doc. |


---

## Recommended follow-ups (priority order)

1. **Fix `recordGenerationFailure` field name bug.** `functions/src/index.ts:4165` writes a `uid` field - the rule at `firestore.rules:241-245` requires `userId`. The write succeeds via Admin SDK (which bypasses rules) but a subsequent read from the client fails authorization. Add `userId` and `workspaceId` fields so the doc is searchable by the same `userId + workspaceId` composite the 969 worker reads.
2. **Re-confirm `feedbackService.buildPersonalizationContext`'s `adPerformance` read at `src/services/feedbackService.ts:498-503` should be workspace-scoped.** Today it pulls from the legacy top-level `adPerformance` collection by `userId` only - cross-workspace aggregation for multi-workspace owners.
3. **Confirm `metaLegacySync` (`index.ts:6251`) retirement timeline.** Now that Batch 04's workspace-scoped dispatcher and dashboard are live, this is the last producer of top-level `adPerformance` documents. Until it's removed, the legacy top-level collection will keep growing.
4. **Consider adding a Firestore rule for `ranking_decisions` and `variantSets`.** Currently they fall through to the catch-all deny rule, which works because no client reads them. Adding explicit `allow read: if resource.data.userId == request.auth.uid` would future-proof them against accidental client access.
5. **Audit `creativeMemory.recordCreative` call sites for workspaceId propagation.** The schema supports it (line 152) but the `metaLegacySync` call at `index.ts:6365` only passes `adWs` from `creativeDeployments` - verify every caller passes a `workspaceId`.

---

## Appendix - quick link index

- `functions/src/firestoreClient.ts` - single canonical `getDb()` helper used everywhere.
- `firestore.rules` - 279 lines, surveyed in full above.
- `firestore.indexes.json` - `generations` and `adPerformance` indexes at the top level (collectionGroup), `workspaces` and `projects` also at top level.
- `specs/969-cumulative-learning/contracts/` and `data-model.md` - should be cross-checked against this audit; any divergence is a finding.
