# Contract: validateLaunchSurface

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/launchSurface.ts` (new file)

## Function Signature

```typescript
interface LaunchSurfaceInput {
  offerType: string;           // 'live_event' | 'free_guide' | 'mini_course' (or legacy aliases)
  campaignType: 'cold' | 'retargeting';
  adFormat: 'single' | 'carousel' | 'batch';
  creativeModes: string[];     // 1 or 2 modes
  hookAngle?: string | null;
  visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal';
  userPlan: 'starter' | 'creator' | 'pro' | 'scaling';
}

interface LaunchSurfaceResult {
  passed: boolean;
  blockReason?: string;          // Human-readable, user-facing
  resolvedOfferType: OfferTypeId; // Canonical (after legacy alias mapping)
  resolvedTab: TabId;
  layoutKey?: string;             // For approved pairings
}

function validateLaunchSurface(input: LaunchSurfaceInput): LaunchSurfaceResult;
```

## Validation Rules (in order)

1. **Deleted mode check**: If any mode in `creativeModes` is in `DELETED_MODES`, return `{ passed: false, blockReason: '"{mode}" is no longer available.' }`
2. **Offer type resolution**: Map legacy aliases to canonical. If unknown, return `{ passed: false, blockReason: 'Unknown offer type.' }`
3. **Campaign × Format × Plan check**: Match against `CampaignFormatEntry` table. If no match, block. If user plan < `minPlan`, block with plan upgrade reason.
4. **Tab mode check**: Verify all modes are in the tab's `approvedModes`. If not, block.
5. **Solo-only check**: If any mode is solo-only and `creativeModes.length > 1`, block with mode-specific reason.
6. **Pairing check**: If 2 modes selected, verify the pair exists in `approvedPairings`. Return `layoutKey`.
7. **Hook angle check**: If `campaignType === 'cold'` and `hookAngle` is provided, verify it's in `APPROVED_HOOK_ANGLES`. If retargeting, `hookAngle` must be null.
8. **Format restriction**: If `before_after` selected and `adFormat !== 'single'`, block: "Before/After is single-image only."
9. **Batch N cap**: If `adFormat === 'batch'`, validate that N (product of variation dimensions: hooks × concepts × sizes) does not exceed 30. If exceeded, block: "Batch count exceeds maximum of 30 combinations."

## Error Messages

| Scenario | Message |
|----------|---------|
| Deleted mode | `"{mode}" is no longer available.` |
| Plan insufficient | `"{format}" requires {minPlan} plan or higher.` |
| Mode not in tab | `"{mode}" is not available for {offerType}.` |
| Solo-only paired | `"Before/After is single-image only."` / `"Text Only is a standalone mode."` |
| Invalid pairing | `"{mode1}" and "{mode2}" cannot be paired.` |
| Invalid hook angle | `"{angle}" is not an approved hook angle.` |
| before_after + carousel | `"Before/After is single-image only."` |

## Invariants

- Pure function, no side effects, no async I/O
- Called at the entry point of `generateCreative` in `index.ts`, before credit deduction
- Result feeds into `ResolutionTrace.launchMatrixCheckPassed` and `launchMatrixBlockReason`
