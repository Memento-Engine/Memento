"use client";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import { SidebarProvider } from "@/components/ui/sidebar";
import ReferenceProvider from "@/providers/ReferenceProvider";
import RightSidebar from "@/components/layout/Rightbar";
import useReferenceContext from "@/hooks/useReferenceContext";
import KeyboardProvider from "@/providers/KeyboardProvider";
import ChatProvider from "@/providers/ChatProvider";
import LeftSidebar from "@/components/layout/Sidebar";
import { Toaster } from "sonner";
import DraggableCaptureAgent from "@/components/DraggableCaptureAgent";
import SystemHealthProvider from "@/providers/SystemHealthProvider";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${inter.variable} antialiased`}
    >
      <body className="bg-background text-foreground">
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "rounded-lg border border-border bg-card text-sm font-medium text-card-foreground shadow-md",
          }}
        />

        <SystemHealthProvider>
          <ChatProvider>
            <ReferenceProvider>
              <LayoutContent>{children}</LayoutContent>
              <DraggableCaptureAgent />
            </ReferenceProvider>
          </ChatProvider>
        </SystemHealthProvider>
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
        <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-background">
          <LeftSidebar />

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
            <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
          </main>

          {/* Right side */}
          {/* {referenceMeta && <RightSidebar />}
           */}
           <RightSidebar />
        </div>
      </ThemeProvider>
    </SidebarProvider>
  );
}
