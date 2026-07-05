# Feature Specification: Phase 14 — RAG + Meta Reporting Feedback Loop

**Feature Branch**: `phase-14-rag-meta`
**Created**: 2026-07-04
**Status**: Draft
**Input**: Phase 14 — RAG + Meta Reporting Feedback Loop (complete 14-section brief). Source of truth for verdict logic: `specs/phase-14/qarar-rulebook.md`.

---

## Section 1 — Overview

Phase 14 closes the loop between real Meta ad performance and Pro Ads AI's generation engine. Today, the AI generates ads based on generic patterns. After Phase 14, the AI generates ads based on **what actually worked in each user's own Meta ad account**.

The system has **7 layers** that build on each other. All 7 must be fully specified — none is deferred to future work.

| Layer | Name | What it does |
|---|---|---|
| **1** | Funnel Settings | User enters their business numbers (AOV, HTO price, etc.) so the system can calculate their target CPA. |
| **2** | Daily Sync | A scheduled function fetches real ad performance from Meta every day at 3am UTC. |
| **3** | Image Matching | Matches Meta ads back to Pro Ads AI generations using image fingerprints (perceptual hashing), because users download images from Pro Ads AI and manually upload them to Meta Ads Manager. |
| **4** | Qarar Verdicts | Each matched creative gets a verdict (🟢 winner / 🟡 watch / 🔴 kill / 🛟 rescue / ⏳ too early) using the Qarar rulebook's creative-level rules. |
| **5** | "What's Working" Dashboard | Shows the user their performance patterns, winning/losing hook angles, visual pattern performance, and unmatched ads. |
| **6** | Hook-Angle Indicators | When choosing a hook angle, each angle shows a performance icon (🔥/✅/⚠️) with a plain-Arabic tooltip based on the account's own history (informational, never blocking). |
| **7** | RAG Injection + Phase 20 Wiring | Silently feeds performance data into generation prompts so the AI learns from the user's history; wires the top 5 winners into the Phase 20 Concept Director's `pastWinningAds` parameter. |

---

## Clarifications

### Session 2026-07-04

- Q: How does the server-side 3am scheduled sync obtain each user's Meta access token (no user session is present)? → A: Store an encrypted long-lived Meta user token captured during OAuth; the scheduled function reads it server-side and refreshes it before expiry.
- Q: How are pre-Phase-14 generations (which have no `imageFingerprint`) matched? → A: Run a one-time backfill migration that computes + stores fingerprints for existing generations so they can auto-match from day one.
- Q: Where do the free-funnel Anchor-1 inputs (`attendanceRate`, `buyRateFromAttendees`) come from — they aren't in the form? → A: Add two conditional number fields to the Funnel Settings form, shown only when the archetype is the free lead-magnet.
- Q: How should the 3am sync scale beyond a single Cloud Function's time limit? → A: A dispatcher enqueues one task per connected account (Cloud Tasks / Pub/Sub); a per-account worker processes each independently with retries, a concurrency cap, and failure isolation.
- Q: What defines "meaningfully below account average" for the ⚠️ hook-angle icon? → A: The angle's average Link CTR is ≤ 75% of the account average (i.e. ≥ 25% below); at/above that margin shows ✅, and the single top angle shows 🔥. Tunable later.
- Q: On a match conflict (manual link vs a later auto-match), which wins and can re-syncs change a link? → A: A manual link is authoritative and locked; auto-match only fills unmatched ads and never changes an ad that already has any link. Re-syncs never alter an existing link.
- Q: If more than one generation is below the hash-distance threshold for a Meta ad, which one matches? → A: Pick the closest (smallest Hamming distance); if the top two candidates are within a small margin of each other (genuinely ambiguous), leave the ad unmatched for manual linking.
- Q: Which creatives count toward the RAG '10+' gate and the per-angle icon gate, and what's the per-angle minimum? → A: Only conversion-objective matched creatives count. RAG activates at ≥ 10 conversion-matched account-wide; an angle shows an icon once it has ≥ 3 conversion-matched ads.
- Q: What retention applies to raw `syncSnapshots`? → A: Keep the last 7 snapshots per account and prune older ones each sync; derived data (adPerformance, aggregates) persists independently.
- Q: What happens to synced data and the Meta token on disconnect vs workspace deletion? → A: Disconnecting Meta deletes the stored token and halts syncs but retains already-synced performance data (survives reconnect); deleting the workspace cascades a full purge of settings, tokens, fingerprints, performance data, and baselines.
- Q: Among S1 winners, which 5 become the Concept Director's `pastWinningAds` "top 5"? → A: The 5 most recently evaluated S1 winners (order by `evaluatedAt` descending), so the model learns from the freshest wins and stale winners age out.
- Q: If a matched source generation is later deleted, what happens to its match and the learning it fed? → A: Keep the historical performance record and its already-applied contribution to aggregates (real data), but revert the ad to "unmatched" for display, stop exposing the deleted generation's metadata, and exclude any winner referencing a deleted generation from `pastWinningAds`.
- Q: How is the 1:1 workspace↔ad-account mapping enforced on conflicting connect attempts? → A: Block both conflicts — a workspace that already has a connected account must disconnect it first before connecting another, and an ad account already connected to any workspace cannot be connected to a second workspace; each blocked attempt shows a plain-Arabic error naming the conflict.
- Q: Does the ROAS target support a custom value, or only the three fixed options? → A: Three fixed options only (1.0 / 0.65 / 0.5); no custom value. `roasTarget` is a strict enum, not an open number.
- Q: When does a dismissed Business Advisory Card reappear? → A: Dismissal persists (a per-card flag on the settings doc); the card stays hidden until the user edits settings so the trigger condition changes and then re-triggers.

---

## User Scenarios & Testing *(mandatory)*

Each layer is an independently testable user story. Priorities reflect dependency + value: Layer 1 is the foundation (target CPA), Layers 2–4 build the data + verdicts, Layers 5–7 surface and apply it. Every story degrades gracefully when its upstream data is absent (see Edge Cases).

### User Story 1 — Funnel Settings & CPA Cap (Layer 1) (Priority: P1)

After connecting a Meta ad account and selecting which account to monitor, the user fills a required "Funnel Settings" form. On save, the system derives their target CPA (paid funnels) or target CPL (free funnels) and, if the chosen ROAS target is too aggressive for the funnel economics, warns and caps at the maximum safe CPA.

**Why this priority**: No verdict, warning, or learning is possible without a per-account target CPA. Standalone value: the user learns the maximum CPA their funnel can economically sustain.

**Independent Test**: Enter AOV $43 / HTO $3,500 / HTO conversion 3% / ROAS 0.5 → verify raw $86 is capped to $74 with a warning, and settings persist per account.

**Acceptance Scenarios** (Section 2.5):
1. AOV $43, HTO $3,500, HTO conversion 3%, ROAS 1.0 → Target CPA $43, fullBuyerValue $148, maxCPA $74. No cap warning. effectiveTargetCPA $43.
2. Same numbers but ROAS 0.5 → rawTargetCPA $86, maxCPA $74. Cap warning shown. effectiveTargetCPA $74.
3. Free lead-magnet funnel → CPL two-anchor model used instead of CPA cap (Anchor 1 from HTO price × attendance × buy rate; Anchor 2 from account's 30-day CPL or manual benchmark).
4. Settings saved → user leaves → returns → all values reload correctly with correct derived targets.
5. Settings older than 30 days → monthly review prompt appears; user dismisses → prompt gone, settings unchanged.
6. Given a user selects "Paid product" with AOV $47, no HTO, ROAS 1.0 → fullBuyerValue = $47, maxCPA = $23.50, rawTargetCPA = $47, effectiveTargetCPA = $23.50. Cap warning shown (rawTargetCPA $47 > maxCPA $23.50). The no-HTO advisory card appears with the book-a-call CTA.
7. Given a user enters AOV $7 → the low-AOV advisory card appears with the book-a-call CTA. The system still calculates the target normally.
8. Given a user selects "Lead magnet → Call" with offer price $3,000 and lead-to-close rate 5% → leadValue = $150, economicCeiling = $105, effectiveTargetCPL = $105.
9. Given a user selects "Free webinar / challenge" with offer price $997, attendance 40%, buy rate 8% → leadValue = $31.90, economicCeiling = $22.33, effectiveTargetCPL = $22.33.

---

### User Story 2 — Daily Sync from Meta (Layer 2) (Priority: P1)

A scheduled Cloud Function pulls the account's campaign→ad-set→ad hierarchy and per-ad performance (across three time windows) from Meta every day at 3am UTC, computes account baselines and per-ad targeting context, then runs matching, verdicts, and learning. The user can also trigger a sync on demand.

**Why this priority**: This is the data feed the entire loop consumes. Without it, Layers 4–7 have nothing to work on.

**Independent Test**: Connect an account, click "Sync Now", verify per-ad performance records, account baselines, and a sync snapshot are stored, and `lastMetaSyncAt` is updated.

**Acceptance Scenarios**:
1. Scheduled run at 3am UTC processes every user with `metaConnected: true`.
2. "Sync Now" runs the same logic for the current user only, and is disabled for 1 hour after the last sync.
3. A partial fetch failure stores what succeeded and leaves last-good aggregates intact.
4. Running the sync twice with the same data produces the same result (idempotent).
5. An expired token marks the account as needing re-auth and surfaces the re-auth prompt without deleting data.

---

### User Story 3 — Image Matching (Layer 3) (Priority: P1)

Because the hook text is baked into the image and users upload images to Meta manually (no in-app push), the system matches Meta ads back to Pro Ads AI generations by perceptual image hash. Auto-matches link all generation metadata; non-matches become "unmatched" ads the user can link manually.

**Why this priority**: Matching is the mechanism that makes performance data attributable to a generation's hook angle / visual pattern. Without it, verdicts and learning cannot attach to creative metadata.

**Independent Test**: Generate an image, upload it to Meta unedited, run a sync → verify auto-match links the generation; upload an unrelated image → verify it appears as unmatched and can be manually linked.

**Acceptance Scenarios**:
1. A generation's image re-uploaded to Meta unedited auto-matches (hash distance below threshold) and exposes hook angle, visual pattern, layout template, art direction, universe, and creative modes.
2. A Meta ad with no close hash match is stored as unmatched.
3. The user links an unmatched ad from the dashboard; the manual link persists permanently.
4. Match type is recorded as `auto_hash` or `manual`.

---

### User Story 4 — Qarar Verdicts (Layer 4) (Priority: P2)

Each matched creative receives a Qarar verdict — a classification with a rule code and an Arabic reason (not a composite score) — by evaluating the creative-level rules in exact order and stopping at the first that fires. Red/yellow verdicts also carry a diagnosis-ladder one-liner.

**Why this priority**: Verdicts are the interpretable output the dashboard shows and the winners RAG/Phase-20 consume (S1). Depends on Layers 1–3.

**Independent Test**: Feed a creative with Link CTR 0.4% at 2,000 impressions → verify 🔴 K3 "الهوك ميت — محدش بيوقف" plus a diagnosis-ladder line; feed a creative meeting S1 → verify 🟢.

**Acceptance Scenarios**:
1. Data gates unmet → ⏳ with an Arabic reason stating what's missing.
2. Today's spend ≥ 2.5× effectiveTargetCPA with 0 conversions → 🔴 (CB2), bypassing other gates.
3. Link CTR < 0.5% after ≥1,500 impressions → 🔴 K3.
4. CPA ≤ effectiveTargetCPA over 3-day rolling + Link CTR > account متوسط → 🟢 S1 "رابح — مؤهل للترقية".
5. Every 🔴/🟡 verdict stores a diagnosis-ladder Arabic one-liner.

---

### User Story 5 — Two-Component Learning (Layer 4b) (Priority: P2)

The system learns performance on exactly two independent components — hook angle (judged by Link CTR) and visual pattern (judged by CPM + Link CTR) — each tagged with geo tier and audience type. The same image across multiple ad sets produces separate context records but is judged by its best result.

**Why this priority**: This is the aggregation that powers the dashboard, hook-angle icons, and RAG. Depends on verdicts (Layer 4).

**Independent Test**: Ingest one image in two ad sets (win in Gulf/broad, lose in diaspora/retargeting) → verify two context records, the creative judged a winner by its best result, and per-angle × geo × audience aggregates updated.

**Acceptance Scenarios**:
1. Hook angle aggregates update from Link CTR; visual pattern aggregates from CPM + Link CTR.
2. Copy/caption is NOT tracked in v1.
3. Same-image-multiple-contexts creates separate records; the creative is judged by its best context.
4. Alias angle ids resolve to canonical before aggregation.

---

### User Story 6 — "What's Working" Dashboard (Layer 5) (Priority: P3)

A new sidebar dashboard shows, in plain Arabic, the account's sync status, summary strip, hook-angle performance, visual-pattern performance, unmatched ads (with manual linking), and a chronological verdicts feed.

**Why this priority**: Makes the loop visible and gives the user the manual-linking surface. Depends on Layers 2–5.

**Independent Test**: With synced data, open the dashboard → verify all six sections render with the user's own numbers and the "Sync Now" button honors the 1-hour cooldown.

**Acceptance Scenarios**:
1. Sync status bar shows last/next sync, connection status, and the cooldown-gated "Sync Now"; token-expired state shows the re-auth prompt.
2. "Your Strongest Angles" section shows a ranked list of hook angles with verdict emoji (🔥/✅/⚠️), the angle name in Arabic, and a plain Arabic count (e.g. "استخدمتها 6 مرات، 4 منها ناجحة") — no CTR percentages, no technical metrics.
3. "Your Strongest Visuals" section shows the same structure for visual patterns.
4. Unmatched ads offer "Link to generation".
5. Recent verdicts feed shows emoji + rule description in plain Arabic (e.g. "🔴 الهوك ميت") — no raw metric values.
6. All Arabic copy uses plain language only — no "متوسط", no "Link CTR", no percentages in any user-facing text.

---

### User Story 7 — Account-Grounded Hook-Angle Indicators (Layer 6) (Priority: P3)

In Step 1, when the user is choosing a hook angle, each angle shows a small performance icon IF the account has enough history for that angle. The icons are:
- 🔥 = strongest angle in the account
- ✅ = performs well (at or above account average)
- ⚠️ = underperforms in this account
- No icon = not enough data yet

Tapping or hovering on the icon shows a one-line Arabic tooltip in plain language (Simple Fusha) — no numbers, no percentages, no technical terms:
- 🔥 → "أقوى زاوية في حسابك"
- ✅ → "أداء جيد في حسابك"
- ⚠️ → "أداء ضعيف في حسابك — جرّب [best angle name] أو [second best]"

The icon is informational only. Nothing is blocked. No popup. No confirmation.

**Why this priority**: This is the visible payoff of account-grounding — the moment the product demonstrably "knows your account." Depends on Layer 5 aggregates.

**Independent Test**: With seeded data where `logical_authority` underperforms and `urgency` is the top angle, open Step 1 → verify ⚠️ appears next to authority, 🔥 next to urgency, and tapping ⚠️ shows the plain Arabic tooltip with no numbers.

**Acceptance Scenarios**:
1. **Given** an angle that is the account's strongest, **When** the user opens Step 1, **Then** a 🔥 icon appears next to that angle.
2. **Given** an angle that performs at or above the account average, **When** shown, **Then** a ✅ icon appears.
3. **Given** an angle that underperforms the account average AND has sufficient data, **When** shown, **Then** a ⚠️ icon appears.
4. **Given** an angle with insufficient history (below data gate), **When** shown, **Then** no icon appears.
5. **Given** no Meta account connected or no synced data, **When** shown, **Then** no icons appear on any angle.
6. **Given** a ⚠️ icon is visible, **When** the user taps/hovers it, **Then** a one-line Arabic tooltip appears naming the account's best angles — no CTR numbers, no percentages, no technical terms.
7. **Given** the user selects an angle with ⚠️, **Then** nothing is blocked — generation proceeds normally.

---

### User Story 8 — RAG Injection + Phase 20 Wiring (Layer 7) (Priority: P3)

Once the account has 10+ matched creatives, the system silently injects performance context into the generation pipeline at three points (hooks, visual plan, Concept Director) and wires the top 5 S1 winners into the Concept Director's `pastWinningAds`. Conservative learning; fail-open; no regression below threshold.

**Why this priority**: Turns learning into better generations. Depends on Layers 4–5.

**Independent Test**: With 10+ matched creatives, generate → verify a PERFORMANCE_CONTEXT block is appended at each injection point and up to 5 S1 winners reach `pastWinningAds`; with <10, verify generation is unchanged.

**Acceptance Scenarios**:
1. <10 matched creatives → RAG injection skipped silently; generation identical to today.
2. ≥10 → hook and visual-plan prompts receive top/worst patterns with the conservative "inform — but not rigidly copy" language.
3. Top 5 S1 winners passed to `pastWinningAds`; empty array when none.
4. Any winners-fetch failure → `pastWinningAds` defaults to empty; generation proceeds (fail-open).

---

### Edge Cases (Section 13)

1. **No Meta account connected** → all layers degrade gracefully. No warnings, verdicts, or RAG injection. Generation works exactly as today.
2. **Connected but no synced data yet** → same as #1; dashboard shows "no data yet" states.
3. **< 10 conversion-matched creatives** → RAG injection skipped silently; hook-angle icons appear only for angles with ≥ 3 conversion-matched ads (others suppressed); dashboard shows what exists, marked "limited data".
4. **Token expired** → show re-auth prompt; don't delete existing data.
5. **Partial sync failure** → keep last-good data; don't corrupt aggregates.
6. **Same image in multiple ad sets** → separate records per context; creative judged by best result; context-specific learning tracked. Additionally, the same image may appear in both a conversion campaign and an `other`-objective campaign (traffic/engagement/awareness/etc.). These are separate contexts: only the **conversion**-campaign result is learned from (and can make the creative a winner); the `other`-objective result is stored for display but is never averaged into learning and never produces a winner.
7. **User edits the hook in Step 2** → the SAVED version (whatever the user actually chose) is stored and later matched/learned from.
8. **Free-funnel vs paid-funnel** → different CPA/CPL calculation models, selected from the funnel archetype dropdown.
9. **rawTargetCPA == maxCPA** → no cap warning; only strictly greater triggers it.
10. **Angle-key aliases** → resolve to canonical before aggregation (`shocking_stat`→`statistics`, `fear_of_missing_out`→`urgency`, `future_pacing`→`future_based`). These three are the complete alias set in the codebase (`gazeMap.ts` / `expressionMap.ts`).
11. **Attribution caveat (Qarar rulebook, March 2026)** → for periods straddling the March 2026 attribution change, show a one-line Arabic banner noting reported conversions may appear lower than actual sales.
12. **Non-conversion campaigns with zero conversions** — When an ad is in a reach, awareness, or engagement campaign, zero conversions is expected behavior. Kill rules K1, K2, CB1, CB2, K6, K7 MUST NOT fire. The system classifies the campaign objective from Meta's API and adjusts the verdict engine accordingly.
13. **Multi-client team workflow** — A team member generates ads for multiple clients under one Pro Ads AI user account, each client in their own workspace. Each workspace has its own Meta ad account connection, its own funnel settings, its own fingerprint index, and its own performance data. The system MUST never search for fingerprint matches across workspaces. If a generation has no workspace assignment (legacy pre-workspace generation), it is excluded from auto-matching and can only be linked manually.
14. **Match conflict (manual vs auto)** — A manual link is authoritative and locked. Auto-match only fills ads with no link yet; a re-sync never overrides an existing link (manual or prior auto). To change a link, the user re-links manually.
15. **Meta disconnect / workspace deletion** — Disconnecting Meta from a workspace immediately **deletes the stored token and halts syncs**, but **retains** already-synced performance data + aggregates (so history survives a reconnect). **Deleting the workspace cascades a full purge** of its settings, tokens, fingerprint index, performance data, and baselines.
16. **Deleted source generation** — If a user deletes a generation that a synced Meta ad is matched to, the **historical performance record and its already-applied contribution to the hook/visual aggregates are retained** (it reflects real ad results). However, the ad **reverts to "unmatched"** in the dashboard and its manual/auto link no longer exposes the deleted generation's metadata, and **any S1 winner that references a deleted generation is excluded from `pastWinningAds`**. Aggregates are not recomputed on delete.

---

## Requirements *(mandatory)*

### Layer 1 — Funnel Settings (Section 2)

**2.1 — When it appears**: After the user connects a Meta ad account (existing OAuth flow in `metaService.ts`) and selects which account to monitor, the app shows a required "Funnel Settings" form **before** any performance data. The system cannot calculate target CPA without these inputs.

**2.2 — Funnel Settings Form**

The form appears inside the workspace context. The header shows the workspace name: "Funnel Settings — [Workspace Name]" / "إعدادات الفانل — [اسم الـ Workspace]". Each workspace has its own independent funnel settings.

All user-facing text is in English or simple Fusha Arabic. No Egyptian dialect. No technical jargon.

**Field 1 — Funnel type** (closed dropdown):
- Paid event / challenge — فعالية أو تحدي مدفوع
- Free webinar / challenge — ويبينار أو تحدي مجاني
- Paid product — منتج مدفوع (دورة، قالب، ورشة)
- Lead magnet → Call — ليد ماجنت → حجز مكالمة

**Conditional fields based on funnel type:**

**If "Paid event / challenge" OR "Paid product":**
- AOV (including bumps and upsells) — number ($). Label: "ما هو متوسط قيمة الطلب؟ (شامل الـ bumps والـ upsells)"
- Has HTO? — Yes/No. Label: "هل لديك عرض High Ticket بعد المنتج الأمامي؟"
  - If Yes: HTO price — number ($). Label: "ما هو سعر الـ High Ticket؟"
  - If Yes: HTO conversion rate — number (%). Label: "من كل 100 عميل أمامي، كم يشتري الـ High Ticket؟"
  - If No: HTO price = 0, HTO conversion rate = 0 in all calculations.
- ROAS target — closed dropdown with plain Arabic labels (exactly these three; **no custom value**):
  - Break even / أريد استرجاع التكلفة (1.0)
  - Invest a bit / أريد استثمار بسيط (0.65)
  - Invest more / أريد استثمار أكبر (0.5)

**If "Free webinar / challenge":**
- Offer price (what they sell at the end) — number ($). Label: "ما هو سعر العرض الذي تبيعه في نهاية الويبينار/التحدي؟"
- Attendance rate — number (%). Label: "من كل 100 مسجّل، كم يحضر؟"
- Buy rate from attendees — number (%). Label: "من كل 100 حاضر، كم يشتري؟"

**If "Lead magnet → Call":**
- Offer price (what they sell on the call) — number ($). Label: "ما هو سعر العرض الذي تبيعه في المكالمة؟"
- Lead-to-close rate — number (%). Label: "من كل 100 ليد، كم يشتري؟"

**2.3 — Derived targets** (computed on save):

- **FR-001** Paid funnels (**Paid product** OR **Paid event / challenge**):
  - `rawTargetCPA = AOV ÷ roasTarget`
  - `fullBuyerValue = AOV + (htoPrice × htoConversionRate / 100)` — *if no HTO: `fullBuyerValue = AOV` (since `htoPrice = 0`)*
  - `maxCPA = fullBuyerValue ÷ 2`
  - `effectiveTargetCPA = min(rawTargetCPA, maxCPA)`
- **FR-002** If `rawTargetCPA > maxCPA`: show a cap warning; the system caps at `maxCPA` and uses the capped value everywhere downstream.
- **FR-003** If `rawTargetCPA == maxCPA`: no warning (exact match is fine).
- **FR-004** Free funnels use the two-anchor CPL model (Qarar §2.3):
  - **Free webinar / challenge:**
    - `leadValue = offerPrice × (attendanceRate / 100) × (buyRateFromAttendees / 100)`
    - `economicCeiling = 0.7 × leadValue`
    - `effectiveTargetCPL = economicCeiling` — *or the 30-day rolling account average CPL if lower, once account data exists.*
  - **Lead magnet → Call:**
    - `leadValue = offerPrice × (leadToCloseRate / 100)`
    - `economicCeiling = 0.7 × leadValue`
    - `effectiveTargetCPL = economicCeiling` — *or the 30-day rolling account average CPL if lower, once account data exists.*

**After-save results card** (plain language, no formulas shown to the user):
- Paid funnels: "أقصى تكلفة للعميل: $[effectiveTargetCPA]. إذا كان إعلانك يجلب عملاء بأقل من هذا المبلغ — فهو ناجح. إذا بأكثر — يحتاج تعديل."
- Free funnels: "أقصى تكلفة للليد: $[effectiveTargetCPL]. إذا كان إعلانك يجلب ليدز بأقل من هذا المبلغ — فهو ناجح. إذا بأكثر — يحتاج تعديل."

**2.4 — Persistence & review**:
- **FR-005** Stored per workspace + ad account at `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings`.
- **FR-006** User fills once; app prompts monthly review (non-blocking advisory). `lastReviewedAt` stored on the settings doc; when older than 30 days, show a gentle Arabic prompt `مر شهر من آخر مراجعة لإعدادات الفانل. هل تريد مراجعتها؟` — dismissible, non-blocking.
- **FR-007** All saved values reload when the user returns.

**2.6 — Business Advisory Cards**

**FR-027** Two conditions trigger advisory cards in the funnel settings results area. These cards appear ABOVE the calculated target CPA/CPL. They are informational, not blocking — the user can dismiss and proceed. Both cards carry the "احجز مكالمة" CTA opening `https://eslamsalah.com/team-discovery-call` in a new tab. Trigger conditions: Card 1 (no High-Ticket) when a paid funnel answers "No" to HTO; Card 2 (low value) when AOV (paid) or offer price (free) < $9.

**Advisory Card 1 — No High-Ticket Offer:**
Trigger: User selects "Paid product" or "Paid event / challenge" AND answers "No" to the HTO question.
Card content (Fusha Arabic + English):
- Title: "ملاحظة مهمة عن مسار المبيعات الخاص بك" (Important note about your funnel)
- Body: "بدون عرض High Ticket، هناك حدود لقدرتك على تقليل تكلفة الإعلانات بسبب زيادة المنافسة. البديل هو زيادة قيمة العميل. لمعرفة ما إذا كان عملك مؤهلاً لعرض High Ticket — احجز مكالمة مع الفريق."
- CTA button: "احجز مكالمة" → opens https://eslamsalah.com/team-discovery-call in a new tab
- Dismissible: yes

**Advisory Card 2 — AOV or Offer Price Below $9:**
Trigger: User enters an AOV (paid funnels) or offer price (free funnels) less than $9.
Card content (Fusha Arabic + English):
- Title: "ملاحظة مهمة عن مسار المبيعات الخاص بك"
- Body: "قيمة العرض أقل من $9 — هذا يجعل الإعلانات المدفوعة صعبة جداً بسبب تكلفة الاستحواذ العالية في السوق. البديل هو زيادة قيمة العميل (من خلال upsells أو عرض High Ticket). لمعرفة ما إذا كان عملك مؤهلاً لزيادة قيمة العميل — احجز مكالمة مع الفريق."
- CTA button: "احجز مكالمة" → opens https://eslamsalah.com/team-discovery-call in a new tab
- Dismissible: yes

Both cards can appear simultaneously (AOV < $9 AND no HTO). The system still calculates the target CPA normally — these cards are advisory only.

**FR-028 — Dismissal persistence**: dismissing a card stores a per-card flag on the settings doc (`advisoriesDismissed.noHto` / `advisoriesDismissed.lowValue`). A dismissed card stays hidden across reloads and re-saves until the user edits settings so its trigger condition changes and then re-triggers (e.g. adding an HTO clears `noHto`; a later save that re-introduces the condition shows the card again).

### Layer 2 — Daily Sync from Meta (Section 3)

**3.1 — Scheduled sync** runs daily at **3am UTC** (also on-demand via "Sync Now"). To stay within Cloud Function execution limits and scale with the user base, a lightweight **dispatcher** (`metaDailySync`) enqueues **one Cloud Task per connected account** (`metaConnected: true`) onto the `metaSyncQueue` Cloud Tasks queue (chosen per Phase 14 research §B — Pub/Sub was considered and rejected: weaker per-message retry/concurrency ergonomics); a **per-account worker** (`metaSyncAccountWorker` `onTaskDispatched`) processes each account independently, with retries (`maxAttempts: 3`), a concurrency cap (`maxConcurrentDispatches: 5`), and per-account failure isolation (one account's failure never blocks others). For each account the worker performs:
1. **Token check** — read the account's **encrypted long-lived Meta user token** stored server-side at `users/{uid}/workspaces/{wid}/private/metaConnection`, **KMS-envelope-encrypted** (chosen per Phase 14 research §C — Google Secret Manager was considered and rejected for per-workspace-account scaling reasons, and plaintext in Firestore is forbidden by security policy); decrypt server-side (no user session is present at 3am), validate, and refresh the long-lived token proactively before expiry (reusing/extending `metaService.ts` token logic). If refresh fails, mark the account for re-auth (`needsReauth: true`, FR-009) — **never** delete performance data.
2. **Fetch hierarchy** — Campaigns `GET /act_{adAccountId}/campaigns?fields=id,name,status,daily_budget,lifetime_budget`; Ad sets `GET /{campaignId}/adsets?fields=id,name,status,daily_budget,targeting`; Ads `GET /{adSetId}/ads?fields=id,name,status,creative`.
3. **Fetch performance** (Insights) across three windows (Qarar §A3.5): 3-day rolling `time_range={'since':'<today-2>','until':'<today>'}`; today only `date_preset=today`; last 7 days daily `date_preset=last_7d, time_increment=1`. Fields on every insights call: `impressions,reach,frequency,clicks,inline_link_clicks,ctr,inline_link_click_ctr,spend,cpm,cpc,actions,action_values,cost_per_action_type,date_start,date_stop`.
4. **Account baselines** (once per sync): 90-day متوسط Link CTR (`level=ad&date_preset=last_90d`, averaged across ads); 14-day متوسط CPM (`date_preset=last_14d`); 30-day متوسط CPA/CPL (`date_preset=last_30d`).
5. **spend_share_pct** per ad within its ad set: `ad.spend_3d ÷ sum(all ads' spend_3d in same ad set) × 100`.
6. **Targeting context** per ad from the parent ad set:
   - Geo tier: Saudi/UAE/Kuwait/Qatar/Bahrain/Oman → **Tier 1 (Gulf)**; US/Canada/UK/Europe/Australia → **Tier 2 (Diaspora)**; Egypt/Jordan/Morocco/Algeria/Tunisia → **Tier 3 (Egypt/North Africa)**.
   - Audience type: no interests/custom/lookalikes → **Broad**; interest targets → **Interest**; lookalike source → **Lookalike**; website/engagement custom audience → **Retargeting**; Advantage+ Audience → **Advantage+**.
7. **Image matching** (Section 4) to link each Meta ad to a generation. Fingerprint comparison MUST be scoped to the **workspace** the ad account is connected to — the system only searches generations within that workspace; cross-workspace matching is forbidden.
8. **Qarar verdict engine** (Section 5) on each matched ad.
9. **Component-level performance records** update (Section 6).
10. **Store result** with timestamp; update `lastMetaSyncAt` on the user doc.

**3.2 — Manual "Sync Now"**: callable `triggerMetaSync` runs the same logic for the current user only; button disabled for 1 hour after the last sync; shows last sync timestamp.

**3.3 — Error handling**:
- **FR-008** Rate limits → exponential backoff; large accounts use async insights (`POST /{id}/insights` → poll `report_run_id`).
- **FR-009** Token expired → mark account needing re-auth; show `اتصالك بميتا انتهى — وصّل تاني` with re-auth button.
- **FR-010** Partial failure → store what succeeded; never corrupt existing data; last-good aggregates remain until a full successful sync replaces them.
- **FR-011** Sync is idempotent — running twice with the same data produces the same result.

**3.4 — What gets stored per sync**:
- `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/syncSnapshots/{snapshotId}` — raw fetched data with timestamp. **Retention: keep the last 7 snapshots per account; each sync prunes older ones.** Derived data (`adPerformance`, aggregates, baselines) persists independently and is not pruned.
- `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/adPerformance/{adId}` — per-ad records with all time windows.
- `users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/baselines` — account baselines (90-day CTR, 14-day CPM, 30-day CPA).

### Layer 3 — Image Matching (Section 4)

**4.1 — Why needed**: The hook text is baked INTO the image by gpt-image-2; users download and manually upload to Meta Ads Manager — no in-app push, so no `metaAdId` link. Perceptual-hash matching is the **PRIMARY** matching mechanism (not a dedup tool).

**4.2 — How it works**:
1. **At generation time**: in `serverGenerateFinalAd`, **after** the image is uploaded to Firebase Storage, compute a perceptual hash and store it on the generation record.
2. **At sync time**: for each Meta ad — (a) get the creative image URL (`creative` → `image_url` or `thumbnail_url`), (b) download, (c) compute perceptual hash, (d) compare against all stored generation hashes within the workspace that this ad account belongs to.
3. **Match evaluation**: distance below threshold → **AUTO-MATCH** (link the generation; all metadata — hook angle, visual pattern, layout template, art direction, universe, creative modes — becomes available); above threshold → **NO MATCH** (store as "unmatched" for manual linking). **When multiple generations fall below the threshold**, pick the **closest** (smallest Hamming distance); if the two closest candidates are within a small margin of each other (genuinely ambiguous), leave the ad **unmatched** for manual linking rather than risk wrong attribution. (Exact-tie fallback: prefer the most recent generation.)
4. **Manual fallback**: the dashboard shows unmatched ads; "Link to generation" lets the user pick the source generation — the picker MUST show **only generations from the same workspace** as the ad account (no cross-workspace linking); the manual link is stored permanently.
5. **One-time backfill (rollout)**: a migration downloads each existing generation's stored image, computes its `imageFingerprint`, and writes it (plus the `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` index) so **pre-Phase-14 generations can auto-match from day one**. Idempotent (skips generations that already have a fingerprint); generations whose source image is missing remain unmatched (manual-link only). The backfill only processes generations that have a workspace assignment. Unassigned legacy generations (created before the workspace feature was in use) are skipped and can only be matched manually via the dashboard.

**4.3 — Match types & precedence**: `auto_hash` (perceptual hash) or `manual` (user-linked). **Precedence**: a manual link is **authoritative and locked**. Auto-match only ever fills ads that have **no link yet**; a re-sync NEVER changes an ad that already carries a link (manual or a prior `auto_hash`). Once linked, the link is stable across syncs unless the user explicitly re-links it manually.

**4.4 — Technical notes**:
- **FR-012** The perceptual-hashing library must work in a Node.js Firebase Cloud Functions environment.
- **FR-013** Hashes must survive JPEG compression, re-upload quality loss, and minor format changes.
- **FR-014** The server computes the perceptual hash after image generation and returns it in the response payload to the client. The client then writes the `imageFingerprint` field to the generation document it creates via `addDoc`. This follows the trace-persistence-across-HTTP-boundary pattern (server cannot write to a doc that doesn't exist yet — the client creates the doc and writes the hash).
- **FR-015** The client also writes to a queryable index `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` → `{ generationId, createdAt }` after creating the generation doc.

**4.5 — What does NOT work (and why)**: text matching against Meta's `primary_text` fails (hook is text ON the image, not the primary-text field below it); `metaAdId` matching fails (upload is manual, outside the app — no in-app push creates the link).

### Layer 4 — Qarar Verdict Engine (Section 5)

**5.1** Each matched creative gets a Qarar verdict — a classification with a rule code and an Arabic reason (not a composite score), following the Qarar rulebook exactly.

**5.2 — Creative-level rules** (evaluate in this exact order; STOP at the first that fires):

> **Unified target (paid CPA / free CPL)**: The engine uses a single `effectiveTarget` variable that equals `effectiveTargetCPA` for paid funnels (paid event/challenge, paid product) or `effectiveTargetCPL` for free funnels (free webinar/challenge, lead magnet → call), selected from the funnel settings. Wherever a rule below references `effectiveTargetCPA` — the data gate (`spend ≥ 1× target`), circuit breaker CB1/CB2, K1/K2, and S1 — free funnels substitute `effectiveTargetCPL` and evaluate **cost-per-lead** instead of cost-per-acquisition. The rules, thresholds, and multipliers are identical; only the target value and the cost metric change.

- **Step 1 — Data gates** (must pass before any verdict): CTR judgment needs ≥ 2,000–3,000 impressions OR spend ≥ 1× effectiveTargetCPA (whichever first); exception — Link CTR < 0.5% may be called at 1,500 impressions; ad must be ≥ 48 hours old; always 3-day rolling, never single day (except circuit breaker). If not met → **⏳ (too early)** with an Arabic reason stating what's missing.
- **Step 2 — Circuit breaker** (today's data only; bypasses all other gates): **CB1** today's spend ≥ 1.5× effectiveTargetCPA with 0 conversions → **🟡 Watch**; **CB2** today's spend ≥ 2.5× effectiveTargetCPA with 0 conversions → **🔴 Kill**.
- **Step 3 — Kill rules**:
  - **K3** Link CTR < 0.5% after 1,500–3,000 impressions → **🔴** Dead hook — `الهوك ميت — محدش بيوقف`.
  - **K4** Day-1 peak then ≥ 50% drop by day 3 (72-hour decay) → **🔴** Flash creative — `كريتف فلاش — اتحرق في يوم`.
  - **K5** Ad gets < 10% of the ad set's spend for 3 days AND is > 48h old → **starved-ad matrix**: ad set hitting target + ad normal/weak → leave it (no verdict change); ad set losing + ad weak (CTR below account متوسط, no conversions) → **🔴 Kill**; any ad-set state + ad shows high efficiency on its small spend (Link CTR above account متوسط OR CPA ≤ target on its sample) → **🛟 Rescue** — `رابح مخنوق — انقله لـ ad set جديد`.
- **Step 4 — Fatigue detection** (previously-winning ads): Link CTR dropped ≥ 25–30% from its 3-day peak while CPM stable → **🟡** exhaustion — `إنهاك إبداعي — جدّد الكريتف`; CPM rising on this specific ad vs account متوسط → **🟡** algorithm penalty — `الخوارزمية بتعاقب الكريتف ده`.
- **Step 5 — Continue/Scale**: **S1** CPA ≤ effectiveTargetCPA over 3-day rolling + Link CTR > account متوسط → **🟢** Winner — `رابح — مؤهل للترقية`; if none fired and gates met → **🟡** — `شغال — راقب`.

**5.3 — Ad-set-level rules** (tracked for dashboard display only; do NOT affect creative learning): **K1, K2, K6, K7, W1–W6, S2–S4**. The dashboard may show these at the ad-set level, but the RAG system learns **only** from creative-level verdicts (K3, K4, K5, fatigue, S1).

> **Deferred from Phase 14 v1**: Ad-set-level verdicts (K1, K2, K6, K7, W1–W6, S2–S4) are **not computed in v1** — no task implements them, and the dashboard shows **creative-level verdicts only**. This includes the free-funnel CPL kill rules K6/K7 at the ad-set level. Ad-set-level verdicts may be added in a future iteration.

**5.4 — Diagnosis ladder** (Qarar Part 8; for every 🔴/🟡, run top-down, stop at the first broken level; output a one-line Arabic string stored with the verdict):
1. **CPM** — high on this ad vs account متوسط → creative-quality problem; high account-wide → market/season.
2. **Link CTR** — low despite normal CPM → the hook is the problem.
3. **CTR-All vs Link CTR** — CTR-All high but Link CTR low → ad entertains but doesn't drive action; mid-copy or CTA weak.
4. **LP View Rate** — LP views ÷ link clicks < 75% → check page speed first, then congruency (ad promise ≠ landing page).
5. **Page CVR** — good LP views but no conversions → the page/offer is the problem, not the ad (`الإعلان بريء`).
6. **Post-conversion** — leads/sales good but no HTO → nurture/emails/show-up problem.

**5.5 — Output shape per ad**:
```
{
  adId: string,
  generationId: string | null,            // null if unmatched
  matchType: 'auto_hash' | 'manual' | null,
  verdict: '🟢' | '🟡' | '🔴' | '🛟' | '⏳',
  ruleCode: string,                        // e.g. "K3", "S1", "CB2", "fatigue"
  reasonAr: string,                        // Arabic one-liner
  diagnosisAr: string | null,              // Arabic diagnosis (for 🔴/🟡)
  spend3d: number, spendToday: number, impressions3d: number,
  cpa3d: number | null, ctrLink: number, ctrAll: number,
  conversions3d: number, frequency3d: number, spendSharePct: number, ageDays: number,
  geoTier: 'tier1_gulf' | 'tier2_diaspora' | 'tier3_egypt_na',
  audienceType: 'broad' | 'interest' | 'lookalike' | 'retargeting' | 'advantage_plus',
  campaignObjective: 'conversion' | 'other',
  evaluatedAt: timestamp
}
```

**5.6 — Campaign Objective Classification**

When the daily sync fetches ads from Meta, it reads the campaign's `objective` field and classifies each ad into one of **two** categories:

| Meta Objective Value | System Category | Treatment |
|---|---|---|
| OUTCOME_SALES, CONVERSIONS, LEAD_GENERATION, OUTCOME_LEADS | **conversion** | The user wants purchases or leads. The **full Qarar verdict engine** applies, **learning is active** (hook + visual aggregates), and this data feeds **RAG injection** and **Phase 20 `pastWinningAds`**. |
| **All other objectives** — traffic, engagement, awareness, reach, messages, app installs, video views, **and any unknown/unmapped objective** | **other** | Data is **stored and shown on the dashboard**, but **EXCLUDED from all learning** (hook angle aggregates, visual pattern aggregates, RAG injection, Phase 20 `pastWinningAds`). **No CPA-based Qarar verdicts** apply. Only **K3** (dead hook — Link CTR < 0.5%) and **K4** (72-hour decay) apply, as basic creative-quality checks — a dead hook is dead regardless of campaign type. |

Any unknown/unmapped objective always falls into **other** (fail-safe: an unrecognized objective can never pollute conversion learning).

**5.6.1 — Which Qarar rules apply per category:**

| Rule | Conversion | Other |
|---|---|---|
| Data gates | ✅ Full gates | ✅ Impressions gate only (no CPA gate) |
| Circuit breaker CB1/CB2 | ✅ Applies | ❌ Disabled |
| K1 (2x target, zero conversions) | ✅ Applies | ❌ Disabled |
| K2 (3x target, CPA > 1.5x) | ✅ Applies | ❌ Disabled |
| K3 (Link CTR < 0.5%) | ✅ Applies | ✅ Applies |
| K4 (72-hour decay) | ✅ Applies | ✅ Applies |
| K5 (starved ad matrix) | ✅ Applies | ❌ Disabled |
| K6/K7 (CPL rules) | ✅ Applies (free funnels) | ❌ Disabled |
| Fatigue detection | ✅ Applies | ❌ Disabled |
| W1-W6 (watch rules) | ✅ Applies | ❌ Disabled |
| S1 (winner — CPA ≤ target + CTR > avg) | ✅ Applies | ❌ Disabled (no winner classification) |

> The "Applies" column describes **objective-gating** (conversion vs other). K1, K2, K6/K7, and W1–W6 are **ad-set-level** rules **deferred from v1** (§5.3) — the column states how they will be gated once implemented, not that v1 computes them. v1 computes only the creative-level rules (data gates, CB1/CB2, K3, K4, K5, fatigue, S1). For free funnels every "target"/CPA reference above resolves to `effectiveTargetCPL` / cost-per-lead (§5.2).

**5.6.2 — S1 winner criteria:**

- **Conversion:** CPA ≤ effectiveTargetCPA over 3-day rolling + Link CTR > account متوسط → 🟢 Winner (unchanged). For **free funnels**, substitute cost-per-lead: CPL ≤ effectiveTargetCPL over 3-day rolling + Link CTR > account متوسط → 🟢 Winner (identical rule; only the target value and cost metric change, per §5.2).
- **Other:** No winner classification. 'Other'-objective ads never become 🟢/S1 winners and are never fed to learning, RAG, or `pastWinningAds`.

**5.6.3 — Learning separation by objective:**

Performance tracking (Section 6) tags each record with campaign objective as a **third context dimension** alongside geo tier and audience type, but **only the `conversion` category is learned from**. `other`-objective data is stored for dashboard display and is NEVER averaged into the learning aggregates that drive the hook-angle icons, RAG injection, or winners.

The three context dimensions for every performance record are:
1. **Geo tier**: Gulf / Diaspora / Egypt-North Africa
2. **Audience type**: Broad / Interest / Lookalike / Retargeting / Advantage+
3. **Campaign objective**: Conversion / Other (only **Conversion** feeds learning)

**5.6.4 — Dashboard grouping:**

The "What's Working" dashboard (Section 7) shows the **conversion** category in its ranked learning sections ("أقوى زواياك" / "أقوى تصميماتك"). `other`-objective ads are shown in a separate, informational, non-ranked list (and in the verdicts feed) so the user can see them, but they never appear in the learning rankings. If the user runs only conversion campaigns, no `other` section appears.

**5.6.5 — Icon defaults:**

The 🔥/✅/⚠️ icons next to hook angles in Step 1 (Section 8) are based on **conversion campaign data only**. If a hook angle has only `other`-objective data (no conversion data), **no icon appears** for that angle. There is no fallback to `other` data.

**5.6.6 — RAG & winners scope:**

RAG injection (Section 9) and Phase 20 `pastWinningAds` (Section 10) use **conversion campaign data only**. `other`-objective performance is never injected and never contributes winners — regardless of how much `other` data the account has.

### Layer 4b — Two-Component Learning (Section 6)

**6.1 — What gets learned** (exactly two components, scored independently):
- **Component 1 — Hook Angle**: tracks the hook angle the user selected/edited in Step 2; judged by **Link CTR**; independent because a great hook can fail with a bad visual — judge the hook by attention attracted, not the visual it was paired with.
- **Component 2 — Visual Pattern**: tracks layout template + creative mode + art direction + universe; judged by **CPM + Link CTR**; independent because a great visual can fail with a weak hook — judge the visual by algorithm value (CPM) and stopping power.
- **NOT tracked in v1 — Copy/Caption**: users heavily edit captions, so the signal reflects the user's edits, not Pro Ads AI's copy quality; excluded from v1 to avoid noise; a copy engine can learn from its own data later.

**6.2 — Context dimensions** (each performance record tagged with three):
- **Geo tier**: Tier 1 Gulf (Saudi, UAE, Kuwait, Qatar, Bahrain, Oman); Tier 2 Diaspora (US, Canada, UK, Europe, Australia); Tier 3 Egypt/NA (Egypt, Jordan, Morocco, Algeria, Tunisia).
- **Audience type**: Broad / Interest / Lookalike / Retargeting / Advantage+ (as classified in Section 3 Step 6).
- **Campaign objective**: Conversion / Other (from the campaign's Meta `objective`; see §5.6). Only **Conversion** feeds learning; `other`-objective results are stored for display and NEVER averaged into learning.

**6.3 — Same-creative-multiple-contexts**: when the same image appears in multiple ad sets (same fingerprint): (1) create **separate** performance records per context (each ad set, all linked to the same generation); (2) judge the **creative** by its **best** result across contexts (a win anywhere = the creative works; failure elsewhere was a context problem); (3) track (for the `conversion` category only) by hook angle × geo tier × audience type, building a multi-dimensional map (e.g. "urgency hooks work in the Gulf with broad targeting, but not with diaspora retargeting"). `other`-objective results are stored but not part of this learning map.

**6.4 — Firestore structure**:
```
users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/hookPerformance/{angleKey}
  → { angleKey, sampleSize, lastUpdated,
      byObjective: {
        conversion: { avgLinkCtr, count, bestVerdictCount, worstVerdictCount },  // the ONLY bucket used for icons / RAG / winners / learning
        other:      { avgLinkCtr, count } },                                     // display-only; NEVER learned from
      byGeoTier: { tier1: { avgCtr, count }, ... },     // conversion-only
      byAudienceType: { broad: { avgCtr, count }, ... } } // conversion-only

users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/visualPerformance/{patternKey}
  → { patternKey (hash of template+mode+artDirection+universe), sampleSize, lastUpdated,
      byObjective: { conversion: { avgCpm, avgLinkCtr, count, ... }, other: { count } },  // conversion learned; other display-only
      byGeoTier: {...}, byAudienceType: {...} }
```

**6.5 — Angle-key aliases**: resolve to canonical before aggregation — `shocking_stat`→`statistics`, `fear_of_missing_out`→`urgency`, `future_pacing`→`future_based`. (These three are the complete alias set present in the codebase: `gazeMap.ts` and `expressionMap.ts`.)

### Layer 5 — "What's Working" Dashboard (Section 7)

**7.1** A new sidebar dashboard showing Meta ad performance patterns in plain Arabic, organized by what Pro Ads AI can learn from.

**7.2 — Sections**:
- **A — Sync Status Bar**: last sync timestamp; next scheduled sync; "Sync Now" (disabled 1h after last sync); connection status; if token expired `اتصالك بميتا انتهى — وصّل تاني` + re-auth button.
- **B — Summary Strip**: total spend last 3 days; matched ads / total ads; count of 🟢/🟡/🔴 verdicts. No CTR or CPA numbers — just the verdict counts.
- **C — "أقوى زواياك" (Your Strongest Angles)**: a ranked list of hook angles the user has used. Per angle: Arabic angle name; verdict emoji (🔥 strongest / ✅ good / ⚠️ weak); plain Arabic count "استخدمتها X مرات، Y منها ناجحة" (used X times, Y were winners). If geo tier or audience type data exists, show sub-lines like "أقوى في الخليج" (strongest in Gulf) or "ضعيفة مع الريتارجتنج" (weak with retargeting) — plain Arabic, no percentages. Sorted by win count descending.
- **D — "أقوى تصميماتك" (Your Strongest Visuals)**: same structure as C but for visual patterns — pattern description (e.g. "Standard Hero + Realistic"); verdict emoji; plain Arabic count. Sorted by win count descending.
- **E — "إعلانات بحاجة إلى ربط" (Ads That Need Linking)**: Meta ads the system couldn't auto-match. Per ad: ad name from Meta; thumbnail (if available); "Link to generation" button → opens a picker of recent Pro Ads AI generations **from the same workspace as the ad account** (no cross-workspace linking) → user picks one → manual match created and stored permanently.
- **F — "آخر الأحكام" (Recent Verdicts)**: chronological feed of recent verdicts. Per entry: ad name; verdict emoji + plain Arabic description (e.g. "🟢 رابح — مؤهل للترقية" or "🔴 الهوك ميت — محدش بيوقف"); timestamp. No raw metric values.

**7.3** All user-facing Arabic copy uses plain language only. No technical metric names (CTR, CPM, CPA), no percentages, and no statistical terms ("متوسط", "ميديان") appear in the UI. These terms exist only in internal code, comments, and logs.

### Layer 6 — Hook Angle Performance Icons (Section 8)

**8.1 — Where**: In Step 1 of the generation flow, next to each hook angle in the angle selector. Also in Step 2 next to each generated hook card (if the hook's angle has performance history).

**8.2 — Icon logic** (internal — user doesn't see the calculation): The system checks the user's hookPerformance data (from Section 6) for each angle. It compares that angle's average Link CTR against the account's overall average Link CTR. Based on this comparison:
- Angle is the single top performer (highest avg Link CTR with sufficient data) → 🔥 (takes precedence over ✅)
- Angle's avg Link CTR is > 75% of the account average (within 25% below, at, or above) → ✅
- Angle's avg Link CTR is ≤ 75% of the account average (i.e. ≥ 25% below) → ⚠️
- Angle has fewer than 3 conversion-objective matched ads → no icon

**Data gate**: an angle needs **≥ 3 conversion-objective matched ads** before ANY icon (🔥/✅/⚠️) appears; only conversion-objective data is used (see §5.6.5). The 75% margin (≥25% below) is the default ⚠️ threshold and is tunable later without changing the icon contract.

**8.3 — Tooltip text** (shown on tap or hover — one line, plain Arabic / Simple Fusha, no numbers):
- 🔥 → "أقوى زاوية في حسابك" (Your strongest angle)
- ✅ → "أداء جيد في حسابك" (Performs well in your account)
- ⚠️ → "أداء ضعيف في حسابك — جرّب [name of 🔥 angle] أو [name of second best]" (Weak in your account — try [best] or [second best])

**8.4 — When icons do NOT appear**: angle lacks sufficient history (below the gate); no Meta account connected; no synced data yet.

**8.5 — Behavior**: Icons are informational only. Selecting an angle with ⚠️ does NOT block generation, show a popup, or require confirmation. The user proceeds normally.

**8.6** No user-facing text shows percentages, "متوسط", "Link CTR", or any other technical metric. The calculation is entirely internal.

**Layer 6 — Functional Requirements**:
- **FR-016** When a user opens the hook-angle selector in Step 1, System MUST compare each angle's account-level average Link CTR against the account's overall average Link CTR (internal calculation — result not shown to the user as numbers).
- **FR-017** System MUST display a performance icon (🔥/✅/⚠️) next to each hook angle that has sufficient account history, based on the internal comparison.
- **FR-018** System MUST show a one-line plain Arabic tooltip on tap/hover of the icon. The tooltip MUST name the user's best-performing angles by name. The tooltip MUST NOT contain any numbers, percentages, or technical metric names.
- **FR-019** All user-facing Arabic copy MUST use plain language only. No "متوسط", no "ميديان", no "Link CTR", no "CTR", no "CPA", no "CPM" in any UI text visible to the user. Technical terms exist only in internal code and logs.
- **FR-020** Icons MUST be informational only. Selecting an angle with ⚠️ MUST NOT block generation, show a popup, or require confirmation.
- **FR-021** System MUST NOT show icons when the angle lacks sufficient account history (below the data gate), no Meta account is connected, or no synced data exists.
- **FR-022** System MUST resolve angle-key aliases to their canonical angle before aggregation and lookup (same as before).

### Layer 7a — RAG Injection into Generation (Section 9)

**9.1** On generation, silently inject the user's performance history into the AI's prompts so it generates smarter creatives.

**9.2 — Activation threshold**: RAG injection activates only after **10+ conversion-objective matched creatives** with performance data (only conversion data feeds RAG; `other`-objective matches never count toward this gate). Below 10 → skipped silently; generation proceeds exactly as today (no regression).

**9.3 — Learning aggressiveness**: conservative. Prompt language must include: "Use this to inform — but not rigidly copy — what you generate. The user's history suggests patterns, not rules."

**9.4 — Injection points** (three):
- **Point 1 — Hook generation** (`generateHooks` / `generateTOV` in `generators.ts`): before generating hooks, query `hookPerformance`; inject a PERFORMANCE_CONTEXT block with top-performing angles (+ متوسط Link CTR), worst angles to avoid, and (if the selected angle has history) its track record. Language: "Based on this user's own ad account data: [data]. Use this to inform — but not rigidly copy — the hooks you generate."
- **Point 2 — Build plan / visual generation** (`generateBuildPlan` in `generators.ts`): before the visual plan, query `visualPerformance`; inject a PERFORMANCE_CONTEXT block with top-performing visual patterns and underperformers. Language: "This user's best-performing visual compositions: [data]. Lean toward these patterns while maintaining creative variety."
- **Point 3 — Concept Director** (`conceptDirector.ts`): the Phase 20 wiring (Section 10).

**9.5 — RAG context structure**: `getRAGContext({ userId, adAccountId, inputs: { hookAngle?, creativeModes?, layoutTemplate?, artDirection?, universe? } })` returns `{ topPerformers: [top 3 matching inputs], avoid: [bottom 3], insights: string, sampleSize: number, insufficient: boolean (sampleSize < 10) }`.

**9.6 — Integration with existing code**: existing `retrieveCreativePatterns()` and `buildPersonalizationContext()` in `generators.ts` already inject personalization context; the Phase 14 RAG block is **APPENDED** to that existing context — it does not replace it. Existing functions keep working; Phase 14 adds a new block after them.

### Layer 7b — Phase 20 Wiring (Section 10)

**10.1** The Phase 20 Concept Director (`conceptDirector.ts`) has a `pastWinningAds` parameter (currently defaults to empty array — confirmed `pastWinningAds: ReadonlyArray<unknown>`). Phase 14 wires it with real data.

**10.2 — What gets passed**: the **5 most recently evaluated** creatives with an **S1** verdict (CPA ≤ effectiveTargetCPA over 3-day rolling + Link CTR > account متوسط), ordered by `evaluatedAt` descending so the freshest wins are used and stale winners age out. Per winner: `hookAngle`, `hookText` (the text on the image), `layoutTemplate`, `creativeModes`, `artDirection`, `universe`, and performance metrics (Link CTR, CPA, CPM).

**10.3 — How the Concept Director uses it**: (1) understand what visual/hook patterns work for this user; (2) ensure new concepts are DIFFERENT from past winners (variety) while learning what made them work; (3) if empty, work exactly as today (no regression).

**10.4 — Fail-open**: any winners-fetch failure → `pastWinningAds` defaults to empty; generation proceeds normally; non-blocking.

### Functional Requirements — cross-cutting

- **FR-023** All settings, performance records, aggregates, verdicts, fingerprints, and winners are scoped **per WORKSPACE and per ad account**. Data from one workspace is never mixed with data from another workspace, even when both belong to the same user.
- **FR-024** All Arabic UI copy uses the Fusha term **"المعدل"** (or appropriate Fusha phrasing) when an "average" concept must be displayed — NEVER "متوسط" (which is the internal-only technical term per SC-11) and NEVER "ميديان" (which is the forbidden English transliteration). This aligns FR-024 with SC-11 + FR-019 + §7.3 + §8.6 and removes the prior wording conflict.
- **FR-025** No regression: users without a Meta connection or below data thresholds see exactly the same generation behavior as before Phase 14.
- **FR-026** The 1:1 workspace↔ad-account mapping MUST be enforced at connect time by **blocking both conflict directions**: (a) if the workspace already has a connected ad account, the connect action is blocked until the user disconnects the existing one (disconnect follows Edge Case 15 — token deleted, synced data retained); (b) if the chosen ad account is already connected to any other workspace (same user), the connect action is blocked. Each blocked attempt surfaces a plain-Arabic error naming the specific conflict; no silent replacement and no override path exists.

## Key Entities

- **Funnel Settings** (`users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/settings`) — one of four funnel types with conditional fields:
  ```
  {
    funnelType: 'paid_event' | 'free_webinar' | 'paid_product' | 'lead_magnet_call',

    // Paid funnels only (paid_event, paid_product)
    aov: number | null,
    hasHto: boolean,
    htoPrice: number,            // 0 if hasHto=false
    htoConversionRate: number,   // 0 if hasHto=false (stored as percentage, e.g. 3 for 3%)
    roasTarget: 1.0 | 0.65 | 0.5,  // strict 3-option enum — no custom value (FR-001, contract §funnelSettings.md)

    // Free webinar/challenge only
    offerPrice: number | null,
    attendanceRate: number | null,        // percentage
    buyRateFromAttendees: number | null,  // percentage

    // Lead magnet → Call only
    // offerPrice: reused from above
    leadToCloseRate: number | null,       // percentage

    // Derived (computed on save, not editable)
    effectiveTargetCPA: number | null,    // paid funnels
    effectiveTargetCPL: number | null,    // free funnels
    fullBuyerValue: number | null,
    maxCPA: number | null,
    rawTargetCPA: number | null,

    // Metadata
    lastReviewedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp
  }
  ```
- **Ad Performance Record** (`.../adPerformance/{adId}`) — per-ad metrics across 3-day / today / 7-day windows, spend share, geo tier, audience type.
- **Sync Snapshot** (`.../syncSnapshots/{snapshotId}`) — raw fetched data with timestamp.
- **Account Baselines** (`.../baselines`) — 90-day Link CTR, 14-day CPM, 30-day CPA/CPL.
- **Qarar Verdict** — the per-ad output shape (§5.5) with rule code, Arabic reason, and diagnosis.
- **Hook Performance Aggregate** (`users/{uid}/workspaces/{workspaceId}/adAccounts/{accountId}/hookPerformance/{angleKey}`) and **Visual Performance Aggregate** (`.../visualPerformance/{patternKey}`) — §6.4; each carries `byObjective` (`conversion` learned; `other` display-only), `byGeoTier`, `byAudienceType`.
- **Workspace** — the per-client container (`users/{uid}/workspaces/{workspaceId}`). Maps 1:1 to a single Meta ad account; owns that account's settings, fingerprint index, performance data, and baselines. Data never crosses workspaces.
- **Image Fingerprint** — `generations/{genId}.imageFingerprint` (+ `workspaceId` on the generation) + the workspace-scoped `users/{uid}/workspaces/{workspaceId}/imageFingerprints/{hash}` index.
- **Match** — `auto_hash` or `manual` link between a Meta ad and a generation.
- **Past Winning Ad** — an S1 winner passed to the Concept Director's `pastWinningAds`.
- **Meta Connection** — one per workspace (the workspace's single connected ad account, per the 1:1 mapping): `metaConnected` flag, the connected ad-account id, the **encrypted long-lived Meta user token** + expiry, `lastMetaSyncAt`, and a re-auth-needed flag. Stored server-side (encrypted at rest); read by the scheduled sync. On **disconnect**, the token is deleted and syncs halt while synced performance data is retained; on **workspace deletion**, everything is purged (Edge Case 15).

## Success Criteria *(mandatory)* — Definition of Done (Section 14)

- **SC-1**: A user can enter funnel economics, see derived targets with correct CPA cap logic, and settings persist per account.
- **SC-2**: The daily sync function fetches real Meta performance data and stores it correctly.
- **SC-3**: Image fingerprint matching links Meta ads to Pro Ads AI generations with **> 90% accuracy for unedited uploads**.
- **SC-4**: Each matched creative gets a Qarar verdict (🟢🟡🔴🛟⏳) with the correct rule code and Arabic reason.
- **SC-5**: The "What's Working" dashboard shows hook-angle performance, visual-pattern performance, unmatched ads, and verdict feed.
- **SC-6**: Performance icons (🔥/✅/⚠️) appear next to hook angles in Step 1 when data exists. Tapping/hovering shows a plain Arabic tooltip with no numbers or technical terms.
- **SC-7**: RAG injection adds performance context to generation prompts after 10+ matched creatives.
- **SC-8**: The Phase 20 Concept Director receives the top 5 S1-verdict winners in `pastWinningAds`.
- **SC-9**: Same-creative-multiple-contexts is handled correctly (best result for the creative; separate tracking per geo tier and audience type).
- **SC-10**: No regression — users without a Meta connection or with insufficient data see exactly the same generation behavior as before Phase 14.
- **SC-11**: No user-facing UI text contains "متوسط", "ميديان", "Link CTR", "CTR", "CPA", "CPM", or any percentage values. A lint/QA check confirms zero occurrences of these terms in user-visible copy.
- **SC-12**: Kill rules K1, K2, CB1, CB2 never fire on awareness, reach, or engagement campaigns. Zero conversions in these campaign types does not trigger any kill verdict.

## Technical Constraints (Section 11)

- Firebase Cloud Functions run in **europe-west1** (project `proadsai-saas`).
- Trace persistence: data passes through request/response payloads between Cloud Functions, **not** module-level globals (separate Cloud Run containers in production).
- Firebase lazy getter: never call `admin.firestore()` at module top level — use a `getDb()` lazy getter.
- No server-side writes using `genId` in `serverGenerateFinalAd` — the generation doc is created client-side via `addDoc` after the handler returns; the image fingerprint must be stored **after** the client creates the generation doc (client-side or via a separate callable).
- Meta access tokens are stored **server-side, encrypted at rest** (long-lived user token refreshed before expiry) so the scheduled sync can run without a user session; tokens are never exposed to the client beyond the OAuth exchange.
- Single injection point for prompt blocks: additive blocks go through `buildFinalImagePrompt`.
- Image generation uses OpenAI gpt-image-2; copy/hooks/concepts use Gemini.
- The perceptual-hashing library must work in Node.js Cloud Functions.
- All Arabic UI copy uses the Fusha term "المعدل" when an "average" concept must be displayed (per FR-024 + SC-11); never "متوسط" (internal-only) and never "ميديان" (English transliteration).
- All user-facing text in the app is in English or simple Fusha Arabic. No Egyptian dialect (e.g. use 'الخاص بك' not 'بتاعك', use 'ما هو' not 'إيه', use 'لكي' not 'علشان'). Technical terms (CTR, CPA, CPM, ROAS) never appear in user-facing text. The ROAS dropdown uses plain Arabic labels ('أريد استرجاع التكلفة' instead of 'ROAS 1.0').
- PowerShell syntax for all terminal commands (semicolons, not `&&`).
- Merges happen via GitHub UI only.

## What Already Exists — Do Not Rebuild (Section 12)

Extend, do not rewrite:
- `creativeMemory.ts` (432L) — `CreativeMemoryRecord`, `storeCreativeMemory()`, `updateCreativePerformance()`, pattern indexes, `retrieveCreativePatterns()`.
- `rankingEngine.ts` (520L) — scoring (CTR 40% / CPC 30% / ROAS 30%), `getTopPerformers()`, `getPatternInsights()`.
- `recommendationTracking.ts` (292L) — recommendation acceptance/rejection.
- `metaService.ts` — OAuth popup flow, account picker, connection status.
- `patternSummaries.ts` (542L) — natural-language pattern summaries.
- Existing `retrieveCreativePatterns()` and `buildPersonalizationContext()` in `generators.ts`.
- Phase 20 Concept Director with the `pastWinningAds` parameter.
- **Phase 10 — Favorites & Workspace** (merged to main) — the workspace system; each workspace has a `workspaceId`.
- **Phase 12 — Workspace Logic** (merged to main) — workspace behavior; each generation carries a `workspaceId` field.

> **Prerequisite gate**: Phase 10 and Phase 12 are merged to main but **require end-to-end verification before Phase 14 goes to production** — specifically, verify that generations correctly save `workspaceId` when created inside a workspace. Workspace verification is a prerequisite gate before Phase 14 production deployment.

## Assumptions

- The 10 canonical hook angles and their alias set are as defined in `gazeMap.ts` / `expressionMap.ts`; the three documented aliases are complete (no others found in the codebase).
- The Full-Funnel ROAS safety floor is fixed at 2.0 and all CPA/CPL formulas follow `qarar-rulebook.md` §2.2–2.3 as the single source of truth.
- The ⚠️ hook-angle-icon threshold (§8.2) is the angle's avg Link CTR ≤ 75% of the account average (≥ 25% below); this is the default and is tunable later without changing the icon contract. The exact perceptual-hash match distance (§4.2) remains an implementation-time tunable (default: a distance that survives JPEG re-upload).
- The data-gate threshold for hook-angle icons (§8.2) aligns with the Qarar §4 gates and the 10-matched-creatives RAG threshold; below it, icons are suppressed rather than fabricated.
- The product diagnoses and warns; it does not execute Meta actions (pausing/scaling/budget changes remain the user's action, per Qarar §11).
- Each workspace maps to at most one Meta ad account. A Meta ad account is connected to exactly one workspace. This 1:1 mapping ensures clean data isolation between clients and is **enforced by blocking both conflict directions at connect time** (FR-026): a workspace must disconnect its current account before connecting another, and an ad account already connected elsewhere cannot be reused — no silent replacement, no override.
