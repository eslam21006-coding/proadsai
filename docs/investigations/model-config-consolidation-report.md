# Model Config Consolidation — Investigation Report (Batch 0)

**Worktree:** `D:\proads-worktrees\model-config-consolidation`
**Branch:** `model-config-consolidation`
**Goal:** consolidate four duplicated Gemini model constants into `functions/src/modelConfig.ts`, then switch the creative copy model from `gemini-3.1-pro-preview` (preview) to `gemini-3.7-flash` (GA).
**Scope of this document:** read-only investigation. No code changes proposed.

---

## A. DUPLICATION MAP

Three literal strings appear in `functions/src/` (plus one near-relative):

| File | Line | Literal | Kind | Constant name |
|---|---|---|---|---|
| `functions/src/index.ts` | 194 | `"gemini-3.1-pro-preview"` | const declaration | `CREATIVE_MODEL_PRO` |
| `functions/src/index.ts` | 195 | `"gemini-3.1-pro-preview"` | const declaration | `CREATIVE_MODEL_LITE` |
| `functions/src/index.ts` | 196 | `"gemini-2.5-flash-lite"` | const declaration | `LOGIC_MODEL` |
| `functions/src/index.ts` | 197 | `"gemini-3.1-flash-image"` | const declaration | `VISUAL_MODEL` |
| `functions/src/generators.ts` | 1277 | `"gemini-3.1-pro-preview"` | const declaration | `CREATIVE_MODEL_PRO` |
| `functions/src/generators.ts` | 1278 | `"gemini-3.1-pro-preview"` | const declaration | `CREATIVE_MODEL_LITE` |
| `functions/src/generators.ts` | 1282 | `"gemini-2.5-flash-lite"` | const declaration | `LOGIC_MODEL` |
| `functions/src/generators.ts` | 1285 | `"gemini-3.1-flash-image"` | const declaration | `VISUAL_MODEL` |
| `functions/src/principleVault.ts` | 61 | `"gemini-2.5-flash-lite"` | const declaration | `LOGIC_MODEL` (file-local) |
| `functions/src/testimonialMockup.ts` | 12 | `"gemini-3.1-flash-image-preview"` | const declaration | `VISUAL_MODEL` (file-local, **different suffix `-preview`**) |
| `functions/src/failureClassification.test.ts` | 98 | `"gemini-3.1-pro-preview"` | inline fixture string | n/a — test fixture |
| `functions/src/failureClassification.test.ts` | 103 | `"gemini-3.1-pro-preview"` | inline fixture string | n/a — test assertion |
| `functions/src/failureClassification.test.ts` | 127 | `"gemini-2.5-flash-lite"` | inline fixture string | n/a — test fixture |
| `functions/src/failureClassification.test.ts` | 136 | `"gemini-3.1-pro-preview"` | inline fixture string | n/a — test fixture |

### Observations

1. **The four canonical constants are declared in TWO files** (`functions/src/index.ts:194–197` and `functions/src/generators.ts:1277–1285`), each carrying the comment `// ─── MODEL CONSTANTS (single source of truth) ───` (or equivalent). Both comment lines claim single-source-of-truth status — they cannot both be true.
2. **Two further files duplicate a subset**:
   - `functions/src/principleVault.ts:61` declares a file-local `LOGIC_MODEL` — not imported from anywhere.
   - `functions/src/testimonialMockup.ts:12` declares a file-local `VISUAL_MODEL` — uses the *preview* suffix `"gemini-3.1-flash-image-preview"`, **different from** the consolidated `"gemini-3.1-flash-image"`. This is a quiet drift — the file is NOT a duplicate of the consolidated constant; it's using a different endpoint.
3. **Test fixtures** in `functions/src/failureClassification.test.ts` use the literals as **input strings** to `buildCostEstimate(model, …)` — they assert behaviour of a model-string parser/look-up, not the value of the production constants. The strings must stay literal there (replacing them with the consolidated constant would couple test fixtures to production code in an unusual way and risks hiding a real-world drift in fixtures).

### Plan for each hit

| File | Line | Plan |
|---|---|---|
| `functions/src/index.ts` | 194–197 | Batch 1: delete local consts, import from `./modelConfig.js`. |
| `functions/src/generators.ts` | 1277, 1278, 1282, 1285 | Batch 1: delete local consts, import from `./modelConfig.js`. |
| `functions/src/principleVault.ts` | 61 | Batch 1: replace local declaration with `import { LOGIC_MODEL } from "./modelConfig.js";`. |
| `functions/src/testimonialMockup.ts` | 12 | Batch 1: **flag for human decision** — see section E. The literal is `"-preview"`, not the consolidated value. Either (a) leave it alone if the preview endpoint is intentional, or (b) swap to the consolidated `VISUAL_MODEL` constant if the difference is accidental drift. Do NOT silently change behaviour in Batch 1. |
| `functions/src/failureClassification.test.ts` | 98, 103, 127, 136 | **Leave** — test fixtures exercise the cost-estimate logic against arbitrary model strings. They are not "the truth" about which model we ship. |

---

## B. IMPORT MAP

Imports of `modelConfig` constants from elsewhere (current state):

| File | Import line | Imported names |
|---|---|---|
| `functions/src/sizeVariant.ts` | 18 | `MODEL_PROVIDER` |
| `functions/src/reflowImage.ts` | 21 | `MODEL_PROVIDER` |
| `functions/src/openAIImageCaller.ts` | 5–11 | `OPENAI_VISUAL_MODEL`, `OPENAI_SIZE_BY_ASPECT`, `OPENAI_IMAGE_TIMEOUT_MS`, `OPENAI_IMAGE_TIMEOUT_HIGH_MS`, `OPENAI_IMAGE_QUALITY` |
| `functions/src/index.ts` | 59 | `MODEL_PROVIDER`, `OPENAI_VISUAL_MODEL` |
| `functions/src/generators.ts` | 57 | `MODEL_PROVIDER`, `OPENAI_VISUAL_MODEL`, `OPENAI_SIZE_BY_ASPECT`, `COPY_SCORING_ENABLED` |
| `functions/src/__tests__/copyScoringGate.test.ts` | 927 | `COPY_SCORING_ENABLED` (dynamic import) |

After Batch 1, `index.ts` and `generators.ts` will additionally import the four Gemini constants. After Batch 1, `principleVault.ts` will additionally import `LOGIC_MODEL`. `testimonialMockup.ts` is gated on the human decision in section A.

---

## C. THINKING LEVEL AUDIT

There are exactly **four** `thinkingConfig` call sites across the entire `functions/src/` tree. All four pass `thinkingLevel: 'High'` (capital H). **No call site passes `'MINIMAL'`.**

| File | Line | Model targeted | thinkingLevel |
|---|---|---|---|
| `functions/src/index.ts` | 5633 | `VISUAL_MODEL` (`gemini-3.1-flash-image`) | `'High'` |
| `functions/src/generators.ts` | 7896 | `VISUAL_MODEL` (`gemini-3.1-flash-image`) | `'High'` |
| `functions/src/generators.ts` | 8030 | `VISUAL_MODEL` (`gemini-3.1-flash-image`) | `'High'` |
| `functions/src/generators.ts` | 8173 | `VISUAL_MODEL` (`gemini-3.1-flash-image`) | `'High'` |

### Section 7 of the task brief asks for the MINIMAL check.

**No MINIMAL calls exist.** The MINIMAL incompatibility warning in the brief therefore does NOT apply — there is no Batch-2 follow-up needed for thinkingLevel on `CREATIVE_MODEL_PRO`/`CREATIVE_MODEL_LITE`, because no creative call site currently uses `thinkingConfig` at all. (Creative calls use `systemInstruction` + `temperature` only.)

### Adjacent observation

All four `thinkingConfig` calls target `VISUAL_MODEL`, which Batch 2 explicitly says NOT to touch. No action required in Batch 2 against these call sites.

---

## D. CONFIG COMPATIBILITY AUDIT

Each call that targets `CREATIVE_MODEL_PRO`, `CREATIVE_MODEL_LITE`, `LOGIC_MODEL`, or `VISUAL_MODEL` (via `callGemini`/`retry(()=> callGemini())`) with its config keys:

### `CREATIVE_MODEL_PRO` / `CREATIVE_MODEL_LITE` call sites (all in `functions/src/generators.ts`)

| File:line | Model passed | Config keys |
|---|---|---|
| `generators.ts:3011` | `isRegeneration ? CREATIVE_MODEL_LITE : CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_TOV`, `temperature` (1.2 or 1.0) |
| `generators.ts:3090` | `isRegeneration ? CREATIVE_MODEL_LITE : CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_TOV`, `temperature: 0.6` |
| `generators.ts:8823` | `CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_TOV`, `temperature: 0.85` |
| `generators.ts:9156` | `CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_TOV`, `temperature: 0.8` |
| `generators.ts:9716` | `CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_CAPTION` |
| `generators.ts:9985` | `CREATIVE_MODEL_PRO` | `temperature: 0.9` |
| `generators.ts:10056` | `CREATIVE_MODEL_PRO` | `temperature: 0.9` |
| `generators.ts:10433` | `CREATIVE_MODEL_PRO` | `systemInstruction: SYSTEM_TOV`, `temperature: 0.95` |

### `LOGIC_MODEL` call sites

| File:line | Config keys |
|---|---|
| `generators.ts:1219` | `temperature: 0.3` |
| `generators.ts:1492` | (no config keys — multimodal style direction call) |
| `generators.ts:4592` | `systemInstruction: SYSTEM_CONCEPTS`, `temperature: 0.9 + (attempt * 0.05)` |
| `generators.ts:4614` | `systemInstruction: SYSTEM_CONCEPTS`, `temperature: 0.7` |
| `generators.ts:4657` | `systemInstruction: SYSTEM_CONCEPTS`, `temperature: 0.7` |
| `generators.ts:5035` | `temperature: 0.3` (JSON repair; no schema) |
| `generators.ts:5065` | `systemInstruction: SYSTEM_RENDER`, `temperature: 0.25`, `responseMimeType: "application/json"`, `responseSchema: BUILD_PLAN_RESPONSE_SCHEMA` |
| `generators.ts:6713` | `systemInstruction: SYSTEM_RENDER`, `temperature: 0.35`, `responseMimeType: "application/json"`, `responseSchema: BUILD_PLAN_RESPONSE_SCHEMA` |
| `generators.ts:7957` | `temperature: 0.1` (Arabic text QA) |
| `generators.ts:8097` | (no config keys — numeric extraction) |
| `generators.ts:8335` | (no config keys — numeric extraction) |
| `generators.ts:9892` | (no config keys — multimodal critique) |
| `index.ts:1030` | uses `genAI.getGenerativeModel({ model: LOGIC_MODEL })`; `generateContent` payload only (no config keys via the new SDK path) |
| `index.ts:1102` | `genAI.getGenerativeModel({ model: LOGIC_MODEL, tools: [{ googleSearch: {} }] })` — **Google Search grounding** attached at the model level |
| `index.ts:4931` | `temperature: 0.7` (concept director loop) |
| `index.ts:6871` | `generationConfig: { responseMimeType: "application/json", responseSchema: { … } }` — large inline schema |
| `principleVault.ts:227` | `temperature: 0.3` |
| `principleVault.ts:372` | `temperature: 0.3` |

### `VISUAL_MODEL` call sites

| File:line | Config keys |
|---|---|
| `index.ts:5629` | `responseModalities: ['TEXT', 'IMAGE']`, `thinkingConfig: { thinkingLevel: 'High' }`, `imageConfig: { aspectRatio: (ratio \|\| '1:1') as any }`, `safetySettings: [4 entries]` |
| `generators.ts:7892` | `responseModalities: ['TEXT', 'IMAGE']`, `thinkingConfig: { thinkingLevel: 'High' }`, `imageConfig: { aspectRatio: currentAspectRatio as any }`, `safetySettings: [4 entries]` |
| `generators.ts:8026` | same as 7892 |
| `generators.ts:8169` | same as 7892 |

### `VISUAL_MODEL` (file-local) call sites in `testimonialMockup.ts`

| File:line | Config keys |
|---|---|
| `testimonialMockup.ts:51` | `temperature: 0.1` |
| `testimonialMockup.ts:86` | `responseModalities: ["TEXT", "IMAGE"]`, `safetySettings: [4 entries]` |

### Compatibility notes (Batch 2 — creative model change)

The creative call sites use only these config keys:

- `systemInstruction` (text only — works on every Gemini model)
- `temperature` (text-only models — works on `gemini-3.7-flash`)
- (no `responseMimeType`, no `responseSchema`, no `thinkingConfig`, no `imageConfig`, no `safetySettings`, no `maxOutputTokens`)

`gemini-3.7-flash` accepts all four of these keys. **No config-key incompatibility** is expected for the creative switch.

---

## E. RISK ASSESSMENT

### E.1 Risk: constant move to `modelConfig.ts`

1. **Naming collision at import site** — `functions/src/index.ts` and `functions/src/generators.ts` both currently declare `LOGIC_MODEL`/`VISUAL_MODEL` as `const` at module scope. If Batch 1 deletes the local declarations and adds the import, the module-level identifier simply resolves to the imported binding. No shadow, no conflict. Risk: **none.**
2. **`principleVault.ts` is a new importer** — currently does not import from `./modelConfig.js`. Adding the import requires the path `./modelConfig.js` (NodeNext module resolution — see `AGENTS.md`). Risk: **none** — same convention as `openAIImageCaller.ts`.
3. **`testimonialMockup.ts` uses `"gemini-3.1-flash-image-preview"`, not `"gemini-3.1-flash-image"`** — silently replacing its file-local `VISUAL_MODEL` with the imported `VISUAL_MODEL` would change the endpoint this module calls. This is a **behavioural change** disguised as a refactor. Batch 1 should NOT touch this file unless the human explicitly approves the endpoint swap. Risk if changed: silent production endpoint change. **See decision question below.**
4. **Test fixtures** in `failureClassification.test.ts` use literals to exercise arbitrary model strings — leaving them alone is correct; replacing them would couple test data to production code in an unusual way.
5. **`CREATIVE_MODEL_PRO` and `CREATIVE_MODEL_LITE` currently resolve to the same string** (`"gemini-3.1-pro-preview"`). After consolidation they continue to resolve to the same string. No semantic change. Risk: **none.**
6. **TypeScript compile** — moving the constants does not change types. The named exports must be `string` typed to be assigned into `model: string` parameter positions. Risk: **none.**
7. **Build/runtime** — `functions/lib/` must be rebuilt after Batch 1 (rule #1 in `AGENTS.md`). Risk: **none for source**; **mandatory** to rebuild before deploy.

### E.2 Risk: creative model change to `gemini-3.7-flash`

1. **Capability surface** — every creative call site uses only `systemInstruction` + `temperature` (see section D). `gemini-3.7-flash` supports both. Risk: **none for config keys.**
2. **Output quality / drift** — different model, different style, different defaults. Arabic copy quality is a known sensitivity. Risk: **MEDIUM** for copy quality (Arabic puns, headline tone), but **out of scope** for this task — the brief mandates the swap and the existing pipeline (`retry()`, `validateHookResponse`, `captionValidator`, Arabic ratio validation) will surface regressions in tests/logs.
3. **`thinkingConfig` MINIMAL** — section C confirms no creative call site uses `thinkingConfig`. The brief's MINIMAL warning does not apply. Risk: **none.**
4. **`gemini-3.7-flash` specific features** — if any future call site adds `responseSchema` or structured-output features, the Flash family has historically had narrower schema support than Pro. None of the current creative call sites use these features. Risk: **none today.**
5. **`gemini-3.7-flash` model id existence** — assuming this id is correctly the GA name intended by the team. The brief uses this exact string verbatim; Batch 2 will set it verbatim. Risk: **none for code change**; the team owns the id correctness.

### E.3 Risk: revert-pattern comment style

`modelConfig.ts` already has a revert pattern in the comment block above `COPY_SCORING_ENABLED` (lines 5–10). Batch 2 step 6 asks for a parallel pattern above the two creative constants. Risk: **none.**

---

## F. OPEN QUESTIONS (need human decision before Batch 1)

### F.1 `functions/src/testimonialMockup.ts:12` — drift on `-preview` suffix

The file-local constant is `"gemini-3.1-flash-image-preview"`. The consolidated constant is `"gemini-3.1-flash-image"`. Three plausible intents:

- (a) The preview suffix is **intentional** (the preview endpoint is what this module needs) — leave the file alone.
- (b) The preview suffix is **accidental drift** and `testimonialMockup.ts` should use the consolidated `VISUAL_MODEL` constant — make the change in Batch 1.
- (c) The preview suffix is **accidental drift** but the consolidated constant value should be updated to `"-preview"` to match reality — make the change in Batch 1.

The brief says: "If they are inline literals that should reference the constant, replace them with the imported constant." That covers (b). It does not cover (c) because the brief says do NOT change `VISUAL_MODEL`.

**Recommendation:** ask the user before Batch 1 whether to (a) leave alone, (b) import consolidated constant, or (c) leave alone and note as separate follow-up.

---

## G. SUMMARY

- Four constants are duplicated across two files (`index.ts:194–197`, `generators.ts:1277–1285`).
- Two further files re-declare subsets (`principleVault.ts:61`, `testimonialMockup.ts:12`).
- One of those (`testimonialMockup.ts:12`) uses a **different string** (`-preview` suffix) — see section F.1.
- No `thinkingConfig` calls target the creative models; MINIMAL warning in the brief is moot.
- Creative call sites use only `systemInstruction` + `temperature` — no config-key incompatibilities with `gemini-3.7-flash`.
- Build must be run after Batch 1; `functions/lib/` must be regenerated before deploy (AGENTS.md rule #1).
