# Contract: `generateSizeVariant` (Cloud Function onCall)

**Region**: `europe-west1` · **Secrets**: `geminiApiKey`, `openaiApiKey` · **Timeout**: 300s · **Memory**: 2GiB
**Supersedes**: `reflowImage` (HOTFIX-F) for the resize path; adds the additional-size path.
**Registered in**: `functions/src/index.ts` · **Body in**: `functions/src/sizeVariant.ts`
**Cost map**: `COSTS.generateImage = 5` (reuse), `ACTION_FEATURE_MAP['generateSizeVariant'] = 'visualPolishes'`.

## Request

```typescript
interface GenerateSizeVariantRequest {
  generationId: string;
  scope: "single" | "batch" | "carousel";
  itemIndex: number | null;          // null for single
  targetAspectRatio: AspectRatio;    // MUST ∈ UI_RATIOS ('1:1','3:4','9:16')
  sourceImageOverride?: string;      // source-own original (resize) or anchor image (pre-select variant)
  activeWorkspaceId?: string;
}
```

## Response

```typescript
interface GenerateSizeVariantResponse {
  success: boolean;
  variant: SizeVariant;              // see data-model.md
  netCreditsCharged: number;         // 0 (no-op / refunded failure) | 5 (success)
}
```

## Preconditions (validated before any credit charge)

| ID | Rule | On violation |
|---|---|---|
| PRE-1 | Caller authenticated; resolve `creditOwnerUid` via `resolveCreditOwner()`. | `unauthenticated` |
| PRE-2 | `checkFeature(entitlement, 'visualPolishes')` allowed. | `permission-denied` + `requiredPlan` |
| PRE-3 | `targetAspectRatio ∈ UI_RATIOS`. | `invalid-argument` (VR-1) |
| PRE-4 | `scope === 'carousel'` only valid for resize flow (not pre-select). | `invalid-argument` (VR-2) |
| PRE-5 | Parent `generations/{generationId}` exists and is owned by the credit owner / workspace. | `not-found` / `permission-denied` |
| PRE-6 | Credit owner balance ≥ 5. | `resource-exhausted` (per-variant guard; whole-request pre-check is frontend) |

## Behavior (happy path)

1. Resolve idempotency key `genId:scope:itemIndex:ratio`.
2. **No-op check** — if a `succeeded` variant already exists for the key → return `{ success: true, variant: {...noOp:true, creditsCharged:0}, netCreditsCharged: 0 }`. (FR-011 / VR-3)
3. Resolve **reference image** by priority: uploaded reference on parent → `sourceImageOverride` (own original / anchor) → none. Set `referenceSource`. (R3 / VR-6 / VR-7)
4. In a Firestore transaction: deduct 5 from owner, write variant `status: pending`, record idempotency key as in-flight.
5. Read parent brief (build plan + copy fields, `null` preserved). Rebuild prompt for `targetAspectRatio` via `buildFinalImagePrompt({ aspectRatio: target, imageParts:[reference], styleReferencePresent:true, reflowInstruction: undefined, ...brief })`.
6. Render via `createVisualRoutingCaller` (respects `MODEL_PROVIDER`); run `validateCopyFidelity()` with existing retry loop.
7. On success: persist `url`, set `status: succeeded`, write `SizeVariantTraceEntry`, return `netCreditsCharged: 5`.
8. On failure: refund 5 in a transaction, set `status: failed` + `errorCode`, write trace, return `success:false, netCreditsCharged: 0`. (FR-015)

## Postconditions / invariants

- **INV-1** Net credits charged across a variant's full lifecycle = `5 × success` (0 if it never succeeds). (FR-012a / VR-5)
- **INV-2** Retrying a `failed` variant reuses the same idempotency key and never double-charges. (FR-014)
- **INV-3** Every attempt (success or failure or no-op) appends exactly one `SizeVariantTraceEntry`. (Principle VI)
- **INV-4** `null` copy fields in the parent brief stay `null` → no text in prompt or image. (FR-006 / VR-4)
- **INV-5** Persistence is additive: single → `mockupHistory`; batch/carousel → `sizeVariants[ratio]`. No migration.
- **INV-6** The variant path MUST NOT write a Phase 23 anti-sameness fingerprint (FR-019a); it reuses the parent's saved build plan and does not call `generateBuildPlan()`.

## Acceptance fixtures (functions/src/__tests__/sizeVariant.test.ts)

1. Single Square→Story variant renders with CTA + benefit present (Story 9:16 no-drop). (SC-002)
2. Null `subheadText` parent → variant prompt omits subheadline. (FR-006)
3. Uploaded reference present → `referenceSource === 'uploaded'`. (FR-008)
4. Same-ratio re-request → `noOp:true`, `netCreditsCharged:0`. (FR-011)
5. Forced generation failure → refund applied, `status:'failed'`, net 0; retry same key → single charge. (FR-014/FR-015)
6. Anchor-failed pre-select variant → `referenceSource:'none'`, still generates. (FR-005a)
7. `targetAspectRatio` outside UI_RATIOS → rejected pre-charge. (VR-1)
8. Carousel pre-select request → rejected; carousel resize accepted. (VR-2)
9. Generating a variant does NOT create an anti-sameness fingerprint entry for the parent. (FR-019a)
