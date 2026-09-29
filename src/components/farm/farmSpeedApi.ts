import { useCallback, useState } from "react";
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

/**
 * One save at a time per panel: the error stays on screen until the next save succeeds (never
 * swallowed), and a success reloads the board so every Div/hour comes from the server's one formula.
 */
export function useSpeedSave(onSaved: () => void): { error: string | null; pending: boolean; run: (op: () => Promise<unknown>) => void } {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(
    (op: () => Promise<unknown>) => {
      setPending(true);
      op()
        .then(() => {
          setError(null);
          onSaved();
        })
        .catch((e: unknown) => setError(describeError(e)))
        .finally(() => setPending(false));
    },
    [onSaved],
  );
  return { error, pending, run };
}
