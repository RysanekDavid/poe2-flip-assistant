"use client";

import type { ReactNode } from "react";
import type { CoachSource } from "../../lib/coachContract";
import {
  parseCoachMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from "./markdownParser";

export function CoachMarkdown({ content, sources }: { content: string; sources: CoachSource[] }) {
  const blocks = parseCoachMarkdown(content);
  return (
    <div className="coach-copy min-w-0 text-[15px] leading-7 text-neutral-200">
      {blocks.map((block, index) => renderBlock(block, index, sources))}
    </div>
  );
}

function renderBlock(block: MarkdownBlock, key: number, sources: CoachSource[]): ReactNode {
  if (block.kind === "paragraph") {
    return <p key={key} className="mb-3 last:mb-0">{renderInline(block.content, sources)}</p>;
  }
  if (block.kind === "heading") return renderHeading(block, key, sources);
  if (block.kind === "bullet-list" || block.kind === "ordered-list") {
    const Tag = block.kind === "bullet-list" ? "ul" : "ol";
    const style = block.kind === "bullet-list" ? "list-disc" : "list-decimal";
    return (
      <Tag key={key} className={`mb-4 space-y-1.5 pl-6 marker:text-amber-500/70 ${style}`}>
        {block.items.map((item, index) => <li key={index}>{renderInline(item, sources)}</li>)}
      </Tag>
    );
  }
  if (block.kind === "quote") {
    return (
      <blockquote key={key} className="my-4 border-l-2 border-amber-500/45 bg-amber-950/10 px-4 py-2 italic text-neutral-400">
        {renderInline(block.content, sources)}
      </blockquote>
    );
  }
  if (block.kind === "code") return <CodeBlock key={key} block={block} />;
  if (block.kind === "table") return <MarkdownTable key={key} block={block} sources={sources} />;
  return <hr key={key} className="my-5 border-neutral-800" />;
}

function renderHeading(
  block: Extract<MarkdownBlock, { kind: "heading" }>,
  key: number,
  sources: CoachSource[],
): ReactNode {
  const content = renderInline(block.content, sources);
  const className = "mb-2 mt-5 font-['Palatino_Linotype','Book_Antiqua',serif] font-semibold tracking-wide text-amber-100 first:mt-0";
  if (block.level === 1) return <h2 key={key} className={`${className} text-xl`}>{content}</h2>;
  if (block.level === 2) return <h3 key={key} className={`${className} text-lg`}>{content}</h3>;
  return <h4 key={key} className={`${className} text-base`}>{content}</h4>;
}

function CodeBlock({ block }: { block: Extract<MarkdownBlock, { kind: "code" }> }) {
  return (
    <div className="my-4 overflow-hidden rounded-lg border border-neutral-700/80 bg-neutral-950">
      {block.language && (
        <div className="border-b border-neutral-800 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-neutral-500">
          {block.language}
        </div>
      )}
      <pre className="max-w-full overflow-x-auto p-4 font-mono text-xs leading-6 text-neutral-300">
        <code>{block.value}</code>
      </pre>
    </div>
  );
}

function MarkdownTable({ block, sources }: {
  block: Extract<MarkdownBlock, { kind: "table" }>;
  sources: CoachSource[];
}) {
  return (
    <div className="my-4 max-w-full overflow-x-auto rounded-lg border border-neutral-700/80">
      <table className="w-full min-w-[440px] border-collapse text-left text-sm">
        <thead className="bg-neutral-950/80 text-[11px] uppercase tracking-wider text-neutral-400">
          <tr>{block.headers.map((cell, index) => <th key={index} className="border-b border-neutral-700 px-3 py-2">{renderInline(cell, sources)}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-neutral-800/80">
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="bg-neutral-900/35">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-2 align-top">{renderInline(cell, sources)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderInline(nodes: MarkdownInline[], sources: CoachSource[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.kind === "text") return node.value;
    if (node.kind === "strong") return <strong key={index} className="font-semibold text-neutral-50">{renderInline(node.children, sources)}</strong>;
    if (node.kind === "emphasis") return <em key={index} className="text-neutral-300">{renderInline(node.children, sources)}</em>;
    if (node.kind === "strike") return <del key={index} className="text-neutral-500">{renderInline(node.children, sources)}</del>;
    if (node.kind === "code") return <code key={index} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-0.5 font-mono text-[0.86em] text-amber-200">{node.value}</code>;
    if (node.kind === "citation") return <Citation key={index} id={node.id} sources={sources} />;
    return (
      <a key={index} href={node.url} target="_blank" rel="noreferrer" className="text-sky-300 underline decoration-sky-500/35 underline-offset-2 hover:text-sky-200">
        {node.label}
      </a>
    );
  });
}

function Citation({ id, sources }: { id: string; sources: CoachSource[] }) {
  const index = sources.findIndex((source) => source.id === id);
  const source = index >= 0 ? sources[index] : null;
  return (
    <a
      href={`#coach-source-${id}`}
      title={source?.title ?? id}
      // Evidence is collapsed by default; open this message's panel so the jump has a target.
      onClick={(event) => {
        event.currentTarget.closest("article")?.querySelector("details")?.setAttribute("open", "");
      }}
      className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-amber-500/35 bg-amber-950/35 px-1.5 align-middle text-[10px] font-semibold leading-none text-amber-300 hover:border-amber-400/60 hover:text-amber-100"
    >
      {index >= 0 ? index + 1 : "?"}
    </a>
  );
}
