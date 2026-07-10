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
    // Normalize to forward slashes so the same allowlist works on Windows
    // (where repo display uses `\`) and POSIX runners (where path.relative
    // always returns `/`). Without this, the allowlist silently fails on
    // CI runners and pre-existing violations re-fire.
    const norm = (p) => p.replace(/\\/g, "/");
    if (existsSync(file)) {
        for (const line of readFileSync(file, "utf8").split("\n")) {
            const t = line.trim();
            if (t && !t.startsWith("#")) set.add(norm(t));
        }
    }
    if (process.env.SC11_ALLOWLIST) {
        for (const p of process.env.SC11_ALLOWLIST.split(",")) {
            const t = p.trim();
            if (t) set.add(norm(t));
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
    // Per-character bitmask written into `mask`: 1=COMMENT_LINE, 2=COMMENT_BLOCK, 4=ATTRIBUTE
    const mask = new Uint8Array(len);
    // Per-character string-bitmask (`stringMask`) — preserved from the
    // previous design but unused by the matcher; kept for debug visibility.
    const stringMask = new Uint8Array(len);
    // State bits for the scanning loop. We separate string-tracking bits
    // from JSX-tag bits so they never collide:
    //   1=SINGLE_QUOTE, 2=DOUBLE_QUOTE, 4=BACKTICK (string tracking)
    //   8=LINE_COMMENT, 16=BLOCK_COMMENT (comment tracking)
    //   32=IN_JSX_TAG (attribute zone — disjoint from the above)
    let m = 0;
    let i = 0;
    while (i < len) {
        const ch = src[i];
        const next = src[i + 1];
        // ─── Inside an existing string literal — track only the matching
        // closing quote, treating any `//`/`/*`/`<` as literal chars.
        if (m & 1) {
            stringMask[i] |= 1;
            if (ch === "\\" && i + 1 < len) {
                stringMask[i + 1] |= 1;
                i += 2;
                continue;
            }
            if (ch === "'") { m &= ~1; }
            i++;
            continue;
        }
        if (m & 2) {
            stringMask[i] |= 2;
            if (ch === "\\" && i + 1 < len) {
                stringMask[i + 1] |= 2;
                i += 2;
                continue;
            }
            if (ch === "\"") { m &= ~2; }
            i++;
            continue;
        }
        if (m & 4) {
            stringMask[i] |= 4;
            if (ch === "\\" && i + 1 < len) {
                stringMask[i + 1] |= 4;
                i += 2;
                continue;
            }
            if (ch === "`") { m &= ~4; i++; continue; }
            if (ch === "$" && next === "{") {
                stringMask[i] |= 4;
                stringMask[i + 1] |= 4;
                i += 2;
                let depth = 1;
                while (i < len && depth > 0) {
                    const cc = src[i];
                    if (cc === "{") depth++;
                    else if (cc === "}") depth--;
                    if (depth === 0) break;
                    i++;
                }
                if (i < len) i++;
                continue;
            }
            i++;
            continue;
        }
        // ─── Outside any string — recognize comment markers.
        if ((m & 16) === 0 && (m & 32) === 0 && ch === "/" && next === "/") {
            m |= 8;
            i += 2;
            while (i < len && src[i] !== "\n") {
                mask[i] |= 1;
                i++;
            }
            mask[i] |= 1;
            m &= ~8;
            continue;
        }
        if ((m & 8) === 0 && (m & 32) === 0 && ch === "/" && next === "*") {
            m |= 16;
            i += 2;
            while (i < len - 1 && !(src[i] === "*" && src[i + 1] === "/")) {
                mask[i] |= 2;
                i++;
            }
            if (i < len - 1) {
                mask[i] |= 2;
                mask[i + 1] |= 2;
                i += 2;
            } else {
                mask[i] |= 2;
                i++;
            }
            m &= ~16;
            continue;
        }
        // ─── Outside any string — recognize string-literal openings.
        if ((m & 32) === 0 && ch === "'") { m |= 1; stringMask[i] |= 1; i++; continue; }
        if ((m & 32) === 0 && ch === "\"") { m |= 2; stringMask[i] |= 2; i++; continue; }
        if ((m & 32) === 0 && ch === "`") { m |= 4; stringMask[i] |= 4; i++; continue; }
        // Track JSX attribute zones — `<Tag`, `</Tag`, or fragment `<>`.
        // Set bit 32 (IN_JSX_TAG), mark all attribute chars with mask bit 4,
        // and reset the bit on the closing `>` so strings/comments after the
        // tag are tracked normally.
        if (ch === "<" && (next === "/" || next === ">" || /[A-Za-z_]/.test(next || ""))) {
            m |= 32;
            i++;
            while (i < len && src[i] !== ">") {
                const c = src[i];
                if (c === "\"" || c === "'") {
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
                mask[i] |= 4;
                i++;
            }
            m &= ~32;
            continue;
        }
        i++;
    }
    return { mask, stringMask };
}

function isInNonUserFacingZone(mask, absIdx, matchLen) {
    // Per-character check over the exact match span. Reject only if
    // ANY matched character lives inside a comment or JSX-attribute zone
    // — a single exempt span no longer suppresses a whole source line.
    for (let k = 0; k < matchLen; k++) {
        const v = mask[absIdx + k] || 0;
        if ((v & 1) !== 0 || (v & 2) !== 0 || (v & 4) !== 0) return true;
    }
    return false;
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
    let jsxTextStart = -1;

    // Maximum length (chars) of a JSX text-node span we'll emit. Real
    // user-facing JSX text is rarely longer than this; spans beyond it
    // almost always contain TypeScript code that's not user-visible
    // (e.g. a function body between two unrelated tags). Without this
    // cap the heuristic can capture multi-KB code chunks as "text".
    const MAX_JSX_TEXT_SPAN = 200;
    // Common code keywords that would not appear in user-facing JSX
    // text. If the cleaned text contains any of these, the span is
    // TypeScript code (an accidental capture between JSX regions),
    // not a JSX text node — discard it.
    const CODE_KEYWORDS = /(?:const |let |var |function |return |=>|;\s*$|^\s*;|\.map\(|\.filter\(|\.join\()/m;

    // Strip every `{ ... }` brace expression from a JSX text node, leaving
    // the surrounding user-facing copy intact. Returns the cleaned text and
    // the original `index` so callers can still locate the source char.
    function emitJsxTextNode(start, end) {
        const spanLen = end - start;
        if (spanLen > MAX_JSX_TEXT_SPAN) return; // discard oversized spans
        const raw = src.slice(start, end);
        // Iteratively strip `{...}` braces — handle up to 2 levels of
        // nesting so `{a ? "x" : "y"}` survives and `{name}` is dropped.
        let cleaned = raw;
        for (let pass = 0; pass < 2; pass++) {
            cleaned = cleaned.replace(/\{[^{}]*\}/g, "");
        }
        cleaned = cleaned.trim();
        if (cleaned.length === 0) return;
        if (CODE_KEYWORDS.test(cleaned)) return; // discard code-like content
        out.push({ index: start, text: cleaned });
    }

    // Recognize any opening JSX token: <Tag, </Tag, or fragment <>.
    // Heuristic: a true JSX tag is `<Identifier>` where Identifier is
    // followed by whitespace, `>`, `/`, or end-of-file. A TypeScript
    // generic like `<T,` or `<T>(` is NOT a JSX opening — without this
    // distinction, the walker would treat every generic parameter as a
    // JSX tag and capture all the TS code between two generics as one
    // giant JSX text node. We walk the full identifier (letters/digits/
    // underscores/dots — the latter for `Foo.Bar` member-component names)
    // before checking the terminator.
    function isJsxOpenAt(idx) {
        if (src[idx] !== "<") return false;
        const nx = src[idx + 1];
        if (nx === "/" || nx === ">") return true;
        if (!/[A-Za-z_]/.test(nx || "")) return false;
        let k = idx + 2;
        while (k < len && /[A-Za-z0-9_.]/.test(src[k] || "")) k++;
        const after = src[k];
        return after === undefined
            || after === " "
            || after === "\t"
            || after === "\n"
            || after === "\r"
            || after === ">"
            || after === "/";
    }

    while (i < len) {
        if (isJsxOpenAt(i)) {
            // Close any pending text-node span at the `<` boundary.
            if (jsxTextStart !== -1 && jsxTextStart < i) {
                emitJsxTextNode(jsxTextStart, i);
            }
            jsxTextStart = -1;
            // Walk past the tag's opening `<...>` so we don't capture
            // attribute strings as text.
            i++;
            while (i < len && src[i] !== ">") {
                const c = src[i];
                if (c === "\"" || c === "'") {
                    const q = c;
                    i++;
                    while (i < len && src[i] !== q) i++;
                    if (i < len) i++;
                    continue;
                }
                if (c === "{") {
                    let bd = 1;
                    i++;
                    while (i < len && bd > 0) {
                        const cc = src[i];
                        if (cc === "{") bd++;
                        else if (cc === "}") bd--;
                        i++;
                    }
                    continue;
                }
                i++;
            }
            if (i < len) i++; // consume `>`
            // After the tag's closing `>`, the next non-`<` char starts
            // a new text-node span.
            if (i < len && !isJsxOpenAt(i)) {
                jsxTextStart = i;
            }
            continue;
        }
        i++;
    }
    if (jsxTextStart !== -1 && jsxTextStart < len) {
        emitJsxTextNode(jsxTextStart, len);
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
        const rel = relative(ROOT, file).replace(/\\/g, "/");
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
                    const matchLen = m[0].length;
                    if (isInNonUserFacingZone(zones.mask, absIdx, matchLen)) continue;
                    const { line, col } = lineColFor(src, absIdx);
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