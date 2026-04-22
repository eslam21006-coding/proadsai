// functions/src/savedProjects/projectCoverImage.ts — server mirror of src/lib/projectCoverImage.ts

interface CoverSource {
  mockupHistory?: { url: string }[];
  carouselSlides?: { imageUrl: string }[];
  batchResults?: { url: string }[];
}

export function resolveCoverImage(project: CoverSource): { url: string } | null {
  if (project.carouselSlides && project.carouselSlides.length > 0) {
    return { url: project.carouselSlides[0].imageUrl };
  }
  if (project.batchResults && project.batchResults.length > 0) {
    return { url: project.batchResults[0].url };
  }
  if (project.mockupHistory && project.mockupHistory.length > 0) {
    return { url: project.mockupHistory[0].url };
  }
  return null;
}
