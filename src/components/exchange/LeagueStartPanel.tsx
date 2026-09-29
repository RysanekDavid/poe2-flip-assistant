"use client";

import { useCallback, useState } from "react";
import { Hourglass } from "lucide-react";
import { z } from "zod";
import { assertOk, describeError, warnOnFailure } from "../../lib/clientWarn";
import {
  leagueStartPresetResponseSchema,
  leagueStartResponseSchema,
  type LeagueStartResponse,
} from "../../lib/leagueStartContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { Button } from "../ui/Button";
import { DataTable } from "../ui/DataTable";
import { EmptyState } from "../ui/EmptyState";
import { Panel } from "../ui/Panel";
import { InfoTip } from "../ui/Tooltip";
import { LEAGUE_START_COLUMNS } from "./leagueStartColumns";

const ROUTE = "/api/league/start";
const PRESET_ROUTE = "/api/league/start/presets";
// Curves are daily and "now" is hourly; a quarter-hour poll is plenty.
const POLL_MS = 15 * 60_000;

function useLeagueStart() {
  const [data, setData] = useState<LeagueStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    fetch(ROUTE, { cache: "no-store" })
      .then(async (r) => {
        setData(leagueStartResponseSchema.parse(await assertOk(r, ROUTE).json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[league-start] view")(e);
        setError(describeError(e));
      });
  }, []);
  useVisiblePoll(load, POLL_MS);
  return { data, error };
}

/** A 409 from the preset route carries the reason (mode off, nothing to add) — show it, not "HTTP 409". */
const refusalSchema = z.object({ error: z.string() });

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

function basisTip(d: LeagueStartResponse): string {
  const past = d.pastLeagues.map((p) => `${p.league} (${p.daysAvailable}d)`).join(", ") || "none yet";
  return (
    `Based on ${plural(d.basedOn, "past league start")}: ${past}. Each is read from GGG's hourly exchange archive, ` +
    `6 sampled hours per day. ${d.baseLeague} has ${plural(d.recordedDays, "day")} recorded so far and becomes a past league for the next one.`
  );
}

function PresetButton({ disabled }: { disabled: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const add = () => {
    setBusy(true);
    fetch(PRESET_ROUTE, { method: "POST" })
      .then(async (r) => {
        if (r.status === 409) return setResult(refusalSchema.parse(await r.json()).error);
        const body = leagueStartPresetResponseSchema.parse(await assertOk(r, PRESET_ROUTE).json());
        setResult(`${plural(body.added.length, "item")} added${body.alreadyWatched > 0 ? `, ${body.alreadyWatched} already watched` : ""}`);
      })
      .catch((e: unknown) => {
        warnOnFailure("[league-start] preset")(e);
        setResult(describeError(e));
      })
      .finally(() => setBusy(false));
  };
  return (
    <>
      {result && <span className="text-xs text-neutral-400">{result}</span>}
      <Button variant="primary" size="sm" disabled={disabled || busy} onClick={add}>
        Watch top 10 sell-now
      </Button>
    </>
  );
}

function ActivePanel({ d }: { d: LeagueStartResponse }) {
  const hasSell = d.items.some((i) => i.signal === "sell-now" && i.watchItemId != null);
  const right = (
    <>
      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
        {plural(d.basedOn, "past league start")}
        <InfoTip tip={basisTip(d)} align="end" />
      </span>
      <PresetButton disabled={!hasSell} />
    </>
  );
  return (
    <Panel title={`League start · day ${(d.day ?? 0) + 1} of ${d.curveDays}`} right={right} collapsible>
      {d.items.length === 0 ? (
        <p className="text-sm text-neutral-400">{d.note ?? "Nothing to say for today yet."}</p>
      ) : (
        <DataTable
          columns={LEAGUE_START_COLUMNS}
          rows={d.items}
          rowKey={(r) => r.baseId}
          emptyState={<p className="text-sm text-neutral-400">{d.note}</p>}
        />
      )}
    </Panel>
  );
}

/** Exchange tab: full panel during a league's first days, one quiet line otherwise. */
export function LeagueStartPanel() {
  const { data, error } = useLeagueStart();
  if (error) return <p className="text-xs text-bad">League start: {error}</p>;
  if (data == null) return null;
  if (data.active) return <ActivePanel d={data} />;
  return (
    <EmptyState
      icon={<Hourglass className="h-4 w-4" />}
      title="League start"
      sentence={`${data.note ?? "Off."} ${plural(data.basedOn, "past league start")} recorded.`}
    />
  );
}
