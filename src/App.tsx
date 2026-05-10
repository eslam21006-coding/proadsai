import * as React from 'react';
import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import type { AdInputs, AdMode, AppPhase, AspectRatio, ABVariation, BatchResult, BatchHookGroup, CarouselSlide, CarouselSlideCopy, TextOverride, VisualPolish, Toast, SavedProject, AudienceAvatar, CompetitorResearch, SemanticLock, TovEditIntent, RewriteScope, Workspace, ReflowImageRequest, ReflowImageResponse } from './types';
// --- FIREBASE IMPORTS ---
import { auth, db, functions, storage } from './firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, onAuthStateChanged, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, onSnapshot, collection, addDoc, getDocs, query, orderBy, where, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref as storageRef, deleteObject } from 'firebase/storage';
import { gemini, type GenerationResult } from './services/geminiService';
import { resolveCreativeSpec, CREATIVE_MODE_CATALOG, type ResolvedCreativeSpec } from './creativeResolver';
import { isValidHookPayload, validateCanonicalHooks, normalizeHooksToCanonical, getHookValidationSummary } from './utils/hookPayload';
import FeedbackButtons from './components/FeedbackButtons';
import FavoritesPanel from './components/FavoritesPanel';
import SavedProjectsPanel from './components/SavedProjectsPanel/SavedProjectsPanel';
import DeleteProjectDialog from './components/SavedProjectsPanel/DeleteProjectDialog';
import SaveStatusIndicator from './components/SavedProjectsPanel/SaveStatusIndicator';
import { useFavorites } from './hooks/useFavorites';
import type { GenerationRecord } from './services/feedbackService';

type FavoritesPhase = 'hooks' | 'concepts' | 'render' | 'caption';
interface FavUpdatePrompt {
  phase: FavoritesPhase;
  newGenId: string;
}
import MagicSelector, { type EditRequest } from './components/MagicSelector';
import { feedbackService, type NegativeFeedbackTag } from './services/feedbackService';
import { metaService, type MetaConnection } from './services/metaService';
import { ASPECT_RATIOS, COLD_HOOK_ANGLES, OFFER_TYPES, getRandomUniverse } from './constants';
import type { UserPlan } from './planconfig';
import { PLANS, CREDIT_COSTS, TOPUP_PACKS, CREDITS_PER_AD, canUse, canUseRatio, requiredPlanFor, requiredPlanForRatio, hasCredits, getMaxSlides, getApproxAdsPerMonth, getFeatureLevel, showBranding, getAudienceAvatarLimit, getSavedProjectLimit } from './planconfig';
import { LanguageProvider, useT, type UILanguage } from './i18n';
import { deriveStatus } from './lib/projectStatus';
import { resolveCoverImage } from './lib/projectCoverImage';
import { uploadAndPersistThumbnail } from './lib/projectThumbnail';
import { stepsWithData } from './lib/projectStepsData';
import { useProjectAutoSave } from './hooks/useProjectAutoSave';
import type { AutoSaveState } from './lib/projectAutoSave';
import { ALL_UNIVERSES, type UniverseEntry } from './universeDatabase';
const InputForm = React.lazy(() => import('./components/InputForm'));
const PerformanceDashboard = React.lazy(() => import('./components/PerformanceDashboard'));
const PricingTableLazy = React.lazy(() => import('./components/PricingTable'));
const BillingPage = React.lazy(() => import('./pages/Billing'));
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import WorkspaceSettingsModal from './components/WorkspaceSettingsModal';
import { ForgotPasswordDialog } from './components/auth/ForgotPasswordDialog';
import { VerifyEmailScreen } from './components/auth/VerifyEmailScreen';
import { MandatoryBillingModal } from './components/billing/MandatoryBillingModal';
import { TrialExpiredBanner } from './components/billing/TrialExpiredBanner';
import { LowCreditsWarning } from './components/billing/LowCreditsWarning';

// --- LOGIN COMPONENT (Email-only with Login / Create Account tabs) ---
const LoginScreen = ({ onEmailLogin, onCreateAccount, onForgotPassword, isSubmitting, authError, initialEmail, initialTab, onTabChange, onClearAuthError }: {
  onEmailLogin: (email: string, password: string) => void;
  onCreateAccount: (email: string, password: string) => void;
  onForgotPassword: (email: string) => void;
  isSubmitting: boolean;
  authError: string | null;
  initialEmail: string;
  initialTab: 'login' | 'create';
  onTabChange: (tab: 'login' | 'create') => void;
  onClearAuthError: () => void;
}) => {
  const [activeTab, setActiveTab] = useState<'login' | 'create'>(initialTab);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inlineError, setInlineError] = useState<string | null>(null);
  const { t, lang, setLang } = useT();

  // Sync tab + email from parent on auto-switch
  React.useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  React.useEffect(() => {
    if (initialEmail) setEmail(initialEmail);
  }, [initialEmail]);

  // Display parent-provided auth error (from auto-switch flow)
  React.useEffect(() => {
    if (authError) setInlineError(authError);
  }, [authError]);

  const clearError = () => {
    setInlineError(null);
    onClearAuthError();
  };

  const handleSwitchTab = (tab: 'login' | 'create') => {
    setActiveTab(tab);
    onTabChange(tab);
    clearError();
  };

  const handleLoginSubmit = () => {
    if (!email || !password) return;
    clearError();
    onEmailLogin(email, password);
  };

  const handleCreateSubmit = () => {
    if (!email || !password || !confirmPassword) return;
    if (password !== confirmPassword) {
      setInlineError(t('login.errorPasswordsMismatch'));
      return;
    }
    if (password.length < 8) {
      setInlineError(t('login.errorWeakPassword'));
      return;
    }
    clearError();
    onCreateAccount(email, password);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
      {/* Language toggle */}
      <div className="absolute top-4 right-4 z-10">
        <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
          className="px-3 py-1.5 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition-all flex items-center gap-2">
          <i className="fa-solid fa-globe text-[10px]"></i>
          {t('lang.switch_label')}
        </button>
      </div>

      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-0 w-full h-full -z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[150px] animate-pulse"></div>
      </div>

      {/* Glass Card Container */}
      <div className="max-w-2xl w-full glass-panel p-10 md:p-16 rounded-[3rem] shadow-2xl space-y-10 animate-in zoom-in duration-700 relative text-center border border-white/5">

        {/* Logo Section */}
        <div className="space-y-6 text-center">
          <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto shadow-2xl shadow-blue-600/40 transform -rotate-6 mb-6 hover:rotate-0 transition-all duration-500">
            <i className="fa-solid fa-wand-magic-sparkles text-white text-5xl"></i>
          </div>
          <h1 className="text-6xl font-black text-white italic tracking-tighter uppercase leading-none">
            Pro Ads <span className="text-blue-500">AI</span>
          </h1>
          <p className="text-slate-400 text-xs font-bold tracking-[0.4em] uppercase leading-relaxed max-w-sm mx-auto">
            {t('app.tagline')}
          </p>
        </div>

        {/* ═══ Tab Buttons ═══ */}
        <div className="flex max-w-md mx-auto bg-slate-900/60 rounded-2xl p-1">
          <button
            onClick={() => handleSwitchTab('login')}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'login' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            {t('login.enterStudio')}
          </button>
          <button
            onClick={() => handleSwitchTab('create')}
            className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'create' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
          >
            {t('login.createAccountButton')}
          </button>
        </div>

        {/* ═══ Inline Error ═══ */}
        {inlineError && (
          <div className="w-full max-w-md mx-auto bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
            <p className="text-sm font-bold text-red-400">{inlineError}</p>
          </div>
        )}

        {/* ═══ Login Tab ═══ */}
        {activeTab === 'login' && (
          <div className="flex flex-col items-center space-y-4 w-full max-w-md mx-auto">
            <div className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-envelope text-slate-600 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); clearError(); }}
                placeholder={t('login.emailLabel')}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium shadow-inner"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleLoginSubmit()}
              />
            </div>
            <div className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-slate-600 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); clearError(); }}
                placeholder={t('login.passwordLabel')}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium shadow-inner"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleLoginSubmit()}
              />
            </div>

            <button
              onClick={handleLoginSubmit}
              disabled={isSubmitting || !email || !password}
              className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.25em] shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? t('login.please_wait') : t('login.enterStudio')}</span>
              {!isSubmitting && <i className="fa-solid fa-arrow-right"></i>}
            </button>

            <button
              type="button"
              onClick={() => onForgotPassword(email)}
              className="text-[10px] font-bold text-slate-500 hover:text-blue-400 uppercase tracking-widest transition-colors self-end -mt-1"
            >
              {t('login.forgotPassword')}
            </button>
          </div>
        )}

        {/* ═══ Create Account Tab ═══ */}
        {activeTab === 'create' && (
          <div className="flex flex-col items-center space-y-4 w-full max-w-md mx-auto">
            <div className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-envelope text-slate-600 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="email"
                value={email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); clearError(); }}
                placeholder={t('login.emailLabel')}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium shadow-inner"
              />
            </div>
            <div className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-slate-600 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setPassword(e.target.value); clearError(); }}
                placeholder={t('login.passwordLabel')}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium shadow-inner"
              />
            </div>
            <div className="w-full relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <i className="fa-solid fa-lock text-slate-600 group-focus-within:text-blue-500 transition-colors"></i>
              </div>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setConfirmPassword(e.target.value); clearError(); }}
                placeholder={t('login.confirmPasswordLabel')}
                className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl pl-12 pr-6 py-5 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all text-sm font-medium shadow-inner"
                onKeyDown={(e: React.KeyboardEvent) => e.key === 'Enter' && handleCreateSubmit()}
              />
            </div>

            <button
              onClick={handleCreateSubmit}
              disabled={isSubmitting || !email || !password || !confirmPassword}
              className="w-full py-5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.25em] shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98] flex items-center justify-center space-x-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? t('login.please_wait') : t('login.createAccountButton')}</span>
            </button>
          </div>
        )}

        {/* ═══ Switch Tab Links ═══ */}
        <div className="pt-4 border-t border-white/5 flex flex-col items-center gap-3">
          {activeTab === 'login' && (
            <button onClick={() => handleSwitchTab('create')} className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
              {t('login.dontHaveAccount')} <span className="text-blue-500 hover:text-white">{t('login.createAccount')}</span>
            </button>
          )}
          {activeTab === 'create' && (
            <button onClick={() => handleSwitchTab('login')} className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
              {t('login.alreadyHaveAccount')} <span className="text-blue-500 hover:text-white">{t('login.enterStudio')}</span>
            </button>
          )}
          <p className="text-[9px] text-slate-700 mt-1">
            By logging in, you agree to our{' '}
            <a href="https://proadsai.com/terms" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-blue-400 underline transition-colors">Terms of Service</a>
          </p>
        </div>
      </div>
    </div>
  );
};

// --- INDEXED DB HELPERS 
const DB_NAME = 'ProAdsDB_V2'; // Bumped version for userId index
const STORE_NAME = 'projects';

const openDB = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveProjectToDB = async (project: SavedProject) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};

const getAllProjectsFromDB = async (userId: string) => {
  const db = await openDB();
  return new Promise<SavedProject[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('userId');
    const request = index.getAll(userId);
    request.onsuccess = () => {
      const res = request.result as SavedProject[];
      resolve(res.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
};

const deleteProjectFromDB = async (id: string) => {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
};
// -------------------------------------------

// --- FIRESTORE PROJECT SYNC (cloud backup for cross-browser access) ---
// Recursively remove undefined values from objects (Firestore rejects undefined)
const stripUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(stripUndefined);
  if (typeof obj === 'object' && obj !== null) {
    const clean: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = stripUndefined(value);
      }
    }
    return clean;
  }
  return obj;
};

const saveProjectToFirestore = async (userId: string, project: SavedProject) => {
  // Strip large image URLs from batchResults before saving to Firestore (1MB doc limit)
  // Also recursively strip undefined values (Firestore rejects them)
  const cleanProject = stripUndefined(JSON.parse(JSON.stringify({ ...project })));
  if (cleanProject.batchResults && cleanProject.batchResults.length > 0) {
    cleanProject.batchResults = cleanProject.batchResults.map((r: any) => ({
      ...r,
      // Keep URL only if it's a short Firebase Storage URL, strip base64/data URLs
      url: r.url && r.url.length > 5000 ? null : r.url,
    }));
  }
  const projectRef = doc(db, 'users', userId, 'projects', project.id);
  await setDoc(projectRef, { ...cleanProject, userId, updatedAt: Date.now() });
};

const getAllProjectsFromFirestore = async (userId: string): Promise<SavedProject[]> => {
  try {
    const q = query(
      collection(db, 'users', userId, 'projects'),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data() as SavedProject);
  } catch (e) {
    console.warn('Firestore project fetch failed (falling back to local):', e);
    return [];
  }
};

const deleteProjectFromFirestore = async (userId: string, projectId: string) => {
  try {
    await deleteDoc(doc(db, 'users', userId, 'projects', projectId));
  } catch (e) {
    console.warn('Firestore project delete failed (non-blocking):', e);
  }
};

/** Merge cloud + local projects, preferring the newer version of each */
const mergeProjects = (cloud: SavedProject[], local: SavedProject[]): SavedProject[] => {
  const map = new Map<string, SavedProject>();
  for (const p of local) map.set(p.id, p);
  for (const p of cloud) {
    const existing = map.get(p.id);
    if (!existing || p.timestamp > existing.timestamp) {
      map.set(p.id, p);
    }
  }
  return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
};
// -------------------------------------------

const steps: { id: AppPhase; tKey: string }[] = [
  { id: 'input', tKey: 'step.brief' },
  { id: 'tov_review', tKey: 'step.hooks' },
  { id: 'concept_review', tKey: 'step.blueprint' },
  { id: 'render_studio', tKey: 'step.studio' },
  { id: 'primary_text', tKey: 'step.script' },
];

const ToastNotification: React.FC<{ toast: Toast | null; onClose: () => void }> = ({ toast, onClose }) => {
  if (!toast) return null;
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const bg = toast.type === 'error' ? 'bg-red-600' : toast.type === 'success' ? 'bg-green-600' : 'bg-blue-600';
  return (
    <div className={`fixed bottom-10 left-1/2 -translate-x-1/2 ${bg} text-white px-8 py-4 rounded-2xl shadow-2xl z-[200] animate-in slide-in-from-bottom-4 flex items-center space-x-3`}>
      <i className={`fa-solid ${toast.type === 'error' ? 'fa-circle-exclamation' : 'fa-circle-check'}`}></i>
      <span className="text-xs font-black uppercase tracking-widest">{toast.message}</span>
    </div>
  );
};

const PrivacyPolicy: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="min-h-screen bg-slate-950 text-slate-300 p-8 md:p-20 animate-in fade-in duration-700">
    <div className="max-w-4xl mx-auto space-y-10">
      <button onClick={onBack} className="flex items-center space-x-2 text-blue-500 font-bold uppercase tracking-widest text-xs hover:text-blue-400 transition-colors">
        <i className="fa-solid fa-arrow-left"></i><span>Back to App</span>
      </button>
      <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase">Privacy Policy</h1>
      <div className="space-y-6 text-slate-400 leading-relaxed">
        <p>At <strong>Pro Ads AI</strong>, your privacy is our priority.</p>
        <section className="space-y-3">
          <h2 className="text-xl font-bold text-white">1. Gemini Connection</h2>
          <p>We use the Google Gemini API (V18.0) through our secure Firebase proxy. Your credentials are encrypted and never shared.</p>
        </section>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════
// ONBOARDING QUIZ — First login only (3 steps)
// ═══════════════════════════════════════════════════════════════════
const ONBOARDING_CHALLENGES = [
  { id: 'ideas', icon: 'fa-lightbulb', label: 'Lack of creative ad ideas' },
  { id: 'time', icon: 'fa-clock', label: 'Not enough time to create ads' },
  { id: 'reach', icon: 'fa-bullhorn', label: 'Low reach & visibility' },
  { id: 'sales', icon: 'fa-chart-line', label: 'Low sales conversions' },
  { id: 'strategy', icon: 'fa-puzzle-piece', label: 'No clear ad strategy' },
  { id: 'engagement', icon: 'fa-heart', label: 'Low engagement rates' },
  { id: 'other', icon: 'fa-ellipsis', label: 'Other' },
];

const ONBOARDING_BUSINESS_TYPES = [
  { id: 'coaching', icon: 'fa-users', label: 'Training & Consulting' },
  { id: 'saas', icon: 'fa-server', label: 'SaaS / Software' },
  { id: 'content', icon: 'fa-camera', label: 'Content Creators & Influencers' },
  { id: 'scaling', icon: 'fa-briefcase', label: 'Agencies & Freelancers' },
  { id: 'ecommerce', icon: 'fa-shopping-bag', label: 'E-commerce & Retail' },
  { id: 'other', icon: 'fa-ellipsis', label: 'Other' },
];

const ONBOARDING_NICHES = [
  { id: 'marketing', icon: 'fa-chart-bar', label: 'Marketing & Sales' },
  { id: 'personal_dev', icon: 'fa-brain', label: 'Personal Development' },
  { id: 'health', icon: 'fa-dumbbell', label: 'Health & Fitness' },
  { id: 'business', icon: 'fa-rocket', label: 'Business & Entrepreneurship' },
  { id: 'beauty', icon: 'fa-spa', label: 'Beauty & Skincare' },
  { id: 'therapy', icon: 'fa-heart-pulse', label: 'Therapy & Mental Health' },
  { id: 'spirituality', icon: 'fa-sun', label: 'Energy & Spirituality' },
  { id: 'finance', icon: 'fa-dollar-sign', label: 'Finance & Investment' },
  { id: 'tech', icon: 'fa-laptop-code', label: 'Technology' },
  { id: 'design', icon: 'fa-pen-nib', label: 'Creativity & Design' },
  { id: 'other', icon: 'fa-ellipsis', label: 'Other' },
];

const OnboardingQuiz: React.FC<{ onComplete: (data: { challenge: string; businessType: string; niche: string }) => void }> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [challenge, setChallenge] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [niche, setNiche] = useState('');
  const { t } = useT();
  const totalSteps = 3;

  const canProceed = step === 1 ? !!challenge : step === 2 ? !!businessType : !!niche;

  const handleNext = () => {
    if (step < totalSteps && canProceed) setStep(step + 1);
    else if (step === totalSteps && canProceed) onComplete({ challenge, businessType, niche });
  };

  const OptionCard = ({ item, selected, onSelect }: { item: { id: string; icon: string; tKey: string }; selected: boolean; onSelect: () => void }) => (
    <button type="button" onClick={onSelect} className={`relative flex items-center gap-3 p-4 rounded-2xl border text-left transition-all duration-200 group ${selected ? 'bg-blue-600/15 border-blue-500/50 shadow-lg shadow-blue-500/5' : 'bg-slate-900/30 border-slate-800/40 hover:border-slate-700 hover:bg-slate-900/50'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors ${selected ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800/50 text-slate-500 group-hover:text-slate-400'}`}>
        <i className={`fa-solid ${item.icon} text-sm`}></i>
      </div>
      <span className={`text-[13px] font-semibold transition-colors ${selected ? 'text-white' : 'text-slate-300'}`}>{t(item.tKey)}</span>
      {selected && <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center"><i className="fa-solid fa-check text-[8px] text-white"></i></div>}
    </button>
  );

  const challenges = ONBOARDING_CHALLENGES.map(c => ({ ...c, tKey: `onboarding.${c.id}` }));
  const bizTypes = ONBOARDING_BUSINESS_TYPES.map(b => ({ ...b, tKey: b.id === 'scaling' ? 'onboarding.agency_type' : `onboarding.${b.id}` }));
  const niches = ONBOARDING_NICHES.map(n => ({ ...n, tKey: `onboarding.${n.id}` }));

  const stepData = step === 1 ? challenges : step === 2 ? bizTypes : niches;
  const selectedVal = step === 1 ? challenge : step === 2 ? businessType : niche;
  const setVal = step === 1 ? setChallenge : step === 2 ? setBusinessType : setNiche;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-600/8 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-indigo-600/8 rounded-full blur-[150px]"></div>
      </div>

      <div className="max-w-xl w-full space-y-8 animate-in fade-in duration-500">
        {/* Progress */}
        <div className="space-y-3 text-center">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600/10 rounded-full text-blue-400 text-[10px] font-bold tracking-wide">
            <i className="fa-solid fa-sparkles text-[9px]"></i> {t('onboarding.personalize')}
          </span>
          <p className="text-slate-500 text-xs">{t('onboarding.step_of', { step: String(step), total: String(totalSteps) })}</p>
          <div className="flex gap-2 max-w-[200px] mx-auto">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < step ? 'bg-blue-500' : 'bg-slate-800'}`}></div>
            ))}
          </div>
        </div>

        {/* Question */}
        <div className="text-center space-y-2">
          <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
            {t(step === 1 ? 'onboarding.q1' : step === 2 ? 'onboarding.q2' : 'onboarding.q3')}
          </h2>
          <p className="text-slate-400 text-sm">
            {t(step === 1 ? 'onboarding.q1_sub' : step === 2 ? 'onboarding.q2_sub' : 'onboarding.q3_sub')}
          </p>
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-3">
          {stepData.map(item => (
            <OptionCard key={item.id} item={item} selected={selectedVal === item.id} onSelect={() => setVal(item.id)} />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2">
          {step > 1 ? (
            <button onClick={() => setStep(step - 1)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">
              <i className="fa-solid fa-arrow-right text-xs"></i> {t('back')}
            </button>
          ) : <div />}
          <button onClick={handleNext} disabled={!canProceed}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-blue-600/20">
            {step === totalSteps ? t('finish') : t('next')} <i className="fa-solid fa-arrow-left text-xs"></i>
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// WELCOME SCREEN — Shows after login before entering studio
// ═══════════════════════════════════════════════════════════════════
const WelcomeScreen: React.FC<{
  userName: string; isTrial: boolean; onStart: () => void;
}> = ({ userName, isTrial, onStart }) => {
  const firstName = userName?.split(' ')[0] || userName?.split('@')[0] || '';
  const { t } = useT();

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-[600px] h-[600px] bg-blue-600/6 rounded-full blur-[180px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/6 rounded-full blur-[120px]"></div>
      </div>

      {/* Trial banner */}
      {isTrial && (
        <div className="w-full bg-gradient-to-l from-amber-500/10 via-amber-500/15 to-amber-500/10 border-b border-amber-500/20 px-6 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between flex-row-reverse">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-amber-200/80" dangerouslySetInnerHTML={{ __html: t('welcome.trial_msg') }}></span>
              <i className="fa-solid fa-sparkles text-amber-400"></i>
            </div>
            <a href="https://proadsai.com/#pricing" target="_blank" rel="noopener noreferrer" className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-bold rounded-lg transition-all border border-amber-500/20">
              {t('welcome.upgrade')}
            </a>
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-lg space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="w-20 h-20 bg-blue-600 rounded-[1.5rem] flex items-center justify-center mx-auto shadow-2xl shadow-blue-600/30 transform -rotate-6 hover:rotate-0 transition-all duration-500">
            <i className="fa-solid fa-wand-magic-sparkles text-white text-4xl"></i>
          </div>
          <div className="space-y-3">
            <p className="text-blue-400 text-lg font-bold">{t('welcome.hi', { name: firstName })}</p>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
              {t('welcome.headline')}<br /><span className="text-blue-400">{t('welcome.headline_accent')}</span>
            </h1>
            <p className="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
              {t('welcome.sub')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button onClick={onStart}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition-all flex items-center gap-3 shadow-xl shadow-blue-600/20 active:scale-[0.98]">
              <i className="fa-solid fa-rocket"></i> {t('welcome.start')}
            </button>
            <a href="https://proadsai.com" target="_blank" rel="noopener noreferrer"
              className="px-6 py-4 bg-slate-900/60 hover:bg-slate-900 text-slate-300 rounded-2xl text-sm font-medium transition-all flex items-center gap-3 border border-slate-800/50">
              <i className="fa-solid fa-play text-xs"></i> {t('welcome.how')}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// SIGN-OUT SCREEN — "See you soon" after logout
// ═══════════════════════════════════════════════════════════════════
const SignOutScreen: React.FC<{ onSignIn: () => void }> = ({ onSignIn }) => {
  const { t } = useT();
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/6 rounded-full blur-[180px]"></div>
      </div>
      <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
        <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <i className="fa-solid fa-check text-emerald-400 text-2xl"></i>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-3xl">👋</p>
          <h2 className="text-3xl font-black text-white tracking-tight">{t('signout.title')}</h2>
          <p className="text-slate-400 text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: t('signout.message') }}></p>
        </div>
        <button onClick={onSignIn}
          className="w-full max-w-xs mx-auto px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-3 shadow-xl shadow-blue-600/20">
          <i className="fa-solid fa-sparkles"></i> {t('signout.again')}
        </button>
        <p className="text-slate-600 text-xs">{t('signout.thanks')}</p>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// WIN-BACK SCREEN — Returning cancelled users
// ═══════════════════════════════════════════════════════════════════
const WinBackScreen: React.FC<{ userName: string; cancelledAt: string; onResubscribe: () => void; onLogout: () => void }> = ({ userName, cancelledAt, onResubscribe, onLogout }) => {
  const { t } = useT();
  const firstName = userName.split(' ')[0] || userName;
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6 relative overflow-hidden">
      <div className="absolute inset-0 -z-10 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-blue-600/6 rounded-full blur-[180px]"></div>
      </div>
      <div className="max-w-lg w-full text-center space-y-8 animate-in fade-in zoom-in-95 duration-700">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-amber-500/10 flex items-center justify-center">
          <span className="text-4xl">👋</span>
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-black text-white tracking-tight">Welcome back, {firstName}</h2>
          <p className="text-slate-400 text-sm leading-relaxed">
            Your subscription was cancelled on <span className="font-bold text-white">{cancelledAt}</span>.
          </p>
          <p className="text-slate-500 text-sm">
            We've been improving — new features, faster renders, better quality. Ready to pick up where you left off?
          </p>
        </div>

        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-2xl p-6 space-y-2">
          <p className="text-emerald-400 text-sm font-bold">🎉 Welcome-back offer</p>
          <p className="text-slate-300 text-xs leading-relaxed">Re-subscribe now and keep all your saved projects, avatars, and settings intact.</p>
        </div>

        <div className="flex flex-col gap-3 max-w-xs mx-auto">
          <button onClick={onResubscribe}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition-all shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2">
            <i className="fa-solid fa-rocket"></i> Re-Subscribe Now
          </button>
          <a href="https://proadsai.com/#pricing" target="_blank" rel="noopener noreferrer"
            className="w-full py-3 bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 rounded-2xl text-xs font-semibold transition-all flex items-center justify-center gap-2">
            See All Plans
          </a>
          <button onClick={onLogout} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors mt-2">
            Log out
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// WALKTHROUGH OVERLAY — Step-by-step guide for first-time users
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// SPOTLIGHT TOUR — Points to real UI elements with bubble tooltips
// ═══════════════════════════════════════════════════════════════════
interface TourStep { selector: string; title: string; desc: string; position?: 'bottom' | 'top' | 'left' | 'right' }

const SpotlightTour: React.FC<{ steps: TourStep[]; onComplete: () => void }> = ({ steps, onComplete }) => {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[idx];

  // Find and scroll to target element
  React.useEffect(() => {
    const el = document.querySelector(step.selector) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to finish
      const timer = setTimeout(() => setRect(el.getBoundingClientRect()), 350);
      return () => clearTimeout(timer);
    } else {
      setRect(null);
    }
  }, [idx, step.selector]);

  // Recalc on scroll/resize
  React.useEffect(() => {
    const update = () => {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [step.selector]);

  const next = () => { if (idx < steps.length - 1) setIdx(idx + 1); else onComplete(); };
  const prev = () => { if (idx > 0) setIdx(idx - 1); };

  // Tooltip position
  const pad = 12;
  const pos = step.position || 'bottom';
  const tooltipStyle: React.CSSProperties = rect ? {
    position: 'fixed',
    zIndex: 10002,
    ...(pos === 'bottom' ? { top: rect.bottom + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' } :
      pos === 'top' ? { bottom: window.innerHeight - rect.top + pad, left: rect.left + rect.width / 2, transform: 'translateX(-50%)' } :
        pos === 'right' ? { top: rect.top + rect.height / 2, left: rect.right + pad, transform: 'translateY(-50%)' } :
          { top: rect.top + rect.height / 2, right: window.innerWidth - rect.left + pad, transform: 'translateY(-50%)' }),
  } : { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10002 };

  // Arrow direction class
  const arrowCls = pos === 'bottom' ? 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900 border-l-transparent border-r-transparent border-t-transparent'
    : pos === 'top' ? 'top-full left-1/2 -translate-x-1/2 border-t-slate-900 border-l-transparent border-r-transparent border-b-transparent'
      : pos === 'right' ? 'right-full top-1/2 -translate-y-1/2 border-r-slate-900 border-t-transparent border-b-transparent border-l-transparent'
        : 'left-full top-1/2 -translate-y-1/2 border-l-slate-900 border-t-transparent border-b-transparent border-r-transparent';

  return (
    <div className="fixed inset-0 z-[10000]">
      {/* Overlay with cutout */}
      <svg className="fixed inset-0 w-full h-full" style={{ zIndex: 10000 }}>
        <defs>
          <mask id="spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && <rect x={rect.left - 6} y={rect.top - 6} width={rect.width + 12} height={rect.height + 12} rx="12" fill="black" />}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.7)" mask="url(#spotlight-mask)" />
      </svg>

      {/* Highlight ring */}
      {rect && (
        <div className="fixed rounded-xl ring-2 ring-blue-500/60 ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
          style={{ zIndex: 10001, top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />
      )}

      {/* Tooltip bubble */}
      <div style={tooltipStyle} className="w-72 max-w-[90vw]">
        {/* Arrow */}
        <div className={`absolute w-0 h-0 border-[8px] ${arrowCls}`}></div>
        <div className="bg-slate-900 border border-slate-700/60 rounded-2xl p-5 shadow-2xl shadow-black/60">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5 mb-3">
            {steps.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all ${i === idx ? 'w-5 bg-blue-500' : i < idx ? 'w-2 bg-blue-500/30' : 'w-2 bg-slate-700'}`}></div>
            ))}
            <span className="text-[9px] text-slate-600 ml-auto">{idx + 1}/{steps.length}</span>
          </div>
          <h4 className="text-sm font-bold text-white mb-1.5">{step.title}</h4>
          <p className="text-xs text-slate-400 leading-relaxed mb-4">{step.desc}</p>
          <div className="flex items-center justify-between">
            <button onClick={onComplete} className="text-[10px] text-slate-500 hover:text-white transition-colors font-medium">Skip tour</button>
            <div className="flex items-center gap-2">
              {idx > 0 && (
                <button onClick={prev} className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white bg-white/[0.04] transition-colors">Back</button>
              )}
              <button onClick={next} className="px-4 py-1.5 rounded-lg text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20">
                {idx < steps.length - 1 ? 'Next' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════
// ONBOARDING MILESTONES — Earn credits by completing steps
// ═══════════════════════════════════════════════════════════════════
interface Milestones {
  watchVideo: boolean;
  hooksGenerated: boolean;
  conceptsGenerated: boolean;
  designGenerated: boolean;
  copyGenerated: boolean;
  allComplete: boolean;
}
const EMPTY_MILESTONES: Milestones = { watchVideo: false, hooksGenerated: false, conceptsGenerated: false, designGenerated: false, copyGenerated: false, allComplete: false };
const MILESTONE_REWARDS: Record<string, number> = { watchVideo: 2, hooksGenerated: 2, conceptsGenerated: 2, designGenerated: 2, copyGenerated: 2, allComplete: 40 };

// Tutorial video URL — replace VIDEO_ID with your actual YouTube video ID
// Example: if your YouTube URL is https://www.youtube.com/watch?v=abc123, use 'abc123'
const TUTORIAL_VIDEO_ID = 'XoJ7YQJZhC8';

const VideoPopup: React.FC<{ onComplete: () => void; onClose: () => void }> = ({ onComplete, onClose }) => {
  const [watched, setWatched] = useState(false);
  return (
    <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800/60 rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
        {/* Video embed */}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          <iframe
            className="absolute inset-0 w-full h-full"
            src={`https://www.youtube.com/embed/${TUTORIAL_VIDEO_ID}?rel=0&autoplay=1`}
            title="ProAds AI Quick Start"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Quick start guide</h3>
              <p className="text-xs text-slate-400 mt-1">Watch this 2-min overview to earn <span className="text-amber-400 font-bold">2 bonus credits</span></p>
            </div>
            {!watched && (
              <span className="text-[9px] text-slate-600 bg-white/[0.04] px-2.5 py-1 rounded-full">Finish video to claim</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {watched ? (
              <button onClick={onComplete} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20">
                <i className="fa-solid fa-coins text-amber-400"></i> Claim 2 Credits
              </button>
            ) : (
              <button onClick={() => setWatched(true)} className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                <i className="fa-solid fa-check"></i> I've watched it
              </button>
            )}
            <button onClick={onClose} className="px-4 py-3 bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 rounded-xl text-xs font-semibold transition-all">
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EarnCreditsPanel: React.FC<{ milestones: Milestones; onWatchVideo: () => void }> = ({ milestones, onWatchVideo }) => {
  const steps = [
    { key: 'watchVideo' as const, icon: 'fa-play', label: 'Watch quick start video', reward: 2, action: onWatchVideo },
    { key: 'hooksGenerated' as const, icon: 'fa-bolt', label: 'Generate your first hooks', reward: 2 },
    { key: 'conceptsGenerated' as const, icon: 'fa-palette', label: 'Generate visual concepts', reward: 2 },
    { key: 'designGenerated' as const, icon: 'fa-image', label: 'Render your first ad', reward: 2 },
    { key: 'copyGenerated' as const, icon: 'fa-file-lines', label: 'Generate ad caption', reward: 2 },
    { key: 'allComplete' as const, icon: 'fa-trophy', label: 'Complete all steps', reward: 40 },
  ];
  const completedCount = steps.filter(s => milestones[s.key]).length;
  const totalEarned = steps.filter(s => milestones[s.key]).reduce((sum, s) => sum + s.reward, 0);

  if (milestones.allComplete) return null; // Hide once fully completed

  return (
    <div className="mx-4 mb-4 bg-gradient-to-b from-amber-500/5 to-transparent border border-amber-500/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <i className="fa-solid fa-gift text-amber-400 text-xs"></i>
          </div>
          <div>
            <p className="text-[10px] font-bold text-white">Earn 50 credits</p>
            <p className="text-[9px] text-slate-500">{completedCount}/{steps.length} steps · {totalEarned} earned</p>
          </div>
        </div>
      </div>
      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-700" style={{ width: `${(completedCount / steps.length) * 100}%` }}></div>
      </div>
      {/* Steps */}
      <div className="space-y-1.5">
        {steps.map(s => (
          <div key={s.key}
            onClick={!milestones[s.key] && s.action ? s.action : undefined}
            className={`flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-all ${milestones[s.key] ? 'opacity-50' : s.action ? 'hover:bg-white/[0.04] cursor-pointer' : ''}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] ${milestones[s.key] ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-600'}`}>
              {milestones[s.key] ? <i className="fa-solid fa-check"></i> : <i className={`fa-solid ${s.icon}`}></i>}
            </div>
            <span className={`text-[10px] flex-1 ${milestones[s.key] ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{s.label}</span>
            <span className={`text-[9px] font-bold ${milestones[s.key] ? 'text-emerald-500' : 'text-amber-400'}`}>
              {milestones[s.key] ? '✓' : `+${s.reward}`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══ LEGACY MODE SANITIZER (shared across all project/draft loading paths) ═══
const VALID_MODE_IDS = new Set(Object.keys(CREATIVE_MODE_CATALOG));
function sanitizeProjectModes(inputs: any): any {
  if (!inputs) return inputs;
  const clean = { ...inputs };
  // Sanitize creative modes — remove any that no longer exist
  if (clean.offerCreativeMode) {
    const before = clean.offerCreativeMode as string[];
    const after = before.filter((m: string) => VALID_MODE_IDS.has(m));
    if (after.length !== before.length) {
      const removed = before.filter((m: string) => !VALID_MODE_IDS.has(m));
      console.warn(`🧹 Legacy mode sanitization: removed [${removed.join(', ')}]`);
    }
    clean.offerCreativeMode = after.length > 0 ? after : ['standard_hero'];
  }
  // Sanitize removed offer types
  if (clean.offerType && !OFFER_TYPES.includes(clean.offerType)) {
    console.warn(`🧹 Legacy offer type: "${clean.offerType}" → "Mini-Course"`);
    clean.offerType = 'Mini-Course';
  }
  return clean;
}

// Normalize Arabic field labels to English (must be at module scope to avoid hoisting issues)
const normalizeFieldLabels = (text: string): string => {
  if (!text) return text;
  const d = '[\u064B-\u065F\u0670\u0640]*';
  const a = '[\u0627\u0622\u0623\u0625\u0671]';
  const sep = '[_ ]';
  const fieldMap: [RegExp, string][] = [
    [new RegExp(`\u0648${d}\u0635${d}\u0641${sep}${a}${d}\u0644${d}\u0641${d}\u0639${d}\u0644`, 'gi'), 'SUBJECT_ACTION'],
    [new RegExp(`\u0648${d}\u0635${d}\u0641${sep}${a}${d}\u0644${d}\u0628${d}[\u064a\u0649]${d}\u0626${d}\u0629`, 'gi'), 'ENVIRONMENT_DESC'],
    [new RegExp(`${a}${d}\u0644${d}\u0645${d}\u0634${d}\u0627${d}\u0639${d}\u0631${sep}\u0648${d}${a}${d}\u0644${d}\u0645${d}\u0632${d}\u0627${d}\u062c`, 'gi'), 'MOOD_EMOTION'],
    [new RegExp(`\u0645${d}\u0646${d}\u0637${d}\u0642${sep}${a}${d}\u0644${d}${a}${d}\u0636${d}${a}${d}\u0621${d}\u0629`, 'gi'), 'LIGHTING_LOGIC'],
    [new RegExp(`\u062a${d}\u062e${d}\u0637${d}\u064a${d}\u0637${sep}${a}${d}\u0644${d}\u0646${d}\u0635`, 'gi'), 'TEXT_LAYOUT'],
    [new RegExp(`\u0645${d}\u0648${d}\u0642${d}\u0639${sep}${a}${d}\u0644${d}\u0632${d}\u0631`, 'gi'), 'BUTTON_POSITION'],
    [new RegExp(`${a}${d}\u0644${d}\u0639${d}\u0644${d}${a}${d}\u0645${d}\u0629${sep}${a}${d}\u0644${d}\u062a${d}\u062c${d}${a}${d}\u0631${d}\u064a${d}\u0629`, 'gi'), 'BRANDING_LOGIC'],
  ];
  let result = text;
  for (const [pattern, english] of fieldMap) {
    result = result.replace(pattern, english);
  }
  return result;
};

const App: React.FC = () => {
  // --- i18n ---
  const { t, lang, setLang } = useT();
  // Mutable ref for effective UID — updated each render, safe to use in effects before state declarations
  const effectiveUidRef = React.useRef<string | null>(null);
  // --- STATE ---
  const [view, setView] = useState<'app' | 'privacy'>('app');
  const [showSidebar, setShowSidebar] = useState(false);
  // --- THEME ---
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('proads-theme');
    return saved !== 'light';
  });
  const toggleTheme = () => {
    setIsDarkMode(prev => {
      const next = !prev;
      if (next) {
        document.documentElement.classList.remove('light-mode');
        localStorage.setItem('proads-theme', 'dark');
      } else {
        document.documentElement.classList.add('light-mode');
        localStorage.setItem('proads-theme', 'light');
      }
      return next;
    });
  };
  // Apply theme on mount
  useState(() => {
    if (!isDarkMode) document.documentElement.classList.add('light-mode');
  });
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>(() => Date.now().toString());
  const [currentProjectName, setCurrentProjectName] = useState<string>("Untitled Project");
  // --- AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>('');
  const [loginTab, setLoginTab] = useState<'login' | 'create'>('login');
  const [showMandatoryBilling, setShowMandatoryBilling] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null); // null = loading
  const [showWelcome, setShowWelcome] = useState(false);
  const [showSignOut, setShowSignOut] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [tourCompleted, setTourCompleted] = useState(false);
  const [cancelledAt, setCancelledAt] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<Milestones>(EMPTY_MILESTONES);
  const [showVideoPopup, setShowVideoPopup] = useState(false);

  // 1. Check for topup return from Paddle
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('topup') === 'success') {
      const credits = params.get('credits');
      showToast(`🎉 +${credits || ''} credits added! Your balance will update shortly.`, 'success');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('topup') === 'cancelled') {
      showToast('Top-up cancelled.', 'error');
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Handle billing deep links from GHL emails
    const tab = params.get('tab');
    if (tab === 'billing' || tab === 'manage') {
      setBillingTab('manage');
      setShowBillingModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (tab === 'upgrade') {
      setBillingTab('upgrade');
      setShowBillingModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (tab === 'payment') {
      setBillingTab('payment');
      setShowBillingModal(true);
      window.history.replaceState({}, '', window.location.pathname);
    }

    // Restore session after returning from Paddle billing portal
    const savedPhase = sessionStorage.getItem('proads_return_phase');
    if (savedPhase) {
      sessionStorage.removeItem('proads_return_phase');
      // Store for auth callback to pick up after user doc loads
      sessionStorage.setItem('proads_pending_phase', savedPhase);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Listen for Login/Logout
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // ─── T047: Email verification gate ───
        if (!currentUser.emailVerified) {
          setUser(currentUser);
          setLoadingAuth(false);
          return;
        }

        // Email verified — proceed to Firestore lookup
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          // EXISTING USER — normal login
          const userData = userSnap.data();
          setUser(currentUser);

          // Team member? Load owner's credits instead of their own
          if (userData.isTeamMember && userData.teamOwnerUid) {
            setTeamOwnerUid(userData.teamOwnerUid);
            setTeamRole(userData.teamRole || 'viewer');
            const ownerRef = doc(db, 'users', userData.teamOwnerUid);
            const ownerSnap = await getDoc(ownerRef);
            if (ownerSnap.exists()) {
              const ownerData = ownerSnap.data();
              setUserCredits(ownerData.credits ?? 0);
              const effectivePlan = (ownerData.plan ?? 'none');
              setUserPlan(effectivePlan as UserPlan);
              setIsTrialUser(ownerData.isTrial === true);
              setStripeCustomerId(ownerData.stripeCustomerId ?? null);
              setBillingStatus(ownerData.billingStatus || 'active');
            } else {
              setUserCredits(0);
              setUserPlan('none');
              setIsTrialUser(false);
              setBillingStatus('cancelled');
            }
          } else {
            setUserCredits(userData.credits ?? 0);
            const effectivePlan = (userData.plan ?? 'none');
            setUserPlan(effectivePlan as UserPlan);
            setIsTrialUser(userData.isTrial === true);
            setStripeCustomerId(userData.stripeCustomerId ?? null);
            setBillingStatus(userData.billingStatus || 'active');
          }
          // Check if account was cancelled
          const cAt = userSnap.data().cancelledAt;
          if (cAt) {
            const d = cAt.toDate ? cAt.toDate() : new Date(cAt);
            setCancelledAt(d.toLocaleDateString('en-US', { day: '2-digit', month: 'long', year: 'numeric' }));
          } else {
            setCancelledAt(null);
          }
          const isOnboarded = userSnap.data().onboardingComplete !== false;
          setOnboardingComplete(isOnboarded);
          // Check if user has vault principles (for "Based on data" badge)
          try {
            const vaultSnap = await getDocs(query(collection(db, 'principleVaults', currentUser.uid, 'principles'), where('active', '==', true), limit(1)));
            setHasVaultData(!vaultSnap.empty);
          } catch { setHasVaultData(false); }
          // Load onboarding milestones
          const loadedMilestones = userSnap.data().milestones ?? EMPTY_MILESTONES;
          setMilestones(loadedMilestones);
          setTourCompleted(userSnap.data().tourCompleted === true);
          const hasAnyMilestone = loadedMilestones.watchVideo || loadedMilestones.hooksGenerated || loadedMilestones.conceptsGenerated || loadedMilestones.designGenerated || loadedMilestones.copyGenerated;
          // Check if user is returning from Paddle billing/topup
          const pendingPhase = sessionStorage.getItem('proads_pending_phase');
          if (pendingPhase) {
            sessionStorage.removeItem('proads_pending_phase');
            setPhase(pendingPhase as AppPhase);
          } else if (isOnboarded && !hasAnyMilestone) {
            setShowWelcome(true);
          }
        } else {
          // ─── T048: No Firestore doc — check pending_plans ───
          let hasPendingPlan = false;

          if (currentUser.email) {
            const pendingRef = doc(db, "pending_plans", currentUser.email.toLowerCase());
            const pendingSnap = await getDoc(pendingRef);

            if (pendingSnap.exists()) {
              hasPendingPlan = true;
              const pending = pendingSnap.data();
              const pendingIsTrial = pending.isTrial === true;
              const initialPlan = (pending.plan || 'none') as UserPlan;
              const initialCredits = pending.credits || 50;
              const initialBillingType = pending.billingType || 'monthly';
              const initialNextReset = pending.nextCreditReset || null;
              await deleteDoc(pendingRef);

              const userDoc: Record<string, any> = {
                email: currentUser.email,
                credits: initialCredits,
                plan: initialPlan,
                isTrial: pendingIsTrial,
                billingStatus: 'active',
                onboardingComplete: false,
                createdAt: new Date(),
              };
              if (initialBillingType) userDoc.billingType = initialBillingType;
              if (initialNextReset) userDoc.nextCreditReset = initialNextReset;
              if (pending.paddleCustomerId) userDoc.paddleCustomerId = pending.paddleCustomerId;
              if (pending.paddleSubscriptionId) userDoc.paddleSubscriptionId = pending.paddleSubscriptionId;
              if (pending.paddleUpdatePaymentUrl) userDoc.paddleUpdatePaymentUrl = pending.paddleUpdatePaymentUrl;
              if (pending.paddleCancelUrl) userDoc.paddleCancelUrl = pending.paddleCancelUrl;
              if (pending.stripeCustomerId) userDoc.stripeCustomerId = pending.stripeCustomerId;

              await setDoc(userRef, userDoc);
              setUser(currentUser);
              setUserCredits(initialCredits);
              setUserPlan(initialPlan);
              setIsTrialUser(pendingIsTrial);
              if (pending.stripeCustomerId) setStripeCustomerId(pending.stripeCustomerId);
              setOnboardingComplete(false);
              // Welcome toast fires automatically via the createdAt-within-60s effect (FR-024b)
            }
          }

          if (!hasPendingPlan) {
            // Check if this user was invited to a team
            let isTeamMember = false;
            if (currentUser.email) {
              const membershipRef = doc(db, 'teamMemberships', currentUser.email.toLowerCase());
              const membershipSnap = await getDoc(membershipRef);
              if (membershipSnap.exists()) {
                isTeamMember = true;
                const membership = membershipSnap.data();
                await setDoc(userRef, {
                  email: currentUser.email,
                  credits: 0,
                  plan: 'none',
                  isTeamMember: true,
                  teamOwnerUid: membership.ownerUid,
                  teamRole: membership.role,
                  onboardingComplete: false,
                  createdAt: new Date(),
                }, { merge: true });

                setTeamOwnerUid(membership.ownerUid);
                setTeamRole(membership.role || 'viewer');
                const ownerRef = doc(db, 'users', membership.ownerUid);
                const ownerSnap = await getDoc(ownerRef);
                if (ownerSnap.exists()) {
                  const owData = ownerSnap.data();
                  setUser(currentUser);
                  setUserCredits(owData.credits ?? 0);
                  const effPlan = (owData.plan ?? 'none');
                  setUserPlan(effPlan as UserPlan);
                  setIsTrialUser(owData.isTrial === true);
                  setStripeCustomerId(owData.stripeCustomerId ?? null);
                  setBillingStatus(owData.billingStatus || 'active');
                  setOnboardingComplete(false);
                }
              }
            }

            if (!isTeamMember) {
              // ─── T049: Create minimal user doc (DO NOT delete auth account) ───
              await setDoc(userRef, {
                email: currentUser.email,
                credits: 0,
                plan: 'none',
                isTrial: false,
                onboardingComplete: false,
                createdAt: new Date(),
              });
              setUser(currentUser);
              setUserCredits(0);
              setUserPlan('none');
              setIsTrialUser(false);
              setStripeCustomerId(null);
              setBillingStatus('active');
              setOnboardingComplete(false);
              setShowMandatoryBilling(true);
            }
          }
        }
      } else {
        setUser(null);
        setUserCredits(0);
        setUserPlan('none');
        setOnboardingComplete(null);
        setShowMandatoryBilling(false);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  // ─── CHATBOT WIDGET (Tawk.to) ──────────────────────────────────────
  useEffect(() => {
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://embed.tawk.to/699c33f19768c11c3a1a72b3/1ji52lr2s';
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  // ─── REAL-TIME CREDIT/PLAN LISTENER ──────────────────────────────────
  // When GHL webhook updates Firestore (upgrade, top-up, or cancellation),
  // this listener instantly reflects the change in the app — no refresh needed.
  useEffect(() => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const unsubSnap = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.isTeamMember && data.teamOwnerUid) {
          // Team member: listen to owner doc for credits/plan/billing
          const ownerRef = doc(db, 'users', data.teamOwnerUid);
          getDoc(ownerRef).then(ownerSnap => {
            if (ownerSnap.exists()) {
              const ow = ownerSnap.data();
              setUserCredits(ow.credits ?? 0);
              setUserPlan((ow.plan ?? 'none') as UserPlan);
              setIsTrialUser(ow.isTrial === true);
              setBillingStatus(ow.billingStatus || 'active');
            } else {
              setBillingStatus('cancelled');
            }
          }).catch(() => { /* non-blocking */ });
          return;
        }
        setUserCredits(data.credits ?? 0);
        const effectivePlan = ((data.plan ?? 'none') as UserPlan);
        setUserPlan(effectivePlan);
        setIsTrialUser(data.isTrial === true);
        setStripeCustomerId(data.stripeCustomerId ?? null);
        setBillingStatus(data.billingStatus || 'active');
      }
    });
    return () => unsubSnap();
  }, [user]);

  // ─── AUDIENCE AVATARS ──────────────────────────────────────────────────
  // Fetch avatars from Firestore (uses effectiveUidRef so team members see owner's avatars)
  useEffect(() => {
    const uid = effectiveUidRef.current;
    if (!user || !uid) { setAvatars([]); return; }
    const fetchAvatars = async () => {
      try {
        const avatarsRef = collection(db, 'users', uid, 'avatars');
        const q = query(avatarsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        setAvatars(snap.docs.map(d => ({ id: d.id, ...d.data() } as AudienceAvatar)));
      } catch (e: any) {
        console.error('Failed to load avatars:', e);
        showToast(`Failed to load avatars: ${e?.code || e?.message || 'unknown'}`, 'error');
      }
    };
    fetchAvatars();
  }, [user, effectiveUidRef.current]);

  const handleSaveAvatar = async (avatar: Omit<AudienceAvatar, 'id' | 'createdAt'>) => {
    const uid = effectiveUidRef.current;
    if (!user || !uid) return;
    // Enforce plan limit (allow overwrites but block new saves)
    const maxAvatars = getAudienceAvatarLimit(userPlan);
    if (avatars.length >= maxAvatars) {
      showToast(`Avatar limit reached (${maxAvatars} on your plan). Upgrade to save more.`, 'error');
      return;
    }
    try {
      const avatarsRef = collection(db, 'users', uid, 'avatars');
      const docRef = await addDoc(avatarsRef, { ...avatar, createdAt: Date.now() });
      setAvatars(prev => [{ id: docRef.id, ...avatar, createdAt: Date.now() }, ...prev]);
    } catch (e) {
      console.error('Failed to save avatar:', e);
      showToast('Failed to save avatar', 'error');
    }
  };

  const handleDeleteAvatar = async (avatarId: string) => {
    const uid = effectiveUidRef.current;
    if (!user || !uid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'avatars', avatarId));
      setAvatars(prev => prev.filter(a => a.id !== avatarId));
    } catch (e) {
      console.error('Failed to delete avatar:', e);
      showToast('Failed to delete avatar', 'error');
    }
  };

  const handleUpdateAvatar = async (avatarId: string, avatar: Omit<import('./types').AudienceAvatar, 'id' | 'createdAt'>) => {
    const uid = effectiveUidRef.current;
    if (!user || !uid) return;
    try {
      await setDoc(doc(db, 'users', uid, 'avatars', avatarId), { ...avatar, createdAt: Date.now() });
      setAvatars(prev => prev.map(a => a.id === avatarId ? { ...a, ...avatar, createdAt: Date.now() } : a));
    } catch (e) {
      console.error('Failed to update avatar:', e);
      showToast('Failed to update avatar', 'error');
    }
  };

  // ─── COMPETITOR RESEARCH ──────────────────────────────────────────────
  const getCacheKey = (data: AdInputs) => `${data.productName}::${data.productCategory}::${data.targetAudience}`.toLowerCase().trim();

  const runCompetitorResearch = async (formData: AdInputs, force = false) => {
    // Only for Ultimate + Agency
    if (!canUse(userPlan, 'competitorResearch')) return;
    // Check cache — skip if same product+audience unless forced
    const cacheKey = getCacheKey(formData);
    if (!force && competitorData && competitorData.cachedFor === cacheKey) return;

    if (userCredits < CREDIT_COSTS.competitorResearch) return; // Silent skip if no credits
    if (!formData.productCategory) return; // Need category for research

    setCompetitorLoading(true);
    try {
      const researchFn = httpsCallable(functions, 'competitorResearch');
      const result = await researchFn({
        productName: formData.productName,
        productCategory: formData.productCategory || '',
        targetAudience: formData.targetAudience,
        challenges: formData.challenges,
        transformation: formData.transformation,
        adLanguage: formData.adLanguage || 'ar_fusha',
      });
      const data = result.data as any;
      setCompetitorData({
        competitors: data.competitors || [],
        angles: data.angles || [],
        attackHooks: data.attackHooks || [],
        cachedFor: cacheKey,
        timestamp: data.timestamp || Date.now(),
      });
      // Credits were deducted server-side, onSnapshot will update
    } catch (e: any) {
      console.error('Competitor research failed:', e);
      // Don't show error toast — this is a background feature
    } finally {
      setCompetitorLoading(false);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error("Email login failed", error);
      // Auto-switch: user-not-found → Create Account tab with email pre-filled
      if (error.code === 'auth/user-not-found') {
        setPendingEmail(email);
        setLoginTab('create');
        setAuthError(t('login.errorUserNotFound'));
      } else if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        setAuthError(t('login.errorWrongPassword'));
      } else if (error.code === 'auth/too-many-requests') {
        setAuthError(t('login.errorTooManyRequests'));
      } else if (error.code === 'auth/invalid-email') {
        setAuthError(t('login.errorInvalidEmail'));
      } else {
        setAuthError(t('login.errorGeneric'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAccount = async (email: string, password: string) => {
    setIsSubmitting(true);
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(cred.user);
    } catch (error: any) {
      console.error("Create account failed", error);
      // Auto-switch: email-already-in-use → Login tab with email pre-filled
      if (error.code === 'auth/email-already-in-use') {
        setPendingEmail(email);
        setLoginTab('login');
        setAuthError(t('login.errorEmailInUse'));
      } else if (error.code === 'auth/weak-password') {
        setAuthError(t('login.errorWeakPassword'));
      } else if (error.code === 'auth/invalid-email') {
        setAuthError(t('login.errorInvalidEmail'));
      } else {
        setAuthError(t('login.errorGeneric'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Forgot Password — Firebase built-in, non-revealing confirmation
  const handleForgotPassword = async (email: string) => {
    if (!email) {
      showToast(t('login.forgotPasswordDialog.emailPrompt'), 'error');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (_error: any) {
      // Non-revealing: show the same confirmation regardless of result
    }
    showToast(t('login.forgotPasswordDialog.confirmation'), 'success');
  };

  // 5. Handle Logout
  const handleLogout = async () => {
    await signOut(auth);
    setUserPlan('none');
    setIsTrialUser(false);
    setUserCredits(0);
    setOnboardingComplete(null);
    setShowWelcome(false);
    setShowSignOut(true);
  };

  // Onboarding quiz completion — save to Firestore + trigger welcome
  const handleOnboardingComplete = async (data: { challenge: string; businessType: string; niche: string }) => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, {
      onboardingComplete: true,
      onboardingChallenge: data.challenge,
      onboardingBusinessType: data.businessType,
      onboardingNiche: data.niche,
    }, { merge: true });
    setOnboardingComplete(true);
    setShowWelcome(true);
  };

  // Welcome screen → enter studio + show walkthrough for first time
  const handleWelcomeStart = () => {
    setShowWelcome(false);
    // Show video popup if they haven't earned that milestone yet
    if (!milestones.watchVideo) {
      setShowVideoPopup(true);
    } else if (projects.length === 0 && !tourCompleted) {
      setShowWalkthrough(true);
    }
  };

  const handleVideoComplete = () => {
    setShowVideoPopup(false);
    awardMilestone('watchVideo');
    // Then show walkthrough for new users
    if (projects.length === 0 && !tourCompleted) setShowWalkthrough(true);
  };

  const handleVideoSkip = () => {
    setShowVideoPopup(false);
    if (projects.length === 0 && !tourCompleted) setShowWalkthrough(true);
  };

  const handleTourComplete = () => {
    setShowWalkthrough(false);
    setTourCompleted(true);
    // Save to Firestore so it never shows again
    if (user) {
      const userRef = doc(db, 'users', user.uid);
      setDoc(userRef, { tourCompleted: true }, { merge: true }).catch(console.error);
    }
  };

  // SignOut screen → back to login
  const handleSignOutToLogin = () => {
    setShowSignOut(false);
  };

  // --- ALL STATE DECLARATIONS (must be before any conditional returns per Rules of Hooks) ---
  const [phase, setPhase] = useState<AppPhase>('input');
  const [highestUnlockedPhase, setHighestUnlockedPhase] = useState<number>(0);

  const [toast, setToast] = useState<Toast | null>(null);
  const showToast = (message: string, type: Toast['type'] = 'info') => setToast({ message, type });


  const [userCredits, setUserCredits] = useState<number>(0);
  const [userPlan, setUserPlan] = useState<UserPlan>('none');
  const [isTrialUser, setIsTrialUser] = useState(false);
  const [hasVaultData, setHasVaultData] = useState(false);
  const [billingStatus, setBillingStatus] = useState<'active' | 'past_due' | 'cancelled'>('active');
  const [teamOwnerUid, setTeamOwnerUid] = useState<string | null>(null);
  const [teamRole, setTeamRole] = useState<string | null>(null);
  const isTeamViewer = teamRole === 'viewer';
  // For team members, use the owner's UID for all avatar/project Firestore operations
  const effectiveUid = teamOwnerUid || user?.uid || null;
  effectiveUidRef.current = effectiveUid;
  const [stripeCustomerId, setStripeCustomerId] = useState<string | null>(null);
  const [avatars, setAvatars] = useState<AudienceAvatar[]>([]);
  const [competitorData, setCompetitorData] = useState<CompetitorResearch | null>(null);
  const [competitorLoading, setCompetitorLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeAnnual, setUpgradeAnnual] = useState(false);
  const [topupLoading, setTopupLoading] = useState<string | null>(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favoritesData, setFavoritesData] = useState<any[]>([]);
  const [favTab, setFavTab] = useState('all');
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [openFavoritesPhase, setOpenFavoritesPhase] = useState<FavoritesPhase | null>(null);
  const [loadedFavoriteId, setLoadedFavoriteId] = useState<string | null>(null);
  const [favUpdatePrompt, setFavUpdatePrompt] = useState<FavUpdatePrompt | null>(null);
  const [loadedRenderRecord, setLoadedRenderRecord] = useState<GenerationRecord | null>(null);
  const [upgradeReason, setUpgradeReason] = useState('');
  const [showAccountMenu, setShowAccountMenu] = useState(false);

  // ─── MANDATORY BILLING AUTO-DISMISS ──────────────────────────────────
  useEffect(() => {
    if (showMandatoryBilling && userPlan !== 'none') {
      setShowMandatoryBilling(false);
    }
  }, [userPlan, showMandatoryBilling]);

  // ─── WELCOME TOAST ───────────────────────────────────────────────────
  // FR-024b: fires once when users/{uid}.createdAt is within 60s AND welcomeToastShown !== true.
  // Covers both pending_plans consumption and mandatory-modal → paid transitions.
  const welcomeToastFiredRef = React.useRef(false);
  useEffect(() => {
    if (!user) return;
    if (welcomeToastFiredRef.current) return;
    if (userPlan === 'none') return;

    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!snap.exists() || cancelled) return;
        const data = snap.data();
        if (data.welcomeToastShown === true) return;

        // createdAt may be a Firestore Timestamp or a Date
        const createdAt = data.createdAt;
        let createdMs: number | null = null;
        if (createdAt?.toDate) createdMs = createdAt.toDate().getTime();
        else if (createdAt instanceof Date) createdMs = createdAt.getTime();
        else if (typeof createdAt === 'number') createdMs = createdAt;

        if (createdMs === null) return;
        if (Date.now() - createdMs > 60_000) return;

        welcomeToastFiredRef.current = true;
        // Clean up the legacy pending flag if present
        sessionStorage.removeItem('proads_welcome_pending');
        showToast(t('login.welcomeTrial'), 'success');
        await updateDoc(doc(db, 'users', user.uid), { welcomeToastShown: true });
      } catch {
        // Non-blocking — welcome toast failure should never break sign-in
      }
    })();

    return () => { cancelled = true; };
  }, [user, userPlan]);

  // ─── BILLING MODAL STATE ───────────────────────────────────────────
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showAllCompleted, setShowAllCompleted] = useState(false);
  const [showAllDrafts, setShowAllDrafts] = useState(false);
  const [showChangelogModal, setShowChangelogModal] = useState(false);
  const [settingsDisplayName, setSettingsDisplayName] = useState('');
  const [settingsNewEmail, setSettingsNewEmail] = useState('');

  const [settingsEditingName, setSettingsEditingName] = useState(false);
  const [settingsEditingEmail, setSettingsEditingEmail] = useState(false);
  const [teamInviteName, setTeamInviteName] = useState('');
  const [teamInviteEmail, setTeamInviteEmail] = useState('');
  const [teamInviteRole, setTeamInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [teamMembers, setTeamMembers] = useState<{ name: string; email: string; role: string; status: string; joinedAt?: number }[]>([]);
  const [teamInvites, setTeamInvites] = useState<any[]>([]);
  const [teamInviting, setTeamInviting] = useState(false);
  const [billingTab, setBillingTab] = useState<'manage' | 'upgrade' | 'payment'>('manage');
  const [billingData, setBillingData] = useState<any>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [showCancelFlow, setShowCancelFlow] = useState(false);
  const [cancelStep, setCancelStep] = useState(1);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelFeedback, setCancelFeedback] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [editingHook, setEditingHook] = useState<string | null>(null);
  const [editHookData, setEditHookData] = useState<{ hookText: string; subhead: string; cta: string; benefit: string }>({ hookText: '', subhead: '', cta: '', benefit: '' });
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // ─── PADDLE CHECKOUT URLS (PADDLE TODO: replace with Paddle checkout page URLs) ───
  const GHL_URLS: Record<string, string> = {
    starter_monthly: 'https://proadsai.com/checkout/starter',
    starter_annual: 'https://proadsai.com/checkout/starter',
    pro_monthly: 'https://proadsai.com/checkout/pro',
    pro_annual: 'https://proadsai.com/checkout/pro',
    scale_monthly: 'https://proadsai.com/checkout/scaling',
    scale_annual: 'https://proadsai.com/checkout/scaling',
  };

  // ─── WORKSPACE STATE & LOGIC (Multi-Brand — Scaling only) ───────────────
  const [workspaces, setWorkspacesLocal] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceIdLocal] = useState<string | null>(null);
  const [showWorkspaceModal, setShowWorkspaceModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const canUseWorkspaces = canUse(userPlan, 'multiBrandWorkspaces');

  useEffect(() => {
    const uid = effectiveUidRef.current;
    if (!user || !uid || !canUseWorkspaces) { setWorkspacesLocal([]); return; }
    const fetchWorkspaces = async () => {
      try {
        const wsRef = collection(db, 'users', uid, 'workspaces');
        const q = query(wsRef, orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        const wsList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Workspace))
          .filter(ws => ws.deletedAt == null);
        if (wsList.length === 0) {
          const defaultWs: Omit<Workspace, 'id'> = {
            name: 'Default Workspace', brandName: user?.displayName || 'My Brand',
            createdAt: Date.now(), isDefault: true,
          };
          const docRef = await addDoc(wsRef, defaultWs);
          const created = { id: docRef.id, ...defaultWs } as Workspace;
          setWorkspacesLocal([created]);
          setActiveWorkspaceIdLocal(created.id);
        } else {
          setWorkspacesLocal(wsList);
          if (!activeWorkspaceId) {
            const def = wsList.find(w => w.isDefault) || wsList[0];
            setActiveWorkspaceIdLocal(def.id);
          }
        }
      } catch (e: any) {
        console.error('Failed to load workspaces:', e);
        showToast('Failed to load workspaces — check console', 'error');
      }
    };
    fetchWorkspaces();
  }, [user, effectiveUidRef.current, canUseWorkspaces]);

  const handleCreateWorkspace = async (data: Omit<Workspace, 'id' | 'createdAt'>) => {
    const uid = effectiveUidRef.current;
    if (!uid) return;
    try {
      const wsRef = collection(db, 'users', uid, 'workspaces');
      const docRef = await addDoc(wsRef, { ...data, createdAt: Date.now() });
      const created = { id: docRef.id, ...data, createdAt: Date.now() } as Workspace;
      setWorkspacesLocal(prev => [created, ...prev]);
      setActiveWorkspaceIdLocal(created.id);
      setShowWorkspaceModal(false);
      setEditingWorkspace(null);
      showToast(`Workspace "${data.name}" created`, 'success');
    } catch (e: any) {
      showToast(`Failed to create workspace: ${e?.message}`, 'error');
    }
  };

  const handleUpdateWorkspace = async (data: Omit<Workspace, 'id' | 'createdAt'>) => {
    const uid = effectiveUidRef.current;
    if (!uid || !editingWorkspace) return;
    try {
      const wsDoc = doc(db, 'users', uid, 'workspaces', editingWorkspace.id);
      await setDoc(wsDoc, { ...data, createdAt: editingWorkspace.createdAt }, { merge: true });
      setWorkspacesLocal(prev => prev.map(w => w.id === editingWorkspace.id ? { ...w, ...data } : w));
      setShowWorkspaceModal(false);
      setEditingWorkspace(null);
      showToast(`Workspace "${data.name}" updated`, 'success');
    } catch (e: any) {
      showToast(`Failed to update workspace: ${e?.message}`, 'error');
    }
  };

  const handleDeleteWorkspace = async (workspaceId: string) => {
    const uid = effectiveUidRef.current;
    if (!uid) return;
    try {
      const { workspaceService } = await import('./services/workspaceService');
      await workspaceService.deleteWorkspace(workspaceId);
      setWorkspacesLocal(prev => prev.filter(w => w.id !== workspaceId));
      if (activeWorkspaceId === workspaceId) {
        const remaining = workspaces.filter(w => w.id !== workspaceId && w.deletedAt == null);
        const def = remaining.find(w => w.isDefault) || remaining[0];
        setActiveWorkspaceIdLocal(def?.id || null);
      }
      setShowWorkspaceModal(false);
      setEditingWorkspace(null);
      showToast('Workspace deleted', 'success');
    } catch (e: any) {
      showToast(`Failed to delete workspace: ${e?.message}`, 'error');
    }
  };

  // Filtered projects/avatars by active workspace
  const defaultWsId = workspaces.find(w => w.isDefault)?.id;
  const filteredProjects = canUseWorkspaces && activeWorkspaceId
    ? projects.filter(p => (p.workspaceId || defaultWsId) === activeWorkspaceId)
    : projects;
  const filteredAvatars = canUseWorkspaces && activeWorkspaceId
    ? avatars.filter(a => (a.workspaceId || defaultWsId) === activeWorkspaceId)
    : avatars;

  // ─── STRIPE BILLING PORTAL ─────────────────────────────────────────
  // ─── TEAM MANAGEMENT ──────────────────────────────────────────────
  const loadTeamMembers = async () => {
    if (!user) return;
    try {
      const teamRef = collection(db, 'users', user.uid, 'team');
      const snap = await getDocs(teamRef);
      const members = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
      setTeamMembers(members);
    } catch (e) { console.error('Failed to load team:', e); }
  };

  const loadTeamInvites = async () => {
    if (!user) return;
    try {
      const getInvites = httpsCallable(functions, 'getTeamInvites');
      const result = await getInvites({});
      const data = result.data as any;
      setTeamInvites(data.invites || []);
    } catch (e) { console.error('Failed to load invites:', e); }
  };

  const handleResendInvite = async (inviteId: string) => {
    try {
      const resend = httpsCallable(functions, 'resendTeamInvite');
      const result = await resend({ inviteId });
      const data = result.data as any;
      showToast(data.message || 'Resent!', data.success ? 'success' : 'error');
      loadTeamInvites();
    } catch { showToast('Failed to resend.', 'error'); }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      const revoke = httpsCallable(functions, 'revokeTeamInvite');
      const result = await revoke({ inviteId });
      const data = result.data as any;
      showToast(data.message || 'Revoked.', 'success');
      loadTeamInvites();
    } catch { showToast('Failed to revoke.', 'error'); }
  };

  // Auto-claim pending invites on login
  React.useEffect(() => {
    if (!user) return;
    const claimInvites = httpsCallable(functions, 'claimTeamInvite');
    claimInvites({}).then((res: any) => {
      if (res.data?.claimed > 0) {
        showToast(res.data.message || 'Joined a team!', 'success');
        window.location.reload();
      }
    }).catch(() => { /* non-blocking */ });
  }, [user?.uid]);

  const handleTeamInvite = async () => {
    if (!user || !teamInviteName.trim() || !teamInviteEmail.trim()) {
      showToast('Please enter name and email.', 'error'); return;
    }
    const maxMembers = PLANS[userPlan]?.features.maxTeamMembers || 0;
    const openInviteCount = teamInvites.filter((i: any) => ['pending', 'sent', 'failed'].includes(i.status)).length;
    if (maxMembers !== -1 && (teamMembers.length + openInviteCount) >= maxMembers) {
      showToast(`Your ${userPlan} plan allows ${maxMembers} seat${maxMembers > 1 ? 's' : ''} (including pending invites). Upgrade for more.`, 'error'); return;
    }
    setTeamInviting(true);
    try {
      const createInvite = httpsCallable(functions, 'createTeamInvite');
      const result = await createInvite({
        name: teamInviteName.trim(),
        email: teamInviteEmail.trim().toLowerCase(),
        role: teamInviteRole,
      });
      const data = result.data as any;
      showToast(data.message || `Invite sent to ${teamInviteEmail.trim()}!`, data.deliverySuccess === false ? 'error' : 'success');
      setTeamInviteName('');
      setTeamInviteEmail('');
      setTeamInviteRole('editor');
      loadTeamMembers(); loadTeamInvites();
    } catch (e: any) {
      const msg = e?.message || 'Failed to send invite.';
      showToast(msg.includes('already') ? 'This person is already on your team.' : msg.includes('plan') || msg.includes('seat') ? msg : 'Failed to send invite.', 'error');
    } finally { setTeamInviting(false); }
  };

  const handleRemoveTeamMember = async (memberId: string) => {
    if (!user) return;
    try {
      const removeMember = httpsCallable(functions, 'removeTeamMember');
      const result = await removeMember({ memberId });
      const data = result.data as any;
      showToast(data.message || 'Team member removed.', 'success');
      loadTeamMembers(); loadTeamInvites();
    } catch { showToast('Failed to remove member.', 'error'); }
  };

  const handleManageBilling = async () => {
    setBillingTab('manage');
    setShowBillingModal(true);
    // Fetch subscription data from Cloud Function
    setBillingLoading(true);
    try {
      const getSubscription = httpsCallable(functions, 'paddleGetSub');
      const result = await getSubscription();
      setBillingData(result.data);
    } catch (error: any) {
      console.warn('Could not fetch subscription data:', error.message);
      // Still show modal with Firestore data as fallback
      setBillingData(null);
    } finally {
      setBillingLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!cancelReason) { showToast('Please select a reason.', 'error'); return; }
    setCancelLoading(true);
    try {
      const cancelSub = httpsCallable(functions, 'paddleCancelSub');
      const result = await cancelSub({ reason: cancelReason, feedback: cancelFeedback });
      const data = result.data as any;
      showToast(`Subscription cancelled. Access continues until ${new Date(data.currentPeriodEnd * 1000).toLocaleDateString()}.`, 'info');
      setShowCancelFlow(false);
      setCancelStep(1);
      setCancelReason('');
      setCancelFeedback('');
      // Refresh billing data
      handleManageBilling();
    } catch (error: any) {
      showToast(`Cancel failed: ${error.message}`, 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const handleReactivate = async () => {
    setBillingLoading(true);
    try {
      const reactivate = httpsCallable(functions, 'paddleReactivateSub');
      await reactivate();
      showToast('Subscription reactivated!', 'success');
      handleManageBilling();
    } catch (error: any) {
      showToast(`Reactivate failed: ${error.message}`, 'error');
    } finally {
      setBillingLoading(false);
    }
  };

  const handleRetentionDiscount = async (couponId: string) => {
    setCancelLoading(true);
    try {
      const applyDiscount = httpsCallable(functions, 'applyRetentionDiscount');
      await applyDiscount({ couponId });
      showToast(couponId.includes('50') ? '🎉 50% discount applied for 3 months!' : '🎉 25% discount applied forever!', 'success');
      setShowCancelFlow(false);
      setCancelStep(1);
      handleManageBilling();
    } catch (error: any) {
      if (error.message?.includes('already')) {
        showToast('You\'ve already used a retention discount.', 'error');
        setCancelStep(3); // Skip to final step
      } else {
        showToast(`Could not apply discount: ${error.message}`, 'error');
      }
    } finally {
      setCancelLoading(false);
    }
  };

  // ─── INLINE HOOK EDIT (no AI, no credits) ─────────────────────────
  const handleInlineHookSave = (variant: string) => {
    const d = editHookData;
    const isCarousel = inputs?.adMode === 'carousel' && (inputs?.slideCount || 1) > 1;
    const startTag = isCarousel ? `ANGLE_START_${variant}` : `HOOK_START_${variant}`;
    const endTag = isCarousel ? `ANGLE_END_${variant}` : `HOOK_END_${variant}`;
    const newBlock = isCarousel
      ? `${startTag}\nHOOK_TEXT: ${d.hookText}\nSUBHEADLINE: ${d.subhead}\nSTORY_ARC: ${(editHookData as any).storyArc || ''}\nCTA_BUTTON: ${d.benefit ? `${d.cta} ||| ${d.benefit}` : d.cta}\n${endTag}`
      : `${startTag}\nHOOK_TEXT: ${d.hookText}\nSUBHEADLINE: ${d.subhead}\nCTA_BUTTON: ${d.benefit ? `${d.cta} ||| ${d.benefit}` : d.cta}\n${endTag}`;
    const regex = new RegExp(`${startTag}[\\s\\S]*?${endTag}`, 'i');
    const updated = tovText.replace(regex, newBlock);
    setTovText(updated);
    setEditingHook(null);
  };

  // ─── CREDIT DEDUCTION HELPER ─────────────────────────────────────────
  // count param supports per-unit billing (e.g., carousel copies: 1 credit × slideCount)
  const deductCredits = (action: keyof typeof CREDIT_COSTS, count = 1): boolean => {
    // Team viewers cannot perform credit-consuming actions
    if (isTeamViewer) {
      showToast('Viewers cannot perform this action. Ask your team owner to upgrade your role.', 'error');
      return false;
    }
    const cost = CREDIT_COSTS[action] * count;
    if (userCredits < cost) {
      setUpgradeReason(`You need ${cost} credits for this action but only have ${userCredits}.`);
      setShowUpgradeModal(true);
      return false;
    }
    // Optimistic local deduction (server is source of truth)
    setUserCredits(prev => prev - cost);
    // Server-side atomic deduction (tamper-proof)
    // For team members, deduct from the owner's account
    const deductFn = httpsCallable(functions, 'deductCreditsServer');
    deductFn({ action, onBehalfOf: teamOwnerUid || undefined, count }).then((res: any) => {
      // Sync with server's authoritative balance
      if (res.data?.creditsRemaining !== undefined) {
        setUserCredits(res.data.creditsRemaining);
      }
    }).catch((err: any) => {
      // Server rejected — restore local balance
      console.error('Server deduction failed:', err);
      setUserCredits(prev => prev + cost);
      if (err.code === 'functions/failed-precondition') {
        const details = err.details?.details || err.details || {};
        if (details.code === 'plan_downgraded') {
          setUpgradeReason(t('billing.error.planDowngraded').replace('{plan}', details.requiredPlan || 'higher'));
          setShowUpgradeModal(true);
        } else if (details.code === 'trial_expired') {
          setUpgradeReason(t('billing.error.trialExpired'));
          setShowUpgradeModal(true);
        } else {
          setUpgradeReason(err.message);
          setShowUpgradeModal(true);
        }
      } else if (err.code === 'functions/resource-exhausted') {
        setUpgradeReason(err.message);
        setShowUpgradeModal(true);
      }
    });
    return true;
  };

  // ─── REFUND CREDITS ON API FAILURE ─────────────────────────────────────
  const refundCredits = (action: keyof typeof CREDIT_COSTS, count = 1) => {
    const cost = CREDIT_COSTS[action] * count;
    // Optimistic local refund
    setUserCredits(prev => prev + cost);
    // Server-side atomic refund
    const refundFn = httpsCallable(functions, 'refundCreditsServer');
    refundFn({ action, onBehalfOf: teamOwnerUid || undefined, count }).then((res: any) => {
      if (res.data?.creditsRemaining !== undefined) {
        setUserCredits(res.data.creditsRemaining);
      }
    }).catch((err: any) => {
      console.error('Server refund failed:', err);
    });
  };

  // ─── MILESTONE CREDIT AWARDS ──────────────────────────────────────────
  const awardMilestone = (key: keyof Milestones) => {
    if (!user) return;
    if (milestones[key]) return; // Already earned
    if (key === 'allComplete') return; // Jackpot handled by server

    // Optimistic local update
    const updated = { ...milestones, [key]: true };
    setMilestones(updated);

    // Server-side atomic award (only server can increase credits)
    const awardFn = httpsCallable(functions, 'awardMilestoneServer');
    awardFn({ milestone: key }).then((res: any) => {
      if (res.data?.alreadyEarned) return; // Duplicate, no action
      if (res.data?.creditsRemaining !== undefined) {
        setUserCredits(res.data.creditsRemaining);
      }
      // Update milestones from server (may include allComplete jackpot)
      const totalReward = res.data?.reward || 0;
      if (totalReward > 0) {
        const regularDone = updated.watchVideo && updated.hooksGenerated && updated.conceptsGenerated && updated.designGenerated && updated.copyGenerated;
        if (regularDone && !milestones.allComplete) {
          setMilestones(prev => ({ ...prev, allComplete: true }));
          showToast(`🎉 All steps complete! +${totalReward} bonus credits!`, 'success');
        } else {
          showToast(`✨ Milestone unlocked! +${totalReward} credits earned`, 'success');
        }
      }
    }).catch((err: any) => {
      console.error('Milestone award failed:', err);
      // Revert optimistic update
      setMilestones(milestones);
    });
  };

  // --- APP STATE (all hooks must be before conditional returns) ---
  const [inputs, setInputs] = useState<AdInputs | null>(null);
  const [resolvedUniverse, setResolvedUniverse] = useState<string>('');
  const [currentAspectRatio, setCurrentAspectRatio] = useState<AspectRatio>('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [itemLoading, setItemLoading] = useState<Record<string, boolean>>({});
  const [tovText, setTovText] = useState('');
  const [conceptsText, setConceptsText] = useState('');
  const [buildPlan, setBuildPlan] = useState('');
  const [mockupHistory, setMockupHistory] = useState<{ url: string; ratio: AspectRatio; rawBase64?: string }[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [captionText, setCaptionText] = useState('');
  const [batchCaptions, setBatchCaptions] = useState<{ hookKey: string; hookText: string; captionText: string }[]>([]);
  const [activeBatchCaptionKey, setActiveBatchCaptionKey] = useState<string>('');
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchRendering, setBatchRendering] = useState(false);
  const [batchHookGroups, setBatchHookGroups] = useState<BatchHookGroup[]>([]);
  const [batchSelectedHooks, setBatchSelectedHooks] = useState<Set<string>>(new Set());
  const [showBatchConfig, setShowBatchConfig] = useState(false);
  const [batchConceptsLoading, setBatchConceptsLoading] = useState(false);
  const [abVariations, setAbVariations] = useState<ABVariation[]>([]);
  const [abRendering, setAbRendering] = useState(false);

  const handleGenerateAB = async () => {
    if (!selectedConcept || !selectedTov || !inputs) return;
    if (!canUse(userPlan, 'abVariationTesting')) { setUpgradeReason(`A/B Variation Testing requires ${requiredPlanFor('abVariationTesting')} plan`); setShowUpgradeModal(true); return; }
    const perCost = CREDIT_COSTS.buildPlan + CREDIT_COSTS.generateImage;
    if (userCredits < perCost * 3) { setUpgradeReason(`3 A/B tests need ${perCost * 3} credits.`); setShowUpgradeModal(true); return; }
    const initial: ABVariation[] = [
      { url: null, status: 'pending', tweak: '', historyIdx: -1 },
      { url: null, status: 'pending', tweak: 'Vary composition. Different hero pose and background.', historyIdx: -1 },
      { url: null, status: 'pending', tweak: 'Different angle, lighting, and text layout. Alternate color mood.', historyIdx: -1 },
    ];
    setAbVariations(initial);
    setAbRendering(true);
    const cleanInputs = { ...inputs, personalPhotos: [], brandLogos: inputs.brandLogos?.slice(0, 5) || [] };
    for (let i = 0; i < 3; i++) {
      setAbVariations(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'rendering' } : v));
      if (!deductCredits('generateImage')) break;
      try {
        const img = (await gemini.generateFinalAd(selectedConcept, selectedTov, inputs, resolvedUniverse, currentAspectRatio, initial[i].tweak || undefined)).image;
        setAbVariations(prev => prev.map((v, idx) => idx === i ? { ...v, url: img, status: img ? 'done' : 'error' } : v));
      } catch {
        refundCredits('generateImage');
        setAbVariations(prev => prev.map((v, idx) => idx === i ? { ...v, status: 'error' } : v));
      }
      if (i < 2) await new Promise(r => setTimeout(r, 500));
    }
    setAbRendering(false);
    showToast('3 A/B tests complete!', 'success');
  };

  const handleRetryAB = async (index: number) => {
    if (!selectedConcept || !selectedTov || !inputs) return;
    const cost = CREDIT_COSTS.generateImage;
    if (userCredits < cost) { setUpgradeReason(`Retry needs ${cost} credits.`); setShowUpgradeModal(true); return; }
    setAbVariations(prev => prev.map((v, idx) => idx === index ? { ...v, status: 'rendering', url: null } : v));
    if (!deductCredits('generateImage')) return;
    try {
      const img = (await gemini.generateFinalAd(selectedConcept, selectedTov, inputs, resolvedUniverse, currentAspectRatio, abVariations[index]?.tweak || undefined)).image;
      setAbVariations(prev => prev.map((v, idx) => idx === index ? { ...v, url: img, status: img ? 'done' : 'error' } : v));
    } catch {
      refundCredits('generateImage');
      setAbVariations(prev => prev.map((v, idx) => idx === index ? { ...v, status: 'error' } : v));
    }
  };

  const handleSelectAB = (index: number) => {
    const v = abVariations[index];
    if (v?.status !== 'done' || !v.url) return;
    pushMockup(v.url, currentAspectRatio);
    // pushMockup sets historyIndex internally, scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const [carouselSlides, setCarouselSlides] = useState<CarouselSlide[]>([]);
  const [carouselCopies, setCarouselCopies] = useState<CarouselSlideCopy[]>([]);
  const [showCarouselPreview, setShowCarouselPreview] = useState(false);
  const [carouselConceptRaw, setCarouselConceptRaw] = useState('');
  const [captionRefinement, setCaptionRefinement] = useState('');
  const [selectedTov, setSelectedTov] = useState('');
  const [selectedConcept, setSelectedConcept] = useState('');
  const [activeEditHookIndex, setActiveEditHookIndex] = useState<string | null>(null);
  const [activeEditConceptIndex, setActiveEditConceptIndex] = useState<string | null>(null);
  const [expandedConcepts, setExpandedConcepts] = useState<Set<number>>(new Set([11, 12, 13, 21, 22, 23, 31, 32, 33, 41, 42, 43]));
  const [editFeedback, setEditFeedback] = useState('');
  const [globalRefinement, setGlobalRefinement] = useState('');
  const [studioTweak, setStudioTweak] = useState('');
  const [reflowMethod, setReflowMethod] = useState<'auto' | 'outpaint' | 'rerender'>('auto');
  const [showMethodSelector, setShowMethodSelector] = useState(false);
  const [visualPolishes, setVisualPolishes] = useState<VisualPolish[]>([]);
  const [selectedPolishIds, setSelectedPolishIds] = useState<Set<string>>(new Set());
  // ─── EDIT TARGET — tracks which exact design is being edited ─────
  // When null, polish edits go to generic mockupHistory (default behavior)
  // When set, polish edits write back to the specific source
  const [editTarget, setEditTarget] = useState<{
    source: 'batch' | 'carousel' | 'ab' | 'history' | 'single';
    index: number;        // index into the source array
    imageUrl: string;
    label: string;        // display label like "Batch H-A C1" or "Slide 3"
  } | null>(null);
  // ─── MAGIC SELECTOR STATE ──────────────────────────────────
  const [magicEditActive, setMagicEditActive] = useState(false);
  const [magicProcessing, setMagicProcessing] = useState(false);
  const [magicUndoStack, setMagicUndoStack] = useState<string[]>([]);
  const [magicEditCount, setMagicEditCount] = useState(0);
  const [magicOriginalImage, setMagicOriginalImage] = useState<string | null>(null);
  const [magicEditHistory, setMagicEditHistory] = useState<Array<{ region: any; mode: string; payload: any }>>([]);

  const handleMagicEdit = async (req: EditRequest) => {
    if (!currentMockup || !req.mode || !req.region) return;
    if (!canUse(userPlan, 'regionEditing')) { setUpgradeReason(`Region editing requires ${requiredPlanFor('regionEditing')} plan`); setShowUpgradeModal(true); return; }
    setMagicProcessing(true);
    const editBase64 = currentRawBase64 || currentMockup;
    try {
      // Save current image to undo stack (max 5)
      setMagicUndoStack(prev => [...prev.slice(-4), currentMockup!]);
      // Store original image before first edit
      const isFirstEdit = magicEditCount === 0;
      const originalImg = isFirstEdit ? editBase64 : magicOriginalImage;
      if (isFirstEdit) setMagicOriginalImage(editBase64);

      // For 2nd+ edit: send ORIGINAL image with ALL accumulated instructions to prevent quality loss
      const allEdits = [...magicEditHistory, { region: req.region, mode: req.mode!, payload: req.payload }];

      let result;

      if (!isFirstEdit && originalImg && allEdits.length > 1) {
        // Build combined instruction from all edits
        const combinedInstruction = allEdits.map((edit, i) => {
          const { region, mode, payload } = edit;
          const x = region.xPct?.toFixed(0) || '0';
          const y = region.yPct?.toFixed(0) || '0';
          const x2 = ((region.xPct || 0) + (region.wPct || 0)).toFixed(0);
          const y2 = ((region.yPct || 0) + (region.hPct || 0)).toFixed(0);
          const regionDesc = `region (${x}%, ${y}%) to (${x2}%, ${y2}%)`;
          if (mode === 'text' && payload?.action === 'replace') return `Edit ${i + 1}: In ${regionDesc}, replace the text with "${payload.newText}"`;
          if (mode === 'text' && payload?.action === 'remove') return `Edit ${i + 1}: In ${regionDesc}, remove the text and fill with background`;
          if (mode === 'erase') return `Edit ${i + 1}: In ${regionDesc}, remove the element and fill with surrounding background`;
          if (mode === 'style') return `Edit ${i + 1}: In ${regionDesc}, apply style: ${payload?.styleAction || 'change'}${payload?.colorHex ? ` with color ${payload.colorHex}` : ''}`;
          if (mode === 'describe') return `Edit ${i + 1}: In ${regionDesc}, ${payload?.freeInstruction || 'modify as described'}`;
          return `Edit ${i + 1}: In ${regionDesc}, ${mode}`;
        }).join('\n');

        // Send original image with ALL edits as one describe instruction
        result = await gemini.editRegion(
          originalImg,
          { xPct: 0, yPct: 0, wPct: 100, hPct: 100 }, // full image
          'describe',
          { freeInstruction: `Apply ALL of these edits to this image:\n${combinedInstruction}\n\nApply every edit listed above. Keep everything else pixel-identical.` },
          currentAspectRatio
        );
      } else {
        // First edit: normal single-edit path
        result = await gemini.editRegion(
          editBase64, req.region, req.mode, req.payload, currentAspectRatio
        );
      }

      if (result.image) {
        pushMockup(result.image, currentAspectRatio);
        setMagicEditCount(prev => prev + 1);
        setMagicEditHistory(allEdits);
        showToast('Magic edit applied!', 'success');

        // Only auto-reflow if user explicitly selected multiple sizes
        if (selectedSizes.size > 1 && inputs && selectedTov && buildPlan) {
          const otherRatios = [...new Set(mockupHistory.map(m => m.ratio))].filter(r => r !== currentAspectRatio);
          for (const extraRatio of otherRatios) {
            try {
              showToast(`Reflowing to ${extraRatio}...`, 'info');
              await new Promise(r => setTimeout(r, 500));
              if (renderGenerationId) {
                const reflowFn = httpsCallable<ReflowImageRequest, ReflowImageResponse>(functions, 'reflowImage');
                const reflowRes = await reflowFn({
                  generationId: renderGenerationId,
                  targetAspectRatio: extraRatio as AspectRatio,
                  method: 'auto',
                  scope: 'single',
                });
                if (reflowRes.data.success && reflowRes.data.outcomes[0]?.outputUrl) {
                  pushMockup(reflowRes.data.outcomes[0].outputUrl, extraRatio as AspectRatio);
                }
              } else {
                const reflowResult = await gemini.generateFinalAd(
                  buildPlan, selectedTov, inputs, resolvedUniverse, extraRatio,
                  Object.assign("REFLOW ONLY — adapt this exact design to " + extraRatio + " ratio. Keep ALL text identical word-for-word. Keep the SAME hero, visual elements, colors, and composition. Fill the entire canvas proportionally — no large empty areas. The hero, headline, subheadline, CTA, benefit line, and all elements must be VISIBLE and properly sized for the new ratio. Scale and reposition elements to use the full canvas. Apply the same visual changes from the source image.", { _internalReflow: true }),
                  result.image
                );
                if (reflowResult.image) {
                  pushMockup(reflowResult.image, extraRatio as AspectRatio);
                }
              }
            } catch (e) {
              console.warn(`Auto-reflow to ${extraRatio} failed:`, e);
            }
          }
          if (otherRatios.length > 0) showToast(`Edit applied to ${otherRatios.length + 1} sizes!`, 'success');
        }
      } else {
        showToast('Edit failed — no image returned. Try a different selection.', 'error');
      }
    } catch (e: any) {
      console.error('Magic edit failed:', e);
      showToast('Magic edit failed. Try again.', 'error');
    } finally {
      setMagicProcessing(false);
    }
  };

  const handleMagicUndo = () => {
    if (magicUndoStack.length === 0) return;
    const prev = magicUndoStack[magicUndoStack.length - 1];
    setMagicUndoStack(s => s.slice(0, -1));
    setMagicEditHistory(h => h.slice(0, -1));
    setMagicEditCount(c => Math.max(0, c - 1));
    pushMockup(prev, currentAspectRatio);
    showToast('Undo applied', 'info');
  };
  // ─── FEEDBACK TRACKING ─────────────────────────────────────
  const [hookGenerationIds, setHookGenerationIds] = useState<Record<string, string>>({});
  const [renderGenerationId, setRenderGenerationId] = useState<string>('');
  const [captionGenerationId, setCaptionGenerationId] = useState<string>('');
  // ─── FAVORITES COUNT PER PHASE ──────────────────────────────
  const favWsId = canUseWorkspaces ? activeWorkspaceId : null;
  const { favorites: hooksFavs } = useFavorites({ phase: 'hooks', workspaceId: favWsId });
  const { favorites: conceptsFavs } = useFavorites({ phase: 'concepts', workspaceId: favWsId });
  const { favorites: renderFavs } = useFavorites({ phase: 'render', workspaceId: favWsId });
  const { favorites: captionFavs } = useFavorites({ phase: 'caption', workspaceId: favWsId });

  // Derive favoriteIds from the live per-phase subscriptions instead of a
  // separate bulk bootstrap query. Covers pagination ("Show older" items flow
  // through the hook's merged view) and removes the prior LIMIT 200 cap that
  // could drop older bookmarks. See data-model.md § "Favorite IDs set".
  const favoriteIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of hooksFavs) if (r.id) set.add(r.id);
    for (const r of conceptsFavs) if (r.id) set.add(r.id);
    for (const r of renderFavs) if (r.id) set.add(r.id);
    for (const r of captionFavs) if (r.id) set.add(r.id);
    return set;
  }, [hooksFavs, conceptsFavs, renderFavs, captionFavs]);

  // ─── META ADS CONNECTION ─────────────────────────────────────
  const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null);
  const [metaSyncing, setMetaSyncing] = useState(false);
  const [metaPushing, setMetaPushing] = useState(false);
  // ─── MULTI-SIZE SELECTION (Step 3 → Step 4) ─────────────────────
  const [selectedSizes, setSelectedSizes] = useState<Set<AspectRatio>>(new Set(['1:1'] as AspectRatio[]));
  const [singleSelectedConcepts, setSingleSelectedConcepts] = useState<Set<number>>(new Set());

  // --- RENDER GATES (after all hooks) ---

  // ─── META: Load connection status on login ─────────────────────
  useEffect(() => {
    if (!user) return;
    metaService.getConnection().then(conn => setMetaConnection(conn)).catch(() => { });
  }, [user]);

  // Close account dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    if (showAccountMenu) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showAccountMenu]);

  // --- HISTORY ENGINE (IndexedDB + Firestore sync) ---
  useEffect(() => {
    if (!user || !effectiveUid) return; // Don't load projects if not logged in
    const initLoad = async () => {
      try {
        // Load from both sources and merge (cloud is source of truth)
        // Use effectiveUid so team members see the owner's projects
        const [localProjects, cloudProjects] = await Promise.all([
          getAllProjectsFromDB(effectiveUid),
          getAllProjectsFromFirestore(effectiveUid),
        ]);
        const savedProjects = mergeProjects(cloudProjects, localProjects);
        // Sync any cloud-only projects to local IndexedDB for offline access
        for (const cp of cloudProjects) {
          if (!localProjects.find(lp => lp.id === cp.id)) {
            saveProjectToDB(cp).catch(() => {});
          }
        }
        setProjects(savedProjects);

        if (savedProjects.length > 0) {
          const mostRecent = savedProjects[0];
          setCurrentProjectId(mostRecent.id);
          setCurrentProjectName(mostRecent.name || "Untitled Project");
          // Startup auto-restore runs BEFORE the billing/userPlan effect completes, so we
          // apply only the plan-AGNOSTIC shape migration here (universe remap, style
          // normalization). Plan-aware retargeting normalization is reserved for loadProject
          // (user-initiated action) where userPlan is known; applying it here would wrongly
          // strip retargeting data for users whose plan is still loading.
          setInputs(sanitizeProjectModes(migrateProjectInputsShape(mostRecent.inputs)));
          setPhase(mostRecent.phase);
          setTovText(mostRecent.tovText);
          setConceptsText(normalizeFieldLabels(mostRecent.conceptsText));
          setSelectedTov(mostRecent.selectedTov);
          setSelectedConcept(mostRecent.selectedConcept);
          setBuildPlan(mostRecent.buildPlan);
          setMockupHistory(mostRecent.mockupHistory);
          setHistoryIndex(mostRecent.historyIndex);
          setResolvedUniverse(mostRecent.resolvedUniverse);
          setCaptionText(mostRecent.captionText);
          setBatchCaptions(mostRecent.batchCaptions || []);
          setBatchResults(mostRecent.batchResults || []);
          setBatchHookGroups(mostRecent.batchHookGroups ? mostRecent.batchHookGroups.map(g => ({ ...g, selectedConcepts: new Set(g.selectedConcepts as any) })) : []);
          setCarouselSlides(mostRecent.carouselSlides || []);
          setBatchRendering(false);
          setBatchSelectedHooks(new Set());
          setShowBatchConfig(false);
          setBatchConceptsLoading(false);

          // Compute highestUnlockedPhase from data
          const phaseOrder: AppPhase[] = ['input', 'tov_review', 'concept_review', 'render_studio', 'primary_text'];
          let highestPhaseWithData: AppPhase = 'input';
          if (mostRecent.captionText) highestPhaseWithData = 'primary_text';
          else if (mostRecent.mockupHistory && mostRecent.mockupHistory.length > 0) highestPhaseWithData = 'render_studio';
          else if (mostRecent.conceptsText) highestPhaseWithData = 'concept_review';
          else if (mostRecent.tovText) highestPhaseWithData = 'tov_review';
          const highestIdx = phaseOrder.indexOf(highestPhaseWithData);
          setHighestUnlockedPhase(highestIdx >= 0 ? highestIdx : 0);
        }
      } catch (e: any) {
        console.error("Failed to load history from DB", e);
        showToast(`Failed to load projects: ${e?.code || e?.message || 'unknown'}`, 'error');
      }
    };
    initLoad();
  }, [user, effectiveUid]);

  // ─── Auto-save (Phase 13) ─────────────────────────────────────────────────
  // The save callback is registered once with the projectAutoSave module via the
  // hook. The hook keeps it fresh via a ref, so the closure below sees the latest
  // setProjects / showToast on every fire. Local IndexedDB write happens BEFORE
  // the cloud round-trip (FR-017) so a cloud failure never loses work locally.
  // QUOTA_EXCEEDED is surfaced as a toast and treated as a successful no-op for
  // the auto-save state machine — the 3-strike banner is for transport failures
  // (offline, auth expired), not for product-level rejections that the user has
  // already been told about.
  const saveCurrentProject = useCallback(async (project: SavedProject) => {
    const uid = effectiveUidRef.current;
    if (!uid) return;

    await saveProjectToDB(project);

    try {
      const saveProjectFn = httpsCallable(functions, 'saveProject');
      await saveProjectFn({ project });
    } catch (firestoreErr: any) {
      console.error("Firestore cloud sync failed:", firestoreErr);
      if (firestoreErr?.code === 'failed-precondition' && firestoreErr?.message?.includes('QUOTA_EXCEEDED')) {
        const details = firestoreErr?.details || {};
        // Roll back the local IndexedDB write so mergeProjects on next sign-in
        // doesn't reintroduce a project the server has already rejected.
        // QUOTA_EXCEEDED only fires for NEW projects, so the local record we
        // just wrote was a brand-new doc, never an update.
        deleteProjectFromDB(project.id).catch(() => {});
        setProjects((prev: SavedProject[]) => prev.filter((p: SavedProject) => p.id !== project.id));
        showToast(`Project limit reached (${details.limit || 'plan cap'} on your plan). Upgrade to save more.`, 'error');
        return;
      }
      throw firestoreErr;
    }

    setProjects((prev: SavedProject[]) => {
      const filtered = prev.filter((p: SavedProject) => p.id !== project.id);
      return [project, ...filtered];
    });

    const cover = resolveCoverImage(project);
    if (cover && project.thumbnailUrl !== cover.url) {
      uploadAndPersistThumbnail(uid, project.id, cover.url)
        .then((storageUrl) => {
          setProjects((prev: SavedProject[]) =>
            prev.map((p: SavedProject) =>
              p.id === project.id ? { ...p, thumbnailUrl: storageUrl } : p,
            ),
          );
          const updated = { ...project, thumbnailUrl: storageUrl };
          saveProjectToDB(updated).catch(() => {});
          const callable = httpsCallable(functions, 'saveProject');
          callable({ project: updated }).catch(() => {});
        })
        .catch((err) => {
          console.warn("phase13 ▸ thumbnail upload failed (non-blocking):", err);
        });
    }
  }, []);

  const { saveStatus: autoSaveState, queue: autoSaveQueue, retryNow: autoSaveRetry } =
    useProjectAutoSave(saveCurrentProject);

  // Build the current SavedProject snapshot from in-memory state and queue it.
  // The hook's queue() debounces (3 s) and ceiling-flushes (30 s) per
  // projectAutoSave.ts (R5), so we don't need a setTimeout here.
  useEffect(() => {
    if (!user || !effectiveUidRef.current) return;
    if (projects.some((p: SavedProject) => p.isRenaming)) return;
    const uid = effectiveUidRef.current;
    if (!uid) return;

    // Client-side cap precheck — instant feedback before any round-trip.
    // The server enforces the same cap inside a transaction (authoritative).
    const isNewProject = !projects.some((p: SavedProject) => p.id === currentProjectId);
    if (isNewProject) {
      const maxProjects = getSavedProjectLimit(userPlan);
      if (Number.isFinite(maxProjects) && projects.length >= maxProjects) {
        showToast(`Project limit reached (${maxProjects} on your plan). Upgrade to save more.`, 'error');
        return;
      }
    }

    const projectName = inputs?.productName
      ? `${inputs.productName}${resolvedUniverse ? `_${resolvedUniverse}` : ''}`
      : currentProjectName || "Untitled Project";

    const existingProject = currentProjectId ? projects.find((p: SavedProject) => p.id === currentProjectId) : undefined;
    const derivedStatus = deriveStatus(existingProject?.status, {
      metaAdId: existingProject?.metaAdId,
      mockupHistory,
      carouselSlides,
      batchResults,
    });

    // Workspace assignment: prefer the active workspace if the user can use
    // them; otherwise preserve whatever the existing project was already
    // attached to so editing an existing project never silently re-homes it.
    const resolvedWorkspaceId = (canUseWorkspaces && activeWorkspaceId)
      || existingProject?.workspaceId
      || undefined;

    const currentProject: SavedProject = {
      id: currentProjectId,
      userId: uid,
      name: projectName,
      timestamp: Date.now(),
      inputs,
      phase,
      tovText,
      conceptsText,
      selectedTov,
      selectedConcept,
      buildPlan,
      mockupHistory,
      historyIndex,
      resolvedUniverse,
      captionText,
      batchCaptions: batchCaptions.length > 0 ? batchCaptions : undefined,
      batchResults: batchResults.length > 0 ? batchResults : undefined,
      batchHookGroups: batchHookGroups.length > 0 ? batchHookGroups.map(g => ({ ...g, selectedConcepts: Array.from(g.selectedConcepts) })) : undefined,
      creatorName: user?.displayName || user?.email?.split('@')[0] || 'Unknown',
      creatorEmail: user?.email || '',
      carouselSlides: carouselSlides.length > 0 ? carouselSlides : undefined,
      status: derivedStatus,
      thumbnailUrl: existingProject?.thumbnailUrl,
      metaAdId: existingProject?.metaAdId,
      ...(resolvedWorkspaceId ? { workspaceId: resolvedWorkspaceId } : {}),
    };

    autoSaveQueue(currentProject);
  }, [user, inputs, phase, tovText, conceptsText, selectedTov, selectedConcept, buildPlan, mockupHistory, historyIndex, resolvedUniverse, captionText, batchResults, batchCaptions, batchHookGroups, carouselSlides, currentProjectId, activeWorkspaceId, canUseWorkspaces, autoSaveQueue]);

  // Ranking linkage — stores the latest ranking metadata from generation responses
  // ⚠️ MUST be above all early returns to satisfy React hooks ordering rules
  const lastRankingLinkage = React.useRef<{ rankingRequestId?: string; rankingRequestFingerprint?: string; rankingAppliedSummary?: string } | null>(null);

  if (loadingAuth) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-500">{t('loading')}</div>;

  // Sign-out screen (user just logged out)
  if (showSignOut && !user) return <SignOutScreen onSignIn={handleSignOutToLogin} />;

  if (!user) return (<>
    <LoginScreen
      onEmailLogin={handleEmailLogin}
      onCreateAccount={handleCreateAccount}
      onForgotPassword={() => setShowForgotPassword(true)}
      isSubmitting={isSubmitting}
      authError={authError}
      initialEmail={pendingEmail}
      initialTab={loginTab}
      onTabChange={(tab) => { setLoginTab(tab); setAuthError(null); }}
      onClearAuthError={() => setAuthError(null)}
    />
    {showForgotPassword && <ForgotPasswordDialog onSubmit={handleForgotPassword} onClose={() => setShowForgotPassword(false)} />}
  </>);

  if (!user.emailVerified) return (
    <VerifyEmailScreen
      email={user.email ?? ''}
      onResend={async () => { await sendEmailVerification(user); }}
      onCheckVerified={async () => { await user.reload(); if (auth.currentUser) setUser({ ...auth.currentUser }); }}
      onSignOut={async () => { await signOut(auth); setUser(null); setShowMandatoryBilling(false); }}
    />
  );

  if (showMandatoryBilling && userPlan === 'none') return <MandatoryBillingModal />;

  const trialBanner = isTrialUser && userCredits === 0 && !showMandatoryBilling
    ? <TrialExpiredBanner onUpgrade={() => window.location.hash = '#/billing'} />
    : null;

  const creditsPerMonth = PLANS[userPlan]?.monthlyCredits || 0;
  const showLowCredits = userCredits > 0 && creditsPerMonth > 0 && userCredits < creditsPerMonth * 0.2 && !isTrialUser && !showMandatoryBilling;
  const lowCreditsBanner = showLowCredits
    ? <LowCreditsWarning onTopUp={() => window.location.hash = '#/billing'} />
    : null;

  if (typeof window !== 'undefined' && window.location.hash === '#/billing') {
    return (
      <div className="min-h-screen bg-slate-950">
        {trialBanner}
        {lowCreditsBanner}
        <div className="max-w-3xl mx-auto p-4">
          <button onClick={() => { window.location.hash = ''; }} className="mb-4 text-slate-400 hover:text-white text-sm flex items-center gap-2">
            <i className="fa-solid fa-arrow-left"></i> Back
          </button>
          <Suspense fallback={<div className="text-white text-center py-20">Loading...</div>}>
            <BillingPage />
          </Suspense>
        </div>
      </div>
    );
  }

  // Cancelled user win-back screen
  // Onboarding quiz (first login — user exists but hasn't completed quiz)
  if (onboardingComplete === false) return <>{trialBanner}{lowCreditsBanner}<OnboardingQuiz onComplete={handleOnboardingComplete} /></>;

  if (showWelcome) return <>{trialBanner}{lowCreditsBanner}<WelcomeScreen userName={user.displayName || user.email || ''} isTrial={isTrialUser} onStart={handleWelcomeStart} /></>;

  // ═══ BILLING STATE GATING — past_due and cancelled block app access ═══
  if (billingStatus === 'past_due') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="max-w-lg w-full text-center space-y-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
            <i className="fa-solid fa-credit-card text-amber-400 text-4xl"></i>
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white">
              {lang === 'ar' ? 'مشكلة في الدفع' : 'Payment Issue'}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              {lang === 'ar'
                ? 'فشلت عملية الدفع الأخيرة. يرجى تحديث طريقة الدفع خلال فترة السماح للحفاظ على حسابك.'
                : 'Your last payment failed. Please update your payment method within the grace period to keep your account active.'}
            </p>
          </div>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <a href="https://app.proadsai.com/settings" className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
              <i className="fa-solid fa-gear"></i> {lang === 'ar' ? 'إعدادات الفوترة' : 'Billing Settings'}
            </a>
            <button onClick={() => { signOut(auth); }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (billingStatus === 'cancelled') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="max-w-lg w-full text-center space-y-8">
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-red-500/20 to-red-600/10 flex items-center justify-center border border-red-500/20">
            <i className="fa-solid fa-circle-xmark text-red-400 text-4xl"></i>
          </div>
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white">
              {lang === 'ar' ? 'تم إلغاء الاشتراك' : 'Subscription Cancelled'}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              {lang === 'ar'
                ? 'تم إلغاء اشتراكك. بياناتك وتاريخك محفوظان. أعد الاشتراك لاستعادة الوصول الكامل.'
                : 'Your subscription has been cancelled. Your data and history are preserved. Resubscribe to restore full access.'}
            </p>
          </div>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <a href="https://proadsai.com/#pricing" className="w-full bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 transition-all">
              <i className="fa-solid fa-rotate-right"></i> {lang === 'ar' ? 'إعادة الاشتراك' : 'Resubscribe'}
            </a>
            <button onClick={() => { signOut(auth); }} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
              {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ═══ TRIAL ENDED — Blocking screen when trial credits are exhausted ═══
  // Trial users get 50 credits + up to 50 from gamification. Once they hit 0, they must upgrade.
  if (isTrialUser && userCredits <= 0 && userPlan !== 'none') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="max-w-lg w-full text-center space-y-8">
          {/* Icon */}
          <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20">
            <i className="fa-solid fa-hourglass-end text-amber-400 text-4xl"></i>
          </div>

          {/* Title */}
          <div className="space-y-3">
            <h1 className="text-3xl font-black text-white">
              {lang === 'ar' ? 'انتهت الفترة التجريبية' : 'Your Trial Has Ended'}
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed max-w-md mx-auto">
              {lang === 'ar'
                ? `لقد استخدمت جميع رصيدك التجريبي على خطة ${PLANS[userPlan]?.name}. قم بالترقية الآن للحصول على ${PLANS[userPlan]?.monthlyCredits} رصيد شهرياً واستمر في إنشاء إعلانات احترافية.`
                : `You've used all your trial credits on the ${PLANS[userPlan]?.name} plan. Upgrade now to get ${PLANS[userPlan]?.monthlyCredits} credits every month and keep creating professional ads.`
              }
            </p>
          </div>

          {/* Plan cards */}
          <div className="space-y-3">
            {(['starter', 'pro', 'scale'] as const).map(planKey => {
              const plan = PLANS[planKey];
              const isCurrentTrial = planKey === userPlan;
              const billingKey = `${planKey}_monthly`;
              return (
                <div key={planKey} className={`bg-slate-900/80 border rounded-2xl p-5 flex items-center justify-between transition-all ${isCurrentTrial ? 'border-amber-500/50 ring-1 ring-amber-500/20' : 'border-slate-800 hover:border-blue-500/30'}`}>
                  <div className={lang === 'ar' ? 'text-right' : 'text-left'}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-white">{plan.name}</span>
                      <span className="text-[9px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">{getApproxAdsPerMonth(plan)} {lang === 'ar' ? 'إعلان/شهر' : 'Ads / month'}</span>
                      <span className="text-[8px] text-slate-500">({plan.monthlyCredits} {lang === 'ar' ? 'رصيد' : 'credits'})</span>
                      {isCurrentTrial && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-black">{lang === 'ar' ? 'خطتك التجريبية' : 'YOUR TRIAL'}</span>}
                    </div>
                    <div className="text-lg font-black text-white mt-1">${plan.priceMonthly}<span className="text-[10px] text-slate-500 font-normal">/{lang === 'ar' ? 'شهر' : 'mo'}</span></div>
                  </div>
                  <button
                    onClick={() => window.open(GHL_URLS[billingKey], '_blank')}
                    className={`px-6 py-3 rounded-xl text-white text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${isCurrentTrial ? 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-500/20' : 'bg-blue-600 hover:bg-blue-500'}`}
                  >
                    {lang === 'ar' ? 'اشترك الآن' : 'Subscribe Now'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Sign out */}
          <button onClick={handleLogout} className="text-[10px] text-slate-600 hover:text-slate-400 transition-all underline underline-offset-2">
            {lang === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}
          </button>
        </div>
      </div>
    );
  }

  // Helper to strip asterisks for display only
  const cleanDisplay = (text: string) =>
    (text || '')
      .replace(/\*\*/g, '')
      .replace(/\s*\+\s*/g, ' ')
      .trim();

  const storeRankingLinkage = (result: GenerationResult) => {
    lastRankingLinkage.current = result.rankingRequestId
      ? {
        rankingRequestId: result.rankingRequestId || undefined,
        rankingRequestFingerprint: result.rankingRequestFingerprint || undefined,
        rankingAppliedSummary: result.rankingAppliedSummary || undefined,
      }
      : null;
  };

  /** Unwrap GenerationResult: extract text + store ranking linkage in one step */
  const unwrapGen = (result: GenerationResult): string => {
    storeRankingLinkage(result);
    return result.text;
  };

  // Helper: build creativeIdentity from current state for generation records
  const buildCreativeIdentity = (overrides?: { imageHash?: string }) => {
    if (!inputs) return undefined;
    const modes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const spec = resolveCreativeSpec({ selectedModes: modes, hookAngle: inputs.coldHookAngle });
    const numFidelity = modes.some((m: string) => ['value_stack', 'premium_package'].includes(m)) ? 'strict' : 'none';
    const factsStr = JSON.stringify({
      p: inputs.valueStackPrice, ov: inputs.valueStackOriginalValue,
      op: inputs.offerCardPrice, oop: inputs.offerCardOldPrice,
    });
    const factsHash = Array.from(factsStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16);
    // Look up structured universe metadata by name
    const uniEntry = resolvedUniverse ? ALL_UNIVERSES.find((u: UniverseEntry) => u.name === resolvedUniverse || u.nameAr === resolvedUniverse) : undefined;
    const rl = lastRankingLinkage.current;
    return {
      selectedModes: modes,
      contractTemplateId: spec.resolvedLayoutKey,
      numericFidelity: numFidelity,
      offerFactsHash: factsHash,
      hookAngle: inputs.coldHookAngle || undefined,
      universeId: (inputs.visualStyleFamily ?? inputs.universeMode) === 'minimal' ? undefined : (resolvedUniverse || undefined),
      universeCategory: (inputs.visualStyleFamily ?? inputs.universeMode) === 'minimal' ? undefined : (uniEntry?.category || undefined),
      universeStyleFamily: (inputs.visualStyleFamily ?? inputs.universeMode) === 'minimal' ? 'minimal' : (uniEntry?.styleFamily || inputs.visualStyleFamily || inputs.universeMode || undefined),
      imageHash: overrides?.imageHash || undefined,
      rankingRequestId: rl?.rankingRequestId || undefined,
      rankingRequestFingerprint: rl?.rankingRequestFingerprint || undefined,
      rankingAppliedSummary: rl?.rankingAppliedSummary || undefined,
    };
  };

  // Helper to track the highest step user has reached
  const updateHighestUnlocked = (newPhase: AppPhase) => {
    const phaseOrder: AppPhase[] = ['input', 'tov_review', 'concept_review', 'render_studio', 'primary_text'];
    const newIndex = phaseOrder.indexOf(newPhase);
    if (newIndex > highestUnlockedPhase) {
      setHighestUnlockedPhase(newIndex);
    }
  };

  // Handle legacy strings (old saves) vs new objects
  const historyItem = historyIndex >= 0 ? mockupHistory[historyIndex] : null;

  // Get the URL string (blob URL for display, rawBase64 for API calls)
  // @ts-ignore (Safety check for old history data)
  const currentMockup = typeof historyItem === 'string' ? historyItem : historyItem?.url;
  const currentRawBase64 = (typeof historyItem === 'object' ? historyItem?.rawBase64 : undefined) || currentMockup;

  // Get the Ratio (If old data, default to 1:1. If new, use saved ratio. If generating, use button selection)
  // @ts-ignore
  const savedRatio = typeof historyItem === 'object' && historyItem?.ratio ? historyItem.ratio : null;

  // CRITICAL: If we are viewing history, use savedRatio. If generating new, use currentAspectRatio.
  const displayRatio = savedRatio || currentAspectRatio;

  const startLoad = (msg: string) => { setIsLoading(true); setLoadingMsg(msg); };
  const stopLoad = () => { setIsLoading(false); setLoadingMsg(''); };


  const pushMockup = (url: string | null, ratio: AspectRatio) => {
    if (!url) return;
    // Convert base64 data URLs to blob URLs for Chrome right-click "Copy image" support
    let displayUrl = url;
    let rawBase64: string | undefined;
    if (url.startsWith('data:')) {
      rawBase64 = url;
      try {
        const [header, b64] = url.split(',');
        const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        displayUrl = URL.createObjectURL(new Blob([arr], { type: mime }));
      } catch { /* fallback to base64 if conversion fails */ }
    }
    setMockupHistory(prev => {
      const newHistory = [...prev, { url: displayUrl, ratio, rawBase64 }];
      setHistoryIndex(newHistory.length - 1);
      return newHistory;
    });
  };

  const getSection = (text: string, startKey: string, endKey: string) => {
    if (!text) return '';

    // Normalize: allow callers to pass "KEY" or "KEY:" interchangeably
    const sk = (startKey || '').replace(/:\s*$/g, '').trim();
    const ek = (endKey || '').replace(/:\s*$/g, '').trim();

    // Case-insensitive search without breaking original slicing indexes
    const upper = text.toUpperCase();
    const skUpper = sk.toUpperCase();
    const ekUpper = ek.toUpperCase();

    let startIndex = upper.indexOf(skUpper);
    if (startIndex === -1) return '';

    // Move contentStart after the key, then skip optional ":" or "：" and whitespace/newlines
    let contentStart = startIndex + sk.length;

    // If the model output includes a colon after the key, skip it
    const maybeColon = text.slice(contentStart, contentStart + 2);
    if (maybeColon.startsWith(':') || maybeColon.startsWith('：')) contentStart += 1;

    // Skip spaces / tabs / newlines after key
    while (contentStart < text.length && /\s/.test(text[contentStart])) contentStart++;

    // 1) Try exact endKey match AFTER the start (with or without colon)
    let endIndex = upper.indexOf(ekUpper, contentStart);

    // 2) If endKey is a "prefix marker" (ex: CONCEPT_END_1), match endKey + any suffix token
    if (endIndex === -1) {
      const afterStart = text.slice(contentStart);
      const escaped = ek.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = afterStart.match(new RegExp(`\\n\\s*${escaped}\\s*:?\\S*`, 'i'));
      if (m && typeof m.index === 'number') {
        endIndex = contentStart + m.index;
      }
    }

    // 3) If still not found, return everything till end (better than empty)
    if (endIndex === -1) return text.slice(contentStart).trim();

    return text.slice(contentStart, endIndex).trim();
  };

  // Normalize any Arabic field labels in concept text to English equivalents.
  // Uses Unicode escapes so App.tsx stays English-only. Handles alef variants,
  // space/underscore separators, and optional diacritics between chars.
  // normalizeFieldLabels moved to module scope (before App) to avoid hoisting issues

  const getConceptBlock = (text: string, n: number) => {
    if (!text) return '';
    // Normalize Arabic field labels to English before parsing
    text = normalizeFieldLabels(text);

    // 1) Best-case: exact numbered markers
    const direct = getSection(text, `CONCEPT_START_${n}`, `CONCEPT_END_${n}`);
    if (direct.trim()) return direct;

    // 2) Robust marker parsing: scan for all START/END pairs
    const startRe = /CONCEPT[\s_\-]*START[\s_\-]*(\d*)/gi;
    const starts: { idx: number; num: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = startRe.exec(text)) !== null) {
      starts.push({ idx: m.index, num: parseInt(m[1]) || starts.length + 1 });
    }

    if (starts.length) {
      for (let i = 0; i < starts.length; i++) {
        const startIdx = starts[i].idx;
        const contentStart = (() => {
          const lineEnd = text.indexOf('\n', startIdx);
          return lineEnd === -1 ? startIdx : lineEnd + 1;
        })();
        // End = next CONCEPT_END or next CONCEPT_START or end of text
        const endRe2 = /CONCEPT[\s_\-]*END[\s_\-]*\d*/gi;
        endRe2.lastIndex = contentStart;
        const endMatch = endRe2.exec(text);
        const nextStart = i + 1 < starts.length ? starts[i + 1].idx : text.length;
        const contentEnd = endMatch && endMatch.index < nextStart ? endMatch.index : nextStart;
        const chunk = text.slice(contentStart, contentEnd).trim();
        if (chunk && (starts[i].num === n || i === n - 1)) return chunk;
      }
      // Fallback: return by position
      const blocks: string[] = [];
      for (let i = 0; i < starts.length; i++) {
        const contentStart = (() => {
          const lineEnd = text.indexOf('\n', starts[i].idx);
          return lineEnd === -1 ? starts[i].idx : lineEnd + 1;
        })();
        const endRe3 = /CONCEPT[\s_\-]*END[\s_\-]*\d*/gi;
        endRe3.lastIndex = contentStart;
        const endMatch = endRe3.exec(text);
        const nextStart = i + 1 < starts.length ? starts[i + 1].idx : text.length;
        const contentEnd = endMatch && endMatch.index < nextStart ? endMatch.index : nextStart;
        blocks.push(text.slice(contentStart, contentEnd).trim());
      }
      if (blocks.length >= n && blocks[n - 1]) return blocks[n - 1];
    }

    // 3) Fallback: split by SUBJECT_ACTION field markers
    const actionRe = /SUBJECT_ACTION\s*[:：]?/gi;
    const actionIdx: number[] = [];
    while ((m = actionRe.exec(text)) !== null) actionIdx.push(m.index);
    if (actionIdx.length >= 2) {
      // Multiple SUBJECT_ACTION means multiple concepts
      const chunks: string[] = [];
      for (let i = 0; i < actionIdx.length; i++) {
        const a = actionIdx[i];
        const b = actionIdx[i + 1] ?? text.length;
        chunks.push(text.slice(a, b).trim());
      }
      if (chunks.length >= n) return chunks[n - 1];
    }

    // 4) Fallback: split by SUBJECT_ACTION
    const saRe = /SUBJECT_ACTION\s*[:：]?/gi;
    const saIdx: number[] = [];
    while ((m = saRe.exec(text)) !== null) saIdx.push(m.index);
    if (saIdx.length) {
      const chunks: string[] = [];
      for (let i = 0; i < saIdx.length; i++) {
        const a = saIdx[i];
        const b = saIdx[i + 1] ?? text.length;
        chunks.push(text.slice(a, b).trim());
      }
      if (chunks.length >= n) return chunks[n - 1];
    }

    // 5) Last resort
    return n === 1 ? text.trim() : '';
  };

  // Navigate to any unlocked step without regenerating
  const navigateToStep = (targetPhase: AppPhase, targetIndex: number) => {
    // Only allow if step is unlocked
    if (targetIndex <= highestUnlockedPhase) {
      setPhase(targetPhase);
    }
  };

  const handleBack = () => {

    if (phase === 'tov_review') setPhase('input');
    else if (phase === 'concept_review') setPhase('tov_review');
    else if (phase === 'render_studio') setPhase('concept_review');
    else if (phase === 'primary_text') setPhase('render_studio');
  };

  const togglePolish = (id: string) => {
    const next = new Set(selectedPolishIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedPolishIds(next);
  };

  // --- HISTORY ENGINE moved to before render gates ---

  // Plan-agnostic shape migration: universe remap (r_sushi_bar → r_sushi_counter,
  // "Premium Sushi Bar" → "Premium Sushi Counter") and style/universe mode normalization.
  // Safe to run before userPlan is resolved (i.e., on the startup auto-restore path).
  // Declared as a function (not const arrow) so it hoists to the top of App — render
  // gates above this line would otherwise leave it in TDZ when the auto-restore
  // useEffect callback fires.
  function migrateProjectInputsShape(rawInputs: any): any {
    if (!rawInputs) return null;
    const _style = (rawInputs.visualStyleFamily ?? rawInputs.universeMode ?? 'realistic') as 'realistic' | 'fantasy' | 'minimal';
    const rawUniverse = rawInputs.preferredUniverse;
    const remappedUniverse = rawUniverse === 'Premium Sushi Bar' ? 'Premium Sushi Counter' : rawUniverse;
    return {
      ...rawInputs,
      preferredUniverse: remappedUniverse,
      testimonial: rawInputs.testimonial ?? '',
      universeMode: _style,
      visualStyleFamily: _style,
    };
  }

  // Plan-aware migration: calls the shape migration first, then enforces retargeting
  // entitlement based on the explicit `plan` argument. MUST NOT be called before
  // userPlan is resolved — an unresolved 'none' would incorrectly strip retargeting
  // from a saved project that belongs to a user who actually has a paid tier.
  const migrateProjectInputs = (rawInputs: any, plan: UserPlan = userPlan): any => {
    const shaped = migrateProjectInputsShape(rawInputs);
    if (!shaped) return null;
    return {
      ...shaped,
      campaignType: canUse(plan, 'retargeting') ? (shaped.campaignType ?? 'cold') : 'cold',
      retargetingObjection: canUse(plan, 'retargeting') ? (shaped.retargetingObjection ?? shaped.retargetingObjections?.[0] ?? undefined) : undefined,
      retargetingObjections: canUse(plan, 'retargeting') ? (shaped.retargetingObjections ?? (shaped.retargetingObjection ? [shaped.retargetingObjection] : [])) : [],
      customObjection: canUse(plan, 'retargeting') ? (shaped.customObjection ?? '') : '',
    };
  };

  const loadProject = (p: SavedProject, targetPhase?: AppPhase) => {
    setCurrentProjectId(p.id);
    setCurrentProjectName(p.name || "Untitled Project");
    const migratedInputs = migrateProjectInputs(p.inputs);

    setInputs(sanitizeProjectModes(migratedInputs));
    setTovText(p.tovText);
    setConceptsText(normalizeFieldLabels(p.conceptsText));
    setSelectedTov(p.selectedTov);
    setSelectedConcept(p.selectedConcept);
    setBuildPlan(p.buildPlan);
    setMockupHistory(p.mockupHistory);
    setHistoryIndex(p.historyIndex);
    setResolvedUniverse(p.resolvedUniverse);
    setCaptionText(p.captionText);
    setBatchCaptions(p.batchCaptions || []);
    setBatchResults(p.batchResults || []);
    setBatchHookGroups(p.batchHookGroups ? p.batchHookGroups.map(g => ({ ...g, selectedConcepts: new Set(g.selectedConcepts as any) })) : []);
    setCarouselSlides(p.carouselSlides || []);
    setBatchRendering(false);
    setBatchSelectedHooks(new Set());
    setShowBatchConfig(false);
    setBatchConceptsLoading(false);
    setCarouselCopies([]);
    setShowCarouselPreview(false);
    // Determine the highest step that has meaningful data
    const phaseOrder: AppPhase[] = ['input', 'tov_review', 'concept_review', 'render_studio', 'primary_text'];
    let highestPhaseWithData: AppPhase = 'input';
    if (p.captionText) highestPhaseWithData = 'primary_text';
    else if (p.mockupHistory && p.mockupHistory.length > 0) highestPhaseWithData = 'render_studio';
    else if (p.conceptsText) highestPhaseWithData = 'concept_review';
    else if (p.tovText) highestPhaseWithData = 'tov_review';

    const highestIdx = phaseOrder.indexOf(highestPhaseWithData);
    setHighestUnlockedPhase(highestIdx >= 0 ? highestIdx : 0);

    // FR-010 / FR-011: honour an explicit targetPhase (validated against
    // stepsWithData), otherwise resume at the project's saved p.phase rather
    // than the auto-derived highestPhaseWithData. The saved phase reflects
    // where the user actually left off — preserving the existing card-body
    // open behaviour from before Phase 13.
    const steps = stepsWithData(p);
    if (targetPhase && steps[targetPhase]) {
      setPhase(targetPhase);
    } else {
      setPhase(p.phase || highestPhaseWithData);
    }
    setShowSidebar(false);
    showToast(`Loaded "${p.name}"`, 'success');
  };

  // Non-interactive reset (no window.confirm prompt). Called by the
  // post-deletion path so the user doesn't get a second confirmation dialog
  // after they've already confirmed the delete.
  const resetToBlankProject = () => {
    const newId = Date.now().toString();
    setCurrentProjectId(newId);
    setCurrentProjectName("Untitled Project");
    setInputs(null);
    setPhase('input');
    setTovText('');
    setConceptsText('');
    setSelectedTov('');
    setSelectedConcept('');
    setBuildPlan('');
    setMockupHistory([]);
    setHistoryIndex(-1);
    setResolvedUniverse('');
    setCaptionText('');
    setBatchResults([]);
    setCarouselSlides([]);
    setBatchRendering(false);
    setBatchSelectedHooks(new Set());
    setBatchHookGroups([]);
    setShowBatchConfig(false);
    setBatchConceptsLoading(false);
    setBatchCaptions([]);
    setCarouselCopies([]);
    setShowCarouselPreview(false);
    setHighestUnlockedPhase(0);
    setShowSidebar(false);
    localStorage.removeItem('adInputsDraft');
  };

  const createNewProject = () => {
    if (window.confirm("Start a brand new project?")) {
      resetToBlankProject();
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const deleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeleteTarget(id);
  };

  const confirmDelete = async (id: string) => {
    try {
      await deleteProjectFromDB(id);
      if (effectiveUid) {
        deleteProjectFromFirestore(effectiveUid, id).catch(() => {});
        for (const ext of ["jpg", "png"]) {
          try {
            await deleteObject(storageRef(storage, `users/${effectiveUid}/projects/${id}/thumbnail.${ext}`));
          } catch (err: any) {
            if (err?.code !== "storage/object-not-found") throw err;
          }
        }
      }
    } catch (e) { console.warn("Delete sync failed"); }

    const updated = projects.filter(p => p.id !== id);
    setProjects(updated);
    // The user already confirmed the delete in <DeleteProjectDialog>; calling
    // createNewProject() here would prompt them a second time. Use the
    // non-interactive reset instead.
    if (id === currentProjectId) resetToBlankProject();
    setDeleteTarget(null);
  };

  const handleApiError = (e: any) => {
    console.error('[API Error]', e); // Log full error for debugging
    const msg = typeof e === 'string' ? e : e.message || JSON.stringify(e);
    const status = e?.status || e?.response?.status;

    // Only logout for actual auth errors - check status code first
    if (status === 403 || msg.includes("API_KEY_INVALID") || msg.includes("invalid API key")) {
      showToast("API request failed (403). Try again or contact support.", "error");
      return;
    }
    if (status === 429 || msg.includes("429") || msg.includes("Quota") || msg.includes("RESOURCE_EXHAUSTED")) {
      showToast("Quota Limit Hit. Wait 60 sec or click 🔑 icon in header to use a different key.", "error");
      return;
    }
    // Generic error - don't logout
    showToast(msg.length > 100 ? msg.substring(0, 100) + "..." : msg || "Unknown API Error", "error");
  };

  const handleSaveDraft = async (formData: AdInputs) => {
    const uid = effectiveUidRef.current;
    if (!user || !uid) return;
    const draftName = formData.productName || 'Draft';
    const draftProject: SavedProject = {
      id: currentProjectId,
      userId: uid,
      name: `📝 ${draftName}`,
      timestamp: Date.now(),
      inputs: formData,
      phase: 'input',
      tovText: '',
      conceptsText: '',
      selectedTov: '',
      selectedConcept: '',
      buildPlan: '',
      mockupHistory: [],
      historyIndex: -1,
      resolvedUniverse: '',
      captionText: '',
      ...(canUseWorkspaces && activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
    };
    try {
      await saveProjectToDB(draftProject);
      // Also sync to Firestore for cross-browser access
      if (uid) {
        try { await saveProjectToFirestore(uid, draftProject); }
        catch (e) { console.error("Draft Firestore sync failed:", e); showToast('Cloud sync failed', 'error'); }
      }
      setProjects((prev: SavedProject[]) => {
        const filtered = prev.filter((p: SavedProject) => p.id !== currentProjectId);
        return [draftProject, ...filtered];
      });
    } catch (e) { console.error("Draft save failed", e); }
  };

  const handleStartDesign = async (formData: AdInputs) => {
    if (!user) { showToast("Please log in first.", "info"); return; }

    // SAFETY: Force cold mode if plan doesn't allow retargeting
    if (!canUse(userPlan, 'retargeting') && formData.campaignType === 'retargeting') {
      formData = { ...formData, campaignType: 'cold', retargetingObjection: undefined, retargetingObjections: [], customObjection: '', testimonial: '' };
    }

    if (!deductCredits('generateHooks')) return;

    // AUTO-NEW PROJECT: If current project already has hook/concept data, 
    // create a new project so we don't overwrite the previous one.
    if (tovText || conceptsText || buildPlan) {
      const newId = Date.now().toString();
      setCurrentProjectId(newId);
      setCurrentProjectName("Untitled Project");
    }

    // Competitor research is available on the Brief page (manual trigger)
    // No need to auto-fire here — avoids potential double deduction

    // RESET: Clear previous design session data
    setMockupHistory([]);
    setHistoryIndex(-1);
    setCaptionText('');
    setConceptsText('');
    setSelectedTov('');
    setSelectedConcept('');
    setBuildPlan('');
    setVisualPolishes([]);
    setSelectedPolishIds(new Set());

    // Universe Selection logic...
    let universe = formData.preferredUniverse;
    if (((formData.visualStyleFamily ?? formData.universeMode) === 'minimal')) {
      universe = ''; // Minimal has no universe
    } else if (universe.toLowerCase().includes("surprise me")) {
      universe = getRandomUniverse((formData.visualStyleFamily ?? formData.universeMode) as any, {
        targetAudience: formData.targetAudience,
        productName: formData.productName,
        challenges: formData.challenges,
      });
    }
    else if (universe.toLowerCase().includes("custom")) { universe = formData.customUniverseDetails || "Custom World"; }

    setResolvedUniverse(universe);

    // ─── AUTO-INJECT COMPETITOR CONTEXT INTO GENERATION PIPELINE ─────────
    // If competitor research has been run, automatically feed insights into prompts
    // so the AI can differentiate and position against competitors.
    // This works alongside the manual "Use" buttons in InputForm.
    let competitorContext: string | undefined;
    if (competitorData && competitorData.competitors?.length > 0) {
      const compNames = competitorData.competitors.slice(0, 4).map(c => `${c.name}: ${c.description}`).join('\n');
      const compAngles = (competitorData.angles || []).slice(0, 3).map(a => `- ${a.title}: ${a.explanation}`).join('\n');
      const compHooks = (competitorData.attackHooks || []).slice(0, 5).join(' | ');
      competitorContext = `
COMPETITOR LANDSCAPE (from live research):
${compNames}

DIFFERENTIATION ANGLES:
${compAngles}

ATTACK HOOKS (use these to stand out):
${compHooks}

DIRECTIVE: Use this intelligence to make the ad DISTINCT from competitors. Highlight what makes this offer unique. Do NOT copy competitor messaging — position AGAINST them.`.trim();
    }

    setInputs({ ...formData, _userId: user?.uid, competitorContext } as any); // Keep images in React State for later
    const isMinimalProject = (formData.visualStyleFamily ?? formData.universeMode) === 'minimal';
    setCurrentProjectName(isMinimalProject ? `${formData.productName}_minimal` : `${formData.productName}_${universe}`);
    setCurrentAspectRatio(formData.aspectRatio);
    startLoad(isMinimalProject ? 'Starting Design Engine...' : `Rendering Universe [${universe}]...`);

    // SANITIZATION: Create a lightweight copy for the AI
    const cleanInputs = { ...formData, personalPhotos: [], brandLogos: [], _userId: user?.uid, competitorContext };

    try {
      // ═══ TESTIMONIAL MODE: Extract text from screenshots before generation ═══
      const selectedModes = (formData as any).offerCreativeMode || ['standard_hero'];
      if (selectedModes.includes('testimonial_carousel') && (formData as any).testimonialScreenshots?.length > 0) {
        try {
          setLoadingMsg('Extracting testimonial text...');
          const extractFn = httpsCallable(functions, 'extractTestimonialText');
          const extractResult = await extractFn({ screenshots: (formData as any).testimonialScreenshots });
          const extractData = extractResult.data as any;
          if (extractData.success && extractData.testimonials?.length > 0) {
            (cleanInputs as any).testimonialTexts = extractData.testimonials;
            (formData as any).testimonialTexts = extractData.testimonials;
            setInputs(prev => ({ ...prev, testimonialTexts: extractData.testimonials } as any));
          }
        } catch (err: any) {
          console.warn('Testimonial extraction failed (non-blocking):', err);
          showToast('Could not extract text from screenshots. Continuing with images only.', 'info');
        }
      }

      let res: string;
      if (formData.adMode === 'carousel' && (formData.slideCount || 1) > 1) {
        // CAROUSEL MODE: Generate 4 story angles instead of 4 single-image hooks
        res = await gemini.generateCarouselAngles(cleanInputs, universe, formData.slideCount || 5, globalRefinement);
      } else {
        // SINGLE MODE: Standard 4 hooks
        res = unwrapGen(await gemini.generateTOV(cleanInputs, universe, 'initial', '', globalRefinement));
      }

      // ─── HOOK VALIDATION GATE ─────────────────────────────────────────
      // Validate hook structure before entering Hook Lab
      if (!res || !res.trim()) {
        refundCredits('generateHooks');
        showToast('Hook generation returned empty. Credits refunded. Please retry.', 'error');
        return;
      }

      // Try normalization if needed
      const normalized = normalizeHooksToCanonical(res);
      if (normalized) {
        res = normalized;
      }

      const hookValidation = validateCanonicalHooks(res);
      if (!hookValidation.valid) {
        refundCredits('generateHooks');
        showToast(`Hook generation failed: ${hookValidation.reason || 'invalid structure'}. Credits refunded.`, 'error');
        return;
      }

      setTovText(res);
      setPhase('tov_review');
      updateHighestUnlocked('tov_review');
      awardMilestone('hooksGenerated');
      // ─── SAVE GENERATIONS FOR FEEDBACK FLYWHEEL (non-blocking) ─────────
      if (user && res) {
        try {
          const hookIds: Record<string, string> = {};
          for (const v of ['A', 'B', 'C', 'D']) {
            const hookRaw = getSection(res, `HOOK_START_${v}`, `HOOK_END_${v}`);
            if (hookRaw.trim()) {
              const ht = getSection(hookRaw, "HOOK_TEXT", "SUBHEADLINE").replace(/\*\*/g, '').trim();
              const sh = getSection(hookRaw, "SUBHEADLINE", "CTA_BUTTON").replace(/\*\*/g, '').trim();
              const genId = await feedbackService.saveGeneration(
                user.uid, cleanInputs, 'hooks',
                { hookText: ht, subhead: sh, ctaText: cleanInputs.cta },
                hookRaw, universe, 'gemini-3-flash', 0, undefined, buildCreativeIdentity(),
                canUseWorkspaces ? activeWorkspaceId : null
              );
              if (genId) hookIds[v] = genId;
            }
          }
          setHookGenerationIds(hookIds);
          const firstGenId = Object.values(hookIds)[0];
          if (loadedFavoriteId && firstGenId) {
            setFavUpdatePrompt({ phase: 'hooks', newGenId: firstGenId });
          }
        } catch (saveErr) {
          console.error('Non-blocking: failed to save hook generation records:', saveErr);
        }
      }
    } catch (e) { refundCredits('generateHooks'); handleApiError(e); } finally { stopLoad(); }
  };

  // Change to a new random universe and regenerate hooks
  const handleChangeUniverse = async () => {
    if (!inputs) return;
    if ((inputs.visualStyleFamily ?? inputs.universeMode) === 'minimal') return; // Minimal has no universe to change
    if (!deductCredits('refreshHooks')) return;
    const newUniverse = getRandomUniverse((inputs.visualStyleFamily ?? inputs.universeMode) as any, {
      targetAudience: inputs.targetAudience,
      productName: inputs.productName,
      challenges: inputs.challenges,
    });
    setResolvedUniverse(newUniverse);

    startLoad(`Switching Universe: ${newUniverse.split('(')[0].trim()}...`);
    try {
      let res: string;
      if (inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1) {
        res = await gemini.generateCarouselAngles(inputs, newUniverse, inputs.slideCount || 5, globalRefinement);
      } else {
        res = unwrapGen(await gemini.generateTOV(inputs, newUniverse, 'initial', '', globalRefinement));
      }

      // Validate before accepting
      if (!res || !res.trim()) {
        refundCredits('refreshHooks');
        showToast('Hook generation returned empty. Credits refunded.', 'error');
        return;
      }
      const normalized = normalizeHooksToCanonical(res);
      if (normalized) res = normalized;

      const hookValidation = validateCanonicalHooks(res);
      if (!hookValidation.valid) {
        refundCredits('refreshHooks');
        showToast(`Hook generation failed: ${hookValidation.reason || 'invalid structure'}. Credits refunded.`, 'error');
        return;
      }

      setTovText(res);
      // Mark that downstream steps need regeneration
      setSelectedTov('');
      setConceptsText('');
      setSelectedConcept('');
      setBuildPlan('');
      showToast(`Now in: ${newUniverse.split('(')[0].trim()}`, "success");
    } catch (e) { refundCredits('refreshHooks'); handleApiError(e); } finally { stopLoad(); }
  };

  const handleGlobalHookRefinement = async () => {
    if (!inputs) return;
    if (!deductCredits('refreshHooks')) return;
    startLoad("Regenerating Hooks...");
    try {
      let res: string;
      if (inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1) {
        res = await gemini.generateCarouselAngles(inputs, resolvedUniverse, inputs.slideCount || 5, globalRefinement);
      } else {
        // If no refinement text, generate completely fresh hooks (initial mode) instead of refining existing ones
        // ALWAYS pass previous hooks so the model can explicitly avoid repeating them
        const hasRefinement = globalRefinement && globalRefinement.trim().length > 0;
        res = unwrapGen(await gemini.generateTOV(
          inputs, resolvedUniverse,
          hasRefinement ? 'refresh' : 'initial',
          tovText || undefined,
          hasRefinement ? globalRefinement : undefined
        ));
      }

      // Validate before accepting
      if (!res || !res.trim()) {
        refundCredits('refreshHooks');
        showToast('Hook regeneration returned empty. Credits refunded.', 'error');
        return;
      }
      const normalized = normalizeHooksToCanonical(res);
      if (normalized) res = normalized;

      const hookValidation = validateCanonicalHooks(res);
      if (!hookValidation.valid) {
        refundCredits('refreshHooks');
        showToast(`Hook regeneration failed: ${hookValidation.reason || 'invalid structure'}. Credits refunded. Keeping previous hooks.`, 'error');
        return;
      }

      setTovText(res);
      // Clear downstream state since hooks changed — concepts and batches are now stale
      const isFullRegen = !globalRefinement || !globalRefinement.trim();
      if (isFullRegen) {
        setConceptsText('');
        setSelectedConcept('');
        setBuildPlan('');
        setBatchHookGroups([]);
        setBatchResults([]);
        setBatchCaptions([]);
      }
      showToast(isFullRegen ? "Fresh hooks generated. Re-generate concepts when ready." : "Pipeline updated.", "success");
    } catch (e) { refundCredits('refreshHooks'); handleApiError(e); } finally { stopLoad(); }
  };

  const classifyHookEditIntent = (instruction: string): { editIntent: TovEditIntent; rewriteScope: RewriteScope } => {
    const normalized = (instruction || '').trim().toLowerCase();

    if (!normalized) return { editIntent: 'freeform', rewriteScope: 'full' };
    if (/same psychological angle|same angle|simpler terms|simplify|سط|أبسط|بسّط|أوضح|more direct/.test(normalized)) {
      return { editIntent: 'simplify_terms', rewriteScope: 'wording_only' };
    }
    if (/shorter|shorten|مختصر|قصير/.test(normalized)) {
      return { editIntent: 'shorten', rewriteScope: 'wording_only' };
    }
    if (/stronger|sharper|sharpen|أقوى|أحد|أقسى/.test(normalized)) {
      return { editIntent: 'sharpen', rewriteScope: 'wording_only' };
    }
    if (/formal|professional|رسمي|احترافي/.test(normalized)) {
      return { editIntent: 'formalize', rewriteScope: 'wording_only' };
    }
    if (/change angle|new angle|غيّر الزاوية|زاوية جديدة/.test(normalized)) {
      return { editIntent: 'change_angle', rewriteScope: 'full' };
    }
    if (/cta_button|change cta|cta only|button|الزر|الدعوة/.test(normalized)) {
      return { editIntent: 'change_cta', rewriteScope: 'cta_only' };
    }
    if (/subheadline|subtitle|الوصف|السطر الثاني/.test(normalized)) {
      return { editIntent: 'change_subheadline', rewriteScope: 'subheadline_only' };
    }
    if (/headline|hook_text|title|العنوان|الهيدلاين/.test(normalized)) {
      return { editIntent: 'change_headline', rewriteScope: 'hook_only' };
    }

    return { editIntent: 'freeform', rewriteScope: 'full' };
  };

  const deriveSemanticLockFromHook = (hookBlock: string, currentInputs: AdInputs): SemanticLock => {
    const hookLine = getSection(hookBlock, 'HOOK_TEXT', 'SUBHEADLINE') || hookBlock;
    const subLine = getSection(hookBlock, 'SUBHEADLINE', 'CTA_BUTTON');
    const combined = `${hookLine} ${subLine}`.trim();
    const normalized = combined.toLowerCase();
    const transformation = (currentInputs.transformation || '').trim();
    const challenge = (currentInputs.challenges || '').trim();

    const angle = /\?|؟|لماذا|why|ليش|هل/.test(combined)
      ? 'question_reframe'
      : /(سر|secret|mechanism|system|framework|protocol|formula|method|منهج|نظام|بروتوكول)/i.test(combined)
        ? 'mechanism'
        : /(90%|\d+%|case study|proof|دليل|أرقام|نتائج|شاهد|مثال)/i.test(combined)
          ? 'proof'
          : /(الآن|today|before it|too late|فات|الفرصة|urgent|now)/i.test(combined)
            ? 'urgency'
            : /(متواضعة|ضعيفة|problem|mistake|خطأ|فجوة|leak|نزيف)/i.test(combined)
              ? 'pain_agitation'
              : 'authority';

    const mechanismMatch = combined.match(/(?:سر|system|framework|protocol|method|mechanism|نظام|بروتوكول|منهج)\s+([^،,.!?؟]{2,40})/i);
    const mechanism = mechanismMatch?.[0]?.trim()
      || (/سعر|price|premium|offer|عرض|rate/i.test(combined) ? 'price-positioning mechanism' : '')
      || transformation
      || challenge
      || currentInputs.productName
      || 'core commercial mechanism';

    const promiseType = /lead|client|عميل|calls|مكالمات|book|حجز/i.test(normalized)
      ? 'client acquisition'
      : /price|premium|سعر|تسعير|offer|عرض/i.test(normalized)
        ? 'pricing power'
        : /content|creator|content creator|محتوى/i.test(normalized)
          ? 'content monetization'
          : /sale|revenue|profit|cash|مبيعات|أرباح|فلوس|دخل/i.test(normalized + ' ' + transformation.toLowerCase())
            ? 'revenue growth'
            : 'commercial transformation';

    const emotionalFrame = /fear|risk|نزيف|خسارة|فاتك|cost of inaction/i.test(normalized)
      ? 'loss aversion'
      : /secret|curious|سر|ماذا|why/.test(normalized)
        ? 'curiosity'
        : /authority|expert|خبير|كبار الخبراء|trusted/i.test(normalized)
          ? 'authority'
          : /proof|أرقام|results|case/i.test(normalized)
            ? 'proof'
            : 'clarity';

    return {
      angle,
      mechanism,
      audience: currentInputs.targetAudience || currentInputs.productCategory || 'target buyer',
      pain: challenge || currentInputs.productName || 'primary pain point',
      desiredOutcome: transformation || currentInputs.cta || 'desired outcome',
      promiseType,
      emotionalFrame,
      objectionFrame: (currentInputs as any).retargetingObjection || undefined,
    };
  };

  const handlePrecisionHookEdit = async (index: string, directInstruction?: string) => {
    const instruction = directInstruction || editFeedback;
    if (!inputs || !instruction) return;
    if (!deductCredits('editOneHook')) return;
    setActiveEditHookIndex(null);
    setEditFeedback('');
    setItemLoading(prev => ({ ...prev, [index]: true }));

    try {
      // Extract ONLY the hook being edited to send to the AI
      const startMarker = `HOOK_START_${index}`;
      const endMarker = `HOOK_END_${index}`;
      const existingStart = tovText.indexOf(startMarker);
      const existingEnd = tovText.indexOf(endMarker);

      const currentHookText = existingStart >= 0 && existingEnd >= 0
        ? tovText.substring(existingStart, existingEnd + endMarker.length)
        : '';

      // Call API with just this hook
      const isRegenerate = instruction.toLowerCase().includes('regenerate');
      const { editIntent: classifiedIntent, rewriteScope } = classifyHookEditIntent(instruction);
      // For regeneration: skip semantic lock and use change_angle intent so backend allows full rewrite
      const editIntent = isRegenerate ? 'change_angle' as TovEditIntent : classifiedIntent;
      const semanticLock = isRegenerate ? undefined : deriveSemanticLockFromHook(currentHookText, inputs);

      const res = unwrapGen(await gemini.generateTOV(inputs, resolvedUniverse, 'precision', currentHookText, '', instruction, index, editIntent, rewriteScope, semanticLock));

      if (res) {
        // Find the new hook in the response
        const newHookStart = res.indexOf(startMarker);
        const newHookEnd = res.indexOf(endMarker);

        if (newHookStart >= 0 && newHookEnd >= 0 && existingStart >= 0 && existingEnd >= 0) {
          // Extract just the edited hook from the response
          const editedHook = res.substring(newHookStart, newHookEnd + endMarker.length);

          // Validate: ensure the edited hook has at least a HOOK_TEXT
          const editedHookText = getSection(editedHook, 'HOOK_TEXT', 'SUBHEADLINE');
          if (!editedHookText || editedHookText.trim().length < 3) {
            // Edited hook is invalid — keep original
            refundCredits('editOneHook');
            showToast(`Hook ${index} edit returned invalid content. Keeping original.`, "error");
            return;
          }

          // Merge: Replace ONLY this hook in the full tovText
          const mergedTov =
            tovText.substring(0, existingStart) +
            editedHook +
            tovText.substring(existingEnd + endMarker.length);

          setTovText(mergedTov);
          showToast(`Hook ${index} updated!`, "success");
        } else {
          // Fallback: response didn't have proper markers — don't blindly overwrite
          refundCredits('editOneHook');
          showToast(`Hook ${index} edit returned malformed response. Keeping original.`, "error");
        }
      }
    } catch (e) { refundCredits('editOneHook'); handleApiError(e); } finally { setItemLoading(prev => ({ ...prev, [index]: false })); }
  };

  const handleApproveTov = async (variationText: string) => {
    if (!inputs) return;
    setSelectedTov(variationText);

    // ─── CAROUSEL MODE: Generate detailed slide copies from the chosen angle ─────
    if (inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1) {
      // If copies already exist (e.g. user cancelled preview), just reshow them without re-charging
      if (carouselCopies.length > 0 && selectedTov === variationText) {
        setShowCarouselPreview(true);
        return;
      }
      const slideCount = inputs.slideCount || 5;
      if (!deductCredits('generateCarouselCopies', slideCount)) return;
      startLoad(`Expanding angle into ${slideCount}-slide narrative...`);
      try {
        const copies = await gemini.generateCarouselSlideCopies(
          variationText, inputs, slideCount, resolvedUniverse
        );
        setCarouselCopies(copies);
        setShowCarouselPreview(true);
      } catch (e: any) {
        refundCredits('generateCarouselCopies', slideCount);
        handleApiError(e);
      } finally {
        stopLoad();
      }
      return; // Don't generate concepts yet — wait for user to confirm copies
    }

    // ─── SINGLE MODE: Generate concepts directly ─────
    if (!deductCredits('generateConcepts')) return;
    startLoad(`Creating Concepts...`);
    const cleanInputs = { ...inputs, personalPhotos: [], brandLogos: inputs.brandLogos?.slice(0, 5) || [] };
    try {
      let res = unwrapGen(await gemini.generateConcepts(variationText, cleanInputs, resolvedUniverse, 'initial', '', globalRefinement));
      res = res ? normalizeFieldLabels(res) : res;
      if (!res || (!res.includes('CONCEPT_START') && !res.includes('SUBJECT_ACTION'))) {
        refundCredits('generateConcepts');
        showToast('Blueprint generation returned empty. Credits refunded. Please try again.', 'error');
        return;
      }
      setConceptsText(res);
      setPhase('concept_review');
      updateHighestUnlocked('concept_review');
      awardMilestone('conceptsGenerated');
    } catch (e) { refundCredits('generateConcepts'); handleApiError(e); } finally { stopLoad(); }
  };

  // ─── CAROUSEL: Confirm copies → generate concepts ─────
  const handleCarouselCopyConfirm = async () => {
    if (!inputs || !selectedTov) return;
    if (!deductCredits('generateConcepts')) return;
    setShowCarouselPreview(false);
    startLoad(`Creating Concepts...`);
    const cleanInputs = { ...inputs, personalPhotos: [], brandLogos: inputs.brandLogos?.slice(0, 5) || [] };
    try {
      let res = unwrapGen(await gemini.generateConcepts(selectedTov, cleanInputs, resolvedUniverse, 'initial', '', globalRefinement));
      res = res ? normalizeFieldLabels(res) : res;
      if (!res || (!res.includes('CONCEPT_START') && !res.includes('SUBJECT_ACTION'))) {
        refundCredits('generateConcepts');
        showToast('Blueprint generation returned empty. Credits refunded.', 'error');
        return;
      }
      setConceptsText(res);
      setPhase('concept_review');
      updateHighestUnlocked('concept_review');
      awardMilestone('conceptsGenerated');
    } catch (e) { refundCredits('generateConcepts'); handleApiError(e); } finally { stopLoad(); }
  };

  const handlePrecisionConceptEdit = async (index: string) => {
    if (!inputs || !editFeedback) return;
    if (!deductCredits('editOneConcept')) return;
    const feedbackCopy = editFeedback;
    setActiveEditConceptIndex(null);
    setEditFeedback('');
    setItemLoading(prev => ({ ...prev, [`concept_${index}`]: true }));
    try {
      let res = unwrapGen(await gemini.generateConcepts(selectedTov, inputs, resolvedUniverse, 'precision', conceptsText, '', feedbackCopy, index));
      res = res ? normalizeFieldLabels(res) : res;
      if (res && (res.includes('CONCEPT_START') || res.includes('SUBJECT_ACTION'))) {
        setConceptsText(res);
        showToast(`Blueprint updated.`, "success");
      } else {
        refundCredits('editOneConcept');
        showToast('Edit returned empty result. Credits refunded.', 'error');
      }
    } catch (e) { refundCredits('editOneConcept'); handleApiError(e); } finally { setItemLoading(prev => ({ ...prev, [`concept_${index}`]: false })); }
  };

  const handleApproveConcept = async (conceptRaw: string) => {
    if (!inputs) return;
    // Normalize any Arabic field labels to English
    conceptRaw = normalizeFieldLabels(conceptRaw);

    // Determine sizes to render: use selectedSizes from Step 3 UI
    const sizesToRender = Array.from(selectedSizes);
    const primaryRatio = sizesToRender[0] || currentAspectRatio;
    const extraSizes = sizesToRender.slice(1);

    // Cost: generateImage per size
    const totalNeeded = CREDIT_COSTS.generateImage * sizesToRender.length;
    if (userCredits < totalNeeded) {
      setUpgradeReason(`You need ${totalNeeded} credits for ${sizesToRender.length} size${sizesToRender.length > 1 ? 's' : ''} but only have ${userCredits}.`);
      setShowUpgradeModal(true);
      return;
    }
    setSelectedConcept(conceptRaw);
    startLoad(`Rendering Masterpiece...`);
    // Clear old batch results so the new single render shows properly
    setBatchResults([]);
    setBatchRendering(false);

    // Deduct credits upfront
    const startingCredits = userCredits;
    const afterDeduction = startingCredits - totalNeeded;
    setUserCredits(afterDeduction);

    try {
      // Pass concept directly to image generation (no Step 3.5 build plan)
      const mockupResult = await gemini.generateFinalAd(conceptRaw, selectedTov, inputs, resolvedUniverse, primaryRatio);
      const mockup = mockupResult.image;
      setBuildPlan(conceptRaw);

      if (mockup) {
        pushMockup(mockup, primaryRatio);
        setVisualPolishes([]);
        // ─── SAVE RENDER FOR FEEDBACK (non-blocking — must not prevent phase transition) ─────────
        // Capture the freshly returned id locally; React state setter is async and the auto-reflow
        // loop below would otherwise read a stale renderGenerationId from the previous render.
        let savedGenId: string | null = null;
        if (user) {
          try {
            savedGenId = await feedbackService.saveGeneration(
              user.uid, inputs, 'render',
              { imageUrl: mockup || '', conceptText: conceptRaw.substring(0, 500) },
              conceptRaw, resolvedUniverse, 'gemini-3.1-flash-image', 0, primaryRatio, buildCreativeIdentity(),
              canUseWorkspaces ? activeWorkspaceId : null
            );
            setRenderGenerationId(savedGenId);
            if (loadedFavoriteId && savedGenId) {
              setFavUpdatePrompt({ phase: 'render', newGenId: savedGenId });
            }
          } catch (saveErr) {
            console.error('Non-blocking: failed to save render generation record:', saveErr);
          }
        }
        setPhase('render_studio');
        updateHighestUnlocked('render_studio');
        awardMilestone('designGenerated');

        // Auto-reflow to extra selected sizes from Step 3 — use local savedGenId (stable),
        // not renderGenerationId (state, async-updated).
        if (extraSizes.length > 0) {
          stopLoad();
          for (let ei = 0; ei < extraSizes.length; ei++) {
            const extraRatio = extraSizes[ei];
            startLoad(`Reflowing to ${extraRatio}... (${ei + 1}/${extraSizes.length})`);
            // Credits for this extra were pre-deducted in `totalNeeded` (line 3708).
            // Refund the deduction whenever the variant is NOT produced — whether the
            // callable succeeded with no image, returned success=false, threw, or was
            // skipped because no generation id was available. The UI balance must match
            // what the backend actually charged (reflowImage charges per-item only on
            // committed outcomes, so a missing/failed outcome means no backend charge).
            let variantProduced = false;
            try {
              await new Promise(r => setTimeout(r, 500));
              if (savedGenId) {
                const reflowFn = httpsCallable<ReflowImageRequest, ReflowImageResponse>(functions, 'reflowImage');
                const reflowRes = await reflowFn({
                  generationId: savedGenId,
                  targetAspectRatio: extraRatio as AspectRatio,
                  method: 'auto',
                  scope: 'single',
                });
                if (reflowRes.data.success && reflowRes.data.outcomes[0]?.outputUrl) {
                  pushMockup(reflowRes.data.outcomes[0].outputUrl, extraRatio as AspectRatio);
                  variantProduced = true;
                } else {
                  console.warn(`Auto-reflow to ${extraRatio} returned no image: success=${reflowRes.data.success}, errorCode=${reflowRes.data.outcomes[0]?.errorCode ?? 'none'}`);
                }
              } else {
                // No persisted generation id — reflowImage requires one (FR-029, FR-030 keep
                // reflows scoped to a source generation). Skip rather than fall back to a stale
                // renderGenerationId from a different render, which would reflow the wrong plan.
                console.warn(`Auto-reflow to ${extraRatio} skipped: no generation id available (saveGeneration failed or user not logged in).`);
              }
            } catch (e) {
              console.error(`Auto-reflow to ${extraRatio} failed:`, e);
            }
            if (!variantProduced) {
              setUserCredits(prev => prev + CREDIT_COSTS.generateImage);
              showToast(t('studio.reflow.refunded_extra').replace('{ratio}', extraRatio), 'info');
            }
          }
          showToast(`Rendered ${sizesToRender.length} sizes!`, 'success');
        }
      } else {
        // Refund credits on null response
        setUserCredits(startingCredits);
        const errorMessages: Record<string, string> = {
          'safety_blocked': 'Image blocked by content safety filter. Try adjusting your text or photos.',
          'validation_failed': 'Creative mode combination is invalid. Go back and adjust your settings.',
          'quality_rejected': 'Blueprint quality check failed. Try regenerating the blueprint.',
          'generation_failed': 'Image generation failed during processing. Try again.',
          'copy_fidelity_failed': 'Blueprint text didn\'t match the approved copy — please retry.',
        };
        const msg = errorMessages[mockupResult.errorCode || ''] || 'Image generation returned no result. Credits refunded.';
        showToast(msg, 'error');
      }
    } catch (e: any) {
      // Refund credits on error
      setUserCredits(startingCredits);
      handleApiError(e);
    } finally {
      stopLoad();
    }
  };

  // ─── BATCH RENDER — Agency: render all 3 concepts × 3 variants ────────────
  const handleBatchRender = async () => {
    if (!inputs) return;
    if (!canUse(userPlan, 'batchGeneration')) {
      showToast(`Batch generation requires ${requiredPlanFor('batchGeneration')} plan.`, 'error');
      return;
    }

    const batchConfig = PLANS[userPlan]?.batchConfig;
    if (batchConfig) {
      const numSizes = selectedSizes.size || 1;
      // Sum ACTUAL selected concepts across hook groups, not a hardcoded 3.
      const conceptCount = batchHookGroups.length > 0
        ? batchHookGroups.reduce((sum, g) => sum + (g.selectedConcepts?.size ?? 0), 0)
        : (singleSelectedConcepts.size || 1);
      const totalCombos = numSizes * conceptCount;
      if (totalCombos > batchConfig.maxAdsPerRun) {
        showToast(`Your plan allows up to ${batchConfig.maxAdsPerRun} ads per batch run. You requested ${totalCombos}.`, 'error');
        return;
      }
    }

    // Build combinations from batchHookGroups
    const combos: { hookKey: string; hookText: string; conceptIndex: number; conceptText: string }[] = [];

    if (batchHookGroups.length > 0) {
      // Batch mode: use per-hook concept groups
      for (const group of batchHookGroups) {
        const conceptNums = Array.from(group.selectedConcepts).sort();
        for (const n of conceptNums) {
          const cText = getConceptBlock(group.conceptsText, n);
          if (cText.trim()) {
            combos.push({ hookKey: group.hookKey, hookText: group.hookText, conceptIndex: n, conceptText: cText });
          }
        }
      }
    } else {
      // Single-hook fallback: only render user-selected concepts
      const selectedNums = singleSelectedConcepts.size > 0 ? Array.from(singleSelectedConcepts).sort() : [1, 2, 3];
      for (const n of selectedNums) {
        const cText = getConceptBlock(conceptsText, n);
        if (cText.trim()) {
          combos.push({ hookKey: 'S', hookText: selectedTov, conceptIndex: n, conceptText: cText });
        }
      }
    }

    if (combos.length === 0) { showToast('No concept combinations to render.', 'error'); return; }

    // Multi-size: determine primary size and extra sizes for reflow
    const allSizes = Array.from(selectedSizes);
    const primaryRatio = allSizes[0] || currentAspectRatio;
    const extraRatios = allSizes.slice(1);

    // Cost: each combo gets primary render + reflow for each extra size
    const perPrimaryCost = CREDIT_COSTS.generateImage;
    const perReflowCost = CREDIT_COSTS.generateImage;
    const totalCost = combos.length * (perPrimaryCost + extraRatios.length * perReflowCost);
    if (userCredits < totalCost) {
      setUpgradeReason(`${combos.length * allSizes.length} images need ${totalCost} credits but you have ${userCredits}.`);
      setShowUpgradeModal(true);
      return;
    }

    // Build initial batch results: one entry per combo per size
    const initial: BatchResult[] = [];
    const batchId = `batch_${Date.now()}`;
    const selectedModes = (inputs as any).offerCreativeMode || ['standard_hero'];
    const numFidelity = selectedModes.includes('value_stack') ? 'strict' as const : 'none' as const;
    // Derive contractVariant from the creative resolver
    const creativeSpec = resolveCreativeSpec({ selectedModes, hookAngle: inputs.coldHookAngle });
    const contractVariantKey = creativeSpec.resolvedLayoutKey;
    // Simple hash of offer facts for consistency tracking
    const factsStr = JSON.stringify({
      price: inputs.valueStackPrice, originalValue: inputs.valueStackOriginalValue,
      offerCardPrice: inputs.offerCardPrice, offerCardOldPrice: inputs.offerCardOldPrice,
    });
    const factsHash = Array.from(factsStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16);

    for (const c of combos) {
      for (const ratio of allSizes) {
        initial.push({
          conceptIndex: c.conceptIndex,
          variantIndex: initial.length + 1,
          conceptText: c.conceptText,
          hookKey: c.hookKey,
          hookText: c.hookText,
          buildPlan: '',
          url: null,
          ratio: ratio,
          status: 'pending' as const,
          imageId: `${batchId}_${c.hookKey}_c${c.conceptIndex}_${ratio.replace(':', 'x')}`,
          parentBatchId: batchId,
          selectedModes,
          contractVariant: contractVariantKey,
          numericFidelity: numFidelity,
          offerFactsHash: factsHash,
          localRefinement: undefined,
          localRefinementHistory: [],
        });
      }
    }

    setBatchResults(initial);
    setBatchRendering(true);
    setCurrentAspectRatio(primaryRatio);
    setPhase('render_studio');
    updateHighestUnlocked('render_studio');

    const newCredits = userCredits - totalCost;
    setUserCredits(newCredits);
    awardMilestone('designGenerated');

    // Render per combo: primary size first, then reflow to extra sizes
    let resultIdx = 0;
    for (let ci = 0; ci < combos.length; ci++) {
      const combo = combos[ci];
      let primaryUrl: string | null = null;

      // Primary render — concept text goes directly to image generation
      const primaryIdx = resultIdx;
      setBatchResults(prev => prev.map((r, idx) => idx === primaryIdx ? { ...r, status: 'rendering' } : r));
      try {
        const genResult = await gemini.generateFinalAd(combo.conceptText, combo.hookText, inputs, resolvedUniverse, primaryRatio);
        primaryUrl = genResult.image;
        setBatchResults(prev => prev.map((r, idx) => idx === primaryIdx ? { ...r, buildPlan: combo.conceptText, url: primaryUrl, status: primaryUrl ? 'done' : 'error' } : r));
      } catch (e) {
        console.error(`Batch render primary ${ci + 1} failed:`, e);
        setBatchResults(prev => prev.map((r, idx) => idx === primaryIdx ? { ...r, status: 'error' } : r));
      }
      resultIdx++;

      // Reflow to extra sizes
      for (let si = 0; si < extraRatios.length; si++) {
        const extraRatio = extraRatios[si];
        const reflowIdx = resultIdx;
        setBatchResults(prev => prev.map((r, idx) => idx === reflowIdx ? { ...r, status: 'rendering' } : r));

        if (primaryUrl) {
          try {
            await new Promise(r => setTimeout(r, 500));
            const reflowed = (await gemini.generateFinalAd(combo.conceptText, combo.hookText, inputs, resolvedUniverse, extraRatio, Object.assign("REFLOW ONLY — adapt this exact design to " + extraRatio + " ratio. Keep ALL text identical word-for-word. Keep the SAME hero, visual elements, colors, and composition. Fill the entire canvas proportionally — no large empty areas. The hero, headline, subheadline, CTA, benefit line, and all elements must be VISIBLE and properly sized for the new ratio. Scale and reposition elements to use the full canvas.", { _internalReflow: true }), primaryUrl)).image;
            setBatchResults(prev => prev.map((r, idx) => idx === reflowIdx ? { ...r, buildPlan: combo.conceptText, url: reflowed, status: reflowed ? 'done' : 'error' } : r));
          } catch (e) {
            console.error(`Batch reflow ${ci + 1} to ${extraRatio} failed:`, e);
            setBatchResults(prev => prev.map((r, idx) => idx === reflowIdx ? { ...r, status: 'error' } : r));
          }
        } else {
          // Primary failed, mark reflow as error too
          setBatchResults(prev => prev.map((r, idx) => idx === reflowIdx ? { ...r, status: 'error' } : r));
        }
        resultIdx++;
      }

      if (ci < combos.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    setBatchRendering(false);
  };

  // ─── BATCH RETRY — Retry a single failed/unwanted batch image ─────────────
  /**
   * Per-image retry: re-renders a single batch image independently.
   * mode='rerender' — new build plan + render (full retry)
   * mode='reflow' — keep existing build plan, re-render only (faster, preserves layout)
   * localRefinement — optional per-image instruction applied to this image only
   */
  const handleBatchRetry = async (index: number, retryMode: 'rerender' | 'reflow' = 'rerender', localRefinement?: string) => {
    if (!inputs || !selectedTov) return;
    const totalNeeded = CREDIT_COSTS.generateImage;
    if (userCredits < totalNeeded) {
      setUpgradeReason(`${retryMode === 'reflow' ? 'Reflow' : 'Retry'} needs ${totalNeeded} credits but you have ${userCredits}.`);
      setShowUpgradeModal(true);
      return;
    }

    const item = batchResults[index];
    if (!item) return;

    // Mark only THIS image as rendering — siblings untouched
    setBatchResults(prev => prev.map((r, idx) => idx === index ? { ...r, status: 'rendering', url: null } : r));

    // Deduct credits
    const newCredits = userCredits - totalNeeded;
    setUserCredits(newCredits);

    try {
      const itemRatio = item.ratio as AspectRatio;
      const isReflow = retryMode === 'reflow';
      // Build refinement instruction: combine local + any existing refinement
      const refinementNote = localRefinement?.trim()
        ? `LOCAL REFINEMENT (apply to THIS image only): ${localRefinement.trim()}`
        : '';

      const reflowInstruction = Object.assign(`REFLOW ONLY — adapt this exact design to ${itemRatio} ratio. Keep ALL text identical word-for-word. Keep the SAME hero, visual elements, colors, and composition. Fill the entire canvas proportionally — no large empty areas. The hero, headline, subheadline, CTA, benefit line, and all elements must be VISIBLE and properly sized for the new ratio. Scale and reposition elements to use the full canvas.${refinementNote ? ' ' + refinementNote : ''}`, { _internalReflow: true });
      const variationInstruction = `IMPORTANT: This is a RETRY — you MUST generate a DIFFERENT composition, layout, camera angle, and color palette from previous attempts. Vary the hero pose, background elements, and text placement while keeping the same concept and Arabic text strings. Do NOT reproduce the same design.${refinementNote ? ' ' + refinementNote : ''}`;
      const renderInstruction = isReflow ? reflowInstruction : variationInstruction;
      const sourceImage = isReflow && item.url ? item.url : undefined;
      const retryResult = await gemini.generateFinalAd(item.conceptText, item.hookText || selectedTov, inputs, resolvedUniverse, itemRatio, renderInstruction, sourceImage);
      const mockup = retryResult.image;

      // Update ONLY this image — siblings completely untouched
      setBatchResults(prev => prev.map((r, idx) => idx === index ? {
        ...r,
        buildPlan: item.conceptText,
        url: mockup,
        status: mockup ? 'done' as const : 'error' as const,
        localRefinement: localRefinement?.trim() || r.localRefinement,
        localRefinementHistory: localRefinement?.trim()
          ? [...(r.localRefinementHistory || []), localRefinement.trim()]
          : r.localRefinementHistory,
      } : r));
    } catch (e) {
      setBatchResults(prev => prev.map((r, idx) => idx === index ? { ...r, status: 'error' } : r));
      showToast('Retry failed. Credits refunded.', 'error');
      // Refund
      const refund = userCredits;
      setUserCredits(refund);
    }
  };

  // ─── CAROUSEL RENDER — Render N slides sequentially with style anchor ─────
  // ─── CAROUSEL: Render all slides using existing copies ─────────
  const handleCarouselRender = async (conceptRaw: string) => {
    if (!inputs || !selectedTov || carouselCopies.length === 0) return;
    const slideCount = carouselCopies.length;
    const perSlideCost = CREDIT_COSTS.generateImage;
    const totalNeeded = perSlideCost * slideCount;

    if (userCredits < totalNeeded) {
      setUpgradeReason(`Carousel (${slideCount} slides) needs ${totalNeeded} credits but you have ${userCredits}.`);
      setShowUpgradeModal(true);
      return;
    }

    setSelectedConcept(conceptRaw);
    setCarouselConceptRaw(conceptRaw);
    startLoad(`Rendering ${slideCount}-slide carousel...`);

    const initialSlides: CarouselSlide[] = carouselCopies.map((copy, i) => ({
      index: i + 1, copy, buildPlan: '', imageUrl: null, status: 'pending' as const,
    }));
    setCarouselSlides(initialSlides);

    // Deduct all credits upfront — we reconcile at the end
    const startingCredits = userCredits;
    const afterDeduction = startingCredits - totalNeeded;
    setUserCredits(afterDeduction);

    let anchorImage: string | null = null;
    let creditsActuallyUsed = 0;
    const cleanField = (s: string) => s.replace(/\|\|\|/g, '').trim();

    const buildSlide = async (i: number, styleRef?: string) => {
      const copy = carouselCopies[i];
      const isLastSlide = i === slideCount - 1;
      const txOverride: TextOverride = {
        hookText: cleanField(copy.hookText),
        subheadText: cleanField(copy.subheadText || ''),
        ctaName: isLastSlide ? cleanField(copy.ctaText || inputs.cta) : '',
        benefitText: isLastSlide ? cleanField(copy.benefitText || '') : '',
      };
      const slideInstruction = i === 0
        ? `This is SLIDE 1 (the HOOK slide) of a ${slideCount}-slide carousel. Hero pose: CONFIDENT STANCE — arms relaxed, looking at camera or slightly off-camera. NO pointing.`
        : i === slideCount - 1
          ? `This is SLIDE ${i + 1} (FINAL SLIDE) of ${slideCount}. MAINTAIN EXACT SAME visual style as Slide 1. Hero pose: INVITING GESTURE — open palm toward camera, welcoming. This slide HAS a CTA button. Show logo ONLY on this final slide.`
          : `This is SLIDE ${i + 1} of ${slideCount}. MAINTAIN EXACT SAME visual style as Slide 1. Hero pose: ${['THOUGHTFUL — hand on chin, looking contemplative', 'ACTIVE — leaning forward slightly, engaged expression', 'CONVERSATIONAL — relaxed, one hand gesturing naturally to the side', 'PROFESSIONAL — arms crossed confidently, slight smile', 'DYNAMIC — walking pose, captured mid-stride'][i % 5]}. NO pointing finger. NO CTA button on this slide. NO logo on this slide. NO promo badge on this slide.`;
      setCarouselSlides(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'rendering' } : s));
      const slideConceptText = conceptRaw + `\n\n[CAROUSEL SLIDE ${i + 1}/${slideCount}]: ${slideInstruction}`;
      const mockup: string | null = (await gemini.generateFinalAd(
        slideConceptText, selectedTov, inputs, resolvedUniverse, currentAspectRatio,
        undefined, undefined, styleRef, txOverride
      )).image;
      setCarouselSlides(prev => prev.map((s, idx) => idx === i ? { ...s, buildPlan: slideConceptText, imageUrl: mockup, status: mockup ? 'done' : 'error' } : s));
      if (mockup) creditsActuallyUsed += perSlideCost;
      return mockup;
    };

    try {
      // ── PHASE 1: Render Slide 1 (anchor) sequentially ──
      const slide1Result = await buildSlide(0);
      if (slide1Result) anchorImage = slide1Result;

      // ── PHASE 2: Render slides 2-N in PARALLEL (staggered 2s apart to avoid rate limits) ──
      if (slideCount > 1) {
        const parallelPromises = [];
        for (let i = 1; i < slideCount; i++) {
          // Stagger starts by 2s each to avoid Gemini rate limits
          const delay = (i - 1) * 2000;
          parallelPromises.push(
            new Promise<void>(resolve => setTimeout(async () => {
              try { await buildSlide(i, anchorImage || undefined); } catch (e) {
                setCarouselSlides(prev => prev.map((s, idx) => idx === i ? { ...s, status: 'error' } : s));
              }
              resolve();
            }, delay))
          );
        }
        await Promise.all(parallelPromises);
      }

      setPhase('render_studio');
      updateHighestUnlocked('render_studio');
      awardMilestone('designGenerated');
    } catch (e: any) {
      handleApiError(e);
    } finally {
      // ── CREDIT RECONCILIATION ──
      // Refund credits for any slides that failed (null) or never rendered (crash)
      const refundAmount = totalNeeded - creditsActuallyUsed;
      if (refundAmount > 0) {
        const finalCredits = startingCredits - creditsActuallyUsed;
        setUserCredits(finalCredits);
        showToast(`${refundAmount} credits refunded for failed/unrendered slides.`, 'error');
      }
      stopLoad();
    }
  };
  // ─── CAROUSEL: Regenerate a single slide ─────────────────────────────
  const handleCarouselSlideRetry = async (slideIndex: number) => {
    if (!inputs || !selectedTov || !carouselConceptRaw) return;
    const totalNeeded = CREDIT_COSTS.generateImage;
    if (userCredits < totalNeeded) {
      setUpgradeReason(`Regenerating 1 slide needs ${totalNeeded} credits.`);
      setShowUpgradeModal(true);
      return;
    }

    const startingCredits = userCredits;
    const afterDeduction = startingCredits - totalNeeded;
    setUserCredits(afterDeduction);

    setCarouselSlides(prev => prev.map((s, idx) => idx === slideIndex ? { ...s, status: 'rendering' } : s));

    let success = false;

    try {
      const copy = carouselCopies[slideIndex];
      const isLastSlide = slideIndex === carouselCopies.length - 1;
      const txOverride: TextOverride = {
        hookText: (copy.hookText || '').replace(/\|\|\|/g, '').trim(),
        subheadText: (copy.subheadText || '').replace(/\|\|\|/g, '').trim(),
        ctaName: isLastSlide ? (copy.ctaText || inputs.cta).replace(/\|\|\|/g, '').trim() : '',
        benefitText: isLastSlide ? (copy.benefitText || '').replace(/\|\|\|/g, '').trim() : '',
      };

      const slideCount = carouselCopies.length;
      const isLastSlideRetry = slideIndex === slideCount - 1;
      const slideInstruction = slideIndex === 0
        ? `This is SLIDE 1 (the HOOK slide) of a ${slideCount}-slide carousel. Hero pose: CONFIDENT STANCE — arms relaxed, looking at camera. NO pointing.`
        : isLastSlideRetry
          ? `This is SLIDE ${slideIndex + 1} (FINAL SLIDE) of ${slideCount}. MAINTAIN EXACT SAME visual style as Slide 1. Hero pose: INVITING GESTURE — open palm. This slide HAS a CTA button. Show logo ONLY on this final slide.`
          : `This is SLIDE ${slideIndex + 1} of ${slideCount}. MAINTAIN EXACT SAME visual style as Slide 1. Hero pose: VARIED — different from slide 1. NO pointing. NO CTA button. NO logo. NO promo badge.`;

      const slideConceptText = carouselConceptRaw + `\n\n[CAROUSEL SLIDE ${slideIndex + 1}/${slideCount}]: ${slideInstruction}`;

      // Use slide 1 as style reference for slides 2+
      const anchorImage = slideIndex > 0 ? carouselSlides[0]?.imageUrl : undefined;

      const mockup = (await gemini.generateFinalAd(
        slideConceptText, selectedTov, inputs, resolvedUniverse, currentAspectRatio,
        undefined, undefined, anchorImage || undefined, txOverride
      )).image;

      if (mockup) {
        success = true;
      }

      setCarouselSlides(prev => prev.map((s, idx) => idx === slideIndex ? { ...s, buildPlan: slideConceptText, imageUrl: mockup, status: mockup ? 'done' : 'error' } : s));
    } catch (e: any) {
      handleApiError(e);
      setCarouselSlides(prev => prev.map((s, idx) => idx === slideIndex ? { ...s, status: 'error' } : s));
    } finally {
      // ── CREDIT RECONCILIATION ──
      if (!success) {
        setUserCredits(startingCredits);
        showToast(`Slide ${slideIndex + 1} failed. ${totalNeeded} credits refunded.`, 'error');
      }
    }
  };

  // ─── CAROUSEL: Edit a single slide's copy ─────────────────────────────
  const updateCarouselCopy = (index: number, field: keyof CarouselSlideCopy, value: string) => {
    setCarouselCopies(prev => prev.map((c, i) => i === index ? { ...c, [field]: value } : c));
  };

  const moveCarouselSlide = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    setCarouselCopies(prev => {
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      const arr = [...prev];
      [arr[fromIndex], arr[toIndex]] = [arr[toIndex], arr[fromIndex]];
      return arr;
    });
  };

  const deleteCarouselSlide = (index: number) => {
    if (carouselCopies.length <= 2) return; // Min 2 slides
    setCarouselCopies(prev => prev.filter((_, i) => i !== index));
  };

  const addCarouselSlide = (afterIndex: number) => {
    const maxSlides = getMaxSlides(userPlan);
    if (carouselCopies.length >= maxSlides) {
      showToast(`Max ${maxSlides} slides on ${userPlan} plan. Upgrade for more.`, 'error');
      setUpgradeReason(`You need more slides (max ${maxSlides} on ${userPlan})`);
      setShowUpgradeModal(true);
      return;
    }
    setCarouselCopies(prev => {
      const newSlide: CarouselSlideCopy = { hookText: '', subheadText: '', ctaText: '', benefitText: '' };
      const arr = [...prev];
      arr.splice(afterIndex + 1, 0, newSlide);
      return arr;
    });
  };

  // --- PASTE THIS INSIDE App.tsx (Around line 330, near other handlers) ---

  const handleAnalyzePolishes = async () => {
    if (!currentMockup || !inputs) return;
    if (!canUse(userPlan, 'visualPolishes')) {
      showToast(`Auto-Optimized Creatives unlock on ${requiredPlanFor('visualPolishes')} plan.`, 'error');
      return;
    }
    if (!deductCredits('analyzePolishes')) return;

    startLoad("AI is Critiquing Design...");
    try {
      const polishes = await gemini.generateVisualPolishes(currentRawBase64 || currentMockup, inputs);
      setVisualPolishes(polishes);
      showToast("Analysis Complete. Select adjustments below.", "success");
    } catch (e) {
      refundCredits('analyzePolishes');
      handleApiError(e);
    } finally {
      stopLoad();
    }
  };

  const handleApplyStudioPolishes = async () => {
    if (!inputs || !buildPlan || !selectedTov || !currentMockup) return;
    if (!deductCredits('polishImage')) return;
    const combinedInstructions = [
      ...Array.from(selectedPolishIds).map(id => visualPolishes.find(p => p.id === id)?.instruction),
      studioTweak
    ].filter(Boolean).join(". ");
    // CRITICAL: Use displayRatio (from the currently viewed history item), NOT currentAspectRatio
    // which may point to a different size than what the user is actually looking at.
    const editRatio = displayRatio as AspectRatio;
    startLoad(editTarget ? `Editing ${editTarget.label}...` : "Applying Refinement...");
    try {
      const res = (await gemini.generateFinalAd(buildPlan, selectedTov, inputs, resolvedUniverse, editRatio, combinedInstructions, (currentRawBase64 || currentMockup) || undefined)).image;

      // ═══ WRITE-BACK: Route result to correct source ═══
      if (editTarget && res) {
        if (editTarget.source === 'batch') {
          // Write back to the exact batch result
          setBatchResults(prev => prev.map((r, i) => i === editTarget.index ? { ...r, url: res, status: 'done' as const } : r));
          showToast(`${editTarget.label} updated!`, 'success');
        } else if (editTarget.source === 'carousel') {
          // Write back to the exact carousel slide
          setCarouselSlides(prev => prev.map((s, i) => i === editTarget.index ? { ...s, imageUrl: res, status: 'done' as const } : s));
          showToast(`${editTarget.label} updated!`, 'success');
        } else if (editTarget.source === 'ab') {
          // Write back to the exact A/B variation
          setAbVariations(prev => prev.map((v, i) => i === editTarget.index ? { ...v, url: res, status: 'done' as const } : v));
          showToast(`${editTarget.label} updated!`, 'success');
        } else {
          // Default: add to history
          pushMockup(res, editRatio);
        }
        setEditTarget(null); // Clear edit binding
      } else {
        pushMockup(res, editRatio);
      }

      setStudioTweak('');
      setSelectedPolishIds(new Set());
      // Save polished render for feedback/favorites (non-blocking)
      if (user && res) {
        try {
          const genId = await feedbackService.saveGeneration(
            user.uid, inputs, 'render',
            { imageUrl: res, conceptText: (selectedConcept || '').substring(0, 500) },
            buildPlan, resolvedUniverse, 'gemini-3.1-flash-image', 0, editRatio, buildCreativeIdentity(),
            canUseWorkspaces ? activeWorkspaceId : null
          );
          if (genId) {
            setRenderGenerationId(genId);
            if (loadedFavoriteId) setFavUpdatePrompt({ phase: 'render', newGenId: genId });
          }
        } catch (saveErr) {
          console.error('Non-blocking: failed to save polish render record:', saveErr);
        }
      }
    } catch (e) { refundCredits('polishImage'); handleApiError(e); } finally { stopLoad(); }
  };

  // Updated Handler to support Refinement
  const handleGenerateCaption = async (isRefinement = false) => {
    // Support both single mode (currentMockup) and carousel mode (first slide image)
    const mockupForCaption = currentMockup || carouselSlides.find(s => s.status === 'done')?.imageUrl || null;
    if (!mockupForCaption || !selectedTov || !inputs) return;
    if (!deductCredits(isRefinement ? 'refineCaption' : 'generateCaption')) return;

    const loadingMessage = isRefinement ? "Refining Script..." : "Writing Copy...";
    startLoad(loadingMessage);

    try {
      // Extract visual metaphor from the concept text (supports Arabic and English markers)
      const visualMetaphor = getSection(normalizeFieldLabels(selectedConcept), "SUBJECT_ACTION:", "BRANDING_LOGIC:")
        || "A professional hero scene";

      // For carousel: pass all slide copies as extra context
      const carouselContext = carouselCopies.length > 1
        ? carouselCopies.map((c, i) => `Slide ${i + 1}: ${c.hookText}${c.subheadText ? ' — ' + c.subheadText : ''}`).join('\n')
        : undefined;

      const res = unwrapGen(await gemini.generateCaption(
        mockupForCaption,
        inputs,
        visualMetaphor,
        selectedTov,
        isRefinement ? captionRefinement : undefined,
        carouselContext,
        buildPlan || undefined
      ));

      if (res) {
        setCaptionText(res);
        setCaptionRefinement(''); // Clear input after success
        // Save caption to generations for feedback tracking
        if (user?.uid) {
          try {
            const genId = await feedbackService.saveGeneration(
              user.uid, inputs, 'caption',
              { captionText: res },
              res, '', 'gemini-3-flash', 0, undefined, buildCreativeIdentity(),
              canUseWorkspaces ? activeWorkspaceId : null
            );
            setCaptionGenerationId(genId);
            if (loadedFavoriteId && genId) {
              setFavUpdatePrompt({ phase: 'caption', newGenId: genId });
            }
          } catch (e) { console.warn('Caption generation save failed (non-blocking):', e); }
        }
      }
      setPhase('primary_text');
      updateHighestUnlocked('primary_text');
      awardMilestone('copyGenerated');
    } catch (e) {
      refundCredits(isRefinement ? 'refineCaption' : 'generateCaption');
      handleApiError(e);
    } finally {
      stopLoad();
    }
  };

  // ─── BATCH CAPTION GENERATION — 1 copy per hook ─────────────────────
  const handleBatchCaptions = async () => {
    if (!inputs || batchHookGroups.length === 0) return;

    // Find a rendered mockup to use as visual context
    const mockupForCaption = batchResults.find(r => r.url)?.url || currentMockup || null;
    if (!mockupForCaption) {
      showToast('Need at least 1 rendered image to generate copy.', 'error');
      return;
    }

    const hookCount = batchHookGroups.length;
    const totalCost = hookCount * (CREDIT_COSTS.generateCaption || 1);
    if (userCredits < totalCost) {
      setUpgradeReason(`${hookCount} ad copies need ${totalCost} credits.`);
      setShowUpgradeModal(true);
      return;
    }

    // Initialize batch captions
    const initial = batchHookGroups.map(g => ({
      hookKey: g.hookKey,
      hookText: g.hookText,
      captionText: '',
    }));
    setBatchCaptions(initial);
    setActiveBatchCaptionKey(initial[0]?.hookKey || '');
    setPhase('primary_text');
    updateHighestUnlocked('primary_text');

    // Deduct all credits upfront via server-authoritative flow
    for (let c = 0; c < hookCount; c++) {
      if (!deductCredits('generateCaption')) {
        showToast(`Only had credits for ${c} captions. Generating those...`, 'error');
        break;
      }
    }

    // Generate sequentially per hook
    for (let i = 0; i < batchHookGroups.length; i++) {
      const group = batchHookGroups[i];
      startLoad(`Writing copy ${i + 1}/${hookCount} — Hook ${group.hookKey}...`);

      try {
        const visualMetaphor = group.conceptsText
          ? (getSection(getConceptBlock(group.conceptsText, 1), "SUBJECT_ACTION:", "ENVIRONMENT_DESC:") || "A professional hero scene")
          : "A professional hero scene";

        const res = unwrapGen(await gemini.generateCaption(
          mockupForCaption,
          inputs,
          visualMetaphor,
          group.hookText,
          undefined,
          undefined,
          batchResults.find(r => r.url)?.buildPlan || buildPlan || undefined
        ));

        if (res) {
          setBatchCaptions(prev => prev.map((c, idx) => idx === i ? { ...c, captionText: res } : c));
          // Also set first caption as the main captionText for backward compat
          if (i === 0) {
            setCaptionText(res);
            // Save first caption generation for feedback
            if (user?.uid) {
              try {
                const genId = await feedbackService.saveGeneration(
                  user.uid, inputs, 'caption',
                  { captionText: res },
                  res, '', 'gemini-3-flash', 0, undefined, buildCreativeIdentity(),
                  canUseWorkspaces ? activeWorkspaceId : null
                );
                setCaptionGenerationId(genId);
              } catch (e) { console.warn('Batch caption save failed:', e); }
            }
          }
        }
      } catch (e) {
        console.error(`Caption for hook ${group.hookKey} failed:`, e);
        setBatchCaptions(prev => prev.map((c, idx) => idx === i ? { ...c, captionText: '⚠️ Generation failed — try refining individually.' } : c));
      }

      if (i < batchHookGroups.length - 1) await new Promise(r => setTimeout(r, 500));
    }

    stopLoad();
    awardMilestone('copyGenerated');
    showToast(`${hookCount} ad copies generated!`, 'success');
  };

  const handleRescale = async (newRatio: AspectRatio) => {
    if (!inputs || !selectedTov) return;
    if (!canUseRatio(userPlan, newRatio)) {
      showToast(`${newRatio} ratio requires ${requiredPlanForRatio(newRatio)} plan or above.`, 'error');
      return;
    }

    // ─── CAROUSEL MODE: Reflow ALL slides via reflowImage callable (HOTFIX-F) ─────
    if (carouselSlides.length > 0 && carouselSlides.some(s => s.status === 'done')) {
      const doneSlides = carouselSlides.filter(s => s.status === 'done' && s.imageUrl);
      const totalCost = CREDIT_COSTS.reflowImage * doneSlides.length;
      if (userCredits < totalCost) {
        setUpgradeReason(t('studio.reflow.upgrade_carousel_credits')
          .replace('{count}', String(doneSlides.length))
          .replace('{cost}', String(totalCost))
          .replace('{have}', String(userCredits)));
        setShowUpgradeModal(true);
        return;
      }
      setCurrentAspectRatio(newRatio);
      startLoad(t('studio.reflow.loading_carousel')
        .replace('{count}', String(doneSlides.length))
        .replace('{ratio}', newRatio));
      // Optimistic UI-only decrement: the reflowImage callable performs the authoritative
      // atomic deduction backend-side, so we MUST NOT call deductCredits() here (it would
      // hit deductCreditsServer and double-bill). After the callable returns, reconcile
      // the displayed balance with the actual charge from result.data.totalCreditsCharged.
      const optimisticCost = renderGenerationId ? CREDIT_COSTS.reflowImage * doneSlides.length : 0;
      if (renderGenerationId) {
        if (userCredits < optimisticCost) {
          setUpgradeReason(t('studio.reflow.upgrade_single_credits')
            .replace('{cost}', String(optimisticCost))
            .replace('{have}', String(userCredits)));
          setShowUpgradeModal(true);
          stopLoad();
          return;
        }
        setUserCredits(prev => prev - optimisticCost);
      }
      try {
        if (renderGenerationId) {
          const reflowFn = httpsCallable<ReflowImageRequest, ReflowImageResponse>(functions, 'reflowImage');
          const result = await reflowFn({
            generationId: renderGenerationId,
            targetAspectRatio: newRatio,
            method: reflowMethod,
            scope: 'carousel_all',
          });
          // Reconcile: replace the optimistic estimate with the actual charge reported
          // by the backend (covers fallback-routed items charging at outpaint vs rerender,
          // partial failures that aren't billed, no-op short-circuits, etc.).
          if (typeof result.data.totalCreditsCharged === 'number') {
            const delta = optimisticCost - result.data.totalCreditsCharged;
            if (delta !== 0) setUserCredits(prev => prev + delta);
          }
          if (result.data.success) {
            // Carousel reflows update slide state only — do NOT push every slide into the
            // single-image mockupHistory (would advance historyIndex/currentMockup with
            // intermediate carousel outputs and confuse the back/forward UI). The user's
            // active selection drives any single-image history changes elsewhere.
            for (const outcome of result.data.outcomes) {
              if (outcome.success && outcome.outputUrl && outcome.itemIndex !== null) {
                const slideIdx = outcome.itemIndex;
                setCarouselSlides(prev => prev.map((s, idx) => idx === slideIdx ? { ...s, imageUrl: outcome.outputUrl, status: 'done' as const } : s));
              } else if (!outcome.success && outcome.itemIndex !== null) {
                setCarouselSlides(prev => prev.map((s, idx) => idx === outcome.itemIndex ? { ...s, status: 'error' as const } : s));
              }
            }
          }
        } else {
          for (const slide of carouselSlides) {
            if (slide.status !== 'done' || !slide.imageUrl) continue;
            const slideIdx = slide.index - 1;
            setCarouselSlides(prev => prev.map((s, idx) => idx === slideIdx ? { ...s, status: 'rendering' } : s));
            const copy = carouselCopies[slideIdx];
            const isLastSlide = slideIdx === carouselCopies.length - 1;
            const txOverride: TextOverride = {
              hookText: (copy?.hookText || '').replace(/\|\|\|/g, '').trim(),
              subheadText: (copy?.subheadText || '').replace(/\|\|\|/g, '').trim(),
              ctaName: isLastSlide ? (copy?.ctaText || inputs.cta).replace(/\|\|\|/g, '').trim() : '',
              benefitText: isLastSlide ? (copy?.benefitText || '').replace(/\|\|\|/g, '').trim() : '',
            };
            try {
              if (!deductCredits('reflowImage')) break;
              const res = (await gemini.generateFinalAd(
                slide.buildPlan, selectedTov, inputs, resolvedUniverse, newRatio,
                Object.assign("REFLOW ONLY — adapt this exact design to " + newRatio + " ratio. Keep ALL text identical word-for-word. Keep the SAME hero, visual elements, colors, and composition. Fill the entire canvas proportionally — no large empty areas. The hero, headline, subheadline, CTA, benefit line, and all elements must be VISIBLE and properly sized for the new ratio. Scale and reposition elements to use the full canvas.", { _internalReflow: true }), slide.imageUrl, undefined, txOverride
              )).image;
              setCarouselSlides(prev => prev.map((s, idx) => idx === slideIdx ? { ...s, imageUrl: res, status: res ? 'done' : 'error' } : s));
            } catch {
              refundCredits('reflowImage');
              setCarouselSlides(prev => prev.map((s, idx) => idx === slideIdx ? { ...s, status: 'error' } : s));
            }
            if (slide.index < carouselSlides.length) await new Promise(r => setTimeout(r, 500));
          }
        }
      } catch (e) {
        // Restore optimistic decrement on transport / callable exception.
        if (optimisticCost > 0) setUserCredits(prev => prev + optimisticCost);
        handleApiError(e);
      } finally { stopLoad(); }
      return;
    }

    // ─── SINGLE MODE: Reflow one image via reflowImage callable (HOTFIX-F) ─────
    if (!selectedConcept || !currentMockup || !buildPlan) return;
    setCurrentAspectRatio(newRatio);
    startLoad(t('studio.reflow.loading_single').replace('{ratio}', newRatio));
    // Optimistic UI-only decrement (callable backend performs the authoritative deduction;
    // calling deductCredits() here would invoke deductCreditsServer and double-bill).
    const singleOptimisticCost = renderGenerationId ? CREDIT_COSTS.reflowImage : 0;
    if (renderGenerationId) {
      if (userCredits < singleOptimisticCost) {
        setUpgradeReason(t('studio.reflow.upgrade_single_credits')
          .replace('{cost}', String(singleOptimisticCost))
          .replace('{have}', String(userCredits)));
        setShowUpgradeModal(true);
        stopLoad();
        return;
      }
      setUserCredits(prev => prev - singleOptimisticCost);
    } else {
      // Legacy fallback (image-only, no generation id) still uses the old metered path
      // because gemini.generateFinalAd does NOT charge backend-side; the frontend deducts here.
      if (!deductCredits('reflowImage')) { stopLoad(); return; }
    }
    try {
      if (renderGenerationId) {
        const reflowFn = httpsCallable<ReflowImageRequest, ReflowImageResponse>(functions, 'reflowImage');
        const result = await reflowFn({
          generationId: renderGenerationId,
          targetAspectRatio: newRatio,
          method: reflowMethod,
          scope: 'single',
        });
        // Reconcile optimistic estimate with the actual backend charge.
        if (typeof result.data.totalCreditsCharged === 'number') {
          const delta = singleOptimisticCost - result.data.totalCreditsCharged;
          if (delta !== 0) setUserCredits(prev => prev + delta);
        }
        if (result.data.success && result.data.outcomes[0]?.outputUrl) {
          pushMockup(result.data.outcomes[0].outputUrl, newRatio);
        } else {
          throw new Error(result.data.outcomes[0]?.errorMessage || 'Reflow returned no image');
        }
      } else {
        const res = (await gemini.generateFinalAd(buildPlan, selectedTov, inputs, resolvedUniverse, newRatio, "REFLOW ONLY — adapt this exact design to " + newRatio + " ratio. Keep ALL text identical word-for-word. Keep the SAME hero, visual elements, colors, and composition. Fill the entire canvas proportionally — no large empty areas. The hero, headline, subheadline, CTA, benefit line, and all elements must be VISIBLE and properly sized for the new ratio. Scale and reposition elements to use the full canvas.", (currentRawBase64 || currentMockup) || undefined)).image;
        pushMockup(res, newRatio);
      }
    } catch (e) {
      if (renderGenerationId) {
        // Restore optimistic UI decrement on callable exception.
        if (singleOptimisticCost > 0) setUserCredits(prev => prev + singleOptimisticCost);
      } else {
        refundCredits('reflowImage');
      }
      handleApiError(e);
    } finally { stopLoad(); }
  };

  // ═══ SHARED HELPERS: Deployment metadata + Design favorite ═══
  const buildDeploymentMeta = (extra?: Record<string, any>) => {
    const modes = (inputs as any)?.offerCreativeMode || ['standard_hero'];
    const spec = inputs ? resolveCreativeSpec({ selectedModes: modes, hookAngle: inputs.coldHookAngle }) : null;
    const numFidelity = modes.some((m: string) => ['value_stack', 'premium_package'].includes(m)) ? 'strict' : 'none';
    const factsStr = JSON.stringify({
      p: inputs?.valueStackPrice, ov: inputs?.valueStackOriginalValue,
      op: inputs?.offerCardPrice, oop: inputs?.offerCardOldPrice,
    });
    const factsHash = Array.from(factsStr).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0).toString(16);
    return {
      projectId: currentProjectId || undefined,
      hookMetadata: {
        angle: inputs?.coldHookAngle || undefined,
        type: inputs?.hookType || undefined,
        text: getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 100) || undefined,
      },
      conceptMetadata: {
        text: (selectedConcept || '').substring(0, 300) || undefined,
      },
      copySnapshot: {
        headline: getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 100) || undefined,
        subhead: getSection(selectedTov, "SUBHEADLINE:", "CTA_BUTTON:").replace(/\*\*/g, '').trim().substring(0, 100) || undefined,
        cta: inputs?.cta || undefined,
      },
      language: inputs?.adLanguage || undefined,
      mode: inputs?.adMode || 'single',
      ratio: currentAspectRatio || undefined,
      format: inputs?.campaignType || 'cold',
      // ─── Creative identity fields for deployment chain ───
      selectedModes: modes,
      contractTemplateId: spec?.resolvedLayoutKey || undefined,
      numericFidelity: numFidelity,
      offerFactsHash: factsHash,
      workspaceId: canUseWorkspaces ? activeWorkspaceId : null,
      ...(extra || {}),
    };
  };

  const saveDesignFavorite = async (imageUrl: string, ratio: AspectRatio, conceptText?: string, hookText?: string, bPlan?: string) => {
    if (!user?.uid || !inputs) return;
    try {
      const genId = await feedbackService.saveGeneration(
        user.uid, inputs, 'render',
        { imageUrl, conceptText: (conceptText || selectedConcept || '').substring(0, 500), hookText: (hookText || '').substring(0, 200) },
        bPlan || buildPlan || '', resolvedUniverse, 'gemini-flash', 0, ratio, buildCreativeIdentity(),
        canUseWorkspaces ? activeWorkspaceId : null
      );
      if (genId) {
        await feedbackService.toggleFavorite(genId, true);
        showToast('Design saved to favorites!', 'success');
      }
    } catch { showToast('Failed to save favorite', 'error'); }
  };

  /** Apply watermark to a base64/data-url image if trial user. Returns a Promise resolving to the (possibly watermarked) URL. */
  const applyTrialWatermark = async (imageUrl: string): Promise<string> => {
    if (!showBranding(userPlan, isTrialUser)) return imageUrl;
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        // Diagonal watermark
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(-Math.PI / 6);
        ctx.font = `bold ${Math.max(24, canvas.width / 12)}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Pro Ads AI — Trial', 0, 0);
        ctx.restore();
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(imageUrl);
      img.src = imageUrl;
    });
  };

  const handleDownload = async () => {
    const downloadable = currentRawBase64 || currentMockup;
    if (!downloadable) return;

    // Build ad-account-ready filename: ProductName_Cold/Retargeting_Universe_HookKeyword
    const product = (inputs?.productName || 'ad').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').replace(/-+/g, '-').substring(0, 30);
    const campaign = inputs?.campaignType === 'retargeting' ? 'Retargeting' : 'Cold';
    const universe = (resolvedUniverse || 'default').replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/ +/g, '-').substring(0, 25);
    // Extract first meaningful line from selected hook as keyword
    const hookLine = (selectedTov || '').split('\n').find(l => l.includes('HEADLINE:'))?.replace(/.*HEADLINE:\s*/, '').trim() || '';
    const hookKeyword = hookLine.replace(/[^a-zA-Z0-9\u0600-\u06FF ]/g, '').replace(/ +/g, '-').substring(0, 30) || 'v1';
    const ratio = currentAspectRatio.replace(':', 'x');
    const filename = `${product}_${campaign}_${universe}_${hookKeyword}_${ratio}.png`;

    const finalUrl = await applyTrialWatermark(downloadable);
    const link = document.createElement('a');
    link.href = finalUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (view === 'privacy') return <PrivacyPolicy onBack={() => setView('app')} />;

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`min-h-screen bg-slate-950 text-slate-200 overflow-x-hidden flex flex-col transition-all duration-500 ${lang === 'ar' ? 'font-arabic' : ''}`} style={{ paddingLeft: showSidebar && lang !== 'ar' ? '320px' : '0', paddingRight: showSidebar && lang === 'ar' ? '320px' : '0' }}>
      <ToastNotification toast={toast} onClose={() => setToast(null)} />
      {/* VIDEO POPUP — first-time tutorial */}
      {showVideoPopup && <VideoPopup onComplete={handleVideoComplete} onClose={handleVideoSkip} />}
      {/* WALKTHROUGH OVERLAY — first-time guide */}
      {showWalkthrough && (
        <SpotlightTour
          steps={[
            { selector: '[data-tour="stepper"]', title: 'Your progress', desc: 'Track your progress across 5 steps. Each step unlocks after completing the previous one. You can click any unlocked step to jump back.', position: 'bottom' },
            { selector: '[data-tour="credits"]', title: 'Credits balance', desc: 'Each action (hooks, blueprints, renders, scripts) costs credits. Keep an eye on your balance here. Click + to top up.', position: 'bottom' },
            { selector: '[data-tour="product-name"]', title: 'Name your product', desc: 'Enter the name of your product, service, or brand. This is the foundation of every ad we generate.', position: 'bottom' },
            { selector: '[data-tour="target-avatar"]', title: 'Define your audience', desc: 'Who is your ideal customer? Be specific — "Freelancers under $5k/mo" is better than "Everyone".', position: 'bottom' },
            { selector: '[data-tour="challenge"]', title: 'Their core pain', desc: 'What problem keeps your audience stuck? This becomes the emotional hook of your ad.', position: 'top' },
            { selector: '[data-tour="transformation"]', title: 'The promised result', desc: 'What does life look like AFTER they use your product? Paint a vivid picture of success.', position: 'top' },
            { selector: '[data-tour="photos"]', title: 'Upload your photos', desc: 'Add hero photos of yourself or your client. The AI will place them into professional ad compositions.', position: 'top' },
            { selector: '[data-tour="submit"]', title: 'Launch the engine', desc: 'When your brief is ready, click here. The AI will generate hooks, blueprints, and visuals — all in one flow.', position: 'top' },
            { selector: '[data-tour="sidebar-menu"]', title: 'Menu & Dashboard', desc: 'Open this menu to access Performance Dashboard (analytics by hook angle, tone, strategy), Favorites, Team management, Meta Ads connection, and billing.', position: 'bottom' },
          ]}
          onComplete={handleTourComplete}
        />
      )}

      {/* SIDEBAR DRAWER */}
      <div className={`fixed top-0 ${lang === 'ar' ? 'right-0 border-l' : 'left-0 border-r'} h-full w-80 bg-slate-900 border-slate-800 z-[70] transform transition-transform duration-300 ${showSidebar ? 'translate-x-0' : lang === 'ar' ? 'translate-x-full' : '-translate-x-full'} flex flex-col`}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <span className="text-xs font-black uppercase tracking-widest text-slate-400">Menu</span>
          <button onClick={() => setShowSidebar(false)} className="text-slate-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
        </div>

        {/* New Project */}
        <div className="p-4">
          <button onClick={createNewProject} className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg">
            <i className="fa-solid fa-plus"></i><span>{t('sidebar.new')}</span>
          </button>
        </div>

        {/* Earn Credits */}
        <EarnCreditsPanel milestones={milestones} onWatchVideo={() => { setShowSidebar(false); setShowVideoPopup(true); }} />

        {/* Navigation */}
        <div className="px-4 flex-1 overflow-y-auto custom-scrollbar">
          {/* Watch Demo — always accessible */}
          <button onClick={() => { setShowSidebar(false); setShowVideoPopup(true); }} className="w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-xl text-left bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/15 hover:border-blue-500/30 transition-all group">
            <span className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center"><i className="fa-solid fa-play text-blue-400 text-sm"></i></span>
            <div className="flex-1">
              <p className="text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors">Watch Demo</p>
              <p className="text-[8px] text-slate-500">Learn how to create ads in minutes</p>
            </div>
            {!milestones.watchVideo && <span className="text-[7px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">+2 <i className="fa-solid fa-coins text-[6px]"></i></span>}
          </button>

          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-3">Account</p>
          <div className="space-y-1">
            <button onClick={() => { setShowSidebar(false); handleManageBilling(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-slate-800/60 transition-all group">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i className="fa-solid fa-credit-card text-emerald-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors">Manage Billing</p>
                <p className="text-[8px] text-slate-500">{userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} Plan &middot; <i className="fa-solid fa-coins text-[7px] text-amber-500"></i> {userCredits}</p>
              </div>
            </button>
            <button onClick={() => { setShowSidebar(false); setShowSettingsModal(true); setSettingsEditingName(false); setSettingsEditingEmail(false); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-slate-800/60 transition-all group">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i className="fa-solid fa-gear text-amber-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors">Settings</p>
                <p className="text-[8px] text-slate-500">Email, password, preferences</p>
              </div>
            </button>
            <button onClick={() => { setShowSidebar(false); setShowTeamModal(true); loadTeamMembers(); loadTeamInvites(); }} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-slate-800/60 transition-all group">
              <span className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"><i className="fa-solid fa-user-plus text-emerald-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-emerald-400 transition-colors">Team</p>
                <p className="text-[8px] text-slate-500">Invite &amp; manage members</p>
              </div>
            </button>
            {/* ─── META ADS CONNECTION ───── */}
            {metaConnection?.connected ? (
              <div className="w-full px-4 py-3 rounded-xl bg-blue-500/5 border border-blue-500/10">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i className="fa-brands fa-meta text-blue-400 text-xs"></i></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-blue-400">Meta Ads Connected</p>
                    <p className="text-[8px] text-slate-500 truncate">{metaConnection.adAccounts?.find((a: any) => a.id === metaConnection.selectedAccountId)?.name || 'Select an account'}</p>
                  </div>
                </div>
                {/* Account Picker */}
                {metaConnection.adAccounts?.length > 1 && (
                  <select
                    value={metaConnection.selectedAccountId || ''}
                    onChange={async (e) => {
                      const accountId = e.target.value;
                      await metaService.selectAccount(accountId);
                      setMetaConnection(prev => prev ? { ...prev, selectedAccountId: accountId } : prev);
                      showToast(`Switched to ${metaConnection.adAccounts?.find((a: any) => a.id === accountId)?.name || accountId}`, 'success');
                    }}
                    className="w-full mt-2 bg-slate-900 border border-slate-700/50 rounded-lg px-3 py-2 text-[10px] text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {metaConnection.adAccounts.map((acc: any) => (
                      <option key={acc.id} value={acc.id}>{acc.name} ({acc.currency})</option>
                    ))}
                  </select>
                )}
                <div className="flex gap-2 mt-2.5">
                  <button
                    onClick={async () => {
                      if (!metaConnection.selectedAccountId) {
                        showToast('Select an ad account first.', 'error');
                        return;
                      }
                      setMetaSyncing(true);
                      showToast('Syncing ad performance...', 'info');
                      const result = await metaService.syncPerformance(canUseWorkspaces ? activeWorkspaceId : null);
                      setMetaSyncing(false);
                      if (result.success) showToast(`Synced ${result.adsSynced} ads!`, 'success');
                      else showToast('Sync failed. Try again.', 'error');
                    }}
                    disabled={metaSyncing}
                    className="flex-1 py-1.5 rounded-lg bg-blue-600/10 text-blue-400 text-[8px] font-bold hover:bg-blue-600/20 transition-all disabled:opacity-50"
                  >
                    <i className={`fa-solid ${metaSyncing ? 'fa-spinner fa-spin' : 'fa-arrows-rotate'} mr-1`}></i>
                    {metaSyncing ? 'Syncing...' : 'Sync Now'}
                  </button>
                  <button
                    onClick={async () => {
                      if (confirm('Disconnect Meta Ads? This will remove all synced performance data.')) {
                        await metaService.disconnect();
                        setMetaConnection({ connected: false, adAccounts: [], selectedAccountId: null, connectedAt: null, lastSyncAt: null, status: '', tokenExpiring: false });
                        showToast('Meta Ads disconnected.', 'info');
                      }
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800/60 text-slate-500 text-[8px] font-bold hover:text-red-400 hover:bg-red-500/10 transition-all"
                  >
                    <i className="fa-solid fa-link-slash"></i>
                  </button>
                </div>
                {metaConnection.tokenExpiring && (
                  <p className="text-[8px] text-amber-400 mt-2"><i className="fa-solid fa-triangle-exclamation mr-1"></i>Token expiring soon — reconnect to refresh</p>
                )}
              </div>
            ) : (
              <button
                onClick={async () => {
                  if (!user) return;
                  showToast('Connecting to Meta Ads...', 'info');
                  const connected = await metaService.startOAuthFlow(user.uid);
                  if (connected) {
                    const conn = await metaService.getConnection();
                    setMetaConnection(conn);
                    showToast(`Meta Ads connected! ${conn.adAccounts?.length || 0} account(s) found.`, 'success');
                  }
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-blue-500/5 border border-transparent hover:border-blue-500/20 transition-all group"
              >
                <span className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center"><i className="fa-brands fa-meta text-blue-400 text-xs"></i></span>
                <div>
                  <p className="text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors">Connect Meta Ads</p>
                  <p className="text-[8px] text-slate-500">Track real ad performance</p>
                </div>
              </button>
            )}
          </div>

          {/* ─── PERFORMANCE DASHBOARD ───── */}
          <div className="mt-4 px-0">
            <button onClick={() => { if (getFeatureLevel(userPlan, 'performanceDashboard') === 'none') { setUpgradeReason(`Performance Dashboard requires ${requiredPlanFor('performanceDashboard')} plan`); setShowUpgradeModal(true); return; } setShowSidebar(false); setShowDashboard(true); }} className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/15 hover:border-blue-500/30 transition-all group">
              <span className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center"><i className="fa-solid fa-chart-pie text-blue-400 text-sm"></i></span>
              <div className="flex-1">
                <p className="text-[11px] font-bold text-white group-hover:text-blue-400 transition-colors">{t('dashboard.title')}</p>
                <p className="text-[8px] text-slate-500">{t('dashboard.subtitle')}</p>
              </div>
              <i className="fa-solid fa-arrow-right text-[9px] text-slate-600 group-hover:text-blue-400 transition-all group-hover:translate-x-0.5"></i>
            </button>
          </div>

          <p className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-3 mt-6">Support</p>
          <div className="space-y-1">
            <button onClick={() => { setShowSidebar(false); if ((window as any).Tawk_API?.maximize) (window as any).Tawk_API.maximize(); else window.open('https://tawk.to/chat/YOUR_TAWK_ID', '_blank'); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-slate-800/60 transition-all group">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i className="fa-solid fa-headset text-amber-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors">Help & Support</p>
                <p className="text-[8px] text-slate-500">Chat with our team</p>
              </div>
            </button>
            <button onClick={() => { setShowSidebar(false); setShowChangelogModal(true); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-slate-800/60 transition-all group">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i className="fa-solid fa-sparkles text-amber-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors">What's New</p>
                <p className="text-[8px] text-slate-500">Latest features &amp; updates</p>
              </div>
            </button>
            <button onClick={() => showToast('Referral program launching soon! You\'ll earn free credits for every friend you invite.', 'info')} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-slate-800/60 transition-all group relative">
              <span className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><i className="fa-solid fa-gift text-amber-400 text-xs"></i></span>
              <div>
                <p className="text-[11px] font-bold text-white group-hover:text-amber-400 transition-colors">Refer a Friend</p>
                <p className="text-[8px] text-slate-500">Earn free credits</p>
              </div>
              <span className="absolute top-2 right-3 text-[7px] font-black uppercase px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Soon</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800">
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-red-500/10 transition-all group">
            <i className="fa-solid fa-right-from-bracket text-slate-600 group-hover:text-red-400 text-xs"></i>
            <span className="text-[10px] font-bold text-slate-500 group-hover:text-red-400 transition-colors">Sign Out</span>
          </button>
        </div>
      </div>

      <nav className="border-b border-white/[0.06] bg-slate-950/90 backdrop-blur-2xl sticky top-0 z-[60]">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
          {/* ── LEFT: Menu + Logo + New ── */}
          <div className="flex items-center gap-2.5">
            <button data-tour="sidebar-menu" onClick={() => setShowSidebar(!showSidebar)} className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
              <i className="fa-solid fa-bars text-xs"></i>
            </button>
            <div className="cursor-pointer" onClick={() => window.location.reload()}>
              <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center hover:scale-105 transition-transform shadow-lg shadow-blue-600/20">
                <i className="fa-solid fa-wand-magic-sparkles text-white text-sm"></i>
              </div>
            </div>
            <button onClick={() => { if (confirm('Start a new project?')) { const newId = Date.now().toString(); setCurrentProjectId(newId); setCurrentProjectName('Untitled Project'); setPhase('input'); setInputs(null); setTovText(''); setConceptsText(''); setSelectedTov(''); setSelectedConcept(''); setBuildPlan(''); setMockupHistory([]); setHistoryIndex(-1); setCaptionText(''); setBatchResults([]); setCarouselSlides([]); setBatchRendering(false); setBatchSelectedHooks(new Set()); setBatchHookGroups([]); setShowBatchConfig(false); setBatchConceptsLoading(false); setCarouselCopies([]); setShowCarouselPreview(false); setResolvedUniverse(''); setHighestUnlockedPhase(0); localStorage.removeItem('adInputsDraft'); } }}
              className="hidden sm:flex h-9 px-3.5 rounded-lg bg-white/[0.04] text-slate-500 text-[10px] font-semibold hover:text-white transition-colors items-center gap-1.5">
              <i className="fa-solid fa-plus text-[8px]"></i> {t('sidebar.new')}
            </button>
            {canUseWorkspaces && workspaces.length > 0 && (
              <WorkspaceSwitcher
                workspaces={workspaces}
                activeWorkspaceId={activeWorkspaceId}
                onSwitch={setActiveWorkspaceIdLocal}
                onCreateNew={() => { setEditingWorkspace(null); setShowWorkspaceModal(true); }}
                onEditWorkspace={(ws) => { setEditingWorkspace(ws); setShowWorkspaceModal(true); }}
              />
            )}
          </div>

          {/* ── CENTER: Stepper (inline) ── */}
          <div className="hidden md:flex items-center gap-1" data-tour="stepper">
            {steps.map((s, idx) => {
              const active = phase === s.id;
              const completed = steps.findIndex(f => f.id === phase) > idx;
              const unlocked = idx <= highestUnlockedPhase;
              const canClick = unlocked && !active;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && <div className={`w-8 h-px mx-0.5 transition-colors duration-500 ${completed ? 'bg-blue-500/50' : 'bg-white/[0.06]'}`}></div>}
                  <button
                    onClick={() => canClick && navigateToStep(s.id, idx)}
                    disabled={!canClick}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${active
                      ? 'bg-blue-600/15 text-blue-400'
                      : completed
                        ? 'text-slate-400 hover:text-blue-400 hover:bg-white/[0.04]'
                        : unlocked
                          ? 'text-slate-500 hover:text-white hover:bg-white/[0.04]'
                          : 'text-slate-700 cursor-default'
                      }`}
                  >
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${active
                      ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                      : completed ? 'bg-blue-500/15 text-blue-400' : 'bg-white/[0.06] text-inherit'
                      }`}>
                      {completed ? <i className="fa-solid fa-check text-[8px]"></i> : idx + 1}
                    </span>
                    <span className="hidden lg:inline">{t(s.tKey)}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>

          {/* ── Mobile stepper (pill) ── */}
          <div className="flex md:hidden items-center gap-2">
            <span className="text-[10px] font-bold text-blue-400">{t(steps.find(s => s.id === phase)?.tKey || 'step.brief')}</span>
            <span className="text-[10px] text-slate-600">{steps.findIndex(s => s.id === phase) + 1}/{steps.length}</span>
          </div>

          {/* ── RIGHT: Credits + Actions ── */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-white/[0.04]" data-tour="credits">
              <button onClick={() => { if (getFeatureLevel(userPlan, 'performanceDashboard') === 'none') { setUpgradeReason(`Performance Dashboard requires ${requiredPlanFor('performanceDashboard')} plan`); setShowUpgradeModal(true); return; } setShowDashboard(true); }} className="w-8 h-8 rounded-lg bg-slate-900/60 flex items-center justify-center text-slate-500 hover:text-blue-400 transition-all" title="Performance Dashboard">
                <i className="fa-solid fa-chart-line text-[10px]"></i>
              </button>
              <button onClick={async () => {
                setShowFavorites(true);
                setFavoritesLoading(true);
                try {
                  const uid = user?.uid;
                  if (!uid) return;
                  try {
                    // Primary query: uses composite index (userId + feedback.savedToFavorites + timestamp)
                    const fSnap = await getDocs(query(collection(db, 'generations'), where('userId', '==', uid), where('feedback.savedToFavorites', '==', true), orderBy('timestamp', 'desc'), limit(50)));
                    setFavoritesData(fSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                  } catch (indexErr) {
                    // Fallback: if composite index not deployed, use simpler query + client filter
                    console.warn('Favorites index query failed, using fallback:', indexErr);
                    try {
                      const fallbackSnap = await getDocs(query(collection(db, 'generations'), where('userId', '==', uid), orderBy('timestamp', 'desc'), limit(200)));
                      const allGens = fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                      const favorites = allGens.filter((g: any) => g.feedback?.savedToFavorites === true);
                      setFavoritesData(favorites);
                    } catch (fallbackErr) {
                      console.error('Fallback favorites query also failed:', fallbackErr);
                      setFavoritesData([]);
                    }
                  }
                } catch (e) { console.warn('Failed to load favorites:', e); }
                finally { setFavoritesLoading(false); }
              }} className="w-8 h-8 rounded-lg bg-slate-900/60 flex items-center justify-center text-slate-500 hover:text-amber-400 transition-all" title="Favorites">
                <i className="fa-solid fa-bookmark text-[10px]"></i>
              </button>
              <i className="fa-solid fa-coins text-amber-500 text-[10px]"></i>
              <span className="text-[11px] font-bold text-amber-400">{userCredits}</span>
              <span className="text-[9px] text-slate-600 hidden sm:inline">{PLANS[userPlan]?.name}</span>
            </div>
            <button onClick={() => { setUpgradeReason(''); setShowUpgradeModal(true); }}
              className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500 hover:bg-amber-500/20 transition-colors">
              <i className="fa-solid fa-plus text-[9px]"></i>
            </button>
            {!milestones.watchVideo && (
              <button onClick={() => setShowVideoPopup(true)} title="Watch tutorial (+2 credits)"
                className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-400 hover:bg-amber-500/20 transition-colors relative">
                <i className="fa-solid fa-play text-[9px]"></i>
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-amber-500 rounded-full text-[7px] font-bold text-black flex items-center justify-center">+2</span>
              </button>
            )}
            {phase === 'input' && (
              <button onClick={() => setShowWalkthrough(true)} title="Guided tour"
                className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-blue-400 transition-colors">
                <i className="fa-solid fa-circle-question text-xs"></i>
              </button>
            )}
            <button onClick={toggleTheme}
              className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-amber-400 transition-colors"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
              <i className={`fa-solid ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-[11px]`}></i>
            </button>
            <button onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
              className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-[10px] font-bold text-slate-500 hover:text-white transition-colors">
              {t('lang.switch_short')}
            </button>
            <div className="relative" ref={accountMenuRef}>
              <button onClick={() => setShowAccountMenu(!showAccountMenu)}
                className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white transition-colors">
                <i className="fa-solid fa-user text-[10px]"></i>
              </button>
              {showAccountMenu && (
                <div className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-800/80 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-[100]">
                  <div className="px-4 py-3 border-b border-white/[0.04]">
                    <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                    <p className="text-[9px] text-blue-400 font-bold uppercase mt-1">{PLANS[userPlan]?.name || 'Free'} {t('header.plan')}</p>
                  </div>
                  <button onClick={() => { handleManageBilling(); setShowAccountMenu(false); }} className="w-full px-4 py-2.5 text-left text-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all flex items-center gap-3">
                    <i className="fa-solid fa-credit-card text-slate-600 w-4"></i> Manage Billing
                  </button>
                  <button onClick={() => { setUpgradeReason('browse_plans'); setShowUpgradeModal(true); setShowAccountMenu(false); }} className="w-full px-4 py-2.5 text-left text-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-white transition-all flex items-center gap-3">
                    <i className="fa-solid fa-arrow-up text-slate-600 w-4"></i> {t('header.upgrade')}
                  </button>
                  <div className="border-t border-white/[0.04]"></div>
                  <button onClick={() => { handleLogout(); setShowAccountMenu(false); }} className="w-full px-4 py-2.5 text-left text-[10px] text-red-500/70 hover:bg-red-500/5 hover:text-red-400 transition-all flex items-center gap-3">
                    <i className="fa-solid fa-right-from-bracket w-4"></i> {t('header.logout')}
                  </button>
                </div>
            )}
            <SaveStatusIndicator state={autoSaveState} onRetry={autoSaveRetry} />
          </div>
          </div>
        </div>
      </nav>

      {/* Main Content Render Logic */}
      <main className="flex-1 max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 py-8 sm:py-12 md:py-16 relative w-full">
        {isLoading && (
          <div className="fixed inset-0 bg-slate-950/98 backdrop-blur-[40px] z-[100] flex flex-col items-center justify-center text-center">
            <div className="relative w-32 h-32 mb-12">
              <div className="absolute inset-0 border-8 border-blue-500 border-t-transparent rounded-full animate-spin shadow-[0_0_40px_rgba(37,99,235,0.2)]"></div>
            </div>
            <h3 className="text-4xl font-black text-white italic tracking-tighter mb-4 animate-pulse uppercase tracking-[0.1em] leading-none text-center px-6">{loadingMsg}</h3>
            <p className="text-slate-500 text-xs font-medium mt-2">{loadingMsg.toLowerCase().includes('render') || loadingMsg.toLowerCase().includes('generat') || loadingMsg.toLowerCase().includes('universe') || loadingMsg.toLowerCase().includes('hook') || loadingMsg.toLowerCase().includes('concept') || loadingMsg.toLowerCase().includes('caption') || loadingMsg.toLowerCase().includes('slide') ? 'Usually takes 30-60 seconds' : 'Just a moment...'}</p>
          </div>
        )}

        {/* ═══ PROJECT GALLERY (shown on input phase) ═══ */}
        {phase === 'input' && projects.length > 1 && (
          <div className="max-w-5xl mx-auto mb-10 animate-in fade-in duration-700">
            <SavedProjectsPanel
              projects={projects}
              workspaces={workspaces.map(w => ({ id: w.id, name: w.name }))}
              metaConnected={metaConnection?.connected ?? false}
              onLoad={loadProject}
              onDelete={deleteProject}
            />
          </div>
        )}

        {/* Quick-Start Templates — always available on input phase */}
        {phase === 'input' && (
          <div className="max-w-3xl mx-auto mb-6">
            <details className="bg-slate-900/30 border border-slate-800/30 rounded-2xl overflow-hidden group">
              <summary className="px-6 py-3 cursor-pointer text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-blue-400 transition-colors flex items-center gap-2">
                <i className="fa-solid fa-wand-magic-sparkles text-blue-500/50 group-open:text-blue-400 transition-colors"></i>
                Quick-Start Templates
                <i className="fa-solid fa-chevron-down text-[8px] ml-auto transition-transform group-open:rotate-180"></i>
              </summary>
              <div className="px-6 pb-5 pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { emoji: '💪', nameAr: t('demo.weight_loss.nameAr'), name: 'Weight Loss Coach', product: t('demo.weight_loss.product'), category: 'Online fitness coaching', audience: t('demo.weight_loss.audience'), challenges: t('demo.weight_loss.challenges'), transformation: 'From tired & frustrated body to fit & confident in 90 days', offer: 'Nutrition program + home workouts + weekly follow-ups', offerType: 'Mini-Course', cta: t('default.cta'), badges: '', universe: 'Modern Bright Gym', hookAngle: 'emotional', hookType: 'transformation_promise', copyStrategy: 'problem_awareness', creativeMode: ['standard_hero'] },
                    { emoji: '📈', nameAr: t('demo.business.nameAr'), name: 'Business Mentor', product: t('demo.business.product'), category: 'Business mentorship', audience: t('demo.business.audience'), challenges: t('demo.business.challenges'), transformation: 'From struggling freelancer to business owner making $100,000+/mo', offer: '12-week mastermind + 1-on-1 sessions + private community', offerType: 'Mini-Course', cta: t('default.cta'), badges: '', universe: 'Executive Corner Office', hookAngle: 'social_proof', hookType: 'shocking_stat', copyStrategy: 'authority_builder', creativeMode: ['standard_hero', 'value_stack'] },
                    { emoji: '🎨', nameAr: t('demo.design.nameAr'), name: 'Design Course', product: t('demo.design.product'), category: 'Online design course', audience: t('demo.design.audience'), challenges: t('demo.design.challenges'), transformation: 'From beginner working for free to designer earning $2000+/mo', offer: '8-week course + real projects + certificate', offerType: 'Mini-Course', cta: t('default.cta'), badges: '', universe: 'Creative Studio Workspace', hookAngle: 'curiosity', hookType: 'curiosity_gap', copyStrategy: 'beginner_awareness', creativeMode: ['standard_hero'] },
                    { emoji: '🏠', nameAr: t('demo.realestate.nameAr'), name: 'Real Estate', product: t('demo.realestate.product'), category: 'Real estate', audience: t('demo.realestate.audience'), challenges: t('demo.realestate.challenges'), transformation: 'From exhausting search to your dream apartment with easy installments', offer: '150m+ apartments in top compounds, installments up to 8 years', offerType: 'Free Guide', cta: t('default.cta'), badges: '', universe: 'Luxury Home Living Room', hookAngle: 'urgency', hookType: 'pain_point', copyStrategy: 'product_awareness', creativeMode: ['standard_hero'] },
                  ].map((d, i) => (
                    <button key={i} onClick={() => { setPhase('input'); setTovText(''); setSelectedTov(''); setConceptsText(''); setSelectedConcept(''); setBuildPlan(''); setMockupHistory([]); setHistoryIndex(-1); setCaptionText(''); setBatchResults([]); setCarouselSlides([]); setInputs({ productName: d.product, productCategory: d.category, targetAudience: d.audience, challenges: d.challenges, transformation: d.transformation, offerType: d.offerType, cta: d.cta, badges: d.badges || '', campaignType: 'cold', coldHookAngle: d.hookAngle, hookType: d.hookType, copywritingStrategy: d.copyStrategy, offerCreativeMode: d.creativeMode, aspectRatio: '1:1', universeMode: 'realistic', visualStyleFamily: 'realistic', preferredUniverse: d.universe || '', adLanguage: 'ar_egyptian', adMode: 'single', slideCount: 1, retargetingObjection: undefined, retargetingObjections: [], customObjection: '', testimonial: '', brandUrl: '', brandColorPrimary: '', brandColorSecondary: '', personalPhotos: [], brandLogos: [] } as any); setCurrentProjectId(`tpl-${Date.now()}`); showToast(`Template loaded: ${d.nameAr}`, 'success'); }}
                      className="group/tpl bg-slate-950/40 border border-slate-800/40 rounded-2xl p-4 text-center hover:border-blue-500/30 hover:bg-blue-500/5 transition-all space-y-2">
                      <span className="text-2xl block group-hover/tpl:scale-110 transition-transform">{d.emoji}</span>
                      <span className="text-[10px] font-bold text-white block">{d.nameAr}</span>
                      <span className="text-[8px] text-slate-600 block">{d.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </details>
          </div>
        )}

        {phase === 'input' && <Suspense fallback={<div className="px-6 py-10 text-center text-sm text-slate-400">Loading workspace...</div>}><InputForm key={currentProjectId} onSubmit={handleStartDesign} onSaveDraft={handleSaveDraft} showToast={showToast} initialValues={inputs} userPlan={userPlan} avatars={avatars} onSaveAvatar={handleSaveAvatar} onUpdateAvatar={handleUpdateAvatar} onDeleteAvatar={handleDeleteAvatar} competitorData={competitorData} competitorLoading={competitorLoading} onRefreshResearch={(formData) => runCompetitorResearch(formData, true)} activeWorkspace={workspaces.find(w => w.id === activeWorkspaceId && !w.deletedAt)} /></Suspense>}

        {phase === 'tov_review' && (
          <div className="space-y-16 animate-in fade-in slide-in-from-bottom-12 duration-1000 max-w-5xl mx-auto relative">
            <button onClick={handleBack} className={`absolute -top-12 ${lang === 'ar' ? 'right-0' : 'left-0'} bg-slate-900/60 px-5 py-2.5 rounded-xl text-[10px] font-semibold text-slate-500 hover:text-white transition-all shadow-xl flex items-center ${lang === 'ar' ? 'flex-row-reverse' : ''} space-x-2`}>
              <i className={`fa-solid ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i><span>{lang === 'ar' ? 'رجوع' : 'Back'}</span>
            </button>
            <header className="text-center space-y-4 pt-10">
              <h2 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-none">
                {inputs?.adMode === 'carousel' ? 'CAROUSEL ANGLES' : t('hooks.title')}
              </h2>
              {inputs?.adMode === 'carousel' && (
                <p className="text-sm text-blue-400/70 font-medium mt-2">Choose a story direction for your {inputs?.slideCount || 5}-slide carousel</p>
              )}
              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => setOpenFavoritesPhase(openFavoritesPhase === 'hooks' ? null : 'hooks')}
                  aria-expanded={openFavoritesPhase === 'hooks'}
                  aria-controls="favorites-panel-hooks"
                  className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                >
                  <i className="fa-solid fa-bookmark text-[8px]"></i> {t('fav.saved_hooks')}<span aria-live="polite">{hooksFavs.length > 0 && ` (${hooksFavs.length})`}</span>
                </button>
              </div>
              <div className="flex flex-col items-center gap-3">
                {((inputs?.visualStyleFamily ?? inputs?.universeMode) === 'minimal') ? (
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.5em] italic">
                    Current Style: <span className="text-slate-300">Minimal</span>
                  </p>
                ) : (
                  <>
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.5em] italic">
                      Current Universe: <span className="text-blue-400">{resolvedUniverse.split('(')[0].trim()}</span>
                    </p>
                    <button
                      onClick={handleChangeUniverse}
                      className="px-4 py-2 rounded-xl bg-blue-500/10 text-blue-300 text-[9px] font-semibold uppercase tracking-wider hover:from-violet-600 hover:to-blue-600 hover:text-white hover:border-transparent transition-all flex items-center gap-2 shadow-lg"
                    >
                      <i className="fa-solid fa-dice"></i> Roll New Universe
                    </button>
                  </>
                )}
              </div>
              <div className="max-w-xl mx-auto mt-8 p-6 bg-slate-900/50 border border-blue-500/20 rounded-[2rem] shadow-2xl">
                <label className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2 block">Global Hook Refinement (Tone & Keywords)</label>
                <textarea
                  value={globalRefinement}
                  onChange={e => setGlobalRefinement(e.target.value)}
                  placeholder="e.g. Make it more professional, highlight the word 'Profit', or use more aggressive puns..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none mb-4"
                />
                <button
                  onClick={handleGlobalHookRefinement}
                  className="w-full py-3 bg-blue-600/10 border border-blue-500/30 text-blue-400 rounded-xl text-[10px] font-bold uppercase tracking-wider hover:bg-blue-600 hover:text-white transition-all"
                >
                  <i className="fa-solid fa-arrows-rotate mr-2"></i>Apply Refinement to All Hooks
                </button>
              </div>

              {/* ─── COMPETITOR INTEL PANEL (Step 2) ─── */}
              {competitorData && competitorData.competitors?.length > 0 && (
                <details className="max-w-xl mx-auto mt-4 bg-slate-900/40 border border-amber-500/10 rounded-2xl overflow-hidden group">
                  <summary className="px-6 py-4 cursor-pointer text-[10px] font-black uppercase tracking-widest text-amber-400/70 hover:text-amber-400 transition-colors flex items-center gap-2">
                    <i className="fa-solid fa-binoculars"></i>
                    <span>Competitor Intelligence ({competitorData.competitors.length} competitors found)</span>
                    <i className="fa-solid fa-chevron-down ml-auto text-[8px] group-open:rotate-180 transition-transform"></i>
                  </summary>
                  <div className="px-6 pb-5 space-y-4 animate-in slide-in-from-top-2">
                    {/* Competitor List */}
                    <div className="space-y-2">
                      {competitorData.competitors.slice(0, 4).map((comp: any, idx: number) => (
                        <div key={idx} className="bg-slate-950/50 rounded-xl p-3 border border-slate-800/50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{comp.name || `Competitor ${idx + 1}`}</span>
                            {comp.weakness && <span className="text-[8px] text-red-400/70 bg-red-500/10 px-2 py-0.5 rounded-full">{comp.weakness}</span>}
                          </div>
                          {comp.positioning && <p className="text-[10px] text-slate-400 mt-1">{comp.positioning}</p>}
                        </div>
                      ))}
                    </div>
                    {/* Attack Hooks */}
                    {competitorData.attackHooks?.length > 0 && (
                      <div>
                        <span className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-wider">Differentiation Hooks</span>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {competitorData.attackHooks.slice(0, 5).map((hook: any, idx: number) => (
                            <span key={idx} className="text-[10px] bg-emerald-500/10 text-emerald-300 px-3 py-1.5 rounded-lg border border-emerald-500/20">{typeof hook === 'string' ? hook : hook.hook || hook.label || JSON.stringify(hook)}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Suggested Angles */}
                    {competitorData.angles?.length > 0 && (
                      <div>
                        <span className="text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">Winning Angles</span>
                        <div className="mt-2 space-y-1.5">
                          {competitorData.angles.slice(0, 3).map((angle: any, idx: number) => (
                            <div key={idx} className="text-[10px] text-blue-200/80 bg-blue-500/10 px-3 py-2 rounded-lg border border-blue-500/10">
                              {typeof angle === 'string' ? (
                                <div className="flex items-start gap-2"><i className="fa-solid fa-lightbulb text-blue-400/50 mt-0.5 text-[9px]"></i><span>{angle}</span></div>
                              ) : (
                                <div className="space-y-1">
                                  {angle.title && <div className="font-bold text-blue-300 text-[10px]"><i className="fa-solid fa-lightbulb text-blue-400/50 text-[9px] mr-1.5"></i>{angle.title}</div>}
                                  {angle.explanation && <div className="text-slate-400 text-[9px] leading-relaxed mr-4">{angle.explanation}</div>}
                                  {angle.hookSuggestion && <div className="text-emerald-300/80 text-[9px] mt-1 bg-emerald-500/5 px-2 py-1 rounded" dir="rtl">{angle.hookSuggestion}</div>}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </header>

            {/* ═══ CAROUSEL MODE: Show Story Angles ═══ */}
            {inputs?.adMode === 'carousel' && (inputs?.slideCount || 1) > 1 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {['A', 'B', 'C', 'D'].map((v) => {
                  // ─── ROBUST BLOCK EXTRACTION ─────────────────────
                  // Try ANGLE markers first, then HOOK markers
                  let raw = getSection(tovText, `ANGLE_START_${v}`, `ANGLE_END_${v}`);
                  if (!raw.trim()) raw = getSection(tovText, `HOOK_START_${v}`, `HOOK_END_${v}`);
                  if (!raw.trim()) {
                    const blockRegex = new RegExp(`(?:ANGLE|HOOK)[_\\s]*(?:START)?[_\\s]*${v}[\\s\\S]*?(?:(?:ANGLE|HOOK)[_\\s]*END[_\\s]*${v})`, 'i');
                    const match = tovText.match(blockRegex);
                    if (match) raw = match[0];
                  }
                  raw = (raw || '').replace(/\*\*/g, '').replace(/```/g, '');

                  // ─── LINE-BY-LINE FIELD EXTRACTION (most reliable) ─────
                  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
                  const getField = (key: string): string => {
                    const line = lines.find(l => l.toUpperCase().startsWith(key.toUpperCase()));
                    if (!line) return '';
                    return line.replace(new RegExp(`^${key}\\s*[:：]?\\s*`, 'i'), '').replace(/\*\*/g, '').trim();
                  };

                  const hookText = getField('HOOK_TEXT');
                  const subhead = getField('SUBHEADLINE');
                  const storyArcRaw = getField('STORY_ARC');
                  const ctaRaw = getField('CTA_BUTTON');

                  // Parse CTA + benefit (split by "|||")
                  const ctaParts = ctaRaw.split(/\s*\|\|\|\s*/).map(s => s.trim()).filter(Boolean);
                  const ctaText = ctaParts[0] || inputs?.cta || '';
                  // Clean benefit: remove any ANGLE_END / HOOK_END markers that leaked in
                  const benefitText = (ctaParts[1] || '').replace(/ANGLE_END.*|HOOK_END.*/gi, '').trim();

                  const isLoadingItem = itemLoading[v];
                  const rtLabel = t('hook.retargeting_angle_label');
                  const angleLabels: Record<string, string> = {
                    A: inputs?.campaignType === 'retargeting' ? rtLabel : 'Direct Value',
                    B: inputs?.campaignType === 'retargeting' ? rtLabel : 'Curiosity / Question',
                    C: inputs?.campaignType === 'retargeting' ? rtLabel : 'Social Proof / Story',
                    D: inputs?.campaignType === 'retargeting' ? rtLabel : 'Problem Agitation',
                  };

                  return (
                    <div key={v} className="bg-slate-900/40 rounded-2xl p-6 flex flex-col hover:bg-slate-900/60 transition-all relative group">
                      {isLoadingItem && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-2xl">
                          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                        </div>
                      )}
                      <div className="flex flex-col h-full space-y-5">
                        <div className="flex-1 space-y-4 bg-slate-950/30 p-6 rounded-xl flex flex-col">
                          {/* Angle Label */}
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${v === 'A' ? 'bg-blue-500/20 text-blue-400' : v === 'B' ? 'bg-purple-500/20 text-purple-400' : v === 'C' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                              Angle {v} • {angleLabels[v]}
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-800/60 px-2 py-0.5 rounded-lg">
                              <i className="fa-solid fa-layer-group mr-1"></i>{inputs?.slideCount || 5} slides
                            </span>
                          </div>

                          {/* Hook (Slide 1) */}
                          <div dir="rtl" className="arabic-text text-2xl font-black text-white leading-tight text-right">
                            {hookText || "⚠️ Angle unavailable"}
                          </div>
                          {subhead && <div dir="rtl" className="arabic-text text-sm text-slate-400 font-medium leading-relaxed italic text-right">{subhead}</div>}

                          {/* Story Arc Preview */}
                          {storyArcRaw && (
                            <div className="bg-blue-950/30 border border-blue-500/10 rounded-xl p-4 space-y-1.5">
                              <span className="text-[8px] font-black text-blue-400/70 uppercase tracking-widest">
                                <i className="fa-solid fa-route mr-1"></i>Story Arc
                              </span>
                              <p className="text-[11px] text-slate-300 leading-relaxed">{storyArcRaw}</p>
                            </div>
                          )}

                          {/* CTA Preview */}
                          <div className="bg-blue-600/10 border border-blue-500/20 p-3 rounded-xl text-center">
                            <div dir="rtl" className="arabic-text text-blue-500 font-black text-xs uppercase tracking-widest">{ctaText}</div>
                            {benefitText && <div dir="rtl" className="arabic-text mt-1 text-slate-300 font-semibold text-[10px]">{benefitText}</div>}
                          </div>

                          {/* Choose Angle Button */}
                          <button
                            onClick={() => {
                              // Wrap raw in markers so generateCarouselSlideCopies can parse it
                              const wrapped = raw.includes('HOOK_TEXT') ? `ANGLE_START_${v}\n${raw}\nANGLE_END_${v}` : raw;
                              handleApproveTov(wrapped);
                            }}
                            className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold uppercase tracking-wider text-[10px] shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                          >
                            <i className="fa-solid fa-check text-[11px]"></i>
                            <span>Choose This Angle</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (

              /* ═══ SINGLE IMAGE MODE: Show Hook Cards ═══ */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {['A', 'B', 'C', 'D'].map((v) => {
                  const raw = getSection(tovText, `HOOK_START_${v}`, `HOOK_END_${v}`);
                  const normalize = (t: string) =>
                    (t || '')
                      .replace(/\*\*/g, '')
                      .replace(/^\s*[:：\-–•]+\s*/g, '')
                      .replace(/VISUAL_DIRECTION[\s\S]*/gi, '')
                      .replace(/TECHNICAL_PROMPT[\s\S]*/gi, '')
                      .replace(/CONCEPT_START[\s\S]*/gi, '')
                      .replace(/CONCEPT_END[\s\S]*/gi, '')
                      .replace(/SUBJECT_ACTION[\s\S]*/gi, '')
                      .replace(/ENVIRONMENT_DESC[\s\S]*/gi, '')
                      .replace(/LIGHTING_LOGIC[\s\S]*/gi, '')
                      .replace(/MOOD_EMOTION[\s\S]*/gi, '')
                      .replace(/TEXT_LAYOUT[\s\S]*/gi, '')
                      .replace(/#[0-9a-fA-F]{6}/g, '')
                      .replace(/\(#[^)]*\)/g, '')
                      .trim();

                  const hookText = normalize(getSection(raw, "HOOK_TEXT", "SUBHEADLINE"));
                  const subhead = normalize(getSection(raw, "SUBHEADLINE", "CTA_BUTTON"));

                  const actionBlockRaw =
                    getSection(raw, "CTA_BUTTON", "HOOK_END") ||
                    (raw.match(/CTA[_\s]*BUTTON\s*[:：]?\s*([\s\S]*?)(?:HOOK[_\s]*END|$)/i)?.[1] ?? '') ||
                    '';

                  const actionClean = normalize(actionBlockRaw);

                  const actionParts = actionClean
                    .split(/\s*\|\|\|\s*|\s*\+\s*|\n+/)
                    .map(s => s.trim())
                    .filter(Boolean);

                  const ctaText = actionParts[0] || t('default.cta');
                  const benefitText = actionParts[1] || "";


                  const isLoadingItem = itemLoading[v];

                  const renderHighlightedText = (text: string) => {
                    if (!text) return null;
                    // Remove asterisks strictly for display
                    const cleanText = text.replace(/\*\*/g, '');
                    return (
                      <div dir="rtl" className="text-right">
                        {cleanText}
                      </div>
                    );
                  };

                  return (
                    <div key={v} className="bg-slate-900/40 rounded-2xl p-6 flex flex-col hover:bg-slate-900/60 transition-all relative group">
                      {isLoadingItem && (
                        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-2xl">
                          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                        </div>
                      )}
                      <div className="flex flex-col h-full space-y-6">
                        <div className="flex-1 space-y-6 bg-slate-950/30 p-6 rounded-xl flex flex-col">
                          {/* Hook Type Label */}
                          <div className="flex items-center justify-between">
                            <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${v === 'A' ? 'bg-blue-500/20 text-blue-400' :
                              v === 'B' ? 'bg-purple-500/20 text-purple-400' :
                                v === 'C' ? 'bg-green-500/20 text-green-400' :
                                  'bg-orange-500/20 text-orange-400'
                              }`}>
                              Hook {v} {v === 'A' && hasVaultData && <span className="ml-1 text-[7px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20 normal-case tracking-normal">📊 Based on data</span>} • {(() => {
                                // Use the user's selected angle if available
                                if (inputs?.coldHookAngle) {
                                  const angle = COLD_HOOK_ANGLES.find(a => a.id === inputs.coldHookAngle);
                                  return angle?.labelEn || inputs.coldHookAngle.replace(/_/g, ' ');
                                }
                                // Fallback: auto-classify only when no angle is selected
                                const hookContent = (getSection(raw, "HOOK_TEXT:", "SUBHEADLINE:") || '').trim();
                                if (hookContent.includes('\u061F') || hookContent.includes('?')) return 'Question';
                                if (hookContent.includes('\u062A\u0648\u0642\u0641') || hookContent.includes('\u0627\u0628\u062F\u0623') || hookContent.includes('\u0627\u0643\u062A\u0634\u0641') || hookContent.includes('\u0627\u0646\u0636\u0645')) return 'Command';
                                if (/\d+%|\d+x|\d+\+/.test(hookContent)) return 'Statistics';
                                if (hookContent.includes('\u0643\u064A\u0641') || hookContent.includes('\u0644\u0645\u0627\u0630\u0627')) return 'How-To';
                                if (hookContent.includes('\u0633\u0631') || hookContent.includes('\u062E\u0637\u0623')) return 'Secret';
                                return 'Hook';
                              })()}
                            </span>
                          </div>
                          {/* Hook Text Display / Inline Editor */}
                          {editingHook === v ? (
                            <div className="space-y-3 flex-1">
                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Headline</label>
                                <input value={editHookData.hookText} onChange={e => setEditHookData(p => ({ ...p, hookText: e.target.value }))}
                                  className="w-full bg-slate-950 border border-blue-500/40 rounded-lg px-3 py-2 text-lg text-white font-bold outline-none focus:ring-1 focus:ring-blue-500" dir="auto" />
                              </div>
                              <div>
                                <label className="text-[9px] font-bold text-slate-500 uppercase">Subheadline</label>
                                <input value={editHookData.subhead} onChange={e => setEditHookData(p => ({ ...p, subhead: e.target.value }))}
                                  className="w-full bg-slate-950 border border-blue-500/40 rounded-lg px-3 py-2 text-sm text-slate-300 outline-none focus:ring-1 focus:ring-blue-500" dir="auto" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">CTA</label>
                                  <input value={editHookData.cta} onChange={e => setEditHookData(p => ({ ...p, cta: e.target.value }))}
                                    className="w-full bg-slate-950 border border-blue-500/40 rounded-lg px-3 py-1.5 text-[11px] text-blue-400 font-bold outline-none focus:ring-1 focus:ring-blue-500" dir="auto" />
                                </div>
                                <div>
                                  <label className="text-[9px] font-bold text-slate-500 uppercase">Benefit</label>
                                  <input value={editHookData.benefit} onChange={e => setEditHookData(p => ({ ...p, benefit: e.target.value }))}
                                    className="w-full bg-slate-950 border border-blue-500/40 rounded-lg px-3 py-1.5 text-[11px] text-slate-400 outline-none focus:ring-1 focus:ring-blue-500" dir="auto" />
                                </div>
                              </div>
                              <div className="flex gap-2 pt-1">
                                <button onClick={() => handleInlineHookSave(v)}
                                  className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold uppercase transition-all">
                                  <i className="fa-solid fa-check mr-1"></i>Save Changes
                                </button>
                                <button onClick={() => setEditingHook(null)}
                                  className="px-4 py-2.5 rounded-lg bg-slate-800 text-slate-400 text-[10px] font-bold uppercase hover:text-white transition-all">Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 flex-1">
                              <div className="flex items-start gap-2 group/field">
                                <div dir="rtl" className="arabic-text text-3xl font-black text-white leading-tight text-right flex-1">{renderHighlightedText(hookText || (isLoadingItem ? "...Generating Headline" : "⚠️ Hook unavailable"))}</div>
                                <button onClick={() => handlePrecisionHookEdit(v, 'Regenerate the HOOK_TEXT headline. Write a COMPLETELY DIFFERENT headline — different opening word, different psychological angle, different emotional trigger. Do NOT keep the same approach. Keep the subheadline, CTA, and benefit EXACTLY as they are.')}
                                  className="opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0 w-6 h-6 rounded-lg bg-slate-800/80 hover:bg-blue-600 text-slate-500 hover:text-white text-[8px] flex items-center justify-center" title="Retry headline only">
                                  <i className="fa-solid fa-rotate-right"></i>
                                </button>
                              </div>
                              <div className="flex items-start gap-2 group/field">
                                <div dir="rtl" className="arabic-text text-base text-slate-400 font-medium leading-relaxed italic text-right flex-1">{renderHighlightedText(subhead || (isLoadingItem ? "...Generating Subheadline" : ""))}</div>
                                <button onClick={() => handlePrecisionHookEdit(v, 'Regenerate the SUBHEADLINE. Write a COMPLETELY DIFFERENT subheadline — different supporting angle, different mechanism, different benefit point. Do NOT reuse similar wording. Keep the HOOK_TEXT headline, CTA, and benefit EXACTLY unchanged.')}
                                  className="opacity-0 group-hover/field:opacity-100 transition-opacity shrink-0 w-6 h-6 rounded-lg bg-slate-800/80 hover:bg-blue-600 text-slate-500 hover:text-white text-[8px] flex items-center justify-center" title="Retry subheadline only">
                                  <i className="fa-solid fa-rotate-right"></i>
                                </button>
                              </div>
                            </div>
                          )}
                          {editingHook !== v && (
                            <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl text-center mb-4 group/cta relative">
                              <div dir="rtl" className="arabic-text text-blue-500 font-black text-xs uppercase tracking-widest shadow-sm">
                                {ctaText || "Loading CTA..."}
                              </div>
                              {benefitText ? (
                                <div dir="rtl" className="arabic-text mt-2 text-slate-300 font-semibold text-xs leading-relaxed">
                                  {benefitText}
                                </div>
                              ) : null}
                              <button onClick={() => handlePrecisionHookEdit(v, 'Regenerate the CTA_BUTTON and benefit text. Write a COMPLETELY DIFFERENT CTA — different action verb, different benefit payoff, different emotional hook. Do NOT reuse similar phrasing. Keep the HOOK_TEXT and SUBHEADLINE EXACTLY unchanged.')}
                                className="absolute top-2 right-2 opacity-0 group-hover/cta:opacity-100 transition-opacity w-6 h-6 rounded-lg bg-slate-800/80 hover:bg-blue-600 text-slate-500 hover:text-white text-[8px] flex items-center justify-center" title="Retry CTA & benefit">
                                <i className="fa-solid fa-rotate-right"></i>
                              </button>
                            </div>
                          )}
                          {/* ─── FEEDBACK ───── */}
                          <div className="relative mb-2">
                            <FeedbackButtons
                              generationId={hookGenerationIds[v] || ''}
                              compact={true}
                              onRegenerate={(tags, freeText) => {
                                const context = feedbackService.buildRegenerationContext(raw, tags, freeText);
                                handlePrecisionHookEdit(v, context);
                              }}
                            />
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveTov(raw)}
                              disabled={batchSelectedHooks.size > 0}
                              className={`flex-1 py-3.5 rounded-xl font-bold uppercase tracking-wider text-[10px] shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${batchSelectedHooks.size > 0 ? 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50' : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                              title={batchSelectedHooks.size > 0 ? 'Clear batch selection first to approve a single hook' : 'Approve this hook'}
                            >
                              <i className="fa-solid fa-check text-[11px]"></i>
                              <span>Approve</span>
                            </button>
                            {canUse(userPlan, 'batchGeneration') && inputs?.adMode !== 'carousel' && (
                              <button
                                onClick={() => {
                                  const next = new Set(batchSelectedHooks);
                                  if (next.has(v)) next.delete(v); else next.add(v);
                                  setBatchSelectedHooks(next);
                                }}
                                className={`px-4 py-3.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${batchSelectedHooks.has(v) ? 'bg-emerald-600/20 border border-emerald-500/40 text-emerald-400' : 'bg-slate-950/40 border border-slate-700/30 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30'}`}
                              >
                                <i className={`fa-solid ${batchSelectedHooks.has(v) ? 'fa-check-double' : 'fa-layer-group'} text-[10px]`}></i>
                                <span>{batchSelectedHooks.has(v) ? 'Selected' : 'Batch'}</span>
                              </button>
                            )}
                            <button
                              onClick={() => { setEditingHook(v); setEditHookData({ hookText: hookText || '', subhead: subhead || '', cta: ctaText || '', benefit: benefitText || '' }); }}
                              className="px-4 py-3.5 rounded-xl bg-slate-950/40 border border-slate-700/30 text-slate-300 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 hover:text-white transition-all flex items-center gap-2"
                            >
                              <i className="fa-solid fa-pen text-[10px]"></i>
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => { setActiveEditHookIndex(v); setEditFeedback(''); }}
                              className="px-4 py-3.5 rounded-xl bg-slate-950/40 border border-slate-700/30 text-slate-300 text-[10px] font-bold uppercase tracking-wider hover:bg-slate-800 hover:text-white transition-all flex items-center gap-2"
                            >
                              <i className="fa-solid fa-scissors text-[10px]"></i>
                              <span>AI Edit</span>
                            </button>
                          </div>
                          {/* Generate 4 More Like This */}
                          <button
                            onClick={async () => {
                              if (!inputs) return;
                              if (!deductCredits('refreshHooks')) return;
                              startLoad("Generating 4 similar hooks...");
                              const angleLabel = ({ A: 'Direct Value', B: 'Curiosity', C: 'Social Proof', D: 'Problem Agitation' } as Record<string, string>)[v] || 'same style';
                              try {
                                const likeThisPrompt = `Generate 4 NEW hooks inspired by this specific hook's psychological angle and style:
REFERENCE HOOK: "${hookText}"
REFERENCE SUBHEADLINE: "${subhead}"

RULES:
- Use the SAME psychological trigger (${angleLabel}) but COMPLETELY DIFFERENT wording, metaphors, and entry points.
- Do NOT reuse any words from the reference hook.
- Do NOT repeat any existing hooks. Here are ALL current hooks to AVOID duplicating:
${tovText.substring(0, 1500)}

Each new hook must feel FRESH and UNIQUE — like a different copywriter wrote it.`;
                                const isCarousel = inputs.adMode === 'carousel' && (inputs.slideCount || 1) > 1;
                                const res = isCarousel
                                  ? await gemini.generateCarouselAngles(inputs, resolvedUniverse, inputs.slideCount || 5, likeThisPrompt)
                                  : unwrapGen(await gemini.generateTOV(inputs, resolvedUniverse, 'refresh', tovText, likeThisPrompt));
                                if (res) {
                                  // Validate the new hooks before appending
                                  const newHookValidation = validateCanonicalHooks(res);
                                  if (newHookValidation.count >= 1) {
                                    setTovText((prev: string) => prev + '\n' + res);
                                    showToast(`${newHookValidation.count} new hooks added!`, "success");
                                  } else {
                                    refundCredits('refreshHooks');
                                    showToast("Generated hooks were malformed. Credits refunded.", "error");
                                  }
                                }
                                else { refundCredits('refreshHooks'); showToast("Generation failed. Credits refunded.", "error"); }
                              } catch (e) { refundCredits('refreshHooks'); } finally { stopLoad(); }
                            }}
                            className="w-full mt-2 py-2.5 rounded-xl bg-slate-950/40 border border-dashed border-slate-700/40 text-slate-500 text-[9px] font-bold uppercase tracking-wider hover:border-blue-500/40 hover:text-blue-400 hover:bg-blue-500/5 transition-all flex items-center justify-center gap-2"
                          >
                            <i className="fa-solid fa-clone text-[9px]"></i>
                            <span>Generate 4 More Like This · <i className="fa-solid fa-coins text-[7px] text-amber-400 mr-0.5"></i>{CREDIT_COSTS.refreshHooks}</span>
                          </button>
                          {activeEditHookIndex === v && (
                            <div className="mt-6 p-6 bg-slate-950 border border-blue-500/30 rounded-2xl space-y-4 animate-in slide-in-from-top-4">
                              <textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} placeholder="Contextual patching..." className="w-full bg-slate-900 border border-slate-800 rounded-xl px-6 py-4 text-slate-100 h-24 focus:ring-1 focus:ring-blue-500 outline-none text-sm shadow-inner" />
                              <div className="flex gap-3">
                                <button onClick={() => handlePrecisionHookEdit(v)} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest">Update Hook</button>
                                <button onClick={() => setActiveEditHookIndex(null)} className="text-slate-500 text-[9px] font-black uppercase tracking-widest">Cancel</button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

            )}

            {/* ═══ BATCH SELECTION BAR (above regenerate) ═══ */}
            {batchSelectedHooks.size > 0 && canUse(userPlan, 'batchGeneration') && inputs?.adMode !== 'carousel' && (
              <div className="animate-in slide-in-from-bottom-4 duration-300 mt-6">
                <div className="max-w-3xl mx-auto">
                  <div className="bg-slate-950/95 backdrop-blur-xl border border-emerald-500/20 rounded-2xl p-4 shadow-2xl shadow-emerald-900/20">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
                          <i className="fa-solid fa-layer-group text-emerald-400 text-sm"></i>
                        </div>
                        <div>
                          <div className="text-[11px] font-bold text-white">{batchSelectedHooks.size} {t('batch.hooks_selected')}</div>
                          <div className="text-[9px] text-slate-500">{t('batch.each_hook_gets')}{PLANS[userPlan]?.batchConfig ? ` · Up to ${PLANS[userPlan].batchConfig.maxAdsPerRun} ads/run` : ''}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setBatchSelectedHooks(new Set())}
                          className="px-3 py-2 rounded-lg bg-slate-800 text-slate-400 text-[9px] font-bold hover:text-white transition-all"
                        >Clear</button>
                        <button
                          onClick={async () => {
                            if (!inputs) return;
                            // Generate concepts for each selected hook
                            const hookLetters = Array.from(batchSelectedHooks);
                            const groups: BatchHookGroup[] = [];
                            setBatchConceptsLoading(true);
                            startLoad(`Generating blueprints for ${hookLetters.length} hooks...`);
                            const cleanInputs = { ...inputs, personalPhotos: [], brandLogos: inputs.brandLogos?.slice(0, 5) || [] };

                            for (let i = 0; i < hookLetters.length; i++) {
                              const v = hookLetters[i];
                              let hookRaw = getSection(tovText, `ANGLE_START_${v}`, `ANGLE_END_${v}`);
                              if (!hookRaw.trim()) hookRaw = getSection(tovText, `HOOK_START_${v}`, `HOOK_END_${v}`);
                              if (!hookRaw.trim()) continue;

                              const headline = getSection(hookRaw, "HOOK_TEXT", "SUBHEADLINE").replace(/\*\*/g, '').replace(/^[\s:：\-–•]+/g, '').trim();

                              startLoad(`Concepts for Hook ${v} (${i + 1}/${hookLetters.length})...`);
                              if (!deductCredits('generateConcepts')) break;
                              try {
                                let res = unwrapGen(await gemini.generateConcepts(hookRaw, cleanInputs, resolvedUniverse, 'initial'));
                                res = res ? normalizeFieldLabels(res) : res;
                                if (res && (res.includes('CONCEPT_START') || res.includes('SUBJECT_ACTION'))) {
                                  groups.push({
                                    hookKey: v,
                                    hookText: hookRaw,
                                    hookHeadline: headline || `Hook ${v}`,
                                    conceptsText: res,
                                    selectedConcepts: new Set([1, 2, 3]),
                                  });
                                } else {
                                  refundCredits('generateConcepts');
                                  showToast(`Hook ${v} concepts failed — credits refunded.`, 'error');
                                }
                              } catch (e) {
                                refundCredits('generateConcepts');
                                console.error(`Concepts for hook ${v} failed:`, e);
                              }
                              if (i < hookLetters.length - 1) await new Promise(r => setTimeout(r, 1500));
                            }

                            setBatchConceptsLoading(false);
                            stopLoad();
                            if (groups.length > 0) {
                              setBatchHookGroups(groups);
                              // Also set the first hook as selectedTov for single-flow compatibility
                              setSelectedTov(groups[0].hookText);
                              setConceptsText(groups[0].conceptsText);
                              setPhase('concept_review');
                              updateHighestUnlocked('concept_review');
                              showToast(`${groups.length} hook groups ready!`, 'success');
                            } else {
                              showToast('No concepts generated. Try again.', 'error');
                            }
                          }}
                          disabled={batchConceptsLoading}
                          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-[10px] font-black uppercase tracking-wider shadow-lg shadow-blue-600/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center gap-2"
                        >
                          <i className="fa-solid fa-bolt"></i>
                          <span>{t('batch.generate_blueprints')}</span>
                          <span className="text-emerald-200/60 text-[8px]">(<i className="fa-solid fa-coins text-[7px]"></i> {batchSelectedHooks.size * CREDIT_COSTS.generateConcepts})</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Regenerate All (below batch bar) */}
            <div className="max-w-2xl mx-auto space-y-6 pt-6 border-t border-white/5">
              <button
                onClick={handleGlobalHookRefinement}
                className="w-full py-4 rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 text-slate-200 text-[11px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
              >
                <i className="fa-solid fa-arrows-rotate text-blue-500"></i>
                <span>Regenerate All AI Suggestions</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'concept_review' && (() => {
          /* ─── Unified hook groups: always treat as batch-style layout ─── */
          const hookGroups: { hookKey: string; hookText: string; hookHeadline: string; conceptsSource: string; selectedConcepts: Set<number>; isBatch: boolean }[] =
            batchHookGroups.length > 0
              ? batchHookGroups.map(g => ({ hookKey: g.hookKey, hookText: g.hookText, hookHeadline: g.hookHeadline, conceptsSource: g.conceptsText, selectedConcepts: g.selectedConcepts, isBatch: true }))
              : [{
                hookKey: 'S',
                hookText: selectedTov,
                hookHeadline: getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim(),
                conceptsSource: conceptsText,
                selectedConcepts: singleSelectedConcepts,
                isBatch: false,
              }];

          /* ─── Compute totals for the bottom Render bar ─── */
          const totalSelectedConcepts = hookGroups.reduce((sum, g) => sum + g.selectedConcepts.size, 0);
          const numSizes = Math.max(1, selectedSizes.size);
          const totalImages = totalSelectedConcepts * numSizes;
          const perPrimaryCost = CREDIT_COSTS.buildPlan + CREDIT_COSTS.generateImage;
          const perReflowCost = CREDIT_COSTS.generateImage;
          const totalCreditCost = totalSelectedConcepts * (perPrimaryCost + (numSizes - 1) * perReflowCost);

          const conceptColors: Record<number, { bg: string; text: string; border: string }> = {
            1: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
            2: { bg: 'bg-violet-500/10', text: 'text-violet-400', border: 'border-violet-500/20' },
            3: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
          };
          const compositionLabels: Record<number, string> = { 1: 'Asymmetric Balance', 2: 'Central Power', 3: 'Environmental Depth' };

          return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 max-w-[1200px] mx-auto relative">
              {/* ─── Back Button ─── */}
              <button onClick={handleBack} className={`absolute -top-10 ${lang === 'ar' ? 'right-0' : 'left-0'} bg-slate-900/60 px-5 py-2.5 rounded-xl text-[10px] font-semibold text-slate-500 hover:text-white transition-all flex items-center ${lang === 'ar' ? 'flex-row-reverse gap-2' : 'space-x-2'}`}>
                <i className={`fa-solid ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i><span>{lang === 'ar' ? 'رجوع' : 'Back'}</span>
              </button>

              {/* ─── Title ─── */}
              <header className="text-center pt-8">
                <h2 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-none">{t('concepts.blueprint')}</h2>
                <p className="text-[10px] text-slate-400 max-w-lg mx-auto">{t('tip.step3')}</p>
                <p className="text-[11px] text-slate-400 mt-3 font-medium">
                  {hookGroups.length} hook{hookGroups.length > 1 ? 's' : ''} &middot; {totalSelectedConcepts} concept{totalSelectedConcepts !== 1 ? 's' : ''} &middot; {numSizes} size{numSizes > 1 ? 's' : ''} = {totalImages} image{totalImages !== 1 ? 's' : ''}
                </p>
                <div className="mt-3">
                  <button
                    onClick={() => setOpenFavoritesPhase(openFavoritesPhase === 'concepts' ? null : 'concepts')}
                    aria-expanded={openFavoritesPhase === 'concepts'}
                    aria-controls="favorites-panel-concepts"
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider hover:bg-amber-500/20 transition-all inline-flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-bookmark text-[8px]"></i> {t('fav.saved_concepts')}<span aria-live="polite">{conceptsFavs.length > 0 && ` (${conceptsFavs.length})`}</span>
                  </button>
                </div>
                {/* Resolved Creative Spec Summary */}
                {(() => {
                  const spec = resolveCreativeSpec({
                    selectedModes: (inputs as any)?.offerCreativeMode || ['standard_hero'],
                    hookAngle: inputs?.coldHookAngle || undefined,
                  });
                  if (spec.primaryMode !== 'standard_hero' || spec.secondaryMode) {
                    return (
                      <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-xl">
                        <i className="fa-solid fa-palette text-blue-400 text-xs"></i>
                        <span className="text-[10px] font-bold text-blue-400">
                          {lang === 'ar' ? spec.resolvedLabelAr : spec.resolvedLabelEn}
                        </span>
                        {spec.secondaryMode && (
                          <span className="text-[8px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded">
                            {spec.primaryMode.replace(/_/g, ' ')} → primary
                          </span>
                        )}
                      </div>
                    );
                  }
                  return null;
                })()}
              </header>

              {/* ─── Global Refinement ─── */}
              <div className="max-w-2xl mx-auto p-6 bg-slate-900/50 border border-blue-500/20 rounded-[2rem] shadow-2xl">
                <label className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-2 block">Refine All Blueprints (Global)</label>
                <textarea
                  value={globalRefinement}
                  onChange={e => setGlobalRefinement(e.target.value)}
                  placeholder="e.g. Center the hero, make the lighting more dramatic, ensure the pharaoh costume is highly detailed..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-6 py-3 text-sm text-slate-200 outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none mb-4"
                />
                <button
                  onClick={async () => {
                    if (!globalRefinement) return showToast("Please enter instructions first.", "error");
                    if (!deductCredits('generateConcepts')) return;
                    startLoad("Re-architecting Blueprints...");
                    try {
                      let res = unwrapGen(await gemini.generateConcepts(selectedTov, inputs!, resolvedUniverse, 'initial', '', globalRefinement));
                      res = res ? normalizeFieldLabels(res) : res;
                      if (!res || (!res.includes('CONCEPT_START') && !res.includes('SUBJECT_ACTION'))) {
                        refundCredits('generateConcepts');
                        showToast("Blueprint generation returned empty. Credits refunded. Try again.", "error");
                        return;
                      }
                      setConceptsText(res);
                      setGlobalRefinement('');
                      showToast("Architecture updated with your custom vision.", "success");
                    } catch (e) { refundCredits('generateConcepts'); handleApiError(e); } finally { stopLoad(); }
                  }}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white rounded-2xl text-[11px] font-bold uppercase tracking-wider shadow-lg transition-all flex items-center justify-center space-x-2 active:scale-[0.98]"
                >
                  <i className="fa-solid fa-wand-magic-sparkles"></i>
                  <span>Apply Global Refinement</span>
                </button>
              </div>

              {/* ═══════════════════════════════════════════════════════════════════
                HOOK GROUPS — each hook with its expandable concept cards
               ═══════════════════════════════════════════════════════════════════ */}
              <div className="space-y-6">
                {batchHookGroups.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                      <i className="fa-solid fa-layer-group mr-2"></i>Batch Mode — {batchHookGroups.length} Hook Groups
                    </h3>
                    <button onClick={() => { setBatchHookGroups([]); setShowBatchConfig(false); }}
                      className="text-[9px] text-slate-500 hover:text-white transition-all">
                      <i className="fa-solid fa-xmark mr-1"></i>{t('batch.exit')}
                    </button>
                  </div>
                )}

                {hookGroups.map((group, gi) => {
                  const headline = group.hookHeadline;
                  const subhead = (getSection(group.hookText, "SUBHEADLINE:", "STORY_ARC:")
                    || getSection(group.hookText, "SUBHEADLINE:", "CTA_BUTTON:") || '')
                    .replace(/\*\*/g, '').replace(/STORY_ARC[\s\S]*/gi, '').replace(/CTA[_\s]*BUTTON[\s\S]*/gi, '').replace(/VISUAL_DIRECTION[\s\S]*/gi, '').replace(/TECHNICAL_PROMPT[\s\S]*/gi, '').replace(/#[0-9a-fA-F]{6}/g, '').trim();

                  const concepts = [1, 2, 3].map(n => ({
                    n,
                    raw: getConceptBlock(group.conceptsSource, n),
                  })).filter(c => c.raw.trim());

                  return (
                    <div key={group.hookKey} className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/60 shadow-xl">

                      {/* ─── Hook Header ─── */}
                      <div className="px-6 py-5 border-b border-slate-800/60">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${group.isBatch ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'}`}>
                            {group.isBatch ? `Hook ${group.hookKey}` : t('hooks.selected')}
                          </span>
                          {inputs?.coldHookAngle && <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-violet-600/15 text-violet-400">{inputs.coldHookAngle.replace(/_/g, ' ')}</span>}
                          {inputs?.hookType && <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-amber-600/15 text-amber-400">{inputs.hookType.replace(/_/g, ' ')}</span>}
                          {inputs?.adTone && <span className="px-2 py-0.5 rounded text-[8px] font-bold bg-emerald-600/15 text-emerald-400">{inputs.adTone.replace(/_/g, ' ')}</span>}
                        </div>
                        <div dir="rtl" className="arabic-text">
                          <h3 className="text-lg text-white font-bold leading-snug">{headline}</h3>
                          {subhead && <p className="text-sm text-slate-300 mt-1.5 line-clamp-2">{subhead}</p>}
                        </div>
                      </div>

                      {/* ─── Concept Cards ─── */}
                      <div className="p-5 space-y-3 bg-slate-950/30">
                        {concepts.map(({ n, raw: rawOriginal }) => {
                          // Normalize any Arabic field labels to English
                          const raw = normalizeFieldLabels(rawOriginal);
                          const CONCEPT_FIELDS = ['SUBJECT_ACTION', 'ENVIRONMENT_DESC', 'MOOD_EMOTION', 'LIGHTING_LOGIC', 'TEXT_LAYOUT', 'BUTTON_POSITION', 'BRANDING_LOGIC', 'TECHNICAL_PROMPT', 'CONCEPT_END'];
                          const getField = (source: string, fieldName: string): string => {
                            if (!source) return '';
                            const idx = source.indexOf(fieldName);
                            if (idx === -1) return '';
                            const afterLabel = source.slice(idx + fieldName.length);
                            const colonIdx = afterLabel.indexOf(':');
                            if (colonIdx === -1 || colonIdx > 3) return '';
                            const afterContent = afterLabel.slice(colonIdx + 1);
                            let earliest = afterContent.length;
                            for (const f of CONCEPT_FIELDS) {
                              if (f === fieldName) continue;
                              const fi = afterContent.indexOf(f);
                              if (fi !== -1 && fi < earliest) earliest = fi;
                            }
                            return afterContent.slice(0, earliest).trim();
                          };
                          const cleanConcept = (text: string) => {
                            if (!text) return '';
                            return text
                              .replace(/\\n/g, ' ')                    // literal \n to space
                              .replace(/\\"/g, '"')                    // escaped quotes
                              .replace(/\\'/g, "'")                    // escaped single quotes
                              .replace(/\*\*/g, '')
                              .replace(/TECHNICAL_PROMPT[\s\S]*/gi, '')
                              .replace(/CONCEPT_END[\s\S]*/gi, '')
                              .replace(/SPLIT[\-_]SCREEN.*$/gim, '')
                              .replace(/Camera:.*$/gim, '')
                              .replace(/Photorealistic.*$/gim, '')
                              .replace(/\d+mm.*?f\/\d+\.\d+/g, '')
                              .replace(/LEFT\s*=.*$/gim, '')
                              .replace(/RIGHT\s*=.*$/gim, '')
                              .replace(/Same hero.*$/gim, '')
                              .replace(/Diagonal.*divider.*$/gim, '')
                              .replace(/high[\-\s]end.*$/gim, '')
                              .replace(/\bNO\b.*?labels.*$/gim, '')
                              .replace(/\n{2,}/g, '\n')
                              .trim();
                          };
                          const action = cleanConcept(getField(raw, 'SUBJECT_ACTION'));
                          const environment = cleanConcept(getField(raw, 'ENVIRONMENT_DESC'));
                          const mood = cleanConcept(getField(raw, 'MOOD_EMOTION'));
                          const lighting = cleanConcept(getField(raw, 'LIGHTING_LOGIC'));
                          const layout = cleanConcept(getField(raw, 'TEXT_LAYOUT'));

                          const isSelected = group.selectedConcepts.has(n);
                          const isExpanded = expandedConcepts?.has(gi * 10 + n);
                          const isLoadingItem = itemLoading[`concept_${n}`];
                          const colors = conceptColors[n] || conceptColors[1];

                          // Summary tags for collapsed state
                          const tags = [
                            mood && mood.substring(0, 30),
                            lighting && lighting.substring(0, 25),
                          ].filter(Boolean);

                          return (
                            <div key={n}
                              className={`relative rounded-xl transition-all duration-300 overflow-hidden ${isSelected
                                ? `${colors.bg} border ${colors.border} shadow-lg`
                                : 'bg-slate-950/30 border border-slate-800/30 opacity-60 hover:opacity-80'
                                }`}
                            >
                              {isLoadingItem && (
                                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-20 flex flex-col items-center justify-center rounded-xl">
                                  <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full mb-2"></div>
                                  <p className="text-[10px] text-slate-500 font-medium">Updating blueprint...</p>
                                </div>
                              )}

                              {/* Card Header — always visible, clickable to toggle selection */}
                              <div className="flex items-start gap-3 px-5 py-4">
                                {/* Selection checkbox */}
                                <button
                                  onClick={() => {
                                    if (group.isBatch) {
                                      const updated = batchHookGroups.map((g, idx) => {
                                        if (idx !== gi) return g;
                                        const next = new Set(g.selectedConcepts);
                                        if (next.has(n)) { if (next.size > 1) next.delete(n); } else next.add(n);
                                        return { ...g, selectedConcepts: next };
                                      });
                                      setBatchHookGroups(updated);
                                    } else {
                                      setSingleSelectedConcepts(prev => {
                                        const next = new Set(prev);
                                        if (next.has(n)) next.delete(n); else next.add(n);
                                        return next;
                                      });
                                    }
                                  }}
                                  className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 transition-all ${isSelected
                                    ? `${colors.text} bg-current/20 ring-1 ring-current`
                                    : 'bg-slate-800 text-slate-600 ring-1 ring-slate-700'
                                    }`}
                                >
                                  {isSelected && <i className="fa-solid fa-check text-[8px] text-white"></i>}
                                </button>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                                      Concept {n}
                                    </span>
                                    <span className="text-[9px] text-slate-600 font-medium">{compositionLabels[n] || ''}</span>
                                  </div>
                                  <div dir="rtl" className="arabic-text text-sm leading-relaxed text-slate-300">
                                    {(action || "Generating scene...").replace(/\*\*/g, '')}
                                  </div>
                                  {!isExpanded && tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {tags.map((tag, i) => (
                                        <span key={i} className="text-[8px] font-medium text-slate-500 bg-slate-800/60 px-2 py-0.5 rounded">{tag}...</span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Action buttons */}
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Render this one */}
                                  {!group.isBatch && singleSelectedConcepts.size <= 1 && (
                                    <button
                                      onClick={() => {
                                        const conceptBlock = getConceptBlock(group.conceptsSource, n);
                                        if (conceptBlock.trim()) handleApproveConcept(conceptBlock);
                                      }}
                                      className="h-9 px-4 rounded-xl flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                                      title="Render this concept"
                                    >
                                      <i className="fa-solid fa-bolt text-[10px]"></i>
                                      <span className="text-[10px] font-black uppercase tracking-wider">{t('concepts.render_btn')}</span>
                                    </button>
                                  )}
                                  {/* Edit */}
                                  {!group.isBatch && (
                                    <button
                                      onClick={() => { setActiveEditConceptIndex(n.toString()); setEditFeedback(''); }}
                                      className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800/60 transition-all"
                                      title="Edit concept"
                                    >
                                      <i className="fa-solid fa-scissors text-[10px]"></i>
                                    </button>
                                  )}
                                  {/* Expand/Collapse */}
                                  <button
                                    onClick={() => setExpandedConcepts(prev => {
                                      const next = new Set(prev || []);
                                      const key = gi * 10 + n;
                                      next.has(key) ? next.delete(key) : next.add(key);
                                      return next;
                                    })}
                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-white hover:bg-slate-800/60 transition-all"
                                    title={isExpanded ? 'Collapse' : 'Show details'}
                                  >
                                    <i className={`fa-solid fa-chevron-${isExpanded ? 'up' : 'down'} text-[10px]`}></i>
                                  </button>
                                </div>
                              </div>

                              {/* ─── Expanded Detail Panel ─── */}
                              {isExpanded && (
                                <div className="px-5 pb-5 pt-3 border-t border-slate-800/50 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="bg-slate-950/50 border border-slate-800/40 rounded-xl p-3.5">
                                      <label className="text-[9px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <i className="fa-solid fa-mountain-city text-[8px]"></i>Environment
                                      </label>
                                      <div dir="rtl" className="arabic-text text-xs leading-relaxed text-slate-300 mt-1.5">{environment || "Loading..."}</div>
                                    </div>
                                    <div className="bg-slate-950/50 border border-slate-800/40 rounded-xl p-3.5">
                                      <label className="text-[9px] font-semibold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <i className="fa-solid fa-heart-pulse text-[8px]"></i>Mood & Emotion
                                      </label>
                                      <div dir="rtl" className="arabic-text text-xs leading-relaxed text-slate-300 mt-1.5">{mood || "Loading..."}</div>
                                    </div>
                                    <div className="bg-slate-950/50 border border-slate-800/40 rounded-xl p-3.5">
                                      <label className="text-[9px] font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <i className="fa-solid fa-sun text-[8px]"></i>Lighting Logic
                                      </label>
                                      <div dir="rtl" className="arabic-text text-xs leading-relaxed text-slate-300 mt-1.5">{lighting || "Loading..."}</div>
                                    </div>
                                    <div className="bg-slate-950/50 border border-slate-800/40 rounded-xl p-3.5">
                                      <label className="text-[9px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                        <i className="fa-solid fa-align-left text-[8px]"></i>Text Layout
                                      </label>
                                      <div dir="rtl" className="text-xs leading-relaxed text-slate-300 mt-1.5">{layout || "Loading..."}</div>
                                    </div>
                                  </div>
                                  {inputs?.badges && <div className="text-[9px] text-amber-500/80 font-medium"><i className="fa-solid fa-certificate mr-1"></i>Badge: {inputs.badges}</div>}

                                  {/* ─── View Blueprint Panel ─── */}
                                  {raw && (() => {
                                    const tpStart = raw.indexOf('[[TECHNICAL_PROMPT]]');
                                    const tpEnd = raw.indexOf('[[/TECHNICAL_PROMPT]]');
                                    const stripped = (tpStart !== -1 && tpEnd !== -1)
                                      ? (raw.slice(0, tpStart) + raw.slice(tpEnd + '[[/TECHNICAL_PROMPT]]'.length)).replace(/\n{2,}/g, '\n').trim()
                                      : raw.replace(/TECHNICAL_PROMPT[\s\S]*/gi, '').replace(/CONCEPT_END[\s\S]*/gi, '').trim();
                                    if (!stripped || stripped.length < 40) return null;
                                    return (
                                      <details className="mt-3">
                                        <summary className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-200 transition-colors flex items-center gap-1.5">
                                          <i className="fa-solid fa-drafting-compass text-[8px]"></i>
                                          {t('concepts.view_blueprint')}
                                        </summary>
                                        <pre className="mt-2 text-[10px] leading-relaxed text-slate-400 whitespace-pre-wrap font-mono bg-slate-950/80 border border-slate-800/40 rounded-xl p-3.5 max-h-64 overflow-y-auto">{stripped}</pre>
                                      </details>
                                    );
                                  })()}
                                </div>
                              )}

                              {/* ─── Edit Overlay (single mode only) ─── */}
                              {!group.isBatch && activeEditConceptIndex === n.toString() && (
                                <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-xl p-6 z-30 flex flex-col justify-center animate-in zoom-in duration-300 rounded-xl">
                                  <h4 className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider mb-4 text-center">Blueprint Patch — Concept {n}</h4>
                                  <textarea value={editFeedback} onChange={e => setEditFeedback(e.target.value)} placeholder="e.g. Change background to office, make hero more confident, add laptop as prop..." className="w-full bg-slate-900 border border-slate-800/60 rounded-xl px-5 py-4 text-slate-100 h-32 focus:ring-1 focus:ring-blue-500 outline-none text-sm resize-none mb-4" />
                                  <div className="flex flex-col gap-2">
                                    <button onClick={() => handlePrecisionConceptEdit(n.toString())} className="bg-blue-600 text-white py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider">Update Blueprint</button>
                                    <button onClick={() => setActiveEditConceptIndex(null)} className="text-slate-500 text-[10px] font-semibold py-2 hover:text-slate-300">Cancel</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ═══════════════════════════════════════════════════════════════════
                BOTTOM BAR — Size Selector + Render All (batch/carousel only)
               ═══════════════════════════════════════════════════════════════════ */}
              <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/70 shadow-2xl">

                {/* Size Selector — always visible */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-800/60">
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-3">{t('studio.select_sizes')}</p>
                  <div className="flex gap-2">
                    {([
                      { key: '1:1' as AspectRatio, label: 'Square', sub: 'Feed', icon: 'fa-square' },
                      { key: '4:5' as AspectRatio, label: 'Portrait', sub: 'Feed', icon: 'fa-rectangle-portrait' },
                      { key: '3:4' as AspectRatio, label: 'Tall', sub: 'Pinterest', icon: 'fa-rectangle-portrait' },
                      { key: '4:3' as AspectRatio, label: 'Wide', sub: 'Display', icon: 'fa-rectangle-landscape' },
                      { key: '9:16' as AspectRatio, label: 'Story', sub: 'Story', icon: 'fa-mobile-screen' },
                      { key: '16:9' as AspectRatio, label: 'Landscape', sub: 'YouTube', icon: 'fa-rectangle-wide' },
                    ]).map(r => {
                      const isActive = selectedSizes.has(r.key);
                      return (
                        <button key={r.key} type="button"
                          onClick={() => {
                            setSelectedSizes(prev => {
                              const next = new Set(prev);
                              if (next.has(r.key) && next.size > 1) next.delete(r.key);
                              else next.add(r.key);
                              return next;
                            });
                            setCurrentAspectRatio(r.key);
                          }}
                          className={`flex-1 py-3 rounded-xl text-[9px] font-bold transition-all flex flex-col items-center gap-1 ${isActive
                            ? 'bg-blue-600/20 text-blue-400 border border-blue-500/40 shadow-lg shadow-blue-500/10'
                            : 'bg-slate-950/60 text-slate-500 border border-slate-800/60 hover:text-slate-300 hover:border-slate-700 hover:bg-slate-900/40'
                            }`}>
                          <i className={`fa-solid ${r.icon} text-[12px]`}></i>
                          <span className="uppercase tracking-wider">{r.label}</span>
                          <span className="text-[7px] font-normal normal-case tracking-normal opacity-60">{r.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selectedSizes.size > 1 && (
                    <p className="text-[8px] text-blue-400/60 mt-2">{selectedSizes.size} sizes selected — additional sizes auto-reflow at {CREDIT_COSTS.generateImage} credits each</p>
                  )}
                </div>

                {/* Render Summary + Button — always visible */}
                <div className="px-6 py-5 border-t border-slate-800/40">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-[11px] text-slate-300">
                      <span className="text-white font-bold text-lg">{totalImages}</span>
                      <span className="ml-1.5">image{totalImages !== 1 ? 's' : ''}</span>
                      {(hookGroups.length > 1 || numSizes > 1) && (
                        <span className="text-slate-500 ml-2">({totalSelectedConcepts} concepts × {numSizes} size{numSizes > 1 ? 's' : ''})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <i className="fa-solid fa-coins text-amber-400 text-[10px]"></i>
                      <span className="text-amber-400 font-bold text-sm">{totalCreditCost}</span>
                      <span className="text-[9px] text-slate-500"><i className="fa-solid fa-coins text-amber-500"></i></span>
                    </div>
                  </div>

                  {batchHookGroups.length > 0 ? (
                    <div className="flex gap-3">
                      <button
                        onClick={handleBatchRender}
                        disabled={batchRendering || totalSelectedConcepts < 1}
                        className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 via-blue-600 to-emerald-500 hover:from-emerald-500 hover:via-blue-500 hover:to-emerald-400 text-white text-[12px] font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3"
                      >
                        <i className="fa-solid fa-bolt"></i>
                        <span>Render All {totalImages} Images</span>
                        <span className="text-[9px] font-medium opacity-70 ml-1">(<i className="fa-solid fa-coins text-[7px]"></i> {totalCreditCost})</span>
                      </button>
                      <button
                        onClick={() => handleApproveTov(selectedTov)}
                        className="px-6 py-4 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-white text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 active:scale-[0.99] border border-slate-600/30 shadow-lg"
                      >
                        <i className="fa-solid fa-arrows-rotate text-blue-400"></i>
                        <span>{t('concepts.regenerate')}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      {inputs?.adMode === 'carousel' ? (
                        <button
                          onClick={() => {
                            const firstConcept = getConceptBlock(conceptsText, 1);
                            if (firstConcept.trim()) handleCarouselRender(firstConcept);
                          }}
                          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-[12px] font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                          <i className="fa-solid fa-layer-group"></i>
                          <span>Design {inputs?.slideCount || 5} Slides</span>
                          <span className="text-[9px] font-medium opacity-70 ml-1">(<i className="fa-solid fa-coins text-[7px]"></i> {totalCreditCost})</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => {
                            if (singleSelectedConcepts.size > 1) {
                              // Multiple concepts selected → batch render with canvas grid
                              handleBatchRender();
                            } else {
                              // Single concept → direct render
                              const selectedNum = singleSelectedConcepts.size === 1 ? Array.from(singleSelectedConcepts)[0] : 1;
                              const conceptBlock = getConceptBlock(conceptsText, selectedNum);
                              if (conceptBlock.trim()) handleApproveConcept(conceptBlock);
                            }
                          }}
                          className="flex-1 py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-[11px] font-black uppercase tracking-wider transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                        >
                          <i className="fa-solid fa-bolt"></i>
                          <span>{t('concepts.render_all_count', { count: totalSelectedConcepts })}</span>
                          <span className="text-[8px] font-medium opacity-70 ml-1">(<i className="fa-solid fa-coins text-[7px]"></i> {totalCreditCost})</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleApproveTov(selectedTov)}
                        className="px-6 py-3 rounded-xl bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 text-white text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 active:scale-[0.99] border border-slate-600/30 shadow-lg"
                      >
                        <i className="fa-solid fa-arrows-rotate text-blue-400"></i>
                        <span>{t('concepts.regenerate')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {phase === 'render_studio' && (() => {
          const hasAnyImage = currentMockup || batchResults.some((r: any) => r.status === 'done') || carouselSlides.some((s: any) => s.status === 'done');
          return (
            <div className="flex flex-col xl:flex-row gap-6 animate-in fade-in duration-700 max-w-[1500px] mx-auto relative">
              <button onClick={handleBack} className={`absolute -top-11 ${lang === 'ar' ? 'right-0' : 'left-0'} bg-slate-900/60 px-4 py-2 rounded-xl text-[10px] font-semibold text-slate-500 hover:text-white transition-all flex items-center ${lang === 'ar' ? 'flex-row-reverse gap-2' : 'gap-2'}`}>
                <i className={`fa-solid ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i><span>{lang === 'ar' ? 'رجوع' : 'Back'}</span>
              </button>

              {/* ═══════ LEFT: CANVAS ═══════ */}
              <div className="flex-1 min-w-0 space-y-4">

                {/* Size Navigator — shows all selected sizes with friendly names */}
                {selectedSizes.size > 0 && batchResults.length > 0 && (() => {
                  const sizeLabels: Record<string, { label: string; icon: string }> = {
                    '1:1': { label: 'Square', icon: 'fa-square' },
                    '4:5': { label: 'Portrait', icon: 'fa-rectangle-portrait' },
                    '3:4': { label: 'Tall', icon: 'fa-rectangle-portrait' },
                    '4:3': { label: 'Wide', icon: 'fa-rectangle-landscape' },
                    '9:16': { label: 'Story', icon: 'fa-mobile-screen' },
                    '16:9': { label: 'Landscape', icon: 'fa-rectangle-wide' },
                  };
                  const availableSizes = [...new Set(batchResults.map(r => r.ratio))];
                  return availableSizes.length > 1 ? (
                    <div className="flex items-center gap-2 bg-slate-900/60 border border-slate-800/40 rounded-xl px-3 py-2">
                      <span className="text-[8px] text-slate-500 font-bold uppercase tracking-wider shrink-0">Sizes:</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {availableSizes.map(size => (
                          <button key={size}
                            onClick={() => setCurrentAspectRatio(size as AspectRatio)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${currentAspectRatio === size ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800'}`}>
                            <i className={`fa-solid ${sizeLabels[size]?.icon || 'fa-square'} text-[8px]`}></i>
                            {sizeLabels[size]?.label || size}
                          </button>
                        ))}
                      </div>
                      <span className="text-[8px] text-slate-600 ml-auto shrink-0">
                        {batchResults.filter(r => r.ratio === currentAspectRatio && r.status === 'done').length}/{batchResults.filter(r => r.ratio === currentAspectRatio).length}
                      </span>
                    </div>
                  ) : null;
                })()}

                {/* Header — compact single row */}
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-black text-white italic tracking-tight uppercase shrink-0">
                    <i className="fa-solid fa-paintbrush text-blue-500 mr-2 text-sm"></i>Master <span className="text-blue-500">Studio</span>
                  </h2>
                  <button
                    onClick={() => setOpenFavoritesPhase(openFavoritesPhase === 'render' ? null : 'render')}
                    aria-expanded={openFavoritesPhase === 'render'}
                    aria-controls="favorites-panel-render"
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider hover:bg-amber-500/20 transition-all flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-bookmark text-[8px]"></i> {t('fav.saved_renders')}<span aria-live="polite">{renderFavs.length > 0 && ` (${renderFavs.length})`}</span>
                  </button>
                  {loadedRenderRecord && (
                    <button
                      onClick={() => {
                        if (loadedRenderRecord.input) setInputs(loadedRenderRecord.input as unknown as AdInputs);
                        if (loadedRenderRecord.output?.conceptText) {
                          setConceptsText(loadedRenderRecord.output.conceptText);
                          setSelectedConcept(loadedRenderRecord.output.conceptText);
                        }
                        if (loadedRenderRecord.output?.buildPlan) setBuildPlan(loadedRenderRecord.output.buildPlan);
                        // Restore or explicitly clear the upstream hook. The render
                        // record's current output schema does not carry selectedTov,
                        // so the typed lookup will miss on legacy records — clear
                        // rather than leave a stale hook from the prior flow.
                        const recordTov = (loadedRenderRecord.output as { selectedTov?: string }).selectedTov;
                        setSelectedTov(recordTov || '');
                        setLoadedRenderRecord(null);
                        setLoadedFavoriteId(null);
                        setPhase('concept_review');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[9px] font-bold uppercase tracking-wider hover:bg-violet-500/20 transition-all flex items-center gap-1.5"
                    >
                      <i className="fa-solid fa-rotate-right text-[8px]"></i> {t('fav.edit_regenerate')}
                    </button>
                  )}

                  {/* Size tabs + Version nav */}
                  {mockupHistory.length > 1 && (() => {
                    const uniqueRatios = [...new Set(mockupHistory.map(m => m.ratio))];
                    const hasMultipleRatios = uniqueRatios.length > 1;
                    const currentRatio = mockupHistory[historyIndex]?.ratio;
                    // Get all items for the current ratio for version navigation
                    const currentRatioItems = mockupHistory.map((m, idx) => ({ ...m, idx })).filter(m => m.ratio === currentRatio);
                    const currentPosInRatio = currentRatioItems.findIndex(m => m.idx === historyIndex);
                    const hasManyVersions = currentRatioItems.length > 1;

                    return (
                      <div className="flex items-center gap-3">
                        {/* SIZE TABS — show when multiple ratios */}
                        {hasMultipleRatios && (
                          <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1 rounded-xl">
                            {uniqueRatios.map(ratio => {
                              const idx = mockupHistory.findIndex(m => m.ratio === ratio);
                              const isActive = currentRatio === ratio;
                              const label = ratio === '1:1' ? 'Square' : ratio === '9:16' ? 'Story' : ratio === '4:5' ? 'Portrait' : ratio === '16:9' ? 'Landscape' : ratio === '3:4' ? 'Tall' : ratio === '4:3' ? 'Wide' : ratio;
                              return (
                                <button key={ratio} onClick={() => setHistoryIndex(idx)}
                                  className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${isActive ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-500 hover:text-white'}`}>
                                  {label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        {/* VERSION ARROWS — always visible for navigating versions */}
                        <div className="flex items-center gap-1.5 bg-slate-900/80 border border-slate-800 px-2.5 py-1.5 rounded-xl">
                          <button onClick={() => {
                            if (hasMultipleRatios) {
                              if (currentPosInRatio > 0) setHistoryIndex(currentRatioItems[currentPosInRatio - 1].idx);
                            } else {
                              setHistoryIndex(prev => Math.max(0, prev - 1));
                            }
                          }} disabled={hasMultipleRatios ? currentPosInRatio <= 0 : historyIndex === 0} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-slate-800 text-slate-400 text-xs"><i className="fa-solid fa-chevron-left"></i></button>
                          <div className="text-center min-w-[60px]">
                            <span className="text-[10px] font-bold text-white block">Version {hasMultipleRatios ? currentPosInRatio + 1 : historyIndex + 1}</span>
                            <span className="text-[8px] text-slate-500">of {hasMultipleRatios ? currentRatioItems.length : mockupHistory.length}</span>
                          </div>
                          <button onClick={() => {
                            if (hasMultipleRatios) {
                              if (currentPosInRatio < currentRatioItems.length - 1) setHistoryIndex(currentRatioItems[currentPosInRatio + 1].idx);
                            } else {
                              setHistoryIndex(prev => Math.min(mockupHistory.length - 1, prev + 1));
                            }
                          }} disabled={hasMultipleRatios ? currentPosInRatio >= currentRatioItems.length - 1 : historyIndex === mockupHistory.length - 1} className="w-7 h-7 rounded-lg flex items-center justify-center disabled:opacity-20 hover:bg-slate-800 text-slate-400 text-xs"><i className="fa-solid fa-chevron-right"></i></button>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* ═══ CANVAS ═══ */}
                {batchResults.length > 0 ? (
                  <div className="space-y-3">
                    {(() => {
                      const filteredResults = batchResults.map((item, idx) => ({ item, idx })).filter(({ item }) => item.ratio === currentAspectRatio);
                      const allResults = batchResults;
                      const doneCount = filteredResults.filter(({ item }) => item.status === 'done').length;
                      const totalDone = allResults.filter(r => r.status === 'done').length;
                      return (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{doneCount}/{filteredResults.length} rendered</span>
                            {batchRendering && <span className="text-[10px] text-amber-400 animate-pulse font-bold">Rendering...</span>}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {filteredResults.map(({ item, idx }) => (
                              <div key={idx} className={`relative rounded-xl overflow-hidden border border-slate-800/60 bg-slate-900 group ${item.ratio === '9:16' ? 'aspect-[9/16]' : item.ratio === '16:9' ? 'aspect-video' : item.ratio === '4:5' ? 'aspect-[4/5]' : item.ratio === '3:4' ? 'aspect-[3/4]' : item.ratio === '4:3' ? 'aspect-[4/3]' : 'aspect-square'}`}>
                                {item.status === 'done' && item.url ? (
                                  <>
                                    <img src={item.url} className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                                      draggable={true}
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/uri-list', item.url!);
                                        e.dataTransfer.setData('text/plain', item.url!);
                                        e.dataTransfer.setData('text/html', `<img src="${item.url}" />`);
                                      }}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all flex flex-col items-center justify-end pb-2 opacity-0 group-hover:opacity-100">
                                      {/* Per-image local refinement input */}
                                      <input
                                        data-light-ctx="batch-refine"
                                        type="text"
                                        placeholder="Refine: e.g. move CTA lower..."
                                        className="w-[90%] mb-1.5 px-2 py-1 bg-black/70 border border-slate-600 rounded text-[7px] text-white placeholder-slate-500 outline-none"
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const val = (e.target as HTMLInputElement).value.trim();
                                            if (val) { handleBatchRetry(idx, 'reflow', val); (e.target as HTMLInputElement).value = ''; }
                                          }
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <div className="flex gap-1 flex-wrap justify-center px-1">
                                        {/* Download */}
                                        <button onClick={async () => { const url = await applyTrialWatermark(item.url!); const a = document.createElement('a'); a.href = url; a.download = `${inputs?.productName || 'ad'}_${item.ratio.replace(':', 'x')}_H${item.hookKey}_C${item.conceptIndex}.png`; a.click(); }}
                                          className="px-2 py-1 bg-white/90 text-slate-900 rounded text-[7px] font-bold flex items-center gap-0.5" title="Download">
                                          <i className="fa-solid fa-download text-[8px]"></i>
                                        </button>
                                        {/* Reflow (keep layout, re-render) */}
                                        <button onClick={() => handleBatchRetry(idx, 'reflow')}
                                          className="px-2 py-1 bg-cyan-600 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Reflow (re-render, keep layout)">
                                          <i className="fa-solid fa-arrows-spin text-[8px]"></i>
                                        </button>
                                        {/* Full Rerender (new build plan) */}
                                        <button onClick={() => handleBatchRetry(idx, 'rerender')}
                                          className="px-2 py-1 bg-blue-600 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Rerender (new layout)">
                                          <i className="fa-solid fa-rotate text-[8px]"></i>
                                        </button>
                                        {/* Edit */}
                                        <button onClick={() => {
                                          pushMockup(item.url!, item.ratio as AspectRatio);
                                          setBuildPlan(item.buildPlan);
                                          setSelectedConcept(item.conceptText);
                                          setCurrentAspectRatio(item.ratio as AspectRatio);
                                          setStudioTweak('');
                                          setSelectedPolishIds(new Set());
                                          setEditTarget({
                                            source: 'batch',
                                            index: idx,
                                            imageUrl: item.url!,
                                            label: `Batch H${item.hookKey}·C${item.conceptIndex}`,
                                          });
                                          showToast(`Editing H${item.hookKey}·C${item.conceptIndex} — changes will update this card`, 'info');
                                        }}
                                          className="px-2 py-1 bg-violet-600 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Edit">
                                          <i className="fa-solid fa-pen-to-square text-[8px]"></i>
                                        </button>
                                        {/* Save */}
                                        <button onClick={() => { pushMockup(item.url!, item.ratio as AspectRatio); setBuildPlan(item.buildPlan); setSelectedConcept(item.conceptText); }}
                                          className="px-2 py-1 bg-emerald-600 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Use this design">
                                          <i className="fa-solid fa-bookmark text-[8px]"></i>
                                        </button>
                                        {/* Favorite */}
                                        <button onClick={async () => {
                                          if (!user?.uid || !inputs) return;
                                          try {
                                            const genId = await feedbackService.saveGeneration(
                                              user.uid, inputs, 'render',
                                              { imageUrl: item.url || '', conceptText: item.conceptText?.substring(0, 500) || '', hookText: item.hookText?.substring(0, 200) || '' },
                                              item.buildPlan || '', resolvedUniverse, 'gemini-flash', 0, item.ratio as AspectRatio, buildCreativeIdentity(),
                                              canUseWorkspaces ? activeWorkspaceId : null
                                            );
                                            if (genId) {
                                              await feedbackService.toggleFavorite(genId, true);
                                              showToast('Saved to favorites!', 'success');
                                            }
                                          } catch { showToast('Failed to save favorite', 'error'); }
                                        }}
                                          className="px-2 py-1 bg-amber-500/90 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Favorite">
                                          <i className="fa-solid fa-star text-[8px]"></i>
                                        </button>
                                        {/* Push to Meta */}
                                        {metaConnection?.connected && canUse(userPlan, 'pushToMeta') && (
                                          <button onClick={async () => {
                                            setMetaPushing(true);
                                            showToast('Pushing to Meta Ads...', 'info');
                                            try {
                                              const result = await metaService.pushCreative(item.url!, `${inputs?.productName || 'Ad'}_H${item.hookKey}_C${item.conceptIndex}_${item.ratio.replace(':', 'x')}`, buildDeploymentMeta({ ratio: item.ratio }));
                                              if (result.success) showToast(result.message || 'Pushed to Meta!', 'success');
                                              else showToast(result.message || 'Push failed', 'error');
                                            } catch { showToast('Push to Meta failed', 'error'); }
                                            setMetaPushing(false);
                                          }}
                                            className="px-2 py-1 bg-blue-500/90 text-white rounded text-[7px] font-bold flex items-center gap-0.5" title="Push to Meta">
                                            <i className="fa-brands fa-meta text-[8px]"></i>
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {/* Mobile-visible action strip (always visible) */}
                                    <div data-light-ctx="batch-mobile-strip" className="absolute top-1 right-1 flex gap-1 md:hidden">
                                      <button onClick={async () => { const url = await applyTrialWatermark(item.url!); const a = document.createElement('a'); a.href = url; a.download = `ad_${item.ratio.replace(':', 'x')}.png`; a.click(); }}
                                        className="w-6 h-6 bg-black/60 text-white rounded-md flex items-center justify-center text-[8px]"><i className="fa-solid fa-download"></i></button>
                                      <button onClick={() => handleBatchRetry(idx, 'reflow')}
                                        className="w-6 h-6 bg-black/60 text-cyan-300 rounded-md flex items-center justify-center text-[8px]"><i className="fa-solid fa-arrows-spin"></i></button>
                                    </div>
                                  </>
                                ) : item.status === 'rendering' ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-2"><div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div><span className="text-[8px] text-slate-500 font-bold">H{item.hookKey}·C{item.conceptIndex}</span></div>
                                ) : item.status === 'error' ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center gap-2"><i className="fa-solid fa-triangle-exclamation text-red-400"></i><button onClick={() => handleBatchRetry(idx)} className="px-2 py-1 bg-blue-600 text-white rounded text-[8px] font-bold">Retry</button></div>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center"><span className="text-[8px] text-slate-700 font-bold">H{item.hookKey}·C{item.conceptIndex}</span></div>
                                )}
                                <div data-light-ctx="batch-badge" className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[7px] font-bold text-white">H{item.hookKey}·C{item.conceptIndex}</div>
                                {(item.ratio === '9:16' || item.ratio === '16:9') && (
                                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 bg-amber-500/80 rounded text-[6px] font-bold text-black" title="This aspect ratio will be cropped on Feed. Best for Stories/Reels.">Stories</div>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* ─── Bulk Actions ─── */}
                          {totalDone > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {/* Download Creative Packs (organized by hook) */}
                              <button onClick={async () => {
                                try {
                                  const { default: JSZip } = await import('jszip');
                                  const zip = new JSZip();
                                  const pName = (inputs?.productName || 'batch').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20);

                                  // Group results by hookKey
                                  const hookGroups = new Map<string, typeof allResults>();
                                  for (const item of allResults) {
                                    if (item.status !== 'done' || !item.url) continue;
                                    const key = item.hookKey || 'S';
                                    if (!hookGroups.has(key)) hookGroups.set(key, []);
                                    hookGroups.get(key)!.push(item);
                                  }

                                  // Find captions for each hook
                                  const captionMap = new Map<string, string>();
                                  if (batchCaptions.length > 0) {
                                    for (const bc of batchCaptions) captionMap.set(bc.hookKey, bc.captionText);
                                  } else if (captionText) {
                                    captionMap.set('S', captionText);
                                  }

                                  // Build ZIP with folder per hook
                                  const dateStr = new Date().toISOString().split('T')[0];
                                  const sizeLabels: Record<string, string> = { '1:1': 'Square', '4:5': 'Portrait', '3:4': 'Tall', '4:3': 'Wide', '9:16': 'Story', '16:9': 'Landscape' };
                                  const hookAngle = (inputs as any)?.coldHookAngle || '';
                                  const hookType = (inputs as any)?.hookType || '';
                                  const adTone = (inputs as any)?.adTone || '';

                                  for (const [hookKey, items] of hookGroups) {
                                    const hookHeadline = batchHookGroups.find(g => g.hookKey === hookKey)?.hookHeadline
                                      || getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 30)
                                      || `Hook_${hookKey}`;
                                    const safeHeadline = hookHeadline.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').trim().substring(0, 25);
                                    const folderName = `Hook_${hookKey}_${safeHeadline}`;
                                    const folder = zip.folder(folderName)!;

                                    // Add images with descriptive names
                                    const imageFiles: string[] = [];
                                    for (const item of items) {
                                      const watermarkedUrl = await applyTrialWatermark(item.url!);
                                      const r = await fetch(watermarkedUrl);
                                      const b = await r.blob();
                                      const sizeName = sizeLabels[item.ratio] || item.ratio.replace(':', 'x');
                                      const fileName = `${pName}_H${hookKey}_C${item.conceptIndex}_${sizeName}_${dateStr}.png`;
                                      folder.file(fileName, b);
                                      imageFiles.push(fileName);
                                    }

                                    // Add copy if available
                                    const caption = captionMap.get(hookKey);
                                    if (caption) {
                                      folder.file('ad_copy.txt', caption);
                                    }

                                    // Detailed README
                                    const readme = [
                                      `Creative Pack — Hook ${hookKey}`,
                                      '='.repeat(50),
                                      `Product: ${inputs?.productName || pName}`,
                                      `Headline: ${hookHeadline}`,
                                      `Date: ${dateStr}`,
                                      hookAngle ? `Hook Angle: ${hookAngle}` : '',
                                      hookType ? `Hook Type: ${hookType}` : '',
                                      adTone ? `Ad Tone: ${adTone}` : '',
                                      '',
                                      `Images (${items.length}):`,
                                      ...imageFiles.map(f => `  • ${f}`),
                                      '',
                                      'PLACEMENT GUIDE:',
                                      '  Square (1:1)    → Feed, Marketplace, Search Results',
                                      '  Portrait (4:5)  → Feed (mobile optimized)',
                                      '  Story (9:16)    → Stories, Reels, TikTok',
                                      '  Landscape (16:9) → In-stream video, YouTube',
                                      '',
                                      'HOW TO USE IN META ADS MANAGER:',
                                      '1. Create a new campaign → choose your objective',
                                      '2. At the Ad level, upload images from this folder',
                                      '3. Paste ad_copy.txt as your Primary Text',
                                      '4. Set each image size to its matching placement',
                                      '',
                                      caption ? `AD COPY:\n${'-'.repeat(50)}\n${caption}` : '⚠️ No copy yet — generate in Step 5.',
                                    ].filter(Boolean).join('\n');
                                    folder.file('README.txt', readme);
                                  }

                                  const zBlob = await zip.generateAsync({ type: 'blob' });
                                  const u = URL.createObjectURL(zBlob);
                                  const a = document.createElement('a');
                                  a.href = u;
                                  a.download = `${pName}_creative_packs.zip`;
                                  a.click();
                                  URL.revokeObjectURL(u);
                                  showToast(`Creative packs downloaded! ${hookGroups.size} hook folders.`, 'success');
                                } catch (e) { console.error(e); showToast('Failed to create ZIP', 'error'); }
                              }} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center gap-2">
                                <i className="fa-solid fa-folder-tree"></i>Download Creative Packs ({totalDone})
                              </button>

                              {/* Push All to Meta */}
                              {metaConnection?.connected && (() => {
                                const storyImages = allResults.filter(r => r.status === 'done' && r.url && (r.ratio === '9:16' || r.ratio === '16:9'));
                                const feedImages = allResults.filter(r => r.status === 'done' && r.url && r.ratio !== '9:16' && r.ratio !== '16:9');
                                const hasStoryWarning = storyImages.length > 0 && feedImages.length > 0;
                                return (
                                  <div className="flex-1 space-y-1.5">
                                    <button onClick={async () => {
                                      const doneItems = allResults.filter(r => r.status === 'done' && r.url);
                                      if (doneItems.length === 0) return;
                                      setMetaPushing(true);
                                      showToast(`Pushing ${doneItems.length} images to Meta (this may take a moment)...`, 'info');
                                      let successCount = 0;
                                      let failureMsg = '';
                                      for (let i = 0; i < doneItems.length; i++) {
                                        const item = doneItems[i];
                                        try {
                                          const result = await metaService.pushCreative(item.url!, `${inputs?.productName || 'Ad'}_H${item.hookKey}_C${item.conceptIndex}_${item.ratio.replace(':', 'x')}`, buildDeploymentMeta({ ratio: item.ratio }));
                                          if (result.success) {
                                            successCount++;
                                            // Store generation→ad linkage for performance tracking
                                            if (user?.uid) {
                                              try {
                                                await setDoc(doc(db, 'pushedCreatives', `${user.uid}_${Date.now()}_${i}`), {
                                                  userId: user.uid,
                                                  hookKey: item.hookKey,
                                                  conceptIndex: item.conceptIndex,
                                                  ratio: item.ratio,
                                                  adName: `${inputs?.productName || 'Ad'}_H${item.hookKey}_C${item.conceptIndex}_${item.ratio.replace(':', 'x')}`,
                                                  productName: inputs?.productName || '',
                                                  pushedAt: Date.now(),
                                                  projectId: currentProjectId,
                                                  // Creative decisions for analytics
                                                  hookAngle: inputs?.coldHookAngle || null,
                                                  hookType: inputs?.hookType || null,
                                                  adTone: inputs?.adTone || null,
                                                  copywritingStrategy: (inputs as any)?.copywritingStrategy || null,
                                                  offerType: inputs?.offerType || null,
                                                  creativeMode: (inputs as any)?.offerCreativeMode || ['standard_hero'],
                                                  universe: resolvedUniverse || null,
                                                  adFormat: inputs?.adMode || 'single',
                                                  hookText: getSection(item.hookText, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 100),
                                                  imageUrl: item.url || null,
                                                }, { merge: true });
                                              } catch (e) { console.warn('Linkage save failed:', e); }
                                            }
                                          }
                                          else failureMsg = result.message;
                                        } catch (e: any) { failureMsg = e?.message || 'Unknown error'; }
                                        if (i < doneItems.length - 1) await new Promise(r => setTimeout(r, 500));
                                      }
                                      setMetaPushing(false);
                                      if (successCount > 0) {
                                        const warnings = [];
                                        if (storyImages.length > 0) warnings.push(`${storyImages.length} Story/Landscape images — use for Stories/Reels placement only`);
                                        showToast(`${successCount}/${doneItems.length} pushed!${warnings.length ? ' Note: ' + warnings.join('. ') : ''}`, 'success');
                                      } else {
                                        showToast(`Push failed: ${failureMsg || 'Check Meta connection'}`, 'error');
                                      }
                                    }}
                                      disabled={metaPushing}
                                      className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                                      <i className={`fa-brands fa-meta ${metaPushing ? 'animate-pulse' : ''}`}></i>
                                      {metaPushing ? 'Pushing...' : `Push All to Meta (${totalDone})`}
                                    </button>
                                    {hasStoryWarning && !metaPushing && (currentAspectRatio === '9:16' || currentAspectRatio === '16:9') && (
                                      <p className="text-[8px] text-amber-400/70 px-1">
                                        <i className="fa-solid fa-triangle-exclamation mr-1"></i>
                                        These Story/Landscape images will be cropped on Feed. Use them for Stories/Reels placements only.
                                      </p>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                ) : carouselSlides.length > 0 ? (
                  <div className="space-y-3">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Carousel — {carouselSlides.filter(s => s.status === 'done').length}/{carouselSlides.length}</span>
                    <div className="flex gap-2.5 overflow-x-auto pb-3" style={{ maxWidth: '100%' }}>
                      {carouselSlides.map((slide, idx) => (
                        <div key={idx} className="shrink-0" style={{ width: currentAspectRatio === '9:16' ? '120px' : '160px' }}>
                          <div className={`relative rounded-xl overflow-hidden border bg-slate-900 group ${currentAspectRatio === '9:16' ? 'aspect-[9/16]' : currentAspectRatio === '4:3' ? 'aspect-[4/3]' : 'aspect-square'} ${slide.status === 'done' ? 'border-emerald-500/30' : 'border-slate-800/60'}`}>
                            {slide.status === 'done' && slide.imageUrl ? (
                              <><img src={slide.imageUrl} className="w-full h-full object-cover cursor-grab active:cursor-grabbing" draggable={true} onDragStart={(e) => { e.dataTransfer.setData('text/uri-list', slide.imageUrl!); e.dataTransfer.setData('text/plain', slide.imageUrl!); e.dataTransfer.setData('text/html', `<img src="${slide.imageUrl}" />`); }} /><div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100"><div className="flex gap-1"><button onClick={() => { pushMockup(slide.imageUrl!, currentAspectRatio); setBuildPlan(slide.buildPlan); setStudioTweak(''); setEditTarget({ source: 'carousel', index: idx, imageUrl: slide.imageUrl!, label: `Slide ${slide.index}` }); showToast(`Editing Slide ${slide.index} — changes will update this slide`, 'info'); }} className="px-2 py-1 bg-violet-600 text-white rounded text-[7px] font-bold" title="Edit this slide"><i className="fa-solid fa-pen-to-square"></i></button><button onClick={() => { applyTrialWatermark(slide.imageUrl!).then(url => { const a = document.createElement('a'); a.href = url; a.download = `slide_${slide.index}.png`; a.click(); }); }} className="px-2 py-1 bg-white/90 text-slate-900 rounded text-[7px] font-bold"><i className="fa-solid fa-download"></i></button><button onClick={() => handleCarouselSlideRetry(idx)} className="px-2 py-1 bg-blue-600 text-white rounded text-[7px] font-bold"><i className="fa-solid fa-rotate-right"></i></button>{metaConnection?.connected && (<button onClick={async () => { setMetaPushing(true); showToast('Pushing slide to Meta...', 'info'); try { const result = await metaService.pushCreative(slide.imageUrl!, `${inputs?.productName || 'Ad'}_carousel_slide_${slide.index}`, buildDeploymentMeta({ mode: 'carousel', ratio: currentAspectRatio })); if (result.success) showToast(result.message || 'Slide pushed!', 'success'); else showToast(result.message || 'Push failed', 'error'); } catch { showToast('Push to Meta failed', 'error'); } setMetaPushing(false); }} className="px-2 py-1 bg-blue-500/90 text-white rounded text-[7px] font-bold"><i className="fa-brands fa-meta"></i></button>)}<button onClick={(e) => { e.stopPropagation(); saveDesignFavorite(slide.imageUrl!, currentAspectRatio, '', '', slide.buildPlan); }} className="px-2 py-1 bg-amber-500/90 text-white rounded text-[7px] font-bold" title="Favorite"><i className="fa-solid fa-star"></i></button></div></div></>
                            ) : slide.status === 'rendering' ? (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1"><div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div><span className="text-[7px] text-blue-400 font-bold">Slide {slide.index}</span></div>
                            ) : slide.status === 'error' ? (
                              <div className="w-full h-full flex flex-col items-center justify-center gap-1"><i className="fa-solid fa-triangle-exclamation text-red-400 text-xs"></i><button onClick={() => handleCarouselSlideRetry(idx)} className="px-2 py-0.5 bg-blue-600 text-white rounded text-[7px] font-bold">Retry</button></div>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><span className="text-[8px] text-slate-700 font-bold">{slide.index}</span></div>
                            )}
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[7px] font-bold text-white">{slide.index}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {carouselSlides.every(s => s.status === 'done') && (
                      <div className="flex gap-2">
                        <button onClick={async () => { try { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); const pName = (inputs?.productName || 'carousel').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20); for (const s of carouselSlides) { if (s.imageUrl) { const r = await fetch(s.imageUrl); const b = await r.blob(); zip.file(`${pName}_slide_${s.index}.png`, b); } } const zBlob = await zip.generateAsync({ type: 'blob' }); const u = URL.createObjectURL(zBlob); const a = document.createElement('a'); a.href = u; a.download = `${pName}_carousel.zip`; a.click(); URL.revokeObjectURL(u); showToast('ZIP!', 'success'); } catch { showToast('Failed', 'error'); } }}
                          className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[9px] font-bold flex items-center justify-center gap-2"><i className="fa-solid fa-file-zipper"></i>Download Slides (ZIP)</button>
                        {metaConnection?.connected && (
                          <button onClick={async () => {
                            setMetaPushing(true);
                            const doneSlides = carouselSlides.filter(s => s.status === 'done' && s.imageUrl);
                            showToast(`Pushing ${doneSlides.length} slides to Meta...`, 'info');
                            let successCount = 0;
                            for (const s of doneSlides) {
                              try {
                                const result = await metaService.pushCreative(s.imageUrl!, `${inputs?.productName || 'Ad'}_carousel_slide_${s.index}`, buildDeploymentMeta({ mode: 'carousel', ratio: currentAspectRatio }));
                                if (result.success) successCount++;
                              } catch { /* individual slide failure */ }
                            }
                            if (successCount > 0) showToast(`${successCount}/${doneSlides.length} slides pushed to Meta!`, 'success');
                            else showToast('Push to Meta failed', 'error');
                            setMetaPushing(false);
                          }}
                            disabled={metaPushing}
                            className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                            <i className={`fa-brands fa-meta ${metaPushing ? 'animate-pulse' : ''}`}></i>
                            {metaPushing ? 'Pushing...' : `Push All to Meta (${carouselSlides.filter(s => s.status === 'done').length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  /* ═══ SINGLE IMAGE — fills available space ═══ */
                ) : (
                  <div className={`relative group rounded-2xl overflow-hidden shadow-xl mx-auto w-full transition-all duration-500 mockup-container ${displayRatio === '9:16' ? 'aspect-[9/16] max-w-[340px]' : displayRatio === '16:9' ? 'aspect-video' : displayRatio === '4:3' ? 'aspect-[4/3] max-w-[600px]' : displayRatio === '3:4' ? 'aspect-[3/4] max-w-[450px]' : 'aspect-square max-w-[560px]'}`}>
                    {currentMockup ? (
                      <>
                        <img src={currentMockup} className="w-full h-full object-cover cursor-grab active:cursor-grabbing" alt="Ad"
                          draggable={true}
                          onDragStart={(e) => {
                            const dragUrl = currentRawBase64 || currentMockup;
                            e.dataTransfer.setData('text/uri-list', dragUrl);
                            e.dataTransfer.setData('text/plain', dragUrl);
                            // For apps like Figma/Notion that accept HTML
                            e.dataTransfer.setData('text/html', `<img src="${dragUrl}" />`);
                          }}
                        />
                        <div className="absolute top-3 right-3 flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleDownload(); }}
                            className="w-9 h-9 bg-slate-900/70 backdrop-blur border border-slate-700 rounded-xl flex items-center justify-center text-white text-xs hover:bg-blue-600 hover:border-blue-400 transition-all"
                            title="Download">
                            <i className="fa-solid fa-download"></i>
                          </button>
                          {magicUndoStack.length > 0 && !magicEditActive && (
                            <button onClick={(e) => { e.stopPropagation(); handleMagicUndo(); }}
                              className="w-9 h-9 bg-slate-900/70 backdrop-blur border border-amber-500/50 rounded-xl flex items-center justify-center text-amber-400 text-xs hover:bg-amber-600 hover:text-white transition-all"
                              title={`Undo (${magicUndoStack.length})`}>
                              <i className="fa-solid fa-rotate-left"></i>
                            </button>
                          )}
                          {metaConnection?.connected && (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!currentMockup || metaPushing) return;
                                setMetaPushing(true);
                                showToast('Pushing to Meta Ads...', 'info');
                                try {
                                  const adName = `${inputs?.productName || 'Ad'}_${Date.now()}`;
                                  const result = await metaService.pushCreative(currentRawBase64 || currentMockup, adName, buildDeploymentMeta());
                                  if (result.success) {
                                    showToast(result.message || 'Pushed to Meta!', 'success');
                                    // Save linkage for performance dashboard tracking
                                    if (user?.uid) {
                                      try {
                                        await setDoc(doc(db, 'pushedCreatives', `${user.uid}_${Date.now()}`), {
                                          userId: user.uid,
                                          adName,
                                          productName: inputs?.productName || '',
                                          ratio: currentAspectRatio,
                                          pushedAt: Date.now(),
                                          projectId: currentProjectId,
                                          hookAngle: inputs?.coldHookAngle || null,
                                          hookType: inputs?.hookType || null,
                                          adTone: inputs?.adTone || null,
                                          copywritingStrategy: (inputs as any)?.copywritingStrategy || null,
                                          offerType: inputs?.offerType || null,
                                          creativeMode: (inputs as any)?.offerCreativeMode || ['standard_hero'],
                                          universe: resolvedUniverse || null,
                                          adFormat: inputs?.adMode || 'single',
                                          hookText: getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 100),
                                          imageUrl: currentMockup || null,
                                          metaImageHash: result.imageHash || null,
                                        }, { merge: true });
                                      } catch (le) { console.warn('Linkage save failed:', le); }
                                    }
                                  }
                                  else showToast(result.message || 'Push failed', 'error');
                                } catch { showToast('Push to Meta failed', 'error'); }
                                setMetaPushing(false);
                              }}
                              disabled={metaPushing}
                              className="h-9 px-3 bg-blue-600/80 backdrop-blur border border-blue-500/50 rounded-xl flex items-center justify-center text-white text-[9px] font-bold hover:bg-blue-500 transition-all gap-1.5 disabled:opacity-50"
                              title="Push to Meta Ads">
                              <i className={`fa-brands fa-meta ${metaPushing ? 'animate-pulse' : ''}`}></i>
                              <span>{metaPushing ? 'Pushing...' : 'Push to Meta'}</span>
                            </button>
                          )}
                        </div>
                        {/* Magic Selector Overlay */}
                        {magicEditActive && (
                          <MagicSelector
                            imageUrl={currentMockup}
                            onEditRequest={handleMagicEdit}
                            onClose={() => setMagicEditActive(false)}
                            isProcessing={magicProcessing}
                          />
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3">
                        <div className="animate-spin w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full"></div>
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-500 animate-pulse">Rendering...</p>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── RENDER FEEDBACK ───── */}
                {currentMockup && (
                  <div className="mt-3">
                    <FeedbackButtons
                      generationId={renderGenerationId}
                      showUsedThis={true}
                    />
                  </div>
                )}

                {/* ═══ A/B GALLERY — in main canvas area, full width, clickable ═══ */}
                {abVariations.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">A/B Variations — {abVariations.filter(v => v.status === 'done').length}/3</span>
                      {abRendering && <span className="text-[9px] text-amber-400 animate-pulse font-bold">Rendering...</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {abVariations.map((v, idx) => (
                        <div key={idx}
                          className={`relative rounded-xl overflow-hidden border bg-slate-900 aspect-square group cursor-pointer transition-all ${v.status === 'done' ? 'border-blue-500/20 hover:border-blue-400/50 hover:shadow-lg hover:shadow-blue-500/10' : 'border-slate-800/60'}`}
                          onClick={() => handleSelectAB(idx)}>
                          {v.status === 'done' && v.url ? (
                            <>
                              <img src={v.url} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2.5 opacity-0 group-hover:opacity-100">
                                <div className="flex gap-1.5">
                                  <button onClick={(e) => { e.stopPropagation(); pushMockup(v.url!, currentAspectRatio); setStudioTweak(''); setEditTarget({ source: 'ab', index: idx, imageUrl: v.url!, label: `A/B V${idx + 1}` }); showToast(`Editing V${idx + 1} — changes will update this variation`, 'info'); }} className="px-2.5 py-1.5 bg-violet-600 text-white rounded-lg text-[8px] font-bold" title="Edit"><i className="fa-solid fa-pen-to-square"></i></button>
                                  <button onClick={async (e) => { e.stopPropagation(); const url = await applyTrialWatermark(v.url!); const a = document.createElement('a'); a.href = url; a.download = `AB_V${idx + 1}.png`; a.click(); }} className="px-2.5 py-1.5 bg-white/90 text-slate-900 rounded-lg text-[8px] font-bold"><i className="fa-solid fa-download"></i></button>
                                  <button onClick={(e) => { e.stopPropagation(); handleRetryAB(idx); }} className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg text-[8px] font-bold"><i className="fa-solid fa-rotate"></i></button>
                                  <button onClick={(e) => { e.stopPropagation(); saveDesignFavorite(v.url!, currentAspectRatio); }} className="px-2.5 py-1.5 bg-amber-500/90 text-white rounded-lg text-[8px] font-bold" title="Favorite"><i className="fa-solid fa-star"></i></button>
                                </div>
                              </div>
                            </>
                          ) : v.status === 'rendering' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2"><div className="animate-spin w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full"></div><span className="text-[8px] text-blue-400 font-bold">V{idx + 1}</span></div>
                          ) : v.status === 'error' ? (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-2"><i className="fa-solid fa-triangle-exclamation text-red-400"></i><button onClick={() => handleRetryAB(idx)} className="px-2 py-1 bg-blue-600 text-white rounded text-[8px] font-bold">Retry</button></div>
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><span className="text-[8px] text-slate-700 font-bold">V{idx + 1}</span></div>
                          )}
                          <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-black/60 rounded text-[7px] font-bold text-white">V{idx + 1}</div>
                        </div>
                      ))}
                    </div>
                    {abVariations.filter(v => v.status === 'done').length > 0 && !abRendering && (
                      <button onClick={async () => { try { const { default: JSZip } = await import('jszip'); const zip = new JSZip(); const pName = (inputs?.productName || 'ad').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20); for (let i = 0; i < abVariations.length; i++) { const v = abVariations[i]; if (v.status === 'done' && v.url) { const r = await fetch(v.url); const b = await r.blob(); zip.file(`${pName}_V${i + 1}.png`, b); } } const zBlob = await zip.generateAsync({ type: 'blob' }); const u = URL.createObjectURL(zBlob); const a = document.createElement('a'); a.href = u; a.download = `${pName}_AB.zip`; a.click(); URL.revokeObjectURL(u); showToast('ZIP!', 'success'); } catch { showToast('Failed', 'error'); } }}
                        className="w-full py-2 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-emerald-600/25 transition-all"><i className="fa-solid fa-file-zipper"></i>Download All (ZIP)</button>
                    )}
                  </div>
                )}

                {/* ═══ ALL VERSIONS GALLERY — shows when multiple renders exist in non-batch mode ═══ */}
                {carouselSlides.length === 0 && mockupHistory.length > 1 && (() => {
                  const allDone = mockupHistory.filter(m => m.url);
                  const uniqueRatios = [...new Set(mockupHistory.map(m => m.ratio))];
                  const pName = (inputs?.productName || 'ad').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20);
                  const campaign = inputs?.campaignType === 'retargeting' ? 'RT' : 'Cold';

                  return (
                    <div className="space-y-3 mt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          <i className="fa-solid fa-images text-blue-400 mr-1.5"></i>All Versions ({allDone.length})
                        </span>
                        {uniqueRatios.length > 1 && (
                          <span className="text-[8px] text-slate-600">{uniqueRatios.map(r => r).join(' · ')}</span>
                        )}
                      </div>

                      {/* Thumbnail Grid */}
                      <div className="grid grid-cols-4 gap-2">
                        {mockupHistory.map((m, idx) => (
                          <div key={idx}
                            className={`relative rounded-xl overflow-hidden border bg-slate-900 group cursor-pointer transition-all ${idx === historyIndex ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-lg shadow-blue-500/10' : 'border-slate-800/60 hover:border-slate-600'} ${m.ratio === '9:16' ? 'aspect-[9/16]' : m.ratio === '16:9' ? 'aspect-video' : m.ratio === '4:5' ? 'aspect-[4/5]' : m.ratio === '3:4' ? 'aspect-[3/4]' : m.ratio === '4:3' ? 'aspect-[4/3]' : 'aspect-square'}`}
                            onClick={() => setHistoryIndex(idx)}>
                            {m.url ? (
                              <>
                                <img src={m.url} className="w-full h-full object-cover cursor-grab active:cursor-grabbing"
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData('text/uri-list', m.url);
                                    e.dataTransfer.setData('text/plain', m.url);
                                    e.dataTransfer.setData('text/html', `<img src="${m.url}" />`);
                                  }}
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
                                  <div className="flex gap-1">
                                    <button onClick={(e) => { e.stopPropagation(); setHistoryIndex(idx); setStudioTweak(''); setEditTarget({ source: 'history', index: idx, imageUrl: m.url, label: `Version ${idx + 1}` }); showToast(`Editing V${idx + 1}`, 'info'); }}
                                      className="px-2 py-1 bg-violet-600 text-white rounded-lg text-[7px] font-bold" title="Edit">
                                      <i className="fa-solid fa-pen-to-square"></i>
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = m.url; a.download = `${pName}_${campaign}_V${idx + 1}_${m.ratio.replace(':', 'x')}.png`; a.click(); }}
                                      className="px-2 py-1 bg-white/90 text-slate-900 rounded-lg text-[7px] font-bold">
                                      <i className="fa-solid fa-download"></i>
                                    </button>
                                    <button onClick={(e) => { e.stopPropagation(); saveDesignFavorite(m.url, m.ratio); }}
                                      className="px-2 py-1 bg-amber-500/90 text-white rounded-lg text-[7px] font-bold" title="Favorite">
                                      <i className="fa-solid fa-star"></i>
                                    </button>
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><span className="text-[8px] text-slate-700 font-bold">V{idx + 1}</span></div>
                            )}
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[6px] font-bold text-white">
                              {idx === historyIndex ? '●' : ''} V{idx + 1}
                            </div>
                            {m.ratio !== '1:1' && (
                              <div className="absolute top-1 right-1 px-1 py-0.5 bg-black/60 rounded text-[6px] text-slate-300">{m.ratio}</div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Bulk Actions */}
                      {allDone.length > 1 && (
                        <div className="flex gap-2">
                          {/* Download All ZIP */}
                          <button onClick={async () => {
                            try {
                              const { default: JSZip } = await import('jszip');
                              const zip = new JSZip();
                              for (let i = 0; i < mockupHistory.length; i++) {
                                const m = mockupHistory[i];
                                if (m.url) {
                                  const r = await fetch(m.url);
                                  const b = await r.blob();
                                  zip.file(`${pName}_${campaign}_V${i + 1}_${m.ratio.replace(':', 'x')}.png`, b);
                                }
                              }
                              const zBlob = await zip.generateAsync({ type: 'blob' });
                              const u = URL.createObjectURL(zBlob);
                              const a = document.createElement('a');
                              a.href = u;
                              a.download = `${pName}_${campaign}_All_${allDone.length}versions.zip`;
                              a.click();
                              URL.revokeObjectURL(u);
                              showToast(`Downloaded ${allDone.length} designs!`, 'success');
                            } catch { showToast('Download failed', 'error'); }
                          }}
                            className="flex-1 py-2.5 rounded-xl bg-emerald-600/15 border border-emerald-500/20 text-emerald-300 text-[9px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-emerald-600/25 transition-all">
                            <i className="fa-solid fa-file-zipper"></i>Download All ({allDone.length}) ZIP
                          </button>

                          {/* Push All to Meta */}
                          {metaConnection?.connected && (
                            <button
                              onClick={async () => {
                                if (metaPushing) return;
                                setMetaPushing(true);
                                showToast(`Pushing ${allDone.length} designs to Meta...`, 'info');
                                let successCount = 0;
                                for (let i = 0; i < mockupHistory.length; i++) {
                                  const m = mockupHistory[i];
                                  if (m.url) {
                                    try {
                                      const result = await metaService.pushCreative(m.url, `${pName}_${campaign}_V${i + 1}_${m.ratio.replace(':', 'x')}`, buildDeploymentMeta({ ratio: m.ratio }));
                                      if (result.success) successCount++;
                                    } catch { /* continue */ }
                                  }
                                }
                                setMetaPushing(false);
                                if (successCount > 0) showToast(`Pushed ${successCount}/${allDone.length} to Meta!`, 'success');
                                else showToast('Push to Meta failed', 'error');
                              }}
                              disabled={metaPushing}
                              className="flex-1 py-2.5 rounded-xl bg-blue-600/15 border border-blue-500/20 text-blue-300 text-[9px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-blue-600/25 transition-all disabled:opacity-50">
                              <i className={`fa-brands fa-meta ${metaPushing ? 'animate-pulse' : ''}`}></i>
                              {metaPushing ? 'Pushing...' : `Push All (${allDone.length}) to Meta`}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* ═══════ RIGHT: SIDEBAR ═══════ */}
              <div className="w-full xl:w-[280px] xl:shrink-0 space-y-3 xl:sticky xl:top-16 xl:self-start">

                {/* Magic Edit */}
                {currentMockup && !magicEditActive && (
                  <button onClick={() => setMagicEditActive(true)}
                    className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-600/15 to-blue-600/15 border border-violet-500/20 text-violet-300 text-[10px] font-bold uppercase tracking-wider hover:border-violet-500/40 hover:from-violet-600/25 hover:to-blue-600/25 transition-all flex items-center justify-center gap-2.5 shadow-lg shadow-violet-600/5">
                    <i className="fa-solid fa-wand-magic-sparkles text-violet-400"></i>
                    Magic Edit
                    <span className="text-[7px] opacity-50 inline-flex items-center gap-0.5"><i className="fa-solid fa-coins text-[6px]"></i>3</span>
                  </button>
                )}

                {/* Polish */}
                <div className="bg-slate-900/50 backdrop-blur rounded-2xl border border-slate-800/40 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider"><i className="fa-solid fa-sliders mr-1.5 text-blue-500"></i>Polish Engine</h4>
                    {canUse(userPlan, 'visualPolishes') ? (
                      visualPolishes.length === 0 && <button onClick={handleAnalyzePolishes} className="bg-slate-800 hover:bg-blue-600 text-white text-[7px] font-bold uppercase px-2 py-1 rounded transition-colors border border-slate-700"><i className="fa-solid fa-magnifying-glass mr-1"></i>AI Audit</button>
                    ) : (
                      <span className="text-[7px] text-amber-400 font-bold uppercase"><i className="fa-solid fa-lock mr-1 text-[6px]"></i>{requiredPlanFor('visualPolishes')}+</span>
                    )}
                  </div>

                  {canUse(userPlan, 'visualPolishes') && visualPolishes.length > 0 && (
                    <div className="space-y-1.5">
                      {visualPolishes.map(p => (
                        <div key={p.id} onClick={() => togglePolish(p.id)} className={`px-3 py-2 rounded-lg border cursor-pointer transition-all text-[8px] font-bold uppercase tracking-wider ${selectedPolishIds.has(p.id) ? 'bg-blue-600/20 border-blue-500 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'}`}>
                          {p.label} {selectedPolishIds.has(p.id) && <i className="fa-solid fa-check text-[7px] text-blue-400 ml-1"></i>}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Edit target indicator — shows which design is being edited */}
                  {editTarget && (
                    <div className="flex items-center justify-between bg-violet-600/10 border border-violet-500/20 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <i className="fa-solid fa-pen-to-square text-violet-400 text-[9px]"></i>
                        <span className="text-[9px] font-bold text-violet-300">Editing: {editTarget.label}</span>
                      </div>
                      <button onClick={() => setEditTarget(null)} className="text-[8px] text-slate-500 hover:text-white transition-colors">
                        <i className="fa-solid fa-xmark"></i> Cancel
                      </button>
                    </div>
                  )}

                  <textarea value={studioTweak} onChange={(e) => setStudioTweak(e.target.value)} placeholder={editTarget ? `Describe changes for ${editTarget.label}...` : "e.g. Darker background, enhance text..."} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-[10px] text-slate-200 h-14 outline-none focus:ring-1 focus:ring-blue-500 resize-none" />

                  <button onClick={handleApplyStudioPolishes} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-[9px] font-bold uppercase tracking-wider hover:bg-blue-500 transition-all active:scale-[0.98]">
                    Apply & Render
                  </button>
                </div>

                {/* Actions */}
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/40 p-4 space-y-2">

                  <button disabled={!selectedConcept} onClick={() => selectedConcept && handleApproveConcept(selectedConcept)}
                    className="w-full py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-slate-300 text-[9px] font-bold uppercase tracking-wider hover:bg-slate-700 hover:text-white transition-all flex items-center justify-center gap-2 disabled:opacity-30">
                    <i className="fa-solid fa-arrows-rotate text-[8px]"></i> Reset & Regenerate
                  </button>

                  {currentMockup && carouselSlides.length === 0 && (
                    <button onClick={handleGenerateAB} disabled={abRendering || !canUse(userPlan, 'abVariationTesting')}
                      className={`w-full py-2.5 rounded-xl border text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 disabled:opacity-30 ${!canUse(userPlan, 'abVariationTesting') ? 'bg-slate-900/30 border-slate-800/30 text-slate-500 cursor-not-allowed' : 'bg-purple-600/12 border-purple-500/15 text-purple-300 hover:border-purple-500/30'}`}>
                      {!canUse(userPlan, 'abVariationTesting') && <i className="fa-solid fa-lock text-[7px]"></i>}
                      <i className="fa-solid fa-clone text-[8px]"></i> 3 A/B Variations
                      {canUse(userPlan, 'abVariationTesting') ? (
                        <span className="text-[7px] opacity-40 inline-flex items-center gap-0.5"><i className="fa-solid fa-coins text-[6px]"></i>{(CREDIT_COSTS.buildPlan + CREDIT_COSTS.generateImage) * 3}</span>
                      ) : (
                        <span className="text-[7px] text-blue-400">{requiredPlanFor('abVariationTesting')}+</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Reflow Rescaling */}
                <div className="bg-slate-900/50 rounded-2xl border border-slate-800/40 p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-center flex-1"><i className="fa-solid fa-crop-simple mr-2 text-blue-500"></i>{t('studio.reflow')}</h4>
                    <button onClick={() => setShowMethodSelector(!showMethodSelector)}
                      className="text-[8px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-all">
                      <span>{t('studio.reflow.method_label')}: {reflowMethod === 'auto' ? t('studio.reflow.method_auto') : reflowMethod === 'outpaint' ? t('studio.reflow.method_quick') : t('studio.reflow.method_fresh')}</span>
                      <i className={`fa-solid fa-chevron-${showMethodSelector ? 'up' : 'down'} text-[6px]`}></i>
                    </button>
                  </div>
                  {showMethodSelector && (
                    <div className="flex gap-2">
                      {([
                        { value: 'auto' as const, label: t('studio.reflow.method_auto'), desc: t('studio.reflow.method_auto_desc'), icon: 'fa-wand-magic-sparkles' },
                        { value: 'outpaint' as const, label: t('studio.reflow.method_quick'), desc: t('studio.reflow.method_quick_desc'), icon: 'fa-bolt' },
                        { value: 'rerender' as const, label: t('studio.reflow.method_fresh'), desc: t('studio.reflow.method_fresh_desc'), icon: 'fa-rotate' },
                      ]).map(opt => (
                        <button key={opt.value} onClick={() => { setReflowMethod(opt.value); setShowMethodSelector(false); }}
                          className={`flex-1 py-2 rounded-lg border text-center transition-all ${reflowMethod === opt.value ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}>
                          <i className={`fa-solid ${opt.icon} text-[9px] block mb-0.5`}></i>
                          <span className="text-[7px] font-bold block">{opt.label}</span>
                          <span className="text-[6px] opacity-50 block">{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="grid grid-cols-5 gap-2">
                    {ASPECT_RATIOS.map(ratio => {
                      const allowed = canUseRatio(userPlan, ratio.value);
                      const alreadyRendered = mockupHistory.some(m => m.ratio === ratio.value);
                      const icons: Record<string, string> = {
                        '1:1': 'fa-regular fa-square',
                        '4:5': 'fa-solid fa-mobile-screen',
                        '3:4': 'fa-solid fa-mobile-screen',
                        '4:3': 'fa-solid fa-display',
                        '9:16': 'fa-solid fa-mobile',
                        '16:9': 'fa-solid fa-film',
                      };
                      const shortLabels: Record<string, string> = {
                        '1:1': 'Square',
                        '4:5': 'Portrait',
                        '3:4': 'Tall',
                        '4:3': 'Wide',
                        '9:16': 'Story',
                        '16:9': 'Landscape',
                      };
                      return (
                        <button key={ratio.value} onClick={() => allowed && !alreadyRendered && handleRescale(ratio.value)}
                          className={`flex flex-col items-center justify-center py-3.5 rounded-2xl border transition-all relative ${!allowed
                            ? 'bg-slate-950/50 border-slate-800/50 text-slate-800 cursor-not-allowed opacity-50'
                            : alreadyRendered
                              ? 'bg-emerald-900/20 border-emerald-500/30 text-emerald-400 cursor-default'
                              : currentAspectRatio === ratio.value
                                ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                                : 'bg-slate-950 border-slate-800 text-slate-600 hover:text-slate-300 shadow-inner'
                            }`}
                          title={alreadyRendered ? 'Already rendered — switch to this size using the tabs above' : allowed ? ratio.label : `Requires ${requiredPlanForRatio(ratio.value)} plan`}>
                          <i className={`${icons[ratio.value]} text-lg mb-1`}></i>
                          <span className="text-[7px] font-black uppercase tracking-tighter">{shortLabels[ratio.value] || ratio.label}</span>
                          {alreadyRendered && <i className="fa-solid fa-check text-[7px] text-emerald-400 absolute top-1.5 right-1.5"></i>}
                          {!allowed && !alreadyRendered && <i className="fa-solid fa-lock text-[6px] text-amber-500/60 absolute top-1.5 right-1.5"></i>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Script — bottom */}
                {hasAnyImage && (
                  batchHookGroups.length > 0 ? (
                    <button onClick={() => handleBatchCaptions()}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-lg transition-all active:scale-[0.98] hover:from-emerald-500 hover:to-blue-500 flex items-center justify-center gap-2">
                      <i className="fa-solid fa-pen-nib text-[8px]"></i> Generate {batchHookGroups.length} Scripts <span className="opacity-60">(<i className="fa-solid fa-coins text-[7px]"></i> {batchHookGroups.length})</span>
                    </button>
                  ) : (
                    <button onClick={() => handleGenerateCaption(false)}
                      className="w-full py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 text-white text-[9px] font-bold uppercase tracking-wider shadow-lg transition-all active:scale-[0.98] hover:from-emerald-500 hover:to-blue-500 flex items-center justify-center gap-2">
                      <i className="fa-solid fa-pen-nib text-[8px]"></i> Generate Script
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })()}

        {phase === 'primary_text' && (() => {
          const wordCount = captionText ? captionText.split(/\s+/).filter(Boolean).length : 0;
          return (
            <div className="flex flex-col lg:flex-row gap-16 animate-in fade-in duration-1000 max-w-[1200px] mx-auto relative">
              <button onClick={handleBack} className={`absolute -top-16 ${lang === 'ar' ? 'right-0' : 'left-0'} bg-slate-900/60 px-5 py-2.5 rounded-xl text-[10px] font-semibold text-slate-500 hover:text-white transition-all shadow-xl flex items-center ${lang === 'ar' ? 'flex-row-reverse gap-2' : 'space-x-2'}`}>
                <i className={`fa-solid ${lang === 'ar' ? 'fa-arrow-right' : 'fa-arrow-left'}`}></i><span>{lang === 'ar' ? 'رجوع' : 'Back'}</span>
              </button>

              {/* --- LEFT SIDE: SCRIPT & CONTROLS --- */}
              <div className="flex-1 space-y-8 pt-10">
                <h2 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter uppercase leading-none">{t('script.title')}</h2>
                <p className="text-[10px] text-slate-500 max-w-lg">{t('tip.step5')}</p>
                <div className="mt-3">
                  <button
                    onClick={() => setOpenFavoritesPhase(openFavoritesPhase === 'caption' ? null : 'caption')}
                    aria-expanded={openFavoritesPhase === 'caption'}
                    aria-controls="favorites-panel-caption"
                    className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[9px] font-bold uppercase tracking-wider hover:bg-amber-500/20 transition-all inline-flex items-center gap-1.5"
                  >
                    <i className="fa-solid fa-bookmark text-[8px]"></i> {t('fav.saved_scripts')}<span aria-live="polite">{captionFavs.length > 0 && ` (${captionFavs.length})`}</span>
                  </button>
                </div>

                {/* BATCH CAPTION TABS (shown when batch captions exist) */}
                {batchCaptions.length > 1 && (
                  <div className="flex gap-2 flex-wrap">
                    {batchCaptions.map(bc => {
                      const isActive = activeBatchCaptionKey === bc.hookKey;
                      const headline = getSection(bc.hookText, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim();
                      return (
                        <button key={bc.hookKey}
                          onClick={() => {
                            setActiveBatchCaptionKey(bc.hookKey);
                            setCaptionText(bc.captionText);
                          }}
                          className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${isActive ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-900/60 text-slate-500 border border-slate-800/40 hover:text-slate-300'}`}>
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[8px]">{bc.hookKey}</span>
                          <span className="max-w-[120px] truncate" dir="rtl">{headline || `Hook ${bc.hookKey}`}</span>
                          {bc.captionText ? <i className="fa-solid fa-check text-[8px] text-emerald-400"></i> : <i className="fa-solid fa-spinner fa-spin text-[8px] text-slate-600"></i>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* SCRIPT DISPLAY BOX */}
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-2xl relative backdrop-blur-xl border-white/5">
                  {batchCaptions.length > 1 && activeBatchCaptionKey && (
                    <div className="mb-3 pb-3 border-b border-slate-800 flex items-center gap-2">
                      <span className="px-2 py-1 rounded-md bg-emerald-600/20 text-emerald-400 text-[8px] font-black uppercase">Hook {activeBatchCaptionKey}</span>
                      <span className="text-[10px] text-slate-500">Ad Copy</span>
                    </div>
                  )}
                  <div className="arabic-text text-xl leading-[2.2] text-slate-100 font-medium whitespace-pre-wrap text-right" dir="rtl" style={{ direction: 'rtl', textAlign: 'right' }}>
                    {captionText || "Writing The Script..."}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-800 flex justify-between text-[10px] text-slate-500">
                    <span>Word Count: {wordCount} words</span>
                    <span>{wordCount < 100 ? '⚠️ Short' : wordCount > 160 ? '⚠️ Long' : '✓ Good length'}</span>
                  </div>
                  {/* Caption Feedback */}
                  {captionText && captionGenerationId && (
                    <div className="mt-3 pt-3 border-t border-slate-800/50">
                      <FeedbackButtons
                        generationId={captionGenerationId}
                        showUsedThis={true}
                        compact={true}
                      />
                    </div>
                  )}
                </div>

                {/* REFINEMENT BOX */}
                <div className="bg-gradient-to-b from-blue-900/30 to-slate-900/60 p-8 rounded-[2rem] border border-blue-500/40 space-y-5 shadow-xl shadow-blue-500/10">
                  <label className="text-sm font-black uppercase text-blue-400 tracking-widest flex items-center gap-2">
                    <i className="fa-solid fa-wand-magic-sparkles"></i> Refine Script (e.g. Make it shorter, Add more urgency)
                  </label>
                  <div className="flex flex-col gap-4">
                    <textarea
                      value={captionRefinement}
                      onChange={(e) => setCaptionRefinement(e.target.value)}
                      placeholder={t('placeholder.copy_direction')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-base text-white outline-none focus:border-blue-500 transition-colors resize-none min-h-[120px]"
                      style={{ direction: 'rtl', textAlign: 'right' }}
                    />
                    <button
                      onClick={() => handleGenerateCaption(true)}
                      disabled={!captionRefinement}
                      className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-4 rounded-xl text-sm font-black uppercase tracking-widest transition-all shadow-lg"
                    >
                      <i className="fa-solid fa-arrows-rotate mr-2"></i> Refine
                    </button>
                  </div>
                </div>

                {/* EXPORT BUTTONS */}
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => {
                    const textToCopy = batchCaptions.length > 1
                      ? batchCaptions.map(bc => `═══ HOOK ${bc.hookKey} ═══\n${bc.captionText}`).join('\n\n')
                      : captionText;
                    navigator.clipboard.writeText(textToCopy);
                    showToast(batchCaptions.length > 1 ? `${batchCaptions.length} scripts copied!` : "Copied to Clipboard", "success");
                  }} className="bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 border border-slate-700">
                    <i className="fa-solid fa-copy"></i> {batchCaptions.length > 1 ? `Copy All (${batchCaptions.length})` : 'Copy'}
                  </button>
                  <button
                    onClick={() => {
                      const textToDownload = batchCaptions.length > 1
                        ? batchCaptions.map(bc => `═══ HOOK ${bc.hookKey} ═══\n${bc.captionText}`).join('\n\n')
                        : captionText;
                      const blob = new Blob([textToDownload], { type: 'text/plain;charset=utf-8' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      const capProduct = (inputs?.productName || 'ad').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20);
                      const capCampaign = inputs?.campaignType === 'retargeting' ? 'Retargeting' : 'Cold';
                      const capAngle = inputs?.coldHookAngle ? `_${inputs.coldHookAngle}` : '';
                      const firstHeadline = getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').trim().substring(0, 30).trim();
                      const capHeadline = firstHeadline ? `_${firstHeadline.replace(/\s+/g, '-')}` : '';
                      a.download = `${capProduct}_${capCampaign}${capAngle}${capHeadline}_Caption.txt`;
                      a.click();
                      URL.revokeObjectURL(url);
                      showToast("Downloaded as .txt", "success");
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-white py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 border border-slate-700"
                  >
                    <i className="fa-solid fa-download"></i> {batchCaptions.length > 1 ? "Download All .txt" : "Download .txt"}
                  </button>
                </div>

                {/* CREATIVE PACKS — Full export with images + copy paired */}
                {batchResults.some(r => r.status === 'done') && (batchCaptions.length > 0 || captionText) && (
                  <button
                    onClick={async () => {
                      try {
                        const { default: JSZip } = await import('jszip');
                        const zip = new JSZip();
                        const pName = (inputs?.productName || 'ad').replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '-').substring(0, 20);
                        const doneResults = batchResults.filter(r => r.status === 'done' && r.url);

                        // Group images by hookKey
                        const hookImageMap = new Map<string, typeof doneResults>();
                        for (const item of doneResults) {
                          const key = item.hookKey || 'S';
                          if (!hookImageMap.has(key)) hookImageMap.set(key, []);
                          hookImageMap.get(key)!.push(item);
                        }

                        // Build caption map
                        const captionMap = new Map<string, string>();
                        if (batchCaptions.length > 0) {
                          for (const bc of batchCaptions) captionMap.set(bc.hookKey, bc.captionText);
                        } else if (captionText) {
                          captionMap.set('S', captionText);
                        }

                        // Create one folder per hook with images + copy
                        const allHookKeys = [...new Set([...hookImageMap.keys(), ...captionMap.keys()])];
                        for (const hookKey of allHookKeys) {
                          const hookHeadline = batchHookGroups.find(g => g.hookKey === hookKey)?.hookHeadline
                            || batchCaptions.find(bc => bc.hookKey === hookKey)?.hookText?.substring(0, 30)
                            || getSection(selectedTov, "HOOK_TEXT:", "SUBHEADLINE:").replace(/\*\*/g, '').trim().substring(0, 30)
                            || `Hook_${hookKey}`;
                          const safeName = hookHeadline.replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').trim().substring(0, 25);
                          const folder = zip.folder(`Hook_${hookKey}_${safeName}`)!;

                          // Add images
                          const images = hookImageMap.get(hookKey) || [];
                          const dateStr = new Date().toISOString().split('T')[0];
                          const sizeLabels: Record<string, string> = { '1:1': 'Square', '4:5': 'Portrait', '3:4': 'Tall', '4:3': 'Wide', '9:16': 'Story', '16:9': 'Landscape' };
                          const hookAngle = (inputs as any)?.coldHookAngle || '';
                          const hookType = (inputs as any)?.hookType || '';
                          const adTone = (inputs as any)?.adTone || '';

                          const imageFiles: string[] = [];
                          for (const item of images) {
                            const r = await fetch(item.url!);
                            const b = await r.blob();
                            const sizeName = sizeLabels[item.ratio] || item.ratio.replace(':', 'x');
                            const fileName = `${pName}_H${hookKey}_C${item.conceptIndex}_${sizeName}_${dateStr}.png`;
                            folder.file(fileName, b);
                            imageFiles.push(fileName);
                          }

                          // Add copy
                          const caption = captionMap.get(hookKey);
                          if (caption) {
                            folder.file('ad_copy.txt', caption);
                          }

                          // Detailed README
                          const readme = [
                            `Creative Pack — Hook ${hookKey}`,
                            '='.repeat(50),
                            `Product: ${inputs?.productName || 'Ad'}`,
                            `Headline: ${hookHeadline}`,
                            `Date: ${dateStr}`,
                            hookAngle ? `Hook Angle: ${hookAngle}` : '',
                            hookType ? `Hook Type: ${hookType}` : '',
                            adTone ? `Ad Tone: ${adTone}` : '',
                            '',
                            `Images (${images.length}):`,
                            ...imageFiles.map(f => `  • ${f}`),
                            '',
                            'PLACEMENT GUIDE:',
                            '  Square (1:1)    → Feed, Marketplace, Search Results',
                            '  Portrait (4:5)  → Feed (mobile optimized)',
                            '  Story (9:16)    → Stories, Reels, TikTok',
                            '  Landscape (16:9) → In-stream video, YouTube',
                            '',
                            'HOW TO USE IN META ADS MANAGER:',
                            '1. Create a new campaign → choose your objective',
                            '2. At the Ad level, upload images from this folder',
                            '3. Paste ad_copy.txt as your Primary Text',
                            '4. Set each image size to its matching placement',
                            '',
                            caption ? `AD COPY:\n${'-'.repeat(50)}\n${caption}` : '⚠️ No copy in this pack.',
                          ].filter(Boolean).join('\n');
                          folder.file('README.txt', readme);
                        }

                        const zBlob = await zip.generateAsync({ type: 'blob' });
                        const u = URL.createObjectURL(zBlob);
                        const a = document.createElement('a');
                        a.href = u;
                        a.download = `${pName}_creative_packs.zip`;
                        a.click();
                        URL.revokeObjectURL(u);
                        showToast(`Creative packs downloaded! ${allHookKeys.length} hooks with images + copy paired.`, 'success');
                      } catch (e) { console.error(e); showToast('Failed to create creative packs', 'error'); }
                    }}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-500 hover:to-blue-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95"
                  >
                    <i className="fa-solid fa-folder-tree"></i> Download Creative Packs (Images + Copy)
                  </button>
                )}
              </div>

              {/* --- RIGHT SIDE: IMAGE(S) for active hook --- */}
              <div className="w-full lg:w-[450px] pt-10 space-y-4">
                {carouselSlides.length > 0 ? (
                  <div className="space-y-4">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Carousel Preview</span>
                    <div className="flex gap-3 overflow-x-auto pb-3 custom-scrollbar">
                      {carouselSlides.filter(s => s.status === 'done' && s.imageUrl).map((slide, idx) => (
                        <div key={idx} className="shrink-0 w-32">
                          <div className="relative rounded-xl overflow-hidden border border-slate-800 aspect-square">
                            <img src={slide.imageUrl!} className="w-full h-full object-cover" alt={`Slide ${slide.index}`} />
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[8px] font-bold text-white">{slide.index}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : batchResults.length > 0 ? (() => {
                  // Show all images for the active hook (or all if single mode)
                  const activeKey = activeBatchCaptionKey || batchResults[0]?.hookKey || 'S';
                  const hookImages = batchResults.filter(r => r.hookKey === activeKey && r.status === 'done' && r.url);
                  const allDoneImages = batchResults.filter(r => r.status === 'done' && r.url);
                  const imagesToShow = hookImages.length > 0 ? hookImages : allDoneImages;

                  return (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {hookImages.length > 0 ? `Hook ${activeKey} — ${hookImages.length} images` : `All images — ${allDoneImages.length}`}
                        </span>
                        <span className="text-[8px] text-slate-600">Paired with this copy</span>
                      </div>
                      <div className={`grid ${imagesToShow.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
                        {imagesToShow.map((item, idx) => (
                          <div key={idx} className={`relative rounded-xl overflow-hidden border border-slate-800/60 bg-slate-900 group ${item.ratio === '9:16' ? 'aspect-[9/16]' : item.ratio === '4:5' ? 'aspect-[4/5]' : item.ratio === '16:9' ? 'aspect-video' : 'aspect-square'}`}>
                            <img src={item.url!} className="w-full h-full object-cover" alt="" />
                            <div className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[7px] font-bold text-white">
                              {item.ratio.replace(':', 'x')}
                            </div>
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end justify-center pb-2 opacity-0 group-hover:opacity-100">
                              <button onClick={() => { const a = document.createElement('a'); a.href = item.url!; a.download = `H${item.hookKey}_C${item.conceptIndex}_${item.ratio.replace(':', 'x')}.png`; a.click(); }}
                                className="px-2 py-1 bg-white/90 text-slate-900 rounded text-[7px] font-bold">
                                <i className="fa-solid fa-download"></i>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Pairing indicator */}
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
                        <i className="fa-solid fa-link text-emerald-400 text-[10px] mt-0.5"></i>
                        <div>
                          <p className="text-[9px] text-emerald-400 font-bold">{t('script.paired')}</p>
                          <p className="text-[8px] text-slate-500 mt-0.5">These {imagesToShow.length} images go with the ad copy on the left. Use "Download Creative Packs" to get them bundled together.</p>
                        </div>
                      </div>
                    </div>
                  );
                })() : (() => {
                  const previewUrl = currentMockup || undefined;
                  const previewRatio = displayRatio || '1:1';
                  return (
                    <div className={`relative bg-slate-900 rounded-[3rem] overflow-hidden border border-slate-800 shadow-2xl shadow-slate-950 ${previewRatio === '9:16' ? 'aspect-[9/16]' : previewRatio === '4:5' ? 'aspect-[4/5]' : previewRatio === '16:9' ? 'aspect-video' : 'aspect-square'}`}>
                      {previewUrl ? <img src={previewUrl} className="w-full h-full object-cover" alt="Final Ad Render" /> : <div className="w-full h-full flex items-center justify-center text-slate-700 text-sm">No preview</div>}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })()}
        {/* ═══ FAVORITES PANELS (one mounted per phase; isOpen gates visibility) ═══ */}
        <FavoritesPanel
          phase="hooks"
          isOpen={openFavoritesPhase === 'hooks'}
          onClose={() => setOpenFavoritesPhase(null)}
          workspaceId={canUseWorkspaces ? activeWorkspaceId : null}
          onLoad={async (record) => {
            const activeVariant = Object.keys(hookGenerationIds).find(v => hookGenerationIds[v]);
            if (activeVariant && hookGenerationIds[activeVariant]) {
              await feedbackService.toggleFavorite(hookGenerationIds[activeVariant], true).catch(() => {});
            }
            if (record.output?.hookText) {
              const reconstructed = `HOOK_START_A\nHOOK_TEXT: ${record.output.hookText}\nSUBHEADLINE: ${record.output.subhead || ''}\nCTA_BUTTON: ${record.output.ctaText || ''}\nHOOK_END_A`;
              setTovText(record.output.fullResponse || reconstructed);
              setSelectedTov(reconstructed);
            }
            if (record.id && activeVariant) {
              setHookGenerationIds(prev => ({ ...prev, [activeVariant]: record.id! }));
            }
            // Rewind downstream: a loaded hook is a new branch. Strand any
            // concepts / renders / captions from the prior flow so the user
            // can't carry mismatched Step 3–5 state forward.
            setConceptsText('');
            setSelectedConcept('');
            setBuildPlan('');
            setMockupHistory([]);
            setHistoryIndex(-1);
            setBatchResults([]);
            setCarouselSlides([]);
            setCaptionText('');
            setBatchCaptions([]);
            setActiveBatchCaptionKey('');
            setRenderGenerationId('');
            setCaptionGenerationId('');
            setHighestUnlockedPhase(prev => Math.min(prev, 1));
            setLoadedFavoriteId(record.id || null);
            setOpenFavoritesPhase(null);
          }}
        />
        <FavoritesPanel
          phase="concepts"
          isOpen={openFavoritesPhase === 'concepts'}
          onClose={() => setOpenFavoritesPhase(null)}
          workspaceId={canUseWorkspaces ? activeWorkspaceId : null}
          onLoad={(record) => {
            if (record.output?.conceptText) setConceptsText(record.output.conceptText);
            if (record.output?.buildPlan) setBuildPlan(record.output.buildPlan);
            // Rewind downstream: a loaded concept is a new branch. Strand
            // any renders / captions from the prior flow.
            setMockupHistory([]);
            setHistoryIndex(-1);
            setBatchResults([]);
            setCarouselSlides([]);
            setCaptionText('');
            setBatchCaptions([]);
            setActiveBatchCaptionKey('');
            setRenderGenerationId('');
            setCaptionGenerationId('');
            setHighestUnlockedPhase(prev => Math.min(prev, 2));
            setLoadedFavoriteId(record.id || null);
            setOpenFavoritesPhase(null);
          }}
        />
        <FavoritesPanel
          phase="render"
          isOpen={openFavoritesPhase === 'render'}
          onClose={() => setOpenFavoritesPhase(null)}
          workspaceId={canUseWorkspaces ? activeWorkspaceId : null}
          onLoad={async (record) => {
            if (renderGenerationId) {
              await feedbackService.toggleFavorite(renderGenerationId, true).catch(() => {});
            }
            if (record.output?.imageUrl) pushMockup(record.output.imageUrl, (record.metadata?.aspectRatio || '1:1') as AspectRatio);
            if (record.id) setRenderGenerationId(record.id);
            setLoadedFavoriteId(record.id || null);
            setLoadedRenderRecord(record);
            setOpenFavoritesPhase(null);
          }}
        />
        <FavoritesPanel
          phase="caption"
          isOpen={openFavoritesPhase === 'caption'}
          onClose={() => setOpenFavoritesPhase(null)}
          workspaceId={canUseWorkspaces ? activeWorkspaceId : null}
          onLoad={async (record) => {
            if (captionGenerationId) {
              await feedbackService.toggleFavorite(captionGenerationId, true).catch(() => {});
            }
            if (record.output?.captionText) setCaptionText(record.output.captionText);
            if (record.id) setCaptionGenerationId(record.id);
            setLoadedFavoriteId(record.id || null);
            setOpenFavoritesPhase(null);
          }}
        />
      </main>

      {/* ═══ FAVORITE UPDATE/KEEP-BOTH PROMPT (T015-T018) ═══ */}
      {favUpdatePrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setFavUpdatePrompt(null); setLoadedFavoriteId(null); }} />
          <div className="relative bg-slate-950 border border-amber-500/30 rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <i className="fa-solid fa-bookmark text-amber-400 text-2xl"></i>
              <h3 className="text-lg font-black text-white">{t('fav.update_title')}</h3>
              <p className="text-[11px] text-slate-400">{t('fav.update_desc')}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (loadedFavoriteId && favUpdatePrompt.newGenId) {
                    try {
                      // Guard against a concurrent removal of the favorite on
                      // another tab/client: verify it still exists AND is still
                      // flagged savedToFavorites before overwriting its output.
                      // (updateFavoriteRecord only writes output.*, so a removed
                      // favorite would become a ghost record with stale copy
                      // but no visible home.)
                      const favDoc = await getDoc(doc(db, 'generations', loadedFavoriteId));
                      const favData = favDoc.exists()
                        ? favDoc.data() as { feedback?: { savedToFavorites?: boolean } }
                        : null;
                      if (!favData || favData.feedback?.savedToFavorites !== true) {
                        showToast(t('fav.update_failed'), 'error');
                        setFavUpdatePrompt(null);
                        setLoadedFavoriteId(null);
                        return;
                      }
                      const newDoc = await getDoc(doc(db, 'generations', favUpdatePrompt.newGenId));
                      if (newDoc.exists()) {
                        // Fully synchronize the favorite with the new generation:
                        // output + input + metadata + creativeIdentity. Input
                        // sync matters because the user may have edited Step 1
                        // before regenerating; without it, the saved input and
                        // saved output would disagree.
                        const newData = newDoc.data() as Partial<GenerationRecord>;
                        await feedbackService.updateFavoriteRecord(loadedFavoriteId, {
                          input: newData.input,
                          output: newData.output,
                          metadata: newData.metadata,
                          creativeIdentity: newData.creativeIdentity,
                        });
                        showToast(t('fav.updated'), 'success');
                      }
                    } catch { showToast(t('fav.update_failed'), 'error'); }
                  }
                  setFavUpdatePrompt(null);
                  setLoadedFavoriteId(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all"
              >
                <i className="fa-solid fa-pen mr-1"></i> {t('fav.yes_update')}
              </button>
              <button
                onClick={async () => {
                  if (favUpdatePrompt.newGenId) {
                    try {
                      await feedbackService.toggleFavorite(favUpdatePrompt.newGenId, true);
                      showToast(t('fav.saved_new'), 'success');
                    } catch {
                      showToast(t('fav.save_failed'), 'error');
                    }
                  }
                  setFavUpdatePrompt(null);
                  setLoadedFavoriteId(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white text-[9px] font-bold uppercase tracking-wider transition-all"
              >
                <i className="fa-solid fa-copy mr-1"></i> {t('fav.keep_both')}
              </button>
            </div>
            <button
              onClick={() => { setFavUpdatePrompt(null); setLoadedFavoriteId(null); }}
              className="w-full py-2 text-[9px] text-slate-600 hover:text-slate-300 transition-all"
            >
              {t('fav.skip')}
            </button>
          </div>
        </div>
      )}

      {/* ═══ UPGRADE / TOP-UP MODAL ═══ */}
      {/* ═══ CAROUSEL COPY PREVIEW MODAL ═══ */}
      {showCarouselPreview && carouselCopies.length > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-8 space-y-6">
              <div className="text-center space-y-2">
                <h3 className="text-3xl font-black text-white italic uppercase tracking-tight">Carousel Copy Preview</h3>
                <p className="text-sm text-slate-400">{carouselCopies.length} slides — edit text below, then render all</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {carouselCopies.map((copy, idx) => (
                  <div key={idx} className={`p-5 rounded-2xl border space-y-3 ${idx === 0 ? 'bg-blue-950/30 border-blue-500/30' : 'bg-slate-900/60 border-slate-800'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Slide {idx + 1}</span>
                      <div className="flex items-center gap-1">
                        {idx === 0 && <span className="text-[8px] bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded-lg font-bold mr-2">HOOK</span>}
                        <button onClick={() => moveCarouselSlide(idx, 'up')} disabled={idx === 0} className="w-6 h-6 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 text-[10px] transition-colors" title="Move up"><i className="fa-solid fa-arrow-up"></i></button>
                        <button onClick={() => moveCarouselSlide(idx, 'down')} disabled={idx === carouselCopies.length - 1} className="w-6 h-6 rounded bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 text-[10px] transition-colors" title="Move down"><i className="fa-solid fa-arrow-down"></i></button>
                        <button onClick={() => addCarouselSlide(idx)} className="w-6 h-6 rounded bg-slate-800 text-emerald-400/60 hover:text-emerald-400 text-[10px] transition-colors" title="Add slide after"><i className="fa-solid fa-plus"></i></button>
                        {carouselCopies.length > 2 && <button onClick={() => deleteCarouselSlide(idx)} className="w-6 h-6 rounded bg-slate-800 text-red-400/40 hover:text-red-400 text-[10px] transition-colors" title="Delete slide"><i className="fa-solid fa-trash"></i></button>}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Headline</label>
                        <input
                          value={copy.hookText}
                          onChange={(e) => updateCarouselCopy(idx, 'hookText', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-bold outline-none focus:ring-1 focus:ring-blue-500"
                          dir="auto"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-500 uppercase">Subheadline</label>
                        <input
                          value={copy.subheadText}
                          onChange={(e) => updateCarouselCopy(idx, 'subheadText', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-300 outline-none focus:ring-1 focus:ring-blue-500"
                          dir="auto"
                        />
                      </div>
                      {/* CTA & Benefit — only on the LAST slide */}
                      {idx === carouselCopies.length - 1 && (
                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/50">
                          <div>
                            <label className="text-[9px] font-bold text-amber-500/80 uppercase">CTA (Final Slide)</label>
                            <input
                              value={copy.ctaText}
                              onChange={(e) => updateCarouselCopy(idx, 'ctaText', e.target.value)}
                              className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-1.5 text-[11px] text-blue-400 font-bold outline-none focus:ring-1 focus:ring-amber-500"
                              dir="auto"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-amber-500/80 uppercase">Benefit</label>
                            <input
                              value={copy.benefitText}
                              onChange={(e) => updateCarouselCopy(idx, 'benefitText', e.target.value)}
                              className="w-full bg-slate-950 border border-amber-500/30 rounded-lg px-3 py-1.5 text-[11px] text-slate-400 outline-none focus:ring-1 focus:ring-amber-500"
                              dir="auto"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Refinement box for carousel copies */}
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-3">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                  <i className="fa-solid fa-wand-magic-sparkles text-blue-400"></i> Refine All Copies (optional)
                </label>
                <textarea
                  id="carousel-copy-refinement"
                  placeholder="e.g. Make slide 2 more emotional, shorten all headlines, add more urgency to the CTA..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors resize-none h-20"
                  dir="auto"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCarouselCopyConfirm}
                  className="flex-1 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-black uppercase tracking-wider shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <i className="fa-solid fa-layer-group"></i>
                  <span>Confirm & Generate Blueprints</span>
                </button>
                <button
                  onClick={async () => {
                    if (!selectedTov || !inputs) return;
                    const regenSlideCount = inputs.slideCount || 3;
                    if (!deductCredits('generateCarouselCopies', regenSlideCount)) return;
                    const refinementEl = document.getElementById('carousel-copy-refinement') as HTMLTextAreaElement | null;
                    const refinement = refinementEl?.value || '';
                    startLoad('Regenerating slide copies...');
                    try {
                      const copies = await gemini.generateCarouselSlideCopies(selectedTov, inputs, regenSlideCount, resolvedUniverse, refinement);
                      setCarouselCopies(copies);
                      showToast('Copies regenerated!', 'success');
                    } catch (e: any) { refundCredits('generateCarouselCopies', regenSlideCount); handleApiError(e); } finally { stopLoad(); }
                  }}
                  className="px-6 py-4 rounded-2xl bg-amber-600/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold hover:bg-amber-600/30 transition-all flex items-center gap-2"
                >
                  <i className="fa-solid fa-rotate-right"></i> Regenerate Copies
                </button>
                <button
                  onClick={() => setShowCarouselPreview(false)}
                  className="px-6 py-4 rounded-2xl bg-slate-800 text-slate-400 text-sm font-bold hover:text-white transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ═══ BILLING MODAL (in-app subscription management) ═══ */}
      {showBillingModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => { setShowBillingModal(false); setShowCancelFlow(false); setCancelStep(1); }}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl shadow-black/80 max-w-xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>

            {/* ─── CANCELLATION FLOW (overlays billing modal) ─── */}
            {showCancelFlow ? (
              <div className="p-8 space-y-6">
                {/* Step indicator */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex gap-1.5">
                    {[1, 2, 3].map(s => (
                      <div key={s} className={`w-8 h-1 rounded-full transition-all ${s <= cancelStep ? 'bg-rose-500' : 'bg-slate-800'}`}></div>
                    ))}
                  </div>
                  <button onClick={() => { setShowCancelFlow(false); setCancelStep(1); }} className="text-slate-600 hover:text-white transition-all">
                    <i className="fa-solid fa-xmark"></i>
                  </button>
                </div>

                {/* Step 1: 50% off offer */}
                {cancelStep === 1 && (
                  <div className="space-y-6 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-rose-500/10 flex items-center justify-center mx-auto">
                      <i className="fa-solid fa-heart-crack text-rose-400 text-2xl"></i>
                    </div>
                    <h3 className="text-xl font-black text-white">Sorry to see you go!</h3>
                    <p className="text-sm text-slate-400 leading-relaxed">Before you cancel, we'd love to offer you a special deal to stay with us.</p>
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 space-y-3">
                      <div className="text-3xl font-black text-emerald-400">50% OFF</div>
                      <p className="text-sm text-slate-300">for the next <span className="text-emerald-400 font-bold">3 months</span></p>
                      <p className="text-[11px] text-slate-500">That's {PLANS[userPlan]?.name || 'your plan'} at half price. No code needed.</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleRetentionDiscount('retention_50_3mo')} disabled={cancelLoading}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all disabled:opacity-50">
                        {cancelLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-tag mr-2"></i>Claim 50% Off</>}
                      </button>
                      <button onClick={() => setCancelStep(2)} disabled={cancelLoading}
                        className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-bold transition-all">
                        Continue Cancelling
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: Founder message + 25% forever */}
                {cancelStep === 2 && (
                  <div className="space-y-6 text-center">
                    <div className="flex items-start gap-4 bg-slate-900/60 rounded-2xl p-5 text-left">
                      <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                        <i className="fa-solid fa-user text-blue-400"></i>
                      </div>
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-white">Eslam — Founder, Pro Ads AI</p>
                        <div className="bg-slate-800/60 rounded-xl rounded-tl-sm p-4">
                          <p className="text-sm text-slate-300 leading-relaxed">
                            I personally review every cancellation. Tell me what's not working and I'll make it right.
                            As a thank you for your time, here's <span className="text-amber-400 font-bold">25% off forever</span>.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 space-y-3">
                      <div className="text-3xl font-black text-amber-400">25% OFF</div>
                      <p className="text-sm text-slate-300"><span className="text-amber-400 font-bold">Forever</span> — for as long as you're subscribed</p>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={() => handleRetentionDiscount('retention_25_forever')} disabled={cancelLoading}
                        className="flex-1 py-3.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold transition-all disabled:opacity-50">
                        {cancelLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-tag mr-2"></i>Claim 25% Off Forever</>}
                      </button>
                      <button onClick={() => setCancelStep(3)} disabled={cancelLoading}
                        className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-[11px] font-bold transition-all">
                        Continue Cancelling
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Final wall + reason survey */}
                {cancelStep === 3 && (
                  <div className="space-y-5">
                    <h3 className="text-lg font-black text-white text-center">Here's what you'll lose</h3>
                    <div className="space-y-2">
                      {[
                        { icon: 'fa-folder-open', text: 'All your saved projects & generated ads' },
                        { icon: 'fa-brain', text: 'Your trained AI (brand voice + audience data)' },
                        { icon: 'fa-tag', text: 'Current pricing (prices increasing soon)' },
                        { icon: 'fa-coins', text: `Your remaining ${userCredits} credits` },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-3 bg-rose-500/5 border border-rose-500/10 rounded-xl px-4 py-3">
                          <i className={`fa-solid ${item.icon} text-rose-400/60 text-[11px] w-4`}></i>
                          <span className="text-[11px] text-slate-300">{item.text}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-3 pt-2">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Please share your reason <span className="text-rose-400">*</span></p>
                      {[
                        { id: 'too_expensive', label: 'Too expensive' },
                        { id: 'missing_features', label: 'Missing features I need' },
                        { id: 'output_quality', label: 'Output quality not satisfactory' },
                        { id: 'too_complicated', label: 'Too complicated to use' },
                        { id: 'not_using', label: 'Not using it enough' },
                        { id: 'other', label: 'Other' },
                      ].map(r => (
                        <label key={r.id} className={`flex items-center gap-3 px-4 py-2.5 rounded-xl cursor-pointer transition-all ${cancelReason === r.id ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-slate-900/40 border border-slate-800/40 hover:border-slate-700'}`}>
                          <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${cancelReason === r.id ? 'border-rose-500 bg-rose-500' : 'border-slate-600'}`}>
                            {cancelReason === r.id && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                          </div>
                          <input type="radio" name="cancelReason" value={r.id} checked={cancelReason === r.id}
                            onChange={() => setCancelReason(r.id)} className="hidden" />
                          <span className="text-[11px] text-slate-300">{r.label}</span>
                        </label>
                      ))}
                    </div>

                    <textarea value={cancelFeedback} onChange={(e) => setCancelFeedback(e.target.value)}
                      placeholder="Anything else you'd like to share? (optional)"
                      className="w-full bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 text-[11px] text-white placeholder-slate-600 outline-none focus:border-slate-700 resize-none h-20" />

                    <div className="flex gap-3 pt-2">
                      <button onClick={() => { setShowCancelFlow(false); setCancelStep(1); }}
                        className="flex-1 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold transition-all">
                        <i className="fa-solid fa-arrow-left mr-2"></i>Keep My Account
                      </button>
                      <button onClick={handleCancelSubscription} disabled={cancelLoading || !cancelReason}
                        className="flex-1 py-3.5 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-500 hover:text-rose-400 text-[11px] font-bold transition-all disabled:opacity-30 border border-transparent hover:border-rose-500/20">
                        {cancelLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Cancel Now'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ─── MAIN BILLING MODAL ─── */
              <>
                {/* Header with tabs */}
                <div className="sticky top-0 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 rounded-t-3xl z-10">
                  <div className="px-8 pt-5 pb-0 flex items-center justify-between">
                    <h2 className="text-sm font-black text-white uppercase tracking-wider">Billing & Subscription</h2>
                    <button onClick={() => setShowBillingModal(false)} className="text-slate-600 hover:text-white transition-all">
                      <i className="fa-solid fa-xmark text-lg"></i>
                    </button>
                  </div>
                  <div className="flex px-8 pt-4 gap-1">
                    {([['manage', 'Manage', 'fa-sliders'], ['upgrade', 'Plans', 'fa-arrow-up'], ['payment', 'Payment', 'fa-credit-card']] as const).map(([tab, label, icon]) => (
                      <button key={tab} onClick={() => setBillingTab(tab)}
                        className={`px-4 py-2.5 rounded-t-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${billingTab === tab ? 'bg-slate-800/60 text-white border-b-2 border-blue-500' : 'text-slate-500 hover:text-white'}`}>
                        <i className={`fa-solid ${icon} text-[9px]`}></i>{label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-8 space-y-6">
                  {/* ─── TAB: MANAGE ─── */}
                  {billingTab === 'manage' && (
                    <div className="space-y-5">
                      {/* Current plan card */}
                      <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Current Plan</p>
                            <p className="text-lg font-black text-white mt-1">{PLANS[userPlan]?.name || 'Free'}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase ${billingData?.cancelAtPeriodEnd ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : billingData?.status === 'past_due' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                            {billingData?.cancelAtPeriodEnd ? 'Cancelling' : billingData?.status === 'past_due' ? 'Past Due' : billingData?.status || 'Active'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/40 rounded-xl p-3">
                            <p className="text-[9px] text-slate-500 font-bold">Credits</p>
                            <p className="text-sm font-bold text-white mt-0.5">{userCredits.toLocaleString()}</p>
                          </div>
                          <div className="bg-slate-950/40 rounded-xl p-3">
                            <p className="text-[9px] text-slate-500 font-bold">{billingData?.cancelAtPeriodEnd ? 'Access Until' : 'Renews'}</p>
                            <p className="text-sm font-bold text-white mt-0.5">
                              {billingData?.currentPeriodEnd ? new Date(billingData.currentPeriodEnd * 1000).toLocaleDateString() : '—'}
                            </p>
                          </div>
                        </div>

                        {billingData?.paymentMethod && (
                          <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl p-3">
                            <i className="fa-solid fa-credit-card text-slate-600 text-[11px]"></i>
                            <span className="text-[11px] text-slate-300 capitalize">{billingData.paymentMethod.brand}</span>
                            <span className="text-[11px] text-slate-500">••••{billingData.paymentMethod.last4}</span>
                            <span className="text-[11px] text-slate-600 ml-auto">exp {billingData.paymentMethod.expMonth}/{billingData.paymentMethod.expYear}</span>
                          </div>
                        )}

                        {billingData?.amount && (
                          <div className="flex items-center gap-2 bg-slate-950/40 rounded-xl p-3">
                            <i className="fa-solid fa-receipt text-slate-600 text-[11px]"></i>
                            <span className="text-[11px] text-slate-300">${billingData.amount}/{billingData.interval}</span>
                          </div>
                        )}
                      </div>

                      {/* Cancelling banner */}
                      {billingData?.cancelAtPeriodEnd && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5 space-y-3">
                          <p className="text-[11px] text-amber-300">
                            <i className="fa-solid fa-clock mr-2"></i>
                            Your subscription will end on <span className="font-bold">{new Date(billingData.currentPeriodEnd * 1000).toLocaleDateString()}</span>
                          </p>
                          <button onClick={handleReactivate} disabled={billingLoading}
                            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold transition-all disabled:opacity-50">
                            {billingLoading ? <i className="fa-solid fa-spinner fa-spin"></i> : <><i className="fa-solid fa-rotate-left mr-2"></i>Reactivate Subscription</>}
                          </button>
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="space-y-2">
                        <button onClick={() => setBillingTab('upgrade')}
                          className="w-full py-3.5 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 text-[11px] font-bold hover:bg-blue-600/20 transition-all flex items-center justify-center gap-2">
                          <i className="fa-solid fa-arrow-up"></i> Change Plan
                        </button>
                        <button onClick={() => setBillingTab('payment')}
                          className="w-full py-3.5 rounded-xl bg-slate-800/40 border border-slate-700/30 text-slate-400 text-[11px] font-bold hover:text-white transition-all flex items-center justify-center gap-2">
                          <i className="fa-solid fa-credit-card"></i> Update Payment Method
                        </button>
                      </div>

                      {/* Cancel link */}
                      {userPlan !== 'none' && !billingData?.cancelAtPeriodEnd && (
                        <button onClick={() => setShowCancelFlow(true)}
                          className="w-full text-center text-[10px] text-slate-600 hover:text-rose-400 transition-all py-2">
                          Cancel subscription
                        </button>
                      )}

                      {billingLoading && (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <i className="fa-solid fa-spinner fa-spin text-blue-500"></i>
                          <span className="text-[10px] text-slate-500">Loading billing details...</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─── TAB: UPGRADE / CHANGE PLAN ─── */}
                  {billingTab === 'upgrade' && (
                    <div className="space-y-5">
                      <p className="text-[11px] text-slate-400 text-center">Changes take effect immediately with prorated billing.</p>
                      {(['starter', 'pro', 'scale'] as const).map(planKey => {
                        const plan = PLANS[planKey];
                        if (!plan) return null;
                        const isCurrent = userPlan === planKey;
                        return (
                          <div key={planKey} className={`rounded-2xl border p-5 transition-all ${isCurrent ? 'bg-blue-500/5 border-blue-500/20' : 'bg-slate-900/40 border-slate-800/40 hover:border-slate-700'}`}>
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-black text-white">{plan.name}</span>
                                  {isCurrent && <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[8px] font-bold rounded-full uppercase">Current</span>}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-1">{getApproxAdsPerMonth(plan)} Ads / month <span className="text-slate-600">({plan.monthlyCredits?.toLocaleString() || '—'} credits)</span></p>
                              </div>
                              {!isCurrent && (
                                <button onClick={() => {
                                  const billingKey = `${planKey}_monthly`;
                                  if (GHL_URLS[billingKey]) window.open(GHL_URLS[billingKey], '_blank');
                                }}
                                  className={`px-4 py-2 rounded-lg text-[10px] font-bold transition-all ${(['starter', 'pro', 'scale'].indexOf(planKey) > ['starter', 'pro', 'scale'].indexOf(userPlan))
                                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-400'
                                    }`}>
                                  {(['starter', 'pro', 'scale'].indexOf(planKey) > ['starter', 'pro', 'scale'].indexOf(userPlan)) ? 'Upgrade' : 'Downgrade'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ─── TAB: PAYMENT ─── */}
                  {billingTab === 'payment' && (
                    <div className="space-y-5">
                      {billingData?.paymentMethod ? (
                        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5 space-y-4">
                          <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold">Current Payment Method</p>
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                              <i className={`fa-brands ${billingData.paymentMethod.brand === 'visa' ? 'fa-cc-visa' : billingData.paymentMethod.brand === 'mastercard' ? 'fa-cc-mastercard' : 'fa-cc-stripe'} text-lg text-slate-400`}></i>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white capitalize">{billingData.paymentMethod.brand} ••••{billingData.paymentMethod.last4}</p>
                              <p className="text-[10px] text-slate-500">Expires {billingData.paymentMethod.expMonth}/{billingData.paymentMethod.expYear}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5 text-center">
                          <i className="fa-solid fa-credit-card text-2xl text-slate-700 mb-3"></i>
                          <p className="text-[11px] text-slate-500">No payment method on file</p>
                        </div>
                      )}

                      <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-5 text-center space-y-3">
                        <i className="fa-solid fa-lock text-blue-400/40 text-lg"></i>
                        <p className="text-[11px] text-slate-400">Payment method updates will be available when Paddle integration is active.</p>
                        <p className="text-[9px] text-slate-600">Encrypted & secure. Powered by Paddle.</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ UPGRADE MODAL (inlined) ═══ */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setShowUpgradeModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl shadow-black/80 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="sticky top-0 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800 px-8 py-5 flex items-center justify-between rounded-t-3xl z-10">
              <div>
                <h2 className="text-lg font-black text-white">Add More Credits</h2>
                {upgradeReason && <p className="text-xs text-amber-400 mt-1"><i className="fa-solid fa-triangle-exclamation mr-1"></i>{upgradeReason}</p>}
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 hover:text-white transition-all">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Quick Top-Ups */}
              <div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4"><i className="fa-solid fa-bolt text-amber-500 mr-2"></i>Quick Top-Up</h3>
                <div className="grid grid-cols-3 gap-3">
                  {TOPUP_PACKS.map(pack => (
                    <button
                      key={pack.id}
                      disabled={topupLoading === pack.id}
                      onClick={async () => {
                        setTopupLoading(pack.id);
                        try {
                          const createCheckout = httpsCallable(functions, 'paddleTopupCheckout');
                          const result = await createCheckout({ packId: `topup_${pack.credits}` });
                          const data = result.data as { url: string };
                          if (data.url) window.location.href = data.url;
                        } catch (e: any) {
                          showToast(`Top-up failed: ${e.message}`, 'error');
                        } finally {
                          setTopupLoading(null);
                        }
                      }}
                      className="group bg-slate-900 border border-slate-800 rounded-2xl p-4 text-center hover:border-amber-500/50 hover:bg-amber-500/5 transition-all disabled:opacity-50"
                    >
                      {topupLoading === pack.id ? (
                        <div className="text-amber-400 text-sm"><i className="fa-solid fa-spinner fa-spin"></i></div>
                      ) : (
                        <>
                          <div className="text-2xl font-black text-amber-400 group-hover:scale-110 transition-transform">+{pack.credits}</div>
                          <div className="text-[9px] text-slate-500 uppercase mt-1">Credits</div>
                          <div className="text-sm font-bold text-white mt-2">${pack.price}</div>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                <p className="text-[8px] text-slate-600 text-center mt-2"><i className="fa-solid fa-lock mr-1"></i>Secure checkout powered by Paddle · Card saved for future purchases</p>
              </div>

              {/* Upgrade Plan — only shown when triggered from Upgrade menu or feature gates */}
              {upgradeReason && userPlan !== 'scale' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest"><i className="fa-solid fa-rocket text-blue-500 mr-2"></i>Upgrade Plan</h3>
                    <div className="flex items-center gap-2 bg-slate-900 rounded-full p-1 border border-slate-800">
                      <button
                        onClick={() => setUpgradeAnnual(false)}
                        className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all ${!upgradeAnnual ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                      >Monthly</button>
                      <button
                        onClick={() => setUpgradeAnnual(true)}
                        className={`px-4 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${upgradeAnnual ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                      >Annual <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black ${upgradeAnnual ? 'bg-emerald-400/20 text-emerald-200' : 'bg-emerald-500/15 text-emerald-500'}`}>SAVE 20%</span></button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {(['starter', 'pro', 'scale'] as UserPlan[])
                      .filter(p => {
                        const order: Record<UserPlan, number> = { none: 0, starter: 1, pro: 2, scale: 3 };
                        return order[p] > order[userPlan];
                      })
                      .map(planKey => {
                        const plan = PLANS[planKey];
                        const price = upgradeAnnual ? plan.priceAnnualPerMonth : plan.priceMonthly;
                        const billingKey = `${planKey}_${upgradeAnnual ? 'annual' : 'monthly'}`;
                        const isPopular = planKey === 'pro';
                        return (
                          <div key={planKey} className={`bg-slate-900 border rounded-2xl p-5 flex items-center justify-between transition-all ${isPopular ? 'border-blue-500/50 ring-1 ring-blue-500/20' : 'border-slate-800 hover:border-blue-500/30'}`}>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-black text-white">{plan.name}</span>
                                <span className="text-[9px] bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded-full font-bold">{getApproxAdsPerMonth(plan)} Ads / month</span>
                                <span className="text-[8px] text-slate-500">({plan.monthlyCredits} credits)</span>
                                {isPopular && <span className="text-[8px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-black">MOST POPULAR</span>}
                              </div>
                              {plan.subtitle && <p className="text-[9px] text-slate-500 mt-0.5">{plan.subtitle}</p>}
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-lg font-black text-white">${price}<span className="text-[10px] text-slate-500 font-normal">/mo</span></span>
                                {upgradeAnnual && <span className="text-[9px] text-emerald-400 line-through opacity-60">${plan.priceMonthly}/mo</span>}
                                {upgradeAnnual && <span className="text-[8px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Save {Math.round((1 - plan.priceAnnualPerMonth / plan.priceMonthly) * 100)}%</span>}
                              </div>
                            </div>
                            <button
                              onClick={() => window.open(GHL_URLS[billingKey], '_blank')}
                              className={`px-6 py-3 rounded-xl text-white text-[10px] font-bold uppercase tracking-wider transition-all active:scale-95 ${isPopular ? 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/20' : 'bg-slate-800 hover:bg-slate-700'}`}
                            >
                              Start Creating Ads
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Compare All Features — only shown when triggered from Upgrade menu or feature gates */}
              {upgradeReason && (
                <Suspense fallback={null}>
                  <PricingTableLazy />
                </Suspense>
              )}

              {/* Current Plan + Manage Subscription */}
              <div className="text-center text-[10px] text-slate-600 border-t border-slate-800 pt-4 space-y-2">
                <div>Current plan: <span className="text-blue-400 font-bold">{PLANS[userPlan]?.name}</span> · Credits remaining: <span className="text-amber-400 font-bold">{userCredits}</span></div>
                <button onClick={() => { setShowUpgradeModal(false); handleManageBilling(); }} className="text-[10px] text-slate-500 hover:text-blue-400 underline underline-offset-2 transition-all">
                  <i className="fa-solid fa-credit-card mr-1"></i>Manage Subscription & Billing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION DIALOG */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={() => setShowDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center"><i className="fa-solid fa-trash text-red-400 text-xl"></i></div>
              <h3 className="text-lg font-black text-white">Delete Project?</h3>
              <p className="text-sm text-slate-400">This action cannot be undone. All designs, scripts, and settings will be permanently deleted.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 text-[11px] font-bold uppercase tracking-wider hover:bg-slate-700 transition-all">Cancel</button>
                <button onClick={(e) => { deleteProject(e as any, showDeleteConfirm); setShowDeleteConfirm(null); }} className="flex-1 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold uppercase tracking-wider transition-all">Delete</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (() => {
        const project = projects.find(p => p.id === deleteTarget);
        return project ? (
          <DeleteProjectDialog
            projectName={project.name}
            onConfirm={() => confirmDelete(deleteTarget!)}
            onCancel={() => setDeleteTarget(null)}
          />
        ) : null;
      })()}

      {/* SETTINGS MODAL */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setShowSettingsModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] max-w-lg w-full mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-b from-amber-900/20 to-transparent p-8 pb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Settings</h2>
                <button onClick={() => setShowSettingsModal(false)} className="text-slate-600 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
            </div>
            <div className="p-8 pt-2 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Display Name */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Display Name</label>
                {settingsEditingName ? (
                  <div className="flex items-center gap-2">
                    <input type="text" value={settingsDisplayName} onChange={e => setSettingsDisplayName(e.target.value)} placeholder="Your name"
                      className="flex-1 bg-slate-900/40 border border-blue-500/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors" autoFocus />
                    <button onClick={async () => {
                      if (!user || !settingsDisplayName.trim()) return;
                      try {
                        const { updateProfile } = await import('firebase/auth');
                        await updateProfile(user, { displayName: settingsDisplayName.trim() });
                        showToast('Display name updated!', 'success');
                        setSettingsEditingName(false);
                      } catch { showToast('Failed to update name', 'error'); }
                    }} className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold transition-all">Save</button>
                    <button onClick={() => setSettingsEditingName(false)} className="px-3 py-3 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-bold transition-all hover:text-white">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setSettingsDisplayName(user?.displayName || ''); setSettingsEditingName(true); }}
                    className="w-full flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 hover:border-blue-500/30 transition-all text-left">
                    <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center shrink-0">
                      {user?.photoURL ? <img src={user.photoURL} className="w-full h-full rounded-full object-cover" /> : <i className="fa-solid fa-user text-blue-400 text-xs"></i>}
                    </div>
                    <span className="text-sm text-white flex-1">{user?.displayName || user?.email?.split('@')[0] || 'User'}</span>
                    <i className="fa-solid fa-pen text-slate-700 text-[9px]"></i>
                  </button>
                )}
              </div>
              {/* Email */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Email Address</label>
                {settingsEditingEmail ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
                      <i className="fa-solid fa-envelope text-slate-600 text-xs"></i>
                      <span className="text-sm text-slate-500">Current: {user?.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="email" value={settingsNewEmail} onChange={e => setSettingsNewEmail(e.target.value)} placeholder="New email address"
                        className="flex-1 bg-slate-900/40 border border-blue-500/30 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-blue-500 transition-colors" autoFocus />
                      <button onClick={async () => {
                        if (!user || !settingsNewEmail.trim()) return;
                        try {
                          const { verifyBeforeUpdateEmail } = await import('firebase/auth');
                          await verifyBeforeUpdateEmail(user, settingsNewEmail.trim());
                          showToast('Verification email sent to your new address. Please confirm to complete the change.', 'success');
                          setSettingsEditingEmail(false);
                          setSettingsNewEmail('');
                        } catch (err: any) {
                          if (err?.code === 'auth/requires-recent-login') showToast('Please sign out and sign back in, then try again.', 'error');
                          else showToast('Failed to update email', 'error');
                        }
                      }} className="px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-[10px] font-bold transition-all">Verify</button>
                      <button onClick={() => { setSettingsEditingEmail(false); setSettingsNewEmail(''); }} className="px-3 py-3 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-bold transition-all hover:text-white">Cancel</button>
                    </div>
                    <p className="text-[8px] text-slate-600">A verification email will be sent to your new address. Your email won't change until you confirm.</p>
                  </div>
                ) : (
                  <button onClick={() => setSettingsEditingEmail(true)}
                    className="w-full flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 hover:border-blue-500/30 transition-all text-left">
                    <i className="fa-solid fa-envelope text-slate-600 text-xs"></i>
                    <span className="text-sm text-white flex-1">{user?.email || 'Not set'}</span>
                    <i className="fa-solid fa-pen text-slate-700 text-[9px]"></i>
                  </button>
                )}
              </div>
              {/* Password */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Password</label>
                <button onClick={async () => { if (!user?.email) return; try { const { sendPasswordResetEmail } = await import('firebase/auth'); await sendPasswordResetEmail(auth, user.email); showToast('Password reset email sent!', 'success'); } catch { showToast('Failed to send reset email', 'error'); } }} className="w-full flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 hover:border-blue-500/30 transition-all text-left">
                  <i className="fa-solid fa-key text-slate-600 text-xs"></i><span className="text-sm text-slate-400">Send password reset email</span><i className="fa-solid fa-arrow-right text-slate-700 text-[10px] ml-auto"></i>
                </button>
              </div>
              {/* Connected Accounts */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Connected Accounts</label>
                <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
                  <i className="fa-brands fa-google text-xs" style={{ color: user?.providerData?.[0]?.providerId === 'google.com' ? '#4285f4' : '#4a5568' }}></i>
                  <span className="text-sm text-slate-300">Google</span>
                  <span className={`ml-auto text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${user?.providerData?.[0]?.providerId === 'google.com' ? 'bg-green-500/15 text-green-400' : 'bg-slate-800 text-slate-600'}`}>
                    {user?.providerData?.[0]?.providerId === 'google.com' ? 'Connected' : 'Not connected'}
                  </span>
                </div>
              </div>
              {/* Notification Preferences */}
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Email Notifications</label>
                <div className="space-y-2">
                  {[{ key: 'billing', label: 'Billing & payment alerts', default: true }, { key: 'tips', label: 'Tips & best practices', default: true }, { key: 'updates', label: 'Product updates & new features', default: true }].map(pref => (
                    <div key={pref.key} className="flex items-center justify-between bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3">
                      <span className="text-[11px] text-slate-300">{pref.label}</span>
                      <button onClick={() => showToast('Notification preferences saved!', 'success')} className="w-9 h-5 rounded-full bg-emerald-500 relative transition-all"><span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all"></span></button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Account Info */}
              <div className="bg-slate-900/40 rounded-xl border border-slate-800/60 p-4 space-y-2">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">Account Info</p>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Plan</span><span className="text-white font-bold">{PLANS[userPlan]?.name || 'None'}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Credits</span><span className="text-white font-bold">{userCredits}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Projects</span><span className="text-white font-bold">{projects.length}</span></div>
                <div className="flex justify-between text-[10px]"><span className="text-slate-500">Member Since</span><span className="text-white font-bold">{user?.metadata?.creationTime ? new Date(user.metadata.creationTime).toLocaleDateString() : 'N/A'}</span></div>
              </div>
              {/* Danger Zone */}
              <div className="border border-red-500/10 rounded-xl p-4 space-y-3">
                <p className="text-[9px] font-black text-red-400/60 uppercase tracking-widest">Danger Zone</p>
                <button onClick={() => showToast('Please contact support to delete your account.', 'info')} className="w-full flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl px-4 py-3 hover:border-red-500/30 transition-all text-left">
                  <i className="fa-solid fa-trash text-red-400/40 text-xs"></i><span className="text-[11px] text-slate-500">Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TEAM MODAL */}
      {showTeamModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setShowTeamModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] max-w-lg w-full mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-b from-emerald-900/20 to-transparent p-8 pb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white">Team Members</h2>
                <button onClick={() => setShowTeamModal(false)} className="text-slate-600 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                {PLANS[userPlan]?.features.maxTeamMembers === -1
                  ? `Unlimited team members on your ${PLANS[userPlan]?.name} plan`
                  : PLANS[userPlan]?.features.maxTeamMembers === 0
                    ? 'Upgrade to add team members'
                    : `${teamMembers.length + teamInvites.filter((i: any) => ['pending', 'sent', 'failed'].includes(i.status)).length}/${PLANS[userPlan]?.features.maxTeamMembers} seats used (active + pending) on your ${PLANS[userPlan]?.name} plan`
                }
              </p>
            </div>
            <div className="p-8 pt-2 space-y-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {/* Owner */}
              <div className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center"><i className="fa-solid fa-crown text-amber-400 text-sm"></i></div>
                <div className="flex-1"><p className="text-[11px] font-bold text-white">{user?.displayName || user?.email?.split('@')[0] || 'You'}</p><p className="text-[9px] text-slate-500">{user?.email} &middot; Owner</p></div>
                <span className="text-[8px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400">Owner</span>
              </div>

              {/* Existing team members */}
              {teamMembers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Active Members</p>
                  {teamMembers.map((m: any) => (
                    <div key={m.id || m.email} className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-3 group">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <i className={`fa-solid ${m.role === 'editor' ? 'fa-pen' : 'fa-eye'} text-emerald-400 text-[10px]`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{m.name}</p>
                        <p className="text-[8px] text-slate-500">{m.email}</p>
                      </div>
                      <span className="text-[7px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">{m.role}</span>
                      <button onClick={() => handleRemoveTeamMember(m.id)} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all px-1"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invites (non-accepted) */}
              {teamInvites.filter((inv: any) => inv.status !== 'accepted').length > 0 && (
                <div className="space-y-2">
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">Invites</p>
                  {teamInvites.filter((inv: any) => inv.status !== 'accepted').map((inv: any) => (
                    <div key={inv.inviteId} className="flex items-center gap-3 bg-slate-900/40 border border-slate-800 rounded-xl p-3 group">
                      <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <i className="fa-solid fa-envelope text-blue-400 text-[10px]"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold text-white truncate">{inv.inviteeName}</p>
                        <p className="text-[8px] text-slate-500">{inv.inviteeEmailNormalized}</p>
                      </div>
                      <span className={`text-[7px] font-bold uppercase px-2 py-0.5 rounded-full ${inv.status === 'sent' ? 'bg-blue-500/10 text-blue-400' :
                        inv.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                          inv.status === 'revoked' ? 'bg-slate-500/10 text-slate-400' :
                            inv.status === 'expired' ? 'bg-slate-500/10 text-slate-500' :
                              'bg-amber-500/10 text-amber-400'
                        }`}>{inv.status}</span>
                      {['pending', 'sent', 'failed'].includes(inv.status) && (
                        <>
                          <button onClick={() => handleResendInvite(inv.inviteId)} className="text-blue-500 hover:text-blue-300 text-[9px] transition-colors" title="Resend"><i className="fa-solid fa-rotate-right"></i></button>
                          <button onClick={() => handleRevokeInvite(inv.inviteId)} className="text-slate-600 hover:text-red-400 text-[9px] transition-colors" title="Revoke"><i className="fa-solid fa-ban"></i></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Invite form */}
              {(PLANS[userPlan]?.features.maxTeamMembers || 0) !== 0 ? (
                <div className="space-y-4 bg-slate-900/30 border border-slate-800/50 rounded-2xl p-5">
                  <p className="text-[9px] font-black text-emerald-400/80 uppercase tracking-widest"><i className="fa-solid fa-user-plus mr-1.5"></i>Invite New Member</p>
                  <div className="space-y-3">
                    <div>
                      <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 block">Name</label>
                      <input type="text" value={teamInviteName} onChange={e => setTeamInviteName(e.target.value)} placeholder="Full name"
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/30 transition-colors placeholder:text-slate-700" />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 block">Email</label>
                      <input type="email" value={teamInviteEmail} onChange={e => setTeamInviteEmail(e.target.value)} placeholder="email@example.com"
                        className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-emerald-500/30 transition-colors placeholder:text-slate-700" />
                    </div>
                    <div>
                      <label className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 block">Role</label>
                      <div className="flex gap-2">
                        {([['editor', 'Editor', 'Can create projects & render ads'], ['viewer', 'Viewer', 'Can view projects only']] as const).map(([key, label, desc]) => (
                          <button key={key} onClick={() => setTeamInviteRole(key)}
                            className={`flex-1 p-3 rounded-xl text-left transition-all ${teamInviteRole === key ? 'bg-emerald-500/10 border border-emerald-500/25' : 'bg-slate-950/60 border border-slate-800 hover:border-slate-700'}`}>
                            <p className={`text-[10px] font-bold ${teamInviteRole === key ? 'text-emerald-400' : 'text-slate-400'}`}>{label}</p>
                            <p className="text-[8px] text-slate-600 mt-0.5">{desc}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={handleTeamInvite} disabled={teamInviting || !teamInviteName.trim() || !teamInviteEmail.trim()}
                      className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
                      {teamInviting ? <><div className="animate-spin w-3 h-3 border-2 border-white border-t-transparent rounded-full"></div>Sending...</> : <><i className="fa-solid fa-paper-plane"></i>Send Invite</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 text-center space-y-3">
                  <i className="fa-solid fa-users text-emerald-400/40 text-2xl"></i>
                  <p className="text-sm text-slate-300">Team collaboration requires a paid plan</p>
                  <button onClick={() => { setShowTeamModal(false); handleManageBilling(); }} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all"><i className="fa-solid fa-arrow-up mr-1.5"></i>Upgrade Plan</button>
                </div>
              )}

              {/* Role legend */}
              <div className="bg-slate-900/40 rounded-xl border border-slate-800/60 p-4">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Role Permissions</p>
                <div className="space-y-2">
                  {[
                    { role: 'Owner', perms: 'Full access, billing, invite members', icon: 'fa-crown', color: 'text-amber-400' },
                    { role: 'Editor', perms: 'Create projects, render ads, write scripts', icon: 'fa-pen', color: 'text-emerald-400' },
                    { role: 'Viewer', perms: 'View projects and designs only', icon: 'fa-eye', color: 'text-slate-400' },
                  ].map(r => (
                    <div key={r.role} className="flex items-center gap-3 text-[10px]">
                      <i className={`fa-solid ${r.icon} ${r.color} text-[9px] w-4 text-center`}></i>
                      <span className="text-white font-bold w-14">{r.role}</span>
                      <span className="text-slate-500">{r.perms}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Plan limits */}
              <div className="bg-slate-900/40 rounded-xl border border-slate-800/60 p-4">
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-3">Team Limits by Plan</p>
                <div className="space-y-2">
                  {(['starter', 'pro', 'scale'] as const).map(plan => (
                    <div key={plan} className={`flex justify-between text-[10px] ${plan === userPlan ? 'text-emerald-400 font-bold' : 'text-slate-500'}`}>
                      <span className="capitalize">{plan}{plan === userPlan ? ' (current)' : ''}</span>
                      <span>{PLANS[plan]?.features.maxTeamMembers === -1 ? 'Unlimited' : `${PLANS[plan]?.features.maxTeamMembers} member${(PLANS[plan]?.features.maxTeamMembers || 0) !== 1 ? 's' : ''}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* WORKSPACE SETTINGS MODAL (Multi-Brand — Scaling only) */}
      {showWorkspaceModal && (
        <WorkspaceSettingsModal
          workspace={editingWorkspace}
          onSave={editingWorkspace ? handleUpdateWorkspace : handleCreateWorkspace}
          onDelete={handleDeleteWorkspace}
          onClose={() => { setShowWorkspaceModal(false); setEditingWorkspace(null); }}
        />
      )}

      {/* CHANGELOG / WHAT'S NEW MODAL */}
      {showChangelogModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={() => setShowChangelogModal(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div className="relative bg-slate-950 border border-slate-800 rounded-[2rem] max-w-lg w-full mx-4 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gradient-to-b from-amber-900/20 to-transparent p-8 pb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white"><i className="fa-solid fa-sparkles text-amber-400 mr-2"></i>What's New</h2>
                <button onClick={() => setShowChangelogModal(false)} className="text-slate-600 hover:text-white transition-all"><i className="fa-solid fa-xmark text-lg"></i></button>
              </div>
            </div>
            <div className="p-8 pt-2 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {[
                { version: 'v1.4', date: 'Mar 2026', emoji: '\u{1F680}', title: 'Batch Ads & Multi-Size Export', items: ['Generate all your ad variations in one click \u2014 save hours of manual work', 'Export in every size: Feed (1:1), Portrait (4:5), Story (9:16), YouTube (16:9)', 'Get unique ad copy for each hook automatically', 'See full scene details before rendering (expandable blueprints)', 'Invite team members to collaborate on projects'] },
                { version: 'v1.3', date: 'Feb 2026', emoji: '\u{1F4B3}', title: 'Manage Your Plan In-App', items: ['View and manage your subscription without leaving the app', 'Exclusive retention offers if you ever think about leaving', 'One-click billing actions from your email notifications', 'Buy extra credits anytime with instant delivery'] },
                { version: 'v1.2', date: 'Feb 2026', emoji: '\u{1F3AF}', title: 'Retargeting & Carousel Ads', items: ['Re-engage warm audiences with 5 proven retargeting angles', 'Create swipeable carousel ads with up to 9 slides', 'Analyze what your competitors are doing and beat them', 'Auto-import your brand colors and style from your website'] },
                { version: 'v1.1', date: 'Jan 2026', emoji: '\u2728', title: 'The AI Ad Engine is Live', items: ['AI writes scroll-stopping hooks tailored to your offer', 'Get 3 unique visual concepts for every hook', 'Professional ad images generated in seconds', 'Arabic & English ad copy that converts', 'Save your work and pick up where you left off'] },
              ].map((release, ri) => {
                const colors = ['emerald', 'blue', 'purple', 'amber'];
                const c = colors[ri % colors.length];
                return (
                  <div key={release.version} className="bg-slate-900/40 rounded-2xl border border-slate-800/60 p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase ${ri === 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>{release.version}</span>
                      <span className="text-[9px] text-slate-500">{release.date}</span>
                    </div>
                    <h3 className="text-sm font-bold text-white">{release.title}</h3>
                    <div className="space-y-1.5">
                      {release.items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 text-[10px] text-slate-400">
                          <i className={`fa-solid fa-check ${ri === 0 ? 'text-emerald-400/60' : 'text-amber-400/60'} text-[7px] mt-1 shrink-0`}></i>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Suspense fallback={<div className="px-6 py-10 text-center text-sm text-slate-400">Loading dashboard...</div>}>
        <PerformanceDashboard
          isOpen={showDashboard}
          onClose={() => setShowDashboard(false)}
          metaConnected={metaConnection?.connected || false}
          isDarkMode={isDarkMode}
          adAccounts={metaConnection?.adAccounts || []}
          dashboardLevel={getFeatureLevel(userPlan, 'performanceDashboard') as 'overview' | 'full'}
          workspaceId={canUseWorkspaces ? activeWorkspaceId : null}
        />
      </Suspense>

      {/* ═══ FAVORITES PANEL ═══ */}
      {showFavorites && (() => {
        const favHooks = favoritesData.filter((f: any) => f.output?.phase === 'hooks');
        const favBlueprints = favoritesData.filter((f: any) => f.output?.phase === 'concepts');
        const favDesigns = favoritesData.filter((f: any) => f.output?.phase === 'render');
        const favCaptions = favoritesData.filter((f: any) => f.output?.phase === 'caption' || f.output?.phase === 'primary_text');
        const tabs = [
          { key: 'hooks', label: 'Hooks', icon: 'fa-bolt', count: favHooks.length },
          { key: 'blueprints', label: 'Blueprints', icon: 'fa-compass-drafting', count: favBlueprints.length },
          { key: 'designs', label: 'Designs', icon: 'fa-image', count: favDesigns.length },
          { key: 'captions', label: 'Captions', icon: 'fa-pen-nib', count: favCaptions.length },
          { key: 'all', label: 'All', icon: 'fa-layer-group', count: favoritesData.length },
        ];
        const filtered = favTab === 'hooks' ? favHooks : favTab === 'blueprints' ? favBlueprints : favTab === 'designs' ? favDesigns : favTab === 'captions' ? favCaptions : favoritesData;

        // ─── THEME TOKENS ─────────────────────────────────────────────
        const dk = isDarkMode;
        const modalShell = dk ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200 shadow-2xl';
        const modalHeaderBorder = dk ? 'border-slate-800/60' : 'border-slate-200';
        const closeBtn = dk ? 'bg-slate-800/60 text-slate-400 hover:text-white' : 'bg-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-300';
        const titleText = dk ? 'text-white' : 'text-slate-900';
        const tabBorder = dk ? 'border-slate-800/30' : 'border-slate-200';
        const tabActive = dk ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-blue-600 text-white shadow-sm';
        const tabInactive = dk ? 'text-slate-400 hover:text-white hover:bg-slate-800/50' : 'text-slate-600 hover:text-slate-800 hover:bg-white';
        const tabCount = dk ? 'opacity-60' : 'text-slate-400';
        const emptyIcon = dk ? 'text-slate-700' : 'text-slate-300';
        const emptyTitle = dk ? 'text-slate-500' : 'text-slate-600';
        const emptyHint = dk ? 'text-slate-600' : 'text-slate-400';
        const cardBg = dk ? 'bg-slate-900/60 border-slate-800/40 hover:border-blue-500/30 hover:shadow-lg hover:shadow-blue-500/5' : 'bg-white border-slate-200 shadow-sm hover:border-blue-400/50 hover:shadow-md';
        const chipBg = dk ? 'bg-slate-800/40 text-slate-600' : 'bg-slate-100 text-slate-500 border border-slate-200';
        const previewBg = dk ? 'bg-slate-950/50 border-slate-800/30' : 'bg-slate-50 border-slate-200';
        const hookContent = dk ? 'text-white' : 'text-slate-900';
        const hookSub = dk ? 'text-slate-400' : 'text-slate-600';
        const dateText = dk ? 'text-slate-600' : 'text-slate-400';
        const toneText = dk ? 'text-slate-600' : 'text-slate-500';
        const cardDivider = dk ? 'border-slate-800/30' : 'border-slate-200';
        const imgBorder = dk ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-slate-50';
        const removeBtn = dk ? 'bg-slate-800/40 text-slate-600 hover:bg-red-600/20 hover:text-red-400' : 'bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500';
        const actionPrimary = dk ? 'bg-blue-600/15 text-blue-400 hover:bg-blue-600 hover:text-white' : 'bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white border border-blue-200 hover:border-blue-600';
        const actionSecondaryViolet = dk ? 'bg-violet-600/15 text-violet-400 hover:bg-violet-600 hover:text-white' : 'bg-violet-50 text-violet-600 hover:bg-violet-600 hover:text-white border border-violet-200 hover:border-violet-600';
        const actionSecondaryEmerald = dk ? 'bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600 hover:text-white' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-600 hover:text-white border border-emerald-200 hover:border-emerald-600';
        const actionSecondaryPurple = dk ? 'bg-purple-600/15 text-purple-400 hover:bg-purple-600 hover:text-white' : 'bg-purple-50 text-purple-600 hover:bg-purple-600 hover:text-white border border-purple-200 hover:border-purple-600';

        // Phase pills
        const pillHook = dk ? 'bg-blue-500/15 text-blue-400' : 'bg-blue-50 text-blue-700 border border-blue-200';
        const pillBlueprint = dk ? 'bg-violet-500/15 text-violet-400' : 'bg-violet-50 text-violet-700 border border-violet-200';
        const pillDesign = dk ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700 border border-emerald-200';
        const pillCaption = dk ? 'bg-purple-500/15 text-purple-400' : 'bg-purple-50 text-purple-700 border border-purple-200';

        // Handler: open a favorite item by restoring its state into the app
        const handleOpenFavorite = (f: any, targetPhase?: string) => {
          const phase = targetPhase || f.output?.phase;

          // Restore inputs if available (so subsequent generations have context)
          if (f.input) {
            const restoredInputs: Partial<AdInputs> = {};
            if (f.input.productName) restoredInputs.productName = f.input.productName;
            if (f.input.niche) restoredInputs.targetAudience = f.input.niche;
            if (f.input.challenges) restoredInputs.challenges = f.input.challenges;
            if (f.input.transformation) restoredInputs.transformation = f.input.transformation;
            if (f.input.offer) restoredInputs.offerType = f.input.offer;
            if (f.input.language) restoredInputs.adLanguage = f.input.language;
            if (f.input.adType) restoredInputs.adMode = f.input.adType as AdMode;
            if (f.input.campaignType) restoredInputs.campaignType = f.input.campaignType;
            // Retargeting fields — always restore deterministically (clear stale state)
            restoredInputs.retargetingObjection = f.input.retargetingObjection ?? (f.input.retargetingObjections?.[0]) ?? undefined;
            restoredInputs.retargetingObjections = f.input.retargetingObjections ?? (f.input.retargetingObjection ? [f.input.retargetingObjection] : []);
            restoredInputs.customObjection = f.input.customObjection ?? '';
            restoredInputs.testimonial = f.input.testimonial ?? '';
            if (Object.keys(restoredInputs).length > 0) {
              if (inputs) {
                setInputs(sanitizeProjectModes({ ...inputs, ...restoredInputs }));
              } else {
                setInputs(sanitizeProjectModes({
                  productName: restoredInputs.productName || '',
                  productCategory: '',
                  transformation: restoredInputs.transformation || '',
                  challenges: restoredInputs.challenges || '',
                  offerType: restoredInputs.offerType || '',
                  targetAudience: restoredInputs.targetAudience || '',
                  cta: '',
                  campaignType: restoredInputs.campaignType || 'cold',
                  aspectRatio: (f.metadata?.aspectRatio || '1:1') as AspectRatio,
                  universeMode: 'realistic', visualStyleFamily: 'realistic',
                  preferredUniverse: '',
                  adLanguage: restoredInputs.adLanguage || 'ar_fusha',
                  adMode: restoredInputs.adMode || 'single',
                } as AdInputs));
              }
            }
          }

          if (f.output?.fullResponse) setTovText(f.output.fullResponse);
          if (f.output?.hookText) {
            const reconstructed = `HOOK_START_A\nHOOK_TEXT: ${f.output.hookText}\nSUBHEADLINE: ${f.output.subhead || ''}\nCTA_BUTTON: ${f.output.ctaText || f.input?.cta || ''}\nHOOK_END_A`;
            setSelectedTov(reconstructed);
          }
          if (f.output?.conceptText) setSelectedConcept(f.output.conceptText);
          if (f.output?.buildPlan) setBuildPlan(f.output.buildPlan);
          if (f.output?.imageUrl && f.output.imageUrl !== '(generated)') pushMockup(f.output.imageUrl, (f.metadata?.aspectRatio || '1:1') as AspectRatio);
          if (f.output?.captionText) setCaptionText(f.output.captionText);
          if (f.input?.tone) setResolvedUniverse(f.input.tone);
          if (f.metadata?.aspectRatio) setCurrentAspectRatio(f.metadata.aspectRatio as AspectRatio);

          const PHASE_MAP: Record<string, AppPhase> = {
            'hooks': 'tov_review', 'concepts': 'concept_review',
            'render': 'render_studio', 'caption': 'primary_text', 'primary_text': 'primary_text',
          };
          const targetAppPhase = PHASE_MAP[phase] || 'tov_review';
          setPhase(targetAppPhase);
          const phaseOrder: AppPhase[] = ['input', 'tov_review', 'concept_review', 'render_studio', 'primary_text'];
          const targetIdx = phaseOrder.indexOf(targetAppPhase);
          if (targetIdx > highestUnlockedPhase) setHighestUnlockedPhase(targetIdx);
          setShowFavorites(false);
        };

        return (
          <div className={`fixed inset-0 z-[200] flex items-center justify-center ${dk ? 'bg-black/70' : 'bg-black/40'} backdrop-blur-sm`} onClick={() => setShowFavorites(false)}>
            <div className={`${modalShell} border rounded-2xl w-full max-w-3xl mx-4 max-h-[85vh] overflow-hidden flex flex-col`} onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${modalHeaderBorder}`}>
                <div className="flex items-center gap-3">
                  <button onClick={() => setShowFavorites(false)} className={`w-8 h-8 rounded-lg ${closeBtn} flex items-center justify-center transition-all`}>
                    <i className="fa-solid fa-xmark text-xs"></i>
                  </button>
                  <h3 className={`text-sm font-black ${titleText} uppercase tracking-wider flex items-center gap-2`}>
                    <i className={`fa-solid fa-bookmark ${dk ? 'text-amber-400' : 'text-amber-500'}`}></i> Favorites
                  </h3>
                </div>
              </div>

              {/* Category Tabs */}
              <div className={`flex gap-1.5 px-6 pt-3 pb-2 border-b ${tabBorder}`}>
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setFavTab(tab.key)}
                    className={`px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${favTab === tab.key ? tabActive : tabInactive}`}>
                    <i className={`fa-solid ${tab.icon} text-[8px]`}></i>
                    {tab.label}
                    {tab.count > 0 && <span className={`text-[7px] ${tabCount}`}>({tab.count})</span>}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {favoritesLoading ? (
                  <div className="text-center py-16 space-y-3">
                    <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                    <p className={`text-[10px] ${emptyTitle}`}>Loading favorites...</p>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-16 space-y-3">
                    <i className={`fa-solid fa-star text-4xl ${emptyIcon}`}></i>
                    <p className={`text-sm font-semibold ${emptyTitle}`}>No {favTab === 'all' ? '' : favTab} favorites yet</p>
                    <p className={`text-[10px] ${emptyHint}`}>Click the bookmark icon on any hook, blueprint, or design to save it here</p>
                  </div>
                ) : (
                  <div className={`${favTab === 'designs' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : 'space-y-3'}`}>
                    {filtered.map((f: any) => {
                      const isHook = f.output?.phase === 'hooks';
                      const isBlueprint = f.output?.phase === 'concepts';
                      const isDesign = f.output?.phase === 'render';
                      const isCaption = f.output?.phase === 'caption' || f.output?.phase === 'primary_text';

                      return (
                        <div key={f.id} className={`${cardBg} rounded-xl p-4 border transition-all group`}>
                          {/* Meta row */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${isHook ? pillHook : isBlueprint ? pillBlueprint : isCaption ? pillCaption : pillDesign}`}>
                                {isHook ? 'Hook' : isBlueprint ? 'Blueprint' : isCaption ? 'Caption' : 'Design'}
                              </span>
                              {f.input?.tone && <span className={`text-[8px] ${toneText} truncate max-w-[150px]`}>{f.input.tone}</span>}
                              {f.feedback?.rating === 'used' && <span className={`text-[7px] font-bold ${dk ? 'text-blue-400 bg-blue-500/10' : 'text-blue-600 bg-blue-50 border border-blue-200'} px-1.5 py-0.5 rounded`}><i className="fa-solid fa-rocket mr-0.5"></i>Used</span>}
                            </div>
                            <span className={`text-[8px] ${dateText}`}>{f.timestamp?.toDate ? new Date(f.timestamp.toDate()).toLocaleDateString() : ''}</span>
                          </div>

                          {/* Hook content */}
                          {f.output?.hookText && (
                            <div dir="rtl" className={`arabic-text text-sm ${hookContent} font-bold leading-relaxed`}>{f.output.hookText}</div>
                          )}
                          {f.output?.subhead && (
                            <div dir="rtl" className={`arabic-text text-[10px] ${hookSub} leading-relaxed mt-1`}>{f.output.subhead}</div>
                          )}

                          {/* Blueprint concept text */}
                          {isBlueprint && f.output?.conceptText && (
                            <div className={`text-[10px] ${hookSub} leading-relaxed mt-2 line-clamp-3 ${previewBg} rounded-lg p-3 border`}>{f.output.conceptText.substring(0, 200)}...</div>
                          )}

                          {/* Caption preview */}
                          {isCaption && f.output?.captionText && (
                            <div dir="rtl" className={`arabic-text text-[10px] ${hookSub} leading-relaxed mt-2 line-clamp-4 ${previewBg} rounded-lg p-3 border`}>{f.output.captionText.substring(0, 300)}...</div>
                          )}

                          {/* Design image */}
                          {f.output?.imageUrl && f.output.imageUrl !== '(generated)' && (
                            <img src={f.output.imageUrl} className={`w-full max-h-[300px] object-contain rounded-lg mt-3 border ${imgBorder}`} />
                          )}

                          {/* Product info */}
                          {f.input?.productName && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className={`text-[7px] ${chipBg} px-2 py-0.5 rounded`}>{f.input.productName}</span>
                              {f.metadata?.aspectRatio && <span className={`text-[7px] ${chipBg} px-2 py-0.5 rounded`}>{f.metadata.aspectRatio}</span>}
                            </div>
                          )}

                          {/* ─── ACTION BUTTONS ─── */}
                          <div className={`flex gap-2 mt-3 pt-3 border-t ${cardDivider}`}>
                            <button onClick={() => handleOpenFavorite(f)}
                              className={`flex-1 py-2 rounded-lg ${actionPrimary} text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5`}>
                              <i className={`fa-solid ${isHook ? 'fa-bolt' : isBlueprint ? 'fa-compass-drafting' : isCaption ? 'fa-pen-nib' : 'fa-image'} text-[8px]`}></i>
                              {isHook ? 'Open Hook' : isBlueprint ? 'Open Blueprint' : isCaption ? 'Open Caption' : 'Open Design'}
                            </button>
                            {isHook && (
                              <button onClick={() => handleOpenFavorite(f, 'concepts')}
                                className={`py-2 px-3 rounded-lg ${actionSecondaryViolet} text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5`}
                                title="Generate visual concepts for this hook">
                                <i className="fa-solid fa-arrow-right text-[8px]"></i> Concepts
                              </button>
                            )}
                            {isBlueprint && (
                              <button onClick={() => handleOpenFavorite(f, 'render')}
                                className={`py-2 px-3 rounded-lg ${actionSecondaryEmerald} text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5`}
                                title="Render this blueprint into an ad">
                                <i className="fa-solid fa-arrow-right text-[8px]"></i> Render
                              </button>
                            )}
                            {isDesign && (
                              <button onClick={() => handleOpenFavorite(f, 'caption')}
                                className={`py-2 px-3 rounded-lg ${actionSecondaryPurple} text-[9px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5`}
                                title="Generate ad copy for this design">
                                <i className="fa-solid fa-arrow-right text-[8px]"></i> Caption
                              </button>
                            )}
                            <button onClick={async () => {
                              await feedbackService.toggleFavorite(f.id, false);
                              setFavoritesData(prev => prev.filter((p: any) => p.id !== f.id));
                            }}
                              className={`py-2 px-2.5 rounded-lg ${removeBtn} text-[9px] transition-all`}
                              title="Remove from favorites">
                              <i className="fa-solid fa-trash-can text-[8px]"></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

const AppWithLanguage: React.FC = () => (
  <LanguageProvider>
    <App />
  </LanguageProvider>
);

export default AppWithLanguage;