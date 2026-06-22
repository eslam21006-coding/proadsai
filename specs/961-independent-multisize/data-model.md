# Phase 1 Data Model: Independent Multi-Size Ad Generation

**Scope**: Additive only. No Firestore migration. Legacy `generations/{genId}` documents without the new fields behave exactly as before.

---

## Type Definitions (functions/src/types.ts — additive)

### AspectRatio (existing — reused)

```typescript
// Already defined (generators.ts:1053). UI restricts to UI_RATIOS = ['1:1','3:4','9:16'].
export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9" | "3:4" | "4:3";
```

### SizeVariantStatus (new)

```typescript
export type SizeVariantStatus = "pending" | "succeeded" | "failed";
// Lifecycle: absent → pending → succeeded
//                          ↘ failed (terminal until explicit user retry)
```

### ReferenceSource (new — audit)

```typescript
export type ReferenceSource = "uploaded" | "own_original" | "anchor" | "none";
// Resolution priority (R3): uploaded → own_original → anchor → none.
// "none" occurs when the anchor failed (FR-005a) and the variant generated from the brief alone.
```

### SizeVariant (new)

```typescript
export interface SizeVariant {
  ratio: AspectRatio;            // target canvas
  status: SizeVariantStatus;
  url: string | null;            // populated when status === "succeeded"
  referenceSource: ReferenceSource;
  creditsCharged: number;        // net for this variant (0 on no-op / after refund of a failure)
  noOp?: boolean;                // true when same-size already succeeded (FR-011)
  errorCode?: string;            // populated when status === "failed"
  idempotencyKey: string;        // `${genId}:${scope}:${itemIndex}:${ratio}` (FR-014)
  updatedAt: number;             // epoch ms
}
```

### SizeVariantTraceEntry (new — appended to ResolutionTrace)

```typescript
export interface SizeVariantTraceEntry {
  ratio: AspectRatio;
  scope: "single" | "batch" | "carousel";
  itemIndex: number | null;      // null for single; item/slide index otherwise
  referenceSource: ReferenceSource;
  provider: "openai" | "gemini";
  copyFidelityPasses: number;    // retries consumed by validateCopyFidelity
  succeeded: boolean;
  errorCode?: string;
  charged: number;               // credits charged before any refund
  refunded: number;              // credits refunded on failure (0 on success)
  timestamp: number;             // epoch ms
}

// ResolutionTrace gains (types.ts:253):
//   readonly sizeVariantTrace?: readonly SizeVariantTraceEntry[];
```

### Request / Response contracts (new)

```typescript
export type GenerationScope = "single" | "batch" | "carousel";

export interface GenerateSizeVariantRequest {
  generationId: string;          // parent generation doc
  scope: GenerationScope;
  itemIndex: number | null;      // null for single; batch item / carousel slide index otherwise
  targetAspectRatio: AspectRatio; // must be in UI_RATIOS
  // Reference seed: backend resolves priority, but the client passes what it has.
  sourceImageOverride?: string;  // data URL / storage ref of source-own original (resize) or anchor (pre-select)
  //   NOTE (FR-008): a user-uploaded reference on the PARENT generation overrides this — backend priority is uploaded > own_original (sourceImageOverride) > anchor > none.
  activeWorkspaceId?: string;
}

export interface GenerateSizeVariantResponse {
  success: boolean;
  variant: SizeVariant;          // includes status, url, creditsCharged, noOp, errorCode
  netCreditsCharged: number;     // 0 on no-op or after refund of a failure; 5 on success
}
```

---

## Persistence Map (Firestore `generations/{genId}` — additive)

| Scope | Where variants live | Shape |
|---|---|---|
| Single image | existing `mockupHistory` | `Array<{ url: string; ratio: AspectRatio }>` (unchanged; anchor + each size appended) |
| Batch item | `batchItems[i].sizeVariants` | `{ [ratio: string]: SizeVariant }` |
| Carousel slide | `carouselSlides[i].sizeVariants` | `{ [ratio: string]: SizeVariant }` |
| Audit (all scopes) | `resolutionTrace.sizeVariantTrace` | `SizeVariantTraceEntry[]` |

- The anchor design itself remains stored as it is today (single-size happy path untouched — FR-005).
- `sizeVariants` is keyed by ratio so a re-request for an existing ratio is an O(1) no-op check (FR-011).

---

## Validation Rules

- **VR-1** `targetAspectRatio` MUST be a member of `UI_RATIOS` (`1:1`, `3:4`, `9:16`); otherwise reject before any charge (FR-001, Principle XI).
- **VR-2** Carousel scope MUST NOT be reachable via pre-select; only via the resize flow (FR-001). Frontend hides carousel pre-select; backend treats a carousel pre-select request as invalid.
- **VR-3** A variant request whose `(genId, scope, itemIndex, ratio)` already maps to a `succeeded` variant returns `noOp: true, netCreditsCharged: 0` (FR-011).
- **VR-4** Optional copy fields (`subheadText`, `ctaName`, `benefitText`) are read from the parent generation's stored brief; `null` stays `null` end-to-end (FR-006). `headlineText` is always required.
- **VR-5** Credits charged net MUST equal `5 × (count of succeeded, non-noOp variants)` for any request (FR-012a). Failed → refunded; no-op → 0.
- **VR-6** A user-uploaded reference on the parent generation forces `referenceSource = "uploaded"` regardless of scope (FR-008).
- **VR-7** If the anchor failed in a pre-select run, variants set `referenceSource = "none"` and still generate (FR-005a).
- **VR-8** `itemIndex` MUST be `null` when `scope === 'single'`; MUST be a non-negative integer within the parent's `output.batchResults` / `output.carouselSlides` array bounds when `scope === 'batch'` or `'carousel'`. Enforcement point: PRE-7 in `contracts/generateSizeVariant.md` (added in commit `f5a4f7c` per CodeRabbit review — previously, out-of-bounds `itemIndex` values would pass the integer check, get charged, and silently fall back to the parent context's first item).

---

## State Transitions (per variant)

```text
        request
          │
          ▼
   [affordability ok?] ──no──► reject (nothing charged, no doc write)   (FR-013)
          │yes
          ▼
   [ratio already succeeded?] ──yes──► noOp (charged 0)                 (FR-011)
          │no
          ▼
   charge 5 upfront ──► status: pending
          │
          ├─ generation + copy-fidelity OK ──► status: succeeded, url set, charged 5   (FR-012a)
          │
          └─ generation fails ──► refund 5 ──► status: failed (terminal until retry)   (FR-015)
                                                   │
                                            user retry (same idempotency key) ──► back to "charge 5 upfront"
                                                   (no double-charge — FR-014)
```

---

## Relationships

- A **Generation** (parent doc) has one anchor design and 0..2 additional `SizeVariant`s per scope-item (3 sizes max total).
- A **SizeVariant** belongs to exactly one parent generation + scope-item, identified by `idempotencyKey`.
- A **SizeVariantTraceEntry** is the immutable audit record for one variant generation attempt (Principle VI/VII).
- **Visual Reference** is not persisted as a new entity; its provenance is captured by `referenceSource` on the variant and trace.

---

## Frontend State (src/store.ts + App.tsx — mostly existing)

- `selectedSizes: Set<AspectRatio>` — already present (`App.tsx:2599`); drives pre-select fan-out and cost.
- `mockupHistory: {url, ratio}[]` + `pushMockup` — already present; used for single-image variants.
- `batchResults` / `carouselSlides` — already present with per-item `status`; extend item shape to carry per-ratio variant status for grouped display + per-design loading.
- `userCredits` + `setUserCredits` — already present; used for pre-check and refund reconciliation.
- Derived `totalCreditCost = max(1, designs) × 5` — existing cost pre-calc generalized to count all designs across sizes (FR-012).
