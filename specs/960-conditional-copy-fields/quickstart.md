# Quickstart: Verifying Phase 24B — Conditional Copy Fields

Verification steps for the two paranoid-checkpoint tasks. Run after implementation, before any deploy.

## Prerequisites

- Worktree: `D:\proads-worktrees\phase-24-conditional-copy` on branch `phase-24-conditional-copy`.
- `npm install` at root and in `functions/` already done.

## 1. Build gates (catches the type-widening blast radius — D1)

```bash
# backend — must be clean; type widening string→string|null surfaces every unguarded call site here
cd functions && npm run build

# frontend
cd .. && npm run build

# lint
npm run lint
```

**Pass:** both builds succeed with zero TypeScript errors. (A failing build = an unguarded `null` on an optional field — fix the guard, do not cast.)

## 2. Backend invariant tests (T20 — the hardest invariant)

```bash
cd functions && npm test
```

**Pass:** `conditionalCopyFields.test.ts` is green, asserting (contract rows P2–P9):
- headline-only output → 3 optional fields `null` + status `absent`, none `""` (P2, SC-003);
- malformed optional field → after retry, status `parse_failure`, value `null`, a warning was logged (P3, SC-010);
- `validateCopyFidelity` passes with `null` optionals and still fails empty `hookText` (P4/P7, SC-005);
- dedup-blanked field → `null` + `absent` (P5, SC-011);
- whitespace-only → `null` + `absent` (P6);
- absent vs parse_failure never cross-contaminate (P9, SC-004);
- present fields keep claimFlag/Phase-22 behavior (P8).

## 3. Step-2 UI manual verification (T19)

Start the app and drive a generation to step 2:

```bash
npm run dev
```

Use a test input (or a stubbed parser output) that yields each field set, and confirm:

| Scenario | Expected (contract) |
|---|---|
| All 4 fields | renders as before — no regression (U1) |
| Headline only | only headline shows; no empty subhead/CTA/benefit boxes, labels, or separators (U2) |
| CTA absent | headline + subhead + benefit show; nothing CTA-related (U3) |
| Absent field's regenerate button | NOT present in DOM (inspect — not just invisible) (U4) |
| Present field's regenerate button | hover-reveals as today (U5) |
| Arabic copy, some fields absent | present fields right-aligned, RTL correct, no LTR leak (U6) |
| No add-field control anywhere | confirmed absent (U7) |

## 4. Actions + variation carousel with fewer fields (T19, US3)

On a variation missing one or more optional fields:
- **Approve** → succeeds, carries only present fields (U9).
- **Edit** → editor opens; absent field shows empty input; save with it left empty → stored value is `null`, not `""` (U10). Re-open to confirm it's still absent.
- **AI-Edit** → applies; validates `HOOK_TEXT` present (U10).
- **Batch** → select hooks with differing field sets; each processes against its own fields (U11).
- **Variation carousel** → "Generate 4 more"; scroll positions with mixed field counts; every position renders cleanly; arrows + dots work; Arabic next = leftward (U8).

## 5. Trace audit (Constitution VI/VII — D6)

After a run that degraded a field or had a dedup blank, inspect the generation's `resolutionTrace.copyFieldStatus`:
- four statuses recorded;
- `degradedToAbsent[]` lists any field that hit `parse_failure`;
- `dedupBlanked[]` lists any field nulled by dedup.

### Where to find the trace (reviewer onboarding)

The trace is written through **two** channels; pick whichever is closest to your debugging surface.

**1. Backend Cloud Functions logs** (live production + emulator).
Search the function logs for the run ID. The trace object is logged by the `persistTrace(genId, trace)` call in `resolutionTrace.ts`. Pattern:
```bash
firebase functions:log --only generateFinalAd | grep -E "(copyFieldStatus|degradedToAbsent|dedupBlanked)"
```

**2. Firestore document** (durable record after the run).
The trace is persisted to the same generation document by `persistTrace`:
```
Firestore path:    /generations/{generationId}
Field:             resolutionTrace.copyFieldStatus
Sub-fields:        hookText, subheadText, ctaName, benefitText, degradedToAbsent[], dedupBlanked[]
```
Read it via:
```bash
firebase firestore:get /generations/<generationId> | jq .resolutionTrace.copyFieldStatus
```
Or in the Firebase Console: Firestore → `generations` collection → open the document by ID → expand the `resolutionTrace` map → expand the `copyFieldStatus` sub-object.

**3. Frontend response payload** (per-call, transient).
For an interactive debugging session, the trace round-trips back to the client inside the function response. Open browser DevTools → Network tab → filter by the callable (`generateFinalAd`) → click the request → inspect the response body → find `data.resolutionTrace.copyFieldStatus`.

**Pass:** the override paths (degrade, dedup-blank) are traceable — no silent absence.

## 6. Regression guard

- Run the existing suite: `cd functions && npm test` (all prior tests green — SC-008).
- Generate a normal 4-field ad end-to-end and confirm the final image still renders all four texts (fidelity contract intact).

## Done criteria

All of §1–§6 pass, mapping 1:1 to the Success Criteria (SC-001…SC-011) and the two contract files. Only then is Phase 24B ready for review (Claude Code audit → CodeRabbit → owner approval → deploy with `functions/lib` rebuilt first).
