# Quickstart & QA: Phase 23 — Conditional Copy Structure, Anti-Sameness & Variation Carousel

This is the manual + automated validation guide. Every check maps to a Success Criterion (SC) or Functional Requirement (FR).

## Build & test

```bash
# backend unit tests (pool draw, opening rotation, memory bias, slide-plan rotation)
cd functions && npm test

# frontend type/build
npm run build
npm run lint
```

New backend tests to author:
- `functions/src/__tests__/copyDiversity.test.ts` — `drawDimensions` returns 4 distinct ids; varies across seeds (SC-002); `rotateOpenings` varies across seeds (SC-003); memory bias never starves the pool, always returns 4, LRU fallback when all recent (SC-008); determinism for fixed `(seed, memory)`.
- `functions/src/__tests__/slidePlanRotation.test.ts` — across seeds: middle order rotates (SC-006/B1), no adjacent repeat (B2), CTA slide 1+last only (B3), photo slide 1 only (B4), throws outside 2–9 (B5), deterministic (B6).
- Existing `copyQuality.test.ts` and `contractFixtures.test.ts` MUST stay green (Phase 22 unchanged; scoring/rewrite still inert).

## 23.A — In-card variation carousel (manual)

| Step | Action | Expected | Check |
| --- | --- | --- | --- |
| A1 | Generate a hook set in Step 2, click "Generate 4 More Like This" on card B. | 4 variations appear INSIDE card B as positions 2–5; reference stays at position 1; nothing appended to list bottom. | SC-001, FR-001/002 |
| A2 | Use arrows + dots on card B. | Displayed variation changes; active dot updates. | FR-003 |
| A3 | Navigate to position 3, click Edit / AI Edit / Approve / Batch. | Action targets the displayed variation, not the reference or other cards. | FR-004 |
| A4 | Click "Generate 4 More" on card B again. | Existing carousel EXTENDS (more positions); not reset. | FR-005 |
| A5 | Keep clicking until 12 positions. | Further clicks refused with a "carousel is full" notice; no credit deducted. | FR-006, SC-009 |
| A6 | Inspect variations vs reference. | Same angle; different opening word/metaphor/lived symptom; 0 reused words; no duplicate of any existing hook. | FR-008/010, SC-004 |
| A7 | Force the gate to reject all candidates (e.g., tiny/edge input). | Non-blocking notice; card carousel unchanged; no low-quality/duplicate inserted. | FR-006b, SC-011 |
| A8 | Switch to Arabic, repeat A1–A2. | "Next" advances leftward; variations render RTL; cultural-compliance intact. | FR-007, SC-010 |
| A9 | Carousel-ad project: "Generate 4 More" on a carousel card. | Card scrolls alternative slide-1 hooks, each backed by its own slide set. | FR-011 |

## 23.B — Single-hook anti-sameness (manual)

| Step | Action | Expected | Check |
| --- | --- | --- | --- |
| B1 | Lock one angle; run 5 consecutive NEW projects for the same user. | Locked angle identical all 5 times. | FR-012, SC-002 |
| B2 | Compare the 4 dimensions used across the 5 projects. | Dimension set differs in ≥3 of 5 projects (not fixed A=Financial/B=Time order). | FR-014, SC-002 |
| B3 | Compare opening structures across the 5 projects. | Opening combination differs in ≥3 of 5. | FR-015, SC-003 |
| B4 | Inspect `resolutionTrace.copyDiversity`. | Records seed, drawn dimension ids, opening ids, memoryBiasApplied, fingerprintsConsidered. | Principle VI |
| B5 | Diff `hookAnglesKnowledge.ts` migrated dimensions. | First-4 psychology + Arabic text byte-identical to before; pool size 6–8. | FR-013 |
| B6 | Confirm temperature constants. | 1.0 / 1.2 / 0.6 unchanged at `generators.ts:2450, 2528`. | FR-018 |
| B7 | First-ever project for a fresh user. | Generates successfully with rotation only (no memory). | SC-008 |

## 23.C — Carousel anti-sameness (manual)

| Step | Action | Expected | Check |
| --- | --- | --- | --- |
| C1 | Run 5 consecutive NEW carousel projects. | The 4 offered story-direction families differ in ≥3 of 5; middle-slide angle order differs in ≥3 of 5. | FR-019/020, SC-006 |
| C2 | Inspect each generated slide plan. | No adjacent middle-slide angle repeat; CTA only slide 1 + last; photo only slide 1. | FR-021, SC-007 |
| C3 | Generate a 2–3 slide carousel. | Invariants still hold with few/no middle slides. | Edge case |
| C4 | Review the PR diff. | `slidePlanEngine.ts` + `generators.ts` + spec-001 contract + reference carousel section all changed together and consistent. | FR-022 |

## Preserved-invariant regression sweep

| Check | Expected | FR |
| --- | --- | --- |
| `modelConfig.ts:3` | `MODEL_PROVIDER` line present and intact. | FR-025 |
| Commented Gemini/Sharp code | Still commented, not deleted. | FR-026 |
| `captionValidator.ts` / cultural-compliance | Untouched; GCC/Meta + Arabic guards pass. | FR-024, FR-027 |
| Copy fidelity gate / compositor / `textCompositing.ts` | Untouched. | FR-030 |
| Copy field count | Still 4 fields. | FR-032 |
| `COPY_SCORING_DIMENSIONS` / `COPY_REWRITE_DIAGNOSES` | Still inert, not wired into any loop. | FR-031 |
| No new Step-2 dropdowns | Only the in-card carousel is new in the UI. | FR-028 |
| No `creativeTextDirector.ts` | Not introduced. | FR-029 |
| No hosting deploy | Not performed in this PR. | FR-033 |

## Done = all green

All three sub-tracks ship in ONE PR. The PR is launch-ready when: backend unit tests pass, Phase 22 tests stay green, the 23.A/B/C manual tables pass, and the preserved-invariant sweep is clean.
