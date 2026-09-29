import type { ReactNode } from "react";

interface EmptyStateProps {
  /** A lucide icon or item art — tells what kind of thing is missing at a glance. */
  icon: ReactNode;
  /** One sentence: what is empty and what fills it. */
  sentence: string;
  /** The section this stands in for, when the empty state replaces a whole panel. */
  title?: string;
  /** The single action that fills it (usually a Button). */
  cta?: ReactNode;
}

/** One slim line instead of an empty box: icon, sentence, at most one call to action. */
export function EmptyState({ icon, sentence, title, cta }: EmptyStateProps) {
  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-neutral-900/40 px-4 py-3">
      <span aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center text-neutral-500">
        {icon}
      </span>
      <p className="min-w-0 flex-1 text-sm text-neutral-400">
        {title && <span className="mr-2 font-semibold text-neutral-200">{title}</span>}
        {sentence}
      </p>
      {cta}
    </section>
  );
}
