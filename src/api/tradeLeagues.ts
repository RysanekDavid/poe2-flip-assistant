import axios, { AxiosError } from "axios";
import { z } from "zod";
import { config } from "../config/env";
import { tradeMetaUserAgent } from "./tradeMeta";
import { retryAfterMs, type HeaderBag } from "./tradeRateLimit";

/**
 * GGG's own league list: the public trade2 reference endpoint. It is the ORIGIN of "which PoE2
 * leagues exist right now" — poe.ninja and poe2scout only re-serve it — so it is the one source
 * the league picker, the switch validator and the league watcher read.
 *
 * What it does NOT say: which league is the current challenge league (no flag) or when a league
 * started (no dates). Both are derived from our own Currency Exchange history instead
 * (core/leagueDerivation), and labelled as derived wherever they are shown.
 */
export const TRADE2_LEAGUES_URL = "https://www.pathofexile.com/api/trade2/data/leagues";

/** The realm trade2 tags PoE2 leagues with; anything else in the payload is not ours. */
const POE2_REALM = "poe2";

const TradeLeaguesSchema = z
  .object({
    result: z.array(
      z
        .object({
          id: z.string(),
          realm: z.string().nullish(),
          text: z.string().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

/** A trade2 leagues request GGG refused or that failed in transit; `retryAfterMs` set on a 429. */
export class TradeLeaguesError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "TradeLeaguesError";
  }
}

/**
 * Raw `/data/leagues` payload → PoE2 league ids, GGG's order kept, duplicates dropped.
 *
 * `id` is the exact string trade2 and the exchange digest key leagues by, so that is what the app
 * stores; `text` is display only. An empty list is a shape failure, not "no leagues": Standard
 * always exists, so zero rows means the endpoint changed, and serving that would empty the picker.
 */
export function parseTradeLeagues(raw: unknown): string[] {
  const parsed = TradeLeaguesSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `trade2 league list shape mismatch: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}` +
        ` raw[0:300]=${JSON.stringify(raw).slice(0, 300)}`,
    );
  }
  const names: string[] = [];
  for (const row of parsed.data.result) {
    if (row.realm != null && row.realm !== POE2_REALM) continue;
    const name = row.id.trim();
    if (name !== "" && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  if (names.length === 0) throw new Error("trade2 league list has no poe2 leagues — endpoint shape changed?");
  return names;
}

/**
 * One GET of GGG's league list, honest UA (tool + DATA_SOURCE_CONTACT, refused without one).
 *
 * Not routed through the search/fetch governor: /data/* is a separate, static reference endpoint
 * (tradeMeta reads its siblings the same way). Politeness comes from the caller instead — one
 * request per cache TTL across both processes, and a 429's Retry-After honoured to the second.
 */
export async function fetchTradeLeagues(): Promise<string[]> {
  const userAgent = tradeMetaUserAgent(config.dataSourceContact);
  let raw: unknown;
  try {
    const res = await axios.get(TRADE2_LEAGUES_URL, { timeout: 20_000, headers: { "User-Agent": userAgent } });
    raw = res.data;
  } catch (err) {
    const ax = err as AxiosError;
    const status = ax.response?.status;
    const retry = status === 429 ? retryAfterMs((ax.response?.headers ?? {}) as HeaderBag) : null;
    throw new TradeLeaguesError(`trade2 league list fetch failed (${status ?? "no-status"}): ${ax.message}`, retry);
  }
  return parseTradeLeagues(raw);
}
