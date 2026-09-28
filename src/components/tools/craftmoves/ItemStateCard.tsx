"use client";

import type { AffixView, ItemStateView } from "../../../lib/tools/craftMovesContract";

const RARITY_TONE: Record<string, string> = {
  Normal: "text-neutral-200",
  Magic: "text-[#8888ff]",
  Rare: "text-[#ffff77]",
  Unique: "text-[#af6025]",
};

const KIND_TONE: Record<AffixView["kind"], string> = {
  explicit: "text-[#8888ff]",
  crafted: "text-[#b4b4ff]",
  fractured: "text-[#a29162]",
  desecrated: "text-[#c9a0ff]",
};

/** Filled / open / unknown slot pips for one side. `open` null = cannot prove how many are open. */
function Pips({ label, used, cap, open }: { label: string; used: number; cap: number | null; open: number | null }) {
  const total = cap ?? used;
  const pips = Array.from({ length: Math.max(total, used) }, (_, i) => (i < used ? "used" : open == null ? "unknown" : "open"));
  const title = open == null ? `${used} ${label} read — open slots unknown` : `${used}/${total} ${label}, ${open} open`;
  return (
    <span className="inline-flex items-center gap-1" title={title}>
      <span className="w-4 text-[10px] uppercase text-neutral-500">{label[0]}</span>
      {pips.map((p, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rotate-45 border ${
            p === "used" ? "border-amber-300 bg-amber-400/80" : p === "open" ? "border-neutral-500 bg-transparent" : "border-amber-600 bg-amber-900/40"
          }`}
        />
      ))}
      {cap == null && <span className="text-[10px] text-neutral-500">?</span>}
    </span>
  );
}

function AffixLine({ a }: { a: AffixView }) {
  const unknown = a.modId == null && !a.unrevealed;
  const tier = a.tier ? `tier ${a.tier.rank}/${a.tier.of}` : "tier unknown";
  const title = [a.family ?? "family unknown", tier, a.level != null ? `modifier level ${a.level}` : null, a.kind, a.note]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className="flex items-baseline gap-2" title={title}>
      <span className="w-4 shrink-0 text-center text-[10px] uppercase text-neutral-500">{a.side ? a.side[0] : "?"}</span>
      <span className={unknown ? "text-amber-400" : KIND_TONE[a.kind]}>{a.lines.join(" / ")}</span>
      {a.tier && <span className="text-[10px] tabular-nums text-neutral-600">T{a.tier.rank}</span>}
    </li>
  );
}

function Tags({ s }: { s: ItemStateView }) {
  const tags: Array<[string, string, string]> = [];
  if (s.corrupted) tags.push(["corrupted", "text-red-400 border-red-900", "no currency can modify it"]);
  if (s.mirrored) tags.push(["mirrored", "text-sky-300 border-sky-900", "a mirrored copy cannot be modified"]);
  if (s.slots.fractured > 0) tags.push(["fractured", "text-[#a29162] border-[#4d4430]", "one fracture per item, ever"]);
  if (s.slots.crafted > 0) tags.push([`crafted ${s.slots.crafted}/1`, "text-[#b4b4ff] border-indigo-900", "one crafted mod per item"]);
  if (s.slots.desecrated > 0) tags.push([`desecrated ${s.slots.desecrated}/1`, "text-[#c9a0ff] border-purple-900", "one desecrated mod per item"]);
  if (s.slots.unrevealed > 0) tags.push(["unrevealed", "text-[#c9a0ff] border-purple-900", "reveal at the Well of Souls"]);
  if (s.timeLost) tags.push(["Time-Lost", "text-neutral-300 border-neutral-700", "Ancient liquids only"]);
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map(([label, cls, hint]) => (
        <span key={label} title={hint} className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}

/** What the pasted item IS: base, slots (proven open vs unknown), affixes by side, unmatched lines. */
export function ItemStateCard({ s }: { s: ItemStateView }) {
  const cap = s.capacity;
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className={`font-semibold ${RARITY_TONE[s.rarity] ?? "text-neutral-200"}`} title={s.itemClass ?? "unknown class"}>
          {s.baseType ?? "unknown base"}
        </h3>
        <span className="text-xs tabular-nums text-neutral-500" title="item level gates the tiers it can roll">
          ilvl {s.ilvl ?? "?"}{s.quality != null ? ` · q${s.quality}%` : ""}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {cap && cap.p != null && <Pips label="prefix" used={s.prefixes} cap={cap.p} open={s.openPrefixes} />}
        {cap && cap.s != null && <Pips label="suffix" used={s.suffixes} cap={cap.s} open={s.openSuffixes} />}
        {cap && cap.p == null && <Pips label="affixes" used={s.affixes.length} cap={cap.total} open={s.openTotal} />}
        <Tags s={s} />
      </div>
      <ul className="mt-2 space-y-0.5 text-sm">
        {s.affixes.map((a, i) => <AffixLine key={i} a={a} />)}
        {s.unmatched.map((l) => (
          <li key={l} className="flex items-baseline gap-2 text-amber-400" title="not in the catalog for this base — open slots cannot be proven">
            <span className="w-4 shrink-0 text-center text-[10px]">?</span>
            {l}
          </li>
        ))}
      </ul>
      {s.flags.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-amber-500/80">
          {s.flags.map((f) => <li key={f.code + f.message}>{f.message}</li>)}
        </ul>
      )}
    </section>
  );
}
