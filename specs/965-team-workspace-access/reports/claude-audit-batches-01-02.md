# Claude Audit — ISSUE-D Batches 01+02

**Branch**: `fix/issue-d-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Base**: `main` @ `3202682`
**Head**: `1853511` (3 commits: implementation + 2 CodeRabbit rounds)
**Date**: 2026-07-28
**Scope audited**: T001–T029 across 31 changed files (+2995 / −232)

**Verdict**: **APPROVED WITH CONDITIONS** — 1 HIGH functional defect must be fixed before merge. All security checks pass.

> **Round-20 (CodeRabbit re-review)**: This report is historical — the F1 HIGH defect it flagged has since been fixed by audit-fixes-report.md and subsequent rounds. **Superseded by**: `audit-fixes-report.md` and the rounds that followed. This report no longer represents current release status; do not use it as a gate.

---

## Verdict summary

| Area | Result |
|---|---|
| Security (checks 1–4) | **4 / 4 PASS** — no weakening; one boundary was *strengthened* |
| Data integrity (checks 5–7) | **3 / 3 PASS** |
| Frontend wiring (checks 8–11) | **4 / 4 PASS** |
| Revocation / removal (checks 12–13) | **1 PASS, 1 FAIL** — check 13 is the blocker |
| i18n (checks 14–16) | **3 / 3 PASS** |
| Constitution / conventions (checks 17–19) | **3 / 3 PASS** |

**Gate evidence re-run by this audit (not taken from the batch reports):**

| Command | Result |
|---|---|
| `cd functions; npm run build` | **PASS** (exit 0) |
| `cd functions; npm test` | **PASS** — full suite, `contractFixtures.test: PASS`; `teamWorkspaceAccess.test.js` confirmed wired into the `test` script |
| `npm run build` (frontend) | **PASS** — `built in 11.66s`, only pre-existing chunk-size warnings |
| `npx eslint` on the 5 changed frontend files | branch **200** problems (192 err / 8 warn) vs. main **201** (194 err / 7 warn) → **no error regression** (−2 errors, +1 warning; the +1 warning is finding F1 below) |

---

## Security (highest priority)

### ✅ Check 1 — `getWorkspaceGenerations` membership check preserved — **PASS**

`functions/src/index.ts:6748-6789`. The `memberQuery` lookup against `users/${ownerUid}/team` is intact at `:6774-6779`, and an empty result still throws `permission-denied` at `:6781`. Only the `workspaceAccess.includes(workspaceId)` narrowing was removed; it is replaced by the FR-004b override trace.

**The boundary was strengthened, not just preserved.** Round-2 #1 added a caller-doc binding *before* the member-doc lookup (`:6751-6764`):

```ts
const callerSnap = await admin.firestore().collection("users").doc(uid).get();
const callerData = callerSnap.data();
if (callerData?.isTeamMember !== true || callerData.teamOwnerUid !== ownerUid) {
    throw new HttpsError("permission-denied", "You don't have access to this workspace.");
}
```

This closes a real hole the old code had: a stale or second membership document under another owner could previously satisfy the member lookup on its own. Now the caller's *current* `teamOwnerUid` must match the workspace's owner. This is contract row A6 enforced in production code, not just in the test mirror.

No path exists where an authenticated non-member reaches workspace data. The `uid !== ownerUid` gate at `:6750` means owners are unaffected.

### ✅ Check 2 — `assertNotTeamMember` is the first statement in all four callables — **PASS**

| Callable | Line | Guard position |
|---|---|---|
| `createWorkspace` | `index.ts:6314` | `:6326` — immediately after `if (!request.auth)`, **before** the `request.data` payload check at `:6327` |
| `updateWorkspace` | `:6376` | `:6386` — before `asObjectPayload` / `requireNonEmptyString` |
| `deleteWorkspace` | `:6442` | `:6455` — before payload parse and workspace lookup |
| `restoreWorkspace` | `:6496` | `:6505` — before payload parse |

In every case the only preceding statements are the `unauthenticated` throw and `const uid = request.auth.uid`. No payload validation, no workspace lookup, no write precedes the guard. This satisfies contract `workspace-mutations.md` ("The guard runs **first**") and closes the highest-severity item in that contract — `createWorkspace` can no longer succeed into a member's own account (FR-012, SC-005).

The helper itself (`workspacePolicy.ts:196-234`) throws `permission-denied` with `{ reason: 'team_member' }`, never `not-found` (FR-011). Its Firestore read is wrapped in `.catch()` that rethrows as `internal` — a read failure **denies** rather than falling open. That is the correct fail-closed direction.

### ✅ Check 3 — every `resolveCallerScope` consumer handles `"ALL"` — **PASS**

Exhaustive consumer inventory (`grep` across `functions/src`, excluding tests) returns exactly **one** production consumer:

| Consumer | Handles `"ALL"`? |
|---|---|
| `savedProjects/getUserProjects.ts:39` | ✅ both call sites guard |
| `getWorkspaceGenerations` | N/A — does not read `allowedWorkspaceIds`; runs its own member-doc check (check 1) |

`getUserProjects.ts:42` — `if (allowedWorkspaceIds !== "ALL" && !allowedWorkspaceIds.includes(workspaceId))`
`getUserProjects.ts:57` — `else if (allowedWorkspaceIds !== "ALL" && allowedWorkspaceIds.length > 0)`

Both short-circuit before `.includes()` / `.length`. This matters concretely: `"ALL".length === 3` is truthy, so an unguarded `.length` check would have silently applied a `where('workspaceId','in',['A','L','L'])` filter and returned zero projects. The guard prevents it. The `slice(0, 30)` truncation is inside the non-`"ALL"` branch, so a member never hits the 30-workspace cap.

No consumer was missed.

### ✅ Check 4 — Firestore rules unchanged — **PASS**

`git diff main...HEAD -- firestore.rules` returns **empty**. The coarse-grained team-member read rule is byte-identical and still requires all three conditions:

```text
allow read: if request.auth != null
   && exists(/databases/$(database)/documents/users/$(request.auth.uid))
   && get(...).data.isTeamMember == true
   && get(...).data.teamOwnerUid == userId
   && resource.data.deletedAt == null;
```

`team/{memberId}` remains owner-read-only, `allow write: if false`. No rules deploy is required by this change.

> **Minor (F4)**: the comment block above the rule still reads *"Fine-grained per-member `workspaceAccess` filtering is enforced by the server callables (`getWorkspaceGenerations`, `setTeamMemberWorkspaceAccess`)"*. That is now false — the narrowing was deliberately removed. Documentation only; no behavioural effect.

---

## Data integrity

### ✅ Check 5 — write gate blocks generate / save project / save avatar — **PASS**

Gate derived at `App.tsx:2453`:
```ts
const workspaceReady = teamResolution === 'resolved' && (!canUseWorkspaces || activeWorkspaceId != null);
```
Matches `frontend-workspace-ui.md` rows W1–W3 exactly.

| Path | Line | Gated |
|---|---|---|
| Generate (`handleApproveTov`) | `:5412` | ✅ |
| Save project (`saveCurrentProject`) | `:3968` via `workspaceReadyRef.current` | ✅ |
| Save avatar (`handleSaveAvatar`) | `:2050` | ✅ |

The `workspaceReadyRef` mirror at `:3954-3955` is necessary and correct — `saveCurrentProject` is captured by `useProjectAutoSave` through a ref, so a closure read would lock to the first-render value (`false`) permanently. Reading through the ref keeps the gate live.

Downstream generation paths (`handleGenerateAB:3023`, `handleCarouselRender:6286`, `handleCarouselSlideRetry:6500`) are **not** separately gated, but each requires `selectedConcept`/`selectedTov` state that only exists after `handleApproveTov` has already passed the gate. No unguarded entry point found.

All three gate messages route through `t('workspace.write_gate.loading')` — present in both locales.

### ✅ Check 6 — image fingerprint write uses the owner's path — **PASS**

`App.tsx:5743-5744`:
```ts
const workspaceOwnerUid = effectiveUid || user.uid;
const indexRef = doc(db, `users/${workspaceOwnerUid}/workspaces/${activeWorkspaceId}/imageFingerprints`, ...);
```
Previously `users/${user.uid}/...` combined with an `activeWorkspaceId` belonging to the owner — a hybrid path that could never satisfy `isWorkspaceMember` and was silently dropped. Owner behaviour is unchanged (`effectiveUid === user.uid`).

### ✅ Check 7 — team members never trigger workspace auto-creation — **PASS**

`App.tsx:2545`:
```ts
if (wsList.length === 0 && !teamOwnerUid && !bootstrapInFlightRef.current) {
```
The `!teamOwnerUid` clause is the FR-013 gate — a team member with an empty owner list falls through to the U3 empty state and produces no write. The owner's bootstrap path is preserved.

`bootstrapInFlightRef` (Round-2 #14) is a genuine fix, not defensive noise: the retry trigger at `:7554` can re-run the effect while a first `createWorkspace` is still in flight, and without the guard two concurrent snapshot callbacks would each create a workspace. Set at `:2546`, cleared in `.finally()` at `:2571` on both success and failure.

Defence in depth holds: even if this client guard were bypassed, `assertNotTeamMember` refuses the callable server-side (check 2).

---

## Frontend wiring

### ✅ Check 8 — `WorkspaceSwitcher` props, create button, edit pencil — **PASS**

- `isTeamMember` passed from `App.tsx:7545`: `teamResolution === 'resolved' && teamOwnerUid != null`. Correctly requires resolution to have settled, so the flag is never read mid-resolution.
- `workspaceAccess` is **not** passed — correct per the contract. The prop was removed from the interface entirely and `visibleWorkspaces = activeWorkspaces` (`WorkspaceSwitcher.tsx:81`), so a member sees all active workspaces (FR-004).
- Create button: `WorkspaceSwitcher.tsx:236` — `{!isTeamMember && !showLoadError && (`. ✅ hidden (FR-009).
- Edit pencil: `:216` — `{!isTeamMember && (`. ✅ hidden (FR-010). An `aria-label` was added for owners, an accessibility improvement.
- Render guard relaxed at `App.tsx:7531` to `canUseWorkspaces && teamResolution === 'resolved'` — this is the C1 remediation from the pre-implementation analysis, correctly applied. Without it the U3/U5 states inside the switcher would be unreachable dead code.

### ✅ Check 9 — `WorkspaceSettingsModal` delete hidden — **PASS**

`WorkspaceSettingsModal.tsx:365`: `{isEdit && !workspace?.isDefault && onDelete && !isTeamMember && (`. Prop passed from `App.tsx:12181` with the same resolved-membership expression.

### ✅ Check 10 — Team.tsx matrix fully removed, data preserved — **PASS**

Removed: the `fnSetTeamMemberWorkspaceAccess` callable binding, the `WorkspaceInfo` interface, the `workspaces` + `wsAccessLoading` state, the workspace-listing `useEffect`, the `handleWorkspaceAccessToggle` handler, and the entire matrix `<section>` (~60 lines of table/toggle markup). The now-unused `query`/`where` imports were also cleaned from the Firestore import.

No grid, no toggles, no handler remain. Only explanatory comments.

**Data preserved (FR-021)**: no delete/migration anywhere in the diff. The `workspaceAccess?: string[]` field survives on the `TeamMember` interface (`Team.tsx:29`), the `setTeamMemberWorkspaceAccess` callable stays deployed, and `workspacePurge.ts` still calls it on workspace delete/restore. `resolveCallerScope` reads the stored array *only* to emit the FR-004b trace, never for authorization.

### ✅ Check 11 — live listener on the owner's path — **PASS**

`App.tsx:2496-2589`. `onSnapshot(wsQuery, …)` replaces `getDocs`; the unsubscribe is returned from the effect at `:2589`. Query is built at `:2493-2494` from `collection(db, 'users', uid, 'workspaces')` where `uid = effectiveUid` (`:2489`) — which resolves to `teamOwnerUid` for members.

Dependency array (`:2590`): `[user, effectiveUid, teamResolution, canUseWorkspaces, teamOwnerUid, workspaceLoadRetryTrigger]`. **This is the ISSUE-D root-cause fix.** The old array listed `effectiveUidRef.current` — a ref read, which never changes identity across renders, so the effect never re-ran when membership resolved. It now depends on the *state* value. The `teamResolution !== 'resolved'` early return at `:2490` prevents the first run from firing against the member's own uid.

`activeWorkspaceId` is deliberately excluded and read through `activeWorkspaceIdRef` (`:2508`) so manual switches don't tear down and re-subscribe the listener. Round-2 #4 correctly changed `:2573` to read the ref rather than the stale closure — without it, any write to the workspaces collection would have reverted the user's manual switch back to the default.

---

## Revocation / removal

### ✅ Check 12 — removal clears state and detaches the listener — **PASS**

`App.tsx:1986-1998`, inside the live user-doc listener, on `wasTeamMemberRef.current && !data.isTeamMember`:

| Required | Line | Status |
|---|---|---|
| `workspaces` cleared | `:1996` `setWorkspacesLocal([])` | ✅ |
| `activeWorkspaceId` cleared | `:1997` `setActiveWorkspaceIdLocal(null)` | ✅ |
| `removedFromTeam` set true | `:1987` | ✅ |
| listener detached | `:1994` `setTeamOwnerUid(null)` → `effectiveUid` changes → effect cleanup runs `unsubscribe` | ✅ |

Clearing `teamOwnerUid` immediately (rather than waiting for the overlay's Continue button) is the right call — it makes the teardown synchronous with the removal rather than dependent on a user click, satisfying FR-016's "within seconds without reloading". Because the unsubscribe runs before any further snapshot can arrive, no post-removal permission error should surface (quickstart row 20).

### ❌ Check 13 — active-workspace deletion guard — **FAIL** (see finding F1)

The "move to default" half works. The save/discard guard half is unreachable, and when in-progress work is present the member receives **no notice at all**.

---

## i18n

### ✅ Check 14 — every new key exists in both `en` and `ar` — **PASS**

10 new keys, all present in both blocks. **No missing keys.**

| Key | `en` | `ar` |
|---|---|---|
| `workspace.error.no_workspaces` | 825 | 1718 |
| `workspace.error.no_workspaces_short` | 826 | 1719 |
| `workspace.error.load_failed` | 827 | 1720 |
| `workspace.error.load_failed_short` | 828 | 1721 |
| `workspace.error.retry` | 829 | 1722 |
| `workspace.refused.owner_only` | 835 | 1723 |
| `workspace.removed_notice` | 838 | 1724 |
| `workspace.write_gate.loading` | 842 | 1725 |
| `team.removed_body` | 846 | 1726 |
| `team.continue_button` | 847 | 1727 |

The `{name}` placeholder in `workspace.removed_notice` is substituted via `.replace('{name}', …)` and is present in both locales.

The hardcoded English in the removal overlay (`App.tsx:11524`, `:11529`) is replaced with `t('team.removed_body')` and `t('team.continue_button')` — the Constitution V defect is closed.

### ✅ Check 15 — no technical terms in user-facing strings — **PASS**

No `CTR`, `CPA`, `CPL`, `CPM`, or "median" in any new string. No field names, system names, or error codes. `functions/npm run test:lang` (the project wording guard) passes per Batch 01/02 and the full `npm test` re-run in this audit includes `languageQuality.test.js` — green.

The strings describe outcomes in ordinary language: *"This account has no workspace yet"*, *"We could not load the workspace list right now"*, *"Only the account owner can add, change, or remove workspaces."*

### ✅ Check 16 — Arabic is simple Fusha — **PASS**

All 10 Arabic strings are Modern Standard Arabic with no dialect. Verb forms are correct MSA imperatives/verbal nouns (`حاول مرة أخرى`, `تحقّق من الاتصال`, `جارٍ إكمال تجهيز`). Diacritics used sparingly and correctly (`تعذّر`, `جارٍ`). No Egyptian/Gulf colloquialisms. No untranslated English terms in the new strings.

> Note: the pre-existing `workspace.error.limit_reached` retains the English word "Scale" (plan name) in the Arabic string. Pre-existing, outside this diff, and a proper-noun plan name — not flagged.

---

## Constitution / conventions

### ✅ Check 17 — no `admin.firestore()` at module top level — **PASS**

Every `admin.firestore()` call in `workspacePolicy.ts` is inside a function body (`:27`, `:46`, `:92`, `:122-123`, `:164`, `:204`, `:262`, `:268`, `:293`). Same in the `index.ts` additions (`:6751`, `:6774`). No module-level Firestore handle introduced.

### ✅ Check 18 — all functions in `europe-west1` — **PASS**

All four mutation callables carry `region: "europe-west1"` (`index.ts:6315`, `:6377`, `:6443`, `:6497`), as does `getWorkspaceGenerations`. No new callable was added by this change, so no new region declaration was needed.

### ✅ Check 19 — no direct git merge in terminal — **PASS**

`git log main..HEAD --merges` returns empty. Three linear commits, no merge commits. The branch is ready for a GitHub-UI merge.

---

## Findings

### F1 — HIGH — The active-workspace-deletion guard can never open, and the member is told nothing

**Files**: `src/components/WorkspaceSwitcher.tsx:56-68`, `src/App.tsx:2519-2536`
**Breaks**: T027, FR-017, AS-3.3, quickstart row 18 and row 7a
**Confidence**: Confirmed by trace; independently flagged by ESLint.

The snapshot callback in `App.tsx:2519-2530` performs the switch *first*, then queues the guard:

```ts
setActiveWorkspaceIdLocal(defId);                                  // :2523
if (hasInProgressWorkRef.current) {
  setPendingWorkspaceSwitch({ fromId: currentActive, toId: defId }); // :2526
} else {
  showToast(t('workspace.removed_notice')…);                       // :2531
}
```

The switcher then decides whether to open the dialog:

```ts
React.useEffect(() => {
  if (switchGuardTarget && switchGuardTarget !== activeWorkspaceIdRef.current) { … }
}, [switchGuardTarget]);
const activeWorkspaceIdRef = React.useRef<string | null>(null);
activeWorkspaceIdRef.current = activeWorkspaceId;   // ← assigned during render
```

**Trace:** React 18 batches both `setState` calls from the snapshot callback into one re-render. In that render `activeWorkspaceId` is already `defId`, and line 68 assigns `activeWorkspaceIdRef.current = defId` during the render phase — *before* effects run. The effect then evaluates `switchGuardTarget (defId) !== activeWorkspaceIdRef.current (defId)` → `false`. `switchGuardTarget` is non-null so the `else if` branch is also skipped. **Nothing happens.** Since `toId` is always the same value passed to `setActiveWorkspaceIdLocal`, the two are equal on every possible input — the dialog is unreachable dead code.

The comment at `:52-55` identifies precisely this hazard ("reading it here would short-circuit the guard before it opens") and then reintroduces it via the ref, because a render-phase ref assignment carries the same fresh value the excluded dep would have.

**User-visible consequence** — worse than a missing dialog. The toast is in the `else` branch, so a member with in-progress work whose active workspace is deleted by the owner gets **neither the guard nor the notice**: they are silently moved to the default workspace with no explanation. A member with *no* in-progress work is correctly notified. The failure is inverted — the case that most needs telling is the one told nothing.

ESLint flags the underlying pattern at `WorkspaceSwitcher.tsx:68` (`react-hooks/immutability`: *"Modifying a value used previously in an effect function or as an effect dependency is not allowed"*). This is the one new lint warning on the branch.

**Suggested fix** — capture the pre-switch id and compare against that, rather than against a ref that has already advanced:

```ts
// App.tsx — the parent already knows both ids; pass them through.
setPendingWorkspaceSwitch({ fromId: currentActive, toId: defId });

// WorkspaceSwitcher.tsx — open on the transition, not on an id comparison.
React.useEffect(() => {
  if (switchGuardTarget) {
    setPendingTarget(switchGuardTarget);
    setGuardOpen(true);
  } else {
    setGuardOpen(false);
    setPendingTarget(null);
  }
}, [switchGuardTarget]);
```

The `activeWorkspaceIdRef` then becomes unused and should be deleted, which also clears the lint warning. The existing `if (pendingTarget !== activeWorkspaceId) onSwitch(pendingTarget)` idempotence guards at `:108` and `:118` already handle the "parent already switched" case correctly, so no further change is needed there.

Also show the `workspace.removed_notice` toast on **both** branches — the member should be told the workspace is gone whether or not they have unsaved work.

**Sub-point to verify once the dialog opens**: `onSwitchGuardSave` (`App.tsx:7553`) is `() => setPendingWorkspaceSwitch(null)` — it performs no save, while the button reads *"Save & Switch"* / *"احفظ وبدّل"*. On `main` this prop was not passed at all and the user-initiated path relied on the auto-save queue, so this is not a regression — but with the dialog reachable for the first time, confirm the auto-save has actually flushed before the switch, or wire an explicit save. Worth one line in the quickstart.

---

### F2 — MEDIUM — `workspace.error.no_access` still carries the forbidden copy

**File**: `src/i18n.tsx:823` (en), `:1716` (ar)
**Breaks**: FR-019a as written; quickstart row 27 ("retired or rewritten")

The string *"No workspace access — ask your team owner to grant you access."* / *"اطلب من مالك الفريق منحك الصلاحية"* is still defined in both locales. FR-019a requires it be withdrawn or rewritten, because under FR-004 access is automatic and the owner has no control to grant with — the message sends the member to the owner for something the owner cannot do.

**Mitigating**: a full grep confirms **zero references** outside the two dictionary definitions. The key is unreachable, so no user can see it today. The intent of FR-019a is met in behaviour; the literal requirement is not met in the source.

**Fix**: delete both lines. The T015 comment claims the key is kept as "an audit cross-reference" — but the spec, contract, and this report already record it, and a live dictionary is a poor place for an artefact that must never render. Leaving it invites a future re-reference.

---

### F3 — LOW — `workspace.refused.owner_only` is defined but never rendered

**File**: `src/i18n.tsx:835` (en), `:1723` (ar)

T024 added the refusal copy in both locales, but a grep shows no call site. Any caller who reaches the guard sees the server's `HttpsError` message instead — *"Only the account owner can add, change, or remove workspaces."*, **English only**, from `workspacePolicy.ts:230`.

**Impact is currently nil**: team members have no create/edit/delete control in the UI (checks 8 and 9), so the only way to reach these callables is a direct invocation outside the interface — which is exactly what quickstart rows 9–11 do, and those are operator tests, not user journeys. No Arabic-speaking user can currently be shown the English string.

**Fix (either is acceptable)**: map `reason: 'team_member'` to `t('workspace.refused.owner_only')` in the callable error handler, or add a comment marking the key as reserved for the deferred role-based-editing spec. Do not leave it silently orphaned.

---

### F4 — LOW — Stale comment in `firestore.rules`

The comment above the workspaces match block still describes `workspaceAccess` fine-grained filtering as an active enforcement layer. That narrowing was deliberately removed by T008. Update the comment to describe the current three-layer position (rules coarse-grained → callable membership + `teamOwnerUid` binding → frontend), or the next reader will look for enforcement that no longer exists.

---

### F5 — LOW — Decision-table tests mirror the policy rather than importing it

`functions/src/__tests__/teamWorkspaceAccess.test.ts:47` reimplements `resolveCallerScope` as a local pure function; the header comment says so plainly and points at the live source. This is the project's established pure-function simulation style and was the agreed approach (`research.md` D9, `tasks.md` preamble), so it is **not** a spec violation.

It is worth recording the limitation: these 30+ assertions prove the *decision table* is right, not that `workspacePolicy.ts` implements it. A future edit to the live function would not fail this suite. The live behaviour is covered instead by quickstart rows 1–3, 9–11 and 28–29 — which is why T036's production test is load-bearing and must not be skipped.

---

## Conditions for merge

**Blocking:**

1. **Fix F1.** Both halves: make the guard dialog reachable, and show the removal notice on both branches. Re-verify quickstart rows 18 and 7a manually.

**Before merge (cheap, low risk):**

2. Delete the two `workspace.error.no_access` lines (F2).
3. Resolve `workspace.refused.owner_only` — wire it or mark it reserved (F3).
4. Refresh the stale `firestore.rules` comment (F4).

**Unchanged from the plan — still required after merge:**

5. T035 deploy to `europe-west1`. Deploy the server half **before** production-testing the frontend; rows 2 and 3 fail against the old server no matter how correct the frontend is.
6. T036 production test of rows 1–3, 3a, 9–10, 19, 28–29. Rows 28–29 are the only proof the log lines are queryable in Cloud Logging — that format is unverifiable locally.
7. T033's full 30-row matrix and T031 locale parity remain outstanding per the Batch 03 plan.

---

## What this change gets right

Worth recording, because the review found no shortcuts in the parts that mattered most:

- **The root cause was actually fixed, not worked around.** The ref-in-dependency-array defect is repaired at both sites (`:2590` workspaces, `:2039` avatars) by depending on state rather than a ref read. A lesser fix would have added a `setTimeout` or a polling retry.
- **The server half is present.** The D1 research finding — that the server independently narrows a member to an empty stored list — was acted on. A frontend-only fix would have shipped a picker full of empty workspaces and looked like success in a demo.
- **The security boundary moved in the safer direction.** Round-2 #1's `teamOwnerUid` binding closes a stale-membership hole that predates this feature and was not in the original brief.
- **Fail-closed choices throughout.** `assertNotTeamMember` denies on read failure; `resolveCallerScope` degrades to self-scope, never to another account; the client auto-create guard is backed by an independent server refusal.
- **Three defects outside the original brief were found and fixed**: `createWorkspace` succeeding into the member's own account, the wrong-account fingerprint write at `:5743`, and the hardcoded English removal overlay.

---

## Verdict

**APPROVED WITH CONDITIONS.**

All four security checks pass, and one boundary is materially stronger than before. Data integrity, frontend wiring, i18n parity, and every constitution/convention check pass. Builds and the full test suite are green, re-run independently by this audit, with no lint error regression.

The single blocking defect (F1) sits in US3 — the P2 live-updates story — not in the P1 blocker that gates Phase 14. US1 and US2 are sound. If schedule pressure demands it, F1 is separable: it affects only the owner-deletes-the-member's-active-workspace case, and no data is lost when it fires (the member is moved to the default, not stranded). But it ships a silent state change to a user with unsaved work, which is precisely what FR-017 exists to prevent — so it should be fixed now rather than deferred.

F2–F4 are ten minutes of work and should ride along in the same commit.
