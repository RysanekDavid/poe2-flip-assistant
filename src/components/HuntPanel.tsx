"use client";

import { useMemo, useState } from "react";
import { SCROLL_BOX } from "../lib/tableStyle";
import { BellIcon, PlusIcon, XIcon } from "./ui/icons";
import { huntReq, type Hunt } from "./huntApi";
import { HuntForm } from "./HuntForm";
import { useHuntFeed, type Hit, type HuntStatus } from "./useHuntFeed";

function ageOf(iso: string | null): string {
  if (!iso) return "—";
  // sqlite CURRENT_TIMESTAMP is UTC without timezone marker — normalize so JS doesn't read it as local
  const norm = /^\d{4}-\d{2}-\d{2} /.test(iso) ? iso.replace(" ", "T") + "Z" : iso;
  const ms = Date.now() - new Date(norm).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function HuntPanel() {
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Hunt | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [perHuntSound, setPerHuntSound] = useState<Record<number, boolean>>({});
  const { hunts, liveEnabled, hits, status, flashIds, feedError, loadHunts, loadHits } = useHuntFeed(soundOn, perHuntSound);

  const scan = () => {
    setScanning(true);
    setMsg(null);
    fetch("/api/hunts/scan", { method: "POST" })
      .then((r) => r.json())
      .then((s) => {
        // the poller runs the scan (single trade2 limiter owner); hits + per-hunt errors show up on the next refresh
        setMsg(s.error ? `error: ${s.error}` : "scan queued — results appear on the next refresh");
        loadHits();
        loadHunts();
      })
      .catch((e) => setMsg(String(e)))
      .finally(() => setScanning(false));
  };

  const toggleActive = (h: Hunt) => huntReq("PATCH", "/api/hunts", { id: h.id, active: !h.active }).then(loadHunts);
  const remove = (h: Hunt) => huntReq("DELETE", "/api/hunts", { id: h.id }).then(loadHunts);

  // median price per hunt → flag listings far below it as price-fix bait
  const medianByHunt = useMemo(() => {
    const byHunt = new Map<number, number[]>();
    for (const h of hits) {
      if (h.price_div != null && h.price_div > 0) {
        const arr = byHunt.get(h.hunt_id) ?? [];
        arr.push(h.price_div);
        byHunt.set(h.hunt_id, arr);
      }
    }
    const med = new Map<number, number>();
    for (const [id, xs] of byHunt) {
      const s = [...xs].sort((a, b) => a - b);
      med.set(id, s[Math.floor(s.length / 2)]!);
    }
    return med;
  }, [hits]);

  const unread = hits.filter((h) => !h.seen).length;
  const markAllSeen = () => {
    const ids = hits.filter((h) => !h.seen).map((h) => h.id);
    if (ids.length === 0) return;
    huntReq("PATCH", "/api/hunts/hits", { ids }).then(loadHits);
  };

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Hunt — live snipe finder</h2>
        <span className="text-xs text-neutral-500">read-only · you buy manually, never auto</span>
      </header>

      <StatusBar status={status} feedError={feedError} />

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[320px_1fr]">
        {/* LEFT — saved searches */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-300">saved searches</h3>
            <button
              onClick={() => { setEditing(null); setShowForm((v) => !v); }}
              className="inline-flex items-center gap-1 rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
            >
              {showForm && !editing ? <XIcon className="h-3.5 w-3.5" /> : <PlusIcon />}
              {showForm && !editing ? "close" : "new"}
            </button>
          </div>

          {showForm && (
            <HuntForm
              key={editing?.id ?? "new"}
              initial={editing}
              onSaved={() => { loadHunts(); setShowForm(false); setEditing(null); }}
              onCancel={() => { setShowForm(false); setEditing(null); }}
            />
          )}

          {!liveEnabled && (
            <p className="rounded bg-warn/10 px-2 py-1.5 text-xs text-warn">
              live search disabled — connect your <code>POESESSID</code> in <b>Settings</b>. Stored encrypted,
              read-only, never used to buy.
            </p>
          )}

          <ul className="space-y-1.5">
            {hunts.map((h) => (
              <HuntRow
                key={h.id}
                h={h}
                editing={editing?.id === h.id}
                sound={!!perHuntSound[h.id]}
                onSound={() => setPerHuntSound((p) => ({ ...p, [h.id]: !p[h.id] }))}
                onToggle={() => toggleActive(h)}
                onEdit={() => { setEditing(h); setShowForm(true); }}
                onRemove={() => remove(h)}
              />
            ))}
            {hunts.length === 0 && <li className="py-3 text-center text-xs text-neutral-500">no searches yet — “new” above</li>}
          </ul>
          {hunts.some((h) => h.active) && (
            <p className="text-xs text-neutral-600" title="GGG allows ~600 trade searches per 6h per IP, shared by hunts, auto-snipe and craft margins">
              each active hunt costs ~40s of the shared search budget — {hunts.filter((h) => h.active).length} active ≈ one lap every ~{hunts.filter((h) => h.active).length * 40}s
            </p>
          )}

          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={scan}
              disabled={scanning || !liveEnabled || hunts.every((h) => !h.active)}
              className="rounded bg-sky-600/80 px-3 py-1.5 text-xs font-semibold hover:bg-sky-600 disabled:opacity-40"
            >
              {scanning ? "scanning…" : "run saved searches"}
            </button>
            {msg && <span className="truncate text-xs text-neutral-400">{msg}</span>}
          </div>
        </div>

        {/* RIGHT — live feed */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-300">
              live feed
              {unread > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/20 px-1.5 py-0.5 text-xs text-sky-300">
                  <BellIcon className="h-3.5 w-3.5" /> {unread}
                </span>
              )}
            </h3>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-neutral-400">
              <input type="checkbox" checked={soundOn} onChange={(e) => setSoundOn(e.target.checked)} />
              sound on new
            </label>
            <button onClick={markAllSeen} disabled={unread === 0} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500 disabled:opacity-40">
              mark all seen
            </button>
          </div>

          <div className={SCROLL_BOX}>
            <ul className="divide-y divide-neutral-800/60 text-sm">
              {hits.map((hit) => {
                const med = medianByHunt.get(hit.hunt_id);
                const bait = med != null && hit.price_div != null && hit.price_div > 0 && hit.price_div < 0.5 * med;
                return <HitRow key={hit.id} hit={hit} flash={flashIds.has(hit.id)} bait={bait} median={med ?? null} />;
              })}
              {hits.length === 0 && (
                <li className="py-8 text-center text-neutral-500">
                  {liveEnabled ? "waiting for hits — make sure a search is active" : "live search off — set POESESSID"}
                </li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusBar({ status, feedError }: { status: HuntStatus | null; feedError: string | null }) {
  const feed = feedError && <span className="truncate text-bad" title={feedError}>⚠ feed refresh failed — {feedError}</span>;
  if (!status) return <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">{feed || "connecting…"}</div>;

  const dim = "bg-neutral-700/60 text-neutral-300";
  let chip = { txt: "waiting for first scan", cls: dim };
  if (!status.liveEnabled) chip = { txt: "off — set POESESSID", cls: dim };
  else if (!status.huntEnabled) chip = { txt: "paused — HUNT_ENABLED=false", cls: "bg-warn/15 text-warn" };
  else if (status.last_scan_at) chip = { txt: `scanning every ${status.scanSec}s ●`, cls: "bg-good/15 text-good" };

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs">
      <span className={`rounded px-1.5 py-0.5 font-medium ${chip.cls}`}>{chip.txt}</span>
      <span className="text-neutral-400">
        last scan <span className="font-semibold text-neutral-200">{ageOf(status.last_scan_at)}</span>
      </span>
      <span className="text-neutral-400">
        searches <span className="font-semibold tabular-nums text-neutral-200">{status.scannedHunts}</span>
      </span>
      {status.last_error && <span className="truncate text-bad" title={status.last_error}>⚠ {status.last_error}</span>}
      {feed}
    </div>
  );
}

function HuntRow({ h, editing, sound, onSound, onToggle, onEdit, onRemove }: {
  h: Hunt; editing: boolean; sound: boolean; onSound: () => void; onToggle: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const crit =
    [h.item_name, h.base_type, h.category, h.ilvl_min ? `ilvl ${h.ilvl_min}+` : null, h.rarity].filter(Boolean).join(" · ") || "any item";
  return (
    <li className={`rounded border bg-neutral-800/40 px-2 py-1.5 text-sm ${editing ? "border-sky-500/60" : "border-neutral-800"}`}>
      <div className="flex items-center gap-2">
        <span className="truncate font-medium" title={h.label}>{h.label}</span>
        <button onClick={onSound} title={sound ? "sound on" : "sound off"} className={`ml-auto text-sm ${sound ? "text-good" : "text-neutral-600 hover:text-neutral-400"}`}>
          {sound ? "🔊" : "🔈"}
        </button>
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        {crit}
        {h.max_amount != null && ` · ≤ ${h.max_amount} ${h.max_ccy}`}
      </div>
      <div className="mt-1 flex items-center gap-3 text-xs">
        <button onClick={onToggle} className={h.active ? "text-good" : "text-neutral-600 hover:text-neutral-400"}>
          {h.active ? "● active" : "○ paused"}
        </button>
        <span className="text-neutral-600">hit {ageOf(h.last_hit_at)}</span>
        {h.last_error && <span className="max-w-[40%] truncate text-bad" title={h.last_error}>⚠ {h.last_error}</span>}
        <button onClick={onEdit} className={`ml-auto ${editing ? "text-sky-300" : "text-neutral-500 hover:text-neutral-300"}`}>edit</button>
        <button onClick={onRemove} className="text-neutral-600 hover:text-bad">remove</button>
      </div>
    </li>
  );
}

function HitRow({ hit, flash, bait, median }: { hit: Hit; flash: boolean; bait: boolean; median: number | null }) {
  const online = hit.seller_online === 1;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 px-3 py-2 transition-colors ${
        flash ? "bg-sky-500/15" : online ? "" : "opacity-55"
      } ${bait ? "border-l-amber-500/70" : hit.seen ? "border-l-transparent" : "border-l-sky-500/70"}`}
    >
      <span className="whitespace-nowrap font-semibold tabular-nums text-warn">{hit.price_amount} {hit.price_ccy}</span>
      {bait && (
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-semibold text-amber-300" title={median != null ? `median ~${median.toFixed(1)} Div — likely price-fix bait / AFK` : "far below market"}>
          ⚠ bait?
        </span>
      )}
      <span className="min-w-0">
        <span className="font-medium">{hit.item_name}</span>
        {hit.base_type && <span className="ml-1.5 text-xs text-neutral-500">{hit.base_type}</span>}
      </span>
      <span className={`text-xs ${online ? "text-good" : "text-neutral-600"}`} title={online ? "seller online" : "offline / unknown"}>
        {online ? "●" : "○"}
      </span>
      {hit.margin_pct != null && (
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums ${hit.margin_pct >= 0 ? "bg-good/10 text-good" : "bg-bad/10 text-bad"}`}>
          {hit.margin_pct >= 0 ? "+" : ""}{hit.margin_pct.toFixed(0)}%
        </span>
      )}
      <span className="text-xs text-neutral-600">{ageOf(hit.listed_at ?? hit.found_at)}</span>
      {hit.account && <span className="hidden truncate text-xs text-neutral-600 sm:inline">{hit.account}</span>}
      {hit.whisper && (
        <button
          onClick={() => navigator.clipboard?.writeText(hit.whisper ?? "")}
          className="ml-auto rounded border border-neutral-700 px-2 py-0.5 text-xs hover:border-neutral-500"
          title="copy in-game whisper"
        >
          copy whisper
        </button>
      )}
    </li>
  );
}
