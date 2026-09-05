import * as React from "react";
import { cn } from "@/lib/utils";

interface InputProps {
  className?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  ref?: React.RefObject<HTMLInputElement | HTMLTextAreaElement>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  ariaLabel?: string;
  type?: "text" | "textarea";
}

export default function Input({
  className = "",
  value,
  onChange,
  placeholder,
  disabled = false,
  ref,
  onKeyDown,
  ariaLabel,
  type = "text",
}: InputProps) {
  const isTextarea = type === "textarea";

  return (
    <>
      {isTextarea ? (
        <textarea
          className={cn(
            "flex-1 min-h-[44px] rounded-md border border-line bg-surface/50 px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:ring-brand/20",
            className
          )}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel}
        />
      ) : (
        <input
          className={cn(
            "flex-1 min-h-[44px] rounded-md border border-line bg-surface/50 px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:ring-brand/20",
            className
          )}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          ref={ref as React.RefObject<HTMLInputElement>}
          onKeyDown={onKeyDown}
          aria-label={ariaLabel}
        />
      )}
    </>
  );
}