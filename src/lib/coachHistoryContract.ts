import { z } from "zod";
import { coachSourceSchema } from "./coachContract";

const uuidSchema = z.string().uuid();
const isoDateSchema = z.string().datetime();

export const coachConversationSummarySchema = z.object({
  id: uuidSchema,
  // Derived titles cap at 64 Unicode code points, which can span 128 UTF-16 units
  // (astral characters); z.string().max counts UTF-16 units, so 80 would reject
  // stored emoji-heavy titles on read.
  title: z.string().min(1).max(128),
  turnCount: z.number().int().min(0).max(50),
  messageCount: z.number().int().min(0).max(100),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  lastMessageAt: isoDateSchema,
}).strict();

export const coachHistoryMessageSchema = z.object({
  id: z.string().min(1),
  turnId: uuidSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(64_000),
  toolsUsed: z.array(z.string().min(1)),
  processorsUsed: z.array(z.string().min(1)),
  sources: z.array(coachSourceSchema),
  createdAt: isoDateSchema,
}).strict();

export const coachConversationListSchema = z.object({
  conversations: z.array(coachConversationSummarySchema).max(20),
}).strict();

export const coachConversationDetailSchema = z.object({
  conversation: coachConversationSummarySchema,
  messages: z.array(coachHistoryMessageSchema).max(100),
}).strict();

export const coachRenameRequestSchema = z.object({
  title: z.string().trim().min(1).max(80),
}).strict();

export type CoachConversationSummary = z.infer<typeof coachConversationSummarySchema>;
export type CoachConversationDetail = z.infer<typeof coachConversationDetailSchema>;
export type CoachHistoryMessage = z.infer<typeof coachHistoryMessageSchema>;
