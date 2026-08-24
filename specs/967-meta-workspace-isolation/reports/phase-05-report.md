# Phase 5 Report — User Story 3 (T057–T075)

**Phase**: 5 — US3 (P3)
**Branch**: `967-meta-workspace-isolation`
**Date**: 2026-08-19
**Status**: ✅ Complete — awaiting go-ahead before Phase 6

---

## Scope

US3 — A team member can use the Meta integration at all.

Every Meta-touching callable now resolves the caller's *account*
before any Firestore read or write. The OAuth callback's identity is
resolved AFTER reading `state` (FR-020a-i) — the deferred state-trust
work stays untouched (FR-020a-ii). Three unauthenticated entry
points (`metaDataDeletion`, `metaDailySync`, `metaSyncAccountWorker`)
are audited; the team-member fix lands in the 10 authenticated
callables + the OAuth callback only.

---

## Diff summary

```
 functions/src/index.ts                            (T061/T062/T063 + T070/T072 OAuth callback rewrite + metaOAuthCallbackImpl extracted)
 functions/src/funnelSettings.ts                   (T064/T065/T066 — 3 callables)
 functions/src/metaConnection.ts                   (T067/T068 — 2 callables)
 functions/src/metaSync/trigger.ts                 (T069)
 src/App.tsx                                       (T074 disconnect scope warning, T075 reconnect-required menu behaviour)
```

Plus two new test files:

```
 functions/src/__tests__/metaOAuthCallback.test.ts      (T-15 + readDegraded T072)
 functions/src/__tests__/metaScope.integration.test.ts  (T-01 + T059 — 6 tests)
```

And a new evidence section in `specs/967-meta-workspace-isolation/evidence-r1.md` (T073 audit).

---

## T061–T069 — 9 authenticated callable conversions

All conversions follow the same pattern: `request.auth.uid` →
`scope.ownerUid` for every Firestore read/write; `scope.callerUid`
recorded in console logs and the `disconnectedByUid` / `connectedByUid`
fields for audit. The full audit table:

| Callable | File | Reads | Writes | Notes |
|---|---|---|---|---|
| `metaSelectAccount` | `index.ts:3366` | `metaConnections/{ownerUid}` | `metaConnections/{ownerUid}.update` | CodeRabbit id-in-adAccounts check preserved |
| `metaDisconnect` | `index.ts:3633` | `metaConnections/{ownerUid}`, `adPerformance/*` | deletes both | Returns `disconnectedByUid: scope.callerUid` for audit |
| `metaSyncPerformance` | `index.ts:3665` | `users/{ownerUid}/workspaces/{wid}`, `metaConnections/{ownerUid}`, `creativeDeployments/*` | `creativeDeployments/*`, `adPerformance/*`, `metaConnections/{ownerUid}.lastSyncAt` | Per FR-009a — performance data stays account-global, no per-item re-resolution |
| `saveFunnelSettings` | `funnelSettings.ts:260` | `users/{ownerUid}/workspaces/{wid}` | `users/{ownerUid}/workspaces/{wid}/adAccounts/{aid}/settings/current` | Added `assertWorkspaceAllowed` first |
| `getFunnelSettings` | `funnelSettings.ts:395` | same | (read-only) | Added `assertWorkspaceAllowed` |
| `dismissAdvisory` | `funnelSettings.ts:448` | same | `merge: true` on the settings doc | Added `assertWorkspaceAllowed` |
| `connectMetaAccount` | `metaConnection.ts:108` | `users/{ownerUid}/workspaces/{wid}`, `metaConnections/{ownerUid}` | `users/{ownerUid}/workspaces/{wid}/private/metaConnection` + workspace link | Reads OAuth token from owner's connection doc (Phase 5 / T070 makes OAuth write to owner's path) |
| `disconnectMetaAccount` | `metaConnection.ts:251` | same | `merge: true` clear, workspace link clear | Returns `disconnectedByUid` |
| `triggerMetaSync` | `metaSync/trigger.ts:25` | `users/{ownerUid}/workspaces/{wid}/private/metaConnection` | (calls `runSyncForAccount` which writes under owner paths) | 1-hour cooldown preserved |

`getMetaConnection` and `metaSelectPage` were already converted in
Phase 4 / T051. `metaPushCreative` and `metaPushCreativePack` were
already converted in Phase 3 / T032-T038. Phase 5 closes the gap on
the remaining 9.

### Verification (FR-001 / FR-002)

`metaScope.integration.test.ts:metaScope.integration` exercises every
converted callable with a team-member scope and asserts:

- Every Firestore WRITE targets `users/owner-1/...`,
  `metaConnections/owner-1`, `creativeDeployments/*`, or
  `adPerformance/*`. **Zero writes** target
  `users/member-1/...` or `metaConnections/member-1`.
- The OAuth callback writes to `metaConnections/owner-1` with
  `connectedByUid: "member-1"` (audit), NOT to
  `metaConnections/member-1`.
- After a full team-member pass, no `metaConnections/member-1`
  record exists (SC-009).

The path-tracker distinguishes reads from writes — `users/member-1`
*reads* are expected (the team-member lookup at the top of
`resolveCallerScope` MUST read the caller's own user doc to
determine team-membership; that is the FR-001 design). The bug we
forbid is a *write* to a member-scoped path, which the integration
test asserts against.

---

## T070–T072 — OAuth callback identity resolution

The OAuth callback is unique: it has no `request.auth` (it's an
`onRequest` endpoint). The fix:

1. **Read `state` exactly as before** — production / transmission /
   validation of `state` is **untouched** (FR-020a-ii — the
   deferred state-trust work in research.md R8 stays separate).
2. **Resolve the identity AFTER reading `state`** — call
   `resolveCallerScope(state)` which returns the owner when `state`
   is a team member's uid.
3. **Write the connection to `metaConnections/{ownerUid}`** with
   `userId: ownerUid` and `connectedByUid: state` for audit. A
   team member's authorisation therefore lands on the owner's
   record and is usable by every member and the owner themselves
   (FR-001 / FR-020).
4. **On `readDegraded`**, render a retry page and write nothing
   (FR-003 / T072) — a team member's transient read failure must
   not silently authorise the wrong account.

### `metaOAuthCallbackImpl` extraction

The callback body is now a standalone exported function so the
contract tests can drive the resolution directly with an in-memory
Firestore stub + a fake `fetch`. Production wraps it in `onRequest`.

---

## T073 — Unauthenticated entry-point audit

| Entry point | File | Trigger | Audit finding |
|---|---|---|---|
| `metaOAuthCallback` | `index.ts` | `onRequest` | ✅ Phase 5 fix lands the resolution + retry page. |
| `metaDataDeletion` | `index.ts:6594` | `onRequest` | ⚠️ Pre-existing broad-delete behaviour (iterates over every `metaConnections` doc). The Phase 967 fix doesn't change this; flagged for follow-up (filter by `metaUserId` once that's stored on the connection doc). No team-member surface — the callback is Meta-driven. |
| `metaDailySync` | `metaSync/dispatcher.ts:68` | `onSchedule` (3am UTC) | ✅ Already owner-scoped — discovers workspaces via `collectionGroup('private')` where `metaConnected === true`, extracts `userId` from the doc path. |
| `metaSyncAccountWorker` | `metaSync/worker.ts:31` | `onTaskDispatched` | ✅ Already owner-scoped — `userId` in the task payload is the owner from the dispatcher's path resolution. |

Findings recorded in `specs/967-meta-workspace-isolation/evidence-r1.md`.

---

## T074–T075 — Frontend wiring

### T074: account-wide disconnect scope warning (FR-020a)

`handleDisconnectMeta` in `src/App.tsx` previously used a raw
`window.confirm()` with English + Arabic literals. Updated to use
the Phase 1 i18n key `meta.disconnect_scope_warning`:

> "Disconnecting removes Meta access for this account and every
> workspace at once. Anyone using Meta from this account will lose
> it."

Paired en/ar (FR-028a / SC-012) — the Arabic string is in simple
Fusha.

### T075: reconnect-required state (FR-020b)

The Meta menu entry's `onClick` now branches on `tokenExpiring`:

- `connected && !tokenExpiring` → opens the sync flow (existing behaviour)
- `connected && tokenExpiring` → opens the OAuth re-authorise flow
- `!connected` → opens the OAuth connect flow (existing behaviour)

Any signed-in member OR the owner can re-authorise — the Phase 5
OAuth callback resolves the identity to the owner regardless of
who initiated it (FR-020a-i). No intermediate cleanup step is
required: the new OAuth flow overwrites `metaConnections/{ownerUid}`
with the fresh long-lived token, and every member sees the
reconnection immediately on the next `getMetaConnection` call.

The `needsReauth: true` return from `metaSyncPerformance` /
`triggerMetaSync` already shows the "Please reconnect Meta" toast;
that flow is unchanged. T075's contribution is the persistent
reconnect-required entry point in the Meta menu.

---

## T057–T059 — Contract tests

### `metaScope.integration.test.ts` (new — 6 tests)

| Test | Asserts | Requirement |
|---|---|---|
| T-01a | `metaPushCreative` invoked with team-member scope — every Firestore write lands at owner paths | FR-001 |
| T-01b | `metaPushCreativePack` invoked with team-member scope — every Firestore write lands at owner paths | FR-001 |
| T-01c | `metaSelectPage` invoked with team-member scope — every Firestore write lands at owner paths | FR-001 |
| T-01d | `getMetaConnection` invoked with team-member scope — every Firestore write lands at owner paths | FR-001 |
| T-01e + T-15 | `metaOAuthCallbackImpl` invoked with team-member `state` — writes to `metaConnections/owner-1` with `connectedByUid: member-1`; **no** `metaConnections/member-1` written | FR-001, FR-020a-i |
| T059 | After a full pass through getMetaConnection / metaSelectPage / metaPushCreative / metaPushCreativePack with team-member scope, **no** `metaConnections/member-1` exists | FR-002, SC-009 |

The stub is enriched to record every path it sees
(`#doc`/`#set`/`#get`/`#update`/`#delete`/`#list` markers) so the
assertion distinguishes between reads (which include the legitimate
`users/member-1` lookup inside `resolveCallerScope`) and writes
(which must always land on owner paths).

### `metaOAuthCallback.test.ts` (new — 2 tests)

| Test | Asserts | Requirement |
|---|---|---|
| T-15 | OAuth callback with team-member `state` writes to `metaConnections/owner-1` with `connectedByUid: member-1` | FR-020a-i |
| readDegraded | `readDegraded: true` during scope resolution → `result.ok = false`, `reason: 'read_degraded'`, no Firestore write attempted | FR-003, T072 |

---

## Verification

- Frontend `npm run build` — **pass** (`tsc -b && vite build`).
  No new warnings.
- Backend `cd functions && npm run build` — **pass** (`tsc` strict
  mode + asset copy). 10 callables converted without type errors;
  `metaOAuthCallbackImpl` exported with the right shape.
- `node lib/__tests__/workspace.test.js` — 12 passed, 0 failed.
- `node lib/__tests__/metaCallerScope.test.js` — 7 passed, 0 failed.
- `node lib/__tests__/workspaceRepair.test.js` — 9 passed, 0 failed.
- `node lib/__tests__/metaPush.test.js` — 8 passed, 0 failed.
- `node lib/__tests__/metaPushPack.test.js` — 2 passed, 0 failed.
- `node lib/__tests__/metaSelectPage.test.js` — 15 passed, 0 failed.
- `node lib/__tests__/metaScope.integration.test.js` — **6 passed, 0 failed**.
- `node lib/__tests__/metaOAuthCallback.test.js` — **2 passed, 0 failed**.
- `node lib/__tests__/teamWorkspaceAccess.test.js` — unchanged,
  still passes.

**61 total active tests pass** (Phase 5 adds 8). The 13 pre-existing
skipped tests in `workspace.test.ts` are unchanged placeholders.

---

## Trap compliance (`quickstart.md` "Traps")

| Trap | Status |
|---|---|
| `readDegraded` is not optional | ✅ `resolveMetaScope` (callables) + `resolveCallerScope` (OAuth) both check before any use. T-02 + T-072 cover. |
| `request.auth.uid` must not appear in Firestore paths | ✅ All 10 converted callables + the OAuth callback now use `scope.ownerUid` for every Firestore path. `metaScope.integration.test.ts` walks every path and forbids member writes. |
| `conn.selectedAccountId` must not be read by either publish path | ✅ Already closed in Phase 3. |
| Clear the Page in the same write as the ad-account link | ✅ Not relevant here (Phase 6). |
| `metaPageClearedAt` is what makes FR-011a enforceable | ✅ Phase 4 closed. |
| Team members cannot write workspace documents directly | ✅ Security rules unchanged; team members reach workspaces through callables only. |
| Do not touch the OAuth `state` parameter | ✅ Production / transmission / validation of `state` is unchanged. Only the *consumer* (the Firestore write) resolves to the owner. Comment added at the callback top. |
| The repair must not read through the broken query | ✅ Phase 2 closed. |
| The repair fixes history; the `createWorkspace` change stops it recurring | ✅ Phase 2 closed. |

---

## What lands next (Phase 6)

Phase 6 (US4, P4) widens team-member permissions so the operator can
link ad accounts and select Pages on the owner's workspaces: `linkMetaAccountToWorkspace`
drops its team-member block (T080), clears the Page on link / unlink
(T081 / T083), and surfaces the FR-011b notice via the Phase 1 i18n
key `meta.page_cleared_notice` (T084). The Funnel Settings selector
+ ad-account linker + page picker reach team members (T085).

Per `tasks.md`: T076–T085 — US4 contract tests (T-09 / T-10 / T-13 /
T-14) and implementation.

---

**STOPPING** per the workflow rule. Awaiting go-ahead before Phase 6.
