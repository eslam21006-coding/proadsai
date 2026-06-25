# Quickstart: Verifying Universe-Aware Copy (Phase 27)

Step-by-step for a non-technical founder to confirm the feature works. Backend-only — there is nothing new to click in the UI.

## What "working" looks like
- Pick a **fantasy** universe → the ad's words carry one subtle touch that echoes the world (e.g. a single evocative word), and the picture has a matching element. The audit trail says `applied: true`.
- Pick a **realistic** or **minimal** universe → the words stay plain and direct, exactly like before. Audit says `applied: false`.
- Attach a **reference ad**, or use **text-only**, or look at **carousel slides 2+** → no metaphor. Audit explains why.

## 1. Backend unit test (fastest, no app needed)
From the repo root:
```
cd functions
npm run build
node lib/__tests__/universeCopyMap.test.js
```
**Pass = all Contract A–E assertions green** (decision table, strict/relaxed emission, blueprint instruction, trace shape, reversibility). This is the deterministic proof the logic is correct.

Or run the whole suite:
```
cd functions
npm test
```

## 2. Local end-to-end (`npm run dev`)
1. Start the dev server: `npm run dev` (from repo root).
2. Generate a **single ad** with a **fantasy** universe (e.g. a mythic-epic world) and any hook. Read the copy — it should have at most one subtle universe-echoing word/phrase that still makes sense on its own. Open the generation's resolution trace and confirm:
   `universeAwareCopy: { applied: true, styleFamily: 'fantasy', reason: 'fantasy-universe-metaphor-active' }`.
3. Generate the same with a **realistic** universe — copy stays literal; trace `applied: false, reason: 'realistic-no-metaphor'`.
4. Generate with **minimal** family — literal; trace `reason: 'minimal-no-metaphor'`.
5. Generate a **fantasy** ad **with a reference ad** attached — no metaphor; trace `reason: 'reference-ad-override'`.
6. Generate a **text-only** ad with a fantasy universe — no metaphor; trace `reason: 'text-only-mode'`.
7. Generate a **fantasy carousel** — slide 1 may carry the metaphor (`fantasy-universe-metaphor-active`); slides 2+ stay literal (`carousel-non-hook-slide`).
8. Generate with a **custom fantasy universe** (type your own world) — the metaphor draws from your text; trace `applied: true, styleFamily: 'fantasy'`.

## 3. Production test (after deploy)
Repeat steps 2–3 on production with one fantasy and one realistic generation; confirm the same trace values and that realistic copy is unchanged from before.

## How to confirm "nothing else changed"
- Realistic + minimal copy reads identically to pre-Phase-27 (the strict rule is untouched).
- No new buttons/screens; no price or plan change.
- The gaze (Phase 19) and expression (Phase 28) behavior is unchanged.

## Reversibility (if needed)
Neutralizing the mapper (strict-for-all) restores byte-identical pre-Phase-27 prompts for every family — the strict text is retained as a commented original at each site. No data cleanup needed (the trace field is additive/optional).

## Gate order (do not skip)
implement → build → test → commit → push → PR → CodeRabbit (fix ALL comments) → Claude audit → test on `npm run dev` → merge via GitHub UI → deploy functions → production test.
