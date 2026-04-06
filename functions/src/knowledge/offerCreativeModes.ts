// functions/src/knowledge/offerCreativeModes.ts
// Deep prompt templates for each creative mode — controls visual layout, composition, and copy psychology

// ─── OFFER TYPE HOOK PSYCHOLOGY ──────────────────────────────────────────
// Controls HOW the hook sells based on what's being offered
export const OFFER_HOOK_PSYCHOLOGY: Record<string, string> = {
    'Free Webinar': `OFFER TYPE: FREE WEBINAR
Sell the EVENT, not the product. The webinar IS the offer.
- Hook must create urgency around the DATE/TIME
- Mention what they'll LEARN (3 specific takeaways)
- Social proof: "Join 500+ coaches this Thursday"
- CTA language: "Register Free", "Save Your Seat", "Join Live"
- NEVER sell the paid product in the hook — sell the FREE event
- The webinar title should be the headline or subheadline`,

    'Paid Workshop': `OFFER TYPE: PAID WORKSHOP
Sell the TRANSFORMATION achievable in X hours.
- Hook must promise a specific outcome: "Walk out with your complete funnel built"
- Justify the price by comparing to the VALUE of the outcome
- Limited seats create natural scarcity
- CTA language: "Reserve Your Seat", "Enroll Now", "Secure Your Spot"
- Mention the format: "Live, hands-on, Q&A included"`,

    'Challenge': `OFFER TYPE: CHALLENGE
Sell the EXPERIENCE + community + daily momentum.
- Hook must tease Day 1: "By tonight, you'll have..."
- Emphasize the GROUP energy: "Alongside 200+ professionals"
- Daily structure creates commitment: "5 days, 5 breakthroughs"
- CTA language: "Join the Challenge", "Start Day 1", "I'm In"
- Make it feel like a MOVEMENT, not a course`,

    'Free Guide': `OFFER TYPE: FREE GUIDE / EBOOK
Sell the SECRET inside the guide. Pure curiosity.
- Hook must tease ONE powerful insight from the guide
- "Chapter 3 alone will change how you think about pricing"
- Emphasize it's FREE — remove all friction
- CTA language: "Download Free", "Get Your Copy", "Send It To Me"
- Position it as VALUABLE content they'd pay for but get free`,

    'Direct Sale': `OFFER TYPE: DIRECT SALE
Sell the RESULT. Price anchoring. Guarantee. Urgency.
- Hook must focus on the transformation, not features
- Use price anchoring: compare to the cost of NOT buying
- Include guarantee/risk reversal when possible
- CTA language: "Buy Now", "Get Instant Access", "Start Today"
- Stack value: list everything they get`,

    'Mini-Course': `OFFER TYPE: MINI-COURSE / ONLINE COURSE
Sell the SKILL they'll master. Be specific about outcomes.
- Hook must promise a specific, learnable skill
- "In 4 modules, you'll build your complete sales system"
- Show the curriculum progression: beginner → expert
- CTA language: "Start Learning", "Enroll Now", "Begin Module 1"
- Differentiate from free content: "Structured, step-by-step, proven"`,

    'SaaS Trial': `OFFER TYPE: SAAS TRIAL / SOFTWARE
Sell the PROBLEM it eliminates. Show, don't tell.
- Hook must name the EXACT frustration the tool removes
- "Stop spending 4 hours on X — do it in 4 minutes"
- Emphasize "Try Free" — zero risk, no credit card
- CTA language: "Try Free", "Start Your Trial", "See It In Action"
- If possible, show a before/after of using the tool`,

    'Membership': `OFFER TYPE: MEMBERSHIP / COMMUNITY
Sell BELONGING + insider access. FOMO of being outside.
- Hook must paint what members GET that non-members don't
- "Inside, we share the strategies we'd never post publicly"
- Show member count or social proof: "1,200 members and counting"
- CTA language: "Join the Community", "Get Access", "Apply Now"
- Create the feeling of an exclusive club they WANT to be part of`,
};

// ─── CREATIVE MODE LAYOUT TEMPLATES ──────────────────────────────────────
// Controls HOW the ad looks based on the creative mode selected
export interface CreativeModeLayout {
    conceptInstruction: string;   // For generateConcepts — describes the visual layout
    buildPlanInstruction: string; // For generateBuildPlan — composition rules
    renderInstruction: string;    // For coreDesignRules — image rendering specifics
}

export const CREATIVE_MODE_LAYOUTS: Record<string, CreativeModeLayout> = {

    standard_hero: {
        conceptInstruction: '',  // Default — no override needed
        buildPlanInstruction: '',
        renderInstruction: '',
    },

    event_ticket: {
        conceptInstruction: `CREATIVE MODE: EVENT TICKET DESIGN
The ad should resemble a physical or digital event ticket. NOT a standard hero layout.
MANDATORY LAYOUT:
- TOP STRIP: Event name / webinar title in bold typography
- CENTER: Speaker photo (from Box A) in a circular or premium bordered frame
- BELOW PHOTO: Speaker name and credentials (1 line)
- INFO ROW: Date | Time | "Live" badge — arranged horizontally
- BOTTOM: CTA button with seat count ("Only 47 seats left")
- DECORATIVE: Ticket perforations on edges, barcode element, or ticket stub effect
- BACKGROUND: Dark premium (navy/black) with gold or brand-color accents
The Hero is NOT standing in an environment — they are FRAMED as a speaker on a ticket.
PREMIUM EXECUTION:
- Ticket must feel like a REAL designed ticket — perforated edges, barcode/QR, "ADMIT ONE" styling
- Gold/metallic accents on dark background (navy, charcoal, or black)
- Speaker photo in a BORDERED circular or diamond frame with glow effect
- Date/time row should look like printed ticket metadata, not floating text
INVALID:
- ❌ A standard hero standing in an office with a "register" CTA = NOT a ticket
- ❌ Plain text event details on a generic background = NOT a ticket
- ❌ Hero in full body standing pose = NOT a ticket (head/shoulders only in frame)`,
        buildPlanInstruction: `TICKET LAYOUT: Frame the hero in a circular or bordered portrait (NOT full body). 
Add event details as text zones: title at top, date/time in middle, CTA at bottom.
Decorative ticket elements: perforations, barcode, "ADMIT ONE" style accents.
Dark premium background with metallic accents. Speaker name below portrait.`,
        renderInstruction: `EVENT TICKET MODE — PREMIUM EXECUTION:
- Design as a REAL premium event ticket — NOT a standard ad with event text
- Hero: head/shoulders ONLY in circular/diamond bordered frame with glow
- Ticket structure: event title strip at top, portrait center, metadata row, CTA bottom
- Decorative: ticket perforations, barcode element, subtle metallic border
- Background: dark premium (navy/charcoal/black) with gold or brand-color accents
- For 9:16 (tall canvas): use extra height for more ticket detail — perforated top/bottom edges, larger portrait, wider metadata area
- For 1:1 (square): compact ticket with tighter spacing, portrait smaller
INVALID SUBSTITUTES:
- ❌ Hero standing in an office/environment IS NOT a ticket design
- ❌ Plain text event details on gradient IS NOT a ticket
- ❌ Full-body hero pose IS NOT valid — must be head/shoulders in frame`,
    },

    speaker_card: {
        conceptInstruction: `CREATIVE MODE: SPEAKER CARD DESIGN
The hero is positioned as a KEYNOTE SPEAKER on a stage or at a podium.
MANDATORY LAYOUT:
- ENVIRONMENT: Stage, conference hall, TED-talk style red carpet, spotlight
- HERO POSE: Standing confidently, gesturing, speaking to audience
- AUDIENCE HINT: Blurred heads or silhouettes in foreground (subtle)
- TEXT PLACEMENT: Speaker name + title overlaid like a TV lower-third
- CREDENTIALS BAR: "7 Years | 500+ Clients | Author of..." strip
- CTA: "Register" or "Save Your Seat" prominent at bottom
PREMIUM EXECUTION:
- Stage lighting: dramatic spotlight with rim light on hero, dark surroundings
- Audience silhouettes in foreground should feel real (blurred heads, not geometric shapes)
- Credentials bar styled like a TV news lower-third: semi-transparent bar, clean typography
- The stage should be a REAL environment — podium, screen behind speaker, conference branding
INVALID:
- ❌ A standard portrait with name text = NOT a speaker card
- ❌ Hero sitting at a desk = NOT a speaker card (must be STAGE environment)
- ❌ Plain name text without credentials bar structure = NOT a speaker card`,
        buildPlanInstruction: `SPEAKER CARD: Hero on stage/podium, speaking posture with confident gesture.
Lower-third credentials bar (semi-transparent, TV-news style) with name + credentials.
Audience silhouettes in foreground blur. Stage lighting with dramatic spotlight on hero.
For 9:16: full-height stage with hero center, audience visible at bottom, credentials bar across.`,
        renderInstruction: `SPEAKER CARD MODE — PREMIUM EXECUTION:
- Environment: REAL conference stage — podium, spotlights, dark auditorium
- Hero: speaking pose (gesturing, not just standing), dramatic rim lighting
- Credentials bar: styled like TV lower-third — semi-transparent bar, name + "7 Years | 500+ Clients"
- Audience: blurred head silhouettes in foreground, subtle but present
- For 9:16: use full height for dramatic stage depth — audience at bottom, hero in spotlight center
- For 1:1: tighter crop, hero upper half, credentials bar across bottom third
INVALID SUBSTITUTES:
- ❌ A standard portrait with overlaid name text IS NOT a speaker card
- ❌ Hero sitting at desk IS NOT a speaker card — requires STAGE environment
- ❌ Plain text name without designed credentials bar IS NOT a speaker card`,
    },



    webinar_screen: {
        conceptInstruction: `CREATIVE MODE: WEBINAR SCREEN DESIGN
A laptop or screen showing the webinar title with a "LIVE" badge.
MANDATORY LAYOUT:
- DEVICE: Open laptop, desktop monitor, or tablet (realistic, angled)
- SCREEN CONTENT: Webinar title displayed on the screen
- "LIVE" BADGE: Red dot + "LIVE" indicator on screen
- HERO: Standing next to the screen or reflected in it, presenting
- DATE/TIME: Prominent below or beside the screen
- CTA: "Join Live" or "Register Free" button
PREMIUM EXECUTION:
- The device must be a REALISTIC rendered laptop/monitor — not a flat rectangle
- Screen content: the webinar title must be LEGIBLE on the screen, styled like a real landing page
- LIVE badge: red dot + "LIVE" text, positioned on screen corner (like a real broadcast overlay)
- The screen should show ACTUAL content structure (title + subtitle + speaker photo thumbnail)
INVALID:
- ❌ A generic laptop as a background prop = NOT a webinar screen
- ❌ A blank or solid-color screen = NOT a webinar screen
- ❌ Hero holding a closed laptop = NOT a webinar screen`,
        buildPlanInstruction: `WEBINAR SCREEN: Realistic laptop/monitor showing webinar title as legible screen content.
"LIVE" red badge on screen corner. Screen shows title + subtitle structure (like a real page).
Hero standing beside it in presenting gesture. Date and time below screen. Registration CTA.
For 9:16: screen can be larger, using height for more detail on-screen.`,
        renderInstruction: `WEBINAR SCREEN MODE — PREMIUM EXECUTION:
- Device: REALISTIC angled laptop/monitor — not a flat rectangle or clipart
- Screen must show LEGIBLE content: webinar title as a styled heading, subtitle line, speaker thumbnail
- LIVE badge: red dot + "LIVE" text on screen corner (broadcast overlay style)
- Hero: presenting gesture beside screen, NOT blocking the screen content
- Date/time: styled as a metadata row below the screen
- For 9:16: larger screen using vertical space, more on-screen detail visible
- For 1:1: screen center, hero to one side, tighter layout
INVALID SUBSTITUTES:
- ❌ A generic laptop as background prop IS NOT a webinar screen — screen must show title
- ❌ A blank/solid-color screen IS NOT a webinar screen
- ❌ Hero holding a closed or off laptop IS NOT a webinar screen`,
    },

    book_mockup: {
        conceptInstruction: `CREATIVE MODE: BOOK/PDF MOCKUP DESIGN
A 3D book or PDF floating in the scene.
MANDATORY LAYOUT:
- BOOK: 3D perspective book/ebook with the cover visible
- If Box C has a cover image: USE IT as the book cover texture
- If no Box C: Generate a professional book cover matching the product name
- HERO: Standing beside the book, holding it, or with it floating nearby
- "FREE DOWNLOAD" BADGE: Prominent sticker/ribbon
- CHAPTER TEASE: 1-2 chapter titles floating near the book as callout bubbles
- CTA: "Download Free" or "Get Your Copy"
PREMIUM EXECUTION:
- Book must be a REAL 3D rendered mockup with perspective, shadow, and depth
- Cover should have title text, professional design, and author name area
- "Free" badge: ribbon or sticker overlay on the book corner
- Chapter callout bubbles should float beside the book with arrow/pointer
INVALID:
- ❌ A flat rectangular image = NOT a book mockup (needs 3D perspective)
- ❌ A device screen showing a PDF page = NOT a book mockup (that's device_mockup)
- ❌ A single text title without visual book object = NOT a book mockup`,
        buildPlanInstruction: `BOOK MOCKUP: Design a REAL 3D book with perspective, depth shadow, and visible cover.
Use Box C image as cover texture if available, otherwise generate matching cover design.
"Free Download" badge as ribbon/sticker on book corner.
1-2 chapter callout bubbles floating beside the book. Hero beside or holding the book.
For 9:16: larger book mockup using vertical space, hero beside with more room for callouts.`,
        renderInstruction: `BOOK MOCKUP MODE — PREMIUM EXECUTION:
- Book: REAL 3D perspective mockup with depth, shadow, and visible spine
- Cover: professional design with title text (use Box C if provided as texture)
- "FREE" badge: ribbon or sticker overlay on book corner
- Chapter callouts: 1-2 floating bubbles with chapter titles beside the book
- Hero: holding the book or standing beside it, presenting gesture
- For 9:16: larger book using vertical space, callout bubbles stacked vertically
- For 1:1: book center, hero to one side, callouts above or below
INVALID SUBSTITUTES:
- ❌ A flat rectangular image IS NOT a book mockup — needs 3D perspective
- ❌ A device screen showing a PDF IS NOT a book mockup — that's device_mockup
- ❌ A text title without visual book object IS NOT a book mockup`,
    },

    device_mockup: {
        conceptInstruction: `CREATIVE MODE: DEVICE MOCKUP DESIGN
Guide/content shown on a tablet or phone screen.
MANDATORY LAYOUT:
- DEVICE: Realistic tablet or phone, slightly angled
- SCREEN: Shows the guide content (from Box C) or a generated preview
- HERO: Holding the device or standing beside it
- KEY INSIGHT: One powerful line from the guide as a callout
- CTA: "Download Free" or "Read Now"
PREMIUM EXECUTION:
- Device must be a REALISTIC rendered device (not a flat rectangle)
- Screen must show ACTUAL content — text, sections, or thumbnails (not blank/solid)
- Key insight callout: floating bubble with arrow pointing to the device
- The device should feel like a REAL product screenshot being showcased
INVALID:
- ❌ A generic phone as a prop in hero's hand with no visible screen content = NOT a device mockup
- ❌ A blank/off screen = NOT a device mockup
- ❌ A flat image without device frame = NOT a device mockup`,
        buildPlanInstruction: `DEVICE MOCKUP: Realistic tablet/phone with VISIBLE guide content on screen.
Use Box C as screen content if available. Device angled for perspective depth.
Key insight callout bubble floating beside device. Hero holding or presenting device.
For 9:16: device can be larger showing more screen content.`,
        renderInstruction: `DEVICE MOCKUP MODE — PREMIUM EXECUTION:
- Device: REALISTIC rendered tablet or phone — with bezel, shadow, and perspective angle
- Screen: must show VISIBLE content (text layout, section previews, or guide thumbnails) — NOT blank
- If Box C provided: use as screen content texture
- Key insight: floating callout bubble beside device with pointer/arrow
- Hero: holding the device or presenting beside it
- For 9:16: larger device using vertical space, more screen content visible
- For 1:1: device center, hero to side, callout above or below
INVALID SUBSTITUTES:
- ❌ A generic phone prop with no screen content IS NOT a device mockup
- ❌ A blank or off screen IS NOT a device mockup
- ❌ A flat image without device frame IS NOT a device mockup`,
    },

    preview_card: {
        conceptInstruction: `CREATIVE MODE: PREVIEW CARD DESIGN
Table of contents or chapter preview layout.
MANDATORY LAYOUT:
- CARD STYLE: Clean card/panel floating in the scene
- CONTENT: 3-5 chapter/section titles listed with icons
- HIGHLIGHT: One chapter marked as "Most Popular" or "Game Changer"
- HERO: Behind or beside the card
- VALUE BADGE: "47 Pages" or "12 Chapters" count
- CTA: "Get the Full Guide"`,
        buildPlanInstruction: `PREVIEW CARD: Floating card showing chapter list.
3-5 items listed. One highlighted. Hero behind card. Page count badge.`,
        renderInstruction: `PREVIEW CARD MODE: Clean floating card with chapter list.
Hero behind/beside it. One chapter highlighted. Value count badge.`,
    },

    platform_screenshot: {
        conceptInstruction: `CREATIVE MODE: PLATFORM SCREENSHOT DESIGN
Course dashboard shown on screen.
MANDATORY LAYOUT:
- DEVICE: Laptop showing course platform dashboard
- SCREEN: Box C screenshot as content, or generated dashboard
- METRICS: "12 Videos | 47 Students | 4.9 Stars" info bar
- HERO: Beside the laptop or in picture-in-picture
- CTA: "See Inside" or "Start Free"`,
        buildPlanInstruction: `PLATFORM SCREENSHOT: Laptop showing course dashboard.
Use Box C as screen if available. Metrics bar. Hero beside device.`,
        renderInstruction: `PLATFORM SCREENSHOT MODE: Laptop displaying course platform.
Student count and rating bar. Hero beside it.`,
    },

    certificate: {
        conceptInstruction: `CREATIVE MODE: CERTIFICATE DESIGN
Completion certificate as a teaser.
MANDATORY LAYOUT:
- CERTIFICATE: Elegant framed certificate, slightly angled
- CONTENT: "[Student Name]" placeholder, course title, signature
- SEAL: Gold/embossed completion seal
- HERO: Holding the certificate proudly
- TEXT: "Earn Your Certificate" or "Certified [Skill]"
- CTA: "Get Certified" or "Start Your Journey"`,
        buildPlanInstruction: `CERTIFICATE: Elegant certificate held by hero.
Gold seal. Course name on certificate. "Get Certified" CTA.`,
        renderInstruction: `CERTIFICATE MODE: Elegant completion certificate.
Hero holding it proudly. Gold embossed seal. Course name visible.`,
    },

    premium_package: {
        conceptInstruction: `CREATIVE MODE: PREMIUM PACKAGE DESIGN
Luxury product card with price and premium feel.
MANDATORY LAYOUT:
- PRODUCT: Premium box, package, or product visualization
- If Box C provided: use as the product image
- PRICE TAG: Prominent but elegant price display
- HERO: Presenting the product or standing with authority beside it
- VALUE MARKERS: "Includes X, Y, Z" small icons
- LUXURY FEEL: Gold accents, dark background, premium typography
- CTA: "Get Access" or "Buy Now"`,
        buildPlanInstruction: `PREMIUM PACKAGE: Luxury product visualization.
Use Box C as product image if available. Price tag. Gold accents. Dark premium background.`,
        renderInstruction: `PREMIUM PACKAGE MODE: Luxury product card design.
Premium packaging visual. Price displayed elegantly. Gold accents on dark background.`,
    },

    value_stack: {
        conceptInstruction: `CREATIVE MODE: VALUE STACK DESIGN
Stacked bonuses visualization showing everything included.
MANDATORY LAYOUT:
- STACK: 3-5 items stacked vertically or fanned out as DISTINCT CARD ROWS
- Each item: icon + name + individual value ("$297 value")
- TOTAL VALUE: Large "Total Value: $2,497" at bottom
- YOUR PRICE: Contrasting "Today: $97" or actual price
- HERO: Behind the stack or presenting it (NOT blocking the stack)
- CTA: "Get Everything" or "Claim Your Bundle"
PREMIUM EXECUTION:
- Each stack item must be a VISUALLY DISTINCT card/row with its own background, icon, and label
- Cards should have subtle depth (shadow or slight overlap) — NOT a flat text list
- Use numbered badges or checkmark icons for each item
- Total value vs price should use contrasting colors (e.g., crossed-out red vs bold green)
- The stack zone should occupy at least 30-40% of the canvas — it is the MODE PAYLOAD
INVALID (do NOT produce these):
- ❌ A generic hero holding a tablet/laptop with tiny text = NOT a value stack
- ❌ A single product image with a price label = NOT a value stack
- ❌ Text-only bullet list without visual card structure = NOT a value stack
- ❌ Hero dominating 80%+ with a tiny corner stack = NOT a value stack`,
        buildPlanInstruction: `VALUE STACK: Design 3-5 DISTINCT stacked item cards (NOT a text list).
Each card: icon/number + item name. Cards should overlap or fan out with depth.
Total value vs price comparison must be prominent (crossed-out vs bold).
Hero presents but does NOT block the stack. Stack occupies 30-40% of canvas.`,
        renderInstruction: `VALUE STACK MODE — PREMIUM EXECUTION:
The stack is the HERO of this layout, not a decoration beside a hero portrait.
- Render 3-5 DISTINCT CARD ROWS with visible depth (shadows, slight overlap, or layered cards)
- Each card: numbered badge or checkmark icon + item label text
- Cards must be READABLE — large enough to scan without zooming
- Total value area: show price comparison zone as a styled panel (overlay will add exact numbers)
- Hero occupies 40-50% but the stack occupies 30-40% — balanced, not hero-dominated
- For 9:16 (tall canvas): stack cards vertically with MORE spacing; use the extra height for larger cards
- For 1:1 (square): stack below hero as a horizontal strip or 2-column mini-grid
INVALID SUBSTITUTES (these FAIL the mode):
- ❌ A branded prop (tablet/laptop/phone) with tiny text IS NOT a value stack
- ❌ A single floating object IS NOT a value stack
- ❌ A text-only bulleted list without card structure IS NOT a value stack
- ❌ Hero taking 80%+ with a tiny corner decoration IS NOT a value stack`,
    },

    dashboard_preview: {
        conceptInstruction: `CREATIVE MODE: DASHBOARD PREVIEW DESIGN
App dashboard shown on screen as the hero element.
MANDATORY LAYOUT:
- DEVICE: Clean laptop or large monitor with the dashboard
- SCREEN: Box C screenshot as the dashboard, or generated UI
- KEY METRIC: One impressive metric called out ("4x faster")
- "TRY FREE" BADGE: Prominent free trial callout
- CTA: "Start Free Trial" or "See It In Action"
- MINIMAL HERO: Small headshot in corner or no hero (product is the hero)`,
        buildPlanInstruction: `DASHBOARD PREVIEW: Clean device showing app dashboard.
Use Box C as screen content. Key metric callout. "Try Free" badge. Product is hero.`,
        renderInstruction: `DASHBOARD PREVIEW MODE: App dashboard on clean device.
Key metric highlighted. "Try Free" badge prominent. Minimal or no human hero.`,
    },

    mobile_app_card: {
        conceptInstruction: `CREATIVE MODE: MOBILE APP CARD DESIGN
Phone mockup as the central element.
MANDATORY LAYOUT:
- PHONE: Realistic smartphone, slightly tilted, showing the app
- SCREEN: Box C screenshot as app content, or generated UI
- FEATURE CALLOUTS: 2-3 floating labels pointing to key features
- NOTIFICATION: Simulated push notification or result alert
- CTA: "Download Now" or "Start Free"
- BACKGROUND: Clean gradient or abstract pattern`,
        buildPlanInstruction: `MOBILE APP CARD: Phone mockup center stage.
Use Box C as screen content. Feature callout labels. Notification simulation.`,
        renderInstruction: `MOBILE APP CARD MODE: Centered smartphone mockup.
App screenshot on screen. Feature callout bubbles. Clean gradient background.`,
    },

    feature_highlight: {
        conceptInstruction: `CREATIVE MODE: FEATURE HIGHLIGHT DESIGN
Spotlight on one key feature with before/after comparison.
MANDATORY LAYOUT:
- SPLIT: Before (manual/old way) vs After (with the tool)
- FEATURE NAME: Bold feature title at top
- METRIC: Time/effort saved ("4 hours → 4 minutes")
- SCREENSHOT: Small UI snippet showing the feature
- CTA: "Try This Feature Free"`,
        buildPlanInstruction: `FEATURE HIGHLIGHT: Before/after split showing one feature impact.
Feature name at top. Time saved metric. UI snippet.`,
        renderInstruction: `FEATURE HIGHLIGHT MODE: Single feature spotlight.
Before vs after comparison. Time saved metric. Clean UI snippet.`,
    },

    community_card: {
        conceptInstruction: `CREATIVE MODE: COMMUNITY CARD DESIGN
Member community showcase.
MANDATORY LAYOUT:
- MEMBER GRID: Small circular avatars of members (montage feel)
- MEMBER COUNT: "1,200+ Members" large number
- INSIDE PREVIEW: 1-2 preview elements of community content
- HERO: Founder/leader in the center, larger than member avatars
- COMMUNITY NAME: Bold at top
- CTA: "Join the Community" or "Apply Now"`,
        buildPlanInstruction: `COMMUNITY CARD: Member avatar grid around hero.
Member count prominent. Community name at top. "Join" CTA.`,
        renderInstruction: `COMMUNITY CARD MODE: Member avatar montage.
Large member count. Hero centered as founder. Community name header.`,
    },

    inside_look: {
        conceptInstruction: `CREATIVE MODE: INSIDE LOOK DESIGN
Preview of what members get access to.
MANDATORY LAYOUT:
- WINDOW/FRAME: Peeking inside through a window, door, or frame
- CONTENT PREVIEW: Screenshots or previews of exclusive content
- If Box C provided: use as the "inside" content
- "MEMBERS ONLY" WATERMARK: Semi-transparent overlay
- BLUR EFFECT: Parts blurred to create mystery
- CTA: "See What's Inside" or "Get Full Access"`,
        buildPlanInstruction: `INSIDE LOOK: Peeking through frame at exclusive content.
Box C as preview content. Parts blurred for mystery. "Members Only" watermark.`,
        renderInstruction: `INSIDE LOOK MODE: Peeking through window/frame.
Exclusive content preview. Blur effect for mystery. "Members Only" overlay.`,
    },

    testimonial_wall: {
        conceptInstruction: `CREATIVE MODE: TESTIMONIAL WALL DESIGN
Multiple testimonials displayed as a social proof wall.
MANDATORY LAYOUT:
- GRID: 3-4 testimonial cards arranged in a grid or mosaic
- If Box C provided: use screenshots as testimonial cards
- Each card: quote snippet + name + result
- HERO: Standing in front of the wall or to the side
- AGGREGATE: "340+ Success Stories" or "Average: 10x ROI"
- CTA: "Join Them" or "See All Results"`,
        buildPlanInstruction: `TESTIMONIAL WALL: Grid of testimonial cards behind hero.
Use Box C as testimonial screenshots if available. Aggregate stat. "Join Them" CTA.`,
        renderInstruction: `TESTIMONIAL WALL MODE: Grid of testimonial cards.
3-4 cards with quotes and results. Hero in front. Aggregate success stat.`,
    },
};

// Helper to get offer hook psychology prompt
export const getOfferHookPsychology = (offerType: string): string => {
    return OFFER_HOOK_PSYCHOLOGY[offerType] || '';
};

// Helper to get creative mode layout for concepts
export const getCreativeModeConceptInstruction = (mode: string): string => {
    return CREATIVE_MODE_LAYOUTS[mode]?.conceptInstruction || '';
};

// Helper to get creative mode layout for build plan
export const getCreativeModeBuildPlanInstruction = (mode: string): string => {
    return CREATIVE_MODE_LAYOUTS[mode]?.buildPlanInstruction || '';
};

// Helper to get creative mode layout for render
export const getCreativeModeRenderInstruction = (mode: string): string => {
    return CREATIVE_MODE_LAYOUTS[mode]?.renderInstruction || '';
};

// ─── OFFER TYPE CAPTION STRUCTURES ───────────────────────────────────────
// Controls HOW the caption is structured based on what's being offered
export const OFFER_CAPTION_STRUCTURES: Record<string, string> = {
    'Free Webinar': `CAPTION STRUCTURE FOR FREE WEBINAR:
1. OPEN: Hook tied to the webinar topic — what burning question will be answered?
2. SPEAKER CREDIBILITY: 1 sentence establishing why THIS person should teach this (years, clients, results)
3. THREE TAKEAWAYS: "In this live session, you'll discover:" followed by 3 specific, tangible things they'll learn
4. EVENT DETAILS: Day, date, time — make it feel imminent and real
5. SOCIAL PROOF: "Join 500+ coaches" or "Last webinar had 340 attendees"
6. CTA: "Register Free" or "Save Your Seat" — emphasize it's FREE and seats are limited
TONE: Educational + urgent. They're signing up for a FREE event, not buying.
FORBIDDEN: Don't sell the paid product. Don't mention price. Sell the WEBINAR.`,

    'Paid Workshop': `CAPTION STRUCTURE FOR PAID WORKSHOP:
1. OPEN: Promise a SPECIFIC outcome — "Walk out with your complete X built"
2. PROBLEM: Name what they've been struggling with (1-2 sentences)
3. WORKSHOP PROMISE: What they'll BUILD/CREATE during the workshop (not just learn)
4. FORMAT: "Live, hands-on, X hours, Q&A included" — justify the investment
5. VALUE COMPARISON: Compare price to the value of the outcome ("One client from this system pays for the workshop 10x")
6. SCARCITY: Limited seats, specific date
7. CTA: "Reserve Your Seat" or "Enroll Now"
TONE: Professional + transformation-focused. They're INVESTING, not just attending.`,

    'Challenge': `CAPTION STRUCTURE FOR CHALLENGE:
1. OPEN: Tease Day 1 — "By tonight, you'll have your first..."
2. THE PROMISE: What they'll achieve across all days combined
3. DAY-BY-DAY TEASE: Brief tease of each day's breakthrough (not full content)
   - Day 1: Foundation...
   - Day 2: Strategy...
   - Day 3: Implementation...
4. COMMUNITY: "Alongside 200+ professionals" — emphasize the group energy
5. URGENCY: "Starts Monday" or "Day 1 kicks off in 48 hours"
6. CTA: "Join the Challenge" or "I'm In" — make it feel like joining a MOVEMENT
TONE: Energetic + community-driven. This is a shared EXPERIENCE, not a solo course.`,

    'Free Guide': `CAPTION STRUCTURE FOR FREE GUIDE:
1. OPEN: Tease ONE powerful insight from the guide — create curiosity
2. THE SECRET: "Inside this guide, you'll find the exact [framework/system/template] that..."
3. CHAPTER TEASE: "Chapter 3 alone will change how you think about [topic]"
4. VALUE POSITIONING: "This is the same framework I charge $2,000 to teach 1-on-1"
5. FRICTION REMOVAL: "No email sequence. No upsell. Just the guide." (if true)
6. CTA: "Download Free" or "Get Your Copy" — emphasize ZERO cost
TONE: Generous + curiosity-driven. They're getting something VALUABLE for free.
FORBIDDEN: Don't over-sell. The guide should feel like a gift, not a funnel.`,

    'Direct Sale': `CAPTION STRUCTURE FOR DIRECT SALE:
1. OPEN: Lead with the TRANSFORMATION, not the product
2. PROBLEM AGITATION: Name the specific pain and make it vivid (2 sentences)
3. SOLUTION REVEAL: Introduce the product as THE answer (name it)
4. VALUE STACK: 3-4 things they get (modules, bonuses, access)
5. PRICE ANCHORING: Compare to alternatives or to the cost of NOT buying
6. GUARANTEE: Risk reversal — "30-day money back" or similar
7. CTA: "Get Instant Access" or "Buy Now" — direct and confident
TONE: Confident + value-driven. This is a SALE — be direct about it.`,

    'Mini-Course': `CAPTION STRUCTURE FOR MINI-COURSE:
1. OPEN: Promise a specific SKILL they'll master
2. THE GAP: "You've consumed content for months but still can't [specific thing]"
3. COURSE DIFFERENCE: "A structured, step-by-step system — not random tips"
4. MODULE PREVIEW: Brief overview of what they'll build in each module
5. OUTCOME: "By Module 4, you'll have [specific deliverable]"
6. PROOF: Student result or testimonial
7. CTA: "Start Learning" or "Enroll Now"
TONE: Educational + outcome-focused. They're buying a SKILL, not information.`,

    'SaaS Trial': `CAPTION STRUCTURE FOR SAAS TRIAL:
1. OPEN: Name the EXACT frustration the tool eliminates
2. TIME SAVINGS: "What takes you 4 hours now takes 4 minutes with [product]"
3. HOW IT WORKS: 3 simple steps — keep it dead simple
4. ZERO RISK: "Try free for 14 days. No credit card. Cancel anytime."
5. SOCIAL PROOF: "Used by X teams" or "X tasks completed"
6. CTA: "Start Your Free Trial" or "Try It Free"
TONE: Practical + problem-solving. No hype — show don't tell.
FORBIDDEN: Don't be salesy. SaaS sells itself through utility and ease.`,

    'Membership': `CAPTION STRUCTURE FOR MEMBERSHIP:
1. OPEN: What members GET that non-members don't — create envy
2. INSIDE PEEK: "Inside, we share strategies we'd never post publicly"
3. COMMUNITY VALUE: "Weekly live calls, private forum, direct access to [expert]"
4. SOCIAL PROOF: Member count + specific member results
5. EXCLUSIVITY: "We don't accept everyone" or "Limited to serious professionals"
6. CTA: "Join the Community" or "Apply Now"
TONE: Exclusive + insider. They should feel like they're missing out by NOT being a member.`,
};

// Helper to get caption structure for an offer type
export const getOfferCaptionStructure = (offerType: string): string => {
    return OFFER_CAPTION_STRUCTURES[offerType] || '';
};