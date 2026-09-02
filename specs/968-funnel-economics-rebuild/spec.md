# Feature Specification: Funnel Economics Rebuild

**Feature Branch**: `968-funnel-economics-rebuild`
**Created**: 2026-08-31
**Status**: Draft
**Input**: Build the Funnel Economics Rebuild phase, implementing items 1–10 of `docs/investigations/funnel-economics-investigation.md` §11 plus the OQ-1 override (paid_product receives a commission field). Item 11 (`businessEpoch`) and all of report §8 are deferred to a separate phase.

**Source of truth**: `docs/investigations/funnel-economics-investigation.md`

---

## Overview

The funnel settings module tells a business the maximum it may pay to acquire a lead or a customer. On two of the four funnel types that number is wrong by a factor of 5–22x, because the underlying models omit real funnel stages, ignore sales commission, and apply a hidden margin constant nobody chose.

A coach running a $3,000 program from a lead magnet is currently told that **$630 per lead** is acceptable. The correct figure is **$12.76**. Acting on the current number, they would spend roughly $53,000 to produce a single $3,000 sale.

This feature replaces the incorrect models with ones that reflect how these funnels actually work, and surfaces the two business decisions that were previously hidden — sales commission and the share of revenue the business keeps — as inputs the owner controls.

### Scope boundary

**In scope**: items 1–10 of report §11, plus the OQ-1 override.

**Explicitly deferred to a separate phase** (do not design for it here): item 11 and all of report §8 — `businessEpoch`, `verdictEpoch` stamping, epoch-scoped learning aggregate paths, the Tier-1/Tier-2 change classification, and the Tier-1 change threshold (report OQ-2). No epoch field, no epoch path, and no threshold rule appears in this specification.

Because of that deferral, this phase does not modify how learning aggregates are written or read. Preserving them is a **regression invariant**, not a migration step (FR-046).

**Also out of scope**: team member permissions (report OQ-3).

### Working file set

The settings form, the economics module, the settings callables, and the translation catalogue. `src/App.tsx` is included on a **strictly limited** basis: reading the completeness signal from the retrieval it already performs, and rendering the passive attention marker (the “badge” in the plan and tasks) (FR-051). No other change to that file belongs to this phase.

The learning-aggregate module is **not** in scope — the verdict gate this feature relies on already exists in the engine it calls.

`functions/src/metaSync/shared.ts` is in scope on an **explicitly bounded** basis, approved 2026-08-31: **the FR-042 observability log statement ONLY**. No other change to that file belongs to this phase — no logic change, no target recomputation, no alteration of the `?? Infinity` coercion. The log belongs where the suppression happens; relocating it would put the trace somewhere that cannot observe the event, which would satisfy the file boundary while defeating constitution VI.

`scripts/sc11Guard.mjs` and `scripts/sc11Guard.test.mjs` are in scope, approved 2026-08-31, for the guard hardening in FR-054 through FR-060.

---

## Clarifications

### Session 2026-08-31

- Q: With epoch work deferred, a 20x target correction would let the nightly sync re-judge every historical ad and bake 🔴 counts into the learning aggregates permanently. How is that prevented? → A: Do not backfill the new fields onto existing records. An incomplete record yields no effective target, so the verdict engine's existing data gate returns ⏳ and no verdict is written. `metaSync/shared.ts` stays out of scope.
- Q: Where does the new copy live, given the form and the app shell use different conventions and two of the three files are already unscanned by the terminology guard? → A: Each file keeps its own convention — inline bilingual pairs in the form, catalogue keys for the badge. The form is NOT added to the guard's allowlist. Routing user-facing copy into an unscanned file would be evasion, not compliance. All new form copy omits the percent symbol; the unit sits in the field label.
- Q: How does an existing owner discover their record needs filling, given no automatic prompt is allowed? → A: Both a passive badge and in-form marking. Retrieval returns a `complete` flag; the menu entry shows a dot when it is false; the form marks the missing fields. The flag must never feed the auto-open gate or the review prompt. `src/App.tsx` joins the file scope, limited to reading the flag and rendering the badge.
- Q: What happens to the superseded upsell-conversion rate on paid-event records? → A: Retained in place and left unread. Not cleared, not deleted — the field stays live for paid_product, and retaining the value keeps a revert of this phase code-only.
- Q: FR-035 still mandated stripping the percent symbol, contradicting the approved suppression approach. Which governs? → A: The suppression approach. FR-035 rewritten — hints carry their unit honestly with a declared per-line reason; splitting a value across two strings to dodge the pattern is forbidden.
- Q: Batch 1 (guard hardening) had no requirement backing it in the spec. → A: Added as FR-054 through FR-058, with `scripts/sc11Guard.mjs` and `scripts/sc11Guard.test.mjs` recorded as an approved scope expansion.
- Q: Is `metaSync/shared.ts` in scope for the observability log? → A: Yes, bounded to the FR-042 log statement only. The log must live where the suppression happens; relocating it would put the trace where it cannot observe the event.
- Q: Does the low-value advisory test the rounded or the raw target? → A: The rounded, displayed target, strictly less than $0.50 — equality does not warn, matching the existing cap-warning convention. A boundary fixture covers raw 0.4999 displaying $0.50 without firing.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A high-ticket coach gets a lead cost they can actually act on (Priority: P1)

A coach sells a $3,000 program. Leads arrive from a lead magnet, a percentage of them book a sales call, a percentage of those actually attend, and a percentage of the attended calls close. Today the app asks only for the close rate and silently assumes every lead reaches a call, producing a lead-cost ceiling roughly twenty times too high.

The coach now describes the real chain — booking rate, show-up rate, close rate — and receives a ceiling grounded in it.

**Why this priority**: This is the single largest error in the module and the one that causes direct, quantifiable financial loss. It is also self-contained: it can ship, be verified against the worked example, and deliver correct guidance without any other story landing.

**Independent Test**: Configure a lead-magnet-to-call funnel at a $3,000 offer with the benchmark midpoint rates and confirm the displayed ceiling is $12.76 rather than $630.

**Acceptance Scenarios**:

1. **Given** a lead-magnet-to-call funnel, **When** the owner opens funnel settings, **Then** separate booking rate, show-up rate, and close-rate fields are shown, each with its typical range displayed beneath it.
2. **Given** a $3,000 offer with booking 7.5, show-up 70, close 22.5, commission 10, and margin kept 60, **When** the settings are saved, **Then** the maximum cost per lead is $12.76.
3. **Given** the same funnel, **When** the owner switches margin kept from 60 to 50, **Then** the ceiling rises to $15.95; **When** they switch to 70, **Then** it falls to $9.57.
4. **Given** an owner who has not filled in every rate field, **When** they attempt to save, **Then** saving is refused and the missing fields are named.

---

### User Story 2 — A business owner controls commission and retained margin (Priority: P1)

Two numbers that decide every target were previously invisible: a hardcoded factor that quietly kept 30% of lead value back, and the absence of any sales commission on call-closed revenue. The owner now sets both.

Commission is deducted only from revenue that arrives through a sales call. Money taken through a self-serve checkout — a $17 event ticket, a $24 product — carries no commission.

**Why this priority**: Every funnel type's output depends on these two inputs, so no other story produces a correct number without them. Together with Story 1 they form the minimum viable correction.

**Independent Test**: Set commission to 0 and confirm targets rise by exactly the commission's share; set it to 10 and confirm they fall back. Move margin kept across all three presets and confirm targets scale by the retained share.

**Acceptance Scenarios**:

1. **Given** any of the four funnel types, **When** the owner opens funnel settings, **Then** a sales commission field (defaulting to 10) and a margin-kept selector are shown.
2. **Given** the margin-kept control, **When** the owner interacts with it, **Then** it offers exactly three choices — 50, 60, and 70 — presented as selectable buttons, with 60 preselected, and offers no way to type an arbitrary number.
3. **Given** a paid-event funnel with a $24 ticket and a $3,000 back-end offer, **When** commission is set to 10, **Then** commission is deducted from the back-end value only and the ticket value is untouched.
4. **Given** a free-webinar funnel and a lead-magnet-to-call funnel with identical offer price, commission, and margin kept, **When** both are configured at benchmark rates, **Then** both produce the same profit per sale — confirming the margin control behaves consistently across funnel types.

---

### User Story 3 — A paid event is allowed to lose money on the front end (Priority: P2)

A paid event is a deliberate front-end-loss model: the ticket loses money and the back-end offer produces the profit. The app currently defaults a paid event to break-even and provides no way for the projected back-end value to raise the ceiling, so it forbids the very strategy it exists to support.

The paid event now defaults to a controlled front-end loss, and its back-end value is modelled through the two stages that actually govern it: how many ticket buyers attend, and how many attendees buy the high-ticket offer.

**Why this priority**: It unblocks a supported funnel type, but the funnel is less common than the two P1 stories address and is not producing active financial loss today.

**Independent Test**: Configure a paid event at a $24 ticket and confirm the target is $48.00 — a deliberate 0.5 return on ticket revenue — and that the attendance and close-rate fields are present and stored.

**Acceptance Scenarios**:

1. **Given** a newly configured paid event, **When** the owner reaches the return-target selector, **Then** the controlled-loss option is preselected rather than break-even.
2. **Given** a paid event, **When** the owner opens funnel settings, **Then** an attendance-from-ticket-buyers field and a high-ticket-close-from-attendees field replace the single upsell-conversion field.
3. **Given** a $24 ticket, a $3,000 back-end offer, benchmark event rates, commission 10, and margin kept 60, **When** settings are saved, **Then** the maximum cost per customer is $48.00.

---

### User Story 4 — The owner understands which number is driving the target (Priority: P2)

On a paid event, two independent ceilings are computed and the lower one wins. With a realistic ticket price the ticket-revenue path always wins, which makes the two event rate fields look decorative. They are not: they are visible, honest, and they become the lever that moves once real performance data exists.

The results card therefore shows both figures and names which one is active and why.

**Why this priority**: It prevents a correct system from being read as a broken one, but the underlying number is already right without it.

**Independent Test**: Configure a paid event where the ticket path is lower and confirm both numbers render with the ticket path named as active; then raise the ticket price until the projection path becomes lower and confirm the active-path label follows.

**Acceptance Scenarios**:

1. **Given** a paid event whose ticket-revenue ceiling is lower than its projected-value ceiling, **When** the results card renders, **Then** both figures are shown and a plain-language line states that the target follows ticket revenue because the back-end value of the event is not yet proven.
2. **Given** a paid event whose projected-value ceiling is the lower of the two, **When** the results card renders, **Then** the projection path is named as the active one.
3. **Given** any funnel type other than paid event, **When** the results card renders, **Then** it shows a single figure exactly as it does today.

---

### User Story 5 — The owner is warned when a target is unreachable (Priority: P3)

The advisory that flags an unadvertisable funnel currently watches the offer price. A $500 offer sold through a webinar at benchmark rates yields a ceiling of $0.90 — a number no market can hit — yet nothing fires, because $500 does not look low. The advisory now watches the number that actually determines advertisability: the computed target.

Sub-$2 lead costs remain achievable in some markets and must not be flagged.

**Why this priority**: It improves guidance quality on an edge case rather than correcting a number, and the surrounding stories already produce correct figures.

**Independent Test**: Configure a $200 webinar and confirm the warning fires; configure a $500 webinar and confirm it does not.

**Acceptance Scenarios**:

1. **Given** a webinar funnel producing a computed target of $0.36, **When** settings are saved, **Then** the low-value advisory fires.
2. **Given** a webinar funnel producing a computed target of $0.90, **When** settings are saved, **Then** the low-value advisory does not fire.
3. **Given** a funnel producing a target at or above $0.50, **When** settings are saved, **Then** the low-value advisory does not fire regardless of offer price.
4. **Given** any funnel with a firing advisory, **When** settings are saved, **Then** the target is still calculated and saving still succeeds — the advisory never blocks.

---

### User Story 6 — Every input tells the owner what a normal answer looks like (Priority: P3)

A non-technical business owner asked for a "show-up rate" has no way to know whether 40 or 90 is reasonable, and an owner asked for "average order value" will type their ticket price and understate every downstream number. Each rate field now carries its typical range, and the order-value field carries a plain-language explanation of what it means.

**Why this priority**: It materially improves the quality of the inputs the formulas depend on, but the formulas are correct without it.

**Independent Test**: Open each funnel type and confirm every rate field and the order-value field display guidance beneath them, in both languages.

**Acceptance Scenarios**:

1. **Given** any funnel type, **When** the owner views a rate field, **Then** its typical range is displayed as muted text positioned below the field.
2. **Given** any field carrying guidance, **When** the owner begins typing in it, **Then** the guidance remains visible.
3. **Given** the interface language is Arabic, **When** any guidance text renders, **Then** it is in simple Fusha.
4. **Given** a paid funnel, **When** the owner views the order-value field, **Then** it is explained as the average a single customer pays.
5. **Given** a funnel with a high-ticket offer, **When** the owner views that price field, **Then** it is labelled as a high-ticket price rather than an upsell price.

---

---

### User Story 7 — An existing owner learns their settings need updating, without being pushed (Priority: P1)

An owner who configured their funnel before this feature has a record that no longer holds everything the corrected models need. Nothing is invented on their behalf, so their targets pause and their ads report a waiting state rather than a judgement — which protects their learning history from a flood of failing verdicts judged against a target they never chose.

They are told this passively: an attention marker appears on the funnel-settings entry, and when they open it of their own accord the missing fields are marked with a plain statement that targets are paused until those fields are filled. Nothing opens by itself, nothing blocks them, and nothing is decided for them.

**Why this priority**: Without the gate, correcting the math corrupts the learning loop — the product's stated moat — for every existing workspace. Without the marker, the gate is invisible and owners sit in a paused state indefinitely. The two halves only work together.

**Independent Test**: Take a workspace with a pre-existing record and pre-existing learning aggregates, run a full sync, and confirm no pass or fail verdict is written and no aggregate changes — while the attention marker is visible and no modal has opened by itself.

**Acceptance Scenarios**:

1. **Given** a record saved before this feature, **When** the owner loads the app, **Then** the funnel-settings entry shows an attention marker and no modal, redirect, or blocking screen appears.
2. **Given** that same record, **When** the nightly sync runs, **Then** every affected ad receives the waiting verdict with the incomplete-settings reason, and no pass or fail verdict is written.
3. **Given** that same sync, **When** it completes, **Then** no learning aggregate has changed.
4. **Given** that record, **When** the owner opens the form themselves, **Then** the missing fields are marked and the form states that targets are paused until they are filled.
5. **Given** the owner then fills every missing field and saves, **When** the next sync runs, **Then** targets compute normally, verdicts resume, and the attention marker is gone.
6. **Given** a record that is complete, **When** the owner loads the app, **Then** no attention marker is shown.

---

### Edge Cases

- **Commission set to 100**: every funnel's net factor becomes zero, so lead value and the projected component collapse to zero. Targets become $0.00 (paid funnels retain their ticket-revenue path) and the low-value advisory fires. Saving succeeds; the system does not divide by zero or produce a negative target.
- **Commission or any rate set to 0**: accepted. A zero commission simply means no deduction; a zero rate collapses the chain to a zero lead value and fires the advisory.
- **A rate entered above 100**: rejected at save with a message naming the offending field. Rates are shares and cannot exceed the whole.
- **A negative price or rate**: rejected at save.
- **Offer price of 0**: accepted; produces a $0.00 target and fires the low-value advisory.
- **An existing settings record saved before this feature — end to end**: it loads without error and is returned as an existing record, so the first-run auto-open stays silent and the owner is not pushed anywhere. It is incomplete, so it yields no effective target. The nightly sync passes it to the verdict engine, whose data gate returns ⏳ with the incomplete-settings reason. No pass or fail verdict is written, so no verdict counts reach the learning aggregates and the learning history is preserved intact. When the owner later opens the form of their own accord and fills the missing fields, the record becomes complete, a corrected target computes, and verdicts resume on the next sync.
- **An existing lead-magnet-to-call record holding only a close rate**: incomplete — booking rate and show-up rate are absent and are not invented. Gate applies.
- **An existing paid-event record holding a single upsell-conversion rate**: incomplete — the superseded rate is not reused as either new event rate. Gate applies.
- **A record left partially filled**: any single missing required field makes the record incomplete. There is no partial-credit path that computes a target from some fields and defaults for others.
- **A paid event where the two ceilings are exactly equal**: neither is treated as having capped the other; the active-path line names the ticket-revenue path.
- **Guidance text and the percentage-term guard**: guidance copy must clear the existing user-facing-terminology guard, which rejects a digit immediately followed by a percent sign. See FR-034.

---

## Requirements *(mandatory)*

### Shared economic factors

- **FR-001**: The system MUST derive a retained-margin share and a commission net factor from the owner's two inputs, and use them consistently across all four funnel types:
  - spend share = (100 − margin kept) ÷ 100
  - net factor = (100 − commission) ÷ 100
- **FR-002**: The system MUST remove the two previously hardcoded constants — the 0.70 lead-value multiplier and the 2.0 return floor — and MUST NOT retain either as a fallback. The owner's margin-kept selection is the sole source of both behaviours.
- **FR-003**: The system MUST apply commission only to revenue that arrives through a sales call. Self-serve checkout revenue MUST NOT be reduced by commission.

### Lead magnet → call

- **FR-004**: The system MUST collect a booking rate (lead → booked call) and a show-up rate (booked → attended) in addition to the existing close rate.
- **FR-005**: The system MUST compute lead value as: offer price × net factor × booking rate × show-up rate × close rate.
- **FR-006**: The system MUST compute the maximum cost per lead as lead value × spend share.
- **FR-007**: Saving a lead-magnet-to-call funnel MUST reject a submission omitting booking rate, show-up rate, or close rate. This is the funnel-specific instance of the general rule in FR-040a, which governs all four funnel types; FR-040a is authoritative.

### Free webinar

- **FR-008**: The system MUST compute lead value as: offer price × net factor × attendance rate × purchase-from-attendees rate.
- **FR-009**: The system MUST compute the maximum cost per lead as lead value × spend share.
- **FR-010**: The system MUST NOT change which fields the free-webinar funnel collects, beyond adding the two shared inputs (commission, margin kept).

### Paid event

- **FR-011**: The system MUST replace the single upsell-conversion rate with two fields: attendance from ticket buyers, and high-ticket close from attendees.
- **FR-012**: The system MUST compute a ticket-revenue ceiling as order value ÷ return target.
- **FR-013**: The system MUST compute full buyer value as: order value + (high-ticket price × net factor × event attendance rate × event close rate).
- **FR-014**: The system MUST compute a projected-value ceiling as full buyer value × spend share.
- **FR-015**: The system MUST set the effective target to the lower of the ticket-revenue ceiling and the projected-value ceiling.
- **FR-016**: The system MUST default a paid event's return target to the controlled-loss option (0.5). The set of selectable return targets is unchanged.
- **FR-017**: The system MUST NOT deduct commission from ticket revenue.

### Paid product

- **FR-018**: The system MUST offer a commission field on the paid-product funnel, on the same terms as the other three funnel types (OQ-1 override — this supersedes the report, which excludes it).
- **FR-019**: The system MUST compute full buyer value as: order value + (high-ticket price × net factor × upsell conversion rate). The net factor applies to the high-ticket term only; the self-serve order value is not reduced by commission.
- **FR-020**: The system MUST compute the projected-value ceiling as full buyer value × spend share, and set the effective target to the lower of that and the order-value ÷ return-target ceiling.
- **FR-021**: The system MUST leave the paid-product return-target default unchanged at break-even (1.0).
- **FR-022**: The system MUST NOT add event attendance or event close-rate fields to the paid-product funnel — it models no event.

### Commission and margin inputs

- **FR-023**: The system MUST collect a sales commission rate, expressed as a share, defaulting to 10, on all four funnel types.
- **FR-024**: The system MUST collect a margin-kept selection offering exactly three values — 50, 60, and 70 — defaulting to 60.
- **FR-025**: The margin-kept control MUST be presented as three selectable buttons matching the existing return-target selector's visual pattern, and MUST NOT accept free-entry numeric input under any circumstance.
- **FR-025a**: Each margin-kept button MUST be labelled with the bare number ("50", "60", "70"), with the unit carried by the group label above them. A label of the form "Keep 50%" is forbidden — it pairs a digit with a percent sign and trips the terminology guard (FR-035).
- **FR-026**: The system MUST reject any saved margin-kept value outside the three permitted values.
- **FR-027**: The system MUST accept a commission rate anywhere from 0 through 100 inclusive, and reject values outside that range.

### Advisory

- **FR-028**: The system MUST fire the low-value advisory when the **rounded, displayed** effective target is **strictly less than** $0.50. A displayed target of exactly $0.50 MUST NOT warn. Testing the displayed value guarantees the advisory can never contradict the figure the owner is looking at, and the strict inequality mirrors the module's existing convention for the cap warning, where equality likewise does not warn.
- **FR-028a**: A boundary fixture MUST cover this: a case whose raw target is 0.4999 MUST display $0.50 and MUST NOT fire the advisory.
- **FR-029**: The system MUST NOT fire the low-value advisory based on offer price or order value.
- **FR-030**: The low-value advisory MUST remain non-blocking: the target is always computed and the save always succeeds.
- **FR-031**: The existing missing-high-ticket advisory MUST be unchanged.

### Results presentation

- **FR-032**: On a paid event, the results card MUST display both the ticket-revenue ceiling and the projected-value ceiling, and MUST state in plain language which one is active and why.
- **FR-033**: On the other three funnel types, the results card MUST continue to display a single figure.

### Guidance copy

- **FR-034**: Every rate field MUST display its typical range, drawn from report §4, as muted text positioned below the field. It MUST NOT be an input placeholder, because a placeholder disappears at the exact moment the owner needs it.
- **FR-035**: **Every** new user-facing string in the settings form MUST clear the terminology guard, and MUST do so honestly. Benchmark hints MUST carry their unit as written — "Typical range: 5–10%" / «المعتاد: ٥ – ١٠٪» — with an explicit per-line suppression declaring a reason (FR-055). Stripping the percent symbol and relocating the unit to the field label is **forbidden**: the rendered interface still reads as a percentage to the owner, so it defeats the guard by splitting one value across two strings rather than complying with it. Bare `(%)` as a unit marker on a label, and bare numbers on the margin preset buttons, remain correct — neither carries a value. The English word "percent" MUST NOT appear in any new string.
- **FR-035a**: The settings form MUST NOT be added to the terminology guard's allowlist, and no new copy may be relocated into an already-allowlisted file in order to avoid being scanned. Copy follows each file's existing convention: the form keeps its inline bilingual pairs, and the app shell keeps its catalogue keys. Placing user-facing copy where the guard cannot see it is evasion of the rule, not compliance with it.
- **FR-035b**: Arabic guidance MUST use Arabic-Indic numerals and simple Fusha.
- **FR-035c**: Before implementation is considered complete, every new string destined for the settings form MUST be enumerated and checked against the guard's patterns, including the negative controls that prove the check discriminates.
- **FR-036**: The order-value field MUST carry a plain-language explanation identifying it as the average a single customer pays, so an owner with an order bump does not enter their bare ticket price.
- **FR-037**: The high-ticket price field MUST be relabelled from "upsell price" to "high ticket price". This is a label change only; the underlying field is unchanged.
- **FR-038**: Every string introduced or changed by this feature MUST ship in English and in simple Fusha Arabic, using the wordings in report §9 where that table supplies one. No Egyptian dialect, and no user-facing reference to the concept of dialect.

### Record completeness and the verdict gate

- **FR-039**: A settings record MUST be treated as **complete** only when every field required by its funnel type is present and non-null. The fields introduced by this feature — booking rate, show-up rate, event attendance rate, event close rate, commission rate, and margin kept — are required by their respective funnel types and therefore participate in this test.
- **FR-040**: The system MUST NOT backfill the newly introduced fields onto existing settings records. There are no migration defaults and no implicit values. An existing record is therefore incomplete for its funnel type until its owner fills it in.
- **FR-040a**: Saving MUST reject an incomplete submission for **every** funnel type, naming the missing fields. Incompleteness is therefore a legacy state only: it can be inherited from a record written before this feature, but it can never be newly created.
- **FR-041**: For an incomplete record, the system MUST produce no effective target — the value the verdict engine reads MUST be null rather than a number, a zero, or an infinity.
- **FR-041a**: The mechanism is a **version stamp on the computed payload**, not a live completeness check, because the sync reads a stored snapshot rather than recomputing (see the plan's R-1). The two predicates coincide only because FR-040a forbids saving an incomplete record. **Therefore**: any future phase that adds a newly required field MUST bump the economics version, or records made incomplete by that phase will keep their existing stamp and the gate will silently stop firing. This obligation MUST be recorded alongside the version constant itself.
- **FR-042**: A null effective target MUST cause the existing verdict data gate to return the waiting verdict (⏳) with the existing incomplete-settings reason. No pass or fail verdict is produced, so no verdict counts reach the learning aggregates.
- **FR-043**: Retrieving an incomplete record MUST still return that record rather than reporting an absence. The interface's first-run auto-open behaviour keys off whether a record exists at all; reporting an incomplete record as absent would automatically push every existing owner into the settings form on their next load. Incompleteness MUST be signalled separately from existence.
- **FR-044**: Re-filling the new fields MUST remain owner-initiated. This feature MUST NOT introduce any automatic prompt, modal, redirect, or blocking screen that pushes an existing owner into the settings form.
- **FR-045**: Once an owner completes the record, targets MUST compute normally and verdicts MUST resume on the next sync with no further action required.

### Making an incomplete record discoverable

- **FR-049**: Retrieving a settings record MUST report whether it is complete, as a distinct signal alongside the record itself. This is separate from whether the record exists (FR-043).
- **FR-050**: The completeness rule MUST be defined in exactly one place and reused everywhere it is needed — the retrieval response, the target derivation, and the interface all consult the same definition. Two independent implementations of "complete" MUST NOT exist.
- **FR-051**: When the completeness signal is false, the funnel-settings menu entry MUST display a passive attention marker, following the pattern already used for a workspace that needs an ad account. The marker MUST be passive: no modal, no redirect, no blocking screen, and no change to what activating the entry does.
- **FR-052**: The settings form MUST mark which required fields are missing and MUST state plainly that targets are paused until they are filled, in English and simple Fusha Arabic.
- **FR-053**: The completeness signal MUST NOT be wired into the first-run auto-open behaviour or the monthly-review prompt. Those two continue to key off record existence and review cadence exactly as they do today. Auto-opening the form because a record is incomplete would convert a passive signal into a push and violate FR-044.

### Terminology guard hardening (Batch 1 — approved scope expansion)

This work stands alone and blocks every other task in the phase. It exists because the guard, as found, could not express an honest exception and could not see three of the four ways to write a percentage in Arabic.

- **FR-054**: The guard's percentage pattern MUST be strengthened to match Arabic-Indic digits (U+0660–U+0669), Eastern Arabic-Indic digits (U+06F0–U+06F9), and the Arabic percent sign `٪` (U+066A), in addition to Latin digits and `%`. Verified gap: of `5–10%`, `٥–١٠%`, `5–10٪`, and `٥–١٠٪`, the original pattern caught only the first. For an Arabic-first product this is the guard's weakest point.
- **FR-055**: The guard MUST support a **per-line** suppression naming a specific pattern code and carrying a mandatory non-empty reason. A bare suppression with no code, an unknown code, a missing reason, or an empty reason MUST be a hard failure.
- **FR-056**: The suppression MUST apply only to the named code and only to the physical line carrying it. No file-level or directory-level form may be added, and the existing allowlist MUST gain no entries.
- **FR-057**: Every applied suppression MUST be printed in the guard's output with its reason, so exceptions remain visible on each run rather than accumulating silently.
- **FR-058**: Violations found outside this phase's working file set are **pre-existing**: they MUST be reported and MUST NOT be suppressed. The suppression mechanism MUST NOT be applied to code not written in this phase.

### Test execution integrity

These requirements exist because two independent verification gaps were found during analysis, either of which alone would let the guard hardening ship unverified.

- **FR-059**: Every new or modified test file MUST be registered in the manifest that actually executes it, and that registration MUST be verified by observing the test run. Two concrete hazards apply: `functions/package.json` enumerates backend tests explicitly by path, so an unregistered file compiles and never runs; and `vitest.config.ts` restricts discovery to `src/**`, so `scripts/sc11Guard.test.mjs` is matched by **no** runner today and is referenced by nothing but its own header comment.
- **FR-060**: Batch 1 MUST NOT be reported complete on a summary claim. The exit evidence MUST be the **raw test-runner output showing each guard test executing by name**. A statement that tests pass is not acceptable evidence, because the failure mode being guarded against is tests that silently do not execute at all.
- **FR-061**: **Everything FR-054 through FR-058 hardens is unenforced in continuous integration.** `.github/workflows/ci.yml:34` runs the guard as `npm run lint || true`, explicitly labelled "advisory — does not fail the pipeline", so the guard **cannot fail CI** — before this phase, after it, and regardless of how strong the pattern becomes. The strengthened pattern, the suppression mechanism, the mandatory reasons, and the report-don't-suppress rule are all real locally and all advisory in the pipeline.
- **FR-061a**: `.github/workflows/ci.yml` MUST NOT be modified in this phase. Removing `|| true` would surface the 68 pre-existing allowlisted violations, and that triage does not belong in this change. This is a **deliberate deferral, acknowledged and not dismissed**: making the guard blocking is tracked as the immediate next piece of work after this phase merges. No claim that the guard is CI-enforced may appear in any report, PR description, or summary produced by this phase.

### Data integrity

- **FR-046**: Existing learning aggregates MUST survive this feature untouched. Because epoch work is deferred, this phase changes no aggregate path, no aggregate write, and no aggregate read — the requirement is verified as a regression check, not implemented as a migration.
- **FR-047**: The economics module MUST remain pure — no data-store access, no network calls — so every formula is directly unit-testable.
- **FR-048**: All numeric results MUST be rounded to two decimal places once, at the end of each computation chain, rather than at intermediate steps.

### Key Entities

- **Funnel settings record**: the single stored configuration per workspace describing how a business converts spend into revenue. Gains a commission rate and a margin-kept selection on every funnel type; gains booking and show-up rates on the lead-magnet-to-call type; exchanges a single upsell-conversion rate for attendance and close rates on the paid-event type.
- **Derived targets**: the computed output of the settings record — a maximum cost per lead or per customer, plus, on paid funnels, the two component ceilings and which one is active.
- **Advisories**: non-blocking flags accompanying the derived targets. The low-value flag now keys off the computed target rather than the entered price.

**Retained-but-unread field**: on paid-event records, the superseded upsell-conversion rate is **deliberately left in place and left unread**. Nothing writes it and nothing reads it for that funnel type. It is not cleared and not deleted, for two reasons: the field remains live and meaningful for the paid-product funnel, so its definition is unchanged rather than orphaned; and retaining the stored value keeps a revert of this phase **code-only**, with no data restoration step. This matters because the deferred epoch phase will touch the same document again.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A $3,000 lead-magnet-to-call funnel at benchmark midpoint rates yields a maximum cost per lead of $12.76, replacing today's $630 — a correction of roughly twenty-fold.
- **SC-002**: A $3,000 free-webinar funnel at benchmark midpoint rates yields a maximum cost per lead of $5.40.
- **SC-003**: A $24 paid event with a $3,000 back-end offer at benchmark midpoint rates yields a maximum cost per customer of $48.00, and a sanity check across 100 ticket buyers shows $17,587.50 in net revenue against $4,800 in spend.
- **SC-004**: Every worked example in report §6 is reproduced exactly by an automated test, including all three margin-kept rows of §6.1 and all three advisory rows of §6.4.
- **SC-005**: Moving margin kept from 60 to 50 raises the margin-driven ceiling by exactly one quarter, and moving it from 60 to 70 lowers it by exactly one quarter — on both free funnel types, and on the projected-value ceiling of both paid funnel types. Where a paid funnel's effective target is set by its ticket-revenue ceiling instead, that target correctly does not move, since ticket revenue is independent of retained margin.
- **SC-006**: A free-webinar funnel and a lead-magnet-to-call funnel configured at the same offer price, commission, and margin kept produce identical profit per sale.
- **SC-007**: The low-value advisory fires on a displayed target of $0.36, stays silent on $0.90, and stays silent at exactly $0.50 — including the case whose raw value is 0.4999 — in every funnel type.
- **SC-008**: Every rate field across all four funnel types displays its typical range below the field, in both languages, and the guidance remains visible while the owner types.
- **SC-009**: The full lint and terminology-guard suite passes with no new exemptions granted to any file, the guard's rules are unchanged, and the settings form remains absent from the guard's allowlist. Every new form string is enumerated and shown to clear the guard's patterns, with negative controls proving the check discriminates rather than passing vacuously.
- **SC-010**: A workspace holding both a pre-existing settings record and pre-existing learning aggregates completes a full nightly sync with zero pass or fail verdicts written, zero change to any learning aggregate, and no automatic prompt shown to the owner. After the owner voluntarily completes the record, the next sync writes verdicts against the corrected target.
- **SC-014**: A webinar funnel and a lead-magnet-to-call funnel configured at the same offer price, commission, and margin kept are proven by fixture to yield the same profit per sale (the verifiable form of SC-006).
- **SC-015**: A rounding fixture proves the chain rounds once at the end, using inputs whose result **differs** under end-of-chain versus intermediate rounding. A fixture that passes under both orderings proves nothing and does not satisfy this criterion.
- **SC-016**: Every new Arabic string is reviewed and confirmed to be simple Fusha with no Egyptian dialect, and the review is recorded.
- **SC-017**: Batch 1 completion is evidenced by raw test-runner output naming each guard test as it executes — not by a summary claim that tests passed.
- **SC-013**: An owner with an incomplete record sees an attention marker on the funnel-settings entry on first load, and across a full session no modal, redirect, or blocking screen opens without their action. The marker clears once the record is complete.
- **SC-011**: No user-facing string introduced by this feature contains Egyptian dialect or any reference to dialect, verified by review of every new string in both languages.
- **SC-012** *(design goal — not independently verifiable)*: A business owner can reach a correct, understood target for any of the four funnel types without asking what a given field means. This states intent and deliberately carries no threshold or evaluator; inventing one would manufacture false testability. The verifiable proxy is SC-008: every field states its typical range or explains itself in plain language, in both languages.

---

## Assumptions

- **A-1** — *Benchmark midpoints*: where a single representative value is needed for a test fixture or a default, the midpoints named in report §4 are used: booking 7.5, show-up 70, close 22.5, webinar attendance 25, webinar purchase 2, event attendance 75, event close 7.5, commission 10, margin kept 60.
- **A-2** — *Rounding*: the report's §6.1 table shows $15.94 for the 50% margin row. Computing the chain unrounded and rounding once at the end (FR-048) gives **$15.95**. The 60% and 70% rows match the report exactly. The report's 50% figure is treated as a rounding artefact and the fixture uses $15.95.
- **A-3** — *No migration*: benchmark midpoints are used for test fixtures and for the defaults a *new* record starts from, never to backfill an existing record (FR-040). The monthly-review prompt renders only inside the settings form, so it invites confirmation without pushing anyone there.
- **A-4** — *Gate reuse*: the verdict engine's existing incomplete-settings data gate and its existing waiting reason are reused unchanged. This feature adds no new gate, no new reason string, and no new waiting state.
- **A-10** — *Order-value hint wording*: report §9 gives the Arabic hint as «متوسط ما يدفعه العميل الواحد». The terminology guard's documented policy states that «متوسط» is internal-only and must not appear in user-facing copy, directing authors to «المعدل» or appropriate Fusha instead. The policy is not regex-enforced, so the report's wording would ship silently. This feature therefore uses «المبلغ الذي يدفعه العميل الواحد عادة», which carries the same meaning in simple Fusha and honours the policy. The report's §9 label wording «قيمة الطلب» is used unchanged.
- **A-11** — *Consistency rename*: the paid-product conversion-rate field is relabelled from "upsell conversion rate" to "high ticket conversion rate", so it does not sit beside the renamed "high ticket price" (FR-037) still calling the same offer an upsell. Label only; the field is unchanged.
- **A-5** — *Return-target options*: the three selectable return targets (1.0, 0.65, 0.5) are unchanged. Only the paid-event default moves, from 1.0 to 0.5.
- **A-6** — *Guidance placement*: guidance renders in the muted text style already used elsewhere in the form, immediately below its field, so it survives the owner beginning to type.
- **A-7** — *Bilingual copy convention*: new copy follows whichever convention the surrounding form already uses for paired English/Arabic strings, so the feature does not introduce a second convention alongside the existing one.
- **A-8** — *Verification limits*: the settings save and load paths are backend callables and cannot be exercised by the local dev server; they require a deploy to verify end to end. The economics module, being pure, is fully verifiable locally.
- **A-9** — *Existing advisory*: the missing-high-ticket advisory keeps its current trigger and wording; only the low-value advisory's trigger changes.
- **A-12** — *Known deviation from FR-050 (completeness single source of truth)*: At the end of Phase 10, two completeness implementations remain — `missingRequiredFields` (`functions/src/funnelSettings.ts:324`) on the backend, and `computeMissingFields` (`src/components/FunnelSettingsForm.tsx`) on the frontend. FR-050 forbids two implementations: *"The completeness rule MUST be defined in exactly one place and reused everywhere it is needed … Two independent implementations of 'complete' MUST NOT exist."* Phase 10 reduced the drift risk by extracting `computeMissingFields` as a named function and adding the constitution XI parity gate (`functions/src/__tests__/funnelEconomicsParity.test.ts` + `src/__tests__/funnelCompleteness.test.ts`): any future change to one side without the other fails both tests today. **The deviation is recorded here explicitly** (i) so it does not merge as an implicit carry-forward, (ii) so the PR description states it loudly, and (iii) so the next phase that touches the form is on notice that the symmetry is held by tests, not by a single source of truth. The cleanest end-state is a single shared module (a refactor outside Phase 10's scope), and the parity tests will fail loudly when one side is updated without the other, making the refactor safely postponable but not invisibly accumulating drift.

## Dependencies

- The corrected benchmark ranges in report §4 and the Arabic wordings in report §9 are supplied by the product owner and are treated as fixed inputs to this feature.
- The existing user-facing-terminology guard remains in force unchanged; this feature must satisfy it rather than adjust it (FR-035).
- Deferred and tracked separately: report item 11 and §8 (funnel epoch, epoch-scoped aggregates, change-tier classification, OQ-2 threshold), and report OQ-3 (team member permissions).
