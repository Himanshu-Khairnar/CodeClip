"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ICON_SWAP =
  "absolute inset-0 m-auto transition-[opacity,transform,filter] duration-200 ease-out";

/** Copy icon that crossfades into a check for ~1.5s after copying. */
export function CopyIcon({ copied, className }: { copied: boolean; className?: string }) {
  return (
    <span className={cn("relative inline-flex size-3.5 shrink-0", className)}>
      <Copy
        className={cn(ICON_SWAP, "size-full", copied && "scale-50 opacity-0 blur-[2px]")}
      />
      <Check
        className={cn(ICON_SWAP, "size-full text-emerald-500", !copied && "scale-50 opacity-0 blur-[2px]")}
      />
    </span>
  );
}

export function useCopy(resetMs = 1500) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const copy = async (value: string, successMessage?: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      toast.error("Couldn't access the clipboard");
      return;
    }
    if (successMessage) toast.success(successMessage);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), resetMs);
  };

  return { copied, copy };
}

interface CopyButtonProps {
  value: string;
  successMessage?: string;
  className?: string;
  iconClassName?: string;
  title?: string;
  /** Optional text label shown next to the icon. */
  children?: ReactNode;
  variant?: "ghost" | "outline";
  size?: "icon" | "sm";
}

export function CopyButton({
  value,
  successMessage,
  className,
  iconClassName,
  title = "Copy",
  children,
  variant = "ghost",
  size = "icon",
}: CopyButtonProps) {
  const { copied, copy } = useCopy();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      title={title}
      aria-label={copied ? "Copied" : title}
      onClick={(e) => {
        e.stopPropagation();
        copy(value, successMessage);
      }}
      className={cn("shrink-0", className)}
    >
      <CopyIcon copied={copied} className={iconClassName} />
      {children}
    </Button>
  );
}
