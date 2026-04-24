---
description: "Task list for HOTFIX-D — Multi-Logo Upload (Box B → Max 5)"
---

# Tasks: HOTFIX-D — Multi-Logo Upload (Box B → Max 5)

**Input**: Design documents from `/specs/953-hotfix-multi-logo/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (input-form.md, sanitizer.md, generator.md), quickstart.md

**Tests**: Included per spec SC-001 and spec S9 (explicit fixture tests HFD.T1–T5 defined in `contracts/generator.md`).

**Organization**: Grouped by the three user stories from spec.md. US1 (P1) = MVP — unblocks the critical business need (multi-logo upload + single-ad render). US2 (P2) extends to carousel/batch. US3 (P3) layers the equal-peer quality rule.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story (US1, US2, US3)
- Setup/Foundational/Polish tasks have no story label
- All file paths are absolute or repo-relative-to-root

## Path Conventions

- **Frontend**: `src/` at repo root (React 19 + Vite 7 + Tailwind CSS 3)
- **Backend**: `functions/src/` (Firebase Cloud Functions v2, TypeScript 5.7)
- **Tests**: `functions/src/contractFixtures.test.ts` (Vitest; existing file, extend with HFD-* cases)

---

## Phase 1: Setup (Baseline Capture)

**Purpose**: Capture the pre-hotfix state so regressions and before/after evidence are clean.

- [x] T001 Verify current branch is `953-hotfix-multi-logo` and working tree is clean: `git status && git branch --show-current`
- [x] T002 [P] Capture baseline test pass/fail state before any edits: `cd functions && npm test 2>&1 | tee /tmp/hfd-baseline.log` and note which contract fixtures (HFC-*, etc.) currently pass
- [ ] T003 [P] Capture the three pre-hotfix render references for regression comparison (SC-006): in the running dev app, render one single ad with exactly 1 logo, save screenshot to `specs/953-hotfix-multi-logo/evidence/pre-1logo.png` — this becomes the "before" reference for the single-logo regression check

**Checkpoint**: Baseline captured. All edits below can proceed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Lift every hard-coded `.slice(0, 1)` cap on `brandLogos` so the data pipeline accepts up to 5 logos end-to-end. This is the structural unblock — without it, no prompt rewrite matters because only 1 logo ever reaches the generator.

**⚠️ CRITICAL**: All 3 user stories depend on this phase. Must complete before any story-phase work starts.

- [x] T004 [P] Lift the parse slice in `src/components/InputForm.tsx` L315: change `(raw.brandLogos || []).slice(0, 1)` to `.slice(0, 5)` so saved projects reload with their full logo set. (Reference: `contracts/sanitizer.md` row 7)
- [x] T005 [P] Lift the four `brandLogos?.slice(0, 1)` sites in `src/App.tsx` (L2100 AB-variations, L3624 single-mode concepts, L3646 carousel-mode concepts, L5530 batch-hooks concepts): change each to `.slice(0, 5)`. Leave `src/App.tsx:3253` (`brandLogos: []`) unchanged — that is a deliberate empty-send for concept generation. (Reference: `contracts/sanitizer.md` rows 3–6)
- [x] T006 [P] Lift the two client-sanitizer sites in `src/services/geminiService.ts` L51 and L263: change both `(… || []).slice(0, 1)` to `.slice(0, 5)`. (Reference: `contracts/sanitizer.md` rows 1–2)
- [x] T007 [P] Lift the backend sanitizer at `functions/src/generators.ts:4192` AND add an audit trace. Replace the single line `const boxB = (inputs.brandLogos || []).slice(0, 1);` with:
    ```ts
    const rawBrandLogos = inputs.brandLogos || [];
    if (rawBrandLogos.length > 5) {
        console.warn(JSON.stringify({
            event: 'brandLogos_truncated',
            received: rawBrandLogos.length,
            keptCount: 5,
            userId: (inputs as any)._userId || null,
        }));
    }
    const boxB = rawBrandLogos.slice(0, 5);
    ```
    This is the terminal defence-in-depth cap with an audit trace (Constitution Principle VII). (Reference: `contracts/sanitizer.md` rule 3, `contracts/generator.md` §1)
- [x] T008 Verify no residual `.slice(0, 1)` on `brandLogos` remains: run `grep -rn "brandLogos.*slice(0, 1)" src/ functions/src/` and `grep -rn "brandLogos.*slice(0,1)" src/ functions/src/`. Both MUST return zero matches. (Reference: `contracts/sanitizer.md` §Verification)
- [x] T009 Verify `src/types.ts:272` still reads `brandLogos?: string[]; // Box B (Max 5)` — no change needed, just confirm the comment is already accurate

**Checkpoint**: The data pipeline now accepts 0–5 logos on every code path. The UI still advertises "Max 1" and the model is still told "ONLY logo allowed" — those are fixed in the story phases below.

---

## Phase 3: User Story 1 - Upload multiple brand logos for one ad (Priority: P1) 🎯 MVP

**Goal**: A user can upload 3 brand logos into Box B, see all three previewed in the form with a correct "Max 5" label and pluralized "logos" counter, and render a single ad where all three brand marks appear as distinct elements. Overflow uploads are handled with partial-accept behavior.

**Independent Test**: Follow `quickstart.md` S1 (UI sanity), S2 (overflow UX), S3 (3-logo single-ad render), S6 (zero-logo invariant preserved), and S10 (single-logo regression parity). Expected: all assertions pass; HFD.T1, HFD.T3, HFD.T4 fixtures pass.

### Implementation for User Story 1

- [x] T010 [US1] Update the brand-assets capacity badge in `src/components/InputForm.tsx:2297` from `<span>Max 1</span>` to `<span>Max 5</span>`.
- [x] T011 [US1] Pluralize the top-section summary badge in `src/components/InputForm.tsx:2272`: change the string `{(inputs.brandLogos?.length || 0)} logo` to `{(inputs.brandLogos?.length || 0)} logos`.
- [x] T012 [US1] Rewrite the capacity branch of `handleFileUpload` in `src/components/InputForm.tsx` (around L836–862). Replace `max = category === 'personal' ? 5 : 1` with `max = 5` for the brand branch (personal remains 5). Replace the early-return `if (current + newFiles.length > max) { setError(...); return; }` with partial-accept logic per `contracts/input-form.md` §Handler: handleFileUpload:
  - Compute `remaining = max - current`, `accepted = newFiles.slice(0, remaining)`, `rejectedCount = newFiles.length - remaining`.
  - If `accepted.length > 0`, compress and append only `accepted` to state.
  - If `rejectedCount > 0`, `setError` with the count-naming message (English: `Only ${max} logos allowed — ${rejectedCount} extra file(s) ignored.`; Arabic form when `appLang === 'ar'`).
  - If `accepted.length === 0`, do not mutate state; only `setError`.
- [x] T013 [US1] Apply the identical partial-accept rewrite to the brand branch of `handleDrop` in `src/components/InputForm.tsx` (around L954–975). Same 4-step control flow as T012. (Reference: `contracts/input-form.md` §Handler: handleDrop)
- [x] T014 [US1] Rewrite the single-ad CRITICAL BRANDING RULE in `functions/src/generators.ts` L2406–2409. Replace the line `If Box B contains a logo, it is the ONLY logo allowed.` with the multi-logo equal-peer rule per `contracts/generator.md` §2.2. Keep the two preceding lines (`Render ONLY...` and `If Box B is empty...`) unchanged.
- [x] T015 [US1] Rewrite the concept-plan BRANDING fragment in `functions/src/generators.ts` L2108: replace `Integrate Box B logos as physical objects (e.g. on laptop, mug, wall).` with the length-aware version from `contracts/generator.md` §2.1 that names the count and includes the equal-peer clause when `length > 1`. Preserve the `"No logos provided."` else branch.

### Tests for User Story 1

- [x] T016 [P] [US1] Add fixture HFD.T1
- [x] T017 [P] [US1] Add fixture HFD.T3
- [x] T018 [P] [US1] Add fixture HFD.T4
- [x] T019 [US1] Run the backend test suite to validate T016–T018

**Checkpoint**: MVP complete. User can upload 3 logos, see "Max 5" label, get partial-accept on overflow, and render a single ad where all 3 logos appear. Fixture tests T016–T018 confirm the single-ad prompt contract. `quickstart.md` S1, S2, S3, S6, S10 should all pass at this point.

---

## Phase 4: User Story 2 - Multi-logo support in carousel and batch (Priority: P2)

**Goal**: When a user runs a carousel or batch generation with N logos uploaded, every slide and every variant receives the full set of N logos and renders them.

**Independent Test**: Follow `quickstart.md` S4 (2-logo × 5-slide carousel) and S5 (3-logo × 4-variant batch). Expected: every slide and every variant shows all uploaded logos; HFD.T2 fixture passes.

### Implementation for User Story 2

- [x] T020 [P] [US2] Rewrite the BEFORE/AFTER split-screen BRANDING_LOGIC in `functions/src/generators.ts` L3090. Replace the single-logo AR/EN conditional with the multi-logo version per `contracts/generator.md` §2.3 (AR: `شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل...`; EN: `Box B logos (up to 5) if present — all at comparable size...`).
- [x] T021 [P] [US2] Apply the identical rewrite to the second BEFORE/AFTER occurrence at `functions/src/generators.ts` L3106. Same AR/EN content as T020. (Reference: `contracts/generator.md` §2.3)
- [x] T022 [P] [US2] Rewrite the AR concept-template BRANDING_LOGIC placeholder in `functions/src/generators.ts` L3137: replace `[منطق وضع الشعار من Box B إن وجد.]` with `[منطق وضع شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل وموضع متوازن، بدون شعار مهيمن.]`. (Reference: `contracts/generator.md` §2.4)
- [x] T023 [US2] Pluralize the carousel continuity rule in `functions/src/generators.ts` L5138: change `8. SAME BRAND ELEMENTS: Same logo placement, same brand colors, same badge design.` to `8. SAME BRAND ELEMENTS: Same logo placements (for all uploaded logos), same brand colors, same badge design.`. (Reference: `contracts/generator.md` §2.6)

### Tests for User Story 2

- [x] T024 [US2] Add fixture HFD.T2
- [x] T025 [US2] Run the backend test suite

**Checkpoint**: Carousel and batch modes now propagate all uploaded logos to every slide/variant. `quickstart.md` S4 and S5 should pass.

---

## Phase 5: User Story 3 - Equal-peer logo rendering (Priority: P3)

**Goal**: When 2+ logos are uploaded, the rendered output treats all logos as equal peers — comparable size, balanced placement, no single logo made dominant, upload order carries no prominence meaning.

**Independent Test**: Follow `quickstart.md` S7 (Arabic 2-logo equal-peer phrase present). Also visually inspect a 3-logo rendered ad and confirm no logo is disproportionately larger. Expected: HFD.T5 fixture passes; Arabic equal-peer phrase `بحجم متماثل` appears in the prompt.

### Implementation for User Story 3

- [x] T026 [US3] Rewrite the LOGO STRICTNESS rule in `functions/src/generators.ts` L5071. Replace the current singular block (`...render that image once as a physical artifact in the scene.`) with the multi-logo equal-peer version per `contracts/generator.md` §2.5: "If Box B has one or more images (up to 5), render each as a distinct physical artifact in the scene — all at comparable size, balanced placement, no single logo dominant, no one mark enlarged relative to the others. Upload order has no prominence meaning." Preserve the `Render ONLY user-provided branding from Box B.` and `If Box B is empty, ... 100% free of any logos or branding marks.` rules.

### Tests for User Story 3

- [x] T027 [US3] Add fixture HFD.T5
- [x] T028 [US3] Run the backend test suite one last time

**Checkpoint**: Equal-peer rule is in force across every branding prompt fragment (single-ad, BEFORE/AFTER carousel, AR template, LOGO STRICTNESS). `quickstart.md` S7 should pass.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Full quickstart validation, final grep sweeps, and commit hygiene.

- [x] T029 [P] Run the full frontend type-check and lint: `npm run build && npm run lint`. No new errors vs pre-hotfix baseline from T002.
- [x] T030 [P] Run the full backend test suite end-to-end: `cd functions && npm test`. No new failures vs baseline.
- [ ] T031 [P] Run the quickstart manual QA walkthrough `specs/953-hotfix-multi-logo/quickstart.md` steps S1–S10 in the dev environment. All exit criteria MUST pass.
- [x] T032 Final grep sweep to confirm zero residuals
- [ ] T033 Capture the post-hotfix single-logo render under the same inputs as T003
- [ ] T034 Prepare the commit.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — can start immediately.
- **Phase 2 (Foundational)**: Depends on Setup (T001). BLOCKS all user stories.
- **Phase 3 (US1 — MVP)**: Depends on Phase 2 completion.
- **Phase 4 (US2)**: Depends on Phase 2 completion. Independent of Phase 3 (no code overlap). Can run in parallel with Phase 3 if staffed.
- **Phase 5 (US3)**: Depends on Phase 2 completion. Independent of Phases 3 and 4 (touches L5071, a line neither phase edits). Can run in parallel with Phase 3 and 4.
- **Phase 6 (Polish)**: Depends on Phases 3–5 all complete.

### User Story Dependencies

- **US1 (P1)**: Foundational only.
- **US2 (P2)**: Foundational only. Does NOT depend on US1 — its prompt edits are at different line ranges (L3090, L3106, L3137, L5138) from US1's (L2108, L2406–2409).
- **US3 (P3)**: Foundational only. Its prompt edit is at L5071, distinct from US1 and US2.

### Within Each User Story

- Prompt-text edits before fixture test adds (fixture needs the edit to exist before it can assert against it).
- Fixture test adds before running the test suite for that story.

### Parallel Opportunities

- **Phase 1**: T002 and T003 in parallel.
- **Phase 2**: T004, T005, T006, T007 all in parallel (4 different files). T008 and T009 are verification — run after T004–T007 land.
- **Phase 3**: T010, T011 touch the same file (`InputForm.tsx`) — not [P] with each other; fine to sequence. T012, T013 also in the same file. T014, T015 in the same file (`generators.ts`) — also sequential. T016, T017, T018 are test-file edits that touch the same file but can be written in one pass; marked [P] because logically independent.
- **Phase 4**: T020, T021, T022 all touch different line regions of `generators.ts` — can be written in the same edit pass; marked [P] because they're logically independent prompt-block edits. T023 is an independent single-line change.
- **Phase 5**: T026 is the only prompt edit. T027 is the only test. Sequential.
- **Phase 6**: T029, T030, T031 can run in parallel.

### Cross-phase parallelism (with multiple developers)

After Phase 2 completes:
- Developer A: Phases 3 + 6 verification on US1
- Developer B: Phase 4 (US2)
- Developer C: Phase 5 (US3)

All three can work concurrently because their prompt-text edits target non-overlapping line ranges in `generators.ts` and entirely different files otherwise.

---

## Parallel Example: Phase 2 (Foundational — slice lifts)

```bash
# Launch all four slice-lift edits concurrently (different files):
Task: "Lift slice in src/components/InputForm.tsx:315 to .slice(0, 5)"
Task: "Lift slice in src/App.tsx (L2100, L3624, L3646, L5530) to .slice(0, 5)"
Task: "Lift slice in src/services/geminiService.ts (L51, L263) to .slice(0, 5)"
Task: "Lift slice in functions/src/generators.ts:4192 to .slice(0, 5)"
```

## Parallel Example: Phase 3 (US1 fixture tests)

```bash
# After the US1 prompt edits (T014, T015) land, write all three fixtures together:
Task: "Add HFD.T1 3-logo single-ad fixture to functions/src/contractFixtures.test.ts"
Task: "Add HFD.T3 0-logo empty-branding fixture to functions/src/contractFixtures.test.ts"
Task: "Add HFD.T4 7-logo oversized fixture to functions/src/contractFixtures.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup): T001–T003.
2. Complete Phase 2 (Foundational): T004–T009. All slice lifts land. Pipeline accepts 5 logos.
3. Complete Phase 3 (US1): T010–T019. Upload UX and single-ad prompt rewrites land. Fixtures pass.
4. **STOP and VALIDATE**: `quickstart.md` S1, S2, S3, S6, S10. If green → demo-ready MVP.
5. Optionally ship US1 independently — it is the 80% of business value.

### Incremental Delivery

1. Setup + Foundational → pipeline unblock (invisible to users).
2. Add US1 (P1) → test `quickstart.md` S1–S3, S6, S10 → demo-ready MVP for multi-logo single ads.
3. Add US2 (P2) → test S4, S5 → carousel + batch users can now use multi-logo.
4. Add US3 (P3) → test S7 + visual inspection → quality rule verified; equal-peer language locked in across all modes.
5. Polish → final QA + commit.

### Parallel Team Strategy (3 developers)

With 3 developers after Phase 2 lands:
- Developer A: Phase 3 (US1) — UI + single-ad prompt
- Developer B: Phase 4 (US2) — carousel/batch prompt edits
- Developer C: Phase 5 (US3) — LOGO STRICTNESS rewrite

All three edit different line regions of `functions/src/generators.ts` plus completely different other files; low merge-conflict risk. Resolve any overlap in `contractFixtures.test.ts` at commit time (all three add independent fixture cases).

---

## Notes

- [P] tasks = different files OR logically independent within the same file; verify no conflict before parallel execution.
- [Story] labels map tasks to the stories in `spec.md`; Setup/Foundational/Polish intentionally carry no label.
- Each user story should remain independently completable and testable — confirmed by the line-range disjointness table above.
- No new files are created anywhere in this hotfix (except optional evidence screenshots under `specs/953-hotfix-multi-logo/evidence/`).
- No schema migrations. No new storage paths. No new dependencies.
- Commit after each checkpoint (end of Phases 2, 3, 4, 5, 6) or as a single squashed commit on the branch — match the project's hotfix-style commit history convention from HOTFIX-C.
