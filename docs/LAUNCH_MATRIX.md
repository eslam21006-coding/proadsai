# Pro Ads AI — Launch Matrix
## Single Source of Truth for Launch Scope, Approved Combinations, and Behavior Contracts

> **Authority**: This file overrides all older behavior assumptions, the Compatibility Matrix v2, and the ChatGPT master plan for launch scope.
> Where this file and any other document disagree, this file wins.
> Last updated: v4 — 11 product owner decisions + 7 new feature phases + Stripe migration. Codebase audit April 11, 2026.

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
| Billing provider | **Stripe** for payment processing (Checkout Sessions, Customer Portal, subscriptions). GHL stays as CRM — receives post-payment webhooks from Firebase for automations (welcome email, dunning, tags). Flow: Stripe Checkout → Stripe webhook → Firebase → update user + notify GHL. |
| Magic Edit engine | **fal.ai FLUX Kontext** for inpainting/outpainting. Lasso selection → mask → Kontext pipeline. Text compositing re-runs after every edit. Quality restoration pass after 3+ edits. |
| Magic Edit scope | Single, batch (apply-to-all), carousel (per-slide). Undo stack of 10. Modes: erase, add object, style/color change, environment replacement. Text edits handled by textCompositing only — never sent to Kontext. |
| Workspace Meta linking | Each workspace has its own `metaAdAccountId`. Generations from that workspace push to that account. Team members see only workspaces they have access to. |
| Saved project navigation | Step-by-step dot navigator. User can click any completed step to resume from there. Thumbnail from first render persisted. Status: draft / rendered / published. |
| RAG feedback loop | `metaDailySync` pulls Meta Insights API daily. Performance data (CTR/CPC/ROAS) feeds back into generation prompts via `getRAGContext()`. Minimum 10 records before RAG injection activates. |
| Brand color enforcement | Brand colors injected per-slide in carousel, per-item in batch, inherited from cold ad in retargeting. Text compositing uses brand primary for CTA, brand secondary for headlines. |
| Resize / reflow | Reflow available for single, batch (all N), carousel (all slides). Text compositing re-runs after reflow with safe-zone re-validation. CSS preview costs 0 credits. |
| Plan structure | **3 plans only**: Starter ($29/mo), Pro ($79/mo), Scale ($197/mo). The Creator plan has been removed. All references to "Creator" or 4-plan structure are obsolete. Annual billing saves 2 months. |
| Feature gating philosophy | All creative engine features (hook angles, hook types, ad tones, copywriting strategies, creative modes) are **fully ungated on ALL plans** including Starter. Gating applies only to: production features (batch, carousel, retargeting, Meta push, creative memory), visual premium features (fantasy universes, art direction, reference ad, auto-optimized creatives), and intelligence features (predictive CTR, variant exploration, smart recommendations, multi-brand workspaces). |
| Carousel slide limits | Pro: up to 7 slides. Scale: up to 10 slides. (Previously Pro: 2–5, Scaling: 2–9.) |
| Batch generation | **Pro gets batch** (limited: up to 4 ads/run = 1 size × 2 hooks × 2 concepts). **Scale gets full batch** (up to 36 ads/run = 3 sizes × 4 hooks × 3 concepts). Batch is no longer Scale-only. |
| Saved project limits | Starter: 10. Pro: 30. Scale: Unlimited. |
| Audience Avatars | Reusable brand profiles that pre-fill the form. Starter: 5. Pro: 15. Scale: Unlimited. |
| Authentication method | **Email + password only**. Google sign-in removed entirely to prevent email mismatch with Stripe. Login page has Login / Create Account tabs on the same page. New account creation checks Firestore for existing Stripe payment — if found, user enters app with trial active. If not found, billing modal opens. |

---

## SECTION 1 — WHAT EXISTS (DO NOT REBUILD)

| Area | Key File(s) | Status |
|---|---|---|
| Creative resolver | `functions/src/creativeResolver.ts` (1292 lines) | Exists |
| 6-stage generation pipeline | `functions/src/generators.ts` (6926 lines) | Exists |
| Layout contract system | `functions/src/layoutContract.ts`, `layoutTemplates.ts` | Exists |
| Build plan validation | `functions/src/buildPlanSlotMap.ts` | Exists |
| Caption validation | `functions/src/captionValidator.ts` | Exists |
| Creative scoring engine | `functions/src/creativeScoringEngine.ts` | Exists |
| Entitlements | `functions/src/entitlements.ts`, `src/planconfig.ts` | Exists |
| Mode field schema | `src/modeFieldSchema.ts` | Exists |
| Creative memory + RAG | `functions/src/creativeMemory.ts`, `rankingEngine.ts`, `recommendationTracking.ts` | Exists — no daily sync or prompt injection yet |
| Zustand store | `src/store.ts` | Exists |
| Generation run records | `generations` Firestore collection | Exists |
| Magic Edit (FAL Kontext) | `functions/src/falEditing.ts` (161 lines) | Exists — erase/style only, no batch/carousel/add/environment |
| Magic Selector UI | `src/components/MagicSelector.tsx` (334 lines) | Exists — lasso + erase + style, no add/environment/undo/batch |
| FAL image generation | `functions/src/falGeneration.ts` (128 lines) | Exists |
| Text compositing | `functions/src/textCompositing.ts` (631 lines) | Exists |
| Workspace switcher | `src/components/WorkspaceSwitcher.tsx` (91 lines) | Exists — no Meta account linking, no team scoping |
| Workspace settings | `src/components/WorkspaceSettingsModal.tsx` (170 lines) | Exists — no Meta account field |
| Meta service (OAuth) | `src/services/metaService.ts` | Exists — OAuth + account picker, no insights fetch |
| Variant engine | `functions/src/variantEngine.ts` | Exists |
| Pattern summaries | `functions/src/patternSummaries.ts` (542 lines) | Exists |
| Billing state | `functions/src/billing/billingState.ts` (162 lines) | Exists — currently GHL+Stripe, being updated for direct Stripe webhooks |
| Billing UI | `src/pages/Billing.tsx` (206 lines) + 6 billing components | Exists — references Stripe, needs update for direct Stripe webhook flow |
| Billing hook | `src/hooks/useBillingState.ts` (98 lines) | Exists |
| Team management | `src/pages/Team.tsx` (683L), `JoinTeam.tsx` (248L), `teamService.ts` (79L) | Exists |
| Favorites | `src/components/FavoritesPanel.tsx` (179L), `src/hooks/useFavorites.ts` (106L), `feedbackService.ts` (638L) | Exists |
| Saved projects | `SavedProject` interface in `types.ts`, save/load in `App.tsx` | Exists — no thumbnails, no step navigation, no search |
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
| `cold` | `carousel` | Pro+ | YES | Up to 7 slides (Pro), up to 10 slides (Scale) |
| `cold` | `batch` | Pro+ | YES | Pro: up to 4 ads/run. Scale: up to 36 ads/run. |
| `retargeting` | `single` | Pro+ | YES | |
| `retargeting` | `carousel` | Pro+ | YES | Sequential objection answering |
| `retargeting` | `batch` | Pro+ | YES | Pro: limited batch. Scale: full batch. |

### 2.5 Universe Families and Art Direction

| Family | Art Direction Cards | Universe Dropdown | Minimal behavior |
|---|---|---|---|
| `realistic` | Yes — 10 cards (Pro+ to unlock) | Yes — location list | — |
| `fantasy` | Yes — 10 cards (Pro+ to unlock) | Yes — world list | — |
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
| Campaign Type | Toggle | Cold / Retargeting (Pro+) | YES |
| Ad Language | Dropdown | 7 launch languages only | YES |

### 6.2 Cold Only

| Field | Options | Plan Limits |
|---|---|---|
| Hook Angle | 11 angles (before_after is a Creative Mode now, not listed here) | All plans: all 11 angles. No gating. |
| Hook Type | 12 styles | All plans: all 12 styles. No gating. |
| Copywriting Strategy | 8 strategies | All plans: all 8 strategies. No gating. |

### 6.3 Retargeting Only

| Field | Options | Notes |
|---|---|---|
| Objection | 12 canonical + custom | Required. Blocks generation if empty. |
| Testimonial / Proof | Textarea | Optional. Feeds proof angle. |

### 6.4 Visual / Format Fields

| Field | Options | Notes |
|---|---|---|
| Ad Format | Single / Carousel (Pro+) / Batch (Pro+ limited, Scale full) | |
| Slide Count | 2–7 (Pro) / 2–10 (Scale) | Hidden for single and batch. |
| Visual Style Family | Realistic / Fantasy (Pro+) / Minimal | All three show universe dropdown. Minimal suppresses scene in generation. |
| Universe / Setting | Realistic: location list + custom. Fantasy: world list + custom. | Visible for all families. Not applied to scene when Minimal is active. Hidden for text_only. |
| Art Direction | Cards filtered to current family. Incompatible cards hidden. | Section labeled "Art Direction." Hidden for text_only and minimal. |
| Aspect Ratio | 1:1, 4:5, 3:4, 4:3, 9:16, 16:9 | All plans. |
| Ad Tone | 11 tones | All plans: all 11 tones. No gating. |

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

Phase 5 — Blueprint → Render Prompt Pipeline (requires Phase 1)

Phase 6 — Language Quality Contracts (independent)

Phase 7 — Failure Classification (independent)

Phase 8 — Billing: Stripe + GHL Sync (requires Phase 2)

Phase 9 — Team Management (requires Phase 8)

HOTFIX — Plan Structure Alignment (requires Phase 9, apply BEFORE Phase 10+)

Phase 10 — Favorites & Workspace (requires Phase 8)

Phase 11 — Magic Edit (requires Phase 5)

Phase 12 — Workspace Logic (requires Phase 8 + Phase 9)

Phase 13 — Saved Projects (requires Phase 10)

Phase 14 — RAG + Meta Reporting (requires Phase 7 + Phase 8)

Phase 15 — Brand Colors (requires Phase 5)

Phase 16 — Creative Modes QA (requires Phase 1 + Phase 3 + Phase 5)

Phase 17 — Resize & Reflow (requires Phase 5 + Phase 15)
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
12. Stripe billing handles subscribe, cancel, top-up, past-due with GHL CRM sync for automations
13. Plan structure is 3 plans only (Starter/Pro/Scale). No Creator plan. All creative engine features fully ungated on all plans.
14. Magic Edit works in single, batch, and carousel modes with undo support (Pro+ only)
15. Each workspace is linked to its own Meta ad account, team visibility is role-scoped
16. Saved projects show thumbnail + status + per-plan project limits, can be resumed from any completed step
17. Meta Insights API syncs daily and performance data feeds back into generation prompts
18. Brand colors are enforced across all carousel slides, batch items, and retargeting ads
19. All 10 creative modes × all format combinations have passing fixture tests
20. Reflow works for single, batch, and carousel with text safe-zone re-validation
21. Login page has Login / Create Account tabs, no Google sign-in. Stripe-paid users land in app with trial toast. Unpaid users see billing modal.
22. Batch generation: Pro limited to 4 ads/run, Scale up to 36 ads/run. Carousel: Pro up to 7 slides, Scale up to 10 slides.

---


## SECTION 14 — BUILD ORDER

> **For AI agents:** This section is self-contained. Do not read other sections to execute tasks.
> Each task is one file, one action, one done condition. Do not break tasks down further.
> Do not create sub-phases. Do not plan. Execute the task, confirm done, move to the next row.

---

### Dependency Map

```
Phase 1  ──► Phase 2  ──► Phase 8  ──► Phase 9  ──► HOTFIX (plan alignment)
         ──► Phase 3             └──► Phase 10
         ──► Phase 4             └──► Phase 12 (Workspace)
         ──► Phase 5

Phase 6   (no dependency — start any time)
Phase 7   (no dependency — start any time)

HOTFIX    requires Phase 9 complete (apply before Phase 10+)
Phase 8   requires Phase 2
Phase 9   requires Phase 8
Phase 10  requires Phase 8 (billingState for team scoping)
Phase 11  requires Phase 5 (render pipeline must be stable)
Phase 12  requires Phase 8 + Phase 9 (billing + team must exist)
Phase 13  requires Phase 10 (favorites + workspace scoping)
Phase 14  requires Phase 7 + Phase 8 (failure classification + billing)
Phase 15  requires Phase 5 (build plan pipeline)
Phase 16  requires Phase 1 + Phase 3 + Phase 5
Phase 17  requires Phase 5 + Phase 15 (pipeline + brand colors)
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
**Requires:** Nothing.
**Blocks:** Phase 2, Phase 3, Phase 4, Phase 5.

| # | File | Action | Done when |
|---|---|---|---|
| 1.1 | `functions/src/creativeResolver.ts` | Add `campaignType: 'cold' \| 'retargeting'` as a required input to `resolveCreative()`. Pass it through to all downstream resolution logic. | `resolveCreative({ ..., campaignType: 'retargeting' })` returns a resolution with `resolvedCampaignType: 'retargeting'` |
| 1.2 | `functions/src/creativeResolver.ts` | Add `adFormat: 'single' \| 'carousel' \| 'batch'` as a required input to `resolveCreative()`. | `resolveCreative({ ..., adFormat: 'carousel' })` returns a resolution with `resolvedAdMode: 'carousel'` |
| 1.3 | `functions/src/creativeResolver.ts` | Add `minimal` as a third universe family. When `visualStyleFamily === 'minimal'`: set `resolvedSubStyle: null`, suppress environment generation flag, keep universe dropdown value in trace but mark as `notApplied`. | `resolveCreative({ visualStyleFamily: 'minimal' })` returns `resolvedStyleFamily: 'minimal'` and `resolvedSubStyle: null` |
| 1.4 | `functions/src/creativeResolver.ts` | Add function `validateLaunchSurface(inputs): { allowed: boolean, reason?: string }`. Checks every combination against Section 2. If not in Section 2, return `{ allowed: false, reason }`. Export this function for both frontend and backend use. | Calling with `{ offerCreativeMode: ['limited_access'] }` returns `{ allowed: false, reason: 'mode_deleted' }`. Calling with `{ campaignType: 'cold', adFormat: 'single', offerCreativeMode: ['standard_hero'] }` returns `{ allowed: true }`. |
| 1.5 | `functions/src/resolutionTrace.ts` | Implement `writeResolutionTrace(genId, trace: ResolutionTrace)`. Writes the `resolutionTrace` sub-document to `generations/{genId}` using the schema from Section 8. | After calling, Firestore document `generations/{genId}` has a `resolutionTrace` sub-document with all required fields |
| 1.6 | `functions/src/slidePlanEngine.ts` | Implement `carouselSlideCountPlan(campaignType, slideCount, mode): SlidePlan[]`. Returns per-slide angle/role array exactly matching Section 5.A tables. Cold uses angle pool A–G, retargeting uses P–E. | `carouselSlideCountPlan('cold', 5, 'standard_hero')` returns 5 entries: slide 1 = hook+CTA, slides 2–4 = angles A/B/C no CTA, slide 5 = close+CTA |
| 1.7 | `functions/src/slidePlanEngine.ts` | Implement `resolveValueStackSlideCount(gifts: string[]): number`. Returns `Math.min(gifts.length + 2, 9)`. | `resolveValueStackSlideCount(['a','b','c'])` returns `5`. `resolveValueStackSlideCount(['a','b','c','d','e','f','g','h'])` returns `9`. |
| 1.8 | `functions/src/emptyFieldFilter.ts` | Implement `filterEmptyValueStackFields(inputs): FilteredInputs`. Strips every value_stack field that is empty string, null, or undefined. Returns the cleaned inputs. | `filterEmptyValueStackFields({ valueStackPrice: '', valueStackTitle: 'Test' })` returns `{ valueStackTitle: 'Test' }` — `valueStackPrice` is gone |
| 1.9 | `functions/src/creativeResolver.ts` | Delete `step3point5.ts` from the codebase. Remove any imports referencing it. | File does not exist. No import errors. |

---

## Phase 2 — Frontend Enforcement
**Requires:** Phase 1 complete.
**Blocks:** Phase 8.

| # | File | Action | Done when |
|---|---|---|---|
| 2.1 | `src/components/InputForm.tsx`, `src/modeFieldSchema.ts`, `src/creativeResolver.ts` | Delete `limited_access`, `module_preview`, `day_strip` from every mode catalog, mode field schema entry, UI component, and constant array. Search and destroy — nothing remains. | `grep -r "limited_access\|module_preview\|day_strip" src/ functions/src/` returns zero results |
| 2.2 | `src/components/InputForm.tsx` | Import `validateLaunchSurface` from `creativeResolver.ts`. After every user selection change (mode, format, campaign type, family), call `validateLaunchSurface(currentInputs)`. If `allowed === false`, show the `reason` string as an inline message below the blocked item. Disable the generate button. | Selecting `before_after` + carousel shows "Before/After is single-image only" below the format selector. Generate button is disabled. |
| 2.3 | `src/components/InputForm.tsx` | Hide all non-launch languages from the AD_LANGUAGES dropdown. Only show the 7 approved languages from Section 2.6. | Dropdown shows exactly 7 options. No French, Spanish, German, Turkish, or Portuguese. |
| 2.4 | `src/components/InputForm.tsx` | Remove `before_after` from the hook angle selector. It must only appear in the Creative Mode grid. | Hook angle dropdown does not contain `before_after`. Creative Mode grid does contain it. |
| 2.5 | `src/components/InputForm.tsx` | When `visualStyleFamily` changes: clear art direction if switching to `minimal`. Reset art direction cards to the correct family when switching between `realistic` and `fantasy`. Show "Art Direction" as the section label for all families. | Switching from realistic to minimal clears art direction. Switching from realistic to fantasy shows fantasy cards. Label says "Art Direction" for both. |
| 2.6 | `src/components/InputForm.tsx` | When `text_only` is selected: hide universe dropdown, hide art direction section, hide style family selector. When deselected: restore them. | Selecting text_only hides all three. Deselecting restores them. |
| 2.7 | `src/components/InputForm.tsx` | Add all override signals from Section 7. Reference ad: show banner "Reference ad active — visual style follows the reference." When retargeting selected: replace hook section with objection section. When testimonial + single format: auto-switch to carousel with toast. | All 9 override signals from Section 7 fire correctly with their specified UI signal. |
| 2.8 | `src/components/InputForm.tsx` | Add value_stack carousel auto-adjustment. When value_stack is active in carousel mode and user changes gift count, auto-adjust slide count to `resolveValueStackSlideCount(gifts)`. Show inline notification: "Carousel adjusted to [N] slides — one gift per slide." | Adding 3 gifts sets slide count to 5 with notification. |
| 2.9 | `functions/src/index.ts` | In every generation Cloud Function entry point, call `validateLaunchSurface(inputs)` before any processing. If not allowed, throw `HttpsError('invalid-argument', reason)`. | Sending a request with `offerCreativeMode: ['limited_access']` returns `invalid-argument` error from the server |
| 2.10 | `src/components/InputForm.tsx` | Reference ad upload: gate behind Pro plan check from `useBillingState()`. If plan < Pro, show "Upgrade to Pro to use reference ads" and disable the upload area. | Starter users see the gated message. Pro+ users see the upload area. |

---

## Phase 3 — QA Fixtures
**Requires:** Phase 1 complete.

| # | File | Action | Done when |
|---|---|---|---|
| 3.1 | `functions/src/contractFixtures.test.ts` | Write fixture for Lane 1 (retargeting + carousel). Input: `campaignType: 'retargeting', adMode: 'carousel', slideCount: 5, retargetingObjection: 'price_too_high', offerCreativeMode: ['standard_hero']`. Assert: resolver allowed, slide plan has 5 entries, slide 1 has CTA, slides 2–4 have no CTA, slide 5 has CTA, all slides reference the objection. | Fixture test passes |
| 3.2 | `functions/src/contractFixtures.test.ts` | Write fixture for Lane 2 (cold + single + before_after). Input: `campaignType: 'cold', adMode: 'single', offerCreativeMode: ['before_after']`. Assert: resolver allowed, layout contract has split canvas zones, no `before_after` in hook angles. | Fixture test passes |
| 3.3 | `functions/src/contractFixtures.test.ts` | Write fixture for Lane 3 (cold + carousel + value_stack). Input: `campaignType: 'cold', adMode: 'carousel', offerCreativeMode: ['value_stack'], gifts: ['a','b','c']`. Assert: slide count = 5, slide 1 no price, middle slides one gift each no CTA, last slide price + CTA, empty fields stripped. | Fixture test passes |
| 3.4 | `functions/src/contractFixtures.test.ts` | Write fixture for Lane 8 (minimal + standard_hero + single). Input: `visualStyleFamily: 'minimal', offerCreativeMode: ['standard_hero'], adMode: 'single'`. Assert: `resolvedSubStyle: null`, environment suppressed flag true, universe value present but marked not applied. | Fixture test passes |
| 3.5 | `functions/src/contractFixtures.test.ts` | Write fixture for Lane 10 (testimonial carousel cold). Input: `campaignType: 'cold', adMode: 'carousel', testimonialMode: true, testimonialCount: 4`. Assert: slide count = 6, slide 1 = hook + CTA, slides 2–5 = testimonial (no CTA), slide 6 = close + CTA. | Fixture test passes |
| 3.6 | `functions/src/contractFixtures.test.ts` | Write one fixture for each remaining lane (4, 5, 6, 7, 9, 11). Total = 6 fixtures. Each has exact input JSON and asserts resolver result, slide/batch plan if applicable, and key contract rules from the lane spec. | All 6 fixture tests pass |

---

## Phase 4 — Testimonial Carousel
**Requires:** Phase 1 complete.

| # | File | Action | Done when |
|---|---|---|---|
| 4.1 | `functions/src/creativeResolver.ts` | Add `testimonial_carousel` to `CREATIVE_MODE_CATALOG`. Available tabs: all three. Solo only — mutually exclusive with all other modes. Forces `adFormat: 'carousel'`. | `validateLaunchSurface({ offerCreativeMode: ['testimonial_carousel'], adFormat: 'carousel' })` returns allowed. With `adFormat: 'single'` returns not allowed. |
| 4.2 | `src/components/InputForm.tsx` | When `testimonial_carousel` mode is selected, show a new upload zone: "Upload testimonial screenshots". Accept unlimited images. Each appears as a thumbnail strip below the upload zone. User can reorder and delete. | Upload zone appears. Multiple images uploadable. Thumbnails show in order. Delete button works. |
| 4.3 | `functions/src/testimonialMockup.ts` | Implement `detectPlatform(imageBase64): Promise<'whatsapp' \| 'instagram_dm' \| 'facebook' \| 'email' \| 'google_review' \| 'telegram' \| 'other'>`. Use a lightweight prompt to a fast model (Gemini Flash) to identify the messaging platform from the screenshot. | Function correctly identifies WhatsApp, Instagram DM, and Facebook screenshots in test images. |
| 4.4 | `functions/src/testimonialMockup.ts` | Implement `renderMockupSlide(screenshotBase64, platform, slideIndex, artDirection?): Promise<string>`. Renders the screenshot inside a platform-accurate UI frame matching the detected platform. Returns the composited image as base64. Art direction styling applied to the frame if provided. | WhatsApp screenshot returns image with green header, chat bubble UI, timestamp. |
| 4.5 | `functions/src/generators.ts` | Add testimonial carousel generation flow. For slide 1: generate AI hook using testimonial-specific framing (curiosity about social proof). For middle slides: call `renderMockupSlide` per testimonial. For last slide: generate CTA close. Auto-adjust slide count to `testimonialCount + 2`. | Generating with 4 testimonials produces 6 slides with correct structure. |
| 4.6 | `functions/src/generators.ts` | Add retargeting variant for testimonial carousel. Slide 1 hook names the objection AND teases testimonials. Testimonial slides framed to counter the objection. Close slide has objection-resolution CTA. | Retargeting testimonial carousel slide 1 references the objection. Close CTA is not generic. |

---

## Phase 5 — Blueprint → Render Prompt Pipeline
**Requires:** Phase 1 complete.

| # | File | Action | Done when |
|---|---|---|---|
| 5.1 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.offerCreativeMode` is used to inject the mode spec block into the prompt before the model generates the `TECHNICAL_PROMPT`. If the injection is conditional or missing, make it unconditional. | Calling `generateBuildPlan` with `offerCreativeMode: ['value_stack']` produces a blueprint whose `TECHNICAL_PROMPT` contains stack-zone composition language |
| 5.2 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm paired modes inject both specs. When `offerCreativeMode: ['standard_hero', 'event_ticket']`, the prompt must contain both the hero spec AND the ticket spec blocks. | Calling with two modes produces a blueprint whose `TECHNICAL_PROMPT` references both mode compositions |
| 5.3 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `filterEmptyValueStackFields(inputs)` is called before any prompt assembly when `value_stack` is active. The filtered inputs — not raw inputs — are used everywhere downstream. | Calling with `{ valueStackPrice: '', valueStackTitle: 'Test' }` produces a blueprint that never mentions price |
| 5.4 | `functions/src/generators.ts` | In `generateBuildPlan()`, confirm `inputs.brandColorPrimary` is injected as its exact hex value (e.g. `#FF6B00`) into the prompt before `TECHNICAL_PROMPT`. Never inject as a placeholder string like `[brand primary color]`. | Calling with `brandColorPrimary: '#FF6B00'` produces a blueprint whose `TECHNICAL_PROMPT` contains the string `#FF6B00` |
| 5.5 | `functions/src/generators.ts` | In `generateBuildPlan()`, when `visualStyleFamily === 'minimal'`, inject: "MINIMAL FAMILY ACTIVE. Do NOT render any environment, scene, or worldbuilding. Background: solid color or minimal gradient only. Hero isolated. No environmental context." | Calling with `visualStyleFamily: 'minimal'` produces a blueprint whose `TECHNICAL_PROMPT` contains the minimal-family instruction |
| 5.6 | `functions/src/generators.ts` | In `generateBuildPlan()`, when a reference ad is uploaded, inject: "REFERENCE AD ACTIVE. Match the reference ad's visual style, color palette, lighting, and composition. Override universe and art direction. Preserve creative mode layout." | Calling with a reference ad URL produces a blueprint whose `TECHNICAL_PROMPT` contains the reference-ad instruction |
| 5.7 | `functions/src/generators.ts` | Write and export function `buildFinalImagePrompt(technicalPrompt: string, contract: FullLayoutContract, inputs: AdInputs): string`. Assembles the final string sent to the image model in this order: (1) `technicalPrompt`, (2) aspect ratio instruction, (3) sub-style constraint block if `inputs.visualSubStyle` is set, (4) creative mode structural rules from `inputs.offerCreativeMode`, (5) face-consistency instruction if Box A photos are present. Return the assembled string. | Function returns a string containing all five sections when all inputs are provided |

---

## Phase 6 — Language Quality Contracts
**Requires:** Nothing — start any time.

| # | File | Action | Done when |
|---|---|---|---|
| 6.1 | `functions/src/captionValidator.ts` | Add per-language word count limits. Arabic dialects: headline max 8 words, subheadline max 12 words, caption max 150 words. English: headline max 10 words, subheadline max 15 words, caption max 200 words. Validation function `validateWordCount(text, language, field): { valid: boolean, actual: number, max: number }`. | Function returns valid/invalid with correct counts for each language and field type |
| 6.2 | `functions/src/captionValidator.ts` | Add Arabic Unicode ratio check. `validateArabicRatio(text): { valid: boolean, ratio: number }`. Must be >= 70% Arabic characters (excluding spaces, numbers, punctuation). If below, flag `arabicRatioFail: true`. | Pure Arabic text returns ratio > 0.95. Mixed text with 50% English returns valid: false. |
| 6.3 | `functions/src/dialectMarkers.ts` | Implement dialect-specific marker validation. For each of the 6 Arabic dialects, define 5+ marker words/phrases. `validateDialect(text, dialect): { valid: boolean, markers: string[] }` checks for at least 2 markers. | Egyptian text with `ازاي` and `يعني` returns valid for `ar_egyptian`. Same text returns invalid for `ar_gulf`. |
| 6.4 | `functions/src/captionValidator.ts` | Add RTL compliance check. `validateRTL(text): { valid: boolean, issues: string[] }`. Checks: no LTR-override characters, parentheses/brackets in correct RTL direction, numbers not breaking RTL flow. | Text with `(hello)` flags LTR parentheses issue. Pure RTL text passes. |
| 6.5 | `functions/src/languageQuality.test.ts` | Write test file with one fixture per launch language (7 total). Each has a sample headline, subheadline, and caption. Assert all validators pass for correct samples and fail for deliberately broken samples. | All 7 language fixtures pass. At least 3 deliberate-failure samples caught. |

---

## Phase 7 — Failure Classification
**Requires:** Nothing — start any time.

| # | File | Action | Done when |
|---|---|---|---|
| 7.1 | `functions/src/generators.ts` | Add `failureClass` field to generation records. Type: `'prompt_malformed' \| 'model_error' \| 'validation_reject' \| 'slot_repair_failed' \| 'numeric_hallucination' \| 'combination_invalid' \| 'credit_insufficient'`. On every caught error, classify and write to the generation record before re-throwing. | Failed generation records have a non-null `failureClass` field |
| 7.2 | `functions/src/generators.ts` | Add `costEstimate` field to generation records. Before calling any AI model, compute: `costEstimate = { inputTokens: estimated, outputTokens: estimated, imageRenders: count, totalCredits: cost }`. Write to record at the start of generation (before potential failure). | Every generation record has `costEstimate` with non-zero values |
| 7.3 | `functions/src/failureClassification.test.ts` | Write test: simulate each failure class. Assert classification is correct. (a) Invalid JSON from model → `prompt_malformed`. (b) 500 from image API → `model_error`. (c) Word count violation → `validation_reject`. (d) Slot map has unfilled required slot → `slot_repair_failed`. (e) Plan check fails → `combination_invalid`. (f) Credits < cost → `credit_insufficient`. | All 6 classification tests pass |

---

## Phase 8 — Billing (Stripe + GHL Sync)
**Requires:** Phase 2 complete.
**Blocks:** Phase 9, Phase 12, Phase 14.

**Architecture:** Stripe handles payment processing (Checkout Sessions, Customer Portal, subscription management). GHL remains the CRM — it receives post-payment webhooks from Firebase to trigger automations (welcome email, onboarding, tag updates, dunning). The flow is: User clicks subscribe → Stripe Checkout → Stripe processes payment → Stripe sends webhook to Firebase Cloud Function → Firebase updates user doc + sends webhook to GHL inbound webhook URL.

**What already exists (being updated):**
- `ghlpaymentwebhook` in `index.ts` — GHL-specific webhook with Stripe customer lookup. Being replaced by a direct Stripe webhook handler.
- `stripeSecretKey` secret — already defined. Keep it.
- `Stripe` import in `index.ts` — already exists. Keep it.
- `createStripePortalSession` callable — exists but needs update.
- `Billing.tsx` (206L) — references Stripe portal. Needs update to use new billingState fields.
- `billingState.ts` (162L) — `writeBillingState()`. Needs Stripe-specific fields.
- `useBillingState.ts` (98L) — Firestore `onSnapshot` hook. No changes needed.
- Billing UI components: `CancelDialog`, `CreditBar`, `PaymentFailedAlert`, `PlanCard`, `ReactivateButton`, `TopUpSelector`. Minor field updates.

**What stays:** `GHL_TEAM_INVITE_WEBHOOK_URL` secret stays — used by Phase 9 team invites. GHL inbound webhook URL stays — Firebase will POST to it after Stripe events.

### 8.A — Stripe Dashboard Setup (Owner Steps — Not Code)

These are manual steps for Eslam to complete before any code tasks begin.

| # | Where | Action | Done when |
|---|---|---|---|
| 8.A.1 | Stripe Dashboard | Log in to stripe.com. Ensure account is activated. Switch to **Test mode** for development. | Stripe account exists. Test mode is active. |
| 8.A.2 | Stripe Dashboard → Products | Create 3 subscription products: **Starter** ($29/monthly), **Pro** ($79/monthly), **Scale** ($197/monthly). Set prices in USD. Also create annual variants for each (Starter $290/yr, Pro $790/yr, Scale $1,970/yr — 2 months free). Note down the **Price ID** for each monthly and annual variant (format: `price_xxxxx`). | 3 products exist with 6 price IDs recorded (3 monthly + 3 annual). |
| 8.A.3 | Stripe Dashboard → Products | Create 1 one-time product: **Credit Top-Up**. Create 3 prices: 100 credits, 300 credits, 800 credits. Note down each Price ID. | Top-up product exists with 3 price IDs recorded. |
| 8.A.4 | Stripe Dashboard → Developers → API keys | Copy the **Secret key** (`sk_test_xxxxx` for test, `sk_live_xxxxx` for production). This is `STRIPE_SECRET_KEY`. Copy the **Publishable key** (`pk_test_xxxxx`). This is used frontend-side for Stripe.js. | Both keys saved. |
| 8.A.5 | Stripe Dashboard → Developers → Webhooks | Click "Add endpoint". URL: `https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook` (update region if different). Select events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Copy the **Signing secret** (format: `whsec_xxxxx`). This is `STRIPE_WEBHOOK_SECRET`. | Webhook endpoint exists. Signing secret saved. All 5 events subscribed. |
| 8.A.6 | Stripe Dashboard → Settings → Customer portal | Configure the Customer Portal: enable subscription cancellation, plan switching, payment method updates. Set the return URL to `https://app.proadsai.com/billing`. | Customer portal configured with correct return URL. |
| 8.A.7 | Firebase Console → Functions → Configuration | Set the following secrets using `firebase functions:secrets:set`: `STRIPE_SECRET_KEY` → value from 8.A.4 (should already exist — verify it's current). `STRIPE_WEBHOOK_SECRET` → value from 8.A.5 (new). Verify with `firebase functions:secrets:access STRIPE_SECRET_KEY`. | Both secrets are set and accessible. |

### 8.B — GHL Setup (Owner Steps — Not Code)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.B.1 | GHL → Automation → Workflows | Create a new workflow: **"Stripe Payment Received"**. Set trigger type: **Inbound Webhook**. GHL generates a unique webhook URL (format: `https://services.leadconnectorhq.com/hooks/xxxxx`). Copy this URL. This is `GHL_STRIPE_SYNC_WEBHOOK_URL`. | Workflow exists with inbound webhook trigger. URL saved. |
| 8.B.2 | GHL → Automation → Workflows | In the same workflow, add actions after the trigger: (1) **Update Contact** — set custom field `plan` to `{{plan}}`, set custom field `billing_status` to `{{billingStatus}}`, set tag `paid_{{plan}}`. (2) **If/Else** — if `{{event}}` = `checkout.session.completed`, then send **Welcome Email** (or trigger welcome automation). (3) **If/Else** — if `{{event}}` = `customer.subscription.deleted`, then remove paid tags and trigger **Win-Back** automation. | Workflow has Update Contact + conditional email triggers for completed/deleted. |
| 8.B.3 | GHL → Automation → Workflows | Create a second workflow: **"Stripe Payment Failed"**. Trigger: Inbound Webhook (separate URL). Actions: (1) Update Contact — set `billing_status` to `past_due`. (2) Send **Dunning Email** — "Your payment failed, update your card here: {{portalUrl}}". Copy this URL as `GHL_STRIPE_FAILED_WEBHOOK_URL`. | Workflow exists with dunning email action. URL saved. |
| 8.B.4 | GHL → Sites → Funnels | For new users coming from the GHL funnel (who do NOT have a Firebase Auth account yet), the checkout flow goes: GHL funnel CTA → app.proadsai.com pricing page → Stripe Checkout. The funnel CTA should link to the app's pricing page, not directly to Stripe. The app's `PricingTable` component (task 8.C.13) handles creating the Stripe Checkout Session with the correct `client_reference_id` if the user is logged in, or without it for anonymous users. | CTA buttons point to the app's pricing page URL. |
| 8.B.5 | Firebase Console → Functions → Configuration | Set secrets: `GHL_STRIPE_SYNC_WEBHOOK_URL` → value from 8.B.1. `GHL_STRIPE_FAILED_WEBHOOK_URL` → value from 8.B.3. | Both GHL webhook URL secrets are set. |

### 8.C — Code Tasks

| # | File | Action | Done when |
|---|---|---|---|
| 8.C.1 | `functions/src/billing/stripeWebhook.ts` | Create this file. Export `handleStripeWebhook(req, res)` — an `onRequest` handler that: (1) reads raw body with `req.rawBody`, (2) verifies signature using `stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], webhookSecret)`, (3) routes to handler by `event.type`. Supported events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. Return 200 after processing. | Function verifies signature. Invalid signature returns 400. Valid event returns 200 and logs event type. |
| 8.C.2 | `functions/src/billing/stripeWebhook.ts` | In `checkout.session.completed` handler: read `session.client_reference_id` (this is the `firebaseUid` if set) and `session.customer_email`. Retrieve the subscription from `session.subscription`. Get price ID from the subscription's items. Map price ID to plan name using `STRIPE_PRICE_TO_PLAN` map (Starter/Pro/Scale). Compute plan data: `plan`, `credits` (from `planconfig.ts`), `stripeSubscriptionId`, `stripeCustomerId` (from `session.customer`), `billingStatus: 'active'`, `isTrial` (check `subscription.trial_end`). **Dual-write logic:** If `client_reference_id` exists (user was logged in), write directly to `users/{uid}` and call `writeBillingState(uid)`. If `client_reference_id` is missing (new user paid BEFORE creating a Firebase Auth account), write to `pending_plans/{email.toLowerCase()}` instead. Then call `notifyGHL(identifier, 'checkout.session.completed')`. | After webhook with client_reference_id → user doc updated. After webhook without it → `pending_plans/{email}` doc created. Both include all plan fields. |
| 8.C.3 | `functions/src/billing/stripeWebhook.ts` | In `customer.subscription.updated` handler: read subscription status. If `status === 'canceled'` or `status === 'unpaid'`: set `plan: 'none'`, `billingStatus: 'cancelled'`, `credits: 0`. If `status === 'past_due'`: set `billingStatus: 'past_due'`, do NOT zero credits. If `status === 'active'` and price ID changed (plan upgrade/downgrade): map new price to plan, update credits. Lookup user by `stripeCustomerId` (query `users` collection where `stripeCustomerId == event.data.object.customer`). Call `writeBillingState(uid)`. Call `notifyGHL(uid, 'customer.subscription.updated')`. | Cancellation sets plan to none. Past-due keeps credits. Upgrade changes plan. |
| 8.C.4 | `functions/src/billing/stripeWebhook.ts` | In `customer.subscription.deleted` handler: lookup user by `stripeCustomerId`. Set `plan: 'none'`, `billingStatus: 'cancelled'`, `credits: 0`. Call `writeBillingState(uid)`. Call `notifyGHL(uid, 'customer.subscription.deleted')`. | Deletion sets plan to none + GHL notified. |
| 8.C.5 | `functions/src/billing/stripeWebhook.ts` | In `invoice.payment_succeeded` handler: if the invoice is for a subscription renewal (not the first payment — check `billing_reason === 'subscription_cycle'`), update `billingStatus: 'active'` if it was `past_due`. Call `writeBillingState(uid)`. In `invoice.payment_failed`: set `billingStatus: 'past_due'`. Call `notifyGHLFailed(uid, 'invoice.payment_failed')`. | Successful renewal clears past-due. Failed payment sets past-due + GHL dunning triggered. |
| 8.C.6 | `functions/src/billing/stripeWebhook.ts` | Add top-up handling in `checkout.session.completed`: if `session.mode === 'payment'` (one-time, not subscription) AND `session.metadata.isTopUp === 'true'`, add `session.metadata.creditAmount` to user's current credits. Lookup user by `client_reference_id` (top-ups always come from logged-in users). Call `writeBillingState(uid)`. Call `notifyGHL(uid, 'topup')`. | Top-up adds credits without changing plan. |
| 8.C.7 | `functions/src/billing/ghlBillingSync.ts` | Create this file. Export two functions: `notifyGHL(identifier, event)` — `identifier` is either a `uid` (reads user doc for email/name) or an `email` string (for `pending_plans` users who have no Firebase Auth account yet). POSTs to `GHL_STRIPE_SYNC_WEBHOOK_URL` with JSON body: `{ email, contactName, plan, billingStatus, event, credits, stripeSubscriptionId, portalUrl }`. `notifyGHLFailed(uid, event)` — POSTs to `GHL_STRIPE_FAILED_WEBHOOK_URL` with: `{ email, contactName, event, portalUrl }`. Both use `fetch()` with no auth (GHL inbound webhooks are open endpoints). Log success/failure but do NOT throw on GHL failure — GHL sync is best-effort and must never block Stripe webhook processing. | `notifyGHL` with uid reads user doc and sends POST. `notifyGHL` with email sends POST with email only. GHL workflow triggers. Failure is logged but does not throw. |
| 8.C.8 | `functions/src/billing/billingState.ts` | Update `writeBillingState()`: ensure shape includes `stripeCustomerId`, `stripeSubscriptionId`, and `billingStatus`. Remove any GHL-specific payment fields (the old `ghlpaymentwebhook` wrote different fields). Keep shape compatible with `useBillingState` hook. | billingState shape has Stripe fields. No old GHL payment fields. |
| 8.C.9 | `functions/src/index.ts` | Export `stripeWebhook` as `onRequest` with `cors: true`, `secrets: [stripeSecretKey, stripeWebhookSecret, ghlStripeSyncUrl, ghlStripeFailedUrl]`. Remove `ghlpaymentwebhook` and `ghlCancellationWebhook` exports (these were the old GHL→Firebase webhooks — direction is now reversed: Firebase→GHL). Keep `ghlTeamInviteUrl` secret for Phase 9. | Only `stripeWebhook` exists for billing. No old GHL payment handlers. Team invite GHL URL preserved. |
| 8.C.10 | `functions/src/index.ts` | Create callable `createStripeCheckoutSession({ priceId, mode })`. For subscriptions (`mode: 'subscription'`): call `stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: priceId, quantity: 1 }], success_url: 'https://app.proadsai.com/billing?session_id={CHECKOUT_SESSION_ID}', cancel_url: 'https://app.proadsai.com/billing', client_reference_id: auth.uid, customer_email: auth.email, metadata: {} })`. For top-ups (`mode: 'payment'`): same but `mode: 'payment'` and add `metadata: { isTopUp: 'true', creditAmount }`. Return `session.url`. | Callable returns a valid Stripe Checkout URL for both subscription and one-time payment. |
| 8.C.11 | `functions/src/index.ts` | Update `createStripePortalSession` callable. Call `stripe.billingPortal.sessions.create({ customer: stripeCustomerId, return_url: 'https://app.proadsai.com/billing' })`. Read `stripeCustomerId` from the user's Firestore doc. Return `session.url`. | Callable returns a valid Stripe Customer Portal URL. |
| 8.C.12 | `src/pages/Billing.tsx` | Update to use new billingState fields. (1) "Manage Subscription" button calls `createStripePortalSession` and opens returned URL — this handles payment method updates, plan changes, and cancellation all in one. (2) Top-up buttons call `createStripeCheckoutSession({ priceId, mode: 'payment' })`. (3) Plan upgrade buttons call `createStripeCheckoutSession({ priceId, mode: 'subscription' })`. | All billing actions use Stripe callables. No old GHL payment references. |
| 8.C.13 | `src/components/PricingTable.tsx` | Update CTA buttons on each plan card to call `createStripeCheckoutSession({ priceId: stripePriceId, mode: 'subscription' })`. Pass Stripe price IDs from `planconfig.ts`. On success, redirect to the returned `session.url`. | Clicking "Subscribe" on any plan redirects to Stripe Checkout with correct plan. |
| 8.C.14 | `src/planconfig.ts` | Add `stripePriceId` field to each plan entry. Map: `starter` → Stripe price ID from 8.A.2 (monthly + annual), `pro` → Pro price ID (monthly + annual), `scale` → Scale price ID (monthly + annual). Remove the old `creator` plan entry entirely. Add `stripeTopUpPriceIds: { 100: 'price_xxx', 300: 'price_xxx', 800: 'price_xxx' }`. Remove any GHL product ID mappings. | Each plan has a `stripePriceId`. Top-ups have price IDs. No GHL product references. |
| 8.C.15 | `functions/src/billing/__tests__/billingState.test.ts` | Rewrite tests: (a) simulated `checkout.session.completed` webhook sets correct plan, credits, and stripeSubscriptionId, (b) `customer.subscription.deleted` sets plan to `none` and calls `notifyGHL`, (c) `checkout.session.completed` with `metadata.isTopUp` adds credits, (d) `invoice.payment_failed` sets past-due and calls `notifyGHLFailed`, (e) invalid Stripe signature returns 400, (f) `notifyGHL` failure does not throw (GHL sync is best-effort), (g) `checkout.session.completed` without `client_reference_id` writes to `pending_plans/{email}`. | All seven tests pass. |
| 8.C.16 | `functions/src/index.ts` | Keep `monthlyCreditsReset` scheduled function unchanged — it already reads plan from user doc and resets credits. Verify it calls `writeBillingState()` after reset. | Monthly reset still works. billingState updates after reset. |

### 8.D — Email-Only Auth (Replace Login Page)

**Context:** Users arrive at `app.proadsai.com` after paying via Stripe. Their email already exists in Firestore (written by `stripeWebhook` handler to either `users/{uid}` or `pending_plans/{email}`) with their plan, credits, and subscription status. They need to create a Firebase Auth account using the exact same email they used on Stripe. Google sign-in is removed entirely to prevent email mismatches.

**What already exists:**
- `LoginScreen` component inline in `App.tsx` (around line 32) — has email+password fields, Google sign-in button, forgot password link.
- `handleGoogleLogin()` in `App.tsx` (line 1330) — calls `signInWithPopup(auth, googleProvider)`.
- `handleEmailLogin()` in `App.tsx` (line 1344) — calls `signInWithEmailAndPassword`.
- `googleProvider` exported from `firebase.ts` (line 23) — `new GoogleAuthProvider()`.
- `noAccountError` state (line 929) — shows error when Google account has no matching Firestore doc.
- No `createUserWithEmailAndPassword` — account creation does not exist in the app yet.

| # | File | Action | Done when |
|---|---|---|---|
| 8.D.1 | `src/firebase.ts` | Remove `GoogleAuthProvider` import and `export const googleProvider = new GoogleAuthProvider()` line. | `googleProvider` export is gone. No Google auth imports in `firebase.ts`. |
| 8.D.2 | `src/App.tsx` | Remove `googleProvider` from the import of `firebase.ts`. Remove `signInWithPopup` from the `firebase/auth` import. Add `createUserWithEmailAndPassword` to the `firebase/auth` import. | Import line has `createUserWithEmailAndPassword`. No `signInWithPopup` or `googleProvider`. |
| 8.D.3 | `src/App.tsx` | Delete `handleGoogleLogin` function entirely (around line 1330). Remove `onGoogleLogin` prop from `LoginScreen` component definition and from the `<LoginScreen>` render call (around line 2327). | `handleGoogleLogin` does not exist. `LoginScreen` has no `onGoogleLogin` prop. |
| 8.D.4 | `src/App.tsx` | Refactor `LoginScreen` component. Add `activeTab` state: `'login' \| 'create'`. Render two tab buttons above the form: `[ Login ]  [ Create Account ]`. Active tab is visually highlighted. Both tabs render on the same page — no route change, just state toggle. Remove `noAccountError` prop — replaced by specific error handling per tab. | Two tabs render above the form. Clicking toggles between them. No route change. |
| 8.D.5 | `src/App.tsx` | In the Login tab: show Email and Password fields. Button text: `ENTER STUDIO →` (keep existing style). Below the form, show link: "Don't have an account? Create one" — clicking it switches `activeTab` to `'create'`. Keep "Forgot Password?" link. Remove the Google sign-in button and its divider/separator. | Login tab has email + password + ENTER STUDIO button + forgot password link + create account link. No Google button. |
| 8.D.6 | `src/App.tsx` | In the Create Account tab: show Email, Password, and Confirm Password fields. Button text: `CREATE ACCOUNT →` (same style as login button). Below the button, show link: "Already have an account? Log in" — clicking it switches `activeTab` to `'login'`. No "Forgot Password?" link on this tab. | Create Account tab has 3 fields + CREATE ACCOUNT button + login link. No forgot password. |
| 8.D.7 | `src/App.tsx` | Add `handleCreateAccount` function. On submit: (1) validate `password === confirmPassword`, if not show inline error "Passwords don't match". (2) Validate `password.length >= 8`, if not show inline error "Password must be at least 8 characters". (3) Call `createUserWithEmailAndPassword(auth, email, password)`. On success, `onAuthStateChanged` fires and the app proceeds to the authenticated state — no manual redirect needed. | Function creates account. Validation errors show inline. Successful creation triggers `onAuthStateChanged`. |
| 8.D.8 | `src/App.tsx` | In the `onAuthStateChanged` handler (around line 980), update the "no Firestore doc" branch (line 1057+). The existing flow already checks `pending_plans/{email}` — keep this logic but ensure field names match Stripe webhook output (`stripeCustomerId`, `stripeSubscriptionId`). The `pending_plans` doc is created by the Stripe webhook (task 8.C.2) when a user pays before creating an account. The existing code deletes the pending doc after consuming it — keep that. **Critical change at line 1143:** currently, if no pending plan AND no team membership, the code **deletes the Firebase Auth account** and signs out. Replace this with: keep the auth account, set `user`, set `userPlan: 'none'`, set `userCredits: 0`, and set a new state `showBillingModal: true`. Render `PricingTable` in a fullscreen modal overlay when `showBillingModal` is true. After the user subscribes via Stripe and the webhook writes their plan, the `useBillingState` hook will update and the modal can close. **Route guard for JoinTeam:** Before entering the "no plan" branch, check if the current URL path starts with `/join`. If so, skip the billing modal — the JoinTeam page (Phase 9.5) manages its own auth flow. Also check for `sessionStorage.getItem('proads_team_invite_pending')` as a fallback (set by JoinTeam before `createUserWithEmailAndPassword` — see Phase 9.7). This prevents a race condition: when JoinTeam calls `createUserWithEmailAndPassword`, `onAuthStateChanged` fires immediately BEFORE `claimTeamInvite` has written the user doc, so the handler would incorrectly show the billing modal for a team invite user. | Paid-before-signup user → pending_plans consumed → enters app with plan. Unpaid user → NOT deleted → sees billing modal with PricingTable. Team member on `/join` → handler skips billing modal, lets JoinTeam page handle the flow. |
| 8.D.9 | `src/App.tsx` | Add error handling for `handleCreateAccount`: `auth/email-already-in-use` → show inline error "An account with this email already exists. Please log in." AND auto-switch `activeTab` to `'login'` with the email pre-filled in the login form. `auth/weak-password` → "Password must be at least 8 characters." `auth/invalid-email` → "Please enter a valid email address." Any other error → "Something went wrong. Please try again." | Each error code shows correct message. `email-already-in-use` auto-switches to login with email pre-filled. |
| 8.D.10 | `src/App.tsx` | Update error handling for `handleEmailLogin`: `auth/user-not-found` → show inline error "No account found with this email. Please create an account first." AND auto-switch `activeTab` to `'create'` with the email pre-filled. `auth/wrong-password` → "Incorrect password. Please try again." `auth/too-many-requests` → "Too many attempts. Please wait a few minutes and try again." Remove old `noAccountError` state and its Google-specific error UI. | Each error code shows correct message. `user-not-found` auto-switches to create tab with email pre-filled. |
| 8.D.11 | `src/App.tsx` | Add shared `pendingEmail` state used for cross-tab email pre-fill. When `auth/email-already-in-use` fires on Create tab, set `pendingEmail` to the entered email and switch to Login tab — Login tab reads `pendingEmail` as the initial value of its email field. Same in reverse for `auth/user-not-found`. Clear `pendingEmail` after it's consumed. | Email carries over when auto-switching tabs in both directions. |
| 8.D.12 | `src/i18n.tsx` | Add translation keys for new strings: `login.createAccount`, `login.createAccountButton` (`CREATE ACCOUNT →`), `login.alreadyHaveAccount`, `login.dontHaveAccount`, `login.errorEmailInUse`, `login.errorUserNotFound`, `login.errorWrongPassword`, `login.errorTooManyRequests`, `login.errorWeakPassword`, `login.errorInvalidEmail`, `login.errorPasswordsMismatch`, `login.errorGeneric`, `login.welcomeTrial`. Add both Arabic and English values. | All new strings have AR + EN translations. No hardcoded strings in the auth UI. |
| 8.D.13 | `src/App.tsx` | In the `onAuthStateChanged` handler, after a `pending_plans` doc is consumed and the user doc is created (around line 1090): show welcome toast using the existing toast system: `"Welcome! Your 7-day trial has started."` (use `login.welcomeTrial` translation key). Only show on the FIRST login after account creation — check `createdAt` is within the last 60 seconds to avoid showing on subsequent logins. | First login after Stripe payment shows welcome toast. Subsequent logins do not. |
| 8.D.14 | `src/App.tsx` | Add `showBillingModal` state (default `false`). When `showBillingModal` is true, render a fullscreen modal overlay with `<PricingTable />` inside. The modal has no close button — user must pick a plan. After Stripe Checkout completes and the webhook fires, `useBillingState` will update `plan` from `'none'` to the new plan. Add a `useEffect` that watches `billingState.plan`: when it changes from `'none'` to any real plan, set `showBillingModal: false` and show welcome toast. | Unpaid user sees mandatory billing modal. After paying, modal auto-closes and app loads. |


---

## Phase 9 — Team Management
**Requires:** Phase 8 complete.

| # | File | Action | Done when |
|---|---|---|---|
| 9.1 | `src/App.tsx` (or router config file) | Add route `/join` that renders a `JoinTeam` component and accepts `?inviteId=` query param | Navigating to `/join?inviteId=test` renders a page instead of 404 |
| 9.2 | `functions/src/index.ts` | Write and export Cloud Function `getInviteDetails(inviteId: string)` — reads from `team_invites` collection, returns `{ ownerName, inviteeEmail, teamPlan, status, expiresAt }`. Does not require Firebase Auth. Returns `{ status: 'expired' }` if `expiresAt` is in the past. Returns `{ status: 'revoked' }` if invite was revoked. | Calling with a valid inviteId returns the invite fields. Calling with expired inviteId returns `{ status: 'expired' }`. |
| 9.3 | `functions/src/index.ts` | In `createTeamInvite`, set `expiresAt` to `Date.now() + 7 * 24 * 60 * 60 * 1000` (7 days from creation) on every new invite. | New invites in `team_invites` collection have `expiresAt` set to 7 days from now |
| 9.4 | `functions/src/index.ts` | In `claimTeamInvite`, check `expiresAt` before processing. If expired, throw `HttpsError('failed-precondition', 'invite_expired')`. Do not set `isTeamMember`. | Calling `claimTeamInvite` with an expired inviteId returns the invite_expired error |
| 9.5 | `src/pages/JoinTeam.tsx` | Create this file. On mount, call `getInviteDetails(inviteId)`. If `status === 'expired'` or `status === 'revoked'`, render error message (no 404, no crash). If valid, render the invite card showing owner name and invitee email. **No Google sign-in on this page** — email + password only, consistent with the main login page (Phase 8.D). The existing `JoinTeam.tsx` in the codebase already follows this pattern. | Page renders invite details for valid invite. Page renders "This invite is no longer valid" for expired/revoked. Never shows a 404. No Google auth button. |
| 9.6 | `src/pages/JoinTeam.tsx` | Add login branch: check if `auth.currentUser` email matches `inviteeEmail` from invite. If user is already logged in with matching email, show "Join [Owner]'s team" button that calls `claimTeamInvite`. On success, redirect to `/`. | Logged-in user with matching email can claim invite and is redirected |
| 9.7 | `src/pages/JoinTeam.tsx` | Add new-account branch: if no current user or email does not match, show a form with fields: full name (pre-filled if available), email (pre-filled from invite, read-only), password, confirm password. On submit: (1) set `sessionStorage.setItem('proads_team_invite_pending', 'true')` BEFORE creating the account — this prevents the `onAuthStateChanged` handler in App.tsx from showing the billing modal during the brief window between account creation and `claimTeamInvite` completion (see Phase 8.D.8 route guard), (2) call `createUserWithEmailAndPassword`, (3) call `claimTeamInvite`, (4) remove the sessionStorage flag, (5) redirect to `/`. | New user can create an account and claim the invite in one flow. Ends up logged in and redirected. `onAuthStateChanged` does not show billing modal during the process. |
| 9.8 | `src/pages/Team.tsx` | Create this file. Render three sections: (1) active members list showing name, email, role, joined date with a "Remove" button per member; (2) pending invites list showing email, sent date, status with "Resend" and "Revoke" buttons; (3) invite form with name and email fields and "Send Invite" button. | Page renders all three sections. Data comes from `getTeamInvites` Cloud Function. |
| 9.9 | `src/pages/Team.tsx` | Wire "Send Invite" button to call `createTeamInvite(name, email)`. On success, add the new invite to the pending list in local state. If plan limit is reached (`teamMemberCount + openInvites >= maxTeamMembers`), replace the form with inline text: "Upgrade to [next plan] to invite more members." | Sending an invite adds it to the pending list without page refresh. Limit message shows when at cap. |
| 9.10 | `src/pages/Team.tsx` | Wire "Resend" button to call `resendTeamInvite(inviteId)`. Wire "Revoke" button to call `revokeTeamInvite(inviteId)` after a browser `confirm()` dialog. Both update the invite status in local state on success. | Resend calls the function. Revoke shows confirm dialog first. Both update the UI without page refresh. |
| 9.11 | `src/pages/Team.tsx` | Wire "Remove" button on active members to call `removeTeamMember(memberUid)` after a `confirm()` dialog. On success, remove the member from the active list in local state. | Remove shows confirm dialog. On confirm, member disappears from list without page refresh. |
| 9.12 | `src/components/Layout.tsx` (or credit bar component) | For team members, show the credit bar labeled "Team credits — [ownerName]'s account" using `billingState.teamOwnerName`. For team owners, show "Team credits — your account". Both read from `useBillingState()`. | Team member sees owner's name in credit bar. Owner sees "your account". |
| 9.13 | `src/components/InputForm.tsx` | Disable all generation-triggering buttons when `billingState.teamRole === 'viewer'`. Add tooltip on disabled state: "Viewers cannot generate — contact your team owner." | Viewer role user sees disabled generate buttons with tooltip |
| 9.14 | `functions/src/index.ts` | In `writeBillingState()` from Phase 8, add team fields: `teamMemberCount`, `teamOpenInvites`, `maxTeamMembers`, `isTeamOwner`, `isTeamMember`, `teamOwnerName`. Read team member count from `users/{uid}/team` subcollection size. Read open invites from `team_invites` where `ownerUid === uid` and `status === 'pending'`. | `billingState` object includes all team fields after a team invite is sent |
| 9.15 | `functions/src/contractFixtures.test.ts` | Add four team fixture tests: (a) `createTeamInvite` is blocked when memberCount + openInvites >= maxTeamMembers; (b) `claimTeamInvite` sets `isTeamMember: true` on the invitee's user doc; (c) `claimTeamInvite` with expired invite returns `invite_expired` error; (d) `removeTeamMember` sets `isTeamMember: false` on the removed member's user doc. | All four tests pass |

---

## HOTFIX — Plan Structure Alignment (Apply to Phases 1–9)

> **Context:** The pricing table has been finalized with **3 plans** (Starter/Pro/Scale), not 4. The Creator plan no longer exists. Phases 1–9 were built with a 4-plan structure. These hotfixes align already-shipped code with the final pricing.

| # | File | Action | Done when |
|---|---|---|---|
| HF.1 | `src/planconfig.ts` | Remove the `creator` plan entry entirely. Rename `scaling` to `scale`. Final plan IDs: `starter`, `pro`, `scale`. Update credits: Starter 800, Pro 2500, Scale 6500. Update team member limits: Starter 1, Pro 3, Scale 10. Add `savedProjectLimit`: Starter 10, Pro 30, Scale `Infinity`. Add `audienceAvatarLimit`: Starter 5, Pro 15, Scale `Infinity`. Add `batchConfig` per plan: Starter `null` (no batch), Pro `{ maxSizes: 1, maxHooks: 2, maxConcepts: 2, maxAdsPerRun: 4 }`, Scale `{ maxSizes: 3, maxHooks: 4, maxConcepts: 3, maxAdsPerRun: 36 }`. Add `carouselMaxSlides`: Starter `null` (no carousel), Pro 7, Scale 10. | `planconfig.ts` has exactly 3 plans. No `creator` entry. All limits match the pricing table. |
| HF.2 | `functions/src/entitlements.ts` | Remove all Creator-tier gates. Update `resolveEntitlement()`: features previously gated at Creator+ (retargeting, fantasy, art direction) are now gated at Pro+. Remove ALL per-plan limits on hook angles, hook types, copywriting strategies, and ad tones — these are fully ungated on all plans. Batch: available on Pro (limited by `batchConfig`) and Scale (full). Carousel: Pro up to 7 slides, Scale up to 10. | `resolveEntitlement({ plan: 'starter', feature: 'hookAngles' })` returns all 11. `resolveEntitlement({ plan: 'starter', feature: 'retargeting' })` returns blocked. `resolveEntitlement({ plan: 'pro', feature: 'batch' })` returns allowed with limits. |
| HF.3 | `functions/src/creativeResolver.ts` | Update `validateLaunchSurface()`: remove Creator from the plan hierarchy check. Batch allowed for Pro+ (not Scale-only). Retargeting allowed for Pro+ (not Creator+). Update any `plan === 'creator'` checks to map to appropriate tier or remove. | No reference to `creator` plan in resolver. Batch + Pro returns allowed. |
| HF.4 | `src/components/InputForm.tsx` | Remove all Creator-specific UI gates. Hook angle selector: show all 11 for all plans (remove the per-plan slicing logic). Hook type selector: show all 12 for all plans. Copywriting strategy: show all 8 for all plans. Ad tone: show all 11 for all plans. Fantasy family: gate behind Pro+ (was Creator+). Retargeting toggle: gate behind Pro+ (was Creator+). Batch format option: show for Pro+ (was Scale-only). | Starter user sees all hooks, tones, strategies. Starter user sees batch/retargeting/fantasy as locked with "Upgrade to Pro" message. |
| HF.5 | `src/components/InputForm.tsx` | Update carousel slide count selector: Pro shows options 2–7. Scale shows options 2–10. Update batch UI: Pro shows batch with "Up to 4 ads per run" label. Scale shows "Up to 36 ads per run". | Slide count max is 7 for Pro, 10 for Scale. Batch limits displayed correctly per plan. |
| HF.6 | `functions/src/generators.ts` | In batch generation flow, enforce `batchConfig` limits from `planconfig.ts`: if plan is Pro, cap at 4 total combinations (1 size × 2 hooks × 2 concepts). If plan is Scale, cap at 36. Throw `HttpsError('permission-denied', 'batch_limit_exceeded')` if request exceeds plan limit. | Pro user requesting 5 batch combos gets rejected. Scale user requesting 36 passes. |
| HF.7 | `functions/src/generators.ts` | Update carousel slide count validation: Pro max 7 slides (was 5). Scale max 10 slides (was 9). Update any hardcoded `maxSlides` checks. | Pro user requesting 7 slides passes. Scale user requesting 10 passes. Pro user requesting 8 gets rejected. |
| HF.8 | `src/store.ts`, `src/types.ts` | Replace any `'creator'` literal in the `UserPlan` type union. New type: `type UserPlan = 'none' \| 'starter' \| 'pro' \| 'scale'`. Rename `'scaling'` to `'scale'` in all type definitions, Zustand state, and component comparisons. | `grep -r "creator\|scaling" src/` returns zero plan-related hits. |
| HF.9 | `functions/src/index.ts` | In all Cloud Functions that check plan names (generation functions, team functions, billing functions): replace `'scaling'` with `'scale'`. Remove `'creator'` from any plan checks. Update `PLANS` constant if it exists. | No Cloud Function references `creator` or `scaling` as a plan name. |
| HF.10 | `functions/src/contractFixtures.test.ts` | Update all fixture tests that reference Creator plan. Replace `plan: 'creator'` with `plan: 'pro'` in any test that was testing Creator-tier access. Update batch fixtures: Pro user should now pass (limited), not fail. Update carousel fixtures: Pro user max 7, Scale max 10. | All fixture tests pass with 3-plan structure. |

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

## Phase 11 — Magic Edit
**Requires:** Phase 5 complete (render pipeline must be stable).

**What already exists:**
- `falEditing.ts` (161L) — `editWithFalKontext()` sends image + English edit prompt to fal.ai FLUX Kontext. Returns edited image base64. Text overlay is stripped before edit and re-composited after.
- `MagicSelector.tsx` (334L) — Canvas overlay with lasso drawing tool. Computes selection region as `{ xPct, yPct, widthPct, heightPct }`. Supports three edit modes: `text` (replace/remove text in region), `erase` (remove object), `style` (change color/style). Emits `onEditRequest` callback with mode, region, and payload.
- `textCompositing.ts` (631L) — Sharp-based Arabic text rendering. Re-runs after any edit to re-apply text overlay.

**What is missing:**
- No "add object" edit instruction (only erase and style exist).
- No environment/background replacement instruction.
- No batch edit flow (apply same edit to all N batch images).
- No carousel per-slide edit routing (edit one slide, maintain carousel coherence).
- No retargeting edit mode (edit must preserve objection-answering visual cues).
- No edit history/undo stack (each edit is destructive).
- No quality-preservation guard for repeated edits (repeated Kontext calls degrade image).
- No mask-to-prompt translation for complex lasso shapes.
- `textCompositing` is not automatically re-triggered after `editWithFalKontext` returns.

| # | File | Action | Done when |
|---|---|---|---|
| 11.1 | `functions/src/falEditing.ts` | Add function `editWithFalKontextInpaint(imageBase64, maskBase64, editPrompt, falApiKey): Promise<FalEditResult>`. This variant accepts a binary mask (white = edit region, black = keep) alongside the text prompt. Used when lasso selection is non-rectangular. Convert lasso polygon points to a Sharp-rendered mask PNG before calling. | Function accepts mask + prompt and returns edited image. Non-rectangular selections produce correct mask. |
| 11.2 | `functions/src/falEditing.ts` | Add function `buildEditPrompt(editMode, payload, currentBuildPlan): string`. Translates UI edit actions into English Kontext prompts: `erase` → "Remove the [object description] from the image, fill with surrounding context". `add` → "Add [payload.description] at [region description]". `style` → "Change the color of [region description] to [payload.colorHex]". `environment` → "Replace the background/environment with [payload.environmentDescription], keep the foreground subject intact". `text` → NO Kontext call (handled by textCompositing only). Uses `currentBuildPlan` to extract scene context for better prompt grounding. | Each edit mode produces a coherent English prompt. Text mode returns null (no Kontext call needed). |
| 11.3 | `functions/src/falEditing.ts` | Add function `preserveQuality(originalBase64, editedBase64, editCount): Promise<string>`. If `editCount >= 3`, run a quality-restoration pass: send the edited image back through Kontext with prompt "Enhance image quality, sharpen details, restore color vibrancy, maintain all content exactly as-is". Return the quality-restored base64. If `editCount < 3`, return editedBase64 unchanged. Store `editCount` on the generation record. | After 3+ edits, output image has visibly sharper details than without the restoration pass. |
| 11.4 | `functions/src/index.ts` | Create callable `magicEditImage({ generationId, editMode, region, payload, slideIndex? })`. **Plan gate: Pro+ only** — if `billingState.plan === 'starter'`, throw `HttpsError('permission-denied', 'pro_plan_required')`. Flow: (1) load generation record, (2) get clean image (pre-text-overlay) from `output.cleanImageBase64` or `output.cleanImageUrl`, (3) if region is non-rectangular, render mask via 11.1, else use standard Kontext call, (4) build prompt via 11.2, (5) call Kontext, (6) run `preserveQuality` via 11.3, (7) re-run `compositeArabicText()` on edited image, (8) save edited image to Storage, (9) update generation record with new URLs and increment `editCount`, (10) return new image URL. | Starter user gets `pro_plan_required` error. Pro+ user gets edited image with text re-composited. |
| 11.5 | `functions/src/index.ts` | In `magicEditImage`, add `slideIndex` parameter support. If `slideIndex` is provided, load the carousel slide's individual clean image from `output.carouselSlides[slideIndex].cleanImageBase64`. After editing, write back to the same slide index. Do not re-render other slides. | Editing carousel slide 3 only affects slide 3. Other slides remain unchanged. |
| 11.6 | `functions/src/index.ts` | In `magicEditImage`, add batch edit support. If `payload.applyToAll === true` AND the generation is a batch (`output.batchResults` exists), iterate over all batch images and apply the same Kontext edit to each. Use `Promise.allSettled` for parallel execution. Return array of results with per-image success/failure. | Batch edit with `applyToAll: true` edits all N images. Partial failures don't block successful edits. |
| 11.7 | `src/components/MagicSelector.tsx` | Add "Add Object" tool alongside existing erase/style tools. When selected, show a text input for object description (e.g., "a laptop on the desk") and let user lasso the region where the object should appear. Emit `onEditRequest({ mode: 'add', region, payload: { description } })`. | User can select "Add" tool, draw a lasso region, type a description, and submit. |
| 11.8 | `src/components/MagicSelector.tsx` | Add "Change Environment" tool. When selected, show a text input for new environment description (e.g., "luxury office with floor-to-ceiling windows"). No lasso needed — applies to full background. Emit `onEditRequest({ mode: 'environment', region: null, payload: { environmentDescription } })`. | User can select "Environment" tool, type description, and submit without drawing a region. |
| 11.9 | `src/components/MagicSelector.tsx` | Add edit history stack. Store up to 10 previous `cleanImageBase64` states in component state. Add "Undo" button that reverts to previous state and decrements `editCount`. Add "Redo" button. History resets when user navigates away from the step. | Undo reverts the last edit visually. Redo re-applies it. History is capped at 10. |
| 11.10 | `src/components/MagicSelector.tsx` | Add batch edit toggle. When the current generation is batch mode (`batchResults` exists), show a checkbox: "Apply this edit to all [N] images". When checked, the `onEditRequest` payload includes `applyToAll: true`. Show a progress indicator during batch processing with per-image status. | Checkbox appears in batch mode. Checking it and editing applies to all images with progress feedback. |
| 11.11 | `src/components/MagicSelector.tsx` | Add carousel slide selector. When the current generation is carousel mode, show a horizontal strip of slide thumbnails above the edit canvas. Clicking a thumbnail loads that slide's clean image into the editor. The `onEditRequest` payload includes `slideIndex`. | User can switch between carousel slides and edit each individually. |
| 11.12 | `functions/src/generators.ts` | In the generation pipeline, after rendering the final image, persist the clean (pre-text-overlay) image separately as `output.cleanImageBase64` (or upload to Storage as `output.cleanImageUrl`). This is the image that Magic Edit operates on. For carousel, store per-slide: `output.carouselSlides[i].cleanImageUrl`. | Every rendered image has a corresponding clean version stored. Magic Edit can retrieve it without re-rendering. |
| 11.13 | `functions/src/contractFixtures.test.ts` | Add magic edit fixture tests: (a) `magicEditImage` with `mode: 'erase'` returns new URL different from original, (b) `magicEditImage` with `slideIndex: 2` only modifies slide 2, (c) `magicEditImage` with `applyToAll: true` returns array with length equal to batch size, (d) `preserveQuality` with `editCount: 5` produces output different from input (quality pass ran). | All four tests pass. |

---

## Phase 12 — Workspace Logic (Scale Mode)
**Requires:** Phase 8 + Phase 9 complete (billing + team management).

**What already exists:**
- `Workspace` interface: `id, name, brandName, brandUrl?, brandColorPrimary?, brandColorSecondary?, logoUrl?, createdAt, isDefault`.
- `WorkspaceSwitcher.tsx` (91L) — dropdown UI for switching active workspace.
- `WorkspaceSettingsModal.tsx` (170L) — form for editing workspace name, brand name, colors, logo.
- Zustand store: `workspaces[]`, `activeWorkspaceId`, `setWorkspaces()`, `setActiveWorkspaceId()`.
- `SavedProject` has `workspaceId?` field.
- `GenerationRecord` (in types) has `workspaceId?` field.

**What is missing:**
- No `metaAdAccountId` on Workspace — each workspace cannot be linked to its own Meta ad account.
- No workspace CRUD Cloud Functions — all workspace logic is client-side only.
- No workspace-scoped generation queries — the `generations` collection is queried by `userId` only, not `workspaceId`.
- No team role-based workspace visibility (all team members see all workspaces — no per-workspace access control).
- No workspace switching guard (user can switch workspace mid-generation without warning).
- No workspace creation/deletion limit tied to plan.

| # | File | Action | Done when |
|---|---|---|---|
| 12.1 | `src/types.ts` | Add `metaAdAccountId?: string` and `metaAdAccountName?: string` to `Workspace` interface. | Interface has both new fields. |
| 12.2 | `functions/src/index.ts` | Create callable `createWorkspace({ name, brandName, brandColorPrimary?, brandColorSecondary?, logoUrl? })`. Writes to `users/{uid}/workspaces/{workspaceId}` subcollection. Checks plan limit: Scale plan allows up to 10 workspaces. Below Scale, throw `HttpsError('permission-denied', 'scale_plan_required')`. Returns the new workspace ID. | Calling with Scale plan creates workspace. Calling with Pro plan returns error. |
| 12.3 | `functions/src/index.ts` | Create callable `updateWorkspace({ workspaceId, ...fields })`. Updates any subset of workspace fields in `users/{uid}/workspaces/{workspaceId}`. Validates `metaAdAccountId` if provided by checking the user's Meta connection has that account ID in their `adAccounts` array. | Updating with a valid `metaAdAccountId` succeeds. Updating with an account ID not in the user's connected accounts throws error. |
| 12.4 | `functions/src/index.ts` | Create callable `deleteWorkspace({ workspaceId })`. Prevents deleting the default workspace (`isDefault: true`). Before deleting, reassign all `generations` and `savedProjects` with this `workspaceId` to the default workspace. Delete the workspace document. | Default workspace cannot be deleted. Non-default workspace deletion moves orphaned records to default. |
| 12.5 | `functions/src/index.ts` | Create callable `linkMetaAccountToWorkspace({ workspaceId, metaAdAccountId, metaAdAccountName })`. Verifies the user has a valid Meta OAuth token. Verifies the ad account exists in their connected accounts. Writes `metaAdAccountId` and `metaAdAccountName` to the workspace document. | After linking, workspace doc has the Meta ad account fields. Generations from this workspace use this ad account for Meta push. |
| 12.6 | `src/components/WorkspaceSettingsModal.tsx` | Add "Meta Ad Account" section. Show a dropdown of the user's connected Meta ad accounts (from `metaService.getConnection()`). Selecting one calls `linkMetaAccountToWorkspace`. Show current linked account name if already set. Add "Disconnect" button that calls `updateWorkspace({ metaAdAccountId: null })`. | User can link and unlink a Meta ad account per workspace. |
| 12.7 | `functions/src/index.ts` | In all generation Cloud Functions (`generateHooks`, `generateConcepts`, `generateImage`, `generateCaption`), read `activeWorkspaceId` from request payload. Write `workspaceId` to the generation record. When pushing to Meta Ads API, use the workspace's `metaAdAccountId` instead of the user-level default. | Generation records have `workspaceId`. Meta push uses workspace-specific ad account. |
| 12.8 | `src/components/WorkspaceSwitcher.tsx` | Add a workspace switching guard: if user is mid-generation (any step beyond Step 1 has data), show a confirmation dialog: "Switching workspace will start a new project. Save current work?" with "Save & Switch" and "Discard & Switch" buttons. "Save & Switch" triggers `saveProjectToDB` before switching. | Switching mid-generation shows confirmation. Current work is not silently lost. |
| 12.9 | `functions/src/index.ts` | Create callable `getWorkspaceGenerations({ workspaceId, limit?, cursor? })`. Returns generations from the `generations` collection where `workspaceId == workspaceId` AND (`userId == auth.uid` OR user is team member of the workspace owner). Paginated with cursor. | Team members see generations from their team's workspace. Non-team members cannot access other users' workspace generations. |
| 12.10 | `src/pages/Team.tsx` | Add workspace access section per team member. Show checkboxes for which workspaces each member can access. Store as `workspaceAccess: string[]` on the team member record. Members only see workspaces they have access to in the switcher. Owner sees all. | Team owner can restrict member access to specific workspaces. Members only see permitted workspaces. |
| 12.11 | `src/components/WorkspaceSwitcher.tsx` | Filter `workspaces` array by user's `workspaceAccess` if `billingState.isTeamMember === true`. Team owners see all workspaces unfiltered. | Team member sees only workspaces they have access to. Owner sees all. |
| 12.12 | `functions/src/contractFixtures.test.ts` | Add workspace fixture tests: (a) `createWorkspace` blocked below Scale plan, (b) `deleteWorkspace` blocked for default workspace, (c) `linkMetaAccountToWorkspace` blocked for unconnected ad account, (d) generation record includes `workspaceId` when `activeWorkspaceId` is passed. | All four tests pass. |

---

## Phase 13 — Saved Projects
**Requires:** Phase 10 complete (favorites + workspace scoping).

**What already exists:**
- `SavedProject` interface with 20+ fields: `id, userId, name, workspaceId, timestamp, inputs, phase, tovText, conceptsText, selectedTov, selectedConcept, buildPlan, mockupHistory, historyIndex, resolvedUniverse, captionText, batchCaptions, batchResults`.
- `saveProjectToDB(project)` — saves to IndexedDB.
- `saveProjectToFirestore(userId, project)` — saves to `users/{uid}/projects` subcollection.
- Auto-save on draft creation with `📝` prefix.
- `loadProject(p)` — restores full application state from a SavedProject.
- Cloud + local merge on login: fetches from Firestore, merges with IndexedDB, deduplicates.
- Legacy mode sanitizer strips deleted modes on load.

**What is missing:**
- No rendered image thumbnail on project cards — project list shows name + date only.
- No step-by-step navigation within a saved project — loading always jumps to the last active phase.
- No "resume from Step 2" — user must re-navigate manually after load.
- No project search or filter by workspace/status.
- No project deletion with confirmation.
- No distinction between "completed" and "in-progress" projects.

| # | File | Action | Done when |
|---|---|---|---|
| 13.1 | `src/types.ts` | Add `thumbnailUrl?: string` and `status: 'draft' \| 'rendered' \| 'published'` to `SavedProject` interface. `draft` = no render yet. `rendered` = has at least one mockupHistory entry. `published` = pushed to Meta. | Interface has both new fields. |
| 13.2 | `src/App.tsx` | In `saveProjectToDB` and `saveProjectToFirestore`, compute `status` before saving: if `mockupHistory.length > 0`, set `rendered`. If Meta push succeeded (check for `metaAdId` field), set `published`. Otherwise `draft`. **Enforce project limit:** before saving a NEW project (not updating existing), check `billingState.plan` against `planconfig[plan].savedProjectLimit`. If at limit, show inline error: "You've reached the [N]-project limit on your [Plan] plan. Upgrade to save more." Block the save. | Every saved project has correct status. Project limit is enforced per plan. |
| 13.3 | `src/App.tsx` | After a successful render (Step 4 complete), take the first `mockupHistory[0].url` and persist it as `thumbnailUrl` on the project. If it's a base64 data URL, upload to Firebase Storage under `users/{uid}/thumbnails/{projectId}.jpg` and store the download URL. | Rendered projects have a `thumbnailUrl` that resolves to an actual image. |
| 13.4 | `src/App.tsx` | In the project list panel, render `thumbnailUrl` as a 64×64 image thumbnail next to each project name. Show a placeholder icon for `draft` projects (no thumbnail). Show a colored status badge: gray for draft, green for rendered, blue for published. | Project list shows image thumbnails for rendered projects and status badges for all. |
| 13.5 | `src/App.tsx` | Add a step indicator bar inside each project card showing steps 1–5 as dots. Filled dots = steps with data (e.g., `inputs` filled = Step 1 done, `tovText` filled = Step 2 done, `buildPlan` filled = Step 3 done, `mockupHistory.length > 0` = Step 4 done, `captionText` filled = Step 5 done). Clicking a filled dot navigates directly to that step after loading the project. | User sees which steps are complete. Clicking Step 3 dot loads project and navigates to Step 3. |
| 13.6 | `src/App.tsx` | In `loadProject`, add optional `targetPhase` parameter. If provided, after restoring state, set `currentStep` to the target phase instead of the project's saved `phase`. Validate that the target phase has data (don't allow jumping to Step 4 if no build plan exists). | `loadProject(project, 'step3')` loads the project and opens Step 3. Invalid target phase is ignored. |
| 13.7 | `src/App.tsx` | Add project search bar above the project list. Filter projects by name (case-insensitive substring match). Add workspace filter dropdown that shows only projects matching the selected workspace. Add status filter tabs: All / Draft / Rendered / Published. | Typing in search filters the list. Workspace dropdown filters by workspace. Status tabs filter by status. |
| 13.8 | `src/App.tsx` | Add "Delete Project" button (trash icon) on each project card. On click, show confirmation dialog: "Delete '[project name]'? This cannot be undone." On confirm, delete from IndexedDB via `deleteProjectFromDB(id)`, delete from Firestore via `deleteDoc(doc(db, 'users', uid, 'projects', id))`, and delete thumbnail from Storage if exists. Remove from local state. | Deleting a project removes it from all storage backends. It no longer appears in the list. |
| 13.9 | `src/App.tsx` | Implement continuous auto-save with 30-second debounce. After any state change in Steps 1–5 (form input, hook selection, concept selection, render complete, caption edit), queue a save. Debounce to prevent excessive writes. Show a subtle "Saving..." indicator in the header during save, then "Saved" with a checkmark for 2 seconds. | Changing a form field triggers auto-save within 30 seconds. Indicator shows save status. |
| 13.10 | `functions/src/index.ts` | Create callable `getUserProjects({ workspaceId?, status?, limit?, cursor? })`. Queries `users/{uid}/projects` with optional filters. Returns paginated results ordered by `timestamp` descending. For team members, also queries team owner's projects scoped to their accessible workspaces. | Callable returns filtered, paginated project list. Team members see shared workspace projects. |

---

## Phase 14 — RAG + Meta Reporting Feedback Loop
**Requires:** Phase 7 (failure classification) + Phase 8 (billing) complete.

**What already exists:**
- `creativeMemory.ts` (432L) — full memory record schema with performance scores. `storeCreativeMemory()` writes record. `updateCreativePerformance()` accepts CTR/CPC/ROAS and recalculates composite score. Index aggregation by dimension combinations.
- `rankingEngine.ts` (520L) — scoring with CTR (40%), CPC (30%), ROAS (30%) against benchmarks. `getTopPerformers()`, `getPatternInsights()`.
- `recommendationTracking.ts` (292L) — tracks AI recommendation acceptance/rejection rates.
- `metaService.ts` — OAuth popup flow, account picker, connection status.
- `variantEngine.ts` — structured A/B variant generation.
- `patternSummaries.ts` (542L) — natural-language creative pattern summaries.

**What is missing:**
- No `metaDailySync` scheduled function — Meta Insights API is never actually called.
- No feedback loop: performance data from Meta never flows back into generation prompts.
- No per-mode RAG context injection — `creativeMemory` records exist but are not queried during generation.
- No pattern summary refresh on schedule.

| # | File | Action | Done when |
|---|---|---|---|
| 14.1 | `functions/src/index.ts` | Create scheduled function `metaDailySync` (runs daily at 03:00 UTC). For each user with `metaConnected: true` in their user doc: (1) refresh Meta access token if expiring, (2) call Meta Insights API for each connected ad account to fetch last 7 days of ad-level metrics (CTR, CPC, CPM, ROAS, spend, impressions, clicks), (3) match each ad to a generation record using `output.metaAdId`, (4) call `updateCreativePerformance(generationId, metrics)` from `creativeMemory.ts`. | After scheduled run, generation records with `metaAdId` have updated `performance` fields with real Meta data. |
| 14.2 | `functions/src/metaInsights.ts` | Create this file. Export `fetchAdInsights(accessToken, adAccountId, dateRange): Promise<AdInsight[]>`. Calls Meta Marketing API `GET /{adAccountId}/insights` with fields `impressions, clicks, ctr, cpc, cpm, spend, actions` and breakdowns by `ad.id`. Parse response into `AdInsight` objects. Handle pagination with `after` cursor. Handle rate limits with exponential backoff. | Function returns array of `AdInsight` objects for all ads in the account for the date range. |
| 14.3 | `functions/src/metaInsights.ts` | Export `matchInsightToGeneration(adId, userId): Promise<string \| null>`. Queries `generations` collection where `userId == userId` AND `output.metaAdId == adId`. Returns the generationId if found, null otherwise. | Function returns correct generationId for a known adId. Returns null for unknown adId. |
| 14.4 | `functions/src/creativeMemory.ts` | Add function `getRAGContext(userId, inputs: { hookAngle?, mode?, dialect?, styleFamily?, subStyle? }): Promise<RAGContext>`. Queries the user's `creativePatterns` indexes to find: (1) top 3 performing combinations matching the current inputs, (2) bottom 3 performing combinations to avoid, (3) pattern insights as natural language. Returns `{ topPerformers, avoid, insights, sampleSize }`. If `sampleSize < 10`, return `{ insufficient: true }` to skip RAG injection. | Function returns relevant performance context filtered by current generation inputs. Returns insufficient flag when data is sparse. |
| 14.5 | `functions/src/generators.ts` | In `generateHooks()`, before calling the AI model, call `getRAGContext(userId, { hookAngle, dialect })`. If RAG context is sufficient, inject a `PERFORMANCE_CONTEXT` block into the prompt: "Based on this user's historical ad performance data, these hook patterns performed best: [topPerformers]. These patterns underperformed: [avoid]. Insights: [insights]. Use this to inform — but not rigidly copy — the hooks you generate." | Hook generation prompt includes real performance context when available. Prompt is unchanged when data is insufficient. |
| 14.6 | `functions/src/generators.ts` | In `generateBuildPlan()`, before calling the AI model, call `getRAGContext(userId, { mode, styleFamily, subStyle })`. Inject `PERFORMANCE_CONTEXT` block with top-performing visual compositions and avoid list. Focus on layout, color, and compositional patterns rather than copy. | Build plan prompt includes visual performance context when available. |
| 14.7 | `functions/src/generators.ts` | In `generateCaption()`, call `getRAGContext(userId, { hookAngle, dialect, mode })`. Inject `PERFORMANCE_CONTEXT` with top-performing caption structures (length, CTA style, emoji usage patterns). | Caption prompt includes performance-informed structural guidance when available. |
| 14.8 | `functions/src/creativeMemory.ts` | Add function `refreshPatternSummaries(userId): Promise<void>`. Recalculates all `creativePatterns/{userId}/indexes/*` aggregation documents from the raw `creativeMemory` records. Called by `metaDailySync` after all performance updates are written. | After refresh, pattern index documents reflect the latest performance data. |
| 14.9 | `functions/src/index.ts` | In every generation Cloud Function output handler (after hooks, concepts, render, caption), call `storeCreativeMemory()` with the full generation inputs + outputs. This ensures the memory store grows even before Meta performance data arrives. | Every successful generation creates a memory record. Records exist even for users who never connect Meta. |
| 14.10 | `src/components/PerformanceDashboard.tsx` | Add "Sync Now" button that calls a new callable `triggerMetaSync()`. This runs the same logic as `metaDailySync` but for the current user only. Show last sync timestamp from user doc `lastMetaSyncAt`. Disable button if synced within the last hour. | User can manually trigger a Meta sync. Button disables for 1 hour after sync. |
| 14.11 | `src/components/PerformanceDashboard.tsx` | Add "What's Working" section that displays `getPatternInsights()` results as natural-language cards. Show top performers grouped by dimension (best hook angle, best mode, best dialect, best time of day). Show recommendations panel with "Use these patterns in your next generation" CTA that pre-fills Step 1 inputs with top-performing settings. | Dashboard shows pattern insights. Clicking CTA navigates to Step 1 with pre-filled inputs. |
| 14.12 | `functions/src/contractFixtures.test.ts` | Add RAG fixture tests: (a) `getRAGContext` with 15+ memory records returns non-empty `topPerformers`, (b) `getRAGContext` with 3 records returns `{ insufficient: true }`, (c) `storeCreativeMemory` creates a record with all required fields, (d) `refreshPatternSummaries` updates index documents. | All four tests pass. |

---

## Phase 15 — Brand Colors
**Requires:** Phase 5 complete (build plan pipeline).

**What already exists:**
- `generators.ts` injects `brandColorPrimary` and `brandColorSecondary` as hex values into both the hook-level and concept-level prompts (lines 1049–1111, 2106–2111).
- Anti-placeholder guard: prompt includes "NEVER write placeholder text like [brand color] — only exact hex values."
- Three concept diversity rules for brand color usage: (1) accent color pops, (2) dominant background, (3) environment tones.
- `Workspace` interface stores `brandColorPrimary` and `brandColorSecondary`.
- `textCompositing.ts` uses colors for text rendering but does not read brand colors from workspace — uses colors from the build plan's `colorPalette`.

| # | File | Action | Done when |
|---|---|---|---|
| 15.1 | `functions/src/generators.ts` | In carousel generation flow (`generateCarouselSlides`), pass `brandColorPrimary` and `brandColorSecondary` to EVERY slide's build plan prompt, not just slide 1. Add a carousel-specific color instruction: "CRITICAL: Maintain brand color consistency across all carousel slides. Primary brand color {hex} must appear in every slide (CTA button, accent, or heading highlight). Secondary color {hex} used as supporting accent. This creates visual cohesion when swiping." | Every carousel slide's prompt contains both brand colors and the carousel consistency instruction. |
| 15.2 | `functions/src/generators.ts` | In batch generation flow, add a batch-wide color instruction prepended to each batch item's prompt: "This is part of a batch of [N] ad variations. All variations MUST use the same brand color palette anchored by primary {hex} and secondary {hex}. Vary composition and messaging, NOT the color scheme." | Every batch item's prompt includes the batch color consistency instruction with actual hex values. |
| 15.3 | `functions/src/generators.ts` | In retargeting generation, add brand color inheritance: read the original cold ad's `brandColorPrimary` and `brandColorSecondary` from the linked generation record (via `retargetingSourceId`). If the retargeting request does not provide brand colors, inherit from the cold ad. Add to prompt: "This retargeting ad targets users who saw the original cold ad. Use the same brand colors (Primary: {hex}, Secondary: {hex}) for visual recognition and brand recall." | Retargeting ads inherit brand colors from the original cold ad when not explicitly provided. |
| 15.4 | `functions/src/textCompositing.ts` | Read `brandColorPrimary` from the generation record's inputs (not just the build plan's parsed `colorPalette`). Use brand primary as the default CTA button background color. Use brand secondary as the default headline accent color. Fall back to build plan colors only if brand colors are not set. | CTA buttons use brand primary color. Headlines use brand secondary. Non-branded generations fall back to AI-chosen colors. |
| 15.5 | `src/components/InputForm.tsx` | Add brand color preview swatches next to the brand color picker inputs. Show a mini-preview card with two rectangles showing how the colors will appear together (primary as background, secondary as accent). Auto-populate from active workspace's brand colors if set, with "Using workspace colors" label. Allow override per-generation. | Color swatches render next to the pickers. Workspace colors auto-fill with label. Override is possible. |
| 15.6 | `functions/src/creativeScoringEngine.ts` | Add brand color compliance check to the scoring engine. After rendering, extract the dominant colors from the rendered image (use a lightweight color extraction — quantize to top 5 colors). Check if `brandColorPrimary` hex is within a ΔE < 15 tolerance of any dominant color. If not, flag `brandColorMissing: true` on the generation record and deduct 10 points from creative score. | Rendered images missing brand colors are flagged and scored lower. |
| 15.7 | `functions/src/contractFixtures.test.ts` | Add brand color fixture tests: (a) carousel prompt for slide 3 contains brand color hex values, (b) batch item 2 prompt contains batch color consistency instruction, (c) retargeting generation inherits brand colors from cold ad source, (d) scoring engine flags missing brand color. | All four tests pass. |

---

## Phase 16 — Creative Modes & Art Direction QA
**Requires:** Phase 1 + Phase 3 + Phase 5 complete.

**What already exists:**
- All 10 creative modes in `creativeResolver.ts` with compatibility rules, required elements, and validation.
- Mode pairs per tab (Section 2.3) with layout keys.
- Art direction adapt states (Section 11) for 8 explicit combinations.
- `offerCreativeModes.ts` knowledge file (586L) with per-mode prompt guidance.
- `layoutContract.ts` (746L) and `layoutTemplates.ts` (701L).
- `modeFieldSchema.ts` (995L server / 689L client).
- `contractFixtures.test.ts` (839L) with existing QA fixtures.

| # | File | Action | Done when |
|---|---|---|---|
| 16.1 | `functions/src/contractFixtures.test.ts` | Add one fixture per solo creative mode (10 modes) × single format. Each fixture provides exact input JSON and asserts: (a) resolver returns `allowed: true`, (b) build plan prompt contains the mode's required composition language (from `CREATIVE_MODE_CATALOG[mode].validity.requiredElements`), (c) layout contract has correct zone structure. | 10 solo-mode fixture tests pass. |
| 16.2 | `functions/src/contractFixtures.test.ts` | Add one fixture per approved mode pair (13 pairs from Section 2.3). Each fixture asserts: (a) resolver allows the pair, (b) layout contract has zones for BOTH modes (e.g., `hero_ticket` has `heroZone` and `ticketZone`), (c) build plan prompt contains composition language for both modes. | 13 mode-pair fixture tests pass. |
| 16.3 | `functions/src/contractFixtures.test.ts` | Add one fixture per blocked combination (`before_after` + any, `text_only` + any). Each asserts resolver returns `allowed: false` with correct `reason` string. | Blocked combination tests pass (at least 4). |
| 16.4 | `functions/src/contractFixtures.test.ts` | Add carousel-specific mode fixtures: (a) `value_stack` + carousel — slide count auto-adjusted to gift count + 2, (b) `testimonial_carousel` — slide count = testimonial count + 2, (c) `webinar_screen` + carousel — each slide has webinar composition, (d) `standard_hero` + carousel — slide 1 has hero, slides 2+ have narrative progression. | All 4 carousel-mode fixture tests pass. |
| 16.5 | `functions/src/contractFixtures.test.ts` | Add batch-specific mode fixtures: (a) `standard_hero` + batch — each batch item has independent hook but same layout, (b) `speaker_card` + batch — each item has speaker composition, (c) `value_stack` + batch — each item has stack zone. Assert all N batch items' prompts contain the correct mode composition language. | All 3 batch-mode fixture tests pass. |
| 16.6 | `functions/src/contractFixtures.test.ts` | Add retargeting-specific mode fixtures: (a) `standard_hero` + retargeting single — prompt contains objection-answering language + hero composition, (b) `event_ticket` + retargeting carousel — each slide addresses sequential objection with ticket composition. | Both retargeting-mode fixture tests pass. |
| 16.7 | `functions/src/contractFixtures.test.ts` | Add art direction adapt state fixtures for 8 explicit combinations from Section 11. Each fixture asserts the build plan prompt contains the adapt state's specific composition override (e.g., `luxury_magazine` + `value_stack` → prompt contains "magazine cover sidebar" and "gold accent prices"). | All 8 adapt state fixture tests pass. |
| 16.8 | `functions/src/generators.ts` | Audit `getPairRenderExecution()` function. Verify it handles all 13 approved pairs and returns non-empty composition guidance for each. Add missing pairs if any return empty string. | `getPairRenderExecution` returns non-empty guidance for all 13 approved pairs. |
| 16.9 | `functions/src/generators.ts` | Add mode validation in `generateImage()`: after the build plan is generated, parse the `TECHNICAL_PROMPT` and verify it contains at least one keyword from each active mode's `requiredElements`. If missing, log a `mode_composition_missing` warning on the resolution trace and add a reinforcement line to the image prompt: "CRITICAL: This ad MUST include [missing element]. Do not omit it." | Missing mode elements trigger reinforcement. Resolution trace logs the warning. |
| 16.10 | `functions/src/creativeResolver.ts` | Add function `validateModeFormatCombination(modes: string[], adFormat: 'single' \| 'carousel' \| 'batch', campaignType: 'cold' \| 'retargeting'): { valid: boolean, reason?: string }`. Encodes all the implicit rules: `before_after` is single-only, `text_only` is mutually exclusive, `testimonial_carousel` forces carousel, batch = single × N (all single-compatible modes work). | Function returns correct valid/invalid for all tested combinations. |
| 16.11 | `src/components/InputForm.tsx` | When user selects a creative mode, call `validateModeFormatCombination` with current `adFormat` and `campaignType`. If invalid, show inline message below the mode card explaining the conflict (from `reason` field) and prevent generation. | Invalid mode+format combos show inline error. Generate button is disabled. |

---

## Phase 17 — Resize & Reflow
**Requires:** Phase 5 + Phase 15 complete (pipeline + brand colors).

**What already exists:**
- Reflow logic in `generators.ts` (line 4913+): sends `REFLOW: Ratio {ratio}` instruction to re-render same concept at new aspect ratio.
- Aspect ratios 1:1, 4:5, 3:4, 4:3, 9:16, 16:9 all defined and selectable.
- Safe zone inset referenced in `textCompositing.ts`.
- Layout contract system defines zone proportions per aspect ratio.
- `mockupHistory` on SavedProject stores `{ url, ratio }` pairs.

**What is missing:**
- No batch reflow (all N images).
- No carousel per-slide reflow.
- No safe-zone re-validation after reflow.
- No reflow preview before committing.
- No text compositing re-run after reflow.
- No reflow in retargeting mode.

| # | File | Action | Done when |
|---|---|---|---|
| 17.1 | `functions/src/generators.ts` | In the reflow path (around line 4920), after the reflow image is generated, re-run `compositeArabicText()` with the new aspect ratio's safe zone dimensions. Store the clean (pre-text) reflowed image separately as `cleanReflowedImageBase64` before text compositing. | Reflowed images have fresh text overlay positioned for the new ratio. Clean version is stored for future edits. |
| 17.2 | `functions/src/generators.ts` | Add function `reflowBatch(generationId, newAspectRatio): Promise<BatchReflowResult[]>`. Iterates over all `batchResults` in the generation record. For each batch item, runs the reflow pipeline (same concept, new ratio). Uses `Promise.allSettled` for parallel execution. Updates each batch item's URLs in the generation record. Returns per-item success/failure. | Calling with a batch generationId and `4:5` reflows all batch items. Partial failures don't block successful reflows. |
| 17.3 | `functions/src/generators.ts` | Add function `reflowCarousel(generationId, newAspectRatio): Promise<CarouselReflowResult[]>`. Iterates over all carousel slides in `output.carouselSlides`. For each slide, runs reflow with the new ratio. Maintains slide order. Updates all slide URLs. | Calling with a carousel generationId reflows all slides. Slide order is preserved. |
| 17.4 | `functions/src/index.ts` | Create callable `reflowImage({ generationId, newAspectRatio, scope })`. `scope` is `'single' \| 'batch_all' \| 'carousel_all' \| 'carousel_slide'`. For `single`: reflow the single image. For `batch_all`: call `reflowBatch`. For `carousel_all`: call `reflowCarousel`. For `carousel_slide`: reflow only the specified slide index. Deduct credits per reflowed image. | Callable handles all four scopes. Credits are deducted correctly (1 per image reflowed). |
| 17.5 | `functions/src/layoutContract.ts` | Add function `getSafeZoneForRatio(aspectRatio: AspectRatio): { top, right, bottom, left }`. Returns the safe zone inset in percentage for each supported ratio. Taller ratios (9:16) get larger top/bottom insets. Wider ratios (16:9) get larger left/right insets. Square (1:1) uses uniform inset. | Function returns correct insets for all 6 supported ratios. |
| 17.6 | `functions/src/textCompositing.ts` | After reflow, call `getSafeZoneForRatio(newAspectRatio)` and re-calculate all text positions. Validate that no text element exceeds the new safe zone boundaries. If any text overflows, reduce font size by 10% increments until it fits (maximum 3 reductions). Log `textReflowOverflow: true` on the resolution trace if reduction was needed. | Text never clips outside safe zone after reflow. Font size reduction is logged. |
| 17.7 | `src/App.tsx` (or Step 4 UI component) | Add "Resize" button group in Step 4 output area. Show 6 ratio buttons (1:1, 4:5, 3:4, 4:3, 9:16, 16:9). Current ratio is highlighted. Clicking a different ratio calls `reflowImage` callable. For batch/carousel modes, show a scope selector: "Resize this image only" vs "Resize all [N] images". Show loading state per image during reflow. | User can click a ratio button and see the reflowed result. Batch/carousel scope selector appears in those modes. |
| 17.8 | `src/App.tsx` (or Step 4 UI component) | Add reflow preview: before committing a reflow (spending credits), show a lightweight CSS-based preview of how the current image would crop/extend at the new ratio. Use CSS `object-fit: cover` with the target aspect ratio container to simulate the framing. Show "This is a preview — generate to see the final result" label. Preview costs 0 credits. | Clicking a ratio shows instant CSS preview. "Generate" button commits the reflow and deducts credits. |
| 17.9 | `functions/src/generators.ts` | In the reflow prompt, add brand color reinforcement: "Maintain the exact same brand color palette (Primary: {hex}, Secondary: {hex}) in the reflowed composition. Do not shift colors or introduce new dominant tones." Read brand colors from the generation record's original inputs. | Reflowed images maintain brand colors. Prompt includes hex values. |
| 17.10 | `functions/src/contractFixtures.test.ts` | Add reflow fixture tests: (a) single reflow from 1:1 to 9:16 returns new image URL with `aspectRatio: '9:16'`, (b) batch reflow with 4 items returns 4 results, (c) carousel reflow maintains slide count, (d) text compositing after reflow has no overflow (or logged reduction), (e) brand colors are present in reflow prompt. | All 5 tests pass. |

---

*Source: `creativeResolver.ts` · `generators.ts` · `entitlements.ts` · `artDirectionConfig.ts` · `retargetingObjections.ts` · `constants.ts` · `types.ts` · `index.ts` · `falEditing.ts` · `MagicSelector.tsx` · `WorkspaceSwitcher.tsx` · `creativeMemory.ts` · `rankingEngine.ts` · `metaService.ts` · `billingState.ts` · `textCompositing.ts` · `layoutContract.ts` · terminal session decisions · product owner decisions v4 · codebase audit April 11, 2026*
