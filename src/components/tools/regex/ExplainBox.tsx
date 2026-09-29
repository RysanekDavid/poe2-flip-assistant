"use client";

import { useMemo } from "react";
import { tooltipLines } from "../../../core/tools/regex/searchEmulator";
import { PASTED_ITEM_KEY, type ExplainJob, type ExplainJobResult } from "../../../lib/tools/regexExplainJob";
import { Panel } from "../../ui/Panel";
import { Tooltip } from "../../ui/Tooltip";
import { useExplainWorker, type ExplainRun } from "./useExplainWorker";

export interface ExplainSample {
  key: string;
  label: string;
  lines: string[];
}

type OkItems = Extract<ExplainJobResult, { ok: true }>["items"];

function ParseError({ search, message, position }: { search: string; message: string; position: number | null }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      {position !== null && position < search.length && (
        <code className="break-all font-mono text-neutral-300">
          {search.slice(0, position)}
          <span className="rounded-sm bg-bad/40 text-neutral-50">{search.charAt(position)}</span>
          {search.slice(position + 1)}
        </code>
      )}
      <span className="text-bad">{message}</span>
    </div>
  );
}

function TermList({ items, samples }: { items: OkItems; samples: readonly ExplainSample[] }) {
  const first = items[0]?.evaluation;
  if (!first?.ok) return null;
  const labelOf = new Map(samples.map((s) => [s.key, s.label]));
  return (
    <ul className="flex flex-col gap-1.5 text-xs">
      {first.terms.map((term, i) => {
        const hits = items.filter((it) => it.key !== PASTED_ITEM_KEY && it.evaluation.ok && (it.evaluation.terms[i]?.hitLines.length ?? 0) > 0);
        const names = hits.map((h) => labelOf.get(h.key) ?? h.key);
        return (
          <li key={`${i}:${term.raw}`} className="flex flex-wrap items-baseline gap-2">
            <code className="font-mono text-amber-200">{term.raw}</code>
            <span className="text-neutral-400">{term.negated ? "hides items with" : "lights items with"}</span>
            {names.length === 0 ? (
              <span className="text-neutral-300">no mod line of this item kind (header or base text)</span>
            ) : (
              <Tooltip tip={names.join(" · ")}>
                <span className="text-neutral-200">{names.length} {names.length === 1 ? "mod" : "mods"}: {names.slice(0, 3).join(" · ")}{names.length > 3 ? " …" : ""}</span>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function PastedVerdict({ items }: { items: OkItems }) {
  const pasted = items.find((i) => i.key === PASTED_ITEM_KEY)?.evaluation;
  if (!pasted) return null;
  if (!pasted.ok) return <p className="text-xs text-bad">pasted item: {pasted.error}</p>;
  const failed = pasted.terms.filter((t) => !t.holds).map((t) => t.raw);
  return (
    <p className={`text-sm font-semibold ${pasted.matched ? "text-good" : "text-neutral-300"}`}>
      Pasted item {pasted.matched ? "lights up" : "stays dark"}
      {failed.length > 0 && <span className="font-normal text-neutral-400"> — fails {failed.join(", ")}</span>}
    </p>
  );
}

function RunView({ run, search, samples }: { run: ExplainRun; search: string; samples: readonly ExplainSample[] }) {
  switch (run.status) {
    case "idle":
      return null;
    case "running":
      return <p className="text-xs text-neutral-400">evaluating…</p>;
    case "timeout":
      return <p className="text-sm text-warn">Too complex to evaluate — stopped after {run.ms} ms. The string may still work in-game; this explainer refuses to guess.</p>;
    case "failed":
      return <p className="text-sm text-bad">Explain failed: {run.message}</p>;
    case "done":
      if (!run.result.ok) return <ParseError search={search} message={run.result.error} position={run.result.position} />;
      // Vendor has no mod pool to sample: the string parsed, and only a pasted item can say more
      if (samples.length === 0 && !run.result.items.some((i) => i.key === PASTED_ITEM_KEY)) {
        return <p className="text-sm text-good">Valid search string — paste an item (Ctrl+C in game) to test it.</p>;
      }
      return (
        <div className="flex flex-col gap-2">
          <PastedVerdict items={run.result.items} />
          <TermList items={run.result.items} samples={samples} />
        </div>
      );
  }
}

const TEXTAREA = "w-full rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 font-mono text-sm text-neutral-100 placeholder:font-sans placeholder:text-neutral-500";

/**
 * Paste any stash-search string (ours, poeregex, poe2.re) and optionally an item (Ctrl+C in game):
 * see which mods each term lights and whether the item would light up. Runs in a Web Worker.
 */
export function ExplainBox({ search, onSearch, pasted, onPasted, samples }: {
  search: string;
  onSearch: (s: string) => void;
  pasted: string;
  onPasted: (s: string) => void;
  samples: readonly ExplainSample[];
}) {
  const job = useMemo<ExplainJob | null>(() => {
    if (search.trim() === "" || search.length > 500) return null;
    const items = samples.map((s) => ({ key: s.key, lines: s.lines }));
    const item = pasted.trim() === "" ? [] : [{ key: PASTED_ITEM_KEY, lines: tooltipLines(pasted).slice(0, 100) }];
    return { search, items: [...items, ...item] };
  }, [search, pasted, samples]);
  const run = useExplainWorker(job);
  return (
    <Panel title="Explain a search string">
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Search string
          <textarea rows={2} value={search} spellCheck={false} maxLength={500} onChange={(e) => onSearch(e.target.value)} placeholder='e.g. "!fir|aos" acc|alt' className={TEXTAREA} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          Item text (optional — hover an item in-game, Ctrl+C, paste)
          <textarea rows={2} value={pasted} spellCheck={false} maxLength={8000} onChange={(e) => onPasted(e.target.value)} placeholder="Item Class: Waystones…" className={TEXTAREA} />
        </label>
      </div>
      <div className="mt-3">
        <RunView run={run} search={search} samples={samples} />
      </div>
    </Panel>
  );
}
