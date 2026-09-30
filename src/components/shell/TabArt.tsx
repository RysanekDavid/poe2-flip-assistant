import Image, { type StaticImageData } from "next/image";

/** Owner tab art, drawn the same way everywhere it appears (nav, crumbs, cards). Decorative: the label carries the name. */
export function TabArt({ src, className, priority = false }: { src: StaticImageData; className: string; priority?: boolean }) {
  return <Image src={src} alt="" className={className} priority={priority} />;
}
