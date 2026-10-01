"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "../ui/Button";

const PER_CATEGORY = 2;

const SeedResponseSchema = z.object({
  added: z.array(z.object({ itemId: z.string(), item: z.string(), category: z.string() })),
  perCategory: z.number(),
});

async function seedWatchlist(): Promise<number> {
  const r = await fetch("/api/discover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ perCategory: PER_CATEGORY }),
  });
  const body: unknown = await r.json();
  if (!r.ok) {
    const msg = typeof body === "object" && body !== null && "error" in body ? String((body as { error: unknown }).error) : null;
    throw new Error(msg ?? `watch top flips failed (${r.status})`);
  }
  return SeedResponseSchema.parse(body).added.length;
}

/**
 * The Flips page's primary action: put the best-scoring flips of every category on your watchlist.
 * Every list on the page listens for "watchlist-changed", so the watchlist and the Watch buttons
 * refresh without a reload.
 */
export function WatchTopFlipsButton() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const run = () => {
    setBusy(true);
    setMsg(null);
    seedWatchlist()
      .then((n) => {
        window.dispatchEvent(new Event("watchlist-changed"));
        setMsg({ text: n === 0 ? "No flip to watch yet — prices appear after the next market poll." : `Watching the top ${n} — see your watchlist below.`, bad: false });
      })
      .catch((e: unknown) => setMsg({ text: e instanceof Error ? e.message : String(e), bad: true }))
      .finally(() => setBusy(false));
  };
  return (
    <>
      {msg && (
        <span role={msg.bad ? "alert" : "status"} className={`text-sm ${msg.bad ? "text-bad" : "text-neutral-400"}`}>
          {msg.text}
        </span>
      )}
      <Button
        variant="primary"
        onClick={run}
        disabled={busy}
        title={`Add the ${PER_CATEGORY} best-scoring flips of every category to your watchlist`}
      >
        {busy ? "Adding…" : "Watch top flips"}
      </Button>
    </>
  );
}
