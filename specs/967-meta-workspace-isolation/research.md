# Phase 0 Research: Workspace-Aware Meta Integration

**Feature**: `967-meta-workspace-isolation` | **Date**: 2026-08-18
**Status**: Complete — both blocking findings resolved by the product owner on 2026-08-18 (R1 → Option A, R4 → Option A, executed as one repair)

---

## R1 — Root cause of the missing workspaces (FR-025, blocking)

**Decision**: The Funnel Settings selector is not filtering anything. The missing workspaces never arrive at the client: the Firestore query itself excludes them.

### Evidence chain

The workspace subscription (`src/App.tsx:2685-2689`) reads:

```js
const wsQuery = query(
  wsRef,
  where('deletedAt', '==', null),
  orderBy('createdAt', 'desc')
);
```

Firestore's `where(field, '==', null)` matches **only documents where the field exists and holds null**. A document that has no `deletedAt` key at all is not a match and is never returned.

Workspace documents were not always written with a `deletedAt` key. Before commit `1f23d5e` (*"feat(023): T021-T030 copy fidelity banner, workspace routing, team access matrix"*, 2026-05-21) both creation paths were client-side `addDoc` calls that omitted it:

| Path | Shape written | Has `deletedAt`? |
|---|---|---|
| Default-workspace bootstrap (pre-`1f23d5e`, `App.tsx:1708-1712`) | `{ name, brandName, createdAt, isDefault: true }` | **No** |
| User-created workspace (pre-`1f23d5e`, `App.tsx:1736`) | `{ ...data, createdAt }` | **No** |
| `createWorkspace` callable (post-`1f23d5e`, `functions/src/index.ts:6519-6521`) | `{ …, isDefault: false, createdAt, deletedAt: null }` | **Yes** |

The pre-`1f23d5e` read path filtered **client-side**: `.filter(ws => ws.deletedAt == null)` (`App.tsx:1706`). In JavaScript `undefined == null` is `true`, so documents missing the field passed. Correct behaviour, by accident of loose equality.

The Round-13 change moved that predicate into the Firestore query — to satisfy a team-member security rule, see R6 — and in doing so silently changed its semantics from "null or absent" to "explicitly null". Every workspace created before 2026-05-21 became invisible to every reader, owner and team member alike.

**This matches the reported symptom exactly**: 3 of 9 visible. The 3 visible workspaces are those created after 2026-05-21 through the callable; the 6 invisible ones predate it. It also explains why PR #65 changed nothing — that PR removed a client-side `!!w.metaAdAccountId` filter, but the six documents never reached the client to be filtered.

**Confirms the three prior exclusions**: not soft-delete *filtering* (it is soft-delete *querying*), not a deploy or cache issue (a schema divergence, deploy-independent), and not team-member-specific (it affects owners identically — as reported).

### Affected surfaces (FR-026)

All workspace consumers read the single subscription at `src/App.tsx:2668-2689` and share `workspaces` state. One query fix covers every surface: the Funnel Settings selector, the workspace switcher, the ad-account linker, `defaultWsId` derivation (`App.tsx:2923`), and the project/avatar workspace filters. No second query with the same defect was found.

### Complication: the security rule (see R6)

The predicate cannot simply be deleted. `firestore.rules:88-92` grants team members read access only when `resource.data.deletedAt == null`. For a document with no such key, that expression must be assumed to fail, denying the read — and a denied document fails the whole query, not just that row. So the query predicate and the rule predicate have to move together.

### Options

| Option | Description | Cost |
|---|---|---|
| **A (recommended)** | One-time backfill writing `deletedAt: null` onto every workspace document that lacks it. Query and rules stay as they are. | A repair script. Conflicts with the spec's "no backfill script" non-goal — see note below. |
| B | Change the rule to a defaulting accessor (`resource.data.get('deletedAt', null) == null`) and drop the query predicate. | No data write, but relies on query-vs-rule interaction that must be verified against the emulator before trusting. |
| C | Both A and B. | Belt and braces; most work. |

**DECIDED — Option A** (product owner, 2026-08-18). The "no backfill script" non-goal covers the Page migration only; repairing workspace documents missing a structural field is a defect fix, not a migration. Recorded as FR-026c and in the spec's Clarifications; the non-goal has been reworded to say so explicitly. Executed as a single repair together with R4.

**Alternatives considered**: reverting Round-13 to client-side filtering — rejected, it reintroduces the team-member rule failure Round-13 existed to fix.

---

## R2 — Inventory of Meta-touching server operations (FR-001)

**Decision**: 19 entry points, matching the count in the original report. They split into two groups by whether an authenticated caller exists.

**Group 1 — has `request.auth.uid`, convert to `resolveMetaScope(request)` (15)**

| # | Operation | File |
|---|---|---|
| 1 | `getMetaConnection` | `functions/src/index.ts:3340` |
| 2 | `metaSelectAccount` | `functions/src/index.ts:3366` |
| 3 | `metaSelectPage` | `functions/src/index.ts:3404` |
| 4 | `metaDisconnect` | `functions/src/index.ts:3437` |
| 5 | `metaSyncPerformance` | `functions/src/index.ts:3458` |
| 6 | `metaPushCreative` | `functions/src/index.ts:3686` |
| 7 | `metaPushCreativePack` | `functions/src/index.ts:5705` |
| 8 | `linkMetaAccountToWorkspace` | `functions/src/index.ts:6701` |
| 9 | `unlinkMetaAccountFromWorkspace` | `functions/src/index.ts:6756` |
| 10 | `saveFunnelSettings` | `functions/src/funnelSettings.ts:260` |
| 11 | `getFunnelSettings` | `functions/src/funnelSettings.ts:390` |
| 12 | `dismissAdvisory` | `functions/src/funnelSettings.ts:440` |
| 13 | `connectMetaAccount` | `functions/src/metaConnection.ts:108` |
| 14 | `disconnectMetaAccount` | `functions/src/metaConnection.ts:235` |
| 15 | `triggerMetaSync` | `functions/src/metaSync/trigger.ts:25` |

**Group 2 — no authenticated caller, needs bespoke treatment (4)**

| # | Operation | Identity source | Treatment |
|---|---|---|---|
| 16 | `metaOAuthCallback` (`onRequest`) | `state` query parameter | Resolve member→owner **after** reading the uid (FR-020a-i). Do not touch how `state` is produced or validated (FR-020a-ii). |
| 17 | `metaDataDeletion` (`onRequest`) | Signed request from Meta | No caller to resolve; out of the FR-001 conversion. Verify it targets the right account record. |
| 18 | `metaDailySync` (`onSchedule`) | None — iterates accounts | No caller to resolve. Confirm it iterates owner accounts only, never member accounts. |
| 19 | `metaSyncAccountWorker` (`onTaskDispatched`) | Task payload | Payload uid must already be an owner uid; the enqueuer resolves. |

`probeMetaRole` (`functions/src/workspaces/metaRoleProbe.ts`) is a helper, not an entry point — it takes a token and account id and has no uid to resolve.

**Rationale**: the ticket's "grep for `request.auth.uid`" instruction over-counts badly — `functions/src/index.ts` alone has 69 occurrences, most unrelated to Meta. The enumeration above is by entry point and Meta-data contact, which is what FR-001 actually scopes.

---

## R3 — `resolveCallerScope` contract

**Decision**: Use it as the sole uid resolver in Group 1, and honour `readDegraded` at every call site.

`functions/src/workspaces/workspacePolicy.ts:263` returns `{ ownerUid, allowedWorkspaceIds, storedWorkspaceAccess, readDegraded? }`.

- `allowedWorkspaceIds` is `string[] | "ALL"` — the permitted workspace set for FR-004/FR-021.
- **`readDegraded` is the trap.** On a transient Firestore failure the helper falls back to `ownerUid = callerUid`, which is indistinguishable from a genuine self-scope. Any call site deciding on `ownerUid` must check it first and fail retryable, or it will silently write a team member's data under their own account — exactly FR-003, and exactly the mis-attribution the helper's own docstring warns about.

**Reference implementation**: `functions/src/savedProjects/getUserProjects.ts:39`.

**Rationale**: hand-rolling the member→owner lookup per callable is what produced the current split. One helper, one semantic.

---

## R4 — Default-workspace resolution is currently broken (blocking FR-012)

**Decision**: `resolveDefaultWorkspaceId` cannot be relied on as written; the clarified FR-012 fallback needs a working definition of "default workspace" first.

`resolveDefaultWorkspaceId` (`workspacePolicy.ts:161-173`) queries `where("isDefault", "==", true).limit(1)` and throws `not-found` when empty.

But **no server path ever writes `isDefault: true`.** `createWorkspace` hard-codes `isDefault: false` (`index.ts:6519`), and since `1f23d5e` every workspace — including the bootstrap default — is created through it. The client-side object at `App.tsx:2778` sets `isDefault: true` only in its local optimistic copy, which is never persisted.

Consequence: only accounts whose default workspace predates 2026-05-21 have `isDefault: true` — and those are precisely the documents missing `deletedAt` from R1. For every account onboarded after that date, `resolveDefaultWorkspaceId` throws.

This directly blocks the FR-012 decision (server resolves the default workspace when the request names none): on newer accounts there is no default to resolve, so publishing would hit FR-012a's refusal instead of working as it does today — the regression FR-012b exists to prevent.

### Options

| Option | Description |
|---|---|
| **A (recommended)** | Make `createWorkspace` set `isDefault: true` when the account has no other active workspace, and fold an `isDefault` repair into the R1 backfill (oldest active workspace per account, if none flagged). |
| B | Redefine "default workspace" as "oldest active workspace" and resolve positionally, ignoring the flag entirely. No writes; leaves a misleading flag in the data. |
| C | Resolve `isDefault: true` first, fall back to oldest active workspace. Tolerant of both shapes, no writes required. |

**DECIDED — Option A** (product owner, 2026-08-18), folded into the R1 repair since both touch the same documents. `createWorkspace` must mark the first workspace on an account as the default, and the repair marks the oldest active workspace on any account that has none. Recorded as FR-026d.

**Implementation note**: the `isDefault` decision must be made **inside** the existing `createWorkspaceWithLimit` transaction (`workspacePolicy.ts:139` already reads the active-workspace list there). Deciding outside it lets two concurrent creations on a fresh account each observe zero workspaces and both claim the default.

**Rationale**: FR-012b promises single-workspace accounts see no change. Neither is deliverable while the default is unresolvable.

---

## R5 — Where the active ad account and Page live today

**Decision**: Page selection is written globally and read globally; the workspace document is the intended home and already holds the ad-account half.

| Data | Current location | After this phase |
|---|---|---|
| OAuth token, `adAccounts[]`, `pages[]` | `metaConnections/{uid}` | Unchanged — remains the single source |
| `selectedAccountId` / `selectedPageId` / `selectedPageName` | `metaConnections/{uid}` | Legacy read-only fallback (FR-009) |
| `metaAdAccountId` / `metaAdAccountName` | `users/{uid}/workspaces/{id}` | Unchanged — already correct |
| `metaPageId` / `metaPageName` | *does not exist* | **New** on `users/{uid}/workspaces/{id}` (FR-005) |

Write sites for the global Page: `metaSelectPage` (`index.ts:3430-3431`), cleared by `metaSelectAccount` (`index.ts:3393-3394`) and on connect (`index.ts:3323-3324`).
Read sites: `metaPushCreative` (`index.ts:3790-3791`), `getMetaConnection` (`index.ts:3356-3357`), frontend `App.tsx:4072`, `12819`, `12834`.

`metaPushCreativePack` already reads `workspace.metaAdAccountId` when `activeWorkspaceId` is supplied (`index.ts:5725-5734`) but falls through to `conn.selectedAccountId` — the fallback FR-014 removes. `metaPushCreative` has no workspace awareness at all: `const accountId = conn.selectedAccountId` (`index.ts:3709`).

---

## R6 — Team members cannot write workspace documents directly

**Decision**: FR-017 and FR-018 must be delivered through Cloud Functions. No client-side write path can satisfy them.

`firestore.rules:86-93`:

```
match /workspaces/{workspaceId} {
  allow read, write: if request.auth.uid == userId;          // owner only
  allow read:        if …isTeamMember == true
                      && …teamOwnerUid == userId
                      && resource.data.deletedAt == null;    // members: READ only
}
```

Team members have **read** access, never write. Since callables run under the Admin SDK and bypass rules, routing Page selection and ad-account linking through `linkMetaAccountToWorkspace` and a workspace-aware Page callable satisfies FR-017/FR-018 with no rules change.

**This also confirms R1's complication**: the `resource.data.deletedAt == null` clause here is why Round-13 pushed the predicate into the query. Any R1 fix must keep team-member reads working.

**Alternative rejected**: granting members write access on the workspace document. It would also let them edit names, brand fields, and the soft-delete marker — far past FR-017's scope, and it would put FR-019 at the mercy of rule precision rather than server logic.

---

## R7 — `updateWorkspace` field lock must be extended

**Decision**: Add `metaPageId` and `metaPageName` to the forbidden list.

`functions/src/index.ts:6546` blocks generic updates to `["isDefault", "createdAt", "deletedAt", "metaAdAccountId", "metaAdAccountName", "metaRoleAtLinkTime", "pendingReassign", "pendingRestore"]`. The new Page fields belong there for the same reason `metaAdAccountId` does: they are set only through the dedicated selection path, which validates the Page against the connection's `pages[]` and enforces the FR-011 clearing rule. A generic update route around it would bypass both.

---

## R8 — What publishing actually does (confirms the clarified FR-015a)

**Decision**: No behavioural change needed beyond routing; the Page gate stays off.

`metaPushCreative` POSTs to `https://graph.facebook.com/v22.0/{accountId}/adimages` (`index.ts:3720-3723`) — the ad account's image library — then writes a `creativeDeployments` record with `metaAdId`, `metaCreativeId`, `metaAdSetId`, `metaCampaignId` all `null` (`index.ts:3792-3795`). The in-code comment is explicit: the Page is *"stored for future creative-creation steps (/adcreatives) — we do NOT call /adcreatives today, so this is metadata only."*

Confirms both clarified positions: gate on the ad account (genuinely used by the upload), do not gate on the Page (consumed by nothing), and the mis-targeting harm is confidentiality — a creative landing in another client's media library — not ad spend.

---

## Cross-cutting: Arabic parity (FR-028a–c)

**Decision**: Extend the existing bilingual key mechanism; no new mechanism.

`src/i18n.tsx` already carries paired English/Arabic entries, and the team-member Meta permission messages added in PR #65 established the pattern for this exact surface. Every new string ships as a paired key in simple Fusha, no dialect and no technical terms (FR-028b).

---

## Summary of decisions

| Id | Decision | Blocking? |
|---|---|---|
| R1 | Legacy workspaces lack `deletedAt`; the Firestore `== null` predicate excludes them. **Repair approved (Option A).** | Resolved |
| R2 | 19 entry points; 15 convert to `resolveCallerScope`, 4 need bespoke identity handling. | No |
| R3 | `resolveCallerScope` is the sole resolver; `readDegraded` must be honoured everywhere. | No |
| R4 | `isDefault: true` is never written, so default-workspace resolution fails on newer accounts. **Fix-at-source + repair approved (Option A).** | Resolved |
| R5 | Add `metaPageId`/`metaPageName` to the workspace document; globals become fallback. | No |
| R6 | Team-member writes must go through callables; rules stay unchanged. | No |
| R7 | Lock the new Page fields against generic workspace updates. | No |
| R8 | Publishing uploads to the media library only; Page gate stays off. | No |
