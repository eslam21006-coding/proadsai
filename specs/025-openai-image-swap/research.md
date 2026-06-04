# Phase 0 Research: OpenAI gpt-image-2 + Native Text Rendering

**Date**: 2026-06-04 | **Feature**: `025-openai-image-swap`

This document resolves every unknown in the plan's Technical Context and records the
points where the original phase brief diverges from the **current** state of the code.
Per Constitution Principle IX (proof required), each correction cites the controlling
file and line.

---

## D1 — Visual swap via a MODEL-AWARE ROUTING caller (NOT a wholesale caller replacement)

- **Decision**: When `MODEL_PROVIDER === 'openai'`, inject a `GeminiCaller` that routes
  calls by their `model` parameter: `model === VISUAL_MODEL` → gpt-image-2; everything
  else → Gemini. Inject this routing caller at the existing `setGeminiCaller(...)` sites
  for visual-capable callables.
- **Rationale**: The single module-level `callGemini` in `generators.ts` is shared by
  **both** the visual render *and* text/JSON work — build-plan generation, the Arabic
  Text QA image inspection (`generators.ts:5934`, `model: LOGIC_MODEL`), and copy steps.
  The brief's CHANGE 5 ("`'openai' → createOpenAIImageCaller(...)`") read literally would
  send those text calls to an image-only model and break generation. Routing by `model`
  keeps text on Gemini and only the image render on OpenAI.
- **Evidence**: `GeminiCaller` type `generators.ts:517`; shared injection
  `generators.ts:520`; visual render `generators.ts:5899` (`model: VISUAL_MODEL`); text
  inspection on the *same* caller `generators.ts:5934` (`model: LOGIC_MODEL`).
- **Coverage**: All three `generators.ts` visual sites (`5899, 5999, 6132`) flow through
  `callGemini` with `model: VISUAL_MODEL`, so one routing caller covers single + carousel
  + batch + reflow + the in-pipeline Arabic re-render. The polish/edit callable in
  `index.ts:4422` and `testimonialMockup.ts` (`51, 86`) also use `VISUAL_MODEL` and must
  receive the routing caller too.
- **Alternatives considered**: (a) Add a separate `setVisualCaller`/`callVisualModel`
  used only at visual sites — cleaner separation but touches more call sites and risks
  missing one. (b) Wholesale replace `callGemini` — rejected: breaks text generation.

## D2 — CHANGE 1 (comment out Sharp Arabic text compositing) is ALREADY satisfied

- **Decision**: Treat CHANGE 1 as **verify-and-document**, not code removal. Leave
  `textCompositing.ts` untouched. Leave `compositeUILogos` and `compositeOfferOverlay`
  (logo + offer overlays) running — they are text-independent Sharp steps on the output
  buffer and are model-agnostic.
- **Rationale / Evidence**: `generators.ts` imports only `compositeOfferOverlay`
  (`generators.ts:23`) and `compositeUILogos` (`generators.ts:59`). It does **not** import
  or call `compositeArabicText` / `compositeFullAdText`. The only references to
  `compositeArabicText` are inside `textCompositing.ts` itself and `contractFixtures.test.ts`.
  So the "Sharp composites Arabic text in fixed zones in the main path" premise is
  outdated — that step was removed in an earlier phase, and Gemini already renders text
  natively in-image (see the live response parse at `generators.ts:5914–5919` and the
  in-prompt "CRITICAL TEXT RENDERING RULES").
- **Implication**: The lever that makes "every ad look structurally identical" is the
  **rigid prompt contract** in `buildFinalImagePrompt`, not a Sharp step. CHANGE 2 (the
  GPT-native free-form text-placement prompt) is therefore the real driver of layout
  variety. `textCompositing.ts` is left intact because tests import it and it imports
  `getSafeZoneForRatio` from `layoutContract.js` (reflow safe-zone validation lives there).
- **Alternatives considered**: Comment out `textCompositing.ts` — rejected: it's already
  inert in production, and tests + the safe-zone import chain still reference it.

## D3 — Aspect-ratio → gpt-image-2 size mapping (resolves spec FR-017)

- **Decision**: gpt-image-2 supports native portrait/landscape plus custom sizes, so map
  each app ratio to an exact (or nearest-valid) size, staying ≤2K to avoid the
  documented experimental zone, with both edges multiples of 16 and long:short ≤ 3:1.

  | App aspect | gpt-image-2 `size` | Note |
  |-----------|--------------------|------|
  | `1:1`  | `1024x1024` | exact |
  | `4:5`  | `1024x1280` | exact 4:5, both ÷16 |
  | `3:4`  | `1024x1360`* | nearest ÷16 to 3:4 (1365 → 1360) |
  | `9:16` | `1024x1792` | nearest ÷16 to 9:16 (matches brief assumption) |
  | `4:3`  | `1360x1024`* | nearest ÷16 to 4:3 |
  | `16:9` | `1792x1024` | nearest ÷16 to 16:9 |

  \*Exact pixel values to be confirmed against the live gpt-image-2 `size` validator at
  implementation; the rule (÷16, ratio ≤3:1, ≤2K) is fixed.
- **Rationale**: gpt-image-2 (released April 2026) accepts `1024x1024`, `1536x1024`,
  `1024x1536`, `2048x*`, custom dims (longest edge ≤3840, edges ÷16, ratio ≤3:1, total px
  655,360–8,294,400), and `auto`. Unlike gpt-image-1 (fixed 2:3/3:2 only), true 9:16 and
  16:9 are supported, so no app ratio needs awkward letterboxing.
- **Alternatives considered**: Use `size:"auto"` and let the model pick — rejected:
  reflow safe-zone math and layout contracts depend on a known output ratio.
- **Sources**: [GPT Image 2 model | OpenAI API](https://developers.openai.com/api/docs/models/gpt-image-2), [GPT Image 2 Supported Sizes (YingTu)](https://yingtu.ai/en/blog/gpt-image-2-4k-image-generation), [Image generation guide | OpenAI](https://developers.openai.com/api/docs/guides/image-generation)

## D4 — OpenAI SDK dependency (CHANGE 4)

- **Decision**: Add the official `openai` npm package to `functions/package.json` and use
  `client.images.generate(...)` / `client.images.edit(...)`.
- **Rationale**: The brief references `images.edit()` / `images.generate()`. The `openai`
  package is **not** currently a dependency (`functions/package.json` has only
  `@google/genai`, `@google/generative-ai`, `firebase-admin`, `firebase-functions`,
  `sharp`, `stripe`). The edit endpoint needs multipart file upload, which the SDK handles
  cleanly. Existing OpenAI **OCR** usage (`index.ts:4732+`) uses raw `fetch` to
  chat/completions — viable but more error-prone for image multipart.
- **Alternatives considered**: Raw `fetch` to `/v1/images/{generations,edits}` (no new
  dep, consistent with OCR) — acceptable fallback if dependency policy forbids the SDK;
  recorded as the secondary option.

## D5 — Response-shape contract (true drop-in)

- **Decision**: `createOpenAIImageCaller(apiKey)` returns a function that produces the
  **same object shape** `createGeminiCaller` returns:
  `{ text?: string, candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: <RAW base64, no data: prefix> } }] } }] }`.
- **Rationale**: Downstream code at `generators.ts:5914–5919` iterates
  `response.candidates[].content.parts[].inlineData.data` and itself prepends
  `data:image/png;base64,`. The brief's "return a data URL string" is imprecise — the
  caller must return the candidates structure with **raw** base64 in `inlineData.data`
  (the OpenAI `data[0].b64_json` value, unprefixed) for zero downstream changes.
- **Evidence**: normalization in `createGeminiCaller` `index.ts:3881–3899`; consumption
  `generators.ts:5914–5919`.

## D6 — Existing partial scaffolding to reuse (CHANGE 6 mostly done)

- **Finding**: `defineSecret("OPENAI_API_KEY")` already exists (`index.ts:63`);
  `serverGenerateFinalAd` and `reflowImage` already declare `secrets:[geminiApiKey, openaiApiKey]`
  (`index.ts:4215, 4332`); `generators.setOpenAIKey()` exists but is unused
  (`generators.ts:529`, called `index.ts:4237`); `reflowImageHandler` already receives an
  unused `openaiApiKey` (`reflowImage.ts:40`).
- **Decision**: Wire these existing-but-inert hooks rather than adding parallel ones.
  The OCR callable that *uses* OpenAI must keep `openaiApiKey` in its secrets.

## D7 — Copy-fidelity gating vs. the Arabic Text QA image loop (spec FR-018/019 nuance)

- **Finding**: There are **two** distinct text-verification mechanisms, and they are not
  the same thing the brief conflates:
  1. `validateCopyFidelity` (`buildPlanSlotMap.ts:688`, retry loop `generators.ts:3951–4002`)
     runs at **build-plan** time and checks that the *technical prompt text* contains the
     copy fields — it is **pre-render and image-model-agnostic** (it never inspects an image).
  2. The **Arabic Text QA** loop (`generators.ts:5927+`) inspects the **rendered image**
     for Arabic corruption (via a Gemini text model) and re-renders on failure — this is
     the one that "verifies embedded text".
- **Decision**: Implement spec FR-018/FR-019 as written — gate the `validateCopyFidelity`
  retry loop behind `MODEL_PROVIDER` (skip extra build-plan retries on the OpenAI path,
  trust the model). **Keep the Arabic Text QA image loop ON for OpenAI**: its inspection
  uses Gemini (works on any image) and re-renders via the routing caller (→ gpt-image-2),
  directly defending the #1 risk (Arabic letterforms, SC-002). Record both behaviors in
  `resolutionTrace`.
- **Open recommendation (for user)**: Because `validateCopyFidelity` is pre-render and
  model-agnostic, gating it off yields little benefit and slightly weakens prompt QA;
  leaving it ON for both providers is also defensible. Flagged for confirmation; default
  follows the spec (gated).

## D8 — Reversibility mechanics (FR-022/023)

- **Decision**: Revert = set `MODEL_PROVIDER='gemini'` in `modelConfig.ts`. Because the
  Sharp Arabic step is already absent, the "uncomment `compositeArabicText`" half of the
  brief's revert is a **no-op** in the current code — the Gemini path already renders text
  natively. The previous (current) Gemini prompt block is preserved as a commented block
  inside `buildFinalImagePrompt`; flipping the flag and restoring that block returns the
  exact prior behavior. No code is deleted.

## D9 — Error handling, timeout, concurrency (FR-021/021a/021b)

- **Decision**: The OpenAI caller enforces a 120s per-image timeout (abort/reject →
  treated as generation failure → existing refund path). OpenAI errors (auth, 429,
  content rejection, timeout) throw descriptive errors that surface exactly like Gemini
  errors (the callables' existing try/catch + refund). No auto-retry/backoff on 429 in
  this phase; one failed item in carousel/batch does not abort siblings (existing
  best-effort partial-success semantics, 5-concurrent cap unchanged).
- **Risk noted (no auto-fallback)**: OpenAI content moderation may reject real-face hero
  *edits* more often than Gemini. Per spec FR-021 this fails+refunds (no silent fallback,
  Principle VII). To watch in QA; not mitigated by auto-fallback in this phase.

---

## Resolved unknowns summary

| Unknown | Resolution |
|---------|-----------|
| Does gpt-image-2 exist / correct name? | Yes — `gpt-image-2`, released Apr 2026 (D3) |
| Aspect-ratio → size mapping (FR-017) | Mapping table in D3; rule ÷16, ratio ≤3:1, ≤2K |
| Is `openai` SDK available? | No — add dependency (D4) |
| Caller return shape | Candidates structure, raw base64 (D5) |
| How to avoid breaking text calls | Model-aware routing (D1) |
| State of Sharp text compositing | Already dead in live path (D2) |
| Which retry to gate | `validateCopyFidelity` per spec; keep Arabic QA loop (D7) |
| Secret wiring | Mostly exists; reuse (D6) |
