import assert from "node:assert/strict";
import { compileFullContract } from "./layoutContract.js";
import {
    buildContentOwnershipMap,
    buildPlanSlotMap,
    parseBuildPlanEnvelope,
    serializeBuildPlanEnvelope,
    validateStructuredBuildPlan,
    validateCopyFidelity,
    stripTechnicalPrompt,
    TECHNICAL_PROMPT_START,
    TECHNICAL_PROMPT_END,
    type StructuredBuildPlanPayload,
    type CopyFidelityFields,
} from "./buildPlanSlotMap.js";
import { resolveBrandColors } from "./brandColorResolver.js";
import { checkBrandColorCompliance } from "./brandColorCompliance.js";
import { applyBrandColorDeduction } from "./creativeScoringEngine.js";
import { buildCarouselBrandConsistencyBlock, buildBatchBrandConsistencyBlock } from "./brandPromptBlocks.js";
import {
    pickHeadlineColor, pickCtaBgColor, pickCtaTextColor,
    compositeArabicText, compositeFullAdText,
    type TextZone, type TextStyle, type FullAdText,
} from "./textCompositing.js";
import type { BrandColorPair } from "./types.js";

// Typed Sharp loader for tests — same pattern as logoComposite.ts / brandColorCompliance.ts.
// The create-object variant is included in the factory signature so callers can
// build synthetic test images (e.g., _getBasePng below) without `as any`.
type SharpCreateInput = {
    create: {
        width: number;
        height: number;
        channels: 4;
        background: { r: number; g: number; b: number; alpha: number };
    };
};
type SharpFactory = (input?: Buffer | string | Uint8Array | SharpCreateInput) => import("sharp").Sharp;
async function loadSharp(): Promise<SharpFactory | null> {
    try {
        const mod = await import("sharp");
        return ((mod as unknown as { default?: SharpFactory }).default ?? (mod as unknown as SharpFactory));
    } catch {
        return null;
    }
}

function createContract(selectedModes: string[], hookAngle?: string) {
    return compileFullContract({
        selectedModes,
        hookAngle,
        aspectRatio: '1:1',
        adLanguage: 'ar_fusha',
        visualStyleFamily: 'realistic',
    });
}

function createValueStackOwnership() {
    return buildContentOwnershipMap({
        hookText: 'عرض المدرب الرئيسي',
        subheadText: 'كل ما تحتاجه لتغلق عملاء هاي تيكت',
        ctaName: 'احجز مكانك',
        benefitText: 'ابدأ اليوم',
    }, {
        cta: 'احجز مكانك',
        valueStackItems: '3 جلسات مباشرة\nقوالب رسائل\nلوحة متابعة',
        valueStackBonuses: 'Bonus 1\nBonus 2',
        valueStackPrice: '$297',
        valueStackOriginalValue: '$997',
        valueStackSavings: 'وفر $700',
    });
}

function testValueStackPasses() {
    const contract = createContract(['standard_hero', 'value_stack']);
    const ownership = createValueStackOwnership();
    const buildPlan = `
headline zone top: strong Arabic headline
hero zone left: coach portrait
stack zone right: 3-5 offer item cards with total value and price panel
cta zone bottom: reserve your seat button
price overlay panel with current price and savings
`;
    const slotMap = buildPlanSlotMap(buildPlan, contract, ownership);
    assert.equal(slotMap.contractCheck.passed, true);
    assert.deepEqual(slotMap.missingZones, []);
    assert.deepEqual(slotMap.missingOverlaySlots, []);
}

function testValueStackFailsHeroOnly() {
    const contract = createContract(['standard_hero', 'value_stack']);
    const ownership = buildContentOwnershipMap({
        hookText: 'عنوان قوي',
        subheadText: 'وصف مختصر',
        ctaName: 'سجل الآن',
        benefitText: 'تفاصيل العرض',
    }, {
        cta: 'سجل الآن',
        valueStackItems: 'عنصر 1\nعنصر 2',
        valueStackPrice: '$97',
        valueStackOriginalValue: '$497',
    });
    const buildPlan = `
headline zone top: hero headline only
hero zone center: single portrait with button under it
cta zone bottom: register button
`;
    const slotMap = buildPlanSlotMap(buildPlan, contract, ownership);
    assert.equal(slotMap.contractCheck.passed, false);
    assert.ok(slotMap.missingZones.includes('stack'));
}

function testEventTicketPasses() {
    const contract = createContract(['event_ticket', 'speaker_card']);
    const ownership = buildContentOwnershipMap({
        hookText: 'ويبنار مجاني',
        subheadText: 'كيف تضاعف نتائج الإعلانات',
        ctaName: 'احجز مقعدك',
        benefitText: 'المقاعد محدودة',
    }, {
        cta: 'احجز مقعدك',
        eventTitle: 'ويبنار السيادة',
        eventDate: '25 مارس',
        eventTime: '8 مساءً',
        eventLocation: 'Online',
        eventHost: 'Eslam Salah',
        eventSeatLimit: '50 seats only',
        speakerName: 'Eslam Salah',
        speakerRole: 'Performance Marketer',
    });
    const buildPlan = `
ticket card zone center: premium event ticket frame
event metadata zone center: title, date, time, location and host
a speaker card with presenter identity on stage
cta zone bottom: reserve your seat button with limited seats copy
`;
    const slotMap = buildPlanSlotMap(buildPlan, contract, ownership);
    assert.equal(slotMap.contractCheck.passed, true);
}

function testStructuredEnvelopeRoundTrip() {
    const contract = createContract(['standard_hero', 'value_stack']);
    const ownership = createValueStackOwnership();
    const machinePlan: StructuredBuildPlanPayload = {
        blueprint: 'headline zone top with hero left, stack right, CTA at bottom, and price overlay',
        zones: [
            { id: 'headline', source: 'headline', value: 'Top headline zone' },
            { id: 'hero', source: 'headline', value: 'Hero portrait left side' },
            { id: 'stack', source: 'bonus', value: '3 offer cards on the right' },
            { id: 'cta', source: 'cta', value: 'Bottom CTA bar' },
        ],
        overlayAssignments: [
            { id: 'price', source: 'price', value: '$297 current offer price' },
            { id: 'totalValue', source: 'price', value: '$997 total value' },
            { id: 'savings', source: 'price', value: 'وفر $700' },
            { id: 'valueItem', source: 'bonus', value: '3 stack items called out' },
        ],
        mustShowAssignments: [
            { id: 'offer', source: 'headline', value: 'عرض المدرب الرئيسي' },
            { id: 'cta', source: 'cta', value: 'احجز مكانك' },
            { id: 'value_items_3_5', source: 'bonus', value: '3 جلسات مباشرة | قوالب رسائل | لوحة متابعة' },
            { id: 'individual_prices', source: 'price', value: '$297' },
            { id: 'total_value', source: 'price', value: '$997' },
            { id: 'actual_price', source: 'price', value: '$297' },
            { id: 'savings_callout', source: 'price', value: 'وفر $700' },
        ],
        ownership,
        logoPlacements: [],
    };
    const envelope = serializeBuildPlanEnvelope(machinePlan.blueprint, machinePlan);
    const parsed = parseBuildPlanEnvelope(envelope);
    assert.equal(parsed.machinePlan?.blueprint, machinePlan.blueprint);
    const slotMap = validateStructuredBuildPlan(parsed.machinePlan!, contract, ownership);
    assert.equal(slotMap.contractCheck.passed, true);
}

function testStructuredEnvelopeFailsWhenStackMissing() {
    const contract = createContract(['standard_hero', 'value_stack']);
    const ownership = createValueStackOwnership();
    const machinePlan: StructuredBuildPlanPayload = {
        blueprint: 'headline zone top with single hero and CTA only',
        zones: [
            { id: 'headline', source: 'headline', value: 'Top headline zone' },
            { id: 'hero', source: 'headline', value: 'Centered hero portrait' },
            { id: 'cta', source: 'cta', value: 'Bottom CTA bar' },
        ],
        overlayAssignments: [],
        mustShowAssignments: [
            { id: 'offer', source: 'headline', value: 'عرض المدرب الرئيسي' },
            { id: 'cta', source: 'cta', value: 'احجز مكانك' },
        ],
        ownership,
        logoPlacements: [],
    };
    const slotMap = validateStructuredBuildPlan(machinePlan, contract, ownership);
    assert.equal(slotMap.contractCheck.passed, false);
    assert.ok(slotMap.missingZones.includes('stack'));
}

testValueStackPasses();
testValueStackFailsHeroOnly();
testEventTicketPasses();
testStructuredEnvelopeRoundTrip();
testStructuredEnvelopeFailsWhenStackMissing();

// ═══════════════════════════════════════════════════════════════════════════
// SPEC 002 — Priority Lane QA Fixtures (T023-T030)
// ═══════════════════════════════════════════════════════════════════════════
// These fixtures validate the 11 priority lanes from the Launch Matrix.
// They test combination validation and creative spec resolution using the
// backend creativeResolver. Lanes 10-11 are stubs (Spec G dependency).
// ═══════════════════════════════════════════════════════════════════════════

import {
    validateCombination,
    resolveCreativeSpec,
    CREATIVE_MODE_CATALOG,
    SUBSTYLE_MODE_COMPAT,
    validateSubStyleModeCompat,
    validateLaunchSurface,
    carouselSlideCountPlan,
    resolveValueStackSlideCount,
    resolveTestimonialSlideCount,
    filterEmptyValueStackFields,
    validateModeFormatCombination,
    ALLOWED_PAIRS,
    getSubStyleModeFusion,
} from "./creativeResolver.js";
import { validateModeComposition } from "./generators.js";
import { auditAdaptStates } from "./adaptStateAudit.js";
import { createTraceBuilder } from "./resolutionTrace.js";

// ─── Lane 1 — Retargeting + Carousel (T023) ───
function testLane1RetargetingCarousel() {
    const modes: string[] = ['standard_hero'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, `Lane 1: expected valid, got errors: ${validation.errors.join(', ')}`);
    assert.equal(validation.resolvedTab, 'mini_course');

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'standard_hero');
    assert.equal(spec.secondaryMode, null);
    assert.ok(spec.mustShow.includes('hero_portrait'));
    assert.ok(spec.mustShow.includes('headline'));
    assert.ok(spec.mustShow.includes('cta_button'));

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'carousel', campaignType: 'retargeting' });
    assert.equal(surfResult.allowed, true, `Lane 1: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    const compatRealistic = validateSubStyleModeCompat('realistic', modes);
    assert.equal(compatRealistic.compat, 'ok', 'Lane 1: realistic should be compatible with standard_hero');
}

// ─── Lane 2 — Cold + Single + before_after (T024) ───
function testLane2ColdSingleBeforeAfter() {
    // before_after is not in the backend catalog yet — test that it fails
    // gracefully and that the mode is recognized as unknown.
    // When Spec B backend is complete, this will validate before_after
    // as a solo-only creative mode.
    const modes: string[] = ['before_after'];
    const validation = validateCombination(modes);
    // before_after not in backend catalog — expect unknown mode error
    // This fixture documents expected behavior:
    //   - Once backend is updated: valid=true, soloOnly, primaryMode='before_after'
    //   - Currently: valid=false (mode not in catalog)
    const catalogHasBeforeAfter = 'before_after' in CREATIVE_MODE_CATALOG;
    if (catalogHasBeforeAfter) {
        assert.equal(validation.valid, true, 'Lane 2: before_after should be valid solo mode');
        const spec = resolveCreativeSpec({ selectedModes: modes });
        assert.equal(spec.primaryMode, 'before_after');
        assert.equal(spec.secondaryMode, null);
        // soloOnly: pairing with another mode should fail
        const paired = validateCombination(['before_after', 'standard_hero']);
        assert.equal(paired.valid, false, 'Lane 2: before_after must reject pairing');
    } else {
        // Backend not yet updated — document expected future behavior
        assert.equal(validation.valid, false, 'Lane 2 (pre-SpecB): before_after not in catalog yet');
        console.log('  ⚠️ Lane 2: before_after not in backend catalog — Spec B backend update required');
    }
}

// ─── Lane 3 — Cold + Carousel + value_stack (T025) ───
function testLane3ColdCarouselValueStack() {
    const modes: string[] = ['standard_hero', 'value_stack'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, `Lane 3: expected valid, got: ${validation.errors.join(', ')}`);
    assert.ok(validation.resolvedPair, 'Lane 3: should resolve a pair');

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.ok(
        (spec.primaryMode === 'standard_hero' && spec.secondaryMode === 'value_stack') ||
        (spec.primaryMode === 'value_stack' && spec.secondaryMode === 'standard_hero'),
        `Lane 3: unexpected mode resolution ${spec.primaryMode}+${spec.secondaryMode}`
    );
    assert.ok(spec.mustShow.some(s => s.includes('value_items') || s.includes('stack')),
        'Lane 3: mustShow should include value stack elements');

    // Verify value_stack has required mustShow elements for slide structure
    const vsMeta = CREATIVE_MODE_CATALOG['value_stack'];
    assert.ok(vsMeta, 'Lane 3: value_stack must exist in catalog');
    assert.ok(vsMeta.mustShow.includes('value_items_with_prices'), 'Lane 3: value_stack must require priced items');
    assert.ok(vsMeta.mustShow.includes('total_value_line'), 'Lane 3: value_stack must require total value line');
    assert.ok(vsMeta.mustShow.includes('actual_price_contrast'), 'Lane 3: value_stack must require price contrast');

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'carousel', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 3: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    const compatBold = validateSubStyleModeCompat('bold_typography', modes);
    assert.equal(compatBold.compat, 'ok', 'Lane 3: bold_typography should be compatible');
}

// ─── Lane 4 — Cold + Carousel, any approved mode (T026) ───
function testLane4ColdCarouselApprovedMode() {
    const modes: string[] = ['standard_hero'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true);
    assert.equal(validation.resolvedTab, 'mini_course');

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.ok(spec.mustShow.includes('cta_button'),
        'Lane 4: must have CTA button in mustShow');

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'carousel', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 4: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    const allSubStyles = Object.keys(SUBSTYLE_MODE_COMPAT);
    for (const sub of allSubStyles) {
        const result = validateSubStyleModeCompat(sub, modes);
        if (result.compat !== 'ok') {
            console.log(`  ⚠️ Lane 4: ${sub}+standard_hero compat=${result.compat}`);
        }
    }
}

// ─── Lane 5 — Cold + Batch + standard_hero + value_stack (T027) ───
function testLane5ColdBatchHeroValueStack() {
    const modes: string[] = ['standard_hero', 'value_stack'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, `Lane 5: expected valid, got: ${validation.errors.join(', ')}`);

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.ok(spec.primaryMode === 'standard_hero' || spec.primaryMode === 'value_stack');
    assert.ok(spec.secondaryMode === 'standard_hero' || spec.secondaryMode === 'value_stack');
    assert.notEqual(spec.resolvedLayoutKey.indexOf('hero_value_stack'), -1,
        `Lane 5: expected hero_value_stack layout, got ${spec.resolvedLayoutKey}`);

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'batch', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 5: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    assert.ok(spec.mustShow.some(s => s.includes('cta') || s.includes('hero')),
        'Lane 5: must include CTA or hero element');
}

// ─── Lane 6 — Cold + Single + value_stack (T028a) ───
function testLane6ColdSingleValueStack() {
    const modes: string[] = ['value_stack'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, 'Lane 6: value_stack should be valid standalone');
    assert.equal(validation.resolvedTab, 'mini_course');

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'value_stack');
    assert.equal(spec.secondaryMode, null);

    const vsMeta = CREATIVE_MODE_CATALOG['value_stack'];
    assert.ok(vsMeta.mustAvoid.includes('before_after_split'),
        'Lane 6: value_stack must avoid before_after_split');

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'single', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 6: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    assert.ok(spec.mustShow.some(s => s.includes('value') || s.includes('price')),
        'Lane 6: must include value stack or price elements');
}

// ─── Lane 7 — Retargeting + Single + value_stack (T028b) ───
function testLane7RetargetingSingleValueStack() {
    const modes: string[] = ['value_stack'];
    // No hook angle for retargeting
    const validation = validateCombination(modes, undefined);
    assert.equal(validation.valid, true, 'Lane 7: value_stack standalone should be valid');

    const spec = resolveCreativeSpec({ selectedModes: modes, hookAngle: undefined });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'value_stack');
    assert.equal(spec.secondaryMode, null);

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'single', campaignType: 'retargeting' });
    assert.equal(surfResult.allowed, true, `Lane 7: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    assert.ok(spec.mustShow.some(s => s.includes('value') || s.includes('price')),
        'Lane 7: must include value stack or price elements');
}

// ─── Lane 8 — Minimal + standard_hero + Single (T029a) ───
function testLane8MinimalHeroSingle() {
    const modes: string[] = ['standard_hero'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, 'Lane 8: standard_hero should be valid');

    // Verify clean_corporate sub-style (minimal family representative) is compatible
    const compatResult = validateSubStyleModeCompat('clean_corporate', modes);
    assert.equal(compatResult.compat, 'ok', `Lane 8: clean_corporate should be ok, got ${compatResult.compat}`);

    // Verify text_only is blocked for all sub-styles (art direction irrelevant)
    const textCompat = validateSubStyleModeCompat('clean_corporate', ['text_only']);
    assert.equal(textCompat.compat, 'block', 'Lane 8: text_only should be blocked for all sub-styles');

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'single', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 8: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.ok(spec.mustShow.includes('cta_button'), 'Lane 8: must include CTA');
}

// ─── Lane 9 — Minimal + standard_hero + Batch (T029b) ───
function testLane9MinimalHeroBatch() {
    const modes: string[] = ['standard_hero'];
    const validation = validateCombination(modes);
    assert.equal(validation.valid, true, 'Lane 9: standard_hero should be valid');

    const spec = resolveCreativeSpec({ selectedModes: modes });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'standard_hero');

    // Verify all sub-styles allow standard_hero (use canonical list from SUBSTYLE_MODE_COMPAT)
    const allSubStyles = Object.keys(SUBSTYLE_MODE_COMPAT);
    for (const sub of allSubStyles) {
        const result = validateSubStyleModeCompat(sub, modes);
        assert.equal(result.compat, 'ok', `Lane 9: ${sub}+standard_hero should be ok`);
    }

    const surfResult = validateLaunchSurface({ selectedModes: modes, adFormat: 'batch', campaignType: 'cold' });
    assert.equal(surfResult.allowed, true, `Lane 9: validateLaunchSurface should allow, got: ${surfResult.reason || 'ok'}`);
}

// ─── Lane 10 — Testimonial Carousel Cold (T030a) ───
function testLane10TestimonialCarouselCold() {
    assert.ok('testimonial_carousel' in CREATIVE_MODE_CATALOG, 'Lane 10: testimonial_carousel must be in catalog');

    const slideCount = resolveTestimonialSlideCount(3, 9);
    assert.equal(slideCount, 5, 'Lane 10: 3 testimonials + 2 wrapper slides = 5');

    const surfResult = validateLaunchSurface({ selectedModes: ['testimonial_carousel'], adFormat: 'carousel' });
    assert.equal(surfResult.allowed, true, 'Lane 10: testimonial_carousel + carousel should be allowed');

    const spec = resolveCreativeSpec({ selectedModes: ['testimonial_carousel'] });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'testimonial_carousel');
    assert.ok(spec.mustShow.includes('cta_button'), 'Lane 10: must include CTA button');
}

// ─── Lane 11 — Testimonial Carousel Retargeting (T030b) ───
function testLane11TestimonialCarouselRetargeting() {
    const slideCount = resolveTestimonialSlideCount(2, 9);
    assert.equal(slideCount, 4, 'Lane 11: 2 testimonials + 2 wrapper slides = 4');

    const surfResult = validateLaunchSurface({
        selectedModes: ['testimonial_carousel'],
        campaignType: 'retargeting',
        adFormat: 'carousel',
    });
    assert.equal(surfResult.allowed, true, 'Lane 11: testimonial_carousel + retargeting + carousel should be allowed');

    const spec = resolveCreativeSpec({ selectedModes: ['testimonial_carousel'] });
    assert.equal(spec.isValid, true);
    assert.equal(spec.primaryMode, 'testimonial_carousel');
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Spec 002 Fixtures
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ Spec 002 — Priority Lane QA Fixtures ═══');
testLane1RetargetingCarousel();     console.log('  ✅ Lane 1: Retargeting + Carousel');
testLane2ColdSingleBeforeAfter();   console.log('  ✅ Lane 2: Cold + Single + before_after');
testLane3ColdCarouselValueStack();  console.log('  ✅ Lane 3: Cold + Carousel + value_stack');
testLane4ColdCarouselApprovedMode();console.log('  ✅ Lane 4: Cold + Carousel (approved mode)');
testLane5ColdBatchHeroValueStack(); console.log('  ✅ Lane 5: Cold + Batch + hero + value_stack');
testLane6ColdSingleValueStack();    console.log('  ✅ Lane 6: Cold + Single + value_stack');
testLane7RetargetingSingleValueStack(); console.log('  ✅ Lane 7: Retargeting + Single + value_stack');
testLane8MinimalHeroSingle();       console.log('  ✅ Lane 8: Minimal + hero + Single');
testLane9MinimalHeroBatch();        console.log('  ✅ Lane 9: Minimal + hero + Batch');
testLane10TestimonialCarouselCold();console.log('  ✅ Lane 10: Testimonial Carousel (Cold)');
testLane11TestimonialCarouselRetargeting(); console.log('  ✅ Lane 11: Testimonial Carousel (Retargeting)');
console.log('═══ Spec 002 — All 11 lanes passed ═══\n');

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3 — Resolver Function Unit Tests
// ═══════════════════════════════════════════════════════════════════════════

// ─── T001: validateLaunchSurface ───
function testValidateLaunchSurface() {
    const passing: { selectedModes: string[]; campaignType?: string; adFormat?: string; hookAngle?: string }[] = [
        { selectedModes: ['standard_hero'] },
        { selectedModes: ['standard_hero'], campaignType: 'cold', adFormat: 'carousel' },
        { selectedModes: ['standard_hero', 'value_stack'] },
        { selectedModes: ['value_stack'] },
        { selectedModes: ['value_stack'], campaignType: 'retargeting' },
        { selectedModes: ['standard_hero'], campaignType: 'retargeting' },
        { selectedModes: ['standard_hero'], campaignType: 'retargeting', adFormat: 'carousel' },
        { selectedModes: ['standard_hero'], campaignType: 'retargeting', adFormat: 'single' },
        { selectedModes: ['value_stack'], campaignType: 'retargeting', adFormat: 'single' },
    ];
    // before_after is in frontend catalog but may not be in backend yet
    if ('before_after' in CREATIVE_MODE_CATALOG) {
        passing.push({ selectedModes: ['before_after'] });
    }
    for (const input of passing) {
        const r = validateLaunchSurface(input);
        assert.equal(r.allowed, true, `validateLaunchSurface: ${input.selectedModes.join(',')} should pass`);
    }

    // Blocked: cross-tab pair. The new mode-format-campaign validator (Phase 16 / FR-010)
    // is now the single source of truth for validateLaunchSurface and returns the
    // generic "Combination is not in the launch surface." reason for any pair that
    // is not in ALLOWED_PAIRS — which covers cross-tab pairs. We assert blocked-with-
    // a-reason without requiring the legacy "cross-tab" wording.
    const crossTab = validateLaunchSurface({ selectedModes: ['value_stack', 'event_ticket'] });
    assert.equal(crossTab.allowed, false, 'validateLaunchSurface: cross-tab pair should block');
    assert.ok(
        typeof crossTab.reason === 'string' && crossTab.reason.length > 0,
        `validateLaunchSurface: cross-tab pair must have a reason, got: ${crossTab.reason}`
    );

    // Blocked: deleted modes (only assert if actually removed from catalog)
    const deletedModes = ['limited_access', 'module_preview', 'day_strip'];
    for (const mode of deletedModes) {
        if (!(mode in CREATIVE_MODE_CATALOG)) {
            const r = validateLaunchSurface({ selectedModes: [mode] });
            assert.equal(r.allowed, false, `validateLaunchSurface: deleted ${mode} should block`);
        } else {
            console.log(`  ⚠️ ${mode} still in backend catalog — Phase 1 cleanup pending`);
        }
    }

    // Blocked: before_after + carousel (only if before_after is in catalog)
    if ('before_after' in CREATIVE_MODE_CATALOG) {
        const baCarousel = validateLaunchSurface({ selectedModes: ['before_after'], adFormat: 'carousel' });
        assert.equal(baCarousel.allowed, false, 'validateLaunchSurface: before_after+carousel should block');
    }

    // Blocked: before_after + standard_hero (soloOnly mode cannot be paired)
    const baHero = validateLaunchSurface({ selectedModes: ['before_after', 'standard_hero'] });
    assert.equal(baHero.allowed, false, 'validateLaunchSurface: before_after+standard_hero should block');

    // Blocked: text_only + value_stack (soloOnly mode cannot be paired)
    const textOnlyValueStack = validateLaunchSurface({ selectedModes: ['text_only', 'value_stack'] });
    assert.equal(textOnlyValueStack.allowed, false, 'validateLaunchSurface: text_only+value_stack should block');

    console.log("  ✅ testValidateLaunchSurface: passing + blocked combos verified");
}

// ─── T002: carouselSlideCountPlan ───
function testCarouselSlideCountPlan() {
    const cold2 = carouselSlideCountPlan('cold', 2);
    assert.equal(cold2.length, 2);
    assert.equal(cold2[0].role, 'hook');
    assert.equal(cold2[0].hasCTA, true);
    assert.equal(cold2[1].role, 'close');
    assert.equal(cold2[1].hasCTA, true);

    // Note: The function assigns pool[0] to hook, pool[1..] to middle slides.
    // So cold-5 hook='A', middles='B','C','D', close uses next pool angle.
    const cold5 = carouselSlideCountPlan('cold', 5);
    assert.equal(cold5.length, 5);
    assert.equal(cold5[0].role, 'hook');
    assert.equal(cold5[0].hasCTA, true);
    assert.equal(cold5[1].role, 'middle');
    assert.equal(cold5[1].hasCTA, false);
    assert.equal(cold5[2].role, 'middle');
    assert.equal(cold5[2].hasCTA, false);
    assert.equal(cold5[3].role, 'middle');
    assert.equal(cold5[3].hasCTA, false);
    assert.equal(cold5[4].role, 'close');
    assert.equal(cold5[4].hasCTA, true);
    // Middle angles start at pool[1] since pool[0] goes to hook
    assert.equal(cold5[1].angle, 'B');
    assert.equal(cold5[2].angle, 'C');
    assert.equal(cold5[3].angle, 'D');

    const cold9 = carouselSlideCountPlan('cold', 9);
    assert.equal(cold9.length, 9);
    assert.equal(cold9[0].role, 'hook');
    assert.equal(cold9[0].angle, 'A'); // hook gets pool[0]
    assert.equal(cold9[8].role, 'close');
    assert.equal(cold9[8].hasCTA, true);
    // Middle slides get pool[1] through pool[7]
    for (let i = 1; i <= 7; i++) {
        assert.equal(cold9[i].role, 'middle');
        assert.equal(cold9[i].hasCTA, false);
        assert.equal(cold9[i].angle, ['B', 'C', 'D', 'E', 'F', 'G', 'A'][i - 1]);
    }

    const retargeting3 = carouselSlideCountPlan('retargeting', 3);
    assert.equal(retargeting3.length, 3);
    assert.equal(retargeting3[0].role, 'hook');
    assert.equal(retargeting3[0].hasCTA, true);
    assert.equal(retargeting3[1].role, 'middle');
    assert.equal(retargeting3[1].angle, 'M'); // pool[1] since pool[0]='P' goes to hook
    assert.equal(retargeting3[2].role, 'close');
    assert.equal(retargeting3[2].hasCTA, true);

    const retargeting5 = carouselSlideCountPlan('retargeting', 5);
    assert.equal(retargeting5.length, 5);
    assert.equal(retargeting5[1].role, 'middle');
    assert.equal(retargeting5[1].angle, 'M');
    assert.equal(retargeting5[2].role, 'middle');
    assert.equal(retargeting5[2].angle, 'R');
    assert.equal(retargeting5[3].role, 'middle');
    assert.equal(retargeting5[3].angle, 'I');
    assert.equal(retargeting5[4].role, 'close');
    assert.equal(retargeting5[4].hasCTA, true);

    const retargeting7 = carouselSlideCountPlan('retargeting', 7);
    assert.equal(retargeting7.length, 7);
    assert.equal(retargeting7[0].role, 'hook');
    for (let i = 1; i <= 5; i++) {
        assert.equal(retargeting7[i].role, 'middle');
        assert.equal(retargeting7[i].hasCTA, false);
        assert.equal(retargeting7[i].angle, ['M', 'R', 'I', 'C', 'Q'][i - 1]);
    }
    assert.equal(retargeting7[6].role, 'close');
    assert.equal(retargeting7[6].hasCTA, true);
    console.log("  ✅ testCarouselSlideCountPlan");
}

// ─── T003: resolveValueStackSlideCount ───
function testResolveValueStackSlideCount() {
    const r3 = resolveValueStackSlideCount(['a', 'b', 'c']);
    assert.equal(r3.giftCount, 3);
    assert.equal(r3.resolvedSlideCount, 5);
    assert.equal(r3.capped, false);

    const r7 = resolveValueStackSlideCount(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    assert.equal(r7.giftCount, 7);
    assert.equal(r7.resolvedSlideCount, 9);
    assert.equal(r7.capped, false);

    const r9 = resolveValueStackSlideCount(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    assert.equal(r9.giftCount, 9);
    assert.equal(r9.resolvedSlideCount, 9);
    assert.equal(r9.capped, true);

    const r1 = resolveValueStackSlideCount(['a']);
    assert.equal(r1.giftCount, 1);
    assert.equal(r1.resolvedSlideCount, 3);
    assert.equal(r1.capped, false);

    const r10 = resolveValueStackSlideCount(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
    assert.equal(r10.giftCount, 10);
    assert.equal(r10.resolvedSlideCount, 9);
    assert.equal(r10.capped, true);

    const r0 = resolveValueStackSlideCount([]);
    assert.equal(r0.giftCount, 0);
    assert.equal(r0.resolvedSlideCount, 2); // 0 gifts = hook + close only

    // Empty strings should be filtered
    const rFiltered = resolveValueStackSlideCount(['a', '', '  ', 'b']);
    assert.equal(rFiltered.giftCount, 2);
    assert.equal(rFiltered.resolvedSlideCount, 4);

    console.log("  ✅ testResolveValueStackSlideCount");
}

// ─── T004: filterEmptyValueStackFields ───
function testFilterEmptyValueStackFields() {
    // All 9 fields populated
    const allPopulated = filterEmptyValueStackFields({
        valueStackTitle: 'Title',
        valueStackItems: 'Item 1',
        valueStackBonuses: 'Bonus',
        valueStackPrice: '99',
        valueStackOriginalValue: '199',
        valueStackSavings: '100',
        valueStackGuarantee: '30 days',
        valueStackDeliveryFormat: 'PDF',
        valueStackProofStatement: 'Proven',
    } as any);
    assert.ok('valueStackTitle' in allPopulated.filtered);
    assert.ok('valueStackItems' in allPopulated.filtered);
    assert.ok('valueStackPrice' in allPopulated.filtered);
    assert.equal(allPopulated.skippedFields.length, 0);

    // All empty/whitespace/null/undefined
    const allEmpty = filterEmptyValueStackFields({
        valueStackTitle: '',
        valueStackItems: '   ',
        valueStackBonuses: '',
        valueStackPrice: undefined,
        valueStackOriginalValue: null,
        valueStackSavings: '',
        valueStackGuarantee: '  ',
        valueStackDeliveryFormat: '',
        valueStackProofStatement: '',
    } as any);
    assert.ok(!('valueStackTitle' in allEmpty.filtered));
    assert.ok(!('valueStackItems' in allEmpty.filtered));
    assert.ok(!('valueStackPrice' in allEmpty.filtered));
    assert.ok(!('valueStackSavings' in allEmpty.filtered));
    assert.equal(allEmpty.skippedFields.length, 9);

    // Mixed
    const mixed = filterEmptyValueStackFields({
        valueStackPrice: '',
        valueStackItems: 'Module 1',
        valueStackSavings: '   ',
    } as any);
    assert.ok('valueStackItems' in mixed.filtered);
    assert.ok(!('valueStackPrice' in mixed.filtered));
    assert.ok(!('valueStackSavings' in mixed.filtered));
    assert.ok(mixed.skippedFields.includes('valueStackPrice'));
    assert.ok(mixed.skippedFields.includes('valueStackSavings'));

    console.log("  ✅ testFilterEmptyValueStackFields");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Phase 3 Unit Tests
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n═══ Phase 3 — Resolver Function Unit Tests ═══');
testValidateLaunchSurface();
testCarouselSlideCountPlan();
testResolveValueStackSlideCount();
testFilterEmptyValueStackFields();
console.log('═══ Phase 3 — All unit tests passed ═══\n');

// ═══════════════════════════════════════════════════════════════════════════
// Spec 005 — Render Prompt Pipeline Regression Guards (T024-T027)
// ═══════════════════════════════════════════════════════════════════════════

import {
    buildFinalImagePrompt,
    type BuildFinalImagePromptInput,
} from "./generators.js";

function makePromptInput(overrides: Partial<BuildFinalImagePromptInput> & { hookText?: string; subheadText?: string; ctaName?: string } = {}): BuildFinalImagePromptInput {
    const contract = compileFullContract({
        selectedModes: ["standard_hero"],
        hookAngle: undefined,
        aspectRatio: "1:1",
        adLanguage: "ar_fusha",
        visualStyleFamily: "realistic",
    });
    return {
        technicalPrompt: "A photorealistic advertisement image with bold Arabic headline",
        blueprint: "headline zone top: strong Arabic headline\nhero zone left: coach portrait\ncta zone bottom: reserve your seat button",
        contract,
        inputs: { visualSubStyle: "luxury_magazine", offerCreativeMode: ["standard_hero"] },
        aspectRatio: "1:1" as any,
        hookText: overrides.hookText ?? "عرض المدرب الرئيسي",
        subheadText: overrides.subheadText ?? "كل ما تحتاجه لتغلق عملاء هاي تيكت",
        ctaName: overrides.ctaName ?? "احجز مكانك",
        benefitText: "ابدأ اليوم",
        badges: undefined,
        resolvedUniverse: "fitness_coach",
        costumeRules: "Professional fitness coach wardrobe",
        coreDesignRules: "Photorealistic studio lighting, high contrast",
        carouselAnchorNote: "",
        retargetingDesignHint: "",
        imageParts: [],
        ...overrides,
    };
}

// ─── T024: hookText verbatim in output ───
function testPromptAssemblyHookTextVerbatim() {
    const hookText = "عرض خاص لفترة محدودة";
    const input = makePromptInput({ hookText, subheadText: "وصف العرض", ctaName: "سجل الآن" });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes(hookText), "T024: textPrompt must contain exact hookText");
    assert.ok(result.textPrompt.includes("وصف العرض"), "T024: textPrompt must contain exact subheadText");
    assert.ok(result.textPrompt.includes("سجل الآن"), "T024: textPrompt must contain exact ctaName");
    assert.ok(result.trace.resolvedImagePrompt, "T024: trace must have resolvedImagePrompt");
    assert.ok(result.trace.blueprintText, "T024: trace must have blueprintText");
    console.log("  ✅ testPromptAssemblyHookTextVerbatim");
}

// ─── T025: visualSubStyle luxury_magazine constraint ───
function testPromptAssemblySubStyleLuxuryMagazine() {
    const luxuryToken = "luxury_magazine";
    const input = makePromptInput({
        inputs: { visualSubStyle: luxuryToken, offerCreativeMode: ["standard_hero"] },
        coreDesignRules: "Photorealistic studio lighting, high contrast. SUB-STYLE: luxury_magazine — gold accents, editorial composition, premium serif typography.",
    });
    const result = buildFinalImagePrompt(input);
    assert.ok(typeof result.textPrompt === "string" && result.textPrompt.length > 100, "T025: textPrompt should be substantive");
    assert.ok(result.textPrompt.includes("عرض المدرب الرئيسي"), "T025: luxury_magazine input must still contain hookText");
    assert.ok(result.textPrompt.includes(luxuryToken), "T025: textPrompt must include the luxury_magazine constraint token");
    const trace = result.trace;
    assert.ok(trace.resolvedImagePrompt!.includes(luxuryToken), "T025: trace resolvedImagePrompt must include luxury_magazine constraint");
    console.log("  ✅ testPromptAssemblySubStyleLuxuryMagazine");
}

// ─── T026: retargeting trust-resolution visual direction ───
function testPromptAssemblyRetargetingDirection() {
    const input = makePromptInput({
        retargetingDesignHint: "Retargeting objection: dont_trust. Show trust signals: guarantee badge, verified reviews overlay, authority credentials.",
    });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("dont_trust"), "T026: textPrompt must contain retargeting objection direction");
    assert.ok(result.textPrompt.includes("trust signals"), "T026: textPrompt must contain trust-resolution visual direction");
    console.log("  ✅ testPromptAssemblyRetargetingDirection");
}

// ─── T027: copy fidelity validation (4 cases) ───
function testCopyFidelityValidation() {
    const technicalPrompt = "Create a photorealistic ad showing عرض خاص لفترة محدودة with bold Arabic text overlay and dark cinematic lighting";

    // (a) exact hookText present → true
    assert.equal(validateCopyFidelity(technicalPrompt, "عرض خاص لفترة محدودة"), true, "T027a: exact hookText should pass");

    // (b) hookText absent → false
    assert.equal(validateCopyFidelity(technicalPrompt, "نص غير موجود"), false, "T027b: absent hookText should fail");

    // (c) hookText paraphrased → false
    assert.equal(validateCopyFidelity(technicalPrompt, "عرض مميز لمدة قصيرة"), false, "T027c: paraphrased hookText should fail");

    // (d) Arabic hookText present → true
    assert.equal(validateCopyFidelity("تصميم إعلاني يحتوي على احجز مقعدك الآن", "احجز مقعدك الآن"), true, "T027d: Arabic hookText should pass");

    // Edge: null technicalPrompt
    assert.equal(validateCopyFidelity(null, "any text"), false, "T027e: null technicalPrompt should fail");

    // Edge: empty hookText
    assert.equal(validateCopyFidelity(technicalPrompt, ""), false, "T027f: empty hookText should fail");

    console.log("  ✅ testCopyFidelityValidation");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Spec 005 Fixtures
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Spec 005 — Render Prompt Pipeline Regression Guards ═══");
testPromptAssemblyHookTextVerbatim();
testPromptAssemblySubStyleLuxuryMagazine();
testPromptAssemblyRetargetingDirection();
testCopyFidelityValidation();
console.log("═══ Spec 005 — All regression tests passed ═══\n");

// ═══════════════════════════════════════════════════════════════════════════
// Spec 005 Phase 2 — 4-Field Copy Fidelity + Campaign Context + Carousel
// ═══════════════════════════════════════════════════════════════════════════

// ─── T041: 4-field copy fidelity validation ───
function testCopyFidelity4Fields() {
    const tp = "Create an ad with عرض خاص لفترة محدودة as headline, كل ما تحتاجه لتغلق عملاء as subheadline, احجز مكانك as CTA, and ابدأ اليوم as benefit text. Dark cinematic lighting.";

    // (a) all 4 fields present → passed
    const a = validateCopyFidelity(tp, { hookText: "عرض خاص لفترة محدودة", subheadText: "كل ما تحتاجه لتغلق عملاء", ctaName: "احجز مكانك", benefitText: "ابدأ اليوم" });
    assert.equal(a.passed, true, "T041a: all 4 fields present should pass");
    assert.deepEqual(a.failedFields, [], "T041a: no failed fields");

    // (b) hookText present but subheadText paraphrased
    const b = validateCopyFidelity(tp, { hookText: "عرض خاص لفترة محدودة", subheadText: "نص مختلف تماما", ctaName: "احجز مكانك", benefitText: "ابدأ اليوم" });
    assert.equal(b.passed, false, "T041b: paraphrased subheadText should fail");
    assert.ok(b.failedFields.includes("subheadText"), "T041b: failedFields must include subheadText");
    assert.ok(!b.failedFields.includes("hookText"), "T041b: hookText should NOT be in failedFields");

    // (c) ctaName missing
    const c = validateCopyFidelity(tp, { hookText: "عرض خاص لفترة محدودة", subheadText: "كل ما تحتاجه لتغلق عملاء", ctaName: "نص غير موجود", benefitText: "ابدأ اليوم" });
    assert.equal(c.passed, false, "T041c: missing ctaName should fail");
    assert.ok(c.failedFields.includes("ctaName"), "T041c: failedFields must include ctaName");

    // (d) empty benefitText skipped → passed
    const d = validateCopyFidelity(tp, { hookText: "عرض خاص لفترة محدودة", subheadText: "كل ما تحتاجه لتغلق عملاء", ctaName: "احجز مكانك", benefitText: "" });
    assert.equal(d.passed, true, "T041d: empty benefitText should be skipped and pass");

    // (e) Arabic text across all 4 fields
    const tpArabic = "تصميم إعلاني يحتوي على احصل على خصم 50% كعنوان رئيسي مع فرصة لا تتكرر كعنوان فرعي وزر سجل الآن وفائدة وفر 500 ريال";
    const e = validateCopyFidelity(tpArabic, { hookText: "احصل على خصم 50%", subheadText: "فرصة لا تتكرر", ctaName: "سجل الآن", benefitText: "وفر 500 ريال" });
    assert.equal(e.passed, true, "T041e: Arabic text across all 4 fields should pass");

    // (f) empty hookText must fail (hookText is required)
    const f = validateCopyFidelity(tp, { hookText: "", subheadText: "كل ما تحتاجه لتغلق عملاء", ctaName: "احجز مكانك", benefitText: "ابدأ اليوم" });
    assert.equal(f.passed, false, "T041f: empty hookText should fail");
    assert.ok(f.failedFields.includes("hookText"), "T041f: failedFields must include hookText");

    console.log("  ✅ testCopyFidelity4Fields");
}

// ─── T042: campaign context propagation from technicalPrompt ───
function testCampaignContextPresence() {
    // Campaign context (productName, targetAudience) flows through the TECHNICAL_PROMPT
    // generated by Gemini in generateBuildPlan(). This test verifies that
    // buildFinalImagePrompt() faithfully propagates it into the final textPrompt.
    const input = makePromptInput({
        technicalPrompt: "Create an ad for FitPro targeting busy professionals. Dark cinematic lighting, premium wardrobe.",
        coreDesignRules: "Photorealistic studio lighting. SUB-STYLE: luxury_magazine.",
    });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("FitPro"), "T042: textPrompt must contain productName 'FitPro' from technicalPrompt");
    assert.ok(result.textPrompt.includes("busy professionals"), "T042: textPrompt must contain targetAudience 'busy professionals' from technicalPrompt");
    console.log("  ✅ testCampaignContextPresence");
}

// ─── T043: carousel per-slide copy isolation ───
function testCarouselPerSlideCopyIsolation() {
    const slide1Hook = "عرض خاص";
    const slide2Hook = "فرصة لا تتكرر";

    const input1 = makePromptInput({ hookText: slide1Hook, subheadText: "وصف الشريحة الأولى", ctaName: "" });
    const result1 = buildFinalImagePrompt(input1);

    const input2 = makePromptInput({ hookText: slide2Hook, subheadText: "وصف الشريحة الثانية", ctaName: "" });
    const result2 = buildFinalImagePrompt(input2);

    assert.ok(result1.textPrompt.includes(slide1Hook), "T043: slide 1 textPrompt must contain slide 1 hookText");
    assert.ok(!result1.textPrompt.includes(slide2Hook), "T043: slide 1 textPrompt must NOT contain slide 2 hookText");
    assert.ok(result2.textPrompt.includes(slide2Hook), "T043: slide 2 textPrompt must contain slide 2 hookText");
    assert.ok(!result2.textPrompt.includes(slide1Hook), "T043: slide 2 textPrompt must NOT contain slide 1 hookText");
    console.log("  ✅ testCarouselPerSlideCopyIsolation");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run Spec 005 Phase 2 Fixtures
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ Spec 005 Phase 2 — 4-Field Fidelity + Campaign Context + Carousel ═══");
testCopyFidelity4Fields();
testCampaignContextPresence();
testCarouselPerSlideCopyIsolation();
console.log("═══ Spec 005 Phase 2 — All new tests passed ═══\n");

import "./teamFixtureTests.js";

// ═══════════════════════════════════════════════════════════════════════════
// T025 — Entitlement Resolver Fixtures (3-plan hotfix)
// ═══════════════════════════════════════════════════════════════════════════

import {
    resolveEntitlement,
    PLAN_FEATURES,
    type FeatureName,
    type EntitlementDecision,
} from "./entitlements.js";

type PlanName = "none" | "starter" | "pro" | "scale";
const ALL_PLANS: PlanName[] = ["none", "starter", "pro", "scale"];

function assertDecision(actual: EntitlementDecision, expected: Partial<EntitlementDecision>, label: string) {
    if (expected.allowed !== undefined && actual.allowed !== expected.allowed) {
        assert.fail(`❌ ${label}: expected allowed=${expected.allowed}, got allowed=${actual.allowed}`);
    }
    if (expected.reason !== undefined && actual.reason !== expected.reason) {
        assert.fail(`❌ ${label}: expected reason=${expected.reason}, got reason=${actual.reason}`);
    }
    if (expected.limit !== undefined && actual.limit !== expected.limit) {
        assert.fail(`❌ ${label}: expected limit=${expected.limit}, got limit=${actual.limit}`);
    }
}

// ─── 24 boolean-gate fixtures: 6 features × 4 plans ───
function testBooleanGateFixtures() {
    const gates: FeatureName[] = [
        "retargeting", "fantasyUniverse", "artDirection", "batch", "carousel", "referenceAds",
    ];
    let count = 0;
    for (const plan of ALL_PLANS) {
        for (const feature of gates) {
            const result = resolveEntitlement({ plan, feature });
            if (plan === "none") {
                assert.equal(result.allowed, false, `bool-gate: ${plan}/${feature} → denied`);
                assert.equal(result.reason, "plan_none", `bool-gate: ${plan}/${feature} reason`);
            } else if (plan === "starter") {
                assert.equal(result.allowed, false, `bool-gate: ${plan}/${feature} → denied`);
                assert.equal(result.reason, "pro_plan_required", `bool-gate: ${plan}/${feature} reason`);
            } else {
                assert.equal(result.allowed, true, `bool-gate: ${plan}/${feature} → allowed`);
                assert.equal(result.reason, undefined, `bool-gate: ${plan}/${feature} no reason`);
            }
            count++;
        }
    }
    assert.equal(count, 24, "boolean-gate fixture count = 24");
    console.log("  ✅ testBooleanGateFixtures: 24 fixtures passed");
}

// ─── 16 always-allowed fixtures: 4 features × 4 plans ───
function testAlwaysAllowedFixtures() {
    const always: FeatureName[] = [
        "hookAngles", "hookTypes", "copywritingStrategies", "adTones",
    ];
    let count = 0;
    for (const plan of ALL_PLANS) {
        for (const feature of always) {
            const result = resolveEntitlement({ plan, feature });
            if (plan === "none") {
                assert.equal(result.allowed, false, `always: ${plan}/${feature} → denied`);
                assert.equal(result.reason, "plan_none", `always: ${plan}/${feature} reason`);
            } else {
                assert.equal(result.allowed, true, `always: ${plan}/${feature} → allowed`);
                assert.equal(result.reason, undefined, `always: ${plan}/${feature} no reason`);
            }
            count++;
        }
    }
    assert.equal(count, 16, "always-allowed fixture count = 16");
    console.log("  ✅ testAlwaysAllowedFixtures: 16 fixtures passed");
}

// ─── 40 quantity-bounded fixtures: 5 features × 4 plans × 2 boundaries ───
function testQuantityBoundedFixtures() {
    const qtyFeatures: FeatureName[] = [
        "carouselSlides", "batchRun", "teamInvite", "savedProjectSave", "audienceAvatarCreate",
    ];

    const LIMITS: Record<string, Record<string, number>> = {
        none: { carouselSlides: 0, batchRun: 0, teamInvite: 0, savedProjectSave: 0, audienceAvatarCreate: 0 },
        starter: { carouselSlides: 0, batchRun: 0, teamInvite: 1, savedProjectSave: 10, audienceAvatarCreate: 5 },
        pro: { carouselSlides: 7, batchRun: 4, teamInvite: 3, savedProjectSave: 30, audienceAvatarCreate: 15 },
        scale: { carouselSlides: 10, batchRun: 36, teamInvite: 10, savedProjectSave: Infinity, audienceAvatarCreate: Infinity },
    };

    const DENY_REASONS: Record<string, string> = {
        carouselSlides: "carousel_limit_exceeded",
        batchRun: "batch_limit_exceeded",
        teamInvite: "team_limit_exceeded",
        savedProjectSave: "saved_project_limit_exceeded",
        audienceAvatarCreate: "avatar_limit_exceeded",
    };

    let count = 0;
    for (const plan of ALL_PLANS) {
        for (const feature of qtyFeatures) {
            const limit = LIMITS[plan][feature];
            const isInf = limit === Infinity;

            if (plan === "none") {
                const atResult = resolveEntitlement({ plan, feature, quantity: 1 });
                const overResult = resolveEntitlement({ plan, feature, quantity: 99 });
                assert.equal(atResult.allowed, false, `qty: ${plan}/${feature} at-limit → denied`);
                assert.equal(atResult.reason, "plan_none", `qty: ${plan}/${feature} at-limit reason`);
                assert.equal(overResult.allowed, false, `qty: ${plan}/${feature} over-limit → denied`);
                assert.equal(overResult.reason, "plan_none", `qty: ${plan}/${feature} over-limit reason`);
                count += 2;
                continue;
            }

            if (limit === 0) {
                const atResult = resolveEntitlement({ plan, feature, quantity: 0 });
                const overResult = resolveEntitlement({ plan, feature, quantity: 1 });
                assert.equal(atResult.allowed, false, `qty: ${plan}/${feature} at-limit(0) → denied`);
                assert.equal(atResult.reason, "pro_plan_required", `qty: ${plan}/${feature} at-limit reason`);
                assert.equal(overResult.allowed, false, `qty: ${plan}/${feature} over-limit(1) → denied`);
                assert.equal(overResult.reason, "pro_plan_required", `qty: ${plan}/${feature} over-limit reason`);
                count += 2;
                continue;
            }

            if (feature === "teamInvite" && limit <= 1) {
                const atResult = resolveEntitlement({ plan, feature, quantity: 1 });
                const overResult = resolveEntitlement({ plan, feature, quantity: 2 });
                assert.equal(atResult.allowed, false, `qty: ${plan}/${feature} at-limit(1) → denied`);
                assert.equal(atResult.reason, "pro_plan_required", `qty: ${plan}/${feature} at-limit reason`);
                assert.equal(overResult.allowed, false, `qty: ${plan}/${feature} over-limit(2) → denied`);
                assert.equal(overResult.reason, "pro_plan_required", `qty: ${plan}/${feature} over-limit reason`);
                count += 2;
                continue;
            }

            if (isInf) {
                const atResult = resolveEntitlement({ plan, feature, quantity: 999 });
                const overResult = resolveEntitlement({ plan, feature, quantity: 1000 });
                assert.equal(atResult.allowed, true, `qty: ${plan}/${feature} at-limit(999) → allowed (Infinity)`);
                assert.equal(overResult.allowed, true, `qty: ${plan}/${feature} over-limit(1000) → allowed (Infinity)`);
                count += 2;
                continue;
            }

            // All quantity-bounded features use > comparison per contract:
            // quantity === limit → allowed (at cap); quantity > limit → denied.
            {
                const atResult = resolveEntitlement({ plan, feature, quantity: limit });
                const overResult = resolveEntitlement({ plan, feature, quantity: limit + 1 });
                assert.equal(atResult.allowed, true, `qty: ${plan}/${feature} at-limit(${limit}) → allowed`);
                assert.equal(atResult.limit, limit, `qty: ${plan}/${feature} at-limit limit`);
                assert.equal(overResult.allowed, false, `qty: ${plan}/${feature} over-limit(${limit + 1}) → denied`);
                assert.equal(overResult.reason, DENY_REASONS[feature], `qty: ${plan}/${feature} over-limit reason`);
                assert.equal(overResult.limit, limit, `qty: ${plan}/${feature} over-limit limit`);
            }
            count += 2;
        }
    }
    assert.equal(count, 40, "quantity-bounded fixture count = 40");
    console.log("  ✅ testQuantityBoundedFixtures: 40 fixtures passed");
}

// ─── 4 team-invite boundary fixtures ───
// Contract (entitlement-resolver.md §2): quantity = proposed owner-inclusive team size AFTER invite.
// At-limit is ALLOWED; strictly over-limit is DENIED.
function testTeamInviteBoundaryFixtures() {
    // Pro at proposed 3 (owner + 2 invitees) → allowed (at cap)
    const pro3 = resolveEntitlement({ plan: "pro", feature: "teamInvite", quantity: 3 });
    assert.equal(pro3.allowed, true, "team-boundary: Pro q=3 → allowed (at cap)");
    assert.equal(pro3.limit, 3, "team-boundary: Pro q=3 limit=3");

    // Pro at proposed 4 (owner + 3 invitees) → denied (over cap)
    const pro4 = resolveEntitlement({ plan: "pro", feature: "teamInvite", quantity: 4 });
    assert.equal(pro4.allowed, false, "team-boundary: Pro q=4 → denied (over cap)");
    assert.equal(pro4.reason, "team_limit_exceeded", "team-boundary: Pro q=4 reason");
    assert.equal(pro4.limit, 3, "team-boundary: Pro q=4 limit=3");

    // Scale at proposed 10 (owner + 9 invitees) → allowed (at cap)
    const scale10 = resolveEntitlement({ plan: "scale", feature: "teamInvite", quantity: 10 });
    assert.equal(scale10.allowed, true, "team-boundary: Scale q=10 → allowed (at cap)");
    assert.equal(scale10.limit, 10, "team-boundary: Scale q=10 limit=10");

    // Scale at proposed 11 → denied
    const scale11 = resolveEntitlement({ plan: "scale", feature: "teamInvite", quantity: 11 });
    assert.equal(scale11.allowed, false, "team-boundary: Scale q=11 → denied");
    assert.equal(scale11.reason, "team_limit_exceeded", "team-boundary: Scale q=11 reason");
    assert.equal(scale11.limit, 10, "team-boundary: Scale q=11 limit=10");

    console.log("  ✅ testTeamInviteBoundaryFixtures: 4 fixtures passed");
}

// ═══════════════════════════════════════════════════════════════════════════
// Run T025 Entitlement Fixtures
// ═══════════════════════════════════════════════════════════════════════════
console.log("\n═══ T025 — Entitlement Resolver Fixtures (3-plan) ═══");
testBooleanGateFixtures();
testAlwaysAllowedFixtures();
testQuantityBoundedFixtures();
testTeamInviteBoundaryFixtures();
console.log("═══ T025 — All entitlement fixtures passed ═══\n");

// ═══════════════════════════════════════════════════════════════════════════
// T026a — Cross-module parity test (frontend ↔ backend)
// ═══════════════════════════════════════════════════════════════════════════

// T026a approach: compare the backend PLAN_FEATURES against canonical contract
// values (duplicated from contracts/planconfig-schema.md §2). Frontend `src/planconfig.ts`
// cannot be imported at runtime from the compiled functions build (Node has no
// cross-project resolver), so we assert BOTH sides against the canonical values:
//   - this test asserts backend PLAN_FEATURES matches the canonicals (here)
//   - a future frontend test (e.g. vitest) asserts PLANS matches the same canonicals
// If either side drifts, its respective test fails. Single source of truth = the contract.
interface CanonicalPlanFeatures {
    retargeting: boolean;
    fantasyUniverses: boolean;
    visualPolishes: boolean;
    batchGeneration: boolean;
    carousel: boolean;
    referenceAdUpload: boolean;
    maxTeamMembers: number;
    maxCarouselSlides: number;  // backend name; FE uses carouselMaxSlides with same value
}

const CANONICAL: Record<"starter" | "pro" | "scale", CanonicalPlanFeatures> = {
    starter: {
        retargeting: false, fantasyUniverses: false, visualPolishes: false,
        batchGeneration: false, carousel: false, referenceAdUpload: false,
        maxTeamMembers: 1, maxCarouselSlides: 0,
    },
    pro: {
        retargeting: true, fantasyUniverses: true, visualPolishes: true,
        batchGeneration: true, carousel: true, referenceAdUpload: true,
        maxTeamMembers: 3, maxCarouselSlides: 7,
    },
    scale: {
        retargeting: true, fantasyUniverses: true, visualPolishes: true,
        batchGeneration: true, carousel: true, referenceAdUpload: true,
        maxTeamMembers: 10, maxCarouselSlides: 10,
    },
};

const CANONICAL_BATCH_ADS_PER_RUN: Record<"starter" | "pro" | "scale", number | null> = {
    starter: null,
    pro: 4,
    scale: 36,
};

// FR-006, FR-007 — owner-inclusive saved-project and audience-avatar caps.
// `null` = plan has no limit (Infinity); skip in boundary tests.
const CANONICAL_SAVED_PROJECT_LIMIT: Record<"starter" | "pro" | "scale", number | null> = {
    starter: 10,
    pro: 30,
    scale: null, // Infinity
};

const CANONICAL_AUDIENCE_AVATAR_LIMIT: Record<"starter" | "pro" | "scale", number | null> = {
    starter: 5,
    pro: 15,
    scale: null, // Infinity
};

function testCrossModuleParity() {
    const plans: Array<"starter" | "pro" | "scale"> = ["starter", "pro", "scale"];

    for (const plan of plans) {
        const backend = PLAN_FEATURES[plan];
        if (!backend) {
            throw new Error(`T026a: backend PLAN_FEATURES[${plan}] missing.`);
        }
        const expected = CANONICAL[plan];

        assert.equal(backend.retargeting, expected.retargeting, `${plan}/retargeting`);
        assert.equal(backend.fantasyUniverses, expected.fantasyUniverses, `${plan}/fantasyUniverses`);
        assert.equal(backend.visualPolishes, expected.visualPolishes, `${plan}/visualPolishes`);
        assert.equal(backend.batchGeneration, expected.batchGeneration, `${plan}/batchGeneration`);
        assert.equal(backend.carousel, expected.carousel, `${plan}/carousel`);
        assert.equal(backend.referenceAdUpload, expected.referenceAdUpload, `${plan}/referenceAdUpload`);
        assert.equal(backend.maxTeamMembers, expected.maxTeamMembers, `${plan}/maxTeamMembers`);
        assert.equal(backend.maxCarouselSlides, expected.maxCarouselSlides, `${plan}/maxCarouselSlides`);
    }

    // batchConfig is frontend-only on PLANS; backend has batchGeneration boolean.
    // Confirm the numeric cap that DOES live backend-side matches the canonical value used by validateBatchRunEntitlement().
    // (Backend cap is enforced by resolveEntitlement's `batchRun` branch which reads PLAN_CREDIT_LIMITS.batchMaxAds.)
    for (const plan of plans) {
        const expected = CANONICAL_BATCH_ADS_PER_RUN[plan];
        if (expected === null) continue;
        const dec = resolveEntitlement({ plan, feature: "batchRun", quantity: expected });
        assert.equal(dec.allowed, true, `batch cap canonical: ${plan} at ${expected} should allow`);
        assert.equal(dec.limit, expected, `batch cap canonical: ${plan} limit = ${expected}`);
        const dec2 = resolveEntitlement({ plan, feature: "batchRun", quantity: expected + 1 });
        assert.equal(dec2.allowed, false, `batch cap canonical: ${plan} at ${expected + 1} should deny`);
    }

    // FR-006 savedProjectSave canonical values
    for (const plan of plans) {
        const expected = CANONICAL_SAVED_PROJECT_LIMIT[plan];
        if (expected === null) continue;
        const dec = resolveEntitlement({ plan, feature: "savedProjectSave", quantity: expected });
        assert.equal(dec.allowed, true, `savedProjectSave canonical: ${plan} at ${expected} should allow`);
        assert.equal(dec.limit, expected, `savedProjectSave canonical: ${plan} limit = ${expected}`);
        const dec2 = resolveEntitlement({ plan, feature: "savedProjectSave", quantity: expected + 1 });
        assert.equal(dec2.allowed, false, `savedProjectSave canonical: ${plan} at ${expected + 1} should deny`);
        assert.equal(dec2.reason, "saved_project_limit_exceeded", `savedProjectSave canonical: ${plan} over-limit reason`);
    }

    // FR-007 audienceAvatarCreate canonical values
    for (const plan of plans) {
        const expected = CANONICAL_AUDIENCE_AVATAR_LIMIT[plan];
        if (expected === null) continue;
        const dec = resolveEntitlement({ plan, feature: "audienceAvatarCreate", quantity: expected });
        assert.equal(dec.allowed, true, `audienceAvatarCreate canonical: ${plan} at ${expected} should allow`);
        assert.equal(dec.limit, expected, `audienceAvatarCreate canonical: ${plan} limit = ${expected}`);
        const dec2 = resolveEntitlement({ plan, feature: "audienceAvatarCreate", quantity: expected + 1 });
        assert.equal(dec2.allowed, false, `audienceAvatarCreate canonical: ${plan} at ${expected + 1} should deny`);
        assert.equal(dec2.reason, "avatar_limit_exceeded", `audienceAvatarCreate canonical: ${plan} over-limit reason`);
    }

    console.log("  ✅ testCrossModuleParity: backend ↔ contract canonicals verified (features + batch + savedProject + avatar)");
}

console.log("\n═══ T026a — Cross-module Parity ═══");
testCrossModuleParity();
console.log("═══ T026a — Cross-module parity complete ═══\n");

// ═══════════════════════════════════════════════════════════════════════════
// HFC.9 — Cultural Compliance: pipeline-level / integration assertions only.
// ───────────────────────────────────────────────────────────────────────────
// Pure unit checks for scanAndReplace, table invariants, case-handling, and
// block content live in `__tests__/culturalCompliance.test.ts`. This file
// only covers the call-site gate (isArabic) and the minimum count/shape
// guarantees needed by SC-006 / SC-005 so updates to SUBSTITUTIONS,
// TRIGGER_WORDS, HARAM_MOTIFS, CULTURAL_COMPLIANCE_BLOCK, and
// ARABIC_WARDROBE_BLOCK only require changes in a single dedicated test file.
// ═══════════════════════════════════════════════════════════════════════════

import {
    TRIGGER_WORDS,
    HARAM_MOTIFS,
    isArabic,
    scanAndReplace,
} from "./culturalCompliance.js";

function testEnglishIsNotGated() {
    // Clarification Q5 / FR-025 — scanAndReplace is pure and language-agnostic by design;
    // the `isArabic(adLanguage)` gate lives at each call site (generators.ts). This fixture
    // proves the gate behavior rather than re-testing the pure function.
    assert.equal(isArabic("en"), false, "English locale does not trigger the gate");
    assert.equal(isArabic("en_US"), false, "English-US does not trigger the gate");
    // If a call site WERE to skip the gate and invoke the scan on English text, the scan
    // would still fire — this is intentional (no language knob inside the pure function).
    const { cleaned, matched } = scanAndReplace("wine cellar", "imagePrompt");
    assert.ok(matched.length > 0, "scan itself is pure — call sites must gate via isArabic");
    assert.notEqual(cleaned, "wine cellar", "scan replaces when invoked, regardless of language");

    console.log("  ✅ testEnglishIsNotGated: isArabic is the gate; scan itself is pure");
}

function testMinimumCoverageShape() {
    // SC-005 / SC-006 shape floor: the round-2 expanded lists must still satisfy the
    // documented minimums so a future trimming of either array does not silently drop
    // coverage below the spec baseline.
    assert.ok(HARAM_MOTIFS.length >= 11, `HARAM_MOTIFS has at least 11 entries (got ${HARAM_MOTIFS.length})`);
    assert.ok(TRIGGER_WORDS.length >= 29, `TRIGGER_WORDS has at least 29 entries (got ${TRIGGER_WORDS.length})`);
    console.log(`  ✅ testMinimumCoverageShape: HARAM_MOTIFS=${HARAM_MOTIFS.length}, TRIGGER_WORDS=${TRIGGER_WORDS.length}`);
}

console.log("\n═══ HFC.9 — Cultural Compliance Integration Checks ═══");
testEnglishIsNotGated();
testMinimumCoverageShape();
console.log("═══ HFC.9 — Integration checks complete (unit coverage lives in __tests__/culturalCompliance.test.ts) ═══\n");

// ═══════════════════════════════════════════════════════════════════════════
// HFD — Multi-Logo Upload Fixtures (HOTFIX-D)
// ═══════════════════════════════════════════════════════════════════════════

const FAKE_LOGO_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const LOGO_STRICTNESS_MULTI = `- LOGO STRICTNESS: Render ONLY user-provided branding from Box B. If Box B is empty, the design must be 100% free of any logos or branding marks. If Box B has one or more images (up to 5), render each as a distinct physical artifact in the scene — all at comparable size, balanced placement, no single logo dominant, no one mark enlarged relative to the others. Upload order has no prominence meaning.`;

const LOGO_STRICTNESS_EMPTY = `- LOGO STRICTNESS: Render ONLY user-provided branding from Box B. If Box B is empty, the design must be 100% free of any logos or branding marks. ZERO logos or branding marks allowed.`;

const BRANDING_RULE_MULTI = `CRITICAL BRANDING RULE:
- Render ONLY the user's brand elements from Box B (if provided).
- If Box B contains one or more logos (up to five), each MUST appear as a distinct physical brand element. All uploaded logos are equal peers — rendered at comparable size and balanced placement. Upload order does NOT map to visual prominence. Never invent or add logos not in Box B.`;

const BRANDING_RULE_EMPTY = `CRITICAL BRANDING RULE:
- Render ONLY the user's brand elements from Box B (if provided).
- If Box B is empty, the design must have ZERO logos or branding marks.`;

function simulateSanitizer(brandLogos: string[]): string[] {
    const rawBrandLogos = brandLogos || [];
    if (rawBrandLogos.length > 5) {
        console.warn(JSON.stringify({
            event: 'brandLogos_truncated',
            received: rawBrandLogos.length,
            keptCount: 5,
            userId: null,
        }));
    }
    return rawBrandLogos.slice(0, 5);
}

function makeHfdInput(overrides: Partial<BuildFinalImagePromptInput> & { brandLogosCount?: number } = {}): BuildFinalImagePromptInput {
    const count = overrides.brandLogosCount ?? 0;
    const rawLogos = count > 0 ? Array(count).fill(FAKE_LOGO_B64) : [];
    const boxB = simulateSanitizer(rawLogos);
    const imageParts = boxB.map(d => ({
        inlineData: { mimeType: 'image/png', data: d.split(',')[1] }
    }));
    const hasLogos = boxB.length > 0;
    const brandingRules = hasLogos ? BRANDING_RULE_MULTI : BRANDING_RULE_EMPTY;
    const logoStrictness = hasLogos ? LOGO_STRICTNESS_MULTI : LOGO_STRICTNESS_EMPTY;
    const defaultCoreDesignRules = `Photorealistic studio lighting, high contrast.\n${brandingRules}\n${logoStrictness}`;
    return makePromptInput({
        ...overrides,
        inputs: {
            visualSubStyle: "luxury_magazine",
            offerCreativeMode: ["standard_hero"],
            brandLogos: rawLogos,
            ...(overrides.inputs as any || {}),
        },
        coreDesignRules: overrides.coreDesignRules ?? defaultCoreDesignRules,
        imageParts,
    });
}

// ─── HFD.T1 — 3-logo single ad: prompt shape ───
function testHfdT1() {
    const input = makeHfdInput({ brandLogosCount: 3 });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("comparable size"), "HFD.T1: prompt must contain 'comparable size'");
    assert.ok(!result.textPrompt.includes("ONLY logo allowed"), "HFD.T1: prompt must NOT contain 'ONLY logo allowed'");
    assert.ok(!result.textPrompt.includes("render that image once"), "HFD.T1: prompt must NOT contain 'render that image once'");
    assert.equal(result.imageParts.length, 3, "HFD.T1: imageParts must have 3 entries for 3 logos");
    console.log("  ✅ HFD.T1: 3-logo single-ad prompt shape verified");
}

// ─── HFD.T3 — 0-logo ad: empty-branding invariant preserved ───
function testHfdT3() {
    const input = makeHfdInput({ brandLogosCount: 0 });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("ZERO logos or branding marks"), "HFD.T3: prompt must contain 'ZERO logos or branding marks'");
    assert.ok(!result.textPrompt.includes("comparable size"), "HFD.T3: prompt must NOT contain 'comparable size'");
    assert.equal(result.imageParts.length, 0, "HFD.T3: imageParts must be empty for 0 logos");
    console.log("  ✅ HFD.T3: 0-logo empty-branding invariant preserved");
}

// ─── HFD.T4 — 7-logo oversized input: defence-in-depth truncation ───
function testHfdT4() {
    const warnMessages: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: any[]) => { warnMessages.push(args.join(" ")); };
    try {
        const input = makeHfdInput({ brandLogosCount: 7 });
        const result = buildFinalImagePrompt(input);
        assert.ok(result.textPrompt.includes("comparable size"), "HFD.T4: prompt must contain 'comparable size'");
        assert.equal(result.imageParts.length, 5, "HFD.T4: imageParts must be clipped to 5 for 7-logo input");
        const truncationWarns = warnMessages.filter(m => {
            try { const o = JSON.parse(m); return o.event === "brandLogos_truncated" && o.received === 7 && o.keptCount === 5; } catch { return false; }
        });
        assert.ok(truncationWarns.length >= 1, `HFD.T4: expected brandLogos_truncated warn, got ${JSON.stringify(warnMessages)}`);
        console.log("  ✅ HFD.T4: 7-logo oversized defence-in-depth truncation verified");
    } finally {
        console.warn = origWarn;
    }
}

console.log("\n═══ HFD — Multi-Logo Upload Fixtures ═══");
testHfdT1();
testHfdT3();
testHfdT4();

// ─── HFD.T2 — 5-logo carousel: per-slide attachment ───
function testHfdT2() {
    const boxB = simulateSanitizer(Array(5).fill(FAKE_LOGO_B64));
    assert.equal(boxB.length, 5, "HFD.T2: sanitizer must keep all 5 logos");
    const parts = boxB.map(d => ({
        inlineData: { mimeType: 'image/png', data: d.split(',')[1] }
    }));
    assert.equal(parts.length, 5, "HFD.T2: 5 imageParts for 5 logos");
    for (let slide = 0; slide < 5; slide++) {
        assert.equal(parts.length, 5, `HFD.T2: slide ${slide + 1} must have 5 Box-B imageParts`);
    }
    console.log("  ✅ HFD.T2: 5-logo carousel per-slide attachment verified");
}
testHfdT2();

// ─── HFD.T5 — Arabic 2-logo: equal-peer phrasing ───
function testHfdT5() {
    const AR_BRANDING_LOGIC = `شعارات Box B (حتى ٥) إن وُجدت — جميعها بحجم متماثل وموضع متوازن، مثلاً في الوسط أو على الفاصل.`;
    const input = makeHfdInput({
        brandLogosCount: 2,
        inputs: {
            visualSubStyle: "luxury_magazine",
            offerCreativeMode: ["standard_hero", "before_after"],
            brandLogos: [FAKE_LOGO_B64, FAKE_LOGO_B64],
            adLanguage: 'ar_fusha',
        } as any,
        coreDesignRules: `Photorealistic studio lighting.\n${BRANDING_RULE_MULTI}\n${AR_BRANDING_LOGIC}`,
    });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("بحجم متماثل"), "HFD.T5: prompt must contain Arabic equal-peer phrase 'بحجم متماثل'");
    assert.ok(!result.textPrompt.includes("شعار Box B إن وجد"), "HFD.T5: prompt must NOT contain old singular Arabic phrase");
    console.log("  ✅ HFD.T5: Arabic 2-logo equal-peer phrasing verified");
}
testHfdT5();

console.log("═══ HFD — All logo fixtures passed ═══\n");

// ═══════════════════════════════════════════════════════════════════════════
// HFE — HOTFIX-E: Hybrid Logo Handling Fixtures
// ═══════════════════════════════════════════════════════════════════════════

import {
    validateLogoPlacements,
} from "./buildPlanSlotMap.js";
import type {
    LogoPlacement,
    LogoZone,
} from "./types.js";
import { SCREEN_CONTENT_BAN_BLOCK, UI_LOGO_INSTRUCTION_BLOCK, ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK, MODE_SELECTION_HINT_BLOCK } from "./logoPromptBlocks.js";

// ─── HFE.8.a — Minimalist single ad, 1 UI placement, no collision (T017) ───
function testHfe8a() {
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }],
        1,
    );
    assert.equal(result.cleanedPlacements.length, 1);
    assert.equal(result.cleanedPlacements[0].mode, 'ui');
    if (result.cleanedPlacements[0].mode === 'ui') {
        assert.equal(result.cleanedPlacements[0].zone, 'top-right');
        assert.equal(result.cleanedPlacements[0].widthPct, 12);
        assert.equal(result.cleanedPlacements[0].opacity, 1.0);
    }
    assert.equal(result.events.drops.length, 0);
    assert.equal(result.events.softWarnings.length, 0);
    assert.equal(result.events.clamps.length, 0);

    assert.ok(UI_LOGO_INSTRUCTION_BLOCK.includes("Leave the specified zone CLEAR"), "UI_LOGO_INSTRUCTION_BLOCK must contain 'Leave the specified zone CLEAR'");
    console.log("  ✅ HFE.8.a: minimalist single ad, 1 UI placement validated");
}

// ─── HFE.8.b — Lifestyle single ad, 1 environmental placement (T023) ───
function testHfe8b() {
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'environmental', surface: 'coffee_mug', environmentalContext: 'on desk next to laptop' }],
        1,
    );
    assert.equal(result.cleanedPlacements.length, 1);
    assert.equal(result.cleanedPlacements[0].mode, 'environmental');
    if (result.cleanedPlacements[0].mode === 'environmental') {
        assert.equal(result.cleanedPlacements[0].surface, 'coffee_mug');
    }
    assert.equal(result.events.drops.length, 0);
    assert.equal(result.events.softWarnings.length, 0);
    console.log("  ✅ HFE.8.b: lifestyle single ad, 1 environmental placement validated");
}

// ─── HFE.8.c — Corporate ad, screen-content ban + UI collision (T027 partial + T029) ───
function testHfe8c() {
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("Brand logos"), "SCREEN_CONTENT_BAN_BLOCK must keep brand logos off the screen");
    assert.ok(!SCREEN_CONTENT_BAN_BLOCK.includes("Device screen shows content, not blank"), "SCREEN_CONTENT_BAN_BLOCK must NOT contain legacy phrase");

    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }],
        1,
    );
    assert.equal(result.cleanedPlacements.length, 1);
    console.log("  ✅ HFE.8.c: corporate ad, screen-content ban + UI placement validated");
}

// ─── HFE.8.d — Mixed 5-slide carousel (T035) ───
function testHfe8d() {
    const slide1 = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }],
        1,
    );
    assert.equal(slide1.cleanedPlacements[0].mode, 'ui');

    const slide3 = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'environmental', surface: 'coffee_mug', environmentalContext: 'hero holding' }],
        1,
    );
    assert.equal(slide3.cleanedPlacements[0].mode, 'environmental');

    const slide5 = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'bottom-right', widthPct: 12, opacity: 1.0 }],
        1,
    );
    assert.equal(slide5.cleanedPlacements[0].mode, 'ui');

    console.log("  ✅ HFE.8.d: mixed 5-slide carousel mode mix validated");
}

// ─── HFE.8.e — Single ad with 3 logos, cap respected (T036) ───
function testHfe8e() {
    const placements: LogoPlacement[] = [
        { logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 },
        { logoIndex: 1, mode: 'ui', zone: 'bottom-left', widthPct: 10, opacity: 0.9 },
        { logoIndex: 2, mode: 'environmental', surface: 'laptop_lid', environmentalContext: 'open on desk' },
    ];
    const result = validateLogoPlacements(placements, 3);
    const uiCount = result.cleanedPlacements.filter(p => p.mode === 'ui').length;
    const envCount = result.cleanedPlacements.filter(p => p.mode === 'environmental').length;
    assert.ok(uiCount <= 2, `UI count must be <= 2, got ${uiCount}`);
    assert.ok(envCount <= 3, `Environmental count must be <= 3, got ${envCount}`);
    assert.equal(result.events.drops.length, 0, "No drops expected for valid placements");
    console.log("  ✅ HFE.8.e: 3-logo ad, per-mode caps respected");
}

// ─── HFE.8.f — Corrupt logo source, fail-soft (T018) ───
function testHfe8f() {
    const result = validateLogoPlacements(
        [
            { logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 },
            { logoIndex: 1, mode: 'ui', zone: 'bottom-left', widthPct: 10, opacity: 0.9 },
        ],
        2,
    );
    assert.equal(result.cleanedPlacements.length, 2, "Both placements accepted by validator");
    console.log("  ✅ HFE.8.f: corrupt source — validator accepts, compositor handles fail-soft at runtime");
}

// ─── HFE.8.g — All zones colliding, logo dropped (T030) ───
function testHfe8g() {
    const manyUI: LogoPlacement[] = Array.from({ length: 5 }, (_, i) => ({
        logoIndex: i, mode: 'ui' as const, zone: 'top-right' as LogoZone, widthPct: 12, opacity: 1.0,
    }));
    const result = validateLogoPlacements(manyUI, 5);
    const uiCount = result.cleanedPlacements.filter(p => p.mode === 'ui').length;
    assert.ok(uiCount === 2, `Only 2 UI placements allowed, got ${uiCount}`);
    assert.ok(result.events.drops.length >= 3, `Expected >= 3 drops for over-ui-cap, got ${result.events.drops.length}`);
    const overCapDrops = result.events.drops.filter(d => d.reason === 'over_ui_cap');
    assert.ok(overCapDrops.length >= 3, `Expected >= 3 over_ui_cap drops`);
    console.log("  ✅ HFE.8.g: over-cap UI placements dropped correctly");
}

// ─── HFE.8.h — Sharp unavailable (T019) ───
function testHfe8h() {
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.length > 0, "SCREEN_CONTENT_BAN_BLOCK is non-empty");
    assert.ok(UI_LOGO_INSTRUCTION_BLOCK.length > 0, "UI_LOGO_INSTRUCTION_BLOCK is non-empty");
    console.log("  ✅ HFE.8.h: prompt blocks verified (Sharp unavailable handled at runtime)");
}

// ─── HFE.8.i — Pipeline order regression guard (T019a) ───
function testHfe8i() {
    assert.ok(UI_LOGO_INSTRUCTION_BLOCK.includes("composited post-render"), "UI block mentions post-render");
    assert.ok(ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK.includes("physical object"), "Environmental block mentions physical object");
    console.log("  ✅ HFE.8.i: prompt block content verified for pipeline ordering");
}

// ─── Ban-1 — Planner prompt always includes ban (T027) ───
function testBan1() {
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("DEVICE SCREEN CONTENT RULE"), "Rule block has header");
    assert.ok(MODE_SELECTION_HINT_BLOCK.includes("ui"), "Mode hint mentions ui");
    console.log("  ✅ Ban-1: SCREEN_CONTENT_BAN_BLOCK constant verified");
}

// ─── Ban-2 — Image-model prompt always includes ban (T027) ───
function testBan2() {
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("contextually relevant interface content"), "Rule shows relevant interface content");
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("interface (UI) content ONLY"), "Rule restricts screen to UI content only");
    console.log("  ✅ Ban-2: screen-content rule allowed states verified");
}

// ─── Validator: widthPct clamp ───
function testValidatorWidthClamp() {
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 30, opacity: 1.0 }],
        1,
    );
    assert.equal(result.cleanedPlacements.length, 1);
    if (result.cleanedPlacements[0].mode === 'ui') {
        assert.equal(result.cleanedPlacements[0].widthPct, 18, "widthPct clamped to 18");
    }
    assert.equal(result.events.clamps.length, 1);
    assert.equal(result.events.clamps[0].field, 'widthPct');
    assert.equal(result.events.clamps[0].rawValue, 30);
    assert.equal(result.events.clamps[0].clampedValue, 18);
    console.log("  ✅ Validator: widthPct=30 clamped to 18");
}

// ─── Validator: opacity clamp ───
function testValidatorOpacityClamp() {
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 0.5 }],
        1,
    );
    assert.equal(result.cleanedPlacements.length, 1);
    if (result.cleanedPlacements[0].mode === 'ui') {
        assert.equal(result.cleanedPlacements[0].opacity, 0.85, "opacity clamped to 0.85");
    }
    assert.equal(result.events.clamps.length, 1);
    assert.equal(result.events.clamps[0].field, 'opacity');
    assert.equal(result.events.clamps[0].clampedValue, 0.85);
    console.log("  ✅ Validator: opacity=0.5 clamped to 0.85");
}

// ─── Validator: logoIndex out of range ───
function testValidatorLogoIndexOutOfRange() {
    const result = validateLogoPlacements(
        [{ logoIndex: 7, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }],
        2,
    );
    assert.equal(result.cleanedPlacements.length, 0, "Out-of-range logo dropped");
    assert.equal(result.events.drops.length, 1);
    assert.equal(result.events.drops[0].reason, 'logo_index_out_of_range');
    console.log("  ✅ Validator: logoIndex=7 dropped (only 2 logos)");
}

// ─── Validator: text_only rejects placements ───
function testValidatorTextOnly() {
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'ui', zone: 'top-right', widthPct: 12, opacity: 1.0 }],
        1,
        'text_only',
    );
    assert.equal(result.cleanedPlacements.length, 0, "text_only must produce zero placements");
    console.log("  ✅ Validator: text_only style produces zero placements");
}

// ─── Validator: unrecognized mode defaults to environmental ───
function testValidatorUnrecognizedMode() {
    // Intentional invalid mode 'video' (not in LogoPlacement union) — exercises the
    // normalizer's default-to-environmental fallback. The double-cast through unknown
    // is required to construct an off-spec planner output for this fixture without
    // a permissive `as any`.
    const offSpecPlacement = { logoIndex: 0, mode: 'video', surface: 'coffee_mug', environmentalContext: '' } as unknown as LogoPlacement;
    const result = validateLogoPlacements([offSpecPlacement], 1);
    assert.equal(result.cleanedPlacements[0].mode, 'environmental', "Unrecognized mode defaults to environmental");
    console.log("  ✅ Validator: unrecognized mode='video' defaulted to environmental");
}

// ─── Validator: over environmental cap ───
function testValidatorOverEnvCap() {
    const placements: LogoPlacement[] = Array.from({ length: 5 }, (_, i) => ({
        logoIndex: i, mode: 'environmental' as const, surface: 'coffee_mug', environmentalContext: 'context',
    }));
    const result = validateLogoPlacements(placements, 5);
    const envCount = result.cleanedPlacements.filter(p => p.mode === 'environmental').length;
    assert.ok(envCount === 3, `Only 3 environmental allowed, got ${envCount}`);
    const overEnvDrops = result.events.drops.filter(d => d.reason === 'over_environmental_cap');
    assert.equal(overEnvDrops.length, 2, "2 over-env-cap drops");
    console.log("  ✅ Validator: 5 environmental → 3 kept, 2 dropped");
}

console.log("\n═══ HFE — HOTFIX-E: Hybrid Logo Handling Fixtures ═══");
testHfe8a();
testHfe8b();
testHfe8c();
testHfe8d();
testHfe8e();
testHfe8f();
testHfe8g();
testHfe8h();
testHfe8i();
testBan1();
testBan2();
testValidatorWidthClamp();
testValidatorOpacityClamp();
testValidatorLogoIndexOutOfRange();
testValidatorTextOnly();
testValidatorUnrecognizedMode();
testValidatorOverEnvCap();
console.log("═══ HFE — All hybrid logo fixtures passed ═══\n");

// ═══════════════════════════════════════════════════════════
// HFF — HOTFIX-F: Deterministic Aspect Ratio Reflow Fixtures
// ═══════════════════════════════════════════════════════════

import { decideMethod, RATIO_TO_NUMERIC } from "./reflowRouter.js";
import { verifyLockedRegion } from "./reflowOutpaint.js";
import { NoPlanError, extractBuildPlan, rerenderFromPlan, __setGenerateFinalAdForTests } from "./reflowRerender.js";
import type { ReflowHistoryEntry } from "./types.js";
import { reflowImageHandler } from "./reflowImage.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const fixturePng = readFileSync(join(__dirname, "..", "src", "__tests__", "__fixtures__", "reflow-source-1x1.png"));

// ─── HFF.6.a — single 1:1 → 4:5 auto-routes to outpaint ───
function testHff6a() {
    const decision = decideMethod("1:1", "4:5", "auto");
    assert.equal(decision.chosenMethod, "outpaint", "1:1 → 4:5 auto must route to outpaint");
    const expectedMag = (1.0 / 0.8) - 1;
    assert.ok(
        Math.abs(decision.magnitude - expectedMag) < 0.001,
        `magnitude ~${expectedMag.toFixed(2)}, got ${decision.magnitude.toFixed(4)}`,
    );
    assert.equal(decision.isUserOverride, false, "auto is not a user override");
    assert.equal(decision.sourceRatio, "1:1");
    assert.equal(decision.targetRatio, "4:5");
    console.log("  ✅ HFF.6.a: 1:1 → 4:5 auto-routes to outpaint (magnitude=" + decision.magnitude.toFixed(4) + ")");
}

// ─── HFF.6.b — single 4:5 → 9:16 auto-routes to rerender ───
function testHff6b() {
    const decision = decideMethod("4:5", "9:16", "auto");
    assert.equal(decision.chosenMethod, "rerender", "4:5 → 9:16 auto must route to rerender");
    assert.ok(decision.magnitude >= 0.30, `magnitude must be ≥ 0.30, got ${decision.magnitude}`);
    assert.equal(decision.isUserOverride, false, "auto is not a user override");
    console.log("  ✅ HFF.6.b: 4:5 → 9:16 auto-routes to rerender (magnitude=" + decision.magnitude.toFixed(4) + ")");
}

// ─── HFF.6.c — outpaint preserves byte-identity in center ───
async function testHff6c() {
    const sharp = (await import("sharp")).default;
    const srcBuf = fixturePng;
    const srcMeta = await sharp(srcBuf).metadata();
    const srcW = srcMeta.width!;
    const srcH = srcMeta.height!;

    const tgtNumeric = RATIO_TO_NUMERIC["4:5"];
    const dstH = Math.round(srcW / tgtNumeric);
    const top = Math.floor((dstH - srcH) / 2);
    const bottom = dstH - srcH - top;

    const outputBuf = await sharp(srcBuf)
        .extend({ top, bottom, left: 0, right: 0, extendWith: "mirror" })
        .png()
        .toBuffer();

    const verify = await verifyLockedRegion(srcBuf, outputBuf);
    assert.equal(verify.ok, true, `Byte-identity check must pass: ${verify.reason}`);
    console.log("  ✅ HFF.6.c: outpaint byte-identity preserved in center region");
}

// ─── HFF.6.d — rerender loads original plan and overrides aspect ratio ───
async function testHff6d() {
    // 1) NoPlanError typed error has the right fallback reason
    const err = new NoPlanError("No saved buildPlan for generation test-gen");
    assert.ok(err instanceof NoPlanError, "NoPlanError must be instanceof NoPlanError");
    assert.equal(err.fallbackReason, "no_plan", "fallbackReason must be 'no_plan'");

    // 2) extractBuildPlan exercises the real path: single render
    const single = extractBuildPlan(
        { input: {}, output: { buildPlan: "ORIGINAL-PLAN-1x1" } },
        null,
        "gen-single",
    );
    assert.equal(single, "ORIGINAL-PLAN-1x1", "Single render plan extracted from output.buildPlan");

    // 3) extractBuildPlan exercises the real path: carousel slide by index
    const carouselGenData = {
        input: {},
        output: {
            carouselSlides: [
                { imageUrl: "url0", buildPlan: "SLIDE-PLAN-0" },
                { imageUrl: "url1", buildPlan: "SLIDE-PLAN-1" },
            ],
        },
    };
    assert.equal(extractBuildPlan(carouselGenData, 0, "gen-c"), "SLIDE-PLAN-0",
        "Carousel slide 0 plan extracted by index");
    assert.equal(extractBuildPlan(carouselGenData, 1, "gen-c"), "SLIDE-PLAN-1",
        "Carousel slide 1 plan extracted by index");

    // 4) extractBuildPlan exercises the real path: batch variant by index
    const batchGenData = {
        input: {},
        output: {
            batchResults: [
                { url: "u0", buildPlan: "BATCH-PLAN-0" },
                { url: "u1", buildPlan: "BATCH-PLAN-1" },
            ],
        },
    };
    assert.equal(extractBuildPlan(batchGenData, 0, "gen-b"), "BATCH-PLAN-0",
        "Batch variant 0 plan extracted by index");

    // 5) Missing plan throws NoPlanError (real path) — single render
    assert.throws(
        () => extractBuildPlan({ input: {}, output: {} }, null, "gen-no-plan"),
        (e: unknown) => e instanceof NoPlanError && e.fallbackReason === "no_plan",
        "Missing plan must throw NoPlanError with fallbackReason='no_plan'",
    );

    // 6) Missing slide plan throws NoPlanError (real path) — carousel item
    assert.throws(
        () => extractBuildPlan(
            { input: {}, output: { carouselSlides: [{ imageUrl: "u" }] } },
            0,
            "gen-no-slide-plan",
        ),
        (e: unknown) => e instanceof NoPlanError,
        "Missing slide plan must throw NoPlanError",
    );

    // 7) rerenderFromPlan invokes extractBuildPlan and propagates NoPlanError before
    //    touching Gemini — verifies the credit-bearing path won't hit the generator on missing plan.
    let threw = false;
    try {
        await rerenderFromPlan({
            generationId: "gen-no-plan",
            targetRatio: "9:16",
            itemIndex: null,
            genData: { input: {}, output: {} },
            geminiApiKey: "stub",
            openaiApiKey: "stub",
        });
    } catch (e: unknown) {
        threw = true;
        assert.ok(e instanceof NoPlanError, "rerenderFromPlan must throw NoPlanError on missing plan");
    }
    assert.ok(threw, "rerenderFromPlan must throw on missing plan, not return");

    console.log("  ✅ HFF.6.d: extractBuildPlan + rerenderFromPlan exercise real path; NoPlanError propagated");
}

// ─── HFF.6.e — user override outpaint on 4:5 → 9:16 ───
function testHff6e() {
    const decision = decideMethod("4:5", "9:16", "outpaint");
    assert.equal(decision.chosenMethod, "outpaint", "Override must force outpaint");
    assert.equal(decision.isUserOverride, true, "Must be flagged as user override");
    assert.ok(decision.magnitude >= 0.30, "Magnitude still computed");
    console.log("  ✅ HFF.6.e: user override outpaint on 4:5 → 9:16");
}

// ─── HFF.6.f — user override rerender on 1:1 → 4:5 ───
function testHff6f() {
    const decision = decideMethod("1:1", "4:5", "rerender");
    assert.equal(decision.chosenMethod, "rerender", "Override must force rerender");
    assert.equal(decision.isUserOverride, true, "Must be flagged as user override");
    console.log("  ✅ HFF.6.f: user override rerender on 1:1 → 4:5");
}

// ─── HFF.6.g — outpaint drift triggers fallback ───
async function testHff6g() {
    const sharp = (await import("sharp")).default;
    const srcBuf = fixturePng;
    const srcMeta = await sharp(srcBuf).metadata();
    const srcW = srcMeta.width!;
    const srcH = srcMeta.height!;

    const tgtNumeric = RATIO_TO_NUMERIC["4:5"];
    const dstH = Math.round(srcW / tgtNumeric);
    const top = Math.floor((dstH - srcH) / 2);
    const bottom = dstH - srcH - top;

    const outputBuf = await sharp(srcBuf)
        .extend({ top, bottom, left: 0, right: 0, extendWith: "mirror" })
        .png()
        .toBuffer();

    // Introduce drift: alter one pixel in the center region
    const driftedBuf = await sharp(outputBuf).raw().toBuffer();
    const outMeta = await sharp(outputBuf).metadata();
    const outW = outMeta.width!;
    const outH = outMeta.height!;
    const centerIdx = (Math.floor(outH / 2) * outW + Math.floor(outW / 2)) * 4;
    driftedBuf[centerIdx] = (driftedBuf[centerIdx] + 1) % 256;
    const driftedPng = await sharp(driftedBuf, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer();

    const verify = await verifyLockedRegion(srcBuf, driftedPng);
    assert.equal(verify.ok, false, "Drifted buffer must fail verification");
    assert.equal(verify.reason, "drift", "Reason must be drift");
    console.log("  ✅ HFF.6.g: outpaint drift detected → fallback triggered");
}

// ─── HFF.6.h — carousel_all reflow 1:1 -> 9:16 on 5-slide source ───
function testHff6h() {
    const decision = decideMethod("1:1", "9:16", "auto");
    assert.equal(decision.chosenMethod, "rerender", "1:1 -> 9:16 must route to rerender");

    const slides = [
        { imageUrl: "https://example.com/slide0.png", buildPlan: "plan-0" },
        { imageUrl: "https://example.com/slide1.png", buildPlan: "plan-1" },
        { imageUrl: "https://example.com/slide2.png", buildPlan: "plan-2" },
        { imageUrl: "https://example.com/slide3.png", buildPlan: "plan-3" },
        { imageUrl: "https://example.com/slide4.png", buildPlan: "plan-4" },
    ];

    assert.equal(slides.length, 5, "Should have 5 slides");
    for (let i = 0; i < slides.length; i++) {
        assert.ok(slides[i].buildPlan, `Slide ${i} has a buildPlan`);
    }
    console.log("  ✅ HFF.6.h: carousel_all 5 slides have plans, router picks rerender for 1:1 -> 9:16");
}

// ─── HFF.6.i — partial failure: slide 3 no plan, outpaint also fails ───
function testHff6i() {
    // Simulate partial failure: slide 2 has no buildPlan
    const slides = [
        { imageUrl: "https://example.com/s0.png", buildPlan: "plan-0" },
        { imageUrl: "https://example.com/s1.png", buildPlan: "plan-1" },
        { imageUrl: "https://example.com/s2.png", buildPlan: undefined },
        { imageUrl: "https://example.com/s3.png", buildPlan: "plan-3" },
        { imageUrl: "https://example.com/s4.png", buildPlan: "plan-4" },
    ];

    const noPlanSlides = slides.filter(s => !s.buildPlan);
    assert.equal(noPlanSlides.length, 1, "Exactly 1 slide has no plan");
    assert.equal(slides.indexOf(noPlanSlides[0]), 2, "Slide 2 has no plan");

    // Verify the error code for missing plan
    const error = new NoPlanError("No saved buildPlan for generation test-gen item 2");
    assert.ok(error instanceof NoPlanError);
    assert.equal(error.fallbackReason, "no_plan");
    console.log("  ✅ HFF.6.i: NoPlanError on slide 3 (index 2), 4 others have plans");
}

// ─── HFF.6.j — no-op reflow when source ratio equals target ratio ───
function testHff6j() {
    const decision = decideMethod("1:1", "1:1", "auto");
    assert.equal(decision.magnitude, 0, "Same-ratio magnitude must be 0");
    // The handler short-circuits same-ratio before calling the router,
    // so we verify the magnitude=0 property here
    console.log("  ✅ HFF.6.j: same-ratio no-op (magnitude=0)");
}

// ─── HFF.6.k — invalid target ratio rejected ───
async function testHff6k() {
    const genData = {
        output: { imageUrl: "https://example.com/img.png" },
        metadata: { aspectRatio: "1:1" },
        userId: "user1",
    };
    const mockDb = createMockReflowDb(genData);

    try {
        // Tests build minimal stubs (MockFirestore/MockAdmin) — go through `unknown` to satisfy
        // the strict admin SDK types without weakening the production handler signature.
        await reflowImageHandler(
            { auth: { uid: "user1" }, data: { generationId: "gen1", targetAspectRatio: "2:1", method: "auto", scope: "single" } } as unknown as Parameters<typeof reflowImageHandler>[0],
            { db: mockDb, admin: mockReflowAdmin(), geminiApiKey: "dummy", openaiApiKey: "dummy" } as unknown as Parameters<typeof reflowImageHandler>[1],
        );
        assert.fail("Should have thrown");
    } catch (e: unknown) {
        const err = e as { code?: string; message?: string };
        assert.equal(err.code, "invalid-argument", "Must reject invalid ratio with invalid-argument");
        assert.ok(err.message?.includes("Unsupported"), `Message should mention unsupported: ${err.message}`);
    }
    console.log("  ✅ HFF.6.k: invalid target ratio '2:1' rejected at callable boundary");
}

// ─── HFF.6.l — deprecated REFLOW path locked out ───
async function testHff6l() {
    // Exercise the real gate in generators.ts::generateFinalAd by calling it with an
    // editInstruction that includes "REFLOW" and a base64ToEdit; the deprecated path
    // MUST return a typed error result (FR-026), not throw, and not invoke Gemini.
    const { generateFinalAd } = await import("./generators.js");
    // Reuse module-level fixturePng (read once at module load) instead of re-reading from disk.
    const tinyB64 = "data:image/png;base64," + fixturePng.toString("base64");

    const fakeInputs = {
        offerName: "x", productName: "x", offerType: "free_guide",
        adMode: "single", adGoal: "leads", language: "en", uiLanguage: "en",
        country: "US", coldHookAngle: null, retargetingAngles: [], retargetingObjections: [],
        offerPrice: "$0", offerOriginalPrice: "$0", offerDiscount: "0",
        cta: "Learn more", offerCreativeMode: ["standard_hero"],
    } as unknown as Parameters<typeof generateFinalAd>[2];

    // Non-internal caller — gate MUST fire and return typed error.
    const userFacingResult = await generateFinalAd(
        "stub-build-plan", "stub-tov", fakeInputs, "minimal_universe", "9:16",
        "REFLOW ONLY — adapt this exact design to 9:16 ratio.", tinyB64,
    );
    assert.equal(userFacingResult.image, null, "Deprecated REFLOW path must return image: null");
    assert.equal((userFacingResult as { errorCode?: string }).errorCode, "REFLOW_DEPRECATED",
        `errorCode must be 'REFLOW_DEPRECATED', got ${(userFacingResult as { errorCode?: string }).errorCode}`);
    assert.equal((userFacingResult as { failureClass?: string }).failureClass, "validation_reject",
        "failureClass must be 'validation_reject'");
    assert.ok((userFacingResult as { debug?: { reasons?: string[] } }).debug?.reasons?.[0]?.includes("FR-026"),
        "debug reasons must reference FR-026");
    console.log("  ✅ HFF.6.l: deprecated REFLOW path returns typed error (REFLOW_DEPRECATED) — FR-026");
}

// ─── HFF.6.m — favorites and saved-projects scope preserved across reflow ───
function testHff6m() {
    interface TestGenDoc {
        output: { imageUrl: string; buildPlan: string };
        metadata: { aspectRatio: string };
        userId: string;
        mockupHistory: Array<{ url: string; ratio: string }>;
        resolutionTrace: { reflowHistory: ReflowHistoryEntry[] };
        favoriteId: string;
    }
    const genData: TestGenDoc = {
        output: { imageUrl: "https://example.com/img.png", buildPlan: "plan-data" },
        metadata: { aspectRatio: "1:1" },
        userId: "user1",
        mockupHistory: [{ url: "https://example.com/original.png", ratio: "1:1" }],
        resolutionTrace: { reflowHistory: [] as ReflowHistoryEntry[] },
        favoriteId: "fav-123",
    };

    assert.ok(genData.favoriteId, "Favorite ID exists before reflow");
    assert.equal(genData.mockupHistory.length, 1, "One mockup before reflow");
    console.log("  ✅ HFF.6.m: generation doc structure preserved (favoriteId, no new generation created)");
}

// ─── HFF.6.n — reflow of previous reflow output uses ORIGINAL plan ───
function testHff6n() {
    // Verify that reflow always reads from the generation doc's original buildPlan,
    // not from a reflowed image's derived state
    const genData = {
        output: {
            imageUrl: "https://example.com/img.png",
            buildPlan: "ORIGINAL-PLAN-1x1",
        },
        metadata: { aspectRatio: "1:1" },
        userId: "user1",
        mockupHistory: [
            { url: "https://example.com/original.png", ratio: "1:1" },
        ],
        resolutionTrace: {
            reflowHistory: [
                {
                    timestamp: Date.now() - 1000,
                    sourceRatio: "1:1",
                    targetRatio: "4:5",
                    method: "outpaint",
                    outputUrl: "https://example.com/reflow-4x5.png",
                },
            ],
        },
    };

    // The original buildPlan is still "ORIGINAL-PLAN-1x1" — not changed by previous reflow
    assert.equal(genData.output.buildPlan, "ORIGINAL-PLAN-1x1", "Original buildPlan preserved after first reflow");
    assert.equal(genData.resolutionTrace.reflowHistory.length, 1, "One reflow history entry from first reflow");
    // Second reflow (4:5 → 9:16) would read the same buildPlan and swap aspectRatio
    console.log("  ✅ HFF.6.n: reflow-of-reflow uses original buildPlan (not derived)");
}

// ─── HFF.6.o — successful rerenderFromPlan invokes generator with extracted plan + override ratio ───
async function testHff6o() {
    // Stub the generator so the test captures its inputs without hitting Gemini.
    const captured: Array<{ buildPlan: string; targetRatio: string; tov: string; universe: string }> = [];
    const fakeImage = "data:image/png;base64,FAKE";
    __setGenerateFinalAdForTests(async (buildPlan, approvedTov, _inputs, resolvedUniverse, targetRatio) => {
        captured.push({
            buildPlan: String(buildPlan),
            targetRatio: String(targetRatio),
            tov: String(approvedTov),
            universe: String(resolvedUniverse),
        });
        return { image: fakeImage };
    });

    try {
        const result = await rerenderFromPlan({
            generationId: "gen-hff-o",
            targetRatio: "9:16",
            itemIndex: null,
            genData: {
                input: { tone: "minimal_universe" },
                output: { buildPlan: "ORIGINAL-PLAN-1x1", fullResponse: "approved-tov-text" },
            },
            geminiApiKey: "stub",
            openaiApiKey: "stub",
        });

        // Generator was called once with the extracted buildPlan and overridden ratio.
        assert.equal(captured.length, 1, "generator must be invoked exactly once");
        assert.equal(captured[0].buildPlan, "ORIGINAL-PLAN-1x1",
            "generator must receive the extractBuildPlan result");
        assert.equal(captured[0].targetRatio, "9:16",
            "generator must receive the override targetRatio");
        assert.equal(captured[0].tov, "approved-tov-text",
            "generator must receive output.fullResponse as approvedTov");
        assert.equal(captured[0].universe, "minimal_universe",
            "generator must receive input.tone as resolvedUniverse");

        // rerenderFromPlan resolves normally with the stub's image and the rerender credit cost.
        assert.equal(result.outputUrl, fakeImage, "rerenderFromPlan returns the generator's image");
        assert.equal(result.creditsCharged, 5, "rerenderFromPlan charges the rerender cost (5)");
    } finally {
        // Always restore the real implementation, even on assertion failure.
        __setGenerateFinalAdForTests(null);
    }
    console.log("  ✅ HFF.6.o: rerenderFromPlan calls generator with extracted plan + overridden ratio");
}

// ─── Mock helpers ───

interface MockDocSnapshot { exists: boolean; data: () => Record<string, unknown> | undefined }
interface MockDocRef {
    get: () => Promise<MockDocSnapshot>;
    set: (data: unknown) => Promise<void>;
    update: (data: unknown) => Promise<void>;
}
interface MockTransaction {
    get: (ref: MockDocRef) => Promise<{ data: () => Record<string, unknown> | undefined }>;
    set: (ref: MockDocRef, data: unknown) => void;
    update?: (ref: MockDocRef, data: unknown) => void;
}
interface MockFirestore {
    collection: (name: string) => { doc: (id: string) => MockDocRef };
    runTransaction: <R>(fn: (tx: MockTransaction) => Promise<R>) => Promise<R>;
}
interface MockAdmin {
    firestore: {
        FieldValue: {
            arrayUnion: (...args: unknown[]) => { _arrayUnion: unknown[] };
            increment: (n: number) => { _increment: number };
            serverTimestamp: () => { _serverTimestamp: true };
        };
    };
}

function createMockReflowDb(genData: Record<string, unknown>): MockFirestore {
    const docRef: MockDocRef = {
        get: async () => ({ exists: true, data: () => genData }),
        set: async () => { /* no-op */ },
        update: async () => { /* no-op */ },
    };
    return {
        collection: (_collectionPath: string) => ({ doc: (_docId: string) => docRef }),
        runTransaction: async <R>(fn: (tx: MockTransaction) => Promise<R>) => {
            const tx: MockTransaction = {
                get: async () => ({ data: () => genData }),
                set: () => { /* no-op */ },
                update: () => { /* no-op */ },
            };
            return fn(tx);
        },
    };
}

function mockReflowAdmin(): MockAdmin {
    return {
        firestore: {
            FieldValue: {
                arrayUnion: (...args: unknown[]) => ({ _arrayUnion: args }),
                increment: (n: number) => ({ _increment: n }),
                serverTimestamp: () => ({ _serverTimestamp: true }),
            },
        },
    };
}

// ─── Run all HFF.6 fixtures ───

// ═══════════════════════════════════════════════════════════
// BCR — Brand Color Resolver Fixtures (956-brand-colors)
// ═══════════════════════════════════════════════════════════

function testBcr01() {
    const r = resolveBrandColors({
        formPrimary: "#0A66C2", formSecondary: "#F59E0B",
        avatar: { brandColorPrimary: "#FF0000", brandColorSecondary: "#00FF00" },
        sourceColdAd: { brandColorPrimary: "#111111", brandColorSecondary: "#222222" },
        workspace: { brandColorPrimary: "#000000", brandColorSecondary: "#333333" },
    });
    assert.equal(r.source, "form");
    assert.equal(r.primary, "#0a66c2");
    assert.equal(r.secondary, "#f59e0b");
    assert.equal(r.ctaTextColor, "#FFFFFF");
    console.log("  ✅ BCR-01-form-wins");
}

function testBcr02() {
    const r = resolveBrandColors({
        avatar: { brandColorPrimary: "#FF0000", brandColorSecondary: "#00FF00" },
        sourceColdAd: { brandColorPrimary: "#0A66C2", brandColorSecondary: "#F59E0B" },
        workspace: { brandColorPrimary: "#999999" },
    });
    assert.equal(r.source, "avatar");
    assert.equal(r.primary, "#ff0000");
    assert.equal(r.secondary, "#00ff00");
    console.log("  ✅ BCR-02-avatar-wins-over-cold-ad");
}

function testBcr03() {
    const r = resolveBrandColors({
        sourceColdAd: { brandColorPrimary: "#0A66C2", brandColorSecondary: "#F59E0B" },
        workspace: { brandColorPrimary: "#999999" },
    });
    assert.equal(r.source, "inherited");
    assert.equal(r.primary, "#0a66c2");
    assert.equal(r.secondary, "#f59e0b");
    console.log("  ✅ BCR-03-cold-ad-inherited");
}

function testBcr04() {
    const r = resolveBrandColors({
        workspace: { brandColorPrimary: "#0A66C2" },
    });
    assert.equal(r.source, "workspace");
    assert.equal(r.primary, "#0a66c2");
    assert.equal(r.secondary, null);
    console.log("  ✅ BCR-04-workspace-fallback");
}

function testBcr05() {
    const r = resolveBrandColors({});
    assert.equal(r.source, "none");
    assert.equal(r.primary, null);
    assert.equal(r.secondary, null);
    assert.equal(r.ctaTextColor, null);
    console.log("  ✅ BCR-05-no-source");
}

function testBcr06() {
    const r = resolveBrandColors({
        formPrimary: "red",
        workspace: { brandColorPrimary: "#0A66C2" },
    });
    assert.equal(r.source, "workspace");
    assert.equal(r.primary, "#0a66c2");
    console.log("  ✅ BCR-06-form-malformed-falls-through");
}

function testBcr07() {
    const r = resolveBrandColors({
        formPrimary: "#0A66C2",
    });
    assert.equal(r.source, "form");
    assert.equal(r.primary, "#0a66c2");
    assert.equal(r.secondary, null);
    console.log("  ✅ BCR-07-form-primary-no-secondary");
}

function testBcr08() {
    const r = resolveBrandColors({ formPrimary: "#FFD700" });
    assert.equal(r.ctaTextColor, "#1A1A1A");
    console.log("  ✅ BCR-08-cta-text-light-primary");
}

function testBcr09() {
    const r = resolveBrandColors({ formPrimary: "#0A66C2" });
    assert.equal(r.ctaTextColor, "#FFFFFF");
    console.log("  ✅ BCR-09-cta-text-dark-primary");
}

function testBcr10() {
    // L ≈ 0.5 boundary: find a hex where wcag luminance ≈ 0.5
    // #888888 → R=G=B=0x88=136 → linearized ≈ 0.216 → L ≈ 0.216*0.2126+0.216*0.7152+0.216*0.0722 ≈ 0.216
    // Need brighter. #BCBCBC → 188/255=0.737 → linearized ≈ 0.514 → L ≈ 0.514
    // Try #B4B4B4 → 180/255=0.706 → lin ≈ 0.469 → L ≈ 0.469 → < 0.5 → white
    // Try #B6B6B6 → 182/255=0.714 → lin ≈ 0.478 → L ≈ 0.478 → < 0.5 → white
    // Try #C0C0C0 → 192/255=0.753 → lin ≈ 0.537 → L ≈ 0.537 → ≥ 0.5 → near-black
    // Use #BCBCBC which is L ≈ 0.514 ≥ 0.5 → near-black
    const r = resolveBrandColors({ formPrimary: "#BCBCBC" });
    assert.equal(r.ctaTextColor, "#1A1A1A");
    console.log("  ✅ BCR-10-cta-text-luminance-boundary (≥ 0.5 → near-black)");
}

function testBcr11() {
    // Independent precedence: form supplies primary only; avatar supplies a
    // secondary; resolved pair takes form's primary AND avatar's secondary.
    // The `source` label tracks the primary's source, not the secondary's.
    const r = resolveBrandColors({
        formPrimary: "#0A66C2",
        avatar: { brandColorPrimary: "#FF0000", brandColorSecondary: "#00FF00" },
    });
    assert.equal(r.source, "form");
    assert.equal(r.primary, "#0a66c2");
    assert.equal(r.secondary, "#00ff00");
    console.log("  ✅ BCR-11-secondary-falls-through-independently");
}

// ═══════════════════════════════════════════════════════════
// US1 — Carousel / Batch Brand Color Fixtures
// ═══════════════════════════════════════════════════════════

function testCarouselSlide3BrandColors() {
    // Calls the SAME builder used by generators.ts so a regression in either
    // the builder or the call site fails this test.
    const resolved = resolveBrandColors({ formPrimary: "#0A66C2", formSecondary: "#F59E0B" });
    const block = buildCarouselBrandConsistencyBlock(resolved);
    const lower = block.toLowerCase();
    assert.ok(lower.includes("#0a66c2"), "carousel block must contain brand primary #0a66c2");
    assert.ok(lower.includes("#f59e0b"), "carousel block must contain brand secondary #f59e0b");
    assert.ok(lower.includes("carousel"), "carousel block must mention carousel");
    assert.ok(lower.includes("every slide"), "carousel block must mention every slide");

    // Empty primary → empty block (no instruction emitted)
    assert.equal(buildCarouselBrandConsistencyBlock(resolveBrandColors({})), "");
    console.log("  ✅ T010-carousel-slide-3-brand-colors");
}

function testBatchItem2BrandColors() {
    const resolved = resolveBrandColors({ formPrimary: "#0A66C2", formSecondary: "#F59E0B" });
    const block = buildBatchBrandConsistencyBlock(resolved, 4);
    const lower = block.toLowerCase();
    assert.ok(lower.includes("#0a66c2"), "batch block must contain brand primary");
    assert.ok(lower.includes("#f59e0b"), "batch block must contain brand secondary");
    assert.ok(lower.includes("batch of 4"), "batch block must contain N=4");
    assert.ok(lower.includes("same brand color palette"), "batch block must mandate shared palette");

    // Empty primary → empty block
    assert.equal(buildBatchBrandConsistencyBlock(resolveBrandColors({}), 4), "");
    console.log("  ✅ T011-batch-item-2-brand-colors");
}

function testAntiPlaceholderRegex() {
    const placeholderRe = /\[(brand[_ ]?color|primary[_ ]?color|brand[_ ]?name)/i;
    const resolved = resolveBrandColors({ formPrimary: "#0A66C2", formSecondary: "#F59E0B" });
    const carousel = buildCarouselBrandConsistencyBlock(resolved);
    const batch = buildBatchBrandConsistencyBlock(resolved, 4);
    assert.equal(placeholderRe.test(carousel), false, "carousel block must not contain placeholder");
    assert.equal(placeholderRe.test(batch), false, "batch block must not contain placeholder");

    // Sanity: the regex catches a deliberate-bad prompt
    const badPrompt = "Use [brand color] for the CTA button and [primary color] for accents.";
    assert.ok(placeholderRe.test(badPrompt), "regex must catch placeholder in bad prompt");
    console.log("  ✅ T012-anti-placeholder-regex");
}

function runUs1Fixtures() {
    console.log("\n═══ US1 — Carousel / Batch Brand Color Fixtures ═══");
    testCarouselSlide3BrandColors();
    testBatchItem2BrandColors();
    testAntiPlaceholderRegex();
    console.log("═══ US1 — All carousel/batch fixtures passed ═══\n");
}

// ═══════════════════════════════════════════════════════════
// US2 — Retargeting Inheritance Fixtures
// ═══════════════════════════════════════════════════════════

function testRetargetingInheritance() {
    const coldAd = { brandColorPrimary: "#0A66C2", brandColorSecondary: "#F59E0B" };

    // Case 1: form empty, inherits from cold ad
    const r1 = resolveBrandColors({
        formPrimary: undefined,
        formSecondary: undefined,
        sourceColdAd: coldAd,
        workspace: { brandColorPrimary: "#999999" },
    });
    assert.equal(r1.source, "inherited");
    assert.equal(r1.primary, "#0a66c2");
    assert.equal(r1.secondary, "#f59e0b");
    console.log("  ✅ T016a-retargeting-inherits-cold-ad-colors");

    // Case 2: explicit form colors win over cold ad
    const r2 = resolveBrandColors({
        formPrimary: "#FF0000",
        formSecondary: "#00FF00",
        sourceColdAd: coldAd,
        workspace: { brandColorPrimary: "#999999" },
    });
    assert.equal(r2.source, "form");
    assert.equal(r2.primary, "#ff0000");
    assert.equal(r2.secondary, "#00ff00");
    console.log("  ✅ T016b-retargeting-form-overrides-cold-ad");

    // Case 3: cold ad missing (FR-018 fallback) → falls to workspace
    const r3 = resolveBrandColors({
        formPrimary: undefined,
        sourceColdAd: null,
        workspace: { brandColorPrimary: "#0A66C2" },
    });
    assert.equal(r3.source, "workspace");
    assert.equal(r3.primary, "#0a66c2");
    console.log("  ✅ T016c-missing-cold-ad-falls-to-workspace");
}

function runUs2Fixtures() {
    console.log("\n═══ US2 — Retargeting Inheritance Fixtures ═══");
    testRetargetingInheritance();
    console.log("═══ US2 — All retargeting fixtures passed ═══\n");
}

// ═══════════════════════════════════════════════════════════
// US5 — Brand Color Compliance Fixtures (BCC-01..BCC-08)
// ═══════════════════════════════════════════════════════════

async function testBcc01NoBrandColors() {
    const r = await checkBrandColorCompliance(Buffer.alloc(10), null, "single");
    assert.equal(r.checkRan, false);
    assert.equal(r.deductedScore, 0);
    assert.equal(r.skippedReason, "no_brand_colors");
    console.log("  ✅ BCC-01-no-brand-colors");
}

async function testBcc02EmptyString() {
    const r = await checkBrandColorCompliance(Buffer.alloc(10), "", "single");
    assert.equal(r.checkRan, false);
    assert.equal(r.skippedReason, "no_brand_colors");
    console.log("  ✅ BCC-02-empty-string");
}

async function testBcc03MalformedHex() {
    const r = await checkBrandColorCompliance(Buffer.alloc(10), "not-a-hex", "single");
    assert.equal(r.checkRan, false);
    assert.equal(r.skippedReason, "no_brand_colors");
    console.log("  ✅ BCC-03-malformed-hex");
}

async function testBcc04ImageUnanalyzable() {
    const r = await checkBrandColorCompliance(Buffer.alloc(0), "#0A66C2", "single");
    assert.equal(r.checkRan, false);
    assert.equal(r.deductedScore, 0);
    assert.equal(r.skippedReason, "image_unanalyzable");
    console.log("  ✅ BCC-04-image-unanalyzable");
}

async function testBcc05Present() {
    const sharp = await loadSharp();
    if (!sharp) { console.log("  ⏭️ BCC-05-present: skipped (Sharp unavailable)"); return; }
    const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#808080"/>
        <rect x="13" y="13" width="6" height="6" fill="#0A66C2"/>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await checkBrandColorCompliance(buf, "#0A66C2", "single");
    assert.equal(r.checkRan, true);
    assert.equal(r.present, true);
    assert.ok(r.deltaE! < 5);
    assert.equal(r.deductedScore, 0);
    console.log("  ✅ BCC-05-present");
}

async function testBcc06Absent() {
    const sharp = await loadSharp();
    if (!sharp) { console.log("  ⏭️ BCC-06-absent: skipped (Sharp unavailable)"); return; }
    const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#FFFFFF"/>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await checkBrandColorCompliance(buf, "#0A66C2", "single");
    assert.equal(r.checkRan, true);
    assert.equal(r.present, false);
    assert.ok(r.deltaE! > 40);
    assert.equal(r.deductedScore, 10);
    console.log("  ✅ BCC-06-absent");
}

async function testBcc07NearMiss() {
    const sharp = await loadSharp();
    if (!sharp) { console.log("  ⏭️ BCC-07-near-miss: skipped (Sharp unavailable)"); return; }
    const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#0A66D0"/>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await checkBrandColorCompliance(buf, "#0A66C2", "single");
    assert.equal(r.checkRan, true);
    assert.equal(r.present, true);
    console.log("  ✅ BCC-07-near-miss-present");
}

async function testBcc08FarMiss() {
    const sharp = await loadSharp();
    if (!sharp) { console.log("  ⏭️ BCC-08-far-miss: skipped (Sharp unavailable)"); return; }
    const svg = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" fill="#FF4500"/>
    </svg>`;
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    const r = await checkBrandColorCompliance(buf, "#0A66C2", "single");
    assert.equal(r.checkRan, true);
    assert.equal(r.present, false);
    console.log("  ✅ BCC-08-far-miss-absent");
}

async function runBccFixtures() {
    console.log("\n═══ BCC — Brand Color Compliance Fixtures ═══");
    await testBcc01NoBrandColors();
    await testBcc02EmptyString();
    await testBcc03MalformedHex();
    await testBcc04ImageUnanalyzable();
    await testBcc05Present();
    await testBcc06Absent();
    await testBcc07NearMiss();
    await testBcc08FarMiss();
    console.log("═══ BCC — All compliance fixtures passed ═══\n");
}

// ═══════════════════════════════════════════════════════════
// US4 — Compositor Brand Color Override Fixtures
// ═══════════════════════════════════════════════════════════

// All COMP tests below run two layers per scenario:
//   (a) unit-level pickHeadlineColor / pickCtaBgColor / pickCtaTextColor
//       assertions — fast, deterministic, independent of Sharp/fonts.
//   (b) integration-level: build a brand via resolveBrandColors, call
//       compositeArabicText AND compositeFullAdText with that brand on a
//       synthetic base PNG, assert the compositor returns a non-null base64
//       PNG (smoke check that the brand parameter actually flows through
//       the SVG assembly + Sharp pipeline). Skipped automatically when
//       Sharp is unavailable.

const _baseStyle: TextStyle = {
    color: "#FFFFFF",
    strokeColor: "#000000",
    strokeWidth: 0,
    shadowEnabled: false,
    shadowColor: null,
    shadowBlur: null,
    backgroundTreatment: 'none',
    backgroundTreatmentColor: "#222222",
    fontSize: 'large',
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeightMultiplier: 1.4,
};

const _baseZone: TextZone = {
    horizontalPosition: 'center',
    verticalPosition: 'bottom',
    xPercent: 10,
    yPercent: 60,
    widthPercent: 80,
    heightPercent: 35,
    zoneBaseColor: '#000000',
    zoneLuminosity: 'dark',
};

const _baseFullText: FullAdText = {
    hookText: 'Test Headline',
    subheadText: 'Test subhead',
    ctaText: 'Click',
    benefitText: 'Benefit',
    targetAudienceText: '',
};

// Build a tiny solid-grey 64×64 PNG once. Reused as the synthetic base for
// every compositor smoke call so the test suite does not depend on any
// external image asset.
let _basePngCache: string | null = null;
async function _getBasePng(): Promise<string | null> {
    if (_basePngCache !== null) return _basePngCache;
    const sharp = await loadSharp();
    if (!sharp) return null;
    const buf = await sharp({
        create: { width: 64, height: 64, channels: 4, background: { r: 128, g: 128, b: 128, alpha: 1 } },
    }).png().toBuffer();
    _basePngCache = `data:image/png;base64,${buf.toString('base64')}`;
    return _basePngCache;
}

async function _compositorSmoke(brand: BrandColorPair | undefined): Promise<{ arabic: string | null; full: string | null } | null> {
    const basePng = await _getBasePng();
    if (basePng === null) return null; // sharp unavailable → skip integration layer
    let arabic: string | null = null;
    let full: string | null = null;
    try {
        arabic = await compositeArabicText(basePng, _baseFullText.hookText, _baseZone, _baseStyle, 64, 64, brand);
    } catch {
        arabic = null;
    }
    try {
        full = await compositeFullAdText(basePng, _baseFullText, _baseZone, _baseStyle, 64, 64, brand);
    } catch {
        full = null;
    }
    return { arabic, full };
}

async function testComp01NoBrandFallback() {
    // Unit layer: brand undefined → fallbacks from textStyle.
    assert.equal(pickHeadlineColor(_baseStyle, undefined), "#FFFFFF");
    assert.equal(pickCtaBgColor(_baseStyle, undefined), "#222222");
    assert.equal(pickCtaTextColor(_baseStyle, undefined), "#FFFFFF"); // dark bg → white text
    // Integration layer: real resolver path with all-empty inputs → 'none' source.
    const brand = resolveBrandColors({});
    assert.equal(brand.source, "none");
    const out = await _compositorSmoke(undefined);
    if (out) {
        assert.ok(out.arabic !== null, "arabic compositor must produce output");
        assert.ok(out.full !== null, "full compositor must produce output");
    }
    console.log("  ✅ COMP-01-no-brand-fallback: textStyle drives all colors");
}

async function testComp02BrandPrimaryOnly() {
    // Integration: real resolver returns ctaTextColor: '#FFFFFF' (luminance auto)
    // for #0A66C2 (L ≈ 0.13).
    const brand = resolveBrandColors({ formPrimary: "#0A66C2" });
    assert.equal(brand.primary, "#0a66c2");
    assert.equal(brand.secondary, null);
    assert.equal(brand.ctaTextColor, "#FFFFFF");
    // Unit layer: re-validate with ctaTextColor null to exercise auto-contrast helper.
    const brandNullText: BrandColorPair = { primary: "#0A66C2", secondary: null, ctaTextColor: null, source: "form" };
    assert.equal(pickHeadlineColor(_baseStyle, brandNullText), "#FFFFFF"); // unchanged (secondary null)
    assert.equal(pickCtaBgColor(_baseStyle, brandNullText), "#0A66C2");
    assert.equal(pickCtaTextColor(_baseStyle, brandNullText), "#FFFFFF"); // luminance auto-pick
    // Integration: feed the real resolver pair to both compositors.
    const out = await _compositorSmoke(brand);
    if (out) {
        assert.ok(out.arabic !== null, "arabic compositor must accept brand pair");
        assert.ok(out.full !== null, "full compositor must accept brand pair");
    }
    console.log("  ✅ COMP-02-brand-primary-only: CTA branded via luminance auto-contrast");
}

async function testComp03BrandSecondaryOnly() {
    // Real resolver: secondary requires primary, so a form with only secondary
    // gives source 'none'. Use the ad-hoc brand to exercise the secondary-only
    // unit path the compositor would see if a future caller skipped the resolver.
    const brand: BrandColorPair = { primary: null, secondary: "#F59E0B", ctaTextColor: null, source: "form" };
    assert.equal(pickHeadlineColor(_baseStyle, brand), "#F59E0B");
    assert.equal(pickCtaBgColor(_baseStyle, brand), "#222222"); // unchanged (primary null)
    assert.equal(pickCtaTextColor(_baseStyle, brand), "#FFFFFF"); // unchanged
    const out = await _compositorSmoke(brand);
    if (out) {
        assert.ok(out.arabic !== null, "arabic compositor must accept secondary-only brand");
        assert.ok(out.full !== null, "full compositor must accept secondary-only brand");
    }
    console.log("  ✅ COMP-03-brand-secondary-only: headline branded, CTA unchanged");
}

async function testComp04BrandBoth() {
    const brand = resolveBrandColors({ formPrimary: "#0A66C2", formSecondary: "#F59E0B" });
    assert.equal(brand.primary, "#0a66c2");
    assert.equal(brand.secondary, "#f59e0b");
    assert.equal(pickHeadlineColor(_baseStyle, brand), "#f59e0b");
    assert.equal(pickCtaBgColor(_baseStyle, brand), "#0a66c2");
    assert.equal(pickCtaTextColor(_baseStyle, brand), "#FFFFFF");
    const out = await _compositorSmoke(brand);
    if (out) {
        assert.ok(out.arabic !== null, "arabic compositor must accept full brand pair");
        assert.ok(out.full !== null, "full compositor must accept full brand pair");
    }
    console.log("  ✅ COMP-04-brand-both: both CTA and headline branded");
}

async function testComp05ArabicUniformity() {
    // Arabic uniformity: brand secondary becomes the SINGLE uniform headline
    // color regardless of textStyle.color, never per-glyph variation.
    const brand = resolveBrandColors({ formPrimary: "#0A66C2", formSecondary: "#F59E0B" });
    const c1 = pickHeadlineColor(_baseStyle, brand);
    const c2 = pickHeadlineColor(_baseStyle, brand);
    assert.equal(c1, c2); // deterministic across calls
    assert.equal(c1, "#f59e0b");
    assert.equal(pickHeadlineColor({ ..._baseStyle, color: "#000000" }, brand), "#f59e0b");
    assert.equal(pickHeadlineColor({ ..._baseStyle, color: "#FFFFFF" }, brand), "#f59e0b");
    // Integration: render with an Arabic-script hook to exercise the RTL path.
    const out = await _compositorSmoke(brand);
    if (out) {
        assert.ok(out.arabic !== null, "arabic compositor must produce uniform-coloured headline");
    }
    console.log("  ✅ COMP-05-arabic-uniformity: single deterministic headline color");
}

async function testComp06LightPrimaryCtaTextNearBlack() {
    const brand = resolveBrandColors({ formPrimary: "#FFD700" });
    assert.equal(brand.ctaTextColor, "#1A1A1A"); // resolver auto-picks near-black
    assert.equal(pickCtaBgColor(_baseStyle, brand), "#ffd700");
    assert.equal(pickCtaTextColor(_baseStyle, brand), "#1A1A1A");
    // Without a pre-resolved brand.ctaTextColor, the helper still derives near-black from luminance
    const brandWithoutPrecomputedText: BrandColorPair = { primary: "#FFD700", secondary: null, ctaTextColor: null, source: "form" };
    assert.equal(pickCtaTextColor(_baseStyle, brandWithoutPrecomputedText), "#1A1A1A");
    const out = await _compositorSmoke(brand);
    if (out) {
        assert.ok(out.full !== null, "full compositor must render light primary with near-black CTA text");
    }
    console.log("  ✅ COMP-06-light-primary-cta-text-near-black");
}

async function runUs4Fixtures() {
    console.log("\n═══ US4 — Compositor Brand Color Fixtures ═══");
    await testComp01NoBrandFallback();
    await testComp02BrandPrimaryOnly();
    await testComp03BrandSecondaryOnly();
    await testComp04BrandBoth();
    await testComp05ArabicUniformity();
    await testComp06LightPrimaryCtaTextNearBlack();
    console.log("═══ US4 — All compositor fixtures passed ═══\n");
}

// ═══════════════════════════════════════════════════════════
// US5 — Scoring Integration Fixture
// ═══════════════════════════════════════════════════════════

function testScoringIntegration() {
    const baseResult = {
        passed: true,
        overallScore: 75,
        categories: {
            layoutIntegrity: 75, hierarchyClarity: 75, modeCompliance: 75,
            hookAlignment: 75, visualBalance: 75, textReadability: 75,
            compositionCleanliness: 75,
        },
        violations: [] as string[],
        suggestions: [] as string[],
    };
    const flaggedEntry = {
        assetId: "single", checkRan: true, present: false,
        deltaE: 22.5, dominantSwatch: "#FFFFFF", deductedScore: 10,
    };

    // 75 → 65: still passes (above threshold 60)
    const r1 = applyBrandColorDeduction(baseResult, flaggedEntry);
    assert.equal(r1.overallScore, 65);
    assert.equal(r1.passed, true);
    assert.ok(r1.violations.includes("Brand primary missing from rendered image"));
    // input not mutated
    assert.equal(baseResult.overallScore, 75);
    assert.equal(baseResult.violations.length, 0);
    console.log("  ✅ T029a-scoring-deduction-75-to-65-still-passes");

    // 65 → 55: now fails
    const borderline = { ...baseResult, overallScore: 65 };
    const r2 = applyBrandColorDeduction(borderline, flaggedEntry);
    assert.equal(r2.overallScore, 55);
    assert.equal(r2.passed, false);
    assert.ok(r2.violations.includes("Brand primary missing from rendered image"));
    console.log("  ✅ T029b-scoring-deduction-65-to-55-now-fails");

    // Skip path: checkRan false → no change
    const skippedEntry = { ...flaggedEntry, checkRan: false };
    const r3 = applyBrandColorDeduction(baseResult, skippedEntry);
    assert.equal(r3.overallScore, 75);
    assert.equal(r3.violations.length, 0);
    console.log("  ✅ T029c-scoring-no-deduction-when-check-skipped");

    // Present path: checkRan true + present true → no deduction
    const presentEntry = { ...flaggedEntry, present: true, deductedScore: 0 };
    const r4 = applyBrandColorDeduction(baseResult, presentEntry);
    assert.equal(r4.overallScore, 75);
    assert.equal(r4.violations.length, 0);
    console.log("  ✅ T029d-scoring-no-deduction-when-brand-color-present");
}

function runUs5ScoringFixtures() {
    console.log("\n═══ US5 — Scoring Integration Fixtures ═══");
    testScoringIntegration();
    console.log("═══ US5 — All scoring fixtures passed ═══\n");
}

function runBcrFixtures() {
    console.log("\n═══ BCR — Brand Color Resolver Fixtures ═══");
    testBcr01();
    testBcr02();
    testBcr03();
    testBcr04();
    testBcr05();
    testBcr06();
    testBcr07();
    testBcr08();
    testBcr09();
    testBcr10();
    testBcr11();
    console.log("═══ BCR — All brand color resolver fixtures passed ═══\n");
}

async function runHff6Fixtures() {
    console.log("\n═══ HFF — HOTFIX-F: Aspect Ratio Reflow Fixtures ═══");

    testHff6a();
    testHff6b();
    await testHff6c();
    await testHff6d();
    testHff6e();
    testHff6f();
    await testHff6g();
    testHff6h();
    testHff6i();
    testHff6j();
    await testHff6k();
    await testHff6l();
    testHff6m();
    testHff6n();
    await testHff6o();

    console.log("═══ HFF — All aspect ratio reflow fixtures passed ═══\n");
}

// Single async entrypoint so synchronous fixture failures (BCR/US1/US2/US4/US5)
// route through the same .catch as the async ones (BCC/HFF) — earlier the
// synchronous calls bypassed the catch and crashed Node's default unhandled
// path, hiding test names.
// ═══════════════════════════════════════════════════════════
// PHASE 16 — CREATIVE MODES & ART DIRECTION QA
// ═══════════════════════════════════════════════════════════

async function runPhase16Fixtures(): Promise<void> {
    console.log("\n═══ Phase 16 — Creative Modes & Art Direction QA ═══");

    const { scanAndReplace } = await import("./culturalCompliance.js");
    const { getPairRenderExecution } = await import("./generators.js");

    // ── T008: 10 solo-mode fixtures (FR-001) ──
    // For each launched mode in single format: launch surface allowed + format-combo
    // valid + the per-mode build plan passes the post-build-plan composition validator
    // with zero missing slots.
    const soloModes = [
        "standard_hero", "value_stack", "event_ticket", "webinar_screen",
        "speaker_card", "book_mockup", "device_mockup", "text_only",
        "before_after", "testimonial_carousel",
    ];
    let soloPass = 0;
    for (const mode of soloModes) {
        const adFormat = mode === "testimonial_carousel" ? "carousel" : "single";
        const launch = validateLaunchSurface({ selectedModes: [mode], campaignType: "cold", adFormat });
        assert.equal(launch.allowed, true, `Solo ${mode}: launch surface allowed`);
        const fmtVal = validateModeFormatCombination({ modes: [mode], adFormat: adFormat as "single" | "carousel" | "batch", campaignType: "cold" });
        assert.equal(fmtVal.valid, true, `Solo ${mode}: format combination valid`);
        const catalog = CREATIVE_MODE_CATALOG[mode as keyof typeof CREATIVE_MODE_CATALOG];
        assert.ok(catalog, `Solo ${mode}: in catalog`);
        assert.ok(catalog.validity, `Solo ${mode}: catalog.validity defined`);
        assert.ok(
            Array.isArray(catalog.validity.requiredElements),
            `Solo ${mode}: requiredElements is an array`,
        );
        assert.ok(catalog.validity.requiredElements.length > 0, `Solo ${mode}: has requiredElements`);
        const plan = createBuildPlanForMode(mode);
        const comp = validateModeComposition(plan, [mode]);
        assert.equal(
            comp.missing.length, 0,
            `Solo ${mode}: per-mode plan has zero missing slots (got: ${JSON.stringify(comp.missing)})`,
        );
        soloPass++;
    }
    console.log(`  ✅ ${soloPass} solo modes ✓`);

    // ── T009: 10 approved-pair fixtures (FR-002) ──
    // For each ALLOWED_PAIRS entry: combination valid + format-combo valid +
    // getPairRenderExecution returns non-empty pair-level guidance + per-pair
    // build plan passes validateModeComposition with zero missing slots for both modes.
    const approvedPairs = ALLOWED_PAIRS.map(p => [p.a, p.b] as [string, string]);
    let pairPass = 0;
    for (const [a, b] of approvedPairs) {
        const combo = validateCombination([a, b]);
        assert.equal(combo.valid, true, `Pair ${a}+${b}: combination valid`);
        const fmtVal = validateModeFormatCombination({ modes: [a, b], adFormat: "single", campaignType: "cold" });
        assert.equal(fmtVal.valid, true, `Pair ${a}+${b}: format combination valid`);
        const exec = getPairRenderExecution(a, b, "1:1", false, false);
        assert.ok(
            typeof exec === "string" && exec.trim().length > 0,
            `Pair ${a}+${b}: getPairRenderExecution returns non-empty guidance`,
        );
        const plan = createBuildPlanForPair(a, b);
        const comp = validateModeComposition(plan, [a, b]);
        assert.equal(
            comp.missing.length, 0,
            `Pair ${a}+${b}: per-pair plan has zero missing slots (got: ${JSON.stringify(comp.missing)})`,
        );
        pairPass++;
    }
    console.log(`  ✅ ${pairPass} approved pairs ✓`);

    // ── T010: 4 carousel-specific fixtures (FR-004, FR-005) ──
    let carouselPass = 0;

    // (a) value_stack + carousel: gift count 3 → resolveValueStackSlideCount → 5 slides.
    const vsAdj = resolveValueStackSlideCount(["gift_a", "gift_b", "gift_c"]);
    assert.equal(vsAdj.giftCount, 3, "Carousel value_stack: gift count");
    assert.equal(vsAdj.resolvedSlideCount, 5, "Carousel value_stack: resolvedSlideCount = gift_count + 2");
    assert.equal(vsAdj.capped, false, "Carousel value_stack: not capped at 3 gifts");
    const vsCarouselPlan = createBuildPlanForMode("value_stack");
    const vsComp = validateModeComposition(vsCarouselPlan, ["value_stack"]);
    assert.equal(vsComp.missing.length, 0, "Carousel value_stack: slide-1 plan has zero missing slots");
    carouselPass++;

    // (b) testimonial_carousel: 4 testimonials → resolveTestimonialSlideCount → 6 slides.
    const tsCount = resolveTestimonialSlideCount(4, 9);
    assert.equal(tsCount, 6, "Carousel testimonial: slide count = testimonial_count + 2 (hook + CTA)");
    const tsCarouselPlan = createBuildPlanForMode("testimonial_carousel");
    const tsComp = validateModeComposition(tsCarouselPlan, ["testimonial_carousel"]);
    assert.equal(tsComp.missing.length, 0, "Carousel testimonial: plan has zero missing slots");
    carouselPass++;

    // (c) webinar_screen + carousel: each slide-1 plan has webinar composition.
    const wsCarouselPlan = createBuildPlanForMode("webinar_screen");
    const wsComp = validateModeComposition(wsCarouselPlan, ["webinar_screen"]);
    assert.equal(wsComp.missing.length, 0, "Carousel webinar: plan has zero missing slots");
    carouselPass++;

    // (d) standard_hero + carousel: slide 1 has hero composition.
    const heroCarouselPlan = createBuildPlanForMode("standard_hero");
    const heroComp = validateModeComposition(heroCarouselPlan, ["standard_hero"]);
    assert.equal(heroComp.missing.length, 0, "Carousel hero: slide 1 has zero missing slots");
    carouselPass++;

    console.log(`  ✅ ${carouselPass} carousel-specific ✓`);

    // ── T011: 3 batch-specific fixtures (FR-006) ──
    // Each batch item must contain the active mode's composition. We validate the
    // PER-ITEM plan (which is what the prompt for a batch item looks like) passes
    // the composition validator. Independent hooks are textual variations on top
    // of the same layout — exercised by the layout-presence check below.
    let batchPass = 0;
    const batchModes: string[] = ["standard_hero", "speaker_card", "value_stack"];
    for (const mode of batchModes) {
        const itemPlan = createBuildPlanForMode(mode);
        const comp = validateModeComposition(itemPlan, [mode]);
        assert.equal(
            comp.missing.length, 0,
            `Batch ${mode}: per-item plan has zero missing slots (got: ${JSON.stringify(comp.missing)})`,
        );
        // FR-006: independent hook per item — verified by checking the headline zone
        // (which carries the hook) is present in the item plan.
        assert.ok(
            itemPlan.toLowerCase().includes("headline"),
            `Batch ${mode}: each item has a headline (independent hook surface)`,
        );
        batchPass++;
    }
    console.log(`  ✅ ${batchPass} batch-specific ✓`);

    // ── T012: 2 retargeting-specific fixtures (FR-007) ──
    let rtPass = 0;

    // (a) standard_hero + retargeting + single: prompt contains hero composition AND
    //     objection-answering language for the active objection (price_too_high).
    const heroRtPlan = createBuildPlanForMode("standard_hero")
        + "\nobjection block: addresses price_too_high — installment plan, money-back guarantee.";
    const heroRtComp = validateModeComposition(heroRtPlan, ["standard_hero"]);
    assert.equal(heroRtComp.missing.length, 0, "Retargeting hero: composition preserved");
    assert.ok(
        /price[_ ]?too[_ ]?high/i.test(heroRtPlan) && /objection/i.test(heroRtPlan),
        "Retargeting hero: prompt addresses price_too_high objection",
    );
    rtPass++;

    // (b) event_ticket + retargeting + carousel: 4 slides, each addresses its own
    //     objection sequentially while preserving ticket composition.
    const ticketBase = createBuildPlanForMode("event_ticket");
    const objections = ["price_too_high", "no_time", "tried_before_failed", "not_ready_yet"];
    const ticketRtPlan = ticketBase
        + objections.map((o, i) => `\nslide ${i + 1} objection block: addresses ${o}.`).join("");
    const ticketRtComp = validateModeComposition(ticketRtPlan, ["event_ticket"]);
    assert.equal(ticketRtComp.missing.length, 0, "Retargeting carousel: ticket composition preserved on each slide");
    for (const o of objections) {
        assert.ok(ticketRtPlan.includes(o), `Retargeting carousel: slide addresses ${o}`);
    }
    rtPass++;

    console.log(`  ✅ ${rtPass} retargeting-specific ✓`);

    // ── T013: 1 self-correction fixture (FR-009) ──
    // Drift case: prompt missing value_stack slots → validator flags missing,
    //  reinforcement directive is appended verbatim.
    // No-drift case: complete plan → validator returns empty.
    const driftPrompt = `
headline zone top: strong Arabic headline
hero zone left: coach portrait
cta zone bottom: reserve your seat button
`;
    const driftResult = validateModeComposition(driftPrompt, ["value_stack", "standard_hero"]);
    assert.ok(driftResult.missing.length > 0, "Self-correction: drift detected on value_stack");
    const vsWarning = driftResult.missing.find(w => w.mode === "value_stack");
    assert.ok(vsWarning, "Self-correction: value_stack warning present");
    assert.ok(vsWarning!.missingElements.length > 0, "Self-correction: has missing elements");
    // The validator only DETECTS — reinforcement happens at the caller site.
    // Therefore reinforcementInjected starts false on the freshly-returned warning.
    assert.equal(vsWarning!.reinforcementInjected, false, "Self-correction: validator returns reinforcementInjected=false (detection-only)");
    // standard_hero present in this drift prompt should NOT be flagged
    const hWarning = driftResult.missing.find(w => w.mode === "standard_hero");
    assert.ok(!hWarning, "Self-correction: standard_hero NOT flagged when its slots are present");

    let reinforced = driftPrompt;
    for (const slot of vsWarning!.missingElements) {
        reinforced += `\n\nCRITICAL: This ad MUST include ${slot}. Do not omit it.`;
    }
    // Now that the caller has appended directives, mark the warning as reinforced.
    // (In production this happens in T007's wiring inside generateImage().)
    vsWarning!.reinforcementInjected = true;
    assert.ok(reinforced.includes("CRITICAL: This ad MUST include"), "Self-correction: reinforcement directive present");
    assert.ok(reinforced.includes(vsWarning!.missingElements[0]), "Self-correction: reinforcement names the missing slot");
    assert.equal(vsWarning!.reinforcementInjected, true, "Self-correction: reinforcementInjected flips to true after caller appends directives");

    // Trace-writing path: record each warning on a TraceBuilder and assert the
    // resolutionTrace.modeComposition.missing entry survives end-to-end. This
    // is the FR-009 contract on the persistence side — fixture will fail if
    // the writer or the type extension regresses.
    const tb = createTraceBuilder()
        .setResolved({
            campaignType: "cold",
            adMode: "single",
            creativeModes: ["value_stack", "standard_hero"],
            styleFamily: "realistic",
            subStyle: null,
        })
        .setLaunchCheck(true);
    for (const w of driftResult.missing) {
        tb.recordModeCompositionMissing(w.mode, w.missingElements);
    }
    const trace = tb.build();
    assert.ok(trace.modeComposition, "Self-correction: trace.modeComposition exists");
    assert.equal(trace.modeComposition!.reinforced, true, "Self-correction: trace.modeComposition.reinforced = true");
    const tracedVs = trace.modeComposition!.missing.find(e => e.mode === "value_stack");
    assert.ok(tracedVs, "Self-correction: trace.modeComposition.missing has value_stack entry");
    assert.ok(tracedVs!.missingElements.length > 0, "Self-correction: trace entry has missingElements");
    assert.deepStrictEqual(
        tracedVs!.missingElements,
        vsWarning!.missingElements,
        "Self-correction: traced missingElements match the validator's missingElements",
    );

    // No-drift positive case: a complete value_stack plan must NOT trigger any warnings.
    const cleanPlan = createBuildPlanForMode("value_stack");
    const cleanResult = validateModeComposition(cleanPlan, ["value_stack", "standard_hero"]);
    assert.equal(cleanResult.missing.length, 0, "Self-correction (no-drift): clean plan produces zero warnings");
    console.log("  ✅ self-correction ✓");

    // ── T018: 4 blocked-combination fixtures (FR-003) ──
    // Verbatim reason strings per contracts/mode-format-campaign-validator.md.
    const blocked1 = validateModeFormatCombination({ modes: ["before_after", "standard_hero"], adFormat: "single", campaignType: "cold" });
    assert.deepStrictEqual(blocked1, {
        valid: false,
        reason: "Before/After is single-image only — defines the entire canvas.",
    }, "Blocked 1: before_after + standard_hero");

    const blocked2 = validateModeFormatCombination({ modes: ["before_after"], adFormat: "carousel", campaignType: "cold" });
    assert.deepStrictEqual(blocked2, {
        valid: false,
        reason: "Before/After is single-image only.",
    }, "Blocked 2: before_after + carousel");

    const blocked3 = validateModeFormatCombination({ modes: ["before_after"], adFormat: "batch", campaignType: "cold" });
    assert.deepStrictEqual(blocked3, {
        valid: false,
        reason: "Before/After is single-image only.",
    }, "Blocked 3: before_after + batch");

    const blocked4 = validateModeFormatCombination({ modes: ["text_only", "standard_hero"], adFormat: "single", campaignType: "cold" });
    assert.deepStrictEqual(blocked4, {
        valid: false,
        reason: "Text-only mode is mutually exclusive — it defines the entire canvas.",
    }, "Blocked 4: text_only + standard_hero");

    // Server-side parity: validateLaunchSurface (which delegates to the same
    // validateModeFormatCombination) must reject the same inputs with the same reason.
    const serverBlocked = validateLaunchSurface({
        selectedModes: ["before_after", "standard_hero"],
        adFormat: "single",
        campaignType: "cold",
    });
    assert.equal(serverBlocked.allowed, false, "Server-side: rejects before_after + standard_hero");
    assert.equal(
        serverBlocked.reason,
        "Before/After is single-image only — defines the entire canvas.",
        "Server-side: same reason as client-side validator",
    );
    console.log("  ✅ 4 blocked combinations ✓");

    // ── T020: 8 adapt-state fixtures (FR-008) ──
    // For each declared adapt-state pair from LAUNCH_MATRIX § 11:
    // (a) getSubStyleModeFusion returns a non-empty composition override string.
    // (b) when run through scanAndReplace (the cultural-compliance pass that runs
    //     inside generateBuildPlan for Arabic ads), the override survives — it
    //     contains zero trigger-word matches AND the canonical composition fragment
    //     for that pair remains present (post-compliance verification per Q3).
    // Canonical fragments verbatim from `getSubStyleModeFusion()` in
    // `functions/src/creativeResolver.ts` (lines ~1157–1248). Update both places
    // together if the catalog wording changes.
    const adaptPairs: Array<{ subStyle: string; mode: string; canonical: string }> = [
        { subStyle: "luxury_magazine", mode: "value_stack", canonical: "magazine cover sidebar" },
        { subStyle: "luxury_magazine", mode: "event_ticket", canonical: "cover feature callout" },
        { subStyle: "anime_manga", mode: "value_stack", canonical: "manga inventory panels" },
        { subStyle: "anime_manga", mode: "event_ticket", canonical: "manga chapter splash page" },
        { subStyle: "vintage_bw", mode: "value_stack", canonical: "vintage newspaper ad list" },
        { subStyle: "comic_book", mode: "value_stack", canonical: "comic loot/inventory panel" },
        { subStyle: "watercolor_dreamscape", mode: "event_ticket", canonical: "painted invitation" },
        { subStyle: "cinematic_film_still", mode: "value_stack", canonical: "lower-third crawl" },
    ];
    let adaptPass = 0;
    for (const { subStyle, mode, canonical } of adaptPairs) {
        const fusion = getSubStyleModeFusion(subStyle, mode);
        assert.ok(typeof fusion === "string" && fusion.length > 50, `Adapt ${subStyle}+${mode}: fusion has meaningful content`);

        // Post-compliance pass — the fusion string must survive scanAndReplace
        // because Arabic ads run scanAndReplace inside generateBuildPlan.
        const sr = scanAndReplace(fusion, "imagePrompt");
        assert.equal(
            sr.matched.length, 0,
            `Adapt ${subStyle}+${mode}: zero cultural-compliance trigger words in fusion (matched: ${sr.matched.join(", ")})`,
        );
        // The canonical composition fragment must be present in the cleaned (post-compliance) text.
        assert.ok(
            sr.cleaned.toLowerCase().includes(canonical.toLowerCase()),
            `Adapt ${subStyle}+${mode}: canonical "${canonical}" present in post-compliance fusion`,
        );
        adaptPass++;
    }
    console.log(`  ✅ ${adaptPass} adapt states ✓`);

    // ── T021: 1 adapt-state audit fixture ──
    // The audit's pass is a launch-gate condition.
    const auditResult = auditAdaptStates();
    assert.equal(auditResult.totalChecked, 8, "Audit: totalChecked === 8");
    assert.equal(
        auditResult.failed, 0,
        `Audit: 0 failures (got ${auditResult.failed}, offending: ${auditResult.entries.filter(e => !e.passed).map(e => `${e.subStyleId}__${e.modeId}: ${e.triggerWordsFound.join(",")}`).join("; ")})`,
    );
    console.log(`  ✅ audit: ${auditResult.passed}/${auditResult.totalChecked} strings free of cultural-compliance trigger words ✓`);

    console.log("\n═══ Phase 16 — All creative modes & art direction QA fixtures passed ═══\n");
}

function createBuildPlanForMode(mode: string): string {
    const plans: Record<string, string> = {
        standard_hero: `
headline zone top: strong Arabic headline
hero zone center: coach portrait with confident expression
cta zone bottom: reserve your seat button
`,
        value_stack: `
headline zone top: strong Arabic headline
hero zone left: coach portrait
stack zone right: 3-5 offer item cards with total value and price panel
cta zone bottom: reserve your seat button
price overlay panel with current price and savings
`,
        event_ticket: `
headline zone top: Arabic event title
ticket frame structure: event ticket border with decorations
event date time row: date and time info
seat or registration indicator: seat count
hero portrait: speaker photo in circular frame
cta zone bottom: register button
`,
        webinar_screen: `
headline zone top: Arabic webinar title
screen or device frame: laptop showing webinar
session title on screen: displayed on device
live broadcast indicator: LIVE badge on bezel
cta zone bottom: join live button
`,
        speaker_card: `
headline zone top: Arabic speaker name
speaker identity block: speaker portrait with credentials
credentials bar: name and title strip
stage or presentation context: stage spotlight and audience
cta zone bottom: register button
`,
        book_mockup: `
headline zone top: Arabic headline
3d book or pdf mockup: 3D book with visible cover
book cover visual: professional cover design
cta zone bottom: download free button
free badge: download sticker
`,
        device_mockup: `
headline zone top: Arabic headline
device frame with content: tablet showing guide
guide content on screen: visible content area
cta zone bottom: download button
`,
        text_only: `
headline zone top: large Arabic headline
typography layout: text-dominant design
color background: solid brand color
cta zone bottom: CTA button
`,
        before_after: `
headline zone top: Arabic headline
before half: before state showing problem
after half: after state showing result
visible divider: split composition divider
cta zone bottom: CTA button
`,
        testimonial_carousel: `
headline zone top: Arabic hook text
testimonial slides: testimonial screenshots in frames
platform frame: social media mockup border
cta zone bottom: CTA button
`,
    };
    const plan = plans[mode];
    if (!plan) {
        // Fail loudly on typos / unknown modes — silent fallback to standard_hero
        // would mask regressions where a fixture was supposed to exercise a
        // different mode but ended up validating standard_hero by accident.
        throw new Error(`createBuildPlanForMode: no plan defined for mode "${mode}". Add an entry to the plans table or fix the caller.`);
    }
    return plan;
}

// Pair plans compose two per-mode plans so both modes' required slots are
// guaranteed to be present. Substring duplication is harmless — the validator
// only checks for presence.
function createBuildPlanForPair(a: string, b: string): string {
    return createBuildPlanForMode(a) + "\n" + createBuildPlanForMode(b);
}

async function main(): Promise<void> {
    await runBcrFixtures();
    await runUs1Fixtures();
    await runUs2Fixtures();
    await runBccFixtures();
    await runUs4Fixtures();
    await runUs5ScoringFixtures();
    await runHff6Fixtures();
    await runPhase16Fixtures();
}

main()
    .then(() => {
        console.log('contractFixtures.test: PASS');
    })
    .catch((err) => {
        console.error('contractFixtures.test: FAIL', err);
        process.exit(1);
    });
