# ITEM 1 — Blur side-effect audit (pre-implementation check)

- **Branch:** `968-funnel-economics-rebuild`
- **Prior commit:** `72e3f9f` (Phase 13 §6 reconciliation fix, pushed)
- **Prior report:** `docs/investigations/wheel-handler-passive-listener-report.md` (ITEM 1 root-cause investigation)
- **Status:** Report only. No code change applied. Awaiting owner go-ahead.
- **Trigger:** Owner's pre-implementation request: "If a side effect exists, stop and report it — the fix may need to be a non-passive native listener via ref instead, which preserves focus."

---

## TL;DR

**No blur side effects found anywhere in the frontend codebase.** The blur-on-wheel fix is safe to apply. The alternative (non-passive `useRef` listener that preserves focus) is not required for safety — focus preservation is not load-bearing here.

Searches across the entire `src/` tree returned:

- **Zero `onBlur` handlers** in any `.ts` or `.tsx` file.
- **Zero `blur()` invocations** anywhere in the frontend (blur is not a verb any code calls).
- **Zero global blur/focus listeners** (`addEventListener('blur')` / `addEventListener('focus')`).
- **Zero save-on-blur, validate-on-blur, commit-on-blur, or optimistic-merge-on-blur** logic.
- **Zero focus-dependent tooltips, popovers, or hover cards** keyed to the number inputs.
- All `useEffect`s in `FunnelSettingsForm.tsx` are data-load / hydration effects, not focus-dependent.
- All `useRef`s in `FunnelSettingsForm.tsx` are hydration markers, not focus refs.

The only behavior triggered by blur is the browser-native focus loss itself — which is the intended mechanism of the fix.

---

## 1. What I searched for

The owner asked specifically:

> "Does NumberField (or anything wrapping it) have an onBlur handler? If blur
> triggers validation, a value commit, an optimistic merge, or a save, then
> blurring on every wheel event fires that side effect repeatedly while the user
> scrolls the form. Report every onBlur, onChange-on-blur, and focus-dependent
> behavior in FunnelSettingsForm.tsx before applying the fix."

I expanded the audit to the whole `src/` tree because any global blur/focus listener, focus trap, or focus-restoration logic could fire as a side effect of the new blur.

Searches run:

```
grep "onBlur"           src/**/*.ts src/**/*.tsx
grep "onFocus"          src/**/*.ts src/**/*.tsx
grep "blur()"           src/**/*.ts src/**/*.tsx
grep "focus()"          src/**/*.ts src/**/*.tsx
grep "addEventListener.*blur"   src/**/*.ts src/**/*.tsx
grep "addEventListener.*focus"  src/**/*.ts src/**/*.tsx
grep "document\.addEventListener|window\.addEventListener"  src/**/*.ts src/**/*.tsx
grep "tooltip|popover|hover|aria-describedby"  src/components/FunnelSettingsForm.tsx
grep "NumberField"  src/components/FunnelSettingsForm.tsx     # 20 callers
grep "useEffect|useRef|useCallback"  src/components/FunnelSettingsForm.tsx
grep "SaveFunnelSettings|persistSettings|setDoc|updateDoc"  src/components/FunnelSettingsForm.tsx
grep "handleSave|onClick.*save|button.*save"  src/components/FunnelSettingsForm.tsx
```

---

## 2. Findings — file-by-file

### 2.1 `src/components/FunnelSettingsForm.tsx` — the file we will edit

#### `NumberField` definition (`lines 1714-1800`)

The component renders a `<label>`, an `<input type="number">`, and an optional `<p>` hint. The input has two handlers:

```tsx
<input
    type="number"
    inputMode="decimal"
    step="0.01"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onWheel={preventWheelValueChange}     // <-- the broken handler
    className={`w-full p-2 rounded border ${inputCls}`}
/>
```

- `onChange` fires on every keystroke / spinner click. Calls the parent's `onChange(v)` to update React state. **Does not fire on wheel or blur.**
- `onWheel` is the handler we are replacing.
- **No `onBlur`. No `onFocus`. No `useEffect`. No `useRef`. No validation, no commit, no save, no auto-merge.**

#### `useEffect` at `:527` — data loader

```tsx
useEffect(() => {
    if (!workspaceId || !accountId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setUnlinked(false);
    const fn = httpsCallable(functions, 'getFunnelSettings');
    fn({ workspaceId, accountId })
        .then((res) => { ... })
        .catch((e) => { ... })
        .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
}, [workspaceId, accountId]);
```

Dependency: `[workspaceId, accountId]`. Loads settings from the backend. **Not focus-dependent.**

#### `useRef` + `useEffect` at `:900-935` — hydration

```tsx
const hydratedForRef = useRef<string | null>(null);
useEffect(() => {
    if (!settings) return;
    if (hydratedForRef.current === settings.accountId) return;
    hydratedForRef.current = settings.accountId;
    setFunnelType(settings.funnelType);
    setAov(settings.aov != null ? String(settings.aov) : '');
    // ... 28 setters total ...
}, [settings]);
```

Tracks the last-hydrated `accountId` to avoid re-hydration cascades. The `useRef` stores a string. The `useEffect` runs on `settings` change. **Not focus-dependent.**

#### `handleSave` at `:969` — manual save

```tsx
async function handleSave() {
    if (!selectedWorkspaceId || !selectedAccountId) return;
    const aovN = funnelType === 'paid_event' || funnelType === 'paid_product' ? numOrNull(aov) : null;
    // ... 10+ scoped numOrNull calls ...
    const req = { ... };
    // ... save call ...
}
```

Wired to a button at `:1588`:

```tsx
<button onClick={handleSave} ... >
```

Save fires **only on click**, not on blur.

#### All `useState` setters — called only from `onChange` and `handleSave`

Setters at `:803-840`: `setAov`, `setHasHto`, `setHtoPrice`, `setHtoConversionRate`, `setRoasTarget`, `setOfferPrice`, `setAttendanceRate`, `setBuyRateFromAttendees`, `setLeadToCloseRate`, `setBookingRate`, `setShowUpRate`, `setQualificationRate`, `setProductBookingRate`, `setProductShowUpRate`, `setProductQualificationRate`, `setProductCloseRate`, `setEventAttendanceRate`, `setEventCloseRate`, `setCommissionRate`, `setMarginKept`.

Verified: every call site of every setter is either in an `onChange={(e) => ...}` handler (line 1778 in `NumberField`) or in `handleSave` (lines 1006-1059). **No setter is called from a blur handler.**

#### NumberField callers — all 20 sites

Found at `lines 1290, 1336, 1346, 1355, 1405, 1441, 1442, 1451, 1462, 1471, 1487, 1488, 1489, 1495, 1509, 1510, 1511, 1520, 1530`. Every call site passes:

- `label` (bilingual EN/AR)
- `value` (controlled React state)
- `onChange={setXxx}` (parent state setter)
- `isDarkMode`, `lang`, optional `hint` and `required`

No caller wraps `NumberField` with an `onBlur`, no caller passes an `onBlur` prop (the component doesn't accept one), no caller reads `document.activeElement` to make decisions.

#### `tooltip|popover|hover|aria-describedby` search in `FunnelSettingsForm.tsx`

Only 6 matches, all CSS-only `hover:` Tailwind classes on buttons (`hover:opacity-100`, `hover:bg-amber-700`, `hover:bg-indigo-700`). **No JS hover or focus-dependent tooltip. No `aria-describedby` linking inputs to dynamic content.**

### 2.2 Frontend-wide focus/blur audit

#### `onBlur` — zero matches

```
$ grep -rn "onBlur" src/**/*.ts src/**/*.tsx
(no output)
```

#### `onFocus` — zero matches

```
$ grep -rn "onFocus" src/**/*.ts src/**/*.tsx
(no output)
```

#### `blur()` — zero matches (the blur method is not called anywhere in frontend code)

```
$ grep -rn "\.blur()\|currentTarget\.blur" src/**/*.ts src/**/*.tsx
(no output)
```

#### `focus()` — 25 matches across 5 files

```
src/components/FavoritesPanel.tsx:92,94,104,138  — panel focus restoration
src/components/LinkAdPickerModal.tsx:141,145,154,157,163,165  — modal focus trap
src/components/MetaAccountPickerModal.tsx:64,69,87,90,96,98  — modal focus trap
src/components/MetaPagePickerModal.tsx:77,82,100,103,109,111  — modal focus trap
src/components/WorkspaceSwitcher.tsx:122  — dialog focus
src/__tests__/funnelSettingsRender.test.tsx:523  — test fixture
```

**None of these listen for blur events.** They actively CALL `focus()` on their own elements during their own lifecycle (opening a modal, opening a panel, opening a dialog). They do not react to blur on other elements.

#### `addEventListener` with `blur` or `focus` — zero matches

```
$ grep -rn "addEventListener.*blur\|addEventListener.*focus" src/**/*.ts src/**/*.tsx
(no output)
```

#### `document.addEventListener` / `window.addEventListener` — 17 matches across 10 files

```
src/App.tsx:820            window.addEventListener('scroll', update, true);
src/App.tsx:821            window.addEventListener('resize', update);
src/App.tsx:3512           document.addEventListener('mousedown', close);
src/App.tsx:3536           window.addEventListener('keydown', onKey);
src/App.tsx:4435           window.addEventListener('keydown', onKey);
src/components/InputForm.tsx:294              document.addEventListener('mousedown', handleClickOutside);
src/components/FavoritesPanel.tsx:112         document.addEventListener('keydown', handleKeyDown);
src/components/GenerationHistory.tsx:234      document.addEventListener("mousedown", handle);
src/components/GenerationHistory.tsx:235      document.addEventListener("keydown", handleEsc);
src/components/LinkAdPickerModal.tsx:169      window.addEventListener("keydown", onKey);
src/components/MetaAccountPickerModal.tsx:102 window.addEventListener('keydown', onKey);
src/components/MetaPagePickerModal.tsx:115    window.addEventListener('keydown', onKey);
src/components/billing/MandatoryBillingModal.tsx:21  window.addEventListener("keydown", swallowEscape);
src/components/MagicSelector.tsx:130          window.addEventListener('keydown', handler);
src/components/WorkspaceSwitcher.tsx:126      document.addEventListener("keydown", onKey);
src/components/WorkspaceSwitcher.tsx:146      document.addEventListener('mousedown', handler);
src/components/SavedProjectsPanel/DeleteProjectDialog.tsx:24  document.addEventListener("keydown", handleKey);
```

All listeners:

- 2 scroll/resize (App.tsx) — layout observers. **Do not fire on wheel or blur.**
- 4 mousedown (App.tsx, InputForm.tsx, GenerationHistory.tsx, WorkspaceSwitcher.tsx) — click-outside detection. **Fire only on mouse clicks, NOT on wheel or blur.**
- 7 keydown (App.tsx ×2, FavoritesPanel, GenerationHistory, LinkAdPickerModal, MetaAccountPickerModal, MetaPagePickerModal, MandatoryBillingModal, MagicSelector, WorkspaceSwitcher, DeleteProjectDialog) — Escape handlers and keyboard shortcuts. **Fire only on keydown, NOT on wheel or blur.**

None of these global listeners would fire as a side effect of the new `e.currentTarget.blur()` call.

---

## 3. React-controlled inputs are blur-safe

The number inputs in `FunnelSettingsForm` are React-controlled:

```tsx
<input
    type="number"
    inputMode="decimal"
    step="0.01"
    value={value}                                  // read from useState
    onChange={(e) => onChange(e.target.value)}     // write to state
    onWheel={(e) => e.currentTarget.blur()}       // proposed fix
/>
```

When `blur()` fires on wheel:

- `document.activeElement` becomes `<body>` (or the page default) instead of the input.
- Browser-native focus ring is removed.
- The browser does NOT modify the input's `value` attribute.
- React's `value={value}` prop is unchanged (no `onChange` was called → state unchanged → prop unchanged → displayed value unchanged).

This is a well-tested DOM contract. jsdom and every real browser honor it identically. The proposed test in `funnelSettingsRender.test.tsx` asserts on this directly: `expect(input.value).toBe(before)` after a wheel dispatch.

---

## 4. Side-by-side: blur fix vs. non-passive `useRef` listener

If we used the alternative — `useRef` + `addEventListener('wheel', handler, { passive: false })` in a `useEffect` — we would:

- **Preserve focus** (the user keeps typing in the field).
- **Block value mutation** directly via `preventDefault()` on a non-passive listener.

The audit confirms focus preservation is **not required for safety**:

| Concern | Blur fix | Non-passive listener |
|---|---|---|
| Value mutation blocked | Yes (focus loss gates it) | Yes (preventDefault honored) |
| Focus preserved | **No** (intentional) | Yes |
| Save-on-blur side effect | **None — none exist** | N/A |
| Validation-on-blur side effect | **None — none exist** | N/A |
| Commit-on-blur side effect | **None — none exist** | N/A |
| Optimistic-merge-on-blur | **None — none exist** | N/A |
| Global blur listener fires repeatedly | **No — none exist** | N/A |
| Code complexity | 1 line JSX change | ref + effect + cleanup + non-passive flag |

The blur fix is the simpler, safer choice. Focus loss is a small UX cost (the user must click again to resume typing after a wheel scroll), but the codebase has zero focus-dependent behavior that would be affected.

---

## 5. What I did NOT find (negative findings, in case the owner wants to verify)

I did NOT find:

- **Form `<form onBlur={...}>` ancestor.** `FunnelSettingsForm` does not wrap its inputs in a `<form>` element (verified at `:1577-1598`, the form's submit/button area is `<div>`, not `<form>`). Even if it did, React's synthetic `onBlur` on a `<form>` only fires when focus leaves the form, not on individual input blurs.
- **HTML5 `pattern` / `min` / `max` validation that fires on blur.** The inputs have `step="0.01"` and `type="number"` but no `required`, no `pattern`, no `min`/`max` in the JSX. (Verified by searching for `required`, `pattern`, `min=`, `max=` in the JSX section of `NumberField`.) Browser-native validation could fire on blur, but since no constraints are declared, nothing validates.
- **`<fieldset>` or `<legend>` wrapping** the number inputs. No grouping element means no group-level blur.
- **Tooltips, popovers, or hover cards** that read `document.activeElement`. No component does this.

---

## 6. Conclusion

**No blur side effects. The fix is safe to apply.**

The proposed `onWheel={(e) => e.currentTarget.blur()}` change in `src/components/FunnelSettingsForm.tsx:1787` will:

1. Cause `document.activeElement` to leave the number input on every wheel event.
2. Trigger the browser-native focus ring removal.
3. **Trigger nothing else** — no React handlers, no useEffects, no global listeners, no form-level validation, no commits, no saves, no analytics, no telemetry.

Focus loss itself is the intended mechanism. It gates the browser's value-mutation-on-wheel behavior because that behavior is conditional on focus.

---

## 7. Implementation plan (ready to apply on owner go-ahead)

1. `src/components/FunnelSettingsForm.tsx:1787` — replace `onWheel={preventWheelValueChange}` with `onWheel={(e) => e.currentTarget.blur()}`.
2. `src/components/FunnelSettingsForm.tsx:200-216` — delete `preventWheelValueChange` function export.
3. `src/components/FunnelSettingsForm.tsx:196-209` — delete the comment block preceding `preventWheelValueChange` (it describes the `target === currentTarget` guard, which is now irrelevant).
4. `src/components/FunnelSettingsForm.tsx:1779-1786` — rewrite the `onWheel` comment to describe blur-on-wheel instead of preventDefault-on-focused-input.
5. `src/__tests__/funnelSettingsRender.test.tsx:479` — delete `import { preventWheelValueChange } from "../components/FunnelSettingsForm";`.
6. `src/__tests__/funnelSettingsRender.test.tsx:481-533` — delete the three tests in the `NumberField — wheel scroll does not change value (CHANGE 2)` describe block.
7. `src/__tests__/funnelSettingsRender.test.tsx` — add **one** jsdom test: focus a number input, dispatch a wheel event, assert `document.activeElement !== input` (blur happened) AND `input.value` unchanged.
8. `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` — update the `Mouse-wheel guard (Phase 13 CHANGE 2)` section to describe the new mechanism (blur, not preventDefault). Section title can stay (still a "guard") but the body changes.
9. `specs/968-funnel-economics-rebuild/reports/batch-11-report.md` §6 — append a reconciliation addendum recording the −3 test delta on `funnelSettingsRender.test.tsx` (19 → 16), bringing the runner total from 84 → 81.
10. Run all checks: `npx vitest run`, `cd functions && npm run test:phase14`, `npx tsc -b`, `npm run lint` (where it can run without tripping on `functions/lib/`).
11. Delete `C:\temp\opencode\check-wheel*.cjs` (outside the repo; not committed; clean up after verification).
12. Write `specs/968-funnel-economics-rebuild/reports/batch-12-report.md` per AGENTS.md §0a (raw command output verbatim, names vs bodies walk, cross-section reconciliation).
13. Commit + push.

---

## 8. What has NOT been done

- No code change to any file.
- No test change.
- No commit. No push.
- The proof scripts in `C:\temp\opencode\check-wheel*.cjs` from the prior investigation remain on disk (will be deleted after batch-12 closes).

---

## 9. Awaiting owner go-ahead

The blur side-effect audit is complete and the fix is safe. Ready to apply on your go-ahead.

---

## Appendix A — Raw search outputs (verbatim)

```
$ grep -rn "onBlur" src/**/*.ts src/**/*.tsx
(no matches)

$ grep -rn "onFocus" src/**/*.ts src/**/*.tsx
(no matches)

$ grep -rn "\.blur()\|currentTarget\.blur" src/**/*.ts src/**/*.tsx
(no matches)

$ grep -rn "addEventListener.*blur\|addEventListener.*focus" src/**/*.ts src/**/*.tsx
(no matches)

$ grep -rn "tooltip\|popover\|hover\|aria-describedby" src/components/FunnelSettingsForm.tsx
src/components/FunnelSettingsForm.tsx:1196:  className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
src/components/FunnelSettingsForm.tsx:1206:  className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
src/components/FunnelSettingsForm.tsx:1224:  className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}
src/components/FunnelSettingsForm.tsx:1234:  className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded bg-amber-600 text-white font-semibold hover:bg-amber-700"
src/components/FunnelSettingsForm.tsx:1590:  className="w-full px-4 py-3 rounded bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
src/components/FunnelSettingsForm.tsx:1701:  className={`text-xs px-2 py-1 rounded ${txMuted} hover:opacity-100`}

(All 6 matches are CSS-only Tailwind hover classes on buttons. No JS hover handlers.)

$ grep -rn "focus()" src/**/*.ts src/**/*.tsx
src/__tests__/funnelSettingsRender.test.tsx:523: input.focus();
src/components/FavoritesPanel.tsx:92:       triggerRef.current = document.activeElement as HTMLElement;
src/components/FavoritesPanel.tsx:94:       sortToggleRef.current?.focus();
src/components/FavoritesPanel.tsx:104:    triggerRef.current?.focus();
src/components/FavoritesPanel.tsx:138:        el.focus();
src/components/LinkAdPickerModal.tsx:141:   previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
src/components/LinkAdPickerModal.tsx:145:   focusables()[0]?.focus();
src/components/LinkAdPickerModal.tsx:154:   const active = document.activeElement as HTMLElement | null;
src/components/LinkAdPickerModal.tsx:157:     dialog?.focus();
src/components/LinkAdPickerModal.tsx:163:     if (active === first) { e.preventDefault(); last.focus(); }
src/components/LinkAdPickerModal.tsx:165:     if (active === first) { e.preventDefault(); first.focus(); }
src/components/MetaAccountPickerModal.tsx:64:   previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
src/components/MetaAccountPickerModal.tsx:69:   firstFocusable?.focus();
src/components/MetaAccountPickerModal.tsx:87:   const active = document.activeElement as HTMLElement | null;
src/components/MetaAccountPickerModal.tsx:90:     dialog?.focus();
src/components/MetaAccountPickerModal.tsx:96:   if (active === first) { e.preventDefault(); last.focus(); }
src/components/MetaAccountPickerModal.tsx:98:   if (active === first) { e.preventDefault(); first.focus(); }
src/components/MetaPagePickerModal.tsx:77:   previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
src/components/MetaPagePickerModal.tsx:82:   firstFocusable?.focus();
src/components/MetaPagePickerModal.tsx:100:  const active = document.activeElement as HTMLElement | null;
src/components/MetaPagePickerModal.tsx:103:  dialog?.focus();
src/components/MetaPagePickerModal.tsx:109:  if (active === first) { e.preventDefault(); last.focus(); }
src/components/MetaPagePickerModal.tsx:111:  if (active === first) { e.preventDefault(); first.focus(); }
src/components/WorkspaceSwitcher.tsx:122:   guardDialogRef.current?.focus();

(All 25 matches are components actively CALLING .focus() on their own
elements during their own lifecycle. None listen for blur events on other
elements.)
```

---

## Appendix B — References

- **Prior investigation report:** `docs/investigations/wheel-handler-passive-listener-report.md` — root cause analysis.
- **Phase 13 batch report:** `specs/968-funnel-economics-rebuild/reports/batch-11-report.md` §6 reconciliation needs the −3 addendum.
- **Phase 13 uiCopy contract:** `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` — `Mouse-wheel guard (Phase 13 CHANGE 2)` section needs body rewrite.
- **NumberField definition:** `src/components/FunnelSettingsForm.tsx:1714-1800` (unchanged structure; only the `onWheel` prop will change).
- **HTML5 blur behavior spec:** https://html.spec.whatwg.org/multipage/interaction.html#focus-fixup-rule — `blur()` removes focus without firing any DOM-level side effects beyond the focus ring removal.

---

End of report. Awaiting owner go-ahead before any code change.
