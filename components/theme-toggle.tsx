"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON = "absolute h-4 w-4 transition-[transform,opacity] duration-300 ease-out-strong";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  if (!mounted) return <Button variant="outline" size="icon" disabled className={className} />;

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("relative overflow-hidden", className)}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      <Sun className={cn(ICON, isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0")} />
      <Moon className={cn(ICON, isDark ? "rotate-90 scale-50 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </Button>
  );
}
