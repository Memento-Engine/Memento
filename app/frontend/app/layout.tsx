"use client";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import { SidebarProvider } from "@/components/ui/sidebar";
import ReferenceProvider from "@/providers/ReferenceProvider";
import RightSidebar from "@/components/layout/Rightbar";
import KeyboardProvider from "@/providers/KeyboardProvider";
import ChatProvider from "@/providers/ChatProvider";
import LeftSidebar from "@/components/layout/Sidebar";
import EnhancedCommandPalette from "@/components/EnhancedCommandPalette";
import { Toaster } from "sonner";
import SystemHealthProvider from "@/providers/SystemHealthProvider";
import UpdateProvider from "@/providers/UpdateProvider";
import CreditsProvider from "@/providers/CreditsProvider";
import AuthProvider from "@/providers/AuthProvider";
import UpdateNotification from "@/components/UpdateNotification";
import OnboardingPage from "@/app/onboarding/page";
import type { Metadata } from "next";

import { Inter } from "next/font/google";
import React, { useEffect } from "react";
import useOnboarding from "@/hooks/useOnboarding";
import OnboardingProvider from "@/providers/OnBoardingProvider";
import { usePathname, useRouter } from "next/navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const metadata: Metadata = {
  title: "Memento AI — Where memories become knowledge",
  description:
    "A personal AI search engine that captures your screen activity, extracts text with OCR, and answers your questions using retrieval-augmented generation. Local-first, privacy-focused.",
  keywords: [
    "AI",
    "personal search engine",
    "memory",
    "local-first",
    "privacy",
    "OCR",
    "RAG",
    "Windows",
  ],
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.className} ${inter.variable} antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem={true}
        >
          <Toaster position="bottom-right" />
          <LayoutRoot>{children}</LayoutRoot>
        </ThemeProvider>
      </body>
    </html>
  );
}

function LayoutRoot({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <LayoutInner>{children}</LayoutInner>
      </OnboardingProvider>
    </AuthProvider>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { isOnboardingComplete } = useOnboarding();
  const router = useRouter();
  const pathname = usePathname();

  // Redirect away from /onboarding if already completed
  useEffect((): void => {
    if (isOnboardingComplete && pathname === "/onboarding") {
      router.push("/");
    }
  }, [isOnboardingComplete, router, pathname]);

  // Render onboarding directly - no routing needed, no blank page
  if (!isOnboardingComplete) {
    return (
      <div className="h-dvh w-full flex items-center justify-center">
        <OnboardingPage />
      </div>
    );
  }

  return (
    <SystemHealthProvider>
      <UpdateProvider>
        <CreditsProvider>
          <ChatProvider>
            <ReferenceProvider>
              <SidebarProvider>
                <KeyboardProvider />
                <EnhancedCommandPalette />
                <UpdateNotification />

                <div className="flex h-dvh w-full overflow-hidden bg-background">
                  <LeftSidebar />

                  <main className="flex flex-1 flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto">{children}</div>
                  </main>

                  <RightSidebar />
                </div>
              </SidebarProvider>
            </ReferenceProvider>
          </ChatProvider>
        </CreditsProvider>
      </UpdateProvider>
    </SystemHealthProvider>
  );
}
