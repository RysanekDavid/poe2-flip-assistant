"use client";

import { useCallback, useEffect, useState } from "react";
import { roundPrice } from "../lib/format";

type Ccy = "DIVINE" | "EXALT" | "CHAOS";
const CCY_SHORT: Record<string, string> = { DIVINE: "Div", EXALT: "Ex", CHAOS: "Ch" };

interface Position {
  id: number;
  item_id: string;
  item_name: string;
  qty: number;
  buy_price: number;
  buy_ccy: string;
  buy_div_unit: number;
  opened_at: string;
  notes: string | null;
  mid: number | null;
  committedDiv: number;
  markDiv: number | null;
  unrealizedDiv: number | null;
}

const fmt = (n: number, d = 2) => n.toLocaleString("en-US", { maximumFractionDigits: d });

function holdAge(opened: string): string {
  const t = new Date(opened.replace(" ", "T") + "Z").getTime();
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ${mins % 60}m` : `${Math.floor(h / 24)}d ${h % 24}h`;
}

/** Open positions: BUY placed, not yet sold. Mark-to-market vs current mid, close to the flip log. */
export function PositionsPanel() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [committed, setCommitted] = useState(0);
  const [unrealized, setUnrealized] = useState(0);
  const [closing, setClosing] = useState<number | null>(null);

  const load = useCallback(
    () =>
      fetch("/api/positions")
        .then((r) => r.json())
        .then((d) => {
          setPositions(d.positions ?? []);
          setCommitted(d.committedTotal ?? 0);
          setUnrealized(d.unrealizedTotal ?? 0);
        })
        .catch(() => {}),
    [],
  );

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("positions-changed", onChange);
    const id = setInterval(load, 60_000);
    return () => {
      window.removeEventListener("positions-changed", onChange);
      clearInterval(id);
    };
  }, [load]);

  const cancel = (id: number) =>
    fetch("/api/positions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).then(load);

  if (positions.length === 0) {
    return (
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h2 className="mb-1 text-lg font-semibold">Open Positions</h2>
        <p className="text-sm text-neutral-500">
          none open — in a Flip Plan above, hit <span className="text-sky-400">“buy → open position”</span> after you
          place a buy order. Mark-to-market + hold time show here until you sell.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Open Positions</h2>
        <span className="text-xs tabular-nums text-neutral-400">
          {positions.length} open · committed <span className="font-semibold text-neutral-200">{fmt(committed)} Div</span> ·
          unrealized{" "}
          <span className={`font-semibold ${unrealized >= 0 ? "text-good" : "text-bad"}`}>
            {unrealized >= 0 ? "+" : ""}
            {fmt(unrealized)} Div
          </span>
        </span>
      </header>

      <table className="w-full text-sm">
        <thead className="text-left text-xs text-neutral-400">
          <tr>
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Bought @</th>
            <th className="py-1 text-right">Committed</th>
            <th className="py-1 text-right">Mid now</th>
            <th className="py-1 text-right">Unreal. P&L</th>
            <th className="py-1 text-right">Held</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <PositionRow key={p.id} p={p} closing={closing === p.id} onCloseToggle={() => setClosing(closing === p.id ? null : p.id)} onDone={() => { setClosing(null); load(); }} onCancel={() => cancel(p.id)} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PositionRow({
  p,
  closing,
  onCloseToggle,
  onDone,
  onCancel,
}: {
  p: Position;
  closing: boolean;
  onCloseToggle: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [sell, setSell] = useState("");
  const [sellCcy, setSellCcy] = useState<Ccy>("CHAOS");
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const sp = Number(sell);
    if (!(sp > 0)) return;
    setBusy(true);
    fetch("/api/positions/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, sellPrice: sp, sellCcy }),
    })
      .then((r) => r.json())
      .then(() => {
        window.dispatchEvent(new Event("flips-changed"));
        onDone();
      })
      .finally(() => setBusy(false));
  };

  const up = (p.unrealizedDiv ?? 0) >= 0;
  return (
    <>
      <tr className="border-t border-neutral-800">
        <td className="py-1.5 font-medium">{p.item_name}</td>
        <td className="py-1.5 text-right tabular-nums">{p.qty}</td>
        <td className="py-1.5 text-right tabular-nums text-neutral-400">
          {roundPrice(p.buy_price)} {CCY_SHORT[p.buy_ccy]}
        </td>
        <td className="py-1.5 text-right tabular-nums text-neutral-300">{fmt(p.committedDiv)} Div</td>
        <td className="py-1.5 text-right tabular-nums text-neutral-400">{p.mid != null ? `${fmt(p.mid * p.qty)} Div` : "—"}</td>
        <td className={`py-1.5 text-right font-semibold tabular-nums ${p.unrealizedDiv == null ? "text-neutral-600" : up ? "text-good" : "text-bad"}`}>
          {p.unrealizedDiv == null ? "—" : `${up ? "+" : ""}${fmt(p.unrealizedDiv)} Div`}
        </td>
        <td className="py-1.5 text-right tabular-nums text-neutral-500">{holdAge(p.opened_at)}</td>
        <td className="py-1.5 text-right">
          <button onClick={onCloseToggle} className="rounded border border-good/40 px-2 py-0.5 text-xs text-good hover:bg-good/10">
            {closing ? "×" : "sell"}
          </button>
        </td>
      </tr>
      {closing && (
        <tr className="bg-neutral-950/40">
          <td colSpan={8} className="px-2 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-neutral-500">sell {p.qty}× @</span>
              <input
                value={sell}
                onChange={(e) => setSell(e.target.value)}
                inputMode="decimal"
                placeholder="price/unit"
                autoFocus
                className="w-28 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-right tabular-nums"
              />
              <select value={sellCcy} onChange={(e) => setSellCcy(e.target.value as Ccy)} className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1 text-sm">
                <option value="CHAOS">Ch</option>
                <option value="EXALT">Ex</option>
                <option value="DIVINE">Div</option>
              </select>
              <button onClick={submit} disabled={busy} className="rounded bg-good/80 px-3 py-1 text-xs font-semibold text-neutral-950 hover:bg-good disabled:opacity-50">
                {busy ? "…" : "close → log flip"}
              </button>
              <button onClick={onCancel} className="ml-auto text-xs text-neutral-600 hover:text-bad" title="cancel position without selling (no flip logged)">
                cancel position
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
