# Contract: Testimonial Carousel Dispatch & Signals (FR-111..115)

**Location**: `src/services/geminiService.ts` (registry), `src/App.tsx` (dispatch + signals), `src/components/InputForm.tsx` (slide count)

## Dispatch (FR-111/112)

- **FR-111**: register `serverGenerateTestimonialCarousel` in the `geminiService.ts` callable registry (the dedicated, already-deployed-and-correct backend callable).
- **FR-112**: in `App.tsx` generation dispatch, when `offerCreativeMode` includes `testimonial_carousel` AND format is carousel → call `serverGenerateTestimonialCarousel(inputs, screenshots)` **instead of** the generic carousel path (`serverGenerateCarouselAngles → CarouselSlideCopies → FinalAd`).

```pseudo
if modes.includes('testimonial_carousel') && adMode === 'carousel':
    result = serverGenerateTestimonialCarousel({ inputs, screenshots })   // platform detection + mockup frames + hook/close
else:
    <generic carousel path>
```

## Signals (FR-113/114)

- **FR-113**: on the single→carousel auto-switch, call `showToast(t('override.testimonial_requires_carousel'))` (key exists, currently only in a JSX comment at `InputForm.tsx:1134`).
- **FR-114**: render the `override.carousel_adjusted_testimonials` inline notification on testimonial slide-count adjust (i18n key exists at `i18n.tsx:192/909`, no JSX renders it).

## Slide count (FR-115)

Unify to `testimonialCount + 2` in both the reactive useEffect (`InputForm.tsx:536`, already `+2`) and the submit path (`InputForm.tsx:1131`, currently `+1`).

## Done proof
- Grep: `serverGenerateTestimonialCarousel` referenced in `src/` (currently zero); emulator/smoke: a testimonial-carousel generation invokes the dedicated pipeline (platform detection runs), the toast fires on auto-switch, the inline notice renders, both slide-count sites compute `+2`.
