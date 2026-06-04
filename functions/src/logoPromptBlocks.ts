// functions/src/logoPromptBlocks.ts — single source of truth for HOTFIX-E prompt constants

export const SCREEN_CONTENT_BAN_BLOCK = `
DEVICE SCREEN CONTENT RULE:
Any device screen in the scene (laptop, monitor, tablet, phone, smartwatch) shows contextually relevant interface content for the offer — a clean course/lesson UI, a simple dashboard, an app/web UI, or a relevant landing page. Render it realistically but SOFT and SECONDARY (gentle glow, slight perspective, lightly out of focus) so it never competes with the headline.
The screen shows interface (UI) content ONLY. Keep OFF the screen: Brand logos/wordmarks/app icons and the ad's headline/subhead/CTA/captions. Logos live in their composited zone or on a physical scene surface; ad copy stays in the headline layer — never on a screen.
`;

export const UI_LOGO_INSTRUCTION_BLOCK = `
UI LOGO PLACEMENT: For each UI-mode logo, do NOT render it. Leave the specified zone CLEAR and unobstructed (no overlapping elements, no partial coverage) — it is composited post-render for pixel-perfect accuracy.
`;

export const ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK = `
ENVIRONMENTAL LOGO PLACEMENT: For each environmental-mode logo, render it as a physical object on the {surface}, matching the scene's perspective, lighting, and material. Keep it subtle and natural — part of the environment, not an overlay. Use the uploaded logo image as reference.
`;

export const MODE_SELECTION_HINT_BLOCK = `
═════════════════════════════════════════════════════════════════════
LOGO MODE SELECTION GUIDANCE
═════════════════════════════════════════════════════════════════════
For each uploaded logo, assign a placement mode:

MODE RULES BY CREATIVE STYLE:
- Minimalist, Corporate, Conference-style ads → prefer 'ui' mode
  (corner badge / top-bar lockup / CTA-button mark)
- Lifestyle, Authentic, Documentary, Product-focused ads → prefer
  'environmental' mode (logo on a physical surface in the scene)
- Text-only ads → no logos at all

CAROUSEL DEFAULT MIX (5+ slides):
- Slide 1: 'ui' mode for brand recognition
- Middle slides: 'environmental' mode for storytelling
- Last slide: 'ui' mode for CTA reinforcement

CAPS:
- At most 2 UI placements per single ad
- At most 3 environmental placements per single ad
- Never exceed the number of uploaded logos

UI PLACEMENT FIELDS: logoIndex, mode: 'ui', zone (top-left |
top-right | top-center | middle-left | middle-right |
middle-center | bottom-left | bottom-right | bottom-center |
center), widthPct (5-18, default 12), opacity (0.85-1.0,
default 1.0)

ENVIRONMENTAL PLACEMENT FIELDS: logoIndex, mode: 'environmental',
surface (coffee_mug | laptop_lid | wall_art | tshirt_chest |
signage_behind | book_cover | tablet_back | portfolio_leather |
merch_canvas_tote | branded_box or any fitting surface name),
environmentalContext (free-form scene description)
═════════════════════════════════════════════════════════════════════
`;
