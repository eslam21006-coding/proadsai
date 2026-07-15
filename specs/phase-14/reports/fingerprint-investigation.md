# Image Fingerprint — Investigation Report

**Date**: 2026-07-14
**Investigator**: Claude
**Status**: Investigation only — no fix applied yet
**Issue reported**: Image fingerprint is NOT being written to Firestore.
Generation documents have no `imageFingerprint` field; the
`imageFingerprints/{hash}` index collection is empty.

---

## TL;DR

The server-side hash computation works correctly and is included in
the response. The frontend's `geminiService.ts` extracts and returns
it correctly. **But the client-side write is gated behind a Scale-only
plan feature** (`canUseWorkspaces`), so the fingerprint is silently
skipped for every Starter and Pro user — which is the majority of
the user base. There is also a secondary bug: the **batch-render and
size-variant save paths never write fingerprints at all**, even for
Scale users.

---

## Step 1 — Server side (`functions/src/index.ts`)

### 1a. Does it call `computeHash()` or `perceptualHash` anywhere? — **YES**

`functions/src/index.ts:4813` dynamically imports `perceptualHash.js`
inside `serverGenerateFinalAd` and calls `computeHash(buf)`:

```ts
// functions/src/index.ts:4805–4820
// Phase 14 — Layer 3 (FR-014): compute the perceptual hash AFTER
// the image is uploaded so the hash survives JPEG re-upload
// compression. The CLIENT writes the hash + index entry (no
// server-side `genId` write — Technical Constraint).
// Hash computation failure is non-blocking: a missing hash means
// this generation can only be matched via the manual linking UI.
let imageFingerprint: string | null = null;
try {
    const { computeHash } = await import("./perceptualHash.js");
    const dataUrlPrefix = result.image.indexOf(",");
    const b64 = dataUrlPrefix >= 0 ? result.image.slice(dataUrlPrefix + 1) : result.image;
    const buf = Buffer.from(b64, "base64");
    imageFingerprint = await computeHash(buf);
} catch (hashErr) {
    console.warn("serverGenerateFinalAd: perceptual hash failed (non-blocking):", hashErr);
}
```

### 1b. Does it return the hash in the response object? — **YES**

`functions/src/index.ts:4821`:

```ts
return { success: true, imageBase64: result.image, storageUrl, imageFingerprint, errorCode: null, costEstimate: generators.getCostEstimate(), resolutionTrace: trace };
```

`imageFingerprint` is returned as a named property in the returned object.

### 1c. Is the hash computation AFTER the image is uploaded to Storage? — **YES**

`saveBase64ToStorage` runs at line 4801; the `computeHash` call runs at
line 4817 — strictly after the upload. The comment at line 4805
explicitly documents this ordering ("AFTER the image is uploaded so
the hash survives JPEG re-upload compression").

### 1d. Is there any try/catch that might silently swallow an error? — **YES, BUT NON-BLOCKING**

The `try/catch` at lines 4812–4819 wraps the entire hash computation.
If `computeHash` throws, the catch logs a `console.warn` and the
function returns `imageFingerprint: null`. The render still succeeds.

**Verdict**: Server side is correct. The hash IS computed and IS in
the response.

---

## Step 2 — Client side (`src/App.tsx`)

### 2a. Does it read `imageFingerprint` from the response? — **YES**

`mockupResult.imageFingerprint` is referenced at line 5463. The
response type is documented in `src/services/geminiService.ts:443` and
the value is extracted in `geminiService.ts:479`.

### 2b. Does it write the fingerprint to the generation document? — **YES, but only in the primary render path**

### 2c. Does it write to the `imageFingerprints/{hash}` index? — **YES, but only in the primary render path**

The write is at `src/App.tsx:5463–5478`:

```ts
// src/App.tsx:5455–5478
// Phase 14 — Layer 3 (FR-014/015): write the perceptual hash to
// the generation doc + the workspace-scoped index collection so
// the daily Meta sync can match this creative. Non-blocking —
// missing the write means manual-link-only for this generation.
// Generation docs live at the TOP-LEVEL `generations` collection
// (written by feedbackService.saveGeneration), NOT inside the
// workspace. The fingerprint INDEX is workspace-scoped so cross-
// workspace fingerprint search stays impossible.
if (savedGenId && mockupResult.imageFingerprint && canUseWorkspaces && activeWorkspaceId) {
  try {
    const generationRef = doc(db, 'generations', savedGenId);
    const indexRef = doc(db, `users/${user.uid}/workspaces/${activeWorkspaceId}/imageFingerprints`, mockupResult.imageFingerprint);
    await Promise.all([
      updateDoc(generationRef, {
        imageFingerprint: mockupResult.imageFingerprint,
        imageFingerprintAlgo: 'dhash64',
      }),
      setDoc(indexRef, {
        hash: mockupResult.imageFingerprint,
        hashAlgo: 'dhash64',
        generationId: savedGenId,
        createdAt: Date.now(),
      }, { merge: true }),
    ]);
  } catch (fpErr) {
    console.warn('Non-blocking: failed to write image fingerprint:', fpErr);
  }
}
```

### 2d. Is there any condition that might skip the write? — **YES — THIS IS THE PRIMARY BUG**

The `if` guard requires **FOUR** conditions to be true:

1. `savedGenId` — must be truthy (set by `feedbackService.saveGeneration`)
2. `mockupResult.imageFingerprint` — must be truthy (set by server response)
3. `canUseWorkspaces` — **Scale-only feature**
4. `activeWorkspaceId` — only set when the user has selected a workspace

`canUseWorkspaces` is defined at `src/App.tsx:2345`:

```ts
const canUseWorkspaces = canUse(userPlan, 'multiBrandWorkspaces');
```

`multiBrandWorkspaces` is a **Scale-only** feature. From
`src/planconfig.ts:271`:

```ts
if (feature === 'creativeScoringEngine' || feature === 'smartRecommendations' || feature === 'variantExploration' || feature === 'multiBrandWorkspaces') return 'Scale';
```

And `planconfig.ts:190` and `:203`:

```ts
// pro (line 190):
multiBrandWorkspaces: false,
// scale (line 203):
multiBrandWorkspaces: true,
```

**Effect**: For every **Starter** and **Pro** user, `canUseWorkspaces`
is `false`, the `if` guard fails, and the fingerprint is **silently
skipped**. No error, no warning, no log.

This is a large portion of the user base. Image fingerprint matching
has been broken for every non-Scale user since Batch 02 shipped.

### 2e. Is there any try/catch that might silently swallow a write error? — **YES, but NON-BLOCKING**

`catch (fpErr) { console.warn(...) }` at line 5479 logs the error.
A write failure is intentionally non-blocking. **However**, a
silent skip due to the `if` guard is NOT logged at all.

### 2f. Secondary bug — batch / size-variant paths never write fingerprints

There are **three other saveGeneration call sites** that DO NOT include
a fingerprint write at all:

| Line | Path | Writes fingerprint? |
|---|---|---|
| 5463 | Primary render (the only one that does) | ✅ |
| 5778 | Batch combo render (`saveGeneration` call) | ❌ |
| 6182 | Size variant (Phase 17 multi-size) | ❌ |
| 6488 | Edit / re-render path | ❌ |

For Scale users, even the primary render path can produce a
generation that gets a fingerprint, but the batch combos and
size-variants NEVER get one. The `metaSync` worker's image matching
will not find these.

**Verdict**: Client side is **partially broken**. The primary render
path is correctly written but gated behind `canUseWorkspaces`; the
batch and size-variant paths have no write logic at all.

---

## Step 3 — `src/services/geminiService.ts` response shape

### 3a. Does the response type include `imageFingerprint`? — **YES**

`src/services/geminiService.ts:443`:

```ts
): Promise<{ image: string | null; storageUrl?: string | null; imageFingerprint?: string | null; errorCode?: string; debug?: unknown; resolutionTrace?: unknown }> {
```

### 3b. Does the function extract it from the callable response? — **YES**

`src/services/geminiService.ts:479`:

```ts
imageFingerprint: (typeof data.imageFingerprint === 'string' && data.imageFingerprint) ? data.imageFingerprint : null,
```

Defensive type-check — returns `null` if the server didn't send a
hash or sent an empty string.

### 3c. Does it return it to the caller? — **YES**

The object literal at lines 475–482 includes `imageFingerprint` in
the return value. `App.tsx:5463` consumes it via
`mockupResult.imageFingerprint`.

**Verdict**: `geminiService.ts` is correct. The hash is plumbed
end-to-end from the server response to the client.

---

## Step 4 — Compiled build (`functions/lib/index.js`)

### Search results

```text
lib\index.js:4481:            let imageFingerprint = null;
lib\index.js:4483:                const { computeHash } = await import("./perceptualHash.js");
lib\index.js:4487:                imageFingerprint = await computeHash(buf);
lib\index.js:4492:            return { success: true, imageBase64: result.image, storageUrl, imageFingerprint, errorCode: null, ... };
```

**Verdict**: The compiled build contains the hash logic. The function
will compute the hash and return it in the response when called.

(Initial search with only 3 results came from line 39 — the giant
single-line export list of `exports.metaOAuthCallback = ... = exports.backfillImageFingerprints = ...`. Those 3 hits are export references, not the implementation. The actual hash logic is at lines 4481–4492.)

---

## Step 5 — Root Cause Analysis

### Primary bug: `canUseWorkspaces` gates the fingerprint write

The fingerprint write at `src/App.tsx:5463` is wrapped in
`if (savedGenId && mockupResult.imageFingerprint && canUseWorkspaces && activeWorkspaceId)`.

`canUseWorkspaces` is a **Scale-only** feature
(`multiBrandWorkspaces`, gated by `canUse(userPlan, 'multiBrandWorkspaces')`
in `src/App.tsx:2345` and `src/planconfig.ts:271`).

**Effect**: For every Starter and Pro user, this condition is
`false`, the `if` block is skipped, and:
- `imageFingerprint` is NOT written to the generation document
- `imageFingerprints/{hash}` index entry is NOT created

The server computes the hash, the response includes it, the client
extracts it — but the write never happens because the gate is
plan-gated.

This is **scope creep from Batch 01** — when `imageFingerprints` was
introduced, it was assumed it would only be used by workspace-scoped
sync (which is Scale-only). The fingerprint itself has no per-plan
restriction; it just wasn't extracted from the original intent.

### Secondary bug: batch and size-variant paths have no fingerprint write at all

Even for Scale users, the **batch-combo render** (line 5778),
**size variant** (line 6182), and **edit / re-render** (line 6488)
paths call `saveGeneration` but have no `imageFingerprint` write
following them. Only the **primary render** (line 5463) writes
fingerprints.

### Behavioral summary

| User plan | Primary render | Batch combos | Size variants |
|---|---|---|---|
| Starter / Pro | ❌ no fingerprint written (gated out) | ❌ no write code | ❌ no write code |
| Scale, no active workspace | ❌ no fingerprint written (gate) | ❌ no write code | ❌ no write code |
| Scale, active workspace | ✅ fingerprint written | ❌ no write code | ❌ no write code |

In short: **only the primary render for Scale users with a workspace
ever gets a fingerprint**. This is the opposite of what the spec
intended (FR-014: "hash ... on the generation record ... exposed
hook angle, visual pattern, layout template, art direction, universe,
and creative modes").

---

## Recommended Fix (DO NOT APPLY YET)

Three changes, in order of priority:

### Fix 1 — Remove the `canUseWorkspaces` gate from the fingerprint write

The fingerprint is a per-generation property and has no per-plan
restriction. The workspace-scoping applies to the **index** (which
already lives at `users/{uid}/workspaces/{wid}/imageFingerprints`),
not to whether the fingerprint gets written at all.

**Change**: in `src/App.tsx:5463`, remove `canUseWorkspaces && activeWorkspaceId` from the guard. The new guard:

```ts
if (savedGenId && mockupResult.imageFingerprint) {
  // Always write to the generation doc (no workspace needed)
  // Always write the workspace-scoped index IF the user has an active
  // workspace — but degrade gracefully when they don't.
  ...
}
```

Concretely: split the two writes. The generation-doc write is
unconditional (no workspace needed). The index write is conditional
on the user having an active workspace — and when the user has no
workspace (Starter/Pro/no-workspace-selected), the index is skipped
but a comment explains the index will be created on the next workspace
selection (or via backfill).

### Fix 2 — Add fingerprint write to the batch, size-variant, and edit paths

For the three missing call sites, after each `saveGeneration` call:

- `src/App.tsx:5778` (batch combo)
- `src/App.tsx:6182` (size variant)
- `src/App.tsx:6488` (edit / re-render)

The size-variant and edit paths receive their image via
`generateSizeVariant` (a different callable). The hash is **NOT**
computed in those paths. The fix is one of:

- **(a)** Have `generateSizeVariant` return its own `imageFingerprint`
  (compute it server-side the same way as `serverGenerateFinalAd`).
- **(b)** Compute the hash client-side from the response's
  `imageBase64` (using the same `sharp`-backed `computeHash` library
  loaded as a browser-compatible bundle — note: sharp is native and
  may not bundle cleanly for the browser; this is the harder path).
- **(c)** Use a browser-compatible hash (e.g. a JS implementation of
  dHash64) and accept the small risk of false negatives from a
  different implementation.

Recommended: **(a)** — server-side computation in the existing
callable. Same pattern as the primary render.

### Fix 3 — Add a `console.warn` when the gate skips the write

Even if the gate is removed in Fix 1, defensively log when the
fingerprint is `null` after a successful render so silent regressions
are visible:

```ts
if (!mockupResult.imageFingerprint) {
  console.warn("Phase 14: server returned no imageFingerprint — generation will be manual-link-only", { savedGenId });
}
```

---

## Verification Plan (after fix applied)

1. **Build**: `cd functions && npm run build`
2. **Test**: `cd functions && npm test` (all 11+ suites must pass)
3. **SC-11**: `node scripts/sc11Guard.mjs` (0 forbidden terms)
4. **Manual smoke test** (out of scope for this audit; needs a
   deployed function with a real account):
   - Generate a render as a Starter user
   - Verify the generation document has `imageFingerprint` set
   - Verify the `imageFingerprints` index has an entry (only for
     Scale users with an active workspace)
   - Generate a batch combo as a Scale user
   - Verify all combo generations have `imageFingerprint` set
   - Generate a size variant
   - Verify the variant generation has `imageFingerprint` set

---

## RULES Followed

- ✅ Investigation only — no fix applied
- ✅ PowerShell syntax used for all commands
- ✅ All commands run in worktree `D:\proads-worktrees\phase-14-rag-meta`
- ✅ No deployment attempted
- ✅ No commit made
