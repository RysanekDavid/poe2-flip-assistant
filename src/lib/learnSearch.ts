/*
 * Pure pieces of the Learn fetch hooks, kept out of the React file so testLearn can pin them.
 */

/** A GET's state; `ok` remembers which URL produced the data so a caller can tell it is current. */
export type Remote<T> =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; url: string; data: T }
  | { kind: "error"; message: string };

export const ENTITY_SEARCH_LIMIT = 8;

/** The typeahead request for a query; null for a blank query (no request). */
export function entitySearchUrl(query: string): string | null {
  const q = query.trim();
  return q === "" ? null : `/api/entities?${new URLSearchParams({ q, limit: String(ENTITY_SEARCH_LIMIT) }).toString()}`;
}

/**
 * The data only when it answers `url`. While a newer keystroke is still debouncing, the previous
 * answer is for a different query: showing or picking from it would select the wrong item on Enter.
 */
export function currentData<T>(state: Remote<T>, url: string | null): T | null {
  return state.kind === "ok" && url !== null && state.url === url ? state.data : null;
}
