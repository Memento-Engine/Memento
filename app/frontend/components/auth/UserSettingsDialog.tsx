"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import useAuth from "@/hooks/useAuth";
import type { UserPreferences, SessionInfo } from "@/contexts/authContext";
import {
  Sun,
  Moon,
  Monitor,
  Bell,
  BellOff,
  Video,
  VideoOff,
  Shield,
  Trash2,
  LogOut,
  Loader2,
  Laptop,
} from "lucide-react";

interface UserSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({
  open,
  onOpenChange,
}: UserSettingsDialogProps) {
  const { preferences, updatePreferences, activeSessions, revokeSession, user } =
    useAuth();
  const [localPrefs, setLocalPrefs] = useState<UserPreferences>(preferences);
  const [isSaving, setIsSaving] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  // Sync local state when preferences change
  useEffect(() => {
    setLocalPrefs(preferences);
  }, [preferences]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePreferences(localPrefs);
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await revokeSession(sessionId);
    } finally {
      setRevokingSession(null);
    }
  };

  const updateLocalPref = <K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setLocalPrefs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your preferences and account settings
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="preferences" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>

          <TabsContent value="preferences" className="space-y-4 mt-4">
            {/* Theme */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Theme</Label>
              <div className="flex gap-2">
                <Button
                  variant={localPrefs.theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateLocalPref("theme", "light")}
                >
                  <Sun className="size-4" />
                  Light
                </Button>
                <Button
                  variant={localPrefs.theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateLocalPref("theme", "dark")}
                >
                  <Moon className="size-4" />
                  Dark
                </Button>
                <Button
                  variant={localPrefs.theme === "system" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updateLocalPref("theme", "system")}
                >
                  <Monitor className="size-4" />
                  System
                </Button>
              </div>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Notifications</Label>
                <p className="text-xs text-muted-foreground">
                  Get notified about important events
                </p>
              </div>
              <Button
                variant={localPrefs.notifications ? "default" : "outline"}
                size="icon-sm"
                onClick={() =>
                  updateLocalPref("notifications", !localPrefs.notifications)
                }
              >
                {localPrefs.notifications ? (
                  <Bell className="size-4" />
                ) : (
                  <BellOff className="size-4" />
                )}
              </Button>
            </div>

            <Separator />

            {/* Auto Capture */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Auto Capture</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically capture screen activity
                </p>
              </div>
              <Button
                variant={localPrefs.autoCapture ? "default" : "outline"}
                size="icon-sm"
                onClick={() =>
                  updateLocalPref("autoCapture", !localPrefs.autoCapture)
                }
              >
                {localPrefs.autoCapture ? (
                  <Video className="size-4" />
                ) : (
                  <VideoOff className="size-4" />
                )}
              </Button>
            </div>

            {localPrefs.autoCapture && (
              <div className="space-y-2 pl-1">
                <Label className="text-xs text-muted-foreground">
                  Capture interval (seconds)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={localPrefs.captureInterval}
                  onChange={(e) =>
                    updateLocalPref(
                      "captureInterval",
                      Math.max(1, Math.min(60, parseInt(e.target.value) || 5))
                    )
                  }
                  className="w-24"
                />
              </div>
            )}

            <Separator />

            {/* Privacy Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Privacy Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Blur sensitive content in captures
                </p>
              </div>
              <Button
                variant={localPrefs.privacyMode ? "default" : "outline"}
                size="icon-sm"
                onClick={() =>
                  updateLocalPref("privacyMode", !localPrefs.privacyMode)
                }
              >
                <Shield className="size-4" />
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4 mt-4">
            {user ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Manage your active sessions across devices.
                </p>
                <div className="space-y-2">
                  {activeSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No active sessions
                    </p>
                  ) : (
                    activeSessions.map((session: SessionInfo) => (
                      <SessionItem
                        key={session.id}
                        session={session}
                        onRevoke={() => handleRevokeSession(session.id)}
                        isRevoking={revokingSession === session.id}
                      />
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Sign in to manage your sessions across devices.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface SessionItemProps {
  session: SessionInfo;
  onRevoke: () => void;
  isRevoking: boolean;
}

function SessionItem({ session, onRevoke, isRevoking }: SessionItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md border bg-card">
      <div className="flex items-center gap-3">
        <Laptop className="size-5 text-muted-foreground" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {session.deviceHostname ?? "Unknown device"}
            {session.isCurrent && (
              <span className="ml-2 text-xs text-green-600 dark:text-green-400">
                (Current)
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {session.deviceOs ?? "Unknown OS"} • {session.ipAddress ?? "Unknown IP"}
          </p>
          {session.lastActiveAt && (
            <p className="text-xs text-muted-foreground">
              Last active: {formatDate(session.lastActiveAt)}
            </p>
          )}
        </div>
      </div>
      {!session.isCurrent && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRevoke}
          disabled={isRevoking}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {isRevoking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    // Less than a minute
    if (diff < 60000) {
      return "Just now";
    }
    
    // Less than an hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
    }
    
    // Less than a day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    }
    
    // Format as date
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}
