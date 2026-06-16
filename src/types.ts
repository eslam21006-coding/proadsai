export type AspectRatio = "1:1" | "4:5" | "3:4" | "4:3" | "9:16" | "16:9";
export type CampaignType = "cold" | "retargeting";
export type UniverseMode = "realistic" | "fantasy" | "minimal";
export type AdMode = "single" | "carousel";

// ─── COLD AD HOOK ANGLES (10 approved — before_after is now a creative mode) ──
export type ColdHookAngle =
  | "emotional"
  | "logic"
  | "urgency"
  | "scarcity"
  | "pain"
  | "curiosity"
  | "statistics"
  | "social_proof"
  | "logical_authority"
  | "future_based";

// ─── HOOK TYPES (Style of hook delivery) ─────────────────────────────────
export type HookType =
  | "comedic"
  | "controversial"
  | "personal_story"
  | "curiosity_gap"
  | "storytelling"
  | "shocking_stat"
  | "question"
  | "listicle"
  | "misconception"
  | "transformation_promise"
  | "pain_point"
  | "threat";

// ─── AD TONE ─────────────────────────────────────────────────────────────
export type AdTone =
  | "formal"
  | "funny"
  | "inspiring"
  | "emotional"
  | "authority"
  | "friendly"
  | "bold"
  | "data_driven"
  | "mentor"
  | "soft"
  | "luxury_ceo";

// ─── COPYWRITING STRATEGY (Psychological framework) ──────────────────────
export type CopywritingStrategy =
  | "pattern_interrupt"
  | "beginner_awareness"
  | "solution_awareness"
  | "authority_builder"
  | "myth_busting"
  | "soft_story_sell"
  | "product_awareness"
  | "problem_awareness";

// ─── OFFER CREATIVE MODE (visual format per offer type) ──────────────────
export type OfferCategory =
  | "event"          // Free Webinar, Paid Workshop, Challenge
  | "guide"          // Free Guide, Ebook, PDF
  | "course"         // Mini-Course, Online Course
  | "direct_sale"    // Direct Sale, High-Ticket
  | "saas"           // SaaS Trial, Software
  | "membership";    // Membership, Community

export type OfferCreativeMode =
  // Standard (all categories)
  | "standard_hero"
  // Event / Webinar / Challenge
  | "event_ticket"
  | "speaker_card"
  | "webinar_screen"
  // Guide
  | "book_mockup"
  | "device_mockup"
  | "preview_card"
  // Course
  | "platform_screenshot"
  | "certificate"
  // Direct Sale
  | "premium_package"
  | "value_stack"
  | "offer_card"
  // Before/After (reclassified from hook angle to creative mode)
  | "before_after"
  // SaaS
  | "dashboard_preview"
  | "mobile_app_card"
  | "feature_highlight"
  // Membership
  | "community_card"
  | "inside_look"
  | "testimonial_carousel"
  // Typography-only (no hero, no universe)
  | "text_only";

export type RetargetingAngle =
  | "proof"
  | "risk_reversal"
  | "mechanism"
  | "urgency"
  | "clarity";


export type TovEditIntent =
  | "simplify_terms"
  | "shorten"
  | "sharpen"
  | "formalize"
  | "change_angle"
  | "change_cta"
  | "change_subheadline"
  | "change_headline"
  | "freeform";

export type RewriteScope =
  | "wording_only"
  | "cta_only"
  | "subheadline_only"
  | "hook_only"
  | "full";

export interface SemanticLock {
  angle: string;
  mechanism: string;
  audience: string;
  pain: string;
  desiredOutcome: string;
  promiseType: string;
  emotionalFrame: string;
  objectionFrame?: string;
}
export type RetargetingObjectionId =
  | "price_too_high"
  | "no_budget_now"
  | "need_installments"
  | "dont_trust"
  | "will_it_work_for_me"
  | "tried_before_failed"
  | "no_time"
  | "overwhelmed"
  | "not_ready_yet"
  | "need_approval"
  | "dont_want_call"
  | "dont_need_it";

export interface TestimonialEntry {
  text: string;           // Cleaned testimonial text
  speakerName?: string;   // Optional speaker name
  platform?: 'whatsapp' | 'messenger' | 'telegram' | 'sms' | 'unknown';
  originalScreenshot?: string; // Reference to source screenshot (base64)
}

export interface AdInputs {
  productName: string;
  productCategory: string;  // e.g. "Online fitness coaching", "Business mentorship" — used for competitor research
  transformation: string;
  challenges: string;
  offerType: string;
  targetAudience: string;
  cta: string;
  campaignType: CampaignType;

  // Cold-only controls
  coldHookAngle?: ColdHookAngle;   // emotional, logic, urgency, etc. (10 approved angles)
  hookType?: HookType;             // comedic, controversial, curiosity_gap, etc.
  adTone?: AdTone;                 // formal, funny, inspiring, emotional, authority, friendly, bold, data_driven, mentor, soft, luxury_ceo
  copywritingStrategy?: CopywritingStrategy; // pattern_interrupt, beginner_awareness, solution_awareness, etc.
  offerCreativeMode?: OfferCreativeMode[];    // Multi-select up to 2 (e.g. ['standard_hero', 'book_mockup'])
  offerAssets?: string[];                     // Box C — offer-specific images (book cover, dashboard screenshot, etc.)

  // ─── Mode-Specific Structured Inputs (Category C = required, Category B = optional) ─────
  // Value Stack mode
  valueStackTitle?: string;            // Offer title (required for value_stack)
  valueStackItems?: string;            // Included items, comma or newline separated (required)
  valueStackBonuses?: string;          // Bonus items (optional)
  valueStackPrice?: string;            // Price display (optional)
  valueStackSavings?: string;          // e.g. "Save $500" (optional)
  valueStackOriginalValue?: string;    // e.g. "Total Value: $2,997" (optional)
  valueStackGuarantee?: string;        // e.g. "30-day money-back guarantee" (optional)
  valueStackDeliveryFormat?: string;   // e.g. "Online platform + Zoom calls" (optional)
  valueStackProofStatement?: string;   // e.g. "340+ graduates" (optional)

  // Event Ticket mode
  eventTitle?: string;                 // Event name (required for event_ticket)
  eventDate?: string;                  // Event date (required)
  eventTime?: string;                  // Event time (optional)
  eventLocation?: string;              // Location or "Online" (optional)
  eventHost?: string;                  // Host/speaker name (optional)
  eventSeatLimit?: string;             // e.g. "50 seats only" (optional)
  eventTicketTier?: string;            // e.g. "VIP — $97" (optional)

  // Feature Grid mode
  featureList?: string;                // Features, comma or newline separated (required for feature_highlight)
  featureDescriptions?: string;        // Brief descriptions per feature (optional)
  featureIcons?: string;               // Icons/emojis per feature, one per line (optional)
  featureGroupLabel?: string;          // e.g. "All-in-one platform" (optional)

  // Offer Card mode
  offerCardTitle?: string;             // Offer title (required for premium_package)
  offerCardPrice?: string;             // Price (optional)
  offerCardOldPrice?: string;          // Original/strikethrough price (optional)
  offerCardDiscount?: string;          // e.g. "50% OFF" (optional)
  offerCardInclusions?: string;        // What's included (optional)
  offerCardPaymentPlan?: string;       // e.g. "3 × $332/mo" (optional)
  offerCardGuarantee?: string;         // e.g. "30-day money-back" (optional)

  // Testimonial Mode
  testimonialScreenshots?: string[];   // Base64 screenshots of WhatsApp/Messenger/Telegram/SMS conversations
  testimonialTexts?: TestimonialEntry[]; // Extracted + cleaned testimonial text from screenshots
  testimonialManualText?: string;      // Manual testimonial text (optional fallback)
  testimonialSpeakerName?: string;     // Speaker name (optional)

  // Dashboard / App Preview mode
  appDashboardLabel?: string;          // e.g. "Analytics Dashboard" (optional)
  appKeyMetric?: string;               // e.g. "+340% ROI" (optional)

  // Authority / Proof mode
  authorityCredentials?: string;       // e.g. "7 years, 500+ clients" (optional)
  authorityNumbers?: string;           // e.g. "$2M revenue" (optional)

  // Module Preview mode (DELETED — fields kept for saved project compat)
  moduleTitles?: string;               // Module names, newline-separated (legacy)
  moduleLabels?: string;               // Progression labels (optional)

  // Book Mockup mode
  guideTitle?: string;                 // Book/guide title (required for book_mockup)
  guideSubtitle?: string;              // Subtitle (optional)
  guideFormat?: string;                // Format e.g. "PDF, 120 pages" (optional)

  // Device Mockup mode
  deviceContentTitle?: string;         // Content title shown on device (required for device_mockup)
  deviceScreenLabels?: string;         // Screen labels (optional)

  // Speaker Card mode (dedicated)
  speakerName?: string;                // Speaker name (required for speaker_card)
  speakerRole?: string;                // Role / title (required for speaker_card)
  speakerCredentials?: string;         // Credentials (optional)
  speakerAffiliation?: string;         // Affiliation (optional)

  // Day Strip mode (DELETED — fields kept for saved project compat)
  dayNodes?: string;                   // Day labels, newline-separated (legacy)
  dayDates?: string;                   // Date range (optional)
  dayMilestones?: string;              // Milestone labels (optional)

  // Retargeting-only controls (ignored in cold)
  // retargetingAngle removed — now auto-selected by getBestAngleForObjection()
  retargetingObjection?: RetargetingObjectionId;  // Canonical single selected objection
  retargetingObjections?: RetargetingObjectionId[];  // Legacy array — read-compat only for old saved data
  customObjection?: string; // User-defined objection text
  testimonial?: string;
  aspectRatio: AspectRatio;
  extraRatios?: AspectRatio[];  // additional sizes to auto-reflow after primary render
  universeMode: UniverseMode;
  visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal'; // Canonical source of truth — falls back to universeMode for old projects
  visualSubStyle?: 'dark_cinematic' | 'bright_illustrated' | 'mythic_epic' | 'vintage_bw' | 'vintage_sepia'
    | 'luxury_magazine' | 'documentary_gritty' | 'neon_urban' | 'anime_manga' | 'watercolor_dreamscape' | 'comic_book'
    | 'clean_corporate' | 'ugly_ad' | 'cinematic_film_still' | 'golden_hour_outdoor' | 'street_photography'
    | 'pixel_retro_game' | 'stained_glass' | 'glitch_digital' | 'synthwave_80s';
  preferredUniverse: string;
  customUniverseDetails?: string;
  brandUrl?: string;
  brandColorPrimary?: string;   // Optional hex color e.g. "#FF6B00"
  brandColorSecondary?: string; // Optional hex color e.g. "#1A1A2E"
  brandColorSource?: BrandColorSource; // Set server-side at submit time; mirrors resolutionTrace.brandColorSource
  badges?: string;          // New Badge Field
  adLanguage?: string;      // Content language e.g. "ar_fusha", "ar_egyptian", "en", "fr"
  adMode?: AdMode;          // Single image or carousel
  slideCount?: number;      // Number of carousel slides (2-5)
  personalPhotos?: string[]; // Box A (Max 5)
  brandLogos?: string[];    // Box B (Max 5)
  uploadedAssets?: string[]; // Legacy compatibility if needed
  competitorContext?: string; // Auto-injected from competitor research — feeds into prompts

  // ─── Angle-Specific Supporting Details (Optional but improves output quality) ─────
  urgencyDetails?: string;   // e.g. "Registration closes Thursday, price goes up $200 after Friday"
  scarcityDetails?: string;  // e.g. "Only 20 seats, we don't reopen for 3 months"
  proofSnippets?: string;    // e.g. "Ahmad got 18 calls in 10 days, Sara went from 3 to 47 clients"
  statsData?: string;        // e.g. "95% of coaches earn under $3K/month, our system has 340+ graduates"
  authoritySignals?: string; // e.g. "7 years experience, 500+ clients, featured in Forbes Arabia"
  storySeed?: string;        // e.g. "I was charging $50/hour and working 14hr days until I discovered..."

  // ─── Optional Reference Image Direction ─────────────────────────────────
  referenceImage?: string;   // Base64 data URL of a single reference image for visual direction (style/mood/composition inspiration, NOT copying)

  // ─── Reference Ad (distinct from reference image — adapts style/structure to user's offer) ─────
  referenceAd?: string;      // Base64 data URL of a reference ad to adapt style/composition from
}

export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[];
}

export interface StyleSuggestion {
  id: string;
  label: string;
  instruction: string;
}

export interface VisualPolish {
  id: string;
  label: string;
  instruction: string;
}

export interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

// ─── BATCH GENERATION (AGENCY) ───────────────────────────────────────────────
export interface BatchResult {
  conceptIndex: number;
  variantIndex: number;
  conceptText: string;
  hookKey: string;          // Which hook this came from (A, B, C, D)
  hookText: string;         // Full hook text
  buildPlan: string;
  url: string | null;
  // The ORIGINAL (un-reflowed) render for this combo — the first successful primary output.
  // Every resize reflows from this source instead of the previous resize output, so repeated
  // resizes never chain-degrade quality. Updated only on a full rerender (new base image).
  originalUrl?: string | null;
  ratio: AspectRatio;
  status: 'pending' | 'rendering' | 'done' | 'error';
  generationId?: string;             // This item's own source generation doc (comboGenId) — reflow/rerender use this instead of the global renderGenerationId
  // ─── Per-image state persistence ─────────────────────────────
  imageId: string;                   // Unique ID for this batch image
  parentBatchId?: string;            // Links to the batch that produced this
  selectedModes: string[];           // Mode/pair state that produced this image
  contractVariant?: string;          // Template/layout key used
  numericFidelity?: 'strict' | 'flexible' | 'none'; // Overlay policy
  offerFactsHash?: string;           // Hash of structured facts for consistency check
  localRefinement?: string;          // Per-image refinement instruction
  localRefinementHistory?: string[]; // History of local refinements applied
}

// Per-hook concept groups for batch flow
export interface BatchHookGroup {
  hookKey: string;           // A, B, C, D
  hookText: string;          // Full raw hook text
  hookHeadline: string;      // Short headline for display
  conceptsText: string;      // Raw concepts text from AI
  selectedConcepts: Set<number>; // Which concepts (1,2,3) are selected
}

export interface ABVariation {
  url: string | null;
  status: 'pending' | 'rendering' | 'done' | 'error';
  tweak: string;
  historyIdx: number;  // index in mockupHistory when pushed
}

// ─── CAROUSEL SLIDES ─────────────────────────────────────────────────────────
export interface TextOverride {
  hookText: string;
  subheadText: string;
  ctaName: string;
  benefitText: string;
}

export interface CarouselSlideCopy {
  hookText: string;
  subheadText: string;
  ctaText: string;
  benefitText: string;
}

export interface CarouselSlide {
  index: number;            // 1-9
  copy: CarouselSlideCopy;  // Per-slide unique text
  buildPlan: string;
  imageUrl: string | null;
  status: 'pending' | 'rendering' | 'done' | 'error';
}

// NEW: Project History Interface
// ─── WORKSPACE (Multi-Brand) ────────────────────────────────────────────────
export interface Workspace {
  id: string;
  name: string;
  brandName: string;
  brandUrl?: string;
  brandColorPrimary?: string;
  brandColorSecondary?: string;
  logoUrl?: string;
  createdAt: number;
  isDefault: boolean;
  metaAdAccountId?: string;
  metaAdAccountName?: string;
  metaRoleAtLinkTime?: 'ADMIN' | 'ADVERTISER';
  deletedAt?: number | null;
  pendingReassign?: boolean;
  pendingRestore?: boolean;
}

export interface WorkspaceAccessAuditEntry {
  id: string;
  actorUid: string;
  targetMemberUid: string;
  targetMemberEmail: string;
  workspaceId: string;
  workspaceNameAtEvent: string;
  action: 'grant' | 'revoke';
  timestamp: number;
  planSnapshot: 'none' | 'starter' | 'pro' | 'scale';
}

export interface SavedProject {
  id: string;
  userId?: string;
  name: string;
  workspaceId?: string;
  isRenaming?: boolean; // Added for UI state
  timestamp: number;
  inputs: AdInputs | null;
  phase: AppPhase;
  tovText: string;
  conceptsText: string;
  selectedTov: string;
  selectedConcept: string;
  buildPlan: string;
  // Update this line inside SavedProject interface
  mockupHistory: { url: string; ratio: AspectRatio; rawBase64?: string }[];
  historyIndex: number;
  resolvedUniverse: string;
  captionText: string;
  batchCaptions?: { hookKey: string; hookText: string; captionText: string }[];
  batchResults?: BatchResult[];
  batchHookGroups?: (Omit<BatchHookGroup, 'selectedConcepts'> & { selectedConcepts: number[] | Set<number> })[];
  carouselSlides?: CarouselSlide[];
  reassignedFromWorkspaceId?: string;
  resolvedCreativeSpec?: any; // ResolvedCreativeSpec from creativeResolver.ts
  creatorName?: string;
  creatorEmail?: string;

  status?: 'draft' | 'rendered' | 'published';
  thumbnailUrl?: string;
  metaAdId?: string;
}

export type AppPhase = 'input' | 'tov_review' | 'concept_review' | 'render_studio' | 'primary_text';

// ─── Brand Colors (956-brand-colors) ─────────────────────────────────────────
export type BrandColorSource = 'form' | 'avatar' | 'inherited' | 'workspace' | 'none';

// ─── AUDIENCE AVATAR ─────────────────────────────────────────────────────────
// Stores reusable audience profiles that pre-populate the input form.
export interface AudienceAvatar {
  id: string;
  workspaceId?: string;
  name: string;            // e.g. "Struggling Gym Owners"
  productName: string;
  productCategory: string;  // e.g. "Online fitness coaching"
  targetAudience: string;
  challenges: string;
  transformation: string;
  offerType: string;
  cta: string;
  brandUrl?: string;
  brandColorPrimary?: string;
  brandColorSecondary?: string;
  badges?: string;
  createdAt: number;

  // Campaign & hooks
  campaignType?: CampaignType;
  coldHookAngle?: ColdHookAngle;
  hookType?: HookType;
  adTone?: AdTone;
  copywritingStrategy?: CopywritingStrategy;
  offerCreativeMode?: OfferCreativeMode[];

  // Value Stack mode
  valueStackTitle?: string;
  valueStackItems?: string;
  valueStackBonuses?: string;
  valueStackPrice?: string;
  valueStackSavings?: string;
  valueStackOriginalValue?: string;
  valueStackGuarantee?: string;
  valueStackDeliveryFormat?: string;
  valueStackProofStatement?: string;

  // Event Ticket mode
  eventTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventLocation?: string;
  eventHost?: string;
  eventSeatLimit?: string;
  eventTicketTier?: string;

  // Feature Grid mode
  featureList?: string;
  featureDescriptions?: string;
  featureIcons?: string;
  featureGroupLabel?: string;

  // Offer Card mode
  offerCardTitle?: string;
  offerCardPrice?: string;
  offerCardOldPrice?: string;
  offerCardDiscount?: string;
  offerCardInclusions?: string;
  offerCardPaymentPlan?: string;
  offerCardGuarantee?: string;

  // Testimonial Mode
  testimonialManualText?: string;
  testimonialSpeakerName?: string;

  // Dashboard / App Preview mode
  appDashboardLabel?: string;
  appKeyMetric?: string;

  // Authority / Proof mode
  authorityCredentials?: string;
  authorityNumbers?: string;

  // Module Preview mode
  moduleTitles?: string;
  moduleLabels?: string;

  // Book Mockup mode
  guideTitle?: string;
  guideSubtitle?: string;
  guideFormat?: string;

  // Device Mockup mode
  deviceContentTitle?: string;
  deviceScreenLabels?: string;

  // Speaker Card mode
  speakerName?: string;
  speakerRole?: string;
  speakerCredentials?: string;
  speakerAffiliation?: string;

  // Day Strip mode
  dayNodes?: string;
  dayDates?: string;
  dayMilestones?: string;

  // Retargeting
  retargetingObjection?: RetargetingObjectionId;
  customObjection?: string;
  testimonial?: string;

  // Visual & mode
  aspectRatio?: AspectRatio;
  extraRatios?: AspectRatio[];
  universeMode?: UniverseMode;
  visualStyleFamily?: 'realistic' | 'fantasy' | 'minimal';
  preferredUniverse?: string;
  customUniverseDetails?: string;
  adLanguage?: string;
  adMode?: AdMode;
  slideCount?: number;
  competitorContext?: string;

  // Angle-specific supporting details
  urgencyDetails?: string;
  scarcityDetails?: string;
  proofSnippets?: string;
  statsData?: string;
  authoritySignals?: string;
  storySeed?: string;
}

// ─── COMPETITOR RESEARCH ─────────────────────────────────────────────────────
export interface CompetitorResult {
  name: string;
  url: string;
  description: string;
}

export interface DifferentiationAngle {
  title: string;
  explanation: string;
  hookSuggestion: string;  // Ready-to-use ad angle
}

export interface CompetitorResearch {
  competitors: CompetitorResult[];
  angles: DifferentiationAngle[];
  attackHooks: string[];
  cachedFor: string;       // productName+audience hash — cache key
  timestamp: number;
}
// ─── VARIANT EXPLORATION ENGINE ─────────────────────────────────────────────
export type VariantDimension =
  | 'hook_angle'
  | 'copy_framing'
  | 'cta_style'
  | 'urgency_expression'
  | 'visual_composition'
  | 'hook_type';

export interface VariantSpec {
  variantId: string;
  label: string;
  changedDimensions: {
    dimension: VariantDimension;
    originalValue: string;
    variantValue: string;
  }[];
  hookAngleOverride?: string;
  hookTypeOverride?: string;
  ctaStyleOverride?: string;
  copyFramingOverride?: string;
  urgencyOverride?: string;
  compositionOverride?: string;
}

// ─── Reflow Types (HOTFIX-F) ─────────────────────────────────────────────────

export type ReflowMethod = "auto" | "outpaint" | "rerender";

export type ReflowScope = "single" | "batch_all" | "carousel_all" | "carousel_slide";

export type ReflowFallbackReason =
  | "engine_error"
  | "drift"
  | "no_plan"
  | "mask_error"
  | "transient";

export interface ReflowHistoryEntry {
  timestamp: number;
  sourceRatio: AspectRatio;
  targetRatio: AspectRatio;
  magnitude: number;
  method: "outpaint" | "rerender";
  userOverride: "outpaint" | "rerender" | null;
  fallbackFrom: "outpaint" | "rerender" | null;
  fallbackReason: ReflowFallbackReason | null;
  itemIndex: number | null;
  outputUrl: string | null;
  creditsCharged: number;
}

export interface ReflowOutcome {
  itemIndex: number | null;
  success: boolean;
  method: "outpaint" | "rerender" | null;
  fallbackFrom: "outpaint" | "rerender" | null;
  fallbackReason: ReflowFallbackReason | null;
  outputUrl: string | null;
  creditsCharged: number;
  errorCode?: string;
  errorMessage?: string;
}

interface ReflowImageRequestBase {
  generationId: string;
  targetAspectRatio: AspectRatio;
  method: ReflowMethod;
  // Optional direct source image (base64 data URL or http URL) for the displayed
  // render, so reflow doesn't depend on the server-side Storage upload state.
  sourceImageOverride?: string;
}

export type ReflowImageRequest =
  | (ReflowImageRequestBase & { scope: "single" | "batch_all" | "carousel_all"; slideIndex?: undefined })
  | (ReflowImageRequestBase & { scope: "carousel_slide"; slideIndex: number });

export interface ReflowImageResponse {
  success: true;
  scope: ReflowScope;
  outcomes: ReflowOutcome[];
  totalCreditsCharged: number;
}

export interface VariantSet {
  setId: string;
  userId: string;
  createdAt: number;
  baseTemplate: string;
  baseCreativeModes: string[];
  baseHookAngle: string;
  baseHookType: string;
  baseAspectRatio: string;
  baseCta: string;
  variants: VariantSpec[];
  winnerId: string | null;
  winnerDimensions: { dimension: string; value: string }[] | null;
  status: 'draft' | 'pushed' | 'tracking' | 'complete';
}

// ─── PHASE 23 — IN-CARD VARIATION CAROUSEL (23.A) ────────────────────────────
// One generated variation inside a hook card. Belongs to a parent card
// (HookVariantKey), occupies a carousel position (2..12, with the reference
// at 1), shares the reference hook's resolved angle/structure, and carries
// its own 4 copy fields subject to all Phase 22 quality rules.

export interface ClaimFlagEntry {
    text: string;
    reason: string;
    field?: "hook" | "subhead" | "cta" | "benefit" | "slide";
}

export interface HookVariation {
    hookText: string;
    subheadText: string;
    ctaName: string;
    benefitText: string;
    rawBlock: string;
    claimFlags?: readonly ClaimFlagEntry[];
    variationIndex: number;
}