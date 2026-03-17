"use client";

import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useAppIcon } from "@/hooks/useAppIcon";
import { SourceRecord } from "./types";
import { BowArrow } from "lucide-react";

interface SourcesButtonProps {
  sourceList: SourceRecord[];
  setReferenceMeta: (value: any) => void;
  setSourceList: (value: SourceRecord[]) => void;
}

export default function SourcesButton({
  sourceList,
  setReferenceMeta,
  setSourceList,
}: SourcesButtonProps) {
  const originalCount = sourceList.length;

  // remove duplicate app names
  const uniqueApps = useMemo(() => {
    const seen = new Set<string>();
    const result: { appName: string; browserUrl?: string }[] = [];

    for (const s of sourceList) {
      if (!s.appName) continue;

      const key = s.appName.toLowerCase() + (s.browserUrl?.toLowerCase() ?? "");

      if (!seen.has(key)) {
        seen.add(key);
        result.push({
          appName: s.appName,
          browserUrl: s.browserUrl,
        });
      }
    }

    return result.slice(0, 3); // show max 3 icons
  }, [sourceList]);

  if (sourceList.length === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs cursor-pointer flex items-center gap-2"
      onClick={() => {
        setReferenceMeta(undefined);
        setSourceList(sourceList);
      }}
    >
      <div className="flex -space-x-2">
        {uniqueApps.map((app) => (
          <SourceIcon
            key={app.appName + app.browserUrl}
            appName={app.appName}
            browserUrl={app.browserUrl}
          />
        ))}
      </div>

      <span>{originalCount} sources</span>
    </Button>
  );
}

function SourceIcon({ appName, browserUrl }: { appName?: string; browserUrl?: string }) {
  const { src: iconSrc, loading } = useAppIcon(appName, browserUrl);

  if (loading || !iconSrc) {
    return <div className="w-5 h-5 rounded-full border bg-muted" />;
  }

  return (
    <img
      src={iconSrc}
      alt={appName}
      className="w-5 h-5 rounded-full border bg-background"
    />
  );
}
