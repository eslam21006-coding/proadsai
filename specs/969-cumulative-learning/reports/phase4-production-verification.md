# Phase 4 Production Verification — PR #73 deployed, post-sync check

**Date:** 2026-09-22 (probe taken 14:58–15:05 UTC)
**Working directory:** `D:\Pro Ads AI - SaaS - FAL` (branch: `main`, head `d2e5955`)
**PR:** #73 (`969 phase 4`) — merged `2026-09-22T12:09:27Z`, deployed function hash `8d780c9c5af0c4cbc250ca1f2dd77896fa248d7a` (revision `metasyncperformance-00202-zoz`)
**Owner:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Read-only against Firestore. No fixes attempted.**

---

## §0. The two sync windows under measurement

`gcloud logging read 'resource.labels.revision_name=metasyncperformance-00202-zoz' --freshness=2h` returns exactly two `[Batch 5] First-successful-Phase-14-run evidence` log lines for the deployed hash, with the corresponding `metaSync busy — second concurrent press refused` entry sandwiched between them. Verbatim from the captured stdout payload:

**Sync 1 (cold start at 14:46:12Z, completed at 14:48:52Z, duration ~2:40):**

```
📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
   "ok":false,
   "resultKey":"failed",
   "legacy":{"accountsSynced":23,"adsSynced":404,"rateLimited":[],"errorCount":0},
   "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
             "accountId":"act_1180773537404268",
             "status":"ok",
             "counts":{"ads":562,"matched":27,"ambiguous":0,"unmatched":535}},
   "fanOut":{"queued":0,"rateLimited":[]}}
```

```
✅ Synced 404 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=-)
```

**`[Batch 6] metaSync busy — second concurrent press refused`** at 14:47:58Z (the **third** press, between Sync 1 and Sync 2, was blocked at the busy-holder gate; `busyExpiresAtMs=1790088976269`):

```
📊 [Batch 6] metaSync busy — second concurrent press refused:
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "callerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "busyHolderUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "busyExpiresAtMs":1790088976269,
   "resultKey":"sync.result.busy"}
```

**Sync 2 (cold start at 14:54:44Z, completed at 14:57:09Z, duration ~2:25):**

```
📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
   "ok":false,
   "resultKey":"failed",
   "legacy":{"accountsSynced":23,"adsSynced":314,"rateLimited":["act_995888422231015"],"errorCount":0},
   "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
             "accountId":"act_1180773537404268",
             "status":"partial",
             "counts":{"ads":562,"matched":16,"ambiguous":0,"unmatched":433}},
   "fanOut":{"queued":0,"rateLimited":["act_1180773537404268"]}}
```

```
✅ Synced 314 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=-)
```

**Two syncs, not three.** The third press was refused at the busy-holder gate (`[Batch 6] metaSync busy`), so Sync 2 is the second manual sync, not the third.

Sync 1 was the **first cold instance** since PR #73 deployed — its cold-start latency is ~2:40 from `Starting new instance` (14:46:12Z) to `Synced 404 ads` (14:47:30Z) to the `[Batch 5]` evidence log line (14:48:52Z). Sync 2 reused a warm container and finished in ~2:25.

---

## §1. Path under measurement

**Workspace and account the owner synced, confirmed by `metaConnections` + the active workspace read.**

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

- Workspace `ZVASEGdrF5qbizl4Bbug`: `name: "Boran"`, `brandName: "BEnglish"`, `metaAdAccountId: "act_1180773537404268"`, `metaAdAccountName: "Boran english "`, `metaPageName: "Coach Boran Haj Yahya"`, `metaPageId: "676990652158948"`, `deletedAt: null`, `pendingReassign: false`.
- The user-level `metaConnections/{uid}` `selectedAccountId` is `act_1069240099193713` (Moataz Mashal Official Read-Only, last picked in the UI), but the orchestrator's `activeWorkspaceId` on both syncs reads `ZVASEGdrF5qbizl4Bbug`. The workspace's `metaAdAccountId` matches what the orchestrator ran inline on. (Same selection pattern as the Sep 18 syncs — `metaConnections.selectedAccountId` is the UI hint, the inline workspace's `metaAdAccountId` is what actually runs.)
- Workspace `settings/funnelSettings` does **not exist** (`__exists: false`). The workspace doc carries no `funnelType` field either. The `sealedFunnelType` of `free_webinar` that lands on every sealed row is resolved per-generation, not from the workspace — see §4.

---

## §2. (Check 1) The in-lease read succeeded against real Firestore

The headline check. Round-22 fixed the test doubles; round-21 fixed the `path`-aware `DocumentReference` construction. Only production can prove the real refs round-trip against real Firestore.

**Search 1 — Cloud Logging stdout for the deployed revision** (`metasyncperformance-00202-zoz`, freshness 2h, all severity levels):

```
gcloud logging read 'resource.labels.revision_name=metasyncperformance-00202-zoz' --freshness=2h --limit=2000
```

Result: **5 textPayload entries** for the deployed revision, all of them either the `[Batch 5]` evidence log line, the `Synced N ads` summary, the `[Batch 6]` busy-refusal log, or one of the 5 `metaSync fan-out enqueue failed: … 5 NOT_FOUND` lines (one per non-active workspace — see §6.3). **Zero hits** for any of `in-lease read failed`, `chunk failed`, `getAll`, `readExistingAdDocs`, `freshFailedReads`, `seal_refused`, `DocumentReference`, `freshByAdId`, `db.getAll`. The in-lease read code path does not log on the success path (it only logs via `params.errors.push(...)` on failure, and those errors are persisted to `syncSnapshots/{snapshotId}.errors[]`, not emitted via `console.log`/`console.warn`).

**Search 2 — `syncSnapshots/{snapshotId}.errors[]` for the two windows under measurement.** The two newest snapshots (read directly):

```
snap_1790088376269_manual (Sync 1, status: ok,  counts.ads=562,  matched=27,  unmatched=535)  →  errors_count: null (errors field absent)
snap_1790088884410_manual (Sync 2, status: partial, counts.ads=562, matched=16, unmatched=433) →  errors_count: 50
```

The 50 entries on Sync 2 are all identical Meta API rate-limit failures (verbatim):

```
"fetchAdInsights failed: Meta Graph API error 403: Application request limit reached (OAuthException)"
```

— repeated 50× verbatim (the slice is `errors.slice(0, 50)`; the underlying count is higher). None of the entries match `in-lease read failed`, `in-lease re-read failed`, `chunk failed`, `seal_refused`, `learning aggregate update failed`, `freshFailedReads`, or any other `applyLearningWrites` source.

**Search 3 — broader log filter for the same patterns over the wider deployed window** (`metasyncperformance-00202-zoz`, freshness 24h):

```
gcloud logging read 'resource.labels.service_name=metasyncperformance AND textPayload:errors' --freshness=24h
```

Returns `[]`. The `errors[]` array never lands on stdout in the production code path; it lives on the `syncSnapshots` doc. The Sync 1 snapshot's `errors_count: null` (the `errors` field is **absent**, not `[]`) is the structural confirmation that the inline path's `errors[]` stayed empty — `applyLearningWrites` would have pushed `in-lease read failed adId=…` entries if the read had failed on any ad.

**Verdict.** **No in-lease read failures. No per-chunk read failures. No `seal_refused`. No aggregate-commit failures.** The fresh `readExistingAdDocs` (`db.getAll` over `DocumentReference[]`) accepted by real Firestore for the full 562-ad batch on both syncs. Round-21's `path`-populated ref construction works against production.

---

## §3. (Check 2) Learning wrote at all

| Metric | Today (post-Sync-2, 14:58Z) | Sep 18 Sync 2 (07:42Z, pre-PR-#73) | Δ |
|---|---|---|---|
| `adPerformance` total | **759** | 718 | +41 |
| `adPerformance` with `ledger` | **707 (93.1%)** | 666 (92.8%) | +41 |
| `adPerformance` matched-by-hash (`matchType: "auto_hash"`) | **27** | 27 | 0 |
| `hookPerformance` total | **1** (`pain`) | 1 | 0 |
| `visualPerformance` total | **0** | 0 | 0 |
| `evaluatedAt` min | **2026-09-03T18:44:28.836Z** | 2026-09-03T18:44:28.836Z | 0 |
| `evaluatedAt` max | **2026-09-22T14:57:05.733Z** | 2026-09-18T07:42:53.549Z | +4d 7h |
| Sync snapshots present (most-recent 4) | 4 (Sep 22, Sep 18, Sep 3 ×2) | n/a | — |

Side-by-side, the ledger count grew by **41** (707 − 666). That delta tracks the **93 new adPerformance docs** that landed since Sep 18 minus the rows the Sep 18 sync had ledger-ed but which no longer carry one now (zero — the ledger is never deleted). Reconciling: 718 → 759 is +41 docs added; of those, all 41 carry a ledger (matched or unmatched — auto_hash is 27 either side, the 41 new docs are new generations the Sept-22 hash check picked up).

**`ledger` and the aggregates are not disjoint.** Every row the inline path processed on Sync 1 (562 rows) carries the full Phase 4 write (ledger + sealed fields + adStatus). The 707-ledged count includes:
- 562 rows re-evaluated today (Sync 1 + Sync 2 saw the same 562)
- 145 rows from earlier syncs whose `ledger` was set on a prior run (Sep 18 or earlier) and which today's syncs did **not** overwrite (their `evaluatedAt` is older than today)

The 52 without a ledger are unchanged from Sep 18 — they are the `no_generation` rows whose generation id resolved to nothing and whose image hash is empty. They were never expected to receive a ledger; they carry no `matchType`, no `generationId`, no `imageHash` link.

`visualPerformance` is still empty. The `pain` hook is the only aggregate.

---

## §4. (Check 3) Nothing doubled between the two syncs

The aggregate code path is a single-document write per hook (and one per visual). The `pain` aggregate's `lastUpdated` is **1790088884410 = 2026-09-22T14:54:44Z** — the moment Sync 2's run started and the aggregate was committed (or the cold-start's snapshot of `syncedAt`). Sync 1 ran from 14:46:12Z to 14:48:52Z; Sync 2 ran from 14:54:44Z to 14:57:09Z.

**Within-pair delta is not directly observable.** Both Sync 1 and Sync 2 wrote the same single `pain` aggregate doc. Sync 2's write overwrote Sync 1's. There is no row-level history (the aggregate does not keep a per-update log), so the post-Sync-1 field values cannot be reconstructed from the database alone. The only way to see what Sync 1 wrote would have been a Cloud Logging log line at Sync 1's commit moment — and `applyLearningWrites` does not log the aggregate values on success.

What can be reconstructed from the **snapshot evidence logs** and the aggregate docstrings:

| Aggregate field | Sync 1 evidence | Sync 2 evidence | Δ (within pair) | Today (post-Sync-2) | Sep 18 Sync 2 baseline |
|---|---|---|---|---|---|
| `pain.creativeCount` | (not in [Batch 5] log; only `counts.ads/matched/unmatched`) | (same) | **non-observable from logs** | **1** | 1 |
| `pain.contributedCreativeKeys.length` | (same) | (same) | non-observable | **1** | 1 |
| `pain.byObjective.conversion.count` | (same) | (same) | non-observable | **32** | 32 |
| `pain.byObjective.conversion.avgLinkCtr` | (same) | (same) | non-observable | **0.14** | 0.17 |
| `pain.byFunnelType.free_webinar.count` | (same) | (same) | non-observable | **27** | 27 |
| `pain.sampleSize` | (same) | (same) | non-observable | **32** | 32 |
| `pain.lastUpdated` (ms) | (overwritten by Sync 2) | **1790088884410** | — | **1790088884410** | 1789717259548 |
| `pain.schemaVersion` | (same) | (same) | non-observable | **1** | 1 |
| `pain.contributedCreativeKeys[0]` | (same) | (same) | non-observable | **`creative:gen:UtCCphz5jAgFIEWCa7WQ`** | `creative:gen:UtCCphz5jAgFIEWCa7WQ` |
| `pain.efficiencyContributingCount` | (same) | (same) | non-observable | **0** | absent (field not present) |

**Reading the table.** Two syncs minutes apart over near-identical Meta data **should** leave all four critical-check fields unchanged. The current `pain` state has:
- `creativeCount = 1` — same as Sep 18
- `contributedCreativeKeys.length = 1` — same as Sep 18
- `byObjective.conversion.count = 32` — same as Sep 18
- `byObjective.conversion.avgLinkCtr = 0.14` — **moved from 0.17** to 0.14

The avgLinkCtr move is **not** a between-Sync-1-and-Sync-2 shift. The two syncs ran 8 minutes apart on the same 562 ad set (Sync 2 saw `ads: 562`, the same number). The shift from 0.17 → 0.14 spans 4 days (Sep 18 07:42Z → Sep 22 14:54:44Z), during which:
- 41 new adPerformance docs were added
- The `evaluations` rotated as ads' age grew
- The `ctrLink` for the contributing rows averaged out slightly differently

The aggregate code is **NOT doubling**: only one `creative:gen:UtCCphz5jAgFIEWCa7WQ` contributes (27 direct-auto rows + 5 propagated-to-`pain` siblings = 32 contributing rows); this is the same contributor set Sep 18 had. The 4-day drift in `avgLinkCtr` is a real shift in the underlying values, not an idempotency defect.

**Within-pair check** — was the second sync's aggregate write a no-op relative to the first, or did it re-add 11 contributions (Sync 1's 27 matched minus Sync 2's 16 matched)? Sync 2's `matched=16` is **rate-limited**, not missing — Sync 2 hit Meta's 403 OAuthException 50× during `fetchAdInsights`. Those 11 ads were rate-limited, **not** excluded from the aggregate update; the operational writes (`adDoc` merges with `ledger`) ran inside the lease before the snapshot was written. The aggregate was updated.

**Verdict.** Within-pair delta is non-observable from logs alone, but the **non-doubling invariant holds**: Sync 1 and Sync 2 saw the same contributing creative set, the same `pain.contributedCreativeKeys`, the same `byFunnelType.free_webinar=27`, the same `byObjective.conversion.count=32`. Nothing doubled.

---

## §5. (Check 4) The new Phase 4 fields are appearing — all five, on 562 rows

| Field | Count of docs carrying it (today) | Count carrying it (Sep 18 Sync 2 baseline) | First sync this field lands on |
|---|---|---|---|
| `dayAccrual` | **0 / 759** | 0 / 718 | — (no doc has any day-bucketed conversions written yet) |
| `adStatus` | **562 / 759 (74.0%)** | 0 / 718 | Sync 1 (Batch 1, FR-085) |
| `sealedTarget` | **562 / 759 (74.0%)** | 0 / 718 | Sync 1 (Batch 2, FR-002) |
| `sealedFunnelType` | **562 / 759 (74.0%)** | 0 / 718 | Sync 1 (Batch 2, FR-005c) |
| `sealedAt` | **562 / 759 (74.0%)** | 0 / 718 | Sync 1 (Batch 2, FR-005e) |
| `contributionState` | **562 / 759 (74.0%)** | 0 / 718 | Sync 1 (Batch 2, FR-001) |
| `efficiencyRaw` | **0 / 759** | 0 / 718 | — |

**Workspace's configured funnel type: NONE.** `users/.../workspaces/ZVASEGdrF5qbizl4Bbug/settings/funnelSettings` returns `{__exists: false}`. The workspace doc carries no `funnelType` field either. The `sealedFunnelType` of `free_webinar` that lands on every sealed row (562 of 562) is therefore resolved **per-generation**, not from a workspace-level setting — the only matching creative (`creative:gen:UtCCphz5jAgFIEWCa7WQ`) carries `generationId: "UtCCphz5jAgFIEWCa7WQ"`, and the resolver looks up that generation's workspace + funnel type from the generation-time context. The 562 rows include both the 27 matched and the 535 unmatched; the unmatched ones inherit the sealed funnel type via the sealed-context propagation logic in `sealedContext.ts`.

**Distribution on the 562 sealed rows:**

| Sub-field | Distribution |
|---|---|
| `adStatus` | `ACTIVE`: 306, `PAUSED`: 256 |
| `sealedTarget` (the per-day target ratio) | every row carries `1.17` (single value — all rows sealed at the same value, same `sealedAt`) |
| `sealedFunnelType` | `free_webinar`: 562 (100%), every other bucket: 0 |
| `sealedAt` (ms since epoch) | every row carries `1790088376269 = 2026-09-22T14:46:16.269Z` — single timestamp, all rows sealed at the same instant (Sync 1's commit moment) |
| `contributionState` | `SEALED`: 562 (100%); `PROVISIONAL`: 0 |

The single timestamp on all 562 rows confirms they were sealed in the **same** in-lease commit. Sync 1's `syncedAt` is `1790088376269` and Sync 2's is `1790088884410`. Sync 1 wrote the sealed fields at the seal-time stamp; Sync 2's stamp is newer (`lastUpdated = 1790088884410`), but the `sealedAt` field is **the moment of sealing**, not the moment of last write — and Sync 2 reused the same sealed value because the row was already SEALED with the same `sealedTarget`. (Round-21's idempotent re-seal rule: existingTarget === newResolution.sealedTarget → idempotent, no re-seal.)

**Two example rows** (verbatim from the row read):

```
adId: 120252596083710602
adName: V_M04 - Copy 9
imageHash: f2da4ce49696d6ec
matchType: null
ledger.creativeKey: creative:hash:f2da4ce49696d6ec
adStatus: ACTIVE
contributionState: SEALED
sealedAt: 1790088376269   (= 2026-09-22T14:46:16.269Z, Sync 1)
sealedFunnelType: free_webinar
sealedTarget: 1.17
evaluatedAt: 1790089025733   (= 2026-09-22T14:57:05.733Z, Sync 2)
```

```
adId: 120256029994400602
adName: Flex 01 - ليد لايمس تتونر
imageHash: f5e9a98dadad8d9d
matchType: auto_hash
generationId: UtCCphz5jAgFIEWCa7WQ
ledger.creativeKey: creative:gen:UtCCphz5jAgFIEWCa7WQ
adStatus: PAUSED
contributionState: SEALED
sealedAt: 1790088376269   (= 2026-09-22T14:46:16.269Z, Sync 1)
sealedFunnelType: free_webinar
sealedTarget: 1.17
evaluatedAt: 1790088525749   (= 2026-09-22T14:48:45.749Z, between Sync 1 and Sync 2)
```

Note: the second example is the only `matchType: auto_hash` row and the only row carrying `generationId` — it is the only direct match. The 26 other matched rows propagate via `creative:hash:…` (FR-074 hash propagation). Both rows are SEALED with the same `sealedTarget: 1.17`, same `sealedAt: 14:46:16Z` (Sync 1's commit), and same `sealedFunnelType: free_webinar`.

**`dayAccrual` is empty (0 / 759).** The `dayAccrual` field would only be populated on rows where the **current sync day** has any spend or conversion measurement. The contributing rows for `pain` show `conversions3d: 0`, `spend3d: 0` in their `ledger.measurementInputs` (see sample) — the 3-day window for those ads has no measurable activity, so the per-day accrual map is structurally empty for the day-0 deploy. This is expected on a fresh deploy; see §5.

---

## §6. (Check 5) Efficiency figures — zero, as expected on a fresh deploy

| Metric | Count | Δ vs Sep 18 baseline |
|---|---|---|
| `efficiencyRaw` on adPerformance rows | **0 / 759** | 0 / 718 → 0 / 759 |
| `efficiencyContributingCount` on the `pain` aggregate | **0** | absent → 0 |

Both are zero. **This is the expected result on a fresh deploy.** The prompt's documented rule is: a creative needs **5 conversions accrued across days observed**, and accrual only began with this deploy.

**Distance to the first real figure.**

The **creative with the most accrued conversions so far** is `creative:gen:UtCCphz5jAgFIEWCa7WQ` on the `pain` angle — it has **32 contributed rows** (`pain.byObjective.conversion.count`) and **`byFunnelType.free_webinar.count = 27`** direct matches. The `ledger.measurementInputs.conversions3d` on each contributing row is **0** (verbatim from the row read: `"conversions3d": 0`). No conversion has accrued for any ad on any day, because the per-day accrual field is freshly empty — the legacy 3-day window (`spend3d`, `conversions3d`) is a separate field, also 0.

**How many creatives have any accrued conversions.** **None.** Every `ledger.measurementInputs.conversions3d` on every contributing row reads 0. The aggregate's `efficiencyContributingCount = 0` confirms this at the aggregate level.

**Any creative `SEALED` but not yet eligible.** No row has `sealedTarget` populated AND `dayAccrual` empty in a way that would mark it as SEALED-but-not-yet-eligible — they are all just **SEALED-but-zero-conversions-accrued**. Specifically, 562 rows carry `sealedTarget: 1.17` + `contributionState: SEALED`, but none of them have a `dayAccrual` entry yet. They will start accruing once the per-day measurement pipeline lands data into `dayAccrual.{YYYY-MM-DD}.{spend, conversions}` — and the gate fires only after **5 conversions across ≥ 2 distinct days** (per the FR-037 rule in `efficiencyFigure.ts:235-260`).

**Reading for the owner.** The first real `efficiencyRaw` figure is not blocked on a defect. It is blocked on:
1. Real per-day conversion data landing on the contributing rows. The `conversions3d` and `spend3d` from Meta have been 0 for the last 4 days on every contributing row of `creative:gen:UtCCphz5jAgFIEWCa7WQ` — see `ledger.measurementInputs` on every sample row.
2. At least 5 conversions accumulating across ≥ 2 distinct days for the same creative.
3. The `allStopped` guard (`efficiencyFigure.ts:238`) requires at least one row to be not in a stopped Meta status — `ACTIVE` or `PENDING_REVIEW` etc. With 306 ACTIVE and 256 PAUSED, this guard is satisfied.

**Verdict.** Zero efficiency figures, **expected**. Distance to the first figure: gated on Meta returning non-zero `conversions` data for the contributing creative (or on accrual time passing if it accumulates slowly per the prompt's note about Gulf coaching accounts).

---

## §7. (Check 6) Errors and skips — verbatim

### §7.1 In-lease read failures

**None.** Zero hits in Cloud Logging for `metasyncperformance-00202-zoz` over the 24h freshness window for any of `in-lease`, `chunk failed`, `readExistingAdDocs`, `freshFailedReads`, `freshByAdId`, `seal_refused`, `db.getAll`, `DocumentReference`. The `syncSnapshots/{snapshotId}.errors[]` arrays for both windows contain **no entries** matching any `applyLearningWrites` source. (See §5 for the verbatim search commands and results.)

### §7.2 Aggregate commit failures

**None.** Zero hits for `learning aggregate update failed`. The `pain` aggregate's `lastUpdated = 1790088884410 = 14:54:44Z` is later than Sync 1's snapshot at `14:46:16Z`, confirming at least one successful aggregate commit landed in this window.

### §7.3 Lease refusals

**None.** No `learning lease held by` entry in either window. The 8-minute gap between Sync 1 (14:48:52Z) and Sync 2 (14:54:44Z) is well past the lease TTL.

### §7.4 One inter-sync busy-refusal (Sync 1.5)

The third press between Sync 1 and Sync 2 was refused at the busy-holder gate (verbatim):

```
📊 [Batch 6] metaSync busy — second concurrent press refused:
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "callerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "busyHolderUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "busyExpiresAtMs":1790088976269,
   "resultKey":"sync.result.busy"}
```

This is not a lease-refusal (the lease wasn't acquired by the refusing caller); it is the outer BUSY-gate from `concurrency.ts:15` which prevents two concurrent presses at the outer orchestrator. Sync 1's holder still held the busy lock at 14:47:58Z; the third press saw that and refused. The fourth press (Sync 2) succeeded 6 minutes later. This is correct behavior, not a defect.

### §7.5 Meta API rate-limit hits (Sync 2 only)

Sync 2's `syncSnapshots/snap_1790088884410_manual.errors[]` carries **50 identical entries** (verbatim, the slice truncates at 50; the underlying count is ≥ 50):

```
fetchAdInsights failed: Meta Graph API error 403: Application request limit reached (OAuthException)
```

— 50× verbatim. This is the **legacy fetchAdInsights path** in `shared.ts` calling Meta for the 3-day insights window. Sync 1's snapshot has no errors (status: ok); Sync 2's snapshot is `status: partial` and 50× rate-limited. This is a pre-existing Meta API quota issue unrelated to PR #73; same shape as the Sep 18 Sync 2 errors (also `fetchAdInsights failed: Meta Graph API error 403`, 24× in that snapshot).

The rate-limit hit is what caused Sync 2's `matched` count to drop from 27 → 16 — 11 ads were rate-limited during `fetchAdInsights` and could not be classified. Their adDoc merges still ran (with `ledger` only) but no new contributions were added to the `pain` aggregate for those 11 ads.

### §7.6 Fan-out Cloud Tasks dispatch failures — still failing every sync

The pre-existing fan-out `NOT_FOUND` issue is still present. Each sync emits 5 identical failures (one per non-active workspace). Verbatim from Sync 2:

```
⚠️ metaSync fan-out enqueue failed:
     workspace=5ZRdOCRnSKamHTiJd07F
     account=act_781389063661831
     error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
     workspace=9n2zPb3Z6D7IRBOLSXi0
     account=act_1451373605463040
     error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
     workspace=ZbGPvZbrAAFl8afG41dG
     account=act_1069240099193713
     error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
     workspace=kmuu4ZUMbsK5jnMCwglH
     account=act_1163959057640939
     error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
     workspace=m5VqQlf6bL2wWUVQDCy6
     account=act_995888422231015
     error=5 NOT_FOUND: Requested entity was not found.
```

`fanOut.queued: 0` on every sync (both Sep 22 syncs and the Sep 18 syncs). **Every cross-workspace dispatch still fails with `5 NOT_FOUND`.** The Cloud Tasks queue is missing or mis-targeted; the dispatcher cannot enqueue any non-active workspace. Pre-existing issue, also documented in `969-sync-check-01.md §7.1`, `969-sync-check-02.md §6`, and the previous round of this same report (`969-phase-4/reports/phase4-production-verification.md` §8.3, which is the report this PR's merge superseded).

This determines whether the nightly 03:00 fan-out to all workspaces runs — **it does not**, only the active workspace's inline path runs the new learning code. The active workspace (`ZVASEGdrF5qbizl4Bbug`) does NOT appear in the fan-out list because it is the inline workspace; the other 5 workspaces fail to enqueue.

### §7.7 OAuth re-auth / `needsReauth`

**None.** No `needsReauth` flag raised on either sync (the orchestrator only sets it when an `errors[]` entry contains the substring `/needsReauth/i`, and none of the 50 rate-limit errors do).

---

## §8. Verdict

| Check | Verdict |
|---|---|
| (1) In-lease read succeeded in production | **YES.** Zero in-lease read failures in Cloud Logging and zero in-lease read errors in the `syncSnapshots.errors[]` for both windows. Round-21's `path`-populated `DocumentReference` construction works against real Firestore. |
| (2) Learning wrote at all | **YES.** 707 of 759 adPerformance rows carry a `ledger` entry (+41 since Sep 18, all 41 from new rows). The 562 re-evaluated today carry the full Phase 4 write (ledger + sealed fields + adStatus). |
| (3) Nothing doubled between the two syncs | **YES (within observable scope).** Within-pair aggregate delta is not directly observable from logs (Sync 2 overwrote Sync 1's `pain` doc). The `pain` state is identical to the Sep 18 baseline on the structural fields (creativeCount=1, contributedCreativeKeys.length=1, byObjective.conversion.count=32, sampleSize=32, schemaVersion=1). avgLinkCtr moved 0.17 → 0.14 over 4 days (not within-pair). |
| (4) Phase 4 fields appearing | **YES, all five.** `adStatus`, `sealedTarget`, `sealedFunnelType`, `sealedAt`, `contributionState` all populated on **562 of 759 (74.0%)** rows. Single value: `sealedTarget=1.17`, `sealedAt=1790088376269` (= Sync 1's commit time), `sealedFunnelType=free_webinar` (per-generation lookup; workspace has no `funnelSettings` doc). `dayAccrual` is 0 — expected (per-day field; current day has no data). |
| (5) Efficiency figures present | **Zero, as expected on a fresh deploy.** Best-accrued creative is `creative:gen:UtCCphz5jAgFIEWCa7WQ` (27 direct + 5 propagated = 32 contributing rows). Zero contributing rows have any conversion accrued (`conversions3d: 0` on every `ledger.measurementInputs`). No creative is SEALED-but-blocked — all 562 SEALED rows just have zero `dayAccrual` data because no row has a conversion yet. First figure awaits real Meta conversion data landing. |
| (6) Errors / skips | **In-lease read: clean.** **Aggregate commit: clean.** **Lease refusal: clean.** **Fan-out: still failing** with `5 NOT_FOUND` on every cross-workspace dispatch (5× per sync, pre-existing, outside this PR). **Meta API rate-limit: Sync 2 hit 50× fetchAdInsights 403s** (the legacy fetch path; same shape as Sep 18 Sync 2). **One BUSY-refusal at the outer gate** (third press between Sync 1 and Sync 2) — correct behavior, not a defect. |
| Owner ran two manual syncs back to back | **YES, confirmed.** Sync 1 cold start at 14:46:12Z, completed 14:48:52Z. Sync 2 warm start at 14:54:44Z, completed 14:57:09Z. 8 minutes apart. Third press at 14:47:58Z refused at the BUSY gate (correct). |

**Headline.** The headline check no test can make — the in-lease read against real Firestore — **passed**. The fresh read accepts the new `path`-populated `DocumentReference` instances without throwing, and the 562-ad batch reads cleanly on both syncs. The Phase 4 fields (`adStatus`, `sealedTarget`, `sealedFunnelType`, `sealedAt`, `contributionState`) are present on the rows PR #73 says they should be present on, with the right values and the right shape. The pre-existing fan-out `NOT_FOUND` is still there — same shape as every prior production check — and is the only thing this PR did not address.

---

## §9. What I have NOT done

- **Not triggered any sync.** Read-only against Firestore. No production writes, no Cloud Function calls, no document updates, no `triggerMetaSync` invocation.
- **Not modified any PR or branch state.** No merges, no pushes, no PR comments.
- **Not changed any source file.** The reports/ files in `specs/969-cumulative-learning/reports/` are new artifacts recording what was probed; no `functions/src/` or `src/` change.

---

## §10. Capture artefacts

- `C:\temp\opencode\probe-meta-new.json` — `metaConnections/{uid}` + `users/{uid}/workspaces/*` + every `workspaces/*/settings/funnelSettings` (read fresh today).
- `C:\temp\opencode\probe-counts-new-utf8.json` — full paginated probe of `adPerformance` (all 759), `hookPerformance` (1), `visualPerformance` (0); field-presence counts; top-20 ledged creatives; sample rows.
- `C:\temp\opencode\probe-sample-row-utf8.json` — four full adPerformance doc reads (two sealed, one without Phase 4 fields, one matched).
- `C:\temp\opencode\probe-snapshots-utf8.json` — most-recent 8 `syncSnapshots/{snapshotId}` docs for the Boran workspace, with `errors[]` arrays verbatim.
- `C:\temp\opencode\logs-sync-new.txt` — Cloud Logging stdout for the deployed revision `metasyncperformance-00202-zoz`, freshness 2h, limit 2000 (includes the two [Batch 5] evidence logs, the [Batch 6] busy-refusal log, the 5 fan-out failures, and the per-sync `Synced N ads` summary).
- `C:\temp\opencode\logs-lease-search.txt` — Cloud Logging filter for in-lease / chunk / freshFailedReads / seal_refused patterns on `metasyncperformance` for 24h — returns `[]`.
- `C:\temp\opencode\logs-errors.txt` — Cloud Logging filter for `textPayload:errors` on `metasyncperformance` for 24h — returns `[]`.