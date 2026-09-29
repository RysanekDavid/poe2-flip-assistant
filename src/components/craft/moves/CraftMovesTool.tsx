"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CRAFT_MOVES_MAX_TEXT,
  craftMovesResponseSchema,
  rulesStale,
  type CraftMovesResponse,
} from "../../../lib/tools/craftMovesContract";
import { Button } from "../../ui/Button";
import { Panel } from "../../ui/Panel";
import { postJson, SAMPLE_ITEM } from "./craftMovesClient";
import { GatesTable } from "./GatesTable";
import { ItemStateCard } from "./ItemStateCard";
import { MoveCards } from "./MoveCards";
import { MovesTable } from "./MovesTable";
import { SellAsIsCard } from "./SellAsIsCard";
import { ShareLink } from "./ShareLink";

type View = { kind: "idle" } | { kind: "loading" } | { kind: "error"; error: string } | { kind: "done"; text: string; seq: number; r: CraftMovesResponse };

/** A paste settles for this long before it is read — typing into the box must not fire per key. */
const AUTO_READ_MS = 400;

/** Rules + data stamp. Amber once the rules pass their re-verify date or the data leaves 0.5.x. */
function PatchLine({ r }: { r: CraftMovesResponse }) {
  const stale = rulesStale() || !r.patch.data.startsWith("0.5");
  const title = stale
    ? `rules verified for ${r.patch.rules} — past ${r.patch.reverifyAfter} (1.0) or on newer game data they need re-verifying before you trust them`
    : `rules verified for ${r.patch.rules} until ${r.patch.reverifyAfter}; mod data from RePoE ${r.patch.repoe}; material prices from poe.ninja (${r.league})`;
  return (
    <p className={`text-xs ${stale ? "text-amber-300" : "text-neutral-400"}`} title={title}>
      rules {r.patch.rules} · data {r.patch.data} · {r.league}
      {stale ? " · re-verify before trusting" : ""}
    </p>
  );
}

function useCraftRead() {
  const [view, setView] = useState<View>({ kind: "idle" });
  const seq = useRef(0);
  const lastRead = useRef<string | null>(null);
  const read = useCallback(async (text: string): Promise<void> => {
    lastRead.current = text;
    const mine = ++seq.current;
    setView({ kind: "loading" });
    try {
      const r = await postJson("/api/tools/craft-moves", { text }, craftMovesResponseSchema);
      if (mine !== seq.current) return; // a newer paste superseded this read
      setView(r.ok ? { kind: "done", text, seq: mine, r: r.data } : { kind: "error", error: r.error });
    } catch (e: unknown) {
      console.error("[craft-moves] read failed", e);
      if (mine === seq.current) setView({ kind: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  return { view, read, lastRead };
}

/** Reads the box by itself once a pasted item settles; the button stays for re-reads. */
function useAutoRead(text: string, read: (t: string) => Promise<void>, lastRead: { current: string | null }): void {
  useEffect(() => {
    const trimmed = text.trim();
    if (!/^Rarity:/m.test(trimmed) || trimmed === lastRead.current?.trim()) return;
    const t = window.setTimeout(() => void read(text), AUTO_READ_MS);
    return () => window.clearTimeout(t);
  }, [text, read, lastRead]);
}

function PasteBox({ text, setText, busy, onRead, compact }: { text: string; setText: (t: string) => void; busy: boolean; onRead: () => void; compact: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) onRead();
        }}
        maxLength={CRAFT_MOVES_MAX_TEXT}
        spellCheck={false}
        aria-label="Item text (Ctrl+C in game)"
        placeholder="Hover an item in game, press Ctrl+C (Ctrl+Alt+C adds exact affix headers) and paste here — it reads itself."
        className={`${compact ? "h-24" : "h-40"} w-full resize-y rounded-md border border-line bg-neutral-950 p-2 font-mono text-xs text-neutral-100 placeholder:text-neutral-500`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={onRead} disabled={busy || text.trim() === ""} title="Ctrl+Enter">
          {busy ? "reading…" : "Read item"}
        </Button>
        <Button size="sm" onClick={() => setText(SAMPLE_ITEM)}>
          Try sample item
        </Button>
      </div>
    </div>
  );
}

function Results({ view }: { view: Extract<View, { kind: "done" }> }) {
  const { r, text } = view;
  const [asIsDiv, setAsIsDiv] = useState<number | null>(null);
  const onLive = useCallback((div: number | null) => setAsIsDiv(div), []);
  const ex = r.rates.exaltPerDivine;
  const asIs = asIsDiv ?? r.bookValue?.valueDiv ?? null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-neutral-100">Next best moves</h3>
        <ShareLink text={text} />
      </div>
      <MoveCards key={view.seq} r={r} text={text} asIsDiv={asIs} />
      <div className="grid gap-3 lg:grid-cols-2">
        <ItemStateCard s={r.state} />
        <SellAsIsCard text={text} book={r.bookValue} bookError={r.bookError} ex={ex} onLive={onLive} />
      </div>
      <Panel title={`All ${r.moves.length} legal moves`} collapsible defaultOpen={false}>
        <MovesTable moves={r.moves} blocked={r.blocked} locked={r.locked} ex={ex} />
      </Panel>
      {r.gates.length > 0 && (
        <Panel title={`Tier gates at ilvl ${r.state.ilvl ?? "?"}`} collapsible defaultOpen={false}>
          <GatesTable gates={r.gates} />
        </Panel>
      )}
      <PatchLine r={r} />
    </div>
  );
}

/** Paste an item → the three next best moves (priced, no fake odds), its value as-is, the full legal list. */
export function CraftMovesTool({ initialText = null }: { initialText?: string | null }) {
  const [text, setText] = useState(initialText ?? "");
  const { view, read, lastRead } = useCraftRead();
  useAutoRead(text, read, lastRead);
  useEffect(() => {
    if (initialText != null) setText(initialText);
  }, [initialText]);
  return (
    <section className="flex flex-col gap-3">
      <PasteBox text={text} setText={setText} busy={view.kind === "loading"} onRead={() => void read(text)} compact={view.kind === "done"} />
      {view.kind === "error" && <p role="alert" className="text-sm text-bad">{view.error}</p>}
      {view.kind === "done" && <Results key={view.seq} view={view} />}
    </section>
  );
}
