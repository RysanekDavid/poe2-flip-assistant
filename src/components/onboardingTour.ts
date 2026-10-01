import type { Driver } from "driver.js";
import { isTabVisible, visibleTools, type NavMode } from "../lib/navMode";
import type { TabId } from "./shell/tabRegistry";

export interface TourStep {
  /** Tab the element lives on; null = part of the always-visible shell. */
  tab: TabId | null;
  /** Tool of that tab the element lives on, when it is not the tab's default. */
  tool?: string;
  element: string;
  title: string;
  description: string;
  /** Replaces `description` in beginner mode, when the advanced text names hidden tabs. */
  beginnerDescription?: string;
}

/*
 * Every selector here must exist once its tab is open — the tour switches tabs before
 * highlighting, so a step never points at an element that is not rendered.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    tab: null,
    element: '[data-tour="tabs"]',
    title: "Where things are",
    description:
      "Grouped by what you want to do: earn (Farm, Flips at Ange's Currency Exchange, Craft), prices and your items (Trade, Stash), tools and knowledge (Regex, Learn). Every tab has its own link — bookmark or share it.",
    beginnerDescription:
      "Farm = what to run at your budget. Trade = what a drop is worth. Learn = what an item is and your atlas route. More tools, at the end of the bar, opens the trading tools.",
  },
  {
    tab: "home",
    element: '[data-tour="home"]',
    title: "Start here",
    description: "Pick what you want to do today. Each card shows today's top pick from live prices and opens the page that does the job.",
  },
  {
    tab: "learn",
    element: '[data-tour="learn"]',
    title: "What is this?",
    description:
      "Type any item to see what it does, what it is worth right now and where to sell it. The currency primer, atlas checklist and patch notes sit next to it.",
  },
  {
    tab: "farm",
    element: '[data-tour="farm"]',
    title: "What to farm",
    description: "Each mechanic shows how the prices of its drops moved this week. Click one to see only its strategies; open a card for the full setup.",
  },
  {
    tab: null,
    element: '[data-tour="alerts"]',
    title: "Live alerts",
    description:
      "The bell counts alerts you can act on: a snipe, a craft that starts paying, a watched spread. Its 'All alerts & delivery' link sets sound, desktop popups and Discord.",
  },
  {
    tab: null,
    element: '[data-tour="account"]',
    title: "Your account",
    description:
      "Market data is shared by everyone here, but your Stash and Flip log are private to you. The gear opens Settings; reopen this guide anytime via 'Guide'.",
  },
];

/** The steps a mode can show: a step on a hidden tab or tool would wait on an element that never renders. */
export function tourStepsFor(mode: NavMode): TourStep[] {
  return TOUR_STEPS.filter((s) => {
    if (s.tab === null) return true;
    if (!isTabVisible(mode, s.tab)) return false;
    const tools = visibleTools(mode, s.tab);
    return s.tool === undefined || tools === undefined || tools.some((t) => t.id === s.tool);
  }).map((s) => (mode === "beginner" && s.beginnerDescription ? { ...s, description: s.beginnerDescription } : s));
}

const WAIT_MS = 4000;

/** Resolves once `selector` is in the DOM (the tab switch renders asynchronously). */
function waitForElement(selector: string): Promise<void> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (document.querySelector(selector)) return resolve();
      if (performance.now() - started > WAIT_MS) {
        return reject(new Error(`tour target ${selector} did not render within ${WAIT_MS} ms`));
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

/**
 * Step `delta` (±1) from the active step: open the step's tab, wait for its target, then
 * highlight. A target that never renders ends the tour with a console error rather than pointing
 * at nothing.
 */
export function stepTour(tour: Driver, delta: 1 | -1, go: (tab: TabId, tool?: string) => void, steps: readonly TourStep[]): void {
  const index = (tour.getActiveIndex() ?? 0) + delta;
  if (index < 0) return;
  const step = steps[index];
  if (!step) return tour.destroy();
  if (step.tab) go(step.tab, step.tool);
  // The user may close the tour while the tab renders; a closed tour must stay closed.
  waitForElement(step.element).then(
    () => {
      if (tour.isActive()) tour.moveTo(index);
    },
    (error: unknown) => {
      if (!tour.isActive()) return;
      console.error("[onboarding]", error);
      tour.destroy();
    },
  );
}
