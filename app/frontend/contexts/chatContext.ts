import { MementoUIMessage } from "@/components/types";
import { createContext } from "react";

export type AssistantStatus =
  | "Idle" // No Conversation
  | "LocalPending" // User just sent message
  | "Thinking" // Server reasoning/searching
  | "Streaming" // Tokens arriving
  | "Finished" // Message complete (Terminal)
  | "Error"; // Failure (Terminal)

// Define the strict, forward-only transition rules
export const TRANSITIONS: Record<AssistantStatus, AssistantStatus[]> = {
  Idle: ["LocalPending", "Thinking", "Streaming", "Finished", "Error"],
  LocalPending: ["Thinking", "Error"],
  Thinking: ["Streaming", "Finished", "Error"], // Can jump to Finished if no stream
  Streaming: ["Finished", "Error"],
  Finished: ["Idle"], // Assuming you want to reset for the next message
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
  rewrite: (messageId: string) => void;
  assistantStatus: AssistantStatus; // Use the raw string type here
  makeTransition: (nextState: AssistantStatus) => boolean;
};

export function chatContextEmptyState(): ChatContext {
  return {
    chatId: "",
    isMessagesLoaded: false,
    messages: [],
    sendMessage: async () => {},
    rewrite: () => {},
    assistantStatus: "Idle",
    makeTransition: () => false,
  };
}

export const ChatContext = createContext<ChatContext>(chatContextEmptyState());
