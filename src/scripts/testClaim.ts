/* Shared evidence-grade contract (src/lib/claim.ts) that the strategy KB and Learn data parse against. */
import assert from "node:assert/strict";
import { CLAIM_LABEL, CLAIM_VERDICTS, claimSchema, isRmtUrl, isUnsettledClaim } from "../lib/claim";

const POE2DB = "https://poe2db.tw/us/Omen_of_Whittling";
const WIKI = "https://www.poe2wiki.net/wiki/Omen_of_Whittling";

assert.deepEqual(
  CLAIM_VERDICTS.map((v) => CLAIM_LABEL[v]),
  ["primary", "2+ sources", "1 source", "unverified", "conflict", "synthesis"],
);
assert.deepEqual(CLAIM_VERDICTS.filter(isUnsettledClaim), ["uv", "cf"], "amber only for unverified / conflict");

assert.ok(claimSchema.safeParse({ v: "vp", src: [POE2DB] }).success);
assert.ok(claimSchema.safeParse({ v: "vs", src: [POE2DB, WIKI], note: "both agree" }).success);
assert.ok(claimSchema.safeParse({ v: "uv", src: [], note: "untested" }).success, "unverified may cite nothing");
assert.ok(!claimSchema.safeParse({ v: "vp", src: [] }).success, "primary needs a source");
assert.ok(!claimSchema.safeParse({ v: "vs", src: [POE2DB] }).success, "2+ sources needs two");
assert.ok(!claimSchema.safeParse({ v: "ss", src: ["http://poe2db.tw/us/x"] }).success, "https only");
assert.ok(!claimSchema.safeParse({ v: "ss", src: ["javascript:alert(1)"] }).success, "no script hrefs");
assert.ok(!claimSchema.safeParse({ v: "ok", src: [POE2DB] }).success, "unknown grade");
assert.ok(!claimSchema.safeParse({ v: "vp", src: [POE2DB], extra: 1 }).success, "strict keys");
assert.ok(!claimSchema.safeParse({ v: "uv", src: [], note: "" }).success, "empty note rejected");
for (const shop of ["https://www.poecurrency.com/news/x", "https://iggm.com/news/y", "https://news.u4n.com/z", "https://TimeSaver.gg:443/blog/x"]) {
  assert.ok(isRmtUrl(shop), `${shop} is an RMT shop`);
  assert.ok(!claimSchema.safeParse({ v: "ss", src: [shop] }).success, `${shop} rejected as a source`);
}
// suffix match is per label: a host that merely ends in the same letters is not the shop
assert.ok(!isRmtUrl("https://notiggm.com/x") && !isRmtUrl(POE2DB), "only the shop host and its subdomains");
console.log("PASS  claim contract: six grades + labels, source counts, https-only links, no RMT shops, strict keys");
