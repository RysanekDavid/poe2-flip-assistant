"use client";

import { useRef, type KeyboardEvent } from "react";
import { Amphora, Coins, Gem, Layers, Milestone, Store, type LucideIcon } from "lucide-react";
import { REGEX_TABS, type RegexTab } from "../../../lib/tools/regexPoolContract";

interface TabInfo {
  label: string;
  Icon: LucideIcon;
  /** Tooltip: what the sub-tab searches. */
  hint: string;
}

// Lucide glyphs until the owner supplies game art for the sub-tabs.
export const REGEX_TAB_INFO: Record<RegexTab, TabInfo> = {
  waystone: { label: "Waystone", Icon: Milestone, hint: "pick waystone mods to run or avoid" },
  tablet: { label: "Tablet", Icon: Layers, hint: "precursor tablets by type and mod" },
  relic: { label: "Relic", Icon: Amphora, hint: "Trial of the Sekhemas relics by mod" },
  jewel: { label: "Jewel", Icon: Gem, hint: "jewels by colour and mod" },
  vendor: { label: "Vendor", Icon: Store, hint: "vendor-screen gear: speed, resistances, +skills" },
  price: { label: "Price", Icon: Coins, hint: "stash items worth at least a price" },
};

export const tabPanelId = (tab: RegexTab): string => `regex-panel-${tab}`;
export const tabButtonId = (tab: RegexTab): string => `regex-tab-${tab}`;

/** Sub-tab strip (ARIA tabs pattern: arrows move between tabs, activation follows focus). */
export function RegexTabBar({ active, onSelect }: { active: RegexTab; onSelect: (tab: RegexTab) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    const i = (REGEX_TABS.indexOf(active) + step + REGEX_TABS.length) % REGEX_TABS.length;
    const next = REGEX_TABS[i];
    if (!next) return;
    onSelect(next);
    refs.current[i]?.focus();
  };
  return (
    <div role="tablist" aria-label="Regex tools" onKeyDown={onKeyDown} className="flex flex-wrap gap-1.5 border-b border-line pb-2">
      {REGEX_TABS.map((tab, i) => {
        const { label, Icon, hint } = REGEX_TAB_INFO[tab];
        const on = tab === active;
        return (
          <button
            key={tab}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabButtonId(tab)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={tabPanelId(tab)}
            tabIndex={on ? 0 : -1}
            title={hint}
            onClick={() => onSelect(tab)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
              on
                ? "border-amber-400/50 bg-amber-400/10 text-amber-100"
                : "border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
            }`}
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
