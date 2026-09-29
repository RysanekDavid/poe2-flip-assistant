"use client";

import { BalancePanel } from "../../wealth/BalancePanel";
import { SellPanel } from "../../wealth/SellPanel";
import { useReadStash, type ReadMessage } from "../../wealth/useReadStash";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { ToolChips } from "../ToolChips";
import { useTabRoute } from "../useTabRoute";

const HEADER = {
  worth: { title: "Net worth", purpose: "What your public stash is worth now, this session and over time." },
  sell: { title: "Sell", purpose: "What to sell now, list, reprice or hold — from your last stash read." },
} as const;

const LEGEND =
  "Read stash = one trade search on your account + up to 10 fetches: currency and priced items in your PUBLIC tabs " +
  "(private tabs are invisible to trade). Read-only — nothing is ever listed, bought or whispered for you.";

const TONE: Record<ReadMessage["tone"], string> = { ok: "text-neutral-400", warn: "text-amber-300", bad: "text-bad" };

/** Wealth: net worth (tool=worth) and the Sell column (tool=sell), both fed by one Read stash. */
export function WealthTab() {
  const { tool } = useTabRoute();
  const stash = useReadStash();
  const sell = tool === "sell";
  const { title, purpose } = sell ? HEADER.sell : HEADER.worth;
  return (
    <>
      <PageHeader
        title={title}
        purpose={purpose}
        legend={LEGEND}
        action={
          <>
            <ToolChips tab="wealth" />
            <Button variant="primary" onClick={stash.read} disabled={stash.busy} title="1 trade search + up to 10 fetches">
              {stash.busy ? "Reading…" : "Read stash"}
            </Button>
          </>
        }
      />
      {stash.msg && (
        <p role={stash.msg.tone === "bad" ? "alert" : "status"} className={`text-sm ${TONE[stash.msg.tone]}`}>
          {stash.msg.text}
        </p>
      )}
      {sell ? <SellPanel reloadKey={stash.version} /> : <BalancePanel reloadKey={stash.version} />}
    </>
  );
}
