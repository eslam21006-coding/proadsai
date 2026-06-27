# Phase 0 Research — Concept Director (Phase 20, Option A)

All NEEDS CLARIFICATION items from the spec's clarification round are already resolved (scope, timeout, marker-match). This document records the remaining design decisions the implementation hinges on, each as Decision / Rationale / Alternatives.

---

## D1 — Model for the Concept Director

**Decision**: Reuse the existing Gemini text caller already injected into `generators.ts` via `setGeminiCaller(createGeminiCaller(geminiApiKey.value()))`. The Director makes a structured-reasoning **text/JSON** call (no image). No new SDK, no new API key, no new external integration.

**Rationale**: Founder decision #2 — "use whatever model is currently available… use the same model infrastructure that already exists. Do NOT add a new API integration." The codebase routes all text/JSON reasoning (TOV, concepts, copy scoring) through the Gemini caller; the OpenAI provider is image-only (`MODEL_PROVIDER`, `openAIImageCaller.ts`). The Director is reasoning, so it belongs on the Gemini text path. The LAUNCH_MATRIX's "GPT-5" is aspirational; this build maps it to the existing text model.

**Alternatives considered**:
- New OpenAI GPT text integration — rejected: violates "no new API integration," adds keys/secrets/cost surface.
- Routing through the image provider — rejected: wrong modality.

---

## D2 — Where the Director loop + flag/kill-switch live (orchestration boundary)

**Decision**: Run the flag read, kill-switch read, the 3× sequential Director calls, the Variance Validator, and the ≤1 retry **in `serverGenerateConcepts` (index.ts)**, then pass the three validated briefs into `generators.generateConcepts(...)` as a new **optional** parameter. `generateConcepts` consumes the briefs to enrich its existing `[VISUAL ARCHITECT V5.0]` prompt; when briefs are absent (flag off, kill switch on, non-initial mode, or fallback), it runs exactly as today.

**Rationale**:
- `request.auth.uid` is available in the callable but **not** inside `generateConcepts` — the per-user flag needs `uid`.
- The Gemini caller is already set on the `generators` singleton before `generateConcepts` runs, so the Director module can borrow the same caller (passed in as a function argument to keep `conceptDirector.ts` pure/side-effect-free).
- "No new Firebase callable" (founder constraint) is honored — this is all inside the existing `serverGenerateConcepts` flow.
- Keeps `conceptDirector.ts` and `varianceValidator.ts` pure (no Firebase/Gemini imports), matching the established mapper pattern and making them unit-testable without mocks of Firestore/Remote Config.

**Alternatives considered**:
- Passing `uid` down into `generateConcepts` and running the loop there — rejected: `generateConcepts` is also called for `refresh`/`precision`/edit paths and from other call sites; concentrating the gate in the callable keeps the `mode === 'initial'` scope crisp (single-ad + batch-per-hook; carousel excluded — D10) and avoids threading `uid` through a large function.
- A brand-new callable for the Director — rejected by founder constraint (no new callable).

**Note on single-call reality**: Today `generateConcepts` emits **all three** concepts from **one** Gemini call (the prompt asks for "3 UNIQUE VISUAL BLUEPRINTS"). The Director does **not** change that final call's 1-call shape; it produces three **briefs** beforehand and injects them as three labeled concept directives into that one prompt. So the pipeline becomes: 3 Director calls (sequential) → validate → 1 enriched Visual Architect call. This preserves the existing render contract while making the three blueprints diverge by construction.

---

## D3 — Per-user feature flag storage

**Decision**: A boolean field `conceptDirectorEnabled` on `users/{uid}`, default treated as `false` when absent. Read from the user doc the callable already loads (or a single additional `get()` if not otherwise loaded), so no extra steady-state cost for the common (flag-off) path beyond one cached doc read.

**Rationale**: Matches 20.D.5 verbatim and the existing pattern of per-user booleans on the user doc (entitlements, billing flags). Additive; legacy users without the field are correctly treated as disabled. No migration.

**Alternatives considered**:
- Custom auth claims — rejected: heavier to flip per-user, requires token refresh, worse for quick A/B toggling.
- Remote Config per-user — Remote Config is global/conditional, not a clean per-user store.

---

## D4 — Global kill switch mechanism

**Decision**: Firebase Remote Config server parameter `conceptDirectorKillSwitch: boolean`, read via the Admin SDK server template at generation start, cached in-process for **60 seconds**. When `true`, the stage is skipped for everyone regardless of the per-user flag. On any error reading Remote Config, treat the switch as **off** for the read but never let it throw into the generation path (fail-open: if the config read fails, default to the safe path — and because the whole stage is itself fail-open, a failed read at worst falls back to existing behavior).

**Rationale**: 20.D.6 explicitly names a Remote Config kill switch with a 60s cache "to avoid hammering Remote Config." Remote Config flips globally without a deploy and propagates within the cache window. The 60s in-process cache satisfies SC-006 (≤60s to take effect) and Principle VIII (no per-call hammering).

**Important nuance**: Founder decision #4 says the kill switch disables the stage; SC-006 says flipping it reverts users within 60s. To make "kill switch ON ⇒ everyone reverts" robust even if the config service is unreachable, the cache holds the **last known good** value and only the **first** successful read after a flip starts the 60s clock. A read failure does not silently re-enable a killed feature within a live cache window — it serves the cached value.

**PINNED (D1 remediation 2026-06-26)**: The mechanism is **fixed to Firebase Remote Config server template**. The Firestore-doc alternative below is retained ONLY as a break-glass fallback and MUST NOT be implemented unless Remote Config wiring is blocked; switching would require a one-line spec/plan/tasks update first (no silent substitution).

**Alternatives considered**:
- Firestore global config doc `app_config/conceptDirector` with a 60s cache — simpler and uses already-familiar Firestore tooling; retained as a **documented break-glass fallback only** (see PINNED note). Behaviorally equivalent (global boolean + 60s cache); if ever chosen, update D4, T021, and 20.D.6 references in the same change. Not to be built in this phase.
- No cache (read every call) — rejected: violates cost discipline, adds latency.

---

## D5 — Director output schema & hard constraints

**Decision**: `conceptDirector.ts` owns a `ConceptBrief` TypeScript interface with the full field set from spec FR-002 / LAUNCH_MATRIX 20.B.2, plus closed enum unions for the categorical fields:
- `headlineArchitecture`: `manifesto | editorial | annotated | dual_state | oversized_question | numerical_anchor | ellipsis_tease | stacked_weight` (8)
- `layoutArchetype`: `asymmetric_void | central_headroom | central_baseweight | environmental_canvas | split_dual_state | typography_dominant | editorial_columns` (7)
- `heroGazeDirection`: `toward_headline | toward_cta | direct_camera | off_frame_intentional | downward_introspective` (5)
- `heroPresence`: `present | absent | partial | multiple_subjects`
- `backgroundComplexity`: `minimal | moderate | rich`
- `logoTreatment`: `composite_post | absent_this_concept | corner_subtle`

A pure `validateBrief(brief)` enforces the hard constraints: `highlightCardinality.count ≤ 2`, `propsForbidden.length ≥ 3`, `restraintRules.length ≥ 2`, `subStyleSpecialization.inheritedFrom === user's exact subStyle`, every enum within its allowed set, and presence of the three `varianceAxes` tokens. Any failure ⇒ the concept is marked a Director failure (fallback).

**Rationale**: Closed enums let the Variance Validator and the downstream prompt switch on a fixed vocabulary; they also keep category labels in canonical English (FR-004) while free-text fields carry the user's language. Centralizing validation in the pure module keeps the orchestration thin and the rules unit-testable (FR-027b/c).

**Alternatives considered**:
- Free-text categorical fields — rejected: the validator and the quick-reject whitelist need a fixed vocabulary; free text reintroduces the convergence problem and breaks deterministic comparison.
- Zod/io-ts runtime schema lib — rejected: no such dependency in `functions`; hand-rolled guards match the existing codebase style and keep the module dependency-free.

---

## D6 — Variance Validator comparison semantics

**Decision**: Pure function `validateBatchVariance(briefs, varianceMode)` compares the three `varianceAxes` tokens (`metaphorToken`, `layoutToken`, `headlineToken`) using **normalized exact match** (lowercase + trim). Balanced-mode blocking rules (per FR-014): metaphor token equal across ≥2 of 3 → block; layout token equal across all 3 → block; headline token equal across all 3 → block. Returns `{ passed, violations: [{ axis, duplicateConceptIndices, severity }] }`. WARN-level observations are recorded, never retried. No AI; returns in <5ms.

**Rationale**: Clarification 2026-06-26 fixed normalized exact match (avoids false negatives from casing/spacing while staying deterministic). Mirrors 20.C.2 rejection table.

**Alternatives considered**: strict byte match (rejected — trivial casing differences slip through); fuzzy/semantic (rejected — nondeterministic, needs AI, contradicts FR-013).

---

## D7 — Retry orchestration & ceiling

**Decision**: When `validateBatchVariance` fails, regenerate **only the offending concept(s)** by re-calling the Director with the duplicated tokens appended to that concept's `siblingConcepts`/avoid-list. Enforce **at most one retry per concept** via a per-concept retry flag. After the retry, re-validate once; if it still fails, ship as-is and record `varianceAchieved: false`. Never a second retry; never block.

**Rationale**: FR-015/016, SC-005, Principle VIII (cost discipline). Re-running only offenders (not all three) minimizes cost. A per-concept boolean guarantees the ceiling even if multiple concepts collide.

**Alternatives considered**: regenerate the whole batch on any collision (rejected — wasteful, can ping-pong); unlimited retries until distinct (rejected — cost + latency unbounded, can block).

---

## D8 — Trace shape & write site

**Decision**: Add optional `ResolutionTrace.conceptDirector` (additive, no migration), written in the concepts flow. Shape:
```
conceptDirector?: {
  ran: boolean;                 // stage executed (flag on, kill switch off, initial mode)
  enabled: boolean;             // per-user flag value
  killSwitch: boolean;          // global kill-switch value at run time
  mode: "balanced";             // variance mode used (fixed this build)
  conceptCount: number;         // briefs attempted (e.g. 3)
  fallbackCount: number;        // concepts that fell back to existing logic
  validatorTriggered: boolean;  // a blocking violation was found
  retryCount: number;           // 0 or up to conceptCount (each ≤1)
  varianceAchieved: boolean;    // final validation passed (or no violation)
  reason?: string;              // why not ran (e.g. "flag-disabled", "kill-switch-on", "non-initial-mode")
}
```
Follows the `expressionAdaptation` / `gazeDirection` precedent: `applied/ran` boolean + explicit `reason` for the absent case, `null`/omission accepted on legacy docs.

**Rationale**: Principle VI/VII (auditable hidden layer). Additive optional field = no migration (FR-025, SC-008). The richer counters (fallbackCount, retryCount, varianceAchieved) double as the rollback signals the deferred telemetry phase will later aggregate — collected here for free without building the analytics store now (FR-026).

**Alternatives considered**: writing to a separate `pipelineTelemetry` collection now (rejected — that is the deferred 20.G.4 telemetry-collection work, explicitly out of scope); minimal boolean-only trace (rejected — loses the fallback/retry signals needed to judge rollout health).

---

## D9 — Headline-architecture-aware quick-reject (preventing false "broken" rejections)

**Decision**: Make the existing concept quick-reject / minimal-style validators in `generators.ts` aware of the chosen `headlineArchitecture` so intentionally novel shapes (manifesto, oversized_question, numerical_anchor, ellipsis_tease, etc.) are whitelisted and not flagged as malformed. Genuine malformed-output checks remain.

**Rationale**: FR-019 / 20.D.3. Without this, a one-giant-word or huge-number layout could trip "headline missing/too short" heuristics and get rejected, defeating the variety the Director introduces.

**Alternatives considered**: disabling quick-reject when Director is active (rejected — loses protection against genuinely broken output); leaving validators unchanged (rejected — causes false rejections of valid novel layouts).

---

## D10 — Scope gating (`serverGenerateConcepts` `mode === 'initial'`; revised 2026-06-27, C1)

**Decision**: The stage runs whenever `serverGenerateConcepts` is called with `mode === 'initial'`. This covers the **single-ad** flow (App.tsx:4202) AND each **batch** hook (App.tsx:7225) — both are "3 concepts for one hook" generations through the same callable with identical payloads, so the 3-sibling design fits each unchanged. **Carousel is excluded structurally** — it uses separate callables (`serverGenerateCarouselAngles` / `serverGenerateCarouselSlideCopies`, geminiService.ts:17–18) that never reach this path. `refresh` / `precision` / `editOneConcept` are excluded by the mode check (they pass no briefs and run today's logic). The gate is a simple `mode === 'initial'` condition in `serverGenerateConcepts` before the loop.

**Rationale**: `/speckit.analyze` (C1) found that the backend cannot distinguish single-ad from batch without a frontend-supplied discriminant, and frontend changes are out of scope. Rather than add a frontend signal, the founder chose (2026-06-27) to **include batch** — it is genuinely desirable (batch ads get variety too) and requires no frontend change. This supersedes the 2026-06-26 "single-ad only" clarification. Carousel staying out keeps the surface bounded.

**Alternatives considered**: keep single-ad-only via a new frontend `isBatchItem` discriminant the gate reads (rejected 2026-06-27 — violates the no-frontend-change scope for no real benefit, since batch fits the same 3-sibling model); applying to carousel too (rejected — different callables, variable slide counts, larger surface; deferred).

---

## Resolved unknowns summary

| Topic | Resolution |
|-------|-----------|
| Model | Existing Gemini text caller (D1) |
| Orchestration site | `serverGenerateConcepts` callable, briefs passed into `generateConcepts` (D2) |
| Flag | `users/{uid}.conceptDirectorEnabled`, default false (D3) |
| Kill switch | Remote Config `conceptDirectorKillSwitch`, 60s cache; Firestore-doc fallback documented (D4) |
| Schema/constraints | Pure module enums + `validateBrief` (D5) |
| Validator match | Normalized exact token match, balanced rules (D6) |
| Retry | Offenders only, ≤1 per concept, ship-as-is after (D7) |
| Trace | Additive `ResolutionTrace.conceptDirector` (D8) |
| Quick-reject | Headline-architecture-aware whitelist (D9) |
| Scope gate | `serverGenerateConcepts` `mode === 'initial'` — single-ad + batch-per-hook; carousel excluded (D10, rev. 2026-06-27) |

No NEEDS CLARIFICATION markers remain.
