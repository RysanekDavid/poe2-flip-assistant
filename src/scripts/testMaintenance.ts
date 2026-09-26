/* DB maintenance (VACUUM + nightly backup) against throwaway SQLite files. No network.
 * Run: npm run test:maintenance */
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { vacuumDatabase } from "../db/maintenance";
import { backupDatabase } from "../db/maintenanceBackup";

const root = mkdtempSync(join(tmpdir(), "poe2flip-maintenance-"));

/** WAL database with lots of deleted rows (big freelist) and uncheckpointed WAL content. */
function seedDatabase(path: string): void {
  const conn = new Database(path);
  conn.pragma("journal_mode = WAL");
  conn.pragma("wal_autocheckpoint = 0");
  conn.exec("CREATE TABLE blobs (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
  const insert = conn.prepare("INSERT INTO blobs (body) VALUES (?)");
  conn.transaction(() => {
    for (let index = 0; index < 2000; index += 1) insert.run("x".repeat(2000));
  })();
  conn.pragma("wal_checkpoint(TRUNCATE)");
  conn.exec("DELETE FROM blobs WHERE id > 20");
  conn.close();
}

function testVacuum(): void {
  const path = join(root, "vacuum.db");
  seedDatabase(path);
  const report = vacuumDatabase(path, 1000);
  assert.ok(report.before.freelistCount > 500, `seed must leave a freelist (${report.before.freelistCount})`);
  assert.equal(report.after.freelistCount, 0, "VACUUM reclaims every free page");
  assert.ok(report.after.fileBytes < report.before.fileBytes / 10, "file shrinks");
  assert.equal(report.after.walBytes, 0, "WAL truncated after VACUUM");
  const check = new Database(path, { readonly: true });
  assert.equal((check.prepare("SELECT COUNT(*) AS n FROM blobs").get() as { n: number }).n, 20);
  check.close();
}

function testVacuumFailsLoudWhenLocked(): void {
  const path = join(root, "locked.db");
  seedDatabase(path);
  const holder = new Database(path);
  holder.exec("BEGIN IMMEDIATE");
  holder.prepare("INSERT INTO blobs (body) VALUES ('held')").run();
  try {
    assert.throws(() => vacuumDatabase(path, 200), /blocked|VACUUM failed|busy|locked/i);
  } finally {
    holder.exec("ROLLBACK");
    holder.close();
  }
}

async function testBackup(): Promise<void> {
  const path = join(root, "poe2flip.db");
  seedDatabase(path);
  const live = new Database(path);
  live.pragma("wal_autocheckpoint = 0");
  live.prepare("INSERT INTO blobs (body) VALUES ('only-in-wal')").run();
  const dir = join(root, "nightly");
  const unrelated = join(root, "keep-me.db.gz");
  writeFileSync(unrelated, "not a backup");
  for (let day = 1; day <= 5; day += 1) {
    const now = new Date(Date.UTC(2026, 8, day, 3, 15));
    await backupDatabase({ dbPath: path, dir, keep: 3, busyTimeoutMs: 1000, now });
  }
  live.close();
  const files = readdirSync(dir).sort();
  assert.deepEqual(files, [
    "poe2flip-2026-09-03T03-15-00-000Z.db.gz",
    "poe2flip-2026-09-04T03-15-00-000Z.db.gz",
    "poe2flip-2026-09-05T03-15-00-000Z.db.gz",
  ], "keeps the newest 3, no partial files left behind");
  const restored = join(root, "restored.db");
  writeFileSync(restored, gunzipSync(readFileSync(join(dir, files[2]!))));
  const check = new Database(restored, { readonly: true });
  const rows = check.prepare("SELECT body FROM blobs WHERE body = 'only-in-wal'").all();
  assert.equal(rows.length, 1, "backup includes committed-but-uncheckpointed WAL data");
  check.close();
  assert.equal(readFileSync(unrelated, "utf8"), "not a backup");

  await assert.rejects(
    backupDatabase({ dbPath: path, dir, keep: 3, busyTimeoutMs: 1000, rcloneRemote: "poe2flip-test-missing-remote:" }),
    /rclone/,
    "a failing off-box copy fails the run",
  );
}

function runCli(args: string[], env: Record<string, string>): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/db/maintenanceCli.ts", ...args], {
    encoding: "utf8",
    env: { ...process.env, APP_DISABLE_DOTENV: "1", ...env },
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function testCli(): void {
  const path = join(root, "cli.db");
  seedDatabase(path);
  const vacuum = runCli(["vacuum", "--wait=5"], { DB_PATH: path });
  assert.equal(vacuum.status, 0, vacuum.output);
  assert.match(vacuum.output, /after : file .* freelist 0 pages/);
  const noDir = runCli(["backup"], { DB_PATH: path, BACKUP_DIR: "" });
  assert.notEqual(noDir.status, 0, "backup without BACKUP_DIR fails loudly");
  assert.match(noDir.output, /BACKUP_DIR/);
  assert.notEqual(runCli(["compact"], { DB_PATH: path }).status, 0, "unknown command is rejected");
}

function testSystemdUnits(): void {
  const read = (name: string): string => readFileSync(join("deploy", name), "utf8");
  const scripts = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts;
  for (const [unit, command] of [["poe2flip-backup", "backup"], ["poe2flip-maintenance", "vacuum"]] as const) {
    const service = read(`${unit}.service`);
    assert.match(service, /^Type=oneshot$/m);
    assert.match(service, /^User=poe2flip$/m);
    assert.match(service, /^EnvironmentFile=\/opt\/poe2flip\/\.env\.local$/m);
    assert.match(service, new RegExp(`^ExecStart=/opt/poe2flip/current/node_modules/\\.bin/tsx src/db/maintenanceCli\\.ts ${command} --wait=\\d+$`, "m"));
    assert.match(read(`${unit}.timer`), /^Persistent=true$/m);
  }
  assert.match(read("poe2flip-backup.service"), /^Environment=BACKUP_DIR=\/opt\/poe2flip\/backups\/nightly$/m);
  assert.match(read("poe2flip-backup.timer"), /^OnCalendar=\*-\*-\* 03:15:00$/m);
  assert.match(read("poe2flip-maintenance.timer"), /^OnCalendar=\*-\*-01 04:30:00$/m);
  assert.equal(scripts["db:maintain"], "tsx src/db/maintenanceCli.ts vacuum");
  assert.equal(scripts["db:backup"], "tsx src/db/maintenanceCli.ts backup");
}

async function main(): Promise<void> {
  try {
    testSystemdUnits();
    testVacuum();
    testVacuumFailsLoudWhenLocked();
    await testBackup();
    testCli();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  console.log("ALL PASS — VACUUM + checkpoint, lock failure, nightly backup rotation, CLI");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
