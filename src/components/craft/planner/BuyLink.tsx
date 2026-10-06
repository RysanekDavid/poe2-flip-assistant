"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { PlanResponse } from "../../../lib/tools/craftPlannerContract";
import { baseLinkResponseSchema, type BaseLinkResponse } from "../../../lib/tools/craftPlannerContractStart";
import { postJson } from "../moves/craftMovesClient";
import { baseLinkRequest } from "./plannerStartModel";

/**
 * The trade search for a plan's bought base (base type, rarity, item level and the carried mods,
 * fractured when the plan buys them fractured). Built from the trade site's cached reference data —
 * no search is run for you; you open it and buy by hand.
 */
export function BuyLink({ plan }: { plan: PlanResponse }) {
  const body = baseLinkRequest(plan);
  const key = JSON.stringify(body);
  const [state, setState] = useState<{ key: string; link: BaseLinkResponse | null; error: string | null } | null>(null);
  // keyed on the body's JSON: a new plan object with the same base and mods reuses the link
  useEffect(() => {
    if (key === "null") return;
    let live = true;
    postJson("/api/tools/craft-planner/base-link", JSON.parse(key) as unknown, baseLinkResponseSchema)
      .then((r) => {
        if (!r.ok) console.error(`[planner] base trade link refused (${r.status}): ${r.error}`);
        if (live) setState({ key, link: r.ok ? r.data : null, error: r.ok ? null : r.error });
      })
      .catch((e: unknown) => {
        console.error("[planner] base trade link failed", e);
        if (live) setState({ key, link: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      live = false;
    };
  }, [key]);
  if (!body) return null;
  const s = state?.key === key ? state : null;
  if (!s) return <span className="text-xs text-neutral-400">preparing the trade search…</span>;
  // the server's reason (configuration, trade site down) goes to the console; the player reads plain words
  if (s.error || !s.link) return <span role="alert" className="text-xs text-red-300">The trade search link isn&apos;t available right now — search the trade site for this base by hand.</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <a href={s.link.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-300 underline-offset-2 hover:underline">
        find this base on trade <ExternalLink aria-hidden className="h-3 w-3" />
      </a>
      {s.link.unmatched.length > 0 && <span className="text-neutral-400">(check by eye: {s.link.unmatched.join("; ")})</span>}
    </span>
  );
}
