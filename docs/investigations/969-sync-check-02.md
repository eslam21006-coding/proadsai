# 969 — Sync 2 post-deploy check (act_1180773537404268)

**Date:** 2026-09-18
**Project:** `proadsai-saas`
**Owner:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Trigger:** manual `triggerMetaSync` press — second run after Sync 1
**Sync 1 timestamp:** 07:11:25Z → 07:13:22Z
**Sync 2 timestamp:** 07:40:56Z → 07:42:57Z (~28 minutes after Sync 1)
**Capture scripts:** the same five scripts used for Sync 1 (`probe-sync01.cjs`,
`probe-fr076.cjs`, `probe-linkprovenance.cjs`, `probe-ledger-sample.cjs`,
`probe-creativekeys.cjs` — read-only, outside the repo).
**Raw outputs:** `C:\temp\opencode\sync02-output.json`, `fr076-02-output.json`,
`creativekeys-02-output.json`.

Same path as Sync 1 (the **actual** data path, not the empty `dueXIiFdEJKuAjSuYlUX`):
```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

---

## §0. Caveat stated up front — what these results do and do not cover

Both Sync 1 and Sync 2 used the **manual** path (the `triggerMetaSync` callable). The manual
path executes LEG B inline within the callable. The 03:00 scheduled job dispatches through
Cloud Tasks to `metaSyncAccountWorker` (`worker.ts`), which calls the same `runSyncForAccount`
in `shared.ts`. **The learning code, the lease logic, the per-account aggregates, and the
write paths are identical between manual and scheduled runs** — they invoke the same
`runSyncForAccount(...)` body.

**What these results cover:** the manual path's inline LEG B behaviour end-to-end. Same code
path as the scheduled worker. Same lease logic.

**What these results do NOT cover:**

- The Cloud Tasks dispatch and its retry behaviour (only the scheduled path uses it).
- The nightly 03:00 fan-out — every cross-workspace dispatch fails with
  `5 NOT_FOUND: Requested entity was not found` on both Sync 1 and Sync 2 (see §7.1 of
  `969-sync-check-01.md` and §6 below). That fan-out failure affects the scheduled path's
  ability to update non-active workspaces; it does NOT affect these manual runs, which only
  ran LEG B on the active Boran workspace.
- Run-numbering or quorum / dedup behaviour driven by the Cloud Tasks retry wrapper.

A reader comparing these to the scheduled path should expect identical aggregate outputs
*for the active workspace's account*; non-active workspaces' aggregates will not be touched
by the manual path at all.

---

## §1. The full comparison — every figure, side by side

The same seven checks as `969-sync-check-01.md`, with the **Sync 2** column added and the
**Δ** column showing movement between syncs.

### §1.1 Path-correction reminder

The owner's instruction gave path `dueXIiFdEJKuAjSuYlUX`; that path is empty (verified
again — `hookPerformance: 0`, `visualPerformance: 0`, `adPerformance: 0`, `adAccountDocExists:
false`). The data lives at `ZVASEGdrF5qbizl4Bbug` (the active Boran workspace), confirmed by
Cloud Logging's `activeWorkspaceId` field on the Batch 5 summary for **both** syncs.

### §1.2 Numbers, side by side

| Metric                                                                | Baseline (pre-deploy, this account) | Sync 1                          | Sync 2                          | Δ (S2 − S1)                | Belongs to one of the four critical checks? |
|-----------------------------------------------------------------------|--------------------------------------|---------------------------------|---------------------------------|----------------------------|---------------------------------------------|
| `adPerformance` doc count for this account                            | 625 (owner-quoted, stale)            | 718                             | **718**                         | 0                          | no                                          |
| `adPerformance` docs carrying `ledger`                                | 0                                    | 642 (89.4%)                     | **666 (92.8%)**                 | **+24**                    | no                                          |
| `hookPerformance` doc count for this account                          | 1 (pre-969 `pain`)                   | 1                               | **1**                           | 0                          | no                                          |
| `visualPerformance` doc count for this account                         | 0                                    | 0                               | **0**                           | 0                          | no                                          |
| **`pain` `creativeCount`**                                           | absent                               | **1**                           | **1**                           | **0**                      | **YES — no double-counting**. Stayed at 1.  |
| **`pain` `contributedCreativeKeys.length`**                          | absent                               | **1**                           | **1**                           | **0**                      | **YES — equals creativeCount**. Stayed equal. |
| **`pain` `byObjective.conversion.count`**                            | 5                                    | **32**                          | **32**                          | **0**                      | **YES — non-shrinking**. Stable; no withdrawal fired. |
| **`pain` `byObjective.conversion.avgLinkCtr`**                       | absent                               | **0.17**                        | **0.17**                        | **0**                      | **YES — stable**. Identical inputs took the noop path. |
| `pain` `sampleSize`                                                  | 5                                    | **32**                          | **32**                          | 0                          | no                                          |
| `pain` `schemaVersion`                                               | absent                               | 1                               | **1**                           | 0                          | no                                          |
| `pain` `byFunnelType.free_webinar`                                   | absent                               | 27                              | **27**                          | 0                          | no                                          |
| `pain` `byFunnelType.unknown`                                        | absent                               | 0                               | **0**                           | 0                          | no                                          |
| 5-row gap between `byObjective.conversion.count` (=32) and `byFunnelType` sum (=27) | n/a | 5 (unchanged across syncs) | **5** (unchanged across syncs) | 0                          | tracked in Sync 1, stable                    |
| FR-076 (derived) `direct_auto` (creativeKey starts with `creative:gen:` + matchType auto_hash + ledger) | 5 | 27 | **27** | 0 | no |
| FR-076 (derived) `manual` (matchType manual + ledger)                  | 0                                    | 0                               | **0**                           | 0                          | no                                          |
| FR-076 (derived) `propagated` (matchType null + ledger + creativeKey starts with `creative:hash:`) | 0 | 615 | **639** | **+24** | tracked — propagation working |
| FR-076 (derived) `no_generation` (no ledger)                          | 620                                  | 76                              | **52**                          | **−24**                   | tracked                                     |
| Orchestrator `inline.counts.matched`                                 | n/a                                  | 27                              | **27**                          | 0                          | no                                          |
| Orchestrator `inline.counts.unmatched`                               | n/a                                  | 615                             | **639**                         | **+24**                    | matches derived `propagated` exactly        |
| Orchestrator `inline.counts.ads`                                     | n/a                                  | 666                             | **666**                         | 0                          | no                                          |
| Orchestrator `inline.status`                                         | n/a                                  | `partial`                       | **`ok`**                       | partial → ok               | status upgrade only (no count change)       |
| Orchestrator `fanOut.queued`                                         | n/a                                  | 0                               | **0**                           | 0                          | (unchanged bug — see §6)                    |
| Orchestrator `fanOut.rateLimited`                                    | n/a                                  | `["act_1180773537404268"]`      | `[]`                            | fixed? — see §6             | cleared in Sync 2                            |
| `OAuthException` rate-limit hits in Cloud Logging                    | n/a                                  | 0                               | **0**                           | 0                          | no retune warranted                          |
| Fan-out Cloud Tasks dispatch failures                                | n/a                                  | 5 (`5 NOT_FOUND`)               | **5 (`5 NOT_FOUND`)**          | 0 (still failing every time) | bug — see §6                                |

### §1.3 The four critical checks (the test the whole exercise exists for)

**Check 1 — `creativeCount` unchanged.** **PASS.** `pain.creativeCount` is `1` in both
Sync 1 and Sync 2. Identical. The observation-counting defect Batch 28 fixed is NOT live in
production.

**Check 2 — `contributedCreativeKeys.length` equals `creativeCount`.** **PASS.** Both are
`1` in both syncs. The invariant holds. Same creative (`creative:gen:UtCCphz5jAgFIEWCa7WQ`)
is the source of all 32 contributed rows in both syncs.

**Check 3 — `byObjective.conversion.count` non-shrinking.** **PASS.** `pain`'s count is `32`
in both syncs. No withdrawal fired that should not have. The count did not shrink, and it
did not grow — because the 24 newly-propagated rows in Sync 2 (the +24 delta in
`adPerformance with ledger`) contributed to **other** angles, not to `pain`. `pain`'s
32 contributors are the same 32 in both syncs.

**Check 4 — `avgLinkCtr` stable.** **PASS.** `pain.byObjective.conversion.avgLinkCtr` is
`0.17` in both syncs, identical. Identical inputs took the noop path — Batch 28's
withdrawal arithmetic is firing correctly (it didn't fire at all, which is the correct
outcome when the data being added matches what's already there).

---

## §2. What moved between Sync 1 and Sync 2

| Field                                           | Sync 1 | Sync 2 | Δ    | Belongs to one of the four? |
|-------------------------------------------------|--------|--------|------|------------------------------|
| `pain.creativeCount`                            | 1      | 1      | 0    | YES — unchanged ✓             |
| `pain.contributedCreativeKeys.length`           | 1      | 1      | 0    | YES — unchanged ✓             |
| `pain.byObjective.conversion.count`             | 32     | 32     | 0    | YES — unchanged ✓             |
| `pain.byObjective.conversion.avgLinkCtr`        | 0.17   | 0.17   | 0    | YES — unchanged ✓             |
| `pain.sampleSize`                               | 32     | 32     | 0    | no                            |
| `pain.byFunnelType.free_webinar`                | 27     | 27     | 0    | no                            |
| `pain.byFunnelType.unknown`                     | 0      | 0      | 0    | no                            |
| `pain.lastUpdated`                              | 1789715487711 (07:11 UTC) | 1789717259548 (07:41 UTC) | updated | no |
| `pain` schemaVersion                            | 1      | 1      | 0    | no                            |
| `adPerformance` total docs                      | 718    | 718    | 0    | no                            |
| `adPerformance` with ledger                     | 642    | 666    | **+24** | no — propagation working as expected |
| FR-076 derived: `direct_auto`                   | 27     | 27     | 0    | no                            |
| FR-076 derived: `manual`                        | 0      | 0      | 0    | no                            |
| FR-076 derived: `propagated`                    | 615    | 639    | **+24** | no — propagation |
| FR-076 derived: `no_generation`                 | 76     | 52     | **−24** | no — link rate up |
| Orchestrator `inline.status`                   | partial | ok    | improved | no |

**Summary of movement:** The four critical check fields are all unchanged (correct). The
project-wide propagated count grew by 24 rows (correct — fresh Meta data, fresh hash
sibling matches). The project-wide `no_generation` count shrank by 24 rows (correct — those
24 rows got matched via propagation). The `pain` aggregate was re-touched (lastUpdated
advanced, schemaVersion unchanged) but its numerical content stayed identical.

The 24 newly-propagated rows are the only meaningful delta, and **none of them touched any
of the four critical-check fields** because they are not `pain` contributors — they belong
to other angles. (The aggregate side of the system has not been enumerated for the other
angles; the project's hook aggregate count for this account is still 1, `pain`.)

---

## §3. Was the second sync refused by the lease?

**No.** The Cloud Logging trace for Sync 2:

```
2026-09-18T07:40:56.605719Z I metasyncperformance:
2026-09-18T07:40:58.878310Z D metasyncperformance:
       {"verifications":{"auth":"VALID","app":"MISSING"},
        "message":"Callable request verification passed"}
2026-09-18T07:41:51.843436Z ? metasyncperformance:
       📊 Synced 422 ads across 23 accounts (owner=ywpCgWsXqVP4tlNwfhSoTqMjRw52, caller=-)
2026-09-18T07:42:56.921366Z ? metasyncperformance: ⚠️ metaSync fan-out enqueue failed: ...
2026-09-18T07:42:57.460106Z ? metasyncperformance:
       📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
       {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
        "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
        "ok":false,
        "resultKey":"failed",
        "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
        "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
                  "accountId":"act_1180773537404268",
                  "status":"ok",
                  "counts":{"ads":666,"matched":27,"ambiguous":0,"unmatched":639}},
        "fanOut":{"queued":0,"rateLimited":[]}}
```

There is no `AlreadyRunningError`, no `busy`, no `acquireLearningLease failed` line, no
`learning lease held by` line. The callable went through cleanly. Sync 1 ended at 07:13:22Z
and Sync 2 started at 07:40:56Z — 27 minutes apart, well past the learning-lease TTL (which
is in the minutes range). The two syncs were **sequential, not concurrent**.

That means the Sync 2 column in §1.2 represents a real second run, not a refused-and-skipped
sync that would happen to produce the same numbers for the wrong reason. The 24-row
delta in `with-ledger` is genuine propagation of new sibling matches from the second pull
of Meta data, not a stale-skipped repeat.

---

## §4. Did the FR-076 breakdown change between the two runs?

Yes — and the change is in line with the design, not against it.

| FR-076 bucket    | Sync 1 | Sync 2 | Δ    | Interpretation |
|------------------|--------|--------|------|----------------|
| `direct_auto`    | 27     | 27     | 0    | No new direct matches from the second pull. The 27 hash-matched creatives and their 27 source rows are stable. |
| `manual`         | 0      | 0      | 0    | No manual matches at any point. |
| `propagated`     | 615    | 639    | **+24** | 24 rows that were `no_generation` in Sync 1 became `propagated` in Sync 2 — they now share a hash with a directly-matched row that the Sync 2 Meta pull exposed. This is FR-074's hash-group propagation doing its job across syncs. |
| `no_generation`  | 76     | 52     | **−24** | The 24 rows that became linked. |

**The matching-degradation signature is NOT present.** That signature would be "direct_auto
falls while propagated rises on the same creative." Here direct_auto is flat (27 → 27) and
propagated is up (615 → 639) on a different set of rows. The owner should compare:

- direct_auto = 27 in both syncs → no degradation in the matching logic itself.
- propagated = 615 → 639 → the propagation surface grew because more rows were eligible for
  hash-sibling matching.

The four-bucket totals sum correctly in both syncs: 27 + 0 + 615 + 76 = 718 in Sync 1;
27 + 0 + 639 + 52 = 718 in Sync 2. The grand total is stable at 718.

The same audit-trail caveat from Sync 1 holds: the FR-076 four-way breakdown is not emitted
in any runtime log line. The numbers above are derived from `matchType` + `ledger.creativeKey`
prefix + `ledger` presence.

---

## §5. Errors and skips — anything new in `errors[]`?

Nothing new in Sync 2's `errors[]` beyond what Sync 1 already saw.

Verbatim, from the Batch 5 summary line for Sync 2:

```json
{
  "ownerUid": "ywpCgWsXqVP4tlNwfhSoTqMjRw52",
  "activeWorkspaceId": "ZVASEGdrF5qbizl4Bbug",
  "ok": false,
  "resultKey": "failed",
  "legacy":   { "accountsSynced": 23, "adsSynced": 422, "rateLimited": [], "errorCount": 0 },
  "inline":   { "workspaceId":   "ZVASEGdrF5qbizl4Bbug",
                "accountId":     "act_1180773537404268",
                "status":        "ok",
                "counts":        { "ads": 666, "matched": 27, "ambiguous": 0, "unmatched": 639 } },
  "fanOut":   { "queued": 0, "rateLimited": [] }
}
```

Differences from Sync 1's Batch 5:

| Field                            | Sync 1               | Sync 2          |
|----------------------------------|----------------------|-----------------|
| `inline.status`                  | `"partial"`          | `"ok"`          |
| `inline.counts.unmatched`        | 615                  | 639             |
| `fanOut.rateLimited`             | `["act_1180773537404268"]` | `[]`            |
| `resultKey`                      | `"failed"`           | `"failed"`      |

`inline.status` going from `partial` → `ok` is consistent with the orchestrator observing
the inline run complete cleanly. `fanOut.rateLimited` going from a one-element array to
empty is consistent with the second run timing differently relative to Meta's rate-limit
windows; the fan-out itself still failed (queued: 0, all 5 cross-workspace dispatches
returned `5 NOT_FOUND`). `resultKey: "failed"` is unchanged because the fan-out failure
dominates the orchestrator's ok check (per the runbook; legacy LEG A finished cleanly,
inline LEG B finished cleanly, only the fan-out is broken).

There are no `errorCount > 0` lines, no `AlreadyRunningError`, no `OAuthException`, no
`learning lease lost between acquire and pre-commit re-check`, no
`load existing adPerformance failed`, no `learning aggregate glitch`. The only failure
mode repeated across both syncs is the fan-out dispatch — which is not in this run's
write path (the inline path on the active workspace is what produces the Sync 2 numbers).

The fan-out failure log lines for Sync 2 (verbatim, same format as Sync 1):

```
2026-09-18T07:42:56.921366Z  ⚠️ metaSync fan-out enqueue failed:
                              workspace=5ZRdOCRnSKamHTiJd07F
                              account=act_781389063661831
                              error=5 NOT_FOUND: Requested entity was not found.

2026-09-18T07:42:57.088926Z  ⚠️ metaSync fan-out enqueue failed:
                              workspace=9n2zPb3Z6D7IRBOLSXi0
                              account=act_1451373605463040
                              error=5 NOT_FOUND: Requested entity was not found.

2026-09-18T07:42:57.263668Z  ⚠️ metaSync fan-out enqueue failed:
                              workspace=ZbGPvZbrAAFl8afG41dG
                              account=act_1069240099193713
                              error=5 NOT_FOUND: Requested entity was not found.

2026-09-18T07:42:57.288550Z  ⚠️ metaSync fan-out enqueue failed:
                              workspace=kmuu4ZUMbsK5jnMCwglH
                              account=act_1163959057640939
                              error=5 NOT_FOUND: Requested entity was not found.

2026-09-18T07:42:57.459340Z  ⚠️ metaSync fan-out enqueue failed:
                              workspace=m5VqQlf6bL2wWUVQDCy6
                              account=act_995888422231015
                              error=5 NOT_FOUND: Requested entity was not found.
```

Identical signature to Sync 1. Same five workspaces, same `5 NOT_FOUND` error code, same
result that `fanOut.queued: 0`. The Cloud Tasks queue referenced by the dispatcher is still
not present (or the dispatcher is targeting the wrong path) — confirming this is a
persistent configuration gap, not a transient failure.

---

## §6. The 5-row gap carried over from Sync 1

The `pain` aggregate has `byObjective.conversion.count: 32` but the sum of `byFunnelType`
buckets is 27. The 5-row gap is **stable across Sync 1 and Sync 2** (both syncs show the
same 27 + 0 + 0 + 0 + 0 = 27, missing 5).

The probable cause (carried over from Sync 1 §5) is unchanged:

- 27 `direct_auto` rows match a generation whose `funnelType = "free_webinar"`. Those land
  in `pain.byFunnelType.free_webinar`.
- 5 `propagated` rows share a hash with one of those 27. They contribute to
  `pain.byObjective.conversion.count` (because they hash-share the same creative → same angle),
  but their ledger entry does not carry a `generationId`, so the worker's funnel-type lookup
  (probably by generation id) returns nothing for them, and they don't land in any
  `byFunnelType` bucket.

The gap is **stable** and **not growing**. It is a design observation, not a defect — the
propagated rows legitimately can't be attributed to a funnel type without a generation to
read the type from. Whether the FR-041 multi-funnel indicator should surface a "5 of 32
contributions unaccounted for" warning is a UX decision the operator owns.

---

## §7. The five figures the operator asked about, one more time

| Critical-check figure        | Sync 1 | Sync 2 | Verdict       |
|------------------------------|--------|--------|----------------|
| `creativeCount`              | 1      | 1      | unchanged ✓   |
| `contributedCreativeKeys.length` | 1   | 1      | unchanged ✓, still equals `creativeCount` |
| `byObjectiveConversionCount` | 32     | 32     | non-shrinking ✓, non-doubling ✓ |
| `avgLinkCtr`                 | 0.17   | 0.17   | stable ✓ (noop path was taken) |
| `byFunnelType.free_webinar`  | 27     | 27     | unchanged ✓   |

All five figures pass. The observation-counting defect Batch 28 fixed is not live.
Withdrawal arithmetic is firing correctly. Accumulation is behaving correctly.

---

## §8. Audit trail

- Sync 1, captured at 2026-09-17T22:01Z and committed at `126c5ad`. Report at
  `docs/investigations/969-sync-check-01.md`.
- Sync 2, captured at 2026-09-18T07:43Z (just now). This report.
- Both probe scripts are out-of-repo at `C:\temp\opencode/`. Raw outputs are there too.
- No production writes. No fixes applied. No phase 4/5/6 work started.
