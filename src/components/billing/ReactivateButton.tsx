// src/components/billing/ReactivateButton.tsx

import React, { useState } from "react";

interface ReactivateButtonProps {
  onReactivate: () => Promise<void>;
}

export const ReactivateButton: React.FC<ReactivateButtonProps> = ({ onReactivate }) => {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onReactivate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold transition-all"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <i className="fa-solid fa-spinner fa-spin" /> Reactivating...
        </span>
      ) : (
        <span className="flex items-center justify-center gap-2">
          <i className="fa-solid fa-rotate-left" /> Reactivate Subscription
        </span>
      )}
    </button>
  );
};
