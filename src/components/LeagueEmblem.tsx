import Image, { type StaticImageData } from "next/image";
import { Globe } from "lucide-react";
import { leagueEmblemFor, type LeagueEmblemId } from "../lib/leagueEmblem";
import runesOfAldur from "../assets/leagues/runes-of-aldur.png";
import forbiddenRites from "../assets/leagues/forbidden-rites.png";

const EMBLEM_ART: Record<LeagueEmblemId, StaticImageData> = {
  "runes-of-aldur": runesOfAldur,
  "forbidden-rites": forbiddenRites,
};

/**
 * The league's in-game banner emblem, with an HC/SSF chip for parallel variants. Leagues without
 * an emblem (Standard, Hardcore, anything not cut yet) keep the generic globe so the picker never
 * loses its leading glyph.
 */
export function LeagueEmblem({ league }: { league: string }) {
  const ref = leagueEmblemFor(league);
  if (!ref) return <Globe aria-hidden className="h-3.5 w-3.5 shrink-0 text-amber-500/70" />;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Image src={EMBLEM_ART[ref.id]} alt="" className="h-5 w-5 object-contain" />
      {ref.badge && (
        <span className="rounded bg-neutral-800 px-1 text-xs font-semibold leading-4 text-amber-200">{ref.badge}</span>
      )}
    </span>
  );
}
