// src/components/billing/TopUpSelector.tsx — credit top-up pack selection via Paddle checkout

import React, { useState } from "react";
import { useT } from "../../i18n";
import { TOPUP_PACKS } from "../../planconfig";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";

const createTopUpFn = httpsCallable(functions, "createPaddleTopUp");

interface TopUpSelectorProps {
  canTopUp: boolean;
  onBuy: (packId: string) => void;
}

export const TopUpSelector: React.FC<TopUpSelectorProps> = ({ canTopUp, onBuy }) => {
  const { t } = useT();
  const [loadingPack, setLoadingPack] = useState<string | null>(null);

  if (!canTopUp) return null;

  const handleBuy = async (packId: string) => {
    setLoadingPack(packId);
    try {
      const result = await createTopUpFn({ packId }) as any;
      const data = result.data as any;
      if (data?.transactionId && (window as any).Paddle) {
        (window as any).Paddle.Checkout.open({
          settings: { displayMode: "overlay" },
          transactionId: data.transactionId,
        });
      } else if (data?.checkoutUrl) {
        window.open(data.checkoutUrl, "_blank");
      }
      onBuy(packId);
    } catch (e: any) {
      console.error("Top-up checkout failed:", e);
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
            onClick={() => handleBuy(`topup_${pack.credits}`)}
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
