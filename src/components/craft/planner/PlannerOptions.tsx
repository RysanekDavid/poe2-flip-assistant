import type { PlannerCatalog, PlannerPool } from "../../../lib/tools/craftPlannerContract";
import { Toggle } from "../../ui/Toggle";
import { InfoTip } from "../../ui/Tooltip";
import { NumberField } from "./NumberField";
import type { CatalogBase, PlannerInput, StartInput } from "./plannerModel";
import { StartChooser } from "./StartChooser";

/** Plan options: unverified methods (off by default), on rings/amulets the finished catalyst quality, and where the plan starts. */

interface Props {
  catalog: PlannerCatalog;
  base: CatalogBase;
  input: PlannerInput;
  onChange: (patch: Partial<Pick<PlannerInput, "includeUnverified" | "quality">>) => void;
}

const FIELD = "h-8 rounded-md border border-neutral-700 bg-neutral-900 px-2 text-sm text-neutral-100 focus:border-amber-400 focus:outline-none";

function QualityPicker({ catalog, base, input, onChange }: Props) {
  const cap = base.qualityCap;
  if (cap == null) return null;
  const q = input.quality;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-neutral-300">
      <label className="flex items-center gap-2">
        finished quality
        <select
          value={q?.catalyst ?? ""}
          onChange={(e) => onChange({ quality: e.target.value ? { catalyst: e.target.value, pct: Math.min(q?.pct ?? cap, cap) } : null })}
          className={FIELD}
        >
          <option value="">none</option>
          {catalog.catalysts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {q && (
        <label className="flex items-center gap-1">
          <NumberField value={q.pct} min={1} max={cap} onCommit={(n) => onChange({ quality: { ...q, pct: n } })} label="quality percent" className={`${FIELD} w-16 tabular-nums`} />
          % <span className="text-xs text-neutral-500">(max {cap}%)</span>
        </label>
      )}
    </div>
  );
}

export function PlannerOptions(props: Props & { pool: PlannerPool | null; onStart: (patch: Partial<StartInput>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="inline-flex items-center gap-1.5">
          <Toggle checked={props.input.includeUnverified} onChange={(v) => props.onChange({ includeUnverified: v })} label="include unverified methods" />
          <InfoTip tip="Off: the plan uses only methods whose rules are verified or shown by a creator. On: methods resting on an untested rule are allowed too, each marked unverified." />
        </span>
        <QualityPicker {...props} />
      </div>
      <StartChooser input={props.input} pool={props.pool} onChange={props.onStart} />
    </div>
  );
}
