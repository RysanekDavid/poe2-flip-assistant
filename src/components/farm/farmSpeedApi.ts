import { useCallback, useRef, useState } from "react";
import { describeError } from "../../lib/clientWarn";
import {
  speedDeleteResponseSchema,
  speedErrorSchema,
  speedPutResponseSchema,
  type SpeedDelete,
  type SpeedEntry,
  type SpeedPut,
} from "../../lib/farmContract";

const ROUTE = "/api/farm/speed";

/** The server's own message for a rejected save (e.g. "minutesPerRun: …"), else the HTTP status. */
async function failure(res: Response, what: string): Promise<Error> {
  const parsed = speedErrorSchema.safeParse(await res.json().catch(() => null));
  return new Error(parsed.success ? parsed.data.error : `${what} failed (HTTP ${res.status})`);
}

async function send(method: "PUT" | "DELETE", body: SpeedPut | SpeedDelete): Promise<unknown> {
  const res = await fetch(ROUTE, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw await failure(res, method === "PUT" ? "saving your pace" : "clearing your pace");
  return res.json();
}

/** Save (fully replace) the viewer's pace on one row; throws the server's message on rejection. */
export async function putSpeed(body: SpeedPut): Promise<SpeedEntry> {
  return speedPutResponseSchema.parse(await send("PUT", body)).entry;
}

/** Clear the viewer's pace on one row. */
export async function deleteSpeed(body: SpeedDelete): Promise<void> {
  speedDeleteResponseSchema.parse(await send("DELETE", body));
}

/** One row's save state: queued/in-flight saves and the last failure (kept until that row saves). */
export interface RowSave {
  pending: number;
  error: string | null;
}

const IDLE: RowSave = { pending: 0, error: null };

export interface RowSaves {
  status: (rowKey: string) => RowSave;
  /** Every row whose last save failed, for one summary alert. */
  failures: Array<{ rowKey: string; error: string }>;
  run: (rowKey: string, op: () => Promise<unknown>) => void;
}

/**
 * Saves keyed by row: saves on one row run one after another (the server row is a full
 * replacement, so two in flight could land out of order), different rows run independently, and a
 * success on one row never erases another row's failure. Each success reloads the board so every
 * Div/hour comes from the server's one formula; a failure stays on screen, never swallowed.
 */
export function useRowSaves(onSaved: () => void): RowSaves {
  const [state, setState] = useState<Record<string, RowSave>>({});
  const chains = useRef(new Map<string, Promise<void>>());
  const update = useCallback((rowKey: string, next: (prev: RowSave) => RowSave) => {
    setState((s) => ({ ...s, [rowKey]: next(s[rowKey] ?? IDLE) }));
  }, []);
  const run = useCallback(
    (rowKey: string, op: () => Promise<unknown>) => {
      update(rowKey, (p) => ({ ...p, pending: p.pending + 1 }));
      const settled = (chains.current.get(rowKey) ?? Promise.resolve()).then(op).then(
        () => {
          update(rowKey, (p) => ({ pending: p.pending - 1, error: null }));
          onSaved();
        },
        (e: unknown) => update(rowKey, (p) => ({ pending: p.pending - 1, error: describeError(e) })),
      );
      chains.current.set(rowKey, settled);
    },
    [onSaved, update],
  );
  const failures = Object.entries(state).flatMap(([rowKey, s]) => (s.error == null ? [] : [{ rowKey, error: s.error }]));
  return { status: (rowKey) => state[rowKey] ?? IDLE, failures, run };
}
