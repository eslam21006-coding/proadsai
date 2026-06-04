---
description: "Task list for Phase 025 — OpenAI gpt-image-2 + Native Text Rendering"
---

# Tasks: OpenAI gpt-image-2 + Native Text Rendering

**Input**: Design documents from `specs/025-openai-image-swap/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/openai-image-caller.md ✅, quickstart.md ✅

**Tests**: The spec relies on **manual QA** (quickstart T1–T10 + Arabic ≥95% sampling) for acceptance and does not request TDD. A small set of **optional** unit tests for the new pure logic (size map / response shaping / routing) is included as `[P]` tasks and may be skipped — all are clearly marked OPTIONAL.

**Organization**: Tasks are grouped by user story. The OpenAI caller + routing + config are Foundational (block every story). MVP = User Story 1.

**Path note**: all backend paths are under `functions/src/`. Line numbers are anchors from the verified plan; confirm by symbol name before editing (file may have shifted).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (maps to spec.md user stories)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and the single config switch.

- [X] T001 Add `"openai"` to `dependencies` in `functions/package.json` and run `cd functions && npm install` (research D4). Pin a current major version.
- [X] T002 [P] Create `functions/src/modelConfig.ts` exporting `MODEL_PROVIDER: 'openai' | 'gemini' = 'openai'`, `OPENAI_VISUAL_MODEL = 'gpt-image-2'`, `OPENAI_SIZE_BY_ASPECT` (1:1→1024x1024, 4:5→1024x1280, 3:4→1024x1360, 9:16→1024x1792, 4:3→1360x1024, 16:9→1792x1024), and `OPENAI_IMAGE_TIMEOUT_MS = 120000` (data-model §4, research D3).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The drop-in OpenAI caller, the model-aware router, the audit trace field, and secret wiring. **No user story can function until this phase is complete.**

**⚠️ CRITICAL**: Blocks all of Phase 3–6.

- [X] T003 Create `functions/src/openAIImageCaller.ts` exporting `createOpenAIImageCaller(apiKey: string): GeminiCaller` per contract C1: extract & concat `contents.parts[].text` → prompt; collect `inlineData` base64 refs; resolve `size` from `config.imageConfig.aspectRatio` via `OPENAI_SIZE_BY_ASPECT` (fallback `1024x1024`); if ≥1 ref → `images.edit({ model: OPENAI_VISUAL_MODEL, image: <refs>, prompt, size })` — **verify gpt-image-2 multi-image `images.edit()` support; if supported pass ALL collected `refs`, else `refs[0]`** (FR-016 face-fidelity parity); else `images.generate({ model: OPENAI_VISUAL_MODEL, prompt, size })`; enforce 120s timeout (throw on exceed); return the createGeminiCaller-identical shape `{ text?, candidates:[{ content:{ parts:[{ inlineData:{ mimeType:'image/png', data:<raw b64_json, NO prefix> } }] } }] }` (research D5); **throw** descriptive `Error` on any failure (auth/429/rejection/timeout/empty); ignore `thinkingConfig`/`safetySettings`/`responseModalities`. (depends on T001, T002)
- [X] T004 Add `createVisualRoutingCaller(geminiKey: string, openaiKey: string): GeminiCaller` in `functions/src/index.ts` (near `createGeminiCaller` ~3869) per contract C2: returns `(params) => (MODEL_PROVIDER==='openai' && params.model===VISUAL_MODEL) ? openai(params) : gemini(params)`. Import `MODEL_PROVIDER`/`OPENAI_VISUAL_MODEL` from `./modelConfig.js`. (depends on T003)
- [X] T005 [P] Extend the `ResolutionTrace` interface at `functions/src/generators.ts:4312` with optional `visualProvider?: { provider:'openai'|'gemini'; model:string; size?:string; usedReferenceEdit?:boolean; copyFidelityGated?:boolean; arabicQaRan?:boolean; timedOut?:boolean }` (data-model §1); mirror the optional field in the sibling `ResolutionTrace` at `functions/src/types.ts:231` to keep the shared shape in sync.
- [X] T006 [P] Verify `defineSecret("OPENAI_API_KEY")` exists (`index.ts:63`) and that `OPENAI_API_KEY` is read **lazily inside callable bodies** only; confirm both `OPENAI_API_KEY` and `GEMINI_API_KEY` coexist (FR-020, research D6). No module-top access.
- [ ] T007 [P] *(OPTIONAL)* Add `functions/src/__tests__/openAIImageCaller.test.ts` covering: aspect→size mapping for all 6 ratios + unknown fallback; edit-vs-generate selection by ref presence; response-shape normalization (raw base64, candidates structure); timeout path throws. Register it in the `test` script in `functions/package.json`. *(SKIPPED — optional)*

**Checkpoint**: Caller compiles, router selects correctly, trace field exists. User stories can begin.

---

## Phase 3: User Story 1 — Visually distinct text layouts per design (Priority: P1) 🎯 MVP

**Goal**: gpt-image-2 renders the complete image including ad copy with free-form, varied placement; correct RTL/connected Arabic.

**Independent Test**: Generate 3 concepts for one offer → each has a visibly different text layout with correct copy (spec SC-001/002; quickstart T1–T4).

- [X] T008 [US1] In `buildFinalImagePrompt()` (`generators.ts:4324–4460`), comment out the existing Gemini visual prompt block, wrapped exactly as `/* === GEMINI PROMPT (preserved for revert) === ... === END GEMINI PROMPT === */` (CHANGE 2, FR-023). Do not delete.
- [X] T009 [US1] In the same function, build the GPT-native prompt: an `AD COPY TO RENDER ON THIS IMAGE` block (Main Hook / Supporting Line [omit if empty] / CTA Button / Benefit Line [omit if empty], FR-006), a `TEXT PLACEMENT` block (natural+varied placement, every design different, Arabic RTL fully-connected no-Latin, CTA inside a distinct button/shape, sufficient contrast — FR-007/008/009), and a `QUALITY` block (ultra-high-res, professional, Arabic zero-tolerance letterforms — FR-010). Keep all structural parameters of the function intact. (same file as T012 — coordinate; not [P])
- [X] T010 [US1] In `serverGenerateFinalAd` (`index.ts:4213`), replace the visual caller injection `generators.setGeminiCaller(createGeminiCaller(geminiApiKey.value()))` (~line 4236) with `generators.setGeminiCaller(createVisualRoutingCaller(geminiApiKey.value(), openaiApiKey.value()))`; confirm `secrets:[geminiApiKey, openaiApiKey]` (already present, 4215). (depends on T004)
- [X] T011 [US1] Populate `resolutionTrace.visualProvider` at the final render path (`generators.ts` ~5914, where `inlineData.data` is consumed) with `provider`, `model`, resolved `size`, and `usedReferenceEdit` (FR — Principle VI audit). (depends on T005)
- [X] T011a [US1] Write the `visualProvider` audit trace at the **polish/edit render path** (`serverEditRegion`, `index.ts:~4422`) too, same fields as the main render path, so that visual render is also auditable (Constitution VI — closes analysis finding M2). (depends on T005; coordinate with T016)

**Checkpoint**: Run quickstart T1 (Arabic+hero), T2 (Arabic no-hero), T3 (English), T4 (3 concepts vary). MVP demoable.

---

## Phase 4: User Story 2 — All non-text creative guarantees preserved (Priority: P1)

**Goal**: Face identity, cultural compliance, brand color, logo, layout zones, gaze, creative modes, carousel anchor behave exactly as before the swap.

**Independent Test**: Arabic ad + hero through a creative mode → face identity, cultural compliance, brand color, logo, and mode element all correct (spec SC-004; quickstart T5).

- [X] T012 [US2] In the new GPT prompt (T009 file), preserve **verbatim** every non-text-rule block: hero face identity lock, wardrobe/customization, `CULTURAL_COMPLIANCE_BLOCK` + `ARABIC_WARDROBE_BLOCK`, brand-color injection/enforcement, logo instruction blocks, layout-contract zone proportions, gaze (`heroGaze`), all creative-mode rules (event_ticket/value_stack/before_after/speaker_card/webinar_screen/…), carousel visual directive + style anchor, and safe-zone percentages (FR-011–014). Diff against the commented Gemini block to confirm nothing was dropped except the text-rendering rules. (coordinate with T009)
- [X] T013 [US2] Verify CHANGE 1: confirm `compositeArabicText`/`compositeFullAdText` are NOT called in the live render path (research D2) — no code change needed; leave `functions/src/textCompositing.ts` intact. Confirm `compositeUILogos` (`generators.ts:6214,6363`) and `compositeOfferOverlay` (`6256,6386`) still run post-render on the gpt-image-2 output buffer (model-agnostic). Document in PR notes that the brief's "comment out Sharp text" is already satisfied.

**Checkpoint**: Run quickstart T5 + cross-cutting cultural/brand/logo/identity checks on Arabic+hero generations.

---

## Phase 5: User Story 3 — Reflow, Polish, carousel & batch keep working (Priority: P2)

**Goal**: All downstream visual flows run on the new engine; copy-fidelity retry gated per provider.

**Independent Test**: Reflow 1:1→9:16 (same hero, recomposed), 5-slide carousel (hero consistent, layouts vary), Polish edit, 4-item batch all succeed (spec SC-005; quickstart T6–T9).

- [X] T014 [US3] Gate the `validateCopyFidelity` retry loop (`generators.ts:3951–4002`) behind `MODEL_PROVIDER`: when `'openai'`, do a single build-plan pass (skip retries, set `copyFidelityGated=true` in trace); when `'gemini'`, run intact ≤3 attempts (FR-018/019, contract C4). Do **not** modify `validateCopyFidelity` in `buildPlanSlotMap.ts`.
- [X] T015 [US3] In `reflowImage` (`index.ts:4330`), build the routing caller and pass it through to `reflowImageHandler` (it already receives `openaiApiKey`, `reflowImage.ts:40`); ensure the reflow render path uses the routing caller so `model:VISUAL_MODEL` re-renders route to gpt-image-2. Map reflow target ratio → size via `OPENAI_SIZE_BY_ASPECT` (FR-016/017). (depends on T004)
- [X] T016 [US3] Route the Polish/edit callable's visual render: this is **`serverEditRegion`** (`index.ts:4341`, `setGeminiCaller` ~4416, `model: VISUAL_MODEL` at 4422). Replace its `createGeminiCaller(...)` with `createVisualRoutingCaller(...)` and add `openaiApiKey` to its `secrets:[...]` array (currently `[geminiApiKey]` only at `4343`) (quickstart T8). (depends on T004)
- [X] T017 [US3] **Verified visual-callable inventory (closes analysis finding M3 / confirms H1)** — the ONLY `onCall` functions that reach a `VISUAL_MODEL` render are: `serverGenerateFinalAd` (`index.ts:4213`, routed in T010), `reflowImage` (`4330`, routed in T015), and `serverEditRegion` (`4341`, routed in T016). **Carousel and batch have NO separate image callable** — `serverGenerateCarouselAngles` (`4462`) and `serverGenerateCarouselSlideCopies` (`4504`) are text-only; each slide / batch-item image is rendered by `serverGenerateFinalAd`, so T010 already covers them. Verify the other `setGeminiCaller` callables do NOT reach `VISUAL_MODEL` and need no routing: `serverGenerateTOV` (4098), `serverGenerateConcepts` (4128), `serverGenerateBuildPlan` (4171), `serverGenerateCaption` (4578), `serverGenerateVisualPolishes` (4606, critique-only), `generateVariants` (4636) — all text/JSON. Confirm the existing 5-concurrent cap for multi-item runs is unchanged (FR-021b). **Out of scope**: `setTestimonialGeminiCaller` / `testimonialMockup.ts` stays on Gemini (brief: unchanged).
- [X] T018 [US3] Keep the Arabic Text QA image loop (`generators.ts:5927+`) active on the OpenAI path (its inspection uses Gemini `LOGIC_MODEL`, its re-render routes to gpt-image-2); set `arabicQaRan` in the trace when it runs (research D7).

**Checkpoint**: Run quickstart T6 (carousel), T7 (reflow), T8 (polish), T9 (batch).

---

## Phase 6: User Story 4 — Operator can revert (Priority: P2)

**Goal**: Two-step revert to Gemini with zero deletions and no broken build.

**Independent Test**: Set `MODEL_PROVIDER='gemini'`, rebuild → Gemini path renders correctly, no broken imports (spec SC-006/008; quickstart T10).

- [X] T019 [US4] Confirm revert mechanics: with `MODEL_PROVIDER='gemini'` the routing caller returns Gemini for **all** models; the commented Gemini prompt block (T008) is the restore target; verify no file deletions occurred this phase (FR-022/023/024, research D8). Document that the brief's "uncomment compositeArabicText" step is a no-op (already absent).
- [X] T020 [US4] Set `MODEL_PROVIDER='gemini'` in `modelConfig.ts`, run `cd functions && npm run build` then `npm test`; confirm clean compile, no broken imports, existing suite green (T10). Restore `MODEL_PROVIDER='openai'` after verifying.

**Checkpoint**: Revert proven; flip back to `'openai'`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T021 Verify error/refund path: force an OpenAI failure (bad key / induced 429 / >120s) in `serverGenerateFinalAd` and `reflowImage` → user sees a generation failure, credit refunded, pipeline does not crash; in a batch, one failed item does not abort siblings; set `timedOut` in trace on timeout (FR-021/021a/021b, SC-007).
- [X] T022 [P] Run `cd functions && npm run build && npm test` for full regression — confirm existing suite (incl. `contractFixtures.test.ts`, which imports the untouched `textCompositing.ts`) passes.
- [X] T023 [P] Add a Phase 025 entry to `CLAUDE.md` Recent Changes summarizing the swap (model-routing, GPT prompt, gated copy-fidelity, `visualProvider` trace, reversibility).
- [ ] T024 Execute `quickstart.md` T1–T10 manually and run the Arabic ≥95% QA sampling (≥20 generations across hero/no-hero/modes/carousel) for SC-002 sign-off. *(Requires manual QA — not automatable)*

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)**: T001 → T002 (T002 needs no T001 but both gate Phase 2).
- **Foundational (P2)**: T003 needs T001+T002; T004 needs T003; T005/T006/T007 independent `[P]`. **Blocks all stories.**
- **US1 (P3)**: after Foundational. T008→T009 (same file, sequential); T010 needs T004; T011 needs T005.
- **US2 (P4)**: T012 coordinates with T009 (same file); T013 independent.
- **US3 (P5)**: T014 independent; T015/T016/T017 need T004; T018 independent. Can start after Foundational but T016/T017 touch the same `index.ts` injection pattern as T010 — sequence index.ts edits to avoid conflicts.
- **US4 (P6)**: after the paths it reverts exist (practically after US1; full proof after US3).
- **Polish (P7)**: after desired stories complete.

### Story independence
- US1 is the MVP and is independently testable (single-ad generation).
- US2 shares the prompt file with US1 (T009/T012 coordinate) but is verified independently via creative-mode + cultural checks.
- US3 and US4 depend only on the Foundational caller/router, not on US1/US2 logic.

### Parallel opportunities
- `[P]`: T002 (vs nothing blocking), T005 + T006 + T007 together, T022 + T023 together.
- index.ts injection edits (T010, T015, T016, T017) are **not** `[P]` with each other — same file.

---

## Parallel Example: Foundational

```bash
# After T003+T004, these are independent files:
Task: "T005 Extend ResolutionTrace with visualProvider (generators.ts:4312 + types.ts:231)"
Task: "T006 Verify OPENAI_API_KEY lazy secret access (index.ts)"
Task: "T007 OPTIONAL unit tests for openAIImageCaller (functions/src/__tests__/)"
```

---

## Implementation Strategy

### MVP first (User Story 1)
1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE** quickstart T1–T4 → demo.

### Incremental delivery
US1 (distinct layouts, MVP) → US2 (guarantees preserved) → US3 (reflow/polish/carousel/batch) → US4 (revert proof) → Polish. Each story is independently demoable; the `MODEL_PROVIDER` flag lets you fall back to Gemini at any point.

### Notes
- `[P]` = different files, no incomplete dependency.
- Commit after each task or logical group; keep the Gemini prompt block commented (never deleted).
- The single biggest risk is Arabic letterform quality (SC-002) — T024 is the gate; do not relax the ≥95% bar.
