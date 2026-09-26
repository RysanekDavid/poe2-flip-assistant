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
  return NextResponse.redirect(loginUrl(req));
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isCrossOriginMutation(req: NextRequest): boolean {
  if (!MUTATING_METHODS.has(req.method.toUpperCase())) return false;
  const origin = req.headers.get("origin");
  if (origin === null) return false;
  return origin !== appOrigin(req);
}

function loginUrl(req: NextRequest): URL {
  return new URL("/login", appOrigin(req));
}

/**
 * The public origin: validated APP_ORIGIN, never the internal upstream or a Host header.
 * Dev without APP_ORIGIN falls back to the request's own origin.
 */
function appOrigin(req: NextRequest): string {
  const configured = process.env.APP_ORIGIN;
  if (!configured) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("APP_ORIGIN is required in production (redirects + Origin check)");
    }
    return new URL(req.url).origin;
  }
  const origin = new URL(configured);
  const invalidShape = origin.username !== "" || origin.password !== "" ||
    origin.pathname !== "/" || origin.search !== "" || origin.hash !== "";
  if (invalidShape || (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) {
    throw new Error("APP_ORIGIN must be a bare HTTPS origin in production");
  }
  return origin.origin;
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
