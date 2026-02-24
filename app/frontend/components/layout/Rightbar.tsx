"use client";

import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import useReferenceContext from "@/hooks/useReferenceContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { X } from "lucide-react";
import { renderDate } from "@/lib/utils";

export default function RightSidebar() {
  const { setReferenceMeta, referenceMeta } = useReferenceContext();

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
      referenceMeta
        ? "w-full md:w-[30%] md:min-w-[280px] md:max-w-[360px] opacity-100"
        : "w-0 min-w-0 border-transparent opacity-0"
    }
  `}
    >
      <div className="flex h-full min-w-[280px] flex-col w-full overflow-hidden">
        {/* HEADER */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <h2 className="text-sm font-medium">Source Details</h2>

          <Button
            variant="ghost"
            size="icon"
            className="cursor-pointer shrink-0"
            onClick={() => setReferenceMeta(undefined)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 w-full overflow-y-scroll">
          {/* w-full and overflow-hidden here ensure Radix's viewport cannot expand */}
          <div className="space-y-4 p-4 w-full overflow-hidden">
            {/* IMAGE CARD */}
            <Card className="overflow-hidden p-0 w-full border-none shadow-sm">
              <AspectRatio ratio={16 / 9} className="relative w-full bg-muted">
                <img
                  src={"https://picsum.photos/600/600?3"}
                  alt="Reference"
                  className="absolute inset-0 w-full h-full object-cover rounded-md"
                />
              </AspectRatio>
            </Card>

            <Separator />

            {/* META DATA */}
            {/* Added w-full and overflow-hidden to force the card to stay within bounds */}
            <Card className="p-4 text-sm border-none shadow-sm w-full overflow-hidden">
              <div className="flex flex-col gap-4 w-full min-w-0">
                <p className="break-words text-muted-foreground leading-relaxed w-full">
                  Lorem ipsum dolor sit amet consectetur adipisicing elit.
                  Obcaecati, modi alias rem repellat fuga earum exercitationem.
                </p>

                <div className="flex flex-col gap-3 w-full min-w-0">
                  <MetaRow
                    label="App"
                    value={referenceMeta?.app_name ?? "Unknown"}
                  />

                  <Separator />

                  <MetaRow
                    label="Window"
                    value={referenceMeta?.window_title ?? "Unknown"}
                  />

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

                  <MetaRow
                    label="URL"
                    value={referenceMeta?.browser_url ?? "Unknown"}
                  />
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
export function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    // Changed items-center to items-start for better multi-line aesthetics
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
