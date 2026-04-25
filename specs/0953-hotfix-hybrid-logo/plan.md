# Implementation Plan: HOTFIX-E — Hybrid Logo Handling

**Branch**: `0953-hotfix-hybrid-logo` | **Date**: 2026-04-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/0953-hotfix-hybrid-logo/spec.md`

## Summary

Hybrid logo handling replaces the current "render every logo into the image in one pass" approach with a per-placement MODE that routes each logo to the rendering path it is reliable on:

1. **`ui` mode** — corner badges / top-bar lockups / CTA-button marks. The image model is told to LEAVE THE ZONE CLEAR, then the actual uploaded logo PNG is composited deterministically post-render via Sharp. Pixel-perfect, never distorted into "SIRM" / "SRM".
2. **`environmental` mode** — logo painted onto a physical surface in the scene (mug, laptop lid, t-shirt, signage, book cover, tablet back). The image model handles it natively — perspective, lighting, material — using the uploaded logo as a visual reference. No post-render compositing is applied to the logo region.
3. **Device screen content ban** — across both modes, the model is forbidden from rendering ANY text, logo, chart, graph, dashboard, or app UI on any device display (laptop, monitor, tablet, phone, smartwatch). Screens stay blank / abstract glow / out-of-focus / dimmed unreadable. The pre-existing line in `functions/src/generators.ts:2192` (`device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.'`) — which currently INVITES the model to fabricate fake screen content — is rewritten to enforce the ban.

The mode is chosen by the planner from the creative style (minimalist / corporate / conference → `ui`; lifestyle / authentic / documentary → `environmental`; carousel: first + last slide `ui` for brand recognition + CTA, middle slides `environmental` for storytelling). At most 2 `ui` placements and 3 `environmental` placements per single ad. UI width is bounded to [5%, 18%] of canvas (default 12%) and opacity to [0.85, 1.0] (default 1.0); out-of-bound values are clamped and the clamp is logged on the resolution trace.

The post-render UI compositor runs as a NEW step inserted between the model render and the existing two compositing layers: **model render → UI logo composite (new) → text composite (existing) → offer overlay (existing)**. The new step also performs collision detection against the layout contract's text/CTA zones and, on collision, auto-shifts to the nearest non-colliding zone in the same vertical band; if no candidate exists in either band, that single UI logo is dropped and the drop is recorded on the trace — the ad still ships. If the deterministic composite step itself fails for one logo (corrupt PNG, unsupported format, image-processing error), the same fail-soft contract applies: the base render is delivered with the planned zone left clear and a per-logo soft warning is recorded; other logos, slides, and batch variants are unaffected.

The eight task rows HFE.1–HFE.8 in `docs/LAUNCH_MATRIX.md` are the authoritative implementation surface; this plan formalizes their seams and contracts. No new dependencies (Sharp is already in `functions/package.json` at `^0.33.5` and is used by `offerOverlay.ts` and `textCompositing.ts`); no schema migration; backward compatibility for legacy generation records is achieved by treating any record without a `logoPlacements` array as fully `environmental` on re-render (the safer default).

## Technical Context

**Language/Version**: TypeScript 5.7 (Firebase Cloud Functions), TypeScript 5.9 (React frontend).
**Primary Dependencies**: Firebase Cloud Functions v2, Firebase Admin SDK, Firestore, Gemini 3.1 (text + image), Sharp `^0.33.5` (already installed; used by `offerOverlay.ts` line 313 `compositeOfferOverlay()` and `textCompositing.ts` line 142 `compositeArabicText()` / line 344 `compositeFullAdText()`). Frontend unchanged (the upload UI and the logo array were already extended to 5 by HOTFIX-D / PR #26). No new dependencies added by this hotfix.
**Storage**: Firestore — `generations/{genId}` collection. Two extensions, both additive: (1) `output.buildPlan` machine-plan envelope (`StructuredBuildPlanPayload` in `functions/src/buildPlanSlotMap.ts:99`) gains a `logoPlacements: LogoPlacement[]` array, persisted via the existing `serializeBuildPlanEnvelope()` path; (2) `resolutionTrace` (`functions/src/types.ts:100`) gains an optional `logoPipeline` sub-object that records per-logo mode, auto-shift events, drops, clamps, and soft warnings. No new collections, no schema migrations, no backfill.
**Testing**: Jest-style assertion fixtures via `cd functions && npm test`. Primary fixture file: `functions/src/contractFixtures.test.ts`. HFE.8 adds five new fixtures to that file: (a) minimalist single ad with one `ui` logo — prompt contains "leave the zone clear" instruction, post-render composite runs; (b) lifestyle single ad with one `environmental` logo — prompt contains "render on coffee_mug" instruction, composite does NOT run for that logo; (c) corporate ad with laptop in scene — prompt contains the screen-content ban; (d) mixed 5-slide carousel — slide 1 `ui`, slide 3 `environmental` — both routed correctly; (e) ad with 3 logos (2 environmental + 1 ui) — caps respected, each routed via the correct pipeline.
**Target Platform**: Web application (React SPA on Firebase Hosting) + Firebase Cloud Functions v2 in `europe-west1`.
**Project Type**: Web application (React frontend + Firebase Cloud Functions backend) — Option 2 in the template.
**Performance Goals**: No regression versus pre-hotfix. The new UI-logo composite step runs in the same already-paid-for post-render Sharp pipeline as the existing offer overlay; expected per-ad overhead is one Sharp `composite` call per UI logo (max 2 per ad), each operating on a small uploaded PNG layered onto the rendered canvas — observed offer-overlay times are under 200 ms per render and the new step is structurally cheaper (no SVG generation, no font rasterization). Per-render budget: < 250 ms for the entire UI-logo pass. Carousel/batch run the pass per slide / per item; the dominant cost is unchanged (the model render).
**Constraints**:
- The MODE field is mandatory on every logo placement entry. A planner output without a mode is a contract violation and MUST be rejected by the structured-build-plan validator.
- The screen-content ban MUST be re-asserted on every slide of a carousel and every variant of a batch (FR-019). One-shot global injection at the prompt-assembly site is insufficient because slide / variant prompts are assembled per-iteration — see `functions/src/generators.ts` carousel and batch loops.
- The pre-existing line `device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.'` at `functions/src/generators.ts:2192` MUST be rewritten — leaving it in conflict with the new ban is a Principle II silent-drift failure.
- UI compositing MUST run BEFORE text compositing and offer overlay so the text and offer rendering can still detect collision against the actually-placed UI logo (not just the planned zone). Order: model render → UI-logo composite → text composite → offer overlay. This is the natural extension point at `functions/src/generators.ts` around line 5670–5790 where the existing post-render Sharp passes already chain.
- Legacy generation records that lack a `logoPlacements` array MUST be treated as fully `environmental` on re-render (FR-025). The safer default — no UI compositing means no risk of text overlap, no risk of distortion. This is a read-side default in the build-plan parser, not a backfill.
- UI-logo width MUST be clamped to [5, 18] percent of canvas width with default 12; opacity MUST be clamped to [0.85, 1.0] with default 1.0. Clamps MUST be recorded on the resolution trace (Q3, Q4 clarifications, FR-004).
- Frontend and backend MUST agree on the placement-mode vocabulary. The TypeScript discriminated union (`type LogoPlacement = UILogoPlacement | EnvironmentalLogoPlacement`) is owned in `functions/src/types.ts` and re-exported to the frontend via the existing types-bridge pattern (the frontend reads modes only for display in the resolution trace viewer / saved-project loader; it does not author them).
**Scale/Scope**: Hotfix applied to one prompt-assembly path (`generateBuildPlan()`) + one build-plan validator + one new post-render compositor file + one prompt-line rewrite + one resolution-trace extension. 8 task rows (HFE.1–HFE.8), 4 file regions touched + 1 new module:
- `functions/src/generators.ts` — HFE.1 (planner schema), HFE.2 (mode-specific prompt instructions + screen-content ban), HFE.4 (post-render UI-composite invocation), HFE.6 (mode-selection hint), HFE.7 (carousel + batch propagation)
- `functions/src/logoComposite.ts` — NEW FILE — HFE.3 (`compositeUILogos()`), HFE.5 (safe-zone validation + auto-shift)
- `functions/src/buildPlanSlotMap.ts` — extend `StructuredBuildPlanPayload` with `logoPlacements`; teach `parseStructuredBuildPlanResponse()` and `validateStructuredBuildPlan()` about the new array
- `functions/src/types.ts` + `functions/src/resolutionTrace.ts` — `LogoPlacement` discriminated union + `logoPipeline` trace extension + `TraceBuilder.setLogoPipeline()`
- `functions/src/contractFixtures.test.ts` — HFE.8 (5 new fixtures)
27 functional requirements, 9 success criteria, 5 user stories, 1 clarification session with 7 Q/A (3 from `/speckit.specify`, 4 from `/speckit.clarify`). No surface expansion.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|---|---|---|
| I. Reliability Over Feature Count | PASS | Strict reduction. The planner loses freedom to invent fake screen content; UI logos are routed away from the unreliable model-as-text-renderer path; no new user-facing toggles or modes. The hotfix shrinks the model's responsibility surface. |
| II. The Selected Mode MUST Be Obeyed | PASS | This hotfix exists because the system silently drifts: user uploads a brand mark and gets "SIRM" back. After this hotfix, every UI logo is the uploaded PNG, byte-for-byte. The screen-content ban also closes a "device_mockup with content" silent-drift path (line 2192). |
| III. Launch Surface Is Frozen and Authoritative | PASS | `docs/LAUNCH_MATRIX.md` HOTFIX-E (line 1348) + HFE.1–HFE.8 are authoritative. No combinations are added; the change is internal pipeline routing only. |
| IV. Behavior Contracts Beat Subjective Judgment | PASS | Every behavior is contract-bound: mode is an explicit enum (`ui` \| `environmental`), width is a clamped numeric range, opacity is a clamped numeric range, the screen-content ban is an enumerated list of forbidden screen contents and an enumerated list of allowed screen states, the auto-shift order is a deterministic sequence (same band → other band → drop), the drop is a recorded trace entry. Five HFE.8 fixtures encode the contracts. |
| V. Arabic Quality Is First-Class | PASS | The change is language-agnostic — UI logos and environmental logos are rendered identically for Arabic and English ads. The new pipeline runs BEFORE `compositeArabicText()` so the existing Arabic RTL pipeline is untouched (FR-026). The text-vs-logo collision detection respects the Arabic text zones from the layout contract. |
| VI. Hidden Machine Layers MUST Be Auditable | PASS | Three new auditable signals join the resolution trace under `logoPipeline`: per-logo mode (chosen by planner), auto-shift events (zone collision → new zone), drops (no zone available → logo skipped), and clamps (out-of-bound width or opacity). Plus per-logo soft warnings on composite failure. Every silent decision in the pipeline becomes a structured log entry. |
| VII. No Silent Override Without Rule, Signal, and Trace | PASS | The two override paths each have all three: (1) collision auto-shift — rule (FR-011), trace (`logoPipeline.autoShifts[]`); not user-signaled because the user-visible result (logo at top-left instead of top-right) is itself the signal. (2) unresolvable-collision drop — rule (FR-012), trace (`logoPipeline.drops[]`); not user-signaled because the alternative (hard-fail the whole generation, lose credits) is worse UX than a missing single corner badge in a multi-logo lockup. The "silent to end user" decision is the deliberate, spec'd behavior — confirmed in clarification Q2. |
| VIII. Cost Discipline Is Mandatory | PASS | Zero new model calls. The new step is a single deterministic Sharp composite per UI logo, max 2 per ad. By eliminating distorted UI logos, the hotfix REDUCES wasted runs (a user who currently re-rolls because their wordmark says "SIRM" no longer needs to re-roll). The screen-content ban also reduces the regenerate-because-of-fake-dashboard pattern. |
| IX. Proof Is Required for Every Claimed Fix | PASS | Every FR ties to (a) acceptance scenarios in spec § User Scenarios, (b) one of the five HFE.8 contract fixtures, and (c) a post-deploy validation step in quickstart.md. The "before" evidence (distorted "SIRM" wordmark, fake laptop dashboards) is well-attested in the launch matrix preamble. |
| X. Spec Before Code | PASS | Spec has 5 user stories, 27 FRs, 9 SCs, and a clarification session with 7 resolved Q/A — written before any code change. |
| XI. Frontend and Backend MUST Agree on Truth | PASS | The placement-mode vocabulary lives ONCE in `functions/src/types.ts` as a discriminated union. The frontend does not author placements — the planner does — so the frontend's only consumption is read-only display in the resolution-trace viewer and saved-project loader. The structured-build-plan validator (`validateStructuredBuildPlan()` in `functions/src/buildPlanSlotMap.ts`) is the single authority that rejects malformed placements. |
| XII. Deferred Scope MUST Remain Deferred | PASS | All deferred items from the spec § Out of Scope (environmental-logo pixel-perfection, user-facing UI-vs-environmental override, per-zone position UI, post-hoc screen-content image inspection, magic-edit interaction with composited logos) are explicitly excluded from this hotfix and not creeping in via the plan. |

**Post-Phase 1 Re-check**: All 12 principles remain PASS after the Phase 1 artifacts below are written. The data model adds one discriminated-union type and one optional trace sub-object — no new collections, no schema migration. The contracts formalize three existing pipeline seams (build-plan envelope schema, post-render compositor invocation order, resolution-trace shape). No violations introduced by the design pass.

## Project Structure

### Documentation (this feature)

```text
specs/0953-hotfix-hybrid-logo/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification (5 user stories, 27 FRs, 9 SCs, 7 clarifications)
├── research.md          # Phase 0 — current-state audit + design decisions
├── data-model.md        # Phase 1 — LogoPlacement discriminated union, BuildPlan envelope extension, ResolutionTrace extension
├── quickstart.md        # Phase 1 — post-deploy validation walkthrough (8 checks)
├── contracts/
│   ├── logo-placement-schema.md     # Per-placement mode + zone + width + opacity (UI) / surface + context (environmental); validation rules
│   ├── ui-logo-compositor.md        # compositeUILogos() contract: input shape, sizing/opacity bounds, collision auto-shift, drop semantics, soft-warning trace
│   └── screen-content-ban.md        # Allowed screen states, forbidden screen contents, per-slide / per-variant re-injection rule, line-2192 rewrite
├── tasks.md             # Phase 2 output (regenerate via /speckit.tasks)
└── checklists/
    └── requirements.md  # Spec quality checklist (post-clarify pass recorded)
```

### Source Code (repository root)

Files touched by this hotfix (audit performed against the current branch as of 2026-04-24; see `research.md` for full rationale):

```text
functions/
├── src/
│   ├── generators.ts                        # HFE.1 — extend the build-plan return contract: structured machine-plan now includes logoPlacements[] (each entry = mode + per-mode fields). HFE.2 — inject mode-specific prompt instructions (UI: "leave zone clear, will composite post-render"; environmental: "render on {surface} matching perspective/lighting/material"). HFE.2 (cont.) — replace line 2192 (`device_mockup: 'VISUAL WEIGHT: Hero 45% | Device 45% | Text 10%. Device screen shows content, not blank.'`) with the new screen-content ban; inject the ban into every prompt that includes a device. HFE.4 — invoke compositeUILogos() in the post-render Sharp chain BEFORE compositeArabicText / compositeFullAdText / compositeOfferOverlay (insertion point: lines 5670–5790, alongside the existing offer-overlay invocations). HFE.6 — add mode-selection hint to the planner prompt (style → mode mapping, carousel mix rule, per-mode caps). HFE.7 — ensure carousel and batch flows assemble logoPlacements per slide / per item AND re-inject the screen-content ban per slide / per item.
│   ├── logoComposite.ts                     # NEW FILE — exports compositeUILogos(args: CompositeUILogosArgs): Promise<CompositeUILogosResult> where args = { baseImageBase64, brandLogos, placements, layoutContract, canvasWidth, canvasHeight } and result = { image: string; events: LogoPipelineEvents }. Authoritative signature lives in contracts/ui-logo-compositor.md. The caller (generators.ts) merges result.events into its TraceBuilder via traceBuilder.setLogoPipeline(events) — the compositor does NOT take the trace builder as a parameter. For each placement where mode === 'ui': resize the uploaded logo to placement.widthPct × canvasWidth, preserve aspect ratio, preserve transparency, apply subtle drop shadow for legibility, composite at the resolved zone coordinates with placement.opacity. Skips entries where mode === 'environmental'. Performs safe-zone validation against the layout contract's text/CTA zones; on collision, attempts the same vertical band's other zones (in clockwise order); if exhausted, attempts the other vertical band; if still no candidate, drops that one logo. Records auto-shifts, drops, clamps, and soft warnings. Each Sharp composite call is wrapped in try/catch — single-logo failure → soft warning + skip + clear zone, never blocks delivery.
│   ├── buildPlanSlotMap.ts                  # Extend StructuredBuildPlanPayload (line 99) with `logoPlacements: LogoPlacement[]`. Teach parseStructuredBuildPlanResponse() (line 421) to read the new field — default to [] if absent, default each entry's mode to 'environmental' if absent (legacy safety). Teach validateStructuredBuildPlan() to reject malformed entries: mode must be 'ui' or 'environmental'; UI entries must specify zone (enumeration), widthPct ∈ [5, 18], opacity ∈ [0.85, 1.0] (out-of-bound clamps recorded as warnings, not rejections); environmental entries must specify surface (string) and environmentalContext (string); cap of 2 UI / 3 environmental enforced.
│   ├── types.ts                             # Add discriminated union: type LogoPlacement = UILogoPlacement | EnvironmentalLogoPlacement, where UILogoPlacement = { logoIndex: number; mode: 'ui'; zone: 'top-left'|'top-right'|'top-center'|'bottom-left'|'bottom-right'|'bottom-center'|'center'; widthPct: number; opacity: number; } and EnvironmentalLogoPlacement = { logoIndex: number; mode: 'environmental'; surface: string; environmentalContext: string }. Extend ResolutionTrace (line 100) with optional logoPipeline: { perLogo: { logoIndex; chosenMode; finalZone?; finalSurface?; }[]; autoShifts: { logoIndex; from: zone; to: zone; reason: string; }[]; drops: { logoIndex; reason: string; candidatesExhausted: zone[]; }[]; clamps: { logoIndex; field: 'widthPct'|'opacity'; rawValue: number; clampedValue: number; }[]; softWarnings: { logoIndex; reason: string; }[]; }
│   ├── resolutionTrace.ts                   # TraceBuilder gains setLogoPipeline(events: LogoPipelineEvents) (line 49 area). build() emits the new optional field (line 116 area). Frozen output preserves immutability.
│   └── contractFixtures.test.ts             # HFE.8 — add 5 fixtures: (a) minimalist single ad + 1 logo → planner picks mode='ui', prompt contains "leave the zone clear", post-render composite runs once, traceLogoPipeline.perLogo[0].chosenMode === 'ui'. (b) lifestyle single ad + 1 logo → planner picks mode='environmental' on coffee_mug, prompt contains "render on coffee_mug matching perspective", post-render composite does NOT run for that logo. (c) corporate ad with laptop_lid environmental logo + visible laptop screen → prompt contains the SCREEN_CONTENT_BAN block; rendered prompt does NOT contain the old "Device screen shows content, not blank" line. (d) mixed 5-slide carousel + 1 logo → slide 1 plan has mode='ui', slide 3 plan has mode='environmental', slide 5 plan has mode='ui'; per-slide screen-content ban present on every slide prompt. (e) single ad with 3 uploaded logos → planner emits at most 2 ui + at most 3 environmental (cap honored); compositeUILogos invoked once with the 2 ui placements; the 1 environmental placement is rendered by model only.
```

```text
src/                                         # Frontend untouched by this hotfix.
                                             # The upload UI (Box B, max 5) and the brandLogos array were already extended by HOTFIX-D (PR #26).
                                             # The resolution-trace viewer (if/when it exists per Phase 16) will read the new logoPipeline field via the existing types bridge.
                                             # Saved-project loader (Phase 13) reads the build-plan envelope through the same parseBuildPlanEnvelope() — legacy projects without logoPlacements get [] + environmental defaults via FR-025.
```

**Structure Decision**: Web application (Option 2) with React frontend (`src/`) + Firebase Cloud Functions backend (`functions/src/`). One new file (`functions/src/logoComposite.ts`) — modeled on the structure of the existing `offerOverlay.ts` and `textCompositing.ts` (both are single-purpose Sharp post-render compositors with try/catch fail-soft semantics). Every other change edits an already-existing file. The three contract documents in `contracts/` encode the seams that the planner prompt, the post-render pipeline, and the fixture tests all depend on. No frontend changes — the placement vocabulary is backend-authored and the user does not interact with mode selection.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified.

No violations to justify. The hotfix passes all 12 principles cleanly.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | (none) | (none) |
