"use client";

import { Sparkles, Zap, Clock } from "lucide-react";
import useCredits from "@/hooks/useCredits";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PremiumCreditsProps {
  collapsed?: boolean;
  className?: string;
}

/**
 * Format milliseconds to human readable time (e.g., "6h 23m")
 */
function formatResetTime(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function PremiumCredits({ collapsed = false, className }: PremiumCreditsProps) {
  const { quota, tier, userRole, isLoading, hasQuotaRemaining } = useCredits();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        {!collapsed && <div className="h-4 w-16 animate-pulse rounded bg-muted" />}
      </div>
    );
  }

  // For anonymous users, show login prompt
  if (userRole === "anonymous" || !quota) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
          "border-muted bg-muted/50",
          collapsed && "justify-center px-2",
          className
        )}
      >
        <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
        {!collapsed && (
          <span className="text-xs text-muted-foreground">
            Sign in for daily quota
          </span>
        )}
      </div>
    );
  }

  const percentDisplay = Math.max(0, quota.percentRemaining);

  const creditDisplay = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
        hasQuotaRemaining
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-red-500/30 bg-red-500/10",
        collapsed && "justify-center px-2",
        className
      )}
    >
      {hasQuotaRemaining ? (
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <Clock className="h-4 w-4 shrink-0 text-red-500" />
      )}
      
      {!collapsed && (
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-sm font-medium",
                hasQuotaRemaining ? "text-amber-500" : "text-red-500"
              )}
            >
              {percentDisplay}%
            </span>
            <span className="text-xs text-muted-foreground">
              daily quota
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Resets in {formatResetTime(quota.resetInMs)}
          </span>
        </div>
      )}
    </div>
  );

  if (collapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{creditDisplay}</TooltipTrigger>
          <TooltipContent side="right" className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {hasQuotaRemaining ? (
                <Sparkles className="h-3 w-3 text-amber-500" />
              ) : (
                <Clock className="h-3 w-3 text-red-500" />
              )}
              <span className="font-medium">
                {percentDisplay}% daily quota remaining
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Resets in {formatResetTime(quota.resetInMs)}
            </span>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return creditDisplay;
}

// Compact badge version for showing in headers/footers
export function PremiumCreditsBadge({ className }: { className?: string }) {
  const { quota, hasQuotaRemaining, isLoading, userRole } = useCredits();

  if (isLoading || userRole === "anonymous" || !quota) {
    return null;
  }

  const percentDisplay = Math.max(0, quota.percentRemaining);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              hasQuotaRemaining
                ? "bg-amber-500/10 text-amber-500"
                : "bg-red-500/10 text-red-500",
              className
            )}
          >
            {hasQuotaRemaining ? (
              <Sparkles className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            <span>{percentDisplay}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {percentDisplay}% daily quota remaining
          </p>
          <p className="text-xs text-muted-foreground">
            Resets in {formatResetTime(quota.resetInMs)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
