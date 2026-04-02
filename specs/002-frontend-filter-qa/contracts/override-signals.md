# Contract: Override Signals

**Feature**: 002-frontend-filter-qa
**Location**: `src/components/InputForm.tsx`, `src/store.ts`

## Signal Delivery Types

| Type | Behavior | Duration | Example |
|------|----------|----------|---------|
| `banner` | Colored strip at top of affected section | Persistent until condition clears | Reference ad override |
| `toast` | Popup notification via `showToast()` | Transient (auto-dismiss ~5s) | Testimonial requires carousel |
| `inline` | Text below the affected control | Persistent until combination changes | Before/After is single-image only |
| `section-swap` | Section content replaces another | Immediate on state change | Hook section → Objection section |

## Signal Registry

| # | Event | Trigger Condition | Delivery | Message (EN) | Message (AR) |
|---|-------|-------------------|----------|-------------|-------------|
| 1 | Reference ad uploaded | `referenceAdUsed === true` | banner | "Reference ad active — visual style follows the reference." | "الإعلان المرجعي مفعّل — الأسلوب البصري يتبع المرجع." |
| 2 | Retargeting selected | `campaignType === 'retargeting'` | section-swap | (hook section replaced by objection section) | (same behavior) |
| 3 | text_only selected | `offerCreativeMode includes 'text_only'` | section-swap | (visual sections collapse) | (same behavior) |
| 4 | Testimonial + single | Testimonials uploaded AND `adMode === 'single'` | toast | "Testimonials require carousel — switched automatically." | "الشهادات تحتاج كاروسيل — تم التبديل تلقائياً." |
| 5 | before_after + carousel | `before_after` selected AND `adFormat === 'carousel'` | inline | "Before/After is single-image only." | "قبل/بعد للصور المفردة فقط." |
| 6 | value_stack slide count | value_stack carousel AND user slide count ≠ resolved | inline | "Carousel adjusted to [N] slides — one gift per slide." | "تم ضبط الكاروسيل على [N] شرائح — هدية واحدة لكل شريحة." |
| 7 | Testimonial slide count | Testimonial carousel AND auto-adjusted | inline | "Carousel adjusted to [N] slides — one testimonial per slide." | "تم ضبط الكاروسيل على [N] شرائح — شهادة واحدة لكل شريحة." |
| 8 | Realistic to Minimal | `visualStyleFamily` changed to 'minimal' | section-swap | (art direction grid disappears) | (same behavior) |
| 9 | Realistic to Fantasy | `visualStyleFamily` changed to 'fantasy' | section-swap | (art direction cards reset to fantasy set) | (same behavior) |

## Rules

- All text signals must be bilingual (use `useT()` or `appLang` conditional)
- Banner persists until the triggering condition is cleared (e.g., reference ad removed)
- Toast auto-dismisses after ~5 seconds
- Inline messages persist until the combination changes
- Section-swaps are immediate and do not produce a separate notification
- Signal #7 (testimonial slide count) is Spec G dependent — implement as a stub that activates when testimonial mode is available
- LAUNCH_MATRIX Section 7 has a 10th row ("Carousel slide 2+ — Box A not injected") which is internal pipeline behavior with NO user-facing signal. It is not counted in the 9 user-facing events and requires no UI work.
