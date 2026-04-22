# Phase 0 — Research: Saved Projects (Phase 13)

**Date**: 2026-04-22
**Plan**: [plan.md](./plan.md)
**Spec**: [spec.md](./spec.md)

This document resolves the open implementation choices flagged in `plan.md` Technical Context. Each entry follows the **Decision / Rationale / Alternatives** format. None of the entries below is a `[NEEDS CLARIFICATION]` from the spec — those were closed by `/speckit.clarify`. These are plan-level engineering choices.

---

## R1 — Status-derivation single source of truth (client + server)

**Decision**: Define the canonical status-derivation function in `functions/src/savedProjects/projectStatus.ts` and *hand-mirror* the same logic in `src/lib/projectStatus.ts`. Both files share an identical fixture test data set (`__fixtures__/projectStatus.fixtures.ts`) so any drift fails CI on either side.

**Rationale**: The codebase already does this for billing (`src/billing/` mirrors `functions/src/billing/`) — the existing convention favours hand-mirroring with shared fixtures over a Vite alias into `functions/`. Tooling cost of cross-tsconfig path resolution is real; the function is small (≤ 30 LOC); the fixture set protects against drift. Constitution principle XI demands the agreement is enforced in tests, not just intent.

**Alternatives considered**:
- *Single shared file via Vite alias* — would require extending `tsconfig.json` `paths` and `vite.config.ts`, plus a separate `tsconfig` in `functions/` to consume it. Higher tooling cost than the function deserves.
- *Server-only derivation, client trusts server response* — would force a round-trip on every status read in the project list, defeating the in-app responsiveness target. Rejected.

---

## R2 — `published` latch implementation

**Decision**: `deriveStatus(prev: ProjectStatus | undefined, project: SavedProject): ProjectStatus` returns `Math.max(rank(prev), rank(derivedFromData))` over the order `draft = 0 < rendered = 1 < published = 2`. `prev` reads the project's currently persisted `status` field (or `undefined` for legacy projects per FR-022). The latch is enforced inside the function — no callsite can bypass it.

**Rationale**: Centralising the latch in one pure function eliminates the "every save callsite recomputes from scratch and silently demotes" failure mode the spec calls out. Pure-function design makes fixture testing trivial.

**Alternatives considered**:
- *Latch on the persisted side only (Firestore security rule that rejects status downgrades)* — adds a rules-evaluation surface that's hard to test, and IndexedDB has no equivalent rule layer. Rejected.

---

## R3 — Cover-image resolution for the three formats

**Decision**: `resolveCoverImage(project: SavedProject): { url: string } | null` returns:
- **Single** (`!project.carouselSlides && !project.batchResults && project.mockupHistory[0]`) → `{ url: project.mockupHistory[0].url }`
- **Carousel** (`project.carouselSlides && project.carouselSlides.length > 0`) → `{ url: project.carouselSlides[0].imageUrl }` (slide 1)
- **Batch** (`project.batchResults && project.batchResults.length > 0`) → `{ url: project.batchResults[0].url }` (item 1)
- Otherwise → `null` (project has no cover yet → placeholder in UI, no thumbnail upload)

The first matching branch wins (in the order single → carousel → batch); a project that has both `mockupHistory` AND `carouselSlides` (because the user switched format mid-project) is treated as carousel because `carouselSlides[0]` is the most recent intentional cover render.

**Rationale**: Matches Clarification Q3 exactly. The branch order handles the format-switch case the spec flagged — when the user switches from single to carousel the new cover image refreshes; the legacy `mockupHistory` from before the switch is no longer the canonical cover.

**Alternatives considered**:
- *Most-recently-rendered branch wins by timestamp* — requires per-mockup timestamps that don't exist on `mockupHistory` today and would expand the migration. Branch-order priority gets the same outcome with no schema change.

---

## R4 — Thumbnail upload flow

**Decision**: When `resolveCoverImage()` returns a URL that is either (a) a `data:` base64 URL or (b) a transient FAL-generated URL with an expiring token, the client uploads it to Firebase Storage at path `users/{uid}/projects/{projectId}/thumbnail.jpg` and stores the `getDownloadURL()` result on `project.thumbnailUrl`. URLs that are already a Firebase Storage download URL for the same project are kept as-is (idempotent re-saves don't re-upload).

Upload is a **fire-and-forget side effect** of the save path: the project is persisted with a `thumbnailUrl` set to the input URL immediately, and replaced with the durable Storage URL when the upload promise resolves (a second cheap save). If upload fails, the field is left unset and the next render attempts again — matches the spec's edge case for "render completes but the temporary image source becomes unavailable".

**Rationale**: Keeps the user-facing save fast (no awaiting Storage upload before showing "Saved"). Two-phase write means the durable URL eventually replaces the transient one; if the second phase fails the project still has render history so status is correct, only the thumbnail is missing — exactly the spec's intended degraded state.

**Alternatives considered**:
- *Synchronous upload before save* — would make every cover-image save round-trip include a Storage upload (~500 ms - 2 s additional latency). Rejected on UX grounds.
- *Server-side fetch + upload via Cloud Function* — would dodge the client `data:` size and the FAL CORS issue but add a cold-start cost and a third storage trip. Reject for V1; can revisit if the client-side proves fragile.

---

## R5 — Auto-save debounce window and coalescing

**Decision**: Debounce window = **3 s** of editor inactivity *or* hard flush at **30 s** since the first un-saved change, whichever comes first. Implementation in `src/lib/projectAutoSave.ts` as a small standalone module with no React deps so it's directly fixture-testable.

The 30 s ceiling guarantees SC-006 (tab-close-to-reachable ≤ 60 s) with margin. The 3 s inactivity window is the visible UX — users who pause typing see "Saving…" within a few seconds. Burst protection: 10 edits within 5 s with no 3-s gaps trigger 1 cloud save (the 30 s ceiling does not fire), comfortably under the SC-007 ≤ 2 limit.

**Rationale**: Spec assumption explicitly says "tens of seconds, not seconds" — 3 s + 30 s sits inside that envelope and is identical to common Google-Docs-style autosave. The matrix mentioned "30-second debounce" but the spec deliberately left the exact value to plan; this satisfies both the matrix's intent and the SC envelopes.

**Alternatives considered**:
- *Pure debounce with no ceiling* — fails the worst-case "user types continuously for 60 s" test against SC-006.
- *30 s fixed interval (the matrix's literal reading)* — wastes saves on trivial edits and makes the indicator feel laggy. Reject in favour of the debounce + ceiling combo.

---

## R6 — 3-strike cloud-save failure escalation

**Decision**: Failure counter is held in `projectAutoSave.ts` module state (per-tab, per-session — no need to persist across reloads). Increments on each cloud save rejection, resets to 0 on success. When the count reaches 3, the React hook flips to `cloudSaveFailedPersistent: true` which renders the persistent banner. Local IndexedDB save runs *before* the cloud save and never blocks on cloud completion, so failed cloud saves never lose work locally.

Manual "Try saving now" action invokes the same cloud-save function bypassing the debounce. Successful manual save resets the counter and dismisses the banner.

**Rationale**: Per-tab state avoids cross-tab confusion ("I dismissed the banner in tab A, why is it still here in tab B"). Local-first ordering is the safety net the spec promises (FR-017). Separating the "non-blocking inline error" state from the "persistent banner" state is what makes the 3-strike threshold legible in the UI.

**Alternatives considered**:
- *Persist failure counter in localStorage* — would survive reloads but creates a stale-banner UX after the user fixes the underlying problem and reloads. Reject.

---

## R7 — `getUserProjects` callable contract & pagination

**Decision**: New callable at `functions/src/savedProjects/getUserProjects.ts`, exported through `functions/src/index.ts`. Request:

```ts
{
  workspaceId?: string;       // optional; omit = all workspaces caller can see
  status?: 'draft' | 'rendered' | 'published';
  pageSize?: number;          // 1..100, default 50
  cursor?: string;            // opaque base64 of last-doc { timestamp, id }
}
```

Response:

```ts
{
  projects: SavedProjectListItem[];   // see contracts/getUserProjects.md for shape
  nextCursor: string | null;
}
```

Order: `timestamp DESC, id DESC` (id is the tiebreaker so cursor pagination is stable). Cursor is `base64(JSON.stringify({ timestamp, id }))` — opaque to clients.

For team members: callable looks up `users/{ownerUid}/team/members/{callerUid}` (Phase 12) to determine the owner-of-record and the workspace allowlist; queries iterate the owner's `users/{ownerUid}/projects` subcollection scoped to allowed workspace IDs. Owners see all their own projects.

**Rationale**: Cursor + composite-key tiebreaker is the standard Firestore-friendly pagination. Reusing the Phase-12 access matrix (instead of duplicating it) is mandated by Constitution principle XI. Pagination cap of 100 keeps payloads bounded; default 50 matches the project-list-render budget in plan.md performance goals.

**Alternatives considered**:
- *Offset-based pagination (`page=2`)* — Firestore doesn't support efficient offset, and would re-read documents the user already paginated past. Reject.
- *Stream/onSnapshot subscription instead of callable* — needed for live multi-device updates, but pagination + filtering on a live snapshot is significantly more code. Defer to a future iteration; FR-019 only requires a paginated list.

---

## R8 — IndexedDB schema migration

**Decision**: **No migration**. The new `status` and `thumbnailUrl` fields ride on the existing `ProAdsDB_V2` / `projects` store records as additional optional properties. Existing records load without those fields; the app treats `undefined` as "not yet computed" (FR-022 / FR-023 cover the upgrade path on next save).

**Rationale**: IndexedDB stores arbitrary JS objects — adding fields requires no schema bump. Keeping `ProAdsDB_V2` unchanged avoids the cost (and risk) of an `onupgradeneeded` migration that would block app startup on every existing user.

**Alternatives considered**:
- *Bump to `ProAdsDB_V3` and run a one-time backfill on open* — would compute status + upload thumbnails on first open, frontloading the work. Rejected as over-engineering: the spec explicitly chose opportunistic migration (FR-022 + Assumption "migration of pre-existing projects is opportunistic, not bulk").

---

## R9 — Firebase Storage rules for thumbnails

**Decision**: Add to `storage.rules`:

```firestore-security-rules
match /users/{uid}/projects/{projectId}/thumbnail.{ext} {
  allow read, write: if request.auth != null && request.auth.uid == uid;
}
```

**`getUserProjects` is the authorisation boundary** — it decides who is told the long-lived Firebase download URL for an owner's thumbnail. Cross-uid programmatic SDK reads of `users/{otherUid}/projects/{projectId}/thumbnail.{ext}` are denied by the V1 rule; team members never call `getDownloadURL()` against another user's path. They render the URL the callable handed them.

**Important caveat — download URLs are bearer tokens, not auth-checked fetches.** A long-lived `?token=…` Firebase download URL bypasses Storage Rules on every fetch — the Firebase SDK does **not** "re-sign" the request with the caller's auth token at HTTP fetch time. Possession of the URL is sufficient to fetch the bytes. In practice this means: anyone in possession of the URL string (a team member who legitimately received it; another tab; a network observer if the URL leaks; a logging system that captured the response payload) can GET the thumbnail until the token is revoked. For Phase 13's launch surface this is an acceptable trade-off — thumbnails are 64×64 cropped jpgs of ad creative the user is already preparing to publish. If a stricter posture is later required, switch the client off `<img src=…>` and onto path-based SDK reads (`getBlob` / `getBytes` against `users/{ownerUid}/projects/{projectId}/thumbnail.jpg`) and use the V2 storage rule (with `isTeamMemberOf(...)`) so Storage Rules enforce per-request access checks instead of relying on URL secrecy.

**Rationale**: Matches the spec's "user-scoped storage" assumption and the Phase-12 pattern of routing cross-user data access through callables, never raw Storage/Firestore reads. The bearer-token caveat is a known property of Firebase download URLs, not a Phase-13 regression.

**Open consideration noted in `contracts/storage-rules.md`**: If team-member rendering of owner-uid thumbnails fails (because the rule denies `request.auth.uid == uid`) AND we have moved off URL-fetch onto path-fetch as above, switch to the V2 rule with the Phase-12 "is-team-member" subexpression.

---

## R10 — Status-tab "Published" empty state when Meta is unconnected

**Decision**: When the Published tab is selected and the response contains 0 projects AND the user has `metaConnected !== true` on their user doc, the panel renders an empty state with copy: *"No published projects yet — connect Meta to push ads from saved projects."* with a button linking to the existing Meta-connect flow. Otherwise (Meta connected but no published projects) the empty state reads simply *"You haven't pushed any projects to Meta yet."* — no upsell.

**Rationale**: Matches the spec's edge case "Status filter Published returns zero projects for a user who has never connected Meta." Two-message variant prevents nagging users who already connected Meta.

**Alternatives considered**:
- *Always show the connect-Meta CTA* — irritates connected users. Reject.

---

## R11 — Test infrastructure for new fixtures

**Decision**: Add `functions/src/__tests__/savedProjects.test.ts` using the existing `node:assert/strict` pattern. Run via the existing `npm test` script in `functions/`. Tests cover:

1. `deriveStatus` — draft + render→rendered, draft + meta→published, rendered + meta→published, **published + meta-removed→published (latch)**, undefined-prev + meta→published.
2. `resolveCoverImage` — single, carousel, batch, format-switched (single→carousel uses slide 1).
3. `enforceProjectQuota` — at-cap rejection, over-cap update allowed, Scale unlimited.
4. `getUserProjects` — owner sees all, team member with workspace A only sees only A, team member request for B is denied, pagination cursor stable across pages, status filter narrows correctly.

Fixture data set lives in `functions/src/__tests__/__fixtures__/savedProjects.fixtures.ts` and is **also** importable by the frontend `src/lib/projectStatus.ts` companion test (R1's anti-drift mechanism). Frontend test file: not added in this phase (no frontend test runner in use; the spec's user-story Independent Tests cover frontend manually).

**Rationale**: Matches the existing `contractFixtures.test.ts` pattern; introducing Vitest for the frontend is out of scope for Phase 13.

**Alternatives considered**:
- *Add Vitest to the frontend just for this phase* — pulls infrastructure scope into Phase 13 that belongs in a dedicated tooling spec. Defer.

---

## Open items (intentionally deferred to implementation)

- **Exact pagination page size** — research confirms 50 by default; tasks may revisit if real workspaces show >100 typical.
- **Status badge colour palette** — the existing app uses Tailwind colours; tasks will pick the exact Tailwind class names against the active theme.
- **Banner copy text in Arabic and English** — final wording lives in `src/i18n/savedProjects.ts`; tasks will pick wording consistent with existing app voice.
- **`getUserProjects` rate limiting / cost guard** — at the listing scale assumed in Technical Context (≤ 50 / page, opaque cursor) we expect Firestore read costs to be negligible. If team-member listings of busy workspaces become a cost hotspot the callable gains the existing `rateLimits` collection guard from Phase 9.
