/*
 * npm run craft:eval [-- --check] [--only <id>] [--budget-ms <cpu ms>]
 * Scores the craft planner against the golden craft set (docs/research/craft-mining/golden):
 * every entry is planned with the committed price snapshot and compared with the creator's route.
 * Prints a markdown table; a full run writes scoreboard.json (the committed baseline).
 *   --check      compare with the committed baseline instead of writing it; exit 1 on a regression
 *                (a ratio moving >10% further from 1, a pass turning into a fail, a lost entry)
 *   --only <id>  score one entry (never writes the baseline)
 *   --budget-ms  CPU budget for one plan's main search (default 10000; the server's is 3000 wall ms)
 */
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { loadCraftMining } from "../../core/research/craftMining/load";
import { readGoldenEntries, readPriceSnapshot, readScoreboard, SCOREBOARD_PATH } from "../../core/research/craftMining/goldenLoad";
import { plannerPrices, type PriceSnapshot } from "../../core/research/craftMining/goldenPrices";
import { checkAgainstBaseline, fmt, SCOREBOARD_VERSION, summarize, type Scoreboard, type ScoreEntry } from "../../core/research/craftMining/goldenScore";
import { loadCraftCatalog } from "../../core/tools/craftmoves/catalog";
import type { PlanDeps } from "../../core/tools/planner/plan";
import { catalysingPriorsFrom, revealPriorsFrom } from "../../core/tools/planner/revealPriors";
import { evalBudget, scoreEntry } from "./craftEvalRun";

const DEFAULT_SEARCH_MS = 10_000;
const ALTERNATIVES_MS = 3_000;

interface EvalArgs {
  check: boolean;
  only: string | null;
  searchMs: number;
}

function parseArgs(argv: readonly string[]): EvalArgs {
  const args: EvalArgs = { check: false, only: null, searchMs: DEFAULT_SEARCH_MS };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]!;
    if (a === "--check") args.check = true;
    else if (a === "--only" && argv[i + 1]) args.only = argv[++i]!;
    else if (a === "--budget-ms" && Number(argv[i + 1]) > 0) args.searchMs = Number(argv[++i]);
    else throw new Error(`craft:eval: bad argument "${a}" (known: --check, --only <id>, --budget-ms <positive ms>)`);
  }
  return args;
}

const band = (b: { point: number; low: number; high: number } | null): string => (b ? `${fmt(b.point, 1)} (${fmt(b.low, 0)}–${fmt(b.high, 0)})` : "–");

function markdownTable(entries: readonly ScoreEntry[]): string {
  const head = "| id | start | planner div | creator div | ratio | pass | tag overlap | top driver | impractical | market div | error |";
  const rule = "|---|---|---|---|---|---|---|---|---|---|---|";
  const rows = entries.map((e) => {
    const driver = e.topDriver ? `${e.topDriver.label} ${Math.round(e.topDriver.share * 100)}%` : "–";
    const error = e.error ? `${e.error.kind}: ${e.error.message}` : "";
    const start = e.compared ? `${e.start ?? "–"} (compared: clean ${fmt(e.compared.clean?.point ?? null, 0)}, bought ${fmt(e.compared.bought?.point ?? null, 0)})` : (e.start ?? "–");
    return `| ${e.id} | ${start} | ${band(e.plannerDiv)} | ${band(e.creatorDiv)} | ${fmt(e.ratio)} | ${e.pass ? "PASS" : "fail"} | ${fmt(e.tags.jaccard)} | ${driver} | ${e.impractical ? "yes" : "no"} | ${fmt(e.marketDiv, 0)} | ${error} |`;
  });
  const s = summarize(entries);
  return [head, rule, ...rows, "", `${s.passed}/${s.entries} pass, ${s.errored} errored`].join("\n");
}

function deps(snapshot: PriceSnapshot, searchMs: number): PlanDeps {
  return {
    cat: loadCraftCatalog(),
    prices: plannerPrices(snapshot),
    exaltPerDivine: snapshot.exaltPerDivine,
    league: snapshot.league,
    now: new Date(),
    budget: evalBudget(searchMs, ALTERNATIVES_MS),
    // the reveal and Catalysing numbers the server plans with (planner/load.ts planForLeague)
    reveal: revealPriorsFrom(loadCraftMining().priors),
    catalysing: catalysingPriorsFrom(loadCraftMining().priors),
  };
}

function runCheck(entries: readonly ScoreEntry[], snapshot: PriceSnapshot, only: string | null): number {
  const baseline = readScoreboard();
  if (baseline.prices.fetchedAt !== snapshot.fetchedAt) console.log(`note: the baseline was priced at ${baseline.prices.fetchedAt}, this run at ${snapshot.fetchedAt}; a move may be the prices, not the planner`);
  const result = checkAgainstBaseline(baseline.entries, entries, only ? new Set([only]) : null);
  for (const n of result.notes) console.log(`note: ${n}`);
  if (result.regressions.length === 0) {
    console.log("PASS  craft:eval --check: no regression against the baseline");
    return 0;
  }
  for (const r of result.regressions) console.error(`FAIL  ${r}`);
  return 1;
}

function main(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const snapshot = readPriceSnapshot();
  const all = readGoldenEntries();
  const entries = args.only ? all.filter((e) => e.id === args.only) : all;
  if (entries.length === 0) throw new Error(`craft:eval: no golden entry "${args.only}" (known: ${all.map((e) => e.id).join(", ")})`);
  const planDeps = deps(snapshot, args.searchMs);
  const scored = entries.map((e) => {
    console.error(`planning ${e.id}…`);
    return scoreEntry(e, planDeps);
  });
  console.log(markdownTable(scored));
  if (args.check) return runCheck(scored, snapshot, args.only);
  if (args.only) {
    console.log(`(--only: ${relative(process.cwd(), SCOREBOARD_PATH)} not written)`);
    return 0;
  }
  const board: Scoreboard = {
    schema_version: SCOREBOARD_VERSION,
    generatedAt: new Date().toISOString(),
    prices: { league: snapshot.league, fetchedAt: snapshot.fetchedAt, source: snapshot.source },
    budget: { clock: "cpu", searchMs: args.searchMs, alternativesMs: ALTERNATIVES_MS },
    summary: summarize(scored),
    entries: scored,
  };
  writeFileSync(SCOREBOARD_PATH, `${JSON.stringify(board, null, 2)}\n`);
  console.log(`wrote ${relative(process.cwd(), SCOREBOARD_PATH)}`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
