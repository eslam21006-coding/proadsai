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
    transformation_promise: 'a specific transformation with a timeframe — a before-state, an after-state and how long it takes, arranged in a DIFFERENT sentence structure for each of the 4 hooks (question form / after-state first / timeframe first / imperative form) with no fixed word order',
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

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 23 — DIMENSION POOL (23.B anti-sameness)
// ═══════════════════════════════════════════════════════════════════════════
// Each angle now has a pool of 6–8 distinct "dimensions" the model can fill
// the 4 hooks from. The first 4 entries for each angle are the original
// Financial / Time / Status / Skill dimensions from the existing fixed-4
// blueprint (psychology + constraints copied VERBATIM — no rewrites).
// 2–4 new dimensions are added in the same voice and still satisfy the
// angle's ANGLE_HARD_RULES checkable element. The user's selected angle
// is never changed — only which dimensions fill its 4 hooks rotates.

export interface DimensionEntry {
    id: string;
    angleKey: string;
    label: string;
    psychology: string;
    constraints: string;
    feeling: string;
    arabicCue?: string;
}

const POOL_URGENCY: DimensionEntry[] = [
    {
        id: "urgency_deadline",
        angleKey: "urgency",
        label: "Deadline close",
        psychology: "Time running out. The reader should feel a ticking clock — that a specific window is closing.",
        constraints: "Must reference a time element (deadline, countdown, or the accumulating cost of each passing day). If real deadline provided, use it. If not, frame delay itself as the enemy.",
        feeling: "Urgency, racing heartbeat, \"I need to act NOW before it's too late.\"",
        arabicCue: "ينتهي، يغلق، قبل فوات الأوان",
    },
    {
        id: "urgency_price_increase",
        angleKey: "urgency",
        label: "Price increase / value loss",
        psychology: "Financial penalty for waiting. The reader should feel they are literally paying more by hesitating.",
        constraints: "Must tie inaction to a monetary or value cost. If real price info provided, use it. If not, frame the cost of delay in terms of lost revenue, wasted spend, or opportunity cost.",
        feeling: "Financial anxiety — \"every day I wait, I'm losing money.\"",
        arabicCue: "يرتفع السعر، تخسر، يدفع أكثر",
    },
    {
        id: "urgency_seats",
        angleKey: "urgency",
        label: "Seats / capacity limit",
        psychology: "Others are already moving. The reader should feel left behind while competitors act.",
        constraints: "Must include a social element — others taking action. If real seat info provided, use it. If not, frame competitors or peers as already ahead.",
        feeling: "FOMO, being overtaken, falling behind the wave.",
        arabicCue: "باقي مقاعد، تم حجز، ينضمون",
    },
    {
        id: "urgency_cost_of_inaction",
        angleKey: "urgency",
        label: "Cost of inaction / future regret",
        psychology: "Future self looking back with regret. The reader should feel the weight of a missed turning point.",
        constraints: "Must contrast two future paths — one where they act now, one where they don't. Paint the regret of inaction.",
        feeling: "Dread of stagnation, fear of looking back and realizing this was the moment.",
        arabicCue: "بعد سنة، ستندم، فات الأوان",
    },
    {
        id: "urgency_window",
        angleKey: "urgency",
        label: "Window of opportunity (seasonal / event-bound)",
        psychology: "A rare alignment of conditions that won't repeat. The reader should feel this exact moment will not come again soon.",
        constraints: "Must reference a time-bound trigger (season, event, market shift, conference). If no real trigger, frame the window as a rare structural alignment, not a fabricated deadline.",
        feeling: "Rare chance recognition, \"this is the moment the door opens — and it won't stay open long.\"",
        arabicCue: "هذا الموسم، هذه المرة، فرصة لا تتكرر",
    },
    {
        id: "urgency_competitive_clock",
        angleKey: "urgency",
        label: "Competitive countdown",
        psychology: "Someone else is closing the deal. The reader should feel they are losing ground second by second to a competitor.",
        constraints: "Must reference a competitor or peer taking the same step. If no real data, frame the competition as a structural race, not a fabricated seat count.",
        feeling: "Sting of falling behind, \"if I don't move now, they're gone.\"",
        arabicCue: "غيرك قرر، سبقوك، الفرصة تضيق",
    },
];

const POOL_SCARCITY: DimensionEntry[] = [
    {
        id: "scarcity_quantity",
        angleKey: "scarcity",
        label: "Quantity limit",
        psychology: "There are only so many spots. The reader should feel the door is closing because of limited supply.",
        constraints: "Must communicate a hard or structural limit on availability. If real limit info provided, use it. If not, justify the limit through quality/attention reasons.",
        feeling: "Exclusivity anxiety — \"if I don't grab this now, someone else will.\"",
        arabicCue: "مقاعد محدودة، آخر فرصة، فقط",
    },
    {
        id: "scarcity_access",
        angleKey: "scarcity",
        label: "Access restriction / gatekeeping",
        psychology: "Not everyone qualifies. The reader should feel this is selective, aspirational.",
        constraints: "Must imply a filter or selection process. Frame acceptance as earned, not guaranteed.",
        feeling: "Aspirational desire to be \"chosen,\" elite belonging.",
        arabicCue: "بطلب مسبق، بموافقة، نقبل الأفضل",
    },
    {
        id: "scarcity_cohort",
        angleKey: "scarcity",
        label: "Next cohort / wait time",
        psychology: "Miss this window, wait a long time. The reader should feel the pain of a delayed restart.",
        constraints: "Must reference timing — this round vs. the next. If real cohort info provided, use it. If not, frame the current window as rare.",
        feeling: "Now-or-never tension, fear of being stuck waiting.",
        arabicCue: "الدفعة القادمة بعد أشهر، لا تتكرر، نادراً",
    },
    {
        id: "scarcity_demand",
        angleKey: "scarcity",
        label: "Demand vs supply / social proof of scarcity",
        psychology: "Demand already exceeds supply. The reader should feel they are competing for a scarce resource.",
        constraints: "Must show that others want this too — high demand, limited space. Social proof of popularity combined with limitation.",
        feeling: "Competitive urgency — \"others are already ahead of me in line.\"",
        arabicCue: "الإقبال كبير، الأماكن تُحجز، الأكثرية تبحث",
    },
    {
        id: "scarcity_bonus_expiry",
        angleKey: "scarcity",
        label: "Bonus stack expiry",
        psychology: "Extras that come with the offer are about to disappear. The reader should feel an additional loss layered on top of the main scarcity.",
        constraints: "Must reference time-bound extras (bonuses, materials, sessions). If no real extras, frame the bundle as a structural gift that will not be added in the next round.",
        feeling: "Loss-on-top-of-loss, \"I'd be giving up more than the seat — I'd be giving up everything in the bundle.\"",
        arabicCue: "المكافآت ستُحذف، الإضافات مؤقتة، لن تتكرر",
    },
    {
        id: "scarcity_invite_only",
        angleKey: "scarcity",
        label: "Invite-only window",
        psychology: "Access is by invitation, not by application. The reader should feel the door opens for very few, and being invited means they are pre-selected.",
        constraints: "Must imply an invite/referral mechanism. If no real program, frame the channel as a structural gate (e.g., alumni-only referrals).",
        feeling: "Quiet pride, \"they chose to invite ME — I'd better respond before the invite expires.\"",
        arabicCue: "بالدعوة فقط، لأشخاص مختارين، قائمة مغلقة",
    },
];

const POOL_SOCIAL_PROOF: DimensionEntry[] = [
    {
        id: "social_proof_specific_result",
        angleKey: "social_proof",
        label: "Specific client result",
        psychology: "One person's concrete outcome. The reader should feel \"if they did it, I can too.\"",
        constraints: "Must reference a specific result or transformation. If real testimonial provided, use it. If not, describe a realistic, believable outcome pattern without inventing names.",
        feeling: "Vicarious success, possibility, \"this is proof it works for people like me.\"",
        arabicCue: "حقق، حصل على، نتيجة عميل",
    },
    {
        id: "social_proof_crowd",
        angleKey: "social_proof",
        label: "Crowd signal / numbers",
        psychology: "Many people succeeded. The reader should feel the weight of collective validation.",
        constraints: "Must convey volume — many people, not just one. If real stats provided, use them. If not, use plausible collective language without fabricating precise numbers.",
        feeling: "Safety in numbers, \"this many people can't be wrong.\"",
        arabicCue: "مئات، آلاف، أغلبهم، الأغلبية",
    },
    {
        id: "social_proof_transformation",
        angleKey: "social_proof",
        label: "Transformation testimonial",
        psychology: "Before vs. after through someone's eyes. The reader should feel the emotional arc of change.",
        constraints: "Must show a journey — where someone was and where they ended up. Focus on the contrast, not just the result.",
        feeling: "Emotional resonance, seeing yourself in someone else's story.",
        arabicCue: "كان، أصبح، من ... إلى",
    },
    {
        id: "social_proof_authority",
        angleKey: "social_proof",
        label: "Expert / authority endorsement",
        psychology: "Respected figures validate this. The reader should feel \"even the experts trust this.\"",
        constraints: "Must invoke authority or professional credibility. If real endorsements provided, use them. If not, reference the type of professionals who endorse this approach.",
        feeling: "Borrowed credibility, trust transfer.",
        arabicCue: "يوصي به، يعتمد عليه، يثق به",
    },
    {
        id: "social_proof_recurring",
        angleKey: "social_proof",
        label: "Recurring customer / repeat buyer signal",
        psychology: "People who tried it came back — or kept going. The reader should feel this isn't a one-off result, it's a pattern.",
        constraints: "Must reference repeat behaviour (renewals, second cohorts, long-term clients). If no real data, frame the recurring pattern structurally (e.g., ongoing enrollment).",
        feeling: "Sticky trust, \"people don't just try it once — they stay.\"",
        arabicCue: "يعودون، يجددون، يستمرون، يبقون",
    },
    {
        id: "social_proof_industry_total",
        angleKey: "social_proof",
        label: "Industry-aggregate numbers",
        psychology: "The numbers in the broader market validate this approach. The reader should feel the trend is bigger than any one testimonial.",
        constraints: "Must reference an aggregate (sector-wide count, market size, growth rate). If no real data, use plausible rounded ranges.",
        feeling: "Macro-level confidence, \"this is where the market is going.\"",
        arabicCue: "في السوق، في القطاع، في الصناعة",
    },
];

const POOL_LOGIC: DimensionEntry[] = [
    {
        id: "logic_roi",
        angleKey: "logic",
        label: "Calculation / ROI math",
        psychology: "The numbers speak for themselves. The reader should feel the irrefutable math of the opportunity.",
        constraints: "Must include a numerical or mathematical element — investment vs return, cost vs benefit, time vs result. The logic should be simple and undeniable.",
        feeling: "Rational clarity — \"the math makes this obvious, I'd be foolish not to.\"",
        arabicCue: "يعود عليك بـ، النتيجة =، كل دولار",
    },
    {
        id: "logic_comparison",
        angleKey: "logic",
        label: "Comparison / A vs B",
        psychology: "Old way vs new way side by side. The reader should feel the absurdity of sticking with the inferior option.",
        constraints: "Must contrast two approaches — the hard/slow/expensive way vs the smart/fast/efficient way. Make the comparison stark.",
        feeling: "Rational superiority — \"why would anyone choose the worse option?\"",
        arabicCue: "بدلاً من، عوضاً عن، بينما الطريقة القديمة",
    },
    {
        id: "logic_contradiction",
        angleKey: "logic",
        label: "Premise → contradiction → conclusion",
        psychology: "Logical trap. The reader should feel caught in their own inconsistency.",
        constraints: "Must start with something the reader agrees with (a fact or belief), then show how their current behavior contradicts it. The conclusion should be inescapable.",
        feeling: "Cognitive dissonance — \"wait, I'm being illogical and I didn't realize it.\"",
        arabicCue: "إذا كنت تؤمن بـ، لكنك تفعل، إذن",
    },
    {
        id: "logic_data_point",
        angleKey: "logic",
        label: "Data point / irrefutable fact",
        psychology: "One powerful data point that reframes everything. The reader should feel stunned by a single fact.",
        constraints: "Must lead with data — a percentage, a ratio, or a measurable gap. If no real data, use plausible rounded ranges. The fact should create a question the reader needs answered.",
        feeling: "Intellectual shock — \"I didn't know that, and it changes everything.\"",
        arabicCue: "الدراسات تظهر، الأرقام تثبت، بحث جديد",
    },
    {
        id: "logic_compound",
        angleKey: "logic",
        label: "Compound effect calculation",
        psychology: "A small daily difference, accumulated over time, becomes massive. The reader should feel the weight of compounding against them or for them.",
        constraints: "Must use a compounding or multiplication structure (small × time = large). If no real data, frame the inputs as plausible ranges and show the math step by step.",
        feeling: "Long-horizon clarity, \"this small thing, if I keep doing it, becomes huge.\"",
        arabicCue: "يومياً ×، مع الوقت، على مدى",
    },
    {
        id: "logic_elimination",
        angleKey: "logic",
        label: "Elimination reasoning",
        psychology: "Each alternative is ruled out, one by one, until only the recommended path remains. The reader should feel the process of elimination leaves no choice.",
        constraints: "Must walk through alternatives and dismiss each. If no real alternatives, frame them as the obvious options any rational person would first consider.",
        feeling: "Logical inevitability, \"there's literally no other path that fits.\"",
        arabicCue: "الخيار الوحيد، لا يوجد، الوحيد",
    },
];

const POOL_EMOTIONAL: DimensionEntry[] = [
    {
        id: "emotional_frustration",
        angleKey: "emotional",
        label: "Frustration / anger",
        psychology: "Recurring frustration that never gets resolved. The reader should feel their simmering anger validated.",
        constraints: "Must name a specific, recurring pain point the audience experiences. The frustration should feel personal and familiar — something they've complained about privately.",
        feeling: "\"Finally someone understands! I'm so tired of this cycle.\"",
        arabicCue: "إحباط، غضب، تعب، سأم",
    },
    {
        id: "emotional_fear",
        angleKey: "emotional",
        label: "Fear / loss",
        psychology: "A deep, private fear about their professional future. The reader should feel their hidden worry exposed.",
        constraints: "Must touch on a fear the audience rarely voices — fear of irrelevance, failure, being exposed, or falling behind. Be specific to their world, not generic.",
        feeling: "Vulnerability, \"they're describing exactly what keeps me up at night.\"",
        arabicCue: "يخاف، قلق، خوف من",
    },
    {
        id: "emotional_pride",
        angleKey: "emotional",
        label: "Pride / desire",
        psychology: "They deserve more than what they're getting. The reader should feel their worth affirmed and the gap illuminated.",
        constraints: "Must affirm the reader's expertise/value AND show the gap between what they deserve and what they currently have. Not pity — empowerment.",
        feeling: "Righteous desire — \"I AM worth more, and it's time I got it.\"",
        arabicCue: "تستحق، تستاهل، يستاهل خبرتك",
    },
    {
        id: "emotional_hope",
        angleKey: "emotional",
        label: "Hope / possibility",
        psychology: "A turning point is possible right now. The reader should feel a spark of genuine possibility.",
        constraints: "Must open a door — paint the emotional moment of change. Not the mechanics, but the feeling of everything shifting. Should feel warm, not salesy.",
        feeling: "Hope, excitement, \"what if today really is the day?\"",
        arabicCue: "أمل، ممكن، غداً أفضل",
    },
    {
        id: "emotional_belonging",
        angleKey: "emotional",
        label: "Belonging / identity",
        psychology: "The reader is not alone in this; there is a community of people like them moving in the same direction. The reader should feel recognized as part of a tribe.",
        constraints: "Must reference a community or shared identity (people like you, others on the same path). If no real community, frame it as a category the reader already belongs to.",
        feeling: "Warmth, \"people like me are doing this — and they want me in.\"",
        arabicCue: "لست وحدك، أنتم، مجتمعنا",
    },
    {
        id: "emotional_relief",
        angleKey: "emotional",
        label: "Relief / release",
        psychology: "The exhausting weight lifts. The reader should feel the exhale of a long-held tension finally letting go.",
        constraints: "Must reference a specific tension the audience carries daily and the moment it is set down. The pain is named, then released.",
        feeling: "Sigh of relief, \"I could actually put this down.\"",
        arabicCue: "ارتاح، يتنفس، يرتاح أخيراً",
    },
];

const POOL_PAIN: DimensionEntry[] = [
    {
        id: "pain_financial",
        angleKey: "pain",
        label: "Financial pain",
        psychology: "Bleeding money with nothing to show for it. The reader should feel the financial drain in their gut.",
        constraints: "Must make the reader feel the ongoing financial cost of their current approach — working hard but not earning what they should. Be specific to their professional context.",
        feeling: "Financial frustration — \"I'm putting in the work but the money isn't there.\"",
        arabicCue: "يخسر، ينزف، يدفع ولا يكسب",
    },
    {
        id: "pain_time",
        angleKey: "pain",
        label: "Time / energy pain",
        psychology: "Exhausting effort with zero return. The reader should feel the wasted hours in their bones.",
        constraints: "Must name a specific time/energy drain the audience knows well — the repetitive, exhausting activity that yields nothing. Make them feel the fatigue.",
        feeling: "Exhaustion, futility — \"I'm burning out for nothing.\"",
        arabicCue: "تعب، ساعات ضائعة، لا وقت",
    },
    {
        id: "pain_status",
        angleKey: "pain",
        label: "Status / comparison pain",
        psychology: "Watching peers succeed while they stagnate. The reader should feel the sting of falling behind.",
        constraints: "Must invoke comparison — competitors or peers who are ahead. The pain is not just stagnation but watching others pass you. Be specific, not generic.",
        feeling: "Envy, frustration, inadequacy — \"why them and not me?\"",
        arabicCue: "غيرك، سبقوك، ينجحون قبلك",
    },
    {
        id: "pain_identity",
        angleKey: "pain",
        label: "Self-doubt / identity pain",
        psychology: "The private question they never ask out loud. The reader should feel their hidden doubt exposed.",
        constraints: "Must touch the deepest, most private doubt — questioning their own ability, belonging, or path. This is the pain they never share publicly.",
        feeling: "Vulnerability, secret shame — \"do I even belong in this field?\"",
        arabicCue: "هل أنا مؤهل، أستحق، أصلح",
    },
    {
        id: "pain_family",
        angleKey: "pain",
        label: "Missed family / life moments",
        psychology: "Working hard but missing the moments that matter most. The reader should feel the cost paid in the relationships they cannot get back.",
        constraints: "Must reference a specific missed moment (dinner, weekend, child's event, sleep). The pain is real-world, not abstract.",
        feeling: "Quiet grief, \"I can't get these hours back.\"",
        arabicCue: "يفوتك، بعيد عن عائلتك، ما تحضر",
    },
    {
        id: "pain_decision_fatigue",
        angleKey: "pain",
        label: "Decision fatigue / overwhelm",
        psychology: "Too many small decisions, every day, with no system. The reader should feel the mental load of running on willpower alone.",
        constraints: "Must reference a specific moment of decision overload (morning inbox, endless options, no playbook). The pain is exhaustion, not lack of information.",
        feeling: "Mental fog, \"I can't keep deciding this on my own.\"",
        arabicCue: "قرارات كثيرة، إرهاق ذهني، تشتت",
    },
];

const POOL_CURIOSITY: DimensionEntry[] = [
    {
        id: "curiosity_secret",
        angleKey: "curiosity",
        label: "Secret / hidden knowledge",
        psychology: "Something crucial they don't know exists. The reader should feel a gap in their knowledge that demands filling.",
        constraints: "Must hint at hidden knowledge without revealing it. The reader should feel there's a critical piece they've been missing — and that others already know it.",
        feeling: "Intrigue, information hunger — \"what is it that I'm missing?!\"",
        arabicCue: "سر، مخفي، لا يعرفه أحد",
    },
    {
        id: "curiosity_counterintuitive",
        angleKey: "curiosity",
        label: "Counterintuitive truth",
        psychology: "The opposite of what they expect is true. The reader should feel their assumptions challenged.",
        constraints: "Must present a counterintuitive claim — something that goes against conventional wisdom in their field. Tease the insight without revealing it.",
        feeling: "Surprise, cognitive disruption — \"wait, that can't be right... can it?\"",
        arabicCue: "العكس مما تظن، لا أحد يقول لك",
    },
    {
        id: "curiosity_discovery",
        angleKey: "curiosity",
        label: "Discovery / revelation",
        psychology: "A personal discovery that changed everything. The reader should feel the weight of a hard-won insight.",
        constraints: "Must frame as a personal or professional revelation — something discovered after effort/time that transformed results. Hint at the discovery without giving it away.",
        feeling: "FOMO for knowledge — \"I need to know what they discovered.\"",
        arabicCue: "اكتشفت، بعد سنوات، توصلت إلى",
    },
    {
        id: "curiosity_question_loop",
        angleKey: "curiosity",
        label: "Question loop",
        psychology: "A single question that reframes everything. The reader should feel compelled to know the question.",
        constraints: "Must reference a powerful question without asking it directly. The hook is about the impact of the question, not the question itself. Create a loop the reader can only close by engaging.",
        feeling: "Irresistible curiosity — \"what IS the question? I have to know.\"",
        arabicCue: "السؤال الذي، ماذا لو عرفت",
    },
    {
        id: "curiosity_behind_scenes",
        angleKey: "curiosity",
        label: "Behind-the-scenes access",
        psychology: "A glimpse into how something is actually done — the parts most people never see. The reader should feel invited past the curtain.",
        constraints: "Must reference a process, ritual, or behind-the-scenes detail that is normally hidden. If no real process, frame it as the working method the expert uses daily.",
        feeling: "Insider thrill, \"I'm being let in on the actual method.\"",
        arabicCue: "خلف الكواليس، ما لا تراه، الطريقة الحقيقية",
    },
    {
        id: "curiosity_mistake_reveal",
        angleKey: "curiosity",
        label: "Common mistake reveal",
        psychology: "Most people are doing this one thing wrong, and once they see it, they cannot unsee it. The reader should feel the reveal will be a turning point.",
        constraints: "Must name a common but wrong practice in the audience's field, without fully explaining why it is wrong yet. The reveal must be in the body, not the hook.",
        feeling: "Anxious curiosity, \"oh no, am I doing this wrong too?\"",
        arabicCue: "الخطأ الذي، يفعله الجميع، لا تعرف أنك",
    },
];

const POOL_STATISTICS: DimensionEntry[] = [
    {
        id: "statistics_gap",
        angleKey: "statistics",
        label: "Shocking gap stat",
        psychology: "A gap between majority behavior and minority success. The reader should feel alarmed by the disparity.",
        constraints: "Must lead with a numerical contrast — many do X, few achieve Y. The gap should feel surprising and relevant. If no real stats, use plausible rounded ranges.",
        feeling: "Alarm — \"I'm probably in the wrong group.\"",
        arabicCue: "٪ فقط، من كل ١٠، أقلية",
    },
    {
        id: "statistics_cost",
        angleKey: "statistics",
        label: "Cost / loss calculation",
        psychology: "The invisible financial bleed they haven't calculated. The reader should feel money slipping away.",
        constraints: "Must frame a financial loss with numbers — annual cost, monthly waste, cumulative loss from a single recurring mistake. Make the math visceral.",
        feeling: "Financial shock — \"I had no idea I was losing that much.\"",
        arabicCue: "يخسر سنوياً، يكلف، يتراكم",
    },
    {
        id: "statistics_time",
        angleKey: "statistics",
        label: "Time / efficiency stat",
        psychology: "Small time waste compounding into massive loss. The reader should feel the weight of wasted hours.",
        constraints: "Must use a time-based calculation — hours per week becoming months per year, or small inefficiencies multiplied over time. Show the compounding effect.",
        feeling: "Regret over wasted time — \"all those hours... gone.\"",
        arabicCue: "ساعة يومياً، أسبوعياً ×، يضيع",
    },
    {
        id: "statistics_conversion",
        angleKey: "statistics",
        label: "Conversion / success rate",
        psychology: "The success rate when the right method is applied. The reader should feel the achievability.",
        constraints: "Must reference a success/conversion metric — how many succeed when they follow the system vs. when they don't. If no real data, use plausible ratio framing (X out of 10).",
        feeling: "Optimistic surprise — \"the odds are actually in my favor if I do this right.\"",
        arabicCue: "نسبة النجاح، من كل ١٠ ينجح",
    },
    {
        id: "statistics_ratio",
        angleKey: "statistics",
        label: "Ratio comparison",
        psychology: "A single ratio that reframes effort vs outcome. The reader should feel the math speaks for itself.",
        constraints: "Must lead with a ratio or ratio-style comparison (3:1, 1 in 4, double the rate). If no real ratio, use plausible rounded ranges.",
        feeling: "Numerical clarity, \"the ratio alone is enough to convince me.\"",
        arabicCue: "ضعف، ثلاثة أضعاف، مرة ونص",
    },
    {
        id: "statistics_percentile",
        angleKey: "statistics",
        label: "Percentile placement",
        psychology: "Where does the audience sit on the curve? The reader should feel the percentile point them at a clear path up or down.",
        constraints: "Must reference a percentile or relative position (top 10%, bottom quartile). If no real data, frame it as a plausible rounded range.",
        feeling: "Curiosity about placement, \"am I in the top group?\"",
        arabicCue: "أفضل ١٠٪، الربع الأدنى، ضمن",
    },
];

const POOL_LOGICAL_AUTHORITY: DimensionEntry[] = [
    {
        id: "authority_track_record",
        angleKey: "logical_authority",
        label: "Track record / numbers",
        psychology: "Volume of proven results. The reader should feel the weight of accumulated success.",
        constraints: "Must reference a track record — number of people helped, results achieved, or milestones crossed. If real numbers provided, use them. If not, frame authority through depth of experience without inventing specific counts.",
        feeling: "Trust through proof — \"this person has done this hundreds of times.\"",
        arabicCue: "ساعدت، حققت، مع",
    },
    {
        id: "authority_method",
        angleKey: "logical_authority",
        label: "Unique methodology / system name",
        psychology: "A proprietary approach that didn't exist before. The reader should feel this is genuinely different.",
        constraints: "Must position a unique system or methodology — something specifically designed for their audience. If real system name provided, use it. Frame as purpose-built, not generic.",
        feeling: "Novelty, \"this isn't just another course — this is built for ME.\"",
        arabicCue: "منهج، نظام، طريقة فريدة",
    },
    {
        id: "authority_experience",
        angleKey: "logical_authority",
        label: "Experience / years + discovery",
        psychology: "Hard-won wisdom distilled from years of real work. The reader should feel the depth of experience.",
        constraints: "Must reference accumulated experience — years in the field, number of clients, or hard lessons learned. Frame the authority as earned through real-world work, not theory.",
        feeling: "Respect, \"this person paid the price so I don't have to.\"",
        arabicCue: "بعد سنوات، خبرة، رحلة",
    },
    {
        id: "authority_credential_promise",
        angleKey: "logical_authority",
        label: "Credential + promise",
        psychology: "Authority transferred to the reader. The reader should feel that this expert's success can become theirs.",
        constraints: "Must combine a credential (geographic reach, audience breadth, or achievement) with a direct promise to the reader. The authority should serve THEM, not just impress them.",
        feeling: "Confidence by association — \"if this expert believes I can do it, maybe I can.\"",
        arabicCue: "معك، ينقل لك، خبرته لـ",
    },
    {
        id: "authority_first_in_market",
        angleKey: "logical_authority",
        label: "First-in-market claim",
        psychology: "Nobody else in the market has built this. The reader should feel they're looking at the originator, not a copy.",
        constraints: "Must claim a structural first (first to publish, first to apply method X to niche Y, first to combine A and B). Frame the claim with specificity, not generic \"leader\" language.",
        feeling: "Originator trust, \"if anyone has the answer, it's the person who started it.\"",
        arabicCue: "الأول، الأوائل، بدأنا",
    },
    {
        id: "authority_published",
        angleKey: "logical_authority",
        label: "Published work / featured in",
        psychology: "Recognition by third parties (publications, stages, podcasts) compounds the authority. The reader should feel the expert has been validated externally.",
        constraints: "Must reference external recognition (publication, podcast, stage, award). If no real recognition, frame it as a category (e.g., \"regularly invited to...\") with structural credibility.",
        feeling: "Vouched-for authority, \"they've been put in front of audiences that vet.\"",
        arabicCue: "نُشر، ضيف، مُحكَّم",
    },
];

const POOL_FUTURE_BASED: DimensionEntry[] = [
    {
        id: "future_financial",
        angleKey: "future_based",
        label: "Financial future",
        psychology: "Financial freedom made tangible. The reader should feel the relief of a transformed bank account.",
        constraints: "Must paint a specific, vivid financial future — not vague \"success\" but a concrete daily financial reality. Make the reader see and feel the change in their financial life.",
        feeling: "Financial relief, abundance — \"I can feel that weight lifting.\"",
        arabicCue: "دخل، راتب، حرية مالية",
    },
    {
        id: "future_lifestyle",
        angleKey: "future_based",
        label: "Lifestyle / freedom future",
        psychology: "Daily life without the current burden. The reader should feel the lightness of a freed-up schedule.",
        constraints: "Must paint a specific daily experience — morning routine, work flow, or personal freedom. The contrast should be with their CURRENT daily frustration.",
        feeling: "Freedom, lightness — \"mornings could actually feel different.\"",
        arabicCue: "صباحك، وقتك، حياتك",
    },
    {
        id: "future_status",
        angleKey: "future_based",
        label: "Status / recognition future",
        psychology: "Being sought after instead of chasing. The reader should feel the reversal of their current dynamic.",
        constraints: "Must paint a social/professional status shift — from pursuing clients to being pursued, from unknown to recognized. The future should feel earned, not fantasy.",
        feeling: "Pride, arrival — \"people would come to ME.\"",
        arabicCue: "يأتون إليك، يطلبونك، معروف",
    },
    {
        id: "future_timeline",
        angleKey: "future_based",
        label: "Timeline future (90 days from now)",
        psychology: "A specific, near-term transformation. The reader should feel how close the change is.",
        constraints: "Must anchor in a specific timeframe (30, 60, or 90 days). Paint what's different by then — not vague \"everything changes\" but specific shifts in their daily reality.",
        feeling: "Excited impatience — \"that's so close, I could start today.\"",
        arabicCue: "بعد ٩٠ يوم، خلال شهرين، بعد",
    },
    {
        id: "future_identity",
        angleKey: "future_based",
        label: "Identity / who you'll be",
        psychology: "A future self that they can see, recognize, and step into. The reader should feel the person they will become.",
        constraints: "Must describe a specific identity (the expert, the sought-after one, the calm one). The description is in the second person, present tense, as if it's already real.",
        feeling: "Becoming, \"that's who I am now.\"",
        arabicCue: "أنت الذي، تصبح، ستكون",
    },
    {
        id: "future_legacy",
        angleKey: "future_based",
        label: "Legacy / impact future",
        psychology: "The future of people the audience touches (clients, family, community) shifts because the audience changed. The reader should feel the impact goes beyond themselves.",
        constraints: "Must reference a downstream effect (clients they will help, family they will be more present for, work that outlives them). Avoid self-aggrandizing framing; the impact is for others.",
        feeling: "Purpose, \"this matters beyond me.\"",
        arabicCue: "أثر، بصمة، من حولك",
    },
];

export const ANGLE_DIMENSION_POOLS: Record<string, readonly DimensionEntry[]> = {
    urgency: POOL_URGENCY,
    scarcity: POOL_SCARCITY,
    social_proof: POOL_SOCIAL_PROOF,
    logic: POOL_LOGIC,
    emotional: POOL_EMOTIONAL,
    pain: POOL_PAIN,
    curiosity: POOL_CURIOSITY,
    statistics: POOL_STATISTICS,
    logical_authority: POOL_LOGICAL_AUTHORITY,
    future_based: POOL_FUTURE_BASED,
    fear_of_missing_out: POOL_SCARCITY,
};

// ─── PHASE 23 — OPENING STRUCTURES (7 forms) ────────────────────────────────
// These are the 7 existing hook opening forms, promoted from soft prompt
// guidance at generators.ts:2284-2291 into a rotatable exported set so the
// model can be told WHICH 4 openings to use per project (rotation across
// projects, not just within a single set).

export interface OpeningStructure {
    id: "percentage" | "question" | "imperative" | "ratio" | "conditional" | "direct_address" | "time_reference";
    template: string;
}

export const OPENING_STRUCTURES: readonly OpeningStructure[] = [
    {
        id: "percentage",
        template: "[percentage] + [audience] + [consequence]",
    },
    {
        id: "question",
        template: "[question word] + [specific loss or pain]",
    },
    {
        id: "imperative",
        template: "[imperative verb] + [action to stop/start]",
    },
    {
        id: "ratio",
        template: "[ratio] + [surprising fact]",
    },
    {
        id: "conditional",
        template: "[conditional \"لو/إذا\"] + [relatable scenario]",
    },
    {
        id: "direct_address",
        template: "[direct address \"أنت\"] + [identity challenge]",
    },
    {
        id: "time_reference",
        template: "[time reference] + [cost of delay]",
    },
];

// ═══════════════════════════════════════════════════════════════════════════
// PURE ROTATION HELPERS — used by 23.B and 23.C
// ═══════════════════════════════════════════════════════════════════════════

// Small, dependency-free string hash. Deterministic across runs.
// Phase 23 (CodeRabbit): exported so copyDiversity.ts can reuse the
// same FNV-1a implementation (was duplicated verbatim before).
export function stringHash32(s: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

// Mulberry32 PRNG — fast, deterministic, plenty of quality for shuffle.
function makeRng(seed: number): () => number {
    let s = seed >>> 0;
    return function rng() {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Stable, in-place Fisher–Yates on a copy of the input array.
function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

/**
 * Draw `n` distinct dimensions from the locked angle's pool.
 * Deterministic for a fixed (angleKey, n, seed, memory) tuple.
 * Bias-never-ban: if all options are recent, the least-recently-used
 * items are returned so the pool never starves.
 */
export function drawDimensions(
    angleKey: string,
    n: number,
    seed: number,
    memory: readonly { dimensionIds?: readonly string[] }[] = [],
): DimensionEntry[] {
    const pool = ANGLE_DIMENSION_POOLS[angleKey] || [];
    if (pool.length === 0) return [];
    if (n <= 0) return [];

    const target = Math.min(n, pool.length);
    const flatRecent = memory.flatMap(m => m.dimensionIds || []);
    const recencyScore = new Map<string, number>();
    for (let i = 0; i < flatRecent.length; i++) {
        recencyScore.set(flatRecent[i]!, i + 1); // oldest = 1, most recent = length
    }
    const rng = makeRng(stringHash32(`${angleKey}|${seed}`));
    // Weighted sampling (Gumbel-max / exponential trick): each item gets
    // a key = -log(rng()) / weight. Non-recent items (weight ≈ 1) draw
    // small keys and sort first. Recent items (weight < 1) draw large keys
    // and sort later — i.e. are down-weighted without being banned. The
    // SET varies per seed because each item's key is a function of the
    // per-seed RNG; bias only steers which items are preferred.
    const weighted = pool.map((item) => {
        const r = recencyScore.get(item.id) || 0;
        const weight = 1 / (1 + r); // r=0 → w=1; r=length → w ≈ 0
        const u = Math.max(rng(), 1e-12);
        const key = -Math.log(u) / weight;
        return { item, key };
    });
    weighted.sort((a, b) => a.key - b.key);
    const drawn = shuffled(
        weighted.slice(0, target).map((w) => w.item),
        rng,
    );

    // ─── T024 — Invariant guard: angle lock (HARD) ──────────────────────
    // The user's selected angle is NEVER changed. Every drawn dimension
    // must belong to the locked angle's pool. If a drift is detected
    // (it should be impossible given the pool-scoped draw), we log and
    // drop the offending entry — the user's angle stays locked.
    const safeDrawn: DimensionEntry[] = [];
    for (const d of drawn) {
        if (d.angleKey === angleKey) {
            safeDrawn.push(d);
        } else {
            console.error(
                `[drawDimensions] ANGLE LOCK VIOLATION: dimension "${d.id}" (angleKey="${d.angleKey}") was drawn for angleKey="${angleKey}". Dropping.`,
            );
        }
    }
    if (safeDrawn.length === 0 && target > 0 && pool.length > 0) {
        // Defensive fallback: return the first `target` pool entries so
        // the generation never starves. The user's angle stays locked.
        return pool.slice(0, target);
    }
    return safeDrawn;
}

/**
 * Rotate which of the 7 opening structures the 4 hooks use.
 * Deterministic for (n, seed, memory). Always returns `n` distinct ids
 * drawn from the 7-form pool.
 */
export function drawOpenings(
    n: number,
    seed: number,
    memory: readonly { openingIds?: readonly string[]; openingId?: string }[] = [],
): OpeningStructure[] {
    const target = Math.min(Math.max(n, 0), OPENING_STRUCTURES.length);
    if (target === 0) return [];
    const flatRecent: string[] = [];
    for (const m of memory) {
        if (Array.isArray(m.openingIds)) flatRecent.push(...m.openingIds);
        if (typeof m.openingId === "string" && m.openingId) flatRecent.push(m.openingId);
    }
    const recencyScore = new Map<string, number>();
    for (let i = 0; i < flatRecent.length; i++) {
        recencyScore.set(flatRecent[i]!, i + 1);
    }
    const rng = makeRng(stringHash32(`openings|${seed}`));
    // Same Gumbel-max weighted-sampling as drawDimensions (see that fn
    // for the math). Biases recent ids down without ever banning them;
    // the SET varies per seed because each item's key is RNG-derived.
    const weighted = OPENING_STRUCTURES.map((item) => {
        const r = recencyScore.get(item.id) || 0;
        const weight = 1 / (1 + r);
        const u = Math.max(rng(), 1e-12);
        const key = -Math.log(u) / weight;
        return { item, key };
    });
    weighted.sort((a, b) => a.key - b.key);
    return shuffled(
        weighted.slice(0, target).map((w) => w.item),
        rng,
    );
}

// Re-export the fingerprint shape from creativeMemory so call-sites that
// already import the dimension helpers can also declare fingerprints in
// the same import line.
export type { AngleFingerprint } from "../creativeMemory.js";

// ─── Phase 23 — Rotated blueprint (23.B integration helper) ────────────────
//
// Wraps getAngleVariationBlueprint with the rotation layer. If no drawn
// dimensions or openings are supplied, the original 4-fixed-script
// blueprint is returned unchanged (so legacy callers stay identical).
// When rotations are supplied, the prompt text is rebuilt to reference
// ONLY the drawn dimensions and openings, and the four hook slots (A/B/C/D)
// are filled from the rotated subset. The user's selected angle is
// never changed — only which dimensions fill its 4 hooks rotates.

export interface RotatedBlueprintOptions {
    drawnDimensions?: readonly DimensionEntry[];
    drawnOpenings?: readonly OpeningStructure[];
    recentFingerprintDimensionIds?: readonly string[];
    recentFingerprintOpeningIds?: readonly string[];
    memoryBiasApplied?: boolean;
}

export function getAngleVariationBlueprintRotated(
    angleId: string,
    inputs?: Record<string, any>,
    options: RotatedBlueprintOptions = {},
): string {
    const base = getAngleVariationBlueprint(angleId, inputs);
    const dims = options.drawnDimensions;
    const openings = options.drawnOpenings;
    if (!dims || dims.length === 0) {
        return base;
    }

    const header = `【${angleId.toUpperCase()} — ROTATED DIMENSION FILL — same locked angle, rotated dimension set】
This is project-to-project anti-sameness. The user's angle is unchanged.
The 4 dimensions below were drawn (deterministic seed) from the angle's
6–8 dimension pool. Use the four labeled dimensions to fill Hooks A→D
IN THIS ORDER. The opening structures (when provided) are SOFT GUIDANCE —
the model may adapt if the angle hard-rule forces a different shape.`;

    const dimsBlock = dims.map((d, i) => {
        const slot = String.fromCharCode(65 + i); // A, B, C, D
        return `【HOOK ${slot}】 → ${d.label.toUpperCase()}
DIMENSION: ${d.psychology}
CONSTRAINTS: ${d.constraints}
FEELING: ${d.feeling}
${d.arabicCue ? `ARABIC CUE: ${d.arabicCue}` : ""}`;
    }).join("\n\n");

    const openingsBlock = openings && openings.length > 0
        ? `\nOPENING STRUCTURES (rotate which 4 the hooks use; pick 4 of 7 from below):\n` +
          openings.map((o, i) => `  ${i + 1}. ${o.id} — ${o.template}`).join("\n")
        : "";

    const metaLine = `\n[Phase 23 rotation metadata: drawn=${dims.length}/${
        (ANGLE_DIMENSION_POOLS[angleId] || []).length
    } from pool${
        options.memoryBiasApplied ? " (memory-biased)" : ""
    }${
        (options.recentFingerprintDimensionIds?.length || 0) > 0
            ? `, recents=${options.recentFingerprintDimensionIds!.length}`
            : ""
    }]`;

    return `${header}\n\n${dimsBlock}${openingsBlock}\n\n${base}${metaLine}`;
}