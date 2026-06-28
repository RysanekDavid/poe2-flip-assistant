/**
 * Datacenter reachability probe for the official PoE2 trade2 API.
 *
 * THE question this answers: does trade2 SEARCH work from a datacenter IP (Hetzner) with a
 * valid POESESSID, or does Cloudflare block it (forcing a residential IP / local agent)?
 *
 * Run it ON THE VPS (not your home PC — home would always pass and tell us nothing):
 *   POESESSID=xxxxxxxx node probe-datacenter.mjs
 *
 * Needs Node 18+ (uses built-in fetch). No npm install.
 *
 * SECURITY: this puts your POESESSID on the VPS. After the test: destroy the box AND log out
 * of pathofexile.com in your browser (that invalidates this POESESSID so a leak is harmless).
 */

const POESESSID = process.env.POESESSID;
const LEAGUE = process.env.LEAGUE || "Runes of Aldur";
// same browser-ish UA the app sends
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

if (!POESESSID) {
  console.error("set POESESSID env var:  POESESSID=xxxx node probe-datacenter.mjs");
  process.exit(1);
}

async function hit(name, url, opts) {
  try {
    const res = await fetch(url, opts);
    const body = await res.text();
    const cfRay = res.headers.get("cf-ray");
    const cfMit = res.headers.get("cf-mitigated"); // present when Cloudflare challenged/blocked
    const ctype = res.headers.get("content-type") || "";
    const looksHtml = ctype.includes("text/html") || body.trimStart().startsWith("<");
    console.log(`\n=== [${name}] ===`);
    console.log(`HTTP ${res.status}   content-type: ${ctype}`);
    console.log(`cf-ray: ${cfRay ?? "none"}   cf-mitigated: ${cfMit ?? "none"}`);
    console.log(`body (first 400 chars): ${body.slice(0, 400).replace(/\s+/g, " ")}`);
    const blocked = looksHtml || cfMit || res.status === 403 || res.status === 1020;
    console.log(`VERDICT: ${blocked ? "❌ CLOUDFLARE BLOCK (datacenter walled)" : "✅ REACHED GGG API (datacenter OK)"}`);
    return !blocked;
  } catch (e) {
    console.log(`\n=== [${name}] ===\nERROR: ${e}`);
    return false;
  }
}

console.log(`probing from this host · league="${LEAGUE}"`);

// 1) public data endpoint, no auth — baseline: is the site reachable at all from here?
await hit("data/leagues (no auth)", "https://www.pathofexile.com/api/trade2/data/leagues", {
  headers: { "User-Agent": UA },
});

// 2) THE real test: authenticated POST search (this is what every craft/snipe/hunt call does)
await hit("search (authed POST)", `https://www.pathofexile.com/api/trade2/search/poe2/${encodeURIComponent(LEAGUE)}?realm=poe2`, {
  method: "POST",
  headers: { "User-Agent": UA, "Content-Type": "application/json", Cookie: `POESESSID=${POESESSID}` },
  body: JSON.stringify({ query: { status: { option: "online" }, stats: [{ type: "and", filters: [] }] }, sort: { price: "asc" } }),
});

console.log(
  "\n--- how to read it ---\n" +
    "✅ on the authed search (JSON body, even a 400 'invalid query' JSON) = datacenter is NOT blocked →\n" +
    "   store POESESSID on Hetzner, call trade2 server-side. No agent, no proxy.\n" +
    "❌ HTML / 403 / cf-mitigated / a Cloudflare challenge page = datacenter IS blocked →\n" +
    "   need residential proxy (or local agent). The search won't run from Hetzner directly.\n",
);
