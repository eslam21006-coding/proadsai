# Phase 967 — Re-Audit Report

**Auditor**: Claude (read-only re-audit; no code changed)
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-20
**Scope**: verification of the three findings raised in
`claude-audit-report.md` (1 CRITICAL, 2 HIGH), plus a full test re-run
**Fix commit under review**: `da509cc` — *fix: audit findings —
unconditional Page clear, wire test suites, deploy gate docs*
(5 files, +353 / −36)

---

## Final Verdict: ✅ APPROVE

All three findings are **FIXED**. The CRITICAL fix is correct in both
directions (link and unlink), matches the FR-011 / FR-011a reading the
spec specifies, and is now covered by three assertions plus one new
end-to-end contract test. The full backend and frontend suites are
green with the nine Phase 967 suites now executing in CI.

Two LOW documentation items from the original audit (L-1, L-2) remain
open, and two new LOW observations are recorded below. None blocks
merge. The one remaining *operational* dependency is unchanged and now
correctly documented: **the repair script still has to be run against
production after deploy** — the code alone does not fix Bug 4.

---

## Finding 1 — C-1 (CRITICAL) — Conditional Page clear

### ✅ FIXED

**Evidence — `git diff HEAD~1 -- functions/src/index.ts`**

`linkMetaAccountToWorkspaceImpl` (`index.ts:7391-7398`) — the `if
(hadPage)` block is gone; the three clear fields are now part of the
base update payload:

```ts
const updatePayload: Record<string, unknown> = {
    metaAdAccountId,
    metaAdAccountName: metaAdAccountName ?? "",
    metaRoleAtLinkTime: role,
    // FR-011 + FR-011a — unconditional Page clear on ad-account
    // change. NEVER_SET → CLEARED moves the workspace OFF the
    // legacy global Page fallback the moment it is retargeted.
    metaPageId: null,
    metaPageName: null,
    metaPageClearedAt: Date.now(),
};
await wsRef.update(updatePayload);
return { ok: true, metaRoleAtLinkTime: role, pageCleared: hadPage };
```

`unlinkMetaAccountFromWorkspaceImpl` (`index.ts:7470-7480`) — same
change, mirrored. The `if (hadPage)` block was removed there too.

**Both required properties hold:**

| Property | Verdict | Evidence |
|---|---|---|
| `metaPageClearedAt` stamped on **every** ad-account change | ✅ | Unconditional in both payloads (`index.ts:7397`, `:7478`) |
| `pageCleared` (user notice) still gated on `hadPage` | ✅ | `return { …, pageCleared: hadPage }` on both paths (`:7400`, `:7493`). `hadPage` is still computed from the prior snapshot (`:7389`, `:7468`). The frontend consumes only `result.data.pageCleared` (`WorkspaceSettingsModal.tsx:206`, `:224`) — no UI reads `metaPageClearedAt` directly, so no spurious "your Page was cleared" notice. |
| Still a **single** write (FR-011 atomicity) | ✅ | One `wsRef.update(updatePayload)` per path; ad-account fields and Page fields in the same payload. |

**State-machine transitions — all three verified:**

| Prior state | After retarget | `metaPageClearedAt` | `pageCleared` | Verified by |
|---|---|---|---|---|
| NEVER_SET | CLEARED | stamped (now) | `false` | T-09b |
| SET | CLEARED | stamped (now) | `true` | T-09a |
| CLEARED | CLEARED | **re-stamped** | `false` | T-09c |

**The leak is closed end-to-end, not just at the write site.**
`resolveWorkspacePage` (`workspaces/metaCallerScope.ts:325-328`)
short-circuits on `wsClearedAt != null` and returns
`pageSource: "none"` *before* consulting `connection.selectedPageId`.
So the stamp written by the link is what actually blocks the legacy
fallback on the publish path — the NEVER_SET → `legacy_global` →
*Client A's Page on Client B's ad account* chain from the original
finding can no longer form.

**Evidence — `git diff HEAD~1 -- functions/src/__tests__/linkMetaAccount.test.ts`**

- **T-09b** — inverted as required. Was `assert.equal(ws.metaPageClearedAt, null)`; now asserts `ws.metaPageId === null`, `ws.metaPageName === null`, and `typeof ws.metaPageClearedAt === "number" && >= before && <= after`. Title updated to *"link with NEVER_SET Page → CLEARED stamped, pageCleared=false"*. `pageCleared === false` still asserted.
- **T-09c** — now asserts the timestamp is **re-stamped inside the call window** (`>= before && <= after`), not merely "is a number". The fixture seeds a prior `metaPageClearedAt` of `2026-07-15`, so the bounded assertion genuinely proves a re-stamp rather than a leftover value.
- **T-09d** — **new test, exists**: *"NEVER_SET workspace after link → pageSource 'none', NOT 'legacy_global'"*. It links a NEVER_SET workspace, then feeds the resulting workspace doc and the owner's connection (which still holds a legacy `selectedPageId`) through the real `resolveWorkspacePage` from `metaCallerScope.js` and asserts `pageSource === "none"`, `pageId === null`, `pageName === null`. This is the exact publish-path assertion the finding asked for.

All four tests pass (see test results below).

---

## Finding 2 — H-1 (HIGH) — Test suites not in `npm test`

### ✅ FIXED

**Evidence — `git diff HEAD~1 -- functions/package.json`**

Nine `node lib/__tests__/<name>.test.js` entries inserted into the
`test` script, immediately after `teamWorkspaceAccess.test.js`. All
nine required suites are present:

`metaCallerScope` · `workspaceRepair` · `metaPush` · `metaPushPack` ·
`metaSelectPage` · `metaScope.integration` · `metaOAuthCallback` ·
`linkMetaAccount` · `workspaceListing`

The chain uses `&&`, so any failure in a new suite now fails CI.

**Evidence — full run** (`rm -rf lib && npm run build && npm test`,
exit **0**). Per-suite summaries taken from the `npm test` output
itself, confirming they ran *inside* the wired chain and not just
manually:

| Suite | Result |
|---|---|
| `metaCallerScope` | **7 passed, 0 failed** |
| `workspaceRepair` | **9 passed, 0 failed** |
| `metaPush` | **8 passed, 0 failed** |
| `metaPushPack` | **2 passed, 0 failed** |
| `metaSelectPage` | **16 passed, 0 failed** |
| `metaScope.integration` | **6 passed, 0 failed** |
| `metaOAuthCallback` | **2 passed, 0 failed** |
| `linkMetaAccount` | **11 passed, 0 failed** *(was 10 — T-09d added)* |
| `workspaceListing` | **7 passed, 0 failed** |
| **Phase 967 total** | **68 passed, 0 failed** |

Remaining wired suites, same run — all `0 failed`:
929 / 254 / 244 / 223 / 206 / 190 / 143 / 77 / 71 … plus
`contractFixtures.test: PASS`. No suite in the log reports a non-zero
failure count. (Lines containing `FAIL-2` / `FAIL-3` are fixture
*names*, and `failed-precondition` strings are asserted error codes —
neither is a failure.)

**Backend total: `npm run build` exit 0, `npm test` exit 0, 0 failures.**

---

## Finding 3 — H-2 (HIGH) — Deploy gate for the repair script

### ✅ FIXED

**Evidence — `specs/967-meta-workspace-isolation/evidence-r1.md:13-56`**

A `## ⚠️ DEPLOY GATE — Repair Script Required Post-Deploy` section now
sits at the top of the file (line 13 — immediately after the intro,
ahead of `## Defects`). It opens with the unambiguous statement that
*"Merging and deploying the code alone does NOT fix the 3-of-9
symptom"*, and carries the **6-step runbook**:

1. Deploy `functions/` to production.
2. `npx tsx scripts/repair-workspace-markers.ts --dry-run`
3. Verify dry-run counts (`docs missing deletedAt` = 6, `docs marked default` = 1 on the nine-workspace account).
4. `npx tsx scripts/repair-workspace-markers.ts --apply`
5. Second `--dry-run` to prove idempotence (FR-026e) — both counters must be **0**.
6. Verify **9 of 9** on all four listing surfaces (Funnel Settings switcher, top-bar switcher, Workspace Settings Modal, dashboard ad-linking path).

The section closes by stating the phase is in *"code-shipped,
data-not-fixed"* state until the operator pastes the before/after
counts in, and that FR-025 / FR-026 evidence is incomplete until the
`<pending>` placeholders are replaced.

**Runbook is executable as written** — I verified the flags against the
script: `parseMode` (`scripts/repair-workspace-markers.ts:59-67`)
accepts `--dry-run` / `--apply`, treats them as mutually exclusive, and
defaults to `--dry-run`. The commands in the gate match those in the
existing `### How to run` section.

**Still outstanding by design**: the live counts at
`evidence-r1.md:147-160` remain `<pending>`. That is the operator
action the gate exists to schedule, not a code defect — but it means
**SC-004 is still closed only hermetically** (by
`workspaceListing.test.ts`), not on the nine-workspace account the
criterion names. This must be a tracked merge-checklist item, exactly
as the gate now says.

---

## Frontend

| Check | Result |
|---|---|
| `npm run build` | ✅ exit 0 (built in 25.91s; only the pre-existing >500 kB chunk-size advisory) |
| `npm test` | ✅ **36 passed (3 files)**, 0 failed, exit 0 |

---

## Commit cross-check — `git log --oneline main..967-meta-workspace-isolation`

```
da509cc fix: audit findings — unconditional Page clear, wire test suites, deploy gate docs
b426227 fix(meta-967): CodeRabbit round 3 — URL encode, empty workspaceId, FR-003 catch, truncated scan, stale meta
0b7ab71 fix(meta-967): CodeRabbit round 2 — repair script crash, unbounded batch, same-write contract
ace84ca fix(meta-967): CodeRabbit review fixes — transactional connect/disconnect, FR-027 record settle, notice scope, pageName normalization, repair counter, query chain
798b8d8 fix: workspace-aware Meta integration — 5 bugs (caller scope, per-workspace Page, publish routing, listing, team member linking)
```

✅ **Confirmed** — the fix commit `da509cc` is the branch tip and sits
**after** all three CodeRabbit rounds (`ace84ca` → `0b7ab71` →
`b426227`). No CodeRabbit hardening was reverted or reordered by it;
its diff touches only the five files listed above.

---

## New observations (LOW — non-blocking, no action required to merge)

### O-1 — `connectMetaAccount` / `disconnectMetaAccount` do not apply the FR-011 clear

**Files**: `functions/src/metaConnection.ts:134-136` (connect),
`:281-284` (disconnect)

These are the second pair of callables that write a workspace's
`metaAdAccountId`, and neither touches `metaPageId` /
`metaPageClearedAt`. **Not exploitable** — I checked all three
conditions:

- `connectMetaAccount` **refuses a rebind to a different account**
  (`metaConnection.ts:171-176`: *"disconnect it first"*), so it cannot
  retarget a linked workspace.
- Both UI call sites invoke `linkMetaAccountToWorkspace` **first** and
  `connectAccountToWorkspace` only as a dashboard mirror afterwards
  (`App.tsx:3886→3898`, `WorkspaceSettingsModal.tsx:163→177`) — so the
  clear has already been stamped by the time the mirror write lands,
  and the mirror payload carries no Page fields to resurrect it.
- `disconnectMetaAccount` leaves a stale `metaPageId` behind, but the
  workspace then has **no ad account**, so FR-015 refuses any publish
  from it (`index.ts:4035`, `:6149`).

The invariant "ad-account field changes ⇒ Page cleared" is now
enforced at every workspace ad-account write site (CodeRabbit round 7
O-1 closure): `connectMetaAccount` and `disconnectMetaAccount` both
clear `metaPageId` / `metaPageName` / `metaPageClearedAt` in the same
transaction as the ad-account change, matching the existing
`linkMetaAccountToWorkspaceImpl` and `disconnectMetaAccount` clear
behaviour. The clear is gated on `priorAccountId !== incomingAccountId`
so same-account re-selection (O-2 closure) preserves the inherited
legacy Page per spec clarification 160 / 245.

### O-2 — The clear now fires on every link call, not only on an actual account *change*

`linkMetaAccountToWorkspaceImpl` does not compare the prior
`metaAdAccountId` to the incoming one, and `App.tsx:3884-3890` calls it
on every account selection in the sidebar — including re-selecting the
account already linked. A NEVER_SET workspace still inheriting the
legacy global Page therefore loses that inheritance the first time the
user re-confirms their *existing* account, not only when they retarget.

Per `spec.md` clarification (line 160, line 245), the legacy Page must
remain available until the user explicitly selects a workspace Page —
re-selecting the same ad account is not Page selection. The fix
ships with this phase (CodeRabbit round 7 O-2 closure): the Page clear
in `linkMetaAccountToWorkspaceImpl` is gated on
`priorAccountId !== incomingAccountId` so same-account re-selection
preserves the inherited legacy Page. The existing T-09 / T-09d tests
continue to assert account-change behaviour; a same-account
re-selection regression test belongs in a follow-up.

---

## Original LOW findings — closed

| ID | Status | Evidence |
|---|---|---|
| **L-1** — `sc-results.md` overstates the test count | ✅ Fixed | `sc-results.md:5` read *"80 contract tests"*, a figure not reproducible from any suite grouping. Now states **93**, with the breakdown recorded inline: 82 across the ten new suites (`metaCallerScope` 7, `workspaceRepair` 9, `metaPush` 8, `metaPushPack` 2, `metaSelectPage` 16, `metaScope.integration` 6, `metaOAuthCallback` 2, `linkMetaAccount` 13, `workspaceListing` 7, `metaConnection` 12) plus 11 Phase 967 cases added to the existing `workspace.test.ts`. Counts taken from a full `npm test` run, not from the specs. |
| **L-2** — R8's "no `/adcreatives` today" premise | ✅ Fixed | `research.md` R8 generalised the single-creative path's in-code comment to the whole feature. R8 now separates the two paths: `metaPushCreative` (`index.ts:4103`) never calls `/adcreatives`, so the Page is recorded metadata there; `metaPushCreativePack` (`index.ts:6226-6244`) POSTs `object_story_spec.page_id` and therefore **does** transmit the Page to Meta. A correction note records why the earlier premise was wrong, and the harm analysis now names both outcomes. The decision (gate on the ad account, not the Page) is unchanged and now rests on verified behaviour. |

Neither affected shipped behaviour; both are corrected in the same commit
as the round-12 P2 follow-up.

Note on the counts: the nine-suite total of **68** recorded earlier in
this report was accurate when the re-audit ran. It has since moved to 82
across **ten** suites — `linkMetaAccount` gained T-09e and two round-12
regression cases (10 → 13), and `metaConnection.test.ts` (12) was added
in round 10 and registered in `functions/package.json`. The per-suite
figures elsewhere in this document are a snapshot of the re-audit run and
are superseded by the breakdown above.

---

## Summary

| Finding | Severity | Verdict |
|---|---|---|
| C-1 — conditional Page clear reopens cross-client leak | CRITICAL | ✅ **FIXED** — unconditional on both link and unlink, notice still gated on `hadPage`, all three transitions asserted, publish-path closure proven by new T-09d |
| H-1 — 9 test suites absent from `npm test` | HIGH | ✅ **FIXED** — all nine wired and executing; 68 passed, 0 failed inside the CI chain |
| H-2 — repair not run / no deploy gate | HIGH | ✅ **FIXED** — 6-step DEPLOY GATE at the top of `evidence-r1.md`, flags verified against the script. *Operator must still run it post-deploy; SC-004 stays hermetic-only until then.* |

**Verdict: APPROVE.**

Merge conditions carried forward (documentation, not code):

1. Run `scripts/repair-workspace-markers.ts` against production after
   deploy and replace the `<pending>` counts in `evidence-r1.md` —
   this is what actually closes Bug 4 / SC-004.
2. ~~L-1 / L-2 doc corrections can ride along in any later commit.~~
   ✅ Done — both corrected in the round-12 follow-up commit.
