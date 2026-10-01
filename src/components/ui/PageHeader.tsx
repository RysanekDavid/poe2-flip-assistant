import type { ReactNode } from "react";
import { InfoTip } from "./Tooltip";

export interface HeaderExample {
  label: string;
  onClick: () => void;
  /** Hover text: what the example will do. */
  title?: string;
}

interface PageHeaderProps {
  title: string;
  /** One line: what this page is for, verb first, second person. Readable in five seconds. */
  purpose: string;
  /** The page's one primary action (usually one primary Button). */
  action?: ReactNode;
  /** Caveats and column glossary — behind an ⓘ instead of prose under the title. */
  legend?: ReactNode;
  /** The page's game art (bundled or poecdn URL), shown beside the title. */
  art?: string;
  /** Clickable "Try:" chips that show what the page does instead of explaining it. */
  examples?: readonly HeaderExample[];
}

function Examples({ examples }: { examples: readonly HeaderExample[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs text-neutral-400">
      <span>Try:</span>
      {examples.map((ex) => (
        <button
          key={ex.label}
          type="button"
          onClick={ex.onClick}
          title={ex.title}
          className="h-7 rounded-md border border-line bg-neutral-900/60 px-2.5 text-xs text-neutral-200 hover:border-neutral-500 hover:text-neutral-100"
        >
          {ex.label}
        </button>
      ))}
    </div>
  );
}

/** Every tab and tool starts with the same job header so the page's purpose is never a guess. */
export function PageHeader({ title, purpose, action, legend, art, examples }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-3">
        {art && <img src={art} alt="" aria-hidden className="h-10 w-10 shrink-0 object-contain" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-neutral-100">{title}</h2>
            {legend && <InfoTip tip={legend} label={`About ${title}`} side="bottom" />}
          </div>
          <p className="text-sm text-neutral-400">{purpose}</p>
          {examples && examples.length > 0 && <Examples examples={examples} />}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
