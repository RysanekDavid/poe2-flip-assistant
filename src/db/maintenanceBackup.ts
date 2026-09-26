import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { createReadStream, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { z } from "zod";

/**
 * Nightly online backup: SQLite's backup API (consistent snapshot while web + poller keep
 * writing) → quick_check the copy → gzip → atomic rename → keep the newest N → optional
 * off-box copy with rclone. Every step throws on failure so the systemd unit goes red.
 */

export interface BackupOptions {
  dbPath: string;
  dir: string;
  keep: number;
  busyTimeoutMs: number;
  /** rclone destination such as `b2crypt:poe2flip/nightly`; undefined = on-box only. */
  rcloneRemote?: string;
  now?: Date;
}

export interface BackupReport {
  file: string;
  pruned: string[];
  offBox: boolean;
}

export async function backupDatabase(options: BackupOptions): Promise<BackupReport> {
  mkdirSync(options.dir, { recursive: true, mode: 0o700 });
  const prefix = `${basename(options.dbPath, extname(options.dbPath))}-`;
  const stamp = (options.now ?? new Date()).toISOString().replace(/[:.]/g, "-");
  const file = join(options.dir, `${prefix}${stamp}.db.gz`);
  const rawTemp = join(options.dir, `.${prefix}${stamp}.db.partial`);
  const gzTemp = `${rawTemp}.gz`;
  try {
    await snapshot(options.dbPath, rawTemp, options.busyTimeoutMs);
    finalizeCopy(rawTemp);
    await pipeline(createReadStream(rawTemp), createGzip({ level: 9 }), createWriteStream(gzTemp, { mode: 0o600 }));
    renameSync(gzTemp, file);
  } finally {
    for (const leftover of [rawTemp, `${rawTemp}-wal`, `${rawTemp}-shm`, gzTemp]) rmSync(leftover, { force: true });
  }
  const pruned = pruneBackups(options.dir, prefix, options.keep);
  if (options.rcloneRemote) copyOffBox(file, options.rcloneRemote);
  return { file, pruned, offBox: Boolean(options.rcloneRemote) };
}

/** sqlite3_backup_step page count better-sqlite3 accepts; large enough to mean "everything". */
const ALL_PAGES = 0x7fffffff;

/**
 * better-sqlite3 copies 100 pages per event-loop turn by default, and SQLite restarts an online
 * backup from page 1 whenever another connection commits between steps — on a DB the poller
 * writes every few seconds that can loop for a long time. Copying everything in one step holds a
 * single read snapshot (WAL), so concurrent commits cannot restart it.
 */
async function snapshot(dbPath: string, destination: string, busyTimeoutMs: number): Promise<void> {
  const source = new Database(dbPath, { readonly: true, fileMustExist: true, timeout: busyTimeoutMs });
  let steps = 0;
  try {
    await source.backup(destination, {
      progress: ({ totalPages, remainingPages }) => {
        steps += 1;
        // Call 1 follows the zero-page probe step; any later call means the full copy was restarted.
        if (steps > 1) {
          console.warn(`[backup] snapshot restarted (step ${steps}, ${remainingPages}/${totalPages} pages left)`);
        }
        return ALL_PAGES;
      },
    });
  } finally {
    source.close();
  }
}

/**
 * The copy inherits WAL mode from the live DB; switch it to a rollback journal so the archived
 * file is self-contained (no -wal/-shm siblings), then verify it.
 */
function finalizeCopy(path: string): void {
  const conn = new Database(path, { fileMustExist: true });
  try {
    conn.pragma("journal_mode = DELETE");
    const result = z.string().parse(conn.pragma("quick_check", { simple: true }));
    if (result !== "ok") throw new Error(`quick_check failed for ${path}: ${result}`);
  } finally {
    conn.close();
  }
}

/** Delete all but the newest `keep` backups for this prefix. ISO stamps sort chronologically. */
export function pruneBackups(dir: string, prefix: string, keep: number): string[] {
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.+\\.db\\.gz$`);
  const backups = readdirSync(dir).filter((name) => pattern.test(name)).sort().reverse();
  const stale = backups.slice(keep);
  for (const name of stale) rmSync(join(dir, name));
  return stale;
}

function copyOffBox(file: string, remote: string): void {
  const result = spawnSync("rclone", ["copy", "--", file, remote], { stdio: "inherit" });
  if (result.error) throw new Error(`rclone could not start: ${result.error.message}`, { cause: result.error });
  if (result.status !== 0) throw new Error(`rclone copy to ${remote} exited with ${result.status}`);
}
