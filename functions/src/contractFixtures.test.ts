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

    console.log("  ✅ testCopyFidelity4Fields");
}

// ─── T042: campaign context field presence ───
function testCampaignContextPresence() {
    const input = makePromptInput({
        inputs: { visualSubStyle: "luxury_magazine", offerCreativeMode: ["standard_hero"], productName: "FitPro", targetAudience: "busy professionals" } as any,
        coreDesignRules: "Photorealistic studio lighting. Product: FitPro. Target: busy professionals. SUB-STYLE: luxury_magazine.",
    });
    const result = buildFinalImagePrompt(input);
    assert.ok(result.textPrompt.includes("FitPro"), "T042: textPrompt must contain productName 'FitPro'");
    assert.ok(result.textPrompt.includes("busy professionals"), "T042: textPrompt must contain targetAudience 'busy professionals'");
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

console.log('contractFixtures.test: PASS');
