"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { Link2Icon, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { cn, renderDate } from "@/lib/utils";
import {
  useAppIcon,
  PLACEHOLDER_ICON,
  normalizeAppName,
} from "@/hooks/useAppIcon";

interface SourceItem {
  chunkId: number;
  title?: string;
  appName?: string;
  description?: string;
  capturedAt?: string;
  browserUrl?: string;
}

interface SourceBadgeProps {
  id: number;
  title?: string;
  appName?: string;
  description?: string;
  capturedAt?: string;
  label?: string;
  sources?: SourceItem[];
  onClick?: (id: number) => void;
}

export function SourceBadge({
  id,
  title,
  appName,
  capturedAt,
  description,
  label,
  sources,
  onClick,
}: SourceBadgeProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const totalSources = sources?.length ?? 1;

  useEffect(() => {
    setCurrentIndex((prev) => {
      if (totalSources <= 0) return 0;
      return Math.min(prev, totalSources - 1);
    });
  }, [totalSources]);

  const currentSource = sources?.[currentIndex] ?? {
    chunkId: id,
    title,
    appName,
    description,
    capturedAt,
    browserUrl: "",
  };



  const normalizedAppName = normalizeAppName(currentSource.appName);
  let domain: string | null = null;
  try {
    domain = currentSource.browserUrl
      ? new URL(currentSource.browserUrl).hostname
      : null;
  } catch {
    domain = null;
  }

  const priorityName = domain ? domain : normalizedAppName || "Unnamed Application";

  const newLabel = sources && sources.length > 1 ? `${priorityName} +${sources.length - 1}` : priorityName;


  const { src: iconSrc, loading: iconLoading } = useAppIcon(
    currentSource.appName,
    currentSource.browserUrl,
  );

  const hasMultipleSources = totalSources > 1;

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + totalSources) % totalSources);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % totalSources);
  };

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          onClick={() => onClick?.(currentSource.chunkId)}
          className={cn(
            "ml-1 cursor-pointer select-none",
            "inline-flex items-center gap-1.5 px-2 py-0.5",
            "hover:bg-muted/80 transition-colors",
          )}
        >
          {iconLoading ? (
            <Link2Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
          ) : (
            <img
              src={iconSrc}
              alt=""
              className="h-3.5 w-3.5 shrink-0 rounded-[3px] object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = PLACEHOLDER_ICON;
              }}
            />
          )}
          <span className="font-medium">{newLabel ?? id}</span>
        </Badge>
      </HoverCardTrigger>

      <HoverCardContent className="w-[340px] p-4 shadow-md" sideOffset={6}>
        <div className="flex flex-col gap-3.5">
          {/* Header Row: App Info & Pagination */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                <img
                  src={iconLoading ? PLACEHOLDER_ICON : iconSrc}
                  alt={currentSource.appName ?? "App"}
                  className="h-4 w-4 object-contain"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      PLACEHOLDER_ICON;
                  }}
                />
              </div>
              <span className="truncate text-xs font-medium text-muted-foreground">
                {priorityName}
              </span>
            </div>

            {hasMultipleSources && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handlePrev}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Previous source"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-[28px] text-center text-[10px] font-medium text-muted-foreground">
                  {currentIndex + 1} / {totalSources}
                </span>
                <button
                  onClick={handleNext}
                  className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                  aria-label="Next source"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold leading-snug text-foreground">
              {currentSource.title ?? "Unknown Title"}
            </h4>
            <p className="text-xs leading-relaxed text-muted-foreground line-clamp-3">
              {currentSource.description?.trim() || "No preview available."}
            </p>
          </div>

          {/* Footer */}
          <div className="mt-1 flex justify-end border-t pt-2">
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80">
              <Clock className="h-3 w-3 relative top-[0.5px]" />
              <span className="leading-none">
                {currentSource.capturedAt
                  ? renderDate(currentSource.capturedAt)
                  : "Unknown date"}
              </span>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
