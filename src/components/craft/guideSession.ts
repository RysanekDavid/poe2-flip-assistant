import { z } from "zod";
import type { Screen } from "./SessionStep";

/**
 * The saved position of a guide run (no React, no storage access: the hook in GuideRunner.tsx
 * reads and writes, this decides what a saved value means). A saved step must exist in the guide
 * it is restored into — a stale index after the guide changed restarts at the shopping list.
 */

const screenSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("shop") }),
  z.object({ kind: z.literal("step"), idx: z.number().int().nonnegative(), failed: z.boolean() }),
  z.object({ kind: z.literal("outcome"), brick: z.boolean() }),
]);
const storedSchema = z.object({ key: z.string(), screen: screenSchema });

export type StoredScreen = { ok: true; screen: Screen | null } | { ok: false; reason: string };

/**
 * The saved screen of `sessionKey`: null when nothing (or another session) is saved; a reason when
 * the value is unreadable or points past the guide's last step (the caller logs it, starts fresh).
 */
export function parseStoredScreen(raw: string | null, sessionKey: string, stepCount: number): StoredScreen {
  if (raw == null) return { ok: true, screen: null };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e: unknown) {
    return { ok: false, reason: `saved session is not JSON (${e instanceof Error ? e.message : String(e)})` };
  }
  const parsed = storedSchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: `saved session has the wrong shape: ${parsed.error.issues[0]?.message ?? "invalid"}` };
  if (parsed.data.key !== sessionKey) return { ok: true, screen: null };
  const screen = parsed.data.screen;
  if (screen.kind === "step" && screen.idx >= stepCount) return { ok: false, reason: `saved step ${screen.idx + 1} is past this guide's ${stepCount} steps` };
  return { ok: true, screen };
}

export const serializeScreen = (sessionKey: string, screen: Screen): string => JSON.stringify({ key: sessionKey, screen });
