import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Analytics } from "@vercel/analytics/next";
import Image from "next/image";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeClip - Secure Online Clipboard",
  description: "Share text and files securely in seconds with auto-destruct timers.",
  keywords: ["clipboard", "online clipboard", "share text", "share files", "secure clipboard", "code clip"],
  authors: [{ name: "Himanshu" }],
  openGraph: {
    title: "CodeClip - Secure Online Clipboard",
    description: "Share text and files securely in seconds with auto-destruct timers.",
    siteName: "CodeClip",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeClip - Secure Online Clipboard",
    description: "Share text and files securely in seconds with auto-destruct timers.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div
            className="z-50 fixed bottom-3 right-3 sm:bottom-4 sm:right-4 flex flex-row sm:flex-col items-center gap-1.5 sm:gap-3 rounded-full sm:rounded-2xl border border-border bg-card/85 px-2 py-1.5 sm:p-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70"
          >
            <Image
              src="/logo.svg"
              alt="CodeClip logo"
              width={28}
              height={28}
              className="h-6 w-6 sm:h-7 sm:w-7 rounded-md shadow-sm"
            />
            <div className="hidden sm:flex flex-col items-center font-mono font-bold text-sm text-foreground leading-tight" aria-label="CodeClip">
              <span>C</span>
              <span>o</span>
              <span>d</span>
              <span>e</span>
              <span>C</span>
              <span>l</span>
              <span>i</span>
              <span>p</span>
            </div>
            <Button variant="outline" size="icon" className="h-8 w-8 sm:h-10 sm:w-10 rounded-full sm:rounded-md" asChild>
              <a href="https://github.com/himanshu-khairnar/codeclip" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                <Github className="h-4 w-4" />
              </a>
            </Button>
            <ThemeToggle className="h-8 w-8 sm:h-10 sm:w-10 rounded-full sm:rounded-md" />
          </div>
          <main className="flex-1 flex flex-col min-w-0 overflow-x-clip pb-16 sm:pb-0">
            {children}
          </main>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
