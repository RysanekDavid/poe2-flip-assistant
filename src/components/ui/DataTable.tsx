"use client";

import type { HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { InfoTip } from "./Tooltip";

export type ColumnAlign = "left" | "right" | "center";
export type SortDir = "asc" | "desc";

export interface Column<T> {
  key: string;
  header: string;
  /** Header ⓘ tooltip — definitions live here, not in prose above the table. */
  tip?: string;
  align?: ColumnAlign;
  /** Any CSS width, e.g. "6rem" or "30%". */
  width?: string;
  /** Only honoured when the table gets a `sort` prop. */
  sortable?: boolean;
  /** Let long text wrap — even inside a long token (overflow-wrap:anywhere also shrinks the auto-layout column) — instead of the default one-line cell. */
  wrap?: boolean;
  cell: (row: T) => ReactNode;
}

export interface TableSort {
  key: string;
  dir: SortDir;
  onSort: (key: string) => void;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  /** Row rendered as selected (e.g. the flip whose plan is open). */
  selectedKey?: string;
  /** Controlled sort: the table only reports clicks; the caller orders `rows`. */
  sort?: TableSort;
  /**
   * Cells hold their own form controls (e.g. an inline number input). A row must then stay a plain
   * row — a role="button" row hides its inputs from assistive tech — marked with aria-selected; a
   * cell must render its own button for keyboard users. Mouse clicks on the row still call onRowClick.
   */
  interactiveCells?: boolean;
  /** The row whose detail is open: `renderExpanded` draws it in a full-width row right under it. */
  expandedKey?: string;
  renderExpanded?: (row: T) => ReactNode;
  /** Two-line cells (value + a muted sub-line): taller rows with vertical padding. */
  tall?: boolean;
  emptyState: ReactNode;
}

const ALIGN_CLASS: Record<ColumnAlign, string> = { left: "text-left", right: "text-right", center: "text-center" };

const INTERACTIVE = "a, button, input, select, textarea, [role=switch], [role=button], [tabindex]";

/** A click on a cell's own control (watch toggle, link, tooltip trigger) is not a row click. */
function fromInnerControl(target: EventTarget, row: HTMLElement): boolean {
  if (!(target instanceof Element)) return false;
  const hit = target.closest(INTERACTIVE);
  return hit !== null && hit !== row && row.contains(hit);
}

function HeaderCell<T>({ col, sort }: { col: Column<T>; sort?: TableSort }) {
  const align = col.align ?? "left";
  const active = sort?.key === col.key;
  const ariaSort = active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined;
  const Arrow = sort?.dir === "asc" ? ArrowUp : ArrowDown;
  const label = sort && col.sortable ? (
    <button type="button" onClick={() => sort.onSort(col.key)} className="inline-flex items-center gap-1 rounded hover:text-neutral-100">
      {col.header}
      {active && <Arrow aria-hidden className="h-3 w-3" />}
    </button>
  ) : (
    col.header
  );
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      style={col.width ? { width: col.width } : undefined}
      className={`sticky top-[var(--shell-h,0px)] z-10 whitespace-nowrap border-b border-line bg-neutral-950 px-2 py-2 text-xs font-medium text-neutral-400 ${ALIGN_CLASS[align]}`}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {col.tip && <InfoTip tip={col.tip} label={`About ${col.header}`} side="bottom" />}
        {label}
      </span>
    </th>
  );
}

type RowA11y = Pick<HTMLAttributes<HTMLTableRowElement>, "tabIndex" | "role" | "aria-pressed" | "aria-selected" | "aria-expanded" | "onKeyDown">;

/** A clickable row is a keyboard button unless its cells carry their own controls (see interactiveCells). */
function rowA11y(clickable: boolean, interactiveCells: boolean, selected: boolean, expanded: boolean | undefined, onKey: () => void): RowA11y {
  if (!clickable) return {};
  if (interactiveCells) return { "aria-selected": selected };
  return {
    tabIndex: 0,
    role: "button",
    "aria-pressed": expanded === undefined ? selected : undefined,
    "aria-expanded": expanded,
    onKeyDown: (e: KeyboardEvent<HTMLTableRowElement>) => {
      if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
      e.preventDefault();
      onKey();
    },
  };
}

interface RowProps<T> {
  row: T;
  columns: Column<T>[];
  selected: boolean;
  /** undefined for a table without expansion; otherwise whether this row's detail is open. */
  expanded: boolean | undefined;
  detail: ReactNode;
  onRowClick?: (row: T) => void;
  interactiveCells: boolean;
  tall: boolean;
}

function Row<T>({ row, columns, selected, expanded, detail, onRowClick, interactiveCells, tall }: RowProps<T>) {
  const highlight = selected || expanded === true;
  return (
    <>
      <tr
        {...rowA11y(onRowClick != null, interactiveCells, selected, expanded, () => onRowClick?.(row))}
        onClick={
          onRowClick
            ? (e) => {
                if (!fromInnerControl(e.target, e.currentTarget)) onRowClick(row);
              }
            : undefined
        }
        className={`${tall ? "h-[3.25rem]" : "h-9"} ${onRowClick ? "cursor-pointer hover:bg-neutral-800/50" : ""} ${highlight ? "bg-amber-400/10" : ""}`}
      >
        {columns.map((c) => (
          <td
            key={c.key}
            className={`${c.wrap ? "whitespace-normal py-1.5 [overflow-wrap:anywhere]" : "whitespace-nowrap"} ${tall ? "py-2" : ""} ${expanded ? "" : "border-b border-line/70"} px-2 text-neutral-200 ${ALIGN_CLASS[c.align ?? "left"]}`}
          >
            {c.cell(row)}
          </td>
        ))}
      </tr>
      {expanded && (
        <tr>
          <td colSpan={columns.length} className="border-b border-line/70 bg-neutral-950 px-2 pb-3 pt-1">
            {/* zero min-content: a wide detail scrolls inside the row instead of widening the table */}
            <div className="w-0 min-w-full overflow-x-auto">{detail}</div>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * The standard table: sticky header under the app shell (no inner scroll box, which hid the first
 * row), h-9 rows, ⓘ header tooltips. A clickable row is a real keyboard target (Enter/Space). With
 * `renderExpanded`, the open row's detail sits directly under it, not below the whole table.
 */
export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, onRowClick, selectedKey, sort, interactiveCells = false, expandedKey, renderExpanded, tall = false, emptyState } = props;
  if (rows.length === 0) return <>{emptyState}</>;
  return (
    <table className="w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          {columns.map((c) => <HeaderCell key={c.key} col={c} sort={sort} />)}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          const expanded = renderExpanded ? key === expandedKey : undefined;
          return (
            <Row
              key={key}
              row={row}
              columns={columns}
              selected={key === selectedKey}
              expanded={expanded}
              detail={expanded && renderExpanded ? renderExpanded(row) : null}
              onRowClick={onRowClick}
              interactiveCells={interactiveCells}
              tall={tall}
            />
          );
        })}
      </tbody>
    </table>
  );
}
