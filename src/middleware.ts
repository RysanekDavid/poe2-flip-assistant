import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decodeSessionPayload, parseSessionToken, SESSION_COOKIE } from "./auth/sessionContract";

/**
 * Edge-safe auth gate. Validate signature and expiry before allowing a page or API request;
 * node-runtime handlers still resolve the user from the database as defense in depth.
 */
export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // Always-open paths: the login page and the auth API (login/logout/me).
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token && await verifyEdgeSession(token, process.env.AUTH_SECRET)) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // A relative Location is intentional: building an absolute URL from req.nextUrl would leak
  // the internal localhost upstream, while trusting Host/X-Forwarded-Host enables open redirects.
  return new NextResponse(null, { status: 307, headers: { Location: "/login" } });
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
