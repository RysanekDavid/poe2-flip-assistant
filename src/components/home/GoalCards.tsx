"use client";

import Link from "next/link";
import { isTabVisible, type NavMode } from "../../lib/navMode";
import { ItemArt } from "../ui/ItemArt";
import { TabArt } from "../shell/TabArt";
import { tabClickHandler } from "../shell/TabNav";
import { TAB_ICONS } from "../shell/tabIcons";
import { tabRouteHref, type TabId } from "../shell/tabRegistry";
import { useTabRoute } from "../shell/useTabRoute";
import type { HomeLine } from "./useHomePick";

export const GOAL_IDS = ["farm", "price", "flips", "craft", "stash", "regex", "learn"] as const;
export type GoalId = (typeof GOAL_IDS)[number];

export interface Goal {
  id: GoalId;
  title: string;
  /** What the page does for you, verb first. */
  sentence: string;
  tab: TabId;
  tool: string | null;
  /** The card's one action. */
  action: string;
  /** Shown instead of a live line when the card has no feed (or it is off in this mode). */
  hint: string;
  /**
   * The live line is a side door (Price a drop shows the best buy from Opportunities): when it has
   * nothing, the card's own how-to is more useful than "nothing under value".
   */
  hintWhenEmpty?: true;
}

/** By player goal, in the order a newcomer meets them; Home itself is the only page not listed. */
export const GOALS: readonly Goal[] = [
  { id: "farm", title: "Earn by mapping", sentence: "Pick a farming strategy: its setup, and what its drops sell for today.", tab: "farm", tool: "strategies", action: "Farm strategies", hint: "Strategies by budget, build and how hard they are to run." },
  { id: "price", title: "Price a drop", sentence: "Paste an item: what it is worth and how to sell it.", tab: "trade", tool: "price", action: "Price check", hint: "In game, hover the item and press Ctrl+C, then paste it on the page.", hintWhenEmpty: true },
  { id: "flips", title: "Flip currency", sentence: "Buy low and sell high on Ange's Currency Exchange.", tab: "flips", tool: null, action: "Flips", hint: "Exchange flips ranked by how long their edge has held." },
  { id: "craft", title: "Craft for profit", sentence: "Find the crafts that pay at today's prices, or your item's next move.", tab: "craft", tool: "recipes", action: "Craft recipes", hint: "Recipes priced against today's market, plus a paste-your-item helper." },
  { id: "stash", title: "Check my stash", sentence: "See what your stash is worth, and what to sell, list or hold.", tab: "stash", tool: "worth", action: "Stash", hint: "Reads your public stash tabs once you connect your trade account." },
  { id: "regex", title: "Find it in my stash", sentence: "Build a Ctrl+F string that lights up the waystones, tablets or gear you want.", tab: "regex", tool: "waystone", action: "Regex", hint: "Pick the mods you want, then paste the string into the in-game search." },
  { id: "learn", title: "Learn the game", sentence: "Look up any item, the first currencies, the atlas route and the latest patch.", tab: "learn", tool: "what", action: "Learn", hint: "Start with What is this: type any item you are unsure about." },
];

function LineBody({ line, goal }: { line: HomeLine; goal: Goal }) {
  const hint = goal.hint;
  if (line.kind === "empty" && goal.hintWhenEmpty) return <span className="text-neutral-400">{hint}</span>;
  switch (line.kind) {
    case "off":
      return <span className="text-neutral-400">{hint}</span>;
    case "loading":
      return <span className="text-neutral-400">Checking today&apos;s prices…</span>;
    case "error":
      return (
        <span className="text-amber-300" title={line.message}>
          Today&apos;s pick did not load — open the page to try again.
        </span>
      );
    case "empty":
      return <span className="text-neutral-300">{line.text}</span>;
    case "ok":
      return (
        // relative z-10 lifts the deep link above the card's stretched main link
        <Link href={line.href} prefetch={false} scroll={false} className="relative z-10 flex min-w-0 items-center gap-2 rounded hover:bg-neutral-800/60">
          {line.art && <ItemArt src={line.art} size={8} />}
          <span className="min-w-0">
            <span className="block truncate font-semibold text-neutral-100">{line.text}</span>
            <span className="block truncate text-xs text-neutral-400">{line.detail}</span>
          </span>
        </Link>
      );
  }
}

function GoalCard({ goal, line, mode }: { goal: Goal; line: HomeLine; mode: NavMode }) {
  const { go } = useTabRoute();
  const click = tabClickHandler((tab) => go(tab, goal.tool ?? undefined));
  const advancedOnly = !isTabVisible(mode, goal.tab);
  return (
    <li className="relative flex min-h-[176px] flex-col gap-3 rounded-lg border border-line bg-neutral-900/50 p-4 transition-colors hover:border-amber-500/40">
      <div className="flex items-start gap-3">
        <TabArt src={TAB_ICONS[goal.tab]} className="h-10 w-10 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-neutral-100">
            {/* the whole card is this link (stretched); the live line below is its own deep link */}
            <Link href={tabRouteHref({ tab: goal.tab, tool: goal.tool })} prefetch={false} scroll={false} onClick={(e) => click(e, goal.tab)} className="after:absolute after:inset-0 after:content-['']">
              {goal.title}
            </Link>
          </h3>
          <p className="text-sm text-neutral-400">{goal.sentence}</p>
        </div>
        {advancedOnly && (
          <span title="An Advanced tool: it opens with a note on how to show it in your tabs" className="shrink-0 rounded border border-line px-1.5 text-xs text-neutral-400">
            Advanced
          </span>
        )}
      </div>
      <div className="min-w-0 rounded-md border border-line/70 bg-neutral-950/40 px-2.5 py-2 text-sm">
        <span className="mb-0.5 block text-xs uppercase tracking-wider text-neutral-400">Today</span>
        <LineBody line={line} goal={goal} />
      </div>
      <span aria-hidden className="mt-auto self-end text-sm font-medium text-accent">
        {goal.action} →
      </span>
    </li>
  );
}

/** Home's goal grid: one card per player job, each with today's live pick or a plain-words reason. */
export function GoalCards({ goals, lines, mode }: { goals: readonly Goal[]; lines: Record<GoalId, HomeLine>; mode: NavMode }) {
  return (
    <ul data-tour="home" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-3">
      {goals.map((g) => (
        <GoalCard key={g.id} goal={g} line={lines[g.id]} mode={mode} />
      ))}
    </ul>
  );
}
