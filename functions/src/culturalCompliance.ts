// functions/src/culturalCompliance.ts — single source of truth for Arabic market guardrails

// ═══════════════════════════════════════════════════════════
// HARAM MOTIFS — data-layer visual motif substitutions
// ═══════════════════════════════════════════════════════════

// `as const` so element types are the literal union HaramMotif, giving
// MOTIF_SUBSTITUTIONS compile-time exact-key coverage (no typo drift, no
// missing entries). assertInvariants() still checks the pair at runtime.
export const HARAM_MOTIFS = [
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
] as const;
export type HaramMotif = typeof HARAM_MOTIFS[number];

export const MOTIF_SUBSTITUTIONS: Readonly<Record<HaramMotif, string>> = {
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

// Round-2 additions: extra alcohol variants (vodka/rum/gin/tequila/bourbon), the
// "pub" venue term, and additional apparel / trafficking terms (crop top, tube top,
// halter, backless, brothel). Same substitutions applied on both the image-prompt
// layer and the ad-copy layer.
// `as const` so element types are the literal union TriggerWord, giving
// SUBSTITUTIONS compile-time exact-key coverage.
export const TRIGGER_WORDS = [
  "wine",
  "whiskey",
  "cocktail",
  "champagne",
  "beer",
  "vodka",
  "rum",
  "gin",
  "tequila",
  "bourbon",
  "alcohol",
  "bar counter",
  "nightclub",
  "pub",
  "casino",
  "gambling",
  "bikini",
  "swimsuit",
  "lingerie",
  "revealing",
  "cleavage",
  "short skirt",
  "tank top",
  "crop top",
  "tube top",
  "halter",
  "backless",
  "strapless",
  "brothel",
] as const;
export type TriggerWord = typeof TRIGGER_WORDS[number];

export const SUBSTITUTIONS: Readonly<Record<TriggerWord, string>> = {
  wine: "premium tea",
  whiskey: "artisan coffee",
  cocktail: "artisan coffee",
  champagne: "sparkling water",
  beer: "artisan coffee",
  vodka: "sparkling water",
  rum: "artisan coffee",
  gin: "herbal infusion",
  tequila: "citrus refresher",
  bourbon: "artisan coffee",
  alcohol: "premium refreshments",
  "bar counter": "service counter",
  nightclub: "premium lounge",
  pub: "private lounge",
  casino: "private salon",
  gambling: "strategic play",
  bikini: "modest swimwear",
  swimsuit: "modest swimwear",
  lingerie: "elegant attire",
  revealing: "elegant",
  cleavage: "neckline",
  "short skirt": "tailored skirt",
  "tank top": "tailored top",
  "crop top": "tailored top",
  "tube top": "tailored top",
  halter: "tailored neckline",
  backless: "elegant",
  strapless: "elegant",
  brothel: "private residence",
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
// ⚠️ INVARIANT: this predicate also exists at `src/universeDatabase.ts` (frontend)
// because the two packages have separate tsconfigs and cannot import from each
// other. Any change to the rule below MUST be mirrored in both files in the
// same commit. See plan.md §Constraints.

export function isArabic(adLanguage: string | undefined | null): boolean {
  return typeof adLanguage === "string" && adLanguage.startsWith("ar");
}

// ═══════════════════════════════════════════════════════════
// SCAN AND REPLACE — post-validation trigger-word scan
// ═══════════════════════════════════════════════════════════

export interface ScanAndReplaceResult {
  cleaned: string;
  matched: string[];
  warning?: string;
}

export function scanAndReplace(
  text: string,
  sourceLayer: "imagePrompt" | "adCopy",
): ScanAndReplaceResult {
  if (sourceLayer !== "imagePrompt" && sourceLayer !== "adCopy") {
    const warning = `scanAndReplace: invalid sourceLayer "${sourceLayer}"; returning input unchanged`;
    console.warn(`⚠️ ${warning}`);
    return { cleaned: text, matched: [], warning };
  }
  if (text === "") return { cleaned: "", matched: [] };

  // Build one combined alternation ordered longest-first, so multi-word phrases
  // (e.g., "bar counter") are preferred over any hypothetical shorter overlap.
  const sortedTriggers = [...TRIGGER_WORDS].sort((a, b) => b.length - a.length);
  const lowerByEscaped = new Map<string, string>();
  const escapedTriggers = sortedTriggers.map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    lowerByEscaped.set(escaped, t);
    return escaped;
  });
  const combined = new RegExp(
    `(^|\\W)(${escapedTriggers.join("|")})(?=\\W|$)`,
    "gi",
  );

  // Single left-to-right pass. matched preserves first-seen order INCLUDING repeats.
  let out = "";
  let cursor = 0;
  const matched: string[] = [];
  for (const m of text.matchAll(combined)) {
    const fullMatchIndex = m.index ?? 0;
    const pre = m[1] ?? "";
    const word = m[2] ?? "";
    const hitStart = fullMatchIndex + pre.length;
    const hitEnd = hitStart + word.length;
    const canonical = TRIGGER_WORDS.find(
      (t) => t.toLowerCase() === word.toLowerCase(),
    );
    if (!canonical) continue;
    out += text.slice(cursor, hitStart) + SUBSTITUTIONS[canonical];
    matched.push(canonical);
    cursor = hitEnd;
  }
  out += text.slice(cursor);

  return { cleaned: out, matched };
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
  const haramSet: ReadonlySet<string> = new Set(HARAM_MOTIFS);
  for (const key of Object.keys(MOTIF_SUBSTITUTIONS)) {
    if (!haramSet.has(key)) {
      throw new Error(`Invariant violation: MOTIF_SUBSTITUTIONS key "${key}" is not present in HARAM_MOTIFS`);
    }
  }
  for (const trigger of TRIGGER_WORDS) {
    if (!(trigger in SUBSTITUTIONS)) {
      throw new Error(`Invariant violation: TRIGGER_WORDS entry "${trigger}" has no SUBSTITUTIONS mapping`);
    }
  }
  const triggerSet: ReadonlySet<string> = new Set(TRIGGER_WORDS);
  for (const key of Object.keys(SUBSTITUTIONS)) {
    if (!triggerSet.has(key)) {
      throw new Error(`Invariant violation: SUBSTITUTIONS key "${key}" is not present in TRIGGER_WORDS`);
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
