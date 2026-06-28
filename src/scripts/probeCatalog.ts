/**
 * Ground-truth probe for snipe-profile authoring. Prints the EXACT trade2 catalog text for the
 * stats our profiles use (so we match them precisely, not by guesswork) and the valid item
 * category option ids (so we stop sending "Unknown category"). Read-only, needs your POESESSID.
 *
 * Run locally (residential IP):  npx tsx src/scripts/probeCatalog.ts
 */
import { config } from "../config/env";
import axios from "axios";
import { fetchTradeMeta } from "../api/tradeMeta";

// keywords whose catalog text we need to copy verbatim into snipeProfiles.ts
const KEYWORDS = [
  "spirit",
  "level of all",
  "all attributes",
  "movement speed",
  "attack speed",
  "cast speed",
  "critical",
  "energy shield",
  "spell damage",
  "physical damage",
];

type J = Record<string, unknown>;

/** Recursively collect every {id,text} under a filter node whose id is "category". */
function findCategoryOptions(node: unknown, out: Array<{ id: string; text: string }>): void {
  if (Array.isArray(node)) {
    node.forEach((n) => findCategoryOptions(n, out));
    return;
  }
  if (node && typeof node === "object") {
    const o = node as J;
    if (o.id === "category" && o.option && typeof o.option === "object") {
      const opts = (o.option as J).options;
      if (Array.isArray(opts)) for (const x of opts) out.push({ id: String((x as J).id), text: String((x as J).text) });
    }
    for (const k of Object.keys(o)) findCategoryOptions(o[k], out);
  }
}

async function main(): Promise<void> {
  if (!config.poesessid) {
    console.error("POESESSID not set in .env.local — probe needs it.");
    process.exit(1);
  }

  const { stats } = await fetchTradeMeta();
  console.log(`catalog: ${stats.length} stats\n\n=== STAT TEXT MATCHES (copy the exact text into snipeProfiles) ===`);
  for (const kw of KEYWORDS) {
    const hits = stats.filter((s) => s.text.toLowerCase().includes(kw));
    console.log(`\n# "${kw}" → ${hits.length} match(es)`);
    for (const h of hits.slice(0, 14)) console.log(`  [${h.group}] ${h.text}`);
  }

  console.log(`\n\n=== CATEGORY OPTIONS (valid trade2 category ids) ===`);
  try {
    const r = await axios.get("https://www.pathofexile.com/api/trade2/data/filters", {
      headers: { "User-Agent": "poe2-flip-assistant probe (read-only)", Cookie: `POESESSID=${config.poesessid}` },
      timeout: 20_000,
    });
    const out: Array<{ id: string; text: string }> = [];
    findCategoryOptions(r.data, out);
    if (out.length === 0) console.log("no 'category' filter found — dump head:", JSON.stringify(r.data).slice(0, 600));
    for (const o of out) console.log(`  ${o.id}\t${o.text}`);
  } catch (e) {
    console.log("filters fetch failed:", e instanceof Error ? e.message : String(e));
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
