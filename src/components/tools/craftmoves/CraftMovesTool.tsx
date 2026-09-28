"use client";

import { useState } from "react";
import {
  CRAFT_MOVES_MAX_TEXT,
  craftMovesResponseSchema,
  rulesStale,
  type CraftMovesResponse,
} from "../../../lib/tools/craftMovesContract";
import { postJson, SAMPLE_ITEM } from "./craftMovesClient";
import { ItemStateCard } from "./ItemStateCard";
import { MovesTable } from "./MovesTable";
import { GatesTable } from "./GatesTable";
import { ValueCard } from "./ValueCard";

type View = { kind: "idle" } | { kind: "loading" } | { kind: "error"; error: string } | { kind: "done"; text: string; r: CraftMovesResponse };

/** Rules + data stamp. Amber once the rules pass their re-verify date or the data leaves 0.5.x. */
function PatchStrip({ r }: { r: CraftMovesResponse }) {
  const stale = rulesStale() || !r.patch.data.startsWith("0.5");
  const title = stale
    ? `rules verified for ${r.patch.rules} — past ${r.patch.reverifyAfter} (1.0) or on newer game data they need re-verifying before you trust them`
    : `rules verified for ${r.patch.rules} until ${r.patch.reverifyAfter}; mod data from RePoE ${r.patch.repoe}`;
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-1.5 text-xs ${stale ? "border-amber-700 bg-amber-950/30 text-amber-300" : "border-neutral-800 text-neutral-500"}`}>
      <span title={title}>
        rules {r.patch.rules} · data {r.patch.data}
        {stale ? " · RE-VERIFY" : ""}
      </span>
      <span title="material prices: latest poe.ninja snapshots">{r.league}</span>
      {r.odds.map((o) => (
        <a key={o.url} href={o.url} target="_blank" rel="noreferrer" className="text-sky-500 hover:underline" title="we show no odds: PoE2 mod weights are not public">
          {o.label}
        </a>
      ))}
    </div>
  );
}

function PasteBox({ text, setText, busy, onRead }: { text: string; setText: (t: string) => void; busy: boolean; onRead: () => void }) {
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
        placeholder="Hover an item in game, Ctrl+C (Ctrl+Alt+C adds exact affix headers), paste here"
        className="h-40 w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs text-neutral-200 placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onRead}
          disabled={busy || text.trim() === ""}
          className="rounded-md border border-amber-700 bg-amber-900/30 px-3 py-1 text-sm text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
          title="Ctrl+Enter"
        >
          {busy ? "reading…" : "Read item"}
        </button>
        <button onClick={() => setText(SAMPLE_ITEM)} className="text-xs text-neutral-500 hover:text-neutral-300">
          sample item
        </button>
      </div>
    </div>
  );
}

function Results({ text, r }: { text: string; r: CraftMovesResponse }) {
  const ex = r.rates.exaltPerDivine;
  return (
    <div className="flex flex-col gap-3">
      <PatchStrip r={r} />
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex flex-col gap-3">
          <ItemStateCard s={r.state} />
          <ValueCard text={text} book={r.bookValue} bookError={r.bookError} ex={ex} />
        </div>
        <MovesTable moves={r.moves} blocked={r.blocked} locked={r.locked} ex={ex} />
      </div>
      <GatesTable gates={r.gates} ilvl={r.state.ilvl} />
    </div>
  );
}

/** Paste an item → its slot state, the legal next craft moves (priced), tier gates and value. */
export function CraftMovesTool() {
  const [text, setText] = useState("");
  const [view, setView] = useState<View>({ kind: "idle" });

  const read = async (): Promise<void> => {
    const snapshot = text;
    setView({ kind: "loading" });
    try {
      const r = await postJson("/api/tools/craft-moves", { text: snapshot }, craftMovesResponseSchema);
      setView(r.ok ? { kind: "done", text: snapshot, r: r.data } : { kind: "error", error: r.error });
    } catch (e: unknown) {
      console.error("[craft-moves] read failed", e);
      setView({ kind: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <PasteBox text={text} setText={setText} busy={view.kind === "loading"} onRead={() => void read()} />
      {view.kind === "error" && <p className="text-sm text-red-400">{view.error}</p>}
      {view.kind === "done" && <Results text={view.text} r={view.r} />}
    </section>
  );
}
