import { z } from "zod";

const uuidSchema = z.string().uuid();

export const coachSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["market", "live", "knowledge", "web", "game_data"]),
  title: z.string().min(1),
  url: z.string().url().regex(/^https?:\/\//i).nullable(),
});

export const coachBrowserRequestSchema = z.object({
  message: z.string().trim().min(1).max(8_000),
  conversationId: uuidSchema,
});

export const coachUpstreamResponseSchema = z.object({
  thread_id: uuidSchema,
  answer: z.string().min(1),
  tools_used: z.array(z.string().min(1)),
  processors_used: z.array(z.string().min(1)),
  sources: z.array(coachSourceSchema),
});

export const coachBrowserResponseSchema = z.object({
  conversationId: uuidSchema,
  answer: z.string().min(1),
  toolsUsed: z.array(z.string().min(1)),
  processorsUsed: z.array(z.string().min(1)),
  sources: z.array(coachSourceSchema),
});

export const coachHealthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  market_ready: z.boolean(),
  knowledge_ready: z.boolean(),
  item_data_ready: z.boolean(),
  model_configured: z.boolean(),
  web_search_ready: z.boolean(),
  model: z.string().min(1),
});

export type CoachBrowserResponse = z.infer<typeof coachBrowserResponseSchema>;
export type CoachSource = z.infer<typeof coachSourceSchema>;
