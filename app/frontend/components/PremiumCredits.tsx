"use client";

import { Sparkles, Zap, Crown } from "lucide-react";
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

export function PremiumCredits({ collapsed = false, className }: PremiumCreditsProps) {
  const { credits, tier, userRole, isLoading, hasPremiumCredits } = useCredits();

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2", className)}>
        <div className="h-4 w-4 animate-pulse rounded bg-muted" />
        {!collapsed && <div className="h-4 w-16 animate-pulse rounded bg-muted" />}
      </div>
    );
  }

  const creditDisplay = (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors",
        hasPremiumCredits
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-muted bg-muted/50",
        collapsed && "justify-center px-2",
        className
      )}
    >
      {hasPremiumCredits ? (
        <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
      ) : (
        <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
      
      {!collapsed && (
        <div className="flex flex-col gap-0.5 overflow-hidden">
          <div className="flex items-center gap-1">
            <span
              className={cn(
                "text-sm font-medium",
                hasPremiumCredits ? "text-amber-500" : "text-muted-foreground"
              )}
            >
              {credits.available}
            </span>
            <span className="text-xs text-muted-foreground">
              / {credits.total} credits
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground capitalize">
            {userRole === "logged" ? "Pro" : "Free"} tier
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
              {hasPremiumCredits ? (
                <Sparkles className="h-3 w-3 text-amber-500" />
              ) : (
                <Zap className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="font-medium">
                {credits.available} / {credits.total} Premium Credits
              </span>
            </div>
            <span className="text-xs text-muted-foreground capitalize">
              {userRole === "logged" ? "Logged in" : "Anonymous"} • {tier} tier
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
  const { credits, hasPremiumCredits, isLoading } = useCredits();

  if (isLoading) {
    return null;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              hasPremiumCredits
                ? "bg-amber-500/10 text-amber-500"
                : "bg-muted text-muted-foreground",
              className
            )}
          >
            {hasPremiumCredits ? (
              <Crown className="h-3 w-3" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            <span>{credits.available}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {credits.available} premium credit{credits.available !== 1 ? "s" : ""} remaining
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
