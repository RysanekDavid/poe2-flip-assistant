import type { PlannerCatalog } from "../../../lib/tools/craftPlannerContract";
import { Toggle } from "../../ui/Toggle";
import { InfoTip } from "../../ui/Tooltip";
import type { CatalogBase, PlannerInput } from "./plannerModel";

/** Plan options: unverified methods (off by default) and, on rings/amulets, the finished catalyst quality. */

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
          <input
            type="number"
            min={1}
            max={cap}
            value={q.pct}
            aria-label="quality percent"
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 1 && n <= cap) onChange({ quality: { ...q, pct: n } });
            }}
            className={`${FIELD} w-16 tabular-nums`}
          />
          % <span className="text-xs text-neutral-500">(max {cap}%)</span>
        </label>
      )}
    </div>
  );
}

export function PlannerOptions(props: Props) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      <span className="inline-flex items-center gap-1.5">
        <Toggle checked={props.input.includeUnverified} onChange={(v) => props.onChange({ includeUnverified: v })} label="include unverified methods" />
        <InfoTip tip="Off: the plan uses only methods whose rules are verified or shown by a creator. On: methods resting on an untested rule are allowed too, each marked unverified." />
      </span>
      <QualityPicker {...props} />
    </div>
  );
}
