# Scope audit — what branch `969-cumulative-learning` contains, and what it does not

**Branch**: `969-cumulative-learning` · **PR #71**: open, not merged
**Date**: 2026-09-11
**Scope**: read-only. No implementation code written, no phase started, nothing merged.
The only writes are this report.
**Path** (from `pwd`): `/d/proads-worktrees/969-cumulative-learning`

---

## Headline

The gap is **larger than three phases, and it is not only at the end.**

Phases 4, 5 and 6 are substantially unbuilt, as expected. But the audit also found
**three defects inside the shipped Phase 3 MVP**, one of which corrupts the very
signal the feature exists to accumulate:

1. **The withdrawal path does not withdraw the measure it withdraws.**
   `applyHookAggregateWithdrawal` decrements the count and **leaves `avgLinkCtr`
   unchanged**, by its own admission in a comment deferring the fix to a phase that
   was skipped. Because withdraw-then-add is the **common** path — it fires on every
   sync where an ad's click-through moved — the stored average drifts toward the
   account mean on every sync, compressing exactly the spread that ranking depends
   on. No test covers it, because the accumulation tests drive **identical** reruns,
   which take the no-op path.
2. **FR-074g's all-rows aggregation is inverted**, and FR-074d's persistence is
   missing. Together these mean **propagation achieves nothing** — which is the
   precise outcome FR-074g was written to forbid, in those words.
3. **FR-019 is not implemented**: every existing aggregate is rewritten every sync.

None of these is visible from `tasks.md`, whose checkboxes were never maintained and
are not used as evidence anywhere in this audit.

---

## 1. Starting state

```
$ git status --short
?? specs/009-billing-plan-access/contracts/stripe-webhooks.md

$ git log --oneline -3
2020539 docs(969): pre-merge check for PR #71 — clean merge, one scope finding
40ff340 docs(969): coderabbit-round-02a - 5 corrections + CodeRabbit review status
ed0d4e4 docs(969): coderabbit-round-02 - no new round-2 comments produced

$ git rev-list --left-right --count origin/969-cumulative-learning...HEAD
0	0
```

`0	0` as required. Nothing merged. The one untracked file is unrelated to this
feature and was not added.

---

## 2. Method

Shipped scope was determined from **code**, never from `tasks.md`.

- Every FR and SC id was extracted from `spec.md` (**123 FR ids, 56 SC ids**, all
  defined) and grepped across `functions/src` and `src`, separating live code from
  `__tests__`.
- An id appearing in a comment is **not** evidence of implementation. Every id whose
  only hit was a comment was checked behaviourally against what the requirement
  actually says.
- The full test chain was run as evidence (`cd functions && npm test`) — see §6, T067.
- `git diff --stat origin/main...HEAD` fixes the outer boundary of what the branch
  could possibly have changed.

**The branch's entire code footprint** (40 files, +11282 / −2448):

```
NEW    functions/src/learning/{types,creativeGrouping,learningLease,contributionLedger,
       aggregateDelta,fieldLevelDiscrimination,boundedLedgerRead,decideAdWriteActions,
       learningPerAdLoop,applyLearningWrites,index}.ts
MOD    functions/src/metaSync/shared.ts (3005)   functions/src/learningAggregates.ts (489)
       functions/src/whatsWorkingDashboard.ts (157)  patternSummaries.ts (140)
       rankingEngine.ts (45)  ragContext.ts (27)
       src/i18n.tsx (16)  src/components/WhatsWorkingDashboard.tsx (50)
UNTOUCHED (and load-bearing): functions/src/getTopWinners.ts, functions/src/qararEngine.ts
```

`getTopWinners.ts` being untouched is decisive for Phases 5 and 6 — see §4.

---

## 3. Scope by phase

| Phase | Tasks | Verdict |
|---|---|---|
| **1 — Setup** | T001–T004 | **SHIPPED WHOLE** |
| **2 — Foundational** | T005–T016 (no T012) | **SHIPPED WHOLE** |
| **3 — US1 (MVP)** | T017–T028 | **PARTIAL** — 9 of 12 shipped; T020/T021 (FR-021 averages), T022 (FR-074g), T023 (FR-019), T025 (FR-074d/e) are defective or absent |
| **4 — US2** | T028–T046 | **NOT IMPLEMENTED**, except T029a/b/c (which are `[US1]` tasks filed under this heading) |
| **5 — US3** | T047–T052 | **PARTIAL** — T047, T048 shipped; T049, T050, T051, T052 absent |
| **6 — US4** | T053–T057 | **PARTIAL** — T056 shipped; T053/T055/T057 partial; T054 absent |
| **7 — Polish** | T058–T068 | **PARTIAL** — T064a, T064b, T066, T067, T068 shipped; T058–T063, T064, T065 absent |

**Phase 7 did not ship whole.** The user's premise ("Phase 7 shipped") is half right:
the *gates* shipped, the *observability the feature is judged by* did not. All six
logging tasks (T058–T063) and the observability test (T064) are absent.

---

## 4. Requirement-by-requirement

Verdict key: **S** shipped · **P** partial · **N** not implemented · **NA** recording
or framing requirement satisfied by the spec text itself.

### A. Sealed Evaluation Context — FR-001 … FR-007 → **all N**

Evidence of absence: `grep -rniE "sealed|PROVISIONAL" functions/src src` outside
`__tests__` returns **two hits, both inside `learning/types.ts` comments**
(`:43`, `:44`). `ContributionState` is declared at `types.ts:44` and referenced
**nowhere**. `AdDoc` (`shared.ts:170-241`) has no sealed target, no sealed funnel
type, no sealed timestamp, no contribution state.

- **FR-005e** — **NA in its stated half** ("the separation is stated here rather than
  encoded as a third state") but it also governs the efficiency path, which is absent.
  Verified, not assumed: the requirement's operative clause is a recording one.

### B. Freezing and Re-evaluation — FR-008 … FR-014

| | Verdict | Evidence |
|---|---|---|
| FR-008, FR-009, FR-010 | **S, vacuously** | operational status recomputes every sync (`shared.ts:1390-1397`). There is no sealed result for it to diverge from, so the separation the requirements demand is not yet *tested* by anything |
| FR-011, FR-012, FR-012a, FR-013, FR-013a | **N** | `contributionLedger.ts` is 123 lines and contains only `decideContribution` / `contributionsEqual`. No re-evaluation trigger, no earliest-sealing rule, no merge reconciliation |
| FR-014 | **P** | the cascade's "never withdraw" half holds (`learningCascade.test.ts`, 4 assertions). Its **completeness** half depends on FR-074d, which is absent — see below |

### B2. The Unit of Evidence — FR-073 … FR-076

| | Verdict | Evidence |
|---|---|---|
| FR-073 | **S** | `groupIntoCreatives` (`creativeGrouping.ts:249`) wired at `shared.ts:1046`; `creativeCount` incremented once per creative at `aggregateDelta.ts:107-109` |
| FR-074, FR-074a, FR-074b, FR-074c | **S** | `creativeGrouping.ts` — hash grouping, `PROVENANCE_PRECEDENCE` at `:38`, cross-group merge, key-absence cases. Tests: `creativeGrouping.test.ts` (SC-029, SC-029a, SC-029b, SC-046) |
| **FR-074d** | **P — the persistence half is absent** | *Derived*: yes, inside `groupIntoCreatives`. *Persisted*: **no**. `resolveCreativeKeyByAdId` (`learningPerAdLoop.ts:59-75`) returns `Map<adId, creativeKey>` **only** — the resolved `generationId` and `resolvedProvenance` computed by the grouper are discarded at that boundary. `AdDoc` has no `linkProvenance` field |
| **FR-074e** | **N** | provenance is computed (`creativeGrouping.ts:166`) and never stored. `shared.ts:1052` passes `linkProvenance: null` **hard-coded** into the grouper |
| FR-074f | **S** | `matchType` gains no value; the six branch sites are unchanged. Note the citation drift in §7 |
| **FR-074g** | **P — the eligibility half only; the aggregation half is inverted** | FR-074g: *"Aggregation is ALL-ROWS … the measured values of **every** row in it aggregate … not only those of its individually-eligible rows. An eligible-rows-only rule would make propagation achieve nothing."* The code does exactly that: `aggregateDelta.ts:84-85` `const eligibleRows = rows.filter(isAdEligible)`, then `:92` `for (const ad of eligibleRows)` and `:210` likewise for visuals. The module's own comment at `:77` states the rule as *"every **eligible** row's values aggregate"* — the requirement says *every row* |
| FR-075 | **S** | single-member group for keyless rows; the stated limitation holds |
| FR-076 | **N** | four-way provenance breakdown is a log line; there is no log line (§ Phase 7) |

**The combined consequence, stated plainly**: a propagated row never receives a
`generationId` (FR-074d), so `isAdEligible` (`aggregateDelta.ts:302-306`) rejects it,
and eligible-rows-only aggregation then excludes its values (FR-074g). Propagation
runs, produces a correct grouping, and changes nothing that is stored. This is the
outcome FR-074g names in its own text as the reason the rule exists.

### B3. Efficiency Contributes Exactly Once — FR-077 … FR-087 → **all N**, except:

- **FR-077a** — **NA**, verified: its operative clause is *"MUST be recorded where the
  threshold is defined"*, and it is so recorded.
- **FR-082** — **N**, and its guard is moot: the grep T036a specifies (`lifetime`
  under `functions/src/learning/`) returns nothing only because the module it would
  guard does not exist.

Evidence of absence, `learning/index.ts:28-30` verbatim:

```
// ─── Phase 4 — conversion accrual + efficiency figure ──────────────
// export * from "./conversionAccrual.js";  // FR-081–FR-086a
// export * from "./efficiencyFigure.js";   // FR-002, FR-002a, FR-003, FR-077–FR-080, FR-087
```

Neither file exists. `DayAccrual` (`types.ts:91`) is unreferenced. The ledger carries
the two efficiency fields as **hard-coded constants** — `decideAdWriteActions.ts:224-225`:

```
            efficiencyContributed: false,
            efficiencyValue: null,
```

Neither is ever computed, and `efficiencyContributed` is never set true.

### C. Cumulative, Idempotent Accumulation — FR-015 … FR-023

| | Verdict | Evidence |
|---|---|---|
| FR-015, FR-016, FR-017, FR-018 | **S** | delta contract in `aggregateDelta.ts`; ledger on `AdDoc.ledger` (`shared.ts:240`); decision table in `contributionLedger.ts:99-123`. SC-002 (ten identical runs), SC-013 (monotonic) green |
| **FR-019** | **N** | `applyHookAggregatesDelta` seeds its map with **every** existing aggregate (`aggregateDelta.ts:67`) and returns all of them; `applyLearningWrites.ts:365-379` writes **every** entry unconditionally. Untouched records are rewritten every sync. The comment at `:354-355` asserts the opposite (*"Each entry … received a contribution this sync"*). Impact is cost, not correctness — `lastUpdated` is only bumped inside the contribution loop (`:116`) |
| FR-020 | **S** | counts are non-decreasing; asserted behaviourally (`learningAccumulation.test.ts`, T027b) |
| **FR-021** | **P — counts exact, averages not** | FR-021 requires raw sums *"so that a contribution can be added or withdrawn exactly, without accumulating rounding drift"*. The record stores `avgLinkCtr` (a `round2`-ed running mean, `aggregateDelta.ts:151-159`) and a count — **no raw sum**. The sum is reconstructed as `avg × (count−1)`, i.e. from a rounded value |
| FR-022 | **S** | derived averages present under existing names |
| FR-023 | **S** | via the lease (section J) |

#### The withdrawal defect — FR-021, and the most consequential finding in this audit

`applyHookAggregateWithdrawal` (`aggregateDelta.ts:260-298`) decrements every count
and **does not touch the average**. Its own comment, `:271-275`:

```
        // The average cannot be re-derived exactly from count alone
        // (it depends on the underlying values). For now we leave the
        // average unchanged — partial-sync drift is documented as
        // accepted imprecision. Full inverse re-derivation lands in
        // Phase 7 alongside the contribution-ledger integration.
```

Three things make this more serious than the comment suggests.

**First, the data it says it lacks is present and is passed in.** The ledger records
the withdrawn row's own `ctrLink` (`decideAdWriteActions.ts:216`), and
`applyLearningWrites.ts:237` puts it on the synthetic `oldAd` handed to this very
function as `ctrLink: withdraw.contributedValues.ctrLink`. The function ignores it.

**Second, withdraw-then-add is the common path, not the rare one.** `contributionsEqual`
compares `contributedValues`, which is `{ctrLink, cpm, verdictMark}`
(`decideAdWriteActions.ts:215-219`). Those move whenever spend moves — so a live ad
takes `withdraw_then_add` on essentially every sync, not only on re-attribution.

**Third, the arithmetic biases toward the mean.** With aggregate count `n`, mean `M`,
the ad's recorded value `A` and its new value `B`:

- correct: `(M·n − A + B) / n`
- code: withdraw → `count = n−1`, `avg = M`; add → `(M·(n−1) + B) / n = (M·n − M + B) / n`

The code subtracts **the mean** instead of **the ad's own value**. Every cycle pulls
the angle's average toward the account mean, compressing the spread between angles —
which is precisely the quantity `ragContext.ts:305` sorts on
(`.sort((a, b) => b.avgLinkCtr - a.avgLinkCtr)`). It is correct only when `A == M`.

**Why the green suite does not catch it.** SC-002 drives **ten identical runs**, which
take the `noop` branch — no withdrawal occurs. No test in `functions/src/__tests__`
asserts `avgLinkCtr` after withdrawing a row whose value differs from the running
mean. The two-row fixtures in `applyLearningWritesLease.test.ts:369-373` assert a
fresh mean (0.03 from 0.02 and 0.04), not a post-withdrawal one.

### D. Preserved Measures — FR-024, FR-025 **S** · FR-026 **S**

`git diff --stat origin/main...HEAD -- functions/src/qararEngine.ts` returns empty
(T064a's own check). Field names, units, and the objective / geo-tier / audience-type
partitions are unchanged.

### E. Funnel Type — FR-027 … FR-032a

| | Verdict | Evidence |
|---|---|---|
| FR-027, FR-032 | **S** | `ByFunnelTypeBreakdown` + explicit `unknown` bucket (`learningAggregates.ts:45,58,66`); `resolveFunnelTypeBucketKey` at `:252`; symmetric decrement at `aggregateDelta.ts:296` |
| FR-028, FR-029 | **S** | funnel type is not part of record identity; headline totals stay all-funnel |
| **FR-030, FR-031, FR-032a** | **N** | there is no weighting. `getTopWinners.ts` contains **zero** occurrences of `funnelType`, `weight`, `creativeCount`, `efficienc` or any FR id, and is untouched by the branch. T049's Batch-18 warning (do not weight on `byFunnelType.count` — row counts, 7.4:1 fan-out) is therefore unconsumed and still live for whoever builds it |

### F. Reading Surfaces — FR-033 … FR-041

| | Verdict | Evidence |
|---|---|---|
| **FR-033** | **N** | the guidance retrieval path is `getTopWinners.ts` — untouched. It still selects per **ad row** (`.collection(adAccountPath).where("campaignObjective","==","conversion").where("verdict","==","🟢")`, `:157-161`), so one creative spanning 55 rows can occupy all five winner slots |
| FR-034, FR-036 | **S** | the activation gate is `RAG_MIN_SAMPLE_SIZE = 10` (`ragContext.ts:126`) tested at `:315`, fed by `sampleSize: a.creativeCount ?? 0` (`:167`) — **10 distinct creatives**, as locked |
| FR-034a, FR-037 | **P** | the **3-creative** floor is enforced in `rankingEngine.ts:177-181` and `:406`, and on the dashboard (`whatsWorkingDashboard.ts:996`). FR-037's *efficiency* half cannot be enforced — there is no sealed figure |
| **FR-035** | **N** | no latch exists. `grep -rniE "latch\|guidanceActive\|activationLatch\|activatedAt"` over live code returns only unrelated Phase-14/saved-project latches. A partial sync that drops the creative count below 10 switches guidance back off |
| FR-036a, FR-036b | **N** | both are statements about PROVISIONAL/SEALED creatives; neither state exists |
| FR-036c | **N** | derivation not implemented |
| FR-038 | **N** | no 3.0 bound anywhere — `grep -nE "3\.0\|EFFICIENCY\|cap\|clamp" aggregateDelta.ts` returns nothing |
| FR-039 | **S** | tier icons still work, gated on `creativeCount` (`whatsWorkingDashboard.ts:996`, `:1021`) |
| FR-040 | **S** | totals are all-time by construction once accumulation is additive |
| FR-041 | **S** | `multiFunnel` derived at `whatsWorkingDashboard.ts:624` and `:823` from `isMultiFunnel` (`:147-159`) |

### G. Retirement — FR-042 … FR-046 → **all S**

`CURRENT_LEARNING_SCHEMA_VERSION = 1` (`types.ts:120`); below-version records read as
absent and are replaced in full (`aggregateDelta.ts:357`, `:404`, `:430`, `:458`).
T024's two assertions are green.

### H. Owner-Facing Language — FR-047, FR-048, FR-049

| | Verdict | Evidence |
|---|---|---|
| FR-047 | **S** for the one string the feature adds | `whats_working.multi_funnel.label` / `.tooltip` at `src/i18n.tsx:550-551` (en) and `:1510-1511` (ar — *"في حملات متعددة"*, *"استخدمتَ هذا الأسلوب في أكثر من نوع من الحملات"*). **T056's owner-review gate has not been exercised** — the audit found no record of it |
| FR-048 | **P** | the new string is clean. The **pre-existing** FR-065 message uses *"المزامنة"* (sync), which is arguably the jargon FR-048 forbids — and its English wording (`sync.result.busy`, `i18n.tsx:168`) differs from the text FR-065 prescribes. This is the FR-059/FR-065 tension the plan already recorded as an owner decision, not a new finding |
| FR-049 | **S, vacuously** | the efficiency figure is shown nowhere because it does not exist |

### I. Verification and Auditability — FR-050 … FR-053

| | Verdict | Evidence |
|---|---|---|
| FR-050 | **S** | `test:phase969` registered and in the `test` chain; 13 phase-969 scripts; `testRegistrationGuard.test.ts` added |
| **FR-051, FR-051a–e** | **N** | there is **no per-sync summary line**. `grep -nE "FR-051\|summary line\|console\.(log\|info)" shared.ts` returns four hits, all unrelated warnings or a comment at `:1319`. FR-051e's guard gap is unchanged: `scripts/sc11Guard.mjs:51` walks `src/` only |
| FR-052 | **S** | a learning failure records into `errors[]` and returns `ran: false` without failing the sync (`applyLearningWrites.ts:385-397`) |
| FR-053 | **S** | `grep -n "getDb\|getFirestore\|admin.firestore" functions/src/learning/*.ts` returns **nothing** — the handle is a parameter throughout |

### J. Serialized Learning Writes — FR-054 … FR-065 → **S**, with two NA

This is the best-built part of the branch.

- `learningLease.ts` — `acquireLearningLease` `:100`, `releaseLearningLease` `:161`,
  `stillHeld` `:185`; single-document transaction, holder identity verified on release
  (`:173`) and pre-commit (`:197`).
- Wired **inside** `runSyncForAccount`: acquire `shared.ts:1418`, fencing re-check
  `:1465`, `try {` `:1508`, `applyLearningWrites` `:1525`, release `:1536`/`:1543`.
- FR-060a ordering: operational commit `:1390-1397` **before** acquisition `:1418`.
- `functions/src/metaSync/lease.ts` unmodified, as T010 required.
- **FR-054c, FR-054d — NA, verified**: both are explicitly recording requirements
  (*"this is recorded so it is not re-litigated"*), and both are so recorded.
- **FR-061 — NA, verified**: a framing requirement about how contention is to be
  interpreted. Nothing in code contradicts it; nothing reports it either, because
  there is no summary line.
- **FR-065 — P**: the bilingual message exists (`i18n.tsx:168`/`:1158`,
  `:520`/`:1484`) with the wording divergence noted under FR-048.

### K. Ledger Durability and Bounded Reads — FR-066 … FR-072b

| | Verdict | Evidence |
|---|---|---|
| **FR-066** | **N** | no no-pruning note at the write site. `grep -n "FR-066\|no-pruning\|never prune" shared.ts` returns nothing. This is a one-line comment task whose absence is self-concealing: it exists to be found by a future author |
| FR-067, FR-068, FR-069 | **S** | chunked by-ID read, chunk size 300, unbounded scan removed. SC-022/023/024 green |
| FR-070 | **S** | field-level discrimination in `fieldLevelDiscrimination.ts`; `fr070.test.ts` behavioural |
| FR-071 | **S** | whole documents, never projections — `boundedLedgerRead.ts:14`, `:100` |
| FR-072 | **P** | the precedence lock is preserved (`fieldLevelDiscrimination.ts:168-176`) and the cascade fields survive `merge: true`. "Each MUST be verified as unchanged" has a test reference only in `boundedLedgerRead.test.ts` |
| FR-072a | **NA**, verified | a re-statement requirement; it is stated |
| **FR-072b** | **S** | a propagated-only row keeps `matchType: null`, so `decideAdWriteActions.ts:162-168` falls through to `tally = "unmatched"`, exactly as required |

### Success criteria

**26 of 56 SCs are referenced by a phase-969 test. 30 are not.**

```
covered:   SC-001 002 003 008 010 012 013 017 017a 018 019 020 022 023 024 025
           029 029a 029b 029c 043 044 045 046 049 050
uncovered: SC-004 005 006 007 009 011 014 015 016 021 026 027 028 030 031 032
           033 034 035 036 037 038 039 040 041 042 042a 047 048 051
```

*Method note*: a naive repo-wide grep reports 34 covered, but SC ids **collide across
specs** — `SC-005`, `SC-006`, `SC-007`, `SC-009`, `SC-011` and `SC-014` match
`cpaEconomics.test.ts`, `sizeVariant.test.ts` and `teamWorkspaceAccess.test.ts`, which
are other features' criteria. The figure above is restricted to `__tests__/phase969/`,
`learning.fixtures.ts`, `whatsWorkingMultiFunnel.test.tsx`,
`patternSummaries.creativeHash.test.ts` and `testRegistrationGuard.test.ts`.

SC-011 is the exception in the uncovered list: it has no id reference but **is**
satisfied behaviourally — see T067 in §6.

---

## 5. The skipped phases, task by task

### Phase 4 — US2 (sealed context, accrual, efficiency)

| Task | Meant to deliver | State | Classification |
|---|---|---|---|
| T028 | sealed target / funnel / timestamp / state on each ad row | **N** | **Independently implementable** |
| T029 | one-way PROVISIONAL→SEALED guard | **N** | **Blocked** on T028 (no state to guard) |
| T029a | `creativeCount` on `ragContext` aggregates | **S** | `ragContext.ts:167` |
| T029b | `creativeCount` on dashboard aggregates | **S** | `whatsWorkingDashboard.ts:585`, `:787`, `:1001` |
| T029c | `creativeCount` on the `Summary` producer | **S** | producer `patternSummaries.ts:463` (`creativeHashes.size`); gate `rankingEngine.ts:177` |
| T030 | earliest-sealing row per creative (FR-012a) | **N** | **Blocked** on T028 |
| T031 | creative state derivation (FR-036c) | **N** | **Blocked** on T028 |
| T032 | operational status recomputes separately | **S, vacuously** | nothing to separate from yet |
| T033 | FR-011 re-evaluation triggers | **N** | **Blocked** on T028 |
| T034 | `accrueDays` per-day, upward-only | **N** | **Independently implementable** — `last7DaysDaily` already arrives (`metaGraph.ts:114`, `:408`) and is already partly consumed (`shared.ts:314`, `:337`). Zero new Graph calls |
| T035 | bounded retention / finalised fold | **N** | **Blocked** on T034 |
| T036, T036a | absent day ≠ zero; naming rule | **N** | **Blocked** on T034 |
| T037 | persist `status` onto `AdDoc` | **N** | **Independently implementable** — `status` is already requested (`metaGraph.ts:83`) and typed (`:145`), read nowhere, and `AdDoc` has no member for it. Pure write-site change |
| T038 | `isStopped` | **N** | **Blocked** on T037 |
| T039–T043 | efficiency figure, FR-077 eligibility, write-once, FR-087, FR-013a | **N** | **Blocked** — on T028 (sealed target), T034 (conversion counts) and T037 |
| T044, T045, T046 | the three Phase-4 test files | **N** | files absent; **blocked** on their subjects |

**T029a/b/c are `[US1]` tasks filed under a Phase 4 heading** (added in batch-09). They
shipped with Phase 3's work. Phase 4's own subject — Amendment 2 — is untouched.

### Phase 5 — US3 (cross-funnel)

| Task | Meant to deliver | State | Classification |
|---|---|---|---|
| T047 | per-funnel-type breakdown + `unknown` bucket | **S** | `aggregateDelta.ts:503`, `learningAggregates.ts:61-66` |
| T048 | funnel type out of record identity; all-funnel headline totals | **S** | one angle, one record |
| T049 | funnel-type **weighting**, never exclusion | **N** | **Independently implementable** — but must build `byFunnelTypeCreativeCount` first, per T049's own Batch-18 note; weighting on `byFunnelType.count` would recreate the 7.4:1 fan-out inflation |
| T050 | per-item floor + efficiency-evidence gate, in creatives | **P/N** | the 3-creative floor exists in `rankingEngine`/dashboard; **neither exists in `getTopWinners.ts`**, and the efficiency half is **blocked** on Phase 4 |
| T051 | bound folded efficiency at 3.0 | **N** | **Blocked** on Phase 4 |
| T052 | cross-funnel tests (SC-005, SC-006, SC-014) | **N** | file absent |

### Phase 6 — US4 (owner sees the all-time truth)

| Task | Meant to deliver | State | Classification |
|---|---|---|---|
| T053 | dashboard reads new shape; tier icons; all-time totals | **P** | `creativeCount` gating and `multiFunnel` shipped; FR-039/FR-040 hold |
| T054 | `getTopWinners` reads new shape | **N** | **Independently implementable.** File untouched; still row-based |
| T055 | activation threshold = 10 distinct creatives, **and latch** | **P** | the 10-creative threshold shipped — in `ragContext.ts`, not `getTopWinners.ts` as the task says. **The latch (FR-035) is absent.** Independently implementable |
| T056 | multi-funnel indication, en + Fusha | **S** | `i18n.tsx:550-551`, `:1510-1511`. **Owner review still outstanding** |
| T057 | `whatsWorkingAllTime.test.ts` (SC-007, 009, 010, 021) | **P** | that file does not exist; `whatsWorkingDashboardMultiFunnel.test.ts` and `src/__tests__/whatsWorkingMultiFunnel.test.tsx` cover SC-010 only |

### Phase 7 — confirmed, not assumed

| Task | State | Evidence |
|---|---|---|
| T058–T063 | **N** | no summary line, no skip-reason breakdown, no provenance breakdown, no days-lost count, no restricted event lines |
| T064 | **N** | `learningObservability.test.ts` absent |
| T064a | **S** | `git diff --stat origin/main...HEAD -- functions/src/qararEngine.ts` → empty |
| T064b | **S** | `t064bEndToEnd.discriminator.test.ts` (1065 lines), registered, green |
| T065 | **N** | no FR-066 note at the write site |
| T066 | **S** | no db handle anywhere in `functions/src/learning/` |
| **T067** | **S — run, not assumed** | `cd functions && npm test` → **EXIT=0**, reaching its final entry `lib/contractFixtures.test.js` (`contractFixtures.test: PASS`). **23 `node:test` suites, 424 pass, 0 fail**, plus the bespoke harnesses |
| T068 | **S** | `quickstart.md:103-105` carries the FR-083 post-deployment follow-up |

---

## 6. What the branch actually does today

**In plain terms.**

**What the nightly sync now records that it did not before.** It keeps a per-angle and
per-visual-pattern tally that **survives** the next sync instead of being overwritten
by it, so evidence builds up over an account's whole history rather than reflecting
only the last three days. It counts an image **once** no matter how many ad
placements Meta split it into — previously one image running in fifty-five placements
counted fifty-five times. It writes a small receipt on each ad row saying exactly what
that row contributed, so the same sync processed twice cannot double-count. It records
which of the owner's funnel types each piece of evidence came from. And it takes a
per-account lock around the whole learning update, so two syncs for one account can no
longer add the same numbers twice.

**What now influences the AI's generation.** Two things, both unchanged in *kind*:
how often an angle gets a **link click** relative to the account average, and how many
**distinct creatives** stand behind that figure. The second is new and is a real
improvement — the "do we have enough evidence yet" gate is now 10 real creatives
(`ragContext.ts:126`, `:167`) instead of 10 ad rows, and the per-item floor is 3
creatives (`rankingEngine.ts:177-181`), so a single image cannot manufacture its own
evidence base by being placed widely.

**What does not influence generation.** The list of past winning ads fed into the
Concept Director — `loadTopWinners` → `pastWinningAds` → `buildPastWinnersBlock`
(`generators.ts:4561-4563`) — is **still selected per ad row**
(`getTopWinners.ts:157-161`), and the file is untouched by this branch. One creative
across many placements can still fill every winner slot there.

### Does any cost or conversion-efficiency signal reach generation?

**No — and the pre-merge check's suspicion is confirmed from the code.**

What a contribution actually carries is fixed at `decideAdWriteActions.ts:215-219`:

```
            contributedValues: {
                ctrLink: varying.metrics.ctrLink,
                cpm: varying.metrics.cpm3d,
                verdictMark: varying.verdict.verdict,
            },
```

- `ctrLink` — link click-through. **This is the ranking signal**: `ragContext.ts:305`
  sorts on `avgLinkCtr`, and `:308` builds the avoid-list from it.
- `cpm` — cost per **thousand impressions**. A media-delivery cost, not a
  cost-per-result. It is stored and is **not** read by any ranking path.
- `verdictMark` — the Qarar verdict letter.

There is **no** cost-per-result, no cost against the owner's target, no conversion
count in the contribution at all. `conversions3d` appears only in `measurementInputs`
(`:220-223`), which exists to detect *change*, never to be ranked on.

The one qualification, stated so this is not read as stronger than it is: the
**pre-existing** `rankingEngine` score carries a flat `conversionBoost` of +2.0 when
`summary.conversionCount > 0` and a `spendBoost` of +1.5 at `spendBackedCount >= 3`
(`rankingEngine.ts:266-270`). Those are **presence** flags — *did it convert at all*,
*was it spend-backed* — not efficiency, and this branch did not add them: its only
change to that file is the `creativeCount` gate migration.

**So the honest characterisation is: the branch learns what gets clicks, more
reliably and over a longer history than before. It does not learn what gets sales.**
Making it do so is Phase 4, and Phase 4 is the part that was not built.

And the finding in §4/C qualifies even the click half: because withdrawals leave the
average untouched while decrementing the count, the click-through figure the AI ranks
on drifts toward the account mean on every sync in which an ad's numbers moved.

---

## 7. What this branch made stale in the spec

The user's concern is correct, and the scale is larger than expected. Twenty-seven
batches rewrote `shared.ts` (3005 lines changed) and cut `learningAggregates.ts` from
777 to 288 lines. **Every `path:line` citation into a file this branch rewrote is now
wrong.**

Of **63 distinct citations** in `spec.md`, all resolve in-range — none is detectably
broken, which is exactly what makes this dangerous. The split:

| | Citations | Status |
|---|---|---|
| Into files the branch **rewrote** (`shared.ts` 22, `learningAggregates.ts` 4, `whatsWorkingDashboard.ts` 2) | **28** | **STALE** |
| Into files the branch **did not touch** (`getTopWinners`, `metaGraph`, `orchestrator`, `lease`, `worker`, `dispatcher`, `linkUnmatchedAd`, `generationDeleteCascade`, `index`, `metaConnection`, `trigger`) | **35** | still valid |

**Every one of the 19 distinct `shared.ts:NNN` line-starts now points at unrelated
text.** Re-resolved against the current tree:

```
shared.ts:170-211  → "};"                      (was: the AdDoc interface)
shared.ts:220      → "frequency3d: number;"    (was: sumSpend3d)
shared.ts:266      → "const adSpend = ..."     (was: aggregateAdMetrics)
shared.ts:294      → "* uses. Pure — no I/O"   (was: the one-aggregated-row note)
shared.ts:796      → "void matchedGenIds;"     (was: result.imageHash = hash)
shared.ts:797      → ""                        (was: matchAdCreative call)
shared.ts:831      → "}"                       (was: the unbounded scan — correctly removed)
shared.ts:864-869  → "imageHash: null,"        (was: the match-link precedence lock)
shared.ts:1015     → "}"                       shared.ts:1190 → "} : null,"
```

Three of these are load-bearing for requirements a later phase would be built against:

1. **The match-link precedence lock**, cited at `shared.ts:864-869` by FR-072a, has
   **moved into a different file**: `learning/fieldLevelDiscrimination.ts:168-176`.
   Anyone implementing FR-072's "verify unchanged" against the spec's citation would
   verify the wrong code.
2. **The "needs linking" filter**, cited at `whatsWorkingDashboard.ts:719` by FR-074f
   as the surface a new `matchType` value would silently empty, is now at **`:853`**.
   `:719` is a comment.
3. **`isEligibleForLearning`**, cited at `learningAggregates.ts:119-124` in **four
   places** (spec lines 289, 291, 299, 651) as the live per-row eligibility predicate,
   **was deleted in Batch 11**. The module says so itself at `learningAggregates.ts:20`:
   *"`isEligibleForLearning`, `round2` — all deleted."* Lines 119-124 now hold
   `schemaVersion?` and `creativeCount?`. The predicate's logic lives on as the private
   `isAdEligible` at `aggregateDelta.ts:302-306`.

Also now stale: `learningAggregates.ts:17`, which `spec.md:250` says *"was not modified
by Phase 970 and is still live in the code"* — Batch 11 replaced it, as the spec's own
by-design section anticipated. And `learningAggregates.ts:120`, cited at `spec.md:289`
as a `matchType` branch site, is now a comment line.

**The recommendation is not to re-cite everything.** It is to add one line to the spec
stating that all `path:line` citations were verified against `origin/main` before
implementation and that `shared.ts`, `learningAggregates.ts` and
`whatsWorkingDashboard.ts` have since been rewritten, so citations into those three
files are historical — plus a targeted fix for the three load-bearing ones above,
because those are the citations a future implementer will actually follow.

---

## 8. Recommended order

Dependencies as the audit found them, not as `tasks.md` assumed them. `tasks.md` has
Phase 5 depending on Phase 4's sealed figure; that is true for the *efficiency* half
of Phase 5 only. The weighting half (FR-030/FR-031) does not depend on Phase 4 at all.

```
0. FIX-FIRST (defects in shipped Phase 3 — do these before any new phase)
   0a. FR-021 withdrawal: use the ledger's recorded ctrLink, which is already
       passed in. aggregateDelta.ts:260-298. Smallest change, largest effect.
   0b. FR-074d + FR-074g: return the resolved generationId and provenance from
       resolveCreativeKeyByAdId, persist both, and aggregate ALL rows.
       learningPerAdLoop.ts:59-75, shared.ts:1046-1054, aggregateDelta.ts:84-92,:210.
   0c. FR-019 write suppression. applyLearningWrites.ts:365-379. Cost, not correctness.
        │
        ├─▶ 1. Phase 4a — the sealing spine  (T028 → T029, T030, T031, T033)
        │       Independently implementable. Nothing else can start without it.
        │         │
        │         ├─▶ 2. Phase 4b — accrual  (T037, T034 → T035, T036, T036a, T038)
        │         │       T034 and T037 are independently implementable TODAY and are
        │         │       the two cheapest items in the whole remainder — the per-day
        │         │       rows and `status` both already arrive and are discarded.
        │         │         │
        │         │         └─▶ 3. Phase 4c — efficiency  (T039 → T040, T041, T042, T043)
        │         │                 Blocked on 4a AND 4b. This is the owner's
        │         │                 "learns what gets sales".
        │         │                   │
        │         │                   └─▶ 5b. T050 efficiency gate, T051 the 3.0 bound
        │         │
        │         └─▶ 4. Phase 6 latch  (T055's FR-035 half) — independent of 4b/4c
        │
        ├─▶ 5a. Phase 5 weighting  (byFunnelTypeCreativeCount → T049)
        │        NOT blocked on Phase 4. Buildable in parallel with 4a.
        │
        ├─▶ 6. Phase 6 retrieval  (T054, T050's creative floor in getTopWinners.ts)
        │        Independently implementable. Closes the last row-counted path
        │        that reaches generation.
        │
        └─▶ 7. Phase 7 observability  (T058-T063, T064, T065)
                 Counts wire in as each phase lands; T060's provenance breakdown
                 needs 0b, T061's days-lost needs 4b.
```

**Where the owner's two decisions sit.** Both are in the unimplemented set, and they
are not equally far away:

- *"each image across all ad groups should have generated at least 5 results minimum"*
  — this is **FR-077's eligibility rule** (5 combined conversions across all
  placements, or stopped with ≥1). It is **step 3** above, behind the sealing spine
  and the accrual. It is the deepest item in the plan and the one the whole of Phase 4
  exists to deliver.
- *upward-only day revision* — **FR-083**, inside **T034**, which is **step 2** and
  independently implementable today. Of the two owner decisions, this one is close.

**Fastest route to the owner's sentence**: 0a → 0b → T037 + T034 (parallel) → T028 →
T039/T040. Everything else can follow.

---

## 9. Merge now, or hold the branch open?

**Recommendation: merge now, and build the remainder as a second PR — but fix 0a
first, and correct the squash message.**

### The case for merging now

What shipped is **coherent and independently valuable**: the branch fixes the owner's
stated defect (learning resetting on every sync), makes the creative the unit of
evidence in the aggregates, and adds a lease that is the safety property everything
else depends on. Section J is the best-built part of the branch, and it is precisely
the part that gets *harder* to land safely the longer other work piles on top of it.

The suite is green end to end — **424 assertions, 0 failures, EXIT=0** — and the merge
itself is a fast-forward with zero conflicts (pre-merge check, same directory).

**The cost of holding is concrete and compounding.** Seventy-three commits against a
`main` that is still moving. The 28 stale citations in §7 are already the product of
this branch diverging from its own spec; every further week of divergence adds more,
and the next implementer reads the spec, not the diff. A branch this size held open
past the point where its own specification has gone stale is how the two systemic root
causes in the Post-21 Drift Audit reproduced themselves.

### The case for holding

`main` would claim a feature it half has. Specifically: **Amendment 2 did not ship at
all**, and the gap is not cosmetic — it is the difference between "learns what gets
clicks" and "learns what gets sales", which is the reason the feature was
commissioned. The four user stories in the spec are 1 delivered, 3 partial.

And the §4/C withdrawal defect means the shipped half is **not merely incomplete but
actively drifting**: the click-through average degrades on every sync with changed
numbers. Merging that into `main` ships a slow corruption of the one signal that does
reach generation, with a green suite standing behind it.

### The trade, stated

Holding buys correctness-on-arrival at the price of an ever-staler spec and a
seventy-three-commit merge that gets riskier weekly. Merging buys a stable base and an
honest history at the price of `main` carrying a known, bounded, documented gap.

**What tips it to merge is that the gap is documentable and the drift is fixable in
one function.** `applyHookAggregateWithdrawal`'s fix is to use a value that is already
computed, already stored on the ledger, and already passed into the function — it is
a small, well-isolated change, not a phase. Fix 0a, then merge; the remaining gap is
then *absence*, which a commit message can state truthfully, rather than *incorrect
behaviour*, which it cannot.

**Three conditions on merging:**

1. **Fix 0a first** (`aggregateDelta.ts:260-298`), with a test that withdraws a row
   whose value differs from the running mean — the case no current test drives.
2. **Correct the squash message.** The draft in
   `reports/squash-commit-message.txt` already removes the conversion-accrual claim,
   but on this audit's evidence it should also not imply that funnel weighting or the
   creative-counted retrieval path shipped. FR-030 and FR-033 did not.
3. **T056's owner review is still outstanding.** The Arabic string is in `main`'s path
   with the plan's Constitution V verdict resting on a review that has not happened.

If any of the three cannot be met, hold — because then the argument for merging (an
honest, bounded gap) no longer holds.

---

## Summary

| Area | State |
|---|---|
| Phases 1, 2 | Shipped whole |
| Phase 3 (MVP) | Shipped with **three defects** — FR-021 withdrawal drift, FR-074d/g propagation inert, FR-019 absent |
| Phase 4 (Amendment 2) | **Not implemented.** Both modules commented out; types dead |
| Phase 5 | Breakdown shipped; **weighting absent** |
| Phase 6 | One string + gates shipped; **retrieval path and latch absent** |
| Phase 7 | Gates and tests shipped; **all six observability tasks absent** |
| Requirements | 123 FRs — roughly 55 shipped, 12 partial, 49 absent, 7 NA |
| Criteria | **26 of 56** SCs covered by a phase-969 test |
| Test chain | **EXIT=0**, reaches final entry, **424 pass / 0 fail** |
| Spec freshness | **28 of 63** citations stale; 3 of them load-bearing |
| Recommendation | **Merge after fixing 0a**, remainder as a second PR |

No implementation code written. No phase started. Nothing merged.
