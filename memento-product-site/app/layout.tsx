import type { Metadata } from "next";
import "./globals.css";

import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Memento AI — Where memories become knowledge",
  description: "A personal AI search engine that captures your screen activity, extracts text with OCR, and answers your questions using retrieval-augmented generation. Local-first, privacy-focused.",
  keywords: ["AI", "personal search engine", "memory", "local-first", "privacy", "OCR", "RAG", "Windows"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
