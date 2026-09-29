"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import { meResponseSchema, navModeBodySchema, type MeUser } from "../../lib/learnContract";
import type { NavMode } from "../../lib/navMode";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { ShellFallback } from "./ShellFallback";

interface NavModeApi {
  me: MeUser;
  mode: NavMode;
  /** Persist a new mode for this user; rejects (and keeps the old mode) when the server refuses. */
  setMode: (mode: NavMode) => Promise<void>;
}

const NavModeContext = createContext<NavModeApi | null>(null);

/** The signed-in user and their nav mode. Only valid under NavModeProvider (the whole app shell). */
export function useNavMode(): NavModeApi {
  const api = useContext(NavModeContext);
  if (!api) throw new Error("useNavMode must be used under <NavModeProvider>");
  return api;
}

type Load = { kind: "loading" } | { kind: "ready"; me: MeUser } | { kind: "error"; message: string };

function useMe(): [Load, (me: MeUser) => void, () => void] {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/me")
      .then(async (r) => meResponseSchema.parse(await assertOk(r, "/api/auth/me").json()))
      .then(({ user }) => {
        if (!live) return;
        // Session revoked elsewhere: /me already cleared the cookie, so leave the private dashboard.
        if (user === null) router.replace("/login");
        else setLoad({ kind: "ready", me: user });
      })
      .catch((error: unknown) => {
        console.error("[nav-mode] could not load the current user", error);
        if (live) setLoad({ kind: "error", message: describeError(error) });
      });
    return () => {
      live = false;
    };
  }, [router, attempt]);
  const setMe = useCallback((me: MeUser) => setLoad({ kind: "ready", me }), []);
  const retry = useCallback(() => {
    setLoad({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return [load, setMe, retry];
}

async function postNavMode(mode: NavMode): Promise<NavMode> {
  const res = await fetch("/api/settings/nav-mode", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nav_mode: mode }),
  });
  return navModeBodySchema.parse(await assertOk(res, "POST /api/settings/nav-mode").json()).nav_mode;
}

/**
 * One /api/auth/me read decides the whole nav, so nothing renders until it lands: a beginner must
 * never see a flash of advanced tabs. Loading shows the static shell; a failure says so with a retry.
 */
export function NavModeProvider({ children }: { children: ReactNode }) {
  const [load, setMe, retry] = useMe();
  const me = load.kind === "ready" ? load.me : null;
  const setMode = useCallback(
    async (mode: NavMode) => {
      if (!me) throw new Error("setMode before the current user loaded");
      setMe({ ...me, nav_mode: await postNavMode(mode) });
    },
    [me, setMe],
  );
  const api = useMemo(() => (me ? { me, mode: me.nav_mode, setMode } : null), [me, setMode]);
  if (load.kind === "error") {
    return (
      <main className="mx-auto w-full max-w-screen-2xl p-6">
        <EmptyState
          icon={<RotateCw className="h-5 w-5" />}
          title="Could not load your account"
          sentence={load.message}
          cta={<Button onClick={retry}>Retry</Button>}
        />
      </main>
    );
  }
  if (!api) return <ShellFallback />;
  return <NavModeContext.Provider value={api}>{children}</NavModeContext.Provider>;
}
