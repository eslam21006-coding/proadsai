// src/components/SavedProjectsPanel/SavedProjectsPanel.tsx — main saved projects list panel

import React, { useState, useMemo } from "react";
import { useT } from "../../i18n";
import type { SavedProject } from "../../types";
import type { AppPhase } from "../../lib/projectStepsData";
import { filterLabels } from "../../i18n/savedProjects";
import SavedProjectCard from "./SavedProjectCard";
import ProjectFilters, { type FilterState } from "./ProjectFilters";

interface Props {
  projects: SavedProject[];
  workspaces: { id: string; name: string }[];
  metaConnected: boolean;
  onLoad: (project: SavedProject, targetPhase?: AppPhase) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
}

const SavedProjectsPanel: React.FC<Props> = ({ projects, workspaces, metaConnected, onLoad, onDelete }) => {
  const { t, dir, lang } = useT();
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    workspaceId: "all",
    status: "all",
  });

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (filters.search) {
        if (!String(p.name).toLowerCase().includes(filters.search.toLowerCase())) return false;
      }
      if (filters.workspaceId !== "all" && p.workspaceId !== filters.workspaceId) return false;
      if (filters.status !== "all" && (p.status ?? "draft") !== filters.status) return false;
      return true;
    });
  }, [projects, filters]);

  return (
    <div className="space-y-2" dir={dir}>
      <div className="flex items-center justify-between px-1 mb-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          {t("projects.saved") || "Saved Projects"}
        </h3>
        <span className="text-[10px] text-slate-500">{filteredProjects.length} / {projects.length}</span>
      </div>
      <ProjectFilters
        value={filters}
        onChange={setFilters}
        workspaces={workspaces}
        metaConnected={metaConnected}
      />
      {filteredProjects.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-xs">
          {filters.status === "published"
            ? (metaConnected
              ? (filterLabels.publishedEmptyNeutral?.[lang as "en" | "ar"] ?? "You haven't pushed any projects to Meta yet.")
              : (filterLabels.publishedEmptyMeta?.[lang as "en" | "ar"] ?? "No published projects yet — connect Meta."))
            : (filterLabels.emptyNoProjects?.[lang as "en" | "ar"] ?? "No projects match your filters.")}
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1 scrollbar-thin">
          {filteredProjects.map((project) => (
            <SavedProjectCard
              key={project.id}
              project={project}
              onLoad={onLoad}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SavedProjectsPanel;
