import { Chip } from "@/components/ui/chip";

interface ChipRowProps {
  className?: string;
  children: React.ReactNode;
}

export default function ChipRow({ className = "", children }: ChipRowProps) {
  return (
    <div className={className}>
      {children}
    </div>
  );
}