/*
 * Which self-hosted art (src/assets/items, provenance in src/assets/README.md) a strategy tablet
 * shows: a unique tablet by its name, otherwise its trade2 base. Plain data with no image imports so
 * the node test script can check it; tabletArtImages.ts binds each file to its bundled image.
 */

export const TABLET_BASE_ART = {
  "Abyss Tablet": "abyss-tablet.webp",
  "Breach Tablet": "breach-tablet.webp",
  "Delirium Tablet": "delirium-tablet.webp",
  "Expedition Tablet": "expedition-tablet.webp",
  "Irradiated Tablet": "irradiated-tablet.webp",
  "Overseer Tablet": "overseer-tablet.webp",
  "Ritual Tablet": "ritual-tablet.webp",
  "Temple Tablet": "temple-tablet.webp",
} as const;

export const TABLET_UNIQUE_ART = {
  "Cruel Hegemony": "cruel-hegemony.png",
  "Mastered Domain": "mastered-domain.png",
  "Visions of Paradise": "visions-of-paradise.png",
} as const;

export type TabletArtFile = (typeof TABLET_BASE_ART)[keyof typeof TABLET_BASE_ART] | (typeof TABLET_UNIQUE_ART)[keyof typeof TABLET_UNIQUE_ART];

// hasOwn keeps inherited keys ("constructor") from resolving to something that is not a file.
function lookup(table: Readonly<Record<string, TabletArtFile>>, name: string): TabletArtFile | null {
  return Object.hasOwn(table, name) ? (table[name] ?? null) : null;
}

/**
 * The art file for a tablet. Throws on a name without art: showing base art for an unknown unique,
 * or the old one-picture-for-all, would present the wrong item as if it were right.
 */
export function tabletArtFile(tablet: { type: string; unique: string | null }): TabletArtFile {
  const file = tablet.unique === null ? lookup(TABLET_BASE_ART, tablet.type) : lookup(TABLET_UNIQUE_ART, tablet.unique);
  if (file === null) {
    const name = tablet.unique === null ? `base "${tablet.type}"` : `unique "${tablet.unique}"`;
    throw new Error(`no tablet art for ${name}; add it to src/assets/items and tabletArt.ts`);
  }
  return file;
}
