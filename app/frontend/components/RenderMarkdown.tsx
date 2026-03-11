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
import { SourceBadge } from "./SourceBadge";
import { SourceRecord } from "./types";
import { resolveImageSrc } from "@/lib/imageSrc";

interface MarkdownProps {
  content: string;
  className?: string;
  components?: Components;
  isUser?: boolean;
  isStreaming?: boolean;
  messageId?: string;
  sourceMap: Map<string, SourceRecord>;
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
  // Handle citation formats:
  // Single: [[chunk_42]]
  // Multiple: [[chunk_1][chunk_2]]
  
  // Match anything between [[ and ]] 
  return text.replace(/\[\[([^\[\]]+(?:\]\[[^\[\]]+)*)\]\]/g, (match, content) => {
    // content will be like "chunk_374][chunk_421" or just "chunk_42"
    // Split by ][ to get individual IDs
    const ids = content
      .split("][")
      .map((id: string) => id.trim())
      .filter(Boolean);

    if (ids.length === 0) {
      return match;
    }

    return `[${ids.join(",")}](memory://${ids.join(",")})`;
  });
}

function getCitationSummary(chunkIds: string[], sourceMap: Map<string, SourceRecord>) {
  const uniqueChunkIds = Array.from(new Set(chunkIds));
  const mappedSources = uniqueChunkIds
    .map((chunkId) => ({ chunkId, source: sourceMap.get(chunkId) }))
    .filter((entry) => !!entry.source);

  const primary = mappedSources[0];
  const fallbackPrimaryId = uniqueChunkIds[0] ?? "";

  // Build sources array for navigation
  const sources = mappedSources.map((entry) => ({
    chunkId: entry.chunkId,
    title: entry.source?.windowTitle || "Unknown",
    appName: entry.source?.appName || "Unknown App",
    description:
      entry.source?.normalizedTextLayout?.normalized_text?.trim() ||
      entry.source?.textContent ||
      "",
    capturedAt: entry.source?.capturedAt || "",
  }));

  if (!primary) {
    const remainder = Math.max(0, uniqueChunkIds.length - 1);
    return {
      primaryChunkId: fallbackPrimaryId,
      label: remainder > 0 ? `Source +${remainder}` : "Source",
      title: "Source",
      appName: "Unknown App",
      capturedAt: "",
      description: uniqueChunkIds.join(", "),
      sources: [],
    };
  }

  const appName = primary.source?.appName?.trim() || "Source";
  const remainder = Math.max(0, uniqueChunkIds.length - 1);
  const label = remainder > 0 ? `${appName} +${remainder}` : appName;

  return {
    primaryChunkId: primary.chunkId,
    label,
    title: primary.source?.windowTitle || appName,
    appName,
    capturedAt: primary.source?.capturedAt || "",
    description:
      primary.source?.normalizedTextLayout?.normalized_text?.trim() ||
      primary.source?.textContent ||
      "",
    sources,
  };
}

function RenderMarkdownComponent({
  content,
  className,
  isUser,
  components,
  messageId,
  sourceMap,
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
        // MEMORY LINK
        if (href?.startsWith("memory://")) {
          const chunkIds = href
            .replace("memory://", "")
            .split(",")
            .map((id: string) => id.trim())
            .filter(Boolean);

          const citation = getCitationSummary(chunkIds, sourceMap);

          return (
            <span className="inline-flex flex-wrap items-center gap-1 align-middle">
              <SourceBadge
                id={citation.primaryChunkId}
                title={citation.title}
                appName={citation.appName}
                capturedAt={citation.capturedAt}
                description={citation.description}
                label={citation.label}
                sources={citation.sources}
                onClick={onMemoryClick}
              />
            </span>
          );
        }
        // NORMAL LINK
        return (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "font-medium text-primary underline underline-offset-4 decoration-primary/40",
              "transition-all hover:text-primary/80 hover:decoration-primary",
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

      img: ({ src, alt, className }: any) => {
        const resolvedSrc = resolveImageSrc(typeof src === "string" ? src : "");
        if (!resolvedSrc) return null;

        return (
          <img
            src={resolvedSrc}
            alt={alt ?? "Image"}
            loading="lazy"
            decoding="async"
            className={cn("h-auto max-w-full rounded-md border border-border", className)}
          />
        );
      },
    }),
    [components, onMemoryClick, sourceMap],
  );

  return (
    <div
      className={cn(
        "markdown wrap-break-word select-text",
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
