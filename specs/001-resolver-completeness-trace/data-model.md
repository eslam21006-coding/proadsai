# Data Model: Resolver Completeness, Resolution Trace & Slide Plans

**Feature**: 001-resolver-completeness-trace

## Entity: ResolverInput (Extended)

```
ResolverInput
├── selectedModes: string[]              # 1-2 creative mode IDs
├── hookAngle?: string                   # Cold hook angle (10 approved, before_after removed)
├── offerCategory?: string               # Offer type → tab mapping
├── campaignType?: 'cold' | 'retargeting'  # NEW — defaults to 'cold'
├── adFormat?: 'single' | 'carousel' | 'batch'  # NEW — defaults to 'single'
├── visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal'  # NEW — defaults to 'realistic'
├── referenceAdUsed?: boolean            # NEW — triggers precedence chain level 1
├── selectedSubStyle?: string | null     # NEW — art direction card ID
└── selectedUniverse?: string | null     # NEW — universe/setting value
```

## Entity: CreativeModeMeta (Extended)

```
CreativeModeMeta
├── id: CreativeModeId
├── labelEn: string
├── labelAr: string
├── icon: string
├── description: string
├── tabs: CreativeTab[]          # Which offer type tabs this mode appears in
├── role: 'anchor' | 'support'
├── standaloneAllowed: boolean
├── soloOnly: boolean            # NEW — true for before_after and text_only
├── visualHierarchy: string[]
├── mustShow: string[]
├── mustAvoid: string[]
├── textPlacementRules: string[]
├── captionAnchors: string[]
├── validity: { requiredElements, invalidSubstitutes, minimumDescription }
├── boxCLabel?: string
├── boxCHint?: string
└── templateNeeds: string[]
```

## Entity: LaunchSurfaceResult

```
LaunchSurfaceResult
├── allowed: boolean
└── reason?: string         # Human-readable block reason (only when allowed=false)
```

## Entity: SlideRole

```
SlideRole
├── slide: number           # 1-based slide index
├── role: 'hook' | 'middle' | 'close'
├── angle: string           # Cold: A-G. Retargeting: P,M,R,I,C,Q,E. Hook/close: 'hook'/'close'
├── hasCTA: boolean         # true only for slide 1 and last slide
└── photoInjection: boolean # true only for slide 1
```

## Entity: ValueStackAdjustment

```
ValueStackAdjustment
├── giftCount: number           # Non-empty gifts provided
├── originalSlideCount: number  # User's selected slide count
├── resolvedSlideCount: number  # Math.min(giftCount + 2, 9)
└── capped: boolean             # true if giftCount + 2 > 9
```

## Entity: AutoSwitchEvent

```
AutoSwitchEvent
├── field: string     # Which field was changed
├── from: string      # Previous value
├── to: string        # New value
└── reason: string    # Why the switch happened
```

## Entity: ResolutionTrace

```
ResolutionTrace
├── resolvedCampaignType: 'cold' | 'retargeting'
├── resolvedAdMode: 'single' | 'carousel' | 'batch'
├── resolvedCreativeModes: string[]
├── resolvedStyleFamily: 'realistic' | 'fantasy' | 'minimal'
├── resolvedSubStyle: string | null
├── referenceAdOverrideActive: boolean
├── overriddenUniverse?: string
├── overriddenSubStyle?: string
├── artDirectionCleared?: boolean
├── artDirectionClearedReason?: string
├── hookAngle: string | null
├── hookAngleNullReason?: string
├── objectionId: string | null
├── effectiveObjectionText: string | null
├── modeCompatibilityResult: 'ok' | 'adapt' | 'block'
├── modeCompatibilityReason?: string
├── slideCountOverride?: boolean
├── originalSlideCount?: number
├── resolvedSlideCount?: number
├── slideCountOverrideReason?: string
├── valueStackEmptyFieldsSkipped?: string[]
├── autoSwitchEvents: AutoSwitchEvent[]
├── perSlide?: SlideRole[]       # Per-slide structure for carousels
├── launchMatrixCheckPassed: boolean
└── launchMatrixBlockReason?: string
```

**Storage:** Field `resolutionTrace` on `generations/{genId}` Firestore document.

## Entity: Launch Surface Registry (Static Data)

### Approved Offer Types

```
"Live Event"   → tab: live_events
"Free Guide"   → tab: free_guide
"Mini-Course"  → tab: mini_course
```

### Approved Modes Per Tab

```
mini_course:  standard_hero, value_stack, before_after, text_only
live_events:  standard_hero, event_ticket, webinar_screen, speaker_card, before_after, text_only
free_guide:   standard_hero, book_mockup, device_mockup, before_after, text_only
```

### Solo-Only Modes

```
before_after:  soloOnly=true (BLOCKED from pairing in all tabs)
text_only:     soloOnly=true (BLOCKED from pairing in all tabs)
```

### Approved Campaign × Format × Plan

```
cold + single:     Starter+
cold + carousel:   Pro+
cold + batch:      Scaling
retargeting + single:   Creator+
retargeting + carousel: Pro+
retargeting + batch:    Scaling
```

### Deleted Modes (removed from codebase)

```
limited_access, module_preview, day_strip
```

### Approved Hook Angles (10 total, cold only)

```
emotional, logic, urgency, scarcity, pain, curiosity,
statistics, social_proof, logical_authority, future_based
```

## Relationships

```
Generation 1:1 ResolutionTrace
  (trace stored as field on generation document)

ResolverInput → validateLaunchSurface() → LaunchSurfaceResult
  (pure function, no state)

ResolverInput → resolveCreativeSpec() → ResolvedCreativeSpec + ResolutionTrace
  (trace built during resolution)

(campaignType, slideCount) → carouselSlideCountPlan() → SlideRole[]
  (static lookup, deterministic)

(gifts[]) → resolveValueStackSlideCount() → ValueStackAdjustment
  (pure function)

(inputs) → filterEmptyValueStackFields() → { filtered, skippedFields }
  (pure function)

(inputs, resolved) → resolveVisualPrecedence() → AutoSwitchEvent[]
  (pure function, applies 5-level chain)
```
