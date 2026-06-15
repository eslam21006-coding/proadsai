# Implementation Plan: Phase 22 — Copy Quality Upgrade

**Branch**: `958-copy-quality` | **Date**: 2026-06-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/958-copy-quality/spec.md`

## Summary

Improve the *words* of on-creative copy (headline, subheadline, CTA, benefit, carousel slide captions) at the generation source by transcribing three product-owner quality rules — 6th-grade reading level, lived-symptom depth, soft fabrication-flag policy — plus a banned-CTA list into exported constants in `functions/src/copywriting_knowledge.ts`, and injecting them into the four live copy-generation prompt surfaces in `functions/src/generators.ts`. Two further knowledge constants (scoring rubric, rewrite diagnoses) are added now but not yet consumed. A structured `claimFlag` is added to `ResolutionTrace` (additive) so a model-emitted fabrication advisory is captured and auditable. The existing copy-fidelity contract carries the improved exact strings to the rendered image for free; no gate, design prompt, compositor, field-count, or UI change is required.

**Technical approach:** constants-first, prompt-injection-second. SYSTEM_TOV (in `promptConstants.ts`) gains the Section 18 Track-1 instruction once and propagates to all four `systemInstruction` call sites. The three rule blocks + banned-CTA guidance are injected as block-break strings into the live Step-2 hook prompt, the retargeting branch, and the carousel slide-caption prompt — mirroring the existing `CULTURAL_COMPLIANCE_BLOCK` injection pattern. The model emits a `CLAIM_FLAG:` marker which the TOV parser strips out of the four fidelity-gated fields and records into `resolutionTrace.claimFlags`.

## Technical Context

**Language/Version**: TypeScript 5.7 (Firebase Cloud Functions)
**Primary Dependencies**: Firebase Cloud Functions v2; Gemini text model (copy generation — no new model calls); existing prompt-construction modules (`generators.ts`, `copywriting_knowledge.ts`, `promptConstants.ts`)
**Storage**: Firestore `generations/{genId}.resolutionTrace` — additive `claimFlags?: ClaimFlagEntry[]` field only; no migration
**Testing**: Compiled-Node test scripts (`cd functions && npm run build && node lib/__tests__/*.test.js`); new `copyQuality.test.ts` modeled on `culturalCompliance.test.ts`, added to the `test` script chain
**Target Platform**: Node.js Firebase Functions (Linux runtime)
**Project Type**: Web app (frontend `src/` + backend `functions/`) — **this feature is backend-only** plus one additive type field
**Performance Goals**: No new model invocations; only added prompt tokens (≈4 short blocks). Generation latency change negligible (< a few hundred input tokens per call).
**Constraints**: MUST NOT break the copy-fidelity gate (`validateCopyFidelity`) — the `CLAIM_FLAG` marker must never leak into `hookText`/`subheadText`/`ctaName`/`benefitText`. MUST NOT change field count, gate, design prompt, compositor, or UI. MUST NOT relax existing hard compliance guards (numeric-fact repair, honest-degradation rules). MUST NOT override the user's literal CTA input (Principle II).
**Scale/Scope**: 6 new constants, 4 prompt-surface injections, 1 SYSTEM_TOV append, 1 additive trace field + parser capture, 1 drift-control header comment, 1 new test file. No frontend, billing, or schema migration.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevance | Status |
|---|---|---|
| I. Reliability Over Feature Count | Additive, low-risk prompt-quality change; no new modes/combos | ✅ Pass |
| II. The Selected Mode MUST Be Obeyed | Banned-CTA is **guidance for model-authored CTA wording only**; the user's literal `inputs.cta` is never overridden | ✅ Pass (design note in research.md) |
| III. Launch Surface Frozen | No new launch combinations; rides existing surfaces | ✅ Pass |
| IV. Behavior Contracts Beat Subjective Judgment | Spec has explicit FRs + acceptance scenarios; new test fixtures assert block presence + claimFlag capture + no-leak | ✅ Pass |
| V. Arabic Quality Is First-Class | `READING_LEVEL_BLOCK` carries Arabic spoken-فصحى guidance; injected on Arabic + English paths | ✅ Pass |
| VI. Hidden Machine Layers MUST Be Auditable | The soft fabrication flag is recorded in `resolutionTrace.claimFlags` (auditable), not silent | ✅ Pass |
| VII. No Silent Override Without Rule, Signal, Trace | Reading-level/lived-symptom are guidance (no override). Fabrication flag is rule-defined + traced + surfaceable. No silent rewrites. | ✅ Pass |
| VIII. Cost Discipline | No extra model calls; banned-CTA is prompt-only (no regenerate loop); no added retries | ✅ Pass |
| IX. Proof Required for Every Fix | quickstart.md + new test file provide reproducible before/after evidence | ✅ Pass |
| X. Spec Before Code | Spec + clarifications complete before this plan | ✅ Pass |
| XI. Frontend/Backend Agree | Backend-only change; frontend `copywriting_knowledge.ts` mirror untouched (new constants not consumed by UI) | ✅ Pass |
| XII. Deferred Scope Remains Deferred | Phase 23 artifacts (director, dropdowns, option/structure constants, variation/anti-sameness) explicitly excluded (FR-017); `COPY_SCORING_DIMENSIONS`/`COPY_REWRITE_DIAGNOSES` defined-but-unwired | ✅ Pass |

**Result:** No violations. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/958-copy-quality/
├── plan.md              # This file
├── research.md          # Phase 0 output — injection-point & shape decisions
├── data-model.md        # Phase 1 output — the 6 constants + ClaimFlagEntry + trace field
├── quickstart.md        # Phase 1 output — how to verify
├── contracts/
│   └── copy-quality-constants.md   # Exported-constant + trace-field contract
├── checklists/
│   └── requirements.md  # From /speckit.specify
└── tasks.md             # /speckit.tasks output (NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── copywriting_knowledge.ts      # ADD: drift header comment + 6 new exported constants
├── promptConstants.ts            # EDIT: append Section-18 Track-1 instruction to SYSTEM_TOV
├── generators.ts                 # EDIT: inject 3 blocks + banned-CTA guidance into 4 surfaces;
│                                  #       capture CLAIM_FLAG in TOV parser → resolutionTrace
├── types.ts                      # ADD: ClaimFlagEntry interface + ResolutionTrace.claimFlags?
└── __tests__/
    └── copyQuality.test.ts       # NEW: asserts constants exist, blocks injected, claimFlag
                                   #      captured, no marker leak into the 4 fields

# UNTOUCHED (in scope-exclusion):
src/copywriting_knowledge.ts      # frontend mirror — not consumed by UI for these constants
src/ (all frontend)               # no UI work this phase
functions/src/textCompositing.ts  # compositor unchanged
functions/src/captionValidator.ts # hard numeric-fact guard unchanged (FR-004a)
functions/src/knowledge/hookAnglesKnowledge.ts # honest-degradation rules unchanged (FR-004a)
```

**Structure Decision**: Web app with a Firebase Functions backend. All Phase 22 work lands in `functions/src/`. The four prompt surfaces named in the spec map to concrete code locations (see research.md): SYSTEM_TOV (`promptConstants.ts`), the live Step-2 hook prompt and retargeting branch (`generators.ts`), and the carousel slide-caption prompt (`generators.ts`). The `HOOK_GENERATION_RULES`/`RETARGETING_RULES` *constants* are imported-but-dead; wiring targets the live prompt strings, not those constants.

## Complexity Tracking

> No Constitution violations — section intentionally empty.
