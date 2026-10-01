"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { describeError } from "../../lib/clientWarn";
import { moreTabs } from "../../lib/navMode";
import { Button } from "../ui/Button";
import { useDismiss } from "../ui/useDismiss";
import { useNavMode } from "./NavModeProvider";
import { TabArt } from "./TabArt";
import { TAB_ICONS } from "./tabIcons";
import type { TabId, TabMeta } from "./tabRegistry";
import { useTabRoute } from "./useTabRoute";

const TRIGGER =
  "mb-1.5 flex shrink-0 items-center gap-1 rounded-md border border-dashed border-neutral-700 px-2.5 py-2 text-sm font-semibold text-brand-bone/60 " +
  "hover:border-amber-500/40 hover:text-brand-bone/90 focus-visible:outline-dashed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-300";

const PANEL_W = 320;

function ToolRow({ meta, onOpen }: { meta: TabMeta; onOpen: (id: TabId) => void }) {
  return (
    <li>
      <button type="button" onClick={() => onOpen(meta.id)} className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left hover:bg-neutral-800/70">
        <TabArt src={TAB_ICONS[meta.id]} className="h-8 w-8 shrink-0 object-contain" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-neutral-100">{meta.label}</span>
          <span className="block truncate text-xs text-neutral-400">{meta.hint}</span>
        </span>
      </button>
    </li>
  );
}

function useSwitchToAdvanced() {
  const { setMode } = useNavMode();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = (): void => {
    setSaving(true);
    setError(null);
    setMode("advanced")
      .catch((e: unknown) => {
        console.error("[nav-mode] switch to advanced failed", e);
        setError(`Could not switch: ${describeError(e)}`);
      })
      .finally(() => setSaving(false));
  };
  return { run, saving, error };
}

/**
 * The panel's left edge inside the trigger's offsetParent (the strip's positioned wrapper; the strip
 * itself is not positioned, so its sideways scroll box does not clip the panel), kept on screen.
 */
function panelLeft(trigger: HTMLButtonElement | null): number {
  const parent = trigger?.offsetParent;
  if (!trigger || !(parent instanceof HTMLElement)) throw new Error("MoreTools: the strip needs a positioned wrapper");
  const box = parent.getBoundingClientRect();
  const left = trigger.getBoundingClientRect().left - box.left;
  return Math.max(0, Math.min(left, box.width - PANEL_W));
}

/** Escape or a press outside closes the panel and hands focus back to the trigger; opening moves focus in. */
function usePanelFocus(open: boolean, close: () => void, panel: RefObject<HTMLDivElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
  useDismiss(open, close, [panel, trigger], trigger);
  useEffect(() => {
    if (open) panel.current?.querySelector("button")?.focus();
  }, [open, panel]);
}

interface PanelProps {
  left: number;
  tools: readonly TabMeta[];
  panelRef: RefObject<HTMLDivElement | null>;
  onOpen: (id: TabId) => void;
}

function MorePanel({ left, tools, panelRef, onOpen }: PanelProps) {
  const advanced = useSwitchToAdvanced();
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="More tools"
      style={{ left, width: PANEL_W }}
      className="absolute top-full z-50 mt-1 max-w-[calc(100vw-2rem)] rounded-lg border border-neutral-800 bg-neutral-900 p-2 shadow-2xl"
    >
      <p className="px-2 pb-1 pt-0.5 text-xs uppercase tracking-wider text-neutral-400">Advanced tools — open one to look around</p>
      <ul>
        {tools.map((t) => (
          <ToolRow key={t.id} meta={t} onOpen={onOpen} />
        ))}
      </ul>
      <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-2 pt-2">
        <span className="text-xs text-neutral-400">{advanced.error ?? "Settings › Mode switches back."}</span>
        <Button size="sm" variant="primary" onClick={advanced.run} disabled={advanced.saving}>
          {advanced.saving ? "Switching…" : "Show all tools"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Beginner strip's last slot: the advanced tools by name, art and one line, so nothing is hidden
 * without a trace. Opening one shows it under the shell's "Advanced tool" banner; the footer
 * switches the whole nav to Advanced.
 */
export function MoreTools() {
  const { mode } = useNavMode();
  const { go } = useTabRoute();
  const [left, setLeft] = useState<number | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(() => setLeft(null)).current;
  usePanelFocus(left !== null, close, panel, trigger);
  const tools = moreTabs(mode);
  if (tools.length === 0) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-expanded={left !== null}
        aria-haspopup="dialog"
        onClick={() => setLeft(left === null ? panelLeft(trigger.current) : null)}
        className={TRIGGER}
        title={`Advanced tools: ${tools.map((t) => t.label).join(", ")}`}
      >
        More tools <ChevronDown aria-hidden className="h-4 w-4" />
      </button>
      {left !== null && (
        <MorePanel
          left={left}
          tools={tools}
          panelRef={panel}
          onOpen={(id) => {
            close();
            go(id);
          }}
        />
      )}
    </>
  );
}
