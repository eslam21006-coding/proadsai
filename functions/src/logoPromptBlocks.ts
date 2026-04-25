// functions/src/logoPromptBlocks.ts — single source of truth for HOTFIX-E prompt constants

export const SCREEN_CONTENT_BAN_BLOCK = `
═════════════════════════════════════════════════════════════════════
ABSOLUTE RULE — DEVICE SCREEN CONTENT BAN
═════════════════════════════════════════════════════════════════════
NEVER render any of the following on any device display
(laptop screen, desktop monitor, tablet front, phone front,
smartwatch face, or any other device screen visible in the scene):

- Text of any kind (UI text, labels, body copy, captions, watermarks)
- Logos (brand marks, app icons, software logos, partner logos)
- Charts, graphs, dashboards, KPI cards, metric tiles
- Application user interfaces (web apps, native apps, OS chrome)
- Notification badges, status bars, system text
- Code editors, terminal output, slide decks with content

Device screens MUST be one of:
- Completely blank dark screen (off-state look)
- Abstract gradient (single color or smooth color blend, NO content)
- Out-of-focus soft glow (warm or cool, no discernible shapes)
- Dimmed unreadable blur (suggests on-state without showing anything readable)

NO EXCEPTIONS. This rule overrides any earlier instruction that
would have placed content on a screen.
═════════════════════════════════════════════════════════════════════
`;

export const UI_LOGO_INSTRUCTION_BLOCK = `
═════════════════════════════════════════════════════════════════════
UI LOGO PLACEMENT INSTRUCTION
═════════════════════════════════════════════════════════════════════
For each logo marked as UI mode:
Do NOT render this logo in the image. Leave the specified zone CLEAR
and unobstructed. It will be composited post-render for pixel-perfect
accuracy. The zone must be completely empty — no overlapping elements,
no partial coverage, no visual content of any kind.
═════════════════════════════════════════════════════════════════════
`;

export const ENVIRONMENTAL_LOGO_INSTRUCTION_BLOCK = `
═════════════════════════════════════════════════════════════════════
ENVIRONMENTAL LOGO PLACEMENT INSTRUCTION
═════════════════════════════════════════════════════════════════════
For each logo marked as environmental mode:
Render this logo as a physical object in the scene — on the {surface}.
Match the object's perspective, lighting, and material.
Keep it subtle and natural — part of the environment, not an overlay.
Use the uploaded logo image as the visual reference.
═════════════════════════════════════════════════════════════════════
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
top-right | top-center | bottom-left | bottom-right |
bottom-center | center), widthPct (5-18, default 12), opacity
(0.85-1.0, default 1.0)

ENVIRONMENTAL PLACEMENT FIELDS: logoIndex, mode: 'environmental',
surface (coffee_mug | laptop_lid | wall_art | tshirt_chest |
signage_behind | book_cover | tablet_back | portfolio_leather |
merch_canvas_tote | branded_box or any fitting surface name),
environmentalContext (free-form scene description)
═════════════════════════════════════════════════════════════════════
`;
