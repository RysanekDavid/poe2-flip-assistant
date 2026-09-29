"use client";

import type { HintAction, SellHint as Hint } from "../../../lib/priceCheckContract";
import { PriceChip } from "../../ui/PriceChip";

const TITLE: Record<HintAction, string> = {
  "sell-cx": "Sell on the exchange now",
  list: "List it on trade",
  hold: "Hold",
  none: "No sell route",
};

const TONE: Record<HintAction, string> = {
  "sell-cx": "border-amber-400/40",
  list: "border-sky-400/40",
  hold: "border-line",
  none: "border-line",
};

function Row({ label, div, ex, title }: { label: string; div: number | null; ex: number | null; title?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={title}>
      <span className="text-neutral-400">{label}</span>
      <PriceChip div={div} exPerDiv={ex} />
    </span>
  );
}

function fmtEta(h: number): string {
  return h < 1 ? "<1h to fill" : `~${Math.round(h)}h to fill`;
}

/** A stack total after the gold fee; at or under zero the order loses money, which "—" would hide. */
function NetRow({ label, div, ex, title }: { label: string; div: number | null; ex: number | null; title: string }) {
  if (div != null && div <= 0) {
    return (
      <span className="text-sm text-bad" title={title}>
        {label}: fee ≥ proceeds — don&apos;t post
      </span>
    );
  }
  return <Row label={label} div={div} ex={ex} title={title} />;
}

function ExchangeRows({ hint, ex }: { hint: Hint; ex: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <NetRow label="now, after fee" div={hint.cxFastTotalDiv} ex={ex} title="whole stack at the fast exchange price, minus the gold fee we could price" />
      <NetRow label="patient" div={hint.cxPatientTotalDiv} ex={ex} title="whole stack at the patient exchange price, minus the fee" />
      {hint.feeTotalDiv == null ? (
        <span className="text-xs text-neutral-400" title="the gold fee could not be priced — it is unknown, not zero">fee unknown</span>
      ) : (
        <Row label="fee" div={hint.feeTotalDiv} ex={ex} />
      )}
      {hint.tier && <span className="text-xs text-neutral-400">{hint.tier} market{hint.etaHours != null ? ` · ${fmtEta(hint.etaHours)}` : ""}</span>}
    </div>
  );
}

function ListRows({ hint, ex }: { hint: Hint; ex: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <Row label="list at" div={hint.listAtDiv} ex={ex} title="fair price per unit" />
      <Row label="quick" div={hint.quickDiv} ex={ex} title="undercut to the front of the listings" />
      <Row label="patient" div={hint.patientDiv} ex={ex} title="what a buyer in a hurry tends to pay" />
      {hint.note && <code className="rounded bg-neutral-900 px-1.5 text-xs text-neutral-200">{hint.note}</code>}
    </div>
  );
}

/** How to turn the item into currency: exchange now after the fee, list at a price, or hold. */
export function SellHint({ hint, ex }: { hint: Hint; ex: number | null }) {
  const exchange = hint.cxFastTotalDiv != null;
  const listing = hint.listAtDiv != null;
  return (
    <section className={`rounded-lg border bg-neutral-950/60 p-3 ${TONE[hint.action]}`} aria-label="Sell hint">
      <h3 className="text-sm font-semibold text-neutral-100">{TITLE[hint.action]}</h3>
      <p className="text-sm text-neutral-400">{hint.reason}</p>
      {(exchange || listing) && (
        <div className="mt-2 flex flex-col gap-1">
          {exchange && <ExchangeRows hint={hint} ex={ex} />}
          {listing && <ListRows hint={hint} ex={ex} />}
          {hint.competitionNote && <p className="text-xs text-amber-300">{hint.competitionNote}</p>}
        </div>
      )}
    </section>
  );
}
