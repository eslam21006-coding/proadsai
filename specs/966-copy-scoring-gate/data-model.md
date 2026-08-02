# Phase 1 Data Model: Silent Copy Scoring & Rewrite Gate

**Feature**: `966-copy-scoring-gate` | **Date**: 2026-08-01

All additions are **additive**. No existing field is removed, renamed, or repurposed (FR-021). No Firestore schema migration. No new collection (FR-020b).

---

## 1. Runtime entities (in-memory, `copyScoringGate.ts`)

### `ScoredField`

One field of one variation, with its scores and verdict.

| Field | Type | Notes |
|---|---|---|
| `variationId` | `string` | `"A"`–`"D"`, or a slide index for the carousel step |
| `fieldName` | `"hookText" \| "subheadText" \| "ctaName" \| "benefitText" \| "slideCaption" \| "testimonialHook" \| "testimonialClose"` | Only fields actually present are scored (FR-001) |
| `original` | `string` | Value as generated |
| `scores` | `Record<CopyDimension, number>` | 9 integers, 1–10 (FR-002) |
| `average` | `number` | Mean over **gating** dimensions only — 8 for CTA/benefit, 9 for all others (FR-006, FR-003b) |
| `passed` | `boolean` | Derived by the threshold rule (FR-006) |
| `failureReasons` | `string[]` | Which conditions failed; empty when `passed` |

### `CopyDimension`

Exactly 9 active values (FR-002):

`audienceSpecificity` · `painDesireRelevance` · `clarity` · `scrollStoppingTension` · `wordingSpecificity` · `offerRelevance` · `nonGenericLanguage` · `readingLevel` · `livedSymptomDepth`

**Deferred to Phase 23 — MUST NOT be scored or gated** (FR-002a): hook-angle fit, format fit, visual compatibility, CTA strength, proof strength, objection handling.

**Gating rules**:

| Dimension | Floor | Gates on |
|---|---|---|
| `readingLevel` | ≥ 7 | **All** fields (FR-003a) |
| `livedSymptomDepth` | ≥ 7 | Headline, subheadline, slide captions **only** (FR-003a) |
| `livedSymptomDepth` | — | On CTA / benefit: scored and recorded, **never gates**, excluded from that field's average (FR-003b) |
| All other 7 | ≥ 6 | All fields |
| Average | ≥ 8 | Per field, over that field's gating dimensions |

### `RewriteDecision`

| Field | Type | Notes |
|---|---|---|
| `variationId` | `string` | |
| `fieldName` | `string` | |
| `pass` | `1 \| 2` | Max 2 (FR-009) |
| `diagnosis` | `string` | From `COPY_REWRITE_DIAGNOSES`; per-field even when one call rewrites many (FR-007) |
| `candidate` | `string` | Proposed replacement |
| `candidateScore` | `number` | |
| `accepted` | `boolean` | False when the original scored higher (FR-010) or a constraint check failed (FR-012) |
| `rejectReason` | `string \| null` | e.g. `"scored_lower"`, `"length_cap"`, `"cultural_substitution_failed"`, `"untouchable_mutated"`, `"block_unparseable"` |

### `CopySet`

The unit the ceilings are measured against — **all copy authored by one copy-producing step for one item** (FR-018, FR-016).

| Field | Type | Notes |
|---|---|---|
| `step` | `"hook" \| "carouselSlides" \| "testimonial"` | The three copy-producing steps (FR-000d, FR-000e) |
| `fields` | `ScoredField[]` | Across every variation of the item |
| `untouchable` | `string[]` | Advertiser literals + transcribed testimonial content (FR-011, FR-000f) — present for context, never scored, never rewritten |
| `rawBlock` | `string` | The block being rewritten in place (FR-000b) |

---

## 2. Persisted additions

### `ResolutionTrace.copyScoring` — optional, additive

**Declared in BOTH** `functions/src/types.ts:353` and `functions/src/generators.ts:5475` (R9 — two independent definitions exist; adding to one only is a silent-write hazard).

```
copyScoring?: {
  ran: boolean;
  skipReason?: "disabled" | "no_credential" | "timeout_interaction"
             | "timeout_copyset" | "timeout_run" | "unreachable"
             | "malformed_response" | "out_of_range" | "unusable_rewrite";
  steps?: Array<{
    step: "hook" | "carouselSlides" | "testimonial";
    fields: Array<{
      variationId: string;
      fieldName: string;
      scores: Record<string, number>;
      average: number;
      passed: boolean;
    }>;
    rewrites: Array<{
      variationId: string;
      fieldName: string;
      pass: 1 | 2;
      diagnosis: string;
      accepted: boolean;
      rejectReason?: string;
    }>;
    passCount: 0 | 1 | 2;
    gaveUp: boolean;          // still below threshold after 2 passes (US3 §2)
    interactionCount: number; // ≤ 5 (FR-018)
  }>;
};
```

**Invariants**:

- `ran: false` + `skipReason` is distinguishable from `ran: true` with zero rewrites (FR-020, US4 §2).
- When the switch is off, only `{ ran: false, skipReason: "disabled" }` is written — no scores, no rewrite decisions (FR-019f).
- Records written before this feature have no `copyScoring` key and remain readable (FR-021).

### Transport shape — crosses the callable boundary, not process memory

Per **R1**, the trace rides the HTTP boundary (Phase 20 concept-director pattern), because `serverGenerateTOV` and `serverGenerateFinalAd` run in **separate Cloud Run containers**:

```
serverGenerateTOV response
  → { ...existing, copyScoringTrace }
  → frontend state (opaque passthrough, never rendered — FR-013)
  → serverGenerateFinalAd request.data.copyScoringTrace
  → generateFinalAd parameter
  → _lastResolutionTrace.copyScoring
```

`serverGenerateCarouselSlideCopies` and `serverGenerateTestimonialCarousel` return their traces the same way; `generateFinalAd` merges whichever are present into the `steps[]` array.

**Explicitly rejected**: a module-global survivor (`let _lastCopyScoring` + getter). `generators.ts:1389-1398` records that this pattern "worked in the emulator (shared process) but **NEVER in production**." It passes every local test and writes `undefined` in production.

---

## 3. Untouched by this feature

| Entity | Status |
|---|---|
| `OwnedRenderText` (`generators.ts:678`) | Unchanged — the gate improves the values that flow into it, not its shape (FR-014) |
| `ClaimFlagEntry` | Shape unchanged; the rewrite call re-emits entries for rewritten fields (FR-011a) |
| `generations/{genId}` | No new top-level field; only the nested `resolutionTrace.copyScoring` |
| Copy-fidelity contract | Untouched (FR-022) |
| `textCompositing` / render pipeline | Untouched (FR-024) |
| Caption entities | Out of scope (FR-025) |
| Frontend types | One opaque passthrough field; nothing rendered (FR-013) |

---

## 4. State transitions — per copy set

```
GENERATED
   │  switch off / no credential ─────────────► SHIPPED_ORIGINAL (ran:false)
   ▼
SCORED (interaction 1)
   │  all fields pass ────────────────────────► SHIPPED_GATED (0 rewrites)
   ▼
REWRITE PASS 1 (interaction 2) → RESCORED (interaction 3)
   │  all pass ───────────────────────────────► SHIPPED_GATED (1 pass)
   ▼
REWRITE PASS 2 (interaction 4) → RESCORED (interaction 5)
   │  all pass ───────────────────────────────► SHIPPED_GATED (2 passes)
   ▼
BEST CANDIDATE WINS ──────────────────────────► SHIPPED_GATED (gaveUp:true)

ANY error / timeout / malformed / unusable at ANY state
   └────────────────────────────────────────► SHIPPED_ORIGINAL (ran:false + skipReason)
```

Terminal states are exactly two: **SHIPPED_GATED** or **SHIPPED_ORIGINAL**. There is no failure terminal — the gate cannot fail a generation (FR-015, FR-017).

Maximum interactions per copy set: **5**. Maximum per run: **10** — 5 × the number of copy-producing steps, of which no run invokes more than two (FR-019b). Independent of batch size and slide count.
