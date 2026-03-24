"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isPending?: boolean;
  tone?: "default" | "destructive";
  icon?: React.ReactNode;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  isPending = false,
  tone = "default",
  icon,
}: ConfirmationDialogProps): React.ReactElement {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="border-border/60 bg-background/95 shadow-2xl backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:rounded-2xl">
        <AlertDialogHeader className="gap-3 text-left">
          <AlertDialogTitle className="flex items-center gap-3 text-base font-semibold text-foreground sm:text-lg">
            {icon ? (
              <span
                className={cn(
                  "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
                  tone === "destructive"
                    ? "border-destructive/20 bg-destructive/10 text-destructive"
                    : "border-border/60 bg-muted text-foreground",
                )}
              >
                {icon}
              </span>
            ) : null}
            <span>{title}</span>
          </AlertDialogTitle>
          <AlertDialogDescription className="pl-0 text-sm leading-6 text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isPending} className="border-border/60">
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={isPending}
            onClick={() => {
              void onConfirm();
            }}
            className={cn(
              tone === "destructive" &&
                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            )}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}