# Claude Audit — ISSUE-D Full Diff (FINAL)

**Branch**: `fix/issue-d-team-workspace-access` · **PR** #58 · **Head** `ec967f8`
**Base**: `main` @ `3202682` · **Commits audited**: 14 (all, not Round 12 alone)
**Diff**: 32 files, +4076 / −323
**Date**: 2026-07-29
**Purpose**: final gate before `npm run dev` testing and merge

**Verdict**: **APPROVED WITH CONDITIONS** — 24 / 24 checks PASS. No blocking defect. Conditions are process items, not code fixes.

---

## Result summary

| Area | Checks | Result |
|---|---|---|
| Security | 1–4 | **4 / 4 PASS** |
| Data integrity | 5–8 | **4 / 4 PASS** |
| Frontend wiring | 9–12 | **4 / 4 PASS** |
| Revocation / removal | 13–14 | **2 / 2 PASS** |
| i18n | 15–18 | **4 / 4 PASS** |
| TypeScript / lint | 19–21 | **3 / 3 PASS** |
| Constitution / conventions | 22–24 | **3 / 3 PASS** |

**Gates re-run independently by this audit** (clean rebuild, `functions/lib` wiped first per AGENTS.md rule #1):

| Gate | Result |
|---|---|
| `cd functions; npm run build` | **PASS** (exit 0) |
| `cd functions; npm test` | **PASS** — full suite, `contractFixtures.test: PASS` |
| `npm run test:teamWorkspaceAccess` | **PASS** — A1–A9 + M1–M7 |
| `npm run build` (frontend) | **PASS** — `built in 16.67s`, pre-existing chunk warnings only |
| `npx eslint` (6 changed FE files) | **204 problems (197 err / 7 warn)** vs **208 (201 / 7)** on `main` → **4 fewer errors, no regression** |

---

## Security

### ✅ Check 1 — `getWorkspaceGenerations` after the Round 12 refactor — **PASS**

`functions/src/index.ts:6744-6809`. This was the highest-risk change in the branch and I traced every path.

**(a) Team membership still verified.** The inline member-doc lookup is gone, but the proof did not disappear — it moved into `resolveCallerScope` (`:6780`), which performs the same `users/{ownerUid}/team where uid == callerUid` query. Crucially, Round 9 changed the no-member-doc branch from a silent `{ ownerUid, allowedWorkspaceIds: [] }` return to an **explicit throw** (`workspacePolicy.ts:303-307`, `permission-denied / reason: membership_unproven`).

That detail is load-bearing. Had the old return-empty behaviour survived into this refactor, the new code would have been a **privilege-escalation hole**: `getWorkspaceGenerations` checks only `scope.ownerUid !== ownerUid` and never inspects `allowedWorkspaceIds`, so a caller who set `isTeamMember: true` + `teamOwnerUid: <victim>` on their own user doc with no member doc would have resolved to the victim's `ownerUid`, matched, and been granted the read. The Round 9 throw closes it at the source. I verified the callable re-raises it rather than swallowing: `if (err instanceof HttpsError) throw err` (`:6790`).

**(b) Cross-owner reads blocked with the right code.** `:6781-6786` — `scope.ownerUid !== ownerUid` throws `permission-denied` with `{ reason: "cross_owner" }`. Contract row A6 enforced explicitly rather than as a side effect.

**(c) `ownerUid` is derived, not trusted.** `:6759` takes it from `wsDoc.ref.parent.parent?.id` — the workspace document's own path via the collection-group query. The request payload supplies only `workspaceId`. A caller cannot assert an owner.

Path matrix, all traced:

| Caller | Resolves to | Outcome |
|---|---|---|
| Workspace owner | — (`uid !== ownerUid` guard skips the block) | allow |
| Verified member of this owner | `scope.ownerUid === ownerUid` | allow |
| `isTeamMember` flag, no member doc | throws `membership_unproven` | **deny** |
| Verified member of a *different* owner | `scope.ownerUid !== ownerUid` | **deny** `cross_owner` |
| Ordinary non-team user | `scope.ownerUid = callerUid ≠ ownerUid` | **deny** `cross_owner` |
| Admin SDK read failure | self-scope `ownerUid = callerUid ≠ ownerUid` | **deny** `cross_owner` |

### ✅ Check 2 — `resolveCallerScope` — **PASS**

`functions/src/workspaces/workspacePolicy.ts:256-327`.

**(a)** Returns `allowedWorkspaceIds: "ALL"` for a verified member (`:291`).
**(b)** Now also returns `storedWorkspaceAccess: string[]` (`:261` type, `:291` / `:312` / `:325` returns), consumed for the FR-004b trace at `index.ts:6804-6807` **without a second Firestore read**. The trace still fires only when the stored list is non-empty, so there is no per-request log spam for the ordinary empty case.
**(c)** The self-scope fallback does **not** weaken `getWorkspaceGenerations`. Two mechanisms:
  - The outer catch re-throws `HttpsError` first (`:320`), so `membership_unproven` propagates rather than degrading.
  - For genuine read failures it degrades to `{ ownerUid: callerUid, ... }` — but the callable then compares that against the workspace's real owner and denies with `cross_owner`. The callable additionally wraps the call in its own try/catch (`:6789-6799`) converting unexpected failures to `internal / auth_read_failed`, so a read failure surfaces to the client instead of silently becoming a denial with a misleading reason.

Fail-closed in every direction.

### ✅ Check 3 — `assertNotTeamMember` first after auth — **PASS (all six, not four)**

The contract expanded in Round 9 to cover the two Meta callables. All six verified:

| Callable | Region | Guard position |
|---|---|---|
| `createWorkspace` | `europe-west1` | first await, before the `request.data` payload check |
| `updateWorkspace` | `europe-west1` | first await, before `asObjectPayload` |
| `deleteWorkspace` | `europe-west1` | first await, before payload + workspace lookup |
| `restoreWorkspace` | `europe-west1` | first await, before payload + workspace lookup |
| `linkMetaAccountToWorkspace` | `europe-west1` | first await, before `asObjectPayload` |
| `unlinkMetaAccountFromWorkspace` | `europe-west1` | first await, before payload + `wsSnap.ref.update` |

In every case the only preceding statements are the `unauthenticated` throw and `const uid = request.auth.uid`. No validation, no lookup, no write precedes the guard.

### ✅ Check 4 — Firestore rules unchanged — **PASS**

Filtered the diff for any non-comment, non-blank changed line in `firestore.rules`: **zero**. The rule expression is byte-identical to `main` and still requires `isTeamMember == true` **and** `teamOwnerUid == userId` **and** `deletedAt == null`. `team/{memberId}` remains owner-read-only with `allow write: if false`. **No rules deploy required.**

---

## Data integrity

### ✅ Check 5 — stranded-member fix — **PASS**

`src/App.tsx:1903-1925`. `setUser(currentUser)` (`:1919`) and `setTeamResolution('resolved')` (`:1925`) are both **outside** the `if (ownerSnap.exists())` branch, with an explicit `else` (`:1911-1917`) falling back to zero credits / `'none'` plan / `'cancelled'` billing.

This was a genuine deadlock before the fix: a claimed member whose owner doc was missing or unreadable stayed `'pending'` forever, which meant the workspace listener never subscribed **and** `workspaceReady` blocked every write, with no recovery short of a manual reload. The fallback mirrors the existing-user path, so behaviour is consistent rather than special-cased.

### ✅ Check 6 — write gate — **PASS**

Derived at `App.tsx:2486`:
```ts
const workspaceReady = teamResolution === 'resolved' && (!canUseWorkspaces || activeWorkspaceId != null);
```
Three enforcement sites, matching contract rows W1–W3:

| Path | Line | Mechanism |
|---|---|---|
| Save avatar (`handleSaveAvatar`) | `:2083` | direct read |
| Save project (`saveCurrentProject`) | `:4094` | `workspaceReadyRef.current` |
| Generate (`handleApproveTov`) | `:5541` | direct read |

The ref mirror (`:4083-4084`) remains necessary — `saveCurrentProject` is captured by `useProjectAutoSave` through a ref, so a closure read would lock to the first-render `false`.

### ✅ Check 7 — image fingerprint path — **PASS**

`App.tsx:5873` builds from `workspaceOwnerUid = effectiveUid || user.uid`, so a member's write targets the owner's subtree. Owner behaviour unchanged (`effectiveUid === user.uid`).

### ✅ Check 8 — auto-save workspace attribution — **PASS**

This was the Critical finding from the previous round and it is properly closed.

The auto-save effect derives `resolvedWorkspaceId` from `activeWorkspaceId` (`:4198`) and lists it as a dependency (`:4242`). The fix removes the cause rather than patching the symptom: **the snapshot handler no longer advances `activeWorkspaceId` while work is in flight** (`:2568-2582`) — it only sets `pendingWorkspaceSwitch`. The queued snapshot therefore keeps the source workspace id, and no `workspaceId` override is needed anywhere.

`onSwitchGuardSave` (`:7682-7729`) then awaits `autoSaveForceFlush()` and branches on an explicit result:

- **Round 7 hardening is the important part.** `forceFlush` previously returned `void` and `doSave` caught internally, so the promise resolved even on a real save failure — the guard would have reported success on a lost save. `forceFlush` now returns `{ ok, error }` sourced from `doSave` on every path including the stale-snapshot catch (`src/lib/projectAutoSave.ts`).
- On `!result.ok` the handler shows `workspace.save_before_switch_failed` and **throws without clearing** `pendingWorkspaceSwitch` (`:7719-7721`). `WorkspaceSwitcher.handleGuardSave` (`:188-210`) catches, sets `saveOk = false`, and **returns early — no `onSwitch`**. The dialog stays open on the source workspace so the member can retry or cancel.
- Only the success path clears pending state and proceeds to the switch.

The no-fallback-workspace edge case (Round 7) is also handled: with unsaved work and no default to move to, `activeWorkspaceId` is deliberately **not** cleared (`:2583-2599`), because nulling it would let the auto-save effect drop the `workspaceId` entirely.

---

## Frontend wiring

### ✅ Check 9 — `WorkspaceSwitcher` — **PASS (a–e)**

| Sub-check | Evidence |
|---|---|
| (a) `isTeamMember` passed | `App.tsx:7670` — `teamResolution === 'resolved' && teamOwnerUid != null` |
| (b) create button hidden | `WorkspaceSwitcher.tsx:327` — `{!isTeamMember && !showLoadError && (` |
| (c) edit pencil hidden | `:311` — `{!isTeamMember && (` |
| (d) Escape uses a fresh closure | `:70-74` `handleGuardCancel` is `useCallback([onSwitchGuardCancel])`, hoisted **above** the effect; `:114-124` effect deps `[guardOpen, guardSaving, handleGuardCancel]` |
| (e) guard opens on transition | `:97-107` — opens on `switchGuardTarget` truthy, no id comparison |

(d) and (e) were both real defects in earlier rounds. (e) was the F1 dead-code bug — the old condition compared `switchGuardTarget` against a ref assigned during the same render, so it was always false. (d) was a stale closure from declaring the handler below the effect. Both are correctly fixed, and the `react-hooks/immutability` error that flagged the old ref is now **0** on this file.

Escape is also correctly suppressed while a save is in flight (`:118` — `&& !guardSaving`), as is the backdrop click.

### ✅ Check 10 — `WorkspaceSettingsModal` — **PASS**

**(a)** Delete gated at `:384` — `{isEdit && !workspace?.isDefault && onDelete && !isTeamMember && (`. Prop passed from `App.tsx:12362`.
**(b)** `onSave: (data) => void | Promise<void>` (`:16`) and `onDelete?: (id) => void | Promise<void>` (`:17`). This matters beyond tidiness: `handleSubmit` / `handleDelete` already `await` these and rely on rejection to drive `uiError`, so the `void`-only typing made the `await` invisible to the type system.

Beyond the checklist, Round 10 added defence in depth — inputs are `readOnly={isTeamMember}` (`:233`, `:245`, `:257`, `:277`), the colour control is `disabled` (`:270`), and the Meta section is hidden entirely (`:64`). A team member reaching the modal by any route sees a read-only view, not merely a hidden delete button.

### ✅ Check 11 — `Team.tsx` matrix — **PASS**

Matrix `<section>`, `handleWorkspaceAccessToggle`, `wsAccessLoading`, the `workspaces` list state, the workspace-listing effect, and the `fnSetTeamMemberWorkspaceAccess` binding are all removed. Only explanatory comments remain.

Data preserved per FR-021: no delete or migration anywhere in the diff; `workspaceAccess?: string[]` survives on the `TeamMember` interface, the callable stays deployed, and `workspacePurge.ts` still calls it.

### ✅ Check 12 — ISSUE-C team button — **PASS**

The menu lives in `App.tsx`, not a separate `MenuSidebar.tsx`:

- `App.tsx:1419` — `{ key: 'team', el: <MenuItem key="team" icon="fa-users" label={t('topbar.menu_team')} onClick={props.onTeam} /> }`
- `onTeam` threaded through the prop chain: `:1112` (type), `:1147` (destructure), `:1209` (pass-down), `:1366` (type)
- `:10926` — `onTeam={() => { setShowTeamModal(true); setShowMenuDrawer(false); }}`

`topbar.menu_team` present in both locales (`:141` en, `:1043` ar).

---

## Revocation / removal

### ✅ Check 13 — membership flips to false — **PASS**

`App.tsx`, inside the live user-doc listener, on `wasTeamMemberRef.current && !data.isTeamMember`:

| Required | Status |
|---|---|
| `workspaces` cleared | ✅ `setWorkspacesLocal([])` |
| `activeWorkspaceId` cleared | ✅ `setActiveWorkspaceIdLocal(null)` |
| `removedFromTeam` set | ✅ `setRemovedFromTeam(true)` |
| listener detached | ✅ `setTeamOwnerUid(null)` → `effectiveUid` changes → effect cleanup runs `unsubscribe` |

Clearing `teamOwnerUid` immediately rather than on the overlay's Continue button is the right call — teardown is synchronous with removal, not dependent on a click.

### ✅ Check 14 — active workspace deletion — **PASS**

`App.tsx:2562-2607`. The toast fires on **every** path (`:2567`), with the guard as an addition rather than an alternative — the inversion where the member with unsaved work was the only one moved silently is fixed. Three cases, all covered:

| Case | Behaviour |
|---|---|
| Fallback exists, work in progress | toast + `pendingWorkspaceSwitch` → guard dialog; `activeWorkspaceId` held on source |
| Fallback exists, no work | toast + immediate move |
| No fallback, work in progress | dedicated `workspace.removed_notice_no_target` key; `activeWorkspaceId` deliberately retained |
| No fallback, no work | dedicated key + safe clear |

Round 11 replaced a `'—'` substitution into the destination-specific string (which read "You have been moved to —.") with a dedicated no-target key. Correct call.

---

## i18n

### ✅ Check 15 — locale parity — **PASS. Nothing missing.**

**14 / 14 new keys present in both blocks** (`en:` line 8, `ar:` line 910), verified programmatically against the real block boundaries:

`team.continue_button`, `team.removed_body`, `topbar.menu_team`, `workspace.error.load_failed`, `workspace.error.load_failed_short`, `workspace.error.no_workspaces`, `workspace.error.no_workspaces_short`, `workspace.error.retry`, `workspace.refused.owner_only`, `workspace.removed_notice`, `workspace.removed_notice_no_target`, `workspace.save_before_switch_failed`, `workspace.switch_guard.saving`, `workspace.write_gate.loading`.

### ✅ Check 16 — no technical vocabulary — **PASS**

No `CTR`, `CPA`, `CPL`, `CPM`, `ROAS`, or "median" in any added string. No field names, system names, or error codes. Messages describe outcomes in ordinary language.

### ✅ Check 17 — Arabic is simple Fusha — **PASS**

All new Arabic strings are Modern Standard Arabic. Verb forms are correct MSA (`حاول مرة أخرى`, `تحقّق من الاتصال`, `جارٍ إكمال تجهيز`, `تعذّر إكمال حفظ عملك`). Diacritics are used sparingly and correctly (`تعذّر`, `جارٍ`, `يتطلّب`). No dialect forms, no Egyptian/Gulf colloquialisms, no untranslated English in the new strings.

### ✅ Check 18 — `workspace.error.no_access` deleted — **PASS**

`grep` returns **zero** occurrences in `src/i18n.tsx`. Removed from both locales, not merely orphaned. FR-019a satisfied.

---

## TypeScript / lint

### ✅ Check 19 — no new `any` — **PASS**

The only `any` in the diff is `async function doSave(data: any): Promise<FlushResult>` — and `data: any` is **pre-existing on `main`** (`git show main:src/lib/projectAutoSave.ts` line 86); only the return type was added. Round 12 fix #4 confirmed: `catch (err: unknown)` at `projectAutoSave.ts:135`, narrowed via `err instanceof Error ? err.message : String(err)`.

### ✅ Check 20 — no stale closures — **PASS**

The Escape handler is fixed (check 9d) and `react-hooks/immutability` is **0** on `WorkspaceSwitcher.tsx`.

Remaining `react-hooks` findings in `App.tsx` are **7 pre-existing `exhaustive-deps` warnings** (missing `showToast` / `t`, the house pattern) plus **1 pre-existing `rules-of-hooks` error at `:489`** — confirmed present on `main` by running ESLint there. None introduced by this branch.

### ✅ Check 21 — builds pass — **PASS**

Both green after a clean rebuild with `functions/lib` wiped. Lint on the changed frontend files is **4 errors better** than `main`.

---

## Constitution / conventions

### ✅ Check 22 — no module-level `admin.firestore()` — **PASS**

No module-scope assignment in `index.ts` or `workspacePolicy.ts`; every call sits inside a function body.

### ✅ Check 23 — `europe-west1` — **PASS**

**68 `onCall({` declarations, 68 with `region: "europe-west1"`.** No callable omits it.

### ✅ Check 24 — PowerShell syntax — **PASS**

No `&&` chaining in any documented command across the spec and report files. `quickstart.md` uses the `Run-Step` fail-fast wrapper, and Round 11 additionally hardened the `functions/lib` cleanup with `$ErrorActionPreference = "Stop"` plus a post-removal `Test-Path` re-check that aborts before building stale output.

---

## Observations (non-blocking, none affect the verdict)

**O1 — Meta callables log `action=update`.** `linkMetaAccountToWorkspace` and `unlinkMetaAccountFromWorkspace` both pass `"update"` to `assertNotTeamMember`, because the action enum is `create | update | delete | restore`. A refused Meta link is therefore indistinguishable in Cloud Logging from a refused workspace-detail edit. SC-011 asks which action was attempted; "update" is not wrong but is imprecise. Suggest widening the enum to `link_meta | unlink_meta`. Already on the deferred list in `round-12.md`.

**O2 — `cross_owner` and `membership_unproven` are not asserted by the test mirror.** Rows A5 and A6 assert `reasonCode: 'permission-denied'` but not the specific `reason` strings the production code now emits. The behaviour is right; the contract detail is untested. Low.

**O3 — the decision-table tests still mirror rather than import.** Unchanged from the previous audit's F5 and deliberate per `research.md` D9 — `resolveCallerScope` performs Firestore reads, so importing it needs mocking or emulators this project does not use. Worth restating: these assertions prove the decision table, not the implementation. Live behaviour is covered only by quickstart rows 1–3, 9–11 and 28–29 in production, which is why T036 is load-bearing.

**O4 — `functions/` ESLint does not run.** `functions/.eslintrc.js` sets `"indent": ["error", 2]` and other rules, but ESLint 9 ignores `.eslintrc.js` without flat-config migration — `npx eslint src/index.ts` throws rather than reporting. **No lint rule in `functions/` is currently enforced.** This predates the branch and explains the 4-space drift in `index.ts`. Worth its own task; it is a standing quality gap larger than the indentation it was noticed through.

**O5 — a stray rhetorical comment.** `WorkspaceSwitcher.tsx:200-202` contains "The parent has already cleared pendingWorkspaceSwitch? No — the parent's catch re-throws before the clear…". Self-answering question left in production code. Cosmetic.

**O6 — `round-12.md` is untracked.** `git status` shows `?? specs/965-team-workspace-access/reports/round-12.md`. It is referenced as release evidence but is not committed.

---

## Conditions for merge

**Before merge (process, not code):**

1. **Commit `round-12.md`** (O6). It is cited as the Round 12 evidence record but exists only in the working tree.
2. **Leave the unrelated deletion out.** `git status` also shows `D .agents/skills/shopify-expert/references/performance-optimization.md`, unstaged and unrelated to ISSUE-D. Do not let it ride along.

**Recommended, cheap:**

3. Widen the refusal action enum for the Meta callables (O1) — otherwise SC-011's "which action was attempted" is answered imprecisely for two of the six guarded paths.
4. Remove the rhetorical comment (O5).

**Unchanged and still required after merge:**

5. **`npm run dev` manual pass.** The highest-value rows given what changed late: **row 18** (owner deletes the member's active workspace — now has real save-then-switch semantics, plus the failure path that keeps the dialog open), **row 7a** (FR-017 guard), **rows 1–3 and 3a** (the core visibility fix), **row 19–20** (revocation with no console permission error), and **rows 21–23** (owner regression, SC-007). Also exercise the **ordinary** workspace switch — the deferred-switch change altered timing on that path too.
6. **Deploy per AGENTS.md rule #1**: `Remove-Item -Recurse -Force functions/lib` → `cd functions; npm run build` → `firebase deploy --only functions`. Deploy the server half **before** production-testing the frontend; rows 2 and 3 fail against the old server regardless of frontend correctness.
7. **T036 production test** of rows 1–3, 3a, 9–10, 19, 28–29. Rows 28–29 are the only proof the log lines are queryable in Cloud Logging — unverifiable locally.
8. The 11 documentation-polish items listed in `round-12.md` remain open. None are blocking.

---

## Assessment

Fourteen commits and twelve review rounds is a lot of churn for one blocker, and it is worth being clear about what that churn produced, because the trajectory is not obvious from the commit count.

The branch got **materially safer** as it went, and several rounds fixed defects that were more serious than the ones they were nominally about:

- **Round 9's `membership_unproven` throw** turned out to be what makes Round 12's refactor safe. Round 12 removed the inline membership check and replaced it with an `ownerUid` comparison that never inspects `allowedWorkspaceIds` — safe only because Round 9 had already converted the no-member-doc case from a permissive return into a throw. Two changes, three rounds apart, that had to agree. They do.
- **Round 7's `{ ok, error }`** exposed that Round 5's try/catch was decorative: `doSave` caught internally, so the promise always resolved and the guard would have reported success on a genuinely failed save.
- **Round 4's deferred switch** fixed silent mis-attribution of a member's work to a workspace they never opened — and incidentally corrected the same ordering flaw on the ordinary user-initiated switch path, which had it on `main`.
- **Round 12's stranded-member fix** removed a real deadlock with no user-side recovery.

The security posture is now **stronger than `main`**, not merely restored: the `teamOwnerUid` binding and the `membership_unproven` throw both close pre-existing gaps, and 68/68 callables carry the correct region. Frontend lint is 4 errors cleaner than `main`. Locale parity is exact at 14/14.

Nothing found in this audit blocks the merge. The conditions above are two process items and two cosmetic ones.

The one thing I would not skip is the manual pass. Every remaining risk in this branch is timing-dependent — save-then-switch ordering, listener teardown on removal, the resolution window before `workspaceReady` opens. Those are precisely the behaviours a type checker and a pure-function suite cannot see, and the decision-table tests mirror the policy rather than importing it (O3), so the server's live behaviour is genuinely unproven until row 2 passes against a deployed build.
