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
  id: string;
  title?: string;
  appName?: string;
  description?: string;
  capturedAt?: string;
  label?: string;
  onClick?: (id: string) => void;
}

export function SourceBadge({
  id,
  title,
  appName,
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
          {label ?? id}
        </Badge>
      </HoverCardTrigger>

      <HoverCardContent className="w-[320px] p-4 space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{appName ?? "Unknown App"}</span>
        </div>

        <p className="text-sm font-semibold leading-tight">
          {title ?? "Unknown"}
        </p>

        <p className="text-xs text-muted-foreground line-clamp-3">
          {description?.trim() || "No preview available."}
        </p>

        <p className="text-[10px] text-muted-foreground">
          Captured: {capturedAt ? renderDate(capturedAt) : "Unknown"}
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
