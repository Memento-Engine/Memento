"use client";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Globe, ExternalLink, Clock } from "lucide-react";
import { renderDate } from "@/lib/utils";

interface WebCitationBadgeProps {
  id: number;
  title?: string;
  url?: string;
  snippet?: string;
  capturedAt?: string;
}

export function WebCitationBadge({
  id,
  title,
  url,
  snippet,
  capturedAt,
}: WebCitationBadgeProps) {
  let domain = "Web";
  try {
    if (url) {
      domain = new URL(url).hostname || domain;
    }
  } catch {
    // Keep default domain
  }

  return (
    <HoverCard openDelay={150}>
      <HoverCardTrigger asChild>
        <Badge
          variant="secondary"
          className="ml-1 cursor-default select-none inline-flex items-center gap-1.5 px-2 py-0.5"
        >
          <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium">{domain}</span>
        </Badge>
      </HoverCardTrigger>

      <HoverCardContent className="w-[340px] p-4 shadow-md" sideOffset={6}>
        <div className="flex flex-col gap-3.5">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-muted/50">
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
            <span className="truncate text-xs font-medium text-muted-foreground">
              {domain}
            </span>
          </div>

          {title && (
            <div className="text-sm font-medium leading-snug text-foreground">
              {title}
            </div>
          )}

          {snippet && (
            <div className="text-xs leading-relaxed text-muted-foreground">
              {snippet}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <div className="inline-flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {capturedAt ? renderDate(capturedAt) : "Unknown time"}
            </div>
            <div className="inline-flex items-center gap-1">
              <ExternalLink className="h-3 w-3" />
              web_{id}
            </div>
          </div>

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-primary underline underline-offset-4"
            >
              {url}
            </a>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
