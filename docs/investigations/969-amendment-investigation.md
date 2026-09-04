# Phase 969 — Amendment Investigation (Batch 0, read-only)

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-04
**Scope**: three questions raised by the two post-approval amendments to
`specs/969-cumulative-learning/spec.md`. Read-only. No file under
`functions/src/` or `src/` was modified.

**Amendment 1** — the unit of learning is the creative, not the Meta ad row.
**Amendment 2** — a creative contributes to efficiency learning exactly once,
when its numbers are final.

Every claim below carries a `file:line` reference or raw command output. Where a
question could not be answered from the repository, that is stated as such
rather than inferred.

---

## Method

Production reads were run against Firestore project `proadsai-saas` using
`firebase-admin` installed into the session scratchpad
(`.../scratchpad/fbq/`), not into the repository. `functions/node_modules`
is empty in both the worktree and the main checkout, so nothing in the repo was
installed, changed, or removed.

Invocation (per the recorded local recipe):

```
GOOGLE_CLOUD_PROJECT=proadsai-saas GOOGLE_CLOUD_QUOTA_PROJECT=proadsai-saas node <script>.cjs
```

---

## Data inventory (context for all three questions)

Raw output — `q1-inventory.cjs`:

```
collectionGroup(adPerformance) total docs: 3465
   ROOT adPerformance = 2457
   WORKSPACE-SCOPED = 1008
distinct workspace-scoped adPerformance collections: 2
   - users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/adPerformance
   - users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015/adPerformance
workspace-scoped census: {
  "total": 1008,
  "imageHash_nonnull": 1008,
  "generationId_nonnull": 5,
  "metaAdId_present": 0,
  "matchType": {
    "null": 1003,
    "auto_hash": 5
  }
}
root adPerformance census: {
  "total": 2457,
  "imageHash_present": 0,
  "generationId_present": 0,
  "metaAdId_present": 0
}
creativeDeployments total: 58 | with non-null metaAdId: 0
```

### What this establishes

1. **There are two separate ad-performance stores, and only one of them is the
   learning store.**
   - Root `adPerformance` (2457 docs) is written by the user-level sync at
     `functions/src/index.ts:3881`. Its document shape
     (`index.ts:3869-3879`) carries **no** `imageHash`, **no** `generationId`,
     and **no** `matchType`. It cannot feed creative-level grouping at all.
   - Workspace-scoped `.../adAccounts/{aid}/adPerformance` (1008 docs) is
     written by `runSyncForAccount` (`functions/src/metaSync/shared.ts:1132`)
     with the `AdDoc` shape (`shared.ts:125-166`). This is the collection the
     learning aggregates read and the collection Amendment 1 concerns.

   This is the two-pipeline split already recorded in project memory; it is
   restated here because the amendment's row counts refer to the second store
   only.

2. **`metaAdId` is absent from every ad row.** 0 of 1008 workspace-scoped ad
   documents carry the field at all — it is not merely null, it is not written.
   `AdDoc` (`shared.ts:125-166`) has no `metaAdId` member. Independently,
   `metaAdId` is assigned from `ad.ad_id` at `functions/src/index.ts:3931`, so
   it is the per-row Meta identity by construction and could not serve as a
   creative-grouping key even if it were populated.

3. **`metaAdId` is also unpopulated on deployment records.** 0 of 58
   `creativeDeployments` documents carry a non-null `metaAdId`. The prompt's
   figure was 0 of 34; the collection has grown to 58 and the count of
   populated values is still zero.

4. **The prompt's row counts are one account, not the whole dataset.** The
   383-row figure is account `act_995888422231015` alone (see Q3 below). A
   second account, `act_1180773537404268`, holds a further 625 rows and was not
   covered by the figures in the amendment brief. **Reported as unexpected.**

---

## Q1 — Is a lifetime conversion count available?

### Answer

**No.** Every conversion count in the system is a rolling window. No call the
sync already makes returns a lifetime or since-inception conversion total, and
no *field* can be added to an existing call to produce one, because the window
is set by a **query parameter** (`time_range` / `date_preset`), not by a field.
Obtaining a lifetime total requires an **additional call per ad** with a
different window parameter.

### Every conversion-count field, with its exact window

| Field | Where | Window | How derived |
|---|---|---|---|
| `AdDoc.conversions3d` | `functions/src/metaSync/shared.ts:151` | **3-day rolling** | `aggregateAdMetrics` → `countConversionActions(threeDayRows)`, `shared.ts:247` |
| `AdDoc.cpa3d` | `shared.ts:148` | **3-day rolling** | `spend3d / conversions3d`, `shared.ts:260` (null when `conversions3d === 0`) |
| `AdForLearning.conversions3d` | `functions/src/learningAggregates.ts:110` | **3-day rolling** | copied verbatim from `metrics.conversions3d` at `shared.ts:993` |
| `AccountBaselines.cpaCpl30d` | `functions/src/metaGraph.ts:120` | **30-day, account-level** | `fetchAccountLevelCpaCpl(..., "last_30d")`, `metaGraph.ts:428-431`. Account aggregate — carries no per-ad and no per-creative count. |
| root `adPerformance.purchases` / `.leads` | `functions/src/index.ts:3862-3863` | **rolling last-30-days** | `since = now − 30d`, `until = now`, `index.ts:3815-3816` |

The conversion count itself is assembled from the `actions` array by
`countConversionActions` (`shared.ts:310-325`), summing the action types in
`RESULT_ACTION_TYPES` (`metaGraph.ts:499-506`): `purchase`, `omni_purchase`,
`offsite_conversion.fb_pixel_purchase`, `lead`, `omni_complete_registration`,
`complete_registration`.

### What the Graph insights response actually returns

`INSIGHTS_FIELDS` (`metaGraph.ts:52-68`) is the single field list used by every
per-ad insights call:

```
impressions, reach, frequency, clicks, inline_link_clicks, ctr,
inline_link_click_ctr, spend, cpm, cpc, actions, action_values,
cost_per_action_type, date_start, date_stop
```

Conversion counts arrive inside `actions` (`metaGraph.ts:105`). `actions` is
**not** a lifetime field — it reports the actions attributed within the window
the request asked for. There is no separate lifetime-conversions field in this
list, and Meta exposes none: the totality of an insights row is scoped by the
request's window.

### The three windows the sync already requests, per ad

| Function | Window parameter | Location |
|---|---|---|
| `fetchAdInsights3d` | `time_range={since: today−2, until: today}` | `metaGraph.ts:353-366` |
| `fetchAdInsightsToday` | `date_preset: "today"` | `metaGraph.ts:372-378` |
| `fetchAdInsights7dDaily` | `date_preset: "last_7d"`, `time_increment: 1` | `metaGraph.ts:389-396` |

`fetchAdInsights` (`metaGraph.ts:407-414`) runs all three in parallel and is the
only per-ad insights entry point. The async escape hatch
`requestInsightsAsync` (`metaGraph.ts:532-541`) also uses `date_preset:
"last_7d"`.

Account-level baseline calls use `last_90d`, `last_14d`, `last_30d`
(`metaGraph.ts:428-431`) at `level: "ad"` with `time_increment: "all_days"` —
still a bounded preset, still account-scoped in how it is consumed
(`fetchAccountLevelCpaCpl` sums every row into one number,
`metaGraph.ts:475-497`), so it yields no per-ad and no per-creative lifetime
count.

**No call in the codebase uses `date_preset: "maximum"`, `"lifetime"`, or a
since-inception `time_range`.** Verified by search: the only `date_preset`
values present anywhere are `today`, `last_7d`, `last_14d`, `last_30d`,
`last_90d`.

### Could a lifetime total be reconstructed from stored history?

**No.** `adPerformanceHistory` (`index.ts:3886-3889`) is the only historical
store of conversion counts. Raw output — `q1-history.cjs`:

```
adPerformanceHistory total docs: 5813
fields present across docs: adAccountId, adId, adName, adsetName, campaignName, clicks, cpa, cpc, cpm, ctr, dateRange, impressions, leads, purchases, roas, snapshotDate, spend, syncedAt, userId, workspaceId
distinct dateRange values (window, docs):
    2026-02-18..2026-03-20 -> 15
    2026-06-11..2026-07-11 -> 304
    2026-06-12..2026-07-12 -> 304
    2026-06-14..2026-07-14 -> 306
    2026-06-21..2026-07-21 -> 317
    2026-06-24..2026-07-24 -> 304
    2026-06-25..2026-07-25 -> 305
    2026-07-06..2026-08-05 -> 853
    2026-07-12..2026-08-11 -> 600
    2026-07-30..2026-08-29 -> 348
    2026-07-31..2026-08-30 -> 588
    2026-08-03..2026-09-02 -> 529
    2026-08-04..2026-09-03 -> 523
    2026-08-05..2026-09-04 -> 517
```

Two disqualifying properties, both visible in that output:

1. **The windows overlap heavily.** Every window is 30 days wide and successive
   snapshots are one day apart (`2026-08-03..2026-09-02`,
   `2026-08-04..2026-09-03`, `2026-08-05..2026-09-04`). Summing them
   double-counts the same conversions roughly thirty times over. There is no
   disjoint partition of the timeline to sum.
2. **The windows have gaps.** Between `2026-03-20` and `2026-06-11` there is no
   coverage at all. A sum over what exists is not a lifetime total; it is a
   total over whichever days happened to be synced.

Additionally, `adPerformanceHistory` carries neither `imageHash` nor
`generationId` (field list above), so even a correct total could not be
attributed to a creative.

### What it would take

Not a new field on an existing call — a **new call**. Concretely, a fourth
per-ad insights request with a lifetime window parameter, added alongside the
three in `fetchAdInsights` (`metaGraph.ts:407-414`), returning the same
`actions` array over the whole life of the ad. That is a per-ad Graph request
multiplied across the account on every sync, and its cost and rate-limit
consequences have not been assessed here.

> **Consequence for Amendment 2, condition (a).** "5 combined conversions across
> all placements" cannot be evaluated stably against any figure the system holds
> today. `conversions3d` rises and falls as the three-day window slides, so a
> creative that crosses 5 on Monday can be back under 5 on Thursday with no
> change to its actual history — which is precisely the instability the
> amendment exists to remove.

---

## Q2 — Is there any field that expresses "stopped running"?

### Answer

**No positive stopped signal exists in stored data.** `status` *is* requested
from the Graph API and *is* typed, but it is never read and never persisted, so
today there is nothing on the ad record to evaluate. `effective_status`,
`configured_status`, and any stop or end timestamp are requested nowhere in the
codebase.

### What is requested

`HIERARCHY_AD_FIELDS` (`functions/src/metaGraph.ts:83`):

```
id,name,status,adset_id,creative{id,image_url,thumbnail_url,object_type,video_id}
```

`status` **is** in the ad fields string, and `MetaAd.status?: string` exists on
the type (`metaGraph.ts:145`). Campaign and ad-set field strings request it too
(`metaGraph.ts:71-72`; `MetaCampaign.status` `:127`, `MetaAdSet.status` `:136`).

### What is done with it

**Nothing.** `ad.status` is never read in `functions/src/metaSync/shared.ts`,
and `AdDoc` (`shared.ts:125-166`) has no status member — so the value Meta
already returns is discarded at the ad loop and never reaches Firestore. This is
the one genuinely encouraging finding in this question: the transport already
carries the value, and persisting it is a write-site change, not a new Graph
call.

### What is not requested anywhere

Search across `functions/src/`, `src/`, `specs/`, `docs/` for
`effective_status`, `configured_status`, `stop_time`, `end_time`, `ARCHIVED`,
`PAUSED` returns exactly one hit, and it is unrelated:

```
specs/965-team-workspace-access/reports/ARCHIVE-batch-3-report.md:3:> ⚠️ **ARCHIVED — do not follow the commands in this file.**
```

So: no `effective_status`, no `configured_status`, no stop timestamp, no ad-set
`end_time`, anywhere in the project.

### Can a paused ad be distinguished from archived / deleted / ended-by-schedule?

**Not from anything the repository holds.** With only the configured `status`
field — which is the field already being requested — the following cannot be
separated from each other on the evidence available in-repo:

- an ad the owner paused, versus an ad paused because its **parent ad set or
  campaign** was paused (that distinction is what `effective_status` exists for,
  and it is not requested);
- an ad that **ended by schedule**, which has no dedicated status value at the
  ad level at all — it would have to be inferred by comparing the parent ad
  set's end timestamp against now, and no end timestamp is requested
  (`HIERARCHY_ADSET_FIELDS`, `metaGraph.ts:72`, requests only
  `id,name,status,daily_budget,targeting,campaign_id`);
- archived versus deleted, which the sync never sees, because the ads edge is
  called with no status filter (`fetchAds`, `metaGraph.ts:311-317`) and archived
  and deleted objects are excluded from edge listings by default.

That last point deserves emphasis, because it collides with a rule the spec
already states.

### The constraint the spec already imposes

The spec's edge-case list (`spec.md:139`) reads:

> **Meta stops returning an ad.** Its existing contribution stands. Absence is
> not evidence of failure and must never reduce a count.

The likely production shape of "an owner archived a creative" is exactly
*absence from the sync* — because archived objects drop out of the ads edge —
and the spec has already ruled absence out as a signal. Zero spend is ruled out
by the same reasoning: `spendToday` and `spend3d` (`shared.ts:141,146`) go to
zero for a paused ad and for an ad that merely got no delivery today, and
nothing distinguishes them.

**No positive stopped signal exists today.** The nearest reachable one is
`ad.status`, which is already in flight and merely discarded; making it usable
requires (i) persisting it on `AdDoc`, and (ii) deciding whether the coarse
configured `status` is sufficient or whether `effective_status` must be added to
`HIERARCHY_AD_FIELDS`. Neither is proposed here.

> **Consequence for Amendment 2, condition (b).** "Stopped running with at least
> one conversion" has no field to evaluate against in the current data. It is
> not blocked by an API limitation — the value is being fetched and thrown away
> — but it is blocked by the current write site.

---

## Q3 — Can one creative split into two groups?

### Answer

**Yes, and the mechanism is manual linking.** In today's production data the
split has **not** occurred — **zero** mixed groups — but that is because linking
has barely happened at all (5 of 1008 rows), not because the fallback is safe.

### Does matching run per ad row or per image?

**Per ad row.** `functions/src/metaSync/shared.ts:703`:

```
await Promise.allSettled(ads.map(async (ad) => {
```

Inside that per-row closure:

- `shared.ts:736` — `const buf = await downloadCreativeImage(imageUrl);`
- `shared.ts:737` — `const hash = await computeHash(buf);`
- `shared.ts:738` — `result.imageHash = hash;`
- `shared.ts:739` — `const match = await matchAdCreative(hash, fingerprintIndex, 10);`
- `shared.ts:751` — `adMatchResults.set(ad.id, result);` — keyed by **ad id**

There is no dedupe by image URL, by creative id, or by hash. The same image is
downloaded and hashed once per ad row, and matched once per ad row. The result
is stored per row at `shared.ts:957` (`imageHash: match?.imageHash ?? null`).

`matchAdCreative` (`shared.ts:362-409`) is a pure function of
`(hash, fingerprintIndex, maxDistance)`, so **two rows with the same hash in the
same sync always get the same match outcome**. Hash-derived divergence within a
single sync is therefore not possible. Divergence comes from the three paths
below.

### Production grouping — raw output (`q3-grouping.cjs`)

```
=================================================
ALL WORKSPACE-SCOPED ROWS COMBINED
rows: 1008
distinct imageHash groups: 146
largest group size: 55 | fan-out ratio rows/groups: 6.90
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 1
groups with NO rows linked: 145
groups whose linked rows point at MORE THAN ONE generationId: 0
--- per-group detail (groups with >=1 linked row, plus top 10 largest) ---
imageHash                        rows  linked  unlinked  distinctGenIds  matchTypes
cccccc9c98bcbca4                   55       0        55               0   null
1f1b333333a6949c                   49       0        49               0   null
12722a2e2e2f2733                   41       0        41               0   null
f96b7333326b6979                   40       0        40               0   null
373677d78b333531                   38       0        38               0   null
4e2c373736969ccc                   37       0        37               0   null
ae4c1135979392d3                   34       0        34               0   null
f2da4ce49696d6ec                   33       0        33               0   null
b31a0e1b4bae2c9c                   28       0        28               0   null
71b1f5cdcccddc58                   26       0        26               0   null
f5e9a98dadad8d9d                    5       5         0               1   auto_hash
--- group-size histogram (size: count of groups) ---
  size 55 : 1 groups
  size 49 : 1 groups
  size 41 : 1 groups
  size 40 : 1 groups
  size 38 : 1 groups
  size 37 : 1 groups
  size 34 : 1 groups
  size 33 : 1 groups
  size 28 : 1 groups
  size 26 : 2 groups
  size 25 : 3 groups
  size 19 : 1 groups
  size 18 : 1 groups
  size 16 : 2 groups
  size 15 : 2 groups
  size 13 : 2 groups
  size 12 : 3 groups
  size 11 : 2 groups
  size 10 : 1 groups
  size 9 : 2 groups
  size 8 : 4 groups
  size 7 : 2 groups
  size 6 : 6 groups
  size 5 : 8 groups
  size 4 : 12 groups
  size 3 : 16 groups
  size 2 : 29 groups
  size 1 : 39 groups

=================================================
ACCOUNT: users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/adPerformance
rows: 625
distinct imageHash groups: 94
largest group size: 49 | fan-out ratio rows/groups: 6.65
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 1
groups with NO rows linked: 93
groups whose linked rows point at MORE THAN ONE generationId: 0
--- per-group detail (groups with >=1 linked row, plus top 10 largest) ---
imageHash                        rows  linked  unlinked  distinctGenIds  matchTypes
1f1b333333a6949c                   49       0        49               0   null
12722a2e2e2f2733                   41       0        41               0   null
373677d78b333531                   38       0        38               0   null
4e2c373736969ccc                   37       0        37               0   null
ae4c1135979392d3                   34       0        34               0   null
f2da4ce49696d6ec                   33       0        33               0   null
b31a0e1b4bae2c9c                   28       0        28               0   null
71554c4d8d2d514d                   25       0        25               0   null
4121242465313902                   25       0        25               0   null
6b6b6d6c9796969d                   19       0        19               0   null
f5e9a98dadad8d9d                    5       5         0               1   auto_hash
--- group-size histogram (size: count of groups) ---
  size 49 : 1 groups
  size 41 : 1 groups
  size 38 : 1 groups
  size 37 : 1 groups
  size 34 : 1 groups
  size 33 : 1 groups
  size 28 : 1 groups
  size 25 : 2 groups
  size 19 : 1 groups
  size 16 : 1 groups
  size 15 : 1 groups
  size 12 : 2 groups
  size 11 : 2 groups
  size 9 : 2 groups
  size 8 : 2 groups
  size 7 : 1 groups
  size 6 : 5 groups
  size 5 : 5 groups
  size 4 : 7 groups
  size 3 : 10 groups
  size 2 : 19 groups
  size 1 : 27 groups

=================================================
ACCOUNT: users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015/adPerformance
rows: 383
distinct imageHash groups: 52
largest group size: 55 | fan-out ratio rows/groups: 7.37
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 0
groups with NO rows linked: 52
groups whose linked rows point at MORE THAN ONE generationId: 0
--- per-group detail (groups with >=1 linked row, plus top 10 largest) ---
imageHash                        rows  linked  unlinked  distinctGenIds  matchTypes
cccccc9c98bcbca4                   55       0        55               0   null
f96b7333326b6979                   40       0        40               0   null
71b1f5cdcccddc58                   26       0        26               0   null
2773999b39bbdbd6                   26       0        26               0   null
7b31797b0b4f0f17                   25       0        25               0   null
191b23292c243421                   18       0        18               0   null
50b2604264526220                   16       0        16               0   null
e7a3a16161616563                   15       0        15               0   null
9e98301c2cb890d4                   13       0        13               0   null
fdcdcf989a9a8e1d                   13       0        13               0   null
--- group-size histogram (size: count of groups) ---
  size 55 : 1 groups
  size 40 : 1 groups
  size 26 : 2 groups
  size 25 : 1 groups
  size 18 : 1 groups
  size 16 : 1 groups
  size 15 : 1 groups
  size 13 : 2 groups
  size 12 : 1 groups
  size 10 : 1 groups
  size 8 : 2 groups
  size 7 : 1 groups
  size 6 : 1 groups
  size 5 : 3 groups
  size 4 : 5 groups
  size 3 : 6 groups
  size 2 : 10 groups
  size 1 : 12 groups
```

### Reading of the output

**The amendment brief's figures reproduce exactly, for one account.**
`act_995888422231015`: **383 rows → 52 distinct `imageHash` groups, largest
group 55 rows**, fan-out 7.37:1. That is the 383 / 52 / 55 / 7.4:1 in the brief,
verbatim.

**Unexpected result — a second account exists and was not in the brief.**
`act_1180773537404268` holds a further **625 rows → 94 groups**, largest group
49, fan-out 6.65:1. Combined across both accounts: **1008 rows → 146 groups**,
fan-out **6.90:1**. The brief's 7.4:1 is the higher of the two accounts, not the
dataset figure. The dataset figure is 6.90:1. Reported as unexpected; the
qualitative conclusion is unchanged and if anything strengthened — the fan-out
holds on a second, independent account.

**Mixed groups: zero.** No `imageHash` group has some rows linked and some
unlinked. No group's linked rows point at more than one `generationId`.

**But that number is not reassuring, because linking has barely happened.**
Only **5 of 1008 rows (0.5%)** carry a `generationId` at all. Those 5 rows are a
single `imageHash` group (`f5e9a98dadad8d9d`) whose size is exactly 5, all
`auto_hash`, all pointing at one generation. Every other group — including all
ten of the largest — is 100% unlinked. **Zero mixed groups is what you get when
almost nothing is linked; it is not evidence that mixing cannot occur.**

The one linked group is also the only case in the data where the two candidate
grouping keys agree, and it agrees trivially: the group is fully linked, so
`generationId`-first and `imageHash`-fallback produce the same single group.

### Three mechanisms that produce a mixed group

**1. Manual linking — the real one. Per-row, locked, does not self-heal.**

`linkUnmatchedAdImpl` writes to exactly one document:

- `functions/src/linkUnmatchedAd.ts:121-125` — the ref is
  `.collection("adPerformance").doc(req.adId)`, a **single ad id**.
- `linkUnmatchedAd.ts:134-142` — sets `matchType: "manual"` on that one row.

The sync then locks it forever:

- `shared.ts:798-811` — `if (existingMatchType === "manual" || existingMatchType === "auto_hash")` keeps the prior link and never re-derives it.

So an owner manually linking **one** row of the 55-row `cccccc9c98bcbca4` group
produces a group of 55 in which 1 row has a `generationId` and 54 do not, and no
subsequent sync repairs it. Under the amendment's proposed key —
`generationId` where present, falling back to `imageHash` — that single creative
becomes **two** groups: a one-member group under the generation, and a 54-member
group under the hash. The 54-member group is the one carrying almost all the
evidence, and it is the one that would be treated as unlinked.

This is not hypothetical: manual linking is the documented remedy the dashboard
offers for exactly these unmatched rows, and 1003 of 1008 rows are currently
unmatched.

**2. A linked row losing its hash.**

`imageHash` is re-derived every sync and written unconditionally at
`shared.ts:957` (`imageHash: match?.imageHash ?? null`), under
`batch.set(..., { merge: true })` (`shared.ts:1132`) — an explicit `null`
overwrites, merge does not skip it. If the creative image download fails for a
row (`shared.ts:736`, caught at `shared.ts:741`), `result.imageHash` stays
`null` while the **locked** `generationId` survives via `shared.ts:806-810`.
The row becomes linked-with-no-hash.

The same shape arises from `linkUnmatchedAd.ts:146-156`: when an ad is manually
linked *before* it has ever been synced, the created document carries
`generationId` and `matchType` but **no `imageHash` field at all**.

Under a `generationId`-first key these rows stay with their creative, which is
the right outcome. Under a hash-only key they would be homeless. This argues for
the amendment's stated key ordering rather than against it, and is recorded so
the spec can say why the ordering is that way round.

**3. Fingerprint-index growth — self-healing, and should be stated as such.**

`loadWorkspaceFingerprints` (`shared.ts:334-352`) reads the workspace's
fingerprint index fresh each sync. A row synced before its generation was
fingerprinted matches nothing; a row synced after matches. But `shared.ts:806`
only locks when `existingMatchType` is `"manual"` or `"auto_hash"` — a row whose
`matchType` is `null` is **re-matched on every sync**. So this divergence
resolves itself on the next sync and does not persist. It should not be listed
in the spec as a mixed-group risk.

### Ancillary finding for Batch 1 — an unlinked row can contribute nothing

The Batch-1 brief asks whether an unlinked row can feed an angle record or a
visual-pattern record. **It cannot.** Confirmed at two points:

- `isEligibleForLearning` (`learningAggregates.ts:119-124`) returns `false`
  unless `matchType` is `auto_hash` or `manual`, `metadataAvailable` is true,
  **and** `generationId` is non-null. Both aggregators call it first
  (`learningAggregates.ts:197`, `:341`).
- Every field the two records are keyed on — `hookAngle`, `layoutTemplate`,
  `creativeModes`, `artDirection`, `universe` — is populated **only** from the
  matched generation document, at `shared.ts:1016-1050`. Unmatched rows are
  never even pushed into `learnedAds` (guarded at `shared.ts:975`).

So a group with no `generationId` has no angle and no pattern to contribute to.
It can be counted, and it can be logged, but it cannot become evidence. The spec
should say this rather than leave the sentence implying a contribution that
cannot occur.

### Ancillary finding for Batch 1 — the contradiction to name

`functions/src/learningAggregates.ts:17`, in the module header:

```
//   - Same generationId in 2 ad sets → separate records per context.
```

This is the current rule, stated as intent, and it is precisely what Amendment 1
overturns. It should be named in the spec so a future reader does not treat the
header as still binding.

---

## Summary

| Question | Answer | Consequence |
|---|---|---|
| Q1 — lifetime conversion count available? | **No.** Every count is a rolling window (3-day for learning, 30-day for the user-level store). Lifetime-ness is a request parameter, not a field, so no field can be added to an existing call — it needs a new per-ad call. Stored history overlaps and has gaps, so it cannot be summed. | Amendment 2 condition (a) is **not implementable against current data**. |
| Q2 — positive "stopped running" signal? | **No.** `status` is already requested (`metaGraph.ts:83`) and typed (`:145`) but never read and never persisted; `AdDoc` has no status member. `effective_status`, `configured_status`, and stop/end timestamps appear nowhere in the codebase. Absence-from-sync and zero spend are ruled out by `spec.md:139`. | Amendment 2 condition (b) is **not implementable against current data** — blocked at the write site, not by the API. |
| Q3 — can one creative split into two groups? | **Yes, via manual linking.** Matching is per ad row (`shared.ts:703`), manual links target one row (`linkUnmatchedAd.ts:121-125`) and are locked forever (`shared.ts:806-810`). Production shows **0 mixed groups**, but only because 5 of 1008 rows are linked at all. | The `generationId`-then-`imageHash` fallback **does** produce two groups for one creative once manual linking is used at scale. The spec must address it. |

**Fan-out, restated from the data:** 1008 rows → 146 creatives (6.90:1) across
both accounts; 383 rows → 52 creatives (7.37:1) for `act_995888422231015`
alone, largest creative 55 rows.
