/* Capture ONE real trade2 search + fetch as a committed contract fixture (manual, network).
 * Run: npm run capture:trade2-fixture [-- "<league>"]
 * Unauthenticated, read-only: 1 search + 1 fetch (10 ids). Writes
 * src/scripts/fixtures/trade2-fetch-live.json, which testSnipe.ts contract-tests when present,
 * and prints the X-Rate-Limit-* headers seen. */
import axios from "axios";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const league = process.argv[2] ?? "Forbidden Rites";
const BASE = "https://www.pathofexile.com/api/trade2";
const headers = {
  "Content-Type": "application/json",
  "User-Agent": "poe2-flip-assistant/1.0 (contact: dawelich@gmail.com)",
};
const SearchSchema = z.object({ id: z.string(), result: z.array(z.string()), total: z.number() });

const rateHeaders = (h: Record<string, unknown>): string =>
  Object.entries(h)
    .filter(([k]) => /^x-rate-limit|^retry-after/i.test(k))
    .map(([k, v]) => `  ${k}: ${String(v)}`)
    .join("\n");

async function main(): Promise<void> {
  const query = {
    query: {
      status: { option: "securable" },
      stats: [{ type: "and", filters: [] }],
      filters: {
        type_filters: { filters: { category: { option: "armour.gloves" }, rarity: { option: "rare" } } },
        trade_filters: { filters: { indexed: { option: "1day" } } },
      },
    },
    sort: { indexed: "desc" },
  };
  const search = await axios.post(`${BASE}/search/poe2/${encodeURIComponent(league)}`, query, { headers, timeout: 20_000 });
  console.log(`search ${search.status}\n${rateHeaders(search.headers)}`);
  const s = SearchSchema.parse(search.data);
  const ids = s.result.slice(0, 10);
  if (ids.length === 0) throw new Error(`search returned no listings (total ${s.total})`);

  const fetched = await axios.get(`${BASE}/fetch/${ids.join(",")}?query=${s.id}&realm=poe2`, { headers, timeout: 20_000 });
  console.log(`fetch ${fetched.status}\n${rateHeaders(fetched.headers)}`);
  const out = resolve("src/scripts/fixtures/trade2-fetch-live.json");
  const payload = { _provenance: `REAL trade2 fetch, league "${league}", captured ${new Date().toISOString()}`, ...fetched.data };
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out} (${ids.length} listings of ${s.total})`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
