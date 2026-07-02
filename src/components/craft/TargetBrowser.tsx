"use client";

import { useEffect, useMemo, useState } from "react";
import type { CraftTargetsPayload, WeightedTarget } from "../../core/craftMeta";
import type { ModTier } from "../../core/craftTargets";

/**
 * Browsable craft-target reference (purpose 3 of the Craft Helper): the curated archetype
 * library ranked by scraped meta weights. "Load" hands a target to the planner, which turns
 * it into a mod checklist + next-mod suggestions.
 */

const TIER_CLS: Record<ModTier, string> = {
  core: "text-emerald-400",
  ideal: "text-sky-400",
  luxury: "text-amber-400",
};

const fmtPct = (n: number) => `${n >= 10 ? Math.round(n) : n.toFixed(1)}%`;

export function TargetBrowser({ activeKey, onLoad }: { activeKey: string | null; onLoad: (t: WeightedTarget) => void }) {
  const [data, setData] = useState<CraftTargetsPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<string>("");

  useEffect(() => {
    fetch("/api/craft/targets")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, []);

  const slots = useMemo(() => (data ? [...new Set(data.targets.map((t) => t.slot))] : []), [data]);
  const shown = useMemo(
    () => (data ? data.targets.filter((t) => !slotFilter || t.slot === slotFilter) : []),
    [data, slotFilter],
  );

  if (err) return <p className="text-sm text-bad">craft targets error: {err}</p>;
  if (!data) return <p className="text-sm text-neutral-500">loading craft targets…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          onClick={() => setSlotFilter("")}
          className={`rounded px-2 py-1 ${slotFilter === "" ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
        >
          all
        </button>
        {slots.map((s) => (
          <button
            key={s}
            onClick={() => setSlotFilter(s === slotFilter ? "" : s)}
            className={`rounded px-2 py-1 ${slotFilter === s ? "bg-sky-600 text-white" : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"}`}
          >
            {s}
          </button>
        ))}
        <span className="ml-auto text-neutral-600">
          meta: {data.totalCharacters.toLocaleString()} chars, scraped {data.scrapedAt.slice(0, 10)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <TargetCard key={t.key} target={t} active={t.key === activeKey} onLoad={() => onLoad(t)} />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
        <span className="text-neutral-600">meta ascendancies:</span>
        {data.ascendancies.slice(0, 8).map((a) => (
          <span key={a.name}>
            {a.name} <span className="text-neutral-600">{fmtPct(a.pct)}</span>
          </span>
        ))}
      </div>
      {data.metaUniques.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
          <span className="text-neutral-600">most-worn uniques (jewel/charm/flask — market context):</span>
          {data.metaUniques.map((u) => (
            <span key={u.name}>
              {u.name}
              {u.baseType && <span className="text-neutral-600"> ({u.baseType})</span>}{" "}
              <span className="text-neutral-600">{u.pct}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function TargetCard({ target: t, active, onLoad }: { target: WeightedTarget; active: boolean; onLoad: () => void }) {
  const w = t.weight;
  const weightBits = [
    w.weaponPct != null ? `${fmtPct(w.weaponPct)} of builds wield` : null,
    w.slotUsagePct != null ? `${fmtPct(w.slotUsagePct)} wear rare` : null,
    w.ascendancyPct < 100 ? `${fmtPct(w.ascendancyPct)} asc share` : null,
  ].filter(Boolean);

  return (
    <div
      className={`flex flex-col gap-1.5 rounded-lg border p-3 ${
        active ? "border-sky-600 bg-sky-950/20" : "border-neutral-800 bg-neutral-800/30"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="flex-1 text-sm font-semibold text-neutral-100">{t.label}</span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-500">{t.slot}</span>
      </div>
      <div className="text-xs text-neutral-500">{weightBits.join(" · ") || "universal slot"}</div>
      <ul className="space-y-0.5 text-xs">
        {t.resolvedMods.map((m) => (
          <li key={m.text} className={m.id ? TIER_CLS[m.tier] : "text-bad line-through"} title={m.note}>
            {m.text.replace(/^#\s*/, "")}
            {m.min != null && <span className="text-neutral-500"> ≥{m.min}</span>}
            <span className="ml-1 text-neutral-600">{m.tier}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <span className="flex-1 truncate text-xs text-neutral-600" title={t.ascendancies.join(", ")}>
          {t.ascendancies.join(", ")} · ilvl {t.ilvlMin}+
        </span>
        <button
          onClick={onLoad}
          className="rounded bg-sky-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-sky-500"
        >
          load →
        </button>
      </div>
    </div>
  );
}
