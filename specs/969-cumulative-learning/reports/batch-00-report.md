# Batch 00 — read-only investigation for the two post-approval amendments

**Worktree**: `D:\proads-worktrees\969-cumulative-learning`
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-04
**Scope**: read-only. Three questions, answered with `file:line` evidence and
raw command output.

**Findings document**: `docs/investigations/969-amendment-investigation.md`
(full evidence, all raw output, all line references).

---

## 1. What was done

- Read in full: `specs/969-cumulative-learning/spec.md`,
  `specs/969-cumulative-learning/checklists/requirements.md`,
  `docs/investigations/learning-cumulative-investigation.md`,
  `functions/src/learningAggregates.ts`, the `AdDoc` interface and Layer 4b
  block of `functions/src/metaSync/shared.ts`.
- Read additionally, because the questions required it:
  `functions/src/metaGraph.ts`, `functions/src/linkUnmatchedAd.ts`, and the
  user-level sync block at `functions/src/index.ts:3780-3945`.
- Ran three Firestore queries against production project `proadsai-saas`.

**No file under `functions/src/` or `src/` was modified. No `package.json`
touched.** `firebase-admin` was installed into the session scratchpad
(`.../scratchpad/fbq/`), not into the repository — `functions/node_modules` is
empty in both the worktree and the main checkout and remains so.

Files added by this batch:

| File | Purpose |
|---|---|
| `docs/investigations/969-amendment-investigation.md` | Findings, raw output |
| `specs/969-cumulative-learning/reports/batch-00-report.md` | This report |

---

## 2. Answers

### Q1 — Is a lifetime conversion count available? **No.**

Every conversion count in the system is a rolling window:

| Field | Where | Window |
|---|---|---|
| `AdDoc.conversions3d` | `functions/src/metaSync/shared.ts:151` | 3-day rolling |
| `AdDoc.cpa3d` | `shared.ts:148` | 3-day rolling (`spend3d / conversions3d`, `:260`) |
| `AdForLearning.conversions3d` | `functions/src/learningAggregates.ts:110` | 3-day rolling |
| `AccountBaselines.cpaCpl30d` | `functions/src/metaGraph.ts:120` | 30-day, account-level aggregate — no per-ad count |
| root `adPerformance.purchases` / `.leads` | `functions/src/index.ts:3862-3863` | rolling last-30-days (`:3815-3816`) |

The count itself is assembled from the Graph `actions` array by
`countConversionActions` (`shared.ts:310-325`) over `RESULT_ACTION_TYPES`
(`metaGraph.ts:499-506`).

**The Graph response has no lifetime conversion field, and cannot be given one
by adding a field.** `INSIGHTS_FIELDS` (`metaGraph.ts:52-68`) is the single
field list for every per-ad call; conversion counts arrive inside `actions`
(`metaGraph.ts:105`), which reports only what falls inside the **window the
request asked for**. The window is a query parameter (`time_range` /
`date_preset`), not a field — so lifetime-ness cannot be obtained by extending
an existing call's field list.

The three windows the sync already requests per ad:

- `fetchAdInsights3d` — `time_range={since: today−2, until: today}` (`metaGraph.ts:353-366`)
- `fetchAdInsightsToday` — `date_preset: "today"` (`:372-378`)
- `fetchAdInsights7dDaily` — `date_preset: "last_7d"`, `time_increment: 1` (`:389-396`)

combined by `fetchAdInsights` (`:407-414`). Account baselines use `last_90d` /
`last_14d` / `last_30d` (`:428-431`) and are summed into single account numbers
(`:475-497`), so they carry no per-ad or per-creative count. **No `date_preset:
"maximum"`, no `"lifetime"`, no since-inception `time_range` appears anywhere in
the codebase.**

**Stored history cannot be summed either.** `adPerformanceHistory` is the only
historical conversion store. Raw output:

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

Every window is 30 days wide and consecutive snapshots are one day apart, so
summing double-counts roughly thirtyfold; and there is a coverage gap between
`2026-03-20` and `2026-06-11`. It also carries neither `imageHash` nor
`generationId`, so it could not be attributed to a creative even if the arithmetic
worked.

**What it would take**: a new fourth per-ad insights call with a lifetime window
parameter, alongside the three in `fetchAdInsights`. Cost and rate-limit impact
not assessed. **No design proposed, per instruction.**

---

### Q2 — Is there any field that expresses "stopped running"? **No positive signal exists in stored data.**

**`status` is already requested and already discarded.**
`HIERARCHY_AD_FIELDS` (`metaGraph.ts:83`) is:

```
id,name,status,adset_id,creative{id,image_url,thumbnail_url,object_type,video_id}
```

`MetaAd.status?: string` exists (`metaGraph.ts:145`); campaign and ad-set field
strings request `status` too (`:71-72`). But `ad.status` is **never read** in
`functions/src/metaSync/shared.ts`, and `AdDoc` (`shared.ts:125-166`) has **no
status member** — the value Meta already returns never reaches Firestore.

**`effective_status`, `configured_status`, `stop_time`, `end_time` appear
nowhere.** Search across `functions/src/`, `src/`, `specs/`, `docs/` for those
plus `ARCHIVED` / `PAUSED` returns exactly one hit, unrelated:

```
specs/965-team-workspace-access/reports/ARCHIVE-batch-3-report.md:3:> ⚠️ **ARCHIVED — do not follow the commands in this file.**
```

**Paused cannot be distinguished from archived, deleted, or ended-by-schedule**
on anything the repository holds:

- ad-level pause vs. parent-ad-set/campaign pause is what `effective_status`
  separates, and it is not requested;
- ended-by-schedule has no ad-level status value — it would require the parent
  ad set's end timestamp, and `HIERARCHY_ADSET_FIELDS` (`metaGraph.ts:72`)
  requests only `id,name,status,daily_budget,targeting,campaign_id`;
- archived and deleted objects are excluded from the ads edge by default, and
  `fetchAds` (`metaGraph.ts:311-317`) applies no status filter — so the sync
  never sees them.

**The constraint holds.** The likely production shape of "the owner archived
this creative" is *absence from the sync*, which `spec.md:139` has already ruled
out as a signal. Zero spend is ruled out by the same reasoning: `spendToday` and
`spend3d` (`shared.ts:141,146`) are zero both for a paused ad and for an ad that
simply got no delivery.

**The nearest reachable signal** is `ad.status` — already in flight, merely
discarded. Making it usable is a write-site change (persist it on `AdDoc`) plus
a decision on whether coarse configured `status` suffices or `effective_status`
must be added to the fields string. **No design proposed, per instruction.**

---

### Q3 — Can one creative split into two groups? **Yes, via manual linking.**

**Matching runs per ad row, not per image.** `shared.ts:703`:

```
await Promise.allSettled(ads.map(async (ad) => {
```

with hash computed per row (`:737`), matched per row (`:739`), stored keyed by
**ad id** (`:751`), and written per row (`:957`). No dedupe by image URL,
creative id, or hash — the same image is downloaded and hashed once per row.
`matchAdCreative` (`:362-409`) is pure in `(hash, index, maxDistance)`, so two
rows with the same hash always get the same outcome **within a sync**.

**Production grouping — raw output** (full three-section output, including both
per-account sections and both histograms, is in the findings document):

```
ALL WORKSPACE-SCOPED ROWS COMBINED
rows: 1008
distinct imageHash groups: 146
largest group size: 55 | fan-out ratio rows/groups: 6.90
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 1
groups with NO rows linked: 145
groups whose linked rows point at MORE THAN ONE generationId: 0
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

ACCOUNT: .../adAccounts/act_995888422231015/adPerformance
rows: 383
distinct imageHash groups: 52
largest group size: 55 | fan-out ratio rows/groups: 7.37
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 0
groups with NO rows linked: 52
groups whose linked rows point at MORE THAN ONE generationId: 0

ACCOUNT: .../adAccounts/act_1180773537404268/adPerformance
rows: 625
distinct imageHash groups: 94
largest group size: 49 | fan-out ratio rows/groups: 6.65
groups with SOME rows linked and SOME unlinked (MIXED): 0
groups with ALL rows linked: 1
groups with NO rows linked: 93
groups whose linked rows point at MORE THAN ONE generationId: 0
```

**Mixed groups: 0. Groups whose linked rows point at more than one
`generationId`: 0.**

**But zero mixed groups is not evidence of safety.** Only **5 of 1008 rows
(0.5%)** carry a `generationId` at all, and all 5 sit in one `imageHash` group
whose size is exactly 5 — fully linked, single generation. Every other group,
including all ten largest, is 100% unlinked. Zero mixed groups is what you get
when almost nothing is linked.

**The mechanism that produces a split:**

Manual linking targets exactly one ad document —
`linkUnmatchedAd.ts:121-125` (`.collection("adPerformance").doc(req.adId)`),
setting `matchType: "manual"` at `:134-142`. The sync then locks it permanently
at `shared.ts:798-811`. Manually linking **one** row of the 55-row
`cccccc9c98bcbca4` group yields 1 linked + 54 unlinked, forever. Under the
proposed `generationId`-then-`imageHash` key, that one creative becomes **two
groups**: a 1-member group under the generation, and a 54-member group under the
hash carrying nearly all the evidence and reading as unlinked. Manual linking is
the documented remedy for exactly these rows, and 1003 of 1008 rows are
currently unmatched.

Two secondary shapes, both recorded in the findings document:

- **A linked row losing its hash.** `imageHash` is rewritten every sync
  (`shared.ts:957`, `imageHash: match?.imageHash ?? null`) under
  `{merge: true}` (`:1132`), so a download failure (`:736`, caught `:741`) nulls
  it while the locked `generationId` survives (`:806-810`). Same shape from
  `linkUnmatchedAd.ts:146-156`, which creates a pre-sync record with no
  `imageHash` field at all. This argues *for* the amendment's key ordering
  (`generationId` first), not against it.
- **Fingerprint-index growth self-heals** — `shared.ts:806` locks only
  `manual` / `auto_hash`; a `null`-matchType row is re-matched every sync. This
  should **not** be listed in the spec as a mixed-group risk.

---

## 3. Two findings needed for Batch 1

**(a) An unlinked row can contribute nothing — confirmed.**
`isEligibleForLearning` (`learningAggregates.ts:119-124`) requires a non-null
`generationId`; both aggregators call it first (`:197`, `:341`). And
`hookAngle`, `layoutTemplate`, `creativeModes`, `artDirection`, `universe` are
populated **only** from the matched generation document
(`shared.ts:1016-1050`); unmatched rows are never pushed into `learnedAds`
(guarded `shared.ts:975`). So Batch 1's spec text must state this limitation
explicitly rather than imply a contribution that cannot occur.

**(b) The contradiction to name in the spec.** `learningAggregates.ts:17`, module
header:

```
//   - Same generationId in 2 ad sets → separate records per context.
```

That is the rule Amendment 1 overturns.

---

## 4. Unexpected results

**1. A second ad account exists and was not covered by the brief's figures.**
The brief gives 383 rows → 52 creatives, largest 55, ≈7.4:1. That reproduces
**exactly** — for `act_995888422231015` alone. A second account,
`act_1180773537404268`, holds a further **625 rows → 94 groups**, largest 49,
**6.65:1**. Combined: **1008 rows → 146 creatives, 6.90:1**.

The qualitative conclusion is unchanged and arguably strengthened — the fan-out
holds on a second independent account. But **the dataset fan-out is 6.90:1, not
7.4:1**, and Batch 1's justification text for the constant recalibration should
use the figure it intends: 7.4:1 is one account, 6.9:1 is the data. Flagging
this because the brief instructs the spec to record "at the observed 7.4:1
fan-out, counting creatives makes each gate roughly seven times harder"; that
sentence is true at either figure, but the number should be sourced honestly.
**Owner decision needed — see §5.**

**2. `metaAdId` is absent, not null.** The brief says "0 of 34 deployment
records, 0 of 383 ad rows". Measured: **0 of 1008** workspace-scoped ad rows
carry the field *at all* (it is not written; `AdDoc` has no such member), and
**0 of 58** `creativeDeployments` carry a non-null value. `creativeDeployments`
has grown from 34 to 58; the populated count is still zero. Conclusion
unchanged.

**3. Two ad-performance stores, only one of which is the learning store.** Root
`adPerformance` holds 2457 docs written by the user-level sync
(`index.ts:3881`) with **no** `imageHash`, `generationId`, or `matchType`
(`index.ts:3869-3879`). The learning store is the workspace-scoped collection
(1008 docs). All Amendment 1 figures refer to the latter. This restates the
known two-pipeline split; it matters here only because it makes the raw
`collectionGroup` count (3465) misleading if read as "ad rows".

---

## 5. What I need from the owner before Batch 1

1. **Approve Batch 0 and authorise Batch 1.**

2. **Which fan-out figure goes in the spec?** The brief's 7.4:1 (account
   `act_995888422231015`, matching the 383/52/55 figures it also cites) or the
   dataset's 6.90:1 (both accounts, 1008/146)? My recommendation: cite **both**
   — "383 rows → 52 creatives (7.4:1) on the account the figures were taken
   from; 1008 rows → 146 creatives (6.9:1) across both accounts" — so the
   activation arithmetic ("10 creatives ≈ 74 ad rows") stays traceable to its
   source while the spec does not overstate the dataset.

3. **Confirm the two blocked conditions.** Q1 and Q2 both come back negative, so
   under the brief's own instruction both halves of Amendment 2's eligibility
   rule get marked blocked in the spec:
   - **(a) 5 combined conversions** — **blocked pending a lifetime conversion
     count**, which needs a new per-ad Graph call.
   - **(b) stopped running with ≥1 conversion** — **blocked pending a persisted
     ad status**. Worth noting this one is cheaper than it looks: `status` is
     already being fetched and thrown away, so unblocking it is a write-site
     change, not a new API call.

   With both conditions blocked, the *"a creative contributes efficiency exactly
   once"* rule is fully specified but has **no evaluable trigger**. I will write
   it that way — the rule stated, both triggers marked blocked with the reason —
   unless you want a different treatment.

4. **Confirm the fallback-splitting fix is in scope for the spec.** Q3 shows the
   `generationId`-then-`imageHash` fallback splits one creative into two groups
   as soon as manual linking is used, and 1003 of 1008 rows are candidates for
   manual linking. The brief tells me to state the fallback; it does not tell me
   to fix it. I can (i) state the fallback and record the splitting hazard as a
   known gap, or (ii) additionally specify a rule that closes it. Default if you
   say nothing: **(i)** — record the hazard, do not invent a rule the amendment
   did not ask for.

**Stopping here as instructed. No spec or checklist file has been touched.**
