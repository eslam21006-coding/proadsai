// functions/src/__tests__/__fixtures__/learning.fixtures.ts — constructed test fixtures for Phase 969
// ════════════════════════════════════════════════════════════════════════════════════════════════════
// Production cannot supply the cases the spec demands:
//   - 5 of 1008 ad rows are linked at all; only 1 generation maps to any hash (data-model.md §4).
//   - 0 generations map to two hashes (FR-074b limitation, §Assumptions).
//   - 0 rows carry a link without a hash (FR-074c, §Assumptions).
//
// Every fixture this file builds is therefore constructed. They are the
// shared input for the Phase 2-6 test files and must remain **shapeful**
// (every field set to a named value) rather than anonymous. Future
// readers — including reviewers of the criteria the spec discriminates
// against — should be able to tell what the fixture is asserting without
// re-deriving it from the call site.

import type {
    AdRowForGrouping,
    LinkProvenance,
} from "../../learning/types.js";

// ─── Builders — single rows ────────────────────────────────────────

/**
 * Build a row with a manual generation link.
 * Default: manual precedence, `matchType: "manual"`, both keys present.
 */
export function buildLinkedRow(opts: Partial<AdRowForGrouping> = {}): AdRowForGrouping {
    return {
        adId: opts.adId ?? "linked-ad-1",
        imageHash: opts.imageHash ?? "hash-A",
        generationId: opts.generationId ?? "gen-1",
        matchType: opts.matchType ?? "manual",
        linkProvenance: opts.linkProvenance ?? "manual",
    };
}

/**
 * Build a row that inherited its link from a sibling in the same hash
 * group. Per FR-074f a propagated row keeps `matchType: null` so the
 * precedence lock at `metaSync/shared.ts:864-869` does not fire.
 */
export function buildPropagatedRow(opts: Partial<AdRowForGrouping> = {}): AdRowForGrouping {
    return {
        adId: opts.adId ?? "propagated-ad-1",
        imageHash: opts.imageHash ?? "hash-A",
        generationId: opts.generationId ?? "gen-1",
        matchType: opts.matchType ?? null,
        linkProvenance: opts.linkProvenance ?? "propagated",
    };
}

/**
 * Build a row carrying a direct automatic match — `linkProvenance`
 * `direct_auto`, `matchType` `auto_hash`. Used to seed the SC-029c
 * one-matched-plus-several-propagated fixture.
 */
export function buildDirectAutoRow(opts: Partial<AdRowForGrouping> = {}): AdRowForGrouping {
    return {
        adId: opts.adId ?? "direct-auto-1",
        imageHash: opts.imageHash ?? "hash-A",
        generationId: opts.generationId ?? "gen-1",
        matchType: opts.matchType ?? "auto_hash",
        linkProvenance: opts.linkProvenance ?? "direct_auto",
    };
}

/**
 * FR-074c first route: a pre-sync manual link carrying a `generationId`
 * but no `imageHash` field. Joins the creative of its `generationId`;
 * forms its own single-member contributing group if none exists.
 */
export function buildHashlessLinkedRow(opts: Partial<AdRowForGrouping> = {}): AdRowForGrouping {
    return {
        adId: opts.adId ?? "hashless-linked-1",
        imageHash: opts.imageHash ?? null,
        generationId: opts.generationId ?? "gen-1",
        matchType: opts.matchType ?? "manual",
        linkProvenance: opts.linkProvenance ?? "manual",
    };
}

/**
 * FR-075 bookkeeping-only case: neither `generationId` nor `imageHash`.
 * Forms its own single-member group, contributes nothing.
 */
export function buildUnlinkedRow(opts: Partial<AdRowForGrouping> = {}): AdRowForGrouping {
    return {
        adId: opts.adId ?? "unlinked-1",
        imageHash: opts.imageHash ?? null,
        generationId: opts.generationId ?? null,
        matchType: opts.matchType ?? null,
        linkProvenance: opts.linkProvenance ?? null,
    };
}

// ─── Production-shaped fixtures ───────────────────────────────────

/**
 * The 55-row creative in `act_995888422231015` — one manually-linked
 * row plus 54 rows that carry the same `imageHash` and resolve to it
 * through FR-074 propagation. This is the shape production actually
 * produces (the only linked row in the dataset, f5e9a98dadad8d9d,
 * spans 5 rows; 55 is the **observed maximum creative size** in the
 * same account). SC-029, SC-029c, SC-008 require this shape.
 */
export function buildFiftyFiveRowOneLinkedFixture(
    imageHash: string = "hash-55",
    generationId: string = "gen-55",
    linkedAdId: string = "linked-0",
): AdRowForGrouping[] {
    const rows: AdRowForGrouping[] = [];
    for (let i = 0; i < 54; i++) {
        rows.push({
            adId: `propagated-${i}`,
            imageHash,
            generationId,
            matchType: null,
            linkProvenance: "propagated",
        });
    }
    rows.push({
        adId: linkedAdId,
        imageHash,
        generationId,
        matchType: "manual",
        linkProvenance: "manual",
    });
    return rows;
}

/**
 * FR-074b cross-group merge fixture: two ad rows carrying **different**
 * `imageHash` values that both resolve to the **same** `generationId`.
 * Production contains zero such cases (data-model.md §4 — only 1
 * `generationId` is linked at all and it maps to 1 hash), so this
 * fixture is constructed. SC-029a asserts one creative, not two.
 */
export function buildTwoHashesSameGenerationFixture(
    generationId: string = "gen-shared",
    hashX: string = "hash-X",
    hashY: string = "hash-Y",
): AdRowForGrouping[] {
    return [
        {
            adId: "row-A",
            imageHash: hashX,
            generationId,
            matchType: "manual",
            linkProvenance: "manual",
        },
        {
            adId: "row-B",
            imageHash: hashY,
            generationId,
            matchType: "manual",
            linkProvenance: "manual",
        },
    ];
}

/**
 * FR-074c / SC-029b first route: a pre-sync manual link with no
 * `imageHash`. By itself this forms a single-member contributing
 * group tied to its `generationId`.
 */
export function buildHashlessLinkedAloneFixture(
    generationId: string = "gen-1",
): AdRowForGrouping[] {
    return [
        {
            adId: "hashless-linked",
            imageHash: null,
            generationId,
            matchType: "manual",
            linkProvenance: "manual",
        },
    ];
}

/**
 * FR-074c / SC-029b second route: an already-linked row whose
 * `imageHash` was nulled by a failed download on a later sync. The
 * precedence lock at `metaSync/shared.ts:864-869` preserves
 * `matchType: "manual"`; the row's contribution continues.
 */
export function buildAlreadyLinkedHashNulledFixture(
    generationId: string = "gen-1",
): AdRowForGrouping[] {
    return [
        {
            adId: "linked-hash-nulled",
            imageHash: null,
            generationId,
            matchType: "manual",
            linkProvenance: "manual",
        },
    ];
}

/**
 * SC-029c: one directly-matched row plus several propagated-only
 * rows in the same hash group. The propagated rows carry
 * `matchType: null` per FR-074f — the fixture's purpose is to assert
 * that an all-rows aggregation rule counts every row, not just the
 * matched one.
 */
export function buildOneMatchedSeveralPropagatedFixture(
    imageHash: string = "hash-Z",
    generationId: string = "gen-Z",
): AdRowForGrouping[] {
    return [
        {
            adId: "matched",
            imageHash,
            generationId,
            matchType: "auto_hash",
            linkProvenance: "direct_auto",
        },
        {
            adId: "propagated-1",
            imageHash,
            generationId,
            matchType: null,
            linkProvenance: "propagated",
        },
        {
            adId: "propagated-2",
            imageHash,
            generationId,
            matchType: null,
            linkProvenance: "propagated",
        },
        {
            adId: "propagated-3",
            imageHash,
            generationId,
            matchType: null,
            linkProvenance: "propagated",
        },
    ];
}

/**
 * SC-046 negative case: a creative containing **no** eligible row
 * contributes nothing. Two bookkeeping-only rows.
 */
export function buildNeitherKeyFixture(): AdRowForGrouping[] {
    return [
        {
            adId: "neither-1",
            imageHash: null,
            generationId: null,
            matchType: null,
            linkProvenance: null,
        },
        {
            adId: "neither-2",
            imageHash: null,
            generationId: null,
            matchType: null,
            linkProvenance: null,
        },
    ];
}

/**
 * SC-029c construction aid: many propagated-only rows whose
 * `imageHash` differs from the matched row's by one character. The
 * hash-difference is **not** the discriminator the production code
 * uses (FR-074 propagates by `imageHash` equality); this fixture
 * exists only to keep distinct hash groups distinguishable in test
 * output. Kept exported in case future criteria want it.
 */
export function buildSplitCreativesFixture(): AdRowForGrouping[] {
    return [
        {
            adId: "split-A-matched",
            imageHash: "split-A",
            generationId: "gen-A",
            matchType: "auto_hash",
            linkProvenance: "direct_auto",
        },
        {
            adId: "split-A-prop",
            imageHash: "split-A",
            generationId: "gen-A",
            matchType: null,
            linkProvenance: "propagated",
        },
        {
            adId: "split-B-matched",
            imageHash: "split-B",
            generationId: "gen-B",
            matchType: "auto_hash",
            linkProvenance: "direct_auto",
        },
    ];
}

/**
 * SC-045 / FR-074f invariant aid: a row carrying a propagated link
 * MUST keep `matchType: null` regardless of its resolved generation.
 * The fixture makes the invariance easy to assert in a single line.
 */
export const PROPAGATED_KEEPS_MATCHTYPE_NULL: ReadonlyArray<LinkProvenance> = [
    "propagated",
];
