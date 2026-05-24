// functions/src/logoPromptBlocks.ts — single source of truth for HOTFIX-E prompt constants

export const SCREEN_CONTENT_BAN_BLOCK = `
═════════════════════════════════════════════════════════════════════
DEVICE SCREEN CONTENT RULE
═════════════════════════════════════════════════════════════════════
Every device display (laptop screen, desktop monitor, tablet front,
phone front, smartwatch face, or any other screen visible in the scene)
SHOWS contextually relevant interface content that fits the offer:

- A clean online-course / lesson / learning-platform interface
- A simple, generic dashboard or progress view (illustrative tiles)
- A native-app or web-app UI that matches the product
- A relevant website or landing page

Render the on-screen interface realistically but keep it SOFT and
SECONDARY — gentle screen glow, slight perspective, lightly out of
focus — so it reads as a believable working screen without competing
with the headline.

The screen shows interface (UI) content ONLY. Keep these OFF the
screen surface — they are handled elsewhere in the composition:
- Brand logos, wordmarks, app icons, or partner marks
- The ad's headline, subhead, CTA, captions, or any text overlay

Brand logos live in their assigned composited zone or on a physical
scene surface; the ad copy lives in the headline layer — never on a
device screen.
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
