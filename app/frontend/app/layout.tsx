"use client";
import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import Nothing from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { inter, studioFeixen } from "@/styles/font";
import ReferenceProvider from "@/providers/ReferenceProvider";
import RightSidebar from "@/components/layout/Rightbar";
import useReferenceContext from "@/hooks/useReferenceContext";

// export const metadata: Metadata = {
//   title: "Memento AI",
//   description: "Memory Search Engine",
// };

import { JetBrains_Mono } from "next/font/google";
import KeyboardProvider from "@/providers/KeyboardProvider";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono", // important for tailwind
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} ${studioFeixen.variable}`}
    >
      <body className="bg-background text-foreground">
        <ReferenceProvider>
          <LayoutContent>{children}</LayoutContent>
        </ReferenceProvider>
      </body>
    </html>
  );
}

function LayoutContent({ children }: { children: React.ReactNode }) {
  const { referenceMeta } = useReferenceContext();

  return (
    <SidebarProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
      >
        <KeyboardProvider />
        <div className="flex h-screen w-screen overflow-hidden ">
          <Nothing />

          <main className="flex-1 flex flex-col overflow-hidden bg-background">
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>

          {referenceMeta && <RightSidebar />}
        </div>
      </ThemeProvider>
    </SidebarProvider>
  );
}
