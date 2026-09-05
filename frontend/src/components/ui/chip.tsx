import * as React from "react";
import { cn } from "@/lib/utils";

interface ChipProps {
  className?: string;
  variant?: "ok" | "warn" | "bad" | "default";
  children: React.ReactNode;
}

export function Chip({ className = "", variant = "default", children }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        variant === "ok" &&
          "bg-ok/10 text-ok border-ok/20",
        variant === "warn" &&
          "bg-warn/10 text-warn border-warn/20",
        variant === "bad" &&
          "bg-bad/10 text-bad border-bad/20",
        variant === "default" &&
          "bg-surface/50 text-ink-2 border-line/20",
        className
      )}
    >
      {children}
    </span>
  );
}