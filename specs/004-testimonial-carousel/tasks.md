# Tasks: Testimonial Carousel (Phase 4 from LAUNCH_MATRIX Section 14)

**Input**: `docs/LAUNCH_MATRIX.md` Section 14, Phase 4 (tasks 4.1–4.9)
**Prerequisites**: Phase 1 (Resolver Foundation) complete
**Status**: Complete — all 22 tasks done

---

## Phase 1: Foundational (Resolver + Types)

**Purpose**: Add testimonial_carousel mode to resolver and define types. Must complete before any pipeline or UI work.

- [x] T001 Add `testimonial_carousel` to `CREATIVE_MODE_CATALOG` in `functions/src/creativeResolver.ts` — role: 'anchor', standaloneAllowed: true, soloOnly: false, tabs: ['mini_course', 'live_events', 'free_guide'], labelEn: 'Testimonial Carousel', labelAr: 'كاروسيل الشهادات', icon: '💬'. Add mustShow: ['testimonial_mockup', 'platform_frame', 'cta_button'], mustAvoid: ['raw_screenshot', 'testimonial_text_on_hook']. templateNeeds: ['testimonial_carousel'].
- [x] T002 [P] Mirror `testimonial_carousel` entry in `src/creativeResolver.ts` (frontend) — same fields as T001.
- [x] T003 [P] Add `PlatformType` type to `functions/src/types.ts` — `export type PlatformType = 'whatsapp' | 'instagram_dm' | 'facebook' | 'email' | 'google_review' | 'telegram' | 'unknown'`
- [x] T004 [P] Add `TestimonialSlideResult` AND `TestimonialCarouselResult` interfaces to `functions/src/types.ts`. `TestimonialSlideResult` fields: slideNumber, role ('hook'|'testimonial'|'close'), platform (PlatformType|null), imageBase64, hookText (string|null), ctaText (string|null), hasCTA (boolean). `TestimonialCarouselResult` fields: slides (TestimonialSlideResult[]), detectedPlatforms (PlatformType[]), totalSlides (number), visualStyleFamily ('realistic'|'fantasy'|'minimal').
- [x] T005 Write and export `resolveTestimonialSlideCount(testimonialCount: number, maxPlanSlides: number): number` in `functions/src/creativeResolver.ts` — formula: `Math.min(testimonialCount + 2, maxPlanSlides)`. Export it.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 2: US2 — Platform Detection (P2)

**Goal**: Detect messaging platform from each testimonial screenshot.

**Independent Test**: Call `detectTestimonialPlatform()` with screenshots from different platforms. Verify correct platform assignment.

- [x] T006 [US2] Create `functions/src/testimonialMockup.ts` — new file. Write and export `detectTestimonialPlatform(screenshotBase64: string, apiKey: string): Promise<PlatformType>`. Use Gemini VISUAL_MODEL (`gemini-3.1-flash-image-preview`) with a structured prompt asking it to identify the platform from the screenshot. Return a `PlatformType` value. On model error or ambiguous result, return `'unknown'`. Import `PlatformType` from `"./types.js"`.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 3: US3 — Platform Mockup Rendering (P3)

**Goal**: Render each testimonial screenshot inside a platform-accurate UI frame.

**Independent Test**: Call `buildTestimonialMockup()` with a screenshot + each platform type. Verify non-empty base64 output.

- [x] T007 [US3] Write and export `buildTestimonialMockup(screenshotBase64: string, platform: PlatformType, apiKey: string): Promise<string>` in `functions/src/testimonialMockup.ts` — use Gemini VISUAL_MODEL to render the screenshot inside a platform UI frame. Prompt includes platform-specific instructions per LAUNCH_MATRIX Lane 10 mockup rules: WhatsApp (green header + chat bubble + timestamp), Instagram DM (IG interface + username), Facebook (blue header + comment card), Email (inbox card), Google Review (star rating card + reviewer name), Telegram (Telegram blue chrome), Unknown (clean quote card + avatar placeholder). Returns base64 of rendered mockup. On failure, return the raw screenshot with a clean border.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 4: US4+US5 — Hook Slide Generation (P4, P5)

**Goal**: Generate AI hook slides for both cold and retargeting campaigns.

**Independent Test**: Call the hook generator with cold inputs → verify curiosity hook with no testimonial content. Call with retargeting inputs → verify objection + testimonial tease.

- [x] T008 [US4] Write and export `generateTestimonialHookSlide(inputs: AdInputs, testimonialCount: number, apiKey: string): Promise<{ hookText: string, subheadText: string }>` in `functions/src/generators.ts` — for cold campaigns: prompt Gemini CREATIVE_MODEL_PRO to generate a curiosity hook that teases testimonials indirectly without quoting them. Include `inputs.cta` as the CTA text. The hook must NOT contain any testimonial content.
- [x] T009 [US5] Add retargeting branch to `generateTestimonialHookSlide()` in `functions/src/generators.ts` — when `inputs.campaignType === 'retargeting'`, the prompt must name the `inputs.retargetingObjection` AND tease testimonials as evidence. The hook text must reference the objection topic.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 5: US7 — Close Slide + Full Pipeline (P7)

**Goal**: Generate close slide and assemble the full testimonial carousel pipeline.

**Independent Test**: Call `generateTestimonialCarousel()` with 3 screenshots. Verify: 5 slides returned, slide 1 = hook with CTA, slides 2-4 = testimonial mockups without CTA, slide 5 = close with CTA.

- [x] T010 [US7] Write `generateTestimonialCloseSlide(inputs: AdInputs, apiKey: string): Promise<{ closeText: string, subheadText: string }>` in `functions/src/generators.ts` — for cold: may reference a key result/stat from testimonials. For retargeting: objection-resolution close connected to the selected objection. Not generic.
- [x] T011 [US7] Write and export `generateTestimonialCarousel(inputs: AdInputs, screenshots: string[], apiKey: string): Promise<TestimonialCarouselResult>` in `functions/src/generators.ts` — full pipeline: (1) batch `detectTestimonialPlatform()` for all screenshots, (2) `generateTestimonialHookSlide()` for slide 1, (3) parallel `buildTestimonialMockup()` for middle slides (Promise.all), (4) `generateTestimonialCloseSlide()` for last slide, (5) assemble into TestimonialCarouselResult. Cap at `resolveTestimonialSlideCount(screenshots.length, maxPlanSlides)`. CTA only on slide 1 and last.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 6: US1 — Frontend Upload UI (P1)

**Goal**: Add testimonial screenshot upload area to InputForm.

**Independent Test**: Select testimonial_carousel mode → upload area appears. Upload screenshots → previewed. Switch to single → auto-switches to carousel with toast.

- [x] T012 [US1] Add testimonial screenshot upload area to `src/components/InputForm.tsx` — multi-file upload field labeled "Testimonial Screenshots" (Arabic: "لقطات الشهادات"). Visible only when `testimonial_carousel` is in `offerCreativeMode`. Accepts image files. Stores as base64 array in component state (`testimonialScreenshots`). Shows generic "Testimonial" badge per screenshot (no platform detection during upload). (Pre-existing from testimonial_wall rename)
- [x] T013 [US1] Add auto-switch logic in `src/components/InputForm.tsx` — when testimonial_carousel mode is active AND `adMode === 'single'`, auto-switch to carousel and show toast: `t('override.testimonial_requires_carousel')`. Wire the existing Spec G stub (commented-out block from Phase 2 T014) into a live conditional. (Reactive useEffect added)
- [x] T014 [US1] Add slide count auto-adjustment for testimonial mode in `src/components/InputForm.tsx` — when testimonial_carousel is active and carousel format, call `resolveTestimonialSlideCount(testimonialScreenshots.length, getMaxSlides(userPlan))` and update `slideCount` in state. Show inline: "Carousel adjusted to N slides — one testimonial per slide." Use `t('override.carousel_adjusted_testimonials')`. (Reactive useEffect + resolveTestimonialSlideCount added to frontend creativeResolver)
- [x] T015 [US1] Block generation if testimonial mode is active but zero screenshots uploaded in `src/components/InputForm.tsx` — show validation error: "Upload at least one testimonial screenshot." (Pre-existing from testimonial_wall)

**Checkpoint**: `npm run build` — clean compile. ✅

---

## Phase 7: US6 — Wiring into Generation Handler (P6)

**Goal**: Wire the testimonial carousel pipeline into the main generation Cloud Function.

- [x] T016 [US6] Wire `generateTestimonialCarousel()` into `functions/src/index.ts` — in the `generateCreative` handler, when `offerCreativeMode` includes `testimonial_carousel` and `adMode === 'carousel'`, call `generateTestimonialCarousel(inputs, screenshots, apiKey)` instead of the standard carousel flow. Pass testimonial screenshots from request data. (setTestimonialGeminiCaller wired in 2 handlers)

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build` — clean compile. ✅

---

## Phase 8: US8 — QA Fixture Replacement (P8)

**Goal**: Replace Lane 10/11 stubs with real fixtures.

- [x] T017 [US8] Replace `testLane10TestimonialCarouselCold()` stub in `functions/src/contractFixtures.test.ts` — test: `resolveTestimonialSlideCount(3, 9)` returns 5. Assert `testimonial_carousel` exists in `CREATIVE_MODE_CATALOG`. Assert `validateLaunchSurface({ selectedModes: ['testimonial_carousel'], adFormat: 'carousel' })` returns `allowed: true`.
- [x] T018 [US8] Replace `testLane11TestimonialCarouselRetargeting()` stub in `functions/src/contractFixtures.test.ts` — test: `resolveTestimonialSlideCount(2, 9)` returns 4. Assert `validateLaunchSurface({ selectedModes: ['testimonial_carousel'], campaignType: 'retargeting', adFormat: 'carousel' })` returns `allowed: true`.

**Checkpoint**: `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all tests pass including Lane 10/11. ✅

---

## Phase 9: Polish & Verification

- [x] T019 Run `npm run build` (frontend) — clean compile ✅
- [x] T020 Run `rm -rf functions/lib && cd functions && npm run build && npm run test:contracts` — all pass ✅
- [x] T021 Grep `functions/src/` for `testimonial_carousel` — verify it appears in creativeResolver.ts (catalog), generators.ts (pipeline), testimonialMockup.ts (detection + mockup), index.ts (wiring), contractFixtures.test.ts (fixtures) ✅
- [x] T022 Grep `src/` for `testimonial_carousel` — verify it appears in creativeResolver.ts (frontend catalog) and InputForm.tsx (upload UI + auto-switch) ✅
- [x] T023 [FR-011] Thread `visualStyleFamily` (resolved via `resolveStyleFamily(inputs)`) through `generateTestimonialCarousel` → `buildTestimonialMockup`, `generateTestimonialHookSlide`, and `generateTestimonialCloseSlide` so all slides share consistent art direction. Append `ART DIRECTION` clause to hook + close prompts; append `VISUAL STYLE` clause to mockup prompts. Add `visualStyleFamily` to `TestimonialCarouselResult` and return it from the orchestrator. Verifies FR-011 (art direction consistency) and Principle VI (auditable — style choice persisted on result). ✅

---

## Dependencies

```text
Phase 1 (Foundational)
  ├── Phase 2: US2 (Platform Detection) — depends on T003 (PlatformType)
  ├── Phase 3: US3 (Mockup Rendering) — depends on T006 (detectTestimonialPlatform)
  ├── Phase 4: US4+US5 (Hook Slides) — independent after Phase 1
  ├── Phase 5: US7 (Close + Pipeline) — depends on Phases 2, 3, 4
  ├── Phase 6: US1 (Frontend Upload) — depends on T001, T002
  ├── Phase 7: US6 (Wiring) — depends on Phase 5
  └── Phase 8: US8 (QA Fixtures) — depends on T001, T005
Phase 9 (Polish) — depends on all
```

---

## Parallel Opportunities

```text
# After Phase 1:
Phase 2 (detection) + Phase 4 (hooks) + Phase 6 (frontend) — all independent
# After Phase 2:
Phase 3 (mockup) starts
# After Phases 2+3+4:
Phase 5 (full pipeline) starts
# Phase 8 (fixtures) can start after Phase 1 (tests resolver functions only)
```

---

## Notes

- 22 total tasks across 9 phases — **ALL COMPLETE**
- Backend imports use `.js` extension (NodeNext): `import { PlatformType } from "./types.js"`
- Mockup renders run in parallel via `Promise.all` (7 renders ~15s instead of ~70s)
- Platform detection is server-side batch during generation — upload shows generic badge
- Gemini VISUAL_MODEL for detection + mockups, CREATIVE_MODEL_PRO for hook/close text
- Lane 10/11 QA fixture stubs replaced with real fixtures in Phase 8
- `testimonial_wall` fully renamed to `testimonial_carousel` across 14+ files
- `contractFixtures.test.ts` restored from git after accidental deletion, updated with Lane 10/11 real fixtures and consolidated imports
- `resolveTestimonialSlideCount` added to both backend and frontend creativeResolver
- Reactive useEffect auto-switch to carousel + slide count adjustment added to InputForm.tsx
