# Phase 0 Research — HOTFIX-D Multi-Logo Upload

Resolves all NEEDS CLARIFICATION and documents the decision for each non-trivial touchpoint.

---

## R1. Overflow UX — how to partial-accept without regressing the existing upload handler

**Decision**: Rewrite the capacity check inside `InputForm.tsx::handleFileUpload` (L840–846) and the personal/brand branch of `handleDrop` (L954–960). Instead of the current "reject the whole drop if overflow," compute `remaining = max - current`, take the first `remaining` files via `newFiles.slice(0, remaining)`, and surface a non-blocking error message naming the rejected count: `Only ${max} ${noun} allowed — ${newFiles.length - remaining} extra file(s) ignored.`

**Rationale**:
- Matches the clarified spec (Q1 → Option A: partial accept).
- Changes one conditional block per handler; no new state, no new helper.
- `setError` is already how both existing handlers surface user-visible messages; reusing it keeps UX consistent with the rest of the form.
- The capacity-check branch is the narrowest edit point — no need to refactor `compressImage`, `setInputs`, or the drop-path plumbing.

**Alternatives considered**:
- *Pre-accept confirmation modal*: heavier UX, spec Q1 rejected this.
- *Silent truncation at cap*: violates spec FR-004 and Constitution VII (no silent override).
- *Change `max` to a per-call parameter*: over-engineering — only two handlers and one identical branch.

**Implementation notes**:
- The noun phrasing `logo` / `logos` already diverges from `photos` (plural) — take the opportunity to pluralize correctly in the message: `logo` when `max === 1` (legacy), `logos` when `max === 5` (post-hotfix). Since `max` becomes 5 for the `brand` branch, the message becomes `Only 5 logos allowed — X extra file(s) ignored.`
- The `setError` string is rendered once in the form (see `InputForm.tsx:2317` — `{error && <div className="text-red-400 text-xs text-center py-2">{error}</div>}`). No new UI plumbing needed.

---

## R2. Where to enforce the cap (single source of truth)

**Decision**: Enforce the cap of 5 in two places only: (a) the upload handler itself, via the `max` local and the partial-accept branch (R1), and (b) the backend sanitizer at `functions/src/generators.ts:4192` via `.slice(0, 5)`. Remove every other `.slice(0, 1)` and replace it with `.slice(0, 5)` as the defence-in-depth cap.

**Rationale**:
- Constitution XI (frontend and backend must agree on truth): both layers assert the same invariant.
- The sanitizer `.slice(0, 5)` serves as the terminal safeguard — even if a future client (or a replayed saved project) smuggles in 6+ logos, the backend still clips at 5. Matching the spec FR-005 ("MUST NOT truncate to one on any code path") while keeping a single numerical cap.
- The current `.slice(0, 1)` sites are not capacity checks; they are defensive clips written when someone assumed "one logo is the feature." Post-hotfix, they all need the same cap value; making them `.slice(0, 5)` is the minimal-diff, max-safety path.

**Alternatives considered**:
- *Remove all slices and trust the UI*: violates XI — backend must enforce independently.
- *Centralize into a single helper `clipBrandLogos()`*: adds a new symbol for a 2-character delta per site; over-abstraction.
- *Config constant `MAX_BRAND_LOGOS = 5`*: arguably cleaner but touches more files and introduces a dependency between `src/` and `functions/` on a shared constant — not worth it for a hotfix. Constant can be added later if HOTFIX-E needs it.

---

## R3. Prompt-text rewrite strategy for equal-peer rendering

**Decision**: Rewrite the five singular-logo prompt fragments in `functions/src/generators.ts` to describe 1–5 logos as equal peers. Each rewrite:
1. Replaces "ONLY logo allowed" / "that image once" / "a logo" with "each uploaded logo" or "every uploaded logo".
2. Adds an explicit "EQUAL-PEER" rule: "All uploaded logos MUST be rendered at comparable visual size and balanced placement. Do NOT treat any logo as primary; upload order has no prominence meaning."
3. Preserves the existing "zero logos = zero branding marks" rule unchanged.
4. Preserves the "only logos from Box B, never invent" rule unchanged.

**Target fragments** (concrete locations):
- `generators.ts:2108` — already plural phrasing, but strengthen: "Integrate all Box B logos as physical objects in the scene — comparable size, balanced placement, no single logo dominant."
- `generators.ts:2407–2409` — rewrite the 3-line rule block:
  - Keep: "Render ONLY the user's brand elements from Box B (if provided)."
  - Keep: "If Box B is empty, the design must have ZERO logos or branding marks."
  - Replace "ONLY logo allowed" with: "If Box B contains one or more logos (up to five), each MUST appear as a distinct physical brand element. All logos are equal peers — rendered at comparable size and balanced placement. Upload order does NOT map to visual prominence. Never invent or add logos not in Box B."
- `generators.ts:3090, :3106` (AR/EN BEFORE/AFTER) — change "شعار Box B إن وجد" / "Box B logo if present" to "شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل ومتوازن" / "Box B logos (up to 5) if present — all at comparable size, balanced placement".
- `generators.ts:3137` (AR concept template placeholder) — "[منطق وضع شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل.]".
- `generators.ts:5071` (LOGO STRICTNESS) — rewrite: "LOGO STRICTNESS: Render ONLY user-provided branding from Box B. If Box B is empty, the design must be 100% free of any logos or branding marks. If Box B has one or more images (up to 5), render each as a distinct physical artifact in the scene — all at comparable size, no single logo dominant, balanced placement, no one mark enlarged relative to the others."
- `generators.ts:5138` (carousel continuity) — "SAME BRAND ELEMENTS: Same logo placements, same brand colors, same badge design." (plural "placements").

**Rationale**:
- Each change is additive in meaning: lifts the count, not the rule. The "never invent" and "zero = zero" invariants are untouched, preserving the anti-hallucination guard from HOTFIX-C and the empty-Box-B contract.
- Equal-peer language is repeated across all five fragments so the model cannot latch onto a single-mention and default to hierarchy from training bias.
- Both Arabic and English fragments are updated together — consistent with Constitution V (Arabic is first-class).

**Alternatives considered**:
- *Leave prompt mostly alone, rely on `boxB.length` conditional*: the current "If Box B contains a logo, it is the ONLY logo allowed" is a direct prohibition on multi-logo rendering; leaving it in place would mean the model still sees a "one logo max" rule even when 5 are provided. Must be rewritten.
- *Numerical size rule (e.g. "each logo at ≥ 5% canvas width, ≤ 12%")*: too prescriptive for this hotfix and blurs into HOTFIX-E's territory (deterministic compositing).
- *Single consolidated rule block at top-of-prompt*: tempting but would require removing the existing scattered references, which risks breaking other lanes' test fixtures. Keeping edits local minimizes blast radius.

---

## R4. Carousel and batch propagation

**Decision**: No code change for carousel and batch beyond fixing the `slice(0, 1)` sites. The existing `boxB.forEach(d => parts.push({inlineData: ...}))` at `generators.ts:5244` iterates over whatever `boxB` contains; once the upstream slice is 5, all carousel slides automatically receive up to 5 logos. Batch calls go through the same `buildFinalImagePrompt` for each batch item — same behavior.

**Rationale**:
- The existing code is already iteration-shaped; the bug was only the pre-iteration clip. Once the clip is lifted, the loop does the right thing.
- `src/App.tsx:5530` (batch hook concept generation) passes `cleanInputs.brandLogos?.slice(0, 1)` into `generateConcepts` — this is a concept-generation concept sanitizer, upstream of each batch item's image render. Once lifted to `.slice(0, 5)`, each downstream render call gets 5 logos via the shared `cleanInputs`.
- Carousel slide 2+ uses `styleReference` instead of `personalPhotos`, but still attaches `boxB` via the else-branch at `generators.ts:5244` / the if-branch at `:5240–5245`. Both branches pass `boxB` to `parts`. Once `boxB` is length 5, both paths deliver 5 logos per slide.

**Verification**: `grep -n "boxB\.forEach" functions/src/generators.ts` yields two sites (inside the same function). Both sites are inside the slide/render loop, so every slide and every batch call hits them.

**Alternatives considered**:
- *Add explicit per-slide logo-injection loop*: redundant; already loops.
- *Assert `boxB.length === inputs.brandLogos.length` via invariant check*: useful for debugging but not required by spec. Deferred.

---

## R5. Saved-project backward compatibility

**Decision**: No migration required. Saved-project loader at `src/App.tsx::loadProject` re-hydrates `inputs.brandLogos` as-is from IndexedDB/Firestore. Since the schema has always been `string[]`, pre-hotfix projects have `brandLogos: [<one>]` or `brandLogos: []` or undefined, all of which are valid post-hotfix inputs. No data is lost, no data needs migrating.

**Rationale**:
- The hotfix expands the accepted array length from 1 to 5. It never shrinks. Backward compatibility is automatic.
- `InputForm.tsx:315` (`(raw.brandLogos || []).slice(0, 1)`) is inside the `parseLegacyInputs` / state-restoration path. It silently truncates any pre-hotfix saved project with >1 logo (shouldn't exist, but would be silently harmed). Changing this slice to `.slice(0, 5)` also fixes any future saved project that *already* has more than 1 logo.

**Alternatives considered**:
- *Migration script to re-pad old projects*: unnecessary, they were always valid arrays.
- *Version flag on saved projects*: over-engineering.

---

## R6. Contract-fixture shape (for Phase 1 `contractFixtures.test.ts` additions)

**Decision**: Four new fixture cases (to be specified in detail in `contracts/generator.md`):
1. **3-logo single ad** — assert `boxB.length === 3` post-sanitize; assert final prompt contains the equal-peer phrase (e.g. "comparable size, balanced placement"); assert prompt does NOT contain "ONLY logo allowed" or "render that image once".
2. **5-logo carousel slide 3** — assert per-slide `inlineData` parts include 5 image entries for Box B.
3. **0-logo ad** — assert prompt contains "ZERO logos or branding marks" (unchanged invariant) and does NOT contain the equal-peer phrase (no branding section activated).
4. **6-logo input** (simulating a client that skipped frontend validation) — assert backend truncates to exactly 5; assert no error thrown; assert prompt still contains equal-peer phrase.

**Rationale**:
- One fixture per acceptance scenario in spec Stories 1–3. Covers the happy path, the boundary, the empty case, and the defence-in-depth.
- Assertions target prompt-text presence/absence — cheap, deterministic, no Gemini call required.

**Alternatives considered**:
- *Rendered-image assertions*: non-deterministic for text-level fixtures; defer to manual QA.
- *Mock-call counting*: flaky given Gemini SDK wrappers; prompt-text assertions are more stable.

---

## R7. Saved-generation record shape for reload-with-full-logos

**Decision**: No schema change. `generations/{genId}.input.brandLogos` is already `string[]`. Persisting the full set is the existing default — once the upstream sanitizer stops truncating, the persisted record automatically reflects the full set.

**Rationale**: The sanitizer truncation is what caused persisted records to have `brandLogos.length ≤ 1`. Lifting the truncation fixes persistence automatically.

**Alternatives considered**: none needed.

---

## R8. Test-harness implications

**Decision**: Add four test cases in `functions/src/contractFixtures.test.ts` (per R6). No new test file, no new harness. Existing Vitest config runs it via `cd functions && npm test`.

**Rationale**: `contractFixtures.test.ts` is the established home for HOTFIX-style assertions (used by HOTFIX-C's 5 cultural-compliance tests).

**Alternatives considered**: A new `logoContract.test.ts` — unnecessary separation for 4 small fixtures.

---

## Unresolved NEEDS CLARIFICATION

None. All clarifications from `spec.md` §Clarifications (Session 2026-04-24) are reflected in R1 and R3.
