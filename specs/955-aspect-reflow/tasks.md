---

description: "Task list for HOTFIX-F — Deterministic Aspect Ratio Reflow"
---

# Tasks: HOTFIX-F — Deterministic Aspect Ratio Reflow

**Input**: Design documents from `/specs/955-aspect-reflow/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks ARE included — the launch matrix's HFF.6 explicitly mandates a 12-fixture suite in `functions/src/contractFixtures.test.ts`. The spec also includes 10 measurable success criteria (SC-001 through SC-010), several of which are verified by these fixtures.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story. User Story 1 and User Story 2 together form the functional MVP because the auto-router needs both routes to exist to be useful.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4, US5)
- File paths are absolute under the repo root `D:/proads-worktrees/0954-hotfix-aspect-reflow/`

## Path Conventions

- Backend: `functions/src/*.ts`
- Frontend: `src/*.tsx`, `src/types.ts`
- Backend tests: `functions/src/contractFixtures.test.ts` (extend existing) and `functions/src/__tests__/__fixtures__/`

---

## Phase 1: Setup

**Purpose**: Confirm baseline tooling. The repo is already initialized; this hotfix adds files in-place.

- [x] T001 Verify Sharp `^0.33.5` is installed and importable in `functions/` (already declared in `functions/package.json`; run `cd functions && npm ls sharp` to confirm)
- [x] T002 [P] Create the test fixture directory `functions/src/__tests__/__fixtures__/` if not already present; add a 1024×1024 PNG named `reflow-source-1x1.png` for the byte-identity test (any solid-content PNG with deterministic pixels works — a checkerboard or linear gradient is recommended for visual debug)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types, the magnitude router, and the trace-builder extension. These are consumed by every user story; no story can proceed without them.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T003 [P] Add new types to `functions/src/types.ts`: `ReflowMethod = 'auto' | 'outpaint' | 'rerender'`, `ReflowScope = 'single' | 'batch_all' | 'carousel_all' | 'carousel_slide'`, `ReflowFallbackReason = 'engine_error' | 'drift' | 'no_plan' | 'mask_error' | 'transient'`, `ReflowHistoryEntry`, `ReflowDecision`, `ReflowOutcome` per `specs/955-aspect-reflow/data-model.md`. Extend the existing `ResolutionTrace` interface with the optional `reflowHistory?: ReflowHistoryEntry[]` field.
- [x] T004 [P] Mirror types in `src/types.ts` (frontend): `ReflowMethod`, `ReflowScope`, `ReflowFallbackReason`, `ReflowHistoryEntry`, `ReflowOutcome` (needed to type the callable response and render per-item error rows in T032). Frontend does NOT need `ReflowDecision` (used only inside the backend router).
- [x] T005 [P] Extend `functions/src/resolutionTrace.ts::TraceBuilder` with `addReflowHistoryEntry(entry: ReflowHistoryEntry): TraceBuilder`. Add internal state `_reflowHistory?: ReflowHistoryEntry[]` to `ResolutionTraceDraft`. Update `build()` to emit `reflowHistory: state._reflowHistory ? state._reflowHistory.map(e => ({ ...e })) : undefined` in the frozen result.
- [x] T006 Create `functions/src/reflowRouter.ts` exporting `decideMethod(sourceRatio: AspectRatio, targetRatio: AspectRatio, method: ReflowMethod): ReflowDecision` that computes the symmetric fold-change `magnitude = max(target/current, current/target) - 1` (where each ratio is its `width/height` numeric value) and returns `{ chosenMethod: 'outpaint' | 'rerender', isUserOverride: boolean, magnitude }`. When `method === 'auto'`, choose `outpaint` if `magnitude < 0.30` else `rerender`. When `method === 'outpaint'` or `method === 'rerender'`, return that method directly with `isUserOverride: true`. Also export a constant table `RATIO_TO_NUMERIC: Record<AspectRatio, number>` mapping each of the six supported ratios to its numeric value.
- [x] T007 In `functions/src/generators.ts:5181-5230`, gate off the existing user-facing generative-edit REFLOW path. Add an early-throw guard at the entry of the `if (isReflow)` branch (line ~5191) that throws `new Error("Deprecated REFLOW path; use reflowImage callable instead (FR-026)")` when invoked from any non-internal caller. If `generateFinalAd` is also called for internal carousel/batch reflow inside `generators.ts:2235` or `generators.ts:3748`, route those internal callers through `reflowRerender` (created later in T010) instead of the generative-edit prompt. Confirm by grep that no user-facing path constructs the literal string `"REFLOW: Ratio"` after this change.

**Checkpoint**: Foundation ready — types, router, trace builder extension, and deprecated path lockout all in place.

---

## Phase 3: User Story 1 — A 4:5 → 9:16 reflow no longer stretches the hero's face (Priority: P1) 🎯 MVP path A

**Goal**: Implement the rerender-from-plan route end-to-end so that the launch matrix's headline failure case (4:5 → 9:16) routes to a fresh full-pipeline render with `aspectRatio` swapped.

**Independent Test**: Render a 4:5 ad. Reflow to 9:16 with method=Auto. Verify the new image has normal facial proportions, identical text, and `resolutionTrace.reflowHistory[0].method === 'rerender'`.

### Tests for User Story 1

- [x] T008 [P] [US1] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.b** — single 4:5 → 9:16 auto-routes to rerender.
- [x] T009 [P] [US1] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.d** — rerender loads the original plan and overrides aspect ratio.

### Implementation for User Story 1

- [x] T010 [US1] Create `functions/src/reflowRerender.ts` exporting `rerenderFromPlan`(args: { generationId: string; targetRatio: AspectRatio; itemIndex: number | null }): Promise<{ outputUrl: string; creditsCharged: number }>`. Logic: load `generations/{generationId}` via Admin SDK; pull the saved `buildPlan` (or `output.carouselSlides[itemIndex].buildPlan` when carousel item; or `output.batchResults[itemIndex].buildPlan` when batch item); throw a typed `NoPlanError` (with `fallbackReason: 'no_plan'`) if missing or corrupt; clone the plan with `aspectRatio` swapped to `targetRatio`; invoke the existing `generateFinalAd` (or the closest existing single-render entrypoint in `generators.ts`) with the swapped plan and the original inputs; return the new image URL and the rerender credit cost (matches `COSTS.reflowImage = 5` from `functions/src/index.ts:98`).
- [x] T011 [US1] Create `functions/src/reflowImage.ts` exporting `reflowImageHandler(request: CallableRequest): Promise<ReflowImageResponse>`. Implement single-scope flow only in this task: pre-flight validation (auth, team-role, generation lookup, ratio validation, method validation, no-op short-circuit per FR-005) → call `decideMethod` → for chosenMethod `rerender`, call `reflowRerender` → on success, run the Firestore transaction described in `contracts/reflow-history-trace.md` to append `mockupHistory` entry and `resolutionTrace.reflowHistory` entry → deduct credits → return `{ success: true, scope: 'single', outcomes: [outcome], totalCreditsCharged }`. Outpaint path is wired in T018; carousel/batch in T029. For now, `chosenMethod === 'outpaint'` should throw `not-implemented` until T018.
- [x] T012 [US1] In `functions/src/index.ts`, register `export const reflowImage`
- [x] T013 [US1] In `src/App.tsx` Step 4, replace the existing user-facing reflow invocation (the path that currently constructs a `REFLOW: Ratio …` editInstruction and calls into the umbrella `generateCreative` via `gemini.generateFinalAd`) with `httpsCallable<ReflowImageRequest, ReflowImageResponse>('reflowImage')` for the **single-scope** case. Pass `{ generationId, targetAspectRatio, method: 'auto', scope: 'single' }`. On success, append the new `{ url, ratio }` to local `mockupHistory` state to mirror the backend write. On error, render an inline error message in Step 4. The carousel/batch flow on `generators.ts:2235` and `generators.ts:3748` is rerouted in T026.

**Checkpoint**: User Story 1 fully functional — 4:5 → 9:16 reflow ships a correctly framed image at the new ratio with no hero stretching. Outpaint path is not yet usable; auto-router for small ratios will throw until US2 lands.

---

## Phase 4: User Story 2 — A 1:1 → 4:5 reflow preserves the hero and the offer pixel-identically (Priority: P1) 🎯 MVP path B

**Goal**: Implement the Sharp-based outpaint route with byte-identity verification so small canvas-shape changes preserve the source's center 70 % exactly.

**Independent Test**: Render a 1:1 ad. Reflow to 4:5 with method=Auto. Verify the auto-router selects outpaint, the center 70 % of the output is byte-identical to the source's corresponding region, and only the new top/bottom margins differ.

### Tests for User Story 2

- [x] T014 [P] [US2] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.a** — single 1:1 → 4:5 auto-routes to outpaint. Use the fixture PNG from T002. Assert: `outcomes[0].method === 'outpaint'`, `magnitude === 0.25` (within 0.001), `userOverride === null`, `mockupHistory` grew by one with `ratio: '4:5'`, `reflowHistory[0].method === 'outpaint'`.
- [x] T015 [P] [US2] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.c** — outpaint preserves byte-identity in the center 70 %. Use the fixture PNG. After the outpaint runs, decode both the source and the output as raw RGBA buffers via Sharp (`sharp(buf).raw().toBuffer()`); compute the locked rectangle on the output (35 % inset on each side); assert byte-for-byte equality across all 4 channels with the source's full image rectangle. Any mismatch fails the test.
- [x] T016 [P] [US2] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.j** — no-op reflow when source ratio equals target ratio. Assert: `outcomes[0].outputUrl === source.url`, `outcomes[0].creditsCharged === 0`, `mockupHistory` did NOT grow, `reflowHistory` did NOT grow.

### Implementation for User Story 2

- [x] T017 [US2] Create `functions/src/reflowOutpaint.ts`
  - `outpaintReflow(args: { sourceImageUrl: string; sourceRatio: AspectRatio; targetRatio: AspectRatio }): Promise<{ outputBuffer: Buffer; outputUrl: string; creditsCharged: number }>` — fetches the source PNG (Storage GET), computes target dimensions from the source dimensions and `RATIO_TO_NUMERIC[targetRatio]` (preserving the unchanged dimension), computes symmetric padding, calls `sharp(srcBuf).extend({ top, bottom, left, right, extendWith: 'mirror' }).png().toBuffer()`, uploads the result to Storage at `users/{uid}/reflows/{newId}.png`, returns the URL and the outpaint credit cost (lower than rerender; the exact value is set by the platform pricing matrix and is captured as a constant in `reflowOutpaint.ts`).
  - `verifyLockedRegion(sourceBuffer: Buffer, outputBuffer: Buffer): Promise<{ ok: boolean; reason: 'drift' | 'shape_mismatch' | null }>` — decodes both via Sharp `.raw()`, asserts the source rectangle inside the output (centered, with the symmetric padding offsets) is byte-for-byte equal to the source buffer's full rectangle. Returns `{ ok: false, reason: 'drift' }` on any pixel mismatch; `{ ok: false, reason: 'shape_mismatch' }` if dimensions don't match expectation.
  - Use the existing lazy `getSharp()` pattern (cf. `functions/src/logoComposite.ts:14-28`); throw `new Error('Sharp not available — reflowOutpaint disabled')` if the load fails.
- [x] T018 [US2] In `functions/src/reflowImage.ts`, wire the outpaint route: when `decision.chosenMethod === 'outpaint'`, call `outpaintReflow` then `verifyLockedRegion`. On verification `ok === false`, throw a typed `OutpaintDriftError` (with `fallbackReason: 'drift'`); on engine throw, propagate as `OutpaintEngineError` (with `fallbackReason: 'engine_error'`). Both errors are caught by the fallback layer added in T024. On verification `ok === true`, append to `mockupHistory` and `resolutionTrace.reflowHistory` per T011.

**Checkpoint**: User Stories 1 + 2 complete — the auto-router is fully functional for single-scope reflow on every supported ratio pair. This is the MVP. The launch matrix's HFF.6 fixtures (a), (b), (c), (d), (j) all pass.

---

## Phase 5: User Story 3 — A user can force the route the auto-router did not pick (Priority: P2)

**Goal**: Honor user override (`method: 'outpaint'` or `method: 'rerender'`) without consulting the magnitude router and without falling back on failure.

**Independent Test**: Reflow with `method: 'outpaint'` for a 4:5 → 9:16 case (which Auto would route to rerender); verify outpaint runs and `userOverride === 'outpaint'` is recorded. Reflow with `method: 'rerender'` for a 1:1 → 4:5 case; verify rerender runs and `userOverride === 'rerender'`.

### Tests for User Story 3

- [x] T019 [P] [US3] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.e** — user override `method: 'outpaint'` on 4:5 → 9:16 forces outpaint. Assert: `outcomes[0].method === 'outpaint'`, `userOverride === 'outpaint'`, no fallback occurred, `magnitude` is computed but the route was forced regardless.
- [x] T020 [P] [US3] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.f** — user override `method: 'rerender'` on 1:1 → 4:5 forces rerender. Assert: `outcomes[0].method === 'rerender'`, `userOverride === 'rerender'`, no fallback occurred.

### Implementation for User Story 3

- [x] T021 [US3] In `functions/src/reflowImage.ts`, gate the fallback chain on `decision.isUserOverride`. When the user explicitly picked a method (override), failures MUST surface as `HttpsError('internal', …)` with the per-item `errorCode` and `errorMessage` populated; no fallback is attempted (research.md R6). The existing fallback wiring (added in T011 for rerender, T018 for outpaint) wraps the route call and short-circuits the catch block when `decision.isUserOverride === true`.
- [x] T022 [US3] In `src/App.tsx` Step 4, add the method selector above the per-ratio buttons. Default state: collapsed, showing the label `Method: Auto` with an `Edit` toggle. On Edit toggle, expand to show three radio buttons: `Auto (recommended)`, `Quick (outpaint — keeps subject identical, fastest)`, `Fresh render (re-render — best for dramatic ratio changes)`. Selection is held in component state and passed to the `reflowImage` callable as `request.method`. Auto is `'auto'`; Quick is `'outpaint'`; Fresh is `'rerender'`. The selector resets to Auto whenever the user navigates away from Step 4 and returns.

**Checkpoint**: User Story 3 complete — Auto/Quick/Fresh selector ships in Step 4; user overrides bypass the auto-router; user-override failures surface as errors without silent fallback.

---

## Phase 6: User Story 4 — Outpaint failure transparently falls back to re-render-from-plan (Priority: P2)

**Goal**: When the auto-router picks outpaint and either the engine throws or the verification step detects center-region drift, automatically re-run the same reflow via rerender-from-plan; charge the user only for the route that ultimately succeeded.

**Independent Test**: Inject a synthetic outpaint drift (a stub that returns an output with one pixel altered inside the locked region). Run Auto reflow on a small-change pair. Verify the verification rejects the outpaint output, the rerender route runs, the user receives a correct image, and credits are deducted only once.

### Tests for User Story 4

- [x] T023 [P] [US4] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.g** — outpaint engine returns a drifted output on a 1:1 → 4:5 auto reflow. Inject a stub for `outpaintReflow` that returns an output with a single byte altered inside the locked region. Assert: `verifyLockedRegion` returns `{ ok: false, reason: 'drift' }`, the system falls back to rerender, `outcomes[0].method === 'rerender'`, `outcomes[0].fallbackFrom === 'outpaint'`, `outcomes[0].fallbackReason === 'drift'`, the user is charged the rerender cost only (not outpaint + rerender).

### Implementation for User Story 4

- [x] T024 [US4] In `functions/src/reflowImage.ts`, implement the bidirectional fallback chain for `decision.isUserOverride === false`:
  - When `chosenMethod === 'outpaint'`: try `outpaintReflow` + `verifyLockedRegion`; on `OutpaintEngineError` or `OutpaintDriftError`, swallow and call `reflowRerender`; record `fallbackFrom: 'outpaint'`, `fallbackReason: 'engine_error' | 'drift'`. If `reflowRerender` then throws (e.g., `NoPlanError`), surface `HttpsError('internal', …)` with the original outpaint reason in `details` so the user is told both attempts failed.
  - When `chosenMethod === 'rerender'`: try `reflowRerender`; on `NoPlanError`, swallow and call `outpaintReflow` + `verifyLockedRegion`; record `fallbackFrom: 'rerender'`, `fallbackReason: 'no_plan'`. If outpaint also fails, surface a clear `HttpsError('internal', "This generation predates plan persistence and cannot be reflowed; please re-generate the ad and try again.")`.
  - Loop prevention: a fallback chain is at most one hop deep — outpaint → rerender or rerender → outpaint, never both.
  - Credit accounting: charge the route that ultimately succeeded only (FR-017). The pre-flight credit reservation uses the upper bound of the planned routes; reconcile and refund the difference at completion.

- [x] T024a [P] [US4] In `src/App.tsx`, when a reflow response item carries `fallbackFrom !== null`, render a small dismissable post-fact notice next to the corresponding `mockupHistory` thumbnail — "Auto-upgraded to Fresh render for a clean result" on `fallbackFrom === 'outpaint'`; "Auto-fell-back to Quick reflow because this generation predates plan persistence" on `fallbackFrom === 'rerender'`. The notice MUST be visually distinct from per-item error rows (informational, not destructive) and MUST be dismissable. Implements FR-032 (constitution Principle VII signal).

**Checkpoint**: User Story 4 complete — auto-routed reflows recover silently from per-route failures; user overrides remain non-falling-back per US3.

---

## Phase 7: User Story 5 — Carousel and batch reflow apply the router per item (Priority: P2)

**Goal**: Run the per-item router for `scope: 'carousel_all'`, `scope: 'batch_all'`, and `scope: 'carousel_slide'` with concurrency cap 5; deliver successful items independently; surface per-item errors without blocking sibling items; preserve carousel slide order.

**Independent Test**: Reflow a 5-slide carousel from 1:1 to 9:16 with method=Auto; verify all 5 slides routed to rerender, all 5 land in `mockupHistory`, slide order preserved. Reflow a 4-variant batch from 4:5 to 3:4; verify all 4 routed to outpaint. Inject a synthetic failure on slide 3 of a 5-slide carousel and verify slides 1, 2, 4, 5 succeed and slide 3 surfaces an error without blocking.

### Tests for User Story 5

- [x] T025 [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.h** — carousel `scope: 'carousel_all'` reflow 1:1 → 9:16 on a 5-slide source. Assert: `outcomes.length === 5`, every outcome has `method === 'rerender'`, slide order preserved (the order of `outcomes` matches the order of `output.carouselSlides`), each outcome's `creditsCharged` equals the rerender cost, `mockupHistory` grew by 5 entries all with `ratio: '9:16'`.
- [x] T026 [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.i** — partial failure on a 5-slide carousel where slide 3 has no saved plan and outpaint also fails on slide 3. Assert: `outcomes[0/1/3/4]` succeed, `outcomes[2].success === false` with `errorCode: 'no_plan'`, `mockupHistory` grew by exactly 4 entries, the 4 successful entries are in original slide order (slide 3 absent).
- [x] T027 [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.k** — invalid target ratio rejected at the callable boundary. Pass `targetAspectRatio: '2:1'`; assert `HttpsError('invalid-argument', …)` is thrown, no Firestore writes occurred, no credit deduction occurred.
- [x] T028 [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.l** — deprecated REFLOW path is locked out. Invoke `generators.ts::generateFinalAd` (or its closest entrypoint) with an `editInstruction` containing the literal `"REFLOW"` string from a non-`reflowImage` caller path; assert the call throws (per T007's gate). Confirms FR-026.
- [x] T028a [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.m** — favorites and saved-projects scope preserved across reflow (FR-030). Setup: source generation `genA` is favorited (`favorites/{userId}/items/{genA}` exists) and present in `savedProjects`. Run a 1:1 → 4:5 reflow on `genA`. Assert: (1) the `generations` collection size is unchanged (FR-029); (2) the favorite document for `genA` still exists with the same id and target reference; (3) the `savedProjects` query that returned `genA` pre-reflow still returns `genA` post-reflow, with the new mockup visible via the appended `mockupHistory[]` entry.
- [x] T028b [P] [US5] In `functions/src/contractFixtures.test.ts`, add fixture **HFF.6.n** — reflow of a previous reflow output uses the ORIGINAL plan (FR-031). Setup: source generation `genA` rendered at 1:1 with saved `buildPlan`. Step 1: reflow `genA` 1:1 → 4:5 (auto-routes to outpaint, appends `{ url: U1, ratio: '4:5' }` to `genA.mockupHistory`). Step 2: invoke a reflow on the same `genA` from 4:5 → 9:16 (auto-routes to rerender). Assert: (1) the rerender call to `generateFinalAd` received `genA`'s ORIGINAL `buildPlan` with only `aspectRatio` swapped to `'9:16'` (NOT a plan derived from U1); (2) the new entry `{ url: U2, ratio: '9:16' }` was appended to `genA.mockupHistory` (NOT to a new generation doc); (3) `generations` collection size unchanged; (4) `genA.resolutionTrace.reflowHistory` now has exactly 2 entries in chronological order.

### Implementation for User Story 5

- [x] T029 [US5] In `functions/src/reflowImage.ts`, expand the handler to support `scope: 'carousel_all'`, `scope: 'batch_all'`, and `scope: 'carousel_slide'`:
  - `carousel_all`: read `output.carouselSlides[]` from the source generation; build N per-item plans (each item carries the slide's saved build plan and its own `sourceRatio`); dispatch via the concurrency-capped runner (T030).
  - `batch_all`: read `output.batchResults[]` from the source generation; build N per-item plans; dispatch via the same runner.
  - `carousel_slide`: validate `slideIndex` against `output.carouselSlides.length`; build a single-item plan and dispatch.
  - Each per-item run uses the same router + fallback chain as `single` (T024). Per-item Firestore transactions are independent (research.md R7).
- [x] T030 [US5] In `functions/src/reflowImage.ts`, implement a concurrency-capped runner: `runWithConcurrency<T>(items: T[], cap: number, worker: (t: T, idx: number) => Promise<ReflowOutcome>): Promise<ReflowOutcome[]>` using a sliding-window scheduler (no library; same pattern as the existing batch render in `generators.ts:3889-3925`). Cap = 5. Aggregates `Promise.allSettled` results and maps rejections into `ReflowOutcome { success: false, errorCode, errorMessage }` so partial failures do not throw.
- [x] T031 [US5] In `functions/src/reflowImage.ts`, ensure the response shape stays the same for single and multi-item scopes — `outcomes: ReflowOutcome[]` with `itemIndex` populated for multi-item and `null` for single — and `totalCreditsCharged` is the sum of per-item `creditsCharged` for items that ultimately succeeded.
- [x] T032 [US5] In `src/App.tsx` Step 4 carousel/batch render area, wire the multi-item reflow to `httpsCallable('reflowImage')` with the appropriate scope. On response: append each successful outcome's `{ url, ratio }` to local `mockupHistory` state at the corresponding slide index (preserve order); for each failed outcome, render an inline per-item error row with a `Retry` button that re-invokes `reflowImage` for just that `slideIndex` (scope = `'carousel_slide'`). Loading state shows per-item status badges (`pending` / `outpainting` / `rerendering` / `done` / `error`).
- [x] T033 [US5] In `functions/src/generators.ts`, the existing internal auto-reflow callers at line 2235 and line 3748 (currently constructing `REFLOW ONLY — adapt this exact design to {ratio} ratio.` editInstructions) MUST now route through `reflowRerender(args)` (or, for those internal flows that genuinely should outpaint, through `reflowOutpaint(args)` after the magnitude check). Replace the inline editInstruction construction with calls into the new modules. This satisfies FR-026's "no user-facing path can reach the deprecated REFLOW prompt" requirement while preserving the internal multi-size auto-reflow behavior.

**Checkpoint**: All five user stories complete. The full HOTFIX-F surface ships.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, documentation, and non-regression checks.

- [x] T034 [P] Run `cd functions && npm run build` and confirm zero TypeScript errors with strict mode.
- [x] T035 [P] Run `npm run lint` at the repo root and confirm zero lint violations introduced by this hotfix.
- [x] T036 [P] Run `cd functions && npm test -- contractFixtures` and confirm all 14 new HFF.6 fixtures pass (a, b, c, d, e, f, g, h, i, j, k, l, m, n).
- [x] T037 [P] Run `cd functions && npm test` (full suite) and confirm zero regressions in the existing `failureClassification`, `languageQuality`, `savedProjects`, and other test files.
- [ ] T038 Run the 10-step `specs/955-aspect-reflow/quickstart.md` recipe end-to-end against a local Firebase emulator. Capture before/after screenshots for the 4:5 → 9:16 headline case (Step 3) and the 1:1 → 4:5 byte-identity case (Step 4). Attach to the PR.
- [ ] T039 [P] Verify SC-001 through SC-010 from `specs/955-aspect-reflow/spec.md` against actual rendered output samples per the quickstart's Step 9 (non-regression smoke). Document the SC-001 result (≥ 19/20 correct on 4:5 → 9:16), the SC-002 result (20/20 byte-identical on 1:1 → 4:5), and the SC-005 result (20/20 zero outpaint drift) in the PR description.
- [x] T040 [P] Confirm `CLAUDE.md` Recent Changes entry for `955-aspect-reflow` is accurate and the file's "Active Technologies" list has been refreshed (the agent context update step in `/speckit.plan` already did this; verify on this branch).
- [x] T040a [P] Verify cost-constant alignment per FR-017: `COSTS.reflowImage = 5` (functions/src/index.ts:99) matches `COSTS.generateImage = 5` (fresh single-image cost); `OUTPAINT_CREDIT_COST = 2` (functions/src/reflowOutpaint.ts:27) is strictly less. Verified.
- [ ] T041 [P] Append a one-line entry to `docs/LAUNCH_MATRIX.md` § HOTFIX-F status block noting this PR closes HOTFIX-F.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup. **BLOCKS all user stories**.
- **User Story 1 (Phase 3)**: Depends on Foundational. Independent of US2-US5.
- **User Story 2 (Phase 4)**: Depends on Foundational. Independent of US1.
- **User Story 3 (Phase 5)**: Depends on Foundational; integrates with US1 and US2 (touches `reflowImage.ts` after US1 created it).
- **User Story 4 (Phase 6)**: Depends on Foundational and US1+US2 (the fallback chain needs both routes to exist).
- **User Story 5 (Phase 7)**: Depends on Foundational and US1+US2+US3+US4 (carousel/batch dispatches the same per-item logic).
- **Polish (Phase 8)**: Depends on all desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: Can start after Foundational. Independent.
- **US2 (P1)**: Can start after Foundational. Independent of US1; the two ship together as the MVP.
- **US3 (P2)**: Touches `reflowImage.ts` and `App.tsx`. Best done after US1 + US2 since it adds the override gate to the existing route-execution wiring.
- **US4 (P2)**: Adds the auto-fallback chain on top of the route-execution wiring. Best done after US1 + US2 + US3.
- **US5 (P2)**: Carousel/batch dispatch. Reuses the per-item logic from US1-US4. Done last.

### Within Each User Story

- Tests are written before implementation tasks but may run after implementation lands (tests verify, not drive). The launch matrix mandates the test fixtures, so they MUST exist by Phase 8 completion.
- The order within each user story is: tests scaffolded → implementation → tests pass.

### Parallel Opportunities

- T003, T004, T005 in Phase 2 can run in parallel (different files).
- T002 in Phase 1 can run in parallel with T001.
- Within US1: T008, T009 in parallel (same file but different test cases — append-only).
- Within US2: T014, T015, T016 in parallel.
- Within US3: T019, T020 in parallel.
- Within US5: T025, T026, T027, T028 in parallel.
- Phase 8 polish tasks T034, T035, T036, T037, T039, T040, T041 in parallel; T038 (manual quickstart) is sequential.

---

## Parallel Example: User Story 2

```bash
# Launch all US2 tests in parallel:
Task: "T014 [P] [US2] HFF.6.a — auto routes to outpaint on 1:1 → 4:5"
Task: "T015 [P] [US2] HFF.6.c — outpaint preserves byte-identity in center 70%"
Task: "T016 [P] [US2] HFF.6.j — no-op short-circuit"

# Then implementation in sequence (same file: reflowImage.ts and reflowOutpaint.ts):
Task: "T017 [US2] Create reflowOutpaint.ts with outpaintReflow + verifyLockedRegion"
Task: "T018 [US2] Wire outpaint route into reflowImage.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2)

1. Complete Phase 1: Setup (T001, T002).
2. Complete Phase 2: Foundational (T003–T007). **Blocks all stories.**
3. Complete Phase 3: User Story 1 (T008–T013). Now 4:5 → 9:16 ships correctly via rerender.
4. Complete Phase 4: User Story 2 (T014–T018). Now 1:1 → 4:5 ships correctly via outpaint.
5. **STOP and VALIDATE**: Run `cd functions && npm test -- contractFixtures` — fixtures (a), (b), (c), (d), (j) MUST pass. Manually verify the headline failure case (4:5 → 9:16) in the emulator.
6. **MVP complete** — the deterministic two-route reflow router is fully functional for single-image reflow on every supported ratio pair. The launch-matrix headline failure case is fixed. SC-001 and SC-002 verifiable.

### Incremental Delivery

1. MVP (US1 + US2) — fixes the launch-matrix headline failure. **Ship independently if needed.**
2. Add User Story 3 — Auto/Quick/Fresh selector unblocks the user-override path.
3. Add User Story 4 — auto-fallback resilience.
4. Add User Story 5 — carousel and batch propagation.
5. Phase 8 polish — full SC verification, lint/typecheck, quickstart recipe.

### Parallel Team Strategy (with two backend developers)

1. Both complete Phase 1 + Phase 2 together.
2. Once Foundational is done:
   - Developer A: User Story 1 (T008–T013).
   - Developer B: User Story 2 (T014–T018).
3. Both stories merge; Developer A picks up US3, Developer B picks up US4 in parallel (US3 and US4 touch the same files, so coordinate via file-level checkout — US3 first, then US4 builds on it).
4. Whichever developer is free picks up US5 (carousel/batch).
5. Both pair on Phase 8 polish.

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks.
- [Story] label maps task to specific user story for traceability.
- US1 and US2 are both P1 and form the MVP together — both ship in the first deployable increment.
- The launch matrix's HFF.6 specifies 4 test cases as the minimum bar. This task list expands to 14 fixtures (a–n) covering the full router, fallback chain, override, partial-failure, deprecated-path-lockout, persistence-scoping (favorites/saved-projects), and reflow-of-reflow surfaces.
- After this hotfix, Phase 19 — Direct-Response Design Upgrades is unblocked per the launch matrix dependency chain.
- Verify tests fail (where applicable — e.g., the byte-identity test should fail before the implementation lands) before implementing.
- Commit after each task or logical group.
- Stop at any checkpoint to validate the story independently.
- Avoid: vague tasks, same-file conflicts (T011, T018, T021, T024, T029, T030, T031 all touch `reflowImage.ts` and MUST run sequentially).
