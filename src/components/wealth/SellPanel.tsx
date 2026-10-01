"use client";

import type { ReactNode } from "react";
import { z } from "zod";
import { PackageOpen } from "lucide-react";
import type { RepriceStatus, SellResponse } from "../../lib/wealthContract";
import { fmtDivOrEx } from "../../lib/format";
import { parseSqliteTimestamp } from "../../lib/sqliteTime";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { PriceChip } from "../ui/PriceChip";
import { StaleBadge } from "../ui/StaleBadge";
import { usePersistedChoice } from "../ui/usePersistedChoice";
import { PanelLoading } from "../shell/PanelLoading";
import { SellCards } from "./SellCards";
import { SellTable } from "./SellTable";
import { useSell } from "./useSell";

const clock = (stamp: string): string =>
  new Date(parseSqliteTimestamp(stamp)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

const SOLD_NAMES_SHOWN = 3;

/** "3 gone since the read at 15:00: A, B +1 more" — sold, or delisted/moved private; trade2 can't tell which. */
function SoldLine({ data }: { data: SellResponse }) {
  const s = data.sold;
  if (s == null) return null;
  const ex = data.provenance.rates.exaltPerDivine;
  const shown = s.names.slice(0, SOLD_NAMES_SHOWN).join(", ");
  const more = s.names.length - SOLD_NAMES_SHOWN;
  return (
    <span className="min-w-0" title={s.names.length > 0 ? `${s.names.join(", ")} — sold, or delisted / moved to a private tab` : undefined}>
      <span className="font-semibold text-neutral-100">{s.count}</span> gone since the read at {clock(s.previousAt)}
      {shown !== "" && (
        <span className="text-neutral-300">
          : <span className="inline-block max-w-[18rem] truncate align-bottom">{shown}</span>
          {more > 0 && <span className="text-neutral-400"> +{more} more</span>}
        </span>
      )}
      {s.askDiv != null && <span className="text-neutral-400"> · asked {fmtDivOrEx(s.askDiv, ex)}</span>}
    </span>
  );
}

function repriceText(r: RepriceStatus): string {
  if (r.state === "queued") return "check queued — runs in the background, results in a few minutes";
  if (r.state === "running") return "checking your listings now…";
  if (r.state === "lost") return "check lost (server restarted) — request again";
  if (r.state === "failed") return `last check failed: ${r.error ?? "unknown error"}`;
  if (r.state === "done") return `checked ${r.checked} listing${r.checked === 1 ? "" : "s"}${r.finishedAt ? ` at ${clock(r.finishedAt)}` : ""}`;
  return r.candidates > 0 ? `${r.candidates} listing${r.candidates === 1 ? "" : "s"} over 1 div, listed > 1 day` : "no listing over 1 div listed > 1 day";
}

/** Queue a trade2 comparables check of your own stale listings (≤8 searches, then 6h cooldown). */
function RepriceAction({ r, requesting, error, onRequest }: { r: RepriceStatus; requesting: boolean; error: string | null; onRequest: () => void }) {
  const searches = Math.min(8, r.candidates);
  const blocked = r.nextAt != null || r.candidates === 0 || r.state === "queued" || r.state === "running";
  const next = r.nextAt == null ? null : `next check ${clock(r.nextAt)}`;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={r.state === "failed" || r.state === "lost" ? "text-amber-300" : "text-neutral-400"}>{repriceText(r)}</span>
      {next && <span className="text-neutral-500">· {next}</span>}
      <Button size="sm" variant="secondary" disabled={blocked || requesting} onClick={onRequest} title="trade2 comparables for your own listings: fair price + cheapest competitor">
        {requesting ? "Queuing…" : `Check prices · ${searches} search${searches === 1 ? "" : "es"}`}
      </Button>
      {error && <span role="alert" className="text-bad">{error}</span>}
    </span>
  );
}

function Summary({ data, children }: { data: SellResponse; children: ReactNode }) {
  const ex = data.provenance.rates.exaltPerDivine;
  const t = data.totals;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface/60 px-4 py-2.5 text-sm text-neutral-300">
      {data.snapshot && (
        <span className="flex items-center gap-1.5">
          last read <StaleBadge ageMin={data.snapshot.ageMin} warnAfterMin={6 * 60} />
        </span>
      )}
      <span className="flex items-center gap-1.5" title="whole stash, recommended route, net of exchange gold fees">
        get now <PriceChip div={t.fastDiv > 0 ? t.fastDiv : null} exPerDiv={ex} /> · patient <PriceChip div={t.patientDiv > 0 ? t.patientDiv : null} exPerDiv={ex} />
      </span>
      {t.byVerdict.reprice > 0 && <span className="text-amber-300">{t.byVerdict.reprice} to reprice</span>}
      {t.unpricedCount > 0 && <span className="text-neutral-400">{t.unpricedCount} unpriced</span>}
      <SoldLine data={data} />
      <span className="ml-auto">{children}</span>
    </div>
  );
}

const VIEWS = ["cards", "table"] as const;
type SellView = (typeof VIEWS)[number];
const VIEW_SCHEMA = z.enum(VIEWS);
const VIEW_LABEL: Record<SellView, string> = { cards: "Cards", table: "Table view" };

/** Cards are the default reading; the table stays one click away for scanning many rows. */
function ViewToggle({ view, onChange }: { view: SellView; onChange: (v: SellView) => void }) {
  return (
    <div role="group" aria-label="Sell layout" className="inline-flex rounded-md border border-line p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={view === v}
          onClick={() => onChange(v)}
          className={`h-7 rounded px-2.5 text-xs font-medium ${view === v ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:text-neutral-100"}`}
        >
          {VIEW_LABEL[v]}
        </button>
      ))}
    </div>
  );
}

/** Stash › Sell: per stash item, sell on the exchange now, list, reprice or hold. */
export function SellPanel({ reloadKey }: { reloadKey: number }) {
  const { data, error, repriceError, requesting, requestReprice } = useSell(reloadKey);
  const [view, setView] = usePersistedChoice<SellView>("stash-sell-view", VIEW_SCHEMA, "cards");
  if (error) return <p role="alert" className="text-sm text-bad">Sell plan unavailable: {error}</p>;
  if (!data) return <PanelLoading />;
  const empty = data.rows.length === 0;
  return (
    <div className="space-y-3">
      {empty ? (
        <EmptyState icon={<PackageOpen className="h-5 w-5" />} sentence={data.reason ?? "Nothing to sell in your last read — read your stash to fill this."} />
      ) : (
        <>
          <Summary data={data}>
            <RepriceAction r={data.reprice} requesting={requesting} error={repriceError} onRequest={requestReprice} />
          </Summary>
          <div className="flex justify-end">
            <ViewToggle view={view} onChange={setView} />
          </div>
          {view === "cards" ? <SellCards data={data} /> : <SellTable data={data} />}
        </>
      )}
      {data.warnings.length > 0 && (
        <ul className="space-y-0.5 text-xs text-amber-300/90">
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
