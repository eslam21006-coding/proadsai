// functions/src/__tests__/creativeResolverParity.test.ts
// Asserts functions/src/creativeResolver.ts and src/creativeResolver.ts
// keep ALLOWED_PAIRS and DISALLOWED_PAIRS structurally identical.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function extractArrayEntries(source: string, varName: string): string[] {
    const startMarker = `export const ${varName}:`;
    const startIdx = source.indexOf(startMarker);
    if (startIdx === -1) throw new Error(`${varName} not found in source`);
    const eqBracket = source.indexOf("= [", startIdx);
    if (eqBracket === -1) throw new Error(`${varName} assignment not found`);
    const bracketStart = source.indexOf("[", eqBracket);
    let depth = 0;
    let endIdx = bracketStart;
    for (let i = bracketStart; i < source.length; i++) {
        if (source[i] === "[") depth++;
        if (source[i] === "]") depth--;
        if (depth === 0) { endIdx = i; break; }
    }
    const arrayContent = source.substring(bracketStart, endIdx + 1);
    const stripped = arrayContent.replace(/\/\/.*$/gm, "").replace(/\s+/g, " ");
    const entries: string[] = [];
    const entryRegex = /\{[^}]+\}/g;
    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(stripped)) !== null) {
        entries.push(match[0].trim());
    }
    return entries.sort();
}

function run() {
    console.log("creativeResolver parity tests");

    const functionsSrc = fs.readFileSync(
        path.resolve(__dirname, "../../src/creativeResolver.ts"),
        "utf-8"
    );
    const frontendSrc = fs.readFileSync(
        path.resolve(__dirname, "../../../src/creativeResolver.ts"),
        "utf-8"
    );

    const fnPairs = extractArrayEntries(functionsSrc, "ALLOWED_PAIRS");
    const fePairs = extractArrayEntries(frontendSrc, "ALLOWED_PAIRS");

    assert.equal(fnPairs.length, fePairs.length,
        `ALLOWED_PAIRS count mismatch: functions=${fnPairs.length} frontend=${fePairs.length}`);

    for (let i = 0; i < fnPairs.length; i++) {
        assert.equal(fnPairs[i], fePairs[i],
            `ALLOWED_PAIRS entry mismatch at sorted index ${i}:\n  functions: ${fnPairs[i]}\n  frontend:  ${fePairs[i]}`);
    }

    const fnDisallowed = extractArrayEntries(functionsSrc, "DISALLOWED_PAIRS");
    const feDisallowed = extractArrayEntries(frontendSrc, "DISALLOWED_PAIRS");

    assert.equal(fnDisallowed.length, feDisallowed.length,
        `DISALLOWED_PAIRS count mismatch: functions=${fnDisallowed.length} frontend=${feDisallowed.length}`);

    console.log("  ✅ ALLOWED_PAIRS parity: " + fnPairs.length + " entries match");
    console.log("  ✅ DISALLOWED_PAIRS parity: " + fnDisallowed.length + " entries match");
    console.log("  ✅ All creativeResolver parity tests passed");
}

run();
