import Database from "better-sqlite3";
import { statfsSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

/**
 * Monthly compaction: checkpoint the WAL into the main file, VACUUM, checkpoint again.
 *
 * Runs beside the live web + poller (no service stop). VACUUM needs the write lock, so the
 * connection waits up to `busyTimeoutMs` for in-flight writers and then fails loudly rather
 * than skipping — a silent skip would let the freelist grow unnoticed. Needs free disk of
 * roughly the live data size twice over (temp copy + WAL) while it runs; `vacuumDatabase`
 * refuses to start without that headroom, because a VACUUM that hits ENOSPC mid-run also starves
 * the live web + poller writing to the same filesystem.
 */

export interface DbSizeStats {
  fileBytes: number;
  walBytes: number;
  pageSize: number;
  pageCount: number;
  freelistCount: number;
}

export interface VacuumReport {
  path: string;
  before: DbSizeStats;
  after: DbSizeStats;
  durationMs: number;
}

const CheckpointRow = z.object({ busy: z.number(), log: z.number(), checkpointed: z.number() });

function fileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
}

function pragmaNumber(conn: Database.Database, name: string): number {
  return z.number().parse(conn.pragma(name, { simple: true }));
}

export function readDbStats(conn: Database.Database, path: string): DbSizeStats {
  return {
    fileBytes: fileSize(path),
    walBytes: fileSize(`${path}-wal`),
    pageSize: pragmaNumber(conn, "page_size"),
    pageCount: pragmaNumber(conn, "page_count"),
    freelistCount: pragmaNumber(conn, "freelist_count"),
  };
}

/** TRUNCATE checkpoint; throws when readers/writers kept it from completing. */
export function checkpointTruncate(conn: Database.Database): void {
  const [row] = z.array(CheckpointRow).parse(conn.pragma("wal_checkpoint(TRUNCATE)"));
  if (row && row.busy !== 0) {
    throw new Error(
      `WAL checkpoint(TRUNCATE) blocked (busy=${row.busy}, log=${row.log}, checkpointed=${row.checkpointed}) ` +
        "— another connection held the database past the busy timeout",
    );
  }
}

/** Bytes available to this (unprivileged) user on the filesystem holding `path`. */
export function freeDiskBytes(path: string): number {
  const stats = statfsSync(dirname(path));
  return stats.bavail * stats.bsize;
}

/** VACUUM writes a full temp copy and then pushes the same pages through the WAL: ~2x the DB. */
export function assertVacuumHeadroom(path: string, dbBytes: number, freeBytes: number): void {
  const required = dbBytes * 2;
  if (freeBytes >= required) return;
  throw new Error(
    `refusing to VACUUM ${path}: needs ~${mb(required)} free (2x the ${mb(dbBytes)} database + WAL), ` +
      `only ${mb(freeBytes)} available on ${dirname(path)} — free disk space first`,
  );
}

export function vacuumDatabase(
  path: string,
  busyTimeoutMs: number,
  measureFreeBytes: (path: string) => number = freeDiskBytes,
): VacuumReport {
  const started = Date.now();
  assertVacuumHeadroom(path, fileSize(path) + fileSize(`${path}-wal`), measureFreeBytes(path));
  const conn = new Database(path, { fileMustExist: true, timeout: busyTimeoutMs });
  try {
    const before = readDbStats(conn, path);
    checkpointTruncate(conn);
    try {
      conn.exec("VACUUM");
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`VACUUM failed on ${path} (busy timeout ${busyTimeoutMs} ms): ${reason}`, {
        cause: error,
      });
    }
    checkpointTruncate(conn);
    return { path, before, after: readDbStats(conn, path), durationMs: Date.now() - started };
  } finally {
    conn.close();
  }
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatStats(label: string, stats: DbSizeStats): string {
  const freeBytes = stats.freelistCount * stats.pageSize;
  return `${label}: file ${mb(stats.fileBytes)} + wal ${mb(stats.walBytes)} · ` +
    `${stats.pageCount} pages × ${stats.pageSize} B · freelist ${stats.freelistCount} pages (${mb(freeBytes)})`;
}
