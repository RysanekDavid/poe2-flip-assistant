"use client";

import { useState } from "react";

export interface RollStat {
  id: string;
  text: string;
  count: number;
  min: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
}
interface RollResp {
  total: number;
  sampled: number;
  rolls: RollStat[];
}

interface RollGuideProps {
  baseType: string;
  /** the chosen mods, in order — id+text feed the scan, min shows the current target */
  mods: Array<{ id: string; text: string; min?: number }>;
  /** snap a chosen mod's min to a suggested roll */
  onSetMin: (id: string, value: number) => void;
}

const modShort = (text: string) => text.replace(/^[+#]?\s*/, "").replace(/^to /, "");
const num = (n: number | null) => (n == null ? "—" : n >= 100 ? Math.round(n) : Math.round(n * 10) / 10);

/** Where `v` sits on the min..max track, as 0..100%. */
const posPct = (v: number, lo: number, hi: number) => (hi <= lo ? 50 : ((v - lo) / (hi - lo)) * 100);

/**
 * Interactive top-roll guide. Scans the priciest rares of this base, reads the actual
 * rolled value of each chosen mod, and shows the distribution: where a god-roll ceiling
 * is (max), what counts as top-tier (p75), the middle (median). One click snaps your
 * target min to p75 ("top-tier") or max ("god-roll") so the sell search filters to it.
 */
export function RollGuide({ baseType, mods, onSetMin }: RollGuideProps) {
  const [resp, setResp] = useState<RollResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scan = async () => {
    if (!baseType || mods.length === 0) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/craft/rolls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: baseType, stats: mods.map((m) => ({ id: m.id, text: m.text })) }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setResp(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setResp(null);
    } finally {
      setLoading(false);
    }
  };

  const byId = new Map((resp?.rolls ?? []).map((r) => [r.id, r]));

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <button
          onClick={scan}
          disabled={!baseType || mods.length === 0 || loading}
          className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-amber-500 disabled:opacity-40"
        >
          {loading ? "reading top rolls…" : "show ideal rolls (top-roll guide)"}
        </button>
        <span className="text-xs text-neutral-500">
          reads real rolls off the priciest {baseType || "bases"} — tells you what a top-tier item looks like
        </span>
        {resp && <span className="text-xs text-neutral-600">sampled {resp.sampled} of {resp.total}</span>}
        {err && <span className="text-xs text-bad">{err}</span>}
      </div>

      {resp && (
        <ul className="space-y-2">
          {mods.map((m) => {
            const r = byId.get(m.id);
            const lo = r?.min ?? 0;
            const hi = r?.max ?? 0;
            const has = r != null && r.count > 0 && hi > 0;
            return (
              <li key={m.id} className="rounded border border-neutral-800 bg-neutral-800/30 p-2">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-200">{modShort(m.text)}</span>
                  {has ? (
                    <span className="text-xs text-neutral-500">
                      seen on {r!.count} — low {num(r!.min)} · mid {num(r!.median)} ·{" "}
                      <span className="text-amber-400">top {num(r!.p75)}</span> · ceil{" "}
                      <span className="text-good">{num(r!.max)}</span>
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-600">not seen on the high end (rare/low-value mod)</span>
                  )}
                </div>

                {has && (
                  <>
                    {/* distribution track: low …median…p75… ceiling, with your current min marked */}
                    <div className="relative mt-2 h-2 rounded-full bg-neutral-700">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-neutral-600 via-amber-600/60 to-good/70"
                        style={{ width: "100%" }}
                      />
                      {r!.median != null && (
                        <Tick pct={posPct(r!.median, lo, hi)} cls="bg-neutral-300" title={`mid ${num(r!.median)}`} />
                      )}
                      {r!.p75 != null && <Tick pct={posPct(r!.p75, lo, hi)} cls="bg-amber-400" title={`top ${num(r!.p75)}`} />}
                      {m.min != null && (
                        <Tick pct={posPct(m.min, lo, hi)} cls="bg-sky-400 !w-1" title={`your min ${m.min}`} />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-xs text-neutral-500">target:</span>
                      {r!.p75 != null && (
                        <button
                          onClick={() => onSetMin(m.id, Math.round(r!.p75!))}
                          className="rounded bg-amber-600/20 px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-600/40"
                        >
                          top-tier ≥{Math.round(r!.p75)}
                        </button>
                      )}
                      {r!.max != null && (
                        <button
                          onClick={() => onSetMin(m.id, Math.round(r!.max!))}
                          className="rounded bg-good/20 px-2 py-0.5 text-xs text-good hover:bg-good/40"
                        >
                          god-roll ≥{Math.round(r!.max)}
                        </button>
                      )}
                      {m.min != null && <span className="text-xs text-sky-400">now ≥{m.min}</span>}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Tick({ pct, cls, title }: { pct: number; cls: string; title: string }) {
  return (
    <span
      title={title}
      className={`absolute top-1/2 h-3 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded ${cls}`}
      style={{ left: `${Math.max(0, Math.min(100, pct))}%` }}
    />
  );
}
