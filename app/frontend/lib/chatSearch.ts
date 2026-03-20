const OPEN_CHAT_SEARCH_EVENT = "memento:open-chat-search";

export function openChatSearchDialog(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_SEARCH_EVENT));
}

export function onOpenChatSearchDialog(callback: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handler = () => callback();
  window.addEventListener(OPEN_CHAT_SEARCH_EVENT, handler);
  return () => window.removeEventListener(OPEN_CHAT_SEARCH_EVENT, handler);
}
