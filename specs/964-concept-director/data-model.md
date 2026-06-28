# Phase 1 Data Model — Concept Director (Phase 20, Option A)

All structures below are **in-memory TypeScript types** in `functions/src/`, except the three persisted touch-points (flag field, kill-switch param, trace sub-object), which are all **additive — no Firestore migration runs**.

---

## 1. Enumerations (closed unions, canonical English)

These labels are part of the contract the downstream prompt and the validator switch on. They stay English regardless of `adLanguage` (FR-004).

```ts
export type VarianceMode = "conservative" | "balanced" | "aggressive"; // only "balanced" exercised this build

export type HeadlineArchitecture =
  | "manifesto" | "editorial" | "annotated" | "dual_state"
  | "oversized_question" | "numerical_anchor" | "ellipsis_tease" | "stacked_weight"; // 8

export type LayoutArchetype =
  | "asymmetric_void" | "central_headroom" | "central_baseweight"
  | "environmental_canvas" | "split_dual_state" | "typography_dominant" | "editorial_columns"; // 7

export type HeroGazeDirection =
  | "toward_headline" | "toward_cta" | "direct_camera"
  | "off_frame_intentional" | "downward_introspective"; // 5

export type HeroPresence = "present" | "absent" | "partial" | "multiple_subjects";
export type BackgroundComplexity = "minimal" | "moderate" | "rich";
export type LogoTreatment = "composite_post" | "absent_this_concept" | "corner_subtle";
export type ViolationSeverity = "block" | "warn";
export type VarianceAxis = "metaphor" | "layout" | "headline" | "backgroundComplexity";
```

> Note: `heroGazeDirection` here is the Director's **brief-level** gaze field for variety; it is separate from and does not modify the Phase 19 `gazeMap.ts` image-prompt gaze block (which stays untouched per spec "What NOT to change").

---

## 2. ConceptDirectorInput

Built per concept by the orchestrator and handed to the Director.

| Field | Type | Notes |
|-------|------|-------|
| `brief` | object | hookText, hookType, hookAngle, adTone, copywritingStrategy, audience, offer fields (pass-through from `AdInputs`). |
| `inviolable` | object | subStyle, creativeMode, language, aspectRatio, brand colors/logo — **never overridden** (FR-008). |
| `conceptIndex` | `0 \| 1 \| 2` | Which sibling this is. |
| `siblingConcepts` | `ConceptBrief[]` | The 0..N-1 already-produced briefs (their `varianceAxes` to avoid). Empty for index 0. |
| `varianceMode` | `VarianceMode` | Fixed `"balanced"` this build. |
| `avoidTokens` | `{ metaphor?: string[]; layout?: string[]; headline?: string[] }` | Extra tokens to avoid, populated on **retry** from the validator's duplicates. Empty on first pass. |
| `pastWinningAds` | `unknown[]` | **Defaults to `[]`**; intentionally unwired this build (FR-007). |
| `reviewerFlags` | `unknown` | Pass-through placeholder (Selection Reviewer deferred); unused this build. |

**Validation rules**: `conceptIndex` ∈ {0,1,2}; `siblingConcepts.length === conceptIndex` on the first pass; `pastWinningAds` defaults to empty array if undefined.

---

## 3. ConceptBrief (Director success output)

| Field | Type | Constraint |
|-------|------|-----------|
| `visualMetaphor` | `{ description: string; keyVisualElement: string; emotionalReason: string }` | `description` must be a concrete depictable image (FR-003). Free-text in user's language. |
| `headlineArchitecture` | `HeadlineArchitecture` | One of 8. |
| `highlightCardinality` | `{ count: 0\|1\|2; phrases: string[]; treatment: string }` | **`count ≤ 2`** (hard). `phrases.length === count`. |
| `layoutArchetype` | `LayoutArchetype` | One of 7. |
| `heroPresence` | `HeroPresence` | — |
| `heroGazeDirection` | `HeroGazeDirection` | One of 5. |
| `heroPoseSpecific` | `string` | Free-text, user's language; ignored when `heroPresence === "absent"`. |
| `propsAllowed` | `string[]` | May be empty. |
| `propsForbidden` | `string[]` | **`length ≥ 3`** (hard). |
| `backgroundComplexity` | `BackgroundComplexity` | — |
| `accentBehavior` | `{ primaryUse: string; secondaryUse: string; cardinality: 1\|2\|3 }` | Where brand color appears (≤3 places). |
| `logoTreatment` | `LogoTreatment` | — |
| `subStyleSpecialization` | `{ inheritedFrom: string; specializedAs: string; keyDeparture: string }` | **`inheritedFrom === inviolable.subStyle`** exactly (hard, FR-008). |
| `restraintRules` | `string[]` | **`length ≥ 2`** (hard). |
| `conceptIndex` | `number` | Echoes input. |
| `varianceAxes` | `{ metaphorToken: string; layoutToken: string; headlineToken: string }` | Short canonical tokens compared by the validator (normalized). All three required & non-empty. |

**State**: a brief is either **accepted** (passes `validateBrief`) or **rejected** → becomes a `ConceptDirectorFallback` for that concept.

---

## 4. ConceptDirectorFallback (Director failure output)

| Field | Type | Notes |
|-------|------|-------|
| `fallback` | `true` | Discriminant. |
| `reason` | `string` | `"api_error" \| "timeout_15s" \| "json_parse_failed" \| "schema_invalid" \| "constraint_violation:<which>"`. |

Consumed downstream as the signal to run existing Visual Architect logic for **that concept only** (FR-010). The result type is `ConceptBrief | ConceptDirectorFallback` (discriminated on `fallback`).

---

## 5. VarianceValidationResult

| Field | Type | Notes |
|-------|------|-------|
| `passed` | `boolean` | `true` ⇒ proceed; `false` ⇒ at least one `block` violation. |
| `violations` | `VarianceViolation[]` | Each: `{ axis: VarianceAxis; duplicateConceptIndices: number[]; severity: ViolationSeverity }`. |

`warn` violations never set `passed = false` and never trigger a retry (FR-017).

---

## 6. Persisted touch-points (all additive — no migration)

### 6a. Per-user flag — `users/{uid}.conceptDirectorEnabled`
- Type `boolean`. **Absent ⇒ treated as `false`.** Default `false` for all users at ship time.

### 6b. Kill switch — Remote Config `conceptDirectorKillSwitch`
- Type `boolean`, global. Read with 60s in-process cache. `true` ⇒ stage skipped for everyone.

### 6c. Trace — `generations/{genId}.resolutionTrace.conceptDirector` (optional)
```ts
readonly conceptDirector?: {
  readonly ran: boolean;
  readonly enabled: boolean;
  readonly killSwitch: boolean;
  readonly mode: "balanced";
  readonly conceptCount: number;
  readonly fallbackCount: number;
  readonly validatorTriggered: boolean;
  readonly retryCount: number;
  readonly varianceAchieved: boolean;
  readonly reason?: string; // present when ran === false (e.g. "flag-disabled", "kill-switch-on", "non-initial-mode")
};
```
Mirrors the additive/optional precedent of `expressionAdaptation` and `gazeDirection`. Field absence on legacy generations = "no Phase-20 data" (SC-008).

---

## 7. Relationships & lifecycle

```text
AdInputs (existing)
   │  (per concept 0,1,2, sequential)
   ▼
ConceptDirectorInput ──► Director(model) ──► ConceptBrief | ConceptDirectorFallback
   │                          ▲                         │
   │            avoidTokens on retry                    │ (3 results)
   │                          │                         ▼
   └──────────────────────────┴──────────► VarianceValidator(briefs) ──► VarianceValidationResult
                                                                              │ passed?
                                              ┌───────────────────────────────┤
                                       false & no-retry-yet            true / retry-exhausted
                                              │                                │
                                     retry offending concepts (≤1)             ▼
                                              └──────────────► enrich generateConcepts() prompt
                                                                               │
                                                          fallback concepts use existing logic
                                                                               ▼
                                                       1 Visual Architect call → 3 concepts
                                                                               │
                                                                               ▼
                                                       ResolutionTrace.conceptDirector written
```

Invariants:
- Exactly 3 briefs (success or fallback) before validation.
- Each concept retried **at most once** (per-concept guard).
- A fallback brief exposes **no** `varianceAxes`; the validator skips absent tokens (a fallback never causes a false duplicate, and cannot be "fixed" by retry beyond the one allowed).
- The run/skip decision is computed **once** per generation and held throughout (FR-021).
