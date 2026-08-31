# Tasks: Funnel Economics Rebuild

**Input**: Design documents from `/specs/968-funnel-economics-rebuild/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: INCLUDED. The specification explicitly requires them — FR-035c (string enumeration), FR-028a (boundary fixture), SC-004 (every report §6 example as a fixture), constitution XI (parity test), and report §13 ("the §6 worked examples should become fixtures").

**Organization**: Batch 1 stands alone and blocks everything. Batch 2 is grouped by user story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel — different files, no dependency on an incomplete task
- **[Story]**: US1–US7, mapping to spec.md user stories
- Paths are repository-relative from `D:\proads-worktrees\funnel-economics-rebuild`

## Path Conventions

Existing web-app layout: `src/` (Vite frontend), `functions/src/` (Cloud Functions), `scripts/` (build guards). No new top-level directories.

---

## Phase 1: BATCH 1 — Terminology guard (STANDALONE, BLOCKING)

**Purpose**: Strengthen the guard and give it a per-line suppression before any copy is written against it.

**⛔ HARD GATE**: No Batch 2 task may begin until T009 is reported and cleared.

**⚠ Condition**: Pre-existing violations are **REPORTED, NOT SUPPRESSED**. The new mechanism must not be applied to any code not written in this phase. `scripts/.sc11-allowlist` gains no entries and loses none.

- [ ] T001 Strengthen the `PERCENT_SIGN` pattern to `/[\d٠-٩۰-۹]+\s*[%٪]|percent/gi` in `scripts/sc11Guard.mjs` (line ~94), closing Arabic-Indic digits (U+0660–0669), Eastern Arabic-Indic (U+06F0–06F9), and the `٪` character (U+066A) (FR-054)
- [ ] T002 Add per-line suppression parsing to `scripts/sc11Guard.mjs` — recognise `// sc11-allow:<CODE> reason="<text>"` and suppress only that code, only on that physical source line (FR-055, FR-056)
- [ ] T003 Enforce suppression validity in `scripts/sc11Guard.mjs` — hard-fail on a bare `sc11-allow` with no code, an unknown pattern code, or a missing/empty `reason`; no file-level or directory-level variant may be added (FR-055, FR-056)
- [ ] T004 Print every applied suppression with its reason in the guard's output in `scripts/sc11Guard.mjs`, so exceptions are visible on each run rather than silent (FR-057)
- [ ] T005 [P] Add percentage-form tests to `scripts/sc11Guard.test.mjs` — all four forms must trip: `5–10%`, `٥–١٠%`, `5–10٪`, `٥–١٠٪` (FR-054)
- [ ] T006 Add negative-control tests to `scripts/sc11Guard.test.mjs` — bare `(%)` unit labels (`Booking rate (%)`) and bare preset buttons (`50`) must NOT trip (FR-054)
- [ ] T007 Add suppression-mechanics tests to `scripts/sc11Guard.test.mjs` — a valid suppression clears its own code only; a suppression with a missing reason hard-fails; one with an empty reason hard-fails; a bare `sc11-allow` hard-fails; an unknown code hard-fails; a suppression does not leak to adjacent lines (FR-055, FR-056)
- [ ] T007a **Register the guard tests so they actually execute** — `scripts/sc11Guard.test.mjs` is currently run by nothing: `vitest.config.ts:11` limits discovery to `src/**`, root `package.json` `test` is `vitest run`, and `lint` runs the guard but not its tests. Add an explicit runner entry (e.g. a `test:guard` script invoking `node scripts/sc11Guard.test.mjs`, chained into `lint` or `test`) in `package.json` (FR-059)
- [ ] T008 Verify `scripts/.sc11-allowlist` is unmodified and `src/components/FunnelSettingsForm.tsx` is absent from it (FR-056, FR-058)
- [ ] T009 **GATE** — execute the guard tests and capture the **raw runner output showing each test executing by name**; a summary claim that tests passed is NOT acceptable evidence, because the failure mode being guarded against is tests silently not executing (FR-060, SC-017). Then run `npm run lint` repo-wide, re-run the guard with the allowlist disabled, report the full hit list, and **STOP**. Expected per the plan dry run: PASS/0 with the allowlist active, an identical 68 hits across 10 files with it disabled, 0 added and 0 removed (FR-058 — report, do not suppress). Any deviation from that baseline must be reported before Batch 2 begins.

**Checkpoint**: Guard strengthened, suppression mechanism live and tested, hit list reported. Batch 2 unblocked only on explicit clearance.

> **Note — three compounding verification gaps**: (1) `npm run lint` passes identically before and after T001 (dry run: 0 hit-count change), so it cannot validate the strengthening. (2) `scripts/sc11Guard.test.mjs` is executed by no runner today — T007a fixes this. (3) `.github/workflows/ci.yml:34` runs `npm run lint || true`, so the guard **cannot fail CI** regardless. T005–T007 are the only real proof, and only once T007a makes them run. Gap (3) is reported to the product owner, not fixed here (FR-061).

---

## Phase 2: Foundational (blocks every user story)

**Purpose**: The pure module's shared scaffolding. Every story consumes it.

- [ ] T010 Add `commissionRate`, `marginKept`, `bookingRate`, `showUpRate`, `eventAttendanceRate`, `eventCloseRate` to the input interfaces and add `MarginKept` type in `functions/src/cpaEconomics.ts`
- [ ] T011 Add constants `ECONOMICS_VERSION = 2`, `LOW_VALUE_TARGET_THRESHOLD = 0.50`, `ALL_MARGIN_KEPT = [50,60,70]`, `DEFAULT_MARGIN_KEPT = 60`, `DEFAULT_COMMISSION_RATE = 10` to `functions/src/cpaEconomics.ts`, recording alongside `ECONOMICS_VERSION` the FR-041a obligation that any future phase adding a required field MUST bump it
- [ ] T012 Add pure helpers for `spendShare = (100-marginKept)/100` and `netFactor = (100-commissionRate)/100` (FR-001, FR-003) in `functions/src/cpaEconomics.ts`
- [ ] T013 Remove `ECONOMIC_CEILING_MULTIPLIER` and `FULL_FUNNEL_ROAS_FLOOR` from `functions/src/cpaEconomics.ts` — no fallback retained (FR-002)
- [ ] T014 Delete the now-invalid constant assertions for both removed constants from `functions/src/__tests__/cpaEconomics.test.ts` (lines ~26–32)
- [ ] T015 Stamp `economicsVersion: ECONOMICS_VERSION` onto every `DerivedTargets` returned by `deriveAll` in `functions/src/cpaEconomics.ts`
- [ ] T016 Gate `getEffectiveTarget` in `functions/src/cpaEconomics.ts` to return `null` unless `derived.economicsVersion === 2` (R-1, FR-041, FR-041a — the load-bearing safety mechanism)
- [ ] T017 Add validation for `marginKept` (must be 50/60/70, FR-026) and `commissionRate` (0–100 inclusive, FR-027) in `functions/src/cpaEconomics.ts`
- [ ] T017a Change the `computeAdvisories` signature in `functions/src/cpaEconomics.ts` to accept the derived targets, and update its call sites in `functions/src/funnelSettings.ts` — landed **here**, not with US5, so Phases 3–9 build against the final shape rather than breaking mid-phase (F9)
- [ ] T018 Add version-gate fixtures to `functions/src/__tests__/cpaEconomics.test.ts` per `contracts/cpaEconomics.md` §4.7 — including the unstamped `{ free: { effectiveTargetCpl: 630 } }` shape that exists on every production document today

**Checkpoint**: Pure module scaffolding complete; the gate that protects the learning loop is in place and proven.

---

## Phase 3: User Story 1 — Corrected lead-magnet target (P1) 🎯 MVP

**Goal**: A $3,000 coach gets `$12.76` per lead instead of `$630`.

**Independent test**: Configure a lead-magnet-to-call funnel at $3,000 with benchmark midpoints; confirm `12.76`.

- [ ] T019 [US1] Rewrite `deriveTargetCplLeadMagnetCall` in `functions/src/cpaEconomics.ts` as `offerPrice × netFactor × booking × showUp × close`, with `targetCpl = leadValue × spendShare` (FR-005, FR-006)
- [ ] T020 [US1] Add report §6.1 fixtures to `functions/src/__tests__/cpaEconomics.test.ts` — `leadValue 31.89`; targets `15.95` / `12.76` / `9.57` at margin 50 / 60 / 70 (note A-2: the report prints `15.94`; `15.95` is correct)
- [ ] T021 [US1] Add a regression fixture to `functions/src/__tests__/cpaEconomics.test.ts` asserting the same inputs no longer yield the pre-phase `630` (constitution IX — before/after evidence)
- [ ] T022 [US1] Add `bookingRate` and `showUpRate` to `FunnelSettingsDoc`, the save request type, and the coercion/validation paths in `functions/src/funnelSettings.ts` (FR-004, FR-007)
- [ ] T023 [US1] Add booking-rate and show-up-rate number fields to the lead-magnet branch of `src/components/FunnelSettingsForm.tsx`, and relabel the close-rate field per `contracts/uiCopy.md` #1–6

**Checkpoint**: US1 independently shippable with US2's inputs present.

---

## Phase 4: User Story 2 — Owner controls commission and margin (P1) 🎯 MVP

**Goal**: The two hidden numbers become owner-set inputs.

**Independent test**: Set commission 0 vs 10 and confirm targets move by exactly the commission share; move margin across all three presets and confirm the retained-share scaling.

- [ ] T024 [US2] Apply `netFactor` to the free-webinar formula in `functions/src/cpaEconomics.ts` — `offerPrice × netFactor × attendance × buyRate`, then `× spendShare` (FR-008, FR-009)
- [ ] T025 [US2] Add report §6.2 fixtures to `functions/src/__tests__/cpaEconomics.test.ts` — `leadValue 13.50`, target `5.40`
- [ ] T026 [US2] Add margin-scaling fixtures to `functions/src/__tests__/cpaEconomics.test.ts` per `contracts/cpaEconomics.md` §4.8 — ×1.25 at 60→50 and ×0.75 at 60→70 on both free types and on `maxCpa` for both paid types, and assert a ROAS-path-driven paid target does NOT move (SC-005)
- [ ] T027 [US2] Add `commissionRate` and `marginKept` to `FunnelSettingsDoc`, the save request type, validation, and the derived-target call sites in `functions/src/funnelSettings.ts` for **all four** funnel types (FR-023, FR-024, FR-018 OQ-1 override)
- [ ] T028 [US2] Add the sales-commission field to every funnel branch of `src/components/FunnelSettingsForm.tsx` per `contracts/uiCopy.md` #17–18
- [ ] T029 [US2] Add the `marginKept` three-button preset to `src/components/FunnelSettingsForm.tsx`, following the `ROAS_OPTIONS` pattern (`:303-307`, rendered `:677-689`), with bare-number labels `50` / `60` / `70`, **60 preselected** for a new record, and no free-entry input (FR-024, FR-025, FR-025a)

**Checkpoint**: US1 + US2 = minimum viable correction. Both P1 stories complete.

---

## Phase 5: User Story 7 — Incomplete records gate safely, owner not pushed (P1)

**Goal**: Existing records pause targets instead of flooding the learning loop, and the owner is told passively.

**Independent test**: A workspace with a pre-existing record and pre-existing aggregates completes a sync writing zero pass/fail verdicts and changing zero aggregates, while the badge shows and no modal self-opens.

- [ ] T030 [US7] Add `isSettingsComplete(doc)` and `missingRequiredFields(doc)` to `functions/src/funnelSettings.ts` as the single canonical definition, per `data-model.md` §3 — `null`/missing is incomplete, `0` is complete, `hasHto === false` drops the high-ticket fields from the required set (FR-039, FR-050)
- [ ] T031 [US7] Return `complete: boolean` on the `getFunnelSettings` response in `functions/src/funnelSettings.ts`, computed server-side, **always returning the record itself when it exists** — returning `settings: null` for an incomplete record is forbidden (FR-043, FR-049, R-3)
- [ ] T032 [US7] Reject incomplete saves for **all four** funnel types in `functions/src/funnelSettings.ts`, naming every missing field (FR-040a)
- [ ] T033 [US7] Add completeness and `complete`-flag contract tests to `functions/src/__tests__/funnelSettings.contract.test.ts` — including a case asserting an incomplete record is returned rather than nulled
- [ ] T034 [US7] Store the `complete` flag from the existing `getFunnelSettings` probe in `src/App.tsx` (probe at `:4270-4290`) — **read only**, no other change to that file
- [ ] T035 [US7] Render the passive attention marker (the badge) on the Funnel Settings menu entry in `src/App.tsx` (`:1567-1570`), following the `activeWorkspaceNeedsMetaAccount` precedent (`:4192`) — a dot with an accessible label, no modal, no redirect (FR-051)
- [ ] T036 [US7] Verify the `complete` flag is NOT wired into the first-run auto-open effect (`src/App.tsx:4348-4358`) or the `reviewDue` prompt — both continue keying off record existence and review cadence (FR-053)
- [ ] T037 [P] [US7] Add the `funnel_settings_incomplete` structured log to `functions/src/metaSync/shared.ts` — one line per account per sync, never per ad, naming workspace, account, funnel type, and missing fields (constitution VI/VII)
- [ ] T038 [US7] Add missing-field marking and the paused-targets notice to `src/components/FunnelSettingsForm.tsx` per `contracts/uiCopy.md` #27–28 (FR-052)

**Checkpoint**: The learning loop is protected and the gate is discoverable. All P1 stories complete.

---

## Phase 6: User Story 3 — Paid event runs a controlled front-end loss (P2)

**Goal**: A $24 paid event targets `$48.00` instead of being forced to break even.

**Independent test**: Configure a $24 paid event; confirm `48.00` and that both event rate fields persist.

- [ ] T039 [US3] Rewrite `deriveTargetCpa` in `functions/src/cpaEconomics.ts` for `paid_event` — `fullBuyerValue = aov + htoPrice × netFactor × eventAttendance × eventClose`, `ceilingCpa = fullBuyerValue × spendShare`, effective = `min(raw, ceiling)` (FR-011, FR-013, FR-014, FR-015, FR-017)
- [ ] T040 [US3] Apply `netFactor` to the high-ticket term only for `paid_product` in `functions/src/cpaEconomics.ts` — `fullBuyerValue = aov + htoPrice × netFactor × htoConversionRate` (FR-019, OQ-1)
- [ ] T041 [US3] Default `paid_event` `roasTarget` to `0.5` in `functions/src/cpaEconomics.ts` and `functions/src/funnelSettings.ts`, leaving `paid_product` at `1.0` (FR-016, FR-021)
- [ ] T042 [US3] Add report §6.3 fixtures to `functions/src/__tests__/cpaEconomics.test.ts` — `raw 48.00`, `fullBuyerValue 175.88`, `ceiling 70.35`, effective `48.00`, `capApplied false`, plus the 100-buyer sanity check (`17,587.50` net, `12,787.50` profit)
- [ ] T043 [US3] Add the discriminating `paid_product` fixture to `functions/src/__tests__/cpaEconomics.test.ts` per `contracts/cpaEconomics.md` §4.4 — `fullBuyerValue` must be `235.00`, distinguishing it from `211.50` (commission wrongly on `aov`) and `250.00` (no commission)
- [ ] T044 [US3] Add `eventAttendanceRate` and `eventCloseRate` to `FunnelSettingsDoc`, request type, and validation in `functions/src/funnelSettings.ts`, retaining `htoConversionRate` unread on `paid_event` — not cleared, not deleted (`data-model.md` §1)
- [ ] T045 [US3] Replace the single upsell-conversion field with the two event-rate fields in the paid-event branch of `src/components/FunnelSettingsForm.tsx` per `contracts/uiCopy.md` #9–12

**Checkpoint**: Paid event modelled correctly.

---

## Phase 7: User Story 4 — Owner sees which number drives the target (P2)

**Goal**: Both ceilings shown, active path named.

**Independent test**: Confirm both figures render with the ticket path named active; raise the ticket price until the projection path wins and confirm the label follows.

- [ ] T046 [US4] Render both `rawTargetCpa` and `maxCpa` on the paid-event results card in `src/components/FunnelSettingsForm.tsx` (`:722-747`), with the active-path explainer per `contracts/uiCopy.md` #24–26 (FR-032)
- [ ] T047 [US4] Keep the single-figure card for the other three funnel types in `src/components/FunnelSettingsForm.tsx` (FR-033)
- [ ] T048 [US4] Suppress the results card entirely when no target derives, so an incomplete record shows the paused-targets notice instead, in `src/components/FunnelSettingsForm.tsx`

---

## Phase 8: User Story 5 — Unreachable targets are flagged (P3)

**Goal**: The advisory watches the computed target, not the entered price.

**Independent test**: A $200 webinar fires the warning; a $500 webinar does not.

- [ ] T049 [US5] Implement the low-value trigger inside `computeAdvisories` in `functions/src/cpaEconomics.ts` — fire when the **rounded displayed** target is **strictly less than** `0.50`; remove the `LOW_VALUE_THRESHOLD = 9` price trigger (FR-028, FR-029). The signature already changed in T017a
- [ ] T050 [US5] Verify every `computeAdvisories` call site in `functions/src/funnelSettings.ts` passes derived targets and that no call site was missed by T017a
- [ ] T051 [US5] Add report §6.4 advisory fixtures to `functions/src/__tests__/cpaEconomics.test.ts` — fires at `0.36`, silent at `0.90` and `5.40`
- [ ] T052 [US5] Add the boundary fixtures to `functions/src/__tests__/cpaEconomics.test.ts` per `contracts/cpaEconomics.md` §4.6 — raw `0.4999` displays `0.50` and does NOT fire; exactly `0.50` does NOT fire; `0.4949` displays `0.49` and DOES fire (FR-028a)

---

## Phase 9: User Story 6 — Every input explains itself (P3)

**Goal**: Benchmark ranges and plain-language hints on every field, both languages.

**Independent test**: Open each funnel type; confirm guidance renders below every rate field in both languages and survives typing.

- [ ] T053 [US6] Add a hint slot to the `NumberField` helper in `src/components/FunnelSettingsForm.tsx` (`:795-810`) rendering muted text **below** the input — never a placeholder attribute (FR-034)
- [ ] T054 [US6] Add all eight benchmark hints with their `sc11-allow:PERCENT_SIGN` suppressions and reasons to `src/components/FunnelSettingsForm.tsx` per `contracts/uiCopy.md` #2, 4, 6, 7, 8, 10, 12, 18
- [ ] T055 [US6] Add the order-value plain-language hint (FR-036) to `src/components/FunnelSettingsForm.tsx` per `contracts/uiCopy.md` #16 — using «المبلغ الذي يدفعه العميل الواحد عادة», NOT the report's «متوسط…» wording (A-10, R-5)
- [ ] T056 [US6] Rename the high-ticket price and conversion-rate labels in `src/components/FunnelSettingsForm.tsx` (`:670-671`) per `contracts/uiCopy.md` #13–15 (FR-037, A-11)
- [ ] T057 [P] [US6] Add the `funnel.needs_attention` badge string to `src/i18n.tsx` in English and simple Fusha per `contracts/uiCopy.md` §4 — badge string only, no other copy relocated there (FR-035a)

---

## Phase 10: Polish & cross-cutting

- [ ] T058 [P] Add `functions/src/__tests__/funnelEconomicsParity.test.ts` asserting the frontend and backend completeness rules agree across all four funnel types and every missing-field permutation, following the `creativeResolverParity.test.ts` pattern (constitution XI)
- [ ] T059 Append `&& node lib/__tests__/funnelEconomicsParity.test.js` to the `test` script in `functions/package.json` (line ~34) — the manifest is explicit, so an unregistered test compiles and silently never runs (R-6)
- [ ] T060 Re-run the string enumeration per `contracts/uiCopy.md` §5 — confirm exactly 8 suppressions exist in the form, each naming `PERCENT_SIGN` with a non-empty reason, and that none was added to any other string
- [ ] T061 Verify `scripts/.sc11-allowlist` still excludes `src/components/FunnelSettingsForm.tsx` and gained no entries during Batch 2
- [ ] T062 Run `cd functions && npm run build && npm test` and `npm run lint` at the repository root; both must pass
- [ ] T063 Deploy per `quickstart.md` — `Remove-Item -Recurse -Force functions/lib`, `npm run build`, `firebase deploy --only functions`
- [ ] T064 Post-deploy SC-010 verification against a workspace holding both a pre-existing settings record and pre-existing learning aggregates — zero pass/fail verdicts written, `hookPerformance` and `visualPerformance` byte-identical before and after (FR-046), badge visible, **no modal self-opens** (FR-044), one `funnel_settings_incomplete` log line per account
- [ ] T065 Post-deploy: complete the record as the owner would, confirm the target computes, the badge clears, and verdicts resume on the next sync (FR-045)
- [ ] T066 [P] Add a purity assertion to `functions/src/__tests__/cpaEconomics.test.ts` — read `functions/src/cpaEconomics.ts` and verify it imports nothing from `firebase-admin`, `firebase-functions`, or any network client, so the module stays directly unit-testable (FR-047)
- [ ] T067 [P] Add a non-blocking assertion to `functions/src/__tests__/funnelSettings.contract.test.ts` — a firing low-value advisory still computes a target and still permits the save (FR-030)
- [ ] T068 Add an end-to-end gate test asserting an unstamped `derived` payload flows through `evaluateVerdict` to a ⏳ with the incomplete-settings reason and no pass/fail verdict, in `functions/src/__tests__/funnelEconomicsParity.test.ts` (FR-041, FR-042)
- [ ] T069 [P] Add a cross-funnel profit-parity fixture to `functions/src/__tests__/cpaEconomics.test.ts` — a webinar and a lead-magnet funnel at the same offer price, commission, and margin kept must yield the same profit per sale (SC-006, SC-014)
- [ ] T070 Add a rounding-order fixture to `functions/src/__tests__/cpaEconomics.test.ts` using inputs that **differ** under the two orderings — `offerPrice 1000`, `booking 5`, `showUp 65`, `close 25`, `commission 10`, `marginKept 60`: raw leadValue `7.3125`, end-of-chain target **`2.93`**, intermediate-rounded **`2.92`**. Assert `2.93`. A fixture passing under both orderings proves nothing (FR-048, SC-015)
- [ ] T071 Review every new Arabic string for simple Fusha with no Egyptian dialect and record the review in the phase report (FR-038, SC-011, SC-016, constitution V)
- [ ] T072 Report to the product owner that `.github/workflows/ci.yml:34` runs `npm run lint || true`, so the terminology guard cannot fail the pipeline — a decision outside this phase, but the hardening must not be presented as CI-enforced when it is not (FR-061)

---

## Dependencies & execution order

### Phase gating

```
Phase 1 (BATCH 1 — guard)  ⛔ HARD STOP at T009, explicit clearance required
        ↓
Phase 2 (Foundational)      blocks every story
        ↓
   ┌────┴────┬─────────┐
Phase 3    Phase 4   Phase 5      ← all P1
 (US1)      (US2)     (US7)
   └────┬────┴─────────┘
        ↓
Phase 6 → Phase 7   (US3, US4 — P2; US4 depends on US3's dual ceilings)
        ↓
Phase 8   Phase 9   (US5, US6 — P3, independent of each other)
        ↓
Phase 10 (Polish, deploy, post-deploy verification)
```

### Story dependencies

- **US1 + US2 are coupled by design.** US1's formula consumes `netFactor` and `spendShare`, which US2's inputs supply. Phase 2 places both factors in the foundational layer so the two phases can proceed together; neither produces a correct number alone. The spec states this directly: "Together with Story 1 they form the minimum viable correction."
- **US7 depends only on Phase 2** (specifically T016, the version gate) and is otherwise independent of US1–US6.
- **US4 depends on US3** — it renders the two ceilings US3 computes.
- **US5 and US6 are independent** of each other and of US3/US4.

### Parallel opportunities

Genuine parallelism is limited: `cpaEconomics.ts`, `funnelSettings.ts`, and `FunnelSettingsForm.tsx` are each touched by many tasks and cannot be split across agents without conflict. Marked `[P]` tasks are the ones that truly touch a distinct file:

- **T005** — `scripts/sc11Guard.test.mjs`, parallel with T001–T004 in `sc11Guard.mjs`
- **T037** — `functions/src/metaSync/shared.ts`, touched by nothing else
- **T057** — `src/i18n.tsx`, touched by nothing else
- **T058** — a new file

Within Phase 5, T034–T036 (`App.tsx`) can proceed alongside T030–T033 (`funnelSettings.ts`), but T034 needs T031's `complete` flag to exist first.

---

## Implementation strategy

### MVP

**Phase 1 → Phase 2 → Phase 3 + Phase 4.** That delivers the correction itself: `$630 → $12.76`, commission and margin owner-controlled, every report §6 fixture green. Entirely locally verifiable.

**Phase 5 is not optional before deploy.** Without US7's gate, shipping the corrected math to production would let the next nightly sync re-judge historical ads and permanently bake failing verdicts into the learning aggregates. MVP may be *demonstrated* after Phase 4; it must not be *deployed* before Phase 5.

### Incremental delivery

1. Batch 1 → guard hardened, hit list reported, clearance obtained
2. Phases 2–4 → correct numbers, locally proven
3. Phase 5 → safe to deploy
4. Phases 6–9 → remaining funnel types, presentation, advisory, guidance copy
5. Phase 10 → parity, registration, deploy, post-deploy verification

### Task count

| Phase | Tasks | Story |
|---|---|---|
| 1 — Batch 1 guard | 10 (T001–T009, incl. T007a) | — |
| 2 — Foundational | 10 (T010–T018, incl. T017a) | — |
| 3 | 5 (T019–T023) | US1 (P1) |
| 4 | 6 (T024–T029) | US2 (P1) |
| 5 | 9 (T030–T038) | US7 (P1) |
| 6 | 7 (T039–T045) | US3 (P2) |
| 7 | 3 (T046–T048) | US4 (P2) |
| 8 | 4 (T049–T052) | US5 (P3) |
| 9 | 5 (T053–T057) | US6 (P3) |
| 10 — Polish | 15 (T058–T072) | — |
| **Total** | **74** | |
