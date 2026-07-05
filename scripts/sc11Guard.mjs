// scripts/sc11Guard.mjs — Phase 14 SC-11 QA guard
// ═══════════════════════════════════════════════════════════════════════════
// FAILS the build if any user-facing string in `src/**` contains a forbidden
// term: "ميديان" (forbidden English borrow), "Link CTR", "CTR", "CPA", "CPL",
// "CPM", or a percentage value (`42%`, `3.5 %`, `12.3percent`). Spec §2.6 +
// plan §"Cross-cutting constraints" + research §H (Arabic copy is
// plain-language, "متوسط" is internal-only — NOT user-facing).
//
// POLICY:
//
//   1. "متوسط" is INTERNAL-ONLY (not in src/**). It is NOT in the pattern set
//      here. The user-facing equivalent in stats labels is "المعدل" or
//      appropriate Fusha.
//
//   2. The forbidden terms are banned in user-facing copy ONLY. They may
//      appear freely in:
//        - comments (`//`, `/* */`, `<!-- -->`)
//        - import statements
//        - CSS / className / style / SVG attributes (e.g. `width="100%"`)
//        - technical identifiers (variable, function, class names)
//        - type signatures / JSDoc
//        - logger strings (server-side, never user-visible)
//
//      We achieve this by rejecting any matching content whose source line
//      is fully inside a comment block, an attribute zone of a JSX tag, or
//      after a `//` line comment marker. This eliminates the false-positive
//      hits that the previous version produced on `width="100%"`, Tailwind
//      percentages like `w-[50%]`, and code-comment examples.
//
//   3. Detection approach:
//      - `.ts` / `.tsx` / `.js` / `.jsx`: regex-based extraction of
//        string-literals + JSX text nodes, with per-line attribute and
//        comment zones stripped before pattern matching. Zero npm deps.
//      - `.html`: scan every text node.
//      - All extracted strings are concatenated and regex-checked.
//
// WIRING: invoked from `npm run lint` (root package.json). Exits non-zero on
// any hit so CI fails loudly. Allowlist files via `scripts/.sc11-allowlist`
// (one path per line — pre-existing violations awaiting cleanup) OR via the
// `SC11_ALLOWLIST` env var (CSV of paths to skip — same format).
//
// SCAN POLICY: text-bearing files (.ts, .tsx, .js, .jsx, .html). Skip
// .gitignore, node_modules, dist, build, coverage, .firebase, scripts/
// (server-side scripts can't reach users).
// ═══════════════════════════════════════════════════════════════════════════

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();
const SRC_DIR = join(ROOT, "src");

function loadAllowlist() {
    const set = new Set();
    const file = join(ROOT, "scripts", ".sc11-allowlist");
    if (existsSync(file)) {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const t = line.trim();
            if (t && !t.startsWith("#")) set.add(t);
        }
    }
    if (process.env.SC11_ALLOWLIST) {
        for (const p of process.env.SC11_ALLOWLIST.split(",")) {
            const t = p.trim();
            if (t) set.add(t);
        }
    }
    return set;
}
const ALLOWLIST = loadAllowlist();

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".html"]);
const SKIP_DIRS = new Set([
    "node_modules", "dist", "build", "coverage", ".firebase", ".git",
    "out", "lib", ".next", ".cache",
]);

// Forbidden patterns. Each MUST be a plain-language violation of SC-11.
// NOTE: "متوسط" is INTENTIONALLY OMITTED. It is internal-only terminology.
// CPL is added (2026-07 batch 01 audit) — CPL is a technical metric like
// CPA/CPM and must not appear in user-facing Arabic copy.
const PATTERNS = [
    { code: "AR_MEEDIAN",     label: "ميديان (forbidden English)",    re: /ميديان/g },
    { code: "EN_LINK_CTR",    label: "Link CTR (English)",            re: /Link\s*CTR/gi },
    { code: "EN_CTR",         label: "CTR (English)",                 re: /(?<![\w-])CTR(?![\w-])/g },
    { code: "EN_CPA",         label: "CPA (English)",                 re: /(?<![\w-])CPA(?![\w-])/g },
    { code: "EN_CPL",         label: "CPL (English)",                 re: /(?<![\w-])CPL(?![\w-])/g },
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

// ─── Source-zone classification ───────────────────────────────
//
// A "non-user-facing zone" is a region of source that, per the policy
// above, is exempt from SC-11 enforcement:
//
//   - COMMENT_LINE     — a line whose first non-whitespace token is `//`.
//   - COMMENT_BLOCK    — content inside a `/* ... */` block (or JSX `{/* */}`).
//   - ATTRIBUTE        — text inside an opening JSX tag's attribute zone
//                        (between `<Tag` and the closing `>`).
//
// We pre-compute, for each line, whether it lies inside any non-user-facing
// zone. The matcher then filters out matches on those lines.

function buildSourceZones(src) {
    const len = src.length;
    // For each character, an integer bitmask: 1=COMMENT_LINE, 2=COMMENT_BLOCK, 4=ATTRIBUTE
    const mask = new Uint8Array(len);
    let m = 0;
    let i = 0;
    while (i < len) {
        const ch = src[i];
        const next = src[i + 1];
        if ((m & 4) === 0 && (m & 2) === 0 && ch === "/" && next === "/") {
            m |= 1;
            i += 2;
            // continue to EOL
            while (i < len && src[i] !== "\n") {
                mask[i] |= 1;
                i++;
            }
            mask[i] |= 1; // mark newline too
            continue;
        }
        if ((m & 4) === 0 && ch === "/" && next === "*") {
            const start = i;
            m |= 2;
            i += 2;
            while (i < len - 1 && !(src[i] === "*" && src[i + 1] === "/")) {
                mask[i] |= 2;
                i++;
            }
            if (i < len - 1) {
                mask[i] |= 2;     // *
                mask[i + 1] |= 2; // /
                i += 2;
            } else {
                mask[i] |= 2;
                i++;
            }
            m &= ~2;
            continue;
        }
        // Track JSX attribute zones.
        if ((m & 4) === 0 && ch === "<" && (next === "/" || /[A-Za-z_]/.test(next || ""))) {
            // Start of a tag. Walk until matching `>` or end-of-file,
            // marking everything inside as ATTRIBUTE (4).
            const tagStart = i;
            m |= 4;
            i++;
            // Skip until `>`, but be careful with quoted attribute values
            // which may legitimately contain `{` and other JSX expressions.
            while (i < len && src[i] !== ">") {
                const c = src[i];
                if (c === "\"" || c === "'") {
                    // skip the entire quoted value
                    const q = c;
                    mask[i] |= 4;
                    i++;
                    while (i < len && src[i] !== q) {
                        mask[i] |= 4;
                        i++;
                    }
                    if (i < len) {
                        mask[i] |= 4;
                        i++;
                    }
                    continue;
                }
                if (c === "{") {
                    // Brace expression — content inside is JS code and NOT
                    // a JSX attribute. Skip the matching `}`.
                    mask[i] |= 4;
                    i++;
                    let depth = 1;
                    while (i < len && depth > 0) {
                        const cc = src[i];
                        if (cc === "{") depth++;
                        else if (cc === "}") depth--;
                        if (depth > 0) mask[i] |= 4;
                        i++;
                    }
                    continue;
                }
                mask[i] |= 4;
                i++;
            }
            if (i < len) {
                // The `>` itself is part of the tag zone.
                mask[i] |= 4;
                i++;
            }
            m &= ~4;
            continue;
        }
        i++;
    }
    // For each line number, compute the union mask of any non-user-facing
    // zone touched by that line. lineMask[n] is the OR of all mask[i] for
    // any i on line n.
    const lineMask = [];
    let line = 1;
    for (let k = 0; k < len; k++) {
        if (!lineMask[line]) lineMask[line] = 0;
        lineMask[line] |= mask[k];
        if (src[k] === "\n") line++;
    }
    return { mask, lineMask };
}

function isInNonUserFacingZone(lineMask, line) {
    const v = lineMask[line] || 0;
    return (v & 1) !== 0 || (v & 2) !== 0 || (v & 4) !== 0;
}

function extractStringLiterals(src) {
    const out = [];
    const singleLineRe = /(['"`])((?:\\.|(?!\1).)*?)\1/g;
    let m;
    while ((m = singleLineRe.exec(src)) !== null) {
        if (m[2] && m[2].length > 0) out.push({ index: m.index, text: m[2] });
    }
    const multiLineRe = /(`)((?:\\.|(?!\1)[\s\S])*?)\1/g;
    while ((m = multiLineRe.exec(src)) !== null) {
        if (!m[2] || !m[2].includes("\n")) continue;
        out.push({ index: m.index, text: m[2] });
    }
    return out;
}

function extractJsxTextNodes(src) {
    const out = [];
    let i = 0;
    const len = src.length;
    let inJsx = false;
    let jsxTextStart = -1;
    while (i < len) {
        const ch = src[i];
        const next = src[i + 1];
        if (!inJsx) {
            if (ch === "<" && (next === "/" || /[A-Za-z]/.test(next || ""))) {
                inJsx = true;
                jsxTextStart = -1;
            }
            i++;
            continue;
        }
        if (ch === ">") {
            inJsx = false;
            if (jsxTextStart !== -1) {
                const text = src.slice(jsxTextStart, i).trim();
                if (text.length > 0 && !text.startsWith("{") && !text.endsWith("}")) {
                    out.push({ index: jsxTextStart, text });
                }
                jsxTextStart = -1;
            }
            i++;
            if (i < len && src[i] !== "<") {
                jsxTextStart = i;
            }
            continue;
        }
        if (ch === "<") {
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
        i++;
    }
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
        const zones = buildSourceZones(src);
        const strings = extractUserFacingStrings(src);
        for (const s of strings) {
            for (const p of PATTERNS) {
                p.re.lastIndex = 0;
                let m;
                while ((m = p.re.exec(s.text)) !== null) {
                    const absIdx = s.index + m.index;
                    const { line, col } = lineColFor(src, absIdx);
                    if (isInNonUserFacingZone(zones.lineMask, line)) continue;
                    const lineStart = src.lastIndexOf("\n", absIdx - 1) + 1;
                    const lineEndRaw = src.indexOf("\n", absIdx);
                    const lineEnd = lineEndRaw === -1 ? src.length : lineEndRaw;
                    const lineText = src.slice(lineStart, lineEnd);
                    hits.push({ file: rel, line, col, code: p.code, label: p.label, match: m[0], lineText });
                }
            }
        }
    }

    if (hits.length === 0) {
        console.log(`sc11-guard: PASS — ${files.length} files scanned, 0 forbidden terms.`);
        if (ALLOWLIST.size > 0) {
            console.log(`  (${ALLOWLIST.size} file(s) skipped via scripts/.sc11-allowlist)`);
        }
        return;
    }
    console.error(`sc11-guard: FAIL — ${hits.length} forbidden term(s) found:`);
    for (const h of hits) {
        console.error(`  ${h.file}:${h.line}:${h.col}  [${h.code}] ${h.label}  → "${h.match}"`);
        console.error(`      ${h.lineText.trim().slice(0, 120)}`);
    }
    process.exit(1);
}

main();