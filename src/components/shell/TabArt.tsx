import type { CSSProperties } from "react";
import Image from "next/image";
import type { TabArtIcon } from "./tabIcons";

// The slight contrast keeps lifted metal art from turning flat grey; untouched art gets no filter.
const liftStyle = (lift: number): CSSProperties | undefined => (lift === 1 ? undefined : { filter: `brightness(${lift}) contrast(1.05)` });

/** Tab art drawn with its per-image lift, so every place that shows it (nav, crumbs, cards) matches. */
export function TabArt({ icon, className, priority = false }: { icon: TabArtIcon; className: string; priority?: boolean }) {
  return <Image src={icon.src} alt="" className={className} style={liftStyle(icon.lift)} priority={priority} />;
}
