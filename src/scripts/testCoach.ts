import assert from "node:assert/strict";
import { parseCoachMarkdown, parseInline } from "../components/coach/markdownParser";
import { coachBrowserRequestSchema, coachBrowserResponseSchema } from "../lib/coachContract";
import { coachEndpoint, deriveCoachThreadId } from "../lib/coachServer";
import { buildIdentifier } from "../lib/buildInfo";

const conversationId = "00000000-0000-4000-8000-000000000001";
const first = deriveCoachThreadId(1, conversationId, "test-secret");
const repeated = deriveCoachThreadId(1, conversationId, "test-secret");
const otherUser = deriveCoachThreadId(2, conversationId, "test-secret");

assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(first, repeated);
assert.notEqual(first, otherUser);

assert.equal(coachEndpoint("https://coach.example/", "/chat"), "https://coach.example/chat");
assert.throws(() => coachEndpoint("file:///tmp/coach", "/chat"));
assert.equal(
  buildIdentifier({ APP_COMMIT_SHA: "ABCDEF0123456789", NODE_ENV: "production" }),
  "abcdef012345",
);
assert.equal(buildIdentifier({ NODE_ENV: "development" }), "development");
assert.throws(() => buildIdentifier({ NODE_ENV: "production" }), /APP_COMMIT_SHA/);

assert.equal(
  coachBrowserRequestSchema.parse({ message: "  current price  ", conversationId }).message,
  "current price",
);
assert.equal(
  coachBrowserResponseSchema.parse({
    conversationId,
    answer: "Answer",
    toolsUsed: ["fetch_live_prices"],
    processorsUsed: [],
    sources: [{ id: "L1", type: "live", title: "poe.ninja", url: "https://poe.ninja" }],
  }).sources.length,
  1,
);

const markdown = parseCoachMarkdown(`# Market\n\n**Omen of Light**\n\n| Item | Price |\n| --- | ---: |\n| Omen | 12 div |\n\n- Abyss\n- Ritual\n\n> Verify in game.\n\n\`code\` [M0123456789ab]`);
assert.deepEqual(markdown.map((block) => block.kind), [
  "heading",
  "paragraph",
  "table",
  "bullet-list",
  "quote",
  "paragraph",
]);
assert.equal(parseInline("[unsafe](javascript:alert(1))")[0]?.kind, "text");
assert.equal(parseInline("https://poe2db.tw")[0]?.kind, "link");
assert.equal(parseInline("[M0123456789ab]")[0]?.kind, "citation");

console.log("ALL PASS — coach contract, thread IDs and safe Markdown parser");
