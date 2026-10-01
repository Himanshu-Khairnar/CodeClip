"use client";

import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

function copyValue(value: string, successMessage: string) {
  navigator.clipboard.writeText(value);
  toast.success(successMessage);
}

interface CodeBadgeProps {
  code: string;
  className?: string;
  successMessage?: string;
}

/** Tinted access-code pill with a copy button. */
export function CodeBadge({ code, className, successMessage = "Code copied to clipboard!" }: CodeBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5",
        className
      )}
    >
      <span className="min-w-0 flex-1 truncate text-center font-mono text-base font-bold tracking-[0.2em] text-primary sm:text-lg sm:tracking-[0.3em]">
        {code}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        title="Copy code"
        onClick={() => copyValue(code, successMessage)}
      >
        <Copy className="h-3.5 w-3.5 text-primary" />
      </Button>
    </div>
  );
}

interface CopyRowProps {
  value: string;
  successMessage?: string;
  truncate?: boolean;
  className?: string;
  valueClassName?: string;
  buttonClassName?: string;
}

/** Muted value row (code / link) with a copy button. */
export function CopyRow({
  value,
  successMessage = "Copied to clipboard!",
  truncate = true,
  className,
  valueClassName,
  buttonClassName,
}: CopyRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-1.5 sm:px-3",
        className
      )}
    >
      <span className={cn("min-w-0 flex-1 font-mono", truncate ? "truncate" : "break-all", valueClassName)}>
        {value}
      </span>
      <Button
        variant="ghost"
        size="icon"
        title="Copy"
        onClick={() => copyValue(value, successMessage)}
        className={cn("h-7 w-7 shrink-0", buttonClassName)}
      >
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
