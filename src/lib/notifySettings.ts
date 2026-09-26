import { z } from "zod";
import { PrefRowSchema } from "../core/notify/prefs";

/** /api/settings/notify payload, parsed at the client boundary. The webhook arrives masked only. */
export const NotifySettingsSchema = z.object({
  webhook: z.object({
    state: z.enum(["none", "set", "unreadable"]),
    masked: z.string().nullable(),
  }),
  prefs: z.array(PrefRowSchema),
  digest: z.boolean(),
  status: z.object({
    pending: z.number(),
    lastSentAt: z.number().nullable(),
    failed7d: z.number(),
    lastError: z.string().nullable(),
    lastErrorAt: z.number().nullable(),
  }),
  tested: z.boolean().optional(),
});
export type NotifySettings = z.infer<typeof NotifySettingsSchema>;

const ErrorBody = z.object({ error: z.string() });

/** POST a settings action; returns the fresh view or throws with the server's message. */
export async function postNotifySettings(body: unknown): Promise<NotifySettings> {
  const res = await fetch("/api/settings/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json: unknown = await res.json();
  if (!res.ok) {
    const err = ErrorBody.safeParse(json);
    throw new Error(err.success ? err.data.error : `notification settings failed (${res.status})`);
  }
  return NotifySettingsSchema.parse(json);
}

export async function fetchNotifySettings(): Promise<NotifySettings> {
  const res = await fetch("/api/settings/notify");
  if (!res.ok) throw new Error(`notification settings failed to load (${res.status})`);
  return NotifySettingsSchema.parse(await res.json());
}
