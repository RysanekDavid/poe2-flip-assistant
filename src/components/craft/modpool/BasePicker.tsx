"use client";

import { useEffect, useState } from "react";
import { MOD_POOL_RARITIES, type ModPoolQuery, type ModPoolRarity, type PoolClassView } from "../../../lib/tools/modPoolContract";
import { ItemArt } from "../../ui/ItemArt";

interface Props {
  classes: PoolClassView[];
  value: ModPoolQuery;
  onChange: (next: ModPoolQuery) => void;
}

const FIELD = "h-9 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none";

const isRarity = (v: string): v is ModPoolRarity => (MOD_POOL_RARITIES as readonly string[]).includes(v);

/** Item level as typed; only a whole number 1–100 is committed, anything else is flagged in place. */
function IlvlInput({ ilvl, onCommit }: { ilvl: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState(String(ilvl));
  useEffect(() => setDraft(String(ilvl)), [ilvl]);
  const n = Number(draft);
  const valid = Number.isInteger(n) && n >= 1 && n <= 100;
  return (
    <label className="flex flex-col gap-1 text-xs text-neutral-400">
      item level
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        value={draft}
        aria-invalid={!valid}
        title={valid ? "the tiers this item level can roll" : "a whole number from 1 to 100"}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = Number(e.target.value);
          if (Number.isInteger(next) && next >= 1 && next <= 100) onCommit(next);
        }}
        className={`${FIELD} w-20 tabular-nums ${valid ? "" : "border-red-500/70"}`}
      />
    </label>
  );
}

/** Class → base (with its art) → item level → the rarity whose currency floors apply. */
export function BasePicker({ classes, value, onChange }: Props) {
  const bases = classes.find((c) => c.itemClass === value.itemClass)?.bases ?? [];
  const base = bases.find((b) => b.name === value.base);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-xs text-neutral-400">
        class
        <select
          value={value.itemClass}
          onChange={(e) => {
            const first = classes.find((c) => c.itemClass === e.target.value)?.bases[0];
            if (first) onChange({ ...value, itemClass: e.target.value, base: first.name });
          }}
          className={FIELD}
        >
          {classes.map((c) => (
            <option key={c.itemClass} value={c.itemClass}>
              {c.itemClass}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-end gap-2">
        <ItemArt src={null} size={8} alt={value.base} />
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          base
          <select value={value.base} onChange={(e) => onChange({ ...value, base: e.target.value })} className={`${FIELD} max-w-[16rem]`}>
            {bases.map((b) => (
              <option key={b.name} value={b.name}>
                {b.ambiguous ? `${b.name} (shared name)` : b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <IlvlInput ilvl={value.ilvl} onCommit={(ilvl) => onChange({ ...value, ilvl })} />
      <label className="flex flex-col gap-1 text-xs text-neutral-400" title="which currency floors the Floors column shows">
        crafting on
        <select
          value={value.rarity}
          onChange={(e) => {
            if (isRarity(e.target.value)) onChange({ ...value, rarity: e.target.value });
          }}
          className={FIELD}
        >
          {MOD_POOL_RARITIES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      {base?.ambiguous && (
        <p className="text-xs text-amber-300" title="another released base shares this name with different tags">
          shared base name — the pool is a best guess
        </p>
      )}
    </div>
  );
}
