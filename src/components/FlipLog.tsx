"use client";

import { useEffect, useState, useCallback } from "react";
import { roundPrice } from "../lib/format";

interface Flip {
  id: number;
  item_name: string;
  qty: number;
  buy_price: number;
  buy_ccy: string;
  sell_price: number;
  sell_ccy: string;
  profit_div: number;
  profit_chaos: number;
  notes: string | null;
  created_at: string;
}

const CCY_SHORT: Record<string, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };

/** Read-only flip ledger. Logging happens from the Flip Plan card ("log flip"); this just
 *  shows the history + running P&L and lets you delete a mistaken entry. */
export function FlipLog() {
  const [flips, setFlips] = useState<Flip[]>([]);

  const load = useCallback(
    () =>
      fetch("/api/flips")
        .then((r) => r.json())
        .then((d) => setFlips(d.flips ?? []))
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    load();
    const onFlips = () => load();
    window.addEventListener("flips-changed", onFlips);
    return () => window.removeEventListener("flips-changed", onFlips);
  }, [load]);

  const remove = (id: number) =>
    fetch("/api/flips", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then(load);

  const totalDiv = flips.reduce((a, f) => a + f.profit_div, 0);
  const totalChaos = flips.reduce((a, f) => a + f.profit_chaos, 0);
  const wins = flips.filter((f) => f.profit_div > 0).length;
  const best = flips.reduce((m, f) => Math.max(m, f.profit_div), 0);

  const exportCsv = () => {
    const head = "time,item,qty,buy,buy_ccy,sell,sell_ccy,profit_div,profit_chaos,notes";
    const lines = flips.map(
      (f) =>
        `${f.created_at},"${f.item_name}",${f.qty},${f.buy_price},${f.buy_ccy},${f.sell_price},${f.sell_ccy},${f.profit_div.toFixed(3)},${f.profit_chaos.toFixed(1)},"${f.notes ?? ""}"`,
    );
    const blob = new Blob([[head, ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flips.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Flip History</h2>
        <button onClick={exportCsv} className="text-xs text-neutral-400 hover:text-neutral-100">
          export CSV
        </button>
      </header>

      <div className="mb-3 grid grid-cols-4 gap-2 text-center">
        <Stat label="Profit (Div)" value={totalDiv.toFixed(2)} tone={totalDiv >= 0 ? "text-good" : "text-bad"} />
        <Stat label="Profit (Ch)" value={roundPrice(totalChaos)} tone={totalChaos >= 0 ? "text-good" : "text-bad"} />
        <Stat label="Flips" value={`${flips.length}`} sub={flips.length ? `${Math.round((wins / flips.length) * 100)}% win` : ""} />
        <Stat label="Best (Div)" value={best.toFixed(2)} tone="text-good" />
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-neutral-400">
          <tr>
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Buy</th>
            <th className="py-1 text-right">Sell</th>
            <th className="py-1 text-right">Profit</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {flips.map((f) => (
            <tr key={f.id} className="border-t border-neutral-800">
              <td className="py-1.5" title={f.notes ?? undefined}>
                {f.item_name}
                {f.notes && <span className="ml-1.5 text-xs text-neutral-600">— {f.notes}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums">{f.qty}</td>
              <td className="py-1.5 text-right tabular-nums text-neutral-400">
                {roundPrice(f.buy_price)} {CCY_SHORT[f.buy_ccy]}
              </td>
              <td className="py-1.5 text-right tabular-nums text-neutral-400">
                {roundPrice(f.sell_price)} {CCY_SHORT[f.sell_ccy]}
              </td>
              <td className={`py-1.5 text-right font-semibold tabular-nums ${f.profit_div >= 0 ? "text-good" : "text-bad"}`}>
                {f.profit_div >= 0 ? "+" : ""}
                {f.profit_div.toFixed(2)} Div
              </td>
              <td className="py-1.5 text-right">
                <button onClick={() => remove(f.id)} className="text-xs text-neutral-600 hover:text-bad">
                  ✕
                </button>
              </td>
            </tr>
          ))}
          {flips.length === 0 && (
            <tr>
              <td colSpan={6} className="py-3 text-center text-neutral-500">
                no flips logged — set qty + prices in a Flip Plan above and hit “log flip”
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function Stat({ label, value, sub, tone = "" }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded bg-neutral-800/40 py-2">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`font-semibold tabular-nums ${tone}`}>{value}</div>
      {sub && <div className="text-xs text-neutral-600">{sub}</div>}
    </div>
  );
}
