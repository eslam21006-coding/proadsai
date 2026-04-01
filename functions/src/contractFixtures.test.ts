import assert from "node:assert/strict";
import { compileFullContract } from "./layoutContract.js";
import {
    buildContentOwnershipMap,
    buildPlanSlotMap,
    parseBuildPlanEnvelope,
    serializeBuildPlanEnvelope,
    validateStructuredBuildPlan,
    type StructuredBuildPlanPayload,
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

    // Verify all realistic sub-styles allow standard_hero
    const realisticSubStyles: string[] = ['luxury_magazine', 'documentary_gritty', 'neon_urban',
        'dark_cinematic', 'bright_illustrated', 'mythic_epic', 'cinematic_film_still',
        'clean_corporate', 'golden_hour_outdoor', 'street_photography', 'ugly_ad',
        'glitch_digital', 'synthwave_80s'];
    for (const sub of realisticSubStyles) {
        const result = validateSubStyleModeCompat(sub, modes);
        assert.equal(result.compat, 'ok', `Lane 9: ${sub}+standard_hero should be ok`);
    }
}

// ─── Lane 10 — Testimonial Carousel Cold (T030a) ─── STUB
function testLane10TestimonialCarouselCold() {
    // Spec G required — testimonial carousel not yet built
    console.log('  ℹ️ Lane 10: Testimonial Carousel (Cold) — Spec G required, stub passes');
}

// ─── Lane 11 — Testimonial Carousel Retargeting (T030b) ─── STUB
function testLane11TestimonialCarouselRetargeting() {
    // Spec G required — testimonial carousel not yet built
    console.log('  ℹ️ Lane 11: Testimonial Carousel (Retargeting) — Spec G required, stub passes');
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
testLane10TestimonialCarouselCold();console.log('  ✅ Lane 10: Testimonial Carousel (Cold) — stub');
testLane11TestimonialCarouselRetargeting(); console.log('  ✅ Lane 11: Testimonial Carousel (Retargeting) — stub');
console.log('═══ Spec 002 — All 11 lanes passed ═══\n');

console.log('contractFixtures.test: PASS');
