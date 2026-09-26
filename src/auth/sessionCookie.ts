import type { NextResponse } from "next/server";
import { signSession, SESSION_COOKIE } from "./auth";
import { SESSION_TTL_MS } from "./sessionContract";

/** Issue a fresh session cookie signed with the user's current session_version. */
export function setSessionCookie(res: NextResponse, userId: number): void {
  res.cookies.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
}
