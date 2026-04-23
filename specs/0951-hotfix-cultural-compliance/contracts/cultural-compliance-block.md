# Contract: `CULTURAL_COMPLIANCE_BLOCK` + `ARABIC_WARDROBE_BLOCK`

**Module**: `functions/src/culturalCompliance.ts`
**Consumers**: `functions/src/generators.ts` — `generateBuildPlan()`, `buildFinalImagePrompt()`, the carousel per-slide assembly, and the batch per-item assembly.

This document pins the exact string content of the two Arabic-market prompt blocks, their insertion points, and the language gate. The block content is authoritative — it is the source of truth for the test fixtures in HFC.9 and for the acceptance scenarios in spec §User Story 2 / §User Story 3.

## 1. `CULTURAL_COMPLIANCE_BLOCK`

### 1.1 Content

```text
CULTURAL COMPLIANCE (MANDATORY — Arabic market):
- NEVER render alcohol in any form: no wine glasses, beer bottles, champagne, cocktails, whiskey, spirits, or any drinking vessel that implies alcohol.
- NEVER render nightclub, bar, or pub interiors.
- NEVER render gambling elements: no cards, chips, roulette, slot machines.
- NEVER render pork products or pork-related food scenes.
- NEVER render dogs as pets (culturally sensitive in Gulf markets).
- NEVER render crosses, churches, or non-Islamic religious symbols unless specifically relevant to the product.
- NEVER render revealing or immodest clothing on any person — all figures should be dressed conservatively. Shoulders covered, no deep necklines, no short skirts/shorts.
- NEVER render mixed-gender physical contact (handshakes are acceptable).
- Luxury signaling should use: premium tea/coffee, luxury watches, fine dining (halal), architecture, cars, travel, nature — NOT alcohol or nightlife.
- If the universe mentions any bar/lounge/club setting, replace the alcohol elements with premium non-alcoholic beverages (Arabic coffee, tea, juice, water).
```

### 1.2 Insertion points

- **`generateBuildPlan()`**: inject the block immediately BEFORE the `TECHNICAL_PROMPT` section when `isArabic(inputs.adLanguage)` is true. Do not inject for any other language.
- **`buildFinalImagePrompt()`** (currently line 3848 of `generators.ts`): inject the same block near the top of the final image-model prompt (above the composition / lighting / camera notes), on every call where `isArabic(adLanguage)` is true. The block is injected here as reinforcement because image models sometimes ignore build-plan-level instructions.
- **Carousel flow**: the per-slide prompt assembly calls `buildFinalImagePrompt()` (or an equivalent per-slide assembler) for EACH slide. The block MUST appear in every slide's prompt for an Arabic carousel, not only slide 1 (FR-017).
- **Batch flow**: the per-item prompt assembly calls `buildFinalImagePrompt()` for EACH batch item. The block MUST appear in every item's prompt for an Arabic batch (FR-018).

### 1.3 Language gate

The block is injected if and only if `isArabic(adLanguage)` returns `true`. Equivalently: the ad-language code starts with `ar`. For any other value (including `undefined`, `null`, empty string, `'en'`, `'en-US'`, or any non-`ar*` locale), the block MUST NOT be injected.

### 1.4 Non-goals

- The block is NOT injected into caption-generation prompts today. Caption cultural safety is enforced via the trigger-word scan on the returned caption (see `trigger-word-scan.md`) — the block's role in the caption pipeline is future work if caption-level steering is needed, and is out of scope here.
- The block content is NOT localized. It remains in English regardless of `adLanguage` because the target model reads English system prompts. Arabic-language rendering is driven by other parts of the prompt.

## 2. `ARABIC_WARDROBE_BLOCK`

### 2.1 Content

```text
ARABIC MARKET WARDROBE RULES:
- All figures (male and female) must be dressed conservatively and modestly.
- Female figures: shoulders covered, no cleavage, skirt/dress below knee or trousers. Hijab ONLY if present in Box A — never add or remove it.
- Male figures: no tank tops, no shorts above knee. Business casual minimum.
- No swimwear, no gym wear showing skin, no lingerie or underwear visible.
- Luxury fashion is encouraged — but covered luxury (suits, abayas, elegant modest dresses, thobes).
```

### 2.2 Insertion points

- **Wardrobe section of `generateBuildPlan()`**: append the block to the existing wardrobe instructions when `isArabic(inputs.adLanguage)` is true.
- **Wardrobe section of `buildFinalImagePrompt()`**: append the block to the wardrobe instructions of the final prompt, on every call where `isArabic(adLanguage)` is true.
- Apply the same per-slide and per-item rules as the main compliance block.

### 2.3 Language gate

Same as §1.3 — injected iff `isArabic(adLanguage)` is true.

### 2.4 Non-goals

- The block does NOT add or remove hijab rules beyond what is stated. Hijab preservation logic is controlled by the "Box A" reference-image handling already in `generators.ts`; the wardrobe block only reaffirms it.
- The block does NOT dictate specific garment brands or styles beyond "covered luxury." Specific garment rendering is left to the model given the constraints.

## 3. Fixture obligations (HFC.9)

A passing implementation MUST have contract fixtures that assert:

1. An Arabic single ad (`adLanguage` starts with `ar`) has the compliance block text present in the build-plan prompt exactly once (or more — at least once) BEFORE the `TECHNICAL_PROMPT` boundary.
2. An Arabic single ad has the wardrobe block text present in the wardrobe section of the build-plan prompt.
3. An Arabic single ad has the compliance block present in the final image prompt produced by `buildFinalImagePrompt()`.
4. An Arabic carousel ad has the compliance block present in slide 3's prompt (and by implication every slide — the fixture asserts slide 3 specifically as a non-first-slide proof).
5. An Arabic batch ad has the compliance block present in batch item 2's prompt.
6. An English single ad (`adLanguage === 'en'` or similar) has NO occurrence of the compliance block or the wardrobe block in either the build-plan prompt or the final image prompt.

## 4. Invariants

- The block strings are identity-stable: changing their text is a breaking change to the fixture suite and requires a plan revision, not a silent edit.
- The block strings MUST be exported as named constants from `culturalCompliance.ts` and imported where used. Inlining the content at injection sites is forbidden (Principle XI).
