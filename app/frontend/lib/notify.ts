import { toast } from "sonner";

const baseStyle =
  "rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-card-foreground shadow-md";

export const notify = {
  success: (message: string) =>
    toast.success(message, {
      className: baseStyle,
    }),

  error: (message: string) =>
    toast.error(message, {
      className: `${baseStyle} bg-destructive/10 text-destructive border-destructive/30`,
    }),

  warning: (message: string) =>
    toast.warning(message, {
      className: `${baseStyle} bg-muted text-muted-foreground`,
    }),

  info: (message: string) =>
    toast(message, {
      className: baseStyle,
    }),
};