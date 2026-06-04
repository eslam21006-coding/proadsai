# Contract: OpenAI Image Caller + Model Routing

**Date**: 2026-06-04 | **Feature**: `025-openai-image-swap`

The internal interface this phase exposes is a **drop-in `GeminiCaller`**. There are no
new HTTP endpoints, no frontend contract, and no Firestore read contract change. The
"contract" is the caller's input/output behavior and the routing rule.

---

## C1 — `createOpenAIImageCaller(apiKey: string): GeminiCaller`

**Module**: `functions/src/openAIImageCaller.ts` (NEW)

**Signature** (identical to `createGeminiCaller`):
```ts
function createOpenAIImageCaller(apiKey: string): GeminiCaller;
// GeminiCaller = (params: { model: string; contents: any; config?: any }) => Promise<any>
```

**Behavior**:
1. Extract & concatenate all `contents.parts[].text` (in order) → `prompt: string`.
2. Extract all `contents.parts[].inlineData` (base64) → `refs: Buffer[]`.
3. Resolve `size` from `config.imageConfig.aspectRatio` via `OPENAI_SIZE_BY_ASPECT`
   (fallback `'1024x1024'` for unknown ratios).
4. If `refs.length > 0` → `client.images.edit({ model: OPENAI_VISUAL_MODEL, image: <refs>, prompt, size })`. **Verify gpt-image-2 multi-image `images.edit()` support; if supported pass ALL `refs`, else `refs[0]`** (FR-016 face-fidelity parity).
   Else → `client.images.generate({ model: OPENAI_VISUAL_MODEL, prompt, size })`.
5. Enforce a **120s** timeout (`OPENAI_IMAGE_TIMEOUT_MS`); on timeout, **throw**.
6. Read `response.data[0].b64_json` and return the §3 response shape with the **raw**
   base64 (no `data:` prefix) as `inlineData.data`, `mimeType:'image/png'`.
7. Ignore `config.thinkingConfig`, `config.safetySettings`, `config.responseModalities`.

**Error contract**: any failure (auth, 429, content rejection, timeout, empty `data`)
**throws** a descriptive `Error` — never returns an empty/partial success. Callers' existing
try/catch performs the credit refund (FR-021).

| Given | When | Then |
|-------|------|------|
| `config.imageConfig.aspectRatio='9:16'`, no refs | called | `images.generate` with `size='1024x1792'`; returns 1 candidate / 1 `inlineData` |
| 1 base64 hero ref present | called | `images.edit` seeded with the ref (FR-016) |
| 2+ refs present | called | all refs passed if multi-image edit supported, else `refs[0]` (FR-016 parity) |
| empty `subheadText`/`benefitText` upstream | prompt built | those lines absent from prompt text (FR-006) |
| OpenAI returns 429 | called | throws → callable refunds; siblings continue (FR-021b) |
| call exceeds 120s | called | aborted → throws → refund; `timedOut=true` traced (FR-021a) |
| `OPENAI_API_KEY` missing/empty | called | throws descriptive error; no crash (FR-020) |

## C2 — Model-aware routing caller (research D1)

**Where**: constructed in `index.ts` and injected via `generators.setGeminiCaller(...)` for
every **visual-capable** callable (`serverGenerateFinalAd`, `reflowImage`, the polish/edit
callable, carousel/batch, testimonial).

```ts
function createVisualRoutingCaller(geminiKey: string, openaiKey: string): GeminiCaller {
  const gemini = createGeminiCaller(geminiKey);
  const openai = createOpenAIImageCaller(openaiKey);
  return (params) =>
    (MODEL_PROVIDER === 'openai' && params.model === VISUAL_MODEL)
      ? openai(params)
      : gemini(params);
}
```

| Given `MODEL_PROVIDER` | `params.model` | Routes to |
|------------------------|----------------|-----------|
| `'openai'` | `VISUAL_MODEL` (`gemini-3.1-flash-image`) | gpt-image-2 |
| `'openai'` | `LOGIC_MODEL` / build-plan / Arabic-QA text | Gemini |
| `'gemini'` | any | Gemini (full revert, FR-022) |

**Invariant**: text/JSON model calls are NEVER routed to gpt-image-2. This is the
correctness guard the literal brief omitted.

## C3 — Prompt content contract (CHANGE 2, inside `buildFinalImagePrompt`)

The GPT-native prompt MUST include, and MUST NOT alter, the following:

**MUST add** (free-form text rendering):
- `AD COPY TO RENDER ON THIS IMAGE` block with Main Hook / Supporting Line (omit if empty)
  / CTA Button / Benefit Line (omit if empty) — FR-006.
- `TEXT PLACEMENT` block: natural/varied placement, every design different, Arabic RTL +
  fully connected script (no broken letters, no Latin substitution), CTA inside a distinct
  button/shape, sufficient contrast — FR-007/008/009.
- `QUALITY` block: ultra-high-res, professional, sharp; Arabic zero-tolerance letterforms — FR-010.

**MUST preserve verbatim** (FR-011–014): hero face identity lock, wardrobe/customization,
`CULTURAL_COMPLIANCE_BLOCK` + `ARABIC_WARDROBE_BLOCK`, brand-color injection, logo blocks,
layout-contract zone proportions, gaze, all creative-mode rules, carousel visual directive
+ style anchor, safe-zone percentages, `buildFinalImagePrompt` structural params.

**MUST comment (not delete)**: the previous Gemini prompt block, wrapped:
```
/* === GEMINI PROMPT (preserved for revert) ===  ... === END GEMINI PROMPT === */
```

## C4 — Copy-fidelity gating (CHANGE 3)

| `MODEL_PROVIDER` | `validateCopyFidelity` retry loop (`generators.ts:3951–4002`) |
|------------------|----------------------------------------------------------------|
| `'openai'` | **skipped** (single build-plan pass; trust model) — FR-018 |
| `'gemini'` | runs intact (≤3 attempts) — FR-019 |

`validateCopyFidelity` and its code in `buildPlanSlotMap.ts` are **not** modified — only the
call site is gated. The Arabic Text QA image loop (`generators.ts:5927+`) remains active on
both paths (research D7).
