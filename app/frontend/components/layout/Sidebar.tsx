"use client";

import {
  Archive,
  Delete,
  Edit,
  Ellipsis,
  PanelLeft,
  Search,
  Share,
  SquarePen,
  User2,
} from "lucide-react";
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
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { useBreakpoint } from "@/hooks/useBreakpoints";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";

const techTopics: string[] = [
  "What are microservices?",
  "AI agents and LLMs",
  "Vector databases explained",
];

function LeftSidebar(): React.ReactElement {
  const { toggleSidebar, state, isMobile } = useSidebar();
  const { isMd } = useBreakpoint();
  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const isCollapsed = state === "collapsed";

  const goToHome = (): void => {
    redirect("/");
  };

  // 1. Defined as a proper render function to ensure Context/Refs pass safely
  const renderSidebarContent = (): React.ReactElement => (
    <>
      <SidebarHeader
        className={cn(
          "py-3 flex items-center",
          isCollapsed ? "justify-center px-0" : "px-3 justify-between",
        )}
      >
        <div className="flex items-center justify-between w-full">
          <span
            onClick={toggleSidebar}
            className="cursor-pointer text-base flex shrink-0 items-center"
          >
            <Image
              src="/blackLogo.svg"
              alt="logo"
              className="dark:invert shrink-0"
              width={40}
              height={40}
            />
          </span>
          {!isCollapsed && (
            <PanelLeft
              onClick={(): void => {
                if (isMobile || isMd) {
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
        <SidebarMenuItem onClick={goToHome} className="group/menuitem list-none">
          <SidebarMenuButton
            variant="default"
            className="
      w-full flex items-center cursor-pointer justify-start px-3
    "
          >
            <SquarePen className="h-5 w-5 shrink-0" />
            <span className="flex w-full items-center justify-between  ml-2 overflow-hidden">
              <span className="whitespace-nowrap text-sm">New Memory</span>
              <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover/menuitem:opacity-100 whitespace-nowrap">
                Ctrl + Shift + O
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <SidebarMenuItem className="group/menuitem list-none">
          <SidebarMenuButton
            variant="default"
            className="w-full flex items-center cursor-pointer justify-start px-3"
          >
            <Search className="h-5 w-5 shrink-0" />
            <span className="flex w-full items-center justify-between  ml-2 overflow-hidden">
              <span className="text-sm whitespace-nowrap">Search chats</span>
              <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover/menuitem:opacity-100 whitespace-nowrap">
                Ctrl + K
              </span>
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <div
          className={cn(
            "mt-8 overflow-hidden transition-all",
            isCollapsed ? "h-0 opacity-0" : "h-auto opacity-100",
          )}
        >
          <p className="mb-2 px-3 text-sm text-muted-foreground/60 whitespace-nowrap">
            Your chats
          </p>
          <SidebarMenu>
            {techTopics.map((topic: string, i: number) => (
              <SidebarMenuItem className="group/view" key={i}>
                <SidebarMenuButton
                  variant="default"
                  className="
                  w-full
                  flex
                  items-center
                  justify-between
                  cursor-pointer
                  px-3
                  group-data-[collapsible=icon]:justify-center
                  group-data-[collapsible=icon]:px-0
                  "
                >
                  <span className="truncate">{topic}</span>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Ellipsis className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/view:opacity-100" />
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      align="start"
                      className="w-48 p-2 rounded-2xl border shadow-lg"
                    >
                      <DropdownMenuItem className={cn("flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition")}>
                        <Share className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Share</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem className={cn("flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition")}>
                        <Edit className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Rename</span>
                      </DropdownMenuItem>

                      <Separator className="my-2" />

                      <DropdownMenuItem className={cn("flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition")}>
                        <Archive className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Archive</span>
                      </DropdownMenuItem>

                      <DropdownMenuItem className="flex items-center cursor-pointer gap-3 px-2 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition">
                        <Delete className="h-4 w-4 shrink-0" />
                        <span className="text-sm">Delete</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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
              <div className="flex flex-col gap-1 text-left  overflow-hidden">
                <span className="text-sm font-medium leading-none text-foreground whitespace-nowrap">
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

  if (isMobile || isMd) {
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
        className="
    z-10
    shrink-0
    m-4
    flex
    h-[calc(100vh-2rem)]
    flex-col
    overflow-hidden
    rounded-xl
    border
    bg-sidebar
    transition-all
    duration-300
    data-[collapsible=icon]:w-[var(--sidebar-width-icon)]
    data-[collapsible=offcanvas]:w-[var(--sidebar-width)]
  "
      >
        {renderSidebarContent()}
      </Sidebar>
      <SettingsDialog open={isSettingsOpen} setOpen={setSettingsOpen} />
    </>
  );
}

export default LeftSidebar;
