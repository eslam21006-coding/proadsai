// src/knowledge/adTonesKnowledge.ts
// Deep tone calibration for each ad tone option
// Controls word choice, sentence structure, emotional register, and visual mood

export interface AdToneKnowledge {
    promptInstruction: string;        // Main tone calibration for copy
    vocabularyGuide: string;           // Specific word choices
    sentenceStructure: string;         // How sentences should be built
    forbiddenPatterns: string[];       // What to avoid in this tone
    visualMood: string;                // For generateConcepts — scene mood
    captionCalibration: string;        // Specific caption tone rules
    examplesAr: string[];              // Arabic examples
}

export const AD_TONE_KNOWLEDGE: Record<string, AdToneKnowledge> = {

    formal: {
        promptInstruction: `FORMAL TONE — Professional, polished, corporate Arabic.
Write as if addressing a boardroom of executives.
Use complete sentences with proper grammar. No contractions, no slang.
Project competence, trustworthiness, and institutional credibility.
The reader should feel they are dealing with a serious, established entity.`,
        vocabularyGuide: 'Use: نظام، استراتيجية، منهجية، مؤسسي، احترافي. Avoid: يا، كده، عشان.',
        sentenceStructure: 'Longer, well-structured sentences. Use subordinate clauses. Proper connectors (حيث أن، نظراً لـ، من خلال).',
        forbiddenPatterns: ['Slang or dialect', 'Exclamation marks overuse', 'Emojis in copy', 'Casual contractions'],
        visualMood: 'Corporate, clean, prestigious. Dark suits, glass offices, skyline views. Minimal decorative elements. The hero exudes institutional authority.',
        captionCalibration: 'Write as a professional consultant addressing a peer. No hype, no exclamation marks. Every claim backed by logic. Close with a dignified CTA.',
        examplesAr: [
            'نقدم لكم منهجية مُثبتة لتحويل الخبرات إلى أنظمة ربحية مستدامة',
            'تم تصميم هذا البرنامج استناداً إلى خبرة تمتد لسبع سنوات في السوق العربي',
        ],
    },

    funny: {
        promptInstruction: `FUNNY TONE — Witty, sarcastic, playful. Make them laugh then sell.
Use humor that is RELATABLE to their professional struggles.
The humor should make them lower their guard, not feel mocked.
Sarcasm about SITUATIONS is good. Sarcasm about PEOPLE is bad.
After the laugh, the pivot to the product should feel natural and smooth.`,
        vocabularyGuide: 'Use casual but smart language. Wordplay encouraged. Pop culture references OK. Light sarcasm.',
        sentenceStructure: 'Short, punchy sentences. Unexpected twists. Setup → punchline structure. Conversational flow.',
        forbiddenPatterns: ['Making fun of the reader', 'Offensive humor', 'Slapstick/childish', 'Humor that undermines credibility'],
        visualMood: 'Light, warm, approachable. The hero looks relaxed, maybe with a slight smirk. Bright colors, casual setting. Coffee shops, casual offices.',
        captionCalibration: 'Open with something funny and relatable. Use humor for the first 40%, then smoothly transition to the value prop. End with a witty CTA.',
        examplesAr: [
            'بتصرف على نتفلكس أكثر من ما بتصرف على مستقبلك... وبعدين بتقول "ليه ما في نتايج"',
            'لو كل بوست نشرته تحول لعميل... كنت بقيت أغنى من بيزوس',
        ],
    },

    inspiring: {
        promptInstruction: `INSPIRING TONE — Motivational, uplifting, "you can achieve this" energy.
Write as if you are a mentor who BELIEVES in them more than they believe in themselves.
Use aspirational language. Paint possibility. Make them feel capable and deserving.
Not cheesy motivation posters — genuine, earned inspiration backed by substance.`,
        vocabularyGuide: 'Use: تستحق، قادر، ممكن، مستقبلك، حلمك، بداية جديدة. Power verbs: ابدأ، حقق، ارتقِ، تخطى.',
        sentenceStructure: 'Medium-length sentences with building momentum. Crescendo structure — each sentence more powerful than the last.',
        forbiddenPatterns: ['Empty motivation without substance', 'Cliché quotes', 'Toxic positivity', 'Ignoring real challenges'],
        visualMood: 'Dramatic, uplifting lighting. Golden hour, sunrise tones. The hero looks forward with determination. Expansive environments — mountains, horizons, open skies.',
        captionCalibration: 'Start by acknowledging their struggle (you earn the right to inspire). Then build upward. Show the path. Make them feel the transformation is within reach.',
        examplesAr: [
            'خبرتك تستحق أن تصل للعالم — وهناك من ينتظرها الآن',
            'كل خطوة بدأت بقرار واحد شجاع — هذا هو قرارك',
        ],
    },

    emotional: {
        promptInstruction: `EMOTIONAL TONE — Heart-pulling, empathy-driven, touches feelings directly.
Write as if you can feel exactly what they feel right now.
Name emotions they have not named themselves. Make them feel SEEN and UNDERSTOOD.
Use vulnerability. Share in their struggle before offering hope.
The emotional arc: pain → empathy → hope → action.`,
        vocabularyGuide: 'Use feeling words: تعب، قلق، أمل، خوف، فخر، حلم، ألم، راحة. Sensory language.',
        sentenceStructure: 'Varied rhythm. Short sentences for impact. Longer sentences for building emotion. Use "..." for pauses.',
        forbiddenPatterns: ['Manipulation', 'Exploiting trauma', 'Being preachy', 'Dismissing their feelings'],
        visualMood: 'Warm, intimate lighting. Soft focus. Close-up framing. The hero shows genuine emotion — contemplation, determination through vulnerability. Muted color palette with one warm accent.',
        captionCalibration: 'Open by naming the EXACT emotional state they are in. Use "أنت" in every sentence. Spend 50% on empathy, 30% on the turning point, 20% on hope + CTA.',
        examplesAr: [
            'أنت تعرف ذلك الشعور... لما تشتغل بكل قلبك وما حد يقدّر',
            'كل يوم تقول "بكرة هبدأ"... وبكرة بتيجي ومعاها نفس الخوف',
        ],
    },

    authority: {
        promptInstruction: `AUTHORITY TONE — Commanding, expert-level, "I know what I'm talking about" energy.
Write as the DEFINITIVE expert on this topic. Not arrogant — confident.
Use declarative statements. State facts, not opinions. Give commands, not suggestions.
The reader should think "This person clearly knows more than me. I should listen."`,
        vocabularyGuide: 'Use definitive language: الحقيقة، النظام المُثبت، بناءً على خبرة، الطريقة الوحيدة. No hedging (ممكن، يمكن، ربما).',
        sentenceStructure: 'Short, declarative sentences. "This is how it works." Commands: "افعل X." No questions — statements only.',
        forbiddenPatterns: ['Hedging language (maybe, possibly)', 'Asking permission', 'Self-doubt', 'Over-explaining (experts state, not explain)'],
        visualMood: 'Dark, prestigious, powerful. The hero in a power pose — standing tall, direct eye contact. Dark backgrounds with dramatic lighting. Premium everything.',
        captionCalibration: 'Open with a bold declaration. No warm-up. State the truth, back it with credentials, give a command. End with a non-negotiable CTA.',
        examplesAr: [
            'بعد 7 سنوات و500 عميل — أقولها بثقة: الطريقة الوحيدة هي النظام',
            'توقف عن التخمين. ابدأ بالنظام المُثبت. النتائج مضمونة.',
        ],
    },

    friendly: {
        promptInstruction: `FRIENDLY TONE — Warm, conversational, like a trusted friend giving advice.
Write as if talking to a good friend over coffee.
Use "we" and "together." Be supportive, not pushy.
Acknowledge that change is hard. Offer to walk alongside them.
The reader should feel safe, supported, and encouraged.`,
        vocabularyGuide: 'Use: معاك، سوا، خطوة بخطوة، لا تقلق، ببساطة. Warm connectors: يعني، وبعدين، وتعرف إيه.',
        sentenceStructure: 'Conversational flow. Questions and answers. "You know what? Here is the thing..." Natural pauses.',
        forbiddenPatterns: ['Pressure tactics', 'Aggressive urgency', 'Corporate language', 'Making them feel stupid'],
        visualMood: 'Warm, welcoming. Casual but professional. Coffee shop or home office vibes. The hero has an open, approachable expression. Bright, natural lighting.',
        captionCalibration: 'Open like a conversation: "بصراحة..." or "تعرف إيه اللي كنت بفكر فيه..." Be genuine. Share, don\'t sell. End with a gentle invitation, not a command.',
        examplesAr: [
            'بصراحة... النظام ده مش معقد. وأنا هبقى معاك خطوة بخطوة',
            'مش محتاج تكون خبير تسويق. محتاج بس حد يوريك الطريق — وأنا هنا',
        ],
    },

    bold: {
        promptInstruction: `BOLD TONE — Unapologetic, direct, no-BS. Zero fluff.
Say what others won't. Be blunt about the problem and the solution.
No softening, no "maybe", no hedging. State facts like punches.
The reader should think "Finally someone who tells it like it is."`,
        vocabularyGuide: 'Use: الحقيقة، بصراحة، كفى، توقف، النتيجة. Short declarative sentences. No filler words.',
        sentenceStructure: 'Ultra-short sentences. One idea per sentence. Full stops, not commas. Blunt transitions.',
        forbiddenPatterns: ['Hedging (maybe, possibly, might)', 'Soft openers', 'Excessive politeness', 'Long explanations'],
        visualMood: 'High contrast, dark backgrounds. Bold typography. The hero has a confident, almost confrontational stance. Minimal decoration — let the message hit hard.',
        captionCalibration: 'Open with a blunt truth. No warm-up. Each sentence is a standalone punch. End with a non-negotiable command CTA.',
        examplesAr: [
            'الحقيقة؟ طريقتك الحالية لا تعمل. وأنت تعرف ذلك.',
            'توقف عن التبرير. ابدأ بالنظام. النتائج أو لا شيء.',
        ],
    },

    data_driven: {
        promptInstruction: `DATA-DRIVEN TONE — Numbers first. Every claim backed by data.
Lead with statistics, percentages, ROI calculations, and benchmarks.
The reader should feel they're making a RATIONAL, calculated decision.
No emotional appeals — pure logic and evidence.`,
        vocabularyGuide: 'Use: %, أرقام, عائد, معدل, متوسط, بيانات, نتائج مثبتة. Specific numbers always.',
        sentenceStructure: 'Claim + number + source pattern. "X% of Y achieved Z in N days." Data → implication → action.',
        forbiddenPatterns: ['Vague claims without numbers', 'Emotional language', 'Hype words', 'Unquantified promises'],
        visualMood: 'Clean, analytical. Charts, graphs, or data elements as design accents. Modern, tech-forward. The hero looks calculated and strategic.',
        captionCalibration: 'Open with a shocking stat. Build a data-driven argument. Every paragraph has at least one number. Close with a calculated CTA showing ROI.',
        examplesAr: [
            '73% من المدربين العرب يسعّرون خدماتهم أقل من قيمتها بـ 4 أضعاف. هل أنت منهم؟',
            'متوسط العائد: 10x في 90 يوم. التكلفة: أقل من وجبة عشاء أسبوعياً.',
        ],
    },

    mentor: {
        promptInstruction: `MENTOR TONE — Wise guide who's been where they are.
Write as someone who walked the exact same path and found the way.
Share earned wisdom, not theoretical knowledge.
The reader should feel "This person understands my journey."`,
        vocabularyGuide: 'Use: تعلمت، اكتشفت، بعد سنوات، الطريق، الخطأ الذي ارتكبته، لو أعرف وقتها. Reflective language.',
        sentenceStructure: 'Story → lesson → application pattern. "I used to... then I discovered... now you can..."',
        forbiddenPatterns: ['Preaching', 'Condescension', 'Claiming perfection', 'Ignoring their current struggle'],
        visualMood: 'Warm but authoritative. The hero looks reflective and experienced. Soft golden lighting. Books, notebooks, or wisdom symbols in the scene.',
        captionCalibration: 'Open with a personal realization: "After X years, I learned one thing..." Share the lesson. Bridge to their situation. Offer guidance, not a sales pitch.',
        examplesAr: [
            'بعد 5 سنوات من التجربة والخطأ، اكتشفت شيء واحد غيّر كل شيء',
            'لو أقدر أرجع بالزمن، هذا أول شيء كنت هسويه بشكل مختلف',
        ],
    },

    soft: {
        promptInstruction: `SOFT TONE — Gentle, non-pushy, zero pressure.
Write as if whispering good advice to someone who's been burned before.
Acknowledge that they've been pressured and manipulated by other marketers.
Make them feel SAFE. No urgency, no scarcity, no countdown.`,
        vocabularyGuide: 'Use: عندما تكون جاهز، بدون ضغط، خذ وقتك، بكل هدوء، لا التزام. Gentle connectors.',
        sentenceStructure: 'Long, flowing sentences. Gentle rhythm. Questions not commands. "What if..." not "You must..."',
        forbiddenPatterns: ['Urgency (now, today, limited)', 'Scarcity (only X left)', 'Pressure tactics', 'Aggressive CTAs'],
        visualMood: 'Soft, muted colors. Gentle lighting. The hero has a calm, peaceful expression. Nature elements, open spaces, breathing room.',
        captionCalibration: 'Open by acknowledging overwhelm. Give space. Present the option without pressure. Close with "whenever you are ready" energy.',
        examplesAr: [
            'مش محتاج تقرر اليوم. بس لما تحس إنك جاهز... الباب مفتوح',
            'أعرف إنك تعبت من الوعود. مش هقولك "اشترِ الآن". هقولك: اقرأ وقرر بنفسك',
        ],
    },

    luxury_ceo: {
        promptInstruction: `LUXURY CEO TONE — Premium, exclusive, above the noise.
Write as if the reader is being invited to an exclusive club.
Everything feels elevated, curated, and high-end.
The product is not "affordable" — it's an INVESTMENT for the elite.`,
        vocabularyGuide: 'Use: حصري، النخبة، استثمار، مميز، مختار، راقي. Never use "cheap", "free", "discount".',
        sentenceStructure: 'Elegant, measured sentences. Understated power. Let quality speak. Less is more.',
        forbiddenPatterns: ['Discounts or deals', 'Mass market language', 'Hype or excitement', 'Casual/slang'],
        visualMood: 'Dark luxury. Black, gold, deep navy. Premium materials. The hero in a powerful setting — penthouse, private office, first class. Everything whispers wealth.',
        captionCalibration: 'Open with an exclusive positioning statement. Describe who this is FOR (not everyone). Present as a curated experience. Close with an invitation, not a sell.',
        examplesAr: [
            'هذا البرنامج ليس للجميع. صُمم خصيصاً لمن يرفض أن يكون خياراً عادياً',
            'الاستثمار في نفسك ليس رفاهية — هو القرار الذي يفصل النخبة عن البقية',
        ],
    },
};
export const getAdTonePrompt = (toneId: string): string => {
    const knowledge = AD_TONE_KNOWLEDGE[toneId];
    if (!knowledge) return '';
    return `
${knowledge.promptInstruction}

VOCABULARY: ${knowledge.vocabularyGuide}
SENTENCE STRUCTURE: ${knowledge.sentenceStructure}
FORBIDDEN: ${knowledge.forbiddenPatterns.join(', ')}`;
};

// Helper to get visual mood for concepts
export const getAdToneVisualMood = (toneId: string): string => {
    return AD_TONE_KNOWLEDGE[toneId]?.visualMood || '';
};

// Helper to get caption calibration
export const getAdToneCaptionCalibration = (toneId: string): string => {
    return AD_TONE_KNOWLEDGE[toneId]?.captionCalibration || '';
};