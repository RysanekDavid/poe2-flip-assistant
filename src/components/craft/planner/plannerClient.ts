"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import {
  planRejectedSchema,
  planResponseSchema,
  plannerCatalogSchema,
  plannerPoolSchema,
  type PlanRejected,
  type PlanRequest,
  type PlanResponse,
  type PlannerCatalog,
  type PlannerPool,
} from "../../../lib/tools/craftPlannerContract";
import { requestJson } from "../moves/craftMovesClient";

/** Reads for the planner: the catalog, one base's pool, and the plan itself. */

export type Load<T> = { kind: "loading" } | { kind: "error"; error: string } | { kind: "done"; data: T };

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** One GET that reports its failure loudly (console + state), never a silent empty view. */
function useGet<T>(url: string | null, schema: z.ZodType<T>, label: string): Load<T> | null {
  const [state, setState] = useState<{ url: string; load: Load<T> } | null>(null);
  useEffect(() => {
    if (url == null) return;
    let live = true;
    setState({ url, load: { kind: "loading" } });
    requestJson(url, { method: "GET" }, schema)
      .then((r) => live && setState({ url, load: r.ok ? { kind: "done", data: r.data } : { kind: "error", error: r.error } }))
      .catch((e: unknown) => {
        console.error(`[planner] ${label} read failed`, e);
        if (live) setState({ url, load: { kind: "error", error: errText(e) } });
      });
    return () => {
      live = false;
    };
  }, [url, schema, label]);
  if (url == null) return null;
  return state?.url === url ? state.load : { kind: "loading" };
}

export const useCatalog = (): Load<PlannerCatalog> => useGet("/api/tools/craft-planner", plannerCatalogSchema, "catalog") ?? { kind: "loading" };

export const usePool = (itemClass: string | null, base: string | null): Load<PlannerPool> | null =>
  useGet(itemClass && base ? `/api/tools/craft-planner?class=${encodeURIComponent(itemClass)}&base=${encodeURIComponent(base)}` : null, plannerPoolSchema, "pool");

export type PlanState =
  | { kind: "idle" }
  | { kind: "loading"; req: PlanRequest }
  | { kind: "plan"; req: PlanRequest; data: PlanResponse }
  | { kind: "rejected"; req: PlanRequest; data: PlanRejected }
  | { kind: "error"; req: PlanRequest; status: number | null; error: string };

async function postPlan(req: PlanRequest): Promise<PlanState> {
  const res = await fetch("/api/tools/craft-planner/plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req) });
  const json: unknown = await res.json().catch((e: unknown) => ({ error: `unreadable response (${res.status}): ${errText(e)}` }));
  if (res.ok) return { kind: "plan", req, data: planResponseSchema.parse(json) };
  if (res.status === 422) return { kind: "rejected", req, data: planRejectedSchema.parse(json) };
  const error = typeof json === "object" && json !== null && "error" in json && typeof json.error === "string" ? json.error : `request failed (${res.status})`;
  return { kind: "error", req, status: res.status, error };
}

/** The plan request; a newer request wins over a slower older one. */
export function usePlan(): { state: PlanState; run: (req: PlanRequest) => void; clear: () => void } {
  const [state, setState] = useState<PlanState>({ kind: "idle" });
  const seq = useRef(0);
  const run = useCallback((req: PlanRequest) => {
    const mine = ++seq.current;
    setState({ kind: "loading", req });
    postPlan(req)
      .then((next) => mine === seq.current && setState(next))
      .catch((e: unknown) => {
        console.error("[planner] plan request failed", e);
        if (mine === seq.current) setState({ kind: "error", req, status: null, error: errText(e) });
      });
  }, []);
  const clear = useCallback(() => {
    seq.current++;
    setState({ kind: "idle" });
  }, []);
  return { state, run, clear };
}
