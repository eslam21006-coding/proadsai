# Contract: Step-2 UI Optional Fields (T19 — frontend)

**Surface:** `src/App.tsx` `tov_review` phase (6217–6824): field render (hookText 6586, subhead 6593, CTA/benefit 6602–6610), per-field regenerate buttons (6587/6594/6611), variation carousel (6744–6809), actions (Approve 6630/4022, Edit 6550–6582/6653, AI-Edit 6660/3948, Batch 6641/6849–6898). Types: `src/types.ts` (`HookVariation` 706–714, `TextOverride` 358–363, `CarouselSlideCopy` 365–370); parser `src/utils/hookVariationParser.ts`.
**Paranoid checkpoint:** YES — live step-2 UI every generation flows through.

## Required behavior (pass/fail rows)

| # | Given (variation field set) | Then (rendered UI) | FR / SC |
|---|---|---|---|
| U1 | All 4 fields present | renders exactly as today (no regression) | FR-015, SC-008 |
| U2 | Only `hookText` present (3 optional absent) | only the headline renders; NO empty container/label/separator/placeholder for subhead, CTA, or benefit | FR-003, US1 AC1, SC-001 |
| U3 | `ctaName` absent, others present | headline + subhead + (benefit if present) render; nothing CTA-related renders | US1 AC2 |
| U4 | An optional field is absent | its per-field regenerate button is NOT rendered (hidden, not disabled) | FR-004, US1 AC3, SC-002 |
| U5 | An optional field is present | its per-field regenerate button renders (hover-reveal as today) | FR-004, SC-002 |
| U6 | Arabic copy with some absent fields | present fields keep `dir="rtl"` + `text-right` + correct ordering; no LTR leakage | FR-005, US1 AC4, SC-001 |
| U7 | No add-field affordance anywhere | absent field stays absent in step-2; there is NO "add subhead/CTA/benefit" control | FR-004 (Q4) |
| U8 | Variation carousel with mixed field counts across positions | every position renders per U2–U6; arrows/dots work; RTL next=leftward | FR-012, US3 AC4 |
| U9 | Approve on a variation missing optional field(s) | approval succeeds carrying only present fields; no synthesized empty fields | FR-013, US3 AC1 |
| U10 | Edit/AI-Edit on a variation missing optional field(s) | editor operates on present fields; an untouched empty optional input maps back to `null` on save (never `""`) | FR-013, US3 AC2, FR-006 |
| U11 | Batch across variations with differing field sets | each processed against its own present fields; no forced 4-field shape | FR-013, US3 AC3 |
| U12 | `claimFlag` present on a present field | existing Phase 22 chip/behavior unchanged for that field | FR-011 |

## Invariants

- **UINV-1**: An absent optional field produces **zero** DOM nodes for that field (no hidden-but-present empty box). Verified by absence of the node, not by CSS visibility. (FR-003)
- **UINV-2**: A regenerate button for an absent field is **not in the DOM** (hide, not disable — clarify Q4 rejected disabled+tooltip). (FR-004)
- **UINV-3**: The frontend never writes `""` back into a copy field's stored value; empty editor inputs normalize to `null` on save. (FR-006, D8 edit-mode caveat)
- **UINV-4**: `hookText` always renders; the `"⚠️ Hook unavailable"` fallback (6586) is an error-only path, never the normal absent path. (FR-002, D5)
- **UINV-5**: Loading state (`...Generating Subheadline`) is preserved while `isLoadingItem`; only the **non-loading empty** branch changes from rendering `""` to rendering nothing. (D7)

## Out of scope (must NOT change)

- No add-field UI (Q4 / FR-004). No decision-brain / structure picker (Phase C, OOS-001..003).
- No change to Phase 23.A variation carousel behavior beyond tolerating fewer fields (OOS-004).
- No frontend hosting deployment (OOS-006).

## Test obligations (FR-016)

Add a focused render test (new step-2 test harness) asserting U2/U4 via DOM-node absence (not opacity), using existing `data-testid`s (`variation-carousel-${v}` 6745, `variation-active-text-${v}` 6800) plus new per-field test ids. `npm run build` (frontend) clean after type widening.
