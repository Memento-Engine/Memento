"use client";

import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link2Icon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceBadgeProps {
  id: string;
  label?: string;
  onClick?: (id: string) => void;
}

export function SourceBadge({
  id,
  label,
  onClick,
}: SourceBadgeProps) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            onClick={() => onClick?.(id)}
            className={cn(
              "ml-1 cursor-pointer select-none",
              "inline-flex items-center gap-1",
              "hover:bg-muted transition-colors"
            )}
          >
            <Link2Icon className="h-3 w-3" />
            {label ?? `source +1`}
          </Badge>
        </TooltipTrigger>

        <TooltipContent side="top">
          <p className="text-xs">Open source: {id}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}