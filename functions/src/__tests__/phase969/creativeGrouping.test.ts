// functions/src/__tests__/phase969/creativeGrouping.test.ts — contracts for `learning/creativeGrouping.ts`
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969, T008 — covers:
//   SC-029   one creative from a 55-row group with one manual link (the
//            55-row shape production actually produces in `act_995888422231015`)
//   SC-029a  one creative from two different hashes resolving to the same generationId
//   SC-029b  hashless linked row still contributes (FR-074c)
//   SC-029c  one matched + several propagated: all rows aggregate, not just the matched one
//   SC-046   no eligible row → contributes nothing
//   plus idempotency (same input → same output) and order-independence
//   (shuffling rows does not change the grouping).
//
// All cases here use fixtures constructed from
// `__fixtures__/learning.fixtures.ts` — production cannot supply most of
// them (only 5 of 1008 dataset rows are linked; 0 generations span two
// hashes; 0 rows carry a link with no hash).

import assert from "node:assert/strict";
import { groupIntoCreatives } from "../../learning/creativeGrouping.js";
import type { AdRowForGrouping, CreativeGroup } from "../../learning/types.js";
import {
    buildAlreadyLinkedHashNulledFixture,
    buildDirectAutoRow,
    buildFiftyFiveRowOneLinkedFixture,
    buildHashlessLinkedAloneFixture,
    buildLinkedRow,
    buildNeitherKeyFixture,
    buildOneMatchedSeveralPropagatedFixture,
    buildPropagatedRow,
    buildTwoHashesSameGenerationFixture,
    buildUnlinkedRow,
} from "../__fixtures__/learning.fixtures.js";

const PASSED = 0;
const FAILED = 1;
let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
    try {
        fn();
        console.log(`  ✅ ${name}`);
        passed++;
    } catch (e) {
        console.log(`  ❌ ${name}`);
        console.log(`     ${(e as Error).message}`);
        failed++;
    }
}

// Helper: assert exactly one group with a given generationId.
function findByGeneration(groups: CreativeGroup[], generationId: string | null): CreativeGroup | undefined {
    return groups.find((g) => g.generationId === generationId);
}

// ═══ SC-029: 55-row, 1-linked group resolves to ONE creative ═══

test("SC-029: 55 rows sharing one imageHash with 1 manual link → 1 creative", () => {
    const rows = buildFiftyFiveRowOneLinkedFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1, "expected exactly one creative, got " + groups.length);
    const g = groups[0];
    assert.equal(g.generationId, "gen-55");
    assert.equal(g.rows.length, 55);
    assert.equal(g.contributes, true);
    assert.equal(g.resolvedProvenance, "manual", "manual link must win (FR-074a)");
});

test("SC-029: every row in the 55-row group resolves to the manual generationId", () => {
    const rows = buildFiftyFiveRowOneLinkedFixture();
    const groups = groupIntoCreatives(rows);
    for (const row of groups[0].rows) {
        assert.equal(row.generationId, "gen-55", `row ${row.adId} did not resolve to gen-55`);
    }
});

// ═══ SC-029a: two hashes, same generationId → one creative (FR-074b merge) ═══

test("SC-029a: two different imageHashes with the same generationId merge into one creative", () => {
    const rows = buildTwoHashesSameGenerationFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1, "merge should produce one creative, got " + groups.length);
    const g = groups[0];
    assert.equal(g.generationId, "gen-shared");
    assert.equal(g.rows.length, 2);
});

test("SC-029a: merge preserves every row from both source hash groups", () => {
    const rows = buildTwoHashesSameGenerationFixture();
    const groups = groupIntoCreatives(rows);
    const ids = groups[0].rows.map((r) => r.adId).sort();
    assert.deepEqual(ids, ["row-A", "row-B"]);
});

// ═══ SC-029b: hashless linked row contributes (FR-074c) ═══

test("SC-029b route 1: hashless linked row forms a contributing single-member group", () => {
    const rows = buildHashlessLinkedAloneFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].generationId, "gen-1");
    assert.equal(groups[0].contributes, true, "hashless linked row MUST contribute (FR-074c)");
});

test("SC-029b route 2: already-linked row whose hash was nulled still contributes", () => {
    const rows = buildAlreadyLinkedHashNulledFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].generationId, "gen-1");
    assert.equal(groups[0].contributes, true);
});

test("SC-029b: hashless linked row, no matching creative, joins as single-member group", () => {
    const row: AdRowForGrouping = {
        adId: "hashless-linked-x",
        imageHash: null,
        generationId: "gen-x",
        matchType: "manual",
        linkProvenance: "manual",
    };
    const groups = groupIntoCreatives([row]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].generationId, "gen-x");
    assert.equal(groups[0].contributes, true);
});

// ═══ SC-029c: one matched + several propagated — all rows aggregate ═══

test("SC-029c: one matched row + several propagated rows → one creative with all rows", () => {
    const rows = buildOneMatchedSeveralPropagatedFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].rows.length, 4, "every row in the hash group MUST be in the creative");
});

test("SC-029c: resolved provenance is direct_auto (the matched row won FR-074a precedence)", () => {
    const rows = buildOneMatchedSeveralPropagatedFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups[0].resolvedProvenance, "direct_auto");
});

test("SC-029c: propagated rows in the group carry linkProvenance 'propagated'", () => {
    const rows = buildOneMatchedSeveralPropagatedFixture();
    const groups = groupIntoCreatives(rows);
    const propagatedRows = groups[0].rows.filter((r) => r.adId !== "matched");
    assert.equal(propagatedRows.length, 3);
    for (const r of propagatedRows) {
        assert.equal(r.linkProvenance, "propagated",
            `row ${r.adId} should be marked propagated`);
    }
});

// ═══ SC-046: no eligible row contributes nothing ═══

test("SC-046: rows with neither key form a non-contributing single-member group (FR-075)", () => {
    const rows = buildNeitherKeyFixture();
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 2, "each neither-key row is its own single-member group");
    for (const g of groups) {
        assert.equal(g.contributes, false);
        assert.equal(g.generationId, null);
    }
});

test("SC-046: hash-only group with no link in any row → contributes false", () => {
    const rows: AdRowForGrouping[] = [
        {
            adId: "hash-only-1",
            imageHash: "hash-y",
            generationId: null,
            matchType: null,
            linkProvenance: null,
        },
    ];
    const groups = groupIntoCreatives(rows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].contributes, false);
    assert.equal(groups[0].generationId, null);
});

// ═══ FR-074a: manual beats direct_auto on disagreement ═══

test("FR-074a: hash group with both manual and auto_hash resolves to the manual generationId", () => {
    const rows: AdRowForGrouping[] = [
        buildDirectAutoRow({ adId: "auto", generationId: "gen-auto" }),
        buildLinkedRow({ adId: "manual", generationId: "gen-manual" }),
    ];
    // Both share the same imageHash from buildLinkedRow's default
    // — set them explicitly to share:
    const sameHashRows: AdRowForGrouping[] = rows.map((r) => ({ ...r, imageHash: "hash-shared" }));
    const groups = groupIntoCreatives(sameHashRows);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].generationId, "gen-manual", "manual must win (FR-074a)");
    assert.equal(groups[0].resolvedProvenance, "manual");
});

// ═══ FR-074f invariant: propagated rows keep matchType: null ═══

test("FR-074f: propagated rows in the group keep matchType: null so the precedence lock does not fire", () => {
    const rows = buildFiftyFiveRowOneLinkedFixture();
    const groups = groupIntoCreatives(rows);
    const propagated = groups[0].rows.filter((r) => r.linkProvenance === "propagated");
    assert.equal(propagated.length, 54);
    for (const r of propagated) {
        assert.equal(r.matchType, null, `propagated row ${r.adId} must keep matchType: null`);
    }
});

// ═══ Idempotency: same input → same output ═══

test("idempotency: grouping the same input twice yields identical groups", () => {
    const rows = buildFiftyFiveRowOneLinkedFixture();
    const groups1 = groupIntoCreatives(rows);
    const groups2 = groupIntoCreatives(rows);
    assert.equal(groups1.length, groups2.length);
    for (let i = 0; i < groups1.length; i++) {
        assert.equal(groups1[i].creativeKey, groups2[i].creativeKey);
        assert.equal(groups1[i].generationId, groups2[i].generationId);
        assert.equal(groups1[i].rows.length, groups2[i].rows.length);
    }
});

// ═══ Order-independence: shuffling rows does not change the grouping ═══

test("order-independence: shuffled 55-row input produces the same creative as the original", () => {
    const rows = buildFiftyFiveRowOneLinkedFixture();
    const shuffled = [...rows].sort(() => Math.random() - 0.5);
    const originalGroups = groupIntoCreatives(rows);
    const shuffledGroups = groupIntoCreatives(shuffled);
    assert.equal(originalGroups.length, shuffledGroups.length);
    assert.equal(originalGroups[0].creativeKey, shuffledGroups[0].creativeKey);
    assert.equal(originalGroups[0].rows.length, shuffledGroups[0].rows.length);
});

test("order-independence: reverse-sorted two-hash fixture merges identically", () => {
    const rows = buildTwoHashesSameGenerationFixture();
    const reversed = [...rows].reverse();
    const a = groupIntoCreatives(rows);
    const b = groupIntoCreatives(reversed);
    assert.equal(a.length, b.length);
    assert.equal(a[0].creativeKey, b[0].creativeKey);
    assert.equal(a[0].rows.length, b[0].rows.length);
});

// ═══ Mixed input: combines several shapes ═══

test("mixed: linked + propagated + hashless-linked + neither → correct creative count", () => {
    const rows: AdRowForGrouping[] = [
        ...buildFiftyFiveRowOneLinkedFixture("hash-A", "gen-A"),
        ...buildOneMatchedSeveralPropagatedFixture("hash-B", "gen-B"),
        ...buildHashlessLinkedAloneFixture("gen-C"),
        ...buildNeitherKeyFixture(),
        buildUnlinkedRow({ adId: "extra-unlinked" }),
    ];
    const groups = groupIntoCreatives(rows);
    // Expected:
    //  - 1 creative for the 55-row manual-link (hash-A)
    //  - 1 creative for the 1-matched + 3-propagated (hash-B)
    //  - 1 contributing single-member for hashless-linked (gen-C)
    //  - 2 non-contributing single-member for the two neither-key rows
    //  - 1 non-contributing single-member for the extra unlinked row
    // Total = 6
    assert.equal(groups.length, 6, `expected 6 creatives, got ${groups.length}`);
    const contributing = groups.filter((g) => g.contributes);
    assert.equal(contributing.length, 3);
});

// ═══ Helper import sanity (verify the fixtures are wired through) ═══

test("fixtures importable: buildLinkedRow and buildPropagatedRow return distinct shapes", () => {
    const linked = buildLinkedRow({ adId: "x" });
    const propagated = buildPropagatedRow({ adId: "y" });
    assert.equal(linked.matchType, "manual");
    assert.equal(propagated.matchType, null);
    assert.equal(propagated.linkProvenance, "propagated");
});

// ═══ Runner ═══

console.log("");
console.log("=== creativeGrouping — contract tests ===");
console.log(`Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) process.exit(FAILED);
process.exit(PASSED);
