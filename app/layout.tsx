import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Analytics } from "@vercel/analytics/next";

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
          <header className="w-full flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            <div className="text-left min-w-0 flex-1">
              <div className="flex items-center gap-2 sm:gap-2.5">
                <div className="w-7 h-7 bg-primary text-primary-foreground flex items-center justify-center rounded-md font-bold text-sm shadow-sm shrink-0">
                  C
                </div>
                <span className="font-mono font-bold text-[15px] sm:text-base text-foreground tracking-tight truncate">CodeClip</span>
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 leading-tight line-clamp-1 sm:line-clamp-none truncate pr-2">
                Share text &amp; files securely — access any clip with its code.
              </p>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10" asChild>
                <a href="https://github.com/himanshu-khairnar/codeclip" target="_blank" rel="noopener noreferrer" aria-label="GitHub repository">
                  <Github className="h-4 w-4" />
                </a>
              </Button>
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 flex flex-col">
            {children}
          </main>
          <Toaster />
          <Analytics />
        </ThemeProvider>
      </body>
    </html>
  );
}
