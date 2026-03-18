"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import useAuth from "@/hooks/useAuth";
import { UserSettingsDialog } from "./UserSettingsDialog";
import {
  User,
  Settings,
  Monitor,
  LogOut,
  LogIn,
  Crown,
  Loader2,
} from "lucide-react";

interface UserProfileButtonProps {
  className?: string;
}

export function UserProfileButton({ className }: UserProfileButtonProps) {
  const { user, isAuthenticated, isLoading, loginWithGoogle, logout, activeSessions } =
    useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled className={className}>
        <Loader2 className="size-4 animate-spin" />
      </Button>
    );
  }

  // Anonymous user - show login button
  if (!isAuthenticated || !user) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={loginWithGoogle}
      >
        <LogIn className="size-4" />
        <span>Sign in</span>
      </Button>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className={className}>
            {user.picture ? (
              <img
                src={user.picture}
                alt={user.name ?? "User"}
                className="size-7 rounded-full"
              />
            ) : (
              <User className="size-4" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-none">{user.name}</p>
                {user.plan === "premium" && (
                  <Crown className="size-3 text-yellow-500" />
                )}
              </div>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
              <p className="text-xs leading-none text-muted-foreground capitalize">
                {user.plan} plan
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
            <Settings className="size-4" />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled>
            <Monitor className="size-4" />
            <span>Active Sessions</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {activeSessions?.length ?? 0}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={logout}>
            <LogOut className="size-4" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <UserSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
