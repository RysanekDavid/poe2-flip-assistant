"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "../../../api/types";
import {
  BuildResponseSchema,
  REGEX_MAX_CHARS_DEFAULT,
  RegexParamsSchema,
  requestRegexApi,
  type BuildResponse,
  type PricePresetParams,
} from "../../../lib/tools/regexContract";
import { PresetBar } from "./PresetBar";
import { RegexExplain } from "./RegexExplain";
import { DataAgeStrip, RegexOutput } from "./RegexOutput";
import { RegexParamsForm } from "./RegexParamsForm";

// Per browser, not per user: the stash-search limit is a property of the game client.
const MAX_CHARS_KEY = "tools-regex-max-chars";
const BUILD_DEBOUNCE_MS = 300;

const DEFAULT_PARAMS: PricePresetParams = {
  tab: "price",
  mode: "keep",
  minDiv: 1,
  categories: CATEGORIES.map((c) => c.type),
  includeUniques: true,
};

function readStoredMaxChars(): number | null {
  try {
    const raw = localStorage.getItem(MAX_CHARS_KEY);
    if (raw === null) return null;
    const parsed = RegexParamsSchema.shape.maxChars.safeParse(Number(raw));
    if (!parsed.success) {
      console.warn(`[tools/regex] ignoring stored max chars "${raw}"`);
      return null;
    }
    return parsed.data;
  } catch (error: unknown) {
    console.warn("[tools/regex] could not read max chars from localStorage", error);
    return null;
  }
}

function useMaxChars(): [number, (n: number) => void] {
  const [value, setValue] = useState(REGEX_MAX_CHARS_DEFAULT);
  // Restored after mount: the server render has no localStorage.
  useEffect(() => {
    const stored = readStoredMaxChars();
    if (stored !== null) setValue(stored);
  }, []);
  const set = (n: number): void => {
    setValue(n);
    try {
      if (n === REGEX_MAX_CHARS_DEFAULT) localStorage.removeItem(MAX_CHARS_KEY);
      else localStorage.setItem(MAX_CHARS_KEY, String(n));
    } catch (error: unknown) {
      console.warn("[tools/regex] could not persist max chars to localStorage", error);
    }
  };
  return [value, set];
}

interface BuildState {
  result: BuildResponse | null;
  error: string | null;
  loading: boolean;
}

/** Debounced rebuild on every change; the last good result stays on screen while it runs. */
function useBuild(params: PricePresetParams, maxChars: number): BuildState {
  const [state, setState] = useState<BuildState>({ result: null, error: null, loading: true });
  useEffect(() => {
    const body = RegexParamsSchema.safeParse({ ...params, maxChars });
    if (!body.success) {
      const issue = body.error.issues[0];
      setState((s) => ({ ...s, loading: false, error: issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid input" }));
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true }));
    const t = setTimeout(() => {
      requestRegexApi("/api/tools/regex/build", { method: "POST", body: body.data }, BuildResponseSchema)
        .then((result) => live && setState({ result, error: null, loading: false }))
        .catch((e: unknown) => live && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })));
    }, BUILD_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [params, maxChars]);
  return state;
}

export function RegexTool() {
  const [params, setParams] = useState<PricePresetParams>(DEFAULT_PARAMS);
  const [maxChars, setMaxChars] = useMaxChars();
  const [explainText, setExplainText] = useState("");
  const { result, error, loading } = useBuild(params, maxChars);
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-neutral-100">Price regex</h2>
          <span
            className="text-xs text-neutral-500"
            title="Each name is cut to its shortest piece that no other item name, base type or mod line contains — the stash search matches every line of an item."
          >
            stash search for what&apos;s worth keeping
          </span>
          {loading && <span className="text-xs text-neutral-600">building…</span>}
        </div>
        {result && <DataAgeStrip dataAsOf={result.dataAsOf} league={result.league} namespaceSize={result.namespaceSize} />}
      </header>
      <RegexParamsForm params={params} onChange={setParams} maxChars={maxChars} onMaxChars={setMaxChars} />
      <PresetBar params={params} onLoad={setParams} />
      {error && <div className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>}
      {result && <RegexOutput result={result} maxChars={maxChars} onExplain={setExplainText} />}
      <RegexExplain text={explainText} onText={setExplainText} />
    </section>
  );
}
