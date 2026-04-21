import React, { useState } from "react";
import { useT } from "../../i18n";

interface ForgotPasswordDialogProps {
  onSubmit: (email: string) => Promise<void>;
  onClose: () => void;
}

export const ForgotPasswordDialog: React.FC<ForgotPasswordDialogProps> = ({ onSubmit, onClose }) => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const { t } = useT();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    await onSubmit(email);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm"></div>
      <div
        className="relative bg-slate-950 border border-slate-800 rounded-3xl shadow-2xl max-w-md w-full mx-4 p-8 space-y-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-black text-white">{t("login.forgotPasswordDialog.title")}</h2>

        {submitted ? (
          <p className="text-sm text-slate-300">{t("login.forgotPasswordDialog.confirmation")}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-slate-400">{t("login.forgotPasswordDialog.emailPrompt")}</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl px-4 py-4 text-white outline-none focus:border-blue-500 transition-all text-sm"
              autoFocus
            />
            <button
              type="submit"
              disabled={!email}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-xs font-black uppercase tracking-wider transition-all disabled:opacity-50"
            >
              {t("login.forgotPasswordDialog.submit")}
            </button>
          </form>
        )}

        <button
          onClick={onClose}
          className="w-full py-2 text-slate-500 hover:text-white text-xs font-bold uppercase tracking-wider transition-colors"
        >
          {t("close")}
        </button>
      </div>
    </div>
  );
};
