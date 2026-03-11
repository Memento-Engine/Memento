"use client";

import { Button } from "@/components/ui/button";
import { useMemo } from "react";
import { useAppIcon } from "@/hooks/useAppIcon";

interface SourceItem {
  chunkId: string;
  title?: string;
  appName?: string;
}

interface SourcesButtonProps {
  sourceList: SourceItem[];
  setReferenceMeta: (value: any) => void;
  setSourceList: (value: SourceItem[]) => void;
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
    const result: string[] = [];

    for (const s of sourceList) {
      if (!s.appName) continue;

      if (!seen.has(s.appName)) {
        seen.add(s.appName);
        result.push(s.appName);
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
          <SourceIcon key={app} appName={app} />
        ))}
      </div>

      <span>{originalCount} sources</span>
    </Button>
  );
}

function SourceIcon({ appName }: { appName?: string }) {
  const { src: iconSrc, loading } = useAppIcon(appName);

  if (loading || !iconSrc) {
    return (
      <div className="w-5 h-5 rounded-full border bg-muted" />
    );
  }

  return (
    <img
      src={iconSrc}
      alt={appName}
      className="w-5 h-5 rounded-full border bg-background"
    />
  );
}