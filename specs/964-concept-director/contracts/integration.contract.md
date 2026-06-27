# Contract C — Pipeline integration (`index.ts` + `generators.ts` + config helper)

Orchestration lives where `uid` and the Gemini caller already exist. The pure modules (A, B) are invoked from here.

## C1 — Gate (in `serverGenerateConcepts`, index.ts)

The stage runs **iff all** hold:
1. `mode === 'initial'` (not refresh/precision/edit).
2. The call is `serverGenerateConcepts` (revised 2026-06-27, C1) — this serves both single-ad and batch-per-hook, so condition 1 (`mode === 'initial'`) is the only flow gate needed here. *(Carousel uses separate callables — `serverGenerateCarouselAngles` / `serverGenerateCarouselSlideCopies` — and never reaches this loop, so it needs no explicit check.)*
3. Per-user flag `users/{uid}.conceptDirectorEnabled === true` (absent ⇒ false).
4. Global kill switch `conceptDirectorKillSwitch !== true`.

- **C1.1**: If any condition fails, **no Director call is made**; `generateConcepts` is invoked exactly as today; trace records `ran:false` with a `reason`.
- **C1.2**: The gate is evaluated **once** and the decision held for the whole generation (FR-021).

## C2 — Flag & kill-switch reads (config helper)

- **C2.1 (flag)**: Read `conceptDirectorEnabled` from the user doc (reuse an already-loaded snapshot where possible). Absent/non-boolean ⇒ `false`.
- **C2.2 (kill switch)**: Read Remote Config `conceptDirectorKillSwitch`, cached in-process for **60s**. A flip takes effect for new generations within 60s (SC-006), without a deploy.
- **C2.3 (config read failure is safe)**: If the kill-switch read throws, serve the cached value; if no cache exists yet, treat as **not killed** but rely on the whole stage being fail-open. A config error never propagates to the user.

## C3 — Director loop (sequential, in the callable)

- **C3.1**: For `conceptIndex` 0→1→2, call `directConcept(input, callModel, 15000)` where `callModel` wraps the already-set Gemini caller. Each call's `siblingConcepts` = the accepted briefs produced so far.
- **C3.2**: Collect 3 results (`ConceptBrief | ConceptDirectorFallback`).
- **C3.3 (isolation)**: A fallback for one concept does not abort the loop; the other concepts still produce briefs.

## C4 — Validate + retry (≤1 per concept)

- **C4.1**: Call `validateBatchVariance(results, 'balanced')`.
- **C4.2**: If `passed === false` and no retry has happened for an offending concept, re-run `directConcept` for that concept with the duplicated tokens added to `avoidTokens`; mark that concept retried.
- **C4.3**: Re-validate once. If still failing, **ship as-is**; never a second retry; `varianceAchieved:false`.
- **C4.4**: The retry ceiling is **1 per concept**, enforced by a per-concept guard (SC-005).
- **C4.5**: The validator/retry never blocks or errors the generation (FR-016).

## C5 — Enrichment into `generateConcepts` (generators.ts)

- **C5.1**: `generateConcepts(...)` gains a new **optional** parameter carrying the 3 (possibly mixed brief/fallback) results. When absent ⇒ today's behavior, byte-for-byte.
- **C5.2**: When present, `buildConceptEnrichmentBlock(results)` output is injected into the existing `[VISUAL ARCHITECT V5.0]` prompt at the concept-architecting point — informing scene (visualMetaphor), composition (layoutArchetype), the FORBIDDEN block (propsForbidden), and hero gaze/pose — **without removing** the existing positive-layout / anti-robotic / costume / contrast rules (they remain the fallback for fallback slots and the substrate the enrichment refines).
- **C5.3**: The user's inviolable choices and all existing sub-style/universe/mode contracts continue to apply and outrank the enrichment (FR-008, Principle II).
- **C5.4 (quick-reject whitelist)**: `quickRejectCheck` / `validateBlueprintMinimalStyle` become aware of each concept's `headlineArchitecture` so novel shapes (manifesto, oversized_question, numerical_anchor, …) are not rejected as broken (FR-019). Genuine malformed-output checks remain.

## C6 — Credit & error semantics (unchanged)

- **C6.1**: Credits are deducted/refunded exactly as today; the Director adds no new deduction and no new refund path. A Director fallback is invisible to billing (FR-011).
- **C6.2**: Existing failure classification / refund-on-hard-failure for `serverGenerateConcepts` is unchanged. The Director never converts a success into a user-facing failure.

## C7 — Reversibility

- **C7.1**: Setting the flag off for all users (default) fully disables the feature with no code change.
- **C7.2**: The kill switch disables it globally within 60s.
- **C7.3**: Code-level revert = remove the C5.2 enrichment injection line + the C3/C4 loop; the pure modules become dead code with zero runtime effect. No data migration needed (trace field is optional).
