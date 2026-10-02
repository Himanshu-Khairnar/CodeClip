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
          <main className="flex-1 flex flex-col min-w-0 overflow-x-clip">
            {children}
          </main>
          <footer>
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-2 sm:px-6">
              <div className="flex items-center gap-2 min-w-0">
                <Image
                  src="/logo.svg"
                  alt="CodeClip logo"
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-md shadow-sm shrink-0"
                />
                <span className="font-mono text-xs font-bold tracking-wide truncate">CodeClip</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-md" asChild>
                  <a href="https://github.com/himanshu-khairnar/codeclip" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                    <Github className="h-4 w-4" />
                  </a>
                </Button>
                <ThemeToggle className="h-8 w-8 rounded-md" />
              </div>
            </div>
          </footer>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
