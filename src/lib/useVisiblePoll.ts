"use client";

import { useEffect, useRef } from "react";

/**
 * Run `task` on mount and then every `intervalMs`, but only while the tab is visible: a hidden tab
 * stops polling, and becoming visible again refreshes at once before resuming the cadence.
 *
 * The latest `task` is read through a ref, so a callback that changes every render (it closes over
 * state) does not restart the timer; only an interval change does, and that does not re-run the
 * task early.
 */
export function useVisiblePoll(task: () => void, intervalMs: number): void {
  const taskRef = useRef(task);
  const ranOnce = useRef(false);

  useEffect(() => {
    taskRef.current = task;
  }, [task]);

  useEffect(() => {
    let timer: number | null = null;
    const stop = (): void => {
      if (timer != null) window.clearInterval(timer);
      timer = null;
    };
    const resume = (): void => {
      stop();
      timer = window.setInterval(() => taskRef.current(), intervalMs);
    };
    const onVisibility = (): void => {
      if (document.hidden) return stop();
      taskRef.current();
      resume();
    };

    if (!ranOnce.current) {
      ranOnce.current = true;
      taskRef.current();
    }
    if (!document.hidden) resume();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
