"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { assertOk, describeError } from "../../lib/clientWarn";
import { patchDetailSchema, type PatchDetail } from "../../lib/patchesContract";

type DetailState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; detail: PatchDetail };

/** The stored change list, fetched only when opened — a league launch runs to thousands of lines. */
function useDetail(threadId: number) {
  const [state, setState] = useState<DetailState>({ kind: "idle" });
  const load = (): void => {
    setState({ kind: "loading" });
    const url = `/api/patches/${threadId}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => setState({ kind: "ready", detail: patchDetailSchema.parse(await assertOk(r, url).json()) }))
      .catch((e: unknown) => {
        console.error("[patches] detail failed", e);
        setState({ kind: "error", message: describeError(e) });
      });
  };
  return { state, load };
}

function DetailView({ detail }: { detail: PatchDetail }) {
  return (
    <div className="space-y-2">
      {detail.headings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {detail.headings.map((heading, index) => (
            <span key={index} className="rounded border border-line px-1.5 py-0.5 text-xs text-neutral-300">
              {heading}
            </span>
          ))}
        </div>
      )}
      {detail.listItems.length > 0 ? (
        <ul className="max-h-96 list-disc space-y-0.5 overflow-y-auto pl-5 pr-2 text-sm text-neutral-300">
          {detail.listItems.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="max-h-96 overflow-y-auto whitespace-pre-line text-sm text-neutral-300">{detail.bodyText ?? "No stored text."}</p>
      )}
    </div>
  );
}

export function PatchBody({ threadId }: { threadId: number }) {
  const [open, setOpen] = useState(false);
  const { state, load } = useDetail(threadId);
  const toggle = (): void => {
    if (!open && state.kind !== "ready" && state.kind !== "loading") load();
    setOpen((o) => !o);
  };
  return (
    <div className="border-t border-line pt-2">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-200">
        <ChevronDown aria-hidden className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
        Official change list
      </button>
      {open && (
        <div className="mt-2">
          {state.kind === "loading" && <p className="text-xs text-neutral-400">Loading…</p>}
          {state.kind === "error" && <p className="text-xs text-amber-300">Could not load the change list: {state.message}</p>}
          {state.kind === "ready" && <DetailView detail={state.detail} />}
        </div>
      )}
    </div>
  );
}
