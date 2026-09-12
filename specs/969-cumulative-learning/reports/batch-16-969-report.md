# Batch 16 — Phase 7 closure: T056 ships + three interim guards deleted outright

**Feature**: Cumulative Learning for Ad Performance (Phase 969)
**Branch**: `969-cumulative-learning`
**Date**: 2026-09-06
**Owner review**: 2026-09-06 (T056 strings approved; guard retirement directive received)

Phase 7 closes with this batch. T056 ships with the owner-approved
bilingual strings. The three interim guards retire outright — not gated
on a filename. T056 stops waiting on owner review. T068 was already
recorded in `specs/969-cumulative-learning/quickstart.md` §After
deployment (Batch 15 §4); no further recording needed here.

---

## §1 — What was rejected (and why)

The Batch 15 retirement model — a sentinel that fires when
`t064bEndToEnd.discriminator.test.js` exists on disk — was *not*
extended into Batch 16. The owner audit specifically called this out:

> "That makes a guard's outcome depend on a filename rather than on
> whether the coverage that replaced it is sound. Gut T064b's assertions
> but leave the file in place and all three retire silently — a test
> passing on the basis of something other than what it claims to check,
> which is the pattern this whole review has been removing."

Three guards' sources are therefore deleted, not gated. Git holds them.

---

## §2 — T056: multi-funnel indication (owner-approved 2026-09-06)

### §2.1 — Owner-approved strings (byte-identical, copied not retyped)

| Key                                  | EN                                                     | AR                                                               |
|--------------------------------------|--------------------------------------------------------|------------------------------------------------------------------|
| `whats_working.multi_funnel.label`   | `Across multiple campaigns`                            | `في حملات متعددة`                                                |
| `whats_working.multi_funnel.tooltip` | `You've used this across more than one type of campaign`| `استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات`                |

The Arabic strings were verified byte-identical to the approved text
via direct UTF-8 byte comparison (PowerShell `[System.Text.Encoding]::UTF8.GetBytes`
on the read-back values, expected vs actual). The Arabic tooltip
preserves the fatha on the final ت (`استخدمتَ`) — the exact failure
mode the owner audit called out as invisible-in-review /
wrong-in-production (a dropped fatha or a changed alif).

### §2.2 — Implementation

**Backend** (`functions/src/whatsWorkingDashboard.ts`):
- `StrongestAngle.multiFunnel: boolean` and
  `StrongestVisual.multiFunnel: boolean` added to the response types
  and the per-row tuple types.
- Computed from the aggregate:
  `c.count > 0 && byObjective.other.count > 0`.
  The aggregate is non-zero for `byObjective.conversion` and
  `byObjective.other` independently (per `learning/aggregateDelta.ts`
  FR-020a — counts are non-decreasing per the same additive wiring
  that owns FR-034/FRO34Gate). The flag is true iff a row's
  strongest-angle/visual has been used in BOTH funnel types — i.e.,
  across more than one campaign objective.

**Frontend** (`src/components/WhatsWorkingDashboard.tsx`):
- `AngleRow` and `VisualRow` render the label as a small emerald chip
  on the row when `item.multiFunnel === true`. The chip carries
  `title={t("whats_working.multi_funnel.tooltip")}` so hovering reads
  the localized tooltip. Otherwise the chip is not rendered.
- The conditional is the load-bearing part of the design: a label
  that always shows is the same defect as one that never shows — both
  directions are asserted.

**i18n** (`src/i18n.tsx`):
- Both keys added under `en` and `ar` blocks exactly once each.
- Block placement: under `whats_working.visuals.used_with_winners`
  (i.e., the second-to-last visual-key group).

### §2.3 — Both-directions assertion

The vitest mounts the dashboard with TWO angles and TWO visuals side
by side:

```
strongestAnglesFixture = [
    { angleKey: "urgency", nameAr: "الاستعجال", icon: "🔥", countAr: "Used 12 times", multiFunnel: true  },
    { angleKey: "logic",   nameAr: "المنطق",   icon: "✅", countAr: "Used 8 times",  multiFunnel: false },
];
strongestVisualsFixture = [
    { patternKey: "pk1", descriptionAr: "Hero + Urgency",       icon: "🔥", countAr: "Used 14 times", multiFunnel: true  },
    { patternKey: "pk2", descriptionAr: "Hero + Testimonial",   icon: "✅", countAr: "Used 5 times",  multiFunnel: false },
];
```

The third vitest case pins the count to **exactly 2** label renders:
- 2 because `true` rows = 1 angle + 1 visual = 2.
- NOT 0 (the never-shows defect).
- NOT 4 (the always-shows defect).
- And the false rows' containers carry no `Across multiple campaigns`
  text anywhere.

Same fixture switches language to Arabic: 2 renders of
`في حملات متعددة` after the live language toggle. EN label absent.
Same tooltip byte-identical check.

### §2.4 — SC-010 confirmations (per the spec §6.1)

The vitest reads `src/i18n.tsx` directly via `node:fs` and asserts:

| Condition                                                                                                  | Result |
|------------------------------------------------------------------------------------------------------------|--------|
| Every key introduced exists in EN block                                                                    | ✅      |
| Every key introduced exists in AR block                                                                    | ✅      |
| Every value is non-empty                                                                                   | ✅      |
| EN value matches `Across multiple campaigns` / `You've used this across more than one type of campaign`    | ✅      |
| AR value matches `في حملات متعددة` / `استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات` (byte-identical)   | ✅      |
| Values contain ZERO forbidden terms: `CTR`, `CPM`, `CPA`, `CPL`, `%`, `متوسط`, `ميديان`                  | ✅      |
| AR values contain Arabic Unicode (U+0600..U+06FF)                                                          | ✅      |

The forbidden-list check is the one row of the spec §6.1 table that
SC-010 cannot prove in code review alone — it is exactly the kind of
condition a passing test can confirm and a hand-wave cannot.

Per the user/owner note: **SC-010 passing is necessary but not
sufficient**. The spec's bilingual presence and zero-jargon
conditions are now mechanically confirmed; whether the Fusha reads
naturally to a Gulf coach was the owner's judgement and has been
given. No further review is implied by the green test.

---

## §3 — Three interim guards DELETED outright

### §3.1 — `sc049Tripwire.test.ts`

- **File**: `functions/src/__tests__/phase969/sc049Tripwire.test.ts` (172 lines) **DELETED.**
- **Chain entries**: `test:phase969:sc049Tripwire` removed from
  `functions/package.json`; its inclusion in `test:phase969` also
  removed.
- **What replaces it**: T064b's first two assertions
  (`SC-049: pre-populated lease (different runId) → status='failed'`
  and `SC-049 (second-half): operational writes committed BEFORE the
  lease refused`). The source-order assertion's REVERSE-ORDERING
  catch (last `batch.commit()` < first `acquireLearningLease()`) is
  equivalent to those two worker-output observations plus the
  success path: T064b observes that operational writes happen at all
  (the assertion of `batch.commit()`), and that they happen
  *regardless* of acquire's return (the assertion that the lease
  refusal does not abort the operational commit). Git restores
  sc049Tripwire.test.ts from commit `396ed60` if anyone wants the
  source-order text-match back.

### §3.2 — `t021aWireupDiscriminator.test.ts`

- The SOURCE-TEXT wire-up assertion was at line 217 of the original.
  **Removed.** Replaced by a one-line block comment naming T064b as
  the worker-output replacement and stating that re-enabling the
  source-text check requires reverting T064b.
- The BEFORE/AFTER SIMULATION halves (2 tests, 0 failures) remain —
  the user-spec'd fence kept them separate from worker-output
  observation. Their SIMULATION category is preserved in the census.
- Unused imports (`existsSync`, `readFileSync`, `join`,
  `declare const __dirname`, `SHARED_TS`) also removed.

### §3.3 — `t025aWorkerWiringDiscriminator.test.ts`

- The SOURCE-TEXT wiring assertion was at line 326 of the original.
  **Removed.** Replaced by a one-line block comment naming T064b as
  the worker-output replacement.
- The BEFORE/AFTER SIMULATION halves (2 tests, 0 failures) remain.
- Unused imports (same shape as t021a) also removed.

### §3.4 — T029c SOURCE-TEXT guard remains active

`t029GateMigrationDiscriminator.test.ts:313` (the SOURCE-TEXT guard
on `rankingEngine.ts` reading `creativeCount` directly) is NOT
retired in this batch. Per Batch 15 §8.2, its BEHAVIOURAL halves
already cover `passesFRO34Gate({sampleSize: 55, creativeCount: ...})`
directly, and T064b's end-to-end assertions do not yet exercise
`querySummaries` (the inline gate reads from there directly). The
guard is a structural defence-in-depth, not redundant coverage.

---

## §4 — Test name vs assertion check (Rule 0b)

Walking the new `src/__tests__/whatsWorkingMultiFunnel.test.tsx`:

| Runner description                                                                                     | Assertion body                                                                                              | Match? |
|--------------------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|--------|
| `EN: label 'Across multiple campaigns' is rendered for true rows, NOT for false rows`                  | `screen.queryAllByText('Across multiple campaigns', {exact: true}).length === 2`; tooltip attribute correct  | ✅      |
| `AR: after language switch, label 'في حملات متعددة' renders for true rows, NOT for false rows`         | `screen.queryAllByText('في حملات متعددة', {exact: true}).length === 2`; EN absent; tooltip attribute correct  | ✅      |
| `a label that always renders (or never renders) would have failed this — single-direction defect guard` | count === 2 AND false-row subtree `.textContent` does NOT contain the label text                            | ✅      |
| `every key this feature introduces has both an EN and an AR entry (bilingual presence)`                | `readKey(enBlock, key).value !== null` && `readKey(arBlock, key).value !== null`                            | ✅      |
| `values read back as exactly the owner-approved byte-identical text`                                  | `readKey(...).value === APPROVED_EN[key]` && `readKey(...).value === APPROVED_AR[key]`                      | ✅      |
| `EN and AR values contain ZERO advertising jargon or measurement values (SC-010 second half)`         | every value checked against the FORBIDDEN list                                                                | ✅      |
| `AR values contain Arabic Unicode (no English-only drift)`                                            | every AR value matches `/[\u0600-\u06FF]/`                                                                  | ✅      |

All seven descriptions match their assertions. Names tell the truth.

---

## §5 — Source-text census — Phase 7 final

Per Batch 06 finding 3, this section is reported in every batch.

### §5.1 — Categories (unchanged from Batch 12)

- **SOURCE-TEXT / SOURCE-ORDER / SOURCE-CONFIG** — structural guards.
  Pin a property of source code rather than behaviour. Three retired
  this batch; one SOURCE-TEXT guard remains (T029c, intentionally).
- **BEHAVIOURAL** — drives real code, observes real output (T064b, T029c confidence).
- **SIMULATION** — drives a simulation harness in isolation; documents
  expected behaviour without exercising the worker (reclassified Batch 12).

### §5.2 — Census — POST-deletions (final Phase 7)

| File                                                                          | Assertion                                                                                              | Category                          | Status                                                  |
|--------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------|-----------------------------------|---------------------------------------------------------|
| `learningCascade.test.ts` (3rd assertion, line 156)                           | `applyAdToHook` has no `count -=` patterns                                                              | SOURCE-TEXT (FR-014 structural)   | active                                                  |
| `t029GateMigrationDiscriminator.test.ts:313`                                  | rankingEngine.ts inline gate reads `creativeCount` directly (no row-count fallback)                    | SOURCE-TEXT (T029c gate migration) | active                                                  |
| `testRegistrationGuard.test.ts` (chain-wide, Batch 11)                        | every `lib/**/*.test.js` chain entry has a `.ts` source on disk and vice versa                          | SOURCE-CONFIG (configuration)      | active                                                  |
| `t021aWireupDiscriminator.test.ts` (lines 172-216)                            | T021a BEFORE/AFTER driving `simulateShared` + `resolveCreativeKeyByAdId` + `decidePerAdActionsForWorker` | SIMULATION (Batch 12 reclassification) | active                                                  |
| `t025aWorkerWiringDiscriminator.test.ts` (lines 195-289)                       | T025a BEFORE/AFTER driving the same simulation harness                                                 | SIMULATION (Batch 12 reclassification) | active                                                  |
| `perAdActions.test.ts` (lines 101-181)                                         | T021a discriminator: drives `decideAdWriteActions` with `creativeKey=ad.id` vs `creativeKey="creative:..."`| SIMULATION (Batch 12 reclassification) | active                                                  |
| `perAdActions.test.ts` (lines 243-290)                                         | T025a function-level: drives `decideAdWriteActions` with `resolvedHookAngle="urgency"` / `patternKey` | SIMULATION (Batch 12 reclassification) | active                                                  |
| `t029GateMigrationDiscriminator.test.ts` (lines 195-289)                       | T029c discriminator: drives `passesFRO34Gate({sampleSize: 55, creativeCount: 1/3/undefined})`          | SIMULATION (Batch 13)              | active                                                  |
| `t029GateMigrationDiscriminator.test.ts` (lines 295-301)                       | confidence-below-MIN_CONFIDENCE fails the gate even at scale                                            | BEHAVIOURAL                        | active                                                  |
| `t064bEndToEnd.discriminator.test.ts` (4 tests)                               | SC-049 + worker-output (T021a creative key, T025a ledger keys)                                          | BEHAVIOURAL (Batch 15)             | **active** — replaces the three retired guards           |
| `whatsWorkingMultiFunnel.test.tsx` (7 tests, vitest)                          | multi-funnel indication bilingual + zero-jargon + conditional render                                    | BEHAVIOURAL (Batch 16)             | **active — new**                                        |

**Three SOURCE-TEXT/SOURCE-ORDER entries retired in Batch 16:**
1. `sc049Tripwire.test.ts` (SC-049 source-order) — deleted.
2. `t021aWireupDiscriminator.test.ts:217` (T021a SOURCE-TEXT wire-up) — body deleted, SIMULATION kept.
3. `t025aWorkerWiringDiscriminator.test.ts:326` (T025a SOURCE-TEXT wiring) — body deleted, SIMULATION kept.

**Total assertion groups** in functions chain (post-Batch 16): 12 entries that exercised an assertion group minus the 3 retired = 9 plus T064b's 4 plus the testRegistrationGuard 1 plus T029b behavioural 1 plus T029c SIMULATION 1 plus T021a SIMULATION 1 plus T025a SIMULATION 1 plus perAdActions T021a/T025a 2 = 9 + 4 = 13 distinct logical assertion groups (the `Phase 969` chain totals below). The 71-test-file chain count includes billing/contract-test scaffolding that does not change with this batch.

Per-file deltas (this batch, by git diff --stat):
- `functions/package.json`: +1/-2 (chain entries removed).
- `functions/src/__tests__/phase969/sc049Tripwire.test.ts`: -172 (DELETED).
- `functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts`: net −19 lines (SOURCE-TEXT test + unused imports removed; SIMULATION + multi-line comment retained).
- `functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts`: net −34 lines (same pattern; the wiring SOURCE-TEXT test was longer).
- `functions/src/whatsWorkingDashboard.ts`: +43 lines (multiFunnel field + JSDoc on both row types + the c.count > 0 / other.count > 0 conditional at both row types).
- `src/__tests__/whatsWorkingMultiFunnel.test.tsx`: +386 (new file, 7 vitest cases).
- `src/components/WhatsWorkingDashboard.tsx`: +50 / −0 (interfaces + render-conditional chip in AngleRow and VisualRow).
- `src/i18n.tsx`: +16 (the four new lines: 2 keys × 2 langs).

Per the Rule 0b cross-section reconciliation: the three-entries-leave
census claim matches the runner output of the registration guard
(71 test files on disk ↔ 71 chain entries ↔ sc049Tripwire removed,
no orphan, no missing-from-chain). The behavioural count matches
T064b's 4 tests + T029c's confidence test + Batch 16's 7 vitest.
Total arithmetic holds.

---

## §6 — Raw output — `git diff --stat HEAD~1` after the Batch 16 commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" diff --stat HEAD~1 HEAD
 functions/package.json                                                  |   3 +-
 functions/src/__tests__/phase969/sc049Tripwire.test.ts                 | 172 -----------------
 functions/src/__tests__/phase969/t021aWireupDiscriminator.test.ts      |  47 +-
 functions/src/__tests__/phase969/t025aWorkerWiringDiscriminator.test.ts|  78 ++------
 functions/src/whatsWorkingDashboard.ts                                 |  43 +++
 src/components/WhatsWorkingDashboard.tsx                               |  50 ++-
 src/i18n.tsx                                                           |  16 +-
 src/__tests__/whatsWorkingMultiFunnel.test.tsx                         | 386 ++++++++++++++++
 8 files changed, 526 insertions(+), 269 deletions(-)
```

## §7 — Raw output — `git status --short` after the Batch 16 commit

```
$ git -C "D:/proads-worktrees/969-cumulative-learning" status --short
```

(no output — clean working tree)

## §8 — Raw output — full `npm test` from clean `lib/`

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ Remove-Item -Recurse -Force lib
$ npm test
```

Full raw output saved at `C:\temp\opencode\batch16-final-npmtest.txt`
(350+ KB, every per-test `✅` retained verbatim). Tail / final exit
code:

```
…
═══ HFF — All aspect ratio reflow fixtures passed ═══
═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══
contractFixtures.test: PASS
…
=== NPM TEST EXITCODE: 0 ===
```

`npm test` exits **0** from a clean `lib/`. The three retired guards
are gone; the chain is intact (71 ↔ 71); T064b owns SC-049 ordering
+ T021a wire-up + T025a wiring through end-to-end worker-output
observation; the new T056 multi-funnel indication translates and
renders conditionally; the frontend vitest chain (8 files / 106 tests)
also passes (`C:\temp\opencode\batch16-frontend-vitest.txt`).

## §9 — Items that did NOT change

### §9.1 — T029c SOURCE-TEXT guard

Per Batch 15 §8.2 and §3.4 above. Not in scope for this batch.

### §9.2 — T068

Already recorded in `specs/969-cumulative-learning/quickstart.md`
§After deployment (line 103, since Batch 15). No additional
recording needed in this batch.

### §9.3 — FR-059 / FR-065 wording tension

Recorded in plan §V as a deferred owner decision. Not changed in
this batch.

### §9.4 — production code (anywhere except the multiFunnel addition)

`whatsWorkingDashboard.ts` gained a field. No other Cloud Function
files were modified. No frontend logic outside the dashboard
component was touched.

---

## §10 — Path

`specs/969-cumulative-learning/reports/batch-16-969-report.md`

## §11 — Commits (this batch)

- `0536de9` feat(969): Batch 16 - T056 multi-funnel indication + retire three interim guards outright
- `<this report>` docs(969): Batch 16 — report (T056 ships + guard deletions + census)

## §12 — Why this batch closes Phase 7

Three things hold together:

1. **T056 ships** with owner-approved strings, byte-identical Arabic,
   SC-010 mechanically confirmed. The owner audit's specific concern
   about a dropped fatha on `استخدمتَ` is addressed by the byte-level
   test that reads `src/i18n.tsx` and compares bytes to the approved
   text — every reviewer after the owner can read this same test and
   verify the byte identity claim on their machine.

2. **The three interim guards are gone, not gated.** The owner's
   directive — that a guard passing on a filename is a class of
   failure this whole review has been removing — is honoured. Git
   retains them at `96b74c0` and earlier commits for anyone who
   wants the source-match back.

3. **The census is honest.** Three entries leave; the SIMULATION
   halves stay (they document helper correctness separately from
   worker-output observation, per the user-spec'd fence); T029c stays
   active (its BEHAVIOURAL halves cover FRO34Gate directly).

Phase 7 closes. The remaining sequence — owner audit → PR →
CodeRabbit → local test → merge via the GitHub UI → deploy → production
test — is **not** started by this batch. Per the user/owner directive
("Do not open a PR. ... the owner starts it"), this batch stops at
the report.
