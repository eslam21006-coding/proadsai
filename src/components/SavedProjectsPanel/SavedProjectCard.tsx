// src/components/SavedProjectsPanel/SavedProjectCard.tsx — card for a single saved project

import React from "react";
import { useT } from "../../i18n";
import type { SavedProject } from "../../types";
import { stepsWithData, type AppPhase } from "../../lib/projectStepsData";
import { cardLabels } from "../../i18n/savedProjects";
import ProjectStatusBadge from "./ProjectStatusBadge";
import ProjectStepNavigator from "./ProjectStepNavigator";
import { bulkLabels } from "../../i18n/savedProjects";

interface Props {
  project: SavedProject;
  onLoad: (project: SavedProject, targetPhase?: AppPhase) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  // Multi-select (ISSUE 1): when selectable, a checkbox is shown and clicking the
  // card toggles selection instead of opening the project.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

const SavedProjectCard: React.FC<Props> = ({ project, onLoad, onDelete, selectable = false, selected = false, onToggleSelect }) => {
  const { dir, lang } = useT();
  const hasThumbnail = !!project.thumbnailUrl;
  const steps = stepsWithData(project);
  const langKey = (lang === "ar" ? "ar" : "en") as "en" | "ar";
  const untitledLabel = cardLabels.untitled[langKey];
  const deleteLabel = cardLabels.deleteAction[langKey];
  const selectAria = bulkLabels.selectAria[langKey];

  // Card body always opens the project; selection is driven solely by the checkbox so
  // the primary "click to open" action is never hijacked (ISSUE 1).
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
      className={`group relative bg-slate-900/50 border rounded-lg overflow-hidden cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500 transition-colors ${selected ? "border-blue-500 ring-1 ring-blue-500/40" : "border-slate-800 hover:border-slate-600"}`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      dir={dir}
    >
      <div className="flex items-center gap-3 p-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            aria-label={selectAria}
            onClick={(e) => e.stopPropagation()}
            onChange={() => onToggleSelect?.(project.id)}
            className="flex-shrink-0 w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer accent-blue-600"
          />
        )}
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
