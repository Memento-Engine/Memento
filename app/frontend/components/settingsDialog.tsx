"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Cpu, Database, HatGlasses, Palette, UserPen } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import useAuth from "@/hooks/useAuth";

export enum SettingsTabs {
  Profile,
  Appearance,
  DataAndStorage,
  Privacy,
  BackgroundService,
}

const settingsTabs = [
  { id: SettingsTabs.Profile, label: "Profile", icon: <UserPen /> },
  {
    id: SettingsTabs.Appearance,
    label: "Appearance",
    icon: <Palette />,
  },
  {
    id: SettingsTabs.DataAndStorage,
    label: "Data & Storage",
    icon: <Database />,
  },
  { id: SettingsTabs.Privacy, label: "Privacy", icon: <HatGlasses /> },
  {
    id: SettingsTabs.BackgroundService,
    label: "Background Service",
    icon: <Cpu />,
  },
];
import { Input } from "@/components/ui/input";

function ProfileTab(): React.ReactElement {
  const { user, logout, isLoading } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Get user initials for fallback avatar
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Profile</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your personal information and display preferences.
          </p>
        </div>

        <div className="rounded-xl border border-dashed p-8 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            You are not logged in.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Sign in to your account to manage your profile information.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Profile</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your personal information and display preferences.
        </p>
      </div>

      {/* Avatar Section */}
      <div className="flex items-center gap-4">
        {user.picture ? (
          <img
            src={user.picture}
            alt={user.name}
            className="h-16 w-16 rounded-2xl object-cover shadow-sm border border-border"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted text-lg font-semibold text-foreground shadow-sm">
            {getInitials(user.name)}
          </div>
        )}

        <div className="space-y-1">
          <p className="text-sm font-medium">Avatar</p>
          <p className="text-xs text-muted-foreground">
            {user.picture ? "From your Google account" : "Generated from initials"}
          </p>
        </div>
      </div>

      {/* User Info */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Display Name
          </Label>
          <Input
            disabled
            className="w-full h-9 rounded-lg border bg-muted px-3 text-sm text-foreground"
            value={user.name}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Email
          </Label>
          <Input
            disabled
            type="email"
            className="w-full h-9 rounded-lg border bg-muted px-3 text-sm text-foreground"
            value={user.email}
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Plan
          </Label>
          <Input
            disabled
            className="w-full h-9 rounded-lg border bg-muted px-3 text-sm text-foreground capitalize"
            value={user.plan}
          />
        </div>
      </div>

      {/* Logout Button */}
      <Button
        onClick={handleLogout}
        disabled={isLoggingOut || isLoading}
        variant="destructive"
        className="w-full"
      >
        {isLoggingOut ? "Signing out..." : "Sign out"}
      </Button>
    </div>
  );
}

import { useTheme } from "next-themes";
import { useEffect } from "react";

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const themes = ["light", "dark", "system"] as const;

  return (
    <Card className="border shadow-sm">
      <CardHeader>
        <CardTitle className="text-md">Theme</CardTitle>
        <CardDescription className="text-sm">
          Select the theme for the dashboard.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* THEME PREVIEW GRID */}
        <div className="grid grid-cols-3 gap-6">
          {themes.map((t) => {
            const selected = theme === t;

            return (
              <div
                key={t}
                onClick={() => setTheme(t)}
                className={cn("cursor-pointer space-y-3")}
              >
                {/* Preview Card */}
                <div
                  className={cn(
                    "rounded-xl border-2 p-3 transition-all duration-200",
                    selected
                      ? "border-primary"
                      : "border-muted hover:border-foreground/30",
                  )}
                >
                  {/* Fake UI Preview */}
                  <div
                    className={cn(
                      "rounded-lg p-3 space-y-3",
                      t === "dark"
                        ? "bg-foreground/10"
                        : t === "light"
                          ? "bg-muted"
                          : "bg-secondary",
                    )}
                  >
                    <div className="h-3 w-2/3 rounded bg-muted-foreground/30" />
                    <div className="h-8 rounded-lg bg-muted-foreground/20" />
                    <div className="h-8 rounded-lg bg-muted-foreground/20" />
                  </div>
                </div>

                <p className="text-center text-sm capitalize font-medium">
                  {t}
                </p>
              </div>
            );
          })}
        </div>

        {/* Save Button (Optional) */}
        <Button className="mt-4">Update preferences</Button>
      </CardContent>
    </Card>
  );
}

import {
  getDiskUsage,
  clearStorage,
  getCaptureStatus,
  type DiskUsage,
  type ClearTarget,
} from "@/api/storage";
import { Loader2, Trash2, Image, FileText, HardDrive, FolderOpen, AlertTriangle, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StorageItemProps {
  icon: React.ReactNode;
  label: string;
  size: string;
  detail?: string;
  onClear?: () => void;
  clearLabel?: string;
  isClearing?: boolean;
  isDangerous?: boolean;
}

function StorageItem({
  icon,
  label,
  size,
  detail,
  onClear,
  clearLabel = "Clear",
  isClearing = false,
  isDangerous = false,
}: StorageItemProps) {
  const ClearButton = isDangerous ? (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={isClearing}
          className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {isClearing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Trash2 className="h-3 w-3 mr-1" />
              {clearLabel}
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Clear {label}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete all {label.toLowerCase()} data.
            {label === "Database" && " The capture service will be paused during this operation."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onClear}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ) : onClear ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClear}
      disabled={isClearing}
      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
    >
      {isClearing ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <>
          <Trash2 className="h-3 w-3 mr-1" />
          {clearLabel}
        </>
      )}
    </Button>
  ) : null;

  return (
    <div className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          {detail && (
            <p className="text-xs text-muted-foreground">{detail}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">{size}</span>
        {ClearButton}
      </div>
    </div>
  );
}

function DataTab() {
  const [diskUsage, setDiskUsage] = useState<DiskUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState<ClearTarget | null>(null);

  const fetchDiskUsage = async () => {
    try {
      setLoading(true);
      setError(null);
      const usage = await getDiskUsage();
      setDiskUsage(usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch disk usage");
      console.error("Failed to fetch disk usage:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiskUsage();
  }, []);

  const handleClear = async (target: ClearTarget) => {
    try {
      setClearing(target);
      await clearStorage(target);
      // Refresh disk usage after clearing
      await fetchDiskUsage();
    } catch (err) {
      console.error(`Failed to clear ${target}:`, err);
      setError(err instanceof Error ? err.message : `Failed to clear ${target}`);
    } finally {
      setClearing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
        <Button variant="outline" onClick={fetchDiskUsage}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!diskUsage) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold tracking-tight">
            Data & Storage
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Monitor your storage usage and manage data.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchDiskUsage}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Total Storage Overview */}
      <div className="rounded-xl border p-4 space-y-3 bg-muted/30">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Total Storage Used</span>
          <span className="font-semibold">{diskUsage.total_size.formatted}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{
              width: `${Math.min(
                (diskUsage.total_size.bytes / (10 * 1024 * 1024 * 1024)) * 100,
                100
              )}%`,
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Data stored in: {diskUsage.base_dir}
        </p>
      </div>

      {/* Storage Breakdown */}
      <div className="rounded-xl border divide-y divide-border/50">
        <div className="p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-2">Storage Breakdown</h4>
        </div>
        <div className="px-4">
          <StorageItem
            icon={<Image className="h-4 w-4" />}
            label="Media"
            size={diskUsage.media.images_size.formatted}
            detail={`${diskUsage.media.images_count} screenshots`}
            onClear={() => handleClear("media")}
            isClearing={clearing === "media"}
            isDangerous
          />
          <StorageItem
            icon={<HardDrive className="h-4 w-4" />}
            label="Database"
            size={diskUsage.database.total_size.formatted}
            detail="Search index and text data"
            onClear={() => handleClear("database")}
            isClearing={clearing === "database"}
            isDangerous
          />
          <StorageItem
            icon={<FileText className="h-4 w-4" />}
            label="Logs"
            size={diskUsage.logs.total_size.formatted}
            detail={`${diskUsage.logs.files_count} log files`}
            onClear={() => handleClear("logs")}
            isClearing={clearing === "logs"}
          />
          <StorageItem
            icon={<FolderOpen className="h-4 w-4" />}
            label="Cache"
            size={diskUsage.cache.total_size.formatted}
            detail="Temporary files and OCR cache"
            onClear={() => handleClear("cache")}
            isClearing={clearing === "cache"}
          />
        </div>
      </div>

      {/* Clear All */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="destructive"
            className="w-full"
            disabled={clearing !== null}
          >
            {clearing === "all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            Clear All Data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Clear All Data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete all your data including screenshots, search history, logs, and cache. The capture service will be paused during this operation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleClear("all")}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


import PrivacySettings from "./settings/PrivacyTab";


function SystemTab() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">
          Background Service
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure background processing for faster responses.
        </p>
      </div>
      <div className="rounded-xl border p-4 space-y-1">
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <p className="text-sm font-medium">Service is running</p>
        </div>
        <p className="text-xs text-muted-foreground pl-4">
          Last synced 2 minutes ago
        </p>
      </div>
    </div>
  );
}

const tabContent: Record<SettingsTabs, React.ReactNode> = {
  [SettingsTabs.Profile]: <ProfileTab />,
  [SettingsTabs.Appearance]: <AppearanceTab />,
  [SettingsTabs.DataAndStorage]: <DataTab />,
  [SettingsTabs.Privacy]: <PrivacySettings />,
  [SettingsTabs.BackgroundService]: <SystemTab />,
};

export interface SettingsDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function SettingsDialog({
  open,
  setOpen,
}: SettingsDialogProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTabs>(
    SettingsTabs.Profile,
  );

  if (!open) {
    return <></>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* OVERLAY - Smoother fade */}
      <div
        onClick={(): void => setOpen(false)}
        className="absolute inset-0 bg-background/40 backdrop-blur-xs"
      />

      {/* DIALOG PANEL */}
      <div className="relative w-full max-w-[1000px] h-[650px] bg-card border shadow-2xl rounded-3xl overflow-hidden flex">
        {/* LEFT SIDEBAR */}
        <aside className="w-64 shrink-0 bg-sidebar border-r flex flex-col">
          <div className="p-6">
            <h2 className="text-md font-medium tracking-tight">Settings</h2>
            <p className="text-sm text-muted-foreground/70 mt-1 font-medium">
              Account Management
            </p>
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {settingsTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  variant={isActive ? "secondary" : "ghost"}
                  className={`w-full cursor-pointer  justify-start gap-3 px-3 h-10 transition-all ${
                    isActive
                      ? "text-foreground"
                      : "text-muted-foreground/70 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`${isActive ? "text-primary" : "opacity-70"}`}
                  >
                    {tab.icon}
                  </span>
                  <span className=" text-sm">{tab.label}</span>
                </Button>
              );
            })}
          </nav>
        </aside>

        {/* RIGHT PANEL */}
        <main className="flex-1 flex flex-col relative bg-background">
          {/* CONTENT AREA */}
          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            <div className="max-w-2xl mx-auto lg:mx-0">
              {tabContent[activeTab]}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
