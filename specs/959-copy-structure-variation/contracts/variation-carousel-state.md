# Contract: In-Card Variation Carousel (23.A)

**Feature**: 959-copy-structure-variation
**Surfaces**: `src/store.ts` (state), `src/App.tsx` (hook-card rendering ~L6420-6683, "Generate 4 More" handler ~L6628-6668), backend `serverGenerateTOV('refresh')` / `serverGenerateCarouselAngles`.

## State (store)

```typescript
type HookVariantKey = 'A' | 'B' | 'C' | 'D';

interface HookVariation {
  hookText: string;
  subhead: string;
  cta: string;
  benefit: string;
  rawBlock: string;                 // full HOOK_START/END or ANGLE_START/END block
  claimFlags?: { text: string; reason: string }[];
}

interface VariationCarouselState {
  variations: Record<HookVariantKey, HookVariation[]>;   // excludes the reference hook
  activeIndex: Record<HookVariantKey, number>;           // 0 = reference; 1..N = variations[i-1]
  capReached: Record<HookVariantKey, boolean>;
}
```

## Behavioral rules

| # | Rule | FR |
|---|---|---|
| C1 | First "Generate 4 More Like This" on card `v` pushes up to 4 variations into `variations[v]`; `activeIndex[v]` stays valid. They render INSIDE card `v` as positions 2–5. | FR-001 |
| C2 | New variations are NEVER appended to `tovText`/the hook list bottom; the reference hook (position 1) is never replaced or mutated. | FR-002 |
| C3 | Navigation (arrows + dots) moves `activeIndex[v]` within `[0, variations[v].length]`. | FR-003 |
| C4 | Approve / Edit / AI Edit / Batch operate on the active position: `activeIndex===0 ? referenceBlock : variations[active-1].rawBlock`. | FR-004 |
| C5 | Repeat clicks EXTEND `variations[v]` (append), never reset; hard cap 11 variations (12 positions incl. reference). | FR-005 |
| C6 | At cap, the click is refused: show "carousel is full" notice, do NOT call the backend, do NOT `deductCredits`. | FR-006 |
| C7 | Each non-refused click costs the existing `CREDIT_COSTS.refreshHooks` (unchanged); partial (<4 valid) still delivered + charged. | FR-006a |
| C8 | Zero valid variations returned → non-blocking notice, `variations[v]` unchanged, no dedupe relaxation. | FR-006b |
| C9 | Arabic (`lang==='ar'`): "next" advances leftward; variations render RTL (reuse lightbox arrow-swap pattern ~L9091). | FR-007 |

## Backend variation contract (per click)

- Same resolved **hook angle** + **structure** as the reference hook. FR-008.
- Obey all Phase 22 rules (≤6th-grade, lived-symptom, claimFlag) and pass the existing hook quality/validation (`validateCanonicalHooks`). FR-009.
- Genuinely different wording: different opening word, different metaphor, different concrete lived symptom; reuse 0 words from the reference; dedupe against ALL existing hooks in the set. FR-010.
- Reuse the existing carousel refinement prompt pattern (App.tsx ~L6640-6645) and extend it to the single-hook `'refresh'` path.
- Carousel-ad projects: each variation is an alternative slide-1 hook backed by its own slide set (`ANGLE_*` block), not a standalone single hook. FR-011.

## Acceptance (maps to spec)

- US1 scenarios 1–9; SC-001, SC-004, SC-005, SC-009, SC-010, SC-011.

## Out of scope (must NOT change)

- `validateCopyFidelity`, compositor, `textCompositing.ts` (FR-030); copy field count (FR-032); no new Step-2 dropdowns (FR-028).
