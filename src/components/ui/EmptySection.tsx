"use client";

/** Collapsed placeholder for a section with no data yet — one slim line instead of an empty box. */
export function EmptySection({ title, hint }: { title: string; hint: string }) {
  return (
    <section className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg border border-neutral-800/60 bg-neutral-900/30 px-4 py-2.5">
      <h2 className="text-sm font-semibold text-neutral-400">{title}</h2>
      <span className="text-xs text-neutral-600">{hint}</span>
    </section>
  );
}
