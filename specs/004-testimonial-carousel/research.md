# Research: Testimonial Carousel (Phase 4)

**Feature**: 004-testimonial-carousel
**Date**: 2026-04-02

## Decision 1: Platform Detection Method

**Decision**: Gemini VISUAL_MODEL (flash-image-preview) with a structured JSON prompt.
**Rationale**: Project already uses Gemini for vision. Single call per batch, structured response.
**Alternatives rejected**: Client-side heuristics (too fragile), separate ML model (over-engineered).

## Decision 2: Mockup Frame Generation

**Decision**: Gemini VISUAL_MODEL renders the screenshot inside a platform UI frame via prompt.
**Rationale**: Consistent with existing image pipeline. No new dependencies.
**Alternatives rejected**: Sharp/Canvas compositing (7 static templates to maintain, breaks on platform UI updates).

## Decision 3: Detection Timing

**Decision**: Server-side batch during generation. Upload shows generic badge.
**Rationale**: Keeps upload instant. No extra server calls during input phase. Confirmed by product owner.

## Decision 4: Parallel Mockup Rendering

**Decision**: Middle slide mockup renders run in parallel (Promise.all).
**Rationale**: 7 sequential renders at ~10s each = 70s. Parallel = ~15s. Well within 300s timeout.

## Decision 5: Testimonial Slide Count Formula

**Decision**: Reuse the same pattern as `resolveValueStackSlideCount`: `Math.min(testimonialCount + 2, maxPlanSlides)`.
**Rationale**: Consistent with value_stack. The +2 accounts for hook + close slides.
