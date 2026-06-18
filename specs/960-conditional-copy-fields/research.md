# Phase 0 Research: Conditional Copy Fields (Phase 24B)

All decisions below are grounded in a code audit of the live pipeline (file:line references included). No `NEEDS CLARIFICATION` markers remain; the four spec clarifications (Q1–Q4) and the central representation question are resolved here.

---

## D1 — Representation of "absent": `null` vs the existing `""` convention

**Decision:** The three optional fields (`subheadText`, `ctaName`, `benefitText`) use **`null`** as the canonical "intentionally absent" value. Their types widen from `string` to `string | null`. `hookText` stays a required `string`. Empty string `""` is no longer a valid resting state for an optional field — it is normalized to `null` at the parser boundary and at the dedup boundary.

**Rationale:**
- FR-006 explicitly mandates "null/undefined… NEVER empty string or placeholder," restated verbatim in the original feature request.
- The existing pipeline already treats falsy values as absent via truthiness (`buildFinalImagePrompt` line 5172–5174 `${subheadText ? … : ''}`; `validateCopyFidelity` skips empty fields, `buildPlanSlotMap.ts` 724–739; `textCompositing` counts non-empty). `null` is falsy, so these consumers keep working unchanged.
- Standardizing on one falsy value (`null`) removes the current ambiguity where `""` could mean "model emitted blank," "dedup blanked it," or "parser found nothing."

**Blast radius (the real cost):** every site that calls a string method on an optional field must add a null-guard. Confirmed hotspots:
- `validateCopyFidelity` normalize `s.normalize("NFC").trim()...` (`buildPlanSlotMap.ts` ~702) — must guard `null`.
- `resolveOwnedRenderText` currently returns `""`/`inputs.cta` defaults (`generators.ts` 603–604, 622) — must return `null` for genuinely-absent optional fields.
- Cultural-compliance per-field scan (`generators.ts` 4670–4701) iterates the four fields — guard `null`.
- Frontend `getSection()` returns `""`; map empty → `null` before storing on `HookVariation` (`src/utils/hookVariationParser.ts`, `src/App.tsx` 6484–6500).

**Alternatives considered:**
- *Keep `""` as the absent marker.* Rejected: violates FR-006; cannot cleanly carry the absent-vs-failure distinction.
- *Use `undefined`.* Rejected in favor of `null` for explicitness on transport/Firestore (Firestore drops `undefined`; `null` is an intentional, serializable signal). Consumers treat both as falsy, so either works at render time, but `null` is the canonical written value. (FR-006 permits "null/undefined"; we pick `null` as the single canonical form.)

---

## D2 — Distinguishing "intentionally absent" from "failed to parse" (the hardest invariant)

**Decision:** Introduce a **per-field parse status** alongside the values: `present | absent | parse_failure`. The field *value* is the string when `present` and `null` when `absent` or (after degrade) `parse_failure`. The *status* — not the value — carries the distinction. Status is computed in the parser, asserted in tests (FR-016), and recorded in `resolutionTrace` (D6).

**Rationale:**
- FR-007/FR-008 require the two states to be "explicitly and separately observable" and forbid silently converting failure → absent. A bare `null` (or `""`) cannot encode this; a sidecar status can.
- The parser already distinguishes "this field was never present in the output" from "a marker was present but the block between markers was unreadable" — it just collapses both to `""` today (`generators.ts` 579–620). The status formalizes a distinction the parser already has enough information to make.

**Shape (see data-model.md):** a `CopyFieldStatus = "present" | "absent" | "parse_failure"` plus a `copyFieldStatuses` record keyed by field name, produced by the parser and threaded to the fidelity/dedup/trace layers.

**Alternatives considered:**
- *Sentinel string value* (e.g. `"__ABSENT__"`). Rejected: FR-006 forbids placeholder strings; sentinels leak into render/fidelity/compositing.
- *Throwing on parse failure.* Rejected for optional fields: would block an otherwise-shippable ad (contradicts Q1 degrade-to-ship). Reserved only for `hookText` (D5).

---

## D3 — Behavior on an OPTIONAL-field parse failure (clarification Q1)

**Decision:** Retry the build-plan parse within the **existing** `MAX_COPY_FIDELITY_ATTEMPTS` loop (`generators.ts` 4560–4615). If the optional field is still unreadable after the cap, **log the failure** (`console.warn` + `resolutionTrace`) and **degrade the field to `null` (status `parse_failure`)** so the ad ships.

**Rationale:**
- Matches the codebase's established pattern: the retry loop already prefers the best plan and falls back non-blockingly after 3 attempts (`generators.ts` 4610–4614). We reuse it rather than add a new retry mechanism (Constitution VIII — cost discipline; no extra model calls).
- Satisfies FR-008 (surfaced, never silent) and SC-010 (log precedes degrade in 100% of cases).

**Integration point:** the parse-status computation runs inside `extractCopyFieldsFromResponse()` (`generators.ts` 672–680) so each attempt's status is available to the best-plan selector (which can prefer a plan with fewer `parse_failure` statuses, mirroring its current "fewest failed fields" preference at 4577–4589).

**Live-provider note (from /speckit.analyze F1):** production runs `MODEL_PROVIDER='openai'`, where the Phase 025 change gated copy-fidelity retry to a **single pass**. So on the live OpenAI path the retry cap is effectively 1 — "retry then degrade" collapses to one attempt then degrade. This is correct behavior: degrade-to-absent (`null` + status `parse_failure`, with the logged warning) still fires after the single attempt. No behavior change; implementers should simply not expect 3 attempts on the OpenAI path (the 3× cap applies only on the Gemini path).

**Alternatives considered:** hard-fail the variation (rejected — blocks shippable ad); drop with no retry (rejected — gives up on a recoverable field).

---

## D4 — Dedup/QA-blanked fields become `null` (clarification Q2)

**Decision:** The dedup block (`generators.ts` 5388–5427) currently sets duplicates to `''`. It now sets them to **`null`** and marks status `absent` (a dedup-blank is an *intentional* absence, not a failure). All other dedup behavior (exact-duplicate rules, near-duplicate substring rules, compact-ratio truncation) is unchanged — Phase 23 anti-sameness is untouched (OOS-004).

**Rationale:**
- Unifies the absent representation (D1) and satisfies FR-010 + SC-011. Downstream truthiness consumers already treat the blanked field as absent; only the literal value and the status change.
- Compact-ratio truncation (5416–5426) still produces a real (shorter) string → status stays `present`; truncation is not absence.

**Alternatives considered:** keep `""` for dedup blanks (rejected — FR-006); disable dedup on optional fields (rejected — changes Phase 23 behavior, OOS-004).

---

## D5 — Missing/unreadable `hookText` (clarification Q3)

**Decision:** `hookText` is never optional. If it is absent or unreadable for a variation, treat it as a **generation failure for that variation** and retry within existing limits (the fidelity loop already prefers plans where `hookText` is present, `generators.ts` 4577–4589; `validateCopyFidelity` already hard-fails on empty `hookText`, `buildPlanSlotMap.ts` 710–714). A variation is **never rendered hookless**. `hookText` status may only ever be `present` or `parse_failure` — **never `absent`** (FR-002).

**Rationale:** preserves the existing hard requirement; the only change is making the status model explicit that `absent` is illegal for `hookText`.

**Frontend note:** the current UI shows `"⚠️ Hook unavailable"` fallback (`App.tsx` 6586). That fallback remains as a last-resort display guard but is an error path, not an "absent" path — it should never be reached when the retry succeeds.

---

## D6 — Auditability: recording absent vs parse-failure in `resolutionTrace` (Constitution VI/VII)

**Decision:** Add an additive optional `copyFieldStatus` sub-object to `ResolutionTrace` recording, per field, the final status (`present | absent | parse_failure`) and a flag when degrade-to-absent occurred. Mirror the existing additive-trace pattern used by `claimFlags` (`types.ts` 291, `resolutionTrace.ts` 71) and `culturalViolation` (`types.ts` 263–267, `resolutionTrace.ts` 52–55). Add `TraceBuilder.setCopyFieldStatus(...)`.

**Rationale:** Constitution VI (hidden layers auditable) and VII (no silent override without trace) require the degrade and the dedup-blank to be traceable. This is additive only — no Firestore migration (matches HOTFIX precedent for `culturalViolation`/`logoPipeline`). Resolves the one item the clarify step deferred ("observability") as an implementation detail.

**Alternatives considered:** in-memory/log-only (rejected — Constitution VII wants a trace, not just a log line, for an override path).

---

## D7 — Frontend rendering & per-field regenerate visibility (T19)

**Decision:**
- Render each optional field only when its value is non-null (the JSX already guards `benefitText` at `App.tsx` 6602–6610; extend the same truthiness guard to `subhead` 6593 and `ctaText` 6603 so absent fields produce **no** container/label, not a placeholder).
- Per-field regenerate buttons (`App.tsx` 6587/6594/6611) currently render unconditionally; gate each on the corresponding field being present (FR-004). **Hide**, do not disable (the clarify Q4 rejected the disabled+tooltip option).
- No add-field affordance (Q4) — absent is final in step-2 this phase.
- Arabic RTL: the `dir="rtl"` + `text-right` + `arabic-text` pattern already lives per-field (6586/6593/6603/6607); since absent fields are simply not rendered, RTL correctness for present fields is preserved with no extra work (FR-005).

**Rationale:** minimal, surgical edits to existing JSX; matches existing conditional pattern already present for `benefitText`.

**Loading-state nuance:** the UI distinguishes loading (`...Generating Subheadline`) from absent. After this phase, a non-loading absent field renders nothing; the loading placeholder only shows while `isLoadingItem` is true. Keep that branch; only the *non-loading empty* branch changes from "" display to no-render.

---

## D8 — Phase 23.A variation carousel & Approve/Edit/AI-Edit/Batch with fewer fields (T19, US3)

**Decision:** The variation carousel (`App.tsx` 6744–6809) reads fields per position from `HookVariation` objects; once `HookVariation` fields are `string | null` (src/types.ts 706–714) and the render guards from D7 apply per position, mixed field counts across positions render cleanly (US1 AC + FR-012). RTL navigation (next = leftward) is unchanged.

For actions:
- **Approve** (`handleApproveTov`, `App.tsx` 4022, called 6630) operates on the raw `activeBlock` — it already passes whatever markers exist; absent fields simply aren't in the block. No field-existence assumption to fix beyond ensuring it doesn't synthesize empty fields.
- **Edit** (inline editor 6550–6582, `editHookData` 1758) initializes from `hookText/subhead/ctaText/benefitText`; initialize absent fields as empty editable inputs **only within the editor** (editing is a present-field operation; this does not re-introduce `""` into the data model — on save, an untouched empty edit field maps back to `null`).
- **AI-Edit** (`handlePrecisionHookEdit`, `App.tsx` 3948) validates the result contains `HOOK_TEXT` before applying — unchanged; operates on present markers.
- **Batch** (6849–6898) extracts `hookRaw` per selected hook and calls `generateConcepts`; needs `HOOK_TEXT`+`SUBHEADLINE` markers to parse — confirm it tolerates an absent subhead (degrade path) rather than assuming it.

**Rationale:** these are existing flows; the only real risk is a hidden assumption that a field exists. Each is verified in quickstart.md. US3 is P2 because it rides on D7's render guards.

**Edit-mode caveat (explicit):** the inline editor uses `string` inputs (`editHookData`, 1758). To honor FR-006, the save handler (`handleInlineHookSave`) must convert an empty optional input back to `null`, not store `""`. This is the one place `""` legitimately exists transiently (inside a controlled input) and must be normalized on save.

---

## D9 — Testing strategy (FR-016, SC-009)

**Decision:**
- **Backend (primary, paranoid checkpoint T20):** new `functions/src/__tests__/conditionalCopyFields.test.ts` asserting: (a) headline-only output → 3 optional fields `null` + status `absent`, none `""`; (b) malformed optional field → status `parse_failure` after retry, value `null`, log emitted; (c) `validateCopyFidelity` passes with `null` optional fields and still fails on empty `hookText`; (d) dedup-blanked field → `null` + status `absent`; (e) whitespace-only field → `null` + `absent`; (f) `hookText` never `absent`; (g) present fields still carry Phase 22 claimFlag behavior. Extend `copyQuality.test.ts` for the parser-level absent-vs-failure cases.
- **Frontend (T19):** add a focused render test for a hook card with mixed field sets — assert absent fields produce no DOM node and their regenerate button is absent (not merely hidden via opacity). Use the existing `data-testid` hooks (`variation-carousel-${v}` 6745, `variation-active-text-${v}` 6800) and add per-field test ids as needed. (No step-2 test harness exists today — this establishes one.)

**Rationale:** Constitution IX (proof for every fix) + FR-016 require the absent-vs-failure distinction to be explicitly tested. The contract files (Phase 1) define the exact pass/fail rows.

---

## D10 — Confirmed "already-ready" downstream layers (no change required)

Verified during audit; listed so /speckit.tasks does NOT add work here:
- `buildFinalImagePrompt` conditionals on truthiness for all four fields (`generators.ts` 5170–5175) → handles `null` already.
- `validateCopyFidelity` skips empty/falsy non-`hookText` fields (`buildPlanSlotMap.ts` 724–739) → only needs a `null`-guard in the normalize helper, not logic change.
- Carousel `SHOW_CTA: yes/no` already blanks CTA/benefit on middle slides (`generators.ts` 7989, 8026–8033) → unchanged (OOS scope; carousel rendering rules not altered).
- `textCompositing.ts` counts only non-empty elements → unchanged (OOS-005, must not touch).
- `captionValidator.ts`, `culturalCompliance.ts` → unchanged (OOS-005).

---

## Open risks carried into planning

1. **Type-widening blast radius (D1):** the `string → string | null` change will surface TypeScript errors at every unguarded string-method call site. This is *desirable* (the compiler enumerates the work) but must be worked through exhaustively; `cd functions && npm run build` and `npm run build` (frontend) are the gate. Tracked as the primary risk on this paranoid-checkpoint phase.
2. **Edit-mode `""` re-entry (D8):** the inline editor is the one place `""` exists transiently; the save normalizer is easy to forget. Called out explicitly in the UI contract.
3. **`hookText` regression (D5):** must confirm the existing hard-fail + retry still fires and the `"⚠️ Hook unavailable"` path is never the normal absent path.
