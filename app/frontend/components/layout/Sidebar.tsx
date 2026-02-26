"use client";

import { Ellipsis, PanelLeft, Search, SquarePen, User2 } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "../ui/sidebar";

import { redirect } from "next/navigation";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "../settingsDialog";
import { useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";

const techTopics: string[] = [
  "What are microservices?",
  "AI agents and LLMs",
  "Vector databases explained",
];

function LeftSidebar(): React.ReactElement {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const isCollapsed = state === "collapsed";

  const goToHome = (): void => {
    redirect("/");
  };

  // 1. Defined as a proper render function to ensure Context/Refs pass safely
  const renderSidebarContent = () => (
    <>
      <SidebarHeader className="py-3 px-3">
        <div className="flex items-center justify-between w-full">
          <span
            onClick={toggleSidebar}
            className="cursor-pointer text-base flex shrink-0 items-center"
          >
            <Image
              src="/blackLogo.svg"
              alt="logo"
              className="dark:invert shrink-0"
              width={36}
              height={36}
            />
          </span>
          {!isCollapsed && (
            <PanelLeft
              onClick={(): void => {
                console.log("Panel left clicked");
                if (isMobile) {
                  setMobileOpen(!isMobileOpen);
                } else {
                  toggleSidebar();
                }
              }}
              size={18}
              className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
            />
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar flex-1 overflow-y-auto px-3 py-4">
        <SidebarMenu>
          <SidebarMenuItem onClick={goToHome} className="group/menuitem">
            <SidebarMenuButton
              variant={"default"}
              className="w-full cursor-pointer flex items-center justify-start px-3"
            >
              <SquarePen className="h-5 w-5 shrink-0" />
              <span className="flex w-full items-center justify-between group-data-[collapsible=icon]:hidden ml-2 overflow-hidden">
                <span className="whitespace-nowrap">New Memory</span>
                <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover/menuitem:opacity-100 whitespace-nowrap">
                  Ctrl + Shift + O
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem className="group/menuitem">
            <SidebarMenuButton
              variant={"default"}
              className="w-full cursor-pointer flex items-center justify-start px-3"
            >
              <Search className="h-5 w-5 shrink-0" />
              <span className="flex w-full items-center justify-between group-data-[collapsible=icon]:hidden ml-2 overflow-hidden">
                <span className="text-sm whitespace-nowrap">Search chats</span>
                <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover/menuitem:opacity-100 whitespace-nowrap">
                  Ctrl + K
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <div
          className={cn(
            "mt-8 overflow-hidden transition-all",
            isCollapsed ? "h-0 opacity-0" : "h-auto opacity-100",
          )}
        >
          <p className="mb-2 px-3 text-sm text-muted-foreground whitespace-nowrap">
            Your chats
          </p>
          <SidebarMenu>
            {techTopics.map((topic: string, i: number) => (
              <SidebarMenuItem className="group/view" key={i}>
                <SidebarMenuButton className="flex cursor-pointer items-center justify-between rounded-md px-3 py-3 text-sm">
                  <span className="truncate">{topic}</span>
                  <Ellipsis className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/view:opacity-100" />
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </div>
      </SidebarContent>

      <SidebarFooter
        onClick={(): void => {
          setSettingsOpen(!isSettingsOpen);
          if (isMobile) {
            setMobileOpen(!isMobileOpen);
          }
        }}
        className="p-3"
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="w-full cursor-pointer flex items-center justify-start px-3"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                <User2 className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex flex-col gap-1 text-left group-data-[collapsible=icon]:hidden overflow-hidden">
                <span className="text-sm font-semibold leading-none text-foreground whitespace-nowrap">
                  Bruce Wayne
                </span>
                <span className="text-xs leading-none text-muted-foreground whitespace-nowrap">
                  brucewayne@enterprises.com
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );

  if (isMobile) {
    return (
      <div className="relative">
        <div className="absolute top-6 left-6">
          <PanelLeft
            onClick={() => setMobileOpen(true)}
            className="cursor-pointer"
          />
        </div>
        <Sheet open={isMobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side="left"
            className="w-[var(--sidebar-width)] p-0 flex flex-col h-full bg-sidebar border-r gap-0 [&>button]:hidden"
          >
            <SheetTitle className="sr-only">Navigation Sidebar</SheetTitle>
            {renderSidebarContent()}
          </SheetContent>
        </Sheet>

        <SettingsDialog open={isSettingsOpen} setOpen={setSettingsOpen} />
      </div>
    );
  }

  return (
    <>
      <Sidebar
        collapsible="icon"
        className={cn(
          "z-10 shrink-0 m-4 flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-xl border bg-sidebar transition-all duration-300",
          // 3. Fix: Dynamically switch width based on collapsed state
          isCollapsed
            ? "w-[var(--sidebar-width-icon,3rem)]"
            : "w-[var(--sidebar-width)]",
        )}
      >
        {renderSidebarContent()}
      </Sidebar>
      <SettingsDialog open={isSettingsOpen} setOpen={setSettingsOpen} />
    </>
  );
}

export default LeftSidebar;
