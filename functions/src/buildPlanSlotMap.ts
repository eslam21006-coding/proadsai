import type { FullLayoutContract } from "./layoutContract.js";

export type TextOwnershipSource = 'headline' | 'subheadline' | 'price' | 'bonus' | 'cta' | 'badge' | 'overlay';

export interface OwnershipInputShape {
    cta?: string;
    offerType?: string;
    badges?: string;
    valueStackItems?: string;
    valueStackBonuses?: string;
    valueStackPrice?: string;
    valueStackSavings?: string;
    valueStackOriginalValue?: string;
    valueStackTitle?: string;
    eventTitle?: string;
    eventDate?: string;
    eventTime?: string;
    eventLocation?: string;
    eventHost?: string;
    eventSeatLimit?: string;
    eventTicketTier?: string;
    offerCardTitle?: string;
    offerCardPrice?: string;
    offerCardOldPrice?: string;
    offerCardDiscount?: string;
    speakerName?: string;
    speakerRole?: string;
    speakerCredentials?: string;
    dayNodes?: string;
    dayDates?: string;
    moduleTitles?: string;
    guideTitle?: string;
    guideSubtitle?: string;
    deviceContentTitle?: string;
    appDashboardLabel?: string;
    appKeyMetric?: string;
    authorityCredentials?: string;
    authorityNumbers?: string;
    featureList?: string;
}

export interface ContentOwnershipMap {
    primaryHeadline?: string;
    supportingHeadline?: string;
    offerPrice?: string;
    originalPrice?: string;
    savingsText?: string;
    bonuses?: string[];
    ctaText?: string;
    urgencyText?: string;
    proofItems?: string[];
    badgeText?: string;
    eventTitle?: string;
    eventDate?: string;
    eventTime?: string;
    eventLocation?: string;
    speakerName?: string;
    speakerRole?: string;
}

export interface SlotFill {
    source: TextOwnershipSource;
    value: string;
}

export interface ContractCheckResult {
    passed: boolean;
    reasons: string[];
}

export interface BuildPlanSlotMap {
    requiredZones: string[];
    filledZones: Record<string, SlotFill>;
    overlaySlots: string[];
    missingZones: string[];
    missingMustShow: string[];
    missingOverlaySlots: string[];
    contractCheck: ContractCheckResult;
}

export interface StructuredZoneAssignment {
    id: string;
    source: TextOwnershipSource;
    value: string;
}

export interface StructuredOverlayAssignment {
    id: string;
    source: TextOwnershipSource;
    value: string;
}

export interface StructuredMustShowAssignment {
    id: string;
    source: TextOwnershipSource;
    value: string;
}

export interface StructuredBuildPlanPayload {
    blueprint: string;
    zones: StructuredZoneAssignment[];
    overlayAssignments: StructuredOverlayAssignment[];
    mustShowAssignments: StructuredMustShowAssignment[];
    ownership: ContentOwnershipMap;
}

export interface BuildPlanEnvelope {
    blueprint: string;
    machinePlan: StructuredBuildPlanPayload | null;
}

export const BUILD_PLAN_MACHINE_BLOCK_START = "[[PROADS_MACHINE_PLAN_V1]]";
export const BUILD_PLAN_MACHINE_BLOCK_END = "[[/PROADS_MACHINE_PLAN_V1]]";

const normalize = (value: string): string => value
    .toLowerCase()
    .replace(/[“”"'`]/g, ' ')
    .replace(/[():،,:;.!?\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const compact = (value?: string | null): string => (value || '').trim();

const splitItems = (value?: string | null): string[] => (value || '')
    .split(/[\n,•|]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const MUST_SHOW_ALIASES: Record<string, string[]> = {
    offer: ['offer', 'program', 'package', 'bundle', 'عرض', 'برنامج', 'باقة'],
    cta: ['cta', 'button', 'call to action', 'زر', 'احجز', 'سجل', 'ابدأ'],
    features: ['feature', 'benefit', 'module', 'lesson', 'ميزة', 'فوائد', 'مميزات'],
    price: ['price', 'pricing', 'discount', 'سعر', 'الاستثمار', 'السعر'],
    event_title: ['event title', 'webinar title', 'title on screen', 'عنوان الحدث', 'عنوان الويبنار'],
    date: ['date', 'time', 'schedule', 'التاريخ', 'الوقت', 'الموعد'],
    event_title_on_screen: ['event title', 'webinar title', 'title on screen', 'screen title', 'عنوان الويبنار'],
    webinar_title_on_screen: ['webinar title', 'screen title', 'webinar heading', 'عنوان الويبنار'],
    seat_count_or_cta: ['seat', 'seats', 'spot', 'spots', 'cta', 'register', 'reserve', 'مقاعد', 'مقعد', 'احجز'],
    actual_price_contrast: ['price contrast', 'current price', 'old price', 'discount', 'سعر قبل', 'سعر بعد', 'خصم'],
    speaker_identity: ['speaker', 'host', 'presenter', 'speaker card', 'المتحدث', 'المدرب'],
    social_proof: ['proof', 'testimonial', 'graduates', 'clients', 'ثقة', 'نتائج', 'عميل'],
    guarantee: ['guarantee', 'refund', 'ضمان'],
    hero_dominant: ['hero dominant', 'dominant hero', 'large portrait', 'main subject', 'البطل الرئيسي'],
    value_items_3_5: ['3-5 offer item', '3 5 offer item', 'value items', 'stack items', 'offer item cards', 'عناصر العرض'],
    individual_prices: ['individual prices', 'item prices', 'price per item', 'أسعار العناصر'],
    total_value: ['total value', 'original value', 'القيمة الكلية', 'القيمة الأصلية'],
    actual_price: ['actual price', 'current price', 'offer price', 'السعر الحالي', 'سعر العرض'],
    savings_callout: ['savings', 'save', 'discount', 'وفر', 'خصم'],
    ticket_frame: ['ticket frame', 'ticket card', 'event ticket', 'premium event ticket frame', 'إطار التذكرة'],
    speaker_portrait_framed: ['speaker card', 'speaker portrait', 'presenter identity', 'host portrait', 'المتحدث'],
    credentials_bar: ['credentials bar', 'credentials', 'role line', 'title line', 'المسمى', 'الصفة'],
    date_time_row: ['date time row', 'date', 'time', 'schedule', 'التاريخ', 'الوقت'],
    ticket_decorations: ['ticket decorations', 'ticket perforation', 'ticket styling', 'premium event ticket frame', 'تصميم التذكرة'],
};

const ZONE_ALIASES: Record<string, string[]> = {
    hero: ['hero', 'subject', 'portrait', 'البطل', 'الشخصية'],
    headline: ['headline', 'title', 'heading', 'العنوان'],
    stack: ['stack', 'value stack', 'cards', 'panel', 'offer items', 'القيمة', 'المحتوى'],
    cta: ['cta', 'button', 'call to action', 'زر', 'احجز', 'سجل', 'ابدأ'],
    grid: ['grid', 'tiles', 'feature grid', 'شبكة', 'مربعات'],
    offer_card: ['offer card', 'offer panel', 'pricing card', 'بطاقة العرض'],
    ticket_card: ['ticket', 'ticket card', 'event ticket', 'تذكرة'],
    event_metadata: ['date', 'time', 'location', 'event details', 'schedule', 'تفاصيل الحدث', 'التاريخ', 'الوقت'],
    dashboard: ['dashboard', 'ui', 'screen', 'interface', 'لوحة التحكم'],
    product: ['product', 'device', 'screen', 'app preview', 'المنتج'],
    speaker: ['speaker', 'host', 'presenter', 'المتحدث'],
    timeline: ['timeline', 'day strip', 'milestone', 'days', 'الايام', 'الجدول'],
    testimonial: ['testimonial', 'review', 'message', 'واتساب', 'شهادة'],
    proof: ['proof', 'authority', 'results', 'credentials', 'اثبات', 'نتائج'],
    module_strip: ['module', 'curriculum', 'lessons', 'modules', 'موديول', 'دروس'],
    mockup: ['mockup', 'book', 'device', '3d', 'cover', 'موكاب', 'كتاب'],
};

const OVERLAY_ALIASES: Record<string, string[]> = {
    valueItem: ['value item', 'stack item', 'offer item', 'bonus item', 'item line', 'عنصر', 'ميزة'],
    totalValue: ['total value', 'original value', 'full value', 'القيمة الكلية', 'القيمة الأصلية'],
    price: ['price', 'current price', 'offer price', 'سعر', 'الاستثمار'],
    savings: ['save', 'savings', 'discount', 'وفر', 'خصم'],
};

const textIncludesAny = (haystack: string, needles: string[]): boolean => {
    if (!haystack) return false;
    return needles.some((needle) => haystack.includes(normalize(needle)));
};

function extractZoneLines(buildPlan: string): string[] {
    return buildPlan
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

function zoneIsFilled(zoneName: string, line: string): boolean {
    const aliases = unique([zoneName.replace(/_/g, ' '), ...(ZONE_ALIASES[zoneName] || [])]).map(normalize);
    return textIncludesAny(line, aliases);
}

function overlayIsFilled(slotId: string, haystack: string, ownership: ContentOwnershipMap): boolean {
    const aliases = unique([slotId, ...(OVERLAY_ALIASES[slotId] || [])]).map(normalize);
    if (slotId === 'price' && compact(ownership.offerPrice)) return true;
    if (slotId === 'totalValue' && compact(ownership.originalPrice)) return true;
    if (slotId === 'savings' && compact(ownership.savingsText)) return true;
    if (slotId === 'valueItem' && (ownership.proofItems?.length || ownership.bonuses?.length)) return true;
    return textIncludesAny(haystack, aliases);
}

function mustShowSatisfied(token: string, haystack: string, ownership: ContentOwnershipMap): boolean {
    const aliases = unique([token.replace(/_/g, ' '), ...(MUST_SHOW_ALIASES[token] || [])]).map(normalize);
    if (token === 'cta' && compact(ownership.ctaText)) return true;
    if (token === 'price' && compact(ownership.offerPrice)) return true;
    if (token === 'offer' && (compact(ownership.primaryHeadline) || compact(ownership.eventTitle))) return true;
    if (token === 'event_title' && compact(ownership.eventTitle)) return true;
    if ((token === 'event_title_on_screen' || token === 'webinar_title_on_screen') && compact(ownership.eventTitle || ownership.primaryHeadline)) return true;
    if (token === 'date' && (compact(ownership.eventDate) || compact(ownership.eventTime))) return true;
    if (token === 'speaker_identity' && compact(ownership.speakerName)) return true;
    if (token === 'seat_count_or_cta' && (compact(ownership.urgencyText) || compact(ownership.ctaText))) return true;
    if (token === 'actual_price_contrast' && (compact(ownership.offerPrice) || compact(ownership.originalPrice) || compact(ownership.savingsText))) return true;
    if (token === 'hero_dominant' && compact(ownership.primaryHeadline)) return true;
    if (token === 'value_items_3_5' && !!ownership.proofItems?.length) return true;
    if (token === 'individual_prices' && !!ownership.proofItems?.length && compact(ownership.offerPrice)) return true;
    if (token === 'total_value' && compact(ownership.originalPrice)) return true;
    if (token === 'actual_price' && compact(ownership.offerPrice)) return true;
    if (token === 'savings_callout' && compact(ownership.savingsText)) return true;
    if (token === 'ticket_frame' && compact(ownership.eventTitle)) return true;
    if (token === 'speaker_portrait_framed' && compact(ownership.speakerName)) return true;
    if (token === 'credentials_bar' && compact(ownership.speakerRole)) return true;
    if (token === 'date_time_row' && (compact(ownership.eventDate) || compact(ownership.eventTime))) return true;
    if (token === 'ticket_decorations' && compact(ownership.eventTitle)) return true;
    return textIncludesAny(haystack, aliases);
}

export function buildContentOwnershipMap(
    ownedText: {
        hookText?: string;
        subheadText?: string;
        ctaName?: string;
        benefitText?: string;
    },
    inputs: OwnershipInputShape,
): ContentOwnershipMap {
    const proofItems = unique([
        ...splitItems(inputs.valueStackItems),
        ...splitItems(inputs.featureList),
        ...splitItems(inputs.moduleTitles),
        compact(inputs.authorityCredentials),
        compact(inputs.authorityNumbers),
        compact(inputs.appKeyMetric),
    ]);
    const bonuses = unique([
        ...splitItems(inputs.valueStackBonuses),
        ...splitItems(inputs.dayNodes),
    ]);

    return {
        primaryHeadline: compact(ownedText.hookText) || compact(inputs.valueStackTitle) || compact(inputs.offerCardTitle) || compact(inputs.eventTitle) || compact(inputs.guideTitle) || compact(inputs.deviceContentTitle),
        supportingHeadline: compact(ownedText.subheadText) || compact(ownedText.benefitText) || compact(inputs.guideSubtitle),
        offerPrice: compact(inputs.valueStackPrice) || compact(inputs.offerCardPrice),
        originalPrice: compact(inputs.valueStackOriginalValue) || compact(inputs.offerCardOldPrice),
        savingsText: compact(inputs.valueStackSavings) || compact(inputs.offerCardDiscount),
        bonuses,
        ctaText: compact(ownedText.ctaName) || compact(inputs.cta),
        urgencyText: compact(inputs.eventSeatLimit) || compact(inputs.eventTicketTier),
        proofItems,
        badgeText: compact(inputs.badges),
        eventTitle: compact(inputs.eventTitle),
        eventDate: compact(inputs.eventDate),
        eventTime: compact(inputs.eventTime),
        eventLocation: compact(inputs.eventLocation),
        speakerName: compact(inputs.eventHost) || compact(inputs.speakerName),
        speakerRole: compact(inputs.speakerRole) || compact(inputs.speakerCredentials),
    };
}

export function mergeContentOwnership(base: ContentOwnershipMap, override?: Partial<ContentOwnershipMap> | null): ContentOwnershipMap {
    const bonuses = unique([...(base.bonuses || []), ...((override?.bonuses || []).map((item) => compact(item)).filter(Boolean))]);
    const proofItems = unique([...(base.proofItems || []), ...((override?.proofItems || []).map((item) => compact(item)).filter(Boolean))]);
    return {
        primaryHeadline: compact(override?.primaryHeadline) || compact(base.primaryHeadline),
        supportingHeadline: compact(override?.supportingHeadline) || compact(base.supportingHeadline),
        offerPrice: compact(override?.offerPrice) || compact(base.offerPrice),
        originalPrice: compact(override?.originalPrice) || compact(base.originalPrice),
        savingsText: compact(override?.savingsText) || compact(base.savingsText),
        bonuses,
        ctaText: compact(override?.ctaText) || compact(base.ctaText),
        urgencyText: compact(override?.urgencyText) || compact(base.urgencyText),
        proofItems,
        badgeText: compact(override?.badgeText) || compact(base.badgeText),
        eventTitle: compact(override?.eventTitle) || compact(base.eventTitle),
        eventDate: compact(override?.eventDate) || compact(base.eventDate),
        eventTime: compact(override?.eventTime) || compact(base.eventTime),
        eventLocation: compact(override?.eventLocation) || compact(base.eventLocation),
        speakerName: compact(override?.speakerName) || compact(base.speakerName),
        speakerRole: compact(override?.speakerRole) || compact(base.speakerRole),
    };
}

function normalizeMachineAssignments<T extends { id: string; source: TextOwnershipSource; value: string }>(items: T[] | undefined | null): T[] {
    return (items || [])
        .map((item) => ({
            ...item,
            id: compact(item?.id),
            source: (item?.source || 'overlay') as TextOwnershipSource,
            value: compact(item?.value),
        }))
        .filter((item) => item.id && item.value) as T[];
}

function normalizeMachinePlan(payload: Partial<StructuredBuildPlanPayload> | null | undefined, fallbackOwnership: ContentOwnershipMap): StructuredBuildPlanPayload {
    return {
        blueprint: compact(payload?.blueprint),
        zones: normalizeMachineAssignments(payload?.zones as StructuredZoneAssignment[]),
        overlayAssignments: normalizeMachineAssignments(payload?.overlayAssignments as StructuredOverlayAssignment[]),
        mustShowAssignments: normalizeMachineAssignments(payload?.mustShowAssignments as StructuredMustShowAssignment[]),
        ownership: mergeContentOwnership(fallbackOwnership, payload?.ownership || {}),
    };
}

export function serializeBuildPlanEnvelope(blueprint: string, machinePlan: StructuredBuildPlanPayload): string {
    const cleanBlueprint = compact(blueprint);
    const normalizedPlan = normalizeMachinePlan(machinePlan, machinePlan.ownership || {});
    return `${cleanBlueprint}\n\n${BUILD_PLAN_MACHINE_BLOCK_START}\n${JSON.stringify(normalizedPlan)}\n${BUILD_PLAN_MACHINE_BLOCK_END}`;
}

export function parseBuildPlanEnvelope(rawBuildPlan: string): BuildPlanEnvelope {
    const raw = rawBuildPlan || '';
    const start = raw.indexOf(BUILD_PLAN_MACHINE_BLOCK_START);
    const end = raw.indexOf(BUILD_PLAN_MACHINE_BLOCK_END);
    if (start === -1 || end === -1 || end <= start) {
        return { blueprint: raw.trim(), machinePlan: null };
    }

    const blueprint = `${raw.slice(0, start)}${raw.slice(end + BUILD_PLAN_MACHINE_BLOCK_END.length)}`.trim();
    const jsonBlock = raw.slice(start + BUILD_PLAN_MACHINE_BLOCK_START.length, end).trim();
    try {
        const parsed = JSON.parse(jsonBlock);
        const fallbackOwnership = mergeContentOwnership({}, parsed?.ownership || {});
        return {
            blueprint,
            machinePlan: normalizeMachinePlan(parsed, fallbackOwnership),
        };
    } catch {
        return { blueprint, machinePlan: null };
    }
}

function extractBalancedJsonBlock(raw: string): string {
    const trimmed = (raw || '').replace(/^\uFEFF/, '').trim();
    if (!trimmed) return '{}';
    if ((trimmed.startsWith('```json') || trimmed.startsWith('```JSON') || trimmed.startsWith('```')) && trimmed.endsWith('```')) {
        const lines = trimmed.split(/\r?\n/);
        if (lines.length >= 2) {
            return lines.slice(1, -1).join('\n').trim() || '{}';
        }
    }

    const openingChars = new Set(['{', '[']);
    let start = -1;
    for (let i = 0; i < trimmed.length; i++) {
        if (openingChars.has(trimmed[i])) {
            start = i;
            break;
        }
    }
    if (start === -1) return trimmed;

    const stack: string[] = [];
    let inString = false;
    let escape = false;
    for (let i = start; i < trimmed.length; i++) {
        const ch = trimmed[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') {
            stack.push('}');
        } else if (ch === '[') {
            stack.push(']');
        } else if ((ch === '}' || ch === ']') && stack.length > 0) {
            const expected = stack[stack.length - 1];
            if (expected === ch) {
                stack.pop();
                if (stack.length === 0) {
                    return trimmed.slice(start, i + 1);
                }
            }
        }
    }
    return trimmed.slice(start);
}

export function parseStructuredBuildPlanResponse(rawResponse: string, fallbackOwnership: ContentOwnershipMap): StructuredBuildPlanPayload {
    const parsed = JSON.parse(extractBalancedJsonBlock(rawResponse));
    return normalizeMachinePlan(parsed, fallbackOwnership);
}

export function buildPlanSlotMap(
    buildPlan: string,
    contract: FullLayoutContract,
    ownership: ContentOwnershipMap,
): BuildPlanSlotMap {
    const lines = extractZoneLines(buildPlan);
    const normalizedPlan = normalize(buildPlan);
    const requiredZones = Object.entries(contract.zones)
        .filter(([, zone]) => zone.priority <= 2 || !!zone.minItems || !!zone.minSizePct)
        .map(([zoneName]) => zoneName);

    const filledZones: Record<string, SlotFill> = {};
    for (const zoneName of requiredZones) {
        const matchedLine = lines.find((line) => zoneIsFilled(zoneName, normalize(line)));
        if (matchedLine) {
            filledZones[zoneName] = {
                source: zoneName === 'cta' ? 'cta' : zoneName === 'headline' ? 'headline' : zoneName === 'event_metadata' ? 'overlay' : 'subheadline',
                value: matchedLine,
            };
            continue;
        }
        if (zoneName === 'headline' && compact(ownership.primaryHeadline)) {
            filledZones[zoneName] = { source: 'headline', value: ownership.primaryHeadline || '' };
        } else if (zoneName === 'cta' && compact(ownership.ctaText)) {
            filledZones[zoneName] = { source: 'cta', value: ownership.ctaText || '' };
        } else if (zoneName === 'event_metadata' && (compact(ownership.eventDate) || compact(ownership.eventTime) || compact(ownership.eventLocation))) {
            filledZones[zoneName] = { source: 'overlay', value: [ownership.eventDate, ownership.eventTime, ownership.eventLocation].filter(Boolean).join(' | ') };
        }
    }

    const missingZones = requiredZones.filter((zoneName) => !filledZones[zoneName]);
    const missingMustShow = contract.mustShow.filter((token) => !mustShowSatisfied(token, normalizedPlan, ownership));
    const overlaySlots = contract.overlaySlots.map((slot) => slot.id);
    const missingOverlaySlots = overlaySlots.filter((slotId) => !overlayIsFilled(slotId, normalizedPlan, ownership));

    const reasons: string[] = [];
    if (missingZones.length > 0) reasons.push(`Missing required zones: ${missingZones.join(', ')}`);
    if (missingMustShow.length > 0) reasons.push(`Missing must-show elements: ${missingMustShow.join(', ')}`);
    if (missingOverlaySlots.length > 0) reasons.push(`Missing overlay slots: ${missingOverlaySlots.join(', ')}`);

    return {
        requiredZones,
        filledZones,
        overlaySlots,
        missingZones,
        missingMustShow,
        missingOverlaySlots,
        contractCheck: {
            passed: reasons.length === 0,
            reasons,
        },
    };
}

/** Normalize slot/zone/overlay IDs for case-insensitive comparison.
 *  Lowercases and strips underscores/spaces/hyphens so "ValueItem", "value_item", and "valueItem" all match. */
const normalizeSlotId = (id: string): string => (id || '').toLowerCase().replace(/[_\s-]/g, '');

export function validateStructuredBuildPlan(
    machinePlan: StructuredBuildPlanPayload,
    contract: FullLayoutContract,
    fallbackOwnership: ContentOwnershipMap,
): BuildPlanSlotMap {
    const normalizedMachinePlan = normalizeMachinePlan(machinePlan, fallbackOwnership);
    const requiredZones = Object.entries(contract.zones)
        .filter(([, zone]) => zone.priority <= 2 || !!zone.minItems || !!zone.minSizePct)
        .map(([zoneName]) => zoneName);

    const filledZones: Record<string, SlotFill> = {};
    for (const zoneName of requiredZones) {
        const normalizedZoneName = normalizeSlotId(zoneName);
        const zoneAssignment = normalizedMachinePlan.zones.find((zone) => normalizeSlotId(zone.id) === normalizedZoneName);
        if (zoneAssignment) {
            filledZones[zoneName] = { source: zoneAssignment.source, value: zoneAssignment.value };
            continue;
        }
        if (zoneName === 'headline' && compact(normalizedMachinePlan.ownership.primaryHeadline)) {
            filledZones[zoneName] = { source: 'headline', value: normalizedMachinePlan.ownership.primaryHeadline || '' };
        } else if (zoneName === 'cta' && compact(normalizedMachinePlan.ownership.ctaText)) {
            filledZones[zoneName] = { source: 'cta', value: normalizedMachinePlan.ownership.ctaText || '' };
        } else if (zoneName === 'event_metadata' && (compact(normalizedMachinePlan.ownership.eventDate) || compact(normalizedMachinePlan.ownership.eventTime) || compact(normalizedMachinePlan.ownership.eventLocation))) {
            filledZones[zoneName] = { source: 'overlay', value: [normalizedMachinePlan.ownership.eventDate, normalizedMachinePlan.ownership.eventTime, normalizedMachinePlan.ownership.eventLocation].filter(Boolean).join(' | ') };
        }
    }

    const missingZones = requiredZones.filter((zoneName) => !filledZones[zoneName]);
    const machineMustShow = new Set(normalizedMachinePlan.mustShowAssignments.map((item) => normalizeSlotId(item.id)));
    const missingMustShow = contract.mustShow.filter((token) => {
        if (machineMustShow.has(normalizeSlotId(token))) return false;
        return !mustShowSatisfied(token, normalize(normalizedMachinePlan.blueprint), normalizedMachinePlan.ownership);
    });

    const overlaySlots = contract.overlaySlots.map((slot) => slot.id);
    const overlayMap = new Set(normalizedMachinePlan.overlayAssignments.map((item) => normalizeSlotId(item.id)));
    const missingOverlaySlots = overlaySlots.filter((slotId) => {
        if (overlayMap.has(normalizeSlotId(slotId))) return false;
        return !overlayIsFilled(slotId, normalize(normalizedMachinePlan.blueprint), normalizedMachinePlan.ownership);
    });

    const reasons: string[] = [];
    if (!compact(normalizedMachinePlan.blueprint)) reasons.push('Missing blueprint text');
    if (missingZones.length > 0) reasons.push(`Missing required zones: ${missingZones.join(', ')}`);
    if (missingMustShow.length > 0) reasons.push(`Missing must-show elements: ${missingMustShow.join(', ')}`);
    if (missingOverlaySlots.length > 0) reasons.push(`Missing overlay slots: ${missingOverlaySlots.join(', ')}`);

    return {
        requiredZones,
        filledZones,
        overlaySlots,
        missingZones,
        missingMustShow,
        missingOverlaySlots,
        contractCheck: {
            passed: reasons.length === 0,
            reasons,
        },
    };
}
