// src/components/SavedProjectsPanel/SaveStatusIndicator.tsx — header indicator for auto-save state

import React, { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { saveIndicator } from "../../i18n/savedProjects";
import type { AutoSaveState } from "../../lib/projectAutoSave";

interface Props {
  state: AutoSaveState;
  onRetry: () => void;
}

const SaveStatusIndicator: React.FC<Props> = ({ state, onRetry }) => {
  const { lang } = useT();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (state.phase === "idle") {
      setVisible(false);
    } else {
      setVisible(true);
    }
  }, [state.phase]);

  if (!visible || state.phase === "idle") return null;

  if (state.phase === "saving") {
    return (
      <span className="text-[10px] text-slate-400 animate-pulse">
        {saveIndicator.saving?.[lang as "en" | "ar"] ?? "Saving..."}
      </span>
    );
  }

  if (state.phase === "saved") {
    return (
      <span className="text-[10px] text-emerald-400">
        {saveIndicator.saved?.[lang as "en" | "ar"] ?? "Saved ✓"}
      </span>
    );
  }

  if (state.phase === "transient-error") {
    return (
      <span className="text-[10px] text-amber-400" title="Cloud save failed">
        <i className="fa-solid fa-cloud-arrow-up mr-1" />
        !
      </span>
    );
  }

  if (state.phase === "persistent-failure") {
    return (
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-2 text-[10px]">
        <span className="text-amber-400">
          {saveIndicator.persistentBody?.[lang as "en" | "ar"] ?? "Saving to cloud failed — your work is safe locally"}
        </span>
        <button
          onClick={onRetry}
          className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white text-[9px] font-bold rounded transition-colors"
        >
          {saveIndicator.retryBtn?.[lang as "en" | "ar"] ?? "Try saving now"}
        </button>
      </div>
    );
  }

  return null;
};

export default SaveStatusIndicator;
