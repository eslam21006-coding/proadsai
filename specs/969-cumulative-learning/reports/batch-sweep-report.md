# Sweep — every state claim in `spec.md`, re-verified

**Branch**: `969-cumulative-learning`
**Date**: 2026-09-05
**Trigger**: three stale claims found during review — all true when written, all
surviving because they read plausibly. Three is a pattern.
**Scope**: read-only verification; corrections applied only where a claim was stale
or a citation imprecise. **No file under `functions/src/` or `src/` was touched, and
`/speckit.implement` was not run.**

## Result

| Category | Claims | CONFIRMED | STALE | UNVERIFIABLE |
|---|---|---|---|---|
| `path:line` citations | 59 | 59 | 0 | 0 |
| Behavioural claims about current code | 7 | 7 | 0 | 0 |
| Census / production figures | 8 | 8 | 0 | 0 |
| Enforcement claims | 3 | 3 | 0 | 0 |
| **Total** | **77** | **77** | **0** | **0** |

**No stale claim was found, and none that would change a requirement's meaning.**
Two citations were **imprecise** — pointing at the enclosing function rather than
the exact line — and were tightened. Both are citation-precision fixes; neither
alters what any requirement requires, so no owner decision is needed.

The three previously-found stale claims (the manual cooldown, FR-059's
merged-artifact clarification, FR-050's Note) were all corrected before this sweep
and were re-checked as still correct.

---

## 1. `path:line` citations — 59 distinct, all resolve

Derived **mechanically** by regex over `spec.md`, not by reading, and each resolved
against the merged working tree. Full output was captured; the spot-checks that
mattered:

```
functions/src/learningAggregates.ts:17   >> // - Same generationId in 2 ad sets → separate records per context.
functions/src/learningAggregates.ts:120  >> if (ad.matchType !== "auto_hash" && ad.matchType !== "manual") return false;
functions/src/metaGraph.ts:83            >> export const HIERARCHY_AD_FIELDS = "id,name,status,adset_id,creative{...}"
metaGraph.ts:145                         >> status?: string;
functions/src/metaSync/shared.ts:864-869 >> if (existingMatchType === "manual" || existingMatchType === "auto_hash") {
shared.ts:796                            >> result.imageHash = hash;
shared.ts:797                            >> const match = await matchAdCreative(hash, fingerprintIndex, 10);
shared.ts:1015                           >> imageHash: match?.imageHash ?? null,
shared.ts:1190                           >> for (const w of chunk) batch.set(w.ref, w.data, { merge: true });
whatsWorkingDashboard.ts:719             >> .filter((a) => a.matchType === null)
worker.ts:19                             >> import { runSyncForAccount, type SyncResult } from "./shared.js";
worker.ts:39                             >> maxConcurrentDispatches: 5,
lease.ts:52                              >> export const LEASE_DOC_COLLECTION = "metaSyncLeases";
lease.ts:53                              >> export const LEASE_TTL_MS = 10 * 60 * 1000; // 10 minutes
orchestrator.ts:455                      >> metaAdId: ad.ad_id,
orchestrator.ts:824                      >> export async function runFullSyncWithLease(
generationDeleteCascade.ts:70-72         >> .where("generationId", "==", generationId)
dispatcher.ts:137                        >> schedule: "0 3 * * *",
```

`whatsWorkingDashboard.ts:719` is the load-bearing one for FR-074f — **CONFIRMED**,
it is still the `matchType === null` filter that builds the owner-facing "needs
linking" list, which a new enum value would silently empty.

### Four citations examined more closely

| Citation | Finding |
|---|---|
| `index.ts:3931` → now `},` | **CONFIRMED as a historical reference, correctly labelled.** The spec says the assignment *"was relocated **from** `index.ts:3931` by Phase 970"* and adds that *"the old citation must not be read as evidence of removed behaviour."* Pointing at a line that no longer holds it is the intended reading. |
| `dispatcher.ts:100-104` | **CONFIRMED.** `seenAccounts.has` is at `:102` and `.add` at `:103`, both inside the cited range. |
| `orchestrator.ts:698` | **IMPRECISE → tightened.** The `fanOutPhase14({` call opens at `:697`; `:698` is its first argument. Changed to *"`fanOutPhase14`, called at `orchestrator.ts:697-701`"*. |
| `shared.ts:220` and `:266` | **IMPRECISE → tightened.** Cited as *"the `.reduce()` calls at"*, but `:220` is `export function sumSpend3d(` and `:266` is `export function aggregateAdMetrics(` — the reduce itself is at `:223`. Reworded to name the functions and give the reduce's own line. |

---

## 2. Behavioural claims — 7, all CONFIRMED

**`status` requested and never persisted:**

```
  in HIERARCHY_AD_FIELDS: 1
  ad.status read in shared.ts: 0
  status member in AdDoc (lines 170-211): 0
```

**`matchType` branch sites outside `shared.ts`** — the spec (FR-074f) names six,
hedged with *"among others"*. Exactly six exist:

```
functions/src/getTopWinners.ts:79            if (c.matchType !== "auto_hash" && c.matchType !== "manual") return false
functions/src/getTopWinners.ts:185           matchType: d.matchType === "auto_hash" || d.matchType === "manual" ...
functions/src/learningAggregates.ts:120      if (ad.matchType !== "auto_hash" && ad.matchType !== "manual") return false
functions/src/whatsWorkingDashboard.ts:412   .filter((a) => a.matchType === "auto_hash" || ...)
functions/src/whatsWorkingDashboard.ts:569   .filter((a) => a.matchType === "auto_hash" || ...)
functions/src/whatsWorkingDashboard.ts:719   .filter((a) => a.matchType === null)
```

*Note on a count discrepancy that is not in the spec*: the review conversation at
one point said "five call sites". The spec says six and lists six; six is correct.

**Cascade queries by `generationId`:** `generationDeleteCascade.ts:72` →
`.where("generationId", "==", generationId)`. **CONFIRMED** — and this is what makes
FR-074d's persistence load-bearing for FR-014.

**`imageHash` written before `matchAdCreative`:** `shared.ts:796` then `:797`.
**CONFIRMED** — the hash is stored independently of match success.

**No per-account lease exists:** every `LEASE_DOC_COLLECTION` reference resolves to
`metaSyncLeases/{ownerUid}` (`lease.ts:52`, `:77`, `:115`, `:172`). **CONFIRMED.**

**The three-day window is one aggregated row:** `fetchAdInsights3d` sends no
`time_increment` (`metaGraph.ts:353-366`), and `shared.ts:294` states it in the code.
**CONFIRMED in code.** The underlying platform behaviour is asserted by the
repository, not independently verified — already recorded in the spec as such, and
FR-083's design deliberately does not depend on it.

---

## 3. Census and production figures — 8, all CONFIRMED

Re-run against live Firestore on 2026-09-05:

```
workspace-scoped rows: 1008
  generationId AND imageHash : 5
  generationId, NO imageHash : 0
  imageHash, NO generationId : 1003
  NEITHER key                : 0
generationIds mapping to MORE THAN ONE imageHash: 0
total linked generationIds: 1   (UtCCphz5jAgFIEWCa7WQ → f5e9a98dadad8d9d)
matchDistance on linked rows: [1,1,1,1,1]

ALL ROWS      1008 rows → 146 groups, largest 55, 6.90:1
act_1180773537404268   625 rows →  94 groups, largest 49, 6.65:1
act_995888422231015    383 rows →  52 groups, largest 55, 7.37:1

workspace-scoped metaAdId_present: 0   (of 1008)
creativeDeployments total: 58 | with non-null metaAdId: 0
```

Every figure in the spec matches. One number **moved and does not affect any
claim**: the root `adPerformance` collection grew from 2457 to 2481 docs, and the
`collectionGroup` total from 3465 to 3489. The spec cites neither — it cites the
**workspace-scoped** count (1008), which is unchanged.

---

## 4. Enforcement claims — 3, all CONFIRMED

**FR-051e's known gap — the terminology guard does not walk the backend.**
**CONFIRMED**, and this is the sharpest of the three:

```
scripts/sc11Guard.mjs:50   const ROOT = process.cwd();
scripts/sc11Guard.mjs:51   const SRC_DIR = join(ROOT, "src");
scripts/sc11Guard.mjs:496  const files = walk(SRC_DIR, []);
```

It walks `src/` only. Nothing walks `functions/`. FR-051e's *"stated but not
enforced"* is exact.

**Test registration (FR-050).** Re-confirmed from the earlier check:
`whatsWorkingDashboard.test.js` appears in two scripts and executed in the full run
(14 tests, 14 passed). The stale Note was already struck.

**No per-account lease is enforced anywhere.** Covered in §2.

---

## 5. Claims this feature will make false by design

Added to `spec.md` as a new section immediately before `## Requirements`, so an
implementer meets it before the requirements rather than after. Seven entries, each
marked *true at specification time*, with what falsifies it:

`learningAggregates.ts:17`'s header rule (deleted by FR-073) · overwrite semantics
(inverted by FR-015/FR-021) · the unbounded scan at `shared.ts:831` (removed by
FR-068) · `status` never persisted (FR-085) · the per-day `actions` never read
(FR-081) · no per-account lease (FR-054a) · ad rows carrying no ledger, sealed
context or accrual (FR-016, FR-001, FR-081).

The section closes by stating that everything else describing current state was
re-verified on 2026-09-05 and is CONFIRMED, and points here for the raw output.

---

## 6. Recorded for the implementer

`tasks.md` T056 now carries an explicit gate, because the implementation session will
not have this conversation's context:

> **OWNER REVIEW REQUIRED BEFORE THIS SHIPS.** Surface the proposed English and
> Arabic to the owner and **wait**. Do **not** treat SC-010 passing as the review:
> SC-010 confirms the string exists in both languages and carries no jargon; it
> **cannot** judge whether the Fusha reads naturally to a Gulf coach, which is what
> Constitution Principle V requires.

D1 changed that verdict to **"PASS, with work"**, and the work is this review.

---

## Nothing requires an owner decision

The sweep found **no stale claim**, and therefore nothing that changes a
requirement's meaning. The two citation-precision fixes are annotations, not
amendments. Implementation is unblocked from this session's side.

**Stopped here. `/speckit.implement` not run; no task begun; no file under
`functions/src/` or `src/` created or modified.**
