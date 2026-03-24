import {
  MementoUIMessage,
  SearchMode,
  ThinkingStep,
  SourcesPayload,
} from "@/components/types";

function getSearchModeLabel(searchMode: SearchMode): string {
  return searchMode === "accurateSearch" ? "Accurate Search" : "Search";
}

// Generate a unique message ID
export function createMessageId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Create a new assistant message
export function createAssistantMessage(
  parts: MementoUIMessage["parts"] = []
): MementoUIMessage {
  return {
    id: createMessageId(),
    role: "assistant",
    parts,
  };
}

// Create a new user message
export function createUserMessage(
  text: string,
  searchMode: SearchMode = "search"
): MementoUIMessage {
  return {
    id: createMessageId(),
    role: "user",
    parts: [
      { type: "text", text },
      {
        type: "data-searchMode",
        data: {
          mode: searchMode,
          label: getSearchModeLabel(searchMode),
        },
      },
    ],
  };
}

export function getMessageSearchMode(
  message: MementoUIMessage,
): SearchMode | undefined {
  const searchModePart = message.parts.find(
    (part) => part.type === "data-searchMode",
  );

  if (!searchModePart || searchModePart.type !== "data-searchMode") {
    return undefined;
  }

  return searchModePart.data.mode;
}

// Get or create the last assistant message
function getOrCreateLastAssistantMessage(
  messages: MementoUIMessage[]
): { messages: MementoUIMessage[]; lastMessage: MementoUIMessage; isNew: boolean } {
  const lastMessage = messages[messages.length - 1];
  
  if (lastMessage && lastMessage.role === "assistant") {
    return {
      messages: [...messages],
      lastMessage: { ...lastMessage },
      isNew: false,
    };
  }
  
  const newMessage = createAssistantMessage([]);
  return {
    messages: [...messages, newMessage],
    lastMessage: newMessage,
    isNew: true,
  };
}

// Append thinking step to messages
export function appendThinkingStep(
  messages: MementoUIMessage[],
  thinkingStep: ThinkingStep
): MementoUIMessage[] {
  const { messages: updatedMessages, lastMessage, isNew } = 
    getOrCreateLastAssistantMessage(messages);
  
  const updatedParts = [...lastMessage.parts, { type: "data-thinking" as const, data: thinkingStep }];
  lastMessage.parts = updatedParts;
  
  if (isNew) {
    return updatedMessages;
  }
  
  updatedMessages[updatedMessages.length - 1] = lastMessage;
  return updatedMessages;
}

// Append or update text in messages
export function appendTextChunk(
  messages: MementoUIMessage[],
  chunk: string
): MementoUIMessage[] {
  const { messages: updatedMessages, lastMessage, isNew } = 
    getOrCreateLastAssistantMessage(messages);
  
  const updatedParts = [...lastMessage.parts];
  const lastPart = updatedParts[updatedParts.length - 1];
  
  if (lastPart && lastPart.type === "text") {
    updatedParts[updatedParts.length - 1] = {
      ...lastPart,
      text: lastPart.text + chunk,
    };
  } else {
    updatedParts.push({ type: "text", text: chunk });
  }
  
  lastMessage.parts = updatedParts;
  
  if (isNew) {
    return updatedMessages;
  }
  
  updatedMessages[updatedMessages.length - 1] = lastMessage;
  return updatedMessages;
}

// Append error message to messages
export function appendErrorMessage(
  messages: MementoUIMessage[],
  errorMessage: string
): MementoUIMessage[] {
  const { messages: updatedMessages, lastMessage, isNew } = 
    getOrCreateLastAssistantMessage(messages);
  
  const updatedParts = [...lastMessage.parts];
  const lastPart = updatedParts[updatedParts.length - 1];
  
  if (lastPart && lastPart.type === "text") {
    updatedParts[updatedParts.length - 1] = {
      ...lastPart,
      text: lastPart.text + "\n" + errorMessage,
    };
  } else {
    updatedParts.push({ type: "text", text: errorMessage });
  }
  
  lastMessage.parts = updatedParts;
  
  if (isNew) {
    return updatedMessages;
  }
  
  updatedMessages[updatedMessages.length - 1] = lastMessage;
  return updatedMessages;
}

// Update or add sources to messages
export function updateSources(
  messages: MementoUIMessage[],
  sourcesPayload: SourcesPayload
): MementoUIMessage[] {
  const { messages: updatedMessages, lastMessage, isNew } = 
    getOrCreateLastAssistantMessage(messages);
  
  const updatedParts = [...lastMessage.parts];
  const existingIndex = updatedParts.findIndex(
    (part) => part.type === "data-sources"
  );
  
  if (existingIndex >= 0) {
    updatedParts[existingIndex] = { type: "data-sources", data: sourcesPayload };
  } else {
    updatedParts.push({ type: "data-sources", data: sourcesPayload });
  }
  
  lastMessage.parts = updatedParts;
  
  if (isNew) {
    return updatedMessages;
  }
  
  updatedMessages[updatedMessages.length - 1] = lastMessage;
  return updatedMessages;
}

// Update or add followups to messages
export function updateFollowups(
  messages: MementoUIMessage[],
  followups: string[]
): MementoUIMessage[] {
  if (!Array.isArray(followups) || followups.length === 0) {
    return messages;
  }

  const trimmed = followups
    .map((f) => (typeof f === "string" ? f.trim() : ""))
    .filter(Boolean)
    .slice(0, 3);

  if (trimmed.length === 0) {
    return messages;
  }

  const { messages: updatedMessages, lastMessage, isNew } =
    getOrCreateLastAssistantMessage(messages);

  const updatedParts = [...lastMessage.parts];
  const existingIndex = updatedParts.findIndex(
    (part) => part.type === "data-followups"
  );

  if (existingIndex >= 0) {
    updatedParts[existingIndex] = { type: "data-followups", data: trimmed };
  } else {
    updatedParts.push({ type: "data-followups", data: trimmed });
  }

  lastMessage.parts = updatedParts;

  if (isNew) {
    return updatedMessages;
  }

  updatedMessages[updatedMessages.length - 1] = lastMessage;
  return updatedMessages;
}

// Ensure assistant message exists with fallback text
// Only adds text if no text part exists yet
export function ensureAssistantMessage(
  messages: MementoUIMessage[],
  fallbackText: string
): MementoUIMessage[] {
  const lastMessage = messages[messages.length - 1];
  
  // Check if there's already a text part with content
  if (lastMessage && lastMessage.role === "assistant") {
    const hasTextContent = lastMessage.parts.some(
      (p) => p.type === "text" && p.text && p.text.trim().length > 0
    );
    if (hasTextContent) {
      return messages;
    }
    
    // Add text to existing assistant message
    const updated = {
      ...lastMessage,
      parts: [...lastMessage.parts, { type: "text" as const, text: fallbackText }]
    };
    return [...messages.slice(0, -1), updated];
  }
  
  return [...messages, createAssistantMessage([{ type: "text", text: fallbackText }])];
}

// Truncate messages to before a specific message ID
export function truncateBeforeMessage(
  messages: MementoUIMessage[],
  messageId: string
): MementoUIMessage[] {
  const targetIndex = messages.findIndex((item) => item.id === messageId);
  if (targetIndex < 0) return messages;
  return messages.slice(0, targetIndex);
}

// Filter messages to only include text parts
export function filterTextOnlyMessages(
  messages: MementoUIMessage[]
): MementoUIMessage[] {
  return messages.map((m) => ({
    ...m,
    parts: m.parts.filter((p) => p.type === "text"),
  }));
}
