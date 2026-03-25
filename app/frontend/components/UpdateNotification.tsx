"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X, Sparkles } from "lucide-react";
import useUpdate from "@/hooks/useUpdate";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export default function UpdateNotification(): React.ReactElement | null {
  const { 
    availableVersion,
    isApplyingUpdate,
    updateProgress,
    applyUpdate,
    dismissUpdate,
    isDismissed,
  } = useUpdate();

//   Don't show if no update or dismissed
  if (!availableVersion || isDismissed) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50",
        "flex flex-col gap-3 px-4 py-3 min-w-[360px]",
        "bg-gradient-to-r from-primary/10 via-primary/5 to-background",
        "border border-primary/20 rounded-lg shadow-lg",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2.5 flex-1">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
            {isApplyingUpdate ? (
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium">
              {isApplyingUpdate ? "Installing Update" : "Update Available"}
            </span>
            <span className="text-xs text-muted-foreground">
              {isApplyingUpdate && updateProgress
                ? updateProgress.message
                : `Version ${availableVersion} is ready to install`}
            </span>
          </div>
        </div>

        {!isApplyingUpdate && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => void applyUpdate()}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Update Now</span>
            </Button>

            <Button
              size="icon-sm"
              variant="ghost"
              onClick={dismissUpdate}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Dismiss update notification"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Progress bar - only show during update */}
      {isApplyingUpdate && updateProgress && (
        <div className="flex flex-col gap-1.5">
          <Progress value={updateProgress.percent} className="h-2" />
          <div className="flex justify-between items-center text-xs text-muted-foreground">
            <span className="capitalize">{updateProgress.stage.replace(/-/g, ' ')}</span>
            <span>{updateProgress.percent}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
