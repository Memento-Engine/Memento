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
import { GeistSans } from "geist/font/sans";
import { Toaster } from "sonner";
import DraggableCaptureAgent from "@/components/DraggableCaptureAgent";
import SystemHealthProvider from "@/providers/SystemHealthProvider";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${GeistSans.className} ${GeistSans.variable} antialiased`}
    >
      <body className="bg-background text-foreground">
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "rounded-xl border text-sm font-medium shadow-lg",
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
        <div className="flex h-screen w-screen ">
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
