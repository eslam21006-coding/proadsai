// src/components/SavedProjectsPanel/ProjectStepNavigator.tsx — 5-dot step navigator

import React from "react";
import type { AppPhase } from "../../lib/projectStepsData";

interface Props {
  stepsWithData: Record<AppPhase, boolean>;
  onResume: (targetPhase: AppPhase) => void;
}

const PHASES: AppPhase[] = ["input", "tov_review", "concept_review", "render_studio", "primary_text"];

const ProjectStepNavigator: React.FC<Props> = ({ stepsWithData, onResume }) => {
  return (
    <div className="flex items-center gap-1">
      {PHASES.map((phase) => {
        const hasData = stepsWithData[phase];
        return hasData ? (
          <button
            key={phase}
            onClick={(e) => { e.stopPropagation(); onResume(phase); }}
            className="w-2.5 h-2.5 rounded-full bg-emerald-400 hover:bg-emerald-300 transition-colors cursor-pointer"
            title={phase}
          />
        ) : (
          <span
            key={phase}
            className="w-2.5 h-2.5 rounded-full bg-slate-700"
            aria-disabled="true"
            title={`${phase} (no data)`}
          />
        );
      })}
    </div>
  );
};

export default ProjectStepNavigator;
