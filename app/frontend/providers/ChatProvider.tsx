"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { isDesktopProductionMode } from "../lib/runtimeMode";

import { MementoUIMessage, ThinkingStep } from "@/components/types";
import { AssistantStatus, ChatContext, TRANSITIONS } from "@/contexts/chatContext";
import { useStreaming } from "@/hooks/useStreaming";
import { createUserMessage, truncateBeforeMessage } from "@/lib/messageUtils";
import { notify } from "@/lib/notify";
import { SearchQueryData, SourceReviewData } from "@/lib/streamSchemas";
import { USE_MOCK_DATA, getMockResponse, MOCK_THINKING_STEPS } from "@/mock";
import useOnboarding from "@/hooks/useOnboarding";
import { clearAuthState, isAuthError } from "@/lib/auth";

interface ChatProviderProps {
  children: React.ReactNode;
}

export default function ChatProvider({ children }: ChatProviderProps) {
  const [messages, setMessages] = useState<MementoUIMessage[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<AssistantStatus>("Idle");
  const [stepUpdates, setStepUpdates] = useState<ThinkingStep[]>([]);
  const [searchQueries, setSearchQueries] = useState<SearchQueryData[]>([]);
  const [sourceReview, setSourceReview] = useState<SourceReviewData | null>(null);
  
  const { setIsOnboardingComplete } = useOnboarding();
  
  // Use ref to avoid stale closure issue in callbacks
  const assistantStatusRef = useRef<AssistantStatus>(assistantStatus);
  useEffect(() => {
    assistantStatusRef.current = assistantStatus;
  }, [assistantStatus]);
  
  const router = useRouter();
  const pathname = usePathname();

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
    setSearchQueries,
    setSourceReview,
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

    if (pathname !== "/chat/123") {
      router.push("/chat/123", { scroll: false });
    }
    console.log("Message from chat input", message);

    transitionStatus("LocalPending");
    setStepUpdates([]);
    setSearchQueries([]);
    setSourceReview(null);

    try {
      // Update messages based on rewrite or new message
      if (isRewrite && rewriteTargetId) {
        setMessages((prev) => truncateBeforeMessage(prev, rewriteTargetId));
      } else {
        setMessages((prev) => [...prev, createUserMessage(message)]);
      }

      // ========== MOCK MODE ==========
      if (USE_MOCK_DATA) {
        console.log("[MOCK MODE] Simulating AI response...");
        
        // Get mock response based on user message
        const mockResponse = getMockResponse(message);
        if (!mockResponse) {
          transitionStatus("Error");
          return;
        }

        // Extract thinking steps from mock response
        const thinkingParts = mockResponse.parts.filter(
          (p) => p.type === "data-thinking"
        );

        // Simulate thinking phase - stream each thinking step with delay
        transitionStatus("Thinking");
        
        for (let i = 0; i < thinkingParts.length; i++) {
          if (abortController.signal.aborted) return;
          
          const part = thinkingParts[i];
          if (part.type === "data-thinking") {
            // Add thinking step progressively
            setStepUpdates((prev) => [...prev, part.data as ThinkingStep]);
            
            // Wait based on the step's duration (scaled down for demo)
            const duration = (part.data as ThinkingStep).duration ?? 500;
            await new Promise((resolve) => setTimeout(resolve, Math.min(duration, 800)));
          }
        }

        // Small pause before streaming text
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        // Transition to streaming
        transitionStatus("Streaming");
        
        // Add the complete message with all parts
        setMessages((prev) => [...prev, mockResponse]);
        
        // Small delay to let UI render
        await new Promise((resolve) => setTimeout(resolve, 100));
        
        // Transition to finished
        transitionStatus("Finished");
        
        console.log("[MOCK MODE] Response complete");
        return;
      }
      // ========== END MOCK MODE ==========

      await streamMessage(message, abortController.signal);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Streaming aborted by user");
        return;
      }

      // Handle auth errors - redirect to onboarding
      if (isAuthError(err)) {
        console.error("Auth error - redirecting to onboarding:", err);
        notify.error("Please complete device registration");
        // Clear all auth state (localStorage, cookie, keyring)
        await clearAuthState();
        setIsOnboardingComplete(false);
        router.push("/onboarding");
        return;
      }

      console.error("Error while sending message:", err);
      if (isDesktopProductionMode()) {
        Sentry.withScope((scope) => {
          scope.setTag("environment", "frontend");
          scope.setTag("service", "ui");
          scope.setTag("area", "chat-send-message");
          scope.setExtra("isRewrite", isRewrite);
          scope.setExtra("goalLength", message.length);
          Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
        });
      }
      transitionStatus("Error");
    } finally {
      if (activeRequestRef.current === abortController) {
        activeRequestRef.current = null;
      }
    }
  }, [abort, activeRequestRef, pathname, router, transitionStatus, streamMessage, setIsOnboardingComplete]);

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
    searchQueries,
    sourceReview,
  };

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}
