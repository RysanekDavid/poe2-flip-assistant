"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";

/**
 * A per-viewer UI preference (view mode, visible columns) kept in localStorage. The stored value is
 * read after mount — reading during render would make the server HTML disagree with the client —
 * and parsed with `schema`, because anything in storage may be stale or hand-edited. Storage can be
 * blocked (private window, cleared site data): a failed read or write is logged and the page keeps
 * working with the in-memory value. Pass a module-level `schema`: it is an effect dependency.
 */
export function usePersistedChoice<T>(key: string, schema: z.ZodType<T>, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(fallback);

  useEffect(() => {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch (e: unknown) {
      console.warn(`[prefs] could not read ${key}:`, e instanceof Error ? e.message : e);
      return;
    }
    if (raw === null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e: unknown) {
      console.warn(`[prefs] ${key} is not JSON, using the default:`, e instanceof Error ? e.message : e);
      return;
    }
    const result = schema.safeParse(parsed);
    if (result.success) setValue(result.data);
    else console.warn(`[prefs] ${key} has an unexpected shape, using the default:`, result.error.message);
  }, [key, schema]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch (e: unknown) {
        console.warn(`[prefs] could not save ${key}:`, e instanceof Error ? e.message : e);
      }
    },
    [key],
  );

  return [value, update];
}
