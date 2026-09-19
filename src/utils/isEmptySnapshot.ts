// src/utils/isEmptySnapshot.ts
// ═══════════════════════════════════════════════════════════════════════════
// Phase 4 Batch 3 (auto-restore removal) — live-session emptiness gate.
//
// Extracted from src/App.tsx's auto-save useEffect (the inline guard added
// in commit d8d94c5) so the predicate is unit-testable in isolation. The
// auto-save effect was previously the only consumer and the only copy of
// the rule; moving it here means the rule has one home, one test surface,
// and one place to edit.
//
// Why this exists
// ───────────────
// After the startup auto-restore was removed, every fresh session mounts
// with the auto-save state machine's initial values: inputs = null,
// every array empty, every text field empty, currentProjectId =
// Date.now().toString(). Without this gate the auto-save effect would
// queue a SavedProject snapshot on every page load and the auto-save
// module would write it to IndexedDB and Firestore under a fresh
// timestamp id. The user never asked for a project; the store would
// accumulate a stray empty doc per login.
//
// The predicate is: a snapshot is meaningful iff it carries inputs,
// renders, a carousel, a batch, or generated text. Anything else — a
// fully-blank fresh mount, a just-reset session, a deleted-current-
// project state — exits the auto-save effect without queueing.
//
// The shape passed in is narrow on purpose. The function reads ten
// fields; the type admits exactly those ten and nothing else. A wider
// type would invite callers to pass more than the function reads and
// hide what it actually depends on.
//
// Safety contract (vs. the inline guard this replaces)
// ─────────────────────────────────────────────────────
// The inline guard at the old src/App.tsx:4757-4768 read
// `mockupHistory.length` (and the four other arrays) directly, which
// crashes on `undefined`. That crash path is reachable: loadProject at
// src/App.tsx:5467 calls `setMockupHistory(p.mockupHistory)` and a
// malformed SavedProject without a mockupHistory field lands
// `undefined` in the auto-save effect on the next render. The
// implementation here treats every array field's `undefined` as empty
// (via `(arr?.length ?? 0) > 0`) — the gate survives the same input
// that would have crashed the inline guard.
//
// Test coverage: src/__tests__/isEmptySnapshot.test.ts (Phase 4 Batch 3).
// ═══════════════════════════════════════════════════════════════════════════

import type { AdInputs } from "../types";

/**
 * The minimum shape a caller must hand to `isEmptySnapshot`. The fields
 * are exactly what the predicate reads — the type deliberately does not
 * widen to `Pick<SavedProject, ...>` so the function cannot be passed
 * more than it depends on (a future caller that, say, accidentally
 * threads the whole SavedProject through here would fail to compile).
 */
export type SnapshotShape = {
  /** Form input. `null` and `undefined` are both empty; any object is non-empty. */
  inputs: AdInputs | null | undefined;
  /** Render history (mockup studio). Read-only array; `undefined` is treated as empty. */
  mockupHistory: ReadonlyArray<unknown> | undefined;
  /** Carousel-mode slides. Read-only array; `undefined` is treated as empty. */
  carouselSlides: ReadonlyArray<unknown> | undefined;
  /** Batch-mode results. Read-only array; `undefined` is treated as empty. */
  batchResults: ReadonlyArray<unknown> | undefined;
  /** Batch-mode captions. Read-only array; `undefined` is treated as empty. */
  batchCaptions: ReadonlyArray<unknown> | undefined;
  /** Batch-mode hook groups. Read-only array; `undefined` is treated as empty. */
  batchHookGroups: ReadonlyArray<unknown> | undefined;
  /** Generated tone-of-voice text. Falsy (incl. `''` and `undefined`) is empty. */
  tovText: string | undefined;
  /** Generated concept text. Falsy (incl. `''` and `undefined`) is empty. */
  conceptsText: string | undefined;
  /** Generated build plan. Falsy (incl. `''` and `undefined`) is empty. */
  buildPlan: string | undefined;
  /** Generated caption (primary-text step). Falsy (incl. `''` and `undefined`) is empty. */
  captionText: string | undefined;
};

/**
 * Returns `true` iff the live session snapshot carries no content the
 * user would expect to be persisted. The auto-save effect short-circuits
 * on `true` (no IndexedDB write, no Firestore round-trip).
 *
 * `undefined` is treated as empty everywhere — including for arrays,
 * where the inline guard this replaces would have crashed on `.length`.
 * That is the loadProject → malformed-doc → state-becomes-undefined
 * crash path; see the file header.
 */
export function isEmptySnapshot(s: SnapshotShape): boolean {
  // inputs: any non-null object is content. getDefaultInputs() returns
  // an object with all-empty string fields — that IS a real draft (the
  // user typed into it), so we don't drill into field-level emptiness
  // here. The auto-save's downstream cap-detection already handles the
  // over-cap case for that draft.
  if (s.inputs != null) return false;

  // Arrays: undefined or empty → empty. (arr?.length ?? 0) > 0 handles
  // both. The five array fields are independent — any one with content
  // makes the snapshot non-empty.
  if ((s.mockupHistory?.length ?? 0) > 0) return false;
  if ((s.carouselSlides?.length ?? 0) > 0) return false;
  if ((s.batchResults?.length ?? 0) > 0) return false;
  if ((s.batchCaptions?.length ?? 0) > 0) return false;
  if ((s.batchHookGroups?.length ?? 0) > 0) return false;

  // Text fields: any truthy string is content. Empty string ('') and
  // undefined both fall through to "empty" — a naive truthiness check
  // would conflate them, but in this predicate the directions agree
  // (a non-empty string is the only "content" case).
  if (s.tovText) return false;
  if (s.conceptsText) return false;
  if (s.buildPlan) return false;
  if (s.captionText) return false;

  return true;
}
