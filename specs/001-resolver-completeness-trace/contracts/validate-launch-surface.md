# Contract: validateLaunchSurface

**Feature**: 001-resolver-completeness-trace
**Location**: `functions/src/creativeResolver.ts` (shared frontend + backend)

## Signature

```
validateLaunchSurface(inputs: ResolverInput): LaunchSurfaceResult
```

## Input

Extended `ResolverInput` with `selectedModes`, `campaignType`, `adFormat`, `hookAngle`, `visualStyleFamily`, objection fields.

## Output

```
{ allowed: true }
or
{ allowed: false, reason: "Human-readable block reason" }
```

## Validation Rules (executed in order, first failure stops)

1. **Deleted mode check:** `limited_access`, `module_preview`, `day_strip` → "This creative mode is no longer available."
2. **Mode-to-tab check:** Every mode must belong to resolved tab → "{mode} is not available for {offerType}."
3. **Solo-only check:** If `before_after` or `text_only` selected with 2+ modes → "{mode} is a standalone mode and cannot be paired."
4. **Mode pair check:** If 2 modes, pair must exist in `ALLOWED_PAIRS` → "This mode combination is not supported for {offerType}."
5. **Campaign × format × plan check:** Must be in approved table → "{campaignType} + {adFormat} requires {plan} plan."
6. **Retargeting objection check:** Retargeting with no objection → "Retargeting requires an objection selection."
7. **before_after + carousel check:** → "Before/After is single-image only."

## Behavior

- Pure function, never throws. Returns result object.
- Caller decides: server throws `HttpsError`, frontend shows inline message.
- Must work in both `bundler` (frontend) and `NodeNext` (backend) module resolution.
