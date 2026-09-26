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
  process.env.APP_ORIGIN = "https://app.example.test";
  const root = await middleware(
    request("/", {
      host: "attacker.example",
      "x-forwarded-host": "attacker.example",
      "x-forwarded-proto": "https",
    }),
  );
  assert.equal(root.status, 307);
  assert.equal(root.headers.get("location"), "https://app.example.test/login");
  assert.doesNotMatch(root.headers.get("location") ?? "", /localhost|attacker/i);

  const publicRoot = await middleware(new NextRequest("https://flip.example.test/"));
  assert.equal(publicRoot.headers.get("location"), "https://app.example.test/login");

  const api = await middleware(request("/api/health"));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: "unauthorized" });
  assert.equal((await middleware(request("/login"))).status, 200);
  assert.equal((await middleware(request("/api/auth/login"))).status, 200);

  const forged = request("/");
  forged.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, "wrong-secret"));
  assert.equal(
    (await middleware(forged)).headers.get("location"),
    "https://app.example.test/login",
  );
  const forgedApi = request("/api/health");
  forgedApi.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, "wrong-secret"));
  assert.equal((await middleware(forgedApi)).status, 401);

  const expired = request("/");
  expired.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() - 1, TEST_SECRET));
  assert.equal((await middleware(expired)).status, 307);

  const authenticated = request("/");
  authenticated.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, TEST_SECRET));
  assert.equal((await middleware(authenticated)).status, 200);

  const versioned = request("/");
  versioned.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, TEST_SECRET, 3));
  assert.equal((await middleware(versioned)).status, 200, "versioned tokens pass the edge gate");
  const badVersion = request("/api/health");
  badVersion.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, TEST_SECRET, -1));
  assert.equal((await middleware(badVersion)).status, 401, "negative version is malformed");

  await checkOriginGate();
  console.log("ALL PASS — proxy-safe auth routing + Origin check");
}

function mutation(path: string, method: string, origin?: string): NextRequest {
  const headers: Record<string, string> = origin === undefined ? {} : { origin };
  const req = new NextRequest(`http://127.0.0.1:3000${path}`, { method, headers });
  req.cookies.set(SESSION_COOKIE, signedToken(1, Date.now() + 60_000, TEST_SECRET));
  return req;
}

async function checkOriginGate(): Promise<void> {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const foreign = await middleware(mutation("/api/watchlist", method, "https://evil.example"));
    assert.equal(foreign.status, 403, `${method} from a foreign origin is rejected`);
  }
  const loginCsrf = await middleware(mutation("/api/auth/login", "POST", "https://evil.example"));
  assert.equal(loginCsrf.status, 403, "login CSRF is rejected too");
  assert.equal((await middleware(mutation("/api/watchlist", "POST", "null"))).status, 403);
  const sameOrigin = await middleware(mutation("/api/watchlist", "POST", "https://app.example.test"));
  assert.equal(sameOrigin.status, 200, "same-origin browser mutation passes");
  assert.equal((await middleware(mutation("/api/watchlist", "POST"))).status, 200, "no Origin = agent/curl");
  const foreignGet = await middleware(mutation("/api/watchlist", "GET", "https://evil.example"));
  assert.equal(foreignGet.status, 200, "safe methods are not Origin-gated");
  const upstream = await middleware(mutation("/api/watchlist", "POST", "http://127.0.0.1:3000"));
  assert.equal(upstream.status, 403, "internal upstream origin is not the app origin");
}

function signedToken(userId: number, expires: number, secret: string, version?: number): string {
  const body = version === undefined ? { uid: userId, exp: expires } : { uid: userId, exp: expires, ver: version };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
