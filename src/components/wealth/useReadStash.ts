"use client";

import { useCallback, useState } from "react";
import { readResponseSchema, type ReadResponse } from "../../lib/balanceContract";
import { postJson } from "./useBalance";

export interface ReadMessage {
  text: string;
  tone: "ok" | "warn" | "bad";
}

/** Result line of a read — loud when trade2's 100-id cap cut the cheapest listings, or prices degraded. */
function readSummary(d: ReadResponse): ReadMessage {
  const s = d.scan;
  const parts = [`read ${s.listingsSeen}/${s.total} listings · ${s.divine} div ${s.exalted} ex ${s.chaos} c`];
  if (s.truncated) parts.push(`${s.total - s.listingsSeen} cheapest listings not read (trade2 caps a search at 100)`);
  if (d.warning) parts.push(d.warning);
  return { text: parts.join(" · "), tone: s.truncated || d.warning ? "warn" : "ok" };
}

/**
 * The Wealth tab's one trade-spending action (1 search + up to 10 fetches). Both tools read from
 * the snapshot it stores, so `version` bumps on success and each panel reloads on it.
 */
export function useReadStash(): { busy: boolean; msg: ReadMessage | null; version: number; read: () => void } {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<ReadMessage | null>(null);
  const [version, setVersion] = useState(0);
  const read = useCallback(() => {
    setBusy(true);
    setMsg(null);
    postJson("/api/balance/read", readResponseSchema)
      .then((d) => {
        setMsg(readSummary(d));
        setVersion((v) => v + 1);
      })
      .catch((e: unknown) => setMsg({ text: `stash read failed: ${e instanceof Error ? e.message : String(e)}`, tone: "bad" }))
      .finally(() => setBusy(false));
  }, []);
  return { busy, msg, version, read };
}
