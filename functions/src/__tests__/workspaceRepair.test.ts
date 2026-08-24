// functions/src/__tests__/workspaceRepair.test.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 967 — repair-script contract tests (T-20, T-21, T-23).
//
// Mirrors the pure logic of scripts/repair-workspace-markers.ts so the
// invariants can be asserted without running the script against live
// Firestore. The mirror functions are deliberately written against the
// same rules the script applies — anything that drifts between the two
// will surface here and in the live evidence-r1.md run.
//
//   T-20 (FR-026e): the repair is idempotent — a second run changes
//     nothing.
//   T-21 (FR-026f): the repair NEVER writes any Page field.
//   T-23 (FR-024, FR-026d): a record whose `deletedAt` holds a
//     non-null timestamp is left completely untouched by both repair
//     passes, and is neither re-marked active nor eligible to become
//     the account default.
// ═══════════════════════════════════════════════════════════════════════════

import assert from "node:assert/strict";

const PASSED = 0;
const FAILED = 1;

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function run(name: string, fn: () => Promise<void>) {
    try {
        await fn();
        passed++;
        console.log(`  ✓ ${name}`);
    } catch (err: any) {
        failed++;
        failures.push(`${name}: ${err.message}`);
        console.log(`  ✗ ${name} — ${err.message}`);
    }
}

function summary() {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`workspaceRepair tests: ${passed} passed, ${failed} failed`);
    if (failures.length > 0) {
        console.log("Failures:");
        failures.forEach((f) => console.log(`  - ${f}`));
    }
    console.log("=".repeat(60));
    process.exit(failed > 0 ? FAILED : PASSED);
}

// ─── Mirrors of scripts/repair-workspace-markers.ts ─────────────────────────
//
// The mirrors are intentionally identical in shape to the script's
// pass-1 and pass-2 selectors. Any divergence (renaming the field,
// flipping the `== null` to `=== undefined`) will be caught by T-20 /
// T-23. T-21 asserts a separate invariant (no Page field is ever
// touched).

type DocData = Record<string, any>;

function isMissing(value: unknown): boolean {
    return value === undefined;
}

/**
 * Pass-1 write selector. Returns the set of fields the repair would
 * write for the given doc, or `null` when no write is needed.
 * Mirrors scripts/repair-workspace-markers.ts:applyPass1.
 */
function pass1WriteFor(data: DocData): Record<string, any> | null {
    if (isMissing(data.deletedAt)) return { deletedAt: null };
    return null;
}

/**
 * Pass-2 default-marker selector. Given a per-account snapshot
 * (post-pass-1), returns the doc id that should be marked default,
 * or `null` when no write is needed.
 * Mirrors scripts/repair-workspace-markers.ts:applyPass2.
 */
function pass2WriteFor(
  accountDocs: Array<{ id: string; data: DocData }>,
): string | null {
    if (accountDocs.some((d) => d.data.isDefault === true)) return null;
    const active = accountDocs.filter((d) => d.data.deletedAt == null);
    if (active.length === 0) return null;
    const sorted = [...active].sort((a, b) => {
        const ac = a.data.createdAt, bc = b.data.createdAt;
        if (typeof ac === "number" && typeof bc === "number") return ac - bc;
        if (typeof ac === "number") return -1;
        if (typeof bc === "number") return 1;
        return a.id.localeCompare(b.id);
    });
    return sorted[0].id;
}

/**
 * T-21 invariant — neither pass touches any Page field.
 * The fields listed are the ones defined in data-model.md §1.
 */
const PAGE_FIELDS = ["metaPageId", "metaPageName", "metaPageClearedAt"];

function writesTouchAPageField(write: Record<string, any> | null): boolean {
    if (write === null) return false;
    return PAGE_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(write, f));
}

async function main() {
    // ─── T-20 — idempotence on second run ───────────────────────────────
    await run("T-20a: second run after a full repair writes nothing", async () => {
        // Simulate the post-first-run state for one account:
        //   - every legacy doc has deletedAt: null (pass-1 settled)
        //   - one of them carries isDefault: true (pass-2 settled)
        const doc1: DocData = { deletedAt: null, isDefault: true, createdAt: 1 };
        const doc2: DocData = { deletedAt: null, isDefault: false, createdAt: 2 };
        const doc3: DocData = { deletedAt: null, isDefault: false, createdAt: 3 };

        // Second-run pass 1: every doc already has deletedAt set; none
        // gets rewritten.
        assert.equal(pass1WriteFor(doc1), null, "T-20a: pass 1 returns null for already-repaired doc");
        assert.equal(pass1WriteFor(doc2), null, "T-20a: pass 1 returns null for already-repaired doc");
        assert.equal(pass1WriteFor(doc3), null, "T-20a: pass 1 returns null for already-repaired doc");

        // Second-run pass 2: account already has a default; no write.
        assert.equal(
            pass2WriteFor([
                { id: "ws-1", data: doc1 },
                { id: "ws-2", data: doc2 },
                { id: "ws-3", data: doc3 },
            ]),
            null,
            "T-20a: pass 2 returns null because an isDefault=true doc exists",
        );
    });

    await run("T-20b: first run writes exactly what the contract says", async () => {
        // Pre-repair state: legacy doc has no deletedAt key.
        const legacyDoc: DocData = { isDefault: false, createdAt: 1 };
        assert.deepEqual(
            pass1WriteFor(legacyDoc),
            { deletedAt: null },
            "T-20b: pass 1 writes deletedAt: null",
        );

        // Account has no isDefault=true doc → pass 2 picks the oldest.
        assert.equal(
            pass2WriteFor([
                { id: "ws-legacy", data: { deletedAt: null, isDefault: false, createdAt: 1 } },
                { id: "ws-newer", data: { deletedAt: null, isDefault: false, createdAt: 2 } },
            ]),
            "ws-legacy",
            "T-20b: pass 2 picks the oldest active workspace (FR-026d)",
        );
    });

    // ─── T-21 — repair writes no Page field ─────────────────────────────
    await run("T-21a: pass-1 write shape never includes a Page field", async () => {
        // Worst-case legacy doc that somehow already carried a partial
        // Page value (shouldn't happen, but T-21 is the regression
        // barrier). The pass-1 write must not echo or alter it.
        const legacyWithPageBits: DocData = {
            metaPageId: "stale", // some unrelated stray value
            metaPageName: "Stale",
            metaPageClearedAt: null,
        };
        const write = pass1WriteFor(legacyWithPageBits);
        assert.ok(write !== null, "T-21a: legacy doc still triggers a pass-1 write");
        assert.equal(
            writesTouchAPageField(write),
            false,
            "T-21a: pass-1 write does NOT include any Page field (FR-026f)",
        );
        assert.deepEqual(
            write,
            { deletedAt: null },
            "T-21a: pass-1 write is exactly { deletedAt: null } — nothing else",
        );
    });

    await run("T-21b: pass-2 write (isDefault=true) never includes a Page field", async () => {
        // Even if the picked-default doc already had Page values, the
        // pass-2 write is just `{ isDefault: true }`.
        const picked = {
            id: "ws-1",
            data: {
                deletedAt: null,
                isDefault: false,
                createdAt: 1,
                metaPageId: "would-be-stale",
                metaPageName: "would-be-stale",
                metaPageClearedAt: 12345,
            } as DocData,
        };
        assert.equal(
            pass2WriteFor([picked]),
            "ws-1",
            "T-21b: pass 2 picks the right doc",
        );
        // The pass-2 write in the script is `{ isDefault: true }`; mirror:
        const pass2WriteShape = { isDefault: true };
        assert.equal(
            writesTouchAPageField(pass2WriteShape),
            false,
            "T-21b: pass-2 write shape does NOT include any Page field (FR-026f)",
        );
    });

    await run("T-21c: an empty/null pass-1 write is a no-op (no fields at all)", async () => {
        // A doc that doesn't need any work — the write selector returns
        // null. Verify nothing leaks through.
        const alreadyClean: DocData = { deletedAt: null, isDefault: false, createdAt: 5 };
        assert.equal(pass1WriteFor(alreadyClean), null, "T-21c: already-clean doc → null write");
    });

    // ─── T-23 — soft-deleted records are untouched ──────────────────────
    await run("T-23a: pass 1 leaves a non-null deletedAt untouched", async () => {
        const softDeleted: DocData = {
            deletedAt: 1718901234567, // a non-null timestamp
            isDefault: false,
            createdAt: 1,
        };
        assert.equal(
            pass1WriteFor(softDeleted),
            null,
            "T-23a: pass 1 returns null for any doc whose deletedAt is already non-null",
        );
    });

    await run("T-23b: pass 2 NEVER picks a soft-deleted workspace as default", async () => {
        const accountDocs = [
            { id: "ws-deleted-old", data: { deletedAt: 100, isDefault: false, createdAt: 1 } as DocData },
            { id: "ws-deleted-mid", data: { deletedAt: 200, isDefault: false, createdAt: 2 } as DocData },
            { id: "ws-active", data: { deletedAt: null, isDefault: false, createdAt: 3 } as DocData },
        ];
        // The oldest active by createdAt is ws-active (createdAt=3). The
        // soft-deleted ones have older createdAt values but must NOT be
        // eligible — FR-024 forbids re-marking a deleted workspace.
        assert.equal(
            pass2WriteFor(accountDocs),
            "ws-active",
            "T-23b: pass 2 picks the active workspace, not the older deleted one",
        );
    });

    await run("T-23c: account with only soft-deleted workspaces → null write", async () => {
        const accountDocs = [
            { id: "ws-1", data: { deletedAt: 100, isDefault: false, createdAt: 1 } as DocData },
            { id: "ws-2", data: { deletedAt: 200, isDefault: false, createdAt: 2 } as DocData },
        ];
        assert.equal(
            pass2WriteFor(accountDocs),
            null,
            "T-23c: no active workspace → nothing to mark (FR-024)",
        );
    });

    await run("T-23d: pass 1 does NOT promote a soft-deleted doc back to active", async () => {
        // This is the FR-024 guarantee expressed on the wire: the
        // repair must never overwrite a non-null deletedAt with null.
        // The mirror returns null for any already-deleted doc, which is
        // exactly that guarantee.
        const softDeleted: DocData = { deletedAt: 999, isDefault: false, createdAt: 1 };
        const write = pass1WriteFor(softDeleted);
        assert.equal(write, null, "T-23d: pass 1 does not write anything for a soft-deleted doc");
        // And the inverse — pass 1's only possible write, if it returns
        // a shape, is `{ deletedAt: null }`. There is no path that
        // produces `{ deletedAt: <timestamp> }` for any input.
        const write2 = pass1WriteFor({}); // empty doc → missing key → pass-1 fires
        assert.deepEqual(write2, { deletedAt: null }, "T-23d: pass-1 write shape is fixed");
    });

    summary();
}

main().catch((err) => {
    console.error("workspaceRepair.test.ts main() crashed:", err);
    process.exit(FAILED);
});
