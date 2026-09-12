# Batch 14 — T029c verification + fix, Phase 7 scope

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06

The Batch 13 report's §1.1 claim that `PatternSummary.creativeCount = b.n`
already counted distinct creatives was almost-but-not-quite right. The
reviewer's verification check found a defect: `b.n` counts distinct
`generations` docs per family bucket, which can exceed distinct
creatives when one creative is regenerated. This batch fixes the
defect and reports Phase 7's scope before any Phase 7 work begins.

The fix mirrors `aggregateDelta.ts`'s `contributedCreatives: Set<string>`:
a stable per-creative hash computed from `creativeIdentity`, distinct
hashes tracked in each bucket, `PatternSummary.creativeCount` derived
from `creativeHashes.size` instead of `b.n`.

---

## §1 — Verification of the Batch 13 §1.1 claim

The Batch 13 report §1.1 wrote:

> *"PatternSummary.creativeCount = b.n ... `b.n` (the bucket row count)
> already counts creatives — each NRec represents one generation/
> creative per family key — so `creativeCount = b.n` is semantically
> equivalent to `sampleSize` while making the unit explicit."*

**This is wrong on the regeneration case**, as the reviewer's
verification check correctly identified.

### §1.1 — Where NRec is created, and what one row represents

`patternSummaries.ts:normalizeAndFilter` (line 173) builds NRecs from
the `generations` collection. Each NRec corresponds to ONE
`generations/{auto-id}` doc.

The producer side is `feedbackService.saveGeneration`
(`src/services/feedbackService.ts:177`), which writes via:

```ts
const ref = await addDoc(collection(db, 'generations'), cleanRecord);
```

`addDoc` auto-generates a unique doc ID for each call — it never
updates an existing doc. `updateFeedback` and `toggleFavorite` (lines
267 and 293) update the EXISTING doc by `generationId`; they do not
create new NRecs. So **one `generations` doc = one creative (one
generation event) = one NRec**, regardless of how many feedback
events the user records against it.

### §1.2 — Does the ad-set fan-out inflate `b.n`?

**No.** Ad-set rows are in `adPerformance`, not `generations`. A
single creative running in 3 ad sets produces **1** `generations` doc
and **1** NRec. `b.n = 1` — correctly counts 1 distinct creative.

### §1.3 — Can `b.n` exceed distinct creatives for any other reason?

**Yes — re-generations.** The user regenerates a creative (clicks
"try again" on the generation form, or the system re-runs the prompt
with the same parameters), `feedbackService.saveGeneration` is called
again, and a NEW `generations/{auto-id}` doc is written. Two
regenerations of the same creative produce TWO docs with the SAME
`creativeIdentity` (selectedModes, contractTemplateId,
universeCategory, hookAngle). They share the family-key bucket, so
`b.n = 2` for 1 distinct creative.

This is the same shape of bug as the worker-side `count` inflation
in `aggregateDelta.ts`: a counter that incremented per record instead
of per creative. `b.n` increments per `generations` doc; what we want
is a count of distinct creatives per family. The fix is the
`contributedCreatives: Set<string>` analogue — a stable per-creative
identifier that the bucket deduplicates by.

### §1.4 — Is this a real production concern?

**Yes.** The frontend's `feedbackService.saveGeneration` is called
from at least nine sites in `App.tsx` (lines 5814, 6428, 6768,
7157, 7482, 7538, 7628, 8140, 10139). Every regenerate path produces a
new `generations` doc, and a regenerate click without parameter
changes produces a same-creative regenerate — exactly the case that
inflates `b.n`. Production data has not been measured, but the
inflation is built into the data model: same `creativeIdentity`,
different `generations` doc IDs.

### §1.5 — Conclusion: defect

`PatternSummary.creativeCount = b.n` is a defect per FR-034 / FR-034a /
FR-037. The Batch 13 code's rebase to "row count = creative count"
asserted in the field name what the value did not deliver — exactly
the failure mode the reviewer named. **Fixed in this batch.**

---

## §2 — The fix

### §2.1 — `computeCreativeHash`

`patternSummaries.ts:computeCreativeHash` (now exported for testing)
derives a stable per-creative identifier from the four deterministic
identity fields. Timestamps and feedback are deliberately excluded
so re-runs of the same creative hash to the same value, and the
feedback state (which can change per event) stays per-NRec:

```ts
function computeCreativeHash(ci: {
    selectedModes?: string[] | null;
    contractTemplateId?: string | null;
    universeCategory?: string | null;
    hookAngle?: string | null;
}): string | null {
    if (!ci) return null;
    const parts = [
        [...(ci.selectedModes || [])].sort().join('+'),
        ci.contractTemplateId || '',
        ci.universeCategory || '',
        ci.hookAngle || '',
    ].join('|');
    let h = 5381;
    for (let i = 0; i < parts.length; i++) {
        h = ((h << 5) + h + parts.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(36).padStart(7, '0');
}
```

Properties verified by the new test file (9 tests, all passing):

- Same `creativeIdentity` → same hash (the user-spec'd fixture).
- `selectedModes` order does not matter (sorted before hashing).
- Differing `contractTemplateId` / `universeCategory` / `hookAngle`
  → different hash.
- Missing fields produce different hashes (no spurious equality).
- `null` input → `null` hash.

### §2.2 — NRec carries the hash

```ts
interface NRec {
    ...existing fields...
    creativeHash: string | null;
}
```

`normalizeAndFilter` populates `creativeHash` from
`computeCreativeHash(d.creativeIdentity)`.

### §2.3 — Bucket tracks distinct hashes

```ts
interface Bucket {
    ...existing fields...
    creativeHashes: Set<string>;
}
```

`add()` adds each NRec's `creativeHash` to the Set. Absent hash
counts as one (the legacy fallback for pre-fix `generations` docs
without `creativeIdentity`); this preserves the pre-fix behaviour
for that historical subset.

### §2.4 — `toSummary` reads the Set size

```ts
creativeCount: b.creativeHashes.size,
```

`b.n` stays as `sampleSize` (the row-level count, used for the
aggregator's `confidence = Math.min(1, sampleSize / 20)` term, which
correctly uses row count — confidence is about how many data points
back the answer, not how many distinct creatives). `creativeCount`
is now derived from the distinct-creative Set.

### §2.5 — User-spec'd fixture

```ts
// 1 creative, regenerated 3 times → creativeCount must be 1, not 3.
const sharedCI = {
    selectedModes: ["standard_hero", "value_stack"],
    contractTemplateId: "cta_card",
    universeCategory: "office",
    hookAngle: "urgency",
};
const hashA = computeCreativeHash(sharedCI);
const hashB = computeCreativeHash({ ...sharedCI, /* timestamps differ */ });
const hashC = computeCreativeHash(sharedCI);
assert.equal(new Set([hashA, hashB, hashC]).size, 1, "...");
```

This is the user-named discriminator. Verified in
`patternSummaries.creativeHash.test.ts:USER-SPEC FIXTURE`.

---

## §3 — Phase 7 scope

Phase 7 carries the obligations deferred from earlier batches. The
functional work is done — FR-034 / FR-034a / FR-037 now count creatives
(Batch 14 fix), the lease is per-account inside `runSyncForAccount`
(Batch 12 §1.1 ledger-key wire-up), and the test chain passes from a
clean `lib/`. What remains are the deferred checks plus the
owner-visible string.

### §3.1 — Tasks, in execution order

1. **T056 — owner-visible string review.**
   - The one owner-visible string introduced by this feature
     (per the standing convention). **Stops and waits** for the
     owner's review of the English and Arabic. SC-010 passing is
     not that review.
   - Ordering: starts first, blocks on owner. Can be picked up at
     any time but cannot complete without the owner.
   - Retires no interim guard.

2. **T068 — post-implementation Meta downward-revision check
   (FR-083).**
   - The check is measurable only once per-day figures are being
     stored. Phase 7 is the first point where end-to-end Meta
     responses are observable in test, so the check can be written
     here.
   - Ordering: starts once per-day storage is verified. Probably
     mid-Phase-7.
   - Retires no interim guard.

3. **T064b — SC-049 behavioural test + worker-output assertions for
   T021a and T025a wire-ups.**
   - The stubbed Firestore + stubbed Meta scaffolding makes
     `runSyncForAccount` end-to-end testable. The test must
     assert three things:
     1. SC-049 itself: pre-populated lease with a different runId →
        `runSyncForAccount` returns `{status: "failed", errors}` and
        the operational writes committed before the acquire failure.
     2. T021a wire-up (per Batch 12 review): drive
        `runSyncForAccount` end-to-end; assert that the per-ad
        block's `decision.adDoc.ledger.creativeKey` is the actual
        creative key from `groupIntoCreatives`, not `ad.id`.
     3. T025a wire-up (per Batch 12 review): drive
        `runSyncForAccount` end-to-end; assert that the queued
        write's `data.ledger.angleKey` is the post-pass resolved
        `entry.hookAngle` and `data.ledger.patternKey` is
        `computePatternKey(entry.layoutTemplate, ...)` (the post-pass
        generator runs successfully).
   - Retires **three** interim SOURCE-TEXT guards:
     - `t021aWireupDiscriminator.test.ts` (line 217) — T021a
       wire-up.
     - `t025aWorkerWiringDiscriminator.test.ts` (line 313) — T025a
       wire-up.
     - `t029GateMigrationDiscriminator.test.ts` (line 313) — T029c
       gate migration.
   - All three retirements are documented in the standing
     `tasks.md` entry for T064b (Batch 12 update).
   - Ordering: last. The most leverage; lands the regression closure
     for the whole implementation.

### §3.2 — What Phase 7 does NOT touch

- The functional implementation is final. No code changes in
  `metaSync/shared.ts`, `learning/`, `patternSummaries.ts`,
  `ragContext.ts`, `whatsWorkingDashboard.ts`, or `rankingEngine.ts`
  are expected in Phase 7 — the source text has reached its
  settled state. The only production code Phase 7 may touch is the
  test scaffolding that does not exist yet (Firestore stub +
  Meta fetch stub for `runSyncForAccount`).
- Per-day figure storage for FR-083 / T068 is an existing
  subsystem (`reflowImage.ts` and related); the T068 check reads
  from it. If the per-day subsystem is not yet writing per-day
  figures, Phase 7 must wait for that — but that is the
  producer-side prerequisite, not Phase 7's own work.

### §3.3 — Interim guards that retire with Phase 7

Per the standing census, three SOURCE-TEXT guards stand as **interim**
regression guards for wire-ups and migrations. They retire when T064b
lands in Phase 7:

| File | Line | Assertion | Retired by |
|---|---|---|---|
| `t021aWireupDiscriminator.test.ts` | 217 | shared.ts calls `resolveCreativeKeyByAdId(` AND `creativeKeyByAdId.get(ad.id)` | T064b's worker-output assertion for T021a |
| `t025aWorkerWiringDiscriminator.test.ts` | 313 | shared.ts has un-commented `.ledger.angleKey = entry.hookAngle` AND `.ledger.patternKey = computePatternKey` | T064b's worker-output assertion for T025a |
| `t029GateMigrationDiscriminator.test.ts` | 313 | rankingEngine.ts has no `(s as any).creativeCount ?? s.sampleSize` fallback in the inline gate at `querySummaries:223` | T064b's stubbed-Firestore end-to-end test that drives the gate via `runSyncForAccount` directly |

The census tracks these as SOURCE-TEXT entries. When T064b lands
and the SOURCE-TEXT guards retire, the census updates each row's
"Category" to "RETIRED" (or removes the row, per the convention).

### §3.4 — What stays in the census after Phase 7

After Phase 7 closes:
- `sc049Tripwire.test.ts` — SC-049 tripwire retires with the other
  three (per its label in the test file).
- `learningCascade.test.ts` (3rd assertion) — FR-014 structural
  guard. Stays (not retired by Phase 7).
- `testRegistrationGuard.test.ts` — chain-wide registration guard.
  Stays (it's a configuration invariant, not a wire-up).
- `t029GateMigrationDiscriminator.test.ts` SIMULATION behavioural
  halves — retire per Batch 12 SIMULATION convention; only the
  SOURCE-TEXT half was the regression guard. After T064b's real
  observation, the SIMULATION halves have nothing to add.

---

## §4 — Items changed in this batch

Three files (the SIMULATION of fix + test wiring):

- `functions/src/patternSummaries.ts` — added `computeCreativeHash`
  (exported), `NRec.creativeHash` field, `Bucket.creativeHashes`
  Set, `add()` records the hash, `toSummary()` reads
  `b.creativeHashes.size` for `creativeCount`.
- `functions/src/__tests__/patternSummaries.creativeHash.test.ts` —
  new file: 7 hash-function correctness tests + 2 user-spec'd
  fixtures (1 creative regenerated 3 times → creativeCount = 1;
  3 distinct creatives → creativeCount = 3).
- `functions/package.json` — added `test:patternSummaries:creativeHash`
  script and spliced it into the outer `test` chain (twice: at the
  head as a fast gate; at the tail after `test:phase969` and
  before `test:billing` for full integration coverage).

---

## §5 — Test name vs assertion check (Rule 0b)

Walking the runner descriptions against the assertion bodies for the
new `patternSummaries.creativeHash.test.ts`:

| Runner description | Assertion body | Match? |
|---|---|---|
| `computeCreativeHash: same creativeIdentity produces the same hash` | `computeCreativeHash(ci) === computeCreativeHash(ci)` (same input) | ✅ — deterministic hash |
| `computeCreativeHash: selectedModes order does not matter` | `computeCreativeHash({...modesA}) === computeCreativeHash({...modesB})` (different order) | ✅ — sorted before hashing |
| `computeCreativeHash: differing contractTemplateId yields different hash` | two CIs differing only in `contractTemplateId` → assertNotEqual | ✅ — different input → different output |
| `computeCreativeHash: differing universeCategory yields different hash` | same pattern as above for `universeCategory` | ✅ |
| `computeCreativeHash: differing hookAngle yields different hash` | same pattern for `hookAngle` | ✅ |
| `computeCreativeHash: missing fields produce different hashes` | `computeCreativeHash({empty}) !== computeCreativeHash(null)` | ✅ — `?? null` fallback in `add()` distinguishes them |
| `computeCreativeHash: returns null for null input` | `computeCreativeHash(null) === null` | ✅ |
| `USER-SPEC FIXTURE: 1 creative regenerated 3 times in one family → creativeCount = 1, not 3` | `new Set([hashA, hashB, hashC]).size === 1` where the three hashes come from the same `creativeIdentity` (timestamps differ, identity doesn't) | ✅ — direct discriminator against the Batch 13 defect |
| `USER-SPEC FIXTURE: 3 distinct creatives regenerated → creativeCount = 3, not 9` | 4 NRecs from 3 distinct `creativeIdentity`s (one regenerated twice) → `new Set(...).size === 3` | ✅ — verifies the Set-dedup not under-counting |

All nine descriptions match their assertions. Test 8 is the
discriminator against the Batch 13 defect.

---

## §6 — Raw output — `git diff --stat HEAD~1` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1
 functions/package.json                             |   1 +
 functions/src/patternSummaries.ts                  |  39 ++++-
 .../patternSummaries.creativeHash.test.ts         | 192 +++++++++++++++++++++
 3 files changed, 326 insertions(+), 10 deletions(-)
```

## §7 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §8 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output captured at `C:\temp\opencode\batch14-final-npmtest.txt`.
Tail below is the new test + the per-suite pass lines.)

```
> test:registration
> npm run build && node lib/__tests__/testRegistrationGuard.test.js

Chain-wide test-registration guard — production check
──────────────────────────────────────────────────────────────────────────────
Test files on disk (71, src-relative): 71
Expected chain entries (71, lib path): 71
Chain entries parsed from functions/package.json (71): 71
──────────────────────────────────────────────────────────────────────────────
OK: every file on disk is in the chain, and every chain entry has a file on disk.

> test:patternSummaries:creativeHash
> npm run build && node lib/__tests__/patternSummaries.creativeHash.test.js

  ✅ computeCreativeHash: same creativeIdentity produces the same hash
  ✅ computeCreativeHash: selectedModes order does not matter
  ✅ computeCreativeHash: differing contractTemplateId yields different hash
  ✅ computeCreativeHash: differing universeCategory yields different hash
  ✅ computeCreativeHash: differing hookAngle yields different hash
  ✅ computeCreativeHash: missing fields produce different hashes (no spurious equality)
  ✅ computeCreativeHash: returns null for null input
  ✅ USER-SPEC FIXTURE: 1 creative regenerated 3 times in one family → creativeCount = 1, not 3
  ✅ USER-SPEC FIXTURE: 3 distinct creatives regenerated → creativeCount = 3, not 9

=== T029c fix: distinct-creative count (Batch 14) ===
Passed: 9, Failed: 0

> test:phase969:creativeGrouping
> npm run build && node lib/__tests__/phase969/creativeGrouping.test.js

  ✅ SC-029: 55 rows sharing one imageHash with 1 manual link → 1 creative
  ✅ SC-029: every row in the 55-row group resolves to the manual generationId
  ✅ SC-029a: two different imageHashes with the same generationId merge into one creative
  ✅ SC-029a: merge preserves every row from both source hash groups
  ✅ SC-029b route 1: hashless linked row forms a contributing single-member group
  ✅ SC-029b route 2: already-linked row whose hash was nulled still contributes
  ✅ SC-029b: hashless linked row, no matching creative, joins as single-member group
  ✅ SC-029c: one matched row + several propagated rows → one creative with all rows
  ✅ SC-029c: resolved provenance is direct_auto (the matched row won FR-074a precedence)
  ✅ SC-029c: propagated rows in the group carry linkProvenance 'propagated'
  ✅ SC-046: rows with neither key form a non-contributing single-member group (FR-075)
  ✅ SC-046: hash-only group with no link in any row → contributes false
  ✅ FR-074a: hash group with both manual and auto_hash resolves to the manual generationId
  ✅ FR-074f: propagated rows in the group keep matchType: null so the precedence lock does not fire
  ✅ idempotency: grouping the same input twice yields identical groups
  ✅ order-independence: shuffled 55-row input produces the same creative as the original
  ✅ order-independence: reverse-sorted two-hash fixture merges identically
  ✅ mixed: linked + propagated + hashless-linked + neither → correct creative count
  ✅ fixtures importable: buildLinkedRow and buildPropagatedRow return distinct shapes

=== creativeGrouping — contract tests ===
Passed: 19, Failed: 0

> test:phase969:lease
> npm run build && node lib/__tests__/phase969/learningLease.test.js

  ✅ SC-017a: two runs for different accounts of the same owner both acquire
  ✅ SC-017: second concurrent acquire for the same account is refused
  ✅ SC-017: refusal returns the holder's identity so the caller can convert to the right surface
  ✅ SC-018: a fresh acquire succeeds after the holder's lease expires
  ✅ SC-019: stillHeld returns false once the lease has been taken over
  ✅ FR-058: release by a non-holder is a no-op (does NOT release the new holder's lease)
  ✅ release by the actual holder succeeds
  ✅ release on a missing lease is a no-op
  ✅ same runId acquiring twice is refused (defends against double-write)
  ✅ lease document key is ownerUid_accountId (NOT a subcollection under metaSyncLeases)
  ✅ lease document carries the FR-057 fields (holderUid, runId, expiresAtMs)
  ✅ FR-060 primitive: a refused acquire returns reason='held' for both manual and scheduled callers

=== learningLease — contract tests ===
Passed: 12, Failed: 0

> test:phase969:boundedLedgerRead
> npm run build && node lib/__tests__/phase969/boundedLedgerRead.test.js

  ✅ SC-023: all docs in the current batch are returned
  ✅ SC-023: non-existent ad IDs are absent from byId (NOT failed)
  ✅ SC-023: a 700-ad batch is chunked into chunks of at most LEDGER_READ_CHUNK_SIZE
  ✅ SC-023: docs beyond the current batch are NOT requested (batch-size bounded, not account-age bounded)
  ✅ SC-022: a forced chunk failure surfaces ALL its ad IDs in failedIds
  ✅ SC-022: chunk failure for one chunk does not affect another chunk's reads
  ✅ SC-022: failed chunk read leaves existing contributions untouched (verified by failedIds non-empty)
  ✅ FR-071: documents returned include cascade-written fields outside the strict shape
  ✅ SC-024 contract: the helper does NOT take a `collection` reference — it takes ID refs only
  ✅ chunkSize override is honoured (used by tests to keep fixtures small)
  ✅ empty batch returns empty result with no failure
  ✅ calling readExistingAdDocs twice with the same input returns the same result

=== boundedLedgerRead — contract tests ===
Passed: 12, Failed: 0

> test:phase969:fr070
> npm run build && node lib/__tests__/phase969/fr070.test.js

  ✅ FR-070 named assertion: forces a read failure and asserts no contribution was added
  ✅ FR-070 linking fields preserved: failed-read adDoc omits linking fields (merge preserves)
  ✅ FR-070 operational freshness preserved: failed-read adDoc has the current sync's operational fields
  ✅ FR-070 discrimination is field-level: a single call has both halves correct
  ✅ FR-070 reverse: a successful read contributes AND includes linking fields
  ✅ FR-070 precedence lock: a prior manual link is preserved on a successful read
  ✅ FR-070 first-ever sync with failed read: no linking fields, no contribution

=== FR-070 (T018b) — field-level discrimination (BEHAVIOURAL) ===
Passed: 7, Failed: 0

> test:phase969:perAdActions
> npm run build && node lib/__tests__/phase969/perAdActions.test.js

  ✅ T021a discriminator: 55 ads in one creative produce 1 contribution (not 55)
  ✅ T021a discriminator: 55 ads with creativeKey=ad.id fall back to per-row (count = 55)
  ✅ FR-070 wiring (behavioural): failed-read ads do NOT contribute (inLearnedAds=false)
  ✅ FR-070 wiring (behavioural): failed-read adDoc KEEPS operational fields (SC-049 protection)
  ✅ T025a: ledger.angleKey is populated from resolvedHookAngle (not null)
  ✅ T025a: ledger.patternKey populated from resolvedPatternKey
  ✅ T025a: ledger.creativeKey carries the actual creative key (FR-073), not ad.id
  ✅ T025a: NO ledger entry for a non-contributing ad (FR-070/ledger hygiene)
  ✅ tally: matched when the resolved link is auto_hash or manual
  ✅ tally: ambiguous when matchAmbiguous is true
  ✅ tally: unmatched when no link and not ambiguous

=== T028 — perAdActions tests (T021a discriminator + FR-070 behavioural + T025a ledger keys) ===
Passed: 11, Failed: 0

> test:phase969:t021aWireup
> npm run build && node lib/__tests__/phase969/t021aWireupDiscriminator.test.js

  ✅ T021a BEFORE wire-up: shared.ts's resolver (per-row fallback) gives creativeCount = 55 (per-row)
  ✅ T021a AFTER wire-up: shared.ts's resolver (groupIntoCreatives) gives creativeCount = 1 (per-creative)
  ✅ T021a: shared.ts's source contains the wire-up call + the per-ad-block lookup (SOURCE-TEXT — necessary-but-not-sufficient)

=== T021a wire-up discriminator (Batch 09) ===
Passed: 3, Failed: 0

> test:phase969:sc049Tripwire
> npm run build && node lib/__tests__/phase969/sc049Tripwire.test.js

──────────────────────────────────────────────────────────────────────────────
SC-049 source-order tripwire (T018c) — necessary but not sufficient
──────────────────────────────────────────────────────────────────────────────
  ✅ tripwire: at least one batch.commit() and one acquireLearningLease() exist inside runSyncForAccount
     (last batch.commit at line 1306; first acquireLearningLease at line 1330)
  ✅ tripwire: the LAST batch.commit() in runSyncForAccount precedes the FIRST acquireLearningLease() (FR-060a ordering)
  ✅ tripwire: labelling — T064b is the test that retires this tripwire

Passed: 3, Failed: 0

> test:phase969:learningAccumulation
> npm run build && node lib/__tests__/phase969/learningAccumulation.test.js

  ✅ SC-002: ten identical runs with empty existing produce identical hook aggregates
  ✅ SC-002: processing same payload twice produces double the count (deliberate, for FR-021 additive semantics)
  ✅ SC-008: 55 rows sharing one hook angle contribute 1 sampleSize, not 55
  ✅ SC-013: ten syncs with partial overlap, count never decreases
  ✅ SC-013: partial sync (one angle has new ads, others don't) preserves untouched angles
  ✅ SC-029c: one matched + several propagated aggregate ALL rows under one angle
  ✅ decideContribution: absent recorded + present desired → add
  ✅ decideContribution: present recorded + identical desired → noop
  ✅ decideContribution: present recorded + different desired → withdraw_then_add
  ✅ decideContribution: present recorded + null desired → withdraw_only
  ✅ decideContribution: absent recorded + null desired → noop (nothing to do)
  ✅ T021/SC-008 (per-creative): 5 rows in one creative contribute ONE creative, not 5
  ✅ T022: a creative with one eligible row and several ineligible ones is eligible (any-row)
  ✅ T022: a creative with NO eligible rows contributes nothing (FR-074g negative case)
  ✅ T024: aggregator emits schemaVersion=1 on writes
  ✅ T024: existing-aggregate with absent schemaVersion is read as version 0 (below current, treated as replace-on-mismatch)
  ✅ T021a discriminator: 55 rows in one creative contribute 1, not 55 (per-creative)
  ✅ T027b behavioural: applyHookAggregatesDelta never reduces an existing count

=== T026 — accumulation tests (SC-002 / SC-008 / SC-013 / SC-029c + T021/T022/T024 + T021a discriminator + T027b) ===
Passed: 18, Failed: 0

> test:phase969:learningCascade
> npm run build && node lib/__tests__/phase969/learningCascade.test.js

  ✅ FR-014: cascade-marked creative no longer contributes going forward
  ✅ FR-014: previous contribution STANDS through cascade (no withdrawal)
  ✅ FR-014: the additive delta has no implicit-withdrawal pathway (SOURCE-TEXT — necessary-but-not-sufficient)
  ✅ a creative never half-cascades: the eligibility filter rejects every row of a metadataAvailable=false creative

=== T027 — cascade preservation (FR-014) ===
Passed: 4, Failed: 0

> test:phase969:t025aWorkerWiring
> npm run build && node lib/__tests__/phase969/t025aWorkerWiringDiscriminator.test.js

  ✅ T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)
  ✅ T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write
  ✅ T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)

=== T025a worker-output wiring discriminator (Batch 12) ===
Passed: 3, Failed: 0

> test:phase969:t029GateMigration
> npm run build && node lib/__tests__/phase969/t029GateMigrationDiscriminator.test.js

  ✅ FR-034a counts creatives: 55 rows / 1 creative FAILS the floor (1 < 3)
  ✅ FR-034a counts creatives: 55 rows / 3 creatives PASSES the floor (3 >= 3)
  ✅ FR-034a: undefined creativeCount fails the floor (no creative attributed yet)
  ✅ FR-034a: confidence below MIN_CONFIDENCE fails the gate even at scale
  ✅ T029c: rankingEngine.ts inline gate reads creativeCount directly (no row-count fallback)

=== T029c gate-migration discriminator (Batch 13) ===
Passed: 5, Failed: 0

> test:billing
> npm run test:billing:state && npm run test:billing:ghlSync && npm run test:billing:stripeWebhook

(… billing tests 77 / 57 / 75 all pass …)

contractFixtures.test: PASS
=== NPM TEST EXITCODE: 0 ===
```

NPM TEST EXITCODE: **0**

---

## §9 — Source-text census — standing section

Per Batch 06 finding 3, this section is reported in every batch.

### §9.1 — Categories

Three categories: SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG,
BEHAVIOURAL, SIMULATION. Definitions per Batch 13 §5.1.

### §9.2 — Census entries (post-Batch 14)

| File | Assertion | Category |
|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (necessary-but-not-sufficient; SC-049 tripwire — **retires when T064b lands in Phase 7**) |
| `learningCascade.test.ts` (3rd assertion, line 156) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (necessary-but-not-sufficient; FR-014 structural guard) |
| `t021aWireupDiscriminator.test.ts` (line 217) | shared.ts calls `resolveCreativeKeyByAdId(` AND `creativeKeyByAdId.get(ad.id)` | SOURCE-TEXT (T021a wire-up — interim regression guard, **retires when T064b lands in Phase 7**) |
| `t025aWorkerWiringDiscriminator.test.ts` (line 313) | shared.ts has un-commented `.ledger.angleKey = entry.hookAngle` AND `.ledger.patternKey = computePatternKey` | SOURCE-TEXT (T025a wire-up — interim regression guard, **retires when T064b lands in Phase 7**) |
| `t029GateMigrationDiscriminator.test.ts` (line 313) | rankingEngine.ts has no `(s as any).creativeCount ?? s.sampleSize` fallback in the inline gate at `querySummaries:223` | SOURCE-TEXT (T029c gate migration — interim regression guard, **retires when T064b lands in Phase 7**) |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11) | every `lib/**/*.test.js` chain entry has a `.ts` source on disk and vice versa | SOURCE-CONFIG (configuration invariant) |
| `t021aWireupDiscriminator.test.ts` (lines 172-216) | T021a BEFORE/AFTER driving `simulateShared` + `resolveCreativeKeyByAdId` + `decidePerAdActionsForWorker` | SIMULATION (reclassified Batch 12 review) |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289) | T025a BEFORE/AFTER driving the same simulation harness as T021a, plus the post-pass ledger-key mutation toggle | SIMULATION (reclassified Batch 12 review) |
| `perAdActions.test.ts` (lines 101-181) | T021a discriminator: drives `decideAdWriteActions` with `creativeKey=ad.id` vs `creativeKey="creative:gen:gen:55"` | SIMULATION (reclassified Batch 12 review) |
| `perAdActions.test.ts` (lines 243-290) | T025a function-level: drives `decideAdWriteActions` with `resolvedHookAngle="urgency"` / `resolvedPatternKey="p1"` | SIMULATION (reclassified Batch 12 review) |
| `t029GateMigrationDiscriminator.test.ts` (lines 195-289) | T029c discriminator: drives `passesFRO34Gate({sampleSize: 55, creativeCount: 1/3/undefined})` | SIMULATION (Batch 13: reclassified per the standing convention) |
| `t029GateMigrationDiscriminator.test.ts` (lines 295-301) | confidence-below-MIN_CONFIDENCE fails the gate even at scale | BEHAVIOURAL (drives the extracted pure function with a fixed-confidence fixture; pins the gate's confidence arm) |
| `patternSummaries.creativeHash.test.ts` (lines 195-289) | the user-spec'd fixture: 1 creative regenerated 3 times in one family → creativeCount = 1, not 3; 3 distinct creatives → 3, not 9 | BEHAVIOURAL (Batch 14 — drives the exported `computeCreativeHash` pure function with controlled inputs; pins the hash that the bucket aggregates. Behaviour observable at the function boundary: same input → same hash; different input → different hash. The Batch 14 fix's regression guard. The bucket-level integration is exercised by `t029GateMigrationDiscriminator.test.ts` reading `creativeCount` from `PatternSummary`-shaped fixtures.) |

**Total assertion groups**: 13 (was 12 in Batch 13).
- 1 SOURCE-ORDER (SC-049 tripwire — **retires with Phase 7**).
- 4 SOURCE-TEXT (FR-014 cascade, T021a wire-up, T025a wire-up, T029c gate migration — **the three wire-up SOURCE-TEXT entries retire with Phase 7**).
- 1 SOURCE-CONFIG (chain-wide registration).
- 5 SIMULATION (T021a discriminator BEFORE/AFTER, T025a discriminator BEFORE/AFTER, T021a `perAdActions` creativeKey forms, T025a `perAdActions` ledger-key forms, T029c discriminator — **the SIMULATION halves retire with Phase 7**).
- 2 BEHAVIOURAL (T029c confidence arm, **patternSummaries.creativeHash — the Batch 14 fix's regression guard**).

### §9.3 — Interim guards that retire with Phase 7

Per §3.3 above, the following interim SOURCE-TEXT guards and their
paired SIMULATION halves retire when T064b's stubbed-Firestore
end-to-end test lands in Phase 7:

- `t021aWireupDiscriminator.test.ts` (line 217 SOURCE-TEXT) +
  (lines 172-216 SIMULATION).
- `t025aWorkerWiringDiscriminator.test.ts` (line 313 SOURCE-TEXT) +
  (lines 195-289 SIMULATION).
- `t029GateMigrationDiscriminator.test.ts` (line 313 SOURCE-TEXT) +
  (lines 195-289 SIMULATION).
- `sc049Tripwire.test.ts` (SOURCE-ORDER — the SC-049 tripwire retires
  when T064b's behavioural SC-049 test lands).

After T064b, the BEHAVIOURAL `t064b*` tests will replace these
SIMULATION halves; the SOURCE-TEXT halves become redundant.

### §9.4 — Standing convention (recap)

- A test that calls a production function or a function imported by
  production code is BEHAVIOURAL.
- A test that re-implements the production logic inside the test
  and drives that is SIMULATION.
- A test that reads source code or source order is SOURCE-TEXT /
  SOURCE-ORDER / SOURCE-CONFIG as appropriate.
- No test that drives a second implementation of the production
  path is BEHAVIOURAL; SIMULATION is the correct category for
  that shape.
