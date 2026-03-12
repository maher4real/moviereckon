import { Film } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZE_STYLES = {
  sm: {
    gap: "gap-2",
    mark: "",
    icon: "h-7 w-7",
    label: "text-xl",
  },
  md: {
    gap: "gap-2.5",
    mark: "",
    icon: "h-8 w-8",
    label: "text-2xl",
  },
  lg: {
    gap: "gap-3",
    mark: "",
    icon: "h-9 w-9",
    label: "text-3xl",
  },
  xl: {
    gap: "gap-2.5",
    mark: "",
    icon: "h-10 w-10",
    label: "text-4xl",
  },
} as const;

type BrandLogoProps = {
  animated?: boolean;
  className?: string;
  compact?: boolean;
  labelClassName?: string;
  markClassName?: string;
  size?: keyof typeof SIZE_STYLES;
};

export default function BrandLogo({
  animated = false,
  className,
  compact = false,
  labelClassName,
  markClassName,
  size = "md",
}: BrandLogoProps) {
  const styles = SIZE_STYLES[size];

  return (
    <div
      className={cn(
        "inline-flex select-none items-center whitespace-nowrap",
        styles.gap,
        className,
      )}
    >
      <span
        data-brand-mark="true"
        className={cn(
          "flex shrink-0 items-center justify-center text-primary",
          animated &&
            "animate-auth-brand-pulse drop-shadow-[0_0_24px_hsl(var(--primary)/0.28)]",
          styles.mark,
          markClassName,
        )}
      >
        <Film className={cn("shrink-0", styles.icon)} />
      </span>
      {!compact ? (
        <span
          data-brand-label="true"
          className={cn(
            "text-gradient font-bold",
            animated &&
              "animate-auth-brand-gradient-flow bg-[length:220%_100%] drop-shadow-[0_10px_34px_hsl(var(--primary)/0.16)]",
            styles.label,
            labelClassName,
          )}
        >
          MovieReckon
        </span>
      ) : null}
    </div>
  );
}
