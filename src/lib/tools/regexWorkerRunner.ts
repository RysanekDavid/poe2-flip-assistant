/*
 * One Web Worker with a hard deadline per job. Pasted search strings are evaluated off the main
 * thread; if a job overruns (a gap in safeRegex's cost model, a pathological paste) the worker is
 * terminated — the only way to stop a running regex — and a fresh one is created for the next
 * job, so the page answers "too complex" instead of freezing. DOM-free (the worker and the timer
 * are injected) so the deadline logic is unit-tested in node.
 *
 * The deadline measures evaluation only: a worker announces `{ ready: true }` once its script has
 * loaded, and a job's clock starts then. Otherwise a cold start (download + parse of the worker
 * chunk) would eat the budget and every job after a kill would "time out" on startup alone.
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

/** What a worker posts: the ready handshake, or a job id plus either a result or the error it caught. */
export const WorkerReplySchema = z.union([
  z.object({ ready: z.literal(true) }).strict(),
  z.object({ id: z.number().int(), result: z.unknown() }).strict(),
  z.object({ id: z.number().int(), error: z.string() }).strict(),
]);
export type WorkerReply = z.infer<typeof WorkerReplySchema>;

/** A worker that has not loaded after this long is reported as broken, not waited on forever. */
export const WORKER_STARTUP_MS = 10_000;

export interface TimedWorkerOptions<Res> {
  create: () => WorkerPort;
  /** Validates the result payload; a throw becomes a "failed" outcome. */
  parse: (data: unknown) => Res;
  timeoutMs: number;
  startupMs?: number;
  timers?: Timers;
}

interface Pending<Res> {
  id: number;
  resolve: (outcome: WorkerOutcome<Res>) => void;
  timer: unknown;
  /** The clock running is the startup one (the job's deadline starts at the ready handshake). */
  starting: boolean;
}

export class TimedWorker<Req, Res> {
  private port: WorkerPort | null = null;
  private ready = false;
  private pending: Pending<Res> | null = null;
  private nextId = 1;
  private readonly timers: Timers;
  /** Workers created so far (the first one plus one per kill) — tests read it. */
  created = 0;

  constructor(private readonly options: TimedWorkerOptions<Res>) {
    this.timers = options.timers ?? browserTimers;
  }

  /** Creates the worker ahead of the first job so its load time is already paid. */
  warm(): void {
    this.ensurePort();
  }

  /** Runs one job. A job still running is superseded: its worker is busy, so it is killed. */
  run(request: Req): Promise<WorkerOutcome<Res>> {
    if (this.pending) this.settle({ kind: "superseded" }, true);
    const port = this.ensurePort();
    const id = this.nextId++;
    return new Promise((resolve) => {
      this.pending = { id, resolve, timer: null, starting: !this.ready };
      this.pending.timer = this.ready ? this.deadline() : this.startupClock();
      port.post({ id, request });
    });
  }

  dispose(): void {
    this.settle({ kind: "superseded" }, false);
    this.kill();
  }

  private deadline(): unknown {
    const ms = this.options.timeoutMs;
    return this.timers.set(() => this.settle({ kind: "timeout", ms }, true), ms);
  }

  private startupClock(): unknown {
    const ms = this.options.startupMs ?? WORKER_STARTUP_MS;
    return this.timers.set(() => this.settle({ kind: "failed", message: `the explain worker did not start within ${ms} ms` }, true), ms);
  }

  private ensurePort(): WorkerPort {
    if (this.port) return this.port;
    const port = this.options.create();
    this.created += 1;
    this.ready = false;
    port.listen(
      (data) => this.onData(port, data),
      (message) => {
        if (port === this.port) this.fail(`worker crashed: ${message}`);
      },
    );
    this.port = port;
    return port;
  }

  private onReady(): void {
    this.ready = true;
    const p = this.pending;
    if (!p?.starting) return;
    this.timers.clear(p.timer);
    p.starting = false;
    p.timer = this.deadline();
  }

  private onData(port: WorkerPort, data: unknown): void {
    // a terminated worker can still deliver a message queued before terminate(); it answers nothing
    if (port !== this.port) return;
    const reply = WorkerReplySchema.safeParse(data);
    if (!reply.success) {
      this.fail(`worker sent a malformed reply: ${reply.error.issues[0]?.message ?? "invalid"}`);
      return;
    }
    if ("ready" in reply.data) return this.onReady();
    if (!this.pending || reply.data.id !== this.pending.id) return; // answer to a superseded job
    if ("error" in reply.data) return this.settle({ kind: "failed", message: reply.data.error }, false);
    try {
      this.settle({ kind: "ok", value: this.options.parse(reply.data.result) }, false);
    } catch (error: unknown) {
      this.settle({ kind: "failed", message: `worker result rejected: ${error instanceof Error ? error.message : String(error)}` }, true);
    }
  }

  /** A broken worker: fail the running job (if any) and kill it either way. */
  private fail(message: string): void {
    if (this.pending) this.settle({ kind: "failed", message }, true);
    else this.kill();
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
    this.ready = false;
  }
}
