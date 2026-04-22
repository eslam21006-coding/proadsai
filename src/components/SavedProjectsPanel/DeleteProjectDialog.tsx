// src/components/SavedProjectsPanel/DeleteProjectDialog.tsx — confirmation modal for project deletion

import React from "react";
import { useT } from "../../i18n";
import { deleteDialog } from "../../i18n/savedProjects";

interface Props {
  projectName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteProjectDialog: React.FC<Props> = ({ projectName, onConfirm, onCancel }) => {
  const { lang } = useT();
  const lbl = deleteDialog;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold text-white mb-2">
          {lbl.title?.[lang as "en" | "ar"] ?? "Delete Project"}
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          {(lbl.body?.[lang as "en" | "ar"] ?? "Are you sure you want to delete \"{name}\"? This action cannot be undone.").replace("{name}", projectName)}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
          >
            {lbl.cancel?.[lang as "en" | "ar"] ?? "Cancel"}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors"
          >
            {lbl.deleteBtn?.[lang as "en" | "ar"] ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteProjectDialog;
