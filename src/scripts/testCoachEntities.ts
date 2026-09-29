/*
 * Coach entity chips: the response contract accepts/rejects entity payloads, and the pure wrap
 * turns only the returned names/mentions into entity nodes — longest first, exact, word-bounded,
 * never inside code, links or citations.
 */
import assert from "node:assert/strict";
import { wrapEntityBlocks, wrapEntityInlines, buildEntityMatcher, type EntityRef } from "../components/coach/entityWrap";
import { parseCoachMarkdown, parseInline, type MarkdownInline } from "../components/coach/markdownParser";
import { coachBrowserResponseSchema, coachEntitySchema, coachUpstreamResponseSchema } from "../lib/coachContract";

const ICON = "https://web.poecdn.com/gen/image/WzI1LDE0XQ/2986e220b3/CurrencyModValues.png";
const entity = {
  id: "divine",
  name: "Divine Orb",
  kind: "currency",
  icon_url: ICON,
  summary: "Randomises the numeric values of modifiers on an item",
  directions: "Right click this item then left click an item to apply it.",
  poe2db_url: "https://poe2db.tw/us/Divine_Orb",
  mentions: ["Divine Orbs", "3 div"],
  price_div: 1,
  price_at: "2026-09-29T10:00:00Z",
};

function testContract(): void {
  assert.deepEqual(coachEntitySchema.parse(entity), entity);
  assert.throws(() => coachEntitySchema.parse({ ...entity, icon_url: "https://evil.example/x.png" }), "icons only from poecdn");
  assert.throws(() => coachEntitySchema.parse({ ...entity, kind: "weapon" }), "kind is a closed union");
  assert.throws(() => coachEntitySchema.parse({ ...entity, extra: 1 }), "strict object");
  assert.throws(() => coachEntitySchema.parse({ ...entity, price_at: "yesterday" }), "price time is ISO");
  const upstream = {
    thread_id: "00000000-0000-4000-8000-000000000001",
    request_id: "0123456789abcdef01234567",
    answer: "Divine Orb",
    tools_used: [],
    processors_used: [],
    sources: [],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2, model_calls: 1, duration_ms: 5 },
  };
  assert.equal(coachUpstreamResponseSchema.parse(upstream).entities, undefined, "older Coach omits entities");
  assert.equal(coachUpstreamResponseSchema.parse({ ...upstream, entities: [entity] }).entities?.length, 1);
  assert.throws(() => coachUpstreamResponseSchema.parse({ ...upstream, entities: Array(21).fill(entity) }), "cap 20");
  const browser = {
    conversationId: upstream.thread_id, turnId: upstream.thread_id, turnCount: 1, replayed: false,
    requestId: upstream.request_id, answer: "a", toolsUsed: [], processorsUsed: [], sources: [],
  };
  assert.throws(() => coachBrowserResponseSchema.parse(browser), "browser turns always carry entities");
  assert.equal(coachBrowserResponseSchema.parse({ ...browser, entities: [] }).entities.length, 0);
  console.log("PASS  entity contract: poecdn icons, closed kinds, strict, ISO price time, optional upstream, cap 20");
}

const REFS: EntityRef[] = [
  { id: "greater-exalted-orb", name: "Greater Exalted Orb", mentions: [] },
  { id: "exalted", name: "Exalted Orb", mentions: ["150 ex"] },
  { id: "divine", name: "Divine Orb", mentions: ["Divine Orbs", "3 div"] },
];

function wrap(text: string, refs: EntityRef[] = REFS): MarkdownInline[] {
  const matcher = buildEntityMatcher(refs);
  assert.ok(matcher);
  return wrapEntityInlines(parseInline(text), matcher);
}

const entityTexts = (nodes: MarkdownInline[]): string[] =>
  nodes.flatMap((n) => (n.kind === "entity" ? [`${n.id}:${n.text}`] : n.kind === "strong" || n.kind === "emphasis" || n.kind === "strike" ? entityTexts(n.children) : []));

function testWrap(): void {
  assert.deepEqual(entityTexts(wrap("Greater Exalted Orb, then Exalted Orb.")), [
    "greater-exalted-orb:Greater Exalted Orb",
    "exalted:Exalted Orb",
  ], "overlap: longest surface wins");
  assert.deepEqual(entityTexts(wrap("Two Divine Orbs or 3 div, one Divine Orb.")), [
    "divine:Divine Orbs",
    "divine:3 div",
    "divine:Divine Orb",
  ], "plural mention and shorthand wrap exactly");
  assert.deepEqual(entityTexts(wrap("divine orb and DIVINE ORB stay text")), [], "case: only exact surfaces");
  assert.deepEqual(entityTexts(wrap("13 div and Divine Orbital")), [], "word boundaries");
  assert.deepEqual(entityTexts(wrap("`Divine Orb` [Divine Orb](https://poe2db.tw/us/Divine_Orb) [M0123456789ab]")), [], "never inside code, links or citations");
  assert.deepEqual(entityTexts(wrap("**Divine Orb** and *150 ex*")), ["divine:Divine Orb", "exalted:150 ex"], "inside bold/italic");
  const nodes = wrap("Sell 3 div now.");
  assert.deepEqual(nodes, [
    { kind: "text", value: "Sell " },
    { kind: "entity", id: "divine", text: "3 div" },
    { kind: "text", value: " now." },
  ]);
  assert.equal(buildEntityMatcher([]), null, "no entities, no matcher");
  console.log("PASS  entity wrap: overlap, plural, shorthand, exact case, boundaries, skip code/links/citations");
}

function testBlocks(): void {
  const blocks = wrapEntityBlocks(
    parseCoachMarkdown("## Divine Orb\n\n| Item | Price |\n| --- | --- |\n| Divine Orb | 3 div |\n\n```\nDivine Orb\n```\n\n- Exalted Orb"),
    REFS,
  );
  const heading = blocks[0];
  assert.ok(heading?.kind === "heading" && heading.content[0]?.kind === "entity");
  const table = blocks[1];
  assert.ok(table?.kind === "table");
  assert.deepEqual(entityTexts(table.rows[0]!.flat()), ["divine:Divine Orb", "divine:3 div"]);
  const code = blocks[2];
  assert.ok(code?.kind === "code" && code.value === "Divine Orb", "fenced code untouched");
  const list = blocks[3];
  assert.ok(list?.kind === "bullet-list" && list.items[0]?.[0]?.kind === "entity");
  assert.equal(wrapEntityBlocks(blocks, []), blocks, "no refs returns the same blocks");
  console.log("PASS  entity wrap across headings, tables and lists; fenced code untouched");
}

testContract();
testWrap();
testBlocks();
