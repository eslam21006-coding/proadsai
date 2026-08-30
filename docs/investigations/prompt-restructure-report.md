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

---

## Batch 3 — Vary sentence structure within the delivery style

The delivery style is **not** removed. It now varies within itself.

### 9. `transformation_promise` FORMAT GUIDE rewritten

`functions/src/knowledge/hookTypesKnowledge.ts:277-279` → **`:277-285`**

Before (one literal template, Arabic-only word order, applied to all 4 hooks):

```
transformation_promise: `FORMAT GUIDE: Present all 4 hooks as SPECIFIC TRANSFORMATION promises with timeline.
Structure: "من [before] إلى [after] في [timeframe]"
Each hook promises transformation in a different dimension: income, time, status, confidence.`,
```

After:

```
transformation_promise: `FORMAT GUIDE: Present all 4 hooks as SPECIFIC TRANSFORMATION promises with a timeframe.
CONCEPT — NOT A TEMPLATE: every hook must carry the same three ingredients — a before-state, an after-state, and a timeframe. There is NO fixed word order. HOW those ingredients are arranged into a sentence MUST be different for every hook.
Use each of these four sentence structures exactly once:
- Hook A — QUESTION FORM: pose the transformation as a question the reader answers in their own head.
- Hook B — AFTER-STATE FIRST: open on the after-state, then reveal what it replaced and how long it took.
- Hook C — TIMEFRAME FIRST: open on the timeframe, then the transformation that fits inside it.
- Hook D — IMPERATIVE FORM: a direct command to make the change, with the after-state and timeframe attached.
⚠️ All 4 hooks must express a transformation with a timeframe. NO TWO hooks may use the same sentence structure. If two hooks end up with the same shape, rewrite one of them.
⚠️ Any of the three ingredients may be implied by context instead of stated in a fixed slot, as long as the reader still feels the before → after change and the time it takes.
Each hook promises transformation in a different dimension: income, time, status, confidence.`,
```

The before → after → timeframe semantic content is preserved; only the prescribed
*syntax* changed from one shape to four. The guidance describes sentence structure
only — no example sentences, no industry vocabulary, and the Arabic-specific
`من X إلى Y في Z` word order is gone, so the guide now works for English briefs too.

The final line (`income, time, status, confidence`) was **left byte-identical** — see
the open question below.

### 10. Other sites that restated the literal template

Line numbers are current (post-Batch-2). The task cited pre-Batch-1 numbers; the
mapping is given.

| Site (task ref → current) | Restates the literal template? | Action |
|---|---|---|
| `generators.ts:2607` → **`:2599`** | No. This is the injection point `${getDeliveryStyleFormatOverride(...)}` — it carries no template of its own. | none |
| `generators.ts:2611-2613` → **`:2603-2605`** | No. "REMEMBER THE LAYERS" states that the angle's hard rule outranks the delivery format. No sentence shape. | none |
| `generators.ts:2667` → **`:2659` and `:2668`** | **Yes — re-pins the structure.** `⚠️ ALL hooks must be delivered as TRANSFORMATION_PROMISE — the format/style is constant.` "format is constant" directly contradicts "no two hooks may share a sentence structure". | **CHANGED** |
| `hookAnglesKnowledge.ts:686` | **Yes — the strongest re-pin in the prompt.** `DELIVERY_FORMATS.transformation_promise` was `'a specific transformation + timeline (من X إلى Y في Z)'`, and `getAnglePlusDeliveryInstruction` interpolates that string **three times** (STEP 2, THINK LIKE THIS, NOT LIKE THIS), so the literal template reached the model three more times per prompt. | **CHANGED** |

**Change at `generators.ts:2659` and `:2668`** (both branches of the Phase 23
conditional — the rotated branch and the fallback branch — carried the identical line):

```diff
-⚠️ ALL hooks must be delivered as ${inputs.hookType.toUpperCase()} — the format/style is constant.
+⚠️ ALL hooks must be delivered as ${inputs.hookType.toUpperCase()} — the delivery STYLE is constant across all 4. The SENTENCE STRUCTURE inside that style must still be different for every hook.
```

This line is emitted for *every* delivery style, not just `transformation_promise`.
The change is consistent with the rest of the catalogue — `question` already says
"Vary question types", `listicle` "a different number and framing", `comedic` "each
hook uses different humor" — so structural variation inside a constant style was
always the intent; the old wording contradicted it.

**Change at `hookAnglesKnowledge.ts:686`:**

```diff
-    transformation_promise: 'a specific transformation + timeline (من X إلى Y في Z)',
+    transformation_promise: 'a specific transformation with a timeframe — a before-state, an after-state and how long it takes, arranged in a DIFFERENT sentence structure for each of the 4 hooks (question form / after-state first / timeframe first / imperative form) with no fixed word order',
```

Both `getDeliveryStyleFormatOverride` and `getAnglePlusDeliveryInstruction` are consumed
**only** by the `generateTOV` cold-hook prompt (`generators.ts:2599` and `:2601`). No
carousel or retargeting surface reads them, so neither was touched.

**Verified on a fresh capture:** the literal template no longer appears anywhere in the
assembled prompt.

### 11. Other delivery styles that pin all 4 hooks to one sentence shape — REPORTED ONLY, NOT CHANGED

All in `hookTypesKnowledge.ts` `getDeliveryStyleFormatOverride`. None were modified.

| Style | Line | Pinning `Structure:` line | Severity |
|---|---|---|---|
| `misconception` | :274 | `"You think [common belief]? Actually, [surprising truth]"` | **Strong** — a literal quoted sentence, same as `transformation_promise` was |
| `threat` | :286 | `"If you keep doing [X], [Y consequence] is inevitable"` | **Strong** — literal quoted sentence |
| `listicle` | :270 | `"[N] [things/secrets/mistakes/steps] that [promise/consequence]"` | **Strong** — literal quoted sentence |
| `controversial` | :243 | `[Everyone believes X] + [But actually the opposite is true]` | Moderate — bracket schema; only the belief varies |
| `personal_story` | :248 | `[Specific moment in time] + [What happened] + [Emotional impact]` | Moderate — the four "chapters" vary the content, not the shape |
| `storytelling` | :253 | `[Character] + [Situation] + [Unexpected turn]` | Moderate |
| `curiosity_gap` | :291 | `[Unexpected claim] + [Implied secret that is NOT revealed]` | Moderate |
| `shocking_stat` | :258 | `[Jaw-dropping number] + [What it means for the reader]` | Mild — varies the *kind* of number, not the sentence |
| `comedic` | :265 | `[Funny observation] → [Punchline that reveals truth]` | Mild — four humor types, one 2-beat shape |
| `pain_point` | :282 | `[Vivid pain scenario that feels personal and current]` | Mild — a single loose beat, barely a template |
| `question` | :239-240 | — | **None.** The only style that already varies sentence type ("Yes/No question, 'Why' question, 'What if' question, Rhetorical challenge") |

The same literal templates are mirrored in `hookAnglesKnowledge.ts` `DELIVERY_FORMATS`
for `misconception` (:678), `storytelling` (:684) and `threat` (:688), so each of those
also reaches the model three extra times through `getAnglePlusDeliveryInstruction`.

Applying the Batch 3 treatment to `misconception`, `threat` and `listicle` would be the
highest-value follow-up; `question` is the model to copy.

### Open question for the product owner

The last line of the rewritten `transformation_promise` guide —
`Each hook promises transformation in a different dimension: income, time, status, confidence.` —
is a **static four-dimension list**, functionally the same kind of override that Batch 1
deleted from `generators.ts:2833`. It reaches the model at ~31% depth, between the
Phase 23 rotated dimensions at 20% and the rotated dimension table at 36%. It was left
byte-identical because Batch 3's approved scope was sentence structure, not dimensions.
The same static list appears in several other delivery styles. Deleting it would let
Phase 23 own dimension selection outright — awaiting a decision.

### Universality check — PASS

Normalizing only the `GENERATION ID` seed and the four brief values, the three
post-Batch-3 prompts are **byte-identical**. The new guidance names no industry, no
example audience and no sample sentence.

### Size

| Sample | baseline | after B2 | after B3 | vs baseline |
|---|---|---|---|---|
| 1 | 40,834 | 40,899 | **42,633** | +1,799 |
| 2 | 40,920 | 40,984 | **42,718** | +1,798 |
| 3 | 40,869 | 40,927 | **42,661** | +1,792 |

~900 chars come from the expanded FORMAT GUIDE (one emission) and ~850 from the longer
`DELIVERY_FORMATS` string, which `getAnglePlusDeliveryInstruction` interpolates three
times. Trimming that triple interpolation is a candidate for a later pass.

Both `npm run build` runs → **exit 0, zero TypeScript errors.**

### Batch 3 addendum — two follow-up changes

#### A. Static dimension list removed from the `transformation_promise` guide

`functions/src/knowledge/hookTypesKnowledge.ts:285` — DELETED:

```
Each hook promises transformation in a different dimension: income, time, status, confidence.
```

Same override as the one Batch 1 deleted from `generators.ts:2833`, in a different
file. Phase 23 owns dimension selection. The guide now ends on the "ingredients may be
implied by context" line.

#### Other delivery styles carrying a static per-hook list — REPORTED, NOT CHANGED

Only **one** other style enumerates *audience life dimensions* the way the deleted line
did — the rest enumerate a rhetorical device or technique, which is orthogonal to what
Phase 23 rotates and does not collide with it.

| Style | Line | Static per-hook list | Collides with Phase 23 dimensions? |
|---|---|---|---|
| `threat` | :293 | `Each hook warns about a different threat: financial, competitive, time-based, reputation-based.` | **YES — same failure mode.** These are life dimensions, and `financial` / `time-based` map directly onto Phase 23's rotated set |
| `shocking_stat` | :259 | `a different kind of number: percentage, dollar amount, ratio, or time metric` | No — number *type*, not audience dimension |
| `comedic` | :266-267 | `Self-deprecating, Absurd comparison, Ironic truth, Relatable daily scenario` | No — humor technique |
| `curiosity_gap` | :292 | `hidden knowledge, counterintuitive fact, untold story, forbidden truth` | No — loop type |
| `personal_story` | :249 | `failure moment, turning point, discovery moment, transformation moment` | No — narrative stage |
| `listicle` | :271 | `"3 secrets", "5 mistakes", "7 signs", "1 thing"` | No — but it hardcodes four literal example values |
| `question` :239-240, `controversial` :242/:245, `storytelling` :254, `misconception` :275, `pain_point` :289 | — | none (they say "a different X" without enumerating) | — |

`threat:293` is the one worth deleting in the follow-up task.

#### B. Triple interpolation of `DELIVERY_FORMATS` trimmed to one

`functions/src/knowledge/hookAnglesKnowledge.ts:734-735` in
`getAnglePlusDeliveryInstruction`.

`${deliveryFormat}` was interpolated three times: **STEP 2**, **THINK LIKE THIS**, and
**NOT LIKE THIS**. It is now interpolated **once**, at **STEP 2**.

```diff
-THINK LIKE THIS: "I need [${angleRule}] → now I'll phrase it as [${deliveryFormat}]"
-NOT LIKE THIS: "I need [${deliveryFormat}] → maybe I'll add the angle's element if I feel like it"
+THINK LIKE THIS: "I need [${angleRule}] → now I'll phrase that in the STEP 2 delivery format"
+NOT LIKE THIS: "I'll write something in the STEP 2 delivery format → maybe I'll add the angle's element if I feel like it"
```

**Why STEP 2 is the position kept:** it is the only one of the three that is an
*instruction*. STEP 1 → STEP 2 → RESULT is the operative sequence the model follows, and
STEP 2 is where the format is first introduced and where it is read in natural order.
THINK LIKE THIS / NOT LIKE THIS are illustrative reinforcement of *priority ordering*
(angle first, format second) — that lesson survives intact when they refer back to
"the STEP 2 delivery format" instead of restating it. Keeping the copy in either of
those two instead would have put the format's only appearance inside a quoted example,
below the numbered steps, which is a weaker position for an instruction.

`DELIVERY_FORMATS` text itself was not changed. The trim benefits **every** angle +
delivery combination, not just `transformation_promise`.

**Verified on a fresh capture:** the delivery-format string now appears exactly **once**
in the assembled prompt (was 3×), and `income, time, status, confidence` is gone.

#### Size after both follow-ups

| Sample | baseline | after B3 | after B3 addendum | vs baseline |
|---|---|---|---|---|
| 1 | 40,834 | 42,633 | **42,083** | +1,249 |
| 2 | 40,920 | 42,718 | **42,168** | +1,248 |
| 3 | 40,869 | 42,661 | **42,111** | +1,242 |

−550 chars from the two follow-ups. Universality re-checked: the three normalized
prompts remain **byte-identical**. `npm run build` in `functions/` → exit 0.

---

## Batch 4 — Send the project id from the frontend

All changes in `src/App.tsx`. `currentProjectId` is declared at `src/App.tsx:1736`.

### Why this matters

Phase 23's rotation seed is `makeProjectSeed(userId, projectId, angle)`. The backend
reads the project id at four sites as
`((inputs as any)._projectId as string | undefined) || (inputs as any).projectId`:

| Backend read site (task ref → current) |
|---|
| `generators.ts:2382` → **`:2374`** (generateTOV — Phase 23 rotation pre-compute) |
| `generators.ts:3158` → **`:3137`** (concept director) |
| `generators.ts:8603` → **`:8582`** (batch) |
| `generators.ts:9079` → **`:9058`** (carousel) |

The frontend never sent either field, so `projectId` was always `undefined` and the seed
collapsed to a function of user + angle alone. Every project belonging to one user, on
one hook angle, drew the **same** dimensions and openings. The field name must be
exactly `_projectId`.

### 13. The two payloads in `handleStartDesign`

| Site | Change |
|---|---|
| `src/App.tsx:5628` | `setInputs({ ...formData, _userId: user?.uid, _projectId: currentProjectId, competitorContext } as any)` |
| `src/App.tsx:5635` | `const cleanInputs = { ...formData, personalPhotos: [], brandLogos: [], _userId: user?.uid, _projectId: currentProjectId, competitorContext }` |

### 14. Every other hook-generation call site

All four remaining `gemini.generateTOV` call sites pass the `inputs` **state** object
rather than a freshly built payload. Adding `_projectId` at `:5628` alone would cover
them *only* when the user walked through `handleStartDesign` in the same session — and
it would silently fail on the paths that repopulate `inputs` from elsewhere:
`src/App.tsx:4438` (startup auto-restore), `:5303` (load saved project), `:8435`
(template load), `:9865` (render-record load) and `:13091`/`:13093` (project restore),
none of which carry `_projectId`. A user who opens a saved project and clicks
"refresh hooks" would have gone straight back to the undefined-seed behaviour.

So `_projectId` is now passed **explicitly** at every call site instead of relying on
state inheritance:

| Site | Function | Verdict before | Change |
|---|---|---|---|
| `src/App.tsx:5674` | `handleStartDesign` — single mode | covered via `cleanInputs` (:5635) | none needed |
| `src/App.tsx:5754` | `handleRefreshHooks` (universe switch) | **missing** | `{ ...inputs, _projectId: currentProjectId } as any` |
| `src/App.tsx:5815` | `handleGlobalHookRefinement` | **missing** | `{ ...inputs, _projectId: currentProjectId } as any` |
| `src/App.tsx:5976` | precision single-hook edit | **missing** | `{ ...inputs, _projectId: currentProjectId } as any` |
| `src/App.tsx:8978` | "more like this" in-card variation | **missing** | `{ ...inputs, _projectId: currentProjectId } as any` |

Six edits in total. Carousel and batch paths (`generateCarouselAngles`,
`generateTestimonialCarousel`) were **not** touched — they are separate prompt surfaces
and out of scope for this task, though `generators.ts:9058` shows the carousel path
reads `_projectId` too and would benefit from the same treatment later.

### Transport verified

`src/services/geminiService.ts:568-582` forwards `sanitizeInputs(inputs)` to the
callable. `sanitizeInputs` (`:46-54`) shallow-copies the whole object and only clears
`personalPhotos` / truncates `brandLogos`, so `_projectId` survives — the same route
`_userId` already takes today.

### Build

`npm run build` at the frontend root → **exit 0**, only the pre-existing chunk-size and
dynamic-import advisories. `cd functions && npm run build` → **exit 0**.

---

## Batch 5 — Final measurement

Same harness, same three fixtures, same method as Batch 0.

### Size — final vs baseline

| Sample | baseline | final | delta |
|---|---|---|---|
| 1 — school administrators | 40,834 | **42,082** | +1,248 (+3.1%) |
| 2 — fitness trainers | 40,920 | **42,167** | +1,247 (+3.0%) |
| 3 — e-commerce owners | 40,869 | **42,110** | +1,241 (+3.0%) |

The prompt is ~3% longer. That is the net of −1,244 removed in Batch 1, −550 in the
Batch 3 addendum, +1,309 for AUDIENCE GROUNDING and ~+1,750 for the four-structure
delivery guide. This refactor was about **order and contradiction**, not length.

### Final block map — Sample 1 (42,082 chars)

| offset | depth | source | block |
|---|---|---|---|
| 1 | 0.0% | generators.ts:2394 | `[HOOK ARCHITECT V5.1]` header |
| 141 | 0.3% | :2397 | ORIGINALITY MANDATE |
| 527 | 1.3% | :2403 | CAMPAIGN MODE |
| 2,593 | 6.2% | :2408 | CREATIVE STRATEGY CONTROLS |
| 4,322 | 10.3% | :2418 | HOW TO COMBINE ANGLE + DELIVERY |
| 6,205 | 14.7% | :2457 | INPUT ANALYSIS (brief fields) |
| 6,628 | 15.8% | :2482 | LANGUAGE: MARKETING FUSHA |
| 6,830 | 16.2% | :2486 | ARABIC QUALITY |
| 7,442 | 17.7% | :2495 | THE 4 HOOKS |
| 7,616 | 18.1% | :2565 | CRITICAL ANGLE LOCK |
| 8,013 | 19.0% | :2572 | ANGLE COMPLIANCE TEST |
| 8,274 | 19.7% | hookAnglesKnowledge.ts:1579 | **Phase 23 ROTATED DIMENSION FILL** |
| 10,623 | 25.2% | hookAnglesKnowledge.ts:414 | EMOTIONAL-NATIVE VARIATIONS |
| 12,716 | 30.2% | hookAnglesKnowledge.ts | Phase 23 rotation metadata |
| 12,848 | 30.5% | :2597 | DELIVERY FORMAT — now four sentence structures |
| 15,700 | 37.3% | :2634 | STRUCTURAL VARIATION |
| 15,883 | 37.7% | :2652 | **Phase 23 rotated dimension table** |
| 16,757 | 39.8% | :2682 | ANTI-REPETITION RULES |
| 17,716 | 42.1% | :2706 | SUBHEADLINE RULES |
| 18,448 | 43.8% | :2724 | CTA BENEFIT RULES |
| 18,711 | 44.5% | :2731 | BENEFIT HYPER-SPECIFIC |
| 23,449 | 55.7% | :2769 | COPYWRITING QUALITY RULES |
| 26,066 | 61.9% | :2809 | OUTPUT FORMAT banner |
| 26,162 | 62.2% | :2813 | USER SELECTED HOOK ANGLE |
| 26,362 | 62.6% | :2817 | MANDATORY LAYER CHECK |
| 26,870 | 63.9% | :2823 | INSTRUCTIONS FOR EACH HOOK |
| 27,526 | 65.4% | :2829 | OUTPUT FORMAT (fill in the values) |
| 27,640 | 65.7% | :2831 | `HOOK_START_A` … `HOOK_END_D` |
| 28,033 | 66.6% | :2890 | FINAL SELF-CHECK |
| 29,352 | 69.7% | :2906 | FORBIDDEN IN HOOK OUTPUT |
| 30,212 | 71.8% | injected :2913, built at :2103 | `modeInstruction` (6.5k chars — the largest single block) |
| **36,753** | **87.3%** | **:2929** | **AUDIENCE GROUNDING** |
| **37,942** | **90.2%** | copywriting_knowledge.ts:702 | **READING_LEVEL_BLOCK** |
| **38,800** | **92.2%** | copywriting_knowledge.ts:719 | **LIVED_SYMPTOM_BLOCK** |
| **39,739** | **94.4%** | copywriting_knowledge.ts:739 | **FABRICATION_POLICY_BLOCK** |
| **41,639** | **98.9%** | **:2944** | **BANNED_CTA_LIST line** |
| 41,993 | 99.8% | :2946 | `CRITICAL: Replace ALL placeholders…` (last line) |

**Position confirmed.** The four Phase 22 quality items occupy the final **9.8%** of the
prompt (were at 62.8–73.3%). AUDIENCE GROUNDING opens that closing run at **87.3%**, so
grounding + quality rules together are the final **12.7%** and nothing but the one-line
closer follows them. The prompt now ends on
`CRITICAL: Replace ALL placeholders with real copy.`

### Removed-block verification — all clear

| Block | Baseline | Final |
|---|---|---|
| `Hook A = FINANCIAL/REVENUE dimension…` static override | present at 74.3% | **absent** |
| `Structure types to rotate (use each ONCE, pick 4)` + 7 openings | present at 75.1% | **absent** |
| `HOOK QUALITY FLOOR` (`hookQualityBlock`) | present at 98.9% | **absent** |
| `income, time, status, confidence` delivery dimension list | present at 31.5% | **absent** |
| `من [before] إلى [after] في [timeframe]` literal template | present 4× | **absent** |

Occurrence counts in the final prompt: READING_LEVEL block **1×** (from 2 source sites
before), BANNED_CTA line **1×** (from 2 source sites), delivery-format string **1×**
(was 3×).

### Universality check — PASS

Normalizing only the `GENERATION ID` seed and the four brief values, the three final
prompts are **byte-identical**. Every audience-specific word in the prompt arrives
through runtime interpolation of the brief.

A scan for hardcoded industry vocabulary across all three prompts returns exactly one
hit, and it is **pre-existing and out of scope**:

> `FABRICATION_POLICY_BLOCK` (`copywriting_knowledge.ts:747, 748, 766, 767`) uses
> `"Ahmed, a Riyadh-based coach, tripled his calls in 30 days."` and
> `"9 out of 10 coaches leak leads here."` as its examples of *fabricated claims that
> must be flagged*.

Four occurrences, identical to the baseline count — this task introduced none. They are
illustrations of a claim **type**, not vocabulary the model is told to draw from, and
`FABRICATION_POLICY_BLOCK` is a Phase 22 constant this task is forbidden to edit. Logged
as a follow-up below.

### Builds

| Target | Command | Result |
|---|---|---|
| Backend | `cd functions && npm run build` | **exit 0**, zero TypeScript errors |
| Frontend | `npm run build` (repo root) | **exit 0**; only the pre-existing chunk-size and dynamic-import advisories, unchanged from `main` |

---

## Summary of the whole task

| # | Change | Files |
|---|---|---|
| 1 | Deleted static dimension override that beat Phase 23 rotation | `generators.ts:2833` |
| 2 | Deleted static 7-opening structure list that beat Phase 23 rotation | `generators.ts:2835-2845` |
| 3 | Deleted `hookQualityBlock` (contradicted Phase 22; was the last thing the model read) | `generators.ts:2991-2997`, call site `:3004-3005` |
| 4 | Rewrote the one unconditional industry-naming line | `generators.ts:2801` |
| 5 | Moved the 4 quality items out of both output-format branches to a single emission in the prompt tail | `generators.ts` → `:2941-2944` |
| 6 | Added AUDIENCE GROUNDING, fully interpolation-driven | `generators.ts:2928-2939` |
| 7 | `transformation_promise` now prescribes 4 sentence structures instead of 1 template | `hookTypesKnowledge.ts:277-285` |
| 8 | Removed the static dimension list from that guide | `hookTypesKnowledge.ts:285` |
| 9 | Removed the literal template from `DELIVERY_FORMATS` | `hookAnglesKnowledge.ts:686` |
| 10 | `format/style is constant` → style constant, structure varies | `generators.ts:2659`, `:2668` |
| 11 | Delivery format injected once instead of three times | `hookAnglesKnowledge.ts:734-735` |
| 12 | Frontend sends `_projectId` at all five hook-generation call sites | `App.tsx:5628, 5635, 5754, 5815, 5976, 8978` |

Phase 23 rotation logic, the text of the Phase 22 constants, `modelConfig.ts`,
`SYSTEM_TOV`, and the carousel/retargeting prompt surfaces were not modified.

### Follow-up items — deliberately NOT fixed in this task

1. **`hookTypesKnowledge.ts:293` — `threat` static dimension list.**
   `Each hook warns about a different threat: financial, competitive, time-based,
   reputation-based.` Same override we deleted twice (`generators.ts:2833`,
   `hookTypesKnowledge.ts:285`) — these are audience life dimensions and they collide
   with what Phase 23 rotates.

2. **Literal sentence templates still pinning all 4 hooks to one shape:**
   `misconception` (`hookTypesKnowledge.ts:274`,
   `"You think [common belief]? Actually, [surprising truth]"`),
   `threat` (`:286`, `"If you keep doing [X], [Y consequence] is inevitable"`),
   `listicle` (`:270`, `"[N] [things/secrets/mistakes/steps] that [promise/consequence]"`).
   Same failure mode `transformation_promise` had. `misconception` (:678),
   `storytelling` (:684) and `threat` (:688) also mirror their templates into
   `hookAnglesKnowledge.ts` `DELIVERY_FORMATS`. `question` (`:239-240`) is the model to
   copy — it is the only style that already varies sentence type.

3. **Carousel path needs the `_projectId` treatment too.**
   `generators.ts:9058` reads `_projectId` for `makeProjectSeed` on the carousel
   surface, but the frontend carousel calls (`App.tsx:5669`, `:5752`, `:5809`, `:8977`
   via `gemini.generateCarouselAngles`, and `generateTestimonialCarousel` at `:5662`)
   still do not send it. Batch 4 deliberately stopped at the single-hook path because
   carousel is a separate prompt surface. Until it is done, carousel rotation is still
   seeded on user + angle alone. `generators.ts:8582` (batch) is in the same position.

4. **`modeInstruction` is 6.5k chars — the largest single block in the prompt** (15.5%
   of it), injected at `generators.ts:2913` and built at `:2103`. It sits between the
   output format and the closing quality run. It was left untouched by design; whether
   it earns its length is worth a separate look.

5. **`generators.ts:2798-2800` fallback defaults** (`'coaches and consultants'`,
   `'pricing too low, losing premium clients'`, `'charge premium prices with
   confidence'`) fire when a brief field is empty. This is an input-validation gap, not
   a prompt gap.

6. **`FABRICATION_POLICY_BLOCK` niche examples** (`copywriting_knowledge.ts:747, 748,
   766, 767`) name a coach in Riyadh. Harmless as claim-type illustrations, but they are
   the only industry vocabulary left in the prompt. Changing them means editing a
   Phase 22 constant, which needs its own approval.

7. **Nine redundant (not contradictory) instruction groups** remain, catalogued in the
   Batch 1 section — the heaviest is "delivery format is constant across all 4 hooks",
   stated 8 times. Consolidating them is a separate piece of work.

### Note on the working tree

Twice during this task the five files in `docs/investigations/` were deleted from the
worktree by something outside the session — the second time truncating this report,
which was reassembled from commit `f37b69a`. The append step now aborts if the file is
missing or missing an earlier batch heading. Worth finding what is clearing that
directory.
