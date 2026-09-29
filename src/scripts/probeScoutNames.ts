/*
 * Manual probe (not CI): diff every curated scout-priced boss drop against poe2scout's live /Items
 * and lineage lists, so a spelling drift or a delisted item is found before it reads as "unpriced".
 * Three requests (leagues, /Items, lineage). Run: npm run probe:scout-names -- "Forbidden Rites"
 */
import { fetchScout, fetchScoutLineage } from "../api/scoutClient";
import { getDefaultLeague } from "../core/leagueState";
import { loadBossLoot } from "../core/tools/bossEv/curated";
import { scoutKey } from "../core/tools/bossEv/scoutKey";

type Status = "priced" | "listed at 0" | "spelling differs" | "not listed";

interface Listed {
  name: string;
  priceExalt: number;
}

function classify(name: string, exact: ReadonlyMap<string, Listed>, normalized: ReadonlyMap<string, Listed>): { status: Status; scoutName: string | null } {
  const hit = exact.get(name.toLowerCase());
  if (hit) return { status: hit.priceExalt > 0 ? "priced" : "listed at 0", scoutName: hit.name };
  const near = normalized.get(scoutKey(name));
  if (near) return { status: "spelling differs", scoutName: near.name };
  return { status: "not listed", scoutName: null };
}

async function main(): Promise<void> {
  const league = process.argv[2] ?? getDefaultLeague();
  const { items } = await fetchScout(league);
  const gems = await fetchScoutLineage(league);
  const listed: Listed[] = [...items.map((i) => ({ name: i.name, priceExalt: i.priceExalt })), ...gems];
  const exact = new Map(listed.map((l) => [l.name.toLowerCase(), l]));
  const normalized = new Map(listed.map((l) => [scoutKey(l.name), l]));
  const file = loadBossLoot();
  const counts: Record<Status, number> = { priced: 0, "listed at 0": 0, "spelling differs": 0, "not listed": 0 };
  console.log(`poe2scout names vs curated boss drops — ${league} (${items.length} uniques, ${gems.length} lineage gems listed)`);
  for (const boss of file.bosses) {
    for (const line of boss.tiers.flatMap((t) => t.loot)) {
      if (line.priceRef.kind !== "scout") continue;
      const { status, scoutName } = classify(line.priceRef.name, exact, normalized);
      counts[status] += 1;
      if (status !== "priced") console.log(`  ${status.padEnd(16)} ${boss.id} / ${line.priceRef.name}${scoutName && status === "spelling differs" ? ` (scout: "${scoutName}")` : ""}`);
    }
  }
  console.log(`summary: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
