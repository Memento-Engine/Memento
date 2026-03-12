"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";

import { MementoUIMessage, ThinkingStep } from "@/components/types";
import { AssistantStatus, ChatContext, TRANSITIONS } from "@/contexts/chatContext";
import { useStreaming } from "@/hooks/useStreaming";
import { createUserMessage, truncateBeforeMessage } from "@/lib/messageUtils";
import { notify } from "@/lib/notify";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>("Idle");
  const [stepUpdates, setStepUpdates] = useState<ThinkingStep[]>([]);
  
  // Use ref to avoid stale closure issue in callbacks
  const assistantStatusRef = useRef<AssistantStatus>(assistantStatus);
  useEffect(() => {
    assistantStatusRef.current = assistantStatus;
  }, [assistantStatus]);
  
  const router = useRouter();

  // Status transition with validation (uses ref to get current status)
  const transitionStatus = useCallback((nextState: AssistantStatus): boolean => {
    const currentStatus = assistantStatusRef.current;
    const allowedNextStates = TRANSITIONS[currentStatus];

    if (!allowedNextStates.includes(nextState)) {
      console.warn(`Blocked transition from ${currentStatus} to ${nextState}`);
      return false;
    }

    // Set the requested state - don't auto-transition terminal states to Idle
    setAssistantStatus(nextState);
    return true;
  }, []);

  // Initialize streaming hook
  const { activeRequestRef, streamMessage, abort } = useStreaming({
    setMessages,
    setStepUpdates,
    transitionStatus,
  });

  const isGenerating = 
    assistantStatus === "LocalPending" ||
    assistantStatus === "Thinking" ||
    assistantStatus === "Streaming";

  const stopMessage = useCallback((): void => {
    abort();
    setAssistantStatus("Idle");
    notify.info("Generation stopped");
  }, [abort]);

  const sendMessage = useCallback(async (
    message: string,
    rewriteTargetId?: string,
    isRewrite: boolean = false,
  ): Promise<void> => {
    // Abort any existing request
    abort();

    const abortController = new AbortController();
    activeRequestRef.current = abortController;

    router.push("/chat/123");
    console.log("Message from chat input", message);

    transitionStatus("LocalPending");
    setStepUpdates([]);

    try {
      // Update messages based on rewrite or new message
      if (isRewrite && rewriteTargetId) {
        setMessages((prev) => truncateBeforeMessage(prev, rewriteTargetId));
      } else {
        setMessages((prev) => [...prev, createUserMessage(message)]);
      }

      await streamMessage(message, abortController.signal);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Streaming aborted by user");
        return;
      }

      console.error("Error while sending message:", err);
      transitionStatus("Error");
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
    }
  }, [abort, activeRequestRef, router, transitionStatus, streamMessage]);

  const rewrite = useCallback(async (messageId: string): Promise<void> => {
    const assistantIndex = messages.findIndex(
      (msg) => msg.id === messageId && msg.role === "assistant"
    );

    if (assistantIndex < 0) {
      notify.warning("Could not regenerate this message");
      return;
    }

    // Find the user message before this assistant message
    const userBeforeAssistant = [...messages]
      .slice(0, assistantIndex)
      .reverse()
      .find((msg) => msg.role === "user");

    const userPrompt = userBeforeAssistant?.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim() ?? "";

    if (!userPrompt) {
      notify.warning("No user prompt found for regeneration");
      return;
    }

    await sendMessage(userPrompt, messageId, true);
  }, [messages, sendMessage]);

  const contextValue = {
    sendMessage,
    chatId: "",
    isMessagesLoaded: false,
    messages,
    rewrite,
    stopMessage,
    isGenerating,
    assistantStatus,
    makeTransition: transitionStatus,
    stepUpdates,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}
