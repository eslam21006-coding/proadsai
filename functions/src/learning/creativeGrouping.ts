// functions/src/learning/creativeGrouping.ts — group ad rows into creatives (FR-073, FR-074, FR-074a-g, FR-075)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// PURE module (no Firestore). Consumes an array of `AdRowForGrouping` (a
// deliberately narrow projection of `AdDoc` so this stays pure) and groups
// them into creatives per `contracts/creativeGrouping.md`.
//
// The unit of evidence is the **creative** (FR-073), not the ad row. One
// creative contributes exactly once to any angle record or visual-pattern
// record, no matter how many Meta ad rows carry it.
//
// Behaviour, in the contract's order:
//   1. Group by `imageHash` (FR-074).
//   2. Within a group, if any row carries a `generationId`, all rows resolve
//      to it (FR-074).
//   3. On disagreement inside a group, **manual wins** (FR-074a).
//   4. **Merge** any two groups resolving to the same `generationId` (FR-074b).
//      Merge is on shared `generationId` only — distance-based clustering of
//      hashes is forbidden (non-transitive; risks merging distinct creatives).
//   5. A row with `generationId` and no `imageHash` joins that generation's
//      group; alone, it forms a **contributing** single-member group (FR-074c).
//   6. A row with neither key forms a single-member group with
//      `contributes: false` (FR-075) — bookkeeping only.
//   7. Per-row provenance is emitted on each returned row so the caller can
//      persist the resolved link (FR-074d, FR-074e).
//
// The function is pure: same input array → same output. Reordering rows
// does not change the grouping (order-independence).

import type {
    AdRowForGrouping,
    CreativeGroup,
    LinkProvenance,
} from "./types.js";

// ─── Internal: precedence between provenances ─────────────────────
// Per FR-074a: manual beats direct_auto beats propagated. Lower value
// = higher precedence.
const PROVENANCE_PRECEDENCE: Record<NonNullable<LinkProvenance>, number> = {
    "manual": 0,
    "direct_auto": 1,
    "propagated": 2,
};

// ─── Internal: build a creativeKey from the available identifiers ─
// Stable across runs so the same input produces the same key.
function buildCreativeKey(generationId: string | null, imageHash: string | null): string {
    if (generationId) return `creative:gen:${generationId}`;
    if (imageHash) return `creative:hash:${imageHash}`;
    return "creative:unlinked";
}

// ─── Step 1: partition rows by which keys they carry ──────────────
interface Partitioned {
    // Rows that carry an imageHash (with or without generationId).
    hashBuckets: Map<string, AdRowForGrouping[]>;
    // Rows that carry a generationId but no imageHash.
    genOnly: AdRowForGrouping[];
    // Rows that carry neither.
    neither: AdRowForGrouping[];
}

function partition(rows: AdRowForGrouping[]): Partitioned {
    const hashBuckets = new Map<string, AdRowForGrouping[]>();
    const genOnly: AdRowForGrouping[] = [];
    const neither: AdRowForGrouping[] = [];
    for (const row of rows) {
        if (row.imageHash) {
            const list = hashBuckets.get(row.imageHash) ?? [];
            list.push(row);
            hashBuckets.set(row.imageHash, list);
        } else if (row.generationId) {
            genOnly.push(row);
        } else {
            neither.push(row);
        }
    }
    return { hashBuckets, genOnly, neither };
}

// ─── Steps 2 + 3: resolve a hash group's generationId + provenance ─
// Returns the resolved generationId, the resolved group provenance
// (FR-074a), and a per-row linkProvenance reflecting whether the row
// contributed the link itself or inherited it from a sibling.
interface ResolvedHashGroup {
    creativeKey: string;
    generationId: string | null;
    resolvedProvenance: LinkProvenance;
    rows: AdRowForGrouping[];
}

function resolveHashGroup(imageHash: string, rows: AdRowForGrouping[]): ResolvedHashGroup {
    // Find rows carrying a generationId.
    const linkedRows = rows.filter((r) => r.generationId !== null);

    if (linkedRows.length === 0) {
        // No link in the group — the whole group has null provenance.
        // Per FR-075-equivalent reasoning, the group is bookkeeping-only
        // (no angle/pattern can be resolved without a generationId), so it
        // contributes: false at the call site. resolvedProvenance: null.
        return {
            creativeKey: buildCreativeKey(null, imageHash),
            generationId: null,
            resolvedProvenance: null,
            rows: rows.map((r) => ({ ...r })), // shallow clone for purity
        };
    }

    // FR-074a: manual wins.
    const manualRow = linkedRows.find((r) => r.matchType === "manual");
    let resolvedGen: string | null;
    let resolvedProv: LinkProvenance;
    if (manualRow) {
        resolvedGen = manualRow.generationId;
        resolvedProv = "manual";
    } else {
        // No manual link — pick the first auto_hash link. If multiple
        // hash groups end up resolving to the same generationId, FR-074b's
        // cross-group merge handles it in the next step.
        const autoRow = linkedRows.find((r) => r.matchType === "auto_hash");
        if (autoRow) {
            resolvedGen = autoRow.generationId;
            resolvedProv = "direct_auto";
        } else {
            // Linked rows exist but matchType is null — this is the
            // re-derivation edge case (the row was previously propagated
            // and the lock didn't fire; the row carries a generationId
            // but matchType: null). Use the first such row's generationId
            // and propagate its provenance.
            resolvedGen = linkedRows[0].generationId;
            resolvedProv = linkedRows[0].linkProvenance ?? "propagated";
        }
    }

    // Annotate each row's linkProvenance: rows whose own matchType would
    // produce the winning link keep their provenance; rows that inherited
    // their link from a sibling become "propagated".
    const annotated = rows.map((r): AdRowForGrouping => {
        if (r.generationId === null) {
            // Row had no link of its own — it's now a propagated row
            // inheriting from a sibling.
            return { ...r, generationId: resolvedGen, linkProvenance: "propagated" };
        }
        if (r.generationId === resolvedGen && (r.matchType === "manual" || r.matchType === "auto_hash")) {
            // Row contributed the winning link directly. Keep its provenance
            // — the caller decides whether to write "propagated" for siblings
            // that happen to point at the same generationId via auto match.
            return { ...r };
        }
        if (r.generationId === resolvedGen) {
            // Row carries the resolved generationId but with matchType: null
            // (the propagated-only row in the same hash group). Its provenance
            // is whatever the input said it was.
            return { ...r };
        }
        // Row carries a different generationId than the resolved one. This
        // means the group had two different links and manual didn't pick
        // this one (or there was no manual). The losing link is rewritten
        // to propagated (FR-074 — every row in the group resolves to the
        // winning generationId).
        return { ...r, generationId: resolvedGen, linkProvenance: "propagated" };
    });

    return {
        creativeKey: buildCreativeKey(resolvedGen, imageHash),
        generationId: resolvedGen,
        resolvedProvenance: resolvedProv,
        rows: annotated,
    };
}

// ─── Step 4: cross-group merge (FR-074b) ──────────────────────────
// Two hash groups resolving to the same generationId become one creative.
function mergeByGeneration(groups: ResolvedHashGroup[]): ResolvedHashGroup[] {
    const byGen = new Map<string, ResolvedHashGroup[]>();
    const noGen: ResolvedHashGroup[] = [];
    for (const g of groups) {
        if (g.generationId === null) {
            noGen.push(g);
            continue;
        }
        const list = byGen.get(g.generationId) ?? [];
        list.push(g);
        byGen.set(g.generationId, list);
    }

    const merged: ResolvedHashGroup[] = [];
    for (const [genId, list] of byGen) {
        if (list.length === 1) {
            merged.push(list[0]);
            continue;
        }
        // Merge: combine rows, pick the winning provenance (manual > auto).
        const allRows: AdRowForGrouping[] = [];
        let winningProv: LinkProvenance = null;
        for (const g of list) {
            allRows.push(...g.rows);
            if (winningProv === null || winningProv === "propagated") {
                if (g.resolvedProvenance !== null && g.resolvedProvenance !== "propagated") {
                    winningProv = g.resolvedProvenance;
                } else if (winningProv === null && g.resolvedProvenance !== null) {
                    winningProv = g.resolvedProvenance;
                }
            } else if (g.resolvedProvenance === "manual") {
                winningProv = "manual";
            }
        }
        merged.push({
            creativeKey: buildCreativeKey(genId, null),
            generationId: genId,
            resolvedProvenance: winningProv,
            rows: allRows,
        });
    }
    merged.push(...noGen);
    return merged;
}

// ─── Step 5: hashless linked rows join their generation's creative ─
function attachGenOnly(
    groups: ResolvedHashGroup[],
    genOnlyRows: AdRowForGrouping[],
): { result: ResolvedHashGroup[]; leftovers: AdRowForGrouping[] } {
    const result = groups.map((g) => ({ ...g, rows: [...g.rows] }));
    const leftovers: AdRowForGrouping[] = [];
    for (const row of genOnlyRows) {
        // Find a group whose generationId matches.
        const target = result.find((g) => g.generationId === row.generationId);
        if (target) {
            target.rows.push({ ...row });
        } else {
            // No matching creative — this row forms its own single-member
            // contributing group (FR-074c).
            leftovers.push(row);
        }
    }
    return { result, leftovers };
}

function makeSingleRowGroup(row: AdRowForGrouping, contributes: boolean): ResolvedHashGroup {
    return {
        creativeKey: buildCreativeKey(row.generationId, row.imageHash),
        generationId: row.generationId,
        resolvedProvenance: row.linkProvenance,
        rows: [{ ...row }],
    };
}

// ─── Public: groupIntoCreatives ───────────────────────────────────
export function groupIntoCreatives(rows: AdRowForGrouping[]): CreativeGroup[] {
    const { hashBuckets, genOnly, neither } = partition(rows);

    // Steps 1-3: resolve each hash group.
    const resolvedHashGroups: ResolvedHashGroup[] = [];
    for (const [hash, groupRows] of hashBuckets) {
        resolvedHashGroups.push(resolveHashGroup(hash, groupRows));
    }

    // Step 4: cross-group merge on shared generationId.
    const merged = mergeByGeneration(resolvedHashGroups);

    // Step 5: hashless linked rows join their generation's creative, or
    // form a single-member contributing group if alone (FR-074c).
    const { result: attached, leftovers } = attachGenOnly(merged, genOnly);

    const output: CreativeGroup[] = [];
    for (const r of attached) {
        output.push({
            creativeKey: r.creativeKey,
            generationId: r.generationId,
            rows: r.rows,
            resolvedProvenance: r.resolvedProvenance,
            contributes: r.generationId !== null, // unlinked hash groups can't contribute
        });
    }
    // FR-074c single-member contributing groups (hashless linked rows with
    // no matching creative).
    for (const row of leftovers) {
        const g = makeSingleRowGroup(row, true);
        output.push({
            creativeKey: g.creativeKey,
            generationId: g.generationId,
            rows: g.rows,
            resolvedProvenance: g.resolvedProvenance,
            contributes: true,
        });
    }

    // Step 6: neither-key rows form their own non-contributing groups.
    for (const row of neither) {
        const g = makeSingleRowGroup(row, false);
        output.push({
            creativeKey: g.creativeKey,
            generationId: g.generationId,
            rows: g.rows,
            resolvedProvenance: g.resolvedProvenance,
            contributes: false,
        });
    }

    return output;
}
