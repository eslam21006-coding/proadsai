// functions/src/learning/index.ts — barrel re-export for the cumulative-learning feature module
// ════════════════════════════════════════════════════════════════════════════════
// Re-exports the feature's own types and the six modules named in
// `specs/969-cumulative-learning/plan.md` §Project Structure. The six
// module files are added in Phases 2 (creativeGrouping, learningLease),
// 3 (contributionLedger, aggregateDelta), 4 (conversionAccrual,
// efficiencyFigure), so only the type re-export exists at this point.
//
// Every module added in a later phase MUST be re-exported here so that
// the barrel remains the single import path for the feature.
export * from "./types.js";

// ─── Phase 2 — creative grouping + learning lease ───────────────────
export * from "./creativeGrouping.js";   // FR-073, FR-074, FR-074a-g
export * from "./learningLease.js";      // FR-054–FR-065 (new collection)

// ─── Phase 3 — contribution ledger + delta aggregation ─────────────
// export * from "./contributionLedger.js"; // FR-016, FR-017, FR-018, FR-046
// export * from "./aggregateDelta.js";     // FR-015, FR-019–FR-022

// ─── Phase 4 — conversion accrual + efficiency figure ──────────────
// export * from "./conversionAccrual.js";  // FR-081–FR-086a
// export * from "./efficiencyFigure.js";   // FR-002, FR-002a, FR-003, FR-077–FR-080, FR-087
