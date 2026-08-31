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

// ═══════════════════════════════════════════════════════════════════
// Batch 01 — Phase 1 hardening tests (FR-054, FR-055, FR-056, FR-057).
//
// T005 — percentage forms: all four must trip.
// T006 — negative controls: bare `(%)` labels and bare `50` preset
//        buttons must NOT trip.
// T007 — suppression mechanics: valid clears its own code only;
//        missing/empty reason hard-fails; bare `sc11-allow` hard-fails;
//        unknown code hard-fails; suppression does not leak.
// ═══════════════════════════════════════════════════════════════════

// T005.a — Latin digits + `%`: "5–10%".
{
    const res = runGuardOn(`const s = "Booking rate: 5-10%";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on Latin-digit percentage");
    assert.match(res.stderr, /PERCENT_SIGN/);
    console.log("ok 8 - Latin digits + % trips PERCENT_SIGN");
}

// T005.b — Arabic-Indic digits + `%`: "٥–١٠%".
{
    const res = runGuardOn(`const s = "Booking rate: ٥-١٠%";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on Arabic-Indic-digit percentage with %");
    assert.match(res.stderr, /PERCENT_SIGN/);
    console.log("ok 9 - Arabic-Indic digits + % trips PERCENT_SIGN");
}

// T005.c — Latin digits + `٪` (U+066A): "5–10٪".
{
    const res = runGuardOn(`const s = "Booking rate: 5-10٪";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on Latin-digit percentage with U+066A");
    assert.match(res.stderr, /PERCENT_SIGN/);
    console.log("ok 10 - Latin digits + U+066A trips PERCENT_SIGN");
}

// T005.d — Arabic-Indic digits + `٪`: "٥–١٠٪".
{
    const res = runGuardOn(`const s = "Booking rate: ٥-١٠٪";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on Arabic-Indic-digit percentage with U+066A");
    assert.match(res.stderr, /PERCENT_SIGN/);
    console.log("ok 11 - Arabic-Indic digits + U+066A trips PERCENT_SIGN");
}

// T005.e — Eastern Arabic-Indic digits (U+06F0–U+06F9) + `%` must also trip.
{
    const res = runGuardOn(`const s = "Eastern digits: ۵-۱۰%";\n`);
    assert.notEqual(res.status, 0, "expected FAIL on Eastern Arabic-Indic digits + %");
    assert.match(res.stderr, /PERCENT_SIGN/);
    console.log("ok 12 - Eastern Arabic-Indic digits + % trips PERCENT_SIGN");
}

// T006.a — bare `(%)` unit label must NOT trip.
{
    const res = runGuardOn(`const s = "Booking rate (%)";\n`);
    assert.equal(res.status, 0, `expected PASS on bare unit marker, got:\n${res.stderr}`);
    console.log("ok 13 - bare (%) unit label does not trip PERCENT_SIGN");
}

// T006.b — bare preset button `50` must NOT trip.
{
    const res = runGuardOn(`const s = "50";\n`);
    assert.equal(res.status, 0, `expected PASS on bare preset button label, got:\n${res.stderr}`);
    console.log("ok 14 - bare preset button label '50' does not trip PERCENT_SIGN");
}

// T007.a — valid suppression clears its own code only on that line.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-ok-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        // Two percentage strings on two different lines. Only line 2
        // carries a suppression; line 4 must still fire.
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            [
                `const a = "5-10%";`,
                `const b = "5-10%"; // sc11-allow:PERCENT_SIGN reason="benchmark hint"`,
                `const c = "plain";`,
                `const d = "5-10%";`,
                ``,
            ].join("\n"),
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on unsuppressed lines");
        assert.match(res.stderr, /Probe\.tsx:1/, "line 1 should still fire");
        assert.match(res.stderr, /Probe\.tsx:4/, "line 4 should still fire");
        assert.doesNotMatch(res.stderr, /Probe\.tsx:2\b/, "suppressed line 2 must not fire");
        console.log("ok 15 - valid suppression clears only its own code on its own line");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.b — valid suppression of PERCENT_SIGN does NOT suppress a different code.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-wrongcode-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        // PERCENT_SIGN suppression on a line that ALSO has CPA. The CPA
        // hit must still fire; the suppression is code-scoped.
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10% CPA"; // sc11-allow:PERCENT_SIGN reason="benchmark hint"\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on CPA even with PERCENT_SIGN suppressed");
        assert.match(res.stderr, /EN_CPA/);
        console.log("ok 16 - PERCENT_SIGN suppression does not leak to a different code");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.c — suppression on line N does NOT leak to adjacent line N+1.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-noleak-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            [
                `const a = "5-10%"; // sc11-allow:PERCENT_SIGN reason="benchmark hint"`,
                `const b = "5-10%";`,
                ``,
            ].join("\n"),
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on the line after a suppression");
        assert.match(res.stderr, /Probe\.tsx:2/, "next line should still fire");
        assert.doesNotMatch(res.stderr, /Probe\.tsx:1/, "suppressed line 1 must not fire");
        console.log("ok 17 - suppression does not leak to adjacent line");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.d — bare `sc11-allow` with no code hard-fails.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-bare-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10%"; // sc11-allow reason="some reason"\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on bare sc11-allow");
        assert.match(res.stderr, /bare 'sc11-allow'/);
        console.log("ok 18 - bare 'sc11-allow' (no code) hard-fails");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.e — unknown code hard-fails.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-unknown-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10%"; // sc11-allow:NOT_A_REAL_CODE reason="some reason"\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on unknown suppression code");
        assert.match(res.stderr, /unknown suppression code/);
        console.log("ok 19 - unknown suppression code hard-fails");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.f — missing `reason="..."` hard-fails.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-noreason-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10%"; // sc11-allow:PERCENT_SIGN\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on missing reason");
        assert.match(res.stderr, /missing or has empty/);
        console.log("ok 20 - missing reason hard-fails");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.g — empty `reason=""` hard-fails.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-empty-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10%"; // sc11-allow:PERCENT_SIGN reason=""\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.notEqual(res.status, 0, "expected FAIL on empty reason");
        assert.match(res.stderr, /missing or has empty/);
        console.log("ok 21 - empty reason hard-fails");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// T007.h — applied suppressions are printed with their reason on every run.
{
    const dir = mkdtempSync(join(tmpdir(), "sc11-suppress-print-"));
    try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(
            join(dir, "src", "Probe.tsx"),
            `const s = "5-10%"; // sc11-allow:PERCENT_SIGN reason="benchmark hint visible on every run"\n`,
            "utf8",
        );
        const guardPath = join(process.cwd(), "scripts", "sc11Guard.mjs").replace(/\\/g, "/");
        const res = spawnSync(process.execPath, [guardPath], {
            cwd: dir,
            encoding: "utf8",
        });
        assert.equal(res.status, 0, `expected PASS, got:\n${res.stderr}\n${res.stdout}`);
        assert.match(res.stdout, /1 per-line suppression/);
        assert.match(res.stdout, /PERCENT_SIGN/);
        assert.match(res.stdout, /benchmark hint visible on every run/);
        console.log("ok 22 - applied suppressions are printed with reason");
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

console.log(`\n# tests 22\n# pass 22\n# fail 0`);