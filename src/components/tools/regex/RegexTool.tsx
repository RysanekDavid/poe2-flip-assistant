"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import {
  REGEX_TABS,
  SHARE_PARAM,
  emptyPoolSelection,
  type PoolTabSelection,
  type RegexTab,
  type TabSelection,
  type VendorSelection,
} from "../../../lib/tools/regexPoolContract";
import type { PricePresetParams } from "../../../lib/tools/regexContract";
import { readShare } from "../../../lib/tools/regexShareUrl";
import { PageHeader } from "../../ui/PageHeader";
import { useTabRoute } from "../../shell/useTabRoute";
import { tabRouteHref } from "../../shell/tabRegistry";
import { PoolRegexPanel } from "./PoolRegexPanel";
import { DEFAULT_PRICE_PARAMS, PriceRegexPanel } from "./PriceRegexPanel";
import { REGEX_TAB_INFO, RegexTabBar, tabButtonId, tabPanelId } from "./RegexTabBar";
import { emptyVendorSelection } from "./selectionOps";
import { useMaxChars } from "./useMaxChars";
import { VendorPanel } from "./VendorPanel";

const DEFAULT_TAB: RegexTab = "waystone";

/** Every sub-tab keeps its own selection while the player flips between them. */
interface Selections {
  waystone: PoolTabSelection;
  tablet: PoolTabSelection;
  relic: PoolTabSelection;
  jewel: PoolTabSelection;
  vendor: VendorSelection;
}

const initialSelections = (): Selections => ({
  waystone: emptyPoolSelection("waystone"),
  tablet: emptyPoolSelection("tablet"),
  relic: emptyPoolSelection("relic"),
  jewel: emptyPoolSelection("jewel"),
  vendor: emptyVendorSelection(),
});

function withSelection(prev: Selections, s: TabSelection): Selections {
  switch (s.tab) {
    case "waystone":
      return { ...prev, waystone: s };
    case "tablet":
      return { ...prev, tablet: s };
    case "relic":
      return { ...prev, relic: s };
    case "jewel":
      return { ...prev, jewel: s };
    case "vendor":
      return { ...prev, vendor: s };
  }
}

const isRegexTab = (tool: string | null): tool is RegexTab => tool !== null && (REGEX_TABS as readonly string[]).includes(tool);

/** Applies a `?…&s=` share link once, then drops `s` from the URL so later edits are not shadowed by it. */
function useShareLink(tool: string | null, apply: (s: TabSelection) => void): [string | null, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const code = params.get(SHARE_PARAM);
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    const read = readShare(tool, code);
    if (read.kind === "none") return;
    if (read.kind === "error") {
      console.warn(`[tools/regex] share link rejected: ${read.message}`);
      setBanner(`This share link could not be opened: ${read.message}`);
    } else {
      apply(read.selection);
      setBanner(null);
    }
    router.replace(`${pathname}${tabRouteHref({ tab: "regex", tool: read.kind === "ok" ? read.selection.tab : tool })}`, { scroll: false });
  }, [tool, code, apply, router, pathname]);
  return [banner, () => setBanner(null)];
}

function ShareBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-red-100">
      <p className="min-w-0 flex-1">{message}</p>
      <button type="button" onClick={onDismiss} aria-label="dismiss" className="rounded p-0.5 text-red-200 hover:bg-bad/20">
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

interface ActiveProps {
  tab: RegexTab;
  selections: Selections;
  onSelection: (s: TabSelection) => void;
  price: PricePresetParams;
  onPrice: (p: PricePresetParams) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

function ActivePanel({ tab, selections, onSelection, price, onPrice, maxChars, onMaxChars }: ActiveProps) {
  const limits = { maxChars, onMaxChars };
  switch (tab) {
    case "price":
      return <PriceRegexPanel params={price} onChange={onPrice} {...limits} />;
    case "vendor":
      return <VendorPanel selection={selections.vendor} onChange={onSelection} {...limits} />;
    default:
      // keyed by tab: a pool panel's debounced state must never carry one tab's selection into another
      return <PoolRegexPanel key={tab} tab={tab} selection={selections[tab]} onChange={onSelection} {...limits} />;
  }
}

/** The Regex tab: sub-tab bar, share-link handling, and one panel per item kind. */
export function RegexTool() {
  const { tool, go } = useTabRoute();
  const tab: RegexTab = isRegexTab(tool) ? tool : DEFAULT_TAB;
  const [selections, setSelections] = useState<Selections>(initialSelections);
  const [price, setPrice] = useState<PricePresetParams>(DEFAULT_PRICE_PARAMS);
  const [maxChars, setMaxChars] = useMaxChars();
  const onSelection = useCallback((s: TabSelection) => setSelections((prev) => withSelection(prev, s)), []);
  const [banner, dismiss] = useShareLink(tool, onSelection);
  const unknownTool = tool !== null && !isRegexTab(tool) ? `There is no "${tool}" regex tool — showing ${REGEX_TAB_INFO[DEFAULT_TAB].label}.` : null;
  const notice = banner ?? unknownTool;
  return (
    <section className="flex flex-col gap-4">
      <PageHeader title="Regex" purpose="Build stash-search strings (Ctrl+F in game) that light up the waystones, tablets, relics, jewels or gear you want." />
      <RegexTabBar active={tab} onSelect={(t) => go("regex", t)} />
      {notice && <ShareBanner message={notice} onDismiss={banner ? dismiss : () => go("regex", DEFAULT_TAB)} />}
      <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabButtonId(tab)}>
        <ActivePanel tab={tab} selections={selections} onSelection={onSelection} price={price} onPrice={setPrice} maxChars={maxChars} onMaxChars={setMaxChars} />
      </div>
    </section>
  );
}
