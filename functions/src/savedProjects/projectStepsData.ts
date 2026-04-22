// functions/src/savedProjects/projectStepsData.ts — server mirror of src/lib/projectStepsData.ts

export type AppPhase = "input" | "tov_review" | "concept_review" | "render_studio" | "primary_text";

export function stepsWithData(
  project: {
    inputs: Record<string, unknown> | null;
    tovText: string;
    selectedTov: string;
    buildPlan: string;
    mockupHistory?: { url: string }[];
    carouselSlides?: unknown[];
    batchResults?: unknown[];
    captionText: string;
    batchCaptions?: unknown[];
  },
): Record<AppPhase, boolean> {
  return {
    input: project.inputs !== null && Object.keys(project.inputs ?? {}).length > 0,
    tov_review: project.tovText !== "" || project.selectedTov !== "",
    concept_review: project.buildPlan !== "",
    render_studio: (project.mockupHistory?.length ?? 0) > 0
      || (project.carouselSlides?.length ?? 0) > 0
      || (project.batchResults?.length ?? 0) > 0,
    primary_text: project.captionText !== ""
      || (project.batchCaptions?.length ?? 0) > 0,
  };
}
