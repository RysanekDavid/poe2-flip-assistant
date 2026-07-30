// The model output is untrusted, so this parser deliberately has no raw-HTML node.
export type MarkdownInline =
  | { kind: "text"; value: string }
  | { kind: "strong"; children: MarkdownInline[] }
  | { kind: "emphasis"; children: MarkdownInline[] }
  | { kind: "strike"; children: MarkdownInline[] }
  | { kind: "code"; value: string }
  | { kind: "link"; label: string; url: string }
  | { kind: "citation"; id: string };

export type MarkdownBlock =
  | { kind: "paragraph"; content: MarkdownInline[] }
  | { kind: "heading"; level: 1 | 2 | 3; content: MarkdownInline[] }
  | { kind: "bullet-list" | "ordered-list"; items: MarkdownInline[][] }
  | { kind: "quote"; content: MarkdownInline[] }
  | { kind: "code"; language: string | null; value: string }
  | { kind: "table"; headers: MarkdownInline[][]; rows: MarkdownInline[][][] }
  | { kind: "rule" };

const FENCE = /^```([\w+-]*)\s*$/;
const HEADING = /^(#{1,3})\s+(.+)$/;
const BULLET = /^\s*[-*]\s+(.+)$/;
const ORDERED = /^\s*\d+[.)]\s+(.+)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const INLINE_TOKEN = /\[[MLKW][0-9a-f]{12}\]|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\*[^*\n]+\*|https?:\/\/[^\s<]+/gi;

export function parseCoachMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (FENCE.test(line)) {
      const result = readFence(lines, index);
      blocks.push(result.block);
      index = result.next;
      continue;
    }
    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1]!.length as 1 | 2 | 3, content: parseInline(heading[2]!) });
      index += 1;
      continue;
    }
    if (isTableStart(lines, index)) {
      const result = readTable(lines, index);
      blocks.push(result.block);
      index = result.next;
      continue;
    }
    const result = readSimpleBlock(lines, index);
    blocks.push(result.block);
    index = result.next;
  }
  return blocks;
}

export function parseInline(value: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let cursor = 0;
  for (const match of value.matchAll(INLINE_TOKEN)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push({ kind: "text", value: value.slice(cursor, index) });
    nodes.push(inlineToken(match[0]));
    cursor = index + match[0].length;
  }
  if (cursor < value.length) nodes.push({ kind: "text", value: value.slice(cursor) });
  return nodes;
}

function inlineToken(token: string): MarkdownInline {
  if (/^\[[MLKW][0-9a-f]{12}\]$/i.test(token)) {
    return { kind: "citation", id: token.slice(1, -1) };
  }
  if (token.startsWith("`")) return { kind: "code", value: token.slice(1, -1) };
  if (token.startsWith("[")) {
    const split = token.lastIndexOf("](");
    return { kind: "link", label: token.slice(1, split), url: token.slice(split + 2, -1) };
  }
  if (token.startsWith("**")) {
    return { kind: "strong", children: parseInline(token.slice(2, -2)) };
  }
  if (token.startsWith("~~")) {
    return { kind: "strike", children: parseInline(token.slice(2, -2)) };
  }
  if (token.startsWith("*")) {
    return { kind: "emphasis", children: parseInline(token.slice(1, -1)) };
  }
  return { kind: "link", label: token, url: token };
}

function readFence(lines: string[], start: number) {
  const opening = lines[start]!.match(FENCE);
  const body: string[] = [];
  let index = start + 1;
  while (index < lines.length && !/^```\s*$/.test(lines[index]!)) {
    body.push(lines[index]!);
    index += 1;
  }
  return {
    block: { kind: "code", language: opening?.[1] || null, value: body.join("\n") } as MarkdownBlock,
    next: index < lines.length ? index + 1 : index,
  };
}

function readSimpleBlock(lines: string[], start: number) {
  const line = lines[start]!;
  if (BULLET.test(line)) return readList(lines, start, BULLET, "bullet-list");
  if (ORDERED.test(line)) return readList(lines, start, ORDERED, "ordered-list");
  if (QUOTE.test(line)) return readQuote(lines, start);
  if (RULE.test(line)) return { block: { kind: "rule" } as MarkdownBlock, next: start + 1 };
  const paragraph: string[] = [line.trim()];
  let index = start + 1;
  while (index < lines.length && lines[index]!.trim() && !startsSpecialBlock(lines, index)) {
    paragraph.push(lines[index]!.trim());
    index += 1;
  }
  return {
    block: { kind: "paragraph", content: parseInline(paragraph.join(" ")) } as MarkdownBlock,
    next: index,
  };
}

function readList(
  lines: string[],
  start: number,
  pattern: RegExp,
  kind: "bullet-list" | "ordered-list",
) {
  const items: MarkdownInline[][] = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index]!.match(pattern);
    if (!match) break;
    items.push(parseInline(match[1]!));
    index += 1;
  }
  return { block: { kind, items } as MarkdownBlock, next: index };
}

function readQuote(lines: string[], start: number) {
  const content: string[] = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index]!.match(QUOTE);
    if (!match) break;
    content.push(match[1]!);
    index += 1;
  }
  return {
    block: { kind: "quote", content: parseInline(content.join(" ")) } as MarkdownBlock,
    next: index,
  };
}

function readTable(lines: string[], start: number) {
  const headers = splitTableRow(lines[start]!).map(parseInline);
  const rows: MarkdownInline[][][] = [];
  let index = start + 2;
  while (index < lines.length && lines[index]!.includes("|") && lines[index]!.trim()) {
    rows.push(splitTableRow(lines[index]!).map(parseInline));
    index += 1;
  }
  return { block: { kind: "table", headers, rows } as MarkdownBlock, next: index };
}

function isTableStart(lines: string[], index: number): boolean {
  if (!lines[index]?.includes("|") || index + 1 >= lines.length) return false;
  const divider = splitTableRow(lines[index + 1]!);
  return divider.length > 0 && divider.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function startsSpecialBlock(lines: string[], index: number): boolean {
  const line = lines[index]!;
  return FENCE.test(line)
    || HEADING.test(line)
    || BULLET.test(line)
    || ORDERED.test(line)
    || QUOTE.test(line)
    || RULE.test(line)
    || isTableStart(lines, index);
}
