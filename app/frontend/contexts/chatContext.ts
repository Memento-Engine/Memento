import { MementoUIMessage } from "@/components/types";
import { createContext } from "react";

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
};

export function chatContextEmptyState(): ChatContext {
  return {
    chatId: "",
    isMessagesLoaded: false,
    messages: [],
    sendMessage: async () => {},
    rewrite: () => {},
  };
}

export const ChatContext = createContext<ChatContext>(chatContextEmptyState());
