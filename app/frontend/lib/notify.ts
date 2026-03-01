import { toast } from "sonner";

const baseStyle =
  "rounded-xl border px-4 py-3 text-sm font-medium shadow-md";

export const notify = {
  success: (message: string) =>
    toast.success(message, {
      className: `${baseStyle} bg-emerald-600 text-white border-emerald-700`,
    }),

  error: (message: string) =>
    toast.error(message, {
      className: `${baseStyle} bg-red-600 text-white border-red-700`,
    }),

  warning: (message: string) =>
    toast.warning(message, {
      className: `${baseStyle} bg-amber-500 text-black border-amber-600`,
    }),

  info: (message: string) =>
    toast(message, {
      className: `${baseStyle} bg-blue-600 text-white border-blue-700`,
    }),
};