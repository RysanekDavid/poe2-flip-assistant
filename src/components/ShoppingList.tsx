"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { formatDenom, type Denom } from "../core/treasury";
import { categoryColor, SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../lib/tableStyle";

interface ShopRow {
  id: number;
  name: string;
  type: string;
  category: string;
  icon: string | null;
  marketDivine: number;
  market: Denom;
  buy: Denom;
  tradeUrl: string;
}

export function ShoppingList() {
  const [rows, setRows] = useState<ShopRow[]>([]);
  const [snipe, setSnipe] = useState(0.85);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const [minDiv, setMinDiv] = useState("1");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/shop?limit=500")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErr(d.error);
          setRows([]);
        } else {
          setRows(d.rows ?? []);
          setSnipe(d.snipeDiscount ?? 0.85);
          setErr(null);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const cats = useMemo(() => [...new Set(rows.map((r) => r.category))].sort(), [rows]);
  const min = Number(minDiv) || 0;
  const query = q.trim().toLowerCase();

  const shown = rows.filter((r) => {
    if (r.marketDivine < min) return false;
    if (cat && r.category !== cat) return false;
    if (query && !r.name.toLowerCase().includes(query) && !r.type.toLowerCase().includes(query)) return false;
    return true;
  });

  const snipePct = Math.round((1 - snipe) * 100);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Shopping List — web trade snipes</h2>
        <span className="text-xs text-neutral-500">poe2scout fair value · hunt listings ≤ −{snipePct}%</span>
      </header>
      <p className="mb-3 text-xs text-neutral-600">
        Aggregate prices (≈daily), not live listings. Click <span className="text-good">open trade →</span> to see real
        listings sorted cheapest-first — snipe any at/below the buy target, relist at market.
      </p>

      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="filter by name or base…"
          className="min-w-48 flex-1 rounded border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-sm focus:border-neutral-600 focus:outline-none"
        />
        <label className="flex items-center gap-1 text-xs text-neutral-500">
          min Div
          <input
            value={minDiv}
            onChange={(e) => setMinDiv(e.target.value)}
            inputMode="decimal"
            className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums"
          />
        </label>
        <button onClick={load} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500">
          refresh
        </button>
      </div>

      {/* category pills */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        <Pill active={cat === ""} onClick={() => setCat("")} label="all" />
        {cats.map((c) => (
          <Pill key={c} active={cat === c} onClick={() => setCat(c)} label={c} dot={categoryColor(c).split(" ")[0]} />
        ))}
      </div>

      {err && <p className="text-sm text-bad">error: {err}</p>}
      {loading && <p className="text-sm text-neutral-500">loading poe2scout…</p>}

      {!loading && !err && (
        <div className={SCROLL_BOX}>
          <table className="w-full text-sm">
            <thead className={THEAD_STICKY}>
              <tr>
                <th className={CELL}>Item</th>
                <th className={`${CELL} text-right`}>Market</th>
                <th className={`${CELL} text-right`}>Snipe ≤</th>
                <th className={`${CELL} text-center`}>Trade</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={ROW_BASE}>
                  <td className={`${CELL} font-medium`}>
                    <span className="inline-flex items-center gap-2 align-middle">
                      {r.icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.icon} alt="" className="h-6 w-6 shrink-0 object-contain" loading="lazy" />
                      ) : (
                        <span className={`inline-block h-2 w-2 rounded-full ${categoryColor(r.category).split(" ")[0]}`} />
                      )}
                      <span>
                        {r.name}
                        {r.type && <span className="ml-1 text-xs text-neutral-500">{r.type}</span>}
                      </span>
                    </span>
                  </td>
                  <td className={`${CELL} whitespace-nowrap text-right tabular-nums text-neutral-300`}>{formatDenom(r.market)}</td>
                  <td className={`${CELL} whitespace-nowrap text-right tabular-nums font-semibold text-good`}>{formatDenom(r.buy)}</td>
                  <td className={`${CELL} text-center`}>
                    <a
                      href={r.tradeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
                    >
                      open trade →
                    </a>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-center text-neutral-500">
                    nothing matches — loosen the filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Pill({ active, onClick, label, dot }: { active: boolean; onClick: () => void; label: string; dot?: string }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs capitalize ${
        active ? "bg-neutral-200 text-neutral-900" : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
      }`}
    >
      {dot && <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
    </button>
  );
}
