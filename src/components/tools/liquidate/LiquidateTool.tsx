"use client";

/*
 * Liquidation planner: what to sell where, for how much, and how fast. Read-only — it prices your
 * list from stored market data (no trade2 request) and hands you text to paste; it never lists,
 * whispers or buys anything.
 */

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  LIQUIDATE_MAX_ITEMS,
  draftSchema,
  liquidateResponseSchema,
  stashResponseSchema,
  type DraftItem,
  type LiquidateProvenance,
  type LiquidateResponse,
  type StashResponse,
} from "../../../lib/tools/liquidateContract";
import { describeError } from "../../../lib/clientWarn";
import { BundleCard } from "./BundleCard";
import { EntryList, ItemEntry } from "./ItemEntry";
import { PlanTable, type SourceLabels } from "./PlanTable";

const DRAFT_KEY = "tools-liquidate-draft";
const PLAN_DEBOUNCE_MS = 400;

function readDraft(): DraftItem[] {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw === null) return [];
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn("[liquidate] ignoring an unreadable saved draft", parsed.error.issues[0]);
      return [];
    }
    return parsed.data;
  } catch (error: unknown) {
    console.warn("[liquidate] could not read the saved draft from localStorage", error);
    return [];
  }
}

function useDraft(): [DraftItem[], (next: DraftItem[]) => void] {
  const [items, setItems] = useState<DraftItem[]>([]);
  // Restored after mount: the server render has no localStorage.
  useEffect(() => setItems(readDraft()), []);
  const update = useCallback((next: DraftItem[]) => {
    setItems(next);
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
    } catch (error: unknown) {
      console.warn("[liquidate] could not save the draft to localStorage", error);
    }
  }, []);
  return [items, update];
}

async function readJson(r: Response): Promise<unknown> {
  const body: unknown = await r.json();
  if (!r.ok) {
    const err = typeof body === "object" && body !== null && "error" in body ? String(body.error) : `HTTP ${r.status}`;
    throw new Error(err);
  }
  return body;
}

interface PlanState { data: LiquidateResponse | null; error: string | null; loading: boolean }

/** Re-plans (debounced) whenever the list changes; the previous result stays up while it runs. */
function usePlan(items: DraftItem[]): PlanState {
  const [state, setState] = useState<PlanState>({ data: null, error: null, loading: false });
  useEffect(() => {
    if (items.length === 0) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    const ctrl = new AbortController();
    const body = JSON.stringify({ items: items.map(({ name, qty, manualDiv }) => ({ name, qty, manualDiv })) });
    const timer = window.setTimeout(() => {
      setState((s) => ({ ...s, loading: true }));
      fetch("/api/tools/liquidate", { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: ctrl.signal })
        .then(readJson)
        .then((d) => setState({ data: liquidateResponseSchema.parse(d), error: null, loading: false }))
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          console.warn("[liquidate] plan failed", e);
          setState((s) => ({ ...s, error: describeError(e), loading: false }));
        });
    }, PLAN_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [items]);
  return state;
}

type StashState = { kind: "loading" } | { kind: "error"; error: string } | { kind: "ready"; data: StashResponse };

function useStash(): StashState {
  const [state, setState] = useState<StashState>({ kind: "loading" });
  useEffect(() => {
    fetch("/api/tools/liquidate/stash")
      .then(readJson)
      .then((d) => setState({ kind: "ready", data: stashResponseSchema.parse(d) }))
      .catch((e: unknown) => {
        console.warn("[liquidate] stash import unavailable", e);
        setState({ kind: "error", error: describeError(e) });
      });
  }, []);
  return state;
}

function ageText(min: number): string {
  if (min < 1) return "just now";
  if (min < 60) return `${Math.round(min)} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}

/** Minutes since a DB timestamp; SQLite's CURRENT_TIMESTAMP is UTC without a zone marker. */
function minutesSince(ts: string | null): number | null {
  if (ts == null) return null;
  const at = Date.parse(/[TZ]/.test(ts) ? ts : `${ts.replace(" ", "T")}Z`);
  return Number.isNaN(at) ? null : (Date.now() - at) / 60_000;
}

const ageOrUnknown = (min: number | null): string => (min == null ? "age unknown" : ageText(min));

function sourceLabels(p: LiquidateProvenance): SourceLabels {
  const cxAge = p.cxHour == null ? null : (Date.now() / 1000 - p.cxHour) / 60;
  return {
    cx: `GGG exchange VWAP · newest hour ${ageOrUnknown(cxAge)}`,
    ninja: `poe.ninja mid · ${ageOrUnknown(minutesSince(p.ninjaFetchedAt))} (no fresh exchange history)`,
    scout: `poe2scout unique price · cached ${p.scoutAgeHours == null ? "never" : ageText(p.scoutAgeHours * 60)}`,
    manual: "your own value per unit",
    none: "no value — type your own Div per unit",
  };
}

function ProvenanceChips({ p }: { p: LiquidateProvenance }) {
  const labels = sourceLabels(p);
  const chips: Array<[string, string]> = [
    [`rates ${p.ratesSource}`, `1 Div = ${Math.round(p.rates.exaltPerDivine)} ex = ${p.rates.chaosPerDivine.toFixed(1)} c · ${ageOrUnknown(minutesSince(p.ratesFetchedAt))}`],
    ["CX", p.cxHour == null ? "no fresh exchange history" : labels.cx],
    ["ninja", labels.ninja],
    ["scout", labels.scout],
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      <span className="rounded bg-neutral-800/70 px-1.5 py-0.5 text-[11px] text-neutral-300" title="priced in the league you are viewing">{p.league}</span>
      {chips.map(([label, title]) => (
        <span key={label} title={title} className="rounded border border-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-500">{label}</span>
      ))}
    </div>
  );
}

function ImportBar({ stash, onImport }: { stash: StashState; onImport: (d: StashResponse) => void }) {
  if (stash.kind === "loading") return <span className="text-xs text-neutral-600">checking your last stash read…</span>;
  if (stash.kind === "error") return <span className="text-xs text-bad">stash import unavailable: {stash.error}</span>;
  const d = stash.data;
  if (d.items.length === 0) return <span className="text-xs text-neutral-500" title="the Wealth tab's “read from trade” button reads your public tabs">{d.reason}</span>;
  return (
    <button type="button" onClick={() => onImport(d)} title={`${d.skippedOrbs} raw Divine/Exalted/Chaos stacks left out`}
      className="inline-flex items-center gap-1.5 rounded border border-sky-700/60 px-2.5 py-1 text-xs text-sky-300 hover:border-sky-500">
      <Download className="h-3.5 w-3.5" />
      import last stash read ({d.items.length} items, {d.ageMin == null ? "age unknown" : ageText(d.ageMin)})
    </button>
  );
}

/** Stash items not already on the list are appended; the list keeps its 200-item cap, loudly. */
function mergeImport(current: DraftItem[], d: StashResponse): { next: DraftItem[]; message: string } {
  const have = new Set(current.map((i) => i.name.toLowerCase()));
  const fresh = d.items
    .filter((i) => !have.has(i.name.toLowerCase()))
    .map((i): DraftItem => ({ name: i.name.slice(0, 120), qty: Math.min(Math.max(1, i.qty), 100_000), askDiv: i.askDiv }));
  const room = Math.max(0, LIQUIDATE_MAX_ITEMS - current.length);
  const added = fresh.slice(0, room);
  const parts = [`imported ${added.length} items`];
  if (fresh.length > added.length) parts.push(`${fresh.length - added.length} left out (list is capped at ${LIQUIDATE_MAX_ITEMS})`);
  if (d.items.length > fresh.length) parts.push(`${d.items.length - fresh.length} already listed`);
  return { next: [...current, ...added], message: parts.join(" · ") };
}

function PlanSection({ plan }: { plan: PlanState }) {
  const d = plan.data;
  return (
    <>
      {plan.error && <p className="text-xs text-bad">plan failed: {plan.error}</p>}
      {d && (
        <div className={`flex flex-col gap-3 transition-opacity ${plan.loading ? "opacity-60" : ""}`}>
          <ProvenanceChips p={d.provenance} />
          {d.warnings.map((w) => <p key={w} className="text-xs text-amber-400">{w}</p>)}
          <PlanTable plan={d.plan} exPerDiv={d.provenance.rates.exaltPerDivine} icons={d.currencyIcons} sources={sourceLabels(d.provenance)} />
          <BundleCard bundle={d.bundle} />
        </div>
      )}
    </>
  );
}

export function LiquidateTool() {
  const [items, setItems] = useDraft();
  const plan = usePlan(items);
  const stash = useStash();
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const add = (item: DraftItem): void => {
    if (items.length >= LIQUIDATE_MAX_ITEMS) return setImportMsg(`the list is capped at ${LIQUIDATE_MAX_ITEMS} items`);
    setItems([...items, item]);
  };
  const doImport = (d: StashResponse): void => {
    const { next, message } = mergeImport(items, d);
    setItems(next);
    setImportMsg(message);
  };
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-neutral-100">Liquidate</h2>
        <span className="text-xs text-neutral-500" title="uses stored market data only — no trade2 request, nothing is listed or bought for you">
          exchange or trade · price · fee · time to sell
        </span>
      </header>
      <ItemEntry onAdd={add} />
      <div className="flex flex-wrap items-center gap-3">
        <ImportBar stash={stash} onImport={doImport} />
        {importMsg && <span className="text-xs text-neutral-400">{importMsg}</span>}
        {items.length > 0 && (
          <button type="button" onClick={() => { setItems([]); setImportMsg(null); }} className="ml-auto text-xs text-neutral-500 hover:text-bad">clear list</button>
        )}
      </div>
      <EntryList items={items} onUpdate={(i, patch) => setItems(items.map((it, j) => (j === i ? { ...it, ...patch } : it)))} onRemove={(i) => setItems(items.filter((_, j) => j !== i))} />
      <PlanSection plan={plan} />
    </section>
  );
}
