# Pro Ads AI — Creative Copy System Reference
## Single Reference for On-Creative Text: Quality Rules, Taxonomy, Structures, Scoring, and Pipeline Propagation

> **Authority:** This document is the single source of truth for how on-creative text (headline, subheadline, CTA, benefit, carousel slide captions) is decided, written, scored, and rendered. It governs Phase 22 and Phase 23 in the Launch Matrix.
> **Scope:** Text placed ON the creative for **static image** and **carousel** ads only. NOT primary ad copy. NOT video/reels/ecommerce/local-service.
> Last updated: v1 — initial authoring. Codebase audit cross-referenced against `generators.ts`, `copywriting_knowledge.ts`, `buildPlanSlotMap.ts`, `textCompositing.ts`, spec 005.

---

## ⚠️ HOW THIS FILE IS USED (read before implementing)

**This is a BUILD-TIME design source, NOT a RUNTIME dependency.** The application must never read, parse, or load this `.md` file at runtime. Doing so would add a fragile file dependency to Cloud Functions and risk cold-start crashes.

**File location (canonical):** `specs/_shared/COPY_SYSTEM_REFERENCE.md`

**How the rules reach the running app:** the rule blocks and System Instruction in this document are transcribed into **exported TypeScript constants** in `functions/src/copywriting_knowledge.ts`, which `functions/src/generators.ts` imports into its prompts. The constants are the runtime truth; this document is the human-readable source they implement.

**Required constants in `copywriting_knowledge.ts` (Phase 22):**
| Constant | Implements (this doc) | Consumed by |
|---|---|---|
| `READING_LEVEL_BLOCK` | Section 0 (reading level) + Section 9 | `SYSTEM_TOV`, `HOOK_GENERATION_RULES`, carousel prompt, `RETARGETING_RULES` |
| `LIVED_SYMPTOM_BLOCK` | Section 0 (depth) + Section 9 | same four prompt surfaces |
| `FABRICATION_POLICY_BLOCK` | Section 0 (fabrication) + Section 4 | same four prompt surfaces |
| `BANNED_CTA_LIST` | Section 8 | CTA generation in `generators.ts` |
| `COPY_SCORING_DIMENSIONS` | Section 12 | the GPT-4o-mini scoring pass |
| `COPY_REWRITE_DIAGNOSES` | Section 13 | the rewrite loop |

**Required constants (Phase 23, later):**
| Constant | Implements | Consumed by |
|---|---|---|
| `HOOK_ANGLE_OPTIONS`, `HOOK_TYPE_OPTIONS`, `AWARENESS_LEVEL_OPTIONS` | Section 3 | `creativeTextDirector.ts`, Step-2 UI dropdowns |
| `CREATIVE_TEXT_SYSTEM_INSTRUCTION` | Section 15 | `creativeTextDirector.ts` |
| `STATIC_STRUCTURES`, `CAROUSEL_FRAMEWORKS` | Sections 5–6 | `creativeTextDirector.ts` decision tree |

**Drift rule:** `copywriting_knowledge.ts` must carry a top-of-file comment: `// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md — edit the reference first, then sync these constants.` When this document changes, the constants are updated to match in the same PR. The document and the constants must never silently diverge (matches the "compiled lib going stale" discipline).

---

## SECTION 0 — DECISIONS RECORD

Product-owner decisions, final for this system.

| Decision | Answer |
|---|---|
| Reading level | **All copy ≤ 6th-grade.** Short everyday words, short sentences, no jargon, no abstract nouns. Arabic: simple spoken-style فصحى only — nothing a 12-year-old wouldn't say. Hard rule, scored, reject trigger. |
| Depth | **Dig deep — name the lived symptom.** Never state the problem abstractly. Name the concrete recognizable moment the audience already lives (scene, time of day, specific detail). Hard rule, scored, reject trigger. |
| Fabrication policy | **Three-layer ladder, not a single block.** (1) Real data provided → use it. (2) No real data for a HARD-FACT category (specific date, seat count, price, named person, precise stat) → the existing code's HONEST DEGRADATION path applies (cost-of-delay instead of a fake deadline, structural scarcity instead of fake seats, market-pattern proof instead of fake names) — KEPT as a hard rule for GCC/Meta compliance, and `captionValidator.ts`'s NUMERIC FACT VIOLATION repair stays. (3) A fabricated verifiable specific that still slips through → non-blocking `claimFlag`. Invented FRAMING (scenarios, hypotheticals, metaphors) is fully allowed and never flagged. **Correction:** an earlier draft said "the hard fake-proof block is removed" — that was wrong. What is freed is creative *framing*, NOT numeric/identity compliance. The hard guards on invented dates/seats/prices/names/stats remain; the soft flag is a safety net BELOW them, not a replacement. |
| Current 3-field structure | `Headline → Subheadline → CTA + Benefit` is NOT a forced default. It becomes one conditional structure among many. Stays the right pick for solution-aware mid-funnel ads. |
| Propagation | Copy quality is improved at the **generation source**; the existing copy-fidelity contract carries exact strings to the image automatically. No manual design-phase wiring needed for quality. |
| Structure conditionality | Making the *number* of fields conditional (headline-only, headline+proof, etc.) is a separate, later track — it touches the fidelity gate, design prompt, compositor, and step-2 UI together. |
| Taxonomy | Three independent layers: Hook Angle, Hook Type / Delivery Style, Awareness Levels. Cleaned lists in Section 3. |

---

## SECTION 1 — THE PIPELINE PROPAGATION FINDING (read first)

The 4 copy fields (`hookText`, `subheadText`, `ctaName`, `benefitText`) travel through a **3-layer fidelity contract** (verified in spec 005 + code):

```
STEP 2  generators.ts            → writes the 4 fields (4 hook variations A/B/C/D)
   │
STEP 3  buildFinalImagePrompt()  → injects all 4 verbatim into the image prompt
   │
GATE    validateCopyFidelity()   → confirms all 4 appear EXACTLY (NFC-normalized);
   │                                retries build plan up to 3x if any is paraphrased/dropped
RENDER  Gemini                   → draws the image with the text
   │
COMP    textCompositing.ts       → Sharp composites the 4 fields onto pixels (RTL Arabic)
```

**Consequence:** improving the *words* at Step 2 propagates to the final image for free, because the gate guarantees exact strings survive. Improving the *number of fields* does not — that assumption is hardcoded in the gate, design prompt, and compositor.

**Code-readiness (already partially conditional):**
- Dedup QA block in `generators.ts` can already blank a field.
- `buildFinalImagePrompt()` already conditionals `ctaName`/`benefitText` ("when non-empty").
- `validateCopyFidelity()` already checks only non-empty fields.
- Carousel path already hides CTA on middle slides (`SHOW_CTA: yes/no`).
- `textCompositing.ts` already counts only non-empty elements.

So the pipeline is ~70% ready for optional fields. Blockers: prompts always *emit* 4; step-2 UI always *shows* 4; the gate must learn "intentionally absent ≠ fidelity failure."

---

## SECTION 2 — TWO TRACKS

**Track 1 — Copy QUALITY (Phase 22, ship first, low risk).** Changes *what words* the fields contain. Rides the fidelity contract → improves every image automatically. Contains the 3 new rules + scoring + rewrite + taxonomy.

**Track 2 — Copy STRUCTURE (later phase, medium risk).** Makes the field *count* conditional. Touches gate + design prompt + compositor + step-2 UI together. Contains the 8 static / 11 carousel structures + the director module.

---

## SECTION 3 — TAXONOMY (3 independent layers)

User may set any layer manually; blanks auto-resolve (Section 8).

### Layer 1 — Hook Angle (psychological lever)
| Final | Change | Note |
|---|---|---|
| Pain Amplification | keep | |
| Curiosity | keep | |
| Rational Diagnosis | renamed from `Logic` | "the real reason X happens" |
| Expert Authority | renamed from `Logical Authority` | |
| Social Proof | keep | |
| Statistics | keep | data claims |
| Future-Based | keep | aspiration/identity-tomorrow |
| Urgency | keep | |
| Scarcity | keep | |
| Cost of Inaction | replaces vague `Threat` | price of doing nothing |
| Identity | added | "who you are / aren't" |

Removed: `Emotional` (a tone, not a lever). Legacy map: `Emotional` → `Pain Amplification` or `Future-Based` by awareness.

### Layer 2 — Hook Type / Delivery Style (format of the hook)
| Final | Change | Note |
|---|---|---|
| Question | keep | |
| Curiosity Gap | keep | |
| Pain Point | keep | |
| Transformation Promise | keep | |
| Misconception | keep | |
| Shocking Statistic | keep | |
| Controversial | keep | |
| Comedic | keep | risk flag; not on high-ticket by default |
| Listicle | keep | carousel-leaning |
| Personal Story | keep | |
| Storytelling Carousel | keep | carousel-only |
| Diagnostic | added | "find your bottleneck" |

Removed: `Threat` (promoted to Hook Angle as `Cost of Inaction`).

### Layer 3 — Awareness Levels (funnel/mental entry point)
Renamed section from "Copywriting Strategy" → **Awareness Levels**.
| Final | Change | Note |
|---|---|---|
| Pattern Interrupt | keep | |
| Problem Awareness | keep | |
| Solution Awareness | keep | |
| Product Awareness | keep | |
| Authority Builder | keep | |
| Myth Busting | keep | |
| Soft Story Sell | keep | |
| Most Aware / Retargeting | added | anchors the Objections input |

Removed: `Beginner Awareness`.

---

## SECTION 4 — INPUT DIAGNOSIS

The director (or, in Track 1, the enriched prompt) reads inputs before writing.

| Input | Shapes text by | Failure if ignored | Drives |
|---|---|---|---|
| Target audience | vocabulary, self-selection trigger | generic copy nobody claims | headline noun |
| Core offer | the true next step | wrong CTA action | CTA verb |
| Price point | low → direct CTA; high → soft/curiosity, delay CTA | high-ticket "BUY NOW" kills trust | structure + whether CTA shows |
| Desired outcome | the promise | vague benefit | headline/subhead payload |
| Pain points | the tension; source of lived symptom | no scroll-stop | headline, slide 1–2 |
| Proof (opt) | enables proof structures | invented proof (now flagged) | proof structures |
| Objections (retarget) | enables objection handling | cold message on warm traffic | objection structures |
| Hook angle | the lever | wrong tone | caption formula |
| Creative format | static vs carousel branch | wrong structure set | Section 5 vs 6 |
| CTA | intended action verb | generic CTA | CTA + benefit |

**Fabrication policy (ladder):** real data → use it; no data for hard-fact categories (date/seat/price/name/stat) → honest degradation (existing code, kept); fabricated specific that slips through → soft-flag; invented framing (metaphor/scenario) → fully allowed, never flagged. The soft flag sits BELOW the existing hard numeric/identity guards, it does not replace them.

---

## SECTION 5 — STATIC STRUCTURES (Track 2 reference)

S1 Headline only · S2 Headline + Subheadline · S3 Headline + CTA · S4 Headline + Subheadline + CTA (the old default) · S5 Headline + Proof · S6 Headline + Objection (retargeting) · S7 Diagnostic only (no CTA) · S8 Before/After.

(Full when-to-use / when-not / best-angles / example / mistake table lives in the decision-system spec; condensed here as the canonical list.)

| # | Use when | Avoid when | Best angles |
|---|---|---|---|
| S1 | pure curiosity, high-ticket cold | offer needs explaining | Curiosity, Identity, Controversial |
| S2 | problem/solution-aware, needs one clarifying line | curiosity-led | Pain Amp, Rational Diagnosis, Future |
| S3 | low price, product-aware, direct | high-ticket, cold | Urgency, Scarcity, Social Proof |
| S4 | solution-aware mid-funnel | high-ticket cold, curiosity, retargeting | Pain Amp, Rational Diagnosis, Social Proof |
| S5 | proof present + skepticism is the barrier | no real proof | Social Proof, Statistics, Expert Authority |
| S6 | retargeting + objections | cold | Rational Diagnosis, Cost of Inaction |
| S7 | self-qualification, high-ticket | low-price direct | Rational Diagnosis, Curiosity, Identity |
| S8 | concrete visual transformation | abstract/internal outcome | Future-Based, Transformation |

---

## SECTION 6 — CAROUSEL FRAMEWORKS (Track 2 reference)

All carousels: CTA on LAST slide only (except low-price Offer/CTA, where slide 1 may also). One idea/slide. Slide 1 must stop the scroll alone. Auto slide count to content; never pad. High-ticket → soft last-slide CTA.

C1 Problem-Agitation · C2 Mistake · C3 Myth-Busting · C4 Educational · C5 Before/After · C6 Proof (requires proof) · C7 Objection (retargeting) · C8 Offer/CTA (low-price) · C9 Lead Magnet · C10 Webinar/Challenge · C11 High-Ticket Sales Call.

---

## SECTION 7 — HOOK-ANGLE → TEXT FORMULAS

| Hook | Static | Carousel | Formula | Example |
|---|---|---|---|---|
| Pain | S2/S4 | C1 | `Still [painful action] but [no result]?` | `Still posting daily but no calls?` |
| Outcome | S2/S8 | C5 | `[Outcome] without [expected cost]` | `Full calendar without more ad spend` |
| Curiosity | S1 | C3 | `The real reason [X]` | `The real reason leads ghost you` |
| Mistake | S2 | C2 | `[N] [things] killing your [Y]` | `3 words killing your offer` |
| Myth | S2/S7 | C3 | `[Belief] is wrong. Here's why.` | `"More content" is wrong.` |
| Contrarian | S1/S7 | C3 | `You don't have a [X] problem.` | `You don't have a traffic problem.` |
| Mechanism | S2 | C4 | `Why [method] works when [other] fails` | `Why offers beat ad budgets` |
| Proof | S5 | C6 | `From [before#] to [after#] in [time]` | `2 to 14 calls in 31 days` |
| Objection | S6 | C7 | `"[Objection]" — here's the truth` | `"No time" — it's 20 min` |
| Urgency/Scarcity | S3 | C8/C10 | `[N left] → [benefit]` | `9 seats left → next cohort` |
| Identity | S1/S7 | C11 | `[Identity] don't [behavior]` | `Real experts don't discount` |
| Diagnostic | S7 | C11 | `If [symptom], your [thing] is the problem` | `If you discount to close, the offer's broken` |
| Before/After | S8 | C5 | `Before: [state] → After: [state]` | `Before: 0 calls → After: booked` |
| Cost of Inaction | S2 | C1 | `Every [time] you wait costs [X]` | `Every month costs 4 lost clients` |

---

## SECTION 8 — CTA + BENEFIT

**Shows on static:** low/mid price, product/solution-aware, single action.
**Hidden on static:** high-ticket cold, pure curiosity (S1), diagnostic (S7).
**Carousel:** last slide only (except C8).

Formula: `[specific verb] [the offer] → [payoff tied to their pain/outcome]`

Banned: `Learn more`, `Sign up now`, `Book now`, `Get started`, `Click here`.

Examples:
- `Watch the 12-min training → find the bottleneck killing your calls`
- `Join the 5-day challenge → fix the one step you're skipping`
- `Download the checklist → skip the 3 mistakes that cost you clients`
- `Book a 20-min call → map your next 90 days of growth`
- `Take the 60-sec quiz → see which lever is leaking revenue`

---

## SECTION 9 — TEXT CONSTRAINTS

- Static headline 3–8 words (max ~10); subheadline ≤12; CTA ≤8 incl. arrow. Total static ≤ ~20.
- Carousel caption ≤12 words (ideal 4–8). Max 2 lines per element.
- One phrase only: pure curiosity, contrarian, diagnostic, high-ticket cold.
- Numbers beat adjectives. Use proof only when present + specific.
- Never describe what the image already shows.
- **Reading level ≤ 6th grade — hard rule** (Section 0). Arabic: simple spoken فصحى.
- **Dig deep / lived symptom — hard rule** (Section 0). Concrete moment, not abstract category.
- Arabic RTL: validate against ≥70%-Arabic-script, non-blocking, before compositing.

---

## SECTION 10 — AUTOMATIC SELECTION (blanks → resolved)

1. **Awareness:** retargeting → Most Aware; strong pain + no proof + cold → Problem Awareness; offer-is-message + known → Product Awareness; proof + skeptical → Authority Builder; default cold → Pattern Interrupt.
2. **Hook Angle from awareness + price:** Most Aware → Cost of Inaction/Social Proof; Problem → Pain Amp; Solution → Rational Diagnosis; Product + low price → Urgency/Scarcity (if real); high price → Curiosity/Rational Diagnosis/Identity (never hard Urgency).
3. **Hook Type from angle + format:** carousel+Pain → Pain Point/Storytelling; carousel+Diagnosis → Listicle/Misconception; static+Curiosity → Curiosity Gap/Question; static+Cost → Question/Diagnostic.
4. **Structure:** decision tree (Section 11).

Guardrails: proof structures need a proof anchor (fabricated specifics flagged); objection structures need retargeting+objections; invented hard deadlines/quantities flagged unless `realDeadline` provided; no hook-type/awareness mismatch; no comedic on high-ticket by default.

---

## SECTION 11 — DECISION TREE (Track 2)

```
format == static?
  retargeting + objections → S6
  high price + curiosity/identity → S1
  high price + diagnosis/identity → S7 (no CTA)
  proof present + skepticism is barrier → S5
  transformation concrete/visual → S8
  low price + product-aware + single action → S3
  needs one clarifying line → S2
  else (solution-aware mid-funnel) → S4

format == carousel?
  retargeting + objections → C7
  high-ticket sales call → C11
  webinar/challenge → C10
  lead magnet → C9
  proof is the lever → C6
  myth/contrarian → C3
  mistake/listicle → C2
  transformation concrete → C5
  low price + direct → C8
  teaching-led → C4
  else (pain-led cold) → C1
→ draft → score (S12) → rewrite if fail (S13)
```

---

## SECTION 12 — SCORING RUBRIC (1–10)

1 Audience specificity · 2 Pain/desire relevance · 3 Clarity · 4 Scroll-stopping tension · 5 Wording specificity · 6 Offer relevance · 7 Hook-angle fit · 8 Format fit · 9 Visual compatibility · 10 CTA strength (if used) · 11 Proof strength (if used) · 12 Objection handling (if retargeting) · 13 Non-generic language · **14 Reading level ≤ 6th grade (hard: <7 = reject)** · **15 Lived-symptom depth (hard: <7 = reject)**.

Pass: average ≥ 8 AND no applicable dimension < 6 AND dims 14–15 ≥ 7. Engine: GPT-4o-mini, silent, non-blocking on edge cases; hard-flag (not block) fabricated specifics.

---

## SECTION 13 — REWRITE LOGIC

| Diagnosis | Fix |
|---|---|
| Too generic | add concrete audience noun + specific number/outcome |
| Too long | cut to word cap; split slide |
| Too vague | name the specific pain/outcome |
| Too clever | trade wordplay for clarity |
| Too salesy | swap hype for diagnosis/proof |
| No audience | add "for [audience] who…" trigger |
| No pain/desire | pull from Pain/Outcome inputs |
| No hook angle | re-apply Section 7 formula |
| No tension | add gap/cost/contrast |
| Weak CTA | apply Section 8 formula; ban generic verbs |
| Weak benefit | tie payoff to specific pain/outcome |
| Wrong structure | re-run decision tree |
| Bad proof | drop proof if not present |
| Bad objection | resolve, don't argue; one per line/slide |
| Above 6th grade | replace every hard/abstract word with simplest equivalent; shorten |
| Surface-level | replace category with the concrete lived moment |

Rewrite → re-score, max 2 passes; if still failing, surface best candidate with a flag rather than burning credits.

---

## SECTION 14 — WEAK → STRONG (across offer types)

| Offer | Weak | Strong |
|---|---|---|
| Mini-course | Improve your skills | Write your first offer in 90 minutes → grab the mini-course |
| Webinar (C10 s1) | Join our free webinar | The 1 funnel step everyone skips (live, Thursday) |
| Lead magnet (S2) | Download our free guide | H: Your ads aren't the problem · S: The free checklist shows the real leak |
| High-ticket call (S7) | Book a free strategy call | If you need a discount to close, the offer is broken. |
| Coaching (C1 s1) | Transform your business | Busy every day, still broke every month? |
| DFY (S5, proof) | We get results | 2 to 14 booked calls in 31 days — no extra ad spend |
| Consulting (S4) | Grow your business | H: More leads won't fix this · S: A weak offer leaks every lead · CTA: Book a call → rebuild the offer |

---

## SECTION 15 — SYSTEM INSTRUCTION (paste-ready for the model)

> You are the Creative-Text Director for Pro Ads AI. You write ONLY short text that appears ON the ad creative — headlines, subheadlines, on-design CTAs, and carousel slide captions — for static image and carousel Meta ads. You do NOT write primary ad copy; you never handle video, reels, ecommerce, or local-service formats.
>
> INPUTS: target audience, core offer, offer type, price point, desired outcome, pain points, proof (optional), objections (retargeting only), real deadline/limit (optional), hook angle, hook type, awareness level, creative format, CTA.
>
> PROCESS every time:
> 1. DIAGNOSE inputs: the audience self-selection trigger, the sharpest pain/outcome, and the true next step implied by offer + price.
> 2. RESOLVE blank dials: Awareness from retargeting/pain/proof/price; Hook Angle from awareness + price; Hook Type from angle + format.
> 3. SELECT a structure via the decision tree. Static → Headline only / +Subheadline / +CTA / +Subheadline+CTA / +Proof / +Objection (retargeting) / Diagnostic only (no CTA) / Before-After. Carousel → Problem-Agitation / Mistake / Myth-Busting / Educational / Before-After / Proof / Objection (retargeting) / Offer-CTA / Lead Magnet / Webinar-Challenge / High-Ticket Call.
> 4. WRITE using the hook-angle formula. Be specific: real audience nouns, the real pain/outcome. Write at a 6th-grade reading level or below — short everyday words, short sentences, no jargon, no abstract nouns; in Arabic, simple spoken-style فصحى only. Do NOT state the problem abstractly — name the exact concrete moment the audience already lives (the scene, the time of day, the detail that makes them think "that's literally me"). Headlines 3–8 words; subheadlines ≤12; carousel captions ≤12, one idea/slide. Slide 1 must stop the scroll alone. CTA on the last carousel slide only (except low-price Offer/CTA carousels).
> 5. WRITE the CTA (when used) as: [specific verb] [the offer] → [payoff tied to their pain/outcome]. Never output "Learn more," "Sign up now," "Book now," "Get started," or "Click here."
> 6. SCORE 1–10 on: audience specificity, pain/desire relevance, clarity, scroll-stopping tension, wording specificity, offer relevance, hook-angle fit, format fit, visual compatibility, reading level (≤6th grade), lived-symptom depth, and (when applicable) CTA strength, proof strength, objection handling, non-generic language. If average < 8, or reading level / lived-symptom < 7, or any other applicable dimension < 6, diagnose and rewrite. Max 2 rewrite passes.
>
> FABRICATION POLICY: You MAY invent persuasive framing — scenarios, hypotheticals, metaphors, illustrative composites. You do NOT need real proof to write persuasively. HOWEVER, whenever you output a fabricated verifiable specific — a named person's testimonial, an exact earnings/result figure, a hard headcount, a star rating, or a concrete deadline/quantity — attach a claimFlag with a one-line reason so the user is reminded to back it up (Meta policy + GCC consumer law). Never delete or refuse the claim; only flag it. Do NOT flag obvious hypotheticals, metaphors, or illustrative scenarios.
>
> OTHER RULES: Objection structure only in retargeting with objections provided. High-ticket → soft CTA (book/map/diagnose), never "buy now." Never describe what the image already shows. Arabic output concise and RTL-correct.
>
> OUTPUT a structured object: chosen structure, each text field with its role (headline / subheadline / cta / benefit / slide[n].caption), resolved hook angle / type / awareness, per-dimension scores, any claimFlags, and a one-line rationale. Output nothing else.

---

## SECTION 16 — "GENERATE 4 MORE LIKE THIS" (variation behavior)

A per-hook action in Step 2. The user clicks it on a hook they like to get more of the *same flavor*. It is distinct from the grid-level fresh-angle regenerate.

**Behavior:** "More like THIS" = same resolved **hook angle** + same resolved **structure** as the reference hook, with completely fresh wording, metaphors, and entry points. It does NOT vary the structure — drilling deeper into one liked direction, not exploring new ones.

- **Grid-level "fresh angles"** → explore *different* directions (variety).
- **Card-level "more like this"** → drill *deeper* into one direction they liked (fidelity to their pick).

**Wording rule:** genuinely different execution, never synonyms. Different opening word, different metaphor, a different concrete lived symptom pulled from the pain inputs. No reused words from the reference. Deduped against all existing hooks. All Section 0 quality rules (6th-grade, lived-symptom, claim-flag) and the Section 12 scoring gate apply to every variation.

**Presentation:** the variations live INSIDE the originating hook's card as a scrollable mini-carousel — reference hook = position 1, the 4 new = positions 2–5 — with left/right arrows and position dots. They are NOT appended to the bottom of the list (old behavior) and they do NOT replace the original. Approve / Edit / AI Edit / Batch act on whichever variation is currently displayed. Repeat clicks extend the same card's carousel (capped ~12), not reset it. Arabic: carousel respects RTL (next = leftward).

**Carousel ad mode:** "more like this" generates alternative full carousel angle sets; the card scrolls through alternative slide-1 hooks, each backed by its own slide set.

*(Implemented in Launch Matrix Phase 23.A, tasks 23.A1–23.A10.)*

---

## SECTION 17 — FRESH HOOKS EVERY PROJECT (anti-sameness)

**Problem:** new projects produce repetitive hooks even though the angle is correctly locked to the user's selection. The angle lock is NOT the issue and must stay. The repetition comes from three other places:
1. **Fixed dimension map.** Within the locked angle, the 4 hooks are varied across a hardcoded, fixed-order set of dimensions (Hook A = Financial, B = Time, C = Status, D = Skill). Every project on a given angle gets the same four sub-flavors in the same order.
2. **Scripted blueprints.** The `hookAnglesKnowledge.ts` blueprints are richly-worded fixed-4 scripts; the model anchors to the template, so the skeleton repeats and only nouns change.
3. **No cross-project memory.** The within-set diversity rule can't prevent repetition across projects because nothing remembers what prior projects produced.

**Fix (angle lock untouched):**
1. **Convert blueprints from scripts to pools.** Keep every word of the existing dimension psychology and Arabic phrasing; restructure each angle into a pool of 6–8 dimensions instead of a fixed 4-in-order. Draw 4-of-N, rotated per project.
2. **Rotate dimensions AND entry structure.** Within the locked angle, vary which dimensions fill the 4 hooks and which opening structures (percentage / question / imperative / ratio / conditional / direct-address / time-reference) are used — across projects, not just within one set.
3. **Cross-project anti-repetition memory.** Record angle + dimensions + opening fingerprints per user across all projects; bias new generations away from recent combos. Bias, never ban — the pool never starves.

**Not the fix:** raising temperature — it can't change the fixed dimension map, loosen the scripts, or supply memory. Leave the high temperature as-is.

**Critical:** the user's selected angle is never rotated; it stays locked exactly as the current code enforces. Only the dimensions and openings within that angle diversify.

**Carousel (different from single-hook):** the carousel is a multi-angle PICKER — the 4 cards offer 4 story directions to choose between, so it is NOT locked to one angle. Its sameness fix is to (a) draw the 4 story-direction choices from a larger pool, rotated + memory-biased per project (never the same 4 families every time), and (b) rotate which angles fill the middle slides instead of fixed A→B→C→D→E lockstep — while preserving the correct invariants (no adjacent repeat, CTA on slide 1 + last only, photo injection slide 1 only). Because the middle-slide plan is a committed contract (spec 001) and lives in Section 5.A, code + contract + Section 5.A must change together.

*(Implemented in Launch Matrix Phase 23.B for single hooks — pools in `hookAnglesKnowledge.ts`, selection in `creativeTextDirector.ts`, memory in `creativeMemory.ts`; and Phase 23.C for carousels — `generators.ts`, `App.tsx`, `slidePlanEngine.ts`, spec 001 contract, Section 5.A.)*

---

## SECTION 18 — TRACK 1 SYSTEM INSTRUCTION (current 4-field model, ship-now version)

Use this verbatim while the software still emits the fixed 4 fields. It adds the 3 new rules to the existing generator without changing structure:

> When writing the 4 fields (headline, subheadline, CTA, benefit) and every carousel slide caption:
> - Write at a 6th-grade level or below. Short everyday words. Short sentences. No jargon, no abstract nouns. In Arabic, simple spoken-style فصحى — nothing a 12-year-old wouldn't say.
> - Never state the problem in the abstract. Name the exact concrete moment the audience already lives — the scene, the time of day, the recognizable detail that makes them think "that's literally me." Pull the raw material from the pain points and audience inputs.
> - You may invent persuasive framing freely. If you write a fabricated verifiable specific (a named person, an exact number, a hard count, a star rating, a concrete deadline), tag it so the user is reminded to back it up. Never refuse or delete it.
> - Banned CTAs: "Learn more," "Sign up now," "Book now," "Get started," "Click here." Write CTAs as [verb] [offer] → [payoff tied to their pain].

---

*Source: companion decision-system spec · `generators.ts` · `copywriting_knowledge.ts` · `buildPlanSlotMap.ts` · `textCompositing.ts` · spec 005 render-prompt-pipeline · product owner decisions (Eslam)*
