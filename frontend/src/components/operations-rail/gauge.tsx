import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface GaugeProps {
  name: string;
  num: string;
  pct: number; // 0-100
  foot: string;
  cls?: string; // e.g., "floor"
}

export default function Gauge({
  name,
  num,
  pct,
  foot,
  cls = "",
}: GaugeProps) {
  const fillRef = useRef<HTMLSpanElement>(null);

  // Animate the fill width after render
  useEffect(() => {
    if (fillRef.current) {
      fillRef.current.style.width = `${pct}%`;
    }
  }, [pct]);

  return (
    <div className={cn("gauge", cls)}>
      <div className="label flex justify-between items-baseline gap-2">
        <span className="name text-xs font-medium uppercase text-ink-3 tracking-wider">
          {name}
        </span>
        <span className="num text-sm font-mono font-semibold text-ink">
          {num}
        </span>
      </div>
      <div className="mt-2">
        <div className="track h-0.5 w-full rounded-full bg-sunken overflow-hidden">
          <span
            ref={fillRef}
            className="flex h-full items-center justify-center bg-brand transition-width duration-900 ease-in-out"
            style={{ width: "0%" }}
          ></span>
        </div>
      </div>
      <div className="mt-2 text-xs font-mono text-ink-3">
        {foot}
      </div>
    </div>
  );
}