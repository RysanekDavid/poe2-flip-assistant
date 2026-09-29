"use client";

import type { KeyboardEvent, ReactNode } from "react";
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
  emptyState: ReactNode;
}

const ALIGN_CLASS: Record<ColumnAlign, string> = { left: "text-left", right: "text-right", center: "text-center" };

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
        {col.tip && <InfoTip tip={col.tip} label={`About ${col.header}`} />}
        {label}
      </span>
    </th>
  );
}

/**
 * The standard table: sticky header under the app shell (no inner scroll box, which hid the first
 * row), h-9 rows, ⓘ header tooltips. A clickable row is a real keyboard target (Enter/Space).
 */
export function DataTable<T>({ columns, rows, rowKey, onRowClick, selectedKey, sort, emptyState }: DataTableProps<T>) {
  if (rows.length === 0) return <>{emptyState}</>;
  const onKey = (e: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    onRowClick?.(row);
  };
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
          const selected = key === selectedKey;
          return (
            <tr
              key={key}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              aria-pressed={onRowClick ? selected : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => onKey(e, row) : undefined}
              className={`h-9 ${onRowClick ? "cursor-pointer hover:bg-neutral-800/50" : ""} ${selected ? "bg-amber-400/10" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`whitespace-nowrap border-b border-line/70 px-2 text-neutral-200 ${ALIGN_CLASS[c.align ?? "left"]}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
