import { Separator } from "@/components/ui/separator";
import { Button } from "../ui/button";
import useReferenceContext from "@/hooks/useReferenceContext";
import { convertFileSrc } from "@tauri-apps/api/core";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { X } from "lucide-react";

export default function RightSidebar() {
  const { setReferenceMeta } = useReferenceContext();

  const url = convertFileSrc(
    "C:/Users/pavan/Pictures/Screenshots/testOne.png"
  );

  return (
    <aside className="flex h-full w-full max-w-sm border-l bg-background flex-col">
      
      {/* HEADER */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Reference Details</h2>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setReferenceMeta(undefined)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* CONTENT */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">

          {/* IMAGE CARD */}
          <Card className="overflow-hidden">
            <AspectRatio ratio={16 / 9}>
              <img
                src={url}
                alt="Reference"
                className="h-full w-full object-cover"
              />
            </AspectRatio>
          </Card>

          <Separator />

          {/* META DATA */}
          <Card className="p-4  text-sm">
            <MetaRow label="App" value="Chrome" />
            <MetaRow label="Window" value="ChatGPT Docs" />
            <MetaRow label="Timestamp" value="10 Feb • 12:30 PM" />
            <MetaRow label="URL" value="example.com" />
          </Card>

        </div>
      </ScrollArea>
    </aside>
  );
}


function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
