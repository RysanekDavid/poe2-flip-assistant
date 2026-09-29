"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import { assertOk, describeError } from "../../lib/clientWarn";
import { entitySearchResponseSchema, type EntitySearchResponse } from "../../lib/learnContract";

export type Remote<T> = { kind: "idle" } | { kind: "loading" } | { kind: "ok"; data: T } | { kind: "error"; message: string };

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
        .then((data) => setState({ kind: "ok", data }))
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
export function useEntitySearch(query: string): Remote<EntitySearchResponse> {
  const q = query.trim();
  const url = q === "" ? null : `/api/entities?${new URLSearchParams({ q, limit: "8" }).toString()}`;
  return useLearnGet(url, entitySearchResponseSchema, SEARCH_DEBOUNCE_MS);
}
