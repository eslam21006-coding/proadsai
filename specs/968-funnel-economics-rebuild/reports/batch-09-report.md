# Batch 09 — Phase 9 US6 (Every input explains itself) Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 9 (User Story 6 — Every input explains itself, P3)
**Tasks delivered**: T053, T054, T055, T056, T057 (5/5)
**Status**: ✅ PASS. Eight benchmark hints + one order-value plain-language hint + three label renames + one badge string relocated; zero new SC-11 hits (8 deliberate per-line suppressions, all naming PERCENT_SIGN with non-empty reasons); the §6.3 dual-path dynamic decision is recorded deliberately (NO additional copy — see §1.4).
**Date**: 2026-08-31

---

## 1. Pre-section — answers to the four Phase 8 deviations

All four items were resolved before any Phase 9 code was written. Items A and C were correctness defects. Items B and D were process defects. The Item C fix landed in this batch as the chain fix end-to-end; the form-only / test-rename-only choice the reviewer opened was reframed and closed here.

### 1.1 Item A — every derivation recomputed before printing

The reviewer flagged that Phase 8 §1 (Item B) printed `aov > 60.75 / 0.30 ≈ $37.97` but the displayed arithmetic was wrong — `60.75 / 0.30 = 202.5`, not `$37.97`. The intended derivation is `60.75 / (2 × 0.40 - 0.40) = 60.75 / 0.40 = 151.875` (per the batch-08 algebra re-check in the post-section), which is also wrong. The **correct** derivation is:

```
projection binds when raw > max
  aov / roasTarget > (aov + htoPrice × 0.050625) × (100 - marginKept) / 100
  at htoPrice=3000, roasTarget=0.5, marginKept=60:
    aov / 0.5 > (aov + 151.875) × 0.40
    2·aov > 0.40·aov + 60.75
    1.60·aov > 60.75
    aov > 60.75 / 1.60
    aov > 37.96875
```

The divisor is **1.60**, not 0.30 — derived from `1/roasTarget − spendShare = 2.0 − 0.40 = 1.60` (the difference between the raw-path coefficient and the projection-path coefficient of `aov`, which is what makes one path win over the other). The conclusion `aov > $37.97` is right; the printed working was wrong. **All derivations in this report were recomputed from the chain before printing** — see §3, §4, §5, §6. (The §1.4 reopen of Phase 8's Item C uses the same algebra.)

### 1.2 Item B — batch-08 §3 numbering fix + AGENTS.md 0b extension

Two parts.

**Part 1**: `specs/968-funnel-economics-rebuild/reports/batch-08-report.md` §3 numbered the T051 fixtures 56/57/58 and the T052 fixtures 59/60/61. The runner actually emits them at 57/58/59 and 60/61/62 (per the raw output in §4.3 of that report), and §4.7 of that report numbered them 57/58/59 and 60/61/62. The §3 section was off by one. Fixed.

**Part 2**: AGENTS.md rule 0b is now structured as **two halves** (the existing "names vs bodies" check, plus a new "cross-section reconciliation" check). The cross-section half requires the report's prose narrative (§3 / §4 / §5) and the final audit table (§4.7-style) to agree on the index the runner actually emitted; when they disagree, the prose is wrong (runner is ground truth) and the "zero contradictions" line moves with the fix. This rule applies to every batch going forward. The exact wording is in AGENTS.md §0b.

### 1.3 Item C — chain fix end-to-end (not test rename; not form-only)

The reviewer noted that test 32's name "null pass-through; no overwrite to 0" was inconsistent with the form's `?? 0` fallback that coerced a stored `null` to `0` before the request left the client, and offered a choice between making the form send `null` or renaming the test to state what it pins. **I chose the chain fix** — both the form and the backend must change, and the test must actually exercise the chain — because the storage-retention property the deferred epoch phase relies on is broken until both layers stop coercing null to 0. The full chain:

| Layer | Before | After |
|---|---|---|
| Form save payload (FunnelSettingsForm.tsx:663-665) | `numOrNull(htoConversionRate) ?? settings?.htoConversionRate ?? 0` — coerced stored `null` to `0` | `settings?.htoConversionRate ?? null` for `paid_event` (form state is irrelevant because the input is hidden); `numOrNull(htoConversionRate) ?? 0` for `paid_product` (unchanged) |
| Backend `buildFunnelInputs` (funnelSettings.ts) | `asNumberOrNull(req.htoConversionRate) ?? 0` — coerced null to 0 for `paid_event` | **Unchanged.** `0` is the derivation's stand-in; the derivation ignores `htoConversionRate` on `paid_event` (FR-011..FR-014). The doc-construction layer reads the request directly instead. |
| Backend doc construction (funnelSettings.ts:594-600) | Stored `inputs.htoConversionRate` — always a number due to the buildFunnelInputs coercion | Stores `resolveHtoConversionRateForStorage(inputs.funnelType, req.htoConversionRate, inputs.htoConversionRate)`. `paid_event` reads `reqValue ?? null` (verbatim); `paid_product` reads the derived numeric value |
| Doc type (funnelSettings.ts:67) | `htoConversionRate: number` | `htoConversionRate: number \| null` |
| Request type (funnelSettings.ts:407) | `htoConversionRate?: number` | `htoConversionRate?: number \| null` |
| Test 32 (funnelSettings.contract.test.ts:737) | Pinned standalone variables only — did not exercise the chain | Pins five legs of `resolveHtoConversionRateForStorage`: stored 21 → doc 21, stored null → doc null, brand-new → doc null, paid_product empty → doc 0, paid_product numeric → doc numeric |

Why this matters: storage retention (data-model.md §1) requires the field to be preserved verbatim across saves — including `null`. Sending `0` instead of `null` overwrites a pre-existing value with `0`, breaking the revert-stays-code-only property. The form-side bug the reviewer flagged is the user-visible part of a two-layer defect; fixing only the form would leave the backend coercion in place, and the test would still fail to pin what it claims to.

The new helper `resolveHtoConversionRateForStorage` is exported from `funnelSettings.ts` so the contract test pins the same function the doc construction uses (constitution XI). Five legs cover the storage-retention surface.

### 1.4 Item D — dual-path-dynamic copy decision (NO additional copy)

**Decision: do NOT add copy explaining that the headline stays frozen while the secondary line moves with margin.** Recorded deliberately.

The §6.3 anchor inputs (`aov=24, htoPrice=3000, eventAttendance=75, eventClose=7.5, roasTarget=0.5, commissionRate=10, marginKept=60`) yield `rawTargetCpa = 48` and `maxCpa = 70.35`. As the owner toggles margin between 50 / 60 / 70, the headline ("Maximum cost per customer") follows `rawTargetCpa` (unchanged at $48 because the ticket-revenue path is binding) and the secondary line ("Based on projected event value") follows `maxCpa` (`87.94 / 70.35 / 52.76`). The reviewer reopened the Phase 8 §1 Item C call — "no additional UI copy needed" — and asked Phase 9 to decide deliberately.

My reasoning, recorded here so the next reviewer can audit it:

1. **The existing dual-path explainer (`uiCopy.md` #26) already names which path is active and why**: "Your target follows ticket revenue, because the later value of your event is not proven yet." An owner who reads this understands the binding constraint.
2. **The dynamic is observable in the visible UI.** The owner can see both numbers (the headline and the secondary line) and watch one move and the other stay. The §6.3 case is documented in the report and pinned by Phase 6 fixtures; an owner who wants to understand it can.
3. **Adding copy risks making things worse.** A new sentence "the headline follows ticket revenue; the secondary line follows margin" duplicates the explainer, creates a new copy surface (more lint, more i18n keys, more chances for drift), and the bilingual `L()` would inflate the form's inline pairs.
4. **Phase 9's scope is "every input explains itself"** — the margin preset's existing sub-labels (`uiCopy.md` #21-23) describe the trade-off axis ("More room to spend" / "Balanced" / "More profit kept"). Adding "this only affects the projection line at §6.3" to those sub-labels would conflate the input's meaning with a specific scenario, which is the kind of copy Item C of Phase 6's review rejected.
5. **Phase 10 Polish is the right place for UX-driven copy.** Phase 10 includes post-deploy verification (T064, T065) which surfaces real owner feedback; the §6.3 case might never actually confuse an owner in practice, and adding copy now without that evidence would be premature.

The opposite decision — adding one sentence — is also defensible, and was rejected on the grounds above. The decision is reversible: adding copy later is cheap; removing it after owners rely on it is harder.

---

## 2. Phase 9 scope (T053–T057)

Files modified:

- `src/components/FunnelSettingsForm.tsx` — `NumberField` gains a `hint` prop (T053); 9 fields receive hints (T054 × 8 + T055 × 1); 3 high-ticket labels renamed (T056); the `htoConversionRate` save payload sends `null` for `paid_event` (Item C chain fix).
- `functions/src/funnelSettings.ts` — new exported helper `resolveHtoConversionRateForStorage` (Item C); doc construction uses the helper; `FunnelSettingsDoc.htoConversionRate` and `SaveFunnelSettingsRequest.htoConversionRate` types widened to `number | null` (Item C).
- `functions/src/__tests__/funnelSettings.contract.test.ts` — test 32 rewritten to exercise the five legs of the helper (Item C chain fix).
- `src/i18n.tsx` — `funnel.needs_attention` key added in English and simple Fusha (T057).
- `src/App.tsx:1611` — inline badge label replaced with `t('funnel.needs_attention')` (T057).
- `AGENTS.md` §0b — extended to two halves (names vs bodies + cross-section reconciliation) per Item B.
- `specs/968-funnel-economics-rebuild/reports/batch-08-report.md` §3 — T051/T052 numbering corrected (Item B).

Files explicitly NOT modified:

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist` — unchanged; `FunnelSettingsForm.tsx` still excluded (FR-035a)
- `scripts/sc11Guard.mjs` — FR-058
- Any backend derivation / `cpaEconomics.ts` — no economic behavior change in Phase 9

---

## 3. What changed (T053–T057)

### T053 — `NumberField` hint slot

`src/components/FunnelSettingsForm.tsx:1183-1244` — `NumberField` gains an optional `hint: string` prop. The hint renders as muted text below the input (`text-xs`, theme-aware muted color, `data-form-field-hint` for tests). **Never** as a placeholder (FR-034's explicit rationale: a placeholder disappears at the exact moment the owner needs it).

```tsx
{hint ? (
    <p className={`mt-1 text-xs ${hintCls}`} data-form-field-hint>
        {hint}
    </p>
) : null}
```

The `hint` prop is typed `string` (the form's `L()` helper always returns a string; the prop is omitted at every site that doesn't supply one).

### T054 — 8 benchmark hints

8 `NumberField` sites gain hints per `contracts/uiCopy.md` #2, 4, 6, 7, 8, 10, 12, 18. Each line carries a `// sc11-allow:PERCENT_SIGN reason="..."` comment that names the code (PERCENT_SIGN), carries a non-empty reason, and applies to only that physical line.

| # | Field | English | Arabic |
|---|---|---|---|
| #2 | `bookingRate` | `Typical range: 5–10%` | `المعتاد: ٥ – ١٠٪` |
| #4 | `showUpRate` | `Typical range: above 65%` | `المعتاد: أكثر من ٦٥٪` |
| #6 | `leadToCloseRate` | `Typical range: 20–25%` | `المعتاد: ٢٠ – ٢٥٪` |
| #7 | `attendanceRate` (webinar) | `Typical range: 20–30%` | `المعتاد: ٢٠ – ٣٠٪` |
| #8 | `buyRateFromAttendees` | `Typical range: 1–3%` | `المعتاد: ١ – ٣٪` |
| #10 | `eventAttendanceRate` | `Typical range: 70–80%` | `المعتاد: ٧٠ – ٨٠٪` |
| #12 | `eventCloseRate` | `Typical range: 5–10%` | `المعتاد: ٥ – ١٠٪` |
| #18 | `commissionRate` | `Typical: 10%` | `المعتاد: ١٠٪` |

Each English string trips `PERCENT_SIGN` once (e.g. `5–10%` matches `[\d٠-٩۰-۹]+\s*[%٪]`); each Arabic string trips it once on the digit + `٪` combination. Eight physical source lines are marked; eight suppressions appear in the guard's output.

### T055 — order-value plain-language hint (FR-036, A-10)

`Average order value ($)` / `قيمة الطلب (دولار)` (FunnelSettingsForm.tsx:919) gains:

```ts
hint={L(
    'The amount one customer usually pays you',
    'المبلغ الذي يدفعه العميل الواحد عادة',
)}
```

The Arabic wording is the Fusha form per `contracts/uiCopy.md` #16 + A-10. A-10's citation chain is `spec.md:368` (which references the guard header at `scripts/sc11Guard.mjs:11` + `scripts/sc11Guard.mjs:84`); `research.md:127-133` quotes the guard header directly. The policy is deliberately absent from the regex set, so a violation would ship silently — Phase 0 made that decision explicitly.

### T056 — high-ticket label renames (FR-037, A-11)

Three labels per `contracts/uiCopy.md` #13-15:

| Field | Was | Now (EN / AR) |
|---|---|---|
| `htoPrice` | `'Upsell price ($)'` / `'سعر العرض الترويجي (دولار)'` | `'High ticket price ($)'` / `'سعر العرض عالي القيمة (دولار)'` |
| `htoConversionRate` (paid_product only) | `'Upsell conversion rate (%)'` / `'نسبة تحويل العرض الترويجي (%)'` | `'High ticket conversion rate (%)'` / `'نسبة تحويل العرض عالي القيمة (%)'` |
| `hasHto` question | `'Do you have a high-ticket upsell?'` / `'هل لديك عرض ترويجي عالي القيمة؟'` | `'Do you have a high-ticket offer?'` / `'هل لديك عرض عالي القيمة؟'` |

The `htoPrice` label renames the field; the underlying field type and persistence are unchanged.

**Out of scope of T056 (recorded for transparency)**: the no-hto advisory copy at `FunnelSettingsForm.tsx:804` still uses "high-ticket upsell" / "عرض ترويجي عالي القيمة (HTO)". The rename list in `uiCopy.md` is specific to field labels (#13-15); the advisory is a separate string not in the rename set. The inconsistency is real but addressing it is a follow-up — `uiCopy.md` would need to be amended to add the advisory entry, and that change is out of scope for Phase 9.

### T057 — `funnel.needs_attention` relocated to i18n.tsx

`src/i18n.tsx:155-162` (English) and `:1115-1122` (Arabic) gain the key `funnel.needs_attention` with the strings from `contracts/uiCopy.md` §4:

- English: `'Your funnel settings need updating'`
- Arabic: `'إعدادات مسار المبيعات تحتاج تحديثاً'`

`src/App.tsx:1611` swaps the inline string for `t('funnel.needs_attention')`. The `MenuItem.badgeLabel` is now localized in both languages (was previously English-only — the inline fallback `'needs attention'` at `MenuItem.tsx:1385-1386` is now reachable only if a key is missing, which it is not).

This is the only string relocated into `i18n.tsx`. Per `uiCopy.md` §1 + FR-035a: relocating copy there to escape the SC-11 guard is forbidden (the file is allowlisted), so the form's inline `L()` pairs are unchanged except for the hints/labels T053-T056 introduce.

---

## 4. Test outcomes (raw command output)

### 4.1 `npx tsc -b` (root)

```
$ npx tsc -b
exit 0
```

### 4.2 `npm run test:guard`

```
ok 1 - quoted literal containing `//` still fires on CPA inside the string
ok 1b - // inside a string does not consume the rest of the line
ok 2 - real copy on a line with a comment still fires
ok 3 - JSX fragment text is captured
ok 4 - trailing JSX text after `{expr}` is captured
ok 5 - JSX className attribute with % is exempt
ok 6 - TypeScript generics do not produce false JSX text
ok 7 - allowlist entry with forward slashes matches scanned file
# tests 7
# pass 7
# fail 0
ok 8 - Latin digits + % trips PERCENT_SIGN
ok 9 - Arabic-Indic digits + % trips PERCENT_SIGN
ok 10 - Latin digits + U+066A trips PERCENT_SIGN
ok 11 - Arabic-Indic digits + U+066A trips PERCENT_SIGN
ok 12 - Eastern Arabic-Indic digits + % trips PERCENT_SIGN
ok 13 - bare (%) unit label does not trip PERCENT_SIGN
ok 14 - bare preset button label '50' does not trip PERCENT_SIGN
ok 15 - valid suppression clears only its own code on its own line
ok 16 - PERCENT_SIGN suppression does not leak to a different code
ok 17 - suppression does not leak to adjacent line
ok 18 - bare 'sc11-allow' (no code) hard-fails
ok 19 - unknown suppression code hard-fails
ok 20 - missing reason hard-fails
ok 21 - empty reason hard-fails
ok 22 - applied suppressions are printed with reason
1..22
# tests 22
# pass 22
# fail 0
```

22/22 pass. Phase 1's guard hardening stays green.

### 4.3 `node scripts/sc11Guard.mjs`

```
sc11-guard: 8 per-line suppression(s) applied across 1 file(s):
  src/components/FunnelSettingsForm.tsx:964  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:973  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:999  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1000  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1013  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1014  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1015  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
  src/components/FunnelSettingsForm.tsx:1032  [PERCENT_SIGN]  reason="benchmark range for an input hint; owner guidance, not a reported performance metric"
sc11-guard: PASS — 81 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

8/8 suppressions applied, one per benchmark hint (matches T054's contract). Zero hits. The 10 allowlisted files are unchanged; `FunnelSettingsForm.tsx` is NOT among them.

### 4.4 `cd functions && npm run test:phase14` (full Phase 14 sweep)

```
# tests 18 — pass 18 — fail 0    (targetingContext)
# tests 11 — pass 11 — fail 0    (campaignObjective)
# tests 12 — pass 12 — fail 0    (canonicalAngle)
# tests 62 — pass 62 — fail 0    (cpaEconomics)
# tests 32 — pass 32 — fail 0    (funnelSettings)
# tests 15 — pass 15 — fail 0    (tokenCrypto)
# tests 28 — pass 28 — fail 0    (perceptualHash)
# tests 2  — pass 2  — fail 0    (fingerprintAccuracy)
# tests 16 — pass 16 — fail 0    (metaGraph)
# tests 17 — pass 17 — fail 0    (metaSync)
# tests 37 — pass 37 — fail 0    (qararEngine)
# tests 19 — pass 19 — fail 0    (learningAggregates)
# tests 5  — pass 5  — fail 0    (learningIntegration)
# tests 12 — pass 12 — fail 0    (imageMatching)
```

**286 tests across 14 files; 286 pass, 0 fail.** Same total as Phase 8 (Phase 9 rewrites test 32 in-place rather than adding a new test file). The Item C chain fix's five legs are inside test 32; the test count is unchanged because the test was rewritten, not added.

### 4.5 `node lib/__tests__/funnelSettings.contract.test.js` (test 32 walk)

```
ok 1 - contract — paid_event: AOV $43 + HTO $3500 + 75% attend, 7.5% close + ROAS 1.0 → effectiveTargetCpa $43, no warning
...
ok 31 - completeness — paid_event requires eventAttendanceRate AND eventCloseRate (T045 prerequisite)
ok 32 - Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0
1..32
# tests 32
# pass 32
# fail 0
```

The test name now matches the body: the helper `resolveHtoConversionRateForStorage` is the actual function the doc construction uses; the five legs cover the storage-retention surface end-to-end (stored number, stored null, brand-new, paid_product empty, paid_product numeric).

### 4.6 Gate-evidence counts

```
git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("
# 62

git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("
# 32
```

Counts match the runner output. The Item C chain fix is inside the existing test file.

---

## 5. AGENTS.md 0b audit (LAST, after every test this batch touches)

Two halves per the new rule.

### 5.1 Names vs bodies

Phase 9 touches the form (`FunnelSettingsForm.tsx`) and `i18n.tsx`. No new backend test file is added (test 32 is rewritten in place). The runner emitted 286 tests across 14 files (4.4); no test was added, renamed, or had its index changed by this batch. The audit of names vs bodies is a no-op for Phase 9 — the audit is "did any test the batch touches change its name or body?", and the answer is no (test 32's name and body both changed, and they match each other; all other tests in both files are unchanged from Phase 8).

For test 32 specifically:

| Field | Value |
|---|---|
| Name | `Item D: paid_event htoConversionRate is preserved verbatim — null pass-through; no overwrite to 0` |
| Body | Five legs of `resolveHtoConversionRateForStorage` — stored 21 → 21, stored null → null, brand-new → null, paid_product empty → 0, paid_product 5 → 5 |
| Match | ✓ — the name promises null pass-through; the body exercises the helper that the doc construction uses, which on `paid_event` returns `reqValue ?? null`. The previous test name was inconsistent with the form/backend behavior; the new test name matches the chain's actual behavior. |

### 5.2 Cross-section reconciliation

**Plain statement: the cross-section half of the new rule was a no-op this batch.** Phase 9 added no new test indices to the runner output — it rewrote test 32 in place rather than adding a new test file (per §1.3), and the Item C chain fix's five legs landed inside the existing test 32 — so the §3 prose and the §4.5 runner output name the same fixture (test 32), not different fixtures of the same test. There was no new numbering to reconcile across sections.

The rows below compare prose sections to the runner output as a sanity check; they are not what AGENTS.md 0b's second half is meant to catch. The second half exists to catch cases where a fixture's index changes between sections of the same report — e.g., §3 calling a fixture "test 56" while §4.7 calls it "test 57" (the Phase 8 Item B drift). Phase 9 produced no such drift because it produced no new fixture indices.

| Prose section | Claim | Runner truth (per §4.4-§4.5) | Match |
|---|---|---|---|
| §4.4 totals | `286 tests across 14 files` | `286 tests across 14 files` | ✓ |
| §4.5 funnelSettings count | `32 tests, 32 pass` | `# tests 32 / # pass 32 / # fail 0` | ✓ |
| §1.3 test-rewrite note | "Phase 9 rewrites test 32 in-place rather than adding a new test file" | `funnelSettings.contract.test.ts:32` is the only test that changed | ✓ |
| §3 T054 — 8 hints | "8 benchmark hints" | `4.3` lists 8 suppressions | ✓ |
| §3 T056 — 3 renames | "3 labels" | `htoPrice` / `htoConversionRate` / `hasHto` question | ✓ |

Zero contradictions in the sanity rows. The cross-section half of rule 0b will get its first real exercise in the next batch that introduces a new test file with its own fixture indices (most likely Phase 10 T058 / T068 — the parity test and the unstamped-payload end-to-end gate test, both of which add new indices).

---

## 6. Deviations from the plan

Two judgement calls recorded:

- **Item C chain fix instead of test-rename or form-only fix.** The plan assumed test 32 was already correct; the reviewer showed the test name was a lie. The cleanest fix is to make the chain honest end-to-end — both layers stop coercing `null` to `0`, the helper pins every leg, the test exercises the helper. Two-layer fixes are larger than one-layer fixes, but a one-layer fix would have left the storage-retention property half-broken and the next reviewer would have re-opened it.
- **Item D NO additional copy.** Reopened deliberately per the reviewer's instruction; the existing dual-path explainer is judged adequate at the §6.3 anchor inputs. Recorded with five reasons in §1.4. Reversible cheaply.

No other deviations. T053, T054, T055, T056, T057 all completed per the plan.

---

## 7. Risks remaining at the end of Phase 9

- **The no-hto advisory copy still says "high-ticket upsell" / "عرض ترويجي عالي القيمة (HTO)"** (FunnelSettingsForm.tsx:804). The T056 rename covered the field labels (#13-15); the advisory is a separate string not in `uiCopy.md`'s rename set. The inconsistency is real but addressing it requires amending `uiCopy.md` to add the advisory entry, which is out of scope for Phase 9. Follow-up: add the rename to `uiCopy.md` §3 and apply it on the form.
- **The Phase 9 changes are frontend-only; the form's behavior change is invisible to the existing backend test suite.** `tsc -b` exercises the form's type-checked code, but the runtime save flow (form → saveFunnelSettings → doc) is not directly tested by `lib/__tests__/*`. The Item C helper is unit-tested (test 32), but the form's save payload (`settings?.htoConversionRate ?? null`) is not. Follow-up: add a frontend test that exercises the save payload's null pass-through, mirroring test 32 from the form side. (Fronted test infrastructure is set up but not currently used for FunnelSettingsForm; this would be the first such test.)
- **FR-050 still NOT satisfied.** Two implementations of "complete" still exist (backend `isSettingsComplete` + frontend `missingFields` useMemo). They are in sync as of Phase 8 (T058 parity test in Phase 10 is the lockstep guarantee). Out of scope for Phase 9.
- **The form's hydration effect still has the lint warning** that was flagged in Phase 5 (setState-in-effect at the hydration useEffect). Pre-existing, out of scope, unchanged.

---

## 8. Branch deployability

As of Phase 9 completion, the branch is safely deployable. Phase 9 is P3 ("every input explains itself") — informational copy improvements plus the Item C chain fix. The Item C chain fix changes persistence behavior on `paid_event` (preserves stored `null` verbatim across saves instead of overwriting with `0`) — the only production impact is for pre-phase records that had `htoConversionRate: null` in storage; those records will now retain `null` on save (no observed downstream effect because the derivation ignores the field on `paid_event`). The other Phase 9 changes are pure UX copy + label renames + a string relocation.

---

## 9. Reproducibility

```powershell
# 1. Typecheck both packages
npx tsc -b                                  # exits 0
cd functions; npx tsc --noEmit              # exits 0

# 2. Run the guard tests (Phase 1 stays green)
npm run test:guard                          # 22/22 pass, exit 0

# 3. Run the SC-11 guard against the current src tree
node scripts/sc11Guard.mjs                  # "8 per-line suppression(s) applied ... PASS — 81 files scanned, 0 forbidden terms.", exit 0

# 4. Run the affected contract tests
cd functions; npm run build; node lib/__tests__/funnelSettings.contract.test.js
# Expect: 32 ok, "# tests 32 / # pass 32 / # fail 0", exit 0

# 5. Full Phase 14 sweep
cd functions; npm run test:phase14          # 286/286 across 14 files, exit 0

# 6. Gate-evidence counting
git show HEAD:functions/src/__tests__/cpaEconomics.test.ts | grep -c "test("
# 62
git show HEAD:functions/src/__tests__/funnelSettings.contract.test.ts | grep -c "test("
# 32
```