// src/components/billing/ReactivateButton.tsx — reactivate cancelled subscription via Stripe Customer Portal

import React from "react";
import { useT } from "../../i18n";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";

const createStripePortalFn = httpsCallable(functions, "createStripePortalSession");

export const ReactivateButton: React.FC = () => {
  const { t } = useT();

  const handleReactivate = async () => {
    try {
      const result = await createStripePortalFn({}) as any;
      if (result.data?.portalUrl) {
        window.open(result.data.portalUrl, "_blank");
      }
    } catch (e: any) {
      console.error("Failed to open Stripe portal:", e);
    }
  };

  return (
    <button
      onClick={handleReactivate}
      className="w-full py-2.5 rounded-lg bg-emerald-600/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold hover:bg-emerald-600/20 transition-all"
    >
      {t("billing.cancelled.reactivate")}
    </button>
  );
};
