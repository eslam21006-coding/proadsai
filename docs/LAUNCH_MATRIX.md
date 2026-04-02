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

### Dependency Map

Read this before touching a single file. Starting a phase before its dependencies are done creates rework.

```
Phase 1: Resolver Foundation          ← must be first, blocks everything
    │
    ├── Phase 2: Frontend Enforcement  ─┐
    ├── Phase 3: QA Fixtures            │  all require Phase 1 complete
    ├── Phase 4: Testimonial Carousel   │  can run in parallel with each other
    └── Phase 5: Render Prompt Pipeline─┘  (Phase 5 was misplaced as Phase 7)
    
Phase 6: Language Quality             ← truly independent, any time
Phase 7: Failure Classification       ← truly independent, any time

Phase 2 completes
    │
    └── Phase 8: Billing               ← requires Phase 2 frontend stable

Phase 8 completes
    │
    └── Phase 9: Team Management       ← requires Phase 8 (billingState hook)
```

**Rule:** If a phase is not listed under a dependency above, it can run in parallel with its siblings. If it IS listed under a dependency, wait for the parent to be complete before starting it.

Tasks within each phase are ordered — earlier tasks unblock later ones within the same phase.

---

### Phase 1: Resolver Foundation
*Everything else depends on this phase. Do not start Phase 2 or 3 until all Phase 1 tasks are complete.*

| Task | Description |
|---|---|
| 1.1 | Delete `functions/src/step3point5.ts` — confirmed dead code, not imported anywhere |
| 1.2 | Delete `limited_access`, `module_preview`, `day_strip` from `CREATIVE_MODE_CATALOG` in `creativeResolver.ts` |
| 1.3 | Delete all `ALLOWED_PAIRS` entries that reference `limited_access`, `module_preview`, or `day_strip` in `creativeResolver.ts` |
| 1.4 | Delete `SUBSTYLE_MODE_COMPAT` entries for `limited_access`, `module_preview`, `day_strip` in `creativeResolver.ts` |
| 1.5 | Add `campaignType: 'cold' | 'retargeting'` as an input field to `ResolverInput` in `creativeResolver.ts` |
| 1.6 | Add `adFormat: 'single' | 'carousel' | 'batch'` as an input field to `ResolverInput` in `creativeResolver.ts` |
| 1.7 | Add `universeStyle: 'realistic' | 'fantasy' | 'minimal'` as an input field to `ResolverInput` in `creativeResolver.ts` |
| 1.8 | Add `minimal` handling to `resolveStyleFamily()` in `generators.ts` — when minimal is active, suppress environment rendering regardless of universe field value |
| 1.9 | Write `validateLaunchSurface(inputs): { allowed: boolean, reason?: string }` in `creativeResolver.ts` — consumes the approved combination tables from Section 2 of this file. This is the shared gate used by both frontend and backend. |
| 1.10 | Write `carouselSlideCountPlan(campaignType, slideCount, mode): SlideRole[]` in `creativeResolver.ts` — returns exact per-slide role and angle for every count 2–9, cold and retargeting, per Section 5.A tables |
| 1.11 | Write `resolveValueStackSlideCount(gifts: string[]): number` in `creativeResolver.ts` — implements the N+2 auto-adjust formula with 9-slide cap |
| 1.12 | Write `filterEmptyValueStackFields(inputs: AdInputs): AdInputs` in `creativeResolver.ts` — strips any empty value_stack fields before they reach any prompt. Empty = whitespace-only or undefined. |
| 1.13 | Write `ResolutionTrace` interface (exact schema from Section 8) in `functions/src/types.ts` or a new `resolutionTrace.ts` file |
| 1.14 | Write `buildResolutionTrace(inputs, resolved): ResolutionTrace` in `creativeResolver.ts` — populates all trace fields from resolved inputs |
| 1.15 | Wire `buildResolutionTrace()` into the generation Cloud Function in `functions/src/index.ts` — write the trace as a sub-document to `generations/{genId}/resolutionTrace` after every generation run |
| 1.16 | Add server-side launch surface guard to `functions/src/index.ts` — call `validateLaunchSurface(inputs)` at the top of every generation handler, reject with 400 if `allowed: false`, log `launchMatrixBlockReason` |
| 1.17 | Centralize the retargeting `effectiveColdHookAngle = undefined` rule from `generators.ts` into `resolveCreativeSpec()` — it should come from the resolver, not be scattered inline |

---

### Phase 2: Frontend Enforcement
*Requires Phase 1 complete. Tasks 2.1–2.5 can run in parallel. Tasks 2.6–2.10 depend on 2.1–2.5.*

| Task | Description |
|---|---|
| 2.1 | Remove `limited_access`, `module_preview`, `day_strip` from all UI components in `src/components/InputForm.tsx` — mode cards, mode selectors, mode field sections |
| 2.2 | Remove `limited_access`, `module_preview`, `day_strip` from `OFFER_CREATIVE_MODES`, `CREATIVE_MODE_CONFLICTS`, `HOOK_ANGLE_MODE_CONFLICTS` in `src/constants.ts` |
| 2.3 | Move `before_after` from the hook angle selector to the Creative Mode card grid in `InputForm.tsx` — it is now a Creative Mode, not a hook angle |
| 2.4 | Remove `before_after` from `COLD_HOOK_ANGLES` in `src/constants.ts` |
| 2.5 | Slice `AD_LANGUAGES` to 7 launch languages — remove `fr`, `es`, `de`, `tr`, `pt` from the selector in `InputForm.tsx` |
| 2.6 | Consume `validateLaunchSurface()` from Phase 1 in `InputForm.tsx` — on any mode/format/campaign combination change, call the validator and show an inline message below the blocked element if `allowed: false` |
| 2.7 | Update Visual Style Family selector: all 3 families (Realistic, Fantasy, Minimal) always show the universe dropdown. When Minimal is active, add a silent flag `minimalActive: true` to state — do not hide the dropdown |
| 2.8 | Rename the art direction / sub-style card section label to **"Art Direction"** in `InputForm.tsx`. Ensure Fantasy family has its own art direction cards (same as Realistic — both filter from `ART_DIRECTION_CARDS` by family). |
| 2.9 | Update the reference ad upload field: gate it behind Pro plan check. Hide for Starter and Creator plans. |
| 2.10 | Add `slideCount` auto-override logic: when `value_stack` is in `offerCreativeMode` and `adMode` is `carousel`, call `resolveValueStackSlideCount()` and update `slideCount` in state. Show inline message: "Carousel adjusted to [N] slides — one gift per slide." |
| 2.11 | Add `slideCount` auto-override for testimonial mode: same pattern as 2.10. Show inline message: "Carousel adjusted to [N] slides — one testimonial per slide." |
| 2.12 | Add toast/inline signals for all remaining auto-switches listed in Section 7: retargeting clears hook angle, text_only collapses visual section, before_after + carousel blocked, testimonial format auto-switch, family switch clears art direction |

---

### Phase 3: QA Fixtures
*Requires Phase 1 complete. Can run in parallel with Phase 2.*

| Task | Description |
|---|---|
| 3.1 | Create canonical input fixture for Lane 1 (Retargeting + Carousel, 5 slides) in `contractFixtures.test.ts` — exact input JSON, expected `resolutionTrace`, CTA placement check per slide |
| 3.2 | Create canonical input fixture for Lane 2 (Cold + Single + before_after) — input JSON, split-canvas visual contract checks |
| 3.3 | Create canonical input fixture for Lane 3 (Cold + Carousel + value_stack, 4 gifts) — input JSON, slide count override check, empty field check |
| 3.4 | Create canonical input fixture for Lane 4 (Cold + Carousel, 5 slides, standard_hero) — input JSON, per-slide angle assignment check |
| 3.5 | Create canonical input fixture for Lane 5 (Cold + Batch + hero + value_stack) — input JSON, full stack in every image check |
| 3.6 | Create canonical input fixture for Lane 6 (Cold + Single + value_stack) — input JSON, empty field suppression check |
| 3.7 | Create canonical input fixture for Lane 7 (Retargeting + Single + value_stack) — input JSON, objection-connected copy check |
| 3.8 | Create canonical input fixture for Lane 8 (Minimal + hero + Single) — input JSON, no-environment check |
| 3.9 | Create canonical input fixture for Lane 9 (Minimal + hero + Batch) — input JSON, per-image minimal check |
| 3.10 | Add `validateLaunchSurface()` unit tests — one passing combination per lane, one blocked combination per removed mode (`limited_access`, `module_preview`, `day_strip`), one cross-tab combination, one `before_after` + carousel attempt |
| 3.11 | Add `carouselSlideCountPlan()` unit tests — cold 2/5/9 slides, retargeting 3/5/7 slides, verify exact angle arrays |
| 3.12 | Add `resolveValueStackSlideCount()` unit tests — 3 gifts→5 slides, 7 gifts→9 slides, 9 gifts→9 slides (cap) |
| 3.13 | Add `filterEmptyValueStackFields()` unit tests — some fields populated, some empty, confirm empty fields removed from output |

---

### Phase 4: Testimonial Carousel
*Independent. Can start after Phase 1 completes. Does not block Phase 2 or 3.*

| Task | Description |
|---|---|
| 4.1 | Add `testimonial_carousel` to `CREATIVE_MODE_CATALOG` in `creativeResolver.ts` — role: anchor, standalone: true, tabs: all three, compatible with carousel only |
| 4.2 | Add testimonial screenshot upload field (Box D) to `InputForm.tsx` — multi-upload, visible when testimonial mode selected |
| 4.3 | Write `detectTestimonialPlatform(screenshotBase64): Platform` in a new `testimonialMockup.ts` file — heuristic detection returning one of: `whatsapp`, `instagram_dm`, `facebook`, `email`, `google_review`, `telegram`, `unknown` |
| 4.4 | Write per-platform mockup generator — wraps the screenshot in a platform-accurate UI frame (WhatsApp bubble, IG interface, etc.) using Sharp or CSS overlay |
| 4.5 | Write hook slide generator for testimonial carousel — AI prompt to generate a curiosity hook for slide 1 that teases testimonials without quoting them |
| 4.6 | Wire `resolveValueStackSlideCount()` equivalent for testimonials: testimonial count + 2, cap at 9 |
| 4.7 | Wire the full testimonial carousel pipeline into `generators.ts` — hook slide (AI), N mockup slides (per-platform renderer), close slide (AI) |
| 4.8 | Add retargeting variant of testimonial hook slide — slide 1 must name the objection AND tease testimonials as evidence |
| 4.9 | Create canonical input fixtures for Lane 10 (Cold testimonial carousel) and Lane 11 (Retargeting testimonial carousel) in `contractFixtures.test.ts` |

---

### Phase 5: Blueprint → Long-Form Render Prompt Pipeline
*Requires Phase 1 complete. Can run in parallel with Phases 2, 3, and 4. The pipeline that turns the user-visible blueprint (Step 3) into the machine-executable image generation prompt. Currently lives inline in `generators.ts`. This phase makes it explicit, auditable, and correctly fed from all inputs — Steps 1 and 2.*

**How the pipeline works today:**
Step 2 produces `hookText` + `subheadText` + `ctaName`. Step 3 takes those exact strings and generates a Visual Blueprint (the human-readable rendering plan shown to the user). Inside that blueprint is a `TECHNICAL_PROMPT` field — a long-form machine-readable prompt in English that the image model receives. This `TECHNICAL_PROMPT` is generated by the same Gemini call that produces the blueprint.

**What must feed the long-form prompt (complete input set):**

The `TECHNICAL_PROMPT` must be informed by ALL of the following — not just the Step 2 copy text:

| Input Source | Fields | Why |
|---|---|---|
| Step 1 — Campaign context | `productName`, `targetAudience`, `challenges`, `transformation`, `offerType` | Grounds the visual in the right product context and persona — wardrobe, environment energy, and prop choices must match the offer |
| Step 1 — Creative mode | `offerCreativeMode` (e.g. `value_stack`, `event_ticket`, `before_after`) | Determines the compositional structure — stack zone, ticket frame, split canvas, etc. |
| Step 1 — Art direction | `visualSubStyle` (e.g. `luxury_magazine`, `anime_manga`, `dark_cinematic`) | Drives the entire visual language — color palette, texture, lighting, typography style, forbidden elements |
| Step 1 — Universe family | `visualStyleFamily` (realistic / fantasy / minimal) | Controls whether an environment is rendered at all, and what kind |
| Step 1 — Universe setting | `preferredUniverse` | Sets the specific scene, location, or world the hero inhabits |
| Step 1 — Campaign type | `campaignType` (cold / retargeting) | Determines copy tone direction — cold uses transformation energy, retargeting uses objection-resolution energy |
| Step 1 — Hook angle | `coldHookAngle` (cold only) | Drives the emotional framing of the visual — before/after split, pain imagery, social proof visual cues, etc. |
| Step 1 — Retargeting objection | `retargetingObjection` (retargeting only) | The visual must reflect the specific objection being resolved — proof-angle visuals differ from risk-reversal visuals |
| Step 1 — Ad tone | `adTone` | Visual energy must match tone — luxury_ceo tone requires premium wardrobe; funny tone allows casual/absurd props |
| Step 1 — Brand colors | `brandColorPrimary`, `brandColorSecondary` | Injected as specific hex values into CTA button, accent elements, or background — never generic "brand color" placeholder |
| Step 2 — Copy text | `hookText`, `subheadText`, `ctaName`, `benefitText` | Must appear verbatim in the prompt and in the rendered output — no paraphrase, no substitution |
| Step 2 — Mode-specific data | `valueStackItems`, `eventTitle`, `eventDate`, `valueStackPrice`, etc. | Drives visible data in the image — stack items, ticket fields, device content |
| Uploads | Box A (personal photos), Box B (logos), Box C (mode assets), Reference Ad | Face consistency, logo placement, book/device cover, or full style reference |

| Task | Description |
|---|---|
| 5.1 | Audit `generators.ts` → `generateBuildPlan()` to confirm ALL Step 1 fields above are present in the build plan prompt before the model writes the `TECHNICAL_PROMPT`. Check: `offerCreativeMode` injects the mode spec block, `visualSubStyle` injects the sub-style constraint block, `coldHookAngle` / `retargetingObjection` injects the angle visual direction, `adTone` injects the tone mood block, brand colors inject as hex values. Fix any that are missing or conditional. |
| 5.2 | Audit that `hookText`, `subheadText`, and `ctaName` from Step 2 are injected under `TEXTS TO RENDER` and declared in `CANONICAL CONTENT OWNERSHIP` before the model writes the `TECHNICAL_PROMPT`. If either injection is missing or conditional, fix it unconditionally. |
| 5.3 | Add a hard validation after build plan generation: parse the returned `TECHNICAL_PROMPT` and verify that it contains the exact `hookText` string. If absent or paraphrased, mark build plan failed and trigger a rebuild. Add this check to `validateBuildPlanSlots()` in `buildPlanSlotMap.ts`. |
| 5.4 | Add `TECHNICAL_PROMPT` extraction to `parseBuildPlanEnvelope()` in `buildPlanSlotMap.ts` — named field on the parsed result, not a substring search. Expose as `technicalPrompt: string` on `BuildPlanSlotMap`. |
| 5.5 | Write `buildFinalImagePrompt(blueprint: string, technicalPrompt: string, contract: FullLayoutContract, inputs: AdInputs): string` in `generators.ts` — the single function that assembles the final prompt sent to the image model. It combines in this exact order: (1) the `TECHNICAL_PROMPT` from the blueprint, (2) layout contract zone rules and aspect ratio, (3) sub-style visual constraints, (4) creative mode structural rules (e.g. split-canvas for before_after, stack zone for value_stack), (5) campaign type and hook angle visual direction, (6) brand color hex directives, (7) face-consistency instruction referencing Box A. Nothing added inline elsewhere after this function is introduced. |
| 5.6 | Add `resolvedImagePrompt: string` to the `ResolutionTrace` schema (Section 8) — store the final assembled prompt per run. This makes every render fully auditable. |
| 5.7 | Surface the blueprint to the user in Step 3 UI exactly as generated — no rewriting. The user sees the human-readable blueprint. The `TECHNICAL_PROMPT` portion is stripped from the user-facing display (stays in trace only). Add a "View Blueprint" expandable panel in Step 3. |
| 5.8 | Add `blueprintText` field to the generation Firestore record — store the full blueprint string alongside `resolvedImagePrompt`. Enables debugging: compare what the blueprint said vs what the image model produced. |
| 5.9 | For carousel mode: verify `buildFinalImagePrompt()` is called per-slide with the correct per-slide `hookText`/`subheadText` (not slide 1 text reused). Add per-slide `blueprintText` and `resolvedImagePrompt` to the `perSlide` array in `ResolutionTrace`. |
| 5.10 | Add unit tests in `contractFixtures.test.ts`: (a) given a known `hookText` + blueprint, assert `buildFinalImagePrompt()` contains exact `hookText`; (b) given `visualSubStyle: "luxury_magazine"`, assert the output contains the luxury magazine constraint block; (c) given `campaignType: "retargeting"` + objection, assert the output contains the retargeting visual direction. These are the regression guards. |

---

### Phase 6: Language Quality Contracts
*Independent. Can start any time. Does not block any other phase.*

| Task | Description |
|---|---|
| 6.1 | Add `ar_fusha` quality checks to `captionValidator.ts` — headline max 8 words, subheadline max 12 words, no hanging conjunctions, Arabic Unicode >= 70%, weak opener detection |
| 6.2 | Add `ar_egyptian` quality checks — dialect marker validation, warmth register, same word count rules |
| 6.3 | Add `ar_gulf` quality checks — dialect markers, same word count rules |
| 6.4 | Add `ar_levantine`, `ar_iraqi`, `ar_maghreb` minimum checks — word count + RTL + no LTR bleed |
| 6.5 | Add `en` quality checks — grammar baseline, CTA clarity, no filler phrases |
| 6.6 | Add unit tests per language — one passing caption, one failing (word count), one failing (hanging conjunction for Arabic) |

---

### Phase 7: Failure Classification
*Independent. Can start any time. Does not block any other phase.*

| Task | Description |
|---|---|
| 7.1 | Add `FailureClass` type to `functions/src/types.ts` — 7 values from Spec F |
| 7.2 | Add `failureClass: FailureClass \| null` field to generation Firestore record schema |
| 7.3 | Add `costEstimate: { modelTier, retryCount, estimatedTokens }` field to generation Firestore record schema |
| 7.4 | Tag each existing error path in `generators.ts` with the correct `FailureClass` — map every `throw` and `catch` to one of the 7 values |
| 7.5 | Write `failureClass` and `costEstimate` to Firestore on every failed generation in `functions/src/index.ts` |
| 7.6 | Add a Firestore query index on `failureClass` to enable cost-per-failure-type analysis |

---

### Phase 8: Billing, Plan Access, Top-Up, Downgrade, and Cancellation
*Requires Phase 2 complete (frontend must be stable before building the Billing page on top of it). The existing billing infrastructure (GHL webhooks + Stripe) is partially built. This phase fills the gaps: plan-gating enforcement at the point of use, the user-facing billing management surface, and the full lifecycle from trial to paid to cancelled.*

**What already exists:** `ghlpaymentwebhook`, `ghlCancellationWebhook`, `createStripePortalSession`, `createTopupCheckout`, `stripeWebhook`, `cancelSubscription`, `monthlyCreditsReset`, `deductCreditsServer`, `refundCreditsServer` are all in `functions/src/index.ts`. Plan features are defined in `entitlements.ts`. Credit costs are in `COSTS` map.

**What is missing:** A user-facing billing page, plan-downgrade enforcement at credit-deduction time, trial expiry handling, and a unified billing state the frontend can read reliably.

| Task | Description |
|---|---|
| 8.1 | Create a `billingState` derived field on the user Firestore document — computed and written by Cloud Functions whenever plan/credits change. Shape: `{ plan, isTrial, credits, creditsPerMonth, billingStatus, nextResetDate, stripeCustomerId, canUpgrade, canTopUp, isTeamMember, teamOwnerUid }`. Frontend reads this one field, not scattered user doc fields. |
| 8.2 | Wire `billingState` write into all plan-change paths: `ghlpaymentwebhook` (plan upgrade/new), `ghlCancellationWebhook` (cancel), `monthlyCreditsReset` (credit reset), `createTopupCheckout` completion (top-up). Every path that touches credits or plan must also write `billingState`. |
| 8.3 | Add a `useBillingState()` hook in `src/hooks/useBillingState.ts` — subscribes to `users/{uid}.billingState` via Firestore real-time listener. Replaces scattered `userData` reads in the frontend. Every plan gate check (`canUse()`) must read from this hook, not from stale cached state. |
| 8.4 | Implement plan-gate enforcement at credit-deduction time in `deductCreditsServer`: before deducting, call `resolveEntitlement()` and verify the action is allowed for the user's current plan. If the plan was downgraded since the frontend last loaded, the server rejects with a clear error (`plan_downgraded`) rather than silently deducting. |
| 8.5 | Build the Billing page in the frontend (`src/pages/Billing.tsx` or equivalent) with the following sections: current plan + credits bar, upgrade CTA (links to GHL checkout), top-up options (100 / 300 / 800 credits via `createTopupCheckout`), manage subscription button (opens Stripe portal via `createStripePortalSession`), cancel subscription button (calls `cancelSubscription` with confirmation dialog), and trial countdown if `isTrial: true`. |
| 8.6 | Implement trial expiry handling: when `isTrial: true` and credits reach 0, show a persistent banner across the app ("Your trial has ended — upgrade to keep generating"). Block generation actions server-side when `plan === 'none'` or credits < action cost. |
| 8.7 | Implement downgrade enforcement: when a user's plan drops (e.g. Scaling → Pro), features they no longer have access to must be hidden on next page load. The `useBillingState()` hook triggers a UI re-evaluation on plan change. Do not wait for page refresh. |
| 8.8 | Implement top-up flow end-to-end: user clicks top-up option → `createTopupCheckout` creates Stripe checkout session → user pays → `stripeWebhook` fires → credits added to `users/{uid}.credits` → `billingState` updated → frontend credit bar updates in real time via listener. Add a success toast: "100 credits added to your account." |
| 8.9 | Implement cancellation flow: user clicks cancel → confirmation dialog ("Your access continues until [period end date]") → `cancelSubscription` called → Firestore updated with `billingStatus: 'cancelled', cancelAt: <date>` → `billingState` updated → UI shows "Cancelled — access until [date]" in billing page header. |
| 8.10 | Add credits low warning: when credits drop below 20% of plan monthly allocation, show a persistent low-credits banner with a top-up CTA. Threshold: `credits < creditsPerMonth * 0.2`. |
| 8.11 | Write a `billingState` unit test fixture: assert that `ghlpaymentwebhook` with a `pro_monthly` product ID correctly sets `plan: 'pro'`, `credits: 2000`, `billingStatus: 'active'`, and writes `billingState`. Assert that `ghlCancellationWebhook` sets `plan: 'none'`, `credits: 0`, `billingStatus: 'cancelled'`. |

---

### Phase 9: Team Management
*The invite/accept/remove flow exists as Cloud Functions. This phase builds the user-facing team management UI, fixes the critical 404 bug on invite acceptance, and adds the full account setup flow for new invitees.*

**What already exists:** `createTeamInvite`, `resendTeamInvite`, `revokeTeamInvite`, `claimTeamInvite`, `getTeamInvites`, `createTeamMember`, `removeTeamMember` in `functions/src/index.ts`. Team credit pooling via `resolveEntitlement()`. Team invite storage in `team_invites` collection. GHL webhook for invite delivery.

**Critical bug:** When an invitee clicks the invite link, they land on a 404 page. The `/join` route does not exist in the frontend router. New users also have no way to create an account or set a password before claiming the invite. This must be fixed before team invites can work at all.

**Plan limits:** Starter: 1 member (owner only). Creator: 1 member. Pro: 3 members. Scaling: 10 members.

| Task | Description |
|---|---|
| 9.1 | **[CRITICAL — fixes 404]** Add `/join` route to the frontend router (`src/App.tsx` or equivalent routing config). The route must accept `?inviteId=<id>` as a query parameter. This single task unblocks the entire invite acceptance flow. Without it, every invite link is a dead end. |
| 9.2 | **[CRITICAL — fixes 404]** Build the `/join` page component (`src/pages/JoinTeam.tsx`). On load, call `getTeamInvites` or a new `getInviteDetails(inviteId)` Cloud Function to fetch the invite record. Show: team owner's name, the invitee's email, and the invite status. If invite is expired or revoked, show a clear error ("This invite is no longer valid") — not a 404. |
| 9.3 | **[CRITICAL — new user account setup]** On the `/join` page, detect whether the invitee already has a Firebase Auth account for their email. If they do: show a login form pre-filled with their email → after login, auto-call `claimTeamInvite(inviteId)` → redirect to the main app. If they do NOT have an account: show an account creation form (full name field + password field + confirm password field, email pre-filled and locked from the invite record) → create Firebase Auth account with email + password → then auto-call `claimTeamInvite(inviteId)` → redirect to the main app. |
| 9.4 | Add `getInviteDetails(inviteId): { ownerName, inviteeEmail, teamPlan, status, expiresAt }` Cloud Function in `functions/src/index.ts` — reads from `team_invites` collection, returns only the fields needed for the `/join` page. Does not require authentication to call (the invite link is the auth token). Returns `{ status: 'expired' }` or `{ status: 'revoked' }` for invalid invites so the frontend can show the right message instead of crashing. |
| 9.5 | Add invite expiry: set `expiresAt` to 7 days from creation when `createTeamInvite` fires. In `getInviteDetails` and `claimTeamInvite`, check `expiresAt`. If expired, return `status: 'expired'` — do not allow claim. Add "Resend" to reset the expiry clock. |
| 9.6 | Build the Team page in the frontend (`src/pages/Team.tsx`) — accessible from account/settings. Shows: current team members list (name, email, role, joined date), pending invites list (email, sent date, status, resend/revoke actions), invite new member form, and member count vs plan limit (`2 / 3 members on Pro`). |
| 9.7 | Implement invite flow in the frontend: owner enters invitee email + name → calls `createTeamInvite` → shows pending invite in the list with status "Sent". If plan limit reached, show inline error: "Your Pro plan allows 3 members. Upgrade to Scaling for up to 10." |
| 9.8 | Implement resend and revoke in the pending invites list: resend calls `resendTeamInvite` (resets expiry, resends GHL email), revoke calls `revokeTeamInvite` with confirmation ("This invite link will stop working."). Both update status in real time via Firestore listener. |
| 9.9 | Implement member removal: owner clicks remove → confirmation dialog ("Remove [Name]? They will lose access immediately.") → calls `removeTeamMember` → member's `isTeamMember` flag cleared → member's next action shows "You've been removed from this team. Contact your team owner." → member's account reverts to `plan: 'none'` (no independent plan) or their own plan if they had one. |
| 9.10 | Implement member credit visibility: team members see a credit bar showing the owner's credit pool, labeled "Team credits — [Owner Name]'s account". Owner sees "Team credits — your account". Updates in real time via `useBillingState()` from Phase 8. |
| 9.11 | Implement role-based action gating: `viewer` role cannot trigger credit-consuming actions. Generation buttons show tooltip "Viewers cannot generate — ask your team owner." Server-side `deductCreditsServer` already rejects viewer (existing code). |
| 9.12 | Implement plan-limit enforcement in the invite UI: check `maxTeamMembers` against active member + open invite count before showing the invite form. At limit: replace form with "Upgrade to [next plan] to invite more members." |
| 9.13 | Implement workspace separation for Scaling plan (`multiBrandWorkspaces: true`): workspace switcher in nav, each workspace has own generation history. Non-Scaling: no switcher, all members share one workspace. |
| 9.14 | Add team state to `billingState` (Phase 8 task 8.1): include `teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `isTeamMember`, `teamOwnerName` so the frontend reads team context from the same real-time listener. |
| 9.15 | Write fixture tests: assert `createTeamInvite` blocked at plan limit. Assert `claimTeamInvite` sets `isTeamMember: true` and `teamOwnerUid`. Assert `claimTeamInvite` fails on expired invite. Assert `removeTeamMember` clears `isTeamMember`. Assert viewer role rejected by `deductCreditsServer`. Assert `getInviteDetails` returns correct status for expired/revoked invites without throwing. |

---

*Source: `creativeResolver.ts` · `generators.ts` · `entitlements.ts` · `artDirectionConfig.ts` · `retargetingObjections.ts` · `constants.ts` · `types.ts` · `index.ts` · terminal session decisions · product owner decisions v3*
