// src/pages/JoinTeam.tsx
import React, { useEffect, useState } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  fetchSignInMethodsForEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import { getInviteDetails, type InviteDetailsResult } from '../services/teamService';
import { LanguageProvider, useT, type UILanguage } from '../i18n';

const fnClaimTeamInvite = httpsCallable(functions, 'claimTeamInvite');

type InviteStatus = 'loading' | 'valid' | 'expired' | 'revoked' | 'accepted' | 'not_found' | 'error';

const JoinTeamInner: React.FC = () => {
  const { t, lang } = useT();
  const searchParams = new URLSearchParams(window.location.search);
  const inviteId = searchParams.get('id') || '';

  const [inviteStatus, setInviteStatus] = useState<InviteStatus>('loading');
  const [inviteData, setInviteData] = useState<InviteDetailsResult | null>(null);
  const [authMode, setAuthMode] = useState<'loading' | 'login' | 'signup' | 'success'>('loading');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!inviteId) {
      setInviteStatus('not_found');
      return;
    }
    getInviteDetails(inviteId).then((result) => {
      if (result.success) {
        setInviteData(result);
        setInviteStatus('valid');
        setEmail(result.inviteeEmail || '');
        setName(result.inviteeName || '');
        checkAuthMode(result.inviteeEmail || '');
      } else {
        const status = result.status as InviteStatus;
        setInviteStatus(status || 'error');
      }
    }).catch(() => {
      setInviteStatus('error');
    });
  }, [inviteId]);

  const checkAuthMode = async (emailAddress: string) => {
    try {
      const methods = await fetchSignInMethodsForEmail(auth, emailAddress);
      setAuthMode(methods.length > 0 ? 'login' : 'signup');
    } catch {
      setAuthMode('signup');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) { setError('Email and password are required.'); return; }
    setSubmitting(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await claimInvite();
    } catch (e: any) {
      setError(e.message || 'Login failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password || !name) { setError('All fields are required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await claimInvite();
    } catch (e: any) {
      setError(e.message || 'Account creation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const claimInvite = async () => {
    try {
      await fnClaimTeamInvite({});
      window.location.href = '/';
    } catch (e: any) {
      setError(e.message || 'Failed to join team.');
      setAuthMode('login');
    }
  };

  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  if (inviteStatus === 'loading') {
    return (
      <div dir={dir} className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-white text-lg">{t('loading')}</div>
      </div>
    );
  }

  if (inviteStatus !== 'valid') {
    const messageKey: Record<string, string> = {
      expired: 'join.expired',
      revoked: 'join.revoked',
      accepted: 'join.claimed',
      not_found: 'join.expired',
      error: 'join.expired',
    };
    return (
      <div dir={dir} className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full mx-4 text-center">
          <div className="text-4xl mb-4">
            {inviteStatus === 'expired' ? '⏰' : inviteStatus === 'revoked' ? '🚫' : inviteStatus === 'accepted' ? '✅' : '🔍'}
          </div>
          <h1 className="text-xl font-bold text-white mb-2">{t('join.title')}</h1>
          <p className="text-slate-400">{t(messageKey[inviteStatus] || 'join.expired')}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir={dir} className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-white mb-1">{t('join.title')}</h1>
        {inviteData && (
          <div className="mb-6 text-sm text-slate-400 space-y-1">
            <p>{lang === 'ar' ? 'مدعو من قبل' : 'Invited by'} <span className="text-white font-medium">{inviteData.ownerName}</span></p>
            <p>{lang === 'ar' ? 'الدور' : 'Role'}: <span className="text-white font-medium">{inviteData.role === 'editor' ? t('team.role_member') : t('team.role_viewer')}</span></p>
            <p>{lang === 'ar' ? 'الخطة' : 'Plan'}: <span className="text-white font-medium capitalize">{inviteData.teamPlan}</span></p>
          </div>
        )}

        {authMode === 'loading' ? (
          <div className="text-slate-400">{t('loading')}</div>
        ) : authMode === 'login' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" value={email} disabled className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm opacity-60 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('login.password_placeholder')}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleLogin} disabled={submitting} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors">
              {submitting ? t('login.please_wait') : t('join.login')}
            </button>
          </div>
        ) : authMode === 'signup' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{lang === 'ar' ? 'الاسم الكامل' : 'Full Name'}</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" value={email} disabled className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm opacity-60 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('login.password_placeholder')}</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{lang === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={handleSignup} disabled={submitting} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors">
              {submitting ? t('login.please_wait') : t('join.create_account')}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const JoinTeam: React.FC = () => (
  <LanguageProvider>
    <JoinTeamInner />
  </LanguageProvider>
);

export default JoinTeam;
