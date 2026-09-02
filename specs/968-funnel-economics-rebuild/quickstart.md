# Quickstart: Funnel Economics Rebuild

**Feature**: `968-funnel-economics-rebuild` | **Branch**: `968-funnel-economics-rebuild`

Read `plan.md` §"Phase 0 findings" before writing code. **R-1 is not optional** — without the version stamp, the safety gate this whole phase depends on does not fire.

---

## Build and test

```bash
# Backend — pure module and contracts
cd functions
npm run build
npm test

# Frontend — type check, lint, and the terminology guard
cd ..
npm run build
npm run lint          # eslint + scripts/sc11Guard.mjs
```

`npm run lint` runs the guard. It must pass **without** `src/components/FunnelSettingsForm.tsx` appearing in `scripts/.sc11-allowlist`.

### Registering the new test

`functions/package.json:34` enumerates every test file by path. A new `__tests__/*.test.ts` that is not added there compiles, passes review, and **never runs**. Append:

```
&& node lib/__tests__/funnelEconomicsParity.test.js
```

---

## Order of work

Follow the dependency spine — nothing downstream is verifiable until the pure module is right.

| # | Step | Verifiable locally? |
|---|---|---|
| 1 | `cpaEconomics.ts` — formulas, `ECONOMICS_VERSION`, remove both constants, advisory retrigger | ✅ |
| 2 | Fixtures from `contracts/cpaEconomics.md` §4 | ✅ |
| 3 | `funnelSettings.ts` — completeness predicate, new field validation, `complete` on response | ⚠️ needs deploy |
| 4 | `FunnelSettingsForm.tsx` — inputs, hints, margin preset, dual-path card, missing-field marking | ✅ renders |
| 5 | `App.tsx` badge — **strictly limited** to reading `complete` and rendering the marker | ✅ renders |
| 6 | Observability log in the sync (constitution VI) | ⚠️ needs deploy |
| 7 | Parity test (constitution XI) | ✅ |

Steps 1–2 alone deliver User Stories 1–2 and are independently shippable.

---

## Deploy

Backend callables cannot be exercised by `npm run dev` (report §13).

```powershell
Remove-Item -Recurse -Force functions/lib
cd functions
npm run build
firebase deploy --only functions
```

---

## Verification checklist

### Locally — the pure module

- [ ] `$3,000` lead magnet at benchmark midpoints → **`12.76`**, not `630` (SC-001)
- [ ] Margin 50 → `15.95`, margin 70 → `9.57` (note A-2: report prints `15.94` for the 50 row; `15.95` is correct)
- [ ] `$3,000` webinar → **`5.40`** (SC-002)
- [ ] `$24` paid event → **`48.00`**, with the 100-buyer sanity check at `17,587.50` net / `12,787.50` profit (SC-003)
- [ ] Paid product `fullBuyerValue` = **`235.00`** — not `211.50` (commission wrongly on `aov`) and not `250.00` (no commission)
- [ ] Advisory: fires at `0.36`, silent at `0.90`, silent at exactly `0.50`, silent at raw `0.4999`, fires at `0.4949` (SC-007)
- [ ] `getEffectiveTarget` returns `null` for a payload with no `economicsVersion` — **the pre-phase production shape**
- [ ] `ECONOMIC_CEILING_MULTIPLIER` and `FULL_FUNNEL_ROAS_FLOOR` are gone, including their old test assertions

### Locally — copy and guard

- [ ] `npm run lint` passes
- [ ] `scripts/.sc11-allowlist` is unchanged; the form is not on it
- [ ] Every hint renders as muted text **below** its field and stays visible while typing (FR-034)
- [ ] Margin buttons read `50` / `60` / `70`, not `Keep 50%`
- [ ] Re-run the string enumeration from `contracts/uiCopy.md` §5 — lint passing alone would not catch copy relocated into an allowlisted file

### Post-deploy — the safety gate (the one that matters most)

Use a workspace holding **both** a pre-existing settings record **and** pre-existing learning aggregates.

- [ ] Record loads; the form opens with no errors
- [ ] `getFunnelSettings` returns the record **and** `complete: false` — **not** `settings: null`
- [ ] **No modal opens by itself** on app load (FR-044). If one does, R-3's trap is live
- [ ] Attention marker is visible on the Funnel Settings menu entry
- [ ] Run a full sync: **zero** 🟢/🔴 verdicts written; affected ads show ⏳
- [ ] Compare `hookPerformance` and `visualPerformance` before and after: **byte-identical** (SC-010)
- [ ] One `funnel_settings_incomplete` log line per account, naming the missing fields
- [ ] Owner fills the fields and saves → target computes, marker clears, next sync writes verdicts

---

## Traps

| Trap | Why it bites | Guard |
|---|---|---|
| Skipping the version stamp | The sync reads the **stored** `derived`, so an existing record still returns `630` and the gate silently never fires | R-1, fixture 4.7 |
| Returning `settings: null` for incomplete | `App.tsx:4283` → `:4354` auto-opens the modal, pushing every existing owner into the form | FR-043, R-3 |
| Moving hint copy into `i18n.tsx` | It is allowlisted, so the guard stops seeing the copy — passes lint, defeats the rule | FR-035a |
| `"Keep 50%"` on a margin button | Digit-then-percent trips the guard | FR-025a |
| Using «متوسط» in Arabic copy | Banned by policy, **absent from the regex** — ships silently | R-5 |
| New test file not in `package.json` | Compiles, never runs; the parity check silently does not exist | R-6 |
| Adding `businessEpoch` "while we're here" | Deferred scope; constitution XII | spec scope boundary |

---

## Rollback

Code-only. Nothing in this phase writes to any existing document, so there is no data restoration step:

1. Revert the commits.
2. Pre-phase `derived` payloads are still on disk, unmodified, and are read exactly as before.
3. Records that owners completed during the phase carry the new fields; pre-phase code ignores unknown fields and reads the `derived` it finds.
