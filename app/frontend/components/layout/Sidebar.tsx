"use client";

import {
  Archive,
  Delete,
  Edit,
  Ellipsis,
  LogIn,
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
import { cn } from "@/lib/utils";
import { SettingsDialog } from "../settingsDialog";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Separator } from "../ui/separator";
import { MementoLogo } from "../Logo";
import { PremiumCredits } from "../PremiumCredits";
import  useAuth  from "@/hooks/useAuth";

const techTopics: string[] = [
  "What are microservices?",
  "AI agents and LLMs",
  "Vector databases explained",
];

function LeftSidebar(): React.ReactElement {
  const { toggleSidebar, state } = useSidebar();
  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const { user, isAuthenticated, loginWithGoogle } = useAuth();
  const isCollapsed = state === "collapsed";

  const goToHome = (): void => {
    redirect("/");
  };

  const handleFooterClick = (): void => {
    if (isAuthenticated) {
      setSettingsOpen(!isSettingsOpen);
    } else {
      loginWithGoogle();
    }
  };

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
        "
      >
        <SidebarHeader
          className={cn(
            "flex items-center py-3",
            isCollapsed ? "justify-center px-0" : "px-3 justify-between",
          )}
        >
          <div
            className={cn(
              "flex w-full items-center",
              isCollapsed ? "justify-center" : "justify-between",
            )}
          >
            <span
              onClick={toggleSidebar}
              className="cursor-pointer text-base flex shrink-0 items-center"
            >
              <MementoLogo size={40}/>
            </span>
            {!isCollapsed && (
              <PanelLeft
                onClick={toggleSidebar}
                size={18}
                className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
              />
            )}
          </div>
        </SidebarHeader>

      <SidebarContent className="custom-scrollbar flex-1 overflow-y-auto px-3 py-4 group-data-[collapsible=icon]:px-2">
          <SidebarMenu>
            <SidebarMenuItem
              onClick={goToHome}
              className="group/menuitem list-none"
            >
              <SidebarMenuButton
                variant="default"
                className="
                  w-full flex items-center text-muted-foreground/90 cursor-pointer justify-start px-3
                  group-data-[collapsible=icon]:justify-center
                  group-data-[collapsible=icon]:px-0
                  "
              >
                <SquarePen className="h-5 w-5 shrink-0" />
                <span className="ml-2 flex w-full min-w-0 items-center justify-between overflow-hidden group-data-[collapsible=icon]:hidden">
                  <span className="whitespace-nowrap text-sm">Chat</span>
                  <span className="text-xs text-muted-foreground/50 opacity-0 transition-opacity group-hover/menuitem:opacity-100 whitespace-nowrap">
                    Ctrl + Shift + O
                  </span>
                </span>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem className="group/menuitem list-none">
              <SidebarMenuButton
                variant="default"
                className="w-full text-muted-foreground flex items-center cursor-pointer justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              >
                <Search className="h-5 w-5 shrink-0" />
                <span className="ml-2 flex w-full min-w-0 items-center justify-between overflow-hidden group-data-[collapsible=icon]:hidden">
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
            <p className="mb-2 px-3 text-sm text-muted-foreground/50 whitespace-nowrap">
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
                    text-muted-foreground
                    justify-between
                    cursor-pointer
                    px-3
                    font-normal
                    group-data-[collapsible=icon]:justify-center
                    group-data-[collapsible=icon]:px-0
                    "
                  >
                    <span className="truncate group-data-[collapsible=icon]:hidden">
                      {topic}
                    </span>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Ellipsis className="h-4 w-4 shrink-0 opacity-0 transition-opacity group-hover/view:opacity-100 group-data-[collapsible=icon]:hidden" />
                      </DropdownMenuTrigger>

                      <DropdownMenuContent
                        align="start"
                        className="w-48 p-2 rounded-2xl border shadow-lg"
                      >
                        <DropdownMenuItem
                          className={cn(
                            "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                          )}
                        >
                          <Share className="h-4 w-4 shrink-0" />
                          <span className="text-sm">Share</span>
                        </DropdownMenuItem>

                        <DropdownMenuItem
                          className={cn(
                            "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                          )}
                        >
                          <Edit className="h-4 w-4 shrink-0" />
                          <span className="text-sm">Rename</span>
                        </DropdownMenuItem>

                        <Separator className="my-2" />

                        <DropdownMenuItem
                          className={cn(
                            "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                          )}
                        >
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

        {/* Premium Credits Display */}
        <div className={cn("px-3 pb-2", isCollapsed && "px-2")}>
          <PremiumCredits collapsed={isCollapsed} />
        </div>

        <SidebarFooter
          onClick={handleFooterClick}
          className={cn("p-3 pt-0", isCollapsed && "px-2")}
        >
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                className="w-full cursor-pointer flex items-center justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              >
                {isAuthenticated && user ? (
                  <>
                    {user.picture ? (
                      <img
                        src={user.picture}
                        alt={user.name}
                        className="h-8 w-8 shrink-0 rounded-full"
                      />
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                        <User2 className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex flex-col gap-1 text-left overflow-hidden group-data-[collapsible=icon]:hidden">
                      <span className="text-sm font-medium leading-none text-foreground whitespace-nowrap">
                        {user.name}
                      </span>
                      <span className="text-xs leading-none truncate text-muted-foreground whitespace-nowrap">
                        {user.email}
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
                      <LogIn className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-col gap-1 text-left overflow-hidden group-data-[collapsible=icon]:hidden">
                      <span className="text-sm font-medium leading-none text-foreground whitespace-nowrap">
                        Sign in
                      </span>
                      <span className="text-xs leading-none truncate text-muted-foreground whitespace-nowrap">
                        Sync settings and usage
                      </span>
                    </div>
                  </>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SettingsDialog open={isSettingsOpen} setOpen={setSettingsOpen} />
    </>
  );
}

export default LeftSidebar;
