"use client";

import type { ToolId } from "./toolRegistry";
import { TOOLS } from "./toolRegistry";

/** Shared "coming soon" body so the four scaffolded panels stay one line each until they ship. */
export function ToolPlaceholder({ id }: { id: ToolId }) {
  const meta = TOOLS.find((t) => t.id === id);
  if (!meta) throw new Error(`unknown tool id: ${id}`);
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-neutral-100">{meta.label}</h2>
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-neutral-500">
          coming soon
        </span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{meta.hint}</p>
    </section>
  );
}
