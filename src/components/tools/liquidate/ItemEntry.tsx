"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  LIQUIDATE_MAX_NAME,
  LIQUIDATE_MAX_QTY,
  suggestResponseSchema,
  type DraftItem,
  type LiquidateSuggestion,
} from "../../../lib/tools/liquidateContract";
import { describeError } from "../../../lib/clientWarn";
import { fmtSmart } from "../../../lib/format";

const SUGGEST_DEBOUNCE_MS = 200;

/** Debounced autocomplete: exchange items of your league + unique names. Failures are shown, not dropped. */
function useSuggestions(q: string): { items: LiquidateSuggestion[]; warning: string | null } {
  const [state, setState] = useState<{ items: LiquidateSuggestion[]; warning: string | null }>({ items: [], warning: null });
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setState({ items: [], warning: null });
      return;
    }
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/tools/liquidate?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then(async (r) => {
          if (!r.ok) throw new Error(`suggestions → HTTP ${r.status}`);
          setState(suggestResponseSchema.parse(await r.json()));
        })
        .catch((e: unknown) => {
          if (ctrl.signal.aborted) return;
          console.warn("[liquidate] autocomplete failed", e);
          setState({ items: [], warning: `autocomplete failed: ${describeError(e)}` });
        });
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [q]);
  return state;
}

function SuggestionList({ items, onPick }: { items: LiquidateSuggestion[]; onPick: (name: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-950 shadow-xl">
      {items.map((s) => (
        <li key={`${s.kind}:${s.name}`}>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(s.name)}
            className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-neutral-800"
            title={s.kind === "exchange" ? "sold on the Currency Exchange (poe.ninja line)" : "unique — listed on trade"}
          >
            {s.icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.icon} alt="" className="h-5 w-5 shrink-0 object-contain" loading="lazy" />
            ) : (
              <span className="h-5 w-5 shrink-0 rounded bg-orange-900/40" />
            )}
            <span className="truncate">{s.name}</span>
            <span className={`ml-auto text-[10px] uppercase ${s.kind === "exchange" ? "text-sky-400/80" : "text-orange-400/80"}`}>
              {s.kind === "exchange" ? "exchange" : "unique"}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

const parseQty = (s: string): number | null => {
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= LIQUIDATE_MAX_QTY ? n : null;
};
const parseDiv = (s: string): number | undefined | null => {
  if (s.trim() === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const INPUT = "rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-500";

/** Name (with autocomplete) + qty + optional own value → one draft row. */
export function ItemEntry({ onAdd }: { onAdd: (item: DraftItem) => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [manual, setManual] = useState("");
  const [focused, setFocused] = useState(false);
  // The list closes on the name just picked and reopens as soon as the user edits it — focus stays put.
  const [picked, setPicked] = useState<string | null>(null);
  const suggestions = useSuggestions(name);
  const q = parseQty(qty);
  const m = parseDiv(manual);
  const valid = name.trim().length > 0 && name.trim().length <= LIQUIDATE_MAX_NAME && q != null && m !== null;
  const add = (): void => {
    if (!valid || q == null || m === null) return;
    onAdd({ name: name.trim(), qty: q, manualDiv: m, askDiv: null });
    setName("");
    setPicked(null);
    setQty("1");
    setManual("");
  };
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
      <div className="relative min-w-[14rem] flex-1">
        <input value={name} onChange={(e) => setName(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="item to sell — e.g. Kulemak's Invitation" maxLength={LIQUIDATE_MAX_NAME} className={`${INPUT} w-full`} aria-label="item name" />
        {focused && name !== picked && <SuggestionList items={suggestions.items} onPick={(n) => { setName(n); setPicked(n); }} />}
      </div>
      <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" aria-label="quantity" title="how many you sell"
        className={`${INPUT} w-20 tabular-nums ${q == null ? "border-bad/70" : ""}`} />
      <input value={manual} onChange={(e) => setManual(e.target.value)} inputMode="decimal" placeholder="own Div/unit" aria-label="your value in Divine per unit"
        title="optional — your own value per unit in Divine. Needed for rares; overrides poe2scout for uniques."
        className={`${INPUT} w-28 tabular-nums ${m === null ? "border-bad/70" : ""}`} />
      <button type="submit" disabled={!valid} className="inline-flex items-center gap-1 rounded bg-orange-600/80 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-40">
        <Plus className="h-3.5 w-3.5" /> add
      </button>
      {suggestions.warning && <p className="w-full text-xs text-amber-400">{suggestions.warning}</p>}
    </form>
  );
}

interface EntryListProps {
  items: DraftItem[];
  onUpdate: (index: number, patch: Partial<DraftItem>) => void;
  onRemove: (index: number) => void;
}

function EntryRow({ item, index, onUpdate, onRemove }: Omit<EntryListProps, "items"> & { item: DraftItem; index: number }) {
  const [qty, setQty] = useState(String(item.qty));
  const [manual, setManual] = useState(item.manualDiv?.toString() ?? "");
  const m = parseDiv(manual);
  return (
    <li className="flex items-center gap-2 rounded border border-neutral-800/80 bg-neutral-950/40 px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate text-neutral-200" title={item.name}>{item.name}</span>
      <input value={qty} aria-label={`quantity of ${item.name}`} inputMode="numeric"
        onChange={(e) => { setQty(e.target.value); const q = parseQty(e.target.value); if (q != null) onUpdate(index, { qty: q }); }}
        className={`w-20 rounded border bg-transparent px-1.5 py-0.5 text-right tabular-nums text-neutral-300 ${parseQty(qty) == null ? "border-bad/70" : "border-neutral-800"}`} />
      <input value={manual} aria-label={`your value for ${item.name}`} inputMode="decimal"
        placeholder={item.askDiv != null ? `ask/unit ${fmtSmart(item.askDiv)}` : "own Div"}
        title={item.askDiv != null
          ? `your listing's ask ≈ ${fmtSmart(item.askDiv)} Div per unit (a stash note on a stack prices each unit). A hint only — type a value to use one.`
          : "optional own value, Div per unit"}
        onChange={(e) => { setManual(e.target.value); const v = parseDiv(e.target.value); if (v !== null) onUpdate(index, { manualDiv: v }); }}
        className={`w-24 rounded border bg-transparent px-1.5 py-0.5 text-right tabular-nums text-neutral-300 ${m === null ? "border-bad/70" : "border-neutral-800"}`} />
      <button type="button" onClick={() => onRemove(index)} title="remove" aria-label={`remove ${item.name}`} className="text-neutral-600 hover:text-bad">
        <X className="h-4 w-4" />
      </button>
    </li>
  );
}

/** The items queued for the plan, each editable in place. */
export function EntryList({ items, onUpdate, onRemove }: EntryListProps) {
  if (items.length === 0) return null;
  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
      {items.map((item, index) => (
        <EntryRow key={`${item.name}:${index}`} item={item} index={index} onUpdate={onUpdate} onRemove={onRemove} />
      ))}
    </ul>
  );
}
