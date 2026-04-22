// functions/src/__tests__/__fixtures__/savedProjects.fixtures.ts — shared test fixtures for Phase 13

export const legacyProjectNoStatusNoRender: any = {
  id: "legacy-1",
  userId: "user-1",
  name: "Legacy Project",
  workspaceId: "ws-1",
  timestamp: 1000,
  inputs: { productName: "Test" },
  phase: "input",
  tovText: "",
  conceptsText: "",
  selectedTov: "",
  selectedConcept: "",
  buildPlan: "",
  mockupHistory: [],
  historyIndex: 0,
  resolvedUniverse: "",
  captionText: "",
  batchCaptions: undefined,
  batchResults: undefined,
  carouselSlides: undefined,
  metaAdId: undefined,
};

export const singleFormatRenderedNoMeta: any = {
  ...legacyProjectNoStatusNoRender,
  id: "single-rendered-1",
  name: "Single Rendered",
  phase: "render_studio",
  tovText: "Some TOV",
  selectedTov: "professional",
  buildPlan: "A build plan",
  mockupHistory: [{ url: "https://example.com/render.png", ratio: "1:1" }],
  historyIndex: 0,
};

export const carouselRenderedNoMeta: any = {
  ...legacyProjectNoStatusNoRender,
  id: "carousel-rendered-1",
  name: "Carousel Rendered",
  phase: "render_studio",
  tovText: "Carousel TOV",
  selectedTov: "emotional",
  buildPlan: "Carousel plan",
  mockupHistory: [],
  carouselSlides: [
    { imageUrl: "https://example.com/slide1.png" },
    { imageUrl: "https://example.com/slide2.png" },
  ],
};

export const batchRenderedNoMeta: any = {
  ...legacyProjectNoStatusNoRender,
  id: "batch-rendered-1",
  name: "Batch Rendered",
  phase: "render_studio",
  tovText: "Batch TOV",
  selectedTov: "logic",
  buildPlan: "Batch plan",
  mockupHistory: [],
  batchResults: [{ url: "https://example.com/batch1.png" }],
};

export const formatSwitchedSingleToCarousel: any = {
  ...legacyProjectNoStatusNoRender,
  id: "format-switched-1",
  name: "Format Switched",
  phase: "render_studio",
  tovText: "Switched TOV",
  selectedTov: "urgency",
  buildPlan: "Switched plan",
  mockupHistory: [{ url: "https://example.com/old-single.png", ratio: "1:1" }],
  carouselSlides: [
    { imageUrl: "https://example.com/new-slide1.png" },
    { imageUrl: "https://example.com/new-slide2.png" },
  ],
};

export const publishedThenMetaRemoved: any = {
  ...legacyProjectNoStatusNoRender,
  id: "published-latch-1",
  name: "Published Latch",
  phase: "primary_text",
  tovText: "Published TOV",
  selectedTov: "professional",
  buildPlan: "Published plan",
  mockupHistory: [{ url: "https://example.com/pub-render.png", ratio: "1:1" }],
  captionText: "A caption",
  status: "published",
  metaAdId: undefined,
};

export const publishedWithMeta: any = {
  ...legacyProjectNoStatusNoRender,
  id: "published-with-meta-1",
  name: "Published With Meta",
  phase: "primary_text",
  tovText: "Meta TOV",
  selectedTov: "emotional",
  buildPlan: "Meta plan",
  mockupHistory: [{ url: "https://example.com/meta-render.png", ratio: "1:1" }],
  captionText: "Meta caption",
  metaAdId: "meta-ad-123",
  status: "published",
};

export const draftWithInputsOnly: any = {
  ...legacyProjectNoStatusNoRender,
  id: "draft-inputs-1",
  name: "Draft Inputs Only",
  inputs: { productName: "Widget", targetAudience: "Everyone" },
  phase: "input",
  tovText: "",
  selectedTov: "",
  buildPlan: "",
  mockupHistory: [],
  captionText: "",
};

export const renderedWithCaption: any = {
  ...singleFormatRenderedNoMeta,
  id: "rendered-caption-1",
  name: "Rendered With Caption",
  phase: "primary_text",
  captionText: "Final caption",
};

export const draftNullInputs: any = {
  ...legacyProjectNoStatusNoRender,
  id: "draft-null-1",
  name: "Draft Null Inputs",
  inputs: null,
  phase: "input",
};
