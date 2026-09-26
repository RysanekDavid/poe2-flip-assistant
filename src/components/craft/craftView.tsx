"use client";

// Type-only imports are erased at build → safe to pull the canonical report shapes into client
// components instead of hand-duplicating them (which drifts from the engine).
import type { CraftDomain, CraftGuide, RecipeMarginReport } from "../../core/craftRecipes";
import type { RankGate } from "../../core/craftValuation";

/** The margins-route response row: static recipe meta + the latest live report + EV history. */
export interface RecipeView {
  key: string;
  label: string;
  domain: CraftDomain;
  heroIcon: string | null;
  source: string;
  guide: CraftGuide;
  hitRate: number;
  baseSpec: { label: string; note: string };
  resultSpec: { label: string; note: string };
  materialSpecs: Array<{ id: string; label: string; group: string; qty: number; note: string | null }>;
  report: RecipeMarginReport | null;
  gate: RankGate; // may this report drive a top pick / alert (server-computed)
  scannedAt: string | null;
  lastError: string | null; // transient failure of a newer scan; the report is the last good one
  lastErrorAt: string | null;
  evHistory: number[];
}

/** Per-material display info (live price label + item art) resolved by the parent panel. */
export interface MatDisplay {
  price: string | null;
  icon: string | null;
}
export type MatInfoFn = (id: string) => MatDisplay;

// Static class map — Tailwind's JIT can't see dynamically-built class names.
const ICON_SIZE = { 4: "h-4 w-4", 5: "h-5 w-5", 6: "h-6 w-6" } as const;

/** Small item-art icon; renders nothing when the art isn't known yet. */
export function MatIcon({ icon, size = 5 }: { icon: string | null; size?: keyof typeof ICON_SIZE }) {
  if (!icon) return null;
  // eslint-disable-next-line @next/next/no-img-element -- poecdn art, fixed tiny size, no optimization needed
  return <img src={icon} alt="" className={`inline-block ${ICON_SIZE[size]} shrink-0 object-contain`} />;
}

/** "12.3 div" primary, exalt fallback under 1 Div, "—" when absent. */
export function priceLabel(div: number | null | undefined, exPerDiv: number | null): string {
  if (div == null || div <= 0) return "—";
  if (div >= 1) return `${div.toLocaleString("en", { maximumFractionDigits: 2 })} div`;
  if (exPerDiv && exPerDiv > 0) {
    const e = div * exPerDiv;
    return `${e.toLocaleString("en", { maximumFractionDigits: e >= 10 ? 0 : 1 })} ex`;
  }
  return `${div.toPrecision(2)} div`;
}

/** Signed variant for EV — negative EV is a real number the user must see, not missing data. */
export function evLabel(div: number | null | undefined, exPerDiv: number | null): string {
  if (div == null || !Number.isFinite(div)) return "—";
  if (div === 0) return "0 div";
  const sign = div < 0 ? "−" : "+";
  return `${sign}${priceLabel(Math.abs(div), exPerDiv)}`;
}
