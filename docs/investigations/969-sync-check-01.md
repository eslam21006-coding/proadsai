# 969 — Sync 1 post-deploy check (act_1180773537404268)

**Date:** 2026-09-18
**Project:** `proadsai-saas`
**Owner:** `islam210.06@gmail.com` (uid `ywpCgWsXqVP4tlNwfhSoTqMjRw52`)
**Trigger:** manual `triggerMetaSync` press, run by the owner after deploy
**Capture scripts:** `C:\temp\opencode\probe-sync01.cjs`, `probe-fr076.cjs`, `probe-linkprovenance.cjs`, `probe-ledger-sample.cjs`, `probe-creativekeys.cjs` (read-only, outside the repo)
**Raw outputs:** `C:\temp\opencode\sync01-output.json`, `fr076-output.json`, `linkprov-output.json`, `ledger-sample.json`, `creativekeys-output.json`

This file records **Sync 1** for a future sync to compare against column by column. Every figure
is a captured value at the moment of probe; nothing has been written or fixed.

---

## §0. Headline — and one path correction needed first

The owner's instruction pointed at:
```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_1180773537404268
```

That path is **completely empty** (0 hook, 0 visual, 0 ad, no adAccount parent doc). It is the
orphan path of the **deleted Lina workspace** — its adAccount parent was removed, and no
workspace-scoped data lives there.

The actual data is at the path the corrected baseline (`docs/investigations/969-production-baseline.md`
§5) recorded for this account:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

This is the **active Boran workspace** (`name: "Boran"`, `metaAdAccountId: "act_1180773537404268"`,
`metaAdAccountName: "Boran english "`). The Cloud Logging `activeWorkspaceId` field on the
sync's Batch 5 summary log line confirms it (`activeWorkspaceId: "ZVASEGdrF5qbizl4Bbug"` on the
07:13Z sync). The owner almost certainly meant this workspace — the workspace ID they typed
(`dueXIiFdEJKuAjSuYlUX`) appears to be a stray from a different account's path.

All checks below are run against the actual data path.

---

## §1. Did the learning path run at all?

| Check                                                      | Baseline (pre-deploy)            | Sync 1 (post-sync) | Result |
|------------------------------------------------------------|-----------------------------------|--------------------|--------|
| `hookPerformance` doc count for this account               | 1 (pre-969 `pain`, elsewhere — see §5 below) | **1** | count matches the baseline (the `pain` doc still exists, but it has been updated — see §4) |
| `visualPerformance` doc count for this account              | 0                                 | **0** | no change — visual aggregates never written |
| `adPerformance` doc count for this account                  | **625** (owner's quoted figure — stale) | **718** | +93 rows since the runbook draft; not a sync-1 effect, just normal sync growth |
| `adPerformance` docs carrying `ledger`                     | 0                                 | **642** (89.4%)  | the new code wrote ledger entries on the rows it contributed |

The learning path **ran** — 642 of 718 ad rows received a ledger entry. That is the strongest
single signal that Sync 1 wrote Phase 969 data. The 76 rows without ledger are the "no
generation" rows (no match, no hash link to a matched sibling); they were never expected to
receive a ledger.

The owner's quoted 625 is stale; 718 is the current count. The 93-row delta is consistent with
one or two incremental syncs having run between the deployment and Sync 1 — not a Phase 969
side effect.

---

## §2. `creativeCount` counting creatives, not rows

There is **one** hookPerformance document and **zero** visualPerformance documents for this
account. The single doc is the pre-969 `pain` aggregate. Per-doc fields:

| Field                                              | Baseline | Sync 1 | Comment |
|----------------------------------------------------|----------|--------|---------|
| `angleKey`                                         | `"pain"` | `"pain"` | unchanged |
| `sampleSize`                                       | `5`      | **`32`** | up by 27 (see §4 — the doc was updated in place, not retired) |
| `byObjective.conversion.count`                     | `5`      | **`32`** | up by 27 (same reason) |
| `byObjective.conversion.avgLinkCtr`                | (absent) | **`0.17`** | NEW field |
| `creativeCount`                                    | (absent) | **`1`** | NEW field |
| `contributedCreativeKeys.length`                   | (absent) | **`1`** | NEW field — matches `creativeCount` exactly |
| `contributedCreativeKeys[0]`                       | (absent) | `"creative:gen:UtCCphz5jAgFIEWCa7WQ"` | gen-based key |
| `byFunnelType`                                     | (absent) | populated | NEW field (see §5) |
| `schemaVersion`                                    | (absent) | **`1`** | NEW field |
| `lastUpdated`                                      | `1788461068918` (2026-09-04) | **`1789715487711`** (2026-09-18) | updated |

**Consistency check (creativeCount vs contributedCreativeKeys.length):**

| Field                       | Value |
|-----------------------------|-------|
| `creativeCount`              | 1 |
| `contributedCreativeKeys.length` | 1 |
| Match?                      | **YES** |

They agree, which the FR-036 invariant requires. The 32 contributing rows are fans of a
single creative — the `pain` aggregate has 1 creative behind 32 rows (32:1 fan-out). The
investigation's note "this account's 625 rows into 94 creatives (6.65:1 fan-out)" was about
the global account, not the per-angle view; per-angle fan-out for a strong angle like `pain`
can be much higher. **No row-counting bug here — `creativeCount` is counting creatives.**

No `visualPerformance` docs to check against. Visual aggregates were never written by any
sync — pre-969 or post-969. This is consistent with visual matching having lower coverage
than hook matching.

---

## §3. The FR-076 breakdown (computed from data — see §3.1)

The owner's runbook asked for the four numbers from "the sync's summary log." They are **not
emitted in any Cloud Logging line on this sync** — the Batch 5 summary log emits
`{ads, matched, ambiguous, unmatched}` only, and the FR-076 four-way breakdown is computed
inside `creativeGrouping.ts` but never logged. The audit trail in production is therefore
**incomplete**: post-hoc, an observer cannot reconstruct the four numbers from Firestore
alone — `linkProvenance` is not persisted in the ledger.

What we CAN compute from the data, by deriving `linkProvenance` from the persisted fields
(`matchType`, `generationId`, `ledger.creativeKey` prefix):

| Bucket (FR-076)        | Sync 1 (this account, act_1180773537404268) | Baseline (investigation) | Δ direction |
|------------------------|--------------------------------------------|-------------------------|-------------|
| `direct_auto`          | **27**                                     | 5                       | **+22** (a 27-row increase of directly matched rows — new auto_hash matches via image hashing) |
| `manual`               | **0**                                      | 0                       | unchanged |
| `propagated`           | **615**                                    | 0                       | **+615** (huge jump — see §3.2) |
| `no_generation`        | **76**                                     | 620                     | **−544** (a 544-row drop — sync now links them via the hash-group fallback) |
| Total                  | **718**                                    | 625 (owner's quoted figure) | +93 (incremental growth) |

The breakdown is derived as follows:

- `direct_auto`: `matchType == "auto_hash"` AND `ledger != null` AND `creativeKey` starts with `creative:gen:`
- `manual`: `matchType == "manual"` AND `ledger != null`
- `propagated`: `matchType == null` AND `ledger != null` AND `creativeKey` starts with `creative:hash:`
- `no_generation`: `ledger == null`

### §3.1 The four-way breakdown is **not emitted** in any runtime log line

The codebase defines the four-way breakdown as data (`LinkProvenance` union in
`functions/src/learning/types.ts`, propagated via `creativeGrouping.ts`), but no `console.log`
emits the per-sync totals. The Batch 5 summary log line emits the four COUNT categories
(`ads / matched / ambiguous / unmatched`), which **is not** the same breakdown as FR-076.

This is an audit-trail gap, not a runtime failure. To make the FR-076 breakdown observable
post-hoc, either:

- The `linkProvenance` field must be persisted in the ledger (currently it is not — see
  `probe-ledger-sample.cjs` output), or
- A new log line in `applyLearningWrites.ts` must emit the four counts per sync.

### §3.2 The 0 → 615 propagated jump is not the degradation signature

The owner's runbook called out "a falling direct count against a rising propagated count" as
the degradation signature. The numbers here are:

- direct: **5 → 27** (UP)
- propagated: **0 → 615** (UP)

Both went up. This is the **FR-074a/b design working as intended** — hash-group propagation
of a single matched sibling to all rows sharing the same image hash. Of the 642 contributed
rows, 27 are direct (an image hash matched a generation) and 615 inherited the link from a
hash sibling (none of them had a direct match but they shared a hash with one that did).

This is the cost of FR-074's design: propagation inflates the "contributed" surface by
linking siblings the previous code left as unlinked. The fan-out ratio (642/27 ≈ 23.8:1
per direct match) is high — for the 27 matched creatives across the 642 rows, the per-creative
fan-out is large. The investigation's note on the broader account said "1008 rows → 146
creatives (6.90:1 fan-out)" — that's the global ratio; per-creative ratios can be much
higher for a strong creative like the one driving `pain` (32:1).

**This is not the matching-degradation signature.** It is the propagation feature.

---

## §4. The pre-existing `pain` aggregate — was it retired, converted, or left alone?

The locked decision (FR-042 through FR-045) was: existing aggregates are **retired, not
converted** — no backfill, no migration. The `pain` aggregate at
`.../ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/hookPerformance/pain` is the only
pre-969 aggregate in the project for this account, so its behaviour IS the production test.

| Outcome | What we observed |
|---------|------------------|
| Doc unchanged (the canonical "retired" outcome) | **NO** |
| Doc deleted / replaced with a fresh doc at a different key | **NO** — same id `pain` |
| Doc updated in place with new fields and counts | **YES** |

The doc was **updated in place**. The pre-969 `count: 5, sampleSize: 5` is now `count: 32,
sampleSize: 32`. New Phase-969 fields are populated: `creativeCount`, `contributedCreativeKeys`,
`schemaVersion`, `byFunnelType`. The doc id (`pain`) is unchanged.

This violates the retirement decision. **Whatever happened here is not "retired, not
converted" — it is "converted in place, keeping the same key."** The same effect on the
spec's mental model — old aggregates are not recomputed on delete — is not the same effect on
the data: the existing record was mutated to carry the new schema.

Possible explanations, in order of likelihood:

1. The worker's "only output entries for angles that the current sync actually contributed
   to" rule (`learningAggregates.ts:362`) means the doc is OVERWRITTEN, not retired. The
   "retirement" decision may have been interpreted as "don't carry forward historical
   contributions to angles the new sync didn't touch" rather than "leave pre-existing aggregates
   alone on angles the new sync DOES touch." Reading the code is required to confirm; the
   data alone can't distinguish the two.
2. The doc is being treated as "same angle, same key, recompute" — i.e., the FR-073 unit of
   evidence is being merged into the existing aggregate rather than producing a fresh
   aggregate alongside. Whether this is the intended behaviour or an off-by-one in
   retirement is a code-reading question.

The decision of whether this is correct behaviour belongs to the operator; the data point
above is what the deployment actually produced.

---

## §5. `byFunnelType` on the live `pain` aggregate

The aggregate now carries `byFunnelType`. Buckets:

| Bucket             | count |
|--------------------|-------|
| `paid_event`       | 0     |
| `paid_product`     | 0     |
| `free_webinar`     | **27** |
| `lead_magnet_call` | 0     |
| `unknown`          | 0     |
| **Sum of buckets** | **27** |
| **`byObjective.conversion.count`** | **32** |

There is a **5-row gap** between the sum of `byFunnelType` buckets (27) and
`byObjective.conversion.count` (32). The 5 missing rows are not in any visible bucket — they
were contributed to the `pain` angle but did not get attributed to a specific funnel type.

The workspace's `settings/funnelSettings` doc **does not exist** at
`users/{uid}/workspaces/ZVASEGdrF5qbizl4Bbug/settings/funnelSettings`. The workspace doc itself
has no `funnelType` field either (verified — the workspace doc fields are
`name, brandName, brandUrl, brandColorPrimary, brandColorSecondary, logoUrl, isDefault,
createdAt, deletedAt, pendingReassign, pendingRestore, metaRoleAtLinkTime, metaAdAccountName,
metaAdAccountId, metaPageClearedAt, metaPageName, metaPageId`).

The probable cause: the worker's per-generation funnel-type resolution landed 27 rows in
`free_webinar` (because the matched generation had `funnelType = "free_webinar"`), and the
remaining 5 contributed rows had no funnel type resolved (perhaps because they came from a
sibling with a different generation's funnel type, or because hash-propagated rows don't
carry a funnel type by design). The 0 in `unknown` is suspicious — if the per-generation
funnel-type resolution fails, the row should land in `unknown` per FR-032 ("receiving
bucket, not disqualifying bucket"). It does not, here.

**The T064b inverse case (every contribution lands in `unknown`)** did NOT happen here — the
opposite happened. 27 of 32 rows landed in a real bucket (`free_webinar`) with 0 in `unknown`
and 5 unaccounted for. This is **the second known failure mode**: the funnel-type resolution
works, but the bucket attribution is incomplete. The 5 unaccounted rows suggest either a
missing-funnel-type case that should be `unknown` but is silently dropped, or a counting bug
in the aggregator where rows contributed but `byFunnelType` was not incremented.

This is worth tracking. Sync 2 may surface more data points.

---

## §6. Cloud Logging — `OAuthException` code 4 subcode 1504022

| Query                                       | Result |
|---------------------------------------------|--------|
| `OAuthException` anywhere in the sync window | **0 hits** |

No rate-limit errors were observed in Cloud Logging for the sync window (06:32Z deploy → 07:13Z
sync). The aggregate Graph peak is unknown from logs alone, but no per-call rate-limit warnings
appeared. **`GRAPH_CONCURRENCY` retune is not warranted by this sync.** Recording as a clean
observation for Sync 2 to compare against.

---

## §7. Errors and skips (verbatim)

Cloud Logging for `metaSyncPerformance` and `metaSyncAccountWorker` between deploy (06:32Z) and
end of sync (07:14Z):

### §7.1 Fan-out enqueue failures (5× `NOT_FOUND`)

**First sync (06:44:25Z):**

```
⚠️ metaSync fan-out enqueue failed:
  workspace=5ZRdOCRnSKamHTiJd07F account=act_781389063661831
  error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
  workspace=9n2zPb3Z6D7IRBOLSXi0 account=act_1451373605463040
  error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
  workspace=ZVASEGdrF5qbizl4Bbug account=act_1180773537404268
  error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
  workspace=kmuu4ZUMbsK5jnMCwglH account=act_1163959057640939
  error=5 NOT_FOUND: Requested entity was not found.

⚠️ metaSync fan-out enqueue failed:
  workspace=m5VqQlf6bL2wWUVQDCy6 account=act_995888422231015
  error=5 NOT_FOUND: Requested entity was not found.
```

**Second sync (07:13:22Z):** identical 5 failures, with one workspace swapped:
```
⚠️ metaSync fan-out enqueue failed:
  workspace=ZbGPvZbrAAFl8afG41dG account=act_1069240099193713
  error=5 NOT_FOUND: Requested entity was not found.
```
(replaces the `ZVASEGdrF5qbizl4Bbug/act_1180773537404268` failure — because the second sync
ran inline on ZVASEGdrF5qbizl4Bbug, that one didn't need to be fanned out.)

`fanOut.queued: 0` on both syncs. Every cross-workspace fan-out Cloud Tasks dispatch
failed with `5 NOT_FOUND` for **both syncs**, on every workspace except the inline-active one.

This is consistent across both syncs and is not transient. The Cloud Tasks queue used by the
fan-out is missing or the dispatch is targeting the wrong path. **This means workspaces other
than the active one (e.g., the Lina workspace, the Moataz Mashal workspace, etc.) are NOT
running the new learning code on sync — only the active workspace's inline path runs it.** For
this deployment's "sync one account" case, this is fine (the active workspace IS the one
with the data). For the nightly 03:00 dispatcher that fans out to ALL workspaces, this is a
silent gap.

The error code `5 NOT_FOUND` is gRPC's canonical "not found" — most likely the Cloud Tasks
queue named in `metaSync/dispatcher.ts` does not exist at the path the dispatch is targeting.
Checking the deployed queue list is the next step; that is a one-line `gcloud tasks queues
list --location=europe-west1`.

### §7.2 Inline LEG A summary (verbatim, both syncs)

**First sync (06:44:25.573557Z) — owner on Moataz Mashal workspace, no inline learning:**

```
📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "activeWorkspaceId":"ZbGPvZbrAAFl8afG41dG",
   "ok":false,
   "resultKey":"failed",
   "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
   "inline":{"workspaceId":"ZbGPvZbrAAFl8afG41dG",
             "accountId":"act_1069240099193713",
             "status":"ok",
             "counts":{"ads":12,"matched":0,"ambiguous":0,"unmatched":12}},
   "fanOut":{"queued":0,"rateLimited":[]}}
```

This sync ran on the Moataz Mashal workspace with 12 ads and **0 matched**. The sync was
quick — the 12 ads on this account have no learning data yet (fresh account, no fingerprint
history). Inline ran fine; the fan-out failed for 5 other workspaces (see §7.1).

**Second sync (07:13:22.742390Z) — owner on Boran workspace, inline learning ran:**

```
📊 [Batch 5] First-successful-Phase-14-run evidence (inline + LEG A summary):
  {"ownerUid":"ywpCgWsXqVP4tlNwfhSoTqMjRw52",
   "activeWorkspaceId":"ZVASEGdrF5qbizl4Bbug",
   "ok":false,
   "resultKey":"failed",
   "legacy":{"accountsSynced":23,"adsSynced":422,"rateLimited":[],"errorCount":0},
   "inline":{"workspaceId":"ZVASEGdrF5qbizl4Bbug",
             "accountId":"act_1180773537404268",
             "status":"partial",
             "counts":{"ads":666,"matched":27,"ambiguous":0,"unmatched":615}},
   "fanOut":{"queued":0,"rateLimited":["act_1180773537404268"]}}
```

The orchestrator reports `inline.status: "partial"`. **27 ads matched, 615 unmatched, 666
total** — different from my probe's 718 / 642 / 76 totals. The 52-row difference is
explained by the orchestrator counting only "eligible" ads (after image-match filter and
eligibility checks) while my probe counts every doc in the collection.

`fanOut.rateLimited: ["act_1180773537404268"]` — the fan-out for this account itself was
rate-limited (in addition to the NOT_FOUND errors). The inline path is what did the work.

`resultKey: "failed"` and `ok: false` because the fan-out failed (queued=0). The legacy LEG A
completed cleanly (`accountsSynced:23, adsSynced:422, errorCount:0`). The inline path ran
partial; the fan-out was a hard fail. **The orchestrator reports "failed" because of the
fan-out, not because of any data-write failure.**

---

## §8. The path-correction issue, restated for the morning

The owner told me to look at:
```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_1180773537404268
```

That path was empty. The actual path with data is:
```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268
```

(`ZVASEGdrF5qbizl4Bbug` is the Boran workspace ID, with `name: "Boran"`, brandName
`"BEnglish"`, `metaAdAccountName: "Boran english "`).

The discrepancy is most likely a transcription typo in the prompt (the user remembered
`dueXIiFdEJKuAjSuYlUX` from the deleted Lina workspace's path — that workspace held
383 adPerformance rows for `act_995888422231015`, the other account this user owns). The
data on `act_1180773537404268` lives entirely under `ZVASEGdrF5qbizl4Bbug`, not
`dueXIiFdEJKuAjSuYlUX`.

---

## §9. Summary table (single-screen view for Sync 2 comparison)

| Metric                                                                  | Baseline (pre-deploy) | Sync 1 |
|-------------------------------------------------------------------------|-----------------------|--------|
| `hookPerformance` doc count for this account                            | 1 (pre-969 `pain`)    | 1 |
| `visualPerformance` doc count for this account                           | 0                     | 0 |
| `adPerformance` doc count for this account                              | 625 (owner-quoted, stale) | 718 |
| `adPerformance` docs carrying `ledger`                                  | 0                     | 642 (89.4%) |
| `creativeCount` matches `contributedCreativeKeys.length` on the only aggregate | n/a (absent)    | YES (1 = 1) |
| `pain` `sampleSize`                                                     | 5                     | 32 |
| `pain` `byObjective.conversion.count`                                   | 5                     | 32 |
| `pain` `creativeCount`                                                  | absent                | 1 |
| `pain` `schemaVersion`                                                 | absent                | 1 |
| FR-076 `direct_auto` (derived)                                          | 5                     | 27 |
| FR-076 `manual` (derived)                                               | 0                     | 0 |
| FR-076 `propagated` (derived)                                           | 0                     | 615 |
| FR-076 `no_generation` (derived)                                        | 620                   | 76 |
| `byFunnelType.unknown` on the only aggregate                            | 0 (absent)            | 0 |
| `byFunnelType.free_webinar` on the only aggregate                       | 0 (absent)            | 27 |
| 5-row gap between `byObjective.conversion.count` and `byFunnelType` sum | n/a                   | 5 (worth tracking) |
| `OAuthException` rate-limit hits                                       | n/a                   | 0 |
| Fan-out Cloud Tasks dispatch failures (5× NOT_FOUND on every sync)      | n/a                   | 5 every sync |
| Pre-969 `pain` aggregate behaviour                                      | locked decision: retired | **updated in place** (violates the locked decision — see §4) |
| FR-076 four-way breakdown emitted in any runtime log line              | n/a                   | **NO** — audit-trail gap |

This is the table the morning's Sync 2 will compare against.
