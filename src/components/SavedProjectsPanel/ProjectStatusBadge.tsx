// src/components/SavedProjectsPanel/ProjectStatusBadge.tsx — colour + text status badge

import React from "react";
import { useT } from "../../i18n";
import { statusLabels } from "../../i18n/savedProjects";
import type { ProjectStatus } from "../../lib/projectStatus";

interface Props {
  status: ProjectStatus | undefined;
}

const ProjectStatusBadge: React.FC<Props> = ({ status }) => {
  const { lang } = useT();
  const key = status ?? "draft";
  const label = statusLabels[key];
  if (!label) return null;

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded ${label.twClass}`}>
      {label[lang as "en" | "ar"] ?? label.en}
    </span>
  );
};

export default ProjectStatusBadge;
