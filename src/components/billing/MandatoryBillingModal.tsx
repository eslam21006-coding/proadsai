// src/components/billing/MandatoryBillingModal.tsx — dismiss-proof fullscreen billing modal for unpaid users
import React, { useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase";
import { useT } from "../../i18n";
import PricingTable from "../PricingTable";

interface MandatoryBillingModalProps {
  onPlanActivated?: () => void;
}

export const MandatoryBillingModal: React.FC<MandatoryBillingModalProps> = ({
  onPlanActivated,
}) => {
  const { t, lang } = useT();

  useEffect(() => {
    const swallowEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", swallowEscape);
    return () => window.removeEventListener("keydown", swallowEscape);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === "Escape") e.preventDefault(); }}
    >
      <div className="flex-1 flex flex-col items-center justify-start pt-10 pb-16 px-4">
        <div className="text-center mb-8 max-w-lg">
          <div className="w-16 h-16 bg-blue-600/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <i className="fa-solid fa-credit-card text-blue-400 text-2xl"></i>
          </div>
          <h1 className="text-2xl font-black text-white mb-2">
            {t("billing.mandatoryModal.title")}
          </h1>
          <p className="text-sm text-slate-400">
            {t("billing.mandatoryModal.subtitle")}
          </p>
        </div>

        <div className="w-full max-w-[1200px]">
          <PricingTable />
        </div>

        {/* Subtle escape hatch: lets a user who signed in with the wrong account
            sign out and try again, without making it a prominent CTA. */}
        <button
          type="button"
          onClick={() => { void signOut(auth); }}
          className="mt-8 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 transition-colors"
        >
          {lang === "ar" ? "تسجيل الخروج" : "Sign out"}
        </button>
      </div>
    </div>
  );
};
