# Implementation Plan: Workspace Logic (Scale Mode)

**Branch**: `012-workspace-logic` | **Date**: 2026-04-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-workspace-logic/spec.md`

## Summary

Phase 12 turns the existing client-side-only `Workspace` model into a server-governed, plan-gated, team-scopable primitive. Scale-plan owners can create up to 10 workspaces; each workspace can bind its own Meta ad account (Advertiser-or-higher); every generation and saved project is tagged with the workspace that was active when it was produced; team owners can grant individual members access to specific workspaces; switching workspace mid-generation is guarded; and workspace deletion is soft (30-day retention + restore). Every grant/revoke of workspace access writes an append-only audit entry the owner can read.

Technical approach — keep to the existing stack: Cloud Functions v2 callables validate plan + ownership + Meta-role preconditions and write to a `users/{uid}/workspaces/{workspaceId}` Firestore subcollection; read queries on generations and saved projects gain a `workspaceId` filter path; team member docs at `users/{ownerUid}/team/{memberId}` gain a `workspaceAccess: string[]` field; `WorkspaceSettingsModal.tsx` + `WorkspaceSwitcher.tsx` + `Team.tsx` are extended (no new top-level screen). A new `workspace_access_audit` subcollection under the owner records grants/revokes. Follow Principle XI (frontend and backend MUST both enforce): frontend filters via client-side `workspaceAccess` + plan gate; backend refuses every workspace-scoped call that cannot verify authorization (fail-closed per FR-025).

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions)
**Primary Dependencies**:
- Frontend: React 19, Zustand (store), Tailwind CSS 3, Firebase JS SDK (Firestore `onSnapshot`, `query`, `where`, `orderBy`, `limit`)
- Backend: Firebase Cloud Functions v2 (`onCall`), `firebase-admin` Firestore, `HttpsError`, Meta Marketing API v20 (ad-account role probe)
**Storage**:
- Firestore:
  - `users/{uid}/workspaces/{workspaceId}` (new: full workspace doc incl. `deletedAt`, `metaAdAccountId`, `metaAdAccountName`)
  - `users/{uid}/workspace_access_audit/{entryId}` (new: append-only grant/revoke log)
  - `users/{uid}/team/{memberId}` (existing; adds `workspaceAccess: string[]`)
  - `generations/{genId}` (existing; writes gain `workspaceId` field)
  - `users/{uid}/projects/{projectId}` (existing; already has `workspaceId?`)
- No Storage or Realtime DB changes. Soft-delete retention is enforced at the read path + a scheduled purge function (daily).
**Testing**: `functions/src/contractFixtures.test.ts` + sibling `*.test.ts` files (vitest-equivalent runner already wired via `cd functions && npm test`). New: `workspace.test.ts` contract fixtures for the nine workspace-facing callables (`createWorkspace`, `updateWorkspace`, `deleteWorkspace`, `restoreWorkspace`, `linkMetaAccountToWorkspace`, `unlinkMetaAccountFromWorkspace`, `setTeamMemberWorkspaceAccess`, `getWorkspaceGenerations`, `getWorkspaceAccessAuditLog`), the generation-payload extension, and the scheduled `purgeExpiredWorkspaces` job.
**Target Platform**: Same as existing product — web (Vite dev + Firebase Hosting prod) + Cloud Functions v2 (nodejs20).
**Project Type**: Web application — React frontend + Firebase Cloud Functions backend (Option 2 in the template).
**Performance Goals**:
- Workspace-scoped generation list: p95 < 800ms for a page of 20 records (Firestore composite index on `workspaceId + timestamp desc`).
- `createWorkspace` / `updateWorkspace` / `deleteWorkspace` callable: p95 < 500ms end-to-end.
- Scheduled purge of soft-deleted workspaces: completes within 5 minutes for up to 1,000 expired workspaces per nightly run.
**Constraints**:
- Fail-closed authorization on every workspace-scoped read/write (FR-025 + Principle XI).
- No silent downgrade of workspace caps when plan drops Scale → Pro (spec Assumptions — downgrade grace rule).
- Soft-delete must preserve `workspaceAccess` references so a restore within 30 days is lossless.
- Meta role verification on link must fail with a distinct `insufficient-meta-role` error code so the UI can route to a helpful message.
**Scale/Scope**:
- Per-account workspace cap: 10 (Scale), 1 (all other plans — default workspace).
- Team members per account: bounded by Phase 6 team cap (already enforced).
- Audit entries: unbounded append-only, no retention policy this phase (low write volume — handful per account per week).
- Generations per workspace: no hard cap; paginated reads.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against the 12 principles in `.specify/memory/constitution.md` v1.1.0.

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Reliability over feature count | ✅ PASS | Phase 12 reduces silent-loss surfaces (mid-generation switch, workspace delete cascade, Meta role mismatch). No mode, combination, or option is introduced that broadens the launch surface. |
| II | Selected mode MUST be obeyed | ✅ PASS | Workspace selection — an explicit user input — is now respected end-to-end: generations get tagged, Meta push targets the workspace's ad account. Previously the workspace only affected brand colors client-side. |
| III | Launch surface frozen | ✅ PASS | Phase 12 is on the approved launch matrix; no new creative modes, formats, or languages are introduced. |
| IV | Behavior contracts beat subjective judgment | ✅ PASS | 25 FRs + FR-020a/b + FR-006a/b, every FR mapped to at least one acceptance scenario or edge case. Distinct error codes for insufficient Meta role, below-Scale plan, default-workspace deletion, unknown ad account. |
| V | Arabic quality is first-class | ✅ PASS | No user-facing generation copy change. All user-facing strings (error messages, switch-guard dialog, access-denied states) MUST be provided in Arabic (via existing `i18n.tsx`) and English at the same time. Added as a plan-level constraint in `research.md`. |
| VI | Hidden machine layers MUST be auditable | ✅ PASS | Soft delete + restore, access grants/revokes, workspace-binding overrides of the default Meta ad account are all logged to Firestore (`workspace_access_audit`) or the resolution trace (for generation-time workspace binding decisions). |
| VII | No silent override without rule, signal, trace | ✅ PASS | Downgrade grace rule (no silent data loss), soft-delete (no silent purge), mid-generation switch guard (no silent draft loss), stale Meta-role detection at publish (no silent publish failure). Each has a defined rule, a user signal, and a traced write. |
| VIII | Cost discipline | ✅ PASS | No extra generation spend. Firestore reads are paginated; composite index on `workspaceId + timestamp` is O(page size), not O(collection). Scheduled purge runs once daily, batch-writes deletes. Meta role probe is one API call per link attempt (not per publish). |
| IX | Proof required for every claimed fix | ✅ PASS | `contractFixtures.test.ts` additions (section 12.12 in the launch matrix) cover the four highest-risk paths: below-Scale create refused, default-delete refused, unknown-ad-account link refused, generation record gets `workspaceId`. Plan adds tests for insufficient-Meta-role refused, soft-delete + restore fidelity, audit-entry write, and workspace-scoped list access enforcement. |
| X | Spec before code | ✅ PASS | This plan exists, `spec.md` is finalized, `research.md`, `data-model.md`, `contracts/`, `quickstart.md` generated before any production code is written. |
| XI | Frontend and backend MUST agree on truth | ✅ PASS | Plan-gating enforced in **both**: frontend `WorkspaceSwitcher.tsx` disables "New Workspace" button below Scale; `createWorkspace` Cloud Function throws `permission-denied` regardless. Same for workspace access filter and Meta role check. |
| XII | Deferred scope MUST remain deferred | ✅ PASS | Audit log export/UI, per-workspace credit pools, cross-workspace analytics, workspace archiving (distinct from delete), workspace-level billing — all explicitly marked out of scope in `spec.md` Assumptions; `plan.md` does not pull any of them forward. |

**Gate result: PASS.** No violations. `## Complexity Tracking` below is left empty (no justifications needed).

## Project Structure

### Documentation (this feature)

```text
specs/012-workspace-logic/
├── plan.md                     # This file
├── research.md                 # Phase 0 output
├── data-model.md               # Phase 1 output
├── quickstart.md               # Phase 1 output
├── contracts/                  # Phase 1 output
│   ├── createWorkspace.md
│   ├── updateWorkspace.md
│   ├── deleteWorkspace.md
│   ├── restoreWorkspace.md
│   ├── linkMetaAccountToWorkspace.md
│   ├── unlinkMetaAccountFromWorkspace.md
│   ├── setTeamMemberWorkspaceAccess.md
│   ├── getWorkspaceGenerations.md
│   ├── getWorkspaceAccessAuditLog.md
│   ├── purgeExpiredWorkspaces.scheduled.md
│   └── generation-payload-extension.md
├── checklists/
│   └── requirements.md         # Spec quality checklist (done)
├── spec.md                     # Feature spec (done)
└── tasks.md                    # NOT created here; /speckit.tasks emits it
```

### Source Code (repository root)

```text
functions/
├── src/
│   ├── index.ts                # Extend: callables createWorkspace, updateWorkspace, deleteWorkspace,
│   │                           #         restoreWorkspace, linkMetaAccountToWorkspace,
│   │                           #         unlinkMetaAccountFromWorkspace, setTeamMemberWorkspaceAccess,
│   │                           #         getWorkspaceGenerations, getWorkspaceAccessAuditLog
│   │                           # Extend: generateHooks/generateConcepts/generateImage/generateCaption to
│   │                           #         accept activeWorkspaceId and write workspaceId + use workspace's
│   │                           #         linked Meta ad account for push
│   │                           # Extend: scheduled purgeExpiredWorkspaces (daily)
│   ├── workspaces/             # NEW module — owns workspace validation, Meta role probe, audit writes
│   │   ├── index.ts            # Barrel
│   │   ├── workspacePolicy.ts  # Plan-gate + ownership + role checks (single source of truth)
│   │   ├── metaRoleProbe.ts    # Meta Marketing API role check (Advertiser-or-higher)
│   │   ├── workspacePurge.ts   # Scheduled purge logic (>30 days soft-deleted → hard delete)
│   │   └── auditLog.ts         # Append-only grant/revoke writes + owner-scoped reads
│   ├── billing/                # EXISTING — read billingState.plan here
│   └── __tests__/
│       └── workspace.test.ts   # NEW contract fixtures (12.12 expanded)
src/
├── types.ts                    # Extend Workspace (add metaAdAccountId, metaAdAccountName, deletedAt)
│                               # Extend GenerationRecord workspaceId (already present as optional)
│                               # Add WorkspaceAccessAuditEntry
├── store.ts                    # Zustand extensions: switchGuard state, audit cache, soft-deleted filter
├── services/
│   ├── workspaceService.ts     # NEW — thin facade over httpsCallable for all workspace callables
│   └── metaService.ts          # EXISTING — used to list user's connected ad accounts
├── components/
│   ├── WorkspaceSettingsModal.tsx   # Extend: Meta ad account picker + Disconnect, plan-gated actions
│   ├── WorkspaceSwitcher.tsx        # Extend: switch guard dialog, plan-filter, access-filter
│   └── WorkspaceAccessAuditPanel.tsx # NEW owner-only panel (minimal list; deferred UI for later phase)
├── pages/
│   └── Team.tsx                # Extend: per-member workspace access checkbox matrix
├── i18n.tsx                    # Extend: add AR + EN strings for all new user-facing text
└── __tests__/
    └── workspace.test.tsx      # NEW — switch-guard + switcher plan/access filter unit tests

firestore.rules                 # Extend: users/{uid}/workspaces/** read = owner or team member w/ access;
                                #          users/{uid}/workspace_access_audit/** read = owner only;
                                #          users/{uid}/team/{memberId} — existing rules already cover
firestore.indexes.json          # Add: composite index on (workspaceId asc, timestamp desc) for generations
```

**Structure Decision**: Option 2 (Web application — React frontend + Firebase Cloud Functions backend). This feature touches both layers in lockstep (Principle XI) so both directories are extended. No new top-level directory; existing paths own the change.

## Phase 0 — Outline & Research

Research questions that drive design decisions, and the decisions captured in `research.md`:

1. **How to verify Meta Advertiser-or-higher role at link time?**
   → Meta Marketing API: `GET /{ad-account-id}?fields=user_role` returns the caller's role (enum: `ADMIN`, `ADVERTISER`, `ANALYST`, `FINANCE_EDITOR`, `FINANCE_ANALYST`, `EMPLOYEE`). Accept `ADMIN` or `ADVERTISER`. One API call per `linkMetaAccountToWorkspace` call.

2. **Soft-delete purge strategy.**
   → Scheduled function `purgeExpiredWorkspaces` runs daily at 04:00 UTC (after `metaDailySync` at 03:00 in Phase 14), `where('deletedAt', '<=', now - 30 days)`, page 500 at a time, batch-delete workspace doc + any orphaned `workspace_access_audit` entries (kept per Principle VI — no, audit stays; the workspace doc itself and per-generation workspace linkage is what gets purged). Generations and saved projects that were reassigned to default stay reassigned (already migrated at delete time).

3. **Atomic delete + cascade-reassign.**
   → Always two-phase (matches research.md R3 and tasks T021/T022): **Phase A (synchronous, in-callable)** sets `deletedAt = serverTimestamp()` and `pendingReassign = true` on the workspace doc so the UI receives immediate feedback and the switcher filters it out on next snapshot. **Phase B (asynchronous, Firestore trigger on the `deletedAt` write)** paginates `generations where workspaceId == target` and `users/{ownerUid}/projects where workspaceId == target` in 400-write batches, sets `workspaceId = defaultId` + `reassignedFromWorkspaceId = target` on each, then clears `pendingReassign`. A single-transaction cascade is explicitly rejected because workspace-sized reassign sets can exceed Firestore's 500-write transaction limit.

4. **Soft-delete restore fidelity.**
   → Because the workspace doc is never purged during the 30-day window, restore is simply `update workspace.deletedAt = null`. Reassigned generations need to move back: store a sidecar `reassignedFromWorkspaceId` on each reassigned record at delete time, and on restore query by that field and revert.

5. **Field-level last-write-wins semantics.**
   → Firestore `update()` with partial field set already gives us exactly this. No custom merge logic. Rejected: optimistic-concurrency via `updatedAt`-check — spec Q2 explicitly chose LWW.

6. **Workspace-scoped generation queries & indexing.**
   → Single composite index on `generations` collection: `workspaceId ASC, timestamp DESC`. Existing `userId`-only queries stay working. Fallback read for generations with missing `workspaceId`: per FR-015, treat as default workspace at read time — the callable returns `where('userId', '==', uid) AND workspaceId IN [target, null]` when the target is the default workspace.

7. **Team access filter — client-side vs server-side.**
   → Both (Principle XI). Server side: `getWorkspaceGenerations` verifies caller is owner OR (team member WHERE `workspaceAccess` contains target workspace). Client side: `WorkspaceSwitcher.tsx` filters the visible workspace list by the same rule. Security rules back both with a read-allow-if-team-member-with-access predicate.

8. **Mid-generation switch trigger definition.**
   → Re-use the same predicate already used for auto-save: Zustand `hasData(inputs) || tovText || conceptsText || buildPlan || mockupHistory.length > 0 || captionText`. When true and the user picks a different workspace in `WorkspaceSwitcher.tsx`, open the confirm dialog.

9. **Arabic / English strings for every new user-facing state.**
   → Four new state surfaces: switch-guard dialog (3 buttons + body), Meta role insufficient error, Scale-plan-required upgrade prompt, no-workspace-access empty state. All four MUST have AR + EN keys in `i18n.tsx` before merge (Principle V).

10. **Audit entry shape — doc ID determinism.**
    → Doc ID = `{timestampMs}_{randomSuffix}` for natural time-ordering. Query by `orderBy('timestamp', 'desc')` with `limit` and cursor. Minimum fields: `actorUid`, `targetMemberUid`, `workspaceId`, `action`, `timestamp`, `plan` (snapshot — for historical context if a downgrade happens later).

**Output**: `research.md` with the 10 decisions, rationale, and rejected alternatives.

## Phase 1 — Design & Contracts

**Prerequisites**: `research.md` complete.

### 1. Entities → `data-model.md`

Entities captured:
- **Workspace** (extended) — full field table including `deletedAt`, Meta binding, read-path filter rule.
- **Generation** (extended) — `workspaceId` upgraded from `optional` to `required on create`; backfill rule documented.
- **SavedProject** (extended) — unchanged schema, but delete-cascade semantics documented.
- **TeamMembership** / **TeamMember doc** (extended) — adds `workspaceAccess: string[]`.
- **WorkspaceAccessAuditEntry** (new) — full field table + ID scheme + access rules.
- **PlanGate** (logical) — table of plan → workspace cap (none=1, starter=1, pro=1, scale=10).

State transitions:
- Workspace: `active` → (delete) → `soft-deleted` → (restore within 30d) → `active` | (30d elapse) → `purged`.
- Generation `workspaceId` field: never mutated post-create, except during delete-cascade-reassign (bulk) and delete-restore (bulk back).

### 2. Interface contracts → `/contracts/`

One file per callable + one for the scheduled purge + one for the generation-payload extension. Each contract document specifies request shape, response shape, error taxonomy with specific `HttpsError` codes, authorization rules, and happy/sad-path examples. Contracts listed:

| Contract | Callable name | Role |
|---|---|---|
| `createWorkspace.md` | `createWorkspace` | Scale-only create, cap 10 |
| `updateWorkspace.md` | `updateWorkspace` | Field-level LWW patch |
| `deleteWorkspace.md` | `deleteWorkspace` | Cascade + soft-delete |
| `restoreWorkspace.md` | `restoreWorkspace` | Within 30d; support/admin-gated |
| `linkMetaAccountToWorkspace.md` | `linkMetaAccountToWorkspace` | Advertiser-or-higher gate |
| `unlinkMetaAccountFromWorkspace.md` | `unlinkMetaAccountFromWorkspace` | Reverts to account default |
| `setTeamMemberWorkspaceAccess.md` | `setTeamMemberWorkspaceAccess` | Owner-only; writes audit entry |
| `getWorkspaceGenerations.md` | `getWorkspaceGenerations` | Auth-check + paginated list |
| `getWorkspaceAccessAuditLog.md` | `getWorkspaceAccessAuditLog` | Owner-only read |
| `purgeExpiredWorkspaces.scheduled.md` | `purgeExpiredWorkspaces` | Daily scheduled cleanup |
| `generation-payload-extension.md` | (payload spec) | Describes `activeWorkspaceId` field added to `generateHooks / generateConcepts / generateImage / generateCaption` payloads and `workspaceId` written to `generations/{id}` |

Error-code taxonomy (shared across contracts):
- `permission-denied: scale_plan_required` — below-Scale plan creating a workspace.
- `permission-denied: workspace_access_denied` — team member without access.
- `permission-denied: owner_only` — restore / audit-log / set-access.
- `failed-precondition: default_workspace_undeletable` — delete on default.
- `failed-precondition: workspace_limit_reached` — Scale reaching 10.
- `failed-precondition: insufficient_meta_role` — link with Analyst-or-lower.
- `failed-precondition: meta_account_not_connected` — link with unknown ad account ID.
- `failed-precondition: workspace_purged` — restore after 30 days.
- `not-found: workspace_not_found` — update/delete on missing or already-purged.

### 3. Quickstart → `quickstart.md`

- Local dev setup pointers: `npm run dev` (frontend), `firebase emulators:start --only functions,firestore` (backend).
- An 8-step manual smoke (see `quickstart.md` section 3): (1) sign in as Scale user, (2) create "Client Brand A", (3) link a Meta ad account, (4) generate an ad → verify `workspaceId` and correct Meta account, (5) switch-guard verification mid-generation, (6) per-workspace filtering in history, (7) invite a teammate, grant workspace access, then delete & restore, (8) Arabic RTL pass on new surfaces.
- Backend test runner: `cd functions && npm test -- workspace`.

### 4. Agent context update

Run the update script to register Phase 12 tech context into `CLAUDE.md`.

**Output**: `research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md`, updated `CLAUDE.md`.

## Post-Design Re-Evaluation (Constitution Re-Check)

Re-checked after Phase 1 artifacts (`research.md`, `data-model.md`, `contracts/*.md`, `quickstart.md`) were written. **Result: PASS — all 12 principles still satisfied.** Specific checks:

- **Principle VI** — every new hidden layer is logged: Meta role probe result persisted on workspace (`metaRoleAtLinkTime`); delete/restore cascades set explicit `pendingReassign` / `pendingRestore` flags and a `reassignedFromWorkspaceId` sidecar; access grants/revokes write to `workspace_access_audit`; generation resolution trace carries `workspaceId` and the effective `metaAdAccountId`.
- **Principle VII** — soft-delete, downgrade grace, mid-generation switch guard, and post-link Meta role downgrade detection all have a rule, a user signal, and a trace. No silent override surfaces in the Phase 1 design.
- **Principle XI** — every workspace-scoped read is gated in callable auth checks AND Firestore security rules AND client-side filter (R7). `createWorkspace` plan gate is enforced both client-side (disable button below Scale) and backend (throw `permission-denied: scale_plan_required`).
- **Principle VIII** — no retries loops; one Meta role probe per link + one re-probe per push; Firestore reads are indexed and paginated; purge is a daily batched sweep.
- **Principle V** — R9 enumerates AR + EN strings for every new user-facing surface before merge.

No violations surfaced; `## Complexity Tracking` stays empty.

## Complexity Tracking

> **Empty — no Constitution violations, no justifications required.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_ | _(none)_ | _(none)_ |
