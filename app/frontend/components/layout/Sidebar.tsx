"use client";

import {
  Delete,
  Ellipsis,
  LogIn,
  Menu,
  MoreHorizontal,
  PanelLeft,
  PencilLine,
  Pin,
  PinOff,
  Search,
  Share2,
  SquarePen,
  Trash2,
  TriangleAlert,
  User2,
  X,
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

import { useRouter } from "next/navigation";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { cn } from "@/lib/utils";
import { SettingsDialog } from "../settingsDialog";
import { useCallback, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { Skeleton } from "../ui/skeleton";
import { Button } from "../ui/button";
import { MementoLogo } from "../Logo";
import { PremiumCredits } from "../PremiumCredits";
import useAuth from "@/hooks/useAuth";
import useChatContext from "@/hooks/useChatContext";
import { openChatSearchDialog } from "@/lib/chatSearch";
import { notify } from "@/lib/notify";
import {
  ChatSessionRow,
  deleteChatSession,
  listChatSessions,
  pinChatSession,
  renameChatSession,
} from "@/api/messages";

function LeftSidebar(): React.ReactElement {
  const { toggleSidebar, state, isMobile, openMobile, setOpenMobile } =
    useSidebar();
  const [isSettingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [isLoadingChats, setIsLoadingChats] = useState<boolean>(false);
  const [isDeletingChat, setIsDeletingChat] = useState<boolean>(false);
  const [isRenamingChat, setIsRenamingChat] = useState<boolean>(false);
  const [chatSessions, setChatSessions] = useState<ChatSessionRow[]>([]);
  const [chatPendingDelete, setChatPendingDelete] =
    useState<ChatSessionRow | null>(null);
  const [chatPendingRename, setChatPendingRename] =
    useState<ChatSessionRow | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const { user, isAuthenticated } = useAuth();
  const { chatId, messages, openChat, startNewChat } = useChatContext();
  const router = useRouter();
  const isCollapsed = state === "collapsed";

  const goToHome = (): void => {
    if (isMobile) {
      setOpenMobile(false);
    }
    startNewChat();
    router.push("/", { scroll: false });
  };

  const handleFooterClick = (): void => {
    setSettingsOpen(true);
  };

  const closeOverlayIfMobile = (): void => {
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  const refreshChats = useCallback(async () => {
    setIsLoadingChats(true);
    try {
      const rows = await listChatSessions(200);
      setChatSessions(rows);
    } catch (error) {
      console.error("Failed to load chat sessions:", error);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

  useEffect(() => {
    void refreshChats();
  }, [refreshChats]);

  // Debounce refreshing chat list when session/messages change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void refreshChats();
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [chatId, messages.length, refreshChats]);

  const filteredSessions = chatSessions.filter((session) =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleRename = (session: ChatSessionRow): void => {
    setChatPendingRename(session);
    setRenameValue(session.title);
  };

  const handleRenameConfirmed = async (): Promise<void> => {
    if (!chatPendingRename) {
      return;
    }

    const nextTitle = renameValue.trim();
    if (!nextTitle || nextTitle === chatPendingRename.title) {
      setChatPendingRename(null);
      return;
    }

    setIsRenamingChat(true);

    const ok = await renameChatSession(chatPendingRename.session_id, nextTitle);
    if (!ok) {
      setIsRenamingChat(false);
      notify.error("Failed to rename chat");
      return;
    }

    notify.success("Chat renamed");
    setChatPendingRename(null);
    setIsRenamingChat(false);
    await refreshChats();
  };

  const handlePinToggle = async (session: ChatSessionRow) => {
    const ok = await pinChatSession(session.session_id, !session.pinned);
    if (!ok) {
      notify.error("Failed to update pin");
      return;
    }

    notify.success(session.pinned ? "Chat unpinned" : "Chat pinned");
    await refreshChats();
  };

  const handleDelete = (session: ChatSessionRow): void => {
    setChatPendingDelete(session);
  };

  const handleDeleteConfirmed = async (): Promise<void> => {
    if (!chatPendingDelete) {
      return;
    }

    setIsDeletingChat(true);

    const ok = await deleteChatSession(chatPendingDelete.session_id);
    if (!ok) {
      setIsDeletingChat(false);
      notify.error("Failed to delete chat");
      return;
    }

    notify.success("Chat deleted");
    if (chatId === chatPendingDelete.session_id) {
      startNewChat();
      router.push("/", { scroll: false });
    }
    closeOverlayIfMobile();
    setChatPendingDelete(null);
    setIsDeletingChat(false);
    await refreshChats();
  };

  const handleShare = async (session: ChatSessionRow) => {
    try {
      const shareLink = `${window.location.origin}/chat?session=${encodeURIComponent(session.session_id)}`;
      await navigator.clipboard.writeText(shareLink);
      notify.success("Share link copied");
    } catch (error) {
      console.error("Failed to copy share link:", error);
      notify.error("Failed to copy share link");
    }
  };

  const renderSidebarChatSkeletons = () =>
    Array.from({ length: 6 }).map((_, index) => (
      <SidebarMenuItem
        className="list-none px-3 py-2"
        key={`chat-skeleton-${index}`}
      >
        <div className="flex items-center justify-between rounded-lg px-1 py-1">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-[82%] rounded-sm" />
            <Skeleton className="h-3 w-[46%] rounded-sm" />
          </div>
          <Skeleton className="ml-3 h-4 w-4 rounded-full" />
        </div>
      </SidebarMenuItem>
    ));

  return (
    <>
      {isMobile && !openMobile && (
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open sidebar"
          className="fixed left-3 top-3 z-50 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 bg-background/95 text-foreground shadow-lg backdrop-blur-md transition-all hover:bg-muted hover:shadow-xl active:scale-95 supports-[backdrop-filter]:bg-background/80"
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      <Sidebar
        collapsible="icon"
        className={cn(
          "z-10 shrink-0 flex flex-col overflow-hidden bg-sidebar transition-all duration-300",
          !isMobile && "m-4 h-[calc(100vh-2rem)] rounded-xl border"
        )}
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
              onClick={isMobile ? undefined : toggleSidebar}
              className={cn(
                "text-base flex shrink-0 items-center",
                !isMobile && "cursor-pointer"
              )}
            >
              <MementoLogo size={40} />
            </span>
            {!isCollapsed && (
              isMobile ? (
                <button
                  type="button"
                  onClick={() => setOpenMobile(false)}
                  aria-label="Close sidebar"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </button>
              ) : (
                <PanelLeft
                  onClick={toggleSidebar}
                  size={18}
                  className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
                />
              )
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
                onClick={() => {
                  openChatSearchDialog();
                  closeOverlayIfMobile();
                }}
                className="w-full text-muted-foreground flex items-center cursor-pointer justify-start px-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
              >
                <Search className="h-5 w-5 shrink-0" />
                <span className="ml-2 flex w-full min-w-0 items-center justify-between overflow-hidden group-data-[collapsible=icon]:hidden">
                  <span className="text-sm whitespace-nowrap">
                    Search chats
                  </span>
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
              {/* {isLoadingChats && renderSidebarChatSkeletons()} */}

              {!isLoadingChats && filteredSessions.length === 0 && (
                <SidebarMenuItem className="list-none px-3 py-2 text-xs text-muted-foreground/60">
                  No chats yet
                </SidebarMenuItem>
              )}

              {filteredSessions.map((session: ChatSessionRow) => {
                const isActive = session.session_id === chatId;
                return (
                  <SidebarMenuItem
                    className="group/view list-none"
                    key={session.session_id}
                  >
                    <SidebarMenuButton
                      variant="default"
                      onClick={() => {
                        closeOverlayIfMobile();
                        void openChat(session.session_id);
                      }}
                      className="
                    w-full
                    flex
                    items-center
                    text-muted-foreground
                    justify-between
                    cursor-pointer
                    px-3
                    hover:bg-muted/70
                    data-[active=true]:bg-muted/80
                    data-[active=true]:text-foreground
                    group-data-[collapsible=icon]:justify-center
                    group-data-[collapsible=icon]:px-0
                    "
                      data-active={isActive}
                    >
                      <div className="flex min-w-0 items-center gap-2 group-data-[collapsible=icon]:hidden">
                        <span className="truncate text-sm">
                          {session.title}
                        </span>

                        {session.pinned && (
                          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <Pin className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label="Chat actions"
                            className="inline-flex cursor-pointer h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-0 transition-all hover:bg-muted/80 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/view:opacity-100 group-data-[collapsible=icon]:hidden"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </DropdownMenuTrigger>

                        <DropdownMenuContent
                          align="start"
                          className="w-48 p-2 rounded-2xl border shadow-lg"
                        >
                          <DropdownMenuItem
                            onClick={() => void handleShare(session)}
                            className={cn(
                              "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                            )}
                          >
                            <Share2 className="h-4 w-4 shrink-0" />
                            <span className="text-sm">Share</span>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => handleRename(session)}
                            className={cn(
                              "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                            )}
                          >
                            <PencilLine className="h-4 w-4 shrink-0" />
                            <span className="text-sm">Rename</span>
                          </DropdownMenuItem>

                          <Separator className="my-2" />

                          <DropdownMenuItem
                            onClick={() => void handlePinToggle(session)}
                            className={cn(
                              "flex items-center gap-3 px-2 py-2 rounded-lg cursor-pointer hover:bg-muted transition",
                            )}
                          >
                            {session.pinned ? (
                              <PinOff className="h-4 w-4 shrink-0" />
                            ) : (
                              <Pin className="h-4 w-4 shrink-0" />
                            )}
                            <span className="text-sm">
                              {session.pinned ? "Unpin" : "Pin"}
                            </span>
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => handleDelete(session)}
                            className="flex items-center cursor-pointer gap-3 px-2 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition"
                          >
                            <Trash2 className="h-4 w-4 shrink-0" />
                            <span className="text-sm">Delete</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        </SidebarContent>

        {/* Premium Credits Display */}
        <div className={cn("px-3 pb-2", isCollapsed && "px-2")}>
          <PremiumCredits collapsed={isCollapsed} />
        </div>

        <SidebarFooter
          onClick={handleFooterClick}
          className={cn("px-3 pb-3", isCollapsed && "px-2")}
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
      <Dialog
        open={chatPendingRename !== null}
        onOpenChange={(open) => {
          if (!open && !isRenamingChat) {
            setChatPendingRename(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent className="border-border/60 bg-background/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:max-w-md sm:rounded-2xl">
          <DialogHeader className="gap-3 text-left">
            <DialogTitle className="flex items-center gap-3 text-base font-semibold text-foreground sm:text-lg">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted text-foreground">
                <PencilLine className="h-5 w-5" />
              </span>
              Rename chat
            </DialogTitle>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameConfirmed();
            }}
          >
            <Input
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Enter chat title"
              autoFocus
              maxLength={120}
              className="border-border/60 bg-background"
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isRenamingChat}
                onClick={() => {
                  setChatPendingRename(null);
                  setRenameValue("");
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isRenamingChat || !renameValue.trim()}
              >
                {isRenamingChat ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmationDialog
        open={chatPendingDelete !== null}
        onOpenChange={(open: boolean) => {
          if (!open && !isDeletingChat) {
            setChatPendingDelete(null);
          }
        }}
        title="Delete chat?"
        description={
          chatPendingDelete ? (
            <>
              This will permanently delete{" "}
              <span className="font-medium text-foreground">
                {chatPendingDelete.title}
              </span>
              . This action cannot be undone.
            </>
          ) : (
            "This action cannot be undone."
          )
        }
        confirmLabel={isDeletingChat ? "Deleting..." : "Delete"}
        cancelLabel="Cancel"
        onConfirm={handleDeleteConfirmed}
        isPending={isDeletingChat}
        tone="destructive"
        icon={<TriangleAlert className="h-5 w-5" />}
      />
    </>
  );
}

export default LeftSidebar;
