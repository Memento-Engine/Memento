"use client";

import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import useChatContext from "@/hooks/useChatContext";
import { openChatSearchDialog } from "@/lib/chatSearch";
import { PlatformShortcuts } from "@/lib/shortcuts/const";
import { ShortcutAction } from "@/lib/shortcuts/types";
import { useRouter } from "next/navigation";

export default function KeyboardProvider() {
  const newChat = PlatformShortcuts[ShortcutAction.NEW_CHAT];
  const searchMemories = PlatformShortcuts[ShortcutAction.SEARCH_MEMORIES];
  const { startNewChat } = useChatContext();
  const router = useRouter();

  // New Chat
  useKeyboardShortcuts({
    ...newChat,
    callback: (): void => {
      startNewChat();
      router.push("/", { scroll: false });
    },
  });

  // Search Memories
  useKeyboardShortcuts({
    ...searchMemories,
    callback: (): void => {
      openChatSearchDialog();
    },
  });

  return null;
}
