/* Pure preset helpers for the PresetBar (kept out of the .tsx so the node tests can import them). */
import type { Preset, PresetParams } from "../../../lib/tools/regexContract";
import type { RegexTab } from "../../../lib/tools/regexPoolContract";

/** One-line summary for the chip tooltip. */
export function describePreset(p: PresetParams): string {
  switch (p.tab) {
    case "price":
      return `${p.mode === "keep" ? "keep ≥" : "trash <"} ${p.minDiv} Div · ${p.categories.length} categories${p.includeUniques ? " + uniques" : ""}`;
    case "vendor":
      return `vendor · ${p.match} · ${p.classes.length > 0 ? p.classes.join(", ") : "every class"}`;
    default: {
      const states = Object.values(p.mods);
      const want = states.filter((s) => s === "want").length;
      return `${want} want · ${states.length - want} avoid · ${p.match}`;
    }
  }
}

/** Presets visible on a sub-tab: its own, plus unparseable rows so they can still be deleted. */
export const presetsForTab = (presets: readonly Preset[], tab: RegexTab): Preset[] =>
  presets.filter((p) => p.params === null || p.params.tab === tab);
