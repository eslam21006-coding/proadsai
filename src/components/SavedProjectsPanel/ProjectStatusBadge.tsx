// src/components/SavedProjectsPanel/ProjectStatusBadge.tsx — colour + text status badge

import React from "react";
import { useT } from "../../i18n";
import { statusLabels } from "../../i18n/savedProjects";
import type { ProjectStatus } from "../../lib/projectStatus";

interface Props {
  status: ProjectStatus | undefined;
}

const FALLBACK: Record<string, { en: string; ar: string; twClass: string }> = {
  draft: { en: "Draft", ar: "مسودة", twClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  rendered: { en: "Rendered", ar: "تم العرض", twClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  published: { en: "Published", ar: "منشور", twClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

const ProjectStatusBadge: React.FC<Props> = ({ status }) => {
  const { lang } = useT();
  const key = status ?? "draft";
  const label = statusLabels[key] ?? FALLBACK[key];
  if (!label) return null;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded ${label.twClass}`}>
      {label[lang as "en" | "ar"] ?? label.en}
    </span>
  );
};

export default ProjectStatusBadge;
