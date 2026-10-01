"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { PoolTab } from "../../../core/tools/regex/pools/schema";
import { REGEX_TABS, SHARE_PARAM, emptyPoolSelection, type PoolTabSelection, type RegexTab, type TabSelection } from "../../../lib/tools/regexPoolContract";
import type { PricePresetParams } from "../../../lib/tools/regexContract";
import { readShare } from "../../../lib/tools/regexShareUrl";
import { PageHeader } from "../../ui/PageHeader";
import { useTabRoute } from "../../shell/useTabRoute";
import { tabRouteHref } from "../../shell/tabRegistry";
import { TAB_ICONS } from "../../shell/tabIcons";
import { PoolRegexPanel, type PoolUpdater } from "./PoolRegexPanel";
import { DEFAULT_PRICE_PARAMS, PriceRegexPanel } from "./PriceRegexPanel";
import { emptyVendorSelection } from "./selectionOps";
import { SESSION_KEY, parseStoredState, type RegexToolState } from "./sessionState";
import { useMaxChars } from "./useMaxChars";
import { VendorPanel } from "./VendorPanel";

const DEFAULT_TAB: RegexTab = "waystone";

const initialState = (): RegexToolState => ({
  waystone: emptyPoolSelection("waystone"),
  tablet: emptyPoolSelection("tablet"),
  relic: emptyPoolSelection("relic"),
  jewel: emptyPoolSelection("jewel"),
  vendor: emptyVendorSelection(),
  price: DEFAULT_PRICE_PARAMS,
});

function withSelection(prev: RegexToolState, s: TabSelection): RegexToolState {
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

/** Restores the session mirror after mount (the server render has no storage), then keeps it current. */
function useSessionMirror(state: RegexToolState, setState: Dispatch<SetStateAction<RegexToolState>>): void {
  const restored = useRef(false);
  useEffect(() => {
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(SESSION_KEY);
    } catch (error: unknown) {
      console.warn("[tools/regex] could not read the session selections", error);
    }
    const { patch, problems } = parseStoredState(raw);
    if (problems.length > 0) console.warn(`[tools/regex] dropped stored selections: ${problems.join("; ")}`);
    // queued before the share-link effect's update (declared earlier), so a shared selection still wins
    setState((prev) => ({ ...prev, ...patch }));
    restored.current = true;
  }, [setState]);
  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
    } catch (error: unknown) {
      console.warn("[tools/regex] could not store the session selections", error);
    }
  }, [state]);
}

/** Applies a `?…&s=` share link once, then drops `s` from the URL so later edits are not shadowed by it. */
function useShareLink(tool: string | null, apply: (s: TabSelection) => void): [string | null, () => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const code = params.get(SHARE_PARAM);
  // The raw ?tool=, not the resolved one: `?tab=regex&s=…` without a tool resolves to Waystone, and
  // a tablet code must still open Tablet instead of reading as a mismatch.
  const rawTool = params.get("tool");
  const [banner, setBanner] = useState<string | null>(null);
  useEffect(() => {
    const read = readShare(rawTool, code);
    if (read.kind === "none") return;
    if (read.kind === "error") {
      console.warn(`[tools/regex] share link rejected: ${read.message}`);
      setBanner(`This share link could not be opened: ${read.message}`);
    } else {
      apply(read.selection);
      setBanner(null);
    }
    router.replace(`${pathname}${tabRouteHref({ tab: "regex", tool: read.kind === "ok" ? read.selection.tab : tool })}`, { scroll: false });
  }, [tool, rawTool, code, apply, router, pathname]);
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
  state: RegexToolState;
  onSelection: (s: TabSelection) => void;
  onUpdatePool: PoolUpdater;
  onPrice: (p: PricePresetParams) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

function ActivePanel({ tab, state, onSelection, onUpdatePool, onPrice, maxChars, onMaxChars }: ActiveProps) {
  const limits = { maxChars, onMaxChars };
  switch (tab) {
    case "price":
      return <PriceRegexPanel params={state.price} onChange={onPrice} {...limits} />;
    case "vendor":
      return <VendorPanel selection={state.vendor} onChange={onSelection} {...limits} />;
    default:
      // keyed by tab: a pool panel's debounced state must never carry one tab's selection into another
      return <PoolRegexPanel key={tab} tab={tab} selection={state[tab]} onChange={onSelection} onUpdate={onUpdatePool} {...limits} />;
  }
}

/**
 * The Regex tab: share-link handling and one panel per item kind. The shell's SubTabBar switches
 * kinds, and the tab registry lists exactly REGEX_TABS, so an unknown ?tool= never reaches here.
 */
export function RegexTool() {
  const { tool } = useTabRoute();
  const tab: RegexTab = isRegexTab(tool) ? tool : DEFAULT_TAB;
  const [state, setState] = useState<RegexToolState>(initialState);
  const [maxChars, setMaxChars] = useMaxChars();
  useSessionMirror(state, setState);
  const onSelection = useCallback((s: TabSelection) => setState((prev) => withSelection(prev, s)), []);
  const onUpdatePool = useCallback((t: PoolTab, fn: (s: PoolTabSelection) => PoolTabSelection) => setState((prev) => withSelection(prev, fn(prev[t]))), []);
  const onPrice = useCallback((price: PricePresetParams) => setState((prev) => ({ ...prev, price })), []);
  const [banner, dismiss] = useShareLink(tool, onSelection);
  return (
    <section className="flex flex-col gap-4">
      <PageHeader
        title="Regex"
        purpose="Build a Ctrl+F stash search that lights up the waystones, tablets or gear you want."
        art={TAB_ICONS.regex.src}
      />
      {banner && <ShareBanner message={banner} onDismiss={dismiss} />}
      <ActivePanel tab={tab} state={state} onSelection={onSelection} onUpdatePool={onUpdatePool} onPrice={onPrice} maxChars={maxChars} onMaxChars={setMaxChars} />
    </section>
  );
}
