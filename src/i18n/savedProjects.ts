// src/i18n/savedProjects.ts — i18n strings for Saved Projects panel (Phase 13)

export const statusLabels: Record<string, { en: string; ar: string; twClass: string }> = {
  draft: { en: "Draft", ar: "مسودة", twClass: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  rendered: { en: "Rendered", ar: "تم العرض", twClass: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  published: { en: "Published", ar: "منشور", twClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
};

export const filterLabels: Record<string, { en: string; ar: string }> = {
  searchPlaceholder: { en: "Search projects...", ar: "بحث في المشاريع..." },
  workspaceAll: { en: "All workspaces", ar: "جميع مساحات العمل" },
  statusAll: { en: "All", ar: "الكل" },
  draft: { en: "Draft", ar: "مسودة" },
  rendered: { en: "Rendered", ar: "تم العرض" },
  published: { en: "Published", ar: "منشور" },
  publishedEmptyMeta: { en: "No published projects yet — connect Meta to push ads from saved projects.", ar: "لا توجد مشاريع منشورة بعد — اربط ميتا لدفع الإعلانات من المشاريع المحفوظة." },
  publishedEmptyNeutral: { en: "You haven't pushed any projects to Meta yet.", ar: "لم تقم بدفع أي مشاريع إلى ميتا بعد." },
  emptyNoProjects: { en: "No projects match your filters.", ar: "لا توجد مشاريع تطابق عوامل التصفية." },
};

export const deleteDialog: Record<string, { en: string; ar: string }> = {
  title: { en: "Delete Project", ar: "حذف المشروع" },
  body: { en: "Are you sure you want to delete \"{name}\"? This action cannot be undone.", ar: "هل أنت متأكد من حذف \"{name}\"؟ لا يمكن التراجع عن هذا الإجراء." },
  cancel: { en: "Cancel", ar: "إلغاء" },
  deleteBtn: { en: "Delete", ar: "حذف" },
};

export const saveIndicator: Record<string, { en: string; ar: string }> = {
  saving: { en: "Saving...", ar: "جارٍ الحفظ..." },
  saved: { en: "Saved ✓", ar: "تم الحفظ ✓" },
  transientTooltip: { en: "Cloud save failed, will retry", ar: "فشل الحفظ السحابي، سيتم إعادة المحاولة" },
  persistentBody: { en: "Saving to cloud failed — your work is safe locally", ar: "فشل الحفظ على السحابة — عملك محفوظ محليًا" },
  retryBtn: { en: "Try saving now", ar: "حاول الحفظ الآن" },
};

export const planCapBlocker: Record<string, { en: string; ar: string }> = {
  message: { en: "Project limit reached. Upgrade your plan to save more projects.", ar: "تم بلوغ الحد الأقصى للمشاريع. قم بترقية خطتك لحفظ المزيد." },
  cta: { en: "Upgrade Plan", ar: "ترقية الخطة" },
};

export const cardLabels: Record<string, { en: string; ar: string }> = {
  untitled: { en: "Untitled Project", ar: "مشروع بدون عنوان" },
  deleteAction: { en: "Delete", ar: "حذف" },
};

export const bulkLabels: Record<string, { en: string; ar: string }> = {
  selectAll: { en: "Select all", ar: "تحديد الكل" },
  deselectAll: { en: "Deselect all", ar: "إلغاء التحديد" },
  deleteSelected: { en: "Delete Selected ({n})", ar: "حذف المحدد ({n})" },
  confirmPrompt: { en: "Delete {n} project(s)? This cannot be undone.", ar: "حذف {n} مشروع؟ لا يمكن التراجع." },
  confirm: { en: "Delete", ar: "حذف" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  selectAria: { en: "Select project", ar: "تحديد المشروع" },
};
