// src/components/billing/MandatoryBillingModal.tsx — dismiss-proof fullscreen billing modal for unpaid users
import React, { useEffect } from "react";
import { useT } from "../../i18n";
import PricingTable from "../PricingTable";

interface MandatoryBillingModalProps {
  onPlanActivated?: () => void;
}

export const MandatoryBillingModal: React.FC<MandatoryBillingModalProps> = ({
  onPlanActivated,
}) => {
  const { t } = useT();

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

        <div className="w-full max-w-5xl">
          <PricingTable />
        </div>
      </div>
    </div>
  );
};
