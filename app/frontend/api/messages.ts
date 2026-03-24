/**
 * API functions for chat message persistence via the daemon.
 */
import { ThinkingStep } from "@/components/types";
import { getBaseUrl } from "./base";

export interface MessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  thinking_steps: ThinkingStep[];
  followups: string[];
  sources: MessageSourceRow[];
}

export interface MessageSourceRow {
  chunk_id: number;
  app_name: string;
  window_title: string;
  captured_at: string;
  browser_url: string;
  text_content: string;
  text_json?: string | null;
  image_path: string;
  frame_id: number;
  window_x: number;
  window_y: number;
  window_width: number;
  window_height: number;
}

export interface GetMessagesResponse {
  success: boolean;
  messages: MessageRow[];
}

export interface ChatSessionRow {
  session_id: string;
  title: string;
  pinned: boolean;
  last_message_at: string;
}

interface ListChatsResponse {
  success: boolean;
  chats: ChatSessionRow[];
}

interface MutationResponse {
  success: boolean;
}

/**
 * Load chat messages for a session from the daemon DB.
 */
export async function loadSessionMessages(
  sessionId: string,
  limit: number = 50
): Promise<MessageRow[]> {
  try {
    const baseUrl = await getBaseUrl();
    
    const response = await fetch(`${baseUrl}/chat/messages/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, limit }),
    });

    if (!response.ok) {
      console.error("Failed to load messages:", response.status, response.statusText);
      return [];
    }

    const data: GetMessagesResponse = await response.json();
    
    if (data.success) {
      return data.messages;
    }
    
    return [];
  } catch (error) {
    console.error("Error loading session messages:", error);
    return [];
  }
}

/**
 * List chat sessions for sidebar history.
 */
export async function listChatSessions(limit: number = 100): Promise<ChatSessionRow[]> {
  try {
    const baseUrl = await getBaseUrl();

    const response = await fetch(`${baseUrl}/chat/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit }),
    });

    if (!response.ok) {
      console.error("Failed to list chat sessions:", response.status, response.statusText);
      return [];
    }

    const data: ListChatsResponse = await response.json();
    return data.success ? data.chats : [];
  } catch (error) {
    console.error("Error listing chat sessions:", error);
    return [];
  }
}

/**
 * Rename a chat session.
 */
export async function renameChatSession(sessionId: string, title: string): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl();

    const response = await fetch(`${baseUrl}/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });

    if (!response.ok) {
      console.error("Failed to rename chat:", response.status, response.statusText);
      return false;
    }

    const data: MutationResponse = await response.json();
    return !!data.success;
  } catch (error) {
    console.error("Error renaming chat:", error);
    return false;
  }
}

/**
 * Pin or unpin a chat session.
 */
export async function pinChatSession(sessionId: string, pinned: boolean): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl();

    const response = await fetch(`${baseUrl}/chat/sessions/${encodeURIComponent(sessionId)}/pin`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    });

    if (!response.ok) {
      console.error("Failed to pin chat:", response.status, response.statusText);
      return false;
    }

    const data: MutationResponse = await response.json();
    return !!data.success;
  } catch (error) {
    console.error("Error pinning chat:", error);
    return false;
  }
}

/**
 * Delete a chat session.
 */
export async function deleteChatSession(sessionId: string): Promise<boolean> {
  try {
    const baseUrl = await getBaseUrl();

    const response = await fetch(`${baseUrl}/chat/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      console.error("Failed to delete chat:", response.status, response.statusText);
      return false;
    }

    const data: MutationResponse = await response.json();
    return !!data.success;
  } catch (error) {
    console.error("Error deleting chat:", error);
    return false;
  }
}
