"use client";

import { useEffect, useState } from "react";
import { Radar, Loader2, Play, Target, Copy, Check, ExternalLink } from "lucide-react";

interface Status {
  enabled: boolean;
  live: boolean;
  intervalMin: number;
  profiles: Array<{ key: string; label: string; category: string }>;
  error?: string;
}
interface Finding {
  profile: string;
  label: string;
  listingId: string;
  itemName: string;
  baseType: string;
  keyMods: string;
  whisper: string | null;
  priceDiv: number;
  valueDiv: number;
  marginPct: number;
  samples: number;
  searchUrl: string;
}
interface Diag {
  key: string;
  label: string;
  total: number;
  fetched: number;
  candidates: number;
  verified: number;
  snipes: number;
  floorDiv: number;
  note: string;
}
interface ScanResult {
  profiles: number;
  searched: number;
  exaltPerDivine: number;
  valuations: number;
  maxValuations: number;
  findings: Finding[];
  diags: Diag[];
  errors: Array<{ profile: string; error: string }>;
  error?: string;
}

const int = (n: number): string => n.toLocaleString("en", { maximumFractionDigits: 0 });

/** Render a Divine amount sensibly: ≥1 → "12.3 div", else in exalt → "45 ex", 0 → "—". */
function price(div: number, exPerDiv: number): string {
  if (!div || div <= 0) return "—";
  if (div >= 1) return `${div.toLocaleString("en", { maximumFractionDigits: 1 })} div`;
  const ex = div * exPerDiv;
  return `${ex.toLocaleString("en", { maximumFractionDigits: ex >= 10 ? 0 : 1 })} ex`;
}

/**
 * Autonomous snipe scanner control. Runs one scan now (owner), then renders the concrete snipes
 * it found (item + value-driving mods + price/value gap + whisper + trade link) and a per-archetype
 * diagnostic of what was searched, valued, and found.
 */
export function AutoSnipeBar() {
  const [status, setStatus] = useState<Status | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/snipe/scan")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, live: false, intervalMin: 0, profiles: [], error: "failed to load" }));
  }, []);

  const scanNow = () => {
    if (scanning) return;
    setScanning(true);
    setResult(null);
    fetch("/api/snipe/scan", { method: "POST" })
      .then((r) => r.json())
      .then(setResult)
      .catch(() => setResult({ profiles: 0, searched: 0, exaltPerDivine: 0, valuations: 0, maxValuations: 0, findings: [], diags: [], errors: [], error: "scan failed" }))
      .finally(() => setScanning(false));
  };

  const copyWhisper = (id: string, whisper: string) => {
    navigator.clipboard?.writeText(whisper).then(() => {
      setCopied(id);
      window.setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    });
  };

  const ex = result?.exaltPerDivine ?? 0;

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <Radar className="h-6 w-6 text-orange-400" />
        <h2 className="text-2xl font-semibold">Auto-Snipe Scanner</h2>
        {status && (
          <span className="flex items-center gap-1.5 text-base">
            <span className={status.enabled ? "text-good" : "text-neutral-500"}>
              {status.enabled ? `auto · every ${status.intervalMin}m` : "manual (AUTOSNIPE_ENABLED off)"}
            </span>
            <span className="text-neutral-700">·</span>
            <span className={status.live ? "text-good" : "text-bad"}>POESESSID {status.live ? "✓" : "✗"}</span>
            <span className="text-neutral-700">·</span>
            <span className="text-neutral-500">{status.profiles.length} archetypes</span>
          </span>
        )}
        <button
          onClick={scanNow}
          disabled={scanning || !status?.live}
          title={status?.live ? "run one scan now" : "needs POESESSID"}
          className="ml-auto inline-flex items-center gap-2 rounded-md bg-orange-600 px-5 py-2.5 text-lg font-medium text-white transition active:scale-[0.98] disabled:opacity-40"
        >
          {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />} scan now
        </button>
      </header>

      <p className="text-base text-neutral-600">
        Each archetype&apos;s cheapest real listings are valued <span className="text-neutral-400">individually</span> — a
        relaxed comparable search on the item&apos;s own rolls. A listing far under its own value (worth ≥ 1 div) is a
        snipe → alert. Read-only; you buy manually.
      </p>

      {scanning && (
        <p className="mt-3 flex items-center gap-2 text-base text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
          scanning archetypes + valuing candidates… (rate-limited, can take a minute or two)
        </p>
      )}

      {result?.error && <p className="mt-3 text-base text-amber-500">{result.error}</p>}

      {result && !result.error && (
        <div className="mt-3 space-y-4">
          <p className="text-base text-neutral-400">
            searched {result.searched}/{result.profiles} · valued {result.valuations}/{result.maxValuations} ·{" "}
            <span className={result.findings.length ? "font-semibold text-emerald-400" : "text-neutral-500"}>
              {result.findings.length} snipe(s)
            </span>
            {result.errors.length > 0 && <span className="text-amber-500"> · {result.errors.length} error(s)</span>}
          </p>

          {/* snipes — concrete items */}
          {result.findings.length > 0 && (
            <div className="overflow-hidden rounded-md border border-emerald-900/40">
              <table className="w-full text-base">
                <thead className="bg-emerald-950/30 text-emerald-300/80">
                  <tr className="text-left">
                    <th className="px-4 py-3 font-medium">item</th>
                    <th className="px-4 py-3 text-right font-medium">price</th>
                    <th className="px-4 py-3 text-right font-medium">value</th>
                    <th className="px-4 py-3 text-right font-medium">under</th>
                    <th className="px-4 py-3 text-right font-medium">comps</th>
                    <th className="px-4 py-3 font-medium">act</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {result.findings.map((f) => (
                    <tr key={f.listingId} className="align-top hover:bg-neutral-800/30">
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-200">
                          <Target className="mr-1 inline h-3 w-3 text-emerald-400" />
                          {f.itemName || "rare"}
                        </div>
                        <div className="text-sm text-neutral-500">
                          {f.baseType}
                          {f.keyMods ? ` — ${f.keyMods}` : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-300">{price(f.priceDiv, ex)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-300">{price(f.valueDiv, ex)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-emerald-400">
                        {Math.round(f.marginPct)}%
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{f.samples}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {f.whisper && (
                            <button
                              onClick={() => copyWhisper(f.listingId, f.whisper!)}
                              title="copy in-game whisper"
                              className="inline-flex items-center gap-0.5 rounded border border-neutral-700 px-1 py-0.5 text-sm text-neutral-400 hover:border-orange-500 hover:text-orange-300"
                            >
                              {copied === f.listingId ? <Check className="h-3 w-3 text-good" /> : <Copy className="h-3 w-3" />}
                              {copied === f.listingId ? "ok" : "wsp"}
                            </button>
                          )}
                          {f.searchUrl && (
                            <a
                              href={f.searchUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="open the comparable search on the trade site"
                              className="inline-flex items-center text-sky-400 hover:text-sky-300"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* per-archetype diagnostics */}
          {result.diags.length > 0 && (
            <div>
              <p className="mb-1 text-sm uppercase tracking-wide text-neutral-600">archetype scan</p>
              <div className="overflow-hidden rounded-md border border-neutral-800">
                <table className="w-full text-base">
                  <thead className="bg-neutral-950/60 text-neutral-500">
                    <tr className="text-left">
                      <th className="px-4 py-3 font-medium">archetype</th>
                      <th className="px-4 py-3 text-right font-medium">listed</th>
                      <th className="px-4 py-3 text-right font-medium">cand</th>
                      <th className="px-4 py-3 text-right font-medium">valued</th>
                      <th className="px-4 py-3 text-right font-medium">snipes</th>
                      <th className="px-4 py-3 text-right font-medium">floor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 text-neutral-400">
                    {result.diags.map((d) => (
                      <tr key={d.key} className="hover:bg-neutral-800/20" title={d.note || undefined}>
                        <td className="px-4 py-3 text-neutral-300">{d.label}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${d.total >= 10000 ? "text-amber-500" : ""}`}>
                          {int(d.total)}
                          {d.total >= 10000 ? "+" : ""}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{d.candidates}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{d.verified}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${d.snipes ? "font-semibold text-emerald-400" : ""}`}>
                          {d.snipes}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-neutral-500">{price(d.floorDiv, ex)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                <span className="text-neutral-400">cand</span> = cheap real listings put forward ·{" "}
                <span className="text-neutral-400">valued</span> = per-item comparable searches spent ·{" "}
                <span className="text-neutral-400">floor</span> = archetype reference price (diagnostic only).
              </p>
            </div>
          )}

          {result.errors.length > 0 && (
            <ul className="space-y-0.5">
              {result.errors.map((e, i) => (
                <li key={i} className="text-sm text-amber-600/80">
                  {e.profile}: {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
