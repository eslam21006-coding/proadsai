import React from 'react';
import { RETARGETING_OBJECTION_DATA } from './retargetingObjections';
// ─── ROLE-SPECIFIC SYSTEM INSTRUCTIONS (Saves ~40% input tokens) ─────────────
// Each AI call only receives the instructions it needs, not the full 5-step guide.

const CORE_IDENTITY = `You are a Lead Creative Funnel Designer specializing in high-converting ad creatives.
Your primary function is to select and populate proven direct response copywriting frameworks based on the user's input and universe selection. The frameworks are derived from the principles of Eugene Schwartz, Jim Edwards, and Joe Sugarman.
STRICT DATA FLOW DIRECTIVE:
Use variables: brand_name, product_name, target_avatar, core_challenge, transformation, selected_universe, cta_input, brand_url.`;

/** TOV/Hooks — copywriting rules only */
export const SYSTEM_TOV = `${CORE_IDENTITY}

THEMATIC MARKETING FUSION:
- Do NOT write a story. Write high-converting Direct Response copy in Professional Marketing Fusha Arabic using PQR2 logic (Problems, Questions, Roadblocks, Results).
- Framework Selection: Analyze user inputs to determine the prospect's Awareness Level and Emotional Trigger. Select and adapt the most suitable framework from the internal knowledge base to generate copy.
- Use THEMATIC PUNS: Marketing terms that double-play with the [selected_universe]. (e.g., "Liquidity" for cashflow in water worlds, "Gravity" for price-traps in space).
- FORBIDDEN: Do not use "AI fluff" words like "Unleash," "Unlock," "Elevate," "Realm," or "Symphony."
- Constraints: Headline (Max 8 words), Subheadline (Max 12 words) and a Benefit Claim (Max 5 words).
- CTA: Literal [cta_input] string linked to a specific psychological benefit. The CTA must flow naturally into the Benefit. (e.g., "Join [CTA] to achieve [Benefit]")`;

/** Concepts — visual metaphor architecture */
export const SYSTEM_CONCEPTS = `${CORE_IDENTITY}

CINEMATIC ARCHITECT BLUEPRINT:
- Translate hooks into high-concept visual metaphors based on the selected framework's emotional trigger.
- COSTUME & SCENE TRANSFORMATION (CRITICAL):
  - Maintain facial likeness and bone structure from Box A photos EXACTLY.
  - Transform all clothing, gear, and accessories to fit the [selected_universe] (e.g., "Galactic CEO wearing a nebula-textured silk suit").
- Environment & Physics: Describe how the hero is interacting with the universe and how the universe physics interact with the offer (e.g., floating ROI charts, bioluminescent certificates).
- Conditional Branding: If logos exist, integrate as physical artifacts. If not, focus on cinematic composition.
- TEXT FIDELITY: You must design the image specifically to hold the exact text generated in Step 2.
- Architecture must provide "Negative Space" for text. Ensure high-contrast backgrounds behind text (Shadow Boxing).`;

/** Build Plan + Image Rendering — render engine rules */
export const SYSTEM_RENDER = `${CORE_IDENTITY}

MASTER STUDIO RENDER ENGINE:
- VERBATIM TEXT FIDELITY: You must render the literal Hook and Subhead text. NO WORD SKIPPING OR ALTERATION.
- TEXT RENDERING: Do NOT render the ** symbols in the final image. They are instructions for color highlighting only.
- FACE PROTECTION: 100% clarity on facial features. Forbid flares/distortion on eyes, nose, or mouth.
- REFLOW LOGIC: Rescaling only adjusts spatial layout. The text strings and hero subject must remain identical.
- LOGO GUARD: Use Box B assets as the ONLY source for branding, if provided.
- CLEAN CANVAS RULE: Render ONLY the user's brand elements. The design must be free of any watermarks, tool logos, or third-party branding.

PROFESSIONAL TYPOGRAPHY SYSTEM (CRITICAL — THIS IS WHAT SEPARATES AMATEUR FROM PRO):
- TEXT IS PART OF THE DESIGN, NOT ON TOP OF IT. Text must feel like it was designed INTO the composition, not slapped on afterward.
- LAYERED DEPTH: Create depth by having some design elements (particles, light effects, subtle smoke) render IN FRONT of text while the hero and environment are behind it. This creates a cinematic "sandwiched" effect.
- TEXT ZONES: Dedicate specific zones of the image for text. The hero should NOT overlap with headline text. Design the composition so there are clean dark zones (top/bottom/side) specifically for typography.
- GRADIENT SCRIMS: Use gradient overlays that transition smoothly from the text zone into the image — never a hard-edge dark box. The gradient should feel like natural lighting (darker at edges where text lives, lighter in the center where the hero is).
- CONSISTENT COLOR PALETTE: All text colors, accent highlights, button colors, and decorative elements must share a unified palette. Pick ONE accent color (brand color or gold/amber/electric blue) and use it consistently for headline accents AND button AND decorative elements.
- HEADLINE TREATMENT: Headlines should have visible letter-spacing, consistent weight (extra bold), and may use a subtle background glow or text shadow that matches the accent color — not just a black drop shadow.
- HIERARCHY: Size ratio between headline → subheadline → benefit should be approximately 3:2:1. The viewer should instantly see what's most important.
- ARABIC RTL ALIGNMENT: All Arabic text blocks should be right-aligned. Headline at top-right, subheadline below it right-aligned, CTA button at bottom center or bottom-right.
- TEXT CONTRAST: ALL text must sit on a dark backing (gradient scrim, dark panel, or blurred dark overlay). Never place white text directly on a photo without a dark layer behind it. Headline must be pure white (#FFF) with heavy drop shadow. Subheadline same treatment. Button must be solid opaque color.
- SQUARE (1:1) vs STORY (9:16) ADAPTATION: For square, use a top-heavy text zone (headline at top) with hero in center-bottom. For story, use a vertical split: headline at top 25%, hero in middle 50%, CTA at bottom 25%. Each ratio needs its own spatial logic — do NOT just crop the same layout.`;

/** Caption / Primary Script — copywriting output rules */
export const SYSTEM_CAPTION = `${CORE_IDENTITY}

PRIMARY SCRIPT:
- 150-word long-form ad copy in Professional Marketing Fusha Arabic.
- Return ONLY the ad copy. No metadata, no headers, no section numbers.`;

/** Kept for backward compatibility — full version (used nowhere now, safe to delete later) */
export const SYSTEM_INSTRUCTION = `${CORE_IDENTITY}

1. THEMATIC MARKETING FUSION (STEP 2):
- Do NOT write a story. Write high-converting Direct Response copy in Professional Marketing Fusha Arabic using PQR2 logic (Problems, Questions, Roadblocks, Results).
- Framework Selection: Analyze user inputs to determine the prospect's Awareness Level and Emotional Trigger. Select and adapt the most suitable framework from the internal knowledge base to generate copy.
- Use THEMATIC PUNS: Marketing terms that double-play with the [selected_universe]. (e.g., "Liquidity" for cashflow in water worlds, "Gravity" for price-traps in space).
- FORBIDDEN: Do not use "AI fluff" words like "Unleash," "Unlock," "Elevate," "Realm," or "Symphony."
- Constraints: Headline (Max 8 words), Subheadline (Max 12 words) and a Benefit Claim (Max 5 words).
- CTA: Literal [cta_input] string linked to a specific psychological benefit. The CTA must flow naturally into the Benefit. (e.g., "Join [CTA] to achieve [Benefit]")

2. CINEMATIC ARCHITECT BLUEPRINT (STEP 3):
- Translate hooks into high-concept visual metaphors based on the selected framework's emotional trigger.
- COSTUME & SCENE TRANSFORMATION (CRITICAL): 
  - Maintain facial likeness and bone structure from Box A photos EXACTLY.
  - Transform all clothing, gear, and accessories to fit the [selected_universe] (e.g., "Galactic CEO wearing a nebula-textured silk suit").
- Environment & Physics: Describe how the hero is interacting with the universe and how the universe physics interact with the offer (e.g., floating ROI charts, bioluminescent certificates).
- Conditional Branding: If logos exist, integrate as physical artifacts. If not, focus on cinematic composition.
- TEXT FIDELITY: You must design the image specifically to hold the exact text generated in Step 2.
- Architecture must provide "Negative Space" for text. Ensure high-contrast backgrounds behind text (Shadow Boxing).

3. MASTER STUDIO RENDER ENGINE (STEP 4):
- VERBATIM TEXT FIDELITY: You must render the literal Hook and Subhead text from Step 2. NO WORD SKIPPING OR ALTERATION.
- TEXT RENDERING: Do NOT render the ** symbols in the final image. They are instructions for color highlighting only.
- FACE PROTECTION: 100% clarity on facial features. Forbid flares/distortion on eyes, nose, or mouth.
- REFLOW LOGIC: Rescaling only adjusts spatial layout. The text strings and hero subject must remain identical.
- LOGO GUARD: Use Box B assets as the ONLY source for branding, if provided.
- CLEAN CANVAS RULE: Render ONLY the user's brand elements. The design must be free of any watermarks, tool logos, or third-party branding.

4. PRIMARY SCRIPT (STEP 5):
- 150-word long-form ad copy in Professional Marketing Fusha Arabic.
- Return ONLY the ad copy. No metadata, no headers, no section numbers.`;

export const ASPECT_RATIOS: { label: string; value: any; icon: React.ReactNode }[] = [
  { label: 'Square (1:1)', value: '1:1', icon: '■' },
  { label: 'Portrait (4:5)', value: '4:5', icon: '▮' },
  { label: 'Tall Portrait (3:4)', value: '3:4', icon: '▮' },
  { label: 'Landscape (4:3)', value: '4:3', icon: '▬' },
  { label: 'Story (9:16)', value: '9:16', icon: '📱' },
  { label: 'YouTube (16:9)', value: '16:9', icon: '🎬' },
];

// ─── COLD AD HOOK ANGLES ─────────────────────────────────────────────────
// Ordered by plan tier: Starter [0..3], Creator [0..7], Pro/Scaling [0..10]
export const COLD_HOOK_ANGLES: { id: string; labelAr: string; labelEn: string; description: string; carouselRecommended?: boolean }[] = [
  // ── Starter (first 4) ──
  { id: 'emotional', labelAr: 'عاطفي', labelEn: 'Emotional', description: 'Triggers feelings — fear, hope, desire, frustration' },
  { id: 'pain', labelAr: 'نقطة ألم', labelEn: 'Pain Amplification', description: 'Presses harder on the pain — "you know that feeling when..."' },
  { id: 'curiosity', labelAr: 'فضول', labelEn: 'Curiosity', description: '"The one thing you\'re missing" — an open loop that demands a click' },
  // ── Creator adds (5–8) ──
  { id: 'logic', labelAr: 'منطقي', labelEn: 'Logic', description: 'Appeals to reason with clear arguments and proof points' },
  { id: 'social_proof', labelAr: 'إثبات اجتماعي', labelEn: 'Social Proof', description: 'Client results carousel, testimonials, case studies', carouselRecommended: true },
  { id: 'urgency', labelAr: 'عداد / استعجال', labelEn: 'Urgency', description: 'Countdown, seats filling — "act now or miss out"' },
  { id: 'statistics', labelAr: 'إحصائية صادمة', labelEn: 'Statistics', description: '"95% did X, only 5% succeeded — are you one of them?"' },
  // ── Pro/Scaling adds (9–11) ──
  { id: 'scarcity', labelAr: 'ندرة', labelEn: 'Scarcity', description: 'Limited spots, exclusive access, closing soon' },
  { id: 'logical_authority', labelAr: 'سلطة منطقية', labelEn: 'Logical Authority', description: '"Helped X clients" / "First system of its kind"' },
  { id: 'future_based', labelAr: 'تخيل لو!', labelEn: 'Future-Based', description: '"Imagine if..." — paints a vivid picture of the desired outcome' },
];

// ─── HOOK TYPES (Delivery style) ─────────────────────────────────────────
// Ordered by plan tier: Starter [0..3], Creator [0..7], Pro/Scaling [0..11]
export const HOOK_TYPES: { id: string; labelAr: string; labelEn: string }[] = [
  // ── Starter (first 4) ──
  { id: 'question', labelAr: 'سؤال', labelEn: 'Question' },
  { id: 'curiosity_gap', labelAr: 'فجوة فضول', labelEn: 'Curiosity Gap' },
  { id: 'personal_story', labelAr: 'قصة شخصية', labelEn: 'Personal Story' },
  { id: 'pain_point', labelAr: 'نقطة ألم', labelEn: 'Pain Point' },
  // ── Creator adds (5–8) ──
  { id: 'transformation_promise', labelAr: 'وعد بالتحول', labelEn: 'Transformation Promise' },
  { id: 'misconception', labelAr: 'مفهوم خاطئ', labelEn: 'Misconception' },
  { id: 'shocking_stat', labelAr: 'إحصائية صادمة', labelEn: 'Shocking Statistic' },
  { id: 'comedic', labelAr: 'فكاهي', labelEn: 'Comedic' },
  // ── Pro/Scaling adds (9–12) ──
  { id: 'controversial', labelAr: 'جدلي', labelEn: 'Controversial' },
  { id: 'storytelling', labelAr: 'سرد قصصي', labelEn: 'Storytelling (Carousel)' },
  { id: 'listicle', labelAr: 'تعداد', labelEn: 'Listicle' },
  { id: 'threat', labelAr: 'تهديد', labelEn: 'Threat' },
];

// ─── AD TONES ────────────────────────────────────────────────────────────
// Ordered by plan tier: Starter [0..3], Creator [0..7], Pro/Scaling [0..10]
export const AD_TONES: { id: string; labelAr: string; labelEn: string; emoji: string }[] = [
  // ── Starter (first 4) ──
  { id: 'formal', labelAr: 'رسمي', labelEn: 'Formal', emoji: '👔' },
  { id: 'inspiring', labelAr: 'ملهم', labelEn: 'Inspiring', emoji: '🔥' },
  { id: 'bold', labelAr: 'جريء', labelEn: 'Bold', emoji: '💪' },
  { id: 'friendly', labelAr: 'ودّي', labelEn: 'Friendly', emoji: '🤝' },
  // ── Creator adds (5–8) ──
  { id: 'emotional', labelAr: 'عاطفي', labelEn: 'Emotional', emoji: '💔' },
  { id: 'authority', labelAr: 'سلطوي', labelEn: 'Authority', emoji: '👑' },
  { id: 'mentor', labelAr: 'مرشد', labelEn: 'Mentor', emoji: '🧭' },
  { id: 'data_driven', labelAr: 'بالأرقام', labelEn: 'Data-Driven', emoji: '📊' },
  // ── Pro/Scaling adds (9–11) ──
  { id: 'funny', labelAr: 'فكاهي', labelEn: 'Funny', emoji: '😄' },
  { id: 'soft', labelAr: 'ناعم', labelEn: 'Soft', emoji: '🕊️' },
  { id: 'luxury_ceo', labelAr: 'رئيس تنفيذي', labelEn: 'Luxury CEO', emoji: '🏛️' },
];

// ─── COPYWRITING STRATEGIES (Psychological framework) ────────────────────
// Ordered by plan tier: Starter [0..2], Creator [0..5], Pro/Scaling [0..7]
export const COPYWRITING_STRATEGIES: { id: string; labelAr: string; labelEn: string; description: string }[] = [
  // ── Starter (first 3) ──
  { id: 'pattern_interrupt', labelAr: 'كسر النمط', labelEn: 'Pattern Interrupt', description: 'Break scroll autopilot with unexpected statements' },
  { id: 'problem_awareness', labelAr: 'وعي بالمشكلة', labelEn: 'Problem Awareness', description: 'They feel the pain but don\'t know solutions exist' },
  { id: 'beginner_awareness', labelAr: 'وعي المبتدئ', labelEn: 'Beginner Awareness', description: 'Educate first — they don\'t know they have a problem' },
  // ── Creator adds (4–6) ──
  { id: 'solution_awareness', labelAr: 'وعي بالحل', labelEn: 'Solution Awareness', description: 'They know solutions exist — show why yours is different' },
  { id: 'authority_builder', labelAr: 'بناء السلطة', labelEn: 'Authority Builder', description: 'Stack credentials and proof before selling' },
  { id: 'product_awareness', labelAr: 'وعي بالمنتج', labelEn: 'Product Awareness', description: 'They know YOUR product — remove the final objection' },
  // ── Pro/Scaling adds (7–8) ──
  { id: 'myth_busting', labelAr: 'تحطيم الأساطير', labelEn: 'Myth Busting', description: 'Demolish a common belief, present the truth' },
  { id: 'soft_story_sell', labelAr: 'بيع بالقصة', labelEn: 'Soft Story Sell', description: 'Personal narrative that leads naturally to the product' },
];

// ─── PLAN-GATED SELECTOR HELPERS (UI rendering only — full arrays stay exported for backend) ──
import { PLANS, type UserPlan } from './planconfig';

export const getAvailableHookAngles = (plan: UserPlan) => {
  const max = PLANS[plan]?.features.maxHookAngles ?? 4;
  return COLD_HOOK_ANGLES.slice(0, max);
};

export const getAvailableHookStyles = (plan: UserPlan) => {
  const max = PLANS[plan]?.features.maxHookStyles ?? 4;
  return HOOK_TYPES.slice(0, max);
};

export const getAvailableAdTones = (plan: UserPlan) => {
  const max = PLANS[plan]?.features.maxAdTones ?? 4;
  return AD_TONES.slice(0, max);
};

export const getAvailableCopyStrategies = (plan: UserPlan) => {
  const max = PLANS[plan]?.features.maxCopyStrategies ?? 3;
  return COPYWRITING_STRATEGIES.slice(0, max);
};

// =============================================================================
// REALISTIC UNIVERSES - Modern, Professional, Real-World Settings
// Hero wears: Modern professional clothing (suits, business casual, industry gear)
// =============================================================================
// ⚠️ DEPRECATED — Use universeDatabase.ts instead. These remain for backward compat only.
// The app now uses DB_REALISTIC/DB_FANTASY from universeDatabase.ts for all active flows.
export const REALISTIC_UNIVERSES = [
  "Surprise Me (Random Realistic)",
  "Custom / Insert Your Own Atmosphere",
  // --- PROFESSIONAL / BUSINESS ---
  "Modern Private Office (Realistic, High-End, Executive)",
  "Corporate Boardroom (Realistic, Glass, Skyline View)",
  "TED-Talk Stage (Realistic, Authority, Red Carpet, Spotlight)",
  "Podcast Studio (Realistic, Neon Accents, Mic, Professional)",
  "Co-Working Space (Realistic, Open Plan, Macs, Hustle)",
  "Start-up Garage (Realistic, Whiteboards, Messy Energy)",
  "Server Room / Data Center (Realistic, Blue LEDs, Tech)",
  "Conference Room Presentation (Realistic, Projector, Team)",
  // --- LIFESTYLE / LUXURY ---
  "Private Jet Interior (Realistic, Leather, Clouds Window)",
  "Penthouse Balcony at Night (Realistic, City Lights, Success)",
  "Luxury Car Interior (Realistic, Driver Seat, Dashboard)",
  "Super Yacht Deck (Realistic, Ocean, Sunset, White Linen)",
  "Exclusive Golf Club Lounge (Realistic, Greenery, Leather)",
  "High-End Art Gallery (Realistic, Minimalist, Spotlights)",
  "Luxury Home Living Room (Realistic, Cozy, Warm Light)",
  "High-End Coffee Shop (Realistic, Bokeh, Laptop, Latte)",
  "Rooftop Garden Lounge (Realistic, Urban Farming, Sunset)",
  "Five-Star Hotel Lobby (Realistic, Marble, Chandelier)",
  // --- CREATIVE / MEDIA ---
  "YouTube Set / Streaming Room (Realistic, RGB, Monitor)",
  "Music Recording Studio (Realistic, Soundproofing, Console)",
  "Fashion Runway Backstage (Realistic, Mirrors, Clothes Rack)",
  "Photography Studio (Realistic, Softboxes, Seamless Background)",
  "Film Set Behind-the-Scenes (Realistic, Cameras, Crew)",
  // --- HEALTH / FITNESS ---
  "Gym / Fitness Center (Realistic, Gritty, Sweat, Iron)",
  "Home Gym / Yoga Studio (Realistic, Mats, Sunlight)",
  "Medical Clinic / Doctor's Office (Realistic, Clean, White)",
  "Spa & Wellness Center (Realistic, Zen, Candles, Stone)",
  "Boxing Gym (Realistic, Ring, Heavy Bags, Raw)",
  // --- FOOD / HOSPITALITY ---
  "Modern Kitchen (Realistic, Cooking, Bright, Marble)",
  "Restaurant Kitchen Pass (Realistic, Stainless Steel, Heat)",
  "Upscale Restaurant (Realistic, Ambient, Wine, Fine Dining)",
  "Bakery / Café Counter (Realistic, Pastries, Warm Light)",
  // --- PROFESSIONAL SERVICES ---
  "Legal Library / Law Office (Realistic, Books, Wood Panels)",
  "Architectural Drafting Table (Realistic, Blueprints, Focus)",
  "Real Estate Open House (Realistic, Empty, Bright, Staging)",
  "Construction Site (Realistic, Hard Hat, Blueprint, Progress)",
  "Automotive Workshop (Realistic, Tools, Grease, Focus)",
  "Dental / Medical Office (Realistic, Chair, Clean, Modern)",
  // --- URBAN / OUTDOOR ---
  "Urban Street Style (Realistic, Day, Depth of Field, City)",
  "Subway Station / Metro (Realistic, Tiles, Motion Blur)",
  "Busy Airport Terminal (Realistic, Glass, Travel, Departure)",
  "Outdoor Hiking Trail (Realistic, Mountain View, Fresh Air)",
  "Beach Resort / Travel Influencer (Realistic, Palm Trees, Pool)",
  "Cozy Reading Nook (Realistic, Rain Window, Books, Tea)",
  "Industrial Warehouse Event (Realistic, Concrete, String Lights)",
  "City Rooftop at Golden Hour (Realistic, Skyline, Wind)",
  "Farmers Market / Street Fair (Realistic, Produce, Crowd)",
  "University Campus / Library (Realistic, Books, Students)",
];

// =============================================================================
// FANTASY UNIVERSES - Creative, Sci-Fi, Artistic, Otherworldly
// Hero wears: Full costume transformation to match the universe
// =============================================================================
export const FANTASY_UNIVERSES = [
  "Surprise Me (Random Fantasy)",
  "Custom / Insert Your Own Atmosphere",
  // --- ANCIENT / MYTHOLOGY ---
  "Ancient Egyptian Pharaoh (Fantasy, Divine, Gold, Hieroglyphics)",
  "Ancient Greek Olympus (Fantasy, Solar-punk, Marble, Gods)",
  "Ancient Mythology (Fantasy, Divine, Epic, Gold & Marble)",
  "Viking Norse Valhalla (Fantasy, Runes, Ice, Warriors)",
  "Aztec/Mayan Cosmic Pyramid (Fantasy, Jade, Celestial)",
  "Ancient Sumerian Ziggurat (Fantasy, High-Tech Temples)",
  "Biblical Epic (Fantasy, Parting Seas, Celestial Fire)",
  "Feudal Japan Samurai (Fantasy, Yokai, Cherry Blossoms)",
  "Ancient Indian Maharaja Palace (Fantasy, Ornate, Neon Gold)",
  "Ancient Roman Colosseum (Fantasy, Gladiator, Marble)",
  "Celtic Druid Forest (Fantasy, Magic, Standing Stones)",
  // --- SCI-FI / SPACE ---
  "Galactic Odyssey (Fantasy, Deep Space, Starship Bridge)",
  "Cyberpunk Neon City (Fantasy, Rain, Holograms, Night)",
  "Cyber-Noir Neon Tokyo 2099 (Fantasy, Blade Runner)",
  "Space Opera Galaxy (Fantasy, Nebulae, Cosmic)",
  "Dyson Sphere Station (Fantasy, Mega-Structure, Solar)",
  "Gothic Space-Cathedral (Fantasy, Stained Glass, Void)",
  "Ancient Roman Martian Colony (Fantasy, Red Planet)",
  "Retro-Future Soviet Space (Fantasy, Brutalist, Cosmonauts)",
  "AI Holographic Grid (Fantasy, Digital, Futuristic)",
  "Post-Human Nanotech Realm (Fantasy, Microscopic, Chrome)",
  "Alien Mothership Interior (Fantasy, Bio-Organic, Xenomorph)",
  // --- STEAMPUNK / DIESELPUNK ---
  "Steampunk Workshop (Fantasy, Victorian, Brass & Gears)",
  "Steampunk Floating Islands (Fantasy, Airships, Clockwork)",
  "Steampunk Airship Armada (Fantasy, Sky Pirates, Copper)",
  "Victorian Clockwork Moon Base (Fantasy, Lunar, Cogs)",
  "Dieselpunk Industrial Noir (Fantasy, Art Deco, Smoke)",
  "Victorian Cyber-Opera (Fantasy, Elegant, Mechanical)",
  // --- HIGH FANTASY / MAGIC ---
  "High Fantasy Castle (Fantasy, Dragons, Magic, Medieval)",
  "Celestial Angelic Realm (Fantasy, Heaven, Light, Wings)",
  "Dark Souls Grim Fantasy (Fantasy, Gothic, Decaying)",
  "Lovecraftian Eldritch Horror (Fantasy, Cosmic, Tentacles)",
  "Whimsical Fairy Tale (Fantasy, Enchanted Forest, Cute)",
  "Crystal Caverns (Fantasy, Gems, Glow, Underground)",
  "Ethereal Cloud Cities (Fantasy, Floating, Heavenly)",
  "Wizard's Tower Library (Fantasy, Spellbooks, Arcane)",
  "Dragon's Treasure Hoard (Fantasy, Gold, Fire, Scales)",
  // --- NATURE / ORGANIC ---
  "Bohemian Jungle (Fantasy, Lush, Vibrant, Tropical)",
  "Bio-Dynamic Jungle (Fantasy, Living Architecture, Vines)",
  "Nature Zen Temple (Fantasy, Organic, Minimalist, Moss)",
  "Underwater Atlantis (Fantasy, Coral, Fish, Ruins)",
  "Bioluminescent Deep Sea (Fantasy, Glow, Creatures)",
  "Fungal Mushroom Kingdom (Fantasy, Spores, Giant Fungi)",
  "Solarpunk Eco-City (Fantasy, Nature + High Tech)",
  "Enchanted Garden (Fantasy, Flowers, Butterflies, Magic)",
  // --- RETRO / STYLIZED ---
  "Retro Futurism 80s (Fantasy, Synthwave, Neon Grid)",
  "Vaporwave Dreamscape (Fantasy, Pink, Purple, Nostalgia)",
  "Film Noir 1940s Detective (Fantasy, Shadows, Fedora)",
  "Art Deco Metropolis (Fantasy, Gatsby, Gold, Geometric)",
  "1950s Space-Age Suburbia (Fantasy, Atomic, Chrome)",
  "Pop Art Comic Book (Fantasy, 1960s, Ben-Day Dots)",
  "1920s Gatsby Space Gala (Fantasy, Roaring, Stars)",
  "Atomic Age Retro-Futurism (Fantasy, Rockets, Fins)",
  "1970s Funk Chrome Station (Fantasy, Disco, Space)",
  // --- ARTISTIC / SURREAL ---
  "Surrealist Dali Dreamscape (Fantasy, Melting, Bizarre)",
  "Van Gogh Starry Night World (Fantasy, Swirling, Painted)",
  "Abstract Geometric Void (Fantasy, Neon, Shapes)",
  "Hyper-Flat 2D Vector (Fantasy, Minimalist, Graphic)",
  "Glitch Art Reality (Fantasy, Corrupted, Digital)",
  "Stained Glass Cathedral (Fantasy, Colorful, Sacred)",
  "Ink-Wash Samurai Village (Fantasy, Japanese Painting)",
  "Oil Painting Renaissance (Fantasy, Classical, Rich)",
  // --- UNIQUE / CREATIVE ---
  "3D Claymation Pixar (Fantasy, Animated, Cute, Colorful)",
  "Origami Papercraft World (Fantasy, Folded, Delicate)",
  "Toy-World Micro-Architecture (Fantasy, Miniature, Playful)",
  "Cardboard DIY World (Fantasy, Handmade, Creative)",
  "Stitched Patchwork Kingdom (Fantasy, Fabric, Cozy)",
  "Cyber-Punk Arabian Nights (Fantasy, Desert Tech, Genie)",
  "Cyber-Viking Neon Valhalla (Fantasy, Norse, Holographic)",
  "Cyber-Aztec Golden Pyramid (Fantasy, Mesoamerican, Laser)",
  "Underwater Wild West (Fantasy, Cowboy, Fish, Coral)",
  "Ice Age Survival Tech (Fantasy, Mammoth, Snow, Tribe)",
  "Post-Apocalyptic Overgrown NYC (Fantasy, Ruins, Nature)",
  "Volcanic Obsidian Fortress (Fantasy, Lava, Fire, Dark)",
  "Arctic Aurora Palace (Fantasy, Ice, Northern Lights)",
  "Candy Kingdom (Fantasy, Sweet, Colorful, Desserts)",
  "Clockwork Toy Factory (Fantasy, Mechanical, Whimsical)",
];

// =============================================================================
// SURPRISE POOLS - For "Surprise Me" random selection by mode
// Contains ALL universes from the exhaustive list for maximum variety
// =============================================================================
export const SURPRISE_REALISTIC = [
  // All realistic universes for surprise selection
  "Private Jet Interior (Realistic, Leather, Clouds Window)",
  "Penthouse Balcony at Night (Realistic, City Lights, Success)",
  "Luxury Car Interior (Realistic, Driver Seat, Dashboard)",
  "Super Yacht Deck (Realistic, Ocean, Sunset, White Linen)",
  "Exclusive Golf Club Lounge (Realistic, Greenery, Leather)",
  "High-End Art Gallery (Realistic, Minimalist, Spotlights)",
  "Modern Private Office (Realistic, High-End)",
  "Co-Working Space Open Plan (Realistic, Buzzing, Macs)",
  "Server Room / Data Center (Realistic, Blue LEDs, Tech)",
  "Architectural Drafting Table (Realistic, Blueprints, Focus)",
  "Medical Clinic / Doctor's Office (Realistic, Clean, White)",
  "Legal Library / Law Office (Realistic, Books, Wood)",
  "Start-up Garage (Realistic, Whiteboards, messy energy)",
  "TED-Talk Stage (Realistic, Authority, Spotlight)",
  "Home Gym / Yoga Studio (Realistic, Mats, Sunlight)",
  "Modern Kitchen (Realistic, Cooking, Bright)",
  "YouTube Set / Streaming Room (Realistic, RGB, Monitor)",
  "Travel Influencer / Beach Resort (Realistic, Palm Trees, Pool)",
  "Cozy Reading Nook (Realistic, Rain Window, Books)",
  "Outdoor Hiking Trail (Realistic, Mountain View, Fresh)",
  "Luxury Home Living Room (Realistic, Cozy, Warm)",
  "Subway Station / Metro (Realistic, Tiles, Motion)",
  "Rooftop Garden (Realistic, Urban Farming, Brick)",
  "Industrial Warehouse Event (Realistic, Concrete, Beams)",
  "Busy Airport Terminal (Realistic, Glass, Travel)",
  "Construction Site (Realistic, Hard Hat, Blueprint)",
  "Real Estate Open House (Realistic, Empty, Bright)",
  "Fashion Runway Backstage (Realistic, Mirrors, Clothes)",
  "Automotive Workshop (Realistic, Tools, Grease, Focus)",
  "Music Recording Studio (Realistic, Soundproofing, Console)",
  "Restaurant Kitchen Pass (Realistic, Stainless Steel, Heat)",
  "Urban Street Style (Realistic, Day, Depth of Field)",
  "Podcast Studio (Realistic, Neon, Mic, Professional)",
  "Corporate Boardroom (Realistic, Glass, Skyline View)",
  "Minimalist abstract Studio (Realistic, Clean, Soft Light)",
  "Gym / Fitness Center (Realistic, Gritty, Sweat)",
  "High-End Coffee Shop (Realistic, Bokeh, Laptop)",
  "Five-Star Hotel Lobby (Realistic, Marble, Chandelier)",
  "Spa & Wellness Center (Realistic, Zen, Candles, Stone)",
  "Boxing Gym (Realistic, Ring, Heavy Bags, Raw)",
  "Photography Studio (Realistic, Softboxes, Seamless)",
  "Film Set Behind-the-Scenes (Realistic, Cameras, Crew)",
  "Upscale Restaurant (Realistic, Ambient, Wine, Fine Dining)",
  "Dental / Medical Office (Realistic, Chair, Clean, Modern)",
  "City Rooftop at Golden Hour (Realistic, Skyline, Wind)",
  "Farmers Market / Street Fair (Realistic, Produce, Crowd)",
  "University Campus / Library (Realistic, Books, Students)",
  "Helicopter Interior (Realistic, Headset, Aerial View)",
  "Casino VIP Room (Realistic, Chips, Velvet, Gold)",
  "Luxury Spa Suite (Realistic, Robe, Candles, Massage)",
  "Vineyard Wine Cellar (Realistic, Barrels, Stone, Ambient)",
  "Private Cinema Room (Realistic, Velvet, Popcorn, Screen)",
  "Executive Airport Lounge (Realistic, Leather, Quiet)",
  "Beachfront Villa Terrace (Realistic, Sunset, Cocktails)",
  "Mountain Ski Lodge (Realistic, Fireplace, Snow View)",
  "Classic Barbershop (Realistic, Vintage, Leather Chair)",
  "Tech Startup Loft (Realistic, Exposed Brick, Neon Sign)",
  "Newsroom / TV Station (Realistic, Monitors, Busy)",
  "Art Studio / Atelier (Realistic, Canvas, Paint, Light)",
  "Courtroom (Realistic, Wood, Gavel, Formal)",
  "Bakery Kitchen (Realistic, Flour, Oven, Fresh Bread)",
  "Flower Shop (Realistic, Colorful, Fresh, Fragrant)",
  "Bookstore (Realistic, Shelves, Cozy, Quiet)",
  "Vintage Record Store (Realistic, Vinyl, Posters, Retro)",
];

export const SURPRISE_FANTASY = [
  // All fantasy/creative universes for surprise selection
  "Solarpunk (Nature + High Tech)",
  "Cyberpunk 2077 Night City",
  "Space Opera Galaxy",
  "Post-Human Nanotech Realm",
  "Atomic Age Retro-Futurism",
  "Dyson Sphere Constructions",
  "Glitch Art Reality",
  "Ancient Egyptian Futurism",
  "Ancient Egyptian",
  "Cyber-Renaissance",
  "Feudal Japan Samurai Yokai",
  "Dieselpunk Industrial Noir",
  "Aztec/Mayan Sci-Fi",
  "Viking Norse Mythology",
  "Weird Wild West",
  "Bio-Dynamic Jungle",
  "Ethereal Cloud Cities",
  "Underwater Atlantis",
  "Bioluminescent Deep Sea",
  "Crystal Caverns",
  "Fungal/Mushroom Kingdom",
  "Volcanic Wasteland",
  "Arctic Tundra",
  "High Fantasy Magic",
  "Lovecraftian Eldritch Horror",
  "Dark Souls Grim Fantasy",
  "Celestial Angelic Realm",
  "Whimsical Fairy Tale",
  "Film Noir 1940s Detective",
  "Art Deco Metropolis",
  "Vaporwave Aesthetics",
  "Bubblegum Pop Apocalypse",
  "Cyber-Silk Road (Desert Tech)",
  "Bio-Mechanical Giger-esque World",
  "Hyper-Flat 2D Vector Reality",
  "Renaissance Leonardo-punk (Da Vinci Tech)",
  "Deep Space Cyber-Pirate Caribbean",
  "Ice Age High-Tech Survival",
  "Ancient Roman Martian Colony",
  "Gothic Space-Cathedral",
  "Toy-World Micro-Architecture",
  "Surrealist Salvador Dali Dreamscape",
  "Cyber-Noir Neon Tokyo 2099",
  "Steampunk Floating Industrial Islands",
  "Ethereal Glass & Mirror Dimension",
  "Ancient Sumerian Ziggurat High-Tech",
  "Post-Apocalyptic Lush Overgrown NYC",
  "Abstract Geometric Neon Void",
  "1950s Suburban Space-Age Luxury",
  "Cyber-Viking Valhalla (Neon Norse)",
  "Micro-Electronic Circuitry (Shrunken Reality)",
  "Ink-Wash Traditional Samurai Village",
  "Geometric Bauhaus Dimension",
  "Stone-Age Flintstones-esque High Tech",
  "Floating Jade Skyscraper Archipelago",
  "Victorian Clockwork Moon Base",
  "Lava-Flow Obsidian Fortress",
  "Abstract Cubist Business District",
  "Cyber-Himalayan High-Altitude Monastery",
  "Stitched Patchwork & Fabric Kingdom",
  "Cardboard Box DIY Architecture World",
  "Glass & Mirror Shard Labyrinth",
  "Ancient Greek Solar-punk Olympus",
  "Prohibition Era Jazz-Age Apocalypse",
  "Cyber-Aztec Golden Pyramid City",
  "Frozen Liquid Nitrogen Ice Palace",
  "Brutalist Raw Concrete Utopia",
  "Pop Art 1960s Comic Book Reality",
  "Ink & Quill Renaissance Blueprint",
  "Pastel Vaporwave Dreamscape",
  "Post-Human Bio-Organic Living City",
  "Steampunk Airship Armada Sky",
  "Origami & Papercraft Folded Reality",
  "Oil Painting Van Gogh-esque Dream",
  "1920s Great Gatsby Space Gala",
  "Cyber-Punk Arabian Nights (Desert Tech)",
  "Deep Space Renaissance Cathedral",
  "Hyper-Flat 80s Corporate Memphis",
  "Post-Apocalyptic Overgrown Botanical NYC",
  "Ethereal Ghostly Victorian Manor",
  "Modernist Glass Skyscraper clouds",
  "Cybernetic Jungle with Chrome Vines",
  "Submerged Venetian Cyber-Canals",
  "Techno-Alchemist Medieval Laboratory",
  "Infinite Library of Borgesian Towers",
  "Surrealist Melting Clock Desert",
  "Neon-Noir Rainy Detective Alley",
  "Retro-Future Soviet Space Program",
  "High-Fashion Avant Garde Runway World",
  "Interdimensional Crystalline Cavern",
  "Candy-Coated Pastel Goth Land",
  "Cyber-Samurai Ronin Wasteland",
  "Floating Steampunk Clockwork Islands",
  "Bioluminescent Alien Reef (Dry Land)",
  "Industrial Rust-Belt Mecha Factory",
  "Ethereal Silk & Wind Dimension",
  "Hyper-Detailed Macro Insect Kingdom",
  "Cinematic High-Fantasy Dragon Roost",
  "Minimalist Monochrome Zen Space",
  "Ancient Mythology (Divine, Epic, Gold & Marble)",
  "Galactic Odyssey (Deep Space, High-Tech, Cinematic)",
  "Nature Zen (Organic, Minimalist, Earth Tones)",
  "Retro Futurism (80s Synthwave, Neon, Nostalgic)",
  "Steampunk (Victorian, Industrial, Brass & Gears)",
  "Bohemian Jungle (Lush, Vibrant, Tropical)",
  "Halbert Bold (Raw, Gritty Realism)",
  "Caples Story (Classic Editorial Film)",
  "Schwartz Discovery (High-Tech Blueprint)",
  "Cyberpunk Neon City",
  "Minimalist Luxury",
  "Vintage Film Aesthetic",
  "Action Tactical",
  "AI Holographic",
  "3D Claymation / Pixar-like",
  "Underwater Wild West",
  "Victorian Cyber-Opera",
  "Versailles Baroque Space-Court (Gold, Silk & Lace)",
  "Ancient Indian Maharaja Cyber-Palace (Ornate Neon)",
  "Art Nouveau Ethereal Garden (Flowing Curves & Vines)",
  "Heavy Metal 80s Album Cover (Fire, Chrome & Spikes)",
  "Jodorowsky-style 70s Psychedelic Sci-Fi",
  "Slavic Folklore Bogatyr-punk (Wooden Mechs & Runes)",
  "Islamic Geometric Zellige Space-Hub",
  "1990s Lo-Fi Retro-PC Aesthetic (CRT & Dithered)",
  "Alhambra-inspired Moorish Futurism",
  "Stained-Glass Cathedral Orbit-Station",
  "Hong Kong Neon-Drip Walled City Cyber-Noir",
  "Alexandria Eternal (Ancient Library in Space)",
  "Venetian Masquerade High-Tech Gala",
  "Solar-Sail Space Explorer (Cosmic Wind & Canvas)",
  "Analog Casette-punk / Tape-loop Reality",
  "Op-Art Optical Illusion Black & White Void",
  "Fauvism Wild Color Brushstroke World (Matisse Style)",
  "Great Zimbabwe Monolith Stone-Tech",
  "Silent Hill Fog-Noir Dimension (Rust & Ash)",
  "18th Century Nautical Map & Compass World",
  "Mongol Khaganate Nomad-punk (Iron Steppes & Tech)",
  "Medieval Woodcut Illustration Print Style",
  "Steampunk Clockwork Deep-Sea Trench",
  "Floating Lily-pad Bio-Architecture (Water-Lush)",
  "Blueprint Schematics & Drafting-Paper World",
  "Chocolate Factory Industrial Fantasy (Wonka-esque)",
  "Liquid Paint Swirl & Marbled Ink World",
  "Biblical Epic (Parting Seas & Celestial Fire)",
  "Subterranean Magma-punk Forge & Obsidian",
  "1970s Funk-and-Groove Chrome Space Station",
  "Hyper-Luxury Cloud-Yacht Sky Penthouse",
  "Wind-Turbine Cloud-City (Aerial Power-punk)",
  "Street Art Graffiti Brick Reality (Urban Grunge)",
  "Porcelain Dollhouse Micro-Gothic (Fine Ceramic)",
  "Bioluminescent Sky-Jellyfish Floating Station",
  "Ancient African Kingdom of Kush Futurism",
  "Space-Cathedral Altar of Pure White Light",
  "Victorian San Francisco Gold-Rush-punk",
  "Miniature Model-Train Landscape Reality",
  "Eternal Monsoon Rainy Blade-Runner Alley",
  "Wizard's Tower Library (Fantasy, Spellbooks, Arcane)",
  "Dragon's Treasure Hoard (Fantasy, Gold, Fire, Scales)",
  "Enchanted Garden (Fantasy, Flowers, Butterflies, Magic)",
  "Clockwork Toy Factory (Fantasy, Mechanical, Whimsical)",
  "Candy Kingdom (Fantasy, Sweet, Colorful, Desserts)",
];

// Legacy support - combined lists
export const UNIVERSES = [...REALISTIC_UNIVERSES, ...FANTASY_UNIVERSES];
export const SURPRISE_UNIVERSES = [...SURPRISE_REALISTIC, ...SURPRISE_FANTASY];

// Helper function for random universe by mode
// Enhanced: Now accepts optional niche/audience context for smarter matching
// Helper function for random universe by mode — NOW USES STRUCTURED DATABASE
import { getSmartRandomUniverse, REALISTIC_UNIVERSES as DB_REALISTIC, FANTASY_UNIVERSES as DB_FANTASY, ALL_UNIVERSES as DB_ALL, type UniverseEntry } from './universeDatabase';

export const getRandomUniverse = (mode?: 'realistic' | 'fantasy', context?: { targetAudience?: string; productName?: string; challenges?: string; offerType?: string; productCategory?: string }) => {
  const styleFamily = mode || 'realistic';
  const entry = getSmartRandomUniverse(styleFamily as 'realistic' | 'fantasy', {
    niche: context?.productCategory,
    offerType: context?.offerType,
    targetAudience: context?.targetAudience,
    productName: context?.productName,
  });
  return entry.name;
};

// ─── OFFER TYPES (restructured with categories + creative modes) ─────────
export const OFFER_TYPES = [
  "Live Event",
  "Free Guide",
  "Mini-Course",
];

// Maps offer type → tab (new v2 system)
export const OFFER_CATEGORY_MAP: Record<string, string> = {
  'Live Event': 'live_events',
  'Free Webinar': 'live_events',
  'Paid Workshop': 'live_events',
  'Challenge': 'live_events',
  'Free Guide': 'free_guide',
  'Mini-Course': 'mini_course',
};

// Creative modes available per tab (new v2 system — replaces old category-based OFFER_CREATIVE_MODES)
import { CREATIVE_MODE_CATALOG, CREATIVE_TABS, getModesForTab, type CreativeTab } from './creativeResolver';
export { CREATIVE_TABS };

export const OFFER_CREATIVE_MODES: Record<string, { id: string; labelEn: string; labelAr: string; icon: string; description: string; boxCLabel?: string; boxCHint?: string }[]> = Object.fromEntries(
  CREATIVE_TABS.map(tab => [
    tab.id,
    getModesForTab(tab.id).map(m => ({
      id: m.id,
      labelEn: m.labelEn,
      labelAr: m.labelAr,
      icon: m.icon,
      description: m.description,
      boxCLabel: m.boxCLabel,
      boxCHint: m.boxCHint,
    }))
  ])
);

// ─── CREATIVE MODE CONFLICT MAP ─────────────────────────────────────────
// Now backed by creativeResolver.ts — these exports are for backward compatibility
import { CONFLICT_MAP as _RESOLVER_CONFLICTS, HOOK_ANGLE_CREATIVE_CONFLICTS as _RESOLVER_HOOK_CONFLICTS } from './creativeResolver';

export const CREATIVE_MODE_CONFLICTS: Record<string, string[]> = Object.fromEntries(
  Object.entries(_RESOLVER_CONFLICTS).map(([k, v]) => [k, [...v]])
);

// Hook angle conflicts with creative modes
// If the user selected a hook angle, these creative modes are blocked
export const HOOK_ANGLE_MODE_CONFLICTS: Record<string, string[]> = Object.fromEntries(
  Object.entries(_RESOLVER_HOOK_CONFLICTS).map(([k, v]) => [k, [...v]])
);

// RETARGETING_ANGLES removed — angle is now auto-selected via getBestAngleForObjection()

export const RETARGETING_OBJECTIONS = RETARGETING_OBJECTION_DATA.map(obj => ({
  id: obj.id,
  label: obj.label,
  labelAr: obj.labelAr,
  needsProof: obj.needsProof,
}));

// ─── CONTENT LANGUAGE OPTIONS ───────────────────────────────────────────────
export const AD_LANGUAGES = [
  { id: 'ar_fusha', label: 'العربية الفصحى', flag: '🌍', group: 'ar', groupLabel: 'العربية' },
  { id: 'ar_egyptian', label: 'اللهجة المصرية', flag: '🇪🇬', group: 'ar', groupLabel: 'العربية' },
  { id: 'ar_gulf', label: 'اللهجة الخليجية', flag: '🇸🇦', group: 'ar', groupLabel: 'العربية' },
  { id: 'ar_levantine', label: 'اللهجة الشامية', flag: '🇱🇧', group: 'ar', groupLabel: 'العربية' },
  { id: 'ar_iraqi', label: 'اللهجة العراقية', flag: '🇮🇶', group: 'ar', groupLabel: 'العربية' },
  { id: 'ar_maghreb', label: 'اللهجة المغاربية', flag: '🇲🇦', group: 'ar', groupLabel: 'العربية' },
  { id: 'en', label: 'English', flag: '🇺🇸', group: 'en', groupLabel: 'English' },
  { id: 'fr', label: 'Français', flag: '🇫🇷', group: 'fr', groupLabel: 'Français' },
  { id: 'es', label: 'Español', flag: '🇪🇸', group: 'es', groupLabel: 'Español' },
  { id: 'de', label: 'Deutsch', flag: '🇩🇪', group: 'de', groupLabel: 'Deutsch' },
  { id: 'tr', label: 'Türkçe', flag: '🇹🇷', group: 'tr', groupLabel: 'Türkçe' },
  { id: 'pt', label: 'Português', flag: '🇧🇷', group: 'pt', groupLabel: 'Português' },
] as const;

// Language prompt instructions for Gemini
export const getLanguageInstruction = (langId: string): string => {
  const map: Record<string, string> = {
    ar_fusha: 'Write ALL text in Modern Standard Arabic (الفصحى). Use professional marketing Arabic. RTL text.',
    ar_egyptian: 'Write ALL text in Egyptian Arabic dialect (اللهجة المصرية). Casual, warm, conversational. RTL text.',
    ar_gulf: 'Write ALL text in Gulf Arabic dialect (اللهجة الخليجية). RTL text.',
    ar_levantine: 'Write ALL text in Levantine Arabic dialect (اللهجة الشامية). RTL text.',
    ar_iraqi: 'Write ALL text in Iraqi Arabic dialect (اللهجة العراقية). RTL text.',
    ar_maghreb: 'Write ALL text in Maghrebi Arabic dialect (اللهجة المغاربية). RTL text.',
    en: 'Write ALL text in English. Use professional marketing English.',
    fr: 'Write ALL text in French. Use professional marketing French.',
    es: 'Write ALL text in Spanish. Use professional marketing Spanish.',
    de: 'Write ALL text in German. Use professional marketing German.',
    tr: 'Write ALL text in Turkish. Use professional marketing Turkish.',
    pt: 'Write ALL text in Portuguese. Use professional marketing Portuguese.',
  };
  return map[langId] || map['ar_fusha'];
};

// ─── FIELD EXAMPLES (for "Get Example" buttons) ─────────────────────────────
export const FIELD_EXAMPLES: Record<string, { label: string; value: string }[]> = {
  transformation: [
    { label: 'Course Creator', value: 'Selling their training services for $1000+ without needing live sessions, using a marketing system that funds its own ads' },
    { label: 'Coach / Consultant', value: 'Attracting premium clients who pay $2000+ per engagement without cold outreach or discounting' },
    { label: 'E-commerce', value: 'Scaling their store to $50K/month with a proven ad system that turns $1 into $5 in profit' },
  ],
  challenges: [
    { label: 'Price Resistance', value: 'Clients constantly push back on pricing, compare them to cheaper alternatives, and refuse to pay what their expertise is worth' },
    { label: 'Invisible Expert', value: 'They have deep expertise but no online presence — lost in a sea of louder, less qualified competitors' },
    { label: 'Burnout & Low ROI', value: 'Spending hours creating content and running ads with little to no return, feeling stuck trading time for money' },
  ],
  cta: [
    { label: 'Enrollment', value: 'Enroll Now' },
    { label: 'Free Resource', value: 'Download Free Guide' },
    { label: 'Discovery Call', value: 'Book Your Free Call' },
  ],
};