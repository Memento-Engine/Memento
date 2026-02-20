import localFont from "next/font/local";

export const inter = localFont({
  src: [
    {
      // Note the /inter/ subfolder here
      path: "../public/fonts/inter/Inter_18pt-Regular.ttf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/inter/Inter_18pt-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-inter",
});

export const studioFeixen = localFont({
  src: [
    {
      // These are directly in /fonts/
      path: "../public/fonts/StudioFeixenSans-Regular.otf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-feixen",
});