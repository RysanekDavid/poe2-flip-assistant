/* Scanner status contract — pure, NO network, NO DB: members never receive archetype diagnostics,
 * and an unreadable stored report is reported without breaking the status (Scan now stays usable).
 * Run: npm run test:snipe. */
import { parseScanReport, reportForViewer, SnipeScanStatusSchema } from "../lib/snipeScanContract";

let fail = 0;
const ok = (name: string, cond: boolean, extra = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
  if (!cond) fail++;
};

const diag = { key: "rings", label: "Rings", total: 12000, fetched: 40, candidates: 3, verified: 2, snipes: 1, floorDiv: 1.2, note: "" };
const finding = { listingId: "l1", itemName: "Doom Loop", baseType: "Ruby Ring", marginPct: 42, searchUrl: "https://www.pathofexile.com/trade2/search/x" };
const report = { profiles: 13, searched: 6, exaltPerDivine: 400, valuations: 8, maxValuations: 8, findings: [finding], diags: [diag], errors: [] };

const member = reportForViewer(report, false);
ok("member copy has no diagnostics", typeof member === "object" && member !== null && !("diags" in member));
ok("member copy keeps the findings", parseScanReport(member).report?.findings.length === 1);
ok("owner copy keeps the diagnostics", parseScanReport(reportForViewer(report, true)).report?.diags?.length === 1);
ok("stripping never mutates the stored report", report.diags.length === 1);
ok("no report yet → neither report nor error", (() => {
  const p = parseScanReport(null);
  return p.report === null && p.error === null;
})());

const broken = parseScanReport({ profiles: "13", unreadable: "Unexpected token" });
ok("unreadable report → error asking for a rescan", broken.report === null && /unreadable.*rescan|new scan/.test(broken.error ?? ""), broken.error ?? "");
const status = SnipeScanStatusSchema.safeParse({
  enabled: true, live: true, canScan: true, intervalMin: 10, profiles: [], lastReport: { garbage: true },
  lastScanAt: "2026-09-29 01:00:00", pending: false, lastError: null, failedAt: null,
});
ok("a garbage report does not fail the status itself", status.success);

const nearMiss = {
  listingId: "n1", archetype: "Rings", name: "Doom Loop", baseType: "Ruby Ring", rarity: "Rare", icon: null, priceDiv: 7, valueDiv: 10,
  marginPct: 30, samples: 6, basis: "comps", reason: "not-discounted", detail: "30% under value, need 35%", listedAt: null,
  exaltPerDivine: 400, tradeUrl: "https://www.pathofexile.com/trade2/search/poe2/Standard?q=x",
};
ok("a report from before near-misses still parses", parseScanReport(report).report?.nearMisses === undefined);
ok("near-misses parse with the report", parseScanReport({ ...report, league: "Standard", nearMisses: [nearMiss] }).report?.nearMisses?.length === 1);
ok("a near-miss linking off trade2 fails the report loudly", parseScanReport({ ...report, nearMisses: [{ ...nearMiss, tradeUrl: "https://evil.example/x" }] }).error !== null);
ok("a near-miss with off-poecdn art fails the report loudly", parseScanReport({ ...report, nearMisses: [{ ...nearMiss, icon: "https://evil.example/x.png" }] }).error !== null);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
