// store.ts — Zustand state management for ProAds AI
// Replaces the 50+ useState() calls scattered across App.tsx
// Install: npm install zustand
//
// MIGRATION GUIDE:
// 1. Install zustand: npm install zustand
// 2. Place this file at src/store.ts
// 3. In each component, import what you need:
//    import { useAppStore } from './store';
//    const { phase, setPhase, inputs, setInputs } = useAppStore();
// 4. Gradually move state from App.tsx to this store
//    Start with the biggest chunks: phase, inputs, credits, UI flags

import { create } from 'zustand';
import type {
    AdInputs, AppPhase, AspectRatio, BatchResult,
    CarouselSlide, SavedProject, AudienceAvatar,
    CompetitorResearch, Toast, Workspace, HookVariation
} from './types';
import type { UserPlan } from './planconfig';

// ─── MILESTONES ──────────────────────────────────────────────────────────────
export interface Milestones {
    watchVideo: boolean;
    hooksGenerated: boolean;
    conceptsGenerated: boolean;
    designGenerated: boolean;
    copyGenerated: boolean;
    allComplete: boolean;
}

// ─── APP STATE ───────────────────────────────────────────────────────────────
interface AppState {
    // Auth
    user: any | null;
    setUser: (user: any | null) => void;

    // Plan & Credits
    userPlan: UserPlan;
    userCredits: number;
    cancelledAt: string | null;
    setUserPlan: (plan: UserPlan) => void;
    setUserCredits: (credits: number | ((prev: number) => number)) => void;
    setCancelledAt: (date: string | null) => void;

    // Pipeline Phase
    phase: AppPhase;
    setPhase: (phase: AppPhase) => void;
    highestUnlocked: AppPhase;
    updateHighestUnlocked: (phase: AppPhase) => void;

    // Inputs & Creative State
    inputs: AdInputs | null;
    setInputs: (inputs: AdInputs | null) => void;
    resolvedUniverse: string;
    setResolvedUniverse: (u: string) => void;
    currentAspectRatio: AspectRatio;
    setCurrentAspectRatio: (r: AspectRatio) => void;

    // Hook/TOV State
    tovText: string;
    setTovText: (t: string) => void;
    selectedTov: string;
    setSelectedTov: (t: string) => void;

    // Concept State
    conceptsText: string;
    setConceptsText: (c: string) => void;
    selectedConcept: string;
    setSelectedConcept: (c: string) => void;
    buildPlan: string;
    setBuildPlan: (p: string) => void;

    // Render State
    mockupHistory: { url: string; ratio: AspectRatio }[];
    historyIndex: number;
    pushMockup: (url: string, ratio: AspectRatio) => void;
    setHistoryIndex: (i: number) => void;

    // Carousel
    carouselSlides: CarouselSlide[];
    setCarouselSlides: (slides: CarouselSlide[] | ((prev: CarouselSlide[]) => CarouselSlide[])) => void;
    showCarouselPreview: boolean;
    setShowCarouselPreview: (show: boolean) => void;

    // Caption
    captionText: string;
    setCaptionText: (t: string) => void;

    // Batch
    batchResults: BatchResult[];
    setBatchResults: (results: BatchResult[] | ((prev: BatchResult[]) => BatchResult[])) => void;

    // Projects
    projects: SavedProject[];
    setProjects: (p: SavedProject[]) => void;
    currentProjectId: string | null;
    setCurrentProjectId: (id: string | null) => void;

    // Avatars
    avatars: AudienceAvatar[];
    setAvatars: (a: AudienceAvatar[]) => void;

    // Competitor Research
    competitorData: CompetitorResearch | null;
    competitorLoading: boolean;
    setCompetitorData: (d: CompetitorResearch | null) => void;
    setCompetitorLoading: (l: boolean) => void;

    // Milestones
    milestones: Milestones;
    setMilestones: (m: Milestones | ((prev: Milestones) => Milestones)) => void;

    // UI State
    isLoading: boolean;
    loadingMsg: string;
    startLoad: (msg: string) => void;
    stopLoad: () => void;
    toasts: Toast[];
    showToast: (message: string, type: Toast['type']) => void;
    removeToast: (index: number) => void;
    showUpgradeModal: boolean;
    upgradeReason: string;
    setShowUpgradeModal: (show: boolean) => void;
    setUpgradeReason: (reason: string) => void;

    // Typography Overlay
    useTypographyOverlay: boolean;
    setUseTypographyOverlay: (use: boolean) => void;

    // Workspaces (Multi-Brand — Scaling only)
    workspaces: Workspace[];
    activeWorkspaceId: string | null;
    setWorkspaces: (w: Workspace[]) => void;
    setActiveWorkspaceId: (id: string | null) => void;
    hasInProgressWork: boolean;

    // Favorites tracking
    loadedFavoriteId: string | null;
    setLoadedFavoriteId: (id: string | null) => void;

    // Auto-save status (Phase 13)
    saveStatus: { phase: string } | null;
    setSaveStatus: (status: { phase: string } | null) => void;

    // ─── Phase 23 — In-card variation carousel (23.A) ────────────────────
    // Per-card ordered list of variations (positions 2..N). Position 1
    // is always the reference hook rendered from `tovText`. Cap is 11
    // variations (12 positions total). Approve/Edit/AI Edit/Batch read
    // `activeIndex` to know which variation is currently displayed.
    variationCarousels: Record<string, HookVariation[]>;
    variationActiveIndex: Record<string, number>;
    variationCapReached: Record<string, boolean>;
    pushVariations: (variant: string, list: HookVariation[]) => void;
    setVariationActiveIndex: (variant: string, index: number) => void;
    resetVariations: (variant: string) => void;
    resetAllVariations: () => void;
    updateVariation: (variant: string, index: number, hv: HookVariation) => void;

    // Reset (new project)
    resetPipeline: () => void;
}

const PHASE_ORDER: AppPhase[] = ['input', 'tov_review', 'concept_review', 'render_studio', 'primary_text'];

export const useAppStore = create<AppState>((set, get) => ({
    // Auth
    user: null,
    setUser: (user) => set({ user }),

    // Plan & Credits
    userPlan: 'none',
    userCredits: 0,
    cancelledAt: null,
    setUserPlan: (plan) => set({ userPlan: plan }),
    setUserCredits: (credits) => set((state) => ({
        userCredits: typeof credits === 'function' ? credits(state.userCredits) : credits
    })),
    setCancelledAt: (date) => set({ cancelledAt: date }),

    // Pipeline Phase
    phase: 'input',
    setPhase: (phase) => set({ phase }),
    highestUnlocked: 'input',
    updateHighestUnlocked: (phase) => set((state) => {
        const current = PHASE_ORDER.indexOf(state.highestUnlocked);
        const next = PHASE_ORDER.indexOf(phase);
        return next > current ? { highestUnlocked: phase } : {};
    }),

    // Inputs & Creative
    inputs: null,
    setInputs: (inputs) => set({ inputs }),
    resolvedUniverse: '',
    setResolvedUniverse: (u) => set({ resolvedUniverse: u }),
    currentAspectRatio: '1:1',
    setCurrentAspectRatio: (r) => set({ currentAspectRatio: r }),

    // Hooks
    tovText: '',
    setTovText: (t) => set({ tovText: t }),
    selectedTov: '',
    setSelectedTov: (t) => set({ selectedTov: t }),

    // Concepts
    conceptsText: '',
    setConceptsText: (c) => set({ conceptsText: c }),
    selectedConcept: '',
    setSelectedConcept: (c) => set({ selectedConcept: c }),
    buildPlan: '',
    setBuildPlan: (p) => set({ buildPlan: p }),

    // Render
    mockupHistory: [],
    historyIndex: -1,
    pushMockup: (url, ratio) => set((state) => {
        const newHistory = [...state.mockupHistory.slice(0, state.historyIndex + 1), { url, ratio }];
        return { mockupHistory: newHistory, historyIndex: newHistory.length - 1 };
    }),
    setHistoryIndex: (i) => set({ historyIndex: i }),

    // Carousel
    carouselSlides: [],
    setCarouselSlides: (slides) => set((state) => ({
        carouselSlides: typeof slides === 'function' ? slides(state.carouselSlides) : slides
    })),
    showCarouselPreview: false,
    setShowCarouselPreview: (show) => set({ showCarouselPreview: show }),

    // Caption
    captionText: '',
    setCaptionText: (t) => set({ captionText: t }),

    // Batch
    batchResults: [],
    setBatchResults: (results) => set((state) => ({
        batchResults: typeof results === 'function' ? results(state.batchResults) : results
    })),

    // Projects
    projects: [],
    setProjects: (p) => set({ projects: p }),
    currentProjectId: null,
    setCurrentProjectId: (id) => set({ currentProjectId: id }),

    // Avatars
    avatars: [],
    setAvatars: (a) => set({ avatars: a }),

    // Competitor Research
    competitorData: null,
    competitorLoading: false,
    setCompetitorData: (d) => set({ competitorData: d }),
    setCompetitorLoading: (l) => set({ competitorLoading: l }),

    // Milestones
    milestones: { watchVideo: false, hooksGenerated: false, conceptsGenerated: false, designGenerated: false, copyGenerated: false, allComplete: false },
    setMilestones: (m) => set((state) => ({
        milestones: typeof m === 'function' ? m(state.milestones) : m
    })),

    // UI
    isLoading: false,
    loadingMsg: '',
    startLoad: (msg) => set({ isLoading: true, loadingMsg: msg }),
    stopLoad: () => set({ isLoading: false, loadingMsg: '' }),
    toasts: [],
    showToast: (message, type) => set((state) => ({
        toasts: [...state.toasts, { message, type }]
    })),
    removeToast: (index) => set((state) => ({
        toasts: state.toasts.filter((_, i) => i !== index)
    })),
    showUpgradeModal: false,
    upgradeReason: '',
    setShowUpgradeModal: (show) => set({ showUpgradeModal: show }),
    setUpgradeReason: (reason) => set({ upgradeReason: reason }),

    // Typography
    useTypographyOverlay: false,
    setUseTypographyOverlay: (use) => set({ useTypographyOverlay: use }),

    // Workspaces
    workspaces: [],
    activeWorkspaceId: null,
    setWorkspaces: (w) => set({ workspaces: w }),
    setActiveWorkspaceId: (id) => set({ activeWorkspaceId: id }),
    hasInProgressWork: false,

    // Favorites tracking
    loadedFavoriteId: null,
    setLoadedFavoriteId: (id) => set({ loadedFavoriteId: id }),

    saveStatus: null,
    setSaveStatus: (status) => set({ saveStatus: status }),

    // Phase 23 — In-card variation carousel
    variationCarousels: {},
    variationActiveIndex: {},
    variationCapReached: {},
    pushVariations: (variant, list) => set((state) => {
        if (!variant || !Array.isArray(list) || list.length === 0) return {};
        const existing = state.variationCarousels[variant] || [];
        const cap = 11;
        const room = Math.max(0, cap - existing.length);
        if (room <= 0) {
            return {
                variationCapReached: { ...state.variationCapReached, [variant]: true },
            };
        }
        const accepted = list.slice(0, room);
        const merged = [...existing, ...accepted];
        const capped = merged.length >= cap;
        return {
            variationCarousels: { ...state.variationCarousels, [variant]: merged },
            variationActiveIndex: state.variationActiveIndex[variant] === undefined
                ? { ...state.variationActiveIndex, [variant]: 0 }
                : state.variationActiveIndex,
            variationCapReached: capped
                ? { ...state.variationCapReached, [variant]: true }
                : state.variationCapReached,
        };
    }),
    setVariationActiveIndex: (variant, index) => set((state) => {
        const list = state.variationCarousels[variant] || [];
        const max = list.length;
        const clamped = Math.max(0, Math.min(index, max));
        return {
            variationActiveIndex: { ...state.variationActiveIndex, [variant]: clamped },
        };
    }),
    resetVariations: (variant) => set((state) => {
        const nextCarousels = { ...state.variationCarousels };
        const nextActive = { ...state.variationActiveIndex };
        const nextCap = { ...state.variationCapReached };
        delete nextCarousels[variant];
        delete nextActive[variant];
        delete nextCap[variant];
        return {
            variationCarousels: nextCarousels,
            variationActiveIndex: nextActive,
            variationCapReached: nextCap,
        };
    }),
    resetAllVariations: () => set({
        variationCarousels: {},
        variationActiveIndex: {},
        variationCapReached: {},
    }),
    updateVariation: (variant, index, hv) => set((state) => {
        const list = state.variationCarousels[variant];
        if (!list || index < 0 || index >= list.length) return {};
        const next = list.slice();
        next[index] = hv;
        return { variationCarousels: { ...state.variationCarousels, [variant]: next } };
    }),

    // Reset
    resetPipeline: () => set({
        phase: 'input',
        highestUnlocked: 'input',
        tovText: '',
        selectedTov: '',
        conceptsText: '',
        selectedConcept: '',
        buildPlan: '',
        mockupHistory: [],
        historyIndex: -1,
        carouselSlides: [],
        captionText: '',
        batchResults: [],
        competitorData: null,
        loadedFavoriteId: null,
        // Phase 23 (CodeRabbit): clear per-card variation carousel state so
        // a fresh pipeline doesn't inherit variations from a previous run.
        variationCarousels: {},
        variationActiveIndex: {},
        variationCapReached: {},
    }),
}));

export function selectHasInProgressWork(state: AppState): boolean {
    return state.isLoading
        || state.competitorLoading
        || !!state.tovText
        || !!state.conceptsText
        || !!state.buildPlan
        || state.mockupHistory.length > 0
        || state.carouselSlides.length > 0
        || state.batchResults.length > 0
        || !!state.captionText;
}