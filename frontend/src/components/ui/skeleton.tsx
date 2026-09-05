import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
  height?: number | string;
  width?: number | string;
  radius?: "sm" | "md" | "lg" | "full";
  variant?: "text" | "rect" | "circle";
  animate?: boolean;
}

export const Skeleton = ({
  className = "",
  height = 16,
  width = "100%",
  radius = "md",
  variant = "rect",
  animate = true,
}: SkeletonProps) => {
  const radiusMap: Record<"sm" | "md" | "lg" | "full", string> = {
    sm: "rounded",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  };

  const variantStyles: Record<"text" | "rect" | "circle", { height: number | string; width: number | string }> = {
    text: { height: 16, width: "100%" },
    rect: { height: 20, width: "100%" },
    circle: { height: 20, width: "20" },
  };

  const { height: variantHeight, width: variantWidth } = variantStyles[variant];

  return (
    <div
      className={cn(
        "skeleton",
        animate ? "animate-pulse" : "",
        radiusMap[radius],
        className,
        `bg-[hsl(var(--background))] bg-[length:200%_200%] bg-[animate-background-gradient:3s_linear_infinite]`
      )}
    >
      <div
        className="block"
        style={{
          height: typeof height === "number" ? `${height}px` : height,
          width: typeof width === "number" ? `${width}px` : width,
        }}
      ></div>
    </div>
  );
};