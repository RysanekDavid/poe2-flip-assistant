/*
 * Turn the entity mentions the Coach returned into `entity` inline nodes. Pure and exact: only
 * the returned names and mention strings are wrapped, longest first, on word boundaries, and only
 * inside plain text (also inside bold/italic/strike) — never inside code, links or citations.
 */
import type { MarkdownBlock, MarkdownInline } from "./markdownParser";

export interface EntityRef {
  id: string;
  name: string;
  mentions: string[];
}

interface EntityMatcher {
  pattern: RegExp;
  bySurface: Map<string, string>;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** null when there is nothing to wrap, so callers can skip the tree walk entirely. */
export function buildEntityMatcher(refs: readonly EntityRef[]): EntityMatcher | null {
  const bySurface = new Map<string, string>();
  for (const ref of refs) {
    for (const surface of [ref.name, ...ref.mentions]) {
      if (surface.trim() !== "" && !bySurface.has(surface)) bySurface.set(surface, ref.id);
    }
  }
  if (bySurface.size === 0) return null;
  // Longest first: "Greater Exalted Orb" must win over its suffix "Exalted Orb".
  const alternatives = [...bySurface.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_'’-])(?:${alternatives.join("|")})(?![\\p{L}\\p{N}_-])`, "gu");
  return { pattern, bySurface };
}

function wrapText(value: string, matcher: EntityMatcher): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let cursor = 0;
  for (const match of value.matchAll(matcher.pattern)) {
    const id = matcher.bySurface.get(match[0]);
    const index = match.index ?? 0;
    if (id === undefined) continue;
    if (index > cursor) nodes.push({ kind: "text", value: value.slice(cursor, index) });
    nodes.push({ kind: "entity", id, text: match[0] });
    cursor = index + match[0].length;
  }
  if (cursor === 0) return [{ kind: "text", value }];
  if (cursor < value.length) nodes.push({ kind: "text", value: value.slice(cursor) });
  return nodes;
}

export function wrapEntityInlines(nodes: MarkdownInline[], matcher: EntityMatcher): MarkdownInline[] {
  return nodes.flatMap((node): MarkdownInline[] => {
    if (node.kind === "text") return wrapText(node.value, matcher);
    if (node.kind === "strong" || node.kind === "emphasis" || node.kind === "strike") {
      return [{ ...node, children: wrapEntityInlines(node.children, matcher) }];
    }
    return [node];
  });
}

function wrapBlock(block: MarkdownBlock, matcher: EntityMatcher): MarkdownBlock {
  const wrap = (nodes: MarkdownInline[]) => wrapEntityInlines(nodes, matcher);
  switch (block.kind) {
    case "paragraph":
    case "heading":
    case "quote":
      return { ...block, content: wrap(block.content) };
    case "bullet-list":
    case "ordered-list":
      return { ...block, items: block.items.map(wrap) };
    case "table":
      return { ...block, headers: block.headers.map(wrap), rows: block.rows.map((row) => row.map(wrap)) };
    case "code":
    case "rule":
      return block;
  }
}

export function wrapEntityBlocks(blocks: MarkdownBlock[], refs: readonly EntityRef[]): MarkdownBlock[] {
  const matcher = buildEntityMatcher(refs);
  return matcher === null ? blocks : blocks.map((block) => wrapBlock(block, matcher));
}
