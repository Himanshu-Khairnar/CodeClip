import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";
import { Button } from "@/components/ui/button";
import { Github } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CodeClip - Secure Online Clipboard" ,
  description: "Share text and files securely in seconds with auto-destruct timers and password protection.",
  keywords: ["clipboard", "online clipboard", "share text", "share files", "secure clipboard", "code clip"],
  authors: [{ name: "Himanshu" }],
  openGraph: {
    title: "CodeClip - Secure Online Clipboard",
    description: "Share text and files securely in seconds with auto-destruct timers and password protection.",
    siteName: "CodeClip",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "CodeClip - Secure Online Clipboard",
    description: "Share text and files securely in seconds with auto-destruct timers and password protection.",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
           <div className="absolute top-4 right-4 flex gap-4">
        <Button variant="outline" size="icon" asChild>
          <a href="https://github.com/himanshu-khairnar/codeclip" target="_blank" rel="noopener noreferrer">
            <Github className="h-4 w-4" />
          </a>
        </Button>
        <ThemeToggle />
      </div>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
