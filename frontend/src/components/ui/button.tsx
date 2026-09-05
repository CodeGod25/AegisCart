import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps {
  className?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

export function Button({
  className = "",
  variant = "default",
  size = "default",
  children,
  onClick,
  disabled = false,
  type = "button",
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variant === "default" &&
          "bg-brand text-brand-fg hover:bg-brand/90 active:bg-brand/80",
        variant === "outline" &&
          "border-2 border-brand/20 text-brand hover:bg-brand/5 hover:text-brand",
        variant === "ghost" &&
          "text-brand hover:bg-brand/5 hover:text-brand",
        size === "default" && "h-10 py-3 px-6",
        size === "sm" && "h-9 px-4",
        size === "lg" && "h-11 px-8 text-lg",
        size === "icon" && "h-10 w-10",
        className
      )}
      onClick={onClick}
      disabled={disabled}
      type={type}
    >
      {children}
    </button>
  );
}