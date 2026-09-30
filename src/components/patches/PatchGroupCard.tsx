"use client";

import { useState } from "react";
import type { SummaryKind } from "../../sources/patchNotes/summaryContract";
import { groupKindStyle, type GroupIcon } from "./groupKinds";

/** 16px group icon; glyphs take a neutral tint so only the border carries colour. */
export function GroupIconView({ icon, className = "" }: { icon: GroupIcon; className?: string }) {
  if (icon.kind === "art") return <img src={icon.src} alt="" className={`h-4 w-4 shrink-0 object-contain ${className}`} />;
  const { Icon } = icon;
  return <Icon aria-hidden className={`h-4 w-4 shrink-0 text-neutral-400 ${className}`} />;
}

const SHOWN = 4;

/** One summary group as a mini-card: kind accent on the left edge, icon + label + count, bullets. */
export function PatchGroupCard({ kind, bullets }: { kind: SummaryKind; bullets: readonly string[] }) {
  const [all, setAll] = useState(false);
  const style = groupKindStyle(kind);
  const shown = all ? bullets : bullets.slice(0, SHOWN);
  const hidden = bullets.length - shown.length;
  return (
    <section className={`rounded-md border-l-[3px] bg-neutral-900/40 py-2 pl-3 pr-2 ${style.border}`}>
      <h4 className="flex items-center gap-2">
        <GroupIconView icon={style.icon} />
        <span className="text-sm font-medium text-neutral-200">{style.label}</span>
        <span className="text-xs tabular-nums text-neutral-500">{bullets.length}</span>
      </h4>
      <ul className="mt-1 space-y-1 text-sm text-neutral-300">
        {shown.map((bullet, index) => (
          <li key={index} className="pl-3 -indent-3">
            <span aria-hidden className="text-neutral-500">– </span>
            {bullet}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setAll(true)} className="mt-1 text-xs text-neutral-400 hover:text-neutral-200">
          +{hidden} more
        </button>
      )}
    </section>
  );
}
