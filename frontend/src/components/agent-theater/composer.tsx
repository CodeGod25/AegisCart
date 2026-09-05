import { useRef } from "react";
import Input from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ComposerProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  onSend: () => void;
  disabled?: boolean;
  className?: string;
}

export default function Composer({
  value,
  onChange,
  onSend,
  disabled = false,
  className = "",
}: ComposerProps) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className={className}>
      <div className="flex gap-3">
        <Input type="textarea"
          ref={inputRef as React.RefObject<HTMLInputElement | HTMLTextAreaElement>}
          value={value}
          onChange={onChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Message the merchant agent…"
          className="flex-1 min-h-[44px] rounded-md border border-line bg-surface/50 px-4 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-brand focus:ring-brand/20"
          aria-label="Message the merchant agent"
        />
        <Button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="h-[44px] px-4"
        >
          Send
        </Button>
      </div>
    </div>
  );
}