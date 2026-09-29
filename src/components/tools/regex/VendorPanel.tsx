"use client";

import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { VENDOR_HEADERS } from "../../../core/tools/regex/pools/headers";
import type { VendorData } from "../../../core/tools/regex/pools/schema";
import { composeVendor } from "../../../core/tools/regex/vendorCompose";
import type { PresetParams } from "../../../lib/tools/regexContract";
import type { VendorSelection } from "../../../lib/tools/regexPoolContract";
import { EmptyState } from "../../ui/EmptyState";
import { PanelLoading } from "../../shell/PanelLoading";
import { validMaxChars } from "./controls";
import { ExplainBox } from "./ExplainBox";
import { PresetBar } from "./PresetBar";
import { ResetButton, ShareButton } from "./ResultActions";
import { ResultBar } from "./ResultBar";
import { emptyVendorSelection } from "./selectionOps";
import { TokenTable } from "./TokenTable";
import { useDebounced } from "./useDebounced";
import { useVendorData } from "./usePoolData";
import { VendorControls } from "./VendorControls";

interface VendorPanelProps {
  selection: VendorSelection;
  onChange: (next: VendorSelection) => void;
  maxChars: number;
  onMaxChars: (n: number) => void;
}

const NO_SAMPLES: [] = [];

function useVendorCompose(data: VendorData, selection: VendorSelection, maxChars: number) {
  const input = useMemo(() => ({ selection, maxChars }), [selection, maxChars]);
  const settled = useDebounced(input, 100);
  const composed = useMemo(() => {
    const limit = validMaxChars(settled.maxChars);
    if (limit === null) return { ok: false as const, message: "max chars is out of range — fix it in the filters column" };
    try {
      return { ok: true as const, result: composeVendor(data, settled.selection, { maxChars: limit }) };
    } catch (error: unknown) {
      console.error("[tools/regex] composing the vendor search failed", error);
      return { ok: false as const, message: `composer error: ${error instanceof Error ? error.message : String(error)}` };
    }
  }, [data, settled]);
  return { composed, pending: settled !== input };
}

function VendorWorkspace({ data, selection, onChange, maxChars, onMaxChars }: VendorPanelProps & { data: VendorData }) {
  const { composed, pending } = useVendorCompose(data, selection, maxChars);
  const [explain, setExplain] = useState("");
  const [pasted, setPasted] = useState("");
  const result = composed.ok ? composed.result : null;
  const loadPreset = (p: PresetParams) => {
    if (p.tab !== "vendor") throw new Error(`preset for ${p.tab} offered on the vendor tab`);
    onChange(p);
  };
  const actions = (
    <>
      <ShareButton selection={selection} />
      <ResetButton onReset={() => onChange(emptyVendorSelection())} />
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <ResultBar
        strings={result?.chunks ?? []}
        warnings={result?.warnings ?? []}
        reason={composed.ok ? composed.result.reason : null}
        error={composed.ok ? null : composed.message}
        maxChars={maxChars}
        busy={pending}
        actions={actions}
        onExplain={setExplain}
      />
      <PresetBar tab="vendor" params={selection} onLoad={loadPreset} />
      <VendorControls classes={data.classes} selection={selection} onChange={onChange} maxChars={maxChars} onMaxChars={onMaxChars} />
      <TokenTable tokens={result?.tokens ?? []} pool={null} headers={VENDOR_HEADERS} />
      <ExplainBox search={explain} onSearch={setExplain} pasted={pasted} onPasted={setPasted} samples={NO_SAMPLES} />
    </div>
  );
}

/** Vendor screens: gear worth buying or picking up — speed, resistances, +skills, sockets, levels. */
export function VendorPanel(props: VendorPanelProps) {
  const data = useVendorData();
  if (data.status === "loading") return <PanelLoading />;
  if (data.status === "error") {
    return <EmptyState icon={<TriangleAlert className="h-5 w-5 text-bad" />} title="Vendor data failed to load" sentence={`${data.message} — reload the page; if it persists the regex dataset is out of date (npm run build:regex-data).`} />;
  }
  return <VendorWorkspace {...props} data={data.data} />;
}
