// Shared table styling — keeps DiscoverTable and SpreadTable visually consistent.
// All class strings are literals so Tailwind's JIT picks them up.

/** One restrained colour per category so the eye can group rows at a glance. */
export const CATEGORY_COLOR: Record<string, string> = {
  Currency: "bg-amber-500/15 text-amber-300",
  Fragments: "bg-purple-500/15 text-purple-300",
  Runes: "bg-sky-500/15 text-sky-300",
  Essences: "bg-emerald-500/15 text-emerald-300",
  Breach: "bg-red-500/15 text-red-300",
  Expedition: "bg-orange-500/15 text-orange-300",
  Abyss: "bg-rose-500/15 text-rose-300",
  Ritual: "bg-fuchsia-500/15 text-fuchsia-300",
  UncutGems: "bg-teal-500/15 text-teal-300",
  SoulCores: "bg-indigo-500/15 text-indigo-300",
  Idols: "bg-yellow-500/15 text-yellow-300",
  Verisium: "bg-cyan-500/15 text-cyan-300",
  Delirium: "bg-violet-500/15 text-violet-300",
};

export const categoryColor = (c: string): string => CATEGORY_COLOR[c] ?? "bg-neutral-700/60 text-neutral-300";

/** Margin cell tint — hint of green the fatter the margin (not a rainbow). */
export function marginTint(pct: number): string {
  if (pct >= 20) return "bg-good/10 text-good";
  if (pct >= 12) return "bg-good/[0.06] text-good";
  if (pct >= 6) return "text-warn";
  return "text-neutral-400";
}

/** Colour tiers for the 0–100 worth score. */
export function worthTone(n: number): string {
  if (n >= 60) return "text-good";
  if (n >= 35) return "text-warn";
  return "text-neutral-500";
}

// Reusable chrome
export const SCROLL_BOX = "max-h-[560px] overflow-y-auto rounded-md border border-neutral-800";
export const THEAD_STICKY = "sticky top-0 z-10 bg-neutral-900 text-left text-neutral-400 shadow-[0_1px_0_0_theme(colors.neutral.800)]";
export const ROW_BASE = "border-t border-neutral-800/60 even:bg-white/[0.015] hover:bg-neutral-800/50";
export const CELL = "px-3 py-2";
