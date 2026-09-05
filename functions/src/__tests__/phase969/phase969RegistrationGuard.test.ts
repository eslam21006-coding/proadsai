// functions/src/__tests__/phase969/phase969RegistrationGuard.test.ts — mechanical test-registration guard
// ════════════════════════════════════════════════════════════════════════════════════════════════════
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

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// `__dirname` is provided by Node's CommonJS runtime under the project's
// `module: NodeNext` + `moduleResolution: nodenext` tsconfig (the file is
// compiled to CommonJS and run with `node lib/...`). Walking from there
// gives us the absolute paths we need.
declare const __dirname: string;
const ownCompiledPath = join(__dirname, "phase969RegistrationGuard.test.js");
// lib/__tests__/phase969/ →  lib/__tests__/  →  lib/  →  functions/
const FUNCTIONS_DIR = resolve(ownCompiledPath, "..", "..", "..", "..");
const TEST_DIR = join(FUNCTIONS_DIR, "src", "__tests__", "phase969");
const PACKAGE_JSON = join(FUNCTIONS_DIR, "package.json");

// ─── Files on disk ───────────────────────────────────────────────

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

// ─── Chain entries in package.json ───────────────────────────────
// Match `node lib/__tests__/phase969/X.test.js` references inside the
// `test:phase969` script AND every `test:phase969:*` script (which the
// master chain pulls in via `npm run`). One level of recursion is enough
// because the chain script pulls in its inner scripts but does not nest
// further.
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

// ─── Diff ─────────────────────────────────────────────────────────

const files = listPhase969TestFiles();
const chainEntries = listPhase969ChainEntries();

// Convert files on disk to their expected `lib/...` paths.
const expected = files
    .map((f) => `lib/__tests__/phase969/${f.replace(/\.ts$/, ".js")}`)
    .sort();

const missingFromChain = expected.filter((p) => !chainEntries.includes(p));
const orphanedInChain = chainEntries.filter((p) => !expected.includes(p));
const allMatch = missingFromChain.length === 0 && orphanedInChain.length === 0;

const sep = "─".repeat(78);
console.log(sep);
console.log("Phase 969 test-registration guard");
console.log(sep);
console.log(`Files on disk (${files.length}):`);
for (const f of files) console.log(`  ${f}`);
console.log(`Chain entries (${chainEntries.length}):`);
for (const e of chainEntries) console.log(`  ${e}`);
console.log(sep);

if (!allMatch) {
    if (missingFromChain.length > 0) {
        console.log(`MISSING FROM CHAIN (${missingFromChain.length}):`);
        for (const m of missingFromChain) console.log(`  ${m}`);
    }
    if (orphanedInChain.length > 0) {
        console.log(`ORPHANED IN CHAIN (${orphanedInChain.length}):`);
        for (const o of orphanedInChain) console.log(`  ${o}`);
    }
    console.log(sep);
    process.exit(1);
}

// Sanity: this guard's own `.test.js` entry is in the chain.
const ownEntry = relative(FUNCTIONS_DIR, __filename)
    .replace(/\\/g, "/")
    .replace(/\.ts$/, ".js");
assert.ok(
    chainEntries.includes(ownEntry),
    `registration guard must list itself: ${ownEntry} not in chain`,
);

console.log("OK: every file on disk is in the chain, and every chain entry has a file on disk.");
console.log(sep);
process.exit(0);
