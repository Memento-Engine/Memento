import { toast } from "sonner";

const base =
  "max-w-[380px] flex items-center gap-3 rounded-xl border px-4 py-3 text-[13px] font-medium shadow-lg backdrop-blur-md";

export const notify = {
  success: (message: string) =>
    toast.success(message, {
      unstyled: true,
      className: `${base}
      border-emerald-400/30
      bg-emerald-400/10
      text-emerald-700
      dark:text-emerald-300`,
    }),

  error: (message: string) =>
    toast.error(message, {
      unstyled: true,
      className: `${base}
      border-red-400/30
      bg-red-400/10
      text-red-700
      dark:text-red-300`,
    }),

  warning: (message: string) =>
    toast.warning(message, {
      unstyled: true,
      className: `${base}
      border-amber-400/30
      bg-amber-400/10
      text-amber-700
      dark:text-amber-300`,
    }),

  info: (message: string) =>
    toast(message, {
      unstyled: true,
      className: `${base}
      border-primary/30
      bg-primary/10
      text-primary
      dark:text-primary`,
    }),
};