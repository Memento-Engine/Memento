"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  Brain,
  Settings,
  Play,
  Square,
  Activity,
  AlertTriangle,
  Database,
  GripHorizontal,
  Loader2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import useSystemHealth from "@/hooks/useSystemHealth";

type EngineStatus = "running" | "stopped" | "error";

export default function DraggableCaptureAgent() {
  const { isRunning, isMementoDaemonLoading, startMementoDaemon, stopMementoDaemon } =
    useSystemHealth();

  const [isCapturing, setIsCapturing] = useState(false);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("running");
  const [errorMessage, setErrorMessage] = useState("");

  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  const dragStartPos = useRef({ x: 0, y: 0 });
  const mouseStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  useEffect((): void => {
    if (isRunning) {
      setEngineStatus("running");
    } else {
      setEngineStatus("stopped");
    }

    setIsCapturing(isRunning);
  }, [isRunning]);

  useEffect(() => {
    setIsMounted(true);
    const padding = 24;
    setPosition({
      x: window.innerWidth - 60 - padding,
      y: window.innerHeight - 60 - padding,
    });

    const handleResize = () => {
      setPosition((prev) => {
        const x =
          prev.x > window.innerWidth / 2
            ? window.innerWidth - 60 - padding
            : padding;
        const y =
          prev.y > window.innerHeight / 2
            ? window.innerHeight - 60 - padding
            : padding;
        return { x, y };
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStartPos.current = position;
    mouseStartPos.current = { x: e.clientX, y: e.clientY };
    hasMoved.current = false;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const dx = e.clientX - mouseStartPos.current.x;
    const dy = e.clientY - mouseStartPos.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved.current = true;
      if (isOpen) setIsOpen(false);
    }

    setPosition({
      x: dragStartPos.current.x + dx,
      y: dragStartPos.current.y + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);

    if (hasMoved.current) {
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const widgetSize = 48;
      const padding = 24;

      const snapX =
        position.x < windowWidth / 2
          ? padding
          : windowWidth - widgetSize - padding;
      const snapY =
        position.y < windowHeight / 2
          ? padding
          : windowHeight - widgetSize - padding;

      setPosition({ x: snapX, y: snapY });
    }
  };

  if (!isMounted) return null;

  const toggleCapture = () => setIsCapturing(!isCapturing);

  const clearError = () => {
    setEngineStatus("running");
    setErrorMessage("");
    setIsCapturing(true);
  };

  const renderCaptureStateLoading = (): React.ReactElement => {
    console.log("renderCaptureStateLoading rendered");
    if (isMementoDaemonLoading) {
      return (
        <DropdownMenuItem
          onClick={toggleCapture}
          disabled={engineStatus === "error"}
          className="flex items-center cursor-pointer justify-between px-3 py-2 text-sm rounded-md hover:bg-muted"
        >
          <span>Loading</span>
          <Loader2 className="h-4 w-4 text-muted-foreground fill-current animate-spin" />
        </DropdownMenuItem>
      );
    }
    if (isCapturing) {
      return (
        <DropdownMenuItem
           onSelect={(e) => {
            console.log("Start Daemon command hitted");
            e.preventDefault();
            e.stopPropagation();
            stopMementoDaemon();
          }}
          disabled={engineStatus === "error"}
          className="flex items-center cursor-pointer justify-between px-3 py-2 text-sm rounded-md hover:bg-muted"
        >
          <span>Pause Capturing</span>
          <Square className="h-4 w-4  text-muted-foreground fill-current" />
        </DropdownMenuItem>
      );
    } else {
      console.log("About to render Resume Capturing");

      return (
        <DropdownMenuItem
          onSelect={(e) => {
            console.log("Start Daemon command hitted");
            e.preventDefault();
            e.stopPropagation();
            startMementoDaemon();
          }}
          className="flex items-center cursor-pointer justify-between px-3 py-2 text-sm rounded-md hover:bg-muted"
        >
          <span>Resume Capturing</span>
          <Play className="h-4 w-4 text-muted-foreground fill-current" />
        </DropdownMenuItem>
      );
    }

    return <></>;
  };

  return (
    <div
      className={`fixed z-[9999] ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      } ${!isDragging ? "transition-all duration-300 ease-out" : ""}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: "none",
      }}
      // onPointerDown={handlePointerDown}
      // onPointerMove={handlePointerMove}
      // onPointerUp={handlePointerUp}
    >
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <div className="relative group">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full h-12 w-12 shadow-md bg-card border-border text-foreground hover:bg-muted"
            >
              <span className="cursor-pointer text-base flex shrink-0 items-center">
                <Image
                  src="/blackLogo.svg"
                  alt="logo"
                  className="dark:invert shrink-0"
                  width={40}
                  height={40}
                />
              </span>
              {/* <Brain
                className={`h-6 w-6 transition-colors ${
                  engineStatus === "error"
                    ? "text-destructive"
                    : isCapturing
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              /> */}
            </Button>

            <div className="absolute -top-1 -right-1 opacity-0 group-hover:opacity-100 transition-opacity bg-muted rounded-full p-1 border border-border shadow-sm">
              <GripHorizontal className="h-3 w-3 text-muted-foreground" />
            </div>
          </div>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          sideOffset={12}
          className="w-[240px] rounded-xl bg-popover text-popover-foreground border-border shadow-md p-1"
        >
          {/* Status */}
          <div className="flex items-center justify-between px-3  py-2 text-sm rounded-md hover:bg-muted/20">
            <span>Brain Status</span>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              {engineStatus === "running" && (
                <>
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  Running
                </>
              )}
              {engineStatus === "stopped" && (
                <>
                  <Square className="h-3.5 w-3.5 text-muted-foreground" />
                  Offline
                </>
              )}
              {engineStatus === "error" && (
                <>
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  Fault
                </>
              )}
            </div>
          </div>

          {/* Capture */}
          <div className="flex items-center justify-between px-3 py-2  text-sm rounded-md hover:bg-muted/20">
            <span>Memory Capture</span>
            <span className="text-muted-foreground">
              {isCapturing ? "Active" : "Paused"}
            </span>
          </div>

          <DropdownMenuItem className="flex items-center justify-between cursor-pointer px-3 py-2 text-sm rounded-md hover:bg-muted/90">
            <span>Database Info</span>
            <Database className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>

          {engineStatus === "error" && (
            <div className="mx-1 my-1 px-3 py-2.5 text-xs flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-lg text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-1">
                <span className="font-semibold">Pipeline Error</span>
                <span className="opacity-80">{errorMessage}</span>
                <button
                  onClick={clearError}
                  className="underline underline-offset-2 hover:opacity-80 mt-1 w-max"
                >
                  Restart Engine
                </button>
              </div>
            </div>
          )}

          <DropdownMenuSeparator />

          {renderCaptureStateLoading()}

          <DropdownMenuSeparator />

          <DropdownMenuItem className="flex items-center justify-between px-3 py-2 text-sm rounded-md text-primary hover:bg-muted">
            <span>Preferences</span>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
