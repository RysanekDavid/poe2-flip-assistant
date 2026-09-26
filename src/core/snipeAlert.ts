import { fmtDivOrEx } from "../lib/format";

/**
 * SNIPE alert text, shared by both engines. Prices go through fmtDivOrEx so a sub-Divine ask
 * reads "45 ex" — the old `toFixed(0)` rendered it as "0 vs ~2 Div", which looked like a free item.
 */
export function snipeAlertMessage(p: {
  marginPct: number;
  askDiv: number;
  valueDiv: number;
  samples: number;
  exPerDiv: number;
  basis: "samples" | "comps";
  keyMods?: string;
}): string {
  const ask = fmtDivOrEx(p.askDiv, p.exPerDiv);
  const value = fmtDivOrEx(p.valueDiv, p.exPerDiv);
  const mods = p.keyMods ? ` · ${p.keyMods}` : "";
  return `${Math.round(p.marginPct)}% under — ${ask} vs ~${value} (${p.samples} ${p.basis})${mods}`;
}
