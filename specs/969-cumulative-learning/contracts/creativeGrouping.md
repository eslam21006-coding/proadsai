# Contract — `functions/src/learning/creativeGrouping.ts`

**Pure.** No Firestore, no network. Requirements: FR-073, FR-074, FR-074a–g, FR-075.

## Exports

```
groupIntoCreatives(rows: AdRowForGrouping[]): CreativeGroup[]
```

`AdRowForGrouping` = `{ adId, imageHash: string|null, generationId: string|null,
matchType: "auto_hash"|"manual"|null, linkProvenance: LinkProvenance|null }`

`CreativeGroup` = `{ creativeKey, generationId: string|null, rows: AdRowForGrouping[],
resolvedProvenance: LinkProvenance|null, contributes: boolean }`

## Behaviour, in order

1. Group by `imageHash` (FR-074).
2. Within a group, if any row carries a `generationId`, all rows resolve to it (FR-074).
3. On disagreement inside a group, **manual wins** (FR-074a) — the precedence already
   at `shared.ts:864-869`.
4. **Merge** any two groups resolving to the same `generationId` (FR-074b).
5. A row with `generationId` and no `imageHash` joins that generation's group; alone,
   it forms a **contributing** single-member group (FR-074c).
6. A row with neither key forms a single-member group with `contributes: false`
   (FR-075).
7. Emit `resolvedProvenance` per row so the caller can persist it (FR-074d, FR-074e).

## Invariants (test these)

- Idempotent: grouping an already-grouped input yields identical output.
- Order-independent: shuffling `rows` does not change the grouping.
- A propagated resolution never emits `matchType` — only `linkProvenance` (FR-074f).
- Merge is transitive over shared `generationId` and **only** over shared
  `generationId`. **Distance-based clustering of hashes is forbidden** (FR-074b).

## Deliberately NOT in this contract

Near-hash clustering. Rejected as non-transitive — A within threshold of B and B of C
does not put A within threshold of C — and merging genuinely distinct creatives is a
worse failure than splitting one.
