/**
 * League name → emblem id. Kept free of PNG imports so node test scripts can load it; the
 * id → image map lives in components/LeagueEmblem.tsx.
 *
 * GGG only publishes the emblems inside login-screen art, so only leagues someone has cut an
 * emblem for are listed. Standard/Hardcore have no emblem at all and deliberately map to none.
 */
export const LEAGUE_EMBLEM_IDS = ["runes-of-aldur", "forbidden-rites"] as const;
export type LeagueEmblemId = (typeof LEAGUE_EMBLEM_IDS)[number];

const BY_BASE_NAME: Readonly<Record<string, LeagueEmblemId>> = {
  "runes of aldur": "runes-of-aldur",
  "forbidden rites": "forbidden-rites",
};

export interface LeagueEmblemRef {
  id: LeagueEmblemId;
  /** "HC", "SSF" or "HC SSF" for parallel variants, which reuse the parent league's emblem. */
  badge: string | null;
}

const VARIANT_PREFIX = /^(hc|ssf)$/i;

/** Emblem for a league name ("HC Runes of Aldur" → runes-of-aldur + "HC"); null when none exists. */
export function leagueEmblemFor(league: string): LeagueEmblemRef | null {
  const words = league.trim().split(/\s+/);
  const variants = new Set<string>();
  while (words.length > 1 && VARIANT_PREFIX.test(words[0] ?? "")) {
    variants.add((words.shift() ?? "").toUpperCase());
  }
  const id = BY_BASE_NAME[words.join(" ").toLowerCase()];
  if (id === undefined) return null;
  // Fixed order so "SSF HC X" and "HC SSF X" badge identically.
  const badge = ["HC", "SSF"].filter((v) => variants.has(v)).join(" ");
  return { id, badge: badge === "" ? null : badge };
}
