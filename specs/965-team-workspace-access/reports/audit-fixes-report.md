# Audit Fixes Report — ISSUE-D Batches 01+02

**Branch**: `fix/issue-d-team-workspace-access` (worktree `D:\proads-worktrees\fix-issue-d`)
**Date**: 2026-07-28
**Input**: `specs/965-team-workspace-access/reports/claude-audit-batches-01-02.md`
**Scope**: F1 (HIGH functional defect) + F2, F3, F4 (cleanups)

**Status**: F1, F2, F4 fixed. F3 investigated and deliberately left in place per instruction. All gates green.

---

## Summary

| ID | Severity | Item | Outcome |
|---|---|---|---|
| F1 | HIGH | Active-workspace-deletion guard unreachable | ✅ **Fixed** — 2 files |
| F2 | MEDIUM | Dead `workspace.error.no_access` key | ✅ **Fixed** — deleted from both locales |
| F3 | LOW | `workspace.refused.owner_only` never rendered | ⏸️ **Confirmed, left in place** (see below) |
| F4 | LOW | Stale `firestore.rules` comment | ✅ **Fixed** |

---

## F1 — Active-workspace-deletion guard (HIGH)

### The defect

Two distinct bugs sat on the same path:

1. **The dialog could never open.** `WorkspaceSwitcher.tsx` opened the guard only when
   `switchGuardTarget !== activeWorkspaceIdRef.current`. The parent sets `switchGuardTarget` to
   the *same* id it just made active; React 18 batches both `setState` calls into one render; and
   the ref was assigned during that render's body — so by the time the effect ran, both sides of
   the comparison held `defId`. Always false. Unreachable on every possible input.

2. **The member with unsaved work was told nothing.** The `workspace.removed_notice` toast lived
   in the `else` branch of `if (hasInProgressWorkRef.current)`. So the person who most needed
   telling was the only one moved silently, while the person with nothing at stake was notified.
   The failure was inverted.

### Fix 1 of 2 — `src/components/WorkspaceSwitcher.tsx:48-74`

Open on the **transition** of `switchGuardTarget` from null to non-null. There is nothing to
compare against: the parent only sets the value when it has already decided the guard is
warranted, so re-deriving that decision in the child was both wrong and redundant.

```tsx
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

`activeWorkspaceIdRef` was the sole cause of the bug and had no other reader — it is **deleted**
outright rather than left dangling. That also clears the `react-hooks/immutability` lint error the
rule was raising against it.

The `if (pendingTarget !== activeWorkspaceId) onSwitch(pendingTarget)` idempotence guards in
`handleGuardSave` / `handleGuardDiscard` are untouched and still correct — they stop a redundant
second switch on the external path, where the parent has already moved the pointer.

### Fix 2 of 2 — `src/App.tsx:2515-2542`

The toast now fires on **every** path; the guard is an addition to it, not an alternative.

```tsx
setActiveWorkspaceIdLocal(defId);
showToast(t('workspace.removed_notice').replace('{name}', def.name), 'info');
if (hasInProgressWorkRef.current) {
  setPendingWorkspaceSwitch({ fromId: currentActive, toId: defId });
}
```

### Traced behaviour after the fix

| Step | State |
|---|---|
| 1. Owner deletes the member's active workspace | snapshot fires; `currentActive` absent from `wsList` |
| 2. Member is moved | `setActiveWorkspaceIdLocal(defId)` |
| 3. Member is told — **always** | `workspace.removed_notice` toast, naming the destination |
| 4. Unsaved work present | `setPendingWorkspaceSwitch({fromId, toId})` |
| 5. Switcher effect | `switchGuardTarget` non-null → **dialog opens** |
| 6. Save / Discard | `pendingTarget === activeWorkspaceId` → no redundant `onSwitch`; parent clears state |
| 7. Cleared | `switchGuardTarget` → null → effect closes the dialog (idempotent with the handler) |

**Cancel** resolves to the account default rather than the deleted workspace — `workspaces.find(w => w.id === fromId)` returns `undefined` because that workspace no longer exists, and the existing fallback chain lands on the default. Correct: there is nothing to cancel back to.

**The user-initiated switch path is unaffected.** On that path `switchGuardTarget` stays `null`
throughout, so the effect never re-runs after mount and cannot close a manually-opened dialog.
`handleSwitch` still drives it through `hasInProgressWork` exactly as before.

### Sub-point — RESOLVED in CodeRabbit round 4

This section previously flagged `onSwitchGuardSave` as "performs no explicit save" and deferred it
as a behavioural question. **That understated it.** CodeRabbit's round-4 review traced the actual
consequence, and it is a data-integrity defect rather than a missing convenience:

The auto-save effect (`App.tsx:4043-4119`) derives `resolvedWorkspaceId` from `activeWorkspaceId`
(`:4075`) and lists `activeWorkspaceId` in its dependency array (`:4119`). The snapshot handler
advanced `activeWorkspaceId` to the fallback **before** the dialog was shown, so the effect re-ran
and re-queued the in-flight project tagged with the *fallback* workspace. The 3-second debounce then
persisted the member's work under a workspace they had never worked in — silently mis-attributed,
not merely delayed.

**Fixed** — the switch is now deferred until the member chooses:

- The snapshot handler no longer advances `activeWorkspaceId` while work is in flight; it only sets
  `pendingWorkspaceSwitch`. The queued snapshot therefore keeps the source workspace id.
- `onSwitchGuardSave` awaits `autoSaveForceFlush()` and surfaces
  `workspace.save_before_switch_failed` on failure instead of switching as though it had saved.
- `WorkspaceSwitcher.handleGuardSave` is `async` and awaits the parent handler before calling
  `onSwitch`, so the flush completes first. The guard buttons and the backdrop are disabled for the
  duration (`guardSaving`) so a second click cannot switch out from under an in-flight save.
- Cancel now leaves the member on the source workspace rather than force-selecting a fallback — the
  work stays attributed to where it was made and the member can act on it deliberately.

This also corrects the **user-initiated** switch path, which had the same ordering flaw on `main`:
"Save & Switch" changed the workspace first and let the debounce persist afterwards, under the
destination workspace.

**Still open, deliberately out of scope**: "Discard & Switch" does not clear the pending auto-save
queue, so discarded work can still be persisted by a later debounce under the destination workspace.
This is pre-existing `main` behaviour on the user-initiated path, it is not what FR-017 asks for
(FR-017 requires a *warning* before discarding, which is present), and fixing it means deciding what
"discard" should mean for the in-memory generation state — a product question, not a defect in this
diff. Recorded here so it is not mistaken for an oversight.

---

## F2 — Dead `workspace.error.no_access` key (MEDIUM)

**Deleted** from both locale blocks in `src/i18n.tsx` (was `:823` en, `:1716` ar):

- en: *"No workspace access — ask your team owner to grant you access."*
- ar: *"لا توجد صلاحية وصول إلى مساحات عمل — اطلب من مالك الفريق منحك الصلاحية."*

FR-019a requires the string be withdrawn: under FR-004 access is automatic and the owner has no
control to grant with, so it described a step that does not exist and would have sent the member to
the owner for something the owner cannot do.

The prior batch left the key defined as an "audit cross-reference". That reasoning does not hold —
the spec, the contract, and the audit report already record it, and a live dictionary is the wrong
place for a string that must never render. Leaving it invited a future re-reference.

A replacement comment at each site records what was removed and why, and names the two keys that
took its place (`workspace.error.no_workspaces` for U3, `workspace.error.load_failed` for U5).

**Verified**: `grep -rn "workspace.error.no_access" src/` returns only the two explanatory comments —
zero dictionary entries, zero call sites.

---

## F3 — `workspace.refused.owner_only` never rendered (LOW) — investigated, left in place

**Confirmed orphaned.** A full search across `src/` returns exactly two hits, both dictionary
definitions (`i18n.tsx:838` en, `:1726` ar). No component renders it, and nothing maps the server's
`{ reason: 'team_member' }` error detail to a translated string.

What a caller actually sees today is the raw `HttpsError` message from
`functions/src/workspaces/workspacePolicy.ts:230` — *"Only the account owner can add, change, or
remove workspaces."* — **English only, in both locales.**

**Left in place as instructed.** The exposure is currently nil: team members have no create, edit,
or delete control anywhere in the UI (audit checks 8 and 9), so the only route to these callables is
a direct invocation from outside the interface. That is exactly what quickstart rows 9–11 do, and
those are operator tests, not user journeys. No Arabic-speaking user can reach the English string.

**Note for whoever wires the refusal UI**: the key is ready and correct in both locales. Map
`error.details.reason === 'team_member'` to `t('workspace.refused.owner_only')` at that point. Until
then it stays dormant by decision, not by oversight.

---

## F4 — Stale `firestore.rules` comment (LOW)

The comment above the `match /workspaces/{workspaceId}` block claimed that *"Fine-grained per-member
`workspaceAccess` filtering is enforced by the server callables"*. T008 removed that filtering — the
comment pointed the next reader at enforcement that no longer exists.

Rewritten to state the current position: the per-member array is retained but never consulted for
authorization (FR-021), read only for the FR-004b override trace. The three-layer defense is
restated accurately, including the Round-2 `teamOwnerUid` binding in `getWorkspaceGenerations` that
the old comment predated.

**Comment only — no rule expression changed.** `firestore.rules` still requires `isTeamMember == true`
+ `teamOwnerUid == userId` + `deletedAt == null`, unchanged from `main`. No rules deploy needed.

---

## Gate results

| Gate | Command | Result |
|---|---|---|
| Frontend build | `npm run build` | ✅ **PASS** — `built in 10.62s`, only pre-existing chunk-size warnings |
| Functions build | `cd functions; npm run build` | ✅ **PASS** — exit 0 |
| Functions tests | `cd functions; npm test` | ✅ **PASS** — full suite, `contractFixtures.test: PASS` |
| Wording guard | `cd functions; npm run test:lang` | ✅ **PASS** — `Spec 008 — All language quality tests passed` |

### Lint — improved against both baselines

| Snapshot | Problems | Errors | Warnings |
|---|---|---|---|
| `main` | 201 | 194 | 7 |
| Before these fixes | 200 | 192 | 8 |
| **After these fixes** | **199** | **191** | **8** |

Measured with `npx eslint` over the five changed frontend files. The `react-hooks/immutability`
error at `WorkspaceSwitcher.tsx:68` — the rule that independently caught F1 — is **gone** (`grep -c`
returns 0). No new error introduced; the branch is now strictly cleaner than `main` on these files.

---

## Files changed

| File | Change |
|---|---|
| `src/components/WorkspaceSwitcher.tsx` | F1 — guard opens on transition; `activeWorkspaceIdRef` deleted |
| `src/App.tsx` | F1 — removal notice fires on every path, not only the no-work branch |
| `src/i18n.tsx` | F2 — `workspace.error.no_access` deleted from `en` and `ar` |
| `firestore.rules` | F4 — comment corrected (no rule expression touched) |

---

## Verification still required

These fixes are proven by build, test, lint, and code trace. Runtime behaviour is not yet observed —
this project has no frontend test runner, so the guard path is manual-only:

1. **Quickstart row 18** — owner deletes the workspace a member is actively using. Confirm: the
   member moves to the default, **the toast appears**, and with unsaved work **the save/discard
   dialog opens**. This is the row that proves F1.
2. **Quickstart row 7a** — FR-017 switch guard with work in progress.
3. **Add to row 18**: confirm "Save & Switch" actually persists the work (the `onSwitchGuardSave`
   question above), now that the dialog is reachable.
4. **Row 24** — repeat in Arabic; confirm the removal notice renders in Fusha.
5. **Row 27** — confirm no message tells anyone to ask the owner for access (F2 closes this by
   deletion).

The remaining Batch 03 items (T030–T034) and the post-merge deploy + production test (T035, T036)
are unchanged by this work.
