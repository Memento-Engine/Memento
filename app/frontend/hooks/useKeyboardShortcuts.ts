import { useEffect } from "react";

interface KeyboardShortcutProps {
  key: string;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  callback?: () => void;
}

export default function useKeyboardShortcuts({
  key,
  callback,
  shiftKey = false,
  ctrlKey = false,
}: KeyboardShortcutProps) {
  useEffect(() => {
    const handleKeyshortcuts = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === key.toLowerCase() &&
        e.ctrlKey === ctrlKey &&
        e.shiftKey === shiftKey
      ) {
        e.preventDefault();
        if (callback) {
          callback();
        }
      }
    };

    window.addEventListener("keydown", handleKeyshortcuts);
    return () => window.removeEventListener("keydown", handleKeyshortcuts);
  }, [key, ctrlKey, shiftKey, callback]);
}
