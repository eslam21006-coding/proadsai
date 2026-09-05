// functions/src/__tests__/phase969/phase969RegistrationGuard.test.ts — mechanical test-registration guard
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Phase 969 mechanical guard.
//
// The rule this protects has been broken twice on this project: a test file
// is added with its own named script in `package.json` but is never added to
// the chain (Phase 970 here, Phase 967 once before that). The outer `test`
// chain reaches its final entry and exits 0, so T067's reach-the-end check
// passes — but the test never runs.
//
// This guard is registered as the FIRST entry in the `test:phase969` chain
// (and runs at every `npm test` invocation through the outer chain). It
// asserts that every 969 test file on disk appears as a chain entry, and
// every chain entry has a matching file on disk. Exit 1 on any mismatch.
//
// The check is mechanical rather than a manual checklist: it globs
// `src/__tests__/phase969/` for `*.test.ts` files and parses the chain
// entries out of `functions/package.json`. The owner correction to
// Batch 01 (§1) makes this explicit: "Do not implement this as a manual
// checklist step. The rule this protects has already been broken twice
// by people who intended to follow it."
//
// ─── Self-test ────────────────────────────────────────────────────
//
// The guard was Batch 02's first submission. It passed on every run
// because the two lists matched. That proved nothing about its
// behaviour — a check whose passing proves nothing because it has never
// been shown capable of failing is the exact failure mode this project
// has been correcting. The owner correction to Batch 02 (§4) made this
// explicit. The fix: the guard runs a **self-test** of its own diff
// logic against synthetic inputs that exercise both mismatch
// directions. If the diff function ever silently drops a missing-from-
// chain or orphaned-in-chain case, the self-test fails and the guard
// reports it. Both mismatch directions are demonstrated on every run.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

declare const __dirname: string;
const ownCompiledPath = join(__dirname, "phase969RegistrationGuard.test.js");
const FUNCTIONS_DIR = resolve(ownCompiledPath, "..", "..", "..", "..");
const TEST_DIR = join(FUNCTIONS_DIR, "src", "__tests__", "phase969");
const PACKAGE_JSON = join(FUNCTIONS_DIR, "package.json");

// ─── Diff logic, extracted for self-testability ──────────────────

interface DiffResult {
    missingFromChain: string[];
    orphanedInChain: string[];
}

/**
 * Pure function: given a list of files on disk and a list of chain
 * entries, return the diff in both directions. Pure so the self-test
 * can drive it with synthetic inputs.
 */
export function diffTestRegistrations(
    files: string[],
    chainEntries: string[],
): DiffResult {
    const missingFromChain = files.filter((p) => !chainEntries.includes(p));
    const orphanedInChain = chainEntries.filter((p) => !files.includes(p));
    return { missingFromChain, orphanedInChain };
}

// ─── Filesystem reads (production inputs) ────────────────────────

function listPhase969TestFiles(): string[] {
    let entries: string[];
    try {
        entries = readdirSync(TEST_DIR);
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") return [];
        throw e;
    }
    return entries.filter((f) => f.endsWith(".test.ts")).sort();
}

function listPhase969ChainEntries(): string[] {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
        scripts: Record<string, string>;
    };
    const master = pkg.scripts["test:phase969"] ?? "";
    const innerNames = Object.keys(pkg.scripts)
        .filter((k) => k.startsWith("test:phase969:"))
        .map((k) => pkg.scripts[k]);
    const allScripts = [master, ...innerNames].join(" && ");
    const re = /node\s+(lib\/__tests__\/phase969\/[A-Za-z0-9_.\-]+\.test\.js)/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(allScripts)) !== null) {
        found.add(m[1]);
    }
    return [...found].sort();
}

// ─── Self-test — both mismatch directions ────────────────────────

console.log("──────────────────────────────────────────────────────────────────────────────");
console.log("Phase 969 test-registration guard — self-test");
console.log("──────────────────────────────────────────────────────────────────────────────");

// The diff function compares two lists of paths. Inputs use the SAME
// shape — `lib/__tests__/phase969/*.test.js` — so the comparison is
// string-equality, not name-only.

const p = (name: string) => `lib/__tests__/phase969/${name}`;

// Missing-from-chain direction: file on disk absent from chain.
{
    const files = [p("alpha.test.js"), p("beta.test.js"), p("gamma.test.js")];
    const chain = [p("alpha.test.js"), p("beta.test.js")];
    const diff = diffTestRegistrations(files, chain);
    assert.deepEqual(diff.missingFromChain, [p("gamma.test.js")],
        "self-test: file on disk absent from chain must be reported");
    assert.deepEqual(diff.orphanedInChain, [],
        "self-test: no orphan when only file-on-disk side differs");
    console.log("  ✅ self-test: missing-from-chain direction detected");
}

// Orphaned-in-chain direction: chain entry points at a file that does not exist.
{
    const files = [p("alpha.test.js")];
    const chain = [p("alpha.test.js"), p("missing.test.js")];
    const diff = diffTestRegistrations(files, chain);
    assert.deepEqual(diff.orphanedInChain, [p("missing.test.js")],
        "self-test: chain entry with no file on disk must be reported");
    assert.deepEqual(diff.missingFromChain, [],
        "self-test: no missing when only chain side differs");
    console.log("  ✅ self-test: orphaned-in-chain direction detected");
}

// Both directions at once.
// - `kept.test.js` is on disk but NOT in the chain (missing-from-chain).
// - `disk-only.test.js` is in the chain but NOT on disk (orphaned).
// - `alpha.test.js` is in both.
{
    const files = [p("alpha.test.js"), p("kept.test.js")];
    const chain = [
        p("alpha.test.js"),
        p("disk-only.test.js"),
    ];
    const diff = diffTestRegistrations(files, chain);
    assert.deepEqual(diff.missingFromChain, [p("kept.test.js")],
        "self-test: kept.test.js is on disk but not in chain");
    assert.deepEqual(diff.orphanedInChain, [p("disk-only.test.js")],
        "self-test: disk-only.test.js is in chain but not on disk");
    console.log("  ✅ self-test: both directions simultaneously");
}

// Empty inputs: both lists empty.
{
    const diff = diffTestRegistrations([], []);
    assert.deepEqual(diff, { missingFromChain: [], orphanedInChain: [] });
    console.log("  ✅ self-test: empty inputs return empty diff");
}

// ─── Production check — filesystem against chain ─────────────────

const files = listPhase969TestFiles().map((f) => p(f.replace(/\.ts$/, ".js")));
const chainEntries = listPhase969ChainEntries();
const productionDiff = diffTestRegistrations(files, chainEntries);

console.log("──────────────────────────────────────────────────────────────────────────────");
console.log("Phase 969 test-registration guard — production check");
console.log("──────────────────────────────────────────────────────────────────────────────");
console.log(`Files on disk (${files.length}):`);
for (const f of files) console.log(`  ${f}`);
console.log(`Chain entries (${chainEntries.length}):`);
for (const e of chainEntries) console.log(`  ${e}`);
console.log("──────────────────────────────────────────────────────────────────────────────");

const allMatch = productionDiff.missingFromChain.length === 0
    && productionDiff.orphanedInChain.length === 0;
if (!allMatch) {
    if (productionDiff.missingFromChain.length > 0) {
        console.log(`MISSING FROM CHAIN (${productionDiff.missingFromChain.length}):`);
        for (const m of productionDiff.missingFromChain) console.log(`  ${m}`);
    }
    if (productionDiff.orphanedInChain.length > 0) {
        console.log(`ORPHANED IN CHAIN (${productionDiff.orphanedInChain.length}):`);
        for (const o of productionDiff.orphanedInChain) console.log(`  ${o}`);
    }
    console.log("──────────────────────────────────────────────────────────────────────────────");
    process.exit(1);
}

// Sanity: this guard's own `.test.js` entry is in the chain.
const ownEntry = ownCompiledPath
    .replace(FUNCTIONS_DIR + "\\", "")
    .replace(/\\/g, "/");
assert.ok(
    chainEntries.includes(ownEntry),
    `registration guard must list itself: ${ownEntry} not in chain`,
);

console.log("OK: every file on disk is in the chain, and every chain entry has a file on disk.");
console.log("──────────────────────────────────────────────────────────────────────────────");
process.exit(0);
