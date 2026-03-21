"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, X, Sparkles } from "lucide-react";
import useUpdate from "@/hooks/useUpdate";
import { cn } from "@/lib/utils";

export default function UpdateNotification(): React.ReactElement | null {
  const {
    availableVersion,
    isApplyingUpdate,
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
        "flex items-center gap-3 px-4 py-3",
        "bg-gradient-to-r from-primary/10 via-primary/5 to-background",
        "border border-primary/20 rounded-lg shadow-lg",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium">Update Available</span>
          <span className="text-xs text-muted-foreground">
            Version {availableVersion} is ready to install
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => void applyUpdate()}
          disabled={isApplyingUpdate}
          className="gap-1.5"
        >
          {isApplyingUpdate ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Updating...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>Update Now</span>
            </>
          )}
        </Button>

        <Button
          size="icon-sm"
          variant="ghost"
          onClick={dismissUpdate}
          disabled={isApplyingUpdate}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Dismiss update notification"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
