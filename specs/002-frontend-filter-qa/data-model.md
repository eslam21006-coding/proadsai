# Data Model: Frontend Launch Filter, Override Signals & Priority Lane QA

**Feature**: 002-frontend-filter-qa

## Entity: Override Signal

```text
OverrideSignal
├── event: string            # Event identifier from LAUNCH_MATRIX Section 7
├── delivery: 'toast' | 'inline' | 'banner' | 'section-swap'
├── messageEn: string        # English signal text
├── messageAr: string        # Arabic signal text
├── persistent: boolean      # true = stays until condition clears, false = transient
└── affectedArea: string     # Which UI section is affected
```

### Override Signal Registry (9 user-facing events)

```text
1. reference_ad_uploaded     → banner (persistent while active)
2. retargeting_selected      → section-swap (hook → objection)
3. text_only_selected        → section-swap (visual sections collapse)
4. testimonial_single        → toast "Testimonials require carousel"
5. before_after_carousel     → inline "Before/After is single-image only"
6. value_stack_slide_count   → inline "Carousel adjusted to N slides"
7. testimonial_slide_count   → inline "Carousel adjusted to N slides" (Spec G)
8. realistic_to_minimal      → section-swap (art direction hides)
9. realistic_to_fantasy      → section-swap (art direction cards reset)
```

## Entity: QA Fixture

```text
QAFixture
├── id: string                    # e.g., "lane_01_retargeting_carousel"
├── laneName: string              # Human-readable lane name
├── laneNumber: number            # 1-11
├── input: AdInputs               # Exact input data
├── expectedTrace: Partial<ResolutionTrace>  # Key fields to assert
├── checks: FixtureCheck[]        # Pass/fail assertions
└── languageVariant?: string      # If language-specific
```

```text
FixtureCheck
├── field: string        # What to check (e.g., "perSlide[1].hasCTA")
├── operator: 'eq' | 'ne' | 'contains' | 'not_contains'
├── expected: any        # Expected value
└── failMessage: string  # Human-readable failure description
```

## Entity: Evidence Pack

```text
EvidencePack
├── issueId: string                  # Reference to the issue
├── failingRuleId: string            # Exact rule from LAUNCH_MATRIX
├── controllingFile: string          # File path + function name
├── rootCause: string                # Why old behavior occurred
├── whatChanged: string              # The fix description
├── traceBeforeJson: string          # Resolution trace from failing run
├── traceAfterJson: string           # Resolution trace from passing run
├── screenshotBefore: string         # Path or URL to screenshot
├── screenshotAfter: string          # Path or URL to screenshot
└── testInputJson: string            # Exact reproducible input
```

## Relationships

```text
QAFixture 1:1 Priority Lane
  (one fixture per lane, 11 total)

QAFixture.input → validateLaunchSurface() → must pass
QAFixture.input → resolveCreativeSpec() → must match expectedTrace
QAFixture.checks → lane behavior contract assertions

EvidencePack 1:1 Issue
  (one pack per claimed fix)
```
