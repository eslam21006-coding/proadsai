# Audit Fixes Report — Phase 22 Copy Scoring Gate

**Branch**: `phase-22-copy-quality`
**Audit source**: `specs/966-copy-scoring-gate/reports/claude-audit.md`
**Date**: 2026-08-03

---

## Verdict after fixes

| # | Defect | Severity | Status |
|---|---|---|---|
| **D1** | Untouchable-preservation check discards every rewrite | BLOCKER | **Fixed** |
| **D2** | Trace transport chain severed at frontend | BLOCKER | **Fixed** |
| **D3** | Claim-flag re-emission unimplemented | BLOCKER | **Fixed** |
| **D4** | Client-controllable kill-switch override | non-blocking | **Fixed** (removed) |
| **D5** | Dead field names `slideCaption` / `testimonialHook` / `testimonialClose` | non-blocking | **Fixed** (used) |

---

## D1 — Untouchable check (BLOCKER)

**Before.** `substituteFieldsInBlock` asserted every untouchable string was present in the rewritten block *without first checking* it was in the original. Advertiser form fields (productName / offer / cta / brandName) rarely appear verbatim in the generated block, so the check failed on every rewrite — silently discarding accepted improvements while the audit trail reported `accepted: true`.

**Fix.** Require presence only for untouchable strings the original block already contained:

```ts
for (const u of untouchable) {
  if (u && u.length > 0 && rawBlock.includes(u) && !out.includes(u)) {
    return { newBlock: rawBlock, ok: false };
  }
}
```

**Audit-trail integrity.** When the substitution step rejects a rewrite, every rewrite decision recorded as `accepted: true` for that pass is now flipped to `accepted: false, rejectReason: "block_unparseable" | "block_structure_violated"` and `gaveUp` is set to `true`. The audit trail can never report success for a feature that did nothing.

**Tests added.** `functions/src/__tests__/copyScoringGate.test.ts`:
- D1: untouchable strings absent from the block → `ok: true` (was bug).
- D1: untouchable-in-original preserved; other ignored.
- D1 audit trail: substitution failure preserves original block; rewrite decision is rejected with `block_unparseable`; `gaveUp` is `true`.

---

## D2 — Trace transport (BLOCKER)

**Before.** The backend wrote `copyScoringTrace` into callable responses and `serverGenerateFinalAd` accepted it, but the frontend never read or forwarded it. `ResolutionTrace.copyScoring` was never persisted.

**Fix.** Implemented the opaque frontend passthrough mirroring the `conceptDirectorTrace` pattern:

**`src/services/geminiService.ts`**
- New `CopyScoringTrace` type mirroring `ResolutionTrace.copyScoring`.
- `sanitizeCopyScoringTrace(v: unknown): CopyScoringTrace | null` — validates the discriminator (`ran` boolean), the closed `skipReason` enum, and drops any extra keys so a tampered request cannot inject arbitrary fields.
- `GenerationResult` gains `copyScoringTrace?: CopyScoringTrace | null`.
- `parseGenerationResult` extracts `data?.copyScoringTrace` through the sanitizer.
- `generateFinalAd` accepts `copyScoringTrace?: CopyScoringTrace | null` and forwards it in the request payload via `sanitizeCopyScoringTrace(...) ?? undefined`.

**`src/App.tsx`**
- New state: `const [copyScoringTrace, setCopyScoringTrace] = useState<CopyScoringTrace | null>(null)`.
- `unwrapGen` reads `result.copyScoringTrace` and stores it in state (mirror of `conceptDirectorTrace`).
- All 8 `generateFinalAd` call sites forward `copyScoringTrace` alongside `conceptDirectorTrace`.

**`src/types.ts` → `src/services/geminiService.ts`**
- `CopyScoringTrace` type imported as part of the `geminiService` export.

---

## D3 — Claim flags (BLOCKER)

**Before.** `validateRewriteResponse` parsed `claimFlags` into the rewriter-response map, but nothing read them. Stale flags survived on rewritten fields. Newly fabricated specifics in rewrites shipped unflagged.

**Fix.**
- `RewriteDecision` (gate) and the matching `CopyScoringStepTrace` field (types) gain `claimFlags?: ReadonlyArray<{ text: string; reason: string }>`.
- `validateRewriteResponse` (gate) now always stores the entry — even with an empty `claimFlags` array — so the downstream step can distinguish "no new flags" (clear originals) from "no entry at all" (skip the variation).
- The accepted-rewrite push (`gateCopySetInner`) propagates `claimFlags: rewritesByField.get(k)?.claimFlags`.
- `applyClaimFlagsToBlock(block, flagsByField)` (new helper) is called after `substituteFieldsInBlock`:
  - For each variation in the block, drop the original `CLAIM_FLAG:` lines.
  - Append the rewriter's flags (formatted as `CLAIM_FLAG: <text> — <reason>`) just before the variation's `HOOK_END_<X>` marker.
  - Reconstructs the `HOOK_START_<X>` prefix that the regex consumed — without this, the result loses the marker and `blockStructurePreserved` rejects the block.
- When the rewriter's `claimFlags` is empty, the original flags are cleared and no new flags are added — no stale claim survives an accepted rewrite.

**Tests added.** `functions/src/__tests__/copyScoringGate.test.ts`:
- D3: original stale flag is cleared; the rewriter's flag is emitted.
- D3: empty `claimFlags` clears the original flag; no empty `CLAIM_FLAG` lines remain.

---

## D4 — Client-controllable override (non-blocking)

**Before.** `inputs._copyScoringOverrideEnabled` was honored by the TOV attach point, letting any authenticated caller disable the gate for one request — directly contradicting FR-019c/FR-019d ("no per-user, per-plan, per-workspace granularity").

**Fix.** Removed the override. The TOV attach point now reads `COPY_SCORING_ENABLED` directly, matching the carousel and testimonial attach points. The gate-off baseline for SC-002/SC-004/SC-005a/SC-006 is produced by toggling the module-level constant and redeploying (research R7, `quickstart.md:134`).

---

## D5 — Dead field names (non-blocking)

**Before.** `FieldName` declared `slideCaption`, `testimonialHook`, `testimonialClose` but the carousel and testimonial paths always produced `hookText`. The audit trace could not distinguish a slide caption from a hook (SC-009).

**Fix.**
- `GateInput` gains `defaultFieldName?: FieldName` (defaults to `hookText`).
- `parseBlockIntoFields` accepts the override and uses it for any `HOOK_TEXT:` label it encounters; `SUBHEADLINE` / `CTA_BUTTON` / `BENEFIT` still map to their dedicated names.
- `generateCarouselSlideCopies` passes `defaultFieldName: "slideCaption"`.
- `generateTestimonialCarousel` passes `defaultFieldName: "testimonialHook"`.

The trace now records the correct field name for each copy-producing step.

---

## Build & test results

| Command | Result |
|---|---|
| `npm run build` in `functions/` | ✅ **PASS** — TypeScript clean |
| `npm run test:copyScoringGate` | ✅ **135 / 135** |
| `npm test` (full suite) | ✅ **PASS** — exit 0, zero regressions |
| `npx tsc -b` in repo root | ✅ **PASS** |
| `npx vite build` in repo root | ✅ **PASS** — dist built (chunk-size warnings only) |

---

## What did not change

- `MODEL_PROVIDER` and `COPY_SCORING_ENABLED` module-level constants (FR-019c, FR-019e — code, not env).
- The 9-dimension scoring rubric and threshold rule (FR-002, FR-006).
- The 5-interaction / 20-second / 60-second budgets (FR-016).
- The `conceptDirectorTrace` passthrough (untouched).
- The `extractClaimFlagsFromResponse` parser (untouched — runs on the final block after the gate).
- The `parseBlockIntoFieldsForSlides` reverse-mapping helper (untouched).
- Captions are out of scope (FR-025) — unchanged.

---

## Files changed

- `functions/src/copyScoringGate.ts` — D1, D3, D5
- `functions/src/types.ts` — D3 (claimFlags in `ResolutionTrace.copyScoring`)
- `functions/src/generators.ts` — D1, D4, D5
- `functions/src/__tests__/copyScoringGate.test.ts` — D1, D3, D5
- `src/services/geminiService.ts` — D2 (CopyScoringTrace, sanitizer, passthrough)
- `src/App.tsx` — D2 (state, forwarding)