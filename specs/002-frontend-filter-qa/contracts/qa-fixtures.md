# Contract: Priority Lane QA Fixtures

**Feature**: 002-frontend-filter-qa
**Location**: `functions/src/contractFixtures.test.ts`

## Fixture Structure

Each fixture is a function that:
1. Constructs exact `AdInputs` for the lane
2. Calls `validateLaunchSurface(inputs)` — must return `{ allowed: true }`
3. Calls `resolveCreativeSpec(inputs)` — validates resolver output
4. Calls lane-specific check functions
5. Reports pass/fail with details on failure

## 11 Priority Lane Fixtures

### Lane 1 — Retargeting + Carousel

```text
Input: campaignType=retargeting, adMode=carousel, slideCount=5,
       retargetingObjection=price_too_high, offerCreativeMode=[standard_hero]
Checks:
  - launchMatrixCheckPassed === true
  - resolvedCampaignType === 'retargeting'
  - perSlide[0].hasCTA === true (slide 1)
  - perSlide[1..3].hasCTA === false (middle slides)
  - perSlide[4].hasCTA === true (last slide)
  - Each middle slide has distinct retargeting angle
  - hookAngle === null, hookAngleNullReason === 'retargeting'
```

### Lane 2 — Cold + Single + before_after

```text
Input: campaignType=cold, adMode=single, offerCreativeMode=[before_after],
       personalPhotos=[test_photo]
Checks:
  - launchMatrixCheckPassed === true
  - resolvedCreativeModes === ['before_after']
  - resolvedAdMode === 'single'
  - modeCompatibilityResult === 'ok'
```

### Lane 3 — Cold + Carousel + value_stack

```text
Input: campaignType=cold, adMode=carousel, offerCreativeMode=[value_stack],
       valueStackItems=["Gift A","Gift B","Gift C","Gift D"], slideCount=3
Checks:
  - launchMatrixCheckPassed === true
  - slideCountOverride === true
  - resolvedSlideCount === 6 (4 gifts + 2)
  - perSlide[0].role === 'hook', hasCTA === true
  - perSlide[1..4].role === 'middle', hasCTA === false (one gift per slide)
  - perSlide[5].role === 'close', hasCTA === true
  - valueStackEmptyFieldsSkipped does not include 'valueStackItems'
```

### Lane 4 — Cold + Carousel (any approved mode)

```text
Input: campaignType=cold, adMode=carousel, slideCount=4,
       offerCreativeMode=[standard_hero]
Checks:
  - launchMatrixCheckPassed === true
  - perSlide follows cold slide-count plan for 4 slides
  - CTA on slide 1 and 4 only
```

### Lane 5 — Cold + Batch + standard_hero + value_stack

```text
Input: campaignType=cold, adMode=batch, offerCreativeMode=[standard_hero, value_stack]
Checks:
  - launchMatrixCheckPassed === true
  - resolvedCreativeModes includes both modes
  - resolvedAdMode === 'batch'
```

### Lane 6 — Cold + Single + value_stack

```text
Input: campaignType=cold, adMode=single, offerCreativeMode=[value_stack],
       valueStackItems=["A","B","C"], valueStackPrice="99", valueStackGuarantee=""
Checks:
  - launchMatrixCheckPassed === true
  - valueStackEmptyFieldsSkipped includes 'valueStackGuarantee'
  - valueStackEmptyFieldsSkipped does NOT include 'valueStackItems' or 'valueStackPrice'
```

### Lane 7 — Retargeting + Single + value_stack

```text
Input: campaignType=retargeting, adMode=single, offerCreativeMode=[value_stack],
       retargetingObjection=dont_trust, valueStackItems=["A","B"]
Checks:
  - launchMatrixCheckPassed === true
  - hookAngle === null
  - objectionId === 'dont_trust'
```

### Lane 8 — Minimal + standard_hero + Single

```text
Input: visualStyleFamily=minimal, offerCreativeMode=[standard_hero], adMode=single,
       selectedUniverse="Tokyo"
Checks:
  - launchMatrixCheckPassed === true
  - resolvedStyleFamily === 'minimal'
  - artDirectionCleared === true (no art direction for minimal)
```

### Lane 9 — Minimal + standard_hero + Batch

```text
Input: visualStyleFamily=minimal, offerCreativeMode=[standard_hero], adMode=batch
Checks:
  - launchMatrixCheckPassed === true
  - resolvedStyleFamily === 'minimal'
  - resolvedAdMode === 'batch'
```

### Lane 10 — Testimonial Carousel (Cold)

```text
Input: campaignType=cold, adMode=carousel, testimonialMode=true,
       testimonialScreenshots=[3 screenshots]
Checks:
  - Deferred to Spec G (testimonial carousel not yet built)
  - Fixture is a stub that logs "Spec G required" and passes
```

### Lane 11 — Testimonial Carousel (Retargeting)

```text
Input: campaignType=retargeting, adMode=carousel, testimonialMode=true,
       retargetingObjection=will_it_work_for_me, testimonialScreenshots=[2 screenshots]
Checks:
  - Deferred to Spec G (testimonial carousel not yet built)
  - Fixture is a stub that logs "Spec G required" and passes
```

## Evidence Workflow Template

Every claimed fix must include:

```text
1. Failing rule ID:        [exact rule from LAUNCH_MATRIX]
2. Controlling file:       [file.ts → functionName()]
3. Root cause:             [why old behavior occurred]
4. What changed:           [the fix]
5. Trace before:           [resolution trace JSON from failing run]
6. Trace after:            [resolution trace JSON from passing run]
7. Screenshot before:      [failing output image]
8. Screenshot after:       [passing output image]
9. Test inputs:            [exact AdInputs JSON, reproducible]
```
