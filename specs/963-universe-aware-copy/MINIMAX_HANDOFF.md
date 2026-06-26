# Minimax Handoff — Phase 27: Universe-Aware Copy

> **Re-feed this entire file to Minimax at the start of every session** — it has no memory between sessions and needs full context each time.

---

## Task

Implement **Phase 27 — Universe-Aware Copy** in worktree `D:\proads-worktrees\963-universe-aware-copy` (branch `963-universe-aware-copy`, already checked out). Commits pushed here land in **PR #48** automatically (spec + code in one PR).

**One-line summary**: when the resolved style family is **fantasy**, conditionally relax the copy `METAPHOR RULE` to allow one subtle universe-echoing word/phrase, and make the rendered image describe a matching visual element. **Realistic / minimal / unknown** stay strictly literal. Suppress for reference ads, text-only, and carousel slides 2+. Record an additive `universeAwareCopy` resolution-trace field. Mirror the Phase 19 (gaze) / Phase 28 (expression) pattern exactly.

---

## Read these committed files FIRST, in this order (your full context)

1. `specs/963-universe-aware-copy/spec.md` — what to build + the 3 clarified decisions
2. `specs/963-universe-aware-copy/plan.md` — architecture + verified code anchors
3. `specs/963-universe-aware-copy/research.md` — exact `generators.ts` / `types.ts` line anchors
4. `specs/963-universe-aware-copy/data-model.md` — trace field shape + decision precedence table
5. `specs/963-universe-aware-copy/contracts/universe-copy-decision.md` — Contracts A–E (your test spec)
6. `specs/963-universe-aware-copy/tasks.md` — **execute T001 → T034 in order**

## Read the precedent BEFORE writing anything

The new module is a near-clone of these — copy the pattern (pure module, NO Gemini/Firebase calls, local `assert()` shell with pass/fail counter, `process.exit(1)` on failure):

- `functions/src/gazeMap.ts` + `functions/src/__tests__/gazeMap.test.ts` (Phase 19)
- `functions/src/expressionMap.ts` + `functions/src/__tests__/expressionMap.test.ts` (Phase 28)

---

## Hard rules (do not skip)

- **Re-confirm every line number before editing.** `functions/src/generators.ts` is ~5700 lines and may have drifted from the anchors in `research.md`. Verify, don't trust blindly.
- **Lift strict text byte-for-byte.** `STRICT_METAPHOR_BLOCK` and `STRICT_METAPHOR_REFRESH_LINE` must equal the current `generators.ts` text exactly (Contract E / reversibility depends on it). Do not paraphrase. Keep the original strict text as a commented reference at each site (FR-016).
- **Circular-import guard (T003).** `universeCopyMap.ts` must NOT import from `types.ts`. The `UniverseCopyReason` union is defined in the mapper and imported one-directionally into `types.ts`. If a cycle would form, inline the 6-value literal union in `types.ts` instead. `npm run build` must show no circular-dependency warning.
- **T012 is VERIFY-THEN-INJECT.** Do NOT assume `generateBuildPlan` is the injection site. Confirm where the rendered scene that feeds the image `TECHNICAL_PROMPT` is authored — Phase 28 used `generateConcepts()` (~L3100). Inject the blueprint visual block at the real scene-authoring site (likely `generateConcepts`; both if both contribute). Acceptance: a fantasy generation's final `TECHNICAL_PROMPT` actually contains the metaphor visual instruction.
- **T020 is VERIFY-THEN-PIN.** Use ONE canonical reference-ad signal — `referenceAdPresent = !!(inputs as any).referenceAd` — at all three call sites (copy / scene / trace). Do NOT use `referenceAdOverrideActive` (only in scope inside `generateFinalAd`; would diverge).
- **`applied` is prompt-level**, not output verification. `applied: true` means the relaxed block was emitted. Trace shape is EXACTLY `{ applied, styleFamily, reason }` — no `metaphorContent` / `visualElementSuggestion` fields. `styleFamily` is always the resolved family, never null.
- **Advisory cap.** The subtlety limit ("one subtle word/phrase, no full themed sentence") is prompt wording only. Do NOT add any post-generation validator or rejection pass.

## Do NOT touch

- Frontend (`src/`) — no UI change
- No new Firebase callable; no change to existing callable signatures
- No Firestore schema migration (the trace field is additive/optional)
- The gaze (Phase 19) or expression (Phase 28) prompt blocks
- `buildFinalImagePrompt` structure; `validateCopyFidelity`
- No pricing / plan-gating / credit change

---

## Mandatory checkpoint (STOP and report)

After **T009** (Foundational complete), run:

```
cd functions
npm run build
node lib/__tests__/universeCopyMap.test.js
```

**Contracts A + E must be green** before proceeding to US1 (Phase 3). Report the result. Do not continue if red.

Then after US1 (T016) and again at Polish (T030): `cd functions; npm run build; npm test` must be fully green, and `npm run lint` (repo root) clean for touched files.

---

## Files you are expected to touch (and only these)

- `functions/src/universeCopyMap.ts` — NEW (pure mapper: decision fn + strict constants + relaxed block + blueprint block)
- `functions/src/generators.ts` — EDIT (2 `generateTOV` copy sites + scene-authoring injection + trace write)
- `functions/src/types.ts` — EDIT (add `ResolutionTrace.universeAwareCopy?`)
- `functions/src/__tests__/universeCopyMap.test.ts` — NEW (Contracts A–E)
- `functions/package.json` — EDIT (register the new test script, like `test:gazeMap`)
- `docs/LAUNCH_MATRIX.md` — EDIT at T033 (mark Phase 27 status; fix the stale "subheadline/benefit (not headline)" note to "Gemini's choice across headline/subheadline/CTA/benefit")

`git diff --stat` at the end should touch only the above + the spec docs (T032 audit).

---

## Hardened gate order (the whole delivery path)

implement → build → test → commit → push (onto `963-universe-aware-copy` → PR #48) → CodeRabbit (fix ALL comments) → Claude audit → test on `npm run dev` (localhost, run every quickstart §2 scenario) → merge via GitHub UI → deploy functions → production test (quickstart §3).

When your commits are pushed, tell Eslam/Claude — Claude runs the **audit against Contracts A–E** before CodeRabbit + localhost QA.

## Environment notes

- PowerShell syntax (use `;` to chain, not `&&`).
- Main repo is `D:\Pro Ads AI - SaaS - FAL`; this phase's worktree is `D:\proads-worktrees\963-universe-aware-copy` — work in the worktree.
