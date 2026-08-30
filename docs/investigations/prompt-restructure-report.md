
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
