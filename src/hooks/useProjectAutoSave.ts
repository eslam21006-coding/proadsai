// src/hooks/useProjectAutoSave.ts — React hook wrapping projectAutoSave module

import { useState, useEffect, useCallback, useRef } from "react";
import {
  subscribe,
  queue as autoSaveQueue,
  retryNow as autoSaveRetry,
  registerSaveFn,
  reset as autoSaveReset,
  type AutoSaveState,
} from "../lib/projectAutoSave";

export function useProjectAutoSave(saveFn: ((data: any) => Promise<void>) | null) {
  const [saveStatus, setSaveStatus] = useState<AutoSaveState>({ phase: "idle" });
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  useEffect(() => {
    registerSaveFn(async (data: any) => {
      if (saveFnRef.current) {
        await saveFnRef.current(data);
      }
    });

    const unsubscribe = subscribe((newState) => {
      setSaveStatus(newState);
    });

    return () => {
      unsubscribe();
      autoSaveReset();
    };
  }, []);

  const queue = useCallback((data: any) => {
    autoSaveQueue(data);
  }, []);

  const retryNow = useCallback(() => {
    autoSaveRetry();
  }, []);

  return { saveStatus, queue, retryNow };
}
