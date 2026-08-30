// src/knowledge/hookTypesKnowledge.ts
// Deep copywriting knowledge for each hook delivery style
// These control HOW the hook is delivered, not WHAT angle it takes

export interface HookTypeKnowledge {
  promptInstruction: string;
  structureFormula: string;
  examplesAr: string[];
  captionStyle: string;
  carouselRecommended: boolean;
  visualDirection: string;
}

export const HOOK_TYPE_KNOWLEDGE: Record<string, HookTypeKnowledge> = {

  comedic: {
    promptInstruction: `COMEDIC DELIVERY — Use humor to disarm, then sell.
The hook should make them LAUGH or SMILE before they realize it is an ad.
Use: irony, self-deprecating humor, absurd comparisons, or relatable funny situations.
The humor must be RELEVANT to their pain — not random jokes.
After the laugh, the pivot to the product should feel natural.`,
    structureFormula: '[Funny observation about their situation] → [Punchline that reveals the product/solution]',
    examplesAr: [
      'بتصرف على القهوة أكثر من ما بتصرف على مستقبلك... وبعدين بتسأل ليه مفيش نتايج',
      'لو كل ساعة قضيتها على السوشيال ميديا تحولت لعميل... كنت بقيت مليونير',
      'أنا مش بقولك إن طريقتك غلط... بس محفظتك بتقول كده',
    ],
    captionStyle: 'Open with a funny relatable scenario. Use short, punchy sentences. The humor should build. Pivot to product naturally — "والحل أبسط مما تتخيل..."',
    carouselRecommended: false,
    visualDirection: 'Bright, warm, approachable scene. Hero with a smile or amused expression. Lighthearted props or absurd visual elements. Saturated, fun colors. The mood should feel like a friend sharing a joke.',
  },

  controversial: {
    promptInstruction: `CONTROVERSIAL DELIVERY — Challenge a common belief head-on.
The hook must make a BOLD CONTRARIAN CLAIM that stops the scroll.
Attack a widely-held assumption in their industry.
The reader should think "Wait, WHAT?" and need to read more.
Be provocative but not offensive. Challenge ideas, not people.`,
    structureFormula: '[Everyone believes X] + [But actually Y] + [Here is why]',
    examplesAr: [
      'المحتوى المجاني بيقتل بيزنسك — وأنت مش واخد بالك',
      'التسويق بالمحتوى خدعة — المدربين الناجحين يعملون شيء مختلف تماماً',
      'كل ما زاد عدد متابعينك... كل ما قلت أرباحك',
    ],
    captionStyle: 'Open with the controversial claim (bold, short). Then systematically dismantle the old belief with evidence. Present the new paradigm. CTA as the bridge to the new way.',
    carouselRecommended: true,
    visualDirection: 'Edgy, bold, high-contrast composition. Dark background with one strong accent color. Hero with a confident, challenging expression — arms crossed or leaning forward. Sharp lighting, dramatic shadows. The mood should feel like a wake-up call.',
  },

  personal_story: {
    promptInstruction: `PERSONAL STORY DELIVERY — "I was exactly where you are..."
The hook must open with a FIRST-PERSON narrative that mirrors the reader's situation.
Structure: [I was struggling with X] → [I discovered Y] → [Now I am Z].
The story must feel RAW and AUTHENTIC — not polished and corporate.
Use specific details: dates, numbers, emotions, turning points.`,
    structureFormula: '"كنت في مكانك بالضبط..." → [Specific struggle] → [Discovery moment] → [Current success]',
    examplesAr: [
      'قبل سنتين كنت بشتغل 14 ساعة يومياً مقابل 2000 دولار شهرياً',
      'أول ما بدأت... صفر عملاء، صفر نظام، وحسابي البنكي بيقول "حاول مرة تانية"',
      'اليوم اللي قررت فيه أوقف بيع وقتي — كل حاجة اتغيرت',
    ],
    captionStyle: 'Tell the full story arc: struggle → discovery → transformation. Use "أنا" (I) in the first half, then pivot to "أنت" (you) in the second half: "وأنت ممكن تعمل نفس الشيء."',
    carouselRecommended: true,
    visualDirection: 'Intimate, warm, reflective scene. Soft golden lighting. Hero in a natural, candid pose — not staged. Shallow depth of field. The mood should feel personal and authentic, like a 1-on-1 conversation.',
  },

  curiosity_gap: {
    promptInstruction: `CURIOSITY GAP DELIVERY — Create an information vacuum they MUST fill.
The hook must present INCOMPLETE INFORMATION that the reader cannot ignore.
Structure: [Hint at something surprising] + [Withhold the key detail] + [Promise the reveal].
The gap must be genuinely interesting — not clickbait that disappoints.`,
    structureFormula: '[Surprising partial info] + "..." + [Promise of revelation]',
    examplesAr: [
      'اكتشفت شيء غريب عن العملاء اللي بيدفعوا أكثر...',
      'فيه سبب واحد — بس واحد — بيخلي المدرب يفشل في التسعير العالي',
      'لما فهمت هذا السر... ضاعفت دخلي 4 مرات في 3 أشهر',
    ],
    captionStyle: 'Open with the gap. Build curiosity across 3-4 sentences. Give a PARTIAL reveal (enough to prove value). Full answer requires clicking/buying.',
    carouselRecommended: true,
    visualDirection: 'Mysterious, intriguing composition. Partial reveals — hero partially in shadow or with elements obscured. Deep depth of field creating visual layers. One element that draws the eye but raises questions. The viewer should feel compelled to look closer.',
  },

  storytelling: {
    promptInstruction: `STORYTELLING DELIVERY — Narrative arc that pulls them through.
The hook is the OPENING SCENE of a story. It must set up conflict and create forward momentum.
Best for carousels where each slide advances the narrative.
Use: setting, character, conflict, tension. Make them NEED to know what happens next.`,
    structureFormula: '[Scene setting] → [Character in conflict] → [Cliffhanger]',
    examplesAr: [
      'الساعة 2 الفجر... واحد قاعد قدام اللاب توب... الرسالة كانت: "عفواً، حسابك في السالب"',
      'يوم 15 من الشهر... ومحمد لسا ما حقق ربع الهدف',
      'كل أصدقائه قالوا: "مستحيل تنجح بهذا السعر." بعد 6 أشهر...',
    ],
    captionStyle: 'Full narrative arc in the caption. Setting → conflict → darkest moment → turning point → resolution → CTA. Make it feel like a mini movie.',
    carouselRecommended: true,
    visualDirection: 'Cinematic, narrative-driven scene. Rich environmental storytelling — the setting tells part of the story. Hero captured mid-action or mid-journey. Wide or medium shot to show context. Film-like color grading with depth.',
  },

  shocking_stat: {
    promptInstruction: `SHOCKING STATISTIC DELIVERY — Lead with a number that stops the scroll.
The hook must open with a SPECIFIC, JAW-DROPPING STATISTIC.
The stat should reframe their entire situation.
If using a real stat, cite the implication. If constructing one, make it believable and relevant.
⚠️ DO NOT COPY the example numbers below — invent your OWN statistics relevant to the user's niche.`,
    structureFormula: '[Shocking number/percentage] + [What it means for YOU specifically]',
    examplesAr: [
      '(STRUCTURAL REFERENCE ONLY — do not copy) percentage + audience + undervaluation pattern',
      '(STRUCTURAL REFERENCE ONLY — do not copy) dollar loss + timeframe + root cause',
      '(STRUCTURAL REFERENCE ONLY — do not copy) ratio + conversion gap + real diagnosis',
    ],
    captionStyle: 'Open with the stat (big, bold). Explain what it means. Show them they are part of the losing group. Then reveal what the winning group does differently.',
    carouselRecommended: false,
    visualDirection: 'Data-driven, bold composition. Large numbers or statistics can appear as design elements floating in the scene. Clean, modern, authoritative look. High-contrast typography. The hero looks like they have insider knowledge.',
  },

  question: {
    promptInstruction: `QUESTION DELIVERY — Ask something that makes them say "yes, that's me!"
The hook must be a QUESTION that the reader answers YES to internally.
The question must be so specific to their situation that they feel called out.
Best questions: rhetorical, diagnostic, or challenging.`,
    structureFormula: '"هل [specific situation they recognize]?" or "متى آخر مرة [something they do]?"',
    examplesAr: [
      'هل سئمت من بناء محتوى كل يوم بدون ما يتحول لعملاء؟',
      'متى آخر مرة رفعت أسعارك بثقة؟',
      'لو سألتك: كم يكلفك كل يوم تأخير؟ — هل تعرف الإجابة؟',
    ],
    captionStyle: 'Open with the question. Let it sit. Then answer it for them. Build the case for why the answer means they need to act now.',
    carouselRecommended: false,
    visualDirection: 'Direct eye contact with camera. Hero with an inquisitive or knowing expression. Clean, uncluttered background that keeps focus on the face and the question text. The composition should make the viewer feel personally addressed.',
  },

  listicle: {
    promptInstruction: `LISTICLE DELIVERY — Promise a specific number of items.
The hook must include a NUMBER: "3 أسباب" / "5 أخطاء" / "7 خطوات".
The number creates a contract with the reader — they know what to expect.
Each item must be a mini-revelation, not a filler.`,
    structureFormula: '[Number] + [أسباب/أخطاء/خطوات/أسرار] + [Desirable outcome]',
    examplesAr: [
      '5 أخطاء تمنعك من الوصول لـ 10,000 دولار شهرياً',
      '3 أسباب تجعل عملاءك يختارون منافسيك — والحل؟',
      '7 خطوات لبناء نظام مبيعات يعمل وأنت نائم',
    ],
    captionStyle: 'The caption MUST deliver on the number promise. List each item clearly numbered. Each item is 1-2 sentences. End with CTA that promises the full system.',
    carouselRecommended: true,
    visualDirection: 'Organized, structured composition. Visual numbered elements or floating list items. Clean grid-like layout. Hero presenting or gesturing toward the list. Professional, educational energy with a premium feel.',
  },

  misconception: {
    promptInstruction: `MISCONCEPTION DELIVERY — "Everyone thinks X... they're wrong."
The hook must name a COMMON BELIEF in their industry and then shatter it.
Structure: [The myth everyone believes] → [Why it's wrong] → [The truth].
The misconception should be something the reader CURRENTLY believes.`,
    structureFormula: '"الكل يفتكر إن [myth]..." → "الحقيقة: [truth]"',
    examplesAr: [
      'الكل يفتكر إن المحتوى هو الحل — الحقيقة إنه المشكلة',
      '"أنت محتاج متابعين أكثر" — أكبر كذبة في عالم التدريب',
      'لو فاكر إن التسويق = إعلانات... أنت بتخسر 80% من فرصك',
    ],
    captionStyle: 'Open by stating the misconception they believe. Empathize ("I used to believe this too"). Then systematically demolish it with evidence. Present the new truth.',
    carouselRecommended: true,
    visualDirection: 'Disrupted composition — something visually "wrong" or unexpected. A crossed-out element, a shattered object, or a visual contradiction. Hero with a "let me tell you the truth" expression. Bold red or orange accents for the myth being busted.',
  },

  transformation_promise: {
    promptInstruction: `TRANSFORMATION PROMISE DELIVERY — Promise a specific change with a timeline.
The hook must promise a CONCRETE, MEASURABLE TRANSFORMATION.
Include: what changes, by how much, in what timeframe.
The promise must be bold but believable. Specific beats vague.`,
    structureFormula: '[Specific transformation] + [Timeframe] + [With what method]',
    examplesAr: [
      'من صفر نظام إلى نظام مبيعات كامل في 30 يوم',
      'ارفع سعر استشارتك 5 أضعاف في 90 يوم — بدون ما تخسر عميل واحد',
      'حوّل خبرتك إلى دخل شهري 10,000 دولار — النظام جاهز',
    ],
    captionStyle: 'Open with the promise. Break it down into steps. Show proof that others achieved it. Address the "but can I?" doubt. CTA.',
    carouselRecommended: false,
    visualDirection: 'Aspirational, forward-looking scene. Bright, golden-hour lighting. Hero in the "after" state — successful, confident, relaxed. The environment shows achievement. Timeline or progression visual element showing the journey.',
  },

  pain_point: {
    promptInstruction: `PAIN POINT DELIVERY — Lead with their deepest frustration.
The hook must describe a SPECIFIC PAINFUL SITUATION the reader recognizes.
Be so specific it is uncomfortable. Name the exact moment, feeling, or scenario.
The reader should feel "This person knows exactly what I'm going through."`,
    structureFormula: '[Vivid painful moment/situation] + [Emotional response] + [Hope tease]',
    examplesAr: [
      'لما تفتح حسابك آخر الشهر وتكتشف إنك اشتغلت 200 ساعة مقابل فول وطعمية',
      'ذلك الشعور لما عميل يقولك "غالي" وأنت عارف إنك تستحق أكثر',
      'كل يوم بتنشر محتوى... وكل يوم نفس النتيجة: صفر',
    ],
    captionStyle: 'Open with the painful scenario (2-3 sentences of pure pain). Let it marinate. Then reveal: "but there is a way out." Build hope gradually. CTA as the escape.',
    carouselRecommended: false,
    visualDirection: 'Emotionally heavy, empathetic scene. Darker, moodier tones. Hero with a relatable expression of frustration or exhaustion. The environment reflects their struggle. Warm accent light suggesting hope exists.',
  },

  threat: {
    promptInstruction: `THREAT DELIVERY — Warn about a negative consequence they haven't considered.
The hook must present a DANGER or RISK that the reader is currently ignoring.
Structure: [What they don't know is hurting them] → [The growing cost] → [The tipping point].
Not fear-mongering — legitimate warning with a solution.`,
    structureFormula: '[Hidden danger] + [Growing consequence] + [Point of no return]',
    examplesAr: [
      'كل يوم بدون نظام = عملاء بيروحوا لمنافسك ولا بترجع',
      'السوق بيتغير — واللي مش هيتحرك السنة دي هيتأخر 5 سنين',
      'منافسك بنى نظام وأنت لسا "بتفكر" — متى هتبدأ؟',
    ],
    captionStyle: 'Open with the threat (make it real, not dramatic). Quantify the cost of inaction. Show the timeline of deterioration. Present the product as the shield/solution.',
    carouselRecommended: false,
    visualDirection: 'Warning-style composition. Dark, ominous atmosphere with red or amber warning accents. Hero delivering a serious, direct look. Environmental elements suggesting consequence — clocks, falling graphs, warning signs. The mood should feel like an urgent intervention.',
  },
};

// Helper to get prompt instructions for a given hook type
export const getHookTypePrompt = (typeId: string): string => {
  const knowledge = HOOK_TYPE_KNOWLEDGE[typeId];
  if (!knowledge) return '';
  return `
${knowledge.promptInstruction}

STRUCTURE: ${knowledge.structureFormula}
EXAMPLES (Arabic): ${knowledge.examplesAr.map(e => `"${e}"`).join(' | ')}`;
};

// Helper to get caption style
export const getHookTypeCaptionStyle = (typeId: string): string => {
  return HOOK_TYPE_KNOWLEDGE[typeId]?.captionStyle || '';
};

export const getHookTypeVisualDirection = (typeId: string): string => {
  return HOOK_TYPE_KNOWLEDGE[typeId]?.visualDirection || '';
};

// ─── DELIVERY STYLE FORMAT INSTRUCTIONS ─────────────────────────────────
// When user selects a specific delivery style, ALL 4 hooks must be formatted
// in that style. This overrides the default format structure.
export const getDeliveryStyleFormatOverride = (typeId: string, angleId?: string): string => {
  const map: Record<string, string> = {
    question: `FORMAT GUIDE: Present all 4 hooks as QUESTIONS. Every HOOK_TEXT should end with ؟ or ?
Structure: Each hook asks a different question that hits a different dimension of their pain/desire.
Vary question types: Yes/No question, "Why" question, "What if" question, Rhetorical challenge.`,

    controversial: `FORMAT GUIDE: Present all 4 hooks as BOLD CONTRARIAN CLAIMS. Each should challenge a different widely-held belief.
Structure: [Everyone believes X] + [But actually the opposite is true]
The reader should think "Wait, WHAT?" for each hook. Be genuinely provocative — not mildly edgy.
Attack ideas and common practices, never attack people. Each hook challenges a DIFFERENT belief.`,

    personal_story: `FORMAT GUIDE: Present all 4 hooks as opening lines of a PERSONAL STORY. Use first person "أنا" or "كنت".
Structure: [Specific moment in time] + [What happened] + [Emotional impact]
Each hook should be a different chapter: failure moment, turning point, discovery moment, transformation moment.
The reader should feel like they are hearing a real person's real story — not a polished marketing pitch.`,

    storytelling: `FORMAT GUIDE: Present all 4 hooks using NARRATIVE COMPRESSION — telling a mini-story in one headline.
Structure: [Character] + [Situation] + [Unexpected turn]
Each hook is a compressed story arc that creates curiosity to hear the full version.
Use specific details: names, numbers, places, moments. Generic stories don't work.`,

    shocking_stat: `FORMAT GUIDE: Present all 4 hooks leading with a REAL, SPECIFIC, BELIEVABLE STATISTIC in the HOOK_TEXT.
Structure: [Jaw-dropping number] + [What it means for the reader]
Each hook should use a different kind of number: percentage, dollar amount, ratio, or time metric.
⚠️ VALIDATION: If a HOOK_TEXT does not contain at least one specific number/percentage/ratio, it FAILS.
⚠️ The statistic must be MEANINGFUL — not a random number forced into an unrelated sentence.
⚠️ INVENT YOUR OWN plausible round numbers relevant to the user's niche. Do NOT default to common template numbers.`,

    comedic: `FORMAT GUIDE: Present all 4 hooks using HUMOR — irony, sarcasm, relatable funny scenarios.
Structure: [Funny observation about their situation] → [Punchline that reveals truth]
The humor should be RELATABLE to their professional struggle. Each hook uses different humor:
Self-deprecating, Absurd comparison, Ironic truth, Relatable daily scenario.`,

    listicle: `FORMAT GUIDE: Present all 4 hooks as numbered list promises.
Structure: "[N] [things/secrets/mistakes/steps] that [promise/consequence]"
Each hook uses a different number and framing: "3 secrets", "5 mistakes", "7 signs", "1 thing".`,

    misconception: `FORMAT GUIDE: Present all 4 hooks as MYTH-BUSTING statements that challenge a COMMON MISCONCEPTION.
Structure: "You think [common belief]? Actually, [surprising truth]"
Each hook demolishes a different wrong assumption. Be specific — name the misconception clearly.`,

    transformation_promise: `FORMAT GUIDE: Present all 4 hooks as SPECIFIC TRANSFORMATION promises with a timeframe.
CONCEPT — NOT A TEMPLATE: every hook must carry the same three ingredients — a before-state, an after-state, and a timeframe. There is NO fixed word order. HOW those ingredients are arranged into a sentence MUST be different for every hook.
Use each of these four sentence structures exactly once:
- Hook A — QUESTION FORM: pose the transformation as a question the reader answers in their own head.
- Hook B — AFTER-STATE FIRST: open on the after-state, then reveal what it replaced and how long it took.
- Hook C — TIMEFRAME FIRST: open on the timeframe, then the transformation that fits inside it.
- Hook D — IMPERATIVE FORM: a direct command to make the change, with the after-state and timeframe attached.
⚠️ All 4 hooks must express a transformation with a timeframe. NO TWO hooks may use the same sentence structure. If two hooks end up with the same shape, rewrite one of them.
⚠️ Any of the three ingredients may be implied by context instead of stated in a fixed slot, as long as the reader still feels the before → after change and the time it takes.
Each hook promises transformation in a different dimension: income, time, status, confidence.`,

    pain_point: `FORMAT GUIDE: Present all 4 hooks pressing on a different SPECIFIC PAIN POINT.
Structure: [Vivid pain scenario that feels personal and current]
Each hook names a different daily frustration. Be so specific they think "this person knows my life."`,

    threat: `FORMAT GUIDE: Present all 4 hooks as THREAT or WARNING about consequences.
Structure: "If you keep doing [X], [Y consequence] is inevitable"
Each hook warns about a different threat: financial, competitive, time-based, reputation-based.
The threat should feel real and urgent, not fearmongering.`,

    curiosity_gap: `FORMAT GUIDE: Present all 4 hooks creating an INFORMATION GAP the reader cannot resist closing.
Structure: [Unexpected claim] + [Implied secret that is NOT revealed]
Each hook opens a different kind of loop: hidden knowledge, counterintuitive fact, untold story, forbidden truth.
NEVER close the gap in the headline — the reader must click to find out.`,
  };
  const baseText = map[typeId] || '';
  if (!baseText) return '';

  const suffix = angleId
    ? `\n⚠️ REMINDER: The "${angleId}" angle's hard validation rule STILL applies inside this ${typeId} format. The ${typeId} delivery WRAPS the angle's content — it does NOT replace it.`
    : '';
  return baseText + suffix;
};