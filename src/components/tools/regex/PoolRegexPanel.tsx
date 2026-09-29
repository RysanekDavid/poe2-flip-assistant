"use client";

import { useCallback, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { composePool, type PoolComposeResult } from "../../../core/tools/regex/poolCompose";
import { POOL_HEADERS } from "../../../core/tools/regex/pools/headers";
import type { PoolTab, RegexPool } from "../../../core/tools/regex/pools/schema";
import { emptyPoolSelection, type PoolTabSelection } from "../../../lib/tools/regexPoolContract";
import type { PresetParams } from "../../../lib/tools/regexContract";
import { tradeLinkRequest } from "../../../lib/tools/regexTradeContract";
import { EmptyState } from "../../ui/EmptyState";
import { PanelLoading } from "../../shell/PanelLoading";
import { ExplainDrawer, ExplainToggle, SettingsMenu, useExplainDrawer } from "./BandTools";
import { validMaxChars } from "./controls";
import { describeSelection } from "./describe";
import { ExplainBox } from "./ExplainBox";
import { FilterCards } from "./FilterCards";
import { ModPicker } from "./ModPicker";
import { explainSamples } from "./modView";
import { PresetMenu } from "./PresetMenu";
import { ShareButton, TradeLinkButton } from "./ResultActions";
import { ResultBar } from "./ResultBar";
import { isPoolSelection, selectsAnything } from "./selectionOps";
import { TokenTable } from "./TokenTable";
import { useDebounced } from "./useDebounced";
import { usePoolData } from "./usePoolData";

const COMPOSE_DEBOUNCE_MS = 100;

export type PoolUpdater = (tab: PoolTab, fn: (s: PoolTabSelection) => PoolTabSelection) => void;

export interface PoolPanelProps {
  tab: PoolTab;
  selection: PoolTabSelection;
  onChange: (next: PoolTabSelection) => void;
  /** Functional update (stable), so memoized mod rows only re-render when their own props change. */
  onUpdate: PoolUpdater;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

type Composed = { ok: true; result: PoolComposeResult } | { ok: false; message: string };

/** Client-side compose on the debounced selection; a composer bug is shown, not hidden. */
function useComposed(pool: RegexPool, selection: PoolTabSelection, maxChars: number): { composed: Composed | null; pending: boolean } {
  const input = useMemo(() => ({ selection, maxChars }), [selection, maxChars]);
  const settled = useDebounced(input, COMPOSE_DEBOUNCE_MS);
  const composed = useMemo<Composed | null>(() => {
    const limit = validMaxChars(settled.maxChars);
    if (limit === null || settled.selection.tab !== pool.tab) return null;
    try {
      return { ok: true, result: composePool(pool, POOL_HEADERS[pool.tab], settled.selection, { maxChars: limit }) };
    } catch (error: unknown) {
      console.error("[tools/regex] composing the search failed", error);
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }, [pool, settled]);
  return { composed, pending: settled !== input };
}

function Workspace({ pool, selection, onChange, onUpdate, maxChars, onMaxChars }: PoolPanelProps & { pool: RegexPool }) {
  const { composed, pending } = useComposed(pool, selection, maxChars);
  const [pasted, setPasted] = useState("");
  const samples = useMemo(() => explainSamples(pool), [pool]);
  const update = useCallback((fn: (s: PoolTabSelection) => PoolTabSelection) => onUpdate(pool.tab, fn), [onUpdate, pool.tab]);
  const result = composed?.ok ? composed.result : null;
  const drawer = useExplainDrawer(result?.chunks[0]?.text);
  const trade = useMemo(() => (selectsAnything(selection) ? tradeLinkRequest(pool, selection) : null), [pool, selection]);
  const sentence = useMemo(() => describeSelection(selection, pool, POOL_HEADERS[pool.tab], result), [selection, pool, result]);
  const reason = composed === null
    ? validMaxChars(maxChars) === null ? "max characters is out of range — fix it under the gear icon" : null
    : composed.ok ? composed.result.reason : null;
  const loadPreset = (p: PresetParams) => {
    if (!isPoolSelection(p) || p.tab !== selection.tab) throw new Error(`preset for ${p.tab} offered on the ${selection.tab} tab`);
    onChange(p);
  };
  const tools = (
    <>
      <PresetMenu tab={selection.tab} params={selection} onLoad={loadPreset} />
      <ShareButton selection={selection} />
      <ExplainToggle open={drawer.open} onToggle={drawer.toggle} controls={drawer.id} toggleRef={drawer.toggleRef} />
      <SettingsMenu maxChars={maxChars} onMaxChars={onMaxChars} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <ResultBar
        strings={result?.chunks ?? []}
        warnings={result?.warnings ?? []}
        reason={reason}
        error={composed?.ok === false ? `composer error: ${composed.message}` : null}
        maxChars={maxChars}
        busy={pending}
        sentence={sentence}
        tools={tools}
        trade={<TradeLinkButton plan={trade} />}
        onClear={() => onChange(emptyPoolSelection(selection.tab))}
      />
      <FilterCards pool={pool} selection={selection} onChange={onChange} />
      <ModPicker pool={pool} selection={selection} onUpdate={update} result={result} />
      <ExplainDrawer ref={drawer.ref} id={drawer.id} open={drawer.open} onClose={drawer.close}>
        <TokenTable tokens={result?.tokens ?? []} pool={pool} headers={POOL_HEADERS[pool.tab]} />
        <ExplainBox search={drawer.text} onSearch={drawer.setText} pasted={pasted} onPasted={setPasted} samples={samples} />
      </ExplainDrawer>
    </div>
  );
}

/** Waystone / Tablet / Relic / Jewel: lazily loads the tab's dataset, then the full workspace. */
export function PoolRegexPanel(props: PoolPanelProps) {
  const data = usePoolData(props.tab);
  if (data.status === "loading") return <PanelLoading />;
  if (data.status === "error") {
    return <EmptyState icon={<TriangleAlert className="h-5 w-5 text-bad" />} title="Mod data failed to load" sentence={`${data.message} — reload the page; if it persists the regex dataset is out of date (npm run build:regex-data).`} />;
  }
  return <Workspace {...props} pool={data.data} />;
}
