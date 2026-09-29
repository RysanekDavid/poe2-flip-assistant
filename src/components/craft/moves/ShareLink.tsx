"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import { SHARE_MAX_BYTES, shareQuery } from "../../../lib/tools/shareItem";
import { Button } from "../../ui/Button";

type CopyState = { kind: "idle" } | { kind: "copied" } | { kind: "error"; error: string };

/** Copies a link that re-opens this tool with the item pasted and read (?item=base64url). */
export function ShareLink({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>({ kind: "idle" });
  const query = shareQuery(text);
  const copy = async (): Promise<void> => {
    if (!query) return;
    const url = `${window.location.origin}${window.location.pathname}${query}`;
    try {
      await navigator.clipboard.writeText(url);
      setState({ kind: "copied" });
    } catch (e: unknown) {
      console.error("[craft-moves] share link copy failed", e);
      setState({ kind: "error", error: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        onClick={() => void copy()}
        disabled={!query}
        title={query ? "copy a link that opens this item here" : `item text is over ${SHARE_MAX_BYTES / 1024} KB — too long for a link`}
      >
        <Link2 aria-hidden className="h-4 w-4" />
        {state.kind === "copied" ? "link copied" : "share"}
      </Button>
      {state.kind === "error" && <span className="text-xs text-bad">copy failed: {state.error}</span>}
    </span>
  );
}
