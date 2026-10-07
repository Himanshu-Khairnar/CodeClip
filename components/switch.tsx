"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SwitchRowProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/** Full-width toggle row: label/description on the left, switch on the right. */
export function SwitchRow({ checked, onChange, label, description, icon, className }: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left outline-none transition-[border-color,background-color,transform] duration-150 ease-out active:scale-[0.99] focus-visible:ring-[3px] focus-visible:ring-ring/50",
        checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/50",
        className
      )}
    >
      {icon && (
        <span className={cn("shrink-0 transition-colors duration-150", checked ? "text-primary" : "text-muted-foreground")}>
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">{label}</span>
        {description && <span className="block text-[11px] text-muted-foreground">{description}</span>}
      </span>
      <span
        aria-hidden
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-out",
          checked ? "bg-primary" : "bg-input"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-250 ease-out-strong",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </span>
    </button>
  );
}
