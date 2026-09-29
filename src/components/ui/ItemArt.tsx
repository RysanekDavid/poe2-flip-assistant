"use client";

import { useState } from "react";

export type ItemArtSize = 5 | 6 | 8 | 12;

// Literal class names so Tailwind's content scan keeps them.
const SIZE_CLASS: Record<ItemArtSize, string> = {
  5: "h-5 w-5",
  6: "h-6 w-6",
  8: "h-8 w-8",
  12: "h-12 w-12",
};

interface ItemArtProps {
  src: string | null;
  size: ItemArtSize;
  /** Empty (decorative) by default — the item name is almost always printed next to the art. */
  alt?: string;
}

/**
 * Game art for a row. A missing or broken image degrades to a neutral box of the same size so a
 * column of rows never jumps. Plain <img>: the art is remote (poecdn / ninja) at arbitrary sizes,
 * which next/image would need a remotePatterns entry per CDN for.
 */
export function ItemArt({ src, size, alt = "" }: ItemArtProps) {
  const [broken, setBroken] = useState(false);
  const box = SIZE_CLASS[size];
  if (!src || broken) {
    return alt ? (
      <span role="img" aria-label={alt} className={`inline-block shrink-0 rounded bg-neutral-800 ${box}`} />
    ) : (
      <span aria-hidden className={`inline-block shrink-0 rounded bg-neutral-800 ${box}`} />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`inline-block shrink-0 object-contain ${box}`}
    />
  );
}
