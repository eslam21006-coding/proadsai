// functions/src/savedProjects/projectStatus.ts — server mirror of src/lib/projectStatus.ts

export type ProjectStatus = "draft" | "rendered" | "published";

const RANK: Record<ProjectStatus, number> = { draft: 0, rendered: 1, published: 2 };

function rank(status: ProjectStatus | undefined): number {
  return RANK[status ?? "draft"];
}

export function deriveStatus(
  prev: ProjectStatus | undefined,
  project: { metaAdId?: string; mockupHistory?: { url: string }[]; carouselSlides?: unknown[]; batchResults?: unknown[] },
): ProjectStatus {
  const derived: ProjectStatus = project.metaAdId
    ? "published"
    : (project.mockupHistory?.length ?? 0) > 0
        || (project.carouselSlides?.length ?? 0) > 0
        || (project.batchResults?.length ?? 0) > 0
      ? "rendered"
      : "draft";

  const prevRank = rank(prev);
  const derivedRank = rank(derived);
  return (prevRank > derivedRank ? prev : derived) as ProjectStatus;
}
