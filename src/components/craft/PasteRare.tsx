"use client";

import { useState } from "react";

export interface ParsedRare {
  name: string;
  baseType: string;
  itemLevel: number | null;
  stats: Array<{ id: string; text: string; group: string; roll: number }>;
}

/**
 * Paste an in-game rare (Ctrl+C) → parse it into the planner's base + target mods. The actual
 * valuation then runs through the planner's robust ladder / roll guide / sell search — one card
 * does crafting AND "what's this worth", instead of a separate weak paste-to-value panel.
 */
export function PasteRare({ onLoad }: { onLoad: (r: ParsedRare) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/craft/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemText: text }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      if (!d.baseType) throw new Error("no base type found in the pasted text");
      onLoad(d as ParsedRare);
      const n = (d.stats ?? []).length;
      setErr(n === 0 ? "loaded base, but no mods resolved (plain item or stale catalog)" : null);
      setText("");
      setOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-neutral-300 hover:bg-neutral-800/40"
      >
        <span>📋 paste a rare (Ctrl+C in-game) → load into planner</span>
        <span className="text-neutral-600">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-neutral-800 p-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Item Class: Staves\nRarity: Rare\n…paste full item text…"}
            rows={6}
            className="w-full resize-y rounded-md border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs text-neutral-200 placeholder:text-neutral-700"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={load}
              disabled={busy || !text.trim()}
              className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-40"
            >
              {busy ? "parsing…" : "load into planner"}
            </button>
            {err && <span className="text-xs text-amber-500">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
