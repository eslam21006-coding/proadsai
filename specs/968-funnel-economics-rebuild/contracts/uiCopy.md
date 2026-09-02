# Contract: User-facing copy

**Feature**: `968-funnel-economics-rebuild`

All 35 pairs below were machine-checked against the **strengthened** Batch 1 patterns.

| Result | Count |
|---|---|
| Pairs clean with no suppression needed | **22** |
| Pairs requiring a reasoned per-line suppression | **13** — the benchmark hints (#2, 4, 6, 7, 8, 10, 12, 18, 29, 30, 31, 32, 33) |
| Hits on any non-percentage pattern (CTR/CPA/CPL/CPM/ميديان) | **0** |
| «متوسط» policy flags | **0** |

The 13 suppressions are deliberate and visible. Every other string passes on its own merits.

---

## 1. Placement rules

| File | Convention | Guard status |
|---|---|---|
| `src/components/FunnelSettingsForm.tsx` | Inline `L('English', 'العربية')` pairs — the file's existing style | **SCANNED.** Must NOT be added to `scripts/.sc11-allowlist` (FR-035a) |
| `src/App.tsx` | Catalogue keys via `t('…')` — the file's existing style | Already allowlisted (pre-existing) |
| `src/i18n.tsx` | Catalogue entries | Already allowlisted (pre-existing). Changes for the **badge string only** |

> **Do not relocate form copy into `i18n.tsx` to avoid the scan.** Both `i18n.tsx` and `App.tsx` carry pre-existing whole-file allowlist entries, so copy placed there is never checked. Moving user-facing strings there to clear the linter is evasion of the rule, not compliance with it (FR-035a).

---

## 2. Guard rules that constrain the copy

**Strengthened pattern (Batch 1)**: `/[\d٠-٩۰-۹]+\s*[%٪]|percent/gi`

The original pattern was `/\d+\s*%|percent/gi`, which caught only Latin digits followed by U+0025. Three of the four ways to write a percentage in Arabic copy passed straight through:

| Form | Original | Strengthened |
|---|---|---|
| `5–10%` — Latin + `%` | caught | caught |
| `٥–١٠%` — Arabic-Indic + `%` | **missed** | caught |
| `5–10٪` — Latin + `٪` (U+066A) | **missed** | caught |
| `٥–١٠٪` — Arabic-Indic + `٪` | **missed** | caught |
| `Booking rate (%)` — bare unit marker | passes | passes |
| `50` — bare preset button | passes | passes |

### Hints carry their unit honestly

An earlier draft of this contract stripped the `%` from every hint and relocated the unit to the field label — `"Typical range: 5–10"` under `"Booking rate (%)"`. That was **rejected as evasion**: the rendered UI still reads "5–10%" to the owner, and the guard was being defeated by splitting one semantic percentage across two strings.

Hints now carry the symbol, each with an explicit per-line suppression naming a reason:

```tsx
hint: L('Typical range: 5–10%', 'المعتاد: ٥–١٠٪'), // sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
```

The exception is now visible in the source, printed by the guard on every run, and auditable — which is what constitution VI and VII actually require. A rewording would have hidden it.

**Phase 12 — paid_product hints.** Phase 11 reused the lead_magnet_call chain slots for paid_product (different denominator, same field name). Phase 12 renamed the storage slots to `product*`; the form hints were originally carried over with the slot identity and shipped the lead-side benchmarks (5–10% / >65% / 20–25%) on a buyer-side field. The product owner has confirmed distinct paid_product benchmarks (#29–31) and the lead-side numbers are now dead. The `Typical range` copy for paid_product states a number; the qualifier that distinguishes "buyer who booked → attended → bought" from "any lead who booked → attended → closed" lives on the LABEL, not the hint (see #29's pending label work below).

**Still genuinely fine, not a dodge**: `(%)` as a bare unit marker on a label. It carries no value, and it is the file's pre-existing convention (`FunnelSettingsForm.tsx:698` ships `'Attendance rate (%)'` today). Bare `50` / `60` / `70` preset buttons are likewise fine — the group label carries the unit and the buttons carry no percentage.

Additionally, «متوسط» is banned by the guard's **documented policy** (see `scripts/sc11Guard.mjs:11` and `:84` — "متوسط is INTERNAL-ONLY (not in src/**). It is NOT in the pattern set here. The user-facing equivalent in stats labels is المعدل or appropriate Fusha") but is deliberately absent from its regex set — so a violation would ship silently. Avoid it in all new Arabic copy. The Phase 0 decision that produced this policy is recorded at `specs/968-funnel-economics-rebuild/research.md:127-133` and the spec's A-10 assumption at `specs/968-funnel-economics-rebuild/spec.md:368` ties this contract to it.

## 3. Strings — `FunnelSettingsForm.tsx` (inline `L()` pairs)

### Lead magnet → call

| # | English | Arabic |
|---|---|---|
| 1 | Booking rate (%) | نسبة حجز المكالمات من العملاء المحتملين (%) |
| 2 | Typical range: 5–10% | المعتاد: ٥ – ١٠٪ |
| 3 | Show-up rate (%) | نسبة الحضور للمكالمات المحجوزة (%) |
| 4 | Typical range: 60% | المعتاد: ٦٠٪ |
| 5 | Close rate on qualified calls (%) | نسبة الإغلاق في المكالمات المؤهلة (%) |
| 6 | Typical range: 25% | المعتاد: ٢٥٪ |

**Phase 13 — qualification stage added to the lead-side chain.**
The close rate label (#5) now conveys "qualified attended calls that
buy" (was "calls that happened" — omitted the qualifier that makes
the 25% benchmark meaningful). The show-up hint (#4) moved from
"above 65%" to "60%" (Phase 13 owner-supplied benchmark). The close
hint (#6) moved from "20–25%" to "25%" because the qualifier on the
label moved that range onto the qualification stage (50%, new pair
#32 below). Suppression lines remain attached to the same lines;
the hint copy itself swapped.

### Free webinar

| # | English | Arabic |
|---|---|---|
| 7 | Typical range: 20–30% | المعتاد: ٢٠ – ٣٠٪ |
| 8 | Typical range: 1–3% | المعتاد: ١ – ٣٪ |

Existing labels for this funnel are unchanged.

### Paid event

| # | English | Arabic |
|---|---|---|
| 9 | Attendance from ticket buyers (%) | نسبة الحضور من مشتري التذاكر (%) |
| 10 | Typical range: 70–80% | المعتاد: ٧٠ – ٨٠٪ |
| 11 | High ticket close from attendees (%) | نسبة إغلاق العرض عالي القيمة من الحضور (%) |
| 12 | Typical range: 5–10% | المعتاد: ٥ – ١٠٪ |

### High-ticket offer — renames (FR-037, A-11)

| # | English | Arabic | Was |
|---|---|---|---|
| 13 | High ticket price ($) | سعر العرض عالي القيمة (دولار) | `'Upsell price ($)'` / `'سعر العرض الترويجي (دولار)'` |
| 14 | High ticket conversion rate (%) | نسبة تحويل العرض عالي القيمة (%) | `'Upsell conversion rate (%)'` — A-11 consistency rename |
| 15 | Do you have a high-ticket offer? | هل لديك عرض عالي القيمة؟ | `'…high-ticket upsell?'` |

### No-hto advisory body (Phase 10 — Phase 9 Item B)

| # | English | Arabic | Was |
|---|---|---|---|
| 15a | You don't have a high-ticket offer configured. This limits the funnel's ability to absorb the higher ad spend needed to reach customers who pay large amounts. | لا يوجد لديك عرض عالي القيمة في إعداداتك. هذا يحد من قدرة المسار على استيعاب تكاليف الإعلانات الأعلى التي تحتاجها للوصول إلى عملاء يدفعون مبالغ كبيرة. | `'…high-ticket upsell configured…' / 'لا يوجد لديك عرض ترويجي عالي القيمة (HTO) في إعداداتك'` — Phase 9 Item B (rule breach reaching production) |

The pre-Phase-10 body shipped `(HTO)` as a parenthetical technical term inside user-facing Arabic copy. Phase 10 strips the acronym and aligns the wording to the renamed `#15` (`'Do you have a high-ticket offer?' / 'هل لديك عرض عالي القيمة؟'`). The acronym belongs in internal code and comments (FR-019, SC-11 spirit: user-facing Arabic is plain Fusha with no English-transliterated technical terms). The previous wording is preserved in the table's `Was` column for the diff trail.

### Order value hint (FR-036, A-10)

| # | English | Arabic |
|---|---|---|
| 16 | The amount one customer usually pays you | المبلغ الذي يدفعه العميل الواحد عادة |

> Report §9 gives «متوسط ما يدفعه العميل الواحد». That wording uses a word the guard's policy marks internal-only, and the guard would not catch it. Substituted above. The §9 **label** «قيمة الطلب» is used unchanged.

### Commission and margin

| # | English | Arabic |
|---|---|---|
| 17 | Sales commission (%) | عمولة المبيعات (%) |
| 18 | Typical: 10% | المعتاد: ١٠٪ |
| 19 | Margin you want to keep (%) | نسبة الربح التي تريد الاحتفاظ بها (%) |
| 20 | 50 · 60 · 70 | ٥٠ · ٦٠ · ٧٠ |
| 21 | More room to spend | مساحة أكبر للإنفاق |
| 22 | Balanced | متوازن |
| 23 | More profit kept | ربح أكبر محتفظ به |

Buttons follow the existing `ROAS_OPTIONS` visual pattern (`FunnelSettingsForm.tsx:303-307`, rendered at `:677-689`). Labels are the bare numbers — see §2.

### Paid-event dual-path results card (FR-032)

| # | English | Arabic |
|---|---|---|
| 24 | Based on ticket revenue | محسوب على إيراد التذاكر |
| 25 | Based on projected event value | محسوب على القيمة المتوقعة للفعالية |
| 26 | Your target follows ticket revenue, because the later value of your event is not proven yet. | هدفك محسوب على إيراد التذاكر، لأن قيمة العرض التالي في فعاليتك لم تثبت بعد. |
| 26a | Your target follows the later value of your event, because it is now the lower of the two. | هدفك محسوب على قيمة العرض التالي في فعاليتك، لأنها أصبحت الأقل بين الرقمين. |

String 26 is the active-path explainer for the ticket-revenue case (the common case). String 26a is the active-path explainer for the projection-active case (when `capApplied === true`). The two strings render mutually exclusively — see `FunnelSettingsForm.tsx:1237`. Phase 968 round-15 (#3897474... Item 6) replaced a previous version that shipped Latin "back-end" jargon inside the user-facing Arabic copy (same family of breach as the `(HTO)` parenthetical fixed in Phase 10). The replacement is Fusha on both sides and pinned here alongside #26 so future batches see both branches.

### Incomplete record (FR-052)

| # | English | Arabic |
|---|---|---|
| 27 | Targets are paused until you fill the fields below. | الأهداف متوقفة حتى تكمل الحقول التالية. |
| 28 | Required | مطلوب |

### Low price offer (Phase 11 + Phase 13)

The labels below render on the paid_product branch of the form. The hints are the four benchmark ranges confirmed by the product owner (Phase 11 + Phase 13). The lead_magnet_call benchmarks (#2, #4, #6) were briefly shipped here by Phase 11's storage-slot overload and have been removed.

| # | English | Arabic |
|---|---|---|
| 29 | Typical range: 20% | المعتاد: ٢٠٪ |
| 30 | Typical range: 60% | المعتاد: ٦٠٪ |
| 31 | Typical range: 25% | المعتاد: ٢٥٪ |

**Phase 13 — close rate benchmark revised.** The 25% figure on #31 is
the close rate on QUALIFIED attended calls (buyer attended + buyer
is qualified to buy) — was "20–25%" on all attended calls. The
qualifier now lives on the LABEL wording (the close rate label
reads "Close rate on qualified calls (%)" / "نسبة الإغلاق في
المكالمات المؤهلة (%)"; see FunnelSettingsForm.tsx and
MISSING_FIELD_LABELS for the localized surface). Suppression lines
remain attached to the same lines; the hint copy itself swapped.

### Qualification stage (Phase 13 — added to both call-based funnels)

The hints below render on the new `Qualification rate (%)` input —
one per funnel type, same wording.

| # | English | Arabic |
|---|---|---|
| 32 | Typical range: 50% | المعتاد: ٥٠٪ |
| 33 | Typical range: 50% | المعتاد: ٥٠٪ |

The LABEL is the same on both funnels (`Qualification rate (%)` /
`نسبة المكالمات المؤهلة (%)`); the underlying storage fields differ
(`qualificationRate` for `lead_magnet_call`, `productQualificationRate`
for `paid_product`) per the funnel-scoping convention established in
Phase 12. Each row above carries the same
`sc11-allow:PERCENT_SIGN reason="benchmark range for an input hint;
owner guidance, not a reported performance metric"` as #2 / #4 / #6
/ #7 / #8 / #10 / #12 / #18 / #29 / #30 / #31.

### Mouse-wheel guard (Phase 13 CHANGE 2 — replaced by blur on wheel in batch-12)

**Original implementation (Phase 13 commit `3963964`):** `onWheel={preventWheelValueChange}` — a handler that calls `preventDefault` when the wheel target is the focused input. **This implementation was broken in production** because React 19 attaches delegated `wheel` listeners with `{ passive: true }` (see `node_modules/react-dom/cjs/react-dom-client.development.js:19251-19255`), which means `preventDefault()` is silently ignored by the browser even though the JS function runs. The original jsdom tests passed because they asserted on method invocation (spy called once), not on the browser-level `defaultPrevented` flag — they pinned the wrong invariant. See `docs/investigations/wheel-handler-passive-listener-report.md` for the full root-cause analysis.

**Replacement (batch-12, replaces the broken preventDefault handler):** `onWheel={(e) => e.currentTarget.blur()}`. Blurring the input removes focus, which gates the browser's value-mutation-on-wheel behavior because that behavior is conditional on focus. The fix does not depend on `preventDefault()` being honored.

Trade-off: the input loses focus on wheel scroll. The user can re-click to resume editing. The page still scrolls (focus loss does not stop wheel-driven page scroll). No blur listeners exist anywhere in this codebase (verified by a frontend-wide grep before applying the fix — see `docs/investigations/blur-side-effect-audit-report.md`), so this fires no React side effects.

**Test coverage (batch-12):** the three original jsdom tests are deleted. One jsdom test remains in `src/__tests__/funnelSettingsRender.test.tsx` and asserts only the cheap invariant — after a wheel event on a focused number input, `document.activeElement !== input`. The user-visible invariant — "value is unchanged in a real browser" — is verified manually by the owner (click into a field, scroll, confirm the value holds). jsdom cannot simulate value-mutation-on-wheel, so a jsdom value-invariance assertion would pass whether the fix works or not.

### Survey link on tight-economics advisory (batch-12 ITEM 2)

The tight-economics advisory reads "Re-check your numbers or **talk to us**." on both paid_event and paid_product/free_webinar/lead_magnet_call results cards when `derived.paid.capApplied` is true. The phrase "talk to us" / "تواصل معنا" is a link to `SURVEY_URL`.

**URL constant (single source of truth):**

```ts
const SURVEY_URL = 'https://example.com/survey';
```

Defined in `src/components/FunnelSettingsForm.tsx:194-198` next to the existing `TEAM_DISCOVERY_URL`. Both advisory call sites render the same `<a>` so the link stays in sync if `SURVEY_URL` is swapped.

**Rendered JSX pattern (applied at both advisory locations):**

```tsx
{L('Reminder: your funnel economics are very tight. Re-check your numbers or ', 'تذكير: أرقام مسارك الاقتصادي ضيقة جداً. راجع الأرقام أو ')}
<a
    href={SURVEY_URL}
    target="_blank"
    rel="noopener noreferrer"
    className="underline font-semibold hover:opacity-80"
>
    {L('talk to us', 'تواصل معنا')}
</a>
{L('.', '.')}
```

**Accessibility / security:**

- `<a href={SURVEY_URL}>` is keyboard-accessible by default (Tab to focus, Enter to activate).
- `target="_blank"` opens in a new tab — keeps the funnel form open while the survey loads.
- `rel="noopener noreferrer"` prevents the new tab from accessing `window.opener` (security) and prevents referrer leakage (privacy). Required when `target="_blank"` is used.
- Underlined and bold-styled (`underline font-semibold`) so the link is visually distinct from the surrounding advisory text. The hover state (`hover:opacity-80`) gives keyboard / pointer affordance.

**Test coverage (batch-12):** three new tests in `src/__tests__/funnelSettingsRender.test.tsx` (one describe block: `Tight-economics advisory — survey link (SURVEY_URL)`):

1. `paid_event: renders a 'talk to us' link to SURVEY_URL with target=_blank and rel=noopener-noreferrer` — pins the EN link on the paid_event card.
2. `paid_product: renders a 'talk to us' link to SURVEY_URL with target=_blank and rel=noopener-noreferrer` — pins the EN link on the paid_product card.
3. `Arabic language: link text is 'تواصل معنا'` — pins the AR link.

The test harness `renderFormFor` was extended with an optional `lang` parameter (`"en" | "ar"`) that overrides the default `localStorage.proads_ui_lang` setting. The `LanguageProvider` reads this on mount via a lazy `useState` initializer.

The advisory copy itself is unchanged: prefix + link + suffix split preserves the bilingual structure (`L(...)` helpers around each segment). No new strings enter `src/i18n.tsx`; the segments stay inline as Phase 9 (T057) cataloguing is still pending.

---

## 4. Strings — `src/i18n.tsx` (catalogue keys)

Badge copy only, consumed by `App.tsx`.

| Key | English | Arabic |
|---|---|---|
| `funnel.needs_attention` | Your funnel settings need updating | إعدادات مسار المبيعات تحتاج تحديثاً |

Rendered as a passive marker on the existing Funnel Settings menu entry (`App.tsx:1567-1570`), following the `activeWorkspaceNeedsMetaAccount` precedent (`App.tsx:4192`). A dot with an accessible label — no modal, no redirect, no change to what activating the entry does (FR-051).

---

## 5. Verification requirement (FR-035c)

Before implementation is considered complete:

1. Re-run the enumeration — extract every new string destined for `FunnelSettingsForm.tsx` and match each against all seven strengthened patterns plus the «متوسط» policy check.
2. Confirm **exactly 13** suppressions exist in the form, one per benchmark hint, each naming `PERCENT_SIGN` and carrying a non-empty reason. (13 line-level suppressions cover 3 lead_magnet_call hints — #2, #4, #6 — 2 paid_event hints — #10, #12 — 2 free_webinar hints — #7, #8 — 1 commission hint — #18 — 3 paid_product hints — #29, #30, #31 — and 2 qualification hints — #32, #33. Total 13. Phase 12 had 11; Phase 13 added the qualification hints #32 / #33 — net +2. The lead_magnet_call close hint #6 and the paid_product close hint #31 are wording swaps on existing suppressions, not new entries.)
3. Confirm no suppression was added to any string outside those 13.
4. Confirm the negative controls still trip: `"Keep 50%"` as a button label, and a suppression with a missing or empty reason (must hard-fail).

`npm run lint` passing is necessary but **not sufficient** on three counts: it would also pass if the copy had been moved into an allowlisted file; it passes identically with a broken strengthened pattern (the dry run showed 0 hit-count change either way); and it cannot tell a justified suppression from a lazy one. Steps 1–4 are the real check.
