"use client";

import { useState } from "react";
import type { SellRow, SellVerdict } from "../../lib/wealthContract";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { Button } from "../ui/Button";
import type { PriceSource } from "../ui/PriceChip";
import { fmtAgeMin } from "../ui/StaleBadge";

/** One label, colour and definition per verdict, shared by the Sell cards and the table view. */
export const VERDICT: Record<SellVerdict, { label: string; className: string; tip: string }> = {
  "sell-cx": { label: "Sell now", className: "border-good/40 bg-good/10 text-good", tip: "The exchange is the better route: sell there now at the market mid." },
  list: { label: "List", className: "border-neutral-600 text-neutral-200", tip: "Sell on the trade site: list at the fair price, or keep a listing that is within 15% of fair." },
  reprice: { label: "Reprice", className: "border-amber-400/50 bg-amber-400/10 text-amber-300", tip: "Your ask is more than 15% over fair — lower it to the fair price in the note." },
  hold: { label: "Hold", className: "border-neutral-600 text-neutral-300", tip: "Up 25%+ in 7 days on a liquid market — keep it, it likely pays more next week." },
  unpriced: { label: "Unpriced", className: "border-line text-neutral-400", tip: "No market price found, so these are left out of the totals." },
};

export const SOURCE: Record<SellRow["valueSource"], PriceSource | undefined> = {
  cx: "cx", ninja: "ninja", scout: "scout", trade: "trade", none: undefined,
};

export function VerdictChip({ v }: { v: SellVerdict }) {
  const { label, className } = VERDICT[v];
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${className}`}>{label}</span>;
}

/** "listed 4d" — how long the listing has sat; the age is the case for a reprice. */
export function listedAge(listedAt: string | null): string | null {
  if (listedAt == null) return null;
  const at = parseSqliteTimestamp(listedAt);
  return `listed ${fmtAgeMin((Date.now() - at) / 60_000)}`;
}

/** The listing age only where it argues for the verdict (a list or reprice), else null. */
export function verdictAge(row: SellRow): string | null {
  return row.verdict === "reprice" || row.verdict === "list" ? listedAge(row.listedAt) : null;
}

export function CopyNote({ note }: { note: string | null }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  if (note == null) return null;
  const copy = () => {
    navigator.clipboard
      .writeText(note)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch((e: unknown) => {
        console.warn("[sell] clipboard write failed:", e instanceof Error ? e.message : e);
        setFailed(true);
      });
  };
  return (
    <Button size="sm" variant="secondary" onClick={copy} title={failed ? `copy failed — select it: ${note}` : `copy "${note}" for the stash tab note`}>
      {copied ? "Copied" : failed ? note : "Copy note"}
    </Button>
  );
}
