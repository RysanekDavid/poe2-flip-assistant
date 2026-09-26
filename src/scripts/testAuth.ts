/* Login hardening + session revocation against a TEMP DB. No network.
 * Run: npm run test:auth (src/scripts/runWithTestEnv.ts sets DB_PATH + AUTH_SECRET). */
import assert from "node:assert/strict";
import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { rmSync } from "node:fs";
import { config } from "../config/env";
import { getDb } from "../db/database";
import { POST as login } from "../app/api/auth/login/route";
import { signSession, verifySession } from "../auth/auth";
import { hashPassword, hashPasswordSync, verifyPassword } from "../auth/credentials";
import { clientIp, createLoginRateLimiter, loginRateLimitKey } from "../auth/loginRateLimit";
import { meResponse } from "../auth/meResponse";
import { changePassword } from "../auth/passwordChange";
import { resolveSessionUser } from "../auth/session";
import {
  authenticate,
  bumpSessionVersion,
  createUser,
  getSessionVersion,
  setPassword,
} from "../db/userQueries";

if (!/scratchpad|tmp|temp/.test(config.dbPath)) {
  console.error(`refusing to run against ${config.dbPath} — point DB_PATH at a temp file.`);
  process.exit(1);
}

function testRateLimiter(): void {
  let now = 1_000_000;
  const limiter = createLoginRateLimiter({ maxFailures: 5, windowMs: 15 * 60_000, now: () => now });
  const key = loginRateLimitKey("203.0.113.9", "Alice");
  assert.equal(key, loginRateLimitKey("203.0.113.9", " alice "), "username case/space share a budget");
  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal(limiter.check(key).allowed, true);
    limiter.recordFailure(key);
    now += 60_000;
  }
  limiter.recordFailure(key);
  const blocked = limiter.check(key);
  assert.equal(blocked.allowed, false, "5 failures inside 15 min must block");
  // Oldest failure at t0 expires at t0+15min; we are at t0+4min → 11 min left.
  assert.equal(blocked.allowed ? 0 : blocked.retryAfterSec, 11 * 60);
  assert.equal(limiter.check(loginRateLimitKey("198.51.100.1", "alice")).allowed, true, "other IP");
  assert.equal(limiter.check(loginRateLimitKey("203.0.113.9", "bob")).allowed, true, "other user");
  now += 11 * 60_000;
  assert.equal(limiter.check(key).allowed, true, "sliding window releases the oldest failure");
  limiter.recordFailure(key);
  assert.equal(limiter.check(key).allowed, false, "still 5 inside the window");
  limiter.recordSuccess(key);
  assert.equal(limiter.check(key).allowed, true, "success clears the key");

  const small = createLoginRateLimiter({ maxKeys: 3, now: () => now });
  for (const name of ["a", "b", "c", "d"]) small.recordFailure(loginRateLimitKey("ip", name));
  assert.equal(small.size(), 3, "key cap evicts instead of growing");

  assert.equal(clientIp(new Headers({ "x-forwarded-for": "10.0.0.1, 203.0.113.7" })), "203.0.113.7");
  assert.equal(clientIp(new Headers()), "unknown");
}

async function testPasswordHashing(): Promise<void> {
  // Exact legacy format written by the old synchronous implementation.
  const salt = randomBytes(16);
  const legacy = `scrypt$${salt.toString("hex")}$${scryptSync("hunter22", salt, 64).toString("hex")}`;
  assert.equal(await verifyPassword("hunter22", legacy), true, "legacy hash still verifies");
  assert.equal(await verifyPassword("hunter23", legacy), false);
  assert.equal(await verifyPassword("hunter22", "scrypt$zz"), false, "malformed hash");
  assert.equal(await verifyPassword("hunter22", "bcrypt$a$b"), false, "foreign scheme");
  assert.equal(await verifyPassword("pw-async", await hashPassword("pw-async")), true);
  assert.equal(await verifyPassword("pw-sync", hashPasswordSync("pw-sync")), true);
  assert.match(await hashPassword("x"), /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
}

function legacyToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + 60_000 })).toString("base64url");
  const signature = createHmac("sha256", config.authSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

async function testSessionRevocation(): Promise<void> {
  const user = await createUser("revoke-me", "first-password", "member");
  assert.equal(getSessionVersion(user.id), 0);
  const legacy = legacyToken(user.id);
  assert.equal(verifySession(legacy)?.ver, 0, "token without ver counts as version 0");
  assert.equal(resolveSessionUser(legacy)?.id, user.id, "pre-deploy sessions stay valid");
  const current = signSession(user.id, 60_000);
  assert.equal(resolveSessionUser(current)?.id, user.id);

  assert.equal(bumpSessionVersion(user.id), 1);
  assert.equal(resolveSessionUser(legacy), null, "log-out-everywhere revokes legacy tokens");
  assert.equal(resolveSessionUser(current), null, "log-out-everywhere revokes signed tokens");
  const afterBump = signSession(user.id, 60_000);
  assert.equal(resolveSessionUser(afterBump)?.id, user.id, "a fresh login works again");

  await setPassword(user.id, "second-password");
  assert.equal(getSessionVersion(user.id), 2);
  assert.equal(resolveSessionUser(afterBump), null, "password change revokes sessions");
  assert.equal(await authenticate("revoke-me", "first-password"), null);
  assert.equal((await authenticate("REVOKE-ME", "second-password"))?.id, user.id);
  assert.equal(await authenticate("nobody-here", "second-password"), null, "unknown user");
  assert.throws(() => signSession(987_654, 60_000), /unknown user/);
}

function loginRequest(name: string, password: string, ip: string): Request {
  return new Request("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ name, password }),
  });
}

async function testLoginRoute(): Promise<void> {
  await createUser("route-user", "route-password", "member");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(loginRequest("route-user", "wrong", "192.0.2.10"))).status, 401);
  }
  const limited = await login(loginRequest("route-user", "route-password", "192.0.2.10"));
  assert.equal(limited.status, 429, "6th attempt is throttled even with the right password");
  assert.ok(Number(limited.headers.get("retry-after")) > 0, "429 carries Retry-After");
  const elsewhere = await login(loginRequest("route-user", "route-password", "192.0.2.11"));
  assert.equal(elsewhere.status, 200, "throttle is per IP+username");
  const cookie = elsewhere.headers.get("set-cookie") ?? "";
  assert.match(cookie, /poe2flip_session=[^;]+\.[^;]+/);
  assert.match(cookie, /HttpOnly/i);
  const token = /poe2flip_session=([^;]+)/.exec(cookie)?.[1];
  assert.equal(resolveSessionUser(token)?.name, "route-user");
  assert.equal((await login(loginRequest("", "x", "192.0.2.12"))).status, 400);
}

type LimiterModule = typeof import("../auth/loginRateLimit");

/** Next inlines the limiter module into each route bundle; both copies must share one Map. */
function testLimiterSurvivesModuleDuplication(): void {
  const path = require.resolve("../auth/loginRateLimit");
  const first = require(path) as LimiterModule;
  delete require.cache[path];
  const copy = require(path) as LimiterModule;
  assert.notEqual(copy.createLoginRateLimiter, first.createLoginRateLimiter, "a genuinely separate module copy");
  assert.equal(copy.loginRateLimiter, first.loginRateLimiter, "both copies use the process-wide limiter");
}

function passwordRequest(current: string, next: string, ip: string): Request {
  return new Request("http://127.0.0.1:3000/api/auth/password", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ current, next }),
  });
}

async function testSharedBudgetAcrossRoutes(): Promise<void> {
  const changer = await createUser("budget-a", "budget-a-password", "member");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const wrong = await changePassword(passwordRequest("wrong", "new-password-a", "192.0.2.20"), changer);
    assert.equal(wrong.status, 403);
  }
  const login429 = await login(loginRequest("budget-a", "budget-a-password", "192.0.2.20"));
  assert.equal(login429.status, 429, "password-change failures exhaust the login budget");

  const guesser = await createUser("budget-b", "budget-b-password", "member");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(loginRequest("BUDGET-B", "wrong", "192.0.2.21"))).status, 401);
  }
  const change429 = await changePassword(passwordRequest("budget-b-password", "new-password-b", "192.0.2.21"), guesser);
  assert.equal(change429.status, 429, "login failures exhaust the password-change budget");
  assert.ok(Number(change429.headers.get("retry-after")) > 0);
  assert.equal(await authenticate("budget-b", "new-password-b"), null, "throttled change did not apply");
}

async function testMeClearsRevokedCookie(): Promise<void> {
  const user = await createUser("me-revoked", "me-password", "member");
  const token = signSession(user.id, 60_000);
  const live = meResponse(token);
  assert.deepEqual(await live.json(), { user: { id: user.id, name: "me-revoked", role: "member" } });
  assert.equal(live.headers.get("set-cookie"), null, "a valid session is left alone");
  bumpSessionVersion(user.id);
  const revoked = meResponse(token);
  assert.deepEqual(await revoked.json(), { user: null });
  assert.match(revoked.headers.get("set-cookie") ?? "", /poe2flip_session=;.*Max-Age=0/i, "revoked cookie is cleared");
  const anonymous = meResponse(undefined);
  assert.equal(anonymous.headers.get("set-cookie"), null, "no cookie, nothing to clear");
}

async function main(): Promise<void> {
  // Fresh DB every run: the test creates fixed usernames.
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${config.dbPath}${suffix}`, { force: true });
  getDb();
  testRateLimiter();
  await testPasswordHashing();
  await testSessionRevocation();
  await testLoginRoute();
  testLimiterSurvivesModuleDuplication();
  await testSharedBudgetAcrossRoutes();
  await testMeClearsRevokedCookie();
  console.log("ALL PASS — login rate limit (shared across routes), async scrypt compat, session revocation");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
