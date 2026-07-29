// src/lib/projectAutoSave.ts — debounce + ceiling auto-save scheduler (no React deps)

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

type SaveFn = (data: any) => Promise<void>;
let saveFn: SaveFn | null = null;
let pendingData: any = null;

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

export function queue(data: any) {
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

async function doSave(data: any): Promise<FlushResult> {
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
      // Round-11: this branch is reached after saveFn RESOLVED but a
      // newer edit superseded our snapshot. The earlier saveFn call
      // already ran on the wire; treat it as a successful save (the
      // user has newer state to worry about, the queued snapshot is
      // stale). The next debounce will save the newer state.
      state = { phase: "saving" };
      notify();
      return { ok: true };
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
