# Creative-Text Copywriting Decision System — Spec

**Status:** Draft v2
**Scope:** Text placed ON the ad creative (static image + carousel only). NOT primary ad copy. NOT video/reels/ecommerce/local-service.
**Owner:** Eslam (product) · GLM (implementation) · Claude Code (audit) · CodeRabbit (PR review)

**v2 changes:** (1) Added 6th-grade language cap. (2) Added "dig-deep / name the lived symptom" mandate. (3) Replaced the hard fake-proof block with a soft-flag system. (4) Added §18 documenting the real state of `generators.ts` / `App.tsx` step-2 and a phased migration so the existing rigid 4-field structure becomes conditional without breaking the current UI.

---

## 0. Plain-English summary (read this first)

Right now your software writes creative text with a fixed shape: **Headline → Subheadline → CTA + Benefit**, every time, for every ad.

The problem: that fixed shape is wrong about half the time. A pure curiosity static ad should often be **headline only**. A high-ticket carousel needs the CTA **only on the last slide**. A retargeting ad needs **objection handling**, not a generic CTA. Forcing one structure onto everything produces generic, cluttered creatives.

This spec turns that one rigid structure into a **decision system**: the AI reads the inputs (audience, offer, price, hook angle, format, etc.), then *picks* the right text structure, *writes* it, *scores* it 1–10, and *rewrites* anything below 8. It does this differently for static images vs carousels.

Think of it as: **a server-side "copy director" that sits between the user's inputs and the image-compositing step (Sharp).** It decides the words and their layout roles before any pixels are drawn.

---

## 1. Architecture recommendation (where this lives)

**Recommendation: a new dedicated server-side module — `creativeTextDirector` — NOT a patch on the existing generation step.**

Reasoning, in plain terms:

1. **You already separate concerns this way.** Concept Director + Variance Validator run server-side invisibly; the user only sees "Brief Coherence Check" and "Variance Mode." This copy system follows the same pattern: an invisible director that emits a clean structured result. Bolting it onto the existing prompt-builder would tangle copy logic into image logic.

2. **Output is structured data, not a blob.** The director should output a typed object (structure type + each text field + role + score + rationale). Sharp then composites those fields. If you merge it into the existing step, you lose that clean handoff and make the Arabic RTL compositing harder to reason about.

3. **It's testable in isolation.** A separate module means you can score/rewrite without re-running image generation — saving credits, which matches your "non-blocking validation to avoid wasting credits" principle.

4. **Two layers, clean boundary:**
   - **Layer A — `creativeTextDirector` (new module):** input diagnosis → taxonomy resolution → structure selection → drafting → scoring → rewrite. Pure text. No image calls.
   - **Layer B — existing Sharp compositing step:** receives the director's structured output and lays out the fields. Unchanged except it now reads typed roles (`headline`, `subheadline`, `cta`, `slide[n].caption`) instead of assuming all three always exist.

**Where it slots in the pipeline:**
```
User inputs
  → Concept Director (existing, visual brief)
  → creativeTextDirector (NEW — decides + writes + scores creative text)
  → Gemini (image generation, existing)
  → Sharp (Arabic RTL compositing — reads typed text roles)
  → Variance Validator (existing)
```

The director runs **once per design** (and per-slide for carousels). It is silent to the user; user-facing surface stays "your creative text."

---

## 2. Final answer to your structure question

**Verdict: the current `Headline → Subheadline → CTA + Benefit` should NOT stay as a fixed default. It becomes CONDITIONAL, and static vs carousel get different rules.**

- It survives as **one** of several valid structures (it's a good default for *solution-aware, mid-funnel static ads*).
- It is wrong for: pure curiosity static ads (headline only), retargeting (needs objection handling), high-ticket carousels (CTA last slide only), proof-led ads (headline + proof), and diagnostic ads (diagnostic hook only, no CTA).

The system below replaces "always do these 3 parts" with "diagnose, then choose 1 of 8 static structures or 1 of 11 carousel frameworks."

---

## 3. Final Taxonomy (3 layers)

The user can pick any layer manually; anything left blank is auto-selected (§9). These three are independent dials, not a single dropdown.

### Layer 1 — Hook Angle (the psychological lever)
Final list (renamed/cleaned from current):

| Final name | Change from current | Note |
|---|---|---|
| Pain Amplification | keep | |
| Curiosity | keep | |
| Rational Diagnosis | renamed from `Logic` | "here's the real reason X happens" |
| Expert Authority | renamed from `Logical Authority` | |
| Social Proof | keep | |
| Statistics | keep | merge `Statistics` data-claims here |
| Future-Based | keep | aspiration/identity-of-tomorrow |
| Urgency | keep | time pressure |
| Scarcity | keep | limited quantity/access |
| Cost of Inaction | replaces vague `Threat` | the price of doing nothing |
| Identity | **added** | "this is who you are / who you're not" |

**Removed:** `Emotional` (too broad — it's a *tone*, not a lever; every angle can be emotional). If a user picked "Emotional" historically, map it → `Pain Amplification` or `Future-Based` based on awareness level.

### Layer 2 — Hook Type / Delivery Style (the format of the hook)
Final list:

| Final name | Change | Note |
|---|---|---|
| Question | keep | |
| Curiosity Gap | keep | |
| Pain Point | keep | |
| Transformation Promise | keep | |
| Misconception | keep | |
| Shocking Statistic | keep | |
| Controversial | keep | |
| Comedic | keep | use sparingly; risk flag |
| Listicle | keep | carousel-leaning |
| Personal Story | keep | |
| Storytelling Carousel | keep | **carousel-only** |
| Diagnostic | **added** | "answer 3 questions to find your bottleneck" |

**Removed:** `Threat` (promoted to a Hook *Angle* as `Cost of Inaction`; it's a lever, not a delivery style).

### Layer 3 — Awareness Levels (funnel/mental entry point)
Section renamed from "Copywriting Strategy" → **Awareness Levels** (per your instruction).

| Final name | Change | Note |
|---|---|---|
| Pattern Interrupt | keep | for unaware/scrolling |
| Problem Awareness | keep | |
| Solution Awareness | keep | |
| Product Awareness | keep | knows your product, needs the nudge |
| Authority Builder | keep | |
| Myth Busting | keep | |
| Soft Story Sell | keep | |
| Most Aware / Retargeting | **added** | maps to objection-handling + offer recall |

**Removed:** `Beginner Awareness` (per your instruction — do not include).

**Why "Most Aware / Retargeting" added:** your `Objections` input only exists in retargeting mode. Without an awareness level that represents "already knows you," the objection input has nowhere to attach.

---

## 4. Input Diagnosis (how the AI reads inputs before writing)

The director runs this diagnosis first and stores a `diagnosis` object it uses for every later decision.

| Input | How it shapes creative text | Failure if ignored | Drives… |
|---|---|---|---|
| **Target audience** | Sets vocabulary, the "is this for me?" trigger word, specificity. | Generic "business owners" copy nobody self-selects into. | Headline noun, subheadline framing |
| **Core offer** | Determines what the next step actually is (watch/join/download/book). | CTA promises the wrong action. | CTA verb, carousel last slide |
| **Price point** | Low price → direct CTA OK on creative. High price → soft, curiosity/diagnostic, CTA delayed. | High-ticket ad screams "BOOK NOW," kills trust. | Whether CTA appears at all; structure choice |
| **Desired outcome** | The promise. Feeds Transformation/Future-Based hooks. | Vague benefit ("grow your business"). | Headline or subheadline payload |
| **Pain points** | The tension. Feeds Pain Amp / Cost of Inaction. | No scroll-stop; nothing to react to. | Headline (problem-aware), slide 1–2 |
| **Proof/credibility** (opt) | Enables `Headline + Proof`, Proof carousel. | Empty proof → AI invents fake proof (forbidden). | Proof structures only if present |
| **Objections** (retargeting only) | Enables objection-handling structures. | Retargeting ad repeats cold-traffic message. | Objection structures, awareness=Most Aware |
| **Hook angle** | The lever (§3 L1). | Mismatched emotional tone. | Caption formula selection |
| **Creative format** | static vs carousel → entirely different structure sets. | Carousel logic forced onto a single image. | Branch between §6 and §7 |
| **CTA** | User's intended action verb. | Generic "Learn more." | CTA + benefit formula (§8) |

**Eligibility rule (kept):** if not retargeting, NO objection structure is eligible. Proof-based *structures* (S5, C6) still require *some* proof input to anchor on — but see the fabrication policy below for what "proof" can now include.

**Fabrication policy (v2 — replaces the old hard block):** The director MAY invent persuasive framing — vivid scenarios, hypotheticals, metaphors, "imagine if…" devices, illustrative composite examples. Invented framing that no reasonable viewer reads as a literal verifiable claim is fully allowed (this is the "sci-fi is fake but it sticks" principle).

What is NOT silently allowed is a **verifiable specific claim that happens to be fabricated** — a named individual's testimonial, an exact earnings figure, a hard headcount ("12,000 students"), a star rating, or a concrete deadline/quantity. These are not blocked, but each one the director emits gets a **soft flag** attached to the output so the user is told: *"This is a specific claim — make sure you can back it up before publishing (Meta ad policy + GCC consumer law)."* The user decides; the system never deletes it.

Implementation: the director tags any emitted field containing a fabricated-verifiable-claim pattern with `claimFlag: true` + a short reason, surfaced in the UI as a non-blocking warning chip. Illustrative/hypothetical framing is NOT flagged.

---

## 5. Static Image — conditional structures

Eight structures. The decision tree (§8 below… see §10 tree) picks one.

For each: **when to use / when not / best angles / example / common mistake.**

### S1. Headline only
- **Use when:** pure Curiosity or Pattern Interrupt; high-ticket cold; visual carries the rest.
- **Don't when:** offer needs explanation; problem-aware audience needs the pain named.
- **Best angles:** Curiosity, Identity, Controversial.
- **Example:** `You don't have a traffic problem.`
- **Mistake:** adding a subheadline that answers the curiosity gap (kills it).

### S2. Headline + Subheadline
- **Use when:** problem/solution-aware; the hook needs one line of clarification or mechanism.
- **Don't when:** curiosity-led (S1 better); or message fits in one line.
- **Best angles:** Pain Amplification, Rational Diagnosis, Future-Based.
- **Example:** H: `Still chasing cold leads?` · S: `The problem is the offer, not the ad budget.`
- **Mistake:** subheadline repeats the headline in different words.

### S3. Headline + CTA
- **Use when:** low-price, product-aware, direct-response; the action IS the message.
- **Don't when:** high-ticket; cold/unaware.
- **Best angles:** Urgency, Scarcity, Social Proof.
- **Example:** H: `47 founders fixed this last month` · CTA: `Join the next round → fix your funnel`
- **Mistake:** generic CTA ("Sign up now").

### S4. Headline + Subheadline + CTA  *(your current default)*
- **Use when:** solution-aware, mid-funnel, low-to-mid price, clear single next step.
- **Don't when:** high-ticket cold; pure curiosity; retargeting.
- **Best angles:** Pain Amplification, Rational Diagnosis, Social Proof.
- **Example:** H: `Stop selling to cold leads` · S: `Build demand before the call` · CTA: `Join the training → fix lead quality`
- **Mistake:** three competing ideas, one per line, no through-line.

### S5. Headline + Proof
- **Use when:** Proof input present AND skepticism is the main barrier.
- **Don't when:** no real proof (then ineligible).
- **Best angles:** Social Proof, Statistics, Expert Authority.
- **Example:** H: `From 2 calls to 14 calls a week` · Proof: `Real result, 31 days, no extra ad spend`
- **Mistake:** vague proof ("trusted by many").

### S6. Headline + Objection Handling  *(retargeting only)*
- **Use when:** retargeting; Objections input present.
- **Don't when:** cold traffic.
- **Best angles:** Rational Diagnosis, Cost of Inaction.
- **Example:** H: `"I don't have time for another course"` · Resolve: `It's 20 minutes. The fix is one step.`
- **Mistake:** arguing with the viewer instead of resolving the objection.

### S7. Diagnostic hook only  *(no CTA)*
- **Use when:** you want self-qualification; high-ticket; the goal is the reaction, not the click yet.
- **Don't when:** low-price direct response (just sell).
- **Best angles:** Rational Diagnosis, Curiosity, Identity.
- **Example:** `If your offer needs a discount to close, the offer is the problem.`
- **Mistake:** tacking a CTA on and breaking the "make them think" effect.

### S8. Before/After contrast
- **Use when:** transformation is visual and concrete.
- **Don't when:** outcome is abstract/internal (hard to contrast on one image).
- **Best angles:** Future-Based, Transformation Promise.
- **Example:** Left: `Posting daily, 0 calls` · Right: `Posting 2x/week, calendar full`
- **Mistake:** before/after with no specific metric.

---

## 6. Carousel — frameworks (slide-by-slide)

Rules that apply to ALL carousels:
- **CTA appears on the LAST slide only** (except low-price Offer/CTA carousel, where it may also appear slide 1).
- **One idea per slide.** Slide caption ≤ ~12 words (see §11).
- **Slide 1 must stop the scroll on its own** — assume slides 2+ are never seen unless slide 1 earns it.
- High-ticket → soft last-slide CTA (book a call), never "buy now."
- Auto slide count adjusts to content (matches your value-stack auto-count principle); never pad with empty slides.

### C1. Problem-Agitation
1 Name the pain → 2 Make it worse (cost) → 3 Why it persists → 4 The shift → 5 CTA.
Captions: `You're busy but broke` / `Every month it compounds` / `Because you're selling effort, not outcome` / `There's a different way` / `Watch the training → find the leak`
CTA: slide 5. Best angles: Pain Amp, Cost of Inaction.

### C2. Mistake
1 "X mistakes killing your Y" → 2–4 one mistake each → 5 CTA.
Best angles: Rational Diagnosis, Listicle. CTA: last.

### C3. Myth-Busting
1 The myth → 2 Why it's wrong → 3 The truth → 4 What to do → 5 CTA.
Awareness: Myth Busting. CTA: last.

### C4. Educational
1 Promise to teach → 2–4 steps/insights → 5 "want the full system?" CTA.
Best for lead magnets/webinars. CTA: last.

### C5. Before/After
1 Before state → 2 the turning point → 3 after state → 4 how → 5 CTA.
Best angles: Future-Based, Transformation. CTA: last.

### C6. Proof  *(requires Proof input)*
1 Bold result → 2–3 specifics/named results → 4 how it's repeatable → 5 CTA.
Ineligible if no real proof. CTA: last.

### C7. Objection-Handling  *(retargeting only)*
1 "Still on the fence?" → 2–4 one objection resolved each → 5 CTA.
Requires Objections input. CTA: last.

### C8. Offer/CTA  *(low-price only)*
1 The offer + hook → 2 what's inside → 3 who it's for → 4 proof/price → 5 CTA.
Only carousel where CTA may also appear slide 1. Best angles: Urgency, Scarcity.

### C9. Lead Magnet
1 The free thing + benefit → 2 what's inside → 3 the result it unlocks → 4 CTA `Download → avoid the common mistakes`.
Keep short (often 4 slides). CTA: last.

### C10. Webinar/Challenge
1 The event + transformation → 2 what you'll learn → 3 who it's for → 4 date/format → 5 CTA `Join the challenge → fix the missing step`.
CTA: last. Urgency OK on slide 4 if real.

### C11. High-Ticket Sales Call
1 Diagnostic/identity hook → 2 the real problem → 3 the mechanism → 4 who it's for (qualify) → 5 soft CTA `Book the call → map your next growth move`.
NEVER "buy now." Self-qualification is the point. CTA: last, soft.

**Avoiding text-heaviness (all carousels):** one idea/slide; numbers over sentences; let the visual carry context; if a slide needs 2 sentences, split into 2 slides or cut.

---

## 7. Hook-Angle → Creative-Text logic

For each hook, the static structure it prefers, the carousel framework it prefers, a caption formula, an example, and the risk.

| Hook | Static pref | Carousel pref | Caption formula | Example | Risk |
|---|---|---|---|---|---|
| Pain-based | S2/S4 | C1 | `Still [painful action] but [no result]?` | `Still posting daily but no calls?` | self-pity, no path |
| Desired-outcome | S2/S8 | C5 | `[Outcome] without [expected cost]` | `Full calendar without more ad spend` | overpromise |
| Curiosity | S1 | C3 | `The real reason [X] (it's not [Y])` | `The real reason leads ghost you` | clickbait w/ no payoff |
| Mistake | S2 | C2 | `[N] [things] quietly killing your [Y]` | `3 words quietly killing your offer` | vague mistakes |
| Myth-busting | S2/S7 | C3 | `[Common belief] is wrong. Here's why.` | `"More content" is wrong.` | strawman |
| Contrarian | S1/S7 | C3 | `You don't have a [X] problem.` | `You don't have a traffic problem.` | edgy w/o substance |
| Mechanism | S2 | C4 | `Why [method] works when [other] fails` | `Why offers beat ad budgets` | jargon |
| Proof-based | S5 | C6 | `From [before #] to [after #] in [time]` | `2 to 14 calls in 31 days` | fake/vague proof |
| Objection | S6 | C7 | `"[Objection]" — here's the truth` | `"No time" — it's 20 min` | argumentative |
| Urgency/Scarcity | S3 | C8/C10 | `[N spots/hours] left → [benefit]` | `9 seats left → next cohort` | fake deadline |
| Identity | S1/S7 | C11 | `[Identity] don't [behavior]` | `Real experts don't discount` | insulting |
| Diagnostic | S7 | C11 | `If [symptom], your [thing] is the problem` | `If you discount to close, the offer's broken` | too clever |
| Before/after | S8 | C5 | `Before: [state] → After: [state]` | `Before: 0 calls → After: booked` | no metric |
| Comparison | S2 | C2 | `[Old way] vs [new way]` | `Cold pitching vs warm demand` | unfair compare |
| Cost-of-inaction | S2 | C1 | `Every [time] you wait costs [X]` | `Every month costs 4 lost clients` | fear-mongering |

---

## 8. CTA + Benefit logic

**When CTA appears on the static creative:** low/mid price, product- or solution-aware, single clear action. (S3, S4, sometimes S8.)

**When it does NOT appear on the static creative:** high-ticket cold (let the hook breathe), pure curiosity (S1), diagnostic (S7), proof-only when the proof IS the persuasion (S5 sometimes). The click lives in the primary copy / button instead.

**When CTA appears only at the END of a carousel:** almost always (C1–C7, C9–C11). Mid-carousel CTAs leak attention.

**When CTA is replaced by curiosity / diagnosis / proof:** high-ticket and unaware audiences — the next step is "keep thinking," not "click." Use S7 or end a carousel on a diagnostic line + soft call.

**CTA + Benefit formula:** `[specific action verb] [the offer] → [the specific payoff tied to their pain/outcome]`

Banned generic CTAs: `Learn more`, `Sign up now`, `Book now`, `Get started`, `Click here`.

**Improved formulas (better than the originals you gave):**
- `Watch the 12-min training → find the bottleneck killing your calls`
- `Join the 5-day challenge → fix the one step you're skipping`
- `Download the checklist → skip the 3 mistakes that cost you clients`
- `Book a 20-min call → map your next 90 days of growth`
- `Grab the template → write your offer in one sitting`
- `Take the 60-sec quiz → see which lever is leaking revenue`

Specificity dials the CTA must hit: tie to **the offer** (what it is), **the next step** (what they do), **the desired outcome** (what they get), **the mechanism** (how), and **the pain solved** (why now).

---

## 9. Automatic selection rules (when user leaves dials blank)

Run in this order. Output: a resolved `{hookAngle, hookType, awareness, structure}`.

**Step 1 — Resolve Awareness:**
- Retargeting mode ON → `Most Aware / Retargeting`.
- Pain points strong + no proof + cold → `Problem Awareness`.
- Offer is the message + product known → `Product Awareness`.
- Proof present + skeptical market → `Authority Builder`.
- Default cold → `Pattern Interrupt`.

**Step 2 — Resolve Hook Angle from Awareness + Price:**
- Most Aware → `Cost of Inaction` or `Social Proof`.
- Problem Awareness → `Pain Amplification`.
- Solution Awareness → `Rational Diagnosis`.
- Product Awareness + low price → `Urgency`/`Scarcity` (only if real).
- High price (any awareness) → `Curiosity` / `Rational Diagnosis` / `Identity` (never hard Urgency).

**Step 3 — Resolve Hook Type from Angle + Format:**
- Carousel + Pain Amp → `Pain Point` or `Storytelling Carousel`.
- Carousel + Rational Diagnosis → `Listicle` or `Misconception`.
- Static + Curiosity → `Curiosity Gap` or `Question`.
- Static + Cost of Inaction → `Question` or `Diagnostic`.

**Step 4 — Resolve Structure (see tree §10).**

**Guardrails the auto-selector must enforce:**
- Proof structure (S5/C6) requires *some* proof anchor in inputs; fabricated specifics inside it get soft-flagged (§4 fabrication policy), not blocked.
- No objection structure unless retargeting + `Objections` present.
- `Urgency`/`Scarcity` are allowed even without a declared deadline, BUT any hard deadline/quantity the AI invents is soft-flagged for the user to confirm. If the user prefers honest-only urgency, the optional `realDeadline` field (§15) suppresses the flag.
- No hook-type/awareness mismatch (e.g., `Storytelling Carousel` on a static image → reject, pick `Question`).
- No comedic on high-ticket sales-call offers by default.

---

## 10. Decision tree (the AI follows this)

```
START
 ├─ format == static?
 │    ├─ retargeting + objections present? → S6 (Objection)
 │    ├─ high price ($$$) ?
 │    │     ├─ curiosity/identity angle → S1 (Headline only)
 │    │     └─ diagnosis/identity angle → S7 (Diagnostic only)   [no CTA]
 │    ├─ proof present AND skepticism is main barrier? → S5 (Headline + Proof)
 │    ├─ transformation is concrete/visual? → S8 (Before/After)
 │    ├─ low price + product-aware + single action? → S3 (Headline + CTA)
 │    ├─ needs one line of clarification/mechanism? → S2 (Headline + Subheadline)
 │    └─ else (solution-aware, mid-funnel) → S4 (H + S + CTA)   [the old default]
 │
 └─ format == carousel?
      ├─ retargeting + objections present? → C7 (Objection)
      ├─ high-ticket sales call offer? → C11 (High-Ticket)
      ├─ webinar/challenge offer? → C10
      ├─ lead magnet offer? → C9
      ├─ proof present + proof is the lever? → C6 (Proof)
      ├─ myth/contrarian angle? → C3 (Myth-Busting)
      ├─ mistake/listicle angle? → C2 (Mistake)
      ├─ transformation concrete? → C5 (Before/After)
      ├─ low price + direct? → C8 (Offer/CTA)
      ├─ teaching-led? → C4 (Educational)
      └─ else (pain-led cold) → C1 (Problem-Agitation)
END → draft text → score (§12) → rewrite if <8 (§13)
```

---

## 11. Text constraints (words on the design)

- **Static headline:** 3–8 words ideal, hard max ~10. One line, two at most.
- **Static subheadline:** ≤ 12 words, one line.
- **Static CTA:** ≤ 8 words including the benefit arrow.
- **Total static text:** aim ≤ 20 words across all elements.
- **Carousel caption per slide:** ≤ 12 words; ideal 4–8.
- **Max lines per element:** 2.
- **One phrase only** when: pure curiosity, contrarian, diagnostic, high-ticket cold.
- **Use numbers** when: proof, mistakes count, stats, deadlines, before/after metrics. Numbers beat adjectives.
- **Use proof** only when present and specific.
- **Avoid clutter:** if two elements say the same thing, cut one.
- **Work WITH the visual:** text names the tension/idea; the image carries mood/context. Never describe what the image already shows (don't write "happy woman at laptop" over a photo of a happy woman at a laptop).
- **Arabic RTL:** all of the above applies to the rendered Arabic; word counts are guidance, validate against the existing ≥70%-Arabic-script, non-blocking rule before compositing.

**Reading level (v2 — hard rule):** All copy must read at a 6th-grade level or below. Concretely: short everyday words, short sentences, no abstract nouns, no jargon. For Arabic specifically: spoken/simple فصحى, no literary or formal flourishes, no rare vocabulary, nothing a 12-year-old wouldn't say out loud. If a word has a simpler synonym, use the simpler one. This is scored (§12, dimension 14) and is a reject trigger.

**Dig-deep / name the lived symptom (v2 — hard rule):** Copy must NOT state the problem in the abstract. It must name the *specific, concrete moment the audience already lives* — the symptom, the scene, the thing they'd recognize as "that's literally me." Surface-level: "struggling to get clients." Deep: "you check the calendar every morning and it's still empty." Pull the raw material from the Pain points and Target audience inputs, then render it as a moment, not a category. This is scored (§12, dimension 15) and is a reject trigger.

---

## 12. Scoring rubric (1–10 each; reject/rewrite if total avg < 8)

Score every candidate across these. Conditional rows only count when applicable.

1. Audience specificity
2. Pain/desire relevance
3. Clarity
4. Scroll-stopping tension
5. Wording specificity (non-generic)
6. Offer relevance
7. Hook-angle fit
8. Creative-format fit
9. Visual compatibility (doesn't duplicate the image)
10. CTA strength *(if CTA used)*
11. Proof strength *(if proof used)*
12. Objection handling *(if retargeting)*
13. Non-generic language
14. **Reading level ≤ 6th grade** *(v2 — hard: below 7 = auto-reject)*
15. **Lived-symptom depth** *(v2 — names a concrete moment, not an abstract problem; below 7 = auto-reject)*

**Pass bar:** average ≥ 8 AND no single applicable dimension below 6. Anything failing → §13.

Implementation: GPT-4o-mini as the silent critique/quality gate (matches your existing critique-model role). Non-blocking on edge cases to avoid wasting credits; hard-block only on fabricated proof/deadlines.

---

## 13. Rewrite logic

If a candidate fails, the director diagnoses the reason, then rewrites with the matched fix:

| Diagnosis | Fix |
|---|---|
| Too generic | Inject one concrete audience noun + one specific number/outcome |
| Too long | Cut to the structure's word cap (§11); split carousel slide |
| Too vague | Name the specific pain or the specific outcome |
| Too clever | Trade the wordplay for clarity; say the thing |
| Too salesy | Swap hype for a diagnostic or proof line |
| No clear audience | Add the self-selection trigger ("for [audience] who…") |
| No pain/desire | Pull from Pain/Desired-outcome inputs into the headline |
| No hook angle | Re-apply the §7 formula for the resolved angle |
| No tension | Add a gap, a cost, or a contrast |
| Weak CTA | Apply §8 benefit formula; ban generic verbs |
| Weak benefit | Tie payoff to the specific pain/outcome |
| Wrong static structure | Re-run §10 static branch |
| Wrong carousel structure | Re-run §10 carousel branch |
| Bad proof use | If proof not present → drop proof structure entirely |
| Bad objection handling | Resolve, don't argue; one objection per line/slide |
| Above 6th-grade reading level | Replace every hard/abstract/formal word with its simplest everyday equivalent; shorten sentences |
| Surface-level / abstract problem | Replace the category with the concrete lived moment pulled from Pain points (a scene, a time of day, a specific recognizable detail) |

Rewrite, re-score, repeat max 2 passes; if still <8, surface the best candidate with a flag rather than burning more credits.

---

## 14. Examples across offer types (weak → strong)

**Mini-course (low price, static S3):**
Weak: `Improve your skills` → Strong: `Write your first offer in 90 minutes → grab the mini-course`

**Webinar (carousel C10, slide 1):**
Weak: `Join our free webinar` → Strong: `The 1 funnel step everyone skips (live, Thursday)`

**Lead magnet (static S2):**
Weak: `Download our free guide` → Strong: H: `Your ads aren't the problem` · S: `The free checklist shows the real leak`

**High-ticket call (static S7, no CTA):**
Weak: `Book a free strategy call` → Strong: `If you need a discount to close, the offer is broken.`

**Coaching (carousel C1 slide 1):**
Weak: `Transform your business` → Strong: `Busy every day, still broke every month?`

**DFY service (static S5, proof present):**
Weak: `We get results` → Strong: `2 to 14 booked calls in 31 days — no extra ad spend`

**Consulting (static S4):**
Weak: `Grow your business` → Strong: H: `More leads won't fix this` · S: `A weak offer leaks every lead` · CTA: `Book a call → rebuild the offer`

---

## 15. Suggested new inputs (only what's essential)

Two optional additions, both low-cost:

1. **`Real deadline / limit` (optional, retargeting + launch contexts).** *Why it matters:* the auto-selector must never invent Urgency/Scarcity. Without a field to declare a real deadline, the AI either fakes urgency (forbidden) or can't use the angle at all. **Optional**, but it's the clean way to unlock Urgency/Scarcity honestly.
2. **`Offer type` enum (mini-course / webinar / challenge / lead magnet / high-ticket call / coaching / consulting / course / DFY / other).** *Why it matters:* the carousel branch (§10) routes on offer type (C9/C10/C11). You can infer it from Core offer, but an explicit enum makes routing reliable and cheap. **Recommended, near-essential** for carousels.

Everything else uses existing inputs. No other additions needed.

---

## 16. SYSTEM INSTRUCTION (paste-ready)

> You are the Creative-Text Director for Pro Ads AI. You write ONLY the short text that appears ON the ad creative — headlines, subheadlines, on-design CTAs, and carousel slide captions — for static image and carousel Meta ads. You do NOT write primary ad copy, and you never handle video, reels, ecommerce, or local-service formats.
>
> INPUTS you receive: target audience, core offer, offer type, price point, desired outcome, pain points, proof (optional), objections (retargeting only), real deadline/limit (optional), hook angle, hook type, awareness level, creative format, CTA.
>
> PROCESS, every time:
> 1. DIAGNOSE the inputs. Identify the audience's self-selection trigger, the sharpest pain or outcome, and the true next step implied by the offer and price.
> 2. RESOLVE any blank dials using the Automatic Selection Rules: pick Awareness from retargeting/pain/proof/price; pick Hook Angle from awareness + price; pick Hook Type from angle + format.
> 3. SELECT a structure via the decision tree. Static → one of: Headline only, Headline+Subheadline, Headline+CTA, Headline+Subheadline+CTA, Headline+Proof, Headline+Objection (retargeting only), Diagnostic only (no CTA), Before/After. Carousel → one of: Problem-Agitation, Mistake, Myth-Busting, Educational, Before/After, Proof, Objection (retargeting only), Offer/CTA, Lead Magnet, Webinar/Challenge, High-Ticket Call.
> 4. WRITE the text using the hook-angle formula for the resolved angle. Be specific: real audience nouns, the real pain/outcome. Write at a 6th-grade reading level or below — short everyday words, short sentences, no jargon, no abstract nouns; in Arabic, simple spoken-style فصحى only. Do NOT state the problem in the abstract — name the exact concrete moment the audience already lives (the scene, the time of day, the recognizable detail that makes them think "that's literally me"). Headlines 3–8 words; subheadlines ≤12; carousel captions ≤12 words, one idea per slide. Slide 1 must stop the scroll alone. CTA appears on the last carousel slide only (except low-price Offer/CTA carousels).
> 5. WRITE the CTA (when used) as: [specific verb] [the offer] → [payoff tied to their pain/outcome]. Never output "Learn more," "Sign up now," "Book now," "Get started," or "Click here."
> 6. SCORE the result 1–10 on: audience specificity, pain/desire relevance, clarity, scroll-stopping tension, wording specificity, offer relevance, hook-angle fit, format fit, visual compatibility, reading level (≤6th grade), lived-symptom depth, and (when applicable) CTA strength, proof strength, objection handling, non-generic language. If the average is below 8, or reading level / lived-symptom depth is below 7, or any other applicable dimension is below 6, diagnose the weakness and rewrite. Max 2 rewrite passes.
>
> FABRICATION POLICY: You MAY invent persuasive framing — vivid scenarios, hypotheticals, metaphors, illustrative composite examples. Invented framing that no reasonable viewer reads as a literal verifiable claim is fully allowed. You do NOT need real proof to write persuasively. HOWEVER, whenever you output a verifiable specific claim that is fabricated — a named person's testimonial, an exact earnings/result figure, a hard headcount, a star rating, or a concrete deadline/quantity — attach a claimFlag to that field with a one-line reason, so the user is reminded to be able to back it up (Meta ad policy + GCC consumer law). Never delete or refuse the claim; only flag it. Do NOT flag obvious hypotheticals, metaphors, or illustrative scenarios.
>
> OTHER RULES: Use an objection structure only in retargeting with objections provided. For high-ticket offers, keep CTAs soft (book/map/diagnose), never "buy now." Never describe what the image already shows. For Arabic output, keep text concise and RTL-correct.
>
> OUTPUT a structured object: chosen structure name, each text field with its role (headline / subheadline / cta / slide[n].caption), the resolved hook angle / hook type / awareness level, the score per dimension, and a one-line rationale. Output nothing else.

---

## 17. Implementation plan (atomic tasks for the worktree)

One file, one action, one acceptance condition each — your standard format.

| # | Task | File | Acceptance |
|---|---|---|---|
| T1 | Add `offerType` enum + optional `realDeadline` to input schema | inputs schema | New fields persist; existing flows unaffected |
| T2 | Add taxonomy constants (L1/L2/L3 final lists, §3) | `taxonomy.ts` | All renames/removals reflected; old values map cleanly |
| T3 | Build `creativeTextDirector` module skeleton (server-side) | `creativeTextDirector.ts` | Module callable; returns typed empty result |
| T4 | Implement Input Diagnosis (§4) | director | Emits `diagnosis` object from inputs |
| T5 | Implement Auto-Selection rules (§9) | director | Blank dials resolve; guardrails block fake proof/urgency |
| T6 | Implement Decision Tree (§10) | director | Returns one valid structure for any input combo |
| T7 | Implement static structure writers S1–S8 (§5) | director | Each emits correct fields within word caps |
| T8 | Implement carousel writers C1–C11 (§6) | director | CTA last-slide rule enforced; auto slide count |
| T9 | Implement CTA+Benefit generator + banned-CTA filter (§8) | director | No banned phrases ever emitted |
| T10 | Implement scoring via GPT-4o-mini gate (§12) | director | Returns per-dimension scores; non-blocking edge cases |
| T11 | Implement rewrite loop (§13, max 2 passes) | director | <8 triggers diagnosed rewrite; caps passes |
| T12 | Define typed output contract (roles) | types | Sharp step consumes typed roles, no "always 3 fields" assumption |
| T13 | Wire director into pipeline before Sharp | pipeline | Director runs once/design, per-slide for carousel |
| T14 | Update Sharp compositing to read typed roles | Sharp step | Renders only present fields; Arabic RTL intact |
| T15 | Migration: map legacy `Emotional`/`Threat`/`Beginner Awareness` | migration | Old saved values resolve to new taxonomy |
| T16 | Add 6th-grade + lived-symptom rules to prompts (Phase A) | `generators.ts`, `copywriting_knowledge.ts` | New rules present in `HOOK_GENERATION_RULES`, `SYSTEM_TOV`, carousel + retargeting prompts |
| T17 | Replace hard fake-proof block with soft `claimFlag` (Phase A) | `generators.ts` + output type | Fabricated specifics flagged, never blocked; hypotheticals not flagged |
| T18 | Surface `claimFlag` warning chip in step-2 UI | `App.tsx` | Flagged fields show non-blocking "verify before publishing" chip |
| T19 | Make `subheadText`/`ctaName`/`benefitText` truly optional in step-2 UI (Phase B) | `App.tsx` | Empty fields render cleanly; no broken slots; regenerate buttons hide for absent fields |
| T20 | Allow prompts to emit fewer than 4 fields per chosen structure (Phase B) | `generators.ts` | Parser handles headline-only / headline+proof / etc. without inventing empty fields |

Gate order: GLM implements → Claude Code audit → CodeRabbit → you approve → deploy (rebuild `functions/lib` first per your Firebase rule).

---

## 18. Reality of the existing code (READ BEFORE PLANNING THE WORKTREE)

The spec above describes a flexible "pick 1 of N structures" system. The **current software does not work that way yet** — it is hardcoded to a fixed 4-field structure. This section documents the gap honestly so the phasing is realistic.

### 18.1 What exists today

- **`generators.ts`** contains dedicated prompt constants — `HOOK_GENERATION_RULES`, `SUBHEADLINE RULES`, `CTA BENEFIT RULES`, `RETARGETING_RULES`, `SYSTEM_TOV` — that **always** produce four fields: `hookText`, `subheadText`, `ctaName`, `benefitText`.
- Step 2 generates exactly **4 hook variations** (Hook A/B/C/D), each mapped to a fixed Schwartz level + emotional angle.
- **`App.tsx`** step-2 UI renders all four fields with individual per-field regenerate buttons. It assumes all four exist.
- The **carousel generator already conditionally hides CTA/benefit** on middle slides via a `SHOW_CTA: yes/no` marker — so the *rendering* layer can already handle missing fields. The *step-2 hook* layer cannot.
- There is already an **anti-repetition / dedup QA layer** that blanks a field if it duplicates another. This is useful and stays; the director's scoring extends it.

**Implication:** the rigid structure isn't a bug to rip out — it's a sensible default that's currently *forced*. The work is to make it *conditional*, not to throw it away.

### 18.2 Phased migration (do NOT do this all at once)

**Phase A — Prompt + flag changes (low risk, ship first).** Tasks T16–T18. Keep the 4-field structure exactly as-is. Only: (1) inject the 6th-grade rule and the lived-symptom rule into the existing prompts, (2) swap the hard fake-proof block for the soft `claimFlag`, (3) show the flag chip in the UI. Nothing structural changes; the step-2 UI and carousel parser are untouched in their shape. This delivers your three new requests fast and safely.

**Phase B — Conditional fields (medium risk).** Tasks T19–T20. Make the three non-headline fields genuinely optional end-to-end: prompts may emit fewer fields, the parser stops inventing empties, and the step-2 UI renders cleanly when a field is absent. The carousel side already tolerates this; the risk is concentrated in `App.tsx` step-2 rendering and the hook parser. Paranoid checkpoint here.

**Phase C — Director module (largest, separate phase).** Tasks T1–T15. Build `creativeTextDirector` as the new brain that *selects* structures, *scores*, and *rewrites*, replacing `HOOK_GENERATION_RULES` as the decision-maker while reusing the now-conditional field plumbing from Phase B. This is where the decision tree, taxonomy resolution, and 8-static/11-carousel structures actually come online.

### 18.3 Why this order

Phase A gives you the three things you asked for today with almost no structural risk. Phase B unlocks the *possibility* of non-4-field output without yet adding the decision brain. Phase C adds the brain on top of plumbing that already supports it. If you invert this — building the director first — it will fight a step-2 UI and a hook parser that still assume four fields, and you'll be debugging two layers at once. Each phase is independently shippable and independently auditable, which matches your "marked Done ≠ deployed" discipline.

### 18.4 Highest-risk tasks (flag for paranoid checkpoints)

- **T19** (`App.tsx` optional fields) — touches the live step-2 UI that every generation flows through.
- **T20** (parser emits <4 fields) — the hook parser and the dedup QA layer interact; an empty field must mean "intentionally absent," not "failed to parse."
- **T12 + T14** (typed roles + Sharp) — changes the contract Sharp reads; Arabic RTL compositing must stay intact.
