/**
 * Manual network probe (never in CI): does trade2 still answer /fetch/{listingId}?query={searchId}
 * when the search id is hours/days old? Snipe-outcome tracking (plan A) re-fetches alerted
 * listings with the query id stored at alert time; if stale ids are refused it must re-search
 * instead (plan B).
 *
 * Takes the newest SNIPE alert's card (valuation.comparablesUrl → search id, alerts.item_id →
 * listing id) and does ONE fetch with the owner's trade2 cred through tradeClient (governor, UA).
 * Run against a SCRATCH COPY of the DB (getDb migrates it and the governor writes to it), from the
 * directory whose .env.local holds the owner config:
 *   DB_PATH=<scratch>/poe2flip-copy.db npm run probe:fetch-stale
 * Exit 2 = precondition missing (no SNIPE alert / no owner cred), nothing was requested.
 */
import { config } from "../config/env";
import { z } from "zod";
import { getDb } from "../db/database";
import { credForUser } from "../auth/credForUser";
import { fetchListingsRaw } from "../api/tradeClient";
import { SnipeCardSchema } from "../lib/snipeCard";

const OWNER_ID = 1;
const LISTING_ID = /^[A-Za-z0-9]{16,128}$/;
const SEARCH_ID = /^[A-Za-z0-9]{3,32}$/;

const AlertRowSchema = z.object({
  id: z.number(),
  item_id: z.string(),
  details: z.string(),
  created_at: z.string(),
});

const FetchBodySchema = z.object({ result: z.array(z.unknown()) }).passthrough();
const ListingEntrySchema = z
  .object({ listing: z.object({ indexed: z.string().optional(), price: z.unknown().optional() }).passthrough() })
  .passthrough();

function preconditionMissing(reason: string): never {
  console.log(`NOT RUN — ${reason}`);
  process.exit(2);
}

/** trade2 page URL …/trade2/search/poe2/<league>/<searchId> → searchId. */
function searchIdFromUrl(url: string): string {
  const last = new URL(url).pathname.split("/").filter((s) => s !== "").pop() ?? "";
  if (!SEARCH_ID.test(last)) throw new Error(`comparablesUrl has no search id: ${url}`);
  return last;
}

function newestSnipe(): { alertId: number; listingId: string; searchId: string; createdAt: string } {
  const raw = getDb()
    .prepare("SELECT id, item_id, details, created_at FROM alerts WHERE type = 'SNIPE' AND details IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1")
    .get();
  if (raw == null) preconditionMissing(`no SNIPE alert with a stored card in ${config.dbPath}`);
  const row = AlertRowSchema.parse(raw);
  const card = SnipeCardSchema.parse(JSON.parse(row.details));
  if (!LISTING_ID.test(row.item_id)) throw new Error(`alert ${row.id}: item_id is not a listing id: ${row.item_id}`);
  return { alertId: row.id, listingId: row.item_id, searchId: searchIdFromUrl(card.valuation.comparablesUrl), createdAt: row.created_at };
}

function describeBody(body: unknown): void {
  const parsed = FetchBodySchema.safeParse(body);
  if (!parsed.success) {
    console.log(`body shape unexpected: ${JSON.stringify(body).slice(0, 400)}`);
    return;
  }
  const first = parsed.data.result[0];
  console.log(`result.length=${parsed.data.result.length}`);
  console.log(`result[0] is null: ${first === null}`);
  if (first === undefined) console.log("result[0] is absent (empty result array)");
  const entry = ListingEntrySchema.safeParse(first);
  if (entry.success) {
    console.log(`result[0].listing.indexed=${entry.data.listing.indexed ?? "?"} price=${JSON.stringify(entry.data.listing.price ?? null)}`);
  }
}

async function main(): Promise<void> {
  if (!/scratch|tmp|temp|copy/i.test(config.dbPath)) {
    throw new Error(`refusing to run against ${config.dbPath} — point DB_PATH at a scratch copy of the DB.`);
  }
  const snipe = newestSnipe();
  const cred = credForUser({ id: OWNER_ID, role: "owner" });
  if (cred == null) preconditionMissing("no owner trade2 cred (stored or POESESSID in .env.local)");

  // SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC with no zone marker
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(snipe.createdAt);
  const createdMs = Date.parse(hasZone ? snipe.createdAt : `${snipe.createdAt.replace(" ", "T")}Z`);
  const ageH = (Date.now() - createdMs) / 3_600_000;
  console.log(`alert id=${snipe.alertId} created_at=${snipe.createdAt} (age ≈ ${ageH.toFixed(1)} h)`);
  console.log(`listing=${snipe.listingId} query=${snipe.searchId} (comparables search id) cred source=${cred.source ?? "?"}`);
  try {
    const { status, body } = await fetchListingsRaw([snipe.listingId], snipe.searchId, cred);
    console.log(`HTTP ${status}`);
    describeBody(body);
  } catch (e) {
    // non-2xx: tradeClient's message carries the status and trade2's error body (never the cookie)
    console.log(`request failed: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
