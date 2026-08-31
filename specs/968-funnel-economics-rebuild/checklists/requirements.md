# Specification Quality Checklist: Funnel Economics Rebuild

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-08-31
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

Validation run 2026-08-31 — all items pass.

Resolved before drafting (product owner decisions, no markers carried into the spec):

1. **Item 11 / report §8 deferred in full.** No `businessEpoch`, no `verdictEpoch`
   stamping, no epoch-scoped aggregate paths, no Tier-1/Tier-2 rule, no OQ-2
   threshold. This removed `functions/src/metaSync/shared.ts` and
   `functions/src/learningAggregates.ts` from the working file set — they were in
   the original list only to serve item 11. Preserving aggregates became a
   regression invariant (FR-041) rather than a migration step.
2. **Terminology-guard route** — verified against `scripts/sc11Guard.mjs` BEFORE
   writing copy, as the hard constraint required. Phase 1 strengthened the
   percentage rule to `/[\d٠-٩۰-۹]+\s*[%٪]|percent/gi` (Latin + Arabic-Indic +
   Eastern Arabic-Indic digits + both `%` and `٪`) per FR-054 — this checklist
   originally documented the pre-Phase-1 expression, which is now superseded.
   The strengthened pattern needs a **digit** immediately before `%` or
   `٪`, which is why today's `'Attendance rate (%)'` labels pass unexempted.
   Benchmark text such as `5–10%` or `٥–١٠٪` WOULD trip it. Resolution:
   per FR-035, benchmark hints carry the symbol with a per-line suppression
   naming `PERCENT_SIGN` and a non-empty reason; bare-number ranges without
   the symbol need no suppression. The strengthened pattern + suppression
   mechanism is documented at `scripts/sc11Guard.mjs:11 + 84` and the
   per-line contract is `FR-055/FR-056`. Note for planning: `src/i18n.tsx` already
   sits on `scripts/.sc11-allowlist` as a whole-file entry, so copy placed there
   would not be scanned; the spec deliberately does not rely on that.
3. **OQ-1 override placement** — commission applies to the high-ticket term only
   on `paid_product` (FR-019), matching `paid_event` and honouring D-2's rule
   that self-serve checkout revenue carries no commission.

Two report discrepancies recorded rather than silently absorbed:

- **A-2**: report §6.1 shows $15.94 for the 50% margin row; a single end-of-chain
  rounding gives $15.95. The 60% and 70% rows match the report exactly. The
  fixture uses $15.95 and FR-048 fixes the rounding order.
- **FR-018**: the report's §5 and OQ-1 exclude `paid_product` from commission.
  The product owner's override supersedes both, and the spec says so explicitly
  at the requirement.

---

## Re-validation after `/speckit.clarify` — 2026-08-31

All 16 checklist items re-checked and still passing after 5 clarifications.
Spec grew from 43 FRs / 12 SCs / 6 stories to **59 FRs / 13 SCs / 7 stories**.

1. **Verdict fallout.** A proposed rollout-gate option was rejected by the product
   owner as unimplementable — the nightly sync reads `derived` from the same
   document the form writes, so there is no seam to block, and creating one would
   be a partial epoch. Replaced with: no backfill, incompleteness yields a null
   effective target, and the verdict engine's **existing** data gate
   (`qararEngine.ts:224`) returns ⏳ with `REASON_DATA_GATE_FUNNEL_MISSING`. No
   verdict written → no counts reach `learningAggregates`. Verified that
   `metaSync/shared.ts:839`'s `?? Infinity` does NOT defeat this: that value feeds
   only `adSetHittingTarget` (an option), while `evaluateVerdict` receives the
   whole settings object and runs its null gate first. `metaSync/shared.ts` stays
   out of scope. FR-039–FR-045.
2. **Discoverability.** A form-only option was rejected as circular — it helps only
   an owner who has already opened the form. Resolved as badge + in-form marking.
   `getFunnelSettings` returns a `complete` flag; `App.tsx` renders a passive dot on
   the menu entry. Verified `App.tsx` already probes that callable (line 4283), so
   the flag is nearly free. **Trap identified and closed**: returning
   `settings: null` for an incomplete record — the obvious implementation — would
   flip `funnelSettingsHasDoc` to false and trip the first-run auto-open at
   `App.tsx:4354`, auto-pushing every existing owner into the form. FR-043 forbids
   it; FR-053 forbids wiring the flag into that gate or the review prompt.
   `src/App.tsx` added to scope, strictly limited. FR-049–FR-053.
3. **Copy placement.** An earlier instruction to route benchmark copy into the
   allowlisted `i18n.tsx` was withdrawn by the product owner as evasion rather than
   compliance. Each file keeps its own convention; the form is NOT allowlisted.
   All 30 new string pairs enumerated and machine-checked against the live guard
   patterns — **0 violations** — with negative controls (`Keep 50%`, `5–10%`,
   `5 - 10 %`, `Keep 50 percent`) confirmed to trip, proving the check is not
   vacuous. FR-035, FR-035a–c, FR-025a.
4. **Superseded field.** `htoConversionRate` retained but unread on paid_event —
   keeps a revert code-only. Recorded in Key Entities.
5. **Advisory boundary.** Fires on the rounded displayed target, strictly below
   $0.50; equality does not warn, matching the existing cap convention. Boundary
   fixture at raw 0.4999. FR-028, FR-028a.

Two deviations from the source report, both deliberate and recorded:

- **A-10** — report §9's Arabic order-value hint uses «متوسط», which the guard's own
  header documents as internal-only and not user-facing. It is NOT in the regex
  set, so the report's wording would have shipped silently past the guard.
  Substituted «المبلغ الذي يدفعه العميل الواحد عادة».
- **A-11** — relabelled the paid-product conversion-rate field for consistency with
  the renamed high-ticket price. Report item 8 covers only the price; leaving the
  neighbouring label saying "upsell" would name one offer two ways.

Editorial fix applied without a question: the incomplete-save rejection was scoped
to lead-magnet-to-call only; generalised to all four funnel types (FR-040a), making
incompleteness a legacy-only state that can be inherited but never newly created.
