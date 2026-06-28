import type { PricedItem } from "../api/types";

/**
 * "What to farm now" advisor. poe.ninja's exchange categories ARE the in-game activities
 * (Abyss, Breach=Catalysts, Ritual=Omens, Expedition, Essences, Soul Cores…), so we don't
 * need a drop-table guess — we rank each category by how hot its tradeable basket is right
 * now: value-weighted 7d momentum × liquidity. A pumping, liquid, valuable basket = worth
 * grinding the activity that drops it.
 *
 * FARM_LABELS maps a ninja category → the human activity + a how-to hint. Edit freely as the
 * meta shifts; an unmapped category falls back to its raw name.
 */
const FARM_LABELS: Record<string, { label: string; hint: string }> = {
  Abyss: { label: "Abyss", hint: "spawn & re-run Abyssal bosses (Abyssal Bones)" },
  Breach: { label: "Breach", hint: "open Breaches, bank Catalysts" },
  Expedition: { label: "Expedition", hint: "blow up Expedition logbooks / remnants" },
  Ritual: { label: "Ritual", hint: "run Rituals, reroll for Omens" },
  Essences: { label: "Essence", hint: "hunt Essence monsters" },
  Runes: { label: "Runes", hint: "rune drops / corruption" },
  SoulCores: { label: "Soul Cores", hint: "farm pinnacle/boss Soul Cores" },
  Fragments: { label: "Fragments", hint: "boss fragments (Kulemak etc.)" },
  UncutGems: { label: "Uncut Gems", hint: "gem drops from maps/bosses" },
  Idols: { label: "Idols", hint: "Idol drops" },
  Verisium: { label: "Verisium", hint: "Verisium sources" },
  Currency: { label: "Currency", hint: "general currency drops (the trade medium)" },
};

export interface FarmDriver {
  item: string;
  change7d: number;
  valueDiv: number;
  volume: number;
}
export interface FarmRank {
  category: string;
  label: string;
  hint: string;
  signal: "HOT" | "WARM" | "COLD";
  wAvgChange7d: number; // value×liquidity-weighted 7d % change of the basket
  basketValueDiv: number; // sum of item value (Div) — how much wealth this basket holds
  itemCount: number;
  drivers: FarmDriver[]; // top movers driving the heat
}

const MIN_VOLUME = 50; // ignore illiquid noise — can't actually sell it

/** Rank every farmable category by current heat. Descending by score. */
export function rankFarms(items: PricedItem[]): FarmRank[] {
  const byCat = new Map<string, PricedItem[]>();
  for (const it of items) {
    if (it.baseValue <= 0 || it.volume < MIN_VOLUME || it.change7d == null) continue;
    const arr = byCat.get(it.category) ?? [];
    arr.push(it);
    byCat.set(it.category, arr);
  }

  const ranks: FarmRank[] = [];
  for (const [category, basket] of byCat) {
    const weight = (it: PricedItem) => it.baseValue * Math.log10(it.volume + 10);
    const totalW = basket.reduce((a, it) => a + weight(it), 0);
    if (totalW <= 0) continue;
    const wAvgChange7d = basket.reduce((a, it) => a + (it.change7d ?? 0) * weight(it), 0) / totalW;
    const basketValueDiv = basket.reduce((a, it) => a + it.baseValue, 0);

    const drivers = [...basket]
      .sort((a, b) => Math.max(b.change7d ?? 0, 0) * b.baseValue - Math.max(a.change7d ?? 0, 0) * a.baseValue)
      .slice(0, 3)
      .map((it) => ({ item: it.itemName, change7d: it.change7d ?? 0, valueDiv: it.baseValue, volume: it.volume }));

    const signal: FarmRank["signal"] = wAvgChange7d >= 30 ? "HOT" : wAvgChange7d >= 10 ? "WARM" : "COLD";
    const meta = FARM_LABELS[category] ?? { label: category, hint: "" };
    ranks.push({ category, label: meta.label, hint: meta.hint, signal, wAvgChange7d, basketValueDiv, itemCount: basket.length, drivers });
  }

  // hot first; within a tier, bigger basket value wins (more total wealth in motion)
  return ranks.sort((a, b) => b.wAvgChange7d - a.wAvgChange7d || b.basketValueDiv - a.basketValueDiv);
}
