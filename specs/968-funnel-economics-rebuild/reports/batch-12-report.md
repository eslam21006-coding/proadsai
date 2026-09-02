# batch-12-report — ITEM 1 (wheel-handler fix) + ITEM 2 (survey link)

- **Branch:** `968-funnel-economics-rebuild`
- **Prior commit:** `72e3f9f` (Phase 13 §6 reconciliation fix, pushed)
- **This commit:** see §9 below.
- **Status:** Local checks green at HEAD; report written before push per AGENTS.md §0a.

---

## §0 — Stop-and-report gate

This batch covers two distinct production-feedback items (ITEM 1 + ITEM 2). Both
were approved by the owner before any code change. The investigation for ITEM
1 is documented in two local reports:

- `docs/investigations/wheel-handler-passive-listener-report.md` — root cause
  analysis (React 19 passive wheel listener).
- `docs/investigations/blur-side-effect-audit-report.md` — pre-implementation
  audit confirming zero onBlur handlers / zero save-on-blur / zero global
  blur listeners anywhere in the frontend.

The owner explicitly approved the blur-on-wheel fix and the new test scope
(one jsdom blur test, no Playwright). The owner also explicitly approved
ITEM 2 (survey link) being implemented in the same batch.

---

## §1 — Background

### ITEM 1

The Phase 13 CHANGE 2 mouse-wheel guard (commit `3963964`) added a
`preventWheelValueChange` handler that called `preventDefault` on wheel events
that originated on the focused number input. The owner reported the bug still
occurred in production: scrolling while focused on a number input changed the
value. The investigation report proved the root cause was React 19 attaching
delegated `wheel` listeners with `{ passive: true }`, making `preventDefault()`
a no-op in the browser.

### ITEM 2

The tight-economics advisory on the funnel form reads "Re-check your numbers
or talk to us." The owner requested making "talk to us" a link to a survey
instrument so feedback can route around the form. The URL is a placeholder
(`SURVEY_URL = 'https://example.com/survey'`) defined in one place so it can
be swapped later without touching the JSX.

---

## §2 — Files touched (full batch-12)

| File | Change | Reason |
|---|---|---|
| `src/components/FunnelSettingsForm.tsx` | ITEM 1: replace `onWheel={preventWheelValueChange}` with `onWheel={(e) => e.currentTarget.blur()}` (line 1787). Delete `preventWheelValueChange` function (was lines 194-216). Rewrite the surrounding comment block to describe the new mechanism. ITEM 2: add `SURVEY_URL` constant near `TEAM_DISCOVERY_URL` (line 194-198). Split the two advisory bilingual strings (paid_event card at ~1648 and paid_product/free_webinar/lead_magnet_call card at ~1685) into prefix + `<a>` + suffix with `href={SURVEY_URL} target="_blank" rel="noopener noreferrer"`. | Wheel handler fix; survey link. |
| `src/__tests__/funnelSettingsRender.test.tsx` | ITEM 1: delete three tests in the `NumberField — wheel scroll does not change value (CHANGE 2)` describe block + the import on line 479. Add one jsdom blur test in a new describe block `NumberField — wheel handler blurs the focused input`. ITEM 2: add `SURVEY_URL` constant + `makeSettingsWithCapApplied` factory + a new describe block `Tight-economics advisory — survey link (SURVEY_URL)` with three tests (paid_event EN, paid_product EN, paid_event AR). Extend `renderFormFor` with an optional `lang: "en" \| "ar"` parameter (override of `localStorage.proads_ui_lang`) so the Arabic test can flip the i18n provider. | Test coverage for both items. |
| `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` | ITEM 1: rewrite `Mouse-wheel guard (Phase 13 CHANGE 2)` section to describe both the original (broken) implementation and the batch-12 replacement. ITEM 2: new `Survey link on tight-economics advisory (batch-12 ITEM 2)` section with the URL constant, JSX pattern, accessibility/security notes, and test coverage list. | Contract documentation. |
| `specs/968-funnel-economics-rebuild/reports/batch-11-report.md` | §6 addendum: record batch-12 test deltas. The owner explicitly corrected the prior draft's math ("net −2, not −3"); this batch extends the addendum with the full ITEM 1 + ITEM 2 delta table and reconciliation table. | Reconciliation per AGENTS.md §0b. |
| `docs/investigations/wheel-handler-passive-listener-report.md` | (No edit — investigation report, written earlier in this session, untouched in this batch.) | Local investigation record. |
| `docs/investigations/blur-side-effect-audit-report.md` | (No edit — investigation report, written earlier in this session, untouched in this batch.) | Local investigation record. |

No backend, contract, or i18n catalogue files touched. `package.json` /
`functions/package.json` unchanged. No new dependencies. No lint config
changes.

---

## §3 — Test-count delta (full batch-12)

### ITEM 1 alone (per the owner's explicit correction)

| State | Tests on `funnelSettingsRender.test.tsx` |
|---|---:|
| Phase 13 baseline (`e01b5eb`) | 16 |
| After Phase 13 initial (`3963964`) | 19 (+3 wheel tests) |
| After Phase 13 fixes (`9c3d510` + `83c0603`) | 19 (no change) |
| **After batch-12 ITEM 1** | **17 (−2: −3 deleted + 1 added)** |

The owner explicitly stated: "net −2, not −3. The delta is 19 → 17 on
`funnelSettingsRender.test.tsx` and 84 → 82 on the runner total."

### ITEM 2

| State | Tests on `funnelSettingsRender.test.tsx` |
|---|---:|
| After batch-12 ITEM 1 | 17 |
| **After batch-12 ITEM 2** | **20 (+3)** |

### Combined batch-12 net

| State | Frontend runner total |
|---|---:|
| Prior (HEAD `72e3f9f` after §6 fix) | 84 |
| After ITEM 1 (wheel handler) | 82 (−2) |
| After ITEM 2 (survey link) | 85 (+3) |
| **Batch-12 net** | **+1** |

### Reconciliation table

| Source | Frontend total |
|---|---:|
| Prior (HEAD `72e3f9f`) | 84 |
| ITEM 1: −3 deleted + 1 added | −2 |
| ITEM 2: +3 added | +3 |
| Other 5 frontend files (unchanged) | 0 |
| **Expected current** | **85** |
| **Runner reports** | **85** ✓ |

Sum of per-file deltas: −2 + 3 + 0 + 0 + 0 + 0 = **+1**. Runner confirms:
85 − 84 = **+1**. Matches.

Backend runner total unchanged: 307. No backend fixtures touched.

---

## §4 — Names vs bodies walk (AGENTS.md §0b first half)

For every test added or deleted in this batch, assert the test name is
consistent with the assertion(s) in the corresponding test source.

### ITEM 1 — added tests

1. **Test:** `wheel on a focused number input blurs it (activeElement is no longer the input)`
   **Source:** `src/__tests__/funnelSettingsRender.test.tsx:500-521`
   **Body:** focuses a number input, dispatches a `WheelEvent`, asserts
   `document.activeElement !== input`.
   **Consistency:** name says "blurs" + "activeElement is no longer the input";
   body asserts exactly that. Direction (blur → activeElement change) matches.
   **PASS.**

### ITEM 1 — deleted tests (all 3 must have been there before this batch)

1. **Was:** `preventWheelValueChange calls preventDefault when wheel target is the focused input`
   **Was asserting:** positive case — `preventDefault` called once when
   `target === currentTarget`.
   **Why deleted:** tested the wrong invariant. The handler is correct as a
   JS function but useless in production (passive listener). Replaced by the
   blur test above which pins a real, observable DOM-level invariant.

2. **Was:** `preventWheelValueChange does NOT call preventDefault when target !== currentTarget (bubble case)`
   **Was asserting:** negative case — `preventDefault` not called when
   `target !== currentTarget`.
   **Why deleted:** same reason — the function's bubble-case guard is
   correct JS but irrelevant because the function itself is unreachable in
   production (passive listener ignores `preventDefault()`).

3. **Was:** `mount: wheel over a focused number input does not change its value (integration)`
   **Was asserting:** integration test that mounted the form, dispatched a
   wheel, asserted `preventDefaultSpy` called + value unchanged.
   **Why deleted:** jsdom does not simulate the browser's value-mutation-
   on-wheel behavior, so the value assertion passes whether the fix works
   or not. The `preventDefaultSpy` assertion pinned method invocation,
   not `defaultPrevented`. Replaced by the blur test above (cheap real
   invariant — focus loss is a real DOM event jsdom gets right) plus
   manual owner verification (load-bearing invariant — value holds in a
   real browser).

### ITEM 2 — added tests

1. **Test:** `paid_event: renders a 'talk to us' link to SURVEY_URL with target=_blank and rel=noopener-noreferrer`
   **Source:** `src/__tests__/funnelSettingsRender.test.tsx:566-585`
   **Body:** renders the form on a paid_event fixture with `capApplied:
   true`; asserts at least one `<a href*="example.com/survey">` exists;
   asserts `href === SURVEY_URL`, `target === "_blank"`, `rel` includes
   `noopener` and `noreferrer`, and text is `"talk to us"`.
   **Consistency:** name says "paid_event", "talk to us" text, `SURVEY_URL`
   href, target/rel attributes. Body asserts all four. Direction matches.
   **PASS.**

2. **Test:** `paid_product: renders a 'talk to us' link to SURVEY_URL with target=_blank and rel=noopener-noreferrer`
   **Source:** `src/__tests__/funnelSettingsRender.test.tsx:587-605`
   **Body:** same as above but for paid_product.
   **Consistency:** name says "paid_product". Body uses
   `makeSettingsWithCapApplied("paid_product")`. Direction matches.
   **PASS.**

3. **Test:** `Arabic language: link text is 'تواصل معنا'`
   **Source:** `src/__tests__/funnelSettingsRender.test.tsx:607-625`
   **Body:** renders the form with `lang: "ar"`. Asserts the link's text
   is `"تواصل معنا"` and that `href` / `target` are unchanged across
   languages.
   **Consistency:** name says "Arabic language". Body uses the
   `lang: "ar"` override. Text assertion matches. **PASS.**

All names consistent with their bodies. No contradiction.

---

## §5 — Cross-section reconciliation (AGENTS.md §0b second half)

The runner totals are the ground truth:

```
$ npx vitest run
 Test Files  6 passed (6)
      Tests  85 passed (85)
```

```
$ npx tsc -b
(zero output — clean)
```

```
$ node scripts/sc11Guard.mjs
sc11-guard: 13 per-line suppression(s) applied across 1 file(s):
sc11-guard: PASS — 85 files scanned, 0 forbidden terms.
```

```
$ cd functions && npm run test:phase14
... (15 suites, 307 tests, 0 fail)
```

### (a) Per-file delta arithmetic

Per-file deltas for the full batch-12 (ITEM 1 + ITEM 2):

| Frontend file | Prior (72e3f9f) | After batch-12 | Delta |
|---|---:|---:|---:|
| `src/__tests__/funnelSettingsRender.test.tsx` | 19 | 20 | **+1** |
| `src/__tests__/funnelCompleteness.test.ts` | 17 | 17 | 0 |
| `src/__tests__/funnelSettingsSavePayload.test.ts` | 12 | 12 | 0 |
| `src/__tests__/i18n.test.tsx` | 10 | 10 | 0 |
| `src/__tests__/step2OptionalFields.test.tsx` | 13 | 13 | 0 |
| `src/__tests__/pricingLocalization.test.tsx` | 13 | 13 | 0 |
| **Frontend total** | **84** | **85** | **+1** |

Per the owner-approved breakdown:
- ITEM 1: −3 wheel tests + 1 blur test = **−2**
- ITEM 2: +3 survey-link tests = **+3**
- Net on this file: −2 + 3 = **+1**
- Net on runner: +1

Sum of per-file deltas: 1 + 0 + 0 + 0 + 0 + 0 = **+1**. Runner confirms:
85 − 84 = **+1**. Matches.

### (b) Backend unchanged

Per-suite backend counts at HEAD (`e01b5eb`) vs batch-12:

| Suite | Prior | After | Delta |
|---|---:|---:|---:|
| cpaEconomics | 66 | 66 | 0 |
| funnelSettings (contract) | 33 | 33 | 0 |
| funnelEconomicsParity | 15 | 15 | 0 |
| Other 12 suites (unchanged) | 193 | 193 | 0 |
| **Backend total** | **307** | **307** | **+0** |

No backend fixtures touched. The original §6(b) "+0 backend reconciles
with 307 = 307" line (about Phase 12 → Phase 13) still holds; batch-12
also has +0 backend, but in the sense "no backend tests touched at all",
not the tautology the reviewer flagged.

### (c) Total arithmetic

§5 frontend total 85 = sum of 6 per-file counts (verified by `vitest run`
output, 85 / 85 passed). §5 backend total 307 = sum of 15 per-suite
counts (verified by `npm run test:phase14` output, all `# tests N` /
`# fail 0` lines). Both match.

---

## §6 — Risks

1. **ITEM 1 — wheel fix requires real-browser verification by the owner.**
   jsdom does not simulate the browser's value-mutation-on-wheel behavior.
   The jsdom blur test confirms the mechanism (focus loss happens on
   wheel). The user-visible invariant (value holds in a real browser) is
   verified manually by the owner. If the manual check fails in a browser
   the owner uses (e.g., the browser does not gate value mutation on
   focus), the fix is incomplete and we ship nothing further until it
   passes. **Not blocking the push** because the jsdom invariant is real
   and the manual check is the owner's standing workflow.
2. **ITEM 1 — focus loss on wheel.** UX side effect. The user can re-click
   the input to resume editing. No blur listeners exist anywhere in the
   frontend (verified by the side-effect audit), so no React side
   effects fire. Risk: if a future change adds an onBlur handler to the
   form inputs, this fix would suddenly have side effects. The fix is
   brittle in that direction — but the side-effect audit is the
   ground-truth check before any future onBlur addition.
3. **ITEM 2 — `SURVEY_URL` is a placeholder.** `https://example.com/survey`
   is intentionally not a real destination. Swap before production deploy.
4. **ITEM 2 — `target="_blank"` + `rel="noopener noreferrer"` security.**
   This pattern is the standard security recommendation (MDN, OWASP) for
   cross-origin links opened in a new tab. Future maintainers should not
   remove the `rel` attributes when swapping the URL.
5. **ITEM 2 — Arabic label string used in test.** The Arabic test relies on
   the literal label string `'قيمة الطلب (دولار)'` for `waitFor`. If the
   Arabic copy for "Average order value" changes in the future, this test
   breaks and must be updated. Documented in the test comment.

---

## §7 — Process — stop-and-report gate (restated for batch-12)

The stop-and-report gate from batch-11 held for this batch:

1. **ITEM 1 — propose the fix, stop, wait for owner approval.** The blur
   fix was proposed in `docs/investigations/wheel-handler-passive-listener-
   report.md` and the side-effect audit was reported in
   `docs/investigations/blur-side-effect-audit-report.md` before any
   code change. The owner approved both items with two corrections
   (single jsdom test asserting blur only, no Playwright; −2 net math
   correction) before I touched the code.
2. **ITEM 2 — propose the change inline in the same conversation.** The
   owner approved ITEM 2 in the same message that approved ITEM 1.
3. **Both items shipped as a single batch.** Single commit + single
   push (after this report).

---

## §8 — Commit + push (planned)

After this report is committed, the batch-12 changes will be committed
and pushed.

---

## §9 — Commit details

(TBD — fill in after commit.)

---

## Appendix A — Raw runner output (verbatim)

### `npx vitest run`

```
$ npx vitest run
 RUN  v4.1.4 D:/proads-worktrees/funnel-economics-rebuild

(... all 85 tests pass ...)

 Test Files  6 passed (6)
      Tests  85 passed (85)
```

### `npx tsc -b`

```
$ npx tsc -b
(no output — clean)
```

### `node scripts/sc11Guard.mjs`

```
$ node scripts/sc11Guard.mjs
sc11-guard: 13 per-line suppression(s) applied across 1 file(s):
  src/components/FunnelSettingsForm.tsx:1361  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1370  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1457  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1466  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1477  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1486  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1496  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1497  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1517  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1518  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1526  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1528  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1545  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
sc11-guard: PASS — 85 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

### `cd functions && npm run test:phase14`

```
$ cd functions && npm run test:phase14
# tests 18
# fail 0
# tests 11
# fail 0
# tests 12
# fail 0
# tests 66
# fail 0
# tests 33
# fail 0
# tests 15
# fail 0
# tests 15
# fail 0
# tests 28
# fail 0
# tests 2
# fail 0
# tests 16
# fail 0
# tests 17
# fail 0
# tests 38
# fail 0
# tests 19
# fail 0
# tests 5
# fail 0
# tests 12
# fail 0
```

(Sum: 18+11+12+66+33+15+15+28+2+16+17+38+19+5+12 = 307. 0 fail.)

---

End of report.
