"use client";
import "./globals.css";

import { ThemeProvider } from "next-themes";
import { SidebarProvider } from "@/components/ui/sidebar";
import ReferenceProvider from "@/providers/ReferenceProvider";
import RightSidebar from "@/components/layout/Rightbar";
import KeyboardProvider from "@/providers/KeyboardProvider";
import ChatProvider from "@/providers/ChatProvider";
import LeftSidebar from "@/components/layout/Sidebar";
import ChatSearchDialog from "@/components/layout/ChatSearchDialog";
import { Toaster } from "sonner";
import SystemHealthProvider from "@/providers/SystemHealthProvider";
import CreditsProvider from "@/providers/CreditsProvider";
import AuthProvider from "@/providers/AuthProvider";
import type { Metadata } from "next";

import { Inter } from "next/font/google";
import React, { useEffect } from "react";
import useOnboarding from "@/hooks/useOnboarding";
import OnboardingProvider from "@/providers/OnBoardingProvider";
import { useRouter } from "next/navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const metadata: Metadata = {
  title: "Memento AI — Where memories become knowledge",
  description: "A personal AI search engine that captures your screen activity, extracts text with OCR, and answers your questions using retrieval-augmented generation. Local-first, privacy-focused.",
  keywords: ["AI", "personal search engine", "memory", "local-first", "privacy", "OCR", "RAG", "Windows"],
  icons : {
    icon: "/logo.png",
  }
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
          defaultTheme="dark"
          enableSystem={false}
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

  useEffect(() => {
    if (!isOnboardingComplete) {
      router.push("/onboarding");
    } else {
      router.push("/");
    }
  }, [isOnboardingComplete, router]);

  if (!isOnboardingComplete) {
    return <>{children}</>;
  }

  return (
    <SystemHealthProvider>
      <CreditsProvider>
        <ChatProvider>
          <ReferenceProvider>
            <SidebarProvider>
              <KeyboardProvider />
              <ChatSearchDialog />

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
    </SystemHealthProvider>
  );
}
