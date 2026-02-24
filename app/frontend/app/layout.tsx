"use client";
import type { Metadata } from "next";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import Nothing from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { inter, studioFeixen } from "@/styles/font";
import ReferenceProvider from "@/providers/ReferenceProvider";
import RightSidebar, { MetaRow } from "@/components/layout/Rightbar";
import useReferenceContext from "@/hooks/useReferenceContext";

// export const metadata: Metadata = {
//   title: "Memento AI",
//   description: "Memory Search Engine",
// };

import { JetBrains_Mono } from "next/font/google";
import KeyboardProvider from "@/providers/KeyboardProvider";
import ChatProvider from "@/providers/ChatProvider";
import LeftSidebar from "@/components/layout/Sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Separator } from "@/components/ui/separator";
import { renderDate } from "@/lib/utils";

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
        <ChatProvider>
          <ReferenceProvider>
            <LayoutContent>{children}</LayoutContent>
          </ReferenceProvider>
        </ChatProvider>
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
        <div className="flex h-screen w-screen overflow-hidden">
          <LeftSidebar />

          <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
            <div className="flex-1 overflow-y-auto">{children}</div>
          </main>

          {/* Right side */}
          {referenceMeta && <RightSidebar />}
        </div>
      </ThemeProvider>
    </SidebarProvider>
  );
}
