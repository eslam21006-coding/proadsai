# Hook Prompt Restructure — Batch Report

Branch: `prompt-restructure`
Scope: prompt **structure** inside `generateTOV` (`functions/src/generators.ts`).
Out of scope: the text of the Phase 22 quality constants, Phase 23 rotation logic,
`modelConfig.ts` constants, `SYSTEM_TOV`, carousel/retargeting prompt surfaces.

One section is appended per batch.

---

## Batch 0 — Baseline measurement (no code changes)

### Capture method

The compiled backend was built (`functions/lib`), then `functions/lib/generators.js` was
`require`d from a throwaway Node harness. The harness injects a capturing stub through the
exported `setGeminiCaller` (`generators.ts:1146`) and calls
`generateTOV(inputs, 'r_modern_office', 'initial')`. The stub records
`params.contents.parts[].text` — which at baseline is exactly
`` `${prompt}\n${hookQualityBlock}` `` from the call site at `generators.ts:3004-3005`,
i.e. the byte-exact string the production function submits to the model.

Firestore is not reachable from a local harness. `getRecentFingerprintsForRotation`
catches that internally and returns `[]`, so **Phase 23 rotation still executed** —
`drawDimensions` / `drawOpenings` produced real output (visible as the
`⚠️ PHASE 23 ROTATION (additive)` table in the captured prompt).

Harness and captured prompts live in a scratch directory outside the repo and are
never committed.

### Prompt size at baseline

Model resolved for the hook call: `gemini-3.7-flash` (`CREATIVE_MODEL_PRO`), one call.

| Sample | audience field | chars | UTF-8 bytes |
|---|---|---|---|
| 1 | school administrators | **40,834** | 48,365 |
| 2 | fitness trainers | **40,920** | 48,523 |
| 3 | e-commerce owners | **40,869** | 48,434 |

### Universality check — PASS

Normalizing only the random `GENERATION ID` seed and the four interpolated brief values
(`targetAudience`, `challenges`, `transformation`, `productName`), the three captured
prompts are **byte-identical**. Nothing else varies between the three niches.

### Block offset map — Sample 1 (40,834 chars)

| offset | depth | source | block |
|---|---|---|---|
| 1 | 0.0% | generators.ts:2394 | `[HOOK ARCHITECT V5.1]` header |
| 141 | 0.3% | :2397 | ORIGINALITY MANDATE |
| 527 | 1.3% | :2403 | CAMPAIGN MODE |
| 2,593 | 6.4% | :2408 | CREATIVE STRATEGY CONTROLS |
| 4,322 | 10.6% | :2418 | HOW TO COMBINE ANGLE + DELIVERY |
| 6,205 | 15.2% | :2457 | INPUT ANALYSIS (brief fields #1) |
| 6,628 | 16.2% | :2482 | LANGUAGE: MARKETING FUSHA |
| 6,830 | 16.7% | :2486 | ARABIC QUALITY |
| 7,442 | 18.2% | :2495 | THE 4 HOOKS |
| 7,616 | 18.7% | :2565 | CRITICAL ANGLE LOCK |
| 8,013 | 19.6% | :2572 | ANGLE COMPLIANCE TEST |
| 8,274 | 20.3% | hookAnglesKnowledge.ts:1579 (injected :2589) | **Phase 23 ROTATED DIMENSION FILL** |
| 10,623 | 26.0% | hookAnglesKnowledge.ts:414 | EMOTIONAL-NATIVE VARIATIONS |
| 12,716 | 31.1% | hookAnglesKnowledge.ts | Phase 23 rotation metadata |
| 12,848 | 31.5% | :2597 | DELIVERY FORMAT (`transformation_promise`) |
| 14,613 | 35.8% | :2634 | STRUCTURAL VARIATION |
| 14,796 | 36.2% | :2652 | **Phase 23 rotated dimension table** |
| 15,574 | 38.1% | :2682 | ANTI-REPETITION RULES |
| 16,533 | 40.5% | :2706 | SUBHEADLINE RULES |
| 17,265 | 42.3% | :2724 | CTA BENEFIT RULES |
| 17,528 | 42.9% | :2731 | BENEFIT HYPER-SPECIFIC |
| 22,266 | 54.5% | :2769 | COPYWRITING QUALITY RULES |
| 24,842 | 60.8% | :2809 | OUTPUT FORMAT banner |
| 24,938 | 61.1% | :2813 | USER SELECTED HOOK ANGLE |
| 25,138 | 61.6% | :2817 | MANDATORY LAYER CHECK |
| 25,647 | 62.8% | copywriting_knowledge.ts:702 (injected :2823) | **READING_LEVEL_BLOCK** |
| 26,505 | 64.9% | copywriting_knowledge.ts:719 (injected :2824) | **LIVED_SYMPTOM_BLOCK** |
| 27,444 | 67.2% | copywriting_knowledge.ts:739 (injected :2825) | **FABRICATION_POLICY_BLOCK** |
| 29,345 | 71.9% | :2827 | INSTRUCTIONS FOR EACH HOOK |
| 29,933 | 73.3% | :2831 | **BANNED_CTA_LIST line** |
| 30,352 | 74.3% | **:2833** | **static dimension override** (Batch 1 target #1) |
| 30,501 | 74.7% | :2835 | DIVERSITY RULE |
| 30,679 | 75.1% | **:2837-2844** | **static opening-structure list** (Batch 1 target #2) |
| 31,156 | 76.3% | :2847 | OUTPUT FORMAT (fill in values) |
| 31,270 | 76.6% | :2849 | `HOOK_START_A` … `HOOK_END_D` |
| 31,663 | 77.5% | :2912 | FINAL SELF-CHECK |
| 32,982 | 80.8% | :2928 | FORBIDDEN IN HOOK OUTPUT |
| 33,436 | 81.9% | injected :2935, built at **:2103** | `modeInstruction` — "PHASE 2: THEMATIC MARKETING FUSION" (6.9k chars = 17% of the prompt; contains METAPHOR RULE from universeCopyMap.ts:123 and brief fields #2) |
| 40,343 | 98.8% | :2950 | "Replace ALL placeholders" |
| 40,395 | 98.9% | **:2992** | **`hookQualityBlock`** (Batch 1 target #3) |

### Findings that changed the plan

1. **Line numbers in the task brief were ~8 lines off.** The real targets were `:2833`,
   `:2835-2845` and `:2991-2997` + `:3004-3005`.
2. **The Phase 22 quality blocks sit at 62.8–67.2% depth** and the contradicting static
   overrides sit *after* them at 74.3–75.1% — the static text was literally the last
   thing the model read before the output format.
3. **`modeInstruction` (6.9k chars, 17% of the prompt) trails everything**, at 82–99%
   depth, after the `HOOK_START_A` template. Batch 2 was therefore amended: the quality
   blocks and the new AUDIENCE GROUNDING section go at the very end of the prompt,
   after `modeInstruction`, immediately before the closing
   "Replace ALL placeholders" line.
4. **A second, older static dimension table exists at `:2662-2665`**
   (`| A | Financial/Revenue | …`). It is the *else-branch fallback* that fires only
   when Phase 23 produces no four drawn dimensions, so it did not appear in these
   captures. **Deliberately left in place** — it is a safety net, not an override.

---

## Batch 1 — Remove contradicting duplicates

All changes in `functions/src/generators.ts`. Line numbers below are pre-edit.

### Deletions

**1. Static dimension override — `:2833` (1 line, 149 chars)** — DELETED

```
- Hook A = FINANCIAL/REVENUE dimension. Hook B = TIME/LIFESTYLE dimension. Hook C = STATUS/IDENTITY dimension. Hook D = SKILL/CONFIDENCE dimension.
```

This was emitted at 74.3% depth and overrode the Phase 23 rotated dimensions injected
at 20.3% and 36.2%. The Phase 23 rotated block at `:2589` and the rotated dimension
table at `:2652-2660` are untouched.

**2. DIVERSITY RULE + static opening-structure list — `:2835-2845` (11 lines, 670 chars)** — DELETED

```
⚠️ DIVERSITY RULE (CRITICAL — READ BEFORE WRITING):
Each hook MUST use a COMPLETELY DIFFERENT sentence structure. Vary the opening word, sentence pattern, and emotional trigger.
Structure types to rotate (use each ONCE, pick 4):
- [percentage] + [audience] + [consequence]
- [question word] + [specific loss or pain]
- [imperative verb] + [action to stop/start]
- [ratio] + [surprising fact]
- [conditional "لو/إذا"] + [relatable scenario]
- [direct address "أنت"] + [identity challenge]
- [time reference] + [cost of delay]
FORBIDDEN: Two hooks starting the same way. Generate 100% ORIGINAL text — do NOT reuse phrases from any examples in this prompt.
```

The seven static structures overrode the Phase 23 rotated openings. The surrounding
DIVERSITY RULE framing and the FORBIDDEN line went with them per the approved range;
both are already covered upstream by ANTI-REPETITION RULES §1 (`:2687-2693`, opening
words used once each) and §3 (`:2701-2703`, no two hooks share a pattern), and by the
ORIGINALITY MANDATE at `:2397`.

Lines `:2833-2845` were removed as one contiguous range (the blank line `:2834`
between them went with it), leaving `:2832` followed directly by the blank line and
the `OUTPUT FORMAT (fill in the values…)` header.

**3. `hookQualityBlock` — `:2991-2997` (7 lines, 632 chars)** — DELETED

```ts
const hookQualityBlock = `
HOOK QUALITY FLOOR:
- Professional direct-response quality. Specific to "${inputs.productName || 'this offer'}" for "${inputs.targetAudience || 'this audience'}".
- Subheadlines must be complete sentences that end naturally.
- Numbers/stats are powerful but NOT mandatory — a strong emotional hook without numbers is fine.
- ${…startsWith('ar') ? 'Arabic: conversational business tone…' : 'English: sharp mentor tone…'}
- ORIGINALITY: Generate fresh copy. Do NOT reuse phrases from examples in this prompt.`;
```

The `Numbers/stats are powerful but NOT mandatory` line contradicted the Phase 22 hard
rules, and every other line restated an existing instruction in weaker words. Because
this block was appended *after* the whole prompt it was the single last instruction the
model read (98.9% depth).

**Call-site concatenation — `:3004-3005`** — the two-line template
`` `${prompt}\n${hookQualityBlock}` `` was replaced with the bare `prompt`:

```ts
contents: { parts: [{ text: prompt }] },
```

No other reference to `hookQualityBlock` remains anywhere in the file.

### Left in place, as instructed

`:2662-2665` — the older static dimension table
(`| A | Financial/Revenue | … | D | Skill/Confidence |`). It lives in the **else** branch
of the Phase 23 conditional at `:2650` and only renders when
`_phase23DrawnDimensions` is absent or not length 4. It is a fallback, not an override,
and never appeared in any capture. Not deleted.

### Step 4 — Other instructions stated twice in different words (reported, NOT deleted)

Line numbers are **post-Batch-1**.

| # | Instruction | Restated at | Note |
|---|---|---|---|
| 1 | The ANGLE's hard rule outranks the DELIVERY format | `:2418-2451` (HOW TO COMBINE, ~10 lines), `:2603-2606` (REMEMBER THE LAYERS), `:2804-2808` (MANDATORY LAYER CHECK), `:2902-2903` (PRIORITY 1 CHECK) | 4 separate restatements of one rule |
| 2 | All 4 hooks use the selected angle; vary execution only | `:2412`, `:2566-2570` (ANGLE LOCK), `:2650-2651`, `:2800-2801`, `:2904` | 5 restatements |
| 3 | All 4 hooks use the selected delivery style; format is constant | `:2414`, `:2445`, `:2451`, `:2659`, `:2668`, `:2606`, `:2802`, `:2906` | 8 restatements |
| 4 | Subheadline must complement, not repeat, the headline | `:2709`, `:2717-2721`, `:2782-2783`, `:2909` (self-check) | 4 restatements, 3 different wordings |
| 5 | Subheadline must be a complete sentence, never ending on a conjunction | `:2488` (ARABIC QUALITY #1), `:2784-2785`, `:2790-2791` (explicit Arabic conjunction list), `:2816` (INSTRUCTIONS) | 4 restatements |
| 6 | Copy must not be generic / must not work for any other product | `:2734`, `:2754`, `:2786`, `:2794`, `:2801` | 5 restatements. Batch 2's AUDIENCE GROUNDING is the intended consolidation point for this rule |
| 7 | Originality — do not reuse example phrasing from the prompt | `:2397-2399` (ORIGINALITY MANDATE), `:2630` (else-branch only), `:2755`, `:2757` | 4 restatements (was 6 before Batch 1) |
| 8 | Opening words must not repeat across hooks | `:2687-2693` (ANTI-REPETITION §1), `:2907` (self-check), plus the Phase 23 rotated-openings block | 3 restatements |
| 9 | The CTA benefit must be specific to the CHALLENGES field | `:2731-2735`, `:2743`, `:2754`, `:2757` | 4 restatements |

None of these are self-contradictory the way the three deleted blocks were — they are
redundant rather than conflicting. **Nothing beyond steps 1–3 was deleted.**

### Pre-existing universality violations found while auditing (reported, NOT changed)

These are in the current prompt and will appear in all three sample captures during the
Batch 5 universality diff. They pre-date this task, so they were left alone.

| Location | Text | Why it matters |
|---|---|---|
| `:2798` | fallback default `'coaches and consultants'` for `targetAudience` | names an audience; fires only when the field is empty |
| `:2799` | fallback default `'pricing too low, losing premium clients'` for `challenges` | names a niche pain; fires only when the field is empty |
| `:2800` | fallback default `'charge premium prices with confidence'` for `transformation` | names a niche outcome; fires only when the field is empty |
| `:2801` | `If the subheadline could work for a restaurant, a gym, or a tech startup — it's TOO GENERIC.` | **names three industries unconditionally — present in every prompt for every niche** |

`:2801` is the only one that is always emitted. Awaiting a decision on whether to
rephrase it industry-neutrally.

### Result

| Sample | baseline chars | after Batch 1 | delta |
|---|---|---|---|
| 1 | 40,834 | **39,590** | −1,244 |
| 2 | 40,920 | **39,659** | −1,261 |
| 3 | 40,869 | **39,614** | −1,255 |

`cd functions && npm run build` → **exit 0, zero TypeScript errors.**

---

## Batch 2 — Reposition quality rules + add audience grounding

All changes in `functions/src/generators.ts`. Line numbers below are **pre-edit**
(post-Batch-1) unless marked otherwise.

### Batch 1 follow-up applied

**`:2801` rewritten** — the only unconditional universality violation in the prompt.

```diff
-- If the subheadline could work for a restaurant, a gym, or a tech startup — it's TOO GENERIC. Rewrite it.
+- If the subheadline could work for a completely different business in a different industry without changing a word — it's TOO GENERIC. Rewrite it.
```

**`:2798-2800` left in place** as decided — the three fallback defaults
(`'coaches and consultants'`, `'pricing too low, losing premium clients'`,
`'charge premium prices with confidence'`) fire only when the corresponding brief field
is empty.

> **Follow-up item (not this task):** those three fallbacks are a form-validation gap,
> not a prompt gap. A brief that reaches `generateTOV` with an empty `targetAudience`,
> `challenges` or `transformation` will silently be written as if it were a
> coaching/consulting offer. The fix belongs in input validation, not here.

### Blocks moved

The four quality items were moved out of **both** branches of the output-format
conditional and emitted **once** in the shared prompt tail, after `modeInstruction`
and immediately before the closing `CRITICAL: Replace ALL placeholders` line.

| Item | FROM | TO (post-edit) |
|---|---|---|
| `${READING_LEVEL_BLOCK}` | `:2823` (cold branch) **and** `:2861` (else branch) | `:2941` |
| `${LIVED_SYMPTOM_BLOCK}` | `:2824` (cold branch) **and** `:2862` (else branch) | `:2942` |
| `${FABRICATION_POLICY_BLOCK}` | `:2825` (cold branch) **and** `:2863` (else branch) | `:2943` |
| `- BANNED CTAs …${BANNED_CTA_LIST.join(', ')}…` | `:2831` (cold branch) **and** `:2868` (else branch) | `:2944` |

The two branch copies were byte-identical, so the move also collapses a two-way
duplication into a single emission. **No character of any Phase 22 constant was
edited** — only the `${...}` interpolation sites moved. The `BANNED_CTA_LIST` line was
moved verbatim, leading `- ` included.

`modeInstruction` was **not** moved. It is still injected at its original site
(now `:2913`) and now renders *before* the audience grounding and quality blocks
instead of after them.

### Section added

New AUDIENCE GROUNDING section at **`:2928-2939`** (post-edit), immediately before the
moved quality blocks. Exact code added:

```
═══════════════════════════════════════════════════════════════════════════════
AUDIENCE GROUNDING (MANDATORY — every hook must pass this test)
═══════════════════════════════════════════════════════════════════════════════

The target audience is: ${inputs.targetAudience}
Their daily pain is: ${inputs.challenges}
The transformation they want: ${inputs.transformation}

1. Every hook MUST contain at least one word or phrase that only someone in this specific audience would instantly recognize. Draw that vocabulary from the audience and daily pain fields above. Abstract words that could apply to any business — chaos, stability, success, system, growth, transformation — FAIL this test on their own.
2. Before writing each hook, ask: could this exact hook be shown to a completely different audience in a different industry without changing a single word? If yes, it is too vague. Rewrite it using the specifics above.
3. The subheadline must name the mechanism or product that delivers the transformation. It must NOT restate the hook in different words.
4. Do not invent details about the audience that are not present in the fields above. If the audience field is broad, ground the hook in the daily pain field instead.
```

The `═` banner around the heading matches the formatting of every other section in this
prompt; it adds no instruction text.

**Universality:** the block contains no industry name, no example audience, no sample
vocabulary and no worked example. Every audience-specific word arrives through the three
`${...}` interpolations. The five abstract words named in rule 1 (`chaos, stability,
success, system, growth, transformation`) are the words being *banned as too generic* —
they are not niche vocabulary and apply to every industry equally.

### Resulting prompt order (verified against a fresh capture)

| depth | block |
|---|---|
| … | everything else, unchanged |
| 65.6% | FINAL SELF-CHECK |
| 68.9% | FORBIDDEN IN HOOK OUTPUT |
| 71.0% | `modeInstruction` (unmoved, 6.5k chars) |
| **87.0%** | **AUDIENCE GROUNDING** |
| **89.9%** | **READING_LEVEL_BLOCK** |
| **92.0%** | **LIVED_SYMPTOM_BLOCK** |
| **94.3%** | **FABRICATION_POLICY_BLOCK** |
| **98.9%** | **BANNED_CTA_LIST line** |
| 99.5% | `CRITICAL: Replace ALL placeholders…` (closing line) |

The output format section (`HOOK_START_A` … `HOOK_END_D`) now sits at 64.7%, and every
quality rule follows it. The four quality items occupy the final **10.1%** of the prompt.

### Verification on the fresh capture (sample 1)

| check | result |
|---|---|
| static `Hook A = FINANCIAL/REVENUE` override | absent |
| static `Structure types to rotate` list | absent |
| `HOOK QUALITY FLOOR` | absent |
| `restaurant / gym / tech startup` | absent |
| `READING LEVEL — 6TH GRADE` occurrences | 1 (was 1, from 2 source sites) |
| `BANNED CTAs (do NOT author` occurrences | 1 (was 1, from 2 source sites) |
| prompt ends on the "Replace ALL placeholders" line | yes |

### Universality check — PASS

Normalizing only the `GENERATION ID` seed and the four brief values, the three
post-Batch-2 prompts are **byte-identical**.

### Size

| Sample | baseline | after B1 | after B2 | vs baseline |
|---|---|---|---|---|
| 1 | 40,834 | 39,590 | **40,899** | +65 |
| 2 | 40,920 | 39,659 | **40,984** | +64 |
| 3 | 40,869 | 39,614 | **40,927** | +58 |

The audience grounding section costs ~1,309 chars, which very nearly offsets the 1,244
chars removed in Batch 1. The prompt is the same size as it was at baseline, but the
contradictions are gone and the quality rules now sit last.

`cd functions && npm run build` → **exit 0, zero TypeScript errors.**
