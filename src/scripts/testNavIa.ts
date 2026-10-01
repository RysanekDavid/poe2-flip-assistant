/* The job-based nav of 2026-10-01: Home, grouped strip, Wealth → Stash, Patches in Learn, Alerts and
 * Settings in the header, Beginner "More tools" and out-of-mode banners, and Home's live picks.
 * Pure — no DB, no network. Run: npm run test:learn (runWithTestEnv nav-ia). */
import assert from "node:assert/strict";
import {
  FOLDED_TABS,
  HEADER_TABS,
  NAV_ORDER,
  TAB_GROUP,
  TAB_IDS,
  TAB_REDIRECTS,
  followRenames,
  tabMeta,
  type TabId,
} from "../components/shell/tabRegistry";
import { BEGINNER_TABS, defaultTabFor, isTabVisible, moreTabs, navTabs, parseModeRoute, subTabsFor } from "../lib/navMode";
import { badgeText, hiddenPageName } from "../components/shell/headerText";
import { runHomePickCases } from "./homePickCases";
import { assertPanelExport } from "./tools/toolsTestKit";

const pass = (what: string): void => console.log(`PASS  ${what}`);

/** Every old link the restructure retired, as a browser would ask for it, and where it lands. */
const OLD_LINKS: ReadonlyArray<{ asked: [string, string | null]; lands: [TabId, string | null]; renamed: string[] }> = [
  { asked: ["wealth", null], lands: ["stash", "worth"], renamed: ["tab=wealth"] },
  { asked: ["wealth", "worth"], lands: ["stash", "worth"], renamed: ["tab=wealth"] },
  { asked: ["wealth", "sell"], lands: ["stash", "sell"], renamed: ["tab=wealth"] },
  { asked: ["patches", null], lands: ["learn", "patches"], renamed: ["tab=patches"] },
  { asked: ["patches", "bogus"], lands: ["learn", "patches"], renamed: ["tab=patches", "tool=bogus"] },
  { asked: ["alerts", null], lands: ["alerts", null], renamed: [] },
  { asked: ["settings", null], lands: ["settings", "account"], renamed: [] },
  { asked: ["settings", "account"], lands: ["settings", "account"], renamed: [] },
  { asked: ["settings", "notify"], lands: ["settings", "notify"], renamed: [] },
  { asked: ["settings", "mode"], lands: ["settings", "mode"], renamed: [] },
  { asked: ["settings", "system"], lands: ["settings", "system"], renamed: [] },
  { asked: ["exchange", null], lands: ["flips", null], renamed: ["tab=exchange"] },
  { asked: ["market", "board"], lands: ["trade", "opportunities"], renamed: ["tab=market", "tool=board"] },
];

function testOldLinks(): void {
  for (const { asked, lands, renamed } of OLD_LINKS) {
    const followed = followRenames(asked[0], asked[1]);
    assert.deepEqual(followed.renamed, renamed, `?tab=${asked[0]}&tool=${asked[1]}: renamed params`);
    const route = parseModeRoute("advanced", followed.tab, followed.tool);
    assert.deepEqual([route.tab, route.tool], lands, `?tab=${asked[0]}&tool=${asked[1]} lands on ${lands.join(" › ")}`);
    assert.deepEqual(route.rejected, [], `?tab=${asked[0]}&tool=${asked[1]} is never rejected`);
  }
  // Alerts and Settings are header pages: every mode reaches them without a banner
  for (const tab of HEADER_TABS) assert.deepEqual(parseModeRoute("beginner", tab, null).hidden, [], `${tab} is in every mode`);
  assert.deepEqual(parseModeRoute("beginner", "settings", "notify"), { tab: "settings", tool: "notify", rejected: [], hidden: [] });
  const stash = followRenames("wealth", "sell");
  assert.deepEqual(parseModeRoute("beginner", stash.tab, stash.tool), { tab: "stash", tool: "sell", rejected: [], hidden: ["tab=stash"] }, "a beginner's old Wealth link opens Stash under the banner");
  const patches = followRenames("patches", null);
  assert.deepEqual(parseModeRoute("beginner", patches.tab, patches.tool), { tab: "learn", tool: "patches", rejected: [], hidden: [] }, "Patch notes is a beginner tool");
  for (const key of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
    assert.deepEqual(followRenames(key, null), { tab: key, tool: null, renamed: [] }, `?tab=${key} is no redirect (own keys only)`);
    assert.deepEqual(parseModeRoute("advanced", key, null).rejected, [`tab=${key}`]);
  }
  for (const [from, tool] of FOLDED_TABS) {
    const to = TAB_REDIRECTS.get(from);
    assert.ok(to !== undefined, `folded tab ${from} is also a tab redirect`);
    assert.ok(tabMeta(to).tools?.some((t) => t.id === tool), `folded ${from} → ${to} › ${tool} is a registry tool`);
  }
  pass("old links: ?tab=wealth(&tool) → stash, ?tab=patches → learn › patches, alerts/settings(+tools) still route in both modes, prototype keys refused");
}

function testStrip(): void {
  const strip = [...NAV_ORDER, ...HEADER_TABS, "coach"];
  assert.deepEqual([...strip].sort(), [...TAB_IDS].sort(), "strip + header + Coach cover every tab exactly once");
  assert.equal(new Set(strip).size, strip.length);
  assert.deepEqual(NAV_ORDER, ["home", "farm", "flips", "craft", "trade", "stash", "regex", "learn"]);
  const runs = NAV_ORDER.map((id) => TAB_GROUP[id]).filter((g, i, all) => i === 0 || all[i - 1] !== g);
  assert.deepEqual(runs, ["home", "earn", "items", "tools"], "Home | Farm Flips Craft | Trade Stash | Regex Learn: each group one run");
  assert.deepEqual(BEGINNER_TABS, NAV_ORDER.filter((id) => BEGINNER_TABS.includes(id)), "beginner strip keeps the nav order");
  assert.deepEqual(navTabs("beginner").map((t) => t.id), ["home", "farm", "trade", "learn", "coach"]);
  assert.deepEqual(moreTabs("beginner").map((t) => t.id), ["flips", "craft", "stash", "regex"], "More tools lists every strip tab a beginner lacks");
  assert.deepEqual(moreTabs("advanced"), []);
  for (const t of moreTabs("beginner")) assert.ok(t.hint.length > 0, `${t.id} has a one-line hint for More tools`);
  assert.equal(defaultTabFor("beginner"), "home");
  assert.equal(defaultTabFor("advanced"), "home");
  assert.equal(subTabsFor("advanced", "home", "member"), null, "Home has no sub-tab bar");
  for (const tab of TAB_IDS) assert.ok(isTabVisible("advanced", tab), `${tab} visible in advanced`);
  assert.equal(tabMeta("stash").label, "Stash");
  assert.deepEqual(tabMeta("learn").tools?.map((t) => t.id), ["what", "currency", "atlas", "patches"]);
  assert.equal(tabMeta("trade").tools?.[0]?.id, "price", "Trade opens on Price check");
  pass("strip: Home first, four job groups, header pages + Coach apart, beginner = Home/Farm/Trade/Learn + More tools");
}

function testBannerAndBadge(): void {
  assert.equal(hiddenPageName("flips", null, ["tab=flips"]), "Flips");
  assert.equal(hiddenPageName("trade", "opportunities", ["tool=opportunities"]), "Trade › Opportunities");
  assert.equal(hiddenPageName("craft", "moves", ["tab=craft"]), "Craft", "a hidden tab names the tab, not its tool");
  assert.equal(badgeText(1), "1");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
  assert.equal(badgeText(12_345), "99+", "the bell badge never grows past three characters");
  pass("Advanced banner names the page; bell badge caps at 99+");
}

function testWiring(): void {
  assertPanelExport("src/components/patches/PatchesBoard.tsx", "PatchesBoard", "src/components/shell/tabs/LearnTab.tsx");
  assertPanelExport("src/components/shell/tabs/HomeTab.tsx", "HomeTab", "src/components/shell/AppShell.tsx");
  assertPanelExport("src/components/shell/tabs/StashTab.tsx", "StashTab", "src/components/shell/AppShell.tsx");
  assertPanelExport("src/components/shell/AdvancedBanner.tsx", "AdvancedBanner", "src/components/shell/AppShell.tsx");
  assertPanelExport("src/components/shell/MoreTools.tsx", "MoreTools", "src/components/shell/TabNav.tsx");
  pass("wiring: Patch notes in Learn, Home + Stash + Advanced banner in the shell, More tools in the strip");
}

testOldLinks();
testStrip();
testBannerAndBadge();
testWiring();
runHomePickCases();
