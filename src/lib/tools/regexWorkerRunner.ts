/*
 * One Web Worker with a hard deadline per job. Pasted search strings are evaluated off the main
 * thread; if a job overruns (a gap in safeRegex's cost model, a pathological paste) the worker is
 * terminated — the only way to stop a running regex — and a fresh one is created for the next
 * job, so the page answers "too complex" instead of freezing. DOM-free (the worker and the timer
 * are injected) so the deadline logic is unit-tested in node.
 */
import { z } from "zod";

/** The slice of a Worker this runner needs; the panel adapts a real Worker to it. */
export interface WorkerPort {
  post(message: unknown): void;
  terminate(): void;
  listen(onData: (data: unknown) => void, onError: (message: string) => void): void;
}

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export const browserTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type WorkerOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "timeout"; ms: number }
  | { kind: "failed"; message: string }
  | { kind: "superseded" };

/** What a worker posts back: the job id plus either a result or the error it caught. */
export const WorkerReplySchema = z.union([
  z.object({ id: z.number().int(), result: z.unknown() }).strict(),
  z.object({ id: z.number().int(), error: z.string() }).strict(),
]);
export type WorkerReply = z.infer<typeof WorkerReplySchema>;

export interface TimedWorkerOptions<Res> {
  create: () => WorkerPort;
  /** Validates the result payload; a throw becomes a "failed" outcome. */
  parse: (data: unknown) => Res;
  timeoutMs: number;
  timers?: Timers;
}

interface Pending<Res> {
  id: number;
  resolve: (outcome: WorkerOutcome<Res>) => void;
  timer: unknown;
}

export class TimedWorker<Req, Res> {
  private port: WorkerPort | null = null;
  private pending: Pending<Res> | null = null;
  private nextId = 1;
  private readonly timers: Timers;
  /** Workers created so far (the first one plus one per kill) — tests read it. */
  created = 0;

  constructor(private readonly options: TimedWorkerOptions<Res>) {
    this.timers = options.timers ?? browserTimers;
  }

  /** Runs one job. A job still running is superseded: its worker is busy, so it is killed. */
  run(request: Req): Promise<WorkerOutcome<Res>> {
    if (this.pending) this.settle({ kind: "superseded" }, true);
    const port = this.ensurePort();
    const id = this.nextId++;
    const { timeoutMs } = this.options;
    return new Promise((resolve) => {
      const timer = this.timers.set(() => this.settle({ kind: "timeout", ms: timeoutMs }, true), timeoutMs);
      this.pending = { id, resolve, timer };
      port.post({ id, request });
    });
  }

  dispose(): void {
    this.settle({ kind: "superseded" }, false);
    this.kill();
  }

  private ensurePort(): WorkerPort {
    if (this.port) return this.port;
    const port = this.options.create();
    this.created += 1;
    port.listen(
      (data) => this.onData(port, data),
      (message) => {
        if (port === this.port) this.settle({ kind: "failed", message: `worker crashed: ${message}` }, true);
      },
    );
    this.port = port;
    return port;
  }

  private onData(port: WorkerPort, data: unknown): void {
    // a terminated worker can still deliver a message queued before terminate(); it answers nothing
    if (port !== this.port || !this.pending) return;
    const reply = WorkerReplySchema.safeParse(data);
    if (!reply.success) {
      this.settle({ kind: "failed", message: `worker sent a malformed reply: ${reply.error.issues[0]?.message ?? "invalid"}` }, true);
      return;
    }
    if (reply.data.id !== this.pending.id) return; // an answer to a superseded job on the same worker
    if ("error" in reply.data) {
      this.settle({ kind: "failed", message: reply.data.error }, false);
      return;
    }
    try {
      this.settle({ kind: "ok", value: this.options.parse(reply.data.result) }, false);
    } catch (error: unknown) {
      this.settle({ kind: "failed", message: `worker result rejected: ${error instanceof Error ? error.message : String(error)}` }, true);
    }
  }

  private settle(outcome: WorkerOutcome<Res>, kill: boolean): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.timers.clear(p.timer);
    if (kill) this.kill();
    p.resolve(outcome);
  }

  private kill(): void {
    this.port?.terminate();
    this.port = null;
  }
}
