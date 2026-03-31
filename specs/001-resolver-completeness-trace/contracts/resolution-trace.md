# Contract: Resolution Trace

**Feature**: 001-resolver-completeness-trace
**Location**: Builder in `functions/src/creativeResolver.ts`, persistence in `functions/src/index.ts`

## buildResolutionTrace

### Signature

```
buildResolutionTrace(inputs: AdInputs, resolved: ResolverOutput): ResolutionTrace
```

### Input

- `inputs`: Original user inputs (AdInputs)
- `resolved`: Output from `resolveCreativeSpec()` including validation results, visual precedence overrides, slide plan, and empty field filtering

### Output

Complete `ResolutionTrace` object (see data-model.md for full schema).

### Rules

- All fields are populated from resolver outputs — no additional I/O
- `launchMatrixCheckPassed`: from `validateLaunchSurface()` result
- `autoSwitchEvents`: collected during resolution (family switch clearing, retargeting hookAngle null, etc.)
- `perSlide`: from `carouselSlideCountPlan()` if adFormat is carousel
- `valueStackEmptyFieldsSkipped`: from `filterEmptyValueStackFields()` if value_stack active
- Partial trace on failure: populate whatever fields were resolved before the failure point

## Persistence

### Location

Field `resolutionTrace` on `generations/{genId}` Firestore document.

### Write Behavior

- Written server-side by Cloud Functions in `index.ts`
- Written AFTER generation completes (success or failure)
- Write is fire-and-forget: failure is logged (`console.warn`) but does not fail the generation
- Uses `Firestore.update()` on the existing generation document

## resolveVisualPrecedence

### Signature

```
resolveVisualPrecedence(inputs: ResolverInput): AutoSwitchEvent[]
```

### Input

Extended `ResolverInput` with `referenceAdUsed`, `visualStyleFamily`, `selectedSubStyle`, `selectedUniverse`.

### Output

Array of `AutoSwitchEvent` objects recording each override applied.

### Precedence Chain (highest to lowest)

1. **Reference Ad** → overrides universe + art direction. Log: `referenceAdOverrideActive: true`
2. **Style Family** → controls available art direction cards. Minimal: clears art direction.
3. **Art Direction** → overrides universe rendering aesthetic
4. **Universe** → controls scene environment (suppressed in minimal)
5. **Mode Layout** → never overridden

### Rules

- Apply from highest priority down
- Each override produces an `AutoSwitchEvent`
- `text_only` mode: suppress universe, art direction, style family (log `textOnlyActive: true`)
- `minimal` family: clear art direction, suppress universe scene rendering
- Family switch: clear incompatible art direction cards
