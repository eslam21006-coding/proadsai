# 969 — Pre-sync production baseline (act_995888422231015)

**Captured:** 2026-09-17T20:10:09Z (immediately after PR #71 deploy, corrected re-capture)
**Project:** `proadsai-saas`
**Account:** `act_995888422231015`
**Pre-deploy commit:** `efcdb04 feat(969): cumulative learning — accumulate across syncs and funnels`
**Capture scripts:** `C:\temp\opencode\capture-969-baseline-v3.cjs`, `C:\temp\opencode\capture-969-baseline-v4.cjs` (read-only, outside the repo)
**Raw outputs:** `C:\temp\opencode\baseline-v3-output.json` (~540 KB), `C:\temp\opencode\baseline-v4-output.json` (definitive direct read)

This file supersedes the v1 capture committed in `3ddfb78`. **Two conclusions in the v1 capture
were wrong** (recorded in §10 with strikethrough rather than deleted — the record of what was
measured and why it was wrong is worth keeping).

The headline correction: **the codebase has TWO ad-performance stores, and the v1 capture
measured the wrong one**. The investigation's 383 figure refers to the workspace-scoped store;
v1 measured the top-level legacy store (452). They are not in conflict — they are different
collections.

---

## §1. Schema — corrected

The codebase has two stores, by design (Batch 0 of the spec):

| Store | Path                                                                                                  | Written by              |
|-------|-------------------------------------------------------------------------------------------------------|-------------------------|
| **Legacy (LEG A, Phase 970)** | `adPerformance/{userId}_{adId}` (top-level)                                                          | `metaSync/orchestrator.ts` — runs on every sync, Phase 969 does not touch it |
| **Learning (Phase 969)**     | `users/{uid}/workspaces/{wid}/adAccounts/{act}/adPerformance/{adId}`                                  | `metaSync/shared.ts` (the worker) |
| Learning aggregates           | `users/{uid}/workspaces/{wid}/adAccounts/{act}/hookPerformance/{angleKey}`                             | Worker, post-sync |
| Learning aggregates           | `users/{uid}/workspaces/{wid}/adAccounts/{act}/visualPerformance/{patternKey}`                         | Worker, post-sync |

The Phase 969 morning checks compare against the **learning store**. The legacy store keeps
running and is reported separately below — it is not the comparison surface.

The collection-group scan (`db.collectionGroup(...)`) is the authoritative way to find any
doc under either hierarchy. v1 used a path-based probe (`users/{uid}/adAccounts/{act}` —
missing the `workspaces` segment), found nothing, and reported 0/empty. v3 uses the
collection-group scan as primary evidence; that is how the 383 workspace-scoped docs were
found despite the parent doc not existing (orphan subcollection — see §3).

---

## §2. Baseline numbers — act_995888422231015 (corrected)

### §2.1 Learning store (the comparison surface)

| Metric                                                                              | Value     | Note |
|-------------------------------------------------------------------------------------|-----------|-------|
| `users/.../workspaces/.../adAccounts/act_995888422231015/adPerformance` doc count   | **383**   | Matches the investigation's quoted figure exactly. |
| Workspace id carrying the data                                                       | **`dueXIiFdEJKuAjSuYlUX`** | One user-workspace pair only — see §3. |
| User id carrying the data                                                            | **`ywpCgWsXqVP4tlNwfhSoTqMjRw52`** | One of three users linked via `metaConnections`. |
| Of those 383 docs, `adDocsWithLedger` (carrying the new Phase 969 `ledger` field)   | **0**     | Expected. The field is new in Phase 969 (T025). |
| `users/.../workspaces/.../adAccounts/act_995888422231015/hookPerformance` doc count | **0**     | Expected. No aggregates exist yet for this account. |
| `users/.../workspaces/.../adAccounts/act_995888422231015/visualPerformance` doc count | **0**    | Expected. Same as above. |

Path (verbatim, copy-paste-safe):

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015
```

### §2.2 Legacy store (separate, NOT the comparison surface)

| Metric                                                  | Value     | Note |
|---------------------------------------------------------|-----------|-------|
| Top-level `adPerformance` docs with `adAccountId == act_995888422231015` | **452**   | LEG A. Phase 969 does not touch it. Phase 970's relocation into `orchestrator.ts` keeps this collection active. |
| Of those, `adDocsWithLedger`                            | **0**     | Expected. The legacy writer predates the new field. |

The legacy store and the learning store overlap — same Meta ad IDs may appear in both.
They are not in conflict; they are two writers with different schemas touching the same
business entities.

### §2.3 New-Phase-969 fields: confirmed absent

The capture script checked every workspace-scoped ad row (383 of them) and every
workspace-scoped aggregate (none) for the four fields new in Phase 969. The check returned
`false` on every doc, every field:

| Field (new in Phase 969)            | Workspace-scoped adPerformance (383 docs) | Workspace-scoped hookPerformance (0 docs) | Workspace-scoped visualPerformance (0 docs) |
|-------------------------------------|------------------------------------------|------------------------------------------|---------------------------------------------|
| `contributedCreativeKeys`           | **0** carry it                           | n/a (no docs)                            | n/a (no docs)                               |
| `creativeCount`                     | **0** carry it                           | n/a                                      | n/a                                         |
| `byFunnelType`                      | **0** carry it                           | n/a                                      | n/a                                         |
| `ledger`                            | **0** carry it                           | n/a                                      | n/a                                         |

Sample ad-row fields from one of the 383 docs (the workspace-scoped ad doc shape is
pre-Phase-969; the `ledger` field is absent, the new aggregate fields are absent):

```
cpa3d, matchType, ctrAll, creativeId, cpm3d, ageDays, diagnosisAr, audienceType, ctrLink,
spendSharePct, matchDistance, campaignObjective, generationId, spend3d, adName,
schemaVersion, metadataAvailable, impressions3d, spendToday, frequency3d, imageHash, geoTier,
conversions3d, ruleCode, adId, peak1dCtr, campaignObjectiveRaw, verdict, reasonAr, spend7d,
creativeType, evaluatedAt, thumbnailUrl
```

No `ledger`. No `byFunnelType` (would live on aggregates, not ad rows, but is also absent
everywhere). No `contributedCreativeKeys`. No `creativeCount` (same — lives on aggregates).

### §2.4 Project-wide: aggregates elsewhere

| Metric                                                  | Value | Note |
|---------------------------------------------------------|-------|------|
| `hookPerformance` collection-group total (any account)  | **1** | The pre-969 live aggregate — see §5. |
| `visualPerformance` collection-group total              | **0** | — |
| `hookPerformance` docs whose path contains `act_995888422231015` | **0** | Confirmed: no aggregates for THIS account exist anywhere. |
| `visualPerformance` docs whose path contains `act_995888422231015` | **0** | Same. |

---

## §3. Data layout — act_995888422231015 in this account

The collection-group scan found 383 adPerformance docs for this account at exactly one path:

```
users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015/adPerformance/{adId}
```

The capture script probed 20 other workspaces linked to this user and the workspaces of the
two other linked users — none of them carry data for `act_995888422231015`. So the data is
localised to a single (user, workspace) pair.

**Data-integrity oddity worth flagging:** the **parent `adAccounts/act_995888422231015` doc
itself does not exist** (`adAccountDocExists: false` in the v4 capture). The 383 adPerformance
docs live in an orphan subcollection. Firestore allows this; the new Phase 969 code's writes
under `.../hookPerformance/` and `.../visualPerformance/` should also succeed without a parent
doc. **If tomorrow's morning check finds aggregate writes failing for this account, the orphan
parent is the first place to look.**

---

## §4. The morning comparison surface (corrected)

For the four morning checks (§5 of the deploy runbook) plus the multi-funnel check (§6):

| Check                                                  | Baseline value (this file, §2)            | Expected morning value |
|--------------------------------------------------------|-------------------------------------------|------------------------|
| 1. `byObjective.conversion.count` accumulates (hook)   | not present (0 docs)                      | > 0; non-decreasing across syncs |
| 1. `byObjective.conversion.count` accumulates (visual) | not present (0 docs)                      | > 0 |
| 1. `creativeCount` accumulates (hook)                 | not present (0 docs)                      | > 0 |
| 1. `creativeCount` accumulates (visual)               | not present (0 docs)                      | > 0 |
| 2. `creativeCount` counts creatives not observations  | not present (0 docs)                      | After the second sync, `creativeCount` should be the count of distinct creatives per angle, NOT a count that doubles across syncs |
| 3. Per-sync unlinked-contribution breakdown (direct / manual / propagated / no-generation) | n/a — first sync has not run | The summary log line should report numbers. Baseline expected values from the investigation: 5 direct, 0 manual, 0 propagated, 1003 unlinked. |
| 4. OAuthException code 4 subcode 1504022 in Cloud Logging | absent                                 | absent; if it recurs, `GRAPH_CONCURRENCY` retune per the runbook |
| 6. `byFunnelType` populated in > 1 real bucket         | not present (0 docs)                      | At least one real bucket populated if `workspaceFunnelType` is set on the workspace's funnel settings doc; otherwise everything in `unknown` (FR-032). |
| 6. `ledger` field on ad rows                           | 0 of 383 carry it                         | > 0 (every contributed row gets a ledger entry under FR-016) |

The investigation's T064b inverse case test (`every contribution lands in unknown` = failure)
is the check to apply here: if the workspace funnel type is set but every contribution lands in
`unknown`, the workspace funnel type is not reaching the aggregate — same defect surface.

---

## §5. Pre-969 live aggregate — record for the morning

The codebase contains exactly one `hookPerformance` doc, written by a pre-969 worker. This
is the first live test of the locked decision: existing aggregates are **retired, not
converted** — no backfill, no migration. After tonight's 03:00 sync, this doc should be
**left alone** (or replaced by a fresh aggregate under the new schema, depending on how the
worker treats pre-existing docs — see FR-042 through FR-045's retirement rules).

| Field                                           | Value |
|-------------------------------------------------|-------|
| Path (verbatim)                                 | `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/ZVASEGdrF5qbizl4Bbug/adAccounts/act_1180773537404268/hookPerformance/pain` |
| `angleKey`                                      | `pain` |
| `sampleSize`                                    | `5` |
| `byObjective.conversion.count`                  | `5` |
| `byObjective.conversion.bestVerdictCount`       | `0` |
| `byObjective.conversion.worstVerdictCount`      | `0` |
| `byObjective.other.count`                       | `0` |
| `creativeCount`                                 | **absent** (pre-969 shape) |
| `contributedCreativeKeys`                       | **absent** |
| `byFunnelType`                                  | **absent** |
| `schemaVersion`                                 | **absent** |
| `lastUpdated`                                   | `1788461068918` (2026-09-04 09:24 UTC, give or take — this is the last pre-969 write) |

**Morning check for this doc (added per operator instruction):**

After the first sync at 03:00, what happens to this doc? Three outcomes are possible; one
should match FR-042 through FR-045:

| Outcome | Expected if... |
|---------|----------------|
| Doc unchanged — still has `count: 5`, still has no `creativeCount`, etc. | FR-042/43/44: existing aggregates are retired, not converted; the worker writes new aggregates elsewhere and leaves this one alone |
| Doc deleted / replaced | The worker's retirement rule deletes or overwrites legacy aggregates |
| Doc updated with `creativeCount`, `contributedCreativeKeys`, `byFunnelType`, `schemaVersion` | Backfill ran — this contradicts the "retired, not converted" decision |

If outcome 1 or 2, the morning is healthy. If outcome 3, a backfill ran and the
retirement decision needs to be re-examined with the operator.

This doc is for `act_1180773537404268`, a different account from this baseline's
`act_995888422231015`. It is recorded here because the operator flagged it; it is a
separate observation, not part of this baseline's check list.

---

## §6. What this baseline does NOT cover

- **Other accounts.** Baseline is scoped to `act_995888422231015`. Other accounts
  (`act_1180773537404268`, `act_1163959057640939`, etc.) are not baselined here.
- **The per-sync summary breakdown (direct / manual / propagated / no-generation).** Lives in
  Cloud Logging, not Firestore. The investigation's reported values (5 / 0 / 0 / 1003) come
  from the per-sync log line emitted by the worker; the morning check reads the post-deploy
  summary log line, not a Firestore field.
- **Whether the deployed function revision corresponds to the squash.** Verified separately at
  deploy time via the `firebase deploy --only functions` output. The functions revision is
  the one compiled from the squash's source on a clean `lib/`.

---

## §7. Reproducibility

To re-capture this baseline (or capture a parallel one for a different account), the v4 script
at `C:\temp\opencode\capture-969-baseline-v4.cjs` is the canonical recipe. The v3 script is
the broader scan that found this account in the first place. Both use the Firebase Admin SDK
with project-default credentials and a `NODE_PATH` pointing at `functions/node_modules`.

```powershell
$env:NODE_PATH = "D:\Pro Ads AI - SaaS - FAL\functions\node_modules"
node "C:\temp\opencode\capture-969-baseline-v4.cjs"
```

To target a different (user, workspace, account), edit the `path` string near the top of the
script. The collection-group scan in v3 catches accounts even when no parent doc exists —
this is the discovery method.

---

## §8. Summary table (single-screen view)

| Surface                                                        | Count | New fields present? |
|----------------------------------------------------------------|-------|---------------------|
| Workspace-scoped `adPerformance` for `act_995888422231015`     | 383   | 0 / 4 (none)        |
| Workspace-scoped `hookPerformance` for `act_995888422231015`   | 0     | n/a (no docs)       |
| Workspace-scoped `visualPerformance` for `act_995888422231015` | 0     | n/a (no docs)       |
| Legacy top-level `adPerformance` for `act_995888422231015`     | 452   | 0 / 4 (none)        |
| Project-wide `hookPerformance` (any account)                   | 1     | (pre-969 shape — see §5) |
| Project-wide `visualPerformance` (any account)                 | 0     | —                    |

This is the table the morning checks compare against.

---

## §9. Why this baseline is the right one

The runbook asked for `act_995888422231015` because the new code path (Phase 969) has work
to do there:

- The per-account `hookPerformance` and `visualPerformance` collections should be created on
  first sync (currently 0 each).
- The `ledger` field on the per-ad rows should be populated (currently 0).
- The new `creativeCount`, `contributedCreativeKeys`, and `byFunnelType` fields should appear
  on the per-angle / per-pattern aggregate docs (currently 0 across the project).

The morning checks (§5 of the runbook) compare tomorrow's `byObjective.conversion.count` and
`creativeCount` against this baseline. Both are **0 right now** because no aggregate exists
yet for this account. Tomorrow morning, after the first sync:

- `byObjective.conversion.count` should be > 0 (the new code writes it during aggregate compute).
- `creativeCount` should be > 0 (FR-073 / T021).
- `contributedCreativeKeys` should be present and non-empty on every aggregate (FR-036 / Batch 28).
- `ledger` should be present on every contributed ad row (FR-016 / T025).

A `0 → 0` morning reading is the failure mode — it means the new code did not run for this
account, or its writes failed silently. The orphan-parent observation in §3 is one possible
silently-fail cause worth ruling in or out first.

---

## §10. Struck-through v1 conclusions

The v1 capture (`commit 3ddfb78`) measured the wrong collection and produced two wrong
conclusions. They are preserved here rather than deleted because the record of what was
measured and why it was wrong is part of the deployment's history.

### §10.1 ~~§1 schema table: "the workspace-scoped path does not exist"~~

~~The schema table in v1 §1 recorded the workspace-scoped path
`users/{uid}/workspaces/{wid}/adAccounts/{act}/hookPerformance` as "Path does not exist for
this account." That was wrong.~~

**Why it was wrong:** v1 probed `users/{uid}/adAccounts/{act}` — a typo, missing the
`workspaces` segment. It found nothing, returned empty, and the report recorded "path does not
exist." The v3 collection-group scan (which is path-agnostic) found the data at exactly the
correct path: `users/ywpCgWsXqVP4tlNwfhSoTqMjRw52/workspaces/dueXIiFdEJKuAjSuYlUX/adAccounts/act_995888422231015/{adPerformance,hookPerformance,visualPerformance}`.

The path exists. The 383 adPerformance docs live there. The probe missed a path segment.

### §10.2 ~~§6: "383 vs 452, likely a sync ran and added ~69 rows"~~

~~v1 §6 hypothesised that the gap between the user's quoted 383 and the captured 452 was a
sync that added ~69 rows between the runbook draft and the capture.~~

**Why it was wrong:** 383 and 452 are **two different stores**, not the same store at two
times. 383 is the workspace-scoped `adPerformance` (the learning store). 452 is the
top-level `adPerformance` (the legacy store). They overlap by Meta ad id but are written by
two different code paths under two different schemas. The 69-row delta does not exist — the
two numbers were never meant to be compared.

The investigation's 383 was correct. The v1 capture's 452 was a measurement of the wrong
store. Nothing grew; two different stores were measured.

---

## §11. Audit trail

- v1 capture script: `C:\temp\opencode\capture-969-baseline-v2.cjs` (superseded).
- v1 raw output: `C:\temp\opencode\baseline-v2-output.json` (superseded but retained).
- v3 collection-group scan script: `C:\temp\opencode\capture-969-baseline-v3.cjs` (the
  discovery probe).
- v3 raw output: `C:\temp\opencode\baseline-v3-output.json` (~540 KB; full path list for
  every doc whose path contains `act_995888422231015`).
- v4 definitive direct-read script: `C:\temp\opencode\capture-969-baseline-v4.cjs`.
- v4 raw output: `C:\temp\opencode\baseline-v4-output.json` (the headline numbers in §2).

This file replaces the v1 content under commit `3ddfb78`. The v1 commit is preserved in
history; it is wrong but it is the record of what the deploy session measured before the
collection-group scan caught the error.
