# Quickstart — Saved Projects (Phase 13)

**Audience**: a developer or QA verifying Phase 13 end-to-end against a running dev environment.
**Mirrors**: the seven user stories in `spec.md`.
**Prereqs**:
- Local dev: `npm run dev` (frontend, http://localhost:5173) + Firebase emulators OR a connected dev Firebase project.
- Two test accounts: `owner@dev` (Pro plan) and `member@dev` (added as a team member of owner).
- A second device / browser profile for cross-device tests.

> Treat each section below as one Independent Test from the spec. Pass / fail each independently.

---

## Story 1 — Status & thumbnail (P1)

1. Sign in as `owner@dev`. Open the Saved Projects panel.
2. Start a new project. Fill Step 1 only. Save (or wait for auto-save).
3. **Verify**: project appears in the list with status badge `Draft / مسودة` (gray) and a placeholder thumbnail.
4. Run the project through to a successful Step-4 render (single format).
5. **Verify**: badge flips to `Rendered / تم العرض` (green); the project card shows the rendered image as the thumbnail.
6. Reload the browser. **Verify**: the same thumbnail still renders. (Confirms FR-004 durability.)
7. Push the ad to Meta from Step 4.
8. **Verify**: badge flips to `Published / منشور` (blue).
9. Disconnect Meta from settings. Reload. **Verify**: badge stays `Published` (FR-002 latch — Edge Case verified).
10. Sign out, sign back in. **Verify**: thumbnail still renders (durable across sessions).
11. Sign in to the same account on a second device. **Verify**: same thumbnail renders.

---

## Story 2 — Plan-cap enforcement (P1)

1. Switch `owner@dev` to **Starter** plan via the billing test panel.
2. Create 10 projects (any combination of drafts and renders is fine).
3. Attempt to save an 11th project.
4. **Verify**: save is refused with an inline message naming "10-project limit on the Starter plan" and a visible upgrade path.
5. Edit one of the existing 10 projects. Save.
6. **Verify**: the update succeeds (cap applies to new projects only — FR-007).
7. Upgrade `owner@dev` to **Pro**. Retry the 11th save.
8. **Verify**: success.
9. Downgrade back to Starter. Confirm the user is now over-cap (11 saved).
10. Edit one of the 11. **Verify**: update still succeeds.
11. Try to create a 12th. **Verify**: refused with the Starter cap message (FR-007 / Edge Case).

---

## Story 3 — Resume from any completed step (P1)

1. As `owner@dev`, open a project that has data through Step 4 but no Step 5 caption.
2. **Verify**: the card's step navigator shows 4 filled dots (steps 1–4) and 1 empty dot (step 5).
3. Click the **Step 2** dot.
4. **Verify**: the project loads and the app lands on Step 2 (not Step 4). The previously-selected tone is visible.
5. Open the project again, this time clicking the **card body** (not a dot).
6. **Verify**: the app lands on the project's last active step (Step 4 — existing behaviour preserved).
7. Click the **Step 5** dot (which is empty).
8. **Verify**: the click is a no-op; no navigation, no error.

---

## Story 4 — Search and filter (P2)

1. As `owner@dev`, ensure the library has at least 6 projects across 2 workspaces (A and B) with mixed statuses.
2. In the search box, type a partial name string ("sum" against a project named "Summer launch").
3. **Verify**: only "Summer launch" remains visible.
4. Switch the workspace filter to workspace B.
5. **Verify**: only B-workspace projects matching the search remain.
6. Switch the status tab to **Rendered**.
7. **Verify**: only rendered B-workspace projects matching the search remain.
8. Clear the search.
9. **Verify**: workspace B + Rendered tab still apply (filters compose).
10. Reset all filters. **Verify**: full list returns.
11. Switch to the **Published** tab. If the user is not connected to Meta, **verify**: the empty state surfaces the Meta-connect CTA (R10).

---

## Story 5 — Delete with confirmation (P2)

1. Pick any saved project that has a thumbnail.
2. Click the delete control on its card.
3. **Verify**: confirmation dialog appears, naming the project, warning the action is irreversible.
4. Cancel.
5. **Verify**: project remains in the list.
6. Click delete again. Confirm.
7. **Verify**: project disappears from the list immediately.
8. Reload the browser. **Verify**: still gone.
9. Sign in on the second device. **Verify**: still gone there.
10. Inspect Firebase Storage at `users/{uid}/projects/{projectId}/thumbnail.jpg`. **Verify**: object is gone (cascade delete — FR-014).
11. As a Starter user at cap, delete one project then save a new one. **Verify**: save succeeds (deletion freed quota — Acceptance Scenario 5).

---

## Story 6 — Continuous auto-save with indicator (P2)

1. Start a fresh project. Type one character into a Step 1 input field.
2. **Verify**: within ~3 seconds the header indicator briefly shows `Saving…`, then `Saved ✓`. The indicator clears after 2 seconds.
3. The new project appears in the saved-projects list as a draft, with no explicit save click.
4. Type 10 characters in quick succession (under 1 second total).
5. **Verify**: only one save cycle fires (`Saving… / Saved` shown once, not 10 times).
6. Type continuously for 60 seconds without stopping.
7. **Verify**: the save fires at the 30 s ceiling regardless of inactivity (FR-016 auto-save coalescing window — proves SC-006).
8. With DevTools, set Network → Offline. Type a few more edits.
9. **Verify**: indicator shows the inline save-failure state. The local IndexedDB save still succeeds (open DevTools → Application → IndexedDB → ProAdsDB_V2 → projects, confirm the latest edit is written).
10. Continue typing while offline so 3 cloud saves fail in a row.
11. **Verify**: a persistent non-blocking banner appears: *"Saving to cloud failed — your work is safe locally"* with a "Try saving now" button.
12. Re-enable the network. The next auto-save (or click "Try saving now") succeeds.
13. **Verify**: the banner dismisses automatically; indicator returns to `Saved ✓` then `idle`.
14. Close the tab during editing. Reopen. **Verify**: the project is in the list with the data you last entered before closing (SC-006).

---

## Story 7 — Team-scoped listing (P3)

1. As `owner@dev`, create 2 projects in workspace A and 1 in workspace B.
2. Grant `member@dev` access to workspace A only (Phase 12 access matrix).
3. Sign in as `member@dev`.
4. Open the saved-projects panel. **Verify**: the workspace filter shows only workspace A. The list shows the 2 projects in A.
5. Attempt to request workspace B's project list (e.g., via direct callable invocation in DevTools console using the Firebase JS SDK):
   ```js
   const fn = httpsCallable(functions, 'getUserProjects');
   await fn({ workspaceId: 'ws-B-id' });
   ```
6. **Verify**: response is `PERMISSION_DENIED`. Inspect the response payload — **verify**: no project metadata is returned (SC-009).
7. Owner adds a third project to workspace A. Member reloads.
8. **Verify**: the new project appears in member's list.
9. Pagination check: temporarily seed > 50 projects in workspace A (or set `pageSize: 2` in the callable for the test). **Verify**: response includes a `nextCursor`. Make a second call with that cursor → returns the next page; `nextCursor` becomes `null` on the final page.
10. Sign in as a *non-team* user. Attempt the same callable with `workspaceId: <owner's-workspace-id>`. **Verify**: `PERMISSION_DENIED`.

---

## Status — Definition of Done #16 verification

After all 7 stories pass, the LAUNCH_MATRIX Definition-of-Done item #16 is verifiable end-to-end:

> *"Saved projects show thumbnail + status + per-plan project limits, can be resumed from any completed step"*

- ✅ Thumbnails — Story 1
- ✅ Status badges — Story 1
- ✅ Per-plan project limits — Story 2
- ✅ Resume from any completed step — Story 3

The remaining stories (4–7) deliver the launch-quality wrapper around DoD #16.

---

## Smoke test before merge

A 5-minute smoke test that exercises the highest-risk paths:

1. Create a project, run to Step 4 render. Confirm thumbnail appears in list.
2. Push to Meta. Confirm `Published` badge.
3. Disconnect Meta. Reload. Confirm badge still `Published`.
4. Hit the plan cap on Starter. Confirm message.
5. Click any step dot on a project — lands on that step.
6. Delete a project. Reload. Confirm gone everywhere.
7. Edit anything; confirm `Saving… / Saved` indicator fires.
8. Sign in as a team member. Confirm only granted workspaces visible in the workspace filter.

If all 8 pass, the build is mergeable.
