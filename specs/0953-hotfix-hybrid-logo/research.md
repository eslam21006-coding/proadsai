# Phase 0 Research: HOTFIX-E — Hybrid Logo Handling

**Date**: 2026-04-24
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document is the design-decision record for HOTFIX-E. It enumerates every NEEDS CLARIFICATION pulled forward from the Technical Context, every dependency that needs a chosen-pattern justification, and every integration seam that needs an "alternatives considered" record. The spec already resolved 7 product-level clarifications during `/speckit.specify` and `/speckit.clarify`; this document captures the engineering-level decisions that fall under the plan.

## Decisions

### D1. Where does the post-render UI logo composite step live in the chain?

- **Decision**: Insert `compositeUILogos()` as a NEW step BEFORE `compositeArabicText()` / `compositeFullAdText()` and BEFORE `compositeOfferOverlay()`. Final order: model render → UI logo composite (new) → text composite (existing) → offer overlay (existing).
- **Rationale**: Three reasons. (1) The text-compositor and the offer-overlay compositor BOTH treat the canvas they receive as the "base image" they place pixels onto; if UI logos went last, neither would see the actual logo and could plan its own zone over the logo. By going first, the UI logo becomes part of the base image both downstream compositors see. (2) Collision detection in the new compositor uses the same `LayoutContract.zones` data the text compositor uses — running the new compositor first means it can shift OUT of text zones, while text running first cannot shift to avoid an unknown-future logo. (3) The Sharp pattern in `offerOverlay.ts:355` (`sharp(buffer).composite([...]).png().toBuffer()`) chains losslessly via PNG; running three Sharp passes in sequence has no visible quality loss, validated by the existing offer-overlay + text-compositor stack.
- **Alternatives considered**:
  - *Run UI compositing LAST (after text + offer overlay)*: rejected — UI logo would land on top of text/price overlays, violating FR-011 collision rule and breaking legibility.
  - *Single combined Sharp pass that does logos + text + overlay together*: rejected — would require collapsing three independent compositors into one, expanding the blast radius of the hotfix far beyond its scope (would touch `textCompositing.ts:142`, `textCompositing.ts:344`, `offerOverlay.ts:313`). Out of scope per spec § Out of Scope.
  - *Run UI compositing inside the model render itself (e.g. a second model pass)*: rejected — defeats the entire reason for the hotfix, which is to remove the model from UI-logo rendering.

### D2. How does the new file `functions/src/logoComposite.ts` mirror the existing compositor patterns?

- **Decision**: Model the new file on `functions/src/offerOverlay.ts` (371 LOC, single export `compositeOfferOverlay()`). Adopt the same five conventions: (1) lazy `require('sharp')` with a graceful warn-and-disable if Sharp is missing (matches `offerOverlay.ts:8-13`); (2) `if (!sharp) return null` early exit (matches `offerOverlay.ts:322-325`); (3) try/catch around the Sharp pipeline with fail-soft return (matches `offerOverlay.ts:351-366`); (4) success log line with a structured summary (matches `offerOverlay.ts:361`); (5) all inputs are base64 data URLs, all outputs are base64 data URLs with `data:image/png;base64,` prefix.
- **Rationale**: Three existing post-render compositors share these conventions and the calling code at `generators.ts:5670–5790` already knows how to handle the contract. Re-using the contract means the new compositor slots into the existing chain with zero changes to the caller's error-handling code. Principle XI (frontend/backend agree) doesn't apply here (frontend doesn't call this), but Principle IV (behavior contracts beat subjective judgment) does — the conventions ARE the contract.
- **Alternatives considered**:
  - *Promise-rejection on failure rather than null return*: rejected — the calling code at `generators.ts:5749-5752` and `generators.ts:5788-5790` already uses try/catch with non-blocking continuation; throwing would force a wider refactor for no behavioral gain.
  - *Bake the compositor into `offerOverlay.ts` as a second export*: rejected — `offerOverlay.ts` is single-purpose (commercial number rendering); mixing logo placement in would muddle the responsibility boundary and make the file hard to read.

### D3. Where in the build-plan envelope does `logoPlacements` live?

- **Decision**: Extend `StructuredBuildPlanPayload` in `functions/src/buildPlanSlotMap.ts:99` with a `logoPlacements: LogoPlacement[]` field. Persisted via the existing `serializeBuildPlanEnvelope()` (line 324) and read back via the existing `parseStructuredBuildPlanResponse()` (line 421). Validated via the existing `validateStructuredBuildPlan()` path.
- **Rationale**: The structured machine plan is already the persistence contract for build-plan-driven decisions (zones, overlay assignments, must-show assignments). Adding `logoPlacements` to the same payload means: (1) one save path / one load path / one validator path; (2) backward-compat is automatic via JSON parse — older records simply don't have the field; (3) the existing fixture tests for `validateStructuredBuildPlan()` provide the testing harness for HFE.8 fixtures.
- **Alternatives considered**:
  - *Store `logoPlacements` as a separate Firestore sub-document under `generations/{genId}/logoPlacements/`*: rejected — adds a new collection for no read-pattern reason; every consumer would need to fetch one extra doc just to render. The build plan is already a single-doc read.
  - *Encode logo placements as inline text in the `blueprint` string*: rejected — would force every consumer to re-parse natural-language to discover modes; the entire reason `StructuredBuildPlanPayload` exists is to avoid that. See `buildPlanSlotMap.ts:99-105` — zones, overlays, and must-shows already use this pattern; logos joining is consistent.

### D4. How does the planner pick the mode (`ui` vs `environmental`) per logo?

- **Decision**: Mode is chosen by the planner LLM based on a HINT block injected into the planner prompt. The hint maps creative styles to default modes: minimalist / corporate / conference → `ui`; lifestyle / authentic / documentary / product-focused → `environmental`; `text_only` → no logos at all; mixed-style carousel → first slide `ui`, middle slides `environmental`, last slide `ui`. The planner MAY override the default per individual ad / per slide if the style strongly indicates the other mode. The hint is part of HFE.6.
- **Rationale**: The launch matrix HFE.6 row explicitly assigns mode selection to the planner because (a) it has visibility into the resolved style + universe + creative-mode combination, and (b) the planner already authors the rest of the build plan, so mode selection shares its context window. Hard-coding mode by style table on the backend would force a separate decision authority and risk drift from the planner's view of the ad. Constitution Principle IV (contracts beat subjective judgment) is satisfied because the per-mode caps (max 2 UI / max 3 environmental) are validator-enforced, not planner-trusted.
- **Alternatives considered**:
  - *Backend rule-based mode selection (style table → mode)*: rejected — would create two authorities for the build plan (planner + backend rule), risking drift. Also can't capture per-slide nuance for carousels without an even larger rule table.
  - *User picks the mode in the UI*: rejected — explicitly out of scope per spec. The whole point is that the user has uploaded a logo and shouldn't have to learn a placement-mode taxonomy.

### D5. How is the screen-content ban enforced — prompt-only or with post-hoc image inspection?

- **Decision**: Prompt-only enforcement. The `SCREEN_CONTENT_BAN` block is injected into every prompt that may contain a device, with explicit enumeration of forbidden contents (text, logo, chart, graph, dashboard, app UI) and explicit enumeration of allowed contents (blank dark, abstract gradient, out-of-focus glow, dimmed unreadable blur). The pre-existing `device_mockup` line at `generators.ts:2192` is REWRITTEN to enforce the ban. The ban is re-injected per slide in carousel and per item in batch (FR-019).
- **Rationale**: The launch matrix HFE.2 row specifies prompt enforcement; spec § Out of Scope explicitly excludes "Detection or rejection of invented screen content via post-hoc image inspection." Three pragmatic reasons: (1) the model has a strong response to absolute prohibition prompts in our existing testing (the same pattern is used by `culturalCompliance.ts` for haram motifs with high success rate); (2) post-hoc image inspection would require a per-image vision call to ask "is there text on the laptop screen", at meaningful per-render cost — Constitution Principle VIII (cost discipline) opposes this for a ban that is enforceable cheaply; (3) any post-hoc rejection would force a re-render, which is an even bigger cost hit, and the user would then wait twice for one ad.
- **Alternatives considered**:
  - *Vision-call post-hoc check: "is there text/logo on the laptop screen"; if yes, re-render*: rejected per cost discipline and per spec out-of-scope.
  - *Generative inpaint over the screen region after render (mask the screen area, regenerate as blank)*: rejected — adds a new model call per device-containing ad, adds latency, and the inpaint may itself hallucinate. Spec § Out of Scope.

### D6. Where does the hint about the ban (and the mode-selection guidance) live so that all assembly sites pick it up?

- **Decision**: A new constants module exporting `SCREEN_CONTENT_BAN_BLOCK`, `UI_LOGO_INSTRUCTION_BLOCK`, `ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK`, `MODE_SELECTION_HINT_BLOCK`, and the `LogoPlacement` discriminated union. Co-locate with `logoComposite.ts` (or with `promptConstants.ts` if that file is the conventional home) so the prompt-assembly site, the post-render compositor, and the fixture tests all import the SAME strings. Mirrors the existing `culturalCompliance.ts` pattern from HOTFIX-C, which centralizes `CULTURAL_COMPLIANCE_BLOCK`, `ARABIC_WARDROBE_BLOCK`, `TRIGGER_WORDS`, etc.
- **Rationale**: Three reasons. (1) Constitution Principle XI (frontend/backend agree on truth) — frontend doesn't read these blocks today, but the fixture tests (HFE.8) MUST assert on the exact prompt strings to be meaningful; sharing the constant means a typo in the block flips both the production injection and the test assertion the same way. (2) Per-slide / per-item re-injection in carousel/batch needs the ban string in scope at the loop site; one import is cleaner than duplicated string literals. (3) `culturalCompliance.ts` already proves this pattern works at this scale.
- **Alternatives considered**:
  - *Inline the prompt strings at every assembly site*: rejected — drift risk, especially for the per-slide re-injection requirement (FR-019 explicitly demands the ban appear on every slide / every variant; an inline string is easy to forget at one of the three+ sites).
  - *Generate the prompt strings dynamically at runtime from the `LogoPlacement` array shape*: rejected — over-engineered for fixed strings; debugging would mean reading the assembled output in logs rather than reading the source file.

### D7. How is FR-025 backward compatibility (legacy records → environmental default) actually achieved?

- **Decision**: Defaulting happens at READ time in `parseStructuredBuildPlanResponse()` (`buildPlanSlotMap.ts:421`). When the parsed payload has no `logoPlacements` field, return `[]`. When a parsed entry has no `mode` field, default it to `'environmental'`. Legacy records are never WRITTEN back with new defaults — the in-memory parse-time default is sufficient for re-render correctness, and avoiding writes preserves the original record exactly as captured.
- **Rationale**: Two reasons. (1) Spec FR-025 mandates "treated as fully `environmental` on re-load" — read-side defaulting matches that wording exactly. (2) Avoiding a backfill avoids a class of risks: backfill scripts that touch every legacy record, schema-version stamping, the Cloud Function that has to run the backfill, etc. Constitution Principle I (reliability over feature count) — read-side default is the smallest change that achieves the spec.
- **Alternatives considered**:
  - *Run a one-time backfill that writes `logoPlacements: []` to every legacy record*: rejected — purposeless write traffic; doesn't change the runtime behavior; introduces a deploy-coordination risk (run-once-only scripts are a perennial source of accidental re-runs).
  - *Reject legacy records on re-render with "build plan missing logo placements"*: rejected — would break Phase 13 saved-project re-render. Spec FR-025 explicitly forbids this.

### D8. How does the safe-zone validation map "vertical band" to the existing `LayoutContract` zone enumeration?

- **Decision**: "Top vertical band" = zones `top-left`, `top-center`, `top-right`. "Bottom vertical band" = zones `bottom-left`, `bottom-center`, `bottom-right`. The middle zone `center` is its own band of one and is not shifted into / out of automatically (it is the most likely to host the hero). The auto-shift order is: same-band candidates in clockwise order (e.g. `top-right` → `top-center` → `top-left`); then the other band's candidates in the same clockwise order; then drop. The collision-check input is the union of layout-contract `textZone` and `ctaZone` boundaries from the resolved per-aspect-ratio contract.
- **Rationale**: Two reasons. (1) Symmetric L-R-C grouping is what every existing layout template uses (see `layoutContract.ts:118-216`, `safeZoneInset` + `textZoneMaxWidthPct` are uniformly applied per ratio); the band concept is a cheap restatement of structure the contract already exposes. (2) Excluding `center` from auto-shift candidates respects the hero's centered placement in nearly every realistic-style ad; pasting a logo over the hero would defeat the hotfix's purpose more than dropping the logo.
- **Alternatives considered**:
  - *Try every zone in arbitrary order regardless of band*: rejected — would happily shift a "top brand badge" to the bottom of the canvas, surprising users.
  - *Allow `center` as an auto-shift candidate*: rejected per the hero-collision risk above.

### D9. How does the fail-soft contract for `compositeUILogos()` interact with the existing `null`-return pattern of `compositeOfferOverlay()` / `compositeArabicText()`?

- **Decision**: `compositeUILogos()` returns `{ image: string; events: LogoPipelineEvents }` ALWAYS — never `null`. On total Sharp unavailability, `image` is the input base unchanged and `events.softWarnings` carries one `compositor_unavailable` entry. On per-logo failure, the failed logo gets a `softWarnings` entry and is skipped, but other logos are still composited. This is a minor divergence from the `null`-return pattern of the other two compositors.
- **Rationale**: Three reasons. (1) Returning the input image unchanged on total failure means the calling code at `generators.ts` does NOT need a separate "did the compositor run" branch — it can always pass the result downstream to text-compositor. (2) Returning structured `events` rather than logging-only means the resolution trace gets the failure record without the calling code having to reach into the compositor's logs. (3) The existing `null` pattern in the other two compositors works because each composites a SINGLE thing (the offer overlay, the text overlay) — total failure = nothing happens. UI-logo compositing is per-logo (up to 2 per ad), so per-logo failure must NOT mean total failure; the `events` object captures per-logo state cleanly.
- **Alternatives considered**:
  - *Match the `null`-return pattern exactly*: rejected — would require the caller to coordinate per-logo failures via side-channels (logs or a separate trace builder call). The structured-events return value is cleaner.

### D10. Why is the frontend untouched?

- **Decision**: The hotfix touches no frontend file. The upload UI (Box B, max 5) and the `brandLogos` array were already extended by HOTFIX-D (PR #26 merged 2026-04-24, commits `9fa85ac` and `41928c2`). The hybrid-mode logic lives entirely in the backend pipeline.
- **Rationale**: The user's mental model is "I uploaded my logos and the system used them." Adding a "pick UI vs environmental" toggle in the UI was explicitly rejected in spec § Out of Scope. The trace viewer for `logoPipeline` is a Phase 16 concern, not this hotfix.
- **Alternatives considered**:
  - *Add a per-logo mode picker to Box B*: rejected per spec § Out of Scope.
  - *Add a "preview where the logo will land" indicator*: rejected — would require real-time access to the backend planner; out of scope.

### D11. What about the interaction with HOTFIX-F (aspect-ratio reflow)?

- **Decision**: HOTFIX-E persists `logoPlacements` with zone names (e.g. `top-right`), not absolute pixel coordinates. After a HOTFIX-F reflow, the new canvas's safe-zone resolver re-resolves zone names to new pixel coordinates; HOTFIX-E's compositor is re-invoked on the new base image and re-runs collision detection against the new ratio's text zones. No HOTFIX-E code change is needed for HOTFIX-F to work — the zone-name persistence model carries through naturally.
- **Rationale**: Storing zone names rather than pixel coordinates is the natural hand-off shape — it matches how `LayoutContract.zones` already works (`layoutContract.ts:118-216`).
- **Alternatives considered**:
  - *Persist absolute pixel coordinates*: rejected — would require HOTFIX-E to re-compute coordinates after every reflow; couples the two hotfixes unnecessarily.

### D12. Why no schema migration?

- **Decision**: All extensions are additive at the JSON layer (`logoPlacements: []` and `logoPipeline: {...}` are both optional on read). Firestore is schemaless. No migration scripts, no document version stamping.
- **Rationale**: Constitution Principle I (reliability over feature count) — every migration script is a class of failure modes that this hotfix avoids by being purely additive.
- **Alternatives considered**:
  - *Stamp records with `schemaVersion: 'hotfix-e-v1'` for future reference*: rejected — adds noise without enabling any behavior; if a future migration is needed it can stamp itself.

## Open questions

None. All product-level questions were resolved by `/speckit.specify` (3 inline) and `/speckit.clarify` (4 today). All engineering-level decisions above (D1–D12) are resolved with rationale + alternatives.

## Inputs validated against current code

- Sharp is installed: `functions/package.json` line 31, `^0.33.5`. Used by `offerOverlay.ts:355` and `textCompositing.ts:269` / `textCompositing.ts:619`. ✅
- `StructuredBuildPlanPayload` exists at `functions/src/buildPlanSlotMap.ts:99`. ✅ Has `blueprint`, `zones`, `overlayAssignments`, `mustShowAssignments`, `ownership`. Adding `logoPlacements: LogoPlacement[]` is structurally identical to those existing array fields.
- `ResolutionTrace` exists at `functions/src/types.ts:100`. ✅ Already extended once before by HOTFIX-C with optional `culturalViolation` (line 126), so the additive-optional-sub-object pattern is established.
- `compositeOfferOverlay()` insertion site is `functions/src/generators.ts:5682` and `functions/src/generators.ts:5774`. ✅ Both are inside try/catch with fail-soft return; the new `compositeUILogos()` invocation is inserted IMMEDIATELY BEFORE these two sites (and before the text-compositor invocations, which use the same pattern in `textCompositing.ts`).
- The pre-existing `device_mockup` line lives at `functions/src/generators.ts:2192`. ✅ Verified via Grep. The replacement string is owned by the new constants module per D6.
- `brandLogos` is already an array on `AdInputs` (`src/types.ts:272`, `Box B (Max 5)` per HOTFIX-D). ✅ The new `logoPlacements` array's `logoIndex` field references this existing array by integer index — no new upload path, no new storage.
- `contractFixtures.test.ts` already covers the build-plan validator with import patterns established for `compileFullContract`, `buildContentOwnershipMap`, `buildPlanSlotMap`, `validateStructuredBuildPlan`. ✅ The HFE.8 fixtures slot in alongside HFC.9 fixtures from HOTFIX-C with no new test runner setup.
