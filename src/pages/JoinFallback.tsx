// JoinFallback.tsx — shown when the /join chunk fails to load (e.g. network error).
// Statically bundled in the main entry so it is always available even when the
// dynamic JoinTeam import fails. Uses i18n so the message respects the UI language.
import React from 'react';
import { LanguageProvider, useT } from '../i18n';

const JoinFallbackInner: React.FC = () => {
  const { t, lang } = useT();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return (
    <div dir={dir} style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020617', color: '#e2e8f0', fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: '1rem' }}>
      <div>
        <p style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem' }}>{t('join.fallback.title')}</p>
        <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>{t('join.fallback.body')}</p>
      </div>
    </div>
  );
};

const JoinFallback: React.FC = () => (
  <LanguageProvider>
    <JoinFallbackInner />
  </LanguageProvider>
);

export default JoinFallback;
