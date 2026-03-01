import React, { useState } from "react";
import { Info, Globe, AppWindow, Plus, Trash2, ShieldX } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatError, z } from "zod";
import { notify } from "@/lib/notify";

type AppType = "web" | "app";

interface PrivacySites {
  id: string;
  name: string;
  type: AppType;
}

export const validSiteSchema = z
  .string()
  .trim()
  .refine(
    (value) => {
      try {
        const url = new URL(
          value.startsWith("http://") || value.startsWith("https://")
            ? value
            : `http://${value}`,
        );

        // allow localhost
        if (url.hostname === "localhost") return true;

        // allow normal domains
        const domainRegex = /^(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}$/;

        return domainRegex.test(url.hostname);
      } catch {
        return false;
      }
    },
    {
      message: "Invalid domain or URL",
    },
  );

export default function PrivacySettings(): React.ReactElement {
  // Unified state for both web and app exclusions
  const [maskedItems, setMaskedItems] = useState<PrivacySites[]>([
    { id: "1", name: "facebook.com", type: "web" },
    { id: "2", name: "banking-app.exe", type: "app" },
  ]);
  const [inputValue, setInputValue] = useState("");

  const isValidSite = (
    input: string,
  ): { isValid: boolean; errors: Record<string, string> } => {
    const parsedSchema = validSiteSchema.safeParse(input);

    if (!parsedSchema.success) {
      const formattedErrors = formatError(parsedSchema.error);
      return {
        isValid: false,
        errors: formattedErrors,
      };
    }

    return {
      isValid: true,
      errors: {},
    };
  };

  const handleAdd = (type: "web" | "app") => {
    if (!inputValue.trim()) return;

    switch (type) {
      case "web": {
        let { isValid, errors } = isValidSite(inputValue);
        if (!isValid) {
          notify.error("Invalid Site. Please use valid site names");
          return;
        }
      }
      case "app": {
        break;
      }

      default:
        notify.error("Invalid Type");
    }

    const newItem = {
      id: Date.now().toString(),
      name: inputValue.trim(),
      type,
    };

    setMaskedItems([...maskedItems, newItem]);
    setInputValue("");

    notify.success(`${inputValue} was added successfully.`);
  };

  const handleRemove = (id: string) => {
    // In a real app, you might trigger a "toast" here with an Undo action
    setMaskedItems(maskedItems.filter((item) => item.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent, type: "web" | "app") => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd(type);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Section Header */}
      <div>
        <h3 className="text-lg font-medium tracking-tight">
          Privacy & Security
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Control what data is captured and set up exclusion rules.
        </p>
      </div>

      {/* Masking Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-md">
                <ShieldX className="h-4 w-4" />
                Capture Masking
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground/70 hover:text-primary cursor-help transition-colors" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs" side="right">
                      Screenshots and OCR data will be completely paused when
                      any of these domains or applications are in focus.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </CardTitle>
              <CardDescription className={cn("text-sm")}>
                Add specific websites or desktop applications to hide them from
                tracking.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="web" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="web" className="flex gap-2">
                <Globe className="h-4 w-4" />
                Websites
              </TabsTrigger>
              <TabsTrigger value="app" className="flex gap-2">
                <AppWindow className="h-4 w-4" />
                Applications
              </TabsTrigger>
            </TabsList>

            {/* Websites Tab */}
            <TabsContent value="web" className="space-y-4 mt-0">
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. twitter.com, personal-blog.net"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "web")}
                  className="bg-background"
                />
                <Button
                  onClick={() => handleAdd("web")}
                  className="gap-2 shrink-0"
                >
                  <Plus className="h-4 w-4" /> Add Site
                </Button>
              </div>
              <ItemList
                items={maskedItems.filter((i) => i.type === "web")}
                onRemove={handleRemove}
                emptyMessage="No websites masked yet."
                icon={<Globe className="h-4 w-4 text-muted-foreground" />}
              />
            </TabsContent>

            {/* Apps Tab */}
            <TabsContent value="app" className="space-y-4 mt-0">
              <div className="flex gap-3">
                <Input
                  placeholder="e.g. WhatsApp, slack.exe"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "app")}
                  className="bg-background"
                />
                <Button
                  onClick={() => handleAdd("app")}
                  className="gap-2 shrink-0"
                >
                  <Plus className="h-4 w-4" /> Add App
                </Button>
              </div>
              <ItemList
                items={maskedItems.filter((i) => i.type === "app")}
                onRemove={handleRemove}
                emptyMessage="No applications masked yet."
                icon={<AppWindow className="h-4 w-4 text-muted-foreground" />}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface ItemsList {
  items: PrivacySites[];
  onRemove: (id: string) => void;
  emptyMessage: string;
  icon: React.ReactNode;
}

// Sub-component for rendering the list to keep code clean
function ItemList({ items, onRemove, emptyMessage, icon }: ItemsList) {
  if (items.length === 0) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground bg-muted/30 rounded-lg border border-dashed mt-4">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="mt-4 border rounded-lg overflow-hidden divide-y">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-3 bg-background hover:bg-muted/30 transition-colors group"
        >
          <div className="flex items-center gap-3">
            {icon}
            <span className="text-sm font-medium">{item.name}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100 transition-all"
            onClick={() => onRemove(item.id)}
            aria-label="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}
