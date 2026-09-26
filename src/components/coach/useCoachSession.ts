"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import type { CoachError } from "../../lib/coachContract";
import type { CoachConversationSummary } from "../../lib/coachHistoryContract";
import {
  CoachApiError,
  deleteCoachConversation,
  fetchCoachConversation,
  fetchCoachConversations,
  renameCoachConversation,
  sendCoachMessage,
} from "./api";
import {
  appendUniqueMessages,
  createCompletedAssistant,
  createPendingUser,
  nextConversationAfterDelete,
  restoredMessages,
  type CoachMessage,
} from "./coachSessionState";

export type { CoachMessage } from "./coachSessionState";

export interface CoachSessionFailure extends CoachError {
  prompt: string;
  turnId: string;
  expectedTurnCount: number;
}

interface SessionCore {
  conversationId: string;
  turnCount: number;
  messages: CoachMessage[];
  conversations: CoachConversationSummary[];
  isLoading: boolean;
  isHistoryLoading: boolean;
  error: CoachSessionFailure | null;
  setConversationId: Dispatch<SetStateAction<string>>;
  setTurnCount: Dispatch<SetStateAction<number>>;
  setMessages: Dispatch<SetStateAction<CoachMessage[]>>;
  setConversations: Dispatch<SetStateAction<CoachConversationSummary[]>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setIsHistoryLoading: Dispatch<SetStateAction<boolean>>;
  setError: Dispatch<SetStateAction<CoachSessionFailure | null>>;
}

/**
 * `active` gates history restore: the panel stays mounted (hidden) on every tab, and users who
 * never open Coach should not pay two history requests per page load.
 */
export function useCoachSession(active: boolean) {
  const core = useSessionCore();
  const abortRef = useRef<AbortController | null>(null);
  const conversationActions = useConversationActions(core, abortRef);
  const { remove, rename } = useConversationMutations(core, conversationActions);
  const { retry, send } = useTurnActions(core, conversationActions.refresh, abortRef);
  useLazyRestore(active, core, abortRef);

  const recover = core.error?.retryable ? retry : conversationActions.newChat;
  return {
    conversationId: core.conversationId,
    turnCount: core.turnCount,
    messages: core.messages,
    conversations: core.conversations,
    isLoading: core.isLoading,
    isHistoryLoading: core.isHistoryLoading,
    error: core.error,
    send,
    retry,
    newChat: conversationActions.newChat,
    open: conversationActions.open,
    rename,
    remove,
    recover,
    ready: !core.isHistoryLoading,
  };
}

/**
 * Restore the newest conversation on the first activation only. A restore interrupted by the
 * tab closing is retried on the next activation, as is a failed one; one cancelled by
 * "new chat" is not, or it would overwrite the conversation the user just started.
 */
function useLazyRestore(
  active: boolean,
  core: SessionCore,
  abortRef: RefObject<AbortController | null>,
): void {
  const restoredRef = useRef(false);
  const { setConversationId, setConversations, setError, setIsHistoryLoading, setMessages,
    setTurnCount } = core;

  useEffect(() => {
    if (!active || restoredRef.current) return;
    const controller = new AbortController();
    let cancelledByCleanup = false;
    abortRef.current = controller;
    setIsHistoryLoading(true);
    void restoreLatest(controller, setConversations, setConversationId, setTurnCount, setMessages)
      .then(() => {
        restoredRef.current = true;
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(historyActionFailure(caught));
        else if (!cancelledByCleanup) restoredRef.current = true;
      })
      .finally(() => setIsHistoryLoading(false));
    return () => {
      cancelledByCleanup = true;
      controller.abort();
    };
  }, [abortRef, active, setConversationId, setConversations, setError, setIsHistoryLoading,
    setMessages, setTurnCount]);
}

function useSessionCore(): SessionCore {
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [turnCount, setTurnCount] = useState(0);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [conversations, setConversations] = useState<CoachConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [error, setError] = useState<CoachSessionFailure | null>(null);
  return {
    conversationId, turnCount, messages, conversations, isLoading, isHistoryLoading, error,
    setConversationId, setTurnCount, setMessages, setConversations, setIsLoading,
    setIsHistoryLoading, setError,
  };
}

interface ConversationActions {
  newChat: () => void;
  open: (id: string) => Promise<void>;
  refresh: () => Promise<CoachConversationSummary[]>;
}

function useConversationActions(
  core: SessionCore,
  abortRef: RefObject<AbortController | null>,
): ConversationActions {
  const {
    isLoading, setConversationId, setConversations, setError,
    setIsHistoryLoading, setIsLoading, setMessages, setTurnCount,
  } = core;

  const refresh = useCallback(async (): Promise<CoachConversationSummary[]> => {
    const list = await fetchCoachConversations();
    setConversations(list);
    return list;
  }, [setConversations]);

  const open = useCallback(async (id: string): Promise<void> => {
    if (isLoading) return;
    setIsHistoryLoading(true);
    try {
      const detail = await fetchCoachConversation(id);
      setConversationId(detail.conversation.id);
      setTurnCount(detail.conversation.turnCount);
      setMessages(restoredMessages(detail.messages));
      setError(null);
    } catch (caught: unknown) {
      setError(historyActionFailure(caught));
    } finally {
      setIsHistoryLoading(false);
    }
  }, [isLoading, setConversationId, setError, setIsHistoryLoading, setMessages, setTurnCount]);

  // Cancels an in-flight turn on purpose: the server still commits the answer and
  // replay-by-turnId recovers it, so the browser may abandon the wait immediately.
  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setConversationId(crypto.randomUUID());
    setTurnCount(0);
    setMessages([]);
    setError(null);
  }, [abortRef, setConversationId, setError, setIsLoading, setMessages, setTurnCount]);

  return { newChat, open, refresh };
}

function useConversationMutations(core: SessionCore, actions: ConversationActions) {
  const { conversationId, isLoading, setConversations, setError } = core;
  const { newChat, open, refresh } = actions;

  const rename = useCallback(async (id: string, title: string): Promise<void> => {
    if (isLoading) return;
    try {
      const updated = await renameCoachConversation(id, title);
      setConversations((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (caught: unknown) {
      setError(historyActionFailure(caught));
    }
  }, [isLoading, setConversations, setError]);

  const remove = useCallback(async (id: string): Promise<void> => {
    if (isLoading) return;
    try {
      await deleteCoachConversation(id);
      const remaining = await refresh();
      const next =
        nextConversationAfterDelete(conversationId, id, remaining.map((item) => item.id));
      if (next === conversationId) return;
      if (next) await open(next);
      else newChat();
    } catch (caught: unknown) {
      setError(historyActionFailure(caught));
    }
  }, [conversationId, isLoading, newChat, open, refresh, setError]);

  return { remove, rename };
}

function useTurnActions(
  core: SessionCore,
  refresh: () => Promise<CoachConversationSummary[]>,
  abortRef: RefObject<AbortController | null>,
) {
  const {
    conversationId, error, isHistoryLoading, isLoading, turnCount,
    setError, setIsLoading, setMessages, setTurnCount,
  } = core;

  const run = useCallback(async (
    prompt: string,
    targetTurnId: string,
    expectedTurnCount: number,
  ): Promise<void> => {
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => appendUniqueMessages(
      current, [createPendingUser(targetTurnId, prompt)],
    ));
    setError(null);
    setIsLoading(true);
    try {
      const response = await sendCoachMessage(
        prompt, conversationId, targetTurnId, expectedTurnCount, controller.signal,
      );
      setMessages((current) => appendUniqueMessages(current, [createCompletedAssistant(response)]));
      setTurnCount(response.turnCount);
      await refresh();
    } catch (caught: unknown) {
      if (!controller.signal.aborted) {
        setError(sessionFailure(caught, prompt, targetTurnId, expectedTurnCount));
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [abortRef, conversationId, refresh, setError, setIsLoading, setMessages, setTurnCount]);

  const send = useCallback(async (content: string): Promise<void> => {
    const prompt = content.trim();
    if (!prompt || isLoading || isHistoryLoading) return;
    await run(prompt, crypto.randomUUID(), turnCount);
  }, [isHistoryLoading, isLoading, run, turnCount]);

  const retry = useCallback(async (): Promise<void> => {
    if (!error?.retryable || isLoading || isHistoryLoading) return;
    const expected = error.code === "stale_conversation"
      ? await synchronizedTurnCount(conversationId, error.expectedTurnCount,
        setMessages, setTurnCount)
      : error.expectedTurnCount;
    await run(error.prompt, error.turnId, expected);
  }, [conversationId, error, isHistoryLoading, isLoading, run, setMessages, setTurnCount]);

  return { retry, send };
}

/**
 * Resync a stale conversation before retrying: another request already advanced the
 * turn count, so replaying the failed expectedTurnCount would loop on the same error.
 */
async function synchronizedTurnCount(
  conversationId: string,
  fallback: number,
  setMessages: Dispatch<SetStateAction<CoachMessage[]>>,
  setTurnCount: Dispatch<SetStateAction<number>>,
): Promise<number> {
  try {
    const detail = await fetchCoachConversation(conversationId);
    setMessages(restoredMessages(detail.messages));
    setTurnCount(detail.conversation.turnCount);
    return detail.conversation.turnCount;
  } catch {
    // The conversation may not exist yet (first turn failed); the retry itself
    // reports the authoritative server error.
    return fallback;
  }
}

async function restoreLatest(
  controller: AbortController,
  setConversations: (value: CoachConversationSummary[]) => void,
  setConversationId: (value: string) => void,
  setTurnCount: (value: number) => void,
  setMessages: (value: CoachMessage[]) => void,
): Promise<void> {
  const conversations = await fetchCoachConversations(controller.signal);
  setConversations(conversations);
  const latest = conversations[0];
  if (!latest) return;
  const detail = await fetchCoachConversation(latest.id, controller.signal);
  setConversationId(detail.conversation.id);
  setTurnCount(detail.conversation.turnCount);
  setMessages(restoredMessages(detail.messages));
}

function historyActionFailure(caught: unknown): CoachSessionFailure {
  return { ...sessionFailure(caught, "", crypto.randomUUID(), 0), retryable: false };
}

function sessionFailure(
  error: unknown,
  prompt: string,
  turnId: string,
  expectedTurnCount: number,
): CoachSessionFailure {
  const detail: CoachError = error instanceof CoachApiError ? error.detail : {
    code: "internal",
    message: error instanceof Error ? `Coach failed: ${error.message}` : "Coach failed.",
    requestId: "unknown",
    retryable: false,
    resetConversation: false,
  };
  return { ...detail, prompt, turnId, expectedTurnCount };
}
