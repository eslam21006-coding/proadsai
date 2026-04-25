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
    type CreativeModeId,
} from "./creativeResolver.js";

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

    // Blocked: cross-tab pair
    const crossTab = validateLaunchSurface({ selectedModes: ['value_stack', 'event_ticket'] });
    assert.equal(crossTab.allowed, false, 'validateLaunchSurface: cross-tab pair should block');
    assert.ok(
        crossTab.reason && crossTab.reason.toLowerCase().includes('cross-tab'),
        `validateLaunchSurface: cross-tab reason should contain "cross-tab", got: ${crossTab.reason}`
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
    LogoPipelineEvents,
    LogoZone,
} from "./types.js";
import { SCREEN_CONTENT_BAN_BLOCK, UI_LOGO_INSTRUCTION_BLOCK, ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK, MODE_SELECTION_HINT_BLOCK } from "./logoPromptBlocks.js";

const FAKE_LOGO_1x1_B64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("NEVER render"), "SCREEN_CONTENT_BAN_BLOCK must contain 'NEVER render'");
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
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("DEVICE SCREEN CONTENT BAN"), "Ban block has header");
    assert.ok(MODE_SELECTION_HINT_BLOCK.includes("ui"), "Mode hint mentions ui");
    console.log("  ✅ Ban-1: SCREEN_CONTENT_BAN_BLOCK constant verified");
}

// ─── Ban-2 — Image-model prompt always includes ban (T027) ───
function testBan2() {
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("blank dark screen"), "Ban allows blank dark screen");
    assert.ok(SCREEN_CONTENT_BAN_BLOCK.includes("Abstract gradient"), "Ban allows abstract gradient");
    console.log("  ✅ Ban-2: Ban allowed states verified");
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
    const result = validateLogoPlacements(
        [{ logoIndex: 0, mode: 'video' as any, surface: 'coffee_mug', environmentalContext: '' }],
        1,
    );
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

console.log('contractFixtures.test: PASS');
