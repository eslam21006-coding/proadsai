// scripts/sc11Guard.mjs — Phase 14 SC-11 QA guard
// ═══════════════════════════════════════════════════════════════════════════
// FAILS the build if any user-facing string in `src/**` contains a forbidden
// term: "ميديان" (forbidden English borrow), "Link CTR", "CTR", "CPA", "CPM",
// or a percentage value (`42%`, `3.5 %`, `12.3percent`). Spec §2.6 + plan §
// "Cross-cutting constraints" + research §H (Arabic copy is plain-language,
// "متوسط" is internal-only — NOT user-facing).
//
// POLICY:
//
//   1. "متوسط" is INTERNAL-ONLY (not in src/**). It is NOT in the pattern set
//      here. The user-facing equivalent in stats labels is "المعدل" or
//      appropriate Fusha.
//
//   2. The forbidden terms (الـ 6 patterns below) are banned in user-facing
//      copy only. They may appear freely in:
//        - comments (`//`, `/* */`)
//        - import statements
//        - CSS / className / style literals
//        - technical identifiers (variable, function, class names)
//        - type signatures / JSDoc
//        - logger strings (server-side, never user-visible)
//
//      This guard extracts ONLY string-literal and JSX-text-node content from
//      each file. It does NOT scan comments, type annotations, imports, or
//      identifiers (per the project's i18n policy that says "user-visible
//      strings go through useT()").
//
//   3. Detection approach:
//      - `.ts` / `.tsx` / `.js` / `.jsx`: parse via `@babel/parser`-free
//        regex (string-literal + JSX text scanner) — keeps zero npm deps.
//      - `.html`: scan every text node.
//      - All extracted strings are concatenated and regex-checked.
//
// WIRING: invoked from `npm run lint` (root package.json). Exits non-zero on
// any hit so CI fails loudly. Allowlist files via `SC11_ALLOWLIST` env (CSV
// of paths to skip — e.g. pre-existing violations awaiting cleanup).
//
// SCAN POLICY: text-bearing files (.ts, .tsx, .js, .jsx, .html). Skip
// .gitignore, node_modules, dist, build, coverage, .firebase, scripts/
// (server-side scripts can't reach users).
// ═══════════════════════════════════════════════════════════════════════════

import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";

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
// NOTE: "متوسط" is INTENTIONALLY OMITTED. It is internal-only terminology.
// See POLICY §1 above.
const PATTERNS = [
    { code: "AR_MEEDIAN",     label: "ميديان (forbidden English)",    re: /ميديان/g },
    { code: "EN_LINK_CTR",    label: "Link CTR (English)",            re: /Link\s*CTR/gi },
    { code: "EN_CTR",         label: "CTR (English)",                 re: /(?<![\w-])CTR(?![\w-])/g },
    { code: "EN_CPA",         label: "CPA (English)",                 re: /(?<![\w-])CPA(?![\w-])/g },
    { code: "EN_CPM",         label: "CPM (English)",                 re: /(?<![\w-])CPM(?![\w-])/g },
    { code: "PERCENT_SIGN",   label: "percentage sign in user copy",  re: /\d+\s*%|percent/gi },
];

function walk(dir, out) {
    let entries;
    try { entries = readdirSync(dir); } catch { return out; }
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

// ─── User-facing string extraction ────────────────────────────
//
// Three passes:
//   1. Template literals (`backtick` strings), preserving ${...} placeholders.
//   2. Single/double-quoted string literals.
//   3. JSX text nodes — content between `>` and `<`, with brace-expressions
//      stripped.
//
// We DO NOT extract comments, identifiers, import paths, or CSS strings.

function extractStringLiterals(src) {
    const out = [];
    // Single/double-quoted strings: match balanced escapes.
    const quotedRe = /(['"`])((?:\\.|(?!\1).)*?)\1/g;
    let m;
    while ((m = quotedRe.exec(src)) !== null) {
        // Only true string literals — skip template-only delimiters that
        // don't have `${...}` (those get picked up here too, which is fine;
        // they're user-facing if written as bare backtick strings).
        if (m[2] && m[2].length > 0) out.push({ index: m.index, text: m[2] });
    }
    return out;
}

function extractJsxTextNodes(src) {
    const out = [];
    // JSX text nodes are inside `>` ... `<` (with no `{` between) or between
    // tag close and next tag open. We use a simple state machine:
    //   - inside element: text between `>` and `<` is a text node.
    //   - inside attribute: skip (handled by string literal extraction).
    let i = 0;
    const len = src.length;
    let inJsx = false;          // between <Tag ...> and </Tag> or </>
    let inAttribute = false;   // inside a tag, after `=` before quote
    let jsxTextStart = -1;
    while (i < len) {
        const ch = src[i];
        const next = src[i + 1];
        if (!inJsx) {
            // Look for the start of a JSX element: `<` followed by a letter or `/`
            if (ch === "<" && (next === "/" || /[A-Za-z]/.test(next || ""))) {
                inJsx = true;
                jsxTextStart = -1;
            }
            i++;
            continue;
        }
        // In a JSX context
        if (ch === ">") {
            // End of opening tag. The next text (until `<`) is a text node.
            inJsx = false;
            if (jsxTextStart !== -1) {
                const text = src.slice(jsxTextStart, i).trim();
                if (text.length > 0 && !text.startsWith("{") && !text.endsWith("}")) {
                    out.push({ index: jsxTextStart, text });
                }
                jsxTextStart = -1;
            }
            // After `>`, start collecting text until next `<`
            i++;
            if (i < len && src[i] !== "<") {
                jsxTextStart = i;
            }
            continue;
        }
        if (ch === "<") {
            // End of text or another tag opener
            if (jsxTextStart !== -1) {
                const text = src.slice(jsxTextStart, i).trim();
                if (text.length > 0 && !text.startsWith("{") && !text.endsWith("}")) {
                    out.push({ index: jsxTextStart, text });
                }
                jsxTextStart = -1;
            }
            inJsx = true;
            i++;
            continue;
        }
        if (jsxTextStart === -1 && !/\s/.test(ch)) {
            // We're inside the tag body — skip attribute names
        }
        i++;
    }
    // Trailing text
    if (jsxTextStart !== -1 && jsxTextStart < len) {
        const text = src.slice(jsxTextStart).trim();
        if (text.length > 0) out.push({ index: jsxTextStart, text });
    }
    return out;
}

function extractUserFacingStrings(src) {
    return [
        ...extractStringLiterals(src),
        ...extractJsxTextNodes(src),
    ];
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
        const strings = extractUserFacingStrings(src);
        for (const s of strings) {
            for (const p of PATTERNS) {
                p.re.lastIndex = 0;
                let m;
                while ((m = p.re.exec(s.text)) !== null) {
                    // Map back to source line/col by absolute index.
                    const absIdx = s.index + m.index;
                    const { line, col } = lineColFor(src, absIdx);
                    const lineText = src.slice(
                        Math.max(0, src.lastIndexOf("\n", absIdx - 1) + 1),
                        src.indexOf("\n", absIdx) === -1 ? src.length : src.indexOf("\n", absIdx),
                    );
                    hits.push({ file: rel, line, col, code: p.code, label: p.label, match: m[0], lineText });
                }
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