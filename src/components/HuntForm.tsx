"use client";

import { useEffect, useMemo, useState } from "react";
import { huntReq, type Hunt } from "./huntApi";

interface StatOpt { id: string; text: string; group: string; }
interface StatRow { id: string; text: string; min: string; }
interface Names { uniques: { name: string; type: string }[]; baseTypes: string[]; stats: StatOpt[]; error: string | null; }

/** Trade catalog for the pickers (uniques, bases, mods). A failed load is shown, not swallowed. */
function useTradeNames(): Names {
  const [names, setNames] = useState<Names>({ uniques: [], baseTypes: [], stats: [], error: null });
  useEffect(() => {
    fetch("/api/trade/names")
      .then((r) => r.json())
      .then((d) =>
        setNames({
          uniques: d.uniques ?? [],
          baseTypes: [...new Set(((d.bases ?? []) as { types: string[] }[]).flatMap((b) => b.types))].sort(),
          stats: d.stats ?? [],
          error: null,
        }),
      )
      .catch((e: unknown) => setNames((n) => ({ ...n, error: `item catalog failed to load: ${String(e)}` })));
  }, []);
  return names;
}

/** Mod-filter rows; rows restored from stats_json (ids only) get their text once the catalog loads. */
function useStatFilters(ed: Hunt | null, stats: StatOpt[]) {
  const [rows, setRows] = useState<StatRow[]>(() =>
    ed?.stats_json ? (JSON.parse(ed.stats_json) as { id: string; min?: number }[]).map((s) => ({ id: s.id, text: s.id, min: s.min != null ? String(s.min) : "" })) : [],
  );
  useEffect(() => {
    if (stats.length > 0) setRows((prev) => prev.map((f) => ({ ...f, text: stats.find((s) => s.id === f.id)?.text ?? f.text })));
  }, [stats]);
  return {
    rows,
    add: (id: string, text: string) => setRows((p) => (p.some((f) => f.id === id) ? p : [...p, { id, text, min: "" }])),
    setMin: (id: string, min: string) => setRows((p) => p.map((f) => (f.id === id ? { ...f, min } : f))),
    remove: (id: string) => setRows((p) => p.filter((f) => f.id !== id)),
  };
}

interface FormState { label: string; item: string; pickedBase: string; rarity: string; maxAmount: string; maxCcy: string; targetDiv: string; }

function buildPayload(s: FormState, rows: StatRow[]) {
  const stats = rows
    .filter((f) => f.id && f.min.trim() !== "" && Number.isFinite(Number(f.min)))
    .map((f) => ({ id: f.id, min: Number(f.min) }));
  return {
    label: s.label.trim(),
    // unique hunts search by NAME (base carried from the pick); everything else by base type
    itemName: s.rarity === "unique" ? s.item.trim() || null : null,
    baseType: (s.rarity === "unique" ? s.pickedBase.trim() : s.item.trim()) || null,
    rarity: s.rarity || null,
    stats: stats.length ? stats : null,
    maxAmount: s.maxAmount.trim() === "" ? null : Number(s.maxAmount),
    maxCcy: s.maxCcy,
    targetDiv: s.targetDiv.trim() === "" ? null : Number(s.targetDiv),
  };
}

const initialState = (ed: Hunt | null): FormState => ({
  label: ed?.label ?? "",
  // one item concept: the text the user typed/picked + the base type a unique pick carries along
  item: ed?.item_name || ed?.base_type || "",
  pickedBase: ed?.base_type ?? "",
  rarity: ed?.rarity ?? "rare",
  maxAmount: ed?.max_amount != null ? String(ed.max_amount) : "",
  maxCcy: ed?.max_ccy ?? "exalted",
  targetDiv: ed?.target_div != null ? String(ed.target_div) : "",
});

export function HuntForm({ initial, onSaved, onCancel }: { initial: Hunt | null; onSaved: () => void; onCancel: () => void }) {
  const ed = initial;
  const names = useTradeNames();
  const filters = useStatFilters(ed, names.stats);
  const [s, setS] = useState<FormState>(() => initialState(ed));
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FormState) => (v: string) => setS((p) => ({ ...p, [k]: v }));

  const submit = () => {
    if (!s.label.trim()) return;
    const payload = buildPayload(s, filters.rows);
    const req = ed ? huntReq("PATCH", "/api/hunts", { id: ed.id, ...payload }) : huntReq("POST", "/api/hunts", payload);
    // the API validates the hunt; show its reason instead of pretending the save worked
    req
      .then(async (r) => {
        if (r.ok) return onSaved();
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `save failed (${r.status})`);
      })
      .catch((e: unknown) => setError(String(e)));
  };

  return (
    <div className={`rounded border bg-neutral-950/40 p-3 ${ed ? "border-sky-500/50" : "border-neutral-800"}`}>
      {ed && (
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-sky-300">editing “{ed.label}”</span>
          <button onClick={onCancel} className="text-neutral-500 hover:text-neutral-300">cancel</button>
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2 text-sm">
        <ItemPicker names={names} s={s} setS={setS} />
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          rarity
          <select value={s.rarity} onChange={(e) => set("rarity")(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5">
            {["", "normal", "magic", "rare", "unique"].map((r) => <option key={r} value={r}>{r || "any"}</option>)}
          </select>
        </label>
        <Field label="label" value={s.label} set={set("label")} w="w-36" placeholder="auto from item" />
        <PriceField amount={s.maxAmount} ccy={s.maxCcy} setAmount={set("maxAmount")} setCcy={set("maxCcy")} />
        <Field label="target (Div)" value={s.targetDiv} set={set("targetDiv")} w="w-24" placeholder="resale" numeric />
      </div>

      <ModFilters all={names.stats} rows={filters.rows} onAdd={filters.add} onMin={filters.setMin} onRemove={filters.remove} />

      <button onClick={submit} className="mt-2 rounded bg-good/80 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-good">
        {ed ? "save changes" : "add hunt"}
      </button>
      {(error ?? names.error) && <p className="mt-1.5 text-xs text-bad">⚠ {error ?? names.error}</p>}
    </div>
  );
}

function ItemPicker({ names, s, setS }: { names: Names; s: FormState; setS: (f: (p: FormState) => FormState) => void }) {
  return (
    <Autocomplete
      label="item — unique name or base type"
      value={s.item}
      onChange={(v) => setS((p) => ({ ...p, item: v }))}
      options={[
        // one box finds BOTH: picking a unique also sets rarity + carries its base along
        ...names.uniques.map((u) => ({ label: `${u.name} · ${u.type}`, value: u.name, meta: `u:${u.type}` })),
        ...names.baseTypes.map((t) => ({ label: t, value: t, meta: "b" })),
      ]}
      onPick={(o) =>
        setS((p) => {
          const unique = o.meta?.startsWith("u:") === true;
          return {
            ...p,
            item: o.value,
            pickedBase: unique ? o.meta!.slice(2) : "",
            rarity: unique ? "unique" : p.rarity,
            label: p.label.trim() || o.value,
          };
        })
      }
      placeholder="Coward's Legacy / Breach Ring"
    />
  );
}

function PriceField({ amount, ccy, setAmount, setCcy }: { amount: string; ccy: string; setAmount: (v: string) => void; setCcy: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      price ≤
      <span className="flex items-center gap-1">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="trigger" className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right tabular-nums" />
        <select value={ccy} onChange={(e) => setCcy(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1.5">
          {[["exalted", "Ex"], ["chaos", "Ch"], ["divine", "Div"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </span>
    </label>
  );
}

function ModFilters({ all, rows, onAdd, onMin, onRemove }: {
  all: StatOpt[]; rows: StatRow[]; onAdd: (id: string, text: string) => void; onMin: (id: string, min: string) => void; onRemove: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const options = useMemo<Opt[]>(() => all.map((s) => ({ label: `${s.text} · ${s.group}`, value: s.id, meta: s.text })), [all]);

  return (
    <div className="mt-2 rounded border border-neutral-800 bg-neutral-900/40 p-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-x-2">
        <span className="text-xs font-semibold text-neutral-400">mod filters — min roll</span>
        <span className="text-xs text-neutral-600">empty = any · catches a good roll listed cheap</span>
      </div>
      {rows.length > 0 && (
        <ul className="mb-2 space-y-1">
          {rows.map((f) => (
            <li key={f.id} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-neutral-300" title={f.text}>{f.text}</span>
              <span className="text-xs text-neutral-500">min</span>
              <input
                value={f.min}
                onChange={(e) => onMin(f.id, e.target.value)}
                inputMode="decimal"
                placeholder="any"
                className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right text-sm tabular-nums"
              />
              <button onClick={() => onRemove(f.id)} className="text-neutral-600 hover:text-bad" title="remove">✕</button>
            </li>
          ))}
        </ul>
      )}
      <Autocomplete
        label=""
        value={q}
        onChange={setQ}
        options={options}
        onPick={(o) => { onAdd(o.value, o.meta ?? o.label); setQ(""); }}
        placeholder={all.length ? "add mod (type to search)…" : "loading mods…"}
      />
    </div>
  );
}

interface Opt { label: string; value: string; meta?: string; }

function Autocomplete({ label, value, onChange, options, onPick, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; options: Opt[]; onPick: (o: Opt) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = value.trim().toLowerCase();
  const hits = q.length < 2 ? [] : options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, 30);
  return (
    <label className="relative flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-44 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm"
      />
      {open && hits.length > 0 && (
        <ul className="absolute top-full z-30 mt-1 max-h-60 w-64 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 shadow-2xl">
          {hits.map((o) => (
            <li key={`${o.value}|${o.label}`}>
              <button
                type="button"
                onMouseDown={() => { onPick(o); setOpen(false); }}
                className="block w-full px-2 py-1 text-left text-sm hover:bg-neutral-800"
              >
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

function Field({ label, value, set, w, placeholder, numeric }: {
  label: string; value: string; set: (v: string) => void; w: string; placeholder?: string; numeric?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      {label}
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? "decimal" : undefined}
        className={`${w} rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm ${numeric ? "text-right tabular-nums" : ""}`}
      />
    </label>
  );
}
