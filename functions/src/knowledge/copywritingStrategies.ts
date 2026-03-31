// src/knowledge/copywritingStrategies.ts
// Deep copywriting strategy frameworks — psychological structures for hooks and captions
// These control the ARGUMENT STRUCTURE, not the angle or delivery style

export interface CopywritingStrategyKnowledge {
    promptInstruction: string;
    hookStructure: string;
    captionStructure: string;
    examplesAr: string[];
    schwartzLevel: string;
    bestForOfferTypes: string[];
    visualHint?: string;
}

export const COPYWRITING_STRATEGY_KNOWLEDGE: Record<string, CopywritingStrategyKnowledge> = {

    pattern_interrupt: {
        promptInstruction: `PATTERN INTERRUPT STRATEGY — Break their scroll autopilot.
The opening SHOULD violate their expectations. Say something they've NEVER seen in an ad.
Use: contradictions, absurd comparisons, breaking the 4th wall, unexpected honesty.
The goal is to make them STOP and think "Wait, what?" — then pull them into the message.
This is NOT shock value — it's strategic disruption that leads to the product.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Pattern-breaking statement (contradiction, absurd truth, or unexpected confession)
Line 2: The twist that connects it to their real problem
Line 3: Bridge to "and here's why this matters for you"`,
        captionStructure: `Para 1: The pattern interrupt (2 sentences max — disrupt and hook)
Para 2: "Now that I have your attention..." — reveal the real insight
Para 3: Connect the disruption to their specific pain
Para 4: Present the solution as the logical conclusion
Para 5: CTA that maintains the unexpected energy`,
        examplesAr: [
            'أسوأ نصيحة تسويقية سمعتها؟ "انشر محتوى كل يوم." وأنا صدّقتها 3 سنين.',
            'لا تقرأ هذا الإعلان. جدياً. إلا إذا كنت مستعد تسمع شيء ما حد بيقوله.',
            'أنا أكره الكورسات الأونلاين. وعشان كده صممت شيء مختلف تماماً.',
        ],
        schwartzLevel: 'Level 1-2 (Unaware → Problem-Aware). Best for cold audiences who scroll past typical ads.',
        bestForOfferTypes: ['Free Webinar', 'Free Guide', 'Challenge'],
        visualHint: 'PATTERN INTERRUPT VISUAL: Use an unexpected composition — unusual camera angle, jarring color contrast, hero in an unexpected pose or context. The visual itself should make the viewer pause their scroll. Avoid standard "hero standing in nice room" — make it visually surprising.',
    },

    beginner_awareness: {
        promptInstruction: `BEGINNER AWARENESS STRATEGY — They don't even know they have a problem yet.
The prospect is at Schwartz Level 1 (Completely Unaware). They're not searching for solutions.
Your job: EDUCATE before you sell. Name a problem they didn't know existed.
Structure: reveal a hidden cost/risk → quantify it → show the escape path.
Never assume they know industry jargon or have tried other solutions.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Name a hidden problem they don't realize they have (shocking revelation)
Line 2: Quantify the cost of not knowing ("this costs you X every month")
Line 3: Tease that there's a way out — "and most people never discover it"`,
        captionStructure: `Para 1: Reveal the hidden problem with a specific scenario they recognize
Para 2: Explain WHY they didn't notice (it's normalized, everyone does it)
Para 3: Quantify what it's costing them (money, time, opportunity)
Para 4: Introduce the concept (not the product yet) — the IDEA of a solution
Para 5: Now introduce your product as the embodiment of that concept
Para 6: Gentle CTA — "discover" or "learn" language, not "buy"`,
        examplesAr: [
            'كل شهر تخسر 4,200 دولار بدون ما تحس. كيف؟ لأنك تبيع وقتك مش نتائجك.',
            'هل تعرف إن 90% من المدربين يعملون 3x الجهد مقابل ثلث النتيجة؟ والسبب أبسط مما تتخيل.',
            'فيه فرق بين "عندي بيزنس" و"عندي نظام". أغلب الناس عندهم الأول بس.',
        ],
        schwartzLevel: 'Level 1 (Completely Unaware). They don\'t know they have a problem.',
        bestForOfferTypes: ['Free Guide', 'Free Webinar', 'Mini-Course'],
    },

    problem_awareness: {
        promptInstruction: `PROBLEM AWARENESS STRATEGY — They feel the pain but don't know solutions exist.
Schwartz Level 2. They KNOW something is wrong but haven't searched for fixes.
Your job: AGITATE the problem until it becomes unbearable, then introduce the category of solution.
Don't sell your product yet — sell the IDEA that a solution exists.
Use PAS (Problem → Agitate → Solve) structure.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Name their exact pain with vivid specificity
Line 2: Agitate — show it's getting worse, not better
Line 3: Plant the seed — "what if there was a system for this?"`,
        captionStructure: `Para 1: Name the problem so specifically they feel called out
Para 2: Agitate — show the cascading consequences they haven't considered
Para 3: "The worst part? You've been told this is normal." — challenge the status quo
Para 4: Introduce the category of solution (systems, frameworks, methods)
Para 5: Position your product as THE version of that solution
Para 6: CTA with urgency tied to the pain continuing`,
        examplesAr: [
            'تشتغل 12 ساعة يومياً وآخر الشهر الرقم نفسه. المشكلة مش في اجتهادك.',
            'كل ما زاد محتواك... قلّ وقتك ولم تزد أرباحك. ألم يحن الوقت لتسأل لماذا؟',
            'عملاؤك يساومونك على السعر لأنهم يرونك "خيار" مش "الخيار الوحيد".',
        ],
        schwartzLevel: 'Level 2 (Problem-Aware). They feel the pain but think it\'s unsolvable.',
        bestForOfferTypes: ['Direct Sale', 'Mini-Course', 'Challenge'],
    },

    solution_awareness: {
        promptInstruction: `SOLUTION AWARENESS STRATEGY — They know solutions exist but haven't picked one.
Schwartz Level 3. They've seen competitors. They know courses/coaches exist.
Your job: Differentiate. Show why YOUR mechanism is different from everything else.
Don't prove the problem exists — prove YOUR APPROACH is unique.
Use "mechanism" selling: name your proprietary method and show why it works differently.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Acknowledge they've seen other solutions ("you've tried X, Y, Z...")
Line 2: Name what ALL those solutions miss — the gap
Line 3: Introduce YOUR unique mechanism that fills that gap`,
        captionStructure: `Para 1: Acknowledge their research — "you've probably seen dozens of coaches/courses"
Para 2: Name the pattern they all share (and why it fails)
Para 3: Reveal the ONE thing that's different about your approach (the mechanism)
Para 4: Explain the mechanism in simple terms — WHY it works
Para 5: Proof that the mechanism delivers (case study, stat)
Para 6: CTA — "see the mechanism in action"`,
        examplesAr: [
            'جربت كورسات التسويق. جربت المحتوى اليومي. جربت الإعلانات. لكن ما حد قالك عن النظام.',
            'الفرق بين المدرب العادي والمدرب اللي يكسب 10,000$/شهر؟ مش الخبرة. النظام.',
            'كل البرامج تعلمك "كيف تسوّق". إحنا نبني لك ماكينة تسوّق وأنت نايم.',
        ],
        schwartzLevel: 'Level 3 (Solution-Aware). They know solutions exist, evaluating options.',
        bestForOfferTypes: ['Mini-Course', 'Direct Sale', 'Paid Workshop'],
    },

    product_awareness: {
        promptInstruction: `PRODUCT AWARENESS STRATEGY — They know YOUR product but haven't bought.
Schwartz Level 4. They've seen your sales page, maybe attended a webinar.
Your job: REMOVE the final objection. They don't need more info — they need a PUSH.
Use social proof, guarantee, urgency, or risk reversal.
This is the closest to retargeting but for cold audiences who've been exposed organically.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Reference the product by name — assume they know it
Line 2: Address the #1 reason people hesitate (price, time, trust)
Line 3: Remove that objection with proof or guarantee`,
        captionStructure: `Para 1: "You've seen [product]. You're thinking about it." — call it out
Para 2: Address the hesitation directly — name their exact objection
Para 3: Counter with undeniable proof (testimonial, guarantee, or logic)
Para 4: Stack value — remind them what they get
Para 5: Risk reversal — "if it doesn't work, you get X"
Para 6: Urgent CTA — "this is your moment to decide"`,
        examplesAr: [
            'شفت كود السيادة وما قررت. السبب؟ على الأغلب واحد من 3 أشياء...',
            'لسا مترددد؟ 340 مدرب عربي قرروا قبلك. ومتوسط نتائجهم: 10,000$ في 90 يوم.',
            'الضمان: لو ما حققت نتائج في 30 يوم، ترجع فلوسك. بدون أسئلة.',
        ],
        schwartzLevel: 'Level 4 (Product-Aware). They know you, need the final push.',
        bestForOfferTypes: ['Direct Sale', 'SaaS Trial', 'Paid Workshop'],
    },

    authority_builder: {
        promptInstruction: `AUTHORITY BUILDER STRATEGY — Establish unquestionable expertise before selling.
The entire hook/caption exists to prove YOU are THE authority on this topic.
Stack credentials: years, client count, results, media mentions, methodology names.
Don't be humble — be factual. Authority is STATED, then PROVEN.
The sale happens BECAUSE they trust you, not because of features.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: Lead with a credential/number ("After X years / X clients...")
Line 2: State the unique insight you've earned ("I discovered...")
Line 3: Promise to share it with them`,
        captionStructure: `Para 1: Authority statement — credentials, years, clients served
Para 2: The unique insight that only experience teaches
Para 3: Why this matters for THEM specifically
Para 4: Mini proof — one specific client result
Para 5: "This is what I teach inside [product]"
Para 6: CTA leveraging the authority — "learn from the source"`,
        examplesAr: [
            'بعد 7 سنوات و500 عميل في السوق العربي — اكتشفت النظام الوحيد اللي يشتغل.',
            'أول مدرب عربي يبني نظام تسعير يتخطى حاجز 10,000$ شهرياً. والآن أشاركك الطريقة.',
            'ساعدت 340 متخصص عربي يتحولوا من "مقدم خدمة" إلى "مرجع في مجالهم".',
        ],
        schwartzLevel: 'Level 3-4 (Solution/Product-Aware). They need to trust YOU specifically.',
        bestForOfferTypes: ['Direct Sale', 'Paid Workshop', 'Membership'],
    },

    myth_busting: {
        promptInstruction: `MYTH BUSTING STRATEGY — Demolish a widely-held belief, then present the truth.
Find the ONE thing their industry BELIEVES that is actually wrong.
Structure: State the myth → Show why everyone believes it → Destroy it with evidence → Present the truth → Your product embodies the truth.
The myth should be something the READER currently believes.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: State the myth as fact — "Everyone says X..."
Line 2: The dramatic reveal — "They're wrong. Here's proof."
Line 3: The truth that changes everything`,
        captionStructure: `Para 1: State the myth clearly — make the reader nod "yes, I believe that"
Para 2: Explain why everyone believes it (it's logical on the surface)
Para 3: Drop the counter-evidence (stat, case study, logic)
Para 4: Present the REAL truth — the paradigm shift
Para 5: Show how your product is built on the truth, not the myth
Para 6: CTA — "see the truth in action"`,
        examplesAr: [
            '"أنت محتاج محتوى أكتر" — أكبر كذبة في عالم التدريب الأونلاين.',
            'الكل يقولك "ارفع أسعارك". المشكلة مش في السعر. المشكلة في القيمة المُدركة.',
            '"المتابعين = مبيعات" — لو هذا صحيح، كان كل إنفلونسر مليونير.',
        ],
        schwartzLevel: 'Level 2-3 (Problem/Solution-Aware). Reframes their understanding.',
        bestForOfferTypes: ['Free Guide', 'Free Webinar', 'Mini-Course'],
        visualHint: 'MYTH BUSTING VISUAL: Include a visual "crossed out" or "broken" element representing the myth. A shattered object, red X over a common belief, or a split showing "what people think" vs "reality". The hero should look like they are revealing a truth — pointing, presenting, or breaking through a barrier.',
    },

    soft_story_sell: {
        promptInstruction: `SOFT STORY SELL STRATEGY — Personal narrative that leads naturally to the product.
Tell a genuine story that mirrors the reader's situation.
Structure: "I was where you are" → "Something happened" → "I found the answer" → "Now I share it."
The product mention should feel like a natural part of the story, not a pitch.
Vulnerability is the weapon — they buy because they RELATE, not because you persuade.
This strategy sets the TONE — it never overrides the angle's content rule or the delivery's format.`,
        hookStructure: `Line 1: "X years/months ago, I was exactly where you are..."
Line 2: The specific painful moment (vivid, sensory detail)
Line 3: "Then everything changed when..." — the cliff hanger`,
        captionStructure: `Para 1: Set the scene — your specific "before" moment (be vivid and vulnerable)
Para 2: The struggle deepens — what you tried and failed
Para 3: The turning point — what you discovered/realized
Para 4: The transformation — specific results after
Para 5: "I built [product] so you don't have to go through what I did"
Para 6: Soft CTA — invitation, not command`,
        examplesAr: [
            'قبل سنتين كنت بشتغل 14 ساعة يومياً. أطفالي ما يشوفوني. ودخلي لا يتعدى 2,000$.',
            'أول عميل رفض يدفع سعري الجديد. ثاني عميل رفض. الثالث قال "ليش رخيص كده؟"',
            'اليوم اللي بكيت فيه من الضغط كان نفس اليوم اللي قررت فيه أبني نظام.',
        ],
        schwartzLevel: 'Level 1-3 (Any cold audience). Stories work at every awareness level.',
        bestForOfferTypes: ['Challenge', 'Membership', 'Direct Sale'],
    },
};

// Helper to get prompt instructions for a given strategy
export const getCopywritingStrategyPrompt = (strategyId: string): string => {
    const knowledge = COPYWRITING_STRATEGY_KNOWLEDGE[strategyId];
    if (!knowledge) return '';
    return `
COPYWRITING STRATEGY: ${strategyId.toUpperCase().replace(/_/g, ' ')}
${knowledge.promptInstruction}

HOOK STRUCTURE:
${knowledge.hookStructure}

CAPTION STRUCTURE:
${knowledge.captionStructure}

SCHWARTZ AWARENESS: ${knowledge.schwartzLevel}
EXAMPLES (Arabic): ${knowledge.examplesAr.map(e => `"${e}"`).join(' | ')}`;
};

// Helper for caption-specific strategy
export const getCopywritingStrategyCaptionStructure = (strategyId: string): string => {
    const knowledge = COPYWRITING_STRATEGY_KNOWLEDGE[strategyId];
    if (!knowledge) return '';
    return `CAPTION ARGUMENT STRUCTURE (${strategyId.replace(/_/g, ' ').toUpperCase()}):
${knowledge.captionStructure}`;
};

export const getCopywritingStrategyVisualHint = (strategyId: string): string => {
    return COPYWRITING_STRATEGY_KNOWLEDGE[strategyId]?.visualHint || '';
};