"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Wrong name or password." : "Login failed.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6">
        <div>
          <h1 className="text-xl font-bold">PoE2 Flip Assistant</h1>
          <p className="text-sm text-neutral-500">Sign in to continue</p>
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Account name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="username"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-xs text-neutral-400">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-sky-500"
          />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button
          type="submit"
          disabled={busy || !name || !password}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-emerald-600/60 bg-gradient-to-b from-emerald-700 to-emerald-800 px-3 py-2 text-sm font-semibold text-white transition hover:from-emerald-600 hover:to-emerald-700 active:scale-[0.99] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
