# Pro Ads AI — Launch Matrix
## Single Source of Truth for Launch Scope, Approved Combinations, and Behavior Contracts

> **Authority**: This file overrides all older behavior assumptions, the Compatibility Matrix v2, and the ChatGPT master plan for launch scope.
> Where this file and any other document disagree, this file wins.
> Last updated: v3 — 11 product owner decisions applied.

---

## HOW TO USE THIS FILE

1. **Launch Surface Registry** — exactly what ships, nothing more
2. **Deferred Registry** — exactly what does not ship, and why
3. **Carousel Slide-Count Plans** — explicit per-count structure for every supported slide count, cold and retargeting
4. **Behavior Contracts** — per-lane pass/fail rules for the 11 priority flows
5. **Implementation Gaps** — what is missing in the codebase right now (Specs A–G)

A combination is approved for launch **only if it appears in Section 2**.
A fix is valid **only if it satisfies the Evidence Workflow (Section 10)**.

**For implementation:** Go directly to **Section 14 — Build Order** at the bottom of this file. Section 14 is self-contained — it has everything needed to execute each phase without reading any other section. Sections 1–13 are the reference spec; Section 14 is the execution guide. Start with the Dependency Map at the top of Section 14 to understand which phases unlock which, then work top to bottom through each phase.

---

## SECTION 0 — DECISIONS RECORD

All product owner decisions. These are final for launch.

| Decision | Answer |
|---|---|
| Non-launch combo UX | Block selection immediately. Inline message below the blocked item explaining the conflict. No toast. No modal. |
| UI language | Arabic Fusha + English only. |
| Ad copy language | All 6 Arabic dialects + English = 7 launch languages. |
| Non-launch languages | Hide entirely from selector. |
| `step3point5.ts` | Remove. Dead code. |
| Resolution trace storage | Server-side sub-document on `generations/{genId}`. Written by Cloud Functions. |
| Mode + campaign restrictions | Use existing `creativeResolver.ts` rules only. |
| Offer Type dropdown | **3 entries**: `Live Event`, `Free Guide`, `Mini-Course`. Free Webinar + Paid Workshop + Challenge collapsed into `Live Event`. |
| `limited_access`, `module_preview`, `day_strip` | **Removed entirely** — deleted from codebase, resolver, UI, and all prompt logic. Not deferred. Gone. |
| `retargeting + batch` | **Approved at launch**. Single-image retargeting is validated. Batch = single x N, same pipeline. |
| Minimal universe | Third family alongside realistic and fantasy. No sub-styles. Universe dropdown **stays visible** so user can switch families. When minimal is active, environment is suppressed in generation — the dropdown is not hidden. |
| Art Direction label | The sub-style card section is labeled **"Art Direction"** across all families — not a per-family label. Fantasy has its own set of Art Direction cards alongside Realistic. |
| Reference ad plan gate | **Pro plan** and above. |
| Carousel slide count | Explicit structure defined for every count 2–9, both cold and retargeting mode. See Section 5.A. |
| Testimonial carousel | New feature — user uploads testimonial screenshots, each rendered as platform mockup slide. Cold + Retargeting. |
| value_stack + carousel | Item-per-slide. Slide count auto-adjusted to gift count + 2. User's original selection overridden with notification. |
| value_stack empty fields | Never rendered. Never mentioned. If a field is empty it does not exist in the blueprint, contract, or image. |

---

## SECTION 1 — WHAT EXISTS (DO NOT REBUILD)

| Area | Key File(s) | Status |
|---|---|---|
| Creative resolver | `functions/src/creativeResolver.ts` (1133 lines) | Exists |
| 6-stage generation pipeline | `functions/src/generators.ts` (6395 lines) | Exists |
| Layout contract system | `functions/src/layoutContract.ts`, `layoutTemplates.ts` | Exists |
| Build plan validation | `functions/src/buildPlanSlotMap.ts` | Exists |
| Caption validation | `functions/src/captionValidator.ts` | Exists |
| Creative scoring engine | `functions/src/creativeScoringEngine.ts` | Exists |
| Entitlements | `functions/src/entitlements.ts`, `src/planconfig.ts` | Exists |
| Mode field schema | `src/modeFieldSchema.ts` | Exists |
| Creative memory + RAG | `functions/src/creativeMemory.ts`, `rankingEngine.ts` | Exists |
| Zustand store | `src/store.ts` | Exists |
| Generation run records | `generations` Firestore collection | Exists |
| `step3point5.ts` | `functions/src/step3point5.ts` | DEAD CODE — DELETE |

---

## SECTION 2 — LAUNCH SURFACE REGISTRY

### 2.1 Approved Offer Types (Step 1 Dropdown)

```
Live Event     → tab: live_events
Free Guide     → tab: free_guide
Mini-Course    → tab: mini_course
```

### 2.2 Approved Creative Modes Per Tab

| Tab | Approved Modes | Removed from codebase |
|---|---|---|
| `mini_course` | `standard_hero`, `value_stack`, `before_after`, `text_only` | `limited_access` DELETED, `module_preview` DELETED |
| `live_events` | `standard_hero`, `event_ticket`, `webinar_screen`, `speaker_card`, `before_after`, `text_only` | `day_strip` DELETED |
| `free_guide` | `standard_hero`, `book_mockup`, `device_mockup`, `before_after`, `text_only` | — |

> `limited_access`, `module_preview`, and `day_strip` are deleted from the resolver mode catalog, all UI components, and all prompt logic. They do not exist in the launched product.

### 2.3 Approved Mode Pairs Per Tab

**Mini-Course:**

| Mode A | Mode B | Layout Key | Notes |
|---|---|---|---|
| `standard_hero` | `value_stack` | `hero_value_stack` | Hero 60% + stack zone |
| `before_after` | (any) | BLOCKED | Solo only — defines entire canvas |
| `text_only` | (any) | BLOCKED | Mutually exclusive |

**Live Events:**

| Mode A | Mode B | Layout Key | Notes |
|---|---|---|---|
| `standard_hero` | `event_ticket` | `hero_ticket` | |
| `standard_hero` | `webinar_screen` | `hero_screen` | |
| `standard_hero` | `speaker_card` | `hero_speaker` | |
| `event_ticket` | `speaker_card` | `ticket_speaker` | |
| `event_ticket` | `webinar_screen` | `ticket_webinar` | Ticket to attend a webinar |
| `webinar_screen` | `speaker_card` | `screen_speaker` | |
| `before_after` | (any) | BLOCKED | Solo only |
| `text_only` | (any) | BLOCKED | Mutually exclusive |

**Free Guide:**

| Mode A | Mode B | Layout Key | Notes |
|---|---|---|---|
| `standard_hero` | `book_mockup` | `hero_book` | |
| `standard_hero` | `device_mockup` | `hero_device` | |
| `book_mockup` | `device_mockup` | `book_device` | |
| `before_after` | (any) | BLOCKED | Solo only |
| `text_only` | (any) | BLOCKED | Mutually exclusive |

### 2.4 Approved Campaign Types x Ad Formats x Plan Requirements

| Campaign Type | Format | Plan Required | Approved? | Notes |
|---|---|---|---|---|
| `cold` | `single` | Starter+ | YES | |
| `cold` | `carousel` | Pro+ | YES | |
| `cold` | `batch` | Scaling | YES | |
| `retargeting` | `single` | Creator+ | YES | |
| `retargeting` | `carousel` | Pro+ | YES | Sequential objection answering |
| `retargeting` | `batch` | Scaling | YES | Batch = retargeting single x N |

### 2.5 Universe Families and Art Direction

| Family | Art Direction Cards | Universe Dropdown | Minimal behavior |
|---|---|---|---|
| `realistic` | Yes — 10 cards (Creator+ to unlock) | Yes — location list | — |
| `fantasy` | Yes — 10 cards (Creator+ to unlock) | Yes — world list | — |
| `minimal` | None | Visible (not hidden) — user may need to switch away | Environment is suppressed in generation. Backdrop is clean/solid. The universe value is ignored when rendering. |

**Art Direction section label:** The entire sub-style card grid is called **"Art Direction"** in the UI. It shows cards filtered to the currently selected family. Realistic and Fantasy each have their own card sets.

> **Minimal + universe dropdown:** The dropdown stays visible. If minimal is active, the universe field value is visible but not applied to scene generation. No environment is rendered regardless of what is typed.

### 2.6 Approved Ad Languages

**Launch (visible in selector):**
```
ar_fusha      — العربية الفصحى
ar_egyptian   — اللهجة المصرية
ar_gulf       — اللهجة الخليجية
ar_levantine  — اللهجة الشامية
ar_iraqi      — اللهجة العراقية
ar_maghreb    — اللهجة المغاربية
en            — English
```

**Hidden entirely (remove from AD_LANGUAGES):**
```
fr · es · de · tr · pt
```

### 2.7 Approved Hook Angles (Cold — 10 total)

`before_after` is a **Creative Mode**, not a hook angle. Remove it from the hook angle selector.

```
emotional, logic, urgency, scarcity, pain, curiosity,
statistics, social_proof, logical_authority, future_based
```

### 2.8 Approved Retargeting Objections

```
price_too_high, no_budget_now, need_installments, dont_trust,
will_it_work_for_me, tried_before_failed, no_time, overwhelmed,
not_ready_yet, need_approval, dont_want_call, dont_need_it
+ custom (free text)
```

### 2.9 Testimonial Carousel Feature

A carousel mode where user uploads testimonial screenshots. Each is rendered as a platform mockup slide.

- **Available in:** Cold + Carousel, Retargeting + Carousel
- **Plan required:** Pro+ (carousel requirement applies)
- **Slide 1:** AI-generated hook — creates curiosity to swipe, no testimonial shown
- **Middle slides:** One testimonial per slide, rendered in platform-accurate mockup
- **Last slide:** CTA close
- **Slide count:** Auto-adjusted to testimonial count + 1 hook + 1 close

---

## SECTION 3 — DEFERRED REGISTRY

Only languages are deferred. All removed modes are deleted (not deferred).

| Item | Reason | When to Restore |
|---|---|---|
| French, Spanish, German, Turkish, Portuguese | No quality contracts at launch. | After Spec E is extended. |

> `limited_access`, `module_preview`, `day_strip` — **DELETED. Not deferred.** They do not appear anywhere.

---

## SECTION 4 — VISUAL CONTROL PRECEDENCE CHAIN

```
PRIORITY 1 — Reference Ad Upload  [Pro+ only]
  Overrides: universe scene, art direction
  Preserved: creative mode layout (hero position, stack zone, ticket frame, etc.)
  Log: referenceAdOverrideActive: true, overriddenUniverse, overriddenSubStyle

PRIORITY 2 — Visual Style Family (realistic / fantasy / minimal)
  Compatibility guard only — not a visual aesthetic input
  Controls: which art direction cards are available
  Minimal: universe dropdown visible but scene NOT rendered
  Clears art direction when family switches
  Log: artDirectionCleared: true, reason: "family_switch"

PRIORITY 3 — Art Direction card (sub-style)
  Overrides: universe rendering aesthetic (color, texture, lighting)
  Preserved: creative mode layout, CTA rules, slide structure, copy
  Not available for: minimal family, text_only mode
  Log: resolvedSubStyle: "<id>" or null

PRIORITY 4 — Universe / Setting
  Controls: scene environment, hero wardrobe direction
  Overridden by: Reference Ad and Art Direction aesthetic
  In minimal: visible in UI — NOT applied to scene
  Not shown for: text_only mode

PRIORITY 5 — Creative Mode Layout  [lowest — overridden by nothing]
  Controls: compositional structure
  Always preserved regardless of all other overrides
```

**Practical resolution table:**

| Scenario | Correct resolution |
|---|---|
| Reference ad + art direction selected | Reference wins. Art direction suppressed. Mode layout preserved. |
| Reference ad + universe selected | Reference wins. Universe suppressed. |
| Art direction + universe (no reference) | Art direction aesthetic takes visual priority. Universe still informs wardrobe + location. |
| Minimal family active | Art direction cleared (none available). Universe dropdown visible but environment NOT rendered. |
| Switch Realistic to Fantasy | Art direction cards not in Fantasy cleared. Universe resets to Fantasy default. |
| `text_only` selected | Universe hidden. Art direction hidden. Style family hidden. Mode layout = typography-only canvas. |
| Carousel slide 2+ | Visual locked to slide 1 style reference. No new Box A injection. |

---

## SECTION 5.A — CAROUSEL SLIDE-COUNT PLANS

Explicit structure for every slide count a user can select. Nothing left to chance. The pipeline must follow these plans exactly.

---

### Cold Carousel — Slide-Count Plans

**Angle pool for cold middle slides:**
```
A = Direct value / transformation benefit
B = Curiosity / open loop / question that demands the next slide
C = Social proof / real result / relatable scenario
D = Problem agitation / cost of status quo
E = Mechanism / how it specifically works
F = Objection pre-emption
G = Identity / who this is for
```

| Slides | Slide 1 | Middle Slides (no CTA) | Last Slide | CTA On |
|---|---|---|---|---|
| 2 | Hook + CTA | — | Close + CTA | 1, 2 |
| 3 | Hook + CTA | A | Close + CTA | 1, 3 |
| 4 | Hook + CTA | A → B | Close + CTA | 1, 4 |
| 5 | Hook + CTA | A → B → C | Close + CTA | 1, 5 |
| 6 | Hook + CTA | A → B → C → D | Close + CTA | 1, 6 |
| 7 | Hook + CTA | A → B → C → D → E | Close + CTA | 1, 7 |
| 8 | Hook + CTA | A → B → C → D → E → F | Close + CTA | 1, 8 |
| 9 | Hook + CTA | A → B → C → D → E → F → G | Close + CTA | 1, 9 |

**Rules for all cold carousel sizes:**
- CTA button on slide 1 and last slide ONLY. Never on middle slides.
- Middle slides: headline + subheadline only. No button, no benefit bar.
- Each middle slide uses a distinct angle. No two adjacent slides repeat the same angle.
- Visual consistency locked to slide 1 style reference from slide 2 onward.
- Box A injected on slide 1 only. Not re-injected on slides 2+.
- Selected hook angle (emotional, logic, etc.) governs overall framing. The angle pool above is the narrative variation within that framing.

---

### Retargeting Carousel — Slide-Count Plans

**Angle pool for retargeting middle slides:**
```
P = Proof — testimonials, results, data that counter the objection
M = Mechanism — exactly how/why it works (what they missed before)
R = Risk reversal — guarantee, ease, support, "worst case is..."
I = Identity shift — "people like you are doing this"
C = Cost of inaction — the pain of NOT acting now
Q = Question reframe — replace their skeptical question with a better one
E = Evidence comparison — "what you tried vs what this does differently"
```

| Slides | Slide 1 | Middle Slides (no CTA) | Last Slide | CTA On |
|---|---|---|---|---|
| 2 | Name objection as tension + CTA | — | Close + urgency + CTA | 1, 2 |
| 3 | Name objection + CTA | P | Close + CTA | 1, 3 |
| 4 | Name objection + CTA | P → M | Close + CTA | 1, 4 |
| 5 | Name objection + CTA | P → M → R | Close + CTA | 1, 5 |
| 6 | Name objection + CTA | P → M → R → I | Close + CTA | 1, 6 |
| 7 | Name objection + CTA | P → M → R → I → C | Close + CTA | 1, 7 |
| 8 | Name objection + CTA | P → M → R → I → C → Q | Close + CTA | 1, 8 |
| 9 | Name objection + CTA | P → M → R → I → C → Q → E | Close + CTA | 1, 9 |

**Rules for all retargeting carousel sizes:**
- CTA button on slide 1 and last slide ONLY. Hard fail if it appears anywhere else.
- Every middle slide is traceable to its specific angle from the pool above.
- Every slide stays focused on the selected objection. No topic drift.
- Same visual consistency, hero face, and style reference rules as cold.
- If no testimonial provided, angle P uses product result claims or data instead.

---

### value_stack Carousel — Auto-Adjustment Rule

When `value_stack` is active in carousel mode, slide count is **driven by the number of gifts provided**, not the user's selection. The user's selection is overridden with a notification.

**Formula:**
```
Resolved slides = 1 (hook, no item mockup) + N (one slide per gift) + 1 (close with total + CTA)
               = N + 2

Examples:
3 gifts → 5 slides
4 gifts → 6 slides
5 gifts → 7 slides
6 gifts → 8 slides
7 gifts → 9 slides
8+ gifts → capped at 9 slides; last gift and close merged on final slide
```

**UI notification when override fires:**
> "Your carousel was adjusted to [N] slides — one gift per slide."

**Empty fields rule — applies everywhere value_stack is used:**
> Any field left empty (`valueStackTitle`, `valueStackItems`, `valueStackBonuses`, `valueStackPrice`, `valueStackOriginalValue`, `valueStackSavings`, `valueStackGuarantee`, `valueStackDeliveryFormat`, `valueStackProofStatement`) is **never rendered, never mentioned, never referenced** in the blueprint, contract, or image. An empty field does not exist.

**Per-slide structure (value_stack carousel):**

| Slide | Role | Must Appear | Must NOT Appear |
|---|---|---|---|
| 1 (Hook) | Tease the stack | Headline: offer framing. Subheadline: tease what's coming. CTA button. Hero if `standard_hero` paired. | Any item detail. Any price. |
| Each middle slide | One gift per slide | Gift name as headline. Gift benefit/value as subheadline. Visual mockup of the gift. | CTA button. Price info. Other gifts. Any empty field data. |
| Last slide (Close) | Price reveal + CTA | Total value (only if provided). Actual price with contrast (only if both price fields provided). Savings callout (only if provided). CTA button. Hero if present. | Any field that was left empty. Missing price contrast. Middle-slide energy. |

---

### Testimonial Carousel — Slide-Count Plans

| Slides | Slide 1 | Middle Slides | Last Slide |
|---|---|---|---|
| 2 | Hook + CTA | — | 1 testimonial + CTA |
| 3 | Hook + CTA | 1 testimonial | 1 testimonial + CTA |
| 4 | Hook + CTA | 2 testimonials | 1 testimonial + CTA |
| 5 | Hook + CTA | 3 testimonials | 1 testimonial + CTA |
| 6 | Hook + CTA | 4 testimonials | 1 testimonial + CTA |
| 7 | Hook + CTA | 5 testimonials | 1 testimonial + CTA |
| 8 | Hook + CTA | 6 testimonials | 1 testimonial + CTA |
| 9 | Hook + CTA | 7 testimonials | 1 testimonial + CTA |

> If fewer testimonials uploaded than slides allow: auto-adjust to testimonial count + 2.

---

## SECTION 5 — PRIORITY LANES + BEHAVIOR CONTRACTS (11 Lanes)

---

### Lane 1 — Retargeting + Carousel

**Trigger:** `campaignType: "retargeting"`, `adMode: "carousel"`, `retargetingObjection` required (blocks generation if empty).

Follow retargeting slide-count plan from Section 5.A.

**Pass conditions:**
- Slide 1 headline names or implies the objection as tension. Does NOT resolve it.
- Every subheadline: complete sentence, max 12 Arabic / 8 English words. Never ends on a conjunction.
- Middle slides: no CTA, no benefit bar. Hard fail if either appears.
- Each middle slide uses a different angle from the retargeting pool.
- Every slide stays on the selected objection.
- Visual style, art direction, color palette consistent across all slides.
- Slide 2+: Box A NOT re-injected. Slide 1 is style reference.
- Hero face consistent throughout.
- CTA text on slide 1 and last slide matches `inputs.cta` exactly.

**Arabic pass conditions:**
- Headline max 8 words.
- Subheadline max 12 words, complete sentence.
- All text RTL.
- Natural spoken Arabic. Not formal classical. Not motivational poster.
- Arabic Unicode ratio >= 70%.
- Action verbs on tension slides: يخسر، يكلفك، يقتل، يستنزف.

**Hard fails:**
- CTA on any middle slide
- Two adjacent slides using identical angle
- Topic drift to a different subject than the objection
- Hero face changes mid-carousel
- Subheadline ends on a conjunction

---

### Lane 2 — Cold + Single + `before_after`

**Trigger:** `campaignType: "cold"`, `adMode: "single"`, `offerCreativeMode: ["before_after"]`, Box A required.

**Visual pass conditions:**
- Canvas split into two halves. Both halves present.
- Before half: hero in problem state. Struggle expression. Props matching the specific problem in headline.
- After half: same hero in result state. Confident expression. Transformed props.
- Props transform logically (empty to full, cheap to premium, cluttered to organized).
- Visible divider between halves. Type depends on active art direction.
- No "BEFORE"/"AFTER" / "قبل"/"بعد" text labels on the image. Ever.
- Same face both halves. Matches Box A bone structure.
- Headline spans both halves. CTA at bottom center.

**Copy pass conditions:**
- Headline: two contrasting states using transition markers (من...إلى / قبل...بعد / كان...أصبح / بدلاً من). Both states specific.
- Subheadline: supports the contrast. Complete sentence.
- CTA: bridges from after-state to action.

**Hard fails:**
- Single-state image with no split
- Different people in the two halves
- Text labels describing the states
- Hero does not match Box A
- Subheadline ignores the before/after framing

---

### Lane 3 — Cold + Carousel + `value_stack`

**Trigger:** `campaignType: "cold"`, `adMode: "carousel"`, `offerCreativeMode` includes `value_stack`.

**Slide count:** Auto-adjusted to gift count + 2. See Section 5.A value_stack plan.

**Empty field rule:** Any field left empty does not exist in the blueprint, contract, or rendered image.

**Pass conditions:**
- Slide 1: no item detail, no price.
- Each middle slide: exactly one gift. Its visual mockup. No CTA.
- Last slide: price contrast only if both `valueStackPrice` and `valueStackOriginalValue` are provided. CTA present.
- CTA only on slide 1 and last slide.
- Visual consistency across all slides.

**Hard fails:**
- CTA on any gift slide
- Price on slide 1
- Any empty field data rendered in any form
- Two gifts on one slide
- Slide count not matching gift count + 2 (unless capped at 9)

---

### Lane 4 — Cold + Carousel (any approved mode)

**Trigger:** `campaignType: "cold"`, `adMode: "carousel"`, any approved mode.

Follow cold slide-count plan from Section 5.A for the exact per-slide structure.

**Pass conditions:**
- CTA on slide 1 and last slide only.
- Middle slides: headline + subheadline only. No button, no benefit bar.
- Creative mode layout on ALL slides.
- Art direction consistent across ALL slides.
- Slide 2+: Box A not re-injected. Slide 1 is style reference.

**Hard fails:**
- CTA on any middle slide
- Mode layout shifts between slides
- Art direction changes mid-carousel
- Box A re-injected on slide 2+

---

### Lane 5 — Cold + Batch + `standard_hero` + `value_stack`

**Trigger:** `campaignType: "cold"`, `adMode: "batch"`, `offerCreativeMode: ["standard_hero", "value_stack"]`.

**Batch definition:** Single image × N. Each image is an independent single. No anchoring between images.

**Pass conditions:**
- Every image uses `hero_value_stack` layout.
- Full stack zone visible in every image (not one item per image — that is carousel behavior).
- Empty fields not rendered in any image.
- Hero face from Box A applied independently to each image.
- Art direction consistent across all images.

---

### Lane 6 — Cold + Single + `value_stack`

**Trigger:** `campaignType: "cold"`, `adMode: "single"`, `offerCreativeMode` includes `value_stack`.

**Pass conditions:**
- If `standard_hero` paired: hero dominant 60% + distinct stack zone.
- If `value_stack` solo: stack zone dominant.
- Only render fields that have data.
- Price contrast shown only if both price fields are provided.
- Minimum 3 item rows visible if 3+ items provided.
- Stack zone is structurally distinct — not a floating text list.

**Hard fails:**
- Any empty field rendered
- Price contrast shown when price fields are empty
- Stack zone with no visible item row structure

---

### Lane 7 — Retargeting + Single + `value_stack`

**Trigger:** `campaignType: "retargeting"`, `adMode: "single"`, `offerCreativeMode` includes `value_stack`, `retargetingObjection` required.

**Pass conditions:**
- Headline addresses the objection using the stack as evidence. Not a feature recap.
- Stack zone shows items as proof of worth.
- Subheadline connects the stack to the objection resolution.
- CTA is belief-shifting — not generic.
- Empty fields not rendered.
- Arabic quality rules apply (see Lane 1).

**Hard fails:**
- Headline recaps features without addressing the objection
- Generic "Sign Up" CTA not connected to the objection
- Any empty field rendered

---

### Lane 8 — Minimal + `standard_hero` + Single

**Trigger:** `visualStyleFamily: "minimal"`, `offerCreativeMode: ["standard_hero"]`, `adMode: "single"`.

**Pass conditions:**
- No environment rendered. No worldbuilding. No scene.
- Backdrop: solid color or minimal gradient only.
- Hero isolated against backdrop. No environmental context.
- Universe dropdown visible in UI — universe value NOT applied to generation.
- No art direction cards available or applied.
- Typography dominant alongside the hero. Generous negative space.

**Hard fails:**
- Environmental scene appears in output
- Art direction aesthetic applied when family is minimal
- Universe selection causes environment to be rendered

---

### Lane 9 — Minimal + `standard_hero` + Batch

**Trigger:** `visualStyleFamily: "minimal"`, `offerCreativeMode: ["standard_hero"]`, `adMode: "batch"`.

Same per-image rules as Lane 8. Each image generated independently. No anchoring between images.

---

### Lane 10 — Testimonial Carousel (Cold)

**Trigger:** `campaignType: "cold"`, `adMode: "carousel"`, testimonial screenshots uploaded, testimonial mode active.

Follow testimonial slide-count plan from Section 5.A.

**Pass conditions:**
- Slide 1: AI-generated hook. Creates curiosity to swipe. References testimonials indirectly. No testimonial text shown. CTA button present.
- Testimonial slides: each screenshot rendered in platform-accurate mockup. No CTA on non-last slides.
- Last slide: CTA close. May use a key stat from any testimonial as the headline.
- Slide count auto-adjusted if fewer testimonials than slides.
- Art direction consistent across all slides.

**Platform mockup rules:**

| Detected Platform | Mockup Style |
|---|---|
| WhatsApp | Chat bubble UI. Green header. Timestamp visible. |
| Instagram DM | IG interface (dark or light). Username visible. |
| Facebook | Blue header. Comment card or Messenger bubble. |
| Email | Inbox card or open email view. |
| Google Review | Star rating card. Reviewer name visible. |
| Telegram | Telegram bubble style. Chat context. |
| Unknown / Other | Clean quote card with avatar placeholder and name. |

**Hard fails:**
- Testimonial text visible on slide 1
- Platform mockup does not match the uploaded screenshot's platform
- CTA on any middle testimonial slide
- Slide count not adjusted when fewer testimonials than slides

---

### Lane 11 — Testimonial Carousel (Retargeting)

**Trigger:** `campaignType: "retargeting"`, `adMode: "carousel"`, testimonial screenshots uploaded, `retargetingObjection` required.

**Pass conditions:**
- Slide 1: Hook that names the objection AND teases testimonials as evidence. CTA button.
- Testimonial slides: same platform mockup rules as Lane 10. Testimonials should be selected or framed to directly counter the selected objection where possible.
- Last slide: objection-resolution CTA close. Not generic.
- All retargeting Arabic quality rules apply (see Lane 1).

**Hard fails:**
- Generic close slide not connected to the objection
- CTA on any middle testimonial slide
- Testimonials unrelated to the objection when objection-relevant ones are available

---

## SECTION 6 — STEP 1 INPUT SURFACE (COMPLETE)

### 6.1 Always Visible

| Field | Type | Options | Required |
|---|---|---|---|
| Product Name | Text | Free text | YES |
| Target Audience | Text | Free text | YES |
| Main Challenge | Text + AI chips | Free text | YES |
| Transformation | Text + AI chips | Free text | YES |
| Offer Type | Dropdown | `Live Event`, `Free Guide`, `Mini-Course` | YES |
| CTA Button Text | Text | Free text | YES |
| Campaign Type | Toggle | Cold / Retargeting (Creator+) | YES |
| Ad Language | Dropdown | 7 launch languages only | YES |

### 6.2 Cold Only

| Field | Options | Plan Limits |
|---|---|---|
| Hook Angle | 10 angles (before_after is a Creative Mode now, not listed here) | Starter: 4. Creator: 8. Pro+: 10. |
| Hook Type | 12 styles | Starter: 4. Creator: 8. Pro+: 12. |
| Copywriting Strategy | 8 strategies | Starter: 3. Creator: 6. Pro+: 8. |

### 6.3 Retargeting Only

| Field | Options | Notes |
|---|---|---|
| Objection | 12 canonical + custom | Required. Blocks generation if empty. |
| Testimonial / Proof | Textarea | Optional. Feeds proof angle. |

### 6.4 Visual / Format Fields

| Field | Options | Notes |
|---|---|---|
| Ad Format | Single / Carousel (Pro+) / Batch (Scaling) | |
| Slide Count | 2–5 (Pro) / 2–9 (Scaling) | Hidden for single and batch. |
| Visual Style Family | Realistic / Fantasy (Creator+) / Minimal | All three show universe dropdown. Minimal suppresses scene in generation. |
| Universe / Setting | Realistic: location list + custom. Fantasy: world list + custom. | Visible for all families. Not applied to scene when Minimal is active. Hidden for text_only. |
| Art Direction | Cards filtered to current family. Incompatible cards hidden. | Section labeled "Art Direction." Hidden for text_only and minimal. |
| Aspect Ratio | 1:1, 4:5, 3:4, 4:3, 9:16, 16:9 | All plans. |
| Ad Tone | 11 tones | Starter: 4. Creator: 8. Pro+: 11. |

### 6.5 Upload Boxes

| Box | Contents | Visible When | Notes |
|---|---|---|---|
| Box A — Personal Photos | Up to 5 hero photos | Always except text_only | Slide 2+ carousels: NOT re-injected. Slide 1 used as style reference. |
| Box B — Brand Logos | Up to 5 logos | Always | |
| Box C — Mode Assets | Book cover / event banner / guide screenshot / bonus graphics | When mode requires it | Contextual label based on mode. |
| Testimonial Screenshots | Unlimited | Testimonial carousel mode only | Platform detected from each screenshot. |
| Reference Ad | Single upload | **Pro+ only** | Overrides universe + art direction. Used as style anchor for carousel. |

---

## SECTION 7 — SILENT OVERRIDES REGISTRY

Every auto-switch must be logged server-side AND shown to the user.

| Event | What Changes | Required UI Signal | Log Field |
|---|---|---|---|
| Reference ad uploaded | Universe overridden. Art direction overridden. | Banner: "Reference ad active — visual style follows the reference." | `referenceAdOverrideActive: true` |
| Retargeting selected | `coldHookAngle` set to null. | Hook section replaced by Objection section. | `hookAngle: null, reason: "retargeting"` |
| `text_only` selected | Universe hidden. Art direction hidden. Box A hidden. | Visual section collapses. | `textOnlyActive: true` |
| Testimonial + single format | `adMode` switches to carousel. | Toast: "Testimonials require carousel — switched automatically." | `autoSwitchAdMode: "carousel"` |
| `before_after` + carousel attempted | Mode deselected or blocked. | Inline: "Before/After is single-image only." | `modeCleared: "before_after"` |
| value_stack slide count override | `slideCount` adjusted to gift count + 2. | Inline: "Carousel adjusted to [N] slides — one gift per slide." | `slideCountOverride: true, newCount: N` |
| Testimonial slide count override | `slideCount` adjusted to testimonial count + 2. | Inline: "Carousel adjusted to [N] slides — one testimonial per slide." | `slideCountOverride: true, newCount: N` |
| Realistic to Minimal | Art direction cleared. | Art direction grid disappears. | `artDirectionCleared: true` |
| Realistic to Fantasy | Non-Fantasy art direction cleared. | Art direction resets to Fantasy cards. | `artDirectionCleared: true` |
| Carousel slide 2+ | Box A not injected. Slide 1 used as reference. | No UI signal — internal pipeline. | `perSlide[n].photoInjection: false` |

---

## SECTION 8 — RESOLUTION TRACE SCHEMA

```typescript
interface ResolutionTrace {
  resolvedCampaignType: 'cold' | 'retargeting';
  resolvedAdMode: 'single' | 'carousel' | 'batch';
  resolvedCreativeModes: string[];
  resolvedStyleFamily: 'realistic' | 'fantasy' | 'minimal';
  resolvedSubStyle: string | null;
  referenceAdOverrideActive: boolean;
  overriddenUniverse?: string;
  overriddenSubStyle?: string;
  artDirectionCleared?: boolean;
  artDirectionClearedReason?: string;
  hookAngle: string | null;
  hookAngleNullReason?: string;
  objectionId: string | null;
  effectiveObjectionText: string | null;
  modeCompatibilityResult: 'ok' | 'adapt' | 'block';
  modeCompatibilityReason?: string;
  slideCountOverride?: boolean;
  originalSlideCount?: number;
  resolvedSlideCount?: number;
  slideCountOverrideReason?: string;
  valueStackEmptyFieldsSkipped?: string[];
  autoSwitchEvents: Array<{ field: string; from: string; to: string; reason: string }>;
  perSlide?: Array<{
    slide: number;
    hasCTA: boolean;
    narrativeAngle: string;
    photoInjection: boolean;
    testimonialPlatform?: string;
  }>;
  launchMatrixCheckPassed: boolean;
  launchMatrixBlockReason?: string;
}
```

---

## SECTION 9 — IMPLEMENTATION GAPS (SPECS)

### Gap List

| ID | Gap | Severity | Spec |
|---|---|---|---|
| G1 | No launch surface registry | Critical | A = this file |
| G2 | Campaign type not in resolver | Critical | B |
| G3 | Format not in resolver | High | B |
| G4 | No persistent resolution trace | High | B |
| G5 | `step3point5.ts` dead code | Cleanup | B |
| G6 | Silent override signals missing | High | C |
| G7 | No launch-scope frontend filter | High | C |
| G8 | No QA fixtures for priority lanes | High | D |
| G9 | No failure classification | Medium | F |
| G10 | No deferred registry | Medium | A = this file |
| G11 | Non-launch languages visible | Medium | C |
| G12 | Minimal universe not in resolver | Medium | B |
| G13 | Testimonial carousel not built | High | G |
| G14 | value_stack slide count auto-adjust not built | High | B |
| G15 | `limited_access`, `module_preview`, `day_strip` still in codebase | High | C |

---

### Spec B — Resolver Completeness + Resolution Trace

**File:** `functions/src/creativeResolver.ts`

1. Add `campaignType`, `adFormat`, `universeStyle` as resolver inputs
2. Add `minimal` as third universe family (no art direction, no scene rendering, universe dropdown still visible)
3. Add `validateLaunchSurface(inputs): { allowed: boolean, reason?: string }` — shared frontend + backend
4. Write `resolutionTrace` sub-document to `generations/{genId}` — schema in Section 8
5. Add `carouselSlideCountPlan(campaignType, slideCount, mode)` — returns per-slide angle/role array per Section 5.A
6. Add `resolveValueStackSlideCount(gifts: string[]): number` — auto-adjust logic
7. Add `filterEmptyValueStackFields(inputs)` — strips empty fields before any prompt
8. Delete `step3point5.ts`
9. Centralize scattered campaign-type restrictions from `generators.ts` into resolver

---

### Spec C — Frontend Launch Filter + Override Signals

**Files:** `src/components/InputForm.tsx`, `src/store.ts`

1. Delete `limited_access`, `module_preview`, `day_strip` from all UI components and mode catalogs
2. Apply `validateLaunchSurface()` — invalid combos blocked with inline message
3. Hide non-launch languages
4. Move `before_after` to Creative Mode grid, remove from hook angle list
5. Universe dropdown visible for all 3 families. Minimal only suppresses scene generation — it does not hide the dropdown.
6. Art Direction section labeled "Art Direction" across all families
7. Add all override signals from Section 7
8. value_stack carousel: slide count auto-adjust + notification
9. Backend guard in `functions/src/index.ts` — reject invalid combos server-side
10. Reference ad: available from Pro plan only

---

### Spec G — Testimonial Carousel (New)

No existing code. New feature.

1. Add testimonial screenshot upload to Step 3 when testimonial mode selected
2. Platform detection per screenshot (visual heuristic or lightweight model call)
3. Per-slide mockup generator — renders screenshot inside platform-accurate UI frame
4. Hook slide generator — AI hook for slide 1 with testimonial-specific framing
5. Slide count auto-adjustment: testimonial count + 1 hook + 1 close
6. Cold and Retargeting variants (objection-connected framing for retargeting)
7. Add `testimonial_carousel` to `CREATIVE_MODE_CATALOG` in `creativeResolver.ts`

---

### Spec D — Priority Lane QA Fixtures

**File:** `functions/src/contractFixtures.test.ts`

One canonical fixture per lane (11 lanes). Each has: exact input JSON, expected `resolutionTrace`, pass/fail checks per Section 5.

---

### Spec E — Language Quality Contracts

**File:** `functions/src/captionValidator.ts`

Per launch language: word count, register validation, RTL compliance, dialect-specific markers.

---

### Spec F — Failure Classification

**File:** `functions/src/generators.ts`

```typescript
type FailureClass =
  | 'prompt_malformed' | 'model_error' | 'validation_reject'
  | 'slot_repair_failed' | 'numeric_hallucination'
  | 'combination_invalid' | 'credit_insufficient';
```

Add `failureClass` and `costEstimate` to generation record.

---

## SECTION 10 — EVIDENCE WORKFLOW

A fix is NOT accepted until the developer returns all of the following. No exceptions.

| # | Required | What it must show |
|---|---|---|
| 1 | Failing rule ID | Exact rule name from this file. Not "carousel was broken." |
| 2 | Controlling file/function | Exact filename + function. e.g. `generators.ts → generateCarouselSlides() → slide 2 CTA block` |
| 3 | Why old behavior occurred | The exact code path. |
| 4 | What changed | The exact new code/condition. |
| 5 | Resolution trace before | Relevant fields from a failing run. |
| 6 | Resolution trace after | Same fields from a passing run — must show the difference. |
| 7 | Screenshot before | The failing output. |
| 8 | Screenshot after | The passing output. |
| 9 | Exact test inputs | Full input JSON. Reproducible. |

---

## SECTION 11 — ADAPT STATES

`adapt` = art direction replaces the mode's default visual language while preserving structural layout.

| Combination | What replaces what |
|---|---|
| `luxury_magazine` + `value_stack` | Stack zone becomes magazine cover sidebar. Bold condensed text. Gold accent prices. Dense column. Zero empty space. Dark solid background. |
| `luxury_magazine` + `event_ticket` | No ticket stub. Date/time as bold cover-line callout. Gold banner for event name. |
| `anime_manga` + `value_stack` | Stack items become manga inventory panels. Bold outline border per item. Starburst on total value. RPG loot screen energy. |
| `anime_manga` + `event_ticket` | Ticket becomes manga chapter splash page. Speed lines. Dramatic lettering. |
| `vintage_bw` + `value_stack` | Stack items become vintage newspaper ad list. Ink-drawn illustrations. Heavy typeset numerals. Thick ink dividers. |
| `comic_book` + `value_stack` | Stack items become loot panel. 4-color illustration per item. Halftone shading. POW starburst on total. |
| `watercolor_dreamscape` + `event_ticket` | No ticket frame. Painted invitation. Watercolor wash background. Handwritten-feel title. |
| `cinematic_film_still` + `value_stack` | Stack zone becomes lower-third crawl treatment. 35mm grain across entire frame. |
| All others | Sub-style aesthetic overrides universe rendering. Mode layout preserved. If incoherent: escalate to explicit fusion spec. No silent fallback. |

---

## SECTION 12 — EXECUTION SEQUENCE

```
Phase 0: This file complete

Phase 1 — Foundation (sequential)
  Spec B: Resolver Completeness + Trace + Slide Plans + Empty Field Filtering

Phase 2 — Enforcement (parallel, requires Phase 1)
  Spec C: Frontend Filter + Override Signals + Mode Deletions
  Spec D: Priority Lane QA Fixtures (11 lanes)

Phase 3 — New Feature (independent)
  Spec G: Testimonial Carousel

Phase 4 — Quality (parallel, independent)
  Spec E: Language Quality Contracts
  Spec F: Failure Classification
```

---

## SECTION 13 — DEFINITION OF DONE

Launch is complete when all of the following pass:

1. Launch surface frozen in both frontend and backend
2. `limited_access`, `module_preview`, `day_strip` deleted from codebase (not hidden — deleted)
3. All 11 priority lanes pass their behavior contracts
4. `resolutionTrace` written on every generation run
5. value_stack empty fields never reach any prompt, blueprint, or rendered image
6. value_stack carousel auto-adjusts slide count with user notification
7. Testimonial carousel renders platform-accurate mockups (cold + retargeting)
8. Minimal: environment suppressed in generation, universe dropdown still visible
9. Art Direction section labeled correctly, Fantasy and Realistic each have their own card sets
10. Fixes require full evidence pack before closure
11. 7 launch languages visible. 5 non-launch languages hidden entirely.

---

## SECTION 14 — BUILD ORDER

> **For AI agents:** This section is self-contained. Do not read other sections to execute tasks.
> Each task is one file, one action, one done condition. Do not break tasks down further.
> Do not create sub-phases. Do not plan. Execute the task, confirm done, move to the next row.

---

### Dependency Map

```
Phase 1  ──► Phase 2  ──► Phase 8  ──► Phase 9
         ──► Phase 3             └──► Phase 10
         ──► Phase 4
         ──► Phase 5

Phase 6   (no dependency — start any time)
Phase 7   (no dependency — start any time)
Phase 10  requires Phase 8 (billingState for team scoping)
```

Complete all tasks in a phase before starting any phase that depends on it.
Within a phase, do tasks top to bottom — each row unblocks the next.

---

### Task Format

| # | File | Action | Done when |
|---|---|---|---|

Each row is one atomic action. "Done when" is the acceptance test.
If a task would require creating a sub-plan, the task description is wrong — follow it literally.

---

## Phase 1 — Resolver Foundation
**Blocks:** Phases 2, 3, 4, 5. Complete all 17 tasks before starting any of those.

| # | File | Action | Done when |
|---|---|---|---|
| 1.1 | `functions/src/step3point5.ts` | Delete the entire file | File does not exist in the repo |
| 1.2 | `functions/src/creativeResolver.ts` | Remove the `limited_access` entry from `CREATIVE_MODE_CATALOG` | Key `limited_access` absent from the object |
| 1.3 | `functions/src/creativeResolver.ts` | Remove the `module_preview` entry from `CREATIVE_MODE_CATALOG` | Key `module_preview` absent from the object |
| 1.4 | `functions/src/creativeResolver.ts` | Remove the `day_strip` entry from `CREATIVE_MODE_CATALOG` | Key `day_strip` absent from the object |
| 1.5 | `functions/src/creativeResolver.ts` | Remove every entry from `ALLOWED_PAIRS` where `a` or `b` is `limited_access`, `module_preview`, or `day_strip` | No `ALLOWED_PAIRS` entry references those three IDs |
| 1.6 | `functions/src/creativeResolver.ts` | Remove every entry from `SUBSTYLE_MODE_COMPAT` rows for `limited_access`, `module_preview`, `day_strip` | Those three keys absent from `SUBSTYLE_MODE_COMPAT` |
| 1.7 | `functions/src/creativeResolver.ts` | Add field `campaignType: 'cold' \| 'retargeting'` to the `ResolverInput` interface | Field exists on the interface, TypeScript compiles |
| 1.8 | `functions/src/creativeResolver.ts` | Add field `adFormat: 'single' \| 'carousel' \| 'batch'` to the `ResolverInput` interface | Field exists on the interface, TypeScript compiles |
| 1.9 | `functions/src/creativeResolver.ts` | Add field `universeStyle: 'realistic' \| 'fantasy' \| 'minimal'` to the `ResolverInput` interface | Field exists on the interface, TypeScript compiles |
| 1.10 | `functions/src/generators.ts` | In `resolveStyleFamily()`, add a branch: if `inputs.universeStyle === 'minimal'` or `inputs.visualStyleFamily === 'minimal'`, return `'minimal'` and skip all universe/scene injection downstream | When `visualStyleFamily` is `minimal`, no environment string is added to the image prompt |
| 1.11 | `functions/src/creativeResolver.ts` | Write and export function `validateLaunchSurface(inputs): { allowed: boolean, reason?: string }`. Approved combinations are: cold+single (all modes), cold+carousel (all modes), cold+batch (all modes), retargeting+single (all modes), retargeting+carousel (all modes), retargeting+batch (all modes). Block: before_after paired with any other mode, text_only paired with any other mode, any cross-tab pair, limited_access/module_preview/day_strip as inputs. | Function exported; calling it with a blocked combo returns `{ allowed: false, reason: "..." }`; calling with an approved combo returns `{ allowed: true }` |
| 1.12 | `functions/src/creativeResolver.ts` | Write and export function `carouselSlideCountPlan(campaignType: 'cold'\|'retargeting', slideCount: number): { slide: number, role: string, angle: string, hasCTA: boolean }[]`. For cold: slide 1 = hook+CTA, last = close+CTA, middles use angles A→B→C→D→E→F→G in order. For retargeting: slide 1 = objection+CTA, last = close+CTA, middles use angles P→M→R→I→C→Q→E in order. | Function returns correct array for cold-5, cold-9, retargeting-3, retargeting-7. Last slide always hasCTA=true. Middle slides always hasCTA=false. |
| 1.13 | `functions/src/creativeResolver.ts` | Write and export function `resolveValueStackSlideCount(gifts: string[]): number`. Formula: `Math.min(gifts.length + 2, 9)`. | `resolveValueStackSlideCount(['a','b','c'])` returns 5. `resolveValueStackSlideCount(['a','b','c','d','e','f','g','h'])` returns 9. |
| 1.14 | `functions/src/creativeResolver.ts` | Write and export function `filterEmptyValueStackFields(inputs: AdInputs): AdInputs`. Remove any value_stack field whose value is undefined, null, or whitespace-only string. Fields: `valueStackTitle`, `valueStackItems`, `valueStackBonuses`, `valueStackPrice`, `valueStackOriginalValue`, `valueStackSavings`, `valueStackGuarantee`, `valueStackDeliveryFormat`, `valueStackProofStatement`. | Calling the function with `{ valueStackPrice: '', valueStackItems: 'Module 1' }` returns an object with `valueStackPrice` absent and `valueStackItems` present |
| 1.15 | `functions/src/types.ts` | Add and export the `ResolutionTrace` interface with fields: `resolvedCampaignType`, `resolvedAdMode`, `resolvedCreativeModes`, `resolvedStyleFamily`, `resolvedSubStyle`, `referenceAdOverrideActive`, `hookAngle`, `objectionId`, `effectiveObjectionText`, `modeCompatibilityResult`, `slideCountOverride`, `resolvedSlideCount`, `valueStackEmptyFieldsSkipped`, `autoSwitchEvents`, `perSlide`, `launchMatrixCheckPassed`, `launchMatrixBlockReason` | Interface exported, TypeScript compiles with no errors |
| 1.16 | `functions/src/index.ts` | After every successful generation run in `generateCreative`, write a `resolutionTrace` sub-document to `generations/{genId}/resolutionTrace` using `buildResolutionTrace()` | Firestore shows `resolutionTrace` sub-doc after a test generation |
| 1.17 | `functions/src/index.ts` | At the top of every generation handler, call `validateLaunchSurface(inputs)`. If `allowed: false`, throw `HttpsError('invalid-argument', reason)` and do not deduct credits | Sending a blocked combination (e.g. `before_after` + carousel) returns a 400 error with the block reason before any credit deduction |

---

## Phase 2 — Frontend Enforcement
**Requires:** Phase 1 complete.
**Blocks:** Phase 8. Complete all 12 tasks before starting Phase 8.

| # | File | Action | Done when |
|---|---|---|---|
| 2.1 | `src/components/InputForm.tsx` | Remove all JSX that renders mode cards, field sections, or selectors for `limited_access`, `module_preview`, `day_strip` | Those three modes do not appear in the UI under any condition |
| 2.2 | `src/constants.ts` | Remove `limited_access`, `module_preview`, `day_strip` from `OFFER_CREATIVE_MODES`, `CREATIVE_MODE_CONFLICTS`, `HOOK_ANGLE_MODE_CONFLICTS` | Those three keys absent from all three constants |
| 2.3 | `src/constants.ts` | Remove `before_after` from `COLD_HOOK_ANGLES` array | `COLD_HOOK_ANGLES` has 10 entries, none with `id: 'before_after'` |
| 2.4 | `src/components/InputForm.tsx` | Add `before_after` as a selectable card in the Creative Mode grid (same grid as `standard_hero`, `value_stack`, etc.) | User can select `before_after` from the Creative Mode grid |
| 2.5 | `src/components/InputForm.tsx` | Slice the language selector to show only: `ar_fusha`, `ar_egyptian`, `ar_gulf`, `ar_levantine`, `ar_iraqi`, `ar_maghreb`, `en`. Remove `fr`, `es`, `de`, `tr`, `pt`. | Language dropdown shows exactly 7 options |
| 2.6 | `src/components/InputForm.tsx` | On every mode/format/campaign selection change, call `validateLaunchSurface(inputs)`. If `allowed: false`, render an inline `<p>` below the blocked element with the `reason` string. No toast, no modal. | Selecting `before_after` + carousel shows inline text explaining it's single-image only |
| 2.7 | `src/components/InputForm.tsx` | Make the universe dropdown visible for all three style families including Minimal. When Minimal is active, set a local flag `minimalActive: true` in component state — do not hide the dropdown. | Universe dropdown is visible when Minimal is selected |
| 2.8 | `src/components/InputForm.tsx` | Change the label of the art direction / sub-style card section from its current label to "Art Direction". Ensure cards filter by current family — both Realistic and Fantasy show their own card sets. | Section reads "Art Direction", Fantasy family shows its 10 cards |
| 2.9 | `src/components/InputForm.tsx` | Gate the reference ad upload field behind a Pro plan check. If user plan is `starter` or `creator`, do not render the upload field. | Reference ad upload invisible on Starter and Creator plans |
| 2.10 | `src/components/InputForm.tsx` | When `value_stack` is in `offerCreativeMode` and `adMode` is `carousel`, call `resolveValueStackSlideCount(gifts)` and set `slideCount` in state to the returned value. Render inline text: "Carousel adjusted to [N] slides — one gift per slide." | Selecting value_stack + carousel with 4 gift items sets slideCount to 6 and shows the message |
| 2.11 | `src/components/InputForm.tsx` | When testimonial mode is selected and `adMode` is `single`, set `adMode` to `carousel` in state and show a toast: "Testimonials require carousel — switched automatically." | Selecting testimonial mode with single format auto-switches to carousel |
| 2.12 | `src/components/InputForm.tsx` | Add these four inline signals: (a) when retargeting is selected, clear `coldHookAngle` from state and show inline "Hook angle cleared — retargeting uses objection scripts instead"; (b) when `before_after` + carousel is attempted, show inline "Before/After is single-image only"; (c) when style family switches, show inline "Art direction reset for new style"; (d) when Minimal is selected, show inline "Minimal style — environment not rendered" | All four messages appear at the correct trigger moments |

---

## Phase 3 — QA Fixtures
**Requires:** Phase 1 complete. Can run in parallel with Phases 2, 4, 5.

| # | File | Action | Done when |
|---|---|---|---|
| 3.1 | `functions/src/contractFixtures.test.ts` | Add fixture for retargeting + carousel, 5 slides. Input: `campaignType: 'retargeting'`, `adMode: 'carousel'`, `slideCount: 5`, `retargetingObjection: 'price_too_high'`, `offerCreativeMode: ['standard_hero']`. Assert: `resolutionTrace.perSlide[0].hasCTA === true`, `resolutionTrace.perSlide[1].hasCTA === false`, `resolutionTrace.perSlide[2].hasCTA === false`, `resolutionTrace.perSlide[3].hasCTA === false`, `resolutionTrace.perSlide[4].hasCTA === true`. Assert: `perSlide[1].narrativeAngle === 'P'`, `perSlide[2].narrativeAngle === 'M'`, `perSlide[3].narrativeAngle === 'R'`. | Test passes |
| 3.2 | `functions/src/contractFixtures.test.ts` | Add fixture for cold + single + before_after. Input: `campaignType: 'cold'`, `adMode: 'single'`, `offerCreativeMode: ['before_after']`. Assert: `validateLaunchSurface(input).allowed === true`. Assert: `['before_after','standard_hero']` as modes returns `validateLaunchSurface(input).allowed === false`. | Test passes |
| 3.3 | `functions/src/contractFixtures.test.ts` | Add fixture for cold + carousel + value_stack with 4 gifts. Input: `campaignType: 'cold'`, `adMode: 'carousel'`, `offerCreativeMode: ['value_stack']`, `valueStackItems: 'A
B
C
D'`. Assert: `resolveValueStackSlideCount(['A','B','C','D']) === 6`. Assert: `resolutionTrace.slideCountOverride === true`, `resolutionTrace.resolvedSlideCount === 6`. | Test passes |
| 3.4 | `functions/src/contractFixtures.test.ts` | Add fixture for cold + carousel + standard_hero, 5 slides. Assert: `carouselSlideCountPlan('cold', 5)` returns array of 5 items where index 0 and 4 have `hasCTA: true` and indices 1–3 have `hasCTA: false`. Assert angles at indices 1–3 are `'A'`, `'B'`, `'C'` in order. | Test passes |
| 3.5 | `functions/src/contractFixtures.test.ts` | Add fixture for cold + batch + standard_hero + value_stack. Input: `campaignType: 'cold'`, `adMode: 'batch'`, `offerCreativeMode: ['standard_hero','value_stack']`. Assert: `validateLaunchSurface(input).allowed === true`. | Test passes |
| 3.6 | `functions/src/contractFixtures.test.ts` | Add fixture for empty value_stack fields. Input: `{ valueStackPrice: '', valueStackItems: 'Module 1
Module 2', valueStackSavings: '   ' }`. Assert: `filterEmptyValueStackFields(input)` returns object with `valueStackItems` present and `valueStackPrice` and `valueStackSavings` absent. | Test passes |
| 3.7 | `functions/src/contractFixtures.test.ts` | Add fixture for retargeting + single + value_stack. Input: `campaignType: 'retargeting'`, `adMode: 'single'`, `offerCreativeMode: ['value_stack']`, `retargetingObjection: 'price_too_high'`. Assert: `validateLaunchSurface(input).allowed === true`. Assert: same input without `retargetingObjection` — `validateLaunchSurface` still allows it (objection requirement is enforced at generation time, not by the surface validator). | Test passes |
| 3.8 | `functions/src/contractFixtures.test.ts` | Add fixture for minimal + standard_hero + single. Input: `visualStyleFamily: 'minimal'`, `offerCreativeMode: ['standard_hero']`, `adMode: 'single'`. Assert: `validateLaunchSurface(input).allowed === true`. Assert: `resolveStyleFamily(input) === 'minimal'`. | Test passes |
| 3.9 | `functions/src/contractFixtures.test.ts` | Add `validateLaunchSurface` blocked combinations test. Assert all of these return `allowed: false`: (a) `offerCreativeMode: ['before_after','standard_hero']`, (b) `offerCreativeMode: ['text_only','value_stack']`, (c) `offerCreativeMode: ['limited_access']`, (d) `offerCreativeMode: ['module_preview']`, (e) `offerCreativeMode: ['day_strip']`. | Test passes for all 5 blocked cases |
| 3.10 | `functions/src/contractFixtures.test.ts` | Add `carouselSlideCountPlan` test. Assert: cold-2 returns `[{slide:1,hasCTA:true}, {slide:2,hasCTA:true}]`. Assert: retargeting-3 returns `[{slide:1,hasCTA:true,angle:'objection'}, {slide:2,hasCTA:false,angle:'P'}, {slide:3,hasCTA:true}]`. Assert: cold-9 middle slides have angles A,B,C,D,E,F,G in order. | Test passes |
| 3.11 | `functions/src/contractFixtures.test.ts` | Add `resolveValueStackSlideCount` edge case tests. Assert: 1 gift → 3 slides. Assert: 7 gifts → 9 slides. Assert: 10 gifts → 9 slides (cap). | Test passes |
| 3.12 | `functions/src/contractFixtures.test.ts` | Add `filterEmptyValueStackFields` edge case tests. Assert: all fields populated → all returned. Assert: all fields empty/whitespace → empty object returned. Assert: mixed → only non-empty fields returned. | Test passes |
| 3.13 | `functions/src/contractFixtures.test.ts` | Add cross-tab block test. Create input with `offerCreativeMode: ['value_stack', 'event_ticket']`. Assert: `validateLaunchSurface(input).allowed === false` with reason containing "cross-tab". | Test passes |

---

## Phase 4 — Testimonial Carousel
**Requires:** Phase 1 complete. Can run in parallel with Phases 2, 3, 5.

| # | File | Action | Done when |
|---|---|---|---|
| 4.1 | `functions/src/creativeResolver.ts` | Add `testimonial_carousel` entry to `CREATIVE_MODE_CATALOG`. Fields: `id: 'testimonial_carousel'`, `role: 'anchor'`, `standaloneAllowed: true`, `tabs: ['mini_course','live_events','free_guide']`. | Entry exists in catalog, TypeScript compiles |
| 4.2 | `src/components/InputForm.tsx` | Add a multi-file upload field labeled "Testimonial Screenshots" that appears when testimonial carousel mode is selected. Accepts image files. Stores uploaded files in component state as `testimonialScreenshots`. | Upload field visible when testimonial mode active; hidden otherwise |
| 4.3 | `functions/src/testimonialMockup.ts` | Create this new file. Write and export function `detectTestimonialPlatform(screenshotBase64: string): 'whatsapp' \| 'instagram_dm' \| 'facebook' \| 'email' \| 'google_review' \| 'telegram' \| 'unknown'`. Use visual heuristics: green dominant + chat bubbles → whatsapp; IG nav bar visible → instagram_dm; blue header → facebook; email header fields → email; star rating visible → google_review; Telegram-blue UI → telegram; default → unknown. | Function exported; calling it with a WhatsApp screenshot returns `'whatsapp'` |
| 4.4 | `functions/src/testimonialMockup.ts` | Write and export function `buildTestimonialMockup(screenshotBase64: string, platform: string): string` that returns a base64 image of the screenshot wrapped in a platform-accurate UI frame. WhatsApp: green header + chat bubble border. Instagram DM: IG interface chrome. Facebook: blue header. Email: inbox card. Google Review: star row + card. Telegram: Telegram blue chrome. Unknown: clean white quote card. | Function returns a non-empty base64 string for each platform type |
| 4.5 | `functions/src/generators.ts` | Write function `generateTestimonialHookSlide(inputs: AdInputs): Promise<string>` that calls Gemini with a prompt to write a hook headline that creates curiosity to swipe and references testimonials indirectly without quoting them. Returns the hook text. | Function returns a non-empty string; the returned text does not contain any content from the testimonial screenshots |
| 4.6 | `functions/src/creativeResolver.ts` | Write and export function `resolveTestimonialSlideCount(testimonialCount: number): number`. Formula: `Math.min(testimonialCount + 2, 9)`. | `resolveTestimonialSlideCount(3)` returns 5. `resolveTestimonialSlideCount(8)` returns 9. |
| 4.7 | `functions/src/generators.ts` | Write function `generateTestimonialCarousel(inputs: AdInputs, screenshots: string[]): Promise<CarouselResult>`. Calls `generateTestimonialHookSlide` for slide 1, `buildTestimonialMockup` for each middle slide, and generates a CTA close slide for the last slide. Auto-adjusts slide count via `resolveTestimonialSlideCount`. | Function returns a CarouselResult with the correct slide count matching testimonial count + 2 (capped at 9) |
| 4.8 | `functions/src/generators.ts` | In `generateTestimonialCarousel`, add a retargeting branch: when `inputs.campaignType === 'retargeting'`, slide 1 prompt must name the `retargetingObjection` AND tease the testimonials. The hook text must reference the objection. | When campaignType is retargeting, the hook slide text contains a reference to the objection topic |
| 4.9 | `functions/src/contractFixtures.test.ts` | Add fixture for testimonial carousel cold: `testimonialCount: 3`, expected `resolvedSlideCount: 5`. Add fixture for testimonial carousel retargeting: `campaignType: 'retargeting'`, `retargetingObjection: 'price_too_high'`, `testimonialCount: 2`, expected `resolvedSlideCount: 4`, expected `perSlide[0].narrativeAngle: 'objection_hook'`. | Both tests pass |

---

## Phase 5 — Blueprint → Render Prompt Pipeline
**Requires:** Phase 1 complete. Can run in parallel with Phases 2, 3, 4.

| # | File | Action | Done when |
|---|---|---|---|
| 5.1 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.offerCreativeMode` is used to inject the mode spec block into the prompt before the model generates the `TECHNICAL_PROMPT`. If the injection is conditional or missing, make it unconditional. | Calling `generateBuildPlan` with `offerCreativeMode: ['value_stack']` produces a blueprint whose `TECHNICAL_PROMPT` contains stack-zone composition language |
| 5.2 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.visualSubStyle` is used to inject the sub-style constraint block before `TECHNICAL_PROMPT` is written. If missing or conditional, make unconditional. | Calling with `visualSubStyle: 'luxury_magazine'` produces a blueprint whose `TECHNICAL_PROMPT` contains the magazine cover constraints |
| 5.3 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.coldHookAngle` (cold) or `inputs.retargetingObjection` (retargeting) injects the angle visual direction before `TECHNICAL_PROMPT` is written. If missing, add the injection. | Calling with `coldHookAngle: 'pain'` produces a blueprint whose `TECHNICAL_PROMPT` contains pain-angle visual cues |
| 5.4 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.brandColorPrimary` is injected as its exact hex value (e.g. `#FF6B00`) into the prompt before `TECHNICAL_PROMPT`. Never inject as a placeholder string like `[brand primary color]`. | Calling with `brandColorPrimary: '#FF6B00'` produces a blueprint whose `TECHNICAL_PROMPT` contains the string `#FF6B00` |
| 5.5 | `functions/src/buildPlanSlotMap.ts` | In `parseBuildPlanEnvelope()`, extract the `TECHNICAL_PROMPT` section as a named field `technicalPrompt: string` on the returned object. Currently it is found via substring search — replace that with a named property. | `parseBuildPlanEnvelope(blueprintString).technicalPrompt` returns the extracted string |
| 5.6 | `functions/src/buildPlanSlotMap.ts` | In `validateBuildPlanSlots()`, after parsing, assert that `parsedPlan.technicalPrompt` contains the exact `hookText` string passed in. If absent, add a `contractCheck` failure with message `"TECHNICAL_PROMPT missing hookText"`. Do not trigger a rebuild — flag it as a contract failure for logging. | Passing a blueprint where `TECHNICAL_PROMPT` does not contain the hookText results in a contract failure flag, not a crash |
| 5.7 | `functions/src/generators.ts` | Write and export function `buildFinalImagePrompt(technicalPrompt: string, contract: FullLayoutContract, inputs: AdInputs): string`. Assembles the final string sent to the image model in this order: (1) `technicalPrompt`, (2) aspect ratio instruction, (3) sub-style constraint block if `inputs.visualSubStyle` is set, (4) creative mode structural rules from `inputs.offerCreativeMode`, (5) face-consistency instruction if Box A photos are present. Return the assembled string. | Function returns a string containing all five sections when all inputs are provided |
| 5.8 | `functions/src/generators.ts` | Replace every inline image prompt assembly call with a call to `buildFinalImagePrompt()`. There must be no other place in `generators.ts` that builds the final image prompt string. | `buildFinalImagePrompt` is the only function that produces the string passed to the image model |
| 5.9 | `functions/src/index.ts` | After each generation run, write `blueprintText` (the full human-readable blueprint) and `resolvedImagePrompt` (the output of `buildFinalImagePrompt`) to the generation Firestore record. | Firestore generation record has both `blueprintText` and `resolvedImagePrompt` fields after a test run |
| 5.10 | `functions/src/contractFixtures.test.ts` | Add test: call `buildFinalImagePrompt` with a known `technicalPrompt` containing "test headline", `inputs.visualSubStyle: 'luxury_magazine'`, and Box A photos present. Assert the returned string contains "test headline", contains the luxury_magazine constraint keyword, and contains the face-consistency instruction. | Test passes |

---

## Phase 6 — Language Quality Contracts
**No dependency.** Can start at any time.

| # | File | Action | Done when |
|---|---|---|---|
| 6.1 | `functions/src/captionValidator.ts` | Add `ar_fusha` validation: reject if headline word count > 8. Reject if subheadline word count > 12. Reject if subheadline ends with conjunction (و, أو, لـ, عشان, ف). Reject if Arabic Unicode characters < 70% of total characters. | Passing an 8-word Arabic headline passes. Passing a 9-word headline returns a validation failure. |
| 6.2 | `functions/src/captionValidator.ts` | Add `ar_egyptian` validation: same word count rules as 6.1. Add check that at least one Egyptian dialect marker is present in ad copy when dialect is `ar_egyptian` (markers: بتاع, ازيك, عايز, مش, دلوقتي, كده). | Failing copy with no dialect markers returns a warning (not a hard reject) |
| 6.3 | `functions/src/captionValidator.ts` | Add `ar_gulf` validation: same word count rules. Gulf dialect marker check (markers: وش, كيفك, ابغى, زين, يبغى, عندي وياك). Warning, not hard reject, if no markers found. | Same pattern as 6.2 |
| 6.4 | `functions/src/captionValidator.ts` | Add `ar_levantine`, `ar_iraqi`, `ar_maghreb` minimum validation: word count check + reject if any text block is not RTL-aligned (check for LTR characters exceeding 30% of a line). | Passing copy with mostly Arabic passes. Copy with majority Latin characters on a line fails. |
| 6.5 | `functions/src/captionValidator.ts` | Add `en` validation: reject headline > 8 words. Reject subheadline > 8 words. Reject if subheadline ends with a preposition (to, for, with, of, in, on, at, by). | 8-word English headline passes. 9-word fails. Subheadline ending "learn more about" fails. |
| 6.6 | `functions/src/captionValidator.ts` | Add one passing and one failing test case per language directly in a `.test.ts` companion file or inline test block. | All 14 test cases (2 per language × 7 languages) pass |

---

## Phase 7 — Failure Classification
**No dependency.** Can start at any time.

| # | File | Action | Done when |
|---|---|---|---|
| 7.1 | `functions/src/types.ts` | Add and export `type FailureClass = 'prompt_malformed' \| 'model_error' \| 'validation_reject' \| 'slot_repair_failed' \| 'numeric_hallucination' \| 'combination_invalid' \| 'credit_insufficient'` | Type exported, TypeScript compiles |
| 7.2 | `functions/src/index.ts` | Add `failureClass: FailureClass \| null` field to the Firestore generation record write. Set it to `null` on success. | Successful generation record has `failureClass: null` |
| 7.3 | `functions/src/index.ts` | Add `costEstimate: { modelTier: string, retryCount: number, estimatedTokens: number }` field to the Firestore generation record write. | Generation record has the `costEstimate` field |
| 7.4 | `functions/src/generators.ts` | Tag every `throw` and `catch` block in the file with the correct `FailureClass` value. Gemini parse failure → `prompt_malformed`. API timeout/rate limit → `model_error`. Quality gate reject → `validation_reject`. Slot repair fail → `slot_repair_failed`. Number survived erase → `numeric_hallucination`. | Every error path returns a generation record with a non-null `failureClass` |
| 7.5 | `functions/src/index.ts` | On every caught error in the generation handler, write `failureClass` and `costEstimate` to the Firestore record before rethrowing or returning the error. | Failed generation Firestore record has both fields populated |
| 7.6 | `firestore.indexes.json` | Add a composite index on the `generations` collection for field `failureClass` ascending. | `firestore.indexes.json` contains the index definition; deploy succeeds |

---

## Phase 8 — Billing
**Requires:** Phase 2 complete.
**Blocks:** Phase 9.

| # | File | Action | Done when |
|---|---|---|---|
| 8.1 | `functions/src/index.ts` | Write helper function `writeBillingState(uid, data)` that writes a `billingState` map field to `users/{uid}` with shape: `{ plan, isTrial, credits, creditsPerMonth, billingStatus, nextResetDate, stripeCustomerId, canUpgrade, canTopUp, isTeamMember, teamOwnerUid }`. | Function exists and writes the correct shape to Firestore |
| 8.2 | `functions/src/index.ts` | Call `writeBillingState()` at the end of `ghlpaymentwebhook` after plan and credits are updated. | After a simulated GHL payment webhook, `users/{uid}.billingState` reflects the new plan and credits |
| 8.3 | `functions/src/index.ts` | Call `writeBillingState()` at the end of `ghlCancellationWebhook` after plan is set to `none`. | After a simulated cancellation webhook, `users/{uid}.billingState.plan === 'none'` |
| 8.4 | `functions/src/index.ts` | Call `writeBillingState()` at the end of `monthlyCreditsReset` after credits are reset. | After monthly reset runs, `billingState.credits` reflects the reset amount |
| 8.5 | `src/hooks/useBillingState.ts` | Create this new file. Export hook `useBillingState()` that subscribes to `users/{uid}.billingState` via Firestore `onSnapshot`. Returns the `billingState` object. Returns null while loading. | Hook returns real-time billingState; changing plan in Firestore causes hook to re-render with new value within 1 second |
| 8.6 | `src/components/InputForm.tsx` | Replace all `userData.plan` and `userData.credits` reads with reads from `useBillingState()`. | InputForm reads plan and credits from billingState hook, not from raw userData |
| 8.7 | `functions/src/index.ts` | In `deductCreditsServer`, before deducting, call `resolveEntitlement(uid)` and verify the action is allowed for the current plan. If plan was downgraded since last frontend load, throw `HttpsError('permission-denied', 'plan_downgraded')`. | Sending a Pro-only action with a Starter-plan user after downgrade returns `plan_downgraded` error |
| 8.8 | `src/pages/Billing.tsx` | Create this new page with four sections: (1) current plan name + credits progress bar, (2) top-up buttons for 100/300/800 credits that call `createTopupCheckout`, (3) "Manage Subscription" button that calls `createStripePortalSession` and opens the returned URL, (4) "Cancel Subscription" button with a confirmation dialog that calls `cancelSubscription`. | All four sections render. Each button calls the correct Cloud Function. |
| 8.9 | `src/pages/Billing.tsx` | Add a trial section that renders only when `billingState.isTrial === true`. Show credits remaining, a countdown to trial end if `nextResetDate` exists, and an upgrade CTA. | Trial section visible for trial users, hidden for paid users |
| 8.10 | `src/components/Layout.tsx` (or equivalent global layout) | Add a low-credits banner that renders when `billingState.credits < billingState.creditsPerMonth * 0.2`. Banner text: "Credits running low — top up to keep generating." with a link to the Billing page. | Banner appears when credits drop below 20% of monthly allocation. Does not appear otherwise. |
| 8.11 | `functions/src/contractFixtures.test.ts` | Add billing fixture tests: assert `ghlpaymentwebhook` with `pro_monthly` product sets `billingState.plan === 'pro'` and `billingState.credits === 2000`. Assert `ghlCancellationWebhook` sets `billingState.plan === 'none'` and `billingState.billingStatus === 'cancelled'`. | Both assertions pass |

---

## Phase 9 — Team Management
**Requires:** Phase 8 complete.

| # | File | Action | Done when |
|---|---|---|---|
| 9.1 | `src/App.tsx` (or router config file) | Add route `/join` that renders a `JoinTeam` component and accepts `?inviteId=` query param | Navigating to `/join?inviteId=test` renders a page instead of 404 |
| 9.2 | `functions/src/index.ts` | Write and export Cloud Function `getInviteDetails(inviteId: string)` — reads from `team_invites` collection, returns `{ ownerName, inviteeEmail, teamPlan, status, expiresAt }`. Does not require Firebase Auth. Returns `{ status: 'expired' }` if `expiresAt` is in the past. Returns `{ status: 'revoked' }` if invite was revoked. | Calling with a valid inviteId returns the invite fields. Calling with expired inviteId returns `{ status: 'expired' }`. |
| 9.3 | `functions/src/index.ts` | In `createTeamInvite`, set `expiresAt` to `Date.now() + 7 * 24 * 60 * 60 * 1000` (7 days from creation) on every new invite. | New invites in `team_invites` collection have `expiresAt` set to 7 days from now |
| 9.4 | `functions/src/index.ts` | In `claimTeamInvite`, check `expiresAt` before processing. If expired, throw `HttpsError('failed-precondition', 'invite_expired')`. Do not set `isTeamMember`. | Calling `claimTeamInvite` with an expired inviteId returns the invite_expired error |
| 9.5 | `src/pages/JoinTeam.tsx` | Create this file. On mount, call `getInviteDetails(inviteId)`. If `status === 'expired'` or `status === 'revoked'`, render error message (no 404, no crash). If valid, render the invite card showing owner name and invitee email. | Page renders invite details for valid invite. Page renders "This invite is no longer valid" for expired/revoked. Never shows a 404. |
| 9.6 | `src/pages/JoinTeam.tsx` | Add login branch: check if `auth.currentUser` email matches `inviteeEmail` from invite. If user is already logged in with matching email, show "Join [Owner]'s team" button that calls `claimTeamInvite`. On success, redirect to `/`. | Logged-in user with matching email can claim invite and is redirected |
| 9.7 | `src/pages/JoinTeam.tsx` | Add new-account branch: if no current user or email does not match, show a form with fields: full name (pre-filled if available), email (pre-filled from invite, read-only), password, confirm password. On submit: create Firebase Auth account with email+password, then call `claimTeamInvite`, then redirect to `/`. | New user can create an account and claim the invite in one flow. Ends up logged in and redirected. |
| 9.8 | `src/pages/Team.tsx` | Create this file. Render three sections: (1) active members list showing name, email, role, joined date with a "Remove" button per member; (2) pending invites list showing email, sent date, status with "Resend" and "Revoke" buttons; (3) invite form with name and email fields and "Send Invite" button. | Page renders all three sections. Data comes from `getTeamInvites` Cloud Function. |
| 9.9 | `src/pages/Team.tsx` | Wire "Send Invite" button to call `createTeamInvite(name, email)`. On success, add the new invite to the pending list in local state. If plan limit is reached (`teamMemberCount + openInvites >= maxTeamMembers`), replace the form with inline text: "Upgrade to [next plan] to invite more members." | Sending an invite adds it to the pending list without page refresh. Limit message shows when at cap. |
| 9.10 | `src/pages/Team.tsx` | Wire "Resend" button to call `resendTeamInvite(inviteId)`. Wire "Revoke" button to call `revokeTeamInvite(inviteId)` after a browser `confirm()` dialog. Both update the invite status in local state on success. | Resend calls the function. Revoke shows confirm dialog first. Both update the UI without page refresh. |
| 9.11 | `src/pages/Team.tsx` | Wire "Remove" button on active members to call `removeTeamMember(memberUid)` after a `confirm()` dialog. On success, remove the member from the active list in local state. | Remove shows confirm dialog. On confirm, member disappears from list without page refresh. |
| 9.12 | `src/components/Layout.tsx` (or credit bar component) | For team members, show the credit bar labeled "Team credits — [ownerName]'s account" using `billingState.teamOwnerName`. For team owners, show "Team credits — your account". Both read from `useBillingState()`. | Team member sees owner's name in credit bar. Owner sees "your account". |
| 9.13 | `src/components/InputForm.tsx` | Disable all generation-triggering buttons when `billingState.teamRole === 'viewer'`. Add tooltip on disabled state: "Viewers cannot generate — contact your team owner." | Viewer role user sees disabled generate buttons with tooltip |
| 9.14 | `functions/src/index.ts` | In `writeBillingState()` from Phase 8, add team fields: `teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `isTeamMember`, `teamOwnerName`. Read team member count from `users/{uid}/team` subcollection size. Read open invites from `team_invites` where `ownerUid === uid` and `status === 'pending'`. | `billingState` object includes all team fields after a team invite is sent |
| 9.15 | `functions/src/contractFixtures.test.ts` | Add four team fixture tests: (a) `createTeamInvite` is blocked when memberCount + openInvites >= maxTeamMembers; (b) `claimTeamInvite` sets `isTeamMember: true` on the invitee's user doc; (c) `claimTeamInvite` with expired invite returns `invite_expired` error; (d) `removeTeamMember` sets `isTeamMember: false` on the removed member's user doc. | All four tests pass |

---

## Phase 10 — Favorites & Workspace
**Requires:** Phase 8 complete (needs `billingState` for team scoping — which user's favorites to show).

**What already exists:**
- `feedbackService.toggleFavorite(generationId, isFavorite)` — writes `feedback.savedToFavorites` to Firestore. Works.
- `FeedbackButtons.tsx` — renders a bookmark button that calls `toggleFavorite`. The button exists on each step's output cards.
- `PerformanceDashboard.tsx` — has a Favorites tab that loads and displays saved generations. Read-only display, no navigation, no team scope.
- `generations` Firestore collection — stores all outputs with `output.phase` field (`hooks`, `concepts`, `render`, `caption`).

**What is missing:**
- The bookmark button in `FeedbackButtons` starts with `isFavorite: false` always — it does not load the real saved state from Firestore, so the star is always empty on page load even for already-favorited items.
- No favorites panel inside each step — the only favorites view is the Performance Dashboard modal, which is separate from the generation flow.
- No "load this" action — clicking a favorite in the dashboard shows it but does not navigate back to the step with the data restored for editing.
- Favorites are scoped to `userId` only — team members cannot see each other's saved items.
- No way to save an edited/updated version back to favorites from within a step.

| # | File | Action | Done when |
|---|---|---|---|
| 10.1 | `src/services/feedbackService.ts` | Add function `getFavoriteIds(userId: string, workspaceId?: string): Promise<Set<string>>` that queries the `generations` collection for all records where `userId == userId` AND `feedback.savedToFavorites == true` and returns a Set of their document IDs. If `workspaceId` is provided, also include favorites from team members on the same workspace. | Function returns a Set containing the IDs of favorited generation records for the user and their team |
| 10.2 | `src/hooks/useFavorites.ts` | Create this file. Export hook `useFavorites(phase: 'hooks' \| 'concepts' \| 'render' \| 'caption')` that subscribes to the `generations` collection via Firestore `onSnapshot` filtered by: `userId == currentUser.uid`, `feedback.savedToFavorites == true`, `output.phase == phase`. Also includes team members' favorites if `billingState.isTeamMember` or `billingState.isTeamOwner` is true (scope by `workspaceId`). Returns `{ favorites: GenerationRecord[], loading: boolean }`. | Hook returns the correct filtered list in real time. Adding a favorite in one browser tab appears in another tab within 2 seconds. |
| 10.3 | `src/components/FeedbackButtons.tsx` | On component mount, if `generationId` is provided, fetch the real `savedToFavorites` value from Firestore for that generation and set `isFavorite` accordingly. Currently the component always starts with `isFavorite: false`. | Bookmarked items show the filled star icon (amber) immediately on page load without needing to re-click |
| 10.4 | `src/components/FavoritesPanel.tsx` | Create this new component. Props: `phase: 'hooks' \| 'concepts' \| 'render' \| 'caption'`, `onLoad: (record: GenerationRecord) => void`. Uses `useFavorites(phase)` to get the list. Renders a scrollable sidebar panel. Each item shows: step badge (Hook / Concept / Design / Caption), the `hookText` or `captionText` preview, the date saved, and two buttons: "Load" and "Remove from favorites". Empty state: "No saved [hooks/concepts/designs/captions] yet. Click ⭐ on any result to save it." | Component renders correct items per phase. "Remove" calls `toggleFavorite(id, false)` and item disappears from list. |
| 10.5 | Step 2 UI (hooks output component) | Add a "Saved Hooks" toggle button in the Step 2 header area. When clicked, shows the `FavoritesPanel` with `phase="hooks"` as a slide-in panel alongside the hook results. Clicking "Load" on a saved hook populates the hook text fields in Step 2 state with the saved `hookText` and `subheadText`. | User can open the panel, see saved hooks, click Load, and the hook text appears in the editable fields in Step 2 |
| 10.6 | Step 3 UI (concepts/blueprint output component) | Add a "Saved Concepts" toggle in Step 3 header. `FavoritesPanel` with `phase="concepts"`. Clicking "Load" on a saved concept restores the `conceptText` and `buildPlan` into Step 3 state, showing the blueprint as if it was just generated. | User can load a saved concept into Step 3 and see the blueprint rendered |
| 10.7 | Step 4 UI (render output component) | Add a "Saved Designs" toggle in Step 4 header. `FavoritesPanel` with `phase="render"`. Clicking "Load" on a saved design displays the saved `imageUrl` in the Step 4 result area. Also shows a "Edit & Re-generate" button that pre-fills Step 1 inputs from the generation record's `input` fields, then navigates to Step 3 to re-run from the blueprint stage. | User can load a saved design image and see it in Step 4. "Edit & Re-generate" restores context. |
| 10.8 | Step 5 UI (caption output component) | Add a "Saved Captions" toggle in Step 5 header. `FavoritesPanel` with `phase="caption"`. Clicking "Load" restores the `captionText` into the Step 5 editable caption field. | User can load a saved caption into the Step 5 text field and continue editing it |
| 10.9 | `src/services/feedbackService.ts` | Add function `updateFavoriteRecord(generationId: string, updatedFields: Partial<GenerationRecord['output']>): Promise<void>` that writes updated output fields to an existing favorited generation record. Used when the user loads a favorite, edits it, and wants to save the updated version in place. | Calling the function updates the `output.hookText` (or other field) on the specified Firestore document |
| 10.10 | Step 2, 3, 4, 5 UI (each step's save action) | After editing a loaded favorite and generating new output, show a prompt: "Update saved favorite with this new version?" with "Yes, update" and "Keep both" buttons. "Yes, update" calls `updateFavoriteRecord` to overwrite the existing favorite. "Keep both" calls `toggleFavorite` on the new generation to save it as a second favorite alongside the old one. | Both options work correctly. "Yes, update" overwrites. "Keep both" saves a new favorite and leaves the old one. |
| 10.11 | `src/services/feedbackService.ts` | Update `getFavoriteIds` and `useFavorites` to scope team favorites by `workspaceId`. Query: `where('workspaceId', '==', currentWorkspaceId)` instead of `where('userId', '==', uid)` when a workspace is active. This allows team members to see each other's favorited outputs within the same workspace. | A team member's favorited hook appears in another team member's "Saved Hooks" panel within the same workspace |
| 10.12 | Step 2, 3, 4, 5 UI (each step header) | Add a favorites count badge next to the "Saved [X]" toggle button showing how many items are saved for that step's phase. Example: "Saved Hooks (3)". Uses the `favorites.length` from `useFavorites`. | Badge count updates in real time as items are added or removed from favorites |


---

*Source: `creativeResolver.ts` · `generators.ts` · `entitlements.ts` · `artDirectionConfig.ts` · `retargetingObjections.ts` · `constants.ts` · `types.ts` · `index.ts` · terminal session decisions · product owner decisions v3*