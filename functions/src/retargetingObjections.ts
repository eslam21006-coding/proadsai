// retargetingObjections.ts
// Objection Handling System based on Alex Hormozi's "Onion of Blame" Framework
// From "$100M Playbook: Closing"

import type { RetargetingAngle, RetargetingObjectionId } from './types';

// =============================================================================
// TYPES
// =============================================================================

export type BlameLayer = 'circumstances' | 'other_people' | 'self';

export interface ObjectionScript {
    hook: string;
    hookAr: string;
    body: string;
    bodyAr: string;
    cta: string;
    ctaAr: string;
}

export interface RetargetingObjectionData {
    id: RetargetingObjectionId;
    label: string;
    labelAr: string;
    blameLayer: BlameLayer;
    needsProof: boolean;

    // Core psychology from Hormozi
    coreBeliefToChallenge: string;
    powerShift: string; // How we give them power back
    hormoziCloseName: string; // Named close technique

    // Scripts by angle
    scripts: Record<RetargetingAngle, ObjectionScript>;

    // Resolution strategies
    resolutionStrategies: string[];

    // Triggers - what they might have said/done
    triggers: string[];
}

// =============================================================================
// OBJECTION DATA - LAYER 1: CIRCUMSTANCES (External Blame)
// =============================================================================

const CIRCUMSTANCES_OBJECTIONS: RetargetingObjectionData[] = [
    {
        id: 'price_too_high',
        label: 'Price Too High',
        labelAr: 'السعر مرتفع جداً',
        blameLayer: 'circumstances',
        needsProof: true,
        coreBeliefToChallenge: '"Price too high" always means "value too low"',
        powerShift: 'Show them the cost of NOT buying exceeds the price',
        hormoziCloseName: "It's Good That It's A Lot",
        triggers: ['clicked pricing', 'abandoned cart', 'viewed multiple times'],
        resolutionStrategies: [
            'Reframe price as investment with ROI',
            'Break down cost per day/result',
            'Compare to cost of problem continuing',
            'Stack value until price seems small'
        ],
        scripts: {
            proof: {
                hook: '💰 "Too expensive" is what {{testimonialName}} thought too...',
                hookAr: '💰 "غالي جداً" هذا ما اعتقده {{testimonialName}} أيضاً...',
                body: 'Then they calculated what staying stuck was REALLY costing them. {{testimonialName}} made back {{roi}}x their investment in just {{timeframe}}.',
                bodyAr: 'ثم حسبوا ما كان يكلفهم البقاء عالقين حقاً. {{testimonialName}} استرد {{roi}} ضعف استثماره في {{timeframe}} فقط.',
                cta: 'See the math that changed their mind →',
                ctaAr: 'شاهد الحسابات التي غيرت رأيهم ←'
            },
            risk_reversal: {
                hook: '🛡️ What if the price wasn\'t the risk?',
                hookAr: '🛡️ ماذا لو لم يكن السعر هو المخاطرة؟',
                body: 'The real risk is another {{timeframe}} of the same results. That\'s why we guarantee {{guarantee}}. You literally can\'t lose money - only the problem.',
                bodyAr: 'المخاطرة الحقيقية هي {{timeframe}} أخرى من نفس النتائج. لذلك نضمن {{guarantee}}. حرفياً لا يمكنك خسارة المال - فقط المشكلة.',
                cta: 'Start risk-free today →',
                ctaAr: 'ابدأ بدون مخاطر اليوم ←'
            },
            mechanism: {
                hook: '⚙️ Here\'s why the price actually makes sense...',
                hookAr: '⚙️ إليك لماذا السعر منطقي فعلاً...',
                body: 'Our {{mechanism}} delivers {{specificResult}} because we {{uniqueProcess}}. Cheaper alternatives skip this - that\'s why they don\'t work.',
                bodyAr: '{{mechanism}} لدينا يحقق {{specificResult}} لأننا {{uniqueProcess}}. البدائل الأرخص تتخطى هذا - لذلك لا تنجح.',
                cta: 'See exactly what you\'re paying for →',
                ctaAr: 'شاهد بالضبط ما تدفع مقابله ←'
            },
            urgency: {
                hook: '⏰ The price goes up {{deadline}}. But that\'s not the real cost...',
                hookAr: '⏰ السعر يرتفع {{deadline}}. لكن هذه ليست التكلفة الحقيقية...',
                body: 'Every {{timeUnit}} you wait costs you {{opportunityCost}}. At current price, you break even in {{breakEvenTime}}. After the increase? Much longer.',
                bodyAr: 'كل {{timeUnit}} تنتظره يكلفك {{opportunityCost}}. بالسعر الحالي، تسترد تكلفتك في {{breakEvenTime}}. بعد الزيادة؟ أطول بكثير.',
                cta: 'Lock in current pricing →',
                ctaAr: 'احجز السعر الحالي ←'
            },
            clarity: {
                hook: '📊 Let\'s break down what "expensive" really means...',
                hookAr: '📊 دعنا نحلل ما يعنيه "غالي" حقاً...',
                body: 'Cost: {{price}}. Results: {{expectedResult}}. Per {{unit}}: {{costPerUnit}}. Compare that to {{alternative}} at {{alternativeCost}} that gives you {{alternativeResult}}.',
                bodyAr: 'التكلفة: {{price}}. النتائج: {{expectedResult}}. لكل {{unit}}: {{costPerUnit}}. قارن ذلك بـ {{alternative}} بتكلفة {{alternativeCost}} الذي يعطيك {{alternativeResult}}.',
                cta: 'Get the full breakdown →',
                ctaAr: 'احصل على التحليل الكامل ←'
            }
        }
    },
    {
        id: 'no_budget_now',
        label: 'No Budget Right Now',
        labelAr: 'لا ميزانية الآن',
        blameLayer: 'circumstances',
        needsProof: true,
        coreBeliefToChallenge: 'Resourcefulness > Resources. Money is never the real issue.',
        powerShift: 'Show them they CAN find resources when value is clear',
        hormoziCloseName: 'The Money Question',
        triggers: ['mentioned budget', 'asked about payment plans', 'corporate buyer'],
        resolutionStrategies: [
            'If they had to, could they find the money?',
            'What would they cut to afford something they really wanted?',
            'Payment plans remove the "lump sum" objection',
            'ROI-based: it pays for itself'
        ],
        scripts: {
            proof: {
                hook: '💡 {{testimonialName}} said "no budget" too. Here\'s what they did...',
                hookAr: '💡 {{testimonialName}} قال "لا ميزانية" أيضاً. إليك ما فعلوه...',
                body: 'They found {{amount}} by {{resourceStrategy}}. Within {{timeframe}}, they\'d made it back {{multiple}}x. The budget wasn\'t the problem - the priority was.',
                bodyAr: 'وجدوا {{amount}} عن طريق {{resourceStrategy}}. خلال {{timeframe}}، استردوها {{multiple}} ضعف. الميزانية لم تكن المشكلة - الأولوية كانت.',
                cta: 'See how others made it work →',
                ctaAr: 'شاهد كيف نجح الآخرون ←'
            },
            risk_reversal: {
                hook: '🔄 What if your budget wasn\'t at risk?',
                hookAr: '🔄 ماذا لو لم تكن ميزانيتك في خطر؟',
                body: 'With our {{guarantee}}, your money is protected. If you don\'t see {{specificResult}} in {{timeframe}}, you get {{refundTerms}}. Zero budget risk.',
                bodyAr: 'مع {{guarantee}} لدينا، أموالك محمية. إذا لم ترَ {{specificResult}} خلال {{timeframe}}، تحصل على {{refundTerms}}. صفر مخاطر على الميزانية.',
                cta: 'Try it budget-risk-free →',
                ctaAr: 'جربه بدون مخاطر على الميزانية ←'
            },
            mechanism: {
                hook: '📈 This isn\'t an expense. It\'s a {{roiType}} machine.',
                hookAr: '📈 هذا ليس مصروف. إنه آلة {{roiType}}.',
                body: 'Our {{mechanism}} generates {{returnMetric}} for every {{investmentUnit}} invested. That means you don\'t need budget - you need to redirect {{smallAmount}} to start the returns.',
                bodyAr: '{{mechanism}} لدينا يولد {{returnMetric}} لكل {{investmentUnit}} مستثمرة. هذا يعني أنك لا تحتاج ميزانية - تحتاج إعادة توجيه {{smallAmount}} لبدء العوائد.',
                cta: 'See the ROI calculator →',
                ctaAr: 'شاهد حاسبة العائد على الاستثمار ←'
            },
            urgency: {
                hook: '📅 "No budget now" becomes "no results ever" if you wait...',
                hookAr: '📅 "لا ميزانية الآن" تصبح "لا نتائج أبداً" إذا انتظرت...',
                body: '{{timeframe}} from now, you\'ll either have {{desiredResult}} or {{currentProblem}} will have cost you {{lossCost}}. The budget gap closes itself when you start.',
                bodyAr: 'بعد {{timeframe}}، إما ستحصل على {{desiredResult}} أو {{currentProblem}} سيكلفك {{lossCost}}. فجوة الميزانية تغلق نفسها عندما تبدأ.',
                cta: 'Start now, pay later →',
                ctaAr: 'ابدأ الآن، ادفع لاحقاً ←'
            },
            clarity: {
                hook: '💳 Here\'s how to make it fit any budget...',
                hookAr: '💳 إليك كيف تجعلها تناسب أي ميزانية...',
                body: 'Full price: {{fullPrice}}. Monthly option: {{monthlyPrice}}/mo. That\'s {{dailyPrice}}/day - less than {{comparison}}. And you start earning back from day 1.',
                bodyAr: 'السعر الكامل: {{fullPrice}}. الخيار الشهري: {{monthlyPrice}}/شهر. هذا {{dailyPrice}}/يوم - أقل من {{comparison}}. وتبدأ بالكسب من اليوم الأول.',
                cta: 'See all payment options →',
                ctaAr: 'شاهد جميع خيارات الدفع ←'
            }
        }
    },
    {
        id: 'need_installments',
        label: 'Need Payment Plan',
        labelAr: 'أحتاج خطة دفع',
        blameLayer: 'circumstances',
        needsProof: false,
        coreBeliefToChallenge: 'Commitment matters more than cash timing',
        powerShift: 'Remove the timing barrier while securing commitment',
        hormoziCloseName: 'The Commitment Close',
        triggers: ['asked about payment plans', 'mentioned cash flow', 'small business'],
        resolutionStrategies: [
            'Offer payment plan immediately',
            'Make first payment small to reduce friction',
            'Show that results start before payments end'
        ],
        scripts: {
            proof: {
                hook: '✅ Most of our successful clients started with payments...',
                hookAr: '✅ معظم عملائنا الناجحين بدأوا بالتقسيط...',
                body: '{{percentage}}% of clients use our payment plan. Like {{testimonialName}} who started with just {{firstPayment}} and saw {{result}} before making their second payment.',
                bodyAr: '{{percentage}}% من العملاء يستخدمون خطة الدفع. مثل {{testimonialName}} الذي بدأ بـ {{firstPayment}} فقط ورأى {{result}} قبل دفعتهم الثانية.',
                cta: 'See payment options →',
                ctaAr: 'شاهد خيارات الدفع ←'
            },
            risk_reversal: {
                hook: '🔒 Pay over time. Results guaranteed the whole time.',
                hookAr: '🔒 ادفع على مراحل. النتائج مضمونة طوال الوقت.',
                body: 'Split it into {{numberOfPayments}} payments of {{paymentAmount}}. Our {{guarantee}} covers your entire journey - if you don\'t get {{result}}, you\'re protected.',
                bodyAr: 'قسّمها إلى {{numberOfPayments}} دفعات من {{paymentAmount}}. {{guarantee}} لدينا يغطي رحلتك بالكامل - إذا لم تحصل على {{result}}، أنت محمي.',
                cta: 'Start with first payment only →',
                ctaAr: 'ابدأ بالدفعة الأولى فقط ←'
            },
            mechanism: {
                hook: '⚙️ You\'ll ROI before you finish paying...',
                hookAr: '⚙️ ستحقق عائدك قبل أن تنتهي من الدفع...',
                body: 'Our {{mechanism}} typically delivers {{result}} within {{timeframe}}. With {{numberOfPayments}} monthly payments, most clients see positive ROI by payment {{roiPaymentNumber}}.',
                bodyAr: '{{mechanism}} لدينا عادة يحقق {{result}} خلال {{timeframe}}. مع {{numberOfPayments}} دفعات شهرية، معظم العملاء يرون عائداً إيجابياً بحلول الدفعة {{roiPaymentNumber}}.',
                cta: 'Calculate your ROI timeline →',
                ctaAr: 'احسب جدولك الزمني للعائد ←'
            },
            urgency: {
                hook: '⏳ Payment plan available only until {{deadline}}...',
                hookAr: '⏳ خطة الدفع متاحة فقط حتى {{deadline}}...',
                body: 'We\'re offering {{numberOfPayments}} interest-free payments of {{paymentAmount}} until {{deadline}}. After that, it\'s full price upfront only.',
                bodyAr: 'نقدم {{numberOfPayments}} دفعات بدون فوائد من {{paymentAmount}} حتى {{deadline}}. بعد ذلك، السعر الكامل مقدماً فقط.',
                cta: 'Lock in the payment plan →',
                ctaAr: 'احجز خطة الدفع ←'
            },
            clarity: {
                hook: '📋 Here\'s exactly how payments work...',
                hookAr: '📋 إليك بالضبط كيف تعمل الدفعات...',
                body: 'Today: {{firstPayment}}. Then {{remainingPayments}} payments of {{paymentAmount}} on the {{paymentDay}} of each month. Total: {{totalPrice}}. No hidden fees. Cancel protection included.',
                bodyAr: 'اليوم: {{firstPayment}}. ثم {{remainingPayments}} دفعات من {{paymentAmount}} في {{paymentDay}} من كل شهر. الإجمالي: {{totalPrice}}. لا رسوم خفية. حماية الإلغاء مشمولة.',
                cta: 'Get started with {{firstPayment}} →',
                ctaAr: 'ابدأ بـ {{firstPayment}} ←'
            }
        }
    },
    {
        id: 'no_time',
        label: 'No Time Right Now',
        labelAr: 'لا وقت الآن',
        blameLayer: 'circumstances',
        needsProof: true,
        coreBeliefToChallenge: '"No time" means "not a priority" - busy people find time for what matters',
        powerShift: 'Show that the best time to start is when you\'re busy',
        hormoziCloseName: 'The Busy Person Close',
        triggers: ['mentioned being busy', 'postponed call', 'asked to follow up later'],
        resolutionStrategies: [
            'If not now, when? (They\'ll always be busy)',
            'Busy people succeed BECAUSE they act despite busyness',
            'Our system is DESIGNED for busy people',
            'The longer you wait, the busier you\'ll be'
        ],
        scripts: {
            proof: {
                hook: '⚡ {{testimonialName}} was busier than you. Here\'s what happened...',
                hookAr: '⚡ {{testimonialName}} كان أكثر انشغالاً منك. إليك ما حدث...',
                body: '{{testimonialRole}} working {{hoursPerWeek}}+ hours/week. They thought they had no time. {{timeframe}} later? They freed up {{freedTime}} AND got {{result}}.',
                bodyAr: '{{testimonialRole}} يعمل {{hoursPerWeek}}+ ساعة/أسبوع. اعتقدوا أنه لا وقت لديهم. بعد {{timeframe}}؟ وفروا {{freedTime}} وحصلوا على {{result}}.',
                cta: 'See how busy people make it work →',
                ctaAr: 'شاهد كيف ينجح المشغولون ←'
            },
            risk_reversal: {
                hook: '🎯 No time? Then you have nothing to lose...',
                hookAr: '🎯 لا وقت؟ إذاً ليس لديك ما تخسره...',
                body: 'If our system doesn\'t save you {{timeSaved}} within {{timeframe}}, you get {{guarantee}}. You either get time back or money back. No risk.',
                bodyAr: 'إذا لم يوفر لك نظامنا {{timeSaved}} خلال {{timeframe}}، تحصل على {{guarantee}}. إما تسترد الوقت أو المال. لا مخاطر.',
                cta: 'Try it time-risk-free →',
                ctaAr: 'جربه بدون مخاطر على الوقت ←'
            },
            mechanism: {
                hook: '⏱️ Built for people who have zero extra time...',
                hookAr: '⏱️ مصمم للأشخاص الذين ليس لديهم وقت إضافي...',
                body: 'Our {{mechanism}} takes only {{timeRequired}} to {{action}}. It\'s specifically designed for {{targetAudience}} who can\'t afford to waste time.',
                bodyAr: '{{mechanism}} لدينا يستغرق فقط {{timeRequired}} لـ {{action}}. مصمم خصيصاً لـ {{targetAudience}} الذين لا يستطيعون إضاعة الوقت.',
                cta: 'See the time-saving system →',
                ctaAr: 'شاهد النظام الموفر للوقت ←'
            },
            urgency: {
                hook: '📆 "No time now" = "No time ever" unless you change something...',
                hookAr: '📆 "لا وقت الآن" = "لا وقت أبداً" ما لم تغير شيئاً...',
                body: 'In {{futureTimeframe}}, will you have MORE time or less? Exactly. The {{cohortName}} starts {{startDate}} - this is your window to break the cycle.',
                bodyAr: 'خلال {{futureTimeframe}}، هل سيكون لديك وقت أكثر أم أقل؟ بالضبط. {{cohortName}} تبدأ {{startDate}} - هذه فرصتك لكسر الدورة.',
                cta: 'Break the busy cycle →',
                ctaAr: 'اكسر دورة الانشغال ←'
            },
            clarity: {
                hook: '📊 Here\'s the actual time commitment...',
                hookAr: '📊 إليك الالتزام الفعلي بالوقت...',
                body: 'Week 1-2: {{initialTime}}. Week 3-4: {{midTime}}. After that: {{ongoingTime}}. Total first month: {{totalTime}}. That\'s {{comparison}} you probably waste on {{wastefulActivity}} anyway.',
                bodyAr: 'الأسبوع 1-2: {{initialTime}}. الأسبوع 3-4: {{midTime}}. بعد ذلك: {{ongoingTime}}. إجمالي الشهر الأول: {{totalTime}}. هذا {{comparison}} الذي ربما تهدره على {{wastefulActivity}} على أي حال.',
                cta: 'See the full time breakdown →',
                ctaAr: 'شاهد التفاصيل الكاملة للوقت ←'
            }
        }
    },
    {
        id: 'overwhelmed',
        label: 'Feeling Overwhelmed',
        labelAr: 'أشعر بالإرهاق',
        blameLayer: 'circumstances',
        needsProof: true,
        coreBeliefToChallenge: 'Overwhelm is a symptom of lacking a system, not a reason to avoid one',
        powerShift: 'Position the solution AS the cure for overwhelm',
        hormoziCloseName: 'The Relief Close',
        triggers: ['mentioned stress', 'said too much going on', 'analysis paralysis'],
        resolutionStrategies: [
            'Overwhelm means you NEED this more, not less',
            'Our system creates order from chaos',
            'Start with ONE thing - we guide you',
            'Most clients were overwhelmed before starting'
        ],
        scripts: {
            proof: {
                hook: '😮‍💨 {{testimonialName}} was drowning too. Then...',
                hookAr: '😮‍💨 {{testimonialName}} كان غارقاً أيضاً. ثم...',
                body: 'They had {{numberOfProblems}} things competing for attention. Our system helped them {{keyResult}} within {{timeframe}}. Now? {{currentState}}.',
                bodyAr: 'كان لديهم {{numberOfProblems}} أشياء تتنافس على الاهتمام. نظامنا ساعدهم {{keyResult}} خلال {{timeframe}}. الآن؟ {{currentState}}.',
                cta: 'See how they escaped overwhelm →',
                ctaAr: 'شاهد كيف هربوا من الإرهاق ←'
            },
            risk_reversal: {
                hook: '🌊 Overwhelmed? Then this is risk-free relief...',
                hookAr: '🌊 مرهق؟ إذاً هذا راحة بلا مخاطر...',
                body: 'If our system doesn\'t reduce your overwhelm within {{timeframe}}, you get {{guarantee}}. We\'re betting we can simplify your {{painPoint}}.',
                bodyAr: 'إذا لم يقلل نظامنا إرهاقك خلال {{timeframe}}، تحصل على {{guarantee}}. نراهن أننا نستطيع تبسيط {{painPoint}}.',
                cta: 'Get relief, risk-free →',
                ctaAr: 'احصل على الراحة، بلا مخاطر ←'
            },
            mechanism: {
                hook: '🧘 Our {{mechanism}} is designed to cut through chaos...',
                hookAr: '🧘 {{mechanism}} لدينا مصمم لاختراق الفوضى...',
                body: 'Instead of {{currentApproach}}, our system {{simplifiedApproach}}. You focus on {{oneMainThing}} while we handle {{everythingElse}}.',
                bodyAr: 'بدلاً من {{currentApproach}}، نظامنا {{simplifiedApproach}}. تركز على {{oneMainThing}} بينما نتعامل نحن مع {{everythingElse}}.',
                cta: 'See the simplified system →',
                ctaAr: 'شاهد النظام المبسط ←'
            },
            urgency: {
                hook: '🚨 Overwhelm compounds. Every day you wait...',
                hookAr: '🚨 الإرهاق يتراكم. كل يوم تنتظر...',
                body: '{{compoundingProblem}} gets worse. The {{cohortName}} includes {{overwhelmSolution}} - but only {{spotsLeft}} spots have this bonus.',
                bodyAr: '{{compoundingProblem}} يزداد سوءاً. {{cohortName}} تشمل {{overwhelmSolution}} - لكن فقط {{spotsLeft}} مقاعد لديها هذه المكافأة.',
                cta: 'Get the overwhelm solution →',
                ctaAr: 'احصل على حل الإرهاق ←'
            },
            clarity: {
                hook: '📝 Here\'s exactly what you\'ll do (nothing more)...',
                hookAr: '📝 إليك بالضبط ما ستفعله (لا شيء أكثر)...',
                body: 'Step 1: {{step1}} ({{time1}}). Step 2: {{step2}} ({{time2}}). Step 3: {{step3}} ({{time3}}). That\'s it. We handle everything else.',
                bodyAr: 'الخطوة 1: {{step1}} ({{time1}}). الخطوة 2: {{step2}} ({{time2}}). الخطوة 3: {{step3}} ({{time3}}). هذا كل شيء. نتعامل مع كل شيء آخر.',
                cta: 'See the simple 3-step process →',
                ctaAr: 'شاهد العملية البسيطة من 3 خطوات ←'
            }
        }
    },
    {
        id: 'not_ready_yet',
        label: 'Not Ready Yet',
        labelAr: 'لست مستعداً بعد',
        blameLayer: 'circumstances',
        needsProof: true,
        coreBeliefToChallenge: '"When I have X, then I\'ll Y" is the procrastination loop that never ends',
        powerShift: 'Show that readiness is created by starting, not waiting',
        hormoziCloseName: 'The When/Then Fallacy Close',
        triggers: ['said need to prepare first', 'waiting for right time', 'need to learn more'],
        resolutionStrategies: [
            'You become ready BY starting, not BEFORE',
            'What are you waiting for specifically?',
            'The "perfect time" never comes',
            'Those who succeed started when they weren\'t ready'
        ],
        scripts: {
            proof: {
                hook: '🎯 {{testimonialName}} waited {{waitTime}} to feel "ready"...',
                hookAr: '🎯 {{testimonialName}} انتظر {{waitTime}} ليشعر بأنه "مستعد"...',
                body: 'They finally started anyway - and realized {{keyInsight}}. Their only regret? "I wish I\'d started when I first heard about this."',
                bodyAr: 'بدأوا أخيراً على أي حال - وأدركوا {{keyInsight}}. ندمهم الوحيد؟ "أتمنى لو بدأت عندما سمعت عن هذا لأول مرة."',
                cta: 'Start before you\'re ready →',
                ctaAr: 'ابدأ قبل أن تكون مستعداً ←'
            },
            risk_reversal: {
                hook: '🛡️ Not ready? Perfect. You\'re protected either way...',
                hookAr: '🛡️ لست مستعداً؟ ممتاز. أنت محمي في كلتا الحالتين...',
                body: 'Our {{guarantee}} means if it turns out you weren\'t ready, you lose nothing. But if you WERE ready and didn\'t act? That costs you {{opportunityCost}}.',
                bodyAr: '{{guarantee}} لدينا يعني إذا اتضح أنك لم تكن مستعداً، لا تخسر شيئاً. لكن إذا كنت مستعداً ولم تتصرف؟ هذا يكلفك {{opportunityCost}}.',
                cta: 'Test your readiness risk-free →',
                ctaAr: 'اختبر استعدادك بلا مخاطر ←'
            },
            mechanism: {
                hook: '⚙️ Our system MAKES you ready. Here\'s how...',
                hookAr: '⚙️ نظامنا يجعلك مستعداً. إليك كيف...',
                body: 'The {{mechanism}} includes {{onboardingFeature}} that takes you from {{currentState}} to {{readyState}} in just {{timeframe}}. You don\'t need to be ready - we\'ll get you there.',
                bodyAr: '{{mechanism}} يشمل {{onboardingFeature}} الذي يأخذك من {{currentState}} إلى {{readyState}} في {{timeframe}} فقط. لا تحتاج أن تكون مستعداً - سنوصلك هناك.',
                cta: 'Let us make you ready →',
                ctaAr: 'دعنا نجعلك مستعداً ←'
            },
            urgency: {
                hook: '⏰ While you\'re getting "ready", others are getting results...',
                hookAr: '⏰ بينما تستعد، الآخرون يحصلون على نتائج...',
                body: 'In the time you\'ve been considering this, {{numberOfClients}} people started and {{percentageSuccess}}% already {{achievedResult}}. The {{cohortName}} closes {{deadline}}.',
                bodyAr: 'في الوقت الذي كنت تفكر فيه، {{numberOfClients}} شخص بدأوا و{{percentageSuccess}}% حققوا بالفعل {{achievedResult}}. {{cohortName}} تغلق {{deadline}}.',
                cta: 'Join them now →',
                ctaAr: 'انضم إليهم الآن ←'
            },
            clarity: {
                hook: '❓ What does "ready" actually mean to you?',
                hookAr: '❓ ماذا يعني "مستعد" لك فعلاً؟',
                body: 'If it\'s {{readinessItem1}} - we provide that. If it\'s {{readinessItem2}} - our {{feature}} handles it. If it\'s {{readinessItem3}} - that comes FROM starting, not before.',
                bodyAr: 'إذا كان {{readinessItem1}} - نحن نوفره. إذا كان {{readinessItem2}} - {{feature}} لدينا يتعامل معه. إذا كان {{readinessItem3}} - هذا يأتي من البدء، ليس قبله.',
                cta: 'Tell us what "ready" means →',
                ctaAr: 'أخبرنا ماذا يعني "مستعد" ←'
            }
        }
    }
];

// =============================================================================
// OBJECTION DATA - LAYER 2: OTHER PEOPLE (External Blame on Others)
// =============================================================================

const OTHER_PEOPLE_OBJECTIONS: RetargetingObjectionData[] = [
    {
        id: 'need_approval',
        label: 'Need Partner/Boss Approval',
        labelAr: 'أحتاج موافقة الشريك/المدير',
        blameLayer: 'other_people',
        needsProof: true,
        coreBeliefToChallenge: 'You\'re asking for support, not permission. Big difference.',
        powerShift: 'Help them see they can advocate for their own decisions',
        hormoziCloseName: 'The Support vs Permission Close',
        triggers: ['mentioned spouse', 'said need to ask boss', 'business partner'],
        resolutionStrategies: [
            'What would make THEM say yes?',
            'Let\'s give you the tools to present this',
            'Can we get them on a call?',
            'What if they surprise you and say yes?'
        ],
        scripts: {
            proof: {
                hook: '👥 {{testimonialName}}\'s {{relation}} was skeptical too...',
                hookAr: '👥 {{testimonialName}} {{relation}} كان متشككاً أيضاً...',
                body: 'They showed them {{proofPoint}} and {{relationReaction}}. Now {{relation}} says it was {{positiveOutcome}}. We can help you make the case.',
                bodyAr: 'أظهروا لهم {{proofPoint}} و{{relationReaction}}. الآن {{relation}} يقول أنه كان {{positiveOutcome}}. يمكننا مساعدتك في تقديم الحجة.',
                cta: 'Get the partner-convincing toolkit →',
                ctaAr: 'احصل على أدوات إقناع الشريك ←'
            },
            risk_reversal: {
                hook: '🤝 Here\'s how to get buy-in without any risk...',
                hookAr: '🤝 إليك كيف تحصل على الموافقة بدون أي مخاطر...',
                body: 'Show them our {{guarantee}}. Tell them: "If it doesn\'t work, we get {{refundTerms}}. If it does, we get {{benefit}}." That\'s an easy yes.',
                bodyAr: 'أظهر لهم {{guarantee}}. قل لهم: "إذا لم ينجح، نحصل على {{refundTerms}}. إذا نجح، نحصل على {{benefit}}." هذا نعم سهلة.',
                cta: 'Get the risk-free pitch →',
                ctaAr: 'احصل على العرض بلا مخاطر ←'
            },
            mechanism: {
                hook: '📊 Here\'s the business case to share...',
                hookAr: '📊 إليك الحالة التجارية للمشاركة...',
                body: 'Investment: {{price}}. Expected return: {{expectedReturn}}. Timeline: {{timeframe}}. Our {{mechanism}} has delivered this for {{numberOfClients}}+ clients.',
                bodyAr: 'الاستثمار: {{price}}. العائد المتوقع: {{expectedReturn}}. الجدول الزمني: {{timeframe}}. {{mechanism}} لدينا حقق هذا لأكثر من {{numberOfClients}} عميل.',
                cta: 'Download the business case →',
                ctaAr: 'حمّل الحالة التجارية ←'
            },
            urgency: {
                hook: '📞 What if we talked to them together?',
                hookAr: '📞 ماذا لو تحدثنا معهم معاً؟',
                body: 'I can jump on a {{duration}} call with you and {{relation}} to answer their questions directly. We have {{availableSlots}} slots this week.',
                bodyAr: 'يمكنني الانضمام لمكالمة {{duration}} معك و{{relation}} للإجابة على أسئلتهم مباشرة. لدينا {{availableSlots}} مواعيد هذا الأسبوع.',
                cta: 'Schedule a joint call →',
                ctaAr: 'حدد موعد مكالمة مشتركة ←'
            },
            clarity: {
                hook: '📝 What do they need to see to say yes?',
                hookAr: '📝 ماذا يحتاجون أن يروا ليوافقوا؟',
                body: 'Is it {{possibleConcern1}}? Here\'s {{evidence1}}. Is it {{possibleConcern2}}? Here\'s {{evidence2}}. Send them this and let\'s reconvene.',
                bodyAr: 'هل هو {{possibleConcern1}}؟ إليك {{evidence1}}. هل هو {{possibleConcern2}}؟ إليك {{evidence2}}. أرسل لهم هذا ودعنا نتواصل مجدداً.',
                cta: 'Get shareable proof →',
                ctaAr: 'احصل على إثبات للمشاركة ←'
            }
        }
    },
    {
        id: 'dont_trust',
        label: 'Been Burned Before',
        labelAr: 'تعرضت للخداع سابقاً',
        blameLayer: 'other_people',
        needsProof: true,
        coreBeliefToChallenge: 'One bad decision shouldn\'t prevent a good one',
        powerShift: 'Show them how to protect themselves while still moving forward',
        hormoziCloseName: 'The Bad Experience Close',
        triggers: ['mentioned bad experience', 'said tried before', 'trust issues'],
        resolutionStrategies: [
            'What specifically went wrong before?',
            'How is this different from that?',
            'Our guarantee addresses exactly that risk',
            'Don\'t let their failure become your permanent limitation'
        ],
        scripts: {
            proof: {
                hook: '🔥 {{testimonialName}} got burned by {{competitor/pastSolution}} too...',
                hookAr: '🔥 {{testimonialName}} تعرض للخداع من {{competitor/pastSolution}} أيضاً...',
                body: 'They almost didn\'t try us because of it. But {{differentiator}} changed their mind. {{timeframe}} later: {{result}}. Their only regret was waiting.',
                bodyAr: 'كادوا ألا يجربوننا بسببه. لكن {{differentiator}} غيّر رأيهم. بعد {{timeframe}}: {{result}}. ندمهم الوحيد كان الانتظار.',
                cta: 'See why this is different →',
                ctaAr: 'شاهد لماذا هذا مختلف ←'
            },
            risk_reversal: {
                hook: '🛡️ Burned before? Here\'s your fire insurance...',
                hookAr: '🛡️ تعرضت للخداع؟ إليك تأمينك ضد الحريق...',
                body: 'Our {{guarantee}} exists because we know trust is earned. If we don\'t deliver {{specificPromise}} in {{timeframe}}, you get {{refundTerms}}. No questions.',
                bodyAr: '{{guarantee}} لدينا موجود لأننا نعلم أن الثقة تُكتسب. إذا لم نحقق {{specificPromise}} خلال {{timeframe}}، تحصل على {{refundTerms}}. بدون أسئلة.',
                cta: 'See the trust guarantee →',
                ctaAr: 'شاهد ضمان الثقة ←'
            },
            mechanism: {
                hook: '⚙️ Here\'s why past failures won\'t repeat...',
                hookAr: '⚙️ إليك لماذا لن تتكرر الإخفاقات السابقة...',
                body: 'What failed before: {{previousApproach}}. Our approach: {{ourApproach}}. The difference: {{keyDifference}}. That\'s why we get {{successRate}}% success rate.',
                bodyAr: 'ما فشل قبلاً: {{previousApproach}}. نهجنا: {{ourApproach}}. الفرق: {{keyDifference}}. لذلك نحقق معدل نجاح {{successRate}}%.',
                cta: 'See the difference →',
                ctaAr: 'شاهد الفرق ←'
            },
            urgency: {
                hook: '⚠️ Don\'t let THEIR failure cost you YOUR future...',
                hookAr: '⚠️ لا تدع فشلهم يكلفك مستقبلك...',
                body: 'That bad experience already cost you {{previousLoss}}. Letting it stop you could cost {{futureLoss}} more. {{opportunityDescription}} closes {{deadline}}.',
                bodyAr: 'تلك التجربة السيئة كلفتك بالفعل {{previousLoss}}. السماح لها بإيقافك قد يكلفك {{futureLoss}} أكثر. {{opportunityDescription}} تغلق {{deadline}}.',
                cta: 'Don\'t let the past win →',
                ctaAr: 'لا تدع الماضي يفوز ←'
            },
            clarity: {
                hook: '📋 Let\'s compare what went wrong vs what we do...',
                hookAr: '📋 دعنا نقارن ما فشل مقابل ما نفعله...',
                body: 'They did: {{theirApproach1}}, {{theirApproach2}}, {{theirApproach3}}. We do: {{ourApproach1}}, {{ourApproach2}}, {{ourApproach3}}. See the difference?',
                bodyAr: 'هم فعلوا: {{theirApproach1}}، {{theirApproach2}}، {{theirApproach3}}. نحن نفعل: {{ourApproach1}}، {{ourApproach2}}، {{ourApproach3}}. ترى الفرق؟',
                cta: 'See the full comparison →',
                ctaAr: 'شاهد المقارنة الكاملة ←'
            }
        }
    },
    {
        id: 'tried_before_failed',
        label: 'Tried Before & Failed',
        labelAr: 'جربت سابقاً وفشلت',
        blameLayer: 'other_people',
        needsProof: true,
        coreBeliefToChallenge: 'Past failure with wrong approach ≠ future failure with right approach',
        powerShift: 'Diagnose WHY they failed and show why this is different',
        hormoziCloseName: 'The Diagnosis Close',
        triggers: ['said it didn\'t work', 'tried similar', 'given up'],
        resolutionStrategies: [
            'What specifically didn\'t work?',
            'Was it the approach or the execution?',
            'Did you have the support you needed?',
            'This is specifically designed to fix that'
        ],
        scripts: {
            proof: {
                hook: '🔄 {{testimonialName}} failed {{numberOfTimes}} times before us...',
                hookAr: '🔄 {{testimonialName}} فشل {{numberOfTimes}} مرات قبلنا...',
                body: 'They\'d tried {{previousAttempts}}. All failed because {{reasonForFailure}}. Our {{mechanism}} fixed that specific problem. Result: {{result}}.',
                bodyAr: 'جربوا {{previousAttempts}}. كلها فشلت بسبب {{reasonForFailure}}. {{mechanism}} لدينا حل تلك المشكلة بالتحديد. النتيجة: {{result}}.',
                cta: 'See the recovery story →',
                ctaAr: 'شاهد قصة التعافي ←'
            },
            risk_reversal: {
                hook: '🎯 Failed before? Here\'s your safety net...',
                hookAr: '🎯 فشلت قبلاً؟ إليك شبكة أمانك...',
                body: 'If our approach doesn\'t succeed where others failed, you get {{guarantee}}. We\'re confident because we\'ve fixed this {{numberOfTimes}} times.',
                bodyAr: 'إذا لم ينجح نهجنا حيث فشل الآخرون، تحصل على {{guarantee}}. نحن واثقون لأننا حللنا هذا {{numberOfTimes}} مرة.',
                cta: 'Try the proven approach →',
                ctaAr: 'جرب النهج المثبت ←'
            },
            mechanism: {
                hook: '🔬 Here\'s WHY it failed before (and won\'t this time)...',
                hookAr: '🔬 إليك لماذا فشل قبلاً (ولن يفشل هذه المرة)...',
                body: 'Most {{solutions}} fail because they {{commonMistake}}. Our {{mechanism}} specifically addresses this by {{ourSolution}}. That\'s the difference.',
                bodyAr: 'معظم {{solutions}} تفشل لأنها {{commonMistake}}. {{mechanism}} لدينا يعالج هذا تحديداً عبر {{ourSolution}}. هذا الفرق.',
                cta: 'See the failure-proof system →',
                ctaAr: 'شاهد النظام المضاد للفشل ←'
            },
            urgency: {
                hook: '⏳ How many more months of "it\'s not working" can you afford?',
                hookAr: '⏳ كم شهراً آخر من "لا ينجح" يمكنك تحمله؟',
                body: 'You\'ve already lost {{timeWasted}} to failed attempts. Our {{cohortName}} shows you the working approach - starts {{startDate}}.',
                bodyAr: 'لقد خسرت بالفعل {{timeWasted}} في محاولات فاشلة. {{cohortName}} لدينا يعرض لك النهج الناجح - يبدأ {{startDate}}.',
                cta: 'Try what actually works →',
                ctaAr: 'جرب ما ينجح فعلاً ←'
            },
            clarity: {
                hook: '📊 Let\'s diagnose why it failed before...',
                hookAr: '📊 دعنا نشخص لماذا فشل قبلاً...',
                body: 'Common reasons for failure: {{failure1}} (we prevent with {{solution1}}), {{failure2}} (we prevent with {{solution2}}), {{failure3}} (we prevent with {{solution3}}).',
                bodyAr: 'الأسباب الشائعة للفشل: {{failure1}} (نمنعه بـ {{solution1}})، {{failure2}} (نمنعه بـ {{solution2}})، {{failure3}} (نمنعه بـ {{solution3}}).',
                cta: 'Get your failure diagnosis →',
                ctaAr: 'احصل على تشخيص فشلك ←'
            }
        }
    }
];

// =============================================================================
// OBJECTION DATA - LAYER 3: SELF (Internal Blame)
// =============================================================================

const SELF_OBJECTIONS: RetargetingObjectionData[] = [
    {
        id: 'will_it_work_for_me',
        label: 'Will It Work For Me?',
        labelAr: 'هل سينجح معي؟',
        blameLayer: 'self',
        needsProof: true,
        coreBeliefToChallenge: 'If it worked for people like you, it can work for you',
        powerShift: 'Show proof from people in their exact situation',
        hormoziCloseName: 'The Best Case Worst Case Close',
        triggers: ['asked about results', 'said situation is different', 'skeptical'],
        resolutionStrategies: [
            'Show testimonials from similar people',
            'What specifically makes you different?',
            'Best case: it works. Worst case: guarantee',
            'The only way to know is to try (risk-free)'
        ],
        scripts: {
            proof: {
                hook: '👤 {{testimonialName}} thought they were "different" too...',
                hookAr: '👤 {{testimonialName}} اعتقدوا أنهم "مختلفون" أيضاً...',
                body: 'Same {{sharedCharacteristic}}. Same doubts. {{timeframe}} later: {{result}}. They\'re not special - they just started.',
                bodyAr: 'نفس {{sharedCharacteristic}}. نفس الشكوك. بعد {{timeframe}}: {{result}}. ليسوا مميزين - فقط بدأوا.',
                cta: 'See people like you succeed →',
                ctaAr: 'شاهد أشخاصاً مثلك ينجحون ←'
            },
            risk_reversal: {
                hook: '🎲 Best case: it works. Worst case: you get {{guarantee}}...',
                hookAr: '🎲 أفضل حالة: ينجح. أسوأ حالة: تحصل على {{guarantee}}...',
                body: 'If it works, you get {{bestCaseOutcome}}. If it doesn\'t, you get {{guarantee}}. The only way to lose is to not try.',
                bodyAr: 'إذا نجح، تحصل على {{bestCaseOutcome}}. إذا لم ينجح، تحصل على {{guarantee}}. الطريقة الوحيدة للخسارة هي عدم المحاولة.',
                cta: 'Try it risk-free →',
                ctaAr: 'جربه بلا مخاطر ←'
            },
            mechanism: {
                hook: '⚙️ Here\'s why it works regardless of your situation...',
                hookAr: '⚙️ إليك لماذا ينجح بغض النظر عن وضعك...',
                body: 'Our {{mechanism}} is based on {{universalPrinciple}} that works for {{audienceType}} because {{reason}}. You have everything you need.',
                bodyAr: '{{mechanism}} لدينا يعتمد على {{universalPrinciple}} الذي ينجح مع {{audienceType}} لأن {{reason}}. لديك كل ما تحتاج.',
                cta: 'See how it adapts to you →',
                ctaAr: 'شاهد كيف يتكيف معك ←'
            },
            urgency: {
                hook: '🤔 The only way to KNOW is to try...',
                hookAr: '🤔 الطريقة الوحيدة لتعرف هي أن تجرب...',
                body: 'Wondering won\'t tell you. {{numberOfClients}} people just like you tried it. {{successRate}}% got {{result}}. {{cohortName}} starts {{deadline}}.',
                bodyAr: 'التساؤل لن يخبرك. {{numberOfClients}} شخص مثلك جربوه. {{successRate}}% حصلوا على {{result}}. {{cohortName}} تبدأ {{deadline}}.',
                cta: 'Find out if it works for you →',
                ctaAr: 'اكتشف إذا كان ينجح معك ←'
            },
            clarity: {
                hook: '📋 Here\'s who it works for (and who it doesn\'t)...',
                hookAr: '📋 إليك لمن ينجح (ولمن لا ينجح)...',
                body: 'It works if you: {{criteria1}}, {{criteria2}}, {{criteria3}}. It doesn\'t work if you: {{antiCriteria1}}. Which are you?',
                bodyAr: 'ينجح إذا كنت: {{criteria1}}، {{criteria2}}، {{criteria3}}. لا ينجح إذا كنت: {{antiCriteria1}}. أيهما أنت؟',
                cta: 'Check if you qualify →',
                ctaAr: 'تحقق إذا كنت مؤهلاً ←'
            }
        }
    },
    {
        id: 'dont_want_call',
        label: 'Don\'t Want a Sales Call',
        labelAr: 'لا أريد مكالمة مبيعات',
        blameLayer: 'self',
        needsProof: false,
        coreBeliefToChallenge: 'A call isn\'t required - but the right call accelerates results',
        powerShift: 'Give them a self-service option while showing call value',
        hormoziCloseName: 'The Self-Service Option',
        triggers: ['avoided booking call', 'asked for link instead', 'introverted signals'],
        resolutionStrategies: [
            'Offer self-service checkout option',
            'Show call is optional but valuable',
            'Provide written information instead',
            'Let them buy without talking'
        ],
        scripts: {
            proof: {
                hook: '💬 {{testimonialName}} didn\'t want a call either...',
                hookAr: '💬 {{testimonialName}} لم يرد مكالمة أيضاً...',
                body: 'They bought directly through our {{selfServiceOption}}. No pressure, no pitch. Got {{result}} in {{timeframe}} anyway.',
                bodyAr: 'اشتروا مباشرة عبر {{selfServiceOption}} لدينا. بدون ضغط، بدون عرض. حصلوا على {{result}} في {{timeframe}} على أي حال.',
                cta: 'Buy without a call →',
                ctaAr: 'اشترِ بدون مكالمة ←'
            },
            risk_reversal: {
                hook: '🎯 No call needed. Still guaranteed.',
                hookAr: '🎯 لا مكالمة مطلوبة. لا يزال مضموناً.',
                body: 'Get started through {{selfServiceOption}}. Same {{guarantee}}, same {{result}}, zero awkward calls.',
                bodyAr: 'ابدأ عبر {{selfServiceOption}}. نفس {{guarantee}}، نفس {{result}}، صفر مكالمات محرجة.',
                cta: 'Start call-free →',
                ctaAr: 'ابدأ بدون مكالمة ←'
            },
            mechanism: {
                hook: '⚙️ Here\'s everything you need to decide (no call)...',
                hookAr: '⚙️ إليك كل ما تحتاجه لتقرر (بدون مكالمة)...',
                body: 'Watch the {{contentType}} that explains {{mechanism}}. See {{numberOfTestimonials}} testimonials. Review {{pricing}}. Make your own decision.',
                bodyAr: 'شاهد {{contentType}} الذي يشرح {{mechanism}}. شاهد {{numberOfTestimonials}} شهادات. راجع {{pricing}}. اتخذ قرارك بنفسك.',
                cta: 'Get all the info →',
                ctaAr: 'احصل على كل المعلومات ←'
            },
            urgency: {
                hook: '⏰ The {{offer}} is available now (no call required)...',
                hookAr: '⏰ {{offer}} متاح الآن (بدون مكالمة)...',
                body: '{{bonusDescription}} expires {{deadline}}. Grab it through instant checkout - takes {{checkoutTime}}, zero phone time.',
                bodyAr: '{{bonusDescription}} ينتهي {{deadline}}. احصل عليه عبر الدفع الفوري - يستغرق {{checkoutTime}}، صفر وقت هاتف.',
                cta: 'Get it instantly →',
                ctaAr: 'احصل عليه فوراً ←'
            },
            clarity: {
                hook: '📝 Everything you need to know (call-free)...',
                hookAr: '📝 كل ما تحتاج معرفته (بدون مكالمة)...',
                body: 'What you get: {{deliverables}}. Price: {{price}}. Guarantee: {{guarantee}}. Start: {{startDate}}. Questions? {{supportEmail}} - no phone needed.',
                bodyAr: 'ما تحصل عليه: {{deliverables}}. السعر: {{price}}. الضمان: {{guarantee}}. البدء: {{startDate}}. أسئلة؟ {{supportEmail}} - بدون هاتف.',
                cta: 'Read all the details →',
                ctaAr: 'اقرأ كل التفاصيل ←'
            }
        }
    },
    {
        id: 'dont_need_it',
        label: 'I Don\'t Need It',
        labelAr: 'لا أحتاجه',
        blameLayer: 'self',
        needsProof: false,
        coreBeliefToChallenge: 'They think they can figure it out alone — but the cost of figuring it out is time, money, and lost opportunity',
        powerShift: 'Show the hidden cost of NOT having the system — what they lose by going solo',
        hormoziCloseName: 'The Hidden Cost Close',
        triggers: ['said they can do it alone', 'thinks they already know enough', 'doesn\'t see the value gap'],
        resolutionStrategies: [
            'Show the cost of doing it alone (time, mistakes, lost revenue)',
            'Reveal blind spots they don\'t know they have',
            'Compare DIY results vs. system results with real numbers',
            'Show what "figuring it out" actually costs per month'
        ],
        scripts: {
            proof: {
                hook: '{{testimonialName}} thought they didn\'t need it either...',
                hookAr: '{{testimonialName}} اعتقد أنه لا يحتاجه أيضاً...',
                body: 'They spent {{wastedTime}} trying alone. Lost {{lostRevenue}}. Then joined and got {{result}} in {{timeframe}}.',
                bodyAr: 'قضوا {{wastedTime}} يحاولون بأنفسهم. خسروا {{lostRevenue}}. ثم انضموا وحققوا {{result}} في {{timeframe}}.',
                cta: 'Stop guessing →',
                ctaAr: 'توقف عن التخمين ←'
            },
            risk_reversal: {
                hook: 'What if you\'re right... and what if you\'re not?',
                hookAr: 'ماذا لو كنت محقاً... وماذا لو لم تكن؟',
                body: 'If you don\'t need it, you\'ll know in {{trialPeriod}} and get {{guarantee}}. But if you DO need it, every month costs you {{monthlyCost}}.',
                bodyAr: 'إذا لم تحتاجه، ستعرف خلال {{trialPeriod}}. لكن إذا كنت تحتاجه، كل شهر بدونه يكلفك {{monthlyCost}}.',
                cta: 'Try risk-free →',
                ctaAr: 'جرّب بدون مخاطرة ←'
            },
            mechanism: {
                hook: 'Here\'s what you\'re missing and don\'t know you\'re missing...',
                hookAr: 'إليك ما ينقصك ولا تعرف أنه ينقصك...',
                body: 'Most {{profession}} think they need more {{commonMistake}}. The real gap is {{actualGap}}. Our system closes it with {{mechanism}}.',
                bodyAr: 'معظم {{profession}} يعتقدون أنهم يحتاجون {{commonMistake}}. الفجوة الحقيقية هي {{actualGap}}. نظامنا يسدها بـ {{mechanism}}.',
                cta: 'See what you\'re missing →',
                ctaAr: 'اكتشف ما ينقصك ←'
            },
            urgency: {
                hook: 'Every month without a system costs you {{monthlyCost}}...',
                hookAr: 'كل شهر بدون نظام يكلفك {{monthlyCost}}...',
                body: 'That\'s {{yearlyLoss}} per year. The investment pays for itself in {{paybackPeriod}}. But only if you start now — {{deadline}}.',
                bodyAr: 'هذا {{yearlyLoss}} سنوياً. الاستثمار يسدد نفسه في {{paybackPeriod}}. لكن فقط إذا بدأت الآن — {{deadline}}.',
                cta: 'Calculate your losses →',
                ctaAr: 'احسب خسائرك ←'
            },
            clarity: {
                hook: 'Think you don\'t need it? Quick check...',
                hookAr: 'تعتقد أنك لا تحتاجه؟ فحص سريع...',
                body: 'Are you getting {{benchmark1}}? Spending less than {{benchmark2}} per client? Converting at {{benchmark3}}? If not, you need a system.',
                bodyAr: 'هل تحقق {{benchmark1}}؟ تنفق أقل من {{benchmark2}} لكل عميل؟ تحويلات بنسبة {{benchmark3}}؟ إذا لا، أنت تحتاج نظام.',
                cta: 'Take the assessment →',
                ctaAr: 'خذ التقييم ←'
            }
        }
    }
];

// =============================================================================
// COMBINED EXPORT
// =============================================================================

// Retargeting is Pro+ only (Starter has 0 objections — retargeting mode itself is gated).
// Pro and Scale both get all 12 objections; first 4 are the most universal.
const ALL_OBJECTIONS_UNORDERED = [...CIRCUMSTANCES_OBJECTIONS, ...OTHER_PEOPLE_OBJECTIONS, ...SELF_OBJECTIONS];
const pick = (id: RetargetingObjectionId) => ALL_OBJECTIONS_UNORDERED.find(o => o.id === id)!;

export const RETARGETING_OBJECTION_DATA: RetargetingObjectionData[] = [
    // ── Most universal objections (first 4) ──
    pick('price_too_high'),
    pick('dont_trust'),
    pick('will_it_work_for_me'),
    pick('no_time'),
    // ── Remaining 8 (pro/scale get all 12) ──
    pick('no_budget_now'),
    pick('need_installments'),
    pick('tried_before_failed'),
    pick('overwhelmed'),
    pick('not_ready_yet'),
    pick('need_approval'),
    pick('dont_want_call'),
    pick('dont_need_it'),
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get full objection data by ID
 */
export function getObjectionData(id: RetargetingObjectionId): RetargetingObjectionData | undefined {
    return RETARGETING_OBJECTION_DATA.find(obj => obj.id === id);
}

/**
 * Get specific script for an objection and angle
 */
export function getScript(
    objectionId: RetargetingObjectionId,
    angle: RetargetingAngle
): ObjectionScript | undefined {
    const objection = getObjectionData(objectionId);
    return objection?.scripts[angle];
}

/**
 * Get all objections that need social proof
 */
export function getProofBasedObjections(): RetargetingObjectionData[] {
    return RETARGETING_OBJECTION_DATA.filter(obj => obj.needsProof);
}

/**
 * Get objections by blame layer
 */
export function getObjectionsByLayer(layer: BlameLayer): RetargetingObjectionData[] {
    return RETARGETING_OBJECTION_DATA.filter(obj => obj.blameLayer === layer);
}

/**
 * Generate retargeting ad copy variations for an objection
 */
export function generateRetargetingCopy(
    objectionId: RetargetingObjectionId,
    variables: Record<string, string>,
    language: 'en' | 'ar' = 'en'
): Array<{ angle: RetargetingAngle; hook: string; body: string; cta: string }> {
    const objection = getObjectionData(objectionId);
    if (!objection) return [];

    const angles: RetargetingAngle[] = ['proof', 'risk_reversal', 'mechanism', 'urgency', 'clarity'];

    return angles.map(angle => {
        const script = objection.scripts[angle];
        const hook = language === 'ar' ? script.hookAr : script.hook;
        const body = language === 'ar' ? script.bodyAr : script.body;
        const cta = language === 'ar' ? script.ctaAr : script.cta;

        // Replace variables
        const replaceVars = (text: string): string => {
            return text.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
        };

        return {
            angle,
            hook: replaceVars(hook),
            body: replaceVars(body),
            cta: replaceVars(cta)
        };
    });
}

/**
 * Get objection handling context for Gemini prompt
 */
export function getObjectionPromptContext(objectionId: RetargetingObjectionId): string {
    const objection = getObjectionData(objectionId);
    if (!objection) return '';

    return `
OBJECTION: ${objection.label}
BLAME LAYER: ${objection.blameLayer} (${objection.blameLayer === 'circumstances' ? 'They blame external circumstances' :
            objection.blameLayer === 'other_people' ? 'They blame other people/experiences' :
                'They blame themselves'
        })
CORE BELIEF TO CHALLENGE: ${objection.coreBeliefToChallenge}
POWER SHIFT: ${objection.powerShift}
HORMOZI CLOSE: ${objection.hormoziCloseName}
RESOLUTION STRATEGIES:
${objection.resolutionStrategies.map(s => `- ${s}`).join('\n')}
`;
}

/**
 * Export all objection IDs for type safety
 */
export const ALL_OBJECTION_IDS = RETARGETING_OBJECTION_DATA.map(obj => obj.id);

// ─── PLAN-GATED OBJECTION HELPERS ───────────────────────────────────────────
import type { StoredPlan } from './entitlements';

/** Get the objections available for a given plan. Starter/none = [] (retargeting is gated). */
export const getAvailableObjections = (plan: StoredPlan): RetargetingObjectionData[] => {
    if (plan === 'starter' || plan === 'none') return [];
    return RETARGETING_OBJECTION_DATA;
};

/** Check if a specific objection is available for a given plan. */
export const isObjectionAvailable = (plan: StoredPlan, objectionId: RetargetingObjectionId): boolean => {
    return getAvailableObjections(plan).some(o => o.id === objectionId);
};

/**
 * Auto-select the BEST retargeting angle for a given objection.
 * Based on Hormozi's framework: each objection has a primary psychological lever.
 * 
 * CIRCUMSTANCES (external blame) → proof or clarity work best (show them the math)
 * OTHER PEOPLE (blame others)    → risk_reversal or mechanism (remove the fear)
 * SELF (internal blame)          → proof or risk_reversal (build confidence)
 */
export const BEST_ANGLE_FOR_OBJECTION: Record<string, RetargetingAngle> = {
    // ─── CIRCUMSTANCES ─────────────────────────
    'price_too_high': 'clarity',        // Break down cost per day, compare to cost of problem
    'no_budget_now': 'mechanism',      // Show ROI machine — it pays for itself
    'need_installments': 'risk_reversal',  // Pay over time, results guaranteed
    'no_time': 'proof',          // Show busy people who made it work
    'overwhelmed': 'mechanism',      // Position solution AS the cure for overwhelm
    'not_ready_yet': 'urgency',        // Readiness is created by starting, not waiting

    // ─── OTHER PEOPLE ──────────────────────────
    'need_approval': 'mechanism',      // Give them the business case to share
    'dont_trust': 'risk_reversal',  // Guarantee removes the burned-before fear
    'tried_before_failed': 'mechanism',      // Diagnose WHY it failed + why this is different

    // ─── SELF ──────────────────────────────────
    'will_it_work_for_me': 'proof',          // Show people in their exact situation succeeding
    'dont_want_call': 'clarity',        // Here's everything you need, no call required
    'dont_need_it': 'mechanism',        // Reveal what they don't know they're missing
};

/**
 * Get the best angle for an objection ID, with fallback for custom objections.
 * For custom objections, analyzes keywords to pick the best angle.
 */
export function getBestAngleForObjection(
    objectionId?: string | null,
    customObjection?: string
): RetargetingAngle {
    // Known objection → use the mapping
    if (objectionId && BEST_ANGLE_FOR_OBJECTION[objectionId]) {
        return BEST_ANGLE_FOR_OBJECTION[objectionId];
    }

    // Custom objection → keyword analysis
    if (customObjection) {
        const lower = customObjection.toLowerCase();
        const arabic = customObjection;

        // Price/money keywords
        if (lower.includes('price') || lower.includes('expensive') || lower.includes('cost') || lower.includes('money') || lower.includes('budget')
            || arabic.includes('سعر') || arabic.includes('غالي') || arabic.includes('تكلف') || arabic.includes('فلوس') || arabic.includes('ميزانية')) {
            return 'clarity';
        }
        // Time keywords
        if (lower.includes('time') || lower.includes('busy') || lower.includes('schedule')
            || arabic.includes('وقت') || arabic.includes('مشغول') || arabic.includes('انشغال')) {
            return 'proof';
        }
        // Trust/failure keywords
        if (lower.includes('trust') || lower.includes('scam') || lower.includes('fail') || lower.includes('tried') || lower.includes('burned')
            || arabic.includes('ثقة') || arabic.includes('فشل') || arabic.includes('جربت') || arabic.includes('خداع') || arabic.includes('نصب')) {
            return 'risk_reversal';
        }
        // Doubt/self keywords
        if (lower.includes('work for me') || lower.includes('different') || lower.includes('special case')
            || arabic.includes('ينجح معي') || arabic.includes('حالتي') || arabic.includes('مختلف')) {
            return 'proof';
        }
        // Overwhelm keywords
        if (lower.includes('overwhelm') || lower.includes('complicated') || lower.includes('too much')
            || arabic.includes('إرهاق') || arabic.includes('معقد') || arabic.includes('كثير')) {
            return 'mechanism';
        }
    }

    // Ultimate fallback: risk_reversal is the most universally effective
    return 'risk_reversal';
}

// =============================================================================
// NORMALIZED RETARGETING CONTEXT
// =============================================================================

/**
 * A single, unambiguous snapshot of the retargeting state that every generation
 * step can consume.  Stable IDs for logic; display labels for prompts only.
 */
export interface NormalizedRetargetingContext {
    /** true when campaignType === 'retargeting' AND at least one objection source exists */
    isRetargeting: boolean;
    /** The single effective objection ID (first element of array, or null) */
    objectionId: RetargetingObjectionId | null;
    /** English label of the selected objection (for prompt text) */
    objectionLabel: string;
    /** Arabic label of the selected objection (for Arabic prompt text) */
    objectionLabelAr: string;
    /** Free-text custom objection (when user picks "custom") */
    customObjection: string;
    /** Testimonial / proof line supplied by user */
    testimonial: string;
    /** Auto-selected best retargeting angle for this objection */
    bestAngle: RetargetingAngle;
    /** Human-readable angle name for prompt injection */
    bestAngleLabel: string;
    /** Full Hormozi psychology block (for prompt enrichment) */
    hormoziContext: string;
    /** Blame layer of the objection */
    blameLayer: string;
    /** The effective objection text to show in prompts (custom or label) */
    effectiveObjectionText: string;
}

const ANGLE_LABELS: Record<RetargetingAngle, string> = {
    'proof': 'EXTERNAL PROOF',
    'risk_reversal': 'RISK REVERSAL',
    'mechanism': 'MECHANISM',
    'urgency': 'URGENCY / COST OF INACTION',
    'clarity': 'CLARITY / BREAKDOWN',
};

/**
 * Build a NormalizedRetargetingContext from raw AdInputs fields.
 * This is the SINGLE function all generation steps should call.
 */
export function buildNormalizedRetargetingContext(inputs: {
    campaignType?: string;
    retargetingObjection?: string;
    retargetingObjections?: string[];
    customObjection?: string;
    testimonial?: string;
}): NormalizedRetargetingContext {
    const campaignType = inputs.campaignType || 'cold';
    // Canonical single field takes priority; fall back to legacy array[0]
    const rawObjId = inputs.retargetingObjection || (inputs.retargetingObjections || [])[0] || null;
    const customObjection = (inputs.customObjection || '').trim();
    const testimonial = (inputs.testimonial || '').trim();
    const objectionId = (rawObjId as RetargetingObjectionId) || null;
    const objectionData = objectionId ? getObjectionData(objectionId) : null;

    const isRetargeting = campaignType === 'retargeting' && (!!objectionId || !!customObjection);

    const bestAngle = isRetargeting
        ? getBestAngleForObjection(objectionId, customObjection)
        : 'proof';

    const effectiveObjectionText = customObjection || (objectionData?.label ?? 'General hesitation');

    // Build Hormozi psychology block
    let hormoziContext = '';
    if (objectionData) {
        hormoziContext = [
            `OBJECTION: ${objectionData.label}`,
            `BLAME LAYER: ${objectionData.blameLayer}`,
            `CORE BELIEF TO CHALLENGE: ${objectionData.coreBeliefToChallenge}`,
            `POWER SHIFT: ${objectionData.powerShift}`,
            `HORMOZI CLOSE: ${objectionData.hormoziCloseName}`,
            `RESOLUTION STRATEGIES:`,
            ...objectionData.resolutionStrategies.map(s => `- ${s}`),
        ].join('\n');
    } else if (customObjection) {
        hormoziContext = [
            `CUSTOM OBJECTION: "${customObjection}"`,
            `PSYCHOLOGY: Analyze this objection and identify the underlying fear or belief.`,
            `Then counter it using ${ANGLE_LABELS[bestAngle]} strategy.`,
        ].join('\n');
    }

    return {
        isRetargeting,
        objectionId,
        objectionLabel: objectionData?.label ?? '',
        objectionLabelAr: objectionData?.labelAr ?? '',
        customObjection,
        testimonial,
        bestAngle,
        bestAngleLabel: ANGLE_LABELS[bestAngle] || 'RISK REVERSAL',
        hormoziContext,
        blameLayer: objectionData?.blameLayer ?? '',
        effectiveObjectionText,
    };
}

/**
 * Build a prompt block that can be injected into any generation step.
 * Returns empty string for cold campaigns.
 */
export function getRetargetingPromptBlock(ctx: NormalizedRetargetingContext): string {
    if (!ctx.isRetargeting) return '';

    return `
═══ RETARGETING CONTEXT (THIS IS NOT A COLD AD) ═══
AUDIENCE: These people ALREADY know the offer. They visited, considered, but did NOT buy.
OBJECTION TO ADDRESS: "${ctx.effectiveObjectionText}"
PRIMARY COUNTER-STRATEGY: ${ctx.bestAngleLabel}
${ctx.testimonial ? `PROOF/TESTIMONIAL: "${ctx.testimonial}"` : ''}
${ctx.hormoziContext ? `\n${ctx.hormoziContext}` : ''}

CRITICAL RULES FOR RETARGETING:
- Do NOT introduce the product as if the audience has never heard of it
- Do NOT use cold-audience discovery framing ("Have you ever...?", "What if...?")
- DO address the specific objection "${ctx.effectiveObjectionText}" directly
- DO assume familiarity with the offer
- DO use ${ctx.bestAngleLabel} as the primary persuasion lever
${ctx.testimonial ? `- DO weave the testimonial/proof into the content naturally` : ''}
═══════════════════════════════════════════════════════
`.trim();
}