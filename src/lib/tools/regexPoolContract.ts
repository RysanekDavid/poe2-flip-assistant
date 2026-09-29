/*
 * Contract for the Regex tool's client-side tabs (Waystone, Tablet, Relic, Jewel, Vendor): the
 * per-tab selection a panel edits, stores in a preset and shares via `#regex=…`, plus the enums
 * of what the composer reports back. Shared by UI, presets and tests so none of them can drift.
 * Price stays in regexContract.ts (server-built from live prices).
 */
import { z } from "zod";
import { RARITIES } from "../../core/tools/regex/pools/headers";

export const REGEX_TABS = ["waystone", "tablet", "relic", "jewel", "vendor", "price"] as const;
export type RegexTab = (typeof REGEX_TABS)[number];

export const MOD_STATES = ["want", "avoid"] as const;
export type ModState = (typeof MOD_STATES)[number];
export const MATCH_MODES = ["any", "all"] as const;
export type MatchMode = (typeof MATCH_MODES)[number];
export const CORRUPTED_FILTERS = ["any", "only", "exclude"] as const;
export type CorruptedFilter = (typeof CORRUPTED_FILTERS)[number];
/** Tablet band ids as regex/tablet.json names them (one per base type). */
export const TABLET_TYPES = ["breach", "expedition", "delirium", "ritual", "generic", "map_boss", "abyss", "incursion"] as const;
export const WAYSTONE_TIER_MIN = 1;
export const WAYSTONE_TIER_MAX = 16;

export const TOKEN_KINDS = ["mod", "threshold", "avoid", "property", "tier", "rarity", "corrupted", "type"] as const;
export type TokenKind = (typeof TOKEN_KINDS)[number];

export const POOL_WARNING_CODES = [
  "multi-string",
  "all-split",
  "rounded",
  "anchors",
  "verify-in-game",
  "masked",
  "unverified-header",
  "negation-scope",
  "unknown-mod",
  "threshold-ignored",
  "uncovered",
] as const;
export type PoolWarningCode = (typeof POOL_WARNING_CODES)[number];

// Bounds keep a decoded share URL or a stored preset from making the composer do unbounded work.
const MAX_SELECTED = 400;
const VALUE_MAX = 100_000;
const intValue = z.number().int().min(0).max(VALUE_MAX);

export const ValueRangeSchema = z
  .object({ min: intValue, max: intValue.nullable() })
  .refine((r) => r.max === null || r.min <= r.max, "min is above max");
export type ValueRange = z.infer<typeof ValueRangeSchema>;

/** Threshold key: mod id, line index into mod.lines, number slot on that line. */
export const THRESHOLD_KEY = /^([A-Za-z0-9_]{1,80})#(\d{1,2})\.(\d{1,2})$/;
export const thresholdKey = (modId: string, line: number, slot: number): string => `${modId}#${line}.${slot}`;

export function parseThresholdKey(key: string): { modId: string; line: number; slot: number } {
  const m = THRESHOLD_KEY.exec(key);
  if (!m?.[1] || m[2] === undefined || m[3] === undefined) throw new Error(`malformed threshold key "${key}"`);
  return { modId: m[1], line: Number(m[2]), slot: Number(m[3]) };
}

const boundedRecord = <T extends z.ZodTypeAny>(key: z.ZodString, value: T) =>
  z.record(key, value).refine((r) => Object.keys(r).length <= MAX_SELECTED, `more than ${MAX_SELECTED} entries`);

const poolSelectionBase = {
  mods: boundedRecord(z.string().min(1).max(80), z.enum(MOD_STATES)),
  match: z.enum(MATCH_MODES),
  /** Minimum/maximum on a wanted mod's number; ignored for mods not marked "want". */
  thresholds: boundedRecord(z.string().regex(THRESHOLD_KEY), ValueRangeSchema),
  /** Header property ranges by header id (headers.ts), e.g. itemRarity ≥ 40. */
  props: boundedRecord(z.string().min(1).max(40), ValueRangeSchema),
  /** Empty = any rarity. */
  rarity: z.array(z.enum(RARITIES)).max(RARITIES.length),
  corrupted: z.enum(CORRUPTED_FILTERS),
};

const tierRange = z
  .object({ min: z.number().int().min(WAYSTONE_TIER_MIN).max(WAYSTONE_TIER_MAX), max: z.number().int().min(WAYSTONE_TIER_MIN).max(WAYSTONE_TIER_MAX) })
  .refine((r) => r.min <= r.max, "tier min is above max");

export const WaystoneSelectionSchema = z.object({ tab: z.literal("waystone"), ...poolSelectionBase, tier: tierRange.nullable() });
/** `types` empty = every tablet type. */
export const TabletSelectionSchema = z.object({ tab: z.literal("tablet"), ...poolSelectionBase, types: z.array(z.enum(TABLET_TYPES)).max(TABLET_TYPES.length) });
export const RelicSelectionSchema = z.object({ tab: z.literal("relic"), ...poolSelectionBase });
export const JewelSelectionSchema = z.object({ tab: z.literal("jewel"), ...poolSelectionBase });

const optionalMin = intValue.nullable();
export const RESISTANCES = ["fire", "cold", "lightning", "chaos"] as const;

/** Vendor-screen filters; every null / empty field means "don't filter on it". */
export const VendorSelectionSchema = z.object({
  tab: z.literal("vendor"),
  match: z.enum(MATCH_MODES),
  quality: optionalMin,
  movementSpeed: optionalMin,
  resistances: z.object({ fire: optionalMin, cold: optionalMin, lightning: optionalMin, chaos: optionalMin }),
  /** Minimum "+# to Level of all … Skills". */
  plusSkills: optionalMin,
  sockets: z.number().int().min(1).max(6).nullable(),
  /** Item class display names as vendor.json lists them. */
  classes: z.array(z.string().min(1).max(40)).max(40),
  itemLevel: ValueRangeSchema.nullable(),
  requiredLevel: ValueRangeSchema.nullable(),
  rarity: z.array(z.enum(RARITIES)).max(RARITIES.length),
});

/** Order matters only for readability; the union discriminates on `tab`. */
export const TAB_SELECTION_SCHEMAS = [
  WaystoneSelectionSchema,
  TabletSelectionSchema,
  RelicSelectionSchema,
  JewelSelectionSchema,
  VendorSelectionSchema,
] as const;
export const TabSelectionSchema = z.discriminatedUnion("tab", [...TAB_SELECTION_SCHEMAS]);
export type TabSelection = z.infer<typeof TabSelectionSchema>;
export type WaystoneSelection = z.infer<typeof WaystoneSelectionSchema>;
export type TabletSelection = z.infer<typeof TabletSelectionSchema>;
export type RelicSelection = z.infer<typeof RelicSelectionSchema>;
export type JewelSelection = z.infer<typeof JewelSelectionSchema>;
export type VendorSelection = z.infer<typeof VendorSelectionSchema>;
/** Selections the pool composer takes (everything but Vendor and Price). */
export type PoolTabSelection = WaystoneSelection | TabletSelection | RelicSelection | JewelSelection;

/** A fresh selection for a pool tab: nothing wanted, any rarity, corruption ignored. */
export function emptyPoolSelection<T extends PoolTabSelection["tab"]>(tab: T): Extract<PoolTabSelection, { tab: T }> {
  const base = { mods: {}, match: "any" as const, thresholds: {}, props: {}, rarity: [], corrupted: "any" as const };
  const byTab: { [K in PoolTabSelection["tab"]]: Extract<PoolTabSelection, { tab: K }> } = {
    waystone: { tab: "waystone", ...base, tier: null },
    tablet: { tab: "tablet", ...base, types: [] },
    relic: { tab: "relic", ...base },
    jewel: { tab: "jewel", ...base },
  };
  return byTab[tab];
}

/* ---- composer output (client-side, but typed here so UI and tests share it) ---- */

export const PoolWarningSchema = z.object({ code: z.enum(POOL_WARNING_CODES), label: z.string(), detail: z.string() });
export type PoolWarning = z.infer<typeof PoolWarningSchema>;

/* ---- share links: #regex=<base64url(JSON)> ---- */

export const SHARE_HASH_KEY = "regex";
/** A share link is a URL fragment; past this it no longer fits comfortably in a chat message. */
export const SHARE_MAX_CHARS = 6000;
const SHARE_VERSION = 1;
const ShareEnvelopeSchema = z.object({ v: z.literal(SHARE_VERSION), s: TabSelectionSchema });

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(encoded: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(encoded)) throw new Error("share code contains characters outside base64url");
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

/** Selection → URL-fragment payload (without the `#regex=` prefix). Throws when it would be too long. */
export function encodeShare(selection: TabSelection): string {
  const code = toBase64Url(JSON.stringify({ v: SHARE_VERSION, s: TabSelectionSchema.parse(selection) }));
  if (code.length > SHARE_MAX_CHARS) throw new Error(`share code is ${code.length} chars — over the ${SHARE_MAX_CHARS}-char limit`);
  return code;
}

/** Payload → selection. Throws a readable Error for anything malformed; never returns partial data. */
export function decodeShare(code: string): TabSelection {
  if (code.length === 0) throw new Error("share code is empty");
  if (code.length > SHARE_MAX_CHARS) throw new Error(`share code is ${code.length} chars — over the ${SHARE_MAX_CHARS}-char limit`);
  let json: unknown;
  try {
    json = JSON.parse(fromBase64Url(code));
  } catch (error: unknown) {
    throw new Error(`share code is not valid base64url JSON: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  const parsed = ShareEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`share code does not describe a regex selection: ${first ? `${first.path.join(".")}: ${first.message}` : "invalid"}`);
  }
  return parsed.data.s;
}
