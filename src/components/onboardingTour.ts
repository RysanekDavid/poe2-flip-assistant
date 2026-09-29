import type { Driver } from "driver.js";
import type { TabId } from "./shell/tabRegistry";

interface TourStep {
  /** Tab the element lives on; null = part of the always-visible shell. */
  tab: TabId | null;
  element: string;
  title: string;
  description: string;
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
      "Exchange = in-game Ange flips. Market = trade-site demand and snipes. Farm = what to run. Craft, Wealth and Regex are your tools. Every tab has its own link — bookmark or share it.",
  },
  {
    tab: "farm",
    element: '[data-tour="farm"]',
    title: "What to farm now",
    description: "In-game activities ranked by how hard their drop basket is pumping. HOT = grind it and sell into the spike.",
  },
  {
    tab: "exchange",
    element: '[data-tour="alerts"]',
    title: "Live alerts",
    description:
      "Fires when a snipe, craft margin, watched spread or price spike clears its threshold. Sound, desktop popups and Discord are set in Alerts or Settings → Notifications.",
  },
  {
    tab: null,
    element: '[data-tour="account"]',
    title: "Your account",
    description:
      "Market data is shared by everyone here, but your Wealth and Flip log are private to you. Reopen this guide anytime via 'Guide'.",
  },
];

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
export function stepTour(tour: Driver, delta: 1 | -1, go: (tab: TabId) => void): void {
  const index = (tour.getActiveIndex() ?? 0) + delta;
  if (index < 0) return;
  const step = TOUR_STEPS[index];
  if (!step) return tour.destroy();
  if (step.tab) go(step.tab);
  waitForElement(step.element).then(
    () => tour.moveTo(index),
    (error: unknown) => {
      console.error("[onboarding]", error);
      tour.destroy();
    },
  );
}
