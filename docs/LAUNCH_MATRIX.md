# Pro Ads AI — Launch Matrix
## Single Source of Truth for Launch Scope, Approved Combinations, and Behavior Contracts

> **Authority**: This file overrides all older behavior assumptions, the Compatibility Matrix v2, and the ChatGPT master plan for launch scope.
> Where this file and any other document disagree, this file wins.
> Last updated: v5 — v4 + Copy System (Phase 22 copy quality, Phase 23 conditional structure). Codebase audit April 11, 2026.

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
| Billing provider | **Stripe** for payment processing (Checkout Sessions, Customer Portal, subscriptions). GHL stays as CRM — receives post-payment webhooks from Firebase for automations (welcome email, dunning, tags). Flow: Stripe Checkout → Stripe webhook → Firebase → update user + notify GHL. **NOTE:** Phase 8 implementation diverged from this spec and used Paddle. Migration to Stripe handled in Phase 21. |
| Magic Edit engine | **Gemini image edit endpoint** with Box A reference for face fidelity. Lasso selection → mask → edit prompt → Gemini → text re-composite. FLUX/`falEditing.ts` deleted in HOTFIX-G. |
| Magic Edit scope | Single, batch (apply-to-all), carousel (per-slide). Undo stack of 10. Modes: erase, add object, style/color change, environment replacement. Text edits handled by textCompositing only — never sent to Gemini edit. |
| Workspace Meta linking | Each workspace has its own `metaAdAccountId`. Generations from that workspace push to that account. Team members see only workspaces they have access to. |
| Saved project navigation | Step-by-step dot navigator. User can click any completed step to resume from there. Thumbnail from first render persisted. Status: draft / rendered / published. |
| RAG feedback loop | `metaDailySync` pulls Meta Insights API daily. Performance data (CTR/CPC/ROAS) feeds back into generation prompts via `getRAGContext()`. Minimum 10 records before RAG injection activates. |
| Brand color enforcement | Brand colors injected per-slide in carousel, per-item in batch, inherited from cold ad in retargeting. Text compositing uses brand primary for CTA, brand secondary for headlines. |
| Resize / reflow | Reflow available for single, batch (all N), carousel (all slides). Text compositing re-runs after reflow with safe-zone re-validation. CSS preview costs 0 credits. |
| Plan structure | **3 plans only**: Starter ($29/mo), Pro ($79/mo), Scale ($179/mo). The Creator plan has been removed. All references to "Creator" or 4-plan structure are obsolete. Annual billing is **20% off** (Starter $23.20/mo, Pro $63.20/mo, Scale $143.20/mo when billed annually). |
| Feature gating philosophy | All creative engine features (hook angles, hook types, ad tones, copywriting strategies, creative modes) are **fully ungated on ALL plans** including Starter. Gating applies only to: production features (batch, carousel, retargeting, Meta push, creative memory), visual premium features (fantasy universes, art direction, reference ad, auto-optimized creatives), and intelligence features (predictive CTR, variant exploration, smart recommendations, multi-brand workspaces). |
| Carousel slide limits | Pro: up to 7 slides. Scale: up to 10 slides. (Previously Pro: 2–5, Scaling: 2–9.) |
| Batch generation | **Pro gets batch** (limited: up to 4 ads/run = 1 size × 2 hooks × 2 concepts). **Scale gets full batch** (up to 36 ads/run = 3 sizes × 4 hooks × 3 concepts). Batch is no longer Scale-only. |
| Saved project limits | Starter: 10. Pro: 30. Scale: Unlimited. |
| Audience Avatars | Reusable brand profiles that pre-fill the form. Starter: 5. Pro: 15. Scale: Unlimited. |
| Authentication method | **Email + password only**. Google sign-in removed entirely to prevent email mismatch with Stripe. Login page has Login / Create Account tabs on the same page. New account creation checks Firestore for existing Stripe payment — if found, user enters app with trial active. If not found, billing modal opens. |
| Cultural compliance | **Arabic ads enforce Islamic cultural guardrails.** Universes with alcohol (wine cellars, bars, cigar lounges) are hidden for Arabic languages. Visual motifs sanitized (cocktails → premium beverages, champagne → sparkling drinks). Cultural compliance prompt block injected into build plan + final image prompt. Wardrobe modesty rules enforced. Post-generation validation catches and replaces leaked haram terms. English ads are unaffected. |
| Logo upload limit | **Box B accepts up to 5 logos.** First logo is primary (most prominent placement). Additional logos render as secondary brand elements (corner badges, supporting surfaces). Prompts instruct hierarchical logo placement. |
| Multi-hero | **Up to 5 distinct people** per ad. Each hero group has its own photo set and role (Primary / Supporting / Client-testimonial / Speaker). **Two render pipelines:** 1–3 people use single-pass rendering with face reinforcement prompts. 4–5 people use multi-pass pipeline — render scene with placeholders first, then insert each face individually with only their own reference (eliminates Gemini face hallucination). `before_after` remains single-hero only. **Photo caps:** 1 person → up to 5 photos. 2–3 people → up to 3 each. 4–5 people → up to 2 each. **Credit cost scales:** base + 1 credit per additional person beyond the first. UI shows live credit preview as user adds people. Backward compatible — single hero is the default. |
| Logo rendering | **Hybrid — mode-per-placement.** Build plan assigns each logo a mode: `ui` (post-composited via Sharp for pixel-perfect corner/badge placement) or `environmental` (Gemini renders as physical object in scene — logo on mug, laptop lid, wall art, t-shirt, signage). AI picks mode based on creative style. **Absolute ban:** no logos, text, charts, or dashboards on any device screen (laptop/monitor/tablet/phone). Screens stay blank or abstract only. |
| Aspect ratio reflow | **Deterministic two-method reflow.** Small ratio change (<30%) → outpaint-only (extends margins, locks hero/text). Large ratio change → re-render from original build plan at new ratio. No more generative reflow that stretches faces. Auto-routing with user override. |
| Direct-response design primitives | **6 new enforced rules:** (1) `heroGaze` field directs subject's eyes at headline or CTA, (2) max ONE highlighted element per ad, (3) `priceIsHook` toggle for price-shock creatives, (4) CTA outcome framing required (no generic "join/register"), (5) `visualPromiseMapping` scores hook↔visual alignment, (6) campaign coherence inherits palette/environment from prior ads in same project. |
| Concept differentiation | **Two hidden backend stages + one hidden checker.** Concept Director (GPT-5, runs 3× sequential per batch) produces specialized brief per ad with explicit visual metaphor, headline architecture, forbidden props, gaze direction. Variance Validator (deterministic, no AI) blocks duplicate metaphor/layout/headline tokens with max 1 retry. Selection Reviewer (Gemini 2.5 Flash) catches strong incoherences in user brief BEFORE generation. All three are fail-open — pipeline runs unchanged on error. Remote Config kill switch. Per-user feature flag. **Engineering names** (Concept Director, Variance Validator, Selection Reviewer) NEVER appear in UI. **User-facing names**: "Brief Coherence Check" (live banner) + "Variance Mode" (workspace toggle: Balanced/Aggressive). |
| FLUX deletion | `falGeneration.ts` and `falEditing.ts` are orphaned dead code (zero imports). Deleted in HOTFIX-G. Magic Edit (Phase 11) migrated to Gemini's edit endpoint. |

---

## SECTION 0.5 — IMPLEMENTATION STATUS DASHBOARD

> **Last updated:** Cross-referenced against Eslam's specs folder (Speckit). Status is confirmed when the matching `specs/NNN-spec-name/` folder exists and was implemented.

### ⚠️ Needs Re-Verification After Phase 21

These phases were marked Done against the old Paddle-backed billingState. They likely still work after Phase 21 ships (the field names matter, the behavior doesn't), but each needs a smoke test against the new Stripe-backed billingState before marking truly Done.

| Phase | What to re-verify |
|---|---|
| Phase 9 — Team Management | `isTeamOwner`, `isTeamMember`, `maxTeamMembers` populate correctly from Stripe billingState. Team invite flow works end-to-end. |
| Phase 10 — Favorites & Workspace | Workspace scoping works. Team members see shared favorites. |
| Phase 12 — Workspace Logic | `createWorkspace` rejects below-Scale plans correctly. Meta ad account linking works. |
| Phase 13 — Saved Projects | Per-plan project limits enforced (10/30/Unlimited). Status filter works. |

### ✅ Done (22 items)

| Item | Spec folder | Notes |
|---|---|---|
| Phase 1 — Resolver Foundation | `001-resolver-completeness-trace` | |
| Phase 2 — Frontend Enforcement | `002-frontend-filter-qa` | |
| Phase 3 — QA Fixtures | `003-qa-fixtures` | |
| Phase 4 — Testimonial Carousel | `004-testimonial-carousel` | |
| Phase 5 — Blueprint → Render Pipeline | `005-render-prompt-pipeline` | |
| Phase 6 — Language Quality Contracts | `008-lang-quality-contracts` | |
| Phase 7 — Failure Classification | `007-failure-classification` | |
| Phase 9 — Team Management | `006-team-management` | |
| Phase 10 — Favorites & Workspace | `010-favorites-workspace` | |
| Phase 12 — Workspace Logic | `012-workspace-logic` | |
| Phase 13 — Saved Projects | `013-saved-projects` | |
| Phase 15 — Brand Colors | `956-brand-colors` | |
| Phase 16 — Creative Modes QA | `016-creative-modes-qa` | |
| Phase 17 — Resize & Reflow | `017-resize-reflow` | Single/batch/carousel reflow; 3 ratio buttons (Square/Portrait/Story); server-side render upload (admin SDK); direct image source for reflow. |
| HOTFIX (plan alignment) | `09.50-hotfix-plan-alignment` | |
| HOTFIX-C (cultural compliance) | `0951-hotfix-cultural-compliance` | |
| HOTFIX-D (multi-logo) | `953-hotfix-multi-logo` | |
| HOTFIX-E (hybrid logo) | `0953-hotfix-hybrid-logo` | |
| HOTFIX-F (aspect reflow) | `955-aspect-reflow` | |
| HOTFIX-G (FLUX cleanup) | `0955-hotfix-flux-cleanup` | Deploy crash fixed via lazy-access pattern. |
| Phase 021 — Stripe Migration | `specs/021-stripe-migration` | Complete |
| Phase 025 — OpenAI gpt-image-2 Swap | `specs/025-openai-swap` | Complete. Replaces Gemini image generation with gpt-image-2 across all render paths. Includes edit-recompose reflow, blueprint bleeding fixes, carousel prompt optimization, and unified ALL VERSIONS gallery. |

### ⏳ TODO — Critical (build first)

| Item | Why critical |
|---|---|
| **Phase 19 — Direct-Response Design Upgrades** | Single biggest paid-traffic conversion lever. Adds gaze direction, one-highlight cap, price hierarchy, CTA outcome framing, hook↔visual alignment, campaign coherence. **Independent of billing — can run in parallel with Phase 21.** |
| **Phase 20 — Concept Director + Brief Coherence Check** | Solves "every ad looks like the same machine made it." User-facing impact: Brief Coherence Check (live banner) + Variance Mode (Balanced/Aggressive). Backend stays hidden. **Depends on Phase 14 (which depends on Phase 21).** |
| **Phase 17 — Resize & Reflow (re-verify)** | Rebuilt in Phase 025 as edit-recompose — needs smoke test verification |
| **Phase 22 — Copy Quality Upgrade** | **NEXT — ready for implementation.** Lifts every on-creative text string: enforces ≤6th-grade reading level, mandates lived-symptom depth (concrete moment, not abstract problem), replaces the hard fake-proof block with a soft user-facing claim flag, and adds a silent GPT-4o-mini scoring + rewrite gate. **Rides the existing copy-fidelity contract — improvements propagate to the rendered image automatically. Independent of billing; can run in parallel with Phase 21.** |
| **Phase 23 — Conditional Copy Structure** | **NEXT — ready for implementation.** Makes the on-creative text *count* conditional (headline-only, headline+proof, diagnostic-only, etc.) instead of forcing 4 fields. Adds the Hook Angle / Hook Type / Awareness taxonomy cleanup, the 8 static / 11 carousel structures, the decision tree, the `creativeTextDirector` module, (23.A) the "Generate 4 More Like This" in-card variation carousel, and (23.B) within-angle dimension/entry rotation + cross-project anti-repetition memory so new projects stop feeling samey (the user's angle lock stays intact). **Depends on Phase 22 (quality rules + scoring must exist first) and Phase 5 (fidelity gate + compositor).** |

### ⏳ TODO — Major

| Item | Why major |
|---|---|
| **Phase 11 — Magic Edit** | Re-spec'd to use Gemini's edit endpoint after HOTFIX-G. User-facing feature: lasso → edit → text re-composite. Pro+ gated. |
| **Phase 14 — RAG + Meta Reporting** | Required by Phase 20 (`pastWinningAds` feeds Concept Director). Daily Meta Insights sync + RAG context injection into prompts. **Blocked until Phase 21 ships** (user data shape may shift). **Priority after Phase 22 and Phase 23.** |
| **Phase 18 — Multi-Hero Support** | Up to 5 distinct people per ad. Required for webinar / mini-course / co-host / summit / speaker-grid use cases. |

### ⏳ TODO — Minor

_(none — Phase 17, the last minor item, shipped 2026-06-01; see ✅ Done above.)_

---

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
| Magic Edit (Gemini edit) | TBD — implemented in Phase 11 using Gemini edit endpoint after HOTFIX-G | Not yet built. Old `falEditing.ts` will be deleted. |
| Magic Selector UI | `src/components/MagicSelector.tsx` (334 lines) | Exists — lasso + erase + style, no add/environment/undo/batch |
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

Phase 8 — Billing: ROLLED BACK (was specified Stripe, implemented Paddle, superseded by Phase 21)

Phase 9 — Team Management (requires Phase 21 to ship billing — was Phase 8 pre-rollback) — done, needs re-verification post-21

HOTFIX — Plan Structure Alignment (requires Phase 9, apply BEFORE Phase 10+)

HOTFIX-C — Cultural Compliance (requires Phase 5, apply BEFORE Phase 10+)

HOTFIX-D — Multi-Logo Upload (no dependency)

HOTFIX-E — Deterministic Logo Compositing (CRITICAL P0)

HOTFIX-F — Deterministic Aspect Ratio Reflow (CRITICAL P0)

HOTFIX-G — FLUX Cleanup (prerequisite for Phase 20)

Phase 10 — Favorites & Workspace (requires Phase 21 — billingState; was Phase 8 pre-rollback)

Phase 11 — Magic Edit (requires Phase 5)

Phase 12 — Workspace Logic (requires Phase 21 + Phase 9 — was Phase 8 + Phase 9 pre-rollback)

Phase 13 — Saved Projects (requires Phase 10)

Phase 14 — RAG + Meta Reporting (requires Phase 7 + Phase 21 — billingState; was Phase 7 + Phase 8 pre-rollback)

Phase 15 — Brand Colors (requires Phase 5)

Phase 16 — Creative Modes QA (requires Phase 1 + Phase 3 + Phase 5)

Phase 17 — Resize & Reflow (requires Phase 5 + Phase 15)

Phase 18 — Multi-Hero Support (requires Phase 5 + Phase 11)

Phase 19 — Direct-Response Design Upgrades (requires Phase 5 + HOTFIX-E + HOTFIX-F)

Phase 20 — Concept Director + Brief Coherence Check (requires Phase 5 + Phase 14 + HOTFIX-G)

Phase 21 — Stripe Migration (CRITICAL — replaces Phase 8, no production users yet, do BEFORE launch)
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
12. **Stripe billing migration complete** (Phase 21). All Paddle code removed. Stripe Checkout, Customer Portal, webhook signature verification, dual-write `pending_plans`, GHL sync all functional. Phases 9, 10, 12, 13 re-verified against new billingState shape.
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
23. Arabic ads: no alcohol, no immodest clothing, no haram elements in any render. Haram universes hidden. Cultural compliance block in every Arabic prompt. English ads unaffected.
24. Box B accepts up to 5 logos with clear primary/secondary hierarchy in prompts.
25. Multi-hero support: 1–5 distinct people. 1–3 people use single-pass rendering. 4–5 people use multi-pass pipeline (scene render + per-hero face insertion) — eliminates face hallucination. Per-person face consistency. Credit cost scales linearly. Live cost preview in UI.
26. Brand logos render via hybrid pipeline: UI-mode logos composited post-render (pixel-perfect), environmental-mode logos rendered by Gemini as physical objects (mug/laptop lid/wall art). No more "SIRM" distortion. Zero fake content on device screens.
27. Aspect ratio reflow preserves subject proportions — outpaint for small changes, full re-render for large changes. No more stretched faces.
28. Direct-response design primitives enforced: gaze direction, one-highlight cap, price hierarchy, CTA outcome framing, hook↔visual alignment, campaign coherence.
29. Three sibling concepts in a batch differ on metaphor + headline architecture + layout (balanced mode) or every axis (aggressive mode). No more "every ad looks the same" output.
30. Brief Coherence Check (live banner + soft-block modal) catches strong selection mismatches before generation. Fires on ~1 in 10 generations. Fail-open on errors.
31. Concept Director, Variance Validator, and Selection Reviewer are fully invisible to users. Engineering names never appear in UI.
32. Remote Config kill switch can disable all new pipeline stages within 60s. Per-user feature flag enables A/B rollout.
33. FLUX (`falGeneration.ts`, `falEditing.ts`) deleted. Magic Edit migrated to Gemini's edit endpoint.

---


## SECTION 14 — BUILD ORDER

> **For AI agents:** This section is self-contained. Do not read other sections to execute tasks.
> Each task is one file, one action, one done condition. Do not break tasks down further.
> Do not create sub-phases. Do not plan. Execute the task, confirm done, move to the next row.

---

### Dependency Map

```
Phase 1  ──► Phase 2  ──► Phase 21 ──► Phase 9  ──► HOTFIX (plan alignment)
         ──► Phase 3                └──► Phase 10
         ──► Phase 4                └──► Phase 12 (Workspace)
         ──► Phase 5

Phase 6   (no dependency — start any time)
Phase 7   (no dependency — start any time)

HOTFIX    requires Phase 9 complete (apply before Phase 10+)
HOTFIX-C  requires Phase 5 complete (apply before Phase 10+, can parallel with HOTFIX)
HOTFIX-D  no dependency — apply any time
HOTFIX-E  requires Phase 5 (pipeline) — CRITICAL P0
HOTFIX-F  requires Phase 5 (pipeline) — CRITICAL P0
HOTFIX-G  no dependency — apply before Phase 20 (FLUX cleanup)
HOTFIX-H  no dependency — final pricing & naming alignment (apply before launch)
Phase 8   ROLLED BACK — see Phase 21 (billingState now sourced from Stripe)
Phase 9   requires Phase 21 (billingState — was Phase 8 pre-rollback). Re-verify after Phase 21 ships.
Phase 10  requires Phase 21 (billingState for team scoping — was Phase 8 pre-rollback). Re-verify after Phase 21 ships.
Phase 11  requires Phase 5 (render pipeline must be stable)
Phase 12  requires Phase 21 + Phase 9 (was built against Phase 8/Paddle — re-verify after Phase 21 ships)
Phase 13  requires Phase 10 (favorites + workspace scoping — billingState comes via Phase 21)
Phase 14  requires Phase 7 + Phase 21 (failure classification + Stripe billing)
Phase 15  requires Phase 5 (build plan pipeline)
Phase 16  requires Phase 1 + Phase 3 + Phase 5
Phase 17  requires Phase 5 + Phase 15 (pipeline + brand colors)
Phase 18  requires Phase 5 + Phase 11 (pipeline + magic edit face consistency)
Phase 19  requires Phase 5 + HOTFIX-E + HOTFIX-F (pipeline + logos + reflow must be stable)
Phase 20  requires Phase 5 + Phase 14 + HOTFIX-G (pipeline + creative memory + FLUX cleanup)
Phase 21  requires nothing in matrix — pre-launch migration, blocks production launch
Phase 22  requires nothing in matrix — copy-quality is a Step-2 prompt + scoring change that rides the Phase 5 fidelity contract. Can run in parallel with Phase 21. Start any time.
Phase 23  requires Phase 22 + Phase 5 (quality rules + scoring must exist; fidelity gate + compositor must be stable before fields go conditional)
Phase 025 — OpenAI Swap (complete).
          Unblocks: Phase 17 (reflow done), Phase 22, Phase 23
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

## Phase 1 — Resolver Foundation ✅ DONE
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

## Phase 2 — Frontend Enforcement ✅ DONE
**Requires:** Phase 1 complete.
**Blocks:** Phase 21 (billing — was Phase 8 pre-rollback).

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

## Phase 3 — QA Fixtures ✅ DONE
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

## Phase 4 — Testimonial Carousel ✅ DONE
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

## Phase 5 — Blueprint → Render Prompt Pipeline ✅ DONE
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

## Phase 6 — Language Quality Contracts ✅ DONE
**Requires:** Nothing — start any time.

| # | File | Action | Done when |
|---|---|---|---|
| 6.1 | `functions/src/captionValidator.ts` | Add per-language word count limits. Arabic dialects: headline max 8 words, subheadline max 12 words, caption max 150 words. English: headline max 10 words, subheadline max 15 words, caption max 200 words. Validation function `validateWordCount(text, language, field): { valid: boolean, actual: number, max: number }`. | Function returns valid/invalid with correct counts for each language and field type |
| 6.2 | `functions/src/captionValidator.ts` | Add Arabic Unicode ratio check. `validateArabicRatio(text): { valid: boolean, ratio: number }`. Must be >= 70% Arabic characters (excluding spaces, numbers, punctuation). If below, flag `arabicRatioFail: true`. | Pure Arabic text returns ratio > 0.95. Mixed text with 50% English returns valid: false. |
| 6.3 | `functions/src/dialectMarkers.ts` | Implement dialect-specific marker validation. For each of the 6 Arabic dialects, define 5+ marker words/phrases. `validateDialect(text, dialect): { valid: boolean, markers: string[] }` checks for at least 2 markers. | Egyptian text with `ازاي` and `يعني` returns valid for `ar_egyptian`. Same text returns invalid for `ar_gulf`. |
| 6.4 | `functions/src/captionValidator.ts` | Add RTL compliance check. `validateRTL(text): { valid: boolean, issues: string[] }`. Checks: no LTR-override characters, parentheses/brackets in correct RTL direction, numbers not breaking RTL flow. | Text with `(hello)` flags LTR parentheses issue. Pure RTL text passes. |
| 6.5 | `functions/src/languageQuality.test.ts` | Write test file with one fixture per launch language (7 total). Each has a sample headline, subheadline, and caption. Assert all validators pass for correct samples and fail for deliberately broken samples. | All 7 language fixtures pass. At least 3 deliberate-failure samples caught. |

---

## Phase 7 — Failure Classification ✅ DONE
**Requires:** Nothing — start any time.

| # | File | Action | Done when |
|---|---|---|---|
| 7.1 | `functions/src/generators.ts` | Add `failureClass` field to generation records. Type: `'prompt_malformed' \| 'model_error' \| 'validation_reject' \| 'slot_repair_failed' \| 'numeric_hallucination' \| 'combination_invalid' \| 'credit_insufficient'`. On every caught error, classify and write to the generation record before re-throwing. | Failed generation records have a non-null `failureClass` field |
| 7.2 | `functions/src/generators.ts` | Add `costEstimate` field to generation records. Before calling any AI model, compute: `costEstimate = { inputTokens: estimated, outputTokens: estimated, imageRenders: count, totalCredits: cost }`. Write to record at the start of generation (before potential failure). | Every generation record has `costEstimate` with non-zero values |
| 7.3 | `functions/src/failureClassification.test.ts` | Write test: simulate each failure class. Assert classification is correct. (a) Invalid JSON from model → `prompt_malformed`. (b) 500 from image API → `model_error`. (c) Word count violation → `validation_reject`. (d) Slot map has unfilled required slot → `slot_repair_failed`. (e) Plan check fails → `combination_invalid`. (f) Credits < cost → `credit_insufficient`. | All 6 classification tests pass |

---

## Phase 8 — Billing (Stripe + GHL Sync) ❌ ROLLED BACK — Implementation diverged from spec, see Phase 21
**Requires:** Phase 2 complete.
**Blocks:** Phase 9, Phase 12, Phase 14.

> **⚠️ STATUS UPDATE — codebase audit revealed Phase 8 implementation diverged from spec.**
>
> The matrix specified Stripe + GHL Sync. The actual implementation in `functions/src/paddle/` and `functions/src/billing/paddleWebhook.ts` is on **Paddle**, not Stripe. The spec at `specs/009-billing-plan-access/` is correct behaviorally (user stories, FRs, state transitions, GHL sync rules, dual-write pending_plans pattern, mandatory billing modal) but the billing engine wired underneath it is the wrong one.
>
> **What's actually in production code (Paddle):**
> - `functions/src/billing/paddleWebhook.ts` — Paddle webhook handler with `paddle.webhooks.unmarshal()`
> - `functions/src/paddle/*` — Paddle SDK integration files
> - `paddleSubscriptionId`, `paddleCustomerId`, `paddleUpdatePaymentMethod`, `paddleCancelUrl` fields throughout `billingState.ts`, `billingLogger.ts`, `ghlBillingSync.ts`
> - `@paddle/paddle-node-sdk` dependency in `functions/package.json`
> - 9 Cloud Functions exported via `index.ts` reference Paddle
>
> **What this means:**
> - Phase 8.A (Stripe Dashboard Setup), 8.B (GHL Setup), 8.C (Code Tasks), 8.E (Stripe Live Wiring) — **NONE of these are actually implemented**. The matrix tasks describe Stripe, the code is Paddle.
> - Phase 8.D (Email-Only Auth) — **partially implemented** but wired to Paddle webhooks, not Stripe.
>
> **Resolution:** All Stripe migration work is now consolidated in **Phase 21 — Stripe Migration**. The behavioral spec at `specs/009-billing-plan-access/` is reused (FRs, user stories, state transitions). Only the billing engine swaps. The original Phase 8 task tables below are kept for historical reference only — do NOT execute them. Execute Phase 21 instead.
>
> **Why this happened:** During earlier matrix iterations, the spec was rewritten from Paddle → Stripe but the implementation work continued on the original Paddle path without being re-aligned. The matrix and the code drifted apart silently.

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
| 8.A.2 | Stripe Dashboard → Products | Create 3 subscription products: **Starter** ($29/monthly), **Pro** ($79/monthly), **Scale** ($179/monthly). Set prices in USD. Also create annual variants for each (Starter $278.40/yr, Pro $758.40/yr, Scale $1,718.40/yr — 20% off). Note down the **Price ID** for each monthly and annual variant (format: `price_xxxxx`). | 3 products exist with 6 price IDs recorded (3 monthly + 3 annual). |
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

### 8.E — Stripe Live Wiring Checklist (Owner Steps — Activation)

> **Context:** Phase 8 code (8.A–8.D) is implemented and deployed. But until the items below are configured in the Stripe dashboard, GHL, and Firebase secrets, **no real payment will succeed end-to-end**. This section is the activation checklist — every box must be ticked before launching to paid traffic.
>
> Order matters. Start in Stripe test mode. Verify everything works with a test card. Only then flip to live keys.

#### 8.E.1 — Stripe Products & Prices (verify all 3 plans exist)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.1.a | Stripe Dashboard → Products | Verify 3 active subscription products exist: **Starter**, **Pro**, **Scale**. Each has at least one recurring price. | All 3 products visible in dashboard. Each has `Active: Yes`. |
| 8.E.1.b | Stripe Dashboard → Products | Verify each product has BOTH a monthly AND an annual price (annual = 20% off per the pricing table). Note all 6 price IDs (`price_xxx`) — 3 monthly, 3 annual. | 6 price IDs documented. Annual prices match: Starter $278.40/yr, Pro $758.40/yr, Scale $1,718.40/yr. |
| 8.E.1.c | Stripe Dashboard → Products | Verify the one-time **Credit Top-Up** product exists with 3 prices (100 / 300 / 800 credits). Note the 3 price IDs. | 9 total price IDs documented (6 subscription + 3 top-up). |
| 8.E.1.d | `src/planconfig.ts` | Verify `paddlePriceId` field has been removed and replaced with `stripePriceId`. Verify each plan entry has the correct monthly + annual `stripePriceId` from the dashboard. Verify `stripeTopUpPriceIds` map is populated with the 3 top-up prices. | `grep "paddle" src/planconfig.ts` returns zero. All Stripe price IDs match the dashboard. |
| 8.E.1.e | `src/components/PricingTable.tsx` | Open the rendered pricing page. Click each plan's "Subscribe" button. Each click should redirect to Stripe Checkout with the correct plan name + price displayed. | All 3 subscription buttons + 3 top-up buttons open Stripe Checkout with correct prices. |

#### 8.E.2 — Stripe Webhook Endpoint (verify events are firing)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.2.a | Stripe Dashboard → Developers → Webhooks | Verify webhook endpoint exists at `https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook` (or correct region). Status: `Enabled`. | Endpoint visible. Status enabled. |
| 8.E.2.b | Stripe Dashboard → Developers → Webhooks | Verify these 5 events are subscribed: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`. | All 5 events appear in the endpoint's "Listening to" list. |
| 8.E.2.c | Stripe Dashboard → Developers → Webhooks | Click "Send test webhook" → pick `checkout.session.completed` → send. Check the endpoint's "Recent events" tab — the test event should show `200 OK` response. | Test webhook returns 200. Firebase logs show `paddleWebhook handler` (or `stripeWebhook handler`) received the event. |
| 8.E.2.d | Firebase Console → Functions → Logs | After the test webhook in 8.E.2.c, check the Cloud Function log. It should log: signature verified → event type identified → handler executed (even if user lookup fails because it's a test event with no real user). No 400/500 errors. | Logs show successful signature verification. |
| 8.E.2.e | Stripe Dashboard → Developers → Webhooks | Copy the **Signing secret** (`whsec_xxx`). | Signing secret copied. |
| 8.E.2.f | Firebase Console → Functions → Configuration | Verify `STRIPE_WEBHOOK_SECRET` secret is set with the value from 8.E.2.e. Run `firebase functions:secrets:access STRIPE_WEBHOOK_SECRET` to confirm. | Secret matches the dashboard value exactly. |

#### 8.E.3 — Stripe Customer Portal (verify users can manage subscription)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.3.a | Stripe Dashboard → Settings → Customer portal | Verify "Activated" status. Configuration enabled. | Customer portal status shows "Activated". |
| 8.E.3.b | Stripe Dashboard → Settings → Customer portal | Verify these are enabled: **Cancel subscriptions**, **Update payment method**, **Update billing address**, **Switch plans** (so users can upgrade Starter → Pro → Scale from inside the portal), **Invoice history**. | All 5 capabilities enabled. |
| 8.E.3.c | Stripe Dashboard → Settings → Customer portal | Verify "Plan switching" allows the 3 products (Starter/Pro/Scale) with both monthly and annual prices. Set proration: "Charge prorated amount immediately" for upgrades; "Credit unused time at next renewal" for downgrades. | Plan switching matrix shows all 3 plans with both billing intervals. Proration set correctly. |
| 8.E.3.d | Stripe Dashboard → Settings → Customer portal | Verify **return URL** is set to `https://app.proadsai.com/billing`. | Return URL matches. |
| 8.E.3.e | App → Billing page | Test as a real subscribed user: click "Manage Subscription". Should redirect to Stripe portal. Should be able to update card, switch plan, cancel. After clicking "Return", lands back on `/billing`. | Full round-trip works in test mode. |

#### 8.E.4 — Trial + Free-User Behavior (verify the "no plan" branch works)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.4.a | Stripe Dashboard → Products | Decide: do new subscriptions include a trial? If yes, set `Free trial: 7 days` on each subscription product. The pricing table promises "7-day free trial on all plans" — Stripe must honor this OR the app must enforce it via custom logic. | Trial setting matches what the pricing page promises. |
| 8.E.4.b | `functions/src/billing/stripeWebhook.ts` | Verify task 8.C.2 reads `subscription.trial_end` and sets `isTrial: true` on the user doc when present. Verify it sets `credits: 50` (the trial credit allocation per Section 0). | Trial subscriptions get `isTrial: true` and 50 credits. Confirmed in Firestore after a test trial subscription. |
| 8.E.4.c | App test | Subscribe with a test card (use Stripe test card `4242 4242 4242 4242`). Verify the user doc shows trial flag, 50 credits, plan name, and `billingStatus: 'active'` within 5 seconds of payment. | All 4 fields populated correctly after test payment. |
| 8.E.4.d | App test | Wait for the 7-day trial to elapse (or use Stripe's "advance test clock" feature). Verify the subscription transitions to paid and credits reset to the plan's allocation. | Trial → paid transition works. Credits reset correctly. |

#### 8.E.5 — GHL Webhook Sync (verify Firebase → GHL flow)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.5.a | GHL → Automation → Workflows | Verify "Stripe Payment Received" workflow exists with inbound webhook trigger. URL matches `GHL_STRIPE_SYNC_WEBHOOK_URL` in Firebase secrets. | Workflow exists. URL matches. |
| 8.E.5.b | GHL → Automation → Workflows | Verify the workflow has these actions: (1) Update Contact custom fields `plan`, `billing_status`, (2) Add tag `paid_{{plan}}`, (3) Conditional welcome email on `event = checkout.session.completed`, (4) Conditional win-back email on `event = customer.subscription.deleted`. | All 4 actions visible in the workflow editor. |
| 8.E.5.c | GHL → Automation → Workflows | Verify "Stripe Payment Failed" workflow exists. URL matches `GHL_STRIPE_FAILED_WEBHOOK_URL` in Firebase secrets. Action: dunning email with `{{portalUrl}}`. | Workflow exists. URL matches. Dunning email configured. |
| 8.E.5.d | App test | Subscribe a test contact in GHL with the test email. Then make a test Stripe payment. Within 30 seconds, the GHL contact should: (1) have `plan = pro` (or whatever was purchased), (2) have tag `paid_pro`, (3) have received the welcome email. | All 3 GHL automations fire after a test payment. |
| 8.E.5.e | App test | Cancel the test subscription in Stripe portal. Within 30 seconds, the GHL contact should: (1) have `plan = none`, (2) tag `paid_pro` removed, (3) win-back automation triggered. | All 3 cancellation effects fire. |
| 8.E.5.f | Firebase Console → Functions → Logs | Verify GHL sync calls log success. If GHL is unreachable, the log should show the failure but the Cloud Function should NOT throw — Stripe webhook processing must complete regardless. | Logs show GHL sync attempts. Failures are logged but don't break Stripe flow. |

#### 8.E.6 — Live Mode Cutover (final step before launch)

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.6.a | Stripe Dashboard | Switch from Test mode to Live mode. Verify all 3 products + top-up product exist in Live mode (products don't auto-copy from test — recreate them). | All products visible in Live mode. |
| 8.E.6.b | Stripe Dashboard → Developers → API keys | Generate Live mode Secret key (`sk_live_xxx`) and Publishable key (`pk_live_xxx`). | Both keys generated. |
| 8.E.6.c | Stripe Dashboard → Developers → Webhooks | Create a separate Live mode webhook endpoint pointing to the same Cloud Function URL. Subscribe to the same 5 events. Copy its NEW signing secret. | Live webhook exists with new signing secret. |
| 8.E.6.d | Firebase Console → Functions → Configuration | Update `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to the LIVE values. Redeploy: `firebase deploy --only functions`. | Secrets updated. Functions redeployed. |
| 8.E.6.e | `src/planconfig.ts` | Update `stripePriceId` values to the LIVE mode price IDs from 8.E.6.a. Redeploy frontend. | Frontend uses live price IDs. |
| 8.E.6.f | App → Pricing page | Make a real $1 subscription with a real card (your own card, immediately cancel after). Verify: payment succeeds → user doc updated → GHL contact updated → cancel works → user doc shows `plan: 'none'`. | Full real-money flow verified. Refund yourself the $1. |
| 8.E.6.g | Stripe Dashboard → Developers → Webhooks (Live) | Verify Live webhook shows successful events from the test in 8.E.6.f. No failed deliveries. | Live webhook events visible with 200 OK responses. |

#### 8.E.7 — Edge Case Coverage (verify before paid traffic)

| # | What | Test method | Done when |
|---|---|---|---|
| 8.E.7.a | Failed payment → past due | Use Stripe test card `4000 0000 0000 0341` (charges, then fails on next renewal). Advance time. Verify `billingStatus: 'past_due'` is set on user doc, credits NOT zeroed yet. GHL dunning email triggered. | All 3 effects confirmed. |
| 8.E.7.b | Plan upgrade mid-cycle | Subscribe to Starter, then upgrade to Pro from the Customer Portal. Verify: user doc plan updates from `starter` → `pro`, credits change from 800 → 2500, Stripe handles proration. | Plan + credits update within 10 seconds of upgrade. Stripe shows prorated charge. |
| 8.E.7.c | Top-up while subscribed | While on Pro plan, buy a 300-credit top-up. Verify: credits go from 2500 → 2800. Plan stays `pro`. No double-charge. | Top-up adds credits without affecting subscription. |
| 8.E.7.d | Webhook signature mismatch | Manually POST to `stripeWebhook` URL with invalid signature. Should return 400. | 400 response. No user doc mutation. |
| 8.E.7.e | New user paid before signup | Pay via Stripe Checkout WITHOUT being logged in (no `client_reference_id`). Verify `pending_plans/{email}` doc is created. Then sign up with the same email. Verify the pending plan is consumed and the user enters with `plan` set. | Pending plan flow works end-to-end. |
| 8.E.7.f | Monthly credit reset | Use a Pro user. Reset their `lastCreditReset` to 32 days ago in Firestore. Wait for the scheduled `monthlyCreditsReset` Cloud Function to run (or trigger manually). Verify credits reset to 2500. | Monthly reset confirmed. |

#### 8.E.8 — Customer-Facing Trust Signals

| # | Where | Action | Done when |
|---|---|---|---|
| 8.E.8.a | App pricing page footer | Add Stripe trust badge (`Powered by Stripe`). Stripe provides this asset in their brand library. | Badge visible on pricing page. |
| 8.E.8.b | App billing page | Verify subscription details display: current plan, next billing date, last 4 of card, "Manage Subscription" button. All read from `billingState`. | Billing page shows accurate subscription info pulled from Stripe via webhook → user doc → `billingState`. |
| 8.E.8.c | Email | Configure Stripe to send: payment receipts, payment failure notices, subscription cancellation confirmations. Stripe Dashboard → Settings → Emails. | All 3 email types enabled. |


---

## Phase 9 — Team Management ⚠️ DONE — Needs re-verification after Phase 21
**Requires:** Phase 21 complete (Stripe billingState — was Phase 8 pre-rollback).

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

## HOTFIX — Plan Structure Alignment (Apply to Phases 1–9) ✅ DONE

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

## HOTFIX-C — Cultural Compliance (Arabic Market Guardrails) ✅ DONE

> **Context:** Pro Ads AI is an Arabic-first app targeting coaches and consultants in the GCC/Gulf market. The pipeline currently has ZERO cultural guardrails — the universe database contains environments with alcohol (wine cellars, rooftop bars, cigar lounges with whiskey), the visual motifs inject haram elements (cocktails, champagne, whiskey) directly into image prompts, and there are no wardrobe modesty rules for Arabic audiences. This causes renders to show wine glasses, bar scenes, revealing clothing, and other culturally inappropriate elements. This must be fixed before ANY new user-facing feature ships.

**Haram elements found in the current pipeline:**

| Source | Problem |
|---|---|
| `r_wine_cellar` | Entire universe is a wine cellar |
| `r_wine_tasting` | Entire universe is a wine tasting room |
| `r_rooftop_bar` | Name says "bar", motifs include `'cocktails'` |
| `r_cigar_lounge` | Motifs include `'whiskey'` |
| `r_private_jet` | Motifs include `'champagne'` |
| `r_networking` | Motifs include `'cocktail reception'` |
| `r_diamond_lounge` | Motifs include `'private bar'` |
| `r_harbor_yacht_club` | Motifs include `'cocktails'` |
| `r_airport_lounge` | Motifs include `'premium bar'` |
| `r_vineyard` | Tuscan vineyard with wine barrels |
| `r_sushi_bar` | Name contains "bar" — minor but flagged |
| `r_dance_studio` | Culturally sensitive for conservative audiences |
| Build plan prompt | No cultural compliance block |
| Wardrobe rules | No modesty guidelines for Arabic audiences |

| # | File | Action | Done when |
|---|---|---|---|
| HFC.1 | `src/universeDatabase.ts` | Add `arabicSafe: boolean` field to every universe entry. Set `arabicSafe: false` on: `r_wine_cellar`, `r_wine_tasting`, `r_rooftop_bar`, `r_cigar_lounge`, `r_vineyard`, `r_dance_studio`, `r_sushi_bar` (the name — rename to `r_sushi_counter` and remove "bar" from display name). Set `arabicSafe: true` on all others. | Every universe entry has `arabicSafe` field. 7 entries are marked `false`. |
| HFC.2 | `src/universeDatabase.ts` | Sanitize `visualMotifs` arrays. Create a constant `HARAM_MOTIFS = ['cocktails', 'champagne', 'whiskey', 'wine', 'beer', 'spirits', 'cocktail reception', 'private bar', 'premium bar', 'bottles', 'barrels']`. For every universe entry whose motifs contain any of these strings, replace the haram motif with a culturally neutral alternative: `'cocktails'` → `'premium beverages'`, `'champagne'` → `'sparkling drinks'`, `'whiskey'` → `'warm lighting'`, `'private bar'` → `'private lounge area'`, `'premium bar'` → `'premium refreshment area'`, `'cocktail reception'` → `'elegant reception'`, `'bottles'` → `'crystal decanters'`, `'barrels'` → `'aged wood casks'`. These replacements apply at the data level so ALL downstream prompts receive clean motifs. | No universe entry has any string from `HARAM_MOTIFS` in its `visualMotifs` array. |
| HFC.3 | `src/components/InputForm.tsx` | When `adLanguage` starts with `'ar'`, filter the universe dropdown to only show entries where `arabicSafe === true`. Universes marked `arabicSafe: false` are hidden entirely — not grayed out, not locked, gone. When `adLanguage === 'en'`, show all universes (no filtering). | Arabic user does not see Wine Cellar, Rooftop Bar, Cigar Lounge, Vineyard, Dance Studio, or Wine Tasting in the dropdown. English user sees all. |
| HFC.4 | `functions/src/generators.ts` | Add a `CULTURAL_COMPLIANCE` block to `generateBuildPlan()`. When `inputs.adLanguage` starts with `'ar'`, inject the following BEFORE the `TECHNICAL_PROMPT` section: `"CULTURAL COMPLIANCE (MANDATORY — Arabic market):\n- NEVER render alcohol in any form: no wine glasses, beer bottles, champagne, cocktails, whiskey, spirits, or any drinking vessel that implies alcohol.\n- NEVER render nightclub, bar, or pub interiors.\n- NEVER render gambling elements: no cards, chips, roulette, slot machines.\n- NEVER render pork products or pork-related food scenes.\n- NEVER render dogs as pets (culturally sensitive in Gulf markets).\n- NEVER render crosses, churches, or non-Islamic religious symbols unless specifically relevant to the product.\n- NEVER render revealing or immodest clothing on any person — all figures should be dressed conservatively. Shoulders covered, no deep necklines, no short skirts/shorts.\n- NEVER render mixed-gender physical contact (handshakes are acceptable).\n- Luxury signaling should use: premium tea/coffee, luxury watches, fine dining (halal), architecture, cars, travel, nature — NOT alcohol or nightlife.\n- If the universe mentions any bar/lounge/club setting, replace the alcohol elements with premium non-alcoholic beverages (Arabic coffee, tea, juice, water)."` When `adLanguage === 'en'`, do NOT inject this block. | Arabic build plans contain the cultural compliance block. English build plans do not. |
| HFC.5 | `functions/src/generators.ts` | Add the same `CULTURAL_COMPLIANCE` block to `buildFinalImagePrompt()` (task 5.7). This is the last prompt before the image model renders. Double-inject the rules here as reinforcement — image models sometimes ignore build plan instructions. | Both the build plan AND the final image prompt contain cultural compliance rules for Arabic ads. |
| HFC.6 | `functions/src/generators.ts` | Add Arabic wardrobe modesty rules. When `adLanguage` starts with `'ar'`, add to the wardrobe section of the prompt: `"ARABIC MARKET WARDROBE RULES:\n- All figures (male and female) must be dressed conservatively and modestly.\n- Female figures: shoulders covered, no cleavage, skirt/dress below knee or trousers. Hijab ONLY if present in Box A — never add or remove it.\n- Male figures: no tank tops, no shorts above knee. Business casual minimum.\n- No swimwear, no gym wear showing skin, no lingerie or underwear visible.\n- Luxury fashion is encouraged — but covered luxury (suits, abayas, elegant modest dresses, thobes)."` | Arabic ad wardrobe prompts include modesty rules. Non-Arabic ads are unaffected. |
| HFC.7 | `functions/src/generators.ts` | In carousel and batch generation flows, ensure the `CULTURAL_COMPLIANCE` and wardrobe blocks are injected into EVERY slide/item prompt — not just slide 1. The cultural rules must be present in every individual image generation call. | Carousel slide 4 and batch item 3 both contain cultural compliance rules for Arabic ads. |
| HFC.8 | `functions/src/generators.ts` | Add a post-generation validation check for Arabic ads. After the build plan is generated and parsed, scan the `TECHNICAL_PROMPT` text for any of these trigger words: `wine, whiskey, cocktail, champagne, beer, alcohol, bar counter, nightclub, casino, gambling, bikini, swimsuit, lingerie, revealing, cleavage, short skirt, tank top, strapless`. If any are found, log `culturalViolation: true` and the matched words on the resolution trace, then auto-replace them in the prompt: `wine` → `premium tea`, `cocktail` → `artisan coffee`, `champagne` → `sparkling water`, `bar counter` → `service counter`, `nightclub` → `premium lounge`, etc. This is a safety net — the cultural compliance block should prevent these, but this catches leaks. | Post-validation catches and replaces any haram terms in Arabic build plans. Resolution trace logs violations. |
| HFC.9 | `functions/src/contractFixtures.test.ts` | Add cultural compliance fixture tests: (a) Arabic ad with `r_private_jet` universe — build plan does NOT contain "champagne" or "wine" (motif was sanitized + compliance block active), (b) Arabic ad — wardrobe section contains modesty rules, (c) English ad — NO cultural compliance block injected (freedom preserved for English market), (d) Arabic carousel slide 3 — contains cultural compliance block, (e) build plan with leaked "cocktail" in TECHNICAL_PROMPT — post-validation replaces it. | All 5 cultural compliance tests pass. |

---

## HOTFIX-D — Multi-Logo Upload (Box B → Max 5) ✅ DONE

> **Context:** Box B currently hard-limits to 1 logo despite the type definition allowing 5. Users need multiple logos in a single design (e.g., brand logo + certification badge + partner logo). The limit is enforced in 4 separate code locations plus the prompt text.

| # | File | Action | Done when |
|---|---|---|---|
| HFD.1 | `src/components/InputForm.tsx` | In the avatar/input parse logic (around line 281), change `brandLogos: (raw.brandLogos || []).slice(0, 1)` to `.slice(0, 5)`. Update the upload area label from "1 logo" to "Max 5" in the badge display (around line 2178). | Parse allows up to 5 logos. Badge shows correct count. |
| HFD.2 | `src/App.tsx` | Find all 4 locations where `brandLogos` is sliced to 1 before sending to generation (lines ~1960, ~3327, ~3349, ~3448). Change every `.slice(0, 1)` to `.slice(0, 5)`. These are in: `handleGenerateHooks`, `handleGenerateConcepts`, `handleRenderDesign`, and any other generation entry point. | `grep "brandLogos.*slice.*1" src/App.tsx` returns zero results. All slices are `.slice(0, 5)`. |
| HFD.3 | `functions/src/generators.ts` | Change `const boxB = (inputs.brandLogos || []).slice(0, 1)` (line ~4000) to `.slice(0, 5)`. | Backend accepts up to 5 logos. |
| HFD.4 | `functions/src/generators.ts` | Update all prompt text that references logos. Replace "If Box B contains a logo, it is the ONLY logo allowed" (line ~2406) with: "If Box B contains logos, render each one as a distinct physical brand element in the scene. Place the PRIMARY logo (first in array) most prominently. Secondary logos should be smaller and positioned in supporting areas (corner badge, secondary surface, background element). Maximum 5 logos. If Box B is empty, zero logos or branding marks." Update line ~4877 similarly: "If Box B has images, render the first as the primary brand mark and arrange additional logos as secondary brand elements." Update the branding integration instruction (line ~2105) to: "Integrate Box B logos as physical objects. Primary logo (first) is most prominent. Additional logos as supporting brand marks." | Prompts instruct the model to handle 1–5 logos with clear hierarchy. |
| HFD.5 | `functions/src/generators.ts` | In carousel and batch flows, ensure all logos are passed to every slide/item prompt — not just the first logo. The full `boxB` array (up to 5) is included in each generation call. | Carousel slide 3 receives all 5 logos. Batch item 2 receives all 5 logos. |

---

## HOTFIX-E — Hybrid Logo Handling (CRITICAL — P0) ✅ DONE

> **Context:** Gemini is distorting brand logos into "SIRM" / "SRM" when asked to render them as UI elements (corner logos, top-bar logos). BUT Gemini does a great job placing logos as **physical objects in the scene** (logo on a coffee mug, laptop lid, wall art, t-shirt, signage) because it treats them more like textures than text. The fix is HYBRID, not a ban:
>
> **Placement mode decides the pipeline:**
> - **UI logos** (corner badges, top-bar branding, CTA button logos) → Sharp post-composite (deterministic, pixel-perfect)
> - **Environmental logos** (mug, laptop lid, wall art, t-shirt, signage, merch) → Gemini renders (natural perspective, scene-appropriate lighting)
> - **Device screens** (laptop, monitor, tablet, phone) → NEVER render logos or text. Screens stay blank or show abstract content only.
>
> This preserves the creative placements users love while fixing the trust-killer distortions.

**What exists:**
- `offerOverlay.ts` has a working Sharp compositing pipeline for price/totalValue/savings.
- `textCompositing.ts` has Sharp RTL text compositing for Arabic.
- `brandLogos` is passed to Gemini as base64 reference images.
- Current prompt says "Device screen shows content, not blank" (line ~2192) — this INVITES Gemini to hallucinate fake logos on screens.

**What is missing:**
- No placement-mode classification (UI vs environmental).
- No Sharp composite path for UI logos.
- No screen-content ban.
- No sanity check on Gemini-rendered environmental logos.

| # | File | Action | Done when |
|---|---|---|---|
| HFE.1 | `functions/src/generators.ts` | In `generateBuildPlan()`, have the AI return a `logoPlacements` array where each entry specifies a placement MODE: `{ logoIndex: number, mode: 'ui' \| 'environmental', zone: string, widthPct: number, opacity: number, environmentalContext?: string }`. For `ui` mode: `zone` is one of `top-left, top-right, top-center, bottom-left, bottom-right, bottom-center, center`. For `environmental` mode: `zone` is the object or surface (e.g. `coffee_mug`, `laptop_lid`, `wall_art`, `tshirt_chest`, `signage_behind`, `book_cover`, `tablet_back`), and `environmentalContext` describes the physical rendering (e.g. "embossed on leather portfolio", "printed on ceramic mug held by hero"). The AI chooses the mode based on the creative style — minimalist/premium → UI logo, lifestyle/authentic → environmental logo, `text_only` → no logos at all. | Build plan JSON has `logoPlacements` with correct mode per entry. |
| HFE.2 | `functions/src/generators.ts` | Update the prompt with mode-specific instructions: (1) For `ui` mode placements: "Do NOT render this logo in the image. Leave the specified zone CLEAR and unobstructed. It will be composited post-render for pixel-perfect accuracy." (2) For `environmental` mode placements: "Render this logo as a physical object in the scene — on the {object/surface}. Match the object's perspective, lighting, and material. Keep it subtle and natural — part of the environment, not an overlay. Use the uploaded logo image as the visual reference." (3) **NEW ABSOLUTE RULE — SCREEN CONTENT BAN**: "NEVER render logos, text, charts, graphs, dashboards, or any text-based content on laptop screens, monitors, tablets, phones, smartwatches, or any device display. Device screens MUST show one of: (a) completely blank dark screen, (b) abstract gradient, (c) out-of-focus soft glow, (d) dimmed screen with unreadable blur. No exceptions." Remove/soften existing line "Device screen shows content, not blank" (line ~2192). | Prompt distinguishes between UI (render clear zone) and environmental (render natural object placement) and bans screen content entirely. |
| HFE.3 | `functions/src/logoComposite.ts` | Create this file. Export `compositeUILogos(baseImageBase64: string, logos: string[], placements: LogoPlacement[], canvasWidth: number, canvasHeight: number): Promise<string>`. Uses Sharp to composite ONLY entries where `mode === 'ui'`. For each UI placement: resize the logo to the placement's `widthPct × canvasWidth`, add subtle drop shadow for visibility, composite at zone coordinates with specified opacity, handle PNG transparency. Skip entries where `mode === 'environmental'` — those are already rendered by Gemini. Return composited base64 PNG. | Function composites UI logos only. Environmental logos pass through untouched. |
| HFE.4 | `functions/src/generators.ts` | After Gemini returns the rendered image: (1) pipe through `compositeUILogos()` — adds any UI-mode logos deterministically, (2) then run text compositing, (3) then offer overlay. Environmental logos were already rendered inside the image by Gemini in step 0 (nothing to do post-render for those). | Final output has UI logos pixel-perfect, environmental logos rendered naturally in-scene, and zero fake screen content. |
| HFE.5 | `functions/src/logoComposite.ts` | Add safe-zone validation for UI logos. Before compositing, verify each UI placement doesn't collide with text zones from the layout contract. If collision detected, auto-shift to the nearest non-colliding zone and log `logoAutoShifted: true` on the resolution trace. Environmental logos are not validated — Gemini handles their in-scene placement. | UI logos never overlap text. Auto-shifts logged. |
| HFE.6 | `functions/src/generators.ts` | Add a hint in the build plan prompt for MODE SELECTION: "Choose placement mode based on creative style — Minimalist, corporate, or conference-style ads → prefer UI mode (clean corner placement). Lifestyle, authentic, documentary, or product-focused ads → prefer environmental mode (logo on physical object in scene). For carousel with 5+ slides, mix: first slide UI logo for brand recognition, middle slides environmental for storytelling, last slide UI logo again for CTA. Never use more than 2 UI logos per ad. Environmental logos can be up to 3 if natural to the scene." | AI picks mode appropriate to style. Mixed-mode carousels work correctly. |
| HFE.7 | `functions/src/generators.ts` | Ensure carousel and batch flows run the UI logo composite pass on every slide/item. Each slide's `logoPlacements` array has its own mode decisions. Environmental logos on slide 3 are rendered by Gemini; UI logos on slide 1 are composited post-render. | Every slide gets correct per-mode handling. |
| HFE.8 | `functions/src/contractFixtures.test.ts` | Add hybrid logo fixture tests: (a) minimalist ad with 1 UI-mode logo — prompt tells Gemini to leave zone clear, Sharp composite runs, final image has pixel-perfect logo, (b) lifestyle ad with 1 environmental logo — prompt tells Gemini to render on coffee mug, Sharp composite does NOT run for that logo, (c) corporate ad with laptop in scene — prompt BANS logo/text on laptop screen, (d) mixed carousel: slide 1 UI, slide 3 environmental — both handled correctly, (e) ad with 3 logos (2 environmental + 1 UI) — all rendered, each via correct pipeline. | All 5 tests pass. |

---

## HOTFIX-F — Deterministic Aspect Ratio Reflow (CRITICAL — P0) ✅ DONE

> **Context:** REFLOW mode (generators.ts line 4913) sends the rendered image back to Gemini as a generative edit to resize the aspect ratio. Gemini's edit model stretches or squashes the subject when the canvas ratio changes by >30% — which is why the face in Image 7 is vertically elongated on the 4:5 → 9:16 reflow. A generative edit is the wrong tool for aspect ratio change. This hotfix replaces generative reflow with a two-option deterministic approach: (A) smart outpaint (extend the scene without touching the subject), or (B) re-render from the original build plan at the new ratio.

**What exists:**
- REFLOW path around line 4913 uses Gemini generative edit.
- Original build plan is stored in the generation record.
- `layoutContract.ts` has per-ratio zone definitions.

**What is missing:**
- No outpaint-only path (edit the canvas margins only, never touch the hero zone).
- No re-render-from-plan path (regenerate using the saved build plan at the new ratio).
- No subject detection to mask the hero zone from edits.

| # | File | Action | Done when |
|---|---|---|---|
| HFF.1 | `functions/src/generators.ts` | Delete the generative reflow path starting at line 4913. Replace with a router: if the ratio change is small (<30% vertical or horizontal shift), use outpaint. If ≥30%, use re-render from plan. Magnitude calculated from aspect ratio numerical comparison. | Reflow router exists. Small ratio changes go to outpaint. Large go to re-render. |
| HFF.2 | `functions/src/reflowOutpaint.ts` | Create this file. Export `outpaintReflow(base: string, currentRatio: string, targetRatio: string, inputs: AdInputs): Promise<string>`. Uses a Sharp-based or Gemini outpaint-specific model call to extend the image margins ONLY. The center 70% of the image (which contains the hero and all text) is locked — only the outer 30% padding is regenerated to fit the new canvas. Use a mask that whites out the center region. Prompt: "Extend only the outer edges of this image to fit {targetRatio}. Do NOT touch the center. Continue the existing background seamlessly into the new margins." | Outpaint preserves hero and text exactly. Only margins extended. |
| HFF.3 | `functions/src/generators.ts` | Add `rerenderFromPlan(generationId, newAspectRatio)` function. Loads the original build plan from the generation record, updates the `aspectRatio` field, calls the full render pipeline fresh (not an edit). Re-composites text and logos at the new ratio's safe zones. Deducts credits. This produces a NEW image that matches the original concept but at the new ratio — no subject stretching possible. | Re-render from plan produces fresh image at new ratio. No generative edit involved. |
| HFF.4 | `functions/src/index.ts` | Update the `reflowImage` callable (from Phase 17). Accept `method: 'outpaint' \| 'rerender' \| 'auto'`. `auto` uses the magnitude router from HFF.1. Allow user to force a method via UI (for cases where auto picks wrong). | Callable supports both methods and auto-routing. |
| HFF.5 | `src/App.tsx` (Step 4 UI) | Update the Resize button group. Show a small method selector when user picks a ratio: `○ Quick (outpaint — keeps subject identical, fastest)` `○ Fresh render (regenerates at new ratio — best for dramatic ratio changes)` `○ Auto (recommended)`. Default: Auto. | User can choose reflow method. Auto is default. |
| HFF.6 | `functions/src/contractFixtures.test.ts` | Add reflow fixture tests: (a) 1:1 → 4:5 with `auto` uses outpaint (small change), (b) 4:5 → 9:16 with `auto` uses rerender (large change), (c) outpaint preserves pixel hash of center 70% of image, (d) rerender at 9:16 produces image with aspect ratio 9:16 and no stretched subject (face height within normal bounds for body proportions). | All 4 tests pass. |

---

## Phase 10 — Favorites & Workspace ⚠️ DONE — Needs re-verification after Phase 21
**Requires:** Phase 21 complete (needs `billingState` for team scoping — which user's favorites to show; was Phase 8 pre-rollback).

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

## Phase 11 — Magic Edit ⏳ TODO — MAJOR
**Requires:** Phase 5 complete (render pipeline must be stable).

**What already exists:**
- HOTFIX-G has deleted `falEditing.ts` — Magic Edit will be built fresh on Gemini's edit endpoint with Box A reference photos for face consistency.
- `MagicSelector.tsx` (334L) — Canvas overlay with lasso drawing tool. Computes selection region as `{ xPct, yPct, widthPct, heightPct }`. Supports three edit modes: `text` (replace/remove text in region), `erase` (remove object), `style` (change color/style). Emits `onEditRequest` callback with mode, region, and payload.
- `textCompositing.ts` (631L) — Sharp-based Arabic text rendering. Re-runs after any edit to re-apply text overlay.

**What is missing:**
- No "add object" edit instruction (only erase and style exist).
- No environment/background replacement instruction.
- No batch edit flow (apply same edit to all N batch images).
- No carousel per-slide edit routing (edit one slide, maintain carousel coherence).
- No retargeting edit mode (edit must preserve objection-answering visual cues).
- No edit history/undo stack (each edit is destructive).
- No quality-preservation guard for repeated edits (repeated Gemini edit calls degrade image).
- No mask-to-prompt translation for complex lasso shapes.
- `textCompositing` is not automatically re-triggered after Gemini edit returns.

| # | File | Action | Done when |
|---|---|---|---|
| 11.1 | `functions/src/geminiEdit.ts` | Create file. Export `editWithGeminiInpaint(imageBase64, maskBase64, editPrompt, boxAPhotos): Promise<GeminiEditResult>`. Sends image + binary mask (white = edit region, black = keep) + text prompt + Box A reference photos to Gemini's image edit endpoint. Convert lasso polygon points to Sharp-rendered mask PNG before calling. Box A photos preserve face fidelity in regions adjacent to or containing the hero. | Function accepts mask + prompt + Box A and returns edited image. Non-rectangular selections produce correct mask. Hero face fidelity preserved. |
| 11.2 | `functions/src/geminiEdit.ts` | Add function `buildEditPrompt(editMode, payload, currentBuildPlan): string`. Translates UI edit actions into Gemini edit prompts: `erase` → "Remove the [object description] from the image, fill with surrounding context naturally". `add` → "Add [payload.description] at [region description]". `style` → "Change the color of [region description] to [payload.colorHex]". `environment` → "Replace the background/environment with [payload.environmentDescription], keep the foreground subject intact". `text` → NO Gemini call (handled by textCompositing only). Uses `currentBuildPlan` for scene grounding. | Each edit mode produces a coherent prompt. Text mode returns null. |
| 11.3 | `functions/src/geminiEdit.ts` | Add function `preserveQuality(originalBase64, editedBase64, editCount): Promise<string>`. If `editCount >= 3`, run a quality-restoration pass: send the edited image back through Gemini edit with prompt "Enhance image quality, sharpen details, restore color vibrancy, maintain all content exactly as-is". Return the quality-restored base64. If `editCount < 3`, return editedBase64 unchanged. Store `editCount` on the generation record. | After 3+ edits, output image has visibly sharper details. |
| 11.4 | `functions/src/index.ts` | Create callable `magicEditImage({ generationId, editMode, region, payload, slideIndex? })`. **Plan gate: Pro+ only** — if `billingState.plan === 'starter'`, throw `HttpsError('permission-denied', 'pro_plan_required')`. Flow: (1) load generation record, (2) get clean image (pre-text-overlay) from `output.cleanImageBase64` or `output.cleanImageUrl`, (3) if region is non-rectangular, render mask via 11.1, else use standard Gemini edit call, (4) build prompt via 11.2, (5) call Gemini edit, (6) run `preserveQuality` via 11.3, (7) re-run `compositeArabicText()` on edited image, (8) save edited image to Storage, (9) update generation record with new URLs and increment `editCount`, (10) return new image URL. | Starter user gets `pro_plan_required` error. Pro+ user gets edited image with text re-composited. |
| 11.5 | `functions/src/index.ts` | In `magicEditImage`, add `slideIndex` parameter support. If `slideIndex` is provided, load the carousel slide's individual clean image from `output.carouselSlides[slideIndex].cleanImageBase64`. After editing, write back to the same slide index. Do not re-render other slides. | Editing carousel slide 3 only affects slide 3. Other slides remain unchanged. |
| 11.6 | `functions/src/index.ts` | In `magicEditImage`, add batch edit support. If `payload.applyToAll === true` AND the generation is a batch (`output.batchResults` exists), iterate over all batch images and apply the same Gemini edit to each. Use `Promise.allSettled` for parallel execution. Return array of results with per-image success/failure. | Batch edit with `applyToAll: true` edits all N images. Partial failures don't block successful edits. |
| 11.7 | `src/components/MagicSelector.tsx` | Add "Add Object" tool alongside existing erase/style tools. When selected, show a text input for object description (e.g., "a laptop on the desk") and let user lasso the region where the object should appear. Emit `onEditRequest({ mode: 'add', region, payload: { description } })`. | User can select "Add" tool, draw a lasso region, type a description, and submit. |
| 11.8 | `src/components/MagicSelector.tsx` | Add "Change Environment" tool. When selected, show a text input for new environment description (e.g., "luxury office with floor-to-ceiling windows"). No lasso needed — applies to full background. Emit `onEditRequest({ mode: 'environment', region: null, payload: { environmentDescription } })`. | User can select "Environment" tool, type description, and submit without drawing a region. |
| 11.9 | `src/components/MagicSelector.tsx` | Add edit history stack. Store up to 10 previous `cleanImageBase64` states in component state. Add "Undo" button that reverts to previous state and decrements `editCount`. Add "Redo" button. History resets when user navigates away from the step. | Undo reverts the last edit visually. Redo re-applies it. History is capped at 10. |
| 11.10 | `src/components/MagicSelector.tsx` | Add batch edit toggle. When the current generation is batch mode (`batchResults` exists), show a checkbox: "Apply this edit to all [N] images". When checked, the `onEditRequest` payload includes `applyToAll: true`. Show a progress indicator during batch processing with per-image status. | Checkbox appears in batch mode. Checking it and editing applies to all images with progress feedback. |
| 11.11 | `src/components/MagicSelector.tsx` | Add carousel slide selector. When the current generation is carousel mode, show a horizontal strip of slide thumbnails above the edit canvas. Clicking a thumbnail loads that slide's clean image into the editor. The `onEditRequest` payload includes `slideIndex`. | User can switch between carousel slides and edit each individually. |
| 11.12 | `functions/src/generators.ts` | In the generation pipeline, after rendering the final image, persist the clean (pre-text-overlay) image separately as `output.cleanImageBase64` (or upload to Storage as `output.cleanImageUrl`). This is the image that Magic Edit operates on. For carousel, store per-slide: `output.carouselSlides[i].cleanImageUrl`. | Every rendered image has a corresponding clean version stored. Magic Edit can retrieve it without re-rendering. |
| 11.13 | `functions/src/contractFixtures.test.ts` | Add magic edit fixture tests: (a) `magicEditImage` with `mode: 'erase'` returns new URL different from original, (b) `magicEditImage` with `slideIndex: 2` only modifies slide 2, (c) `magicEditImage` with `applyToAll: true` returns array with length equal to batch size, (d) `preserveQuality` with `editCount: 5` produces output different from input (Gemini quality pass ran). | All four tests pass. |

---

## Phase 12 — Workspace Logic (Scale Mode) ⚠️ DONE — Needs re-verification after Phase 21
**Requires:** Phase 21 + Phase 9 complete (billing + team management; was Phase 8 + Phase 9 pre-rollback).

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

## Phase 13 — Saved Projects ⚠️ DONE — Needs re-verification after Phase 21
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

## Phase 14 — RAG + Meta Reporting Feedback Loop ⏳ TODO — MAJOR
**Requires:** Phase 7 (failure classification) + Phase 21 (billing — was Phase 8 pre-rollback) complete.

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

## Phase 15 — Brand Colors ✅ DONE
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

## Phase 16 — Creative Modes & Art Direction QA ✅ DONE
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

## Phase 17 — Resize & Reflow ✅ DONE
**Requires:** Phase 5 + Phase 15 complete (pipeline + brand colors). **Shipped 2026-06-01.** Spec: `017-resize-reflow`.

**What shipped:**
- **Always-visible reflow control** in Step 4 with **3 ratio buttons — Square (1:1), Portrait (4:5), Story (9:16)** in a single row. The current ratio is solid-filled with a "Current" badge; selecting a different ratio reveals a "Generate Resize — 5 credits" button. No picker toggle and no method selector (both removed).
- **`reflowImage` callable** (`functions/src/index.ts` → `functions/src/reflowImage.ts`) with four scopes: `single`, `batch_all`, `carousel_all`, `carousel_slide`. Deterministic two-route engine (HOTFIX-F): **outpaint** (Sharp margin extension, byte-identical center lock) for `<30%` fold-change, **rerender-from-plan** for `≥30%`, with auto-fallback between routes. Unified cost: 5 credits/item.
- **Single, batch (all N), and carousel (all slides + per-slide) reflow** wired end-to-end. Batch reflow saves a per-combo generation doc so each variant carries its own `buildPlan` + `generationId`.
- **Server-side render upload:** `serverGenerateFinalAd` and the reflow routes persist images to Storage via the **admin SDK (`getStorage()`)**, returning a durable public URL. The browser never writes to Storage — eliminates `storage/unauthorized`, CORS, and auth-token-timing failures.
- **Direct image source for reflow:** the frontend passes the displayed render straight to the callable (`sourceImageOverride`, base64 or URL), so reflow never depends on the server upload state. Outpaint decodes base64 in-process; rerender uses it as a style/composition reference for coherence.
- **Brand-color reinforcement** on the rerender route; **safe-zone-aware text re-composition** with overflow logging (`resolutionTrace.textReflowOverflow`); **ratio-only variant chips**; reflow output is a variant of the source generation (no new `generations` doc).
- New **`@google/genai` SDK** caller used across the reflow path (replaced the old `@google/generative-ai` caller that couldn't iterate the new request shape).
- **CURRENT badge** is batch-aware (tracks the focused batch tile's ratio).

**Contract fixtures:** `functions/src/contractFixtures.test.ts` HFF.6.a–o cover the router matrix, outpaint byte-identity, rerender-from-plan, drift/no-plan fallbacks, carousel/batch scopes, brand-color reinforcement, and safe-zone text overflow.

---

## Phase 18 — Multi-Hero Support ⏳ TODO — MAJOR
**Requires:** Phase 5 + Phase 11 complete (pipeline + magic edit — face consistency architecture).

**What already exists:**
- Box A accepts up to 5 photos — but all are of the SAME person. Used as face reference for consistency.
- Entire prompt system says "The Hero" (singular), "same face both halves", "Box A = face reference ONLY."
- `before_after` mode requires "same hero in both halves."
- Carousel face consistency: "Hero face consistent throughout" (Lane 1, Lane 4).
- `speaker_card` mode exists but assumes a single speaker.
- `webinar_screen` mode exists but assumes a single presenter.

**What is missing:**
- No way to upload photos of multiple distinct people (Hero A, Hero B).
- No prompt architecture for multi-person compositions (who goes where, which face reference maps to which person).
- No layout zones for multi-hero (e.g., speaker + host, instructor + student, 2 co-founders).
- No face consistency rules per person in carousel (Hero A stays Hero A across slides, Hero B stays Hero B).
- Use cases: mini-course with instructor + student testimonial, webinar with host + guest speaker, event with 2+ speakers, coaching ad with coach + client transformation.

| # | File | Action | Done when |
|---|---|---|---|
| 18.1 | `src/types.ts` | Add `heroGroups?: HeroGroup[]` to `AdInputs`. Define `interface HeroGroup { id: string; label: string; photos: string[]; role: 'primary' \| 'secondary' \| 'testimonial' \| 'speaker' }`. The `primary` hero is the main subject (coach/speaker). `secondary` is the supporting figure (co-host, guest, student). `testimonial` is a client result showcase. `speaker` is for summit/event grids where multiple people are equally weighted. **Max 5 hero groups.** Photo caps scale by count: 1 person → up to 5 photos. 2–3 people → up to 3 photos each. 4–5 people → up to 2 photos each. Total reference images capped at ~10 to preserve Gemini face fidelity. | Interface exists. `AdInputs` has `heroGroups`. Photo caps enforced at the type level. |
| 18.2 | `src/components/InputForm.tsx` | Replace the single "Hero Photos" upload area with a dynamic hero group manager. Default state: one group labeled "Hero" (backward compatible — single hero). Add a "＋ Add Another Person" button below the first group. When clicked, adds a second group labeled "Person 2" with its own photo upload zone and a role selector dropdown (Primary / Supporting / Client / Speaker). **Maximum 5 groups.** Each group has its own delete button (except the first — always required). When user adds a 4th or 5th person, show inline tip: "Tip — at 4+ people, upload 1–2 best photos per person. Quality over quantity preserves face accuracy." Auto-cap the per-group photo upload based on current group count (5 / 3 / 2). Show total photo count across all groups in the header. | User can upload photos for 1–5 distinct people. Each group has its own upload zone and role selector. Photo caps enforced per group. |
| 18.3 | `src/components/InputForm.tsx` | Add mode-specific multi-hero suggestions. When `speaker_card` or `webinar_screen` is selected, show a hint below the hero upload area: "Add a second person for host + guest speaker layout." When `before_after` is selected, hide the "Add Another Person" button — before/after requires a single hero. When `text_only` is selected, hide all hero uploads (existing behavior). | Suggestions appear for relevant modes. Before/after blocks multi-hero. |
| 18.4 | `functions/src/generators.ts` | Update `generateBuildPlan()` to handle `heroGroups`. When `heroGroups.length === 1`, use existing single-hero logic (backward compatible). When `heroGroups.length > 1`, inject a `MULTI-HERO COMPOSITION` block dynamically scaled by count. For 2–3 people: hierarchical composition (Hero A is dominant subject, Hero B/C are supporting). For 4–5 people: equal-weight grid composition (all heroes face the camera at similar prominence — summit/speaker-card style). Per-person instruction: "HERO [A-E] ([role]): Use photos from Hero Group [N] as face reference. CRITICAL: Each person must match their OWN photo reference. Do NOT blend faces. Do NOT use one person's face on another's body. Maintain distinct facial features per person." | Single-hero unchanged. 2–3 people get hierarchical composition. 4–5 people get equal-weight grid. Per-person face fidelity instruction always present. |
| 18.5 | `functions/src/generators.ts` | Add multi-hero layout rules per creative mode. `speaker_card` + 2 heroes: "Split the speaker zone — Primary speaker larger (60%), secondary speaker smaller (40%). Both face the camera. Name badges for each if provided." `webinar_screen` + 2 heroes: "Split-screen webinar layout — Primary host on left/larger panel, guest speaker on right/smaller panel. Webinar UI frame around both." `standard_hero` + 2 heroes: "Primary hero dominant in foreground, secondary hero in supporting position (slightly behind, slightly smaller, or adjacent)." `event_ticket` + 2 heroes: "Both speakers on the ticket. Primary speaker larger. Both names on the ticket if provided." | Each mode has specific multi-hero layout instructions. |
| 18.6 | `functions/src/generators.ts` | In carousel generation, enforce per-person face consistency. When multi-hero is active: "FACE CONSISTENCY RULE (MULTI-HERO): Hero A must have the SAME face across ALL slides where they appear. Hero B must have the SAME face across ALL slides where they appear. Hero A and Hero B must NEVER have the same face. Use each person's dedicated photo reference exclusively." Pass each hero group's photos separately to the per-slide generation — do NOT merge all photos into one array. | Carousel with 2 heroes: Hero A's face is consistent, Hero B's face is consistent, they are visually distinct people. |
| 18.7 | `functions/src/generators.ts` | In batch generation with multi-hero: each batch item receives the same hero groups. The multi-hero composition rules apply per item. Face consistency is per-person within each image (not across batch items — batch items are independent). | Each batch item renders both heroes with correct face references. |
| 18.8 | `functions/src/generators.ts` | Add `testimonial` hero role handling. When a hero group has `role: 'testimonial'`, inject: "This person is a CLIENT/STUDENT showing results. Render them in a before-and-after or 'result showcase' context — confident expression, transformation props. They are NOT the coach/expert — they are the proof." This is distinct from the `before_after` creative mode — it's a role within a multi-hero composition. | Testimonial-role hero is rendered as a client, not the coach. Visual treatment differs from primary hero. |
| 18.9 | `functions/src/layoutContract.ts` | Add multi-hero zone definitions. `multiHero2`: Primary 60% / Secondary 40% (hierarchical). `multiHero3`: Primary 50% / Secondary 30% / Tertiary 20% (hierarchical). `multiHero4`: 2×2 grid, equal cells (25% each — summit-style equal weighting). `multiHero5`: 1 large center hero + 4 surrounding (40% center, 15% each in corners) OR 5-cell horizontal strip depending on aspect ratio. These zone splits apply WITHIN the existing hero zone — they don't change the overall layout contract (stack zone, CTA zone, etc. remain the same). For 9:16 portrait: 4-person uses vertical 2×2, 5-person uses 1+4 layout. For 16:9 landscape: 4-person and 5-person use horizontal strips. | Layout contract supports 2/3/4/5-hero zone splits with aspect-ratio-aware grid choices. |
| 18.10 | `functions/src/contractFixtures.test.ts` | Add multi-hero fixture tests: (a) single hero — prompt uses existing single-hero language (backward compatible), (b) 2-hero `speaker_card` — hierarchical split, both face refs, (c) 2-hero carousel — face consistency rules reference Hero A and B separately, (d) `before_after` + 2 hero groups → rejected (single-hero only), (e) 3-hero `standard_hero` → `multiHero3` zone split, (f) 5-hero `speaker_card` → `multiHero5` zone split, equal-weight grid composition, photo cap of 2/person enforced, (g) 6-hero input → rejected with `max_5_heroes` error, (h) 5-hero with 3 photos per person → rejected with `photo_cap_exceeded` error. | All 8 tests pass. |
| 18.11 | `functions/src/creativeResolver.ts` | Add `summit` as a new creative mode (or alias `speaker_card` to handle 4–5 person grids). When 4+ heroes are uploaded, auto-suggest `speaker_card` mode if user is on a different mode — show inline hint: "You uploaded 4 people. Want to switch to Speaker Grid mode for a summit-style layout?" Don't force the switch. | 4+ hero count triggers mode suggestion. User can accept or keep their current mode. |
| 18.12 | `functions/src/generators.ts` | Add face fidelity reinforcement for 2–3 person ads (single-pass mode). Inject into prompt: "This ad has [N] distinct people. Pay maximum attention to keeping each face true to its specific reference photo. If two faces start to look similar, ADJUST until they are distinguishably different. Use the uploaded reference photos as absolute ground truth." Also reduce sub-style intensity by 10% to free attention budget for face accuracy. **Note:** 2–3 person ads continue using single-pass rendering. 4–5 person ads use the multi-pass pipeline (tasks 18.13–18.17). | 2–3 person prompts include reinforcement. Sub-style softened. |
| 18.13 | `functions/src/multiHeroRender.ts` | Create file. Implement multi-pass rendering for 4–5 person ads. Step 1: Render the SCENE only (environment, composition, props, lighting) with EMPTY hero zones — placeholder shapes (gray silhouettes) at the positions defined by `multiHero4` / `multiHero5` zones. The prompt explicitly says "Render this scene with [N] gray silhouette placeholders at positions [X1,Y1], [X2,Y2]... Do NOT render any faces or detailed people. The placeholders will be replaced with real people in a later step." Returns `sceneBase64` + per-hero zone coordinates. | Scene renders cleanly with placeholder shapes. No face hallucination because no faces were rendered. |
| 18.14 | `functions/src/multiHeroRender.ts` | Implement per-hero face insertion pass. For each hero zone, run a Gemini edit call: input is the scene base64 + a binary mask covering ONLY that one hero's zone + that one hero's reference photos + an English prompt: "Replace the gray silhouette in the masked region with a person matching these reference photos. Match the lighting, perspective, and style of the surrounding scene. The person should appear naturally integrated, not pasted." Each pass only ever has ONE face reference active. Run 4–5 passes sequentially (not parallel — Gemini is more accurate when not racing). | Each hero face gets inserted using only their own reference. No cross-contamination possible. |
| 18.15 | `functions/src/multiHeroRender.ts` | Add quality validation between passes. After each per-hero pass, run a lightweight Gemini Flash check: "Does this face match the reference photo in identity, age range, and key features? Yes/no/uncertain." If `no` or `uncertain`, retry that single pass once with a stronger prompt: "EXACT IDENTITY MATCH REQUIRED. Replace with this specific person, not a similar-looking person." Max 1 retry per hero. If retry also fails, log `faceFailedHeroN: true` on the resolution trace and continue (ship as-is, never block user). | Per-hero quality check runs. Failed faces get one retry. Failures logged but don't block. |
| 18.16 | `functions/src/generators.ts` | Update the multi-hero routing logic. When `heroGroups.length >= 4`, call `multiHeroRender()` instead of single-pass generation. When `heroGroups.length <= 3`, use existing single-pass logic with 18.12 reinforcement. The pipeline: build plan (with `multiHero4` or `multiHero5` zones) → scene render with placeholders → per-hero insertion (4 or 5 passes) → text composite → logo composite → final output. | Routing splits at 4-hero threshold. 1–3 person ads use single-pass; 4–5 person ads use multi-pass. |
| 18.17 | `functions/src/generators.ts` | Add per-hero credit cost calculation. Total credits for a multi-hero generation = base cost (current per-ad cost) + (1 credit × number of heroes beyond 1). 1 person = base. 2 people = base + 1. 3 people = base + 2. 4 people = base + 3. 5 people = base + 4. Reflects the actual API cost (each additional hero is one extra Gemini edit pass). | Credit cost scales linearly with hero count. Cost shown to user before generation. |
| 18.18 | `src/components/InputForm.tsx` | Add credit cost preview. As the user adds people (clicks "+ Add Another Person" or removes a person), update a "This generation will cost X credits" display in real time. Match Higgsfield-style UX — explicit upfront cost. Default state with 1 person shows base cost. Each additional person adds 1 credit. Show a tooltip on the "+" button at 4–5 people: "Adding more people uses additional credits because each face is rendered with extra accuracy passes." | Credit display updates as person count changes. Tooltip explains why cost increases. |
| 18.19 | `functions/src/contractFixtures.test.ts` | Add multi-pass fixture tests: (a) 4-hero generation runs scene-render + 4 face-insertion passes (5 total Gemini calls), (b) 5-hero generation runs 6 total calls, (c) face validation retry triggers and counts toward the credit cost (or doesn't — confirm decision), (d) all 4 hero faces in a 4-person grid match their references when validated by GPT-4o-mini visual check, (e) credit cost preview matches actual deducted credits. | All 5 tests pass. |

---

## Phase 19 — Direct-Response Design Upgrades ⏳ TODO — CRITICAL
**Requires:** Phase 5 + HOTFIX-E + HOTFIX-F complete (pipeline + logos + reflow must be stable first).

**Context:** Direct-response ads live or die on six levers: gaze, contrast, one-highlight discipline, price hierarchy, CTA outcome framing, and hook↔visual alignment. The current pipeline has none of these as enforced primitives — Gemini chooses randomly within style constraints. This phase adds them as deterministic rules in the build plan prompt and post-generation validation.

**What's missing (verified from code audit):**
- No gaze direction control. Subject's eyes are an arrow being pointed at random elements.
- No highlight count cap. Gemini highlights every punchy phrase — 3+ highlights on a single ad = 0 highlights.
- No price visual hierarchy rule. A $19 offer buried in 18pt CTA text is leaving money on the table.
- No CTA outcome-framing requirement. "Join the training" (description) vs "Reserve my spot — 3 days that change your career" (outcome).
- No hook↔visual promise validation. Hook says "end your confusion forever"; visual shows man standing in boardroom.
- No campaign coherence layer. Same offer across 6 ads = 6 different color palettes.

| # | File | Action | Done when |
|---|---|---|---|
| 19.1 | `functions/src/generators.ts` | Add a `GAZE_DIRECTION` rule to `generateBuildPlan()`. Require the build plan JSON to include `heroGaze: 'toward_headline' \| 'toward_cta' \| 'toward_camera' \| 'toward_object'`. Default: `toward_headline` for Step 1 (attention grab), `toward_cta` for CTA-heavy slides (last carousel slide, standard_hero close variants). Include in prompt: "Subject's eyes MUST point toward the [headline zone / CTA zone / camera]. Eyes are the visual arrow that directs viewer attention. Never let the subject look out of frame, at dead space, or down at a device while the headline is above." | Every build plan has `heroGaze` field. Prompt explicitly instructs eye direction. No more ads with hero looking out-of-frame unless deliberate. |
| 19.2 | `functions/src/generators.ts` | Add a HIGHLIGHT CARDINALITY cap to the highlight rule (line ~4250). Replace existing rule with: "At MOST one highlighted element per ad. Choose the SINGLE most important word or phrase in the headline (typically the emotional payoff or the key number). If you highlight more than one element, you have failed the rule. For Arabic: one complete word OR one complete line OR one underline/background bar. Exactly one, never more." Also require build plan JSON to include `highlightTarget: string` — the exact word/phrase to highlight. | Highlight rule caps at one. Prompt fails if two or more highlights appear. |
| 19.3 | `functions/src/generators.ts` | Add a PRICE HIERARCHY rule. When `inputs.offerPrice` exists AND the price is considered a hook (build plan can flag `priceIsHook: true`), inject: "The price '{price}' must be the SECOND LARGEST visual element after the headline. Render it as bold accent color, not buried in CTA or subhead. This is a price-shock creative — the price IS the story." When `priceIsHook: false`, keep existing behavior (price inside CTA). The Step 1 UI should add a "This price is my main hook" toggle on the offer price field. | Price-shock variants render the price at 2nd-tier visual hierarchy. Non-price-shock variants unchanged. |
| 19.4 | `src/components/InputForm.tsx` | Add "This price is my main hook" toggle next to the price field. When enabled, sets `priceIsHook: true` in inputs. Show tooltip: "Use this for $7/$19/$27 offers where price is the attention grabber. The price will be rendered prominently in the design." | Toggle exists. When on, build plan receives `priceIsHook: true`. |
| 19.5 | `functions/src/generators.ts` | Add CTA OUTCOME FRAMING to `generateCaption()` and CTA generation. When AI generates the CTA button text, require it to follow outcome framing: "NEVER generate CTAs that describe the action ('Join the training', 'Register now', 'Book your seat'). ALWAYS generate CTAs that name the outcome ('Reserve my spot — [benefit]', 'Start [transformation]', 'Fix [pain point] now'). The CTA must echo the headline's emotional promise, not just label the action." Add examples in the prompt. | AI-generated CTAs are outcome-framed. Description-only CTAs are rejected. |
| 19.6 | `functions/src/generators.ts` | Add HOOK↔VISUAL ALIGNMENT rule to `generateBuildPlan()`. After the AI generates the scene description, require it to articulate a `visualPromiseMapping` field: `{ hookPromise: string, visualExpression: string, alignmentScore: number 1-10 }`. The AI scores how well the scene mirrors the hook's emotional promise. If `alignmentScore < 7`, regenerate the scene once. Examples to include in prompt: "'End your confusion forever' → scene of hero with calm, confident expression and clear visual symbols (checkmarks, ordered elements). NOT generic 'hero in office'. 'Stop wasting months studying' → scene with time-pressure visual cues (clock, calendar, pile of books being pushed aside). NOT 'hero at desk working'." | Build plan has alignment scoring. Low-scoring scenes regenerate. Logged on resolution trace. |
| 19.7 | `functions/src/generators.ts` | Add CAMPAIGN COHERENCE rule. When generating multiple ads within the same saved project OR the same workspace within the last 24 hours for the same offer, extract the color palette and environment type from the PREVIOUS ad in the project. Inject: "This ad is part of an existing campaign. Use the SAME dominant color palette (Primary: {hex}, Secondary: {hex}) and the SAME environment category ({category}) as the other ads in this campaign. Vary composition, pose, and framing — NOT color scheme or environment type. Campaign consistency is required for Meta delivery optimization." | Subsequent ads in the same project inherit palette and environment from the first ad. |
| 19.8 | `functions/src/creativeScoringEngine.ts` | Add post-render validation for direct-response design levers. After render completes, scan the build plan and log flags on resolution trace: `highlightCountExceeded: true` (if more than 1 highlight detected in prompt), `gazeDirectionMissing: true` (if no heroGaze field), `ctaNotOutcomeFramed: true` (if CTA contains banned phrases like "join", "register", "book a seat" alone without outcome language), `priceNotProminent: true` (if priceIsHook=true but price doesn't appear in top 2 visual elements). These flags let you track quality over time. | Validation flags logged on every generation. Dashboard can display trends. |
| 19.9 | `functions/src/contractFixtures.test.ts` | Add direct-response design fixture tests: (a) build plan contains `heroGaze` field with valid value, (b) prompt contains "AT MOST one highlighted element", (c) build plan contains `visualPromiseMapping` with alignmentScore, (d) CTA for "Train with SHRM" generates outcome-framed variant (contains transformation verb, not just "join"), (e) price-shock variant has `priceIsHook: true` → prompt instructs 2nd-tier visual hierarchy, (f) second generation in same project inherits color palette from first. | All 6 tests pass. |

---

## HOTFIX-G — FLUX Cleanup (Prerequisite for Phase 20) ✅ DONE

> **Context:** `falGeneration.ts`, `falEditing.ts`, and their compiled `.js` counterparts in `functions/lib/` are orphaned dead code. Audit confirmed zero imports across `functions/src/`. FLUX was a failed trial — Gemini handles face fidelity via the Box A reference photo pattern. Removing these unblocks the dependency on `@fal-ai/serverless-client` and prevents confusion when Phase 20 wires in new pipeline stages.

| # | File | Action | Done when |
|---|---|---|---|
| HFG.1 | `functions/src/falGeneration.ts` | Delete the file. | File no longer exists. |
| HFG.2 | `functions/src/falEditing.ts` | Delete the file. | File no longer exists. |
| HFG.3 | `functions/lib/falGeneration.js` | Delete the compiled artifact. | File no longer exists. |
| HFG.4 | `functions/lib/falEditing.js` | Delete the compiled artifact. | File no longer exists. |
| HFG.5 | `functions/package.json` | Remove `@fal-ai/serverless-client` from dependencies. Run `npm install` after removal. | Package no longer in `node_modules`. `npm run build` succeeds with zero errors. |
| HFG.6 | Deploy | Standard sequence: `Remove-Item -Recurse -Force lib` → `npm run build` → `firebase deploy --only functions`. | Deploy succeeds. No broken imports in production. |

> **Note on Phase 11 (Magic Edit):** Phase 11 was originally specified to use `falEditing.ts` and FLUX Kontext. After this hotfix, the Magic Edit pipeline is migrated to use Gemini's edit endpoint (which already handles face fidelity via Box A reference photos in the existing pipeline). Phase 11 task descriptions referencing FLUX should be reinterpreted as: **edit endpoint = Gemini's image edit with Box A reference, not FLUX**. The atomic logic of Phase 11 (lasso → mask → edit prompt → text re-composite) is unchanged; only the underlying model call is.

---

## HOTFIX-H — Final Pricing & Naming Alignment (Pre-Launch) ⏳ TODO

> **Context:** Documentation alignment pass (021-stripe-migration branch) corrected all spec/doc references to the final pricing ($29/$79/$179, 20% annual savings) and renamed the user-facing label "Creative Scoring Engine" → "Predictive CTR Engine". Three code files were left untouched per the "no code changes outside docs/specs" rule of that pass. This hotfix closes the remaining code gap so the live app, the pricing page, and the docs all agree.
>
> **Scope:** User-facing labels and Starter price only. The internal TypeScript field name `creativeScoringEngine` and the file `functions/src/creativeScoringEngine.ts` are NOT renamed — those stay as-is. This is a marketing/UI alignment, not a refactor.
>
> **Why pre-launch and not deferred:** Pricing on `app.proadsai.com` must match what GHL charges at checkout. A user paying $29 on GHL but seeing `$19/mo` on the in-app pricing card creates a refund risk and a trust break.

| # | File | Action | Done when |
|---|---|---|---|
| HFH.1 | `src/planconfig.ts` | In the `starter` plan object, change `priceMonthly: 19` to `priceMonthly: 29` and `priceAnnualPerMonth: 15.20` to `priceAnnualPerMonth: 23.20`. Pro and Scale prices are already correct ($79 / $63.20 and $179 / $143.20). Do NOT touch any other field on the Starter plan (credits, limits, features all stay). | `PLANS.starter.priceMonthly === 29 && PLANS.starter.priceAnnualPerMonth === 23.20`. Pro and Scale unchanged. |
| HFH.2 | `src/planconfig.ts` | Search the file for the user-facing string `'Creative Scoring Engine'` (in `buildFeatureLabels()` or any feature-label array). Rename to `'Predictive CTR Engine'`. Do NOT rename the field name `creativeScoringEngine` (boolean entitlement key) or any reference to the file `creativeScoringEngine.ts`. | `grep "Creative Scoring Engine" src/planconfig.ts` returns 0 matches. `grep "Predictive CTR Engine" src/planconfig.ts` returns at least 1 match. The field name `creativeScoringEngine` still exists. |
| HFH.3 | `src/components/PricingTable.tsx` | In the `plans` array, update the Starter entry: change `monthly: 19, annual: 15.20` to `monthly: 29, annual: 23.20`. Pro and Scale entries unchanged. | The Starter column header in the rendered pricing table shows `$29/mo` (monthly toggle) and `$23.20/mo` (annual toggle). |
| HFH.4 | `src/components/PricingTable.tsx` | In the `featureRows` array, find the row labeled `'Offer Creative Modes'` and change `values: ['All 18+', 'All 18+', 'All 18+']` to `values: ['6', 'All 21', 'All 21']`. This makes the marketing page reflect the actual `maxOfferModes` from `planconfig.ts` (Starter 6, Pro/Scale 21). | The Offer Creative Modes row renders `6 / All 21 / All 21`. |
| HFH.5 | `src/components/PricingTable.tsx` | In the `featureRows` array, locate the `'Batch Rendering'` row currently in section `'scale'`. Change its `section` value from `'scale'` to `'studio'` and physically move the row to appear immediately after the `'Carousel Ads'` row inside the Render Studio section. Values stay: `[false, 'Up to 4 ads / run', { text: 'Up to 36 ads / run', emphasis: true }]`. | Batch Rendering renders inside Render Studio (between Carousel Ads and the next section). Scale Exclusives section no longer contains Batch Rendering. |
| HFH.6 | `src/components/PricingTable.tsx` | In the `featureRows` array, rename the row label `'Creative Scoring Engine'` to `'Predictive CTR Engine'`. The note text, section, and values stay unchanged. | The Scale Exclusives section header text reads `Predictive CTR Engine`. `grep "Creative Scoring Engine" src/components/PricingTable.tsx` returns 0 matches. |
| HFH.7 | `src/components/PricingTable.tsx` | In the `featureRows` array, find the `'Multi-Brand Workspaces'` row's third value (the Scale cell). Remove the `soon: true` property from the value object. Multi-Brand Workspaces is live (Phase 12 shipped per Section 0.5). | The Multi-Brand Workspaces row no longer renders the `Soon` badge in the Scale column. |
| HFH.8 | Verification | Run `npm run lint && npm run typecheck && npm run build` from the project root. Then run the same in `functions/`. Then grep the entire `src/` and `functions/src/` trees for the strings `"$197"`, `"15.20"`, `"$19/mo"`, `"Creative Scoring Engine"`, `"2 months free"` — all must return 0 matches in user-facing code paths (test fixtures may keep historical references). | Lint, typecheck, and build all pass. All 5 grep checks return 0 matches outside `**/__tests__/**` and `**/*.test.ts`. |

> **Out of scope (do NOT touch in this hotfix):**
> - The internal field name `creativeScoringEngine` in `planconfig.ts`, `entitlements.ts`, or `useBillingState.ts` — that's a separate, larger refactor.
> - The file `functions/src/creativeScoringEngine.ts` — internal name, never user-visible.
> - The marketing site at `proadsai.com` (GHL) — handled separately via the GHL admin console.
> - Stripe price IDs — those are created in Phase 21 (Stripe migration), not this hotfix. Phase 21 already references the corrected $29/$79/$179 amounts after the doc alignment pass.

---

## Phase 20 — Concept Director + Brief Coherence Check ⏳ TODO — CRITICAL
**Requires:** Phase 5 + Phase 14 (Creative Memory must be feeding generations) + HOTFIX-G (FLUX cleanup) complete.

> **Context:** The current pipeline (`Inputs → Hook Lab → Visual Plan → Art Direction → Render → Caption`) optimizes for constraint compliance, not creative differentiation. Three sibling concepts in a batch differ in pose but share metaphor, layout, and headline architecture — every ad looks like the same machine made it. The Visual Architect V5.0 step generates **layout archetypes** (where the hero stands), not **visual concepts** (what the ad is about). The hookType→visualDirection mapping in `hookTypesKnowledge.ts` is a 12-template lookup that returns identical visual direction for every hook of the same type.
>
> This phase adds two hidden backend stages and one hidden coherence checker — none of which are user-visible:
>
> - **Concept Director** (engineering name) — runs 3× per batch, sequential, sees siblings. Produces a specialized brief per ad with explicit fields for visual metaphor, headline architecture, forbidden props, and gaze direction. GPT-5.
> - **Variance Validator** (engineering name) — deterministic check that 3 sibling concepts are not the same shape with different finishes. Triggers max 1 retry on duplicate axes. No AI call.
> - **Selection Reviewer** (engineering name) — catches strong incoherences in user brief BEFORE generation. Runs live in Step 1 + pre-flight on Step 1 exit. Gemini 2.5 Flash.
>
> **User-facing names** (used ONLY in UI strings): "Brief Coherence Check" (the live banner) and "Variance Mode" (workspace toggle). The names "Concept Director", "Variance Validator", "Selection Reviewer" NEVER appear in user-facing copy, marketing, or support docs.
>
> **Architectural principle:** Both stages are additive and fail-open. If they fail, error out, or return fallback, the existing pipeline runs unchanged. Zero regression risk. A Remote Config kill switch disables both stages instantly.
>
> **Cost impact:** ~$0.046 added per generation (~5–12% of revenue at $19–$55 ARPU, 50 generations/month).

### 20.A — Engineering: Selection Reviewer (Brief Coherence Check)

| # | File | Action | Done when |
|---|---|---|---|
| 20.A.1 | `functions/src/selectionReviewer.ts` | Create file. Export `reviewSelection(input: SelectionReviewerInput): Promise<SelectionReviewerOutput>`. Input includes hookText, hookType, hookAngle, adTone, copywritingStrategy, subStyle, creativeMode, language, aspectRatio, audience, optional offerPrice/offerType/brandPrimaryColor. Output: `{ flagged, state: 'green' \| 'yellow' \| 'red', mismatches: [{ fieldA, fieldB, tension, severity, suggestion }] }`. Uses Gemini 2.5 Flash. Max 2 mismatches per review. Only flags strong mismatches. Returns empty array on uncertainty. Calibration target: fires on ~1 in 10 generations. | Function returns valid output schema for sample inputs. JSON-only response, no preamble. |
| 20.A.2 | `functions/src/selectionReviewer.ts` | Write the evaluation prompt. Reviews 6 pairs in priority order: (1) Tone × Hook Angle, (2) Sub-style × Creative Mode, (3) Sub-style × Audience price tier, (4) Hook Type × Hook Text, (5) Language × Audience, (6) Offer Price × Offer Type. Tension explanation written in user's language (Arabic if `language` starts with `ar_`). Severity: `strong` blocks; `moderate` warns. State: no mismatches → `green`; moderate only → `yellow`; any strong → `red`. | Prompt produces correctly-formatted JSON. Tension sentences are in user's language. |
| 20.A.3 | `functions/src/selectionReviewer.ts` | Add timeout/error handling. Fail-open: API timeout (>3s in live mode, >5s in pre-flight) or any error → return `{ flagged: false, state: 'green', mismatches: [] }`. Never throw. Log errors for telemetry. | API failure does not block generation. Logs show error context. |
| 20.A.4 | `functions/src/index.ts` | Export `reviewSelectionCallable` as a callable Cloud Function. Validates auth. Reads `cultureKill` Remote Config flag — if killed, returns green immediately. Calls `reviewSelection()` with input. Returns output to frontend. | Callable returns valid output. Kill switch returns green without invoking AI. |

### 20.B — Engineering: Concept Director

| # | File | Action | Done when |
|---|---|---|---|
| 20.B.1 | `functions/src/conceptDirector.ts` | Create file. Export `directConcept(input: ConceptDirectorInput): Promise<ConceptDirectorOutput \| ConceptDirectorFallback>`. Input includes the brief (hookText, hookType, hookAngle, adTone, copywritingStrategy, audience, offer fields), user's INVIOLABLE choices (subStyle, creativeMode, language, aspectRatio, brand colors/logo), variance enforcement (conceptIndex 0/1/2, siblingConcepts array, varianceMode), and pass-through context (reviewerFlags, pastWinningAds — last 5 from `creativeMemory.ts`). Uses GPT-5. | Function returns valid `ConceptDirectorOutput` for sample inputs. |
| 20.B.2 | `functions/src/conceptDirector.ts` | Define output schema with these required fields: `visualMetaphor: { description, keyVisualElement, emotionalReason }`, `headlineArchitecture` (one of 8: manifesto / editorial / annotated / dual_state / oversized_question / numerical_anchor / ellipsis_tease / stacked_weight), `highlightCardinality: { count: 0\|1\|2, phrases, treatment }`, `layoutArchetype` (one of 7: asymmetric_void / central_headroom / central_baseweight / environmental_canvas / split_dual_state / typography_dominant / editorial_columns), `heroPresence` (present / absent / partial / multiple_subjects), `heroGazeDirection` (toward_headline / toward_cta / direct_camera / off_frame_intentional / downward_introspective), `heroPoseSpecific: string`, `propsAllowed: string[]`, `propsForbidden: string[]` (min 3 items), `backgroundComplexity` (minimal / moderate / rich), `accentBehavior: { primaryUse, secondaryUse, cardinality: 1\|2\|3 }`, `logoTreatment` (composite_post / absent_this_concept / corner_subtle), `subStyleSpecialization: { inheritedFrom, specializedAs, keyDeparture }`, `restraintRules: string[]` (min 2 items), `conceptIndex: number`, `varianceAxes: { metaphorToken, layoutToken, headlineToken }`. | Output schema validated. Hard constraints enforced (count ≤ 2, propsForbidden ≥ 3, restraintRules ≥ 2, subStyleSpecialization.inheritedFrom equals user's exact subStyle choice). |
| 20.B.3 | `functions/src/conceptDirector.ts` | Write the reasoning prompt with 7-step internal reasoning: (1) emotional core of the hook, (2) concrete visual metaphor (concrete image, NOT abstract concept), (3) headline architecture choice, (4) sub-style interpretation (specialized within user's choice — never override), (5) focal point and composition, (6) forbidden props (min 3), (7) accent placement (max 3 places brand color appears). All text fields in user's language EXCEPT enum values (which stay English for downstream pipeline). | Prompt produces JSON-only output matching schema. Sample outputs have concrete visualMetaphor.description (e.g. "newspaper folded on subway seat" not "media is dying"). |
| 20.B.4 | `functions/src/conceptDirector.ts` | Define variance modes. `conservative`: siblings differ on hero pose + composition only. `balanced` (default): + metaphor + headline architecture + layout archetype. `aggressive`: + composition strategy + accent behavior + backgroundComplexity + heroPresence. Each mode parameterizes the prompt — sibling concepts MUST differ on the listed axes. Pass `siblingConcepts` array in prompt so concept N sees concepts 0..N-1 and avoids their `varianceAxes` tokens. | Three sequential calls produce concepts that differ on the axes specified by varianceMode. |
| 20.B.5 | `functions/src/conceptDirector.ts` | Add fallback behavior. Return `{ fallback: true, reason: string }` on: API call fails, timeout (>15s), JSON parse fails, schema validation fails, or hard constraint violation (e.g. count > 2, propsForbidden < 3). Log fallback for prompt iteration. The downstream code uses fallback as a signal to run existing Visual Architect V5.0 logic for that concept. | Fallback returns valid shape. Downstream pipeline continues without erroring. Fallback events logged. |

### 20.C — Engineering: Variance Validator

| # | File | Action | Done when |
|---|---|---|---|
| 20.C.1 | `functions/src/varianceValidator.ts` | Create file. Export `validateBatchVariance(concepts: ConceptDirectorOutput[], varianceMode: VarianceMode): VarianceValidationResult`. No AI call — purely deterministic comparison of `varianceAxes` tokens across the 3 sibling concepts. Output: `{ passed: boolean, violations: [{ axis, duplicateConceptIndices, severity: 'block' \| 'warn' }] }`. | Function correctly identifies duplicates per mode (see 20.C.2). Returns within 5ms. |
| 20.C.2 | `functions/src/varianceValidator.ts` | Encode rejection criteria. **Conservative**: BLOCK if `metaphorToken` identical across all 3 concepts. **Balanced**: BLOCK if `metaphorToken` identical across 2+ concepts, OR `layoutToken` identical across all 3, OR `headlineToken` identical across all 3. **Aggressive**: balanced rules + BLOCK if `backgroundComplexity` identical across all 3. WARN-level violations log but don't trigger retry. | All rejection rules correctly fire on test fixtures. |
| 20.C.3 | `functions/src/index.ts` | After Concept Director loop, call `validateBatchVariance(concepts, varianceMode)`. If `passed === true`, proceed to Visual Architect. If `passed === false` AND no retry has happened yet for this batch, regenerate the offending concept(s) by calling `directConcept()` with the rejected concept's tokens added to the siblings-to-avoid list. **Max 1 retry per concept.** If retry also fails validation, ship as-is and log failure. **Never block the user.** | Retry triggers on duplicate detection. Max 1 retry enforced. Failed retries log but don't block. |

### 20.D — Engineering: Pipeline Integration

| # | File | Action | Done when |
|---|---|---|---|
| 20.D.1 | `functions/src/layoutContract.ts` | Add 8 new text-zone presets corresponding to the new headline architectures: `manifesto_zone` (60%+ canvas coverage, centered, single weight), `editorial_zone` (top masthead + body column structure), `annotated_zone` (standard headline + annotation overlay positions), `dual_state_zones` (mirrored zones for split composition), `oversized_question_zone` (one giant word + small supporting text), `numerical_anchor_zone` (huge number + caption position), `ellipsis_tease_zone` (off-center, mid-thought placement), `stacked_weight_zone` (3 vertical bands for 3 weight levels). Each zone needs definitions across all 6 aspect ratios (1:1, 4:5, 3:4, 4:3, 9:16, 16:9). | All 8 zones defined with x/y/width/height for all 6 ratios. Sharp can composite text into them correctly. |
| 20.D.2 | `functions/src/generators.ts` | Modify Visual Architect V5.0 to read Concept Director output if present. Use `visualMetaphor.description` to inform scene description (currently inferred from hook + hookType). Use `layoutArchetype` to override the default 3-archetype rotation. Use `propsForbidden` to populate the FORBIDDEN block in the Gemini prompt. Use `heroGazeDirection` and `heroPoseSpecific` to override the current generic anti-robotic-pose rules. If Concept Director returned `fallback: true` for a concept, run existing logic for that concept only. **All existing logic remains as fallback path.** | Visual Architect uses Concept Director output when present. Falls back to existing logic when not. |
| 20.D.3 | `functions/src/generators.ts` | Update `quickRejectCheck` and `validateBlueprintMinimalStyle` to accept `headlineArchitecture` parameter. Validators check against the *intended* shape, not assume standard headline. Whitelist novel architectures (manifesto, oversized_question, numerical_anchor, etc.) so they don't trigger false positives. | Validators no longer reject manifesto-style or numerical-anchor builds as "broken". |
| 20.D.4 | `functions/src/index.ts` | Wire the new pipeline order: Hook Lab → **Concept Director loop (3× sequential, each sees siblings)** → **Variance Validator (with max 1 retry)** → Visual Architect V5.0 → Art Direction → Render → Caption. Add Selection Reviewer pre-flight check before Concept Director runs (if `state === 'red'` and user pressed "Generate anyway", proceed; otherwise this branch isn't reached because frontend already gates it). | Pipeline order matches spec. Logs show Concept Director and Variance Validator running before render. |
| 20.D.5 | `functions/src/index.ts` | Add feature flag: `conceptDirectorEnabled` boolean field on `users/{uid}` Firestore doc. Default `false` for all users. When `false`, skip Concept Director and Variance Validator entirely — pipeline runs old path. When `true`, new path runs. Allows per-user A/B rollout. | Flag controls whether new stages run. Default `false`. |
| 20.D.6 | `functions/src/index.ts` | Add Remote Config kill switch: `conceptDirectorKillSwitch` boolean. When `true`, ALL users skip new stages regardless of their `conceptDirectorEnabled` flag. Read at the start of every generation call. Cache for 60 seconds to avoid hammering Remote Config. | Kill switch globally disables new stages within 60s of being flipped. |
| 20.D.7 | `functions/src/conceptDirector.ts` | Wire `pastWinningAds` to `creativeMemory.ts`. Before each Concept Director call, fetch `getRAGContext(userId, { hookAngle, mode, dialect, styleFamily, subStyle })` (Phase 14 task 14.4). If `topPerformers` array has ≥3 entries, pass last 5 as `pastWinningAds` to Concept Director. Concept Director prompt includes: "Past winning ads from this user. Use these as positive reference for what works in this user's market — but generate something NEW, not a clone." | Concept Director receives last 5 winners when available. Falls back gracefully when memory has <3 entries. |

### 20.E — Frontend: Brief Coherence Check (User-Facing)

> **User-facing name:** "Brief Coherence Check". Engineering name (Selection Reviewer) NEVER appears in UI.

| # | File | Action | Done when |
|---|---|---|---|
| 20.E.1 | `src/App.tsx` (or `Step1Form.tsx`) | Add a persistent banner above the Step 1 form. Three states: `green` ("Your brief looks coherent" / "بريفك متكامل"), `yellow` ("Two of your selections may interact unexpectedly" + 1-sentence tension), `red` ("Strong mismatch detected" + 1-sentence tension + suggested change). Banner uses small icon (✓ / ⚠ / ⛔) and brief text. **Never** mentions "Selection Reviewer" or "AI" or "Gemini". | Banner renders in all three states. Text is in the user's language. |
| 20.E.2 | `src/App.tsx` | Wire banner to `reviewSelectionCallable`. Debounce 800ms after the user's last selection change. Hash-based cache keyed on the selection combo — skip API call if same combo was reviewed within last 30s. **Fail-open**: if callable times out (>3s) or errors, render no banner (treat as green). | Banner updates within 1.5s of user stopping. Cache prevents duplicate calls. Network errors hide the banner instead of breaking the form. |
| 20.E.3 | `src/App.tsx` | Add soft-block confirmation modal on Step 1 exit. Triggered when user clicks "Next" / "Generate" while banner state is `red`. Modal copy: *"Your [fieldA] and [fieldB] strongly conflict. [tension explanation]. Generate anyway?"* — Two buttons: `[Go back and adjust]` (default focus) and `[Generate anyway]`. "Generate anyway" sets a session flag so the same combo doesn't re-trigger the modal. If state is `yellow` or `green`: proceed without modal. | Modal fires only on red state. Bypassing it once silences it for the same combo in that session. Default button focus is "Go back". |
| 20.E.4 | `src/i18n/*` | Add bilingual strings: banner text for all three states, tension explanation template, modal title/body/buttons, "Brief Coherence Check" label (for accessibility / aria attributes). Both Arabic and English versions. | All strings have AR + EN. No hardcoded text in the banner or modal. |

### 20.F — Frontend: Variance Mode Toggle (User-Facing)

> **User-facing name:** "Variance Mode". Engineering name (Concept Director / Variance Validator) NEVER appears in UI.

| # | File | Action | Done when |
|---|---|---|---|
| 20.F.1 | `src/components/WorkspaceSettingsModal.tsx` | Add a "Variance Mode" toggle section. Two options: `Balanced` (default) and `Aggressive`. Toggle updates the workspace doc's `varianceMode` field. Info tooltip (i icon): *"Balanced: 3 concepts share voice, differ in metaphor and layout. Aggressive: 3 concepts differ on every axis — best for paid social A/B testing."* — In Arabic for AR users. **Never** mentions "Concept Director" or "Variance Validator". | Toggle exists. Default is Balanced. Tooltip shows in user's language. Setting saves to Firestore. |
| 20.F.2 | `functions/src/index.ts` | Read `varianceMode` from the workspace doc when starting a generation. Pass to Concept Director loop. If unset, default to `balanced`. | Generation honors the user's variance mode setting. |
| 20.F.3 | `src/i18n/*` | Add bilingual strings: "Variance Mode" label, "Balanced" / "Aggressive" option labels, info tooltip text. | All strings have AR + EN. |

### 20.G — Tests + Telemetry

| # | File | Action | Done when |
|---|---|---|---|
| 20.G.1 | `functions/src/contractFixtures.test.ts` | Add Concept Director fixture tests: (a) 3 concepts in balanced mode have distinct `metaphorToken` values, (b) propsForbidden has ≥3 items in every concept, (c) subStyleSpecialization.inheritedFrom equals user's subStyle exactly, (d) fallback returns `{ fallback: true }` when GPT call fails (mock failure), (e) heroGazeDirection is one of the valid enum values, (f) when fallback for one concept, the other two still proceed normally. | All 6 tests pass. |
| 20.G.2 | `functions/src/contractFixtures.test.ts` | Add Variance Validator fixture tests: (a) balanced mode blocks when `metaphorToken` matches in 2 of 3 concepts, (b) aggressive mode blocks when `backgroundComplexity` is identical across all 3, (c) conservative mode does NOT block when only `layoutToken` matches, (d) retry triggers when validation fails, (e) ship-as-is after 1 retry that also fails. | All 5 tests pass. |
| 20.G.3 | `functions/src/contractFixtures.test.ts` | Add Selection Reviewer fixture tests: (a) "luxury_magazine" subStyle + "$19 offer" + Egyptian audience flags as red (price tier mismatch), (b) "comedic" tone + "fear-based" hook angle flags as red (tone × angle mismatch), (c) "vintage_bw" subStyle + "tech-savvy young professional" audience flags yellow at most, (d) coherent brief returns green with empty mismatches, (e) Arabic input produces tension explanations in Arabic, (f) API failure returns green (fail-open). | All 6 tests pass. |
| 20.G.4 | `functions/src/index.ts` | Add telemetry. Log to a `pipelineTelemetry` Firestore collection per generation: `{ generationId, conceptDirectorRan, conceptDirectorFallbacks: number, varianceValidatorTriggered, varianceRetries: number, selectionReviewerState, modalShownToUser, userBypassedModal, totalLatencyMs }`. Used to monitor rollout health and Concept Director quality over time. | Every generation writes a telemetry row. Dashboard can query rollback signals (high fallback rate, high modal-bypass rate). |

---


---

## Phase 21 — Stripe Migration ⏳ TODO — CRITICAL (REPLACES PHASE 8)
**Requires:** Pre-launch (no production users yet — cleanest moment to migrate).
**Blocks:** Re-verification of Phases 9, 10, 12, 13. Phase 14. Production launch.

> **Context:** Phase 8 was specified as Stripe but implemented as Paddle. This phase performs a clean migration from Paddle to Stripe — gut the Paddle implementation, rewire to Stripe Checkout + Customer Portal + webhooks, and verify behavioral parity with the original Phase 8 spec at `specs/009-billing-plan-access/`.
>
> **Why a separate phase, not just "re-do Phase 8":** A new spec (`specs/021-stripe-migration/`) lets us reuse the behavioral FRs and user stories from `009-billing-plan-access/spec.md` (which are still correct) without re-creating them. Only the billing engine swaps. The auth flow, mandatory billing modal, dual-write `pending_plans` pattern, GHL sync, idempotency rules, plan gating — all stay behaviorally identical.
>
> **Why now and not later:** Pre-launch (zero paying customers) is the cheapest possible moment for a billing migration. Every day after launch makes it 10x harder. Doing it now also avoids re-verifying Phases 9, 10, 12, 13 twice.
>
> **What stays:** All behavioral specs at `specs/009-billing-plan-access/` (user stories, FRs, state transitions, GHL sync rules, mandatory billing modal, email-only auth flow). The behavior is correct. Only the billing engine changes.
>
> **What gets gutted:**
> - `functions/src/paddle/` (entire folder)
> - `functions/src/billing/paddleWebhook.ts`
> - `paddleSubscriptionId`, `paddleCustomerId`, `paddleUpdatePaymentMethod`, `paddleCancelUrl` fields across `billingState.ts`, `billingLogger.ts`, `ghlBillingSync.ts`
> - `@paddle/paddle-node-sdk` dependency in `functions/package.json`
> - All Paddle webhook event handlers and Paddle-specific UI references

### 21.A — Spec Investigation (Owner + Claude Code)

| # | Where | Action | Done when |
|---|---|---|---|
| 21.A.1 | Claude Code session | Read all files in `specs/009-billing-plan-access/` (spec.md, plan.md, tasks.md, data-model.md, quickstart.md, research.md, contracts/). Identify every behavior tied specifically to Paddle (managementUrls pattern, overlay checkout, webhook events, idempotency keys, etc.) that needs a Stripe equivalent designed. | Inventory of Paddle-specific behaviors documented. |
| 21.A.2 | Claude Code session | Produce a checklist of decisions the product owner needs to make before writing the new Stripe spec: Checkout Sessions vs Payment Element, Customer Portal vs custom UI, webhook events to subscribe to, idempotency strategy, pending_plans dual-write under Stripe, trial enforcement (Stripe-native vs custom), proration policy. | Decision checklist exists. |
| 21.A.3 | Owner | Answer the decisions in 21.A.2. When uncertain, default to: Checkout Sessions, Stripe-hosted Customer Portal, native trial, "charge prorated immediately on upgrade / credit on downgrade." | All decisions have answers. |

### 21.B — New Spec Authoring

| # | Where | Action | Done when |
|---|---|---|---|
| 21.B.1 | `specs/021-stripe-migration/spec.md` | Author the spec, modeled on the structure of `specs/009-billing-plan-access/spec.md`. Reuse FRs and user stories where behavior is identical. Add Stripe-specific FRs for: Checkout Session creation, Customer Portal redirect, webhook signature via `stripe.webhooks.constructEvent`, supported events (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`), `client_reference_id` for uid pass-through, `metadata.isTopUp` for one-time payments, `pending_plans/{email}` dual-write when client_reference_id is missing. | Spec covers all behaviors with Stripe-specific implementation. |
| 21.B.2 | `specs/021-stripe-migration/plan.md` | Implementation plan: order of operations (Paddle removal → Stripe SDK install → webhook rewrite → checkout creation → Customer Portal → frontend wiring → secrets → deploy → smoke test). Includes the dependency on Phase 9, 10, 12, 13 re-verification. | Plan exists with ordered phases. |
| 21.B.3 | `specs/021-stripe-migration/tasks.md` | Atomic task breakdown — each task is one file, one action, one done condition. Modeled on the format of `specs/009-billing-plan-access/tasks.md`. | Task list exists. |
| 21.B.4 | `specs/021-stripe-migration/data-model.md` | Define the Stripe-specific shape of `users/{uid}.billingState`: `{ plan, credits, billingStatus, isTrial, stripeSubscriptionId, stripeCustomerId, stripeCustomerPortalUrl, isTeamOwner, isTeamMember, teamOwnerName, teamMemberCount, teamOpenInvites, maxTeamMembers, savedProjectLimit, audienceAvatarLimit, batchConfig, carouselMaxSlides }`. Document migration of any existing Paddle field → Stripe equivalent. | Data model documented. |
| 21.B.5 | `specs/021-stripe-migration/quickstart.md` | Manual validation checklist: Stripe test mode card flow, plan upgrade mid-cycle, top-up while subscribed, webhook signature mismatch returns 400, paid-before-signup `pending_plans` flow, monthly credit reset, trial expiration, GHL contact updates fire correctly. | Quickstart exists. |

### 21.C — Stripe Dashboard Setup (Owner)

Same as old Phase 8.A but executed for real:
- Create 3 subscription products (Starter $29, Pro $79, Scale $179) with monthly + annual variants.
- Create 1 one-time top-up product with 3 prices (100/300/800 credits).
- Configure 7-day trial on subscription products.
- Generate Test mode API keys (`sk_test_...`, `pk_test_...`).
- Set up webhook endpoint `https://europe-west1-proadsai-saas.cloudfunctions.net/stripeWebhook` subscribed to 5 events.
- Activate Customer Portal with cancel/update payment/switch plans/invoice history. Set return URL `https://app.proadsai.com/billing`.

### 21.D — GHL Setup (Owner)

Same as old Phase 8.B:
- Create "Stripe Payment Received" inbound webhook workflow with welcome email + tag automation.
- Create "Stripe Payment Failed" inbound webhook workflow with dunning email.
- Copy both URLs into Firebase secrets.

### 21.E — Code Migration (Claude + GLM)

| # | File | Action | Done when |
|---|---|---|---|
| 21.E.1 | `functions/src/paddle/` | Delete entire folder. | Folder no longer exists. |
| 21.E.2 | `functions/src/billing/paddleWebhook.ts` | Delete file. | File no longer exists. |
| 21.E.3 | `functions/package.json` | Remove `@paddle/paddle-node-sdk`. Add `stripe`. Run `npm install`. | Stripe SDK installed, Paddle SDK removed. |
| 21.E.4 | `functions/src/billing/stripeWebhook.ts` | Create the Stripe webhook handler per the spec at `specs/021-stripe-migration/spec.md`. | Function verifies signature, routes 5 events, writes correct fields. |
| 21.E.5 | `functions/src/billing/billingState.ts` | Replace all Paddle field names with Stripe equivalents. Remove `paddleSubscriptionId`, `paddleCustomerId`, `paddleUpdatePaymentMethod`, `paddleCancelUrl`. Add `stripeSubscriptionId`, `stripeCustomerId`, `stripeCustomerPortalUrl`. | Zero Paddle field references. |
| 21.E.6 | `functions/src/billing/billingLogger.ts` | Same field renames. | Zero Paddle field references. |
| 21.E.7 | `functions/src/billing/ghlBillingSync.ts` | Update payload field names to match Stripe shape. Update GHL secret names from `GHL_PADDLE_SYNC_WEBHOOK_URL` to `GHL_STRIPE_SYNC_WEBHOOK_URL`. Same for failed URL. | GHL sync uses Stripe field names + new secret names. |
| 21.E.8 | `functions/src/index.ts` | Replace Paddle Cloud Function exports (`paddleWebhook`, `createPaddleCheckout`, `createPaddleTopUp`) with Stripe equivalents (`stripeWebhook`, `createStripeCheckoutSession`, `createStripePortalSession`). Update `defineSecret()` declarations: drop `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`; add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. | Index has Stripe exports + secrets only. |
| 21.E.9 | `src/planconfig.ts` | Replace `paddlePriceId` fields with `stripePriceId: { monthly, annual }`. Add `stripeTopUpPriceIds`. Remove any Paddle product IDs. | planconfig uses Stripe IDs only. |
| 21.E.10 | `src/components/PricingTable.tsx`, `src/pages/Billing.tsx`, `src/components/billing/MandatoryBillingModal.tsx` | Replace any Paddle checkout calls with `createStripeCheckoutSession`. Replace any Paddle URL references with `stripeCustomerPortalUrl`. Remove Paddle.js script tag if present. | Frontend uses Stripe callables only. |
| 21.E.11 | `src/firebase.ts` or wherever client-side Stripe loads | Add Stripe.js client (or use stripe-js): load `https://js.stripe.com/v3/` and initialize with publishable key from env. | Stripe.js loads on app init. |
| 21.E.12 | Firebase secrets | Set: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GHL_STRIPE_SYNC_WEBHOOK_URL`, `GHL_STRIPE_FAILED_WEBHOOK_URL`. Verify with `firebase functions:secrets:access`. | All 4 secrets set and accessible. |

### 21.F — Phase 8.D Email-Only Auth Re-Wire

The behavioral logic of email-only auth is correct but currently wired to Paddle webhooks. Re-point to Stripe.

| # | File | Action | Done when |
|---|---|---|---|
| 21.F.1 | `src/App.tsx` | In the `onAuthStateChanged` handler, the `pending_plans/{email}` consumption logic should already work — but verify the field names being read match the Stripe webhook output (stripeCustomerId, stripeSubscriptionId, not paddleCustomerId). | Field reads match Stripe shape. |
| 21.F.2 | `functions/src/billing/stripeWebhook.ts` | In `checkout.session.completed` handler: dual-write logic. If `client_reference_id` exists (logged-in user), write to `users/{uid}`. If missing (paid before signup), write to `pending_plans/{email.toLowerCase()}`. This matches the original Phase 8.D behavior. | Both paths verified with smoke test. |

### 21.G — Build, Deploy, Smoke Test

| # | Where | Action | Done when |
|---|---|---|---|
| 21.G.1 | functions/ | `npm run build` — zero TypeScript errors, zero Paddle imports remain. | Build passes. |
| 21.G.2 | repo root | `firebase deploy --only functions` — successful deploy. No `app/no-app` errors. No missing-secret errors. | Deploy succeeds. |
| 21.G.3 | Browser | Smoke test in test mode: pricing page → click Subscribe Pro → Stripe Checkout opens → use card `4242 4242 4242 4242` → return to app → user doc shows `plan: 'pro'`, `credits: 2500`, `billingStatus: 'active'` within 30 seconds. | Full flow works. |
| 21.G.4 | Browser | Cancel test: click Manage Subscription → opens Stripe Customer Portal → cancel → return → user doc shows `plan: 'none'` within 30 seconds. GHL contact tag `paid_pro` removed. | Cancel flow works. |
| 21.G.5 | Browser | Top-up test: while on Pro, click "Buy 300 credits" → checkout completes → credits go from 2500 → 2800. Plan stays `pro`. | Top-up works. |
| 21.G.6 | Stripe Dashboard | Verify webhook endpoint shows successful delivery (200) for all test events. | All events deliver successfully. |

### 21.H — Re-verify Affected Phases

After Phase 21 deploys to test mode and smoke tests pass:

| # | Phase | What to verify |
|---|---|---|
| 21.H.1 | Phase 9 (Team Management) | Team invite flow still works. `billingState.isTeamOwner`, `isTeamMember`, `maxTeamMembers` populate correctly from new Stripe-backed billingState. |
| 21.H.2 | Phase 10 (Favorites & Workspace) | Workspace scoping works. Team members see shared favorites. |
| 21.H.3 | Phase 12 (Workspace Logic) | `createWorkspace` callable rejects below-Scale plans. Linking Meta ad account still works. |
| 21.H.4 | Phase 13 (Saved Projects) | Per-plan project limits still enforced. Search/filter still works. |
| 21.H.5 | All phases | `grep -ri "paddle" functions/src src` returns zero results. No stale references. |

### 21.I — Live Mode Cutover

Same checklist as the old Phase 8.E.6 — recreate products in Live mode, generate live API keys, create live webhook endpoint, update Firebase secrets, redeploy. Done in the final pre-launch week.

---

## Phase 22 — Copy Quality Upgrade ⏳ TODO — CRITICAL
**Requires:** Phase 5 complete (the build-plan → render pipeline and copy-fidelity contract must be stable). Independent of billing — can run in parallel with Phase 21.

**Context:** Every on-creative text string flows from Step 2 through a 3-layer copy-fidelity contract (`generators.ts` writes → `buildFinalImagePrompt()` injects verbatim → `validateCopyFidelity()` enforces exact match with up to 3 retries → `textCompositing.ts` renders). Because the gate guarantees exact strings reach the image, improving the *words* at Step 2 propagates to the final design automatically — no design-phase wiring needed. This phase raises copy quality at the source on three product-owner decisions and adds a silent scoring/rewrite gate. It does NOT change how many fields exist (that is Phase 23).

**What's missing (verified from code audit):**
- No reading-level control. `HOOK_GENERATION_RULES` / `SYSTEM_TOV` permit literary Arabic and abstract nouns; copy routinely exceeds a 6th-grade level.
- No lived-symptom mandate. Copy states problems abstractly ("struggling to get clients") instead of the concrete moment the audience lives.
- A hard fake-proof block currently suppresses persuasive invention entirely — product owner wants invention allowed, with only fabricated *verifiable specifics* flagged (not blocked) for Meta-policy / GCC-law safety.
- No silent quality gate scoring the 4 generated fields before they enter the fidelity contract.

| # | File | Action | Done when |
|---|---|---|---|
| 22.0 | `specs/_shared/COPY_SYSTEM_REFERENCE.md` | Place the Copy System Reference doc at this path (create `specs/_shared/` if absent). This is the build-time design source — the app never reads it at runtime. | File exists at the path. |
| 22.1 | `functions/src/generators.ts` | Inject a READING-LEVEL rule into `SYSTEM_TOV` and `HOOK_GENERATION_RULES`: "All text must read at a 6th-grade level or below — short everyday words, short sentences, no jargon, no abstract nouns. For Arabic: simple spoken-style فصحى only; never literary or rare vocabulary; nothing a 12-year-old wouldn't say out loud. If a word has a simpler synonym, use the simpler one." | Both prompt constants contain the reading-level rule verbatim. |
| 22.2 | `functions/src/generators.ts` | Inject the same READING-LEVEL rule into the carousel slide prompt and `RETARGETING_RULES`. | Carousel prompt and `RETARGETING_RULES` both contain the rule. Per-slide carousel copy and retargeting copy read ≤6th grade. |
| 22.3 | `functions/src/copywriting_knowledge.ts` | Add a top-of-file comment `// Implements specs/_shared/COPY_SYSTEM_REFERENCE.md — edit the reference first, then sync these constants.` Then add exported constants `READING_LEVEL_BLOCK`, `LIVED_SYMPTOM_BLOCK`, `FABRICATION_POLICY_BLOCK`, `BANNED_CTA_LIST` (rule text transcribed from the reference doc, Sections 0/8/9). Refactor 22.1–22.2 + 22.4–22.5 to import these constants so each rule has ONE source of truth. | Constants exported and imported by `generators.ts`. No duplicated rule text. Drift comment present. |
| 22.4 | `functions/src/generators.ts` | Inject a LIVED-SYMPTOM rule into `SYSTEM_TOV`, `HOOK_GENERATION_RULES`, the carousel prompt, and `RETARGETING_RULES`: "Never state the problem in the abstract. Name the exact concrete moment the audience already lives — the scene, the time of day, the recognizable detail that makes them think 'that's literally me.' Pull the raw material from the PAIN POINTS and TARGET AUDIENCE fields and render it as a specific moment, not a category." Include one weak→strong example pair in the prompt. | All four prompt surfaces contain the lived-symptom rule + example. |
| 22.5 | `functions/src/generators.ts` | Remove the existing hard fake-proof guardrail text from the copy prompts and replace it with a FABRICATION POLICY: "You may invent persuasive framing freely — scenarios, hypotheticals, metaphors, illustrative composites. You do NOT need real proof to write persuasively. When you write a fabricated verifiable specific (a named person, an exact figure, a hard count, a star rating, or a concrete deadline/quantity), the system will flag it for the user — do not refuse or omit it." | No hard fake-proof block remains in any copy prompt. Fabrication policy text present. |
| 22.6 | `functions/src/types.ts` | Add `claimFlag?: Array<{ field: string; reason: string }>` to the copy/hook result type that carries `hookText`, `subheadText`, `ctaName`, `benefitText`. | Type compiles. Field is optional. Existing call sites unaffected. |
| 22.7 | `functions/src/generators.ts` | After copy generation, run a CLAIM DETECTOR over the 4 fields: flag any field containing a fabricated verifiable specific (named person, exact number/currency figure, hard headcount, star rating, concrete date/deadline/quantity). Populate `claimFlag[]` with `{ field, reason }`. Do NOT flag obvious hypotheticals, metaphors, or illustrative scenarios. Never block or rewrite on a claim flag. | Copy with "Ahmed made 47,000 SAR in 30 days" → flagged. Copy with "imagine waking up to a full calendar" → not flagged. Generation never blocked by a flag. |
| 22.8 | `src/App.tsx` | In the Step-2 hook UI, render a non-blocking warning chip on any field present in `claimFlag[]`: "Specific claim — make sure you can back it up before publishing." Chip is dismissible and never prevents proceeding. | Flagged fields show the chip. Unflagged fields show nothing. User can always proceed. |
| 22.9 | `functions/src/generators.ts` | Add a silent COPY SCORING pass using GPT-4o-mini after generation (before the fidelity contract). Score the 4 fields 1–10 on: audience specificity, pain/desire relevance, clarity, scroll-stopping tension, wording specificity, offer relevance, non-generic language, reading level (≤6th grade), lived-symptom depth. Return per-dimension scores on the result object. Non-blocking on errors/timeouts (fail-open per credit-safety principle). | Every generation returns per-dimension scores. Scoring failure does not block generation. |
| 22.10 | `functions/src/generators.ts` | Add a REWRITE loop (max 2 passes): if average < 8, OR reading level < 7, OR lived-symptom depth < 7, OR any other dimension < 6, diagnose the weakness and regenerate that field with the matched fix (simplify wording for reading level; substitute the concrete lived moment for surface-level; apply CTA formula for weak CTA; etc.). After 2 passes, proceed with the best candidate and log a soft flag — never loop further (credit safety). | Below-threshold copy triggers ≤2 rewrites then proceeds. No infinite loops. Rewrite events logged on the resolution trace. |
| 22.11 | `functions/src/buildPlanSlotMap.ts` | Regression verify only (no logic change expected): confirm `validateCopyFidelity()` still passes when the improved (often shorter/simpler) strings are injected into the build plan, and does not produce new fidelity-retry storms. | Smoke-test generations produce zero new fidelity failures attributable to the copy changes. |
| 22.12 | `functions/src/textCompositing.ts` | Regression verify only: confirm Sharp composites the simpler/shorter Arabic copy with RTL intact and correct non-empty element count. Shorter copy must not break zone layout. | RTL renders correctly; element count matches non-empty fields; no layout overflow on the shorter strings. |
| 22.13 | `functions/src/contractFixtures.test.ts` | Add copy-quality fixture tests: (a) reading-level rule present in `SYSTEM_TOV`, `HOOK_GENERATION_RULES`, carousel prompt, `RETARGETING_RULES`; (b) lived-symptom rule present in all four; (c) no hard fake-proof block remains; (d) claim detector flags a fabricated named-person/number, does not flag a hypothetical; (e) scoring pass returns reading-level + lived-symptom dimensions; (f) rewrite loop caps at 2 passes. | All 6 tests pass. |

> **Propagation note:** No tasks edit `buildFinalImagePrompt()` to push copy quality downstream — by design. The fidelity contract from Phase 5 carries the improved Step-2 strings to the image verbatim. Tasks 22.11–22.12 only *verify* downstream behavior; they do not change it.

---

## Phase 23 — Conditional Copy Structure ⏳ TODO — MAJOR
**Requires:** Phase 22 + Phase 5 complete (quality rules and scoring must exist; the fidelity gate and compositor must be stable before the field count goes conditional).

**Context:** The on-creative text is currently locked to four fields (`hookText`, `subheadText`, `ctaName`, `benefitText`) end-to-end — in the prompts, the Step-2 UI, the fidelity gate, the design prompt, and the compositor. The four-field shape is the right default for solution-aware mid-funnel ads but wrong for pure-curiosity (headline only), retargeting (objection handling), high-ticket (diagnostic, CTA delayed), and proof-led ads. This phase introduces the Hook Angle / Hook Type / Awareness taxonomy cleanup, eight static structures and eleven carousel frameworks, a decision tree, and a server-side `creativeTextDirector` that selects the structure — teaching every downstream layer that "intentionally absent field" is legal, not a fidelity failure.

**What's missing (verified from code audit):**
- Prompts always emit 4 fields; the Step-2 UI always renders 4 slots with per-field regenerate buttons.
- `validateCopyFidelity()` treats the 4 fields as canonical; it does not know which fields a chosen structure legitimately omits.
- `buildFinalImagePrompt()` conditionals CTA/benefit but not subheadline; the compositor balances layout assuming the canonical set.
- No structure-selection brain; `HOOK_GENERATION_RULES` hardcodes 4 variations A/B/C/D.

| # | File | Action | Done when |
|---|---|---|---|
| 23.1 | `functions/src/copywriting_knowledge.ts` | Add the final taxonomy constants: Hook Angle (Pain Amplification, Curiosity, Rational Diagnosis, Expert Authority, Social Proof, Statistics, Future-Based, Urgency, Scarcity, Cost of Inaction, Identity), Hook Type (Question, Curiosity Gap, Pain Point, Transformation Promise, Misconception, Shocking Statistic, Controversial, Comedic, Listicle, Personal Story, Storytelling Carousel, Diagnostic), Awareness Levels (Pattern Interrupt, Problem Awareness, Solution Awareness, Product Awareness, Authority Builder, Myth Busting, Soft Story Sell, Most Aware/Retargeting). | Constants exported. Removed: `Emotional`, `Threat` (as type), `Beginner Awareness`. |
| 23.2 | `src/modeFieldSchema.ts` + relevant UI config | Add optional `offerType` enum (mini-course / webinar / challenge / lead magnet / high-ticket call / coaching / consulting / course / DFY / other) and optional `realDeadline` field to inputs. | New fields persist; existing flows unaffected. |
| 23.3 | migration | Map legacy taxonomy values: `Emotional` → Pain Amplification or Future-Based by awareness; `Threat` (hook type) → Cost of Inaction (angle); `Beginner Awareness` → Problem Awareness. | Saved old values resolve to new taxonomy with no broken selections. |
| 23.4 | `functions/src/creativeTextDirector.ts` | Create the module skeleton: input → typed result `{ structure, fields: {role,text}[], resolvedAngle, resolvedType, resolvedAwareness, scores, claimFlags, rationale }`. | Module callable; returns typed empty result. |
| 23.5 | `functions/src/creativeTextDirector.ts` | Implement Input Diagnosis: self-selection trigger, sharpest pain/outcome, true next step from offer + price. | Emits a `diagnosis` object from inputs. |
| 23.6 | `functions/src/creativeTextDirector.ts` | Implement Auto-Selection rules (Awareness → Hook Angle → Hook Type) with guardrails: proof structures need a proof anchor; objection structures need retargeting + objections; invented hard deadlines flagged unless `realDeadline` set; no hook-type/awareness mismatch. | Blank dials resolve deterministically; guardrails enforced. |
| 23.7 | `functions/src/creativeTextDirector.ts` | Implement the decision tree → returns exactly one of 8 static structures or 11 carousel frameworks for any input combination. | Valid structure returned for every combo; no undefined paths. |
| 23.8 | `functions/src/creativeTextDirector.ts` | Implement static writers S1–S8 and carousel writers C1–C11, each emitting only the fields its structure includes, within the word caps; carousel CTA on last slide only (except C8); auto slide count to content. | Each structure emits correct fields; no empty padding; CTA placement rule enforced. |
| 23.9 | `functions/src/creativeTextDirector.ts` | Reuse the Phase 22 scoring + rewrite gate; add format-fit, hook-angle-fit, visual-compatibility, and structure-appropriate CTA/proof/objection dimensions. | Director scores include format/angle fit; rewrite caps at 2 passes. |
| 23.10 | `functions/src/types.ts` | Add `structure: string` and a typed `fields` contract (role-tagged) to the copy result so downstream layers know which fields are expected present. | Type compiles; gate and compositor can read `structure` + roles. |
| 23.11 | `functions/src/buildPlanSlotMap.ts` | Teach `validateCopyFidelity()` to check only the fields the chosen `structure` declares present. An intentionally-absent field (e.g. no CTA in Diagnostic-only) must NOT trigger the retry loop. **Highest-risk task — paranoid checkpoint.** | Diagnostic-only structure does not loop on missing CTA; a genuinely dropped expected field still triggers retry. |
| 23.12 | `functions/src/generators.ts` — `buildFinalImagePrompt()` | Omit absent fields cleanly per `structure`; never inject "render this empty field." Extend the existing CTA/benefit conditionals to also cover subheadline for headline-only structures. | Headline-only and headline+proof prompts inject only present fields. |
| 23.13 | `functions/src/textCompositing.ts` | Add a structure→zone map so layout balances with fewer fields (a headline-only ad must not leave a large empty CTA zone). **High-risk — paranoid checkpoint.** | Headline-only ad renders balanced; no empty reserved zones; Arabic RTL intact. |
| 23.14 | `src/App.tsx` | Make the Step-2 UI render only the fields the chosen structure includes; per-field regenerate buttons hide for absent fields; UI does not break on a missing field. **High-risk — live UI on every generation; paranoid checkpoint.** | Each structure shows only its fields; no broken slots; regenerate buttons match present fields. |
| 23.15 | `functions/src/generators.ts` | Wire `creativeTextDirector` into the pipeline before the build-plan step, replacing `HOOK_GENERATION_RULES` as the structure decision-maker; run once per design and per-slide for carousels. | Director output feeds the build plan; legacy 4-variation hardcode no longer drives structure. |
| 23.16 | `functions/src/contractFixtures.test.ts` | Add conditional-structure fixtures: (a) decision tree returns a valid structure for each of 6 offer types × {static, carousel}; (b) Diagnostic-only emits no CTA and the gate does not retry; (c) headline-only composites balanced with no empty zone; (d) Step-2 UI renders only present fields; (e) high-ticket carousel CTA appears only on the last slide; (f) legacy taxonomy values migrate correctly. | All 6 tests pass. |

### Phase 23.A — "Generate 4 More Like This" → in-card variation carousel

**Context:** Today the per-hook "Generate 4 More Like This" button (in `App.tsx` Step 2) deducts `refreshHooks` credits, builds a `likeThisPrompt` keyed to a HARDCODED angle map (`A: Direct Value, B: Curiosity, C: Social Proof, D: Problem Agitation`), generates 4 hooks, and **appends them to the bottom of `tovText`** with a toast. Two problems: (1) the angle map is replaced by the Phase 23 taxonomy, so the prompt must key off the hook's *resolved* angle + structure, not the letter; (2) the appended-to-bottom UX buries the variations away from the hook they relate to. This sub-block fixes both: variations are TRUE to the liked hook (same hook angle + same structure, fresh wording) and live INSIDE the originating hook's card as a scrollable mini-carousel (original = position 1, the 4 new = positions 2–5), with arrows + dots. Approve / Edit / Batch act on whichever variation is currently displayed.

**Behavior decision (locked):** "More like THIS" = same resolved hook angle + same resolved structure as the reference hook, with completely fresh wording, metaphors, and entry points. It does NOT vary the structure (that is the job of the grid-level fresh-angle regenerate). All Phase 22 quality rules (6th-grade, lived-symptom, claim-flag) and Phase 22/23 scoring apply to the new variations.

| # | File | Action | Done when |
|---|---|---|---|
| 23.A1 | `functions/src/creativeTextDirector.ts` | Add a `generateSimilarVariations(referenceHook, count=4)` path: it reads the reference hook's resolved `{hookAngle, structure}` and regenerates `count` new hooks LOCKED to that same angle + structure, fresh wording, no reused words, deduped against all existing hooks. Applies the standard scoring + rewrite gate. | Returns N variations all sharing the reference angle + structure; none duplicate existing hooks; each passes the score gate. |
| 23.A2 | `functions/src/generators.ts` | Replace the hardcoded angle map in the "more like this" prompt builder with the reference hook's resolved angle + structure from 23.A1. Remove the `{A,B,C,D} → label` lookup. | No hardcoded angle map remains; prompt is driven by resolved angle + structure. |
| 23.A3 | `functions/src/types.ts` | Extend the hook result type so each hook can carry a `variations?: Hook[]` group and a `parentHookId?: string`, enabling a card to hold its reference hook + its similar variations as one scrollable set. | Type compiles; existing single-hook flows unaffected (empty `variations`). |
| 23.A4 | `src/App.tsx` | Change the "Generate 4 More Like This" handler: instead of appending results to the bottom of `tovText`, attach them as the originating hook's `variations` group. Do NOT mutate the main hook grid. | Clicking the button populates that hook's variation group; the main grid does not grow. |
| 23.A5 | `src/App.tsx` | Convert the hook card into a mini-carousel when it has variations: reference hook = slide 1, variations = slides 2..N; render left/right arrows + position dots inside the same box; track `activeVariationIndex` per card. | Card shows arrows + dots; user can scroll through reference + 4 variations within the box. |
| 23.A6 | `src/App.tsx` | Make Approve / Edit / AI Edit / Batch operate on the CURRENTLY DISPLAYED variation (by `activeVariationIndex`), not always the reference hook. | Approving while viewing variation 3 selects variation 3; Batch adds the displayed variation. |
| 23.A7 | `src/App.tsx` | Repeat-click behavior: clicking "Generate 4 More Like This" again on a card that already has variations appends to that card's variation group (does not reset to 4), capped at a sane max (e.g. 12 per card) with the credit deduction per click unchanged. | Second click extends the same carousel; cap enforced; credits deducted/refunded per existing `refreshHooks` logic. |
| 23.A8 | `src/i18n.tsx` | Update `info.generate_more` tooltip to reflect the new behavior ("Generate variations of THIS hook — same angle and style, fresh wording — and scroll through them inside this card"). Add EN + AR strings for arrow/dot aria-labels and "Variation {n} of {total}". | Tooltip + new strings present in both locales; AR is RTL-correct. |
| 23.A9 | `src/App.tsx` | RTL: in Arabic the carousel arrows and slide order must respect RTL (next = leftward), and the variation strip must not break the existing RTL hook layout. | Arabic carousel scrolls RTL-correctly; no layout break. |
| 23.A10 | `functions/src/contractFixtures.test.ts` | Add fixtures: (a) `generateSimilarVariations` output all share the reference angle + structure; (b) no variation duplicates an existing hook; (c) repeat-click appends and respects the cap; (d) variations carry `parentHookId`. | All 4 tests pass. |

**Carousel-mode note:** when `adMode === 'carousel'`, "more like this" generates similar *full carousel angle sets* (via `generateCarouselAngles`) rather than single hooks — the variation carousel then scrolls through alternative slide-1 hooks, each backed by its own slide set. Preserve the existing carousel branch; only the presentation (in-card scroll vs bottom-append) and the angle-resolution change.

### Phase 23.B — Fresh hooks every project (anti-sameness)

**Context (corrected against current code):** The angle is already correctly LOCKED to the user's selected `coldHookAngle` — that is working as intended and must stay. The repetition comes from a different layer: (1) within the locked angle, the 4 hooks are varied across a HARDCODED, fixed-order dimension map (Hook A = Financial/Revenue, B = Time/Lifestyle, C = Status/Identity, D = Skill/Confidence) — so every project using a given angle gets the same four sub-flavors in the same order; (2) the blueprints in `hookAnglesKnowledge.ts` are richly-worded SCRIPTS (e.g. `future_based` spells out A=Financial Future, B=Lifestyle, C=Status, D=Timeline-90-days with fixed dimension/constraint/feeling/subheadline) — the model anchors to the template, so the skeleton repeats and only nouns swap; (3) there is NO cross-project memory, so even the existing within-set diversity rule can't stop repetition ACROSS projects; (4) temperature is already high (1.0/1.2) — raising it only degrades copy, it can't touch the fixed dimension map or the amnesia.

**Decisions (locked):** Keep the user's angle lock untouched. Within the locked angle, rotate BOTH the dimensions used AND the entry structure across projects. Convert the `hookAnglesKnowledge.ts` blueprints from fixed-4 SCRIPTS into POOLS of 6–8 dimensions per angle (preserve every word of the existing psychology + Arabic phrasing — only remove the fixed-order lock, draw 4-of-N rotated). Add cross-project anti-repetition memory that BIASES away from recently-used dimension+opening combos; it never hard-bans, so the pool never starves.

| # | File | Action | Done when |
|---|---|---|---|
| 23.B1 | `functions/src/knowledge/hookAnglesKnowledge.ts` | Convert each angle's `ANGLE_VARIATION_BLUEPRINTS` entry from a fixed 4-hook script into a POOL of 6–8 named dimensions (keep all existing dimension text, constraints, feelings, and Arabic phrasing verbatim — only restructure so dimensions are a selectable list, not Hook A/B/C/D positions). | Each angle exposes ≥6 dimensions as a pool; no dimension is hardwired to a hook slot; all original psychology text preserved. |
| 23.B2 | `functions/src/creativeTextDirector.ts` | Add `selectHookDimensions(angleId, recentlyUsed, count=4)`: draw `count` distinct dimensions from the angle's pool (23.B1), down-weight dimensions in `recentlyUsed`, shuffle order, and never return the same ordered set twice in a row for the same angle. A sole remaining best-fit dimension is still selectable (bias, never ban). | Returns N distinct on-angle dimensions; consecutive identical ordered sets do not occur; pool never empties. |
| 23.B3 | `functions/src/generators.ts` | Remove the hardcoded `Hook A = FINANCIAL, B = TIME, C = STATUS, D = SKILL` dimension assignment from the cold-angle prompt. Replace with the rotated dimensions from 23.B2 (angle stays locked to `coldHookAngle`; only which dimensions fill the 4 hooks changes). | No fixed-order dimension map remains; dimensions come from the selector; angle lock intact. |
| 23.B4 | `functions/src/generators.ts` | Strengthen the existing ENTRY-STRUCTURE diversity rule so the chosen opening structures (percentage / question / imperative / ratio / conditional / direct-address / time-reference) are ROTATED per project too — not just distinct within one set. Feed the structures used recently (from memory) so the opening moves differ across projects, not only within. | Across two consecutive projects on the same angle, the set of opening structures differs; within a set all 4 still differ. |
| 23.B5 | `functions/src/creativeMemory.ts` | Extend memory to record, per generation (per user, across ALL projects): the locked angle, the dimensions used, and a normalized fingerprint of each hook's opening structure + first 3–4 content words. | Each generation writes angle + dimensions + opening fingerprints to memory. |
| 23.B6 | `functions/src/creativeMemory.ts` | Add `getRecentHookUsage(userId, angleId, lookback=N)` returning recently-used dimensions + opening fingerprints for the bias inputs to 23.B2 and 23.B4. | Returns recent usage scoped to the angle; first-time users return empty (no crash, no bias). |
| 23.B7 | `functions/src/generators.ts` | Inject an ANTI-REPETITION block into the cold-angle prompt built from 23.B6: "Within the {angle} angle, you recently used these dimensions and openings: {list}. Pick different dimensions and a different opening rhythm this time." Absent cleanly when memory is empty. | Block present when recent usage exists for that angle; absent (no error) when not. |
| 23.B8 | `functions/src/creativeMemory.ts` | After generation completes, write the angle + dimensions + opening fingerprints back to memory (close the loop so the NEXT project sees them). Fire-and-forget; never blocks generation. | Post-generation write occurs; failure logged, never blocks. |
| 23.B9 | `functions/src/contractFixtures.test.ts` | Add fixtures: (a) blueprints expose ≥6 dimensions per angle as a pool; (b) `selectHookDimensions` never returns the same ordered set twice consecutively for one angle; (c) a recently-used dimension is down-weighted but a sole best-fit dimension is still selectable; (d) the angle stays locked to `coldHookAngle` regardless of dimension rotation; (e) first-time user (empty memory) generates with no bias and no crash; (f) two consecutive same-angle projects differ in dimensions and/or opening structures. | All 6 tests pass. |

**Why not just raise temperature:** temperature randomizes word choice but cannot change the fixed dimension map, cannot loosen the scripted blueprints, and cannot give the model memory across projects. Those three are the actual causes; the existing high temperature is left as-is.

**Note on the angle lock:** the user's selected angle is NOT rotated — it stays locked exactly as the current code enforces. This sub-block only diversifies the dimensions and openings WITHIN that locked angle, plus adds cross-project memory.

---

*Source: `creativeResolver.ts` · `generators.ts` · `entitlements.ts` · `artDirectionConfig.ts` · `retargetingObjections.ts` · `constants.ts` · `types.ts` · `index.ts` · `MagicSelector.tsx` · `WorkspaceSwitcher.tsx` · `creativeMemory.ts` · `rankingEngine.ts` · `metaService.ts` · `billingState.ts` · `textCompositing.ts` · `layoutContract.ts` · `logoComposite.ts` · `reflowOutpaint.ts` · `selectionReviewer.ts` · `conceptDirector.ts` · `varianceValidator.ts` · terminal session decisions · product owner decisions v4 · codebase audit April 11, 2026*
