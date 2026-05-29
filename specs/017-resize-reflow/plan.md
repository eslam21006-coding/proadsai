# Implementation Plan: Phase 17 — Resize & Reflow

**Branch**: `017-resize-reflow` | **Date**: 2026-05-29 | **Spec**: [./spec.md](./spec.md)
**Input**: Feature specification from `D:\proads-worktrees\017-resize-reflow\specs\017-resize-reflow\spec.md`

## Summary

Bring the user-visible Resize experience and the underlying persistence model into alignment with the finalized spec, on top of the existing HOTFIX-F deterministic two-route reflow engine (`functions/src/reflowImage.ts`, `reflowRouter.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`).

The shipped HOTFIX-F engine routes internally between outpaint (Sharp margin extension, <30% magnitude) and re-render (full pipeline at the new ratio, ≥30% magnitude). Phase 17 ships **eight deltas** that turn this engine into the spec-defined surface:

User-visible deltas (frontend, `src/App.tsx` Step 4 + supporting components):

1. **All 6 supported ratios** in the Resize popover (`1:1`, `4:5`, `3:4`, `4:3`, `9:16`, `16:9`) — the current popover hides `3:4` / `4:3` / `16:9` and gates plan tiers. Per FR-001 + FR-008a, all 6 must be available on every paid plan.
2. **Method selector REMOVED.** Per FR-011 + Assumptions, "method selection is never exposed to the user." The shipped HOTFIX-F UI (`src/App.tsx:7343-7363` — `showMethodSelector` / Auto / Quick / Fresh dropdown) is deleted. The `reflowMethod` state is hard-pinned to `'auto'` (backend auto-routes silently).
3. **Scope selector** for batch and carousel results — "Resize this image" / "Resize all N images" (batch); "Resize this slide" / "Resize all N slides" (carousel). Single-ad results skip the selector.
4. **Free CSS preview** rendered with `object-fit: cover` before any credits are committed, labeled as a preview and followed by a **"Generate Resize — X credit(s)"** confirm button. Preview costs zero credits, renders within 1 s.

Data-layer deltas (backend, `functions/src/`):

5. **Unified cost.** FR-006 says one resize = one generation credit cost. `CREDIT_COSTS.reflowImage = 5` already equals `CREDIT_COSTS.generateImage = 5` in `src/planconfig.ts`. **One change: bump `OUTPAINT_CREDIT_COST` from 2 → 5** (in `functions/src/reflowOutpaint.ts:32`). Both routes now charge a flat 5 credits per successfully delivered image. Failed items still charge 0 (FR-006 + FR-019).
6. **Ratio-only chip storage.** FR-017a: chip key is the aspect ratio alone, max 6 chips per generation. Replace the current `mockupHistory.arrayUnion({ url, ratio })` write path in `reflowImage.ts:504-507` with a transactional `(ratio)`-keyed upsert into a new `variantChips: VariantChip[]` field. Existing chip at the same ratio is overwritten on collision.
7. **`getSafeZoneForRatio()`** exported from `layoutContract.ts` returning `{ top, right, bottom, left }` percentage insets per the spec's published table. Throws on unknown ratio.
8. **Text re-composition + overflow handling on re-render outputs only.** FR-011 + FR-012: when the router selects the re-render path, the new pipeline calls `compositeArabicText()` (or its non-Arabic peer) with the new ratio's safe zone insets. If text overflows, font reduces 10% per step (max 3 reductions). `textReflowOverflow: true` is logged to `resolutionTrace`. The outpaint path preserves text via the locked center 70% — no re-composition there.

Additional alignment items:

9. **Brand-color reinforcement.** FR-010: `reflowRerender.ts` reads `inputs.brandColorPrimary` / `inputs.brandColorSecondary` from the source generation and injects a `BRAND COLOR LOCK` block into the re-render prompt. Skipped silently when absent. `resolutionTrace.brandColorReinforced` rolled up.
10. **No chaining.** FR-018: source is always `genData.output.imageUrl`. Remove the `|| mockupHistory[last].url` fallback in `reflowImage.ts:139-142`. Legacy generations without `output.imageUrl` reject with `failed-precondition: 'legacy_no_original'`.
11. **Callable `method` parameter de-publicized.** FR-011 says method is never exposed to the user. The callable's `method` field becomes server-internal (still accepted by the runtime for unit tests; frontend always sends `'auto'`). Documented in contracts/.

## Technical Context

**Language/Version**: TypeScript 5.7 (Firebase Cloud Functions v2), TypeScript 5.9 (Vite frontend)
**Primary Dependencies**: Firebase Functions v2, Firebase Admin SDK, Sharp `^0.33.5` (already installed; same engine as `reflowOutpaint.ts` / `offerOverlay.ts` / `textCompositing.ts`), Gemini 3.5 Flash (text + image — invoked only from the existing `reflowRerender.ts`; no new model calls), React 19, Zustand 4, Tailwind CSS 3, Vite 7.
**Storage**: Firestore — `generations/{genId}` (extended additively: new `variantChips: VariantChip[]` field; `resolutionTrace.brandColorReinforced` and `resolutionTrace.textReflowOverflow` rollup flags); `users/{uid}` (existing credits ledger — unchanged read/write path).
**Testing**: Vitest (already configured per `functions/src/__tests__/`). Phase 17 adds fixture coverage in `functions/src/__tests__/contractFixtures.test.ts` per FR-022 / 17.10 of the original spec brief, plus a parametric router-matrix test covering all 30 non-identity ratio pairs.
**Target Platform**: Web app — backend on Google Cloud Run (Firebase Functions v2), frontend served by Firebase Hosting. Production traffic is Arabic-first (Egypt, Gulf, Levant) plus English secondary market.
**Project Type**: Web application — Vite/React frontend (`src/`) + Firebase Functions backend (`functions/src/`).
**Performance Goals**:
- SC-001 — single-ad resize end-to-end ≤30 s (preview → confirm → render → text composite).
- SC-002 — batch resize wait ≤4× single-ad wait for typical (≤4) batch sizes; 5-concurrent cap bounds the wave size.
- SC-006 — CSS preview renders within 1 s in 95% of clicks (client-only, no API call).
**Constraints**:
- Firestore single-document size limit (1 MB) — addressed by FR-017a chip cap (≤6 chips × ~250 bytes ≈ ≤2 KB worst case).
- Gemini API rate limits — 5-concurrent reflow cap (matches existing HOTFIX-F router cap, already implemented in `reflowImage.ts:runWithConcurrency`).
- No new Gemini model calls beyond what the existing `reflowRerender.ts` issues.
- Arabic ad copy is reused verbatim on reflow (Clarifications Q3) — no re-call of compliance scan or LLM.
**Scale/Scope**:
- 6 supported aspect ratios; up to 6 variant chips per parent generation.
- Single resize action processes 1..N items (1 for single / carousel_slide; 1..N for batch_all / carousel_all). N ≤ 36 for Scale-tier batch, ≤ 10 for Scale-tier carousel.
- Frontend touch: `src/App.tsx` Step 4 output area + new `src/components/ReflowPreview.tsx` + i18n strings in `src/i18n/`. The shipped method-selector dropdown block is deleted.
- Backend touch: 5 existing files modified (`reflowImage.ts`, `reflowOutpaint.ts`, `reflowRerender.ts`, `layoutContract.ts`, `textCompositing.ts`), 0 new TypeScript modules.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Verdict | Justification |
|---|---|---|
| I. Reliability Over Feature Count | ✅ Pass | Closes UX gaps on an existing surface; removes the method-selector cliff (no user has to choose between Auto/Quick/Fresh — the backend decides). Reduces surface area, increases predictability. |
| II. Selected Mode MUST Be Obeyed | ✅ Pass | FR-009 mandates output aspect ratio matches the user's target selection; existing router preserves this. |
| III. Launch Surface Frozen | ✅ Pass | 6 ratios remain the launch contract; FR-001 surfaces all 6 in the UI where currently only 3 are exposed. |
| IV. Behavior Contracts | ✅ Pass | 23 FRs + 8 SCs + 8 edge cases + 5 fixture tests (T011/T012/T019/T022/T010) cover all paths. |
| V. Arabic Quality First-Class | ✅ Pass | Clarifications Q3: RTL-aware `compositeArabicText()` reused on re-render outputs. Arabic copy preserved verbatim (no compliance re-scan). Quickstart includes an Arabic carousel scenario. |
| VI. Hidden Machine Layers Auditable | ✅ Pass | FR-020 mandates trace fields. `reflowHistory[]` (existing) plus new `brandColorReinforced` / `textReflowOverflow` flags + per-entry `method` field (internal, not surfaced to user) make every silent route choice auditable. |
| VII. No Silent Override Without Rule, Signal, Trace | ✅ Pass | The "backend auto-routes silently" rule from FR-011 is *defined* in the spec (rule), the trace records the chosen route (signal + trace), and the fallback paths are logged via `reflowHistory[].fallbackFrom` / `fallbackReason`. Principle VII satisfied. |
| VIII. Cost Discipline | ✅ Pass | 5-concurrent cap, same-ratio no-op short-circuit (FR-021), partial-success semantics with refunds for failed items, preview costs 0 credits. No retry storms. |
| IX. Proof Required for Fix | ✅ Pass | 5 fixture tests + parametric matrix test + quickstart scenarios cover acceptance. |
| X. Spec Before Code | ✅ Pass | This plan is generated from the finalized spec. Plan/code now lag; tasks bring them into alignment. |
| XI. Frontend / Backend Agree on Truth | ✅ Pass | Plan mandates BOTH the frontend method-selector UI removal AND the backend public `method` field deprecation. Cost constants synced (one `OUTPAINT_CREDIT_COST` constant bump). All 6 ratios available on both layers (FR-008a + no backend plan-gate, verified by T002a). |
| XII. Deferred Scope Stays Deferred | ✅ Pass | Retargeting-mode reflow + custom ratios explicitly out of scope. Method-selector surface is *removed*, not added. |

**Gate verdict: PASS — no violations, Complexity Tracking intentionally empty.** Proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/017-resize-reflow/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Finalized feature spec (clarified, internally consistent)
├── research.md          # Phase 0 output — 6 planning decisions
├── data-model.md        # Phase 1 output — VariantChip (ratio-only), ResolutionTrace extensions, SafeZoneInsetsPct
├── quickstart.md        # Phase 1 output — 5 manual smoke-test scenarios + acceptance checklist
├── contracts/           # Phase 1 output
│   ├── reflowImage.callable.md      # Updated — method param marked internal/default-auto, ratio-only chip persistence
│   └── getSafeZoneForRatio.md       # New pure-function contract (FR-013)
├── checklists/
│   └── requirements.md  # Already created by /speckit.specify
└── tasks.md             # Will be regenerated by /speckit.tasks
```

### Source Code (repository root)

```text
functions/                          # Firebase Cloud Functions v2 backend (TS 5.7)
├── src/
│   ├── reflowImage.ts               # MODIFY — ratio-only chip upsert (FR-017a); drop mockupHistory[last] fallback (FR-018); resolutionTrace rollup flags; method param now defaults to 'auto'
│   ├── reflowRouter.ts              # UNCHANGED — auto-router already correct
│   ├── reflowOutpaint.ts            # MODIFY — `OUTPAINT_CREDIT_COST` 2 → 5 (FR-006 unified cost)
│   ├── reflowRerender.ts            # MODIFY — accept + inject brand-color reinforcement block; call compositeArabicText with new ratio safe zone; return brandColorReinforced flag
│   ├── layoutContract.ts            # MODIFY — export getSafeZoneForRatio(ratio) per FR-013
│   ├── textCompositing.ts           # MODIFY — 3-step font-size reduction + textReflowOverflow trace flag (re-render path only)
│   ├── types.ts                     # MODIFY — VariantChip interface (ratio + url + generatedAt + optional cleanReflowedImageUrl); extend ReflowHistoryEntry with brandColorReinforced / textReflowOverflow / textReductionSteps
│   ├── index.ts                     # UNCHANGED — reflowImage callable already exported
│   └── __tests__/
│       └── contractFixtures.test.ts # MODIFY — add 5 Phase 17 fixtures + parametric matrix test

src/                                  # React 19 + Vite 7 + Tailwind 3 frontend (TS 5.9)
├── App.tsx                          # MODIFY — Step 4 output area:
│                                    #   (a) expand popover ratios from 3 → 6 (FR-001)
│                                    #   (b) remove canUseRatio plan-tier check (FR-008a)
│                                    #   (c) DELETE method-selector UI block at App.tsx:7343-7363 (FR-011 + Assumptions)
│                                    #   (d) hard-pin reflowMethod state to 'auto'
│                                    #   (e) add scope selector for batch / carousel results (FR-002)
│                                    #   (f) add CSS preview + Generate Resize confirm step (FR-003..FR-005)
│                                    #   (g) variant-chip switcher per FR-017 (one card, ≤6 chips, ratio-labeled only)
├── components/
│   └── ReflowPreview.tsx            # NEW — CSS-only preview component (aspect-ratio container + object-fit: cover)
├── creditCost.ts                    # UNCHANGED — CREDIT_COSTS.reflowImage already = 5 (matches FR-006 unified cost)
└── i18n/                            # MODIFY — strings for preview label, scope selector, confirm button, chip-row tooltip
```

**Structure Decision**: Web application — Vite + React frontend (`src/`) and Firebase Functions backend (`functions/src/`). Matches existing project layout; no new top-level dirs.

## Phase 0: Research

See [./research.md](./research.md). Resolves six planning decisions:

- **R-001 — Cost model unification.** Spec FR-006 = one generation cost per resized image. `CREDIT_COSTS.reflowImage = CREDIT_COSTS.generateImage = 5`. Decision: bump `OUTPAINT_CREDIT_COST` from 2 → 5 to match. All routes now charge 5 credits per successful item.
- **R-002 — Safe-zone format.** `layoutContract.ts` exposes a pixel scalar `safeZoneInset`. Spec FR-013 wants percentage insets. Decision: new `getSafeZoneForRatio()` returns the spec's published table verbatim; pixel scalar left untouched for back-compat.
- **R-003 — Text re-composition scope.** Outpaint locks the central 70% (text included). Decision: re-run `compositeArabicText()` on re-render outputs only; outpaint outputs preserve text via the locked region. FR-011 already captures this in its wording.
- **R-004 — Brand-color source.** Read from `inputs.brandColorPrimary` / `inputs.brandColorSecondary` on the source generation (Phase 15 persistence). Inject `BRAND COLOR LOCK` block into re-render prompt; skip silently when absent.
- **R-005 — CSS preview implementation.** Client-only CSS (`object-fit: cover` + `aspect-ratio: <target>`). No server round-trip. Renders within 1 s natively.
- **R-006 — Variant chip storage (ratio-only).** Transactional upsert filtering `c.ratio === newRatio`. Cap = 6 (key-space). Legacy `mockupHistory` kept for back-compat on pre-Phase-17 generations.

## Phase 1: Design & Contracts

See:

- [./data-model.md](./data-model.md) — Generation chip-map shape, ResolutionTrace extensions, SafeZoneInsetsPct
- [./contracts/reflowImage.callable.md](./contracts/reflowImage.callable.md) — Updated callable contract (method internal, ratio-only persistence)
- [./contracts/getSafeZoneForRatio.md](./contracts/getSafeZoneForRatio.md) — New pure function contract
- [./quickstart.md](./quickstart.md) — 5 manual smoke-test scenarios

Agent context update runs last (Phase 1 task — `update-agent-context.ps1`).

## Post-Design Constitution Re-check

| Principle | Verdict | Note |
|---|---|---|
| I. Reliability | ✅ Pass | Data model collapses to a deterministic ≤6-chip cap; method-selector cliff removed |
| II. Selected Mode Obeyed | ✅ Pass | Callable contract guarantees `aspectRatio === target` on success |
| III. Launch Surface Frozen | ✅ Pass | 6 ratios enumerated in contract; method-surface removed |
| IV. Behavior Contracts | ✅ Pass | Every FR maps to a contract clause or data-model invariant |
| V. Arabic First-Class | ✅ Pass | Quickstart includes Arabic 4:5 → 1:1 carousel scenario |
| VI. Hidden Layers Auditable | ✅ Pass | ResolutionTrace extensions documented; method recorded internally |
| VII. No Silent Override | ✅ Pass | FR-011's silent routing is governed by an explicit rule + recorded in trace |
| VIII. Cost Discipline | ✅ Pass | Flat 5-credit cost unifies billing; no retry storms |
| IX. Proof for Fix | ✅ Pass | 5 fixtures + matrix test + quickstart |
| X. Spec Before Code | ✅ Pass | Plan now matches finalized spec |
| XI. FE/BE Agree | ✅ Pass | Method removed on both sides; cost constants synced |
| XII. Deferred Stays Deferred | ✅ Pass | Retargeting + custom ratios still excluded |

**Gate verdict: PASS post-design.**

## Complexity Tracking

*No Constitution violations identified — table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| — | — | — |
