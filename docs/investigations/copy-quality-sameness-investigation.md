# Investigation — Phase 23 Anti-Sameness & Phase 22 Copy Quality (+ Gender/Wardrobe)

**Date:** 2026-08-30
**Baseline commit:** `9d45d2c` (PR #67 base — `main` immediately before PR #68's `prompt-restructure` branch).
**Scope:** Read-only diagnosis. No source file was modified.
**Repo:** `D:\Pro Ads AI - SaaS - FAL` — backend `functions/src/`
**Method:** static reading + **execution of the compiled production code** (`functions/lib/`) to
capture the real hook-generation prompt and the real dimension-rotation output. Every claim below
carries a file+line citation; anything not found is marked **NOT FOUND**.

Reproduction artefacts (scratchpad, not committed):
`capture.js` (captures the live prompt by stubbing the Gemini caller), `p23.js`, `p23sim.js`,
`map.js` — under
`C:\temp\claude\D--Pro-Ads-AI---SaaS---FAL\e39e438c-8e71-4464-a0ed-3583eda639ed\scratchpad\`.

---

# PART 1 — PHASE 23 ANTI-SAMENESS

## 1.1 — DIMENSION POOLS

**Files / functions / lines**

| Element | Location |
|---|---|
| `DimensionEntry` interface | `functions/src/knowledge/hookAnglesKnowledge.ts:764-772` |
| Pool constants (10 x `POOL_*`) | `hookAnglesKnowledge.ts:774, 831, 888, 945, 1002, 1059, 1116, 1173, 1230, 1287` |
| `ANGLE_DIMENSION_POOLS` registry | `hookAnglesKnowledge.ts:1344-1357` |
| `OpeningStructure` interface | `hookAnglesKnowledge.ts:1364-1367` |
| `OPENING_STRUCTURES` (7 forms) | `hookAnglesKnowledge.ts:1369-1398` |
| `drawDimensions(angleKey, n, seed, memory)` | `hookAnglesKnowledge.ts:1446-1503` |
| `drawOpenings(n, seed, memory)` | `hookAnglesKnowledge.ts:1510-1542` |
| `getAngleVariationBlueprintRotated(...)` | `hookAnglesKnowledge.ts:1567-1612` |
| Re-export shim | `functions/src/copyDiversity.ts:18-29` |

**What a "dimension" is.** A `DimensionEntry` (`hookAnglesKnowledge.ts:764-772`) has
`id`, `angleKey`, `label`, `psychology`, `constraints`, `feeling`, optional `arabicCue`.
It is an *execution dimension inside one locked hook angle* — e.g. for `emotional`:
`emotional_relief`, `emotional_pride`, `emotional_belonging`, `emotional_fear`,
`emotional_frustration`, `emotional_hope`.

**Pool sizes — verified by execution** (all eleven registry keys):

```text
urgency 6   scarcity 6   social_proof 6   logic 6   emotional 6   pain 6
curiosity 6 statistics 6 logical_authority 6 future_based 6
fear_of_missing_out 6   (alias -> POOL_SCARCITY, hookAnglesKnowledge.ts:1356)
OPENING_STRUCTURES 7
```

Note the in-code comment at `hookAnglesKnowledge.ts:1582` claims a *"6–8 dimension pool"*.
**Every pool is exactly 6.** `drawDimensions` is always called with `n = 4`
(`generators.ts:2385`), so the draw is always **4-of-6 → only C(6,4) = 15 distinct sets exist
per angle**, and any two draws for the same angle necessarily share at least 2 of 4 dimensions.

**How a dimension is selected.** `drawDimensions` (`hookAnglesKnowledge.ts:1446-1503`):

1. `pool = ANGLE_DIMENSION_POOLS[angleKey] || []` (`:1452`) — empty pool ⇒ `[]` (`:1453`).
2. Recency map built from `memory.flatMap(m => m.dimensionIds)` (`:1457-1461`).
3. RNG is ``makeRng(stringHash32(`${angleKey}|${seed}`))`` (`:1462`) — Mulberry32, `makeRng` at `:1417-1426`.
4. Gumbel-max weighted sample: `weight = 1/(1+r)`, `key = -log(u)/weight`, ascending sort, take `target` (`:1469-1480`).
5. Angle-lock guard drops entries whose `angleKey` mismatches (`:1487-1496`); defensive fallback returns `pool.slice(0, target)` (`:1497-1501`).

`drawOpenings` (`:1510-1542`) is the same algorithm over the fixed 7-form `OPENING_STRUCTURES`,
seeded with ``stringHash32(`openings|${seed}`)`` (`:1526`).

**External state dependency.** Two inputs, both external:

- `seed` — from `makeProjectSeed` (`copyDiversity.ts:40-44`), see 1.2.
- `memory` — Firestore fingerprints via `getRecentFingerprintsForRotation`
  (`copyDiversity.ts:78-102` → `creativeMemory.ts:485-510`), see 1.3.

Both are **pure inputs**; the draw itself is deterministic and side-effect free.

---

## 1.2 — SEED-BASED ROTATION

**File and line:** `functions/src/copyDiversity.ts:40-44`

```ts
export function makeProjectSeed(userId?, projectId?, angleKey?): number {
    const day = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const seedStr = `${userId || "anon"}|${projectId || "default"}|${angleKey || "any"}|${day}`;
    return stringHash32(seedStr);
}
```

**Inputs that feed the seed:** `userId`, `projectId`, `angleKey`, UTC day index. No timestamp
below day granularity, no randomness.

**Call sites:**

- single hook: `generators.ts:2383` — `makeProjectSeed(_phase23UserId, _phase23ProjectId, inputs.coldHookAngle)`
- trace echo: `generators.ts:3162`
- carousel: `generators.ts:8604`, `generators.ts:9083`

**`projectId` is ALWAYS `undefined` in production.** The four call sites read it as:

```ts
const _phase23ProjectId = ((inputs as any)._projectId as string | undefined) || (inputs as any).projectId;
```

(`generators.ts:2382`, `:3158`, `:8603`, `:9079`)

A whole-repo search (excluding `functions/lib/`, `node_modules/`) for `_projectId` returns
**only those four read sites — zero writes**. And `inputs.projectId` is never set either:
the frontend builds the generation payload at `src/App.tsx:5628` and `src/App.tsx:5635` as

```ts
setInputs({ ...formData, _userId: user?.uid, competitorContext } as any);
const cleanInputs = { ...formData, personalPhotos: [], brandLogos: [], _userId: user?.uid, competitorContext };
```

— `_userId` is set, **no project identifier of any kind is attached**. A project id *does* exist
client-side (`src/App.tsx:1736` `currentProjectId`) and *is* sent to other callables
(`src/App.tsx:7993`, `:10244`, `:10424`) — but never to `generateTOV`
(`src/App.tsx:5674, 5754, 5814, 5976, 8978`).

**Therefore the effective seed string is `"<uid>|default|<angle>|<day>"`.**

**Does the seed change between hook generations for the same project?**
**No — and worse, it does not change between DIFFERENT projects either.** Executed against the
compiled production code:

```text
SEED(uid='UID123456789', projectId=undefined, angle='emotional') = 1262303019
SEED again                                                       = 1262303019   identical: true
DIMS      : emotional_relief, emotional_pride, emotional_belonging, emotional_fear
DIMS again: emotional_relief, emotional_pride, emotional_belonging, emotional_fear   identical: true
```

The seed only flips when the UTC calendar day rolls over (`copyDiversity.ts:41`).
The doc comment at `copyDiversity.ts:33` — *"`userId + projectId + angleKey` is hashed"* — is
accurate about intent and inaccurate about runtime: the middle term is the constant `"default"`.

**How the seed maps to a selection.** `seed` → `stringHash32("<angle>|<seed>")` → Mulberry32 →
Gumbel keys → sort → `shuffled()` (`hookAnglesKnowledge.ts:1462-1480`). With empty memory the
mapping is a pure function of `(angleKey, seed)`.

---

## 1.3 — CROSS-PROJECT MEMORY (FINGERPRINTS)

**Write:** `functions/src/creativeMemory.ts:464-483` — `recordAngleFingerprint(userId, fingerprint)`.
Called (fire-and-forget, not awaited) at `functions/src/generators.ts:3144`.

**Read:** `functions/src/creativeMemory.ts:485-510` — `getRecentFingerprints(userId, window=10)`.
Wrapped by `functions/src/copyDiversity.ts:78-102` `getRecentFingerprintsForRotation`.
Called at `generators.ts:2384` (single hook) and `generators.ts:8605` (carousel).

**Firestore path:** `creativeMemoryFingerprints/{userId}/entries/{autoId}`
(write: `creativeMemory.ts:470-474`; read: `creativeMemory.ts:491-497`,
`.orderBy("timestamp","desc").limit(window)`).
Document shape: `angleKey`, `dimensionIds[]`, `openingIds[]`, `userId`,
`timestamp: FieldValue.serverTimestamp()` (`creativeMemory.ts:475-479`).
`FINGERPRINT_WINDOW = 10` at `creativeMemory.ts:462`.

**Is the read inside a try/catch that swallows errors?** **Yes — three nested layers, all silent:**

- `creativeMemory.ts:506-509`: `catch (e) { console.warn("⚠️ getRecentFingerprints failed (non-blocking, returns []):", e); return []; }`
- `copyDiversity.ts:98-101`: `catch (e) { console.warn("⚠️ getRecentFingerprintsForRotation failed (non-blocking):", e); return []; }`
- `generators.ts:2396-2398`: `catch (e) { console.warn("⚠️ Phase 23 rotation pre-compute failed (non-blocking):", e); }`

The write is equally silent: `creativeMemory.ts:480-482` and again `generators.ts:3144-3146`.
Nothing surfaces to the caller, the response, or the resolution trace.

**What happens when the read returns empty or fails?**
It falls back to **neither "no variation" nor "random variation" — it falls back to a FIXED,
DETERMINISTIC, SEED-ONLY draw.** With `memory = []` the recency map is empty
(`hookAnglesKnowledge.ts:1457-1461`), every `weight = 1/(1+0) = 1` (`:1471`), and the result is a
pure function of `(angleKey, seed)`. Because the seed is constant for `(uid, angle, UTC-day)`
(§1.2), **every generation that day returns the identical 4 dimensions in the identical order.**

This was observed live during the capture run: with no Firebase app initialised the read threw,
was swallowed by `creativeMemory.ts:507`, and the run proceeded with `[]` — exactly the
production degradation path.

**Additional read-path defect (`copyDiversity.ts:85-97`):** the wrapper over-fetches
`limit * 4 = 40` newest entries **across all angles**, then filters by `angleKey`, `slice(0,10)`,
`.reverse()`. A user who works across several angles can therefore have their 40 newest entries
dominated by other angles and receive **zero** fingerprints for the current angle — silently
degrading to the fixed seed-only draw described above. There is no log line and no trace field
distinguishing "no history" from "history exists but fell outside the 40-doc window";
`memoryBiasApplied` (`generators.ts:2387`, echoed at `:3166`) is simply `false` in both cases.

**Feedback-loop behaviour (executed, `p23sim.js`).** Replaying the exact read/filter/draw/write
loop for 8 consecutive generations, memory bias present:

```text
### angle=emotional  seed=1262303019  pool=6
gen1 dims=[relief,pride,belonging,fear]       openings=[percentage,time_reference,conditional,ratio]
gen2 dims=[fear,belonging,frustration,relief] openings=[percentage,imperative,direct_address,conditional]
gen3 dims=[hope,relief,belonging,fear]        openings=[percentage,conditional,time_reference,ratio]
gen4 dims=[pride,belonging,relief,fear]       openings=[percentage,question,conditional,imperative]
gen5 dims=[relief,frustration,belonging,fear] openings=[percentage,direct_address,conditional,time_reference]
gen6 dims=[relief,pride,belonging,fear]       openings=[percentage,ratio,conditional,time_reference]
gen7 dims=[relief,hope,belonging,fear]        openings=[percentage,imperative,conditional,time_reference]
gen8 dims=[relief,pride,belonging,fear]       openings=[percentage,direct_address,conditional,ratio]

### angle=urgency    seed=3358348056  pool=6
gen1 dims=[seats,price_increase,window,competitive_clock]
gen6 dims=[seats,price_increase,window,competitive_clock]
gen7 dims=[seats,price_increase,window,competitive_clock]
gen8 dims=[seats,price_increase,window,competitive_clock]
```

Even **with** memory bias working, `belonging` and `fear` appear in 8/8 emotional draws,
`competitive_clock` in 8/8 urgency draws, and the urgency set converges back to the gen-1 set and
stays there. The **first drawn opening is identical in 8/8 runs** for every angle
(`percentage` / `question` / `time_reference`). Bias-never-ban over a 6-item pool with a frozen
seed cannot produce set-level variety.

---

## 1.4 — WIRING INTO THE HOOK GENERATION PROMPT

**Which function assembles the hook prompt:** `generateTOV` — `functions/src/generators.ts:1905`.
The prompt literal is ``const prompt = ` `` at `generators.ts:2401`, closing at `generators.ts:2997`;
`hookQualityBlock` (`:2999-3005`) is concatenated at the call
(`generators.ts:3010-3018`, `model: CREATIVE_MODEL_PRO` = `gemini-3.1-pro-preview`
(`generators.ts:1277`), `systemInstruction: SYSTEM_TOV`, `temperature: 1.0`).

**Where anti-sameness is injected — four places:**

| # | Line | Content |
|---|---|---|
| 1 | `generators.ts:2595-2601` | `getAngleVariationBlueprintRotated(inputs.coldHookAngle, inputs, {drawnDimensions, drawnOpenings, recentFingerprintDimensionIds, recentFingerprintOpeningIds, memoryBiasApplied})` |
| 2 | `generators.ts:2658-2667` | second copy of the drawn dimensions as an A–D markdown table |
| 3 | `functions/src/promptConstants.ts:25-26` | `SYSTEM_TOV` "OPENING-STRUCTURE ROTATION (Phase 23 — 23.B anti-sameness, additive)" |
| 4 | `generators.ts:8753-8812` | carousel-only `_phase23CarouselFamilies` (out of scope for single hooks) |

**Is the injection conditional?** Yes — on `inputs.coldHookAngle && !isRetargeting`:

- the pre-compute block: `generators.ts:2379`
- injection site 1 is inside the `inputs.coldHookAngle ? … : …` ternary opened at `generators.ts:2571` (else-branch `:2615-2639` has no rotation)
- injection site 2 is inside the `isRetargeting ? … : inputs.coldHookAngle ? …` chain at `generators.ts:2645/2656`, and further inside `_phase23DrawnDimensions && _phase23DrawnDimensions.length === 4` (`:2659`); the else-branch `:2668-2676` prints a **fixed** Financial/Time/Status/Skill table.

**NOT FOUND:** any feature flag, kill switch, env var, plan-tier gate, provider gate, or language
gate on the Phase 23 rotation. `functions/src/modelConfig.ts` (37 lines) contains
`MODEL_PROVIDER` (`:3`) and `COPY_SCORING_ENABLED` (`:10`) only — nothing Phase-23 related.

**Exact anti-sameness text produced for a cold / `emotional` / `ar_fusha` hook.**
Produced by executing the compiled `getAngleVariationBlueprintRotated` with the real
`makeProjectSeed` / `drawDimensions` / `drawOpenings` output (seed `1262303019`, memory `[]`):

```text
【EMOTIONAL — ROTATED DIMENSION FILL — same locked angle, rotated dimension set】
This is project-to-project anti-sameness. The user's angle is unchanged.
The 4 dimensions below were drawn (deterministic seed) from the angle's
6–8 dimension pool. Use the four labeled dimensions to fill Hooks A→D
IN THIS ORDER. The opening structures (when provided) are SOFT GUIDANCE —
the model may adapt if the angle hard-rule forces a different shape.

【HOOK A】 → RELIEF / RELEASE
DIMENSION: The exhausting weight lifts. The reader should feel the exhale of a long-held tension finally letting go.
CONSTRAINTS: Must reference a specific tension the audience carries daily and the moment it is set down. …
FEELING: Sigh of relief, "I could actually put this down."
ARABIC CUE: ارتاح، يتنفس، يرتاح أخيراً

【HOOK B】 → PRIDE / DESIRE
DIMENSION: They deserve more than what they're getting. …
ARABIC CUE: تستحق، تستاهل، يستاهل خبرتك

【HOOK C】 → BELONGING / IDENTITY
DIMENSION: The reader is not alone in this; there is a community of people like them moving in the same direction. …
ARABIC CUE: لست وحدك، أنتم، مجتمعنا

【HOOK D】 → FEAR / LOSS
DIMENSION: A deep, private fear about their professional future. …
ARABIC CUE: يخاف، قلق، خوف من

OPENING STRUCTURES (rotate which 4 the hooks use; pick 4 of 7 from below):
  1. percentage — [percentage] + [audience] + [consequence]
  2. time_reference — [time reference] + [cost of delay]
  3. conditional — [conditional "لو/إذا"] + [relatable scenario]
  4. ratio — [ratio] + [surprising fact]


【EMOTIONAL-NATIVE VARIATIONS — ALL 4 hooks must trigger deep feelings】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. …

【HOOK A】 → FRUSTRATION / ANGER
【HOOK B】 → FEAR / LOSS
【HOOK C】 → PRIDE / DESIRE
【HOOK D】 → HOPE / POSSIBILITY

[Phase 23 rotation metadata: drawn=4/6 from pool]
```

**This is the single most important finding of Part 1.**
`getAngleVariationBlueprintRotated` does not *replace* the legacy blueprint — it **prepends** to it:

```ts
const base = getAngleVariationBlueprint(angleId, inputs);   // hookAnglesKnowledge.ts:1572
...
return `${header}\n\n${dimsBlock}${openingsBlock}\n\n${base}${metaLine}`;   // :1610
```

`base` (`getAngleVariationBlueprint`, `hookAnglesKnowledge.ts:606-660`) contains its **own fixed
【HOOK A】–【HOOK D】 dimension assignment**. So the prompt hands the model **two different,
contradictory A→D maps back to back**, and the *fixed* one comes **second**.

---

## 1.5 — FAILURE MODE ANALYSIS

**(a) Is there a feature flag or kill switch? Is it on or off?**
**NOT FOUND.** No flag exists for Phase 23. The only gates are structural:
`inputs.coldHookAngle && !isRetargeting` (`generators.ts:2379`, `:2571`, `:2656`).

**(b) Does the fingerprint read fail open (no variation) or fail safe (random variation)?**
**Neither — it fails to a FROZEN deterministic draw.** `[]` on failure
(`creativeMemory.ts:508`, `copyDiversity.ts:100`) ⇒ all weights = 1
(`hookAnglesKnowledge.ts:1471`) ⇒ output is a pure function of `(angleKey, seed)` ⇒ and the seed
is constant for the whole UTC day (§1.2). There is no randomness anywhere in the path
(`makeRng` is seeded, `shuffled` uses that same seeded RNG — `hookAnglesKnowledge.ts:1417-1438`).

**(c) Could the pool return the SAME dimension every time if seed/fingerprint state is empty/null?**
**Yes — proven by execution.** See §1.2 (identical seed and identical dimension list on repeat
calls) and §1.3 (`belonging` + `fear` in 8/8 emotional draws even *with* memory). Because
`projectId` is never supplied (§1.2), two entirely different projects created by the same user on
the same day receive **byte-identical** dimension and opening sets.

**(d) Is the injection gated to a model/provider that may have changed?**
**No.** Hook copy always goes through `callGemini` with `CREATIVE_MODEL_PRO` / `CREATIVE_MODEL_LITE`
(`generators.ts:1277-1278`, `:3011`). `MODEL_PROVIDER = "openai"` (`modelConfig.ts:3`) only routes
**visual** calls (`createVisualRoutingCaller`, `index.ts:5329-5330`); `serverGenerateTOV` installs
a pure Gemini caller (`index.ts` `serverGenerateTOV` block, `generators.setGeminiCaller(createGeminiCaller(...))`
and `generators.setOpenAIKey(openaiApiKey.value())` at `index.ts:4754`). The rotation is
provider-independent.

**(e) The overriding failure — later contradictory instructions.**
Beyond the seed freeze, the assembled prompt contains **three** competing A→D dimension maps and
**two** competing opening-structure lists. Verified against the captured 41,439-char production
prompt (full ordered map in §2.5):

| Offset | Source line | Instruction |
|---|---|---|
| 8,776 | `generators.ts:2595` → `hookAnglesKnowledge.ts:1586-1593` | **Rotated:** A=Relief, B=Pride, C=Belonging, D=Fear |
| 11,206 | `generators.ts:2595` → `hookAnglesKnowledge.ts:1572` (`base`) | **Fixed:** A=Frustration, B=Fear, C=Pride, D=Hope |
| 15,391 | `generators.ts:2661-2664` | **Rotated again:** A=Relief, B=Pride, C=Belonging, D=Fear |
| **30,986** | **`generators.ts:2841`** | **`Hook A = FINANCIAL/REVENUE dimension. Hook B = TIME/LIFESTYLE dimension. Hook C = STATUS/IDENTITY dimension. Hook D = SKILL/CONFIDENCE dimension.`** |

and for openings:

| Offset | Source line | Instruction |
|---|---|---|
| ~10,900 | `hookAnglesKnowledge.ts:1595-1598` | drawn 4 of 7, explicitly labelled **"SOFT GUIDANCE"** (`:1584`) |
| **31,311** | **`generators.ts:2845-2852`** | **all 7 forms re-listed: `Structure types to rotate (use each ONCE, pick 4)`** |

The last word in both cases belongs to the hard-coded static block, at ~75% depth of the prompt,
inside the `OUTPUT FORMAT` section the model reads immediately before writing.

**(f) Where the reported `"من X للY بـ[timeframe]"` template comes from — it is not Phase 23 at all.**
It is the `transformation_promise` **delivery style**, a literal sentence template applied to all
four hooks by design:

- `functions/src/knowledge/hookTypesKnowledge.ts:277-279`
  `transformation_promise: FORMAT GUIDE: Present all 4 hooks as SPECIFIC TRANSFORMATION promises with timeline. Structure: "من [before] إلى [after] في [timeframe]"`
- `hookTypesKnowledge.ts:234-236` header: *"When user selects a specific delivery style, ALL 4 hooks must be formatted in that style. This overrides the default format structure."*
- injected at `generators.ts:2607` via `getDeliveryStyleFormatOverride(inputs.hookType, inputs.coldHookAngle)`
- reinforced at `generators.ts:2611-2613` and again at `generators.ts:2667`
  (*"ALL hooks must be delivered as TRANSFORMATION_PROMISE — the format/style is constant"*)
- and again at `hookAnglesKnowledge.ts:686`
  `transformation_promise: 'a specific transformation + timeline (من X إلى Y في Z)'`
- `hookType: 'transformation_promise'` is also the value baked into the first built-in demo
  template (`src/App.tsx:8430`).

Phase 23 rotates the *content dimension* of a hook. It has **no mechanism whatsoever** for
rotating the *sentence structure*, which is exactly what the delivery-style override pins.

---

# PART 2 — PHASE 22 COPY QUALITY

## 2.1 — COPY QUALITY CONSTANTS

**File:** `functions/src/copywriting_knowledge.ts` (840 lines).
Phase 22 section header at `:693-698`.

**All exported symbols in the file** (`:10, 46, 67, 103, 143, 233, 275, 307, 349, 383, 413, 434,
555, 584, 586, 632, 634, 649, 659, 667, 675, 684, 702, 719, 739, 772, 792, 818`).

**The six Phase 22 constants — all six present, none empty, none commented out:**

| # | Constant | Line | Type / size |
|---|---|---|---|
| 1 | `READING_LEVEL_BLOCK` | `:702-715` | string, 858 chars as rendered |
| 2 | `LIVED_SYMPTOM_BLOCK` | `:719-735` | string, 939 chars |
| 3 | `FABRICATION_POLICY_BLOCK` | `:739-768` | string, 2,493 chars |
| 4 | `BANNED_CTA_LIST` | `:772-778` | `readonly string[]`, 5 entries |
| 5 | `COPY_SCORING_DIMENSIONS` | `:792-814` | string |
| 6 | `COPY_REWRITE_DIAGNOSES` | `:818-840` | string |

Sizes 1–3 measured from the captured live prompt (offsets 26,277 / 27,135 / 28,074 → §2.5).

---

## 2.2 — WHERE THE CONSTANTS ARE CONSUMED

Exhaustive search over `functions/src/` **and** `src/` for each identifier.

### `READING_LEVEL_BLOCK` — **(a) prompt-injected**

- import `generators.ts:386`
- `generators.ts:2060` — hook prompt, **retargeting-only** branch of `campaignInstruction`
- `generators.ts:2831` — hook prompt, `coldHookAngle && !isRetargeting` branch
- `generators.ts:2882` — hook prompt, else branch
- `generators.ts:9135` — carousel slide-copy prompt
- `generators.ts:10301` — `buildVariationPrompt`
- tests only: `__tests__/copyQuality.test.ts:10,54,61-66,88,92`, `__tests__/copyStructure.test.ts:164`

### `LIVED_SYMPTOM_BLOCK` — **(a) prompt-injected**

- import `generators.ts:387`; sites `:2061`, `:2832`, `:2883`, `:9136`, `:10302`
- tests: `copyQuality.test.ts:11,55,68-72,89,93`, `copyStructure.test.ts:165`

### `FABRICATION_POLICY_BLOCK` — **(a) prompt-injected**

- import `generators.ts:388`; sites `:2062`, `:2833`, `:2884`, `:9137`, `:10303`
- tests: `copyQuality.test.ts:12,56,90,94,124-129`, `copyStructure.test.ts:166`

### `BANNED_CTA_LIST` — **(a) prompt-injected** (4 sites)

- import `generators.ts:389`; `.join(', ')` at `:2063`, `:2839`, `:2889`, `:9138`
- **not** injected into `buildVariationPrompt` (no `BANNED_CTA_LIST` between `:10257` and `:10440`)
- an independent, hand-duplicated copy of the same five phrases exists in
  `functions/src/promptConstants.ts:23` (`SYSTEM_TOV`) — a second source of truth that does not
  import the constant
- tests: `copyQuality.test.ts:13,57,91,95,97-103,117`

### `COPY_SCORING_DIMENSIONS` — **(d) defined but never referenced by runtime code**

- defined `copywriting_knowledge.ts:792`; **zero** non-test references anywhere in `functions/src/` or `src/`
- `copyQuality.test.ts:234` asserts this explicitly: `assert(!generatorsHasScoring, "COPY_SCORING_DIMENSIONS is NOT imported in generators.ts")`
- self-declared inert at `copywriting_knowledge.ts:813`

### `COPY_REWRITE_DIAGNOSES` — **(d) defined but never referenced by runtime code**

- defined `:818`; zero non-test references; `copyQuality.test.ts:235` asserts non-import;
  self-declared inert at `:840`

**No constant is used in (b) post-generation validation or (c) scoring.** The runtime scoring
gate (`functions/src/copyScoringGate.ts`) does **not** import from `copywriting_knowledge.ts`; it
hard-codes its own 9 dimension names in a system prompt string at `copyScoringGate.ts:1356-1365`
and its own diagnosis strings at `copyScoringGate.ts:580-585`. The "shared source of truth"
claimed at `copywriting_knowledge.ts:790` is not shared with any executing code.

### Additional dead exports found in the same file (context for ROOT CAUSES)

| Constant | Line | Status |
|---|---|---|
| `HOOK_GENERATION_RULES` | `:307` | **NOT imported anywhere** — dead |
| `SYSTEM_PROMPT_ADDENDUM` | `:555` | **NOT imported anywhere** — dead |
| `RETARGETING_RULES` | `:349` | imported at `generators.ts:13`, **never referenced** — dead import |
| `LANGUAGE_RULES` | `:10` | imported at `generators.ts:13`, **never referenced** — dead import |
| `AWARENESS_LEVELS`, `COPY_FRAMEWORKS`, `BULLET_STRUCTURES`, `CLOSING_VARIATIONS`, `POWER_WORDS`, `CTA_BENEFIT_ANGLES`, `getFramework`, `getRandomClosing`, `getHeadlineTypeForHook`, `getBenefitAngle` | `:67, 143, 233, 275, 684, 667, 586, 659, 634, 675` | 0 references in `generators.ts` |

This matters because two of the four Phase 22 target surfaces are named in the spec as
`HOOK_GENERATION_RULES` and `RETARGETING_RULES` (`specs/958-copy-quality/spec.md:154`) — the
constants that carry those names are dead, so the wiring was done by **inlining** the blocks at
different physical positions instead.

---

## 2.3 — THE FOUR PROMPT SURFACES

Spec text: *"the system tone-of-voice surface, the hook-generation rules surface, the carousel
slide-caption prompt, and the retargeting rules surface"* — `specs/958-copy-quality/spec.md:110`
(FR-008), `:135`, `:154`.

### Surface 1 — SYSTEM TONE-OF-VOICE (`SYSTEM_TOV`)

| | |
|---|---|
| **Where injected** | `functions/src/promptConstants.ts:19-23` — hand-written prose, *not* the constants (`COPY QUALITY RULES — TRACK 1`) |
| **How delivered** | `config.systemInstruction` at `generators.ts:3015`, `:3093`, `:8826`, `:9159`, `:10436` |
| **Conditional?** | **No** — unconditional for every step that uses `SYSTEM_TOV` |
| **Position** | System instruction — separate channel, precedes the 41,439-char user prompt |
| **Defect** | `promptConstants.ts:12` hard-codes *"Write high-converting Direct Response copy in **Professional Marketing Fusha Arabic**"* with **no language check** — applied to English, French, and dialect-Arabic ads identically. `getLanguageInstruction` (`promptConstants.ts:68-81`) is a *separate* function injected into the user prompt, so the two contradict each other for every non-`ar_fusha` language. |

### Surface 2 — HOOK GENERATION (`generateTOV`, `generators.ts:1905`)

Injected **twice, in two mutually exclusive branches**, both inside the `OUTPUT FORMAT` section:

| Site | Lines | Gate | Position in captured prompt |
|---|---|---|---|
| angle selected | `:2831-2833` + `:2839` | `inputs.coldHookAngle && !isRetargeting` (`:2820`) | offset **26,277–30,986** of 41,439 (**63–75% depth**) |
| no angle / retargeting | `:2882-2884` + `:2889` | else-branch (`:2880`) | same region |

**Conditional?** Yes — on `inputs.coldHookAngle` and `isRetargeting`. Not on language, model,
provider, plan, or campaign type.

**Before or after the main instruction block?** **After the strategy blocks, and crucially BEFORE
the last hard-coded overrides.** Ordered offsets from the captured prompt:

```text
26,277  READING_LEVEL_BLOCK
27,135  LIVED_SYMPTOM_BLOCK
28,074  FABRICATION_POLICY_BLOCK
30,567  BANNED_CTA_LIST line
30,986  <- "Hook A = FINANCIAL/REVENUE ... Hook D = SKILL/CONFIDENCE"                (generators.ts:2841)
31,136  <- "DIVERSITY RULE ... Structure types to rotate (use each ONCE, pick 4)"    (generators.ts:2843-2853)
33,952  <- modeInstruction "PHASE 2: THEMATIC MARKETING FUSION" — 7,049 chars        (generators.ts:2111 -> :2943)
41,001  hookQualityBlock                                                             (generators.ts:2999-3005)
```

The three quality blocks are followed by **10,453 characters** of later instruction, ending with a
7,049-char block and a "HOOK QUALITY FLOOR" that re-states quality expectations in *different*
words (`generators.ts:3000-3005`) without referencing 6th-grade level or lived symptom.

### Surface 3 — CAROUSEL SLIDE CAPTIONS (`generateCarouselSlideCopies`, `generators.ts:8909`)

| | |
|---|---|
| **Where** | `generators.ts:9135-9138`, inside `const prompt = \`` opened at `:9009`, closed `:9153` |
| **Conditional?** | **No** — unconditional within this function |
| **Position** | Immediately before `OUTPUT FORMAT (STRICT)` at `:9140-9142` — i.e. **last substantive block**, the strongest position of the four |

### Surface 4 — RETARGETING RULES

| | |
|---|---|
| **Where** | `generators.ts:2060-2063` — inside the **retargeting branch** of `campaignInstruction`, the ternary opened at `generators.ts:1980` (`const campaignInstruction = isRetargeting ? ... : ...`) |
| **Conditional?** | **Yes — gated on `isRetargeting === true`** |
| **Position** | `campaignInstruction` is interpolated at `generators.ts:2413`, i.e. offset ~527 — the **very top** of the prompt, ~1% depth |
| **Defect** | The cold branch (`generators.ts:2064-2073`) receives **no quality blocks at all** at this position — it gets `COLD_TRAFFIC_RULES` (`:2070`) and `HEADLINE_TYPES` (`:2073`) only. Cold ads pick the blocks up ~25,750 characters later at Surface 2. |

**Summary of gating across the four surfaces**

| Surface | Language gate | Model / provider gate | Feature flag | Campaign gate | Plan gate |
|---|---|---|---|---|---|
| SYSTEM_TOV | none (but hard-codes Fusha Arabic) | none | none | none | none |
| Hook generation | none | none | none | branch on `isRetargeting` + `coldHookAngle` | none |
| Carousel | none | none | none | none | none |
| Retargeting rules | none | none | none | **`isRetargeting` only** | none |

`buildVariationPrompt` (`generators.ts:10257`, blocks at `:10301-10303`, called at `:10428`) is a
**fifth** surface added after the spec; it is unconditional but omits `BANNED_CTA_LIST`.

---

## 2.4 — CLAIM FLAG SYSTEM

**Where defined**

| Element | Location |
|---|---|
| Policy prose + output contract | `functions/src/copywriting_knowledge.ts:739-768`, contract at `:762-763` |
| Duplicate prose in system prompt | `functions/src/promptConstants.ts:22` |
| Parser | `functions/src/generators.ts:815-838` — `claimRe` defined at `:827` (literal moved below) |
| Field extractor wrapper | `generators.ts:856-871` |
| Trace write | `generators.ts:6388-6394` → `_lastResolutionTrace.claimFlags` |
| Type | `src/types.ts:730-744` (`ClaimFlagEntry`), backend `functions/src/types.ts` import at `generators.ts:48` |
| Strip-from-copy call sites | `generators.ts:753`, `:857`, `:3287` |
| Gate-side re-emit | `copyScoringGate.ts:418-481`, `:1273-1304`, `:1392-1397`, `:1525-1534` |
| Frontend parser | `src/utils/hookVariationParser.ts:12-13, 35-36, 63-90, 151-173` |

`claimRe` literal (moved out of the table because the alternation pipes confuse Markdown table parsing):

```regex
/^\s*CLAIM_FLAG\s*:\s*(.+?)\s+(?:—|–|-|:)\s+(.+?)\s*$/i
```

**What triggers it.** **Nothing in code triggers it.** There is no detector, no heuristic, no
regex over the generated copy that classifies a claim as fabricated. The flag is **entirely
model-self-reported**: the prompt asks the model to voluntarily emit
`CLAIM_FLAG: <verbatim specific> — <one-line reason>` after the four copy fields
(`copywriting_knowledge.ts:762-767`). `extractClaimFlagsFromResponse` (`generators.ts:815-838`)
only *parses* lines the model chose to write.

**Hard block or advisory?** **Advisory, and invisible.** `FABRICATION_POLICY_BLOCK:740` says
*"SOFT FLAG, NEVER BLOCK"*; `:760` *"It does NOT delete, block, or refuse any claim."* The parsed
flags are stripped out of the copy (`generators.ts:753`, `:857`, `:3287`) and written to
`resolutionTrace.claimFlags` (`generators.ts:6392`). A whole-repo search of `src/**/*.tsx` for
`claimFlags` returns **zero component references** — the only frontend touchpoints are the type
(`src/types.ts:744`) and the parser that produces the field
(`src/utils/hookVariationParser.ts:173`). **No UI surface renders a claim flag to the advertiser.**

**Does it run on the current production path, or is it gated?**
The parser runs unconditionally on every `generateFinalAd` (`generators.ts:6387`) and every
`generateConcepts` (`generators.ts:3287`) — no flag, no provider check, no language check.
The *prompt* half is gated exactly as §2.3 describes.

**Would `"85% يخشون الاستقالات"` or `"99% مرعوبون"` trigger it?**

**No.** Four independent reasons:

1. **No detector exists.** The only path to a flag is the model volunteering a `CLAIM_FLAG` line
   (`generators.ts:827`). Nothing scans the emitted hook text for percentages, counts, or names.
2. **The prompt actively instructs the opposite for stat-bearing angles.**
   `generators.ts:2581`: *"✅ STATISTICS: HOOK_TEXT MUST contain a specific NUMBER or PERCENTAGE.
   **Invent plausible industry stats** for "…". A hook without at least one digit FAILS."*
   Also `hookTypesKnowledge.ts:262`: *"⚠️ **INVENT YOUR OWN** plausible round numbers…"* and
   `hookTypesKnowledge.ts:104`: *"⚠️ DO NOT COPY the example numbers below — **invent your OWN
   statistics** relevant to the user's niche."* The model is told to fabricate and told to flag
   fabrication, in the same prompt.
3. **The "hard compliance guards" the policy defers to do not cover this case.**
   `FABRICATION_POLICY_BLOCK:759` claims invented stats *"still trigger the existing hard compliance
   guards (captionValidator NUMERIC FACT VIOLATION repair, hookAnglesKnowledge honest-degradation
   rules)"*. Verified:
   - `captionValidator.ts:436-443` `numeric_consistency` runs **only on the long-form caption**
     (`generators.ts:9727` is its sole call site), **only** when `modePayload.value_stack` or
     `modePayload.offer_card` is present (`:410`, `:447`), and **only over currency numbers** —
     `extractCurrencyNumbers` (`captionValidator.ts:214-231`) matches `$N`, `N$`, and
     `N dollar|دولار|ريال|جنيه`. A bare `85%` / `99%` matches none of these patterns, and hook
     text is never passed to this validator at all.
   - "honest-degradation rules" — a search for `honest` in `hookAnglesKnowledge.ts` returns
     **NOT FOUND**. The nearest equivalents are prose constraints *inside* dimension entries
     (`hookAnglesKnowledge.ts:284`, `:359`, `:549`, `:894`, `:1236`) — prompt text, not guards,
     and only reachable when those specific dimensions are drawn.
4. **The scoring gate cannot catch it either.** Its 9 dimensions
   (`copyScoringGate.ts:1357-1360`: audienceSpecificity, painDesireRelevance, clarity,
   scrollStoppingTension, wordingSpecificity, offerRelevance, nonGenericLanguage, readingLevel,
   livedSymptomDepth) contain **no truthfulness or fabrication dimension**. A fabricated
   percentage scores *higher* on `wordingSpecificity` and `nonGenericLanguage` than an honest
   vague statement, so the gate rewards it.

---

## 2.5 — PROMPT POSITION ANALYSIS (hook generation)

**Method.** The compiled production `generateTOV` (`functions/lib/generators.js`) was executed with
a stub caller that captured `contents.parts[*].text` verbatim, for a representative brief:
`adLanguage: ar_fusha`, `campaignType: cold`, `coldHookAngle: emotional`,
`hookType: transformation_promise`, `adTone: bold`, `adMode: single`, `mode: 'initial'`.
Firestore was unreachable, so the fingerprint read returned `[]` via `creativeMemory.ts:507` —
i.e. the exact production degradation path from §1.3.

**Captured user prompt: 41,439 characters** (plus the `SYSTEM_TOV` system instruction, ~3.0 KB,
delivered separately at `generators.ts:3015`).

| # | Offset | Size | Block | Assembled at | Instructs |
|---:|---:|---:|---|---|---|
| 1 | 1 | 526 | `[HOOK ARCHITECT V5.1]` header + `GENERATION ID` + ORIGINALITY MANDATE | `generators.ts:2402-2408` | be original, vary structures |
| 2 | 527 | 2,066 | CAMPAIGN MODE → cold branch: `COLD_TRAFFIC_RULES` + `HEADLINE_TYPES` | `:2413` → `:2064-2073` (`copywriting_knowledge.ts:383`, `:103`) | cold-traffic framing, headline taxonomy |
| 3 | 2,593 | 2,259 | CREATIVE STRATEGY CONTROLS — ad tone, hook angle, delivery style | `:2418-2422` | tone / angle / delivery |
| 4 | 4,852 | 1,883 | HOW TO COMBINE ANGLE + DELIVERY (+ STRATEGY) | `:2424-2462` | layer precedence |
| 5 | 6,735 | 595 | INPUT ANALYSIS + offer psychology + mode block | `:2464-2476` | brief facts |
| 6 | 7,330 | 612 | ARABIC QUALITY (ONE-PASS CHECK) | `:2493-2501` | Arabic grammar |
| 7 | 7,942 | 177 | THE 4 HOOKS header | `:2502-2504` | — |
| 8 | 8,119 | 657 | 🔒 CRITICAL ANGLE LOCK + per-angle hard validation | `:2572-2593` | angle lock |
| 9 | **8,776** | 2,430 | **PHASE 23 ROTATED DIMENSION FILL** (drawn A–D + drawn 4 openings) | `:2595-2601` → `hookAnglesKnowledge.ts:1579-1598` | **anti-sameness** |
| 10 | **11,206** | 2,102 | **BASE angle blueprint — FIXED A–D dimensions** | `hookAnglesKnowledge.ts:1572` (`base`), emitted by `:1610` | **contradicts #9** |
| 11 | 13,308 | 135 | `[Phase 23 rotation metadata: drawn=4/6 from pool]` | `hookAnglesKnowledge.ts:1600-1608` | audit noise |
| 12 | 13,443 | 1,762 | DELIVERY FORMAT override — `"من [before] إلى [after] في [timeframe]"` | `:2603-2613` → `hookTypesKnowledge.ts:277-279`, `hookAnglesKnowledge.ts:716-737` | **pins sentence structure** |
| 13 | 15,205 | 186 | STRUCTURAL VARIATION header | `:2641-2643` | — |
| 14 | **15,391** | 842 | **PHASE 23 ROTATION table (2nd copy of drawn A–D)** | `:2658-2667` | anti-sameness |
| 15 | 16,233 | 959 | ANTI-REPETITION RULES (banned opening words / benefit words / structures) | `:2689-2712` | anti-repetition |
| 16 | 17,192 | 732 | SUBHEADLINE RULES | `:2713-2730` | subhead form |
| 17 | 17,924 | **7,548** | CTA BENEFIT RULES + `CTA_OUTCOME_FRAMING_BLOCK` + universe/tone/language/subhead prohibitions | `:2731-2815` (`:2774` = `gazeMap.ts` constant) | CTA + Arabic style |
| 18 | 25,472 | 805 | OUTPUT FORMAT header + MANDATORY LAYER CHECK | `:2816-2829` | — |
| 19 | **26,277** | 858 | **`READING_LEVEL_BLOCK`** | `:2831` | 6th-grade reading level |
| 20 | **27,135** | 939 | **`LIVED_SYMPTOM_BLOCK`** | `:2832` | concrete lived moment |
| 21 | **28,074** | 2,493 | **`FABRICATION_POLICY_BLOCK`** | `:2833` | flag fabricated specifics |
| 22 | 30,567 | 419 | `BANNED_CTA_LIST` line + CTA formula | `:2839` | banned CTAs |
| 23 | **30,986** | 150 | **`Hook A = FINANCIAL/REVENUE … Hook D = SKILL/CONFIDENCE`** | `:2841` | **overrides #9/#10/#14** |
| 24 | **31,136** | 766 | **DIVERSITY RULE + all 7 opening structures re-listed, "use each ONCE, pick 4"** | `:2843-2853` | **overrides the drawn 4 in #9** |
| 25 | 31,902 | 538 | OUTPUT skeleton `HOOK_START_A … HOOK_END_D` | `:2855-2879` | format |
| 26 | 32,440 | 1,181 | FINAL SELF-CHECK + `getAngleValidationChecklist` | `:2919-2935` | validation |
| 27 | 33,621 | 331 | FORBIDDEN IN HOOK OUTPUT | `:2936-2942` | output hygiene |
| 28 | **33,952** | **7,049** | `modeInstruction` = `PHASE 2: THEMATIC MARKETING FUSION` — metaphor rule, Arabic-quality rules, mandatory 3-step self-check | `:2943` → `:2111-2220` | tone, metaphor, Arabic quality |
| 29 | 41,001 | 438 | `hookQualityBlock` — "HOOK QUALITY FLOOR" | `:2999-3005`, concatenated at `:3012-3013` | quality restated in different words |

**Depth of the three quality blocks: 63.4% → 74.7%** of the prompt.
**10,453 characters (25.2%) of instruction follow them**, and the two blocks that directly
contradict Phase 23 (#23, #24) sit *immediately after* them.

Two further position facts:

- The three quality blocks appear **once** in a 41,439-char prompt; the fixed A–D dimension map
  appears **three** times (#10, #23, and the else-branch at `generators.ts:2668-2673`), and the
  full 7-opening list appears **twice** (#9 partial with 4 of 7, #24 complete).
- `hookQualityBlock` (#29, the literal last words before the model writes) re-states quality
  expectations **without** the 6th-grade rule, the lived-symptom rule, or the fabrication rule —
  and explicitly softens one: *"Numbers/stats are powerful but NOT mandatory"*
  (`generators.ts:3003`).

---

# PART 3 — GENDER / WARDROBE

## 3.1 — HERO GENDER IN THE PIPELINE

**Is gender detected from the uploaded image?**
**NOT FOUND.** A whole-repo search for `gender`, `heroGender`, `hijab`, `محجبة`, `حجاب` across
`functions/src/**/*.ts` returns only prompt-prose matches
(`culturalCompliance.ts:148, 156`; `generators.ts:3401, 3662-3669, 3790, 3977, 4283, 6616`).
There is no vision call, no classifier, and no analysis function applied to `personalPhotos`.
The only image-analysis helper in the codebase is `analyzeReferenceImage`
(`generators.ts:3280`), which analyses a **reference ad**, not the hero photo.

**Is gender stored in the project/brief data?**
**NOT FOUND.** `src/types.ts:272` declares `personalPhotos?: string[]; // Box A (Max 5)`.
There is **no** gender field anywhere in `AdInputs`, and a search of `src/**` for `gender`
returns **zero** matches — the input form never asks.

**Does gender reach the blueprint generation prompt?**
**No — and it is explicitly forbidden.** `generateConcepts` (`generators.ts:3262`) is called with
`inputs = stripMediaFromInputs(inputs)` (`generators.ts:3264`), and
`stripMediaFromInputs` (`generators.ts:1849-1858`) replaces every entry of `personalPhotos`,
`brandLogos`, `offerAssets` with the literal string `'media_omitted'` (`:1851`, `:1854`).
**The concept model therefore never sees the hero photo at all.** The prompt states this and
forbids inference:

- `generators.ts:3662-3669`

  ```text
  ⚠️ CRITICAL GENDER RULE - MANDATORY:
  - You DO NOT know the gender of the person in Box A. The photos are processed separately.
  - ALWAYS use gender-neutral language: "The Hero", "They", "Their", "Them"
  - NEVER write "he", "she", "man", "woman", "his", "her"
  - NEVER assume or invent physical attributes like hijab, beard, dress, etc.
  ❌ WRONG: "The hero, a woman wearing hijab..." or "He stands confidently..."
  ```

- `generators.ts:4283` — `GENDER NEUTRALITY: NEVER assume gender. Always use "The Hero" or "They/Their".`

**Does gender reach the wardrobe/costume rules?**
**No.** `costumeRules` is built at `generators.ts:6590-6650` from mode / style / universe only —
no gender input exists to consult.

**Where the actual photo *does* arrive:** only at render time. `generateFinalAd`
(`generators.ts:6057`) reads `boxA = (inputs.personalPhotos || []).filter(isRealImage).slice(0,5)`
(`generators.ts:6568`) and the OpenAI caller uploads them as `images.edit` inputs
(`functions/src/openAIImageCaller.ts:61-96`; personal photos are downscaled to 512px JPEG q70 at
`:73-79`). So the image model can *see* the hijab — but by then every wardrobe instruction in the
prompt was authored by a model that could not.

---

## 3.2 — WARDROBE RULES

**Definition:** `functions/src/culturalCompliance.ts:155-157`

```text
ARABIC MARKET WARDROBE RULES:
- Everyone dressed conservatively and modestly. Female: shoulders covered, no cleavage, hem below
  knee or trousers; hijab ONLY if present in Box A — never add or remove it. Male: no tank tops,
  no shorts above knee (business-casual minimum).
- No swimwear, gym wear showing skin, lingerie, or visible underwear. Luxury encouraged but
  COVERED (suits, abayas, elegant modest dresses, thobes).
```

**Injection sites** (all gated only on `isArabic(inputs.adLanguage)`,
`culturalCompliance.ts:167-171`):

- `generators.ts:4862` — `generateBuildPlan` (function starts `:4744`)
- `generators.ts:6645` — `generateFinalAd` (starts `:6057`)
- `generators.ts:5754-5755` + `:6039` — `buildFinalImagePrompt` (starts `:5716`), duplicate-guarded
- import `generators.ts:382`

**Are wardrobe rules gender-aware?**
**Partially, and only as static prose.** `ARABIC_WARDROBE_BLOCK` names a `Female:` clause and a
`Male:` clause, but **both are emitted unconditionally, in the same string, for every ad** — there
is no branch, no gender variable, and no runtime selection. The block is a constant
(`culturalCompliance.ts:155`), interpolated whole. The related `CULTURAL_COMPLIANCE_BLOCK:148`
adds *"NO mixed-gender physical contact (handshakes OK)"*, also unconditional.

**Does the blueprint prompt use masculine Arabic verbs regardless of the hero's actual gender?**
**Yes.** The Arabic-language branches of the concept/blueprint prompt use the masculine noun
`البطل` ("the hero", masculine) with masculine agreement throughout:

| Line | Text | Grammatical gender |
|---|---|---|
| `generators.ts:4425` | `SUBJECT_ACTION: [وصف وضعية البطل بالتفصيل. استخدم "البطل" أو "هم/لهم" فقط. …]` | **instructs the model to use the masculine `البطل`** |
| `generators.ts:4394-4395` | `البطل في حالة المعاناة … تعبير مُرهق … نفس البطل في حالة النجاح … تعبير واثق` | masculine adjectives `مُرهق`, `واثق` |
| `generators.ts:4410-4411` | `وصف البطل في حالة المعاناة … نفس البطل في حالة النجاح` | masculine |
| `generators.ts:4399` | `البطل معزول في كل نصف` | masculine `معزول` |
| `generators.ts:4431` | `البطل يملأ 70% من الإطار … أكتاف البطل … رأس البطل يتداخل` | masculine verbs `يملأ`, `يتداخل` |
| `generators.ts:4433` | `لفصل البطل عن الخلفية` | masculine |
| `generators.ts:4441` | `البطل معزول على خلفية تدرج` | masculine |
| `creativeResolver.ts:431` | `blueprintAr: 'بطل يقف بجانب نموذج كتاب ثلاثي الأبعاد…'` | masculine verb **`يقف`** |

The English branches use the neutral "The Hero / They / Their" as instructed; **the Arabic
branches have no neutral form available and default to masculine**. Note the direct
self-contradiction: `generators.ts:3664` orders *"ALWAYS use gender-neutral language"* while
`generators.ts:4425` orders *"استخدم "البطل"…"* — a masculine noun — 761 lines later in the
same prompt.

Explicit searches for `يرتدي` and `مرتدياً` as authored instructions: **NOT FOUND**.
`'مرتدياً'` appears only in a *ban list* of blueprint-leakage tokens (`generators.ts:9827`), and
`'يقف في'` likewise (`generators.ts:9827`, `captionValidator.ts:512`).

**Does the concept prompt instruct wardrobe to match the uploaded hero's apparent gender?**
**No — it instructs the exact opposite** (`generators.ts:3663-3666`, `:4283`).

**And the two rules contradict each other, with the contradicting one last.**
Inside the same `generateConcepts` prompt:

- `generators.ts:3662-3666` (gender-blindness, *"NEVER assume or invent physical attributes like
  hijab…"*) is emitted from the prompt literal opened at `generators.ts:3452`;
- `generators.ts:3401` — `HIJAB RULE: If the hero wears Hijab in Box A, maintain it styled
  appropriately for the universe.` — lives inside `modeInstruction`
  (assigned `generators.ts:3294`), which is interpolated at **`generators.ts:4463`**, i.e. **after**
  both gender-neutrality rules.

So the model is told, in order: (1) you cannot see the photo, (2) never mention hijab,
(3) …maintain the hijab you can see. All three are false or unactionable, because
`stripMediaFromInputs` (`generators.ts:1849-1858`) already removed the photo.

---

# ROOT CAUSES

Ordered by impact on the two reported symptoms.

## RC-1 — The rotation seed is frozen: `projectId` is never sent, so it degenerates to `(user, angle, UTC-day)`

*Impact: highest. Primary cause of "hooks are template-locked".*

`makeProjectSeed` (`copyDiversity.ts:40-44`) hashes `"<uid>|<projectId>|<angle>|<day>"`, but
`_projectId` / `projectId` is **read at four sites and written at none**
(`generators.ts:2382, 3158, 8603, 9079`; whole-repo write search: zero results). The frontend
holds a project id (`src/App.tsx:1736`) and sends it to other callables
(`src/App.tsx:7993, 10244, 10424`) but not to `generateTOV` (`src/App.tsx:5628, 5635`).
The seed is therefore literally `"<uid>|default|<angle>|<day>"` — **identical for every project a
user creates on a given day**. Verified by execution: repeat calls return the same seed
(`1262303019`) and the same ordered dimension list. "Project-to-project anti-sameness"
(`hookAnglesKnowledge.ts:1580`) cannot exist when the seed has no project term.

## RC-2 — Later hard-coded instructions override the rotation inside the same prompt

*Impact: highest. Independent of RC-1 — even a perfect draw would be discarded.*

The captured 41,439-char prompt contains **three** competing Hook A–D dimension maps and **two**
competing opening lists, and the hard-coded ones are last:
`generators.ts:2841` (`Hook A = FINANCIAL/REVENUE … Hook D = SKILL/CONFIDENCE`, offset 30,986) and
`generators.ts:2843-2853` (all 7 opening structures re-listed, "use each ONCE, pick 4", offset
31,136) both sit **~20,000 characters after** the Phase 23 rotated block (offset 8,776) and
**~15,000 after** the rotated table (offset 15,391). The rotation block is additionally
self-cancelling: `getAngleVariationBlueprintRotated` **prepends** to
`getAngleVariationBlueprint` (`hookAnglesKnowledge.ts:1572, 1610`), so the *fixed* A–D map is
appended directly beneath the rotated one, and the rotated openings are explicitly demoted to
*"SOFT GUIDANCE"* (`hookAnglesKnowledge.ts:1584`).

## RC-3 — The reported `"من X للY بـ[timeframe]"` template is a delivery-style feature, not a Phase 23 failure

*Impact: high. It is the literal shape the user is seeing.*

`hookTypesKnowledge.ts:277-279` defines `transformation_promise` as the literal template
`"من [before] إلى [after] في [timeframe]"`, and `hookTypesKnowledge.ts:234-236` states it
*"overrides the default format structure"* for **all 4 hooks**. It is injected at
`generators.ts:2607`, reinforced at `:2611-2613` and `:2667`, and restated at
`hookAnglesKnowledge.ts:686`. **Phase 23 rotates content dimensions only; it has no mechanism to
rotate sentence structure**, so selecting this delivery style pins every hook to one template no
matter what the rotation draws.

## RC-4 — Pool arithmetic makes set-level variety impossible even when everything works

*Impact: high.*

Every `ANGLE_DIMENSION_POOLS` entry has exactly **6** dimensions (verified by execution;
`hookAnglesKnowledge.ts:1344-1357`) while `drawDimensions` is always called with `n = 4`
(`generators.ts:2385`). Only C(6,4) = **15** sets exist, and any two draws overlap in ≥2 of 4.
The in-code comment promising a *"6–8 dimension pool"* (`hookAnglesKnowledge.ts:1582`) is wrong.
The simulated 8-generation feedback loop shows two dimensions appearing in 8/8 draws per angle and
the urgency set converging back to its gen-1 value.

## RC-5 — The memory read fails silently to a fixed draw, not to randomness, and its window is angle-blind

*Impact: high — this is the "inconsistent, then locked" amplifier.*

Three stacked silent catches (`creativeMemory.ts:506-509`, `copyDiversity.ts:98-101`,
`generators.ts:2396-2398`) convert any Firestore failure into `[]`. With `[]` every weight is 1
(`hookAnglesKnowledge.ts:1471`) and the draw collapses to the frozen seed of RC-1 — i.e. the
system **fails to maximum sameness**, the opposite of a safe default. Separately,
`getRecentFingerprintsForRotation` (`copyDiversity.ts:88-97`) fetches the newest 40 fingerprints
across **all** angles then filters by `angleKey`, so a multi-angle user can silently receive zero
bias for the current angle. Nothing distinguishes "no history" from "read failed" from "history
outside the window": `memoryBiasApplied` is `false` in all three
(`generators.ts:2387`, `:3166`).

## RC-6 — The Phase 22 quality blocks sit at 63–75% depth, with 10,453 chars of contradicting instruction after them

*Impact: high. Primary cause of "copy quality has degraded".*

Measured on the captured production prompt: `READING_LEVEL_BLOCK` @26,277,
`LIVED_SYMPTOM_BLOCK` @27,135, `FABRICATION_POLICY_BLOCK` @28,074 — then 10,453 characters
(25.2%) of later instruction, including the 7,049-char `modeInstruction` block
(`generators.ts:2111` → `:2943`) and a closing `hookQualityBlock` (`generators.ts:2999-3005`)
that re-states quality in different words, omits all three rules, and explicitly softens one
(*"Numbers/stats are powerful but NOT mandatory"*, `:3003`). Only the carousel surface
(`generators.ts:9135-9138`) places the blocks last, where they carry weight.

## RC-7 — The fabrication policy has no detector, no enforcement, and no user-visible surface — and the prompt tells the model to fabricate

*Impact: high. Direct cause of "fabricated statistics getting through".*

`CLAIM_FLAG` is entirely model-self-reported (`generators.ts:815-838` is a parser only). Flags
are stripped from the copy (`:753`, `:857`, `:3287`), written to `resolutionTrace.claimFlags`
(`:6392`), and **rendered by no UI component** (zero `claimFlags` references in `src/**/*.tsx`).
Meanwhile `generators.ts:2581` orders *"**Invent plausible industry stats**"*, and
`hookTypesKnowledge.ts:104` and `:262` order *"invent your OWN statistics"* / *"INVENT YOUR OWN
plausible round numbers"*. The two hard guards the policy defers to
(`copywriting_knowledge.ts:759`) do not cover the case: `captionValidator.ts:436-443` runs only on
the long-form caption, only under `value_stack` / `offer_card`, and only over currency patterns
(`captionValidator.ts:214-231` — `85%` matches nothing); and `hookAnglesKnowledge`
"honest-degradation rules" are **NOT FOUND** as code. `"85% يخشون الاستقالات"` therefore passes
every layer untouched.

## RC-8 — The copy scoring gate rewrites Arabic with `gpt-4o-mini` under a prompt containing no language or grammar rules

*Impact: high. Most likely cause of "sentences that don't parse".*

`COPY_SCORING_ENABLED = true` (`modelConfig.ts:10`); the gate runs on every `mode === 'initial'`
hook generation (`generators.ts:3195`) with the key installed by `serverGenerateTOV`
(`index.ts:4754`). Failing fields are handed to a **rewriter** whose entire system prompt is
`copyScoringGate.ts:1386-1397` — it contains **no Arabic guidance, no grammar rules, no
reading-level rule, no ban on dangling connectors**, none of the Arabic-quality machinery the main
prompt spends 7,000+ characters on (`generators.ts:2793-2814`, `:2111-2220`). Model-authored
Arabic is silently replaced by `gpt-4o-mini` Arabic (`copyScoringGate.ts:1400`, `temperature: 0`),
and the only post-checks are structural: length ≤ 2× (`:619`), no newline (`:605`), no block
marker (`:613`), marker-count preservation (`:483-513`). `validateHookResponse` ran **before** the
gate (`generators.ts:3117` vs `:3195`), so nothing re-validates the rewritten Arabic afterwards.

## RC-9 — Language gating is inconsistent: dialect Arabic is classified as English by the gate; `SYSTEM_TOV` hard-codes Fusha for every language

*Impact: medium.*

`generators.ts:3198-3200` maps to `"ar"` **only** for `adLanguage === "ar_fusha"` or `"ar"`.
`ar_egyptian`, `ar_gulf`, `ar_levantine`, `ar_iraqi`, `ar_maghreb` — all valid values
(`promptConstants.ts:71-75`) — are passed to the gate as `"en"`, which disables
`applyCulturalSubstitution` on every rewrite (`copyScoringGate.ts:525`) and tells `gpt-4o-mini` it
is judging English. This diverges from the canonical predicate `isArabic()`
(`culturalCompliance.ts:167-171`, `startsWith("ar")`) used everywhere else. Conversely
`promptConstants.ts:12` unconditionally orders *"Professional Marketing Fusha Arabic"* for
English, French, and dialect ads alike. Note the demo template at `src/App.tsx:8435` ships
`adLanguage: 'ar_egyptian'` — the dialect path is a default, not an edge case.

## RC-10 — Two of the six Phase 22 constants are dead, and the "shared source of truth" is not shared

*Impact: medium (drift risk, not an active regression).*

`COPY_SCORING_DIMENSIONS` (`copywriting_knowledge.ts:792`) and `COPY_REWRITE_DIAGNOSES` (`:818`)
have **zero** non-test references — asserted as intentional by `copyQuality.test.ts:234-235`.
The live gate hard-codes its own dimension names (`copyScoringGate.ts:1357-1360`) and diagnosis
strings (`copyScoringGate.ts:580-585`), so the two documents can drift from the executing code
without any test failing. `BANNED_CTA_LIST` is likewise duplicated by hand in
`promptConstants.ts:23`. Additionally, the two constants the spec names as target surfaces —
`HOOK_GENERATION_RULES` (`:307`) and `RETARGETING_RULES` (`:349`) — are dead
(`RETARGETING_RULES` is imported at `generators.ts:13` and never referenced), so the wiring landed
in ad-hoc inline positions instead.

## RC-11 — The retargeting surface gets the quality blocks at the top of the prompt; the cold surface does not get them there at all

*Impact: medium. Explains why cold ads degrade more than retargeting ads.*

`generators.ts:2060-2063` injects all four Phase 22 items into the **retargeting** branch of
`campaignInstruction` (ternary opened `generators.ts:1980`), which lands at offset ~527 — the
strongest position in the prompt. The **cold** branch (`generators.ts:2064-2073`) receives none of
them there; cold ads first meet the blocks ~25,750 characters later at `generators.ts:2831`.

## RC-12 — Hero gender is never captured, and the Arabic prompt defaults to masculine while simultaneously banning gender assumptions

*Impact: medium (the Part 3 defect).*

No gender field exists in `AdInputs` (zero `gender` matches in `src/`), no detection runs on the
uploaded photo, and `generateConcepts` cannot see the photo at all because `stripMediaFromInputs`
replaces it with `'media_omitted'` (`generators.ts:1849-1858`, called at `:3264`). The prompt then
issues three mutually inconsistent orders: *"You DO NOT know the gender… NEVER assume or invent
physical attributes like hijab"* (`generators.ts:3663-3666`), *"استخدم "البطل"…"* — a masculine
noun with masculine agreement throughout the Arabic branches (`generators.ts:4394-4441`,
`creativeResolver.ts:431` `يقف`) — and, **last in the prompt**, *"HIJAB RULE: If the hero wears
Hijab in Box A, maintain it…"* (`generators.ts:3401`, interpolated at `:4463`).
`ARABIC_WARDROBE_BLOCK` (`culturalCompliance.ts:155-157`) contains a `Female:` and a `Male:`
clause but emits both unconditionally — there is no gender variable to branch on. The hero photo
only reaches a model at render time (`openAIImageCaller.ts:61-96`), by which point every wardrobe
instruction was written blind.
