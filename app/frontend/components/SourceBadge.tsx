"use client";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import { Link2Icon } from "lucide-react";
import { cn, renderDate } from "@/lib/utils";

interface SourceBadgeProps {
  id: number;
  title?: string;
  description?: string;
  capturedAt?: string;
  label?: string;
  onClick?: (id: number) => void;
}

export function SourceBadge({
  id,
  title,
  capturedAt,
  description,
  label,
  onClick,
}: SourceBadgeProps) {
  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          onClick={() => onClick?.(id)}
          className={cn(
            "ml-1 cursor-pointer select-none",
            "inline-flex items-center gap-1",
            "hover:bg-muted transition-colors",
          )}
        >
          <Link2Icon className="h-3 w-3" />
          {label ?? "wikipedia"}
        </Badge>
      </HoverCardTrigger>

      <HoverCardContent className="w-[320px] p-4 space-y-2">
        {/* Header (logo + site) */}
        <div className="flex items-center gap-2">
          <img
            src="https://www.google.com/chrome/static/images/chrome-logo.svg"
            alt="chrome"
            className="w-4 h-4"
          />
          <span className="text-xs text-muted-foreground">chrome.com</span>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold leading-tight">
          {title ?? "Unknown"}
        </p>

        {/* Description */}
        <p className="text-xs text-muted-foreground line-clamp-3">
          Microservices architecture is an approach to developing a single
          application as a suite of small services, each running in its own
          process and communicating with lightweight mechanisms.
        </p>

        {/* Captured date */}
        <p className="text-[10px] text-muted-foreground">
          Captured: {capturedAt ? renderDate(capturedAt) : "Unknown"}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
