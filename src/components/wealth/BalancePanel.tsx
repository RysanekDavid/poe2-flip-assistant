"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";
import { ComputedLeague } from "../ui/ComputedLeague";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { PanelLoading } from "../shell/PanelLoading";
import { useTabRoute } from "../shell/useTabRoute";
import { PnlHero, SplitBar, TabBreakdown, ValueChart } from "./WealthCharts";
import { ManualForm, NetWorthCard } from "./NetWorthCard";
import { useBalance, type BalanceData } from "./useBalance";

/** No snapshot yet: one line that says what fills it — the header's Read stash, or Settings first. */
function NoSnapshot({ stashEnabled }: { stashEnabled: boolean }) {
  const { go } = useTabRoute();
  return stashEnabled ? (
    <EmptyState icon={<Wallet className="h-5 w-5" />} sentence="No stash read yet — Read stash values your public tabs (1 search + up to 10 fetches)." />
  ) : (
    <EmptyState
      icon={<Wallet className="h-5 w-5" />}
      sentence="Connect your POESESSID and account name to read your public stash tabs."
      cta={
        <Button variant="secondary" size="sm" onClick={() => go("settings", "account")}>
          Open Settings
        </Button>
      }
    />
  );
}

function WorthBody({ data, onChanged }: { data: BalanceData; onChanged: () => void }) {
  const [manual, setManual] = useState(false);
  const latest = data.stats.latest;
  const chart = data.series.map((s) => ({ ms: parseSqliteTimestamp(s.fetched_at), value: s.net_worth_div }));
  return (
    <>
      {latest ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
          <NetWorthCard stats={data.stats} session={data.session} />
          <Panel title="Net worth over time" right={<ComputedLeague league={data.computedLeague} />}>
            <ValueChart points={chart} height={200} label="net worth" empty={["no history yet", "one snapshot — read again for a trend line"]} />
          </Panel>
        </div>
      ) : (
        <NoSnapshot stashEnabled={data.stashEnabled} />
      )}
      <div>
        <Button variant="ghost" size="sm" aria-expanded={manual} onClick={() => setManual((v) => !v)}>
          {manual ? "Close manual entry" : "No public tab? Enter currency by hand"}
        </Button>
        {manual && (
          <div className="mt-2 max-w-md">
            <ManualForm onSaved={() => { setManual(false); onChanged(); }} />
          </div>
        )}
      </div>
      {latest && (latest.other_div > 0 || data.tabs.length > 0) && (
        <SplitBar currencyDiv={latest.net_worth_div - latest.other_div} gearDiv={latest.other_div} />
      )}
      {data.tabs.length > 0 && <TabBreakdown tabs={data.tabs} series={data.tabSeries} />}
      <PnlHero pnl={data.pnl} league={data.pnlLeague} />
    </>
  );
}

/** Wealth › Net worth: what the public stash is worth now, this session and over time. */
export function BalancePanel({ reloadKey }: { reloadKey: number }) {
  const { data, error, load } = useBalance(reloadKey);
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="text-sm text-bad">Net worth unavailable: {error}</p>}
      {data ? <WorthBody data={data} onChanged={load} /> : !error && <PanelLoading />}
    </div>
  );
}
