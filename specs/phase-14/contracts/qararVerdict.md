# Contract: Qarar Verdict Engine (Layer 4) + Two-Component Learning (Layer 4b)

**Feature**: `phase-14-rag-meta` · **US4 / US5**
**Transport**: pure functions invoked inside `metaSyncAccountWorker`. Source of truth: `specs/phase-14/qarar-rulebook.md`.

---

## `evaluateVerdict(ad, settings, baselines)` (pure, `qararEngine.ts`)

Evaluates creative-level rules in **exact order, first-match-wins** (spec §5.2), objective-gated by §5.6.

**Unified target (spec §5.2)**: every `effectiveTargetCPA` reference below is a single `effectiveTarget` variable = `effectiveTargetCPA` for paid funnels or `effectiveTargetCPL` for free funnels (free webinar/challenge, lead magnet → call), read from the funnel settings. For free funnels the engine evaluates **cost-per-lead** in the data gate, CB1/CB2, and S1; rules/thresholds/multipliers are identical — only the target value and cost metric change.

### Order
1. **Data gates** — CTR judgment needs ≥ 2,000–3,000 impressions OR spend ≥ 1× effectiveTargetCPA; exception: Link CTR < 0.5% callable at 1,500 impressions; ad ≥ 48h old; always 3-day rolling (except circuit breaker). Fail → `⏳` with an Arabic reason naming what's missing.
2. **Circuit breaker** (today only; bypasses gates; **conversion only**) — CB1 spend ≥ 1.5× effectiveTargetCPA & 0 conv → `🟡`; CB2 ≥ 2.5× & 0 conv → `🔴`.
3. **Kill** — K3 Link CTR < 0.5% after 1,500–3,000 imp → `🔴` `الهوك ميت — محدش بيوقف`; K4 day-1 peak then ≥ 50% drop by day 3 → `🔴` `كريتف فلاش — اتحرق في يوم`; K5 starved-ad matrix (`conversion` only) → leave / `🔴` / `🛟 رابح مخنوق — انقله لـ ad set جديد`.
4. **Fatigue** (`conversion` only) — Link CTR ↓ ≥ 25–30% from 3-day peak & CPM stable → `🟡` `إنهاك إبداعي — جدّد الكريتف`; CPM rising vs account متوسط → `🟡` `الخوارزمية بتعاقب الكريتف ده`.
5. **Continue/Scale** — S1 CPA ≤ effectiveTargetCPA (3-day) + Link CTR > account متوسط → `🟢` `رابح — مؤهل للترقية` (`conversion` only); else if gates met → `🟡 شغال — راقب`.

### Objective gating (§5.6.1) — `campaignObjective` from `campaignObjective.ts`
`conversion` = OUTCOME_SALES/CONVERSIONS/LEAD_GENERATION/OUTCOME_LEADS → **full engine + learning + RAG + winners**. **`other`** (all else incl. unknown, fail-safe) → **only K3 + K4 fire**; CB1/CB2/K1/K2/K5/K6/K7/fatigue/S1 disabled; never a winner; never learned from. Guarantees SC-12 (no kill on awareness/reach/engagement).

### Diagnosis ladder (§5.4) — for every 🔴/🟡
Run CPM → Link CTR → CTR-All vs Link CTR → LP View Rate → Page CVR → Post-conversion; stop at first broken level; output a one-line Arabic `diagnosisAr`.

### Output — `AdPerformanceRecord` verdict fields (spec §5.5)
```ts
{ verdict, ruleCode, reasonAr, diagnosisAr, geoTier, audienceType, campaignObjective, evaluatedAt, /* + metrics */ }
```

**Ad-set-level rules (§5.3)** K1/K2/K6/K7/W1–W6/S2–S4 are **deferred from v1** (no task computes them); the dashboard shows creative-level verdicts only. They never affect creative learning.

---

## Two-component learning — `updateAggregates(record)` (`learningAggregates.ts`)

- **Hook angle** aggregate ← Link CTR; **Visual pattern** aggregate ← CPM + Link CTR. Independent components (spec §6.1).
- Tag each record with three dimensions: **geoTier**, **audienceType**, **campaignObjective**. Only `byObjective.conversion` feeds icons/RAG/winners; `byObjective.other` is display-only and **never averaged into learning** (§6.2, §5.6.3).
- **Same image in multiple ad sets** → separate records per context; the creative is judged by its **best** context; a win anywhere = the creative works (§6.3).
- **Aliases** resolved to canonical before aggregation (`shocking_stat→statistics`, `fear_of_missing_out→urgency`, `future_pacing→future_based`).
- **Copy/caption NOT tracked in v1.**
- Writes `hookPerformance/{angleKey}`, `visualPerformance/{patternKey}`, and the `_accountOverall` summary (see data-model §5–6).
