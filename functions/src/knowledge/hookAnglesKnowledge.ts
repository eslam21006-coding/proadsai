// src/knowledge/hookAnglesKnowledge.ts
// Deep copywriting knowledge for each cold ad hook angle
// Used by geminiService to inject angle-specific instructions into prompts

export interface HookAngleKnowledge {
    promptInstruction: string;      // Injected into generateTOV prompt
    headlineFormula: string;        // Specific headline structure for this angle
    examplesAr: string[];           // Arabic examples
    examplesEn: string[];           // English examples
    subheadlineStrategy: string;    // How to complement the headline
    ctaStrategy: string;            // CTA approach for this angle
    visualDirection: string;        // Guidance for generateConcepts (scene mood)
    captionStrategy: string;        // How the caption should expand on this angle
    carouselStrategy?: string;      // How to extend this across carousel slides
}

export const HOOK_ANGLE_KNOWLEDGE: Record<string, HookAngleKnowledge> = {

    emotional: {
        promptInstruction: `EMOTIONAL ANGLE — Trigger deep feelings that bypass rational thinking.
The headline must hit an EMOTION directly: fear, hope, pride, frustration, desire, or shame.
Do NOT describe the product. Describe the FEELING the prospect has right now or wants to have.
The best emotional hooks make the reader feel UNDERSTOOD before they feel sold to.`,
        headlineFormula: '[Name the emotion] + [Situation that triggers it]',
        examplesAr: [
            'أنت تعرف ذلك الشعور... لما تشوف منافسك يكبر وأنت واقف',
            'كل يوم تأخير يكلفك أكثر مما تتخيل',
            'خبرتك تستحق أكثر من اللي بتحصل عليه',
        ],
        examplesEn: [
            'You know that feeling... watching competitors grow while you stand still',
            'Every day you delay costs more than you imagine',
            'Your expertise deserves more than what you are getting',
        ],
        subheadlineStrategy: 'Validate the emotion, then hint at resolution. "وهذا بالضبط ليه..." / "And that is exactly why..."',
        ctaStrategy: 'CTA should feel like emotional relief: "اكتشف الطريق" / "Find your way"',
        visualDirection: 'Warm, cinematic lighting. Hero with a contemplative or determined expression. Soft bokeh. The scene should feel intimate and personal, not corporate.',
        captionStrategy: 'Open by NAMING the exact emotional state. Use "أنت" (you) in every sentence. Build empathy for 3-4 sentences, then pivot to hope. End with a gentle CTA.',
        carouselStrategy: 'Slide 1: Name the emotion. Slides 2-3: Validate with specific situations. Slide 4: The emotional turning point. Final: Resolution + CTA.',
    },

    logic: {
        promptInstruction: `LOGIC ANGLE — Appeal to reason with irrefutable arguments.
The headline must present a LOGICAL ARGUMENT: comparison, calculation, or undeniable fact.
Use numbers, percentages, timeframes, or A vs B comparisons.
The reader should think "That makes sense" not "That sounds exciting."`,
        headlineFormula: '[Logical statement] + [Number/comparison that proves it]',
        examplesAr: [
            'استثمار 27 دولار يعود عليك بـ 10 أضعاف في 90 يوم',
            'لماذا يدفع 73% من العملاء أكثر للمتخصص؟',
            '3 ساعات أسبوعياً × 12 شهر = نظام يعمل وأنت نائم',
        ],
        examplesEn: [
            '$27 investment returns 10x in 90 days',
            'Why do 73% of clients pay more for specialists?',
            '3 hours/week × 12 months = a system that works while you sleep',
        ],
        subheadlineStrategy: 'Provide the supporting data point or the "therefore..." conclusion.',
        ctaStrategy: 'CTA should be rational: "احسب عائدك" / "Calculate your return"',
        visualDirection: 'Clean, structured composition. Charts, graphs, or data elements can appear subtly in the environment. Professional, bright lighting. The hero looks analytical and confident.',
        captionStrategy: 'Build a logical argument in 4-5 steps. Each sentence is a premise that leads to an inescapable conclusion. Use "because," "therefore," "this means."',
    },

    urgency: {
        promptInstruction: `URGENCY ANGLE — Create time pressure that demands immediate action.
The headline must include a DEADLINE, COUNTDOWN, or EXPIRING ELEMENT.
The urgency must feel REAL, not manufactured. Tie it to a genuine constraint: limited seats, closing enrollment, price increase, seasonal timing.
Best when combined with loss aversion: what they LOSE by waiting.`,
        headlineFormula: '[What expires/closes] + [Timeframe] + [Consequence of missing]',
        examplesAr: [
            'باقي 7 مقاعد فقط — التسجيل يغلق الخميس',
            'السعر يرتفع بعد 48 ساعة',
            'آخر فرصة هذا الشهر للانضمام بالسعر الحالي',
        ],
        examplesEn: [
            'Only 7 seats left — enrollment closes Thursday',
            'Price increases in 48 hours',
            'Last chance this month to join at current price',
        ],
        subheadlineStrategy: 'Explain WHY the deadline exists (legitimize the urgency).',
        ctaStrategy: 'CTA should have time language: "سجّل الآن" / "Secure your spot now"',
        visualDirection: 'URGENCY DESIGN: High-energy composition with warm/hot accents (red, orange, gold). MUST include a visible COUNTDOWN TIMER or CLOCK element (digital countdown format like 02:45:18, or analog clock with dramatic lighting). Add a "ينتهي قريباً" / "Ending Soon" badge. The hero looks decisive and active, gesturing forward. Background should feel dynamic — motion blur, light streaks, or speed lines. The timer/countdown should be a prominent design element, not a small detail.',
        captionStrategy: 'Start with what they miss if they wait. Stack the losses. Then present the deadline as a GIFT (one last chance). Close with urgent CTA.',
    },

    scarcity: {
        promptInstruction: `SCARCITY ANGLE — Limited availability creates desire.
The headline must communicate EXCLUSIVITY or LIMITED SUPPLY.
Scarcity works best when the limitation is STRUCTURAL (small group, limited capacity, invite-only), not manufactured.
Combine with social proof: "others are already in."`,
        headlineFormula: '[Limited quantity/access] + [Why it is limited] + [Social proof of demand]',
        examplesAr: [
            'فقط 20 مقعد — 14 تم حجزهم بالفعل',
            'مجموعة حصرية — لا نقبل الجميع',
            'الدفعة القادمة بعد 3 أشهر',
        ],
        examplesEn: [
            'Only 20 seats — 14 already taken',
            'Exclusive group — we do not accept everyone',
            'Next cohort in 3 months',
        ],
        subheadlineStrategy: 'Explain the reason for limitation and what makes it exclusive.',
        ctaStrategy: 'CTA should emphasize securing the spot: "احجز مقعدك" / "Reserve your seat"',
        visualDirection: 'Premium, exclusive feel. Dark backgrounds with gold/platinum accents. VIP energy. The hero looks like they belong to an elite group.',
        captionStrategy: 'Open with the exclusivity. Explain why it is limited. Show who is already inside. Make them feel they might miss the door closing.',
    },

    pain: {
        promptInstruction: `PAIN AMPLIFICATION ANGLE — Press harder on the wound.
The headline must make the reader FEEL their current frustration, struggle, or loss RIGHT NOW.
Do NOT solve anything yet. Just name the pain so precisely they think "this person is reading my mind."
The more specific the pain, the more powerful the hook.`,
        headlineFormula: '[Vivid specific pain] + [How long they have suffered it]',
        examplesAr: [
            'كل شهر نفس القصة — تشتغل أكثر وتكسب أقل',
            'تعرف اللحظة لما تحسب دخلك وتكتشف إنك تبيع وقتك ببلاش؟',
            'متى آخر مرة رفضت عميل لأن أسعارك واطية؟',
        ],
        examplesEn: [
            'Same story every month — working more, earning less',
            'That moment when you calculate your income and realize you are selling time for free',
            'When was the last time you turned down a client because your prices are too low?',
        ],
        subheadlineStrategy: 'Twist the knife one more turn, THEN hint at escape. "ومع ذلك... في حل"',
        ctaStrategy: 'CTA should promise pain relief: "أوقف النزيف" / "Stop the bleeding"',
        visualDirection: 'Moody, dramatic lighting. Dark tones with a single warm light source. The hero can look frustrated or determined. The environment should reflect the struggle — cluttered desk, late night, etc.',
        captionStrategy: 'Open with the EXACT pain scenario (be so specific it is uncomfortable). Spend 60% on pain, 30% on the escape mechanism, 10% on CTA.',
    },

    curiosity: {
        promptInstruction: `CURIOSITY ANGLE — Create an information gap they MUST close.
The headline must open a LOOP that can only be closed by clicking.
The best curiosity hooks hint at secret knowledge, unexpected truth, or counterintuitive insight.
Never reveal the answer in the headline — tease it.`,
        headlineFormula: '[Unexpected claim or question] + [Implied secret/answer]',
        examplesAr: [
            'الشيء الوحيد اللي ناقصك — وما حد بيقولك عليه',
            'لماذا أنجح المدربين لا يبيعون أبداً؟',
            'اكتشفت سر بعد 5 سنوات — كنت أتمنى لو عرفته من البداية',
        ],
        examplesEn: [
            'The one thing you are missing — that nobody tells you',
            'Why do the most successful coaches never sell?',
            'I discovered a secret after 5 years — wish I knew it from day one',
        ],
        subheadlineStrategy: 'Deepen the gap without closing it. "وعندما عرفته... كل شيء تغير"',
        ctaStrategy: 'CTA should promise revelation: "اكتشف السر" / "Discover the secret"',
        visualDirection: 'Mysterious, intriguing lighting. Dramatic shadows. The hero can be partially revealed or have an enigmatic expression. Use depth of field to create visual mystery.',
        captionStrategy: 'Open with the curiosity hook. Build 3-4 teases that each deepen the gap. Reveal PARTIALLY (enough to prove value, not enough to satisfy). CTA = full reveal.',
    },

    statistics: {
        promptInstruction: `STATISTICS ANGLE — Lead with a jaw-dropping number.
The headline must contain a SPECIFIC, SURPRISING STATISTIC that reframes their situation.
The stat should make them question their current approach or realize they are in the wrong group.
Format: "X% do Y — only Z% achieve W. Which group are you in?"`,
        headlineFormula: '[Shocking percentage/number] + [What it means for them]',
        examplesAr: [
            '95% من المدربين يكسبون أقل من 3000 دولار شهرياً — 5% فقط كسروا الحاجز',
            '8 من 10 عملاء يشترون من أول تواصل — إذا عرفت الطريقة',
            'المدرب العربي يخسر 47,000 دولار سنوياً بسبب خطأ واحد في التسعير',
        ],
        examplesEn: [
            '95% of coaches earn less than $3K/month — only 5% broke the barrier',
            '8 out of 10 clients buy on first contact — if you know the method',
            'The average coach loses $47K/year from one pricing mistake',
        ],
        subheadlineStrategy: 'Explain what separates the successful minority. "الفرق؟ نظام واحد بسيط"',
        ctaStrategy: 'CTA should promise joining the elite group: "انضم لـ 5%" / "Join the 5%"',
        visualDirection: 'Bold, data-driven visual elements. Numbers or percentages can appear as design accents. Clean, modern, authoritative. The hero looks like they have the answers.',
        captionStrategy: 'Open with the stat. Explain what it means. Reveal what the successful minority does differently. Position your product as the bridge.',
    },

    social_proof: {
        promptInstruction: `SOCIAL PROOF ANGLE — Let results speak louder than claims.
The headline must feature a CLIENT RESULT, TESTIMONIAL, or CROWD SIGNAL.
The best social proof is specific: name, number, timeframe.
"Ahmad got 18 booking calls in 10 days" beats "Our clients get results."`,
        headlineFormula: '[Client name/type] + [Specific result] + [Timeframe]',
        examplesAr: [
            'أحمد حقق 18 مكالمة حجز في 10 أيام — نفس النظام متاح لك',
            'من 3 عملاء إلى 47 في 60 يوم — قصة سارة الحقيقية',
            '127 متخصص عربي طبقوا نفس النظام — النتائج؟',
        ],
        examplesEn: [
            'Ahmad got 18 booking calls in 10 days — same system available to you',
            'From 3 to 47 clients in 60 days — Sarah\'s real story',
            '127 Arab specialists applied the same system — the results?',
        ],
        subheadlineStrategy: 'Add a second proof point or explain that anyone can replicate it.',
        ctaStrategy: 'CTA should be low-friction: "شاهد القصة كاملة" / "Watch the full story"',
        visualDirection: 'Bright, positive, success-oriented. Can include result screenshots, numbers floating in the scene, or multiple happy figures in background. The hero radiates confidence.',
        captionStrategy: 'Open with the specific result. Tell the mini-story (who they were before, what they did, what happened). Then generalize: "وأنت ممكن تحقق نفس الشيء."',
        carouselStrategy: 'Each slide is a different client result or testimonial. Build a wall of proof. Final slide: "والآن دورك."',
    },

    logical_authority: {
        promptInstruction: `LOGICAL AUTHORITY ANGLE — Establish credibility through credentials and track record.
The headline must position the speaker/product as THE authority on this topic.
Use: number of clients helped, years of experience, unique methodology name, first-in-market claim.
Authority is STATED, not implied.`,
        headlineFormula: '[Credential/number] + [Unique claim] + [Result]',
        examplesAr: [
            'ساعدت 340 مدرب عربي يتخطوا حاجز 10,000 دولار شهرياً',
            'أول نظام عربي مصمم خصيصاً لمقدمي الخدمات المتميزة',
            'بعد 7 سنوات و500 عميل — اكتشفت النظام الوحيد اللي يشتغل',
        ],
        examplesEn: [
            'Helped 340 Arab coaches break the $10K/month barrier',
            'First Arabic system designed specifically for premium service providers',
            'After 7 years and 500 clients — discovered the only system that works',
        ],
        subheadlineStrategy: 'Explain WHY this authority matters to THEM specifically.',
        ctaStrategy: 'CTA should leverage authority: "تعلّم من الخبير" / "Learn from the expert"',
        visualDirection: 'Prestigious, professional setting. Awards, books, or credentials can be subtly visible. The hero looks accomplished and authoritative. Premium lighting.',
        captionStrategy: 'Open with the authority claim. Back it with 2-3 specific proof points. Then pivot to how this authority benefits THEM. End with credibility-backed CTA.',
    },

    future_based: {
        promptInstruction: `FUTURE-BASED ANGLE — Paint a vivid picture of their desired future.
The headline must start with "تخيل لو..." (Imagine if...) or similar future-projection language.
The future must be SPECIFIC and SENSORY: what they see, feel, do differently.
Make the future feel so real they already want to live in it.`,
        headlineFormula: '"تخيل لو..." + [Specific vivid future scenario]',
        examplesAr: [
            'تخيل لو تفتح لابتوبك الصبح وتلاقي 5 طلبات حجز جديدة',
            'تخيل لو عملاؤك يدفعون بفرح بدون ما تتفاوض',
            'بعد 90 يوم من الآن... تخيل حياتك مع نظام مبيعات يعمل 24/7',
        ],
        examplesEn: [
            'Imagine opening your laptop and finding 5 new booking requests',
            'Imagine clients paying happily without negotiating',
            '90 days from now... imagine your life with a 24/7 sales system',
        ],
        subheadlineStrategy: 'Add another layer of the future vision or explain that it is achievable.',
        ctaStrategy: 'CTA should bridge present to future: "ابدأ الرحلة" / "Start the journey"',
        visualDirection: 'Bright, aspirational lighting. Golden hour or sunrise tones. The hero looks confident, relaxed, and fulfilled. The environment shows success already achieved.',
        captionStrategy: 'Open with "تخيل..." then paint 3-4 specific future scenarios. Make it so vivid they can taste it. Then bridge: "هذا مش حلم — هذا النظام." CTA.',
        carouselStrategy: 'Slide 1: "تخيل لو..." Slides 2-4: Each a different vivid future scenario. Final slide: "هذا ممكن يبدأ اليوم" + CTA.',
    },
};

// Helper to get prompt instructions for a given angle
export const getHookAnglePrompt = (angleId: string): string => {
    const knowledge = HOOK_ANGLE_KNOWLEDGE[angleId];
    if (!knowledge) return '';
    return `
${knowledge.promptInstruction}

HEADLINE FORMULA: ${knowledge.headlineFormula}
EXAMPLES (Arabic): ${knowledge.examplesAr.map(e => `"${e}"`).join(' | ')}
SUBHEADLINE STRATEGY: ${knowledge.subheadlineStrategy}
CTA STRATEGY: ${knowledge.ctaStrategy}`;
};

// Helper to get visual direction for concepts
export const getHookAngleVisualDirection = (angleId: string): string => {
    return HOOK_ANGLE_KNOWLEDGE[angleId]?.visualDirection || '';
};

// Helper to get caption strategy
export const getHookAngleCaptionStrategy = (angleId: string): string => {
    const k = HOOK_ANGLE_KNOWLEDGE[angleId];
    if (!k) return '';
    return `ANGLE-SPECIFIC CAPTION STRATEGY: ${k.captionStrategy}`;
};

// Helper to get carousel strategy
export const getHookAngleCarouselStrategy = (angleId: string): string => {
    return HOOK_ANGLE_KNOWLEDGE[angleId]?.carouselStrategy || '';
};

// ─── MODE-SPECIFIC 4-HOOK VARIATION BLUEPRINTS ─────────────────────────
// When the user selects a specific hook angle, ALL 4 hooks must stay within
// that angle. These blueprints define 4 DISTINCT variations INSIDE the angle
// so variation happens within the mode, not by drifting to other archetypes.

const ANGLE_VARIATION_BLUEPRINTS: Record<string, string> = {

    urgency: `
【URGENCY-NATIVE VARIATIONS — ALL 4 hooks must create genuine time pressure】

⚠️ HONEST DEGRADATION: If the user has NOT provided specific urgency details (deadline, seats left, price increase),
use COST-OF-DELAY urgency instead of fabricating fake countdowns. Never invent specific dates, seat counts, or prices.

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → DEADLINE CLOSE (or Cost of Delay if no deadline provided)
DIMENSION: Time running out. The reader should feel a ticking clock — that a specific window is closing.
CONSTRAINTS: Must reference a time element (deadline, countdown, or the accumulating cost of each passing day). If real deadline provided, use it. If not, frame delay itself as the enemy.
FEELING: Urgency, racing heartbeat, "I need to act NOW before it's too late."
SUBHEADLINE: Explain WHY the deadline exists or how delay compounds losses.

【HOOK B】 → PRICE INCREASE / VALUE LOSS
DIMENSION: Financial penalty for waiting. The reader should feel they are literally paying more by hesitating.
CONSTRAINTS: Must tie inaction to a monetary or value cost. If real price info provided, use it. If not, frame the cost of delay in terms of lost revenue, wasted spend, or opportunity cost.
FEELING: Financial anxiety — "every day I wait, I'm losing money."
SUBHEADLINE: Quantify or describe what the delay costs in tangible terms.

【HOOK C】 → SEATS / CAPACITY LIMIT (or Momentum Loss)
DIMENSION: Others are already moving. The reader should feel left behind while competitors act.
CONSTRAINTS: Must include a social element — others taking action. If real seat info provided, use it. If not, frame competitors or peers as already ahead.
FEELING: FOMO, being overtaken, falling behind the wave.
SUBHEADLINE: Social proof of others acting + consequence of continued hesitation.

【HOOK D】 → COST OF INACTION / FUTURE REGRET
DIMENSION: Future self looking back with regret. The reader should feel the weight of a missed turning point.
CONSTRAINTS: Must contrast two future paths — one where they act now, one where they don't. Paint the regret of inaction.
FEELING: Dread of stagnation, fear of looking back and realizing this was the moment.
SUBHEADLINE: Paint the future pain of NOT acting today — loss compounding over time.
`,

    scarcity: `
【SCARCITY-NATIVE VARIATIONS — ALL 4 hooks must create exclusivity/limitation tension】

⚠️ HONEST DEGRADATION: If no specific scarcity details provided, use STRUCTURAL scarcity
(small group model, quality control, personal attention) rather than fabricating fake limits.

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → QUANTITY LIMIT
DIMENSION: There are only so many spots. The reader should feel the door is closing because of limited supply.
CONSTRAINTS: Must communicate a hard or structural limit on availability. If real limit info provided, use it. If not, justify the limit through quality/attention reasons.
FEELING: Exclusivity anxiety — "if I don't grab this now, someone else will."
SUBHEADLINE: WHY the limit exists (personal attention, quality, exclusivity).

【HOOK B】 → ACCESS RESTRICTION / GATEKEEPING
DIMENSION: Not everyone qualifies. The reader should feel this is selective, aspirational.
CONSTRAINTS: Must imply a filter or selection process. Frame acceptance as earned, not guaranteed.
FEELING: Aspirational desire to be "chosen," elite belonging.
SUBHEADLINE: What qualifies someone — creates desire to prove they belong.

【HOOK C】 → NEXT COHORT / WAIT TIME
DIMENSION: Miss this window, wait a long time. The reader should feel the pain of a delayed restart.
CONSTRAINTS: Must reference timing — this round vs. the next. If real cohort info provided, use it. If not, frame the current window as rare.
FEELING: Now-or-never tension, fear of being stuck waiting.
SUBHEADLINE: What happens to those who wait (they miss this round entirely).

【HOOK D】 → DEMAND vs SUPPLY / SOCIAL PROOF OF SCARCITY
DIMENSION: Demand already exceeds supply. The reader should feel they are competing for a scarce resource.
CONSTRAINTS: Must show that others want this too — high demand, limited space. Social proof of popularity combined with limitation.
FEELING: Competitive urgency — "others are already ahead of me in line."
SUBHEADLINE: Others already competed for this spot + what the insider community looks like.
`,

    social_proof: `
【SOCIAL PROOF-NATIVE VARIATIONS — ALL 4 hooks must lead with real proof signals】

⚠️ HONEST DEGRADATION: If no specific testimonials/stats provided, use MARKET PATTERN proof
rather than fabricating fake client names or results.

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → SPECIFIC CLIENT RESULT
DIMENSION: One person's concrete outcome. The reader should feel "if they did it, I can too."
CONSTRAINTS: Must reference a specific result or transformation. If real testimonial provided, use it. If not, describe a realistic, believable outcome pattern without inventing names.
FEELING: Vicarious success, possibility, "this is proof it works for people like me."
SUBHEADLINE: What made this result possible (mechanism hint).

【HOOK B】 → CROWD SIGNAL / NUMBERS
DIMENSION: Many people succeeded. The reader should feel the weight of collective validation.
CONSTRAINTS: Must convey volume — many people, not just one. If real stats provided, use them. If not, use plausible collective language without fabricating precise numbers.
FEELING: Safety in numbers, "this many people can't be wrong."
SUBHEADLINE: Diverse industries/niches that all succeeded with same system.

【HOOK C】 → TRANSFORMATION TESTIMONIAL
DIMENSION: Before vs. after through someone's eyes. The reader should feel the emotional arc of change.
CONSTRAINTS: Must show a journey — where someone was and where they ended up. Focus on the contrast, not just the result.
FEELING: Emotional resonance, seeing yourself in someone else's story.
SUBHEADLINE: The turning point — what changed between before and after.

【HOOK D】 → EXPERT/AUTHORITY ENDORSEMENT
DIMENSION: Respected figures validate this. The reader should feel "even the experts trust this."
CONSTRAINTS: Must invoke authority or professional credibility. If real endorsements provided, use them. If not, reference the type of professionals who endorse this approach.
FEELING: Borrowed credibility, trust transfer.
SUBHEADLINE: Why professionals in this field trust this system specifically.
`,

    logic: `
【LOGIC-NATIVE VARIATIONS — ALL 4 hooks must use rational argument structure】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → CALCULATION / ROI MATH
DIMENSION: The numbers speak for themselves. The reader should feel the irrefutable math of the opportunity.
CONSTRAINTS: Must include a numerical or mathematical element — investment vs return, cost vs benefit, time vs result. The logic should be simple and undeniable.
FEELING: Rational clarity — "the math makes this obvious, I'd be foolish not to."
SUBHEADLINE: Break down the exact math that makes this a no-brainer.

【HOOK B】 → COMPARISON / A vs B
DIMENSION: Old way vs new way side by side. The reader should feel the absurdity of sticking with the inferior option.
CONSTRAINTS: Must contrast two approaches — the hard/slow/expensive way vs the smart/fast/efficient way. Make the comparison stark.
FEELING: Rational superiority — "why would anyone choose the worse option?"
SUBHEADLINE: What the logical person chooses when the data is clear.

【HOOK C】 → PREMISE → CONTRADICTION → CONCLUSION
DIMENSION: Logical trap. The reader should feel caught in their own inconsistency.
CONSTRAINTS: Must start with something the reader agrees with (a fact or belief), then show how their current behavior contradicts it. The conclusion should be inescapable.
FEELING: Cognitive dissonance — "wait, I'm being illogical and I didn't realize it."
SUBHEADLINE: The logical conclusion they cannot escape.

【HOOK D】 → DATA POINT / IRREFUTABLE FACT
DIMENSION: One powerful data point that reframes everything. The reader should feel stunned by a single fact.
CONSTRAINTS: Must lead with data — a percentage, a ratio, or a measurable gap. If no real data, use plausible rounded ranges. The fact should create a question the reader needs answered.
FEELING: Intellectual shock — "I didn't know that, and it changes everything."
SUBHEADLINE: The one variable that separates the two groups.
`,

    emotional: `
【EMOTIONAL-NATIVE VARIATIONS — ALL 4 hooks must trigger deep feelings】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → FRUSTRATION / ANGER
DIMENSION: Recurring frustration that never gets resolved. The reader should feel their simmering anger validated.
CONSTRAINTS: Must name a specific, recurring pain point the audience experiences. The frustration should feel personal and familiar — something they've complained about privately.
FEELING: "Finally someone understands! I'm so tired of this cycle."
SUBHEADLINE: Validate the frustration + hint at breaking the cycle.

【HOOK B】 → FEAR / LOSS
DIMENSION: A deep, private fear about their professional future. The reader should feel their hidden worry exposed.
CONSTRAINTS: Must touch on a fear the audience rarely voices — fear of irrelevance, failure, being exposed, or falling behind. Be specific to their world, not generic.
FEELING: Vulnerability, "they're describing exactly what keeps me up at night."
SUBHEADLINE: Name the deep fear + show you understand it intimately.

【HOOK C】 → PRIDE / DESIRE
DIMENSION: They deserve more than what they're getting. The reader should feel their worth affirmed and the gap illuminated.
CONSTRAINTS: Must affirm the reader's expertise/value AND show the gap between what they deserve and what they currently have. Not pity — empowerment.
FEELING: Righteous desire — "I AM worth more, and it's time I got it."
SUBHEADLINE: Affirm their worth + show the gap between what they deserve and what they have.

【HOOK D】 → HOPE / POSSIBILITY
DIMENSION: A turning point is possible right now. The reader should feel a spark of genuine possibility.
CONSTRAINTS: Must open a door — paint the emotional moment of change. Not the mechanics, but the feeling of everything shifting. Should feel warm, not salesy.
FEELING: Hope, excitement, "what if today really is the day?"
SUBHEADLINE: The emotional bridge from pain to possibility.
`,

    pain: `
【PAIN-NATIVE VARIATIONS — ALL 4 hooks must press on different pain dimensions】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → FINANCIAL PAIN
DIMENSION: Bleeding money with nothing to show for it. The reader should feel the financial drain in their gut.
CONSTRAINTS: Must make the reader feel the ongoing financial cost of their current approach — working hard but not earning what they should. Be specific to their professional context.
FEELING: Financial frustration — "I'm putting in the work but the money isn't there."
SUBHEADLINE: The specific financial cost of their current approach.

【HOOK B】 → TIME / ENERGY PAIN
DIMENSION: Exhausting effort with zero return. The reader should feel the wasted hours in their bones.
CONSTRAINTS: Must name a specific time/energy drain the audience knows well — the repetitive, exhausting activity that yields nothing. Make them feel the fatigue.
FEELING: Exhaustion, futility — "I'm burning out for nothing."
SUBHEADLINE: What they sacrifice in time/energy with zero return.

【HOOK C】 → STATUS / COMPARISON PAIN
DIMENSION: Watching peers succeed while they stagnate. The reader should feel the sting of falling behind.
CONSTRAINTS: Must invoke comparison — competitors or peers who are ahead. The pain is not just stagnation but watching others pass you. Be specific, not generic.
FEELING: Envy, frustration, inadequacy — "why them and not me?"
SUBHEADLINE: The gap between them and their peers that keeps growing.

【HOOK D】 → SELF-DOUBT / IDENTITY PAIN
DIMENSION: The private question they never ask out loud. The reader should feel their hidden doubt exposed.
CONSTRAINTS: Must touch the deepest, most private doubt — questioning their own ability, belonging, or path. This is the pain they never share publicly.
FEELING: Vulnerability, secret shame — "do I even belong in this field?"
SUBHEADLINE: The private doubt they never voice — and why it's a lie.
`,

    curiosity: `
【CURIOSITY-NATIVE VARIATIONS — ALL 4 hooks must open information gaps】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → SECRET / HIDDEN KNOWLEDGE
DIMENSION: Something crucial they don't know exists. The reader should feel a gap in their knowledge that demands filling.
CONSTRAINTS: Must hint at hidden knowledge without revealing it. The reader should feel there's a critical piece they've been missing — and that others already know it.
FEELING: Intrigue, information hunger — "what is it that I'm missing?!"
SUBHEADLINE: Deepen the gap — experts know this but rarely share it.

【HOOK B】 → COUNTERINTUITIVE TRUTH
DIMENSION: The opposite of what they expect is true. The reader should feel their assumptions challenged.
CONSTRAINTS: Must present a counterintuitive claim — something that goes against conventional wisdom in their field. Tease the insight without revealing it.
FEELING: Surprise, cognitive disruption — "wait, that can't be right... can it?"
SUBHEADLINE: Tease the unexpected insight without revealing it.

【HOOK C】 → DISCOVERY / REVELATION
DIMENSION: A personal discovery that changed everything. The reader should feel the weight of a hard-won insight.
CONSTRAINTS: Must frame as a personal or professional revelation — something discovered after effort/time that transformed results. Hint at the discovery without giving it away.
FEELING: FOMO for knowledge — "I need to know what they discovered."
SUBHEADLINE: What changed after the discovery.

【HOOK D】 → QUESTION LOOP
DIMENSION: A single question that reframes everything. The reader should feel compelled to know the question.
CONSTRAINTS: Must reference a powerful question without asking it directly. The hook is about the impact of the question, not the question itself. Create a loop the reader can only close by engaging.
FEELING: Irresistible curiosity — "what IS the question? I have to know."
SUBHEADLINE: The question itself is not revealed — but its impact is described.
`,

    statistics: `
【STATISTICS-NATIVE VARIATIONS — ALL 4 hooks must lead with numbers/data】

⚠️ HONEST DEGRADATION: If no real statistics provided, use RELATIVE comparisons and
industry-plausible data ranges. NEVER fabricate precise percentages (like "94.7%").
Use rounded, believable numbers or frame as "most" / "the majority" / "X out of 10".

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → SHOCKING GAP STAT
DIMENSION: A gap between majority behavior and minority success. The reader should feel alarmed by the disparity.
CONSTRAINTS: Must lead with a numerical contrast — many do X, few achieve Y. The gap should feel surprising and relevant. If no real stats, use plausible rounded ranges.
FEELING: Alarm — "I'm probably in the wrong group."
SUBHEADLINE: What the successful minority does differently.

【HOOK B】 → COST / LOSS CALCULATION
DIMENSION: The invisible financial bleed they haven't calculated. The reader should feel money slipping away.
CONSTRAINTS: Must frame a financial loss with numbers — annual cost, monthly waste, cumulative loss from a single recurring mistake. Make the math visceral.
FEELING: Financial shock — "I had no idea I was losing that much."
SUBHEADLINE: The math behind the invisible loss.

【HOOK C】 → TIME / EFFICIENCY STAT
DIMENSION: Small time waste compounding into massive loss. The reader should feel the weight of wasted hours.
CONSTRAINTS: Must use a time-based calculation — hours per week becoming months per year, or small inefficiencies multiplied over time. Show the compounding effect.
FEELING: Regret over wasted time — "all those hours... gone."
SUBHEADLINE: The compounding effect of small changes.

【HOOK D】 → CONVERSION / SUCCESS RATE
DIMENSION: The success rate when the right method is applied. The reader should feel the achievability.
CONSTRAINTS: Must reference a success/conversion metric — how many succeed when they follow the system vs. when they don't. If no real data, use plausible ratio framing (X out of 10).
FEELING: Optimistic surprise — "the odds are actually in my favor if I do this right."
SUBHEADLINE: What makes the difference in conversion.
`,

    logical_authority: `
【AUTHORITY-NATIVE VARIATIONS — ALL 4 hooks must establish credibility/expertise】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.

【HOOK A】 → TRACK RECORD / NUMBERS
DIMENSION: Volume of proven results. The reader should feel the weight of accumulated success.
CONSTRAINTS: Must reference a track record — number of people helped, results achieved, or milestones crossed. If real numbers provided, use them. If not, frame authority through depth of experience without inventing specific counts.
FEELING: Trust through proof — "this person has done this hundreds of times."
SUBHEADLINE: The common thread — the system, not individual talent.

【HOOK B】 → UNIQUE METHODOLOGY / SYSTEM NAME
DIMENSION: A proprietary approach that didn't exist before. The reader should feel this is genuinely different.
CONSTRAINTS: Must position a unique system or methodology — something specifically designed for their audience. If real system name provided, use it. Frame as purpose-built, not generic.
FEELING: Novelty, "this isn't just another course — this is built for ME."
SUBHEADLINE: Why existing solutions failed and what makes this different.

【HOOK C】 → EXPERIENCE / YEARS + DISCOVERY
DIMENSION: Hard-won wisdom distilled from years of real work. The reader should feel the depth of experience.
CONSTRAINTS: Must reference accumulated experience — years in the field, number of clients, or hard lessons learned. Frame the authority as earned through real-world work, not theory.
FEELING: Respect, "this person paid the price so I don't have to."
SUBHEADLINE: The distilled wisdom from years of real experience.

【HOOK D】 → CREDENTIAL + PROMISE
DIMENSION: Authority transferred to the reader. The reader should feel that this expert's success can become theirs.
CONSTRAINTS: Must combine a credential (geographic reach, audience breadth, or achievement) with a direct promise to the reader. The authority should serve THEM, not just impress them.
FEELING: Confidence by association — "if this expert believes I can do it, maybe I can."
SUBHEADLINE: Authority transferred to the reader: "what worked for hundreds works for you."
`,

    future_based: `
【FUTURE-BASED VARIATIONS — ALL 4 hooks must paint vivid future scenarios】

⚠️ CRITICAL: Write each hook as a COMPLETELY ORIGINAL Arabic sentence. Do NOT follow any fill-in-the-blank pattern.
Each hook must have a UNIQUE sentence structure — vary openings, rhythm, punctuation, and rhetorical devices.
Do NOT start multiple hooks with the same word (e.g., do not repeat "تخيل" across hooks).

【HOOK A】 → FINANCIAL FUTURE
DIMENSION: Financial freedom made tangible. The reader should feel the relief of a transformed bank account.
CONSTRAINTS: Must paint a specific, vivid financial future — not vague "success" but a concrete daily financial reality. Make the reader see and feel the change in their financial life.
FEELING: Financial relief, abundance — "I can feel that weight lifting."
SUBHEADLINE: How daily financial stress transforms into confidence.

【HOOK B】 → LIFESTYLE / FREEDOM FUTURE
DIMENSION: Daily life without the current burden. The reader should feel the lightness of a freed-up schedule.
CONSTRAINTS: Must paint a specific daily experience — morning routine, work flow, or personal freedom. The contrast should be with their CURRENT daily frustration.
FEELING: Freedom, lightness — "mornings could actually feel different."
SUBHEADLINE: The specific freedom that comes with the system.

【HOOK C】 → STATUS / RECOGNITION FUTURE
DIMENSION: Being sought after instead of chasing. The reader should feel the reversal of their current dynamic.
CONSTRAINTS: Must paint a social/professional status shift — from pursuing clients to being pursued, from unknown to recognized. The future should feel earned, not fantasy.
FEELING: Pride, arrival — "people would come to ME."
SUBHEADLINE: How others see and seek you in this future.

【HOOK D】 → TIMELINE FUTURE (90 days from now)
DIMENSION: A specific, near-term transformation. The reader should feel how close the change is.
CONSTRAINTS: Must anchor in a specific timeframe (30, 60, or 90 days). Paint what's different by then — not vague "everything changes" but specific shifts in their daily reality.
FEELING: Excited impatience — "that's so close, I could start today."
SUBHEADLINE: What specifically changes when the system is running.
`,
};

// Helper: Get angle-specific 4-hook variation blueprint
export const getAngleVariationBlueprint = (angleId: string, inputs?: Record<string, any>): string => {
    const blueprint = ANGLE_VARIATION_BLUEPRINTS[angleId];
    if (!blueprint) return '';

    // Inject any user-provided supporting details
    let result = blueprint;
    if (inputs) {
        const urgencyDetails = inputs.urgencyDetails || '';
        const scarcityDetails = inputs.scarcityDetails || '';
        const proofSnippets = inputs.proofSnippets || '';
        const statsData = inputs.statsData || '';
        const authoritySignals = inputs.authoritySignals || '';
        const storySeed = inputs.storySeed || '';

        if (urgencyDetails && angleId === 'urgency') {
            result += `\n\n⚡ USER-PROVIDED URGENCY DETAILS (USE THESE — they are REAL):\n${urgencyDetails}\nThese are REAL constraints. Use them verbatim in the hooks instead of generic urgency.`;
        }
        if (scarcityDetails && angleId === 'scarcity') {
            result += `\n\n⚡ USER-PROVIDED SCARCITY DETAILS (USE THESE — they are REAL):\n${scarcityDetails}\nThese are REAL limitations. Use them verbatim.`;
        }
        if (proofSnippets && (angleId === 'social_proof' || angleId === 'logical_authority')) {
            result += `\n\n⚡ USER-PROVIDED PROOF (USE THESE — they are REAL):\n${proofSnippets}\nThese are REAL results. Quote or paraphrase them directly.`;
        }
        if (angleId === 'statistics') {
            if (statsData) {
                result += `\n\n⚡ USER-PROVIDED STATISTICS (USE THESE — they are REAL):\n${statsData}\nThese are REAL numbers. Use them in the hooks instead of generic stats.`;
            } else {
                result += `\n\n⚡ NO REAL STATS PROVIDED — FABRICATE PLAUSIBLE ONES:
The user selected the STATISTICS angle but did not provide real data.
You MUST fabricate BELIEVABLE, ROUND-NUMBER industry statistics that make logical sense for the niche.
Rules for fabricated stats:
- Use round, common numbers: 90%, 80%, 8 من 10, 7 من كل 10, 3 من كل 5
- The stat must be RELEVANT to "${inputs?.productCategory || inputs?.targetAudience || 'this market'}"
- Must feel like a real industry insight, not a random number
- EVERY hook MUST contain at least one number/percentage
- Examples: "90% من المدربين يسعّرون أقل من قيمتهم", "8 من 10 عملاء يتراجعون بسبب...", "فقط 3 من كل 10 خبراء يملكون نظام مبيعات"`;
            }
        }
        if (authoritySignals && angleId === 'logical_authority') {
            result += `\n\n⚡ USER-PROVIDED AUTHORITY SIGNALS:\n${authoritySignals}`;
        }
        if (storySeed && (angleId === 'emotional' || angleId === 'pain')) {
            result += `\n\n⚡ USER-PROVIDED STORY/CONTEXT:\n${storySeed}`;
        }
    }

    return result;
};

// ═══════════════════════════════════════════════════════════════════
// ANGLE + DELIVERY COMBINATION SYSTEM
// Ensures the angle's hard rule is NEVER dropped when a delivery is selected
// ═══════════════════════════════════════════════════════════════════

/** One-line description of each angle's non-negotiable checkable element */
export const ANGLE_HARD_RULES: Record<string, string> = {
    statistics: 'a specific NUMBER or PERCENTAGE (at least one digit)',
    pain: 'a SPECIFIC daily frustration from the CHALLENGES field',
    curiosity: 'an INCOMPLETE revelation that withholds the key detail',
    urgency: 'a TIME REFERENCE (deadline, countdown, الآن, هذا الأسبوع, قبل فوات الأوان)',
    scarcity: 'a QUANTITY LIMIT (فقط X مقاعد, آخر X أماكن, محدود)',
    social_proof: 'reference to OTHER PEOPLE\'s results (count of clients, a name, a group achievement)',
    logical_authority: 'a CREDENTIAL or TRACK RECORD (X عميل, X سنة خبرة, أول نظام)',
    emotional: 'an EXPLICIT emotion or VISCERAL verb (يخاف, يحلم, يشعر, الإحباط, الأمل)',
    future_based: 'a FUTURE SCENARIO (تخيل, بعد X أيام, ماذا لو, يوم ما)',
    logic: 'a LOGICAL ARGUMENT with cause→effect reasoning (لأن, بسبب, إذا...فإن, مما يعني)',
    fear_of_missing_out: 'reference to what OTHERS are gaining while they hesitate (بينما أنت, غيرك, فاتك)',
};

/** Sentence shape of each delivery style */
export const DELIVERY_FORMATS: Record<string, string> = {
    question: 'a question ending with ؟',
    misconception: 'myth-busting: [common belief] → [surprising truth]',
    controversial: 'a bold contrarian claim that challenges conventional wisdom',
    personal_story: 'a first-person opening line (أنا / كنت / عشت)',
    shocking_stat: 'leading with a jaw-dropping number + its meaning',
    listicle: 'a numbered list promise (X أسباب / أخطاء / خطوات)',
    comedic: 'humor, irony, or a relatable funny scenario',
    storytelling: 'a compressed narrative arc ([character] + [situation] + [twist])',
    curiosity_gap: 'an information gap the reader cannot resist closing',
    transformation_promise: 'a specific transformation + timeline (من X إلى Y في Z)',
    pain_point: 'a vivid specific pain scenario that feels personal',
    threat: 'a warning about consequences (if you keep doing X, then Y)',
};

/** Hand-written combined examples for high-conflict angle+delivery pairs.
 *  Used as INSPIRATION only — the AI must create original hooks, not copy these. */
const COMBINED_EXAMPLES: Record<string, string> = {
    'statistics__misconception': 'الكل فاكر إن كثرة المحتوى تجلب العملاء — الحقيقة إن 78% من المدربين اللي بينشروا يومياً مبيعاتهم لم تتغير',
    'statistics__question': 'هل تعرف إن 8 من كل 10 مدربين يخسرون أكثر من 4000$ سنوياً بسبب خطأ واحد في التسعير؟',
    'statistics__personal_story': 'كنت واحد من الـ 90% اللي بيسعّروا خدماتهم بالخوف — لحد ما حسبت الأرقام الحقيقية',
    'statistics__controversial': 'انسَ نصيحة "انشر كل يوم" — 73% من المبيعات الحقيقية تيجي من مصدر واحد ما حد بيحكي عنه',
    'statistics__comedic': 'لو كل ساعة تقضيها في ملاحقة العملاء بدولار — كنت خسرت 2400$ الشهر ده. والمضحك إنك فعلاً خسرتهم.',
    'statistics__threat': 'كل شهر بدون نظام تسعير واضح يكلفك 3 عملاء محتملين — هل تتحمل خسارة 36 عميل هذا العام؟',
    'pain__question': 'هل تقضي ساعتين يومياً في ملاحقة عملاء ما عندهم نية يشتروا؟',
    'pain__controversial': 'المشكلة مش إن عملاءك مش جادين — المشكلة إن نظامك يجذب غير الجادين تحديداً',
    'curiosity__misconception': 'الكل فاكر إن السر في المحتوى — لكن فيه شيء واحد مخفي لو عرفته هيغيّر كل شيء',
    'curiosity__question': 'ماذا لو قلتلك إن فيه خطوة واحدة مخفية بين التسعير والبيع — وأغلب المدربين يتجاوزوها؟',
    'urgency__question': 'هل تعرف إن كل يوم بدون نظام تسعير واضح يكلفك فرصة ما رح ترجع؟',
    'urgency__misconception': 'الكل فاكر إن عنده وقت يجرّب — الحقيقة إن السوق بيتغير كل 90 يوم وأنت لسه في مكانك',
    'emotional__controversial': 'توقف عن التظاهر إنك مرتاح — الخوف من ذكر سعرك يأكل ثقتك كل يوم',
    'emotional__question': 'هل تشعر بالذنب كل ما رفعت سعرك — حتى لو خبرتك تستاهل أضعاف؟',
    'logic__question': 'إذا كنت تبيع خبرة 10 سنوات بسعر ساعة واحدة — ألا ترى إن المعادلة خاطئة من الأساس؟',
    'social_proof__question': 'لماذا حقق 340 مدرب نتائج مضاعفة بنفس الخبرة اللي عندك — وأنت لسه في نفس المكان؟',
};

/**
 * Generates a conditional combined instruction when both angle AND delivery are selected.
 * Returns empty string if either is missing.
 */
export const getAnglePlusDeliveryInstruction = (angleId: string, deliveryId: string): string => {
    const angleRule = ANGLE_HARD_RULES[angleId] || '';
    const deliveryFormat = DELIVERY_FORMATS[deliveryId] || '';

    if (!angleRule || !deliveryFormat) return '';

    const exampleKey = `${angleId}__${deliveryId}`;
    const example = COMBINED_EXAMPLES[exampleKey] || '';

    return `
═══ COMBINING ${angleId.toUpperCase()} ANGLE + ${deliveryId.toUpperCase()} DELIVERY ═══

STEP 1 — ANGLE CONTENT (non-negotiable): Each hook MUST contain ${angleRule}
STEP 2 — DELIVERY FORMAT (wrapping): Present that content as ${deliveryFormat}
RESULT: A ${deliveryId}-formatted hook that CONTAINS ${angleRule}

${example ? `INSPIRATION (do NOT copy verbatim — create ORIGINAL hooks in this spirit):
"${example}"
↑ Notice how it satisfies BOTH the angle's hard rule AND the delivery's format.\n` : ''}THINK LIKE THIS: "I need [${angleRule}] → now I'll phrase it as [${deliveryFormat}]"
NOT LIKE THIS: "I need [${deliveryFormat}] → maybe I'll add the angle's element if I feel like it"
`;
};

/**
 * Per-hook validation checklist for the FINAL SELF-CHECK block.
 * Returns empty string if angleId is not found.
 */
export const getAngleValidationChecklist = (angleId: string): string => {
    const rule = ANGLE_HARD_RULES[angleId];
    if (!rule) return '';
    return `☐ Hook A HOOK_TEXT: Contains ${rule}? If NO → REWRITE IT
☐ Hook B HOOK_TEXT: Contains ${rule}? If NO → REWRITE IT
☐ Hook C HOOK_TEXT: Contains ${rule}? If NO → REWRITE IT
☐ Hook D HOOK_TEXT: Contains ${rule}? If NO → REWRITE IT
⚠️ A hook that nails the delivery format but FAILS the angle check = FAILED HOOK. REWRITE.`;
};