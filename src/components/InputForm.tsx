import * as React from 'react';
import { useState, useRef } from 'react';
import type { AdInputs, AdMode, AspectRatio, RetargetingAngle, RetargetingObjectionId, UniverseMode, AudienceAvatar, CompetitorResearch, ColdHookAngle, HookType, AdTone, CopywritingStrategy } from '../types';
import { OFFER_TYPES, OFFER_CATEGORY_MAP, OFFER_CREATIVE_MODES, CREATIVE_MODE_CONFLICTS, HOOK_ANGLE_MODE_CONFLICTS, ASPECT_RATIOS, RETARGETING_OBJECTIONS, AD_LANGUAGES, FIELD_EXAMPLES, COLD_HOOK_ANGLES, HOOK_TYPES, AD_TONES, COPYWRITING_STRATEGIES, CREATIVE_TABS, getAvailableHookAngles, getAvailableHookStyles, getAvailableAdTones, getAvailableCopyStrategies } from '../constants';
import { REALISTIC_UNIVERSES as DB_REALISTIC, FANTASY_UNIVERSES as DB_FANTASY } from '../universeDatabase';
import { isStrongPair, getBlockedModes, CREATIVE_MODE_CATALOG, type CreativeTab, getBlockedModesForSubStyle, getBlockedSubStylesForModes, validateLaunchSurface, resolveValueStackSlideCount } from '../creativeResolver';
import { ART_DIRECTION_GROUPS, getAvailableCards, getCardById, isSubStyleInFamily, type ArtDirectionCard } from '../artDirectionConfig';
import { getActiveSections, validateModeFields, type ModeFieldSection, isOfferModeAvailable } from '../modeFieldSchema';
import { CREDIT_COSTS, type UserPlan, canUse, canUseRatio, requiredPlanFor, requiredPlanForRatio, getMaxSlides, getFeatureLimit } from '../planconfig';
import { RETARGETING_OBJECTION_DATA, isObjectionAvailable } from '../retargetingObjections';
import type { StoredPlan } from '../../functions/src/entitlements';
import { useT } from '../i18n';
import { gemini, type RankingResultCompact } from '../services/geminiService';
import { getAuth } from 'firebase/auth';

interface Props {
  onSubmit: (inputs: AdInputs) => void;
  onSaveDraft?: (inputs: AdInputs) => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  initialValues?: AdInputs | null;
  userPlan: UserPlan;
  avatars: AudienceAvatar[];
  onSaveAvatar: (avatar: Omit<AudienceAvatar, 'id' | 'createdAt'>) => void;
  onUpdateAvatar: (avatarId: string, avatar: Omit<AudienceAvatar, 'id' | 'createdAt'>) => void;
  onDeleteAvatar: (avatarId: string) => void;
  competitorData: CompetitorResearch | null;
  competitorLoading: boolean;
  onRefreshResearch: (formData: AdInputs) => void;
  onRankingsLoaded?: (rankings: RankingResultCompact | null) => void;
}

// --- AUTOMATIC COMPRESSION UTILITY ---
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
        } else {
          if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
        resolve(dataUrl);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const getDefaultInputs = (): AdInputs => ({
  productName: '',
  productCategory: '',
  transformation: '',
  challenges: '',
  offerType: OFFER_TYPES[0],
  targetAudience: '',
  cta: '',
  campaignType: 'cold',
  retargetingObjection: undefined,
  retargetingObjections: [],
  customObjection: '',
  testimonial: '',
  badges: '',
  adLanguage: 'ar_fusha',
  adMode: 'single' as AdMode,
  slideCount: 3,
  aspectRatio: '1:1',
  extraRatios: [],
  universeMode: 'realistic',
  visualStyleFamily: 'realistic',
  visualSubStyle: undefined,
  preferredUniverse: 'Surprise Me (Random Realistic)',
  customUniverseDetails: '',
  brandUrl: '',
  brandColorPrimary: '',
  brandColorSecondary: '',
  personalPhotos: [],
  brandLogos: [],
});

// ── Styled sub-components ──────────────────────────────────────────────
const Label: React.FC<{ children: React.ReactNode; accent?: string }> = ({ children, accent }) => (
  <label className={`text-[11px] font-semibold ${accent || 'text-slate-400'} tracking-wide`}>{children}</label>
);

const InfoTip: React.FC<{ text: string }> = ({ text }) => (
  <span className="group/tip relative inline-block ml-1.5 align-middle">
    <i className="fa-solid fa-circle-info text-[9px] text-slate-600 cursor-help hover:text-blue-400 transition-colors"></i>
    <span className="hidden group-hover/tip:block absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 p-3 bg-slate-900 border border-slate-700 rounded-xl text-[9px] text-slate-300 leading-relaxed shadow-2xl whitespace-normal pointer-events-none">
      {text}
      <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-slate-900 border-r border-b border-slate-700 rotate-45"></span>
    </span>
  </span>
);

// Audience-aware examples — adapts based on target audience input
const getSmartExamples = (field: 'challenges' | 'transformation' | 'cta', audience: string) => {
  const a = (audience || '').toLowerCase();
  const isCoach = a.includes('coach') || a.includes('كوتش') || a.includes('مدرب') || a.includes('consultant') || a.includes('مستشار');
  const isEcom = a.includes('ecommerce') || a.includes('e-commerce') || a.includes('متجر') || a.includes('store') || a.includes('منتج');
  const isFreelance = a.includes('freelance') || a.includes('مستقل') || a.includes('designer') || a.includes('مصمم') || a.includes('developer');
  const isAgency = a.includes('agency') || a.includes('وكالة') || a.includes('marketing') || a.includes('تسويق');
  const isHealth = a.includes('health') || a.includes('صحة') || a.includes('fitness') || a.includes('رياضة') || a.includes('طبيب') || a.includes('doctor');

  if (field === 'challenges') {
    if (isCoach) return [
      { label: 'Price Resistance', value: 'Clients push back on pricing and compare them to cheaper trainers who offer lower quality' },
      { label: 'No System', value: 'They rely on word-of-mouth and have no repeatable system to attract premium clients consistently' },
      { label: 'Content Burnout', value: 'They spend hours creating content and posting daily but get little engagement and no paying clients from it' },
    ];
    if (isEcom) return [
      { label: 'Ad Waste', value: 'They keep spending on ads but ROAS stays below 2x and they can\'t figure out what creative or copy actually works' },
      { label: 'Competition', value: 'Competing with cheap dropshippers and big brands who dominate the ad space with massive budgets' },
      { label: 'Cart Abandonment', value: 'People add to cart but never complete the purchase — they don\'t trust the brand enough to buy' },
    ];
    if (isFreelance) return [
      { label: 'Race to Bottom', value: 'Clients treat their work as a commodity and always negotiate the price down or compare to Fiverr' },
      { label: 'Feast or Famine', value: 'Some months they have too many projects, other months zero — no predictable income or pipeline' },
      { label: 'Invisible Expert', value: 'They have real skill but zero online presence — lost in a sea of louder, less qualified competitors' },
    ];
    if (isAgency) return [
      { label: 'Client Churn', value: 'Clients leave after 3 months because they don\'t see clear ROI and the agency can\'t prove value' },
      { label: 'Scaling Problem', value: 'Stuck at the same revenue because every new client requires more manual work and hiring' },
      { label: 'Differentiation', value: 'They offer the same services as every other agency and struggle to explain why they\'re worth more' },
    ];
    if (isHealth) return [
      { label: 'Trust Gap', value: 'People don\'t trust online health advice and prefer in-person consultations even when they\'re more expensive' },
      { label: 'Information Overload', value: 'Their audience is overwhelmed with contradictory health advice and doesn\'t know who to believe' },
      { label: 'Commitment Issue', value: 'Clients start programs excited but quit within 2 weeks because they don\'t see immediate results' },
    ];
  }

  if (field === 'transformation') {
    if (isCoach) return [
      { label: 'Premium Positioning', value: 'Selling their services for $1000+ without needing to discount, using a system that attracts pre-sold clients' },
      { label: 'Automated Pipeline', value: 'Booking 10+ qualified calls per week without cold outreach, using an ad system that runs on autopilot' },
      { label: 'Authority Status', value: 'Becoming the recognized expert in their niche with a waiting list of clients who pay premium without negotiation' },
    ];
    if (isEcom) return [
      { label: 'Profitable Scaling', value: 'Scaling to $50K/month with a 4x+ ROAS using a proven creative testing system' },
      { label: 'Brand Trust', value: 'Building a brand that customers recognize and trust — repeat buyers make up 40% of revenue' },
      { label: 'Ad Mastery', value: 'Knowing exactly which creatives, hooks, and audiences drive sales so every dollar spent returns $3-5' },
    ];
    if (isFreelance) return [
      { label: 'Premium Clients', value: 'Attracting clients who pay $2000+ per project without negotiation because they see the value immediately' },
      { label: 'Predictable Income', value: 'Having a consistent pipeline of 3-5 qualified leads per week without cold outreach or bidding wars' },
      { label: 'Authority Brand', value: 'Being known as THE expert in their niche — clients come to them, not the other way around' },
    ];
  }

  if (field === 'cta') {
    if (isCoach) return [
      { label: 'Enrollment', value: 'Enroll Now' },
      { label: 'Call', value: 'Book Your Free Strategy Call' },
      { label: 'Challenge', value: 'Join the Challenge' },
    ];
    if (isEcom) return [
      { label: 'Shop', value: 'Shop Now' },
      { label: 'Deal', value: 'Claim Your 50% Off' },
      { label: 'Collection', value: 'Browse the Collection' },
    ];
  }

  // Fallback generic examples
  return FIELD_EXAMPLES[field] || [];
};

const SectionTitle: React.FC<{ icon: string; title: string; badge?: React.ReactNode; right?: React.ReactNode }> = ({ icon, title, badge, right }) => (
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center text-blue-400 text-sm">
        <i className={`fa-solid ${icon}`}></i>
      </div>
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {badge}
    </div>
    {right}
  </div>
);

const LockedBadge: React.FC<{ requiredPlan: string }> = ({ requiredPlan }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-400 text-[9px] font-bold ml-2">
    <i className="fa-solid fa-lock text-[7px]"></i> {requiredPlan}+
  </span>
);

const inputCls = "w-full bg-slate-950/60 border border-slate-800/60 rounded-xl px-4 py-3 text-sm text-slate-100 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-slate-600";
const textareaCls = `${inputCls} h-28 resize-none`;
const selectCls = `${inputCls} cursor-pointer`;

// ─── UNIVERSE DROPDOWN (extracted to avoid conditional hooks inside JSX) ──────
const UniverseDropdown: React.FC<{
  activeStyle: string;
  dbRealistic: { name: string }[];
  dbFantasy: { name: string }[];
  preferredUniverse: string;
  onSelect: (universe: string) => void;
  inputCls: string;
  noMatchesLabel: string;
}> = ({ activeStyle, dbRealistic, dbFantasy, preferredUniverse, onSelect, inputCls, noMatchesLabel }) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  const universeOptions = [
    activeStyle === 'realistic' ? 'Surprise Me (Random Realistic)' : 'Surprise Me (Random Fantasy)',
    '🎨 Custom World',
    ...(activeStyle === 'realistic' ? dbRealistic : dbFantasy).map(u => u.name),
  ];
  const filteredOptions = universeOptions.filter(u => u.toLowerCase().includes(searchTerm.toLowerCase()));

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setIsOpen(false); };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={dropdownRef} className="relative">
      <div className={`${inputCls} cursor-pointer flex items-center justify-between`} onClick={() => setIsOpen(!isOpen)}>
        <span className={preferredUniverse ? 'text-slate-100' : 'text-slate-500'}>{preferredUniverse || 'Select...'}</span>
        <i className={`fa-solid fa-chevron-down text-slate-500 text-xs transition-transform ${isOpen ? 'rotate-180' : ''}`}></i>
      </div>
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="p-2 border-b border-slate-800">
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search..." className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 outline-none" autoFocus />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.map(u => (
              <div key={u} onClick={() => { onSelect(u); setIsOpen(false); setSearchTerm(''); }}
                className={`px-4 py-2 cursor-pointer text-sm transition-colors ${preferredUniverse === u ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300 hover:bg-slate-800'}`}>
                {preferredUniverse === u && <i className="fa-solid fa-check text-blue-400 text-xs mr-2"></i>}{u}
              </div>
            ))}
            {filteredOptions.length === 0 && <div className="px-4 py-3 text-slate-500 text-sm italic text-center">{noMatchesLabel}</div>}
          </div>
        </div>
      )}
    </div>
  );
};

const InputForm: React.FC<Props> = ({ onSubmit, onSaveDraft, showToast, initialValues, userPlan, avatars, onSaveAvatar, onUpdateAvatar, onDeleteAvatar, competitorData, competitorLoading, onRefreshResearch, onRankingsLoaded }) => {
  const { t, lang: appLang } = useT();
  const getInitialInputs = (): AdInputs => {
    if (initialValues) return initialValues;
    try {
      const saved = localStorage.getItem('adInputsDraft');
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...parsed, personalPhotos: [], brandLogos: [] };
      }
    } catch (e) {
      console.warn('Failed to load saved draft:', e);
    }
    return getDefaultInputs();
  };

  const [inputs, setInputs] = useState<AdInputs>(() => {
    const raw = getInitialInputs();
    // Enforce limits for legacy projects
    const sanitized = {
      ...raw,
      personalPhotos: (raw.personalPhotos || []).slice(0, 5),
      brandLogos: (raw.brandLogos || []).slice(0, 1),
    };
    // ═══ LEGACY MODE SANITIZATION ═══
    // Old saved drafts/projects may contain removed modes (premium_package, community_card, etc.)
    // or removed offer types (Direct Sale, SaaS Trial, Membership).
    // Sanitize to prevent silent degradation.
    if (sanitized.offerCreativeMode) {
      const validModeIds = new Set(Object.keys(CREATIVE_MODE_CATALOG));
      const cleaned = (sanitized.offerCreativeMode as string[]).filter(m => validModeIds.has(m));
      if (cleaned.length !== (sanitized.offerCreativeMode as string[]).length) {
        const removed = (sanitized.offerCreativeMode as string[]).filter(m => !validModeIds.has(m));
        console.warn(`🧹 Legacy mode sanitization: removed [${removed.join(', ')}] from saved draft`);
      }
      sanitized.offerCreativeMode = (cleaned.length > 0 ? cleaned : ['standard_hero']) as any;
    }
    // Sanitize removed offer types → fall back to Mini-Course
    if (sanitized.offerType && !OFFER_TYPES.includes(sanitized.offerType)) {
      console.warn(`🧹 Legacy offer type sanitization: "${sanitized.offerType}" → "Mini-Course"`);
      sanitized.offerType = 'Mini-Course';
    }
    // Normalize visual style family — ensure both fields are consistent
    const _normalizedStyle = ((sanitized as any).visualStyleFamily ?? (sanitized as any).universeMode ?? 'realistic') as 'realistic' | 'fantasy' | 'minimal';
    (sanitized as any).visualStyleFamily = _normalizedStyle;
    (sanitized as any).universeMode = _normalizedStyle;
    (() => {
        const modeCatalog = CREATIVE_MODE_CATALOG as Record<string, any>;
        const currentModes = (sanitized.offerCreativeMode || []) as string[];
        const validModes = currentModes.filter(m => modeCatalog[m]);
        if (validModes.length !== currentModes.length) {
            (sanitized as any).offerCreativeMode = ['standard_hero'];
        }
        const hiddenLangs = ['fr', 'es', 'de', 'tr', 'pt'];
        if (hiddenLangs.includes(sanitized.adLanguage || '')) {
            sanitized.adLanguage = 'ar_fusha';
        }
    })();
    return sanitized;
  });
  const [hasDraft] = useState(() => !!localStorage.getItem('adInputsDraft') && !initialValues);
  /** Canonical visual style — reads visualStyleFamily first, falls back to universeMode */
  const activeStyle = (inputs.visualStyleFamily ?? inputs.universeMode ?? 'realistic') as 'realistic' | 'fantasy' | 'minimal';

  /** text_only mode: hides universe selector and Box A photos */
  const isTextOnlyActive = (inputs.offerCreativeMode || []).includes('text_only' as any);

  const launchSurfaceResult = React.useMemo(() => validateLaunchSurface({
      selectedModes: inputs.offerCreativeMode || [],
      campaignType: inputs.campaignType,
      adFormat: inputs.adMode,
      hookAngle: inputs.coldHookAngle,
  }), [inputs.offerCreativeMode, inputs.campaignType, inputs.adMode, inputs.coldHookAngle]);

  const personalRef = useRef<HTMLInputElement>(null);
  const brandRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'personal' | 'brand' | 'offer' | 'testimonial' | 'reference' | 'referenceAd' | null>(null);

  // ─── PLAN-BASED ACCESS ───────────────────────────────────────────────
  const allowRetargeting = canUse(userPlan, 'retargeting');
  const allowFantasy = canUse(userPlan, 'fantasyUniverses');
  const allowBrandUrl = canUse(userPlan, 'brandUrlScraping');
  const allowCompetitorResearch = canUse(userPlan, 'competitorResearch');

  // ─── AUDIENCE AVATAR STATE ─────────────────────────────────────────────
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>('');
  const [showSaveAvatar, setShowSaveAvatar] = useState(false);
  const [avatarName, setAvatarName] = useState('');

  // ─── RANKING RECOMMENDATIONS (Ticket 4) ────────────────────────────────
  const [rankings, setRankings] = useState<RankingResultCompact | null>(null);
  const [rankingsLoading, setRankingsLoading] = useState(false);

  // Derive universeCategory from preferredUniverse using already-imported universe database
  const derivedUniverseCategory = React.useMemo(() => {
    const name = inputs.preferredUniverse;
    if (!name || name.startsWith('Surprise Me') || name === 'Custom / Insert Your Own Atmosphere') return undefined;
    const entry = [...DB_REALISTIC, ...DB_FANTASY].find(u => u.name === name);
    return entry?.category || undefined;
  }, [inputs.preferredUniverse]);

  // Derive pairCandidates from selected modes
  const derivedPairCandidate = React.useMemo(() => {
    const modes = inputs.offerCreativeMode || ['standard_hero'];
    return [...modes].sort().join('+');
  }, [inputs.offerCreativeMode]);

  React.useEffect(() => {
    const uid = getAuth().currentUser?.uid;
    if (!uid || !inputs.productCategory) return;
    let cancelled = false;
    setRankingsLoading(true);
    gemini.fetchRankings({
      userId: uid,
      niche: inputs.productCategory || undefined,
      offerType: inputs.offerType || undefined,
      funnelStage: inputs.campaignType || undefined,
      language: inputs.adLanguage || undefined,
      aspectRatio: inputs.aspectRatio || undefined,
      selectedModes: inputs.offerCreativeMode || ['standard_hero'],
      referenceAdUsed: !!(inputs.referenceAd),
      hookAngleCandidates: inputs.coldHookAngle ? [inputs.coldHookAngle] : undefined,
      pairCandidates: derivedPairCandidate ? [derivedPairCandidate] : undefined,
      universeCategory: derivedUniverseCategory,
    }).then(r => { if (!cancelled) { setRankings(r); onRankingsLoaded?.(r); } })
      .catch(() => { if (!cancelled) setRankings(null); })
      .finally(() => { if (!cancelled) setRankingsLoading(false); });
    return () => { cancelled = true; };
  }, [inputs.productCategory, inputs.offerType, inputs.campaignType, inputs.adLanguage, inputs.aspectRatio, inputs.referenceAd, inputs.coldHookAngle, derivedPairCandidate, derivedUniverseCategory]);

  // ─── COLLAPSIBLE SECTIONS ──────────────────────────────────────────────
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [exampleField, setExampleField] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // ── Progress bar calculation ────────────────────────────────────────
  const progressFields = [
    { filled: !!inputs.productName, weight: 1 },
    { filled: !!inputs.targetAudience, weight: 1 },
    { filled: !!inputs.challenges, weight: 1 },
    { filled: !!inputs.transformation, weight: 1 },
    { filled: !!inputs.cta, weight: 1 },
    { filled: (inputs.personalPhotos?.length || 0) > 0, weight: 1 },
  ];
  const progressPercent = Math.round((progressFields.filter(f => f.filled).length / progressFields.length) * 100);

  // ─── COMPETITOR RESEARCH STATE ─────────────────────────────────────────
  const [researchStep, setResearchStep] = useState(0);
  const [usedItems, setUsedItems] = useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!competitorLoading) { setResearchStep(0); return; }
    const steps = [{ delay: 0 }, { delay: 3000 }, { delay: 7000 }, { delay: 12000 }, { delay: 18000 }];
    const timers = steps.map((s, i) => setTimeout(() => setResearchStep(i), s.delay));
    return () => timers.forEach(t => clearTimeout(t));
  }, [competitorLoading]);

  const allowedRatios = ASPECT_RATIOS.filter(r => canUseRatio(userPlan, r.value));

  const buildAvatarPayload = (name: string) => ({
    name,
    productName: inputs.productName,
    productCategory: inputs.productCategory || '',
    targetAudience: inputs.targetAudience,
    challenges: inputs.challenges,
    transformation: inputs.transformation,
    offerType: inputs.offerType,
    cta: inputs.cta,
    brandUrl: inputs.brandUrl,
    brandColorPrimary: inputs.brandColorPrimary,
    brandColorSecondary: inputs.brandColorSecondary,
    badges: inputs.badges,
    // Campaign & hooks
    campaignType: inputs.campaignType,
    coldHookAngle: inputs.coldHookAngle,
    hookType: inputs.hookType,
    adTone: inputs.adTone,
    copywritingStrategy: inputs.copywritingStrategy,
    offerCreativeMode: inputs.offerCreativeMode,
    // Value Stack
    valueStackTitle: inputs.valueStackTitle,
    valueStackItems: inputs.valueStackItems,
    valueStackBonuses: inputs.valueStackBonuses,
    valueStackPrice: inputs.valueStackPrice,
    valueStackSavings: inputs.valueStackSavings,
    valueStackOriginalValue: inputs.valueStackOriginalValue,
    valueStackGuarantee: inputs.valueStackGuarantee,
    valueStackDeliveryFormat: inputs.valueStackDeliveryFormat,
    valueStackProofStatement: inputs.valueStackProofStatement,
    // Event Ticket
    eventTitle: inputs.eventTitle,
    eventDate: inputs.eventDate,
    eventTime: inputs.eventTime,
    eventLocation: inputs.eventLocation,
    eventHost: inputs.eventHost,
    eventSeatLimit: inputs.eventSeatLimit,
    eventTicketTier: inputs.eventTicketTier,
    // Feature Grid
    featureList: inputs.featureList,
    featureDescriptions: inputs.featureDescriptions,
    featureIcons: inputs.featureIcons,
    featureGroupLabel: inputs.featureGroupLabel,
    // Offer Card
    offerCardTitle: inputs.offerCardTitle,
    offerCardPrice: inputs.offerCardPrice,
    offerCardOldPrice: inputs.offerCardOldPrice,
    offerCardDiscount: inputs.offerCardDiscount,
    offerCardInclusions: inputs.offerCardInclusions,
    offerCardPaymentPlan: inputs.offerCardPaymentPlan,
    offerCardGuarantee: inputs.offerCardGuarantee,
    // Testimonial
    testimonialManualText: inputs.testimonialManualText,
    testimonialSpeakerName: inputs.testimonialSpeakerName,
    // Dashboard
    appDashboardLabel: inputs.appDashboardLabel,
    appKeyMetric: inputs.appKeyMetric,
    // Authority
    authorityCredentials: inputs.authorityCredentials,
    authorityNumbers: inputs.authorityNumbers,
    // Module Preview
    moduleTitles: inputs.moduleTitles,
    moduleLabels: inputs.moduleLabels,
    // Book Mockup
    guideTitle: inputs.guideTitle,
    guideSubtitle: inputs.guideSubtitle,
    guideFormat: inputs.guideFormat,
    // Device Mockup
    deviceContentTitle: inputs.deviceContentTitle,
    deviceScreenLabels: inputs.deviceScreenLabels,
    // Speaker Card
    speakerName: inputs.speakerName,
    speakerRole: inputs.speakerRole,
    speakerCredentials: inputs.speakerCredentials,
    speakerAffiliation: inputs.speakerAffiliation,
    // Day Strip
    dayNodes: inputs.dayNodes,
    dayDates: inputs.dayDates,
    dayMilestones: inputs.dayMilestones,
    // Retargeting
    retargetingObjection: inputs.retargetingObjection,
    customObjection: inputs.customObjection,
    testimonial: inputs.testimonial,
    // Visual & mode
    aspectRatio: inputs.aspectRatio,
    extraRatios: inputs.extraRatios,
    universeMode: inputs.universeMode,
    visualStyleFamily: inputs.visualStyleFamily,
    preferredUniverse: inputs.preferredUniverse,
    customUniverseDetails: inputs.customUniverseDetails,
    adLanguage: inputs.adLanguage,
    adMode: inputs.adMode,
    slideCount: inputs.slideCount,
    competitorContext: inputs.competitorContext,
    // Angle-specific
    urgencyDetails: inputs.urgencyDetails,
    scarcityDetails: inputs.scarcityDetails,
    proofSnippets: inputs.proofSnippets,
    statsData: inputs.statsData,
    authoritySignals: inputs.authoritySignals,
    storySeed: inputs.storySeed,
  });

  const loadAvatar = (avatarId: string) => {
    if (!avatarId) return;
    const avatar = avatars.find(a => a.id === avatarId);
    if (!avatar) return;
    setSelectedAvatarId(avatarId);
    setInputs(prev => ({
      ...prev,
      productName: avatar.productName,
      productCategory: avatar.productCategory || '',
      targetAudience: avatar.targetAudience,
      challenges: avatar.challenges,
      transformation: avatar.transformation,
      offerType: avatar.offerType,
      cta: avatar.cta,
      brandUrl: avatar.brandUrl || '',
      brandColorPrimary: avatar.brandColorPrimary || '',
      brandColorSecondary: avatar.brandColorSecondary || '',
      badges: avatar.badges || '',
      // Campaign & hooks
      ...(avatar.campaignType && { campaignType: avatar.campaignType }),
      ...(avatar.coldHookAngle && { coldHookAngle: avatar.coldHookAngle }),
      ...(avatar.hookType && { hookType: avatar.hookType }),
      ...(avatar.adTone && { adTone: avatar.adTone }),
      ...(avatar.copywritingStrategy && { copywritingStrategy: avatar.copywritingStrategy }),
      ...(avatar.offerCreativeMode && { offerCreativeMode: avatar.offerCreativeMode }),
      // Value Stack
      ...(avatar.valueStackTitle && { valueStackTitle: avatar.valueStackTitle }),
      ...(avatar.valueStackItems && { valueStackItems: avatar.valueStackItems }),
      ...(avatar.valueStackBonuses && { valueStackBonuses: avatar.valueStackBonuses }),
      ...(avatar.valueStackPrice && { valueStackPrice: avatar.valueStackPrice }),
      ...(avatar.valueStackSavings && { valueStackSavings: avatar.valueStackSavings }),
      ...(avatar.valueStackOriginalValue && { valueStackOriginalValue: avatar.valueStackOriginalValue }),
      ...(avatar.valueStackGuarantee && { valueStackGuarantee: avatar.valueStackGuarantee }),
      ...(avatar.valueStackDeliveryFormat && { valueStackDeliveryFormat: avatar.valueStackDeliveryFormat }),
      ...(avatar.valueStackProofStatement && { valueStackProofStatement: avatar.valueStackProofStatement }),
      // Event Ticket
      ...(avatar.eventTitle && { eventTitle: avatar.eventTitle }),
      ...(avatar.eventDate && { eventDate: avatar.eventDate }),
      ...(avatar.eventTime && { eventTime: avatar.eventTime }),
      ...(avatar.eventLocation && { eventLocation: avatar.eventLocation }),
      ...(avatar.eventHost && { eventHost: avatar.eventHost }),
      ...(avatar.eventSeatLimit && { eventSeatLimit: avatar.eventSeatLimit }),
      ...(avatar.eventTicketTier && { eventTicketTier: avatar.eventTicketTier }),
      // Feature Grid
      ...(avatar.featureList && { featureList: avatar.featureList }),
      ...(avatar.featureDescriptions && { featureDescriptions: avatar.featureDescriptions }),
      ...(avatar.featureIcons && { featureIcons: avatar.featureIcons }),
      ...(avatar.featureGroupLabel && { featureGroupLabel: avatar.featureGroupLabel }),
      // Offer Card
      ...(avatar.offerCardTitle && { offerCardTitle: avatar.offerCardTitle }),
      ...(avatar.offerCardPrice && { offerCardPrice: avatar.offerCardPrice }),
      ...(avatar.offerCardOldPrice && { offerCardOldPrice: avatar.offerCardOldPrice }),
      ...(avatar.offerCardDiscount && { offerCardDiscount: avatar.offerCardDiscount }),
      ...(avatar.offerCardInclusions && { offerCardInclusions: avatar.offerCardInclusions }),
      ...(avatar.offerCardPaymentPlan && { offerCardPaymentPlan: avatar.offerCardPaymentPlan }),
      ...(avatar.offerCardGuarantee && { offerCardGuarantee: avatar.offerCardGuarantee }),
      // Testimonial
      ...(avatar.testimonialManualText && { testimonialManualText: avatar.testimonialManualText }),
      ...(avatar.testimonialSpeakerName && { testimonialSpeakerName: avatar.testimonialSpeakerName }),
      // Dashboard
      ...(avatar.appDashboardLabel && { appDashboardLabel: avatar.appDashboardLabel }),
      ...(avatar.appKeyMetric && { appKeyMetric: avatar.appKeyMetric }),
      // Authority
      ...(avatar.authorityCredentials && { authorityCredentials: avatar.authorityCredentials }),
      ...(avatar.authorityNumbers && { authorityNumbers: avatar.authorityNumbers }),
      // Module Preview
      ...(avatar.moduleTitles && { moduleTitles: avatar.moduleTitles }),
      ...(avatar.moduleLabels && { moduleLabels: avatar.moduleLabels }),
      // Book Mockup
      ...(avatar.guideTitle && { guideTitle: avatar.guideTitle }),
      ...(avatar.guideSubtitle && { guideSubtitle: avatar.guideSubtitle }),
      ...(avatar.guideFormat && { guideFormat: avatar.guideFormat }),
      // Device Mockup
      ...(avatar.deviceContentTitle && { deviceContentTitle: avatar.deviceContentTitle }),
      ...(avatar.deviceScreenLabels && { deviceScreenLabels: avatar.deviceScreenLabels }),
      // Speaker Card
      ...(avatar.speakerName && { speakerName: avatar.speakerName }),
      ...(avatar.speakerRole && { speakerRole: avatar.speakerRole }),
      ...(avatar.speakerCredentials && { speakerCredentials: avatar.speakerCredentials }),
      ...(avatar.speakerAffiliation && { speakerAffiliation: avatar.speakerAffiliation }),
      // Day Strip
      ...(avatar.dayNodes && { dayNodes: avatar.dayNodes }),
      ...(avatar.dayDates && { dayDates: avatar.dayDates }),
      ...(avatar.dayMilestones && { dayMilestones: avatar.dayMilestones }),
      // Retargeting
      ...(avatar.retargetingObjection && { retargetingObjection: avatar.retargetingObjection }),
      ...(avatar.customObjection && { customObjection: avatar.customObjection }),
      ...(avatar.testimonial && { testimonial: avatar.testimonial }),
      // Visual & mode
      ...(avatar.aspectRatio && { aspectRatio: avatar.aspectRatio }),
      ...(avatar.extraRatios && { extraRatios: avatar.extraRatios }),
      ...(avatar.universeMode && { universeMode: avatar.universeMode }),
      ...(avatar.visualStyleFamily && { visualStyleFamily: avatar.visualStyleFamily }),
      ...(avatar.preferredUniverse && { preferredUniverse: avatar.preferredUniverse }),
      ...(avatar.customUniverseDetails && { customUniverseDetails: avatar.customUniverseDetails }),
      ...(avatar.adLanguage && { adLanguage: avatar.adLanguage }),
      ...(avatar.adMode && { adMode: avatar.adMode }),
      ...(avatar.slideCount && { slideCount: avatar.slideCount }),
      ...(avatar.competitorContext && { competitorContext: avatar.competitorContext }),
      // Angle-specific
      ...(avatar.urgencyDetails && { urgencyDetails: avatar.urgencyDetails }),
      ...(avatar.scarcityDetails && { scarcityDetails: avatar.scarcityDetails }),
      ...(avatar.proofSnippets && { proofSnippets: avatar.proofSnippets }),
      ...(avatar.statsData && { statsData: avatar.statsData }),
      ...(avatar.authoritySignals && { authoritySignals: avatar.authoritySignals }),
      ...(avatar.storySeed && { storySeed: avatar.storySeed }),
    }));
    setInputs(prev => {
        const adjusted = { ...prev };
        const adjustments: string[] = [];
        const modeCatalog = CREATIVE_MODE_CATALOG as Record<string, any>;
        const currentModes = (adjusted.offerCreativeMode || []) as string[];
        const validModes = currentModes.filter(m => modeCatalog[m]);
        if (validModes.length !== currentModes.length) {
            adjusted.offerCreativeMode = ['standard_hero'] as any;
            adjustments.push('modes');
        }
        const hiddenLangs = ['fr', 'es', 'de', 'tr', 'pt'];
        if (hiddenLangs.includes(adjusted.adLanguage || '')) {
            adjusted.adLanguage = 'ar_fusha';
            adjustments.push('language');
        }
        if (adjustments.length > 0 && showToast) {
            showToast(appLang === 'ar' ? 'تم تعديل بعض الإعدادات للتوافق.' : 'Some settings were adjusted for compatibility.', 'info');
        }
        return adjusted;
    });
    if (showToast) showToast(`Loaded "${avatar.name}"`, 'info');
  };

  const handleSaveAvatar = () => {
    if (!avatarName.trim()) return;
    const trimmedName = avatarName.trim();
    // ═══ DUPLICATE AVATAR-NAME PROTECTION ═══
    const existingAvatar = avatars.find(a => a.name.toLowerCase() === trimmedName.toLowerCase());
    if (existingAvatar) {
      const overwrite = confirm(
        appLang === 'ar'
          ? `يوجد أفاتار باسم "${trimmedName}" بالفعل. هل تريد استبداله؟`
          : `An avatar named "${trimmedName}" already exists. Overwrite it?`
      );
      if (!overwrite) {
        // Auto-suggest a suffixed name
        const suffix = ` (${new Date().toLocaleDateString()})`;
        setAvatarName(trimmedName + suffix);
        if (showToast) showToast(appLang === 'ar' ? 'تم اقتراح اسم جديد — عدّله أو احفظ' : 'Suggested a new name — edit or save', 'info');
        return;
      }
      // Overwrite: update the existing avatar
      if (onUpdateAvatar) {
        onUpdateAvatar(existingAvatar.id, buildAvatarPayload(trimmedName));
        setAvatarName('');
        setShowSaveAvatar(false);
        if (showToast) showToast(`Avatar "${trimmedName}" overwritten!`, 'success');
        return;
      }
    }
    onSaveAvatar(buildAvatarPayload(trimmedName));
    setAvatarName('');
    setShowSaveAvatar(false);
    if (showToast) showToast(`Avatar "${trimmedName}" saved!`, 'success');
  };

  const handleOverwriteAvatar = () => {
    const avatar = avatars.find(a => a.id === selectedAvatarId);
    if (!avatar) return;
    if (!confirm(`Overwrite "${avatar.name}" with current form data?`)) return;
    onUpdateAvatar(selectedAvatarId, buildAvatarPayload(avatar.name));
    if (showToast) showToast(`Avatar "${avatar.name}" updated!`, 'success');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'personal' | 'brand') => {
    const files = e.target.files;
    if (!files) return;
    setError(null);
    const newFiles = Array.from(files) as File[];
    const max = category === 'personal' ? 5 : 1;
    const current = category === 'personal' ? (inputs.personalPhotos?.length || 0) : (inputs.brandLogos?.length || 0);
    if (current + newFiles.length > max) {
      setError(`Maximum ${max} ${category === 'personal' ? 'photos' : 'logo'} allowed.`);
      return;
    }
    try {
      const base64Promises = newFiles.map(file => compressImage(file));
      const base64s = await Promise.all(base64Promises);
      setInputs(prev => ({
        ...prev,
        [category === 'personal' ? 'personalPhotos' : 'brandLogos']: [
          ...(category === 'personal' ? (prev.personalPhotos || []) : (prev.brandLogos || [])),
          ...base64s
        ]
      }));

    } catch (err) {
      console.error("Image processing failed", err);
      setError("Failed to process one or more images. Please try simpler files.");
    }
  };

  const removeFile = (idx: number, category: 'personal' | 'brand') => {
    setInputs(prev => {
      const key = category === 'personal' ? 'personalPhotos' : 'brandLogos';
      const updated = (category === 'personal' ? prev.personalPhotos : prev.brandLogos)?.filter((_, i) => i !== idx);
      return { ...prev, [key]: updated };
    });
  };

  // ─── DRAG & DROP HANDLER FOR UPLOAD ZONES ────────────────────────────
  const handleDrop = async (e: React.DragEvent, category: 'personal' | 'brand' | 'offer' | 'testimonial' | 'reference' | 'referenceAd') => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverZone(null);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;

    if (category === 'reference') {
      // Single image only — take the first valid file
      const file = files[0];
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) return;
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        setInputs(prev => ({ ...prev, referenceImage: base64 }));
      } catch (err) {
        console.error("Drop reference image failed", err);
      }
      return;
    }

    if (category === 'referenceAd') {
      const file = files[0];
      const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
      if (!validTypes.includes(file.type)) return;
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        setInputs(prev => ({ ...prev, referenceAd: base64 }));
      } catch (err) {
        console.error("Drop reference ad failed", err);
      }
      return;
    }

    if (category === 'offer') {
      const max = 3;
      const current = (inputs.offerAssets || []).length;
      const toProcess = files.slice(0, max - current);
      if (toProcess.length === 0) return;
      try {
        for (const file of toProcess) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve) => {
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          setInputs(prev => ({ ...prev, offerAssets: [...(prev.offerAssets || []), base64].slice(0, 3) }));
        }
      } catch (err) {
        console.error("Drop offer asset failed", err);
      }
      return;
    }

    if (category === 'testimonial') {
      const max = 4;
      const current = ((inputs as any).testimonialScreenshots || []).length;
      const toProcess = files.slice(0, max - current);
      if (toProcess.length === 0) return;
      try {
        for (const file of toProcess) {
          const compressed = await compressImage(file);
          setInputs((prev: any) => ({
            ...prev,
            testimonialScreenshots: [...(prev.testimonialScreenshots || []), compressed].slice(0, 4),
          }));
        }
      } catch (err) {
        console.error("Drop testimonial screenshot failed", err);
      }
      return;
    }

    // Original personal/brand logic
    const max = category === 'personal' ? 5 : 1;
    const current = category === 'personal' ? (inputs.personalPhotos?.length || 0) : (inputs.brandLogos?.length || 0);
    if (current + files.length > max) {
      setError(`Maximum ${max} ${category === 'personal' ? 'photos' : 'logo'} allowed.`);
      return;
    }
    try {
      const base64s = await Promise.all(files.map(f => compressImage(f)));
      setInputs(prev => ({
        ...prev,
        [category === 'personal' ? 'personalPhotos' : 'brandLogos']: [
          ...(category === 'personal' ? (prev.personalPhotos || []) : (prev.brandLogos || [])),
          ...base64s
        ]
      }));

    } catch (err) {
      console.error("Drop image processing failed", err);
      setError("Failed to process dropped images.");
    }
  };

  const dropZoneProps = (category: 'personal' | 'brand' | 'offer' | 'testimonial' | 'reference' | 'referenceAd') => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOverZone(category); },
    onDragEnter: (e: React.DragEvent) => { e.preventDefault(); setDragOverZone(category); },
    onDragLeave: (e: React.DragEvent) => { e.preventDefault(); setDragOverZone(null); },
    onDrop: (e: React.DragEvent) => handleDrop(e, category),
  });

  const isCustomUniverse = inputs.preferredUniverse === "🎨 Custom World" || inputs.preferredUniverse === "Custom World" || inputs.preferredUniverse === "Custom / Insert Your Own Atmosphere";

  // ─── RENDER ────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto animate-in fade-in duration-700">

      {/* ── HEADER ── */}
      <div className="text-center mb-10" style={{ animationDelay: '0ms' }}>
        <h1 className="text-5xl md:text-6xl font-black text-white italic tracking-tight leading-none">
          Ad <span className="text-blue-500">Blueprint</span>
        </h1>
        <p className="text-slate-500 text-sm mt-3 max-w-md mx-auto">
          Configure the strategic and visual DNA for your ad.
        </p>
        {hasDraft && (
          <div className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 bg-emerald-500/10 rounded-lg text-emerald-400 text-xs">
            <i className="fa-solid fa-clock-rotate-left"></i> Draft restored
            <button type="button" onClick={() => { localStorage.removeItem('adInputsDraft'); window.location.reload(); }} className="text-slate-400 hover:text-white underline ml-2">Clear</button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (inputs.campaignType === 'retargeting') {
            const hasObj = !!inputs.retargetingObjection;
            const hasCustom = (inputs.customObjection || '').trim().length > 0;
            if (!hasObj && !hasCustom) {
              if (showToast) showToast(t('form.objection_required'), 'error');
              return;
            }
          }
          // ═══ CATEGORY C VALIDATION: Block generation if required fields missing ═══
          const selectedModes = inputs.offerCreativeMode || ['standard_hero'];
          const modeValidation = validateModeFields(selectedModes, inputs as any);

          // Show first error
          if (!modeValidation.valid && modeValidation.errors.length > 0) {
            const err = modeValidation.errors[0];
            if (showToast) showToast(appLang === 'ar' ? err.messageAr : err.messageEn, 'error');
            return;
          }

          // Apply safe downgrades (swap mode but don't block)
          if (modeValidation.downgrades.length > 0) {
            let modesChanged: string[] = [...selectedModes];
            for (const dg of modeValidation.downgrades) {
              modesChanged = modesChanged.map(m => m === dg.fromMode ? dg.toMode : m);
              if (showToast) showToast(
                appLang === 'ar'
                  ? `${dg.reasonAr} — تم التحويل إلى الوضع الافتراضي.`
                  : `${dg.reasonEn} — Downgraded to default mode.`,
                'info'
              );
            }
            inputs.offerCreativeMode = [...new Set(modesChanged)] as typeof inputs.offerCreativeMode;
          }

          // Testimonial Wall: enforce carousel + require screenshots
          const hasMode = (id: string) => (inputs.offerCreativeMode || []).includes(id as any);
          if (hasMode('testimonial_wall')) {
            const screenshots = (inputs as any).testimonialScreenshots || [];
            if (screenshots.length === 0) {
              if (showToast) showToast(appLang === 'ar' ? 'ارفع لقطة شاشة واحدة على الأقل للشهادات' : 'Upload at least one testimonial screenshot.', 'error');
              return;
            }
            // Auto-switch to carousel if not already
            if (inputs.adMode !== 'carousel') {
              inputs.adMode = 'carousel' as any;
              inputs.slideCount = Math.min(screenshots.length + 1, 5); // +1 for hook slide
            }
          }
          {/* Spec G: when testimonial screenshots are uploaded AND adMode === 'single', auto-switch to carousel: setInputs(prev => ({ ...prev, adMode: 'carousel', slideCount: Math.min(3, getMaxSlides(userPlan)) })); if (showToast) showToast(t('override.testimonial_requires_carousel'), 'info'); */}
          onSubmit(inputs);
        }}
        className="space-y-6 pb-32"
      >

        {/* ═══ PROGRESS BAR ═══ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 tracking-wide">{t('form.progress')}</span>
            <span className={`text-[10px] font-black tracking-wide ${progressPercent === 100 ? 'text-emerald-400' : 'text-blue-400'}`}>{progressPercent}%</span>
          </div>
          <div className="h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ease-out ${progressPercent === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressPercent}%` }}></div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: AVATAR + COMPETITOR (always visible)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3" style={{ animationDelay: '50ms' }}>

          {/* Avatar section header */}
          <SectionTitle icon="fa-users" title={t('avatar.title')} badge={avatars.length > 0 ? <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{avatars.length} saved</span> : undefined} />

          <div className="bg-slate-900/30 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {/* Avatar chips */}
              <button type="button" onClick={() => { setSelectedAvatarId(''); }} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${!selectedAvatarId ? 'bg-slate-700 text-white' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
                None
              </button>
              {avatars.map(a => (
                <button key={a.id} type="button" onClick={() => loadAvatar(a.id)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${selectedAvatarId === a.id ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
                  {a.name}
                </button>
              ))}
            </div>

            {/* Avatar actions */}
            <div className="flex items-center gap-2 border-t border-slate-800/40 pt-3">
              {selectedAvatarId && (
                <>
                  <button type="button" onClick={handleOverwriteAvatar} disabled={!inputs.productName || !inputs.targetAudience} className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-400 text-[10px] font-bold hover:bg-blue-500/20 transition-all disabled:opacity-30">
                    <i className="fa-solid fa-floppy-disk mr-1"></i>Save
                  </button>
                  <button type="button" onClick={() => { const name = avatars.find(a => a.id === selectedAvatarId)?.name; if (confirm(`Delete "${name}"?`)) { onDeleteAvatar(selectedAvatarId); setSelectedAvatarId(''); if (showToast) showToast(`Avatar "${name}" deleted`, 'info'); } }} className="px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-bold hover:bg-red-500/20 transition-all">
                    <i className="fa-solid fa-trash mr-1"></i>Delete
                  </button>
                </>
              )}
              {!showSaveAvatar ? (
                <button type="button" onClick={() => setShowSaveAvatar(true)} disabled={!inputs.productName || !inputs.targetAudience} className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-all disabled:opacity-30">
                  <i className="fa-solid fa-plus mr-1"></i>Save as New
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="text" value={avatarName} onChange={(e) => setAvatarName(e.target.value)} placeholder="Avatar name..." className="bg-slate-950/70 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-white text-xs outline-none w-40" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleSaveAvatar())} autoFocus />
                  <button type="button" onClick={handleSaveAvatar} disabled={!avatarName.trim()} className="px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-xs hover:bg-emerald-500 disabled:opacity-40"><i className="fa-solid fa-check"></i></button>
                  <button type="button" onClick={() => { setShowSaveAvatar(false); setAvatarName(''); }} className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white"><i className="fa-solid fa-xmark"></i></button>
                </div>
              )}
            </div>
            {avatars.length === 0 && <p className="text-slate-600 text-xs italic">No avatars yet. Fill the form and click "Save as New".</p>}
          </div>

          {/* Category / Niche + Competitor Intelligence */}
          {allowCompetitorResearch ? (
            <div className="bg-slate-900/40 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3 mb-1">
                <i className="fa-solid fa-crosshairs text-amber-400 text-sm"></i>
                <span className="text-sm font-semibold text-slate-300">{t('competitor.title')}</span>
                <span className="text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full font-bold">Pro & Scaling</span>
                {competitorData && <span className="text-[10px] text-emerald-400"><i className="fa-solid fa-check-circle mr-1"></i>{competitorData.competitors.length} found</span>}
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label>Category / Niche <span className="text-amber-400/50 text-[9px]">(in English — powers research)</span></Label>
                  <textarea value={inputs.productCategory} onChange={e => setInputs({ ...inputs, productCategory: e.target.value })} className={`${inputCls} h-20 resize-none`} placeholder="e.g. Online business coaching for Arabic-speaking trainers who sell courses and consulting" />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onRefreshResearch(inputs); }}
                    disabled={competitorLoading || !inputs.productName || !inputs.productCategory || !inputs.targetAudience}
                    className="px-5 py-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap border border-amber-500/20 hover:border-amber-500/40"
                  >
                    {competitorLoading ? <><i className="fa-solid fa-spinner fa-spin"></i> Scanning...</> : <><i className="fa-solid fa-crosshairs"></i> Run Research</>}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-900/30 rounded-xl p-5 flex items-center justify-between opacity-60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-600 text-sm"><i className="fa-solid fa-crosshairs"></i></div>
                <span className="text-sm font-semibold text-slate-500">{t('competitor.title')}</span>
              </div>
              <LockedBadge requiredPlan={requiredPlanFor('competitorResearch')} />
            </div>
          )}

          {allowCompetitorResearch && (competitorData || competitorLoading) && (
            <div className="bg-slate-900/30 rounded-xl p-5 animate-in fade-in slide-in-from-top-2 duration-300 space-y-4">
              {/* Loading */}
              {competitorLoading && (
                <div className="space-y-4">
                  <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all duration-[2500ms] ease-out" style={{ width: `${Math.min(15 + researchStep * 20, 95)}%` }}></div>
                  </div>
                  <div className="space-y-2">
                    {['Generating search queries...', 'Searching Google...', 'Scraping competitor data...', 'Analyzing gaps...', 'Generating angles...'].map((step, i) => (
                      <div key={i} className={`flex items-center gap-2 transition-all duration-500 ${i < researchStep ? 'opacity-40' : i === researchStep ? 'opacity-100' : 'opacity-20'}`}>
                        {i < researchStep ? <i className="fa-solid fa-circle-check text-emerald-500 text-[10px] w-4 text-center"></i>
                          : i === researchStep ? <i className="fa-solid fa-circle-dot text-amber-400 text-[10px] w-4 text-center animate-pulse"></i>
                            : <i className="fa-solid fa-circle text-slate-700 text-[6px] w-4 text-center"></i>}
                        <span className={`text-[10px] font-medium ${i < researchStep ? 'text-slate-600 line-through' : i === researchStep ? 'text-amber-400' : 'text-slate-700'}`}>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results */}
              {competitorData && !competitorLoading && (
                <div className="space-y-4">
                  {/* Competitors */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-slate-400 mb-2"><i className="fa-solid fa-building mr-1.5"></i>Competitors Found</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {competitorData.competitors.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 p-2.5 bg-slate-950/40 rounded-lg">
                          <span className="text-slate-600 text-[10px] font-bold mt-0.5">{i + 1}</span>
                          <div className="min-w-0">
                            <div className="text-white text-xs font-semibold truncate">{c.name}</div>
                            <div className="text-slate-500 text-[10px] truncate">{c.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Angles */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-emerald-400 mb-2"><i className="fa-solid fa-bolt mr-1.5"></i>Differentiation Angles</h4>
                    <div className="space-y-2">
                      {competitorData.angles.map((a, i) => (
                        <div key={i} className="p-3 bg-emerald-500/5 rounded-lg space-y-1.5">
                          <div className="flex items-center justify-between">
                            <h5 className="text-white text-xs font-bold">{a.title}</h5>
                            <button type="button" onClick={() => { const key = `angle-${i}`; if (usedItems.has(key)) return; setUsedItems(prev => new Set(prev).add(key)); setInputs(prev => ({ ...prev, transformation: prev.transformation ? `${prev.transformation} | ${a.explanation}` : a.explanation })); }} className={`text-[9px] font-bold px-2 py-0.5 rounded transition-all ${usedItems.has(`angle-${i}`) ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'}`}>
                              {usedItems.has(`angle-${i}`) ? <><i className="fa-solid fa-check mr-1"></i>Added</> : <><i className="fa-solid fa-plus mr-1"></i>Use</>}
                            </button>
                          </div>
                          <p className="text-slate-400 text-[10px]">{a.explanation}</p>
                          <p className="text-amber-400/70 text-[10px] italic" dir="rtl">"{a.hookSuggestion}"</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Attack Hooks */}
                  <div>
                    <h4 className="text-[11px] font-semibold text-red-400 mb-2"><i className="fa-solid fa-fire mr-1.5"></i>Attack Hooks</h4>
                    <div className="space-y-2">
                      {competitorData.attackHooks.map((hook, i) => (
                        <div key={i} className="p-2.5 bg-red-500/5 rounded-lg flex items-start gap-2">
                          <p className="text-white/90 text-xs flex-1" dir="rtl">{hook}</p>
                          <button type="button" onClick={() => { const key = `hook-${i}`; if (usedItems.has(key)) return; setUsedItems(prev => new Set(prev).add(key)); setInputs(prev => ({ ...prev, challenges: prev.challenges ? `${prev.challenges} | ${hook}` : hook })); }} className={`text-[9px] font-bold px-2 py-0.5 rounded shrink-0 transition-all ${usedItems.has(`hook-${i}`) ? 'bg-red-500/20 text-red-300' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}>
                            {usedItems.has(`hook-${i}`) ? <><i className="fa-solid fa-check mr-1"></i>Added</> : <><i className="fa-solid fa-plus mr-1"></i>Use</>}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!competitorData && !competitorLoading && (
                <p className="text-slate-600 text-xs italic text-center py-2">Fill in your product details and click "Research" to scan the market.</p>
              )}
            </div>
          )}
        </div>


        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: CAMPAIGN TYPE (Top-level toggle)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3" style={{ animationDelay: '100ms' }}>
          <Label>{t('form.campaign_type')}<InfoTip text={t('info.campaign_type')} /></Label>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setInputs(prev => ({ ...prev, campaignType: 'cold', retargetingObjection: undefined, retargetingObjections: [], customObjection: '', testimonial: '' }))}
              className={`py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputs.campaignType === 'cold' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-900/50 text-slate-400 hover:text-white'}`}>
              <i className="fa-solid fa-snowflake"></i> Cold
            </button>
            <button type="button" onClick={() => { if (!allowRetargeting) return; setInputs(prev => ({ ...prev, campaignType: 'retargeting', coldHookAngle: undefined })); }}
              className={`py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${!allowRetargeting ? 'bg-slate-900/30 text-slate-600 cursor-not-allowed' : inputs.campaignType === 'retargeting' ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20' : 'bg-slate-900/50 text-slate-400 hover:text-white'}`}>
              <i className="fa-solid fa-rotate"></i> {t('form.retargeting')}
              {!allowRetargeting && <LockedBadge requiredPlan={requiredPlanFor('retargeting')} />}
            </button>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: AD TONE (Both cold and retargeting)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-0" style={{ animationDelay: '102ms' }}>
          <button type="button" onClick={() => setOpenSections(p => ({ ...p, tone: !p.tone }))}
            className="w-full flex items-center justify-between py-2.5 group">
            <Label>{t('tone.title')}<InfoTip text={t('info.tone')} /></Label>
            <div className="flex items-center gap-2">
              {inputs.adTone && (
                <span className="text-[9px] font-bold text-blue-400 bg-blue-600/10 px-2 py-0.5 rounded">
                  {AD_TONES.find(t => t.id === inputs.adTone)?.emoji} {appLang === "ar" ? AD_TONES.find(t => t.id === inputs.adTone)?.labelAr : AD_TONES.find(t => t.id === inputs.adTone)?.labelEn}
                </span>
              )}
              <i className={`fa-solid fa-chevron-down text-[8px] text-slate-600 transition-transform ${openSections.tone ? 'rotate-180' : ''}`}></i>
            </div>
          </button>
          {openSections.tone && (() => {
            const availableTones = new Set(getAvailableAdTones(userPlan).map(t => t.id));
            return (
            <div className="flex flex-wrap gap-2 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
              {AD_TONES.map(tone => {
                const isLocked = !availableTones.has(tone.id);
                return (
                <button key={tone.id} type="button"
                  onClick={() => { if (isLocked) return; setInputs(prev => ({ ...prev, adTone: prev.adTone === tone.id ? undefined : tone.id as AdTone })); }}
                  className={`px-3 py-2 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1.5 ${isLocked ? 'opacity-50 cursor-not-allowed bg-slate-900/20 text-slate-600 border border-slate-800/20' : inputs.adTone === tone.id ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'bg-slate-900/50 text-slate-500 border border-slate-800/40 hover:text-slate-300'}`}>
                  <span>{tone.emoji}</span>
                  <span>{appLang === "ar" ? tone.labelAr : tone.labelEn}</span>
                  {isLocked && <i className="fa-solid fa-lock text-[6px] ml-0.5"></i>}
                </button>
                );
              })}
            </div>
            );
          })()}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: COLD AD HOOK CONTROLS
        ═══════════════════════════════════════════════════════════════════ */}
        {inputs.campaignType === 'cold' && (
          <div className="bg-slate-900/30 rounded-xl p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="text-xs font-semibold text-blue-400">{t('hook.cold_strategy')}</div>

            {/* Hook Angle */}
            <div className="space-y-0">
              <button type="button" onClick={() => setOpenSections(p => ({ ...p, angle: !p.angle }))}
                className="w-full flex items-center justify-between py-2 group">
                <Label>{t('hook.angle_label')}<InfoTip text={t('info.hook_angle')} /></Label>
                <div className="flex items-center gap-2">
                  {inputs.coldHookAngle && (
                    <span className="text-[9px] font-bold text-blue-400 bg-blue-600/10 px-2 py-0.5 rounded">
                      {appLang === "ar" ? COLD_HOOK_ANGLES.find(a => a.id === inputs.coldHookAngle)?.labelAr : COLD_HOOK_ANGLES.find(a => a.id === inputs.coldHookAngle)?.labelEn}
                    </span>
                  )}
                  <i className={`fa-solid fa-chevron-down text-[8px] text-slate-600 transition-transform ${openSections.angle ? 'rotate-180' : ''}`}></i>
                </div>
              </button>
              {openSections.angle && (() => {
                const availableAngles = new Set(getAvailableHookAngles(userPlan).map(a => a.id));
                return (
                <div className="grid grid-cols-2 gap-2 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {COLD_HOOK_ANGLES.map(angle => {
                    const isLocked = !availableAngles.has(angle.id);
                    return (
                    <button key={angle.id} type="button"
                      onClick={() => { if (isLocked) return; setInputs(prev => ({ ...prev, coldHookAngle: prev.coldHookAngle === angle.id ? undefined : angle.id as ColdHookAngle })); }}
                      className={`px-3 py-2.5 rounded-lg text-left transition-all relative ${isLocked ? 'opacity-50 cursor-not-allowed bg-slate-950/20 border border-slate-800/20 text-slate-600' : inputs.coldHookAngle === angle.id ? 'bg-blue-600/15 border border-blue-500/30 text-blue-400' : 'bg-slate-950/40 border border-slate-800/40 text-slate-500 hover:text-slate-300'}`}>
                      <div className="text-[10px] font-bold">{appLang === "ar" ? angle.labelAr : angle.labelEn}</div>
                      <div className="text-[8px] opacity-60 mt-0.5 line-clamp-1">{angle.description}</div>
                      {isLocked && <span className="absolute top-1 right-1 text-[7px] text-blue-400"><i className="fa-solid fa-lock mr-0.5"></i>{requiredPlanFor('abVariationTesting')}</span>}
                    </button>
                    );
                  })}
                </div>
                );
              })()}
            </div>

            {/* ── Angle-Specific Supporting Details (Conditional) ── */}
            {inputs.coldHookAngle && ['urgency', 'scarcity', 'social_proof', 'statistics', 'logical_authority'].includes(inputs.coldHookAngle) && (
              <div className="bg-slate-950/30 rounded-xl p-3 space-y-2 border border-slate-800/30 animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="flex items-center gap-1.5">
                  <i className="fa-solid fa-bolt text-[9px] text-amber-500"></i>
                  <span className="text-[9px] font-bold text-amber-400">
                    {inputs.coldHookAngle === 'urgency' ? 'Urgency Details (optional — improves quality)' :
                      inputs.coldHookAngle === 'scarcity' ? 'Scarcity Details (optional — improves quality)' :
                        inputs.coldHookAngle === 'social_proof' ? 'Proof / Testimonials (optional — improves quality)' :
                          inputs.coldHookAngle === 'statistics' ? 'Real Statistics (optional — improves quality)' :
                            'Authority Signals (optional — improves quality)'}
                  </span>
                </div>
                {inputs.coldHookAngle === 'urgency' && (
                  <textarea value={inputs.urgencyDetails || ''} onChange={e => setInputs(prev => ({ ...prev, urgencyDetails: e.target.value }))} className={`${textareaCls} !min-h-[60px]`}
                    placeholder="e.g. Registration closes Thursday • Price increases by $200 after Friday • Only 7 seats left" />
                )}
                {inputs.coldHookAngle === 'scarcity' && (
                  <textarea value={inputs.scarcityDetails || ''} onChange={e => setInputs(prev => ({ ...prev, scarcityDetails: e.target.value }))} className={`${textareaCls} !min-h-[60px]`}
                    placeholder="e.g. Only 20 seats • Next cohort in 3 months • We review every application" />
                )}
                {inputs.coldHookAngle === 'social_proof' && (
                  <textarea value={inputs.proofSnippets || ''} onChange={e => setInputs(prev => ({ ...prev, proofSnippets: e.target.value }))} className={`${textareaCls} !min-h-[60px]`}
                    placeholder="e.g. Ahmad got 18 booking calls in 10 days • Sara went from 3 to 47 clients in 60 days • 127 specialists applied the system" />
                )}
                {inputs.coldHookAngle === 'statistics' && (
                  <textarea value={inputs.statsData || ''} onChange={e => setInputs(prev => ({ ...prev, statsData: e.target.value }))} className={`${textareaCls} !min-h-[60px]`}
                    placeholder="e.g. 95% of coaches earn under $3K/month • Average client sees 10x ROI • 340+ graduates across 12 countries" />
                )}
                {inputs.coldHookAngle === 'logical_authority' && (
                  <textarea value={inputs.authoritySignals || ''} onChange={e => setInputs(prev => ({ ...prev, authoritySignals: e.target.value }))} className={`${textareaCls} !min-h-[60px]`}
                    placeholder="e.g. 7 years experience • 500+ clients • Featured in Forbes Arabia • First Arabic system of its kind" />
                )}
                <p className="text-[8px] text-slate-600">Adding real details creates stronger, more authentic hooks. Without details, the AI will use generic patterns instead of fabricating fake specifics.</p>
              </div>
            )}

            {/* Hook Type */}
            <div className="space-y-0">
              <button type="button" onClick={() => setOpenSections(p => ({ ...p, hookType: !p.hookType }))}
                className="w-full flex items-center justify-between py-2 group">
                <Label>{t('hook.type_label')}<InfoTip text={t('info.hook_type')} /></Label>
                <div className="flex items-center gap-2">
                  {inputs.hookType && (
                    <span className="text-[9px] font-bold text-violet-400 bg-violet-600/10 px-2 py-0.5 rounded">
                      {appLang === "ar" ? HOOK_TYPES.find(h => h.id === inputs.hookType)?.labelAr : HOOK_TYPES.find(h => h.id === inputs.hookType)?.labelEn}
                    </span>
                  )}
                  <i className={`fa-solid fa-chevron-down text-[8px] text-slate-600 transition-transform ${openSections.hookType ? 'rotate-180' : ''}`}></i>
                </div>
              </button>
              {openSections.hookType && (() => {
                const availableStyles = new Set(getAvailableHookStyles(userPlan).map(h => h.id));
                return (
                <div className="flex flex-wrap gap-1.5 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  {HOOK_TYPES.map(ht => {
                    const isLocked = !availableStyles.has(ht.id);
                    return (
                    <button key={ht.id} type="button"
                      onClick={() => { if (isLocked) return; setInputs(prev => ({ ...prev, hookType: prev.hookType === ht.id ? undefined : ht.id as HookType })); }}
                      className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all ${isLocked ? 'opacity-50 cursor-not-allowed bg-slate-950/20 text-slate-600 border border-slate-800/20' : inputs.hookType === ht.id ? 'bg-violet-600/20 text-violet-400 border border-violet-500/30' : 'bg-slate-950/40 text-slate-500 border border-slate-800/40 hover:text-slate-300'}`}>
                      {isLocked && <i className="fa-solid fa-lock text-[6px] mr-1"></i>}{appLang === "ar" ? ht.labelAr : ht.labelEn}
                    </button>
                    );
                  })}
                </div>
                );
              })()}
            </div>

            {/* Copywriting Strategy */}
            <div className="space-y-0">
              <button type="button" onClick={() => setOpenSections(p => ({ ...p, strategy: !p.strategy }))}
                className="w-full flex items-center justify-between py-2 group">
                <Label>{t('hook.strategy_label')}<InfoTip text={t('info.strategy')} /></Label>
                <div className="flex items-center gap-2">
                  {inputs.copywritingStrategy && (
                    <span className="text-[9px] font-bold text-amber-400 bg-amber-600/10 px-2 py-0.5 rounded">
                      {appLang === "ar" ? COPYWRITING_STRATEGIES.find(s => s.id === inputs.copywritingStrategy)?.labelAr : COPYWRITING_STRATEGIES.find(s => s.id === inputs.copywritingStrategy)?.labelEn}
                    </span>
                  )}
                  <i className={`fa-solid fa-chevron-down text-[8px] text-slate-600 transition-transform ${openSections.strategy ? 'rotate-180' : ''}`}></i>
                </div>
              </button>
              {openSections.strategy && (() => {
                const availableStrategies = new Set(getAvailableCopyStrategies(userPlan).map(s => s.id));
                return (
                <div className="space-y-1.5 pb-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="flex flex-wrap gap-1.5">
                    {COPYWRITING_STRATEGIES.map(s => {
                      const isLocked = !availableStrategies.has(s.id);
                      return (
                      <button key={s.id} type="button"
                        onClick={() => { if (isLocked) return; setInputs(prev => ({ ...prev, copywritingStrategy: prev.copywritingStrategy === s.id ? undefined : s.id as CopywritingStrategy })); }}
                        className={`px-2.5 py-1.5 rounded-lg text-[9px] font-bold transition-all ${isLocked ? 'opacity-50 cursor-not-allowed bg-slate-950/20 text-slate-600 border border-slate-800/20' : inputs.copywritingStrategy === s.id ? 'bg-amber-600/20 text-amber-400 border border-amber-500/30' : 'bg-slate-950/40 text-slate-500 border border-slate-800/40 hover:text-slate-300'}`}>
                        {isLocked && <i className="fa-solid fa-lock text-[6px] mr-1"></i>}{appLang === "ar" ? s.labelAr : s.labelEn}
                      </button>
                      );
                    })}
                  </div>
                  <p className="text-[8px] text-slate-600">{t('hook.strategy_hint')}</p>
                </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Retargeting Setup (conditional) */}
        {inputs.campaignType === 'retargeting' && allowRetargeting && (
          <div className="bg-slate-900/30 rounded-xl p-5 space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="text-xs font-semibold text-purple-400">{t('hook.retargeting_setup')}</div>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('hook.objection_label')}</Label>
                <select value={inputs.retargetingObjection || (inputs.customObjection ? 'custom' : '')} onChange={e => { const val = e.target.value; if (val === 'custom') { setInputs(prev => ({ ...prev, retargetingObjection: undefined, retargetingObjections: [], customObjection: prev.customObjection || '' })); } else { setInputs(prev => ({ ...prev, retargetingObjection: val ? val as RetargetingObjectionId : undefined, retargetingObjections: val ? [val as RetargetingObjectionId] : [], customObjection: '' })); } }} className={selectCls}>
                  <option value="">{t('form.objection_select_placeholder')}</option>
                  {RETARGETING_OBJECTIONS.map(o => {
                    const locked = !isObjectionAvailable(userPlan as StoredPlan, o.id as RetargetingObjectionId);
                    return <option key={o.id} value={o.id} disabled={locked}>{locked ? '🔒 ' : ''}{appLang === 'ar' ? o.labelAr : o.label}{locked ? ' (Pro)' : ''}</option>;
                  })}
                  <option value="custom">{t('form.objection_custom_option')}</option>
                </select>
                {!inputs.retargetingObjection && (
                  <input value={inputs.customObjection || ''} onChange={e => setInputs(prev => ({ ...prev, customObjection: e.target.value }))} className={inputCls} placeholder={t('form.custom_objection')} />
                )}
              </div>
              <div className="space-y-2">
                <Label>{t('hook.testimonial_label')}</Label>
                <input value={inputs.testimonial || ''} onChange={e => setInputs({ ...inputs, testimonial: e.target.value })} className={inputCls} placeholder={t('form.testimonial_placeholder')} />
                <p className="text-[8px] text-slate-600">{t('hook.testimonial_hint')}</p>
              </div>
            </div>
          </div>
        )}


        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: CONTENT LANGUAGE
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2" style={{ animationDelay: '120ms' }}>
          <Label>{t('form.ad_language')}</Label>
          <div className="relative">
            <button type="button" onClick={() => setShowLangPicker(!showLangPicker)}
              className={`${inputCls} cursor-pointer flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{AD_LANGUAGES.find(l => l.id === (inputs.adLanguage || 'ar_fusha'))?.flag || '🌍'}</span>
                <span className="text-slate-100">{AD_LANGUAGES.find(l => l.id === (inputs.adLanguage || 'ar_fusha'))?.label || 'العربية الفصحى'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500">{t('form.click_to_change')}</span>
                <i className={`fa-solid fa-chevron-down text-slate-500 text-xs transition-transform ${showLangPicker ? 'rotate-180' : ''}`}></i>
              </div>
            </button>
            {showLangPicker && (
              <div className="absolute z-50 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Arabic dialects group */}
                <div className="px-3 pt-3 pb-1">
                  <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{t('form.arabic_dialects')}</span>
                </div>
                {AD_LANGUAGES.filter(l => l.group === 'ar').map(lang => (
                  <button type="button" key={lang.id} onClick={() => { setInputs(prev => ({ ...prev, adLanguage: lang.id })); setShowLangPicker(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${inputs.adLanguage === lang.id ? 'bg-blue-600/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span>{lang.flag}</span>
                    <span className="flex-1 text-right">{lang.label}</span>
                    {inputs.adLanguage === lang.id && <i className="fa-solid fa-check text-blue-400 text-xs"></i>}
                  </button>
                ))}
                {/* Other languages */}
                <div className="px-3 pt-3 pb-1 border-t border-slate-800 mt-1">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('form.other_languages')}</span>
                </div>
                {AD_LANGUAGES.filter(l => l.group !== 'ar').map(lang => (
                  <button type="button" key={lang.id} onClick={() => { setInputs(prev => ({ ...prev, adLanguage: lang.id })); setShowLangPicker(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${inputs.adLanguage === lang.id ? 'bg-blue-600/15 text-blue-400' : 'text-slate-300 hover:bg-slate-800'}`}>
                    <span>{lang.flag}</span>
                    <span className="flex-1">{lang.label}</span>
                    {inputs.adLanguage === lang.id && <i className="fa-solid fa-check text-blue-400 text-xs"></i>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>


        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: MAIN FORM — 2x2 GRID
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6" style={{ animationDelay: '150ms' }}>

          {/* ── LEFT: Brand Info ── */}
          <div className="bg-slate-900/30 rounded-2xl p-6 space-y-5">
            <SectionTitle icon="fa-tag" title={t('form.brand')} />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('form.product_name')}</Label>
                <input data-tour="product-name" required value={inputs.productName} onChange={e => setInputs({ ...inputs, productName: e.target.value })} className={inputCls} placeholder={t('form.product_placeholder')} />
              </div>
              <div className="space-y-1.5">
                <Label>Brand Website {!allowBrandUrl && <LockedBadge requiredPlan={requiredPlanFor('brandUrlScraping')} />}</Label>
                {allowBrandUrl ? (
                  <div className="flex gap-2">
                    <input value={inputs.brandUrl} onChange={e => setInputs({ ...inputs, brandUrl: e.target.value })} className={`${inputCls} flex-1`} placeholder="https://example.com" />
                    {/* Auto-fill button hidden — kept for future use with proper backend proxy
                    {inputs.brandUrl && inputs.brandUrl.startsWith('http') && (
                      <button type="button" disabled={(inputs as any)._websiteLoading} onClick={async () => {
                        setInputs(prev => ({ ...prev, _websiteLoading: true } as any));
                        if (showToast) showToast(appLang === 'ar' ? 'جاري تحليل الموقع...' : 'Analyzing website...', 'info');
                        try {
                          const { httpsCallable } = await import('firebase/functions');
                          const { functions } = await import('../firebase');
                          const fnAnalyze = httpsCallable(functions, 'analyzeWebsite', { timeout: 30000 });
                          const result = await fnAnalyze({ url: inputs.brandUrl || '' });
                          const data = result.data as any;

                          if (!data.ok) {
                            const errorMessages: Record<string, { en: string; ar: string }> = {
                              invalid_url: { en: 'Please enter a valid URL starting with https://', ar: 'أدخل رابطاً صالحاً يبدأ بـ https://' },
                              fetch_failed: { en: 'Could not reach the website. Check the URL or try again.', ar: 'تعذر الوصول للموقع. تحقق من الرابط أو حاول مجدداً.' },
                              blocked: { en: 'Website blocked automated access. Try a different page.', ar: 'الموقع يمنع الوصول الآلي. جرب صفحة أخرى.' },
                              timeout: { en: 'Website took too long to respond. Try again later.', ar: 'الموقع استغرق وقتاً طويلاً. حاول لاحقاً.' },
                              empty_content: { en: 'No usable content found (may be JavaScript-only).', ar: 'لم يُعثر على محتوى (قد يكون الموقع JavaScript فقط).' },
                              not_allowed: { en: 'Website analysis requires a higher plan.', ar: 'تحليل المواقع يتطلب خطة أعلى.' },
                            };
                            const msg = errorMessages[data.errorCode] || { en: data.errorMessage || 'Analysis failed.', ar: data.errorMessage || 'فشل التحليل.' };
                            if (showToast) showToast(appLang === 'ar' ? msg.ar : msg.en, 'error');
                            return;
                          }

                          const updates: Partial<typeof inputs> = {};
                          if (data.productName && !inputs.productName) updates.productName = data.productName;
                          if (data.offerTitle && !inputs.valueStackTitle) updates.valueStackTitle = data.offerTitle;
                          if (data.targetAudience && !inputs.targetAudience) updates.targetAudience = data.targetAudience;
                          if (data.challenges && !inputs.challenges) updates.challenges = data.challenges;
                          if (data.transformation && !inputs.transformation) updates.transformation = data.transformation;
                          if (data.cta && !inputs.cta) updates.cta = data.cta;
                          if (data.valueStackItems?.length > 0 && !(inputs as any).valueStackItems) {
                            (updates as any).valueStackItems = data.valueStackItems.join('\n');
                          }
                          if (data.valueStackBonuses?.length > 0 && !(inputs as any).valueStackBonuses) {
                            (updates as any).valueStackBonuses = data.valueStackBonuses.join('\n');
                          }
                          if (data.featureCandidates?.length > 0 && !(inputs as any).featureList) {
                            (updates as any).featureList = data.featureCandidates.join('\n');
                          }
                          if (Object.keys(updates).length > 0) {
                            setInputs(prev => ({ ...prev, ...updates }));
                            if (showToast) showToast(appLang === 'ar' ? `تم ملء ${Object.keys(updates).length} حقول من الموقع — يمكنك تعديلها` : `Auto-filled ${Object.keys(updates).length} fields from site — you can edit them`, 'success');
                          } else {
                            if (showToast) showToast(appLang === 'ar' ? 'جميع الحقول ممتلئة بالفعل — لم يتم تغيير شيء' : 'All fields already filled — nothing changed', 'info');
                          }
                        } catch { if (showToast) showToast(appLang === 'ar' ? 'خطأ غير متوقع في التحليل' : 'Unexpected analysis error', 'error'); }
                        finally { setInputs(prev => ({ ...prev, _websiteLoading: undefined } as any)); }
                      }} className={`px-3 py-1.5 bg-blue-600/20 text-blue-400 text-[9px] font-bold rounded-lg hover:bg-blue-600/30 transition-colors whitespace-nowrap disabled:opacity-50 disabled:cursor-wait`}>
                        {(inputs as any)._websiteLoading
                          ? <><i className="fa-solid fa-spinner fa-spin mr-1"></i>{appLang === 'ar' ? 'جاري...' : 'Loading...'}</>
                          : <><i className="fa-solid fa-wand-magic-sparkles mr-1"></i>{appLang === 'ar' ? 'ملء تلقائي' : 'Auto-fill from site'}</>
                        }
                      </button>
                    )}
                    */}
                  </div>
                ) : (
                  <div className="w-full bg-slate-950/30 rounded-xl px-4 py-3 text-slate-600 text-sm cursor-not-allowed">Unlocks on Pro plan</div>
                )}
              </div>
              {/* Brand Colors (Optional) */}
              <div className="space-y-1.5">
                <Label>Brand Colors<InfoTip text={t('info.brand_colors')} /> <span className="text-slate-600 font-normal">(optional)</span></Label>
                <div className="flex gap-3">
                  <div className="flex-1 flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2">
                    <input
                      type="color"
                      value={inputs.brandColorPrimary || '#3B82F6'}
                      onChange={e => setInputs({ ...inputs, brandColorPrimary: e.target.value })}
                      className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-slate-700"
                    />
                    <span className="text-slate-500 text-xs font-mono">#</span>
                    <input
                      value={(inputs.brandColorPrimary || '').replace(/^#/, '')}
                      onChange={e => { let v = e.target.value.replace(/[^0-9a-fA-F]/g, '').substring(0, 6); setInputs({ ...inputs, brandColorPrimary: v ? '#' + v : '' }); }}
                      className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600 uppercase font-mono"
                      placeholder="e.g. 3B82F6"
                      maxLength={6}
                    />
                    {inputs.brandColorPrimary && (
                      <button type="button" onClick={() => setInputs({ ...inputs, brandColorPrimary: '' })} className="text-slate-600 hover:text-red-400 transition-colors text-xs">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                  <div className="flex-1 flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-xl px-3 py-2">
                    <input
                      type="color"
                      value={inputs.brandColorSecondary || '#F59E0B'}
                      onChange={e => setInputs({ ...inputs, brandColorSecondary: e.target.value })}
                      className="w-7 h-7 rounded-lg border-0 cursor-pointer bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-slate-700"
                    />
                    <span className="text-slate-500 text-xs font-mono">#</span>
                    <input
                      value={(inputs.brandColorSecondary || '').replace(/^#/, '')}
                      onChange={e => { let v = e.target.value.replace(/[^0-9a-fA-F]/g, '').substring(0, 6); setInputs({ ...inputs, brandColorSecondary: v ? '#' + v : '' }); }}
                      className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-slate-600 uppercase font-mono"
                      placeholder="e.g. F59E0B"
                      maxLength={6}
                    />
                    {inputs.brandColorSecondary && (
                      <button type="button" onClick={() => setInputs({ ...inputs, brandColorSecondary: '' })} className="text-slate-600 hover:text-red-400 transition-colors text-xs">
                        <i className="fa-solid fa-xmark"></i>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Audience Info ── */}
          <div className="bg-slate-900/30 rounded-2xl p-6 space-y-5">
            <SectionTitle icon="fa-users" title={t('form.audience')} />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('form.target_avatar')}</Label>
                <input data-tour="target-avatar" required value={inputs.targetAudience} onChange={e => setInputs({ ...inputs, targetAudience: e.target.value })} className={inputCls} placeholder={t('form.target_placeholder')} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label accent="text-red-400/70">{t('form.challenge')}</Label>
                  <button type="button" onClick={() => setExampleField(exampleField === 'challenges' ? null : 'challenges')} className="text-[9px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors flex items-center gap-1">
                    <i className="fa-solid fa-sparkles text-[8px]"></i> Get example
                  </button>
                </div>
                {exampleField === 'challenges' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    {getSmartExamples('challenges', inputs.targetAudience).map((ex, i) => (
                      <button type="button" key={i} onClick={() => { setInputs(prev => ({ ...prev, challenges: ex.value })); setExampleField(null); }}
                        className="text-left px-3 py-2 bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 rounded-lg text-[11px] text-slate-300 transition-all">
                        <span className="text-red-400 font-bold text-[9px]">{ex.label}:</span> {ex.value}
                      </button>
                    ))}
                  </div>
                )}
                <textarea data-tour="challenge" required value={inputs.challenges} onChange={e => setInputs({ ...inputs, challenges: e.target.value })} className={textareaCls} placeholder={t('form.challenge_placeholder')} />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label accent="text-emerald-400/70">{t('form.transformation')}</Label>
                  <button type="button" onClick={() => setExampleField(exampleField === 'transformation' ? null : 'transformation')} className="text-[9px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors flex items-center gap-1">
                    <i className="fa-solid fa-sparkles text-[8px]"></i> Get example
                  </button>
                </div>
                {exampleField === 'transformation' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    {getSmartExamples('transformation', inputs.targetAudience).map((ex, i) => (
                      <button type="button" key={i} onClick={() => { setInputs(prev => ({ ...prev, transformation: ex.value })); setExampleField(null); }}
                        className="text-left px-3 py-2 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/10 rounded-lg text-[11px] text-slate-300 transition-all">
                        <span className="text-emerald-400 font-bold text-[9px]">{ex.label}:</span> {ex.value}
                      </button>
                    ))}
                  </div>
                )}
                <textarea data-tour="transformation" required value={inputs.transformation} onChange={e => setInputs({ ...inputs, transformation: e.target.value })} className={textareaCls} placeholder={t('form.transformation_placeholder')} />
              </div>
            </div>
          </div>

          {/* ── LEFT: Offer Engine ── */}
          <div className="bg-slate-900/30 rounded-2xl p-6 space-y-5">
            <SectionTitle icon="fa-dollar-sign" title={t('form.offer')} />
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>{t('form.offer_type')}</Label>
                <select value={inputs.offerType} onChange={e => setInputs({ ...inputs, offerType: e.target.value, offerCreativeMode: ['standard_hero'], offerAssets: [] })} className={selectCls}>{OFFER_TYPES.map(o => <option key={o} value={o}>{o}</option>)}</select>
              </div>

              {/* Creative Mode — Tab-based selection (v2) */}
              {(() => {
                const activeTab = (OFFER_CATEGORY_MAP[inputs.offerType] || 'mini_course') as CreativeTab;
                const modes = OFFER_CREATIVE_MODES[activeTab] || [];
                if (modes.length <= 1) return null;
                const selected = inputs.offerCreativeMode || ['standard_hero'];
                const selectedModes = modes.filter(m => selected.includes(m.id as any));
                const boxCMode = selectedModes.find(m => m.boxCLabel && m.id !== 'standard_hero');

                // Use resolver's blocked modes (tab-aware, pair-aware)
                const hookAngle = inputs.coldHookAngle || '';
                const { blockedIds, reasons: blockReasons } = getBlockedModes(selected, activeTab, hookAngle || undefined);

                const selectedLabels = selected.map((id: string) => {
                  const mode = modes.find(m => m.id === id);
                  return mode ? (appLang === 'ar' ? mode.labelAr : mode.labelEn) : id;
                });
                const isStrongCombo = selected.length === 2 && isStrongPair(selected[0], selected[1]);
                const getRoleLabel = (id: string) => {
                  const meta = (CREATIVE_MODE_CATALOG as any)[id];
                  return meta?.role === 'support' ? (appLang === 'ar' ? 'دعم' : 'Support') : '';
                };

                return (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Tab indicator */}
                    <div className="flex gap-1 bg-slate-950/50 rounded-xl p-1">
                      {CREATIVE_TABS.map(tab => (
                        <button key={tab.id} type="button" disabled
                          className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[9px] font-medium transition-all ${tab.id === activeTab
                            ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30'
                            : 'text-slate-600 border border-transparent'}`}>
                          <span>{tab.icon}</span>
                          <span>{appLang === 'ar' ? tab.labelAr : tab.labelEn}</span>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>{t('form.creative_mode')}<InfoTip text={t('info.creative_mode')} /></Label>
                      <div className="flex items-center gap-2">
                        {selectedLabels.length > 0 && (
                          <span className="text-[9px] font-bold text-blue-400 bg-blue-600/10 px-2.5 py-1 rounded-lg">{selectedLabels.join(' + ')}</span>
                        )}
                        <span className="text-[8px] text-slate-500 font-medium">{selected.length}/2</span>
                        {isStrongCombo && <span className="text-[7px] font-bold text-emerald-400 bg-emerald-600/10 px-1.5 py-0.5 rounded">⚡ Strong Pair</span>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {modes.map(m => {
                        const isSelected = selected.includes(m.id as any);
                        const isPlanLocked = !isOfferModeAvailable(userPlan, m.id as any);
                        const isTextOnlyActive = selected.includes('text_only' as any);
                        const isBlockedByTextOnly = !isSelected && isTextOnlyActive && m.id !== 'text_only';
                        const subStyleBlockedModes = getBlockedModesForSubStyle((inputs as any).visualSubStyle);
                        const isBlockedBySubStyle = !isSelected && subStyleBlockedModes.has(m.id);
                        const isBlocked = !isSelected && (blockedIds.has(m.id) || isPlanLocked || isBlockedByTextOnly || isBlockedBySubStyle);
                        const isFull = !isSelected && selected.length >= 2;
                        const isDisabled = isBlocked || isFull;
                        const roleLabel = getRoleLabel(m.id);
                        const reason = isPlanLocked ? `Upgrade to ${getFeatureLimit(userPlan, 'maxOfferModes') < 12 ? 'Creator' : 'Pro'}` : isBlockedBySubStyle ? `Not compatible with ${((inputs as any).visualSubStyle || '').replace(/_/g, ' ')} style` : isBlocked ? blockReasons[m.id] || 'Not available' : isFull ? 'Max 2 selected' : '';
                        return (
                          <button key={m.id} type="button" disabled={isDisabled}
                            onClick={() => {
                              if (isDisabled) return;
                              setInputs(prev => {
                                const current = prev.offerCreativeMode || ['standard_hero'];
                                let next: string[];
                                if (isSelected) {
                                  next = current.filter((id: string) => id !== m.id);
                                  if (next.length === 0) next = ['standard_hero'];
                                } else if (m.id === 'text_only') {
                                  // text_only is mutually exclusive — clears all others + sub-style
                                  next = ['text_only'];
                                  return { ...prev, offerCreativeMode: next as any, offerAssets: [], visualSubStyle: undefined as any };
                                } else {
                                  // If text_only is currently selected, remove it when selecting any other mode
                                  const withoutTextOnly = current.filter((id: string) => id !== 'text_only');
                                  const base = withoutTextOnly.length === 0 ? ['standard_hero'] : withoutTextOnly;
                                  next = base.length >= 2 ? [base[base.length - 1], m.id] : [...base, m.id];
                                }
                                return { ...prev, offerCreativeMode: next as any, offerAssets: next.every((id: string) => id === 'standard_hero') ? [] : prev.offerAssets };
                              });
                            }}
                            className={`relative flex items-center gap-2.5 px-3 py-3 rounded-xl text-left transition-all border ${isSelected
                              ? 'bg-blue-600/15 text-blue-300 border-blue-500/40 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/20'
                              : isBlocked ? 'bg-slate-950/20 text-slate-700 border-slate-800/20 cursor-not-allowed opacity-35'
                                : isFull ? 'bg-slate-950/30 text-slate-600 border-slate-800/30 cursor-not-allowed opacity-45'
                                  : 'bg-slate-900/40 text-slate-400 border-slate-800/40 hover:text-slate-200 hover:border-blue-500/20 hover:bg-slate-900/60'}`}>
                            <span className="text-lg">{m.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold truncate">{appLang === 'ar' ? m.labelAr : m.labelEn}</span>
                                {roleLabel && <span className="text-[7px] px-1 py-0.5 rounded bg-amber-600/15 text-amber-400/80 font-medium">{roleLabel}</span>}
                              </div>
                              <p className="text-[8px] text-slate-500 truncate mt-0.5">{m.description}</p>
                            </div>
                            {isSelected && <div className="flex-shrink-0 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center"><i className="fa-solid fa-check text-[7px] text-white"></i></div>}
                            {isDisabled && reason && <span className="absolute top-1 right-1 text-[6px] text-slate-600 bg-slate-900/60 px-1 py-0.5 rounded">{reason}</span>}
                          </button>
                        );
                      })}
                    </div>
                    {boxCMode && (
                      <div {...dropZoneProps('offer')} className={`space-y-2 mt-3 p-3 rounded-xl border border-dashed transition-all ${dragOverZone === 'offer' ? 'border-blue-500 bg-blue-500/10 scale-[1.01]' : 'bg-slate-950/50 border-blue-500/20'}`}>
                        <Label accent="text-blue-400/70">{boxCMode.boxCLabel}</Label>
                        <p className="text-[8px] text-slate-600">{dragOverZone === 'offer' ? (appLang === 'ar' ? 'أفلت هنا' : 'Drop here') : boxCMode.boxCHint}</p>
                        <div className="flex gap-2 flex-wrap">
                          {(inputs.offerAssets || []).map((asset, i) => (
                            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-700">
                              <img src={asset} alt="" className="w-full h-full object-cover" />
                              <button type="button" onClick={() => setInputs(prev => ({ ...prev, offerAssets: (prev.offerAssets || []).filter((_, idx) => idx !== i) }))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center"><i className="fa-solid fa-xmark text-[6px] text-white"></i></button>
                            </div>
                          ))}
                          {(inputs.offerAssets || []).length < 3 && (
                            <label className="w-16 h-16 rounded-lg border border-dashed border-slate-700 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/40 transition-colors">
                              <i className="fa-solid fa-cloud-arrow-up text-slate-600 text-xs"></i>
                              <span className="text-[7px] text-slate-600 mt-0.5">Upload</span>
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { setInputs(prev => ({ ...prev, offerAssets: [...(prev.offerAssets || []), reader.result as string].slice(0, 3) })); }; reader.readAsDataURL(file); e.target.value = ''; }} />
                            </label>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ═══ DYNAMIC MODE-SPECIFIC FIELDS (Schema-Driven) ═══ */}
              {/* Shows ALL active sections for selected modes — not just the first match */}
              {(() => {
                const selected = inputs.offerCreativeMode || ['standard_hero'];
                const activeSections = getActiveSections(selected);
                const hasMode = (id: string) => selected.includes(id as any);

                const COLOR_MAP: Record<string, { bg: string; border: string; text: string }> = {
                  blue: { bg: 'bg-blue-950/20', border: 'border-blue-500/10', text: 'text-blue-400/70' },
                  purple: { bg: 'bg-purple-950/20', border: 'border-purple-500/10', text: 'text-purple-400/70' },
                  emerald: { bg: 'bg-emerald-950/20', border: 'border-emerald-500/10', text: 'text-emerald-400/70' },
                  amber: { bg: 'bg-amber-950/20', border: 'border-amber-500/10', text: 'text-amber-400/70' },
                  pink: { bg: 'bg-pink-950/20', border: 'border-pink-500/10', text: 'text-pink-400/70' },
                  cyan: { bg: 'bg-cyan-950/20', border: 'border-cyan-500/10', text: 'text-cyan-400/70' },
                  rose: { bg: 'bg-rose-950/20', border: 'border-rose-500/10', text: 'text-rose-400/70' },
                };

                // Filter out testimonial section — it has special UI below
                const standardSections = activeSections.filter(
                  s => !s.triggerModes.includes('testimonial_wall') || !hasMode('testimonial_wall')
                );

                return (
                  <>
                    {standardSections.map((section) => {
                      const colors = COLOR_MAP[section.colorTheme] || COLOR_MAP.blue;

                      // Group fields into full-width and grid pairs
                      const fullFields = section.fields.filter(f => !f.gridCol || f.gridCol === 1);
                      const gridFields = section.fields.filter(f => f.gridCol === 2);
                      // Pair grid fields into rows of 2
                      const gridRows: typeof gridFields[] = [];
                      for (let i = 0; i < gridFields.length; i += 2) {
                        gridRows.push(gridFields.slice(i, i + 2));
                      }

                      return (
                        <div key={section.triggerModes[0]} className={`space-y-2.5 p-3.5 ${colors.bg} rounded-xl border ${colors.border} animate-in fade-in slide-in-from-top-1 duration-200`}>
                          <div className={`text-[9px] font-black ${colors.text} uppercase tracking-widest flex items-center gap-1.5`}>
                            <i className={`${section.icon} text-[8px]`}></i>
                            {appLang === 'ar' ? section.titleAr : section.titleEn}
                          </div>
                          <div className="space-y-2">
                            {fullFields.map(field => (
                              <div key={field.key}>
                                <label className="text-[9px] text-slate-500 font-bold">
                                  {appLang === 'ar' ? field.labelAr : field.labelEn}
                                </label>
                                {field.type === 'list' ? (() => {
                                  const rawVal = (inputs as any)[field.key] || '';
                                  const items = rawVal ? rawVal.split('\n') : [''];
                                  if (items.length === 0) items.push('');
                                  const updateItems = (newItems: string[]) => {
                                    setInputs({ ...inputs, [field.key]: newItems.join('\n') } as any);
                                  };
                                  return (
                                    <div className="space-y-1.5">
                                      {items.map((item: string, ii: number) => (
                                        <div key={ii} className="flex items-center gap-1.5">
                                          <span className="text-[8px] text-slate-600 font-bold w-4 text-center shrink-0">{ii + 1}</span>
                                          <input
                                            value={item}
                                            onChange={e => { const next = [...items]; next[ii] = e.target.value; updateItems(next); }}
                                            className={inputCls}
                                            placeholder={appLang === 'ar' ? field.placeholderAr : field.placeholderEn}
                                          />
                                          {items.length > 1 && (
                                            <button type="button" onClick={() => { const next = items.filter((_: string, idx: number) => idx !== ii); updateItems(next.length ? next : ['']); }}
                                              className="w-6 h-6 rounded flex items-center justify-center text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                                            ><i className="fa-solid fa-xmark text-[9px]"></i></button>
                                          )}
                                        </div>
                                      ))}
                                      <button type="button" onClick={() => updateItems([...items, ''])}
                                        className="flex items-center gap-1.5 text-[9px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors px-1 py-1"
                                      ><i className="fa-solid fa-plus text-[7px]"></i>{appLang === 'ar' ? 'إضافة عنصر' : 'Add item'}</button>
                                    </div>
                                  );
                                })() : field.type === 'textarea' ? (
                                  <textarea
                                    value={(inputs as any)[field.key] || ''}
                                    onChange={e => setInputs({ ...inputs, [field.key]: e.target.value } as any)}
                                    className={`${inputCls} h-${(field.rows || 3) * 5} resize-none`}
                                    style={{ height: `${(field.rows || 3) * 1.5}rem` }}
                                    placeholder={appLang === 'ar' ? field.placeholderAr : field.placeholderEn}
                                  />
                                ) : (
                                  <input
                                    value={(inputs as any)[field.key] || ''}
                                    onChange={e => setInputs({ ...inputs, [field.key]: e.target.value } as any)}
                                    className={inputCls}
                                    placeholder={appLang === 'ar' ? field.placeholderAr : field.placeholderEn}
                                  />
                                )}
                              </div>
                            ))}
                            {gridRows.map((row, ri) => (
                              <div key={ri} className="grid grid-cols-2 gap-2">
                                {row.map(field => (
                                  <div key={field.key}>
                                    <label className="text-[9px] text-slate-500 font-bold">
                                      {appLang === 'ar' ? field.labelAr : field.labelEn}
                                    </label>
                                    <input
                                      value={(inputs as any)[field.key] || ''}
                                      onChange={e => setInputs({ ...inputs, [field.key]: e.target.value } as any)}
                                      className={inputCls}
                                      placeholder={appLang === 'ar' ? field.placeholderAr : field.placeholderEn}
                                    />
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {/* Testimonial Wall: special upload UI (not schema-driven) */}
                    {hasMode('testimonial_wall') && (
                      <div {...dropZoneProps('testimonial')} className={`space-y-2.5 p-3.5 rounded-xl border animate-in fade-in slide-in-from-top-1 duration-200 transition-all ${dragOverZone === 'testimonial' ? 'border-pink-500 bg-pink-500/10 scale-[1.01]' : 'bg-pink-950/20 border-pink-500/10'}`}>
                        <div className="text-[9px] font-black text-pink-400/70 uppercase tracking-widest flex items-center gap-1.5">
                          <i className={`fa-solid ${dragOverZone === 'testimonial' ? 'fa-cloud-arrow-down' : 'fa-comment-dots'} text-[8px]`}></i>
                          {dragOverZone === 'testimonial' ? (appLang === 'ar' ? 'أفلت هنا' : 'Drop here') : (appLang === 'ar' ? 'لقطات الشهادات' : 'Testimonial Screenshots')}
                        </div>
                        {inputs.adMode !== 'carousel' && (
                          <div className="flex items-center gap-2 p-2.5 bg-amber-500/10 rounded-lg border border-amber-500/20">
                            <i className="fa-solid fa-triangle-exclamation text-amber-400 text-xs"></i>
                            <span className="text-[9px] text-amber-300">
                              {appLang === 'ar'
                                ? 'وضع الشهادات يعمل فقط مع الكاروسيل. سيتم التبديل تلقائياً.'
                                : 'Testimonial mode only works with carousel. Will auto-switch on submit.'}
                            </span>
                          </div>
                        )}
                        <p className="text-[8px] text-slate-500">
                          {appLang === 'ar'
                            ? 'ارفع لقطات شاشة من واتساب أو ماسنجر أو تليجرام (حتى 4 صور). سنستخرج النص تلقائياً.'
                            : 'Upload screenshots from WhatsApp, Messenger, or Telegram (up to 4). We\'ll extract the text automatically.'}
                        </p>
                        <div className="flex gap-2 flex-wrap">
                          {((inputs as any).testimonialScreenshots || []).map((ss: string, i: number) => (
                            <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-pink-500/30">
                              <img src={ss} alt="" className="w-full h-full object-cover" />
                              <button type="button" onClick={() => setInputs((prev: any) => ({
                                ...prev,
                                testimonialScreenshots: (prev.testimonialScreenshots || []).filter((_: any, idx: number) => idx !== i),
                                testimonialTexts: (prev.testimonialTexts || []).filter((_: any, idx: number) => idx !== i),
                              }))}
                                className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-600 rounded-full flex items-center justify-center">
                                <i className="fa-solid fa-xmark text-[7px] text-white"></i>
                              </button>
                              {(inputs as any).testimonialTexts?.[i]?.text && (
                                <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1 py-0.5">
                                  <span className="text-[6px] text-emerald-400"><i className="fa-solid fa-check mr-0.5"></i>Extracted</span>
                                </div>
                              )}
                            </div>
                          ))}
                          {((inputs as any).testimonialScreenshots || []).length < 4 && (
                            <label className="w-20 h-20 rounded-lg border-2 border-dashed border-pink-500/20 flex flex-col items-center justify-center cursor-pointer hover:border-pink-500/40 hover:bg-pink-500/5 transition-all">
                              <i className="fa-solid fa-camera text-pink-400/50 text-sm"></i>
                              <span className="text-[7px] text-pink-400/50 mt-1">{appLang === 'ar' ? 'لقطة شاشة' : 'Screenshot'}</span>
                              <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                try {
                                  const compressed = await compressImage(file);
                                  setInputs((prev: any) => ({
                                    ...prev,
                                    testimonialScreenshots: [...(prev.testimonialScreenshots || []), compressed].slice(0, 4),
                                  }));
                                } catch (err) {
                                  console.error('Screenshot compression failed:', err);
                                }
                                e.target.value = '';
                              }} />
                            </label>
                          )}
                        </div>
                        {((inputs as any).testimonialTexts || []).length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            <div className="text-[8px] font-bold text-emerald-400/70 uppercase">{appLang === 'ar' ? 'النصوص المستخرجة' : 'Extracted Texts'}</div>
                            {((inputs as any).testimonialTexts || []).map((t: any, i: number) => (
                              <div key={i} className="p-2 bg-slate-950/50 rounded-lg border border-slate-800/40">
                                <div className="text-[9px] text-slate-300 leading-relaxed" dir="auto">{t.text}</div>
                                {t.speakerName && <div className="text-[8px] text-slate-500 mt-1">— {t.speakerName}</div>}
                                <div className="text-[7px] text-slate-600 mt-0.5 capitalize">{t.platform}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>{t('form.cta')}</Label>
                  <button type="button" onClick={() => setExampleField(exampleField === 'cta' ? null : 'cta')} className="text-[9px] font-bold text-blue-400/70 hover:text-blue-400 transition-colors flex items-center gap-1">
                    <i className="fa-solid fa-sparkles text-[8px]"></i> Get example
                  </button>
                </div>
                {exampleField === 'cta' && (
                  <div className="flex gap-2 animate-in fade-in duration-200">
                    {getSmartExamples('cta', inputs.targetAudience).map((ex, i) => (
                      <button type="button" key={i} onClick={() => { setInputs(prev => ({ ...prev, cta: ex.value })); setExampleField(null); }}
                        className="px-3 py-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/10 rounded-lg text-[11px] text-slate-300 transition-all font-medium">
                        {ex.value}
                      </button>
                    ))}
                  </div>
                )}
                <input required value={inputs.cta} onChange={e => setInputs({ ...inputs, cta: e.target.value })} className={inputCls} placeholder={t('form.cta_placeholder')} />
              </div>
              <div className="space-y-1.5">
                <Label accent="text-amber-400/70">Promo Badge (optional)</Label>
                <input value={inputs.badges} onChange={e => setInputs({ ...inputs, badges: e.target.value })} className={inputCls} placeholder={t('form.badge_placeholder')} />
              </div>
            </div>
          </div>

          {/* ── RIGHT: Visual Pipeline ── */}
          <div className="bg-slate-900/30 rounded-2xl p-6 space-y-5">
            <SectionTitle icon="fa-sliders" title={t('form.visual')} />
            <div className="space-y-4">

              {/* Ad Mode — Single or Carousel */}
              <div className="space-y-1.5">
                <Label>Ad format {!canUse(userPlan, 'carousel') && <span className="text-amber-400/50 text-[9px] ml-1">Carousel on {requiredPlanFor('carousel')}+</span>}</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setInputs(prev => ({ ...prev, adMode: 'single' as AdMode, slideCount: 1 }))}
                    className={`py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${inputs.adMode !== 'carousel' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
                    <i className="fa-solid fa-image"></i> Single image
                  </button>
                  <button type="button"
                    onClick={() => { if (!canUse(userPlan, 'carousel')) return; setInputs(prev => ({ ...prev, adMode: 'carousel' as AdMode, slideCount: Math.min(3, getMaxSlides(userPlan)) })); }}
                    className={`py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 relative ${!canUse(userPlan, 'carousel') ? 'bg-slate-900/30 text-slate-600 cursor-not-allowed' : inputs.adMode === 'carousel' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
                    <i className="fa-solid fa-layer-group"></i> Carousel
                    {!canUse(userPlan, 'carousel') && <LockedBadge requiredPlan={requiredPlanFor('carousel')} />}
                  </button>
                </div>
                {inputs.adMode === 'carousel' && (
                  <div className="mt-2 space-y-1.5">
                    <Label>Number of slides</Label>
                    <div className="flex gap-2">
                      {[2, 3, 4, 5, 6, 7, 8, 9].filter(n => n <= getMaxSlides(userPlan)).map(n => (
                        <button key={n} type="button" onClick={() => setInputs(prev => ({ ...prev, slideCount: n }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${inputs.slideCount === n ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800/50 text-slate-400 hover:text-white'}`}>
                          {n} slides
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const modes = inputs.offerCreativeMode || [];
                      if (!modes.includes('value_stack' as any) || inputs.adMode !== 'carousel') return null;
                      const items = ((inputs as any).valueStackItems || '').split('\n').filter((s: string) => s.trim());
                      const adj = resolveValueStackSlideCount(items);
                      if (adj.resolvedSlideCount === inputs.slideCount) return null;
                      return (
                        <div className="text-xs text-amber-400 mt-1">
                          {appLang === 'ar' ? `تم ضبط الكاروسيل على ${adj.resolvedSlideCount} شرائح — هدية واحدة لكل شريحة.` : `Carousel adjusted to ${adj.resolvedSlideCount} slides — one gift per slide.`}
                        </div>
                      );
                    })()}
                    <p className="text-[9px] text-slate-600 italic">AI will create a narrative arc across all slides with consistent design.</p>
                  </div>
                )}
              </div>

              {inputs.referenceAd && (
                <div className="mb-3 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-200 text-sm flex items-center gap-2">
                  <span className="text-amber-300">📋</span>
                  {appLang === 'ar' ? 'الإعلان المرجعي مفعّل — الأسلوب البصري يتبع المرجع.' : 'Reference ad active — visual style follows the reference.'}
                </div>
              )}
              {/* Visual Style Family — hidden in text_only mode */}
              {!isTextOnlyActive && <div className="space-y-1.5">
                <Label>{t('form.universe')}</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" onClick={() => setInputs(prev => {
                    const keepSub = prev.visualSubStyle && isSubStyleInFamily(prev.visualSubStyle, 'realistic') ? prev.visualSubStyle : undefined;
                    return { ...prev, universeMode: 'realistic' as UniverseMode, visualStyleFamily: 'realistic', visualSubStyle: keepSub as any, preferredUniverse: 'Surprise Me (Random Realistic)' };
                  })}
                    className={`py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${activeStyle === 'realistic' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 border-emerald-500' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-600 border-slate-700/50'}`}>
                    <i className="fa-solid fa-building"></i> {appLang === 'ar' ? 'واقعي' : 'Real'}
                  </button>
                  <button type="button" onClick={() => { if (!allowFantasy) return; setInputs(prev => {
                    const keepSub = prev.visualSubStyle && isSubStyleInFamily(prev.visualSubStyle, 'fantasy') ? prev.visualSubStyle : undefined;
                    return { ...prev, universeMode: 'fantasy' as UniverseMode, visualStyleFamily: 'fantasy', visualSubStyle: keepSub as any, preferredUniverse: 'Surprise Me (Random Fantasy)' };
                  }); }}
                    className={`py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${!allowFantasy ? 'bg-slate-900/30 text-slate-600 cursor-not-allowed border-slate-800/30' : activeStyle === 'fantasy' ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/20 border-violet-500' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-600 border-slate-700/50'}`}>
                    <i className="fa-solid fa-wand-sparkles"></i> {appLang === 'ar' ? 'خيالي' : 'Fantasy'}
                    {!allowFantasy && <LockedBadge requiredPlan={requiredPlanFor('fantasyUniverses')} />}
                  </button>
                  <button type="button" onClick={() => setInputs(prev => ({ ...prev, universeMode: 'minimal' as UniverseMode, visualStyleFamily: 'minimal', visualSubStyle: undefined, preferredUniverse: '', customUniverseDetails: '' }))}
                    className={`py-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border ${activeStyle === 'minimal' ? 'bg-gradient-to-r from-slate-400 to-slate-600 text-white shadow-lg shadow-slate-500/25 border-slate-400' : 'bg-slate-800/40 text-slate-400 hover:text-slate-200 hover:border-slate-600 border-slate-700/50'}`}>
                    <i className="fa-solid fa-minimize"></i> {appLang === 'ar' ? 'بسيط' : 'Minimal'}
                  </button>
                </div>
                {activeStyle === 'minimal' && (
                  <p className="text-[10px] text-slate-500 mt-1">{appLang === 'ar' ? 'خلفية نظيفة مع التركيز على البطل أو العرض. الأفضل للإعلانات الاحترافية.' : 'Clean background with focus on the hero, mockup, or offer. Best for polished, brand-safe ads.'}</p>
                )}
              </div>}
              {isTextOnlyActive && (
                <p className="text-[10px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2"><i className="fa-solid fa-pen-fancy mr-1.5"></i>{appLang === 'ar' ? 'وضع إعلان نصي فقط — لا بطل، لا عالم. التصميم يعتمد على الخط والألوان فقط.' : 'Text-Only mode — no hero, no universe. Design relies on typography and color only.'}</p>
              )}

              {/* Universe Dropdown — hidden in text_only */}
              {!isTextOnlyActive && (
                <div className="space-y-1.5">
                  <Label>{activeStyle === 'realistic' ? 'Location / Setting' : 'Creative Universe'}</Label>
                  <UniverseDropdown
                    activeStyle={activeStyle}
                    dbRealistic={DB_REALISTIC}
                    dbFantasy={DB_FANTASY}
                    preferredUniverse={inputs.preferredUniverse}
                    onSelect={(u) => setInputs({ ...inputs, preferredUniverse: u })}
                    inputCls={inputCls}
                    noMatchesLabel={t('form.no_matches')}
                  />
                  {isCustomUniverse && (
                    <input required value={inputs.customUniverseDetails} onChange={e => setInputs({ ...inputs, customUniverseDetails: e.target.value })} className={`${inputCls} mt-2`}
                      placeholder={activeStyle === 'realistic' ? "Describe your custom location..." : "Describe your custom world..."} />
                  )}
                </div>
              )}

              {/* Art Direction — dropdown selector */}
              {(activeStyle === 'fantasy' || activeStyle === 'realistic') && !isTextOnlyActive && (() => {
                const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
                const availableCards = getAvailableCards(activeStyle as 'realistic' | 'fantasy', selectedModes);
                const currentSubStyle = (inputs as any).visualSubStyle;
                // Auto-clear if current selection is no longer available
                if (currentSubStyle && !availableCards.find((c: ArtDirectionCard) => c.id === currentSubStyle)) {
                    setTimeout(() => setInputs(prev => ({ ...prev, visualSubStyle: undefined as any })), 0);
                }
                // Group for optgroup labels
                const groupedCards: Record<string, ArtDirectionCard[]> = {};
                for (const card of availableCards) {
                    if (!groupedCards[card.group]) groupedCards[card.group] = [];
                    groupedCards[card.group].push(card);
                }
                const visibleGroups = ART_DIRECTION_GROUPS.filter(g => groupedCards[g.id]?.length > 0);

                return (
                <div className="space-y-1.5">
                  <Label>{appLang === 'ar' ? 'اتجاه فني (اختياري)' : 'Art Direction (optional)'}</Label>
                  <select
                    value={inputs.visualSubStyle || ''}
                    onChange={e => setInputs({ ...inputs, visualSubStyle: (e.target.value || undefined) as any })}
                    className={inputCls}
                  >
                    <option value="">{appLang === 'ar' ? '🎯 بدون اتجاه فني (الافتراضي)' : '🎯 None — Default Style'}</option>
                    {visibleGroups.map(group => (
                      <optgroup key={group.id} label={`${group.icon} ${appLang === 'ar' ? group.labelAr : group.labelEn}`}>
                        {(groupedCards[group.id] || []).map(card => (
                          <option key={card.id} value={card.id}>
                            {card.icon} {appLang === 'ar' ? card.labelAr : card.labelEn}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                );
              })()}

              {/* ─── References (optional) ─── */}
              <div className="pt-3 border-t border-slate-800/30 space-y-4">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500"><i className="fa-solid fa-image mr-1.5 text-indigo-400/60"></i>{appLang === 'ar' ? 'المراجع (اختياري)' : 'References (optional)'}</div>
                <div>
                  {/* Reference Ad */}
                  <div className={`space-y-2 ${!canUse(userPlan, 'referenceAdUpload') ? 'opacity-50 pointer-events-none' : ''}`}>
                    <p className="text-[8px] text-slate-500 font-semibold"><i className="fa-solid fa-rectangle-ad mr-1 text-amber-400/50"></i>{appLang === 'ar' ? 'إعلان مرجعي' : 'Reference Ad'}{!canUse(userPlan, 'referenceAdUpload') && <LockedBadge requiredPlan={requiredPlanFor('referenceAdUpload')} />}</p>
                    {inputs.referenceAd ? (
                      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-amber-500/30 shadow-md">
                        <img src={inputs.referenceAd} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-1 left-1 right-1 flex gap-1">
                          <label className="flex-1 bg-amber-600/80 text-white text-[7px] font-bold rounded py-0.5 text-center cursor-pointer hover:bg-amber-500 transition-colors">
                            {appLang === 'ar' ? 'استبدال' : 'Replace'}
                            <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={async (e) => {
                              const file = e.target.files?.[0]; if (!file) return;
                              const reader = new FileReader();
                              reader.onload = () => setInputs(prev => ({ ...prev, referenceAd: reader.result as string }));
                              reader.readAsDataURL(file); e.target.value = '';
                            }} />
                          </label>
                          <button type="button" onClick={() => setInputs(prev => ({ ...prev, referenceAd: undefined }))}
                            className="flex-1 bg-red-600/80 text-white text-[7px] font-bold rounded py-0.5 text-center hover:bg-red-500 transition-colors">
                            {appLang === 'ar' ? 'إزالة' : 'Remove'}
                          </button>
                        </div>
                        <span className="absolute top-1 right-1 text-[6px] text-amber-300 bg-black/50 px-1.5 py-0.5 rounded font-medium">
                          {appLang === 'ar' ? 'تكييف الأسلوب' : 'Style adaptation'}
                        </span>
                      </div>
                    ) : (
                      <label {...dropZoneProps('referenceAd')} className={`block w-full aspect-video rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center transition-all group ${dragOverZone === 'referenceAd' ? 'border-amber-500 bg-amber-500/10 scale-[1.02]' : 'border-slate-800/60 hover:border-amber-500/40'}`}>
                        <i className={`fa-solid ${dragOverZone === 'referenceAd' ? 'fa-cloud-arrow-down text-amber-400' : 'fa-rectangle-ad text-slate-700 group-hover:text-amber-400'} text-lg mb-1 transition-colors`}></i>
                        <span className="text-[7px] text-slate-600 group-hover:text-amber-300 transition-colors">{dragOverZone === 'referenceAd' ? (appLang === 'ar' ? 'أفلت هنا' : 'Drop here') : (appLang === 'ar' ? 'رفع إعلان' : 'Upload')}</span>
                        <input type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden" onChange={async (e) => {
                          const file = e.target.files?.[0]; if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => setInputs(prev => ({ ...prev, referenceAd: reader.result as string }));
                          reader.readAsDataURL(file); e.target.value = '';
                        }} />
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>


        {/* ═══════════════════════════════════════════════════════════════════
            SECTION: PHOTOS (always visible)
        ═══════════════════════════════════════════════════════════════════ */}
        <div style={{ animationDelay: '200ms' }} data-tour="photos">
          <SectionTitle icon="fa-images" title={t('form.photos')} badge={<span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">{(inputs.personalPhotos?.length || 0)} photos · {(inputs.brandLogos?.length || 0)} logo</span>} />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
            {/* Personal Photos — hidden in text_only mode */}
            {!isTextOnlyActive && <div className="bg-slate-900/30 rounded-2xl p-5 space-y-4">
              <SectionTitle icon="fa-user-tie" title={t('form.hero_photos')} badge={<span className="text-[9px] text-slate-500">Max 5</span>} />
              <div {...dropZoneProps('personal')} onClick={() => personalRef.current?.click()} className={`border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all group ${dragOverZone === 'personal' ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' : 'border-slate-800/60 hover:border-blue-500/40'}`}>
                <i className={`fa-solid ${dragOverZone === 'personal' ? 'fa-cloud-arrow-down text-blue-400' : 'fa-camera text-slate-700 group-hover:text-blue-400'} text-xl mb-1 transition-colors`}></i>
                <p className="text-[10px] text-slate-500">{dragOverZone === 'personal' ? (appLang === 'ar' ? 'أفلت هنا' : 'Drop here') : (appLang === 'ar' ? 'اسحب الصور أو اضغط للرفع' : 'Drag photos or click to upload')}</p>
                <input type="file" multiple accept="image/*" className="hidden" ref={personalRef} onChange={e => handleFileUpload(e, 'personal')} />
              </div>
              {(inputs.personalPhotos?.length || 0) > 0 && (
                <div className="grid grid-cols-5 gap-1.5">
                  {inputs.personalPhotos?.map((src, idx) => (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden relative group">
                      <img src={src} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFile(idx, 'personal')} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition-opacity"><i className="fa-solid fa-trash"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* Brand Logos */}
            <div className="bg-slate-900/30 rounded-2xl p-5 space-y-4">
              <SectionTitle icon="fa-copyright" title={t('form.brand_assets')} badge={<span className="text-[9px] text-slate-500">Max 1</span>} />
              <div {...dropZoneProps('brand')} onClick={() => brandRef.current?.click()} className={`border border-dashed rounded-xl p-5 text-center cursor-pointer transition-all group ${dragOverZone === 'brand' ? 'border-violet-500 bg-violet-500/10 scale-[1.02]' : 'border-slate-800/60 hover:border-violet-500/40'}`}>
                <i className={`fa-solid ${dragOverZone === 'brand' ? 'fa-cloud-arrow-down text-violet-400' : 'fa-certificate text-slate-700 group-hover:text-violet-400'} text-xl mb-1 transition-colors`}></i>
                <p className="text-[10px] text-slate-500">{dragOverZone === 'brand' ? (appLang === 'ar' ? 'أفلت هنا' : 'Drop here') : (appLang === 'ar' ? 'اسحب الشعار أو اضغط للرفع' : 'Drag logo or click to upload')}</p>
                <input type="file" multiple accept="image/*" className="hidden" ref={brandRef} onChange={e => handleFileUpload(e, 'brand')} />
              </div>
              {(inputs.brandLogos?.length || 0) > 0 && (
                <div className="grid grid-cols-5 gap-1.5">
                  {inputs.brandLogos?.map((src, idx) => (
                    <div key={idx} className="aspect-square rounded-lg overflow-hidden relative group">
                      <img src={src} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeFile(idx, 'brand')} className="absolute inset-0 bg-red-500/80 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] transition-opacity"><i className="fa-solid fa-trash"></i></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <div className="text-red-400 text-xs text-center py-2">{error}</div>}

        {/* ═══════════════════════════════════════════════════════════════════
            RANKING RECOMMENDATIONS (Ticket 4 — soft guidance from Ticket 2)
        ═══════════════════════════════════════════════════════════════════ */}
        {(rankings || rankingsLoading) && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 space-y-3" data-light-ctx="ranking-panel">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <i className="fa-solid fa-chart-line text-blue-400"></i>
              {appLang === 'ar' ? 'توصيات ذكية' : 'Smart Recommendations'}
              {rankingsLoading && <i className="fa-solid fa-spinner fa-spin text-slate-500 ml-1"></i>}
            </div>

            {rankings && !rankingsLoading && (
              <div className="space-y-2">
                {/* Recommended Pair */}
                {rankings.recommendedPair && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><i className="fa-solid fa-check text-[8px]"></i></span>
                    <div>
                      <span className="text-slate-300 font-medium">{appLang === 'ar' ? 'الزوج الموصى به' : 'Recommended Pair'}:</span>{' '}
                      <span className="text-emerald-400 font-semibold">{rankings.recommendedPair.key.replace(/\+/g, ' + ')}</span>
                      <div className="text-slate-500 text-[10px] mt-0.5">{rankings.recommendedPair.reason}</div>
                    </div>
                  </div>
                )}

                {/* Recommended Template */}
                {rankings.recommendedTemplate && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center"><i className="fa-solid fa-check text-[8px]"></i></span>
                    <div>
                      <span className="text-slate-300 font-medium">{appLang === 'ar' ? 'القالب الموصى به' : 'Recommended Template'}:</span>{' '}
                      <span className="text-emerald-400 font-semibold">{rankings.recommendedTemplate.key.replace(/_/g, ' ')}</span>
                      <div className="text-slate-500 text-[10px] mt-0.5">{rankings.recommendedTemplate.reason}</div>
                    </div>
                  </div>
                )}

                {/* Recommended Universe Families */}
                {rankings.recommendedUniverseFamilies.length > 0 && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center"><i className="fa-solid fa-star text-[8px]"></i></span>
                    <div>
                      <span className="text-slate-300 font-medium">{appLang === 'ar' ? 'أجواء مفضلة' : 'Preferred Universes'}:</span>{' '}
                      <span className="text-blue-400 font-semibold">{rankings.recommendedUniverseFamilies.slice(0, 3).map(u => u.key.replace(/_/g, ' ')).join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Recommended Hook Angles */}
                {rankings.recommendedHookAngles.length > 0 && (
                  <div className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center"><i className="fa-solid fa-bullseye text-[8px]"></i></span>
                    <div>
                      <span className="text-slate-300 font-medium">{appLang === 'ar' ? 'زوايا مقترحة' : 'Suggested Hook Angles'}:</span>{' '}
                      <span className="text-blue-400 font-semibold">{rankings.recommendedHookAngles.slice(0, 3).map(h => h.key.replace(/_/g, ' ')).join(', ')}</span>
                    </div>
                  </div>
                )}

                {/* Warnings */}
                {rankings.warnings.length > 0 && rankings.warnings.slice(0, 3).map((w, i) => (
                  <div key={`warn-${i}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center"><i className="fa-solid fa-triangle-exclamation text-[8px]"></i></span>
                    <div>
                      <span className="text-amber-400 font-medium">{appLang === 'ar' ? 'تحذير' : 'Warning'}:</span>{' '}
                      <span className="text-slate-400">{w.reason}</span>
                    </div>
                  </div>
                ))}

                {/* Exclusions */}
                {rankings.exclusions.length > 0 && rankings.exclusions.slice(0, 3).map((ex, i) => (
                  <div key={`excl-${i}`} className="flex items-start gap-2 text-xs">
                    <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center"><i className="fa-solid fa-ban text-[8px]"></i></span>
                    <div>
                      <span className="text-red-400 font-medium">{appLang === 'ar' ? 'تجنب' : 'Avoid'}:</span>{' '}
                      <span className="text-slate-400">{ex.key.replace(/[_+]/g, ' ')} — {ex.reason}</span>
                    </div>
                  </div>
                ))}

                {/* Empty state */}
                {!rankings.recommendedPair && !rankings.recommendedTemplate && rankings.recommendedUniverseFamilies.length === 0 && rankings.recommendedHookAngles.length === 0 && rankings.warnings.length === 0 && rankings.exclusions.length === 0 && (
                  <div className="text-xs text-slate-500 italic">{appLang === 'ar' ? 'لا توجد توصيات كافية بعد — استمر في التصميم!' : 'Not enough data for recommendations yet — keep creating!'}</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SUBMIT BUTTONS (not sticky — scrolls with page)
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="max-w-lg mx-auto flex flex-col gap-2 pt-6 pb-10">
          {!launchSurfaceResult.allowed && launchSurfaceResult.reason && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm text-center">
              {launchSurfaceResult.reason}
            </div>
          )}
          <button data-tour="submit" type="submit" disabled={!launchSurfaceResult.allowed} className={`w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-emerald-600/20 hover:shadow-emerald-600/30 active:scale-[0.98] transition-all text-sm uppercase tracking-wider flex items-center justify-center gap-2 ${!launchSurfaceResult.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <i className="fa-solid fa-bolt"></i> Start Design Engine
          </button>
          <button type="button" id="save-draft-btn" onClick={() => {
            console.log('[Save Draft] clicked', inputs?.productName);
            try {
              localStorage.setItem('adInputsDraft', JSON.stringify(inputs));
              if (onSaveDraft) onSaveDraft(inputs);
              if (showToast) showToast('📝 Draft saved!', 'success');
            } catch (err) { console.error('[Save Draft] error:', err); }
            // Visual button feedback
            const btn = document.getElementById('save-draft-btn');
            if (btn) {
              btn.textContent = '✓ Saved!';
              btn.style.background = '#059669';
              btn.style.color = '#fff';
              setTimeout(() => { btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Draft'; btn.style.background = ''; btn.style.color = ''; }, 2000);
            }
          }}
            className="w-full bg-slate-900/80 hover:bg-slate-800 text-slate-400 font-medium py-2.5 rounded-xl transition-all text-xs flex items-center justify-center gap-2 border border-slate-800/50">
            <i className="fa-solid fa-floppy-disk"></i> Save Draft
          </button>
        </div>

      </form>
    </div>
  );
};

export default InputForm;