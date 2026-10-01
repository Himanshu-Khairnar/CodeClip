import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  titleClassName?: string;
  contentClassName?: string;
}

/** Standard card section used across home + clip pages. */
export function Panel({
  title,
  description,
  icon,
  actions,
  children,
  className,
  titleClassName,
  contentClassName,
}: PanelProps) {
  return (
    <Card className={cn("w-full rounded-xl border-border shadow-sm", className)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className={cn("flex items-center gap-2 text-base", titleClassName)}>
            {icon}
            {title}
          </CardTitle>
          {actions}
        </div>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className={cn("space-y-3", contentClassName)}>{children}</CardContent>
    </Card>
  );
}

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

/** Label + control block with consistent spacing. */
export function Field({ label, htmlFor, children, className, labelClassName }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} className={cn("text-xs", labelClassName)}>
        {label}
      </Label>
      {children}
    </div>
  );
}
