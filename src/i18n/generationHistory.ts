// src/i18n/generationHistory.ts — i18n strings for the Generation History panel (Phase 26)

export const historyLabels: Record<string, { en: string; ar: string }> = {
  title: { en: "Generation History", ar: "سجل الإعلانات" },
  subtitle: { en: "Browse and filter all your rendered ads", ar: "تصفح وفلتر كل إعلاناتك المعروضة" },
  countSingular: { en: "{n} generation", ar: "عنصر واحد" },
  countPlural: { en: "{n} generations", ar: "{n} عنصر" },

  // Filter bar
  filterHookAngle: { en: "Hook Angle", ar: "زاوية الهوك" },
  filterUniverse: { en: "Universe", ar: "العالم" },
  filterArtDirection: { en: "Art Direction", ar: "الاتجاه الفني" },
  filterAny: { en: "Any", ar: "الكل" },
  filterAnyCount: { en: "Any ({n})", ar: "الكل ({n})" },
  clearAllFilters: { en: "Clear all filters", ar: "مسح كل الفلاتر" },
  clearFilter: { en: "Remove", ar: "إزالة" },
  filtersActive: { en: "Filters active", ar: "فلاتر نشطة" },

  // Status filter
  statusAll: { en: "All", ar: "الكل" },
  statusDraft: { en: "Drafts", ar: "مسودات" },
  statusRendered: { en: "Rendered", ar: "معروضة" },
  statusPublished: { en: "Published", ar: "منشورة" },
  badgeDraft: { en: "DRAFT", ar: "مسودة" },
  badgePublished: { en: "PUBLISHED", ar: "منشور" },
  badgeRendered: { en: "RENDERED", ar: "معروض" },

  // Search
  searchPlaceholder: { en: "Search by name or hook text...", ar: "بحث بالاسم أو نص الهوك..." },

  // Card content
  noHookText: { en: "Untitled generation", ar: "عنصر بدون عنوان" },
  noProjectName: { en: "Untitled project", ar: "مشروع بدون عنوان" },
  draftThumbnailAlt: { en: "Draft project — no render yet", ar: "مشروع مسودة — بدون عرض بعد" },
  noUniverse: { en: "No universe", ar: "بدون عالم" },
  noArtDirection: { en: "No art direction", ar: "بدون اتجاه فني" },
  openGenerationAria: { en: "Open generation", ar: "فتح الإعلان" },

  // State
  loading: { en: "Loading history...", ar: "جارٍ تحميل السجل..." },
  loadingMore: { en: "Loading more...", ar: "جارٍ تحميل المزيد..." },
  loadMore: { en: "Load more", ar: "تحميل المزيد" },
  empty: { en: "No generations yet. Create your first ad to see it here.", ar: "لا توجد إعلانات بعد. أنشئ أول إعلان لك ليظهر هنا." },
  emptyFiltered: { en: "No generations match the current filters.", ar: "لا توجد إعلانات تطابق الفلاتر الحالية." },
  endOfList: { en: "You've reached the end.", ar: "وصلت إلى نهاية السجل." },
};

// Hook angle → label, mirrors src/constants.ts COLD_HOOK_ANGLES.
export const hookAngleLabels: Record<string, { en: string; ar: string }> = {
  emotional: { en: "Emotional", ar: "عاطفي" },
  pain: { en: "Pain Amplification", ar: "نقطة ألم" },
  curiosity: { en: "Curiosity", ar: "فضول" },
  logic: { en: "Logic", ar: "منطقي" },
  social_proof: { en: "Social Proof", ar: "إثبات اجتماعي" },
  urgency: { en: "Urgency", ar: "استعجال" },
  statistics: { en: "Statistics", ar: "إحصائية" },
  scarcity: { en: "Scarcity", ar: "ندرة" },
  logical_authority: { en: "Logical Authority", ar: "سلطة منطقية" },
  future_based: { en: "Future-Based", ar: "تخيل لو" },
};

// Hook angle → colored badge class. Provides visual differentiation so the
// user can scan cards without reading the badge text.
export const hookAngleStyles: Record<string, { twClass: string }> = {
  emotional:         { twClass: "bg-pink-500/15 text-pink-300 border-pink-500/30" },
  pain:              { twClass: "bg-red-500/15 text-red-300 border-red-500/30" },
  curiosity:         { twClass: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  logic:             { twClass: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  social_proof:      { twClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  urgency:           { twClass: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  statistics:        { twClass: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  scarcity:          { twClass: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  logical_authority: { twClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" },
  future_based:      { twClass: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};