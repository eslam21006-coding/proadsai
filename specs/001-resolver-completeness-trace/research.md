# Research: Resolver Completeness, Resolution Trace & Slide Plans

**Branch**: `001-resolver-completeness-trace` | **Date**: 2026-04-06

## R1: Current Resolver Architecture

**Decision**: Extend `functions/src/creativeResolver.ts` (1,133 lines) — do not rebuild.

**Rationale**: The existing resolver already implements:
- Tab + Role system (anchor/support) with `CREATIVE_MODE_CATALOG`
- `validateCombination()` for mode pairing
- `getBlockedModes()` for tab/role filtering
- `resolveCreativeSpec()` as the core resolution function
- `getResolvedSpecPromptBlock()` for prompt injection

The resolver is well-structured and follows the SSoT pattern. Extension points are clear: add launch surface validation as an outer guard, extend `resolveCreativeSpec()` to produce a trace, and add slide plan generation.

**Alternatives considered**:
- Full rewrite — rejected: 1,133 lines of working logic with no architectural flaws
- Separate microservice — rejected: adds latency, violates < 50ms constraint

## R2: Launch Surface Registry Format

**Decision**: Implement as a typed constant map in a new `launchSurface.ts` file, not as a runtime-read JSON or Firestore document.

**Rationale**: The launch surface is frozen (Constitution Principle III). A compile-time constant ensures:
- Type safety — invalid combinations caught at build time
- Zero I/O — supports < 50ms resolver constraint
- Single file to audit — matches "authoritative registry" assumption
- No deserialization overhead

The registry encodes: offer type → tab mapping, approved modes per tab, approved pairings with layout keys, campaign × format × plan matrix, solo-only mode list, approved hook angles (10), and deleted mode blocklist.

**Alternatives considered**:
- Firestore document — rejected: adds async I/O, breaks < 50ms constraint
- JSON file loaded at cold start — rejected: no type safety, parse overhead
- Environment variable — rejected: not structured enough

## R3: Resolution Trace Schema

**Decision**: Use the exact TypeScript interface from LAUNCH_MATRIX Section 8.

**Rationale**: The spec states "matching the schema defined in LAUNCH_MATRIX Section 8" (FR-018). The schema is comprehensive with 25+ fields covering resolution, overrides, compatibility, slide counts, empty fields, auto-switch events, per-slide breakdown, and launch validation status.

**Key fields**:
- `resolvedCampaignType`, `resolvedAdMode`, `resolvedCreativeModes`, `resolvedStyleFamily`, `resolvedSubStyle`
- `referenceAdOverrideActive`, `overriddenUniverse`, `overriddenSubStyle`
- `artDirectionCleared`, `artDirectionClearedReason`
- `hookAngle`, `hookAngleNullReason` (null when retargeting — FR-013)
- `modeCompatibilityResult`: `'ok' | 'adapt' | 'block'`
- `slideCountOverride`, `originalSlideCount`, `resolvedSlideCount`, `slideCountOverrideReason`
- `valueStackEmptyFieldsSkipped`: string[]
- `autoSwitchEvents`: Array<{ field, from, to, reason }>
- `perSlide`: Array<{ slide, hasCTA, narrativeAngle, photoInjection, testimonialPlatform? }>
- `launchMatrixCheckPassed`, `launchMatrixBlockReason`

**Persistence**: Fire-and-forget write to `generations/{genId}.resolutionTrace` after generation starts. Write failure logged via `console.warn`, never fails the generation.

**Alternatives considered**:
- Sub-collection document — rejected: spec explicitly says "not as a sub-collection"
- Separate logging service — rejected: adds complexity, trace lifecycle tied to generation doc

## R4: Slide Plan Engine Design

**Decision**: New pure function `buildSlidePlan(campaignType, slideCount, creativeMode, options)` in `slidePlanEngine.ts`.

**Rationale**: Slide plans are deterministic mappings (Assumption 7). A pure function with no side effects:
- Is trivially testable (input → output)
- Supports < 50ms constraint
- Can be called from both resolver and generators

**Angle pools** (from LAUNCH_MATRIX Section 5):
- Cold: A(Direct value), B(Curiosity), C(Social proof), D(Problem agitation), E(Mechanism), F(Objection pre-emption), G(Identity)
- Retargeting: P(Proof), M(Mechanism), R(Risk reversal), I(Identity shift), C(Cost of inaction), Q(Question reframe), E(Evidence comparison)

**Assignment rule**: For N slides, slide 1 = Hook/Objection + CTA, slides 2..(N-1) = angles in order from pool (first N-2), slide N = Close + CTA. Middle slides never have CTA.

**Alternatives considered**:
- Embed in creativeResolver.ts — rejected: resolver is already 1,133 lines; separation of concerns
- Configuration-driven (JSON table) — rejected: TypeScript map is more type-safe and equally readable

## R5: Empty Field Suppression Strategy

**Decision**: New `filterEmptyFields(input)` function in `emptyFieldFilter.ts` that strips empty canonical fields before they reach any generation logic.

**Rationale**: The 9 canonical fields (`valueStackTitle`, `valueStackItems`, `valueStackBonuses`, `valueStackPrice`, `valueStackOriginalValue`, `valueStackSavings`, `valueStackGuarantee`, `valueStackDeliveryFormat`, `valueStackProofStatement`) must be filtered at the resolver boundary — once, not scattered across generators.

**Filter logic**: A field is "empty" if `undefined`, `null`, empty string, or whitespace-only. For array fields (`valueStackItems`, `valueStackBonuses`), also filter if array is empty or all elements are empty strings.

**Alternatives considered**:
- Filter inside each generator — rejected: violates "resolver is single authority" assumption
- Filter at Firestore write — rejected: too late; empty fields would already be in prompts

## R6: Deleted Mode Removal Scope

**Decision**: Remove `limited_access`, `module_preview`, `day_strip` from all backend files. Frontend removal is Spec C.

**Files requiring changes** (from codebase search):
1. `creativeResolver.ts` — remove from `CreativeModeId` type and `CREATIVE_MODE_CATALOG`
2. `captionValidator.ts` — remove keyword entries (lines ~192-206)
3. `selectorLimits.ts` — remove plan gate entries (lines ~39-45)
4. `patternSummaries.ts` — remove from VALID_MODES set
5. `modeFieldSchema.ts` — remove field schema entries
6. `knowledge/offerCreativeModes.ts` — remove mode definitions
7. `entitlements.ts` — remove plan gate indices

**Note**: `step3point5.ts` does not exist as a standalone file. The Step 3.5 logic lives in `layoutContract.ts` and IS actively used. FR-014 may need verification — if no dead code file exists, the requirement is already satisfied or refers to a different artifact.

**Alternatives considered**: N/A — removal is straightforward deletion.

## R7: before_after Reclassification

**Decision**: Move `before_after` from hook angle definitions to creative mode catalog. Add to all 3 tabs as solo-only.

**Changes**:
1. `knowledge/hookAnglesKnowledge.ts` — remove `before_after` if present
2. `creativeResolver.ts` — add `before_after` to `CreativeModeId`, mark as solo-only in all tabs
3. `launchSurface.ts` — register `before_after` as approved in all 3 tabs, solo-only, single-format-only

**Alternatives considered**: N/A — spec is explicit about reclassification.

## R8: Visual Precedence Chain Implementation

**Decision**: Implement as a sequential resolution pass within the resolver, each level checking and potentially overriding the next.

**Chain** (highest to lowest):
1. Reference Ad → overrides universe + art direction; preserves mode layout
2. Style Family → controls available art direction cards; minimal suppresses environment
3. Art Direction → overrides universe rendering aesthetic
4. Universe → controls scene environment
5. Creative Mode Layout → never overridden

**Each override**: Sets trace fields (`referenceAdOverrideActive`, `overriddenSubStyle`, `artDirectionCleared`, etc.) and pushes to `autoSwitchEvents` array.

**Alternatives considered**:
- Priority queue / strategy pattern — rejected: over-engineered for a 5-level fixed chain
- Separate precedence service — rejected: adds function call overhead for simple sequential logic

## R9: Batch N Calculation

**Decision**: N = product of variation dimensions (hooks × concepts × sizes), capped at 30. Resolver runs once; pipeline instantiates jobs.

**Implementation**: The resolver validates the batch combination and computes N. The `generateCreative` function in `index.ts` uses N to spawn individual generation jobs. Each job uses the same resolved spec (single resolver run).

**Alternatives considered**: N/A — clarified directly by product owner.

## R10: Offer Type Consolidation

**Decision**: Map 5 existing offer types to 3: Live Event (replaces Free Webinar, Paid Workshop, Challenge), Free Guide, Mini-Course.

**Implementation**: Add mapping in `launchSurface.ts`. The resolver accepts any of the old names and maps to the canonical 3. The tab mapping is: Live Event → `live_events`, Free Guide → `free_guide`, Mini-Course → `mini_course`.

**Alternatives considered**:
- Hard reject old names — rejected: existing generation records may reference old names
- Frontend-only mapping — rejected: backend must enforce truth (Constitution XI)
