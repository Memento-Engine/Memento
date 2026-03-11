"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { Link2Icon, ChevronUp, ChevronDown } from "lucide-react";
import { cn, renderDate } from "@/lib/utils";

interface SourceItem {
  chunkId: string;
  title?: string;
  appName?: string;
  description?: string;
  capturedAt?: string;
}

interface SourceBadgeProps {
  id: string;
  title?: string;
  appName?: string;
  description?: string;
  capturedAt?: string;
  label?: string;
  sources?: SourceItem[];
  onClick?: (id: string) => void;
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
  const hasMultipleSources = totalSources > 1;

  const currentSource = sources?.[currentIndex] ?? {
    chunkId: id,
    title,
    appName,
    description,
    capturedAt,
  };

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
            "inline-flex items-center gap-1",
            "hover:bg-muted transition-colors"
          )}
        >
          <Link2Icon className="h-3 w-3" />
          {label ?? id}
        </Badge>
      </HoverCardTrigger>

      <HoverCardContent className="w-[340px] p-4">
        <div className="flex gap-3">
          
          {/* Content */}
          <div className="flex-1 space-y-2">
            
            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {currentSource.appName ?? "Unknown App"}
              </span>

              {hasMultipleSources && (
                <span className="text-[10px] text-muted-foreground bg-muted px-2 py-[2px] rounded">
                  {currentIndex + 1} / {totalSources}
                </span>
              )}
            </div>

            {/* Title */}
            <p className="text-sm font-semibold leading-tight">
              {currentSource.title ?? "Unknown"}
            </p>

            {/* Description */}
            <p className="text-xs text-muted-foreground line-clamp-3">
              {currentSource.description?.trim() || "No preview available."}
            </p>

            {/* Footer */}
            <p className="text-[10px] text-muted-foreground">
              Captured:{" "}
              {currentSource.capturedAt
                ? renderDate(currentSource.capturedAt)
                : "Unknown"}
            </p>
          </div>

          {/* Navigation (Right Side) */}
          {hasMultipleSources && (
            <div className="flex flex-col items-center justify-center gap-1">
              <button
                onClick={handlePrev}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Previous source"
              >
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              </button>

              <button
                onClick={handleNext}
                className="p-1 rounded hover:bg-muted transition-colors"
                aria-label="Next source"
              >
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}