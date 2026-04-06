/**
 * captionValidator.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * POST-GENERATION VALIDATION — Step 5 Caption & Step 3 Blueprint
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Validates generated text AFTER Gemini returns it, before delivering to user.
 * If validation fails, returns a structured repair prompt for regeneration.
 *
 * Validates:
 *   1. Language compliance (Arabic ratio, English leakage)
 *   2. Hook angle reflection
 *   3. Creative mode alignment
 *   4. Mode-specific payload references
 *   5. CTA presence
 *   6. Urgency language (when urgency angle active)
 *   7. Word count bounds
 *
 * Architecture:
 *   generateCaption() → raw text → validateCaption() → pass/fail
 *   If fail: buildRepairPrompt() → re-call Gemini → re-validate (max 1 retry)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { type ModePayload, compileModePayload } from "./modeFieldSchema.js";

// ─── UNICODE RANGES ─────────────────────────────────────────────────────────

/** Count characters in Arabic script range (0600-06FF, FB50-FDFF, FE70-FEFF) */
function countArabicChars(text: string): number {
    let count = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) || 0;
        if (
            (code >= 0x0600 && code <= 0x06FF) ||
            (code >= 0xFB50 && code <= 0xFDFF) ||
            (code >= 0xFE70 && code <= 0xFEFF) ||
            (code >= 0x0750 && code <= 0x077F)
        ) {
            count++;
        }
    }
    return count;
}

/** Count Latin characters (basic ASCII letters) */
function countLatinChars(text: string): number {
    let count = 0;
    for (const ch of text) {
        const code = ch.codePointAt(0) || 0;
        if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) {
            count++;
        }
    }
    return count;
}

// ─── VALIDATION RESULT ──────────────────────────────────────────────────────

export interface CaptionValidationResult {
    passed: boolean;
    checks: {
        name: string;
        passed: boolean;
        detail: string;
    }[];
    /** If not passed, a structured repair prompt to prepend to regeneration */
    repairPrompt: string | null;
}

// ─── LANGUAGE VALIDATION ────────────────────────────────────────────────────

export interface LanguageValidationResult {
    passed: boolean;
    arabicRatio: number;
    latinRatio: number;
    detail: string;
    repairPrompt: string | null;
}

/**
 * Validates that text meets Arabic language requirements.
 * For Arabic locales: ≥70% Arabic chars among all script chars (excludes digits, punctuation, whitespace).
 * Allows brand names, prices, URLs in English — but flags excessive English prose.
 */
export function validateArabicCompliance(
    text: string,
    locale: string,
): LanguageValidationResult {
    if (!locale.startsWith('ar')) {
        return { passed: true, arabicRatio: 0, latinRatio: 0, detail: 'Non-Arabic locale — skip', repairPrompt: null };
    }

    const arabicCount = countArabicChars(text);
    const latinCount = countLatinChars(text);
    const totalScript = arabicCount + latinCount;

    if (totalScript === 0) {
        return { passed: false, arabicRatio: 0, latinRatio: 0, detail: 'No script characters found', repairPrompt: 'CRITICAL: Output contains no Arabic text. Rewrite ENTIRELY in Arabic.' };
    }

    const arabicRatio = arabicCount / totalScript;
    const latinRatio = latinCount / totalScript;

    // Threshold: at least 70% Arabic among script chars
    if (arabicRatio < 0.70) {
        return {
            passed: false,
            arabicRatio,
            latinRatio,
            detail: `Arabic ratio ${(arabicRatio * 100).toFixed(0)}% (need ≥70%). Excessive English detected.`,
            repairPrompt: `⚠️ LANGUAGE VIOLATION: Your output is ${(latinRatio * 100).toFixed(0)}% English. This MUST be Arabic content.
Rewrite the ENTIRE output in Arabic. English is only allowed for:
- Brand names
- Prices/numbers
- URLs
ALL prose, sentences, and marketing copy must be in Arabic.`,
        };
    }

    return { passed: true, arabicRatio, latinRatio, detail: `Arabic ${(arabicRatio * 100).toFixed(0)}% — OK`, repairPrompt: null };
}

// ─── HOOK ANGLE KEYWORD MAP ─────────────────────────────────────────────────

const HOOK_ANGLE_SIGNALS: Record<string, { en: string[]; ar: string[] }> = {
    before_after: {
        en: ['before', 'after', 'transform', 'changed', 'used to', 'now'],
        ar: ['قبل', 'بعد', 'تحول', 'تغير', 'كنت', 'الآن', 'أصبح'],
    },
    emotional: {
        en: ['feel', 'heart', 'dream', 'imagine', 'deserve'],
        ar: ['تشعر', 'قلب', 'حلم', 'تخيل', 'تستحق', 'شعور', 'إحساس'],
    },
    urgency: {
        en: ['now', 'today', 'last chance', 'deadline', 'hurry', 'limited', 'closing', 'ends'],
        ar: ['الآن', 'اليوم', 'فرصة أخيرة', 'ينتهي', 'أسرع', 'محدود', 'يغلق', 'قبل فوات', 'متبقي', 'آخر'],
    },
    scarcity: {
        en: ['only', 'remaining', 'seats', 'spots', 'left', 'limited'],
        ar: ['فقط', 'متبقي', 'مقعد', 'محدود', 'أماكن', 'ينفد'],
    },
    pain: {
        en: ['struggle', 'tired', 'frustrated', 'stuck', 'problem', 'suffering'],
        ar: ['تعاني', 'سئمت', 'مللت', 'محبط', 'عالق', 'مشكلة', 'معاناة', 'ألم'],
    },
    curiosity: {
        en: ['secret', 'discover', 'hidden', 'what if', 'how', 'why'],
        ar: ['سر', 'اكتشف', 'مخفي', 'ماذا لو', 'كيف', 'لماذا', 'لا يخبرك'],
    },
    statistics: {
        en: ['%', 'study', 'data', 'research', 'proven', 'according'],
        ar: ['%', 'دراسة', 'بيانات', 'بحث', 'مثبت', 'وفقاً', 'إحصائية'],
    },
    social_proof: {
        en: ['clients', 'students', 'success', 'results', 'testimonial', 'joined'],
        ar: ['عميل', 'طالب', 'نجاح', 'نتائج', 'شهادة', 'انضم', 'متخرج'],
    },
    logical_authority: {
        en: ['expert', 'years', 'experience', 'certified', 'authority'],
        ar: ['خبير', 'سنوات', 'خبرة', 'معتمد', 'سلطة', 'مؤهل'],
    },
    logic: {
        en: ['because', 'reason', 'therefore', 'that\'s why', 'makes sense'],
        ar: ['لأن', 'سبب', 'لذلك', 'لهذا', 'منطقي', 'ببساطة'],
    },
    future_based: {
        en: ['imagine', 'picture', 'will be', 'future', 'months from now'],
        ar: ['تخيل', 'ستكون', 'المستقبل', 'بعد أشهر', 'ستصبح', 'حياتك'],
    },
};

// ─── MODE SIGNAL MAP ────────────────────────────────────────────────────────

const MODE_CAPTION_SIGNALS: Record<string, { en: string[]; ar: string[] }> = {
    value_stack: {
        en: ['include', 'bonus', 'value', 'package', 'get', 'plus', 'worth'],
        ar: ['يشمل', 'بونص', 'قيمة', 'حزمة', 'تحصل', 'بالإضافة', 'مجاناً', 'ضمان'],
    },
    event_ticket: {
        en: ['register', 'event', 'workshop', 'live', 'date', 'seat', 'webinar', 'attend'],
        ar: ['سجل', 'حدث', 'ورشة', 'مباشر', 'تاريخ', 'مقعد', 'ويبنار', 'حضور', 'احجز'],
    },
    feature_highlight: {
        en: ['feature', 'tool', 'platform', 'system', 'automate', 'analytics'],
        ar: ['ميزة', 'أداة', 'منصة', 'نظام', 'أتمتة', 'تحليل'],
    },
    premium_package: {
        en: ['offer', 'price', 'invest', 'package', 'plan', 'access'],
        ar: ['عرض', 'سعر', 'استثمر', 'حزمة', 'خطة', 'وصول', 'اشترك'],
    },
    speaker_card: {
        en: ['speaker', 'keynote', 'expert', 'stage', 'present', 'authority', 'credentials'],
        ar: ['متحدث', 'خبير', 'مسرح', 'يقدم', 'مؤهل', 'سنوات', 'عميل'],
    },
    book_mockup: {
        en: ['guide', 'book', 'download', 'ebook', 'free', 'copy', 'chapter'],
        ar: ['دليل', 'كتاب', 'تحميل', 'مجاني', 'نسخة', 'فصل', 'صفحة'],
    },
    device_mockup: {
        en: ['device', 'tablet', 'phone', 'screen', 'app', 'digital', 'read'],
        ar: ['جهاز', 'شاشة', 'تطبيق', 'رقمي', 'اقرأ', 'محتوى', 'منصة'],
    },
    webinar_screen: {
        en: ['webinar', 'live', 'screen', 'session', 'broadcast', 'watch'],
        ar: ['ويبنار', 'مباشر', 'شاشة', 'جلسة', 'بث', 'شاهد'],
    },
};

// ─── NUMERIC EXTRACTION HELPER ───────────────────────────────────────────────

/** Extract all currency-like numbers from text (e.g., $297, 2497, 97$, ٩٧) */
function extractCurrencyNumbers(text: string): number[] {
    const nums: number[] = [];
    // Match: $N, N$, N dollar, N دولار, and standalone large numbers near currency context
    const patterns = [
        /\$\s?([\d,]+(?:\.\d+)?)/g,
        /([\d,]+(?:\.\d+)?)\s?\$/g,
        /([\d,]+(?:\.\d+)?)\s?(?:dollar|دولار|ريال|جنيه)/gi,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const raw = match[1].replace(/,/g, '');
            const num = parseFloat(raw);
            if (!isNaN(num) && num > 0) nums.push(num);
        }
    }
    return [...new Set(nums)];
}

// ─── CAPTION VALIDATOR ──────────────────────────────────────────────────────

export interface CaptionValidationInput {
    caption: string;
    locale: string;
    hookAngle?: string;
    selectedModes: string[];
    modePayload: ModePayload;
    cta: string;
    isRetargeting: boolean;
    /** Visual style family — when 'minimal', cinematic indicators in caption trigger failure */
    visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal';
}

export function validateCaption(input: CaptionValidationInput): CaptionValidationResult {
    const checks: CaptionValidationResult['checks'] = [];
    const repairParts: string[] = [];
    const { caption, locale, hookAngle, selectedModes, modePayload, cta, isRetargeting } = input;
    const isArabic = locale.startsWith('ar');
    const textLower = caption.toLowerCase();

    // ── 1. Language compliance ──
    if (isArabic) {
        const langCheck = validateArabicCompliance(caption, locale);
        checks.push({
            name: 'language_compliance',
            passed: langCheck.passed,
            detail: langCheck.detail,
        });
        if (!langCheck.passed && langCheck.repairPrompt) {
            repairParts.push(langCheck.repairPrompt);
        }
    }

    // ── 2. Word count ──
    const words = caption.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    const wordCountOk = wordCount >= 50 && wordCount <= 250;
    checks.push({
        name: 'word_count',
        passed: wordCountOk,
        detail: `${wordCount} words (acceptable: 50-250)`,
    });
    if (!wordCountOk) {
        if (wordCount < 50) {
            repairParts.push(`Caption is too short (${wordCount} words). Expand to 120-150 words.`);
        } else if (wordCount > 250) {
            repairParts.push(`Caption is too long (${wordCount} words). Trim to 120-150 words.`);
        }
    }

    // ── 3. CTA presence ──
    const ctaNormalized = cta.toLowerCase().replace(/\s+/g, ' ').trim();
    // Check for CTA or close variation
    const ctaWords = ctaNormalized.split(' ').filter(w => w.length > 2);
    const ctaPresent = ctaWords.length > 0 && ctaWords.some(w => textLower.includes(w));
    // Also check for common CTA indicators
    const ctaIndicators = ['👇', '⬇', 'سجل', 'انضم', 'احجز', 'ابدأ', 'اشترك', 'register', 'join', 'book', 'start', 'sign up', 'click'];
    const hasCtaIndicator = ctaIndicators.some(ind => textLower.includes(ind) || caption.includes(ind));

    checks.push({
        name: 'cta_present',
        passed: ctaPresent || hasCtaIndicator,
        detail: ctaPresent ? 'CTA text found' : (hasCtaIndicator ? 'CTA indicator found' : 'No CTA detected'),
    });
    if (!ctaPresent && !hasCtaIndicator) {
        repairParts.push(`MISSING CTA: The caption must end with a clear call-to-action. Use "${cta}" or an equivalent action word with 👇 emoji.`);
    }

    // ── 4. Hook angle reflection ──
    if (hookAngle && !isRetargeting && hookAngle !== 'standard') {
        const signals = HOOK_ANGLE_SIGNALS[hookAngle];
        if (signals) {
            const allSignals = [...(isArabic ? signals.ar : signals.en), ...(isArabic ? [] : signals.ar)];
            const foundCount = allSignals.filter(s => caption.includes(s) || textLower.includes(s.toLowerCase())).length;
            const angleReflected = foundCount >= 1;
            checks.push({
                name: 'hook_angle',
                passed: angleReflected,
                detail: angleReflected ? `${hookAngle}: ${foundCount} signal(s) found` : `${hookAngle}: no angle signals detected`,
            });
            if (!angleReflected) {
                repairParts.push(`HOOK ANGLE MISMATCH: The hook angle is "${hookAngle}" but the caption doesn't reflect it. Include language that matches this angle (e.g., ${signals.ar.slice(0, 3).join(', ')}).`);
            }
        }
    }

    // ── 5. Urgency check (when urgency/scarcity angle active) ──
    if (hookAngle === 'urgency' || hookAngle === 'scarcity') {
        const urgencyWords = [...HOOK_ANGLE_SIGNALS.urgency.ar, ...HOOK_ANGLE_SIGNALS.scarcity.ar, ...HOOK_ANGLE_SIGNALS.urgency.en];
        const hasUrgency = urgencyWords.some(w => caption.includes(w) || textLower.includes(w.toLowerCase()));
        checks.push({
            name: 'urgency_language',
            passed: hasUrgency,
            detail: hasUrgency ? 'Urgency/scarcity language present' : 'No urgency language found',
        });
        if (!hasUrgency) {
            repairParts.push(`URGENCY MISSING: The angle is "${hookAngle}" — caption MUST include deadline/scarcity language (e.g., "الآن", "محدود", "ينتهي", "فرصة أخيرة").`);
        }
    }

    // ── 6. Mode alignment ──
    const nonHeroModes = selectedModes.filter(m => m !== 'standard_hero');
    for (const mode of nonHeroModes) {
        const signals = MODE_CAPTION_SIGNALS[mode];
        if (signals) {
            const allSignals = [...(isArabic ? signals.ar : signals.en)];
            const foundCount = allSignals.filter(s => caption.includes(s) || textLower.includes(s.toLowerCase())).length;
            const modeReflected = foundCount >= 1;
            checks.push({
                name: `mode_${mode}`,
                passed: modeReflected,
                detail: modeReflected ? `${mode}: ${foundCount} signal(s) found` : `${mode}: no mode signals detected`,
            });
            if (!modeReflected) {
                repairParts.push(`MODE MISMATCH (${mode}): The caption should reference the ${mode.replace(/_/g, ' ')} visual/offer. Include relevant framing (e.g., ${allSignals.slice(0, 3).join(', ')}).`);
            }
        }
    }

    // ── 7. Mode-specific payload references ──
    if (modePayload.value_stack) {
        const vs = modePayload.value_stack;
        // Check if offer title is referenced
        const titleWords = vs.offerTitle.split(/\s+/).filter(w => w.length > 2);
        const titlePresent = titleWords.some(w => caption.includes(w));
        checks.push({
            name: 'value_stack_title',
            passed: titlePresent,
            detail: titlePresent ? 'Value stack offer title referenced' : 'Value stack offer title not found in caption',
        });
        // Not a repair trigger — just informational
    }

    if (modePayload.event_ticket) {
        const et = modePayload.event_ticket;
        const eventTitleWords = et.eventTitle.split(/\s+/).filter(w => w.length > 2);
        const titlePresent = eventTitleWords.some(w => caption.includes(w));
        const datePresent = et.eventDate.split(/\s+/).some(w => caption.includes(w));
        const eventReflected = titlePresent || datePresent;
        checks.push({
            name: 'event_details',
            passed: eventReflected,
            detail: eventReflected ? 'Event details referenced' : 'Event title/date not found',
        });
        if (!eventReflected) {
            repairParts.push(`EVENT DATA MISSING: Caption should mention the event "${et.eventTitle}" or its date "${et.eventDate}".`);
        }
    }

    if (modePayload.speaker_card) {
        const sc = modePayload.speaker_card;
        const nameWords = sc.speakerName.split(/\s+/).filter((w: string) => w.length > 1);
        const namePresent = nameWords.some((w: string) => caption.includes(w));
        checks.push({
            name: 'speaker_name_ref',
            passed: namePresent,
            detail: namePresent ? 'Speaker name referenced' : `Speaker "${sc.speakerName}" not found in caption`,
        });
        if (!namePresent) {
            repairParts.push(`SPEAKER DATA MISSING: Caption should mention the speaker "${sc.speakerName}".`);
        }
    }

    if (modePayload.book_mockup) {
        const bm = modePayload.book_mockup;
        const titleWords = bm.guideTitle.split(/\s+/).filter((w: string) => w.length > 2);
        const titlePresent = titleWords.some((w: string) => caption.includes(w));
        checks.push({
            name: 'guide_title_ref',
            passed: titlePresent,
            detail: titlePresent ? 'Guide title referenced' : `Guide "${bm.guideTitle}" not found`,
        });
    }

    // ── 8. Numeric fact consistency (STRICT) ──
    if (modePayload.value_stack) {
        const vs = modePayload.value_stack;
        // Extract all dollar-like numbers from caption
        const captionNumbers = extractCurrencyNumbers(caption);

        if (captionNumbers.length > 0) {
            // If caption mentions prices, they MUST match structured facts
            let numericConsistent = true;
            const structuredValues: string[] = [];
            if (vs.price) structuredValues.push(vs.price);
            if (vs.originalValue) structuredValues.push(vs.originalValue);
            if (vs.savings) structuredValues.push(vs.savings);

            if (structuredValues.length > 0) {
                // Check that mentioned numbers exist in structured facts
                for (const num of captionNumbers) {
                    const numStr = num.toString();
                    const matchesAny = structuredValues.some(sv => sv.includes(numStr));
                    if (!matchesAny) {
                        numericConsistent = false;
                    }
                }
            } else {
                // No structured values provided but caption invented numbers = fail
                numericConsistent = false;
            }

            checks.push({
                name: 'numeric_consistency',
                passed: numericConsistent,
                detail: numericConsistent ? 'Numeric values match structured facts' : `Caption mentions prices/values not in structured data`,
            });
            if (!numericConsistent) {
                repairParts.push(`⚠️ NUMERIC FACT VIOLATION: The caption contains dollar amounts or price claims that do NOT match the structured offer data. ${structuredValues.length > 0 ? `Allowed values: ${structuredValues.join(', ')}` : 'No price data was provided — do NOT invent prices.'} Remove or correct all invented numbers.`);
            }
        }
    }

    if (modePayload.offer_card) {
        const oc = modePayload.offer_card;
        const captionNumbers = extractCurrencyNumbers(caption);
        if (captionNumbers.length > 0 && oc.price) {
            const priceNum = oc.price.replace(/[^0-9.]/g, '');
            const oldPriceNum = oc.oldPrice?.replace(/[^0-9.]/g, '') || '';
            const mentioned = captionNumbers.map(n => n.toString());
            const valid = mentioned.every(n => n === priceNum || n === oldPriceNum || (oc.discount && oc.discount.includes(n)));
            checks.push({
                name: 'offer_numeric_consistency',
                passed: valid,
                detail: valid ? 'Offer numbers consistent' : 'Caption has numbers not matching offer card data',
            });
            if (!valid) {
                repairParts.push(`⚠️ OFFER PRICE VIOLATION: Caption mentions amounts not matching offer data (price: ${oc.price}${oc.oldPrice ? ', old: ' + oc.oldPrice : ''}). Fix or remove invented numbers.`);
            }
        }
    }

    // ── 8b. Stronger Arabic leakage detection ──
    if (isArabic) {
        // Check for common English CTA patterns that shouldn't be in Arabic copy
        const englishCtaPatterns = [
            /\bclick here\b/i, /\bsign up\b/i, /\blearn more\b/i, /\bget started\b/i,
            /\bjoin now\b/i, /\bbook now\b/i, /\bregister now\b/i, /\bdownload now\b/i,
            /\bfree trial\b/i, /\blimited time\b/i, /\bact now\b/i, /\bbuy now\b/i,
        ];
        const englishCtaLeaks = englishCtaPatterns.filter(p => p.test(caption));
        if (englishCtaLeaks.length > 0) {
            checks.push({
                name: 'english_cta_leak',
                passed: false,
                detail: `English CTA phrases detected in Arabic copy: ${englishCtaLeaks.length} pattern(s)`,
            });
            repairParts.push(`ARABIC VIOLATION: English CTA phrases found in Arabic ad copy. Translate ALL calls-to-action to Arabic (e.g., "سجل الآن", "احجز مقعدك", "حمّل مجاناً").`);
        }

        // Check for untranslated prompt instruction tokens
        const instructionLeaks = [
            /HEADLINE:/i, /SUBHEADLINE:/i, /CTA_BUTTON:/i, /BENEFIT:/i,
            /HOOK_ANGLE:/i, /CAMPAIGN_TYPE:/i, /OFFER_TYPE:/i,
        ];
        const hasInstructionLeak = instructionLeaks.some(p => p.test(caption));
        if (hasInstructionLeak) {
            checks.push({
                name: 'instruction_leak',
                passed: false,
                detail: 'Prompt instruction tokens leaked into caption',
            });
            repairParts.push('INSTRUCTION LEAK: Raw prompt labels (HEADLINE:, CTA_BUTTON:, etc.) leaked into the caption. Output must be clean ad copy with NO system labels.');
        }
    }

    // ── 9. Scene description leakage check ──
    const sceneLeakPatterns = [
        /يظهر البطل/,
        /الإضاءة سينمائية/,
        /مساحة سلبية/,
        /Shadow Boxing/i,
        /Cinematic/i,
        /Blueprint/i,
        /TECHNICAL_PROMPT/i,
        /VISUAL_DIRECTION/i,
        /المخطط البصري/,
        /مرتدياً/,
        /يقف في بهو/,
        /Chiaroscuro/i,
    ];
    const hasSceneLeak = sceneLeakPatterns.some(p => p.test(caption));
    checks.push({
        name: 'no_scene_leak',
        passed: !hasSceneLeak,
        detail: hasSceneLeak ? 'Scene/blueprint description leaked into caption' : 'Clean — no scene descriptions',
    });
    if (hasSceneLeak) {
        repairParts.push('SCENE LEAK: The caption contains visual/scene description text. Remove ALL references to hero appearance, lighting, camera angles, or blueprint architecture. Output ONLY social media ad copy.');
    }

    // ── 10. Minimal style cinematic indicator check ──
    if (input.visualStyleFamily === 'minimal') {
        const minimalCinematicTriggers_en = [
            'cinematic lighting', 'volumetric light', 'golden hour', 'neon glow',
            'bokeh', 'dust motes', 'smoke wisps', 'atmospheric haze', 'god rays',
            'dramatic lighting', 'rim light', 'back light',
        ];
        const minimalCinematicTriggers_ar = [
            'إضاءة سينمائية', 'ضوء حجمي', 'الساعة الذهبية', 'توهج نيون',
            'بوكيه', 'غبار', 'دخان', 'ضباب', 'أشعة ضوء', 'إضاءة درامية',
        ];
        const allTriggers = [...minimalCinematicTriggers_en, ...minimalCinematicTriggers_ar];
        const foundTriggers = allTriggers.filter(t => textLower.includes(t.toLowerCase()) || caption.includes(t));
        const minimalClean = foundTriggers.length === 0;
        checks.push({
            name: 'minimal_cinematic_guard',
            passed: minimalClean,
            detail: minimalClean ? 'Minimal caption — no cinematic indicators' : `Minimal caption contains cinematic terms: ${foundTriggers.join(', ')}`,
        });
        if (!minimalClean) {
            repairParts.push(`MINIMAL STYLE VIOLATION: Caption contains cinematic/atmospheric terms (${foundTriggers.join(', ')}) that are incompatible with minimal visual style. Remove ALL references to cinematic lighting, atmospheric effects, or dramatic environments. Keep copy concise, direct, and commercially clean.`);
        }
    }

    // ── Build result ──
    const allPassed = checks.every(c => c.passed);
    const criticalFails = checks.filter(c => !c.passed && [
        'language_compliance', 'no_scene_leak', 'cta_present',
        'numeric_consistency', 'offer_numeric_consistency',
        'english_cta_leak', 'instruction_leak',
        'minimal_cinematic_guard',
    ].includes(c.name));
    // Pass if all pass, OR if only non-critical soft checks failed
    const effectivePassed = criticalFails.length === 0 && repairParts.length <= 1;

    return {
        passed: effectivePassed,
        checks,
        repairPrompt: effectivePassed ? null : buildRepairPrompt(repairParts, locale),
    };
}

function buildRepairPrompt(issues: string[], locale: string): string {
    if (issues.length === 0) return '';
    const isArabic = locale.startsWith('ar');
    return `
═══════════════════════════════════════════════════════════════════════════════
⚠️ CAPTION REPAIR — FIX THESE ISSUES (PREVIOUS OUTPUT FAILED VALIDATION)
═══════════════════════════════════════════════════════════════════════════════
${issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}

RULES:
- Fix ONLY the listed issues
- Keep the overall structure and flow
- ${isArabic ? 'ALL output must be in Arabic' : 'Follow the project language'}
- Output ONLY the corrected ad caption — no headers, no metadata
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT (STEP 3) LANGUAGE VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validates that concept blueprints have Arabic content fields when locale is Arabic.
 * Field labels (SUBJECT_ACTION, MOOD, etc.) stay in English — only the VALUES must be Arabic.
 * Returns repair prompt if validation fails.
 */
export function validateBlueprintLanguage(
    blueprintText: string,
    locale: string,
): { passed: boolean; arabicContentRatio: number; repairPrompt: string | null } {
    if (!locale.startsWith('ar')) {
        return { passed: true, arabicContentRatio: 1, repairPrompt: null };
    }

    // Extract content field values (after the colon on each line)
    // Field labels are English (SUBJECT_ACTION:, MOOD:, etc.) — skip them
    const lines = blueprintText.split('\n');
    let arabicContentChars = 0;
    let latinContentChars = 0;

    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
            // This looks like a "LABEL: content" line
            const content = line.substring(colonIdx + 1).trim();
            // Skip lines that are obviously English-only technical instructions
            if (/^(TECHNICAL_PROMPT|VISUAL_DIRECTION|CAMERA|LIGHTING|RENDER)/i.test(line)) continue;
            if (/^(CONCEPT_START|CONCEPT_END|CTA_AND_BENEFIT)/i.test(line)) continue;

            arabicContentChars += countArabicChars(content);
            latinContentChars += countLatinChars(content);
        }
    }

    const total = arabicContentChars + latinContentChars;
    if (total === 0) {
        return { passed: true, arabicContentRatio: 0, repairPrompt: null };
    }

    const ratio = arabicContentChars / total;

    // Blueprint content fields should be ≥50% Arabic (lower threshold than caption
    // because some fields legitimately have English like brand names, technical terms)
    if (ratio < 0.50) {
        return {
            passed: false,
            arabicContentRatio: ratio,
            repairPrompt: `⚠️ ARABIC CONTENT VIOLATION: Blueprint field content is ${(ratio * 100).toFixed(0)}% Arabic (need ≥50%).
All content fields (SUBJECT_ACTION, MOOD, ENVIRONMENT, CTA_AND_BENEFIT_PLOTTING) MUST have Arabic values.
Only TECHNICAL_PROMPT content stays in English.
Rewrite all non-technical field values in Arabic.`,
        };
    }

    return { passed: true, arabicContentRatio: ratio, repairPrompt: null };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLUEPRINT MODE-CONTRIBUTION VALIDATOR (STEP 3)
// ═══════════════════════════════════════════════════════════════════════════

/** Mode-specific visual keywords that should appear in a blueprint for that mode */
const MODE_BLUEPRINT_SIGNALS: Record<string, string[]> = {
    value_stack: ['stack', 'card', 'item', 'bonus', 'price', 'value', 'panel', 'row', 'بونص', 'قيمة', 'بطاقة'],
    event_ticket: ['ticket', 'event', 'date', 'time', 'seat', 'barcode', 'perforation', 'تذكرة', 'حدث', 'تاريخ'],
    speaker_card: ['stage', 'speaker', 'podium', 'credentials', 'audience', 'spotlight', 'متحدث', 'مسرح', 'مؤهل'],
    webinar_screen: ['screen', 'laptop', 'monitor', 'live', 'badge', 'شاشة', 'مباشر', 'ويبنار'],
    book_mockup: ['book', '3d', 'cover', 'mockup', 'spine', 'chapter', 'كتاب', 'غلاف', 'دليل'],
    device_mockup: ['device', 'tablet', 'phone', 'screen', 'content', 'جهاز', 'شاشة', 'محتوى'],
};

/**
 * Validates that a Step 3 blueprint adequately represents all selected modes.
 * A pair that degrades to hero-only is detected and flagged for repair.
 */
export function validateBlueprintModeContribution(
    blueprintText: string,
    selectedModes: string[],
): { passed: boolean; missingModes: string[]; repairPrompt: string | null } {
    const textLower = blueprintText.toLowerCase();
    const nonHero = selectedModes.filter(m => m !== 'standard_hero');
    const missingModes: string[] = [];

    for (const mode of nonHero) {
        const signals = MODE_BLUEPRINT_SIGNALS[mode];
        if (!signals) continue;
        const found = signals.filter(s => textLower.includes(s.toLowerCase()));
        if (found.length < 2) {
            missingModes.push(mode);
        }
    }

    if (missingModes.length === 0) {
        return { passed: true, missingModes: [], repairPrompt: null };
    }

    const modeNames = missingModes.map(m => m.replace(/_/g, ' ')).join(', ');
    return {
        passed: false,
        missingModes,
        repairPrompt: `⚠️ MODE CONTRIBUTION VIOLATION: The blueprint does not adequately represent the selected mode(s): ${modeNames}.
Each selected mode MUST have its own visual zone/element described in the blueprint.
A pair that degrades to hero-only is INVALID.
Add explicit visual descriptions for: ${missingModes.map(m => {
            const sigs = MODE_BLUEPRINT_SIGNALS[m] || [];
            return `${m.replace(/_/g, ' ')} (should mention: ${sigs.slice(0, 4).join(', ')})`;
        }).join('; ')}.`,
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// REFERENCE AD TEXT-SAFETY FILTER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Sanitizes a Reference Ad analysis summary to remove source-ad specific data.
 * Keeps style/composition/mood attributes. Strips brand names, prices, CTA text, unique copy.
 */
export function sanitizeReferenceAdSummary(summary: string): string {
    if (!summary) return '';
    let clean = summary;

    // Remove dollar amounts: $297, $ 2,497, 297$
    clean = clean.replace(/\$\s?[\d,]+(?:\.\d+)?/g, '[price]');
    clean = clean.replace(/[\d,]+(?:\.\d+)?\s?\$/g, '[price]');

    // Remove other currency patterns: €, £, ¥, ر.س, د.إ, ج.م
    clean = clean.replace(/[€£¥]\s?[\d,]+(?:\.\d+)?/g, '[price]');
    clean = clean.replace(/[\d,]+(?:\.\d+)?\s?(?:ر\.س|د\.إ|ج\.م|ريال|جنيه|دينار|درهم)/g, '[price]');

    // Remove quoted text ≥5 chars (catch shorter branded callouts too)
    clean = clean.replace(/"[^"]{5,}"/g, '"[source text removed]"');
    clean = clean.replace(/'[^']{5,}'/g, "'[source text removed]'");

    // Remove URLs (http, https, www)
    clean = clean.replace(/https?:\/\/\S+/gi, '[url removed]');
    clean = clean.replace(/www\.\S+/gi, '[url removed]');

    // Remove email addresses
    clean = clean.replace(/[\w.+-]+@[\w.-]+\.\w+/g, '[email removed]');

    // Remove phone numbers (various formats)
    clean = clean.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, '[phone removed]');

    // Remove potential brand/company names after label patterns
    clean = clean.replace(/(?:brand|company|logo|trademark|sponsor|advertiser|client):\s*[^\n,;]+/gi, (match) => {
        const label = match.split(':')[0];
        return `${label}: [source brand removed]`;
    });

    // Remove CTA phrases that likely came from the source ad (English)
    clean = clean.replace(/\b(?:sign up|register now|buy now|shop now|get started|claim your|download now|book now|order now|try free|start free|join now|enroll now|grab your|reserve your)\b/gi, '[CTA removed]');

    // Remove CTA phrases (Arabic)
    clean = clean.replace(/(?:سجل الآن|اشترِ الآن|احجز مقعدك|حمّل مجاناً|انضم الآن|ابدأ الآن|احصل على|اطلب الآن)/g, '[CTA removed]');

    // Remove standalone large numbers that look like prices/quantities (4+ digits outside hex colors)
    clean = clean.replace(/(?<![#0-9a-fA-F])\b\d{4,}\b(?![0-9a-fA-F])/g, '[number removed]');

    return clean;
}

// ═══════════════════════════════════════════════════════════════════════════
// MINIMAL STYLE BLUEPRINT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════
// When visualStyleFamily === 'minimal', blueprint ENVIRONMENT_DESC must not
// contain detailed real-world or fantasy environment descriptions.

const ENVIRONMENT_HEAVY_TERMS = [
    // Location/scenery terms
    'forest', 'ocean', 'castle', 'kingdom', 'galaxy', 'spaceship', 'mountain',
    'cave', 'temple', 'palace', 'battlefield', 'jungle', 'desert landscape',
    'underwater', 'volcano', 'city skyline', 'street scene', 'marketplace',
    'arena', 'throne room', 'floating island', 'magical', 'enchanted',
    // English cinematic/atmospheric indicators
    'cinematic lighting', 'cinematic depth', 'volumetric light', 'volumetric fog',
    'golden hour', 'neon glow', 'bokeh', 'dust motes', 'smoke wisps',
    'atmospheric effects', 'atmospheric haze', 'light rays', 'god rays',
    'dramatic lighting', 'rim light', 'back light',
    // Arabic location terms
    'غابة', 'قصر', 'مملكة', 'فضاء', 'محيط', 'جبل', 'معبد', 'سوق', 'شارع',
    // Arabic cinematic/atmospheric indicators
    'إضاءة سينمائية', 'إضاءة حجمية', 'ضوء حجمي', 'الساعة الذهبية', 'توهج نيون',
    'بوكيه', 'غبار', 'دخان', 'ضباب', 'أشعة ضوء', 'إضاءة درامية',
];

export function validateBlueprintMinimalStyle(
    blueprintText: string,
    isMinimal: boolean,
): { passed: boolean; repairPrompt: string | null } {
    if (!isMinimal) return { passed: true, repairPrompt: null };

    // Strip ALL prohibition/instruction content before checking.
    // The prompt template and Gemini's output may echo FORBIDDEN lists that mention
    // cinematic terms as things to AVOID — scanning those causes false positives.
    //
    // ROOT CAUSE OF FALSE POSITIVES:
    // The minimal prompt template injects Arabic FORBIDDEN lists:
    //   "ممنوع: إضاءة درامية، إضاءة حجمية، الساعة الذهبية، توهج نيون"
    // Gemini echoes these terms using Arabic negation words (بدون, لا, بلا)
    // that were NOT previously stripped. For example:
    //   "لا إضاءة درامية ولا بوكيه ولا ضباب"
    // The detector then finds "إضاءة درامية", "بوكيه", "ضباب" as violations.
    //
    // Fix: strip Arabic negation patterns + extend English negation coverage.

    const stripped = blueprintText
        // 1. Remove TECHNICAL_PROMPT field (always contains FORBIDDEN lists)
        .replace(/TECHNICAL_PROMPT\s*:\s*\[.*?\]/gis, '')
        .replace(/TECHNICAL_PROMPT\s*:\s*[^\n]*/gi, '')
        // 2. Remove any line containing prohibition/instruction markers (English)
        .replace(/^.*(?:FORBIDDEN|MUST NOT|SHOULD NOT|NOT ALLOWED|STRICTLY PROHIBITED|DO NOT USE|NEVER USE|PROHIBITED)\b.*$/gim, '')
        // 3. Remove any line containing Arabic prohibition markers
        .replace(/^.*ممنوع.*$/gim, '')
        .replace(/^.*محظور.*$/gim, '')
        // 4. Remove parenthetical negation lists: "(no X, no Y, no Z)" / "(بدون X)"
        .replace(/\([^)]*\b(?:no|avoid|never|without)\b[^)]*\)/gi, '')
        .replace(/\([^)]*(?:بدون|لا |بلا)[^)]*\)/g, '')
        // 5. Remove English negation phrases — extended to 300 chars to cover long lists
        .replace(/\b(?:no|avoid|never|without|eliminate|remove|don'?t use|do not use|do not|strictly no|must not|should not|cannot|can'?t)\b[^.\n]{0,300}/gi, '')
        // 6. Remove Arabic negation phrases — بدون (without), لا (no), بلا (without)
        //    These are the most common Arabic negation words Gemini uses when echoing
        //    the FORBIDDEN lists from the minimal prompt template.
        .replace(/بدون[^.\n]{0,200}/g, '')
        .replace(/لا [^.\n]{0,200}/g, '')
        .replace(/بلا[^.\n]{0,200}/g, '');

    const lower = stripped.toLowerCase();
    const violations = ENVIRONMENT_HEAVY_TERMS.filter(t => lower.includes(t.toLowerCase()));

    if (violations.length === 0) return { passed: true, repairPrompt: null };

    return {
        passed: false,
        repairPrompt: `REPAIR REQUIRED: This is a MINIMAL visual style. The blueprint contains environment-heavy terms (${violations.join(', ')}) that must be removed. Replace ENVIRONMENT_DESC with a clean, plain backdrop: solid color, soft gradient, or simple branded background. Remove all location scenery, fantasy worldbuilding, and environmental details. Keep subject isolated against a clean background.`,
    };
}