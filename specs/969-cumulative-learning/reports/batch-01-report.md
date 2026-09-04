# Batch 01 — `whatsWorkingDashboard` + `linkUnmatchedAd` caller-scope conversion

**Worktree:** `D:\proads-worktrees\cumulative-learning`
**Branch:** `969-cumulative-learning`
**Scope:** Phase 967 caller-scope conversion of two Meta-touching callables
that were missed by the original Issue-D rollout. No behaviour change for
owners; the bug fix is that a team member's call now resolves to the
owner's `users/{ownerUid}/...` path instead of the member's empty
`users/{memberUid}/...`.

---

## 1. Files changed

### Conversion (same fix pattern)

| File | Pre-fix behaviour (raw `request.auth.uid`) | Post-fix behaviour (`scope.ownerUid`) |
|---|---|---|
| `functions/src/whatsWorkingDashboard.ts` | `users/{uid}/workspaces/{wid}` | `users/{ownerUid}/workspaces/{wid}` |
| `functions/src/linkUnmatchedAd.ts` | `users/{uid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}` | `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}/adPerformance/{adId}` |

Both follow the same shape:
1. Add `resolveMetaScope` / `assertWorkspaceAllowed` from
   `workspaces/metaCallerScope.ts` (already the canonical resolver for
   every other Meta-touching callable).
2. Extract `*Impl(scope, requestData)` so the structural guard test can
   drive it with a fake `scope` + an in-memory Firestore stub.
3. Production `onCall` wrapper trivially delegates: scope first, then
   impl. The legacy `if (!request.auth) throw ...` is removed because
   `resolveMetaScope` rejects unauthenticated callers itself.

### Test files added

- `functions/src/__tests__/whatsWorkingDashboardScope.test.ts` — guards
  `getWhatsWorkingDashboardImpl` + `getHookAnglePerformanceImpl`
  (13 tests).
- `functions/src/__tests__/linkUnmatchedAdScope.test.ts` — guards
  `linkUnmatchedAdImpl` (11 tests). New in this batch.

Both files are structural: they record every Firestore path the impl
touches and fail if any path contains the caller's uid, fail if any
`users/...` path is not the owner's, and fail if an out-of-scope
workspace is not refused before any read.

### Test manifest registration (FR-050)

- `functions/package.json` `test:whatsWorkingScope` script added
  (chained `whatsWorkingDashboard.test.js` +
  `whatsWorkingDashboardScope.test.js`).
- `functions/package.json` `test:linkUnmatchedScope` script added
  (single `linkUnmatchedAdScope.test.js`).
- `functions/package.json` main `test` script extended to include
  `whatsWorkingDashboard.test.js`,
  `whatsWorkingDashboardScope.test.js`, and
  `linkUnmatchedAdScope.test.js`. **Before this batch, all three were
  absent from the runner manifest** — the exact failure mode FR-050
  guards against, on a surface this batch modifies.

### Companion frontend changes (carried from prior session, same branch)

- `src/components/WhatsWorkingDashboard.tsx` — `console.error` added
  before the catch's `setError(...)` so a 404 caller-scope failure is no
  longer discarded by `void e`. The catch no longer collapses onto the
  same string as the empty-data branch.
- `src/i18n.tsx` — new `whats_loading.empty` key in English and Fusha
  Arabic; the existing `whats_loading.error` was rewritten to mention
  retry rather than the old generic "Could not load the dashboard."

### Lockfile bump

- **None.** The `.opencode/package-lock.json` change (dev-shell
  `@opencode-ai/plugin` 1.18.15 → 1.18.25, autopulled by the tooling)
  was originally staged with this batch and then dropped on review:
  `.opencode/` is excluded from every prior PR on this project, the
  bump is non-runtime, and the canonical pattern for that exclusion
  is "do not commit it" rather than "revert after commit". Not in
  the final tree of `398c8c2` / `2ba7ee0`.

---

## 2. Test run — raw output verbatim

`npm run build` (functions):

```
> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/
```

Exits 0. No diagnostics. New test file emits to
`lib/__tests__/linkUnmatchedAdScope.test.js`.

`node lib/__tests__/linkUnmatchedAdScope.test.js`:

```
linkUnmatchedAd — Phase 967 caller-scope conversion

  ✓ every exported *Impl in the module is covered by this test
  ✓ team-member caller: resolves to the owner (no throw, write succeeds)
  ✓ team-member caller: write lands under the OWNER, not the member
  ✓ team-member caller: never touches a path containing the caller uid
  ✓ team-member caller: every user path it touches is the owner's
  ✓ owner calling for themselves still works
  ✓ workspace outside the caller's scope is refused
  ✓ rejects a malformed request before any read
  ✓ cross-workspace generation is refused (FR-023 closure)
  ✓ missing generation is refused with not-found
  ✓ generation belonging to a different OWNER is refused

============================================================
linkUnmatchedAdScope tests: 11 passed, 0 failed
============================================================
```

`node lib/__tests__/whatsWorkingDashboardScope.test.js`:

```
whatsWorkingDashboard — Phase 967 caller-scope conversion

  ✓ every exported *Impl in the module is covered by this test
  ✓ getWhatsWorkingDashboardImpl: a team-member caller resolves to the owner (no throw)
  ✓ getWhatsWorkingDashboardImpl: never touches a path containing the caller uid
  ✓ getWhatsWorkingDashboardImpl: every user path it touches is the owner's
  ✓ getWhatsWorkingDashboardImpl: an owner calling for themselves still works
  ✓ getWhatsWorkingDashboardImpl: a workspace outside the caller's scope is refused
  ✓ getWhatsWorkingDashboardImpl: rejects a malformed request before any read
  ✓ getHookAnglePerformanceImpl: a team-member caller resolves to the owner (no throw)
  ✓ getHookAnglePerformanceImpl: never touches a path containing the caller uid
  ✓ getHookAnglePerformanceImpl: every user path it touches is the owner's
  ✓ getHookAnglePerformanceImpl: an owner calling for themselves still works
  ✓ getHookAnglePerformanceImpl: a workspace outside the caller's scope is refused
  ✓ getHookAnglePerformanceImpl: rejects a malformed request before any read

============================================================
whatsWorkingDashboardScope tests: 13 passed, 0 failed
============================================================
```

`node lib/__tests__/whatsWorkingDashboard.test.js` (last 6 lines):

```
ok 13 - count strings: include {used} placeholder for the runtime value
ok 14 - spend label: 7-day phrasing, currency-aware formatting (USD prefix, others suffix)
1..14
# tests 14
# pass 14
# fail 0
```

`node lib/__tests__/metaScope.integration.test.js` (regression check —
not modified this batch):

```
metaScope.integration tests: 6 passed, 0 failed
```

### Test-name vs assertion reconciliation (AGENTS.md rule 0b, half 1)

Every `✓` line above was walked against the assertion in its `run` body.
Zero contradictions. Spot examples:

- *"team-member caller: write lands under the OWNER, not the member"* →
  asserts `bucket('users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance').get(AD).matchType === 'manual'`
  AND
  `bucket('users/${MEMBER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance')?.get(AD) === undefined`.
  Name, body, and direction agree.
- *"cross-workspace generation is refused (FR-023 closure)"* →
  rejects with `permission-denied | /different workspace/i` AND
  asserts no `matchType: 'manual'` was written on the owner doc.
  Name, body, and direction agree.
- *"every exported *Impl in the module is covered by this test"* →
  asserts `Object.keys(mod).filter(/Impl$/)` deep-equals the IMPLS
  array literally declared in the file. Name and body agree; this is
  the structural guard against the file growing a third *Impl that
  silently skips the conversion (the same shape failure mode as the
  one this batch fixes).

### Section reconciliation (AGENTS.md rule 0b, half 2)

Headline delta this batch, against the previous branch state:

| File | Net tests added |
|---|---|
| `whatsWorkingDashboardScope.test.ts` (new file, added in earlier session on this branch) | +13 |
| `whatsWorkingDashboard.test.ts` (pre-existing file, now in the runner manifest per FR-050) | +14 (now reachable) |
| `linkUnmatchedAdScope.test.ts` (new file, this batch) | +11 |

Three legs, all pass:
- **(a)** Per-fixture index agreement — the runner output above names
  the exact tests this section enumerates, in the same order.
- **(b)** Per-file delta arithmetic — 13 + 14 + 11 = **38 tests
  added or surfaced**, no other test files modified by this batch.
- **(c)** Total arithmetic — runner totals:
  - `whatsWorkingDashboardScope`: 13 pass, 0 fail
  - `whatsWorkingDashboard`: 14 pass, 0 fail
  - `linkUnmatchedAdScope`: 11 pass, 0 fail
  - `metaScope.integration` (regression): 6 pass, 0 fail

  Total: **44 pass / 0 fail** across the four files this batch
  touches. The "headline +38 added" is a per-batch delta; the "44 pass
  right now" is the per-run total. They are not the same number and
  are not intended to be.

---

## 3. Why `linkUnmatchedAd` was added to this batch (not deferred)

The user's approval note named this file explicitly. The blast radius
is small (one dashboard surface), but the precedence rule in spec §4.3
makes it load-bearing:

> "A manual link is AUTHORITATIVE and LOCKED. Auto-match NEVER
> overrides an existing link."

If the auto-match worker has been producing `matched: 0` on every sync
snapshot (as the spec narrative records), manual linking is the only
path that can produce a matched ad. The pre-fix behaviour for a team
member calling `linkUnmatchedAd`:

1. Built `users/{memberUid}/workspaces/{wid}/.../adPerformance/{adId}`
   (an empty path — the member has no workspaces of their own).
2. The `existingSnap.exists` branch was therefore always false.
3. The else branch wrote a brand-new manual-link record on the
   MEMBER's identity, on the OWNER's workspace.
4. The `genData.userId !== uid` ownership check on the generation doc
   (line 66, pre-fix) compared against the member's uid — which never
   matched because generations are stored under the **owner's**
   userId (the owner is the auth context that created them). So the
   call also threw `permission-denied` even on the legitimate path.

Net effect: a verified team member on the owner's workspace could
neither produce nor restore a matched ad. The dashboard's "unmatched"
picker would error out silently.

The fix preserves all of that, except:

1. The path is `users/{ownerUid}/...` and finds the real existing ad
   record (or creates one on the owner's identity).
2. The generation-ownership check compares against `scope.ownerUid`,
   which the owner actually matches.
3. The audit signal — which team member initiated the link — is
   recorded explicitly as `matchedByUid: scope.callerUid` on the ad
   performance doc (additive — see `linkUnmatchedAd.ts:121`,
   `:135`).

The behavioural contract for owners is unchanged. Verified team
members are now able to do what the dashboard picker has always
exposed as an action.

### 3.1 Did manual linking get stricter? Per-refusal audit

The three refusal tests added by `linkUnmatchedAdScope.test.ts`
("cross-workspace generation is refused", "missing generation is
refused with not-found", "generation belonging to a different OWNER
is refused") correspond to lines 60–71 of the pre-fix file. Each is
walked against the pre-fix source — `git show HEAD~1:functions/src/linkUnmatchedAd.ts`
— to determine whether the refusal is new or pre-existing.

**Refusal 1: cross-workspace generation.** **Pre-existing, unchanged.**
Pre-fix lines 60–65:

```ts
if (typeof genData.workspaceId === "string" && genData.workspaceId !== req.workspaceId) {
    throw new HttpsError("permission-denied", "This generation belongs to a different workspace.");
}
```

Post-fix is identical (same condition, same error code, same message
— `linkUnmatchedAd.ts:81–87`). Net effect on callers: zero. No
caller that was refused before is now allowed, and no caller that
was allowed before is now refused. **Manual linking did not get
stricter on this axis.**

**Refusal 2: missing generation.** **Pre-existing, unchanged.**
Pre-fix lines 49–54:

```ts
if (!genSnap.exists) {
    throw new HttpsError("not-found", "This generation does not exist.");
}
```

Post-fix is identical (`linkUnmatchedAd.ts:70–74`). Net effect on
callers: zero. The ordering shifted (now runs after
`assertWorkspaceAllowed`), but the existence check itself is byte-for-
byte the same. **Manual linking did not get stricter on this axis.**

**Refusal 3: generation owned by a different OWNER.** **Pre-existing
in shape; re-keyed against the right identity.** Pre-fix lines 66–71:

```ts
if (typeof genData.userId === "string" && genData.userId !== uid) {
    throw new HttpsError("permission-denied", "This generation does not belong to the current user.");
}
```

Post-fix (`linkUnmatchedAd.ts:88–94`) is the same condition with two
changes:

```ts
if (typeof genData.userId === "string" && genData.userId !== ownerUid) {
    throw new HttpsError("permission-denied", "This generation does not belong to the current account.");
}
```

  - Comparison target: `uid` → `ownerUid` (resolved-scope owner).
    This is the Phase 967 fix.
  - Error message: "the current user" → "the current account" (so
    a team member on the owner's workspace is not told the generation
    does not belong to *them* — it belongs to the account they are
    acting on).

The refusal logic for **a third-party OWNER** (a generation whose
`userId` is neither the caller nor the resolved owner) is unchanged:

  - Pre-fix, owner caller: `genData.userId = "third", uid = OWNER` →
    throws. Post-fix, owner caller: `genData.userId = "third",
    ownerUid = OWNER` → throws. **Identical outcome.**
  - Pre-fix, team-member caller: `genData.userId = "third",
    uid = MEMBER` → throws. Post-fix, team-member caller:
    `genData.userId = "third", ownerUid = OWNER` → throws.
    **Identical outcome.**

The one case whose behaviour differs is **owner-keyed generation,
team-member caller**:

  - Pre-fix: `genData.userId = OWNER, uid = MEMBER` → throws (the
    bug — a legitimate team-member path was refused because the
    caller's uid did not match the owner's generation's userId).
  - Post-fix: `genData.userId = OWNER, ownerUid = OWNER` → does NOT
    throw (the fix — the team member is acting on the owner's
    account, the check is now against the right identity).

**That is the only behavioural divergence on this axis, and it
loosens the refusal, it does not tighten it.** Manual linking got
*less* strict in exactly one case — the legitimate team-member path
that was the actual bug this batch is fixing. No caller that was
refused before for a third-party-owner reason is now allowed.

**Net answer to the user's question.** Manual linking is **not**
stricter than before. The three refusals either (a) were already
refusing the same case with the same error, or (b) are the same
refusal re-keyed against the resolved owner. The new behaviour
unblocks the team-member path that the old behaviour accidentally
refused. The only path that now succeeds where it previously failed
is the one the dashboard picker has been exposing all along.

---

## 4. Judgement-call callables — REPORTED, NOT CHANGED

Three callables surfaced during the audit that **use `request.auth.uid`
directly without going through `resolveMetaScope` and without an
explicit owner gate**. For each, this section reports (a) what it does
with the raw uid, (b) whether a team-member caller fails loudly or
silently, and (c) whether the absence of an owner gate looks deliberate
or missed. No code change is proposed in this batch — the user
explicitly deferred the decision.

### 4.1 `updateWorkspace` — `index.ts:7105`

**What it does with the raw uid.** Reads `request.auth.uid` as `uid`,
then immediately calls `assertNotTeamMember(uid, "update")` at
`index.ts:7115`, and then `assertOwner(request.auth, workspaceId)` at
`index.ts:7171` (the latter reads `users/{uid}/workspaces/{wid}`).

**Loud vs silent for a team member.** **Loud.** `assertNotTeamMember`
throws `permission-denied` with `reason: 'team_member'` from the very
first statement after auth — before any payload validation, workspace
lookup, or Firestore read. The log line
`⚠️ issue-d ▸ workspace action refused — action=update caller=<…>`
fires. No writes happen. The dashboard does not silently fail.

**Deliberate or missed.** **Deliberate.** The guard is present, named,
and uses the same `assertNotTeamMember` helper as the other three
owner-only workspace mutation callables (`createWorkspace`,
`deleteWorkspace`, `restoreWorkspace`). The pre-967 pattern was
retained on purpose; the caller-scope conversion (the dashboard
fix above) is a separate concern that does not need to touch this
file. Recommend leaving alone.

### 4.2 `setTeamMemberWorkspaceAccess` — `index.ts:7558`

**What it does with the raw uid.** Reads `request.auth.uid` as `uid`,
then reads and writes `users/{uid}/team/{memberDocId}` and
`users/${uid}/workspaces/${wsId}` (lines 7582, 7606, 7615). The
`team` subcollection is the OWNER's team — team-member docs live under
the owner, not under the team members themselves.

**Loud vs silent for a team member.** **Silent.** No
`assertNotTeamMember`, no `resolveMetaScope`. A team-member call would
read `users/${memberUid}/team/...` (their OWN empty collection),
`get()` returns `not-found`, and the callable throws `not-found`
("Team member not found."). The dashboard renders this as a generic
"could not update" — indistinguishable from "that team member really
doesn't exist on the owner's account." No write happens, but no log
line fires, no `reason` is attached, and the symptom is not an
authorization verdict.

**Deliberate or missed.** **Missed.** The function's purpose is to
let the owner grant/revoke a team member's workspace access. A team
member managing their own access list is not a coherent operation —
team membership is owner-side state, and the only intended caller is
the owner. The other five owner-only workspace-mutation callables all
carry the `assertNotTeamMember` guard; this one was added before that
guard became the convention. The fix is one line: add
`await assertNotTeamMember(uid, "update");` (or a new `"team_access"`
action string — the existing `"update"` value reuses the action
already used by `updateWorkspace` and is a worse Cloud Logging
distinction).

**Risk if left in place.** A team member on the owner's account who
trips this surface sees a generic not-found. They cannot deduce
whether the team member is real or whether the call is denied — which
is also why it should not be left as is: silent not-found is
diagnostically worse than `permission-denied`, and the existing
`teamWorkspaceAccess.test.ts` decision table for "team member calls
team-management" returns `permission-denied | reason=team_member` for
exactly this scenario. The audit path disagrees with the call site.

### 4.3 `triggerVaultExtraction` — `index.ts:6036`

**What it does with the raw uid.** Reads `request.auth.uid` as
`userId`, then reads and writes `principleVaults/${userId}/pendingSignals/${generationId}`
and `principleVaults/${userId}` (lines 6051-6052, 6055, 6062). The
vault is keyed by **the calling uid**, not by an owner.

**Loud vs silent for a team member.** **Silent AND incorrect.** A
team member's call would write to `principleVaults/${memberUid}/pendingSignals/${generationId}`
— under their own identity, on the owner's account. The signal
would be stored; extraction would never fire because no other call
ever writes to a `principleVaults/${memberUid}` namespace (the
feedback signal that triggers extraction is generated on the owner's
side by `feedbackService.recordFeedback`, which is owner-keyed). The
write is a no-op that quietly accumulates a stale queue.

**Deliberate or missed.** **The KEYING is deliberate; the OWNER-GATE
absence is missed.** The vault is a personal, per-uid store by design
— positive/negative feedback on the user's own generations feeds
their own vault. That is the product intent. But:

  - The other five callables in this group (the dashboard fix, the
    link picker, etc.) all surface signals that a team member may
    legitimately originate; it is unclear whether a team member's
    thumbs-up on a generation should feed the OWNER's vault
    (per-account, as designed) or the MEMBER's vault (per-caller).
  - The current behaviour, with no gate, is a silent mix: a team
    member's signal writes to `principleVaults/${memberUid}` and is
    never read back. The user's intent cannot be inferred from the
    code; this is the symptom the user wants to decide on.

**Three plausible fixes, each with a different blast radius.**

  1. **Owner-gate (closest to the dashboard pattern).** Add
     `assertNotTeamMember(userId, "update")`. A team member on the
     owner's workspace cannot contribute feedback to the vault.
     Cheap, consistent with the other callables; excludes team
     members from a feature that the dashboard exposes to them.
  2. **Owner-keying (closest to the loader behaviour).** Replace
     `userId` with `scope.ownerUid` via `resolveMetaScope`. A team
     member's signal feeds the OWNER's vault, attributed to
     `pendingSignals/${generationId}.signalledByUid = callerUid`.
     Consistent with the broader "team member writes under owner's
     namespace, audit signal records the team member" pattern;
     matches what `linkUnmatchedAd` does in this same batch.
  3. **Leave as-is (status quo).** Owner-keyed on input (because the
     input is owner-side feedback), member-keyed on output (because
     the queue is keyed by the calling uid). Will continue to
     silently accumulate a dead-letter queue when called by team
     members. Not recommended.

Option 2 is what `linkUnmatchedAd` does in this same batch, and the
report flags it as the consistency-preserving choice. **No change in
this batch** — left for the user to decide.

---

## 5. Deferred callables (recorded, not changed)

These surfaced during the audit but are explicitly **not in this
batch**. They are recorded here so the next pass through the
caller-scope audit has the starting point.

### 5.1 `serverGenerateConcepts` — `index.ts:4777`

Uses `request.auth.uid` for `enforceGenerationEntitlement` and for
`loadTopWinners(request.auth.uid, _wsId, conn.accountId)` (lines 4789,
4806). The entitlement check is per-user (correct); the top-winners
load is per-owner-as-caller (correct for an owner, but a team
member's call would resolve winners from the OWNER's saved winners
while the user's own per-account entitlement is what was actually
checked — a mismatch, but not a data corruption). The Phase 20
Concept Director runs inside this callable and consumes the
top-winners list as a reference for variety. Behaviour risk: a team
member's generation might use the owner's past winners as reference
even though their own generation is being run. Risk is bounded (no
write to wrong paths; just a reference-list source) but the
asymmetry deserves a closer read.

**Recommendation for next batch:** extract
`serverGenerateConceptsImpl` and add a `resolveMetaScope` preamble
without changing the entitlement check. Reuse `linkUnmatchedAd`'s
"audit signal on the per-caller field, owner paths everywhere" shape.

### 5.2 `backfillImageFingerprints` — `functions/src/backfillImageFingerprints.ts`

The whole callable reads and writes `generations`, `users/${uid}/workspaces/${wid}/imageFingerprints`,
and `generations/${genId}` using `request.auth.uid` directly (lines
49, 84-86, 122-124). This is an admin-style migration callable: it
walks the user's own workspaces, hashes the user's own generations,
and writes the resulting `imageFingerprints/${hash}` index entries
under the user's own workspaces.

**The question for next batch:** is this callable intended to be
run by team members on the owner's behalf? If yes, it is a sibling
of `linkUnmatchedAd` and needs the same conversion. If no, it is
owner-only and needs `assertNotTeamMember`. The frequency of
invocation (one-time backfill) and the existence of a `maxItems`
cap suggest this is invoked from a developer script or an admin
console rather than from the dashboard — which would push it
toward "owner-only, add the guard" rather than the
`resolveMetaScope` treatment.

**Recommendation for next batch:** read the deployment / invocation
context (which Cloud Scheduler entry, which deploy script) before
touching it; the right fix depends on whether a team member is
ever expected to be able to invoke it.

---

## 6. Risks and follow-ups

1. **`eslint` is broken repo-wide** — the lint command exits with
   `Error while loading rule '@typescript-eslint/no-unused-expressions'`
   on `backfillImageFingerprints.ts` (and on every other file it
   touches, including this batch's). Not caused by this batch.
   `tsc` is the ground truth for now and exits 0.
2. **Manual linking semantics for owners.** The pre-fix behaviour
   wrote a record under `users/${callerUid}/...` for the call
   `matchedManuallyAt`, with no attribution field. This batch adds
   `matchedByUid: scope.callerUid` for audit. Owners calling for
   themselves see `matchedByUid === ownerUid` — a no-op for their
   workflow. If the team-member case ever needs to be distinguished
   in the dashboard, the field is already there.
3. **Empty-state i18n key.** `whats_loading.empty` is now separate
   from `whats_loading.error`, so a successful call with no data
   renders "No results yet..." instead of "Something went wrong..."
   The dashboard's catch path now logs the underlying error before
   showing the message — `console.error("[WhatsWorkingDashboard]
   getWhatsWorkingDashboard failed", ...)` — so a future 404 caller
   scope regression (the bug this batch fixes) leaves a trail.
4. **No deploy.** This batch is pushed to the branch; the
   `firebase deploy` step is deliberately not run.

---

## 7. Commit + push (final tree)

Files in commit `2ba7ee0` (post-amend):

```
functions/package.json
functions/src/linkUnmatchedAd.ts
functions/src/whatsWorkingDashboard.ts
functions/src/__tests__/linkUnmatchedAdScope.test.ts
functions/src/__tests__/whatsWorkingDashboardScope.test.ts
specs/969-cumulative-learning/reports/batch-01-report.md  (this file)
src/components/WhatsWorkingDashboard.tsx
src/i18n.tsx
```

The `.opencode/package-lock.json` bump that was originally staged
with this batch was dropped on review (see §1 "Lockfile bump"); it
is not in the final tree. The full deletion of the previous lockfile
contents (399 lines) is recorded by the `delete mode 100644` line in
the amend's stat.

Branch: `969-cumulative-learning`.
Push: `git push origin 969-cumulative-learning` (force-with-lease
after the amend).
Deploy: **deferred** (no `firebase deploy`).
