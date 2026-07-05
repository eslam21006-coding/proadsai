# Contract: Meta Connection & Daily Sync (Layer 2)

**Feature**: `phase-14-rag-meta` · **US2**
**Transport**: scheduled function + Cloud Tasks worker + callables. Connection UI reuses `src/services/metaService.ts`.
**Scope**: `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/…` + server-only `…/private/metaConnection`.

---

## `connectMetaAccount` (callable) — 1:1 enforced (FR-026)

Captures the long-lived Meta user token, binds one ad account to the workspace.

### Request
```ts
{ workspaceId: string; accountId: string; accountName?: string; shortLivedToken: string }
```
### Response
```ts
{ ok: true; metaConnected: true; accountId: string }
```
### Server rules
- **Block both conflict directions** (FR-026): reject with `failed-precondition` + a plain-Arabic reason if (a) this workspace already has a connected `accountId` (must disconnect first), or (b) `accountId` is already on any other workspace's `metaConnection` for this user.
- Exchange short-lived → **long-lived** user token; envelope-encrypt via `tokenCrypto.ts` (Cloud KMS); write ciphertext + `tokenExpiresAt` to the server-only `…/private/metaConnection` doc; set `metaConnected:true`, `needsReauth:false`.
- Token is never returned to the client.

## `disconnectMetaAccount` (callable)

### Request `{ workspaceId: string }` → Response `{ ok: true }`
- Delete `encryptedToken`/`tokenExpiresAt`, set `metaConnected:false`, halt syncs. **Retain** all synced performance data + aggregates (survives reconnect) — Edge Case 15.

---

## `metaDailySync` (scheduled dispatcher)

`onSchedule('0 3 * * *', { timeZone: 'UTC', region: 'europe-west1' })`.

- Query all `metaConnection` docs (collection group) with `metaConnected == true`.
- **Enqueue one Cloud Task per account** onto `metaSyncAccountWorker`. No per-account work in the dispatcher (stays within CF limits; scales with user base).

## `metaSyncAccountWorker` (`onTaskDispatched`)

One task = one account. `retryConfig: { maxAttempts: 3, backoff }`, `rateLimits: { maxConcurrentDispatches: 5 }` (concurrency cap). Per-account failure isolation — one failure never blocks others.

### Per-account steps (spec §3.1)
1. **Token** — decrypt server-side; validate; proactively refresh if near expiry; on refresh failure set `needsReauth` (FR-009) and stop (no data deleted).
2. **Fetch hierarchy** — campaigns (+`objective`) → adsets (+`targeting`) → ads (+`creative`).
3. **Fetch performance** — 3-day rolling, today, last-7-days daily; fields per spec §3.1. Large accounts → async insights (`POST /{id}/insights` → poll `report_run_id`); rate limits → exponential backoff (FR-008).
4. **Baselines** — 90-day Link CTR, 14-day CPM, 30-day CPA/CPL (+30-day CPC) → `baselines` doc.
5. **spend_share_pct** per ad within its ad set.
6. **Targeting context** — geo tier + audience type (spec §3.1.6).
7. **Image matching** (see `imageMatching.md`) — **workspace-scoped only**.
8. **Qarar verdict** (see `qararVerdict.md`) per matched ad.
9. **Learning aggregates** update (hook + visual, `byObjective`).
10. **Store** — write `adPerformance/{adId}`, append a `syncSnapshots` doc (**prune to last 7**), update `metaConnection.lastMetaSyncAt` + `lastSyncStatus`.

### Idempotency & failure (FR-010/FR-011)
- Re-running with the same data yields the same result (deterministic writes keyed by `adId`).
- Partial failure → store what succeeded; last-good aggregates remain until a full successful sync replaces them; snapshot `status:'partial'`.

---

## `triggerMetaSync` (callable) — on-demand "Sync Now"

### Request `{ workspaceId: string }` → Response
```ts
{ ok: true; status: 'ok'|'partial'|'failed'; lastMetaSyncAt: number; counts: {...} }
```
- Runs the same worker body for the current workspace's account only.
- **Disabled for 1 hour** after the last sync (server rejects with `resource-exhausted` + remaining cooldown; UI greys the button).
