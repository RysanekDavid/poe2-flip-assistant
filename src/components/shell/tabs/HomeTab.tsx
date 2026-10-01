"use client";

import { GOALS, GoalCards, type Goal } from "../../home/GoalCards";
import { useGoalLines } from "../../home/useGoalLines";
import { isTabVisible, type NavMode } from "../../../lib/navMode";
import { PageHeader } from "../../ui/PageHeader";
import { useNavMode } from "../NavModeProvider";
import { TAB_ICONS } from "../tabIcons";

const LEGEND =
  "Each card's Today line comes from the page it opens, at the moment you load Home: the strategy whose drops rose most in " +
  "price over 7 days (poe.ninja), the top exchange flip that passed the rank gate, the best snipe or rising unique, the top " +
  "craft recipe, your last stash read and the newest patch notes. Nothing is predicted; a card with nothing to show says why.";

/** A Beginner's own tabs first, then the Advanced tools (tagged), so the first row is always usable. */
export function goalsFor(mode: NavMode): readonly Goal[] {
  const own = GOALS.filter((g) => isTabVisible(mode, g.tab));
  return [...own, ...GOALS.filter((g) => !own.includes(g))];
}

/** Home: "what do you want to do today?" — one card per player goal, each with today's live pick. */
export function HomeTab() {
  const { mode } = useNavMode();
  const lines = useGoalLines(mode);
  return (
    <>
      <PageHeader
        title="What do you want to do today?"
        purpose="Pick a goal: each card opens the page for it, with today's top pick from live prices."
        legend={LEGEND}
        art={TAB_ICONS.home.src}
      />
      <GoalCards goals={goalsFor(mode)} lines={lines} mode={mode} />
    </>
  );
}
