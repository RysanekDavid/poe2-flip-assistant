/*
 * Self-hosted item art (src/assets/items/<id>.png) for items with no official poecdn URL:
 * poe.ninja has `image: null` for them and trade2 data/static omits them (provenance in
 * src/assets/README.md). Curated data refers to one as "asset:<id>"; the farm UI resolves the
 * token to the bundled file (components/farm/farmArt.ts). Client-safe: no image imports here.
 */
export const LOCAL_ART_IDS = ["ravens-reflection", "shattered-triskelion", "the-triskelion-reforged", "djinn-barya", "waystone"] as const;
export type LocalArtId = (typeof LOCAL_ART_IDS)[number];

const PREFIX = "asset:";

/** "asset:djinn-barya" → "djinn-barya"; null for anything that is not a known local-art token. */
export function localArtId(icon: string): LocalArtId | null {
  if (!icon.startsWith(PREFIX)) return null;
  const id = icon.slice(PREFIX.length);
  return (LOCAL_ART_IDS as readonly string[]).includes(id) ? (id as LocalArtId) : null;
}
