"use client";

import { useEffect, useState } from "react";

/** Seconds until `retryAt`, ticking once a second while a 503 cool-down runs. */
export function useCountdown(retryAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (retryAt == null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [retryAt]);
  return retryAt == null ? 0 : Math.max(0, Math.ceil((retryAt - now) / 1000));
}
