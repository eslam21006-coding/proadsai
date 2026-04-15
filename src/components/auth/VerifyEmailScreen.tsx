import React, { useState } from "react";
import { useT } from "../../i18n";

interface VerifyEmailScreenProps {
  email: string;
  onResend: () => Promise<void>;
  onCheckVerified: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const VerifyEmailScreen: React.FC<VerifyEmailScreenProps> = ({
  email,
  onResend,
  onCheckVerified,
  onSignOut,
}) => {
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [lastSent, setLastSent] = useState(0);
  const { t } = useT();

  const handleResend = async () => {
    const now = Date.now();
    if (now - lastSent < 30000) return;
    setResending(true);
    try {
      await onResend();
      setResent(true);
      setLastSent(now);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 p-6">
      <div className="max-w-md w-full glass-panel p-10 rounded-[3rem] shadow-2xl space-y-8 text-center border border-white/5">
        <div className="w-20 h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto">
          <i className="fa-solid fa-envelope-circle-check text-blue-400 text-3xl"></i>
        </div>

        <h1 className="text-2xl font-black text-white">{t("login.verifyEmail.title")}</h1>
        <p className="text-sm text-slate-400">{t("login.verifyEmail.subtitle").replace("{email}", email)}</p>

        <div className="space-y-3">
          <button
            onClick={onCheckVerified}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all"
          >
            {t("login.verifyEmail.checkVerified")}
          </button>

          <button
            onClick={handleResend}
            disabled={resending}
            className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
          >
            {resent ? t("login.verifyEmail.resent") : t("login.verifyEmail.resend")}
          </button>

          <button
            onClick={onSignOut}
            className="w-full py-2 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
          >
            {t("login.verifyEmail.signOut")}
          </button>
        </div>
      </div>
    </div>
  );
};
