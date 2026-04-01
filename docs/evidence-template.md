# Evidence Workflow Template

Use this template when closing issues or claiming a fix is complete. Every claimed fix must include all 9 items below. Incomplete evidence means the issue stays open.

---

## Template

```markdown
## Evidence for: [Issue/Task Title]

### 1. Failing Rule ID
[Exact rule ID from LAUNCH_MATRIX.md, e.g. "R-04" or "LM-COLD-CAROUSEL-01"]

### 2. Controlling File
[file.ts → functionName()] — the exact file and function that enforces this rule

### 3. Root Cause
[Why the old behavior occurred — what was missing, wrong, or out of sync]

### 4. What Changed
[The fix — what code was added, removed, or modified]

### 5. Trace Before
[Resolution trace JSON from the failing run — copy from console logs or test output]

### 6. Trace After
[Resolution trace JSON from the passing run — must show the fix working]

### 7. Screenshot Before
[Failing output image — the visual artifact that proved the bug]

### 8. Screenshot After
[Passing output image — the visual artifact after the fix]

### 9. Test Inputs
[Exact AdInputs JSON used to reproduce — must be copy-pasteable]
```

---

## Instructions

1. **Copy** the template above into a new comment on the issue.
2. **Fill in** all 9 fields. Do not skip any.
3. **Attach** screenshots as images (not links that may expire).
4. **Verify** the test inputs JSON is self-contained — another developer must be able to paste it into the app and reproduce the exact scenario.
5. **Link** to the commit that contains the fix.

## When to Use This Template

- Closing any bug fix related to creative output quality
- Closing any launch matrix compliance issue
- Closing any spec task that changes validation, resolver, or generation behavior
- Any PR that modifies `creativeResolver.ts`, `generators.ts`, or `layoutContract.ts`

## Acceptance Criteria

An evidence submission is **complete** when:
- All 9 fields are filled (no TBD, N/A, or placeholder)
- Trace before shows the failure
- Trace after shows the fix
- Screenshots clearly show the visual difference
- Test inputs are valid JSON that can be pasted directly into the app
- A reviewer can reproduce the fix without asking questions
