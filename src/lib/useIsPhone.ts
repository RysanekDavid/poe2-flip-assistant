"use client";

import { useSyncExternalStore } from "react";

// Tailwind's md breakpoint is 768 px; below it the layout is the phone one.
const PHONE_QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True below Tailwind's md breakpoint; false on the server render, then the real value after hydration. */
export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
}
