import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { SESSION_COOKIE } from "../auth/sessionContract";

const TEST_SECRET = "test-only-edge-session-secret";

function request(path: string, headers?: HeadersInit): NextRequest {
  return new NextRequest(`http://127.0.0.1:3000${path}`, { headers });
}

async function main(): Promise<void> {
  process.env.AUTH_SECRET = TEST_SECRET;
  const root = await middleware(
    request("/", {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }),
  );
  assert.equal(root.status, 307);
  assert.equal(root.headers.get("location"), "/login");
  assert.doesNotMatch(root.headers.get("location") ?? "", /localhost|attacker/i);

  const publicRoot = await middleware(new NextRequest("https://flip.example.test/"));
  assert.equal(publicRoot.headers.get("location"), "/login");

  const api = await middleware(request("/api/health"));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: "unauthorized" });
  assert.equal((await middleware(request("/login"))).status, 200);
  assert.equal((await middleware(request("/api/auth/login"))).status, 200);

  const forged = request("/");
  forged.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, "wrong-secret"));
  assert.equal((await middleware(forged)).headers.get("location"), "/login");
  const forgedApi = request("/api/health");
  forgedApi.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, "wrong-secret"));
  assert.equal((await middleware(forgedApi)).status, 401);

  const expired = request("/");
  expired.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() - 1, TEST_SECRET));
  assert.equal((await middleware(expired)).status, 307);

  const authenticated = request("/");
  authenticated.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, TEST_SECRET));
  assert.equal((await middleware(authenticated)).status, 200);
  console.log("ALL PASS — proxy-safe auth routing");
}

function signedToken(userId: number, expires: number, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: expires })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
