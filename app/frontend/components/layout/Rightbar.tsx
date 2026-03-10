"use client";

import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import useReferenceContext from "@/hooks/useReferenceContext";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ArrowLeft, X } from "lucide-react";
import { renderDate } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/imageSrc";
import { SourceRecord } from "../types";

export default function RightSidebar() {
  const { setReferenceMeta, referenceMeta, sourceList, setSourceList } = useReferenceContext();
  const hasList = sourceList.length > 0;
  const isOpen = hasList || !!referenceMeta;

  const toReferenceMeta = (source: SourceRecord) => ({
    app_name: source.appName,
    browser_url: source.browserUrl,
    captured_at: source.capturedAt,
    chunk_id: source.chunkId,
    image_path: source.imagePath,
    text_content: source.normalizedTextLayout?.normalized_text ?? source.textContent,
    text_json: source.textJson ?? undefined,
    normalized_text_layout: source.normalizedTextLayout ?? undefined,
    window_height: source.windowHeight ?? 0,
    window_title: source.windowTitle,
    window_width: source.windowWidth ?? 0,
    window_x: source.windowX ?? 0,
    window_y: source.windowY ?? 0,
  });

  const closeSidebar = () => {
    setReferenceMeta(undefined);
    setSourceList([]);
  };

  const showList = hasList && !referenceMeta;

  return (
    <div
      className={`
    relative
    flex-shrink-0
    border-l
    bg-background
    /* Smooth out the cubic-bezier for a more "app-like" feel */
    transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
    overflow-hidden
    ${
      isOpen
        ? "w-full md:w-[30%] md:min-w-[280px] md:max-w-[360px] opacity-100"
        : "w-0 min-w-0 border-transparent opacity-0"
    }
  `}
    >
      <div className="flex h-full min-w-[280px] flex-col w-full overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {!showList && hasList && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setReferenceMeta(undefined)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h2 className="text-sm font-medium">
              {showList ? `Sources (${sourceList.length})` : "Source Details"}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer shrink-0"
            onClick={closeSidebar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 w-full overflow-y-scroll">
          <div className="space-y-4 p-4 w-full overflow-hidden">
            {showList && (
              <div className="space-y-2">
                {sourceList.map((source) => (
                  <button
                    key={source.chunkId}
                    className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                    onClick={() => setReferenceMeta(toReferenceMeta(source))}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-16 overflow-hidden rounded border border-border bg-muted">
                        {source.imagePath ? (
                          <img
                            src={resolveImageSrc(source.imagePath)}
                            alt={source.windowTitle || source.appName}
                            className="h-full w-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {source.appName || "Unknown App"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {source.windowTitle || "Unknown Window"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {source.capturedAt ? renderDate(source.capturedAt) : "Unknown"}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!showList && referenceMeta && (
              <>
                <Card className="overflow-hidden p-0 w-full border-none shadow-sm">
                  <AspectRatio ratio={16 / 9} className="relative w-full bg-muted">
                    <img
                      src={resolveImageSrc(referenceMeta.image_path)}
                      alt="Reference"
                      className="absolute inset-0 w-full h-full object-cover rounded-md"
                    />
                  </AspectRatio>
                </Card>

                <Separator />

                <Card className="p-4 text-sm border-none shadow-sm w-full overflow-hidden">
                  <div className="flex flex-col gap-4 w-full min-w-0">
                    <p className="break-words text-muted-foreground leading-relaxed w-full line-clamp-4">
                      {referenceMeta?.text_content || "No text preview available."}
                    </p>

                    <div className="flex flex-col gap-3 w-full min-w-0">
                      <MetaRow label="Chunk" value={referenceMeta?.chunk_id ?? "Unknown"} />
                      <Separator />
                      <MetaRow label="App" value={referenceMeta?.app_name ?? "Unknown"} />
                      <Separator />
                      <MetaRow label="Window" value={referenceMeta?.window_title ?? "Unknown"} />
                      <Separator />
                      <MetaRow
                        label="Timestamp"
                        value={
                          referenceMeta?.captured_at
                            ? renderDate(referenceMeta.captured_at)
                            : "Unknown"
                        }
                      />
                      <Separator />
                      <MetaRow label="URL" value={referenceMeta?.browser_url ?? "Unknown"} />
                    </div>
                  </div>
                </Card>

                {referenceMeta?.normalized_text_layout && (
                  <Card className="p-3 border-none shadow-sm">
                    <p className="text-xs font-medium text-foreground mb-2">Layout JSON</p>
                    <pre className="max-h-48 overflow-auto rounded-md border border-border bg-muted p-2 text-[11px] text-muted-foreground">
                      {JSON.stringify(referenceMeta.normalized_text_layout, null, 2)}
                    </pre>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export function MetaRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-start gap-4 w-full">
      <span className="text-muted-foreground text-xs shrink-0 font-medium">
        {label}
      </span>
      <span
        className="text-xs text-right break-words leading-relaxed text-foreground"
      >
       {value}
      </span>
    </div>
  );
}
