/*
 * Vendor-screen namespace: every line an equipment item on a vendor can show that a vendor search
 * must not accidentally hit — rolled prefix/suffix lines of the craftable classes, desecrated and
 * essence-only lines, base implicits — plus base type and item class names. Deliberately a
 * superset: an extra line only makes a fragment more conservative, a missing one makes it unsafe.
 * ITEM_TEXT_BOILERPLATE is added at runtime by the namespace builder, not duplicated here.
 */
import { CRAFTABLE_CLASS_IDS, cleanTemplate, type Repoe, type RepoeMod } from "../repoe/snapshot";
import { generalizeLine } from "../../core/tools/regex/pools/template";
import type { Stamp, VendorData } from "../../core/tools/regex/pools/schema";

const ROLLED_DOMAINS = new Set(["item", "misc"]);
const SIDES = new Set(["prefix", "suffix"]);

function addLines(out: Set<string>, m: RepoeMod | undefined): void {
  if (!m?.text) return;
  for (const raw of cleanTemplate(m.text).split("\n")) {
    const line = raw.trim();
    if (line.length > 0) out.add(generalizeLine(line).template);
  }
}

function classNames(repoe: Repoe): Map<string, string> {
  const out = new Map<string, string>();
  for (const id of CRAFTABLE_CLASS_IDS) {
    const name = repoe.item_classes[id]?.name?.trim();
    if (!name) throw new Error(`RePoE item_classes has no display name for craftable class "${id}"`);
    out.set(id, name);
  }
  return out;
}

function poolLines(repoe: Repoe, names: ReadonlySet<string>, out: Set<string>): void {
  for (const className of names) {
    const combos = repoe.mods_by_base[className];
    if (!combos) throw new Error(`RePoE mods_by_base has no craftable class "${className}"`);
    for (const entry of Object.values(combos)) {
      for (const [side, families] of Object.entries(entry.mods)) {
        if (!SIDES.has(side)) continue;
        for (const ids of Object.values(families)) {
          for (const modId of Object.keys(ids)) {
            const m = repoe.mods[modId];
            if (m && ROLLED_DOMAINS.has(m.domain)) addLines(out, m);
          }
        }
      }
    }
  }
}

function implicitIds(base: Record<string, unknown>): string[] {
  const raw = base.implicits;
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((x) => typeof x !== "string")) throw new Error("base_items implicits is not a string array");
  return raw as string[];
}

export function buildVendor(repoe: Repoe, stamp: Stamp): VendorData {
  const classes = classNames(repoe);
  const lines = new Set<string>();
  poolLines(repoe, new Set(classes.values()), lines);
  for (const m of Object.values(repoe.mods)) {
    const desecrated = m.domain === "desecrated" && SIDES.has(m.generation_type) && m.spawn_weights.some((w) => w.weight > 0);
    const essence = m.domain === "item" && m.is_essence_only && SIDES.has(m.generation_type);
    if (desecrated || essence) addLines(lines, m);
  }
  const bases = new Set<string>();
  for (const b of Object.values(repoe.base_items)) {
    const name = b.name?.trim();
    if (!classes.has(b.item_class) || b.release_state !== "released" || !name) continue;
    bases.add(name);
    for (const id of implicitIds(b)) addLines(lines, repoe.mods[id]);
  }
  return { stamp, lines: [...lines].sort(), bases: [...bases].sort(), classes: [...new Set(classes.values())].sort() };
}
