// scripts/sc11Guard.test.mjs — regression tests for SC-11 guard fixes
// Each test exercises one of the three CodeRabbit audit findings the
// guard had to address: quoted-literal comment detection, per-character
// span masking (no whole-line skip), and JSX fragment / expression-prefixed
// text extraction. Run with `node scripts/sc11Guard.test.mjs`.

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

function runGuardOn(srcContent, fileName = "Probe.tsx") {
    const dir = mkdtempSync(join(tmpdir(), "sc11-test-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "src", fileName), srcContent, "utf8");
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        return res;
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// 1. Quoted-literal comment detection: a string containing `//` must not
// mark the rest of its line as a comment. The CPA inside the URL IS
// still user-facing copy, so SC-11 SHOULD fire on it (this is the
// regression we're guarding against: the old guard silently skipped it
// because `//` opened a comment zone inside the string).
{
    const res = runGuardOn(`const url = "https://example.com/CPA";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on CPA inside URL string");
    assert.match(res.stderr, /CPA/, "stderr should mention CPA");
    console.log("ok 1 - quoted literal containing `//` still fires on CPA inside the string");
}

// 1b. Comment markers inside a string must not consume the rest of the line.
// A literal `"foo // bar\nbaz CPA"` — the `//` inside the string does NOT
// open a line comment, so `baz CPA` on the next line must STILL be visible
// to SC-11.
{
    const res = runGuardOn(`const a = "foo // bar";\nconst b = "baz CPA";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on CPA in second string");
    assert.match(res.stderr, /CPA/);
    console.log("ok 1b - // inside a string does not consume the rest of the line");
}

// 2. Per-character span masking: a real copy on a line that ALSO contains
// a comment must still fire on the real copy.
{
    const res = runGuardOn(`const copy = "CPA"; // note\n`);
    assert.notEqual(res.status, 0, "expected FAIL on `CPA` inside a string");
    assert.match(res.stderr, /CPA/, "stderr should mention CPA");
    console.log("ok 2 - real copy on a line with a comment still fires");
}

// 3. JSX fragment text is captured: `<>CPA</>` must fire.
{
    const res = runGuardOn(`const x = (<>CPA</>);\n`);
    assert.notEqual(res.status, 0, "expected FAIL on `<>CPA</>`");
    assert.match(res.stderr, /CPA/, "stderr should mention CPA");
    console.log("ok 3 - JSX fragment text is captured");
}

// 4. Expression-prefixed JSX text: `{name} CPA` must keep the trailing
// `CPA` after the brace expression is stripped.
{
    const res = runGuardOn(`const x = (<div>{name} CPA</div>);\n`);
    assert.notEqual(res.status, 0, "expected FAIL on `<div>{name} CPA</div>`");
    assert.match(res.stderr, /CPA/, "stderr should mention CPA");
    console.log("ok 4 - trailing JSX text after `{expr}` is captured");
}

// 5. Tag attribute text is exempt (CSS percentages inside className).
{
    const res = runGuardOn(`<span className="max-w-[60%]">hi</span>\n`);
    assert.equal(res.status, 0, `expected PASS on CSS className with %, got:\n${res.stderr}`);
    console.log("ok 5 - JSX className attribute with % is exempt");
}

// 6. TypeScript generics are NOT treated as JSX tags — code like
// `useState<SelectionRegion | null>(null)` must not be captured as a
// giant JSX text node.
{
    const res = runGuardOn(`
type X<T> = T;
const a = useState<X | null>(null);
const b = (<div>hi</div>);
`);
    assert.equal(res.status, 0, `expected PASS, got:\n${res.stderr}`);
    console.log("ok 6 - TypeScript generics do not produce false JSX text");
}

// 7. Allowlist path normalization — backslash entries on POSIX runners
// (we emulate by writing forward-slash entries on a temp allowlist).
// The main allowlist uses forward slashes; verify it still works.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-allowlist-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        mkdirSync(join(dir, "scripts"), { recursive: true });
        // Hit: contains `CPA` so guard would fail without allowlist.
        writeFileSync(join(dir, "src", "App.tsx"), `const x = "CPA";\n`, "utf8");
        // Allowlist uses forward slashes (current convention).
        writeFileSync(
            join(dir, "scripts", ".sc11-allowlist"),
            "# forward-slash allowlist\nsrc/App.tsx\n",
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.equal(res.status, 0, `expected PASS (allowlist hit), got:\n${res.stderr}`);
        console.log("ok 7 - allowlist entry with forward slashes matches scanned file");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

console.log(`\n# tests 7\n# pass 7\n# fail 0`);