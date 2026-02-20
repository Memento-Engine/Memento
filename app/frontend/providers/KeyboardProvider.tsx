import useKeyboardShortcuts from "@/hooks/useKeyboardShortcuts";
import { PlatformShortcuts } from "@/lib/shortcuts/const";
import { ShortcutAction } from "@/lib/shortcuts/types";
import { redirect } from "next/navigation";

export default function KeyboardProvider() {
  const newChat = PlatformShortcuts[ShortcutAction.NEW_CHAT];
  const searchMemories = PlatformShortcuts[ShortcutAction.SEARCH_MEMORIES];

  // New Chat
  useKeyboardShortcuts({
    ...newChat,
    callback: (): void => {
      redirect("/");
    },
  });

  return null;
}
