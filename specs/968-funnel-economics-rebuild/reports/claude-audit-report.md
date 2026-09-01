# Pre-Merge Audit — 968 Funnel Economics Rebuild

**Auditor:** Claude (independent pre-merge audit)
**Date:** 2026-08-31
**Branch:** `968-funnel-economics-rebuild` @ `87fa4b3`
**Base:** `main`
**Diff:** 39 files, +11,200 / −311

**Audit snapshot refreshed 2026-09-01 against `6473958`** — the round-15 commit that
resolved Item 6. Every §-level finding below was taken at `87fa4b3`; where the tree
has since moved, the section carries a **RESOLVED** note naming the fixing commit.
Item 6 is the only such section.

**Verdict (as of `6473958`): 15 PASS · 1 PASS-WITH-EXCEPTIONS · 1 FAIL (non-blocking, Item 17).**
*(Verdict at `87fa4b3`, when the audit was taken: 14 PASS · 1 FAIL · 1 PASS-WITH-EXCEPTIONS.)*
Item 6 (Arabic copy) is fixed in `6473958`; two non-blocking findings remain (Item 16, Item 17).
Nothing in the economics, the version gate, the completeness rule, or the guard is wrong.

| # | Item | Result |
|---|---|---|
| 1 | Formulas | **PASS** |
| 2 | Economics version gate | **PASS** |
| 3 | Completeness rule | **PASS** |
| 4 | Completeness badge | **PASS** |
| 5 | SC-11 guard | **PASS** |
| 6 | Arabic copy | **RESOLVED in `6473958`** (FAIL at `87fa4b3`) |
| 7 | No epoch fragments | **PASS** |
| 8 | Paid-event ROAS default | **PASS** |
| 9 | `htoConversionRate` retention | **PASS** |
| 10 | Margin selector | **PASS** |
| 11 | Low-value advisory | **PASS** |
| 12 | Benchmark helper text | **PASS** |
| 13 | Test registration | **PASS** (report §4 counts stale) |
| 14 | Parity test | **PASS** (FR-050 deviation confirmed) |
| 15 | `metaSync/shared.ts` bound | **PASS** (log present, bounded) |
| 16 | Files not modified | **PASS with exceptions** |
| 17 | *(additional finding)* new lint errors | **FAIL — non-blocking** |

---

## 1. FORMULAS — PASS

`functions/src/cpaEconomics.ts` read end to end (485 lines). Every formula matches
investigation report §5.

| Quantity | Report §5 | Code | Line |
|---|---|---|---|
| `spendShare` | `(100 − marginKept)/100` | identical | `cpaEconomics.ts:200-202` |
| `netFactor` | `(100 − commissionRate)/100` | identical | `cpaEconomics.ts:205-207` |
| lead_magnet_call `leadValue` | `price × nf × booking × showUp × close` | identical | `cpaEconomics.ts:310-315` |
| free_webinar `leadValue` | `price × nf × attendance × buyRate` | identical | `cpaEconomics.ts:285-289` |
| free `targetCpl` | `leadValue × spendShare` | identical | `cpaEconomics.ts:290`, `:316` |
| paid `rawTargetCpa` | `aov / roasTarget` | identical | `cpaEconomics.ts:240` |
| paid_event `fullBuyerValue` | `aov + hto × nf × attend × close` | identical | `cpaEconomics.ts:243-250` |
| paid_product `fullBuyerValue` | `aov + hto × nf × htoConvRate` (OQ-1 override) | identical | `cpaEconomics.ts:251-258` |
| `ceilingCpa` | `fullBuyerValue × spendShare` | identical | `cpaEconomics.ts:260` |
| `effectiveTarget` | `min(raw, ceiling)` | identical | `cpaEconomics.ts:261` |

**Commission scoping (FR-003, FR-017, FR-019).** `nf` multiplies the `htoPrice`
term only, in both paid branches. `aov` is never multiplied by `nf` — verified by
reading both branches; `aov` appears as a bare addend on `:246` and `:254`. The
free branches apply `nf` to `offerPrice`, which is correct: that revenue is
call-closed by definition.

**Discriminating fixture — executed against the compiled module, not read from a
test file:**

```
$ node -e "require('./lib/cpaEconomics.js').deriveTargetCpa({funnelType:'paid_product',
    aov:100, hasHto:true, htoPrice:3000, htoConversionRate:5,
    commissionRate:10, marginKept:60, roasTarget:1.0})"

fullBuyerValue = 235
```

235.00 — not 211.50 (commission wrongly applied to `aov`) and not 250.00 (no
commission). **Correct.**

**Worked examples reproduced independently:**

```
SC-001 lead_magnet ($3,000, 7.5/70/22.5, comm 10, margin 60) = 12.76   leadValue 31.89
  margin 50 -> 15.95    margin 60 -> 12.76    margin 70 -> 9.57
SC-002 free_webinar ($3,000, 25/2, comm 10, margin 60)       = 5.40
SC-003 paid_event  ($24 / $3,000, 75/7.5, roas 0.5)
       rawTargetCpa 48.00  fullBuyerValue 175.88  maxCpa 70.35  effective 48.00
```

The 50%-margin row is **$15.95**, not the report's $15.94 — the rounding-order
artefact the brief flagged, and the value the code produces under FR-048
(round once at end of chain). Spec A-2 records this and the fixture pins 15.95.
`deriveTargetCpa` computes the whole chain unrounded and applies `round2` once
per output field (`:265-268`), so FR-048 holds.

**Minor, non-blocking:** the doc comment on `:25` and `:226` cites *FR-003* for
the `capApplied` strict-inequality rule; FR-003 is the commission-scoping
requirement. Comment-only mislabel, no behavioural effect.

---

## 2. ECONOMICS VERSION GATE — PASS

`getEffectiveTarget` (`cpaEconomics.ts:400-406`) opens with the gate:

```ts
if (derived.economicsVersion !== ECONOMICS_VERSION) return null;   // :402
```

An absent stamp is `undefined !== 2` → `null`. Verified by execution:

```
getEffectiveTarget({paid:{effectiveTargetCpa:50}})                     -> null
getEffectiveTarget({economicsVersion:2, paid:{effectiveTargetCpa:50}}) -> 50
```

**Chain traced end to end:**

1. `metaSync/shared.ts:601-606` reads `settings/current` and wraps `data.derived`
   into `funnelSettings` verbatim — no stamping, no repair, no recomputation.
2. `metaSync/shared.ts:906` passes it to `evaluateVerdict`.
3. `qararEngine.ts:224` — `if (!settings || getEffectiveTarget(settings.derived) === null)`
   returns `{ verdict: "⏳", ruleCode: "data_gate", reasonAr: REASON_DATA_GATE_FUNNEL_MISSING }`
   (`qararEngine.ts:130` = «إعدادات مسار المبيعات غير مكتملة»). This is the pre-existing
   gate and the pre-existing reason string — A-4 honoured, no new gate added.
4. `learningAggregates.ts:220-221` / `:369-370` increment `conversionBestCount`
   only on `🟢` and `conversionWorstCount` only on `🔴`. A `⏳` increments neither.
   **No pass/fail count is written.**

`ECONOMICS_VERSION = 2` is declared at `cpaEconomics.ts:87` with the FR-041a
bump obligation recorded inline at `:84-86` and `:54-59`, as FR-041a requires.
`deriveAll` (`:329-355`) stamps every one of its four return paths, and
`saveFunnelSettings` persists exactly that object (`funnelSettings.ts:625`,
`doc.derived = derived`). **Every new save is stamped.**

End-to-end coverage exists: `qararEngine.test.ts` — *"end-to-end gate — unstamped
derived payload (pre-phase shape) flows through evaluateVerdict to ⏳ with
incomplete-settings reason, no pass/fail verdict (FR-041, FR-042)"*.

> **Observation, not a defect.** SC-010 claims *"zero change to any learning
> aggregate."* A `⏳` ad still reaches `learnedAds` (`metaSync/shared.ts:983`) and
> still contributes to `conversionCount` and `conversionLinkCtrSum`
> (`learningAggregates.ts:219-220`). Only the **verdict counts** are protected —
> which is exactly what FR-042 (the normative requirement) says, and exactly what
> investigation §8 argues is correct, since CTR and CPM are target-independent
> signals. This phase changes no aggregate write (FR-046), so the behaviour is
> pre-existing. SC-010's wording overstates FR-042; the code matches FR-042.

---

## 3. COMPLETENESS RULE — PASS

`missingRequiredFields` (`funnelSettings.ts:362`) delegates to
`requiredFieldsForDoc` (`funnelSettings.ts:331-350`):

| Funnel type | Required set | Line |
|---|---|---|
| `lead_magnet_call` | `offerPrice`, **`leadToCloseRate`**, **`bookingRate`**, **`showUpRate`**, `commissionRate`, `marginKept` | `:349` |
| `free_webinar` | `offerPrice`, **`attendanceRate`**, **`buyRateFromAttendees`**, `commissionRate`, `marginKept` | `:347` |
| `paid_event` | `aov`, [`htoPrice`], **`eventAttendanceRate`**, **`eventCloseRate`**, `commissionRate`, `marginKept` | `:339-341` |
| `paid_product` | `aov`, `roasTarget`, [`htoPrice`, `htoConversionRate`], `commissionRate`, `marginKept` | `:344-345` |

**`htoConversionRate` is NOT in the `paid_event` set** (`:339-341`) — the
stored-and-unread field. Rationale recorded at `:333-335` and
`:222-231` (Item A, batch-05). Correct per FR-011..FR-014: requiring a field the
corrected formula never reads would keep the attention badge lit forever on an
otherwise-complete record.

`0` is complete, `null`/`undefined` is not (`:385-388`) — matches FR-039 and the
Edge Cases table ("commission or any rate set to 0: accepted").

**Save rejection (FR-040a).** `saveFunnelSettings` calls the *same* predicate on
the request payload before any coercion (`funnelSettings.ts:590-608`) and throws
on a non-empty list (`:609`), naming **every** missing field, inside the
try/catch that converts it to `HttpsError("invalid-argument", …)` (`:617-620`).
Because the check runs before `buildFunnelInputs`, the `?? 0` coercion cannot
swallow a missing field. **Confirmed.**

One deliberate asymmetry: `roasTarget` is *not* required for `paid_event`
(`:335-338`) because the save supplies `DEFAULT_PAID_EVENT_ROAS_TARGET`; it *is*
required for `paid_product`. Documented in place, consistent with FR-016/FR-021.

---

## 4. COMPLETENESS BADGE — PASS

**Probe returns the flag.** `getFunnelSettings` returns
`{ ok, settings, complete, reviewDue }` on both branches:
`funnelSettings.ts:771` (no record → `complete: false`) and
`funnelSettings.ts:784-790` (`complete = isSettingsComplete(doc)`, returned
alongside a non-null `settings` — FR-043 satisfied: an incomplete record is
returned as existing, never as absent).

**Frontend reads it.** `App.tsx:4344-4348` widens the response type;
`App.tsx:4369` — `setFunnelSettingsComplete(data?.complete !== false)`. The
inversion is deliberate: `true`/`undefined` → silent (rollout-safe against a
not-yet-redeployed backend), explicit `false` → badge.

**Badge renders on `complete === false`.** `App.tsx:1619` —
`badge={!funnelSettingsComplete}`, rendered at `App.tsx:1383-1390` as a passive
2×2 amber dot with `aria-label`. `onClick` is unchanged (`App.tsx:1618`), so
activating the entry does exactly what it did before. FR-051 satisfied.

### FR-053 — the flag must not reach the auto-open gate or the review prompt

> **FR-053**: *"The completeness signal MUST NOT be wired into the first-run
> auto-open behaviour or the monthly-review prompt. Those two continue to key off
> record existence and review cadence exactly as they do today. Auto-opening the
> form because a record is incomplete would convert a passive signal into a push
> and violate FR-044."*

**Confirmed by exhaustive reference check.** Every occurrence of
`funnelSettingsComplete` in `src/App.tsx`:

```
1139, 1183, 1249, 1441, 1473, 1619   — prop plumbing + badge render
3824                                  — useState declaration
4369, 4380                            — probe success / probe catch
11583, 11707                          — two MenuSidebar call sites
12899                                 — onSaved(saved) => setFunnelSettingsComplete(true)
```

- **Auto-open gate** (`App.tsx:4446-4457`): the condition is
  `metaConnection?.connected && activeWorkspaceId && activeMetaAccountId &&
  funnelSettingsHasDoc === false && !showFunnelSettingsModal &&
  !funnelFirstRunDismissed`. It keys off **existence** (`funnelSettingsHasDoc`)
  only. `funnelSettingsComplete` appears in neither the condition nor the
  dependency array (`:4457`).
- **Review prompt**: rendered inside the form at
  `FunnelSettingsForm.tsx:1304` from the backend's `reviewDue` boolean
  (`:334`, `:368`). `funnelSettingsComplete` does not exist in that file — it is
  App-shell state and is never passed down.

**No code path connects them. PASS.**

---

## 5. SC-11 GUARD — PASS

**Pattern (FR-054).** `scripts/sc11Guard.mjs:94`:

```js
{ code: "PERCENT_SIGN", label: "percentage sign in user copy", re: /[\d٠-٩۰-۹]+\s*[%٪]|percent/gi }
```

Byte-for-byte the required pattern. Covers Latin `\d`, Arabic-Indic
`٠-٩` (U+0660–0669), Eastern Arabic-Indic `۰-۹` (U+06F0–06F9), both `%`
(U+0025) and `٪` (U+066A), and the English word via the `|percent` alternation
with `i`.

**Suppression (FR-055/FR-056).** `parseSuppressions` (`sc11Guard.mjs:121-155`)
hard-fails on a bare marker (`:134`), an unknown code (`:141`), and a missing or
empty reason (`:150`). Application is line-and-code exact
(`:536-539`): `const sup = supMap.get(line); const suppressed = sup && sup.code === p.code;`
— no file-level or directory-level form, and no leakage to adjacent lines.
FR-057 printing at `:546-557`.

**Allowlist (FR-035a/FR-056).** `FunnelSettingsForm.tsx` is **not** in
`scripts/.sc11-allowlist`. The only match in that file is the word inside a
comment on line 9. `git log main..HEAD -- scripts/.sc11-allowlist` returns
nothing — the file was never touched on this branch.

**Guard run (mine, this audit):**

```
$ node scripts/sc11Guard.mjs
sc11-guard: 8 per-line suppression(s) applied across 1 file(s):
  src/components/FunnelSettingsForm.tsx:1089  [PERCENT_SIGN]  reason="benchmark range for an input hint; …"
  src/components/FunnelSettingsForm.tsx:1098  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1124  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1125  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1138  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1139  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1140  [PERCENT_SIGN]  reason="…"
  src/components/FunnelSettingsForm.tsx:1157  [PERCENT_SIGN]  reason="…"
sc11-guard: PASS — 84 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
```

**Exactly 8, all `PERCENT_SIGN`, all on `FunnelSettingsForm.tsx` benchmark hints,
all with a non-empty reason. PASS.**

Guard self-tests: `node scripts/sc11Guard.test.mjs` → **22/22 pass**, each named
in raw output (`ok 8 … ok 22`), including the four negative controls FR-035c
demands (`ok 13` bare `(%)` label, `ok 14` bare `50` button, `ok 18`–`ok 21`
malformed suppressions hard-fail). FR-060 satisfied.

> Nit, non-blocking: `sc11Guard.mjs:512-517` counts every *declared* suppression
> as "applied", including one that suppressed nothing. FR-057's intent (keep
> exceptions visible) is met; the label is a slight overstatement.

---

## 6. ARABIC COPY — **RESOLVED in `6473958`** (FAIL at `87fa4b3`)

> **Status.** The defect described below was real at `87fa4b3` and is **fixed** by
> commit `6473958` ("round-15 — replace projection-active explainer (Item 6)").
> `FunnelSettingsForm.tsx` no longer contains «الـ back-end» in any user-facing
> string — the only remaining `back-end` occurrences in that file are two
> explanatory code comments (`:1241`, `:1244`) recording why the wording was
> replaced. The corrected pair is pinned as **row 26a** in
> `contracts/uiCopy.md:137`, with the mutual-exclusivity note at `:139`. The
> record below is kept for the durable audit trail; it does **not** describe the
> current tree.

Every `L()` pair added or modified on this branch was enumerated from the diff,
plus both new `i18n.tsx` keys.

**Dialect scan — clean.** No occurrence of `عايز`, `عاوز`, `ده`, `دي`, `دول`,
`مش`, `إزاي`, `علشان`, `عشان`, `بتاع`, `كده`, `كويس`, `دلوقتي`, `شوية`, `أوي`
in any added Arabic string. SC-011 holds on dialect.

**«متوسط» — clean.** Zero occurrences in `src/**` outside a single explanatory
comment (`FunnelSettingsForm.tsx:1037`). The order-value hint correctly uses the
A-10 substitute «المبلغ الذي يدفعه العميل الواحد عادة», not the report §9
wording. The label «قيمة الطلب» is used unchanged. **Correct.**

**Acronyms — clean.** No `HTO`, `CPA`, `CPL`, or `CPM` in any user-facing string,
Arabic or English. `getCostMetric`'s `"CPA"`/`"CPL"` returns are server-side only
(`cpaEconomics.ts:413`) and never rendered.

### The defect (as found at `87fa4b3` — fixed in `6473958`)

At `87fa4b3`, `src/components/FunnelSettingsForm.tsx:1239` — the paid-event
projection-path-active explainer:

```
'هدفك محسوب على القيمة المتوقعة للفعالية، لأن اقتصاديات الـ back-end (نسبة الحضور × نسبة الإغلاق) هي القيد الفعّال.'
```

**«الـ back-end» is untranslated Latin-script English jargon embedded in
user-facing Arabic copy**, carrying an Arabic definite article prefix. This
violates FR-038 ("simple Fusha Arabic… where that table supplies one") and the
Arabic-first product standard. A non-technical Arabic-speaking business owner —
the exact persona the phase's §9 Arabic table and SC-012 were written for —
cannot read it.

**Root cause.** `contracts/uiCopy.md:130-137` pins strings 24, 25, and 26 (the
*ticket-revenue-active* explainer) but does not pin the *projection-active*
variant, saying only *"When the projection path wins, name that one instead."*
The unpinned string was authored ad hoc in batch 07 (`batch-07-report.md:367`)
and never passed through the §9 wording table. The SC-11 guard has no pattern for
Latin-script jargon inside Arabic strings, so nothing caught it.

**Reachability.** Live, not dead. It renders whenever
`paidDerived.capApplied === true` on a `paid_event`
(`FunnelSettingsForm.tsx:1236-1244`) — i.e. when the projection ceiling is the
binding one. `batch-08-report.md:30` establishes this fires for any back-end
under ≈$1,900 at the §6.3 inputs, contradicting the earlier claim that it was
"unreachable in production."

**Also worth fixing in the same edit:** the English counterpart
(`:1238`) leans on the same jargon — *"your back-end economics (event attendance
× high-ticket close)"* — while string 26 beside it uses the plain
*"the later value of your event."* The pair is internally inconsistent.

**Suggested wording**, matching the register of the already-approved string 26:

| | Then-current (`87fa4b3`) | Suggested |
|---|---|---|
| EN | …because your back-end economics (event attendance × high-ticket close) are now the binding constraint. | …because the later value of your event is now the lower of the two. |
| AR | …لأن اقتصاديات الـ back-end (نسبة الحضور × نسبة الإغلاق) هي القيد الفعّال. | …لأن قيمة العرض التالي في فعاليتك أصبحت هي الأقل بين الرقمين. |

**What actually landed in `6473958`** (pinned as row 26a in `contracts/uiCopy.md:137`):

| | Shipped |
|---|---|
| EN | Your target follows the later value of your event, because it is now the lower of the two. |
| AR | هدفك محسوب على قيمة العرض التالي في فعاليتك، لأنها أصبحت الأقل بين الرقمين. |

**Did it block merge?** It was a **one-line copy fix in a user-facing string, with
no logic, schema, or test impact.** It did not endanger data, learning, or the
corrected math. The recommendation was **fix before merge** — cheap, and precisely
the class of defect (untranslated jargon reaching an Arabic-first owner) that the
phase's own SC-011/SC-016 review gate exists to catch. **That fix has landed**, and
the corrected pair is pinned as row 26a in `contracts/uiCopy.md` so the variant
cannot drift again.

---

## 7. NO EPOCH FRAGMENTS — PASS

```
$ grep -rn "businessEpoch\|verdictEpoch" --include=*.ts --include=*.tsx --include=*.mjs --include=*.json .
(no matches, repo-wide)

$ grep -rn "learning/" --include=*.ts functions/src
functions/src/__tests__/campaignObjective.test.ts:68   (a comment, pre-existing, unrelated)
```

No `businessEpoch`, no `verdictEpoch`, no `learning/{epoch}/…` aggregate path
anywhere in the repository. Aggregate paths remain
`adAccountRef.collection("hookPerformance"|"visualPerformance")`
(`metaSync/shared.ts:1058-1059`, `:1071`) — unchanged from `main`.

Every `epoch` occurrence in the diff's **code** files is a prohibitive boundary
note or an unrelated timestamp:

| File:line | Text | Kind |
|---|---|---|
| `cpaEconomics.ts:50` | *"This is a schema discriminator, **NOT** a business epoch"* | prohibitive |
| `cpaEconomics.ts:327` | *"`computedAt` (epoch ms)"* | Unix-time, unrelated |
| `funnelSettings.ts:412` | *"the **deferred** epoch phase will touch the same document again"* | boundary |
| `funnelSettings.contract.test.ts:789` | same boundary note | boundary |
| `FunnelSettingsForm.tsx:757` | same boundary note | boundary |
| `funnelSettingsSavePayload.ts:18` | same boundary note | boundary |

`economicsVersion` is correctly documented as a payload-shape discriminator
(`cpaEconomics.ts:48-59`), is never read by learning code, and appears in no
aggregate path. **PASS.**

---

## 8. PAID EVENT ROAS DEFAULT — PASS

**Form preselects 0.5 (FR-016).** `FunnelSettingsForm.tsx:585` initialises
`funnelType` to `'paid_event'` and `:593` initialises `roasTarget` to `0.5` — the
pair is consistent on first render. On a funnel-type change, `:986`:

```ts
setRoasTarget(newType === 'paid_event' ? 0.5 : 1.0);
```

`paid_product` therefore returns to the unchanged break-even default of 1.0
(FR-021). `ROAS_OPTIONS` (`:481-485`) still offers exactly the three values
1.0 / 0.65 / 0.5 (A-5 — set unchanged).

**Backend constant is 0.5.** `cpaEconomics.ts:105` —
`export const DEFAULT_PAID_EVENT_ROAS_TARGET = 0.5;`. Applied at
`funnelSettings.ts:486`, routed through `asRoas()` so the closed-enum invariant
holds even against an arbitrary client value.

### The backend default is unreachable from the form — stated plainly

`FunnelSettingsForm.tsx:768` puts `roasTarget` in the save payload
**unconditionally**, and the state is typed `RoasTarget` with a non-null initial
value (`:593`), so it can never be `undefined` on the wire. The
`req.roasTarget ?? DEFAULT_PAID_EVENT_ROAS_TARGET` fallback at
`funnelSettings.ts:486` is therefore **dead from the form's perspective**. It is
reachable only by a direct callable invocation that omits the field.

This is defence-in-depth, not a defect — `saveFunnelSettings` is a public
callable and must hold its own invariants — but the honest statement is: **the
form's 0.5 preselect is what users actually get; the backend constant never fires
in the product's own UI flow.** Both are 0.5, so the two agree either way.
**PASS.**

---

## 9. `htoConversionRate` RETENTION — PASS

**Form sends the stored value or `null`, never `0`.**
`src/utils/funnelSettingsSavePayload.ts:44-51`:

```ts
if (funnelType === 'paid_event') {
    return settingsValue ?? null;   // `?? 0` is INTENTIONALLY absent
}
```

Called from `FunnelSettingsForm.tsx:763-767` with `settings?.htoConversionRate`
— the hydrated stored value. A stored number passes through, a stored `null`
stays `null`, an absent record yields `null`. The `paid_event` input is not
rendered at all (`:1069-1071` gates it to `paid_product`), so form state can never
contaminate the value.

**Backend preserves it verbatim.** `resolveHtoConversionRateForStorage`
(`funnelSettings.ts:432-443`):

```ts
if (funnelType === "paid_event") {
    return reqValue ?? null;        // verbatim; null stays null
}
return derived;                     // paid_product uses the coerced number
```

Called at `funnelSettings.ts:657-661` with `req.htoConversionRate` — the **raw
request value**, deliberately not `inputs.htoConversionRate` (which
`buildFunnelInputs:461` coerces `null → 0` for the derivation's benefit). The
distinction is the whole point, and it is correct: the derivation gets a safe `0`
(which `paid_event` never reads anyway), storage gets the original `null`.

The `SaveFunnelSettingsRequest` type admits `number | null` on the field
(`funnelSettings.ts:533`), so `null` survives the wire without being typed away.

**Revert is code-only.** No write on this branch clears, deletes, or overwrites
`htoConversionRate` on a `paid_event` document. The field stays live and required
for `paid_product`. A `git revert` of this phase restores the pre-968 readers,
which find the value exactly where they left it. **No data restoration step
required. PASS.**

---

## 10. MARGIN SELECTOR — PASS

**Three-button preset, not free entry.** `MARGIN_OPTIONS`
(`FunnelSettingsForm.tsx:493-517`) is a closed three-element array — 50, 60, 70 —
rendered at `:1164-1198` as `<button type="button" onClick={() => setMarginKept(opt.value)}>`.
There is **no `<input>` in the margin block**; the only state mutator is
`setMarginKept(opt.value)` from a button. FR-025 satisfied — free entry is not
merely discouraged, it is structurally impossible.

**60 preselected.** `FunnelSettingsForm.tsx:613` —
`useState<50 | 60 | 70>(60)`. On hydration, `:696` falls back to `60` when the
stored value is null. Backend `DEFAULT_MARGIN_KEPT = 60` (`cpaEconomics.ts:96`).

**Matches the `ROAS_OPTIONS` visual pattern.** Compare `:1105-1116` (ROAS) with
`:1164-1198` (margin): identical `<div className="space-y-2">` wrapper, identical
`block w-full text-right p-3 rounded border` button classes, identical
selected-state `border-indigo-500 bg-indigo-900/40`, identical bold-label +
muted-sub-line structure. FR-025 satisfied.

**FR-025a — bare numbers.** Labels are `'٥٠ — مساحة أكبر للإنفاق'` (Arabic) and
`String(opt.value) + ' — ' + opt.subEn` → `"50 — Spend more, keep less"`
(English). No digit is ever paired with `%` or `٪`; the unit sits on the group
label `L('Margin you want to keep (%)', 'نسبة الربح التي تريد الاحتفاظ بها (%)')`
(`:1160-1162`) as a bare unit marker. Guard confirms: no suppression was needed
here, and guard test `ok 14 — bare preset button label '50' does not trip
PERCENT_SIGN` proves the negative control.

**Value validated server-side.** `assertMarginKept` (`cpaEconomics.ts:441-447`)
rejects anything outside `[50, 60, 70]` — FR-026.

---

## 11. LOW-VALUE ADVISORY — PASS

`computeAdvisories` (`cpaEconomics.ts:375-387`):

```ts
let roundedTarget: number | null = null;
if (derived.paid)      roundedTarget = round2(derived.paid.effectiveTargetCpa);
else if (derived.free) roundedTarget = round2(derived.free.effectiveTargetCpl);
const lowValue = roundedTarget !== null && roundedTarget < LOW_VALUE_TARGET_THRESHOLD;
```

**Fires on the rounded displayed target.** The inputs are already `round2`'d by
the derive functions (`:268`, `:294`, `:320`) — the same values the results card
renders via `.toFixed(2)` (`FunnelSettingsForm.tsx:1228`, `:1268`). `round2`
here is idempotent reinforcement. The advisory therefore can never contradict the
figure on screen. FR-028 satisfied.

**Strictly less than 0.50.** `<`, not `<=`, against
`LOW_VALUE_TARGET_THRESHOLD = 0.50` (`cpaEconomics.ts:92`). Verified by execution:

```
lowValue @0.36  -> true
lowValue @0.50  -> false      ← exactly $0.50 does NOT warn
lowValue @0.90  -> false
lowValue @0.4999 raw -> false ← round2(0.4999) = 0.50, so no warning (FR-028a)
```

The 0.4999 boundary fixture FR-028a mandates is present in
`cpaEconomics.test.ts` and reproduces here.

**Non-blocking (FR-030).** `computeAdvisories` returns booleans and throws
nothing on `lowValue`. In `saveFunnelSettings` the result is written to the doc
(`funnelSettings.ts:626`) and returned to the caller (`:716`) — no branch inspects
`advisories.lowValue` before `tx.set`. It plays no part in
`missingRequiredFields` and therefore cannot affect completeness or the badge.
The target is computed and the save succeeds regardless.

**FR-029 satisfied**: no price or `aov` reference remains in the advisory path.
The old `LOW_VALUE_THRESHOLD = 9` price trigger is gone; `cpaEconomics.ts:36-43`
records the replacement. **FR-031**: `noHto` keeps its original trigger
(`:376-378`) and wording — unchanged.

---

## 12. BENCHMARK HELPER TEXT — PASS

**Rendering (FR-034).** `NumberField` (`FunnelSettingsForm.tsx:1390-1397`):

```tsx
{hint ? (
    <p className={`mt-1 text-xs ${hintCls}`} data-form-field-hint>{hint}</p>
) : null}
```

A `<p>` **after** the `<input>` (`:1381-1388`), in the muted tone
(`text-slate-400` dark / `text-slate-500` light, `:1364`) already used elsewhere
in the form. `grep -n "placeholder" src/components/FunnelSettingsForm.tsx` returns
only two comment lines (`:1348-1349`) explaining why a placeholder was rejected —
**the `placeholder` attribute appears nowhere in the file.** The hint survives
typing, which is FR-034's entire rationale.

**All 8 values verified against investigation §4:**

| # | Field | Line | English | Arabic | §4 |
|---|---|---|---|---|---|
| 1 | Booking rate | `:1138` | Typical range: 5–10% | المعتاد: ٥ – ١٠٪ | 5–10% ✓ |
| 2 | Show-up rate | `:1139` | Typical range: above 65% | المعتاد: أكثر من ٦٥٪ | above 65% ✓ |
| 3 | Close rate on calls | `:1140` | Typical range: 20–25% | المعتاد: ٢٠ – ٢٥٪ | 20–25% ✓ |
| 4 | Webinar attendance | `:1124` | Typical range: 20–30% | المعتاد: ٢٠ – ٣٠٪ | 20–30% ✓ |
| 5 | Webinar purchase | `:1125` | Typical range: 1–3% | المعتاد: ١ – ٣٪ | 1–3% ✓ |
| 6 | Event attendance | `:1089` | Typical range: 70–80% | المعتاد: ٧٠ – ٨٠٪ | 70–80% ✓ |
| 7 | Event close | `:1098` | Typical range: 5–10% | المعتاد: ٥ – ١٠٪ | 5–10% ✓ |
| 8 | Sales commission | `:1157` | Typical: 10% | المعتاد: ١٠٪ | 10% ✓ |

**8 of 8 match.** Arabic uses Arabic-Indic numerals and the `٪` glyph throughout
(FR-035b), and «المعتاد» rather than «متوسط». The AOV plain-language hint
(FR-036) is present at `:488-491`.

---

## 13. TEST REGISTRATION — PASS

**Every file added or modified by this branch is registered in a runner that
actually executes it.**

| File | Manifest | Registered |
|---|---|---|
| `functions/src/__tests__/funnelEconomicsParity.test.ts` **(new)** | `functions/package.json` `test`, `test:phase14`, `test:phase14:funnelEconomicsParity` | ✅ all three |
| `functions/src/__tests__/cpaEconomics.test.ts` | `functions/package.json` | ✅ pre-existing |
| `functions/src/__tests__/funnelSettings.contract.test.ts` | `functions/package.json` | ✅ pre-existing |
| `functions/src/__tests__/qararEngine.test.ts` | `functions/package.json` | ✅ pre-existing |
| `functions/src/__tests__/learningIntegration.test.ts` | `functions/package.json` | ✅ pre-existing |
| `src/__tests__/funnelCompleteness.test.ts` **(new)** | vitest `src/**` discovery | ✅ |
| `src/__tests__/funnelSettingsSavePayload.test.ts` **(new)** | vitest `src/**` discovery | ✅ |
| `scripts/sc11Guard.test.mjs` | root `package.json` `test` + `test:guard` **(newly added)** | ✅ |

The `sc11Guard.test.mjs` registration closes the exact FR-059 hazard: before this
branch the file was matched by **no** runner (vitest restricts discovery to
`src/**`) and referenced by nothing but its own header. Root `package.json` now
reads `"test": "node scripts/sc11Guard.test.mjs && vitest run"`.

**`grep -c 'test('` vs runner output — reconciled:**

| File | grep `test(` | Runner | Note |
|---|---|---|---|
| `cpaEconomics.test.ts` | 66 | **65** | 1 is `re.test(stripped)` at `:1585` |
| `funnelSettings.contract.test.ts` | 33 | **33** | exact |
| `funnelEconomicsParity.test.ts` | 15 | **15** | exact |
| `qararEngine.test.ts` | 39 | **38** | 1 is `egyptianMarkers.test(…)` at `:681` |
| `learningIntegration.test.ts` | 5 | **5** | exact |
| `funnelCompleteness.test.ts` | 16 `it(` | **16** | exact |
| `funnelSettingsSavePayload.test.ts` | 12 `it(` | **12** | exact |
| `sc11Guard.test.mjs` | hand-rolled `ok N` | **22** | each named in raw output |

**Full runs executed by this audit:**

```
$ node scripts/sc11Guard.test.mjs        # tests 22  — pass 22  — fail 0
$ npx vitest run                          Test Files 5 passed (5) — Tests 64 passed (64)
$ cd functions && npm run test:phase14    306 across 15 files — 0 fail
$ cd functions && npm test                full backend suite — 0 fail
$ npx tsc -b                              exit 0
```

### Discrepancy against `batch-10-report.md` §4 — documentation, not code

`batch-10-report.md` §4.4 reports **61** frontend tests; I observe **64**.
§4.5 reports **13** parity tests / **304** backend total; I observe **15** / **306**.

Cause: the report was written at `db0ffd0` (Phase 10). Three later commits —
`346fac4`, `fb4f0d8`, `87fa4b3` (CodeRabbit rounds 12–14) — added 3 frontend and
2 backend tests. The report's §4.3 suppression **line numbers** (1051, 1060, 1086,
1087, 1100, 1101, 1102, 1119) are likewise stale against the current
(1089, 1098, 1124, 1125, 1138, 1139, 1140, 1157) — though the **count is still
exactly 8**, on the same file, with the same reason, so the substantive claim holds.

Every count moved **up**, every suite is green, and no file is unregistered. This
is a stale report, not a missing test. **Item 13 PASS**, with a recommendation to
refresh `batch-10-report.md` §4.3–§4.5 against `87fa4b3` before merge so the
durable record matches the merged tree (AGENTS.md rule 0b exists for exactly this
drift, and it fired here).

---

## 14. PARITY TEST — PASS, with FR-050 confirmed as a known deviation

`functions/src/__tests__/funnelEconomicsParity.test.ts` imports the backend's
`missingRequiredFields` (`:29`) and asserts it against 15 hand-curated fixtures.
`src/__tests__/funnelCompleteness.test.ts` pins the frontend's
`computeMissingFields` against **the same 12 named permutations**:

| Shared fixture | Backend | Frontend |
|---|---|---|
| paid_event empty | `:92` | `:233` |
| paid_event complete (hasHto, htoConvRate empty) | `:106` | `:244` |
| paid_event hasHto missing htoPrice — lists htoPrice, NOT htoConversionRate (Item A) | `:122` | `:249` |
| paid_event numeric 0 is COMPLETE | `:137` | `:255` |
| paid_product empty | `:153` | `:272` |
| paid_product complete | `:166` | `:282` |
| paid_product missing htoConversionRate (FR-019) | `:180` | `:286` |
| paid_product missing htoPrice | `:197` | `:292` |
| free_webinar empty | `:214` | `:306` |
| free_webinar complete | `:228` | `:317` |
| lead_magnet_call empty | `:240` | `:321` |
| lead_magnet_call complete | `:255` | `:333` |

Both sides pass. The backend file's header (`:16-21`) records the obligation:
*"Any new permutation added here MUST be added there too, and vice versa."*

### FR-050 is NOT satisfied — stated as a known deviation

> **FR-050**: *"The completeness rule MUST be defined in exactly one place and
> reused everywhere it is needed… Two independent implementations of 'complete'
> MUST NOT exist."*

**Two implementations remain:**

- `missingRequiredFields` — `functions/src/funnelSettings.ts:362` (canonical)
- `computeMissingFields` — `src/components/FunnelSettingsForm.tsx:222` (mirror)

They are structurally different code (backend iterates a declarative
`requiredFieldsForDoc` table with `null`/`undefined` checks; frontend runs an
imperative `Set` with `isEmptyString`/`isEmptyNumber` predicates over
string-typed form state), so they can drift on any input the fixtures do not
cover.

This is **recorded and accepted** in spec **A-12**, which names both call sites,
quotes FR-050, and states the mitigation is the parity gate rather than a shared
module. Phase 10 reduced the risk materially by extracting the frontend logic
from an inline `useMemo` into a named exported function so it could be tested at
all. The correct end state is a single shared module, explicitly scoped outside
Phase 10.

**One uncovered asymmetry worth logging for the next phase:** the backend returns
`["funnelType"]` for an unrecognised `funnelType` (`funnelSettings.ts:374-376`);
the frontend has no such branch and would return only
`['commissionRate','marginKept']`. The backend fixture exists (`:296`) but has no
frontend counterpart, so the parity gate does not cover this input. It is
unreachable today — the form's `funnelType` is a typed union bound to a `<select>`
of exactly four options — but it is precisely the kind of divergence A-12 warns
about.

**Merge impact: none.** The deviation is explicit, documented, test-guarded, and
belongs in the PR description as A-12 instructs.

---

## 15. `metaSync/shared.ts` BOUND — PASS

**The FR-042 log WAS added.** `functions/src/metaSync/shared.ts:608-625`:

```
funnel_settings_incomplete  workspaceId=… accountId=… funnelType=… missing=[…]
```

One `console.warn` per account per sync (not per ad), driven by the canonical
`missingRequiredFields` — FR-050-consistent, and placed where the suppression
actually happens, as the spec's Clarifications session requires.

**Complete diff of the file — 3 hunks, nothing else:**

1. `:76-79` — import `isSettingsComplete`, `missingRequiredFields`.
2. `:587-595` — the FR-042 rationale comment and the
   `settingsIncompleteLogged` flag declaration.
3. `:604-625` — widen the read cast from `{ derived?: unknown }` to
   `Record<string, unknown>` (mechanically required — `missingRequiredFields`
   needs the sibling fields) and emit the log.

**Confirmed unchanged:**

- The `?? Infinity` coercion at `:882-884` is byte-identical to `main`.
- No target recomputation, no logic change, no verdict-path change.
- No change to aggregate paths, reads, or writes (FR-046 regression invariant
  holds — `:1058-1071` untouched).
- No import cycle introduced: `funnelSettings.ts` does not import `metaSync/*`
  (only comment references), and `index.ts` already loads both modules.

**Bounded to the FR-042 log statement only. PASS.**

> Nit, non-blocking: `:617-624` is a self-described "defensive, should be
> unreachable" second `console.warn`. It is genuinely unreachable —
> `isSettingsComplete(d)` is defined as `missingRequiredFields(d).length === 0`,
> so the guarded condition `!isSettingsComplete(data) && !settingsIncompleteLogged`
> cannot be true after the preceding block. Harmless dead code.

---

## 16. FILES NOT MODIFIED — PASS with exceptions

**Both named files are untouched:**

```
$ git diff main...HEAD --stat -- .github/workflows/ci.yml scripts/.sc11-allowlist
(empty)

$ git log --oneline main..HEAD -- .github/workflows/ci.yml scripts/.sc11-allowlist
(empty — never touched by any commit on this branch)
```

`.github/workflows/ci.yml:33-34` still reads
`- name: Lint frontend (advisory — does not fail the pipeline) / run: npm run lint || true`
— FR-061a honoured, and FR-061's acknowledgement stands: **the strengthened
guard is real locally and advisory in CI.** `scripts/.sc11-allowlist` still holds
its original 10 entries with **zero additions** — FR-056 and SC-009 satisfied.

### Three deviations from the declared working file set

The spec's "Working file set" names: the settings form, the economics module, the
settings callables, the translation catalogue, `src/App.tsx` (bounded),
`functions/src/metaSync/shared.ts` (bounded), and the two `sc11Guard` scripts.
Test files and the two `package.json` manifests are covered by FR-059.
Three changed paths fall outside that list:

| Path | Change | Assessment |
|---|---|---|
| `src/utils/funnelSettingsSavePayload.ts` **(new, 60 lines)** | Production code extracted from `handleSave` so the Item D `null` pass-through is unit-testable | Justified and well-executed, but a **new production file not named in the working file set**. Should have been recorded as an approved expansion the way `sc11Guard.mjs` and `metaSync/shared.ts` were. |
| `AGENTS.md` **(+71 lines)** | Process rules — 0a batch reports, 0b test-name-vs-assertion walk, and a Round-13 clarification | **Fully outside the phase's scope.** Repo-wide agent process doc, unrelated to funnel economics. Not risky, but it does not belong in this PR. Split it out. |
| `functions/src/__tests__/learningIntegration.test.ts` **(+1 line)** | Adds `economicsVersion: 2` to a fixture | Mandatory consequence of the version gate — without it the fixture's target resolves to `null`. Covered by FR-059. |

### Two uncommitted files in the working tree

```
$ git status --porcelain
 M .opencode/package-lock.json     (105 lines churned — unrelated tooling)
 M CLAUDE.md                       (1 line: "Last updated" date bump)
```

Neither is on the branch. **Confirm they are excluded from the PR** (or committed
deliberately with a note) — `.opencode/package-lock.json` in particular is
unrelated tooling churn that should not ride along with an economics change.

**None of these block merge.** They are hygiene items; the two files the checklist
named are provably untouched.

---

## 17. ADDITIONAL FINDING — two new lint errors (non-blocking)

Not on the checklist; surfaced while verifying SC-009.

This branch introduces **2 new ESLint errors** in
`src/components/FunnelSettingsForm.tsx`:

```
154:14  error  react-refresh/only-export-components   (export const MISSING_FIELD_LABELS)
222:17  error  react-refresh/only-export-components   (export function computeMissingFields)
```

Measured against the same file at `main`, which lints at **1 error**
(`react-hooks/set-state-in-effect:673`, pre-existing hydration effect):

```
MAIN baseline:  1 error   {"react-hooks/set-state-in-effect":1}
HEAD:           3 errors  {"react-refresh/only-export-components":2,
                           "react-hooks/set-state-in-effect":1}
```

Cause: FR-052 and the parity gate required non-component exports from a component
file. SC-009 asks that "the full lint … suite passes"; repo-wide lint has 1,169
pre-existing errors and is `|| true` in CI (FR-061), so nothing fails — but the
branch does move its own file's count from 1 to 3.

**The fix also resolves the FR-050 deviation.** Moving `computeMissingFields` and
`MISSING_FIELD_LABELS` into `src/utils/funnelCompleteness.ts` — the pattern this
branch already established with `src/utils/funnelSettingsSavePayload.ts` —
clears both react-refresh errors and creates the shared-module seam A-12 names as
the correct end state. Worth doing in the follow-up phase A-12 already anticipates.

The two new test files lint clean (0 errors), as does
`funnelSettingsSavePayload.ts`.

---

## Merge recommendation

**Merge.** The one blocking fix this audit asked for has landed.

**Fixed since the audit was taken (1):**

- **Item 6** — «الـ back-end» replaced in the projection-active explainer, English
  at `:1238` realigned, pair pinned as row 26a in `contracts/uiCopy.md`. Landed in
  `6473958`. No logic impact; the commit records `tsc -b` clean, 64 frontend /
  306 backend tests green, and the SC-11 guard still at exactly 8 suppressions.

**Do before merge (hygiene, 2):**

- Refresh `batch-10-report.md` §4.3–§4.5 against `87fa4b3` (64 frontend / 306
  backend / current suppression line numbers).
- Confirm `CLAUDE.md` and `.opencode/package-lock.json` are excluded from the PR;
  split `AGENTS.md` into its own change.

**State in the PR description (per A-12 and FR-061a):**

- FR-050 is not satisfied — two completeness implementations remain, held in
  lockstep by 12 shared parity fixtures, not by a single source of truth.
- The SC-11 guard is **not** CI-enforced. `ci.yml:34` runs `npm run lint || true`.
  Every hardening in FR-054–FR-058 is real locally and advisory in the pipeline.
  This is FR-061a's deliberate, acknowledged deferral.

**Follow-up (not blocking):**

- Extract `computeMissingFields` + `MISSING_FIELD_LABELS` to `src/utils/` — clears
  Item 17's 2 lint errors and delivers the FR-050 single source of truth.
- Add a frontend parity fixture for the unknown-`funnelType` input (Item 14).
- Consider a guard pattern for Latin-script jargon inside Arabic string literals —
  the class of defect Item 6 found has no automated detector today.

**What is solidly right:** the corrected math is correct at every discriminating
input I tested against the compiled module, commission is scoped exactly to the
`htoPrice` term on all four funnel types, the version gate genuinely produces
`null → ⏳ → no verdict count`, the completeness rule and its save-side rejection
are sound, the guard hardening is real and its 8 suppressions are honest and
minimal, `htoConversionRate` retention keeps the revert code-only, and no epoch
fragment reached the tree. 306 backend + 64 frontend + 22 guard tests, all green;
`tsc -b` clean.
