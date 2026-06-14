# Quickstart & Acceptance: OpenAI gpt-image-2 + Native Text Rendering

**Date**: 2026-06-04 | **Feature**: `025-openai-image-swap`

## Setup

1. `cd functions && npm install` (installs the newly added `openai` package).
2. Set the secret: `firebase functions:secrets:set OPENAI_API_KEY` (coexists with `GEMINI_API_KEY`).
3. Confirm `functions/src/modelConfig.ts` → `MODEL_PROVIDER = 'openai'`.
4. Build: `cd functions && npm run build`. Run unit tests: `npm test`.
5. Deploy or run emulator: `npm run serve`.

## Acceptance walkthrough (maps to spec User Stories + the brief's T1–T10)

| # | Test | Steps | Pass criteria | Spec ref |
|---|------|-------|---------------|----------|
| T1 | Arabic ad w/ hero | Generate an Arabic offer with a hero ref photo | Arabic copy is RTL, fully connected (no broken letters, no Latin); hero face matches; placement differs from other concepts | US1, SC-001/002, FR-008 |
| T2 | Arabic ad, no hero | Generate Arabic offer, no hero | Copy integrated naturally into design (not a fixed stamped zone) | US1 |
| T3 | English ad | Generate English offer, 3 concepts | Text placement varies across concepts | US1, SC-001 |
| T4 | Layout variety | 3 concepts, same offer | All 3 have visibly different text layouts (0/3 identical skeleton) | SC-001 |
| T5 | Event ticket mode | Generate `event_ticket` mode | Ticket shape renders with correct copy inside it | US2, FR-014 |
| T6 | Carousel 5 slides | Generate 5-slide carousel | Each slide unique text placement; same hero across all slides | US3, SC-005 |
| T7 | Reflow 1:1 → 9:16 | Reflow a generated 1:1 ad to 9:16 | Same hero; recomposed; size routes to `1024x1792` | US3, FR-016/017 |
| T8 | Polish edit | Apply a Polish edit instruction | Edit applied to the full image | US3 |
| T9 | Batch 4 items | Generate 4-item batch | All 4 produced, different layouts; 5-concurrent cap respected | US3, FR-021b |
| T10 | REVERT | Set `MODEL_PROVIDER='gemini'`, rebuild | Gemini path renders correctly; no broken imports; `compositeArabicText` uncomment is a no-op (already absent) | US4, SC-006/008, FR-022 |

## Cross-cutting checks

- **Preserved guarantees (US2 / SC-004)**: in T1/T5/T6 confirm cultural compliance (Arabic
  wardrobe, no haram motifs), brand-color enforcement, logo placement, gaze, and hero
  identity all behave as before the swap.
- **Audit trace (Principle VI)**: each generation's Firestore doc has
  `resolutionTrace.visualProvider = { provider:'openai', model:'gpt-image-2', size, usedReferenceEdit, ... }`.
- **Error handling (SC-007)**: simulate an OpenAI failure (bad key / forced 429 / >120s) →
  user sees a generation failure, credit is refunded, pipeline does not crash. In a batch,
  one failed item does not abort siblings.
- **Text-call safety (research D1)**: confirm copy/build-plan generation still works on the
  OpenAI path (proves text calls were NOT routed to the image model).
- **No deletions (SC-008)**: `git diff` shows the previous Gemini prompt block commented,
  not removed; `textCompositing.ts` unchanged.

## Arabic QA acceptance (SC-002)

Sample ≥20 Arabic generations across hero/no-hero/modes/carousel. **≥95%** must have correct
RTL connected Arabic with no Latin substitution. Below 95% → tune the GPT prompt's Arabic
block before sign-off (do not relax the bar).
