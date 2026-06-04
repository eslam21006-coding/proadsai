# Implementation Plan: OpenAI gpt-image-2 + Native Text Rendering

**Branch**: `openai-image-swap` (spec dir `specs/025-openai-image-swap/`) | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/025-openai-image-swap/spec.md`

## Summary

Swap the visual image engine from Gemini (`gemini-3.1-flash-image`) to OpenAI **gpt-image-2**, gated behind a single `MODEL_PROVIDER` flag, so each ad's text is rendered natively by the image model with free-form, design-appropriate placement instead of via a rigid prompt contract. The swap must be fully reversible (flip the flag) and must not regress any preserved creative guarantee (face identity, cultural compliance, brand color, logo, layout zones, gaze, creative modes, carousel anchor). Copy generation, billing, Firestore, and the frontend are untouched.

**Technical approach** (corrected against the live code — see [research.md](./research.md)):
- Introduce a **model-aware routing caller**: when `MODEL_PROVIDER==='openai'`, route only `model===VISUAL_MODEL` calls to gpt-image-2 and keep all text/JSON calls (build-plan, Arabic-QA inspection, copy) on Gemini. (The shared `callGemini` is used for *both* visual and text — a wholesale replacement would break text generation.)
- The new `openAIImageCaller` returns the **same response shape** `createGeminiCaller` produces (`{ text?, candidates:[{ content:{ parts:[{ inlineData:{ mimeType, data } }] } }] }`, `data` = raw base64), so it is genuinely drop-in.
- Rewrite the visual prompt inside `buildFinalImagePrompt()` to a GPT-native prompt with free-form text-placement instructions, preserving every non-text rule block verbatim; the previous Gemini prompt block is commented (not deleted).
- The Sharp **Arabic text** compositing step (`compositeArabicText`) is **already absent** from the live render path — CHANGE 1 is effectively a verification + documentation task, not a code removal. `compositeUILogos` / `compositeOfferOverlay` (logo & offer overlays) remain and run model-agnostically on the output buffer.

## Technical Context

**Language/Version**: TypeScript 5.7 (Cloud Functions, Node 24)
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, `@google/genai` (existing Gemini), **`openai` npm SDK (NEW — to be added)**, Sharp ^0.33.5 (existing, logo/offer overlays only)
**Storage**: Firestore (`generations/{genId}` — additive trace field only; no schema migration). No security-rule changes.
**Testing**: `cd functions && npm test` (node test files compiled to `lib/`); manual QA quickstart (T1–T10) for visual/Arabic acceptance
**Target Platform**: Firebase Cloud Functions (europe-west1), invoked by the existing React 19 frontend (frontend unchanged)
**Project Type**: Web service (backend-only change in `functions/src/`)
**Performance Goals**: Per-image generation ≤120s (hard timeout → fail+refund, FR-021a); multi-item runs keep the existing 5-concurrent cap (FR-021b)
**Constraints**: Zero deletions (full revert via flag + uncomment, FR-022/023); no frontend, billing, or data-model change; gpt-image-2 sizes must be multiples of 16, long-to-short ratio ≤3:1, recommended ≤2K
**Scale/Scope**: Single ad, carousel (≤10 slides), batch (≤36 items), reflow, polish/edit; ~3 visual call sites in `generators.ts` + 1 in `index.ts` (polish) + testimonial mockup path

### Key code anchors (verified)

| Anchor | Location |
|--------|----------|
| `GeminiCaller` type | `functions/src/generators.ts:517` |
| `setGeminiCaller` injection | `functions/src/generators.ts:520` |
| `createGeminiCaller` factory + response normalization | `functions/src/index.ts:3869–3901` |
| `VISUAL_MODEL` constant | `index.ts:142`, `generators.ts:560` (`gemini-3.1-flash-image`) |
| Visual render call sites | `generators.ts:5899, 5999, 6132`; `index.ts:4422` (polish); `testimonialMockup.ts:51,86` |
| `buildFinalImagePrompt` | `generators.ts:4324–4460` |
| Arabic Text QA image loop | `generators.ts:5927–6000+` (Gemini text inspect + re-render) |
| `validateCopyFidelity` (build-plan, pre-render) | `buildPlanSlotMap.ts:688–732`; retry loop `generators.ts:3951–4002` |
| `openaiApiKey` secret (already defined) | `index.ts:63` |
| `generators.setOpenAIKey` (exists, unused) | `generators.ts:529–534`; called `index.ts:4237` |
| `reflowImageHandler` (receives unused `openaiApiKey`) | `reflowImage.ts:37–44`; `index.ts:4330–4338` |
| Post-render Sharp (kept) | `compositeUILogos` `generators.ts:6214,6363`; `compositeOfferOverlay` `6256,6386` |
| Sharp Arabic text (already NOT in path) | `textCompositing.ts` — imported only by tests |

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| II — Selected mode MUST be obeyed | All creative-mode / format rule blocks preserved verbatim in the GPT prompt; mode obedience unchanged | PASS |
| V — Arabic quality is first-class | Highest risk of the swap. Governed by SC-002 (≥95% QA pass) + retained Arabic Text QA image loop + explicit RTL/connected-letterform prompt rules | PASS (monitored) |
| VI — Hidden machine layers MUST be auditable | **Adds** `resolutionTrace.visualProvider` (`'openai' \| 'gemini'`, model id) so the active engine is traceable per generation | PASS (with required addition) |
| VII — No silent override without rule+signal+trace | No auto-fallback to Gemini on OpenAI failure (fail+refund, traced). Provider selection is an explicit rule (`MODEL_PROVIDER`) | PASS |
| VIII — Cost discipline | 120s timeout caps stuck spend; 5-concurrent cap unchanged; no extra retry loops added; gpt-image-2 ≈ flat per-image cost | PASS |
| IX — Proof required for every fix | Brief premises corrected with grep/read evidence (Sharp path dead; shared caller) recorded in research.md | PASS |
| X — Spec before code | spec.md + clarifications complete | PASS |
| XI — Frontend/backend agree | Backend-only; no new selectable launch state exposed; frontend untouched | PASS |

**Constitution-driven addition beyond the brief**: `resolutionTrace.visualProvider` (Principle VI). No violations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/025-openai-image-swap/
├── spec.md              # Complete (with Clarifications)
├── plan.md              # This file
├── research.md          # Phase 0 — decisions + brief corrections
├── data-model.md        # Phase 1 — trace field + caller I/O shapes
├── contracts/
│   └── openai-image-caller.md   # Phase 1 — caller interface + routing contract
├── quickstart.md        # Phase 1 — T1–T10 acceptance walkthrough
└── tasks.md             # Phase 2 (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
functions/src/
├── modelConfig.ts          # NEW — MODEL_PROVIDER, OPENAI_VISUAL_MODEL, size map
├── openAIImageCaller.ts    # NEW — createOpenAIImageCaller(apiKey): GeminiCaller (drop-in)
├── generators.ts           # EDIT — GPT prompt block (comment old), provider-gate copy-fidelity retry, add trace
├── index.ts                # EDIT — model-routing caller injection in visual-capable callables; wire existing OPENAI_API_KEY secret
├── reflowImage.ts          # EDIT (minimal) — pass routing caller through (already receives openaiApiKey)
├── textCompositing.ts      # UNCHANGED — already out of live path (CHANGE 1 verified, not removed)
├── buildPlanSlotMap.ts     # UNCHANGED — validateCopyFidelity left intact; gated at call site only
└── package.json            # EDIT — add "openai" dependency
```

**Structure Decision**: Single backend module set inside `functions/src/`. Two new files (`modelConfig.ts`, `openAIImageCaller.ts`) plus targeted edits to `generators.ts` and `index.ts`. No new top-level project; no frontend changes. The routing caller is injected at the existing `setGeminiCaller` sites so all `VISUAL_MODEL` calls (single, carousel, batch, reflow, polish) are covered without touching each render site.

## Complexity Tracking

*No constitution violations require justification. The one notable design deviation from the literal brief (model-aware routing instead of wholesale caller replacement) reduces risk rather than adding complexity, and is documented in research.md (Decision D1).*
