// scripts/sc11Guard.mjs — Phase 14 SC-11 QA guard
// ═══════════════════════════════════════════════════════════════════════════
// FAILS the build if any user-facing string in `src/**` contains a forbidden
// term: "متوسط" (user-facing), "ميديان", "Link CTR", "CTR", "CPA", "CPM", or
// a percentage value (`42%`, `3.5 %`, `12.3percent`). Spec §2.6 + plan §
// "Cross-cutting constraints" + research §H (Arabic copy is plain-language,
// "متوسط" is internal-only).
//
// WIRING: invoked from `npm run lint` (root package.json). Exits non-zero on
// any hit so CI fails loudly. Allowlist files via `SC11_ALLOWLIST` env (CSV
// of paths to skip — e.g. test fixtures).
//
// SCAN POLICY: text-bearing files (.ts, .tsx, .js, .jsx, .html). Skip
// .gitignore, node_modules, dist, build, coverage, .firebase. Skip JSX
// attribute strings inside known framework imports / public asset paths.
// ═══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");
const ALLOWLIST = new Set(
    (process.env.SC11_ALLOWLIST || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
);

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
const SKIP_DIRS = new Set([
    "node_modules", "dist", "build", "coverage", ".firebase", ".git",
    "out", "lib", ".next", ".cache",
]);

// Forbidden patterns. Each MUST be a plain-language violation of SC-11.
// Notes:
//   - "متوسط" is INTERNAL-ONLY — never user-facing. We DO NOT flag it in
//     `src/**` because no user-facing copy should ever reach a user.
//   - Percentages: any "42%" or "42 %" or "42percent" pattern. Avoid matching
//     e.g. "100%" inside strings used for layout — but those are forbidden
//     too per SC-11 ("zero percent signs in user-facing copy").
const PATTERNS = [
    { code: "AR_MUTAWASSIT",  label: "متوسط (internal-only)",        re: /متوسط/g },
    { code: "AR_MEEDIAN",     label: "ميديان (forbidden English)",    re: /ميديان/g },
    { code: "EN_LINK_CTR",    label: "Link CTR (English)",            re: /Link\s*CTR/gi },
    { code: "EN_CTR",         label: "CTR (English)",                 re: /(?<![\w-])CTR(?![\w-])/g },
    { code: "EN_CPA",         label: "CPA (English)",                 re: /(?<![\w-])CPA(?![\w-])/g },
    { code: "EN_CPM",         label: "CPM (English)",                 re: /(?<![\w-])CPM(?![\w-])/g },
    { code: "PERCENT_SIGN",   label: "percentage sign in user copy",  re: /\d+\s*%|percent/gi },
];

function walk(dir, out) {
    let entries;
    try {
        entries = readdirSync(dir);
    } catch {
        return out;
    }
    for (const name of entries) {
        if (SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
            walk(full, out);
        } else if (TEXT_EXT.has(extname(name))) {
            out.push(full);
        }
    }
    return out;
}

function lineColFor(src, index) {
    let line = 1, col = 1;
    for (let i = 0; i < index; i++) {
        if (src.charCodeAt(i) === 10) { line++; col = 1; } else { col++; }
    }
    return { line, col };
}

function main() {
    if (!existsSync(SRC_DIR)) {
        console.log(`sc11-guard: src/ not found at ${SRC_DIR}; skipping.`);
        return;
    }
    const files = walk(SRC_DIR, []);
    const hits = [];

    for (const file of files) {
        const rel = relative(ROOT, file);
        if (ALLOWLIST.has(rel)) continue;
        let src;
        try { src = readFileSync(file, "utf8"); }
        catch { continue; }
        for (const p of PATTERNS) {
            p.re.lastIndex = 0;
            let m;
            while ((m = p.re.exec(src)) !== null) {
                const { line, col } = lineColFor(src, m.index);
                const lineText = src.slice(
                    Math.max(0, src.lastIndexOf("\n", m.index - 1) + 1),
                    src.indexOf("\n", m.index) === -1 ? src.length : src.indexOf("\n", m.index),
                );
                hits.push({ file: rel, line, col, code: p.code, label: p.label, match: m[0], lineText });
            }
        }
    }

    if (hits.length === 0) {
        console.log(`sc11-guard: PASS — ${files.length} files scanned, 0 forbidden terms.`);
        return;
    }
    console.error(`sc11-guard: FAIL — ${hits.length} forbidden term(s) found:`);
    for (const h of hits) {
        console.error(`  ${h.file}:${h.line}:${h.col}  [${h.code}] ${h.label}  → "${h.match}"`);
        console.error(`      ${h.lineText.trim().slice(0, 120)}`);
    }
    process.exit(1);
}

function existsSync(p) {
    try { statSync(p); return true; } catch { return false; }
}

main();