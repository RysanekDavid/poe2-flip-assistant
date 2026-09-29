"use client";

import { useEffect, useRef, useState } from "react";
import { EXPLAIN_TIMEOUT_MS, ExplainJobResultSchema, type ExplainJob, type ExplainJobResult } from "../../../lib/tools/regexExplainJob";
import { TimedWorker, type WorkerPort } from "../../../lib/tools/regexWorkerRunner";

const DEBOUNCE_MS = 250;

export type ExplainRun =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: ExplainJobResult }
  | { status: "timeout"; ms: number }
  | { status: "failed"; message: string };

// The literal `new Worker(new URL(…, import.meta.url))` form is what lets webpack bundle the worker.
function createPort(): WorkerPort {
  const worker = new Worker(new URL("./explainWorker.ts", import.meta.url));
  return {
    post: (message) => worker.postMessage(message),
    terminate: () => worker.terminate(),
    listen: (onData, onError) => {
      worker.onmessage = (e: MessageEvent<unknown>) => onData(e.data);
      worker.onerror = (e: ErrorEvent) => {
        e.preventDefault();
        onError(e.message || "worker failed to load");
      };
    },
  };
}

/**
 * Evaluates `job` in the explain worker, debounced. Pasted strings never run on the main thread:
 * a job over EXPLAIN_TIMEOUT_MS kills the worker and reports "too complex" instead.
 */
export function useExplainWorker(job: ExplainJob | null): ExplainRun {
  const runner = useRef<TimedWorker<ExplainJob, ExplainJobResult> | null>(null);
  const [run, setRun] = useState<ExplainRun>({ status: "idle" });
  useEffect(() => {
    runner.current = new TimedWorker({ create: createPort, parse: (d) => ExplainJobResultSchema.parse(d), timeoutMs: EXPLAIN_TIMEOUT_MS });
    // load the worker now, while the player is still picking mods, not on the first paste
    runner.current.warm();
    return () => {
      runner.current?.dispose();
      runner.current = null;
    };
  }, []);
  useEffect(() => {
    if (!job) {
      setRun({ status: "idle" });
      return;
    }
    let live = true;
    setRun({ status: "running" });
    const t = window.setTimeout(() => {
      const r = runner.current;
      if (!r) return;
      void r.run(job).then((outcome) => {
        if (!live || outcome.kind === "superseded") return;
        if (outcome.kind === "ok") setRun({ status: "done", result: outcome.value });
        else if (outcome.kind === "timeout") setRun({ status: "timeout", ms: outcome.ms });
        else setRun({ status: "failed", message: outcome.message });
      });
    }, DEBOUNCE_MS);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [job]);
  return run;
}
