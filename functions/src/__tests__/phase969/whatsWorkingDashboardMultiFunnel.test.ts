// functions/src/__tests__/whatsWorkingDashboardMultiFunnel.test.ts
// FR-041 (Phase 969 T056 + T057) — multi-funnel indication's wiring.
//
// Phase 7 Batch 16 read `byObjective.conversion.count` AND
// `byObjective.other.count` and called the conjunction "multi-funnel".
// The owner audit (2026-09-06) flagged this as the wrong dimension:
//
//   * FR-041 says "spans more than one of the owner's funnels" — the
//     four funnel types are paid_event, paid_product, free_webinar,
//     lead_magnet_call. NOT the conversion/other objective split.
//   * `byObjective.other` carries non-conversion campaign ads (e.g.
//     brand-awareness traffic) which DO NOT feed learning per
//     `learningAggregates.test.ts` — only conversion campaigns feed
//     learning. The Batch 16 label was firing on a bucket that
//     contributes nothing to the recommendation it labels.
//
// The fix reads `byFunnelType` (the breakdown FR-027 requires;
// T047 covered the population; this test covers the read side).
//
// The four cases the owner audit called out, asserted here:
//
//   (a) Two conversion funnels — paid_event + paid_product — both
//       carry non-zero count → label SHOWS (the motivating case that
//       currently fails because both are "conversion" in the
//       objective split).
//   (b) One funnel only → label ABSENT.
//   (c) One funnel + unknown → label ABSENT. Reason in §6.3:
//       FR-032 says unknown receives no same-funnel weighting and
//       never matches a requested type. A row whose funnelType is
//       missing is weaker evidence, not a separate funnel. One real
//       + unknown → one real → not two.
//   (d) byObjective.other.count > 0 BUT only one funnel type → label
//       ABSENT. This is the closing pin: the Batch 16 formula
//       returned TRUE here (false positive). The fix must return
//       false; the source-of-truth reading is per-funnel-type.

import assert from "node:assert/strict";

const PASSED = 0;
const FAILED = 1;

let passed = 0;
let failed = 0;
const failures: string[] = [];

function run(name: string, fn: () => Promise<void> | void): Promise<void> | void {
    try {
        const result = fn();
        if (result && typeof (result as Promise<unknown>).then === "function") {
            return (result as Promise<void>).then(
                () => { passed++; console.log(`  ✅ ${name}`); },
                (err: Error) => { failed++; failures.push(`${name}: ${err.message}`); console.log(`  ❌ ${name} — ${err.message}`); },
            );
        }
        passed++;
        console.log(`  ✅ ${name}`);
    } catch (err) {
        failed++;
        failures.push(`${name}: ${(err as Error).message}`);
        console.log(`  ❌ ${name} — ${(err as Error).message}`);
    }
}

function summary() {
    console.log("");
    console.log("=".repeat(60));
    console.log(`whatsWorkingDashboard multi-funnel tests: ${passed} passed, ${failed} failed`);
    if (failures.length) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── In-memory Firestore stub (mirrors whatsWorkingDashboardScope pattern) ──

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin: any = require("firebase-admin");

type DocData = Record<string, any>;
const stubStore: Record<string, Map<string, DocData>> = {};
function bucket(path: string): Map<string, DocData> {
    if (!stubStore[path]) stubStore[path] = new Map();
    return stubStore[path];
}
function resetStore() {
    for (const k of Object.keys(stubStore)) stubStore[k].clear();
}

class StubDocRef {
    constructor(public path: string, public id: string, private store: Map<string, DocData>) {}
    async get() {
        const data = this.store.get(this.id);
        return { exists: data !== undefined, data: () => data ?? undefined, id: this.id, ref: this };
    }
    collection(sub: string) {
        return new StubCollection(`${this.path}/${sub}`, bucket(`${this.path}/${sub}`));
    }
}
class StubCollection {
    constructor(public path: string, private store: Map<string, DocData>) {}
    doc(id?: string) {
        const docId = id ?? "auto";
        return new StubDocRef(`${this.path}/${docId}`, docId, this.store);
    }
    where() { return this; }
    limit() { return this; }
    orderBy() { return this; }
    async get() {
        const entries = [...this.store.entries()];
        return {
            docs: entries.map(([id, data]) => ({
                id, data: () => data, ref: new StubDocRef(`${this.path}/${id}`, id, this.store),
            })),
            empty: entries.length === 0,
            size: entries.length,
        };
    }
}

const stubFirestore = () => ({
    settings: () => stubFirestore(),
    collection: (path: string) => new StubCollection(path, bucket(path)),
    doc: (path: string) => {
        const segs = path.split("/");
        const id = segs.pop() as string;
        return new StubDocRef(path, id, bucket(segs.join("/")));
    },
});

Object.defineProperty(admin, "firestore", { value: stubFirestore, writable: true, configurable: true });
admin.firestore.FieldValue = { serverTimestamp: () => Date.now(), increment: (n: number) => n };
Object.defineProperty(admin, "initializeApp", { value: () => ({}), writable: true, configurable: true });

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getWhatsWorkingDashboardImpl } = require("../../whatsWorkingDashboard.js");

// ─── Fixtures ──────────────────────────────────────────────────────────────

const OWNER = "owner_uid_AAAA";
const WS = "ws_multi";
const ACCT = "act_multi";
const SYNC_MS = Date.now();
const BASELINES_DOC = { linkCtr90d: 0.02 };

/** Drive the dashboard impl with the given hook / visual aggregate lists. */
async function drive(
    hookAggs: Record<string, unknown>[],
    visualAggs: Record<string, unknown>[],
    ads: Record<string, unknown>[] = [],
): Promise<{ strongestAngles: Array<Record<string, unknown>>; strongestVisuals: Array<Record<string, unknown>> }> {
    resetStore();
    bucket(`users/${OWNER}/workspaces`).set(WS, { name: "Lina", metaAdAccountId: ACCT });
    bucket(`users/${OWNER}/workspaces/${WS}/private`).set("metaConnection", {
        metaConnected: true, lastMetaSyncAt: SYNC_MS,
    });
    bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/baselines`).set("current", BASELINES_DOC);
    bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/hookPerformance`).set(
        "agg1",
        hookAggs[0] ?? null,
    );
    // hookPerformance and visualPerformance reads use `.get()` on the
    // collection, which returns ALL seeded entries. Strip nulls to
    // make this work with the minimum fixture.
    if (!hookAggs[0]) bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/hookPerformance`).delete("agg1");
    hookAggs.forEach((agg, i) => bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/hookPerformance`).set(`agg${i}`, agg));
    visualAggs.forEach((agg, i) => bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/visualPerformance`).set(`agg${i}`, agg));
    ads.forEach((ad, i) => bucket(`users/${OWNER}/workspaces/${WS}/adAccounts/${ACCT}/adPerformance`).set(`ad${i}`, ad));

    const scope = {
        ownerUid: OWNER,
        callerUid: OWNER,
        allowedWorkspaceIds: "ALL" as const,
        storedWorkspaceAccess: [],
    };
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const result = await getWhatsWorkingDashboardImpl(scope, { workspaceId: WS, accountId: ACCT });
    return result as { strongestAngles: Array<Record<string, unknown>>; strongestVisuals: Array<Record<string, unknown>> };
}

/** Minimal angle aggregate with the funnel-type breakdown explicit. */
function angleAgg(overrides: {
    angleKey: string;
    byFunnelType?: Partial<Record<"paid_event" | "paid_product" | "free_webinar" | "lead_magnet_call" | "unknown", { count: number; avgLinkCtr: number }>>;
    byObjective?: { conversion: { avgLinkCtr: number; count: number; bestVerdictCount: number; worstVerdictCount: number }; other: { avgLinkCtr: number; count: number } };
}): Record<string, unknown> {
    const zeroCount = (overrides.byFunnelType?.[overrides.angleKey as unknown as keyof typeof overrides.byFunnelType]?.count) ?? 0;
    return {
        angleKey: overrides.angleKey,
        schemaVersion: 1,
        creativeCount: 3,
        sampleSize: 12,
        lastUpdated: SYNC_MS,
        byObjective: overrides.byObjective ?? {
            conversion: { avgLinkCtr: 0.04, count: 12, bestVerdictCount: 3, worstVerdictCount: 1 },
            other: { avgLinkCtr: 0, count: 0 },
        },
        byFunnelType: {
            paid_event: { count: 0, avgLinkCtr: 0.04 },
            paid_product: { count: 0, avgLinkCtr: 0.04 },
            free_webinar: { count: 0, avgLinkCtr: 0.04 },
            lead_magnet_call: { count: 0, avgLinkCtr: 0.04 },
            unknown: { count: 0, avgLinkCtr: 0 },
            ...overrides.byFunnelType,
        } as Record<string, { count: number; avgLinkCtr: number }>,
        byGeoTier: {
            tier1_gulf: { avgCtr: 0.04, count: 8 },
            tier2_diaspora: { avgCtr: 0.04, count: 4 },
            tier3_egypt_na: { avgCtr: 0, count: 0 },
        },
        byAudienceType: {
            broad: { avgCtr: 0.04, count: 6 },
            interest: { avgCtr: 0.04, count: 4 },
            lookalike: { avgCtr: 0, count: 0 },
            retargeting: { avgCtr: 0, count: 0 },
            advantage_plus: { avgCtr: 0, count: 0 },
        },
    };
}

// ─── Tests ─────────────────────────────────────────────────────────────────

async function main() {
    console.log("\nwhatsWorkingDashboard — FR-041 multi-funnel wiring\n");

    // (a) Two real funnels — should show.
    await run("case (a): two real funnels paid_event + paid_product → label SHOWS", async () => {
        const res = await drive(
            [angleAgg({
                angleKey: "urgency",
                byObjective: { conversion: { avgLinkCtr: 0.04, count: 12, bestVerdictCount: 3, worstVerdictCount: 1 }, other: { avgLinkCtr: 0, count: 0 } },
                byFunnelType: { paid_event: { count: 8, avgLinkCtr: 0.04 }, paid_product: { count: 4, avgLinkCtr: 0.04 } },
            })],
            [],
        );
        const angle = res.strongestAngles.find((a) => a.angleKey === "urgency");
        assert.ok(angle, "expected urgency angle row");
        assert.equal(angle!.multiFunnel, true,
            "case (a) failed: an angle used in BOTH paid_event and paid_product must show the multi-funnel label");
    });

    // (b) One funnel only — should be absent.
    await run("case (b): one funnel only → label ABSENT", async () => {
        const res = await drive(
            [angleAgg({
                angleKey: "logic",
                byObjective: { conversion: { avgLinkCtr: 0.04, count: 8, bestVerdictCount: 2, worstVerdictCount: 1 }, other: { avgLinkCtr: 0, count: 0 } },
                byFunnelType: { paid_event: { count: 8, avgLinkCtr: 0.04 } },
            })],
            [],
        );
        const angle = res.strongestAngles.find((a) => a.angleKey === "logic");
        assert.ok(angle, "expected logic angle row");
        assert.equal(angle!.multiFunnel, false,
            "case (b) failed: an angle used in only one funnel must NOT show the label");
    });

    // (c) One funnel + unknown — should be absent (the settled decision).
    await run("case (c): one funnel + unknown → label ABSENT (FR-032 reading)", async () => {
        const res = await drive(
            [angleAgg({
                angleKey: "curiosity",
                byObjective: { conversion: { avgLinkCtr: 0.04, count: 8, bestVerdictCount: 2, worstVerdictCount: 1 }, other: { avgLinkCtr: 0, count: 0 } },
                byFunnelType: {
                    paid_event: { count: 5, avgLinkCtr: 0.04 },
                    unknown: { count: 3, avgLinkCtr: 0.04 },
                },
            })],
            [],
        );
        const angle = res.strongestAngles.find((a) => a.angleKey === "curiosity");
        assert.ok(angle, "expected curiosity angle row");
        assert.equal(angle!.multiFunnel, false,
            "case (c) failed: one real funnel + unknown is not two funnels (FR-032: unknown never matches a requested type)");
    });

    // (d) The closing pin — byObjective.other.count > 0 (Batch 16 fires)
    //     BUT only one funnel type — must be absent.
    await run("case (d): byObjective.other.count > 0 BUT only one funnel → label ABSENT (closing pin)", async () => {
        const res = await drive(
            [angleAgg({
                angleKey: "future_based",
                byObjective: { conversion: { avgLinkCtr: 0.04, count: 8, bestVerdictCount: 2, worstVerdictCount: 1 }, other: { avgLinkCtr: 0.02, count: 5 } },
                byFunnelType: { paid_event: { count: 8, avgLinkCtr: 0.04 } },
            })],
            [],
        );
        const angle = res.strongestAngles.find((a) => a.angleKey === "future_based");
        assert.ok(angle, "expected future_based angle row");
        assert.equal(angle!.multiFunnel, false,
            "case (d) failed: a non-learning-eligible (byObjective.other) audience is not a second funnel type");
    });

    summary();
}

main();
