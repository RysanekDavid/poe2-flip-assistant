"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "../../../api/types";
import {
  BuildResponseSchema,
  RegexParamsSchema,
  requestRegexApi,
  type BuildResponse,
  type PresetParams,
  type PricePresetParams,
} from "../../../lib/tools/regexContract";
import { Panel } from "../../ui/Panel";
import { PresetBar } from "./PresetBar";
import { RegexExplain } from "./RegexExplain";
import { DataAgeStrip, RegexOutput } from "./RegexOutput";
import { RegexParamsForm } from "./RegexParamsForm";
import { ResultBar } from "./ResultBar";

const BUILD_DEBOUNCE_MS = 300;

export const DEFAULT_PRICE_PARAMS: PricePresetParams = {
  tab: "price",
  mode: "keep",
  minDiv: 1,
  categories: CATEGORIES.map((c) => c.type),
  includeUniques: true,
};

interface BuildState {
  result: BuildResponse | null;
  error: string | null;
  loading: boolean;
}

/** Debounced server rebuild on every change (live prices); the last good result stays on screen. */
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

interface PricePanelProps {
  params: PricePresetParams;
  onChange: (p: PricePresetParams) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

/** Price tab: highlight stash items worth at least a price (server-built from live ninja/scout prices). */
export function PriceRegexPanel({ params, onChange, maxChars, onMaxChars }: PricePanelProps) {
  const [explainText, setExplainText] = useState("");
  const { result, error, loading } = useBuild(params, maxChars);
  const loadPreset = (p: PresetParams) => {
    if (p.tab !== "price") throw new Error(`preset for ${p.tab} offered on the price tab`);
    onChange(p);
  };
  const reason = result && result.reason !== null ? `Nothing to search for: ${result.reason}.` : null;
  return (
    <div className="flex flex-col gap-4">
      <ResultBar
        strings={result?.reason === null ? result.chunks : []}
        warnings={result?.warnings ?? []}
        reason={reason}
        error={error}
        maxChars={maxChars}
        busy={loading}
        onExplain={setExplainText}
        actions={result ? <DataAgeStrip dataAsOf={result.dataAsOf} league={result.league} namespaceSize={result.namespaceSize} /> : undefined}
      />
      <Panel title="What to keep">
        <div className="flex flex-col gap-3">
          <RegexParamsForm params={params} onChange={onChange} maxChars={maxChars} onMaxChars={onMaxChars} />
          <PresetBar tab="price" params={params} onLoad={loadPreset} />
        </div>
      </Panel>
      {result && <RegexOutput result={result} />}
      <RegexExplain text={explainText} onText={setExplainText} />
    </div>
  );
}
