"use client";

import { useEffect, useMemo, useState } from "react";
import { tradeSearchUrl, type StatFilter } from "../lib/tradeLink";
import { SearchCombo } from "./craft/SearchCombo";
import { RollGuide } from "./craft/RollGuide";
import { PasteRare, type ParsedRare } from "./craft/PasteRare";

interface StatOption {
  id: string;
  text: string;
  group: string;
}
interface BaseGroup {
  category: string;
  types: string[];
}
interface ChosenMod extends StatFilter {
  text: string;
}

type Ccy = "exalted" | "divine" | "chaos";

interface SideStats {
  total: number;
  sampled: number;
  minDiv: number | null;
  medianDiv: number | null;
  minRaw: { amount: number; currency: string } | null;
}
interface Rung extends SideStats {
  n: number;
}
interface PriceResult {
  buy: SideStats | null;
  ladder: Rung[];
  marginDiv: number | null;
}
interface ModStat {
  mod: string;
  count: number;
  medianDiv: number | null;
  maxDiv: number;
}
interface ModScan {
  total: number;
  sampled: number;
  modStats: ModStat[];
  preview: Array<{ priceDiv: number; mods: string[]; name: string; icon: string | null }>;
}
const fmtDiv = (n: number | null) =>
  n == null ? "—" : `${n >= 10 ? Math.round(n) : n >= 1 ? n.toFixed(1) : n < 0.1 ? n.toFixed(3) : n.toFixed(2)} Div`;
const modShort = (text: string, min?: number) => `${text.replace(/^#?\s*/, "").replace(/^to /, "")}${min != null ? ` ≥${min}` : ""}`;

export function CraftPlanner() {
  const [league, setLeague] = useState("");
  const [stats, setStats] = useState<StatOption[]>([]);
  const [bases, setBases] = useState<BaseGroup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [category, setCategory] = useState("");
  const [baseType, setBaseType] = useState("");
  const [mods, setMods] = useState<ChosenMod[]>([]);
  const [maxBase, setMaxBase] = useState("5");
  const [baseCcy, setBaseCcy] = useState<Ccy>("exalted");

  const [priced, setPriced] = useState<PriceResult | null>(null);
  const [pricing, setPricing] = useState(false);
  const [priceErr, setPriceErr] = useState<string | null>(null);

  const [scan, setScan] = useState<ModScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/craft/meta")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(d.error);
        } else {
          setLeague(d.league);
          setStats(d.stats ?? []);
          setBases(d.bases ?? []);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // flat searchable base list across ALL categories — so an item whose category you
  // can't guess (e.g. a Focus) is still findable by typing its base name.
  const allBases = useMemo(
    () => bases.flatMap((b) => b.types.map((t) => ({ category: b.category, type: t }))),
    [bases],
  );
  const pickBase = (b: { category: string; type: string }) => {
    setCategory(b.category);
    setBaseType(b.type);
  };

  const chosenIds = useMemo(() => new Set(mods.map((m) => m.id)), [mods]);
  const addMod = (s: StatOption) => setMods((m) => [...m, { id: s.id, text: s.text, min: undefined }]);

  // paste-a-rare → prefill the planner: set its base + its mods (min = the actual roll). The
  // value then comes from the ladder / roll guide, not a separate panel.
  const loadParsed = (r: ParsedRare) => {
    setBaseType(r.baseType);
    setCategory(allBases.find((b) => b.type.toLowerCase() === r.baseType.toLowerCase())?.category ?? "");
    setMods(r.stats.map((s) => ({ id: s.id, text: s.text, min: s.roll > 0 ? Math.round(s.roll) : undefined })));
  };
  const setMin = (id: string, v: string) =>
    setMods((m) => m.map((x) => (x.id === id ? { ...x, min: v.trim() === "" ? undefined : Number(v) } : x)));
  const removeMod = (id: string) => setMods((m) => m.filter((x) => x.id !== id));

  const buyUrl =
    baseType && league
      ? tradeSearchUrl(league, {
          type: baseType,
          rarity: "normal",
          maxPrice: { amount: Number(maxBase) || 0, currency: baseCcy },
        })
      : null;
  const sellUrl =
    baseType && league
      ? tradeSearchUrl(league, { type: baseType, rarity: "rare", stats: mods })
      : null;

  const fetchPrices = async () => {
    if (!baseType) return;
    setPricing(true);
    setPriceErr(null);
    try {
      const statF = mods.map((m) => ({ id: m.id, ...(m.min != null ? { min: m.min } : {}) }));
      const res = await fetch("/api/craft/price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buy: { type: baseType, rarity: "normal", maxPrice: { amount: Number(maxBase) || 0, currency: baseCcy } },
          sell: { type: baseType, rarity: "rare", stats: statF },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setPriced(d);
    } catch (e) {
      setPriceErr(e instanceof Error ? e.message : String(e));
      setPriced(null);
    } finally {
      setPricing(false);
    }
  };

  const fetchMods = async () => {
    if (!baseType) return;
    setScanning(true);
    setScanErr(null);
    try {
      const res = await fetch("/api/craft/mods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: baseType }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setScan(d);
    } catch (e) {
      setScanErr(e instanceof Error ? e.message : String(e));
      setScan(null);
    } finally {
      setScanning(false);
    }
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Craft Planner — base → mods → resell</h2>
        <span className="text-xs text-neutral-500">live trade2 search links</span>
      </header>
      <p className="mb-3 text-xs text-neutral-600">
        Pick a base and the mods you want on the finished rare. We build two live searches: a cheap{" "}
        <span className="text-bad">base to buy</span> and the <span className="text-good">finished item to sell</span>.
        Open both, read real prices — margin = sell − base − craft cost. (Craft outcome isn&apos;t guaranteed; this
        prices the goal, not the odds.)
      </p>

      {err && <p className="text-sm text-bad">error: {err}</p>}
      {loading && <p className="text-sm text-neutral-500">loading trade data…</p>}

      {!loading && !err && (
        <div className="space-y-3">
          {/* paste an in-game rare → auto-fill base + mods, then value it with the ladder below */}
          <PasteRare onLoad={loadParsed} />

          {/* base type — the search IS the field: type to search when empty, chip when picked */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[18rem] flex-1 flex-col gap-1 text-xs text-neutral-400">
              base type
              {baseType ? (
                <span className="flex items-center gap-2 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm">
                  <span className="text-neutral-100">{baseType}</span>
                  {category && <span className="text-xs text-neutral-600">{category}</span>}
                  <button
                    onClick={() => {
                      setBaseType("");
                      setCategory("");
                    }}
                    className="ml-auto text-xs text-neutral-600 hover:text-bad"
                  >
                    ✕
                  </button>
                </span>
              ) : (
                <SearchCombo
                  options={allBases}
                  toText={(b) => `${b.type} ${b.category}`}
                  toKey={(b) => `${b.category}/${b.type}`}
                  onPick={pickBase}
                  placeholder="search base type… (e.g. focus, sceptre, ring) — keywords, any order"
                  renderRow={(b) => (
                    <>
                      <span className="text-neutral-100">{b.type}</span>
                      <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">{b.category}</span>
                    </>
                  )}
                />
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs text-neutral-400" title="ceiling for the bare base you buy to craft on — blank = no cap">
              base buy cap (optional)
              <span className="flex items-center gap-1">
                <input
                  value={maxBase}
                  onChange={(e) => setMaxBase(e.target.value)}
                  inputMode="decimal"
                  placeholder="any"
                  className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right text-sm tabular-nums"
                />
                <select
                  value={baseCcy}
                  onChange={(e) => setBaseCcy(e.target.value as Ccy)}
                  className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1.5 text-sm"
                >
                  <option value="exalted">Ex</option>
                  <option value="chaos">Ch</option>
                  <option value="divine">Div</option>
                </select>
              </span>
            </label>
          </div>

          {/* target mods — fuzzy keyword search: "increased chance hit" finds "Critical Hit Chance" */}
          <SearchCombo
            options={stats}
            exclude={chosenIds}
            toText={(s) => s.text}
            toKey={(s) => s.id}
            onPick={addMod}
            placeholder='add target mod… keywords any order (e.g. "increased chance hit", "spirit", "cold res")'
            renderRow={(s) => (
              <>
                <span className="flex-1">{s.text}</span>
                <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">{s.group}</span>
              </>
            )}
          />

          {mods.length > 0 && (
            <ul className="space-y-1">
              {mods.map((m) => (
                <li key={m.id} className="flex items-center gap-2 rounded bg-neutral-800/40 px-2 py-1 text-sm">
                  <span className="flex-1">{m.text}</span>
                  <span className="text-xs text-neutral-500">min</span>
                  <input
                    value={m.min ?? ""}
                    onChange={(e) => setMin(m.id, e.target.value)}
                    placeholder="any"
                    inputMode="decimal"
                    className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums"
                  />
                  <button onClick={() => removeMod(m.id)} className="text-xs text-neutral-600 hover:text-bad">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* interactive top-roll guide — scans real items, shows ideal roll, one-click sets the target min */}
          {baseType && mods.length > 0 && (
            <RollGuide baseType={baseType} mods={mods} onSetMin={(id, v) => setMin(id, String(v))} />
          )}

          {/* output links */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <LinkCard
              href={buyUrl}
              tone="bad"
              title="buy base →"
              sub={baseType ? `${baseType}, normal, ≤ ${maxBase} ${baseCcy}` : "pick a base type"}
            />
            <LinkCard
              href={sellUrl}
              tone="good"
              title="sell finished →"
              sub={baseType ? `${baseType}, rare, ${mods.length} mod${mods.length === 1 ? "" : "s"}` : "pick a base type"}
            />
          </div>
          {/* live price ladder — median sell price as you stack more of the target mods */}
          <div className="flex items-center gap-3">
            <button
              onClick={fetchPrices}
              disabled={!baseType || pricing}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-40"
            >
              {pricing ? "fetching…" : "fetch price ladder"}
            </button>
            {priceErr && <span className="text-xs text-bad">{priceErr}</span>}
            {priced?.buy?.minDiv != null && (
              <span className="text-sm text-neutral-400">
                bare base ≈ <span className="font-semibold text-bad">{fmtDiv(priced.buy.minDiv)}</span>
              </span>
            )}
            {priced?.marginDiv != null && (
              <span className={`text-sm font-semibold ${priced.marginDiv >= 0 ? "text-good" : "text-bad"}`}>
                full stack margin ≈ {priced.marginDiv >= 0 ? "+" : ""}
                {fmtDiv(priced.marginDiv)}
              </span>
            )}
          </div>

          {priced && priced.ladder.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="bg-neutral-800/40 text-left text-xs text-neutral-400">
                  <tr>
                    <th className="px-3 py-1.5">mods required (stacked)</th>
                    <th className="px-3 py-1.5 text-right">median</th>
                    <th className="px-3 py-1.5 text-right">floor</th>
                    <th className="px-3 py-1.5 text-right"># listed</th>
                  </tr>
                </thead>
                <tbody>
                  {priced.ladder.map((r) => {
                    const names = r.n === 0 ? "bare rare (any mods)" : mods.slice(0, r.n).map((m) => modShort(m.text, m.min)).join(" + ");
                    return (
                      <tr key={r.n} className="border-t border-neutral-800">
                        <td className="px-3 py-1.5">
                          <span className="text-neutral-500">{r.n || "·"}× </span>
                          {names}
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-good">{fmtDiv(r.medianDiv)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{fmtDiv(r.minDiv)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">{r.total}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-xs text-neutral-600">
            The ladder requires the first 1, 2, 3… mods (each at its min) and shows the <span className="text-good">median</span>{" "}
            ask per rung — that&apos;s how price climbs as you stack good mods. <span className="text-bad">Floor</span> is the
            cheapest dump (ignore it). Margin = full-stack median − bare base, before craft/spin cost.
          </p>

          {/* "what sells" scan — reverse view: read the mods on the most expensive rares of this base */}
          <div className="border-t border-neutral-800 pt-3">
            <div className="mb-2 flex items-center gap-3">
              <button
                onClick={fetchMods}
                disabled={!baseType || scanning}
                className="rounded bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:opacity-40"
              >
                {scanning ? "scanning…" : "scan what sells (top-end mods)"}
              </button>
              <span className="text-xs text-neutral-500">reads mods off the priciest rare {baseType || "bases"} — what to craft toward</span>
              {scanErr && <span className="text-xs text-bad">{scanErr}</span>}
            </div>

            {scan && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {/* aggregated: which mods appear on the expensive end */}
                <div className="overflow-hidden rounded-lg border border-neutral-800">
                  <div className="bg-neutral-800/40 px-3 py-1.5 text-xs text-neutral-400">
                    mods on the priciest {scan.sampled} listed (of {scan.total})
                  </div>
                  <table className="w-full text-sm">
                    <tbody>
                      {scan.modStats.map((m) => (
                        <tr key={m.mod} className="border-t border-neutral-800">
                          <td className="px-3 py-1">{m.mod}</td>
                          <td className="px-3 py-1 text-right tabular-nums text-neutral-500">{m.count}×</td>
                          <td className="px-3 py-1 text-right font-semibold tabular-nums text-good">{fmtDiv(m.medianDiv)}</td>
                        </tr>
                      ))}
                      {scan.modStats.length === 0 && (
                        <tr>
                          <td className="px-3 py-2 text-center text-neutral-500">no priced rares found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* raw preview: the actual expensive items + their full mod set */}
                <div className="space-y-2">
                  {scan.preview.map((p, i) => (
                    <div key={i} className="rounded-lg border border-neutral-800 bg-neutral-800/30 p-2 text-xs">
                      <div className="mb-1 flex items-center gap-2">
                        {p.icon && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.icon} alt="" className="h-7 w-7 shrink-0 object-contain" loading="lazy" />
                        )}
                        <span className="flex-1 truncate text-neutral-300">{p.name}</span>
                        <span className="font-semibold text-good">{fmtDiv(p.priceDiv)}</span>
                      </div>
                      <ul className="space-y-0.5 text-neutral-400">
                        {p.mods.map((mod, j) => (
                          <li key={j}>{mod}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function LinkCard({ href, tone, title, sub }: { href: string | null; tone: "good" | "bad"; title: string; sub: string }) {
  const cls = tone === "good" ? "text-good" : "text-bad";
  if (!href) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-800/20 p-3 opacity-50">
        <div className={`text-sm font-semibold ${cls}`}>{title}</div>
        <div className="text-xs text-neutral-600">{sub}</div>
      </div>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-lg border border-neutral-700 bg-neutral-800/40 p-3 transition hover:border-neutral-500 hover:bg-neutral-800/70"
    >
      <div className={`text-sm font-semibold ${cls}`}>{title}</div>
      <div className="text-xs text-neutral-500">{sub}</div>
    </a>
  );
}
