"use client";

import { useCallback, useEffect, useState } from "react";
import { BookmarkPlus, X } from "lucide-react";
import {
  OkSchema,
  PresetListSchema,
  PresetSavedSchema,
  requestRegexApi,
  type Preset,
  type PresetParams,
} from "../../../lib/tools/regexContract";
import type { RegexTab } from "../../../lib/tools/regexPoolContract";
import { describePreset, presetsForTab } from "./presetView";

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
  const save = (name: string, params: PresetParams): Promise<boolean> =>
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

function PresetChip({ preset, onLoad, onDelete }: { preset: Preset; onLoad: (p: PresetParams) => void; onDelete: () => void }) {
  const params = preset.params;
  const title = params ? `${describePreset(params)} · saved in ${preset.league}` : `cannot load: ${preset.invalid ?? "unknown"}`;
  return (
    <span className={`inline-flex items-center rounded-md border text-xs ${params ? "border-neutral-700 text-neutral-200" : "border-bad/50 text-bad"}`}>
      <button type="button" disabled={!params} onClick={() => params && onLoad(params)} title={title} className="h-7 px-2.5 hover:bg-neutral-800 disabled:cursor-not-allowed">
        {preset.name}
      </button>
      <button type="button" onClick={onDelete} aria-label={`delete preset "${preset.name}"`} className="h-7 border-l border-neutral-700 px-1.5 text-neutral-400 hover:text-bad">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** Saved selections for one sub-tab. A preset stores parameters only; strings are rebuilt on load. */
export function PresetBar({ tab, params, onLoad }: { tab: RegexTab; params: PresetParams; onLoad: (p: PresetParams) => void }) {
  const { presets: all, error, save, remove } = usePresets();
  const presets = presetsForTab(all, tab);
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void save(trimmed, params).then((ok) => ok && setName(""));
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="presets">
      <span className="text-xs text-neutral-400">Presets</span>
      {presets.map((p) => (
        <PresetChip key={p.id} preset={p} onLoad={onLoad} onDelete={() => void remove(p)} />
      ))}
      <span className="inline-flex items-center rounded-md border border-dashed border-neutral-700">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="save as…"
          aria-label="preset name"
          maxLength={60}
          className="h-7 w-28 bg-transparent px-2 text-xs text-neutral-200 outline-none placeholder:text-neutral-500"
        />
        <button type="button" onClick={submit} aria-label="save preset" title="save the current selection (same name overwrites)" className="h-7 px-1.5 text-neutral-400 hover:text-neutral-100">
          <BookmarkPlus aria-hidden className="h-4 w-4" />
        </button>
      </span>
      {error && <span className="text-xs text-bad">{error}</span>}
    </div>
  );
}
