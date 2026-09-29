/*
 * The Regex tab's selections mirrored into sessionStorage, so switching to another app tab and back
 * (which unmounts the tool) keeps every Want/Avoid mark. Per browser tab and session only — presets
 * and share links are the durable forms. Parsing is pure so the node tests cover it.
 */
import { PricePresetParamsSchema, type PricePresetParams } from "../../../lib/tools/regexContract";
import {
  JewelSelectionSchema,
  RelicSelectionSchema,
  TabletSelectionSchema,
  VendorSelectionSchema,
  WaystoneSelectionSchema,
  type PoolTabSelection,
  type VendorSelection,
} from "../../../lib/tools/regexPoolContract";

export const SESSION_KEY = "tools-regex-selections";

export interface RegexToolState {
  waystone: PoolTabSelection;
  tablet: PoolTabSelection;
  relic: PoolTabSelection;
  jewel: PoolTabSelection;
  vendor: VendorSelection;
  price: PricePresetParams;
}

const SCHEMAS = {
  waystone: WaystoneSelectionSchema,
  tablet: TabletSelectionSchema,
  relic: RelicSelectionSchema,
  jewel: JewelSelectionSchema,
  vendor: VendorSelectionSchema,
  price: PricePresetParamsSchema,
} as const;

export interface RestoredState {
  patch: Partial<RegexToolState>;
  /** Stored entries that no longer parse (schema changed) — reported, then replaced. */
  problems: string[];
}

/** Stored JSON → the entries that still parse; anything else is named in `problems`. */
export function parseStoredState(raw: string | null): RestoredState {
  if (raw === null) return { patch: {}, problems: [] };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error: unknown) {
    return { patch: {}, problems: [`stored regex state is not JSON: ${error instanceof Error ? error.message : String(error)}`] };
  }
  if (typeof json !== "object" || json === null) return { patch: {}, problems: ["stored regex state is not an object"] };
  const record = json as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [tab, schema] of Object.entries(SCHEMAS)) {
    if (!(tab in record)) continue;
    const parsed = schema.safeParse(record[tab]);
    if (parsed.success) patch[tab] = parsed.data;
    else problems.push(`${tab}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
  }
  return { patch: patch as Partial<RegexToolState>, problems };
}
