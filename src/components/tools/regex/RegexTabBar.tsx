"use client";

import { useRef, type KeyboardEvent } from "react";
import Image, { type StaticImageData } from "next/image";
import { REGEX_TABS, type RegexTab } from "../../../lib/tools/regexPoolContract";
import artWaystone from "../../../assets/items/waystone.png";
import artTablet from "../../../assets/items/precursor-tablet.png";
import artRelic from "../../../assets/items/coffer-relic.png";
import artJewel from "../../../assets/items/emerald-jewel.png";
import artGold from "../../../assets/items/gold.png";
import artDivine from "../../../assets/items/divine-orb.png";

interface TabInfo {
  label: string;
  art: StaticImageData;
  /** Tooltip: what the sub-tab searches. */
  hint: string;
}

// Vendor shows Gold, what an NPC pays for gear; Price uses the Divine Orb, the unit every price in
// the app is quoted in.
export const REGEX_TAB_INFO: Record<RegexTab, TabInfo> = {
  waystone: { label: "Waystone", art: artWaystone, hint: "pick waystone mods to run or avoid" },
  tablet: { label: "Tablet", art: artTablet, hint: "precursor tablets by type and mod" },
  relic: { label: "Relic", art: artRelic, hint: "Trial of the Sekhemas relics by mod" },
  jewel: { label: "Jewel", art: artJewel, hint: "jewels by colour and mod" },
  vendor: { label: "Vendor", art: artGold, hint: "vendor-screen gear: speed, resistances, +skills" },
  price: { label: "Price", art: artDivine, hint: "stash items worth at least a price" },
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
        const { label, art, hint } = REGEX_TAB_INFO[tab];
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
            {/* Decorative: the label beside it already names the tab for screen readers. */}
            <Image src={art} alt="" className={`h-6 w-6 object-contain transition-opacity ${on ? "opacity-100" : "opacity-70"}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
