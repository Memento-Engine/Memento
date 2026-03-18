"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Cpu, Database, HatGlasses, Palette, UserPen, Laptop, Globe, Clock3, MonitorSmartphone, Power, Radio, AlertCircle } from "lucide-react";

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
import { invoke } from "@tauri-apps/api/core";

export enum SettingsTabs {
  Profile,
  Appearance,
  DataAndStorage,
  Privacy,
  Sessions,
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
  { id: SettingsTabs.Sessions, label: "Sessions", icon: <Laptop /> },
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

function SessionsTab(): React.ReactElement {
  const { user, activeSessions, revokeSession, refreshAuth, isLoading } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = async () => {
    try {
      setIsRefreshing(true);
      setError(null);
      await refreshAuth();
    } catch (err) {
      console.error("Failed to refresh sessions:", err);
      setError(err instanceof Error ? err.message : "Failed to refresh sessions");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (user && activeSessions.length === 0 && !isLoading) {
      void refreshSessions();
    }
  }, [user, activeSessions.length, isLoading]);

  const handleRevokeSession = async (sessionId: string) => {
    try {
      setRevokingSessionId(sessionId);
      setError(null);
      await revokeSession(sessionId);
    } catch (err) {
      console.error("Failed to revoke session:", err);
      setError(err instanceof Error ? err.message : "Failed to revoke session");
    } finally {
      setRevokingSessionId(null);
    }
  };

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Sessions</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Review active sessions and revoke access from other devices.
          </p>
        </div>

        <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
          <p className="text-sm text-muted-foreground">You are not logged in.</p>
          <p className="text-xs text-muted-foreground/70">
            Sign in with Google to manage active sessions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Sessions</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            See where your account is signed in and revoke access from devices you do not recognize.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshSessions}
          disabled={isRefreshing || isLoading}
          className="gap-2"
        >
          <RefreshCw className={cn("h-4 w-4", (isRefreshing || isLoading) && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Active Sessions</p>
          <p className="text-2xl font-semibold mt-1">{activeSessions.length}</p>
        </div>
        <div className="rounded-xl border bg-muted/20 p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Current Device</p>
          <p className="text-sm font-medium mt-1">
            {activeSessions.find((session) => session.isCurrent)?.deviceHostname || "This device"}
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {isLoading && activeSessions.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : activeSessions.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeSessions.map((session) => (
            <div key={session.id} className="rounded-xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold">
                      {session.deviceHostname || "Unknown device"}
                    </p>
                    {session.isCurrent && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        Current session
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <MonitorSmartphone className="h-3.5 w-3.5" />
                      <span>{session.deviceOs || "Unknown OS"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5" />
                      <span>{session.ipAddress || "Unknown IP"}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock3 className="h-3.5 w-3.5" />
                      <span>
                        {session.lastActiveAt ? `Last active ${formatRelativeDate(session.lastActiveAt)}` : "No activity yet"}
                      </span>
                    </div>
                  </div>
                </div>

                {!session.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revokingSessionId === session.id}
                    className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:text-destructive"
                  >
                    {revokingSessionId === session.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Revoke"
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "unknown";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) {
    return "just now";
  }
  if (diffMs < 3_600_000) {
    const minutes = Math.floor(diffMs / 60_000);
    return `${minutes} min${minutes > 1 ? "s" : ""} ago`;
  }
  if (diffMs < 86_400_000) {
    const hours = Math.floor(diffMs / 3_600_000);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }

  return date.toLocaleDateString();
}


import PrivacySettings from "./settings/PrivacyTab";
import { getDaemonCaptureStatus, pauseCapture, resumeCapture } from "@/api/daemon";

type ServiceStatus = "running" | "stopped" | "starting" | "stopping" | "unknown";
type CaptureStatus = "capturing" | "paused" | "unknown";

function BackgroundServiceTab(): React.ReactElement {
  const [daemonStatus, setDaemonStatus] = useState<ServiceStatus>("unknown");
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>("unknown");
  const [isLoading, setIsLoading] = useState(true);
  const [isDaemonActionLoading, setIsDaemonActionLoading] = useState(false);
  const [isCaptureActionLoading, setIsCaptureActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refresh statuses
  const refreshStatuses = async () => {
    try {
      setError(null);
      
      // Get daemon status
      const daemonStatusRes = await invoke<string>("get_service_status");
      console.log("Daemon status response:", daemonStatusRes);
      setDaemonStatus(daemonStatusRes as ServiceStatus);

      // Get capture status (only if daemon is running)
      if (daemonStatusRes === "running") {
        try {
          const captureStatusRes = await getDaemonCaptureStatus();
          setCaptureStatus(captureStatusRes.paused ? "paused" : "capturing");
        } catch (err) {
          console.error("Failed to get capture status:", err);
          setCaptureStatus("unknown");
        }
      } else {
        setCaptureStatus("unknown");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to get service status";
      setError(message);
      console.error("Status check failed:", err);
      setDaemonStatus("unknown");
      setCaptureStatus("unknown");
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh on mount
  useEffect(() => {
    void refreshStatuses();
    const interval = setInterval(() => {
      void refreshStatuses();
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, []);

  // Handle daemon start
  const handleStartDaemon = async () => {
    try {
      setIsDaemonActionLoading(true);
      setError(null);
      await invoke("start_daemon", { isDev: false });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s for daemon to start
      await refreshStatuses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start daemon";
      setError(message);
      console.error("Failed to start daemon:", err);
    } finally {
      setIsDaemonActionLoading(false);
    }
  };

  // Handle daemon stop
  const handleStopDaemon = async () => {
    try {
      setIsDaemonActionLoading(true);
      setError(null);
      await invoke("stop_daemon", { isDev: false });
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1s for daemon to stop
      await refreshStatuses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop daemon";
      setError(message);
      console.error("Failed to stop daemon:", err);
    } finally {
      setIsDaemonActionLoading(false);
    }
  };

  // Handle capture start
  const handleStartCapture = async () => {
    try {
      setIsCaptureActionLoading(true);
      setError(null);
      await resumeCapture();
      await refreshStatuses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start capture";
      setError(message);
      console.error("Failed to start capture:", err);
    } finally {
      setIsCaptureActionLoading(false);
    }
  };

  // Handle capture stop
  const handleStopCapture = async () => {
    try {
      setIsCaptureActionLoading(true);
      setError(null);
      await pauseCapture();
      await refreshStatuses();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to stop capture";
      setError(message);
      console.error("Failed to stop capture:", err);
    } finally {
      setIsCaptureActionLoading(false);
    }
  };

  const isDaemonRunning = daemonStatus === "running";
  const isCapturing = captureStatus === "capturing";

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-semibold tracking-tight">Background Service</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage the background daemon and capture processes.
          </p>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Background Service</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage the background daemon and capture processes.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 flex gap-3">
          <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Daemon Status */}
        <div className={cn(
          "rounded-xl border p-4 space-y-3",
          isDaemonRunning ? "bg-green-50/50 dark:bg-green-950/30 border-green-600/20" : "bg-red-50/50 dark:bg-red-950/30 border-red-600/20"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-3 w-3 rounded-full",
              isDaemonRunning ? "bg-green-600" : "bg-red-600"
            )} />
            <p className={cn(
              "text-sm font-semibold",
              isDaemonRunning ? "text-green-900 dark:text-green-100" : "text-red-900 dark:text-red-100"
            )}>
              {isDaemonRunning ? "Daemon Running" : "Daemon Dead"}
            </p>
          </div>
          <p className={cn(
            "text-xs",
            isDaemonRunning ? "text-green-800 dark:text-green-200" : "text-red-800 dark:text-red-200"
          )}>
            {isDaemonRunning ? "Services operational and responsive" : "No background services active"}
          </p>
        </div>

        {/* Capture Status */}
        <div className={cn(
          "rounded-xl border p-4 space-y-3",
          isCapturing ? "bg-blue-50/50 dark:bg-blue-950/30 border-blue-600/20" : "bg-yellow-50/50 dark:bg-yellow-950/30 border-yellow-600/20"
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              "h-3 w-3 rounded-full",
              isCapturing ? "bg-blue-600 animate-pulse" : "bg-yellow-600"
            )} />
            <p className={cn(
              "text-sm font-semibold",
              isCapturing ? "text-blue-900 dark:text-blue-100" : "text-yellow-900 dark:text-yellow-100"
            )}>
              {isCapturing ? "Capturing" : "Not Capturing"}
            </p>
          </div>
          <p className={cn(
            "text-xs",
            isCapturing ? "text-blue-800 dark:text-blue-200" : "text-yellow-800 dark:text-yellow-200"
          )}>
            {isCapturing ? "Actively recording activity" : "Capture is paused"}
          </p>
        </div>
      </div>

      {/* Daemon Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-md">
            <Power className="h-4 w-4" />
            Daemon Control
          </CardTitle>
          <CardDescription>
            Start or stop the background daemon service.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {isDaemonRunning ? (
            <Button
              onClick={handleStopDaemon}
              disabled={isDaemonActionLoading}
              variant="destructive"
              className="gap-2 flex-1"
            >
              {isDaemonActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Stop Daemon
            </Button>
          ) : (
            <Button
              onClick={handleStartDaemon}
              disabled={isDaemonActionLoading}
              className="gap-2 flex-1"
            >
              {isDaemonActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Start Daemon
            </Button>
          )}
          <Button
            onClick={refreshStatuses}
            disabled={isDaemonActionLoading || isCaptureActionLoading}
            variant="outline"
            size="icon"
            className="shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Capture Controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-md">
            <Radio className="h-4 w-4" />
            Capture Control
          </CardTitle>
          <CardDescription>
            Start or pause the capture process. Daemon must be running.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          {isCapturing ? (
            <Button
              onClick={handleStopCapture}
              disabled={isCaptureActionLoading || !isDaemonRunning}
              variant="outline"
              className="gap-2 flex-1 text-yellow-600 border-yellow-600/20 hover:bg-yellow-50 dark:hover:bg-yellow-950/30"
            >
              {isCaptureActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              Pause Capture
            </Button>
          ) : (
            <Button
              onClick={handleStartCapture}
              disabled={isCaptureActionLoading || !isDaemonRunning}
              className="gap-2 flex-1"
            >
              {isCaptureActionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
              Start Capture
            </Button>
          )}
          <Button
            onClick={refreshStatuses}
            disabled={isDaemonActionLoading || isCaptureActionLoading}
            variant="outline"
            size="icon"
            className="shrink-0"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-600/20 bg-blue-50/50 dark:bg-blue-950/30 p-4 space-y-2">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">How it works</p>
            <ul className="text-xs text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
              <li>The Daemon is the core background service that powers capture</li>
              <li>You can stop the daemon to completely halt all background operations</li>
              <li>Pause capture to leave the daemon running but temporarily halt recording</li>
              <li>The service automatically restarts on app launch</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

const tabContent: Record<SettingsTabs, React.ReactNode> = {
  [SettingsTabs.Profile]: <ProfileTab />,
  [SettingsTabs.Appearance]: <AppearanceTab />,
  [SettingsTabs.DataAndStorage]: <DataTab />,
  [SettingsTabs.Privacy]: <PrivacySettings />,
  [SettingsTabs.Sessions]: <SessionsTab />,
  [SettingsTabs.BackgroundService]: <BackgroundServiceTab />,
};

export interface SettingsDialogProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function SettingsDialog({
  open,
  setOpen,
}: SettingsDialogProps): React.ReactElement {
  const { user, loginWithGoogle, isLoading } = useAuth();
  const isAnonymous = !user;

  const [activeTab, setActiveTab] = useState<SettingsTabs>(
    SettingsTabs.Profile,
  );

  const visibleTabs = isAnonymous
    ? settingsTabs.filter((tab) => tab.id !== SettingsTabs.Profile)
    : settingsTabs;

  useEffect(() => {
    if (isAnonymous && activeTab === SettingsTabs.Profile) {
      setActiveTab(SettingsTabs.Appearance);
    }
  }, [isAnonymous, activeTab]);

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
          <div className="p-6 space-y-4">
            <h2 className="text-md font-medium tracking-tight">Settings</h2>
            <p className="text-sm text-muted-foreground/70 font-medium">
              Account Management
            </p>

            <div className="rounded-xl border bg-muted/20 p-3 flex items-center gap-3">
              {user?.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-10 w-10 rounded-xl object-cover border border-border"
                />
              ) : (
                <div className="h-10 w-10 rounded-xl border border-border bg-muted flex items-center justify-center text-sm font-semibold">
                  G
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user?.name ?? "Guest"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email ?? "Anonymous mode"}
                </p>
              </div>
            </div>

            {isAnonymous && (
              <Button
                onClick={() => void loginWithGoogle()}
                disabled={isLoading}
                className="w-full"
                size="sm"
              >
                {isLoading ? "Signing in..." : "Sign in with Google"}
              </Button>
            )}
          </div>

          <nav className="flex-1 px-3 space-y-1">
            {visibleTabs.map((tab) => {
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
              {tabContent[activeTab] ?? tabContent[SettingsTabs.Appearance]}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
