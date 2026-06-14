// src/components/SavedProjectsPanel/SavedProjectsPanel.tsx — main saved projects list panel

import React, { useState, useMemo, useCallback } from "react";
import { useT } from "../../i18n";
import type { SavedProject } from "../../types";
import type { AppPhase } from "../../lib/projectStepsData";
import { filterLabels, bulkLabels } from "../../i18n/savedProjects";
import SavedProjectCard from "./SavedProjectCard";
import ProjectFilters, { type FilterState } from "./ProjectFilters";

interface Props {
  projects: SavedProject[];
  workspaces: { id: string; name: string }[];
  metaConnected: boolean;
  onLoad: (project: SavedProject, targetPhase?: AppPhase) => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  // ISSUE 1: bulk-delete handler. Receives the ids the user selected for deletion.
  onBulkDelete?: (ids: string[]) => void | Promise<void>;
}

const SavedProjectsPanel: React.FC<Props> = ({ projects, workspaces, metaConnected, onLoad, onDelete, onBulkDelete }) => {
  const { t, dir, lang } = useT();
  const langKey = (lang === "ar" ? "ar" : "en") as "en" | "ar";
  const [filters, setFilters] = useState<FilterState>({
    search: "",
    workspaceId: "all",
    status: "all",
  });

  // ─── Multi-select state (ISSUE 1) ───
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

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

  // Only count/operate on selections that are still visible under the current filters.
  const visibleSelectedIds = useMemo(
    () => filteredProjects.filter((p) => selectedIds.has(p.id)).map((p) => p.id),
    [filteredProjects, selectedIds],
  );
  const selectionMode = selectedIds.size > 0;
  const allVisibleSelected = filteredProjects.length > 0 && visibleSelectedIds.length === filteredProjects.length;

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setConfirming(false);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredProjects.map((p) => p.id)));
  }, [filteredProjects]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
    setConfirming(false);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    const ids = visibleSelectedIds;
    if (ids.length === 0) return;
    await onBulkDelete?.(ids);
    setSelectedIds(new Set());
    setConfirming(false);
  }, [visibleSelectedIds, onBulkDelete]);

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
      />
      {/* ISSUE 1 — Multi-select toolbar. Shown whenever there are projects to act on. */}
      {onBulkDelete && filteredProjects.length > 0 && (
        <div className="flex items-center justify-between gap-2 px-1 py-1.5">
          <button
            type="button"
            onClick={allVisibleSelected ? deselectAll : selectAll}
            className="text-[10px] font-semibold text-slate-400 hover:text-white transition-colors flex items-center gap-1.5"
          >
            <i className={`fa-${allVisibleSelected ? "solid fa-square-check" : "regular fa-square"} text-[11px]`} />
            {allVisibleSelected ? bulkLabels.deselectAll[langKey] : bulkLabels.selectAll[langKey]}
          </button>
          {selectionMode && (
            confirming ? (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-400">
                  {bulkLabels.confirmPrompt[langKey].replace("{n}", String(visibleSelectedIds.length))}
                </span>
                <button
                  type="button"
                  onClick={handleConfirmDelete}
                  className="text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 rounded-md px-2 py-1 transition-colors"
                >
                  {bulkLabels.confirm[langKey]}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-[10px] font-semibold text-slate-400 hover:text-white px-1.5 py-1 transition-colors"
                >
                  {bulkLabels.cancel[langKey]}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="text-[10px] font-bold text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 border border-red-500/30 rounded-md px-2.5 py-1 transition-colors flex items-center gap-1.5"
              >
                <i className="fa-solid fa-trash text-[9px]" />
                {bulkLabels.deleteSelected[langKey].replace("{n}", String(visibleSelectedIds.length))}
              </button>
            )
          )}
        </div>
      )}
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
              selectable={!!onBulkDelete}
              selected={selectedIds.has(project.id)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default SavedProjectsPanel;
