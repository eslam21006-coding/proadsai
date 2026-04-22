// src/components/SavedProjectsPanel/SavedProjectCard.tsx — card for a single saved project

import React from "react";
import { useT } from "../../i18n";
import type { SavedProject } from "../../types";
import { stepsWithData, type AppPhase } from "../../lib/projectStepsData";
import { cardLabels } from "../../i18n/savedProjects";
import ProjectStatusBadge from "./ProjectStatusBadge";
import ProjectStepNavigator from "./ProjectStepNavigator";

interface Props {
  project: SavedProject;
  onLoad: (project: SavedProject, targetPhase?: AppPhase) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

const SavedProjectCard: React.FC<Props> = ({ project, onLoad, onDelete }) => {
  const { dir, lang } = useT();
  const hasThumbnail = !!project.thumbnailUrl;
  const steps = stepsWithData(project);
  const langKey = (lang === "ar" ? "ar" : "en") as "en" | "ar";
  const untitledLabel = cardLabels.untitled[langKey];
  const deleteLabel = cardLabels.deleteAction[langKey];

  const handleActivate = () => onLoad(project);
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Only react to Enter/Space when focus is on the wrapper itself —
    // otherwise nested controls (step-dot buttons, delete button) would have
    // their own keyboard activations hijacked by this parent handler.
    if (e.currentTarget !== e.target) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault(); // Space would otherwise scroll the page.
      handleActivate();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={project.name || untitledLabel}
      className="group relative bg-slate-900/50 border border-slate-800 rounded-lg overflow-hidden cursor-pointer hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors"
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      dir={dir}
    >
      <div className="flex items-center gap-3 p-2">
        <div className="w-16 h-16 flex-shrink-0 rounded-md overflow-hidden bg-slate-800 flex items-center justify-center">
          {hasThumbnail ? (
            <img
              src={project.thumbnailUrl}
              alt={project.name || untitledLabel}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <i className="fa-regular fa-image text-slate-600 text-xl" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-white truncate">
            {project.name || untitledLabel}
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">
            {new Date(project.timestamp).toLocaleDateString(lang, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <ProjectStatusBadge status={project.status} />
            <ProjectStepNavigator stepsWithData={steps} onResume={(targetPhase) => onLoad(project, targetPhase)} />
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(e, project.id); }}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
          title={deleteLabel}
          aria-label={deleteLabel}
        >
          <i className="fa-solid fa-trash text-[10px]" />
        </button>
      </div>
    </div>
  );
};

export default SavedProjectCard;
