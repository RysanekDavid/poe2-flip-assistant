import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionPayload, parseSessionToken, SESSION_COOKIE } from "./auth/sessionContract";

/**
 * Edge-safe auth gate. Validate signature and expiry before allowing a page or API request;
 * node-runtime handlers still resolve the user from the database as defense in depth.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // CSRF defense in depth on top of SameSite=Lax: browsers always send Origin on cross-site
  // mutating requests. Absent Origin = non-browser client (local agent, curl) and is allowed;
  // those carry no ambient cookies worth protecting.
  if (isCrossOriginMutation(req)) {
    return NextResponse.json({ error: "cross-origin request rejected" }, { status: 403 });
  }

  // Always-open paths: the login page and the auth API (login/logout/me).
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && await verifyEdgeSession(token, process.env.AUTH_SECRET)) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return loginRedirect(req);
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isCrossOriginMutation(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return false;
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  const config = originConfig();
  if (config.kind === "invalid") return !matchesHostHeader(origin, req.headers.get("host"));
  return origin !== (config.kind === "configured" ? config.origin : new URL(req.url).origin);
}

/** Fallback when APP_ORIGIN is broken: the browser's Origin must at least name the Host it hit. */
function matchesHostHeader(origin: string, host: string | null): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch (error: unknown) {
    // "null" or garbage Origin: unparseable means it cannot match, so reject the mutation.
    if (error instanceof TypeError) return false;
    throw error;
  }
}

function loginRedirect(req: NextRequest): NextResponse {
  const config = originConfig();
  if (config.kind === "invalid") {
    // Serve the login page in place: an internal rewrite never puts the Host header or the
    // internal upstream address into a response, and Next's adapter rejects relative Locations.
    return NextResponse.rewrite(new URL("/login", req.url));
  }
  const base = config.kind === "configured" ? config.origin : new URL(req.url).origin;
  return NextResponse.redirect(new URL("/login", base));
}

type OriginConfig = { kind: "configured"; origin: string } | { kind: "dev-request" } | { kind: "invalid" };

// A lone trailing slash was accepted before this check existed; URL.origin drops it anyway.
const ORIGIN_SHAPE = /^https?:\/\/(?:[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*|\[[0-9A-Fa-f:.]+\])(?::\d{1,5})?\/?$/;
const ORIGIN_FALLBACK = "falling back to Origin-vs-Host checks and in-place login rewrites";
let originCache: { key: string; config: OriginConfig } | null = null;

/**
 * The public origin: APP_ORIGIN, never the internal upstream or a Host header. Dev without
 * APP_ORIGIN uses the request's own origin. A missing (production) or malformed value is logged
 * once and degrades to Origin-vs-Host checks and in-place login rewrites instead of throwing —
 * a throw here would 500 every request, including the login needed to fix anything.
 */
function originConfig(): OriginConfig {
  const raw = process.env.APP_ORIGIN ?? "";
  const production = process.env.NODE_ENV === "production";
  const key = `${production ? "prod" : "dev"}|${raw}`;
  if (originCache?.key !== key) originCache = { key, config: parseOriginConfig(raw, production) };
  return originCache.config;
}

function parseOriginConfig(raw: string, production: boolean): OriginConfig {
  if (raw === "") {
    if (!production) return { kind: "dev-request" };
    console.error(`[middleware] APP_ORIGIN is not set in production; ${ORIGIN_FALLBACK}`);
    return { kind: "invalid" };
  }
  const origin = ORIGIN_SHAPE.test(raw) ? parsedOrigin(raw) : null;
  if (origin === null || (production && !origin.startsWith("https://"))) {
    console.error(
      `[middleware] APP_ORIGIN=${JSON.stringify(raw)} is invalid — expected ` +
        `${production ? "https" : "http(s)"}://host[:port] with no path, query or credentials; ${ORIGIN_FALLBACK}`,
    );
    return { kind: "invalid" };
  }
  return { kind: "configured", origin };
}

/** Normalized origin, or null when the shape passed but URL still rejects it (e.g. port 99999). */
function parsedOrigin(raw: string): string | null {
  try {
    return new URL(raw).origin;
  } catch (error: unknown) {
    if (error instanceof TypeError) return null;
    throw error;
  }
}

async function verifyEdgeSession(token: string, secret: string | undefined): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseSessionToken(token);
  if (!parsed || !decodeSessionPayload(parsed.payload)) return false;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(parsed.signature),
      new TextEncoder().encode(parsed.payload),
    );
  } catch (error: unknown) {
    if (error instanceof DOMException) return false;
    throw error;
  }
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const decoded = atob(padded);
  const buffer = new ArrayBuffer(decoded.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return buffer;
}

// Skip Next internals and static assets; everything else is gated.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
