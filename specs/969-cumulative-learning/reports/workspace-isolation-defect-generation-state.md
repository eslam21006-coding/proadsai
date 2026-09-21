# Workspace Isolation Defect — Generation State

**Branch:** `969-phase-4`
**Date:** 2026-09-19
**Pause:** Phase 4 Batch 3 paused pending owner review of this report.
**Subject:** A team member's in-progress work surfaced in the workspace owner's session. Find the storage path, the read path, the rules, and the data.

---

## §0. The defect, in one paragraph

The app's in-progress generation state lives in two places that share the same path:

- **Live memory** (`src/store.ts` — unused — `src/App.tsx` `useState`) — single-user, single-session, not the leak.
- **Persisted** (`users/{uid}/projects/{id}` — Firestore sub-collection + IndexedDB `ProAdsDB_V2/projects` keyed by `userId`).

Both persisted layers are scoped **by `uid`, never by `workspaceId`**. A team member's `saveProject` callable resolves through `resolveCallerScope` and writes the doc under **the owner's `uid`** (`functions/src/index.ts:7772-8000`, lines 7813 / 7828 / 7847 / 7894) — by design, so team-member work consumes the owner's quota and counts toward the owner's plan. The owner is therefore entitled to read every doc under their own `users/{ownerUid}/projects` collection — including those a team member wrote.

The defect is at the **read** path, not at the write path. The auto-restore effect (`src/App.tsx:4567-4648`) runs **once per session** after auth resolves. It:

1. Reads the entire `users/{ownerUid}/projects` subcollection (`getAllProjectsFromFirestore` at `src/App.tsx:439-451` — `query(collection(db,'users',userId,'projects'), orderBy('timestamp','desc'))` — **no `where('workspaceId',...)` predicate**).
2. Reads the local IndexedDB store with the same `userId`-keyed index (`getAllProjectsFromDB` at `src/App.tsx:350-373` — `index.getAll(userId)` — **no workspace filter**).
3. Merges and sorts by `timestamp`.
4. Picks `savedProjects[0]` (the **globally** most recent) and loads it into live state (`src/App.tsx:4597-4641`): `setCurrentProjectId(mostRecent.id)`, `setPhase(mostRecent.phase)`, `setInputs(mostRecent.inputs)`, `setTovText(...)`, `setBuildPlan(...)`, `setMockupHistory(...)`, etc.

If the most recent doc is one a team member wrote in a **different** workspace than the one the owner opened, the owner reloads the team member's draft as live state. The in-progress session is contaminated by work that doesn't belong to the active workspace. The sidebar's `filteredProjects` (`src/App.tsx:3021-3027`) correctly hides cross-workspace docs from display, so the user's history list and the user's live editing session **disagree** — and the live session wins.

This is a workspace bleed **for the owner**, enabled by a write path that collapses team members onto the owner's account and a read path that does not partition by `workspaceId`.

A separate but smaller cross-workspace exposure exists for **the generations artefact itself**, traced in `docs/investigations/gen-leak.md`: every generation fired by a team member is written to top-level `generations/{auto-id}` with `userId = <teamMemberUid>` (`src/services/feedbackService.ts:254`, every `App.tsx` call site at `App.tsx:5889, 6503, 6843, 7557, 7613, 7703, 8215, 10214` passes `user.uid` as the 1st argument). Per `firestore.rules:240-244` (`resource.data.userId == request.auth.uid`), the owner **cannot** read those docs from a client session. That is correct for generations; the leak vector is the saved-project subcollection, which has a different rule (`firestore.rules:53-58`) that lets the owner read every doc, because by design all team-member work is supposed to live under the owner's account. The leak vector was not in the rule — it was in the auto-restore's choice.

---

## §1. Where in-progress generation state is stored

### §1.1 Live state (in-memory)

The five-step pipeline's state — inputs, `tovText`, `conceptsText`, `buildPlan`, `mockupHistory`, `captionText`, `batchResults`, `carouselSlides`, `batchHookGroups`, `phase`, `currentProjectId` — is held in `useState` inside the giant `App` component (`src/App.tsx`). All `useState` declarations are local to `App`:

| Field | File:line |
|---|---|
| `phase` / `setPhase` | `src/App.tsx:2487` |
| `currentProjectId` / `setCurrentProjectId` | `src/App.tsx:1801` |
| `inputs` / `setInputs` | `src/App.tsx:3351` |
| `tovText` / `setTovText` | `src/App.tsx:3357` |
| `conceptsText` / `setConceptsText` | `src/App.tsx:3358` |
| `buildPlan` / `setBuildPlan` | `src/App.tsx:3359` |
| `selectedTov` / `setSelectedTov` | `src/App.tsx:3553` |
| `selectedConcept` / `setSelectedConcept` | `src/App.tsx:3554` |
| `mockupHistory` / `setMockupHistory` | `src/App.tsx:3370` |
| `historyIndex` / `setHistoryIndex` | `src/App.tsx:3371` |
| `captionText` / `setCaptionText` | `src/App.tsx:3372` |
| `batchResults` / `setBatchResults` | `src/App.tsx:3375` |
| `carouselSlides` / `setCarouselSlides` | `src/App.tsx:3473` |
| `activeWorkspaceId` | `src/App.tsx:2656` |

The Zustand `useAppStore` (`src/store.ts`) declares the same fields with the same names but **no consumer reads them** — confirmed by a single grep set at `src/App.tsx:1665-1671` (only the `variationCarousels` family is consumed). The `App.tsx` comments at `src/store.ts:1-12` and `src/App.tsx:1661-1666` document this as "migration-in-progress: do not trust the store". So for the live state, `App.tsx` is the source of truth.

### §1.2 Persisted state

| Layer | Path / key | File:line | Workspace-scoped? |
|---|---|---|---|
| IndexedDB (local) | `ProAdsDB_V2.projects` keyed by `id`; index `userId` | `src/App.tsx:331-383` | **No.** `index.getAll(userId)` — query is per-user, not per-workspace. |
| Firestore sub-collection | `users/{userId}/projects/{projectId}` | `src/App.tsx:427-459` (`saveProjectToFirestore`, `getAllProjectsFromFirestore`, `deleteProjectFromFirestore`); `functions/src/index.ts:7772-8000` (`saveProject` callable resolves `ownerUid` via `resolveCallerScope` at `index.ts:7813` and writes at `index.ts:7847`) | **No.** The doc path encodes only `userId` and `projectId`. `workspaceId` is a **field** on the doc, not a path segment. |
| Firestore thumbnail storage | `users/{userId}/projects/{projectId}/thumbnail.{jpg,png}` | `src/lib/projectThumbnail.ts:8-9`; rule at `storage.rules:43-57` | **No.** Same scoping as the doc. |
| localStorage (Brief/Step 1 draft only) | `adInputsDraft` | `src/components/InputForm.tsx:329, 2564`; delete `src/components/InputForm.tsx:1107, src/App.tsx:5612` | **No.** Per-browser-per-user; not stamped with `activeWorkspaceId`. |
| sessionStorage (Stripe-checkout bridge) | `proads_return_phase`, `proads_pending_phase` | `src/App.tsx:1860-1866`, `1950-1953` | Not workspace-sensitive (single global pipeline). |

#### §1.2.1 IndexedDB — `src/App.tsx:331-383`

```ts
// src/App.tsx:331-348 (DB schema)
const DB_NAME = 'ProAdsDB_V2';
const STORE_NAME = 'projects';
// schema: id (keyPath) + userId (non-unique index)
```

```ts
// src/App.tsx:360-373
const getAllProjectsFromDB = async (userId: string) => {
  const index = store.index('userId');
  const request = index.getAll(userId);   // <-- scoped by userId only, NOT workspaceId
  ...
};
```

#### §1.2.2 Firestore — `src/App.tsx:439-451` and `functions/src/index.ts:7772-8000`

```ts
// src/App.tsx:439-451
const getAllProjectsFromFirestore = async (userId: string): Promise<SavedProject[]> => {
  const q = query(
    collection(db, 'users', userId, 'projects'),
    orderBy('timestamp', 'desc')           // <-- workspaceId NOT in the where clause
  );
  ...
};
```

```ts
// functions/src/index.ts:7813, 7828, 7847, 7894 (saveProject callable)
const callerScope = await resolveCallerScope(uid);
if (callerScope.readDegraded) throw new HttpsError("internal", "...");
const ownerUid = callerScope.ownerUid;
...
const projectRef = admin.firestore().doc(`users/${ownerUid}/projects/${project.id}`);
...
const cleanProject = { ...project, id: project.id, status: newStatus, userId: ownerUid, updatedAt: Date.now() };
txn.set(projectRef, persistedProject, { merge: true });
```

Both call paths make it explicit that the doc lands under the **owner** uid, not the caller uid. This is correct for quota/plan attribution, and the rule (`firestore.rules:53-58`) allows it.

### §1.3 Where restore reads from

The single-fire history effect at `src/App.tsx:4567-4648` (gated by `hasRestoredRef.current`, `src/App.tsx:1679/4572/4573`, reset on sign-out at `src/App.tsx:2104`):

```ts
// src/App.tsx:4566-4648 (excerpted)
useEffect(() => {
  if (!user || !effectiveUid) return;
  if (hasRestoredRef.current) return;
  hasRestoredRef.current = true;
  const initLoad = async () => {
    let cloudProjects: SavedProject[];
    if (teamOwnerUid) {
      const { workspaceService } = await import('./services/workspaceService');
      const result = await workspaceService.getUserProjects({ pageSize: 100 });
      cloudProjects = (result.data?.projects ?? []) as SavedProject[];
    } else {
      cloudProjects = await getAllProjectsFromFirestore(effectiveUid);   // <-- no workspaceId filter
    }
    const localProjects = await getAllProjectsFromDB(effectiveUid);     // <-- no workspaceId filter
    const savedProjects = mergeProjects(cloudProjects, localProjects);
    ...
    if (savedProjects.length > 0) {
      const mostRecent = savedProjects[0];    // <-- globally most-recent across ALL workspaces
      setCurrentProjectId(mostRecent.id);
      projectEstablishedRef.current = mostRecent.id;
      setCurrentProjectName(mostRecent.name || "Untitled Project");
      const _restoredShape = migrateProjectInputsShape(mostRecent.inputs);
      setInputs(sanitizeProjectModes(_restoredShape));
      setShowStrippedAssetsWarning(detectStrippedAssets(_restoredShape));
      setPhase(mostRecent.phase);
      setTovText(mostRecent.tovText);
      ...
      setCarouselSlides(mostRecent.carouselSlides || []);
      ...
      const highestIdx = phaseOrder.indexOf(highestPhaseWithData);
      setHighestUnlockedPhase(highestIdx >= 0 ? highestIdx : 0);
    }
  };
  initLoad();
}, [user, effectiveUid]);
```

`mergeProjects` (`src/App.tsx:462-472`) prefers newer `timestamp` per id, then sorts the result by `timestamp` descending. `savedProjects[0]` is the global most-recent. **No branch of this effect inspects `mostRecent.workspaceId` vs `activeWorkspaceId`.** The sidebar's `filteredProjects` slice (`src/App.tsx:3021-3027`) does filter, but it does **not** drive the loaded live state — only the displayed list.

### §1.4 Auto-save (the inverse) — `src/App.tsx:4755-4886`

The auto-save snapshots live state into a `SavedProject` and queues it via `useProjectAutoSave` (`src/hooks/useProjectAutoSave.ts:13-44`) which debounces 3s and ceiling-flushes 30s.

```ts
// src/App.tsx:4842-4885 (workspace assignment)
const resolvedWorkspaceId = (canUseWorkspaces && activeWorkspaceId)
  || existingProject?.workspaceId
  || undefined;

const currentProject: SavedProject = {
  id: currentProjectId,
  userId: uid,
  ...
  phase,
  tovText, conceptsText, ...
  mockupHistory: mockupHistory.map(...),
  captionText,
  ...
  ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
};
autoSaveQueue(currentProject);
```

The `workspaceId` is set on the doc only via this effect. So once an owner clicks a different sidebar project, the next autosave will repaint this doc under that project's `workspaceId`. But there is **no client-side check preventing the auto-restore from picking a doc belonging to a different workspace, and no client-side check that `existingProject?.workspaceId === activeWorkspaceId`** before deciding to resume.

---

## §2. The cross-user mechanism

### §2.1 Team members write to the owner's account — by design

`saveProject` (the only cloud save path for in-progress state) goes through `resolveCallerScope` (`functions/src/workspaces/workspacePolicy.ts:339-438`). The flow:

```
                 ┌──────────────────────────────────────────┐
                 │  team member session                     │
                 │  (e.g. uid=<team-member-1-uid>) │
                 └────────────────────┬─────────────────────┘
                                      │ httpsCallable('saveProject', { project })
                                      ▼
                 ┌──────────────────────────────────────────┐
                 │  saveProject callable                    │
                 │  functions/src/index.ts:7772-8000        │
                 │                                          │
                 │  callerScope = resolveCallerScope(uid)   │
                 │  ──► ownerUid = <ownerUid>  (owner, the owner)
                 │                                          │
                 │  projectRef = users/{ownerUid}/projects/{project.id}  ◄── write
                 │  cleanProject.userId = ownerUid                  ◄── stamp
                 └──────────────────────────────────────────┘
```

The doc lands at `users/{ownerUid}/projects/{id}` with `userId = ownerUid` and `workspaceId = <the workspace the team member was working in>`. From the owner's client perspective, this is just another doc in their own collection.

The reason this matters for the leak: the **owner is entitled to read every doc under their own user doc**, including any written by a team member. `firestore.rules:53-58` grants `read, write` to `request.auth.uid == userId` (owner) and to verified team members of that owner. The owner can read team-member work in their namespace; that part is correct.

The leak is what the owner **does** with that read access. They re-load it as the in-progress session without filtering by `workspaceId`.

### §2.2 The same indirection applies to the generations artefact

`feedbackService.saveGeneration(user.uid, ...)` (every call site listed in `docs/investigations/gen-leak.md:153-165`) writes a top-level `generations/{auto-id}` with `userId = user.uid` (caller, **not** the owner). The owner is **not** entitled to read those docs — `firestore.rules:240-244` (the userId-strict rule with no team-member exception) denies the owner client access.

But the **SavedProject** and the **generations** artefacts have different rules. The SavedProject subcollection's rule intentionally allows the owner to read team-member work, because by design all team members' work lives under the owner's account. The generations collection's rule does not, because by (older, pre-967) design generations were per-caller. The two diverged because Phase 967 only standardized `resolveCallerScope` for meta writes; saved projects were unified under the owner in PR for ISSUE-D (landed with `2ab2f94`); generations were not.

So the rule does what it should. The bug is the read path on the SavedProject that does not respect the workspace boundary.

### §2.3 What the data confirms

> **Redaction note (CodeRabbit review 2026-09-19, PR #73):** this section originally committed production identifiers (Firebase auth UIDs, workspace IDs, ad account IDs, creator UIDs, names, and email addresses) to the repo. Those have been replaced with clearly-labelled fixtures (`<ownerUid>`, `<workspaceId-N>`, `<team-member-N-email>`, etc.). The counts, the ratios, and the analysis are preserved verbatim — the production identifiers were inputs to the analysis, not the analysis itself.

Captured 2026-09-19 from `proadsai-saas`. The figures below use placeholder identifiers (`<ownerUid>`, `<workspaceId-N>`, `<team-member-N-email>`); the live values are not committed. Counts and ratios are preserved.

#### §2.3.1 Saved projects under the owner — 360 total, mixed creators

```
Owner projects by workspaceId (count):
   (none)        : 37          ← legacy, before workspaces existed
   <workspaceId-1> : 163   ← owner (DEFAULT workspace, named after owner)
   <workspaceId-2> : 3     ← team-member A
   <workspaceId-3> : 11
   <workspaceId-4> : 8
   <workspaceId-5> : 13
   <workspaceId-6> : 3
   <workspaceId-7> : 39
   <workspaceId-8> : 6
   <workspaceId-9> : 26
   <workspaceId-10>: 14
   <workspaceId-11>: 2
   <workspaceId-12>: 14
   <workspaceId-13>: 1
   <workspaceId-14>: 21
   total         : 360

Owner projects by creatorEmail (count):
   <owner-email>             : 188   ← owner
   <team-member-1-email>     : 143   ← team-member B (Firebase uid <team-member-B-uid>)
   <team-member-2-email>     : 14    ← team-member C
   <team-member-3-email>     : 9     ← team-member D
   <team-member-4-email>     : 5     ← team-member E (name-collides with owner)
   <test-team-member-email>  : 1     ← test team member
   (none)                    : 1
   total                     : 360
```

**~49% of the docs under the owner's namespace were written by team members — separate Firebase auth accounts.** Every one of them is reachable by the owner (per `firestore.rules:53-58`); and the auto-restore effect picks them as candidates for the in-progress session whenever they're the most-recent.

#### §2.3.2 The team-member-A workspace under the owner — 3 projects, mixed creators, mixed phases

Three SavedProjects in `users/{ownerUid}/projects` whose `workspaceId = <workspaceId-2>`:

| `id` | `timestamp` (UTC) | `phase` | `creatorEmail` | `creatorName` | Notes |
|---|---|---|---|---|---|
| `<projectId-owner-fresh>` | 2026-09-19T15:18:38Z | `input` | `<owner-email>` | owner | Owner started a fresh draft in team-member-A workspace |
| `<projectId-team-draft>` | 2026-09-19T14:07:31Z | `input` | `<team-member-1-email>` | team-member-1 | Team member's new draft in team-member-A workspace |
| **`<projectId-hooks-step>`** | **2026-09-19T14:03:07Z** | **`tov_review`** | **`<team-member-1-email>`** | **team-member-1** | **Team member's mid-flow work — hooks step.** `tovText` is populated (904 chars); no `conceptsText`/`buildPlan`/`captionText`; `mockupHistory` exists but empty. `status: rendered`. `name: " دورة "تغيّر وارتقِ"_صورة البطل على خلفية سادة"`. |

The doc at `users/{ownerUid}/projects/<projectId-hooks-step>` is the **exact match** for the report: a generation that reached the Hooks step (Step 2, `tov_review`) at the same time the owner went to look. Looking at the document:

```text
phase                  : tov_review
userId                 : <ownerUid>   (overwritten by saveProject callable)
creatorEmail           : <team-member-1-email>
creatorName            : team-member-1
workspaceId            : <workspaceId-2>
status                 : rendered
name                   :  دورة "تغيّر وارتقِ"_صورة البطل على خلفية سادة
has tovText            : true (904 chars)
has conceptsText       : false
has buildPlan          : false
has mockupHistory      : true (0 entries)
has captionText        : false
```

This is the in-progress state at the Hooks step the team member reached. The Phase 5 generation API itself had no failure recorded under this project id (`db.collection('generations').where('workspaceId','==','<workspaceId-2>').where('status','==','failed').get()` returns 0), and no record has the `uid` field from `recordGenerationFailure` (0 of 20 team-member-A workspace generations). So the "failed generation" the owner observed is the in-progress state, **not** a `generations/{id}` record — the team member reached the Hooks step, and what got persisted at that moment was the SavedProject snapshot.

#### §2.3.3 Top 10 most-recent projects across ALL workspaces, 2026-09-19

The auto-restore's `getAllProjectsFromFirestore(effectiveUid)` reads ALL of these and would pick `savedProjects[0]` — the leftmost row — regardless of `workspaceId`:

| `id` | timestamp (UTC) | `phase` | `workspaceId` | `creatorEmail` |
|---|---|---|---|---|
| `<projectId-owner-render>` | 2026-09-19T15:36:53.397Z | `render_studio` | `<workspaceId-1>` (owner) | `<team-member-1-email>` |
| `<projectId-owner-fresh>` | 2026-09-19T15:18:38.544Z | `input` | `<workspaceId-2>` (team-member-A workspace) | `<owner-email>` |
| `<projectId-2>` | 2026-09-19T15:18:07.318Z | `input` | `<workspaceId-1>` (owner) | `<owner-email>` |
| `<projectId-3>` | 2026-09-19T14:20:31.245Z | `input` | `<workspaceId-1>` (owner) | `<team-member-1-email>` |
| `<projectId-team-draft>` | 2026-09-19T14:07:31.450Z | `input` | `<workspaceId-2>` (team-member-A workspace) | `<team-member-1-email>` |
| `<projectId-hooks-step>` | 2026-09-19T14:03:07.340Z | `tov_review` | `<workspaceId-2>` (team-member-A workspace) | `<team-member-1-email>` |
| `<projectId-4>` | 2026-09-19T11:06:04.783Z | `input` | `<workspaceId-14>` | `<owner-email>` |
| `<projectId-5>` | 2026-09-12T17:24:11.250Z | `render_studio` | `<workspaceId-11>` | `<team-member-1-email>` |
| `<projectId-6>` | 2026-09-11T16:15:00.550Z | `input` | `<workspaceId-1>` (owner) | `<team-member-1-email>` |
| `<projectId-7>` | 2026-09-09T18:09:59.098Z | `input` | `<workspaceId-1>` (owner) | `<team-member-2-email>` |

The 14:03 doc — the one in team-member-A workspace at `tov_review` — would be `savedProjects[0]` between 14:03 and 14:07. The 14:20 doc would be `savedProjects[0]` between 14:20 and 15:18. The 15:18 owner-driven doc would be `savedProjects[0]` from 15:18 to 15:36. **At the moment the owner opens the team-member-A workspace expecting a fresh session, the most-recent doc anywhere in the account may not belong to the team-member-A workspace.** The owner either sees something from a different workspace loaded into the Brief form, or sees the team member's team-member-A workspace session loaded back. Both are wrong.

#### §2.3.4 team-member-1's namespace

team-member-1 (`<team-member-1-uid>`) — the team member — has 151 of his own legacy SavedProjects under `users/{<team-member-1-uid>}/projects` left over from before ISSUE-D landed the `resolveCallerScope` indirection on `saveProject`. The most recent of those is `2026-07-30T16:04:46Z` — over a month old. New writes since the rollout land under the owner (the 143-project column above).

team-member-1's user doc:

```json
{
  "email": "<team-member-1-email>",
  "isTeamMember": true,
  "teamOwnerUid": "<ownerUid>",
  "displayName": "team-member-1",
  "plan": "none",
  "credits": 30
}
```

`isTeamMember: true` and `teamOwnerUid: <ownerUid>...` — team-member-1 is a verified team member of the owner. His `saveProject` calls land at `users/{<ownerUid>...}/projects/{id}` per `resolveCallerScope`. The data is consistent with the code.

---

## §3. Other persistence layers — scoping audit

This section answers the prompt's section 3: which data crosses workspaces, which does not. The full table is in `specs/969-cumulative-learning/reports/firestore-scope-audit.md`; the relevant excerpts for this defect:

| Collection / doc | Path | `workspaceId` in path? | `uid` in path? | Verdict |
|---|---|---|---|---|
| `generations/{auto-id}` | top-level | No (field only) | No (field only) | **Rule-blocked cross-user.** `firestore.rules:240-244` admits only `resource.data.userId == request.auth.uid`. Owner cannot see team-member-written generations. |
| `creativeIdentity` | field on `generations/{auto-id}` | inherits | inherits | Inherits the parent doc's scope. |
| `users/{uid}/workspaces/{wid}/adAccounts/{aid}/imageFingerprints/{hash}` | in path | **Yes** | **Yes** | **Safe.** `loadWorkspaceFingerprints` at `functions/src/metaSync/shared.ts:470-488`; write at `backfillImageFingerprints.ts:121-147` and `src/App.tsx:6535-6540`. Both paths include `workspaceId`. |
| `users/{uid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}` | in path | **Yes** | **Yes** | **Safe.** 969 worker, dashboard, RAG all use this. |
| `users/{uid}/workspaces/{wid}/adAccounts/{aid}/hookPerformance/{angle}` | in path | **Yes** | **Yes** | **Safe.** |
| `users/{uid}/workspaces/{wid}/adAccounts/{aid}/visualPerformance/{pattern}` | in path | **Yes** | **Yes** | **Safe.** |
| **SavedProject** — `users/{ownerUid}/projects/{id}` | partial — `workspaceId` is a **field** | **Field only** | **Yes** (path is owner) | **❌ This is the leak.** Path explicitly excludes `workspaceId`. Owner can read all 360 docs (~49% by team members). |
| `generations` failure records (server-side admin write at `functions/src/index.ts:4165`) | top-level | No | No (field name `uid`, not `userId`) | **Latent bug** (audit §1: `recordGenerationFailure` writes `uid` instead of `userId` and no `workspaceId`). 0 in the team-member-A workspace sample so it doesn't contribute to the team-member-A workspace leak; record-failure data is otherwise unreadable from a client because the rule's `userId` check fails on a missing field. |
| `users/{uid}/projects/{id}/thumbnail.{jpg,png}` | storage | No | Yes | Same scope as the doc — by rule the thumbnail is owner-only in storage (`storage.rules:43-57`), but team members with the team-member exception also have access. |
| `feedbackService.buildPersonalizationContext` `adPerformance` read (`feedbackService.ts:498`) | top-level legacy `adPerformance/{uid}_{adId}` | No | Yes | Same-user cross-workspace aggregate. Owner sees aggregated numbers across all their workspaces. |
| `metaLegacySync` (`functions/src/index.ts:6242-6464`) | top-level `adPerformance` | No (field) | Yes (`{uid}_{adId}`) | Same-user cross-workspace only; not in the 969 worker path. |
| `principleVaults/{uid}/principles/{principleId}` | in path | No (user-level) | Yes | Intentionally user-level (cross-workspace learning). Owner only — team members do not share the principle vault. |
| `creativeMemory/{creativeId}` | top-level | Field | Field | Server-only write; not surfaced to clients. |

### §3.1 Does the leak reach the learning data?

The audit's "Where the path does NOT include workspaceId" table (`specs/969-cumulative-learning/reports/firestore-scope-audit.md:841-877`) classifies the SavedProject collection as **"Intentionally user-level (workspaceId is a doc field, not a path segment)"** — i.e. ONE quota pool per account, by design. That is exactly the design. But there is no second layer (rule or application) that maps a particular `SavedProject` back to the `activeWorkspaceId` at read time, so the design's intent collapses at the read site.

For the actual 969 learning system — `users/{uid}/workspaces/{wid}/adAccounts/{aid}/...` — **everything is correctly workspace-scoped at the path level**. No generation write into these subcollections carries the wrong workspace. The defect does NOT contaminate the learning data.

Two unrelated scope-cleanups are still pending in the audit and worth flagging:

1. `recordGenerationFailure` (`functions/src/index.ts:4165`) writes `{ uid, callable, failureClass, ... }` with field name **`uid`** instead of `userId`, and no `workspaceId`. The doc lands on disk (admin SDK bypasses rules) but the rule at `firestore.rules:240-244` (`resource.data.userId == request.auth.uid`) fails on read because the `userId` field is missing. 0 of 20 in team-member-A workspace — so it does not contribute to THIS leak — but it is the same shape of bug that Phase 8/Phase 10 already flagged as a separate defect.
2. `feedbackService.buildPersonalizationContext`'s `adPerformance` read at `feedbackService.ts:498` aggregates the legacy `adPerformance` collection across all workspaces for a single owner. Not a leak (owner-only data), just a within-owner aggregate.

---

## §4. Scope of the exposure

### §4.1 Which data crosses workspaces

| Layer | Cross-workspace? | Cross-user? |
|---|---|---|
| **In-progress SavedProject state** (`users/{ownerUid}/projects/{id}`) | **Yes** — auto-restore reads all `users/{ownerUid}/projects` and picks the global most-recent, then loads `phase` / `inputs` / `tovText` / `buildPlan` / `mockupHistory` / `captionText` etc. into live state regardless of `activeWorkspaceId`. | **Yes** — by way of `saveProject` collapsing team-member writes onto the owner. |
| `generations` (top-level) | No (read filter by `workspaceId` via rule-allowed multi-workspace within owner, but the most-recent restoration path does not pull from here; only `useGenerationHistory` does). | **No** — the rule denies cross-user. |
| `creativeIdentity` (field on `generations`) | inherits parent doc | inherits parent doc (which is cross-user-blocked). |
| `imageFingerprints` at `users/{uid}/workspaces/{wid}/...` | No — path includes `workspaceId`. | No — owner-only at the rule layer. |
| `adPerformance` (workspace subtree) | No — path includes `workspaceId`. | No. |
| `hookPerformance` / `visualPerformance` (workspace subtree) | No. | No. |
| `savedProject` thumbnail in Storage | Same scope as the doc (no workspace id). | Per `storage.rules:43-57`. |
| `principleVaults/{uid}/principles/{...}` | No (user-level by design). | No — team members don't share the vault. |
| IndexedDB `ProAdsDB_V2/projects` | Yes — the IndexedDB is hydrated from the cloud fetch and inherits no workspace filter. | Only the owner's local store (per-browser-per-`userId` index), but the cloud fetch populates it with team-member-written rows. |
| localStorage `adInputsDraft` (Brief-step draft) | Same — no workspace id; persists across workspace switches in the same browser. | Per-browser-per-user. |
| sessionStorage `proads_return_phase`, `proads_pending_phase` | Same — but the values are not workspace-sensitive. | n/a. |

### §4.2 Can a team member see, resume, or modify another workspace's in-progress work?

The team-member path uses the `getUserProjects` callable (`functions/src/savedProjects/getUserProjects.ts`) which **does** filter by `workspaceId` when one is passed (`getUserProjects.ts:55-56`):

```ts
if (workspaceId) {
  q = q.where("workspaceId", "==", workspaceId);
} else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0) {
  q = q.where("workspaceId", "in", wsSlice);
}
```

So a team member on the auto-restore effect is already partitioned by workspace (either by the explicit filter or by `allowedWorkspaceIds`). The team-member path is correct. The cross-workspace leak is **single-user (owner-side) only**.

A team member CAN resume / save another workspace's project — they have `read, write` to `users/{ownerUid}/projects` per the rule (`firestore.rules:53-58`), and `allowedWorkspaceIds === "ALL"` per FR-004, so they have access to every workspace the owner has. That is the documented design. It is not the leak vector here.

### §4.3 Does any generation write land in the wrong workspace's learning data?

**No.** Every 969 worker write is to `users/{uid}/workspaces/{wid}/adAccounts/{aid}/...` with the resolved `wid`, never a stale or borrowed `wid`. The defect does NOT contaminate `adPerformance`, `hookPerformance`, `visualPerformance`, `imageFingerprints`, or any other sub-collection under the workspace subtree. The audit (`specs/969-cumulative-learning/reports/firestore-scope-audit.md`) confirms this end-to-end.

### §4.4 Decision: how broad is the immediate defect?

- **In scope (broken):**
  1. The auto-restore at `src/App.tsx:4567-4648` — picks `savedProjects[0]` across all `users/{ownerUid}/projects` without a `workspaceId` predicate.
  2. The unfiltered Firestore read at `src/App.tsx:439-451`.
  3. The unfiltered IndexedDB read at `src/App.tsx:360-373`.
  4. The autosave's `resolvedWorkspaceId` resolution at `src/App.tsx:4842-4844` does not consult the active workspace for picking the project to load (only for stamping the doc). It is fine for stamping but irrelevant for choice.
  5. The SavedProject doc shape itself — `workspaceId` is a **field**, not a path segment, so client-side filtering is the only guard and there is none.

- **Not in scope (looks related but is correct, or unrelated):**
  1. The `generations` collection — the owner's client cannot read team-member records here because of `firestore.rules:240-244`. Cross-user is rule-blocked. (The cross-user bug in `recordGenerationFailure` field name is a separate latent defect, not contributing to this leak.)
  2. The meta / `creativeDeployments` path — `resolveMetaScope` + rule is symmetric and correct.
  3. The image-fingerprint index — workspace-scoped by construction.
  4. The 969 worker outputs (`adPerformance` etc.) — workspace-scoped by construction.
  5. The team-member-side read path (`getUserProjects`) — does filter by `workspaceId`.
  6. The team-member write path through `saveProject` — resolves through `resolveCallerScope` correctly.

- **Phase 969 implication:** the defect does **not** corrupt the cumulative-learning aggregates. The 969 path is workspace-scoped at every layer and is not contaminated.

---

## §5. What the data establishes, what it does not

### §5.1 Established

1. The leak mechanism at the read site is the auto-restore effect's unfiltered Firestore + IndexedDB query that picks `savedProjects[0]` without a `workspaceId` predicate (`src/App.tsx:4567-4648`).
2. ~49% of SavedProject docs under the owner's `users/{ownerUid}/projects` collection are written by team members (verified by `creatorEmail`). The owner is entitled to read them all by rule (`firestore.rules:53-58`); the bug is that the auto-restore picks them up as the in-progress session regardless of `activeWorkspaceId`.
3. A matching doc exists in the data: `users/{<ownerUid>}/projects/<projectId-hooks-step>` carries `workspaceId = <workspaceId-2>`, `creatorEmail = <team-member-1-email>`, `creatorName = team-member-1`, `phase = tov_review`, with `tovText` populated. This is exactly the symptom the report describes.
4. The same team-member (team-member-1) had 151 legacy projects under his own uid (`users/{<team-member-1-uid>}/projects`) from before `resolveCallerScope` was applied to `saveProject`. Those are stale leftovers and not reachable from the owner's session via the team-member exception (because the legacy <team-member-1-uid> docs are under team-member-1's own user doc, which doesn't have `teamOwnerUid = <ownerUid>...` of its own — actually team-member-1's user doc DOES carry `teamOwnerUid = <ownerUid>...`, but the legacy docs are under `users/<team-member-1-uid>/projects/{id}` not `users/{ownerUid}/projects/{id}`, so the owner can read them only if team-member-1 is a team member of themselves, which the rule checks... — verified: team-member-1's user doc has `isTeamMember: true, teamOwnerUid: <ownerUid>...`, but the rule is `request.auth.uid == userId || (isTeamMember of caller AND teamOwnerUid == userId)`, so for `userId = <team-member-1-uid>`, the owner session has `auth.uid = <ownerUid>...`, `isTeamMember(caller <ownerUid>...) === false` (the owner is not a team member of anyone), so the owner cannot read `users/<team-member-1-uid>/projects` directly. Those 151 legacy docs are isolated.)

### §5.2 Not established

1. Whether the owner, on the day of the bug, opened team-member-A workspace or another workspace — chronology is consistent with team-member-A workspace, but the precise session that triggered the leak cannot be reproduced from Firestore alone (only the in-app IndexedDB store would record that, and only on the owner's machine).
2. Whether the deployed `firestore.rules` exactly match the file in the repo at the time the bug surfaced. The repo file at `firestore.rules:53-58` has the team-member exception. If the deployed rules are older than this commit, the read-side boundary could differ. Verified by manual probe attempts (firebase-tools CLI has no `firestore:rules:get`; left for production verification in the fix batch).

### §5.3 The two boundary options the fix must choose between

The fix needs a way to partition `users/{ownerUid}/projects/{id}` by workspace at the **read** site, so that the auto-restore picks a doc whose `workspaceId` matches `activeWorkspaceId`. Two ways to do it:

(a) **Path-level.** Move the SavedProject docs into a `workspaceId`-keyed subtree (`users/{ownerUid}/workspaces/{wid}/projects/{id}`) and have `saveProject` resolve `wid` from the team's active-workspace context (one more field on the read gate). This is invasive — it changes the schema, the rule, the cloud read, the IndexedDB read, all backend callables, the cascade in `workspacePurge`, the quota plumbing. Touches 30+ sites.

(b) **Query-level.** Add a `workspaceId` filter to the auto-restore's `getAllProjectsFromFirestore` and `getAllProjectsFromDB` queries AND pick among the filtered set by timestamp. Path stays the same. The fix is local: the effect at `src/App.tsx:4567-4648`, the autosave's `resolvedWorkspaceId` resolution if needed, and the loadProject picker. Concretely: read where `workspaceId == activeWorkspaceId ?? <defaultWorkspaceId>` and pick `savedProjects[0]` from that set. If the set is empty, the in-progress session should land on a **brand-new** project (Brief/Step 1), never `savedProjects[0]` from a different workspace.

The audit, the rule, and the existing data shape all support option (b). The repo `firestore.rules:53-58` does not need to change. The IndexedDB schema does not need to change. The cloud write path does not need to change.

This report does not implement the fix. The fix follows in its own batch.

---

## §6. File / line citations (consolidated)

App.tsx (frontend):
- `src/App.tsx:331-348` — IndexedDB schema (`ProAdsDB_V2`, `projects` store, `userId` index).
- `src/App.tsx:350-373` — `saveProjectToDB`, `getAllProjectsFromDB` (workspace-id not used as a key or query param).
- `src/App.tsx:412-425` — `stripHeavyImageData` (cloud-only stripping).
- `src/App.tsx:427-459` — `saveProjectToFirestore`, `getAllProjectsFromFirestore`, `deleteProjectFromFirestore` (Firestore subcollection, no workspace filter).
- `src/App.tsx:1801-1802` — `currentProjectId` initialised to `Date.now().toString()`.
- `src/App.tsx:2656, 2678, 2687` — `activeWorkspaceId`, `workspaceReady`, `activeWorkspaceIdRef`.
- `src/App.tsx:3021-3027` — `filteredProjects` display slice (correctly filters, but does not steer the auto-restore).
- `src/App.tsx:4566-4648` — HISTORY ENGINE auto-restore effect (the defect site).
- `src/App.tsx:4666-4747` — `saveCurrentProject` (cloud save via `saveProject` callable).
- `src/App.tsx:4755-4886` — auto-save snapshot assembly, including `resolvedWorkspaceId` resolution.
- `src/App.tsx:5467-5531` — `loadProject` (manual restore).
- `src/App.tsx:5564-5572` — `handleHistorySelect`.

index.ts (backend):
- `functions/src/index.ts:7772-8000` — `saveProject` callable. Resolves owner via `resolveCallerScope(uid)` at line 7813. Writes to `users/${ownerUid}/projects/${project.id}` at line 7847. Overwrites `userId: ownerUid` at line 7894.
- `functions/src/index.ts:4139-4169` — `recordGenerationFailure({ uid: request.auth!.uid, ... })` writes a failure record with field name `uid` (not `userId`), separate latent bug.
- `functions/src/index.ts:5058-5063` — `generations.add({ userId: request.auth.uid, ... })` for cultural violation.

workspacePolicy.ts:
- `functions/src/workspaces/workspacePolicy.ts:339-438` — `resolveCallerScope`. Returns `ownerUid` used by `saveProject`.

getUserProjects.ts (the **team-member** side of the read path):
- `functions/src/savedProjects/getUserProjects.ts:39-66` — owner resolution + workspace filter. Correct for the team-member branch; the defect is the **owner** branch (which uses `getAllProjectsFromFirestore` directly).

feedbackService.ts (frontend):
- `src/services/feedbackService.ts:177-264` — `saveGeneration(userId, ...)`. Writes `generations/{auto-id}` with `userId` from the 1st arg. **Not** the in-progress state; this is the generations artefact.
- `src/services/feedbackService.ts:498-499` — legacy `adPerformance` read in `buildPersonalizationContext` (same-user cross-workspace aggregate; not contributing to the leak).

firestore.rules:
- `firestore.rules:53-58` — `users/{userId}/projects/{projectId}` allows the owner and the owner's verified team members to read+write. This is by design (saved projects live under the owner).
- `firestore.rules:240-244` — `generations/{genId}` allows read only when `resource.data.userId == request.auth.uid` (no team-member exception).

storage.rules:
- `storage.rules:30-32` — `users/{userId}/renders/{allPaths=**}` owner-only (storage for rendered images, separately from the saved-project doc).

types.ts:
- `src/types.ts:442-473` — `SavedProject` interface. Confirms the shape: `id`, `userId`, `timestamp`, `phase`, `inputs`, `tovText`, `conceptsText`, ..., `creatorName`, `creatorEmail`, optional `workspaceId`.

## §7. Status

This is a **read-only investigation**, per the owner's instruction ("write no fix code; the owner's reviewer reads the investigation first and the fix follows in its own batch").

- No production writes were made by the probe; all queries were admin read-only.
- Phase 4 Batch 3 is paused.
- The fix is documented at section §5.3 (the read site needs a `workspaceId` filter on the auto-restore; the path-level / query-level trade is the fix author's call, both are sound).
- The defect is in `src/App.tsx:4567-4648` and `src/App.tsx:439-451` (and the symmetric `getAllProjectsFromDB` at `src/App.tsx:360-373`). Nothing in the backend needs to change.

> **Round-15 fix (coderabbit review §13 workspace-isolation line 400,
> 449):** the defect has been **closed by `d8d94c5`** (Phase 4
> Batch 3 — auto-restore removal) in this same PR. The owner locked
> decision §11.4 #1 in favour of "remove the global most-recent
> auto-restore entirely — every session starts blank at step 1",
> which renders §4.4's "in scope (broken): auto-restore at
> `src/App.tsx:4567-4648`" **moot**. The IndexedDB workspaceId
> migration question at §4.4 #2 is moot for the same reason
> (IndexedDB no longer participates in the restore). The
> autosave's `resolvedWorkspaceId` chain is preserved as-is and is
> the right contract for the user-initiated paths (sidebar
> `loadProject`, `handleStartDesign`, etc.). The remaining
> constraints — the rule at `firestore.rules:53-58` granting
> team members `read, write` to `users/{ownerUid}/projects`, and
> `allowedWorkspaceIds === "ALL"` per FR-004 — are documented
> design choices that survive the fix.
