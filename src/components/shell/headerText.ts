/*
 * Text the header chrome derives from the registry. PNG-free (unlike TopBar and AdvancedBanner) so
 * the node tests can pin it.
 */
import { tabMeta, type TabId } from "./tabRegistry";

/** A badge never grows past three characters, so a flood of alerts cannot push the header around. */
export const badgeText = (n: number): string => (n > 99 ? "99+" : String(n));

/** "Flips" or "Trade › Opportunities": the page a hidden param stands for, as the nav names it. */
export function hiddenPageName(tab: TabId, tool: string | null, hidden: readonly string[]): string {
  const meta = tabMeta(tab);
  const toolHidden = hidden.some((h) => h.startsWith("tool="));
  const toolLabel = toolHidden && tool !== null ? meta.tools?.find((t) => t.id === tool)?.label : undefined;
  return toolLabel ? `${meta.label} › ${toolLabel}` : meta.label;
}
