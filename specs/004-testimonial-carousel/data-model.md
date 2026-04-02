# Data Model: Testimonial Carousel (Phase 4)

**Feature**: 004-testimonial-carousel

## Entity: TestimonialScreenshot

```text
TestimonialScreenshot
├── base64: string              # Image data (uploaded by user)
├── uploadOrder: number         # Position in upload sequence (1-based)
├── detectedPlatform: PlatformType  # Assigned during generation (server-side)
└── slideIndex: number | null   # Which carousel slide this maps to (null if overflow)
```

## Entity: PlatformType

```text
PlatformType = 'whatsapp' | 'instagram_dm' | 'facebook' | 'email' | 'google_review' | 'telegram' | 'unknown'
```

## Entity: TestimonialSlideResult

```text
TestimonialSlideResult
├── slideNumber: number         # 1-based position in carousel
├── role: 'hook' | 'testimonial' | 'close'
├── platform: PlatformType | null  # null for hook/close slides
├── imageBase64: string         # Rendered slide image
├── hookText: string | null     # Only for hook slide
├── ctaText: string | null      # Only for hook + close slides
└── hasCTA: boolean
```

## Entity: TestimonialCarouselResult

```text
TestimonialCarouselResult
├── slides: TestimonialSlideResult[]
├── totalTestimonials: number
├── usedTestimonials: number    # May be less than total if plan-capped
├── detectionResults: { screenshot: number, platform: PlatformType }[]
└── slideCount: number          # Always = usedTestimonials + 2
```

## Platform Mockup Rules (from LAUNCH_MATRIX Lane 10)

```text
WhatsApp      → Chat bubble UI, green header, timestamp visible
Instagram DM  → IG interface (dark/light), username visible
Facebook      → Blue header, comment card or Messenger bubble
Email         → Inbox card or open email view
Google Review → Star rating card, reviewer name visible
Telegram      → Telegram bubble style, chat context
Unknown       → Clean quote card with avatar placeholder and name
```

## Relationships

```text
User uploads N screenshots → N TestimonialScreenshot objects
Generation → detectTestimonialPlatform() per screenshot → PlatformType assigned
Generation → buildTestimonialMockup() per screenshot → TestimonialSlideResult
Generation → generateTestimonialHookSlide() → hook TestimonialSlideResult
Generation → generateTestimonialCloseSlide() → close TestimonialSlideResult
All assembled → TestimonialCarouselResult
```
