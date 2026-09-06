// functions/src/__tests__/testRegistrationGuard.test.ts — chain-wide mechanical test-registration guard
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Project-wide mechanical guard (formerly `phase969RegistrationGuard.test.ts`,
// widened in Batch 11 to cover every chain entry, not only those under
// `src/__tests__/phase969/`).
//
// The rule this protects has been broken on this project before Batch 11:
// the `npm test` chain in `functions/package.json` registered two stale
// entries (`learningAggregates.test.js`, `learningIntegration.test.js`)
// whose `.ts` source had been deleted, but the chain kept passing because
// compiled `.js` artifacts survived in the gitignored `lib/` directory.
// A clean build (`Remove-Item -Recurse -Force lib; npm run build`) did
// not regenerate them, so `npm test` exited 1 at the missing-module
// point. The user observed this in December; the guard that would have
// caught it in September is THIS file. It now scans the whole codebase.
//
// What this guard checks:
//
//   1. For every `*.test.ts` under `src/__tests__/` (recursively) and every
//      `*.test.ts` at `src/` top level, the corresponding `lib/<path>.test.js`
//      appears as a chain entry in `functions/package.json`.
//   2. For every `node lib/<path>.test.js` reference in any script string
//      of `functions/package.json`, the corresponding `src/<path>.test.ts`
//      exists on disk.
//   3. The check is mechanical (no manual checklist step). It parses the
//      scripts JSON and globs the filesystem; nothing is hand-maintained.
//   4. Run as the FIRST entry in the outer `npm test` chain. A drift is
//      reported with both directions (missing-from-chain and orphaned-
//      in-chain) and the process exits 1.
//
// Self-test:
//
// The diff function (`diffTestRegistrations`) is pure and exercised by a
// built-in self-test against synthetic inputs that pin BOTH mismatch
// directions (a guard whose passing proves nothing because it has never
// been shown capable of failing is the exact failure mode this project
// has been correcting; see Batch 02 §4 owner correction). Five self-test
// cases are kept verbatim from the original phase969-scoped guard; the
// diff function's contract is unchanged by widening the production
// inputs. If a future change silently narrows the diff (e.g. dropping
// one direction), the self-test fails and the guard reports it.

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

declare const __dirname: string;
// When run as `node lib/__tests__/testRegistrationGuard.test.js`,
// `__dirname` is `lib/__tests__/`. Two levels up is `functions/`.
const FUNCTIONS_DIR = resolve(__dirname, "..", "..");
const SRC_DIR = join(FUNCTIONS_DIR, "src");
const TESTS_DIR = join(SRC_DIR, "__tests__");
const PACKAGE_JSON = join(FUNCTIONS_DIR, "package.json");
const ownCompiledPath = join(__dirname, "testRegistrationGuard.test.js");

// ─── Diff logic, extracted for self-testability ──────────────────

interface DiffResult {
    missingFromChain: string[];
    orphanedInChain: string[];
}

/**
 * Pure function: given a list of expected lib-paths (derived from `src/`
 * files) and a list of chain entries (parsed from `package.json`), return
 * the diff in both directions. Pure so the self-test can drive it with
 * synthetic inputs.
 */
export function diffTestRegistrations(
    expectedFromSrc: string[],
    chainEntries: string[],
): DiffResult {
    const missingFromChain = expectedFromSrc.filter((p) => !chainEntries.includes(p));
    const orphanedInChain = chainEntries.filter((p) => !expectedFromSrc.includes(p));
    return { missingFromChain, orphanedInChain };
}

// ─── Filesystem reads (production inputs) ────────────────────────

/**
 * Walk `root` recursively and return every `*.test.ts` path relative
 * to the ORIGINAL `root` (forward-slash-separated). The original root
 * is threaded through the recursion so subdirectory walks do not lose
 * the top-level prefix.
 */
function walkTestFiles(root: string, originalRoot: string = root): string[] {
    const out: string[] = [];
    let entries: string[];
    try {
        entries = readdirSync(root);
    } catch (e) {
        const err = e as NodeJS.ErrnoException;
        if (err.code === "ENOENT") return [];
        throw e;
    }
    for (const name of entries) {
        const full = join(root, name);
        let s;
        try { s = statSync(full); } catch { continue; }
        if (s.isDirectory()) {
            out.push(...walkTestFiles(full, originalRoot));
        } else if (s.isFile() && name.endsWith(".test.ts")) {
            out.push(relative(originalRoot, full).split(sep).join("/"));
        }
    }
    return out;
}

/**
 * Return every `*.test.ts` relative to `src/`, forward-slash.
 *
 * Includes both:
 *   - `src/__tests__/` recursively, every `*.test.ts` below it
 *   - `src/*.test.ts` (top-level — e.g. failureClassification.test.ts,
 *     contractFixtures.test.ts, languageQuality.test.ts)
 *
 * Each entry is the relative path WITHIN `src/`. The caller maps to the
 * expected chain entry by replacing the `src/` prefix with `lib/` and
 * `.ts` with `.js`.
 */
function listAllTestFiles(): string[] {
    const top = walkTestFiles(SRC_DIR);
    return top.filter((p) => p.endsWith(".test.ts")).sort();
}

/**
 * Map every `src/<path>.test.ts` to its expected chain entry —
 * `lib/<path>.test.js` — and return the deduped, sorted list.
 */
function expectedChainEntriesFromSrc(srcRel: string[]): string[] {
    const expected = srcRel.map((p) => `lib/${p.replace(/\.ts$/, ".js")}`);
    return [...new Set(expected)].sort();
}

/**
 * Parse every `node lib/<path>.test.js` reference from the scripts
 * section of `functions/package.json`. Scripts are joined with ` && `
 * so the regex sees a single continuous stream. Returns deduped, sorted
 * entries.
 */
function listAllChainEntries(): string[] {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
        scripts: Record<string, string>;
    };
    const allScripts = Object.values(pkg.scripts).join(" && ");
    // Match `node lib/...test.js` and capture the path up to whitespace
    // or `&&` boundary. The character class is liberal on purpose —
    // any lib-path under `lib/` ending in `.test.js` is a candidate.
    const re = /node\s+(lib\/[A-Za-z0-9_./\-]+\.test\.js)/g;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = re.exec(allScripts)) !== null) {
        found.add(m[1]);
    }
    return [...found].sort();
}

// ─── Self-test — both mismatch directions ────────────────────────

console.log("──────────────────────────────────────────────────────────────────────────────");
console.log("Chain-wide test-registration guard — self-test");
console.log("──────────────────────────────────────────────────────────────────────────────");

// Self-tests pin the diff function's contract regardless of production
// inputs. They use lib-path-shaped strings (the same shape the
// production code passes), so the comparison is string-equality, not
// name-only.

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

// Source file with no compiled counterpart — the strongest form of the
// missing-from-chain case. The guard reads `src/` (source), not `lib/`
// (compiled), so a `.test.ts` that fails to compile is still seen.
// Without this guarantee, a test file with a TS error would be both
// unregistered and uncompiled, and the guard would silently report OK.
// This self-test pins the comparison on the *expected* chain entry
// (the lib/ path), so even if the source fails to compile, the guard
// sees the gap.
{
    const files = [p("never-compiled.test.js")];
    const chain: string[] = [];
    const diff = diffTestRegistrations(files, chain);
    assert.deepEqual(diff.missingFromChain, [p("never-compiled.test.js")],
        "self-test: source file with no chain entry must be reported " +
        "even if its .js has never been built");
    console.log("  ✅ self-test: source with no compiled counterpart still detected");
}

// ─── Production check — filesystem against chain ─────────────────

const srcRelPaths = listAllTestFiles();
const expected = expectedChainEntriesFromSrc(srcRelPaths);
const chainEntries = listAllChainEntries();
const diff = diffTestRegistrations(expected, chainEntries);

console.log("──────────────────────────────────────────────────────────────────────────────");
console.log("Chain-wide test-registration guard — production check");
console.log("──────────────────────────────────────────────────────────────────────────────");
console.log(`Test files on disk (${srcRelPaths.length}, src-relative):`);
for (const f of srcRelPaths) console.log(`  src/${f}`);
console.log(`Expected chain entries (${expected.length}, lib path):`);
for (const e of expected) console.log(`  ${e}`);
console.log(`Chain entries parsed from functions/package.json (${chainEntries.length}):`);
for (const e of chainEntries) console.log(`  ${e}`);
console.log("──────────────────────────────────────────────────────────────────────────────");

const allMatch = diff.missingFromChain.length === 0 && diff.orphanedInChain.length === 0;
if (!allMatch) {
    if (diff.missingFromChain.length > 0) {
        console.log(`MISSING FROM CHAIN (${diff.missingFromChain.length}):`);
        for (const m of diff.missingFromChain) console.log(`  ${m}`);
    }
    if (diff.orphanedInChain.length > 0) {
        console.log(`ORPHANED IN CHAIN (${diff.orphanedInChain.length}):`);
        for (const o of diff.orphanedInChain) console.log(`  ${o}`);
    }
    console.log("──────────────────────────────────────────────────────────────────────────────");
    process.exit(1);
}

// Sanity: this guard's own `.test.js` entry is in the chain.
const ownEntry = ownCompiledPath
    .replace(FUNCTIONS_DIR + sep, "")
    .replace(/\\/g, "/");
assert.ok(
    chainEntries.includes(ownEntry),
    `registration guard must list itself: ${ownEntry} not in chain`,
);

console.log("OK: every file on disk is in the chain, and every chain entry has a file on disk.");
console.log("──────────────────────────────────────────────────────────────────────────────");
process.exit(0);
