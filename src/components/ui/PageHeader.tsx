import type { ReactNode } from "react";
import { InfoTip } from "./Tooltip";

interface PageHeaderProps {
  title: string;
  /** One line: what this page answers. Readable in five seconds. */
  purpose: string;
  /** The page's primary action (usually one primary Button). */
  action?: ReactNode;
  /** Caveats and column glossary — behind an ⓘ instead of prose under the title. */
  legend?: ReactNode;
}

/** Every tab and tool starts with the same header so the page's purpose is never a guess. */
export function PageHeader({ title, purpose, action, legend }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold text-neutral-100">{title}</h2>
          {legend && <InfoTip tip={legend} label={`About ${title}`} side="bottom" />}
        </div>
        <p className="text-sm text-neutral-400">{purpose}</p>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
