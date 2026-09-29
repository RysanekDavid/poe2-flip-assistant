"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import {
  OkSchema,
  PresetListSchema,
  PresetSavedSchema,
  requestRegexApi,
  type Preset,
  type PricePresetParams,
} from "../../../lib/tools/regexContract";

const PRESETS_URL = "/api/tools/regex/presets";

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function usePresets() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    requestRegexApi(PRESETS_URL, { method: "GET" }, PresetListSchema)
      .then((d) => {
        setPresets(d.presets);
        setError(null);
      })
      .catch((e: unknown) => setError(`loading presets failed: ${describe(e)}`));
  }, []);
  useEffect(reload, [reload]);
  const save = (name: string, params: PricePresetParams): Promise<boolean> =>
    requestRegexApi(PRESETS_URL, { method: "POST", body: { name, params } }, PresetSavedSchema)
      .then(() => {
        reload();
        return true;
      })
      .catch((e: unknown) => {
        setError(`saving "${name}" failed: ${describe(e)}`);
        return false;
      });
  const remove = (p: Preset) =>
    requestRegexApi(PRESETS_URL, { method: "DELETE", body: { id: p.id } }, OkSchema)
      .then(reload)
      .catch((e: unknown) => setError(`deleting "${p.name}" failed: ${describe(e)}`));
  return { presets, error, save, remove };
}

function PresetChip({ preset, onLoad, onDelete }: { preset: Preset; onLoad: (p: PricePresetParams) => void; onDelete: () => void }) {
  const params = preset.params?.tab === "price" ? preset.params : null;
  const title = params
    ? `${params.mode === "keep" ? "keep ≥" : "trash <"} ${params.minDiv} Div · ${params.categories.length} categories${params.includeUniques ? " + uniques" : ""} · saved in ${preset.league}`
    : `cannot load: ${preset.invalid ?? "unknown"}`;
  return (
    <span className={`inline-flex items-center rounded-md border text-xs ${params ? "border-neutral-700 text-neutral-300" : "border-bad/50 text-bad"}`}>
      <button type="button" disabled={!params} onClick={() => params && onLoad(params)} title={title} className="px-2 py-1 hover:bg-neutral-800 disabled:cursor-not-allowed">
        {preset.name}
      </button>
      <button type="button" onClick={onDelete} title={`delete preset "${preset.name}"`} className="border-l border-neutral-700 px-1 py-1 text-neutral-600 hover:text-bad">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

/** Saved selections. A preset stores parameters only — the string is rebuilt from live prices. */
export function PresetBar({ params, onLoad }: { params: PricePresetParams; onLoad: (p: PricePresetParams) => void }) {
  const { presets: all, error, save, remove } = usePresets();
  // other tabs' presets belong to their own panels; unparseable rows stay visible so they can be deleted
  const presets = all.filter((p) => p.params === null || p.params.tab === "price");
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void save(trimmed, params).then((ok) => ok && setName(""));
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {presets.map((p) => (
        <PresetChip key={p.id} preset={p} onLoad={onLoad} onDelete={() => void remove(p)} />
      ))}
      <span className="inline-flex items-center rounded-md border border-dashed border-neutral-700">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="save as…"
          maxLength={60}
          className="w-28 bg-transparent px-2 py-1 text-xs text-neutral-200 outline-none placeholder:text-neutral-600"
        />
        <button type="button" onClick={submit} title="save the current selection (same name overwrites)" className="px-1.5 py-1 text-neutral-500 hover:text-neutral-200">
          <BookmarkPlus className="h-3.5 w-3.5" />
        </button>
      </span>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
