# Phase 0 — Research: HOTFIX-F Deterministic Aspect Ratio Reflow

**Date**: 2026-04-25
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Open questions resolved during /speckit.specify and /speckit.clarify

The 7 + 4 clarifications captured in `spec.md` § Clarifications already resolved every spec-level NEEDS-CLARIFICATION. Phase 0's job is to nail the implementation choices that the spec deliberately deferred to plan.

## R1 — Outpaint engine: Sharp-extend vs. model-driven

### Decision

**Sharp-based pure margin extension.** Use `sharp.extend({ top, bottom, left, right, background, extendWith })` with `extendWith: 'mirror'` for the outer-margin pixels and an explicit transparent/edge-clamp blend at the lock boundary. The engine never re-encodes the locked decoded pixel buffer; it only allocates new pixels in the outer 30 % margin region.

### Rationale

- **The byte-identical contract from FR-008 is non-negotiable.** A model-driven outpaint engine cannot guarantee zero drift inside the locked region even with a perfect mask, because almost all current outpaint models output lossy formats and treat the mask as a soft hint rather than a hard barrier. Sharp's `extend()` pipeline allocates new pixels by definition — the source pixel buffer is copied verbatim and only the new margin pixels are filled. Verification is then trivial.
- **The codebase already operates Sharp at production scale.** `offerOverlay.ts:8-13`, `textCompositing.ts`, and `logoComposite.ts:16-28` all load Sharp via the same lazy-import pattern (`getSharp()`) with the same fallback warning. Adding a fourth Sharp-using module follows the established convention.
- **Latency.** Sharp `extend()` on a 1024×1024 PNG completes in well under 1 s on the existing function memory profile (2 GiB). No Gemini round-trip, no model rate limiting, no token spend. This is the spec's `< 3 s` operational target with substantial headroom.
- **Cost.** Outpaint with no Gemini call is essentially free at the inference layer; the credit charge (FR-017: less than a fresh generation) is a product-pricing decision, not an engine-cost decision.

### Alternatives considered

- **Gemini outpaint via a `REFLOW_OUTPAINT` prompt** — rejected. Same family of failure modes that motivates this hotfix in the first place: lossy output, drift across the lock, no byte-identity guarantee. Would force the verification step (FR-008) to fail-closed on most runs and trigger the rerender fallback (FR-014), making the outpaint route effectively dead.
- **fal.ai FLUX inpaint with a "preserve mask" instruction** — rejected. Same lossy-output and soft-mask issues; also adds a third-party dependency the reflow path doesn't otherwise need.
- **A dedicated outpaint model that returns raw pixel diffs** — none available within the existing infra. Out of scope.

### What "extend" actually does in Sharp (implementation note for tasks phase)

Given a source `(srcW, srcH)` PNG and a target ratio, compute the new canvas `(dstW, dstH)` such that the source is centered and its locked center 70 % falls within the new canvas. Specifically:
1. Decide which dimension is preserved: when target is taller than source (e.g. 1:1 → 4:5), preserve `srcW` and grow `dstH = srcW / targetRatio`. When target is wider, preserve `srcH` and grow `dstW = srcH × targetRatio`.
2. Compute symmetric padding: `top = bottom = (dstH - srcH) / 2`, `left = right = (dstW - srcW) / 2`.
3. Call `sharp(srcBuf).extend({ top, bottom, left, right, extendWith: 'mirror' }).png().toBuffer()`. Mirror produces seamless background continuation in the typical case (sky, gradient, blurred environment); for visually-busy edges the user can override to Fresh render via the FR-023 selector.
4. Verification (FR-008): re-load the source and the extended buffer, decode both with `sharp(...).raw().toBuffer()`, compare the rectangle `[srcX, srcY, srcW, srcH]` of the extended buffer against the source's full rectangle byte-for-byte. Sharp's `extend` guarantees the source rectangle is unmodified, so this verification effectively confirms no upstream-Sharp regression.

## R2 — Symmetric fold-change formula derivation

### Decision

`magnitude = max(target / current, current / target) − 1`, where `current` and `target` are each the ratio's `width / height` numeric value. Direction-symmetric: `magnitude(A → B) === magnitude(B → A)`.

### Rationale

- The original `|target − current| / current` formula in /speckit.clarify Q1 was direction-asymmetric: 1:1 → 4:5 = 20 %, but 4:5 → 1:1 = 25 %. The same canvas-shape change yielding two different magnitudes is a defect, not a feature.
- More critically, the original formula returned **29.7 %** for the launch matrix's headline failure case (4:5 → 9:16) — *just under* the 30 % threshold — which would route the headline failure to outpaint and ship the unfixed bug. The fold-change formula returns **42.2 %** for the same case, comfortably above 30 %, routing to rerender as required.
- Fold-change is the standard mathematical convention for "how many times bigger one number is than another," used in ratio comparison across image processing and statistics.

### Worked table for all 15 ordered pairs of the six supported ratios

| Source → Target | source W/H | target W/H | fold-change | Route |
|---|---|---|---|---|
| 1:1 ↔ 4:5 | 1.000 | 0.800 | 25.0 % | outpaint |
| 1:1 ↔ 3:4 | 1.000 | 0.750 | 33.3 % | rerender |
| 1:1 ↔ 4:3 | 1.000 | 1.333 | 33.3 % | rerender |
| 1:1 ↔ 9:16 | 1.000 | 0.5625 | 77.8 % | rerender |
| 1:1 ↔ 16:9 | 1.000 | 1.778 | 77.8 % | rerender |
| 4:5 ↔ 3:4 | 0.800 | 0.750 | 6.67 % | outpaint |
| 4:5 ↔ 4:3 | 0.800 | 1.333 | 66.7 % | rerender |
| 4:5 ↔ 9:16 | 0.800 | 0.5625 | 42.2 % | rerender |
| 4:5 ↔ 16:9 | 0.800 | 1.778 | 122.2 % | rerender |
| 3:4 ↔ 4:3 | 0.750 | 1.333 | 77.8 % | rerender |
| 3:4 ↔ 9:16 | 0.750 | 0.5625 | 33.3 % | rerender |
| 3:4 ↔ 16:9 | 0.750 | 1.778 | 137.0 % | rerender |
| 4:3 ↔ 9:16 | 1.333 | 0.5625 | 137.0 % | rerender |
| 4:3 ↔ 16:9 | 1.333 | 1.778 | 33.3 % | rerender |
| 9:16 ↔ 16:9 | 0.5625 | 1.778 | 216.0 % | rerender |

**Outpaint pairs (3 ordered, 3 unordered):** 1:1↔4:5, 4:5↔3:4 only. All other combinations rerender. This is consistent with the launch-matrix expectation that "small canvas-shape changes" are the rare set, not the common one.

### Alternatives considered

- `|log(target / current)|` (natural-log fold) — symmetric, but non-intuitive: 4:5 ↔ 9:16 = 35.2 %, just barely over 30 %, leaving the headline case uncomfortably close to the boundary. Fold-change gives the headline case more headroom (42.2 %).
- Lower the threshold to `<25 %` and keep the asymmetric formula — rejected. Doesn't fix the asymmetry, and 4:5 ↔ 1:1 lands at 25 % which is right on the boundary; the routing decision becomes a tie-breaker question.

## R3 — Locked-region geometry across all outpaint pairs

### Decision

For all 6 outpaint-eligible ordered pairs (1:1↔4:5 in both directions, 4:5↔3:4 in both directions), the source's locked center 70 % rectangle fits within the target canvas. Verified analytically:

| Pair | Source dims (1024-base) | Locked rect (70%) | Target dims | Fits? |
|---|---|---|---|---|
| 1:1 → 4:5 | 1024×1024 | 716.8×716.8 | 1024×1280 | YES (inset 153/281) |
| 4:5 → 1:1 | 1024×1280 | 716.8×896 | 1024×1024 (crop) | locked W < 1024 ✓; locked H 896 < 1024 ✓ |
| 4:5 → 3:4 | 1024×1280 | 716.8×896 | 1024×1365 | YES |
| 3:4 → 4:5 | 1024×1365 | 716.8×955.5 | 1024×1280 (crop) | locked H 955.5 < 1280 ✓ |

**No outpaint pair triggers a "locked region exceeds target canvas" geometry conflict.** This is a consequence of the 30 % threshold being correctly chosen. Reverse pairs that would be problematic (e.g. 4:3 → 1:1, source 1024×768, locked 716.8×537.6, target 1024×1024 — would still fit, but this pair routes to rerender at 33.3 % so the geometry check is moot anyway) all fall above the threshold.

### Implementation note

The Sharp implementation does not need to compute the lock rectangle explicitly — `extend()` adds new pixels around the source verbatim. The 70 % locked-center contract is a *post-hoc verification* on the output, not a planning input. The verification check (FR-008) reads the corresponding 70 % rectangle from both the source and the extended buffer and compares byte-for-byte.

## R4 — Fallback chain failure modes (unhappy paths matrix)

| Path triggered | Source state | Engine outcome | Fallback action | Final method recorded |
|---|---|---|---|---|
| Outpaint chosen by router | Source has plan | Outpaint throws | Fallback to rerender (FR-014) | `rerender` (with `fallbackFrom: 'outpaint'`) |
| Outpaint chosen by router | Source has plan | Outpaint succeeds, drift detected | Reject + fallback to rerender (FR-014) | `rerender` (with `fallbackFrom: 'outpaint'`, `fallbackReason: 'drift'`) |
| Rerender chosen by router | Source has plan | Rerender throws (Gemini outage) | Surface error to user (FR-016) | error (no method delivered) |
| Rerender chosen by router | **Plan missing** | Rerender throws (no plan) | Fallback to outpaint (FR-015) | `outpaint` (with `fallbackFrom: 'rerender'`, `fallbackReason: 'no_plan'`) |
| Outpaint chosen by router | **Plan missing** AND outpaint fails | Both routes fail | Surface clear error: "record predates plan persistence" (FR-015) | error |
| User override = `outpaint` | Source has plan | Outpaint throws | NO fallback (override preserved). Surface error to user. | error |
| User override = `rerender` | Source has plan | Rerender throws | NO fallback (override preserved). Surface error to user. | error |

### Decision

When the user explicitly overrides the auto-router (Quick or Fresh), failures **do not fall back** to the other route — the user picked a route, the system honors it, and on failure surfaces the error. This is consistent with Principle II (Selected Mode MUST Be Obeyed). When the auto-router picked the route, the fallback chain in FR-014 / FR-015 applies.

This is one piece of detail not explicit in the spec. It is captured here as a Phase-0 decision and will be reflected in the `reflowImage` callable contract (Phase 1) and tasks (Phase 2). Spec FR-014 says "If the outpaint route fails…the system MUST automatically fall back" — it does not condition this on the user-override flag, so this decision is a tightening: only the auto-routed runs fall back.

### Rationale

- A user who explicitly picks Quick has accepted "the framing risk" per User Story 3 — falling back to Fresh would charge them more than they expected and silently overrule their choice.
- A user who explicitly picks Fresh has accepted the cost — falling back to Quick would silently downgrade their result quality.
- Both directions of override-then-fallback violate Principle VII ("No Silent Override Without Rule, Signal, and Trace") — a fallback would happen without the user signaling consent to the alternate route.

### Recorded clarification

This decision is appended to spec § Clarifications during /speckit.tasks if downstream ambiguity surfaces; for now it lives here as the canonical interpretation.

## R5 — Concurrency on multi-item reflow

### Decision

Per-item reflows execute via `Promise.allSettled` with a concurrency cap of **5 in-flight items**. The cap is implemented with a simple sliding-window scheduler in `reflowImage.ts` (no library — same pattern as existing batch generation in `generators.ts`).

### Rationale

- A 10-slide carousel reflow at 1:1 → 9:16 (all rerender) without a cap would issue 10 concurrent Gemini calls, blowing through the per-account image-generation rate limit and producing a wave of `rate_limited` errors.
- Existing batch generation already uses a similar concurrency pattern (verified by the code reading `batchResults` updates per item in `generators.ts:3911-3925`).
- 5 concurrent is conservative; can be tuned at task implementation time if profiling shows headroom.

### Alternatives considered

- Sequential (cap = 1) — too slow on a 10-slide carousel (10 × 30 s = 5 minutes user-visible).
- Unbounded — rate-limit risk as above.

## R6 — User-override × failure: explicit policy on the callable

### Decision

The `reflowImage` callable receives an explicit `method: 'auto' | 'outpaint' | 'rerender'` parameter. When `method === 'auto'`, the fallback chain (FR-014, FR-015) applies. When `method === 'outpaint'` or `method === 'rerender'`, no fallback is attempted; failures are surfaced as `HttpsError` to the user.

### Rationale

See R4 — covered by the same reasoning. Captured here as the contract-level decision the Phase-1 contract document will encode.

## R7 — `mockupHistory` append vs. write — concurrency on the source generation document

### Decision

Use Firestore `arrayUnion` (or read-modify-write in a transaction) to append `{ url, ratio }` to `mockupHistory` and to append the new `ReflowHistoryEntry` to `resolutionTrace.reflowHistory[]`. Two concurrent reflows on the same source generation MUST both land their entries; neither MUST overwrite the other.

### Rationale

- The user can theoretically click Resize twice in quick succession at different target ratios (the spec edge case "concurrency: the user clicks Resize twice in quick succession at two different target ratios" addresses this for the user-facing UX, but the data layer still needs to be correct in case both calls reach the backend before either short-circuits).
- A naïve `set({ mockupHistory: [...current, newEntry] }, { merge: true })` reads stale data and overwrites the other call's append.
- `arrayUnion` is idempotent for unique values (URLs and ratio combos are unique enough); for the trace `reflowHistory`, a transaction with read-then-write is safer because each entry contains a timestamp and a method record that's not idempotent.

### Implementation note

`reflowImage.ts` performs the append inside a Firestore transaction that reads the current `generations/{genId}` doc, appends to both arrays in memory, and writes back. The transaction retries on contention, ensuring no append is lost.

## R8 — Frontend selector layout

### Decision

The Step 4 Resize control receives a small inline three-radio group **above** the existing per-ratio buttons. Default = Auto. The group is collapsed (hidden as "Method: Auto" with an "Edit" toggle) by default to preserve current visual density; clicking the toggle reveals the three radios. Multi-item reflow shows per-item progress in the existing `mockupHistory` strip (Phase 17 pattern) with a small per-item status badge (`pending` / `outpainting` / `rerendering` / `done` / `error`).

### Rationale

- Existing Step 4 layout (verified in `App.tsx:6212-6260`) is dense; injecting three always-visible radios would crowd the ratio buttons.
- The Auto default + collapsed selector keeps the current single-click reflow UX intact for users who don't need the override.
- Per-item status badges reuse the existing `mockupHistory` rendering loop (App.tsx:6810+); no new component required.

### Alternatives considered

- A modal dialog confirming the route + cost before commit — rejected as per the /speckit.clarify discussion (no pre-action cost preview, inherits Phase 17 behavior).
- A dropdown — rejected; less discoverable than radios for a 3-option choice.

## R9 — Test plumbing for fixture-level Sharp invocation

### Decision

Tests for outpaint use a **fixture PNG** committed to the repo (e.g., `functions/src/__tests__/__fixtures__/reflow-source-1x1.png`) and assert byte-identity on the locked rectangle by reading the test fixture and the Sharp output as raw RGBA buffers and comparing the inset rectangle. Tests for rerender stub `generateFinalAd` to return a deterministic image and assert the `aspectRatio` field is swapped before the call.

### Rationale

- The launch-matrix HFF.6 specifies four test cases ((a)–(d)). Following the existing `contractFixtures.test.ts` pattern of explicit fixture inputs and outputs makes these reproducible.
- Stubbing `generateFinalAd` keeps the rerender tests fast (no real Gemini call) while still verifying the contract (plan loaded, aspectRatio swapped, callable invoked).

## NEEDS CLARIFICATION items remaining

**None.** Spec is fully clarified; Phase 0 has resolved every implementation choice that the spec deferred.
