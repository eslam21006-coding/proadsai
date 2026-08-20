# Phase 967 — Code Audit Report

**Auditor**: Claude (read-only audit; no code changed)
**Branch**: `967-meta-workspace-isolation` (4 commits ahead of `main`)
**Date**: 2026-08-20
**Scope**: 47 changed files, +12,191 / −523

---

## Final Verdict: ⚠️ REQUEST CHANGES

**1 CRITICAL, 2 HIGH, 2 LOW.**

The implementation is high quality. All five original bugs are addressed, the caller-scope conversion is complete and disciplined, and every requirement I could verify statically passes except one. That one, however, reopens the specific harm this phase exists to prevent — on a live Meta write path, in the data state that will be the default for every existing account on day one.

The two HIGH findings are not code defects. They are delivery gaps: the phase's own 67 contract tests never execute in CI, and the data repair that the listing fix depends on has not been run.

---

## PASS / FAIL by requirement

| FR | Requirement | Verdict | Evidence |
|---|---|---|---|
| **FR-001** | No `request.auth.uid` in Firestore paths; use `scope.ownerUid` | ✅ **PASS** | Zero occurrences across all Meta callable ranges. All 15 entry points route through `resolveMetaScope`. |
| **FR-003** | `readDegraded` → retryable, never proceed on self-scope | ✅ **PASS** | `metaCallerScope.ts:86-96`. Round-3 fix at `:248` correctly separates "no default marker" (`failed-precondition`) from a degraded read (`unavailable`). |
| **FR-004 / FR-021** | Workspace authorisation before side effects | ✅ **PASS** | `assertWorkspaceAllowed` at `metaCallerScope.ts:126`, called before load in `resolvePublishWorkspace:225`. |
| **FR-011** | Page cleared in the **same write** as ad-account change | ⚠️ **PARTIAL — see C-1** | Single write ✅ (`index.ts:7393`). But the clear is **conditional**, not unconditional. |
| **FR-012 / FR-012b** | Server resolves default workspace; Starter/Pro never refused | ✅ **PASS** | `resolvePublishWorkspace:228-267`. Empty-string `workspaceId` correctly falls through to default (round-3 fix). |
| **FR-013 / FR-014** | Ad account from workspace, never `conn.selectedAccountId` | ✅ **PASS** | `index.ts:4031` (single), `:6145` (pack). Both Bug-3 fallback lines deleted. Remaining `selectedAccountId` reads are at `:3786` (`metaSyncPerformance`) and `:6396` (`metaLegacySync`) — both sync paths, explicitly exempt under FR-009a. |
| **FR-015** | Refuse publish with no ad account, naming the workspace | ✅ **PASS** | `index.ts:4035-4045`, `:6149-6159`. Structured `reason: 'workspace_no_ad_account'` + workspace name. |
| **FR-015a** | Publish **not** gated on Page | ✅ **PASS** | No Page gate on either path. Pack degrades gracefully (skips `/adcreatives`) rather than refusing — `index.ts:6203`. |
| **FR-017** | `assertNotTeamMember` removed from link/unlink | ✅ **PASS** | Removed; `index.ts:7279` documents the removal. Team members gated by workspace access instead. |
| **FR-019** | `assertNotTeamMember` **kept** on create/delete/restore | ✅ **PASS** | Intact at `index.ts:7016` (create), `:7098` (update), `:7185` (delete), `:7235` (restore). |
| **FR-020a-i** | OAuth resolves member→owner **after** reading state | ✅ **PASS** | `index.ts:3395` delegates to impl after reading state; writes under `ownerUid` with `connectedByUid` audit field. |
| **FR-020a-ii** | State parameter itself unchanged | ✅ **PASS** | `index.ts:3376` reads `req.query.state` exactly as pre-967. No validation/production change. Deferred state-trust work unblocked. |
| **FR-024** | Soft-deleted workspaces excluded from every listing | ✅ **PASS (code)** — see H-2 | `loadActiveWorkspace:178`; repair pass 1 fires only on **absent** key, never touches a timestamp (`repair-workspace-markers.ts:238-241`); pass 2 filters `deletedAt == null` (`:322`). |
| **FR-027** | Full traceability on every deployment record | ✅ **PASS** | `workspaceId`, `workspaceIdSource`, `pageId`, `pageName`, `pageSource`, `pushedByUid` all written (`index.ts:6236-6248`). Round-1 fix made the write `await`-ed so it settles before return. |
| **FR-028a–c** | All new strings in en + ar, simple Fusha | ✅ **PASS** | All 5 keys paired in `src/i18n.tsx`. Arabic is clean Fusha, no dialect markers, no transliterated technical terms. |
| **FR-030** | `metaSelectPage` still writes legacy fields | ✅ **PASS** | `index.ts:3669-3674`. Round-1 fix also normalises `selectedPageName` to null on clear, preventing an orphaned label. |
| **Traps** | `readDegraded` checked first; `metaPageClearedAt` on CLEARED; no direct workspace writes by team members | ✅ **PASS** | All three hold. Team-member writes go through callables (Admin SDK); `firestore.rules` unchanged, still read-only for members. |

---

## Findings

### C-1 — CRITICAL — Conditional Page clear reopens the cross-client leak for NEVER_SET workspaces

**Files**: `functions/src/index.ts:7387-7392` (link), `:7468` (unlink)
**Contradicts**: FR-011, and the spec's own Edge Case on the shared legacy Page

FR-011 states the Page must be cleared **unconditionally** on an ad-account change. The implementation gates the clear on `hadPage`:

```ts
const hadPage = typeof priorWsData.metaPageId === "string" && priorWsData.metaPageId.length > 0;
if (hadPage) {                                    // ← conditional
    updatePayload.metaPageId = null;
    updatePayload.metaPageName = null;
    updatePayload.metaPageClearedAt = Date.now();
}
```

A NEVER_SET workspace therefore stays NEVER_SET after being retargeted to a different client's ad account — and NEVER_SET is precisely the state that still inherits the account-level legacy Page (`metaCallerScope.ts:329-336`).

**Failure scenario** — all four conditions are the *default* state after this phase ships, because Page migration is lazy (FR-010):

1. Account holds a pre-967 global `selectedPageId` = **Client A's Page**.
2. Workspace W has never chosen its own Page → NEVER_SET.
3. W is linked to **Client B's ad account**. `hadPage` is false → no clear, no stamp.
4. Pack publish from W → `resolveWorkspacePage` returns `legacy_global` = Client A's Page.
5. `index.ts:6203-6212` POSTs to `/{Client B account}/adcreatives` with `object_story_spec.page_id = Client A's Page`.

The result is a **real ad creative object created inside Client B's ad account, branded with Client A's Facebook Page**. This is not metadata — it is a live Meta write, and it is exactly the harm the spec's Edge Case describes:

> "…the first ad account change on any of those workspaces is what separates them — this is expected, and the clearing rule (FR-011) is what stops the shared fallback from following a workspace onto a different client's ad account."

The implementation does not separate them.

**This is a deliberate, tested choice, not an oversight.** `linkMetaAccount.test.ts:408` (T-09b) asserts NEVER_SET stays NEVER_SET, with the rationale that the workspace "doesn't appear to have been deliberately cleared." That reasoning protects FR-007 / SC-006 (no regression for accounts on the legacy Page) — a genuine competing requirement.

**So this needs a product decision, not just a patch.** The two readings conflict:

- **FR-007 / SC-006** — a workspace that never chose a Page keeps inheriting the global one, so nothing that worked before breaks.
- **FR-011 + Edge Case** — an ad-account change must sever that inheritance.

They are only in conflict for a workspace that is *both* NEVER_SET *and* has had its ad account changed. The spec resolves it explicitly in favour of severing, and I recommend following that: stamp `metaPageClearedAt` on every ad-account change regardless of `hadPage`, while keeping `pageCleared` (the user notice) gated on `hadPage` so untouched workspaces don't produce a confusing "your Page was cleared" message. That preserves SC-006 for every workspace nobody has retargeted, and closes the leak the moment one is.

T-09b would need to be inverted to match.

---

### H-1 — HIGH — All 9 Phase 967 test suites are absent from `npm test`

**File**: `functions/package.json` (test script)

The suites compile but are not in the run chain, so **none of them execute in CI**:

| Suite | In `npm test` | Compiled | Manual run |
|---|---|---|---|
| `metaCallerScope` | ❌ | ✅ | 7 passed |
| `metaPush` | ❌ | ✅ | 8 passed |
| `metaPushPack` | ❌ | ✅ | 2 passed |
| `metaSelectPage` | ❌ | ✅ | 16 passed |
| `metaScope.integration` | ❌ | ✅ | 6 passed |
| `metaOAuthCallback` | ❌ | ✅ | 2 passed |
| `linkMetaAccount` | ❌ | ✅ | 10 passed |
| `workspaceRepair` | ❌ | ✅ | 9 passed |
| `workspaceListing` | ❌ | ✅ | 7 passed |
| | | **Total** | **67 passed, 0 failed** |

The tests are correct — I ran all nine manually and every one passes. But the entire T-01–T-24 contract matrix is currently dead weight: any future change can silently break workspace isolation and CI will stay green. Since these tests are the sole evidence backing most Success Criteria in `sc-results.md`, this also undercuts that document's claims.

Only `workspace.test.ts` (which carries T-14, T-17, T-19, T-22) is wired in, via the existing entry.

Fix: append the nine `node lib/__tests__/<name>.test.js` entries to the `test` script.

---

### H-2 — HIGH — The data repair has not been run; the listing fix is inert until it is

**Files**: `specs/967-meta-workspace-isolation/evidence-r1.md:96-110`, `src/App.tsx:2700`

Every live figure in the evidence file is `<pending>`:

```
docs missing deletedAt:         <pending>
docs updated (deletedAt=null):  <pending> (would update)
```

Per the approved R1 Option A, the query at `App.tsx:2700` was deliberately left unchanged (`where('deletedAt','==',null)` + `orderBy('createdAt','desc')`) because the *data* gets repaired instead. That decision is sound and correctly implemented — but it means **Bug 4 remains live in production until an operator runs `scripts/repair-workspace-markers.ts`**. Merging this branch does not fix the 3-of-9 symptom by itself.

Two consequences worth stating plainly:

- **SC-004 is unverified.** It is closed hermetically by `workspaceListing.test.ts`, not by the nine-workspace account the criterion names.
- **FR-025 / FR-026 evidence is incomplete**, so constitution Principle IX ("proof required for every claimed fix") is not yet satisfied for the headline bug — the one gate the plan flagged as its own caveat.

This is a deploy sequencing item, not a code defect. It should be an explicit merge checklist entry rather than an assumption.

---

### L-1 — LOW — `sc-results.md` overstates the test count

Claims "80 contract tests"; the nine new suites total **67**. Including the Phase 967 cases inside `workspace.test.ts` may account for the difference, but the number as written is not reproducible from the suites.

---

### L-2 — LOW — R8's "no `/adcreatives` today" premise is inaccurate for the pack path

**Files**: `specs/967-meta-workspace-isolation/research.md` (R8), `functions/src/index.ts:6205`

R8 concluded the Facebook Page is unconsumed metadata, and FR-015a/FR-015b rest on that premise. It holds for `metaPushCreative`, but **`metaPushCreativePack` does call `/adcreatives` and does send `page_id`**. The implementation handles this correctly (skips creative creation when no Page resolves), so FR-015a's *behaviour* is right. But the premise behind deferring the Page gate is only half true — and it is what makes C-1 externally visible rather than cosmetic. Worth correcting in `research.md` so the FR-015b revisit is not made on a false basis.

---

## Test results

| Suite | Result |
|---|---|
| `functions` — clean `lib/`, `npm run build` | ✅ exit 0 |
| `functions` — `npm test` | ✅ exit 0, **0 failed** across all wired suites (929 / 254 / 244 / 223 / 206 / 167 / 143 / 77 / 71 …) |
| `functions` — 9 Phase 967 suites (manual) | ✅ **67 passed, 0 failed** — *not run by `npm test`, see H-1* |
| root — `npm run build` | ✅ exit 0 |
| root — `npm test` | ✅ **36 passed (3 files)**, 0 failed |

No failures anywhere. Lines reading `FAIL-2` / `FAIL-3` in backend output are fixture *names*, not failures.

---

## CodeRabbit commit review

All three rounds are genuine hardening. None breaks a spec requirement; two actively strengthen compliance.

| Commit | Change | Assessment |
|---|---|---|
| `ace84ca` | Transactional connect/disconnect; FR-027 record settled before return; notice scope; `pageName` normalisation; repair counter; query chain | ✅ Sound. The `selectedPageName`→null normalisation (`index.ts:3669`) prevents an orphaned legacy label — a real FR-030 integrity improvement. |
| `0b7ab71` | Repair script crash; unbounded batch; same-write contract | ✅ Sound. Batch bounding matters for the `collectionGroup` scan; the same-write assertion (`linkMetaAccount.test.ts:401`) directly guards FR-011's atomicity. |
| `b426227` | URL encode; empty `workspaceId`; FR-003 catch; truncated scan; stale meta | ✅ **Strengthens FR-003.** The `metaCallerScope.ts:248` change stops a transient read failure being mis-reported as a permanent `no_workspace_resolved` — a correct reading of the requirement that the original implementation got wrong. |

---

## Recommendation

**REQUEST CHANGES**, on three items:

1. **C-1** — resolve the FR-007 / FR-011 tension (product decision), then make the clear unconditional and invert T-09b. This is the only change that alters shipped behaviour.
2. **H-1** — wire the nine suites into `functions/package.json`. One-line-per-suite edit; no code risk.
3. **H-2** — add "run `scripts/repair-workspace-markers.ts` against production and fill in `evidence-r1.md`" as an explicit pre-merge or immediately-post-deploy gate, and re-confirm SC-004 live.

L-1 and L-2 are documentation accuracy and can ride along.

Everything else audited clean. The caller-scope work in particular is thorough — 15 entry points converted with no `request.auth.uid` left in any Firestore path, `readDegraded` honoured at every site, and the OAuth callback threading the needle exactly as FR-020a-ii required.
