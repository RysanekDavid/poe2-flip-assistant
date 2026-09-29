import { z } from "zod";

/*
 * GET/POST /api/settings/poe response, shared by the route, the Settings panel and the cred
 * banner so a shape change fails the client parse loudly. Never carries the secret itself.
 */

export const CRED_STATES = ["unknown", "ok", "expired"] as const;
export const credStateSchema = z.enum(CRED_STATES);
export type CredState = z.infer<typeof credStateSchema>;

export const credStatusSchema = z.object({
  /** ok = the last trade2 call with this cookie succeeded; expired = it got a 403. */
  state: credStateSchema,
  /** ISO time of the trade2 answer that set `state`; null until one arrives. */
  checkedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type CredStatus = z.infer<typeof credStatusSchema>;

export const poeSettingsResponseSchema = z.object({
  connected: z.boolean(),
  contact: z.string(),
  account: z.string(),
  credStatus: credStatusSchema,
});
export type PoeSettingsResponse = z.infer<typeof poeSettingsResponseSchema>;
