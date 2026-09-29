import djinnBarya from "../../assets/items/djinn-barya.png";
import ravensReflection from "../../assets/items/ravens-reflection.png";
import shatteredTriskelion from "../../assets/items/shattered-triskelion.png";
import triskelionReforged from "../../assets/items/the-triskelion-reforged.png";
import waystone from "../../assets/items/waystone.png";
import { localArtId, type LocalArtId } from "../../core/tools/bossEv/localArt";

// Self-hosted because no official poecdn URL exists for these (provenance: src/assets/README.md).
const LOCAL_ART: Record<LocalArtId, { src: string }> = {
  "ravens-reflection": ravensReflection,
  "shattered-triskelion": shatteredTriskelion,
  "the-triskelion-reforged": triskelionReforged,
  "djinn-barya": djinnBarya,
  waystone,
};

/** A curated icon as an <img> src: "asset:<id>" → the bundled file, a poecdn URL unchanged. */
export function artSrc(icon: string | null): string | null {
  if (icon == null) return null;
  const id = localArtId(icon);
  return id == null ? icon : LOCAL_ART[id].src;
}
