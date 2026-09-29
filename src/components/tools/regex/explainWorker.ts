/*
 * Web Worker: evaluates a pasted stash-search string off the main thread. The panel's TimedWorker
 * terminates this worker when a job overruns its deadline, so a pathological pattern can never
 * freeze the page. Every message gets an answer — a thrown error is posted back, not swallowed.
 */
import { runExplainJob } from "../../../lib/tools/regexExplainJob";
import type { WorkerReply } from "../../../lib/tools/regexWorkerRunner";

interface Envelope {
  id: number;
  request: unknown;
}

function isEnvelope(data: unknown): data is Envelope {
  return typeof data === "object" && data !== null && "id" in data && typeof data.id === "number" && "request" in data;
}

globalThis.addEventListener("message", (event: MessageEvent<unknown>) => {
  const data = event.data;
  if (!isEnvelope(data)) {
    // no id to answer to; the runner's deadline reports the lost job
    console.error("[regex/explainWorker] message without a job id", data);
    return;
  }
  let reply: WorkerReply;
  try {
    reply = { id: data.id, result: runExplainJob(data.request) };
  } catch (error: unknown) {
    reply = { id: data.id, error: error instanceof Error ? error.message : String(error) };
  }
  globalThis.postMessage(reply);
});
