# Data Model: Resolver Completeness, Resolution Trace & Slide Plans

**Branch**: `001-resolver-completeness-trace` | **Date**: 2026-04-06

## Entities

### 1. LaunchSurface (compile-time constant)

The authoritative registry of approved launch combinations. Immutable at runtime.

```typescript
// Offer type → tab mapping
type OfferTypeId = 'live_event' | 'free_guide' | 'mini_course';
type TabId = 'live_events' | 'free_guide' | 'mini_course';

// Legacy offer type mapping (5 → 3)
type LegacyOfferTypeId = 'free_webinar' | 'paid_workshop' | 'challenge';

interface OfferTypeEntry {
  id: OfferTypeId;
  tab: TabId;
  labelEn: string;
  labelAr: string;
  legacyAliases?: LegacyOfferTypeId[];
}

// Approved modes per tab
interface TabModeRegistry {
  tab: TabId;
  approvedModes: CreativeModeId[];
  approvedPairings: Array<{
    modes: [CreativeModeId, CreativeModeId];
    layoutKey: string;
  }>;
}

// Campaign × Format × Plan matrix
interface CampaignFormatEntry {
  campaignType: 'cold' | 'retargeting';
  adFormat: 'single' | 'carousel' | 'batch';
  minPlan: 'starter' | 'creator' | 'pro' | 'scaling';
}

// Solo-only modes
const SOLO_ONLY_MODES: CreativeModeId[] = ['before_after', 'text_only'];

// Deleted modes (blocklist)
const DELETED_MODES: string[] = ['limited_access', 'module_preview', 'day_strip'];

// Approved hook angles (cold only, 10 total)
const APPROVED_HOOK_ANGLES: string[] = [
  'emotional', 'logic', 'urgency', 'scarcity', 'pain',
  'curiosity', 'statistics', 'social_proof', 'logical_authority', 'future_based'
];

// Visual style families
type VisualStyleFamily = 'realistic' | 'fantasy' | 'minimal';
```

**Validation rules**:
- Every generation request must match an entry in `CampaignFormatEntry`
- Selected modes must appear in the tab's `approvedModes`
- Mode pairings must appear in the tab's `approvedPairings` or be a solo mode
- Solo-only modes cannot be paired with any other mode
- Deleted modes are rejected with a reason string
- Hook angles must be from `APPROVED_HOOK_ANGLES` (cold only; null for retargeting)
- Default `visualStyleFamily` is `'realistic'` when not provided

### 2. ResolutionTrace (Firestore field on generation document)

Persisted at `generations/{genId}.resolutionTrace`. Lifecycle tied to generation document.

```typescript
interface ResolutionTrace {
  // What was resolved
  resolvedCampaignType: 'cold' | 'retargeting';
  resolvedAdMode: 'single' | 'carousel' | 'batch';
  resolvedCreativeModes: string[];
  resolvedStyleFamily: 'realistic' | 'fantasy' | 'minimal';
  resolvedSubStyle: string | null;

  // Override tracking
  referenceAdOverrideActive: boolean;
  overriddenUniverse?: string;
  overriddenSubStyle?: string;
  artDirectionCleared?: boolean;
  artDirectionClearedReason?: string;

  // Hook & objection
  hookAngle: string | null;
  hookAngleNullReason?: string;
  objectionId: string | null;
  effectiveObjectionText: string | null;

  // Mode compatibility
  modeCompatibilityResult: 'ok' | 'adapt' | 'block';
  modeCompatibilityReason?: string;

  // Slide count
  slideCountOverride?: boolean;
  originalSlideCount?: number;
  resolvedSlideCount?: number;
  slideCountOverrideReason?: string;

  // Data handling
  valueStackEmptyFieldsSkipped?: string[];

  // Event tracking
  autoSwitchEvents: Array<{
    field: string;
    from: string;
    to: string;
    reason: string;
  }>;

  // Per-slide detail (carousel only)
  perSlide?: Array<{
    slide: number;
    hasCTA: boolean;
    narrativeAngle: string;
    photoInjection: boolean;
    testimonialPlatform?: string;
  }>;

  // Launch validation
  launchMatrixCheckPassed: boolean;
  launchMatrixBlockReason?: string;
}
```

**Validation rules**:
- All non-optional fields are mandatory on every trace
- `resolvedCreativeModes` is never empty (at least one mode)
- `hookAngle` is null when `resolvedCampaignType` is `'retargeting'`; `hookAngleNullReason` must then be `'retargeting_selected'`
- `perSlide` is required when `resolvedAdMode` is `'carousel'`; length must equal `resolvedSlideCount`
- `perSlide[0].hasCTA` and `perSlide[last].hasCTA` must be `true`; all middle slides must be `false`
- `valueStackEmptyFieldsSkipped` contains only canonical field names from the 9-field list
- `autoSwitchEvents` is an empty array when no overrides fire (never undefined)

**State transitions**: None — trace is write-once. Built incrementally during resolution, persisted after generation starts.

### 3. SlidePlan (in-memory, not persisted separately)

Produced by `buildSlidePlan()`, consumed by generators and written into the trace's `perSlide` field.

```typescript
interface SlideEntry {
  slide: number;        // 1-based index
  role: 'hook' | 'middle' | 'close';
  hasCTA: boolean;
  narrativeAngle: string;  // e.g., 'A', 'P', 'hook', 'close'
  photoInjection: boolean; // true only for slide 1
  testimonialPlatform?: string;
}

type SlidePlan = SlideEntry[];
```

**Determinism rule**: `buildSlidePlan(campaignType, slideCount)` always returns the same `SlidePlan` for the same inputs.

**Cold angle assignment** (N-2 middle slides, in order): A, B, C, D, E, F, G
**Retargeting angle assignment** (N-2 middle slides, in order): P, M, R, I, C, Q, E

### 4. EmptyFieldFilter (in-memory transform)

```typescript
const VALUE_STACK_FIELDS = [
  'valueStackTitle',
  'valueStackItems',
  'valueStackBonuses',
  'valueStackPrice',
  'valueStackOriginalValue',
  'valueStackSavings',
  'valueStackGuarantee',
  'valueStackDeliveryFormat',
  'valueStackProofStatement',
] as const;

type ValueStackFieldId = typeof VALUE_STACK_FIELDS[number];
```

**Filter rules**:
- `undefined`, `null`, `''`, whitespace-only string → suppressed
- Empty array `[]` or array of all-empty strings → suppressed
- Suppressed field names recorded in `ResolutionTrace.valueStackEmptyFieldsSkipped`

### 5. CreativeModeId (updated union type)

```typescript
// Active modes (after deletion + reclassification)
type CreativeModeId =
  | 'standard_hero'
  | 'value_stack'
  | 'event_ticket'
  | 'webinar_screen'
  | 'speaker_card'
  | 'book_mockup'
  | 'device_mockup'
  | 'text_only'
  | 'before_after';   // reclassified from hook angle

// Removed — MUST NOT appear anywhere in resolver or catalogs
// 'limited_access', 'module_preview', 'day_strip'
```

## Relationships

```
GenerationRequest
  └─▶ LaunchSurface.validate()  → pass/block
  └─▶ CreativeResolver.resolve()
       ├─▶ EmptyFieldFilter.filter() → suppressed fields
       ├─▶ SlidePlanEngine.buildSlidePlan() → SlidePlan (carousel only)
       ├─▶ VisualPrecedenceChain.resolve() → overrides
       └─▶ ResolutionTrace (built incrementally)
            └─▶ Firestore: generations/{genId}.resolutionTrace (fire-and-forget)
```

## Data Volume Assumptions

- Resolution trace: ~2-5 KB per generation (JSON). No separate cleanup needed.
- Launch surface registry: ~50 entries (static constant). Zero runtime I/O.
- Slide plans: 2-9 entries per carousel. Computed in memory, not persisted separately.
