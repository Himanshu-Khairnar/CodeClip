"use client";

import { cn } from "@/lib/utils";

interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}

/** Equal-width segmented control with a pill that slides to the active option. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
  itemClassName,
  ariaLabel,
}: SegmentedProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("relative grid rounded-md border border-border bg-muted/50 p-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-[5px] border border-primary/40 bg-primary/10 transition-transform duration-250 ease-out-strong"
        style={{
          width: `calc((100% - 4px) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "relative z-10 rounded-[5px] px-3 text-[13px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              active ? "text-primary" : "text-muted-foreground hover:text-foreground",
              itemClassName
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
