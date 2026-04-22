# Contract: Extended `SavedProject` Shape

**Source files**:
- Frontend: `src/types.ts` (extends existing interface around line 406)
- Backend: `functions/src/savedProjects/types.ts` (hand-mirror; fixture-tested for parity per `research.md` R1)

**Implements**: FR-001 / FR-003 / FR-022 / FR-023 from `spec.md`.

---

## Type definition

```ts
// Existing fields preserved exactly as in src/types.ts:406
export interface SavedProject {
  id: string;
  userId?: string;
  name: string;
  workspaceId?: string;
  isRenaming?: boolean;                            // UI-only; never persisted to cloud
  timestamp: number;
  inputs: AdInputs | null;
  phase: AppPhase;
  tovText: string;
  conceptsText: string;
  selectedTov: string;
  selectedConcept: string;
  buildPlan: string;
  mockupHistory: { url: string; ratio: AspectRatio }[];
  historyIndex: number;
  resolvedUniverse: string;
  captionText: string;
  batchCaptions?: { hookKey: string; hookText: string; captionText: string }[];
  batchResults?: BatchResult[];
  batchHookGroups?: (Omit<BatchHookGroup, 'selectedConcepts'> & { selectedConcepts: number[] | Set<number> })[];
  carouselSlides?: CarouselSlide[];
  reassignedFromWorkspaceId?: string;
  resolvedCreativeSpec?: any;
  creatorName?: string;
  creatorEmail?: string;

  // —————— NEW IN PHASE 13 ——————

  /**
   * Persisted project status. Computed by deriveStatus() at every save.
   * Monotonically non-decreasing along: draft → rendered → published.
   * `undefined` only for legacy projects loaded for the first time on Phase 13 code;
   * upgraded to a concrete value at next save (FR-022).
   */
  status?: 'draft' | 'rendered' | 'published';

  /**
   * Durable Firebase Storage download URL for the project's cover-image thumbnail.
   * Path scheme: users/{uid}/projects/{projectId}/thumbnail.jpg
   * `undefined` ⇒ project has no cover image yet (placeholder rendered).
   * (FR-003, FR-004, FR-023)
   */
  thumbnailUrl?: string;

  /**
   * Set by the existing Meta-push handler when the project is published to Meta.
   * Read-only consumer in Phase 13 — the status latch reads this to derive
   * `published`. NOT introduced by Phase 13; documented here because the contract
   * depends on it.
   */
  metaAdId?: string;
}
```

### Validation rules (compile-time)

- `status` literal type is exhaustively narrow — adding a fourth literal is a breaking change.
- `thumbnailUrl` MUST be a `string` (Firebase Storage download URL) when set; transient `data:` URLs MAY appear briefly client-side between cover-image render and Storage upload but MUST NOT be persisted to Firestore.
- All fields not new in Phase 13 retain their existing semantics. No renames, no removals.

### Validation rules (runtime, server-side)

In the project save callsite:

```ts
if (project.status !== undefined && !['draft', 'rendered', 'published'].includes(project.status)) {
  throw new HttpsError('invalid-argument', 'Bad status value');
}
if (project.thumbnailUrl !== undefined && !project.thumbnailUrl.startsWith('https://firebasestorage.googleapis.com/')) {
  throw new HttpsError('invalid-argument', 'thumbnailUrl must be a Firebase Storage URL');
}
```

(Both rules are belt-and-braces — the client respects the contract; the server validates so a hand-crafted client request can't poison the document.)

---

## Compatibility

| Scenario | Behaviour |
|---|---|
| Legacy project loaded on Phase 13 code | `status === undefined` → treated as `draft` for display (FR-022). `thumbnailUrl === undefined` → placeholder (FR-023). |
| Legacy project re-saved | `deriveStatus(undefined, project)` runs → concrete `status` persisted. If cover image exists → `thumbnailUrl` populated. |
| Phase 13 project loaded on pre-13 code | Pre-13 code ignores unknown fields. The `status` and `thumbnailUrl` survive the round trip because IndexedDB and Firestore both store arbitrary additional properties. |
| Phase 13 project loaded on Phase 13 code | All fields read and used as documented. |
