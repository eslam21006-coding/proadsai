# Contract: `ResolutionTrace.reflowHistory[]` extension

**Spec**: [../spec.md](../spec.md) · **Plan**: [../plan.md](../plan.md) · **Data Model**: [../data-model.md](../data-model.md)

## Summary

Extend the existing `ResolutionTrace` (defined in `functions/src/types.ts`, built in `functions/src/resolutionTrace.ts`) with one optional new field: `reflowHistory: ReflowHistoryEntry[]`. Every **successful** reflow item appends one entry — failed items surface their error via the per-item `ReflowOutcome` payload returned to the caller, but do NOT write a `reflowHistory` entry. This keeps the persisted history canonical (only entries with a real `outputUrl` and `creditsCharged > 0`) and is the FR-024 / FR-025 traceability surface for the new reflow router.

## Schema

```ts
interface ReflowHistoryEntry {
    timestamp: number;                              // Unix ms

    sourceRatio: AspectRatio;
    targetRatio: AspectRatio;
    magnitude: number;                              // symmetric fold-change, [0, ∞)

    method: 'outpaint' | 'rerender';                // route that ultimately delivered
    userOverride: 'outpaint' | 'rerender' | null;   // null when auto

    fallbackFrom: 'outpaint' | 'rerender' | null;   // null when no fallback
    fallbackReason: ReflowFallbackReason | null;

    itemIndex: number | null;                       // null for scope='single'
    outputUrl: string;                               // always populated; failed items are not persisted as entries
    creditsCharged: number;                          // always > 0 (no-op short-circuits do not produce entries)
}

type ReflowFallbackReason = 'engine_error' | 'drift' | 'no_plan' | 'mask_error' | 'transient';
```

See [../data-model.md](../data-model.md) for the full TypeScript definitions.

## TraceBuilder API extension

`functions/src/resolutionTrace.ts::createTraceBuilder()` returns a `TraceBuilder`. Add one method:

```ts
interface TraceBuilder {
    // … existing methods preserved …

    /**
     * Append one reflow history entry. Called once per reflow item completion.
     * The TraceBuilder accumulates entries; `build()` produces a frozen
     * ResolutionTrace with `reflowHistory: ReadonlyArray<ReflowHistoryEntry>`.
     */
    addReflowHistoryEntry(entry: ReflowHistoryEntry): TraceBuilder;
}
```

Internal state additions in `ResolutionTraceDraft`:

```ts
type ResolutionTraceDraft = Partial<Mutable<ResolutionTrace>> & {
    autoSwitchEvents: AutoSwitchEvent[];
    _culturalViolation?: ResolutionTrace["culturalViolation"];
    _logoPipeline?: LogoPipelineEvents;
    _reflowHistory?: ReflowHistoryEntry[];   // NEW
};
```

`build()` adds:

```ts
return Object.freeze({
    // … existing fields …
    reflowHistory: state._reflowHistory ? state._reflowHistory.map(e => ({ ...e })) : undefined,
});
```

## Persistence

The `reflowImage` callable does **not** rebuild the trace from scratch. The TraceBuilder is used inside `reflowImage.ts` to construct each `ReflowHistoryEntry`, and the entries are written to Firestore via the array-append transaction described in [../research.md](../research.md) §R7.

`persistTrace(genId, trace)` (existing function in `resolutionTrace.ts`) is **not** the path used by the reflow callable, because that function `set(... { merge: true })` would not append to an existing array correctly. Instead, the reflow callable performs an explicit transactional read-modify-write of `resolutionTrace.reflowHistory`:

```ts
await db.runTransaction(async (tx) => {
    const ref = db.collection('generations').doc(genId);
    const snap = await tx.get(ref);
    const existing = snap.data()?.resolutionTrace?.reflowHistory ?? [];
    const updated = [...existing, newEntry];
    tx.set(
        ref,
        {
            mockupHistory: admin.firestore.FieldValue.arrayUnion({ url, ratio }),
            resolutionTrace: { reflowHistory: updated },
        },
        { merge: true }
    );
});
```

`mockupHistory` uses `arrayUnion` (idempotent for unique URL+ratio pairs); `reflowHistory` uses explicit read-modify-write because each entry has a unique `timestamp` and is non-idempotent.

## Read-side consumers

The frontend reads `reflowHistory` via the existing `generations/{genId}` snapshot path (`onSnapshot` already in use elsewhere). No new client subscription is required. Optional surfaces that may consume `reflowHistory` (out of scope for this hotfix but unblocked):

- Support tooling: render the per-reflow trace as a timeline of routes and fallbacks for debugging.
- Performance dashboards: aggregate `magnitude` distribution to validate the 30 % threshold post-release.

This contract intentionally exposes the data; consumption is left to follow-up phases.

## Schema validation rules

| Rule | Source |
|---|---|
| `timestamp` MUST be a positive integer (Unix ms). | (data integrity) |
| `magnitude` MUST be ≥ 0; values exactly equal to 0 indicate no-op reflows that should never have produced an entry; the writer MUST NOT emit no-op entries. | FR-005, FR-018 |
| `method` and `userOverride` together MUST satisfy: if `userOverride !== null`, `method === userOverride`. | FR-024, research.md R6 |
| `fallbackFrom` and `fallbackReason` MUST be both null or both non-null. | (data integrity) |
| When `userOverride !== null`, `fallbackFrom` MUST be null (no fallback on user override). | research.md R6 |
| `itemIndex` MUST be null for `scope === 'single'` and a non-negative integer for multi-item scopes. | (data integrity) |
| `outputUrl` MUST be populated and non-empty (only successful items persist entries). | FR-014, FR-029 |
| `creditsCharged > 0` MUST hold (no-op short-circuits do not produce entries; failed items return `ReflowOutcome.success === false` with no entry). | FR-018, FR-019 |

## Backward compatibility

- Records without `reflowHistory` continue to load. Frontend rendering treats `undefined` as "no reflows yet."
- Adding `reflowHistory` to `ResolutionTrace` does NOT break existing `ResolutionTrace` consumers (e.g. `failureClassification`, `culturalViolation` reporting) — the field is optional.
- The `TraceBuilder` is additive: existing `set*` methods unchanged; existing callers of `build()` get an extra optional field they can safely ignore.
