/* Snipe outcome checker — the fetch method verifying itself (cross-checks, verified / broken),
 * the plan B re-search fallback, the 24 h search pre-check and the checkpoint windows.
 * Runs inside test:snipe's DB half via testSnipeOutcomes.ts. No network: trade2 is faked. */
import { checkOutcomes } from "../core/snipeOutcomes/check";
import { getFetchMethodState } from "../db/snipeOutcomeQueries";
import { TradeHttpError } from "../api/tradeErrors";
import { at24h, fake, listing, reset, row, track, type Ok } from "./snipeOutcomeFixtures";

async function verifyAt2h(ok: Ok): Promise<void> {
  reset();
  track("o1", 2.5, "q0");
  const single = fake();
  await checkOutcomes(single.deps);
  ok("cross-check: a one-row chunk is never cross-checked", single.searches.length === 0 && row("o1").check_2h === "gone" && getFetchMethodState() === "unverified");
  track("c1", 2.5);
  track("c2", 2.5);
  const f = fake();
  await checkOutcomes(f.deps);
  ok("cross-check at 2 h: an all-gone chunk is re-searched once while unverified", f.searches.length === 1);
  ok("cross-check agrees → method verified, the fetch's gone stands", getFetchMethodState() === "verified" && row("c1").check_2h === "gone" && row("c2").check_2h_method === "fetch");
  track("d1", 2.5, "q2");
  track("d2", 2.5, "q2");
  const later = fake();
  await checkOutcomes(later.deps);
  ok("verified: 2 h all-gone chunks are no longer cross-checked", later.searches.length === 0 && row("d1").check_2h === "gone");
}

async function failedCrossCheck(ok: Ok): Promise<void> {
  reset();
  track("e1", 2.5);
  track("e2", 2.5);
  const s = await checkOutcomes(fake({ search: async () => Promise.reject(new Error("upstream 502")) }).deps);
  const e1 = row("e1");
  ok("failed cross-check does not confirm gone: nothing settled, no attempt spent", e1.check_2h === null && e1.attempts === 0 && row("e2").check_2h === null && s.deferred === 2);
  ok("failed cross-check: reason recorded, method still unverified", /cross-check pending: re-search: upstream 502/.test(e1.last_error ?? "") && getFetchMethodState() === "unverified");
}

async function brokenMethod(ok: Ok): Promise<void> {
  reset();
  at24h("n1", "qn");
  at24h("n2", "qn");
  const f = fake({
    search: async () => ({ id: "fresh", result: ["n1"], total: 1 }),
    fetchStates: async (ids, q) => (q === "qn" ? ids.map(() => null) : ids.map((id) => listing(id, 10))),
  });
  await checkOutcomes(f.deps);
  ok("contradiction: the re-search finds a listing the fetch called gone → method broken", getFetchMethodState() === "broken");
  ok("contradiction: that row settles from the re-search", row("n1").check_24h === "listed" && row("n1").check_24h_method === "search" && row("n1").check_24h_ask_amount === 10);
  ok("contradiction: the rest of the chunk goes to plan B in the same run", row("n2").check_24h === "gone" && row("n2").check_24h_method === "search" && f.searches.length === 2);
  track("p1", 2.5, "q9");
  track("p2", 2.5, null);
  const next = fake();
  await checkOutcomes(next.deps);
  ok("broken: no fetch against the old search id, even at 2 h", !next.fetches.some((x) => x.queryId === "q9"));
  ok("broken: 2 h checks re-search instead (also rows without an id)", row("p1").check_2h === "gone" && row("p1").check_2h_method === "search" && row("p2").check_2h_method === "search");
}

async function searchPreCheck(ok: Ok): Promise<void> {
  reset();
  at24h("m1", "qm");
  at24h("m2", "qm");
  at24h("m3", "qm3");
  const f = fake({ maxSearches: 0 });
  const s = await checkOutcomes(f.deps);
  ok("24 h: a multi-row chunk is not fetched without a search slot for its cross-check", !f.fetches.some((x) => x.queryId === "qm") && row("m1").check_24h === null && s.deferred === 2);
  ok("24 h: a one-row chunk is fetched and its answer stands", row("m3").check_24h === "gone" && row("m3").check_24h_method === "fetch");
  at24h("w1", "qw", undefined, 50);
  await checkOutcomes(fake().deps);
  ok("24 h window: reached at 50 h → error, no request", row("w1").check_24h === "error" && /missed the 24 h window/.test(row("w1").last_error ?? ""));
}

async function planBFallback(ok: Ok): Promise<void> {
  reset();
  at24h("f1", "old");
  at24h("f2", "old");
  at24h("f3", "old", null);
  at24h("f4", "old");
  const f = fake({
    maxSearches: 2,
    fetchStates: async (ids, queryId) => (queryId === "old" ? Promise.reject(new TradeHttpError("expired", 404)) : ids.map((id) => listing(id, 20))),
    search: async () => ({ id: "fresh", result: ["f1", "zz"], total: 2 }),
  });
  const s = await checkOutcomes(f.deps);
  ok("fallback: expired id → one re-search per row, capped per run", f.searches.length === 2 && f.searches[0]?.account === "Seller" && s.stale === 4);
  ok("fallback: found by the re-search → listed, ask read via the fresh id", row("f1").check_24h === "listed" && row("f1").check_24h_method === "search" && row("f1").check_24h_ask_div === 0.2 && f.fetches.some((x) => x.queryId === "fresh"));
  ok("fallback: absent from a complete page → gone (method search)", row("f2").check_24h === "gone" && row("f2").check_24h_method === "search");
  ok("fallback: unknown seller → error, no search spent", row("f3").check_24h === "error" && /seller is unknown/.test(row("f3").last_error ?? ""));
  ok("fallback: search budget spent → next run", row("f4").check_24h === null && s.deferred === 1);
  at24h("f5", "old2");
  at24h("f6", null);
  await checkOutcomes(fake({ fetchStates: async () => Promise.reject(new TradeHttpError("expired", 400)), search: async () => ({ id: "fresh", result: ["zz"], total: 250 }) }).deps);
  ok("fallback: absent from a truncated page proves nothing → error", row("f5").check_24h === "error" && /more than one page/.test(row("f5").last_error ?? ""));
  ok("fallback: a row with no search id goes straight to the re-search", row("f6").check_24h_method === "search");
}

export async function fetchMethodTests(ok: Ok): Promise<void> {
  await verifyAt2h(ok);
  await failedCrossCheck(ok);
  await brokenMethod(ok);
  await searchPreCheck(ok);
  await planBFallback(ok);
}
