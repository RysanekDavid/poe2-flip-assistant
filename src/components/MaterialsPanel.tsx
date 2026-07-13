"use client";

import { useEffect, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Sparkline } from "./ui/Sparkline";
import { PriceChart } from "./PriceChart";
import { SCROLL_BOX, THEAD_STICKY, ROW_BASE, CELL } from "../lib/tableStyle";
import { MATERIAL_GROUPS, type MaterialGroup } from "../core/craftMaterials";
import { MatIcon } from "./craft/MarginBreakdown";

interface MaterialRow {
  id: string;
  label: string;
  group: MaterialGroup;
  icon: string | null;
  priceDiv: number | null;
  change7d: number | null;
  spark7d: number[] | null;
  ageMin: number | null;
}
interface Resp {
  materials: MaterialRow[];
  exaltPerDivine: number | null;
}

/** "12.3 div" primary; falls back to exalt for sub-Divine prices, "—" when unpriced. */
function priceDiv(div: number | null, exPerDiv: number | null): string {
  if (div == null || div <= 0) return "—";
  if (div >= 1) return `${div.toLocaleString("en", { maximumFractionDigits: 2 })} div`;
  if (exPerDiv && exPerDiv > 0) {
    const ex = div * exPerDiv;
    return `${ex.toLocaleString("en", { maximumFractionDigits: ex >= 10 ? 0 : 1 })} ex`;
  }
  return `${div.toPrecision(2)} div`;
}

function ageLabel(min: number | null): string {
  if (min == null) return "no data";
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

/**
 * Craft-material price tracker. The curated inputs the margin engine consumes, grouped by kind,
 * each with its live ninja price (Div, exalt fallback), 7d change + sparkline, and data age.
 * Click a row to open its full price chart below — same chart the Currency Exchange tab uses.
 */
export function MaterialsPanel() {
  const [data, setData] = useState<Resp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const load = () =>
      fetch("/api/craft/materials")
        .then((r) => r.json())
        .then((d: Resp & { error?: string }) => (d.error ? setErr(d.error) : (setData(d), setErr(null))))
        .catch((e) => setErr(String(e)));
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const ex = data?.exaltPerDivine ?? null;
  const byGroup = (g: MaterialGroup) => (data?.materials ?? []).filter((m) => m.group === g);

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex items-center gap-2.5">
        <FlaskConical className="h-5 w-5 text-violet-400" />
        <h2 className="text-lg font-semibold">Craft Materials</h2>
        <span className="text-xs text-neutral-500">· live ninja prices for the recipe inputs</span>
      </header>

      {err && <p className="text-sm text-bad">error: {err}</p>}

      <div className={SCROLL_BOX}>
        <table className="w-full text-sm">
          <thead className={THEAD_STICKY}>
            <tr>
              <th className={`${CELL} font-medium`}>Material</th>
              <th className={`${CELL} text-right font-medium`}>Price</th>
              <th className={`${CELL} text-right font-medium`}>7d</th>
              <th className={`${CELL} text-right font-medium`}>Age</th>
            </tr>
          </thead>
          <tbody>
            {MATERIAL_GROUPS.map(({ group, label }) => {
              const rows = byGroup(group);
              if (rows.length === 0) return null;
              return (
                <GroupRows
                  key={group}
                  label={label}
                  rows={rows}
                  ex={ex}
                  selectedId={selected?.id}
                  onSelect={(m) => setSelected({ id: m.id, name: m.label })}
                />
              );
            })}
            {data && data.materials.length === 0 && (
              <tr>
                <td colSpan={4} className="py-3 text-center text-neutral-500">
                  no materials — run a poll first
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="mt-4">
          <PriceChart itemId={selected.id} itemName={selected.name} />
        </div>
      )}

    </section>
  );
}

/** A group heading row plus its material rows. */
function GroupRows({
  label,
  rows,
  ex,
  selectedId,
  onSelect,
}: {
  label: string;
  rows: MaterialRow[];
  ex: number | null;
  selectedId?: string;
  onSelect: (m: MaterialRow) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={4} className="bg-neutral-950/60 px-3 py-1 text-xs uppercase tracking-wide text-neutral-500">
          {label}
        </td>
      </tr>
      {rows.map((m) => (
        <tr
          key={m.id}
          onClick={() => onSelect(m)}
          className={`${ROW_BASE} cursor-pointer ${selectedId === m.id ? "bg-sky-950/40" : ""}`}
          title="click → price history"
        >
          <td className={`${CELL} font-medium text-neutral-200`}>
            <span className="inline-flex items-center gap-2">
              <MatIcon icon={m.icon} size={6} />
              {m.label}
            </span>
          </td>
          <td className={`${CELL} whitespace-nowrap text-right tabular-nums text-neutral-300`}>{priceDiv(m.priceDiv, ex)}</td>
          <td className={`${CELL} text-right`}>
            <span className="inline-flex items-center justify-end gap-1.5">
              {m.spark7d && <Sparkline data={m.spark7d} />}
              <span
                className={`tabular-nums ${m.change7d == null ? "text-neutral-600" : m.change7d >= 0 ? "text-good" : "text-bad"}`}
              >
                {m.change7d == null ? "—" : `${m.change7d >= 0 ? "+" : ""}${m.change7d.toFixed(0)}%`}
              </span>
            </span>
          </td>
          <td className={`${CELL} text-right tabular-nums text-neutral-500`}>{ageLabel(m.ageMin)}</td>
        </tr>
      ))}
    </>
  );
}
