"use client";

import { useEffect, useState } from "react";
import {
  ExplainResponseSchema,
  RegexApiError,
  requestRegexApi,
  type ExplainResponse,
} from "../../../lib/tools/regexContract";

type ExplainTerm = ExplainResponse["terms"][number];

interface ExplainState {
  result: ExplainResponse | null;
  error: { message: string; position: number | null } | null;
  loading: boolean;
}

const DEBOUNCE_MS = 350;

function useExplain(text: string): ExplainState {
  const [state, setState] = useState<ExplainState>({ result: null, error: null, loading: false });
  useEffect(() => {
    if (text.trim() === "") {
      setState({ result: null, error: null, loading: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      requestRegexApi("/api/tools/regex/explain", { method: "POST", body: { text } }, ExplainResponseSchema)
        .then((result) => live && setState({ result, error: null, loading: false }))
        .catch((e: unknown) => {
          if (!live) return;
          const position = e instanceof RegexApiError ? e.position : null;
          setState({ result: null, error: { message: e instanceof Error ? e.message : String(e), position }, loading: false });
        });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);
  return state;
}

function ErrorWithCaret({ text, error }: { text: string; error: NonNullable<ExplainState["error"]> }) {
  const p = error.position;
  return (
    <div className="flex flex-col gap-1 text-xs">
      {p !== null && p < text.length && (
        <code className="font-mono text-neutral-400">
          {text.slice(0, p)}
          <span className="rounded-sm bg-bad/40 text-neutral-50">{text.charAt(p)}</span>
          {text.slice(p + 1)}
        </code>
      )}
      <span className="text-bad">{error.message}</span>
    </div>
  );
}

function TermRow({ term }: { term: ExplainTerm }) {
  const names = [...term.names.exchange, ...term.names.unique, ...term.names.base];
  const total = term.counts.exchange + term.counts.unique + term.counts.base;
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-baseline gap-2">
        <code className="font-mono text-amber-200">{term.raw}</code>
        <span className="text-neutral-500">
          {term.negated ? "excludes" : "matches"} {total} item/base names
        </span>
        {term.counts.stat > 0 && (
          <span className="rounded bg-warn/15 px-1.5 text-[10px] font-semibold text-warn" title="mod lines this term also hits — items with these mods light up too">
            +{term.counts.stat} mod lines
          </span>
        )}
      </span>
      {names.length > 0 && <span className="text-neutral-400" title={names.join(", ")}>{names.slice(0, 12).join(" · ")}{total > 12 ? " …" : ""}</span>}
    </li>
  );
}

function ExplainResult({ result }: { result: ExplainResponse }) {
  return (
    <div className="flex flex-col gap-2 text-xs">
      <ul className="flex flex-col gap-1.5">
        {result.terms.map((t, i) => (
          <TermRow key={i} term={t} />
        ))}
      </ul>
      <div className="text-neutral-400" title={result.highlighted.join(", ")}>
        <span className="font-semibold text-neutral-200">{result.highlightedCount}</span> priced items light up
        {result.highlighted.length > 0 && <>: {result.highlighted.slice(0, 10).join(" · ")}{result.highlightedCount > 10 ? " …" : ""}</>}
      </div>
    </div>
  );
}

/** Paste any stash-search string (ours, poeregex, poe2.re) and see what it would light up. */
export function RegexExplain({ text, onText }: { text: string; onText: (t: string) => void }) {
  const { result, error, loading } = useExplain(text);
  return (
    <section className="flex flex-col gap-2 rounded-md border border-neutral-800 bg-neutral-900/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder='explain a search string, e.g. "!rune|ess" …'
          spellCheck={false}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 font-mono text-sm text-neutral-100 placeholder:font-sans placeholder:text-neutral-600"
        />
        <span
          className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase text-neutral-500"
          title="Alternatives are matched as plain text. The in-game box also accepts regex syntax (. * [ ] …), which this explainer does not evaluate — a string using it may light up more than shown."
        >
          literal · regex syntax not evaluated
        </span>
        {loading && <span className="text-xs text-neutral-600">…</span>}
      </div>
      {error && <ErrorWithCaret text={text} error={error} />}
      {result && !error && <ExplainResult result={result} />}
    </section>
  );
}
