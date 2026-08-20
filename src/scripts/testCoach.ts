import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { parseCoachMarkdown, parseInline } from "../components/coach/markdownParser";
import {
  coachBrowserRequestSchema,
  coachBrowserResponseSchema,
  coachErrorResponseSchema,
  coachUpstreamErrorSchema,
  parseCoachUpstreamError,
} from "../lib/coachContract";
import {
  coachEndpoint,
  coachPublicStatus,
  deriveCoachActorToken,
  deriveCoachThreadId,
} from "../lib/coachServer";
import {
  appendUniqueMessages,
  createPendingUser,
  nextConversationAfterDelete,
} from "../components/coach/coachSessionState";
import { buildIdentifier } from "../lib/buildInfo";

const conversationId = "00000000-0000-4000-8000-000000000001";
const turnId = "00000000-0000-4000-8000-000000000002";
const first = deriveCoachThreadId(1, conversationId, "test-secret");
const repeated = deriveCoachThreadId(1, conversationId, "test-secret");
const otherUser = deriveCoachThreadId(2, conversationId, "test-secret");
const chatCompletionsThreadHex = expectedThreadHex("chat-completions-v1");
const legacyThreadHex = expectedThreadHex(null);

assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(first, repeated);
assert.notEqual(first, otherUser);
assert.equal(deriveCoachActorToken(1, "test-secret"), deriveCoachActorToken(1, "test-secret"));
assert.notEqual(deriveCoachActorToken(1, "test-secret"), deriveCoachActorToken(2, "test-secret"));
assert.doesNotMatch(deriveCoachActorToken(42, "test-secret"), /42/);
assert.notEqual(first.replaceAll("-", ""), chatCompletionsThreadHex);
assert.notEqual(first.replaceAll("-", ""), legacyThreadHex);

assert.equal(coachEndpoint("https://coach.example/", "/chat"), "https://coach.example/chat");
assert.throws(() => coachEndpoint("file:///tmp/coach", "/chat"));
assert.equal(coachPublicStatus(409), 409);
assert.equal(coachPublicStatus(504), 504);
assert.equal(coachPublicStatus(500), 502);
assert.equal(
  buildIdentifier({ APP_COMMIT_SHA: "ABCDEF0123456789", NODE_ENV: "production" }),
  "abcdef012345",
);
assert.equal(buildIdentifier({ NODE_ENV: "development" }), "development");
assert.throws(() => buildIdentifier({ NODE_ENV: "production" }), /APP_COMMIT_SHA/);

assert.equal(
  coachBrowserRequestSchema.parse({
    message: "  current price  ", conversationId, turnId, expectedTurnCount: 0,
  }).message,
  "current price",
);
assert.equal(
  coachBrowserResponseSchema.parse({
    conversationId,
    turnId,
    turnCount: 1,
    replayed: false,
    requestId: "abcdef0123456789abcdef01",
    answer: "Answer",
    toolsUsed: ["fetch_live_prices"],
    processorsUsed: [],
    sources: [{ id: "L1", type: "live", title: "poe.ninja", url: "https://poe.ninja" }],
  }).sources.length,
  1,
);

const publicError = coachErrorResponseSchema.parse({
  error: {
    code: "provider_timeout",
    message: "Timed out.",
    requestId: "abcdef0123456789abcdef01",
    retryable: true,
    resetConversation: true,
  },
});
assert.equal(publicError.error.code, "provider_timeout");
assert.equal(coachErrorResponseSchema.parse({
  error: {
    code: "thread_busy",
    message: "Conversation is busy.",
    requestId: "abcdef0123456789abcdef01",
    retryable: true,
    resetConversation: false,
  },
}).error.code, "thread_busy");
assert.equal(coachUpstreamErrorSchema.parse({
  error: {
    code: "provider_timeout",
    message: "Timed out.",
    request_id: "abcdef0123456789abcdef01",
    retryable: true,
    reset_conversation: true,
  },
}).error.request_id, "abcdef0123456789abcdef01");
const mappedError = parseCoachUpstreamError({
  error: {
    code: "provider_timeout",
    message: "Timed out.",
    request_id: "abcdef0123456789abcdef01",
    retryable: true,
    reset_conversation: true,
  },
}, "abcdef0123456789abcdef01");
assert.deepEqual(mappedError, publicError.error);
assert.equal(parseCoachUpstreamError({ error: {} }, "abcdef0123456789abcdef01"), null);

const pending = createPendingUser(turnId, "keep me");
assert.equal(appendUniqueMessages([pending], [pending]).length, 1);
assert.equal(nextConversationAfterDelete(conversationId, turnId, [conversationId]), conversationId);
assert.equal(nextConversationAfterDelete(conversationId, conversationId, [turnId]), turnId);
assert.equal(nextConversationAfterDelete(conversationId, conversationId, []), null);

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
// D = game-data citations from lookup_poe2_game_data; must match services/coach/src/response.py.
assert.equal(parseInline("[Dd623fea68d8b]")[0]?.kind, "citation");
assert.equal(parseInline("[X0123456789ab]")[0]?.kind, "text");

function expectedThreadHex(namespace: string | null): string {
  const prefix = namespace === null ? "" : `${namespace}:`;
  const bytes = createHmac("sha256", "test-secret")
    .update(`${prefix}1:${conversationId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return bytes.toString("hex");
}

console.log("ALL PASS — coach contract, thread IDs and safe Markdown parser");
