# Contract: Resolution Trace

**Feature**: 001-resolver-completeness-trace
**Location**: Types + builder in `functions/src/resolutionTrace.ts`, persistence in `functions/src/index.ts`

## Type Definition

See `data-model.md` for the full `ResolutionTrace` interface (matches LAUNCH_MATRIX Section 8 exactly).

## Builder API

```typescript
// Create a new trace builder
function createTraceBuilder(): TraceBuilder;

interface TraceBuilder {
  // Set resolved values
  setResolved(fields: {
    campaignType: 'cold' | 'retargeting';
    adMode: 'single' | 'carousel' | 'batch';
    creativeModes: string[];
    styleFamily: 'realistic' | 'fantasy' | 'minimal';
    subStyle: string | null;
  }): TraceBuilder;

  // Set hook & objection
  setHookAngle(angle: string | null, nullReason?: string): TraceBuilder;
  setObjection(id: string | null, text: string | null): TraceBuilder;

  // Set mode compatibility
  setModeCompatibility(result: 'ok' | 'adapt' | 'block', reason?: string): TraceBuilder;

  // Record reference ad override
  setReferenceAdOverride(universe?: string, subStyle?: string): TraceBuilder;

  // Record art direction cleared
  setArtDirectionCleared(reason: string): TraceBuilder;

  // Record slide count override
  setSlideCountOverride(original: number, resolved: number, reason: string): TraceBuilder;

  // Record empty fields skipped
  setEmptyFieldsSkipped(fields: string[]): TraceBuilder;

  // Record auto-switch event
  addAutoSwitchEvent(field: string, from: string, to: string, reason: string): TraceBuilder;

  // Set per-slide plan
  setPerSlide(slides: Array<{
    slide: number;
    hasCTA: boolean;
    narrativeAngle: string;
    photoInjection: boolean;
    testimonialPlatform?: string;
  }>): TraceBuilder;

  // Set launch validation result
  setLaunchCheck(passed: boolean, blockReason?: string): TraceBuilder;

  // Build final trace object
  build(): ResolutionTrace;
}
```

## Persistence

```typescript
// Fire-and-forget persistence — never fails the generation
async function persistTrace(genId: string, trace: ResolutionTrace): Promise<void>;
```

**Behavior**:
- Writes to `generations/{genId}` document using `updateDoc` with `{ resolutionTrace: trace }`
- On failure: `console.warn('Trace persistence failed for ${genId}:', error)` — does NOT throw
- No retry logic — single attempt only
- Called after generation pipeline has started (not blocking)

## Invariants

- `build()` throws if mandatory fields are not set (fail-fast during development)
- Builder is mutable; `build()` returns a frozen object
- `autoSwitchEvents` defaults to `[]` (never undefined)
- `perSlide` is required when `adMode === 'carousel'`
