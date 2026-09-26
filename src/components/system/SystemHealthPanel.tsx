"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import iconSettings from "../../assets/settings.png";
import { assertOk, describeError, warnOnFailure } from "../../lib/clientWarn";
import { systemHealthSchema, type SystemHealth } from "../../lib/systemHealthContract";
import { useVisiblePoll } from "../../lib/useVisiblePoll";
import { HeartbeatTable } from "./HeartbeatTable";
import {
  STATUS_TONE,
  TONE_DOT,
  TONE_TEXT,
  coachTone,
  dbTone,
  diskTone,
  formatBytes,
  formatSeconds,
  tradeTone,
  type Tone,
} from "./healthTone";

const POLL_MS = 60_000;

/** Owner-only payload; a 401/403 means this viewer gets no System section at all. */
function useSystemHealth() {
  const [data, setData] = useState<SystemHealth | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hiddenRef = useRef(false);

  const load = useCallback(() => {
    if (hiddenRef.current) return;
    fetch("/api/system/health", { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) {
          hiddenRef.current = true;
          setHidden(true);
          return;
        }
        setData(systemHealthSchema.parse(await assertOk(r, "/api/system/health").json()));
        setError(null);
      })
      .catch((e: unknown) => {
        warnOnFailure("[system] health")(e);
        setError(describeError(e));
      });
  }, []);

  useVisiblePoll(load, POLL_MS);
  return { data, hidden, error, reload: load };
}

function Chip({ label, tone, title, children }: { label: string; tone: Tone; title: string; children: ReactNode }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 rounded border border-neutral-800 bg-neutral-950/50 px-2 py-1">
      <span className={`h-1.5 w-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      <span className={`tabular-nums ${TONE_TEXT[tone]}`}>{children}</span>
    </span>
  );
}

function coachChip(coach: SystemHealth["coach"]): { text: string; title: string } {
  if (!coach.reachable) return { text: "down", title: `Coach unreachable — ${coach.error}` };
  const flags = [
    `market ${coach.marketReady ? "ready" : "NOT ready"}${coach.marketFresh === false ? " (stale)" : ""}`,
    `knowledge ${coach.knowledgeReady ? "ready" : "missing"}`,
    `model ${coach.modelConfigured ? coach.model : "not configured"}`,
    `agent ${coach.agentReady === false ? "not ready" : "ready"}`,
    `patch monitor ${coach.patchMonitorReady ? "ok" : "off"} · ${coach.pendingPatchReviews} review(s) pending`,
  ];
  return { text: coach.status, title: flags.join("\n") };
}

function tradeChip(gov: SystemHealth["trade2"][number], nowMs: number): { text: string; title: string } {
  const windows = gov.windows.map((w) => `${w.used}/${w.limit} per ${formatSeconds(w.periodSec)}`).join("\n");
  const blockedMs = gov.blockedUntil ? Date.parse(gov.blockedUntil) - nowMs : 0;
  if (blockedMs > 0) return { text: `blocked ${formatSeconds(blockedMs / 1000)}`, title: `GGG restriction until ${gov.blockedUntil}\n${windows}` };
  const peak = gov.windows.reduce((m, w) => (w.limit > 0 ? Math.max(m, w.used / w.limit) : m), 0);
  return { text: `${Math.round(peak * 100)}%`, title: `busiest window share (shared by web + poller)\n${windows}` };
}

function SummaryChips({ health, nowMs }: { health: SystemHealth; nowMs: number }) {
  const { db, disk } = health;
  const freelistPct = db.pageCount > 0 ? Math.round((db.freelistCount / db.pageCount) * 100) : 0;
  const coach = coachChip(health.coach);
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Chip label="build" tone="ok" title="deployed commit (APP_COMMIT_SHA)">
        <span className="font-mono">{health.build}</span>
      </Chip>
      <Chip
        label="db"
        tone={dbTone(db)}
        title={`file ${formatBytes(db.fileBytes)} + WAL ${formatBytes(db.walBytes)}\n${db.pageCount} pages × ${db.pageSize} B\nfreelist ${db.freelistCount} pages (${formatBytes(db.freelistCount * db.pageSize)}) — reclaimed by the monthly VACUUM`}
      >
        {formatBytes(db.fileBytes + db.walBytes)} · {freelistPct}% free
      </Chip>
      <Chip label="disk" tone={diskTone(health)} title={disk.error ?? "free space on the data volume; VACUUM needs ~2× the DB"}>
        {disk.freeBytes == null ? "unknown" : formatBytes(disk.freeBytes)}
      </Chip>
      <Chip label="coach" tone={coachTone(health.coach)} title={coach.title}>
        {coach.text}
      </Chip>
      {health.trade2.map((gov) => {
        const chip = tradeChip(gov, nowMs);
        return (
          <Chip key={gov.kind} label={`trade2 ${gov.kind}`} tone={tradeTone(gov, nowMs)} title={chip.title}>
            {chip.text}
          </Chip>
        );
      })}
    </div>
  );
}

/** Owner-only ops view in the Settings tab: poller heartbeats, Coach, DB/disk, trade2 governor. */
export function SystemHealthPanel() {
  const { data, hidden, error, reload } = useSystemHealth();
  if (hidden) return null;
  const nowMs = data ? Date.parse(data.generatedAt) : 0;
  const problems = data?.heartbeats.filter((h) => STATUS_TONE[h.status] === "bad").length ?? 0;

  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <header className="mb-3 flex flex-wrap items-center gap-2.5">
        <Image src={iconSettings} alt="" width={22} height={22} className="opacity-90" />
        <h2 className="text-lg font-semibold">System</h2>
        <span className="text-xs text-neutral-500" title="visible to the owner only">owner</span>
        {data && (
          <span className={`text-xs ${problems > 0 ? "text-bad" : "text-neutral-500"}`}>
            {problems > 0 ? `${problems} loop(s) need attention` : "all loops healthy"}
          </span>
        )}
        <button onClick={reload} title="refresh now" className="ml-auto text-neutral-500 hover:text-neutral-200">
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>
      {error && <p role="alert" className="mb-2 text-xs text-bad">system health unavailable — {error}</p>}
      {!data && !error && <p className="text-xs text-neutral-500">loading…</p>}
      {data && (
        <div className="grid gap-3">
          <SummaryChips health={data} nowMs={nowMs} />
          <HeartbeatTable rows={data.heartbeats} nowMs={nowMs} />
        </div>
      )}
    </section>
  );
}
