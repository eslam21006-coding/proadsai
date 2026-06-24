# Phase 1 Data Model: Direct-Response Design Upgrades (Phase 19)

This phase is prompt-engineering; the "data model" is a small set of in-memory types plus one additive persisted trace field. No Firestore schema migration.

## 1. `GazeTreatment` (union type — `gazeMap.ts`)

The five canonical gaze options from the spec.

```ts
type GazeTreatment =
  | "direct_to_viewer"      // level gaze to camera — authority, social_proof, urgency, statistics, logic, logical_authority
  | "toward_content"        // natural glance toward headline/CTA zone — scarcity, soft emotional
  | "reflective_downward"   // slightly down & inward, contemplative — pain
  | "forward_horizon"       // uplifted, forward/visionary — future_based, AFTER half
  | "three_quarter";        // classic off-axis portrait gaze — curiosity
```

## 2. `GazeDirective` (interface — `gazeMap.ts`)

The resolved gaze treatment for one generation.

| Field | Type | Notes |
|---|---|---|
| `source` | `"hook" \| "objection" \| "fallback"` | Provenance of the directive. `"art-direction"` reserved for a future phase (deferred). |
| `sourceId` | `string` | The hook id (e.g., `"pain"`) or objection id that produced it; `"__fallback__"` for fallback. |
| `treatment` | `GazeTreatment` | The chosen gaze option. |
| `description` | `string` | Concrete physical gaze description injected into the prompt (eye/head orientation only — never facial features). |

**Validation / invariants**
- Resolver returns `GazeDirective | null`. `null` ONLY when both `coldHookAngle` and `retargetingObjection` are null/empty (FR-005).
- Any non-null, non-canonical id resolves via `HOOK_ALIAS_MAP` or falls back to `GAZE_FALLBACK_DIRECTIVE` — never throws, never null for non-null input (FR-010).
- Priority: `coldHookAngle` > `retargetingObjection` when both present (mirrors `resolveExpressionDirective`).

## 3. Mapping tables (constants — `gazeMap.ts`)

- `HOOK_GAZE_MAP: Record<HookId, Omit<GazeDirective,"source"|"sourceId">>` — the 10 canonical angles (see research R3).
- `HOOK_ALIAS_MAP: Record<string,string>` — `shocking_stat→statistics`, `fear_of_missing_out→urgency`, `future_pacing→future_based`.
- `GAZE_FALLBACK_DIRECTIVE` — `{ treatment: "three_quarter", description: "natural, intentional three-quarter gaze, approachable and engaged — never staring into empty space" }`.
- `GAZE_ASPIRATIONAL_DIRECTIVE` — AFTER-half override `{ treatment: "forward_horizon", description: "uplifted forward gaze, already seeing the result" }`.
- Objection grouping reuses the Phase 28 family approach (price/trust/timing → treatment) for retargeting heroes.

## 4. Prompt block outputs (pure string builders — `gazeMap.ts`)

| Builder | Gating | Emits |
|---|---|---|
| `buildImagePromptGazeBlock(directive, {beforeAfterSplit, aspectRatio})` | hook/objection present | `GAZE DIRECTION:` block — treatment + description, identity-priority clause, advisory/natural clause, "avoid staring into empty space / no cross-eyed / no robotic always-at-CTA", composition-defer + aspect-ratio note; before/after → BEFORE (hook gaze) / AFTER (aspirational) split |
| `ONE_HIGHLIGHT_BLOCK` (const) | ALWAYS (hero-bearing) | one primary focal point = hero; ≤1 supporting secondary emphasis that supports hero or guides eye to CTA; no multiple glow/sparkle/highlight |
| `buildHookVisualMoodBlock(directive)` | hook present | mood modulation within (never overriding) art direction/universe — pain→moodier/shadows, aspiration/future→brighter/warmer/open, authority→structured/symmetrical, urgency→tighter/warm accents |
| `buildPriceHierarchyBlock()` | pricing content detected | original price smaller/struck-through; discounted larger/prominent/distinct color; savings highlighted but secondary |
| `detectPriceContent(copy: {hookText, subheadText, benefitText, badges})` → `boolean` | helper | currency/number/percent/discount-keyword scan (Arabic + Latin) |
| `CTA_OUTCOME_FRAMING_BLOCK` (const) | copy prompt | advisory outcome-framing guidance string for the Gemini CTA/benefit block; defined here (side-effect-free) and imported by `generators.ts` so it stays unit-testable from the standalone runner |

## 5. `ResolutionTrace.gazeDirection` (additive persisted field — `types.ts`)

Additive optional sub-object on the existing `ResolutionTrace` (Firestore `generations/{genId}.resolutionTrace`). No migration; legacy records without it are valid and read as "not applied."

| Field | Type | Notes |
|---|---|---|
| `source` | `"hook" \| "objection" \| "fallback" \| null` | null when not applied. |
| `sourceId` | `string \| null` | hook/objection id, or null. |
| `treatment` | `string \| null` | resolved `GazeTreatment`, or null. |
| `applied` | `boolean` | true when a gaze block was injected. |
| `reason?` | `string` | e.g., `"no-hook-or-objection-active"` when `applied:false`. |

```ts
readonly gazeDirection?: {
    readonly source: "hook" | "objection" | "fallback" | null;
    readonly sourceId: string | null;
    readonly treatment: string | null;
    readonly applied: boolean;
    readonly reason?: string;
};
```

## 6. Relationships & coexistence

- `gazeDirection` trace sits beside the existing `expressionAdaptation` trace; both are written in `generateFinalAd()`. They are independent and non-contradictory (gaze = eye/head orientation; expression = facial emotion) — FR-019.
- The gaze/mood/one-highlight/price blocks are appended in `buildFinalImagePrompt` immediately after the Phase 28 expression block; all are subordinate to the unchanged #1 face-identity rule (FR-018).
- No entity, field, or relationship in this model is exposed to or required by the frontend.
