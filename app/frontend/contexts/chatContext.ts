import {MementoUIMessage } from "@/components/types";
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
  LocalPending: ["Thinking", "Error"],
  Thinking: ["Streaming", "Finished", "NoResults", "Error"], // Can jump to Finished/NoResults if no stream
  Streaming: ["Finished", "NoResults", "Error"],
  Finished: ["Idle"], // Assuming you want to reset for the next message
  NoResults: ["Idle"], // No results is not an error, can reset
  Error: ["Idle"], // Assuming you want to allow recovery/reset
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
  stepUpdates: any[]; // Array of step thinking events
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
