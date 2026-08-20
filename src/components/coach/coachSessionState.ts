import type { CoachHistoryMessage } from "../../lib/coachHistoryContract";
import type { CoachBrowserResponse, CoachSource } from "../../lib/coachContract";

export interface CoachMessage {
  id: string;
  turnId: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed: string[];
  processorsUsed: string[];
  sources: CoachSource[];
  createdAt: string;
}

export function createPendingUser(turnId: string, content: string): CoachMessage {
  return {
    id: `${turnId}:user`,
    turnId,
    role: "user",
    content,
    toolsUsed: [],
    processorsUsed: [],
    sources: [],
    createdAt: new Date().toISOString(),
  };
}

export function createCompletedAssistant(response: CoachBrowserResponse): CoachMessage {
  return {
    id: `${response.turnId}:assistant`,
    turnId: response.turnId,
    role: "assistant",
    content: response.answer,
    toolsUsed: response.toolsUsed,
    processorsUsed: response.processorsUsed,
    sources: response.sources,
    createdAt: new Date().toISOString(),
  };
}

export function restoredMessages(messages: CoachHistoryMessage[]): CoachMessage[] {
  return appendUniqueMessages([], messages);
}

export function appendUniqueMessages(
  current: CoachMessage[],
  additions: CoachMessage[] | CoachHistoryMessage[],
): CoachMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of additions) byId.set(`${message.turnId}:${message.role}`, message);
  return [...byId.values()];
}

export function nextConversationAfterDelete(
  activeId: string,
  deletedId: string,
  remainingIds: string[],
): string | null {
  if (activeId !== deletedId) return activeId;
  return remainingIds[0] ?? null;
}
