import type { MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Rubik } from "next/font/google";
import owl from "../../assets/logo/app_logo.png";

// Only the wordmark uses Rubik, and only at 800, so the page downloads a single font file for it.
const rubik = Rubik({ subsets: ["latin"], weight: "800", display: "swap" });

/**
 * `header` is responsive: the bare 40 px owl on phones (the wordmark would squeeze the league picker
 * off a 390 px screen), the owl with a one-line wordmark from sm, and the full 84 px owl with the
 * stacked wordmark from md up, where the header gives the brand its own block. `login` is the
 * stacked form at a fixed, smaller size.
 */
export type BrandSize = "header" | "login";

interface BrandStyle {
  root: string;
  owl: string;
  owlSizes: string;
  word: string;
  coach: string;
}

const STYLES: Record<BrandSize, BrandStyle> = {
  header: {
    root: "items-center md:items-end",
    owl: "h-10 w-10 md:h-[84px] md:w-[84px]",
    owlSizes: "(min-width: 768px) 84px, 40px",
    word: "ml-1.5 hidden items-baseline gap-1.5 sm:flex [--brand-drop:2px] md:-ml-1.5 md:grid md:gap-0 md:pb-1.5 md:leading-[0.95] md:[--brand-drop:3px]",
    coach: "text-[20px] leading-none md:text-[30px] md:leading-[0.95]",
  },
  login: {
    root: "items-end",
    owl: "h-16 w-16",
    owlSizes: "64px",
    word: "-ml-1.5 grid pb-1 leading-[0.95] [--brand-drop:2px]",
    coach: "text-[24px] leading-[0.95]",
  },
};

function BrandMark({ size }: { size: BrandSize }) {
  const s = STYLES[size];
  return (
    <>
      <span className="sr-only">PoE2 Coach</span>
      {/* the owl points right, so the wordmark tucks under its wing: the owl paints over the overlap */}
      <Image src={owl} alt="" aria-hidden sizes={s.owlSizes} priority className={`relative z-[1] shrink-0 object-contain ${s.owl}`} />
      <span aria-hidden className={`${rubik.className} ${s.word}`}>
        <span className="pl-0.5 text-[13px] font-extrabold uppercase tracking-[0.18em] text-brand-teal-hi">PoE2</span>
        <span className={`brand-coach font-extrabold tracking-[-0.01em] text-brand-bone ${s.coach}`}>Coach</span>
      </span>
    </>
  );
}

interface BrandProps {
  size: BrandSize;
  /** Present only where the brand is a way home; the login page and loading chrome have nowhere to go. */
  href?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/** The owl mascot plus the "PoE2 Coach" wordmark. Its accessible name is "PoE2 Coach" either way. */
export function Brand({ size, href, onClick }: BrandProps) {
  const root = `inline-flex ${STYLES[size].root}`;
  if (href === undefined) {
    return (
      <span className={root}>
        <BrandMark size={size} />
      </span>
    );
  }
  return (
    <Link href={href} scroll={false} prefetch={false} onClick={onClick} className={`${root} rounded-md`}>
      <BrandMark size={size} />
    </Link>
  );
}
