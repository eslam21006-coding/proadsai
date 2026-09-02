# Investigation: cumulative learning across funnel types

- **Branch at investigation time:** `968-funnel-economics-rebuild` @ `eaa3fc8`
- **Status:** Read-only investigation. No code changed. No commits on the feature branch.
- **Owner requirement (verbatim):** "I don't want to be working on a low-ticket funnel and having an amazing learning experience, only to have everything reset once I switch to another funnel. It should be accumulative."
- **Hypothesis to test (provided by owner, NOT assumed correct):** `avgLinkCtr` and `avgCpm` are target-independent and should accumulate forever across funnel types. Only the 🟢/🔴 verdict counts are funnel-specific because a verdict is a comparison against a target. The proposed fix is normalization — store performance relative to the ad's own target at write time — instead of partitioning by epoch.

This report presents what is actually in the code (with file:line evidence) and answers the seven questions the owner asked. Findings only — no implementation plan.

---

## §1 — Stored shape

### 1.1 `hookPerformance/{angleKey}` aggregate

`functions/src/learningAggregates.ts:29-57`:

```ts
export interface HookPerformanceAggregate {
    angleKey: string;
    sampleSize: number;
    lastUpdated: number;
    byObjective: {
        conversion: {
            avgLinkCtr: number;
            count: number;
            bestVerdictCount: number;  // 🟢
            worstVerdictCount: number; // 🔴
        };
        other: {
            avgLinkCtr: number;
            count: number;
        };
    };
    byGeoTier: {
        tier1_gulf: { avgCtr: number; count: number };
        tier2_diaspora: { avgCtr: number; count: number };
        tier3_egypt_na: { avgCtr: number; count: number };
    };
    byAudienceType: {
        broad: { avgCtr: number; count: number };
        interest: { avgCtr: number; count: number };
        lookalike: { avgCtr: number; count: number };
        retargeting: { avgCtr: number; count: number };
        advantage_plus: { avgCtr: number; count: number };
    };
}
```

Document path: `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/hookPerformance/{angleKey}` — verified at `functions/src/metaSync/shared.ts:1059` (read), `:1072` (write).

### 1.2 `visualPerformance/{patternKey}` aggregate

`functions/src/learningAggregates.ts:60-88`:

```ts
export interface VisualPerformanceAggregate {
    patternKey: string;
    sampleSize: number;
    lastUpdated: number;
    byObjective: {
        conversion: {
            avgCpm: number;
            avgLinkCtr: number;
            count: number;
            bestVerdictCount: number;
            worstVerdictCount: number;
        };
        other: {
            count: number;
        };
    };
    byGeoTier: {
        tier1_gulf: { avgCpm: number; avgCtr: number; count: number };
        tier2_diaspora: { avgCpm: number; avgCtr: number; count: number };
        tier3_egypt_na: { avgCpm: number; avgCtr: number; count: number };
    };
    byAudienceType: {
        broad: { avgCpm: number; avgCtr: number; count: number };
        interest: { avgCpm: number; avgCtr: number; count: number };
        lookalike: { avgCpm: number; avgCtr: number; count: number };
        retargeting: { avgCpm: number; avgCtr: number; count: number };
        advantage_plus: { avgCpm: number; avgCtr: number; count: number };
    };
}
```

Document path: `users/{userId}/workspaces/{workspaceId}/adAccounts/{accountId}/visualPerformance/{patternKey}` — verified at `functions/src/metaSync/shared.ts:1060` (read), `:1079` (write).

### 1.3 The spec confirms — verbatim

`specs/phase-14/data-model.md:160-176` (hook) and `:184-194` (visual) declare the same shapes. **Neither shape carries `funnelType`, `effectiveTarget`, `cpa3d`, `cpa3dRelative`, or any field that would let a downstream reader recover the target the ad was judged against.** The doc id is the angle/pattern key; the doc body is what is in §1.1 / §1.2.

### 1.4 The input shape that feeds the aggregator

`functions/src/metaSync/shared.ts:125-166` (AdDoc — what the sync writes for each ad) is more detailed than the aggregate but still does not carry the target at evaluation time:

```ts
interface AdDoc {
    adId: string;
    ...
    cpa3d: number | null;            // cost-per-acquisition (3-day rolling) or null
    ctrLink: number;
    ctrAll: number;
    conversions3d: number;
    spendSharePct: number;
    ageDays: number;
    cpm3d: number;
    peak1dCtr: number;
    ...
    verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";   // <-- already frozen, but only as the
    ruleCode: string;                            //     resulting emoji, not the ratio
    reasonAr: string;
    diagnosisAr: string | null;
    evaluatedAt: number;
    schemaVersion: 1;
}
```

`AdDoc` carries `cpa3d` and `verdict`, but **does not carry the `effectiveTarget` value the verdict was computed against, nor any per-evaluation ratio (`cpa3d / effectiveTarget`, `cpm / baseline`, etc.)**. The verdict is stored as a frozen emoji; the comparison inputs are not.

---

## §2 — What is retained (the load-bearing question)

### 2.1 The raw cost-per-result IS retained — but only on the per-ad doc, not the aggregate

Per `functions/src/metaSync/shared.ts:260`, `cpa3d = spend3d / conversions3d` is computed and persisted to every `adPerformance/{adId}` doc (line 947: `cpa3d: metrics.cpa3d`). The aggregation step at line 1066 (`updateHookAggregates(learnedAds, existingHook)`) does **not** forward `cpa3d` — see `functions/src/learningAggregates.ts:91-115` (`AdForLearning` interface) which only carries `ctrLink`, `cpm3d`, `conversions3d`, `verdict`, plus the pattern-matching fields. There is **no `cpa3d` field on `AdForLearning`**.

### 2.2 The target the ad was judged against is NOT retained anywhere

`functions/src/metaSync/shared.ts:880-884` loads the funnel settings ONCE per sync (`const target = funnelSettings ? getEffectiveTarget(funnelSettings.derived) ?? Infinity : Infinity`) and passes `target` into `evaluateVerdict` (line 904). The verdict engine uses `target` to decide 🟢/🟡/🔴/🛟/⏳ via `cpa3dMatchesTarget(ad, target)` at `functions/src/qararEngine.ts:145-148`. The verdict is stored on `adPerformance/{adId}` as a frozen emoji (line 959: `verdict: verdictResult.verdict`). The `target` value is **dropped on the floor** after the verdict is computed.

There is no field on `AdDoc`, `HookPerformanceAggregate`, or `VisualPerformanceAggregate` that records what `effectiveTarget` was at evaluation time. Grep confirms:

```
$ grep -n "effectiveTarget" functions/src/learningAggregates.ts
(no output — never referenced by the aggregator)

$ grep -n "effectiveTarget" functions/src/metaSync/shared.ts | grep -v "^//"
  880:        const target = funnelSettings ? getEffectiveTarget(funnelSettings.derived) ?? Infinity : Infinity;
```

Only the verdict call site reads `effectiveTarget`. Nothing writes it.

### 2.3 What this means for normalization (the owner's hypothesis)

**Plainly: the raw `cpa3d` is on every adPerformance doc, but the target value that `cpa3d` was compared against is not.** A backfill would have to either:

1. **Reconstruct the target at write time** by storing the verdict's inputs (target value at evaluation) on each `adPerformance/{adId}` doc, OR
2. **Recompute the target retroactively** by reading the `evaluatedAt` timestamp and finding the funnel settings doc that was active at that moment.

Approach 1 is correct and complete. Approach 2 is fragile (settings history is not retained — there is no settings-history collection, only the current `settings` doc per account).

**The verdict counts already stored on existing aggregates (`bestVerdictCount`, `worstVerdictCount`) cannot be backfilled to a normalized ratio. They are frozen 🟢/🔴 counts whose original target is unrecoverable.** This is the single most important finding for the redesign: **the existing verdict counts are unrecoverable; they will continue to be valid only for the targets that were active when the verdict was recorded; under any redesign that wants ratios, the existing verdict counts must be retired, not backfilled.**

### 2.4 The verdict is frozen at write time (this part of the owner's hypothesis IS correct)

`functions/src/metaSync/shared.ts:919` stamps `evaluatedAt: nowMs` (a single per-sync timestamp). The verdict engine produces a verdict result; the result is written verbatim to the `adPerformance` doc; the doc is never recomputed in place. There is no "previous verdict" check in the loop — see the absence of any `existingAdVerdict`, `prevVerdict`, or `existingVerdict` references in the file:

```
$ grep -nE "existingAdVerdict|prevVerdict|previousVerdict|existingVerdict" functions/src/metaSync/shared.ts
(no output — no prior-verdict comparison)
```

What changes between syncs is the **count**: a re-synced ad gets re-counted into the aggregate if it appears in the new ad loop. The aggregate update is **OVERWRITE-with-partial-write semantics** (see §3 below). The per-ad verdict doc, by contrast, is updated in place (overwriting `verdict`/`ruleCode`/`reasonAr`/`evaluatedAt`), so a re-sync does re-write the verdict, but the previous verdict value is gone — only the latest verdict survives.

The owner's third claim — "Verdicts should be frozen at write time so changing funnel settings never rewrites history" — is **partially true**: the verdict emoji IS overwritten on every sync. The aggregate counts (`bestVerdictCount`/`worstVerdictCount`) are *not* simply incremented on each sync either — see §3.

---

## §3 — Verdict write path

### 3.1 Per-ad verdict write

Path: `metaSync/shared.ts` loop → `evaluateVerdict(...)` → `verdictResult` → `adDoc.verdict = verdictResult.verdict` → `db.batch().set(adAccountRef.collection("adPerformance").doc(ad.id), adDoc, { merge: true })` (line 1132).

Each sync, for every ad in the loop, the verdict is recomputed against the current target and overwrites the previous verdict. The previous verdict value is lost. The `evaluatedAt` timestamp is also overwritten (line 919).

### 3.2 Aggregate increment — overwrite-with-partial-write, NOT additive increment

This is the critical detail for the redesign. `functions/src/learningAggregates.ts:186-278` (`updateHookAggregates`) and `:333-424` (`updateVisualAggregates`) both have explicit **OVERWRITE semantics**, documented in their JSDoc:

```
$ grep -n "OVERWRITE\|overwrite" functions/src/learningAggregates.ts
  165: // OVERWRITE semantics: the returned aggregate is computed entirely from
  167: // the worker OVERWRITES the Firestore doc with the returned value —
  184: // This is the CRITICAL invariant: the same ad, processed in two
  235: // "Aggregates are NOT recomputed on delete", but the same
  240: // Firestore docs for the other angles are preserved untouched.
```

The aggregator builds a per-`(angleKey | patternKey)` accumulator from **the current sync's ads only** (`ads` parameter), then writes the materialized aggregate as the new value of the doc. The previous aggregate is gone for the angles that the current sync contributed to. Angles that the current sync did NOT contribute to are simply not in the output map and are preserved untouched (lines 233-242 and 383-389).

### 3.3 What "the current sync's ads" means in practice

`functions/src/metaSync/shared.ts:768-781` (existing adPerformance batch-load) plus the loop at `:793+` produces an ad loop. Every matched conversion ad in the loop contributes to its hook angle's aggregate. The existing aggregate doc for that angle is read into `existingHook: HookPerformanceAggregate[]` (line 1062) and passed to `updateHookAggregates(learnedAds, existingHook)` (line 1066) — but the function **does not consume `existingHook` for merging**; it is used only as a structural template (line 167: "passed-back-as-existing is a no-op").

**Net effect: when an ad is re-synced, the per-(angleKey, patternKey) aggregate is REWRITTEN from the current sync's contribution only.** A re-synced ad that was counted last week is NOT added to today's count; today's count is whatever the ad loop yields today. If today's ad loop includes the same ad (because Meta returned it), today's count includes it; if it doesn't (e.g., Meta stopped returning it), today's count excludes it.

For a stable account where the ad loop returns the same ads every sync, the count stays stable across syncs. For an account where the ad loop is partial (e.g., a sync that hit a pagination limit, or a manual sync covering only the last 7 days), the aggregate can **shrink** — a partial-sync write can zero out historical data on angles that didn't get re-contributed to in this sync. The JSDoc at line 233-242 addresses this:

```
// CRITICAL: only output entries for angles that the current sync actually
// contributed to. Do NOT union with `existing` — that would zero-out
// historical data on partial syncs (the spec's invariant:
// "Aggregates are NOT recomputed on delete", but the same
// principle applies to partial-sync writes).
```

So the design avoids the partial-sync-zeroing trap by NOT writing entries for angles not in this sync — but the corollary is that an aggregate doc's counts only reflect the most recent sync that touched that angle, not the cumulative all-time count.

### 3.4 What happens if funnel settings change after a verdict is recorded?

Scenario: Ad X runs at target $50, gets 🟢 (cpa3d = $40 ≤ $50). Owner changes funnel settings so target becomes $30. Next sync re-runs the ad loop.

- `metaSync/shared.ts:880` loads the **new** target ($30) from the current settings doc.
- `evaluateVerdict(ad, settings=null, …)` is called with the new target.
- Inside `evaluateVerdict`, `cpa3dMatchesTarget(ad, 30)` → `40 ≤ 30` is false, so the S1 branch does not fire.
- The verdict becomes 🟡 (default continue).
- The adPerformance doc's `verdict` is overwritten from 🟢 to 🟡.
- The aggregate: the angle's `bestVerdictCount` and `worstVerdictCount` are recomputed from the current sync's ads. If the ad was previously counted as 🟢, that count is gone; today's count (🟡) does not increment `bestVerdictCount` or `worstVerdictCount` (lines 220-221 of learningAggregates.ts only count 🟢→best and 🔴→worst).

**This is the "reset on funnel-type change" behavior the owner is reacting to**, in a slightly different form. Strictly speaking, the existing design doesn't *reset* the counts — it *rewrites* them based on the current sync against the current target. But the visible effect is identical: a strong 🟢 against the old target becomes a 🟡 against the new target, and the `bestVerdictCount` falls.

The owner's framing — "reset on funnel-type change" — is accurate as user-visible behavior; the internal mechanism is "rewrite on every sync against current target."

### 3.5 The aggregate count is NOT idempotent across syncs

To be explicit: the same ad, processed in two syncs, is counted **twice** in the second sync's aggregator (because the second sync's loop includes the ad again, and the aggregate is rebuilt from the loop's contribution alone, not "loop + existing"). So `bestVerdictCount` grows as the ad is re-synced against a target where it scores 🟢, and shrinks when the target changes.

This is a property of the OVERWRITE semantics documented at line 165-172:

```
// OVERWRITE semantics: the returned aggregate is computed entirely from
// `ads` (the current sync's contribution). The `existing` parameter is
// used only to provide a structural template (...). The worker is
// expected to OVERWRITE the Firestore doc with the returned value —
// NOT merge with it — so re-running this function on the same input
// produces an identical result (passed-back-as-existing is a no-op).
```

The "deterministic for the same input" promise holds: given the SAME `ads` array twice, the function returns the same Map twice. But because the ad loop is non-deterministic across syncs (Meta returns whatever it returns), the count drifts.

---

## §4 — Funnel-type awareness

### 4.1 Nothing in the learning path knows which funnel type an ad ran under

`functions/src/metaSync/shared.ts:125-166` (`AdDoc`) does **not** carry `funnelType`. `functions/src/learningAggregates.ts:29-88` (`HookPerformanceAggregate`, `VisualPerformanceAggregate`) do **not** carry `funnelType`. The spec at `specs/phase-14/data-model.md:160-194` also doesn't include `funnelType` on the aggregate shapes. The aggregate is partitioned by `(angleKey | patternKey) × objective × geoTier × audienceType` — **funnel type is not one of the partition keys.**

Grep confirms:
```
$ grep -n "funnelType" functions/src/learningAggregates.ts
(no output — the aggregator never sees funnelType)

$ grep -n "funnelType" functions/src/metaSync/shared.ts | grep -v "^//"
  617:                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
  619:                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[${missing.join(",")}]`,
  634:                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
  636:                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[unknown]`,
```

The only references to `funnelType` in the verdict/learning path are in the structured log line for incomplete funnel settings (`funnel_settings_incomplete … funnelType=...`) — that line is audit-only and does not affect aggregates.

### 4.2 The hook angle itself has a `funnelType` dimension — implicitly

There are 10 canonical hook angles and they are not partitioned by funnel type. A `statistics` angle on `paid_event` and a `statistics` angle on `free_webinar` share the SAME aggregate doc. The aggregate accumulates across funnel types today — this is the property the owner wants to preserve. **It is already preserved on the target-independent dimensions (`avgLinkCtr`, `avgCpm`, `count`); it is broken on the verdict dimensions (`bestVerdictCount`, `worstVerdictCount`).**

### 4.3 The verdict is funnel-type-specific only because the target is funnel-type-specific

The verdict engine uses a single `target = getEffectiveTarget(funnelSettings.derived)` — paid funnels → `effectiveTargetCpa`, free → `effectiveTargetCpl` (`functions/src/qararEngine.ts:247`, comment at `:14-17`). The thresholds (CB1_MULTIPLIER = 1.5, CB2_MULTIPLIER = 2.5, K5_SPEND_SHARE_THRESHOLD = 0.10) are the same across funnel types — only the target value differs. **Two ads with identical `cpa3d` get different verdicts if their funnel type is different, because the target is different.**

---

## §5 — What RAG actually retrieves

### 5.1 The retrieval surface

`functions/src/ragContext.ts:64-79` declares the input shape. The pure helper `buildRAGContext(input)` (lines 271-392) consumes pre-loaded aggregates. The Firestore loaders are:

- `getRAGContext(input)` (lines 464-490) — reads `hookPerformance` + `visualPerformance` + `baselines` collections scoped to a single workspace/account.
- `loadRAGContextForWorkspace(userId, workspaceId, hookAngle?)` (lines 499-525) — top-level orchestrator that resolves the connected Meta account and calls `getRAGContext`.

### 5.2 The 10-matched-ad activation gate

`functions/src/ragContext.ts:126`:
```
export const RAG_MIN_SAMPLE_SIZE = 10;
```

Computed at lines 288-296:
```ts
const hookConversionCount = hookAggs.reduce(
    (sum, a) => sum + (a.byObjective.conversion.count || 0),
    0,
);
const visualConversionCount = visualAggs.reduce(
    (sum, a) => sum + (a.byObjective.conversion.count || 0),
    0,
);
const sampleSize = Math.max(hookConversionCount, visualConversionCount);
```

And at line 308:
```ts
const insufficient = sampleSize < RAG_MIN_SAMPLE_SIZE;
```

When `insufficient` is true, every prompt block (`hookBlock`, `visualBlock`, `captionBlock`, `promptBlock`) is empty (lines 350-356) and `topPerformers` / `avoid` arrays are empty (lines 316, 323, 342, 343). The caller (`generators.ts`) skips injection entirely — fail-open, byte-identical to the pre-RAG prompt.

### 5.3 What RAG injects when the gate passes

- **`hookBlock`** — `buildHookBlockText(ranked, avoidRanked, sampleSize)` (lines 198-220). Names of top 3 angles by avg Link CTR; "Avoid [bottom 3]" phrase. No numeric metrics in the block (the docstring at `:51-53` is explicit: "NEVER contains numeric metric values").
- **`visualBlock`** — `buildVisualBlockText(visualRanked, …)` (lines 222-244). Same shape, keyed on patternKey.
- **`captionBlock`** — `buildCaptionBlockText(ranked, hookAngle)` (lines 246-256). Single sentence naming the top angle.
- **`promptBlock`** — combined narrative (line 357-363).

### 5.4 Selection logic

`rankHooks(hookAggs)` (lines 150-162): filters to angles where `byObjective.conversion.count > 0`; emits `{angleKey, avgLinkCtr, winCount, loseCount, sampleSize}`.

`buildRAGContext` (lines 271-392):
- Top performers: top 3 by `avgLinkCtr` desc, gated by `insufficient`.
- Avoid: angles with `sampleSize >= 3` AND `avgLinkCtr <= 75% of account avg`, sorted by `avgLinkCtr` asc, top 3.
- `selectedAngleRank` (lines 174-190): `'top'` if the selected angle is the #1, `'good'` if `>= 75%` of account avg, `'weak'` if `< 75%` AND `sampleSize >= 3` (the same gate as avoid), `'unknown'` if the angle has no aggregate doc.

### 5.5 The RAG path never reads `funnelType`

The retrieval is entirely over `hookPerformance` and `visualPerformance` docs, which don't carry `funnelType` (see §1, §4). **RAG aggregates already span funnel types — there is no `byFunnelType` filter on retrieval.** The owner's "should be cumulative" requirement is structurally satisfied for RAG's inputs, except for the verdict counts it reads from those aggregates (which are the same funnel-type-sensitive counts described in §3).

---

## §6 — Dashboard reads

### 6.1 What `whatsWorkingDashboard.ts` reads

The dashboard's two callables, `getWhatsWorkingDashboard` (line 299) and `getHookAnglePerformance` (line 744), both read three collections:

```
src/whatsWorkingDashboard.ts:346-347:
  const hookAggsSnap = await db.collection(`${adAccountPath}/hookPerformance`).get().catch(() => null);
  const visualAggsSnap = await db.collection(`${adAccountPath}/visualPerformance`).get().catch(() => null);
```

And per-ad collection:
```
src/whatsWorkingDashboard.ts:345:
  const adPerformanceSnap = await db.collection(`${adAccountPath}/adPerformance`).get().catch(() => null);
```

### 6.2 What it does with each

From the per-ad `adPerformance` docs (lines 364-379): counts 🟢/🟡/🔴 verdicts (`summary.green`, `summary.yellow`, `summary.red`); builds the "Recent Verdicts" list (lines 691-700); surfaces "Unmatched Ads" (lines 674-688) and "Other-objective Ads" (lines 704-716).

From the aggregates (lines 434-491 for hook, 509-666 for visual): builds the "Strongest Angles" and "Strongest Visuals" sections. The icon logic at `computeIconFromAvgs` (lines 229-241) computes 🔥/✅/⚠️ based on the **conversion-bucket avgLinkCtr** versus `accountAvgLinkCtr` (from the baselines doc). The icon tier is the data-gated signal — `bestVerdictCount` and `worstVerdictCount` are displayed in `countAr` text but do NOT affect the icon tier.

### 6.3 Would a shape change break the dashboard?

**Yes, if `bestVerdictCount`/`worstVerdictCount` is renamed or removed.** The dashboard reads them at:

```
src/whatsWorkingDashboard.ts:466:   countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
src/whatsWorkingDashboard.ts:487:   if (a._w !== b._w) return b._w - a._w;          // tie-breaker sort
src/whatsWorkingDashboard.ts:645:   countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
src/whatsWorkingDashboard.ts:663:   if (a._w !== b._w) return b._w - a._w;
```

Both `makeCountAr` (lines 173-181) uses `winners` for the "winners" count, and the `_w` sort key ranks angles by winner count within a tier. Removing `bestVerdictCount` would require re-implementing these two call sites and the sort.

**If the redesign ADDS a normalized ratio alongside the verdict counts (e.g., adds `bestRatioSum` / `worstRatioSum` / `meanRatio`), the dashboard could continue to work unchanged.** If the redesign REPLACES the verdict counts with normalized ratios, the four sites above need updating.

### 6.4 The dashboard itself does not care about funnel type

The dashboard reads the same aggregate docs regardless of which funnel type the ad ran under. It already accumulates across funnel types for its CTR/CPM tiers. **Like RAG, the dashboard's data model is funnel-type-blind; the verdict-count fields are the only funnel-type-sensitive fields it consumes.**

---

## §7 — Feasibility of the normalization approach

### 7.1 The owner's hypothesis — verified against the code

The hypothesis has three parts. Each is evaluated below against the actual code state.

**(a) "avgLinkCtr and avgCpm are target-independent and should accumulate forever."**

**TRUE.** Both fields live on the aggregates and the only consumer that reads them (RAG + dashboard) uses them in ratio computations against `accountAvgLinkCtr` — a target-independent baseline. Accumulation across funnel types is already structurally true for these fields; no shape change is required to preserve accumulation.

**(b) "Only the 🟢/🔴 verdict counts are funnel-specific, because a verdict is a comparison against a target."**

**TRUE at the data level, PARTIALLY TRUE at the system level.** The verdict emoji is indeed a target-comparison result. The aggregate's `bestVerdictCount` and `worstVerdictCount` ARE funnel-type-specific in the sense that they were computed against the target that was active when each verdict was recorded. However, the aggregates do not RECORD which target was used (see §2.3). So "funnel-specific" is true as an emergent property of the write path, not as a stored attribute.

**(c) "The fix may therefore be NORMALIZATION rather than partitioning: store performance relative to the ad's own target at write time. Verdicts should be frozen at write time so changing funnel settings never rewrites history."**

**PARTIALLY FEASIBLE — three blockers:**

1. **The per-ad verdict emoji is currently overwritten on every sync (§3.1).** To freeze verdicts at write time, the worker would need to compare the existing ad-doc verdict against the recomputed verdict and either keep the prior verdict or update only when something material changed. There is no existing guard for this — see the absence of any "prior verdict" check in `metaSync/shared.ts`.

2. **The aggregate's `bestVerdictCount` and `worstVerdictCount` are recomputed on every sync against the current target.** To make these "frozen at write time", the aggregator would need to switch from OVERWRITE semantics to INCREMENT semantics, where each ad contributes its verdict at most once across its lifetime. The current design at line 165-172 explicitly forbids this:
   ```
   // OVERWRITE semantics: the returned aggregate is computed entirely from
   // `ads` (the current sync's contribution).
   ```
   Switching to INCREMENT would require either (i) de-duplicating ads against a per-ad "already-counted" record, or (ii) keeping a per-ad verdict-history log that the aggregator replays.

3. **The target value at evaluation time is not stored anywhere.** Without the target value, you cannot compute a normalized ratio retroactively. Storing the target at write time is a prerequisite for the proposed normalization. The current per-ad `AdDoc` shape has room — `evaluatedAt` exists, but no `evaluatedTarget` or `evaluatedRatio` exists.

### 7.2 What could NOT be backfilled for existing data

- **Existing `bestVerdictCount` and `worstVerdictCount` on aggregates** — these are frozen 🟢/🔴 counts whose original target is unrecoverable. The earlier design proposal (`docs/investigations/funnel-economics-investigation.md:265-284` — epoch-partitioned paths and `verdictEpoch` stamps) was NOT applied to the current code. There is no `verdictEpoch` field, no `learning/{epoch}/...` path. The verdict emoji on every adPerformance doc is the only record of which target produced it, and even that record is overwritten on re-sync.

- **The ratio at write time** — only the next sync can produce a normalized ratio, because the prior target is unrecoverable. **Existing verdicts cannot be converted to ratios without losing the verdict's original meaning.** The owner's "accumulated value" property holds for `avgLinkCtr`, `avgCpm`, and the count fields only if the rewrite is performed in a single migration that retains the counts as-is and starts accumulating ratios from the next sync forward.

### 7.3 What could be implemented

The normalization approach is implementable, but it requires three coordinated changes:

1. **Schema change on `AdDoc`:** add `evaluatedTarget: number | null` and `evaluatedRatio: number | null` (where ratio = `cpa3d / evaluatedTarget` when `cpa3d != null`, else `null`). Stamped at verdict time. Persisted forever. Not overwritten on re-sync (or overwritten only when the verdict changes materially).
2. **Schema change on aggregate docs:** add `bestRatioSum`, `worstRatioSum`, `bestRatioCount`, `worstRatioCount` (or an equivalent mean-ratio per bucket). Aggregator switches to increment semantics for these fields; counts stay as OVERWRITE for the count fields.
3. **Aggregator change:** `updateHookAggregates` and `updateVisualAggregates` add the per-ad `evaluatedRatio` to their accumulators and produce the new fields. The OVERWRITE-vs-INCREMENT distinction must be carefully scoped — counts stay OVERWRITE (current behavior, the partial-sync-zeroing trap is acceptable for ratios as long as a sync that hits every angle resets all ratios to the latest value, which is what the user wants anyway: latest ratios reflect the latest targets).

### 7.4 What would NOT need to change

- `ragContext.ts` — its existing CTR/CPM selection logic is already funnel-type-blind. Adding ratio-based selection is additive.
- `whatsWorkingDashboard.ts` — its existing icon logic uses `avgLinkCtr`, which is already cumulative. Adding ratio-based icon logic would be additive.
- `qararEngine.ts` — the verdict engine itself is unchanged. The fix is at the WRITE site, not the COMPUTE site.

### 7.5 Risks I would flag before any implementation plan

1. **The owner's "should be cumulative" requirement applies to verdict COUNTS, which are currently OVERWRITE.** The owner is concerned about reset behavior. Making verdict counts truly cumulative requires either (a) de-duplicating against ad-id history, or (b) switching to ratio accumulation (which is what the hypothesis proposes). Both are bigger changes than the hypothesis implies.

2. **The owner's wording — "When something works in a specific funnel, we should use that learning in different funnels" — describes a cross-funnel-type learning TRANSFER.** The current code does NOT distinguish by funnel type, so technically the transfer is already happening for CTR/CPM. But for the verdict (which IS target-specific), a "winning" verdict in one funnel type is not directly comparable to another funnel type's verdict. Normalization makes the verdict comparable — the hypothesis is right about this.

3. **The redesign will require backfill strategy for existing aggregates.** Either (a) leave the existing verdict counts as-is (cumulative through the new system, but un-ratable) or (b) retire them on a cutoff date (loses the historical signal). The owner should decide.

### 7.6 What I am NOT claiming

- I am not claiming the redesign is easy. The shape change touches three files (AdDoc, HookPerformanceAggregate, VisualPerformanceAggregate) and the increment-vs-overwrite distinction is a careful refactor.
- I am not claiming the hypothesis is fully correct. The "ratio" representation is reasonable but the specific formula (cpa3d / effectiveTarget) has not been discussed. There are alternatives — for example, `min(cpa3d, target) / target` (a bounded ratio that caps at 1.0), or a per-vertex score that combines ratio + CTR + CPM.
- I am not claiming this should be implemented immediately. The owner asked for findings only; an implementation plan is a separate request.

---

## Appendix A — Raw grep output (verbatim, for evidence)

### `grep -n "funnelType" functions/src/learningAggregates.ts`
```
(no output — aggregator never sees funnelType)
```

### `grep -n "funnelType" functions/src/metaSync/shared.ts | grep -v "^//"`
```
617:                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
619:                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[${missing.join(",")}]`,
634:                    const funnelType = typeof data.funnelType === "string" ? data.funnelType : "unknown";
636:                        `funnel_settings_incomplete  workspaceId=${workspaceId} accountId=${accountId} funnelType=${funnelType} missing=[unknown]`,
```

### `grep -n "effectiveTarget" functions/src/learningAggregates.ts`
```
(no output — aggregator never sees effectiveTarget)
```

### `grep -n "effectiveTarget" functions/src/metaSync/shared.ts | grep -v "^//"`
```
880:        const target = funnelSettings ? getEffectiveTarget(funnelSettings.derived) ?? Infinity : Infinity;
```

(only one non-comment reference — the read site at verdict time.)

### `grep -n "cpa3d" functions/src/metaSync/shared.ts`
```
148:    cpa3d: number | null;
226:    cpa3d: number | null;
260:    const cpa3d = conversions3d > 0 ? spend3d / conversions3d : null;
274:        cpa3d,
868:            cpa3d: metrics.cpa3d,
947:            cpa3d: metrics.cpa3d,
```

### `grep -n "cpa3d" functions/src/learningAggregates.ts`
```
(no output — AdForLearning does not carry cpa3d)
```

### `grep -n "existingAdVerdict\|prevVerdict\|previousVerdict\|existingVerdict" functions/src/metaSync/shared.ts`
```
(no output — no prior-verdict comparison exists)
```

### `grep -n "cpa3d / effective\|cpa.*target\|target.*cpa\|cpaToTarget\|cpaRelative\|costRatio\|performanceRatio\|relative.*performance" functions/src/`
```
functions/src/qararEngine.ts:145: function cpa3dMatchesTarget(ad, target)
functions/src/qararEngine.ts:147:   return ad.cpa3d <= target;
functions/src/qararEngine.ts:338:     || (ad.conversions3d > 0 && cpa3dMatchesTarget(ad, target));
functions/src/qarEngine.ts:402:  cpa3dMatchesTarget(ad, target)
```

(only boolean `cpa3d <= target` checks; no ratio ever stored.)

### `grep -n "verdictEpoch\|evaluatedTarget\|evaluatedRatio\|targetAt" functions/src/`
```
(no output — none of these fields exist anywhere)
```

### `grep -n "byFunnelType\|funnelType.*aggregate" functions/src/`
```
(no output — no funnel-type partition on aggregates)
```

### `grep -n "bestVerdictCount\|worstVerdictCount" functions/src/whatsWorkingDashboard.ts`
```
466:                              countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
487:                          if (a._w !== b._w) return b._w - a._w;
645:                              countAr: makeCountAr(c.count, c.bestVerdictCount, "ar"),
663:                          if (a._w !== b._w) return b._w - a._w;
```

### `grep -n "OVERWRITE\|overwrite" functions/src/learningAggregates.ts`
```
165:    // OVERWRITE semantics: the returned aggregate is computed entirely from
167:    // the worker OVERWRITES the Firestore doc with the returned value —
184:    // This is the CRITICAL invariant: the same ad, processed in two
237:    // "Aggregates are NOT recomputed on delete", but the same
240:    // Firestore docs for the other angles are preserved untouched.
326:    // OVERWRITE semantics — same contract as
```

(6 references — all explicit OVERWRITE statements.)

### `grep -n "Aggregates are NOT recomputed\|AGGREGATES" functions/src/generationDeleteCascade.ts`
```
11:// AGGREGATES (hook + visual performance) are NOT recomputed — the already-
```

(the aggregate survives generation deletion — confirmed at line 11-12.)

### `grep -n "RAG_MIN_SAMPLE_SIZE" functions/src/ragContext.ts`
```
126:export const RAG_MIN_SAMPLE_SIZE = 10;
```

### `grep -n "insufficient\|sampleSize" functions/src/ragContext.ts | head -20`
```
83:  sampleSize: number;
84:  insufficient: boolean;
308:  const insufficient = sampleSize < RAG_MIN_SAMPLE_SIZE;
316:  const topPerformers = insufficient ? [] : sortSlice(...)
323:  const avoid = insufficient ? [] : avoidRanked.map(...)
342:  const visualTop = insufficient ? [] : sortSlice(visualRanked, ...)
343:  const visualAvoid = insufficient ? [] : sortSlice(...)
350:  const hookBlock = insufficient ? "" : buildHookBlockText(...);
351:  const visualBlock = insufficient ? "" : buildVisualBlockText(...);
356:  const captionBlock = insufficient ? "" : buildCaptionBlockText(...);
358:    if (insufficient) return "";
```

### `grep -n "funnelType" specs/phase-14/data-model.md`
```
28:  funnelType: 'paid_event' | 'free_webinar' | 'paid_product' | 'lead_magnet_call';
60:    computedAt: number;                      // epoch ms (passed in; never Date.now() at module load)
74:  lastReviewedAt: number;                    // epoch ms
137:  evaluatedAt: number;                       // epoch ms - winners ordered by this desc
```

(only the funnel-settings doc carries `funnelType` — not the aggregates.)

### `grep -n "funnelType" specs/968-funnel-economics-rebuild/data-model.md`
```
(no output — the funnel-economics-rebuild data-model does not touch learning aggregates)
```

---

## Appendix B — File index for the five files the owner asked to read

| File | Lines | What's there |
|---|---:|---|
| `functions/src/learningAggregates.ts` | 464 | Pure module. Exports `updateHookAggregates`, `updateVisualAggregates`, `computePatternKey`, plus the `HookPerformanceAggregate`, `VisualPerformanceAggregate`, `AdForLearning`, `LearningVerdict` types. OVERWRITE semantics. |
| `functions/src/qararEngine.ts` | 426 | Pure module. Exports `evaluateVerdict`, `diagnose`, plus the `VerdictResult`, `AdPerformanceForVerdict`, `FunnelSettingsForVerdict` types. Rule ladder: data gates → circuit breaker → kill rules → fatigue → S1 → default continue. |
| `functions/src/whatsWorkingDashboard.ts` | 875 | Firebase callable. Exports `getWhatsWorkingDashboard` (US6) and `getHookAnglePerformance` (US7). Reads `hookPerformance`, `visualPerformance`, `adPerformance`, `baselines`. |
| `functions/src/metaSync/shared.ts` | 1268 | The sync worker. Verdict computation happens here (line 904). Aggregate computation happens here (lines 1066-1082). Per-ad verdict write happens here (line 967). |
| `functions/src/ragContext.ts` | 573 | Pure RAG builder. Exports `buildRAGContext`, `getRAGContext`, `loadRAGContextForWorkspace`, plus four block builders. Reads `hookPerformance`, `visualPerformance`, `baselines` via `getRAGContext`. |

---

## Appendix C — The verdict engine's target usage, verbatim

`functions/src/qararEngine.ts:247`:
```ts
const target = getEffectiveTarget(settings.derived) as number;
```

And the S1 branch (lines 400-416):
```ts
if (isRuleAllowedForObjective("S1", bucket)) {
    if (
        cpa3dMatchesTarget(ad, target)
        && aboveAccountAverage(ad.ctrLink, baselines.linkCtr90d)
    ) {
        return {
            verdict: "🟢",
            ruleCode: "S1",
            reasonAr: REASON_S1,
            diagnosisAr: null,
            evaluatedAt: now,
        };
    }
}
```

`cpa3dMatchesTarget` (lines 145-148):
```ts
function cpa3dMatchesTarget(ad: AdPerformanceForVerdict, target: number): boolean {
    if (ad.cpa3d === null) return false;
    return ad.cpa3d <= target;
}
```

The boolean `ad.cpa3d <= target` is the only verdict-relevant target comparison. The result is an emoji, not a ratio. The `target` variable goes out of scope at function return.

---

## Appendix D — Why the existing verdict counts cannot be backfilled

The chain of irreversibility:

1. `evaluateVerdict` produces `verdict: "🟢"` from `cpa3d <= target`.
2. The emoji is stored on `adPerformance/{adId}.verdict`. The `target` value is not stored anywhere.
3. The next sync's `updateHookAggregates` reads the loop's ads (not the adPerformance docs), recomputes verdicts against the current target, and OVERWRITES the aggregate with the new counts.
4. There is no record of which target value produced which 🟢 count in any existing aggregate.
5. Without that record, "normalize" the existing counts to ratios: impossible.

The only way to make existing aggregates retroactively meaningful as ratios would be to keep a per-evaluation history of (target value, verdict emoji) — which would be a write-time decision the current code does not make.

The proposed fix (normalize at write time) requires the change to be implemented BEFORE new aggregates are written under the new schema; the existing aggregates remain frozen counts under the old schema.

---

## Summary

- **§1 — Stored shape:** `hookPerformance` and `visualPerformance` aggregates carry `avgLinkCtr`, `avgCpm`, `count`, `bestVerdictCount`, `worstVerdictCount`, partitioned by `(angleKey | patternKey) × objective × geoTier × audienceType`. **No `funnelType`, no `effectiveTarget`, no ratio.**
- **§2 — What is retained:** Raw `cpa3d` is on each `adPerformance` doc. The target value the verdict was computed against is **NOT retained anywhere**. The existing verdict counts cannot be backfilled to ratios.
- **§3 — Verdict write path:** The verdict is recomputed and overwritten on every sync against the current target. The aggregate's verdict counts use **OVERWRITE semantics** (not increment), so a target change that re-evaluates a 🟢 to a 🟡 causes the angle's `bestVerdictCount` to fall even though no historical record is "deleted" — the new sync just doesn't contribute to the same count.
- **§4 — Funnel-type awareness:** The aggregates do not partition by funnel type. The verdict counts are funnel-type-specific only as an emergent property of the write path (because the target is funnel-type-specific), not as a stored attribute.
- **§5 — RAG retrieval:** `RAG_MIN_SAMPLE_SIZE = 10` at line 126; sample size is the MAX of hook and visual conversion counts. Selection uses `avgLinkCtr` only (verdict counts are not selected). Already accumulates across funnel types at the structural level.
- **§6 — Dashboard reads:** Strongest Angles/Visuals use `avgLinkCtr` against `accountAvgLinkCtr` (cumulative-friendly). `bestVerdictCount` and `worstVerdictCount` are surfaced as text counts and used as tie-breakers. Four read sites at lines 466, 487, 645, 663.
- **§7 — Feasibility:** The normalization approach is **partially feasible**. The owner's hypothesis on the data model (a)/(b) is correct; (c) requires three coordinated changes (per-ad evaluatedTarget/evaluatedRatio + per-aggregate ratio sums + aggregator increment-vs-overwrite split). Existing verdict counts cannot be backfilled. The verdict-emoji overwrite behavior (every sync, against current target) is the closest thing to "reset on funnel-type change" in the current design and is what the redesign would need to eliminate.

---

End of investigation. Findings only. No implementation plan included, per the owner's request.
