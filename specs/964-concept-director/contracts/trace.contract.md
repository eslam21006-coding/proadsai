# Contract D — Resolution trace (`functions/src/types.ts`)

Additive, optional sub-object on the existing `ResolutionTrace`. No migration. Follows the `expressionAdaptation` / `gazeDirection` precedent.

## D1 — Type

```ts
readonly conceptDirector?: {
  readonly ran: boolean;
  readonly enabled: boolean;       // per-user flag value
  readonly killSwitch: boolean;    // global kill-switch value at run time
  readonly mode: "balanced";       // variance mode used (fixed this build)
  readonly conceptCount: number;   // briefs attempted (3 on the live path)
  readonly fallbackCount: number;  // concepts that fell back to existing logic (0..conceptCount)
  readonly validatorTriggered: boolean; // a blocking violation was found
  readonly retryCount: number;     // 0..conceptCount, each concept ≤1
  readonly varianceAchieved: boolean;    // final validation passed (or no violation)
  readonly reason?: string;        // present when ran === false
};
```

## D2 — Write guarantees

- **D2.1 (ran path)**: When the stage runs, the trace records the real counters: `ran:true`, `enabled:true`, the observed `killSwitch`, `conceptCount` (3), the actual `fallbackCount`, `validatorTriggered`, `retryCount`, and `varianceAchieved`.
- **D2.2 (skipped path)**: When the gate skips the stage, write `ran:false` with `reason` ∈ {`"flag-disabled"`, `"kill-switch-on"`, `"non-initial-mode"`, `"not-single-ad-flow"`}, and `enabled`/`killSwitch` reflecting why; counters are `0`/`false` and `varianceAchieved:false`.
- **D2.3 (additive)**: The field is optional. Legacy generations and flag-off generations may omit it entirely; consumers treat absence as "no Phase-20 data" (SC-008). No existing trace field changes shape.
- **D2.4 (no PII / no copy)**: The trace stores counters and booleans only — not the brief text — keeping it small and safe.

## D3 — Relationship to deferred telemetry

The richer counters (`fallbackCount`, `retryCount`, `varianceAchieved`) are exactly the rollout-health / rollback signals the deferred telemetry phase (20.G.4) will later aggregate into a `pipelineTelemetry` store. Collecting them on the trace now satisfies auditability (Principle VI) **without** building the analytics pipeline this build (FR-026).

## D4 — Test hooks

- A unit test asserts the `conceptDirector` field shape compiles and that a sample `ran:false` skip object and a sample `ran:true` object both satisfy the type.
- An integration-style assertion (source-scan, mirroring `gazeMap.test.ts`) confirms the trace is written in the concepts flow for both the ran and skipped branches.
