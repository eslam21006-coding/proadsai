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

console.log('contractFixtures.test: PASS');
