// src/lib/projectCoverImage.ts — resolve the cover image URL for a saved project

interface CoverSource {
  mockupHistory?: { url: string | null }[];
  carouselSlides?: { imageUrl: string | null }[];
  batchResults?: { url: string | null }[];
}

export function resolveCoverImage(project: CoverSource): { url: string } | null {
  if (project.carouselSlides && project.carouselSlides.length > 0) {
    const url = project.carouselSlides[0].imageUrl;
    return url ? { url } : null;
  }
  if (project.batchResults && project.batchResults.length > 0) {
    const url = project.batchResults[0].url;
    return url ? { url } : null;
  }
  if (project.mockupHistory && project.mockupHistory.length > 0) {
    const url = project.mockupHistory[0].url;
    return url ? { url } : null;
  }
  return null;
}
