// src/components/SavedProjectsPanel/ProjectFilters.tsx — search + workspace + status filter controls

import React from "react";
import { useT } from "../../i18n";
import { filterLabels } from "../../i18n/savedProjects";
import type { SavedProject } from "../../types";
import type { ProjectStatus } from "../../lib/projectStatus";

interface FilterState {
  search: string;
  workspaceId: string;
  status: "all" | ProjectStatus;
}

interface Props {
  value: FilterState;
  onChange: (filters: FilterState) => void;
  workspaces: { id: string; name: string }[];
  metaConnected: boolean;
}

const ProjectFilters: React.FC<Props> = ({ value, onChange, workspaces }) => {
  const { t, lang } = useT();
  const lbl = filterLabels;

  return (
    <div className="space-y-2 mb-3">
      <input
        type="text"
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        placeholder={lbl.searchPlaceholder?.[lang as "en" | "ar"] ?? "Search projects..."}
        className="w-full px-3 py-1.5 bg-slate-800/50 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
      />
      <div className="flex items-center gap-2">
        <select
          value={value.workspaceId}
          onChange={(e) => onChange({ ...value, workspaceId: e.target.value })}
          className="flex-1 px-2 py-1 bg-slate-800/50 border border-slate-700 rounded-lg text-[10px] text-white focus:outline-none"
        >
          <option value="all">{lbl.workspaceAll?.[lang as "en" | "ar"] ?? "All workspaces"}</option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>{ws.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 bg-slate-800/30 rounded-lg p-0.5">
          {(["all", "draft", "rendered", "published"] as const).map((s) => {
            const isActive = value.status === s;
            const label = s === "all"
              ? (lbl.statusAll?.[lang as "en" | "ar"] ?? "All")
              : (lbl[s as keyof typeof lbl]?.[lang as "en" | "ar"] ?? s);
            return (
              <button
                key={s}
                onClick={() => onChange({ ...value, status: s })}
                className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-colors ${
                  isActive ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ProjectFilters;
export type { FilterState };
