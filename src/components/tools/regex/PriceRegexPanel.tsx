"use client";

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES } from "../../../api/types";
import {
  BuildResponseSchema,
  RegexParamsSchema,
  requestRegexApi,
  type BuildResponse,
  type PresetParams,
  type PricePresetParams,
} from "../../../lib/tools/regexContract";
import artDivine from "../../../assets/items/divine-orb.png";
import { DrawerSection, ExplainDrawer, ExplainToggle, SettingsMenu, useExplainDrawer } from "./BandTools";
import { describePrice } from "./describe";
import { FilterCard } from "./FilterCards";
import { PresetMenu } from "./PresetMenu";
import { RegexExplain } from "./RegexExplain";
import { CoveredTable, DataAgeStrip, UncoveredList } from "./RegexOutput";
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
  const { result, error, loading } = useBuild(params, maxChars);
  const strings = result?.reason === null ? result.chunks : [];
  const drawer = useExplainDrawer(strings[0]?.text);
  const sentence = useMemo(() => describePrice(params, CATEGORIES.length), [params]);
  const loadPreset = (p: PresetParams) => {
    if (p.tab !== "price") throw new Error(`preset for ${p.tab} offered on the price tab`);
    onChange(p);
  };
  const tools = (
    <>
      <PresetMenu tab="price" params={params} onLoad={loadPreset} />
      <ExplainToggle open={drawer.open} onToggle={drawer.toggle} controls={drawer.id} toggleRef={drawer.toggleRef} />
      <SettingsMenu maxChars={maxChars} onMaxChars={onMaxChars} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <ResultBar
        strings={strings}
        warnings={result?.warnings ?? []}
        reason={result && result.reason !== null ? `Nothing to search for: ${result.reason}.` : null}
        error={error}
        maxChars={maxChars}
        busy={loading}
        sentence={sentence}
        tools={tools}
        onClear={() => onChange(DEFAULT_PRICE_PARAMS)}
      />
      <FilterCard title="What to keep" art={artDivine} tip="Prices are Divine per unit from poe.ninja (exchange items) and poe2scout (uniques).">
        <RegexParamsForm params={params} onChange={onChange} />
        {result && <DataAgeStrip dataAsOf={result.dataAsOf} league={result.league} namespaceSize={result.namespaceSize} />}
      </FilterCard>
      {result?.reason === null && <UncoveredList rows={result.uncovered} mode={result.mode} />}
      <ExplainDrawer ref={drawer.ref} id={drawer.id} open={drawer.open} onClose={drawer.close}>
        {result?.reason === null && (
          <DrawerSection title="Items the strings cover">
            <CoveredTable rows={result.covered} />
          </DrawerSection>
        )}
        <DrawerSection title="Check a string against prices">
          <RegexExplain text={drawer.text} onText={drawer.setText} />
        </DrawerSection>
      </ExplainDrawer>
    </div>
  );
}
