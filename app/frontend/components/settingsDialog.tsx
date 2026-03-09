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
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">Profile</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your personal information and display preferences.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border bg-muted text-xl font-semibold text-foreground shadow-sm">
          A
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">Avatar</p>

          <Button
            variant="link"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors h-auto p-0"
          >
            Upload new photo
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Display Name
          </Label>

          <Input
            className="w-full h-9 rounded-lg border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring/0 transition"
            placeholder="Your name"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Email
          </Label>

          <Input
            type="email"
            className="w-full h-9 rounded-lg border bg-background px-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring/30 transition"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <Button className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
        Save changes
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

function DataTab() {
  const used = 1.2;
  const total = 5;
  const pct = (used / total) * 100;
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold tracking-tight">
          Data & Storage
        </h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Monitor your storage usage and manage cached data.
        </p>
      </div>
      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex justify-between text-sm">
          <span className="font-medium">Storage Used</span>
          <span className="text-muted-foreground">
            {used} GB / {total} GB
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {100 - pct}% free remaining
        </p>
      </div>
      <button className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted">
        Clear cache
      </button>
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
