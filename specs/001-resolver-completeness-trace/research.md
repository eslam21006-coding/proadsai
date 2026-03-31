# Research: Resolver Completeness, Resolution Trace & Slide Plans

**Feature**: 001-resolver-completeness-trace
**Date**: 2026-03-31

## Decision 1: before_after Reclassification

**Decision:** Add `before_after` to `CREATIVE_MODE_CATALOG` as a solo-only anchor mode in all 3 tabs. Remove from `COLD_HOOK_ANGLES` and `HOOK_ANGLE_CREATIVE_CONFLICTS`.

**Rationale:** LAUNCH_MATRIX Section 2.7: "before_after is a Creative Mode, not a hook angle." Section 2.2 lists it as approved in mini_course, live_events, free_guide. Section 2.3 marks it BLOCKED for pairing.

**Current state:** `before_after` exists ONLY as a hook angle in `src/constants.ts:111` and as a conflict key in `creativeResolver.ts:305-307`. It is NOT in `CREATIVE_MODE_CATALOG`.

**Alternatives considered:**
- Keep as hook angle: Rejected — LAUNCH_MATRIX explicitly reclassifies it.
- Add as support mode: Rejected — it defines the entire canvas (solo-only), must be anchor.

## Decision 2: Solo-Only Mode Enforcement

**Decision:** Add `soloOnly: boolean` field to `CreativeModeMeta`. Enforce in `validateCombination()` before pair lookup.

**Rationale:** `before_after` and `text_only` are BLOCKED from pairing across all tabs (LAUNCH_MATRIX Section 2.3). Currently `text_only` has no explicit pairing block — it simply isn't in `ALLOWED_PAIRS`, producing a generic error.

**Alternatives considered:**
- Use `DISALLOWED_PAIRS` for blanket blocks: Rejected — that structure is for specific pairwise conflicts.

## Decision 3: Offer Type Consolidation

**Decision:** Reduce `OFFER_TYPES` to 3 entries: "Live Event", "Free Guide", "Mini-Course". Update `getTabForOfferType()`. Keep old names in mapping as fallback for saved projects.

**Rationale:** LAUNCH_MATRIX Section 0: "3 entries. Free Webinar + Paid Workshop + Challenge collapsed into Live Event."

**Current state:** `src/constants.ts:622-628` has 5 entries. `creativeResolver.ts:661-667` has 5-to-3 mapping.

## Decision 4: Resolution Trace Storage

**Decision:** Field on `generations/{genId}` document (`resolutionTrace` key), not a sub-collection. Written server-side after generation.

**Rationale:** Simpler, avoids extra reads, matches LAUNCH_MATRIX Section 8 "sub-document" wording. FR-018 explicitly states "field on the generation document."

## Decision 5: Visual Precedence Chain

**Decision:** Implement as `resolveVisualPrecedence()` pure function in `creativeResolver.ts`. Returns override events for the trace.

**Rationale:** FR-016 requires the 5-level chain. A pure function is deterministic and testable. Called from `resolveCreativeSpec()`.

**Current state:** No precedence logic exists. Reference ad override is partially handled inline in generators.ts. Art direction clearing on family switch is partially in the frontend store.

## Decision 6: Carousel Slide Plans

**Decision:** Static lookup table in `creativeResolver.ts`. `carouselSlideCountPlan(campaignType, slideCount)` returns `SlideRole[]`.

**Rationale:** LAUNCH_MATRIX Section 5.A defines exact sequences. Fully deterministic — no AI needed.

## Decision 7: Server-Side Guard Location

**Decision:** Insert `validateLaunchSurface()` in `index.ts` AFTER auth + credit owner resolution, BEFORE `runTransaction()` credit deduction (before line 108).

**Rationale:** FR-001 requires validation before generation. Constitution Principle VIII requires blocking before credit deduction. Current entry point: `generateCreative` handler at `index.ts:87-145`.

## Decision 8: Scattered Campaign Type Logic

**Decision:** Centralize the retargeting `hookAngle = null` rule into `resolveCreativeSpec()`. Leave prompt-construction campaign type references in generators.ts (they're not resolver logic).

**Rationale:** FR-013 requires centralization. The inline `(inputs as any).campaignType` pattern at generators.ts lines 831, 5442 is a code smell but those feed prompt construction, not combination validation.
