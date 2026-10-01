/*
 * The URL a renamed or mistyped link is rewritten to. Pure (no React, no images) so the node
 * tests pin it.
 */
import type { TabRoute } from "./tabRegistry";

/**
 * `currentSearch` with ?tab= and ?tool= replaced by the route's, every other param kept in place:
 * an old link such as ?tab=wealth&tool=sell&item=… or ?tab=farm&tool=board&strategy=x&budget=y must
 * not lose the item, the open strategy or the filter when it lands on today's ids.
 */
export function canonicalSearch(currentSearch: string, { tab, tool }: TabRoute): string {
  const params = new URLSearchParams(currentSearch);
  const rest = [...params.entries()].filter(([k]) => k !== "tab" && k !== "tool");
  const next = new URLSearchParams({ tab });
  if (tool !== null) next.set("tool", tool);
  for (const [k, v] of rest) next.append(k, v);
  return `?${next.toString()}`;
}
