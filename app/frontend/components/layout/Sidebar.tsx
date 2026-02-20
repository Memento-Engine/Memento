"use client";
import {
  DotSquare,
  Edit2,
  Edit2Icon,
  Edit3Icon,
  Ellipsis,
  PanelLeft,
  PresentationIcon,
  Search,
  Settings,
  SidebarOpen,
  SquarePen,
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
import { SidebarSettings } from "../LeftSidebarSettings";
import Image from "next/image";

const techTopics: string[] = [
  "What are microservices?",
  "AI agents and LLMs",
  "Vector databases explained",
];

function Nothing(): React.ReactElement {
  const { toggleSidebar, state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const goToHome = (): void => {
    redirect("/");
  };

  return (
    <Sidebar
      collapsible="icon"
      className="h-screen border-r flex flex-col"
    >
      {/* 1. HEADER */}
      <SidebarHeader className="py-3 ">
        <div
          className={`flex items-center ${isCollapsed ? "justify-center" : "justify-between px-3"}`}
        >
          <span
            onClick={toggleSidebar}
            className="text-base font-sans font-semibold truncate"
          >
            <Image src="/blackLogo.svg" alt="logo" width={38} height={38} />
          </span>
          {!isCollapsed && (
            <PanelLeft
              onClick={toggleSidebar}
              size={18}
              className="cursor-pointer shrink-0"
            />
          )}
        </div>
      </SidebarHeader>

      {/* 2. CONTENT */}
      <SidebarContent className="flex-1 overflow-y-auto px-3 py-4 custom-scrollbar">
        <SidebarMenu>
          {/* New Chat Item */}
          <SidebarMenuItem onClick={goToHome} className="group/menuitem">
            <SidebarMenuButton
              className={`w-full cursor-pointer ${
                isCollapsed ? "justify-center" : "px-3"
              }`}
            >
              <SquarePen className="w-4 h-4 shrink-0" />

              {!isCollapsed && (
                <span className="group-data-[collapsible=icon]:hidden font-sans flex justify-between items-center w-full">
                  <span className="font-feixen">New chat</span>

                  <span className="opacity-0 group-hover/menuitem:opacity-100 font-feixen text-xs text-muted-background/50 transition-opacity">
                    Ctrl + Shift + O
                  </span>
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Search Item */}
          <SidebarMenuItem className="group/menuitem">
            <SidebarMenuButton
              className={`w-full cursor-pointer ${
                isCollapsed ? "justify-center" : "px-3"
              }`}
            >
              <Search className="w-4 h-4 shrink-0" />

              {!isCollapsed && (
                <span className="group-data-[collapsible=icon]:hidden flex justify-between items-center w-full">
                  <span className="font-feixen">Search chats</span>

                  <span className="opacity-0 group-hover/menuitem:opacity-100 font-feixen text-xs text-muted-foreground/50 transition-opacity">
                    Ctrl + K
                  </span>
                </span>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* History Section - Hidden when collapsed */}
        {!isCollapsed && (
          <div className="mt-8">
            <p className="px-3 mb-2 text-muted-foreground  font-sans text-sm font-medium text-black">
              Your chats
            </p>

            <SidebarMenu>
              {techTopics.map((topic: string, i: number) => (
                <SidebarMenuItem className="group/view" key={i}>
                  <SidebarMenuButton className="px-3  flex justify-between items-center cursor-pointer py-3 text-sm rounded-md hover:bg-background">
                    <span className="truncate">{topic}</span>
                    <Ellipsis className="opacity-0 group-hover/view:opacity-100" />
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        )}
      </SidebarContent>

      {/* 3. FOOTER */}
      <SidebarSettings />
    </Sidebar>
  );
}

export default Nothing;
