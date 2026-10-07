"use client";

import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

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
      <CopyButton
        value={code}
        successMessage={successMessage}
        title="Copy code"
        className="h-6 w-6 text-primary"
      />
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
      <CopyButton value={value} successMessage={successMessage} className={cn("h-7 w-7", buttonClassName)} />
    </div>
  );
}
