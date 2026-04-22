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
    ceilingTimer = setTimeout(() => {
      ceilingTimer = null;
      flush();
    }, CEILING_MS - (Date.now() - firstChangeAt));
  }
}

export function queue(data: any) {
  currentInMemoryId++;
  pendingData = data;
  scheduleSave();
}

export async function forceFlush() {
  if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
  if (ceilingTimer) { clearTimeout(ceilingTimer); ceilingTimer = null; }
  firstChangeAt = null;
  if (!pendingData) return;
  await doSave(pendingData);
}

async function flush() {
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
  state = { phase: "idle" };
  pendingData = null;
}
