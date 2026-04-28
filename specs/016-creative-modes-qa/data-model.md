# Phase 1 Data Model: Creative Modes & Art Direction QA

**Date**: 2026-04-27
**Branch**: `016-creative-modes-qa`

This document enumerates the entities Phase 16 reads, writes, or asserts on. Most entities **already exist** in the codebase; this phase adds two optional fields to `ResolutionTrace` and one new validator return shape. No new Firestore collections, no migrations.

---

## 1. CreativeMode (existing — read-only in Phase 16)

**Source**: `functions/src/creativeResolver.ts::CREATIVE_MODE_CATALOG` lines 67–201.

```ts
interface CreativeMode {
  id: 'standard_hero' | 'value_stack' | 'before_after' | 'text_only'
    | 'event_ticket' | 'webinar_screen' | 'speaker_card'
    | 'book_mockup' | 'device_mockup' | 'testimonial_carousel';
  validity: {
    requiredElements: string[];     // symbolic IDs (see R1 in research.md)
    soloOnly?: boolean;             // true for before_after, text_only
    formats?: ('single' | 'carousel' | 'batch')[];
  };
  // ... other fields owned by the catalog
}
```

**Phase 16 use**: fixtures look up `requiredElements` indirectly via `buildPlanSlotMap()` to detect missing composition slots. The catalog itself is not edited.

---

## 2. ModePair (existing — read-only in Phase 16)

**Source**: `functions/src/creativeResolver.ts::ALLOWED_PAIRS` lines 212–225.

```ts
interface ModePair {
  modeA: string;
  modeB: string;
  layoutKey: string;            // e.g. 'hero_value_stack', 'hero_ticket'
  tab: 'mini_course' | 'live_events' | 'free_guide';
}
```

**Phase 16 use**: fixtures iterate over the 10 approved pairs, build inputs, and assert both modes' composition language appears in the post-compliance prompt and that `getPairRenderExecution(pair)` returns non-empty guidance.

---

## 3. BlockedCombination (encoded — read-only in Phase 16)

**Source**: implicit in `creativeResolver.ts` (the soloOnly + DISALLOWED_PAIRS rules at lines 168, 180, 227–229) and in the matrix § 2.3 universal blocking rows.

Conceptual entity (not a concrete struct in code; encoded as resolver behavior):

```ts
interface BlockedCombination {
  trigger: { modes: string[]; format?: 'single' | 'carousel' | 'batch'; campaign?: 'cold' | 'retargeting' };
  reason: string;
}
```

**Minimum coverage** (4 categories from FR-003):
- `before_after + any other mode` → "Before/After is single-image only — defines the entire canvas."
- `before_after + carousel` → "Before/After cannot be used in carousel format."
- `before_after + batch` → "Before/After cannot be used in batch format."
- `text_only + any other mode` → "Text-only mode is mutually exclusive."

**Phase 16 use**: each blocked combo gets a fixture that asserts the resolver returns `{ allowed: false, reason: <string> }` and that no image generation is initiated.

---

## 4. AdaptState (existing — read-only in Phase 16)

**Source**: `functions/src/creativeResolver.ts::getSubStyleModeFusion()` lines 1067–1167.

```ts
interface AdaptState {
  subStyleId: string;     // e.g. 'luxury_magazine', 'cinematic', 'editorial'
  modeId: string;         // e.g. 'value_stack', 'event_ticket'
  fusionPrompt: string;   // composition-override string injected into the build plan
}
```

The 8 explicit adapt states are keyed `${subStyleId}__${modeId}` in the function's lookup table. The launch matrix § 11 enumerates exactly which 8 are in scope.

**Phase 16 use**: fixtures construct inputs, run the build plan through `generateBuildPlan()`, then assert the adapt state's `fusionPrompt` substring appears in the **post-compliance** technical prompt.

---

## 5. ModeFormatValidationResult (NEW — Phase 16 return shape)

**Defined in**: `functions/src/creativeResolver.ts` (new export added by Phase 16).

```ts
type ModeFormatValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

export function validateModeFormatCombination(input: {
  modes: string[];
  adFormat: 'single' | 'carousel' | 'batch';
  campaignType: 'cold' | 'retargeting';
}): ModeFormatValidationResult;
```

**Validation rules** (encoded as deterministic checks):

| Rule | Result |
|---|---|
| `modes.includes('before_after')` AND `modes.length > 1` | `{ valid: false, reason: 'Before/After is single-image only — defines the entire canvas.' }` |
| `modes.includes('before_after')` AND `adFormat !== 'single'` | `{ valid: false, reason: 'Before/After is single-image only.' }` |
| `modes.includes('text_only')` AND `modes.length > 1` | `{ valid: false, reason: 'Text-only mode is mutually exclusive.' }` |
| `modes.includes('testimonial_carousel')` AND `adFormat !== 'carousel'` | `{ valid: false, reason: 'Testimonial Carousel requires carousel format.' }` |
| All other combinations explicitly enumerated in `ALLOWED_PAIRS`, plus solo-mode + format combinations from § 2.4 of the matrix | `{ valid: true }` |
| Anything else | `{ valid: false, reason: 'Combination is not in the launch surface.' }` |

**Used by**:
- Frontend: `src/components/InputForm.tsx` calls it on every selection change; if `valid: false`, renders `reason` inline below the offending control and disables *Generate*.
- Backend: every callable in `functions/src/index.ts` that produces a generation (`generateAd`, `generateBatch`, `generateCarousel`, etc.) calls it on the inputs and rejects the request with the same `reason` if invalid.

---

## 6. ModeCompositionWarning (NEW — Phase 16 trace extension)

**Defined in**: `functions/src/types.ts` (extension of `ResolutionTrace`).

```ts
interface ModeCompositionTrace {
  missing: ModeCompositionWarning[];   // empty array if no detection events
  reinforced: boolean;                  // true if any reinforcement directive was injected
}

interface ModeCompositionWarning {
  mode: string;                         // the active mode whose required slot was unfilled
  missingElements: string[];            // human-readable slot LABELS (e.g. "stack zone",
                                        // "hero zone") — NOT the symbolic requiredElements[i]
                                        // IDs (e.g. "visible_item_rows_or_cards"). Sourced
                                        // from buildPlanSlotMap()'s missingZones /
                                        // missingOverlaySlots output. See research.md § R1.
  reinforcementInjected: boolean;       // true if directive appended to image prompt
  detectedAt: 'post_build_plan';        // anchor — where in the pipeline detection ran
}
```

**Persisted at**: `generations/{genId}.resolutionTrace.modeComposition`.

**Optional**: yes — legacy generations have no `modeComposition` field. Readers must default to `{ missing: [], reinforced: false }` if absent.

**Writer**: `functions/src/resolutionTrace.ts::recordModeCompositionMissing(mode, missingElements)` (new method on the trace builder).

---

## 7. AdaptStateAuditEntry (NEW — Phase 16 audit utility)

**Defined in**: `functions/src/adaptStateAudit.ts` (new file).

```ts
interface AdaptStateAuditEntry {
  subStyleId: string;
  modeId: string;
  fusionPromptHash: string;             // sha256 of the fusion string at audit time
  triggerWordsFound: string[];          // empty array = pass
  passed: boolean;                      // true iff triggerWordsFound is empty
}

interface AdaptStateAuditResult {
  ranAt: string;                        // ISO 8601
  totalChecked: number;                 // expected: 8
  passed: number;
  failed: number;
  entries: AdaptStateAuditEntry[];
}
```

**Persisted at**: `generations/{genId}.resolutionTrace.adaptStateAudit` (optional — only present when an adapt state was active for the generation; an alternative is to log it once at startup or on a build-time gate, in which case it does not need to live on every generation trace).

**Writer**: `functions/src/adaptStateAudit.ts::auditAdaptStates()` runs the audit; the fixture suite calls it once and asserts `result.failed === 0` as a launch-gate assertion.

---

## Relationship summary

```
CreativeMode (10) ──┐
                    │
ModePair (10) ──────┼──> validateModeFormatCombination(input) ──> ModeFormatValidationResult
                    │           │
BlockedCombo (4+) ──┘           ├─ used by frontend (InputForm) and backend (index.ts callables)
                                └─ same source-of-truth function, no duplication

CreativeMode.requiredElements
        │
        ▼
buildPlanSlotMap(prompt)  ──> slotMap.missingZones  ──> ModeCompositionWarning ──> ResolutionTrace.modeComposition

AdaptState (8) ──> auditAdaptStates() ──> AdaptStateAuditResult ──> ResolutionTrace.adaptStateAudit (optional)
```

No new collections, no migrations, no breaking-shape changes. All extensions are optional fields on existing documents.
