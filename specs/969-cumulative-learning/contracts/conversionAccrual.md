# Contract — `functions/src/learning/conversionAccrual.ts`

**Pure.** Requirements: FR-081–FR-086a, FR-077.

## Exports

```
accrueDays(existing: DayAccrual, dailyRows: InsightsRow[], window: {since, until})
  : DayAccrual
creativeConversionTotal(rows: DayAccrual[]): number
isStopped(adStatus: string|null): boolean
```

## Behaviour

- Input rows come from `fetchAdInsights7dDaily` (`metaGraph.ts:389-396`,
  `time_increment: 1`), which returns **one row per day**. **Never** from the
  three-day window, which is a **single aggregated row** (`shared.ts:294`) — the
  `.reduce()` calls at `shared.ts:220` and `:266` iterate a one-element array and
  read like a per-day series without being one.
- Per-day count via the existing `countConversionActions` (`shared.ts:355-370`),
  which already accepts an array of rows and yields one day's count unmodified.
- Deduplication key: **(ad row id, date)** (FR-084). The row is the document; the
  date is the map key. Coarser drops rows; finer double-counts.
- **Upward-only** while a day is inside the window: a higher value replaces, a
  **lower value is a no-op** (FR-083). This keeps FR-020's never-decreases guarantee
  unconditional.
- Leaving the window means finalise: fold into `finalisedTotal`, increment
  `finalisedDayCount`, **delete the map entry** (FR-084a). Window membership is pure
  date arithmetic; no stored flag.
- **An absent daily row is `not observed`, never `0`** (FR-085a). The key is simply
  not written.

## Gap counting (FR-086a) — two different things

| Case | Gap? |
|---|---|
| Date **inside** an observed window, no row returned | **No.** The ad did not run. |
| Date **outside every** observed window (missed syncs) | **Yes.** Unrecoverable. |

Conflating them makes the count non-zero continuously for any paused ad, so a real
outage arrives as noise inside noise. **The count must be zero in normal operation to
work as an alarm at all.** Window coverage is pure date arithmetic from the sync's own
bounds. (SC-042, SC-042a)

## Eligibility feed (FR-077)

- **(a)** 5 combined conversions across all the creative's placements — the sum over
  its rows. The fifth may arrive on a **different row** from the first four.
- **(b)** stopped running with at least 1 — via `isStopped(adStatus)`, which
  **under-detects** parent-level pauses by design (FR-085). An undetected stop means
  the creative simply never seals via (b); the failure mode is a **missing**
  contribution, never a wrong one.

## Cost

**Zero additional Graph API calls** (FR-081, SC-037) — these rows are already fetched
on every sync and currently discarded, consumed only by `spend7d` (`shared.ts:284`),
`peak1dCtr` (`:307`) and `computeAgeDays` (`:1253`).
