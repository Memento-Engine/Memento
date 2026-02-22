"use client";

import { Separator } from "@/components/ui/separator";
import { Button } from "../ui/button";
import useReferenceContext from "@/hooks/useReferenceContext";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { X } from "lucide-react";
import { renderDate } from "@/lib/utils";

export default function RightSidebar() {
  const { setReferenceMeta, referenceMeta } = useReferenceContext();

  console.log("Reference Meta data", referenceMeta);

  // let raw_image: string = "C:\Users\pavan\.personal-ai\memories\9684540673322925080_20260219_074436.png";
  // let image_url = convertFileSrc(raw_image);
  return (
    <aside
      className={`flex h-full ${referenceMeta ? "w-full" : "w-0"}  max-w-sm border-l  rounded-l-xl bg-background flex-col`}
    >
      {/* HEADER */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-md font-medium">Source Details</h2>

        <Button
          variant="ghost"
          size="icon"
          className="cursor-pointer"
          onClick={() => setReferenceMeta(undefined)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* CONTENT */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {/* IMAGE CARD */}
          <Card className="overflow-hidden p-0">
            <AspectRatio ratio={16 / 9} className="relative">
              <img
                src={"https://picsum.photos/600/600?3"}
                alt="Reference"
                className="absolute inset-0 w-full h-full object-cover"
              />
            </AspectRatio>
          </Card>

          <Separator />

          {/* META DATA */}
          <Card className="p-4  text-sm border-none ">
            <div className="flex flex-col gap-4">
              <p>
                Lorem ipsum dolor sit amet consectetur adipisicing elit.
                Obcaecati, modi alias rem repellat fuga earum exercitationem est
                ullam deserunt expedita, totam provident reprehenderit error,
                numquam repudiandae? Esse cupiditate sed hic.
              </p>
              <div className="flex flex-col gap-2">
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
      </ScrollArea>
    </aside>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between space-y-1 justify-between">
      <span className="text-muted-foreground text-xs truncate">{label}</span>
      <span className="font-medium text-xs truncate">{value}</span>
    </div>
  );
}
