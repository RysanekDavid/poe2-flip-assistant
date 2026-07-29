import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * OFFLINE poe2db.tw modifier-tier scraper — run manually per patch (`npm run scrape:poe2db`),
 * commit the resulting src/data/poe2dbTiers.json. Deterministic, data-mined tier tables are
 * the authority for item-level gates (e.g. boots 35% MS = ilvl 82) — prose guides got these
 * wrong repeatedly (a whole research verification round refuted "82/70 for all bases").
 *
 * The app/KB only ever read the static JSON; playwright never runs on the production box.
 */

interface TierRow {
  tier: string; // "T1" (poe2db counts downward here: T1 = best)
  name: string; // mod name, e.g. "Hellion's"
  ilvl: number; // minimum item level for this tier
  text: string; // display text with rolled ranges
}

interface ModFamily {
  family: string; // heading poe2db shows above the table (mod group label + tags)
  side: string; // "prefix" | "suffix" | "unknown"
  rows: TierRow[];
}

interface PageDump {
  page: string; // poe2db path, e.g. "Boots_int"
  families: ModFamily[];
}

/** Item-class pages that matter for the craft recipes/KB. Extend as recipes grow. */
const PAGES = [
  "Boots_int",
  "Boots_dex",
  "Boots_str",
  "Gloves_int",
  "Gloves_dex",
  "Helmets_int",
  "Body_Armours_str",
  "Body_Armours_int",
  "Rings",
  "Amulets",
  "Belts",
  "Bows",
  "Quarterstaves",
  "Spears",
  "Wands",
  "Foci",
] as const;

const OUT_PATH = join(process.cwd(), "src", "data", "poe2dbTiers.json");

async function scrapePage(pageUrl: string, browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<PageDump | null> {
  const page = await browser.newPage();
  try {
    await page.goto(`https://poe2db.tw/us/${pageUrl}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(3000); // tables hydrate after load

    // NOTE: the evaluate body is a STRING — tsx/esbuild injects a `__name` helper into
    // serialized function callbacks, which doesn't exist inside the page and throws.
    const families = (await page.evaluate(`(() => {
      const out = [];
      const sideOf = (el) => {
        let cur = el;
        for (let depth = 0; cur && depth < 12; depth++) {
          const prev = cur.previousElementSibling;
          if (prev) {
            const t = (prev.textContent || "").slice(0, 400).toLowerCase();
            if (t.includes("suffix")) return "suffix";
            if (t.includes("prefix")) return "prefix";
            cur = prev;
          } else {
            cur = cur.parentElement;
          }
        }
        return "unknown";
      };
      for (const table of document.querySelectorAll("table")) {
        const trs = [...table.querySelectorAll("tr")];
        const rows = [];
        for (const tr of trs) {
          const cells = [...tr.querySelectorAll("td")].map((c) => (c.textContent || "").trim().replace(/\\s+/g, " "));
          if (cells.length < 4) continue;
          if (!/^T\\d+$/.test(cells[0])) continue;
          const ilvl = parseInt(cells[2], 10);
          if (!Number.isFinite(ilvl)) continue;
          const text = cells[3].replace(/^\\d+\\s*/, "");
          rows.push({ tier: cells[0], name: cells[1], ilvl, text });
        }
        if (rows.length === 0) continue;
        let family = "";
        let cur = table;
        for (let depth = 0; cur && depth < 8 && !family; depth++) {
          const prev = cur.previousElementSibling;
          if (prev) {
            const t = (prev.textContent || "").trim().replace(/\\s+/g, " ");
            if (t && t.length < 120) family = t;
            cur = prev;
          } else {
            cur = cur.parentElement;
          }
        }
        out.push({ family, side: sideOf(table), rows });
      }
      return out;
    })()`)) as ModFamily[];

    if (families.length === 0) {
      console.warn(`[scrape] ${pageUrl}: 0 modifier tables — page layout changed?`);
      return null;
    }
    console.log(`[scrape] ${pageUrl}: ${families.length} mod families`);
    return { page: pageUrl, families };
  } catch (e) {
    console.error(`[scrape] ${pageUrl} failed:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const pages: PageDump[] = [];
  for (const p of PAGES) {
    const dump = await scrapePage(p, browser);
    if (dump) pages.push(dump);
    await new Promise((r) => setTimeout(r, 1500)); // be polite to poe2db
  }
  await browser.close();

  if (pages.length === 0) throw new Error("scrape produced nothing — aborting without writing");
  const out = {
    scrapedAt: new Date().toISOString(),
    source: "https://poe2db.tw (data-mined game files)",
    pages,
  };
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 1));
  const totalFamilies = pages.reduce((s, p) => s + p.families.length, 0);
  console.log(`[scrape] wrote ${OUT_PATH}: ${pages.length}/${PAGES.length} pages, ${totalFamilies} mod families`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
