import { Components } from "react-markdown";
import { memo, useMemo } from "react";
import { cn, disableIndentedCodeBlockPlugin } from "@/lib/utils";

import { defaultRehypePlugins, Streamdown } from "streamdown";
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

import { MermaidError } from "@/components/MermaidError";
import { Button } from "./ui/button";
import { Link2Icon } from "lucide-react";
import { SourceBadge } from "./SourceBadge";
import { normalize } from "path";
import { Citation } from "./types";

interface MarkdownProps {
  content: string;
  className?: string;
  components?: Components;
  isUser?: boolean;
  isStreaming?: boolean;
  messageId?: string;
  citationMap: Map<number, Citation>;
}

// =============================
// CACHE
// =============================

const latexCache = new Map<string, string>();

// =============================
// LATEX NORMALIZER
// =============================

const normalizeLatex = (input: string): string => {
  if (latexCache.has(input)) {
    return latexCache.get(input)!;
  }

  const segments = input.split(/(```[\s\S]*?```|`[^`]*`|<[^>]+>)/g);

  const result = segments
    .map((segment) => {
      if (!segment) return "";

      if (/^```[\s\S]*```$/.test(segment)) return segment;
      if (/^`[^`]*`$/.test(segment)) return segment;
      if (/^<[^>]+>$/.test(segment)) return segment;

      let s = segment;

      s = s.replace(
        /(^|\n)\\\[\s*\n([\s\S]*?)\n\s*\\\](?=\n|$)/g,
        (_, pre, inner) => `${pre}$$\n${inner.trim()}\n$$`,
      );

      s = s.replace(
        /(^|[^$\\])\\\((.+?)\\\)(?=[^$\\]|$)/g,
        (_, pre, inner) => `${pre}$${inner.trim()}$`,
      );

      s = s.replace(/\$(\d+)/g, (_, num) => "\\$" + num);

      return s;
    })
    .join("");

  if (latexCache.size > 100) {
    const firstKey = latexCache.keys().next().value || "";
    latexCache.delete(firstKey);
  }

  latexCache.set(input, result);
  return result;
};

// =============================
// COMPONENT
// =============================

function preprocessCitations(text: string) {
  return text.replace(/\[\[(.*?)\]\]/g, (match) => {
    const ids = [...match.matchAll(/\[(\d+)\]/g)].map((m) => m[1]).join(",");

    return `[${ids}](memory://${ids})`;
  });
}

function RenderMarkdownComponent({
  content,
  className,
  isUser,
  components,
  messageId,
  citationMap,
  onMemoryClick,
}: MarkdownProps & { onMemoryClick?: (id: string) => void }) {
  // preprocess content
  const processedContent = useMemo(() => {
    const normalized = normalizeLatex(content);
    return preprocessCitations(normalized);
  }, [content]);

  const mergedComponents = useMemo(
    () => ({
      ...components,

      a: ({ href, children, className }: any) => {
        const text = String(children);

        // MEMORY LINK
        if (href?.startsWith("memory://")) {
          const chunkId = href.replace("memory://", "");
          console.log("ChunkId", chunkId);
          console.log("typeof ChunkId", typeof chunkId);
          const parsedIntChunkId = Number(chunkId);
          return (
            <SourceBadge
              title={citationMap.get(parsedIntChunkId)?.windowName ?? ""}
              capturedAt={citationMap.get(parsedIntChunkId)?.capturedAt ?? ""}
              id={parsedIntChunkId}
            />
          );
        }
        // NORMAL LINK
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "font-medium text-blue-600 underline underline-offset-4 decoration-blue-300/50",
              "hover:decoration-blue-600 hover:text-blue-800 transition-all",
              className,
            )}
          >
            {children}
          </a>
        );
      },

      ul: ({ children, className }: any) => (
        <ul className={cn("list-disc pl-6", className)}>{children}</ul>
      ),

      ol: ({ children, className }: any) => (
        <ol className={cn("list-decimal pl-6", className)}>{children}</ol>
      ),
    }),
    [components, onMemoryClick],
  );

  return (
    <div
      className={cn(
        "markdown wrap-break-word text-sm select-text",
        isUser && "is-user",
        className,
      )}
    >
      <Streamdown
        animated
        linkSafety={{ enabled: false }}
        className="size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
        remarkPlugins={[remarkGfm, remarkMath, disableIndentedCodeBlockPlugin]}
        rehypePlugins={[rehypeKatex, defaultRehypePlugins.harden]}
        components={mergedComponents}
        plugins={{ code, mermaid, cjk }}
        controls={{ mermaid: { fullscreen: false } }}
        mermaid={
          messageId
            ? {
                errorComponent: (props) => (
                  <MermaidError messageId={messageId} {...props} />
                ),
              }
            : {}
        }
      >
        {processedContent}
      </Streamdown>
    </div>
  );
}

export const RenderMarkdown = memo(
  RenderMarkdownComponent,
  (prevProps, nextProps) => prevProps.content === nextProps.content,
);
