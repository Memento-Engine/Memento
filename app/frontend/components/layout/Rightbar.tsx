"use client";

import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import useReferenceContext from "@/hooks/useReferenceContext";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ArrowLeft, X, Image as ImageIcon } from "lucide-react";
import { renderDate } from "@/lib/utils";
import { resolveImageSrc } from "@/lib/imageSrc";
import { SourceRecord } from "../types";
import { useAppIcon } from "@/hooks/useAppIcon";
import { AppIconDisplay } from "../StepThinking";

// Helper component for the app icon placeholder
function AppIconPlaceholder({ appName }: { appName?: string }) {
  const initial = appName ? appName.charAt(0).toUpperCase() : "?";
  return (
    <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-border/60 bg-gradient-to-br from-background to-muted text-[10px] font-semibold text-foreground shadow-sm">
      {initial}
    </div>
  );
}

export default function RightSidebar() {
  const { setReferenceMeta, referenceMeta, sourceList, setSourceList } =
    useReferenceContext();
  const hasList = sourceList.length > 0;
  const isOpen = hasList || !!referenceMeta;

  const toReferenceMeta = (source: SourceRecord) => ({
    app_name: source.appName,
    browser_url: source.browserUrl,
    captured_at: source.capturedAt,
    chunk_id: source.chunkId,
    image_path: source.imagePath,
    text_content:
      source.normalizedTextLayout?.normalized_text ?? source.textContent,
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
        border-l border-border/50
        bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60
        /* Smooth out the cubic-bezier for a more "app-like" feel */
        transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]
        overflow-hidden
        ${
          isOpen
            ? "w-full md:w-[30%] md:min-w-[300px] md:max-w-[380px] opacity-100"
            : "w-0 min-w-0 border-transparent opacity-0"
        }
      `}
    >
      <div className="flex h-full min-w-[300px] flex-col w-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-border/40">
          <div className="flex items-center gap-2">
            {!showList && hasList && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 -ml-2 text-muted-foreground hover:text-foreground"
                onClick={() => setReferenceMeta(undefined)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              {showList ? `Sources (${sourceList.length})` : "Source Details"}
            </h2>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 -mr-2 text-muted-foreground hover:text-foreground shrink-0"
            onClick={closeSidebar}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 w-full overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="space-y-5 p-4 w-full">
            {/* List View */}
            {showList && (
              <div className="space-y-2.5">
                {sourceList.map((source) => (
                  <button
                    key={source.chunkId}
                    className="group flex w-full items-start gap-3 rounded-xl border border-border/40 bg-card/50 p-3 text-left transition-all hover:bg-muted/50 hover:shadow-sm"
                    onClick={() => setReferenceMeta(toReferenceMeta(source))}
                  >
                    {/* Thumbnail Thumbnail */}
                    <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-muted/30">
                      {source.imagePath ? (
                        <img
                          src={resolveImageSrc(source.imagePath)}
                          alt={source.windowTitle || source.appName}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        // <ImageIcon className="h-5 w-5 text-muted-foreground/30" />
                        <AppIconDisplay
                          appName={source.appName}
                          browserUrl={source.browserUrl}
                        />
                      )}
                    </div>

                    {/* Meta Data */}
                    <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5 space-y-1">
                      <div className="flex items-center gap-2">
                        <AppIconDisplay
                          appName={source.appName}
                          browserUrl={source.browserUrl}
                        />
                        <p className="truncate text-sm font-medium text-foreground">
                          {source.appName || "Unknown App"}
                        </p>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {source.windowTitle || "Unknown Window"}
                      </p>
                      <p className="text-[10px] font-medium text-muted-foreground/60">
                        {source.capturedAt
                          ? renderDate(source.capturedAt)
                          : "Unknown time"}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Detail View */}
            {!showList && referenceMeta && (
              <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                {/* Image Preview */}
                <Card className="overflow-hidden p-0 w-full border-border/50 shadow-sm">
                  <AspectRatio
                    ratio={16 / 9}
                    className="relative w-full bg-muted/50"
                  >
                    {referenceMeta.image_path ? (
                      <img
                        src={resolveImageSrc(referenceMeta.image_path)}
                        alt="Reference"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-muted-foreground/20" />
                      </div>
                    )}
                  </AspectRatio>
                </Card>

                {/* Extracted Text */}
                <Card className="p-4 border-border/50 shadow-sm w-full overflow-hidden">
                  <p className="break-words text-sm text-foreground/90 leading-relaxed w-full">
                    {referenceMeta?.text_content || (
                      <span className="italic text-muted-foreground">
                        No text content available.
                      </span>
                    )}
                  </p>
                </Card>

                {/* Metadata Properties */}
                <Card className="p-1 border-border/50 shadow-sm w-full overflow-hidden">
                  <div className="flex flex-col w-full min-w-0 divide-y divide-border/40 text-sm">
                    <MetaRow
                      label="App"
                      value={referenceMeta?.app_name ?? "Unknown"}
                      icon={
                        <AppIconDisplay
                          appName={referenceMeta?.app_name ?? "Unknown"}
                          browserUrl={referenceMeta?.browser_url ?? undefined}
                        />
                      }
                    />
                    <MetaRow
                      label="Window"
                      value={referenceMeta?.window_title ?? "Unknown"}
                    />
                    <MetaRow
                      label="Timestamp"
                      value={
                        referenceMeta?.captured_at
                          ? renderDate(referenceMeta.captured_at)
                          : "Unknown"
                      }
                    />

                    <MetaRow
                      label="URL"
                      value={referenceMeta?.browser_url ?? "Unknown"}
                    />
                  </div>
                </Card>

                {/* Layout JSON (Debugging/Advanced) */}
                {referenceMeta?.normalized_text_layout && (
                  <Card className="p-3 border-border/50 shadow-sm">
                    <p className="text-xs font-semibold text-foreground mb-2">
                      Layout JSON
                    </p>
                    <pre className="max-h-40 overflow-auto rounded-md border border-border/50 bg-muted/30 p-3 text-[11px] text-muted-foreground custom-scrollbar">
                      {JSON.stringify(
                        referenceMeta.normalized_text_layout,
                        null,
                        2,
                      )}
                    </pre>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Upgraded MetaRow to optionally take an icon
export function MetaRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 w-full p-3 hover:bg-muted/30 transition-colors">
      <span className="text-muted-foreground text-xs shrink-0 font-medium pt-0.5">
        {label}
      </span>
      <div className="flex items-start gap-2 text-right justify-end min-w-0">
        {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
        <span className="text-xs break-words leading-relaxed text-foreground font-medium">
          {value}
        </span>
      </div>
    </div>
  );
}
