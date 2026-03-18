"use client";

import React, { useState, useEffect } from "react";
import { Info, Globe, AppWindow, Plus, Trash2, ShieldX, Loader2, RefreshCw, Eye, EyeOff } from "lucide-react";
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
import { z } from "zod";
import { notify } from "@/lib/notify";
import {
  listMaskedItems,
  createMaskedItem,
  deleteMaskedItem,
  type MaskedItem,
  type MaskedItemType,
} from "@/api/privacy";

type AppType = "web" | "app";

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

        if (url.hostname === "localhost") return true;
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
  const [maskedItems, setMaskedItems] = useState<MaskedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [activeTab, setActiveTab] = useState<AppType>("web");
  const [isAdding, setIsAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Fetch masked items on mount
  useEffect(() => {
    fetchMaskedItems();
  }, []);

  const fetchMaskedItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listMaskedItems();
      setMaskedItems(response.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load masked items";
      setError(message);
      console.error("Failed to fetch masked items:", err);
    } finally {
      setLoading(false);
    }
  };

  const isValidSite = (input: string): boolean => {
    const parsed = validSiteSchema.safeParse(input);
    return parsed.success;
  };

  const handleAdd = async (type: AppType) => {
    if (!inputValue.trim()) return;

    if (type === "web" && !isValidSite(inputValue)) {
      notify.error("Invalid domain or URL. Please try again.");
      return;
    }

    try {
      setIsAdding(true);
      setError(null);
      await createMaskedItem({
        name: inputValue.trim(),
        item_type: type,
      });
      setInputValue("");
      notify.success(`${inputValue} was added to privacy masking.`);
      await fetchMaskedItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to add masked item";
      setError(message);
      notify.error(message);
      console.error("Failed to add masked item:", err);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemove = async (id: number, name: string) => {
    try {
      setDeleting(id);
      setError(null);
      await deleteMaskedItem(id);
      notify.success(`${name} was removed from privacy masking.`);
      await fetchMaskedItems();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove masked item";
      setError(message);
      notify.error(message);
      console.error("Failed to delete masked item:", err);
    } finally {
      setDeleting(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, type: AppType) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd(type);
    }
  };

  const websiteItems = maskedItems.filter((i) => i.item_type === "web");
  const appItems = maskedItems.filter((i) => i.item_type === "app");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Privacy & Security</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Exclude websites and applications from being captured and masked from your records.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchMaskedItems}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/20 p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <EyeOff className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Masked</p>
            <p className="text-2xl font-semibold">{maskedItems.length}</p>
          </div>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue/10 text-blue-600">
            <ShieldX className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Privacy Status</p>
            <p className="text-sm font-semibold">Protected</p>
          </div>
        </div>
      </div>

      {/* Masking Management */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-md">
            <ShieldX className="h-4 w-4" />
            Masking Rules
          </CardTitle>
          <CardDescription>
            Manage your privacy exclusion list for websites and applications.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AppType)} className="w-full">
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
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. github.com, personal-blog.net"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "web")}
                  disabled={isAdding}
                  className="bg-background"
                />
                <Button
                  onClick={() => handleAdd("web")}
                  disabled={isAdding || !inputValue.trim()}
                  className="gap-2 shrink-0"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
              <MaskedItemList
                items={websiteItems}
                onRemove={handleRemove}
                deleting={deleting}
                emptyMessage="No websites masked yet. Add one to get started."
                icon={<Globe className="h-4 w-4 text-blue-600" />}
                loading={loading}
              />
            </TabsContent>

            {/* Apps Tab */}
            <TabsContent value="app" className="space-y-4 mt-0">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. WhatsApp, slack.exe, Discord"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => handleKeyDown(e, "app")}
                  disabled={isAdding}
                  className="bg-background"
                />
                <Button
                  onClick={() => handleAdd("app")}
                  disabled={isAdding || !inputValue.trim()}
                  className="gap-2 shrink-0"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add
                </Button>
              </div>
              <MaskedItemList
                items={appItems}
                onRemove={handleRemove}
                deleting={deleting}
                emptyMessage="No applications masked yet. Add one to get started."
                icon={<AppWindow className="h-4 w-4 text-purple-600" />}
                loading={loading}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-600/20 bg-blue-50/50 dark:bg-blue-950/30 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">How it works</p>
            <p className="text-xs text-blue-800 dark:text-blue-200">
              When any of these websites or applications are in focus, all capturing and OCR is paused automatically. Your privacy is protected.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MaskedItemListProps {
  items: MaskedItem[];
  onRemove: (id: number, name: string) => void;
  deleting: number | null;
  emptyMessage: string;
  icon: React.ReactNode;
  loading: boolean;
}

function MaskedItemList({
  items,
  onRemove,
  deleting,
  emptyMessage,
  icon,
  loading,
}: MaskedItemListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center border border-dashed rounded-lg bg-muted/20">
        <div className="flex justify-center mb-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
              {icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onRemove(item.id, item.name)}
            disabled={deleting === item.id}
            className="h-8 w-8 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive focus:opacity-100 transition-all ml-2 shrink-0"
            aria-label="Remove item"
          >
            {deleting === item.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        </div>
      ))}
    </div>
  );
}
