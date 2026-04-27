---
description: "Task list for Brand Colors — End-to-End Consistency"
---

# Tasks: Brand Colors — End-to-End Consistency

**Input**: Design documents from `/specs/956-brand-colors/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are **required** for this feature. Spec FR-016 mandates "Brand-color enforcement (per-slide, per-batch-item, retargeting inheritance, compositor defaults, compliance check) MUST be covered by automated fixture tests that fail when any of these guarantees regress." Fixture suites land in `functions/src/contractFixtures.test.ts`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4, US5)
- All paths are relative to repo root `D:\proads-worktrees\015-brand-colors\`

## Path Conventions

This is a web application monorepo:

- Backend: `functions/src/`
- Frontend: `src/`

---

## Phase 1: Setup

**Purpose**: Confirm baseline before adding new code

- [x] T001 Confirm baseline test suite passes — run `cd functions && npm test` from repo root and confirm green; capture pre-feature score so US5 deduction can be verified later

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, resolver, trace builder, and the single-image rewire are prerequisites for every user story. Once Phase 2 is checkpointed, US1–US5 can proceed in parallel.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 [P] Add backend types in `functions/src/types.ts` — add `BrandColorSource`, `BrandColorPair`, `BrandColorComplianceEntry` exactly as specified in [data-model.md](./data-model.md); extend `ResolutionTrace` with optional `brandColorSource?: BrandColorSource` and `brandColorCompliance?: BrandColorComplianceEntry[]`; extend `GenerationInputs` (or current per-generation input type) with optional `brandColorSource?: BrandColorSource`
- [x] T003 [P] Add frontend type mirror in `src/types.ts` — export `BrandColorSource` enum with the same five members ('form' | 'avatar' | 'inherited' | 'workspace' | 'none')
- [x] T004 Add TraceBuilder methods in `functions/src/resolutionTrace.ts` — add `setBrandColorSource(source: BrandColorSource): TraceBuilder` and `addBrandColorComplianceEntry(entry: BrandColorComplianceEntry): TraceBuilder`; wire both into `build()` so they only emit when set; mirror the existing `setLogoPipeline` / `addReflowHistoryEntry` patterns (depends on T002)
- [x] T005 [P] Implement `resolveBrandColors()` in NEW file `functions/src/brandColorResolver.ts` — pure function per [contracts/brandColorResolver.md](./contracts/brandColorResolver.md); precedence form > avatar > inherited > workspace; atomic source selection (no mixing); hex normalization to `#RRGGBB` lowercase; WCAG-luminance auto-contrast for `ctaTextColor` per [research.md](./research.md) Decision 3; never throws (depends on T002)
- [x] T006 Add resolver fixture suite in `functions/src/contractFixtures.test.ts` — implement BCR-01 through BCR-11 exactly per [contracts/brandColorResolver.md](./contracts/brandColorResolver.md) "Test fixtures" section; include the L = 0.5 boundary case (BCR-10) and the avatar-secondary-ignored atomicity case (BCR-11); confirm all assertions fail before T005 is implemented and pass after (depends on T005)
- [x] T007 Wire single-call resolver invocation at generation entry in `functions/src/generators.ts` — refactor existing brand-color string-interp blocks at lines 1089, 2146, 3522, 5146, 6151 to read from one `resolveBrandColors(...)` call hoisted to the top of the per-generation entry; persist `inputs.brandColorSource` on the generation document at save; call `traceBuilder.setBrandColorSource(...)` on the trace; covers single-image cold path (carousel/batch/retargeting wiring lands in their respective story phases) (depends on T004, T005)

**Checkpoint**: Foundation ready — resolver works for single-image; types and trace methods available; user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 — Brand consistency across every multi-asset generation (Priority: P1) 🎯 MVP

**Goal**: Every slide of a carousel and every variation of a batch uses the resolved brand primary as a CTA/accent/heading highlight and the secondary as a supporting accent.

**Independent Test**: Set workspace primary `#0A66C2` and secondary `#F59E0B`; generate one 7-slide carousel and one 4-item batch; confirm every output asset visibly uses the brand primary; confirm `resolutionTrace.brandColorSource === 'workspace'` on both generations and that no rendered asset contains a `[brand color]` placeholder string.

### Implementation for User Story 1

- [x] T008 [US1] Thread resolved BrandColorPair through carousel slide loop in `functions/src/generators.ts` (around lines 6076–6306) — pass the same hoisted `resolveBrandColors(...)` result to every slide's prompt-build path; add the carousel consistency instruction "CRITICAL: Maintain brand color consistency across all carousel slides. Primary brand color {primary} must appear in every slide (CTA button, accent, or heading highlight). Secondary color {secondary} used as supporting accent. This creates visual cohesion when swiping." with actual hex values interpolated; only add the instruction when `resolved.primary` is non-null
- [x] T009 [US1] Thread resolved BrandColorPair through batch loop in `functions/src/generators.ts` — pass the same hoisted result to every batch item's prompt-build path; add the batch consistency instruction "This is part of a batch of {N} ad variations. All variations MUST use the same brand color palette anchored by primary {primary} and secondary {secondary}. Vary composition and messaging, NOT the color scheme." with actual hex values; only add the instruction when `resolved.primary` is non-null
- [x] T010 [US1] Carousel slide-3 fixture in `functions/src/contractFixtures.test.ts` — Phase 15.7 test (a): build a synthetic carousel input with brand primary `#0A66C2` and secondary `#F59E0B`; assert that the slide-3 prompt string contains both `#0a66c2` and `#f59e0b` (case-insensitive) AND the carousel consistency instruction
- [x] T011 [US1] Batch item-2 fixture in `functions/src/contractFixtures.test.ts` — Phase 15.7 test (b): build a synthetic batch input of N=4 with brand colors set; assert that the item-2 prompt string contains the batch consistency instruction with the actual N value and both hex values
- [x] T012 [US1] Anti-placeholder regex test in `functions/src/contractFixtures.test.ts` — FR-009 enforcement: scan every resolved prompt produced by the carousel and batch fixtures for `/\[(brand[_ ]?color|primary[_ ]?color|brand[_ ]?name)/i`; assert zero matches; this test catches model-side drift if the prompt ever leaks `[brand color]` into a rendered asset

**Checkpoint**: User Story 1 fully functional — carousels and batches stay on-brand. MVP shippable here.

---

## Phase 4: User Story 2 — Retargeting ads inherit brand colors from the cold ad (Priority: P2)

**Goal**: A retargeting generation linked to a cold ad inherits the cold ad's brand primary and secondary when the retargeting form omits them; explicit form input still wins; magic edit and remix flows reuse the same precedence rule per FR-020/021 (clarification Q4).

**Independent Test**: Generate a cold ad with brand colors `#0A66C2` / `#F59E0B`; generate a retargeting carousel linked to it without filling brand colors → confirm rendered slides use the inherited colors and `inputs.brandColorSource === 'inherited'`. Then generate retargeting again with explicit form colors `#FF0000` / `#00FF00` → confirm explicit colors win and `source === 'form'`.

### Implementation for User Story 2

- [x] T013 [US2] Wire cold-ad source loader in `functions/src/generators.ts` retargeting flow (single around line 6336; carousel around line 6617) — load the cold-ad generation doc by `retargetingSourceId`, extract `inputs.brandColorPrimary` and `inputs.brandColorSecondary`, and pass them as the `sourceColdAd` argument to `resolveBrandColors(...)`; the same hoisted resolver call replaces the per-site brand-color string-interp from T007 in retargeting paths
- [x] T014 [US2] Wire FR-018 fallback in `functions/src/generators.ts` — when the cold-ad doc cannot be loaded (missing, deleted, permission error), pass `sourceColdAd: null` and continue generation; record `inputs.brandColorSource` as whatever the resolver returned (typically 'workspace' or 'none'); never throw
- [x] T015 [US2] Wire magic edit and remix inheritance in `functions/src/generators.ts` per FR-020/021 — at the magic-edit prompt-build site, call `resolveBrandColors(...)` with `sourceColdAd: null`; at the remix prompt-build site, load the source asset's generation doc and pass it as `sourceColdAd` (same role as retargeting); thread the resolved pair into prompts and into compositor calls (compositor wiring lands in US4/T022)
- [x] T016 [US2] Retargeting inheritance fixture in `functions/src/contractFixtures.test.ts` — Phase 15.7 test (c): synthesize a cold-ad doc with brand primary `#0A66C2` and secondary `#F59E0B`; build a retargeting input that links to that cold ad and supplies no explicit brand colors; assert the resolved BrandColorPair has `primary: '#0a66c2'`, `secondary: '#f59e0b'`, `source: 'inherited'`; second case in same fixture: same cold ad source, retargeting form supplies `#FF0000`/`#00FF00` → assert `source: 'form'` and the cold-ad colors are ignored

**Checkpoint**: User Story 2 fully functional — retargeting + magic edit + remix all inherit brand colors correctly with explicit form override.

---

## Phase 5: User Story 3 — Trustworthy in-form preview and workspace defaults (Priority: P3)

**Goal**: The brand-color picker in the new-generation form shows live swatches, auto-fills from the active workspace, and shows a "Using workspace colors" label when form values exactly equal workspace defaults; the user can override per-generation without modifying workspace state.

**Independent Test**: With workspace primary `#0A66C2` / secondary `#F59E0B`, open the form → confirm both pickers auto-fill, swatches render, and the "Using workspace colors" label is visible; change one picker → label disappears immediately and swatch updates; reset → label reappears; confirm workspace settings unchanged.

### Implementation for User Story 3

- [x] T017 [P] [US3] Implement BrandColorSwatchPreview component in NEW file `src/components/BrandColorSwatchPreview.tsx` — props `{ primary?: string | null; secondary?: string | null; ctaTextColor?: '#FFFFFF' | '#1A1A1A' | null }`; render two stacked rectangles (primary as background fills the larger top area; secondary as a thinner accent band beneath); render a mini CTA pill (`brand.primary` background, `brand.ctaTextColor` text reading "CTA"); when both colors are null, render an empty/dashed-outline placeholder; use Tailwind classes for layout, inline styles for the dynamic hex colors
- [x] T018 [US3] Mount BrandColorSwatchPreview in `src/components/InputForm.tsx` — render the component immediately after the brand-color picker block (around lines 1654–1690), passing the current `inputs.brandColorPrimary`, `inputs.brandColorSecondary`, and a client-side derived `ctaTextColor` computed from the WCAG-luminance formula in [research.md](./research.md) Decision 3 (mirror the backend formula in a small `src/utils/wcagContrast.ts` helper if not already present)
- [x] T019 [US3] Implement workspace auto-fill + "Using workspace colors" label in `src/components/InputForm.tsx` — on form mount, if active workspace has non-empty primary, populate `inputs.brandColorPrimary` (and secondary) from workspace; render a small label "Using workspace colors" iff (case-insensitive normalized hex compare) the current form values exactly equal the active workspace values per [research.md](./research.md) Decision 7; the label is pure derived state — no timer, no debounce; hide the label the moment the user edits either field; do NOT mutate workspace defaults from the form
- [x] T019a [US3] Implement retargeting-inheritance label in `src/components/InputForm.tsx` per FR-011a — when the form is in retargeting mode AND `retargetingSourceId` resolves to a cold-ad doc with non-empty brand colors AND the form's brand-color pickers are empty, render an "Inheriting brand colors from the linked cold ad" label adjacent to the pickers; hide the moment the user types into either picker; mutually exclusive with the "Using workspace colors" label (retargeting label takes precedence when both conditions could be true)

**Checkpoint**: User Story 3 fully functional — form preview swatches and workspace label behave correctly.

---

## Phase 6: User Story 4 — Brand colors used by default for CTA and headline rendering (Priority: P3)

**Goal**: The post-render text compositor uses the resolved brand primary as the CTA pill background and the brand secondary as the headline accent by default; CTA text auto-contrasts via WCAG luminance; absent brand colors fall back to existing AI-chosen palette behavior.

**Independent Test**: Generate a single ad with brand primary `#0A66C2` and secondary `#F59E0B` → sample the rendered CTA background (within ±5 RGB of `#0A66C2`), CTA text (white), and headline accent (within ±5 RGB of `#F59E0B`). Generate a single ad with no brand colors → CTA and headline use AI-chosen palette with no warnings.

### Implementation for User Story 4

- [x] T020 [US4] Extend `compositeArabicText` signature in `functions/src/textCompositing.ts` (line 142) — add optional final parameter `brand?: BrandColorPair`; when supplied, override `textStyle.color` with `brand.secondary` for the headline (only if non-null), override `textStyle.backgroundTreatmentColor` with `brand.primary` for the CTA pill (only if non-null), and use `brand.ctaTextColor` for the CTA text color (only if non-null); preserve all stroke/shadow/layout fields from `textStyle`; preserve the existing "NEVER partially color Arabic text" rule (`generators.ts:5151`) — apply brand secondary as the *uniform* headline color only
- [x] T021 [US4] Extend `compositeFullAdText` signature in `functions/src/textCompositing.ts` (line 344) — add the same optional `brand?: BrandColorPair` parameter and apply the identical override rules as T020; ensure backwards compatibility: any existing call site that does not pass `brand` continues to work using the existing `textStyle`-driven behavior
- [x] T022 [US4] Update all `compositeArabicText` and `compositeFullAdText` call sites in `functions/src/generators.ts` to pass the resolved BrandColorPair as the new final argument — covers single, carousel slide loop, batch loop, retargeting (single + carousel), magic edit, and remix; the resolved pair is the same one threaded into prompts (single source of truth per generation)
- [x] T023 [US4] Compositor fixture suite COMP-01..COMP-06 in `functions/src/contractFixtures.test.ts` — implement all six fixtures per [contracts/compositorDefaults.md](./contracts/compositorDefaults.md): COMP-01 no-brand fallback (golden image diff vs today), COMP-02 brand primary only, COMP-03 brand secondary only, COMP-04 both set, COMP-05 Arabic uniformity (assert no per-glyph color variation), COMP-06 light primary `#FFD700` → CTA text `#1A1A1A`

**Checkpoint**: User Story 4 fully functional — every rendered ad has branded CTA + headline when brand colors are set, untouched fallback otherwise.

---

## Phase 7: User Story 5 — Post-render brand-color compliance check (Priority: P4)

**Goal**: After every render, the system extracts the dominant colors of the rendered image and flags assets where the brand primary is not present within ΔE-2000 < 15; flagged assets receive a 10-point creative-score deduction recorded under a new violation string; no flag/deduction when brand colors were not set.

**Independent Test**: Generate ads with brand colors set; for each rendered asset confirm `resolutionTrace.brandColorCompliance[*].checkRan === true` and (typically) `present === true`. Force a known-miss case (synthetic test image) → confirm `present: false`, `deductedScore: 10`, violation string appears, `creativeScoreResult.overallScore` reduced by 10. Generate without brand colors → confirm no compliance entries (or all `checkRan: false, skippedReason: 'no_brand_colors'`) and no score deduction.

### Implementation for User Story 5

- [x] T024 [US5] Implement `checkBrandColorCompliance()` in NEW file `functions/src/brandColorCompliance.ts` per [contracts/brandColorCompliance.md](./contracts/brandColorCompliance.md) — Sharp `resize(32, 32, { fit: 'fill' }).removeAlpha().raw().toBuffer()` → 1024 RGB pixels → deterministic 5-cluster k-means (max 10 iterations, seed = pixels at indices floor(i × 1024 / 5)) → sRGB-to-CIELAB conversion (D65 reference white) → CIEDE2000 distance to brand primary → min < 15 → present; never throws (every error path returns `{ checkRan: false, skippedReason: 'image_unanalyzable' }`); 0 model calls, 0 network calls
- [x] T025 [US5] Add concurrency-limited compliance caller for carousel/batch in `functions/src/generators.ts` — **after T022's compositor pass completes for every slide/item** (so the check sees the final composited image, not the bare model output, and brand colors added by the compositor are counted toward presence), run `checkBrandColorCompliance(...)` per slide / per batch item via `Promise.allSettled` with at most 5 concurrent workers (mirror the cap from `955-aspect-reflow`); for each fulfilled result, append to the trace via `traceBuilder.addBrandColorComplianceEntry(entry)`; rejected promises (should not occur given never-throw contract) treated as `image_unanalyzable` skip entries; assetId is `'slide-{index}'` for carousel and `'batch-{index}'` for batch
- [x] T026 [US5] Wire single-asset compliance check into single, magic-edit, and remix render-completion sites in `functions/src/generators.ts` — call `checkBrandColorCompliance(buffer, resolved.primary, 'single')` once per generation; append the result to the trace via `traceBuilder.addBrandColorComplianceEntry(entry)`; runs after T022's compositor pass so the check sees the final composited image (not the bare model output)
- [x] T027 [US5] Integrate compliance into scoring in `functions/src/creativeScoringEngine.ts` — extend the scoring entry function (the one that produces `CreativeScoreResult`) to accept the per-asset `BrandColorComplianceEntry` (or read it from a passed-in trace); after the existing scoring math runs, if `entry.checkRan === true && entry.present === false` then append `"Brand primary missing from rendered image"` to `result.violations`, subtract `entry.deductedScore` (always 10) from `result.overallScore`, and recompute `result.passed = result.overallScore >= PASS_THRESHOLD`; the scoring engine MUST NOT call the compliance function itself (decoupled per [contracts/brandColorCompliance.md](./contracts/brandColorCompliance.md))
- [x] T028 [US5] Compliance fixture suite BCC-01..BCC-08 in `functions/src/contractFixtures.test.ts` — implement all eight fixtures per [contracts/brandColorCompliance.md](./contracts/brandColorCompliance.md): BCC-01 null brand primary, BCC-02 empty string, BCC-03 malformed hex, BCC-04 zero-byte buffer (image_unanalyzable), BCC-05 synthetic 32×32 PNG with `#0A66C2` patch (present), BCC-06 pure white image (absent), BCC-07 near-miss `#0A66D0` ΔE ≈ 2 (present), BCC-08 far-miss `#0A66E5` ΔE ≈ 17 (absent); use Sharp to generate the synthetic test PNGs deterministically inside the test
- [x] T029 [US5] Scoring-integration fixture in `functions/src/contractFixtures.test.ts` — synthesize a `CreativeScoreResult` with overallScore 75 and a compliance entry with `present: false, deductedScore: 10`; run through the extended scoring function from T027; assert violations contains `"Brand primary missing from rendered image"`, overallScore is 65, and `passed === true` (still above threshold 60); second case in same fixture: overallScore 65 → after deduction is 55 → assert `passed === false`

**Checkpoint**: User Story 5 fully functional — per-asset compliance flagged, scored, and traceable; all five user stories now independently functional and shippable.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end validation across all stories.

- [x] T030a **Mandatory backend rebuild before any deploy/demo.** From repo root run `rm -rf functions/lib && cd functions && npm run build` (or PowerShell-equivalent `Remove-Item -Recurse -Force functions/lib; cd functions; npm run build`). The functions emulator and `firebase deploy --only functions` both serve from `functions/lib` — without a clean rebuild, code edits to `functions/src/*.ts` will NOT reach the running function. Always re-run this between code changes.
- [x] T030 Run the full quickstart.md walk-through (US3 → US1 → US2 → US4 → US5 + edge-case spot checks + regression smoke) per [quickstart.md](./quickstart.md) — capture screenshots of swatches and rendered ads; record any deviations from expected behavior
- [x] T031 [P] After T030a's rebuild, run `cd functions && npm test` from repo root — confirm all new fixtures pass: BCR-01..BCR-11 (T006), carousel slide-3 (T010), batch item-2 (T011), anti-placeholder regex (T012), retargeting inheritance (T016), COMP-01..COMP-06 (T023), BCC-01..BCC-08 (T028), scoring-integration (T029); confirm no pre-existing tests regressed vs the baseline captured in T001
- [x] T032 [P] Run `npm run build` and `npm run lint` from repo root — confirm frontend type-checks green after BrandColorSwatchPreview (T017) and InputForm changes (T018, T019); confirm ESLint passes; confirm the new `src/utils/wcagContrast.ts` helper (if added in T018) passes lint

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — runs immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - Once T007 lands, US1, US2, US3, US4, US5 can each proceed in parallel by separate developers
  - Or sequentially in priority order (US1 → US2 → US3 → US4 → US5)
- **Polish (Phase 8)**: Depends on every desired user story being complete

### User Story Dependencies

- **US1 (P1)**: Requires Phase 2 complete. No dependency on other stories.
- **US2 (P2)**: Requires Phase 2 complete. No dependency on other stories. (US2's wiring of magic-edit + remix in T015 calls the same resolver from T005; threading resolved colors into the magic-edit/remix compositor happens in US4's T022.)
- **US3 (P3)**: Requires Phase 2 complete. Frontend-only — no dependency on other stories.
- **US4 (P3)**: Requires Phase 2 complete. T022 updates all compositor call sites including those added by US1 (carousel/batch loops in T008/T009) and US2 (retargeting in T013, magic-edit + remix in T015). If US4 is implemented before US1 or US2, T022 is repeated for the new call sites added later — or US4 can be deferred until after US1/US2 to do T022 once.
- **US5 (P4)**: Requires Phase 2 complete. T026/T027 are independent of US1/US2/US3/US4. T025 wires the carousel/batch compliance loop, which uses the assetIds emitted by US1's loops — so T025 should land after T008/T009 (no functional dependency, but the assetId convention must agree).

### Within Each User Story

- Implementation tasks complete in the order listed
- Fixture tasks (T010, T011, T012, T016, T023, T028, T029) can be authored test-first (FR-016 spec mandate) — author the fixture, confirm it fails against the unmodified code, then implement until it passes
- Per-file constraint: tasks editing `functions/src/contractFixtures.test.ts` (T006, T010, T011, T012, T016, T023, T028, T029) are sequential edits to one file — they cannot be parallelized within a single developer; with multiple developers, coordinate via separate test `describe()` blocks per fixture suite

### Parallel Opportunities

- **Phase 2 setup**: T002 + T003 + T005 can all start in parallel (different files, only T002 has a downstream dependency on T004); T004 can start as soon as T002 lands
- **Cross-story parallel**: After Phase 2 checkpoint, US1 (T008+T009 in `generators.ts`) and US3 (T017+T018+T019 in frontend) and US4 (T020+T021 in `textCompositing.ts`) and US5 (T024 in new `brandColorCompliance.ts`) can all proceed in parallel by different developers — each touches a different file
- **In-story**: Within US3, T017 (new file) is `[P]` with T018 (separate frontend file edit), but T019 must follow T018 (same file)

---

## Parallel Example: Phase 2 (Foundational)

```bash
# After T001 (baseline confirmed), launch all type/file scaffolding tasks together:
Task: "T002 — Add backend types in functions/src/types.ts"
Task: "T003 — Add frontend type mirror in src/types.ts"
Task: "T005 — Implement resolveBrandColors() in functions/src/brandColorResolver.ts"

# T004 starts the moment T002 lands (depends on the new types):
Task: "T004 — Add TraceBuilder methods in functions/src/resolutionTrace.ts"

# T006 + T007 start the moment T005 (resolver) and T004 (trace) land:
Task: "T006 — Resolver fixtures BCR-01..BCR-11 in contractFixtures.test.ts"
Task: "T007 — Single-image resolver wiring in generators.ts"
```

## Parallel Example: After Phase 2 Checkpoint (Cross-Story)

```bash
# Five developers can each take one user story:
Developer A — US1: T008 → T009 → T010 → T011 → T012
Developer B — US2: T013 → T014 → T015 → T016
Developer C — US3: T017 → T018 → T019
Developer D — US4: T020 → T021 → T022 → T023
Developer E — US5: T024 → T025 → T026 → T027 → T028 → T029
```

Coordination point: T022 (US4) depends on the call sites added by T008/T009 (US1), T013/T015 (US2). If US4 starts before US1/US2 finish, the developer doing T022 should re-run it after each new call site is added; or US4 is sequenced after US1/US2 to do T022 once.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002–T007) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T008–T012)
4. **MANDATORY: rebuild backend** — `rm -rf functions/lib && cd functions && npm run build` (Phase 8 / T030a). Skipping this means the emulator and any deploy will run stale `functions/lib/*.js` and your changes will not take effect.
5. **STOP and VALIDATE**: Run quickstart.md US1 carousel + batch verification only
6. Deploy/demo if ready — carousel and batch consistency is the headline gap and is shippable on its own

### Incremental Delivery

Every "Deploy/Demo" step below MUST be preceded by the T030a backend rebuild — emulators and `firebase deploy --only functions` both serve from `functions/lib`, so without a fresh rebuild the changes do not reach the running function.

1. Setup + Foundational → Foundation ready
2. Add US1 → rebuild → Test independently → Deploy/Demo (MVP — carousel/batch on-brand)
3. Add US2 → rebuild → Test independently → Deploy/Demo (retargeting + magic-edit + remix on-brand)
4. Add US3 → Test independently → Deploy/Demo (in-form preview; frontend-only, no backend rebuild needed)
5. Add US4 → rebuild → Test independently → Deploy/Demo (CTA + headline branded by default)
6. Add US5 → rebuild → Test independently → Deploy/Demo (compliance flagging + scoring deduction)
7. Polish (Phase 8) → ship-ready

### Parallel Team Strategy

With five developers:

1. Whole team completes Phases 1 + 2 together (T001–T007)
2. Each developer picks one user story (US1–US5) per the cross-story parallel example above
3. Coordinate the T022 (US4 compositor wiring) timing so it runs once after US1/US2/US3 call sites stabilize
4. All five stories complete in parallel; Phase 8 polish runs at the end

---

## Notes

- `[P]` tasks = different files, no dependencies on incomplete tasks at this point
- `[Story]` label maps task to specific user story for traceability (US1–US5)
- Tests are MANDATORY per FR-016 — every fixture suite called out above is required
- The shared test file `functions/src/contractFixtures.test.ts` is touched by 8 tasks; sequence those edits or split into separate `describe()` blocks
- Verify each fixture FAILS before its implementation lands, then PASSES after
- Commit after each task or at each checkpoint
- Stop at any checkpoint to validate the user story independently per quickstart.md
