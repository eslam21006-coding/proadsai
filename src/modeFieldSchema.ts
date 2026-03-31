/**
 * modeFieldSchema.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * MODE-SPECIFIC STRUCTURED DATA SCHEMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Single source of truth for:
 *   - Which modes require structured input
 *   - Which fields are required vs optional per mode
 *   - Validation rules
 *   - Payload compilation (flat AdInputs → normalized modePayload)
 *   - Downgrade logic when required data is missing
 *
 * Used by:
 *   - InputForm.tsx (dynamic UI sections)
 *   - Validation gate before generation
 *   - generators.ts (prompt injection)
 *   - layoutContract.ts (contract enrichment)
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ─── MODE DATA TIER ─────────────────────────────────────────────────────────
// Determines whether a mode needs extra user fields

export type ModeDataTier =
    | 'none'       // standard_hero, before_after — no extra fields
    | 'optional'   // dashboard_preview, community_card — optional enhancements
    | 'required';  // value_stack, event_ticket, feature_highlight, premium_package

// ─── FIELD DEFINITION ───────────────────────────────────────────────────────

export interface ModeFieldDef {
    key: string;              // maps to AdInputs property name
    labelEn: string;
    labelAr: string;
    type: 'text' | 'textarea' | 'number' | 'list';
    required: boolean;
    placeholderEn: string;
    placeholderAr: string;
    gridCol?: 1 | 2;        // 1 = full width, 2 = half width (for grid layout)
    minItems?: number;       // for textarea lists (newline-separated)
    maxItems?: number;
    rows?: number;           // textarea rows
}

// ─── MODE FIELD SECTION ─────────────────────────────────────────────────────

export interface ModeFieldSection {
    /** Which creative mode IDs trigger this section */
    triggerModes: string[];
    /** Section header */
    titleEn: string;
    titleAr: string;
    /** Icon class (FontAwesome) */
    icon: string;
    /** Tailwind color theme for the section border/bg */
    colorTheme: 'blue' | 'purple' | 'emerald' | 'amber' | 'pink' | 'cyan' | 'rose';
    /** Data tier — determines validation behavior */
    tier: ModeDataTier;
    /** Fields in this section */
    fields: ModeFieldDef[];
    /** Message shown when required fields are missing (blocks or downgrades) */
    incompleteMessageEn: string;
    incompleteMessageAr: string;
    /** The mode to downgrade to if required data is missing (null = block) */
    downgradeMode: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// THE SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

export const MODE_FIELD_SECTIONS: ModeFieldSection[] = [

    // ─── VALUE STACK (REQUIRED TIER) ────────────────────────────────────────
    {
        triggerModes: ['value_stack'],
        titleEn: 'Value Stack Details',
        titleAr: 'بيانات تراكم القيمة',
        icon: 'fa-solid fa-layer-group',
        colorTheme: 'blue',
        tier: 'required',
        fields: [
            { key: 'valueStackTitle', labelEn: 'Offer Title', labelAr: 'عنوان العرض', type: 'text', required: false, placeholderEn: 'e.g. The Complete Coaching Program', placeholderAr: 'مثال: برنامج الكوتشينغ المتكامل' },
            { key: 'valueStackItems', labelEn: 'Included Items', labelAr: 'العناصر المشمولة', type: 'list', required: false, placeholderEn: 'e.g. 12 training modules', placeholderAr: 'مثال: 12 وحدة تعليمية', rows: 3 },
            { key: 'valueStackBonuses', labelEn: 'Bonuses', labelAr: 'البونص', type: 'list', required: false, placeholderEn: 'e.g. Free ebook', placeholderAr: 'مثال: كتاب مجاني' },
            { key: 'valueStackPrice', labelEn: 'Price', labelAr: 'السعر', type: 'text', required: false, placeholderEn: '$497', placeholderAr: '$497', gridCol: 2 },
            { key: 'valueStackSavings', labelEn: 'Savings', labelAr: 'التوفير', type: 'text', required: false, placeholderEn: 'Save $500', placeholderAr: 'وفر $500', gridCol: 2 },
            { key: 'valueStackOriginalValue', labelEn: 'Original Value', labelAr: 'القيمة الأصلية', type: 'text', required: false, placeholderEn: '$2,997', placeholderAr: '$2,997', gridCol: 2 },
            { key: 'valueStackGuarantee', labelEn: 'Guarantee', labelAr: 'الضمان', type: 'text', required: false, placeholderEn: '30-day money-back', placeholderAr: 'ضمان 30 يوم', gridCol: 2 },
            { key: 'valueStackDeliveryFormat', labelEn: 'Delivery Format', labelAr: 'طريقة التسليم', type: 'text', required: false, placeholderEn: 'Online platform + Zoom calls', placeholderAr: 'منصة إلكترونية + مكالمات زوم', gridCol: 2 },
            { key: 'valueStackProofStatement', labelEn: 'Proof / Result', labelAr: 'إثبات / نتيجة', type: 'text', required: false, placeholderEn: '340+ graduates, avg 3x revenue', placeholderAr: '340+ متخرج، متوسط 3x إيرادات', gridCol: 2 },
        ],
        incompleteMessageEn: 'Value Stack works best with an Offer Title and Included Items.',
        incompleteMessageAr: 'تراكم القيمة يعمل بشكل أفضل مع عنوان العرض وعناصر مشمولة.',
        downgradeMode: 'standard_hero',
    },

    // ─── EVENT TICKET (REQUIRED TIER) ───────────────────────────────────────
    {
        triggerModes: ['event_ticket', 'speaker_card', 'day_strip', 'webinar_screen'],
        titleEn: 'Event Details',
        titleAr: 'بيانات الحدث',
        icon: 'fa-solid fa-calendar-day',
        colorTheme: 'purple',
        tier: 'required',
        fields: [
            { key: 'eventTitle', labelEn: 'Event Title *', labelAr: 'اسم الحدث *', type: 'text', required: true, placeholderEn: 'e.g. Ad Secrets Workshop', placeholderAr: 'مثال: ورشة أسرار الإعلانات' },
            { key: 'eventDate', labelEn: 'Date *', labelAr: 'التاريخ *', type: 'text', required: true, placeholderEn: 'Thursday, Jan 15', placeholderAr: 'الخميس 15 يناير', gridCol: 2 },
            { key: 'eventTime', labelEn: 'Time', labelAr: 'الوقت', type: 'text', required: false, placeholderEn: '8:00 PM', placeholderAr: '8:00 مساءً', gridCol: 2 },
            { key: 'eventLocation', labelEn: 'Location', labelAr: 'المكان', type: 'text', required: false, placeholderEn: 'Online / Zoom', placeholderAr: 'أونلاين / زوم', gridCol: 2 },
            { key: 'eventHost', labelEn: 'Host / Speaker', labelAr: 'المتحدث', type: 'text', required: false, placeholderEn: 'Speaker name', placeholderAr: 'اسم المتحدث', gridCol: 2 },
            { key: 'eventSeatLimit', labelEn: 'Seat Limit', labelAr: 'عدد المقاعد', type: 'text', required: false, placeholderEn: '50 seats only', placeholderAr: '50 مقعد فقط', gridCol: 2 },
            { key: 'eventTicketTier', labelEn: 'Ticket Tier / Price', labelAr: 'فئة التذكرة / السعر', type: 'text', required: false, placeholderEn: 'VIP — $97 / Free', placeholderAr: 'VIP — $97 / مجاني', gridCol: 2 },
        ],
        incompleteMessageEn: 'Event modes require Event Title and Date.',
        incompleteMessageAr: 'أوضاع الحدث تحتاج اسم الحدث والتاريخ.',
        downgradeMode: 'standard_hero',
    },

    // ─── FEATURE GRID (REQUIRED TIER) ──────────────────────────────────────
    {
        triggerModes: ['feature_highlight'],
        titleEn: 'Feature List',
        titleAr: 'قائمة الميزات',
        icon: 'fa-solid fa-list-check',
        colorTheme: 'emerald',
        tier: 'required',
        fields: [
            { key: 'featureList', labelEn: 'Features * (one per line, 3-6 features)', labelAr: 'الميزات * (سطر لكل ميزة، 3-6 ميزات)', type: 'textarea', required: true, placeholderEn: 'Real-time analytics\nSmart automation\n24/7 support\nFacebook integration', placeholderAr: 'تحليلات فورية\nأتمتة ذكية\nدعم 24/7\nتكامل مع فيسبوك', minItems: 3, maxItems: 6, rows: 4 },
            { key: 'featureDescriptions', labelEn: 'Brief descriptions (optional)', labelAr: 'وصف مختصر لكل ميزة (اختياري)', type: 'textarea', required: false, placeholderEn: 'One line per feature', placeholderAr: 'سطر واحد لكل ميزة', rows: 3 },
            { key: 'featureIcons', labelEn: 'Icons / Emojis (optional, one per line)', labelAr: 'أيقونات / إيموجي (اختياري، سطر لكل ميزة)', type: 'textarea', required: false, placeholderEn: '📊\n🤖\n🛡️\n🔗', placeholderAr: '📊\n🤖\n🛡️\n🔗', rows: 2 },
            { key: 'featureGroupLabel', labelEn: 'Grouping Label', labelAr: 'تسمية المجموعة', type: 'text', required: false, placeholderEn: 'e.g. "All-in-one platform"', placeholderAr: 'مثال: "منصة متكاملة"' },
        ],
        incompleteMessageEn: 'Feature Highlight requires at least 3 features.',
        incompleteMessageAr: 'إبراز الميزات يحتاج 3 ميزات على الأقل.',
        downgradeMode: 'standard_hero',
    },

    // ─── OFFER / PRICING CARD (REQUIRED TIER) ──────────────────────────────
    {
        triggerModes: ['premium_package', 'limited_access'],
        titleEn: 'Offer Details',
        titleAr: 'بيانات العرض',
        icon: 'fa-solid fa-tag',
        colorTheme: 'amber',
        tier: 'required',
        fields: [
            { key: 'offerCardTitle', labelEn: 'Offer Title *', labelAr: 'عنوان العرض *', type: 'text', required: true, placeholderEn: 'e.g. The Diamond Package', placeholderAr: 'مثال: الحزمة الماسية' },
            { key: 'offerCardPrice', labelEn: 'Price', labelAr: 'السعر', type: 'text', required: false, placeholderEn: '$997', placeholderAr: '$997', gridCol: 2 },
            { key: 'offerCardOldPrice', labelEn: 'Old Price', labelAr: 'السعر القديم', type: 'text', required: false, placeholderEn: '$1,997', placeholderAr: '$1,997', gridCol: 2 },
            { key: 'offerCardDiscount', labelEn: 'Discount', labelAr: 'الخصم', type: 'text', required: false, placeholderEn: '50% OFF', placeholderAr: '50% خصم', gridCol: 2 },
            { key: 'offerCardPaymentPlan', labelEn: 'Payment Plan', labelAr: 'خطة الدفع', type: 'text', required: false, placeholderEn: '3 × $332/mo', placeholderAr: '3 × $332/شهر', gridCol: 2 },
            { key: 'offerCardInclusions', labelEn: 'What\'s Included', labelAr: 'المشمولات', type: 'textarea', required: false, placeholderEn: 'Ebook + 3 sessions + Private group', placeholderAr: 'كتاب + 3 جلسات + مجموعة خاصة', rows: 2 },
            { key: 'offerCardGuarantee', labelEn: 'Guarantee', labelAr: 'الضمان', type: 'text', required: false, placeholderEn: '30-day money-back', placeholderAr: 'ضمان 30 يوم' },
        ],
        incompleteMessageEn: 'Offer Card requires an Offer Title.',
        incompleteMessageAr: 'بطاقة العرض تحتاج عنوان العرض.',
        downgradeMode: 'standard_hero',
    },

    // ─── TESTIMONIAL WALL (OPTIONAL TIER — screenshots required but in separate flow) ───
    {
        triggerModes: ['testimonial_wall', 'community_card'],
        titleEn: 'Testimonial / Social Proof',
        titleAr: 'شهادات / إثبات اجتماعي',
        icon: 'fa-solid fa-comment-dots',
        colorTheme: 'pink',
        tier: 'optional',
        fields: [
            { key: 'testimonialManualText', labelEn: 'Testimonial text (if no screenshots)', labelAr: 'نص الشهادة (إذا لم تتوفر لقطات شاشة)', type: 'textarea', required: false, placeholderEn: '"Ahmad got 18 calls in 10 days"\n"Sara went from 3 to 47 clients"', placeholderAr: '"أحمد حصل على 18 مكالمة في 10 أيام"\n"سارة انتقلت من 3 إلى 47 عميل"', rows: 3 },
            { key: 'testimonialSpeakerName', labelEn: 'Speaker Name', labelAr: 'اسم المتحدث', type: 'text', required: false, placeholderEn: 'Ahmad K.', placeholderAr: 'أحمد ك.' },
        ],
        incompleteMessageEn: 'Upload testimonial screenshots or enter text for best results.',
        incompleteMessageAr: 'ارفع لقطات شهادات أو أدخل نصاً للحصول على أفضل النتائج.',
        downgradeMode: null, // doesn't block — works with AI inference
    },

    // ─── DASHBOARD / APP PREVIEW (OPTIONAL TIER) ──────────────────────────
    {
        triggerModes: ['dashboard_preview', 'mobile_app_card', 'platform_screenshot'],
        titleEn: 'App / Dashboard Details',
        titleAr: 'تفاصيل التطبيق / لوحة التحكم',
        icon: 'fa-solid fa-desktop',
        colorTheme: 'cyan',
        tier: 'optional',
        fields: [
            { key: 'appDashboardLabel', labelEn: 'Dashboard/Screen Label', labelAr: 'تسمية الشاشة', type: 'text', required: false, placeholderEn: 'e.g. "Analytics Dashboard"', placeholderAr: 'مثال: "لوحة التحليلات"' },
            { key: 'appKeyMetric', labelEn: 'Key Metric to Highlight', labelAr: 'مقياس رئيسي للتسليط عليه', type: 'text', required: false, placeholderEn: 'e.g. "+340% ROI"', placeholderAr: 'مثال: "+340% عائد"' },
        ],
        incompleteMessageEn: '',
        incompleteMessageAr: '',
        downgradeMode: null,
    },

    // ─── AUTHORITY / PROOF (OPTIONAL TIER) ─────────────────────────────────
    {
        triggerModes: ['certificate'],
        titleEn: 'Authority / Proof Details',
        titleAr: 'تفاصيل السلطة / الإثبات',
        icon: 'fa-solid fa-award',
        colorTheme: 'rose',
        tier: 'optional',
        fields: [
            { key: 'authorityCredentials', labelEn: 'Credentials / Achievements', labelAr: 'المؤهلات / الإنجازات', type: 'text', required: false, placeholderEn: '7 years, 500+ clients, Forbes Arabia', placeholderAr: '7 سنوات، 500+ عميل، فوربس العربية' },
            { key: 'authorityNumbers', labelEn: 'Key Numbers', labelAr: 'أرقام رئيسية', type: 'text', required: false, placeholderEn: '$2M revenue, 340+ students', placeholderAr: '$2M إيرادات، 340+ طالب' },
        ],
        incompleteMessageEn: '',
        incompleteMessageAr: '',
        downgradeMode: null,
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// MODE DATA TIER LOOKUP
// ═══════════════════════════════════════════════════════════════════════════

/** Quick lookup: mode ID → data tier */
const MODE_TIER_MAP: Record<string, ModeDataTier> = {};
for (const section of MODE_FIELD_SECTIONS) {
    for (const mode of section.triggerModes) {
        MODE_TIER_MAP[mode] = section.tier;
    }
}

// Modes with no fields at all
const NO_FIELD_MODES = [
    'standard_hero', 'book_mockup', 'device_mockup', 'preview_card',
    'module_preview', 'inside_look',
];
for (const m of NO_FIELD_MODES) {
    MODE_TIER_MAP[m] = 'none';
}

export function getModeDataTier(modeId: string): ModeDataTier {
    return MODE_TIER_MAP[modeId] || 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// GET ACTIVE SECTIONS for selected modes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Given the current mode selection, returns which field sections should be displayed.
 * Handles deduplication — if two modes share a section, it appears only once.
 */
export function getActiveSections(selectedModes: string[]): ModeFieldSection[] {
    const seen = new Set<string>();
    const result: ModeFieldSection[] = [];

    for (const section of MODE_FIELD_SECTIONS) {
        // Check if any trigger mode is in the selection
        const isActive = section.triggerModes.some(m => selectedModes.includes(m));
        if (isActive) {
            // Dedup key: use first trigger mode as identity
            const key = section.triggerModes[0];
            if (!seen.has(key)) {
                seen.add(key);
                result.push(section);
            }
        }
    }

    return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

export interface ModeValidationResult {
    valid: boolean;
    errors: { modeId: string; messageEn: string; messageAr: string }[];
    downgrades: { fromMode: string; toMode: string; reasonEn: string; reasonAr: string }[];
}

/**
 * Validates mode-specific fields against the schema.
 * Returns errors for blocking or downgrades for safe fallback.
 */
export function validateModeFields(
    selectedModes: string[],
    inputs: Record<string, any>,
): ModeValidationResult {
    const errors: ModeValidationResult['errors'] = [];
    const downgrades: ModeValidationResult['downgrades'] = [];

    const activeSections = getActiveSections(selectedModes);

    for (const section of activeSections) {
        if (section.tier !== 'required') continue;

        // Check required fields
        const requiredFields = section.fields.filter(f => f.required);
        let hasAllRequired = true;

        for (const field of requiredFields) {
            const val = (inputs[field.key] || '').trim();
            if (!val) {
                hasAllRequired = false;
                break;
            }
            // Check minItems for textarea lists
            if (field.minItems && field.type === 'textarea') {
                const lines = val.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                if (lines.length < field.minItems) {
                    hasAllRequired = false;
                    break;
                }
            }
        }

        if (!hasAllRequired) {
            // Find which trigger mode is active
            const activeMode = section.triggerModes.find(m => selectedModes.includes(m)) || section.triggerModes[0];

            if (section.downgradeMode) {
                downgrades.push({
                    fromMode: activeMode,
                    toMode: section.downgradeMode,
                    reasonEn: section.incompleteMessageEn,
                    reasonAr: section.incompleteMessageAr,
                });
            } else {
                errors.push({
                    modeId: activeMode,
                    messageEn: section.incompleteMessageEn,
                    messageAr: section.incompleteMessageAr,
                });
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        downgrades,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYLOAD COMPILATION — flat AdInputs → normalized modePayload
// ═══════════════════════════════════════════════════════════════════════════

export interface ValueStackPayload {
    offerTitle: string;
    items: string[];
    bonuses?: string;
    price?: string;
    savings?: string;
    originalValue?: string;
    guarantee?: string;
    deliveryFormat?: string;
    proofStatement?: string;
}

export interface EventTicketPayload {
    eventTitle: string;
    eventDate: string;
    eventTime?: string;
    location?: string;
    host?: string;
    seatLimit?: string;
    ticketTier?: string;
}

export interface FeatureGridPayload {
    items: string[];
    descriptions?: string[];
    icons?: string[];
    groupLabel?: string;
}

export interface OfferCardPayload {
    offerTitle: string;
    price?: string;
    oldPrice?: string;
    discount?: string;
    inclusions?: string[];
    paymentPlan?: string;
    guarantee?: string;
}

export interface TestimonialPayload {
    manualText?: string[];
    speakerName?: string;
    // screenshots handled separately via testimonialScreenshots/testimonialTexts
}

export interface DashboardPayload {
    screenLabel?: string;
    keyMetric?: string;
}

export interface AuthorityPayload {
    credentials?: string;
    numbers?: string;
}

export interface ModePayload {
    value_stack?: ValueStackPayload;
    event_ticket?: EventTicketPayload;
    feature_grid?: FeatureGridPayload;
    offer_card?: OfferCardPayload;
    testimonial?: TestimonialPayload;
    dashboard?: DashboardPayload;
    authority?: AuthorityPayload;
}

/** Split newline-separated string into trimmed non-empty items */
function splitLines(s: string | undefined | null): string[] {
    if (!s) return [];
    return s.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

function orUndef(s: string | undefined | null): string | undefined {
    const v = (s || '').trim();
    return v || undefined;
}

/**
 * Compiles the flat AdInputs fields into a normalized ModePayload.
 * This is called once before passing to generators.
 */
export function compileModePayload(
    selectedModes: string[],
    inputs: Record<string, any>,
): ModePayload {
    const payload: ModePayload = {};
    const hasMode = (id: string) => selectedModes.includes(id);

    // ── Value Stack ──
    if (hasMode('value_stack')) {
        const items = splitLines(inputs.valueStackItems);
        if (inputs.valueStackTitle?.trim() && items.length >= 2) {
            payload.value_stack = {
                offerTitle: inputs.valueStackTitle.trim(),
                items,
                bonuses: orUndef(inputs.valueStackBonuses),
                price: orUndef(inputs.valueStackPrice),
                savings: orUndef(inputs.valueStackSavings),
                originalValue: orUndef(inputs.valueStackOriginalValue),
                guarantee: orUndef(inputs.valueStackGuarantee),
                deliveryFormat: orUndef(inputs.valueStackDeliveryFormat),
                proofStatement: orUndef(inputs.valueStackProofStatement),
            };
        }
    }

    // ── Event Ticket ──
    if (hasMode('event_ticket') || hasMode('speaker_card') || hasMode('day_strip') || hasMode('webinar_screen')) {
        if (inputs.eventTitle?.trim() && inputs.eventDate?.trim()) {
            payload.event_ticket = {
                eventTitle: inputs.eventTitle.trim(),
                eventDate: inputs.eventDate.trim(),
                eventTime: orUndef(inputs.eventTime),
                location: orUndef(inputs.eventLocation),
                host: orUndef(inputs.eventHost),
                seatLimit: orUndef(inputs.eventSeatLimit),
                ticketTier: orUndef(inputs.eventTicketTier),
            };
        }
    }

    // ── Feature Grid ──
    if (hasMode('feature_highlight')) {
        const items = splitLines(inputs.featureList);
        if (items.length >= 3) {
            payload.feature_grid = {
                items,
                descriptions: splitLines(inputs.featureDescriptions).length > 0
                    ? splitLines(inputs.featureDescriptions)
                    : undefined,
                icons: splitLines(inputs.featureIcons).length > 0
                    ? splitLines(inputs.featureIcons)
                    : undefined,
                groupLabel: orUndef(inputs.featureGroupLabel),
            };
        }
    }

    // ── Offer Card ──
    if (hasMode('premium_package') || hasMode('limited_access')) {
        if (inputs.offerCardTitle?.trim()) {
            payload.offer_card = {
                offerTitle: inputs.offerCardTitle.trim(),
                price: orUndef(inputs.offerCardPrice),
                oldPrice: orUndef(inputs.offerCardOldPrice),
                discount: orUndef(inputs.offerCardDiscount),
                inclusions: splitLines(inputs.offerCardInclusions).length > 0
                    ? splitLines(inputs.offerCardInclusions)
                    : undefined,
                paymentPlan: orUndef(inputs.offerCardPaymentPlan),
                guarantee: orUndef(inputs.offerCardGuarantee),
            };
        }
    }

    // ── Testimonial ──
    if (hasMode('testimonial_wall') || hasMode('community_card')) {
        const texts = splitLines(inputs.testimonialManualText);
        if (texts.length > 0 || inputs.testimonialSpeakerName?.trim()) {
            payload.testimonial = {
                manualText: texts.length > 0 ? texts : undefined,
                speakerName: orUndef(inputs.testimonialSpeakerName),
            };
        }
    }

    // ── Dashboard ──
    if (hasMode('dashboard_preview') || hasMode('mobile_app_card') || hasMode('platform_screenshot')) {
        if (inputs.appDashboardLabel?.trim() || inputs.appKeyMetric?.trim()) {
            payload.dashboard = {
                screenLabel: orUndef(inputs.appDashboardLabel),
                keyMetric: orUndef(inputs.appKeyMetric),
            };
        }
    }

    // ── Authority ──
    if (hasMode('certificate')) {
        if (inputs.authorityCredentials?.trim() || inputs.authorityNumbers?.trim()) {
            payload.authority = {
                credentials: orUndef(inputs.authorityCredentials),
                numbers: orUndef(inputs.authorityNumbers),
            };
        }
    }

    return payload;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT INJECTION — Converts ModePayload to structured prompt text
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generates a structured data block for injection into generation prompts.
 * This is the EXACT data the model should use — no improvisation needed.
 */
export function getModePayloadPromptBlock(payload: ModePayload): string {
    const blocks: string[] = [];

    if (payload.value_stack) {
        const vs = payload.value_stack;
        blocks.push(`
STRUCTURED DATA — VALUE STACK:
Offer Title: "${vs.offerTitle}"
Included Items (${vs.items.length}):
${vs.items.map((item, i) => `  ${i + 1}. ${item}`).join('\n')}
${vs.bonuses ? `Bonuses: "${vs.bonuses}"` : ''}
${vs.price ? `Price: ${vs.price}` : ''}${vs.originalValue ? ` (Original: ${vs.originalValue})` : ''}
${vs.savings ? `Savings: ${vs.savings}` : ''}
${vs.guarantee ? `Guarantee: ${vs.guarantee}` : ''}
${vs.deliveryFormat ? `Delivery: ${vs.deliveryFormat}` : ''}
${vs.proofStatement ? `Proof: ${vs.proofStatement}` : ''}
⚠️ Use EXACTLY these items in the value stack visualization. Do not invent or change items.`);
    }

    if (payload.event_ticket) {
        const et = payload.event_ticket;
        blocks.push(`
STRUCTURED DATA — EVENT:
Event Title: "${et.eventTitle}"
Date: ${et.eventDate}
${et.eventTime ? `Time: ${et.eventTime}` : ''}
${et.location ? `Location: ${et.location}` : ''}
${et.host ? `Host/Speaker: ${et.host}` : ''}
${et.seatLimit ? `Seat Limit: ${et.seatLimit}` : ''}
${et.ticketTier ? `Tier/Price: ${et.ticketTier}` : ''}
⚠️ Render these event details EXACTLY as provided on the ticket design.`);
    }

    if (payload.feature_grid) {
        const fg = payload.feature_grid;
        blocks.push(`
STRUCTURED DATA — FEATURES:
${fg.groupLabel ? `Group Label: "${fg.groupLabel}"` : ''}
Features (${fg.items.length}):
${fg.items.map((item, i) => {
            const icon = fg.icons?.[i] || '';
            const desc = fg.descriptions?.[i] || '';
            return `  ${i + 1}. ${icon ? icon + ' ' : ''}${item}${desc ? ` — ${desc}` : ''}`;
        }).join('\n')}
⚠️ Display EXACTLY these features in the grid. Do not add or remove features.`);
    }

    if (payload.offer_card) {
        const oc = payload.offer_card;
        blocks.push(`
STRUCTURED DATA — OFFER CARD:
Offer Title: "${oc.offerTitle}"
${oc.price ? `Price: ${oc.price}` : ''}${oc.oldPrice ? ` (Was: ${oc.oldPrice})` : ''}
${oc.discount ? `Discount: ${oc.discount}` : ''}
${oc.paymentPlan ? `Payment Plan: ${oc.paymentPlan}` : ''}
${oc.inclusions ? `Inclusions:\n${oc.inclusions.map(i => `  • ${i}`).join('\n')}` : ''}
${oc.guarantee ? `Guarantee: ${oc.guarantee}` : ''}
⚠️ Use EXACTLY these details on the offer card. Prices and discounts must be rendered verbatim.`);
    }

    if (payload.testimonial) {
        const t = payload.testimonial;
        blocks.push(`
STRUCTURED DATA — TESTIMONIAL:
${t.speakerName ? `Speaker: ${t.speakerName}` : ''}
${t.manualText ? `Quotes:\n${t.manualText.map(q => `  "${q}"`).join('\n')}` : ''}
⚠️ Use the EXACT testimonial text provided. Do not paraphrase.`);
    }

    if (payload.dashboard) {
        const d = payload.dashboard;
        blocks.push(`
STRUCTURED DATA — DASHBOARD:
${d.screenLabel ? `Screen Label: "${d.screenLabel}"` : ''}
${d.keyMetric ? `Key Metric: ${d.keyMetric}` : ''}
⚠️ If dashboard screenshot is provided (Box C), overlay these labels on the UI.`);
    }

    if (payload.authority) {
        const a = payload.authority;
        blocks.push(`
STRUCTURED DATA — AUTHORITY:
${a.credentials ? `Credentials: ${a.credentials}` : ''}
${a.numbers ? `Key Numbers: ${a.numbers}` : ''}
⚠️ Display these proof points prominently in the authority zone.`);
    }

    if (blocks.length === 0) return '';

    return `
═══════════════════════════════════════════════════════════════════════════════
MODE-SPECIFIC STRUCTURED DATA (USER-PROVIDED — MANDATORY)
═══════════════════════════════════════════════════════════════════════════════
${blocks.map(b => b.trim()).join('\n\n')}
═══════════════════════════════════════════════════════════════════════════════
`;
}

/**
 * Generates caption-specific anchors from mode payload.
 * Tells the caption writer what structured data exists in the visual.
 */
export function getModePayloadCaptionAnchors(payload: ModePayload): string {
    const parts: string[] = [];

    if (payload.value_stack) {
        parts.push(`The image shows a VALUE STACK with "${payload.value_stack.offerTitle}" and ${payload.value_stack.items.length} included items.${payload.value_stack.price ? ` Price: ${payload.value_stack.price}.` : ''}${payload.value_stack.guarantee ? ` ${payload.value_stack.guarantee}.` : ''}`);
    }
    if (payload.event_ticket) {
        parts.push(`The image shows an EVENT TICKET for "${payload.event_ticket.eventTitle}" on ${payload.event_ticket.eventDate}.${payload.event_ticket.seatLimit ? ` Limited to ${payload.event_ticket.seatLimit}.` : ''}`);
    }
    if (payload.feature_grid) {
        parts.push(`The image shows a FEATURE GRID with ${payload.feature_grid.items.length} features.`);
    }
    if (payload.offer_card) {
        parts.push(`The image shows an OFFER CARD: "${payload.offer_card.offerTitle}"${payload.offer_card.price ? ` at ${payload.offer_card.price}` : ''}.${payload.offer_card.discount ? ` ${payload.offer_card.discount} discount.` : ''}`);
    }

    if (parts.length === 0) return '';

    return `VISUAL DATA CONTEXT: ${parts.join(' ')} Reference these details naturally in the caption — they are visible in the image.`;
}

// ─── PLAN-GATED CREATIVE MODE HELPERS ───────────────────────────────────────
import type { OfferCreativeMode } from './types';
import { PLANS, type UserPlan } from './planconfig';

// Master ordered list — determines slice order for plan gating.
// Starter [0..5], Creator [0..11], Pro/Scaling [0..20]
const ORDERED_CREATIVE_MODES: OfferCreativeMode[] = [
    // ── Starter (first 6) ──
    'standard_hero', 'book_mockup', 'device_mockup', 'event_ticket', 'speaker_card', 'feature_highlight',
    // ── Creator adds (7–12) ──
    'value_stack', 'offer_card', 'community_card', 'testimonial_wall', 'module_preview', 'premium_package',
    // ── Pro/Scaling adds (13–21) ──
    'webinar_screen', 'day_strip', 'platform_screenshot', 'certificate', 'limited_access', 'inside_look',
    'mobile_app_card', 'dashboard_preview', 'preview_card',
];

export { ORDERED_CREATIVE_MODES };

export const getAvailableOfferModes = (plan: UserPlan): Set<OfferCreativeMode> => {
    const max = PLANS[plan]?.features.maxOfferModes ?? 6;
    const modes = new Set(ORDERED_CREATIVE_MODES.slice(0, max));
    modes.add('text_only'); // Always available on all plans — no gating
    return modes;
};

export const isOfferModeAvailable = (plan: UserPlan, mode: OfferCreativeMode): boolean => {
    return getAvailableOfferModes(plan).has(mode);
};