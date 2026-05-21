// src/components/billing/TopUpSelector.tsx — credit top-up pack selection via Stripe Checkout

import React, { useState } from "react";
import { useT } from "../../i18n";
import { TOPUP_PACKS, TOPUP_PRICES } from "../../planconfig";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import { useBillingState } from "../../hooks/useBillingState";

interface CreateStripeTopUpRequest {
  creditAmount: number;
  priceId: string;
}
interface CreateStripeTopUpResponse {
  checkoutUrl: string;
}

const createStripeTopUpFn = httpsCallable<CreateStripeTopUpRequest, CreateStripeTopUpResponse>(
  functions,
  "createStripeTopUpSession",
);

interface TopUpSelectorProps {
  canTopUp: boolean;
  onBuy: (packId: string) => void;
}

export const TopUpSelector: React.FC<TopUpSelectorProps> = ({ canTopUp, onBuy }) => {
  const { t } = useT();
  const { billingState } = useBillingState();
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  if (!canTopUp) return null;

  const handleBuy = async (credits: number) => {
    if (billingState?.isTrial) {
      alert(t('billing.trialTopUpBlocked'));
      return;
    }
    setLoadingPack(String(credits));
    try {
      const priceId = TOPUP_PRICES[credits];
      if (!priceId) {
        console.error(`No price ID configured for ${credits} credits`);
        return;
      }
      const result = await createStripeTopUpFn({ creditAmount: credits, priceId });
      const checkoutUrl = result.data?.checkoutUrl;
      if (checkoutUrl) {
        // Notify parent only when the Stripe Checkout URL is in hand — keeps the
        // parent's success-toast / state-machine in lockstep with what actually happened.
        onBuy(`topup_${credits}`);
        window.location.href = checkoutUrl;
      } else {
        console.error("createStripeTopUpSession returned no checkoutUrl");
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("Top-up checkout failed:", message);
    } finally {
      setLoadingPack(null);
    }
  };

  return (
    <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 space-y-3">
      <p className="text-xs text-slate-400 font-medium">{t("billing.topup.title")}</p>
      <div className="grid grid-cols-3 gap-2">
        {TOPUP_PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => handleBuy(pack.credits)}
            disabled={loadingPack !== null}
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 text-center hover:border-amber-500/50 hover:bg-amber-500/5 transition-all disabled:opacity-50"
          >
            <div className="text-lg font-black text-amber-400">+{pack.credits}</div>
            <div className="text-[10px] text-slate-500">{t("billing.credits")}</div>
            <div className="text-sm font-bold text-white mt-1">${pack.price}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
