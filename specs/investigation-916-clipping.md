# Investigation: 9:16 Story Canvas Subheadline Clipping

**Branch:** `fix-916-text-clipping`
**Date:** 2026-06-22
**Status:** ROOT CAUSE IDENTIFIED — no code changed (investigation only)

## TL;DR — Root Cause

There is a **hard, data-level string truncation** that fires **only for 9:16 and 4:5** aspect ratios and physically cuts the subheadline string to **50 characters with `substring(0, 50)`** before it is ever sent to the image model.

`functions/src/generators.ts:5643-5658` (inside `generateFinalAd`):

```ts
// 3. Copy compression for tight formats (9:16, 4:5) — TRUNCATION, not blanking.
const isCompactRatio = currentAspectRatio === '9:16' || currentAspectRatio === '4:5';
if (isCompactRatio) {
    const totalChars = hookText.length + (subheadText?.length ?? 0) + (ctaName?.length ?? 0) + (benefitText?.length ?? 0);
    if (totalChars > 120) {
        if (benefitText != null && benefitText.length > 30) {
            benefitText = benefitText.substring(0, 30).trim();   // benefit chopped to 30
        }
        if (subheadText != null && subheadText.length > 50 && totalChars > 140) {
            subheadText = subheadText.substring(0, 50).trim();   // ← subhead chopped to 50
        }
    }
}
```

This is **not** a model limitation and **not** a layout/font issue. The model receives an already-truncated string (e.g. `"Learn the 3 systems top coaches use to fil"`) and faithfully renders exactly that — so the output looks like "the last few words got cut off." The 1:1 path never enters this branch (`isCompactRatio === false`), so 1:1 renders the full subheadline.

Because the truncation lives in `generateFinalAd` — the shared entry point for **both** fresh generation and resize/reflow variants — it explains why the clipping appears on **both** paths, exactly as reported.

There are **three secondary amplifiers** (soft prompt instructions and shrunken text area) documented below, but #1 is the deterministic, code-level cause.

---

## STEP 1 — `buildFinalImagePrompt` prompt construction by ratio

**File:** `functions/src/generators.ts:5234-5406`

`buildFinalImagePrompt` itself does **not** branch its text content on `aspectRatio`. It receives the four copy fields (`hookText`, `subheadText`, `ctaName`, `benefitText`) already resolved by the caller (`generateFinalAd`) and emits them verbatim:

- **Does the prompt include ALL copy fields for both ratios?** Yes — the MANDATORY TEXT ELEMENTS block (`5377-5383`) lists every non-null field identically regardless of ratio:
  ```ts
  ✓ HEADLINE (REQUIRED): "${hookText}"
  ✓ SUBHEADLINE (REQUIRED): "${subheadText}"
  ✓ CTA BUTTON (REQUIRED): "${ctaName}"
  ✓ BENEFIT LINE (REQUIRED): "${benefitText}"
  ```
  So at the prompt-assembly layer the treatment is ratio-agnostic. **The difference is in what value `subheadText` already holds** by the time it reaches here.

- **Any character limits / truncation / substring inside `buildFinalImagePrompt`?** No. The only `substring` calls here are for the trace (`5400-5402`), which just truncate the logged copy of the prompt, not the rendered text. No clipping originates inside this function.

- **Different layout instructions per ratio?** Not inside `buildFinalImagePrompt`. The aspect-ratio spatial rules are injected through `coreDesignRules` (via the compiled layout contract) — see Step 3/4.

- **Any "shorter text" / "abbreviated" wording?** Not in this function. The COMPACT-COPY signalling is in the layout contract (Step 4).

**Key point:** `buildFinalImagePrompt` is innocent. The subheadline is already truncated upstream in `generateFinalAd` (`5643-5658`, see TL;DR) before it is passed in via the `subheadText` param (`generateFinalAd` builds the `buildFinalImagePrompt` call at `6900-6913`).

---

## STEP 2 — `selectLayoutTemplate` per-ratio template selection

**File:** `functions/src/layoutTemplates.ts:362-436`

`selectLayoutTemplate(primaryMode, secondaryMode, hookAngle, aspectRatio)` **does** take `aspectRatio`, but it only uses it to switch the `value_stack` family between a panel and a split layout:

- `value_stack` → `'hero_value_stack_panel'` when `1:1`, else `'hero_value_stack_split'` (`380`, `402`)

For every other mode (including the default `standard_hero` → `hero_focus`), **the template is identical across ratios**. So template selection is **not** the cause of per-ratio text capacity differences — the same template is used for 1:1 and 9:16 in the standard case. Text-capacity differences come from the aspect-ratio rules merged into the contract (Step 4), not from a different template.

---

## STEP 3 — `coreDesignRules` and ratio-specific prompt blocks

**File:** `functions/src/generators.ts:5951-6822` (the `coreDesignRules` template)

`coreDesignRules` is mostly ratio-agnostic. The ratio-specific spatial language enters through two channels:

### 3a. The compiled layout contract (`6037-6046`)
`coreDesignRules` calls `compileFullContract({ aspectRatio: currentAspectRatio, ... })` and injects `getContractRenderBlock(...)`. The block's wording differs for 9:16 because of the contract's per-ratio `AspectRatioRules` — see Step 4 for the exact strings (COMPACT COPY MODE, REELS BOTTOM-CLEAR, COPY LIMITS).

### 3b. `getPairRenderExecution` 9:16 execution lines
**File:** `functions/src/generators.ts:1356-1547`

For paired modes there are explicit `isTall` (9:16) branches, e.g.:
```ts
1375: '- 9:16 EXECUTION: Stack cards should be LARGER and more spaced vertically...'
1392: '- 9:16 EXECUTION: Extended ticket with speaker portrait prominent...'
```
These tell the model to make elements **larger** and use vertical space — they push toward *bigger* text, not smaller, so they are not a clipping cause. (They do, however, compete with the bottom-clear reservation in 3a, which can crowd text.)

### 3c. Fresh-path font/subhead sizing (Gemini-only block)
`functions/src/generators.ts:6020-6023` contains a SUBHEADLINE VISIBILITY rule ("font size should be at least 40-50% of the headline size") — but it is gated to `MODEL_PROVIDER === 'gemini'` and is **inert on the live OpenAI path**. Not a factor in current production.

**Conclusion for Step 3:** No ratio-specific block in `coreDesignRules` says "shorten" or "abbreviate" the subheadline. The only place 9:16 reduces text is (a) the contract COPY LIMITS / COMPACT COPY signalling and (b) the bottom-clear reservation that shrinks the usable text band — both in Step 4.

---

## STEP 4 — `compileFullContract` / ratio-specific layout contract

**File:** `functions/src/layoutContract.ts`

This is where 9:16 gets materially different text-capacity rules. Three relevant per-ratio values:

### 4a. `AspectRatioRules['9:16']` (`layoutContract.ts:202-213`)
```ts
'9:16': {
    canvasWidth: 1080, canvasHeight: 1920,
    textZoneMaxWidthPct: 90,
    heroMinSizePct: 30, heroMaxSizePct: 50,
    compactCopy: true,            // ← flips compact mode
    reelsBottomClearPct: 40,      // ← reserves bottom 40% text-free
}
```
Compare `1:1` (`158-164`): `compactCopy: false`, `reelsBottomClearPct: 0`.

- **`compactCopy: true`** drives both the COMPACT COPY MODE prompt label **and** the `isCompactRatio`-equivalent copy-limit shrink (Step 4b). Note: `compactCopy` is true for **4:5 and 3:4 too** (`175`, `187`), but the `generateFinalAd` `substring` truncation in the TL;DR only checks `9:16 || 4:5` — so 3:4 gets compact prompt limits but escapes the hard substring. This inconsistency is corroborating evidence that the hard truncation is an independent, ad-hoc rule.
- **`reelsBottomClearPct: 40`** is large. The render block (`610`) emits "REELS BOTTOM-CLEAR: Keep the bottom area of canvas FREE of text..." This squeezes all copy into the top ~60% of a tall canvas, which independently encourages the model to shrink/compress text. (For contrast, the reflow path uses a 20% bottom clear — see Step 5.)

### 4b. `buildCopyRules` — per-ratio max chars (`layoutContract.ts:420-437`)
```ts
const isCompact = ratioRules.compactCopy;
maxHeadlineChars: isCompact ? 40 : 55,
maxSubheadChars:  isCompact ? 50 : 70,   // ← 50 for 9:16 vs 70 for 1:1
maxBenefitChars:  isCompact ? 30 : 45,
```
These surface in the prompt as a soft instruction (`layoutContract.ts:648-649`):
```ts
COPY LIMITS:
Headline: max 40 chars | Subhead: max 50 chars | CTA: max 20 chars | Benefit: max 30 chars
```
Note the numeric coincidence: the contract's `maxSubheadChars` for compact = **50**, identical to the hard `substring(0, 50)` in `generateFinalAd`. The two were clearly meant to agree, but one is a *soft hint to the model* and the other *physically deletes characters* — and the hard one wins.

### 4c. Safe-zone insets (`layoutContract.ts:239-254`)
`SAFE_ZONE_TABLE['9:16'] = { top: 14, right: 8, bottom: 14, left: 8 }` vs `1:1 = { 8,8,8,8 }`. Larger top/bottom insets further reduce the vertical text band for 9:16.

**Conclusion for Step 4:** The 9:16 contract genuinely limits text area three ways (compact char limits, 40% bottom clear, larger insets). These are *soft/spatial* and would at worst make the model shrink text — they do not by themselves delete words. The deleted words come from the hard `substring` in `generateFinalAd`.

---

## STEP 5 — Repo-wide search for 9:16 / story / sizing / truncation constraints

Search across `functions/src/` for `9:16`, `916`, `story`, and text-sizing/truncation terms. Every relevant hit:

| File:Line | What it is | Clipping-relevant? |
|---|---|---|
| `generators.ts:5645` | `isCompactRatio = '9:16' || '4:5'` gate | **YES — primary** |
| `generators.ts:5653` | `benefitText.substring(0, 30)` (compact) | YES — chops benefit |
| `generators.ts:5656` | `subheadText.substring(0, 50)` (compact) | **YES — primary, chops subhead** |
| `layoutContract.ts:211-212` | `'9:16'.compactCopy=true, reelsBottomClearPct=40` | Secondary (shrinks band) |
| `layoutContract.ts:430-433` | compact `maxSubheadChars: 50` (soft) | Secondary (soft hint) |
| `layoutContract.ts:244` | `'9:16'` safe-zone insets top/bottom 14% | Secondary (shrinks band) |
| `layoutContract.ts:610` | renders REELS BOTTOM-CLEAR string | Secondary |
| `generators.ts:1359` `isTall` + `:1375..1547` | 9:16 EXECUTION lines (paired modes) | No — pushes *bigger* text |
| `generators.ts:6740` | reflow: "SCALE THE HERO UP — in Story (9:16)" | No |
| `generators.ts:6773` | reflow: "VERTICAL STORY: Stack headline at top..." | No (positional) |
| `generators.ts:6782-6789` | reflow 9:16 safe zones: **top 8%, bottom 20% text-free** | Secondary (reflow path only) |
| `index.ts:4293` | passes `currentAspectRatio` to `selectLayoutTemplate` | No |
| `variantEngine.ts:142` | passes `input.aspectRatio` to `selectLayoutTemplate` | No |
| `sizeVariant.ts:660` | note: resize still routes through `buildFinalImagePrompt` via `generateFinalAd` | Confirms resize hits the same truncation |

No other character-limit or `substring`-on-copy constraint specific to 9:16 exists outside the rows above.

> **Note on the reflow path (`generators.ts:6728-6801`):** the REFLOW/RESIZE branch builds its own prompt and explicitly orders "PRESERVE ALL TEXT EXACTLY — every word... must be identical" (`6739`, `6747-6753`). But the four copy fields it interpolates (`hookText`, `subheadText`, ...) are the **same variables** already truncated at `5645-5658` earlier in `generateFinalAd`. So even the "preserve every character" reflow prompt is handed a pre-clipped subhead — it faithfully preserves the *truncated* string.

---

## STEP 6 — Logging the full 9:16 prompt (requested instrumentation)

**Not added to source** — this branch was kept code-clean per the "do not change code" directive, and equivalent instrumentation already exists:

- `functions/src/generators.ts:5353-5356` already logs the four field lengths right where they reach the AD COPY block:
  ```ts
  console.log('[copy] hook:', hookText?.length, 'sub:', subheadText?.length, 'cta:', ctaName?.length, 'benefit:', benefitText?.length);
  ```
  Grepping Cloud Functions logs for `[copy]` on a 9:16 run will show `sub:` capped at ≤50 whenever the compact truncation fired — this is the runtime confirmation of the root cause.
- `buildFinalImagePrompt` already writes `trace.resolvedImagePrompt = textPrompt.substring(0, 5000)` (`5400`) into the resolution trace, persisted on the generation doc — the full assembled prompt is already auditable.

**If live logging is still wanted**, the faithful place is immediately before the visual model call inside `generateFinalAd` (around the `imageConfig: { aspectRatio: currentAspectRatio }` call sites, e.g. `generators.ts:7011`). Recommended (uncommitted) snippet:
```ts
console.log('[9:16 DEBUG] subheadText len:', subheadText?.length, 'value:', subheadText);
console.log('[9:16 DEBUG] isCompactRatio truncation fired:', currentAspectRatio === '9:16' || currentAspectRatio === '4:5');
console.log('[9:16 DEBUG] textPrompt length:', _promptResult.textPrompt.length);
```
(Note: the assembled prompt variable is `_promptResult.textPrompt` from `buildFinalImagePrompt` at `6900`, not a bare `prompt`; and the fields are `hookText/subheadText/ctaName/benefitText`, not `hookText/subheadText/ctaName/benefitText` placeholders — the snippet in the task brief used a non-existent `prompt` local.)

---

## Hypothesis & Recommended Fix Direction (NOT yet applied)

> **Status (as of commit `f094123`, 2026-06-22):** Recommendation #1 has been applied in commit `f094123` — the hard `substring(0, 50)` block at `generators.ts:5643-5658` is now commented out (kept for reversibility). The companion soft `maxSubheadChars: 50` was bumped to `65` to remove the numeric coincidence and the inverted ratio ordering. Recommendations #2–#4 remain open and will be evaluated in a follow-up after production validation of the current fix.

**Primary cause:** `generators.ts:5656` — `subheadText = subheadText.substring(0, 50).trim()` for 9:16/4:5 physically deletes the tail of the subheadline before render. This is a hard mid-string chop (often mid-word), which is exactly the "last few words cut off" symptom, present on both fresh and resize paths.

**Why 1:1 is perfect:** `isCompactRatio` is false for 1:1, so the chop never runs and the full subhead reaches the model.

**Secondary amplifiers** (would still let the model render full text, just smaller): the 9:16 contract's `reelsBottomClearPct: 40`, 14% top/bottom safe insets, and `maxSubheadChars: 50` soft limit all shrink the usable text band and may cause visual crowding even after the hard chop is removed.

**Suggested remediation to evaluate (do not implement yet):**
1. Remove or rethink the hard `substring` truncation at `5652-5657`. Truncating the *string* is the wrong lever — the model can render long text; let the spatial/contract rules size it. At minimum, never chop mid-word, and prefer letting the model shrink font over deleting content.
2. Reconcile the duplicated "50" magic number: the contract's soft `maxSubheadChars` (50) and the hard substring (50) are redundant; keep one source of truth (the contract) and make it advisory, not destructive.
3. Re-examine `reelsBottomClearPct: 40` for 9:16 — 40% is aggressive vs. the reflow path's 20%; it compresses the text band and may need to drop to ~20–25%.
4. Verify the resize/sizeVariant path independently, since it re-enters `generateFinalAd` and inherits the same truncation.

**No code in this branch was modified.** This document is the only deliverable.
