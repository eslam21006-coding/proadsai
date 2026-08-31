# Batch 01 — Phase 1 SC-11 Guard Hardening Report

**Feature**: 968-funnel-economics-rebuild
**Phase**: 1 (BATCH 1 — Terminology guard, STANDALONE, BLOCKING)
**Tasks delivered**: T001, T002, T003, T004, T005, T006, T007, T007a, T008, T009 (10/10)
**Status**: ✅ GATE — PASS. Phase 2 unblocked on explicit clearance.
**Date**: 2026-08-31

---

## 1. Scope

Files modified in this invocation:

- `scripts/sc11Guard.mjs` — guard strengthened, per-line suppression added, applied-suppression output added
- `scripts/sc11Guard.test.mjs` — 15 new tests added (T005–T007, plus 1 extra for the strengthened "Eastern Arabic-Indic digits + %" form which the plan did not enumerate but which falls inside the strengthened character class — adding it costs nothing and proves the regex covers it)
- `package.json` — added `test:guard` script and chained it into `test` (T007a)

Files explicitly NOT modified (per user input):

- `.github/workflows/ci.yml` — FR-061a
- `scripts/.sc11-allowlist` — no entries added or removed
- Any `funnel-economics-rebuild` source file (Phase 2+)

---

## 2. What changed

### 2.1 T001 — strengthened `PERCENT_SIGN` pattern

`scripts/sc11Guard.mjs:94` was:

```js
{ code: "PERCENT_SIGN", re: /\d+\s*%|percent/gi }
```

Now:

```js
{ code: "PERCENT_SIGN", re: /[\d٠-٩۰-۹]+\s*[%٪]|percent/gi }
```

Three previously-missed forms now trip: Arabic-Indic digits (U+0660–0669), Eastern Arabic-Indic digits (U+06F0–U+06F9), and the `٪` character (U+066A). The `percent` alternative is unchanged so existing English code paths stay intact.

### 2.2 T002–T003 — per-line suppression parser and validity enforcement

A new regex `SC11_ALLOW_RE` recognises exactly one form:

```
// sc11-allow:<CODE> reason="<non-empty text>"
```

- Bare `sc11-allow` (no code) → hard fail.
- Unknown `<CODE>` → hard fail.
- Missing or empty `reason="..."` → hard fail.
- One code, one line. No file-level, directory-level, multi-line, next-line, or block variants. `scripts/.sc11-allowlist` is untouched and gains no entries.

### 2.3 T004 — applied suppressions printed on every run

The guard now prints every applied suppression with its reason at the top of its output, so exceptions are visible on every run rather than silent. Empty result prints an explicit "0 per-line suppressions applied" line so the absence is not silent either.

### 2.4 T005–T007 — 15 new tests

Tests cover:

- 4 percentage forms the spec enumerates (`5–10%`, `٥–١٠%`, `5–10٪`, `٥–١٠٪`) — all must trip.
- 1 extra form (`۵-۱۰%` with Eastern Arabic-Indic digits) — must trip; cost-free; documents the regex's U+06F0–U+06F9 coverage.
- 2 negative controls (`Booking rate (%)` and bare `50`) — must NOT trip.
- 8 suppression-mechanics tests:
  - Valid suppression clears only its own code on its own line.
  - `PERCENT_SIGN` suppression does not leak to `EN_CPA` on the same line.
  - Suppression does not leak to the next line.
  - Bare `sc11-allow` hard-fails.
  - Unknown code hard-fails.
  - Missing reason hard-fails.
  - Empty reason hard-fails.
  - Applied suppressions are printed with reason.

### 2.5 T007a — runner registration

`package.json` `test` now chains the guard tests:

```json
"test": "node scripts/sc11Guard.test.mjs && vitest run",
"test:guard": "node scripts/sc11Guard.test.mjs"
```

Previously `scripts/sc11Guard.test.mjs` was referenced only by its own header comment and run by nothing.

### 2.6 T008 — allowlist verification

`scripts/.sc11-allowlist` is unmodified (verified via `git diff scripts/.sc11-allowlist` → no diff). The only mention of `FunnelSettingsForm` in the allowlist is inside a comment line explaining that it must NOT be added — there is no actual allowlist entry for it. `src/components/FunnelSettingsForm.tsx` is therefore scanned and currently produces 0 hits under the strengthened pattern.

---

## 3. T009 — GATE evidence

### 3.1 Raw runner output of `npm run test:guard`

This is the **raw output of the test runner** showing each test executing by name. The exit code was 0.

```
> ai-ads-pro@0.0.0 test:guard
> node scripts/sc11Guard.test.mjs

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

# tests 22
# pass 22
# fail 0
EXIT=0
```

**Count: 22 tests, 22 pass, 0 fail.** T005 contributed tests 8–12 (5 forms); T006 contributed 13–14; T007 contributed 15–22 (8 mechanics). This matches the plan dry run exactly.

### 3.2 `npm run lint` repo-wide — outcome

`npm run lint` runs `eslint . && node scripts/sc11Guard.mjs`. The eslint step exits non-zero due to **pre-existing eslint errors** in `functions/src/__tests__/*.test.ts` files (no-explicit-any, no-unused-vars, etc.) — these are unrelated to Phase 1 and predate this branch. The note in `.github/workflows/ci.yml:34` that `npm run lint || true` is "advisory — does not fail the pipeline" acknowledges this pre-existing repo state.

Because eslint short-circuits the `&&`, `scripts/sc11Guard.mjs` did not execute inside `npm run lint`. The guard was therefore exercised **standalone** below — that is the script the lint chain was guarding, run by itself, and it is the script whose output matters for the GATE.

### 3.3 Standalone guard run with the allowlist active — output

```
sc11-guard: 0 per-line suppressions applied.
sc11-guard: PASS — 81 files scanned, 0 forbidden terms.
  (10 file(s) skipped via scripts/.sc11-allowlist)
EXIT=0
```

**PASS/0 — matches the plan dry-run expectation exactly.** 81 files scanned, 10 skipped via the allowlist. No per-line suppressions applied (none yet exist in the codebase).

### 3.4 Standalone guard run with the allowlist disabled — hit list

Allowlist disabled by running the guard from a working directory containing a junction to `src/` but no `scripts/.sc11-allowlist` (the allowlist file itself was not modified, per the user instruction). Output: **68 forbidden-term hits across 10 files** — exactly matching the plan dry-run expectation.

Distribution of the 68 hits by file (PowerShell `Group-Object` against the guard's stdout):

| File | Hits |
|---|---:|
| `src/App.tsx` | 27 |
| `src/services/feedbackService.ts` | 12 |
| `src/constants.ts` | 7 |
| `src/components/PerformanceDashboard.tsx` | 6 |
| `src/modeFieldSchema.ts` | 4 |
| `src/i18n.tsx` | 4 |
| `src/components/PricingTable.tsx` | 4 |
| `src/components/InputForm.tsx` | 2 |
| `src/universeDatabase.ts` | 1 |
| `src/planconfig.ts` | 1 |
| **Total** | **68** |

**Zero hits in `src/components/FunnelSettingsForm.tsx`.** All 10 files are pre-existing on the allowlist. **0 hits added, 0 hits removed** versus the plan dry-run baseline of "identical 68 hits across 10 files". The strengthening is purely forward-looking — no current production copy trips it that didn't already.

These 68 hits are **PRE-EXISTING** and were **NOT suppressed, NOT modified, NOT added to the allowlist** by this phase, per the user instruction.

---

## 4. Deviations from the plan

None of substance.

Two clarifications worth recording:

1. **Extra test (ok 12)** — the plan enumerated 4 percentage forms; the strengthened regex also catches `۵–۱۰%` (Eastern Arabic-Indic digits U+06F0–U+06F9 + `%`), which is the same logical form the plan calls "Arabic-Indic" with one extra character class. Adding a single test that exercises the Eastern form costs nothing and proves the character class really covers U+06F0–U+06F9, not just U+0660–U+0669. If this is not desired, dropping it is a one-line change.
2. **T007a — chained into `test`, not `lint`** — the task wording allowed either. Chaining into `test` is cleaner: `lint` already has a two-part identity (`eslint . && sc11Guard.mjs`), and `npm test` now fails if either Vitest or the guard tests break. `npm run lint` semantics are unchanged from a caller's perspective.

---

## 5. Risks remaining at the GATE

The plan calls these out and Phase 1 does not address them (out of scope):

- **R-1 (guard verification gap)**: `.github/workflows/ci.yml:34` runs `npm run lint || true`, so the guard cannot fail CI regardless of what this phase does. Tests are the only real proof — which is exactly why T005–T007 now exist and why T007a wires them into `npm test`. **T072 reports this to the product owner, not in this phase.**
- **R-2 (`npm run lint` passes identically before and after T001)**: confirmed — the strengthened pattern produces the same 68 hits as the original on the current codebase, so lint-level metrics cannot validate the strengthening. This was known and is the explicit reason T005–T007 exist.
- **R-3 (CI bypass)**: lint does not run the guard tests today; `npm test` does. CI must therefore invoke `npm test` for the new tests to execute in the pipeline — that is a CI-config change outside this phase.

None of these is a defect introduced by Phase 1; they are pre-existing repo state.

---

## 6. Phase 2 unblock

**Recommendation**: Phase 2 (Foundational — T010–T018) may begin. All 10 tasks of Phase 1 are reported. The GATE criteria are met:

- ✅ Pattern strengthened (T001)
- ✅ Per-line suppression live (T002, T003)
- ✅ Suppressions visible on every run (T004)
- ✅ All 4 percentage forms trip, all negative controls pass (T005, T006)
- ✅ Suppression mechanics fully tested including all hard-fail paths (T007)
- ✅ Tests actually run via `npm run test:guard` and `npm test` (T007a)
- ✅ Allowlist untouched; `FunnelSettingsForm.tsx` absent and clean (T008)
- ✅ Raw runner output naming every test, hit list reported (T009)

---

## 7. Reproducibility

```powershell
# 1. Confirm tests run and pass
npm run test:guard
# Expect: 22 ok lines, "# tests 22 / # pass 22 / # fail 0", exit 0

# 2. Confirm the guard scans the repo and passes with the allowlist active
node scripts/sc11Guard.mjs
# Expect: "PASS — 81 files scanned, 0 forbidden terms.", exit 0

# 3. Re-run with allowlist disabled (does NOT modify scripts/.sc11-allowlist)
#    Uses a junction at C:\temp\opencode\sc11-disallow\src → repo's src/
cmd /c mkdir C:\temp\opencode\sc11-disallow
cmd /c mklink /J C:\temp\opencode\sc11-disallow\src src
Push-Location C:\temp\opencode\sc11-disallow
node D:/proads-worktrees/funnel-economics-rebuild/scripts/sc11Guard.mjs
# Expect: "FAIL — 68 forbidden term(s) found", exit 1, 10 files hit
Pop-Location
```
