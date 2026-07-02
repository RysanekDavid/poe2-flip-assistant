import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * OFFLINE poe.ninja builds scraper — run manually ~monthly (`npm run scrape:builds`),
 * commit the resulting src/data/buildMeta.json. The app only ever reads the static JSON;
 * playwright/chromium never runs on the production box.
 *
 * poe.ninja has no build-overview JSON API for PoE2 (verified 2026-06); the builds page is
 * client-rendered (Astro), so we scrape the hydrated DOM. Everything here only *weights*
 * the curated craft-target library (src/core/craftTargets.ts) — a stale or failed scrape
 * degrades ranking, never correctness.
 */

interface PctRow {
  name: string;
  pct: number;
}

interface BuildMeta {
  league: string;
  leagueSlug: string;
  scrapedAt: string;
  totalCharacters: number;
  /** exact % from the filter-cell border gradient, all ascendancies (base classes ~0 included) */
  ascendancies: PctRow[];
  /** sidebar "Items": mixes "Rare <Slot>" usage and top unique names — slot join happens at merge time */
  items: PctRow[];
  mainSkills: PctRow[];
  spiritSkills: PctRow[];
  /** "Weapon Configuration": Quarterstaff/Spear/Bow… — direct weights for weapon craft targets */
  weaponConfig: PctRow[];
}

interface LeagueBuild {
  leagueName: string;
  leagueUrl: string;
  total: number;
  status: number; // 0 = active
  hardcore: boolean;
}

const INDEX_URL = "https://poe.ninja/poe2/api/data/build-index-state";
const OUT_PATH = join(process.cwd(), "src", "data", "buildMeta.json");

async function activeLeague(): Promise<LeagueBuild> {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`build-index-state ${res.status}`);
  const body = (await res.json()) as { leagueBuilds?: LeagueBuild[] };
  const league = body.leagueBuilds?.find((l) => l.status === 0 && !l.hardcore);
  if (!league) throw new Error("no active softcore league in build-index-state");
  return league;
}

/** Runs inside the page. Keep self-contained — no closures over node scope. */
function extractFromPage(): Omit<BuildMeta, "league" | "leagueSlug" | "scrapedAt"> {
  const rowRe = /^(.{2,60}?)\s*(\d{1,3}(?:\.\d+)?)%$/;

  // ascendancy filter cells: class icon background + exact % in the border gradient
  const ascendancies: PctRow[] = [];
  for (const cell of document.querySelectorAll<HTMLElement>("div.filter-list-cell")) {
    const style = cell.getAttribute("style") ?? "";
    if (!style.includes("/poe2/classes/")) continue;
    const name = cell.querySelector("span,div")?.textContent?.trim() ?? "";
    const exact = style.match(/coolgrey-100\)\s*([\d.]+)%/);
    const label = cell.textContent?.match(/([\d.]+)%/);
    const pct = exact ? Number(exact[1]) : label ? Number(label[1]) : NaN;
    if (name && Number.isFinite(pct)) ascendancies.push({ name, pct });
  }

  // sidebar sections: header → nearest ancestor containing an <li> list of "Name NN%" rows
  const sections = new Map<string, PctRow[]>();
  for (const h of document.querySelectorAll("h1,h2,h3,h4,h5")) {
    const title = h.textContent?.trim() ?? "";
    let box: HTMLElement | null = h.closest("section") ?? h.parentElement;
    for (let i = 0; i < 3 && box && !box.querySelector("li"); i++) box = box.parentElement;
    if (!box) continue;
    const rows: PctRow[] = [];
    for (const li of box.querySelectorAll("li")) {
      const m = li.textContent?.trim().match(rowRe);
      if (m) rows.push({ name: m[1]!, pct: Number(m[2]) });
    }
    if (rows.length && !sections.has(title)) sections.set(title, rows);
  }

  const totalMatch = document.body.innerText.match(/Found\s+([\d,]+)\s+characters/);
  return {
    totalCharacters: totalMatch ? Number(totalMatch[1]!.replace(/,/g, "")) : 0,
    ascendancies,
    items: sections.get("Items") ?? [],
    mainSkills: sections.get("Main Skills") ?? [],
    spiritSkills: sections.get("Spirit Skills") ?? [],
    weaponConfig: sections.get("Weapon Configuration") ?? [],
  };
}

async function main(): Promise<void> {
  const league = await activeLeague();
  const slug = league.leagueUrl;
  console.log(`league: "${league.leagueName}" (${slug}), ${league.total} characters indexed`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`https://poe.ninja/poe2/builds/${slug}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("div.filter-list-cell", { timeout: 30_000 });
    // hydration streams sections in; wait until the sidebar has its full row set
    await page.waitForFunction(() => document.querySelectorAll("li").length > 50, undefined, {
      timeout: 30_000,
    });

    const data = await page.evaluate(extractFromPage);
    const meta: BuildMeta = {
      league: league.leagueName,
      leagueSlug: slug,
      scrapedAt: new Date().toISOString(),
      ...data,
    };

    if (meta.ascendancies.length < 5 || meta.items.length === 0) {
      throw new Error(
        `scrape looks broken: ${meta.ascendancies.length} ascendancies, ${meta.items.length} items — page layout changed?`,
      );
    }

    mkdirSync(dirname(OUT_PATH), { recursive: true });
    writeFileSync(OUT_PATH, JSON.stringify(meta, null, 2) + "\n");
    console.log(
      `wrote ${OUT_PATH}: ${meta.ascendancies.length} ascendancies, ${meta.items.length} items, ` +
        `${meta.mainSkills.length} main skills, ${meta.weaponConfig.length} weapon configs, ` +
        `${meta.totalCharacters} characters`,
    );
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
