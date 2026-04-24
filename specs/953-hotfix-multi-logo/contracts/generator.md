# Contract — Backend Prompt Generator (`functions/src/generators.ts`)

Scope: every location that reads `inputs.brandLogos` to produce prompt text, image-input parts, or contextual instructions for the Gemini 3.1 text+image pipeline. Covers single-ad, carousel (all slides), and batch flows.

---

## 1. Sanitizer site (terminal backend safeguard)

| Line | Current | Change |
|---|---|---|
| 4192 | `const boxB = (inputs.brandLogos || []).slice(0, 1);` | `const boxB = (inputs.brandLogos || []).slice(0, 5);` |

Used by `buildFinalImagePrompt` (single-ad and per-carousel-slide entry). All downstream `boxB.forEach(...)` / `boxB.length` reads in this function honor the same local.

## 2. Prompt-text rewrites (equal-peer rule)

### 2.1 — Concept-plan branding fragment (L2108)

```diff
- BRANDING: ${inputs.brandLogos?.length ? "Integrate Box B logos as physical objects (e.g. on laptop, mug, wall)." : "No logos provided."}
+ BRANDING: ${inputs.brandLogos?.length ? `Integrate ${inputs.brandLogos.length === 1 ? "the Box B logo" : `all ${inputs.brandLogos.length} Box B logos`} as physical objects in the scene. ${inputs.brandLogos.length > 1 ? "All logos are equal peers — rendered at comparable size and balanced placement. Do NOT treat any logo as primary; upload order has no prominence meaning." : ""}` : "No logos provided."}
```

### 2.2 — Build-plan CRITICAL BRANDING RULE (L2406–2409)

```diff
  CRITICAL BRANDING RULE:
  - Render ONLY the user's brand elements from Box B (if provided).
- - If Box B is empty, the design must have ZERO logos or branding marks.
- - If Box B contains a logo, it is the ONLY logo allowed.
+ - If Box B is empty, the design must have ZERO logos or branding marks.
+ - If Box B contains one or more logos (up to five), each MUST appear as a distinct physical brand element. All uploaded logos are equal peers — rendered at comparable size and balanced placement. Upload order does NOT map to visual prominence. Never invent or add logos not in Box B.
```

### 2.3 — BEFORE/AFTER split-screen branding (L3090, L3106)

```diff
- BRANDING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'شعار Box B إن وجد — في الوسط أو على الفاصل.' : 'Box B logo if present — centered or on divider.'}
+ BRANDING_LOGIC: ${(inputs.adLanguage || 'ar_fusha').startsWith('ar') ? 'شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل وموضع متوازن، مثلاً في الوسط أو على الفاصل.' : 'Box B logos (up to 5) if present — all at comparable size and balanced placement, e.g. centered or on divider.'}
```

Both occurrences (L3090 and L3106) receive the identical replacement.

### 2.4 — AR concept-template branding placeholder (L3137)

```diff
- BRANDING_LOGIC: [منطق وضع الشعار من Box B إن وجد.]
+ BRANDING_LOGIC: [منطق وضع شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل وموضع متوازن، بدون شعار مهيمن.]
```

### 2.5 — LOGO STRICTNESS rule (L5071)

```diff
-          - LOGO STRICTNESS: Render ONLY user - provided branding from Box B.If Box B is empty, the design must be 100 % free of any logos or branding marks.If Box B has an image, render that image once as a physical artifact in the scene.
+          - LOGO STRICTNESS: Render ONLY user-provided branding from Box B. If Box B is empty, the design must be 100% free of any logos or branding marks. If Box B has one or more images (up to 5), render each as a distinct physical artifact in the scene — all at comparable size, balanced placement, no single logo dominant, no one mark enlarged relative to the others. Upload order has no prominence meaning.
```

### 2.6 — Carousel "SAME BRAND ELEMENTS" (L5138)

```diff
- 8. SAME BRAND ELEMENTS: Same logo placement, same brand colors, same badge design.
+ 8. SAME BRAND ELEMENTS: Same logo placements (for all uploaded logos), same brand colors, same badge design.
```

### 2.7 — Reflow "brand elements" (L3473) — no change

```text
- Render ONLY the user's brand elements. Any logos must come from Box B exclusively.
```

Already plural. Left unchanged.

---

## 3. Image-input attachment (L5244, L5250) — no code change

The existing loop already iterates: `boxB.forEach((d: any) => parts.push({ inlineData: { mimeType: getMime(d), data: d.split(',')[1] } }));`. Both the `styleReference` branch (carousel slides 2+, L5244) and the default branch (L5250) correctly loop over `boxB`. Once the upstream sanitizer (L4192) allows 5 entries, both branches attach all of them. **No edit required here** — the loop is already the right shape.

---

## 4. Contract fixtures (add to `functions/src/contractFixtures.test.ts`)

### HFD.T1 — 3-logo single ad: prompt shape

**Inputs**: valid AdInputs with `brandLogos: ['data:image/png;base64,...', …3 entries]`, `adMode: 'single'`, English.
**Assertions**:
- `buildFinalImagePrompt` called with these inputs produces a prompt string containing the literal phrase `"comparable size"`.
- Prompt does NOT contain `"ONLY logo allowed"`.
- Prompt does NOT contain `"render that image once"`.
- `boxB` local (asserted via a test-only export or spy) has length 3.

### HFD.T2 — 5-logo carousel slide: per-slide attachment

**Inputs**: `brandLogos: [5 entries]`, `adMode: 'carousel'`, `slideCount: 5`.
**Assertions**:
- Per-slide call to the image builder attaches 5 image `inlineData` parts for Box B (independent of slide index 1 vs 2+).
- Slides 2–5 (style-reference branch) attach all 5, not just the first.

### HFD.T3 — 0-logo ad: empty-branding invariant preserved

**Inputs**: `brandLogos: []`, English.
**Assertions**:
- Prompt contains `"ZERO logos or branding marks"`.
- Prompt does NOT contain `"comparable size"` (the equal-peer phrase only activates when length > 1).
- Prompt does NOT contain `"Integrate ... Box B logos"` (the branding section's "if length" guard gave an empty string).

### HFD.T4 — 7-logo oversized input: defence-in-depth truncation

**Inputs**: `brandLogos: [7 entries]` (simulating client bypass).
**Assertions**:
- `boxB` has length exactly 5 (not 7, not 1).
- Prompt generation does not throw.
- Prompt contains `"comparable size"` (equal-peer activates — length still > 1).
- A `console.warn` call is observed (via `vi.spyOn(console, 'warn')`) with a JSON payload where `event === 'brandLogos_truncated'`, `received === 7`, `keptCount === 5`. (Satisfies Principle VII trace requirement — see `contracts/sanitizer.md` rule 3.)

### HFD.T5 — Arabic single ad with 2 logos: AR equal-peer phrasing

**Inputs**: `brandLogos: [2 entries]`, `adLanguage: 'ar_fusha'`, BEFORE/AFTER mode.
**Assertions**:
- Prompt contains the Arabic phrase `"بحجم متماثل"` (comparable size).
- Prompt does NOT contain the singular Arabic `"شعار Box B إن وجد"` (replaced with plural).

---

## 5. Non-goals in this contract

- No `logoPlacements` array returned in the build-plan JSON (deferred to HOTFIX-E).
- No ban on the model rendering logos (HOTFIX-E).
- No Sharp compositing pass (HOTFIX-E).
- No change to the prompt's position in the overall pipeline order.
