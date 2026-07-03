"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCROLL_BOX } from "../lib/tableStyle";
import { BellIcon, PlusIcon, XIcon } from "./ui/icons";

interface StatOpt { id: string; text: string; group: string; }
interface StatRow { id: string; text: string; min: string; }

interface Hunt {
  id: number;
  label: string;
  mode: string; // legacy DB field — no longer user-facing
  item_name: string | null;
  base_type: string | null;
  rarity: string | null;
  stats_json: string | null;
  max_amount: number | null;
  max_ccy: string | null;
  target_div: number | null;
  active: number;
  last_scan_at: string | null;
  last_hit_at: string | null;
}

interface Hit {
  id: number;
  hunt_id: number;
  item_name: string;
  base_type: string | null;
  price_amount: number;
  price_ccy: string;
  price_div: number;
  margin_pct: number | null;
  account: string | null;
  whisper: string | null;
  listing_id: string | null;
  seller_online: number | null;
  listed_at: string | null;
  seen: number;
  found_at: string;
}

interface Status {
  scannedHunts: number;
  last_scan_at: string | null;
  last_error: string | null;
  updated_at: string | null;
  liveEnabled: boolean;
  huntEnabled: boolean;
  scanSec: number;
}

/** Fire a JSON request to the hunts API with a method + body, return the response promise. */
function huntReq(method: string, url: string, body: unknown): Promise<Response> {
  return fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

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

function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(t + 0.24);
    osc.onended = () => ctx.close();
  } catch {
    /* audio unavailable — silent */
  }
}

export function HuntPanel() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [status, setStatus] = useState<Status | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Hunt | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [perHuntSound, setPerHuntSound] = useState<Record<number, boolean>>({});

  // ids of hits seen in the previous poll, to detect freshly-arrived ones
  const knownIds = useRef<Set<number>>(new Set());
  const firstHits = useRef(true);
  const [flashIds, setFlashIds] = useState<Set<number>>(new Set());

  const loadHunts = useCallback(() => {
    fetch("/api/hunts")
      .then((r) => r.json())
      .then((h) => { setHunts(h.hunts ?? []); setLiveEnabled(h.liveEnabled ?? false); })
      .catch(() => {});
  }, []);

  const loadHits = useCallback(() => {
    fetch("/api/hunts/hits")
      .then((r) => r.json())
      .then((d: { hits?: Hit[] }) => {
        const next = d.hits ?? [];
        const fresh = next.filter((h) => !knownIds.current.has(h.id));
        if (firstHits.current) firstHits.current = false;
        else if (fresh.length > 0) {
          setFlashIds(new Set(fresh.map((h) => h.id)));
          window.setTimeout(() => setFlashIds(new Set()), 2500);
          if (soundOn || fresh.some((h) => perHuntSound[h.hunt_id])) beep();
        }
        knownIds.current = new Set(next.map((h) => h.id));
        setHits(next);
      })
      .catch(() => {});
  }, [soundOn, perHuntSound]);

  const loadStatus = useCallback(() => {
    fetch("/api/hunts/status").then((r) => r.json()).then((s: Status) => setStatus(s)).catch(() => {});
  }, []);

  useEffect(() => {
    loadHunts();
    loadStatus();
    const s = setInterval(loadStatus, 5000);
    return () => clearInterval(s);
  }, [loadHunts, loadStatus]);

  useEffect(() => {
    loadHits();
    const h = setInterval(loadHits, 3000);
    return () => clearInterval(h);
  }, [loadHits]);

  const scan = () => {
    setScanning(true);
    setMsg(null);
    fetch("/api/hunts/scan", { method: "POST" })
      .then((r) => r.json())
      .then((s) => {
        setMsg(s.error ? `error: ${s.error}` : `scanned ${s.scanned} · ${s.hits} new${s.errors?.length ? ` · ${s.errors.length} errored` : ""}`);
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
      if (h.price_div > 0) {
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

      <StatusBar status={status} />

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
                const bait = med != null && hit.price_div > 0 && hit.price_div < 0.5 * med;
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

function StatusBar({ status }: { status: Status | null }) {
  if (!status) return <div className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-500">connecting…</div>;

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
    </div>
  );
}

function HuntRow({ h, editing, sound, onSound, onToggle, onEdit, onRemove }: {
  h: Hunt; editing: boolean; sound: boolean; onSound: () => void; onToggle: () => void; onEdit: () => void; onRemove: () => void;
}) {
  const crit = [h.item_name, h.base_type, h.rarity].filter(Boolean).join(" · ") || "any item";
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

function HuntForm({ initial, onSaved, onCancel }: { initial: Hunt | null; onSaved: () => void; onCancel: () => void }) {
  const ed = initial;
  const [label, setLabel] = useState(ed?.label ?? "");
  // one item concept: the text the user typed/picked + the base type a unique pick carries along
  const [item, setItem] = useState(ed?.item_name || ed?.base_type || "");
  const [pickedBase, setPickedBase] = useState(ed?.base_type ?? "");
  const [rarity, setRarity] = useState(ed?.rarity ?? "rare");
  const [maxAmount, setMaxAmount] = useState(ed?.max_amount != null ? String(ed.max_amount) : "");
  const [maxCcy, setMaxCcy] = useState(ed?.max_ccy ?? "exalted");
  const [targetDiv, setTargetDiv] = useState(ed?.target_div != null ? String(ed.target_div) : "");
  const [uniques, setUniques] = useState<{ name: string; type: string }[]>([]);
  const [baseTypes, setBaseTypes] = useState<string[]>([]);
  const [allStats, setAllStats] = useState<StatOpt[]>([]);
  // mod filters: { id, text (for display), min } — text resolved from allStats on edit
  const [statFilters, setStatFilters] = useState<StatRow[]>(() =>
    ed?.stats_json ? (JSON.parse(ed.stats_json) as { id: string; min?: number }[]).map((s) => ({ id: s.id, text: s.id, min: s.min != null ? String(s.min) : "" })) : [],
  );

  useEffect(() => {
    fetch("/api/trade/names")
      .then((r) => r.json())
      .then((d) => {
        setUniques(d.uniques ?? []);
        setBaseTypes([...new Set(((d.bases ?? []) as { types: string[] }[]).flatMap((b) => b.types))].sort());
        const stats: StatOpt[] = d.stats ?? [];
        setAllStats(stats);
        // backfill display text for filters restored from stats_json (which stores ids only)
        setStatFilters((prev) => prev.map((f) => ({ ...f, text: stats.find((s) => s.id === f.id)?.text ?? f.text })));
      })
      .catch(() => {});
  }, []);

  const addStat = (id: string, text: string) => {
    if (statFilters.some((f) => f.id === id)) return;
    setStatFilters((p) => [...p, { id, text, min: "" }]);
  };
  const setStatMin = (id: string, min: string) => setStatFilters((p) => p.map((f) => (f.id === id ? { ...f, min } : f)));
  const removeStat = (id: string) => setStatFilters((p) => p.filter((f) => f.id !== id));

  const submit = () => {
    if (!label.trim()) return;
    const stats = statFilters
      .filter((f) => f.id && f.min.trim() !== "" && Number.isFinite(Number(f.min)))
      .map((f) => ({ id: f.id, min: Number(f.min) }));
    const payload = {
      label: label.trim(),
      // unique hunts search by NAME (base carried from the pick); everything else by base type
      itemName: rarity === "unique" ? item.trim() || null : null,
      baseType: (rarity === "unique" ? pickedBase.trim() : item.trim()) || null,
      rarity: rarity || null,
      stats: stats.length ? stats : null,
      maxAmount: maxAmount.trim() === "" ? null : Number(maxAmount),
      maxCcy,
      targetDiv: targetDiv.trim() === "" ? null : Number(targetDiv),
    };
    if (ed) huntReq("PATCH", "/api/hunts", { id: ed.id, ...payload }).then(onSaved);
    else huntReq("POST", "/api/hunts", payload).then(onSaved);
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
        <Autocomplete
          label="item — unique name or base type"
          value={item}
          onChange={setItem}
          options={[
            // one box finds BOTH: picking a unique also sets rarity + carries its base along
            ...uniques.map((u) => ({ label: `${u.name} · ${u.type}`, value: u.name, meta: `u:${u.type}` })),
            ...baseTypes.map((t) => ({ label: t, value: t, meta: "b" })),
          ]}
          onPick={(o) => {
            setItem(o.value);
            if (o.meta?.startsWith("u:")) {
              setPickedBase(o.meta.slice(2));
              setRarity("unique");
            } else {
              setPickedBase("");
            }
            setLabel((l) => l.trim() || o.value);
          }}
          placeholder="Coward's Legacy / Breach Ring"
        />
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          rarity
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5">
            {["", "normal", "magic", "rare", "unique"].map((r) => <option key={r} value={r}>{r || "any"}</option>)}
          </select>
        </label>
        <Field label="label" value={label} set={setLabel} w="w-36" placeholder="auto from item" />
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          price ≤
          <span className="flex items-center gap-1">
            <input value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} inputMode="decimal" placeholder="trigger" className="w-20 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-right tabular-nums" />
            <select value={maxCcy} onChange={(e) => setMaxCcy(e.target.value)} className="rounded border border-neutral-700 bg-neutral-800 px-1.5 py-1.5">
              {[["exalted", "Ex"], ["chaos", "Ch"], ["divine", "Div"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </span>
        </label>
        <Field label="target (Div)" value={targetDiv} set={setTargetDiv} w="w-24" placeholder="resale" numeric />
      </div>

      <ModFilters all={allStats} rows={statFilters} onAdd={addStat} onMin={setStatMin} onRemove={removeStat} />

      <button onClick={submit} className="mt-2 rounded bg-good/80 px-4 py-1.5 text-sm font-semibold text-neutral-950 hover:bg-good">
        {ed ? "save changes" : "add hunt"}
      </button>
    </div>
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
