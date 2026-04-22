// src/components/SavedProjectsPanel/PlanCapBlocker.tsx — inline error block when project cap is hit

import React from "react";
import { useT } from "../../i18n";
import { planCapBlocker } from "../../i18n/savedProjects";

interface Props {
  plan: string;
  limit: number;
  current: number;
}

const PlanCapBlocker: React.FC<Props> = ({ plan, limit }) => {
  const { lang, t } = useT();
  const msgs = planCapBlocker;
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

  return (
    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
      <p className="text-xs text-red-400 font-medium">
        {msgs.message?.[lang as "en" | "ar"] ?? `Project limit reached (${limit} on ${planName} plan).`}
      </p>
      <button
        onClick={() => window.location.hash = "/billing"}
        className="mt-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold rounded-lg transition-colors"
      >
        {msgs.cta?.[lang as "en" | "ar"] ?? "Upgrade Plan"}
      </button>
    </div>
  );
};

export default PlanCapBlocker;
