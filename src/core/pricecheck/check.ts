import type { TradeCred } from "../../api/tradeClient";
import type { LiveGate, PriceCheckLiveResponse, PriceCheckResponse } from "../../lib/priceCheckContract";
import { shareQuery } from "../../lib/tools/shareItem";
import { parseItem, type ParsedItem } from "../itemParser";
import { readItemMeta } from "../tools/craftmoves/itemMeta";
import { NotAnItemError } from "../tools/craftmoves/moves";
import { classifyPaste, type PasteClass } from "./classify";
import { noHint } from "./hint";
import { liveRare, priceRare } from "./rare";
import type { PriceCheckServices } from "./services";
import { priceStackable } from "./stackable";
import { liveUnique, priceUnique } from "./unique";

/**
 * Paste → what it is worth and how to sell it. The base check never spends trade2 budget; the live
 * value is a separate, explicit call that spends exactly one search + one fetch.
 */

/** The live value was asked for where the panel would have disabled the button. */
export class LiveNotAllowedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "LiveNotAllowedError";
  }
}

function readPaste(text: string, s: PriceCheckServices): { parsed: ParsedItem; cls: PasteClass } {
  const parsed = parseItem(text);
  if (!parsed) throw new NotAnItemError();
  return { parsed, cls: classifyPaste(parsed, readItemMeta(text), text, (n) => s.isExchangeItem(n)) };
}

/** Whether the live button may run for this paste, and the reason shown when it may not. */
export function liveGate(cls: PasteClass, s: Pick<PriceCheckServices, "league" | "defaultLeague" | "hasCred">): LiveGate {
  if (cls.kind === "currency") return { allowed: false, reason: "exchange items are priced from the Currency Exchange — no search needed" };
  if (cls.kind === "other") return { allowed: false, reason: cls.reason };
  if (s.league !== s.defaultLeague) {
    return { allowed: false, reason: `live values search ${s.defaultLeague} — you are viewing ${s.league}` };
  }
  if (!s.hasCred) return { allowed: false, reason: "add your POESESSID in Settings to value live" };
  return { allowed: true, reason: null };
}

export async function priceCheck(text: string, s: PriceCheckServices): Promise<PriceCheckResponse> {
  const { parsed, cls } = readPaste(text, s);
  const common = {
    league: s.league,
    exPerDiv: s.rates.rates.exaltPerDivine,
    live: liveGate(cls, s),
    craftQuery: cls.kind === "currency" ? null : shareQuery(text),
  };
  switch (cls.kind) {
    case "currency":
      return { ...common, kind: "currency", ...(await priceStackable(cls.name, cls.qty, s)) };
    case "unique":
      return { ...common, kind: "unique", ...(await priceUnique(cls.name, cls.baseType, s)) };
    case "rare":
      return { ...common, kind: "rare", ...(await priceRare(parsed, s)) };
    case "other":
      return {
        ...common,
        kind: "other",
        name: cls.name,
        baseType: cls.baseType,
        icon: null,
        qty: 1,
        unitDiv: null,
        totalDiv: null,
        confidence: { source: null, samples: null, ageMin: null },
        hint: noHint(cls.reason),
        tradeUrl: null,
        warnings: [],
        reason: cls.reason,
      };
  }
}

/** One trade2 search + one fetch with the caller's cookie. The route checks the cookie first. */
export async function priceCheckLive(text: string, s: PriceCheckServices, cred: TradeCred): Promise<PriceCheckLiveResponse> {
  const { cls } = readPaste(text, s);
  const gate = liveGate(cls, { ...s, hasCred: true });
  if (!gate.allowed) throw new LiveNotAllowedError(gate.reason ?? "live value unavailable for this item");
  switch (cls.kind) {
    case "unique":
      return liveUnique(cls.name, cls.baseType, s, cred);
    case "rare":
      return liveRare(text, s, cred);
    case "currency":
    case "other":
      throw new Error(`liveGate allowed a ${cls.kind} paste`);
  }
}
