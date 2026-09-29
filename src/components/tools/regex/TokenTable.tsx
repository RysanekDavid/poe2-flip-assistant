"use client";

import { SearchCode } from "lucide-react";
import type { ComposedToken } from "../../../core/tools/regex/poolCompose";
import type { PoolHeader } from "../../../core/tools/regex/pools/headers";
import type { RegexPool } from "../../../core/tools/regex/pools/schema";
import { DataTable, type Column } from "../../ui/DataTable";
import { EmptyState } from "../../ui/EmptyState";
import { Panel } from "../../ui/Panel";
import { Tooltip } from "../../ui/Tooltip";
import { modLabel } from "./modView";

const KIND_LABEL: Record<ComposedToken["kind"], string> = {
  mod: "wanted mod",
  threshold: "wanted mod, value",
  avoid: "avoided mod",
  property: "property",
  tier: "tier",
  rarity: "rarity",
  corrupted: "corrupted",
  type: "item type",
};

/** Namespace key ("mod:…", "hdr:…", "base:…", "line:…", "class:…") → the text the player sees. */
function coverName(key: string, pool: RegexPool | null, headers: readonly PoolHeader[]): string {
  const [kind, ...rest] = key.split(":");
  const id = rest.join(":");
  if (kind === "mod") {
    const mod = pool?.mods.find((m) => m.id === id);
    return mod ? modLabel(mod) : id;
  }
  if (kind === "hdr") return headers.find((h) => h.id === id)?.template ?? id;
  return id;
}

function flagsOf(t: ComposedToken): string[] {
  return [t.anchored && "line anchor", t.rounded && "rounded to tens", t.verify && "verify in-game", t.note].filter((x): x is string => typeof x === "string" && x.length > 0);
}

function columns(pool: RegexPool | null, headers: readonly PoolHeader[]): Column<ComposedToken>[] {
  const nameOf = (id: string) => {
    const mod = pool?.mods.find((m) => m.id === id);
    return mod ? modLabel(mod) : id;
  };
  return [
    { key: "text", header: "Search text", width: "12rem", cell: (t) => <code className="break-all font-mono text-amber-200">{t.text}</code> },
    { key: "kind", header: "Part", width: "9rem", cell: (t) => <span className="text-neutral-300">{KIND_LABEL[t.kind]}</span> },
    { key: "covers", header: "Stands for", cell: (t) => <span className="text-neutral-200">{t.covers.map((k) => coverName(k, pool, headers)).join(" · ")}</span> },
    {
      key: "also",
      header: "Also matches",
      tip: "Other mods of this item kind whose text the same search text lights — harmless when they are also wanted.",
      width: "8rem",
      cell: (t) =>
        t.alsoMatches.length === 0 ? (
          <span className="text-neutral-500">—</span>
        ) : (
          <Tooltip tip={t.alsoMatches.map(nameOf).join(" · ")}>
            <span className="text-warn">{t.alsoMatches.length} mods</span>
          </Tooltip>
        ),
    },
    { key: "flags", header: "Notes", cell: (t) => <span className="text-xs text-neutral-400">{flagsOf(t).join(" · ") || "—"}</span> },
  ];
}

/** "How the string is built": each piece of the search and what it stands for. Collapsed by default. */
export function TokenTable({ tokens, pool, headers }: { tokens: readonly ComposedToken[]; pool: RegexPool | null; headers: readonly PoolHeader[] }) {
  return (
    <Panel title="How the string is built" collapsible defaultOpen={false} right={<span className="text-xs text-neutral-400">{tokens.length} parts</span>}>
      <DataTable
        columns={columns(pool, headers)}
        rows={[...tokens]}
        rowKey={(t) => `${t.kind}:${t.text}:${t.covers.join(",")}`}
        emptyState={<EmptyState icon={<SearchCode className="h-5 w-5" />} sentence="Mark a mod Want or Avoid, or set a filter, to build a string." />}
      />
    </Panel>
  );
}
