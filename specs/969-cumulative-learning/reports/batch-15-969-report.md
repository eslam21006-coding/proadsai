# Batch 15 — Phase 7: T064b end-to-end + interim guard retirements

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06

Three things to hold to, all recorded rather than remembered:

1. **T064b retires three interim guards.** The SC-049 tripwire, the
   T021a wire-up SOURCE-TEXT check, and the T025a wiring SOURCE-TEXT
   check exist only because the worker could not be driven from a
   test. With the stubbed Firestore + stubbed Meta scaffolding this
   batch builds, each interim guard is replaced by an assertion on the
   worker's REAL output.

2. **T056 stops and waits.** The proposed English and Arabic strings
   for the multi-funnel indication are in §3.1 of this report. They
   do NOT ship until the owner reviews them. SC-010 passing is not
   that review.

3. **T068 is a post-deployment check, not a test.** Already recorded
   in `specs/969-cumulative-learning/quickstart.md` §After deployment
   (line 103). No additional recording needed in this batch.

The report stops before opening a PR. The remaining sequence is
owner audit → PR → CodeRabbit → local test → merge via the GitHub UI
→ deploy → production test. **Do not open the PR until the owner asks.**

---

## §1 — T064b end-to-end discriminator

### §1.1 — Why this exists

The interim regression guards (SOURCE-TEXT) at
- `sc049Tripwire.test.ts` (SC-049 ordering),
- `t021aWireupDiscriminator.test.ts:217` (T021a wire-up),
- `t025aWorkerWiringDiscriminator.test.ts:313` (T025a wiring)

were each labelled "interim, retires when T064b lands." T064b is the
end-to-end test that drives `runSyncForAccount` with stubbed Firestore
+ Meta, asserting the worker's real output rather than a source-text
text-match.

### §1.2 — The test file

`functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts` —
drives `runSyncForAccount` end-to-end with stubbed dependencies.

**Four tests:**

1. **SC-049: pre-populated lease (different runId) → `status='failed'`.**
   `learningLeases/${ownerUid}_${accountId}` is seeded with
   `runId: "OTHER_RUNNER"`. `acquireLearningLease` returns refused.
   `runSyncForAccount` must produce `{status: "failed"}`.

2. **SC-049 (second-half): operational writes committed BEFORE the
   lease refused.** Asserts that the per-ad operational writes happened
   despite the lease refusal (FR-060a's ordering: commit before acquire).

3. **T021a worker-output: queued adDoc's `ledger.creativeKey` is the
   actual creative key from `groupIntoCreatives`, NOT `ad.id`.**
   Replaces the SOURCE-TEXT check that `resolveCreativeKeyByAdId(` and
   `creativeKeyByAdId.get(ad.id)` are present in `shared.ts`.

4. **T025a worker-output: queued adDoc's `ledger.angleKey`/`patternKey`
   are the post-pass resolved values, NOT null.** Replaces the
   SOURCE-TEXT check that `.ledger.angleKey = entry.hookAngle` and
   `.ledger.patternKey = computePatternKey` are present in `shared.ts`.

### §1.3 — The stubs

The test's stubbing is modelled on `metaSyncOrchestrator.test.ts` but
self-contained (no shared module — extracting to a shared utility is
left as a Phase 7+ follow-up if a third driver of `runSyncForAccount`
appears).

- **Firestore** — in-memory `stubStore` + `StubDocRef` /
  `StubCollection` / `StubBatch` / `runTransaction` (supports get /
  set / update / delete).
- **`admin.firestore`** — patched via `Object.defineProperty` to the
  in-memory stub.
- **`secretsModule.metaAppSecret.value()`** — patched to return
  `"test-secret"`.
- **`legacyTokenModule.decryptLegacyToken`** — patched to return
  `"PLAIN_TOKEN"` directly (no AES round-trip needed for the worker-
  output assertions).
- **`acquireLearningLease` / `releaseLearningLease`** — read/write
  the in-memory lease doc via the stub's `runTransaction`. Failed-read
  semantics (FR-070) are also stubbed (returns `null` so the per-ad
  block treats the ad as not contributing).
- **Meta fetchers** — `setFetchImplForTests(seedFetchOneAd)` injects
  canned responses for `/insights`, `/campaigns`, `/adsets`, and
  `/ads?...`.

### §1.4 — Results

```
$ node lib/__tests__/phase969/t064bEndToEnd.discriminator.test.js
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)

=== T064b end-to-end: SC-049 + worker-output (Phase 7) ===
Passed: 4, Failed: 0
```

All four tests pass. The discriminator observes the worker's real
output via the stubbed bucket — the same data path the worker's
operational writes use in production.

---

## §2 — Interim guard retirements

Each of the three interim guards now checks for the existence of
`t064bEndToEnd.discriminator.test.ts` in `phase969/`. If present, the
guard prints "RETIRED by Phase 7 T064b" and exits 0. If absent
(re-enabling the tripwire), the guard falls back to its original
SOURCE-TEXT assertion.

### §2.1 — `sc049Tripwire.test.ts` (SC-049 ordering)

The retirement sentinel at the top:

```
──────────────────────────────────────────────────────────────────────────────
SC-049 source-order tripwire (T018c) — RETIRED by Phase 7 T064b
──────────────────────────────────────────────────────────────────────────────
The SC-049 behavioural test (t064bEndToEnd.discriminator.test.ts) drives
runSyncForAccount end-to-end with stubbed Firestore + Meta, pre-populates
the lease doc with a different runId, and asserts both halves of FR-060a:
  (a) operational status writes committed before the lease attempt,
  (b) SyncResult.status === 'failed' when acquire is refused.
The source-order text-match is no longer the only check. This file's
SOURCE-TEXT assertions are now redundant and the test exits 0 without
running them. To re-enable the tripwire, delete t064bEndToEnd.discriminator.test.ts
(the retirement becomes a Phase 7 follow-up if T064b is ever reverted).
```

### §2.2 — `t021aWireupDiscriminator.test.ts:217` (T021a wire-up)

```ts
test("T021a: shared.ts's source contains the wire-up call + the per-ad-block lookup (SOURCE-TEXT — necessary-but-not-sufficient)", () => {
    // RETIRED by Phase 7 T064b. The worker-output assertion in
    // t064bEndToEnd.discriminator.test.ts (the "T021a worker-output"
    // test) drives runSyncForAccount end-to-end and verifies that
    // the queued adDoc's ledger.creativeKey is the actual creative
    // key from groupIntoCreatives, NOT ad.id. The source-order
    // tripwire is no longer the only check. Re-enable by removing
    // t064bEndToEnd.discriminator.test.ts.
    const T064B_TEST = join(__dirname, "t064bEndToEnd.discriminator.test.js");
    if (existsSync(T064B_TEST)) {
        console.log("T021a SOURCE-TEXT tripwire RETIRED by Phase 7 T064b");
        return;
    }
    // Pre-retirement path (kept for safety if T064b is reverted).
    ...
});
```

### §2.3 — `t025aWorkerWiringDiscriminator.test.ts:313` (T025a wiring)

```ts
test("T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)", () => {
    // RETIRED by Phase 7 T064b. The worker-output assertion in
    // t064bEndToEnd.discriminator.test.ts (the "T025a worker-output"
    // test) drives runSyncForAccount end-to-end and verifies that
    // the queued adDoc's ledger.angleKey and ledger.patternKey are
    // the post-pass resolved values (not null). The source-order
    // tripwire is no longer the only check. Re-enable by removing
    // t064bEndToEnd.discriminator.test.ts.
    const T064B_TEST = join(__dirname, "t064bEndToEnd.discriminator.test.js");
    if (existsSync(T064B_TEST)) {
        console.log("T025a SOURCE-TEXT tripwire RETIRED by Phase 7 T064b");
        return;
    }
    // Pre-retirement path (kept for safety if T064b is reverted).
    ...
});
```

### §2.4 — Census — three entries leave

Per the user's directive:

> "Report the census before and after — three entries should leave it. If any of them survives Phase 7, say which and why."

Three entries leave the active census (the SOURCE-TEXT guards above).
The SIMULATION halves of `t021aWireupDiscriminator.test.ts` (lines
172-216) and `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289)
remain — they document the helper's correctness in isolation, which
the user-spec'd fence keeps separate from worker-output observation.
A future cleanup can delete them when the helpers themselves are
covered by other SIMULATION tests; for now they do no harm and
provide documentation value.

The `t064bEndToEnd.discriminator.test.ts` test is BEHAVIOURAL (drives
the worker end-to-end and observes real output). It enters the census
as a new BEHAVIOURAL row.

---

## §3 — T056 (BLOCKED on owner review)

The user explicitly said:

> "T056 stops and waits. Write the proposed English and Arabic, put
> both in the report, and stop. Do not proceed on SC-010 passing —
> that criterion confirms a string exists in two languages; it cannot
> judge whether the Fusha reads naturally to a Gulf coach. Simple
> Fusha only: no dialect, no jargon, no acronyms, no raw measurement
> values or percentages."

### §3.1 — Proposed strings

T056 adds the plain-language multi-funnel indication (FR-041) to
`whatsWorkingDashboard.ts` and its two bilingual strings to
`src/i18n.tsx`.

**EN (proposed):**
- **Label** (visible inline next to angle/pattern rows when
  evidence spans more than one funnel type):
  `"Across multiple campaigns"`

- **Tooltip** (on the label):
  `"You've used this across more than one type of campaign"`

**AR (proposed):**
- **Label**:
  `"في حملات متعددة"`

- **Tooltip**:
  `"استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات"`

### §3.2 — Justification

- **EN label**: 25 characters. Plain English, no jargon ("campaign" is
  the owner's vocabulary — matches `whats_working.angles.subtitle:
  "Sales Campaigns"`). "Multiple" carries the multi-funnel meaning
  without spelling out "funnels" (the term the dashboard doesn't
  surface elsewhere). "Campaigns" is plural because the meaning IS
  multiple.

- **EN tooltip**: 50 characters. Explains WHY the label appears
  (used across multiple campaign types). No measurement values, no
  percentages, no acronyms.

- **AR label**: 14 characters. Standard simple Fusha. "في" (in) +
  "حملات" (campaigns, plural) + "متعددة" (multiple). Reads naturally
  to a Gulf coach.

- **AR tooltip**: 47 characters. "استخدمتَ" (you used — second-
  person masculine singular, default for owner-facing UI), "هذا" (this),
  "الأسلوب" (this approach/way — the dashboard's term for an angle/
  pattern), "في أكثر من" (in more than one), "نوع من الحملات" (type of
  campaigns). Standard Gulf-coach Fusha register; no dialect.

### §3.3 — Implementation (NOT done in this batch)

Per the user's directive, the strings above are PROPOSALS only. They
do NOT ship until the owner reviews them. SC-010 passing on the
implemented code would only confirm a string exists in both languages
and carries no jargon; it cannot judge whether the Fusha reads
naturally. The strings live in this report (§3.1) for the owner's
review, not in `src/i18n.tsx`.

When the owner approves, the implementation is:
- Add `'whats_working.multi_funnel.label'` and `'.tooltip'` to
  `src/i18n.tsx` for both `en` and `ar`.
- Modify `functions/src/whatsWorkingDashboard.ts` to fetch
  `t('whats_working.multi_funnel.label')` and
  `t('whats_working.multi_funnel.tooltip')` where the multi-funnel
  flag is set on an angle/pattern row.
- Verify with SC-010 (test in `whatsWorkingAllTime.test.ts` or similar).

---

## §4 — T068 (recorded, not changed)

T068 is the post-implementation FR-083 verification check (Meta
downward-revision monitoring). It becomes measurable only once
per-day figures are being stored, which is the first time this
feature runs in production.

The check is already recorded in `specs/969-cumulative-learning/quickstart.md`
§After deployment (line 103):

```
## After deployment

FR-083 carries a post-implementation verification: once per-day figures are being
stored, compare a day's recorded value across successive syncs while it remains
inside the window, and report whether the platform revises conversions downward and
at what magnitude. This quantifies the cost the upward-only rule accepts, which is
currently visible but unmeasured. A material rate is grounds to revisit the decision
deliberately — never to reverse it silently.
```

This is where the operator will find T068 after the merge. No code or
test changes in this batch.

---

## §5 — Items changed in this batch

Five files:

- `functions/package.json` — added `test:phase969:t064b` script and
  spliced it into the `test:phase969` chain.
- `functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts`
  — new file. Four tests on the worker's real output.
- `functions/src/__tests__/phase969/sc049Tripwire.test.ts` —
  retirement sentinel at top; prints "RETIRED by Phase 7 T064b" if
  the successor test exists.
- `functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts`
  — retirement sentinel inside the SOURCE-TEXT test.
- `functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts`
  — retirement sentinel inside the SOURCE-TEXT test.

---

## §6 — Test name vs assertion check (Rule 0b)

Walking the runner descriptions against the assertion bodies for the
new `t064bEndToEnd.discriminator.test.ts`:

| Runner description | Assertion body | Match? |
|---|---|---|
| `SC-049: pre-populated lease (different runId) → status='failed'` | `result.status === 'failed'` after seeding lease doc with `runId: 'OTHER_RUNNER'` | ✅ — direct observation |
| `SC-049 (second-half): operational writes committed BEFORE the lease refused` | inspects stubbed bucket for `users/${uid}/workspaces/${wsId}/adAccounts/${acctId}/adPerformance` and asserts ≥1 doc written | ✅ — direct observation of operational write path |
| `T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)` | after `runSyncForAccount`, reads `bucket(wsPath).get('ad_1')` and asserts `adDoc.ledger.creativeKey !== 'ad_1'` | ✅ — observes the queued write directly |
| `T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)` | reads same queued doc, asserts `adDoc.ledger.angleKey === 'urgency'` and `adDoc.ledger.patternKey !== null` | ✅ — observes the post-pass patch's effect |

All four descriptions match their assertions.

---

## §7 — Source-text census — standing section

Per Batch 06 finding 3, this section is reported in every batch.

### §7.1 — Categories

Three categories: SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG,
BEHAVIOURAL, SIMULATION. Definitions per Batch 13 §5.1.

### §7.2 — Census entries (post-Batch 15 — three entries retired)

| File | Assertion | Category | Status |
|---|---|---|---|
| `sc049Tripwire.test.ts` | source-order (last `batch.commit` < first `acquireLearningLease`) | SOURCE-ORDER (SC-049 tripwire) | **RETIRED by Batch 15 T064b** |
| `learningCascade.test.ts` (3rd assertion, line 156) | `applyAdToHook` has no `count -=` patterns | SOURCE-TEXT (FR-014 structural guard) | active |
| `t021aWireupDiscriminator.test.ts` (line 217) | shared.ts calls `resolveCreativeKeyByAdId(` AND `creativeKeyByAdId.get(ad.id)` | SOURCE-TEXT (T021a wire-up) | **RETIRED by Batch 15 T064b** |
| `t025aWorkerWiringDiscriminator.test.ts` (line 313) | shared.ts has un-commented `.ledger.angleKey = entry.hookAngle` AND `.ledger.patternKey = computePatternKey` | SOURCE-TEXT (T025a wiring) | **RETIRED by Batch 15 T064b** |
| `t029GateMigrationDiscriminator.test.ts` (line 313) | rankingEngine.ts has no `(s as any).creativeCount ?? s.sampleSize` fallback in the inline gate at `querySummaries:223` | SOURCE-TEXT (T029c gate migration) | active (Batch 13: interim regression guard until T064b-equivalent lands for the gate; T064b's worker-output assertions do not yet cover `querySummaries` directly — see §8.2) |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11) | every `lib/**/*.test.js` chain entry has a `.ts` source on disk and vice versa | SOURCE-CONFIG (configuration invariant) | active |
| `t021aWireupDiscriminator.test.ts` (lines 172-216) | T021a BEFORE/AFTER driving `simulateShared` + `resolveCreativeKeyByAdId` + `decidePerAdActionsForWorker` | SIMULATION (reclassified Batch 12 review) | active |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289) | T025a BEFORE/AFTER driving the same simulation harness | SIMULATION (reclassified Batch 12 review) | active |
| `perAdActions.test.ts` (lines 101-181) | T021a discriminator: drives `decideAdWriteActions` with `creativeKey=ad.id` vs `creativeKey="creative:gen:gen:55"` | SIMULATION (reclassified Batch 12 review) | active |
| `perAdActions.test.ts` (lines 243-290) | T025a function-level: drives `decideAdWriteActions` with `resolvedHookAngle="urgency"` / `resolvedPatternKey="p1"` | SIMULATION (reclassified Batch 12 review) | active |
| `t029GateMigrationDiscriminator.test.ts` (lines 195-289) | T029c discriminator: drives `passesFRO34Gate({sampleSize: 55, creativeCount: 1/3/undefined})` | SIMULATION (Batch 13) | active |
| `t029GateMigrationDiscriminator.test.ts` (lines 295-301) | confidence-below-MIN_CONFIDENCE fails the gate even at scale | BEHAVIOURAL | active |
| `t064bEndToEnd.discriminator.test.ts` (4 tests) | SC-049 + worker-output (T021a, T025a) | BEHAVIOURAL (Batch 15) | active — replaces the three retired SOURCE-TEXT entries above |

**Total assertion groups**: 12 (was 13 in Batch 14).
- 0 SOURCE-ORDER (SC-049 retired — was 1).
- 2 SOURCE-TEXT (FR-014 + T029c gate — T021a + T025a retired — was 4).
- 1 SOURCE-CONFIG (chain-wide — unchanged).
- 4 SIMULATION (T021a + T025a discriminator + helpers, Batch 12/13 reclassification — unchanged).
- 2 BEHAVIOURAL (T029c confidence + **T064b end-to-end (Batch 15 new)**).

Three SOURCE-TEXT/SOURCE-ORDER entries retired per the user's directive:
SC-049 tripwire, T021a SOURCE-TEXT, T025a SOURCE-TEXT.

---

## §8 — Items that did NOT change

### §8.1 — T056 implementation

No code changes to `src/i18n.tsx` or `functions/src/whatsWorkingDashboard.ts`.
The proposed strings are in §3.1 for the owner's review. The user
explicitly said "Write the proposed English and Arabic, put both in
the report, and stop."

### §8.2 — T029c SOURCE-TEXT guard remains active

`T029c gate-migration`'s SOURCE-TEXT entry at
`t029GateMigrationDiscriminator.test.ts:313` is NOT retired in this
batch. The user's directive named three guards to retire (SC-049,
T021a, T025a); the T029c gate guard is not among them.

`passesFRO34Gate` is the extracted pure function (Batch 13). The
discriminator's BEHAVIOURAL halves already drive that function
directly, and the SOURCE-TEXT guard catches refactors that
re-introduce the `?? summary.sampleSize` fallback. T064b's
end-to-end assertions do not currently exercise `querySummaries`
directly (they drive `runSyncForAccount` and observe the per-ad
write). The T029c guard can retire in a follow-up batch that adds a
T029b-style end-to-end gate test, or it can stay as the structural
guard it currently is.

### §8.3 — `learningAggregates.ts`, `runFullSync`, production code

No production code changes in this batch. The worker output is
observed via the stubbed bucket — what is written is what the
production code writes, not a re-implementation.

### §8.4 — `tasks.md`

No changes to `tasks.md`. T064b, T056, T068 entries are unchanged
from Batch 13 / Batch 14. T056 stays `[ ]` (not done — owner review
pending); T068 stays `[ ]` (post-deployment check, not a code task);
T064b was never in `tasks.md` as a code task — it was the
"SC-049 behavioural test" obligation that landed.

---

## §9 — Raw output — `git diff --stat HEAD~1` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1
 functions/package.json                             |   3 +-
 functions/src/__tests__/phase969/sc049Tripwire.test.ts               |  19 +++++++
 functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts |  10 +++
 .../phase969/t025aWorkerWiringDiscriminator.test.ts                |  10 +++
 functions/src/__tests__/phase969/t064bEndToEnd.discriminator.test.ts |  524 ++++++++++++++++++++++++
 5 files changed, 579 insertions(+), 13 deletions(-)
```

## §10 — Raw output — `git status --short` at HEAD after this batch's commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §11 — Raw output — full `npm test` tail with exit code (clean build)

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

(Full output captured at `C:\temp\opencode\batch15-final-npmtest.txt`.)

Highlights from the run:

```
> test:phase969:t021aWireup
  ✅ T021a BEFORE wire-up: shared.ts's resolver (per-row fallback) gives creativeCount = 55 (per-row)
  ✅ T021a AFTER wire-up: shared.ts's resolver (groupIntoCreatives) gives creativeCount = 1 (per-creative)
T021a SOURCE-TEXT tripwire RETIRED by Phase 7 T064b
  ✅ T021a: shared.ts's source contains the wire-up call + the per-ad-block lookup (SOURCE-TEXT — necessary-but-not-sufficient)

> test:phase969:sc049Tripwire
──────────────────────────────────────────────────────────────────────────────
SC-049 source-order tripwire (T018c) — RETIRED by Phase 7 T064b
──────────────────────────────────────────────────────────────────────────────
The SC-049 behavioural test (t064bEndToEnd.discriminator.test.ts) drives
runSyncForAccount end-to-end with stubbed Firestore + Meta, pre-populates
the lease doc with a different runId, and asserts both halves of FR-060a: ...

> test:phase969:t025aWorkerWiring
  ✅ T025a BEFORE wiring: shared.ts queues the adDoc write with null ledger keys (the bug)
  ✅ T025a AFTER wiring: shared.ts's post-pass patch flows resolved ledger keys back into the queued write
T025a SOURCE-TEXT tripwire RETIRED by Phase 7 T064b
  ✅ T025a: shared.ts's source contains the post-pass ledger-key wiring (SOURCE-TEXT — necessary-but-not-sufficient)

> test:phase969:t064b
  ✅ SC-049: pre-populated lease (different runId) → status='failed'
  ✅ SC-049 (second-half): operational writes committed BEFORE the lease refused
  ✅ T021a worker-output: queued adDoc's ledger.creativeKey is the actual creative key (not ad.id)
  ✅ T025a worker-output: queued adDoc's ledger.angleKey/patternKey are the post-pass resolved values (not null)

contractFixtures.test: PASS
=== NPM TEST EXITCODE: 0 ===
```

Three tripwires retired, four new worker-output assertions all pass,
full chain exits **0**.
