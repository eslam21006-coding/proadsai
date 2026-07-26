# Batch 04 — Sync Pipeline Fixes

**Date:** 2026-07-24
**Branch:** `phase-14-rag-meta`
**Scope:** null-safety audit of `runSyncForAccount`, `act_` prefix normalization, revert of temporary debug instrumentation.

---

## 1. Summary

The manual "Sync Now" path (`triggerMetaSync` → `runSyncForAccount`) failed on a first-ever
sync for a workspace. Two distinct defects were found and fixed:

1. **`act_` double-prefix** — every account-scoped Meta Graph call in `metaGraph.ts` built
   `act_act_<id>`, which Graph rejects. This silently failed all hierarchy and insights fetches.
2. **Unguarded `undefined` dereference** — `runSyncForAccount` crashed with
   `Cannot read properties of undefined (reading 'deletedGenerationId')` when no
   `adPerformance` docs existed yet (i.e. on the first sync).

A full line-by-line audit of `runSyncForAccount` was performed against the eight
first-sync conditions listed in the task. Contrary to expectation, **the function was
already null-safe in almost every position** — only one genuine defect existed. The audit
findings for each checked area are recorded in §4 so the "already safe" conclusions are
auditable rather than assumed.

---

## 2. Null-safety fixes applied

### FIX 1 — `functions/src/metaSync/shared.ts` (the reported crash)

**Location:** the per-ad loop, cascade-state preservation block (was line ~722, now ~727).

**What was wrong:**

```ts
const existingData = existingByAdId.get(ad.id);   // -> Partial<AdDoc> | undefined
// ...
const existingRaw = existingData as Partial<AdDoc> & { deletedGenerationId?: unknown };
const existingDeletedGenerationId = typeof existingRaw.deletedGenerationId === "string"
```

`existingByAdId` is populated from `adAccountRef.collection("adPerformance").get()`. On a
first-ever sync that collection is empty, so `.get(ad.id)` returns `undefined`.

The surrounding code reads `existingData` correctly via optional chaining in **three** other
places (`existingData?.matchType`, `existingData?.generationId`, `existingData?.matchDistance`).
This one site instead used a **type assertion**, which only silences the compiler — it does not
make the value safe at runtime. `existingRaw.deletedGenerationId` therefore dereferenced
`undefined` and threw.

Note the reported line number (571) did not match: line 571 is `adInsightsMap.get(ad.id)`,
which is correctly guarded by `if (!windows) continue`. The true fault was ~150 lines lower.

**Fix:**

```ts
const existingRaw = (existingData ?? {}) as Partial<AdDoc> & { deletedGenerationId?: unknown };
```

Defaulting to `{}` makes every field read degrade to `undefined` instead of throwing.
`keepMetadataUnavailable` then evaluates `false` for new ads, which is the correct semantic:
an ad with no prior record cannot have been cascade-marked.

### FIX 2 — `functions/src/metaSync/shared.ts`, `matchAdCreative()`

**What was wrong:** `hammingDistance()` **throws** on a non-string, length-mismatched, or
non-64-bit hash (`perceptualHash.ts:110-119`). It was called unguarded inside the loop over
every fingerprint entry. A single malformed or legacy-length fingerprint in the workspace
index would throw on **every ad**, not just its own comparison — the caller's try/catch
recorded an error per ad and image matching was lost account-wide.

**Fix:** wrap the distance computation, `continue` past unusable entries, and return the
"no match" result when every candidate was skipped. One bad fingerprint row now costs one
comparison instead of the whole matching pass.

---

## 3. `act_` prefix normalization

**Root cause.** `index.ts:3254` requests `/me/adaccounts?fields=id,...`. Meta returns `id`
**already prefixed** (`act_995888422231015`); the bare numeric form lives in `account_id`,
which is not requested. That prefixed value flows: `adAccounts[].id` (`index.ts:3259`) →
picker sends `acc.id` (`MetaAccountPickerModal.tsx:173`) → `connectMetaAccount` stores it
verbatim. Prepending `act_` again yields `act_act_<id>`.

**New helper** — `functions/src/metaGraph.ts`:

```ts
export function toActId(adAccountId: string): string {
    const id = (adAccountId || "").trim();
    return id.startsWith("act_") ? id : `act_${id}`;
}
```

Idempotent by design so legacy documents holding a bare numeric id keep working.

**Sites changed (3, all in `metaGraph.ts`):**

| Line (orig) | Function | Before | After |
|---|---|---|---|
| 273 | `fetchCampaigns` | `` `/act_${adAccountId}/campaigns` `` | `` `/${toActId(adAccountId)}/campaigns` `` |
| 413 | `fetchAccountLevelMetric` | `` `/act_${adAccountId}/insights` `` | `` `/${toActId(adAccountId)}/insights` `` |
| 438 | `fetchAccountLevelCpaCpl` | `` `/act_${adAccountId}/insights` `` | `` `/${toActId(adAccountId)}/insights` `` |

**Sites audited and deliberately NOT changed:**

- `metaSync/shared.ts` — **zero** `act_` occurrences. It passes the raw `accountId` into
  `fetchCampaigns` / `fetchAccountBaselines`, so it inherited the bug rather than duplicating
  it. Fixed transitively.
- `index.ts` lines 3415, 3592, 5502, 5522, 5632 — build Graph URLs as `${accountId}/...`
  with **no** prepend. `accountId` there resolves from `conn.adAccounts[].id` or
  `conn.selectedAccountId`, both already prefixed. **Already correct.**
- `workspaces/metaRoleProbe.ts:28,44` — strips with `.replace("act_", "")` then re-prepends.
  Idempotent for both input forms. **Already correct**, left untouched. It is a third
  convention for the same problem and is a reasonable future consolidation onto `toActId`.
- `index.ts:6458` — reconciles both prefixed and unprefixed forms when comparing accounts.
  This is the evidence that unprefixed ids exist somewhere in older data, and the reason
  `toActId` normalizes rather than simply dropping the prepend.

---

## 4. Audit findings — areas checked, no defect found

Each item from the task list, with the reason it is already safe.

| # | Area | Finding |
|---|---|---|
| 2 | Every `Map.get()` in `shared.ts` | 22 call sites reviewed. All guarded by `?.`, `?? 0`, `\|\| 0`, `if (!x) continue`, or a preceding `.has()` — **except** the one fixed in FIX 1. |
| 3 | Property-access chains | `campaign?.objective`, `match?.generationId`, `adSet ? ... : fallback` all use optional chaining or ternary guards. `computeSpendSharePct` uses `perAdSet.get(id)?.get(id) ?? 0`. |
| 4 | Firestore `.get()` assuming existence | Funnel settings checks `settingsSnap.exists` before `.data()`. `batchLoadGenerations` checks `doc.exists`. Empty-collection `.get()` returns an empty `.docs` array, which `.map()` handles. |
| 5 | `evaluateVerdict` with null funnel settings | **Verified correct.** `qararEngine.ts:224` returns ⏳ `data_gate` when `!settings \|\| getEffectiveTarget(...) === null`, and `:237` returns ⏳ when `!baselines`. `shared.ts` only constructs `funnelSettings` when `derived` is a non-null object, so `.derived` is never undefined. Also wrapped in try/catch that falls back to ⏳. |
| 6 | Learning aggregation, zero matched ads | Entire block gated by `if (learnedAds.length > 0)`. Empty `hookPerformance`/`visualPerformance` collections yield `[]`, which `updateHookAggregates` handles via `acc.get(key) ?? {zero-initialized}`. Missing generation docs handled by `if (!gen) continue`. Whole block wrapped in try/catch that preserves existing docs on failure. |
| 7 | Baselines with zero ads / zero impressions | `fetchAccountLevelMetric` returns `0` when `rows.length === 0`. `fetchAccountLevelCpaCpl` returns `0` unless `totalActions > 0`. `aggregateAdMetrics` guards every division with `Math.max(1, ...)`, `conversions3d > 0`, and `last7DaysDaily.length > 0`. `baselines` is `null`-checked before the write. |
| 8 | Snapshot pruning, zero snapshots | `pruneSnapshots` early-returns on `snap.size <= RETENTION` and again on `stale.length === 0`. Batch delete is `.catch()`-wrapped as non-blocking. |
| — | Generation docs missing `imageFingerprint` | `loadWorkspaceFingerprints` filters on `typeof data.hash === "string" && typeof data.generationId === "string"`, so malformed entries never enter the index. |

---

## 5. Temporary debug changes reverted

All three files restored to their committed state via `git checkout --`. Each was verified by
diff to contain **only** debug edits before reverting, so no real work was lost.

| File | Debug change removed |
|---|---|
| `functions/src/metaSync/trigger.ts` | `COOLDOWN_MS` restored `60*1000` → `60*60*1000` (1 hour); cooldown `if` block uncommented and re-armed; 9 `console.log` / `console.error` instrumentation lines removed; per-step try/catch wrappers removed. |
| `functions/src/whatsWorkingDashboard.ts` | Hardcoded `canSyncNow = true` removed; real `canSyncNow = cooldownEndsAt === null` restored. |
| `src/components/WhatsWorkingDashboard.tsx` | `disabled={false}` → `disabled={!status.canSyncNow}`; unconditional CTA label → `status.canSyncNow ? cta : cooldown` conditional. |

Net effect: both the client-side and server-side sync rate limits are armed again.

---

## 6. Build / test / deploy status

| Gate | Result |
|---|---|
| `npm run build` (functions) | **PASS** — clean `tsc`, no errors. |
| `cd functions && npm test` | **PASS** — 31 suites, 0 failures, 0 `not ok`. Verified across two full runs. |
| `npm run build` (frontend) | **PASS** — built in ~11s. |
| `firebase deploy --only functions` | **PASS** — all functions updated in `europe-west1` (+ `purgeExpiredWorkspaces` in `us-central1`), including `metaSyncAccountWorker` and `metaDailySync` so the scheduled 3am sync carries the fixes. |

**Flaky-test note.** One early run reported a single assertion failure in the
`learningAggregates` suite. It did not reproduce: the suite was re-run 5× standalone
(19/19 each time) and the full suite twice more (0 failures). Recorded here rather than
suppressed — if it resurfaces it is a pre-existing intermittent, unrelated to these changes.

---

## 7. Verification status and residual risk

**Verified:** compilation, unit tests, deploy success, and static correctness of both fixes.

**NOT verified:** an end-to-end live sync against real Meta data. Neither fix has been
exercised against production yet — a real "Sync Now" on a first-ever workspace is still
required to confirm the pipeline runs to completion. The expected success signal is a
`triggerMetaSync` response with `ok: true` and non-zero `counts.ads`.

**Residual risk.** The null-safety audit was scoped to `runSyncForAccount` and its direct
helpers, as instructed. It did not cover `dispatcher.ts`, `worker.ts`, or the dashboard
read path. If a first-sync crash recurs it may be in one of those.
