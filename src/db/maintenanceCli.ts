import { config } from "../config/env"; // loads .env.local (DB_PATH) before anything reads it
import { z } from "zod";
import { formatStats, vacuumDatabase } from "./maintenance";
import { backupDatabase } from "./maintenanceBackup";

/**
 * Ops entrypoint for the systemd timers (deploy/poe2flip-{backup,maintenance}.*):
 *   tsx src/db/maintenanceCli.ts vacuum [--wait=SECONDS]   (npm run db:maintain)
 *   tsx src/db/maintenanceCli.ts backup [--wait=SECONDS]   (npm run db:backup)
 * backup reads BACKUP_DIR (required), BACKUP_KEEP (default 14), BACKUP_RCLONE_REMOTE (optional).
 */

const Args = z.object({
  command: z.enum(["vacuum", "backup"]),
  waitSec: z.coerce.number().int().positive().max(3600).default(60),
});

const BackupEnv = z.object({
  BACKUP_DIR: z.string().min(1, "BACKUP_DIR is required (absolute directory for nightly backups)"),
  BACKUP_KEEP: z.coerce.number().int().min(1).max(365).default(14),
  BACKUP_RCLONE_REMOTE: z.string().optional().transform((value) => value?.trim() || undefined),
});

function parseArgs(argv: string[]): z.infer<typeof Args> {
  const wait = argv.find((arg) => arg.startsWith("--wait="))?.slice("--wait=".length);
  const unknown = argv.slice(1).filter((arg) => !arg.startsWith("--wait="));
  if (unknown.length > 0) throw new Error(`unknown arguments: ${unknown.join(" ")}`);
  return Args.parse({ command: argv[0], waitSec: wait });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const busyTimeoutMs = args.waitSec * 1000;
  if (args.command === "vacuum") {
    const report = vacuumDatabase(config.dbPath, busyTimeoutMs);
    console.log(`[maintain] ${report.path} vacuumed in ${report.durationMs} ms`);
    console.log(`[maintain] ${formatStats("before", report.before)}`);
    console.log(`[maintain] ${formatStats("after ", report.after)}`);
    return;
  }
  const env = BackupEnv.parse(process.env);
  const report = await backupDatabase({
    dbPath: config.dbPath,
    dir: env.BACKUP_DIR,
    keep: env.BACKUP_KEEP,
    busyTimeoutMs,
    rcloneRemote: env.BACKUP_RCLONE_REMOTE,
  });
  console.log(`[backup] wrote ${report.file}${report.offBox ? " (+ off-box copy)" : " (on-box only)"}`);
  if (report.pruned.length > 0) console.log(`[backup] pruned ${report.pruned.join(", ")}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
