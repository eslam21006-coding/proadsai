# Phase 0 Research: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

All NEEDS CLARIFICATION items from the spec were resolved during `/speckit.clarify` (Session 2026-06-15). This document records the decisions, the rationale, and the codebase findings that ground them.

## Codebase grounding (current state, verified)

| Area | Current implementation | File / location |
|---|---|---|
| Hook storage | Hooks live in a single `tovText` **string**; blocks delimited by `HOOK_START_${v}`…`HOOK_END_${v}` (single) and `ANGLE_START_${v}`…`ANGLE_END_${v}` (carousel). Fields are plain-text keys: `HOOK_TEXT`, `SUBHEADLINE`, `CTA_BUTTON`, `BENEFIT`. | `src/store.ts` (`tovText`/`setTovText`); `src/App.tsx` ~L6420-6683; `getSection()` ~L3131 |
| "Generate 4 More Like This" | Button label at `App.tsx:6667`; handler `~L6628-6668`; deducts `CREDIT_COSTS.refreshHooks` via `deductCredits('refreshHooks')` (L6631); calls `generateTOV(...,'refresh',...)` (single) or `generateCarouselAngles(...,likeThisPrompt)` (carousel); **appends** via `setTovText(prev => prev + '\n' + res)` (L6654). Carousel path already injects a strong "same angle, no reused words, dedupe against existing" refinement (L6640-6645) and validates with `validateCanonicalHooks`. | `src/App.tsx` |
| Card actions | Approve `handleApproveTov` (L6591), Edit `handleInlineHookSave` (L6535), AI Edit `handlePrecisionHookEdit` (L6673), Batch toggles `batchSelectedHooks`. All keyed by variant `v` (A/B/C/D). | `src/App.tsx` |
| Existing carousel UI | Lightbox modal with RTL-aware arrows (`isRtl = lang==='ar'`, arrows swap, counter `i+1/N`). Reusable pattern for the in-card carousel. | `src/App.tsx` ~L9091-9137 |
| RTL detection | `useT()` → `lang`; `dir={lang==='ar'?'rtl':'ltr'}`, `flex-row-reverse`, `font-arabic`; `document.documentElement.dir` set in `i18n.tsx`. | `src/i18n.tsx`, `src/App.tsx` |
| Angle blueprints | `ANGLE_VARIATION_BLUEPRINTS` already a **fixed-4** map per angle: Hook A=Financial, B=Time, C=Status, D=Skill. `getAngleVariationBlueprint()` injects at `generators.ts:2053`. `ANGLE_HARD_RULES` (L661-673) one checkable element per angle. Arabic phrasing throughout. No compliance guards in this file (handled in `culturalCompliance.ts`). | `functions/src/knowledge/hookAnglesKnowledge.ts` |
| Angle lock | Hard "🔒 CRITICAL ANGLE LOCK" prompt block + per-angle validation rules injected at `generators.ts:2031-2051`. | `functions/src/generators.ts` |
| Opening structures | The 7 structures (percentage / question / imperative / ratio / conditional / direct-address / time-reference) already exist as **soft prompt guidance** at `generators.ts:2284-2291`, plus a self-check checklist (L2367-2368). Not rotated across projects, not assigned per-hook. | `functions/src/generators.ts` |
| Temperature | 1.0 initial, 1.2 regeneration, 0.6 precision edit. | `generators.ts:2450, 2528` |
| Creative memory | `creativeMemory/{creativeId}` records (per creative) + `creativePatterns/{userId}/indexes` (per user). Records `hookAngle`, `hookType`, `copyStrategy`, etc., but **no dimension/opening fingerprints** and no recent-N anti-repetition retrieval. Functions: `storeCreativeToMemory`, `retrieveCreativePatterns`. | `functions/src/creativeMemory.ts` |
| Carousel picker angles | `generateCarouselAngles` (`generators.ts:7068-7296`) emits 4 **fixed** story directions (cold: Direct/Curiosity/Social/Problem; retargeting: Proof/Question/Identity/Cost) — effectively always the first-4 of the 7-angle sets. Output blocks `ANGLE_START_A..D`. | `functions/src/generators.ts` |
| Slide plan engine | `slidePlanEngine.ts` exists with `COLD_ANGLES = [A..G]`, `RETARGETING_ANGLES = [P,M,R,I,C,Q,E]`, and `buildSlidePlan()` assigning middle slides `pool[i % pool.length]` (fixed sequential). **Exported but never called.** Invariants (CTA slide 1+last, photo slide 1, no adjacent repeat) already enforced. | `functions/src/slidePlanEngine.ts` |
| Phase 22 constants | All 6 present in `copywriting_knowledge.ts`. `READING_LEVEL_BLOCK`/`LIVED_SYMPTOM_BLOCK`/`FABRICATION_POLICY_BLOCK`/`BANNED_CTA_LIST` active in 4 prompt surfaces. `COPY_SCORING_DIMENSIONS` (L782) and `COPY_REWRITE_DIAGNOSES` (L808) are **inert** (commented "NOT consumed by any executing code path"). | `functions/src/copywriting_knowledge.ts` |
| Copy-fidelity gate | `validateCopyFidelity()` substring-matches `hookText`/`subheadText`/`ctaName`/`benefitText` (NFC-normalized) against the technical prompt. | `functions/src/buildPlanSlotMap.ts:696-740` |
| claimFlag | `extractClaimFlagsFromResponse` / `extractOwnedRenderText` strip `CLAIM_FLAG:` lines and return structured flags; stored in final ad. | `generators.ts:542-581, 5069` |
| Revert switch | `export const MODEL_PROVIDER: "openai" | "gemini" = "openai";` | `functions/src/modelConfig.ts:3` |

## Decision log

### D1 — In-card variation storage model (23.A)
- **Decision**: Keep `tovText` as the source of the original 4 hooks. Add a **parallel typed structure** in the Zustand store: a map keyed by variant (`A`/`B`/`C`/`D`) → ordered list of variation entries, plus a per-card active index and a cap-reached flag. Position 1 = the reference hook (rendered from its `tovText` block); positions 2..N = stored variations. Card actions read the active position (variation entry, or the `tovText` block when index 0).
- **Rationale**: Avoids re-architecting the entire string-based hook model (high blast radius across `App.tsx`). Variations are inherently per-card and ordered — a typed list models them cleanly and makes "extend, not reset" and the 12-cap trivial. The reference hook is never mutated (FR-002).
- **Alternatives considered**: (a) Nested delimiter markers inside `tovText` (e.g., `VARIATION_START`) — rejected: brittle string surgery, harder dedupe, easy to break `getSection`/fidelity parsing. (b) Full typed hook-array refactor — rejected: out of scope, very high risk in a monolithic file.

### D2 — Variation cap = 12 (23.A)
- **Decision**: Hard cap of 12 positions per card (1 reference + 11 variations). On overflow: refuse, show a "carousel is full" notice, charge no credit.
- **Rationale**: Matches the reference's "~12"; bounds cost (Principle VIII) and store size; keeps navigation usable.

### D3 — Credit policy unchanged, partial OK (23.A) *(clarified)*
- **Decision**: Each click costs the existing `refreshHooks` credit regardless of how many of the 4 are delivered. Partial success (fewer than 4 valid after dedupe/quality) delivers the best subset. Zero valid → non-blocking notice, card unchanged, **no** dedupe relaxation, **no** credit refund logic added.
- **Rationale**: No billing-path change (FR-032 spirit / scope exclusion). Simplest correct behavior; consistent with current `deductCredits('refreshHooks')`.
- **Alternatives**: charge-only-if-≥1 / pro-rate — rejected as billing-path changes outside scope.

### D4 — Zero-result behavior (23.A) *(clarified)*
- **Decision**: Show a non-blocking message ("couldn't generate fresh variations — try again"); leave the card's existing carousel intact; never relax dedupe/quality to force output.
- **Rationale**: Preserves the anti-sameness guarantee (FR-010) and reference integrity (FR-002); reliability over forced output (Principle I).

### D5 — Fixed-4 blueprint → 6–8 dimension pool (23.B)
- **Decision**: Restructure each angle's `ANGLE_VARIATION_BLUEPRINTS` entry from `HOOK A/B/C/D` (Financial/Time/Status/Skill) into a `dimensions: DimensionEntry[]` pool of 6–8, copying the existing dimension text **verbatim** (psychology + Arabic) into pool entries and adding 2–4 new dimensions per angle in the same voice. A pure `drawDimensions(angleId, n=4, seed)` selects 4-of-N. `getAngleVariationBlueprint()` renders the drawn subset.
- **Rationale**: The fixed-order map is the documented root cause (reference §17.1). A pool + draw breaks the A=Financial/B=Time lockstep without touching the angle lock or `ANGLE_HARD_RULES`. Verbatim preservation satisfies FR-013.
- **Alternatives**: rewrite dimensions fresh — rejected (loses validated psychology, violates "keep every word").

### D6 — Opening-structure rotation (23.B)
- **Decision**: Promote the 7 opening structures (already in the prompt) into a rotatable set in `copyDiversity.ts`; `rotateOpenings(seed)` picks which subset/order the 4 hooks use, varied per project. Injected into the existing prompt block at `generators.ts:2284-2291` instead of the static list.
- **Rationale**: Reference §17.2. Reuses existing taxonomy; no new UI; no temperature change (FR-018).

### D7 — Cross-project anti-repetition memory, window = recent ~10 projects/angle (23.B/23.C) *(clarified)*
- **Decision**: Record a lightweight **fingerprint** per generation — `{ userId, angle, dimensionIds[], openingIds[], storyDirectionFamilies[] (carousel), createdAt }` — additively in `creativeMemory` (new fields on the existing record or a small companion sub-collection). On new generation, read the user's most recent ~10 fingerprints for the locked angle and **bias** the draw away from recently used dimensions/openings/families. Bias = down-weight, never exclude; if every option is recent, fall back to least-recently-used. Decisions written to `resolutionTrace.copyDiversity`.
- **Rationale**: Reference §17.3. The ~10 window (clarified) is a stronger long-term diversity signal than ~5 while still bounded; least-recently-used fallback guarantees the pool never starves (FR-017, SC-008). One bounded Firestore read keeps cost low (Principle VIII).
- **Alternatives**: ~5 window (weaker diversity), time-based/all-time-decay (unbounded or activity-dependent) — rejected per clarification.

### D8 — Carousel picker = 4-of-7 rotation (23.C-a) *(clarified)*
- **Decision**: Keep the existing spec-001 angle sets (cold A–G, retargeting P–E; 7 each). `rotateCarouselAngles(campaignType, seed, memory)` draws 4-of-7 rotated + memory-biased per project, replacing the hardcoded first-4 families in `generateCarouselAngles`. No new taxonomy.
- **Rationale**: Reference §17(a) + clarification. Reuses the committed contract's vocabulary; lowest risk; satisfies "never the same 4 families every time."
- **Alternatives**: expand to 8–10 families / mirror 6–8 — rejected per clarification (new taxonomy / contract churn).

### D9 — Middle-slide angle rotation (23.C-b)
- **Decision**: Change `buildSlidePlan` middle assignment from `pool[i % pool.length]` to a per-project rotated traversal `pool[(i + offset) % pool.length]` (offset derived from the project seed), and **wire `buildSlidePlan` into the live carousel path** (it is currently unused). Re-verify invariants after rotation: no adjacent repeat (guaranteed by distinct sequential picks), CTA slide 1+last only, photo slide 1 only.
- **Rationale**: Reference §17(b). Rotation preserves all invariants while varying the order across projects. Wiring the existing pure function in is lower-risk than ad-hoc inline logic.
- **Sync requirement (FR-022)**: `slidePlanEngine.ts` + `generators.ts`, the contract `specs/001-resolver-completeness-trace/contracts/carousel-slide-count-plan.md`, and the reference's carousel section must change together in this PR.

### D10 — Project seed for deterministic rotation (cross-cutting)
- **Decision**: Derive a per-project rotation seed from a stable identifier (e.g., generation/creative id or `userId + projectId + angle` hash). Rotation and draws are pure functions of `(pool, seed, memory)` → deterministic, replayable, and auditable (Principle VI).
- **Rationale**: Determinism makes the diversity logic testable (SC-002/003/006 require observing variation across N projects) and traceable; no reliance on temperature or wall-clock randomness.

### D11 — Reference "Section 5.A" reconciliation (FR-022 / spec assumption)
- **Decision**: `COPY_SYSTEM_REFERENCE.md` §17 points to a non-existent "Section 5.A". During this PR, reconcile by either adding a "Section 5.A — Carousel middle-slide plan" that mirrors the spec-001 contract, or correcting §17 to point at Section 6 + the spec-001 contract path. Document the chosen fix in the PR.
- **Rationale**: Keeps the authoritative reference internally consistent and satisfies the same-PR sync rule.

## Open risks (carried to tasks)

- **R1**: `App.tsx` hook-card rendering is a large inline block (~L6420-6683) shared by single and carousel modes — 23.A edits must keep both modes working and preserve existing Approve/Edit/AI Edit/Batch keyed-by-variant logic.
- **R2**: New dimensions added to reach 6–8 per angle must pass the existing `ANGLE_HARD_RULES` checkable element for that angle (e.g., statistics must contain a number) — author them to satisfy the rule.
- **R3**: Backend "same angle + dedupe against full set" for variations must reuse the existing carousel refinement prompt pattern and `validateCanonicalHooks`, extended to the single-hook `'refresh'` path so 23.A variations meet FR-008/FR-010 on both paths.
