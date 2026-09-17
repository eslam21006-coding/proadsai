# 969 — Pre-sync production baseline (act_995888422231015)

**Captured:** 2026-09-17T20:01:50Z (immediately after PR #71 deploy)
**Project:** `proadsai-saas`
**Account:** `act_995888422231015`
**Capture script:** `C:\temp\opencode\capture-969-baseline-v2.cjs` (read-only; outside the repo)
**Raw output:** `C:\temp\opencode\baseline-v2-output.json` (full probe dump)
**Pre-deploy commit:** `efcdb04 feat(969): cumulative learning — accumulate across syncs and funnels`

This baseline is the "before" the operator compares against after the first nightly sync at 03:00
runs the new code path. **Without this file, the morning's numbers cannot be interpreted** —
every count change between "now" and "tomorrow morning" has to be evaluated against what was
already true. The capture script was written once for this exercise and lives outside the repo;
it is not deployed, not committed, and never reads anything but the public Firestore shape.

---

## §1. Schema discovery

The first capture attempt failed because the production schema is not what the runbook assumed.

| Assumption                | Reality                                                                |
|---------------------------|------------------------------------------------------------------------|
| `users/{uid}/workspaces/{wid}/adAccounts/{act}/hookPerformance` | Path does not exist for this account. `hookPerformance` IS a collection-group, but with only 1 doc in the entire project — and that doc is for `act_1180773537404268`, not `act_995888422231015`. |
| `users/{uid}/workspaces/{wid}/adAccounts/{act}/adPerformance` | Path does not exist. `adPerformance` is a TOP-LEVEL collection.       |
| `accountId` field on the ad row | Field is `adAccountId` (camelCase). The simple `where("accountId","==",...)` query returns 0 rows because (a) wrong field name and (b) no composite index for `adAccountId` equality either. |

The top-level `adPerformance` collection has document IDs of the form `{userId}_{adId}` (e.g.
`84jrvrdcLUSe2tNBYBfqqnmq2Az1_120246483123980160`). The `metaConnections` collection (also
top-level) is keyed by `userId`; the account ID is nested inside the doc body. The capture
script reads `metaConnections` to find the users linked to this account, then queries
`adPerformance` filtered by `adAccountId == "act_995888422231015"` (client-side filter — the
field has no Firestore index).

Three users are linked to `act_995888422231015`:

```
84jrvrdcLUSe2tNBYBfqqnmq2Az1
UCPfe8ouNUTgODhLvUeO9HCDqYE2
ywpCgWsXqVP4tlNwfhSoTqMjRw52
```

---

## §2. Baseline numbers (act_995888422231015)

| Metric                                                     | Value     | Note |
|------------------------------------------------------------|-----------|-------|
| `adPerformance` docs with `adAccountId == act_995888422231015` | **452**   | User quoted 383; current count is +69 above that. Likely grew via a sync that ran between the user drafting the runbook and now. |
| Of those, `adDocsWithLedger` (i.e. docs carrying the new `ledger` field) | **0**     | Expected. The field is new in Phase 969; no production record carries it. |
| `hookPerformance` docs for this account                   | **0**     | Expected. No aggregates have ever been written for this account. |
| `visualPerformance` docs for this account                  | **0**     | Expected. Same as above. |
| `hookPerformance` docs anywhere in the project            | **1**     | Not for this account — the only project-wide hook aggregate is `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/hookPerformance/pain`. |
| `visualPerformance` docs anywhere in the project           | **0**     | — |
| Any doc carrying `contributedCreativeKeys`                 | **0**     | Expected. Field is new in Phase 969. |
| Any doc carrying `creativeCount`                           | **0**     | Expected. Field is new in Phase 969. |
| Any doc carrying `byFunnelType`                            | **0**     | Expected. Field is new in Phase 969 (FR-027 / T047). |
| Any doc carrying `ledger` on the ad row                    | **0**     | Expected. Field is new in Phase 969 (T025). |

For completeness, the project has 13 distinct adAccountIds in `adPerformance`:

```
act_1180773537404268       904
act_1163959057640939       488
act_995888422231015        452  ← this account
act_1366487675484883       317
act_437983975409008        302
act_781389063661831        207
act_1454723818838899       115
act_1994509808075593       109
act_1238105357423284        46
act_1355484388441267         7
act_108958812522823          2
act_1080792863676655         1
act_493408227392229          1
                            ---
total                     2951
```

The 452 figure for this account is a 1-doc-overlap with a workspace path the worker may write to
under the new code (`users/{uid}/workspaces/{wid}/adAccounts/{act_995888422231015}/adPerformance/`).
Those writes do NOT happen at deploy time — only when a sync runs. Until the next nightly sync,
the top-level `adPerformance` count of 452 is the relevant baseline.

---

## §3. Why this baseline is the right one

The runbook asked for the `act_995888422231015` account because the new code path (Phase 969)
has work to do there:

- The per-account `hookPerformance` and `visualPerformance` collections should be created on
  first sync (currently 0 each).
- The `ledger` field on the per-ad rows should be populated (currently 0).
- The new `creativeCount`, `contributedCreativeKeys`, and `byFunnelType` fields should appear on
  the per-angle / per-pattern aggregate docs (currently 0 across the project).

The morning checks (§4 of the runbook) compare tomorrow's `byObjective.conversion.count` and
`creativeCount` against this baseline. Both are **0 right now** because no aggregate exists yet
for this account. Tomorrow morning, after the first sync:

- `byObjective.conversion.count` should be > 0 (the new code writes it during aggregate compute).
- `creativeCount` should be > 0 (FR-073 / T021).
- `contributedCreativeKeys` should be present and non-empty on every aggregate (FR-036 / Batch 28).

A `0 → 0` morning reading is the failure mode — it means the new code did not run for this
account, or its writes failed silently.

---

## §4. The morning comparison surface

For the four morning checks (§5 of the deploy runbook), the operator compares against this
baseline:

| Check                                         | Baseline value | Expected morning value |
|-----------------------------------------------|----------------|------------------------|
| 1. `byObjective.conversion.count` accumulates | not present (0 docs) | > 0; non-decreasing across syncs |
| 1. `creativeCount` accumulates                | not present (0 docs) | > 0 |
| 2. `creativeCount` counts creatives not observations | not present | After the second sync, `creativeCount` should be the count of distinct creatives per angle, NOT a count that doubles across syncs |
| 3. Per-sync unlinked-contribution breakdown (direct / manual / propagated / no-generation) | n/a — first sync has not run | The summary log line should report numbers. Baseline expected values from the investigation: 5 direct, 0 manual, 0 propagated, 1003 unlinked. Compare against current summary. |
| 4. OAuthException code 4 subcode 1504022 in Cloud Logging | absent | absent; if it recurs, `GRAPH_CONCURRENCY` retune per the runbook |

For the multi-funnel check (§6 of the runbook):

| Check                                         | Baseline value | Expected post-sync |
|-----------------------------------------------|----------------|---------------------|
| `byFunnelType` on aggregates — non-zero in more than one real bucket | not present (0 docs) | At least one real bucket populated if `workspaceFunnelType` is set on the workspace's funnel settings doc; otherwise everything in `unknown` (FR-032). |

The investigation's T064b inverse case test (`every contribution lands in unknown` = failure) is
the check to apply here: if the workspace funnel type is set but every contribution lands in
`unknown`, the workspace funnel type is not reaching the aggregate — same defect surface.

---

## §5. Raw probe output (snapshot of `baseline-v2-output.json`)

```json
{
  "capturedAt": "2026-09-17T20:01:38.961Z",
  "projectId": "proadsai-saas",
  "accountId": "act_995888422231015",
  "topLevelAdPerformance": {
    "count": 452,
    "adDocsWithLedger": 0
  },
  "metaConnectionsHits": [
    { "uid": "84jrvrdcLUSe2tNBYBfqqnmq2Az1" },
    { "uid": "UCPfe8ouNUTgODhLvUeO9HCDqYE2" },
    { "uid": "ywpCgWsXqVP4tlNwfhSoTqMjRw52" }
  ],
  "userAccountSubtree": [],
  "collectionGroup": {
    "hookPerformance":  { "count": 1, "error": null },
    "visualPerformance": { "count": 0, "error": null }
  }
}
```

(The `userAccountSubtree` is empty because the nested path
`users/{uid}/adAccounts/{act_995888422231015}` does not exist for any of the three users in this
project. The new Phase 969 code writes to `users/{uid}/workspaces/{wid}/adAccounts/{act}/...`,
which also does not yet exist for this account. The capture script's nested-path check returns
empty for both, correctly.)

The 1 hookPerformance doc in the project belongs to `act_1180773537404268`:

```json
{
  "path": "users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/hookPerformance/pain",
  "accountIdField": undefined,
  "accountIdFromPath": "no",
  "angleKey": "pain",
  "contributedCreativeKeysLength": null,
  "byObjectiveConversionCount": 5,
  "sampleSize": 5,
  "byFunnelType": null
}
```

It carries `byObjectiveConversionCount: 5` but no `creativeCount`, no `contributedCreativeKeys`,
and no `byFunnelType` — the schema is pre-Phase-969. The morning checks will not directly observe
this doc (it is not for our account), but it confirms that the schema migration is genuinely
"everything is pre-969 until the sync runs" — there is no partial Phase-969 data lurking that
would muddy the morning comparison.

---

## §6. What this baseline does NOT cover

- **The user's quoted 383 vs measured 452.** The discrepancy is +69 rows. Most likely cause: a
  sync ran between when the user drafted the runbook and when this capture ran, adding rows to
  the `adPerformance` collection for this account. The morning check should compare against 452,
  not 383 — otherwise a sync that adds ~70 rows would look like a problem when it is in fact the
  expected delta.

- **Other accounts.** The runbook scoped this baseline to `act_995888422231015` because that is
  the account whose data the new code is expected to start aggregating. Other accounts
  (`act_1180773537404268`, etc.) are not baselined here — if the operator wants parallel
  baselines for them, that is a follow-up.

- **The per-sync summary breakdown (direct / manual / propagated / no-generation).** That lives
  in Cloud Logging, not Firestore. The investigation's reported values (5 / 0 / 0 / 1003) come
  from the per-sync log line emitted by the worker; the morning check reads the post-deploy
  summary log line, not a Firestore field.

- **Whether the deployed function revision corresponds to the squash.** Verified separately at
  deploy time via the `firebase deploy --only functions` output. The functions revision is the
  one compiled from the squash's source on a clean `lib/`.

---

## §7. Reproducibility

To re-capture this baseline (or capture a parallel one for a different account), the script at
`C:\temp\opencode\capture-969-baseline-v2.cjs` is the canonical recipe. It uses the Firebase
Admin SDK with project-default credentials (no service-account key needed for the operator's
current auth setup) and a `NODE_PATH` pointing at `functions/node_modules` so the Admin SDK is
resolved from the workspace's installed copy.

Steps:

```powershell
$env:NODE_PATH = "D:\Pro Ads AI - SaaS - FAL\functions\node_modules"
node "C:\temp\opencode\capture-969-baseline-v2.cjs"
```

To target a different account, edit the `ACCOUNT_ID` constant at the top of the script.

The script is deliberately a one-shot — it does not write to the repo, does not commit, and is
not part of any deployable. It exists only to make this baseline reproducible if the operator
wants to re-capture, or to capture parallel baselines for other accounts.
