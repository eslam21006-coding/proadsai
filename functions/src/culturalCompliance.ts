// functions/src/culturalCompliance.ts — single source of truth for Arabic market guardrails

// ═══════════════════════════════════════════════════════════
// HARAM MOTIFS — data-layer visual motif substitutions
// ═══════════════════════════════════════════════════════════

export const HARAM_MOTIFS: readonly string[] = [
  "cocktails",
  "champagne",
  "whiskey",
  "wine",
  "beer",
  "spirits",
  "cocktail reception",
  "private bar",
  "premium bar",
  "bottles",
  "barrels",
];

export const MOTIF_SUBSTITUTIONS: Readonly<Record<string, string>> = {
  cocktails: "premium beverages",
  champagne: "sparkling drinks",
  whiskey: "warm lighting",
  wine: "premium tea",
  beer: "artisan refreshments",
  spirits: "premium refreshments",
  "cocktail reception": "elegant reception",
  "private bar": "private lounge area",
  "premium bar": "premium refreshment area",
  bottles: "crystal decanters",
  barrels: "aged wood casks",
};

// ═══════════════════════════════════════════════════════════
// TRIGGER WORDS — post-validation scan substitutions
// ═══════════════════════════════════════════════════════════

export const TRIGGER_WORDS: readonly string[] = [
  "wine",
  "whiskey",
  "cocktail",
  "champagne",
  "beer",
  "alcohol",
  "bar counter",
  "nightclub",
  "casino",
  "gambling",
  "bikini",
  "swimsuit",
  "lingerie",
  "revealing",
  "cleavage",
  "short skirt",
  "tank top",
  "strapless",
];

export const SUBSTITUTIONS: Readonly<Record<string, string>> = {
  wine: "premium tea",
  whiskey: "artisan coffee",
  cocktail: "artisan coffee",
  champagne: "sparkling water",
  beer: "artisan coffee",
  alcohol: "premium refreshments",
  "bar counter": "service counter",
  nightclub: "premium lounge",
  casino: "private salon",
  gambling: "strategic play",
  bikini: "modest swimwear",
  swimsuit: "modest swimwear",
  lingerie: "elegant attire",
  revealing: "elegant",
  cleavage: "neckline",
  "short skirt": "tailored skirt",
  "tank top": "tailored top",
  strapless: "elegant",
};

// ═══════════════════════════════════════════════════════════
// CULTURAL COMPLIANCE BLOCK — injected into image prompts
// ═══════════════════════════════════════════════════════════

export const CULTURAL_COMPLIANCE_BLOCK: string = `CULTURAL COMPLIANCE (MANDATORY — Arabic market):
- NEVER render alcohol in any form: no wine glasses, beer bottles, champagne, cocktails, whiskey, spirits, or any drinking vessel that implies alcohol.
- NEVER render nightclub, bar, or pub interiors.
- NEVER render gambling elements: no cards, chips, roulette, slot machines.
- NEVER render pork products or pork-related food scenes.
- NEVER render dogs as pets (culturally sensitive in Gulf markets).
- NEVER render crosses, churches, or non-Islamic religious symbols unless specifically relevant to the product.
- NEVER render revealing or immodest clothing on any person — all figures should be dressed conservatively. Shoulders covered, no deep necklines, no short skirts/shorts.
- NEVER render mixed-gender physical contact (handshakes are acceptable).
- Luxury signaling should use: premium tea/coffee, luxury watches, fine dining (halal), architecture, cars, travel, nature — NOT alcohol or nightlife.
- If the universe mentions any bar/lounge/club setting, replace the alcohol elements with premium non-alcoholic beverages (Arabic coffee, tea, juice, water).`;

// ═══════════════════════════════════════════════════════════
// ARABIC WARDROBE BLOCK — injected into wardrobe section
// ═══════════════════════════════════════════════════════════

export const ARABIC_WARDROBE_BLOCK: string = `ARABIC MARKET WARDROBE RULES:
- All figures (male and female) must be dressed conservatively and modestly.
- Female figures: shoulders covered, no cleavage, skirt/dress below knee or trousers. Hijab ONLY if present in Box A — never add or remove it.
- Male figures: no tank tops, no shorts above knee. Business casual minimum.
- No swimwear, no gym wear showing skin, no lingerie or underwear visible.
- Luxury fashion is encouraged — but covered luxury (suits, abayas, elegant modest dresses, thobes).`;

// ═══════════════════════════════════════════════════════════
// ARABIC DETECTION
// ═══════════════════════════════════════════════════════════

export function isArabic(adLanguage: string | undefined | null): boolean {
  return typeof adLanguage === "string" && adLanguage.startsWith("ar");
}

// ═══════════════════════════════════════════════════════════
// SCAN AND REPLACE — post-validation trigger-word scan
// ═══════════════════════════════════════════════════════════

export function scanAndReplace(
  text: string,
  sourceLayer: "imagePrompt" | "adCopy",
): { cleaned: string; matched: string[] } {
  if (sourceLayer !== "imagePrompt" && sourceLayer !== "adCopy") {
    throw new TypeError(`scanAndReplace: invalid sourceLayer "${sourceLayer}"`);
  }
  if (text === "") return { cleaned: "", matched: [] };

  const sorted = [...TRIGGER_WORDS].sort((a, b) => b.length - a.length);

  let result = text;
  const matched: string[] = [];

  for (const trigger of sorted) {
    const escaped = trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\W)(${escaped})(\\W|$)`, "gi");
    let hit = false;
    result = result.replace(re, (_match, pre, word, post) => {
      if (!hit) {
        matched.push(trigger);
        hit = true;
      }
      return `${pre}${SUBSTITUTIONS[trigger]}${post}`;
    });
  }

  return { cleaned: result, matched };
}

// ═══════════════════════════════════════════════════════════
// INVARIANTS — validated at import time in non-production
// ═══════════════════════════════════════════════════════════

export function assertInvariants(): void {
  for (const motif of HARAM_MOTIFS) {
    if (!(motif in MOTIF_SUBSTITUTIONS)) {
      throw new Error(`Invariant violation: HARAM_MOTIFS entry "${motif}" has no MOTIF_SUBSTITUTIONS mapping`);
    }
  }
  for (const trigger of TRIGGER_WORDS) {
    if (!(trigger in SUBSTITUTIONS)) {
      throw new Error(`Invariant violation: TRIGGER_WORDS entry "${trigger}" has no SUBSTITUTIONS mapping`);
    }
  }
  const triggerLower = TRIGGER_WORDS.map((t) => t.toLowerCase());
  for (const [, value] of Object.entries(SUBSTITUTIONS)) {
    for (const trigger of triggerLower) {
      const re = new RegExp(`(?:^|\\W)${trigger.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\W|$)`, "i");
      if (re.test(value)) {
        throw new Error(`Invariant violation: substitution value "${value}" contains trigger word "${trigger}"`);
      }
    }
  }
}

if (process.env.NODE_ENV !== "production") {
  assertInvariants();
}
