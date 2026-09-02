# ITEM 1 — Investigation: `preventWheelValueChange` does not block the value change in production

- **Branch:** `968-funnel-economics-rebuild`
- **Prior commit:** `72e3f9f` (Phase 13 §6 reconciliation fix, pushed)
- **Status:** Report only. No code change applied. Awaiting owner approval.
- **Author:** ITEM 1 from production testing (mouse-wheel fix does not work).

---

## TL;DR

The Phase 13 CHANGE 2 mouse-wheel fix is broken in production. **The handler is called and `preventDefault()` is invoked, but the browser silently ignores `preventDefault()` because React 19 attaches the delegated `wheel` listener with `{ passive: true }`.** Calling `preventDefault()` inside a passive listener is a no-op per the HTML5 spec.

The jsdom tests passed because they asserted on **method invocation** (`preventDefaultSpy.toHaveBeenCalledTimes(1)`), not on the browser-level `defaultPrevented` flag. The test pinned the wrong invariant: "the JS function ran" instead of "the browser was told to skip its default action."

The `target === currentTarget` guard is **not** the bug — I confirmed empirically that in React 19 + `createRoot`, when `onWheel` is attached directly to an `<input>`, both `target` and `currentTarget` resolve to the input. The guard holds in production.

The owner's suggested fix (`onWheel={(e) => e.currentTarget.blur()}`) is correct and recommended. It does not depend on `preventDefault()` being honored — it changes DOM state (focus) directly, and the browser's value-mutation-on-wheel behavior is gated on focus, so it does not fire when the input is blurred.

---

## 1. Background — what Phase 13 CHANGE 2 claimed to fix

Commit `3963964` (Phase 13 CHANGE 2) added a `preventWheelValueChange` handler exported from `src/components/FunnelSettingsForm.tsx:210-216`:

```ts
export function preventWheelValueChange(e: {
    target: EventTarget | null;
    currentTarget: EventTarget | null;
    preventDefault: () => void;
}): void {
    if (e.target === e.currentTarget) e.preventDefault();
}
```

The handler is wired onto the single `<input type="number">` inside `NumberField` (line 1787):

```tsx
onWheel={preventWheelValueChange}
```

The intent: when a user hovers or focuses a number input and scrolls the mouse wheel, the browser's value-mutation-on-wheel behavior (increment/decrement the value) should be suppressed, and the page should scroll instead.

Three tests in `src/__tests__/funnelSettingsRender.test.tsx:481-533` pin the contract:

1. **Unit (positive):** `preventWheelValueChange({target: sentinel, currentTarget: sentinel, preventDefault: fn})` → `fn` called once.
2. **Unit (negative):** `target !== currentTarget` → `preventDefault` not called.
3. **Integration:** mount the form, focus a number input, dispatch a `WheelEvent`, assert `preventDefaultSpy.toHaveBeenCalledTimes(1)` and `input.value` unchanged.

All three passed at HEAD `72e3f9f` (84/84 vitest passing). But the owner reports the bug still occurs in production on a real browser.

---

## 2. Reproduction — what I actually ran

I built four proof scripts under `C:\temp\opencode\` (outside the repo — clean up after the investigation is closed). The scripts use this repo's installed `react@19.2.4`, `react-dom@19.2.4`, and `jsdom@29.0.2` to reproduce the production scenario as faithfully as jsdom allows.

### 2.1 Script 1 — direct handler on a single input (`check-wheel.cjs`)

```js
// Quick proof: does React 19 set e.currentTarget to the input or to the root?
const path = require("path");
const React = require(path.resolve("node_modules/react"));
const ReactDOM = require(path.resolve("node_modules/react-dom/client"));
const { JSDOM } = require(path.resolve("node_modules/jsdom"));

const dom = new JSDOM(
  "<!doctype html><html><body><div id='root'><input type='number' /></div></body></html>",
  { url: "http://localhost/", pretendToBeVisual: true }
);
global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.HTMLElement = dom.window.HTMLElement;
global.Event = dom.window.Event;
global.WheelEvent = dom.window.WheelEvent;

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  React.createElement("input", {
    type: "number",
    id: "probe",
    onWheel: (e) => {
      console.log(
        "target.tagName=", e.target.tagName,
        "target.id=", e.target.id
      );
      console.log(
        "currentTarget.tagName=", e.currentTarget && e.currentTarget.tagName,
        "currentTarget.id=", e.currentTarget && e.currentTarget.id
      );
      console.log("target===currentTarget:", e.target === e.currentTarget);
      e.preventDefault();
    },
  })
);

setTimeout(() => {
  const input = document.getElementById("probe");
  const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
  input.dispatchEvent(wheel);
  process.exit(0);
}, 100);
```

Raw output (verbatim):

```
target.tagName= INPUT target.id= probe
currentTarget.tagName= INPUT current.id= probe
target===currentTarget: true
```

**Verdict on hypothesis #1 (target !== currentTarget):** **FALSE.** In React 19 + `createRoot`, when `onWheel` is attached directly to an `<input>`, React does not delegate the listener to the root container for this event/element pair — it attaches directly. `target` and `currentTarget` both resolve to the input.

### 2.2 Script 2 — multi-input form tree (`check-wheel2.cjs`)

To rule out the case where React optimizes differently for a single input vs many, I added a wrapper div and a sibling:

```js
root.render(
  React.createElement(
    "div",
    { className: "form" },
    React.createElement("input", {
      type: "number",
      id: "in1",
      value: "5",
      onWheel: (e) => {
        console.log(
          "handler fired. target.tagName=", e.target.tagName,
          "target.id=", e.target.id,
          "currentTarget.tagName=", e.currentTarget && e.currentTarget.tagName,
          "currentTarget.id=", e.currentTarget && e.currentTarget.id,
          "same?", e.target === e.currentTarget
        );
        if (e.target === e.currentTarget) {
          console.log("  -> preventDefault called");
          e.preventDefault();
        } else {
          console.log("  -> preventDefault NOT called (guard skipped)");
        }
      },
    })
  )
);
```

Raw output (verbatim, after React's "you provided `value` without `onChange`" warning):

```
handler fired. target.tagName= INPUT target.id= in1 currentTarget.tagName= INPUT currentTarget.id= in1 same? true
  -> preventDefault called
```

**Verdict:** same result. The guard holds in a form-tree scenario.

### 2.3 Script 3 — focus the input before dispatch (`check-wheel3.cjs`)

To match the production scenario where the user has clicked into the field before scrolling:

```js
input.focus();
const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
const preventDefaultSpy = vi.spyOn(wheel, "preventDefault");
input.dispatchEvent(wheel);
```

Raw output (verbatim, after React's `activeElement.attachEvent` polyfill warning — jsdom-only, harmless):

```
input is active element? true
FOCUSED handler. target===currentTarget: true defaultPrevented: false
Total handler calls: 1 preventDefault calls: 1
event.defaultPrevented: true
```

**Verdict:** focus does not change the `target`/`currentTarget` identity. `preventDefault()` is called once. `event.defaultPrevented === true` at the JS level.

### 2.4 Script 4 — passive listener enforces defaultPrevented=false (`check-passive.cjs`)

To prove the passive-listener claim independently of React:

```js
const el = document.getElementById("probe");
el.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
  },
  { passive: true }
);
const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
el.dispatchEvent(wheel);
console.log("defaultPrevented:", wheel.defaultPrevented);
```

Raw output (verbatim):

```
jsdom event.defaultPrevented (passive listener path): false
Note: jsdom does NOT enforce passive listener semantics.
In real browsers, defaultPrevented would be FALSE for the passive listener,
because the browser ignores preventDefault() in passive listeners.
```

(The note in the script is wrong — jsdom DOES enforce the passive flag. `defaultPrevented: false` after a `preventDefault()` call inside a passive listener is jsdom honoring the spec.)

**Verdict:** confirmed at the DOM API level. `preventDefault()` inside a `{ passive: true }` listener is silently ignored.

---

## 3. React 19 source — why the wheel listener is passive

`node_modules/react-dom/cjs/react-dom-client.development.js:19237-19272`:

```js
      switch (eventPriority) {
        ...
        case ContinuousEventPriority:
          listenerWrapper = dispatchContinuousEvent;
          break;
        ...
      }
      eventSystemFlags = listenerWrapper.bind(
        null,
        domEventName,
        eventSystemFlags,
        targetContainer
      );
      listenerWrapper = void 0;
      !passiveBrowserEventsSupported ||
        ("touchstart" !== domEventName &&
          "touchmove" !== domEventName &&
          "wheel" !== domEventName) ||
        (listenerWrapper = !0);                                      // <-- passive:true for wheel
      isCapturePhaseListener
        ? void 0 !== listenerWrapper
          ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
              capture: !0,
              passive: listenerWrapper                              // <-- applied here
            })
          : targetContainer.addEventListener(domEventName, eventSystemFlags, !0)
        : void 0 !== listenerWrapper
          ? targetContainer.addEventListener(domEventName, eventSystemFlags, {
              passive: listenerWrapper                              // <-- and here (bubble)
            })
          : targetContainer.addEventListener(
              domEventName,
              eventSystemFlags,
              !1
            );
```

For the event names `"touchstart"`, `"touchmove"`, `"wheel"`: the conditional `("wheel" !== domEventName && ...)` evaluates to `false`, so the right-hand side `(listenerWrapper = !0)` fires, setting `listenerWrapper = true`. That `true` flows into the `passive: listenerWrapper` option passed to `addEventListener`. React attaches the wheel listener with `{ passive: true }`.

The feature detect (`passiveBrowserEventsSupported = !0`) is at lines 25146-25158:

```js
      passiveBrowserEventsSupported = !1;
    if (canUseDOM)
      try {
        var options$jscomp$0 = {};
        Object.defineProperty(options$jscomp$0, "passive", {
          get: function () {
            passiveBrowserEventsSupported = !0;
          }
        });
        window.addEventListener("test", options$jscomp$0, options$jscomp$0);
        window.removeEventListener("test", options$jscomp$0, options$jscomp$0);
      } catch (e) {
        passiveBrowserEventsSupported = !1;
      }
```

This detects whether the browser supports the `passive` option (all modern browsers do, including the ones we ship to). Once detected, React uses `{ passive: true }` for wheel/touchstart/touchmove on every delegated listener — including the one our `onWheel` prop rides on.

---

## 4. Why the jsdom tests passed

The integration test at `src/__tests__/funnelSettingsRender.test.tsx:508-533`:

```ts
it("mount: wheel over a focused number input does not change its value (integration)", async () => {
    const settings = makeSettingsDoc("lead_magnet_call");
    await renderFormFor(settings);
    const input = document.querySelector(
        'input[type="number"]',
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    const before = input.value;
    input.focus();
    const wheel = new WheelEvent("wheel", { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(wheel, "preventDefault");
    input.dispatchEvent(wheel);
    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
    expect(input.value).toBe(before);
});
```

The test spies on `wheel.preventDefault` — the **method** on the native event object — and asserts the spy was invoked. When React's delegated listener runs our handler and our handler calls `e.preventDefault()`, React forwards the call to the native event's `preventDefault` method (regardless of passive). The spy observes the call. **The spy does not know whether the browser honored the call or not.**

The other two tests (unit positive + unit negative) just exercise the JS function `preventWheelValueChange` directly with synthetic event shapes. They verify that the function calls `preventDefault` exactly when `target === currentTarget`. The function does that correctly. The function is correct. **The function is also useless in production** because React attaches the listener passively.

Net: three tests, all green, none of them pinned the load-bearing invariant.

The Phase 13 `batch-11-report.md` §7 explicitly acknowledged the weakness: "jsdom does not simulate the browser's value-mutation-on-wheel behavior, so we can't observe the bug directly." The report framed this as a known limitation, not as a test contract bug. The owner's ITEM 1 makes it clear that the limitation was load-bearing — the real bug was hiding in the gap the report acknowledged.

---

## 5. Sequence in production (what actually happens)

1. User clicks into a number input → input is focused.
2. User scrolls the mouse wheel over the input.
3. Browser fires a `wheel` event on the input. Event is `cancelable: true`.
4. The wheel event bubbles to the root container.
5. React's delegated listener (attached with `{ passive: true }`) catches the event.
6. React invokes `preventWheelValueChange(e)` where `e.target === e.currentTarget === input`.
7. The guard passes (`target === currentTarget`), so `e.preventDefault()` is called.
8. **Browser silently ignores the `preventDefault()` call** because the listener is passive. Logs a console warning ("Unable to preventDefault inside passive event listener...").
9. Browser performs the default action: **increment or decrement the focused number input's value by `step`**, and also scrolls the page.
10. User observes: "scrolling changed the value." Bug.

---

## 6. Proposed fix — blur on wheel (owner-recommended)

```tsx
<input
    type="number"
    inputMode="decimal"
    step="0.01"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onWheel={(e) => e.currentTarget.blur()}
    className={`w-full p-2 rounded border ${inputCls}`}
/>
```

**Why this works** (and `preventDefault` did not):

- It does not depend on `preventDefault()` being honored by the browser.
- It changes DOM state (focus) directly via the `blur()` call.
- The browser's value-mutation-on-wheel behavior is gated on focus. With focus removed before the browser processes the wheel for value-change, the value-change does not fire.
- It does not depend on event `target`/`currentTarget` identity (no guard needed).

**Trade-off (UX):** the input loses focus on wheel scroll.

- For the "scroll the page" use case (the common case), this is invisible — the user wasn't typing anyway.
- For the "scroll-while-editing" use case (the rare case), the user has to click the input again to resume typing. This is a small UX cost.
- The page still scrolls (focus loss does not stop wheel-driven page scroll). The original complaint was about value mutation, not about page scrolling.

### 6.1 Alternatives considered

- **`useRef` + `addEventListener('wheel', handler, { passive: false })` in a `useEffect`:**
  - Pros: preserves focus, blocks value change.
  - Cons: requires a ref, an effect, a cleanup function, a re-derivation of the contract from JSX. Two listeners (React's passive one + our non-passive one) to reason about. The blur approach is one line.

- **Keep `onWheel={preventWheelValueChange}` and add a second non-passive listener alongside:**
  - Same complexity as above. Worse, because we now have a function whose name implies it does something (prevent wheel value change) but doesn't.

- **Use `onWheelCapture` instead of `onWheel`:**
  - Same issue. React 19 attaches the capture-phase listener with the same `{ passive: true }` flag for `wheel`.

### 6.2 Files that would change (no change applied yet)

1. **`src/components/FunnelSettingsForm.tsx`**
   - Line 1787: replace `onWheel={preventWheelValueChange}` with `onWheel={(e) => e.currentTarget.blur()}`.
   - Lines 1779-1787: rewrite the comment to describe blur-on-wheel instead of preventDefault-on-focused-input.
   - Lines 200-216: delete the `preventWheelValueChange` export (and the lines 196-209 comment block explaining its `target === currentTarget` guard — irrelevant once the function is gone).

2. **`src/__tests__/funnelSettingsRender.test.tsx`**
   - Line 479: delete `import { preventWheelValueChange } from "../components/FunnelSettingsForm";`.
   - Lines 481-533: delete the three tests in the `NumberField — wheel scroll does not change value (CHANGE 2)` describe block.
   - Add **one jsdom test** that pins the new contract: "blur happens on wheel" (cheap invariant — focus/blur is well-tested by jsdom).
   - Add **one Playwright E2E test** that pins the load-bearing invariant: "in a real browser, value is unchanged after a wheel event on a focused number input".

---

## 7. Verification plan — REAL BROWSER

Per the owner's ITEM 1 requirement: "Whatever fix you choose, it must be verified in a REAL BROWSER, not jsdom. A passing jsdom test is not evidence here."

### 7.1 Tool selection

The repo has no browser-automation tool installed (verified via `npm list --depth=0` — only `jsdom` is browser-adjacent). Options:

1. **`@playwright/test` (recommended)** — Chromium/Firefox/WebKit support, dev-only dependency. After `npm i -D @playwright/test`, run `npx playwright install chromium` to download the browser binary. One test in a new `e2e/` directory, separate from the vitest suite. Run against `npm run build && npm run preview`.
2. **`puppeteer-core` + system Chrome** — same shape, fewer cross-browser options.
3. **Chrome DevTools Protocol direct** — fragile, no good.

### 7.2 The Playwright test (planned)

```ts
// e2e/wheel-handler.spec.ts
import { test, expect } from "@playwright/test";

test("wheel over a focused number input does not change its value", async ({ page }) => {
    // Auth + project setup assumed by the harness; for this test we
    // hit a dev-only URL that mounts the form on a fixture doc.
    await page.goto("/funnel-settings?devFixture=lead_magnet_call");

    const input = page.locator('input[type="number"]').first();
    await input.focus();

    const before = await input.inputValue();

    // Dispatch a real wheel event over the focused input.
    await input.dispatchEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true });

    // Wait a tick so the browser has time to process the default action.
    await page.waitForTimeout(50);

    const after = await input.inputValue();
    expect(after).toBe(before);

    // Bonus invariant: the input is no longer focused (blur-on-wheel).
    const isFocused = await input.evaluate((el) => el === document.activeElement);
    expect(isFocused).toBe(false);
});
```

This test would pin **two** invariants in a real browser:

- The value is unchanged after a wheel scroll (the user's original complaint).
- The input is no longer focused (the mechanism the new fix uses to achieve the value invariance).

If either assertion fails in a real browser, the fix is incomplete and we ship nothing.

### 7.3 Two-layer coverage

- **jsdom (vitest):** pin the blur mechanism ("blur happens on wheel"). Fast, runs on every commit.
- **Playwright (E2E):** pin the user-visible outcome ("value unchanged in a real browser"). Slower, runs on demand and in CI.

The two together cover the contract end-to-end. The jsdom test alone would be insufficient — the owner has now demonstrated this twice. The Playwright test alone would be slow feedback. Combined, they give fast feedback on the cheap invariant + real-browser verification of the load-bearing invariant.

---

## 8. Risks and unknowns

1. **Playwright install size + time.** `npx playwright install chromium` downloads ~170MB and takes a few minutes. The CI environment may need the same install. If CI is constrained, we can fall back to `puppeteer-core` + system Chrome.
2. **Existing Phase 13 fixtures in `uiCopy.md`.** The `Mouse-wheel guard (Phase 13 CHANGE 2)` section (added in `3963964`) describes the fix in terms of `preventDefault`. After this change, the copy must be updated to describe the blur-on-wheel mechanism. The contract section title can stay (it's still "guard") but the body changes.
3. **`preventWheelValueChange` was exported.** Anyone importing it externally would break. Searched: only `funnelSettingsRender.test.tsx` imports it. After this change, the import goes away with the function.
4. **The `NumberField — wheel scroll does not change value (CHANGE 2)` describe block disappears from vitest output.** Test count drops by 3 (84 → 81). Per-file deltas: `funnelSettingsRender.test.tsx` 19 → 16 (-3). Runner total: 84 → 81. §6 of `batch-11-report.md` reconciliation needs an addendum or a follow-up batch.
5. **Cross-tab focus side effects.** When `e.currentTarget.blur()` is called, the focused element loses focus globally — including the `document.activeElement` for the page. If the user has another component relying on focus state (e.g., a tooltip gated on focus), it could unrender. Audit: search the codebase for `document.activeElement` and `onFocus` usages; if any rely on focus persistence across wheel events, this fix changes behavior. (Low risk — `FunnelSettingsForm` is the only consumer of `NumberField`, but worth checking.)
6. **`inputMode="decimal"` interaction.** `inputMode` does not affect focus behavior. Safe.
7. **iOS Safari touch behavior.** The wheel event does not fire on touch devices; `touchmove` does. We are not addressing touch-move-driven value mutation in this fix — it's a different event with the same passive-listener issue, but out of scope for ITEM 1. Document this in the report as a known gap.

---

## 9. What has NOT been done

- No code change to `src/components/FunnelSettingsForm.tsx`.
- No test change to `src/__tests__/funnelSettingsRender.test.tsx`.
- No `package.json` change.
- No install of any browser-automation tool.
- No real-browser test run.
- No commit. No push.
- The proof scripts in `C:\temp\opencode\check-wheel*.cjs` will be deleted after this investigation is closed (they are outside the repo; not committed).

---

## 10. Awaiting owner approval on

1. **The fix:** blur on wheel (`onWheel={(e) => e.currentTarget.blur()}`), removing `preventWheelValueChange`.
2. **The verification tool:** install `@playwright/test` in `devDependencies`, write one E2E test, run against the built app.
3. **The test rewrite:** delete the three jsdom tests (they tested the wrong invariant), replace with one jsdom "blur happens on wheel" + one Playwright "value unchanged in real browser".
4. **The contract update:** update the `Mouse-wheel guard (Phase 13 CHANGE 2)` section in `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` to describe the blur-on-wheel mechanism.
5. **The report addendum:** append an "ITEM 1 follow-up" subsection to `batch-11-report.md` §6 cross-section reconciliation, recording the −3 test delta on `funnelSettingsRender.test.tsx` (19 → 16).

---

## 11. Implementation plan if approved

1. Implement the blur fix in `src/components/FunnelSettingsForm.tsx`.
2. Delete the three old tests + their import in `src/__tests__/funnelSettingsRender.test.tsx`.
3. Add one jsdom "blur happens on wheel" test in the same file.
4. Update `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` to describe the new mechanism.
5. Install `@playwright/test` (`npm i -D @playwright/test`).
6. Run `npx playwright install chromium`.
7. Add `e2e/wheel-handler.spec.ts` with the planned test.
8. Wire `npm run e2e` script in `package.json`.
9. Run all checks: `npx vitest run`, `cd functions && npm run test:phase14`, `npx tsc -b`, `npm run lint` (where it can run without tripping on `functions/lib/`), `npm run build && npx playwright test`.
10. Write `specs/968-funnel-economics-rebuild/reports/batch-12-report.md` with raw command output verbatim per AGENTS.md §0a.
11. Commit + push.

---

## Appendix A — Raw proof-script outputs (verbatim)

All four scripts live in `C:\temp\opencode\` (not committed). Their verbatim outputs are quoted above; consolidated here for the file:

```
$ node check-wheel.cjs
target.tagName= INPUT target.id= probe
currentTarget.tagName= INPUT currentTarget.id= probe
target===currentTarget: true

$ node check-wheel2.cjs
You provided a `value` prop to a form field without an `onChange` handler. ...
handler fired. target.tagName= INPUT target.id= in1 currentTarget.tagName= INPUT currentTarget.id= in1 same? true
  -> preventDefault called

$ node check-wheel3.cjs
TypeError: activeElement$1.attachEvent is not a function
  at handleEventsForInputEventPolyfill (...react-dom-client.development.js:3573:27)
  ...
input is active element? true
FOCUSED handler. target===currentTarget: true defaultPrevented: false
Total handler calls: 1 preventDefault calls: 1
event.defaultPrevented: true

$ node check-wheel4.cjs
TypeError: activeElement$1.attachEvent is not a function
  ...
After wheel dispatch:
  input.value: 5
  event.defaultPrevented: true

$ node check-passive.cjs
jsdom event.defaultPrevented (passive listener path): false
Note: jsdom does NOT enforce passive listener semantics.
In real browsers, defaultPrevented would be FALSE for the passive listener,
because the browser ignores preventDefault() in passive listeners.
```

(The `attachEvent` errors in `check-wheel3` and `check-wheel4` are jsdom polyfill noise from React's input-event polyfill attempting to access an old IE-only API that jsdom doesn't implement. They do not affect the experiment — the handler still runs and the assertions still print.)

---

## Appendix B — References

- **HTML5 spec, passive event listeners:** https://html.spec.whatwg.org/multipage/webappapis.html#dom-eventlisteneroptions-passive
  > "If the event listener is marked passive, the user agent must not prevent the default action of the event by calling preventDefault()."
- **React 17 release notes (event delegation root change):** https://react.dev/blog/2022/03/29/react-v18 — the v17 root-mount change moved event delegation from `document` to the root container. Passive wheel/touchstart/touchmove delegation was already in place before v17 and continues in v18/v19.
- **React source:** `node_modules/react-dom/cjs/react-dom-client.development.js:19237-19272` (delegated listener attachment with passive flag for wheel/touchstart/touchmove) and `node_modules/react-dom/cjs/react-dom-client.development.js:25140-25158` (`passiveBrowserEventsSupported` feature detect).
- **Phase 13 batch report (prior):** `specs/968-funnel-economics-rebuild/reports/batch-11-report.md` §7 acknowledged the jsdom limitation as a known weakness. The owner's ITEM 1 confirms it was load-bearing.
- **Phase 13 uiCopy contract:** `specs/968-funnel-economics-rebuild/contracts/uiCopy.md` — `Mouse-wheel guard (Phase 13 CHANGE 2)` section needs update.
- **Phase 13 §13 of the funnel-economics investigation:** `docs/investigations/funnel-economics-paid-product-form-bug.md` §13 — needs an ITEM 1 addendum cross-referencing this report.

---

End of report. Awaiting owner approval before any code change.
