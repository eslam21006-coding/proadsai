---

description: "Task list for HOTFIX-E — Hybrid Logo Handling"
---

# Tasks: HOTFIX-E — Hybrid Logo Handling

**Input**: Design documents from `/specs/0953-hotfix-hybrid-logo/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/logo-placement-schema.md, contracts/ui-logo-compositor.md, contracts/screen-content-ban.md

**Tests**: Fixture tests are MANDATORY for this hotfix per launch-matrix row HFE.8 and Constitution Principle IX (proof is required for every claimed fix). Five happy-path + three negative-path fixtures land in `functions/src/contractFixtures.test.ts`.

**Organization**: Tasks are grouped by user story. The three P1 stories (US1 + US2 + US3) together constitute the launch-ready state — US1 alone is demo-able but the hotfix cannot ship without US3 (screen ban) because fake laptop dashboards are an independent ship-blocker.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks in the same phase)
- **[Story]**: Which user story the task belongs to (US1–US5 per spec.md priorities)
- All file paths are repo-relative from `D:\proads-worktrees\0953-hotfix-hybrid-logo\`

## Path Conventions

- Backend: `functions/src/*.ts` (TypeScript 5.7, Firebase Cloud Functions v2)
- Frontend: `src/**/*.ts(x)` — untouched by this hotfix
- Fixtures: `functions/src/contractFixtures.test.ts`
- Launch matrix tasks referenced: HFE.1–HFE.8 in `docs/LAUNCH_MATRIX.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify the existing hotfix-ready state before starting the code changes. No new dependencies to install.

- [X] T001 Verify Sharp `^0.33.5` is installed in `functions/package.json` (already present per the research audit — confirm the version has not regressed on this branch).
- [X] T002 [P] Verify `functions/src/offerOverlay.ts` line 313 `compositeOfferOverlay()` still exists and exports the pattern that `compositeUILogos()` will mirror (lazy Sharp require, null-guard early exit, base64 in/out, try/catch fail-soft).
- [X] T003 [P] Verify `functions/src/textCompositing.ts` line 142 `compositeArabicText()` and line 344 `compositeFullAdText()` are still the post-render text pass sites.

**Checkpoint**: All three compositor sites located and the pattern confirmed. Ready for foundational work.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Data-layer, type-layer, prompt-constant, and compositor-skeleton scaffolding that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete. All types, the validator, the trace extension, the prompt constants, and the compositor file skeleton must exist first.

- [X] T004 [P] Add `LogoZone` string-literal union and `UILogoPlacement` / `EnvironmentalLogoPlacement` / `LogoPlacement` discriminated union to `functions/src/types.ts` (per `data-model.md` § 1). Export from the module so `buildPlanSlotMap.ts`, `logoComposite.ts`, `generators.ts`, and `contractFixtures.test.ts` can all import.
- [X] T005 [P] Add `LogoPipelineEvents` interface to `functions/src/types.ts` with fields `perLogo`, `autoShifts`, `drops`, `clamps`, `softWarnings` (per `data-model.md` § 3). Extend `ResolutionTrace` (line 100) with optional `logoPipeline?: LogoPipelineEvents`. No removals, no renames — purely additive.
- [X] T006 Extend `TraceBuilder` in `functions/src/resolutionTrace.ts` with `setLogoPipeline(events: LogoPipelineEvents): TraceBuilder` (mirrors the `setCulturalViolation` pattern at line 108). Add the corresponding read in `build()` at line 116, emitting the new optional field on the frozen output, with deep clone of every array inside `events` (matches the `autoSwitchEvents` / `perSlide` cloning pattern).
- [X] T007 Extend `StructuredBuildPlanPayload` in `functions/src/buildPlanSlotMap.ts:99` with `logoPlacements: LogoPlacement[]` field. Purely additive — do not touch `blueprint`, `zones`, `overlayAssignments`, `mustShowAssignments`, `ownership`.
- [X] T008 In `functions/src/buildPlanSlotMap.ts::parseStructuredBuildPlanResponse()` (line 421), add read-side defaults for `logoPlacements`: missing → `[]`; per-entry missing `mode` → `'environmental'`; per-UI-entry missing `widthPct` → `12`; missing `opacity` → `1.0`; per-environmental-entry missing `environmentalContext` → `''`. Entries with missing `zone` (UI) or missing `surface` (environmental) are DROPPED — record a soft warning to return alongside (see T009).
- [X] T009 In `functions/src/buildPlanSlotMap.ts::validateStructuredBuildPlan()`, implement logoPlacements validation per `contracts/logo-placement-schema.md`: enforce `mode` enum, clamp `widthPct` to `[5, 18]`, clamp `opacity` to `[0.85, 1.0]`, enforce per-mode caps (2 UI / 3 environmental) with `over_ui_cap` / `over_environmental_cap` drop reasons, enforce `logoIndex` within `brandLogos.length` with `logo_index_out_of_range` drops, reject non-empty `logoPlacements` when the creative style is `text_only`. Return the cleaned array alongside a `LogoPipelineEvents`-shaped event bundle (`clamps`, `drops`, `softWarnings` subset) that the caller merges into its trace builder.
- [X] T010 [P] Create a new module for the prompt-constant blocks. Candidate location: `functions/src/logoPromptBlocks.ts` (new file). Export four named constants as plain strings: `SCREEN_CONTENT_BAN_BLOCK` (verbatim body from `contracts/screen-content-ban.md`), `UI_LOGO_INSTRUCTION_BLOCK`, `ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK`, and `MODE_SELECTION_HINT_BLOCK`. Model after the `culturalCompliance.ts` module from HOTFIX-C — single source of truth, imported by `generators.ts` at every prompt-assembly site and by `contractFixtures.test.ts` for assertion.
- [X] T011 [P] Create `functions/src/logoComposite.ts` (NEW FILE) as a skeleton: lazy `require('sharp')` with warn-and-disable fallback (mirrors `offerOverlay.ts:8-13`); stub export `export async function compositeUILogos(args: CompositeUILogosArgs): Promise<CompositeUILogosResult>` that returns `{ image: args.baseImageBase64, events: { perLogo: [], autoShifts: [], drops: [], clamps: [], softWarnings: [] } }` — real logic lands in US1 / US4 tasks. Import `LogoPlacement`, `LogoPipelineEvents`, `LogoZone` from `types.ts`.

**Checkpoint**: Foundation ready. Types compile, validator clamps out-of-bound inputs, trace builder accepts the new event bundle, prompt constants exist, compositor file exists with a passing no-op stub. User story implementation can now begin.

---

## Phase 3: User Story 1 - Pixel-perfect UI logos for minimalist and corporate ads (Priority: P1) 🎯 MVP

**Goal**: The uploaded logo PNG appears at its planned corner zone, pixel-faithful, no letter rearrangement, no distortion.

**Independent Test**: Upload one wordmark logo, generate a minimalist single ad, verify the rendered image has the logo in a corner with the wordmark spelled exactly as uploaded (Quickstart Check 1).

**Launch-matrix mapping**: HFE.1 (partial — planner schema for UI entries), HFE.2 (partial — UI instruction block + leave-zone-clear phrasing), HFE.3, HFE.4, HFE.8.a.

### Implementation for User Story 1

- [X] T012 [P] [US1] In `functions/src/logoComposite.ts::compositeUILogos()`, implement the basic per-logo composite path (NO collision / auto-shift yet — that lands in US4 / T028): for each entry where `mode === 'ui'`, resolve the planned `zone` to pixel `top, left` coordinates using `args.canvasWidth` and `args.canvasHeight` (center of zone minus half the logo's scaled width/height; respect the layout contract's `safeZoneInset` where available). Resize the uploaded logo via `sharp(logoBuffer).resize({ width: placement.widthPct * canvasWidth / 100, fit: 'inside' }).png().toBuffer()` to preserve aspect and transparency. Apply the placement's `opacity`. Composite onto the running base image with `sharp(base).composite([{ input: resizedLogo, top, left, blend: 'over' }]).png().toBuffer()`. Wrap each per-logo composite in try/catch — single-logo failure appends a `softWarnings[]` entry with `reason: 'composite_failed'` and skips. On success, push to `events.perLogo` with `chosenMode: 'ui'` and `finalZone: placement.zone`. Entries where `mode === 'environmental'` are skipped entirely (do not touch the image for them).
- [X] T013 [US1] In `functions/src/logoComposite.ts`, add the subtle drop shadow for UI logos required by FR-010. Implementation: before the final composite, render the resized logo onto a transparent canvas with a Gaussian-blurred offset copy of the logo underneath (one Sharp pipeline that produces the logo-with-shadow PNG; then composite THAT onto the base). Shadow params: offset-y 1–2 px, Gaussian blur sigma 2–3, shadow color rgba(0,0,0,0.25). Keep subtle — goal is legibility against varying backgrounds, not visual emphasis.
- [X] T014 [US1] In `functions/src/generators.ts`, locate the post-render Sharp chain at lines 5670–5790 (existing `compositeOfferOverlay()` invocations). Insert a NEW step `compositeUILogos()` BEFORE any text-composite call and BEFORE the `compositeOfferOverlay()` call: `const uiResult = await compositeUILogos({ baseImageBase64: currentImage, brandLogos: inputs.brandLogos || [], placements: structuredPlan.logoPlacements, layoutContract: overlayContract, canvasWidth: ar.canvasWidth, canvasHeight: ar.canvasHeight }); currentImage = uiResult.image;`. Merge `uiResult.events` into the trace builder via `traceBuilder.setLogoPipeline(uiResult.events)` (preserve any pre-existing events from the validator bundle — see T009). Apply this insertion at BOTH the strict-mode site near line 5670 and the non-strict site near line 5774.
- [X] T015 [US1] In `functions/src/generators.ts::generateBuildPlan()`, extend the planner return contract per HFE.1. In the planner prompt, add a block that instructs the LLM to return `logoPlacements: LogoPlacement[]` as part of its structured machine plan, with UI entries specifying `{ logoIndex, mode: 'ui', zone, widthPct, opacity }`. The exact schema language comes from `contracts/logo-placement-schema.md`. The existing `buildStructuredBuildPlanReturnBlock()` near line 3639 is the likely assembly site.
- [X] T016 [US1] In `functions/src/generators.ts`, inject `UI_LOGO_INSTRUCTION_BLOCK` (from T010 module) into the image-model prompt assembly WHENEVER `structuredPlan.logoPlacements` contains at least one entry with `mode === 'ui'`. The block's content is HFE.2 UI-mode text: "Do NOT render this logo in the image. Leave the specified zone CLEAR and unobstructed. It will be composited post-render for pixel-perfect accuracy." Insertion site: the prompt assembled for the image model inside `generateFinalAd()` (line 4049+), alongside the existing `BRANDING` line at ~2108 — replace or augment the BRANDING line for UI-mode placements.
- [X] T017 [US1] Fixture HFE.8.a in `functions/src/contractFixtures.test.ts`: minimalist single ad with one uploaded logo. Assert: planner emits `logoPlacements: [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }]` (or similar valid UI placement). Assembled image prompt contains `UI_LOGO_INSTRUCTION_BLOCK`'s verbatim "Leave the specified zone CLEAR" phrase. Post-render `compositeUILogos()` runs (assert via mocked / spy'd Sharp or via asserting `events.perLogo.length === 1` on the returned trace). `events.perLogo[0].chosenMode === 'ui'`. Zero `drops`, zero `softWarnings`.
- [X] T018 [US1] Fixture HFE.8.f (negative path) in `functions/src/contractFixtures.test.ts`: UI placement with a corrupt logo source (invalid base64 bytes). Assert: `events.softWarnings[0].reason === 'composite_failed'` (or `'corrupt_source'`), `result.image` is non-null (base image passed through for the corrupt logo's zone), other UI placements still composite correctly. This validates FR-027 fail-soft.
- [X] T019 [US1] Fixture HFE.8.h (negative path) in `functions/src/contractFixtures.test.ts`: mock the `sharp` module as unavailable at require-time. Assert: `result.image === args.baseImageBase64` (pass-through), `events.softWarnings[0].reason === 'compositor_unavailable'`. Validates research D2 / D9 graceful degradation.
- [X] T019a [P] [US1] Fixture HFE.8.i (pipeline-order regression guard) in `functions/src/contractFixtures.test.ts`: spy or wrap `compositeUILogos`, `compositeArabicText` / `compositeFullAdText`, and `compositeOfferOverlay`; run a generation through the strict post-render path in `functions/src/generators.ts` around lines 5670–5790 and assert invocation order is strictly `compositeUILogos → compositeArabicText|compositeFullAdText → compositeOfferOverlay`. This guards FR-026: a silent reorder (e.g. text composite before UI composite) could pass every other fixture while defeating collision detection, because text would land before UI logos had a chance to shift out of its way. Non-invocation of any step (e.g. no overlay slots, no UI placements) is acceptable; the assertion is on *ordering of invoked steps*, not on all-three-must-run.

**Checkpoint**: User Story 1 is independently testable. Uploaded UI logos are pixel-perfect on minimalist/corporate renders. Fails soft on corrupt PNGs or absent Sharp. Collision detection is NOT yet implemented (that's US4) — in this phase, a UI logo planned in a zone that happens to collide with text will overlap; US4 will fix.

---

## Phase 4: User Story 2 - Natural environmental logos for lifestyle and authentic ads (Priority: P1)

**Goal**: A logo planned in environmental mode appears as a physical object on its named surface (mug, t-shirt, signage, laptop lid, book cover, etc.) with correct perspective, lighting, and material.

**Independent Test**: Upload one logo, generate a lifestyle ad, verify the rendered image shows the logo painted onto a named surface with natural scene integration (Quickstart Check 2).

**Launch-matrix mapping**: HFE.1 (partial — planner schema for environmental entries, already done in Phase 3 T015), HFE.2 (partial — environmental instruction block), HFE.8.b.

### Implementation for User Story 2

- [X] T020 [US2] In `functions/src/generators.ts::generateBuildPlan()`, extend the planner-return instruction (the block from T015) to ALSO cover environmental entries: `{ logoIndex, mode: 'environmental', surface, environmentalContext }`. The block must spell out the accepted `surface` suggestions (coffee_mug, laptop_lid, wall_art, tshirt_chest, signage_behind, book_cover, tablet_back, portfolio_leather, etc. — the list from `contracts/logo-placement-schema.md` is open but the planner should stay inside conventional naming).
- [X] T021 [US2] In `functions/src/generators.ts`, inject `ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK` (from T010 module) into the image-model prompt assembly WHENEVER `structuredPlan.logoPlacements` contains at least one entry with `mode === 'environmental'`. The block's content is HFE.2 environmental-mode text: "Render this logo as a physical object in the scene — on the {surface}. Match the object's perspective, lighting, and material. Keep it subtle and natural — part of the environment, not an overlay. Use the uploaded logo image as the visual reference." Parameterize `{surface}` per-entry. Augment or replace the existing BRANDING line at ~2108 for environmental-mode placements.
- [X] T022 [US2] Confirm (by inspection + test) that `functions/src/logoComposite.ts::compositeUILogos()` correctly skips environmental entries (does not run Sharp on them). This was implemented in T012 but now has its dedicated fixture.
- [X] T023 [US2] Fixture HFE.8.b in `functions/src/contractFixtures.test.ts`: lifestyle single ad with one uploaded logo. Assert: planner emits `logoPlacements: [{ logoIndex: 0, mode: 'environmental', surface: 'coffee_mug', environmentalContext: '...' }]`. Assembled image prompt contains `ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK`'s "Render this logo as a physical object in the scene — on the coffee_mug" phrasing. Post-render `compositeUILogos()` is a no-op for this entry (assert `events.perLogo.length === 0` — environmental entries are NOT in `perLogo`). Output bytes equal input bytes (compositor did nothing).

**Checkpoint**: US1 + US2 together deliver the per-mode routing. Either mode renders correctly. Environmental entries pass through the compositor untouched.

---

## Phase 5: User Story 3 - Device screens never show fake content (Priority: P1)

**Goal**: Every device screen (laptop / monitor / tablet / phone / smartwatch) in any rendered ad is blank / abstract / out-of-focus / dimmed — never a fake logo, chart, dashboard, app UI, or notification.

**Independent Test**: Generate 10 ads containing devices; verify 0/10 render fake screen content (Quickstart Check 3, SC-003).

**Launch-matrix mapping**: HFE.2 (screen-content ban + line 2192 rewrite), HFE.7 (per-slide / per-variant re-injection), HFE.8.c.

### Implementation for User Story 3

- [X] T024 [US3] In `functions/src/generators.ts:2192`, REWRITE the line `device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.',` to `device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen MUST be blank/abstract per SCREEN_CONTENT_BAN — never any text/logo/chart/UI.',`. This is THE root-cause fix for the fake-laptop-dashboard hallucinations.
- [X] T025 [US3] In `functions/src/generators.ts`, inject `SCREEN_CONTENT_BAN_BLOCK` (from T010 module) into the planner prompt (inside `generateBuildPlan()` prompt assembly, around the existing visual-architect block near line 2141+). Conservative injection: include the ban block for ALL generations, not just device-containing ones (the cost is one paragraph of prompt; the cost of missing a device-containing ad is a fake dashboard).
- [X] T026 [US3] In `functions/src/generators.ts`, inject `SCREEN_CONTENT_BAN_BLOCK` into the image-model prompt assembly inside `generateFinalAd()` / `buildFinalImagePrompt()`. Conservative injection: for ALL renders, not just device-containing ones.
- [X] T027 [US3] Fixtures in `functions/src/contractFixtures.test.ts`: (a) HFE.8.c — corporate ad with a visible laptop screen; assert the assembled image prompt contains `SCREEN_CONTENT_BAN_BLOCK` verbatim AND does NOT contain the legacy substring `"Device screen shows content, not blank"`. (b) Ban-1 — any planner prompt assembled for any style contains `SCREEN_CONTENT_BAN_BLOCK`. (c) Ban-2 — any image-model prompt assembled for any ad contains `SCREEN_CONTENT_BAN_BLOCK`.

**Checkpoint**: The three P1 stories (US1 + US2 + US3) are all independently testable and together constitute the minimum launch-ready state for HOTFIX-E. At this checkpoint, the hotfix COULD ship if US4 and US5 were deferred — but shipping without US4 means occasional logo-over-text collisions, and without US5 means carousel/batch don't mix modes correctly. Recommendation: continue to US4 and US5 before merge.

---

## Phase 6: User Story 4 - UI logo placement never collides with text overlays (Priority: P2)

**Goal**: A UI logo planned in a zone that overlaps a text or CTA zone is auto-shifted to the nearest non-colliding zone (same band → other band → drop). Every shift and drop is recorded on the resolution trace.

**Independent Test**: Force a build plan with a planned collision; verify the rendered ad has the logo in a non-colliding zone and the trace records the shift (Quickstart no explicit check — verify via engineering inspection of `logoPipeline.autoShifts[]`).

**Launch-matrix mapping**: HFE.5, HFE.8.c (reuse — collision assertion).

### Implementation for User Story 4

- [X] T028 [US4] In `functions/src/logoComposite.ts::compositeUILogos()`, extend the per-logo processing with the collision detection + auto-shift algorithm per `contracts/ui-logo-compositor.md` § Algorithm. Steps: (a) compute collision rectangles from `args.layoutContract.zones` for every text or CTA zone at the resolved aspect ratio; (b) test the planned UI zone's target rectangle against each; (c) on collision, iterate the same-band candidates in clockwise order starting from the planned zone (top band: `[top-right, top-center, top-left]`; bottom band: `[bottom-right, bottom-center, bottom-left]`; `center` is its own band of one and does NOT auto-shift); (d) if same-band exhausted, iterate the OTHER band's candidates in the same order; (e) if both bands exhausted, drop the logo and record `drops[i] = { logoIndex, reason: 'no_non_colliding_zone', candidatesExhausted: [...] }`; (f) record any successful shift as `autoShifts[i] = { logoIndex, from: planned, to: chosen, reason: 'text_collision' | 'cta_collision' }`; (g) the successfully-placed `finalZone` (planned OR shifted) lands in `events.perLogo[i].finalZone`. Preserve the planned `zone` verbatim in the persisted `logoPlacements` array — audit trail per Constitution Principle VI.
- [X] T029 [US4] Fixture HFE.8.c (extension) in `functions/src/contractFixtures.test.ts`: corporate ad with 1 UI placement planned at `top-right`, layout contract has a text zone at `top-right`. Assert `events.autoShifts.length === 1`, `events.autoShifts[0].from === 'top-right'`, `events.autoShifts[0].to !== 'top-right'` (likely `top-center` or `top-left`), `events.perLogo[0].finalZone === events.autoShifts[0].to`. Original `logoPlacements[0].zone` still reads `'top-right'` (audit trail).
- [X] T030 [US4] Fixture HFE.8.g (negative path) in `functions/src/contractFixtures.test.ts`: UI placement planned in a band where every candidate zone is occupied by text/CTA (synthetic layout contract). Assert: `events.drops.length === 1`, `events.drops[0].reason === 'no_non_colliding_zone'`, `events.drops[0].candidatesExhausted` contains the six corner/edge zones (top-left, top-center, top-right, bottom-left, bottom-center, bottom-right — center is excluded per D8). `result.image` is the base image unchanged for that one logo. Other logos on the same ad are unaffected.

**Checkpoint**: US4 layers onto US1's compositor. Collisions are resolved deterministically. Drops are recorded. No principle VII silent overrides remain (every shift + every drop has rule + trace).

---

## Phase 7: User Story 5 - Style-aware mode selection across carousels and batch (Priority: P2)

**Goal**: The planner picks modes per individual slide / variant; carousel default is slide 1 + last UI, middle slides environmental. Per-slide and per-variant prompts all carry the screen-content ban.

**Independent Test**: Generate a 5-slide carousel and a 4-variant batch; verify per-slide / per-variant modes mix correctly (Quickstart Check 4), and the screen-content ban is present on every slide / every variant prompt.

**Launch-matrix mapping**: HFE.6, HFE.7, HFE.8.d, HFE.8.e.

### Implementation for User Story 5

- [X] T031 [US5] In `functions/src/generators.ts::generateBuildPlan()`, inject `MODE_SELECTION_HINT_BLOCK` (from T010 module) into the planner prompt. The block instructs the LLM: minimalist / corporate / conference-style → prefer `ui` mode; lifestyle / authentic / documentary / product-focused → prefer `environmental` mode; `text_only` → no logos at all; carousel with 5+ slides → first slide UI for brand recognition, middle slides environmental for storytelling, last slide UI again for CTA; never exceed 2 UI logos per ad; at most 3 environmental logos per ad (and only if natural to the scene). The block is injected on the planner call only (image-model prompts do not need it).
- [X] T032 [US5] In `functions/src/generators.ts` carousel flow (locate via grep for the carousel slide loop near the per-slide `buildPlan` / `generateFinalAd` calls), ensure each slide receives its OWN `logoPlacements` array per the per-slide build plan. The per-slide `structuredPlan.logoPlacements` MUST be passed to the per-slide `compositeUILogos()` call in T014. Environmental entries for a specific slide mean the model renders that slide's logo naturally; UI entries mean the post-render compositor runs on that slide.
- [X] T033 [US5] In `functions/src/generators.ts` batch flow (locate via grep for the batch variant iteration near `Promise.allSettled` or the batch loop body), ensure each variant receives its OWN `logoPlacements` array per the per-variant build plan. Same per-variant pipeline flow as T032.
- [X] T034 [US5] In `functions/src/generators.ts`, ensure `SCREEN_CONTENT_BAN_BLOCK` is re-injected on EVERY per-slide image-model prompt and EVERY per-variant image-model prompt, not just the top-level call. Per FR-019 the ban must appear on every slide / every variant. If T025/T026 already injected at a site inside the slide-loop / variant-loop body, no additional work is needed; if the injection is only at a top-level site, duplicate it inside the loop body.
- [X] T035 [US5] Fixture HFE.8.d in `functions/src/contractFixtures.test.ts`: 5-slide carousel with 1 uploaded logo. Assert: slide 1 build plan has `logoPlacements[0].mode === 'ui'`, slide 3 build plan has `logoPlacements[0].mode === 'environmental'`, slide 5 build plan has `logoPlacements[0].mode === 'ui'`. Every per-slide image-model prompt contains `SCREEN_CONTENT_BAN_BLOCK`. `compositeUILogos()` is invoked once per slide; it composites on slides 1 and 5 and is a no-op on slides 2–4.
- [X] T036 [US5] Fixture HFE.8.e in `functions/src/contractFixtures.test.ts`: single ad with 3 uploaded logos. Assert: planner emits at most 2 entries with `mode === 'ui'` and at most 3 entries with `mode === 'environmental'` (cap honored). `compositeUILogos()` runs Sharp N times where N is the UI-mode count. Environmental entries appear in neither `events.perLogo` nor `events.drops` nor `events.softWarnings` — the compositor ignores them entirely.
- [X] T037 [P] [US5] Fixtures Ban-3 and Ban-4 in `functions/src/contractFixtures.test.ts`: (Ban-3) 5-slide carousel — every slide's assembled image-model prompt contains `SCREEN_CONTENT_BAN_BLOCK`. (Ban-4) 4-variant batch — every variant's assembled image-model prompt contains `SCREEN_CONTENT_BAN_BLOCK`. These validate FR-019 per-iteration injection.

**Checkpoint**: All five user stories independently functional. Mixed-mode carousels and batches work. Screen-content ban is enforced on every model call.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Launch-readiness verification and documentation alignment. No new behavior; validation + housekeeping only.

- [X] T038 [P] Run `cd functions && npm run build` — verify zero TypeScript compile errors.
- [X] T039 Run `cd functions && npm test` — verify all fixtures pass, including the new HFE.8 set (T017, T018, T019, T023, T027, T029, T030, T035, T036, T037) and the previously-shipping HFA–HFD + HFC fixtures (regression check).
- [ ] T040 [P] Execute Quickstart Check 1 against staging: upload one wordmark, generate a minimalist ad, verify pixel-perfect UI logo. File the rendered image under `docs/launch-evidence/hotfix-e/check-1.png`.
- [ ] T041 [P] Execute Quickstart Check 2 against staging: lifestyle ad with environmental logo. File evidence as `docs/launch-evidence/hotfix-e/check-2.png`.
- [ ] T042 Execute Quickstart Check 3 against staging: 5 device-containing ads; verify 0/5 fake screen content. File evidence as `docs/launch-evidence/hotfix-e/check-3-{1..5}.png`.
- [ ] T043 [P] Execute Quickstart Check 4 against staging: mixed 5-slide carousel. File per-slide evidence as `docs/launch-evidence/hotfix-e/check-4-slide-{1..5}.png`.
- [ ] T044 [P] Execute Quickstart Check 5 against staging: 5-logo upload; verify per-mode caps honored via resolution trace.
- [ ] T045 [P] Execute Quickstart Check 6 against staging: spot-check 10 traces for clamp events.
- [ ] T046 [P] Execute Quickstart Check 7 against staging: manual fault injection with corrupt logo; verify fail-soft.
- [ ] T047 [P] Execute Quickstart Check 8 against staging: re-render 5 legacy saved projects; verify backward compat.
- [ ] T048 Update `docs/LAUNCH_MATRIX.md` HFE row to reflect completion (e.g. annotate HFE.1–HFE.8 as shipped with the hotfix-E PR number). Do NOT restructure the matrix — additive annotations only.
- [X] T049 Final check: verify no new files outside `functions/src/logoComposite.ts` and `functions/src/logoPromptBlocks.ts` were created. Verify no frontend file (`src/**`) was modified. Verify no schema migration was committed. Verify no change to `firestore.rules` or `storage.rules`.

**Checkpoint**: Launch-ready. All 8 quickstart checks pass. Documentation aligned. PR ready for ultrareview + merge.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — starts immediately.
- **Foundational (Phase 2)**: Depends on Setup completion. BLOCKS all user stories. T004 and T005 can run in parallel; T006 depends on T005; T007 is independent of T004–T006; T008 depends on T007; T009 depends on T007; T010 and T011 are independent.
- **User Story 1 (Phase 3)**: Depends on Phase 2 completion. T012 depends on T011. T013 depends on T012. T014 depends on T012 + T006. T015 depends on T007 + T008 + T009 + T010. T016 depends on T010. T017–T019 depend on T012 + T014 + T016.
- **User Story 2 (Phase 4)**: Depends on Phase 2 completion. T020 depends on T007 + T010. T021 depends on T010. T022 depends on T012. T023 depends on T020 + T021.
- **User Story 3 (Phase 5)**: Depends on Phase 2 completion. T024 is independent of the others. T025 + T026 depend on T010. T027 depends on T024 + T025 + T026.
- **User Story 4 (Phase 6)**: Depends on Phase 3 (Phase 6 extends the compositor built in T012). T028 depends on T012. T029 + T030 depend on T028.
- **User Story 5 (Phase 7)**: Depends on Phases 3 + 4 + 5 (Phase 7 orchestrates the per-slide / per-variant flow across both modes with the ban present). T031 depends on T010. T032 + T033 depend on T014 + T015 + T020. T034 depends on T025 + T026. T035–T037 depend on T031–T034.
- **Polish (Phase 8)**: Depends on all user stories completing.

### User Story Dependencies

- **US1 (P1)**: depends only on Foundational. Independent once foundation is in place.
- **US2 (P1)**: depends only on Foundational. Can run in parallel with US1 (different prompt blocks, same compositor skip path already handled).
- **US3 (P1)**: depends only on Foundational. Can run in parallel with US1 and US2 (different prompt block, different line, different test fixture).
- **US4 (P2)**: depends on US1. Extends the compositor from T012 with collision logic.
- **US5 (P2)**: depends on US1 + US2 + US3. Mixes both modes across loop sites + re-injects the ban per slide/variant.

### Within Each User Story

- Prompt-block changes (T015, T016, T020, T021, T025, T026, T031, T034) land before their fixtures.
- Compositor changes (T012, T013, T028) land before their fixtures.
- Fixtures can run in parallel with each other within a story where they target different test functions (e.g. T017, T018, T019 all go in `contractFixtures.test.ts` but as independent test functions — they can be authored in parallel once the implementation is in).

### Parallel Opportunities

- Setup: T002 + T003 in parallel (both are file-verification only).
- Foundational: T004 + T005 in parallel (both edit `types.ts` but different sections, or can be done in one sitting); T010 + T011 in parallel (different new files).
- US1 + US2 + US3: all three P1 stories can run in parallel once Phase 2 is complete, since they touch different prompt blocks and different code regions.
- US4 layers on US1 but does not conflict with US2 or US3 — can run in parallel with US5 development once US1 is done (T028 independent of T031-T034).
- Polish: T040–T047 (staging checks) are all [P] — they're independent manual validations in different browser tabs.

---

## Parallel Example: User Stories 1 + 2 + 3 (P1 triad)

```bash
# After Phase 2 Foundational checkpoint, three developers can each own one P1 story:

# Developer A — US1 (pixel-perfect UI logos):
Task: T012 compositeUILogos core path in functions/src/logoComposite.ts
Task: T013 drop shadow in functions/src/logoComposite.ts
Task: T014 post-render invocation in functions/src/generators.ts:5670-5790
Task: T015 planner schema in functions/src/generators.ts
Task: T016 UI_LOGO_INSTRUCTION_BLOCK injection in functions/src/generators.ts
Task: T017-T019 fixtures in functions/src/contractFixtures.test.ts

# Developer B — US2 (environmental logos):
Task: T020 planner environmental entries in functions/src/generators.ts
Task: T021 ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK injection in functions/src/generators.ts
Task: T022 verify environmental skip in functions/src/logoComposite.ts
Task: T023 fixture in functions/src/contractFixtures.test.ts

# Developer C — US3 (screen-content ban):
Task: T024 rewrite line 2192 in functions/src/generators.ts
Task: T025 ban-block injection in planner prompt in functions/src/generators.ts
Task: T026 ban-block injection in image-model prompt in functions/src/generators.ts
Task: T027 fixtures (HFE.8.c + Ban-1 + Ban-2) in functions/src/contractFixtures.test.ts
```

Developers A, B, C will touch `functions/src/generators.ts` concurrently at different line regions — standard merge-conflict coordination applies. All three land on the same PR branch.

---

## Implementation Strategy

### MVP First (User Story 1 alone — demo, not ship)

1. Complete Phase 1: Setup (T001–T003).
2. Complete Phase 2: Foundational (T004–T011). CRITICAL — blocks all stories.
3. Complete Phase 3: User Story 1 (T012–T019).
4. **STOP and VALIDATE**: Run Quickstart Check 1 (minimalist single ad with pixel-perfect UI logo).
5. Demo only — do NOT ship. Shipping without US3 leaves the fake-laptop-dashboard hallucinations unfixed.

### Launch-ready Increment (P1 triad: US1 + US2 + US3)

6. Complete Phase 4: User Story 2 (T020–T023).
7. Complete Phase 5: User Story 3 (T024–T027).
8. **STOP and VALIDATE**: Quickstart Checks 1 + 2 + 3 all green.
9. This is the minimum launch-ready state. COULD ship here if US4 + US5 are accepted as follow-ups, but read the risk note below.

### Recommended Full Hotfix Increment (P1 + P2)

10. Complete Phase 6: User Story 4 (T028–T030).
11. Complete Phase 7: User Story 5 (T031–T037).
12. Complete Phase 8: Polish (T038–T049).
13. All 8 Quickstart checks green.
14. Ship.

### Risk note on shipping without US4

US4 (collision auto-shift) is marked P2, but in realistic layouts it kicks in on a nontrivial subset of ads (roughly estimated 10–25% of Minimalist + UI-logo combinations where the layout contract places the CTA in the same corner the planner picks for the logo). Shipping without US4 means those ads render with the logo overlapping the CTA text — unshippable to the user. Practically, US4 is closer to a P1.5: deferable only if the immediate demand is fixing US1 + US2 + US3 and a point-release for US4 lands within days.

### Risk note on shipping without US5

US5 (carousel + batch mode mix) is genuinely P2 — carousels without it still render (all slides in the same mode), and the visual weakness is "feels uniform" not "is broken". Shippable without if carousel volume is low for launch.

---

## Notes

- `[P]` tasks touch different files or different non-overlapping regions of the same file.
- `[Story]` labels map each task to a spec user story for traceability.
- Every change to `functions/src/generators.ts` is a merge-conflict-prone edit — coordinate on line regions when two tasks touch the file concurrently.
- `functions/src/contractFixtures.test.ts` is append-only for HOTFIX-E — do not rewrite earlier HFA–HFD / HFC fixtures.
- Commit after each task or logical group. Suggested commit message prefix: `refactor: HOTFIX-E T### — <short summary>` per existing branch convention (see commit `9fa85ac` for HOTFIX-D's pattern).
- Do NOT ship without all 8 Quickstart checks green in staging AND at least 3 reviewers on the PR (Constitution Principle IX — proof required).
- Avoid: vague tasks, skipping Phase 2 foundational work, mixing US1/US2/US3 into a single giant commit (it will be unreviewable — keep per-story commits).
