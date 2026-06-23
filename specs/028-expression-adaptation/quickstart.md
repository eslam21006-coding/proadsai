# Quickstart: Expression Adaptation (Phase 28)

Backend-only, prompt-engineering feature. No frontend, no Firestore migration.

## Prereqs

```bash
cd functions
npm install   # if not already
```

## Where things live

| Concern | Location |
|---------|----------|
| New mapper | `functions/src/expressionMap.ts` (NEW) |
| Injection point | `functions/src/generators.ts` ~line 3097–3103 (`[VISUAL ARCHITECT V5.0]` concept prompt, beside `MOOD DIRECTION:`) |
| Resolved inputs in scope at injection | `_effectiveColdHookAngle` (line 3095), `_rtCtx.objectionId` (line 3093) |
| Trace type | `functions/src/generators.ts` ~line 5135 (`ResolutionTrace`), mirror in `functions/src/types.ts`, docs in `docs/LAUNCH_MATRIX.md` ~798 |
| New types | `functions/src/types.ts` (`ExpressionDirective`, additive trace field) |
| Tests | `functions/src/expressionMap.test.ts` (NEW) |

## Build & test

```bash
cd functions
npm run build      # tsc — must compile clean
npm test           # all suites must pass (SC-006); includes new expressionMap.test.ts
```

From repo root, frontend should be unaffected:

```bash
npm run build      # frontend tsc + vite — should be untouched
```

## Manual verification (matches Success Criteria)

1. **Pain hook, uploaded smiling photo** → generate single ad. Expect hero showing concern/frustration, NOT a smile; same face as upload (SC-001, SC-004).
2. **Aspiration-style angle** (`future_based`) → expect determination/forward-looking, not neutral (SC-002).
3. **Every angle** → inspect `resolutionTrace.expressionAdaptation.emotion` is non-empty for all 10 `COLD_HOOK_ANGLES` (SC-003, FR-017).
4. **Before/after** → BEFORE half problem emotion, AFTER half confident; same identity both halves (SC-005).
5. **No angle (minimal)** → prompt unchanged vs. pre-Phase-28; no `EXPRESSION DIRECTION:` line.
6. **Arabic project** → `MOOD_EMOTION` field content is Arabic.

## Reversibility

- All replaced prompt text is commented out (not deleted).
- To disable entirely: the mapper returning `null` (or removing the single injection line) restores prior behavior; trace field is optional and harmless.

## Definition of done

- All Contract A–E assertions pass (`contracts/expression-mapping.md`).
- `npm test` green; `npm run build` clean (functions + frontend).
- Identity protection rules untouched; `MODEL_PROVIDER` switch verified on both providers.
