# Cross-user generation leak — trace of write/read paths

**Branch:** `969-phase-4`
**Date:** 2026-09-19
**Subject:** where generation data is written and read; whether a generation written by one user can surface in another user’s session
**Affected workspace (from report):** `ZbGPvZbrAAFl8afG41dG` (Moataz Mashal) — owner uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`, ad account `act_1069240099193713`

---

## §A. Generation creation flow: backend

A full generation has **two** writes that originate from **two different processes**:

1. The Cloud Function side runs the model, deducts credits, uploads the rendered image to Firebase Storage, and writes either a cultural-violation event or a failure event into the `generations` collection with admin SDK.
2. The frontend side, after the function returns, takes the function’s response, builds a structured `GenerationRecord`, and writes it into the same `generations` collection via the Firebase Web SDK with the caller’s own auth context.

Neither side routes through `resolveCallerScope` or `resolveMetaScope`.

### §A.1 The function family in `functions/src/index.ts`

All generation callables (line numbers) follow the same shape:

```
functions/src/index.ts:199-257    generateCreative
functions/src/index.ts:4590-4645  serverGenerateTOV
functions/src/index.ts:4648-5018  serverGenerateConcepts
functions/src/index.ts:5028-5074  serverGenerateBuildPlan
functions/src/index.ts:5170-5330  serverGenerateFinalAd
functions/src/index.ts:5529-5569  serverGenerateCarouselAngles
functions/src/index.ts:5571-5609  serverGenerateCarouselSlideCopies
functions/src/index.ts:5616-5662  serverGenerateTestimonialCarousel
functions/src/index.ts:5669-5698  serverGenerateCaption
functions/src/index.ts:5704-5731  serverGenerateVisualPolishes
```

Pattern:

```ts
if (!request.auth) throw new HttpsError("unauthenticated", "Login required.");
const callerId = request.auth.uid;  // <-- always the *auth* uid
...
recordGenerationFailure({ uid: request.auth!.uid, ... })  // never ownerUid
```

**`generateCreative` itself does no Firestore writes** beyond the credit deduction against `users/{creditOwnerUid}` (line 213-232). The remaining AI callables either (a) call `recordGenerationFailure(...)` on catch, or (b) write a cultural-violation event into `generations`. **None invoke `resolveCallerScope` or `resolveMetaScope`.**

The **only** callables that DO call `resolveCallerScope`/`resolveMetaScope` are:

- `metaPushCreative` (resolver at `index.ts:4094`),
- `linkUnmatchedAd` (resolver at `linkUnmatchedAd.ts`)
- `saveProject` (resolver at `index.ts:7813`)
- `getWorkspaceGenerations` (resolver at `index.ts:7569`)

Generation callables are conspicuously absent from this list.

### §A.2 Auth-context -> uid flow

For `serverGenerateFinalAd` (representative):

| Step | uid used |
|------|----------|
| `request.auth.uid` (`index.ts:5178`) | caller’s own uid |
| `enforceGenerationEntitlement(request.auth.uid,...)` (`index.ts:5188`) | caller’s own uid |
| `populateSourceColdAdBrandColors(request.auth.uid, inputs)` (`index.ts:5196`) | caller’s own uid |
| `saveBase64ToStorage(result.image, "users/${request.auth.uid}/renders")` (`index.ts:5293`) | caller’s own uid — rendered image lands in the **team member’s** storage namespace, not the owner’s |
| `storeCreativeToMemory(request.auth!.uid, ...)` (`index.ts:5262`) | caller’s own uid |
| `recordGenerationFailure({ uid: request.auth!.uid, ... })` (`index.ts:5324`) | caller’s own uid |

Compare to `metaPushCreativeImpl` (`index.ts:4020-4021`):

```ts
// metaPushCreativeImpl — metaDeployment record
userId: scope.ownerUid,           // <-- resolved via resolveMetaScope
pushedByUid: scope.callerUid,     // <-- audit signal only
```

Meta uses `scope.ownerUid` for the path; generations use the caller’s raw uid for the path.

---

## §B. `resolveCallerScope` in detail

`resolveCallerScope(callerUid)` is defined at `functions/src/workspaces/workspacePolicy.ts:339-438` and is imported at `functions/src/index.ts:21`.

```ts
// functions/src/workspaces/workspacePolicy.ts:339-358
export async function resolveCallerScope(callerUid: string): Promise<{
  ownerUid: string;                                   // <-- the value used downstream
  allowedWorkspaceIds: string[] | "ALL";
  storedWorkspaceAccess: string[];
  readDegraded?: boolean;                             // sentinel for transient read failures
}>
```

What it does (in body order):

1. Reads `users/{callerUid}` to inspect `isTeamMember` and `teamOwnerUid` (`workspacePolicy.ts:362-363`).
2. If `isTeamMember === true && teamOwnerUid` (strict `=== true` per Round 18 CodeRabbit), reads `users/{ownerUid}/team` and does `.where('uid','==',callerUid).limit(1)` to verify a member doc actually exists under that owner (`workspacePolicy.ts:374-381`).
3. If a member doc is present, returns `{ ownerUid, allowedWorkspaceIds: "ALL", storedWorkspaceAccess: ... }` (`workspacePolicy.ts:397`).
4. If no member doc is present, **throws** `HttpsError("permission-denied", reason: "membership_unproven")` (`workspacePolicy.ts:409-413`) — fail-closed; no silent fall-through.
5. Otherwise (regular owner), returns `{ ownerUid: callerUid, allowedWorkspaceIds: wsIds.length > 0 ? wsIds : "ALL", ... }` (`workspacePolicy.ts:416-418`).
6. The catch-all degrades to self-scope (`workspacePolicy.ts:419-437`): any non-`HttpsError` read failure yields `{ ownerUid: callerUid, allowedWorkspaceIds: "ALL", storedWorkspaceAccess: [], readDegraded: true }`. The contract documents this as "the safe, no-data-leak default — it can never grant a caller access to another account’s documents, only their own" (lines 327-331). And line 432-434: "Without [`readDegraded`] a transient read failure here silently converts into an authorization verdict".

The wrapper `resolveMetaScope(request)` at `functions/src/workspaces/metaCallerScope.ts:78-103` hides `callerUid` behind `request.auth?.uid`, throws `unauthenticated` if missing, and re-throws as `unavailable / reason: read_degraded` when `scope.readDegraded` is set. This is the same wrapper that wraps every Meta callable’s preamble.

**Does it change the user uid used for writes?** Yes — everywhere it is honoured. The caller is replaced with the resolved **owner** uid. Examples:

| Caller                              | Resolved `ownerUid` written to Firestore                  |
|-------------------------------------|-----------------------------------------------------------|
| `metaPushCreativeImpl` (`index.ts:4020-4021`) | `userId: scope.ownerUid, pushedByUid: scope.callerUid` (creator preserved as audit) |
| `saveProject` owner-side (`index.ts:7828`)    | `users/${ownerUid}/projects/${project.id}`               |
| `saveProject` member-side                     | `users/${ownerUid}/projects/${project.id}` (member writes under owner) |
| `getWorkspaceGenerations` owner-side (`index.ts:7624`) | query: `where userId == ownerUid`              |

When `resolveCallerScope` is **not** called, the writer uses `request.auth.uid` verbatim, which is the team member’s own uid in a team session. That is the asymmetry.


---

## §C. Every generation-side write path (Firestore)

The `generations` collection has **one** canonical path: **`generations/{auto-id}`** (top-level). This is consistent across:

- `functions/src/generationDeleteCascade.ts:14-30` ("the TOP-LEVEL `generations/{id}` collection … the original (wrong) path watched `users/{uid}/workspaces/{wid}/generations/...` which never fires — generations live at the top level.")
- `functions/src/linkUnmatchedAd.ts:84-88` ("`generations/{genId}` collection (written by `feedbackService.saveGeneration` via `addDoc(collection(db, 'generations'), ...)`)")
- `functions/src/workspacePurge.ts:127-141` (cascade reassigns `generations` filtered by `userId == ownerUid` — implying an owner-attribute elsewhere; see F for the contradiction)

Full write inventory:

### §C.1 Server-side writes (admin SDK, bypasses rules)

| # | File:line                                                  | Document path                  | Fields / shape                                                                                                  | Where uid comes from |
|---|------------------------------------------------------------|--------------------------------|-----------------------------------------------------------------------------------------------------------------|----------------------|
| 1 | `functions/src/index.ts:4165` (`recordGenerationFailure`) | `generations/{auto-id}`        | `{ uid: params.uid, callable, failureClass, costEstimate, errorMessage, createdAt, status: "failed", offerCreativeMode?, adMode?, aspectRatio? }` | **`params.uid` = `request.auth.uid`** (caller, see calls at lines 4639, 5012, 5068, 5324, 5562, 5606, 5660, 5695, 5727) — **no `userId` field at all** |
| 2 | `functions/src/index.ts:5058-5063` (cultural-violation path) | `generations/{auto-id}`    | `{ userId: request.auth.uid, timestamp: Date.now(), output: { phase: "build_plan" }, culturalViolation }` | **`userId = request.auth.uid`** = caller |
| 3 | `functions/src/resolutionTrace.ts:308-315` (`persistTrace`) | `generations/{genId}` — doc id is the SAME one the client wrote (line 6536 path) | `{ resolutionTrace: trace }` via `set(..., { merge: true })` (admin) | gen id is the one the client returned; **NOT gated by auth** — uses admin SDK |
| 4 | `functions/src/linkUnmatchedAd.ts:88` (read)              | `generations/{genId}`         | (read only)                                                                                                     |                      |

Every one of these uses admin SDK, so they pass the Firestore `allow create/read` checks regardless. **No call to `resolveCallerScope` or `resolveMetaScope` for any of them.**

### §C.2 Client-side writes (browser SDK, rule-checked)

The generation record the user actually sees is written by the browser, not the function:

| # | File:line                                                | Document path        | Field shape (relevant excerpt)                                                                                                       | Where uid comes from |
|---|----------------------------------------------------------|----------------------|---------------------------------------------------------------------------------------------------------------------------------------|----------------------|
| 1 | `src/services/feedbackService.ts:177-264` (`saveGeneration`) | `generations/{auto-id}` (via `addDoc(collection(db, 'generations'), ...)` at line 254) | `userId` (line 194), `workspaceId` (line 195), `timestamp`, `input.*`, `output.*`, `feedback.*`, `metadata.*`, `creativeIdentity?`, `resolutionTrace?` | **`user.uid` (1st parameter, line 178)** |
| 2 | `src/services/feedbackService.ts:267-290` (`updateFeedback`)  | `generations/{genId}` (`doc(db,'generations',genId)`) | update on `feedback.{rating,tags,freeText}`                                                                                           | n/a — uid is the doc’s existing `userId` (rule-enforced)                            |
| 3 | `src/services/feedbackService.ts:293-305` (`toggleFavorite`)  | `generations/{genId}` | update on `feedback.savedToFavorites`                                                                                                  | same as above                                                                              |
| 4 | `src/services/feedbackService.ts:670-688` (`updateFavoriteRecord`) | `generations/{genId}` | update on `output\|input\|metadata\|creativeIdentity`                                                                              | same as above                                                                              |
| 5 | `src/App.tsx:6535-6540` (`updateDoc` on `generations/{savedGenId}`) | `generations/{genId}` | fields: `imageFingerprint`, `imageFingerprintAlgo`                                                                             | n/a — uid is the doc’s existing `userId` (rule-enforced)                            |

`feedbackService.saveGeneration(userId, ...)` — the **first parameter** is what gets written as `userId`. Every call site of `feedbackService.saveGeneration(...)` in `src/App.tsx` passes `user.uid`:

```
App.tsx:5889   "user.uid, cleanInputs, 'hooks', ..."
App.tsx:6503   "user.uid, inputs, 'render', ..."
App.tsx:6843   "user.uid, inputs, 'render', ..."
App.tsx:7236   "...doSaveCarousel = () => feedbackService.saveGeneration(...)"   // (1st arg = user.uid at the call below)
App.tsx:7557   "user.uid, inputs, 'render', ..."
App.tsx:7613   "user.uid, inputs, 'caption', ..."
App.tsx:7703   "user.uid, inputs, 'render', ..."
App.tsx:8215   "user.uid, inputs, 'render', ..."
App.tsx:10214  "user.uid, inputs, 'render', ..."
```

Contrast with `src/App.tsx:2512` defining `effectiveUid`:

```ts
const effectiveUid = teamOwnerUid || user?.uid || null;
```

— the value meant for "owner-perspective reads". The phase-14 fingerprint-index write at `App.tsx:6533` uses it:

```ts
const workspaceOwnerUid = effectiveUid || user.uid;
const indexRef = doc(db, `users/${workspaceOwnerUid}/workspaces/${activeWorkspaceId}/imageFingerprints`, ...);
```

…and the workspace-deleted cascade at `functions/src/workspaces/workspacePurge.ts:127-141` is built around `userId == ownerUid` on the same `generations` collection. **But the generation record itself uses `user.uid`, not `effectiveUid`. Two different definitions of the "correct" uid for the same generation coexist.**

`effectiveUid` is referenced from a workspace-aware fingerprint index path, Meta write paths, the link paths, and the workspace-snapshot effects. **`saveGeneration` is the only path that diverges.**

### §C.3 What the admins expect (per existing comments)

`functions/src/linkUnmatchedAd.ts:107-113`:

```ts
// The generation’s `userId` is the OWNER’s (generations are stored
// under the owner — `feedbackService.saveGeneration` runs in the
// owner’s auth context, not a team member’s). The pre-967 check
// compared against the caller’s uid, which a team member’s call
// would never satisfy even when the link was legitimate.
if (typeof genData.userId === "string" && genData.userId !== ownerUid) {
    throw new HttpsError("permission-denied", "This generation does not belong to the current account.");
}
```

The comment claims `feedbackService.saveGeneration` "runs in the owner’s auth context". It does not. It runs in the caller’s auth context and writes `userId = callerUid`. The link callable therefore rejects team-member-written records (false negative: the legitimate link is refused), and the recorded-by-owner comment mismatches the wire data.

### §C.4 Storage paths tied to a generation write

`functions/src/index.ts:5293` (`serverGenerateFinalAd`):

```ts
storageUrl = await saveBase64ToStorage(result.image, `users/${request.auth.uid}/renders`);
```

The rendered image lands at `users/{<CALLER>}/renders/<random>` — never at `users/{ownerUid}/renders/...`. Storage rule:

```text
match /users/{userId}/renders/{allPaths=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

(`storage.rules:30-32`) — the rendered image is accessible only to the caller who triggered the generation. A team member’s render is unreadable to the owner.


---

## §D. Frontend -> backend payload shape for generation calls

The frontend (`src/services/geminiService.ts`) keeps a thin client:

```ts
// src/services/geminiService.ts:13-23
const fnTOV            = httpsCallable(functions, "serverGenerateTOV",            { timeout: 120000 });
const fnConcepts       = httpsCallable(functions, "serverGenerateConcepts",       { timeout: 120000 });
const fnBuildPlan      = httpsCallable(functions, "serverGenerateBuildPlan",      { timeout: 300000 });
const fnFinalAd        = httpsCallable(functions, "serverGenerateFinalAd",        { timeout: 300000 });
const fnCarouselAngles = httpsCallable(functions, "serverGenerateCarouselAngles", { timeout: 120000 });
const fnCarouselCopies = httpsCallable(functions, "serverGenerateCarouselSlideCopies", { timeout: 120000 });
const fnCaption        = httpsCallable(functions, "serverGenerateCaption",        { timeout: 120000 });
const fnVisualPolishes = httpsCallable(functions, "serverGenerateVisualPolishes", { timeout: 60000 });
const fnEditRegion     = httpsCallable(functions, "serverEditRegion",             { timeout: 120000 });
const fnTestimonialCarousel = httpsCallable(functions, "serverGenerateTestimonialCarousel", { timeout: 300000 });
```

Example payloads:

```ts
// src/services/geminiService.ts:576-580 (generateTOV)
const result = await fnTOV({
  inputs: sanitizeInputs(inputs), resolvedUniverse, mode,
  previousOutput, globalRefinement, editFeedback, editIndex,
  editIntent, rewriteScope, semanticLock, activeWorkspaceId,
});
// src/services/geminiService.ts:592-595 (generateConcepts)
const result = await fnConcepts({
  approvedTov, inputs: sanitizeInputs(inputs), resolvedUniverse,
  mode, previousOutput, globalRefinement, editFeedback, editIndex, activeWorkspaceId,
});
// src/services/geminiService.ts:606-609 (generateBuildPlan)
const result = await fnBuildPlan({
  conceptRaw, selectedTov, inputs: sanitizeInputs(inputs),
  resolvedUniverse, currentAspectRatio, textOverride, activeWorkspaceId,
});
// src/services/geminiService.ts:647-667 (generateFinalAd) — the biggest one
const result = await fnFinalAd({
  buildPlan, approvedTov, inputs: inputsWithPhotos,
  resolvedUniverse, currentAspectRatio,
  editInstruction, base64ToEdit, styleReference, textOverride, activeWorkspaceId,
  _batchTotal: batchTotal,
  conceptDirectorTrace: sanitizeConceptDirectorTrace(conceptDirectorTrace) ?? undefined,
  copyScoringTrace: sanitizeCopyScoringTrace(copyScoringTrace) ?? undefined,
});
```

**The full payload shape for `serverGenerateFinalAd`** (the one that produces the eventual `userId` writes on the client):

| Field                  | Type                  | Source                                                      |
|------------------------|----------------------|-------------------------------------------------------------|
| `buildPlan`            | string                | state                                                      |
| `approvedTov`          | string                | state                                                      |
| `inputs`               | object (sanitised `AdInputs`) | state                                                 |
| `resolvedUniverse`     | string                | state                                                      |
| `currentAspectRatio`   | string                | state                                                      |
| `editInstruction`      | string?               | state                                                      |
| `base64ToEdit`         | string?               | state                                                      |
| `styleReference`       | string?               | state                                                      |
| `textOverride`         | object?               | state                                                      |
| **`activeWorkspaceId`** | string?             | **`App.tsx:2656` `activeWorkspaceId` state — workspace id, no uid** |
| `_batchTotal`          | number?               | state                                                      |
| `conceptDirectorTrace` | object?               | state                                                      |
| `copyScoringTrace`     | object?               | state                                                      |

**There is no `uid`, no `userId`, no `ownerUid`, no `workspaceOwnerUid` in any generation payload.** The server infers uid only from `request.auth.uid`.

Client-side generation writes:

```ts
// src/services/feedbackService.ts:177-264 (saveGeneration)
const genId = await feedbackService.saveGeneration(
  user.uid,             //  <-- 1st positional = uid field written to the doc
  inputs,
  phase,                // "hooks" | "concepts" | "render" | "caption"
  outputData,
  fullResponse,
  resolvedUniverse,
  model,
  generationTimeMs,
  aspectRatio,
  creativeIdentity,
  workspaceId,          //  workspaceId optional, not the owner uid
  failureClass,
  costEstimate,
  resolutionTrace,
);
```

And the resulting document written:

```ts
// src/services/feedbackService.ts:193-246
const record = {
  userId,                 // written verbatim from the 1st arg  <-- caller
  workspaceId: workspaceId || null,
  timestamp: Timestamp.now(),
  failureClass,
  costEstimate,
  input: { ... },
  output: { phase, ... },
  feedback: { rating: null, tags: [], freeText: "", savedToFavorites: false },
  metadata: { model, promptVersion: "v5.1", generationTimeMs, aspectRatio },
  ...creativeIdentity,
  ...resolutionTrace,
};
```


---

## §E. Firestore rules for the relevant collections

```text
// firestore.rules:240-245  (read+write)
match /generations/{genId} {
  allow read:   if request.auth != null && resource.data.userId         == request.auth.uid;
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update: if request.auth != null && resource.data.userId         == request.auth.uid;
}
```

```text
// firestore.rules:5-41 (users — has a team-member exception)
match /users/{userId} {
  allow read: if request.auth != null
              && (request.auth.uid == userId
                  || (get(.../users/$(request.auth.uid)).data.isTeamMember == true
                      && get(.../users/$(request.auth.uid)).data.teamOwnerUid == userId));
  ...
}
```

```text
// firestore.rules:43-93 (avatar / projects / workspaces subcollections)
match /users/{userId}/avatars/{avatarId}    { allow read, write: if ownUid OR (teamMember AND teamOwnerUid==userId); ... }
match /users/{userId}/projects/{projectId}  { allow read, write: if ownUid OR (teamMember AND teamOwnerUid==userId); ... }
match /users/{userId}/workspaces/{workspaceId} {
  allow read, write: if ownUid;
  allow read: if teamMember AND teamOwnerUid==userId AND workspace not soft-deleted;
  ...
}
```

```text
// firestore.rules:258-262 (creativeDeployments — Meta side, owner-scoped, server write only)
match /creativeDeployments/{depId} {
  allow read:  if request.auth != null && resource.data.userId == request.auth.uid;
  allow write: if false;
}
```

Three observations:

1. **`generations/{genId}` has NO team-member exception.** Only the user whose uid is encoded as `userId` on the doc can read or create/update — full stop. The `users/{userId}`-shaped team-member bypass does **not** reach into this collection.
2. **`creativeDeployments/{depId}` (Meta writes) have the same userId-only filter.** Combined with §C.1 #1 and §A.2, Meta-side writes are correctly `userId: scope.ownerUid` because of `resolveMetaScope` in the callable. That means in practice **no team member ever writes a `creativeDeployments` doc** because the user the doc is filed under is the resolved owner uid — the owner alone sees it on the client.
3. **Failure records written by the server** at `index.ts:4165` carry `uid` (not `userId`). The rule evaluates `resource.data.userId` — a field that does not exist on those records — and `undefined == "<anyAuthUid>"` is false, so the rule denies. **They are unreadable to anyone via the client SDK**, including the team member who triggered them.

### §E.1 Callable-side read paths (admin SDK bypasses the rules above)

| Callable                  | File:line                                                | Query                                                                                                       | Authentication                          |
|---------------------------|----------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|-----------------------------------------|
| `getWorkspaceGenerations` | `index.ts:7533-7668` (build at `:7622`)                  | `where("userId","==",ownerUid) AND where("workspaceId","==",wsFilter)` + legacy `workspaceId==null` merge    | `resolveCallerScope` cross-owner check at `:7569` |
| `getWorkspaceAccessAuditLog` | `index.ts:7670-7709`                                  | `users/${uid}/workspace_access_audit`                                                                       | none — uses `request.auth.uid` directly  |
| `getUserProjects`         | `savedProjects/getUserProjects.ts:50`                   | `users/${ownerUid}/projects`                                                                                | `resolveCallerScope` (line 39)            |
| `patternSummaries` (analytics) | `patternSummaries.ts:338`                           | `where("userId","==",userId)` on `generations`                                                              | none for the `userId` filter — called from admin worker jobs |
| `getTopWinners`           | `getTopWinners.ts:202`                                   | `db.collection("generations").doc(generationId)` per-call                                                   | per-doc, no explicit scope                |
| `whatsWorkingDashboard`   | `whatsWorkingDashboard.ts:733`                          | `where("__name__","in",chunk)` (read by ids)                                                                | none — list of ids comes from prior workspace-scoped query |

`getWorkspaceGenerations` is the in-app callable used by the `useGenerationHistory` server-backed equivalent. It explicitly passes `where("userId","==",ownerUid)` — i.e. the **resolved owner** — not `where("userId","==",request.auth.uid)`. This relies on generations having `userId = ownerUid` to return any rows. As shown in §C.2 and §D, generations written by team members carry `userId = teamMemberUid` and therefore never satisfy `userId == ownerUid`.

### §E.2 Client-side read paths

| Hook                                       | File:line                                          | Constraint shape                                                                                                |
|--------------------------------------------|----------------------------------------------------|----------------------------------------------------------------------------------------------------------------|
| `useGenerationHistory`                     | `src/hooks/useGenerationHistory.ts:557-565`        | no-workspace: `where("userId","==",uid)`; workspace: `where("workspaceId","==",workspaceId)` — then per-doc rule `userId == request.auth.uid` filters out anyone else’s rows |
| `useFavorites`                             | `src/hooks/useFavorites.ts:156-167`                | same pattern                                                                                                    |
| `feedbackService.getLikedOutputs`          | `feedbackService.ts:314-321`                        | `where("userId","==",userId)`                                                                                   |
| `feedbackService.getNicheTopOutputs`       | `feedbackService.ts:337-345`                        | `where("input.niche","==",niche)` — **no user filter**; relies on rule                                         |

With the rule at `firestore.rules:240-244`, a team member reading via `workspaceId == X` only sees docs whose `userId == auth.uid`. The `useGenerationHistory` hook therefore shows the team member **only their own rows**, never rows the owner wrote under the same workspace. Likewise the owner sees only their own rows. Within the rule’s letter, no cross-user visibility is possible.


---

## §F. Verdict

**The generations collection is a separate top-level collection. It is NOT routed through `resolveCallerScope` or `resolveMetaScope`. The leak is not explainable by the Phase-967 fix touching meta writes — it is a parallel, untouched write path.**

Three observable facts from §A-§E:

1. **Meta writes go through `resolveMetaScope` -> `scope.ownerUid`** (`metaPushCreativeImpl` at `index.ts:4020-4021`, the deployment record carries `userId: scope.ownerUid, pushedByUid: scope.callerUid`).
2. **Saved-project writes go through `resolveCallerScope` -> `callerScope.ownerUid`** (`saveProject` at `index.ts:7813-7828`, projectRef = `users/${ownerUid}/projects/${id}`).
3. **Generation writes go through neither.** Every entry point passes the caller’s own uid:
   - `feedbackService.saveGeneration(user.uid, ...)` at every `App.tsx` call site listed in §C.2.
   - `recordGenerationFailure({ uid: request.auth!.uid, ... })` from each of the 9 server callables (§C.1 #1).
   - `index.ts:5058` `generations.add({ userId: request.auth.uid, ... })`.
   - `index.ts:5293` `saveBase64ToStorage(result.image, "users/${request.auth.uid}/renders")` — the rendered image goes to the caller’s storage namespace.

Consequence (verified from the code, not assumed):

> For a team member in workspace `ZbGPvZbrAAFl8afG41dG`, a generation produces a record at **`generations/{auto-id}` with `userId = <teamMemberUid>` and `workspaceId = "ZbGPvZbrAAFl8afG41dG"`**. The image lands at **`users/<teamMemberUid>/renders/<hash>`**. **None of `resolveCallerScope`, `resolveMetaScope`, nor any Firestore rule grants the workspace owner read access to that record or that image.** Conversely, the team member cannot see the owner’s own generations in the same workspace because the rule is symmetric.

### §F.1 Is the cross-user observation explainable by the same indirection that Meta uses?

**No.** The Meta path uses `scope.ownerUid` consistently and the rule grants the owner read of `creativeDeployments/{depId}` when `userId == request.auth.uid`. If a record carrying `userId == ownerUid` did leak to the owner’s session, that is consistent with the design and would be the design’s intended behaviour. The generations path is the opposite: the `userId` is the caller’s, and the owner’s session would NOT see it under the rule.

For the observation — *the owner saw the team member’s failed generation* — to fit the current code paths, one of these must be true:

| Hypothesis                                                                                       | Predicate satisfied?                                                                                                                                                                |
|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| (a) The team’s generation is on a doc whose `userId == ownerUid` and the rule grants the owner read. | **No.** `feedbackService.saveGeneration` writes `userId = user.uid` (caller) — see §D and §C.2 every App.tsx call site passes `user.uid`. The cultural-violation admin write at `index.ts:5058` writes `userId = request.auth.uid` (caller). The failure-record admin write at `index.ts:4165` writes `uid` (not `userId`) — and a missing field fails the `==` comparison. |
| (b) The owner is reading through the same auth session (auth token) as the team member.           | Likely no (they say "different auth account"). If yes, then there is no boundary to break — this would be a different bug entirely.                                                  |
| (c) The deployed firestore.rules differ from the file in the repo (deploy-staleness).            | Unknown until verified. The repo file says userId-strict only (`firestore.rules:240-244`). A deployed version that includes a team-member exception (analogous to lines 5-9) would let the owner read any doc with `workspaceId == X`. **This is the most plausible single-cause hypothesis — it is consistent with the *workspaceId*-branch of the leak and with the rule template used for `users/.../projects` and `users/.../workspaces` (firestore.rules:43-99).** |
| (d) Some other read path (admin SDK) returns the doc without filtering on `userId`.              | The `getWorkspaceGenerations` callable at `index.ts:7622-7632` queries `where("userId","==",ownerUid)` and would NOT return the team’s records (§E.1). The client-side `useGenerationHistory` hook queries by workspaceId but the rule strips out the team member’s docs from the owner’s view. No admin SDK path I found returns the team’s doc to the owner. |
| (e) A stale local cache from a prior session.                                                     | Possible. The hook uses `onSnapshot` which would surface a stale cached doc to the owner if (i) the SDK served it from cache AND (ii) the rule permitted it. The rule as written in this file does NOT permit it. |

So the data shape does not match the code that exists in this branch; the most likely cause is either (b) the sessions are sharing state not described in the report, or (c) the deployed `firestore.rules` is older than the repo file (the repo file was last touched 2026-07-31, commit `8672d66`, after which Phase 967 added the `creativeDeployments` rules but did not touch `generations`).

### §F.2 The architectural drift

Three persistence layers, three different rules of thumb for whose uid is the "writer":

| Subdomain                           | Path                                                          | uid written              | Code path                           |
|-------------------------------------|---------------------------------------------------------------|--------------------------|-------------------------------------|
| Meta deployment artefacts           | `creativeDeployments/{depId}`                                 | `scope.ownerUid`         | `resolveMetaScope` -> `metaPushCreativeImpl` |
| Saved projects                      | `users/{ownerUid}/projects/{projectId}`                       | `callerScope.ownerUid`   | `resolveCallerScope` -> `saveProject` |
| User preferences                    | `userPreferences/{userId}`                                    | `auth.uid` (caller)      | client-only write, one-doc-per-user |
| **Generations (rendered artefacts)** | **`generations/{auto-id}`**                                  | **`request.auth.uid`**   | **`saveGeneration(user.uid, ...)`** / `recordGenerationFailure({ uid: request.auth.uid, ... })` |

The `userId` field on a generations doc is therefore:

- For an owner generating: `ownerUid` (because `user.uid == teamOwnerUid == ownerUid` when no team).
- For a team member generating: `teamMemberUid` (their own uid, never the owner).

The expectation throughout the codebase is the owner’s uid. Comments assume so (`linkUnmatchedAd.ts:107-113`), filters assume so (`workspacePurge.ts:130-141`), the workspace-aware callable `getWorkspaceGenerations` queries for it (`index.ts:7624`), and even the team-member comment text at `firestore.rules:63-93` describes the equivalent expectation for `users/.../{workspaces,projects}`. **Only the writes disagree.**

### §F.3 What would make it converge

The minimum change that aligns generations with the rest of the codebase, with no rule change:

- **A.** Pass `effectiveUid` (or a freshly-resolved owner-side equivalent) to `feedbackService.saveGeneration` from every App.tsx call site, so `userId` on the doc is the owner uid.
- **B.** Mirror in server-side admin writes: replace `request.auth!.uid` with `resolveCallerScope(request.auth!.uid).ownerUid` in `recordGenerationFailure` and in the `culturalViolation` write at `index.ts:5058`. Pass `scope.ownerUid` instead of `request.auth.uid` to `saveBase64ToStorage` in `serverGenerateFinalAd` so the rendered image lands at `users/{ownerUid}/renders/...` (and the storage rule must be relaxed to allow the owner to read that image, mirroring the `creativeDeployments` precedent).
- **C.** Update the failure-record shape to write `userId` (not `uid`) so the Firestore rule matches.
- **D.** Either (a) move `saveGeneration` server-side so the auth uid is replaced before the write, or (b) accept that browsers cannot satisfy `request.auth.uid == ownerUid` and add an `allow write: if isTeamOf(userId)` exception to `firestore.rules:240-244`, symmetric to `users/{userId}` lines 5-9.

None of these are made here — this report is read-only.

---

## §G. File / line citations (consolidated)

Backend:
- `functions/src/index.ts:199-257` — `generateCreative` (no generation-side writes; only credit deduction).
- `functions/src/index.ts:199, 4590, 4648, 5028, 5170, 5529, 5571, 5616, 5669, 5704` — generation-callable exporters.
- `functions/src/index.ts:4094` — `metaPushCreative` (`resolveMetaScope(...)`).
- `functions/src/index.ts:4139-4169` — `recordGenerationFailure(uid: request.auth!.uid, ...).add(failureRecord)` to top-level `generations` collection. Failure record has `uid` field, NOT `userId`.
- `functions/src/index.ts:5058-5063` — `generations.add({ userId: request.auth.uid, ... })` for `culturalViolation`.
- `functions/src/index.ts:5169-5330` — `serverGenerateFinalAd` (storage upload at 5293 uses `request.auth.uid`).
- `functions/src/index.ts:7772-8000` — `saveProject` with `resolveCallerScope(uid)` at 7813, writes to `users/${ownerUid}/projects/...` at 7847.
- `functions/src/index.ts:7533-7668` — `getWorkspaceGenerations` callable; queries by `ownerUid` at 7624.
- `functions/src/workspaces/workspacePolicy.ts:339-438` — `resolveCallerScope`.
- `functions/src/workspaces/metaCallerScope.ts:78-103` — `resolveMetaScope` wrapper.
- `functions/src/workspaces/workspacePurge.ts:127-141` — cascade that filters `generations` by `userId == ownerUid`.
- `functions/src/savedProjects/getUserProjects.ts:39, 50` — `resolveCallerScope` + query by `ownerUid`.
- `functions/src/linkUnmatchedAd.ts:107-117` — check `genData.userId !== ownerUid`; comment claims `feedbackService.saveGeneration` runs in the owner’s context.
- `functions/src/generationDeleteCascade.ts:14-30` — comment confirming top-level path.
- `functions/src/resolutionTrace.ts:308-315` — `persistTrace(genId, trace)` writes via admin SDK.

Frontend:
- `src/services/feedbackService.ts:177-264` — `saveGeneration(userId, ...)`. Doc shape `{ userId, workspaceId, ... }` at lines 193-246. `addDoc(collection(db, "generations"), cleanRecord)` at line 254.
- `src/services/feedbackService.ts:267-290, 293-305, 602-641, 670-688` — other generation-doc operations.
- `src/services/geminiService.ts:13-23` — callable bindings; 576-609, 647-667, 691-727, 739-788 — payload shapes.
- `src/App.tsx:5889, 6503, 6843, 7236, 7557, 7613, 7703, 8215, 10214` — every `feedbackService.saveGeneration` call passes `user.uid`.
- `src/App.tsx:2512` — `effectiveUid = teamOwnerUid || user?.uid || null` (used elsewhere, not for `saveGeneration`).
- `src/App.tsx:6533-6534` — workspace fingerprint index correctly uses `effectiveUid`.
- `src/hooks/useGenerationHistory.ts:557-568` — workspace-mode query `where("workspaceId","==",workspaceId)` (no user filter, relies on rule).
- `src/hooks/useFavorites.ts:156-167` — same workspace-pattern read.

Rules / storage:
- `firestore.rules:240-245` — `generations` reads/creates/updates only when `userId == request.auth.uid`, no team-member bypass.
- `firestore.rules:5-9` — `users/{userId}` has a team-member bypass (not extended to `generations`).
- `firestore.rules:43-93` — `users/.../{avatars,projects,workspaces}` carry the same team-member bypass.
- `firestore.rules:258-262` — `creativeDeployments` userId-strict + server-write-only.
- `storage.rules:21-32` — `renders/<userId>/...` owner-only; `users/<userId>/renders/...` owner-only.

---

## §H. Status

This is a **read-only trace**. No code changes, no deployments, no PR. The asymmetry between §A.1 (generations = `request.auth.uid`) and the established `resolveCallerScope`/`resolveMetaScope` pattern is documented here so the next patch can pick a side (route generations through `resolveCallerScope` and store under the owner uid, or add a team-member exception to `firestore.rules:240-244`).
