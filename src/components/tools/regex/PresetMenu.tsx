"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, ChevronDown, TriangleAlert, X } from "lucide-react";
import {
  OkSchema,
  PresetListSchema,
  PresetSavedSchema,
  requestRegexApi,
  type Preset,
  type PresetParams,
} from "../../../lib/tools/regexContract";
import type { RegexTab } from "../../../lib/tools/regexPoolContract";
import { Popover } from "./Popover";
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

function PresetRow({ preset, onLoad, onDelete }: { preset: Preset; onLoad: (p: PresetParams) => void; onDelete: () => void }) {
  const params = preset.params;
  const title = params ? `${describePreset(params)} · saved in ${preset.league}` : `cannot load: ${preset.invalid ?? "unknown"}`;
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        disabled={!params}
        onClick={() => params && onLoad(params)}
        title={title}
        className={`min-w-0 flex-1 truncate rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-800 disabled:cursor-not-allowed ${params ? "text-neutral-200" : "text-bad"}`}
      >
        {preset.name}
      </button>
      <button type="button" onClick={onDelete} aria-label={`delete preset "${preset.name}"`} className="rounded p-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-bad">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

/**
 * "Saved ▾": the tab's presets (load / delete) and "save current" in one menu, so saved selections
 * no longer cost a row of their own. A preset stores parameters only; strings are rebuilt on load.
 */
export function PresetMenu({ tab, params, onLoad }: { tab: RegexTab; params: PresetParams; onLoad: (p: PresetParams) => void }) {
  const { presets: all, error, save, remove } = usePresets();
  const presets = presetsForTab(all, tab);
  const [name, setName] = useState("");
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    void save(trimmed, params).then((ok) => ok && setName(""));
  };
  return (
    <Popover
      label={`saved selections (${presets.length})`}
      title="save this selection or load a saved one"
      trigger={
        <>
          <Bookmark aria-hidden className="h-3.5 w-3.5" />
          Saved{presets.length > 0 && <span className="tabular-nums text-neutral-400">{presets.length}</span>}
          {error && <TriangleAlert role="img" aria-label="presets failed — open for details" className="h-3.5 w-3.5 text-bad" />}
          <ChevronDown aria-hidden className="h-3.5 w-3.5 text-neutral-400" />
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {presets.length === 0 ? (
          <p className="text-xs text-neutral-400">Nothing saved for this tab yet.</p>
        ) : (
          <ul aria-label="saved selections" className="flex max-h-60 flex-col overflow-y-auto">
            {presets.map((p) => (
              <PresetRow key={p.id} preset={p} onLoad={onLoad} onDelete={() => void remove(p)} />
            ))}
          </ul>
        )}
        <div className="flex items-center gap-1.5 border-t border-line pt-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="name this selection"
            aria-label="preset name"
            maxLength={60}
            className="h-8 min-w-0 flex-1 rounded-md border border-neutral-700 bg-neutral-950 px-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-amber-400/60 focus:outline-none"
          />
          <button type="button" onClick={submit} title="same name overwrites" className="h-8 rounded-md border border-neutral-700 px-2.5 text-xs font-medium text-neutral-200 hover:border-neutral-500">
            Save
          </button>
        </div>
        {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      </div>
    </Popover>
  );
}
