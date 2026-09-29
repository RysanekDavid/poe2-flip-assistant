"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import { assertOk, describeError } from "../../lib/clientWarn";
import { entitySearchResponseSchema, type EntitySearchResponse } from "../../lib/learnContract";
import type { Remote } from "../../lib/learnSearch";

export type { Remote } from "../../lib/learnSearch";

/** GET a Learn route and parse it with its contract; `url` null means "nothing to fetch". */
export function useLearnGet<T>(url: string | null, schema: z.ZodType<T>, delayMs = 0): Remote<T> {
  const [state, setState] = useState<Remote<T>>({ kind: "idle" });
  useEffect(() => {
    if (url === null) {
      setState({ kind: "idle" });
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState({ kind: "loading" });
      fetch(url, { signal: controller.signal })
        .then(async (r) => schema.parse(await assertOk(r, url).json()))
        .then((data) => setState({ kind: "ok", url, data }))
        .catch((error: unknown) => {
          // A superseded keystroke aborts its request on purpose; anything else is a real failure.
          if (controller.signal.aborted) return;
          console.error(`[learn] ${url} failed`, error);
          setState({ kind: "error", message: describeError(error) });
        });
    }, delayMs);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url, schema, delayMs]);
  return state;
}

export const SEARCH_DEBOUNCE_MS = 200;

/** Debounced typeahead over the entity catalog (blank query = idle, no request). */
export function useEntitySearch(url: string | null): Remote<EntitySearchResponse> {
  return useLearnGet(url, entitySearchResponseSchema, SEARCH_DEBOUNCE_MS);
}
