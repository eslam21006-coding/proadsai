# Phase 1 Data Model: OpenAI gpt-image-2 + Native Text Rendering

**Date**: 2026-06-04 | **Feature**: `025-openai-image-swap`

This phase introduces **no Firestore schema migration**. The only persisted change is an
additive sub-field on the existing `generations/{genId}.resolutionTrace`. Everything else
is in-memory request/response shapes for the new visual caller.

---

## 1. Persisted: `resolutionTrace.visualProvider` (additive, optional)

Added to satisfy Constitution Principle VI (hidden machine layers MUST be auditable) — the
active visual engine must be recoverable per generation.

```ts
// extends existing ResolutionTrace (additive, optional — legacy docs simply lack it)
interface ResolutionTrace {
  // ... existing fields unchanged ...
  visualProvider?: {
    provider: 'openai' | 'gemini';   // which engine rendered the image
    model: string;                   // e.g. 'gpt-image-2' or 'gemini-3.1-flash-image'
    size?: string;                   // gpt-image-2 size used, e.g. '1024x1792'
    usedReferenceEdit?: boolean;     // true → images.edit (hero refs present); false → images.generate
    copyFidelityGated?: boolean;     // true when validateCopyFidelity retry skipped (OpenAI path)
    arabicQaRan?: boolean;           // true if Arabic Text QA image loop executed
    timedOut?: boolean;              // true if the 120s per-image timeout fired
  };
}
```

- **Validation**: `provider` ∈ {`openai`,`gemini`}; `model` non-empty. Field is optional;
  absence = legacy / pre-025 generation.
- **Write path**: set in `generateFinalAd` (and the reflow/polish render paths) at the
  point the visual response returns. No read-path consumer is required for launch
  (audit/debug only), so the frontend and security rules are unchanged.
- **Migration**: none. Purely additive optional field, consistent with prior phases
  (`culturalViolation`, `logoPipeline`, `reflowHistory`).

## 2. In-memory: Visual caller request (unchanged GeminiCaller input)

The new caller accepts the **existing** shape — no upstream change:

```ts
type GeminiCaller = (params: {
  model: string;          // VISUAL_MODEL when this is a visual render
  contents: any;          // { parts: Part[] } — text parts + inlineData (base64 hero refs)
  config?: any;           // includes config.imageConfig.aspectRatio (e.g. '9:16')
}) => Promise<any>;        // returns the response shape in §3
```

Relevant `Part` variants the OpenAI caller reads:
- `{ text: string }` — concatenated (in order) into the OpenAI prompt string.
- `{ inlineData: { mimeType: string; data: string } }` — base64 reference image(s)
  seeding `images.edit` — **all refs if gpt-image-2 multi-image edit is supported, else the first** (spec FR-016 parity). `mimeType` informs the upload filename.

Ignored (Gemini-only, per brief): `config.thinkingConfig`, `config.safetySettings`,
`config.responseModalities`.

## 3. In-memory: Visual caller response (must equal createGeminiCaller output)

```ts
interface VisualCallerResponse {
  text?: string;                          // unused for image renders; kept for shape parity
  candidates: Array<{
    content: {
      parts: Array<
        | { text: string }
        | { inlineData: { mimeType: 'image/png'; data: string } } // data = RAW base64, NO 'data:' prefix
      >;
    };
  }>;
}
```

- The OpenAI image response field `data[0].b64_json` is placed **unprefixed** into
  `inlineData.data`. Downstream (`generators.ts:5914–5919`) prepends
  `data:image/png;base64,`.
- On success: exactly one candidate with one `inlineData` part.
- On failure: the caller **throws** (does not return an empty candidates array) so the
  callable's existing catch → refund path fires (FR-021).

## 4. Config constants (`modelConfig.ts`)

```ts
export const MODEL_PROVIDER: 'openai' | 'gemini' = 'openai'; // single revert switch (FR-001)
export const OPENAI_VISUAL_MODEL = 'gpt-image-2';            // FR-005 / D3
// aspect ratio → gpt-image-2 size (D3); ÷16, ratio ≤3:1, ≤2K
export const OPENAI_SIZE_BY_ASPECT: Record<string, string> = {
  '1:1':  '1024x1024',
  '4:5':  '1024x1280',
  '3:4':  '1024x1360',
  '9:16': '1024x1792',
  '4:3':  '1360x1024',
  '16:9': '1792x1024',
};
export const OPENAI_IMAGE_TIMEOUT_MS = 120_000;             // FR-021a
```

## 5. Entities (from spec, unchanged by persistence)

- **Provider selector** → `modelConfig.ts` constants (§4).
- **Visual caller** → the `GeminiCaller`-typed function; two implementations
  (`createGeminiCaller`, `createOpenAIImageCaller`) + the routing wrapper (research D1).
- **Ad copy bundle** → existing `hookText`, `subheadText`, `ctaName`, `benefitText`
  parameters of `buildFinalImagePrompt` (no new entity; threaded into the prompt).
- **Engine credential** → `OPENAI_API_KEY` / `GEMINI_API_KEY` secrets, read lazily inside
  callable bodies (FR-020), coexisting.
