/*
 * UI groups for each regex tab. Waystone groups follow what the mod does to the player's run
 * (monster offence/defence, player penalties, ground effects); the other tabs group by where the
 * mod can roll (tablet type, relic size, jewel colour), because that is how players browse them.
 * Anything unclassified lands in `other` with a warning — testRegexPools asserts there is none.
 */
import type { PoolGroup, PoolTab } from "../../core/tools/regex/pools/schema";

export interface GroupInput {
  family: string;
  desecrated: boolean;
  bands: ReadonlySet<string>;
  /** Tag sets (mods_by_base combo keys) of every combo the mod spawns in. */
  combos: ReadonlySet<string>;
}

export const OTHER_GROUP: PoolGroup = { id: "other", label: "Other (unclassified)" };

export const TAB_GROUPS: Readonly<Record<PoolTab, readonly PoolGroup[]>> = {
  waystone: [
    { id: "offence", label: "Monster offence" },
    { id: "defence", label: "Monster defence" },
    { id: "player", label: "Player penalties" },
    { id: "ground", label: "Ground effects" },
    { id: "desecrated", label: "Desecrated" },
  ],
  tablet: [
    { id: "shared", label: "Any tablet" },
    { id: "breach", label: "Breach" },
    { id: "expedition", label: "Expedition" },
    { id: "delirium", label: "Delirium" },
    { id: "ritual", label: "Ritual" },
    { id: "generic", label: "Irradiated" },
    { id: "map_boss", label: "Overseer" },
    { id: "abyss", label: "Abyss" },
    { id: "incursion", label: "Temple" },
  ],
  relic: [
    { id: "small", label: "Small relics" },
    { id: "medium", label: "Medium relics" },
    { id: "large", label: "Large relics" },
    { id: "shared", label: "Several sizes" },
  ],
  jewel: [
    { id: "ruby", label: "Ruby" },
    { id: "emerald", label: "Emerald" },
    { id: "sapphire", label: "Sapphire" },
    { id: "hybrid", label: "Several colours" },
    { id: "radius", label: "Time-Lost only" },
    { id: "desecrated", label: "Desecrated" },
  ],
};

const WAYSTONE_RULES: ReadonlyArray<[RegExp, string]> = [
  [/^MapPlayer/, "player"],
  [/^MapSpread/, "ground"],
  [/^MapMonsters?(LifeIncrease|Armoured|EnergyShield|Evasive|ElementalResistances|StunAilmentThreshold|BaseSelfCriticalMultiplier|CurseEffectOnSelf)/, "defence"],
  [/^MapMonsters?(Damage|CritIncrease|Accuracy|ArmourBreak|Bleeding|Poisoning|SpeedIncrease|ElementalPenetration|StunBuildup|ElementAilmentChance)/, "offence"],
];

function waystoneGroup(input: GroupInput): string | null {
  if (input.desecrated) return "desecrated";
  return WAYSTONE_RULES.find(([re]) => re.test(input.family))?.[1] ?? null;
}

const TABLET_TYPES = ["breach", "expedition", "delirium", "ritual", "generic", "map_boss", "abyss", "incursion"];

function tabletGroup(input: GroupInput): string | null {
  if (input.bands.size === TABLET_TYPES.length) return "shared";
  const [only] = input.bands;
  return input.bands.size === 1 && only !== undefined && TABLET_TYPES.includes(only) ? only : null;
}

function relicGroup(input: GroupInput): string | null {
  if (input.bands.size > 1) return "shared";
  const [only] = input.bands;
  return only === "small" || only === "medium" || only === "large" ? only : null;
}

const COLOUR_TAGS: ReadonlyArray<[string, RegExp]> = [
  ["ruby", /^str(jewel|_radius_jewel)$/],
  ["emerald", /^dex(jewel|_radius_jewel)$/],
  ["sapphire", /^int(jewel|_radius_jewel)$/],
];

/** Colours of the single-colour combos a jewel mod rolls on; Diamond/Timeless carry all three. */
function jewelColours(combos: ReadonlySet<string>): Set<string> {
  const colours = new Set<string>();
  for (const combo of combos) {
    const tags = combo.split(",");
    const hits = COLOUR_TAGS.filter(([, re]) => tags.some((t) => re.test(t))).map(([c]) => c);
    if (hits.length === 1 && hits[0]) colours.add(hits[0]);
  }
  return colours;
}

function jewelGroup(input: GroupInput): string | null {
  if (input.desecrated) return "desecrated";
  if (!input.bands.has("jewel")) return input.bands.has("radius") ? "radius" : null;
  const colours = jewelColours(input.combos);
  if (colours.size > 1) return "hybrid";
  const [only] = colours;
  return only ?? null;
}

const GROUPERS: Readonly<Record<PoolTab, (input: GroupInput) => string | null>> = {
  waystone: waystoneGroup,
  tablet: tabletGroup,
  relic: relicGroup,
  jewel: jewelGroup,
};

/** Group id for a mod, or `other` (logged) when no rule claims it. */
export function groupOf(tab: PoolTab, input: GroupInput): string {
  const group = GROUPERS[tab](input);
  if (group !== null && TAB_GROUPS[tab].some((g) => g.id === group)) return group;
  console.warn(`[regex-data] ${tab} mod family ${input.family} matches no group rule (bands ${[...input.bands].join(",")}) → other`);
  return OTHER_GROUP.id;
}
