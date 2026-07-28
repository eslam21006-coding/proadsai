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
  await doSave(pendingData);
  if (state.phase === "transient-error" || state.phase === "persistent-failure") {
    // Round-7 (CodeRabbit re-review): the prior round-5 fix in App.tsx
    // re-threw on the await, but the underlying `doSave` was still
    // catching and resolving normally — so a save failure never
    // actually surfaced. We now return an explicit failure here so
    // the switch-guard can keep the dialog open and the user can
    // see that the persistence did not land.
    return { ok: false, error: state };
  }
  return { ok: true };
}

async function flush(): Promise<void> {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
  firstChangeAt = null;
  if (!pendingData) return;
  await doSave(pendingData);
}

async function doSave(data: any) {
  const snapshotId = currentInMemoryId;
  pendingSnapshotId = snapshotId;
  state = { phase: "saving" };
  notify();

  if (!saveFn) {
    state = { phase: "idle" };
    notify();
    return;
  }

  try {
    await saveFn(data);
    consecutiveFailures = 0;
    if (currentInMemoryId !== snapshotId) {
      state = { phase: "saving" };
      notify();
      return;
    }
    state = { phase: "saved", clearAt: Date.now() + 2000 };
    notify();
    setTimeout(() => {
      if (state.phase === "saved" && state.clearAt <= Date.now()) {
        state = { phase: "idle" };
        notify();
      }
    }, 2100);
  } catch (err: any) {
    consecutiveFailures++;
    const errMsg = err?.message || String(err);

    if (currentInMemoryId !== snapshotId) {
      state = { phase: "saving" };
      notify();
      return;
    }

    if (consecutiveFailures >= PERSISTENT_THRESHOLD) {
      state = { phase: "persistent-failure", consecutiveFailures, lastError: errMsg };
    } else {
      state = { phase: "transient-error", consecutiveFailures: consecutiveFailures as 1 | 2 };
    }
    notify();
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
