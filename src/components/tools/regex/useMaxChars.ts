"use client";

import { useCallback, useEffect, useState } from "react";
import { REGEX_MAX_CHARS_DEFAULT, RegexParamsSchema } from "../../../lib/tools/regexContract";

// Per browser, not per user: the stash-search limit is a property of the game client.
const MAX_CHARS_KEY = "tools-regex-max-chars";

function readStoredMaxChars(): number | null {
  try {
    const raw = localStorage.getItem(MAX_CHARS_KEY);
    if (raw === null) return null;
    const parsed = RegexParamsSchema.shape.maxChars.safeParse(Number(raw));
    if (!parsed.success) {
      console.warn(`[tools/regex] ignoring stored max chars "${raw}"`);
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    console.warn("[tools/regex] could not read max chars from localStorage", error);
    return null;
  }
}

/** Stash-search character limit shared by every Regex sub-tab, remembered in this browser. */
export function useMaxChars(): [number, (n: number) => void] {
  const [value, setValue] = useState(REGEX_MAX_CHARS_DEFAULT);
  // Restored after mount: the server render has no localStorage.
  useEffect(() => {
    const stored = readStoredMaxChars();
    if (stored !== null) setValue(stored);
  }, []);
  const set = useCallback((n: number): void => {
    setValue(n);
    // an out-of-range value is mid-typing or a mistake: shown (red) in the field, never remembered
    if (!RegexParamsSchema.shape.maxChars.safeParse(n).success) return;
    try {
      if (n === REGEX_MAX_CHARS_DEFAULT) localStorage.removeItem(MAX_CHARS_KEY);
      else localStorage.setItem(MAX_CHARS_KEY, String(n));
    } catch (error: unknown) {
      console.warn("[tools/regex] could not persist max chars to localStorage", error);
    }
  }, []);
  return [value, set];
}
