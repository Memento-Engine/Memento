import { useEffect, useState } from "react";

type Sequence = {
  base: string;   // common prefix
  endings: string[]; // different endings
};

export function useTypewriter(sequence: Sequence) {

  const [text, setText] = useState("");
  const [endingIndex, setEndingIndex] = useState(0);

  const [phase, setPhase] = useState<
    "typingFull" | "deletingToBase" | "typingEnding"
  >("typingFull");

  const fullText = sequence.base + sequence.endings[endingIndex];

  useEffect(() => {

    let speed = 70;

    const timeout = setTimeout(() => {

      // ✅ PHASE 1 — type full sentence
      if (phase === "typingFull") {

        setText(fullText.slice(0, text.length + 1));

        if (text === fullText) {
          setTimeout(() => setPhase("deletingToBase"), 1200);
        }
      }

      // ✅ PHASE 2 — delete back to base word
      else if (phase === "deletingToBase") {

        setText(text.slice(0, -1));

        if (text === sequence.base) {
          const next = (endingIndex + 1) % sequence.endings.length;
          setEndingIndex(next);
          setPhase("typingEnding");
        }
      }

      // ✅ PHASE 3 — type new ending
      else if (phase === "typingEnding") {

        const newFull = sequence.base + sequence.endings[endingIndex];

        setText(newFull.slice(0, text.length + 1));

        if (text === newFull) {
          setTimeout(() => setPhase("deletingToBase"), 1200);
        }
      }

    }, speed);

    return () => clearTimeout(timeout);

  }, [text, phase, endingIndex]);

  return text;
}