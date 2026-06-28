import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie name is hardcoded (not imported from auth/auth) on purpose: middleware runs on the
// edge runtime, which can't load node:crypto / config (dotenv). Keep this in sync with
// SESSION_COOKIE in src/auth/auth.ts.
const SESSION_COOKIE = "poe2flip_session";

/**
 * Cheap auth gate. Middleware only checks for the *presence* of a session cookie — real
 * signature validation happens in node-runtime route handlers (getCurrentUser). This just
 * redirects logged-out visitors to /login and 401s unauthenticated API calls early.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Always-open paths: the login page and the auth API (login/logout/me).
  if (pathname === "/login" || pathname.startsWith("/api/auth")) return NextResponse.next();

  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  if (pathname.startsWith("/api")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

// Skip Next internals and static assets; everything else is gated.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
