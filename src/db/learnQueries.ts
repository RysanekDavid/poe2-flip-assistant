import { getDb } from "./database";

export interface LearnProgressRow {
  stepId: string;
  /** Epoch milliseconds. */
  doneAt: number;
}

/** A user's ticked atlas-checklist steps, oldest first. */
export function listLearnProgress(userId: number): LearnProgressRow[] {
  return getDb()
    .prepare("SELECT step_id AS stepId, done_at AS doneAt FROM learn_progress WHERE user_id = ? ORDER BY done_at, step_id")
    .all(userId) as LearnProgressRow[];
}

/** Tick (done=true) or untick a step. Re-ticking keeps the first done_at: the step was done then. */
export function setLearnStepDone(userId: number, stepId: string, done: boolean, nowMs: number): void {
  const db = getDb();
  if (done) {
    db.prepare("INSERT INTO learn_progress (user_id, step_id, done_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").run(userId, stepId, nowMs);
    return;
  }
  db.prepare("DELETE FROM learn_progress WHERE user_id = ? AND step_id = ?").run(userId, stepId);
}
