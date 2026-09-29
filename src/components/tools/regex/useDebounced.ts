"use client";

import { useEffect, useState } from "react";

/** `value` once it has stopped changing for `ms` (the composer runs on the settled value only). */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
