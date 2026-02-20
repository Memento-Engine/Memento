"use client";

import { Settings, Sun, Moon, Laptop, Database } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useTheme } from "next-themes";
import { SidebarFooter } from "./ui/sidebar";

export function SidebarSettings() {
  const { setTheme } = useTheme();

  return (
    <SidebarFooter className="mt-auto border-t bg-sidebar p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full cursor-pointer justify-start gap-3 rounded-md px-3 py-2 text-sm hover:bg-background"
          >
            <Settings size={18} />
            Settings
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="top"
          align="end"
          className="w-56"
        >
          <DropdownMenuLabel>Preferences</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {/* THEME SUBMENU */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              Theme
            </DropdownMenuSubTrigger>

            <DropdownMenuSubContent>
              <DropdownMenuItem onClick={() => setTheme("light")}>
                <Sun className="mr-2 h-4 w-4" />
                Light
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setTheme("system")}>
                <Laptop className="mr-2 h-4 w-4" />
                System
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setTheme("dark")}>
                <Moon className="mr-2 h-4 w-4" />
                Dark
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* DATA STORAGE */}
          <DropdownMenuItem
          className="hover:dark:bg-background"
          >
            <Database className="mr-2 h-4 w-4" />
            Data Storage
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarFooter>
  );
}
