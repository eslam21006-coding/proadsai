// src/lib/projectAutoSave.ts — debounce + ceiling auto-save scheduler (no React deps)

import type { SavedProject } from "../types";

export type AutoSaveState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "saved"; clearAt: number }
  | { phase: "transient-error"; consecutiveFailures: 1 | 2 }
  | { phase: "persistent-failure"; consecutiveFailures: number; lastError: string };

type Listener = (state: AutoSaveState) => void;

const DEBOUNCE_MS = 3000;
const CEILING_MS = 30000;
const PERSISTENT_THRESHOLD = 3;

let state: AutoSaveState = { phase: "idle" };
let listeners: Set<Listener> = new Set();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let ceilingTimer: ReturnType<typeof setTimeout> | null = null;
let firstChangeAt: number | null = null;
let pendingSnapshotId = 0;
let currentInMemoryId = 0;
let consecutiveFailures = 0;

type SaveFn = (data: SavedProject) => Promise<void>;
let saveFn: SaveFn | null = null;
let pendingData: SavedProject | null = null;

function notify() {
  listeners.forEach((fn) => fn(state));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getState(): AutoSaveState {
  return state;
}

export function registerSaveFn(fn: SaveFn) {
  saveFn = fn;
}

function scheduleSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (!firstChangeAt) firstChangeAt = Date.now();

  debounceTimer = setTimeout(() => flush(), DEBOUNCE_MS);

  if (!ceilingTimer) {
    // Clamp to a non-negative delay — if the ceiling was somehow missed
    // (e.g., the tab was throttled), fire on the next tick rather than
    // letting setTimeout treat a negative number as 0 unpredictably.
    const ceilingDelay = Math.max(0, CEILING_MS - (Date.now() - firstChangeAt));
    ceilingTimer = setTimeout(() => {
      ceilingTimer = null;
      flush();
    }, ceilingDelay);
  }
}

export function queue(data: SavedProject) {
  currentInMemoryId++;
  pendingData = data;
  scheduleSave();
}

// Public flush result so callers (notably the workspace switch-guard
// "Save & Switch" path) can distinguish a confirmed successful save
// from one that the in-memory `state` recorded as transient-error /
// persistent-failure. The auto-save debounce/ceiling `flush()` callers
// don't care about the result — the observable `state` is enough for them.
export type FlushResult = { ok: true } | { ok: false; error: unknown };

export async function forceFlush(): Promise<FlushResult> {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
  firstChangeAt = null;
  if (!pendingData) return { ok: true };
  // Round-11 (CodeRabbit re-review): doSave now returns an explicit
  // FlushResult for every path (success, saveFn throw, stale-snapshot
  // catch, no saveFn). The previous code only updated the in-memory
  // `state` and returned void; forceFlush's reliance on `state.phase`
  // could miss the stale-snapshot catch branch (which set phase to
  // 'saving' after a saveFn throw), letting the workspace switch-guard
  // silently report success on a real save failure. doSave's return
  // value is now the source of truth.
  return await doSave(pendingData);
}

async function flush(): Promise<void> {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
  firstChangeAt = null;
  if (!pendingData) return;
  await doSave(pendingData);
}

async function doSave(data: SavedProject): Promise<FlushResult> {
  const snapshotId = currentInMemoryId;
  pendingSnapshotId = snapshotId;
  state = { phase: "saving" };
  notify();

  if (!saveFn) {
    state = { phase: "idle" };
    notify();
    return { ok: true };
  }

  try {
    await saveFn(data);
    consecutiveFailures = 0;
    if (currentInMemoryId !== snapshotId) {
      // Round-15 (CodeRabbit re-review): a newer queue() call superseded
      // our snapshot. The saveFn call we just awaited did persist this
      // snapshot, but pendingData has since been replaced by a newer
      // edit that has NOT been persisted. For the auto-save path the
      // next debounce will pick up the newer state; for forceFlush
      // (called explicitly by the workspace switch-guard "Save &
      // Switch" path) we must NOT report success here — the user's
      // intent is "I want a definitive answer about ALL pending work"
      // and the answer must include the newer queued edit. Report a
      // distinct 'superseded' failure so the switch-guard keeps the
      // dialog open and the user can retry after the next debounce
      // lands. The auto-save's flush() ignores the return value, so
      // changing the stale-snapshot return here does not affect the
      // debounce/ceiling flow.
      state = { phase: "saving" };
      notify();
      return { ok: false, error: "superseded" };
    }
    state = { phase: "saved", clearAt: Date.now() + 2000 };
    notify();
    setTimeout(() => {
      if (state.phase === "saved" && state.clearAt <= Date.now()) {
        state = { phase: "idle" };
        notify();
      }
    }, 2100);
    return { ok: true };
  } catch (err: unknown) {
    consecutiveFailures++;
    const errMsg = err instanceof Error ? err.message : String(err);

    if (currentInMemoryId !== snapshotId) {
      // Round-11: this branch is reached after saveFn THREW. Even
      // though a newer edit has superseded the snapshot, the prior
      // saveFn DID throw — the persisted state is not what was in
      // memory. Surface the failure to the caller (the workspace
      // switch-guard relies on this to keep the dialog open).
      state = { phase: "saving" };
      notify();
      return { ok: false, error: err };
    }

    if (consecutiveFailures >= PERSISTENT_THRESHOLD) {
      state = { phase: "persistent-failure", consecutiveFailures, lastError: errMsg };
    } else {
      state = { phase: "transient-error", consecutiveFailures: consecutiveFailures as 1 | 2 };
    }
    notify();
    return { ok: false, error: err };
  }
}

export function retryNow() {
  if (pendingData) {
    forceFlush();
  }
}

export function reset() {
  if (debounceTimer) clearTimeout(debounceTimer);
  if (ceilingTimer) clearTimeout(ceilingTimer);
  debounceTimer = null;
  ceilingTimer = null;
  firstChangeAt = null;
  consecutiveFailures = 0;
  // Reset snapshot counters too — otherwise a later save's snapshotId could
  // collide with a stale comparison from before reset(), defeating the
  // FR-018 in-memory-prevails check.
  pendingSnapshotId = 0;
  currentInMemoryId = 0;
  state = { phase: "idle" };
  pendingData = null;
}
