---
description: "Task list for Phase 24B — Conditional Copy Fields (Optional Fields Plumbing)"
---

# Tasks: Phase 24B — Conditional Copy Fields (Optional Fields Plumbing)

**Input**: Design documents from `specs/960-conditional-copy-fields/`
**Prerequisites**: plan.md, spec.md, research.md (D1–D10), data-model.md, contracts/ (copy-parser, step2-ui), quickstart.md
**Branch**: `phase-24-conditional-copy`

**Tests**: INCLUDED — the spec mandates them (FR-016, SC-009): the "intentionally absent vs failed to parse" distinction must be explicitly tested. Both T19 and T20 are flagged PARANOID CHECKPOINTS.

**Organization**: Tasks grouped by user story. Backend (`functions/`) and frontend (root) are separate build targets, so US1 (frontend) and US2 (backend) are independently buildable/testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no incomplete dependency)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)

## ⚠️ Central design constraint (read before any task — research.md D1/D2)

- Absent optional field ⇒ value is **`null`**, NEVER `""`, NEVER a placeholder (FR-006). The three optional fields widen `string → string | null`. `hookText` stays required `string`.
- `null` alone cannot encode "failed to parse," so a separate **`CopyFieldStatus` = `present | absent | parse_failure`** carries that distinction (FR-007/FR-008).
- The type widening is the primary risk: it forces a null-guard at every site that calls a string method on an optional field. The TS build (`cd functions && npm run build`, `npm run build`) is the gate — resolve every error with a real guard, **never a cast**.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a known-green baseline before any change (Constitution IX — before/after evidence).

- [ ] T001 Capture pre-change baseline: run `cd functions && npm run build && npm test`, then `npm run build` and `npm run lint` at repo root; record that all pass (or note any pre-existing failures) so post-change regression (SC-008) is provable.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared type vocabulary + additive trace plumbing used by both stories. All tasks here are **additive and non-breaking** (builds stay green).

**⚠️ CRITICAL**: Complete before US1/US2 implementation.

- [ ] T002 Add `CopyFieldStatus` union (`"present" | "absent" | "parse_failure"`) and `CopyFieldStatuses` interface to `functions/src/types.ts`, with a top comment documenting the `null`-as-absent convention per data-model.md.
- [ ] T003 [P] Mirror the `CopyFieldStatus` union in `src/types.ts` (frontend), matching the backend definition exactly.
- [ ] T004 Add additive optional `copyFieldStatus` sub-object to `ResolutionTrace` in `functions/src/types.ts` — four per-field statuses plus `degradedToAbsent?: ("subheadText"|"ctaName"|"benefitText")[]` and `dedupBlanked?: ("subheadText"|"ctaName"|"benefitText")[]` (additive only, no migration; mirror `culturalViolation` shape at ~263–267).
- [ ] T005 Add `setCopyFieldStatus(status)` builder method to `TraceBuilder` in `functions/src/resolutionTrace.ts` (mirror `setClaimFlags` at ~71); ensure it is written before `persistTrace` (270–278).

**Checkpoint**: Both build targets still green (all additive). User stories can now begin.

---

## Phase 3: User Story 1 - Step-2 UI renders cleanly when copy fields are absent (Priority: P1) 🎯 MVP

**Goal**: Step-2 renders a hook variation with fewer than 4 fields cleanly — no empty boxes/labels/placeholders, per-field regenerate buttons hidden (not disabled) for absent fields, Arabic RTL intact. PARANOID CHECKPOINT (T19).

**Independent Test**: Feed step-2 stubbed `HookVariation` objects with each field set (headline-only; headline+subhead; etc.) and assert via DOM-node **absence** (not CSS visibility) that absent fields and their regenerate buttons produce zero nodes, in LTR and Arabic RTL.

### Tests for User Story 1

- [ ] T006 [P] [US1] Create step-2 render test `src/__tests__/step2OptionalFields.test.tsx` covering contract rows U2 (headline-only → only headline, no nodes for absent subhead/CTA/benefit), U3 (CTA absent), U4 (absent field's regenerate button NOT in DOM), U5 (present field's button present), U6 (Arabic RTL preserved for present fields). Write to FAIL before implementation.

### Implementation for User Story 1

- [ ] T007 [US1] Widen the three optional fields to `string | null` (keep `hookText: string`) in `src/types.ts`: `TextOverride` (358–363), `CarouselSlideCopy` (365–370, the `ctaText`/`subheadText`/`benefitText`), `HookVariation` (706–714).
- [ ] T008 [P] [US1] In `src/utils/hookVariationParser.ts` (parse + `extractClaimFlags` ~32–44, 137), map empty/whitespace-only optional fields to `null` (never `""`) when constructing `HookVariation`; keep `claimFlags` extraction unchanged; do not emit an "absent" hookText.
- [ ] T009 [US1] In `src/App.tsx` field extraction (6484–6500), normalize `getSection` empty/whitespace results to `null` for `subhead`/`ctaText`/`benefitText`; leave `hookText` handling intact (remove the `actionParts[1] || ""` and `|| t('default.cta')` fallbacks that mask absence — substitute `null`).
- [ ] T010 [US1] In `src/App.tsx`, gate the render of subhead (single 6593; carousel 6413) and CTA/benefit (single 6602–6610; carousel 6427–6428) on truthiness so an absent field produces **zero** DOM nodes; preserve the loading-state branch (`...Generating…` while `isLoadingItem`) per UINV-5; benefit is already guarded at 6602–6610 — extend the same pattern to subhead and CTA.
- [ ] T011 [US1] In `src/App.tsx`, conditionally render the three per-field regenerate buttons — hook (6587), subhead (6594), CTA+benefit (6611) — only when the corresponding field is present; remove from DOM (not `disabled`/opacity) when absent (FR-004, UINV-2). The hook button always renders (hook is never absent).
- [ ] T012 [US1] In `src/App.tsx`, confirm no add-field affordance exists/was introduced (FR-004/Q4), and that the `"⚠️ Hook unavailable"` fallback (6586) remains an error-only path, never the normal absent path (UINV-4).

**Checkpoint**: `npm run build` (frontend) green; T006 tests pass; SC-001/SC-002 demonstrable. **MVP slice complete.**

---

## Phase 4: User Story 2 - Parser distinguishes "intentionally absent" from "failed to parse" (Priority: P1)

**Goal**: Backend parser represents absent optional fields as `null` (never `""`/placeholder), distinguishes `absent` from `parse_failure`, retries+degrades optional parse failures, normalizes dedup-blanks to `null`, keeps `hookText` mandatory, and records status in the trace. PARANOID CHECKPOINT (T20) — the hardest invariant.

**Independent Test**: Run `cd functions && npm test` against outputs that (a) legitimately have <4 fields and (b) are malformed; assert (a) → `null` + `absent`, (b) → `parse_failure` + `null` after retry + a logged warning, with zero cross-contamination.

### Tests for User Story 2

- [ ] T013 [P] [US2] Create `functions/src/__tests__/conditionalCopyFields.test.ts` covering contract rows P2 (headline-only → 3× `null`+`absent`, none `""`), P3 (malformed optional → retry → `parse_failure`+`null`+log), P4 (`validateCopyFidelity` passes with `null` optionals), P5 (dedup-blank → `null`+`absent`), P6 (whitespace-only → `null`+`absent`), P7 (empty `hookText` hard-fails, never `absent`), P8 (present field keeps claimFlag/Phase-22), P9 (absent vs parse_failure no cross-contamination, SC-004). Write to FAIL first.
- [ ] T014 [P] [US2] Extend `functions/src/__tests__/copyQuality.test.ts` with parser-level absent-vs-failure assertions for `extractCopyFieldsFromResponse` (statuses returned; no `""` at rest).

### Implementation for User Story 2

- [ ] T015 [US2] Widen the three optional fields to `string | null` (keep `hookText: string`): `OwnedRenderText` (`functions/src/generators.ts` 536–541), `CopyFidelityFields` (`functions/src/buildPlanSlotMap.ts` 684–689), `TextOverride` (`generators.ts` 972–974), `CarouselSlideCopy` (`generators.ts` 978–980).
- [ ] T016 [US2] Rework `resolveOwnedRenderText` (`generators.ts` 566–623): return `null` for genuinely-absent optional fields (drop the `benefitText = ""` default at 604 and the `ctaName = inputs.cta` fallback at 603 that mask absence); treat whitespace-only as `null`; keep marker parsing, the newline fallback (583–588), and marker stripping (595–601).
- [ ] T017 [US2] In `extractCopyFieldsFromResponse` (`generators.ts` 672–680), compute and return `CopyFieldStatuses` (data-model option b): `absent` when a field's marker is missing or its block is empty/whitespace; `parse_failure` when a marker is present but its block is unreadable/malformed; `present` otherwise. Keep `extractClaimFlagsFromResponse` ordering.
- [ ] T018 [P] [US2] Add a `null`-guard to `validateCopyFidelity` (`functions/src/buildPlanSlotMap.ts` 696–740): the NFC normalize at ~702 must not throw on `null`; null optional fields are skipped (pass), exactly like empty today (724–739); keep the `hookText` empty/missing hard-fail (710–714).
- [ ] T019 [US2] In the copy-fidelity retry loop (`generators.ts` 4560–4615): on an optional-field `parse_failure`, retry within `MAX_COPY_FIDELITY_ATTEMPTS`; after the cap, emit a `console.warn` (surfaced, not silent) and degrade the field to `null` + status `parse_failure` so the ad ships (FR-008/SC-010); extend the best-plan selector (4577–4589) to also prefer fewer `parse_failure` statuses; route a `hookText` failure to the existing hard-fail/retry path — `hookText` is never degraded to absent (D5/FR-002).
- [ ] T020 [US2] In the dedup/QA block (`generators.ts` 5388–5427), set blanked optional fields to `null` (not `''`) and mark status `absent`; keep every dedup rule (exact 5394–5405, near-dup 5407–5414) and compact-ratio truncation (5416–5426 — truncated output stays `present`, it is not absence) unchanged (OOS-004).
- [ ] T021 [US2] Populate `resolutionTrace.copyFieldStatus` via `TraceBuilder.setCopyFieldStatus()` where the trace is assembled (near claimFlags set ~5315): record the four final statuses plus `degradedToAbsent[]` (from T019) and `dedupBlanked[]` (from T020) (Constitution VI/VII, D6).
- [ ] T022 [US2] Resolve all remaining `cd functions && npm run build` errors caused by the widening with real null-guards (no casts) — known sites: cultural-compliance per-field scan (`generators.ts` 4670–4701), copy length log (5146–5149), and any consumer of the widened interfaces; `buildFinalImagePrompt` truthiness conditionals (5170–5175) already handle `null` (verify, no change).

**Checkpoint**: `cd functions && npm run build` green; T013/T014 tests pass; SC-003/004/005/010/011 demonstrable.

---

## Phase 5: User Story 3 - Existing step-2 actions work on whatever fields are present (Priority: P2)

**Goal**: Approve, Edit, AI-Edit, Batch, and the Phase 23.A variation carousel operate on present fields without assuming absent ones; the inline editor never writes `""` back into the data model.

**Independent Test**: On variations missing one+ optional fields, exercise each action and scroll the variation carousel; confirm each completes and acts only on present fields, and an emptied editor input saves as `null`.

### Tests for User Story 3

- [ ] T023 [US3] Add to `src/__tests__/step2OptionalFields.test.tsx` a test for the variation carousel with mixed field counts across positions rendering cleanly + arrow/dot nav working incl. Arabic next=leftward (contract U8). (Same file as T006 → sequential, not [P].)
- [ ] T024 [US3] Add to the same test file a test asserting the inline editor saves an emptied optional input as `null`, not `""` (U10/UINV-3).

### Implementation for User Story 3

- [ ] T025 [US3] Verify/adjust `handleApproveTov` (`src/App.tsx` 4022, invoked 6630) so approval carries only present fields and does not synthesize empty fields from the absent ones (U9).
- [ ] T026 [US3] In the inline editor (`src/App.tsx` 6550–6582) + `editHookData` state (1758) + `handleInlineHookSave`: initialize absent fields as empty inputs for editing, but normalize an untouched/emptied optional input back to `null` on save (U10/UINV-3) — the one transient place `""` is allowed must not leak into stored state.
- [ ] T027 [US3] Verify `handlePrecisionHookEdit` AI-Edit (`src/App.tsx` 3948) operates on present markers and tolerates an absent subhead (it already validates `HOOK_TEXT` presence) (U10).
- [ ] T028 [US3] Verify Batch (`src/App.tsx` 6849–6898) extracts `hookRaw` per selected hook and tolerates an absent subhead (does not assume `SUBHEADLINE` exists); each variation processed against its own present fields (U11).
- [ ] T029 [US3] Verify the variation carousel (`src/App.tsx` 6744–6809) renders each position through the US1 truthiness guards with mixed field counts; reference (pos 0) vs variation (pos 1..N) field reads (6460, 6800) both honor `null`; RTL navigation intact (U8/FR-012).

**Checkpoint**: All step-2 actions + carousel work with <4 fields; SC-007 demonstrable.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final gates, regression proof, evidence capture (Constitution IX).

- [ ] T030 Run quickstart §1 build gates: `cd functions && npm run build`, `npm run build` (root), `npm run lint` — zero TypeScript errors, zero new lint errors. Also verify FR-017 (no omission-instruction change): `git diff` the prompt constants `HOOK_GENERATION_RULES`, `SUBHEADLINE RULES`, and `SYSTEM_TOV` in `functions/src/generators.ts` / `functions/src/copywriting_knowledge.ts` and confirm none were modified to tell the model when to omit a field.
- [ ] T031 Run full suites: `cd functions && npm test` and the frontend test runner — all green including pre-existing tests (regression proof, SC-008).
- [ ] T032 [P] Execute quickstart §3–§4 manual UI verification (each field-set scenario in LTR + Arabic) and §5 trace audit (`resolutionTrace.copyFieldStatus`, `degradedToAbsent[]`, `dedupBlanked[]`); capture before/after evidence per Constitution IX.
- [ ] T033 [P] Update the Phase 24 entry status note in `docs/LAUNCH_MATRIX.md` to reflect Phase B (T19/T20) implemented + verified (do not mark deployed — deploy is out of scope, OOS-006).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: after Setup; additive/non-breaking; BLOCKS US1/US2.
- **US1 (Phase 3, P1)**: after Foundational. Frontend build target. Independently testable (stubbed `HookVariation`).
- **US2 (Phase 4, P1)**: after Foundational. Backend build target. Independent of US1 (separate build target).
- **US3 (Phase 5, P2)**: after **US1** (reuses US1 render guards + widened frontend types). Independent of US2 at runtime.
- **Polish (Phase 6)**: after all desired stories.

### Critical notes

- The type widening (T007 frontend / T015 backend) **breaks its build target until the guards in that story are complete** — this is expected; each story's checkpoint restores a green build. Because `functions/` and root are separate build targets, US1 and US2 do not block each other's build.
- `hookText` is never `absent` (T012, T019) — enforced in both layers.

### Within each story

- Tests (T006; T013/T014) written FIRST and FAIL before implementation.
- Types widened before consumers guarded (T007→T008/T009/T010/T011; T015→T016…T022).

### Parallel Opportunities

- T003 [P] (frontend type) alongside backend foundational tasks.
- Once Foundational done, **US1 and US2 can be built in parallel by two people** (separate build targets).
- T013 [P] + T014 [P] (different test files) together; T006 [P] (frontend) alongside backend test authoring.
- T032 [P] + T033 [P] (manual verify + docs) together at the end.

---

## Parallel Example: Foundational + start of both P1 stories

```bash
# Foundational parallel slice:
Task: "T003 [P] Mirror CopyFieldStatus in src/types.ts"

# After Foundational, two devs in parallel (separate build targets):
Dev A (US1 frontend): T006 → T007 → T008/T009 → T010 → T011 → T012
Dev B (US2 backend):  T013/T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** (step-2 renders cleanly with stubbed absent fields; SC-001/SC-002) → demoable MVP slice.

> Note: US1 and US2 are both **P1**; the *functionally complete* feature requires both (the backend must actually emit `null`/status for US1 to show real absent fields). US1-as-MVP is the demoable UI slice using stubbed data; ship the P1 pair (US1+US2) together for a real end-to-end increment.

### Incremental Delivery

1. Setup + Foundational → foundation ready (green builds).
2. US1 → frontend renders absent fields cleanly (stub-tested).
3. US2 → backend emits `null` + status; wire real data end-to-end.
4. US3 → actions + carousel verified with fewer fields.
5. Polish → build/test gates + manual + trace evidence.

### Notes

- [P] = different files, no incomplete dependency. Same-file tasks are sequential.
- Resolve every widening-induced TS error with a real null-guard — **never a cast**.
- Commit after each task or logical group; keep `functions/lib` rebuild for deploy time (out of scope here).
- Gate order per spec: implement → Claude Code audit → CodeRabbit → owner approval → deploy.
