"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CoachSource } from "../../lib/coachContract";
import { CoachApiError, sendCoachMessage } from "./api";

export interface CoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed: string[];
  processorsUsed: string[];
  sources: CoachSource[];
}

export function useCoachSession() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setConversationId(crypto.randomUUID());
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(async (content: string): Promise<void> => {
    const message = content.trim();
    if (!conversationId || !message || isLoading) return;
    const outgoing = chatMessage("user", message);
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [...current, outgoing]);
    setError(null);
    setIsLoading(true);
    try {
      const response = await sendCoachMessage(message, conversationId, controller.signal);
      setMessages((current) => [
        ...current,
        {
          ...chatMessage("assistant", response.answer),
          toolsUsed: response.toolsUsed,
          processorsUsed: response.processorsUsed,
          sources: response.sources,
        },
      ]);
    } catch (caught: unknown) {
      if (!controller.signal.aborted) setError(errorMessage(caught));
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [conversationId, isLoading]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setConversationId(crypto.randomUUID());
    setMessages([]);
    setError(null);
    setIsLoading(false);
  }, []);

  return { messages, isLoading, error, send, reset, ready: conversationId !== null };
}

function chatMessage(role: CoachMessage["role"], content: string): CoachMessage {
  return {
    id: crypto.randomUUID(), role, content, toolsUsed: [], processorsUsed: [], sources: [],
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof CoachApiError) return error.message;
  if (error instanceof Error) return `Coach failed: ${error.message}`;
  return "Coach failed for an unknown reason.";
}
