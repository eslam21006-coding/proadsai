# Contract: Testimonial Carousel Pipeline

**Feature**: 004-testimonial-carousel
**Location**: `functions/src/testimonialMockup.ts` (new) + `functions/src/generators.ts`

## detectTestimonialPlatform

```typescript
detectTestimonialPlatform(screenshotBase64: string, apiKey: string): Promise<PlatformType>
```

- Input: base64 image of a testimonial screenshot
- Uses Gemini VISUAL_MODEL with structured JSON prompt
- Returns one of: 'whatsapp', 'instagram_dm', 'facebook', 'email', 'google_review', 'telegram', 'unknown'
- On model error or ambiguous result: returns 'unknown'

## buildTestimonialMockup

```typescript
buildTestimonialMockup(screenshotBase64: string, platform: PlatformType, apiKey: string): Promise<string>
```

- Input: screenshot base64 + detected platform
- Uses Gemini VISUAL_MODEL to render the screenshot inside a platform-accurate UI frame
- Prompt includes platform-specific instructions (green header for WhatsApp, star rating for Google Review, etc.)
- Returns: base64 of the rendered mockup slide image
- On failure: returns the raw screenshot with a clean border (graceful degradation)

## resolveTestimonialSlideCount

```typescript
resolveTestimonialSlideCount(testimonialCount: number, maxPlanSlides: number): number
```

- Formula: `Math.min(testimonialCount + 2, maxPlanSlides)`
- +2 accounts for hook slide + close slide
- Capped at the user's plan max (Pro: 5, Scaling: 9)

## generateTestimonialHookSlide

```typescript
generateTestimonialHookSlide(inputs: AdInputs, testimonialCount: number, apiKey: string): Promise<{ hookText: string, subheadText: string }>
```

- Cold: curiosity hook that teases testimonials indirectly, no testimonial content visible
- Retargeting: names the objection AND teases testimonials as evidence
- Uses CREATIVE_MODEL_PRO for first generation

## generateTestimonialCarousel

```typescript
generateTestimonialCarousel(inputs: AdInputs, screenshots: string[], apiKey: string): Promise<TestimonialCarouselResult>
```

- Entry point for the full pipeline
- Steps: detect platforms (batch) → generate hook → render mockups (parallel) → generate close → assemble
- Respects plan max slides: if more testimonials than slides allow, use first N
- Returns TestimonialCarouselResult with all slides and metadata
