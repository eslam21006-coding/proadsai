# Quickstart: Workspace-Aware Meta Integration

**Feature**: `967-meta-workspace-isolation` | **Branch**: `967-meta-workspace-isolation`

---

## Before you write code

Both blocking decisions are **resolved** (2026-08-18): repair the legacy documents (R1 Option A) and fix the default marker at its source plus repair (R4 Option A), executed as one pass. See `research.md` and `data-model.md` §5.

Two constraints from those decisions that are easy to get wrong:

- **Ordering** — the `deletedAt` repair must land for an account *before* its default is chosen. The legacy documents are exactly the ones a `deletedAt`-constrained read cannot see, so the repair must scan the collection unconstrained (Admin SDK bypasses rules), not reuse the client query shape.
- **Transaction** — the `isDefault` decision in `createWorkspace` must sit **inside** `createWorkspaceWithLimit`'s existing transaction. Outside it, two concurrent creations on a fresh account both see zero workspaces and both claim the default.

---

## Order of work

Sequenced by dependency, not by user-story priority. US5's investigation is already done (R1); what remains is the fix.

| Step | Work | Stories | Gate |
|---|---|---|---|
| 1 | Run the combined repair (`deletedAt` + `isDefault`) and ship the `createWorkspace` source fix; verify all 9 workspaces list for owner **and** team member | US5 | SC-004, SC-014 |
| 2 | Verify `resolveDefaultWorkspaceId` resolves on a post-2026-05-21 account | — | Unblocks US1 |
| 3 | Convert the 15 authenticated operations to `resolveCallerScope` (R2), honouring `readDegraded` | US3 | SC-002, SC-009 |
| 4 | Resolve the OAuth callback identity to the owner (C7) | US3 | SC-011 |
| 5 | Add `metaPageId`/`metaPageName`/`metaPageClearedAt`; make Page selection workspace-scoped (C1) | US2 | SC-003 |
| 6 | Route both publish operations through the workspace (C4, C5) | US1 | SC-001, SC-007 |
| 7 | Remove the team-member block on linking; clear the Page on link and unlink (C2, C3) | US4 | — |
| 8 | Paired en/ar strings for every new message, simple Fusha | all | SC-012 |

Steps 1–2 are data-shape repairs; every later step assumes them.

---

## Local verification

```bash
npm run build          # frontend typecheck + bundle
npm run lint
cd functions && npm test
```

The contract matrix in `contracts/callable-contracts.md` (T-01 … T-18) enumerates what to add. T-04, T-08, and T-11 are the three that would catch a regression of the original bugs.

---

## Manual verification

Needs an account with ≥2 workspaces on ≥2 different ad accounts, plus one invited team member.

**Workspace list (SC-004)** — count entries in the Funnel Settings selector as owner, then as team member. Both must equal the active workspace count in the Firestore console. Before the fix: 3 of 9.

**Repair completeness (SC-014)** — before and after, count workspace records lacking `deletedAt` and accounts holding no `isDefault: true` workspace. Both counts must reach zero. Re-run the repair and confirm it writes nothing (FR-026e). Confirm no `metaPageId` was written anywhere (FR-026f).

**Publish routing (SC-001)** — link workspace A to ad account 1 and workspace B to ad account 2. Set `metaConnections.selectedAccountId` to account 1 by hand. Publish from workspace B. The image must appear in **account 2's** media library. Under the current code it lands in account 1 — that is the bug.

**Page isolation (SC-003)** — set a different Page in each workspace, switch back and forth ten times, confirm each shows its own.

**Page clearing (FR-011)** — change workspace A's ad account. Its Page must clear, the user must be told, and publishing must still work with `pageSource: 'none'` recorded.

**Team member (SC-002, SC-011)** — as a team member on an account with no Meta connection: connect using the member's own Meta credentials, link an ad account to a workspace, choose a Page, publish. No step may require the owner. Then confirm as the owner that everything is visible, and that **no `metaConnections/{memberUid}` document exists** (SC-009).

**Language (SC-012)** — switch to Arabic and trigger each new message: Page cleared, no workspace resolved, no ad account linked, disconnect warning, "needs Meta link" label. Simple Fusha, no dialect, no technical terms.

**Rollback (SC-013)** — on an account that has already recorded per-workspace Pages, revert the code and confirm publishing behaves exactly as it does today with no cleanup step.

---

## Traps

- **`readDegraded` is not optional.** Skipping the check makes a transient Firestore failure look like a genuine self-scope, and a team member's data gets written under their own account — the exact mis-attribution this phase removes. Check it before touching `ownerUid`, at every call site.
- **`request.auth.uid` must not appear in any Firestore path** in the touched files afterwards. `functions/src/index.ts` has 69 occurrences; most are unrelated to Meta. Convert by entry point from R2's table, not by grep-and-replace.
- **`conn.selectedAccountId` must not be read by either publish path.** `index.ts:3709` and `index.ts:5733` are the two lines that cause Bug 3.
- **Clear the Page in the same write as the ad-account link**, never a follow-up write. A split leaves a window where the workspace holds one client's Page against another's ad account.
- **`metaPageClearedAt` is what makes FR-011a enforceable.** Without it, "never chosen" and "deliberately cleared" are indistinguishable and a cleared Page silently inherits the global one.
- **Team members cannot write workspace documents directly** — the security rules grant read only (R6). Every write goes through a callable.
- **Do not touch the OAuth `state` parameter.** Resolve the identity after reading it. Changing how `state` is produced or validated collides with the deferred state-trust phase.
- **The repair must not read through the broken query.** Using `where('deletedAt','==',null)` to find documents to repair returns exactly the documents that do not need repairing. Scan unconstrained.
- **The repair fixes history; the `createWorkspace` change stops it recurring.** Shipping only the repair means every account created afterwards has no default again.

---

## Reference

| Document | Contents |
|---|---|
| `spec.md` | Requirements, 9 recorded clarifications |
| `research.md` | R1–R8 findings, including the Bug 4 root cause and its evidence |
| `data-model.md` | Field-level changes, Page state machine |
| `contracts/callable-contracts.md` | Per-callable contracts C1–C11, test matrix T-01–T-18 |
