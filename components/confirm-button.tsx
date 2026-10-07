"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  onConfirm: () => void;
  children: ReactNode;
  /** Content shown while waiting for the second click. */
  confirmLabel?: ReactNode;
  disabled?: boolean;
  className?: string;
  armedClassName?: string;
  title?: string;
  size?: "sm" | "default" | "icon";
}

/**
 * Two-step destructive button: first click arms it, second click within
 * 3s confirms. Replaces blocking `window.confirm()` dialogs.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm?",
  disabled,
  className,
  armedClassName,
  title,
  size = "sm",
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const handleClick = () => {
    if (timer.current) clearTimeout(timer.current);
    if (armed) {
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), 3000);
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      title={armed ? "Click again to confirm" : title}
      disabled={disabled}
      onClick={handleClick}
      onBlur={() => setArmed(false)}
      className={cn(
        "text-destructive hover:text-destructive hover:bg-destructive/10",
        armed && cn("bg-destructive text-white hover:bg-destructive/90 hover:text-white", armedClassName),
        className
      )}
    >
      <span key={armed ? "armed" : "idle"} className="inline-flex items-center gap-1.5 animate-fade">
        {armed ? confirmLabel : children}
      </span>
    </Button>
  );
}
