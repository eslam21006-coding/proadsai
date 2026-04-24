# Implementation Plan: HOTFIX-D — Multi-Logo Upload (Box B → Max 5)

**Branch**: `953-hotfix-multi-logo` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/953-hotfix-multi-logo/spec.md`

## Summary

Lift Box B (brand-assets) from a hard-coded cap of 1 to the schema-intended cap of 5, end-to-end. The runtime today silently truncates `brandLogos` via `.slice(0, 1)` in **8 runtime sites** — 7 client-side (1 `InputForm.tsx` parse, 4 `App.tsx` cleanInputs builders, 2 `geminiService.ts` sanitizers) plus 1 backend (`generators.ts:4192`) — while the TypeScript schema already says `brandLogos?: string[]` with the comment "Box B (Max 5)" (this type comment is accurate and not counted as a runtime site). **7 prompt/rule text blocks** in `functions/src/generators.ts` also need editing: 5 hard-code the singular-logo assumption (L2406–2409 "ONLY logo allowed", L3090, L3106, L3137, L5071 "render that image once") and 2 need plural-strengthening for consistency (L2108 BRANDING fragment, L5138 carousel SAME BRAND). The UI badge "Max 1" and the singular counter label "N logo" must also be updated.

The hotfix is a behavior correction only: **no schema change, no new files, no new data structures, no new API surface**. The partial-accept overflow behavior requires a small change to the existing `handleFileUpload` / `handleDrop` branches in `InputForm.tsx` (they currently reject the entire drop when overflow would occur; the clarified spec requires accepting up to remaining capacity and surfacing a count-named message for the rejected remainder).

## Technical Context

**Language/Version**: TypeScript 5.9 (frontend), TypeScript 5.7 (functions)
**Primary Dependencies**: React 19, Zustand 4, Tailwind CSS 3, Vite 7 (frontend); Firebase Cloud Functions v2, Gemini 3.1 text+image SDK (functions)
**Storage**: No storage change. Existing `generations/{genId}` already persists `input.brandLogos` as `string[]` (base64 data URLs). Existing `users/{uid}/projects/{projectId}` saves the full `SavedProject.inputs.brandLogos` as an array.
**Testing**: `functions/src/contractFixtures.test.ts` (Vitest) for backend prompt shape assertions. Manual QA via `quickstart.md` for UI + end-to-end rendering.
**Target Platform**: Web SPA (modern browsers) + Cloud Functions v2 (Node 20).
**Project Type**: Web application — existing React/Zustand frontend + Firebase Functions backend.
**Performance Goals**: Upload path unchanged; already-compressed base64 logos (each ≤~100KB after `compressImage`). Rendering one additional logo attached as `inlineData` to the Gemini call adds ~1 input-token image; five logos adds ~5 images. Within Gemini 3.1's per-request image-budget (tested as tolerant up to 10+ images). No new latency targets.
**Constraints**: Hotfix must be backward-compatible with pre-hotfix saved projects; no new feature flag; no migration; no UI-library additions. Must work for both Arabic and English ads (Arabic prompt scaffolding in `generators.ts:3090`, `:3106`, `:3137` must also get multi-logo phrasing).
**Scale/Scope**: 11 touchpoints + 5 prompt blocks + 2 UI labels + 1 upload-handler behavior change. Total estimated diff footprint: ~30 lines code + ~15 lines prompt text.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against `.specify/memory/constitution.md` (v1.1.0, ratified 2026-03-30).

| # | Principle | Status | Notes |
|---|---|---|---|
| I | Reliability Over Feature Count | PASS | Hotfix removes a silent-truncation defect. It narrows the gap between stated schema (Max 5) and runtime behavior (Max 1). No feature added. |
| II | Selected Mode MUST Be Obeyed | PASS | The current runtime violates this principle: user uploads 3 logos, system silently obeys a phantom "Max 1" rule and drops 2. This hotfix restores obedience to user intent. |
| III | Launch Surface Frozen and Authoritative | PASS | LAUNCH_MATRIX.md §HOTFIX-D explicitly approves this change with "no dependency — apply any time." Within approved launch scope. |
| IV | Behavior Contracts Beat Subjective Judgment | PASS | Spec defines required inputs (1–5 logos), required visible output (every uploaded logo as distinct element), blocked behavior (no invented logos, no hierarchy), and fail conditions (silent truncation, overflow rejection of whole drop). Contract fixtures planned in Phase 1. |
| V | Arabic Quality Is First-Class | PASS | Arabic branding-logic phrases in `generators.ts:3090`, `:3106`, `:3137` are explicitly in-scope for plural rewrite. `ARABIC_WARDROBE_BLOCK` injection path is untouched. No Arabic quality regression. |
| VI | Hidden Machine Layers MUST Be Auditable | PASS | The sanitizer truncations were themselves silent overrides (defect per this principle). Post-hotfix, the frontend sanitizer is a pass-through; the backend defence-in-depth clip (for non-UI-originated inputs only) emits a structured `console.warn` with shape `{event:'brandLogos_truncated', received, keptCount, userId}`, making the only remaining override auditable. Overflow rejection in the upload handler surfaces a user-visible error message naming the count ignored. |
| VII | No Silent Override Without Rule, Signal, Trace | PASS | Old behavior violated this (silent truncation). New behavior: UI path surfaces a count-naming error (signal); non-UI bypass path emits a structured `console.warn` line at the backend sanitizer (trace). Both paths share the same explicit product rule (Max 5). All three legs satisfied. |
| VIII | Cost Discipline | PASS | Sending up to 5 inlineData images vs 1 adds modest input-token cost (~4× on image-input portion only, not text-generation cost). The change is tied to explicit user uploads — no batch amplification, no retry amplification. Cost delta scales with user intent, not with system overhead. |
| IX | Proof Required for Every Claimed Fix | PASS | Phase 1 produces `contracts/` fixture specs + `quickstart.md` manual-QA steps. Before/after evidence planned as: (a) fixture assertion that `boxB` array length equals upload count, (b) manual render of a 3-logo ad showing all three distinct marks. |
| X | Spec Before Code | PASS | spec.md + clarifications complete. Plan follows. No implementation started. |
| XI | Frontend and Backend MUST Agree on Truth | PASS | The hotfix enforces the same cap (5) on both sides: frontend upload handler (hard limit at 5, partial-accept overflow) and backend sanitizer (`boxB = (inputs.brandLogos || []).slice(0, 5)`). Both layers reject invalid counts. |
| XII | Deferred Scope MUST Remain Deferred | PASS | HOTFIX-E (deterministic logo compositing) is explicitly out of scope per spec. Spec Out-of-Scope section also defers: reorder controls, "mark primary" picker, per-logo placement zone UI, file size cap changes, non-image brand assets. |

**Operating-rule spot-checks:**
- *Launch Authority*: LAUNCH_MATRIX.md HOTFIX-D is the launch-authoritative contract for this change; the spec maps 1:1 to its table rows.
- *Validation Rule*: Contract fixtures + manual QA cover the lanes that involve logos (carousel, batch, single).
- *Language Rule*: Arabic branding prompt text is in-scope.
- *Debugging Rule*: Resolution-trace impact is nil (no new resolver); upload-handler error message is self-documenting.

**Gate result (pre-design)**: **PASS** — no violations, no complexity-tracking entries needed.

### Post-design re-evaluation (after Phase 0 + Phase 1)

Re-checked after `research.md`, `data-model.md`, `contracts/*.md`, and `quickstart.md` were produced. No principle changes status.

| # | Principle | Status | Post-design note |
|---|---|---|---|
| I | Reliability Over Feature Count | PASS | No new feature introduced by Phase 1. Research confirmed the change is purely behavior correction + prompt rewrite. |
| II | Selected Mode MUST Be Obeyed | PASS | Contracts explicitly define the expected behavior for single, carousel, and batch modes. |
| III | Launch Surface Frozen | PASS | All artifacts stay within LAUNCH_MATRIX §HOTFIX-D scope. HOTFIX-E concerns explicitly deferred in generator.md §5 (Non-goals). |
| IV | Behavior Contracts | PASS — reinforced | 5 fixture specs (HFD.T1–T5) formalize the pass/fail rules per the spec's 17 functional requirements. |
| V | Arabic Quality | PASS — reinforced | `contracts/generator.md` §2.3–2.4 and `quickstart.md` S7 explicitly cover Arabic branding prompt text. Fixture HFD.T5 asserts the Arabic equal-peer phrase is present and the singular phrase is absent. |
| VI | Auditable Machine Layers | PASS | Sanitizer becomes pass-through for valid inputs; overflow is user-signalled, not silent. |
| VII | No Silent Override | PASS | Overflow rejection surfaces `rejectedCount` to user (UI path). Defence-in-depth truncation at the backend sanitizer emits `console.warn` with a structured event payload (trace); fires only for non-UI-originated inputs. Fixture HFD.T4 asserts the warn line. |
| VIII | Cost Discipline | PASS | Research R4 confirms no batch/retry amplification; image-input cost scales 1:1 with user uploads. |
| IX | Proof Required | PASS — reinforced | `quickstart.md` defines 10 manual QA steps with explicit pass/fail assertions. Exit criteria include grep-verifiable post-conditions. |
| X | Spec Before Code | PASS | Implementation not yet started. Plan + research + contracts + quickstart all precede `/speckit.tasks`. |
| XI | Frontend/Backend Agreement | PASS — reinforced | `contracts/sanitizer.md` rule 1 makes the shared cap value explicit. `contracts/input-form.md` and `contracts/generator.md` both assert cap=5 as the enforced invariant. |
| XII | Deferred Scope MUST Remain Deferred | PASS | `contracts/generator.md` §5 enumerates the HOTFIX-E items that are explicitly excluded from this hotfix. `data-model.md` Non-goals restates them. |

**Gate result (post-design)**: **PASS** — all 12 principles cleared twice; no complexity-tracking entries required. Ready for `/speckit.tasks`.

## Project Structure

### Documentation (this feature)

```text
specs/953-hotfix-multi-logo/
├── plan.md              # This file
├── research.md          # Phase 0 output — decision log for each touchpoint
├── data-model.md        # Phase 1 — Brand Logo Set entity contract
├── quickstart.md        # Phase 1 — manual QA walkthrough
├── contracts/
│   ├── input-form.md    # UI contract: upload, preview, overflow, badge labels
│   ├── sanitizer.md     # Client-side sanitizer contract (geminiService + App cleanInputs)
│   └── generator.md     # Backend prompt-shape contract (generators.ts)
└── tasks.md             # (Generated by /speckit.tasks — not created here)
```

### Source Code (repository root)

Web-app layout already established by the project (frontend `src/` + functions `functions/src/`). No new files. All changes are surgical edits to existing files:

```text
src/
├── types.ts                                # (comment-only; no change if already "Max 5")
├── components/
│   └── InputForm.tsx                       # L315 parse slice; L2272 badge plural; L2297 Max 1→5; L840–846 + L954–960 partial-accept
├── services/
│   └── geminiService.ts                    # L51, L263 slice(0,1) → slice(0,5)
└── App.tsx                                 # L2100, L3624, L3646, L5530 slice(0,1) → slice(0,5)
                                            #  L3253 intentionally empty — LEAVE UNCHANGED (concept-gen doesn't need logo pixels)

functions/src/
└── generators.ts                           # L2108 (plural phrasing); L2407–2409 (rewrite rule);
                                            # L3090, L3106, L3137 (AR/EN branding_logic plural);
                                            # L3473 (no change — already plural);
                                            # L4192 slice(0,1) → slice(0,5);
                                            # L5071 LOGO STRICTNESS multi-logo rewrite;
                                            # L5138 carousel "same logo placement" → "same logo placements";
                                            # L5244 boxB.forEach (no code change; benefits from expanded boxB)
└── contractFixtures.test.ts                # Add 5 HFD fixtures T1–T5 (see contracts/generator.md §4)
```

**Structure Decision**: Existing web-app structure (React frontend + Firebase Functions backend). No new directories, no new packages, no new modules. The hotfix is localized to 4 source files + 1 test file.

## Complexity Tracking

No Constitution-Check violations. No complexity-tracking entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)* | *(none)* | *(none)* |
