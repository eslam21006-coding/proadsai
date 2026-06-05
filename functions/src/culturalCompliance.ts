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

// `as const satisfies Record<HaramMotif, string>` — compile-time exact-key coverage
// against the derived literal union while preserving the literal types of each value.
export const MOTIF_SUBSTITUTIONS = {
  cocktails: "premium beverages",
  champagne: "Arabic coffee in a traditional finjan",
  whiskey: "warm lighting",
  wine: "Arabic tea in an ornate glass",
  beer: "artisan refreshments",
  spirits: "premium refreshments",
  "cocktail reception": "elegant reception",
  "private bar": "private lounge area",
  "premium bar": "premium refreshment area",
  // Neutral, non-drink-storage substitutions: "crystal decanters" and "aged wood casks"
  // both read as alcohol drinkware (decanters carry spirits; wine/whiskey casks are barrels
  // by another name). Use storage containers that carry no alcohol connotation.
  bottles: "glass jars",
  barrels: "wooden storage crates",
} as const satisfies Record<HaramMotif, string>;

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

// `as const satisfies Record<TriggerWord, string>` — same compile-time exact-key
// coverage guarantee as MOTIF_SUBSTITUTIONS. See note above MOTIF_SUBSTITUTIONS.
export const SUBSTITUTIONS = {
  wine: "Arabic tea in an ornate glass",
  whiskey: "artisan coffee",
  cocktail: "artisan coffee",
  champagne: "Arabic coffee",
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
} as const satisfies Record<TriggerWord, string>;

// ═══════════════════════════════════════════════════════════
// ARABIC TERMS — Arabic-language drink/alcohol terms that the English
// TRIGGER_WORDS regex cannot match. Applied to the IMAGE-PROMPT layer only
// (not ad copy) to avoid mangling legitimate phrases such as "كأس العالم" (World Cup).
// ═══════════════════════════════════════════════════════════
export const ARABIC_SUBSTITUTIONS: Record<string, string> = {
  "شامبانيا": "قهوة عربية",   // champagne → Arabic coffee
  "نبيذ": "شاي أخضر",          // wine → green tea
  "خمر": "",                   // alcohol → removed entirely
  "كأس": "فنجان قهوة",         // glass → coffee cup
  "شراب": "قهوة عربية",        // drink/beverage → Arabic coffee
};

// ═══════════════════════════════════════════════════════════
// CULTURAL COMPLIANCE BLOCK — injected into image prompts
// ═══════════════════════════════════════════════════════════

export const CULTURAL_COMPLIANCE_BLOCK: string = `CULTURAL COMPLIANCE (MANDATORY — Arabic market):
- NO alcohol in any form (wine, beer, champagne, cocktails, spirits, or any vessel implying it); NO bar/nightclub/pub settings — replace with premium non-alcoholic drinks (Arabic coffee, tea, juice, water) in an upscale lounge/seating area.
- NEVER render the hero holding a wine glass, champagne flute, cocktail glass, or any glass containing a sparkling or clear beverage. If a beverage must appear, use: an Arabic coffee cup (finjan), a tea glass with a clear handle, or a juice glass with visible fruit. No champagne flutes under any circumstances.
- NO gambling (cards, chips, roulette, slots); NO pork or pork-related food; NO dogs as pets; NO crosses/churches/non-Islamic religious symbols unless the product specifically requires it.
- Conservative, modest clothing on everyone: shoulders covered, no deep necklines, no short skirts/shorts. NO mixed-gender physical contact (handshakes OK).
- Signal luxury via premium tea/coffee, fine watches, halal fine dining, architecture, cars, travel, nature — never alcohol or nightlife.`;

// ═══════════════════════════════════════════════════════════
// ARABIC WARDROBE BLOCK — injected into wardrobe section
// ═══════════════════════════════════════════════════════════

export const ARABIC_WARDROBE_BLOCK: string = `ARABIC MARKET WARDROBE RULES:
- Everyone dressed conservatively and modestly. Female: shoulders covered, no cleavage, hem below knee or trousers; hijab ONLY if present in Box A — never add or remove it. Male: no tank tops, no shorts above knee (business-casual minimum).
- No swimwear, gym wear showing skin, lingerie, or visible underwear. Luxury encouraged but COVERED (suits, abayas, elegant modest dresses, thobes).`;

// ═══════════════════════════════════════════════════════════
// ARABIC DETECTION
// ═══════════════════════════════════════════════════════════
// ⚠️ INVARIANT: this predicate also exists at `src/universeDatabase.ts` (frontend)
// because the two packages have separate tsconfigs and cannot import from each
// other. Any change to the rule below MUST be mirrored in both files in the
// same commit. See plan.md §Constraints.

export function isArabic(adLanguage: string | undefined | null): boolean {
  if (adLanguage == null) return false;
  return typeof adLanguage === "string"
    && adLanguage.trim().toLowerCase().startsWith("ar");
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
  // Each trigger also matches a common plural form (-s / -es) UNLESS the base form
  // already ends in "s" (to avoid "strapless" → "straplesss"). The matched list
  // always records the canonical singular form from TRIGGER_WORDS.
  const sortedTriggers = [...TRIGGER_WORDS].sort((a, b) => b.length - a.length);
  const escapedTriggers = sortedTriggers.map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Only append optional plural suffix when the base does NOT already end in "s"
    // or an "s-sound" cluster that would produce awkward doubles. Words ending in
    // "h", "x", "z" take "-es" in English; "-y" takes "-ies"; otherwise "-s".
    const base = t;
    if (/s$/i.test(base)) return escaped; // strapless, backless, etc. — no plural suffix appended
    if (/[hxz]$/i.test(base)) return `${escaped}(?:es)?`;
    if (/[^aeiou]y$/i.test(base)) return `${escaped.slice(0, -1)}(?:y|ies)`;
    return `${escaped}s?`;
  });
  const combined = new RegExp(
    `(^|\\W)(${escapedTriggers.join("|")})(?=\\W|$)`,
    "gi",
  );

  // Canonicalizer: given a matched token (potentially a plural / -ies form),
  // return the base TRIGGER_WORDS entry. Tries exact → strip -ies → strip -es → strip -s.
  const canonicalize = (word: string): TriggerWord | null => {
    const lower = word.toLowerCase();
    const tryForms = [
      lower,
      /ies$/.test(lower) ? `${lower.slice(0, -3)}y` : null,
      /es$/.test(lower) ? lower.slice(0, -2) : null,
      /s$/.test(lower) ? lower.slice(0, -1) : null,
    ].filter((v): v is string => v !== null);
    for (const form of tryForms) {
      const hit = TRIGGER_WORDS.find((t) => t.toLowerCase() === form);
      if (hit) return hit;
    }
    return null;
  };

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
    const canonical = canonicalize(word);
    if (!canonical) continue;
    out += text.slice(cursor, hitStart) + SUBSTITUTIONS[canonical];
    matched.push(canonical);
    cursor = hitEnd;
  }
  out += text.slice(cursor);

  // Arabic-language pass (image-prompt layer only). English TRIGGER_WORDS can't match Arabic
  // alcohol/drink terms; this scrubs them from the visual blueprint. Skipped for ad copy to
  // avoid mangling legitimate words. Word-boundary-guarded (not preceded/followed by another
  // Arabic letter) so it never replaces a substring inside a larger word.
  if (sourceLayer === "imagePrompt") {
    for (const [ar, sub] of Object.entries(ARABIC_SUBSTITUTIONS)) {
      const re = new RegExp(`(?<![\\u0600-\\u06FF])${ar}(?![\\u0600-\\u06FF])`, "g");
      const next = out.replace(re, sub);
      if (next !== out) { matched.push(ar); out = next; }
    }
  }

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
