// functions/src/learning/types.ts — shared feature types for cumulative learning
// ════════════════════════════════════════════════════════════════════════════════
// Every type the six learning/ modules (and the fixtures they share)
// import from a single file. The mapping is column-per-field per
// `specs/969-cumulative-learning/data-model.md` §1; cross-checked
// against `contracts/creativeGrouping.md`, `contracts/learningLease.md`,
// `contracts/contributionLedger.md`, and `contracts/conversionAccrual.md`.
// Three different things live on the ad row — `contributionState`,
// `efficiencyRaw`, and `ledger.efficiencyContributed` — and conflating
// them is the failure mode this single-file discipline exists to prevent.

// ─── Link provenance (FR-074e, FR-074f, data-model.md §1) ──────────
// Separate field from `matchType`. Precedence: manual > direct_auto > propagated.
// A `propagated` row keeps `matchType: null` so the precedence lock at
// `metaSync/shared.ts:864-869` does not fire and the row stays re-derivable.
export type LinkProvenance = "manual" | "direct_auto" | "propagated" | null;

// ─── Creative grouping (contracts/creativeGrouping.md) ──────────────
// `AdRowForGrouping` is the **input** shape `groupIntoCreatives` consumes.
// It is a deliberately narrow projection of `AdDoc` — only the fields
// the grouping decision reads — so the function stays pure (no Firestore).
export interface AdRowForGrouping {
    adId: string;
    imageHash: string | null;
    generationId: string | null;
    matchType: "auto_hash" | "manual" | null;
    linkProvenance: LinkProvenance;
}

// `CreativeGroup` is the **output** of `groupIntoCreatives`. The creative
// itself is never stored (data-model.md §4); the group is recomputed each
// sync. `contributes: false` is the FR-075 bookkeeping-only case.
export interface CreativeGroup {
    creativeKey: string;
    generationId: string | null;
    rows: AdRowForGrouping[];
    resolvedProvenance: LinkProvenance;
    contributes: boolean;
}

// ─── Contribution state (FR-005a, FR-005b, FR-005c, FR-036c) ───────
// Per-row state machine, one-way. The creative's state is **derived** by
// FR-036c (any SEALED ⇒ SEALED), never stored.
export type ContributionState = "PROVISIONAL" | "SEALED";

// ─── Contribution ledger entry (data-model.md §2) ───────────────────
// The sole mechanism of idempotency (FR-016). Comparison outcomes per
// FR-017: absent → add; identical → no-op; differs → withdraw then add.
export type LedgerBucket = "conversion" | "other";

export interface ContributedValues {
    ctrLink: number;
    cpm: number;
    verdictMark: string;
    // Catch-all so the ledger can reproduce exactly the values it folded in
    // (FR-016, FR-021). Without this, a future measure added to the
    // aggregator would silently round-trip through `add` then `withdraw`.
    [key: string]: unknown;
}

export interface ContributionLedgerEntry {
    creativeKey: string;
    angleKey: string | null;
    patternKey: string | null;
    bucket: LedgerBucket;
    geoTier: string;
    audienceType: string;
    contributedValues: ContributedValues;
    // FR-011(a) — the comparison basis for re-evaluation. Same value means
    // "no material change", which is a no-op (FR-017).
    measurementInputs: Record<string, unknown>;
    // FR-079 — write-once marker. Distinct from the row's own state
    // machine (FR-005a) and from `efficiencyRaw`. Three different things
    // on the row, kept separate here (data-model.md §1, §5).
    efficiencyContributed: boolean;
    // FR-002a — the figure as contributed.
    efficiencyValue: number | null;
    // FR-042 — schema version. Below current ⇒ read as absent (FR-043).
    schemaVersion: number;
}

// ─── Day accrual (data-model.md §3, FR-081–FR-086a) ────────────────
// Per-(ad row, date) deduplication (FR-084). Window membership is pure
// date arithmetic; no stored flag (FR-084a).
export interface ObservedWindow {
    // ISO-8601 date strings (YYYY-MM-DD), inclusive bounds.
    since: string;
    until: string;
}

export interface DayAccrual {
    // FR-083, FR-084 — only days still inside the observed window.
    // An absent daily row is NOT recorded as zero — the key is simply
    // not written (FR-085a).
    days: { [isoDate: string]: number };
    // FR-084a — sum of days that have left the window. Collapsing is
    // mandatory (SC-023) and lossless (FR-083 makes finalised days
    // immutable).
    finalisedTotal: number;
    // FR-084a — count of finalised days. Retained so the total can be
    // sanity-checked, and as input for FR-086's gap count.
    finalisedDayCount: number;
    // FR-086a — the window bounds of the last sync, for gap arithmetic.
    lastObservedWindow: ObservedWindow | null;
}

// ─── Learning lease (data-model.md §7, FR-054–FR-064) ──────────────
// NEW collection, distinct from `metaSyncLeases/{ownerUid}`. Acquired
// and released atomically in a single-document transaction (FR-056).
// Holder identity is verified on release (FR-058) and pre-commit
// (FR-062). TTL is 15 min (FR-059).
export type AcquireResult =
    | { ok: true }
    | { ok: false; reason: "held"; holderUid: string; expiresAtMs: number };

// ─── Schema version (FR-042, FR-043, FR-044, FR-045) ───────────────
// Bumping this number signals a shape change. Below-version records
// read as absent (FR-043) and are replaced in full on first write
// (FR-044) — never incremented onto (FR-045).
export const CURRENT_LEARNING_SCHEMA_VERSION = 1;
