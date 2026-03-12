import { MementoUIMessage, ThinkingStep } from "@/components/types";
import { createContext } from "react";

export type AssistantStatus =
  | "Idle" // No Conversation
  | "LocalPending" // User just sent message
  | "Thinking" // Server reasoning/searching
  | "Streaming" // Tokens arriving
  | "Finished" // Message complete (Terminal)
  | "NoResults" // Search completed but found no results (Terminal, not an error)
  | "Error"; // Failure (Terminal)

// Define the strict, forward-only transition rules
export const TRANSITIONS: Record<AssistantStatus, AssistantStatus[]> = {
  Idle: ["LocalPending", "Thinking", "Streaming", "Finished", "NoResults", "Error"],
  LocalPending: ["Thinking", "Streaming", "Finished", "NoResults", "Error", "Idle"],
  Thinking: ["Streaming", "Finished", "NoResults", "Error", "Idle"],
  Streaming: ["Finished", "NoResults", "Error", "Idle"],
  Finished: ["Idle", "LocalPending"], // Allow starting new conversation
  NoResults: ["Idle", "LocalPending"], // Allow starting new conversation
  Error: ["Idle", "LocalPending"], // Allow starting new conversation
};

type ChatContext = {
  messages: MementoUIMessage[];
  chatId: string;
  isMessagesLoaded: boolean;
  sendMessage: (
    message: string,
    messageId?: string,
    rewrite?: boolean,
  ) => Promise<void>;
  rewrite: (messageId: string) => Promise<void>;
  stopMessage: () => void;
  isGenerating: boolean;
  assistantStatus: AssistantStatus; // Use the raw string type here
  makeTransition: (nextState: AssistantStatus) => boolean;
  stepUpdates: ThinkingStep[]; // Array of step thinking events
};

export function chatContextEmptyState(): ChatContext {
  return {
    chatId: "",
    isMessagesLoaded: false,
    messages: [],
    sendMessage: async () => {},
    rewrite: async () => {},
    stopMessage: () => {},
    isGenerating: false,
    assistantStatus: "Idle",
    makeTransition: () => false,
    stepUpdates: [],
  };
}

export const ChatContext = createContext<ChatContext>(chatContextEmptyState());
