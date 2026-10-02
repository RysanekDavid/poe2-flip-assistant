import type { ReactNode } from "react";
import { ItemArt } from "../../ui/ItemArt";

/**
 * The in-game item tooltip look, shared by the planner's input item and each step's preview: a dark
 * frame with a gilded header, the rarity colour on the name, centred lines and the diamond
 * separators. The colours are the game's own (also used by Craft › Paste item).
 */

export const MOD_TONE = {
  explicit: "text-[#8888ff]",
  crafted: "text-[#b4b4ff]",
  fractured: "text-[#c4b17a]",
  desecrated: "text-[#c9a0ff]",
  implicit: "text-[#8888ff]",
} as const;
export type ModTone = keyof typeof MOD_TONE;

export function Separator() {
  return (
    <div aria-hidden className="my-1.5 flex items-center justify-center gap-1.5">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-amber-700/60" />
      <span className="h-1.5 w-1.5 rotate-45 border border-amber-600/70 bg-amber-900/40" />
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-amber-700/60" />
    </div>
  );
}

interface FrameProps {
  title: string;
  subtitle: string;
  art: string | null;
  /** Compact = the per-step preview; the full size is the editable input item. */
  compact?: boolean;
  children: ReactNode;
  /** Header-right control (the input item's "change base"). */
  action?: ReactNode;
}

export function TooltipFrame({ title, subtitle, art, compact = false, children, action }: FrameProps) {
  return (
    <div
      className={`overflow-hidden rounded-md border border-amber-900/70 bg-[#0c0a08] shadow-[0_0_0_1px_rgba(0,0,0,.8),0_8px_24px_rgba(0,0,0,.5)] ${compact ? "text-sm" : ""}`}
    >
      <div className="relative flex items-center gap-3 border-b border-amber-900/60 bg-gradient-to-b from-[#3a2a14]/80 via-[#1c140b] to-[#120d08] px-3 py-2">
        <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        {art && (
          <span className={`flex shrink-0 items-center justify-center ${compact ? "h-8 w-8" : "h-14 w-14"}`}>
            <img src={art} alt="" className="max-h-full max-w-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,.8)]" />
          </span>
        )}
        <div className="min-w-0 flex-1 text-center">
          <p className={`truncate font-semibold tracking-wide text-[#ffff77] [font-variant:small-caps] ${compact ? "text-sm" : "text-lg"}`}>{title}</p>
          <p className="truncate text-xs text-[#ffff77]/75">{subtitle}</p>
        </div>
        {action ?? (art && <span aria-hidden className={compact ? "w-8" : "w-14"} />)}
      </div>
      <div className={compact ? "px-2.5 py-1.5" : "px-3 py-2.5"}>{children}</div>
    </div>
  );
}

/** "P" / "S" gutter chip with the tier marker of the advanced (Alt) tooltip. */
export function SideChip({ side, tier }: { side: "prefix" | "suffix" | "any"; tier?: string }) {
  const letter = side === "any" ? "?" : side === "prefix" ? "P" : "S";
  return (
    <span
      title={side === "any" ? "either side" : side}
      className="inline-flex h-5 min-w-[2.25rem] shrink-0 items-center justify-center gap-0.5 rounded-sm border border-neutral-700 bg-neutral-900 px-1 text-xs tabular-nums text-neutral-300"
    >
      <span className="font-semibold">{letter}</span>
      {tier && <span className="text-neutral-400">{tier}</span>}
    </span>
  );
}

/** A small art badge (essence, bone, catalyst) with its name as the hover text. */
export function ArtBadge({ src, label }: { src: string | null; label: string }) {
  return (
    <span title={label} className="inline-flex shrink-0 items-center">
      <ItemArt src={src} size={5} alt={label} />
    </span>
  );
}
