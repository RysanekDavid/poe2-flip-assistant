import abyssTablet from "../../../assets/items/abyss-tablet.webp";
import breachTablet from "../../../assets/items/breach-tablet.webp";
import cruelHegemony from "../../../assets/items/cruel-hegemony.png";
import deliriumTablet from "../../../assets/items/delirium-tablet.webp";
import expeditionTablet from "../../../assets/items/expedition-tablet.webp";
import irradiatedTablet from "../../../assets/items/irradiated-tablet.webp";
import masteredDomain from "../../../assets/items/mastered-domain.png";
import overseerTablet from "../../../assets/items/overseer-tablet.webp";
import ritualTablet from "../../../assets/items/ritual-tablet.webp";
import templeTablet from "../../../assets/items/temple-tablet.webp";
import visionsOfParadise from "../../../assets/items/visions-of-paradise.png";
import { tabletArtFile, type TabletArtFile } from "./tabletArt";

// The Record type makes a file listed in tabletArt.ts without an image here a type error.
const IMAGES: Record<TabletArtFile, { src: string }> = {
  "abyss-tablet.webp": abyssTablet,
  "breach-tablet.webp": breachTablet,
  "cruel-hegemony.png": cruelHegemony,
  "delirium-tablet.webp": deliriumTablet,
  "expedition-tablet.webp": expeditionTablet,
  "irradiated-tablet.webp": irradiatedTablet,
  "mastered-domain.png": masteredDomain,
  "overseer-tablet.webp": overseerTablet,
  "ritual-tablet.webp": ritualTablet,
  "temple-tablet.webp": templeTablet,
  "visions-of-paradise.png": visionsOfParadise,
};

/** The bundled image URL for a strategy tablet (its unique art, else its base art). */
export function tabletArtSrc(tablet: { type: string; unique: string | null }): string {
  return IMAGES[tabletArtFile(tablet)].src;
}
