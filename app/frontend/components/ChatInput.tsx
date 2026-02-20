import {
  ArrowUp,
  Plus,
  Globe,
  Brain,
  FileText,
  GraduationCap,
  Layers,
  Mail,
} from "lucide-react";
import { AutosizeTextarea } from "./ChatHome"; // Ensure this path is correct
import { Button } from "./ui/button";
import { useState } from "react";

export interface ChatInputProps {
  handleSend: (query: string) => void;
}

export default function ChatInput({
  handleSend,
}: ChatInputProps): React.ReactElement {
  const [query, setQuery] = useState<string>("");

  return (
    <div className="border rounded-xl">
      <div className="w-full p-2">
        <AutosizeTextarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Browse your memories..."
          className="text-base py-2 px-3 placeholder:text-slate-400 max-h-60 bg-transparent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();

              const message = query; // snapshot

              handleSend(message);
              setQuery("");
            }
          }}
        />

        <div className="flex items-center justify-between px-1 pt-2 pb-1">
          <div className="flex items-center gap-1">
            {/* Plus Button - File Upload */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 rounded-full hover:bg-slate-100"
            >
              <Plus size={18} />
            </Button>
          </div>

          {/* Send Button */}
          <Button
            onClick={(): void => {
              console.log("quer", query);
              handleSend(query);
            }}
            disabled={!query.trim()}
            size="icon"
            className="h-8 w-8 rounded-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-100 disabled:text-slate-400 transition-all"
          >
            <ArrowUp size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
