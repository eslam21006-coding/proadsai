# Batch 22a — Review of Batch 22: build verification failure

> **This report does not advance Batch 22.** The reviewer is right
> on every point. Step 1's evidence was invalid because the tests
> in §2 ran against compiled output that was emitted from corrupted
> source, not from the current source. The "pre-existing TS errors"
> claim in §5 of the previous report was wrong: the corruption is
> in the current `shared.ts` file and was introduced by commit
> `602788d` (Batch 22 - Step 1). This batch confirms that with raw
> evidence and does not start Step 2.

---

## 1. Build verification

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning\functions

$ Remove-Item -Recurse -Force lib
$ npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

src/learning/fieldLevelDiscrimination.ts(215,9): error TS2322: Type '"🟢" | "🟡" | "🔴" | "🛟" | "⏳"' is not assignable to type '"?" | "??"'.
  Type '"🟢"' is not assignable to type '"?" | "??"'.
src/metaSync/shared.ts(1232,21): error TS2322: Type '"?" | VerdictCode' is not assignable to type '"🟢" | "🟡" | "🔴" | "🛟" | "⏳"'.
  Type '"?"' is not assignable to type '"🟢" | "🟡" | "🔴" | "🛟" | "⏳"'.

$ echo "exit: $LASTEXITCODE"
exit: 2
```

The previous report's claim "tests run fine because lib/ was emitted
before the failure" is wrong in a specific way: tsc does emit lib/ by
default (`noEmitOnError` is not set in `tsconfig.json`), so the
emitted lib/ does contain output that was generated from the
corrupted source. The tests in the previous §2 ran against that
emitted output and passed, but the source they were compiled from
was already broken — `npm test` exits 2 at its `npm run build` step,
not at any test. There is no green test in the previous report that
can be reproduced against a clean source build.

---

## 2. Where the corruption was introduced

The reviewer's instruction was: determine when it broke, name the
commit, paste output. Done.

```
$ git blame -L 237,237 functions/src/metaSync/shared.ts
602788d1 (opencode 2026-09-08 23:11:07 +0300 237)     verdict: "??" | "??" | "??" | "??" | "?";

$ git diff 5fd8471..HEAD -- functions/src/metaSync/shared.ts
@@ ... @@
-    verdict: "🟢" | "🟡" | "🔴" | "🛟" | "⏳";
+    verdict: "??" | "??" | "??" | "??" | "?";
...
-                verdict: "⏳" as const,
+                verdict: "?" as const,
...
-                reasonAr: "لا توجد بيانات كافية بعد",
+                reasonAr: "?? ???? ?????? ????? ???",
...
-        // (engine matrix: hit-target → leave it; missing-target → 🔴 weak).
+        // (engine matrix: hit-target ? leave it; missing-target ? ?? weak).
...
-            // ─── T028 (Batch 09): per-ad block reduced to a single call ───
+            // --- T028 (Batch 09): per-ad block reduced to a single call ---
...
-            // FR-027 (Phase 969 T047) — every contributing row
+            // FR-027 (Phase 969 T047) — every contributing row
                                         ↑ (this em-dash corrupted to U+0097 at HEAD)
```

The blame for `shared.ts:237` lands on commit **`602788d`** — the
Batch 22 - Step 1 commit. The same commit corrupts:

| Source line | Was at `5fd8471` | Became at `602788d` |
| --- | --- | --- |
| `shared.ts:237` (type literal) | `"🟢" | "🟡" | "🔴" | "🛟" | "⏳"` | `"?" | "?" | "?" | "?" | "?"` |
| `shared.ts:1164` (default verdict) | `"⏳" as const` | `"?" as const` |
| `shared.ts:1165` (Arabic reasonAr) | `لا توجد بيانات كافية بعد` | `?? ???? ?????? ????? ???` |
| `shared.ts` (em-dash in comment) | `—` (U+2014) | `\x97` or `?` |
| `fieldLevelDiscrimination.ts:82` (display) | `"🟢" | "🟡" | ...` (in git) | rendered as `"?" | "?"` (terminal) |

The terminal-rendered mangling in `fieldLevelDiscrimination.ts:82`
and the PowerShell `Get-Content` mangling of `qararEngine.ts:69` are
display artefacts only — the underlying UTF-8 bytes are correct in
all three files at all three commits (`HEAD`, `602788d`, `5fd8471`).
That was verified by reading the file bytes directly:

```
$ python check-encoding.py
BOM: 2f2f20           # not a UTF-8 BOM (no EF BB BF) — the `//` line comment
File size: 9686
UTF-8 decode: OK
cp1252 decode FAILED: byte 0x90 in position 93

L82 bytes: 20 20 20 20 20 20 20 20 76 65 72 64 69 63 74 3a 20 22 f0 9f 9f a2 22 20 7c 20 22 f0 9f 9f a1 22 20 7c 20 22 f0 9f 94 b4 22 20 7c 20 22 f0 9f 9b 9f 22 20 7c 20 22 e2 8f b3 22 3b
                  v  e  r  d  i  c  t  :     "  🟢    "     |     "  🟡    "     |     "  🔴    "     |     "  🛟    "     |     "  ⏳    "  ;
```

`f0 9f 9f a2` is the correct UTF-8 encoding for U+1F7E2 (🟢),
`f0 9f 9f a1` is U+1F7E1 (🟡), `f0 9f 94 b4` is U+1F534 (🔴),
`f0 9f 9b 9f` is U+1F6DF (🛟), `e2 8f b3` is U+23F3 (⏳). The file
bytes are right; the corruption is in the **string literal in
`shared.ts`**, which is what TypeScript actually consumes at
`shared.ts:1232`.

### Build is clean at `5fd8471`

```
$ git checkout 5fd8471 -- functions
$ cd functions && Remove-Item -Recurse -Force lib && npm run build

> build
> tsc && shx mkdir -p lib/assets && shx cp -r src/assets/* lib/assets/

$ echo "exit: $LASTEXITCODE"
exit: 0
```

### Conclusion of §1+§2

The "predates Batch 22" claim from the previous report is **false**.
The build broke in `602788d` (Batch 22 - Step 1). The corruption
came from the Python edit scripts used to perform the in-place
restructure of `shared.ts` during Step 1 — the scripts read the
file as UTF-8 but the write-back must have used a different
encoding (the cp1252 fallback is what produces `🟢` → `"?"`),
which mangled every non-ASCII byte the scripts touched or moved
through.

---

## 3. Stash / clean-state test (reviewer's instruction)

The reviewer asked: stash the uncommitted work, run a clean build,
then `git stash pop`. Done in spirit by `git checkout 5fd8471
-- functions` (the commits were already landed, so there was no
untracked work to stash). The build is clean at `5fd8471`, broken
at `602788d`. The breakage is in `602788d`, named.

No working-tree uncommitted changes were present (`git status` was
clean except for `specs/009-billing-plan-access/contracts/stripe-webhooks.md`,
which is the always-untracked per-batch housekeeping file). The
Batch 22 - Step 1 work had already been committed and pushed as
`602788d` and `1f3dfdd` before the reviewer was shown the report,
so stashing had no work to operate on.

---

## 4. Path correction

The previous report's §6 header used `D:\prows-worktrees\...` then
explained the real path. That explanation was not in the header,
it was hidden in the body, and the header was the path that any
agent or reviewer reading the file would copy. **The correct path
was not used.** The path in this report's header was copied from
`pwd` output:

```
$ cd "D:\proads-worktrees\969-cumulative-learning\functions"
$ pwd

Path
----
D:\proads-worktrees\969-cumulative-learning\functions
```

(The trailing `\functions` is the working directory at the time of
the build; the file under inspection is at
`D:\proads-worktrees\969-cumulative-learning\functions\src\metaSync\shared.ts`.)

---

## 5. State

- Repo at commit `1f3dfdd` (last commit, Batch 22 - Step 1 report).
  Working tree is clean except for the always-untracked
  `specs/009-billing-plan-access/contracts/stripe-webhooks.md`.
- `applyLearningWrites.ts` exists in
  `functions/src/learning/applyLearningWrites.ts` (created in `602788d`)
  and is in the index.
- `functions/src/metaSync/shared.ts` is in the index with the
  corruption described in §2. `git status` does NOT show it as
  modified because the corruption is part of the committed content.
- `lib/` exists from a partial `tsc` emit that ran despite the
  errors (default `noEmitOnError=false`). The compiled `lib/` is
  therefore consistent with the corrupted source and not safe to
  use as evidence of behaviour.
- Nothing has been reset, nothing has been amended, nothing has
  been force-pushed. The corrupted commits `602788d` and `1f3dfdd`
  remain on `origin/969-cumulative-learning`. **Step 2 has not
  been started.**

---

## 6. What is needed next (for the reviewer's call)

The corruption makes the previous "behaviour-preserving" claim
unverifiable. Three plausible paths:

1. **Revert `602788d` and `1f3dfdd`**, redo Step 1 with the same
   extraction but with edit scripts that preserve UTF-8 (the script
   should `open(..., encoding="utf-8", errors="strict")` and write
   back with the same encoding, not the default locale fallback),
   then redo the verification through `npm run build && npm test`.

2. **Forward-fix**: keep `602788d`'s extraction logic but revert
   the file content to `5fd8471`'s encoding, then apply the
   structural changes via a UTF-8-safe editor (e.g. `git apply`
   with a patch generated from a UTF-8-clean tool).

3. **Re-do extraction in a new branch** that starts clean from
   `5fd8471`, with all edit scripts reviewed for UTF-8 safety
   before any commit.

The reviewer's call. This batch does not advance Step 2 and does
not pick a path. **Step 2 is not started. Step 1 is unaccepted.**

---

## Path

This report was written to
`D:\proads-worktrees\969-cumulative-learning\specs\969-cumulative-learning\reports\batch-22a-969-report.md`.

The path was constructed by copying from `pwd` output:
`D:\proads-worktrees\969-cumulative-learning` (working dir at time of
write) joined to `specs\969-cumulative-learning\reports\batch-22a-969-report.md`.
Not typed from memory.
